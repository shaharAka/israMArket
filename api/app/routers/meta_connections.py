"""Customer Meta consent, asset selection and read-only tracking checks."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from jose import jwt
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_business, get_current_user
from app.models import Business, Integration, User
from app.schemas import MetaAccountIn
from app.security import ALGORITHM, decrypt_secret, encrypt_page_tokens, encrypt_secret
from app.services import meta, meta_marketing, meta_readiness
from app.services.jsonutil import dumps, loads

router = APIRouter()
FLOW_COOKIE = "isramarket_meta_flow"


def integration(business: Business, db: Session) -> Integration:
    item = db.query(Integration).filter(Integration.business_id == business.id, Integration.provider == "meta").first()
    if not item or not item.access_token_enc:
        raise HTTPException(400, "חברו קודם את החשבון במטא.")
    return item


@router.get("/meta/start")
def start(response: Response, ads: bool = False, popup: bool = False,
          business: Business = Depends(get_business), user: User = Depends(get_current_user)):
    settings = get_settings()
    nonce = secrets.token_urlsafe(32)
    attempt = secrets.token_urlsafe(16)
    state = jwt.encode({"sub": str(user.id), "biz": business.id, "p": "meta", "popup": popup,
                        "attempt": attempt,
                        "nonce": hashlib.sha256(nonce.encode()).hexdigest(),
                        "exp": datetime.now(timezone.utc) + timedelta(minutes=20)},
                       settings.jwt_secret, algorithm=ALGORITHM)
    try:
        url = meta.authorization_url(state, ads=ads)
    except RuntimeError:
        raise HTTPException(503, "החיבור למטא עדיין לא זמין. אפשר להמשיך בתוכנית ולנסות שוב בהמשך.") from None
    secure = settings.cookie_secure if settings.cookie_secure is not None else settings.web_origin.startswith("https://")
    response.set_cookie(FLOW_COOKIE, nonce, max_age=1200, httponly=True, secure=secure, samesite="lax", path="/")
    response.headers["Cache-Control"] = "no-store"
    return {"url": url, "attempt": attempt}


def finish(result: str, popup: bool) -> RedirectResponse:
    origin = get_settings().web_origin.rstrip("/")
    path = "/integrations/meta/complete" if popup else "/integrations"
    response = RedirectResponse(f"{origin}{path}?{urlencode({'meta_result': result})}", status_code=303)
    response.delete_cookie(FLOW_COOKIE, path="/")
    response.headers["Cache-Control"] = "no-store"
    return response


@router.get("/meta/callback")
def callback(request: Request, code: str = "", state: str = "", error: str = "",
             db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    popup = False
    try:
        claims = jwt.decode(state, get_settings().jwt_secret, algorithms=[ALGORITHM])
        popup = claims.get("popup") is True
        nonce = request.cookies.get(FLOW_COOKIE, "")
        if claims.get("p") != "meta" or not nonce or not secrets.compare_digest(
                str(claims.get("nonce") or ""), hashlib.sha256(nonce.encode()).hexdigest()):
            raise ValueError("invalid browser binding")
        business = db.get(Business, int(claims["biz"]))
        if not business or business.user_id != user.id or int(claims["sub"]) != user.id:
            raise ValueError("different owner")
    except Exception:
        return finish("expired", popup)
    if error or not code:
        return finish("cancelled", popup)
    try:
        tokens = meta.exchange_code(code)
        scopes = tokens.get("scopes") or []
        pages, asset_errors = [], {}
        if "pages_show_list" in scopes:
            try:
                pages = meta.list_pages(tokens["access_token"])
            except (RuntimeError, ValueError) as exc:
                asset_errors["pages"] = meta_marketing.failure(exc)
        else:
            asset_errors["pages"] = {"status": "permission", "note_he": "לא אישרתם גישה לדפים. אפשר לאשר שוב או להמשיך עם נתוני הפרסום."}
        accounts = []
        if "ads_read" in scopes:
            try:
                accounts = meta_marketing.list_ad_accounts(tokens["access_token"])
            except (RuntimeError, ValueError) as exc:
                asset_errors["ads"] = meta_marketing.failure(exc)
        else:
            asset_errors["ads"] = {"status": "permission", "note_he": "קריאת נתוני הפרסום לא אושרה. אפשר לחבר אותה בהמשך."}
        # Persist only after exchange and discovery. A failed reconnect preserves the old grant.
        item = db.query(Integration).filter(Integration.business_id == business.id, Integration.provider == "meta").first()
        if item is None:
            item = Integration(business_id=business.id, provider="meta")
            db.add(item)
        item.access_token_enc = encrypt_secret(tokens["access_token"])
        item.refresh_token_enc = encrypt_secret(tokens["refresh_token"])
        item.token_expires_at = tokens["expires_at"]
        item.status = "select_assets"
        item.external_id = ""
        item.display_name = ""
        item.extra_json = dumps({"pages": [{k: v for k, v in p.items() if k != "page_access_token"} for p in pages],
                                "page_tokens": encrypt_page_tokens({p["page_id"]: p["page_access_token"] for p in pages}),
                                "ad_accounts": accounts, "scopes": scopes, "asset_errors": asset_errors,
                                "connection_attempt": claims["attempt"]})
        item.updated_at = datetime.utcnow()
        db.commit()
    except Exception:
        db.rollback()
        # OAuth codes, provider messages and credentials never go into a browser URL.
        return finish("failed", popup)
    return finish("success", popup)


@router.get("/meta/assets")
def assets(business: Business = Depends(get_business), db: Session = Depends(get_db)):
    item = integration(business, db)
    extra = loads(item.extra_json, {})
    # These are the assets discovered for this customer's token, never app-admin assets.
    return {"pages": extra.get("pages") or [], "ad_accounts": extra.get("ad_accounts") or [],
            "scopes": extra.get("scopes") or [], "errors": extra.get("asset_errors") or {},
            "connection_attempt": extra.get("connection_attempt") or ""}


@router.get("/meta/pixels")
def pixels(ad_account_id: str, business: Business = Depends(get_business), db: Session = Depends(get_db)):
    item = integration(business, db)
    extra = loads(item.extra_json, {})
    account = next((r for r in extra.get("ad_accounts", []) if r["id"] == ad_account_id), None)
    if not account:
        raise HTTPException(400, "חשבון הפרסום לא נמצא בחשבונות שאישרתם.")
    try:
        rows = meta_marketing.list_pixels(decrypt_secret(item.access_token_enc), ad_account_id)
    except (meta.GraphError, ValueError) as exc:
        return {"pixels": [], "error": meta_marketing.failure(exc)}
    extra.setdefault("pixels_by_account", {})[ad_account_id] = rows
    item.extra_json = dumps(extra)
    db.commit()
    return {"pixels": rows, "error": None}


def save_assets(body: MetaAccountIn, business: Business, db: Session) -> dict:
    item = integration(business, db)
    extra = loads(item.extra_json, {})
    page = next((r for r in extra.get("pages", []) if r["page_id"] == body.page_id), None)
    account = next((r for r in extra.get("ad_accounts", []) if r["id"] == body.ad_account_id), None)
    if body.page_id and (not page or body.page_id not in extra.get("page_tokens", {})):
        raise HTTPException(400, "בחרו דף מתוך הדפים שאישרתם.")
    if body.ad_account_id and not account:
        raise HTTPException(400, "בחרו חשבון פרסום מתוך החשבונות שאישרתם.")
    if not page and not account:
        raise HTTPException(400, "בחרו דף עסקי או חשבון פרסום. אפשר גם לסגור ולחבר בהמשך.")
    offered_pixels = extra.get("pixels_by_account", {}).get(body.ad_account_id, [])
    if body.pixel_id and not any(r["id"] == body.pixel_id for r in offered_pixels):
        raise HTTPException(400, "בחרו את המעקב מתוך הרשימה של חשבון הפרסום שבחרתם.")
    # Instagram association comes from Meta, never from a submitted Instagram ID.
    extra.update({"selected_page_id": page["page_id"] if page else "",
                  "selected_instagram_id": (page.get("instagram_id") or "") if page else "",
                  "selected_ad_account_id": account["id"] if account else "",
                  "selected_pixel_id": body.pixel_id})
    extra.pop("pixel_verification", None)
    extra.pop("pixel_verification_key", None)
    extra.pop("source_readiness", None)
    item.external_id = body.page_id or body.ad_account_id
    item.display_name = (page or account).get("display_name") or (page or account).get("name") or item.external_id
    item.extra_json = dumps(extra)
    item.status = "connected"
    item.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/meta/verify")
def verify(business: Business = Depends(get_business), db: Session = Depends(get_db)):
    item = integration(business, db)
    extra = loads(item.extra_json, {})
    if not extra.get("selected_pixel_id"):
        raise HTTPException(400, "בחרו קודם את המעקב באתר מתוך חשבון הפרסום שלכם.")
    try:
        result = meta_marketing.verify_pixel(decrypt_secret(item.access_token_enc), extra["selected_pixel_id"], business.website_url)
    except (meta.GraphError, ValueError) as exc:
        result = meta_marketing.failure(exc)
    extra["pixel_verification"] = result
    extra["pixel_verification_key"] = meta_readiness.key(item)
    state = extra.get("source_readiness") or {}
    if state.get("selection_key") == meta_readiness.key(item) and state.get("sections"):
        state["sections"]["tracking"] = {"status": result["status"], "note_he": result.get("note_he") or "", "checked_at": result.get("checked_at")}
        state["status"] = meta_readiness.aggregate(state["sections"])
        state["note_he"] = meta_readiness.NOTES[state["status"]]
        extra["source_readiness"] = state
    item.extra_json = dumps(extra)
    db.commit()
    return result
