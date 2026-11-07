"""Browser-bound TikTok consent and customer-only read access."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from jose import jwt
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_business, get_current_user
from app.models import Business, Integration, User
from app.security import ALGORITHM, encrypt_secret
from app.services import tiktok, tiktok_data
from app.services.jsonutil import dumps, loads

router = APIRouter()
FLOW_COOKIE = 'isramarket_tiktok_flow'


def available(user: User):
    if not tiktok.configured_for(user.email):
        raise HTTPException(503, 'החיבור לטיקטוק עדיין לא זמין.')


def finish(result: str, lang: str = 'he', *, clear_cookie: bool = True):
    response = RedirectResponse(get_settings().web_origin.rstrip('/') + '/integrations?' +
                                urlencode({'tiktok_result': result, 'lang': lang if lang in {'he','en','ar','ru'} else 'he'}) + '#tiktok', status_code=303)
    if clear_cookie:
        response.delete_cookie(FLOW_COOKIE, path='/')
    response.headers['Cache-Control'] = 'no-store'
    return response


@router.get('/tiktok/start')
def start(response: Response, lang: Literal['he','en','ar','ru'] = 'he', business: Business = Depends(get_business),
          user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    available(user)
    nonce, attempt = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
    state = jwt.encode({'sub': str(user.id), 'biz': business.id, 'ep': user.session_epoch, 'lang': lang,
                       'p': 'tiktok', 'attempt': attempt, 'nonce': hashlib.sha256(nonce.encode()).hexdigest(),
                       'exp': datetime.now(timezone.utc) + timedelta(minutes=20)},
                      get_settings().jwt_secret, algorithm=ALGORITHM)
    item = tiktok_data.item_for(db, business.id)
    if item is None:
        item = Integration(business_id=business.id, provider='tiktok', status='pending')
        db.add(item); db.flush()
    extra = loads(item.extra_json, {}) or {}
    extra['oauth_attempt'] = {'id': attempt, 'consumed': False}
    item.extra_json = dumps(extra)
    db.commit()
    settings = get_settings()
    secure = settings.cookie_secure if settings.cookie_secure is not None else settings.web_origin.startswith('https://')
    response.set_cookie(FLOW_COOKIE, nonce, max_age=1200, httponly=True, secure=secure, samesite='lax', path='/')
    response.headers['Cache-Control'] = 'no-store'
    return {'url': tiktok.authorization_url(state)}


@router.get('/tiktok/callback')
def callback(request: Request, code: str = '', state: str = '', error: str = '',
             user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lang = 'he'
    try:
        available(user)
        claims = jwt.decode(state, get_settings().jwt_secret, algorithms=[ALGORITHM])
        lang = claims.get('lang') or 'he'
        nonce = request.cookies.get(FLOW_COOKIE, '')
        if claims.get('p') != 'tiktok' or not nonce or not secrets.compare_digest(
            str(claims.get('nonce') or ''), hashlib.sha256(nonce.encode()).hexdigest()):
            raise ValueError()
        business = db.get(Business, int(claims['biz']))
        if not business or business.user_id != user.id or int(claims['sub']) != user.id or claims.get('ep') != user.session_epoch:
            raise ValueError()
        item = tiktok_data.item_for(db, business.id)
        extra = loads(item.extra_json, {}) if item else {}
        if not item or extra.get('oauth_attempt') != {'id': claims['attempt'], 'consumed': False}:
            raise ValueError()
        item_id = item.id
        before = item.extra_json
        extra['oauth_attempt']['consumed'] = True
        if not tiktok_data.compare_write(db, item, before, extra_json=dumps(extra)):
            raise ValueError()
    except Exception:
        db.rollback()
        # An old tab's return must not clear the newer tab's valid binding cookie.
        return finish('expired', lang, clear_cookie=False)
    if error or not code:
        return finish('cancelled', lang)
    try:
        tokens = tiktok.exchange_code(code)
        profile = tiktok.profile(tokens['access_token'], tokens['open_id'])
        # A later connect/disconnect, account deletion or sign-out supersedes this return.
        db.expire_all()
        item = tiktok_data.item_for(db, business.id)
        extra = loads(item.extra_json, {}) if item else {}
        current_user = db.get(User, user.id)
        if not item or item.id != item_id or not current_user or current_user.suspended_at is not None or current_user.session_epoch != claims['ep'] or extra.get('oauth_attempt') != {'id': claims['attempt'], 'consumed': True}:
            raise ValueError()
        # No old account's snapshot survives an account change. Owner confirmation follows.
        new_extra = {'scopes': tokens['scopes'], 'refresh_expires_at': tokens['refresh_expires_at'],
                     'connection_attempt': claims['attempt']}
        if not tiktok_data.compare_write(db, item, item.extra_json,
            access_token_enc=encrypt_secret(tokens['access_token']), refresh_token_enc=encrypt_secret(tokens['refresh_token']),
            token_expires_at=tokens['expires_at'], external_id=tokens['open_id'],
            display_name=profile['display_name'], status='select_account', extra_json=dumps(new_extra), updated_at=datetime.utcnow()):
            raise ValueError()
    except tiktok.TikTokError as exc:
        db.rollback()
        return finish('permission' if exc.status == 'permission' else 'failed', lang)
    except Exception:
        db.rollback()
        return finish('failed', lang)
    return finish('success', lang)


class AccountIn(BaseModel):
    # A stale screen cannot confirm a different, more recent grant.
    connection_attempt: str = Field(min_length=1, max_length=100)


@router.post('/tiktok/account')
def confirm(body: AccountIn, business: Business = Depends(get_business),
            user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    available(user)
    item = tiktok_data.item_for(db, business.id)
    if not item or not item.access_token_enc or item.status != 'select_account':
        raise HTTPException(400, 'חברו קודם את הטיקטוק של העסק.')
    extra = loads(item.extra_json, {}) or {}
    if extra.get('connection_attempt') != body.connection_attempt:
        raise HTTPException(409, 'החשבון השתנה. בדקו את החשבון שמוצג ונסו שוב.')
    extra['source_readiness'] = {'status': 'unchecked'}
    if not tiktok_data.compare_write(db, item, item.extra_json, status='connected', extra_json=dumps(extra)):
        raise HTTPException(409, 'החשבון השתנה. בדקו את החשבון שמוצג ונסו שוב.')
    item = tiktok_data.item_for(db, business.id)
    if not item or not tiktok_data.read(db, item):
        raise HTTPException(409, 'החיבור השתנה. בדקו את החשבון ונסו שוב.')
    return {'ok': True}


@router.post('/tiktok/read')
def read(business: Business = Depends(get_business), user: User = Depends(get_current_user),
         db: Session = Depends(get_db)):
    available(user)
    item = tiktok_data.item_for(db, business.id)
    if not item or item.status != 'connected' or not item.access_token_enc:
        raise HTTPException(400, 'בחרו קודם את חשבון הטיקטוק של העסק.')
    if not tiktok_data.read(db, item):
        raise HTTPException(409, 'החיבור השתנה. בדקו את החשבון ונסו שוב.')
    item = tiktok_data.item_for(db, business.id)
    return {'data': tiktok_data.public_data(item)}
