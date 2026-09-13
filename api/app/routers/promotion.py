"""Promotion basics for Google: what it would cost, and which terms are worth having.

Two endpoints, both scoped to the caller's business and both grounded in published data
or in the owner's own Google account:

* `GET /promotion/google` — the cost plan (ranges only, from the Rulers data in
  `services/google_cost.py`) plus the Google Business Profile checklist for the free
  local surface. Deterministic, no network.
* `GET /promotion/keywords` — real query phrases from Google autocomplete, enriched with
  the queries the site already ranks for when Search Console is connected. Cached, so a
  UI that re-renders cannot hammer Google.

No endpoint in this module invents search volume, and none of them fails when Google is
unreachable: autocomplete degrades to an empty list, Search Console degrades to None, and
the response says which of the two it got.
"""

import threading
import time

from fastapi import APIRouter, Depends, Query

from app.deps import get_business
from app.models import Business
from app.routers.integrations import tokens_for
from app.services import ga4, keywords
from app.services.google_cost import business_profile_guidance, plan_for_business
from app.services.jsonutil import loads

router = APIRouter(prefix="/promotion", tags=["promotion"])

# The suggest endpoint is public and cheap, but a page that re-renders on every keystroke
# should not translate into traffic to Google on our behalf. In-process TTL is enough for
# a single API instance; the payload is small and rebuildable.
KEYWORD_CACHE_TTL_SECONDS = 900
_KEYWORD_CACHE: dict[int, tuple[float, dict]] = {}
_KEYWORD_CACHE_LOCK = threading.Lock()


def _business_payload(business: Business) -> dict:
    return {
        "name": business.name,
        "website_url": business.website_url,
        "business_type": business.business_type,
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
    item = next((i for i in business.integrations if i.provider == "ga4"), None)
    if not item or item.status != "connected" or not item.access_token_enc or not item.refresh_token_enc:
        return None, keywords.SEARCH_CONSOLE_MISSING_NOTE

    extra = loads(item.extra_json, {})
    if not keywords.search_console_scope_granted(extra.get("scopes")):
        return None, (
            "חשבון גוגל מחובר, אבל הרשאת Search Console לא ניתנה בו. חברו את גוגל מחדש "
            "כדי לאשר גם את Search Console — ואז יופיעו כאן השאילתות שהאתר כבר מופיע בהן "
            "עם קליקים, חשיפות ומיקום אמיתיים."
        )

    try:
        access, refresh, expires = tokens_for(item)
        token = ga4.fresh_access_token(access, refresh, expires)
    except Exception:
        return None, "חיבור גוגל לא הצליח להתחדש, ולכן אין כרגע נתוני Search Console. נסו לחבר מחדש."

    payload = keywords.search_console_queries(token, business.website_url or "")
    if payload is None:
        return None, (
            "הרשאת Search Console קיימת אבל גוגל לא החזירה נתונים — ייתכן שלאתר אין נכס "
            "Search Console מאומת, או שאין באתר חשיפות ב-28 הימים האחרונים."
        )
    return payload, ""


def _build_keywords(business: Business) -> dict:
    console, note = _search_console(business)
    return keywords.collect(
        _business_payload(business),
        search_console=console,
        search_console_note=note,
    )


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
    if not refresh:
        with _KEYWORD_CACHE_LOCK:
            cached = _KEYWORD_CACHE.get(business_id)
        if cached and cached[0] > time.time():
            return {**cached[1], "cached": True}

    payload = _build_keywords(business)
    with _KEYWORD_CACHE_LOCK:
        _KEYWORD_CACHE[business_id] = (time.time() + KEYWORD_CACHE_TTL_SECONDS, payload)
    return {**payload, "cached": False}


__all__ = ["router", "cache_clear"]
