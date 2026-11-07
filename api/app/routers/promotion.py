"""Google Ads planning guidance, observed search terms, and the free local profile.

Two endpoints, both scoped to the caller's business:

* `GET /promotion/google` — the owner's saved marketing budget, official Google Ads
  planning references, and the Google Business Profile checklist. It does not forecast
  ad performance or read a Google Ads account. Deterministic, no network.
* `GET /promotion/keywords` — real query phrases from Google autocomplete, enriched with
  the queries the site already ranks for when Search Console is connected. Cached, so a
  UI that re-renders cannot hammer Google.

No endpoint in this module invents search volume, and none of them fails when Google is
unreachable: autocomplete degrades to an empty list, Search Console degrades to None, and
the response says which of the two it got.
"""

import threading
import time
from hashlib import sha256

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import object_session

from app.deps import get_business
from app.models import Business
from app.services import keywords, search_console
from app.services.google_cost import business_profile_guidance, plan_for_business
from app.services.jsonutil import loads, dumps
from app.services.business_fields import field_label

router = APIRouter(prefix="/promotion", tags=["promotion"])

# The suggest endpoint is public and cheap, but a page that re-renders on every keystroke
# should not translate into traffic to Google on our behalf. In-process TTL is enough for
# a single API instance; the payload is small and rebuildable.
KEYWORD_CACHE_TTL_SECONDS = 900
_KEYWORD_CACHE: dict[int, tuple[float, dict, str]] = {}
_KEYWORD_CACHE_LOCK = threading.Lock()


def _business_payload(business: Business) -> dict:
    return {
        "name": business.name,
        "website_url": business.website_url,
        "business_type": field_label(business.business_type),
        "offerings": business.offerings,
        "location": business.location,
        "presence_type": business.presence_type,
        "business_model": business.business_model or "products",
        "primary_goal": business.primary_goal,
        "monthly_budget_ils": business.monthly_budget_ils,
        "competitors": loads(getattr(business, "competitors_json", "") or "[]", []),
    }


def cache_clear(business_id: int | None = None) -> None:
    """Drop the cached keyword payload for one business, or for everyone.

    Called when the Google connection changes (see `integrations.py`): a payload that
    still holds Search Console queries after the account was disconnected would keep
    serving data the owner just revoked.
    """
    with _KEYWORD_CACHE_LOCK:
        if business_id is None:
            _KEYWORD_CACHE.clear()
        else:
            _KEYWORD_CACHE.pop(business_id, None)


def _search_console(business: Business) -> tuple[dict | None, str]:
    """Search Console data for this business, or (None, why not).

    The reason is Hebrew and user-facing: "not connected" and "connected but the Search
    Console permission was never granted" are different problems with different fixes.
    """
    db = object_session(business)
    if db is None:
        return None, keywords.SEARCH_CONSOLE_MISSING_NOTE
    item = search_console.ensure_legacy(db, business)
    if not item or not item.access_token_enc:
        return None, keywords.SEARCH_CONSOLE_MISSING_NOTE
    try:
        state = search_console.read(db, item, business)
        if state["status"] in {"ready", "empty"}:
            return search_console.public_data(item, business.website_url), ""
        return None, state["note_he"]
    except Exception:
        return None, search_console.NOTES["unavailable"]


def _build_keywords(business: Business) -> dict:
    console, note = _search_console(business)
    return keywords.collect(
        _business_payload(business),
        search_console=console,
        search_console_note=note,
    )


def _cache_identity(business: Business) -> str:
    db = object_session(business)
    source_identity = None
    if db is not None:
        db.refresh(business)
        item = search_console.ensure_legacy(db, business)
        if item:
            db.refresh(item)
            source_identity = [item.id, item.external_id, item.access_token_enc, item.refresh_token_enc]
    # Do not include read timestamps: a successful read updates those itself.
    # Website/profile changes and replaced/revoked grants invalidate old decisions.
    return sha256(dumps([_business_payload(business), source_identity]).encode()).hexdigest()


@router.get("/google")
def google_plan(business: Business = Depends(get_business)) -> dict:
    """The Google cost plan for this business. Deterministic: no network, no model."""
    payload = _business_payload(business)
    return {
        "plan": plan_for_business(payload).to_dict(),
        "business_profile": business_profile_guidance(payload),
    }


@router.get("/keywords")
def keyword_ideas(
    business: Business = Depends(get_business),
    refresh: bool = Query(default=False, description="התעלמו מהמטמון ובנו מחדש"),
) -> dict:
    """Real query phrases, enriched with Search Console when it is connected."""
    business_id = business.id
    identity = _cache_identity(business)
    if not refresh:
        with _KEYWORD_CACHE_LOCK:
            cached = _KEYWORD_CACHE.get(business_id)
        if cached and len(cached) == 3 and cached[0] > time.time() and cached[2] == identity:
            return {**cached[1], "cached": True}

    payload = _build_keywords(business)
    if _cache_identity(business) != identity:
        # A source/site changed while a provider request was in flight. Never
        # cache that response under the replacement connection's identity.
        raise HTTPException(409, "האתר או החיבור השתנו. נסו לעדכן שוב את הנתונים.")
    with _KEYWORD_CACHE_LOCK:
        _KEYWORD_CACHE[business_id] = (time.time() + KEYWORD_CACHE_TTL_SECONDS, payload, identity)
    return {**payload, "cached": False}


__all__ = ["router", "cache_clear"]
