"""Connected posts: every post is a small, measured step of the plan (docs/posts-v2.md).

A post knows what it is for (`plan_link`, `why_line`), what the owner must add
(`owner_needs`), how we will know if it worked (`measure`), and, once published and
measured, what happened (`results`) and what we learn (`learning`). The next post is
written with what worked (`what_worked`), and says so (`informed_by_note`).

Where each field comes from:

* written with the post (services/strategy._write_posts_for_weeks -> `finish_written`):
  `uid`, `channel`, `mix_type`, `featured_item_id`, `owner_fact`, `plan_link`, `why_line`,
  `informed_by_note`. The model *names* a mix type, a featured item, an owner fact and the
  learning it applied; every one is checked here against what really exists.
* tracking (services/strategy.attach_tracking): `utm` and `whatsapp_source_key` from the
  uid, and `measure`.
* computed on every read (`connected_view`, used by serialize_strategy): `owner_needs` and
  `lifecycle`, plus every contract field with an honest default for posts written before
  this existed (a backfilled uid, `results: None`, ...). So old posts keep working.
* written by the performance refresh (`refresh_results`): `results`, `learning`.

Honesty rules (UI-RULES.md): a number we do not have is None, never 0; a learning line
says only what the numbers and the post's visible traits show; the cheap model only
phrases a line the server already decided, and a line that adds a number or a cause is
replaced by the plain sentence.
"""

from __future__ import annotations

import hashlib
import logging
import re
import uuid
from datetime import datetime

from app.services.gemini import lite_json
from app.services.jsonutil import dumps, loads
from app.services.post_design import post_needs_photo, view_designs
from app.services.schemas_llm import LEARNING_LINES_SCHEMA, MIX_TYPE_KEYS, POST_CHANNELS
from app.services.whatsapp import post_cta_is_whatsapp, post_key_for, uid_post_source_key

log = logging.getLogger(__name__)

MIX_TYPES = MIX_TYPE_KEYS
CHANNELS = POST_CHANNELS
LIFECYCLES = ("needs_owner", "ready", "approved", "published", "measured")
METRICS = ("whatsapp_clicks", "site_visits", "saves", "reach")
METRIC_LABEL_HE = {
    "whatsapp_clicks": "לחיצות לוואטסאפ",
    "site_visits": "כניסות לאתר",
    "saves": "שמירות",
    "reach": "אנשים שראו",
}
# The key in `results` that holds each measure's number.
RESULT_KEY = {"whatsapp_clicks": "whatsapp_clicks", "site_visits": "visits", "saves": "saves", "reach": "reach"}
CHANNEL_HE = {"instagram": "אינסטגרם", "facebook": "פייסבוק", "whatsapp": "וואטסאפ"}
FORMAT_HE = {"reel": "ריל", "carousel": "קרוסלה", "image": "תמונה אחת", "story": "סטורי"}
COMPARE_LABEL_HE = "בפוסט דומה"
INFORMED_PREFIX_HE = "עודכן לפי מה שהצליח אצלכם: "

# foundations' reasons for featuring an item (routers/foundations.py imports these).
FEATURED_REASONS_HE: dict[str, str] = {
    "in_stock": "במלאי",
    "profitable": "רווחי",
    "seasonal": "עונתי",
    "new": "חדש",
    "best_seller": "הכי נמכר",
}

# Mix types whose post shows a real product, place or person: a generated image is not
# enough for them, the owner's own photo is (the "להעלות תמונה" state).
PRODUCT_IMAGE_MIX = frozenset({"product", "offer", "behind_scenes", "social_proof"})
OWNER_PHOTO_SOURCES = frozenset({"asset", "real_photo"})

_WS = re.compile(r"\s+")


def _clean(value, limit: int = 240) -> str:
    return _WS.sub(" ", str(value or "")).strip()[:limit] if isinstance(value, (str, int, float)) else ""


def _now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds")


# --- identity ----------------------------------------------------------------------------


def new_uid() -> str:
    """A new post's stable id: 10 lowercase hex characters."""
    return uuid.uuid4().hex[:10]


def backfill_uid(business_id, year, month, index: int) -> str:
    """The uid of a post written before uids existed. Deterministic (the month and the
    post's position, which never changes: posts are appended, never reordered), so every
    read gives the same id until the first write stores it."""
    seed = f"{business_id or 0}:{int(year or 0):04d}-{int(month or 0):02d}:{index}"
    return hashlib.sha1(seed.encode("utf-8")).hexdigest()[:10]


def ensure_uids(posts: list, business_id, year, month) -> bool:
    """Store the backfilled uid on every post that has none. True when something changed."""
    changed = False
    for index, post in enumerate(posts):
        if isinstance(post, dict) and not post.get("uid"):
            post["uid"] = backfill_uid(business_id, year, month, index)
            changed = True
    return changed


def featured_item_id(name) -> str:
    """A featured item's id: from its name, so reordering the list keeps it."""
    key = _WS.sub(" ", str(name or "")).strip().lower()
    return "fi-" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:8] if key else ""


def featured_name(item) -> str:
    if isinstance(item, str):
        return _clean(item, 80)
    if isinstance(item, dict):
        return _clean(item.get("name") or item.get("title"), 80)
    return ""


# --- the plan a post belongs to ----------------------------------------------------------

_TIME_CLAUSE = re.compile(r"\s+(?:בתוך|תוך|עד סוף|עד|במהלך|בחודש הקרוב|בחודש הזה|החודש)(?:\s.*)?$")


def _compact_hypothesis(text: str) -> str:
    """"אם X, נגדיל את Y עד סוף החודש" -> "Y". "" when the sentence is not of that shape."""
    text = _clean(text, 400)
    if not text.startswith("אם ") or "," not in text:
        return ""
    words = _TIME_CLAUSE.sub("", text.split(",", 1)[1].strip()).split()
    if len(words) > 1 and words[0][:1] in "נית":
        words = words[1:]
        if words and words[0] in ("את", "עוד"):
            words = words[1:]
    words = [word for word in words if not re.search(r"\d|%", word)]
    return " ".join(words[:6]).strip(" .,;:—-")


def month_goal(core: dict | None) -> str:
    """The month's goal in a few words: the planner's own `goal_he` (new months), the KPI
    the owner chose at /start, the hypothesis' outcome, else the month's theme."""
    core = core if isinstance(core, dict) else {}
    horizon = core.get("monthly_horizon_plan") if isinstance(core.get("monthly_horizon_plan"), dict) else {}
    seed = core.get("strategy") if isinstance(core.get("strategy"), dict) else {}
    kpi = seed.get("kpi") if isinstance(seed.get("kpi"), dict) else {}
    for candidate in (
        horizon.get("goal_he"),
        kpi.get("name_he"),
        _compact_hypothesis(horizon.get("hypothesis") or ""),
        core.get("theme"),
    ):
        text = _clean(candidate, 80).rstrip(".")
        if text.startswith("בשביל "):
            text = text[len("בשביל "):]
        if text:
            return " ".join(text.split()[:8])
    return ""


def _week_item(core: dict | None, week) -> dict:
    for item in (core or {}).get("weekly_breakdown") or []:
        if isinstance(item, dict) and str(item.get("week")) == str(week):
            return item
    return {}


def week_focus(core: dict | None, week) -> str:
    return _clean(_week_item(core, week).get("focus"), 160)


def plan_link(core: dict | None, week) -> dict:
    try:
        week_number = int(week or 0) or None
    except (TypeError, ValueError):
        week_number = None
    return {"goal": month_goal(core), "week": week_number, "week_focus": week_focus(core, week_number)}


def _has_plan(core: dict | None) -> bool:
    core = core or {}
    return bool(core.get("weekly_breakdown") or core.get("monthly_horizon_plan") or core.get("theme"))


# Hebrew nouns whose first ה is part of the word, not the article ("הורים", not "ה+ורים").
_ROOT_HE = ("הור", "הייטק", "היפסטר", "הולכי", "הנדסא", "הודים")


def _to_audience(audience: str) -> str:
    """"הלקוחות הקבועים" -> "ללקוחות הקבועים"; "הורים צעירים" -> "להורים צעירים"."""
    name = _clean(audience, 80)
    if not name:
        return ""
    if not re.match(r"[א-ת]", name):
        return f"ל-{name}"
    first = name.split()[0]
    if first.startswith("ה") and len(first) > 2 and not name.startswith(_ROOT_HE):
        return "ל" + name[1:]
    return "ל" + name


def why_line(goal: str, audience: str) -> str:
    """One sentence, composed by the server: "בשביל {goal}, ל{audience}."."""
    goal = _clean(goal, 80).rstrip(".")
    target = _to_audience(audience)
    if goal and target:
        return f"בשביל {goal}, {target}."
    if goal:
        return f"בשביל {goal}."
    if target:
        return f"בשביל {_clean(audience, 80)}."
    return ""


def _audience_of(post: dict) -> str:
    why = post.get("why") if isinstance(post.get("why"), dict) else {}
    return _clean(post.get("audience_name") or why.get("audience"), 80)


# --- the channel the plan chose ------------------------------------------------------------

_CHANNEL_WORDS = (
    ("instagram", re.compile(r"אינסטגרם|instagram|רילס|ריל(?![א-ת])", re.IGNORECASE)),
    ("facebook", re.compile(r"פייסבוק|facebook", re.IGNORECASE)),
    ("whatsapp", re.compile(r"וואטסאפ|ווטסאפ|וואצאפ|ווצאפ|whats\s?app", re.IGNORECASE)),
)


def plan_channels(core: dict | None, week) -> list[str]:
    """The channels the plan names for this week (its `media_distribution`), in the order
    it names them; else the channels of the strategy the owner approved; else []."""
    text = _clean(_week_item(core, week).get("media_distribution"), 600)
    found = []
    for channel, pattern in _CHANNEL_WORDS:
        match = pattern.search(text)
        if match:
            found.append((match.start(), channel))
    if found:
        return [channel for _, channel in sorted(found)]
    seed = (core or {}).get("strategy") if isinstance((core or {}).get("strategy"), dict) else {}
    networks = []
    for item in seed.get("channels") or []:
        network = str((item or {}).get("network") or (item or {}).get("key") or "").lower()
        if network in CHANNELS and network not in networks:
            networks.append(network)
    return networks


def plan_channels_line(core: dict | None, weeks: list[int]) -> str:
    parts = []
    for week in weeks:
        channels = plan_channels(core, week)
        if channels:
            parts.append(f"שבוע {week}: " + ", ".join(CHANNEL_HE[c] for c in channels))
    return ("הערוצים שהתוכנית בחרה: " + "; ".join(parts) + ".") if parts else ""


def channel_of(post: dict) -> str:
    channel = str(post.get("channel") or post.get("primary_outlet") or "").lower()
    return channel if channel in CHANNELS else "instagram"


# --- how we will know if it worked ----------------------------------------------------------

_SITE_WORDS = re.compile(r"באתר|לאתר|האתר|בקישור|לקישור|הקישור|לינק|בביו|link", re.IGNORECASE)


def measure_for(post: dict, website: str = "", whatsapp_key: str = "") -> dict:
    """{metric, label_he, link_code}: WhatsApp taps when the call to action is WhatsApp,
    site visits when it sends people to the site, saves for an Instagram post that
    teaches, else how many people saw it. `link_code` is what the result is matched by
    (the WhatsApp source key, or the UTM content); "" when the match is the post's link."""
    channel = channel_of(post)
    utm = post.get("utm") if isinstance(post.get("utm"), dict) else {}
    if post_cta_is_whatsapp(post):
        metric, code = "whatsapp_clicks", whatsapp_key or str(post.get("whatsapp_source_key") or "")
    elif (website or post.get("tracking_url")) and _SITE_WORDS.search(
        f"{post.get('cta') or ''} {post.get('caption') or ''}"
    ):
        metric, code = "site_visits", str(utm.get("utm_content") or "")
    elif channel == "instagram" and post.get("mix_type") == "value":
        metric, code = "saves", ""
    else:
        metric, code = "reach", ""
    return {"metric": metric, "label_he": METRIC_LABEL_HE[metric], "link_code": code}


def count_he(metric: str, value) -> str:
    """"21 לחיצות לוואטסאפ", "לחיצה אחת לוואטסאפ", "120 אנשים ראו"."""
    number = int(value)
    if number == 1:
        return {
            "whatsapp_clicks": "לחיצה אחת לוואטסאפ",
            "site_visits": "כניסה אחת לאתר",
            "saves": "שמירה אחת",
            "reach": "אדם אחד ראה",
        }[metric]
    noun = {"whatsapp_clicks": "לחיצות לוואטסאפ", "site_visits": "כניסות לאתר", "saves": "שמירות",
            "reach": "אנשים ראו"}[metric]
    return f"{number:,} {noun}"


# --- what the owner must add, and the state word --------------------------------------------


def _is_published(post: dict) -> bool:
    return bool(_clean(post.get("published_url"), 800) or post.get("published_at"))


def _is_approved(post: dict) -> bool:
    return str(post.get("approval_status") or "") == "approved"


def _fact_text(fact: str) -> str:
    if fact.endswith("?"):  # a question for the owner ("מה המחיר?") is asked as it is
        return fact
    return f"לבדוק את {fact}" if fact.startswith("ה") else f"לבדוק: {fact}"


def owner_needs(post: dict) -> list[dict]:
    """[{kind: "photo"|"fact", text}] — what blocks this post, [] when nothing does.

    A photo: the card shows a photograph and there is none yet, or the post is about a
    real product/place/person and its image is not the owner's own (and they did not
    choose one made with AI). A fact: the writer flagged something only the owner knows
    (a price, a date) and the owner has not saved or approved the text since. Once the
    post is approved or published the owner has decided, and nothing is asked any more.
    """
    if _is_approved(post) or _is_published(post):
        return []
    needs: list[dict] = []
    if post_needs_photo(post):
        has_image = bool(_clean(post.get("image_url"), 800))
        own = has_image and str(post.get("image_source") or "") in OWNER_PHOTO_SOURCES
        chose_ai = has_image and str(post.get("image_preference") or "") == "ai"
        product_like = post.get("mix_type") in PRODUCT_IMAGE_MIX or bool(post.get("featured_item_id"))
        if not has_image or (product_like and not own and not chose_ai):
            subject = _clean(post.get("featured_item_name") or post.get("product"), 80)
            hint = _clean(post.get("photo_hint_he"), 200)
            text = hint or (f"תמונה של {subject}" if subject else "תמונה שמתאימה לפוסט")
            needs.append({"kind": "photo", "text": text})
    fact = _clean(post.get("owner_fact"), 120)
    if fact and not post.get("owner_fact_done"):
        needs.append({"kind": "fact", "text": _fact_text(fact)})
    return needs


def lifecycle(post: dict, needs: list | None = None) -> str:
    """needs_owner -> ready -> approved -> published -> measured (one vocabulary)."""
    results = post.get("results") if isinstance(post.get("results"), dict) else None
    if results and results.get("value") is not None:
        return "measured"
    if _is_published(post):
        return "published"
    if _is_approved(post):
        return "approved"
    if owner_needs(post) if needs is None else needs:
        return "needs_owner"
    return "ready"


# --- the view every reader gets ------------------------------------------------------------


def connected_view(
    post: dict,
    *,
    index: int,
    business_id,
    year,
    month,
    core: dict | None = None,
    website: str = "",
    design: dict | None = None,
) -> dict:
    """The post with every contract field (docs/posts-v2.md), old posts included.

    `design` is the post's Design DNA layout as `post_design.view_designs` computed it
    for the whole month (an old post's `overlay_theme` mapped onto a composition)."""
    view = {key: value for key, value in post.items() if key != "learning_key"}  # internal
    view["design"] = design or view_designs([post], None)[0]
    view["uid"] = _clean(post.get("uid"), 40) or backfill_uid(business_id, year, month, index)
    view["channel"] = channel_of(post)
    stored_link = post.get("plan_link") if isinstance(post.get("plan_link"), dict) else None
    link = plan_link(core, post.get("week")) if _has_plan(core) else (stored_link or plan_link(None, post.get("week")))
    view["plan_link"] = link
    view["mix_type"] = post.get("mix_type") if post.get("mix_type") in MIX_TYPES else None
    view["featured_item_id"] = _clean(post.get("featured_item_id"), 40) or None
    view["why_line"] = why_line(link.get("goal") or "", _audience_of(post)) or _clean(post.get("why_line"), 200)
    key = post_key_for(int(year or 0), int(month or 0), index, view)
    view["measure"] = measure_for(view, website, whatsapp_key=key)
    view["owner_needs"] = owner_needs(view)
    view["results"] = post.get("results") if isinstance(post.get("results"), dict) else None
    view["learning"] = _clean(post.get("learning"), 300) or None
    view["informed_by_note"] = _clean(post.get("informed_by_note"), 200) or None
    # "שונה לפי: קצר יותר": the last one-instruction rewrite, until the text is saved or approved.
    view["rewrite_instruction"] = _clean(post.get("rewrite_instruction"), 60) or None
    view["lifecycle"] = lifecycle(view, view["owner_needs"])
    return view


def connect_posts(posts: list, *, business_id, year, month, core: dict | None = None, website: str = "",
                  dna: dict | None = None) -> list:
    designs = view_designs(posts or [], dna)
    return [
        connected_view(post, index=index, business_id=business_id, year=year, month=month, core=core, website=website,
                       design=designs[index])
        if isinstance(post, dict)
        else post
        for index, post in enumerate(posts or [])
    ]


def strategy_core(roadmap: dict | None) -> dict:
    return {key: value for key, value in (roadmap or {}).items() if key != "posts"}


# --- visible traits (what a learning may point at) ------------------------------------------

_PRICE = re.compile(r"₪|ש\"ח|ש״ח|שקל|מחיר|\[מחיר\]")


def traits(post: dict) -> list[tuple[str, str]]:
    """What anyone can see in the post, most telling first: (key, Hebrew label)."""
    out: list[tuple[str, str]] = []
    on_image = " ".join(
        str(post.get(field) or "") for field in ("overlay_text", "overlay_headline", "overlay_badge", "stat_highlight")
    )
    in_text = " ".join(str(post.get(field) or "") for field in ("title", "hook", "caption"))
    if _PRICE.search(on_image):
        out.append(("price_on_image", "מחיר על התמונה"))
    elif _PRICE.search(in_text):
        out.append(("price_in_text", "מחיר בטקסט"))
    if post_cta_is_whatsapp(post):
        out.append(("whatsapp_cta", "הזמנה לכתוב בוואטסאפ"))
    if str(post.get("hook") or "").strip().endswith("?"):
        out.append(("question_hook", "שאלה בפתיחה"))
    if post.get("featured_item_id"):
        out.append(("featured", "מוצר שבחרתם להבליט"))
    if post.get("format") in FORMAT_HE:
        out.append((f"format:{post['format']}", FORMAT_HE[post["format"]]))
    if post.get("mix_type") in MIX_TYPES:
        out.append((f"mix:{post['mix_type']}", mix_name(post["mix_type"])))
    return out


def mix_name(key: str, model: str = "products") -> str:
    from app.services.quarter_plan import content_type_name  # avoids an import cycle

    return content_type_name(key, model) if key in MIX_TYPES else ""


# --- what worked so far -----------------------------------------------------------------------


def _order_key(record: dict) -> tuple:
    return (str(record.get("published_at") or f"{int(record['year']):04d}-{int(record['month']):02d}-01"),
            int(record["year"]), int(record["month"]), int(record["index"]))


def _records(strategies, website: str = "") -> list[dict]:
    """Every post of these months as (strategy, index, view), oldest month first."""
    out = []
    for strategy in strategies:
        extra = loads(strategy.roadmap_json, {}) or {}
        roadmap = extra.get("roadmap") if isinstance(extra.get("roadmap"), dict) else {}
        core = strategy_core(roadmap)
        for index, post in enumerate(roadmap.get("posts") or []):
            if not isinstance(post, dict):
                continue
            view = connected_view(post, index=index, business_id=strategy.business_id, year=strategy.year,
                                  month=strategy.month, core=core, website=website)
            out.append({"strategy": strategy, "index": index, "view": view, "year": strategy.year,
                        "month": strategy.month, "published_at": view.get("published_at")})
    return out


def _strategies(db, business_id: int) -> list:
    from app.models import Strategy

    return (
        db.query(Strategy)
        .filter(Strategy.business_id == business_id)
        .order_by(Strategy.year.asc(), Strategy.month.asc())
        .all()
    )


def measured(records: list[dict], exclude_uid: str | None = None) -> list[dict]:
    out = []
    for record in records:
        view = record["view"]
        results = view.get("results") or {}
        value = results.get("value")
        if value is None or view["uid"] == exclude_uid:
            continue
        metric = results.get("metric") if results.get("metric") in METRICS else view["measure"]["metric"]
        out.append({**record, "value": value, "metric": metric})
    return out


def _record_line(record: dict, model: str) -> str:
    view = record["view"]
    parts = [mix_name(view["mix_type"], model) if view.get("mix_type") else "",
             CHANNEL_HE.get(view["channel"], ""), FORMAT_HE.get(view.get("format"), "")]
    meta = ", ".join(part for part in parts if part)
    shown = ", ".join(label for key, label in traits(view) if not key.startswith(("mix:", "format:")))
    line = f"\"{_clean(view.get('title'), 80)}\" ({meta}): {count_he(record['metric'], record['value'])}."
    return line + (f" מה היה בו: {shown}." if shown else "")


def what_worked(db, business, exclude_uid: str | None = None, max_best: int = 3) -> dict:
    """{"block": prompt text, "refs": {"B1": {...}}} from this business's measured posts.

    Best and worst per measure (numbers of different measures are never compared), with
    the post's mix type, channel and visible traits. {"block": "", "refs": {}} when
    nothing was measured yet, and the prompt is then unchanged.
    """
    empty = {"block": "", "refs": {}}
    if db is None or business is None or getattr(business, "id", None) is None:
        return empty
    try:
        records = measured(_records(_strategies(db, business.id), business.website_url or ""), exclude_uid)
    except Exception:  # never let the learning block cost the owner a post
        log.exception("what-worked block failed for business %s", getattr(business, "id", None))
        return empty
    if not records:
        return empty
    model = getattr(business, "business_model", None) or "products"
    by_metric: dict[str, list[dict]] = {}
    for record in records:
        by_metric.setdefault(record["metric"], []).append(record)
    lines, refs = [], {}
    for metric, group in sorted(by_metric.items(), key=lambda item: -len(item[1]))[:max_best]:
        group = sorted(group, key=lambda r: (-r["value"], _order_key(r)))
        best = group[0]
        ref = f"B{len(refs) + 1}"
        refs[ref] = {"uid": best["view"]["uid"], "metric": metric, "value": best["value"],
                     "traits": traits(best["view"]), "title": _clean(best["view"].get("title"), 80)}
        head = (f"הכי הצליח מבין {len(group)} פוסטים שנמדדו ב{METRIC_LABEL_HE[metric]}"
                if len(group) > 1 else f"הפוסט היחיד שנמדד ב{METRIC_LABEL_HE[metric]}")
        lines.append(f"- [{ref}] {head}: {_record_line(best, model)}")
        worst = group[-1]
        if len(group) > 1 and worst["value"] < best["value"]:
            lines.append(f"- פחות הצליח: {_record_line(worst, model)}")
    block = "\n".join([
        "מה הצליח אצלכם עד עכשיו: פוסטים של העסק שפורסמו ונמדדו. מספרים אמיתיים בלבד, אל תוסיף אחרים:",
        *lines,
        "אם פוסט שאתה כותב ממשיך דפוס של פוסט שהצליח, כתוב את המזהה שלו (למשל B1) ב-applied_learning, "
        "והקפד שהדפוס באמת יופיע בפוסט. אחרת השאר ריק. אל תעתיק את הפוסטים, ואל תסיק סיבות שלא כתובות כאן.",
    ])
    return {"block": block, "refs": refs}


def what_worked_block(what: dict | None) -> str:
    return str((what or {}).get("block") or "") if isinstance(what, dict) else ""


def informed_note(post: dict, what: dict | None, ref) -> tuple[str | None, list[str]]:
    """("עודכן לפי מה שהצליח אצלכם: מחיר בטקסט", [source uid]) when the writer named a
    real learning and the post really shares a visible trait with that post; else (None, [])."""
    refs = (what or {}).get("refs") if isinstance(what, dict) else None
    key = _clean(ref, 10).strip("[]").upper()
    if not refs or key not in refs:
        return None, []
    source = refs[key]
    mine = {trait for trait, _ in traits(post)}
    # The same mix type alone is not a learning; a visible trait of that post is.
    shared = [label for trait, label in source.get("traits") or [] if trait in mine and not trait.startswith("mix:")]
    if not shared:
        return None, []
    return INFORMED_PREFIX_HE + shared[0], [source["uid"]]


# --- connecting freshly written posts -------------------------------------------------------


def prompt_rules() -> str:
    """The post writer's lines for the connected fields (services/strategy.posts_prompt)."""
    return "\n".join([
        "- primary_outlet: ערוץ אחד בלבד, הערוץ שהתוכנית בחרה לשבוע של הפוסט (media_distribution בתוכנית). "
        "זה הפוסט שבעל העסק יראה ויאשר, ו-caption נכתב לערוץ הזה בלבד.",
        "- outlet_captions: עותק קצר לשיתוף אופציונלי ברשתות האחרות. בערוץ שבחרת: אותו טקסט כמו caption.",
        f"- mix_type: סוג הפוסט בתמהיל התוכן, מפתח אחד מתוך: {', '.join(MIX_TYPES)}.",
        "- featured_item: אם הפוסט מבליט מוצר או שירות מהרשימה שבעל העסק בחר, השם שלו בדיוק כמו ברשימה. אחרת ריק.",
        "- owner_fact: פרט שרק בעל העסק יודע, שהפוסט תלוי בו ושלא מופיע בחומר (מחיר, תאריך, שעות, כמות). "
        "כתוב בקצרה מה לבדוק. בטקסט עצמו אל תמציא אותו: אם הוא חייב להופיע, כתוב [מחיר] או [תאריך] במקומו. אם אין — ריק.",
        "- applied_learning: מזהה מבלוק 'מה הצליח אצלכם' כשהפוסט ממשיך דפוס שלו. אם אין בלוק או שלא השתמשת — ריק.",
    ])


def _match_featured(name, items: list) -> tuple[str | None, str | None]:
    wanted = _WS.sub(" ", str(name or "")).strip().lower()
    if not wanted:
        return None, None
    for item in items or []:
        real = featured_name(item)
        if real and real.lower() == wanted:
            return featured_item_id(real), real
    return None, None


def finish_written(items: list[dict], business: dict, core: dict | None) -> list[dict]:
    """Connect posts the writer just returned to the plan. Mutates and returns `items`.

    The model chose a channel, a mix type, a featured item, an owner fact and the
    learning it applied; each is kept only if it is real: a channel the plan names for
    that week, a known mix type, an item on the owner's list, a learning ref from the
    block it was given that the post visibly follows.
    """
    business = business or {}
    what = business.get("what_worked") if isinstance(business.get("what_worked"), dict) else None
    featured = business.get("featured_items") or []
    for item in items:
        if not isinstance(item, dict):
            continue
        item["uid"] = _clean(item.get("uid"), 40) or new_uid()
        week = item.get("week")
        allowed = plan_channels(core, week)
        channel = str(item.get("primary_outlet") or "").lower()
        captions = item.get("outlet_captions") if isinstance(item.get("outlet_captions"), dict) else {}
        # A post the owner chose at /start keeps the channel it was shown with.
        if allowed and channel not in allowed and not item.get("chosen_at_signup"):
            channel = allowed[0]
            # The writer also wrote a copy for the plan's channel; that is this post now.
            if _clean(captions.get(channel), 2200):
                item["caption"] = captions[channel]
        if channel not in CHANNELS:
            channel = allowed[0] if allowed else "instagram"
        item["primary_outlet"] = channel
        item["channel"] = channel
        outlets = [str(o) for o in item.get("outlets") or [] if str(o or "").strip()]
        item["outlets"] = [channel, *[o for o in outlets if o != channel]]
        item["outlet_captions"] = {**captions, channel: item.get("caption") or ""}
        item["mix_type"] = item.get("mix_type") if item.get("mix_type") in MIX_TYPES else None
        fid, fname = _match_featured(item.pop("featured_item", ""), featured)
        item["featured_item_id"] = fid
        item["featured_item_name"] = fname
        item["owner_fact"] = _clean(item.get("owner_fact"), 120)
        item["owner_fact_done"] = False
        item["plan_link"] = plan_link(core, week)
        item["why_line"] = why_line(item["plan_link"]["goal"], _audience_of(item))
        note, sources = informed_note(item, what, item.pop("applied_learning", ""))
        item["informed_by_note"] = note
        item["informed_by"] = sources
        item.setdefault("results", None)
        item.setdefault("learning", None)
    return items


def tracking_fields(item: dict, website: str, campaign: str, with_query) -> dict:
    """utm / tracking_url / whatsapp_source_key / measure for one post (attach_tracking).

    A post that already carries a UTM content keeps it (and the link already handed
    out), so old posts keep matching. A new one gets the uid-based codes, stored on it.
    """
    item["uid"] = _clean(item.get("uid"), 40) or new_uid()
    utm = item.get("utm") if isinstance(item.get("utm"), dict) else None
    if not (utm and utm.get("utm_content")):
        source = item.get("primary_outlet") or "instagram"
        utm = {"utm_source": source, "utm_medium": "organic", "utm_campaign": campaign,
               "utm_content": f"p-{item['uid']}"}
        item["utm"] = utm
        item["tracking_url"] = with_query(website, utm) if website else ""
        item.setdefault("whatsapp_source_key", uid_post_source_key(item))
    elif "tracking_url" not in item:
        item["tracking_url"] = with_query(website, utm) if website else ""
    item["measure"] = measure_for(item, website, whatsapp_key=str(item.get("whatsapp_source_key") or ""))
    return item


# --- results back onto the post ---------------------------------------------------------------


def _number(value) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _permalink(value) -> str:
    text = str(value or "").strip().split("?", 1)[0].rstrip("/")
    return text.lower()


def _media_rows(db, business_id: int, meta_data: dict | None) -> list[dict]:
    """The business's Instagram posts with their numbers: this sync's, then the stored
    table (lifetime numbers kept from earlier syncs). A missing number stays None."""
    from app.models import InstagramPost

    rows: dict[str, dict] = {}
    for item in (meta_data or {}).get("posts") or []:
        if not isinstance(item, dict):
            continue
        insights = item.get("insights") if isinstance(item.get("insights"), dict) else {}
        key = str(item.get("id") or item.get("permalink") or "")
        rows[key] = {"id": key, "permalink": item.get("permalink") or "",
                     "caption": item.get("caption_full") or item.get("caption") or "",
                     "reach": _number(insights.get("reach")), "saves": _number(insights.get("saved"))}
    for row in db.query(InstagramPost).filter(InstagramPost.business_id == business_id).all():
        known = rows.get(row.media_id)
        if known is None:
            rows[row.media_id] = {"id": row.media_id, "permalink": row.permalink or "", "caption": row.caption or "",
                                  "reach": row.reach, "saves": row.saved}
        else:
            known["reach"] = known["reach"] if known["reach"] is not None else row.reach
            known["saves"] = known["saves"] if known["saves"] is not None else row.saved
    return list(rows.values())


def _clicks_by_key(db, business_id: int) -> dict[str, int]:
    from sqlalchemy import func

    from app.models import WhatsappClick, WhatsappLink

    rows = (
        db.query(WhatsappLink.source_key, func.coalesce(func.sum(WhatsappClick.count), 0))
        .outerjoin(WhatsappClick, WhatsappClick.link_id == WhatsappLink.id)
        .filter(WhatsappLink.business_id == business_id)
        .group_by(WhatsappLink.source_key)
        .all()
    )
    return {key: int(total or 0) for key, total in rows}


def _match_media(view: dict, media: list[dict], used: set[str]) -> tuple[dict | None, str]:
    published = _permalink(view.get("published_url"))
    if published:
        for item in media:
            if item["id"] not in used and _permalink(item.get("permalink")) == published:
                return item, "instagram_link"
    if view["channel"] != "instagram":
        return None, ""
    needle = _WS.sub(" ", str(view.get("caption") or "")).strip()[:40]
    if len(needle) < 20:
        return None, ""
    for item in media:
        if item["id"] not in used and needle in _WS.sub(" ", str(item.get("caption") or "")):
            return item, "instagram_caption"
    return None, ""


def _measure_post(view: dict, *, clicks: dict, campaigns: list, media: list, used: set, whatsapp_key: str) -> tuple[dict, list]:
    """This refresh's numbers for one post: {metric: value} and how each was matched."""
    metrics: dict = {}
    matched: list[str] = []
    if whatsapp_key in clicks:
        total = clicks[whatsapp_key]
        # A link nobody tapped is a real 0 only once the post is out; before that it is unknown.
        if total > 0 or _is_published(view):
            metrics["whatsapp_clicks"] = total
            matched.append("whatsapp_code")
    utm = view.get("utm") if isinstance(view.get("utm"), dict) else {}
    if campaigns and utm.get("utm_content"):
        rows = [row for row in campaigns if isinstance(row, dict)
                and row.get("sessionCampaignName") == utm.get("utm_campaign")
                and row.get("sessionManualAdContent") == utm.get("utm_content")]
        if rows:
            sessions = [_number(row.get("sessions")) for row in rows]
            conversions = [_number(row.get("conversions")) for row in rows]
            if any(value is not None for value in sessions):
                metrics["visits"] = sum(value or 0 for value in sessions)
            if any(value is not None for value in conversions):
                metrics["conversions"] = sum(value or 0 for value in conversions)
            matched.append("utm")
    hit, how = _match_media(view, media, used)
    if hit is not None:
        used.add(hit["id"])
        if hit.get("reach") is not None:
            metrics["reach"] = int(hit["reach"])
        if hit.get("saves") is not None:
            metrics["saves"] = int(hit["saves"])
        if hit.get("reach") is not None or hit.get("saves") is not None:
            matched.append(how)
    return metrics, matched


def _similar_earlier(target: dict, pool: list[dict]) -> dict | None:
    """The most recent earlier measured post with the same measure, mix type and channel."""
    view = target["view"]
    if not view.get("mix_type"):
        return None
    key = _order_key(target)
    candidates = [
        record for record in pool
        if record["view"]["uid"] != view["uid"]
        and record["metric"] == target["metric"]
        and record["view"].get("mix_type") == view["mix_type"]
        and record["view"]["channel"] == view["channel"]
        and _order_key(record) < key
    ]
    return max(candidates, key=_order_key) if candidates else None


def learning_facts(target: dict, other: dict | None) -> dict:
    """What the learning line may say, decided here: the number, the comparable's number,
    the direction, and one visible difference between the two posts."""
    value, metric = int(target["value"]), target["metric"]
    facts = {"ref": target["view"]["uid"], "metric": metric, "value": value, "compare": None,
             "direction": "first", "only_here": "", "only_there": ""}
    if other is None:
        return facts
    compare = int(other["value"])
    facts["compare"] = compare
    diff = value - compare
    if abs(diff) <= max(1, round(0.15 * compare)):
        facts["direction"] = "similar"
    else:
        facts["direction"] = "above" if diff > 0 else "below"
    mine = traits(target["view"])
    theirs = traits(other["view"])
    their_keys, my_keys = {k for k, _ in theirs}, {k for k, _ in mine}
    facts["only_here"] = next((label for k, label in mine if k not in their_keys and not k.startswith("mix:")), "")
    facts["only_there"] = next((label for k, label in theirs if k not in my_keys and not k.startswith("mix:")), "")
    return facts


def template_learning(facts: dict) -> str:
    """The plain sentence, used as is when the cheap model is unavailable or strays."""
    count = count_he(facts["metric"], facts["value"])
    direction = facts["direction"]
    if direction == "first" or facts.get("compare") is None:
        return f"{count}. זה הפוסט הראשון מהסוג הזה שמדדנו, נשווה אליו את הבאים."
    compare = f"{int(facts['compare']):,}"
    if direction == "above":
        line = f"{count}, יותר מהפוסט הדומה ({compare})."
        return line + (f" מה היה רק בפוסט הזה: {facts['only_here']}." if facts.get("only_here") else "")
    if direction == "below":
        line = f"{count}, פחות מהפוסט הדומה ({compare})."
        return line + (f" מה היה רק בפוסט הדומה: {facts['only_there']}." if facts.get("only_there") else "")
    return f"{count}, בערך כמו הפוסט הדומה ({compare})."


_CAUSE_WORDS = re.compile(r"בגלל|מפני ש|הודות|גרם|גרמה|כי(?![א-ת])|כנראה|בזכות|הסיבה")
_DIGITS = re.compile(r"\d[\d,]*")


def _acceptable(text: str, facts: dict) -> bool:
    """A phrased line keeps the facts: every number in it is one of ours (and ours is in
    it), it names no cause, and it stays one short line."""
    text = _clean(text, 400)
    if not text or len(text) > 160 or "\n" in text or _CAUSE_WORDS.search(text):
        return False
    allowed = {str(facts["value"])}
    if facts.get("compare") is not None:
        allowed.add(str(facts["compare"]))
    found = {token.replace(",", "") for token in _DIGITS.findall(text)}
    if facts["value"] != 1 and str(facts["value"]) not in found:
        return False
    return found <= allowed


def phrase_learnings(batch: list[dict]) -> dict[str, str]:
    """{ref: line} for every facts dict: the cheap model phrases, the server checks."""
    lines = {facts["ref"]: template_learning(facts) for facts in batch}
    if not batch:
        return lines
    listed = "\n".join(
        f"- {facts['ref']}: {dumps({k: v for k, v in facts.items() if k != 'ref'})} | משפט בסיס: {lines[facts['ref']]}"
        for facts in batch
    )
    prompt = f"""
נסח מחדש לכל פוסט משפט אחד קצר של "מה לומדים" לבעל עסק קטן, בעברית ישראלית מדוברת, עד 16 מילים.
מותר להשתמש רק בעובדות שכאן: המספר, המספר של הפוסט הדומה, הכיוון (above = יותר, below = פחות,
similar = בערך כמו, first = אין עוד פוסט דומה), ומה היה רק באחד מהם. אל תוסיף מספר, סיבה, הסבר או עצה.
אל תכתוב "בגלל", "כי" או "בזכות". אם אין לך ניסוח טוב יותר, החזר את משפט הבסיס כמו שהוא.
לכל פוסט החזר ref ו-text.

{listed}
"""
    try:
        parsed = loads(lite_json(prompt, LEARNING_LINES_SCHEMA, thinking_level="LOW"), {}) or {}
    except Exception as exc:  # the plain sentence is always there
        log.info("learning lines: cheap model unavailable (%s)", type(exc).__name__)
        return lines
    by_ref = {facts["ref"]: facts for facts in batch}
    for item in parsed.get("lines") or []:
        if not isinstance(item, dict):
            continue
        ref = str(item.get("ref") or "")
        if ref in by_ref and _acceptable(item.get("text"), by_ref[ref]):
            lines[ref] = _clean(item.get("text"), 160)
    return lines


def refresh_results(db, business, *, ga4_data: dict | None = None, meta_data: dict | None = None,
                    now: str | None = None) -> dict:
    """Write `results` (and `learning`) back onto every post of the business.

    Sources: WhatsApp taps per post code (always), GA4 rows by UTM campaign + content
    (when this refresh has a GA4 report), Instagram reach/saves by the post's link or
    caption (this refresh's media and the stored table). A number this refresh did not
    get keeps its earlier value; a post nothing ever matched keeps `results: None`.
    Then `compare` (the most recent earlier similar post) and `learning` are recomputed
    for every measured post. Changes are added to the session; the caller commits.
    """
    now = now or _now()
    strategies = _strategies(db, business.id)
    if not strategies:
        return {"updated": 0, "measured": 0}
    clicks = _clicks_by_key(db, business.id)
    campaigns = [row for row in (ga4_data or {}).get("campaigns") or [] if isinstance(row, dict)]
    media = _media_rows(db, business.id, meta_data)
    used: set[str] = set()
    website = business.website_url or ""
    stored: dict[int, tuple] = {}
    updated = 0
    for strategy in strategies:
        extra = loads(strategy.roadmap_json, {}) or {}
        roadmap = extra.get("roadmap") if isinstance(extra.get("roadmap"), dict) else None
        if not roadmap or not isinstance(roadmap.get("posts"), list):
            continue
        posts = roadmap["posts"]
        changed = ensure_uids(posts, strategy.business_id, strategy.year, strategy.month)
        core = strategy_core(roadmap)
        for index, post in enumerate(posts):
            if not isinstance(post, dict):
                continue
            view = connected_view(post, index=index, business_id=strategy.business_id, year=strategy.year,
                                  month=strategy.month, core=core, website=website)
            key = post_key_for(strategy.year, strategy.month, index, post)
            metrics, matched = _measure_post(view, clicks=clicks, campaigns=campaigns, media=media, used=used,
                                             whatsapp_key=key)
            if not metrics:
                continue
            previous = post.get("results") if isinstance(post.get("results"), dict) else {}
            results = {k: v for k, v in previous.items() if k not in ("value", "compare")}
            results.update(metrics)
            results["matched_by"] = sorted(set(previous.get("matched_by") or []) | set(matched))
            results["metric"] = view["measure"]["metric"]
            results["value"] = results.get(RESULT_KEY[view["measure"]["metric"]])
            results["updated_at"] = now
            post["results"] = results
            changed = True
            updated += 1
        stored[strategy.id] = (strategy, extra, changed)
    # compare + learning, across every month of the business
    records = measured(_records(strategies_with(stored), website))
    phrases: list[dict] = []
    pending: list[tuple[dict, dict, str]] = []
    for record in records:
        post = _stored_post(stored, record)
        if post is None:
            continue
        other = _similar_earlier(record, records)
        facts = learning_facts(record, other)
        # `direction` (above / below / similar) is decided here once, so the screen never
        # repeats the 15% rule.
        compare = ({"label": COMPARE_LABEL_HE, "value": int(other["value"]), "uid": other["view"]["uid"],
                    "direction": facts["direction"]}
                   if other is not None else None)
        results = dict(post.get("results") or {})
        if "compare" not in results or results.get("compare") != compare:
            results["compare"] = compare
            post["results"] = results
            _mark(stored, record)
        signature = dumps(facts)
        if post.get("learning_key") != signature or not post.get("learning"):
            phrases.append(facts)
            pending.append((record, post, signature))
    if phrases:
        lines = phrase_learnings(phrases)
        for record, post, signature in pending:
            post["learning"] = lines.get(record["view"]["uid"]) or template_learning(learning_facts(record, None))
            post["learning_key"] = signature
            _mark(stored, record)
    for strategy, extra, changed in stored.values():
        if changed:
            strategy.roadmap_json = dumps(extra)
    return {"updated": updated, "measured": len(records)}


def strategies_with(stored: dict) -> list:
    """Stand-ins for the strategies whose roadmap was just updated in memory."""

    class _Live:
        def __init__(self, strategy, extra):
            self.id = strategy.id
            self.business_id = strategy.business_id
            self.year = strategy.year
            self.month = strategy.month
            self.roadmap_json = dumps(extra)

    return [_Live(strategy, extra) for strategy, extra, _ in stored.values()]


def _stored_post(stored: dict, record: dict) -> dict | None:
    entry = stored.get(record["strategy"].id)
    if entry is None:
        return None
    posts = ((entry[1].get("roadmap") or {}).get("posts")) or []
    index = record["index"]
    return posts[index] if 0 <= index < len(posts) and isinstance(posts[index], dict) else None


def _mark(stored: dict, record: dict) -> None:
    strategy, extra, _ = stored[record["strategy"].id]
    stored[record["strategy"].id] = (strategy, extra, True)
