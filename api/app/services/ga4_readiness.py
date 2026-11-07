"""GA4 authorization is separate from a verified, dated source read."""
from datetime import date, datetime, timedelta
import secrets

from google.api_core.exceptions import PermissionDenied, Unauthenticated
from google.auth.exceptions import RefreshError
from sqlalchemy.orm import Session
from sqlalchemy.exc import InvalidRequestError

from app.models import Integration, PerformanceSnapshot
from app.security import decrypt_secret
from app.services import analysis_jobs, ga4
from app.services.jsonutil import dumps, loads

NOTES = {
    "choose_property": "הגישה לגוגל אושרה. בחרו את האתר שאת הנתונים שלו נקרא.",
    "no_properties": "לא נמצאו אתרים בחשבון הזה. אפשר לבחור חשבון אחר או לבקש גישה ממי שמנהל את האתר.",
    "unchecked": "האתר נבחר. עוד לא בדקנו אם אפשר לקרוא את הנתונים שלו.",
    "reading": "בודקים את נתוני האתר. אפשר להמשיך לעבוד על התוכנית.",
    "ready": "קראנו נתונים מהאתר. הם זמינים בעמוד התוצאות.",
    "empty": "הקריאה הצליחה, אבל לא נמצאה פעילות בתקופה שנבדקה. אפשר להמשיך בתוכנית ולבדוק את התקנת המדידה.",
    "reconnect": "גוגל לא מאפשר כרגע לקרוא את הנתונים. חברו מחדש עם חשבון שיש לו גישה לאתר.",
    "unavailable": "לא הצלחנו לקרוא את הנתונים כרגע. הבחירה נשמרה; אפשר לנסות שוב בלי להתחיל מחדש.",
}


def tokens(item: Integration) -> tuple:
    return decrypt_secret(item.access_token_enc), decrypt_secret(item.refresh_token_enc), item.token_expires_at


def failure(exc: Exception) -> dict:
    if isinstance(exc, ga4.Ga4AccessError) and exc.reason == "analytics_permission_missing":
        return {"status": "reconnect", "note_he": "נשאר לאשר קריאה של נתוני האתר. בחיבור לגוגל, סמנו את ההרשאה לקריאת Google Analytics לפני שממשיכים."}
    reconnect = isinstance(exc, (RefreshError, PermissionDenied, Unauthenticated))
    status = getattr(exc, "readiness_status", None) or ("reconnect" if reconnect else "unavailable")
    return {"status": status, "note_he": NOTES[status]}


def public_state(item: Integration) -> dict:
    extra = loads(item.extra_json, {}) or {}
    state = extra.get("source_readiness") or {}
    if state.get("property_id") == item.external_id and state.get("status") in NOTES:
        if state.get("status") == "reading":
            try:
                started = datetime.fromisoformat(state.get("started_at") or "")
                stale = (datetime.utcnow() - started).total_seconds() > 120
            except (TypeError, ValueError):
                stale = True
            if stale:
                state = {**state, "status": "unavailable", "note_he": NOTES["unavailable"]}
        return {key: state.get(key) for key in (
            "status", "note_he", "property_id", "checked_at", "last_success_at", "period",
        )}
    if item.status == "select_property":
        status = "choose_property" if extra.get("properties") else "no_properties"
    elif item.status == "reconnect":
        status = "reconnect"
    else:
        status = "unchecked"
    return {"status": status, "note_he": NOTES[status], "property_id": item.external_id}


def record(db: Session, item: Integration, status: str, *, report: dict | None = None, request_id: str = "", expected: str | None = None) -> dict | None:
    extra = loads(item.extra_json, {}) or {}
    prior = extra.get("source_readiness") or {}
    if prior.get("property_id") != item.external_id:
        prior = {}
    now = datetime.utcnow().isoformat()
    state = {**prior, "status": status, "note_he": NOTES[status], "property_id": item.external_id}
    if request_id:
        state["request_id"] = request_id
    if status == "reading":
        state["started_at"] = now
    else:
        state["checked_at"] = now
    if report is not None:
        state.update(last_success_at=now, period=report.get("period") or {})
    extra["source_readiness"] = state
    if expected is not None:
        from app.services.search_console import write
        if not write(db, item, expected, extra_json=dumps(extra), status="reconnect" if status == "reconnect" else "connected" if item.external_id else "select_property"):
            return None
        return state
    item.extra_json = dumps(extra)
    item.status = "reconnect" if status == "reconnect" else "connected" if item.external_id else "select_property"
    db.commit()
    return state


def has_activity(report: dict) -> bool:
    rows = [report.get("overview") or {}, *(report.get("landing_pages") or []), *(report.get("campaigns") or [])]
    for row in rows:
        for key in ("sessions", "screenPageViews", "conversions"):
            try:
                if float(row.get(key) or 0) > 0:
                    return True
            except (TypeError, ValueError):
                continue
    return False


def initial_read(db: Session, item: Integration) -> dict:
    """Read once without a model prerequisite; retain the last successful snapshot on failure."""
    property_id, grant, item_id = item.external_id, item.access_token_enc, item.id
    request_id = secrets.token_urlsafe(16)
    record(db, item, "reading", request_id=request_id)
    before = item.extra_json
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=27)
    try:
        report = ga4.fetch_report(*tokens(item), property_id, start.isoformat(), end.isoformat())
        if not isinstance(report, dict) or report.get("property_id") != property_id or not isinstance(report.get("overview"), dict):
            raise RuntimeError("Invalid source response")
    except Exception as exc:
        try:
            db.refresh(item)
        except InvalidRequestError:
            return {"status": "unchecked", "note_he": NOTES["unchecked"]}
        if item.external_id == property_id and item.access_token_enc == grant and item.extra_json == before:
            record(db, item, failure(exc)["status"], expected=before)
        return public_state(item)
    try:
        db.refresh(item)
    except InvalidRequestError:
        return {"status": "unchecked", "note_he": NOTES["unchecked"]}
    if item.external_id != property_id or item.access_token_enc != grant or item.extra_json != before:
        # A newer selection must not be overwritten by the old request's result.
        return public_state(item)
    report["read_at"] = datetime.utcnow().isoformat()
    if record(db, item, "ready" if has_activity(report) else "empty", report=report, expected=before) is None:
        current = db.get(Integration, item_id)
        return public_state(current) if current else {"status": "unchecked", "note_he": NOTES["unchecked"]}
    # No rows is not a measured zero. Do not complete the journey's baseline step
    # or replace dated observations with an empty snapshot.
    if not report.get("overview"):
        return public_state(item)
    previous = db.query(PerformanceSnapshot).filter(
        PerformanceSnapshot.business_id == item.business_id,
    ).order_by(PerformanceSnapshot.created_at.desc(), PerformanceSnapshot.id.desc()).first()
    # The first GA4 read does not fetch Meta. Preserve its existing source window instead
    # of presenting those older numbers as newly refreshed or losing them altogether.
    meta_data = loads(previous.meta_json, {}) if previous else {}
    if meta_data:
        meta_data.setdefault("source_read_at", previous.created_at.isoformat())
        meta_data.setdefault("source_period", {"start": previous.period_start, "end": previous.period_end})
    snap = PerformanceSnapshot(
        business_id=item.business_id, period_start=start.isoformat(), period_end=end.isoformat(),
        ga4_json=dumps(report), meta_json=dumps(meta_data),
        diagnostic_json=dumps({"analysis_status": "pending", "headline": "", "top_content": [],
                               "bottom_content": [], "funnel_issues": [], "metric_highlights": []}),
    )
    db.add(snap)
    db.commit()
    analysis_jobs.enqueue(db, snap)
    return public_state(item)
