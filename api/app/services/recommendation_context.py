"""Dated observations and review destinations are server-owned, never model-owned.

Recommendations are proposals. Reading one must not edit a plan, generate assets,
approve a post, or pretend that a proposed experiment has already succeeded.
"""
import hashlib
import math
from datetime import date, datetime, timezone
from urllib.parse import urlencode

from app.services.jsonutil import loads
from app.services.plan_editing import revision as plan_revision
from app.services import service_results


def _dict(value) -> dict:
    return value if isinstance(value, dict) else {}


def _text(value, limit=500) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def _number(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
        return number if math.isfinite(number) and number >= 0 else None
    except (TypeError, ValueError):
        return None


def snapshot_view(snap) -> dict:
    if snap is None:
        return {}
    return {"id": snap.id, "period_start": snap.period_start, "period_end": snap.period_end,
            "created_at": snap.created_at.isoformat(), "ga4": loads(snap.ga4_json, {}),
            "meta": loads(snap.meta_json, {}), "diagnostic": loads(snap.diagnostic_json, {})}


def prepare(business, plan: dict, snapshot: dict) -> tuple[dict, dict, dict]:
    """Keep each source's own window, including Meta retained by a GA-only read."""
    ga = _dict(snapshot.get("ga4"))
    meta = _dict(snapshot.get("meta"))
    selected = next((item.external_id for item in business.integrations if item.provider == "ga4"), "")
    wrong_site = bool(selected and ga.get("property_id") and ga["property_id"] != selected)
    if wrong_site:
        ga = {}
    fallback = {"start": snapshot.get("period_start", ""), "end": snapshot.get("period_end", "")}
    sources, observations, limits = [], [], []
    meta_item = next((item for item in business.integrations if item.provider == "meta"), None)
    from app.services.meta_readiness import selection
    recorded_selection = _dict(meta.get("source_selection"))
    wrong_meta = bool(meta_item and recorded_selection and recorded_selection != selection(meta_item))
    if wrong_meta:
        meta = {}
        limits.append("נתוני פייסבוק ואינסטגרם שנשמרו שייכים לבחירה קודמת. קראו את החשבון שנבחר עכשיו.")
    selected_ads = _dict(loads(meta_item.extra_json, {})).get("selected_ad_account_id") if meta_item else ""
    old_ads = _dict(meta.get("ads")).get("account_id")
    wrong_ads = bool(selected_ads and old_ads and str(selected_ads).removeprefix("act_") != str(old_ads).removeprefix("act_"))
    if wrong_ads:
        meta = {**meta, "ads": {}}
        limits.append("דיווח המודעות שנשמר שייך לחשבון אחר. קראו את נתוני החשבון שנבחר עכשיו.")

    def source(key, label, data, period, read_at):
        provider = "ga4" if key == "ga4" else "meta"
        connected = any(item.provider == provider and item.status == "connected" for item in business.integrations)
        sources.append({"key": key, "label": label, "status": "historical" if data and not connected else
                        "available" if data else "missing", "period": _dict(period), "read_at": read_at or ""})
        if data and not connected:
            limits.append(f"{label}: אלה נתונים שנשמרו בעבר; החיבור אינו פעיל כרגע.")

    overview = _dict(ga.get("overview"))
    source("ga4", "נתוני האתר", bool(overview), ga.get("period") or fallback, ga.get("read_at") or snapshot.get("created_at"))
    for metric, label in (("sessions", "כניסות לאתר"), ("conversions", "פעולות חשובות באתר")):
        value = _number(overview.get(metric))
        if value is not None:
            observations.append({"source": "ga4", "metric": metric, "label": label, "value": value})
    if "conversions" in overview:
        limits.append("פעולות חשובות הן אירועים שהוגדרו בגוגל. הן אינן בהכרח פניות או הזמנות; לחיצה על וואטסאפ אינה הודעה שנשלחה.")
    if not overview:
        limits.append("נתוני האתר שנשמרו שייכים לאתר אחר. קראו את נתוני האתר שנבחר עכשיו." if wrong_site else
                      "אין נתוני אתר שמאפשרים לקבוע כמה פניות או הזמנות התקבלו. נתון חסר אינו אפס.")

    ads = _dict(meta.get("ads"))
    ad_values = _dict(ads.get("overview")) if ads.get("status") == "available" else {}
    source("meta_ads", "דיווח המודעות של מטא", bool(ad_values), ads.get("period") or meta.get("source_period") or fallback,
           _dict(_dict(meta.get("source_reads")).get("ads")).get("read_at") or meta.get("source_read_at") or snapshot.get("created_at"))
    clicks = _number(ad_values.get("link_clicks"))
    if clicks is not None:
        observations.append({"source": "meta_ads", "metric": "link_clicks", "label": "לחיצות על קישור במודעות", "value": clicks})
    if ad_values:
        limits.append("דיווח המודעות הוא של מטא. לחיצה אינה לקוח, ורכישות שמטא שייכה למודעות אינן הזמנות שאימתנו. לא מחברים אותן לספירה של גוגל.")
    social = _dict(meta.get("account"))
    window = _dict(_dict(_dict(social.get("windows")).get("28")).get("current"))
    source("meta_social", "נתוני אינסטגרם ופייסבוק", bool(meta.get("posts") or window),
           {"start": window.get("start", ""), "end": window.get("end", "")} if window else meta.get("source_period") or fallback,
           _dict(_dict(meta.get("source_reads")).get("social")).get("read_at") or meta.get("source_read_at") or snapshot.get("created_at"))
    reach = _number(_dict(window.get("values")).get("reach"))
    if reach is not None:
        observations.append({"source": "meta_social", "metric": "reach", "label": "אנשים שראו באינסטגרם", "value": reach})
    service = service_results.evidence(business)
    report = service.get("report") if service else None
    if service:
        limits.extend(service["limits"])
        sources.append({"key": "service_owner", "label": "דיווח שלכם על פניות ולקוחות", "status": "available" if report else "missing",
                        "period": report["period"] if report else {}, "read_at": report["updated_at"] if report else ""})
        if report:
            for metric, label in (("inquiries", "פניות שהתקבלו"), ("suitable", "פניות מתאימות"), ("clients_won", "לקוחות חדשים")):
                if report[metric] is not None:
                    observations.append({"source": "service_owner", "metric": metric, "label": label, "value": report[metric]})
    limits.append("הנתונים האלה אינם מוכיחים למה משהו קרה. ההצעה היא ניסוי קטן, והצלחה נבדקת רק במה שאפשר למדוד.")
    basis = {"version": 1, "snapshot_id": snapshot.get("id"), "plan_id": plan.get("id"), "plan_revision": plan_revision(business),
             "sources": [_freshness(source) for source in sources], "observations": observations, "limits": limits,
             "excluded_sources": wrong_site or wrong_ads or wrong_meta,
             "service_fingerprint": service_results.fingerprint(business),
             "selection": {"ga4": selected, "meta_ads": selected_ads or ""}}
    return ga, meta, basis


def _posts(plan: dict) -> list[dict]:
    posts = _dict(plan.get("roadmap")).get("posts")
    return [_dict(post) for post in posts] if isinstance(posts, list) else []


def for_model(plan: dict) -> dict:
    """Plan intent and stable UIDs, without undated/old per-post result claims.

    The selected, dated snapshot is this analysis's evidence. The owner can still
    read historical results in the plan/editor; nothing is deleted or rewritten.
    """
    roadmap = _dict(plan.get("roadmap"))
    posts = [{key: value for key, value in post.items() if key not in ("results", "learning")} for post in _posts(plan)]
    return {**{key: value for key, value in plan.items() if key != "hypothesis_review"}, "roadmap": {**roadmap, "posts": posts}}


def _revision(post: dict) -> str:
    # Detect edits, including a regenerated post that retained its UID. No content in URLs.
    return hashlib.sha256(repr([post.get(key) for key in ("title", "caption", "cta")]).encode()).hexdigest()


def bind(model_result, basis: dict, plan: dict) -> dict:
    result = _dict(model_result)
    rows = result.get("suggestions")
    suggestions = []
    for row in (rows[:3] if isinstance(rows, list) else []):
        if not isinstance(row, dict) or not _text(row.get("title")) or not _text(row.get("action")):
            continue
        kind = row.get("action_kind") if row.get("action_kind") in ("post", "plan", "measurement", "website") else "plan"
        uid = _text(row.get("post_uid"), 160)
        matches = [post for post in _posts(plan) if post.get("uid") == uid] if uid else []
        valid_post = kind == "post" and len(matches) == 1
        suggestions.append({**{key: _text(row.get(key)) for key in ("title", "action", "evidence", "target", "hypothesis", "success_check")},
                            "priority": row.get("priority") if row.get("priority") in ("high", "medium", "low") else "medium",
                            "action_kind": kind, "post_uid": uid if valid_post else "",
                            "target_valid": kind != "post" or valid_post,
                            "post_revision": _revision(matches[0]) if valid_post else ""})
    return {"week_summary": _text(result.get("week_summary")), "suggestions": suggestions, "basis": basis}


def _freshness(source: dict) -> dict:
    try:
        read = datetime.fromisoformat(source.get("read_at", "").replace("Z", "+00:00"))
        age = max(0, (datetime.now(timezone.utc).date() - read.date()).days)
    except (ValueError, TypeError, AttributeError):
        age = None
    try:
        end_age = max(0, (date.today() - date.fromisoformat(_dict(source.get("period")).get("end", ""))).days)
    except (ValueError, TypeError):
        end_age = None
    return {**source, "age_days": age, "stale": age is None or age > 7 or end_age is None or end_age > 7}


def serialize(rec, plan: dict, business=None) -> dict:
    stored = _dict(loads(rec.suggestions_json, {}))
    basis = _dict(stored.get("basis"))
    provenance = basis.get("version") == 1
    same_id = bool(plan.get("id")) and basis.get("plan_id") == plan["id"]
    current_revision = plan_revision(business) if business is not None else plan.get("plan_revision", 0)
    same_plan = provenance and same_id and basis.get("plan_revision", 0) == current_revision
    same_service = business is None or not service_results.enabled(business) or basis.get("service_fingerprint", "") == service_results.fingerprint(business)
    rows = stored.get("suggestions")
    items = []
    for row in (rows[:3] if isinstance(rows, list) else []):
        if not isinstance(row, dict):
            continue
        index = len(items)
        query = {"recommendation": rec.id, "suggestion": index}
        kind, status, href = "plan", "ready", "/strategy?" + urlencode(query)
        label, note = "לבדוק את ההצעה בתוכנית", "ההצעה לא משנה את התוכנית. בודקים אותה לפני שמחליטים מה לערוך."
        if not provenance:
            status, note = "legacy", "זו המלצה קודמת ללא תיעוד של מקורות הנתונים. בדקו את התוכנית והנתונים העדכניים לפני שינוי."
        elif not same_plan:
            status, note = "stale", ("התוכנית נערכה מאז ההמלצה. בדקו אם ההצעה מתאימה לכיוון המעודכן." if same_id else
                                     "התוכנית התחלפה מאז ההמלצה. בדקו מה עדיין מתאים לתוכנית הנוכחית.")
        elif not same_service:
            status, note = "stale", "הדיווח שלכם או פרטי העסק השתנו מאז ההמלצה. הכינו הצעה עדכנית לפני שינוי בתוכנית."
        elif row.get("action_kind") == "measurement":
            kind, href, label = "measurement", "/integrations", "לבדוק את החיבורים"
            note = "בדיקת חיבור אינה מאשרת שהאירועים באתר מודדים פניות או הזמנות."
        elif row.get("action_kind") == "website":
            kind, label = "website", "לבדוק את שינוי האתר בתוכנית"
            note = "נבדוק את ההצעה כאן; את האתר מעדכנים בנפרד, בעצמכם או בעזרת מי שמנהל אותו."
        elif row.get("action_kind") == "post":
            matches = [(i, post) for i, post in enumerate(_posts(plan)) if row.get("post_uid") and post.get("uid") == row["post_uid"]]
            if len(matches) == 1 and row.get("target_valid") is True:
                post_index, post = matches[0]
                if post.get("published_at") or post.get("published_url"):
                    status, label, note = "published", "לבדוק את ההצעה לפוסט הבא", "הפוסט כבר פורסם. בדקו איך להשתמש במה שלמדנו בפוסט הבא בתוכנית."
                else:
                    kind, label = "post", "לבדוק את ההצעה בפוסט"
                    href = "/posts?" + urlencode({"post": post_index, "plan": plan["id"], "post_uid": post["uid"], **query})
                    note = "נפתח את הפוסט כפי שהוא. ההצעה לא נערכת ולא מתפרסמת אוטומטית."
                    if row.get("post_revision") != _revision(post):
                        status, note = "changed", "הפוסט נערך מאז ההמלצה. בדקו את הנוסח העדכני לפני שינוי נוסף."
            else:
                status, note = "missing", "הפוסט שהוצע אינו מזוהה בתוכנית הנוכחית. בדקו את ההצעה בתוכנית ובחרו פוסט מתאים."
        items.append({**{key: _text(row.get(key)) for key in ("title", "action", "evidence", "target", "hypothesis", "success_check")},
                      "priority": row.get("priority") if row.get("priority") in ("high", "medium", "low") else "medium",
                      "review": {"kind": kind, "status": status, "href": href, "label": label, "note_he": note,
                                 "plan_id": plan.get("id"), "post_uid": row.get("post_uid") if kind == "post" else None}})
    public_basis = {**basis, "sources": [_freshness(source) for source in basis.get("sources", []) if isinstance(source, dict)]} if provenance else None
    if public_basis and business is not None:
        current = {item.provider: item for item in business.integrations}
        for source in public_basis["sources"]:
            if source.get("key") == "service_owner":
                if not same_service:
                    source.update(status="historical", stale=True)
                continue
            provider = "ga4" if source.get("key") == "ga4" else "meta"
            item = current.get(provider)
            if source.get("status") == "missing":
                continue
            if not item or item.status != "connected":
                source.update(status="historical", stale=True)
            elif source.get("key") in ("ga4", "meta_ads"):
                chosen = item.external_id if provider == "ga4" else _dict(loads(item.extra_json, {})).get("selected_ad_account_id", "")
                recorded = _dict(basis.get("selection")).get(source["key"], "")
                if recorded and recorded != chosen:
                    source.update(status="different_selection", stale=True)
    return {"available": True, "id": rec.id, "week_of": rec.week_of, "created_at": rec.created_at.isoformat(),
            "suggestions": {"week_summary": _text(stored.get("week_summary")), "suggestions": items, "basis": public_basis}}
