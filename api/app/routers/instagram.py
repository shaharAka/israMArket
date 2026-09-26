"""Instagram signal for the UI: competitor handles and the monthly inspiration brief.

Not connected is a normal state, not an error: every endpoint answers 200 with an honest
empty payload (`empty_reason`) so the page can show what connecting would enable. Only a
failed Gemini call on refresh is a 502, the same as every other generation endpoint.
"""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_business
from app.models import Business, InstagramPost
from app.schemas import InspirationRefreshIn, InstagramHandlesIn
from app.services import instagram_signal, meta
from app.services.jsonutil import dumps

router = APIRouter(prefix="/instagram", tags=["instagram"])


def _month(year: int | None, month: int | None) -> tuple[int, int]:
    today = date.today()
    return year or today.year, month or today.month


def _empty_reason(*, connected: bool, synced: int, own: list, brief: dict | None, handles: list) -> str:
    if brief or own:
        return ""
    if not meta.meta_configured():
        return "החיבור לאינסטגרם עוד לא הופעל במערכת. עד אז אנחנו כותבים את הפוסטים בלי נתוני אינסטגרם, ולא טוענים מה עבד."
    if not connected:
        return "אינסטגרם לא מחובר. חברו אותו בעמוד החיבורים, ונכתוב את הפוסטים לפי מה שהכי הצליח לכם."
    if not synced:
        return "אינסטגרם מחובר, אבל עוד לא משכנו את הנתונים של הפוסטים. רעננו את הנתונים בעמוד הביצועים, ואז לחצו על 'ללמוד מהאינסטגרם'."
    if not handles:
        return (
            "עוד אין פוסט שלכם עם שמירות, שיתופים או תגובות שאפשר ללמוד ממנו. "
            "הוסיפו עד 5 חשבונות להשראה, ואז לחצו על 'ללמוד מהאינסטגרם'."
        )
    return "עוד לא למדנו מהאינסטגרם לחודש הזה. לחצו על 'ללמוד מהאינסטגרם'."


def _payload(db: Session, business: Business, year: int, month: int) -> dict:
    signal = instagram_signal.signal_for(db, business, year, month)
    handles = instagram_signal.handles_for(business)
    synced = db.query(InstagramPost).filter(InstagramPost.business_id == business.id).count()
    own = signal.get("own_top_posts") or []
    brief = signal.get("brief")
    if brief:
        brief = {key: value for key, value in brief.items() if key != "catalogue"}
    return {
        "year": year,
        "month": month,
        "meta_ready": meta.meta_configured(),
        "meta_connected": bool(signal.get("connected")),
        "handles": handles,
        "max_handles": instagram_signal.MAX_HANDLES,
        "hashtag_search": instagram_signal.hashtag_status(db, business),
        "own_posts_synced": synced,
        "own_top_posts": own,
        "brief": brief,
        "empty_reason": _empty_reason(
            connected=bool(signal.get("connected")), synced=synced, own=own, brief=brief, handles=handles
        ),
    }


@router.get("/brief")
def get_brief(
    year: int | None = Query(default=None, ge=2020, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    """The brief for the month (else the newest earlier one) plus own top posts."""
    return _payload(db, business, *_month(year, month))


@router.put("/handles")
def put_handles(
    body: InstagramHandlesIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    try:
        handles = instagram_signal.normalize_handles(body.handles)
    except instagram_signal.HandleError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    business.instagram_handles_json = dumps(handles)
    business.updated_at = datetime.utcnow()
    db.commit()
    return {"handles": handles, "max_handles": instagram_signal.MAX_HANDLES}


@router.post("/brief/refresh")
def refresh_brief(
    body: InspirationRefreshIn | None = None,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    body = body or InspirationRefreshIn()
    year, month = _month(body.year, body.month)
    try:
        result = instagram_signal.refresh_brief(db, business, year, month, hashtags=body.hashtags)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail=f"לא הצלחנו ללמוד מהאינסטגרם: {exc}") from exc
    db.refresh(business)
    return {
        **_payload(db, business, year, month),
        "refresh": {
            "status": result["status"],
            "reason_he": result["reason_he"],
            # Per handle: ok / error_he, so the UI can mark the one that was not found.
            "competitors": [
                {
                    "handle": entry.get("handle"),
                    "ok": bool(entry.get("ok")),
                    "error_he": entry.get("error_he") or "",
                    "posts_seen": entry.get("posts_seen", 0),
                }
                for entry in result.get("competitors") or []
            ],
            "hashtags": result.get("hashtags"),
        },
    }
