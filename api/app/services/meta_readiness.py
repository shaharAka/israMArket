"""A confirmed Meta selection is separate from a dated, model-free source read."""
import hashlib
import logging
import secrets
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session
from sqlalchemy.exc import InvalidRequestError

from app.models import Integration, PerformanceSnapshot
from app.security import decrypt_page_token, decrypt_secret
from app.services import analysis_jobs, instagram_signal, meta, meta_marketing
from app.services.jsonutil import dumps, loads

NOTES = {
    "choose_assets": "הגישה אושרה. בחרו את הדף או את חשבון הפרסום של העסק.",
    "no_assets": "לא נמצאו חשבונות שאושרו. חברו שוב עם מי שמנהל את הדף או את הפרסום.",
    "unchecked": "החשבון נבחר. עוד לא קראנו את הנתונים שלו.",
    "reading": "קוראים את נתוני פייסבוק ואינסטגרם. אפשר להמשיך לעבוד בתוכנית.",
    "ready": "קראנו נתונים מהחשבון שנבחר. הם זמינים בתוצאות.",
    "partial": "חלק מהנתונים נקראו. יש חיבור שעדיין צריך לבדוק; הפרטים מופיעים כאן.",
    "empty": "הקריאה הושלמה, אבל לא חזרה פעילות למדידה. אפשר להמשיך בתוכנית ולבדוק שוב אחרי פרסום.",
    "reconnect": "הגישה בפייסבוק הסתיימה. חברו מחדש עם החשבון שמנהל את העסק.",
    "permission": "חסרה גישה לנתונים. חברו שוב עם מנהל העסק ואשרו את הדף או את חשבון הפרסום המתאים.",
    "link_instagram": "הדף נשמר, אבל לא נמצא אינסטגרם מקצועי שמקושר אליו. כדי לקרוא את נתוני הפוסטים במסלול הזה, קשרו אותו לדף בפייסבוק וחברו שוב כאן.",
    "unavailable": "לא הצלחנו לקרוא כרגע. הבחירה והנתונים הקודמים נשמרו; אפשר לנסות שוב.",
}
SOCIAL_KEYS = ("page", "instagram_id", "posts", "account", "graph_version", "metrics_requested", "metric_failures")
logger = logging.getLogger(__name__)


def selection(item: Integration) -> dict:
    extra = loads(item.extra_json, {}) or {}
    return {"page_id": extra.get("selected_page_id") or (item.external_id if not item.external_id.startswith("act_") else ""),
            "instagram_id": extra.get("selected_instagram_id") or "",
            "ad_account_id": extra.get("selected_ad_account_id") or "", "pixel_id": extra.get("selected_pixel_id") or ""}


def key(item: Integration) -> str:
    extra = loads(item.extra_json, {}) or {}
    # A new grant, selection or website must invalidate an old read. The digest stays private.
    website = item.business.website_url if selection(item)["pixel_id"] else ""
    return hashlib.sha256(dumps([selection(item), item.access_token_enc, extra.get("page_tokens"), website]).encode()).hexdigest()


def public_state(item: Integration) -> dict:
    extra = loads(item.extra_json, {}) or {}
    state = extra.get("source_readiness") or {}
    if state.get("selection_key") == key(item) and state.get("status") in NOTES:
        if state["status"] == "reading":
            try:
                interrupted = (datetime.utcnow() - datetime.fromisoformat(state["started_at"])).total_seconds() > 300
            except (KeyError, TypeError, ValueError):
                interrupted = True
            if interrupted:
                state = {**state, "status": "unavailable", "note_he": NOTES["unavailable"]}
        return {k: state.get(k) for k in ("status", "note_he", "selection", "checked_at", "last_success_at", "period", "sections")}
    if item.status in {"select_assets", "select_page"}:
        status = "choose_assets" if extra.get("pages") or extra.get("ad_accounts") else "no_assets"
    elif item.status == "reconnect":
        status = "reconnect"
    else:
        status = "unchecked"
    return {"status": status, "note_he": NOTES[status], "selection": selection(item)}


def failure(exc: Exception) -> dict:
    # Existing social helpers wrap GraphError: preserve its recovery class, never its text.
    cause = exc
    for _ in range(4):
        if isinstance(cause, meta.GraphError):
            return meta_marketing.failure(cause)
        if cause.__cause__ is None:
            break
        cause = cause.__cause__
    return {"status": "unavailable", "note_he": NOTES["unavailable"]}


def _record(db, item, state):
    extra = loads(item.extra_json, {}) or {}
    extra["source_readiness"] = state
    item.extra_json = dumps(extra)
    db.commit()


def aggregate(sections: dict) -> str:
    data = [sections[k] for k in ("social", "stories", "ads") if k in sections]
    usable = [row for row in data if row["status"] in {"ready", "empty"}]
    problems = [row for row in sections.values() if row.get("incomplete") or row["status"] not in {"ready", "empty", "receiving"}]
    if usable:
        return "partial" if problems else "ready" if any(row["status"] == "ready" for row in usable) else "empty"
    for status in ("reconnect", "permission", "link_instagram", "unavailable"):
        if any(row["status"] == status for row in data):
            return status
    return "empty"


def fetch(item: Integration, website: str, start: str, end: str) -> tuple[dict, dict]:
    chosen = selection(item)
    extra = loads(item.extra_json, {}) or {}
    report, sections = {}, {}
    now = datetime.utcnow().isoformat()
    if chosen["page_id"]:
        if not chosen["instagram_id"]:
            sections["social"] = {"status": "link_instagram", "note_he": NOTES["link_instagram"]}
        else:
            try:
                token = decrypt_page_token(extra, chosen["page_id"])
                if not token:
                    raise meta.GraphError("missing Page grant", kind="token")
                social = meta.fetch_insights(token, chosen["instagram_id"], chosen["page_id"])
                if not isinstance(social, dict) or not isinstance(social.get("posts"), list):
                    raise ValueError("Invalid social report")
                # The account helper tolerates individual missing metrics; unavailable is not zero.
                account_missing = False
                try:
                    social["account"] = meta.account_overview(token, chosen["instagram_id"])
                except Exception:
                    # Summary failure must not discard accessible per-post figures.
                    logger.error("Instagram account summary unavailable for business %s", item.business_id)
                    social["account"] = {"windows": {}, "followers_count": None, "errors": {"account": meta.MISSING_METRIC_HE}}
                    account_missing = True
                account_failure = social["account"].get("stopped")
                for post in social["posts"]:
                    post["insight_errors"] = {name: meta.MISSING_METRIC_HE for name in post.get("insight_errors", {})}
                report.update(social)
                values = [social.get("page", {}).get("fan_count"), social["account"].get("followers_count")]
                values.extend(value for post in social["posts"] for value in (post.get("like_count"), post.get("comments_count"), *post.get("insights", {}).values()))
                values.extend(value for window in social["account"].get("windows", {}).values() for value in window.get("current", {}).get("values", {}).values())
                active = any((meta_marketing.number(value) or 0) > 0 for value in values)
                sections["social"] = {"status": "ready" if active else "empty", "note_he": "קראנו את הנתונים הזמינים של החשבון והפוסטים. נתון שלא הוחזר נשאר לא נמדד.", "read_at": now}
                if account_failure:
                    recovery = failure(meta.GraphError("Account read stopped", kind=account_failure))
                    sections["social"].update(incomplete=True, recovery_status=recovery["status"], note_he="נתוני הפוסטים נשמרו. " + recovery["note_he"])
                elif account_missing:
                    sections["social"].update(incomplete=True, note_he="קראנו את נתוני הפוסטים, אבל סיכום החשבון לא התקבל. אפשר לנסות לקרוא שוב.")
            except Exception as exc:
                for name in SOCIAL_KEYS:
                    report.pop(name, None)
                sections["social"] = failure(exc)
                report["social_error"] = sections["social"]
    if chosen["instagram_id"] and meta.STORY_SCOPES.issubset(set(extra.get("scopes") or [])):
        try:
            stories = meta.fetch_stories(decrypt_secret(item.access_token_enc), chosen["instagram_id"])
            report["stories"] = stories
            story_status = stories.get("status")
            sections["stories"] = {"status": "ready" if stories.get("posts") else "empty", "read_at": stories.get("read_at")}
            if story_status not in {"ready", "empty"}:
                recovery = failure(meta.GraphError("Story read incomplete", kind=stories.get("failure") or story_status))
                sections["stories"] = ({**sections["stories"], "incomplete": True, "recovery_status": recovery["status"], "note_he": recovery["note_he"]}
                                       if stories.get("posts") else {**recovery, "incomplete": True})
        except Exception as exc:
            sections["stories"] = failure(exc)
    try:
        token = decrypt_secret(item.access_token_enc) if chosen["ad_account_id"] or chosen["pixel_id"] else ""
        measured = meta_marketing.measurement(token, extra, website, start, end)
    except Exception as exc:
        measured = {name: failure(exc) for name in ("ads", "tracking")}
    for name, selected in (("ads", chosen["ad_account_id"]), ("tracking", chosen["pixel_id"])):
        if not selected:
            continue
        value = measured.get(name) or failure(ValueError("Missing source response"))
        status = value.get("status")
        if name == "ads" and status in {"available", "no_activity"}:
            active = any((meta_marketing.number(v) or 0) > 0 for k, v in value.get("overview", {}).items() if k not in {"id", "name", "currency"})
            status = "ready" if active else "empty"
        sections[name] = {"status": status, "note_he": value.get("note_he") or "", "checked_at": now}
        if status in {"ready", "empty", "receiving", "waiting", "wrong_site", "site_unconfirmed"}:
            sections[name]["read_at"] = now
        report[name] = value
    report.update(source_read_at=now, source_period={"start": start, "end": end}, source_selection=chosen)
    return report, sections


def retain_sections(report: dict, sections: dict, previous: PerformanceSnapshot | None) -> dict:
    """Keep matching older evidence with its date; never import another selected account."""
    older = (loads(previous.meta_json, {}) or {}) if previous else {}
    chosen = report["source_selection"]
    stamps = dict(report.get("source_reads") or {})
    for name, row in sections.items():
        if row["status"] in {"ready", "empty", "receiving", "waiting", "wrong_site", "site_unconfirmed"}:
            stamps[name] = ({"read_at": (report.get("stories") or {}).get("read_at") or report["source_read_at"], "scope": "cumulative", "period": None}
                            if name == "stories" else {"read_at": report["source_read_at"], "period": report["source_period"]})
            continue
        same = (name == "social" and bool(chosen["instagram_id"]) and older.get("instagram_id") == chosen["instagram_id"]) or (
            name == "ads" and bool(chosen["ad_account_id"]) and str((older.get("ads") or {}).get("account_id", "")).removeprefix("act_") == chosen["ad_account_id"].removeprefix("act_"))
        if not same:
            continue
        if name == "social":
            report.update({k: older[k] for k in SOCIAL_KEYS if k in older})
        else:
            report[name] = older[name]
        stamps[name] = (older.get("source_reads") or {}).get(name) or {"read_at": older.get("source_read_at") or previous.created_at.isoformat(), "period": older.get("source_period") or {"start": previous.period_start, "end": previous.period_end}}
        row["retained_at"] = stamps[name]["read_at"]
    report["source_reads"] = stamps
    return report


def has_observations(report: dict) -> bool:
    values = [(report.get("page") or {}).get("fan_count"), (report.get("account") or {}).get("followers_count")]
    values.extend(value for post in (report.get("stories") or {}).get("posts", []) for value in post.get("insights", {}).values())
    values.extend(value for post in report.get("posts", []) for value in (post.get("like_count"), post.get("comments_count"), *post.get("insights", {}).values()))
    values.extend(value for window in (report.get("account") or {}).get("windows", {}).values() for value in window.get("current", {}).get("values", {}).values())
    values.extend(value for metric, value in (report.get("ads") or {}).get("overview", {}).items() if metric not in {"id", "name", "currency"})
    return any(meta_marketing.number(value) is not None for value in values)


def read(db: Session, item: Integration, website: str, start: str, end: str) -> dict | None:
    previous_state = loads(item.extra_json, {}).get("source_readiness") or {}
    selection_key, request_id = key(item), secrets.token_urlsafe(16)
    state = {**(previous_state if previous_state.get("selection_key") == selection_key else {}), "status": "reading", "note_he": NOTES["reading"], "selection_key": selection_key,
             "selection": selection(item), "request_id": request_id, "started_at": datetime.utcnow().isoformat()}
    _record(db, item, state)
    report, sections = fetch(item, website, start, end)
    try:
        db.refresh(item)
    except InvalidRequestError:
        return None  # disconnected while the provider request was in flight
    if key(item) != selection_key or loads(item.extra_json, {}).get("source_readiness", {}).get("request_id") != request_id:
        return None  # a newer selection, grant or request won; never overwrite it
    prior = db.query(PerformanceSnapshot).filter_by(business_id=item.business_id).order_by(PerformanceSnapshot.created_at.desc(), PerformanceSnapshot.id.desc()).first()
    report = retain_sections(report, sections, prior)
    status = aggregate(sections)
    state.update(status=status, note_he=NOTES[status], sections=sections, checked_at=datetime.utcnow().isoformat())
    if any(row["status"] in {"ready", "empty"} for name, row in sections.items() if name in {"social", "stories", "ads"}):
        state.update(last_success_at=report["source_read_at"], period=report["source_period"])
    extra = loads(item.extra_json, {}) or {}
    if "tracking" in report and sections.get("tracking", {}).get("read_at"):
        extra["pixel_verification"] = report["tracking"]
        extra["pixel_verification_key"] = selection_key
        item.extra_json = dumps(extra)
    _record(db, item, state)
    return report


def media_for_storage(report: dict) -> dict:
    """A successful Story read must not restamp a retained, failed feed read."""
    reads = report.get("source_reads") or {}
    fresh_social = not reads or (reads.get("social") or {}).get("read_at") == report.get("source_read_at")
    return report if fresh_social else {**report, "posts": []}


def initial_read(db: Session, item: Integration, website: str) -> dict | None:
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=27)
    report = read(db, item, website, start.isoformat(), end.isoformat())
    if report is None:
        return None
    state = public_state(item)
    if not report or not has_observations(report) or not any(row["status"] in {"ready", "empty"} for name, row in (state.get("sections") or {}).items() if name in {"social", "stories", "ads"}):
        return state
    # Persist new observations before any analysis. Preserve the site's own read date/window.
    previous = db.query(PerformanceSnapshot).filter_by(business_id=item.business_id).order_by(PerformanceSnapshot.created_at.desc(), PerformanceSnapshot.id.desc()).first()
    ga4_data = loads(previous.ga4_json, {}) if previous else {}
    if ga4_data:
        ga4_data.setdefault("read_at", previous.created_at.isoformat())
        ga4_data.setdefault("period", {"start": previous.period_start, "end": previous.period_end})
    if (report.get("source_reads", {}).get("social") or {}).get("read_at") == report["source_read_at"] or (report.get("stories") or {}).get("posts"):
        instagram_signal.store_media(db, item.business_id, media_for_storage(report))
    snap = PerformanceSnapshot(business_id=item.business_id, period_start=start.isoformat(), period_end=end.isoformat(),
           ga4_json=dumps(ga4_data), meta_json=dumps(meta.snapshot_view(report)), diagnostic_json=dumps({"analysis_status": "pending", "headline": "", "top_content": [], "bottom_content": [], "funnel_issues": [], "metric_highlights": []}))
    db.add(snap)
    db.commit()
    analysis_jobs.enqueue(db, snap)
    return public_state(item)


def capture_stories(db: Session, item: Integration) -> dict | None:
    """Hourly model-free capture; the same selection/grant race guard as first read."""
    chosen, selection_key = selection(item), key(item)
    extra = loads(item.extra_json, {}) or {}
    if item.status != "connected" or not chosen["instagram_id"] or not meta.STORY_SCOPES.issubset(set(extra.get("scopes") or [])):
        return None
    report = meta.fetch_stories(decrypt_secret(item.access_token_enc), chosen["instagram_id"])
    try:
        db.refresh(item)
    except InvalidRequestError:
        return None
    if item.status != "connected" or key(item) != selection_key:
        return None
    instagram_signal.store_media(db, item.business_id, {"instagram_id": chosen["instagram_id"], "stories": report})
    extra = loads(item.extra_json, {}) or {}
    extra["story_capture"] = {"selection_key": selection_key, "read_at": report["read_at"],
                              "status": report["status"], "limited": report.get("limited", False)}
    item.extra_json = dumps(extra)
    db.commit()
    from app.services import connected_posts
    connected_posts.refresh_results(db, item.business, meta_data={"instagram_id": chosen["instagram_id"], "stories": report}, phrase=False)
    db.commit()
    return report
