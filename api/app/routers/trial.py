"""The free first month: which day of it is today, and the journey through it
(docs/onboarding-v2.md, Revision 7 B, in the order of Revision 8).

The owner finishes /start and lands in an app with a plan and not much else. This
endpoint is the guide, foundations before posts, one job per week:

1. מדידה — connect Instagram, the site's data (when the plan measures the site), the
   WhatsApp link, the Google business card (when the plan counts on it), the baseline.
2. חומרי גלם — photos, which products/services to feature, a quick voice check; then
   "start writing the posts".
3. תוכן ראשון — approve and publish the first posts.
4. מודדים ומתאימים — results vs the baseline, month two, the month's review = the decision.

Each step says why it matters for *their* plan, how long it takes, where to do it, and
whether it is done. Every `done` is read from real state through `services/journey.py`,
the same facts the setup checklist (`/setup`) reads, so the two can never disagree. The
only things stored for the journey itself are what no other row records: that the
results were opened (`POST /trial/seen`), what only the owner can confirm (`POST
/trial/confirm`: the Google card checked, posts started), and the welcome (`POST
/trial/welcomed`).

Statuses:
* `done` — it happened (`done_at` when we know when).
* `todo` — it can be done now.
* `locked` — waits on something else first; `note_he` says what.
* `soon` — not available on this server yet (an integration without its app keys, the
  WhatsApp link before it ships, payment); `note_he` says so. Never counted as missing.
"""

from __future__ import annotations

import typing
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Business, User
from app.routers.setup import newest_business
from app.routers import foundations
from app.services import ga4, hypotheses as hypothesis_review, journey, meta, plan_connections
from app.services.jsonutil import dumps, loads

try:  # tzdata is not guaranteed on slim images; the day number only needs Israel's date.
    from zoneinfo import ZoneInfo

    ISRAEL_TZ = ZoneInfo("Asia/Jerusalem")
except Exception:  # pragma: no cover - depends on the host
    ISRAEL_TZ = timezone(timedelta(hours=3))

router = APIRouter(prefix="/trial", tags=["trial"])

DAYS_TOTAL = 30
MIN_PHOTOS = 3
# The month review opens in the last week: before that there is no month to review.
REVIEW_FROM_DAY = 22
WHATSAPP_PATH = "/whatsapp/link"
# Revision 8: posts are written once the week-2 foundations are in (the generation work).
POSTS_START_PATH = "/onboarding/posts/start"

# Integration keys in the stored plan that mean "the site's own data".
SITE_KEYS = {"ga4", "gtm", "search_console", "meta_pixel"}


# --- time ---------------------------------------------------------------------------


def _israel_date(moment: datetime) -> date:
    """Our timestamps are naive UTC; the owner's day is Israel's."""
    return moment.replace(tzinfo=timezone.utc).astimezone(ISRAEL_TZ).date()


def trial_start(user: User, business: Business | None) -> datetime:
    """When the free month started. Accounts from before the trial existed start when the
    account (or, failing that, its business) was created — never "now", which would hand
    an old account a fresh month on every read."""
    return user.trial_started_at or user.created_at or (business.created_at if business else None) or datetime.utcnow()


def day_of(start: datetime, now: datetime | None = None) -> int:
    """Day 1 is the signup day, in Israel's calendar."""
    now = now or datetime.utcnow()
    return max(1, (_israel_date(now) - _israel_date(start)).days + 1)


def week_of(day: int) -> int:
    return min(4, (min(day, DAYS_TOTAL) - 1) // 7 + 1)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat(timespec="seconds") if value else None


# --- stored events ------------------------------------------------------------------


def _events(user: User) -> dict:
    events = loads(user.trial_events_json, {}) if user.trial_events_json else {}
    return events if isinstance(events, dict) else {}


def _event(events: dict, key: str) -> datetime | None:
    return journey.parse_time(events.get(key))


# --- the WhatsApp link (Revision 7 C) ------------------------------------------------


def _whatsapp_state(request: Request, business: Business | None) -> tuple[bool, bool]:
    """(the WhatsApp link exists on this server, the business set its number).

    The number lives on the business (`whatsapp_number_e164`, routers/whatsapp.py). Read
    directly rather than through `GET /whatsapp/link`, which also creates the fixed links
    — a read of the journey must not write anything. Without the route, the step is `soon`.
    """
    if not _has_route(request, WHATSAPP_PATH, "GET"):
        return False, False
    return True, journey.filled(getattr(business, "whatsapp_number_e164", None) if business else None)


# --- the steps ----------------------------------------------------------------------

# Readiness stages retain the legacy week numbers in the API contract.
WEEKS = [
    {"week": 1, "title_he": "חיבורים ונקודת פתיחה"},
    {"week": 2, "title_he": "מכינים פוסט ראשון"},
    {"week": 3, "title_he": "מאשרים ומפרסמים"},
    {"week": 4, "title_he": "לומדים ומתאימים"},
]



def _kpi_name(facts: journey.Facts) -> str:
    kpi = (facts.quarter_plan or {}).get("kpi")
    name = kpi.get("name_he") if isinstance(kpi, dict) else ""
    return name.strip() if isinstance(name, str) else ""


def _kpi_needs(facts: journey.Facts) -> set[str]:
    kpi = (facts.quarter_plan or {}).get("kpi")
    needs = kpi.get("needs") if isinstance(kpi, dict) else None
    return {str(item) for item in needs} if isinstance(needs, list) else set()


def _plan_integration_keys(facts: journey.Facts) -> set[str] | None:
    """The integrations the plan measures with, or None for a business without a plan."""
    return plan_connections.keys(facts)


def _needs_site_data(facts: journey.Facts) -> bool:
    """Only when the plan measures something on the site. A business without a website —
    or whose plan's integrations list nothing on the site — never sees the step."""
    keys = _plan_integration_keys(facts)
    return "ga4" in keys if keys is not None else bool(facts.website)


def _needs_gbp(facts: journey.Facts) -> bool:
    """The Google business card, when the plan counts on it (its integrations or channels)."""
    keys = _plan_integration_keys(facts) or set()
    channels = (facts.quarter_plan or {}).get("channels")
    channel_keys = {c.get("key") for c in channels if isinstance(c, dict)} if isinstance(channels, list) else set()
    return "gbp" in keys or "gbp" in channel_keys


def _first_posts(posts: list[dict]) -> list[tuple[int, dict]]:
    """The month's first week of posts, with their index in the month. A month written
    without week numbers splits evenly into four."""
    indexed = list(enumerate(posts))
    marked = [(index, post) for index, post in indexed if post.get("week") == 1]
    if marked or any(isinstance(post.get("week"), int) for post in posts):
        return marked
    size = max(1, -(-len(posts) // 4))
    return indexed[:size]


def _latest(values) -> datetime | None:
    times = [journey.parse_time(value) for value in values]
    times = [value for value in times if value]
    return max(times) if times else None


def _step(key, week, title, why, minutes, href, action, status, done_at=None, note=None) -> dict:
    step = {
        "key": key,
        "week": week,
        "title_he": title,
        "why_he": why,
        "minutes": minutes,
        "href": href,
        "action_he": action,
        "status": status,
    }
    if status == "done" and done_at:
        step["done_at"] = _iso(done_at)
    if note and status in ("locked", "soon"):
        step["note_he"] = note
    return step


def _no_meta_account_yet(facts: journey.Facts) -> bool:
    """At /start the owner listed where customers find them, without Instagram or Facebook
    (no link, no posting habit), and no Meta account is connected since."""
    context = facts.stored.get("owner_context")
    if facts.business is None or not isinstance(context, dict) or "meta" in facts.connected:
        return False
    activity = context.get("activity") if isinstance(context.get("activity"), dict) else {}
    social = loads(facts.business.social_links_json, {}) or {}
    social = social if isinstance(social, dict) else {}
    return not any(social.get(key) or activity.get(key) for key in ("instagram", "facebook"))


def build_steps(
    facts: journey.Facts,
    events: dict,
    day: int,
    *,
    meta_ready: bool,
    ga4_ready: bool,
    whatsapp: tuple[bool, bool],
    posts_start_ready: bool,
) -> list[dict]:
    kpi = _kpi_name(facts)
    kpi_needs = _kpi_needs(facts)
    posts = facts.posts
    products = (facts.business.business_model if facts.business else "") != "services"
    steps: list[dict] = []

    # --- week 1 · measurement: without it there is no way to know anything works ------
    required = _plan_integration_keys(facts)
    # The owner told us at /start where to find them, and it was neither Instagram nor
    # Facebook: connecting one cannot be the first thing asked (often the plan is to open
    # the page). The step stays in week 1, after the ones they can do today.
    social_later = _no_meta_account_yet(facts)
    meta_step: dict | None = None
    if required is None or required & {"meta_business", "instagram_insights", "facebook_insights", "meta_pixel"}:
        connection = plan_connections.state(facts, "meta", available=meta_ready)
        status = connection["status"]
        why = connection["why"]
        if social_later and status == "todo":
            why = f"{why} אין עדיין עמוד? מחברים אחרי שפותחים אותו."
        meta_step = _step(
            "instagram", 1, connection["title"], why,
            3, "/integrations", connection["action"],
            status, facts.connected_at.get("meta"),
            connection["why"] if status == "soon" else None,
        )
        if not social_later:
            steps.append(meta_step)
    if _needs_site_data(facts):
        connection = plan_connections.state(facts, "ga4", available=ga4_ready)
        status = connection["status"]
        steps.append(_step(
            "site_data", 1, connection["title"], connection["why"],
            10, "/integrations", connection["action"],
            status, facts.connected_at.get("ga4"),
            "החיבור לנתוני האתר ייפתח כאן בקרוב." if status == "soon" else None,
        ))

    if required is None or "whatsapp_link" in required:
        whatsapp_ready, whatsapp_set = whatsapp
        status = "done" if whatsapp_set else ("todo" if whatsapp_ready else "soon")
        steps.append(_step(
            "whatsapp", 1, "להכין את קישור הוואטסאפ",
            f"קישור עם הודעה מוכנה. נמדוד לחיצות לקישור, שעשויות להוביל ליעד שבחרתם: {kpi}. שליחת הודעה אינה נמדדת כאן."
            if "whatsapp_link" in kpi_needs and kpi
            else "קישור עם הודעה מוכנה. נמדוד לחיצות מכל פוסט; שליחת הודעה אינה נמדדת כאן.",
            2, "/integrations#whatsapp", "להכין את הקישור",
            status, None,
            "הקישור יהיה מוכן כאן בקרוב." if status == "soon" else None,
        ))
    if _needs_gbp(facts):
        confirmed = _event(events, "gbp_confirmed_at")
        steps.append(_step(
            "gbp", 1, "לבדוק את הכרטיס של העסק בגוגל",
            "שם מוצאים אתכם במפות ובחיפוש. נוודא שהוא קיים, מעודכן ושאפשר למדוד אותו.",
            5, "/promotion#profile", "לבדוק את הכרטיס",
            "done" if confirmed else "todo", confirmed,
        ))

    # The same question answered at /start (ranges, or an explicit "לא בטוחים") is an answer
    # too: asking it again as the first step after signup made owners repeat themselves.
    start_answered = any(value not in (None, "") for value in facts.start_baseline.values())
    if (foundations.baseline_filled(facts.baseline) or journey.parse_time(facts.baseline.get("saved_at"))
            or facts.first_snapshot_at or start_answered):
        # Completion of the answer also includes explicitly saved unknowns. This does
        # not mark an unknown baseline as measured; measurement readiness stays separate.
        baseline_status = "done"
        baseline_done = journey.parse_time(facts.baseline.get("saved_at")) or facts.first_snapshot_at
    else:
        baseline_status, baseline_done = "todo", None
    baseline_step = _step(
        "baseline", 1, "לרשום איפה העסק היום",
        f"נקודת הפתיחה. בלעדיה לא נדע אם {kpi} באמת השתנה." if kpi
        else "נקודת הפתיחה. בלעדיה לא נדע אם משהו באמת השתנה.",
        2, "/baseline", "לרשום את המספרים",
        baseline_status, baseline_done,
    )
    steps.append(baseline_step)
    if meta_step is not None and social_later:
        steps.append(meta_step)

    # --- week 2 · raw materials: what the posts are made of ---------------------------
    minimum_photos = MIN_PHOTOS if products else 1
    minimum_featured = foundations.minimum_featured("products" if products else "services")
    photos_done = facts.asset_count >= minimum_photos
    have = facts.asset_count
    steps.append(_step(
        "photos", 2, "להעלות תמונות וסרטונים של העסק",
        (f"לפחות {minimum_photos}, כדי שהפוסטים ייראו כמו העסק שלכם." if products
         else "תמונה אחת של עבודה, תהליך או שלכם בעסק מספיקה להתחלה. אפשר להוסיף עוד בהמשך.")
        + (f" כבר העליתם {have}." if 0 < have < minimum_photos else ""),
        5, "/assets", "להעלות תמונות",
        "done" if photos_done else "todo", facts.third_asset_at if products else facts.first_asset_at,
    ))

    featured = facts.featured_items
    featured_done = len(featured) >= minimum_featured
    featured_raw = facts.stored.get("featured_items") if isinstance(facts.stored.get("featured_items"), dict) else {}
    steps.append(_step(
        "featured", 2, "לבחור מה להבליט בפוסטים",
        ("מציעים לפי העסק, המחקר והתוכנית. בחרו מה מתאים ושנו את הסדר לפי הצורך."
         if products else "שירות, דוגמה מעבודה או טיפ מקצועי. בחרו נושא אחד להתחלה שמתאים ללקוחות ולזמן הפנוי שלכם.")
        + (f" בחרתם {len(featured)} עד עכשיו." if 0 < len(featured) < minimum_featured else ""),
        5, "/featured", "לבחור",
        "done" if featured_done else "todo", journey.parse_time(featured_raw.get("saved_at")),
    ))

    voice = facts.voice_check
    brand = facts.stored.get("brand_language") if isinstance(facts.stored.get("brand_language"), dict) else {}
    # A style picked from a preset (no site, or a site we could not read) was never read
    # off a site: say so, rather than "the style we read on your site".
    steps.append(_step(
        "voice", 2, "לבדוק שהסגנון נשמע כמוכם",
        "התחלנו מסגנון לפי סוג העסק. אם זה לא אתם, נתקן לפני שכותבים."
        if brand.get("source") == "preset"
        else "שני משפטים לדוגמה בסגנון שקראנו באתר. אם זה לא אתם, נתקן לפני שכותבים.",
        2, "/voice", "לבדוק את הסגנון",
        "done" if voice else "todo", journey.parse_time((voice or {}).get("at")),
    ))

    foundations_done = photos_done and featured_done and bool(voice)
    started = _event(events, "posts_started_at")
    if posts or started:
        # Written, or being written: the owner asked (the job's own row shows its progress).
        start_status, start_note = "done", None
    elif not foundations_done:
        start_status, start_note = "locked", "אחרי התמונות, המוצרים והסגנון." if products else "אחרי התמונות, השירותים והסגנון."
    elif not posts_start_ready:
        start_status, start_note = "soon", "הכתיבה לפי הבחירות שלכם תיפתח כאן בקרוב."
    else:
        start_status, start_note = "todo", None
    steps.append(_step(
        "start_posts", 2, "להתחיל לכתוב את הפוסטים",
        ("לפי התוכנית, המוצרים שבחרתם והתמונות שלכם. הפוסטים יחכו לאישור שלכם."
         if products else "לפי התוכנית, השירותים שבחרתם והעבודות שלכם. הפוסטים יחכו לאישור שלכם."),
        1, "/posts", "להתחיל לכתוב",
        start_status, started, start_note,
    ))

    # --- week 3 · first content ---------------------------------------------------------
    first = _first_posts(posts)
    waiting = [post for _, post in first if post.get("approval_status") != "approved"]
    if not first:
        status, note = "locked", "אחרי שנכתוב את הפוסטים."
    else:
        status, note = ("todo" if waiting else "done"), None
    steps.append(_step(
        "approve_first", 3, "לאשר את הפוסטים הראשונים",
        f"רק פוסט מאושר יוצא לפרסום. {len(waiting)} מחכים לכם." if len(waiting) > 1
        else "רק פוסט מאושר יוצא לפרסום.",
        10, "/posts", "לבדוק ולאשר",
        status, _latest(post.get("approved_at") for _, post in first), note,
    ))

    to_publish = next(
        (index for index, post in enumerate(posts) if post.get("approval_status") == "approved" and not journey.is_published(post)),
        None,
    )
    if facts.published_posts:
        status, note = "done", None
    elif facts.approved_posts:
        status, note = "todo", None
    else:
        status, note = "locked", "אחרי שתאשרו את הפוסט הראשון."
    steps.append(_step(
        "publish_first", 3, "לפרסם את הפוסט הראשון",
        "ערכת הפרסום מוכנה: כיתוב, תמונה וקישור מסומן, כדי שנדע מה הפוסט הביא.",
        5, f"/posts?post={to_publish}" if to_publish is not None else "/posts", "לפתוח את ערכת הפרסום",
        status, facts.first_published_at, note,
    ))

    # --- week 4 · measure and adjust ----------------------------------------------------
    checked = _event(events, "results_checked_at")
    if checked:
        status, note = "done", None
    elif facts.published_posts:
        status, note = "todo", None
    else:
        status, note = "locked", "אחרי שתפרסמו את הפוסט הראשון."
    steps.append(_step(
        "results", 4, "לבדוק את התוצאות מול נקודת הפתיחה",
        f"האם {kpi} זז, ואילו השערות מתאשרות." if kpi else "מה השתנה מאז שהתחלנו, ואילו השערות מתאשרות.",
        5, "/performance", "לראות את התוצאות",
        status, checked, note,
    ))

    if facts.month_count >= 2:
        status, note = "done", None
    elif facts.has_month:
        status, note = "todo", None
    else:
        status, note = "locked", "אחרי שהחודש הראשון יהיה מוכן."
    steps.append(_step(
        "month_two", 4, "לבנות את החודש השני",
        "לפי מה שלמדנו החודש. הפוסטים יחכו לאישור שלכם, כמו עכשיו.",
        5, "/strategy", "לבנות את החודש",
        status, facts.second_month_at, note,
    ))

    reviewed = _event(events, "month_reviewed_at")
    if reviewed:
        status, note = "done", None
    elif day >= REVIEW_FROM_DAY:
        status, note = "todo", None
    else:
        status, note = "locked", f"נפתח ביום {REVIEW_FROM_DAY}."
    steps.append(_step(
        "month_review", 4, "לסכם את החודש ולהחליט אם להמשיך",
        f"החודש מול נקודת הפתיחה ביעד שבחרתם: {kpi}. בלי התחייבות." if kpi
        else "החודש מול נקודת הפתיחה. בלי התחייבות.",
        10, "/performance", "לראות את הסיכום",
        status, reviewed, note,
    ))
    return steps


def hypotheses(facts: journey.Facts) -> list[dict]:
    """What the month tests, and where each stands (docs/posts-v2.md, Phase C): the month's
    hypothesis, then the 3-month plan's assumptions, each with a status word and one
    evidence line. The statuses are written by services/hypotheses.py (performance refresh,
    weekly job, month close); until then an item is "בבדיקה", or what the monthly review
    once set by hand (`hypothesis_status` in the stored profile)."""
    view = hypothesis_review.review_view(facts.hypothesis_review, facts.month_core, facts.quarter_plan, facts.stored)
    return [
        {
            "key": item["key"],
            "kind": item["kind"],
            "text_he": item["text_he"],
            "if_wrong_he": item["if_wrong_he"],
            "status": item["status"],
            "status_he": item["status_he"],
            "evidence_he": item["evidence_he"],
        }
        for item in view["items"]
        if item["kind"] in ("month", "assumption")
    ]


def measurement(facts: journey.Facts, whatsapp_set: bool) -> dict:
    """Week 1's aha — "המדידה עובדת": what is connected, and whether real numbers came in."""
    connected = [key for key, on in (
        ("instagram", "meta" in facts.connected),
        ("site", "ga4" in facts.connected),
        ("whatsapp", whatsapp_set),
    ) if on]
    sources = [plan_connections.state(facts, provider, available=available)
               for provider, available in (("ga4", ga4.ga4_configured()), ("meta", meta.meta_configured()))
               if plan_connections.needed(facts, provider)]
    return {
        "connected": connected,
        "verified_sources": [source["title"] for source in sources if source["status"] == "done"],
        "pending_sources": [source["title"] for source in sources if source["status"] == "todo"],
        "has_numbers": facts.first_snapshot_at is not None,
        "first_numbers_at": _iso(facts.first_snapshot_at),
        "baseline": foundations.baseline_filled(facts.baseline),
    }


def next_step(steps: list[dict]) -> dict | None:
    """Finish the first ready content action, then follow the remaining journey.

    The fallback never advances past a locked stage: next-month work must not become
    the primary ask while the first posts are still being written.
    """
    # Finish the first usable content cycle before expanding setup or the batch. A
    # connector that still needs work remains visible; it is not a publication gate.
    # Each content status was derived from actual foundations/approval above.
    by_key = {step["key"]: step for step in steps}
    if by_key.get("publish_first", {}).get("status") != "done":
        for key in ("publish_first", "approve_first", "start_posts"):
            step = by_key.get(key)
            if step and step["status"] == "todo":
                return step
    waiting = [step["week"] for step in steps if step["status"] == "locked"]
    horizon = min(waiting) if waiting else None
    return next(
        (step for step in steps if step["status"] == "todo" and (horizon is None or step["week"] <= horizon)),
        None,
    )


def _has_route(request: Request, path: str, method: str) -> bool:
    return any(
        getattr(item, "path", None) == path and method in (getattr(item, "methods", None) or set())
        for item in request.app.routes
    )


def payload_for(request: Request, db: Session, user: User) -> dict:
    business = newest_business(db, user)
    facts = journey.load(db, business)
    events = _events(user)
    started = trial_start(user, business)
    day = day_of(started)
    whatsapp = _whatsapp_state(request, business)
    steps = build_steps(
        facts,
        events,
        day,
        meta_ready=meta.meta_configured(),
        ga4_ready=ga4.ga4_configured(),
        whatsapp=whatsapp,
        posts_start_ready=_has_route(request, POSTS_START_PATH, "POST"),
    )
    counted = [step for step in steps if step["status"] != "soon"]
    nxt = next_step(steps)
    return {
        "day": min(day, DAYS_TOTAL),
        "days_total": DAYS_TOTAL,
        "ended": day > DAYS_TOTAL,
        "week": week_of(day),
        "started_at": _iso(started),
        "ends_at": _iso(started + timedelta(days=DAYS_TOTAL)),
        "welcomed_at": _iso(user.welcomed_at),
        "done": sum(1 for step in counted if step["status"] == "done"),
        "total": len(counted),
        "next_key": nxt["key"] if nxt else None,
        "weeks": WEEKS,
        "steps": steps,
        "measurement": measurement(facts, whatsapp[1]),
        "hypotheses": hypotheses(facts),
    }


@router.get("")
def trial(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """The day of the free month and the journey through it. See the module docstring."""
    return payload_for(request, db, user)


@router.post("/welcomed")
def welcomed(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """The first-entry welcome was seen (or skipped). Idempotent: the first time stays."""
    if user.welcomed_at is None:
        user.welcomed_at = datetime.utcnow()
        db.commit()
    return payload_for(request, db, user)


class SeenIn(BaseModel):
    # "plan": /strategy was opened. "results": /performance was opened.
    what: typing.Literal["plan", "results"]


def _record(user: User, db: Session, update) -> None:
    events = _events(user)
    update(events, datetime.utcnow().isoformat(timespec="seconds"))
    user.trial_events_json = dumps(events)
    db.commit()


@router.post("/seen")
def seen(body: SeenIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """A page the journey asks the owner to open was opened.

    An opening completes a step only when what the step is about already exists, so the
    milestone is stamped then and never later rewritten: the results, opened after the
    first published post, are "the first results vs the baseline"; opened from day 22 (with
    a month to review), they are the month's review. The plan's openings are recorded too.
    """
    business = newest_business(db, user)
    if business is None:
        raise HTTPException(status_code=404, detail="עוד לא הגדרתם עסק")
    facts = journey.load(db, business)
    now_day = day_of(trial_start(user, business))

    def update(events: dict, stamp: str) -> None:
        if body.what == "plan":
            events.setdefault("plan_seen_at", stamp)
            return
        events.setdefault("results_seen_at", stamp)
        if facts.published_posts:
            events.setdefault("results_checked_at", stamp)
        if now_day >= REVIEW_FROM_DAY and facts.has_month:
            events.setdefault("month_reviewed_at", stamp)

    _record(user, db, update)
    return payload_for(request, db, user)


class ConfirmIn(BaseModel):
    # "gbp": the owner checked the Google business card. "posts_started": the owner asked
    # us to start writing the posts (recorded next to POST /onboarding/posts/start).
    what: typing.Literal["gbp", "posts_started"]


@router.post("/confirm")
def confirm(body: ConfirmIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Something only the owner can tell us happened. Idempotent: the first time stays."""
    key = {"gbp": "gbp_confirmed_at", "posts_started": "posts_started_at"}[body.what]
    _record(user, db, lambda events, stamp: events.setdefault(key, stamp))
    return payload_for(request, db, user)
