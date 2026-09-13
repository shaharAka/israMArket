"""Target audiences: defined once, carried by each post, and measured per post.

Three promises this module keeps, because each of them is easy to break:

- **A segment is grounded in the business that was passed in.** The proposal prompt gets
  the profile, the brand language, the diagnostics and the competitors, and it is told —
  in the `services` / `products` language of `business_model.audience_framing` — what a
  segment even means for this kind of business. It may not invent a market size, a
  percentage or a demographic that nobody supplied.
- **A post never points at a segment that does not exist.** The model returns a *name*;
  this module maps it onto a real audience id, and anything unrecognised falls back to
  the business's primary audience instead of being stored as a dangling reference.
- **Per-audience numbers are only the already-attributed per-post numbers.** `rollup`
  sums the GA4 sessions/conversions and the Meta engagement that `performance._attribute`
  already matched to a post through the UTM it was published with. No rate, no index, no
  per-audience attribution GA4 cannot support — and posts with no audience are reported
  as their own "לא משויך" bucket rather than being dropped or spread around.
"""

from __future__ import annotations

import re

from app.models import Audience
from app.services.business_model import audience_framing, model_framing
from app.services.gemini import strategy_json
from app.services.jsonutil import loads
from app.services.schemas_llm import AUDIENCE_PROPOSAL_SCHEMA

PRIMARY = "primary"
SECONDARY = "secondary"
PRIORITIES = (PRIMARY, SECONDARY)

# The proposal asks for 3-5 segments; a plan cannot meaningfully serve more than five.
MIN_PROPOSALS = 3
MAX_AUDIENCES = 5
# How much of a segment reaches a prompt. Audiences ride along in the USP, month-plan and
# post prompts, so they must stay a compact block, not a second strategy document.
PROMPT_AUDIENCES = 5
LIST_LIMIT = 8

# The bucket every post with no audience lands in. Never dropped, never spread.
UNTAGGED_LABEL = "לא משויך"

METHOD_HE = (
    "המדידה היא סכום של השיוך הקיים ברמת הפוסט — סשנים והמרות מ-GA4 ומעורבות ממטא — "
    "לפי הקהל שאליו הפוסט משויך בתוכנית. אין כאן מדד חדש, שיעור או שיוך שאין לו כיסוי בנתונים."
)
CONNECT_EXPLANATION_HE = (
    "אין נתוני מדידה לפי קהל. חברו את Google Analytics 4 או את אינסטגרם בעמוד החיבורים — "
    "ואז נסכום לכל קהל את הסשנים וההמרות של הפוסטים שמשויכים אליו, לפי אותו שיוך UTM שכבר קיים. "
    "בלי חיבור אין מספרים, ואנחנו לא ממציאים אותם."
)
SYNC_EXPLANATION_HE = (
    "אין עדיין סנכרון נתונים. הריצו סנכרון בעמוד הביצועים — ואז כל שורה כאן תציג את "
    "הסשנים וההמרות של הפוסטים שמשויכים לאותו קהל."
)
ATTRIBUTION_EXPLANATION_HE = (
    "הסנכרון האחרון לא החזיר תוצאות לאף פוסט בתוכנית. ודאו שהפוסטים פורסמו עם קישור "
    "ה-UTM שנוצר בתוכנית, ואז סנכרנו שוב."
)

_WS = re.compile(r"\s+")


# --- parsing ----------------------------------------------------------------------


def _clean_text(value, limit: int) -> str:
    if value is None or isinstance(value, (int, float, bool)):
        value = "" if value is None else str(value)
    if not isinstance(value, str):
        return ""
    return _WS.sub(" ", value).strip()[:limit]


def parse_strings(raw, limit: int = LIST_LIMIT) -> list[str]:
    """A JSON list, a JSON string of a list, or a plain list → clean, deduplicated strings.

    A model's JSON is not a contract: anything unusable is dropped rather than becoming a
    one-item list of garbage (the same tolerance `assets.parse_tags` applies).
    """
    if isinstance(raw, str):
        decoded = loads(raw, None)
        raw = decoded if isinstance(decoded, list) else []
    if not isinstance(raw, (list, tuple)):
        return []
    out: list[str] = []
    for item in raw:
        if isinstance(item, dict):
            item = item.get("text") or item.get("name") or item.get("value") or ""
        text = _clean_text(item, 200)
        if text and text not in out:
            out.append(text)
        if len(out) >= limit:
            break
    return out


def parse_targeting(raw) -> dict:
    """The targeting object, always with the same five keys, always JSON-safe."""
    if isinstance(raw, str):
        raw = loads(raw, {})
    if not isinstance(raw, dict):
        raw = {}
    keywords = parse_strings(raw.get("keywords") or raw.get("keyword_themes"), LIST_LIMIT)
    return {
        "interests": parse_strings(raw.get("interests"), LIST_LIMIT),
        "keywords": keywords,
        "age_range": _clean_text(raw.get("age_range"), 40),
        "gender": _clean_text(raw.get("gender"), 40),
        "geo": _clean_text(raw.get("geo"), 120),
    }


def serialize_audience(audience) -> dict:
    """The AudienceOut contract: JSON columns come back as real lists and objects."""
    priority = (audience.priority or "").strip().lower()
    return {
        "id": audience.id,
        "name": audience.name or "",
        "summary": audience.summary or "",
        "description": audience.description or "",
        "needs": parse_strings(audience.needs_json, LIST_LIMIT),
        "where": parse_strings(audience.where_json, LIST_LIMIT),
        "targeting": parse_targeting(audience.targeting_json),
        "priority": priority if priority in PRIORITIES else SECONDARY,
        "source": (audience.source or "manual").strip().lower() or "manual",
        "is_primary": bool(audience.is_primary),
        "created_at": audience.created_at.isoformat() if audience.created_at else "",
    }


def catalogue(rows) -> list[dict]:
    """Compact, JSON-safe view of the business's audiences for prompts and for mapping.

    This is what travels in the `business` dict handed to the generation functions, so it
    must survive `dumps`/`loads` unchanged.
    """
    return [
        {
            "id": row.id,
            "name": row.name or "",
            "summary": row.summary or "",
            "priority": (row.priority or SECONDARY),
            "is_primary": bool(row.is_primary),
            "needs": parse_strings(row.needs_json, 3),
            "where": parse_strings(row.where_json, 2),
            "targeting": parse_targeting(row.targeting_json),
        }
        for row in rows
    ]


def catalogue_for(db, business) -> list[dict]:
    """The compact audience list the generation payloads carry.

    One definition of the ordering (primary first, then oldest) so the plan payload, the
    post payload and the /audiences endpoint can never disagree about which segment comes
    first — or about which one is the fallback.
    """
    rows = (
        db.query(Audience)
        .filter(Audience.business_id == business.id)
        .order_by(Audience.is_primary.desc(), Audience.created_at.asc(), Audience.id.asc())
        .all()
    )
    return catalogue(rows)


# --- prompt block -----------------------------------------------------------------


def prompt_block(audiences: list[dict]) -> str:
    """The small Hebrew block that names who the content is for.

    Kept to a handful of short lines: it is injected into the USP, the month plan and the
    posts prompts, and a second full strategy document inside a prompt is how prompts
    drift. Empty string when the business has no audiences — then the model is asked for
    nothing rather than being handed invented segments.
    """
    items = [
        item
        for item in (audiences or [])
        if isinstance(item, dict) and _clean_text(item.get("name"), 200)
    ]
    if not items:
        return ""
    lines = ["קהלי היעד שהעסק הגדיר. כל תוכן מיועד לקהל מסוים — לא ל'כולם':"]
    for item in items[:PROMPT_AUDIENCES]:
        role = "ראשי" if item.get("is_primary") else "משני"
        line = f"- {_clean_text(item.get('name'), 160)} ({role})"
        summary = _clean_text(item.get("summary"), 200)
        if summary:
            line += f": {summary}"
        needs = [str(text).strip() for text in (item.get("needs") or []) if str(text or "").strip()][:2]
        if needs:
            line += f" | רוצים: {', '.join(needs)}"
        where = [str(text).strip() for text in (item.get("where") or []) if str(text or "").strip()][:2]
        if where:
            line += f" | מגיעים דרך: {', '.join(where)}"
        targeting = item.get("targeting") if isinstance(item.get("targeting"), dict) else {}
        focus = [str(targeting.get(key)).strip() for key in ("geo", "age_range") if str(targeting.get(key) or "").strip()]
        if focus:
            line += f" | מיקוד: {' · '.join(focus)}"
        lines.append(line)
    return "\n".join(lines)


def post_audience_rule(audiences: list[dict]) -> str:
    """The per-post instruction, worded for the case that actually applies."""
    if prompt_block(audiences):
        return (
            "- audience_name: בחר את שם הקהל המדויק מהרשימה שלמעלה שהפוסט הזה משרת. "
            "שם שלא מופיע ברשימה לא יתקבל — עדיף לבחור את הקהל הקרוב באמת מאשר להמציא קהל."
        )
    return (
        "- audience_name: לעסק הזה עוד לא הוגדרו קהלי יעד — החזר מחרוזת ריקה. "
        "אל תמציא קהל ואל תכתוב תיאור קהל כללי."
    )


# --- mapping the model's answer onto real ids -------------------------------------


def _key(value) -> str:
    if not isinstance(value, str):
        return ""
    return _WS.sub(" ", value).strip().casefold()


def match_audience(raw_name, audiences: list[dict]) -> dict | None:
    """Find the audience the model meant, or None.

    Exact (whitespace/case-insensitive) match first, then containment — models routinely
    return "זוגות צעירים — מחפשים מתנה" for the segment named "זוגות צעירים". A name that
    matches nothing is *not* invented into a new segment.
    """
    needle = _key(raw_name)
    if not needle:
        return None
    candidates = [item for item in (audiences or []) if isinstance(item, dict) and _key(item.get("name"))]
    for item in candidates:
        if _key(item.get("name")) == needle:
            return item
    for item in candidates:
        name = _key(item.get("name"))
        if name and (name in needle or needle in name):
            return item
    return None


def attach_audiences(posts: list[dict], audiences: list[dict]) -> list[dict]:
    """Stamp every generated post with the real audience id and name.

    - A name the model returned that matches a segment → that segment.
    - A name that matches nothing, or no name at all, while segments exist → the primary
      one. A post that serves *somebody* is measurable; a dangling id is not.
    - No audiences defined → the field is left explicitly empty. Segments are never
      invented at post time.
    """
    real = [item for item in (audiences or []) if isinstance(item, dict) and item.get("id") is not None]
    if not real:
        for post in posts:
            post["audience_id"] = None
            post["audience_name"] = ""
        return posts

    primary = next((item for item in real if item.get("is_primary")), real[0])
    for post in posts:
        chosen = match_audience(post.get("audience_name"), real) or primary
        post["audience_id"] = chosen["id"]
        post["audience_name"] = chosen.get("name") or ""
    return posts


# --- proposal (real model call) ---------------------------------------------------


def proposal_prompt(
    business: dict,
    brand: dict,
    profile: dict,
    diagnostics: dict | None = None,
    competitors: list[dict] | None = None,
    existing: list[dict] | None = None,
) -> str:
    existing_block = ""
    real_existing = [item for item in (existing or []) if isinstance(item, dict) and item.get("name")]
    if real_existing:
        lines = "\n".join(
            f"- {_clean_text(item.get('name'), 160)}: {_clean_text(item.get('summary'), 200)}"
            for item in real_existing[:PROMPT_AUDIENCES]
        )
        existing_block = f"""
קהלים שהעסק כבר הגדיר בעצמו (לא ליצור אותם מחדש ולא להציע להם תחליף):
{lines}
"""
    return f"""
{model_framing(business.get("business_model"))}
{audience_framing(business.get("business_model"))}

הצע 3 עד 5 קהלי יעד לעסק הישראלי הקטן הזה, כדי שהתוכן והפרסום יידעו למי הם מדברים.
זו לא סקירת שוק. כל קהל חייב לנבוע מהמידע שסופק כאן למטה.

חוקים מחייבים:
- אל תמציא נתון: אין גודל קהל, אחוזים, הכנסה, גיל מדויק או התנהגות שלא הופיעו במידע שסופק.
- אל תמציא קהל שלא נתמך במידע. אם המידע דק — החזר פחות קהלים, אבל כל אחד מהם מבוסס.
- כל קהל חייב להיות מובחן מאחרים לפי צורך או סיטואציה, לא לפי גיל בלבד.
- שם הקהל יהיה קצר וקונקרטי, בשפה שהבעלים היה אומר בעצמו.
- בדיוק קהל אחד מסומן primary — זה שהעסק צריך לפנות אליו קודם.
- כל קהל צריך גם שכבת פרסום (interests, keywords, age_range, gender, geo) שנובעת
  מהמידע: אם אין בסיס לטווח גילאים או למיקוד מגדרי — החזר מחרוזת ריקה או 'הכל'.
{existing_block}
פרטי העסק:
עסק: {business}
שפת מותג: {brand}
פרופיל מהאתר: {profile}
אבחון: {diagnostics or {}}
מתחרים: {competitors or []}
"""


def parse_proposals(raw) -> list[dict]:
    """Normalise whatever the model returned into segments we are willing to store.

    Duplicates collapse, empty names are dropped, and exactly one segment is marked
    primary so the caller never has to guess.
    """
    if isinstance(raw, str):
        raw = loads(raw, {})
    if not isinstance(raw, dict):
        return []
    items = raw.get("audiences")
    if not isinstance(items, list):
        return []

    out: list[dict] = []
    seen: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        name = _clean_text(item.get("name"), 160)
        key = _key(name)
        if not name or key in seen:
            continue
        seen.add(key)
        priority = _clean_text(item.get("priority"), 20).lower()
        out.append(
            {
                "name": name,
                "summary": _clean_text(item.get("summary"), 300),
                "description": _clean_text(item.get("description"), 2000),
                "needs": parse_strings(item.get("needs"), 6),
                "where": parse_strings(item.get("where"), 6),
                "targeting": parse_targeting(item.get("targeting")),
                "priority": PRIMARY if priority == PRIMARY else SECONDARY,
            }
        )
        if len(out) >= MAX_AUDIENCES:
            break

    if out:
        primary_index = next((index for index, item in enumerate(out) if item["priority"] == PRIMARY), 0)
        for index, item in enumerate(out):
            item["priority"] = PRIMARY if index == primary_index else SECONDARY
    return out


def propose_audiences(
    business: dict,
    brand: dict | None = None,
    profile: dict | None = None,
    diagnostics: dict | None = None,
    competitors: list[dict] | None = None,
    existing: list[dict] | None = None,
) -> list[dict]:
    """One real call that proposes the business's segments. Raises if the answer is unusable."""
    prompt = proposal_prompt(
        business,
        brand or {},
        profile or {},
        diagnostics,
        competitors,
        existing,
    )
    parsed = parse_proposals(strategy_json(prompt, AUDIENCE_PROPOSAL_SCHEMA))
    if len(parsed) < MIN_PROPOSALS:
        raise RuntimeError("Gemini לא החזיר מספיק קהלי יעד מובחנים. נסו לייצר שוב.")
    return parsed


# --- measurement ------------------------------------------------------------------

# Which already-attributed numbers may be summed. Counts only — GA4 and Meta do not
# report any per-audience rate, so computing one here would be inventing a metric.
GA4_SUMS = (
    ("sessions", "sessions"),
    ("conversions", "conversions"),
    ("engaged_sessions", "engagedSessions"),
)
META_SUMS = (("likes", "like_count"), ("comments", "comments_count"))
META_INSIGHT_SUMS = (
    ("impressions", "impressions"),
    ("reach", "reach"),
    ("saves", "saved"),
    ("shares", "shares"),
)


def _number(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    return int(parsed) if parsed.is_integer() else round(parsed, 2)


def _as_id(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def rollup(
    *,
    audiences: list[dict],
    posts: list[dict],
    attributions: list[dict],
    ga4_connected: bool,
    meta_connected: bool,
    period_start: str = "",
    period_end: str = "",
    synced_at: str = "",
) -> dict:
    """One row per audience, plus the explicit "לא משויך" bucket.

    The only inputs are the posts as they are stored now and the per-post attribution the
    sync already produced, so a number here is always traceable to one post and one GA4 or
    Meta report. `posts` on each row is the sample size; `measured_posts` is how many of
    them actually had a result to sum, because one published post is not a trend.
    """
    live: dict[int, dict] = {}
    for audience in audiences or []:
        audience_id = _as_id(audience.get("id")) if isinstance(audience, dict) else None
        if audience_id is not None:
            live[audience_id] = audience

    counts = {audience_id: 0 for audience_id in live}
    unassigned_posts = 0
    for post in posts or []:
        if not isinstance(post, dict):
            continue
        audience_id = _post_audience_id(post, live)
        if audience_id is None:
            unassigned_posts += 1
        else:
            counts[audience_id] += 1

    # The UTM content is the key the existing attribution is built on, so it is also the
    # only key used here to recognise a post from an older snapshot.
    by_utm: dict[str, dict] = {}
    for post in posts or []:
        if not isinstance(post, dict):
            continue
        content = (post.get("utm") or {}).get("utm_content") or ""
        if content:
            by_utm.setdefault(content, post)

    totals: dict[int | None, dict] = {
        audience_id: {"ga4": {}, "meta": {}, "ga4_rows": 0, "meta_rows": 0, "measured": []}
        for audience_id in live
    }
    totals[None] = {"ga4": {}, "meta": {}, "ga4_rows": 0, "meta_rows": 0, "measured": []}

    for row in attributions or []:
        if not isinstance(row, dict):
            continue
        bucket = totals[_row_audience_id(row, live, by_utm)]
        matched = False
        for campaign in row.get("ga4") or []:
            if not isinstance(campaign, dict):
                continue
            bucket["ga4_rows"] += 1
            matched = True
            for key, source in GA4_SUMS:
                value = _number(campaign.get(source))
                if value is not None:
                    bucket["ga4"][key] = bucket["ga4"].get(key, 0) + value
        media = row.get("meta")
        if isinstance(media, dict):
            bucket["meta_rows"] += 1
            matched = True
            insights = media.get("insights") if isinstance(media.get("insights"), dict) else {}
            for key, source in META_SUMS:
                value = _number(media.get(source))
                if value is not None:
                    bucket["meta"][key] = bucket["meta"].get(key, 0) + value
            for key, source in META_INSIGHT_SUMS:
                value = _number(insights.get(source))
                if value is not None:
                    bucket["meta"][key] = bucket["meta"].get(key, 0) + value
        if matched:
            marker = row.get("utm_content") or row.get("title") or id(row)
            if marker not in bucket["measured"]:
                bucket["measured"].append(marker)

    rows = [
        _row(live[audience_id], counts[audience_id], totals[audience_id])
        for audience_id in live
    ]
    unassigned = totals[None]
    if unassigned_posts or unassigned["measured"] or unassigned["ga4_rows"] or unassigned["meta_rows"]:
        rows.append(_row(None, unassigned_posts, unassigned, name=UNTAGGED_LABEL))

    available = any(_has_results(total) for total in totals.values())
    return {
        "available": available,
        "connected": {"ga4": bool(ga4_connected), "meta": bool(meta_connected)},
        "period_start": period_start,
        "period_end": period_end,
        "synced_at": synced_at,
        "sample_posts": len([post for post in (posts or []) if isinstance(post, dict)]),
        "unassigned_posts": unassigned_posts,
        "method": METHOD_HE,
        "explanation": _explanation(
            available=available,
            ga4_connected=ga4_connected,
            meta_connected=meta_connected,
            synced_at=synced_at,
            unassigned_posts=unassigned_posts,
        ),
        "rows": rows,
    }


def _post_audience_id(post: dict, live: dict[int, dict]) -> int | None:
    """A post's audience, but only while that audience still exists for this business."""
    audience_id = _as_id(post.get("audience_id"))
    return audience_id if audience_id in live else None


def _row_audience_id(row: dict, live: dict[int, dict], by_utm: dict[str, dict]) -> int | None:
    """Which audience a stored attribution row belongs to.

    The live post wins outright — the owner sees today's tagging, so re-tagging *or
    clearing* a post moves its numbers with it. The id captured at sync time is only the
    fallback for posts that are no longer in the plan. Anything that resolves to a segment
    this business no longer has is reported as "לא משויך" rather than guessed.
    """
    post = by_utm.get(row.get("utm_content") or "")
    if isinstance(post, dict):
        audience_id = _as_id(post.get("audience_id"))
        return audience_id if audience_id in live else None
    stored = _as_id(row.get("audience_id"))
    return stored if stored in live else None


def _has_results(total: dict) -> bool:
    return bool(total["ga4_rows"] or total["meta_rows"])


def _row(audience: dict | None, posts: int, total: dict, name: str = "") -> dict:
    return {
        "audience_id": _as_id(audience.get("id")) if isinstance(audience, dict) else None,
        "name": name or (audience.get("name") if isinstance(audience, dict) else "") or "",
        "is_primary": bool(audience.get("is_primary")) if isinstance(audience, dict) else False,
        "posts": posts,
        "measured_posts": len(total["measured"]),
        # None, not zero: "no numbers" and "numbers that are zero" are different facts.
        "ga4": dict(total["ga4"]) if total["ga4_rows"] else None,
        "meta": dict(total["meta"]) if total["meta_rows"] else None,
    }


def _explanation(
    *,
    available: bool,
    ga4_connected: bool,
    meta_connected: bool,
    synced_at: str,
    unassigned_posts: int,
) -> str:
    if not available:
        if not ga4_connected and not meta_connected:
            return CONNECT_EXPLANATION_HE
        if not synced_at:
            return SYNC_EXPLANATION_HE
        return ATTRIBUTION_EXPLANATION_HE

    notes: list[str] = []
    offline = []
    if not ga4_connected:
        offline.append("Google Analytics 4")
    if not meta_connected:
        offline.append("אינסטגרם")
    if offline:
        notes.append(
            "אין כרגע חיבור פעיל ל: "
            + ", ".join(offline)
            + ". המספרים כאן הם מהסנכרון האחרון"
            + (f" ({synced_at})." if synced_at else ".")
        )
    if unassigned_posts:
        notes.append(
            f"{unassigned_posts} פוסטים בתוכנית לא משויכים לקהל, והם נספרים בנפרד ב'לא משויך'."
        )
    return " ".join(notes)
