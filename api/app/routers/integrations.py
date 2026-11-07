import secrets
import logging
import hashlib
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from jose import jwt
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_business, get_current_user
from app.models import Business, Integration, User, WebhookEndpoint
from app.schemas import Ga4PropertyIn, MetaAccountIn, WebhookIn
from app.security import (
    ALGORITHM,
    decode_oauth_state,
    decrypt_secret,
    encrypt_secret,
)
from app.services import ga4, ga4_readiness, google_login, meta, meta_readiness, tiktok, tiktok_data, search_console
from app.services.jsonutil import dumps, loads
from app.services.netguard import UnsafeUrlError, assert_public_url
from app.routers import meta_connections, tiktok_connections, search_console_connections

router = APIRouter(prefix="/integrations", tags=["integrations"])
logger = logging.getLogger(__name__)
GA4_FLOW_COOKIE = "isramarket_ga4_flow"


def _public_integration(item: Integration, website: str = "") -> dict:
    extra = loads(item.extra_json, {})
    return {
        "provider": item.provider,
        "status": item.status,
        "external_id": item.external_id,
        "display_name": item.display_name,
        "connected": item.status == "connected" and bool(item.access_token_enc) and (item.provider not in {"ga4", "tiktok", "search_console"} or bool(item.external_id)),
        "source_readiness": search_console.public_state(item, website) if item.provider == "search_console" else ga4_readiness.public_state(item) if item.provider == "ga4" else meta_readiness.public_state(item) if item.provider == "meta" else tiktok_data.public_state(item) if item.provider == "tiktok" else None,
        "sites": extra.get("sites") if item.provider == "search_console" else None,
        "search_data": search_console.public_data(item, website) if item.provider == "search_console" else None,
        "tiktok_data": tiktok_data.public_data(item) if item.provider == "tiktok" else None,
        "connection_attempt": extra.get("connection_attempt") if item.provider == "tiktok" else None,
        "properties": extra.get("properties"),
        "pages": extra.get("pages"),
        # Actual source-specific scopes, including copied legacy combined grants.
        "scopes": extra.get("scopes") or [],
        "ad_account_id": extra.get("selected_ad_account_id") or "",
        "pixel_id": extra.get("selected_pixel_id") or "",
        "pixel_verification": extra.get("pixel_verification") if not extra.get("pixel_verification_key") or extra["pixel_verification_key"] == meta_readiness.key(item) else None,
        # Which Google account granted it (Google only), and a Hebrew note when that is not
        # the account the owner signs in with. Allowed, just said out loud.
        "account_email": (extra.get("google_account") or {}).get("email") or None,
        "account_mismatch": bool(extra.get("account_mismatch")),
        "account_note_he": extra.get("account_note_he") or None,
    }


def _invalidate_promotion_cache(business_id: int) -> None:
    """Drop the cached keyword payload when the Google grant changes.

    Imported inside the function on purpose: `promotion` imports `tokens_for` from this
    module, so a top-level import here would be circular.
    """
    from app.routers import promotion

    promotion.cache_clear(business_id)


def _upsert(db: Session, business_id: int, provider: str) -> Integration:
    item = (
        db.query(Integration)
        .filter(Integration.business_id == business_id, Integration.provider == provider)
        .first()
    )
    if item:
        return item
    item = Integration(business_id=business_id, provider=provider)
    db.add(item)
    db.flush()
    return item


@router.get("")
def list_integrations(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    search_console.ensure_legacy(db, business)
    return {
        "ga4_ready": ga4.ga4_configured(),
        "meta_ready": meta.meta_configured(),
        "tiktok_ready": tiktok.configured_for(business.owner.email),
        "integrations": [_public_integration(item, business.website_url) for item in db.query(Integration).filter_by(business_id=business.id).all()],
        "webhooks": [
            {"id": hook.id, "url": hook.url, "events": hook.events, "created_at": hook.created_at.isoformat()}
            for hook in business.webhooks
        ],
    }


@router.get("/ga4/start")
def ga4_start(response: Response, choose_account: bool = False, lang: Literal["he", "en", "ar", "ru"] = "he", business: Business = Depends(get_business), user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    nonce, attempt = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
    state = jwt.encode({"sub": str(user.id), "biz": business.id, "p": "ga4", "ep": user.session_epoch,
                        "lang": lang, "attempt": attempt, "nonce": hashlib.sha256(nonce.encode()).hexdigest(),
                        "exp": datetime.now(timezone.utc) + timedelta(minutes=20)}, get_settings().jwt_secret, algorithm=ALGORITHM)
    try:
        # The account the owner signed in with: its Google id when linked, else the email.
        url = ga4.authorization_url(
            state,
            login_hint=user.google_sub or user.email,
            choose_account=choose_account,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    search_console.ensure_legacy(db, business)
    item = _upsert(db, business.id, "ga4")
    extra = loads(item.extra_json, {}) or {}
    extra["oauth_attempt"] = {"id": attempt, "consumed": False}
    item.extra_json = dumps(extra)
    db.commit()
    settings = get_settings()
    secure = settings.cookie_secure if settings.cookie_secure is not None else settings.web_origin.startswith("https://")
    response.set_cookie(GA4_FLOW_COOKIE, nonce, max_age=1200, httponly=True, secure=secure, samesite="lax", path="/")
    response.headers["Cache-Control"] = "no-store"
    return {"url": url}


@router.get("/ga4/callback")
def ga4_callback(request: Request, code: str = "", state: str = "", error: str = "", db: Session = Depends(get_db)):
    settings = get_settings()
    dest = f"{settings.web_origin}/integrations"
    flow_lang = "he"
    try:
        claims = decode_oauth_state(state)
        if claims["provider"] == search_console.PROVIDER:
            try:
                user = get_current_user(request, db)
            except HTTPException:
                user = None
            return search_console_connections.callback(request, code, state, error, user, db)
    except Exception:
        # A malformed/expired Search Console return still belongs on its own card.
        # Unverified claims choose only this fixed error destination, never data access.
        try:
            if jwt.get_unverified_claims(state).get("p") == search_console.PROVIDER:
                return search_console_connections.finish("expired", clear=False)
        except Exception:
            pass
    def finish(params, clear=True):
        if flow_lang in {"en", "ar", "ru"}:
            params = {**params, "lang": flow_lang}
        response = RedirectResponse(f"{dest}?{urlencode(params)}#ga4", status_code=303)
        if clear:
            response.delete_cookie(GA4_FLOW_COOKIE, path="/")
        response.headers["Cache-Control"] = "no-store"
        return response
    stage = "state"
    try:
        claims = decode_oauth_state(state)
        if claims["provider"] != "ga4":
            raise ValueError()
        bound = jwt.decode(state, settings.jwt_secret, algorithms=[ALGORITHM])
        flow_lang = bound.get("lang", "he")
        nonce = request.cookies.get(GA4_FLOW_COOKIE, "")
        user = get_current_user(request, db)
        business = db.get(Business, claims["business_id"])
        if not nonce or not secrets.compare_digest(str(bound.get("nonce") or ""), hashlib.sha256(nonce.encode()).hexdigest()) or not business or business.user_id != user.id or claims["user_id"] != user.id or bound.get("ep") != user.session_epoch:
            raise ValueError()
        item = db.query(Integration).filter_by(business_id=business.id, provider="ga4").first()
        extra = loads(item.extra_json, {}) if item else {}
        if not item or extra.get("oauth_attempt") != {"id": bound["attempt"], "consumed": False}:
            raise ValueError()
        extra["oauth_attempt"]["consumed"] = True
        before = dumps(extra)
        if not search_console.write(db, item, item.extra_json, owner=(user.id, user.session_epoch), extra_json=before):
            raise ValueError()
        item_id, epoch = item.id, user.session_epoch
        if error or not code:
            return finish({"error": "האישור לגוגל לא הושלם. התוכנית נשמרה; אפשר לחבר שוב כשנוח לכם."})
        stage = "token_exchange"
        tokens = ga4.exchange_code(code)
        stage = "property_discovery"
        properties = ga4.list_properties(tokens["access_token"], tokens["refresh_token"], tokens["expires_at"])
        db.expire_all()
        item = db.get(Integration, item_id)
        owner = db.get(User, claims["user_id"])
        business = db.get(Business, claims["business_id"])
        if not item or not owner or owner.session_epoch != epoch or owner.suspended_at or not business or business.user_id != owner.id or item.extra_json != before:
            return finish({"error": "החיבור הזה כבר לא בתוקף. התחילו שוב את החיבור לגוגל."}, clear=False)
        extra = {"properties": properties, "scopes": tokens.get("scopes") or [], "oauth_attempt": extra["oauth_attempt"]}
        mismatch = _note_google_account(db, claims["user_id"], tokens.get("id_token"), extra)
        if not search_console.write(db, item, before, owner=(claims["user_id"], epoch), access_token_enc=encrypt_secret(tokens["access_token"]),
                                    refresh_token_enc=encrypt_secret(tokens["refresh_token"]), token_expires_at=tokens["expires_at"],
                                    status="select_property", external_id="", display_name="", extra_json=dumps(extra), updated_at=datetime.utcnow()):
            return finish({"error": "החיבור הזה כבר לא בתוקף. התחילו שוב את החיבור לגוגל."}, clear=False)
        _invalidate_promotion_cache(claims["business_id"])
    except Exception as exc:
        db.rollback()
        # Closed diagnostic fields only: never exception text, URLs, codes or tokens.
        logger.warning("google_connection_failed stage=%s exception_type=%s analytics_permission_missing=%s",
                       stage, type(exc).__name__, isinstance(exc, ga4.Ga4AccessError) and exc.reason == "analytics_permission_missing")
        return finish({"error": ga4_readiness.failure(exc)["note_he"]}, clear=stage != "state")
    return finish({"ga4": "connected", **({"ga4_account": "other"} if mismatch else {})})


def _note_google_account(db: Session, user_id: int, id_token: str | None, extra: dict) -> bool:
    """Record which Google account granted Analytics, and whether it differs from the one
    the owner signs in with ("להמשיך עם Google", `User.google_sub`). A different account
    is allowed (the site's data may well live on a work account), but the owner is told
    which one is connected. Returns True on a mismatch."""
    account = google_login.account_of(id_token)
    if not account:
        return False
    extra["google_account"] = {"email": account["email"], "sub": account["sub"]}
    user = db.get(User, user_id)
    mismatch = bool(user and user.google_sub and account["sub"] != user.google_sub)
    extra["account_mismatch"] = mismatch
    if mismatch:
        extra["account_note_he"] = (
            f"נתוני האתר חוברו מחשבון גוגל אחר: {account['email']}. "
            f"אתם נכנסים עם {user.email}. זה בסדר, אם נתוני האתר נמצאים בחשבון הזה."
        )
    return mismatch


@router.post("/ga4/property")
def ga4_property(
    body: Ga4PropertyIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    item = (
        db.query(Integration)
        .filter(Integration.business_id == business.id, Integration.provider == "ga4")
        .first()
    )
    if not item or not item.access_token_enc:
        raise HTTPException(status_code=400, detail="חברו קודם את נתוני האתר (גוגל אנליטיקס)")
    before, item_id = item.extra_json, item.id
    try:
        properties = ga4.list_properties(*tokens_for(item))
    except Exception as exc:
        state = ga4_readiness.record(db, item, ga4_readiness.failure(exc)["status"])
        raise HTTPException(status_code=502, detail=state["note_he"]) from exc
    prop = next((prop for prop in properties if prop["property_id"] == body.property_id), None)
    if not prop:
        raise HTTPException(status_code=400, detail="האתר שנבחר אינו זמין בחשבון הזה. חברו חשבון עם גישה לאתר ובחרו אותו מהרשימה.")
    extra = loads(before, {})
    extra["properties"] = properties
    extra["selected_property_id"] = body.property_id
    if not search_console.write(db, item, before, external_id=body.property_id,
                                display_name=f"{prop['display_name']} ({prop['account']})"[:160],
                                extra_json=dumps(extra), status="connected", updated_at=datetime.utcnow()):
        raise HTTPException(409, "החיבור השתנה. פתחו שוב את החיבורים.")
    item = db.get(Integration, item_id)
    ga4_readiness.initial_read(db, item)
    current = db.get(Integration, item_id)
    if not current:
        raise HTTPException(409, "החיבור השתנה. פתחו שוב את החיבורים.")
    return {"integration": _public_integration(current)}


@router.post("/ga4/read")
def ga4_read(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    item = db.query(Integration).filter(
        Integration.business_id == business.id, Integration.provider == "ga4",
    ).first()
    if not item or not item.access_token_enc or not item.external_id:
        raise HTTPException(status_code=400, detail="בחרו קודם את האתר בעמוד החיבורים.")
    item_id = item.id
    ga4_readiness.initial_read(db, item)
    current = db.get(Integration, item_id)
    if not current:
        raise HTTPException(409, "החיבור השתנה. פתחו שוב את החיבורים.")
    return {"integration": _public_integration(current)}


router.include_router(meta_connections.router)
router.include_router(tiktok_connections.router)
router.include_router(search_console_connections.router)


@router.post("/meta/account")
def meta_account(
    body: MetaAccountIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    meta_connections.save_assets(body, business, db)
    item = meta_connections.integration(business, db)
    return {"integration": _public_integration(item)}


@router.post("/meta/read")
def meta_read(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    item = meta_connections.integration(business, db)
    if not item.external_id or item.status in {"select_page", "select_assets"}:
        raise HTTPException(400, "בחרו קודם את הדף או את חשבון הפרסום של העסק.")
    if meta_readiness.initial_read(db, item, business.website_url) is None:
        raise HTTPException(409, "החיבור השתנה בזמן הקריאה. בדקו את הבחירה ונסו שוב.")
    return {"integration": _public_integration(item)}


@router.post("/webhooks")
def create_webhook(
    body: WebhookIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    try:
        assert_public_url(str(body.url))
    except UnsafeUrlError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    hook = WebhookEndpoint(
        business_id=business.id,
        url=str(body.url),
        secret=secrets.token_urlsafe(24),
        events=body.events,
    )
    db.add(hook)
    db.commit()
    db.refresh(hook)
    return {
        "id": hook.id,
        "url": hook.url,
        "events": hook.events,
        "secret": hook.secret,
        "created_at": hook.created_at.isoformat(),
    }


@router.delete("/{provider}")
def delete_integration(
    provider: str,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    if provider not in ("ga4", "meta", "tiktok", "search_console"):
        raise HTTPException(status_code=400, detail="אין חיבור כזה")
    if provider == "ga4":
        # Preserve a legacy combined grant as its own source before removing Analytics.
        search_console.ensure_legacy(db, business)
    item = (
        db.query(Integration)
        .filter(Integration.business_id == business.id, Integration.provider == provider)
        .first()
    )
    if item:
        if provider == "search_console":
            search_console.disconnect(db, item)
            _invalidate_promotion_cache(business.id)
            return {"ok": True}
        if provider == "tiktok":
            return {"ok": True, "remote_revoked": tiktok_data.disconnect(db, item)}
        db.delete(item)
        db.commit()
    if provider == "ga4":
        # Search Console data lives on the Google grant that was just revoked.
        _invalidate_promotion_cache(business.id)
    return {"ok": True}


@router.delete("/webhooks/{hook_id}")
def delete_webhook(
    hook_id: int,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    hook = db.get(WebhookEndpoint, hook_id)
    if not hook or hook.business_id != business.id:
        raise HTTPException(status_code=404, detail="הוובהוק לא נמצא")
    db.delete(hook)
    db.commit()
    return {"ok": True}


def tokens_for(item: Integration) -> tuple[str, str, datetime | None]:
    return decrypt_secret(item.access_token_enc), decrypt_secret(item.refresh_token_enc), item.token_expires_at


def encrypt_legacy_page_tokens(db: Session) -> int:
    """Rewrite any page token still stored in plain text (written before page tokens were
    encrypted) with the Fernet key. Idempotent; returns how many tokens it encrypted."""
    changed = 0
    for item in db.query(Integration).filter(Integration.provider == "meta").all():
        extra = loads(item.extra_json, {}) or {}
        tokens = extra.get("page_tokens") or {}
        if not isinstance(tokens, dict):
            continue
        rewritten: dict[str, str] = {}
        for page_id, value in tokens.items():
            value = str(value or "")
            try:
                decrypt_secret(value)
                rewritten[page_id] = value
            except ValueError:
                rewritten[page_id] = encrypt_secret(value)
                changed += 1
        if rewritten != tokens:
            extra["page_tokens"] = rewritten
            item.extra_json = dumps(extra)
    if changed:
        db.commit()
    return changed
