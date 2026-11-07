"""Search Console consent reuses the already registered Google callback URL."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal
from urllib.parse import urlencode

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
from app.services import ga4, google_login, keywords, search_console as source
from app.services.jsonutil import dumps, loads

router = APIRouter()
FLOW_COOKIE = "isramarket_search_flow"


def finish(result: str, lang: str = "he", *, clear: bool = True):
    params = urlencode({"search_result": result, "lang": lang if lang in {"he", "en", "ar", "ru"} else "he"})
    response = RedirectResponse(get_settings().web_origin.rstrip("/") + "/integrations?" + params + "#search_console", status_code=303)
    if clear:
        response.delete_cookie(FLOW_COOKIE, path="/")
    response.headers["Cache-Control"] = "no-store"
    return response


@router.get("/search-console/start")
def start(response: Response, lang: Literal["he", "en", "ar", "ru"] = "he", business: Business = Depends(get_business),
          user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not ga4.ga4_configured():
        raise HTTPException(503, "החיבור לגוגל עדיין לא זמין.")
    item = source.ensure_legacy(db, business)
    if item is None:
        item = Integration(business_id=business.id, provider=source.PROVIDER, status="pending")
        db.add(item)
        db.flush()
    nonce, attempt = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
    claims = {"sub": str(user.id), "biz": business.id, "ep": user.session_epoch, "p": source.PROVIDER,
              "lang": lang, "attempt": attempt, "nonce": hashlib.sha256(nonce.encode()).hexdigest(),
              "exp": datetime.now(timezone.utc) + timedelta(minutes=20)}
    state = jwt.encode(claims, get_settings().jwt_secret, algorithm=ALGORITHM)
    extra = loads(item.extra_json, {}) or {}
    extra["oauth_attempt"] = {"id": attempt, "consumed": False}
    item.extra_json = dumps(extra)
    db.commit()
    settings = get_settings()
    secure = settings.cookie_secure if settings.cookie_secure is not None else settings.web_origin.startswith("https://")
    response.set_cookie(FLOW_COOKIE, nonce, max_age=1200, httponly=True, secure=secure, samesite="lax", path="/")
    response.headers["Cache-Control"] = "no-store"
    # Always offer account choice: the site's owner may use a different Google login.
    return {"url": ga4.authorization_url(state, choose_account=True, scopes=source.SCOPES)}


def callback(request: Request, code: str, state: str, error: str, user: User | None, db: Session):
    lang = "he"
    try:
        claims = jwt.decode(state, get_settings().jwt_secret, algorithms=[ALGORITHM])
        lang = claims.get("lang", "he")
        nonce = request.cookies.get(FLOW_COOKIE, "")
        if claims.get("p") != source.PROVIDER or not nonce or not secrets.compare_digest(
                str(claims.get("nonce", "")), hashlib.sha256(nonce.encode()).hexdigest()):
            raise ValueError()
        business = db.get(Business, int(claims["biz"]))
        if not user or not business or business.user_id != user.id or int(claims["sub"]) != user.id or claims.get("ep") != user.session_epoch:
            raise ValueError()
        item = source.item_for(db, business.id)
        extra = loads(item.extra_json, {}) if item else {}
        if not item or extra.get("oauth_attempt") != {"id": claims["attempt"], "consumed": False}:
            raise ValueError()
        extra["oauth_attempt"]["consumed"] = True
        before = dumps(extra)
        if not source.write(db, item, item.extra_json, owner=(user.id, user.session_epoch), extra_json=before):
            raise ValueError()
        item_id, business_id, epoch = item.id, business.id, user.session_epoch
    except Exception:
        db.rollback()
        return finish("expired", lang, clear=False)
    if error or not code:
        return finish("cancelled", lang)
    try:
        tokens = ga4.exchange_code(code, required_scope=keywords.SEARCH_CONSOLE_SCOPE)
        # Unknown/omitted scopes do not establish a new source permission.
        if keywords.SEARCH_CONSOLE_SCOPE not in tokens.get("scopes", []):
            return finish("permission", lang)
        account = google_login.account_of(tokens.get("id_token"))
        db.expire_all()
        current = db.get(Integration, item_id)
        owner = db.get(User, user.id)
        business = db.get(Business, business_id)
        if not current or not owner or owner.session_epoch != epoch or owner.suspended_at or not business or business.user_id != user.id or current.extra_json != before:
            return finish("expired", lang, clear=False)
        # Same-account reauthorization preserves dated data and selection. A different
        # account must select the site again; Analytics is never touched here.
        old = loads(before, {})
        old_account = old.get("google_account") or {}
        same_account = bool(account and old_account.get("sub") == account.get("sub"))
        extra = {"scopes": tokens["scopes"], "google_account": account or {},
                 "oauth_attempt": old["oauth_attempt"]}
        if same_account:
            extra.update({k: old[k] for k in ("data", "sites", "source_readiness") if k in old})
        selected = current.external_id if same_account else ""
        encrypted = encrypt_secret(tokens["access_token"])
        if same_account and extra.get("source_readiness"):
            extra["source_readiness"]["key"] = hashlib.sha256((encrypted + "|" + selected + "|" + business.website_url).encode()).hexdigest()
            extra["source_readiness"].update(status="unchecked", note_he=source.NOTES["unchecked"])
        if not source.write(db, current, before, owner=(user.id, epoch), access_token_enc=encrypted, refresh_token_enc=encrypt_secret(tokens["refresh_token"]),
                            token_expires_at=tokens["expires_at"], external_id=selected, display_name=selected,
                            status="connected" if selected else "select_site", extra_json=dumps(extra)):
            return finish("expired", lang, clear=False)
        current = source.item_for(db, business_id)
        source.read(db, current, business)
        invalidate(business_id)
        return finish("connected", lang)
    except ga4.Ga4AccessError as exc:
        return finish("permission" if exc.reason == "search_permission_missing" else "unavailable", lang)
    except Exception:
        db.rollback()
        return finish("unavailable", lang)


def invalidate(business_id: int):
    from app.routers.promotion import cache_clear
    cache_clear(business_id)


class SiteIn(BaseModel):
    site_url: str = Field(min_length=1, max_length=500)


@router.post("/search-console/site")
def select(body: SiteIn, business: Business = Depends(get_business), db: Session = Depends(get_db)):
    item = source.ensure_legacy(db, business)
    if not item or not item.access_token_enc:
        raise HTTPException(400, "חברו קודם את נתוני החיפוש בגוגל.")
    # Never trust a URL submitted by the client, even if it was once listed.
    if not source.matching_site(body.site_url, business.website_url):
        raise HTTPException(400, "בחרו אתר שמתאים לכתובת האתר של העסק.")
    source.read(db, item, business, selected_site=body.site_url)
    invalidate(business.id)
    return response_for(db, business)


@router.post("/search-console/read")
def read(business: Business = Depends(get_business), db: Session = Depends(get_db)):
    item = source.ensure_legacy(db, business)
    if not item or not item.access_token_enc:
        raise HTTPException(400, "חברו קודם את נתוני החיפוש בגוגל.")
    source.read(db, item, business)
    invalidate(business.id)
    return response_for(db, business)


def response_for(db: Session, business: Business):
    from app.routers.integrations import _public_integration
    item = source.item_for(db, business.id)
    if not item:
        raise HTTPException(409, "החיבור השתנה. פתחו שוב את החיבורים.")
    return {"integration": _public_integration(item, business.website_url)}
