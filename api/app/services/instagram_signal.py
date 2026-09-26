"""Instagram signal for the post writer.

Until this module the post prompt saw the brand, the USP and the month plan and nothing
from Instagram, so every business got the same generic posts. Three real sources are
available through the existing Facebook Login connection, and only these:

- the business's own posts with their insights (stored on every performance sync in
  `InstagramPost`), ranked by saves + shares per person reached;
- other Business/Creator accounts the owner names (Business Discovery): public profile
  plus recent posts with like and comment counts — no reach, saves or shares;
- hashtag top posts (Hashtag Search), behind a flag, capped by Meta at 30 unique
  hashtags per 7 days per Instagram account.

Those become one monthly "inspiration brief" (a single Gemini call) whose every pattern
cites the post(s) it came from, and a Hebrew prompt block for `_write_posts_for_weeks` and
`rewrite_post`. The honesty rule applies throughout: a metric Meta did not return is
missing, never zero, and when there is no data the block says so and forbids claims
about "what worked".
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlparse

from sqlalchemy.orm import Session, object_session

from app.config import get_settings
from app.models import Business, HashtagQuery, InspirationBrief, InstagramPost, Integration
from app.security import decrypt_secret
from app.services import meta
from app.services.gemini import strategy_json
from app.services.hebrew_style import HEBREW_STYLE
from app.services.jsonutil import dumps, loads
from app.services.schemas_llm import INSPIRATION_BRIEF_SCHEMA

try:  # tzdata is not guaranteed on slim images; Israel time is a nicety, not a need.
    from zoneinfo import ZoneInfo

    ISRAEL_TZ = ZoneInfo("Asia/Jerusalem")
except Exception:  # pragma: no cover - depends on the host
    ISRAEL_TZ = timezone(timedelta(hours=3))

# --- handles --------------------------------------------------------------------------

MAX_HANDLES = 5
# Instagram usernames: up to 30 of a-z 0-9 . _ ; no leading/trailing dot, no "..".
_HANDLE_RE = re.compile(r"^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{1,30}$")
_INSTAGRAM_HOSTS = {"instagram.com", "www.instagram.com", "m.instagram.com", "instagr.am"}
_RESERVED_PATHS = {"p", "reel", "reels", "stories", "explore", "tv", "accounts"}


class HandleError(ValueError):
    """A username the owner typed that cannot be an Instagram username. Hebrew message."""


def normalize_handle(raw: str) -> str:
    value = (raw or "").strip()
    if not value:
        raise HandleError("לא הוזן שם משתמש.")
    # A pasted profile link is the most common input; take the username out of it.
    candidate = value if "://" in value else f"https://{value}"
    parsed = urlparse(candidate)
    if (parsed.hostname or "").lower() in _INSTAGRAM_HOSTS:
        segments = [part for part in parsed.path.split("/") if part]
        if not segments or segments[0].lower() in _RESERVED_PATHS:
            raise HandleError(f"'{value}' הוא קישור לפוסט ולא לפרופיל. הדביקו שם משתמש או קישור לפרופיל.")
        value = segments[0]
    value = value.lstrip("@").strip().lower()
    if not _HANDLE_RE.match(value):
        raise HandleError(
            f"'{raw.strip()}' הוא לא שם משתמש תקין באינסטגרם. שם משתמש הוא עד 30 תווים: אותיות באנגלית, "
            "ספרות, נקודה וקו תחתון, ולא מתחיל או נגמר בנקודה."
        )
    return value


def normalize_handles(raw: list[str] | None) -> list[str]:
    handles: list[str] = []
    for item in raw or []:
        if not isinstance(item, str) or not item.strip():
            continue
        handle = normalize_handle(item)
        if handle not in handles:
            handles.append(handle)
    if len(handles) > MAX_HANDLES:
        raise HandleError(f"אפשר לשמור עד {MAX_HANDLES} חשבונות אינסטגרם להשראה, והוספתם {len(handles)}.")
    return handles


def handles_for(business: Business) -> list[str]:
    stored = loads(getattr(business, "instagram_handles_json", "") or "[]", [])
    return [item for item in stored if isinstance(item, str)] if isinstance(stored, list) else []


# --- shared post helpers --------------------------------------------------------------

FORMAT_HE = {
    "reel": "רילס",
    "carousel": "קרוסלה",
    "image": "תמונה",
    "video": "סרטון",
    "story": "סטורי",
    "unknown": "לא ידוע",
}
_DAYS_HE = ["שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת", "ראשון"]


def format_of(media_type: str | None, product_type: str | None) -> str:
    product = (product_type or "").upper()
    kind = (media_type or "").upper()
    if product == "REELS":
        return "reel"
    if product == "STORY":
        return "story"
    if kind == "CAROUSEL_ALBUM":
        return "carousel"
    if kind == "VIDEO":
        return "video"
    if kind == "IMAGE":
        return "image"
    return "unknown"


def hook_of(caption: str | None, limit: int = 140) -> str:
    """The opening the reader sees before "more": the first non-empty line."""
    for line in (caption or "").splitlines():
        line = line.strip()
        if line:
            if len(line) > limit:
                cut = re.split(r"(?<=[.!?])\s", line, maxsplit=1)[0]
                line = cut if len(cut) <= limit else line[:limit].rstrip() + "…"
            return line
    return ""


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    for parser in (
        lambda raw: datetime.strptime(raw, "%Y-%m-%dT%H:%M:%S%z"),
        datetime.fromisoformat,
    ):
        try:
            parsed = parser(value)
        except (TypeError, ValueError):
            continue
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return None


def _timing(posted_at: str | None) -> dict:
    parsed = _parse_time(posted_at)
    if not parsed:
        return {"day_he": "", "hour_il": None}
    local = parsed.astimezone(ISRAEL_TZ)
    return {"day_he": f"יום {_DAYS_HE[local.weekday()]}", "hour_il": local.hour}


def _num(value) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _sum(*values: int | None) -> int | None:
    known = [value for value in values if value is not None]
    return sum(known) if known else None


# --- own posts: persistence -----------------------------------------------------------


def store_media(db: Session, business_id: int, meta_data: dict | None) -> int:
    """Upsert every post of one sync into `instagram_posts`. Caller commits.

    Latest numbers win. A metric that did not come back this time keeps NULL (and its
    reason) rather than an older value, so the table never mixes two syncs in one row.
    """
    posts = [item for item in (meta_data or {}).get("posts") or [] if isinstance(item, dict) and item.get("id")]
    if not posts:
        return 0
    ids = [str(item["id"]) for item in posts]
    existing = {
        row.media_id: row
        for row in db.query(InstagramPost)
        .filter(InstagramPost.business_id == business_id, InstagramPost.media_id.in_(ids))
        .all()
    }
    now = datetime.utcnow()
    for item in posts:
        media_id = str(item["id"])
        row = existing.get(media_id)
        if row is None:
            row = InstagramPost(business_id=business_id, media_id=media_id)
            db.add(row)
            existing[media_id] = row
        insights = item.get("insights") if isinstance(item.get("insights"), dict) else {}
        row.caption = item.get("caption_full") or item.get("caption") or ""
        row.media_type = item.get("media_type") or ""
        row.media_product_type = item.get("media_product_type") or ""
        row.permalink = item.get("permalink") or ""
        row.media_url = item.get("media_url") or ""
        row.thumbnail_url = item.get("thumbnail_url") or ""
        row.posted_at = item.get("timestamp") or ""
        row.like_count = _num(item.get("like_count"))
        row.comments_count = _num(item.get("comments_count"))
        row.views = _num(insights.get("views"))
        row.reach = _num(insights.get("reach"))
        row.saved = _num(insights.get("saved"))
        row.shares = _num(insights.get("shares"))
        row.metric_errors_json = dumps(item.get("insight_errors") or {})
        row.synced_at = now
    db.flush()
    return len(posts)


def own_post_dict(row: InstagramPost) -> dict:
    caption = row.caption or ""
    return {
        "kind": "own",
        "media_id": row.media_id,
        "caption": caption,
        "caption_length": len(caption),
        "hook": hook_of(caption),
        "format": format_of(row.media_type, row.media_product_type),
        "media_type": row.media_type or "",
        "media_product_type": row.media_product_type or "",
        "permalink": row.permalink or "",
        "media_url": row.media_url or "",
        "thumbnail_url": row.thumbnail_url or "",
        "posted_at": row.posted_at or "",
        **_timing(row.posted_at),
        "metrics": {
            "views": row.views,
            "reach": row.reach,
            "saved": row.saved,
            "shares": row.shares,
            "likes": row.like_count,
            "comments": row.comments_count,
        },
        "metric_errors": loads(row.metric_errors_json, {}) or {},
    }


# --- own posts: ranking ---------------------------------------------------------------

# Below this many people a ratio is noise: 2 saves out of 5 people is not "40%".
MIN_REACH = 20

SCORE_BASIS_HE = {
    "saves_shares_per_reach": "שמירות ושיתופים, ביחס למספר האנשים שראו את הפוסט",
    "engagement_per_reach": "לייקים ותגובות, ביחס למספר האנשים שראו את הפוסט (אין נתונים על שמירות ושיתופים)",
    "saves_shares_per_view": "שמירות ושיתופים, ביחס למספר הצפיות (אין נתון על כמה אנשים ראו)",
    "engagement_per_view": "לייקים ותגובות, ביחס למספר הצפיות (אין נתונים על כמה אנשים ראו, שמירות ושיתופים)",
    "raw_engagement": "לייקים ותגובות בלבד (אין נתון על כמה אנשים ראו)",
}
# Lower tier = more trustworthy basis. A post is only compared on the best basis it has.
_TIERS = {name: index for index, name in enumerate(SCORE_BASIS_HE)}


def score_post(post: dict) -> tuple[str, float] | None:
    """(basis, score) on the best basis this post's numbers support, or None.

    Saves and shares are the strongest signal that a post was worth something to the
    reader; divided by reach they compare posts of different sizes. Each fallback is
    used only when the metric above it is missing — never mixed within one post.
    """
    metrics = post.get("metrics") or {}
    reach, views = _num(metrics.get("reach")), _num(metrics.get("views"))
    deep = _sum(_num(metrics.get("saved")), _num(metrics.get("shares")))
    light = _sum(_num(metrics.get("likes")), _num(metrics.get("comments")))
    if reach is not None and reach >= MIN_REACH:
        if deep is not None:
            return "saves_shares_per_reach", deep / reach
        if light is not None:
            return "engagement_per_reach", light / reach
    if views is not None and views >= MIN_REACH:
        if deep is not None:
            return "saves_shares_per_view", deep / views
        if light is not None:
            return "engagement_per_view", light / views
    if light is not None:
        return "raw_engagement", float(light)
    return None


def rank_posts(posts: list[dict], n: int = 5) -> list[dict]:
    """The top `n` posts that actually earned something, best basis first.

    A post whose score is zero (nobody saved, shared, liked or commented) is not a "top
    post", so it is left out rather than padded in — fewer examples beat false ones.
    """
    scored = []
    for post in posts:
        result = score_post(post)
        if not result or result[1] <= 0:
            continue
        basis, value = result
        parsed = _parse_time(post.get("posted_at"))
        scored.append(
            (
                _TIERS[basis],
                -value,
                -(parsed.timestamp() if parsed else 0),
                {**post, "score": round(value, 4), "score_basis": basis, "score_basis_he": SCORE_BASIS_HE[basis]},
            )
        )
    scored.sort(key=lambda item: item[:3])
    return [item[3] for item in scored[:n]]


def _label(posts: list[dict], prefix: str) -> list[dict]:
    return [{**post, "ref": f"{prefix}{index + 1}"} for index, post in enumerate(posts)]


def own_posts(business: Business, db: Session | None = None, limit: int = 60) -> list[dict]:
    session = db or object_session(business)
    if session is None:
        return []
    rows = (
        session.query(InstagramPost)
        .filter(InstagramPost.business_id == business.id)
        .order_by(InstagramPost.posted_at.desc(), InstagramPost.id.desc())
        .limit(limit)
        .all()
    )
    return [own_post_dict(row) for row in rows]


def top_own_posts(business: Business, n: int = 5, db: Session | None = None) -> list[dict]:
    """The business's best posts, labelled O1..On, with caption, format, hook and numbers."""
    return _label(rank_posts(own_posts(business, db), n), "O")


# --- Meta connection ------------------------------------------------------------------


def meta_context(business: Business) -> dict | None:
    """What the Graph calls need, or None when Instagram is not connected.

    Business Discovery and Hashtag Search are documented against a *user* access token,
    so the stored long-lived user token is preferred and the page token is the fallback.
    """
    item: Integration | None = next(
        (i for i in business.integrations if i.provider == "meta" and i.status == "connected"), None
    )
    if not item or not item.access_token_enc:
        return None
    extra = loads(item.extra_json, {}) or {}
    instagram_id = extra.get("selected_instagram_id") or ""
    if not instagram_id:
        return None
    page_token = (extra.get("page_tokens") or {}).get(item.external_id) or ""
    try:
        user_token = decrypt_secret(item.access_token_enc)
    except Exception:
        user_token = ""
    token = user_token or page_token
    if not token:
        return None
    return {"instagram_id": instagram_id, "access_token": token}


# --- other accounts: Business Discovery -----------------------------------------------

_DISCOVERY_NOTES_HE = {
    "not_found": (
        "לא מצאנו את @{handle}. אפשר לקרוא רק חשבונות עסקיים או של יוצרים, שפתוחים לכולם. "
        "אולי החשבון פרטי או אישי, או שיש טעות בשם."
    ),
    "permission": "עוד אין לנו אישור מאינסטגרם לקרוא חשבונות של אחרים, ולכן לא קראנו את @{handle}.",
    "rate_limited": "אינסטגרם הגביל לזמן קצר את מספר הבקשות, ולכן לא קראנו את @{handle}. נסו שוב בעוד שעה.",
    "token": "החיבור לאינסטגרם פג, ולכן לא קראנו את @{handle}. חברו את אינסטגרם מחדש בעמוד החיבורים.",
    "invalid": "אינסטגרם דחה את הבקשה לקרוא את @{handle}.",
    "unavailable": "אינסטגרם לא עונה כרגע, ולכן לא קראנו את @{handle}. נסו שוב בעוד כמה דקות.",
    "other": "לא הצלחנו לקרוא את @{handle}. נסו שוב בעוד כמה דקות.",
}
# After one of these, every further handle would fail the same way: stop asking.
_STOP_KINDS = {"permission", "rate_limited", "token"}
# Per account: this many recent posts fetched, this many best ones kept for the brief.
DISCOVERY_MEDIA_LIMIT = 12
TOP_PER_COMPETITOR = 3
# Engagement per follower is meaningless on a tiny account.
MIN_FOLLOWERS = 100


def parse_discovery(handle: str, payload: dict) -> dict:
    """A Business Discovery object as a competitor entry with ranked posts."""
    followers = _num(payload.get("followers_count"))
    media = (payload.get("media") or {}).get("data") if isinstance(payload.get("media"), dict) else None
    posts = []
    for item in media or []:
        if not isinstance(item, dict):
            continue
        caption = item.get("caption") or ""
        likes, comments = _num(item.get("like_count")), _num(item.get("comments_count"))
        engagement = _sum(likes, comments)
        per_follower = (
            round(engagement / followers, 4)
            if engagement is not None and followers is not None and followers >= MIN_FOLLOWERS
            else None
        )
        posts.append(
            {
                "kind": "competitor",
                "handle": handle,
                "media_id": str(item.get("id") or ""),
                "caption": caption[:600],
                "caption_length": len(caption),
                "hook": hook_of(caption),
                "format": format_of(item.get("media_type"), item.get("media_product_type")),
                "media_type": item.get("media_type") or "",
                "media_product_type": item.get("media_product_type") or "",
                "permalink": item.get("permalink") or "",
                "posted_at": item.get("timestamp") or "",
                **_timing(item.get("timestamp")),
                # Public counts only. `likes` is None when the owner hides like counts.
                "metrics": {"likes": likes, "comments": comments},
                "engagement": engagement,
                "engagement_per_follower": per_follower,
            }
        )
    ranked = sorted(
        (post for post in posts if post["engagement"]),
        key=lambda post: (
            -(post["engagement_per_follower"] if post["engagement_per_follower"] is not None else -1),
            -(post["engagement"] or 0),
        ),
    )
    return {
        "handle": handle,
        "ok": True,
        "error_kind": "",
        "error_he": "",
        "profile": {
            "username": payload.get("username") or handle,
            "name": payload.get("name") or "",
            "followers_count": followers,
            "media_count": _num(payload.get("media_count")),
        },
        "posts_seen": len(posts),
        "posts": ranked[:TOP_PER_COMPETITOR],
    }


def _failed_handle(handle: str, kind: str, detail: str = "") -> dict:
    note = _DISCOVERY_NOTES_HE.get(kind, _DISCOVERY_NOTES_HE["other"]).format(handle=handle)
    return {
        "handle": handle,
        "ok": False,
        "error_kind": kind,
        "error_he": note,
        "error_detail": detail[:300],
        "profile": None,
        "posts_seen": 0,
        "posts": [],
    }


def competitor_posts(handles: list[str], *, instagram_id: str, access_token: str) -> list[dict]:
    """Business Discovery for up to five handles. Never raises; failures are per handle."""
    results = []
    stopped: tuple[str, str] | None = None
    for handle in handles[:MAX_HANDLES]:
        if stopped:
            results.append(_failed_handle(handle, *stopped))
            continue
        try:
            raw = meta.business_discovery(instagram_id, access_token, handle, DISCOVERY_MEDIA_LIMIT)
        except meta.GraphError as exc:
            results.append(_failed_handle(handle, exc.kind, str(exc)))
            if exc.kind in _STOP_KINDS:
                stopped = (exc.kind, str(exc))
            continue
        results.append(parse_discovery(handle, raw))
    return results


# --- hashtags (flagged) ---------------------------------------------------------------

HASHTAG_WEEKLY_LIMIT = 30
HASHTAG_WINDOW = timedelta(days=7)
MAX_TAGS_PER_REFRESH = 5
_TAG_RE = re.compile(r"^\w{1,100}$", re.UNICODE)


def normalize_tag(raw: str) -> str:
    tag = (raw or "").strip().lstrip("#").strip().lower()
    if not _TAG_RE.match(tag):
        raise HandleError(f"'{raw}' אינו האשטאג תקין.")
    return tag


def hashtag_usage(db: Session, instagram_id: str, now: datetime | None = None) -> set[str]:
    """Unique hashtags queried for this IG account in the last 7 days."""
    since = (now or datetime.utcnow()) - HASHTAG_WINDOW
    rows = (
        db.query(HashtagQuery.hashtag)
        .filter(HashtagQuery.instagram_id == instagram_id, HashtagQuery.queried_at >= since)
        .distinct()
        .all()
    )
    return {row[0] for row in rows}


def hashtag_status(db: Session, business: Business) -> dict:
    ctx = meta_context(business)
    used = len(hashtag_usage(db, ctx["instagram_id"])) if ctx else 0
    return {
        "enabled": bool(get_settings().instagram_hashtag_search),
        "used_7d": used,
        "limit": HASHTAG_WEEKLY_LIMIT,
    }


def hashtag_top_posts(
    db: Session,
    business: Business,
    tags: list[str],
    *,
    instagram_id: str,
    access_token: str,
    now: datetime | None = None,
) -> dict:
    """Top posts for up to five hashtags, inside Meta's 30-per-week cap. Never raises.

    Every query of a tag (search or its top media) is recorded, and a tag already queried
    in the window is free; a new tag once 30 are used is skipped with a note. This is
    deliberately stricter than Meta's wording, so the app never learns the limit from an
    error.
    """
    settings = get_settings()
    base = {"enabled": bool(settings.instagram_hashtag_search), "limit": HASHTAG_WEEKLY_LIMIT, "results": []}
    if not settings.instagram_hashtag_search:
        return {
            **base,
            "used_7d": len(hashtag_usage(db, instagram_id, now)),
            "note_he": "החיפוש לפי האשטאג כבוי. כדי להפעיל אותו צריך אישור מיוחד מאינסטגרם (Instagram Public Content Access).",
        }
    now = now or datetime.utcnow()
    used = hashtag_usage(db, instagram_id, now)
    results = []
    normalized: list[str] = []
    for raw in tags or []:
        try:
            tag = normalize_tag(raw)
        except HandleError as exc:
            results.append({"tag": raw, "ok": False, "error_he": str(exc), "posts": []})
            continue
        if tag not in normalized:
            normalized.append(tag)
    for tag in normalized[:MAX_TAGS_PER_REFRESH]:
        if tag not in used and len(used) >= HASHTAG_WEEKLY_LIMIT:
            results.append(
                {
                    "tag": tag,
                    "ok": False,
                    "error_he": f"הגענו למכסה של אינסטגרם: עד {HASHTAG_WEEKLY_LIMIT} האשטאגים שונים בשבוע. לא בדקנו את #{tag}.",
                    "posts": [],
                }
            )
            continue
        cached = (
            db.query(HashtagQuery)
            .filter(
                HashtagQuery.instagram_id == instagram_id,
                HashtagQuery.hashtag == tag,
                HashtagQuery.hashtag_id != "",
            )
            .order_by(HashtagQuery.queried_at.desc())
            .first()
        )
        try:
            tag_id = cached.hashtag_id if cached else meta.hashtag_id(instagram_id, access_token, tag)
        except meta.GraphError as exc:
            if exc.kind == "not_found":
                db.add(HashtagQuery(business_id=business.id, instagram_id=instagram_id, hashtag=tag, queried_at=now))
                used.add(tag)
            results.append({"tag": tag, "ok": False, "error_he": f"#{tag}: {exc}", "posts": []})
            continue
        db.add(
            HashtagQuery(
                business_id=business.id, instagram_id=instagram_id, hashtag=tag, hashtag_id=tag_id, queried_at=now
            )
        )
        used.add(tag)
        try:
            media = meta.hashtag_top_media(instagram_id, access_token, tag_id)
        except meta.GraphError as exc:
            results.append({"tag": tag, "ok": False, "error_he": f"#{tag}: {exc}", "posts": []})
            continue
        parsed = parse_discovery(tag, {"media": {"data": media}})["posts"]
        for post in parsed:
            post["kind"] = "hashtag"
            post["handle"] = ""
            post["hashtag"] = tag
        results.append({"tag": tag, "ok": True, "error_he": "", "posts": parsed})
    db.flush()
    return {**base, "used_7d": len(used), "results": results}


# --- the brief ------------------------------------------------------------------------

CATEGORY_HE = {
    "format": "פורמט",
    "hook": "משפט פתיחה",
    "caption_length": "אורך הכיתוב",
    "cta": "קריאה לפעולה",
    "timing": "ימים ושעות",
    "topic": "נושא",
}


def _metrics_line(post: dict) -> str:
    labels = {
        "views": "צפיות",
        "reach": "הגעה",
        "saved": "שמירות",
        "shares": "שיתופים",
        "likes": "לייקים",
        "comments": "תגובות",
    }
    parts = [
        f"{labels[key]} {value:,}"
        for key, value in (post.get("metrics") or {}).items()
        if key in labels and value is not None
    ]
    return ", ".join(parts) if parts else "אין מדדים"


def _when(post: dict) -> str:
    if not post.get("day_he"):
        return ""
    hour = post.get("hour_il")
    return f"{post['day_he']} {hour:02d}:00" if hour is not None else post["day_he"]


def _source_line(post: dict, caption_chars: int = 300) -> str:
    who = {
        "own": "העסק",
        "competitor": f"@{post.get('handle')}",
        "hashtag": f"#{post.get('hashtag')}",
    }.get(post.get("kind"), "")
    caption = (post.get("caption") or "").replace("\n", " / ")
    if len(caption) > caption_chars:
        caption = caption[:caption_chars].rstrip() + "…"
    return (
        f"[{post.get('ref')}] {who} | {FORMAT_HE.get(post.get('format'), post.get('format'))} | "
        f"פורסם: {_when(post) or 'לא ידוע'} | אורך כיתוב: {post.get('caption_length', 0)} תווים | "
        f"{_metrics_line(post)}\n    הוק: \"{post.get('hook') or ''}\"\n    כיתוב: {caption}"
    )


def brief_prompt(business: dict, own: list[dict], competitors: list[dict], hashtags: list[dict]) -> str:
    own_block = "\n".join(_source_line(post, 500) for post in own) or "אין — לא סונכרנו פוסטים של העסק עם מדדים."
    comp_posts = [post for entry in competitors for post in entry.get("posts") or []]
    comp_block = "\n".join(_source_line(post) for post in comp_posts) or "אין."
    failed = [entry.get("error_he") for entry in competitors if not entry.get("ok")]
    tag_block = "\n".join(_source_line(post) for post in hashtags)
    return f"""
נתח את הפוסטים הבאים באינסטגרם והפק ניתוח דפוסים קצר לעסק ישראלי קטן, שישמש לכתיבת הפוסטים של החודש.

עסק: {business.get("name")} — {business.get("business_type")}

הפוסטים של העסק עצמו שהכי עבדו (מדורגים לפי שמירות ושיתופים ביחס לאנשים שהגיעו):
{own_block}

פוסטים מובילים של חשבונות אחרים שבעל העסק בחר (מתחרים או השראה). יש להם רק לייקים ותגובות ציבוריים —
אין הגעה, שמירות או שיתופים, ולכן הם מראים מה מושך תגובה בתחום, לא מה עבד לעסק הזה:
{comp_block}
{f"חשבונות שלא נקראו: {failed}" if failed else ""}
{f"פוסטים מובילים בהאשטאגים:{chr(10)}{tag_block}" if tag_block else ""}

הנחיות:
1. החזר רק דפוסים שנראים בנתונים: פורמטים שעובדים, מבנה ההוק, אורך הכיתוב, סגנון הקריאה לפעולה, ימים ושעות פרסום, נושאים.
2. כל דפוס חייב לצטט ב-source_refs את מזהי הפוסטים שהוא נלמד מהם (למשל O1, C2). אסור מזהה שלא מופיע למעלה.
3. אל תמציא מספרים. evidence מצטט רק מספרים שמופיעים למעלה. אם דפוס נשען על פוסט אחד — strength=weak.
4. הבחן בין מה שעבד לעסק (O) לבין מה שמושך תגובות אצל אחרים (C/H). אל תציג דפוס של מתחרה כהצלחה של העסק.
5. ימים ושעות: רק אם יש לפחות שני פוסטים שמראים אותו דבר; אחרת אל תחזיר דפוס timing.
6. ב-caveats כתוב במפורש כמה פוסטים נותחו ומה חסר (למשל אין פוסטים של העסק, חשבון שלא נמצא, מעט נתונים).
7. summary: עד שלושה משפטים בעברית פשוטה לבעל העסק, בלי מונחים כמו engagement או reach.

{HEBREW_STYLE}
"""


def _catalogue(own: list[dict], competitors: list[dict], hashtags: list[dict]) -> dict[str, dict]:
    catalogue = {post["ref"]: post for post in own}
    for entry in competitors:
        for post in entry.get("posts") or []:
            catalogue[post["ref"]] = post
    for post in hashtags:
        catalogue[post["ref"]] = post
    return catalogue


def clean_brief(raw: dict, known_refs: set[str]) -> dict:
    """The model output with every citation checked against the posts it was given.

    A pattern left with no real source is dropped: an uncited pattern is exactly the
    invented "what worked" the product refuses to show.
    """
    patterns = []
    for item in (raw or {}).get("patterns") or []:
        if not isinstance(item, dict) or not (item.get("pattern") or "").strip():
            continue
        refs = []
        for ref in item.get("source_refs") or []:
            ref = str(ref).strip().upper()
            if ref in known_refs and ref not in refs:
                refs.append(ref)
        if not refs:
            continue
        category = item.get("category") if item.get("category") in CATEGORY_HE else "topic"
        patterns.append(
            {
                "category": category,
                "pattern": item["pattern"].strip(),
                "evidence": (item.get("evidence") or "").strip(),
                "source_refs": refs,
                "strength": "strong" if item.get("strength") == "strong" else "weak",
            }
        )
    return {
        "summary": ((raw or {}).get("summary") or "").strip(),
        "patterns": patterns,
        "caveats": [str(item).strip() for item in (raw or {}).get("caveats") or [] if str(item).strip()],
    }


def build_inspiration_brief(
    db: Session,
    business: Business,
    year: int,
    month: int,
    *,
    own: list[dict],
    competitors: list[dict],
    hashtags: dict | None = None,
) -> InspirationBrief | None:
    """One Gemini call over the labelled sources, stored per business per month.

    Returns None — and calls nothing — when there is not a single post to learn from:
    a brief written from zero posts could only be invented.
    """
    # One running C-number across all accounts, so every ref is unique in the prompt.
    labelled = []
    counter = 0
    for entry in competitors:
        posts = []
        for post in entry.get("posts") or []:
            counter += 1
            posts.append({**post, "ref": f"C{counter}"})
        labelled.append({**entry, "posts": posts})
    competitors = labelled
    tag_posts = [post for result in (hashtags or {}).get("results") or [] for post in result.get("posts") or []]
    tag_posts = _label(tag_posts[:9], "H")
    own = _label([{k: v for k, v in post.items() if k != "ref"} for post in own], "O")

    catalogue = _catalogue(own, competitors, tag_posts)
    if not catalogue:
        return None

    payload = {"name": business.name, "business_type": business.business_type}
    raw = loads(strategy_json(brief_prompt(payload, own, competitors, tag_posts), INSPIRATION_BRIEF_SCHEMA), {})
    brief = clean_brief(raw, set(catalogue))

    row = (
        db.query(InspirationBrief)
        .filter(InspirationBrief.business_id == business.id, InspirationBrief.year == year, InspirationBrief.month == month)
        .first()
    )
    if row is None:
        row = InspirationBrief(business_id=business.id, year=year, month=month)
        db.add(row)
    row.brief_json = dumps(brief)
    row.sources_json = dumps(
        {
            "own": own,
            "competitors": competitors,
            "hashtags": {**(hashtags or {}), "posts": tag_posts} if hashtags else None,
        }
    )
    row.updated_at = datetime.utcnow()
    db.flush()
    return row


def brief_for(db: Session, business_id: int, year: int, month: int) -> InspirationBrief | None:
    """This month's brief, else the newest earlier one, else the newest at all."""
    rows = (
        db.query(InspirationBrief)
        .filter(InspirationBrief.business_id == business_id)
        .order_by(InspirationBrief.year.desc(), InspirationBrief.month.desc())
        .all()
    )
    for row in rows:
        if (row.year, row.month) <= (year, month):
            return row
    return rows[0] if rows else None


def _compact_source(post: dict) -> dict:
    return {
        "ref": post.get("ref"),
        "kind": post.get("kind"),
        "handle": post.get("handle") or "",
        "hashtag": post.get("hashtag") or "",
        "format": post.get("format"),
        "format_he": FORMAT_HE.get(post.get("format"), ""),
        "hook": post.get("hook") or "",
        "permalink": post.get("permalink") or "",
        "posted_at": post.get("posted_at") or "",
        "when_he": _when(post),
        "caption_length": post.get("caption_length", 0),
        "metrics": post.get("metrics") or {},
    }


def serialize_brief(row: InspirationBrief | None, current_own: list[dict] | None = None) -> dict | None:
    """The stored brief with citations resolved to real posts.

    `current_own` (labelled O1..On now) re-labels the brief's own-post refs by media id,
    so "O1" means the same post in the brief and in the post prompt. A cited own post that
    is no longer in the current top gets the next free O number.
    """
    if row is None:
        return None
    brief = loads(row.brief_json, {}) or {}
    sources = loads(row.sources_json, {}) or {}
    own_then = [post for post in sources.get("own") or [] if isinstance(post, dict)]
    competitors = [entry for entry in sources.get("competitors") or [] if isinstance(entry, dict)]
    hashtags = sources.get("hashtags") or None
    tag_posts = [post for post in (hashtags or {}).get("posts") or [] if isinstance(post, dict)]

    rename: dict[str, str] = {}
    catalogue: dict[str, dict] = {}
    if current_own is not None:
        by_media = {post.get("media_id"): post["ref"] for post in current_own}
        next_index = len(current_own)
        for post in own_then:
            new_ref = by_media.get(post.get("media_id"))
            if not new_ref:
                next_index += 1
                new_ref = f"O{next_index}"
            rename[post["ref"]] = new_ref
            catalogue[new_ref] = {**post, "ref": new_ref}
        for post in current_own:
            catalogue[post["ref"]] = post
    else:
        catalogue.update({post["ref"]: post for post in own_then})
    for entry in competitors:
        for post in entry.get("posts") or []:
            catalogue[post["ref"]] = post
    for post in tag_posts:
        catalogue[post["ref"]] = post

    patterns = []
    for item in brief.get("patterns") or []:
        refs = [rename.get(ref, ref) for ref in item.get("source_refs") or []]
        refs = [ref for ref in refs if ref in catalogue]
        if not refs:
            continue
        patterns.append(
            {
                **item,
                "category_he": CATEGORY_HE.get(item.get("category"), ""),
                "source_refs": refs,
                "sources": [_compact_source(catalogue[ref]) for ref in refs],
            }
        )
    cited = {ref for item in patterns for ref in item["source_refs"]}
    return {
        "id": row.id,
        "year": row.year,
        "month": row.month,
        "summary": brief.get("summary") or "",
        "patterns": patterns,
        "caveats": brief.get("caveats") or [],
        "created_at": row.created_at.isoformat() if row.created_at else "",
        "updated_at": row.updated_at.isoformat() if row.updated_at else "",
        "sources": {
            "own": [_compact_source({**post, "ref": rename.get(post["ref"], post["ref"])}) for post in own_then],
            "competitors": [
                {
                    "handle": entry.get("handle"),
                    "ok": bool(entry.get("ok")),
                    "error_he": entry.get("error_he") or "",
                    "profile": entry.get("profile"),
                    "posts_seen": entry.get("posts_seen", 0),
                    "posts": [_compact_source(post) for post in entry.get("posts") or []],
                }
                for entry in competitors
            ],
            "hashtags": [_compact_source(post) for post in tag_posts],
        },
        # Every ref a post may cite, so `attach_inspiration` can resolve it.
        "catalogue": {ref: _compact_source(post) for ref, post in catalogue.items() if ref in cited},
    }


# --- the signal handed to the post writer ---------------------------------------------


def signal_for(db: Session, business: Business, year: int | None = None, month: int | None = None) -> dict:
    """Everything the post prompt may use from Instagram, JSON-safe. Never raises."""
    today = date.today()
    year, month = year or today.year, month or today.month
    try:
        own = top_own_posts(business, 5, db=db)
        brief = serialize_brief(brief_for(db, business.id, year, month), own)
        synced = db.query(InstagramPost).filter(InstagramPost.business_id == business.id).count()
        connected = meta_context(business) is not None
    except Exception:
        return {"connected": False, "own_posts_synced": 0, "own_top_posts": [], "brief": None, "catalogue": {}}
    catalogue = {post["ref"]: _compact_source(post) for post in own}
    if brief:
        catalogue.update(brief.get("catalogue") or {})
    return {
        "connected": connected,
        "own_posts_synced": synced,
        "own_top_posts": own,
        "brief": brief,
        "catalogue": catalogue,
    }


NOT_CONNECTED_HE = "אין נתוני אינסטגרם מחוברים לעסק הזה: לא סונכרנו פוסטים עם מדדים ואין ניתוח השראה."
CONNECTED_NO_POSTS_HE = (
    "אינסטגרם מחובר, אבל עדיין אין פוסטים עם מדדים שאפשר ללמוד מהם ואין ניתוח השראה."
)
NO_CLAIMS_HE = (
    "אסור לטעון מה עבד או לא עבד באינסטגרם, אסור להמציא מדדים, ואסור לכתוב 'הפוסט הכי מצליח שלכם' או דומה. "
    "כתוב לפי התוכנית ושפת המותג בלבד, והחזר inspiration_refs ריק ו-inspiration_note ריק."
)

_GENERIC_OPENERS = "'היי לכולם', 'מחפשים...?', 'הגיע הזמן ל...', 'אנחנו שמחים להציג', 'מי לא אוהב...?', 'רגע לפני...'"


def _variety_rule(has_patterns: bool, rewrite: bool) -> str:
    if rewrite:
        base = (
            f"ההוק חייב להיות ספציפי לעסק ולפוסט: פרט אמיתי, רגע, ניגוד או שאלה חדה. אסור לפתוח בפתיח גנרי כמו {_GENERIC_OPENERS}."
        )
        return base + (
            " אם דפוס מהנתונים שלמעלה מתאים לפוסט הזה — השתמש בו וצטט אותו ב-inspiration_refs." if has_patterns else ""
        )
    base = (
        "גיוון: אל תחזור על אותו פורמט ביותר משני פוסטים, ואל תפתח שני פוסטים באותו מבנה הוק "
        "(שאלה, מספר, ציטוט, פרט מאחורי הקלעים, ניגוד). "
        f"אסור לפתוח בפתיחים גנריים כמו {_GENERIC_OPENERS}. ההוק חייב להיות ספציפי לעסק."
    )
    if has_patterns:
        base += (
            " בחר פורמטים, מבני הוק, אורכי כיתוב וקריאות לפעולה לפי הנתונים שלמעלה, והעדף דפוסים חזקים ודפוסים של העסק "
            "עצמו (O) על פני דפוסים של אחרים (C/H). לכל פוסט שנשען על דפוס — מלא inspiration_refs ו-inspiration_note."
        )
    return base


def prompt_block(signal: dict | None, *, rewrite: bool = False) -> str:
    """The Hebrew Instagram block for the post prompt.

    (a) the business's own top posts, as examples to learn from and never to copy;
    (b) the month's brief with its cited patterns; (c) an explicit "no Instagram data"
    when there is neither — plus the variety rule in every case.
    """
    signal = signal or {}
    own = signal.get("own_top_posts") or []
    brief = signal.get("brief") or None
    patterns = (brief or {}).get("patterns") or []
    if not own and not patterns:
        reason = CONNECTED_NO_POSTS_HE if signal.get("connected") else NOT_CONNECTED_HE
        return f"נתוני אינסטגרם:\n{reason} {NO_CLAIMS_HE}\n{_variety_rule(False, rewrite)}"

    parts = ["נתוני אינסטגרם אמיתיים של העסק — ללמוד מהם, לא להעתיק. אסור להעתיק כיתוב או הוק מילה במילה."]
    if own:
        parts.append(
            "הפוסטים של העסק שהכי עבדו (לפי שמירות ושיתופים ביחס לאנשים שהגיעו; המספרים מ-Meta):\n"
            + "\n".join(_source_line(post, 220) for post in own)
        )
    else:
        parts.append("אין עדיין פוסטים של העסק עצמו עם מדדים — אל תטען מה עבד אצלו.")
    if patterns:
        month_label = f"{brief.get('month')}/{brief.get('year')}"
        lines = [
            f"- [{item.get('category_he') or item.get('category')}] {item.get('pattern')} "
            f"({'חזק' if item.get('strength') == 'strong' else 'חלש'}; מקור: {', '.join(item.get('source_refs') or [])})"
            for item in patterns
        ]
        parts.append(f"ניתוח ההשראה ({month_label}): {brief.get('summary') or ''}\n" + "\n".join(lines))
        shown = {post.get("ref") for post in own}
        others = [
            source
            for ref, source in (brief.get("catalogue") or {}).items()
            if ref not in shown
        ]
        if others:
            parts.append(
                "המקורות שהניתוח מצטט (לחשבונות אחרים יש רק לייקים ותגובות ציבוריים — זו לא הצלחה של העסק):\n"
                + "\n".join(
                    f"[{source.get('ref')}] "
                    f"{'@' + source['handle'] if source.get('handle') else ('#' + source['hashtag'] if source.get('hashtag') else 'העסק')} | "
                    f"{source.get('format_he')} | הוק: \"{source.get('hook')}\" | {_metrics_line(source)}"
                    for source in others
                )
            )
        if brief.get("caveats"):
            parts.append("מגבלות הנתונים: " + " ".join(brief["caveats"]))
    parts.append(
        "מותר לצטט מספר רק אם הוא מופיע כאן. inspiration_refs מכיל רק מזהים מהבלוק הזה (O/C/H)."
    )
    parts.append(_variety_rule(bool(patterns) or bool(own), rewrite))
    return "\n\n".join(parts)


def attach_inspiration(items: list[dict], signal: dict | None) -> list[dict]:
    """Resolve each post's `inspiration_refs` to real sources, dropping unknown refs.

    The result is `post["inspiration"] = {"note", "sources": [...]}` or None. A note with
    no surviving source is dropped with it: "this follows your top reel" must point at a
    reel that exists.
    """
    catalogue = (signal or {}).get("catalogue") or {}
    out = []
    for post in items:
        item = dict(post)
        refs = item.pop("inspiration_refs", None) or []
        note = (item.pop("inspiration_note", None) or "").strip()
        sources = []
        for ref in refs:
            key = str(ref).strip().upper()
            if key in catalogue and all(source["ref"] != key for source in sources):
                sources.append(catalogue[key])
        item["inspiration"] = {"note": note, "sources": sources} if sources else None
        out.append(item)
    return out


# --- orchestration used by the router ---------------------------------------------------


def refresh_brief(
    db: Session, business: Business, year: int, month: int, hashtags: list[str] | None = None
) -> dict:
    """Fetch, distill, store. Returns {"status", "reason_he", "competitors", "hashtags"}.

    status: "created" | "empty". Only a Gemini failure raises.
    """
    own = top_own_posts(business, 5, db=db)
    ctx = meta_context(business)
    handles = handles_for(business)
    competitors: list[dict] = []
    tag_result: dict | None = None
    if ctx and handles:
        competitors = competitor_posts(handles, **ctx)
    elif handles:
        competitors = [
            {
                **_failed_handle(handle, "other"),
                "error_kind": "not_connected",
                "error_he": f"לא קראנו את @{handle}, כי אינסטגרם לא מחובר. חברו אותו בעמוד החיבורים.",
            }
            for handle in handles
        ]
    if ctx and hashtags:
        tag_result = hashtag_top_posts(db, business, hashtags, **ctx)

    has_competitor_posts = any(entry.get("posts") for entry in competitors)
    has_tag_posts = any(result.get("posts") for result in (tag_result or {}).get("results") or [])
    if not own and not has_competitor_posts and not has_tag_posts:
        if not ctx:
            reason = "אינסטגרם לא מחובר, ולכן אין פוסטים לבדוק. חברו אותו בעמוד החיבורים, ואז רעננו את הנתונים בעמוד הביצועים."
        elif not handles:
            reason = (
                "עוד אין פוסטים שלכם עם נתונים (רעננו אותם בעמוד הביצועים), ולא בחרתם חשבונות להשראה. "
                "הוסיפו עד 5 חשבונות אינסטגרם של מתחרים או של עסקים שאתם אוהבים."
            )
        else:
            reason = "לא מצאנו פוסטים לבדוק. עוד אין פוסטים שלכם עם נתונים, ומהחשבונות שבחרתם לא הגיעו פוסטים."
        db.commit()
        return {"status": "empty", "reason_he": reason, "competitors": competitors, "hashtags": tag_result}

    build_inspiration_brief(
        db, business, year, month, own=own, competitors=competitors, hashtags=tag_result
    )
    db.commit()
    return {"status": "created", "reason_he": "", "competitors": competitors, "hashtags": tag_result}
