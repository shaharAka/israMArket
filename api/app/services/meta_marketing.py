"""Read authorised ad reports and Pixel evidence. Never create ads or send events."""
import math
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

from app.services import meta
from app.services.jsonutil import dumps


def object_id(value: str, *, account: bool = False) -> str:
    raw = value.removeprefix("act_") if account else value
    if not re.fullmatch(r"[0-9]{1,40}", raw):
        raise ValueError("בחרו חשבון מהרשימה שקיבלנו ממטא.")
    return f"act_{raw}" if account else raw


def collection(path: str, params: dict, token: str) -> list[dict]:
    """Follow cursors on the original edge, never a provider-supplied next URL."""
    rows, seen = [], set()
    query = {**params, "limit": 100}
    for _ in range(20):
        payload = meta.graph_get(path, query, token)
        rows.extend(row for row in payload.get("data", []) if isinstance(row, dict))
        paging = payload.get("paging") or {}
        after = (paging.get("cursors") or {}).get("after")
        if not paging.get("next"):
            return rows
        if not isinstance(after, str) or not after or after in seen:
            raise meta.GraphError("רשימת החשבונות ממטא לא הושלמה. נסו שוב.", kind="unavailable")
        seen.add(after)
        query = {**query, "after": after}
    # A truncated result must never look like a complete report or asset list.
    raise meta.GraphError("מטא החזירה רשימה גדולה מדי. נסו שוב או פנו לתמיכה.", kind="unavailable")


def list_ad_accounts(token: str) -> list[dict]:
    return [
        {"id": object_id(str(row["id"]), account=True), "name": str(row.get("name") or "חשבון פרסום"),
         "currency": str(row.get("currency") or ""), "status": row.get("account_status")}
        for row in collection("me/adaccounts", {"fields": "id,name,currency,account_status"}, token)
        if row.get("id")
    ]


def list_pixels(token: str, account_id: str) -> list[dict]:
    return [
        {"id": object_id(str(row["id"])), "name": str(row.get("name") or "מעקב באתר"),
         "last_fired_time": row.get("last_fired_time")}
        for row in collection(f"{object_id(account_id, account=True)}/adspixels",
                              {"fields": "id,name,last_fired_time"}, token)
        if row.get("id")
    ]


def number(value):
    try:
        result = float(value) if value is not None and value != "" else None
        return result if result is not None and math.isfinite(result) and result >= 0 else None
    except (ValueError, TypeError, OverflowError):
        return None


def action(rows, names):
    # Alias action types overlap. Pick the most specific one; never sum the aliases.
    for name in names:
        row = next((r for r in rows or [] if isinstance(r, dict) and r.get("action_type") == name), None)
        if row is not None:
            return number(row.get("value"))
    return None


def report_row(row: dict) -> dict:
    spend = number(row.get("spend"))
    clicks = number(row.get("inline_link_clicks"))
    purchases = action(row.get("actions"), ("offsite_conversion.fb_pixel_purchase",))
    revenue = action(row.get("action_values"), ("offsite_conversion.fb_pixel_purchase",))
    leads = action(row.get("actions"), ("offsite_conversion.fb_pixel_lead", "lead"))
    return {
        "id": str(row.get("campaign_id") or row.get("account_id") or ""),
        "name": str(row.get("campaign_name") or row.get("account_name") or ""),
        "currency": str(row.get("account_currency") or ""),
        "spend": spend, "impressions": number(row.get("impressions")),
        "reach": number(row.get("reach")), "link_clicks": clicks,
        "website_purchases": purchases, "website_purchase_value": revenue, "leads": leads,
        "cost_per_link_click": round(spend / clicks, 4) if spend is not None and clicks else None,
        "cost_per_purchase": round(spend / purchases, 4) if spend is not None and purchases else None,
        "purchase_roas": round(revenue / spend, 4) if revenue is not None and spend else None,
    }


def ads_report(token: str, account_id: str, start: str, end: str) -> dict:
    account_id = object_id(account_id, account=True)
    fields = "account_id,account_name,account_currency,date_start,date_stop,spend,impressions,reach,inline_link_clicks,actions,action_values"
    params = {"fields": fields, "time_range": dumps({"since": start, "until": end}),
              "action_attribution_windows": dumps(["7d_click", "1d_view"]), "action_report_time": "conversion"}
    totals = collection(f"{account_id}/insights", {**params, "level": "account"}, token)
    # Read account totals directly: reach must not be summed across campaigns.
    if len(totals) > 1:
        raise meta.GraphError("מטא החזירה סיכום לא צפוי. נסו לרענן שוב.", kind="unavailable")
    campaigns = collection(f"{account_id}/insights",
                           {**params, "level": "campaign", "fields": f"{fields},campaign_id,campaign_name"}, token)
    return {"status": "available" if totals else "no_activity", "account_id": account_id,
            "period": {"start": start, "end": end},
            "attribution": {"click_days": 7, "view_days": 1, "report_time": "conversion"},
            "overview": report_row(totals[0]) if totals else {},
            "campaigns": sorted((report_row(row) for row in campaigns), key=lambda r: r["spend"] or 0, reverse=True),
            "note_he": "אלה תוצאות שמטא שייכה למודעות: עד 7 ימים מלחיצה או יום מצפייה. הן אינן אימות של הזמנות ששולמו, ולא מחברים אותן לספירה של גוגל."}


def host(value: str) -> str:
    try:
        parsed = urlsplit(value if "://" in value else f"https://{value}")
        return (parsed.hostname or "").lower().removeprefix("www.").rstrip(".")
    except ValueError:
        return ""


def timestamp(value):
    try:
        if isinstance(value, (int, float)) or str(value).isdigit():
            return datetime.fromtimestamp(float(value), tz=timezone.utc)
        result = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return result.replace(tzinfo=timezone.utc) if result.tzinfo is None else result.astimezone(timezone.utc)
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def stats(token: str, pixel_id: str, aggregation: str, now: datetime) -> list[dict]:
    rows = collection(f"{pixel_id}/stats", {"aggregation": aggregation,
                      "start_time": int((now - timedelta(hours=48)).timestamp()),
                      "end_time": int(now.timestamp())}, token)
    return [value for row in rows for value in row.get("data", []) if isinstance(value, dict)]


def verify_pixel(token: str, pixel_id: str, website: str, *, now: datetime | None = None) -> dict:
    pixel_id = object_id(pixel_id)
    now = now or datetime.now(timezone.utc)
    info = meta.graph_get(pixel_id, {"fields": "id,name,last_fired_time"}, token)
    fired = timestamp(info.get("last_fired_time"))
    recent = fired is not None and timedelta(0) <= now - fired <= timedelta(hours=48)
    evidence, errors = {}, {}
    for aggregation in ("event", "host"):
        try:
            evidence[aggregation] = stats(token, pixel_id, aggregation, now)
        except meta.GraphError as exc:
            errors[aggregation] = failure(exc)["note_he"]
    events = sorted({str(r.get("event") or r.get("value") or "") for r in evidence.get("event", [])
                     if number(r.get("count")) and (r.get("event") or r.get("value"))})
    site = host(website) if website else ""
    observed_hosts = {host(str(r.get("value") or "")) for r in evidence.get("host", []) if number(r.get("count"))}
    observed_hosts.discard("")
    matched = site in observed_hosts if site and "host" in evidence else None
    if recent and matched:
        status, note = "receiving", "מטא מקבלת אירועים מהאתר שלכם. עכשיו אפשר לבדוק אילו פעולות נמדדות."
    elif recent and matched is False and observed_hosts:
        status, note = "wrong_site", "מטא מקבלת אירועים, אבל לא מהכתובת של העסק. בדקו שבחרתם את המעקב הנכון."
    elif recent:
        status, note = "site_unconfirmed", "מטא מקבלת אירועים, אבל עדיין לא הצלחנו לשייך אותם לאתר שלכם."
    else:
        status, note = "waiting", "לא אישרנו אירועים מהיומיים האחרונים. פתחו את האתר ובדקו שוב אחרי כמה דקות."
    return {"status": status, "note_he": note, "pixel_id": pixel_id, "name": str(info.get("name") or ""),
            "checked_at": now.isoformat(), "last_fired_time": fired.isoformat() if fired else None,
            "website_match": matched, "events": events, "errors": errors,
            "checks": {"recent_events": recent, "website_match": matched,
                       "purchase_event": ("Purchase" in events) if "event" in evidence else None,
                       # These API observations cannot establish delivery quality.
                       "server_delivery": None, "deduplication": None, "purchase_value_currency": None}}


def failure(exc: Exception) -> dict:
    kind = getattr(exc, "kind", "unavailable")
    notes = {"token": "ההרשאה במטא הסתיימה. חברו את החשבון מחדש.",
             "permission": "חסרה גישה לנתון הזה. התחברו עם מנהל החשבון ואשרו קריאת נתונים.",
             "rate_limited": "מטא מגבילה כרגע את הקריאה. נסו שוב בעוד כמה דקות."}
    return {"status": "reconnect" if kind == "token" else "permission" if kind == "permission" else "unavailable",
            "note_he": notes.get(kind, "לא הצלחנו לקרוא את הנתונים ממטא כרגע. נסו שוב מאוחר יותר.")}


def measurement(token: str, extra: dict, website: str, start: str, end: str) -> dict:
    account_id = extra.get("selected_ad_account_id")
    result = {"ads": {"status": "not_selected", "note_he": "אפשר לחבר גם את חשבון הפרסום כדי להבין מה מביאות המודעות."},
              "tracking": {"status": "not_selected", "note_he": "בחרו את המעקב באתר בעמוד החיבורים כדי לבדוק אם הוא עובד."}}
    if account_id:
        try:
            result["ads"] = ads_report(token, account_id, start, end)
        except (meta.GraphError, ValueError) as exc:
            result["ads"] = failure(exc)
    if extra.get("selected_pixel_id"):
        try:
            result["tracking"] = verify_pixel(token, extra["selected_pixel_id"], website)
        except (meta.GraphError, ValueError) as exc:
            result["tracking"] = failure(exc)
    return result
