"""Independent, business-scoped Search Console grant, selection and dated reads.

Read-only Sites/list and Search Analytics/query. No property creation/verification.
Legacy combined Google grants are copied once, never borrowed after a disconnect.
"""
import hashlib
import re
import math
from datetime import date, datetime, timedelta
from urllib.parse import quote, urlsplit

import httpx
from google.auth.exceptions import RefreshError
from sqlalchemy import update, select
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.models import Business, Integration, User
from app.security import decrypt_secret
from app.services import ga4, keywords
from app.services.jsonutil import dumps, loads

PROVIDER = "search_console"
SCOPES = [keywords.SEARCH_CONSOLE_SCOPE, "openid", "email"]
NOTES = {
    "choose_site": "הגישה לחיפושים בגוגל אושרה. בחרו את האתר של העסק.",
    "no_sites": "האתר לא מופיע בחשבון הזה. אפשר לבחור חשבון גוגל אחר או לבקש גישה ממי שמנהל את האתר.",
    "website_required": "הוסיפו את כתובת האתר של העסק כדי להתאים אליו את נתוני החיפוש.",
    "unchecked": "עוד לא קראנו את נתוני החיפוש של האתר.",
    "reading": "קוראים את החיפושים שבהם האתר מופיע בגוגל.",
    "ready": "קראנו את החיפושים שהביאו אנשים לאתר. אפשר לראות אותם בקידום בגוגל.",
    "empty": "הקריאה הצליחה. אין חיפושים להצגה בתקופה שנבדקה.",
    "permission": "נשאר לאשר קריאה של Search Console בחשבון גוגל שיש לו גישה לאתר.",
    "reconnect": "הגישה לנתוני החיפוש הסתיימה. חברו מחדש את חשבון הגוגל של האתר.",
    "unavailable": "לא הצלחנו לקרוא את נתוני החיפוש כרגע. הבחירה נשמרה; אפשר לנסות שוב.",
}


class AccessError(RuntimeError):
    def __init__(self, status: str):
        super().__init__("Search Console read unavailable")
        self.status = status


def item_for(db: Session, business_id: int) -> Integration | None:
    return db.query(Integration).filter_by(business_id=business_id, provider=PROVIDER).first()


def ensure_legacy(db: Session, business: Business) -> Integration | None:
    item = item_for(db, business.id)
    if item is not None:
        return item  # Includes a disconnected tombstone: never silently re-import.
    old = db.query(Integration).filter_by(business_id=business.id, provider="ga4").first()
    extra = loads(old.extra_json, {}) if old else {}
    if not old or not old.access_token_enc or not old.refresh_token_enc or not keywords.search_console_scope_granted(extra.get("scopes")):
        return None
    item = Integration(business_id=business.id, provider=PROVIDER, status="select_site",
                       access_token_enc=old.access_token_enc, refresh_token_enc=old.refresh_token_enc,
                       token_expires_at=old.token_expires_at, extra_json=dumps({
                           "scopes": extra.get("scopes") or [], "legacy_grant": True,
                           "google_account": extra.get("google_account") or {},
                       }))
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return item_for(db, business.id)  # A parallel first load migrated it already.
    return item


def matching_site(site_url: str, website: str) -> bool:
    """A domain may cover subdomains; URL-prefix grants must cover the actual URL.

    Do not use the legacy parent/child-host fallback: an unrelated subdomain or a
    different path on shared hosting is not this business's property.
    """
    target = urlsplit(website if "://" in website else "https://" + website)
    host = (target.hostname or "").lower().rstrip(".")
    if not host:
        return False
    if site_url.startswith("sc-domain:"):
        domain = site_url.split(":", 1)[1].lower().rstrip(".")
        return bool(domain and (host == domain or host.endswith("." + domain)))
    source = urlsplit(site_url)
    return bool(source.scheme in {"https", "http"} and source.scheme == target.scheme and
                source.netloc.lower() == target.netloc.lower() and
                (target.path or "/").startswith(source.path or "/"))


def _check(response: httpx.Response) -> dict:
    if response.status_code >= 400:
        if response.status_code == 401:
            raise AccessError("reconnect")
        # Disabled APIs and quota exhaustion are not fixed by repeating consent.
        if response.status_code == 403 and not any(reason in response.text for reason in ("SERVICE_DISABLED", "accessNotConfigured", "quotaExceeded", "rateLimitExceeded")):
            raise AccessError("permission")
        raise AccessError("unavailable")
    try:
        payload = response.json()
    except ValueError as exc:
        raise AccessError("unavailable") from exc
    if not isinstance(payload, dict):
        raise AccessError("unavailable")
    return payload


def list_sites(access_token: str, website: str) -> list[dict]:
    payload = _check(httpx.get(keywords.SEARCH_CONSOLE_API + "/sites",
                              headers={"Authorization": "Bearer " + access_token}, timeout=15))
    rows = payload.get("siteEntry", [])
    if not isinstance(rows, list):
        raise AccessError("unavailable")
    return [{"site_url": row["siteUrl"]} for row in rows if isinstance(row, dict) and
            row.get("permissionLevel") in {"siteOwner", "siteFullUser", "siteRestrictedUser"} and
            isinstance(row.get("siteUrl"), str) and matching_site(row["siteUrl"], website)]


def query(access_token: str, site_url: str, website: str = "") -> dict:
    # Final data only; three days allows Google's reporting lag. Both dates inclusive.
    end = date.today() - timedelta(days=3)
    start = end - timedelta(days=27)
    body = {"startDate": start.isoformat(), "endDate": end.isoformat(),
            "dimensions": ["query"], "rowLimit": 100, "type": "web", "dataState": "final"}
    if website:
        # A domain grant may span multiple businesses. Confine this source to
        # the saved business URL, not every page the Google account can access.
        target = urlsplit(website if "://" in website else "https://" + website)
        prefix = f"{target.scheme}://{target.netloc}{target.path.rstrip('/')}"
        body["dimensionFilterGroups"] = [{"filters": [{"dimension": "page", "operator": "includingRegex",
                                                       "expression": "^" + re.escape(prefix) + r"(?:[/?#]|$)"}]}]
    payload = _check(httpx.post(keywords.SEARCH_CONSOLE_API + "/sites/" + quote(site_url, safe="") + "/searchAnalytics/query",
                               headers={"Authorization": "Bearer " + access_token}, timeout=15,
                               json=body))
    raw = payload.get("rows", [])
    if not isinstance(raw, list):
        raise AccessError("unavailable")
    for row in raw:
        try:
            if any(isinstance(row[name], bool) or not math.isfinite(float(row[name])) or float(row[name]) < 0
                   for name in ("clicks", "impressions", "ctr", "position")):
                raise AccessError("unavailable")
        except (KeyError, TypeError, ValueError) as exc:
            raise AccessError("unavailable") from exc
    rows = keywords._parse_search_rows(payload)
    if len(rows) != len(raw):
        raise AccessError("unavailable")
    return {"site_url": site_url, "period": {"start": start.isoformat(), "end": end.isoformat(), "days": 28},
            "queries": rows, "quick_wins": keywords.quick_wins(rows), "limited": len(rows) == 100}


def key(item: Integration, website: str) -> str:
    return hashlib.sha256((item.access_token_enc + "|" + item.external_id + "|" + website).encode()).hexdigest()


def public_state(item: Integration, website: str = "") -> dict:
    extra = loads(item.extra_json, {}) or {}
    state = extra.get("source_readiness") or {}
    if item.status == "disconnected":
        return {"status": "unchecked", "note_he": NOTES["unchecked"]}
    if state.get("key") == key(item, website) and state.get("status") in NOTES:
        if state["status"] == "reading":
            try:
                if (datetime.utcnow() - datetime.fromisoformat(state.get("started_at") or "")).total_seconds() > 120:
                    state = {**state, "status": "unavailable", "note_he": NOTES["unavailable"]}
            except (TypeError, ValueError):
                state = {**state, "status": "unavailable", "note_he": NOTES["unavailable"]}
        return {k: state.get(k) for k in ("status", "note_he", "checked_at", "last_success_at", "period")}
    status = "website_required" if not website else "choose_site" if item.status == "select_site" else "unchecked"
    if website and item.external_id and not matching_site(item.external_id, website):
        status = "no_sites"
    return {"status": status, "note_he": NOTES[status]}


def public_data(item: Integration, website: str) -> dict | None:
    extra = loads(item.extra_json, {}) or {}
    data = extra.get("data") or {}
    if item.status == "disconnected" or data.get("site_url") != item.external_id or data.get("website_url") != website or not matching_site(item.external_id, website):
        return None
    return data or None


def write(db: Session, item: Integration, before: str, *, owner: tuple[int, int] | None = None, **values) -> bool:
    statement = update(Integration).where(Integration.id == item.id, Integration.extra_json == before)
    if owner is not None:
        # Consent can finish after a slow identity-certificate check. Ownership,
        # session generation and suspension must still hold at the actual write.
        authorized = select(User.id).join(Business, Business.user_id == User.id).where(
            User.id == owner[0], User.session_epoch == owner[1], User.suspended_at.is_(None),
            Business.id == Integration.business_id,
        ).correlate(Integration).exists()
        statement = statement.where(authorized)
    changed = db.execute(statement.values(**values), execution_options={"synchronize_session": False}).rowcount
    db.commit()
    db.expire_all()
    return bool(changed)


def read(db: Session, item: Integration, business: Business, *, selected_site: str | None = None) -> dict:
    """Bounded read. Old responses cannot replace a newer grant, selection or disconnect."""
    item_id, business_id = item.id, item.business_id
    before = item.extra_json
    extra = loads(before, {}) or {}
    website = business.website_url or ""
    prior = extra.get("source_readiness") or {}
    state_key = key(item, website)
    state = {**(prior if prior.get("key") == state_key else {}), "key": state_key,
             "status": "reading", "note_he": NOTES["reading"], "started_at": datetime.utcnow().isoformat()}
    try:
        if not website:
            raise AccessError("website_required")
        if not item.access_token_enc or not item.refresh_token_enc:
            raise AccessError("reconnect")
        if not keywords.search_console_scope_granted(extra.get("scopes")):
            raise AccessError("permission")
        token = ga4.fresh_access_token(decrypt_secret(item.access_token_enc), decrypt_secret(item.refresh_token_enc), item.token_expires_at)
        sites = list_sites(token, website)
        extra["sites"] = sites
        target = selected_site if selected_site is not None else item.external_id
        if not sites or target and (not matching_site(target, website) or not any(s["site_url"] == target for s in sites)):
            raise AccessError("no_sites")
        if not target:
            raise AccessError("choose_site")
        data = query(token, target, website)
        now = datetime.utcnow().isoformat()
        data["read_at"] = now
        data["website_url"] = website
        extra["data"] = data
        state.update(status="ready" if data["queries"] else "empty", last_success_at=now, period=data["period"])
        values = {"external_id": target, "display_name": target, "status": "connected"}
        # A newly selected site has a different identity from the request's old one.
        state["key"] = hashlib.sha256((item.access_token_enc + "|" + target + "|" + website).encode()).hexdigest()
    except Exception as exc:
        status = exc.status if isinstance(exc, AccessError) else "reconnect" if isinstance(exc, (RefreshError, ValueError)) else "unavailable"
        state["status"] = status
        values = {}
        if status == "reconnect":
            values["status"] = "reconnect"
    state.update(note_he=NOTES[state["status"]], checked_at=datetime.utcnow().isoformat())
    extra["source_readiness"] = state
    # Website changes and deleted accounts also supersede this request.
    db.expire_all()
    current = db.get(Business, business_id)
    current_item = db.get(Integration, item_id)
    if not current or not current_item:
        return {"status": "unchecked", "note_he": NOTES["unchecked"]}
    if current.website_url != website:
        return public_state(current_item, current.website_url)
    write(db, current_item, before, extra_json=dumps(extra), updated_at=datetime.utcnow(), **values)
    current_item = item_for(db, business_id)
    return public_state(current_item, website) if current_item else {"status": "unchecked", "note_he": NOTES["unchecked"]}


def disconnect(db: Session, item: Integration) -> None:
    # Google's remote revocation would also invalidate the independently working
    # Analytics grant for the same client/account. Remove this source locally only.
    item.status = "disconnected"
    item.external_id = item.display_name = item.access_token_enc = item.refresh_token_enc = ""
    item.token_expires_at = None
    item.extra_json = "{}"
    db.commit()
