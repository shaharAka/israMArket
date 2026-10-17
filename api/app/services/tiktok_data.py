"""Customer TikTok grant/read storage; optimistic writes cannot revive a removed grant."""
from datetime import datetime, timedelta
from threading import RLock

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import Integration
from app.security import decrypt_secret, encrypt_secret
from app.services import tiktok
from app.services.jsonutil import dumps, loads

# Bounded process locks serialize token rotation. Compare-and-update also protects
# against a disconnect/reconnect in another worker; credentials never enter extra_json.
_LOCKS = [RLock() for _ in range(64)]
NOTES = {
    'choose_account': 'זה חשבון הטיקטוק של העסק?',
    'unchecked': 'נשאר לקרוא את נתוני הסרטונים.',
    'ready': 'נתוני הסרטונים עודכנו.',
    'partial': 'קראנו חלק מנתוני הסרטונים.',
    'empty': 'לא נמצאו סרטונים ציבוריים בחשבון הזה.',
    'permission': 'הגישה לסרטונים לא אושרה. חברו שוב ואשרו אותה בטיקטוק.',
    'reconnect': 'צריך לחבר שוב את הטיקטוק כדי לעדכן את הנתונים.',
    'unavailable': 'לא הצלחנו לקרוא את הסרטונים. נסו שוב.',
}


def lock(item_id: int):
    return _LOCKS[item_id % len(_LOCKS)]


def item_for(db: Session, business_id: int) -> Integration | None:
    return db.query(Integration).filter(Integration.business_id == business_id, Integration.provider == 'tiktok').first()


def public_state(item: Integration) -> dict:
    extra = loads(item.extra_json, {}) or {}
    state = extra.get('source_readiness') or {}
    status = 'choose_account' if item.status == 'select_account' else state.get('status') or 'unchecked'
    return {'status': status, 'note_he': NOTES.get(status, NOTES['unavailable']),
            'checked_at': state.get('checked_at'), 'last_success_at': state.get('last_success_at')}


def public_data(item: Integration) -> dict:
    extra = loads(item.extra_json, {}) or {}
    snap = extra.get('video_snapshot') or {}
    # Account selection, not mere consent, is necessary to display another account's data.
    if item.status != 'connected' or not item.external_id or snap.get('open_id') != item.external_id:
        snap = {}
    return {'source_readiness': public_state(item),
            'profile': {'display_name': item.display_name},
            'videos': snap.get('videos') or [], 'checked_at': snap.get('checked_at'),
            'complete': snap.get('complete', False), 'measurement': 'cumulative_public_video_counts'}


def compare_write(db: Session, item: Integration, before: str, **values) -> bool:
    result = db.execute(update(Integration).where(Integration.id == item.id,
        Integration.business_id == item.business_id, Integration.provider == 'tiktok',
        Integration.extra_json == before, Integration.access_token_enc == item.access_token_enc,
        Integration.status == item.status).values(**values), execution_options={'synchronize_session': False})
    db.commit()
    db.expire_all()
    return result.rowcount == 1


def read(db: Session, item: Integration, *, now: datetime | None = None) -> bool:
    now = now or datetime.utcnow()
    item_id, business_id = item.id, item.business_id
    with lock(item_id):
        db.expire_all()
        item = item_for(db, business_id)
        if not item or item.id != item_id or item.status != 'connected' or not item.access_token_enc:
            return False
        before = item.extra_json
        extra = loads(before, {}) or {}
        if extra.get('source_readiness', {}).get('status') in {'ready', 'partial', 'empty'}:
            checked = extra['source_readiness'].get('checked_at')
            try:
                if checked and timedelta(0) <= now - datetime.fromisoformat(checked) < timedelta(minutes=5):
                    return True
            except (ValueError, TypeError):
                pass
        try:
            token = decrypt_secret(item.access_token_enc)
            if not item.token_expires_at or item.token_expires_at <= now + timedelta(minutes=3):
                expiry = extra.get('refresh_expires_at')
                if not expiry or datetime.fromisoformat(expiry) <= now:
                    raise tiktok.TikTokError('reconnect')
                tokens = tiktok.refresh_token(decrypt_secret(item.refresh_token_enc))
                if tokens['open_id'] != item.external_id:
                    raise tiktok.TikTokError('reconnect')
                extra.update({'scopes': tokens['scopes'], 'refresh_expires_at': tokens['refresh_expires_at']})
                if not compare_write(db, item, before, access_token_enc=encrypt_secret(tokens['access_token']),
                    refresh_token_enc=encrypt_secret(tokens['refresh_token']), token_expires_at=tokens['expires_at'],
                    extra_json=dumps(extra), updated_at=now):
                    return False
                item = item_for(db, business_id)
                if not item:
                    return False
                before = item.extra_json
                token = tokens['access_token']
            if not set(tiktok.SCOPES).issubset(extra.get('scopes') or []):
                raise tiktok.TikTokError('permission')
            # Verify the returned subject before attaching any metrics to this business.
            tiktok.profile(token, item.external_id)
            snap = tiktok.videos(token, now=now)
            snap['open_id'] = item.external_id
            extra['video_snapshot'] = snap
            status = 'empty' if not snap['videos'] and snap['complete'] else 'partial' if not snap['complete'] or any(
                any(row.get(key) is None for key in ('view_count','like_count','comment_count','share_count')) for row in snap['videos']) else 'ready'
            extra['source_readiness'] = {'status': status, 'checked_at': snap['checked_at'], 'last_success_at': snap['checked_at']}
        except (tiktok.TikTokError, ValueError, TypeError) as exc:
            status = exc.status if isinstance(exc, tiktok.TikTokError) else 'reconnect'
            extra['source_readiness'] = {'status': status, 'checked_at': now.replace(microsecond=0).isoformat(),
                                        'last_success_at': (extra.get('video_snapshot') or {}).get('checked_at')}
        return compare_write(db, item, before, extra_json=dumps(extra), updated_at=now)


def disconnect(db: Session, item: Integration) -> bool:
    with lock(item.id):
        token = item.access_token_enc
        # Delete first: failures to revoke remotely cannot keep local reads alive.
        db.delete(item); db.commit()
        try:
            if token:
                tiktok.revoke(decrypt_secret(token))
            return True
        except (tiktok.TikTokError, ValueError):
            return False
