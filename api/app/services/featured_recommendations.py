"""Read-only, grounded starting points for the owner's content choices.

Only the business's own offers become candidates. Plan/research can rank those
candidates and explain a connection; competitors' offers never become ours.
No model, crawl or write runs when this screen opens.
"""
import re
from datetime import date, datetime, timedelta

from app.models import ResearchRun, Strategy
from app.services.jsonutil import loads

KINDS = {"product": "מוצר", "service": "שירות", "work": "דוגמה מעבודה", "expertise": "טיפ מקצועי", "story": "סיפור לקוח"}


def _text(value, limit=80):
    return re.sub(r"\s+", " ", value if isinstance(value, str) else "").strip()[:limit]


def _dict(value):
    return value if isinstance(value, dict) else {}


def _list(value):
    return value if isinstance(value, list) else []


def _terms(text):
    # A conservative word match, never a claim about demand or profitability.
    return {w for w in re.findall(r"[\w]+", text.lower()) if len(w) >= 3} - {"שלכם", "לקוחות", "שירות", "מוצר", "עבור", "מאוד"}


def _offers(business, stored):
    candidates = []
    context = _dict(stored.get("owner_context"))
    focus = _text(_dict(context.get("software")).get("focus_product")) if business.business_model == "saas" else ""
    brand = _dict(stored.get("brand_language"))
    site = _list(_dict(stored.get("extracted")).get("offers"))
    if brand.get("source") != "preset":
        site += _list(brand.get("offers_seen"))
    owner = re.split(r"[,،\n;|•]+|\s+-\s+|[.:](?:\s+|$)", business.offerings or "")
    focused = [(focus, "focus")] if focus else []
    for raw, source in focused + [(v, "site") for v in site] + [(v, "owner") for v in owner]:
        name = _text(raw, 80)
        if len(name) > 1 and not any(c["name"] == name for c in candidates):
            candidates.append({"name": name, "source": source})
    return candidates[:12]


def _plan_topics(db, business, stored):
    today = date.today()
    current = db.query(Strategy).filter_by(business_id=business.id, year=today.year, month=today.month).first()
    if current:
        core = _dict(_dict(loads(current.roadmap_json, {})).get("roadmap"))
        pillars = [{"title": core.get("theme"), "description_he": core.get("summary")}]
        pillars += [{"title": w.get("focus"), "description_he": ""} for w in _list(core.get("weekly_breakdown")) if isinstance(w, dict)]
    else:
        plan = _dict(stored.get("quarter_plan"))
        start = _dict(plan.get("start"))
        try:
            index = (today.year - int(start["year"])) * 12 + today.month - int(start["month"])
        except (KeyError, ValueError, TypeError):
            index = -1
        content = _list(plan.get("content"))
        pillars = _list(_dict(content[index]).get("pillars")) if 0 <= index < len(content) else []
    return [(title, _text(p.get("description_he"), 300)) for p in pillars if isinstance(p, dict) and (title := _text(p.get("title")))]


def _research(db, business):
    from app.services.research import PROMPT_MAX_AGE_DAYS
    run = db.query(ResearchRun).filter_by(business_id=business.id, status="done").order_by(ResearchRun.created_at.desc(), ResearchRun.id.desc()).first()
    if not run or run.created_at < datetime.utcnow() - timedelta(days=PROMPT_MAX_AGE_DAYS):
        return []
    return [item for item in _list(_dict(loads(run.insights_json, {})).get("items"))
            if isinstance(item, dict) and item.get("confidence") == "strong" and _list(item.get("evidence"))]


def recommend(db, business, stored, taken):
    topics, research = _plan_topics(db, business, stored), _research(db, business)
    candidates = []
    model = business.business_model
    for offer in _offers(business, stored):
        name, source = offer["name"], offer["source"]
        terms = _terms(name)
        why = "נמצא בין ההצעות באתר שלכם." if source == "site" else "מתוך מה שסיפרתם שאתם מציעים."
        score, basis = 0, "האתר שלכם" if source == "site" else "מה שסיפרתם"
        for title, description in topics:
            match = len(terms & _terms(title + " " + description))
            if match and match > score:
                score, basis, why = match, "התוכנית", f"מתאים לנושא בתוכנית: {title}."
        for insight in research:
            match = len(terms & _terms(" ".join(_text(insight.get(k), 300) for k in ("title", "text", "plan_change"))))
            if match and match + 10 > score:
                score, basis, why = match + 10, "המחקר השוטף", f"כדאי לבדוק בעקבות הממצא: {_text(insight.get('title'), 80)}."
        if source == "focus":
            # A research ranking must not silently replace the owner's selected product.
            score, basis, why = 100, "הבחירה שלכם", "בחרתם להתחיל לקדם את המוצר הזה."
        candidates.append({"name": name, "kind": "service" if model == "services" else "product" if model == "products" else "offering",
                           "why_he": why, "source_he": basis, "needs_detail": False, "score": score})
    candidates.sort(key=lambda item: -item["score"])
    out = candidates[:4]
    if model in {"services", "both"} and candidates:
        subject = candidates[0]["name"][:48]
        out = candidates[:2] + [
            {"name": f"טיפ מקצועי: {subject}", "kind": "expertise", "why_he": "להסביר ללקוחות מה כדאי לדעת לפני שפונים אליכם.", "source_he": "השירותים שלכם", "needs_detail": False},
            {"name": f"דוגמה מעבודה: {subject}", "kind": "work", "why_he": "להראות איך אתם עובדים. בחרו עבודה אמיתית ותארו אותה.", "source_he": "הצעה שצריכה דוגמה שלכם", "needs_detail": True},
        ]
    if model == "saas" and candidates:
        subject = candidates[0]["name"][:48]
        out = candidates[:2] + [
            {"name": f"הבעיה שהמוצר פותר: {subject}", "kind": "expertise", "why_he": "להסביר למי זה מתאים ומה משתפר בעבודה שלהם.", "source_he": "המוצר שלכם", "needs_detail": False},
            {"name": f"הדגמת המוצר: {subject}", "kind": "work", "why_he": "להראות פעולה אמיתית במוצר. הוסיפו צילום או תיאור של מה שכבר עובד.", "source_he": "הצעה שצריכה הדגמה שלכם", "needs_detail": True},
        ]
    return [{k: v for k, v in item.items() if k != "score"} for item in out if item["name"] not in taken]
