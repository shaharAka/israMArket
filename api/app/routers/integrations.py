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
from app.security import create_oauth_state, decode_oauth_state, decrypt_secret, encrypt_secret
from app.services import ga4, meta
from app.services.jsonutil import dumps, loads

router = APIRouter(prefix="/integrations", tags=["integrations"])


def _public_integration(item: Integration) -> dict:
    extra = loads(item.extra_json, {})
    return {
        "provider": item.provider,
        "status": item.status,
        "external_id": item.external_id,
        "display_name": item.display_name,
        "connected": item.status == "connected" and bool(item.access_token_enc),
        "properties": extra.get("properties"),
        "pages": extra.get("pages"),
    }


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
        url = ga4.authorization_url(create_oauth_state(user.id, business.id, "ga4"))
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"url": url}


@router.get("/ga4/callback")
def ga4_callback(code: str = "", state: str = "", error: str = "", db: Session = Depends(get_db)):
    settings = get_settings()
    dest = f"{settings.web_origin}/integrations"
    if error:
        return RedirectResponse(f"{dest}?{urlencode({'error': error})}")
    try:
        claims = decode_oauth_state(state)
        tokens = ga4.exchange_code(code)
        item = _upsert(db, claims["business_id"], "ga4")
        item.access_token_enc = encrypt_secret(tokens["access_token"])
        item.refresh_token_enc = encrypt_secret(tokens["refresh_token"])
        item.token_expires_at = tokens["expires_at"]
        item.status = "select_property"
        properties = ga4.list_properties(tokens["access_token"], tokens["refresh_token"], tokens["expires_at"])
        item.extra_json = dumps({"properties": properties})
        item.updated_at = datetime.utcnow()
        db.commit()
    except Exception as exc:
        return RedirectResponse(f"{dest}?{urlencode({'error': str(exc)})}")
    return RedirectResponse(f"{dest}?ga4=connected")


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
        raise HTTPException(status_code=400, detail="יש לחבר קודם חשבון Google Analytics")
    extra = loads(item.extra_json, {})
    extra["selected_property_id"] = body.property_id
    item.external_id = body.property_id
    item.display_name = body.display_name or body.property_id
    item.extra_json = dumps(extra)
    item.status = "connected"
    item.updated_at = datetime.utcnow()
    db.commit()
    return {"integration": _public_integration(item)}


@router.get("/meta/start")
def meta_start(business: Business = Depends(get_business), user: User = Depends(get_current_user)) -> dict:
    try:
        url = meta.authorization_url(create_oauth_state(user.id, business.id, "meta"))
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"url": url}


@router.get("/meta/callback")
def meta_callback(code: str = "", state: str = "", error: str = "", db: Session = Depends(get_db)):
    settings = get_settings()
    dest = f"{settings.web_origin}/integrations"
    if error:
        return RedirectResponse(f"{dest}?{urlencode({'error': error})}")
    try:
        claims = decode_oauth_state(state)
        tokens = meta.exchange_code(code)
        item = _upsert(db, claims["business_id"], "meta")
        item.access_token_enc = encrypt_secret(tokens["access_token"])
        item.refresh_token_enc = encrypt_secret(tokens["refresh_token"])
        item.token_expires_at = tokens["expires_at"]
        item.status = "select_page"
        pages = meta.list_pages(tokens["access_token"])
        item.extra_json = dumps({"pages": [{k: v for k, v in page.items() if k != "page_access_token"} | {"has_token": True} for page in pages], "page_tokens": {p["page_id"]: p["page_access_token"] for p in pages}})
        item.updated_at = datetime.utcnow()
        db.commit()
    except Exception as exc:
        return RedirectResponse(f"{dest}?{urlencode({'error': str(exc)})}")
    return RedirectResponse(f"{dest}?meta=connected")


@router.post("/meta/account")
def meta_account(
    body: MetaAccountIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    item = (
        db.query(Integration)
        .filter(Integration.business_id == business.id, Integration.provider == "meta")
        .first()
    )
    if not item or not item.access_token_enc:
        raise HTTPException(status_code=400, detail="יש לחבר קודם חשבון מטא")
    extra = loads(item.extra_json, {})
    page_tokens = extra.get("page_tokens") or {}
    if body.page_id not in page_tokens:
        raise HTTPException(status_code=400, detail="הדף שנבחר לא נמצא בחשבון שחובר")
    extra["selected_page_id"] = body.page_id
    extra["selected_instagram_id"] = body.instagram_id
    extra["selected_ad_account_id"] = body.ad_account_id
    item.external_id = body.page_id
    item.display_name = body.display_name or body.page_id
    item.extra_json = dumps(extra)
    item.status = "connected"
    item.updated_at = datetime.utcnow()
    db.commit()
    return {"integration": _public_integration(item)}


@router.post("/webhooks")
def create_webhook(
    body: WebhookIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
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
        raise HTTPException(status_code=400, detail="ספק לא חוקי")
    item = (
        db.query(Integration)
        .filter(Integration.business_id == business.id, Integration.provider == provider)
        .first()
    )
    if item:
        db.delete(item)
        db.commit()
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
