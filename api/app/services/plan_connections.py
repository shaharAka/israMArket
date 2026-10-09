"""Saved-plan requirements and verified connection progress, shared by both guides.

Only stored readiness is read: no provider calls, model calls or assumed consent.
"""
from app.services import journey

META_KEYS = {"meta_business", "instagram_insights", "facebook_insights", "meta_pixel"}


def keys(facts) -> set[str] | None:
    raw = (facts.quarter_plan or {}).get("integrations")
    # The current plan can change after the signup checklist was saved.
    if not isinstance(raw, list):
        raw = facts.stored.get("integrations_checklist")
    if not isinstance(raw, list):
        return None
    return {item["key"] for item in raw if isinstance(item, dict) and isinstance(item.get("key"), str)}


def needed(facts, provider: str) -> bool:
    required = keys(facts)
    if required is None:
        return provider != "ga4" or facts.business is None or bool(facts.website)
    return bool(required & META_KEYS) if provider == "meta" else "ga4" in required


def _read(section: dict, statuses: set[str]) -> bool:
    return bool(isinstance(section, dict) and section.get("status") in statuses and not section.get("incomplete") and
                journey.parse_time(section.get("read_at") or section.get("last_success_at")))


def state(facts, provider: str, *, available: bool = True) -> dict:
    item = facts.connection_states.get(provider) or {}
    read = item.get("readiness") or {}
    if provider == "ga4":
        done = bool(item.get("status") == "connected" and item.get("granted") and item.get("selected") and
                    _read(read, {"ready", "empty"}))
        plan = facts.quarter_plan or {}
        kpi = plan.get("kpi")
        goal = kpi.get("name_he") if isinstance(kpi, dict) else None
        why = read.get("note_he") or (f"נתוני האתר יעזרו לבדוק את היעד: {goal}." if goal else
                                      "נראה מאיפה מגיעים אנשים לאתר ומה הם עושים בו.")
        return {"status": "done" if done else "todo" if available else "soon", "title": "נתוני האתר",
                "why": why if done or available else "החיבור לנתוני האתר ייפתח כאן בקרוב. אפשר להמשיך בתוכנית.",
                "action": "לבדוק את נתוני האתר" if item else "לחבר את נתוני האתר"}

    required = keys(facts)
    requested = (required & META_KEYS) if required is not None else {"instagram_insights"}
    social = "instagram_insights" in requested
    ads = bool(requested & {"meta_business", "meta_pixel"})
    facebook = "facebook_insights" in requested
    title = "נתוני האינסטגרם והפרסום" if social and ads else "נתוני הפרסום" if ads else "נתוני האינסטגרם" if social else "נתוני עמוד הפייסבוק"
    selection = item.get("selection") or {}
    sections = read.get("sections") or {}
    checks = []
    if social:
        checks.append(bool(selection.get("page_id") and selection.get("instagram_id") and
                           _read(sections.get("social") or {}, {"ready", "empty"})))
    if facebook:
        checks.append(bool(selection.get("page_id") and _read(sections.get("facebook") or {}, {"ready", "empty"})))
    if "meta_business" in requested:
        checks.append(bool(selection.get("ad_account_id") and
                           _read(sections.get("ads") or {}, {"ready", "empty"})))
    if "meta_pixel" in requested:
        checks.append(bool(selection.get("pixel_id") and
                           _read(sections.get("tracking") or {}, {"receiving"})))
    done = bool(item.get("status") == "connected" and item.get("granted") and read.get("status") in {"ready", "partial", "empty"}
                and checks and all(checks))
    why = read.get("note_he") or ("נלמד מה המודעות הביאו ונבחר את הפעולה הבאה." if ads else
                                  "נלמד מה עורר עניין בפוסטים, כדי לדייק את הפעולה הבאה בתוכנית.")
    return {"status": "done" if done else "todo" if available else "soon", "title": title,
            "why": why if done or available else "החיבור לנתוני הפרסום והפוסטים ייפתח כאן בקרוב. אפשר להמשיך בתוכנית.",
            "action": "לבדוק את החיבורים" if item else "לחבר את החשבון"}
