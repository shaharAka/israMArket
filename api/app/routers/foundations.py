"""The free month's foundations (docs/onboarding-v2.md, Revision 8): what the owner gives
us before a single post is written.

* `GET/PUT /business/baseline` — "איפה העסק היום": the numbers the month is measured
  against, when no connected source gives them yet. Model-aware fields, every one optional
  ("לא בטוחים" is an answer). Same keys as the goal-setting baseline (Revision 6), so a
  baseline given at /start and one given here are the same thing.
* `GET/PUT /business/featured-items` — which products or services to feature, in what
  order and why (במלאי / רווחי / עונתי / חדש / הכי נמכר). The owner decides; the posts
  follow the order.
* `GET/PUT /business/voice-check` — a quick "does this sound like you?" on the brand voice
  we read off the site, with a note when it does not.

All three live in the business's stored profile (`scraped_profile_json`), next to the plan
they feed; nothing here needs a table. `services/journey.py` reads them for `/trial`.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_business
from app.models import Business, PerformanceSnapshot
from app.services.connected_posts import FEATURED_REASONS_HE, featured_item_id
from app.services import featured_recommendations
from app.services.jsonutil import dumps, loads

router = APIRouter(prefix="/business", tags=["foundations"])

MIN_FEATURED = 3
MAX_FEATURED = 10


def minimum_featured(model: str) -> int:
    """One service is enough to establish a first content focus; shops need variety."""
    return 1 if model in {"services", "saas"} else MIN_FEATURED

# One list for the picks screen and the post writer (services/connected_posts.py).
REASONS: dict[str, str] = FEATURED_REASONS_HE

# The baseline fields per business model. Keys match the goal-setting baseline (Rev 6).
BASELINE_FIELDS: dict[str, dict] = {
    "software_signups_month": {"label_he": "הרשמות למוצר או לרשימת ההמתנה בחודש", "unit_he": "בחודש", "models": {"saas"}},
    "software_demos_month": {"label_he": "בקשות להדגמה בחודש", "unit_he": "בחודש", "models": {"saas"}},
    "software_paid_month": {"label_he": "לקוחות חדשים בתשלום בחודש", "unit_he": "בחודש", "models": {"saas"}},
    "orders_month": {"label_he": "הזמנות או קניות בחודש", "unit_he": "בחודש", "models": {"products", "both"}},
    "avg_order_ils": {"label_he": "סכום ממוצע לקנייה", "unit_he": "₪", "models": {"products", "both"}},
    "inquiries_month": {"label_he": "פניות בחודש", "unit_he": "בחודש", "models": {"services", "both"}},
    "close_rate": {"label_he": "כמה מהפניות הופכות ללקוחות", "unit_he": "%", "models": {"services"}, "max": 100},
    "deal_value_ils": {"label_he": "שווי ממוצע של לקוח", "unit_he": "₪", "models": {"services"}},
}
BASELINE_MAX = 10_000_000


def _stored(business: Business) -> dict:
    stored = loads(business.scraped_profile_json, {}) if business.scraped_profile_json else {}
    return stored if isinstance(stored, dict) else {}


def _save(db: Session, business: Business, stored: dict) -> None:
    business.scraped_profile_json = dumps(stored)
    business.updated_at = datetime.utcnow()
    db.commit()


def _now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds")


def _model(business: Business) -> str:
    return business.business_model if business.business_model in ("products", "services", "both", "saas") else "products"


# --- baseline --------------------------------------------------------------------------


def baseline_fields(model: str) -> list[dict]:
    return [
        {"key": key, "label_he": spec["label_he"], "unit_he": spec["unit_he"]}
        for key, spec in BASELINE_FIELDS.items()
        if model in spec["models"]
    ]


def baseline_filled(baseline) -> bool:
    """At least one number the owner actually gave (a range key from /start counts too)."""
    if not isinstance(baseline, dict):
        return False
    return any(baseline.get(key) not in (None, "", "unknown") for key in BASELINE_FIELDS)


class BaselineIn(BaseModel):
    software_signups_month: int | None = Field(default=None, ge=0, le=BASELINE_MAX)
    software_demos_month: int | None = Field(default=None, ge=0, le=BASELINE_MAX)
    software_paid_month: int | None = Field(default=None, ge=0, le=BASELINE_MAX)
    orders_month: int | None = Field(default=None, ge=0, le=BASELINE_MAX)
    avg_order_ils: int | None = Field(default=None, ge=0, le=BASELINE_MAX)
    inquiries_month: int | None = Field(default=None, ge=0, le=BASELINE_MAX)
    close_rate: int | None = Field(default=None, ge=0, le=100)
    deal_value_ils: int | None = Field(default=None, ge=0, le=BASELINE_MAX)


def _baseline_payload(db: Session, business: Business) -> dict:
    stored = _stored(business)
    baseline = stored.get("baseline") if isinstance(stored.get("baseline"), dict) else {}
    snapshot = (
        db.query(PerformanceSnapshot.created_at)
        .filter(PerformanceSnapshot.business_id == business.id)
        .order_by(PerformanceSnapshot.created_at.asc())
        .first()
    )
    # What the owner already said at /start, in their own ranges ("בערך 20-50 הזמנות…"), so
    # this page never looks like a blank re-ask. Empty when /start gave no numbers.
    numbers = stored.get("goal_numbers") if isinstance(stored.get("goal_numbers"), dict) else {}
    view = numbers.get("view") if isinstance(numbers.get("view"), dict) else {}
    from_start = str(view.get("baseline_he") or "").strip() if view.get("baseline_known") else ""
    return {
        "baseline": {key: baseline.get(key) for key in BASELINE_FIELDS if key in baseline},
        "saved_at": baseline.get("saved_at"),
        "fields": baseline_fields(_model(business)),
        # A connected source already gave real numbers: the baseline is measured, not typed.
        "from_integrations": snapshot is not None,
        "from_start_he": from_start,
    }


@router.get("/baseline")
def get_baseline(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    return _baseline_payload(db, business)


@router.put("/baseline")
def put_baseline(body: BaselineIn, business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    stored = _stored(business)
    allowed = {field["key"] for field in baseline_fields(_model(business))}
    previous = stored.get("baseline") if isinstance(stored.get("baseline"), dict) else {}
    values = {key: value for key, value in body.model_dump().items() if key in allowed}
    # Fields of another model (a key from /start) are kept, not wiped by this form.
    merged = {**{k: v for k, v in previous.items() if k not in allowed}, **values}
    merged.update({"source": "owner", "saved_at": _now()})
    stored["baseline"] = merged
    _save(db, business, stored)
    return _baseline_payload(db, business)


# --- featured items --------------------------------------------------------------------


def _clean(value: str, limit: int) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


class FeaturedItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    reason: Literal["in_stock", "profitable", "seasonal", "new", "best_seller"] | None = None
    note: str = Field(default="", max_length=160)
    kind: Literal["product", "service", "offering", "work", "expertise", "story"] | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        text = _clean(value, 80)
        if not text:
            raise ValueError("כתבו שם של מוצר או שירות.")
        return text


class FeaturedItemsIn(BaseModel):
    items: list[FeaturedItemIn] = Field(default_factory=list, max_length=MAX_FEATURED)


def featured_items(stored: dict) -> list[dict]:
    raw = stored.get("featured_items")
    if not isinstance(raw, dict):
        return []
    items = raw.get("items")
    return [item for item in items if isinstance(item, dict) and item.get("name")] if isinstance(items, list) else []


def _suggestions(business: Business, taken: set[str]) -> list[str]:
    """What the owner already told us they sell, as starting points they can tap."""
    # Also at a sentence end or a colon: "כלי קרמיקה: ספלים, קערות. מוכרים באתר" offered
    # "קערות. מוכרים באתר…" as one product. A decimal point ("1.5 ליטר") is not followed
    # by a space, so it is not split.
    parts = re.split(r"[,،\n;|•]+|\s+-\s+|[.:](?:\s+|$)", business.offerings or "")
    out: list[str] = []
    for part in parts:
        name = _clean(part, 60)
        if 1 < len(name) <= 60 and name not in taken and name not in out:
            out.append(name)
    return out[:8]


def _featured_payload(business: Business, db: Session) -> dict:
    stored = _stored(business)
    items = featured_items(stored)
    raw = stored.get("featured_items") if isinstance(stored.get("featured_items"), dict) else {}
    model = _model(business)
    return {
        "items": [
            {
                # The id a post that features this item carries (`featured_item_id`).
                "id": featured_item_id(item["name"]),
                "name": item["name"],
                "priority": index + 1,
                "reason": item.get("reason"),
                "note": item.get("note") or "",
                "kind": item.get("kind") or ("service" if model == "services" else "product" if model == "products" else "offering"),
            }
            for index, item in enumerate(items)
        ],
        "saved_at": raw.get("saved_at"),
        "reasons": [{"key": key, "label_he": label} for key, label in REASONS.items() if model not in {"services", "saas"} or key in {"seasonal", "new"}],
        "min": minimum_featured(model),
        "max": MAX_FEATURED,
        "kind_he": "נושאים על המוצר" if model == "saas" else "שירותים" if model == "services" else "מוצרים ושירותים" if model == "both" else "מוצרים",
        "business_model": model,
        "kinds": ([{"key": key, "label_he": label} for key, label in {
            "offering": "מוצר או יכולת", "work": "הדגמה אמיתית", "expertise": "הסבר שימושי", "story": "סיפור לקוח",
        }.items()] if model == "saas" else [{"key": key, "label_he": label} for key, label in featured_recommendations.KINDS.items()
                  if (model != "services" or key != "product") and (model != "products" or key == "product")]),
        "suggestions": _suggestions(business, {item["name"] for item in items}),
        "recommendations": featured_recommendations.recommend(db, business, stored, {item["name"] for item in items}),
    }


@router.get("/featured-items")
def get_featured(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    return _featured_payload(business, db)


@router.put("/featured-items")
def put_featured(body: FeaturedItemsIn, business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    stored = _stored(business)
    seen: set[str] = set()
    items = []
    for item in body.items:
        if item.name in seen:
            continue
        seen.add(item.name)
        note = _clean(item.note, 160)
        if item.kind in {"work", "story"} and len(note) < 5:
            raise HTTPException(422, "תארו דוגמה אמיתית מהעבודה, בלי פרטים מזהים של לקוחות.")
        items.append({"name": item.name, "reason": item.reason, "note": note, "kind": item.kind})
    stored["featured_items"] = {"items": items, "saved_at": _now()}
    _save(db, business, stored)
    return _featured_payload(business, db)


# --- voice check -----------------------------------------------------------------------


class VoiceCheckIn(BaseModel):
    ok: bool
    note: str = Field(default="", max_length=400)


def _voice_payload(business: Business) -> dict:
    stored = _stored(business)
    brand = stored.get("brand_language") if isinstance(stored.get("brand_language"), dict) else {}
    examples = [str(item) for item in brand.get("voice_examples") or [] if str(item).strip()][:2]
    check = stored.get("voice_check") if isinstance(stored.get("voice_check"), dict) else None
    # "preset": no site was read (none given, or it could not be read). The one "example"
    # is then the owner's own description, not a sample of a read voice.
    preset = brand.get("source") == "preset"
    return {
        "voice_he": str(brand.get("voice") or ""),
        "examples_he": [] if preset else examples,
        "from_site": bool(brand) and not preset,
        "do_say": [str(item) for item in brand.get("do_say") or []][:3],
        "dont_say": [str(item) for item in brand.get("dont_say") or []][:3],
        "check": check,
    }


@router.get("/voice-check")
def get_voice(business: Business = Depends(get_business)) -> dict:
    return _voice_payload(business)


@router.put("/voice-check")
def put_voice(body: VoiceCheckIn, business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    stored = _stored(business)
    stored["voice_check"] = {"ok": body.ok, "note": _clean(body.note, 400), "at": _now()}
    _save(db, business, stored)
    return _voice_payload(business)
