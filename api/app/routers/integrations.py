import secrets
from datetime import datetime
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_business, get_current_user
from app.models import Business, Integration, User, WebhookEndpoint
from app.schemas import Ga4PropertyIn, MetaAccountIn, WebhookIn
from app.security import (
    create_oauth_state,
    decode_oauth_state,
    decrypt_secret,
    encrypt_secret,
)
from app.services import ga4, ga4_readiness, google_login, meta
from app.services.jsonutil import dumps, loads
from app.services.netguard import UnsafeUrlError, assert_public_url
from app.routers import meta_connections

router = APIRouter(prefix="/integrations", tags=["integrations"])


def _public_integration(item: Integration) -> dict:
    extra = loads(item.extra_json, {})
    return {
        "provider": item.provider,
        "status": item.status,
        "external_id": item.external_id,
        "display_name": item.display_name,
        "connected": item.status == "connected" and bool(item.access_token_enc) and (item.provider != "ga4" or bool(item.external_id)),
        "source_readiness": ga4_readiness.public_state(item) if item.provider == "ga4" else None,
        "properties": extra.get("properties"),
        "pages": extra.get("pages"),
        # What Google actually granted on this connection. Search Console lives on the
        # same grant, so the UI can tell the owner to reconnect rather than showing an
        # empty panel with no explanation.
        "scopes": extra.get("scopes") or [],
        "ad_account_id": extra.get("selected_ad_account_id") or "",
        "pixel_id": extra.get("selected_pixel_id") or "",
        "pixel_verification": extra.get("pixel_verification"),
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
def list_integrations(business: Business = Depends(get_business)) -> dict:
    return {
        "ga4_ready": ga4.ga4_configured(),
        "meta_ready": meta.meta_configured(),
        "integrations": [_public_integration(item) for item in business.integrations],
        "webhooks": [
            {"id": hook.id, "url": hook.url, "events": hook.events, "created_at": hook.created_at.isoformat()}
            for hook in business.webhooks
        ],
    }


@router.get("/ga4/start")
def ga4_start(business: Business = Depends(get_business), user: User = Depends(get_current_user)) -> dict:
    try:
        # The account the owner signed in with: its Google id when linked, else the email.
        url = ga4.authorization_url(
            create_oauth_state(user.id, business.id, "ga4"),
            login_hint=user.google_sub or user.email,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"url": url}


@router.get("/ga4/callback")
def ga4_callback(code: str = "", state: str = "", error: str = "", db: Session = Depends(get_db)):
    settings = get_settings()
    dest = f"{settings.web_origin}/integrations"
    if error:
        note = "האישור לגוגל לא הושלם. התוכנית נשמרה; אפשר לחבר שוב כשנוח לכם."
        return RedirectResponse(f"{dest}?{urlencode({'error': note})}")
    try:
        claims = decode_oauth_state(state)
        tokens = ga4.exchange_code(code)
        item = _upsert(db, claims["business_id"], "ga4")
        item.access_token_enc = encrypt_secret(tokens["access_token"])
        item.refresh_token_enc = encrypt_secret(tokens["refresh_token"])
        item.token_expires_at = tokens["expires_at"]
        item.status = "select_property"
        item.external_id = ""
        item.display_name = ""
        properties = ga4.list_properties(tokens["access_token"], tokens["refresh_token"], tokens["expires_at"])
        extra = {"properties": properties, "scopes": tokens.get("scopes") or []}
        mismatch = _note_google_account(db, claims["user_id"], tokens.get("id_token"), extra)
        item.extra_json = dumps(extra)
        item.updated_at = datetime.utcnow()
        db.commit()
        _invalidate_promotion_cache(claims["business_id"])
    except Exception as exc:
        db.rollback()
        return RedirectResponse(f"{dest}?{urlencode({'error': ga4_readiness.failure(exc)['note_he']})}")
    suffix = "&ga4_account=other" if mismatch else ""
    return RedirectResponse(f"{dest}?ga4=connected{suffix}")


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
    try:
        properties = ga4.list_properties(*tokens_for(item))
    except Exception as exc:
        state = ga4_readiness.record(db, item, ga4_readiness.failure(exc)["status"])
        raise HTTPException(status_code=502, detail=state["note_he"]) from exc
    prop = next((prop for prop in properties if prop["property_id"] == body.property_id), None)
    if not prop:
        raise HTTPException(status_code=400, detail="האתר שנבחר אינו זמין בחשבון הזה. חברו חשבון עם גישה לאתר ובחרו אותו מהרשימה.")
    extra = loads(item.extra_json, {})
    extra["properties"] = properties
    extra["selected_property_id"] = body.property_id
    item.external_id = body.property_id
    item.display_name = f"{prop['display_name']} ({prop['account']})"[:160]
    item.extra_json = dumps(extra)
    item.status = "connected"
    item.updated_at = datetime.utcnow()
    db.commit()
    ga4_readiness.initial_read(db, item)
    return {"integration": _public_integration(item)}


@router.post("/ga4/read")
def ga4_read(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    item = db.query(Integration).filter(
        Integration.business_id == business.id, Integration.provider == "ga4",
    ).first()
    if not item or not item.access_token_enc or not item.external_id:
        raise HTTPException(status_code=400, detail="בחרו קודם את האתר בעמוד החיבורים.")
    ga4_readiness.initial_read(db, item)
    return {"integration": _public_integration(item)}


router.include_router(meta_connections.router)


@router.post("/meta/account")
def meta_account(
    body: MetaAccountIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    meta_connections.save_assets(body, business, db)
    item = meta_connections.integration(business, db)
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
    if provider not in ("ga4", "meta"):
        raise HTTPException(status_code=400, detail="אין חיבור כזה")
    item = (
        db.query(Integration)
        .filter(Integration.business_id == business.id, Integration.provider == provider)
        .first()
    )
    if item:
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
