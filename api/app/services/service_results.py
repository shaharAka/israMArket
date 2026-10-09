"""Service evidence supplied by the owner; never inferred from a contact click.

Monthly inquiry fit is a subset, but clients won can have first inquired in an earlier
month. Capacity is a current planning input, not a historical conversion result.
"""
import calendar
import hashlib
from datetime import date, datetime, timedelta

from app.services.jsonutil import dumps, loads


def enabled(business) -> bool:
    stored = loads(getattr(business, "scraped_profile_json", ""), {})
    stored = stored if isinstance(stored, dict) else {}
    owner = stored.get("owner_context")
    owner = owner if isinstance(owner, dict) else {}
    journey = owner.get("research_journey")
    journey = journey if isinstance(journey, dict) else {}
    route = journey.get("segment")
    return route == "services" if route else getattr(business, "business_model", "products") in {"services", "both"}


def latest(business):
    rows = getattr(business, "service_reports", []) if enabled(business) else []
    return max(rows, key=lambda row: row.month, default=None)


def view(row, today: date | None = None) -> dict | None:
    if row is None:
        return None
    today = today or date.today()
    year, month = map(int, row.month.split("-"))
    end = min(date(year, month, calendar.monthrange(year, month)[1]), row.updated_at.date(), today)
    fresh_capacity = row.month == today.strftime("%Y-%m") and row.updated_at.date() >= today - timedelta(days=7)
    return {"month": row.month, "period": {"start": f"{row.month}-01", "end": end.isoformat()},
            "inquiries": row.inquiries, "suitable": row.suitable, "clients_won": row.clients_won,
            "fit_criterion": row.fit_criterion, "capacity": row.capacity if fresh_capacity else None,
            "capacity_outdated": row.capacity is not None and not fresh_capacity,
            "source": "owner", "revision": row.revision, "updated_at": row.updated_at.isoformat()}


def evidence(business) -> dict | None:
    if not enabled(business):
        return None
    stored = loads(getattr(business, "scraped_profile_json", ""), {}) or {}
    baseline = stored.get("baseline") or {}
    diagnostics = stored.get("diagnostics") or {}
    return {"report": view(latest(business)),
            "planning_inputs": {key: baseline[key] for key in ("inquiries_month", "close_rate", "deal_value_ils", "capacity_more") if key in baseline},
            "capacity_constraint": diagnostics.get("capacity_constraint", ""),
            "portfolio_available": diagnostics.get("has_portfolio"),
            "limits": ["הספירות הן דיווח של בעלי העסק, לא מדידה מגוגל או מאינסטגרם ולא שיוך לפוסט.",
                       "פניות מתאימות הן חלק מהפניות שהתקבלו בחודש הזה, לפי ההגדרה של בעלי העסק.",
                       "לקוחות חדשים יכולים להגיע מפניות של חודש קודם. אין לחשב שיעור סגירה בין הספירות האלה.",
                       "planning_inputs הן תשובות לתכנון, לעיתים טווחים או הערכות; הן אינן תוצאות שנמדדו.",
                       "capacity היא מספר הלקוחות הנוספים שאפשר לקבל עכשיו, רק אם הדיווח מהחודש הזה ועודכן בשבעת הימים האחרונים."]}


def fingerprint(business) -> str:
    row = latest(business)
    # The revision detects a correction even if the numerical outcome happens to match.
    return hashlib.sha256(dumps([row.id if row else None, row.revision if row else None, evidence(business)]).encode()).hexdigest() if enabled(business) else ""


def model_context(business) -> dict:
    item = evidence(business)
    return {"service_results": item} if item is not None else {}
