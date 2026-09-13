"""The publishing handoff: what is ready, what is possible, and what to hand to a person.

This module is deliberately honest about one hard limit, and it never works around it.

The Meta connection (`services/meta.py`) asks for read-only permissions. Posting to an
Instagram business account or to a Facebook Page needs permissions this app has not been
granted — `instagram_content_publish` and `pages_manage_posts` — and those cannot simply
be added to the login request: Meta reviews an app before it is allowed to ask for them,
on Meta's schedule. Until that review passes, no code of ours can post anything, and
writing a call that pretends otherwise would be a lie the first owner would discover.

So nothing here publishes. What this module does instead:

- `queue_for` groups the month into what is due, what is scheduled later, what still needs
  approval, and what the owner already posted by hand.
- `capability_for` reports whether posting is *permitted*, read from the permissions Meta
  actually granted on the stored connection — never from the list we wish we had — with a
  plain-Hebrew explanation of what is missing and why. It is data, not a promise.
- `campaign_brief` assembles the month's budget, audiences, cadence and tracking
  convention into one copyable brief for Meta Ads Manager. Every figure comes from the
  stored plan; a figure the plan does not have is omitted rather than guessed.

`parse_scheduled_for` is the strict date reader used when the owner sets a date, so a
value nothing can order (or display) never reaches the roadmap.
"""

from __future__ import annotations

import re
from datetime import date

from sqlalchemy.orm import Session

from app.models import Business, Integration, Strategy
from app.services.audiences import catalogue_for
from app.services.calendar_il import gregorian_month_meta
from app.services.jsonutil import loads

# --- scheduling -----------------------------------------------------------------------

SCHEDULE_FORMAT_ERROR_HE = "תאריך לא תקין. הזינו תאריך בפורמט YYYY-MM-DD, למשל 2026-03-15."

_ISO_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def parse_scheduled_for(raw: str) -> str:
    """A schedule date to store, or "" meaning "clear it".

    Strict on purpose. `date.fromisoformat` also accepts "20260315" and ISO week dates,
    and a date the owner cannot see in a calendar is worse than an error message. The
    message is Hebrew because it is shown to the owner as-is.
    """
    text = (raw or "").strip()
    if not text:
        return ""
    if not _ISO_DAY.match(text):
        raise ValueError(SCHEDULE_FORMAT_ERROR_HE)
    try:
        return date.fromisoformat(text).isoformat()
    except ValueError as exc:
        raise ValueError(SCHEDULE_FORMAT_ERROR_HE) from exc


def _stored_day(post: dict) -> date | None:
    """The date a stored post is scheduled for, or None when it carries no usable date.

    Lenient where `parse_scheduled_for` is strict: this reads whatever is already in the
    roadmap, and an unreadable value must never make a post look due.
    """
    value = post.get("scheduled_for")
    if not isinstance(value, str) or not _ISO_DAY.match(value.strip()):
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


# --- capability -----------------------------------------------------------------------

# The permissions Meta grants for posting. NOT part of `services.meta.META_SCOPES`, which
# is the read-only login the product can actually request today: asking for these requires
# Meta's App Review first, and a request for an unapproved permission fails the whole
# login. They are listed here as the names that would be required, so the owner (or their
# Meta contact) can see exactly what is missing.
PUBLISH_SCOPES = ("instagram_content_publish", "pages_manage_posts")

SCOPE_LABELS_HE = {
    "instagram_content_publish": "פרסום תוכן בחשבון האינסטגרם העסקי",
    "pages_manage_posts": "פרסום בעמוד הפייסבוק",
}

NO_META_HE = (
    "חשבון מטא (פייסבוק ואינסטגרם) לא מחובר, ולכן אין למערכת גישה לדפים שלכם."
)

APPROVAL_HE = (
    "פרסום אוטומטי לאינסטגרם ולפייסבוק דורש אישור של מטא לאפליקציה הזאת. "
    "מטא בודקת אפליקציות ומאשרת הרשאת פרסום רק בסוף הבדיקה שלה, וזה לא תלוי בנו ולא בהגדרה במערכת. "
    "עד שהאישור הזה יתקבל, למערכת אין אפשרות טכנית לפרסם בשמכם לשום רשת."
)

RECONNECT_HE = (
    "כשהאישור יתקבל, צריך יהיה לחבר מחדש את חשבון מטא בעמוד החיבורים, "
    "כדי שההרשאה החדשה תיכנס לתוקף."
)

MANUAL_HE = (
    "בינתיים מפרסמים ידנית: כל פוסט כאן מוכן עם כיתוב, תמונה וקישור עם מעקב, "
    "ואפשר להעתיק אותו לאפליקציה של פייסבוק או אינסטגרם ולפרסם משם."
)

GRANTED_HE = "לחיבור מטא יש הרשאה פעילה לפרסום."

PARTIAL_HE = "לפרסום בכל היעדים חסרות עדיין הרשאות: {names}."


def _integration(db: Session, business: Business, provider: str) -> Integration | None:
    return (
        db.query(Integration)
        .filter(Integration.business_id == business.id, Integration.provider == provider)
        .first()
    )


def _is_connected(item: Integration | None) -> bool:
    """The same definition the integrations page shows: connected status plus a token."""
    return bool(item and item.status == "connected" and item.access_token_enc)


def _granted_scopes(item: Integration | None) -> list[str]:
    """The permissions actually granted on this connection.

    Written at connect time from what the provider returned. Never derived from the
    scopes this app would like to request — that distinction is the whole point of this
    function.
    """
    if not item:
        return []
    extra = loads(item.extra_json, {}) or {}
    if not isinstance(extra, dict):
        return []
    raw = extra.get("scopes")
    if isinstance(raw, str):
        # Some providers answer with one space/comma separated string. Split it rather
        # than treating the whole thing as a single unknown permission.
        raw = [part for part in re.split(r"[\s,]+", raw) if part]
    if not isinstance(raw, (list, tuple)):
        return []
    return [str(scope).strip() for scope in raw if str(scope or "").strip()]


def capability_for(db: Session, business: Business) -> dict:
    """Can this app post for this business? Answered only from the stored grant."""
    meta_item = _integration(db, business, "meta")
    ga4_item = _integration(db, business, "ga4")
    granted = set(_granted_scopes(meta_item))
    meta_connected = _is_connected(meta_item)
    ga4_connected = _is_connected(ga4_item)

    publish_granted = [scope for scope in PUBLISH_SCOPES if scope in granted]
    # A publish permission that Meta actually granted, on a connection that is live. There
    # is no flag, no environment variable and no default that can turn this on.
    auto_publish = bool(meta_connected and publish_granted)
    missing = [scope for scope in PUBLISH_SCOPES if scope not in granted]

    reasons: list[str] = []
    if not meta_connected:
        reasons.append(NO_META_HE)
        reasons.append(APPROVAL_HE)
    elif not auto_publish:
        reasons.append(APPROVAL_HE)
        reasons.append(RECONNECT_HE)
    else:
        reasons.append(GRANTED_HE)
        if missing:
            reasons.append(
                PARTIAL_HE.format(
                    names=", ".join(SCOPE_LABELS_HE.get(scope, scope) for scope in missing)
                )
            )
    if not auto_publish:
        reasons.append(MANUAL_HE)

    return {
        "auto_publish": auto_publish,
        "can_schedule": True,
        "reasons": reasons,
        "missing": missing,
        "connected": {"meta": meta_connected, "ga4": ga4_connected},
    }


# --- the queue ------------------------------------------------------------------------

OUTLET_LABELS_HE = {
    "instagram": "אינסטגרם",
    "facebook": "פייסבוק",
    "whatsapp": "וואטסאפ",
    "tiktok": "טיקטוק",
}


def _text(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def _outlets(post: dict) -> list[str]:
    raw = post.get("outlets")
    if not isinstance(raw, (list, tuple)):
        return []
    return [str(item).strip() for item in raw if str(item or "").strip()]


def _posts(strategy: Strategy) -> list[dict]:
    extra = loads(strategy.roadmap_json, {}) or {}
    if not isinstance(extra, dict):
        return []
    roadmap = extra.get("roadmap")
    if not isinstance(roadmap, dict):
        return []
    return [item for item in (roadmap.get("posts") or []) if isinstance(item, dict)]


def post_brief(index: int, post: dict) -> dict:
    """One post as the queue shows it: identity, timing, approval and what exists."""
    return {
        "index": index,
        "title": _text(post.get("title")),
        "format": _text(post.get("format")),
        "primary_outlet": _text(post.get("primary_outlet")),
        "outlets": _outlets(post),
        "date_hint": _text(post.get("date_hint")),
        "scheduled_for": _text(post.get("scheduled_for")),
        "approval_status": _text(post.get("approval_status")) or "review",
        "published_url": _text(post.get("published_url")),
        "published_at": _text(post.get("published_at")) or None,
        "has_image": bool(_text(post.get("image_url"))),
        "tracking_url": _text(post.get("tracking_url")),
    }


def split_queue(posts: list[dict], today: date | None = None) -> dict:
    """Group the month's posts into the buckets the owner acts on.

    Rules that matter:

    - A post with a `published_url` is published and appears nowhere else. That URL is
      only ever written after the owner confirms they posted it by hand, so it is a fact.
    - A post that was not approved is never due. Approval is the gate; a date alone does
      not make something ready to go out.
    - A date that cannot be read is treated as no date, so nothing is ever reported as
      overdue on the strength of a value we could not parse.
    """
    today = today or date.today()
    buckets: dict[str, list[dict]] = {
        "due": [],
        "upcoming": [],
        "unscheduled": [],
        "awaiting_approval": [],
        "published": [],
    }
    dated: dict[str, list[tuple[date, dict]]] = {"due": [], "upcoming": []}

    for index, post in enumerate(posts):
        brief = post_brief(index, post)
        if brief["published_url"]:
            buckets["published"].append(brief)
            continue
        if brief["approval_status"] != "approved":
            buckets["awaiting_approval"].append(brief)
            continue
        day = _stored_day(post)
        if day is None:
            buckets["unscheduled"].append(brief)
            continue
        dated["due" if day <= today else "upcoming"].append((day, brief))

    # Soonest first — that is the order the owner works through the list.
    for key in ("due", "upcoming"):
        buckets[key] = [
            brief
            for _, brief in sorted(dated[key], key=lambda item: (item[0], item[1]["index"]))
        ]

    counts = {key: len(buckets[key]) for key in buckets}
    counts["total"] = sum(counts.values())
    return {**buckets, "counts": counts}


def queue_for(
    db: Session,
    business: Business,
    strategy: Strategy,
    today: date | None = None,
) -> dict:
    """Everything the publishing screen needs, in one response."""
    return {
        "year": strategy.year,
        "month": strategy.month,
        "month_name_he": gregorian_month_meta(strategy.year, strategy.month)["month_name_he"],
        **split_queue(_posts(strategy), today=today),
        "capability": capability_for(db, business),
    }


# --- the campaign brief ---------------------------------------------------------------

STAGE_LABELS_HE = {
    "below_viable": "מתחת לסף הרווחיות",
    "validation": "שלב בדיקה",
    "growth": "שלב צמיחה",
    "scale": "שלב הרחבה",
}

ALLOCATION_LABELS = (
    ("meta_ads_share_pct", "פרסום ממומן במטא"),
    ("organic_production_share_pct", "הפקת תוכן אורגני"),
    ("local_promotion_share_pct", "קידום מקומי"),
)

EMPTY_PLAN_HE = (
    "התוכנית השמורה לא כוללת עדיין תקציב, קהלים או יעדים, "
    "ולכן אין כאן נתונים שאפשר להעביר למפרסם."
)

TRACKING_NOTE_HE = (
    "כל פוסט מפורסם עם הקישור שלו, כדי שאפשר יהיה לשייך לחיצות ופניות לפוסט שהביא אותן."
)


def _positive_int(value) -> int | None:
    """An int worth showing, or None. Zero counts as "no figure", not as a figure."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _number_range(value) -> tuple[float, float] | None:
    """A stored [low, high] pair, and only when it carries a real range."""
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        return None
    try:
        low, high = float(value[0]), float(value[1])
    except (TypeError, ValueError):
        return None
    return (low, high) if high > 0 else None


def _count_range(value) -> dict | None:
    pair = _number_range(value)
    if pair is None:
        return None
    return {"min": int(pair[0]), "max": int(pair[1])}


def _roas_range(value) -> dict | None:
    pair = _number_range(value)
    if pair is None:
        return None
    return {"min": round(pair[0], 2), "max": round(pair[1], 2)}


def _money(value: int) -> str:
    return f"{value:,} ₪"


def _posts_label(count: int) -> str:
    """`1 פוסטים` is not Hebrew. One post is said, not counted."""
    return "פוסט אחד" if count == 1 else f"{count} פוסטים"


def _counts_text(pair: dict) -> str:
    return f"{pair['min']:,}-{pair['max']:,}"


def _string_list(raw, limit: int = 8) -> list[str]:
    if not isinstance(raw, (list, tuple)):
        return []
    out: list[str] = []
    for item in raw:
        text = item if isinstance(item, str) else str(item or "")
        text = text.strip()
        if text and text not in out:
            out.append(text)
        if len(out) >= limit:
            break
    return out


def _audiences_for(db: Session, business: Business) -> list[dict]:
    rows = []
    for item in catalogue_for(db, business):
        if not isinstance(item, dict) or not _text(item.get("name")):
            continue
        targeting = item.get("targeting") if isinstance(item.get("targeting"), dict) else {}
        rows.append(
            {
                "name": _text(item.get("name")),
                "summary": _text(item.get("summary")),
                "is_primary": bool(item.get("is_primary")),
                "needs": _string_list(item.get("needs"), 4),
                "where": _string_list(item.get("where"), 4),
                # Empty fields are dropped, not printed as blanks: an owner who never
                # gave an age range should not see one invented for them.
                "targeting": {
                    key: value
                    for key, value in targeting.items()
                    if value not in ("", [], None)
                },
            }
        )
    return rows


def _priorities_for(usp: dict, stored: dict) -> list[str]:
    """The ranked priorities, exactly as the owner ordered them during onboarding."""
    ranked = _string_list(stored.get("growth_targets"), 3)
    return ranked or _string_list(usp.get("growth_targets"), 3)


def _tracking_for(strategy: Strategy, posts: list[dict], website: str) -> dict:
    """The UTM convention every post already carries, taken from the posts themselves.

    The campaign name falls back to the scheme `attach_tracking` writes for this month —
    it is the plan's own convention, not a figure anyone has to trust.
    """
    campaign = f"isramarket-{strategy.year}-{strategy.month:02d}"
    medium = "organic"
    sources: list[str] = []
    example_url = ""
    example_content = ""
    for post in posts:
        utm = post.get("utm") if isinstance(post.get("utm"), dict) else {}
        stored_campaign = _text(utm.get("utm_campaign"))
        if stored_campaign:
            campaign = stored_campaign
        source = _text(utm.get("utm_source"))
        if source and source not in sources:
            sources.append(source)
        stored_medium = _text(utm.get("utm_medium"))
        if stored_medium:
            medium = stored_medium
        if not example_url and _text(post.get("tracking_url")):
            example_url = _text(post.get("tracking_url"))
        if not example_content and _text(utm.get("utm_content")):
            example_content = _text(utm.get("utm_content"))
    return {
        # Only a convention that real posts already carry is worth printing. With no
        # posts, there is nothing to hand over and the brief says so instead.
        "available": bool(sources or example_url or example_content),
        "website": website,
        "utm_source": sources,
        "utm_medium": medium,
        "utm_campaign": campaign,
        "utm_content_example": example_content,
        "example_url": example_url,
        "note": TRACKING_NOTE_HE,
    }


def campaign_brief(db: Session, business: Business, strategy: Strategy) -> dict:
    """The month's plan, assembled into something a person can act on."""
    extra = loads(strategy.roadmap_json, {}) or {}
    if not isinstance(extra, dict):
        extra = {}
    roadmap = extra.get("roadmap") if isinstance(extra.get("roadmap"), dict) else {}
    plan = extra.get("posting_plan") if isinstance(extra.get("posting_plan"), dict) else {}
    usp = loads(strategy.usp_json, {}) or {}
    if not isinstance(usp, dict):
        usp = {}
    stored = loads(business.scraped_profile_json, {}) or {}
    if not isinstance(stored, dict):
        stored = {}
    allocation = usp.get("budget_allocation") if isinstance(usp.get("budget_allocation"), dict) else {}
    horizon = roadmap.get("monthly_horizon_plan") if isinstance(roadmap.get("monthly_horizon_plan"), dict) else {}
    posts = [item for item in (roadmap.get("posts") or []) if isinstance(item, dict)]

    budget = _positive_int(plan.get("monthly_budget_ils")) or _positive_int(business.monthly_budget_ils)
    stage = _text(plan.get("stage"))

    allocation_rows = []
    for key, label in ALLOCATION_LABELS:
        share = _positive_int(allocation.get(key))
        if share is None:
            continue
        row = {"key": key, "label": label, "share_pct": share}
        if budget:
            row["amount_ils"] = round(budget * share / 100)
        allocation_rows.append(row)

    cadence: dict = {}
    weekly = _positive_int(plan.get("weekly_posts"))
    if weekly:
        cadence["posts_per_week"] = weekly
    format_mix = plan.get("format_mix") if isinstance(plan.get("format_mix"), dict) else {}
    formats = _string_list(format_mix.get("formats"), 6)
    if formats:
        cadence["formats"] = formats

    outlet_counts: dict[str, int] = {}
    for post in posts:
        outlet = _text(post.get("primary_outlet"))
        if outlet:
            outlet_counts[outlet] = outlet_counts.get(outlet, 0) + 1
    channels = [
        {"outlet": outlet, "label": OUTLET_LABELS_HE.get(outlet, outlet), "posts": count}
        for outlet, count in sorted(outlet_counts.items(), key=lambda item: (-item[1], item[0]))
    ]

    expectations: dict = {}
    for key in ("expected_impressions", "expected_clicks", "expected_purchases"):
        counted = _count_range(plan.get(key))
        if counted:
            expectations[key] = counted
    roas = _roas_range(plan.get("realistic_roas"))
    if roas:
        expectations["realistic_roas"] = roas
    conversion_unit = _text(plan.get("conversion_unit"))
    if conversion_unit:
        expectations["conversion_unit"] = conversion_unit

    payload = {
        "year": strategy.year,
        "month": strategy.month,
        "month_name_he": gregorian_month_meta(strategy.year, strategy.month)["month_name_he"],
        "business_name": _text(business.name),
        "goal": _text(horizon.get("hypothesis")) or _text(usp.get("growth_hypothesis")),
        "theme": _text(roadmap.get("theme")),
        "budget": (
            {
                "monthly_budget_ils": budget,
                "stage": stage,
                "stage_label": STAGE_LABELS_HE.get(stage, ""),
            }
            if budget
            else None
        ),
        "allocation": allocation_rows,
        "allocation_guidance": _text(allocation.get("guidance")),
        "cadence": cadence,
        "channels": channels,
        "audiences": _audiences_for(db, business),
        "priorities": _priorities_for(usp, stored),
        "expectations": expectations,
        "tracking": _tracking_for(strategy, posts, _text(business.website_url)),
        "warnings": _string_list(plan.get("warnings"), 6),
        "assumptions": _string_list(plan.get("assumptions"), 8),
        "channel_note": _text(plan.get("mix_note")),
    }
    payload["text"] = render_brief(payload)
    return payload


def render_brief(data: dict) -> str:
    """The brief as one plain-Hebrew block the owner can copy and paste.

    Built line by line, and every line is conditional: a figure the plan does not carry
    produces no line at all, so nothing here can read as a number we made up.
    """
    heading = "בריף קמפיין"
    if data.get("business_name"):
        heading += f" — {data['business_name']}"
    if data.get("month_name_he") and data.get("year"):
        heading += f" — {data['month_name_he']} {data['year']}"

    lines: list[str] = [heading]
    has_figures = False

    def section(title: str) -> None:
        lines.extend(["", title])

    def sentence(text: str) -> None:
        lines.append(text)

    if data.get("goal"):
        section("מטרת החודש")
        sentence(data["goal"])
    if data.get("theme"):
        section("נושא החודש")
        sentence(data["theme"])

    budget = data.get("budget") or {}
    if budget.get("monthly_budget_ils"):
        has_figures = True
        section("תקציב")
        line = f"תקציב חודשי: {_money(budget['monthly_budget_ils'])}"
        if budget.get("stage_label"):
            line += f" ({budget['stage_label']})"
        sentence(line)
        if data.get("allocation"):
            sentence("חלוקה מוצעת:")
            for row in data["allocation"]:
                line = f"- {row['label']}: {row['share_pct']}%"
                if row.get("amount_ils"):
                    line += f" ({_money(row['amount_ils'])})"
                sentence(line)
        if data.get("allocation_guidance"):
            sentence(f"הנחיות: {data['allocation_guidance']}")

    cadence = data.get("cadence") or {}
    if cadence.get("posts_per_week") or cadence.get("formats"):
        has_figures = True
        section("קצב ופורמטים")
        if cadence.get("posts_per_week"):
            sentence(f"קצב פרסום: {_posts_label(cadence['posts_per_week'])} בשבוע")
        if cadence.get("formats"):
            sentence("פורמטים: " + ", ".join(cadence["formats"]))

    if data.get("channels"):
        has_figures = True
        section("תמהיל ערוצים בתוכנית")
        for row in data["channels"]:
            sentence(f"- {row['label']}: {_posts_label(row['posts'])}")
        if data.get("channel_note"):
            sentence(data["channel_note"])

    if data.get("audiences"):
        has_figures = True
        section("קהלים")
        for item in data["audiences"]:
            line = f"- {item['name']}"
            if item.get("is_primary"):
                line += " (הקהל הראשי)"
            if item.get("summary"):
                line += f": {item['summary']}"
            sentence(line)
            targeting = item.get("targeting") or {}
            focus = []
            if targeting.get("geo"):
                focus.append(f"אזור: {targeting['geo']}")
            if targeting.get("age_range"):
                focus.append(f"גיל: {targeting['age_range']}")
            if targeting.get("gender"):
                focus.append(f"מגדר: {targeting['gender']}")
            if targeting.get("interests"):
                focus.append("תחומי עניין: " + ", ".join(targeting["interests"]))
            if targeting.get("keywords"):
                focus.append("נושאי חיפוש: " + ", ".join(targeting["keywords"]))
            if focus:
                sentence("  מיקוד: " + " | ".join(focus))
            if item.get("needs"):
                sentence("  מה הם מחפשים: " + ", ".join(item["needs"]))
            if item.get("where"):
                sentence("  איפה הם נמצאים: " + ", ".join(item["where"]))

    if data.get("priorities"):
        has_figures = True
        section("סדרי עדיפויות (מהחשוב לפחות)")
        for position, item in enumerate(data["priorities"], start=1):
            sentence(f"{position}. {item}")

    expectations = data.get("expectations") or {}
    expectation_lines = []
    if expectations.get("expected_impressions"):
        expectation_lines.append("חשיפות בחודש: " + _counts_text(expectations["expected_impressions"]))
    if expectations.get("expected_clicks"):
        expectation_lines.append("קליקים בחודש: " + _counts_text(expectations["expected_clicks"]))
    if expectations.get("expected_purchases"):
        unit = "רכישות" if expectations.get("conversion_unit") == "רכישה" else "פניות"
        expectation_lines.append(f"{unit} בחודש: " + _counts_text(expectations["expected_purchases"]))
    if expectations.get("realistic_roas"):
        expectation_lines.append(
            f"ROAS ריאלי: {expectations['realistic_roas']['min']:g}-{expectations['realistic_roas']['max']:g}"
        )
    if expectation_lines:
        has_figures = True
        section("מה אפשר לצפות (טווחים מהתוכנית, לא הבטחה)")
        for line in expectation_lines:
            sentence("- " + line)

    tracking = data.get("tracking") or {}
    if tracking.get("available") and tracking.get("utm_campaign"):
        has_figures = True
        section("מעקב")
        sentence(tracking.get("note") or TRACKING_NOTE_HE)
        if tracking.get("utm_source"):
            sentence("utm_source: " + ", ".join(tracking["utm_source"]))
        sentence(f"utm_medium: {tracking['utm_medium']}")
        sentence(f"utm_campaign: {tracking['utm_campaign']}")
        if tracking.get("utm_content_example"):
            sentence(f"utm_content (דוגמה מהתוכנית): {tracking['utm_content_example']}")
        if tracking.get("example_url"):
            sentence(f"קישור לדוגמה: {tracking['example_url']}")

    if data.get("warnings"):
        section("מה חשוב לדעת")
        for item in data["warnings"]:
            sentence("- " + item)
    if data.get("assumptions"):
        section("המספרים מבוססים על")
        for item in data["assumptions"]:
            sentence("- " + item)

    if not has_figures:
        lines.extend(["", EMPTY_PLAN_HE])
    return "\n".join(lines)
