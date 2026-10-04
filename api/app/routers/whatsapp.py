"""The WhatsApp tracked link — the owner's side and the public redirect.

Owner (auth, scoped to the caller's business through `get_business`):
    GET  /whatsapp/link              the number, the default text and every link with counts
    PUT  /whatsapp/link              {number, default_text_he?} — validates an Israeli number
    POST /whatsapp/link/source       {source_key, label_he?} — returns or creates one link
    GET  /whatsapp/link/post/{index} the post's own link, when its CTA is WhatsApp

Public (no auth, no cookies read, nothing about the visitor stored):
    GET  /r/{code}                   302 to wa.me; counts the tap unless it is a bot
    HEAD /r/{code}                   the same redirect, never counted

See services/whatsapp.py for what is and is not measured and stored.
"""

from __future__ import annotations

from html import escape

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_business
from app.models import Business, WhatsappLink
from app.services import whatsapp

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])
public_router = APIRouter(tags=["whatsapp"])


def _text_field(body: dict, key: str, *, required: bool = False, limit: int = 300) -> str | None:
    value = body.get(key)
    if value is None:
        if required:
            raise HTTPException(status_code=422, detail="חסר שדה בבקשה.")
        return None
    if not isinstance(value, str):
        raise HTTPException(status_code=422, detail="השדה צריך להיות טקסט.")
    if len(value) > limit:
        raise HTTPException(status_code=422, detail=f"הטקסט ארוך מדי. עד {limit} תווים.")
    return value


@router.get("/link")
def get_links(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    if business.whatsapp_number_e164:
        # Businesses that set the number before a fixed source existed get it now.
        whatsapp.ensure_auto_links(db, business)
        db.commit()
    return whatsapp.summary(db, business)


@router.put("/link")
def put_link(
    body: dict = Body(...),
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    number = _text_field(body, "number", required=True, limit=40) or ""
    default_text = _text_field(body, "default_text_he", limit=whatsapp.MAX_TEXT)
    try:
        whatsapp.set_number(db, business, number, default_text)
    except whatsapp.InvalidNumber as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return whatsapp.summary(db, business)


@router.post("/link/source")
def post_source(
    body: dict = Body(...),
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    source_key = _text_field(body, "source_key", required=True, limit=64) or ""
    label = _text_field(body, "label_he", limit=255) or ""
    if not business.whatsapp_number_e164:
        raise HTTPException(status_code=409, detail=whatsapp.NO_NUMBER_HE)
    try:
        link = whatsapp.ensure_link(db, business, source_key, label)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    db.commit()
    return {"link": whatsapp.public_link(business, link)}


@router.get("/link/post/{index}")
def post_link(index: int, business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    """The post's own link, created on first read. Idempotent: the same post always gets
    the same link. `link` is null — with the reason — when the number is not set or the
    post's call to action is not WhatsApp."""
    from app.routers.strategy import _active_strategy  # avoids an import cycle at startup
    from app.services.publish import _posts

    strategy = _active_strategy(db, business)
    posts = _posts(strategy)
    if index < 0 or index >= len(posts):
        raise HTTPException(status_code=404, detail="לא מצאנו את הפוסט הזה בתוכנית של החודש.")
    post = posts[index]
    cta_whatsapp = whatsapp.post_cta_is_whatsapp(post)
    link = whatsapp.link_for_post(db, business, strategy, index, post)
    if link:
        db.commit()
    return {
        "number_set": bool(business.whatsapp_number_e164),
        "cta_is_whatsapp": cta_whatsapp,
        "link": whatsapp.public_link(business, link) if link else None,
    }


# --- the public redirect ----------------------------------------------------------------

# The visitor is the business's customer, not the owner: a calm page in the site's colours,
# what happened, and a way on (web/app/r/[code]/route.ts serves the same page when the API
# cannot be reached).
_NOT_FOUND_PAGE = """<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{title} · ישראמארקט</title>
<style>
  body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f7fb;
         color: #14203a; font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif; }}
  main {{ max-width: 24rem; padding: 2rem 1.25rem; text-align: center; }}
  .mark {{ display: inline-block; width: 10px; height: 10px; border-radius: 999px; background: #ffc44a;
          box-shadow: 0 0 0 5px #fff4d6; }}
  h1 {{ font-size: 1.4rem; line-height: 1.3; margin: 1.25rem 0 .5rem; }}
  p {{ margin: 0; line-height: 1.7; color: #4b5670; }}
  a {{ display: inline-flex; align-items: center; min-height: 44px; margin-top: 1.25rem; color: #2853c7;
      font-weight: 600; text-decoration: none; }}
  a:hover {{ text-decoration: underline; }}
</style>
</head>
<body><main><span class="mark" aria-hidden="true"></span><h1>{title}</h1><p>{body}</p>
<a href="{home}">לעמוד הבית של ישראמארקט</a></main></body>
</html>"""

_GONE_TITLE = "הקישור הזה כבר לא פעיל"
_GONE_BODY = "אולי הוא הועתק חלקית, או שהעסק החליף אותו. אפשר לבקש מהעסק את הקישור שוב."

_NO_STORE = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
}


def _page(status: int, title: str, body: str) -> HTMLResponse:
    home = f"{whatsapp.get_settings().web_origin.rstrip('/')}/"
    return HTMLResponse(
        _NOT_FOUND_PAGE.format(title=escape(title), body=escape(body), home=escape(home, quote=True)),
        status_code=status,
        headers=_NO_STORE,
    )


@public_router.api_route("/r/{code}", methods=["GET", "HEAD"], include_in_schema=False)
def redirect(code: str, request: Request, db: Session = Depends(get_db)):
    if not code.isalnum() or len(code) > 16:
        return _page(404, _GONE_TITLE, _GONE_BODY)
    link = db.query(WhatsappLink).filter(WhatsappLink.code == code).first()
    business = db.get(Business, link.business_id) if link else None
    if not link or not business:
        return _page(404, _GONE_TITLE, _GONE_BODY)
    if not business.whatsapp_number_e164:
        return _page(404, "הקישור הזה לא פעיל כרגע", "העסק עוד לא עדכן את מספר הוואטסאפ. נסו שוב מאוחר יותר.")

    if whatsapp.should_count(request.method, request.headers):
        # Only the coarse device bucket is derived from the user agent; neither it nor the
        # client address is written anywhere.
        whatsapp.record_click(db, link, request.headers.get("user-agent") or "")
    return RedirectResponse(whatsapp.wa_url(business, link), status_code=302, headers=_NO_STORE)
