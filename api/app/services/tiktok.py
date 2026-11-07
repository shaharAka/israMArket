"""TikTok Login Kit + Display API. Fixed hosts, minimal scopes, no publishing.

Video counts are cumulative at the read time, not period reach, leads or purchases.
Contract: developers.tiktok.com/docs/en/{login-kit-web,oauth-user-access-token-management,
tiktok-api-v2-video-list,tiktok-api-v2-video-object} (checked 12 Oct 2026).
"""
from datetime import datetime, timedelta
import time
from urllib.parse import urlencode, urlparse, urlunsplit

import httpx

from app.config import get_settings

SCOPES = ('user.info.basic', 'video.list')
BASE = 'https://open.tiktokapis.com/v2'
VIDEO_FIELDS = 'id,create_time,title,video_description,duration,share_url,view_count,like_count,comment_count,share_count'
MAX_PAGES = 3
READ_SECONDS = 30


class TikTokError(RuntimeError):
    def __init__(self, status='unavailable'):
        self.status = status
        # Provider bodies can contain credentials. Only a fixed code crosses layers.
        super().__init__(status)


def configured_for(email: str) -> bool:
    s = get_settings()
    if not s.tiktok_client_key or not s.tiktok_client_secret or s.tiktok_access_mode == 'off':
        return False
    return s.tiktok_access_mode == 'public' or email.strip().casefold() in {
        x.strip().casefold() for x in s.tiktok_sandbox_emails.split(',') if x.strip()
    }


def redirect_uri() -> str:
    return get_settings().oauth_callback_base() + '/integrations/tiktok/callback'


def authorization_url(state: str) -> str:
    return 'https://www.tiktok.com/v2/auth/authorize/?' + urlencode({
        'client_key': get_settings().tiktok_client_key, 'scope': ','.join(SCOPES),
        'response_type': 'code', 'redirect_uri': redirect_uri(), 'state': state,
        'disable_auto_auth': 1,
    })


def _request(path: str, *, token='', form=None, params=None, payload=None, timeout=12) -> dict:
    try:
        with httpx.Client(timeout=max(.1, min(timeout, 12)), follow_redirects=False,
                          transport=httpx.HTTPTransport(retries=0)) as client:
            response = client.request('POST' if form is not None or payload is not None else 'GET',
                BASE + path, headers={'Authorization': 'Bearer ' + token} if token else {},
                data=form, params=params, json=payload)
        body = response.json() if response.content else {}
        error = body.get('error') if isinstance(body, dict) else None
        code = error.get('code') if isinstance(error, dict) else error
        if response.is_error or response.is_redirect or code not in (None, '', 'ok'):
            status = ('reconnect' if response.status_code == 401 or code in
                      {'access_token_invalid', 'invalid_grant', 'invalid_token', 'invalid_refresh_token'} else
                      'permission' if response.status_code == 403 or code in
                      {'scope_not_authorized', 'scope_permission_missed'} else 'unavailable')
            raise TikTokError(status)
        if not isinstance(body, dict):
            raise TikTokError()
        return body
    except (httpx.RequestError, ValueError, TypeError):
        raise TikTokError() from None


def _token(form: dict, now: datetime | None = None) -> dict:
    s = get_settings()
    body = _request('/oauth/token/', form={'client_key': s.tiktok_client_key,
                    'client_secret': s.tiktok_client_secret, **form})
    now = now or datetime.utcnow()
    try:
        access, refresh, subject = body['access_token'], body['refresh_token'], body['open_id']
        expires, refresh_expires = int(body['expires_in']), int(body['refresh_expires_in'])
        if not all(isinstance(v, str) and v and len(v) < 4096 for v in (access, refresh, subject)) or expires <= 0 or refresh_expires <= 0:
            raise ValueError()
        scopes = body['scope'].split(',')
        if not set(SCOPES).issubset(scopes):
            raise TikTokError('permission')
        return {'access_token': access, 'refresh_token': refresh, 'open_id': subject,
                'scopes': scopes, 'expires_at': now + timedelta(seconds=min(expires, 86400)),
                'refresh_expires_at': (now + timedelta(seconds=min(refresh_expires, 31536000))).isoformat()}
    except (KeyError, ValueError, TypeError, AttributeError, OverflowError):
        raise TikTokError() from None


def exchange_code(code: str) -> dict:
    return _token({'grant_type': 'authorization_code', 'code': code, 'redirect_uri': redirect_uri()})


def refresh_token(refresh: str) -> dict:
    return _token({'grant_type': 'refresh_token', 'refresh_token': refresh})


def revoke(token: str) -> None:
    s = get_settings()
    _request('/oauth/revoke/', form={'client_key': s.tiktok_client_key,
             'client_secret': s.tiktok_client_secret, 'token': token})


def profile(token: str, subject: str) -> dict:
    body = _request('/user/info/', token=token, params={'fields': 'open_id,display_name'})
    data = body.get('data')
    user = data.get('user') if isinstance(data, dict) else None
    if not isinstance(user, dict):
        raise TikTokError()
    if user.get('open_id') != subject or not isinstance(user.get('display_name'), str) or not user['display_name'].strip():
        raise TikTokError('reconnect')
    return {'open_id': subject, 'display_name': user['display_name'].strip()[:255]}


def _count(value):
    # A missing metric is unknown; a measured zero stays zero. Do not coerce floats/bools.
    return value if isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 2**63 - 1 else None


def _video(row: dict) -> dict | None:
    if not isinstance(row, dict) or not isinstance(row.get('id'), str) or not row['id'].isdigit():
        return None
    created = _count(row.get('create_time'))
    if not created:
        return None
    try:
        posted = datetime.utcfromtimestamp(created).isoformat()
    except (ValueError, OverflowError, OSError):
        return None
    url = row.get('share_url') or ''
    parsed = urlparse(url) if isinstance(url, str) else urlparse('')
    if parsed.scheme != 'https' or parsed.hostname not in {'www.tiktok.com', 'tiktok.com', 'm.tiktok.com'} or parsed.username or parsed.password or parsed.netloc != parsed.hostname or parsed.path.rstrip('/').split('/')[-1] != row['id']:
        url = ''
    else:
        url = urlunsplit(('https', parsed.hostname, parsed.path.rstrip('/'), '', ''))
    return {'id': row['id'], 'posted_at': posted,
            'title': str(row.get('title') or row.get('video_description') or '')[:150],
            'description': str(row.get('video_description') or '')[:300],
            'url': url, 'duration': _count(row.get('duration')),
            **{name: _count(row.get(name)) for name in ('view_count','like_count','comment_count','share_count')}}


def videos(token: str, *, now: datetime | None = None) -> dict:
    now = now or datetime.utcnow()
    deadline = time.monotonic() + READ_SECONDS
    rows, seen, cursors = [], set(), set()
    cursor, complete, valid = None, False, True
    for _ in range(MAX_PAGES):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        body = _request('/video/list/', token=token, params={'fields': VIDEO_FIELDS},
            payload={'max_count': 20, **({'cursor': cursor} if cursor is not None else {})}, timeout=remaining)
        data = body.get('data')
        if not isinstance(data, dict) or not isinstance(data.get('videos'), list) or not isinstance(data.get('has_more'), bool):
            raise TikTokError()
        for raw in data['videos'][:20]:
            row = _video(raw)
            if not row or row['posted_at'] > now.isoformat():
                valid = False
            if row and row['id'] not in seen and row['posted_at'] <= now.isoformat():
                seen.add(row['id']); rows.append(row)
        if not data['has_more']:
            complete = True
            break
        cursor = data.get('cursor')
        if not isinstance(cursor, int) or isinstance(cursor, bool) or cursor in cursors:
            break
        cursors.add(cursor)
    return {'videos': sorted(rows, key=lambda r: r['posted_at'], reverse=True),
            'checked_at': now.replace(microsecond=0).isoformat(), 'complete': complete and valid,
            'measurement': 'cumulative_public_video_counts', 'max_videos': 60}
