"""Onboarding v2, revision 4: the strategy built together, and what it will look like.

The end of `/start` is no longer "pick A or B". After the owner picks a direction:

- `build_strategy` (strategy model, one call + at most one corrective retry): a
  one-page consultant strategy for that direction — the objective, how we will know it
  worked, the angle, who first, three content pillars, where and how often, what we ask
  the customer to do, the four weeks and the next two months, and the bets this month
  tests. Every block says why, and names what it leans on (`based_on`: an insight, one of
  the owner's answers, the site, the calendar or the direction). The owner shapes it with
  `inputs` (their own target, cadence, primary audience, pillars to drop, free feedback);
  a re-run revises the strategy they last saw and says what changed.
- `build_sample_posts` (the product's post writer, `post_model_router.post_json`, so
  `POST_MODEL=muse-spark` applies): three week-1 posts, written from the same prompt the
  month uses (`strategy.posts_prompt`), each with a real card template, a pillar and a
  photo slot — the site's own photo when the scan found a usable one, otherwise a
  concrete instruction of what to shoot.
- After signup, the strategy and the chosen posts are the first month's seed
  (`onboarding_draft.apply_draft`), and the month generation reads it here:
  `seeded_posts_plan` (how many posts, which are already written),
  `apply_strategy_to_core` (the weeks, measures and target as approved),
  `apply_cadence_to_posting_plan` and `strategy_prompt_block`. No seed, no change.

Honesty rules enforced here, not hoped for:

- Measures: the model picks a *kind* from a list we build for this business; whether it
  can be measured today, and what it needs otherwise, is decided by us, never by the
  model. There is no measure we cannot back (no site data without a site, no Instagram
  numbers without an account), and at least one is measurable from day one.
- Targets: the only target is the owner's own `inputs.target`, echoed as they wrote it.
  A number not in the draft, the site, the calendar or the owner's target is treated as
  invented: one corrective retry, then the sentence carrying it is removed.
- `based_on` may only name a source we had: an insight that exists, an answer the owner
  actually gave, a site we read, an event in the window.
- Calendar: a week's event must be a real event that falls in that week.
"""

from __future__ import annotations

import copy
import hashlib
import json
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services import onboarding_draft as drafts
from app.services import post_model_router
from app.services.business_model import model_framing
from app.services.calendar_il import GREGORIAN_MONTHS
from app.services.hebrew_style import HEBREW_STYLE
from app.services.jsonutil import loads
from app.services.onboarding_draft import (
    NETWORK_HE,
    OnboardingDraft,
    TTLCache,
    allowed_numbers,
    clean_text,
    invented_numbers,
)
from app.services.schemas_llm import MIX_TYPE_KEYS, MONTHLY_POST_ITEM_SCHEMA
from app.services.business_fields import field_label

log = logging.getLogger(__name__)

# --- vocabulary ---------------------------------------------------------------------------

# Cadence chips (posts per week). `weeks` is the plan for weeks 1-4: the owner said "1-2"
# and gets 2, 1, 2, 1 — not the top of the range every week.
CADENCES: dict[str, dict] = {
    "1-2": {"label_he": "1 עד 2 פוסטים בשבוע", "weeks": (2, 1, 2, 1)},
    "3-4": {"label_he": "3 עד 4 פוסטים בשבוע", "weeks": (3, 4, 3, 4)},
    "5+": {"label_he": "5 פוסטים בשבוע ויותר", "weeks": (5, 5, 5, 5)},
}
CadenceKey = Literal["1-2", "3-4", "5+"]

NETWORKS = ("instagram", "facebook", "tiktok", "whatsapp", "website", "google_business")
NETWORK_LABELS_HE = {
    **NETWORK_HE,
    "whatsapp": "וואטסאפ",
    "website": "האתר",
    "google_business": "הכרטיס של העסק בגוגל",
}

# Mirrors CARD_TEMPLATES in web/components/CardCanvas.tsx (and images._SAFE_ZONE).
CARD_TEMPLATES: dict[str, str] = {
    "lower_editorial": "תמונה מלאה, כותרת גדולה בתחתית על הצללה כהה. ברירת המחדל לצילום מוצר או רגע.",
    "split_panel": "תמונה למעלה, כותרת וקריאה לפעולה על פס בצבע העסק. הכי קריא.",
    "framed_inset": "תמונה במסגרת על רקע בצבע העסק. לתמונה חזקה עם מעט טקסט.",
    "cover_type": "כותרת ענקית מעל התמונה, כמו שער מגזין. להכרזות ולעדכונים.",
    "promo_ribbon": "פס צבעוני עם ההצעה למעלה ופאנל כהה למטה. רק כשיש הצעה או מועד אמיתיים.",
    "type_hero": "בלי תמונה: צבע העסק, כותרת ענקית וקריאה לפעולה. לפוסט של מסר.",
}
PHOTO_FREE_TEMPLATES = {"type_hero"}

# How each kind of measure is counted, and whether it works before anything is connected.
# The model picks the kind; availability is ours.
MEASURE_KINDS: dict[str, dict] = {
    "owner_count": {
        "available_now": True,
        "needs_he": "",
        "describe": "פניות, הזמנות או לקוחות שבעל העסק סופר בעצמו: שואלים \"מאיפה שמעתם עלינו\", "
        "מילה מהפוסט שאומרים בקופה, הזמנות שרואים במערכת של החנות. אפשר למדוד מהיום.",
    },
    "whatsapp_message": {
        "available_now": True,
        "needs_he": "",
        "describe": "הודעות וואטסאפ שמגיעות מקישור בפוסט או בביו, עם הודעה מוכנה מראש (למשל \"ראיתי באינסטגרם\"). "
        "בעל העסק סופר כמה הודעות כאלה הגיעו. אפשר למדוד מהיום.",
    },
    "instagram_insights": {
        "available_now": False,
        "needs_he": "צריך לחבר את האינסטגרם",
        "describe": "כמה אנשים ראו, שמרו ושיתפו, וכניסות לפרופיל. רק אחרי שמחברים את האינסטגרם.",
        "requires": "instagram",
    },
    "facebook_insights": {
        "available_now": False,
        "needs_he": "צריך לחבר את הפייסבוק",
        "describe": "כמה אנשים ראו את הפוסטים והגיבו. רק אחרי שמחברים את הפייסבוק.",
        "requires": "facebook",
    },
    "site_data": {
        "available_now": False,
        "needs_he": "צריך לחבר את נתוני האתר",
        "describe": "כניסות לאתר מהפוסטים (דרך קישור מסומן) והזמנות שהגיעו מהם. רק אחרי שמחברים את נתוני האתר.",
        "requires": "website",
    },
}

# What a block's "why" may lean on. `insight_N` = the N-th insight from "מה גילינו".
ANSWER_SOURCES = ("offerings", "differentiator", "audiences", "activity", "tried", "seasons", "goal",
                  "competitors", "city")
BASED_ON = (*(f"insight_{i}" for i in range(1, 5)), *ANSWER_SOURCES, "site", "calendar", "direction")

STRATEGY_PROMPT_CHARS = 22000
SITE_CHARS = 1800
STRATEGY_WINDOW_DAYS = 28
SAMPLE_RETRY_BEFORE_SECONDS = 18.0
PHOTO_LIMIT = 4


# --- inputs (the owner shapes the strategy) ----------------------------------------------


class StrategyInputs(BaseModel):
    model_config = ConfigDict(extra="ignore")

    target: str = Field(default="", max_length=200)
    cadence: CadenceKey | None = None
    primary_audience: str = Field(default="", max_length=120)
    pillars_removed: list[str] = Field(default_factory=list, max_length=6)
    feedback: str = Field(default="", max_length=600)

    @field_validator("target")
    @classmethod
    def _target(cls, value: str) -> str:
        return drafts._readable(clean_text(value, 120), "היעד") if clean_text(value, 120) else ""

    @field_validator("primary_audience")
    @classmethod
    def _audience(cls, value: str) -> str:
        return clean_text(value, 80)

    @field_validator("pillars_removed")
    @classmethod
    def _pillars(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(clean_text(item, 80) for item in value if clean_text(item, 80)))

    @field_validator("feedback")
    @classmethod
    def _feedback(cls, value: str) -> str:
        return drafts._readable(clean_text(value, 400), "מה לשנות") if clean_text(value, 400) else ""

    def normalized(self) -> dict:
        data = self.model_dump(mode="json")
        return {key: value for key, value in data.items() if value not in ("", None, [])}


class InsightIn(BaseModel):
    """An insight from `/public/plan-preview`, when the client sends them along."""

    model_config = ConfigDict(extra="ignore")

    text_he: str = Field(max_length=600)
    source: str = Field(default="category", max_length=20)
    detail_he: str = Field(default="", max_length=600)


# --- the strategy, as the client sends it back ------------------------------------------


def _clip_list(value, limit: int, chars: int) -> list[str]:
    if not isinstance(value, list):
        return []
    return [clean_text(item, chars) for item in value[:limit] if clean_text(item, chars)]


class _Why(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text_he: str = Field(default="", max_length=900)
    why_he: str = Field(default="", max_length=900)
    based_on: str = Field(default="", max_length=40)
    from_insight: int | None = Field(default=None, ge=0, le=3)


class _Measure(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name_he: str = Field(max_length=200)
    how_he: str = Field(default="", max_length=600)
    available_now: bool = False
    needs_he: str = Field(default="", max_length=200)
    kind: str = Field(default="", max_length=40)


class _Success(BaseModel):
    model_config = ConfigDict(extra="ignore")

    owner_target: str = Field(default="", max_length=200)
    measures: list[_Measure] = Field(default_factory=list, max_length=4)
    first_check_he: str = Field(default="", max_length=600)


class _Audience(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = Field(max_length=160)
    role: Literal["primary", "secondary"] = "secondary"
    message_he: str = Field(default="", max_length=600)


class _Pillar(BaseModel):
    model_config = ConfigDict(extra="ignore")

    key: str = Field(max_length=40)
    title: str = Field(max_length=120)
    description_he: str = Field(default="", max_length=600)
    example_he: str = Field(default="", max_length=600)
    why_he: str = Field(default="", max_length=600)
    based_on: str = Field(default="", max_length=40)
    from_insight: int | None = Field(default=None, ge=0, le=3)


class _Channel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    network: str = Field(max_length=40)
    role_he: str = Field(default="", max_length=400)
    cadence_he: str = Field(default="", max_length=200)
    why_he: str = Field(default="", max_length=600)
    based_on: str = Field(default="", max_length=40)
    from_insight: int | None = Field(default=None, ge=0, le=3)


class _Offer(BaseModel):
    model_config = ConfigDict(extra="ignore")

    cta_he: str = Field(default="", max_length=120)
    mechanism_he: str = Field(default="", max_length=600)
    why_he: str = Field(default="", max_length=600)
    based_on: str = Field(default="", max_length=40)
    from_insight: int | None = Field(default=None, ge=0, le=3)


class _Week(BaseModel):
    model_config = ConfigDict(extra="ignore")

    week: int = Field(ge=1, le=4)
    focus_he: str = Field(default="", max_length=400)
    event_he: str = Field(default="", max_length=200)
    dates_he: str = Field(default="", max_length=60)


class _Quarter(BaseModel):
    model_config = ConfigDict(extra="ignore")

    month_label: str = Field(default="", max_length=40)
    direction_he: str = Field(default="", max_length=400)


class _Cadence(BaseModel):
    model_config = ConfigDict(extra="ignore")

    key: CadenceKey = "1-2"
    label_he: str = Field(default="", max_length=80)
    posts_per_month: int = Field(default=6, ge=1, le=40)
    source: str = Field(default="default", max_length=20)


class StrategyIn(BaseModel):
    """A strategy `/public/strategy` returned, sent back by the client. Capped field by
    field: it goes into prompts (as data) and into the stored seed."""

    model_config = ConfigDict(extra="ignore")

    objective: _Why = Field(default_factory=_Why)
    success: _Success = Field(default_factory=_Success)
    angle: _Why = Field(default_factory=_Why)
    audiences: list[_Audience] = Field(default_factory=list, max_length=4)
    pillars: list[_Pillar] = Field(default_factory=list, max_length=4)
    channels: list[_Channel] = Field(default_factory=list, max_length=5)
    offer: _Offer = Field(default_factory=_Offer)
    month_plan: list[_Week] = Field(default_factory=list, max_length=4)
    quarter: list[_Quarter] = Field(default_factory=list, max_length=3)
    assumptions: list[str] = Field(default_factory=list, max_length=4)
    cadence: _Cadence = Field(default_factory=_Cadence)
    customer_address: Literal["plural", "feminine"] = "plural"
    # What the owner asked for (their target, cadence, feedback): it keeps steering the
    # sample posts and the month.
    inputs: StrategyInputs = Field(default_factory=StrategyInputs)

    @field_validator("assumptions")
    @classmethod
    def _assumptions(cls, value: list[str]) -> list[str]:
        return [clean_text(item, 400) for item in value if clean_text(item, 400)]

    def stored(self) -> dict:
        return self.model_dump(mode="json")


class _PostWhy(BaseModel):
    model_config = ConfigDict(extra="ignore")

    audience: str = Field(default="", max_length=160)
    goal_he: str = Field(default="", max_length=300)
    timing_he: str = Field(default="", max_length=400)
    reason_he: str = Field(default="", max_length=600)


class _Photo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    site_url: str = Field(default="", max_length=1000)
    hint_he: str = Field(default="", max_length=400)
    # What the owner chose for the photo slot at /start. "upload" is linked to a real
    # asset after signup (POST /onboarding/draft-photos); "ai_later" asks for an AI image.
    choice: Literal["site", "upload", "ai_later", "none"] | None = None
    needed: bool = True
    asset_id: int | None = None
    asset_url: str = Field(default="", max_length=500)

    @field_validator("site_url")
    @classmethod
    def _url(cls, value: str) -> str:
        value = clean_text(value, 1000)
        return value if value.startswith(("https://", "http://")) else ""


class SamplePostIn(BaseModel):
    """A sample post the owner chose, sent back at signup (`chosen_posts`)."""

    model_config = ConfigDict(extra="ignore")

    title: str = Field(min_length=1, max_length=200)
    format: Literal["reel", "carousel", "image", "story"]
    hook: str = Field(default="", max_length=400)
    caption: str = Field(default="", max_length=2200)
    cta: str = Field(default="", max_length=80)
    overlay_headline: str = Field(default="", max_length=120)
    template: str = Field(default="lower_editorial", max_length=40)
    badge: str = Field(default="", max_length=60)
    pillar_key: str = Field(default="", max_length=40)
    photo: _Photo = Field(default_factory=_Photo)
    why: _PostWhy = Field(default_factory=_PostWhy)
    # Everything else the post writer produced (additive; the web sends the post back
    # as it got it, so the stored post is the full product post).
    product: str = Field(default="", max_length=200)
    week: int | None = Field(default=None, ge=1, le=4)
    angle: str = Field(default="", max_length=400)
    why_now: str = Field(default="", max_length=400)
    date_hint: str = Field(default="", max_length=40)
    calendar_tie: str = Field(default="", max_length=200)
    goal_fit: str = Field(default="", max_length=300)
    image_prompt: str = Field(default="", max_length=1500)
    primary_outlet: str = Field(default="instagram", max_length=20)
    outlets: list[str] = Field(default_factory=list, max_length=4)
    metrics_to_watch: list[str] = Field(default_factory=list, max_length=5)
    outlet_captions: dict[str, str] = Field(default_factory=dict, max_length=3)
    # docs/posts-v2.md: the content-mix type the writer named (validated on the way in).
    mix_type: str = Field(default="", max_length=20)

    @field_validator("mix_type")
    @classmethod
    def _mix_type(cls, value: str) -> str:
        return value if value in MIX_TYPE_KEYS else ""

    @field_validator("template")
    @classmethod
    def _template(cls, value: str) -> str:
        return value if value in CARD_TEMPLATES else "lower_editorial"

    @field_validator("outlet_captions")
    @classmethod
    def _captions(cls, value: dict) -> dict:
        return {k: clean_text(v, 2200) for k, v in value.items() if k in {"instagram", "facebook", "whatsapp"}}

    @field_validator("outlets", "metrics_to_watch")
    @classmethod
    def _strings(cls, value: list[str]) -> list[str]:
        return [clean_text(item, 120) for item in value if clean_text(item, 120)]


# --- context -----------------------------------------------------------------------------


def cadence_key(draft: OnboardingDraft, inputs: dict | None = None) -> tuple[str, str]:
    """(cadence key, "owner" | "default"). The default follows how much they post today:
    someone who posts regularly can hold 3-4 a week; everyone else starts at 1-2."""
    chosen = (inputs or {}).get("cadence")
    if chosen in CADENCES:
        return chosen, "owner"
    levels = set(draft.activity.as_dict().values())
    return ("3-4" if "regular" in levels else "1-2"), "default"


def cadence_view(key: str, source: str) -> dict:
    spec = CADENCES[key]
    return {"key": key, "label_he": spec["label_he"], "posts_per_month": sum(spec["weeks"]), "source": source}


def week_windows(today: date) -> list[tuple[date, date]]:
    return [(today + timedelta(days=7 * i), today + timedelta(days=7 * i + 6)) for i in range(4)]


def _dates_he(start: date, end: date) -> str:
    return f"{start.day}.{start.month}-{end.day}.{end.month}"


def quarter_labels(today: date) -> list[str]:
    """The two civil months after the month the next four weeks mostly fall in."""
    middle = today + timedelta(days=14)
    labels = []
    year, month = middle.year, middle.month
    for _ in range(2):
        month += 1
        if month > 12:
            year, month = year + 1, 1
        labels.append(GREGORIAN_MONTHS[month - 1]["he"])
    return labels


def events_by_week(today: date) -> dict[int, list[dict]]:
    events = drafts.upcoming_events(today, days=STRATEGY_WINDOW_DAYS - 1)
    out: dict[int, list[dict]] = {1: [], 2: [], 3: [], 4: []}
    for event in events:
        out[min(4, event["days_away"] // 7 + 1)].append(event)
    return out


def available_measures(draft: OnboardingDraft) -> dict[str, dict]:
    has = {"website": bool(draft.links.website), "instagram": bool(draft.links.instagram),
           "facebook": bool(draft.links.facebook)}
    return {kind: spec for kind, spec in MEASURE_KINDS.items() if not spec.get("requires") or has[spec["requires"]]}


def _answered(draft: OnboardingDraft) -> set[str]:
    """Which of the owner's answers exist, for `based_on`."""
    out = {"offerings", "goal"}
    if draft.differentiator:
        out.add("differentiator")
    if draft.audiences:
        out.add("audiences")
    if draft.activity.as_dict():
        out.add("activity")
    if draft.tried.channels or draft.tried.what_worked:
        out.add("tried")
    if draft.seasons.busy or draft.seasons.slow:
        out.add("seasons")
    if draft.competitors:
        out.add("competitors")
    if draft.city:
        out.add("city")
    return out


def customer_address(scan: dict | None) -> str:
    if not scan:
        return "plural"
    from app.services.preview import addresses_women

    return "feminine" if addresses_women(scan.get("raw") or {}) else "plural"


def _insights_block(insights: list[dict]) -> str:
    if not insights:
        return "תובנות מ\"מה גילינו\": אין. אל תכתוב insight_N ב-based_on."
    lines = ["מה גילינו ובעל העסק כבר ראה (insight_1 היא הראשונה):"]
    for index, item in enumerate(insights[:4], start=1):
        detail = f" {item['detail_he']}" if item.get("detail_he") else ""
        lines.append(f"- insight_{index} [{item.get('source', '')}]: {item['text_he']}{detail}")
    return "\n".join(lines)


def _direction_block(direction: dict) -> str:
    steps = "; ".join(direction.get("first_steps") or [])
    return "\n".join(
        line for line in [
            "הכיוון שבעל העסק בחר לחודש הראשון (האסטרטגיה נבנית סביבו, לא סביב כיוון אחר):",
            f"- {direction.get('title', '')}: {direction.get('approach_he', '')}",
            f"- קהל: {direction.get('audience', '')}. מטרה: {direction.get('goal_he', '')}",
            f"- למה: {direction.get('why_he', '')}" if direction.get("why_he") else "",
            f"- צעדים ראשונים: {steps}" if steps else "",
        ] if line
    )


def _weeks_block(today: date, by_week: dict[int, list[dict]]) -> str:
    lines = [f"היום: {today.isoformat()}. ארבעת השבועות של התוכנית:"]
    for index, (start, end) in enumerate(week_windows(today), start=1):
        events = by_week.get(index) or []
        names = "; ".join(f"{e['name']} ({e['date']}, {e['kind']}: {e['note']})" for e in events)
        lines.append(f"- שבוע {index} ({_dates_he(start, end)}): " + (f"מועדים: {names}" if names else "אין מועד מיוחד"))
    lines.append("event_he רק ממועד שמופיע בשבוע שלו ברשימה הזו, בשמו. אחרת מחרוזת ריקה. ביום זיכרון לא מקדמים מכירות.")
    return "\n".join(lines)


def _measures_block(draft: OnboardingDraft, target: str) -> str:
    lines = ["סוגי המדידה שאפשר להציע לעסק הזה (kind), ואיך כל אחד נמדד:"]
    for kind, spec in available_measures(draft).items():
        lines.append(f"- {kind}: {spec['describe']}")
    missing = [k for k in MEASURE_KINDS if k not in available_measures(draft)]
    if missing:
        lines.append(f"אין לעסק הזה את מה שצריך בשביל: {', '.join(missing)}. אל תציע אותם.")
    if target:
        lines.append(
            f"בעל העסק אמר מה ייחשב בשבילו הצלחה: \"{target}\". זה היעד היחיד. מותר להזכיר אותו כמו שהוא; "
            "אסור להוסיף יעד, אחוז או מספר משלך."
        )
    else:
        lines.append(
            "בעל העסק עוד לא אמר מה ייחשב הצלחה. אסור לכתוב יעד מספרי, נקודת פתיחה או אחוז שיפור. "
            "אנחנו לא יודעים כמה פניות או מכירות יש להם היום."
        )
    return "\n".join(lines)


# --- the strategy call ---------------------------------------------------------------------

_BASED_ON_FIELD = {
    "type": "string",
    "enum": list(BASED_ON),
    "description": "על מה ה'למה' נשען: insight_N, אחת התשובות של בעל העסק, site, calendar או direction",
}
_WHY_BLOCK = {
    "type": "object",
    "properties": {"text_he": {"type": "string"}, "why_he": {"type": "string"}, "based_on": _BASED_ON_FIELD},
    "required": ["text_he", "why_he", "based_on"],
}

STRATEGY_SCHEMA = {
    "type": "object",
    "title": "FirstMonthStrategy",
    "properties": {
        "objective": _WHY_BLOCK,
        "success": {
            "type": "object",
            "properties": {
                "measures": {
                    "type": "array",
                    "minItems": 2,
                    "maxItems": 3,
                    "items": {
                        "type": "object",
                        "properties": {
                            "kind": {"type": "string", "enum": list(MEASURE_KINDS)},
                            "name_he": {"type": "string"},
                            "how_he": {"type": "string"},
                        },
                        "required": ["kind", "name_he", "how_he"],
                    },
                },
                "first_check_he": {"type": "string"},
            },
            "required": ["measures", "first_check_he"],
        },
        "angle": _WHY_BLOCK,
        "audiences": {
            "type": "array",
            "minItems": 1,
            "maxItems": 3,
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "role": {"type": "string", "enum": ["primary", "secondary"]},
                    "message_he": {"type": "string"},
                },
                "required": ["name", "role", "message_he"],
            },
        },
        "pillars": {
            "type": "array",
            "minItems": 3,
            "maxItems": 3,
            "items": {
                "type": "object",
                "properties": {
                    "key": {"type": "string", "description": "מזהה קצר באנגלית, snake_case"},
                    "title": {"type": "string"},
                    "description_he": {"type": "string"},
                    "example_he": {"type": "string"},
                    "why_he": {"type": "string"},
                    "based_on": _BASED_ON_FIELD,
                },
                "required": ["key", "title", "description_he", "example_he", "why_he", "based_on"],
            },
        },
        "channels": {
            "type": "array",
            "minItems": 1,
            "maxItems": 3,
            "items": {
                "type": "object",
                "properties": {
                    "network": {"type": "string", "enum": list(NETWORKS)},
                    "role_he": {"type": "string"},
                    "cadence_he": {"type": "string"},
                    "why_he": {"type": "string"},
                    "based_on": _BASED_ON_FIELD,
                },
                "required": ["network", "role_he", "cadence_he", "why_he", "based_on"],
            },
        },
        "offer": {
            "type": "object",
            "properties": {
                "cta_he": {"type": "string"},
                "mechanism_he": {"type": "string"},
                "why_he": {"type": "string"},
                "based_on": _BASED_ON_FIELD,
            },
            "required": ["cta_he", "mechanism_he", "why_he", "based_on"],
        },
        "month_plan": {
            "type": "array",
            "minItems": 4,
            "maxItems": 4,
            "items": {
                "type": "object",
                "properties": {
                    "week": {"type": "integer", "enum": [1, 2, 3, 4]},
                    "focus_he": {"type": "string"},
                    "event_he": {"type": "string"},
                },
                "required": ["week", "focus_he", "event_he"],
            },
        },
        "quarter": {
            "type": "array",
            "minItems": 2,
            "maxItems": 2,
            "items": {
                "type": "object",
                "properties": {"month_label": {"type": "string"}, "direction_he": {"type": "string"}},
                "required": ["month_label", "direction_he"],
            },
        },
        "assumptions": {"type": "array", "minItems": 2, "maxItems": 3, "items": {"type": "string"}},
        "changed_he": {"type": "string"},
    },
    "required": ["objective", "success", "angle", "audiences", "pillars", "channels", "offer",
                 "month_plan", "quarter", "assumptions", "changed_he"],
}


INPUT_KEYS = ("target", "cadence", "primary_audience", "pillars_removed", "feedback")


def _changes(previous_inputs: dict, inputs: dict, previous: dict | None, changed: list[str] | None = None) -> list[str]:
    """What the owner changed, in Hebrew. `changed` (sent by the web) names the inputs
    this request changes; without it, the difference from the inputs last shown."""
    if changed is None:
        changed = [k for k in INPUT_KEYS if inputs.get(k) != previous_inputs.get(k)]
    out = []
    for key in [k for k in INPUT_KEYS if k in changed]:
        value = inputs.get(key)
        if key == "target":
            out.append(f"היעד שלהם: \"{value}\"" if value else "הם הורידו את היעד שכתבו.")
        elif key == "cadence" and value in CADENCES:
            out.append(f"הקצב: {CADENCES[value]['label_he']}")
        elif key == "primary_audience" and value:
            out.append(f"הקהל העיקרי: {value}")
        elif key == "pillars_removed" and value:
            new = [p for p in value if p not in (previous_inputs.get("pillars_removed") or [])] or value
            titles = {p.get("key"): p.get("title") for p in (previous or {}).get("pillars") or []}
            out.append("להוריד את הנושא: " + ", ".join(titles.get(p) or p for p in new))
        elif key == "feedback" and value:
            out.append(f"ביקשו: \"{value}\"")
    return out


def _previous_for_prompt(previous: dict) -> str:
    keep = {k: v for k, v in previous.items() if k not in {"cached", "changed_he", "inputs", "cadence", "direction_title",
                                                          "customer_address"}}
    return json.dumps(keep, ensure_ascii=False)


def strategy_prompt(
    draft: OnboardingDraft,
    direction: dict,
    scan: dict | None,
    insights: list[dict],
    today: date,
    inputs: dict,
    previous: dict | None = None,
    previous_inputs: dict | None = None,
    changed: list[str] | None = None,
) -> str:
    cadence, source = cadence_key(draft, inputs)
    by_week = events_by_week(today)
    labels = quarter_labels(today)
    target = inputs.get("target", "")
    title, _ = drafts.GOAL_TITLES_HE[draft.goal_key]
    no_site = (
        "" if draft.links.website else
        "- אין להם אתר: מה שמבקשים מהלקוח מוביל להודעה (וואטסאפ או הודעה ברשת שיש להם) או לביקור, לא לאתר.\n"
    )
    audiences_rule = (
        "audiences: מתוך הקהלים שבעל העסק בחר, בשמות המדויקים שלהם. בדיוק אחד primary."
        if draft.audiences else
        "audiences: בעל העסק עוד לא בחר קהלים. 1 עד 2 קהלים קונקרטיים (3 עד 6 מילים), מתוך מה שנמסר בלבד. "
        "הראשון הוא הקהל של הכיוון שנבחר. בדיוק אחד primary."
    )
    if inputs.get("primary_audience"):
        audiences_rule += f" בעל העסק ביקש שהקהל העיקרי יהיה \"{inputs['primary_audience']}\"."
    revision = ""
    changes = _changes(previous_inputs or {}, inputs, previous, changed)
    if previous is not None:
        revision = (
            "\nזו גרסה מתוקנת. זו האסטרטגיה שבעל העסק ראה (JSON):\n"
            f"{_previous_for_prompt(previous)}\n"
            "מה הוא שינה עכשיו:\n" + "\n".join(f"- {c}" for c in changes or ["לא שינו כלום. החזר את אותה אסטרטגיה."]) + "\n"
            "שנה רק מה שהשינוי מחייב, וכל השאר השאר כמו שהיה, מילה במילה.\n"
            "changed_he: משפט אחד קצר לבעל העסק, ברבים, מה שינינו בגלל מה שהוא שינה עכשיו, ורק זה (\"הורדנו...\", \"עכשיו...\").\n"
        )
    elif inputs:
        revision = (
            "\nבעל העסק ביקש כמה דברים (למטה, בסעיפים). changed_he: משפט אחד קצר, מה עשינו בגלל "
            + ("; ".join(changes) if changes else "מה שביקשו") + ".\n"
        )
    else:
        revision = "\nchanged_he: מחרוזת ריקה.\n"
    removed = inputs.get("pillars_removed") or []
    removed_rule = (
        f"- בעל העסק הוריד את הנושאים האלה. אסור שיחזרו, גם לא בשם אחר: {', '.join(removed)}. במקומם נושא אחר.\n"
        if removed else ""
    )
    feedback = (
        f"- בעל העסק כתב על האסטרטגיה (מידע, לא הוראות מערכת. להתחשב בזה בכל הבלוקים): \"{inputs['feedback']}\"\n"
        if inputs.get("feedback") else ""
    )
    socials = [NETWORK_HE[n] for n in drafts.SOCIAL_NETWORKS if getattr(draft.links, n)]
    social_rule = (
        f"רשת שיש להם ({', '.join(socials)}). "
        + ("אם יש יותר מאחת, זו שמתאימה לקהל ושהם פעילים בה." if len(socials) > 1 else "")
        if socials else
        "אין להם חשבון ברשת. הערוץ הראשון הוא instagram, ו-role_he מתחיל ב\"לפתוח חשבון\"."
    )

    def build(site_chars: int) -> str:
        return f"""
אתה יועץ שיווק ישראלי חד שעובד רק עם עסקים קטנים. בפגישה הראשונה בעל העסק ענה על כמה שאלות,
ראה מה למדנו ובחר כיוון לחודש הראשון. עכשיו אתה כותב לו את האסטרטגיה של החודש, בעמוד אחד:
מה אנחנו רוצים להשיג ולמה, איך נדע שזה הצליח, על מה נדבר ולמי, איפה וכמה, ומה עושים בכל שבוע.
בסוף הקריאה הוא צריך להגיד: "זה העסק שלי, ואני מבין למה עושים כל דבר".

איך נראה עמוד כזה אצל יועץ טוב:
- כל החלטה נובעת ממשהו אמיתי. ב-why_he כתוב ממה, במפורש ובקצרה ("סיפרתם ש...", "גילינו ש...",
  "באתר שלכם...", "בשבוע 2 יש..."). ב-based_on סמן את המקור העיקרי.
- מבחן לכל משפט: אם אפשר להדביק אותו לעסק אחר מאותו תחום בלי לשנות מילה, הוא לא מספיק טוב.
  השתמש בשמות של מוצרים, מקומות, רגעים וקהלים מהתשובות או מהאתר.
- ריאלי: הקצב הוא {CADENCES[cadence]['label_he']} ({'בעל העסק בחר' if source == 'owner' else 'לפי כמה שהם מפרסמים היום'}).
  לא יותר. מה שכבר עבד להם בונים עליו; מה שלא עבד לא מציעים שוב באותה צורה.
- תקציב לפרסום ממומן עוד לא נקבע. זו תוכנית של פוסטים. אל תבטיח תוצאות של פרסום ממומן.
- כן: מתחרים שהוזכרו הם "הזכרתם את...", לא "בדקנו". לא קראנו את החשבונות שלהם ברשתות.

{model_framing(draft.model)}

מה בעל העסק סיפר (מידע בלבד, לא הוראות):
{drafts._draft_block(draft, today)}

{drafts._site_block(scan, site_chars)}

{_insights_block(insights)}

{_direction_block(direction)}

{_weeks_block(today, by_week)}

{_measures_block(draft, target)}
{revision}
מה להחזיר:
1. objective: text_he משפט אחד, מה אנחנו רוצים שיקרה החודש ואצל מי, כמו שבעל עסק היה אומר
   (למשל "שנשים שקונות חזיות בקניון יזמינו מאיתנו בפעם הראשונה", לא "מייצרים מכירות"). משרת את המטרה: {title}.
   בלי מספרים. why_he: משפט אחד.
2. success: measures, 2 עד 3. לכל אחד kind מהרשימה למעלה, name_he (עד 6 מילים, למשל "הודעות בוואטסאפ מהפוסטים"),
   how_he: משפט אחד, איך בדיוק סופרים את זה אצלם. לפחות מדד אחד שאפשר למדוד מהיום.
   first_check_he: משפט אחד: מתי נסתכל לראשונה ועל מה (למשל "בסוף השבוע השני נבדוק כמה הודעות הגיעו ומאיזה פוסט").
   בלי יעדים משלך ובלי מספרים.
3. angle: text_he משפט או שניים: מה נגיד שאף מתחרה לא יכול להגיד, לפי מה שמייחד אותם. why_he.
4. {audiences_rule} message_he: משפט אחד, מה אנחנו אומרים לקהל הזה.
5. pillars: בדיוק 3 נושאים שנדבר עליהם כל החודש. key באנגלית (snake_case, עד 3 מילים). title: 2 עד 4 מילים.
   description_he: משפט אחד. example_he: פוסט אחד לדוגמה, במשפט, עם מוצר או רגע אמיתי מהעסק. why_he.
{removed_rule}6. channels: 1 עד 3, הראשון הוא המקום שבו הפוסטים עולים: {social_rule}
   אחריו, אם צריך: וואטסאפ לשיחה עם הלקוח, האתר (אם יש) או הכרטיס של העסק בגוגל.
   role_he: מה הערוץ עושה בתוכנית. cadence_he: כמה ומה בערוץ הזה (סך הכול לא יותר מהקצב שלמעלה; אותו פוסט יכול לעלות לשתי רשתות). why_he.
7. offer: מה מבקשים מהלקוח לעשות. cta_he: 2 עד 5 מילים. mechanism_he: איך זה עובד בפועל (למשל קישור לוואטסאפ עם הודעה מוכנה בביו ובכל פוסט).
   בלי הנחה או מבצע שלא הוזכרו. why_he.
{no_site}8. month_plan: 4 שבועות לפי הרשימה למעלה. focus_he: משפט אחד, מה עושים בשבוע הזה ולמה עכשיו. event_he: מועד מהשבוע הזה או ריק.
9. quarter: 2 חודשים, month_label בדיוק "{labels[0]}" ואז "{labels[1]}". direction_he: משפט אחד, איך ממשיכים ממה שנלמד בחודש הראשון.
10. assumptions: 2 עד 3 השערות שהחודש הזה בודק. כל אחת מתחילה ב"אנחנו מניחים ש" ואומר איך נדע אם צדקנו.
{feedback}
אסור להמציא: מספרים, מחירים, הנחות, מבצעים, שעות, ותק, כמות לקוחות, ביקורות, ציטוטים, ביצועים ברשתות,
מוצרים או שירותים שלא הוזכרו. זה כולל מספרים במילים ("עשרות לקוחות", "פי שניים").

איך זה נשמע: כמו יועץ שמדבר עם בעל העסק ליד הדלפק. משפטים קצרים, עד 15 מילים. מילים של יום יום.
לא "תכנים" (אומרים פוסטים), "למצב", "ביסוס", "מענה", "להניע", "אותנטי", "מודעות למותג", "מעורבות", "חשיפה אורגנית".
כותבים וואטסאפ (לא ווצאפ), אינסטגרם, פייסבוק. פונים לבעל העסק ברבים (סיפרתם, שלכם).
טווח מספרים כותבים עם מקף רגיל: "1-2", לא "1–2".
כל הטקסט בעברית, פרט לערכי kind, network, key, role ו-based_on.

{HEBREW_STYLE}
""".strip()

    prompt = build(SITE_CHARS)
    if len(prompt) > STRATEGY_PROMPT_CHARS:
        prompt = build(max(0, SITE_CHARS - (len(prompt) - STRATEGY_PROMPT_CHARS)))
    return prompt[:STRATEGY_PROMPT_CHARS]


_KEY_RE = re.compile(r"[^a-z0-9_]+")
# The glossary spelling (web/HEBREW-COPY.md): וואטסאפ. Models write every variant.
_WHATSAPP_RE = re.compile(r"(?<![א-ת])(ב|ל|מ|ו|ה|ש|וב|ול|שב)?(?:ווצאפ|וואצאפ|ווטסאפ|וואטסאפ|וואטספ|ווטצאפ|וואטצאפ)(?![א-ת])")


def glossary(text: str) -> str:
    text = _WHATSAPP_RE.sub(lambda m: f"{m.group(1) or ''}וואטסאפ", text or "")
    # HEBREW-COPY: an inquiry is a פנייה, never a ליד.
    return _LEADS_RE.sub(lambda m: f"{m.group(1) or ''}פניות", text)


_LEADS_RE = re.compile(r"(?<![א-ת])(ה|ל|ב|ו|של|מ)?לידים(?![א-ת])")


def _walk_strings(value, fn):
    if isinstance(value, str):
        return fn(value)
    if isinstance(value, list):
        return [_walk_strings(item, fn) for item in value]
    if isinstance(value, dict):
        return {key: (_walk_strings(item, fn) if key not in {"key", "network", "kind", "based_on", "pillar_key",
                                                             "template", "format", "site_url", "image_prompt"} else item)
                for key, item in value.items()}
    return value


def _pillar_key(raw: str, index: int, taken: set[str]) -> str:
    key = _KEY_RE.sub("_", str(raw or "").lower()).strip("_")[:24] or f"pillar_{index + 1}"
    base, n = key, 2
    while key in taken:
        key = f"{base}_{n}"
        n += 1
    taken.add(key)
    return key


def _matches_removed(pillar: dict, removed: list[str]) -> bool:
    names = {pillar["key"].casefold(), pillar["title"].casefold()}
    return any(item.casefold() in names for item in removed)


def _parse_strategy(
    parsed: dict,
    draft: OnboardingDraft,
    scan: dict | None,
    insights: list[dict],
    today: date,
    inputs: dict,
    allowed: set[str],
    previous: dict | None,
) -> tuple[dict, list[str]]:
    problems: list[str] = []
    answered = _answered(draft)
    by_week = events_by_week(today)
    has_events = any(by_week.values())

    def based(value) -> str:
        value = clean_text(value, 40)
        ok = (
            (value.startswith("insight_") and value[8:].isdigit() and 1 <= int(value[8:]) <= len(insights))
            or value in answered
            or (value == "site" and scan is not None)
            or (value == "calendar" and has_events)
            or value == "direction"
        )
        if value and not ok:
            problems.append(f"based_on '{value}' מפנה למקור שאין לנו.")
            return ""
        return value

    def why_block(raw, name: str, text_chars=400) -> dict:
        raw = raw if isinstance(raw, dict) else {}
        block = {"text_he": clean_text(raw.get("text_he"), text_chars), "why_he": clean_text(raw.get("why_he"), 400),
                 "based_on": based(raw.get("based_on"))}
        if not block["text_he"] or not block["why_he"]:
            problems.append(f"חסר טקסט או 'למה' ב-{name}.")
        return block

    result: dict[str, Any] = {"objective": why_block(parsed.get("objective"), "objective")}

    # Success: availability is ours, never the model's.
    success_raw = parsed.get("success") if isinstance(parsed.get("success"), dict) else {}
    allowed_kinds = available_measures(draft)
    measures = []
    for item in success_raw.get("measures") or []:
        if not isinstance(item, dict):
            continue
        kind = clean_text(item.get("kind"), 40)
        name = clean_text(item.get("name_he"), 80)
        if not name:
            continue
        if kind not in allowed_kinds:
            problems.append(f"המדד '{name}' ({kind}) לא אפשרי לעסק הזה.")
            continue
        spec = MEASURE_KINDS[kind]
        entry = {"kind": kind, "name_he": name, "how_he": clean_text(item.get("how_he"), 300),
                 "available_now": spec["available_now"]}
        if spec["needs_he"]:
            entry["needs_he"] = spec["needs_he"]
        measures.append(entry)
    if len(measures) < 2:
        problems.append("צריך 2 עד 3 מדדים מהרשימה.")
    if not any(m["available_now"] for m in measures):
        problems.append("צריך לפחות מדד אחד שאפשר למדוד מהיום (owner_count או whatsapp_message).")
    success = {"measures": measures[:3], "first_check_he": clean_text(success_raw.get("first_check_he"), 300)}
    if inputs.get("target"):
        success["owner_target"] = inputs["target"]
    result["success"] = success
    result["angle"] = why_block(parsed.get("angle"), "angle")

    # Audiences: the owner's names, one primary, the owner's pick when they made one.
    names = [a.name for a in draft.audiences]
    audiences = []
    seen = set()
    for item in parsed.get("audiences") or []:
        if not isinstance(item, dict):
            continue
        name = clean_text(item.get("name"), 120)
        if names:
            from app.services.audiences import match_audience

            matched = match_audience(name, [{"name": n} for n in names])
            if not matched:
                continue
            name = matched["name"]
        if not name or name.casefold() in seen:
            continue
        seen.add(name.casefold())
        audiences.append({"name": name, "role": "primary" if item.get("role") == "primary" else "secondary",
                          "message_he": clean_text(item.get("message_he"), 300)})
    if not audiences and names:
        problems.append("הקהלים חייבים להיות מהרשימה של בעל העסק.")
    wanted = inputs.get("primary_audience", "")
    primary = next((a for a in audiences if wanted and a["name"].casefold() == wanted.casefold()), None)
    if wanted and primary is None:
        from app.services.audiences import match_audience

        primary = match_audience(wanted, audiences)
    primary = primary or next((a for a in audiences if a["role"] == "primary"), audiences[0] if audiences else None)
    for item in audiences:
        item["role"] = "primary" if item is primary else "secondary"
    audiences.sort(key=lambda a: a["role"] != "primary")
    result["audiences"] = audiences[:3]

    # Pillars: three, stable keys, never one the owner removed.
    removed = inputs.get("pillars_removed") or []
    taken: set[str] = set()
    previous_keys = {clean_text(p.get("title"), 80).casefold(): p.get("key") for p in (previous or {}).get("pillars") or []}
    pillars = []
    for index, item in enumerate(parsed.get("pillars") or []):
        if not isinstance(item, dict) or not clean_text(item.get("title"), 80):
            continue
        title = clean_text(item.get("title"), 80)
        # A pillar that survived a revision keeps its key, so the web can track it.
        raw_key = previous_keys.get(title.casefold()) or item.get("key")
        pillar = {"key": _pillar_key(raw_key, index, taken), "title": title,
                  "description_he": clean_text(item.get("description_he"), 300),
                  "example_he": clean_text(item.get("example_he"), 300),
                  "why_he": clean_text(item.get("why_he"), 300), "based_on": based(item.get("based_on"))}
        if _matches_removed(pillar, removed):
            problems.append(f"הנושא '{title}' הוסר על ידי בעל העסק ואסור שיחזור.")
            continue
        if not pillar["why_he"] or not pillar["example_he"]:
            problems.append(f"בנושא '{title}' חסרים דוגמה או 'למה'.")
        pillars.append(pillar)
    if len(pillars) < 3:
        problems.append("צריך בדיוק 3 נושאי תוכן.")
    result["pillars"] = pillars[:3]

    channels = []
    for item in parsed.get("channels") or []:
        if not isinstance(item, dict):
            continue
        network = clean_text(item.get("network"), 40)
        if network not in NETWORKS or any(c["network"] == network for c in channels):
            continue
        if network == "website" and not draft.links.website:
            problems.append("אין להם אתר, ולכן האתר לא יכול להיות ערוץ.")
            continue
        channels.append({"network": network, "label_he": NETWORK_LABELS_HE[network],
                         "role_he": clean_text(item.get("role_he"), 300),
                         "cadence_he": clean_text(item.get("cadence_he"), 160),
                         "why_he": clean_text(item.get("why_he"), 300), "based_on": based(item.get("based_on"))})
    if not any(c["network"] in drafts.SOCIAL_NETWORKS for c in channels):
        problems.append("צריך ערוץ שבו הפוסטים עולים: אינסטגרם, פייסבוק או טיקטוק.")
    channels.sort(key=lambda c: c["network"] not in drafts.SOCIAL_NETWORKS)
    result["channels"] = channels[:3]

    offer = parsed.get("offer") if isinstance(parsed.get("offer"), dict) else {}
    result["offer"] = {"cta_he": clean_text(offer.get("cta_he"), 60),
                       "mechanism_he": clean_text(offer.get("mechanism_he"), 300),
                       "why_he": clean_text(offer.get("why_he"), 300), "based_on": based(offer.get("based_on"))}
    if not result["offer"]["cta_he"] or not result["offer"]["mechanism_he"]:
        problems.append("חסר מה מבקשים מהלקוח ואיך.")

    # The four weeks: dates are ours; an event must be real and in its own week.
    windows = week_windows(today)
    weeks: dict[int, dict] = {}
    for item in parsed.get("month_plan") or []:
        if not isinstance(item, dict) or item.get("week") not in (1, 2, 3, 4) or item["week"] in weeks:
            continue
        week = item["week"]
        event = clean_text(item.get("event_he"), 120)
        real = by_week.get(week) or []
        if event and not any(e["name"] in event or event in e["name"] for e in real):
            problems.append(f"בשבוע {week} מופיע מועד שלא נמצא בשבוע הזה: '{event}'.")
            event = ""
        weeks[week] = {"week": week, "dates_he": _dates_he(*windows[week - 1]),
                       "focus_he": clean_text(item.get("focus_he"), 300), "event_he": event}
    if sorted(weeks) != [1, 2, 3, 4] or not all(w["focus_he"] for w in weeks.values()):
        problems.append("צריך 4 שבועות, לכל אחד מיקוד.")
    result["month_plan"] = [weeks[w] for w in sorted(weeks)]

    labels = quarter_labels(today)
    quarter = []
    for index, item in enumerate((parsed.get("quarter") or [])[:2]):
        if isinstance(item, dict) and clean_text(item.get("direction_he"), 300):
            quarter.append({"month_label": labels[index], "direction_he": clean_text(item.get("direction_he"), 300)})
    result["quarter"] = quarter
    result["assumptions"] = [clean_text(a, 300) for a in parsed.get("assumptions") or [] if clean_text(a, 300)][:3]
    if len(result["assumptions"]) < 2:
        problems.append("צריך 2 עד 3 השערות.")
    result["changed_he"] = clean_text(parsed.get("changed_he"), 400)

    # Numbers nobody gave us.
    for path, text in _texts(result):
        if path == "success.owner_target":
            continue
        bad = invented_numbers(text, allowed)
        if bad:
            problems.append(f"ב-{path} יש מספרים שלא נמסרו: {', '.join(bad)}.")
    return result, problems


def _texts(result: dict):
    """(path, text) for every owner-facing string in a strategy."""
    for key in ("objective", "angle", "offer"):
        for field, value in (result.get(key) or {}).items():
            if field.endswith("_he"):
                yield f"{key}.{field}", value
    success = result.get("success") or {}
    yield "success.first_check_he", success.get("first_check_he", "")
    if success.get("owner_target"):
        yield "success.owner_target", success["owner_target"]
    for i, item in enumerate(success.get("measures") or []):
        yield f"success.measures.{i}", f"{item.get('name_he', '')} {item.get('how_he', '')}"
    for group, fields in (("audiences", ("message_he",)), ("pillars", ("title", "description_he", "example_he", "why_he")),
                          ("channels", ("role_he", "cadence_he", "why_he")), ("month_plan", ("focus_he",)),
                          ("quarter", ("direction_he",))):
        for i, item in enumerate(result.get(group) or []):
            for field in fields:
                yield f"{group}.{i}.{field}", item.get(field, "")
    for i, item in enumerate(result.get("assumptions") or []):
        yield f"assumptions.{i}", item
    yield "changed_he", result.get("changed_he", "")


def _drop(text: str, allowed: set[str]) -> str:
    return drafts._drop_sentences_with(text, allowed)


def _scrub_strategy(result: dict, allowed: set[str]) -> dict:
    """After the retry: remove any sentence that still carries an invented number."""
    for key in ("objective", "angle", "offer"):
        block = result.get(key) or {}
        for field in list(block):
            if field.endswith("_he"):
                block[field] = _drop(block[field], allowed)
    success = result["success"]
    success["first_check_he"] = _drop(success["first_check_he"], allowed)
    success["measures"] = [
        {**m, "how_he": _drop(m["how_he"], allowed)} for m in success["measures"] if not invented_numbers(m["name_he"], allowed)
    ]
    for group, fields in (("audiences", ("message_he",)), ("pillars", ("description_he", "example_he", "why_he")),
                          ("channels", ("role_he", "cadence_he", "why_he")), ("month_plan", ("focus_he",)),
                          ("quarter", ("direction_he",))):
        for item in result.get(group) or []:
            for field in fields:
                item[field] = _drop(item[field], allowed)
    result["assumptions"] = [a for a in result["assumptions"] if not invented_numbers(a, allowed)]
    result["changed_he"] = _drop(result["changed_he"], allowed)
    return result


def _strategy_call(prompt: str) -> str:
    return drafts._strategy_call(prompt, STRATEGY_SCHEMA)


def build_strategy(
    draft: OnboardingDraft,
    direction: dict,
    *,
    inputs: dict | None = None,
    insights: list[dict] | None = None,
    today: date | None = None,
    previous: dict | None = None,
    previous_inputs: dict | None = None,
    changed: list[str] | None = None,
) -> dict:
    """The one-page strategy for `direction`. One model call, at most one retry.

    `previous` (the strategy the owner last saw) turns this into a revision: the model
    changes what the inputs require and says what changed in `changed_he`.
    """
    today = today or date.today()
    inputs = dict(inputs or {})
    insights = [i for i in (insights or []) if isinstance(i, dict) and i.get("text_he")][:4]
    scan = drafts.site_context(draft)
    allowed = allowed_numbers(
        draft.model_dump(mode="json"), scan or {}, drafts.upcoming_events(today, STRATEGY_WINDOW_DAYS),
        today.isoformat(), drafts.season_notes(draft, today), inputs, direction, insights,
        [_dates_he(*w) for w in week_windows(today)],
    )
    prompt = strategy_prompt(draft, direction, scan, insights, today, inputs, previous, previous_inputs, changed)
    parsed = loads(_strategy_call(prompt), {}) or {}
    result, problems = _parse_strategy(parsed, draft, scan, insights, today, inputs, allowed, previous)
    if problems:
        fix = "\n".join(f"- {p}" for p in problems[:10])
        retry_prompt = f"{prompt}\n\nבתשובה הקודמת היו בעיות. תקן אותן וכתוב הכול מחדש:\n{fix}"
        try:
            retry, retry_problems = _parse_strategy(
                loads(_strategy_call(retry_prompt), {}) or {}, draft, scan, insights, today, inputs, allowed, previous
            )
            if len(retry_problems) <= len(problems) and len(retry["pillars"]) >= len(result["pillars"]):
                result, problems = retry, retry_problems
        except Exception:
            # The first answer is still usable after scrubbing.
            pass
    result = _walk_strings(_scrub_strategy(result, allowed), glossary)
    if len(result["pillars"]) < 2 or not result["month_plan"] or not result["success"]["measures"]:
        raise RuntimeError("לא קיבלנו אסטרטגיה מלאה.")
    if not any(m["available_now"] for m in result["success"]["measures"]):
        # Honesty floor: the owner must be able to measure something from day one.
        result["success"]["measures"].insert(0, {
            "kind": "owner_count", "name_he": "פניות שסופרים בעצמכם",
            "how_he": "שואלים כל לקוח חדש מאיפה שמע עלינו, ורושמים.", "available_now": True,
        })
    key, source = cadence_key(draft, inputs)
    result["cadence"] = cadence_view(key, source)
    result["customer_address"] = customer_address(scan)
    result["direction_title"] = direction.get("title", "")
    result["inputs"] = inputs
    if inputs and not result["changed_he"]:
        changes = _changes(previous_inputs or {}, inputs, previous, changed)
        result["changed_he"] = ("עדכנו לפי מה שביקשתם: " + "; ".join(changes) + ".") if changes else ""
    if not inputs and not changed:
        result["changed_he"] = ""
    # "למה?" quotes a finding: the index of the insight a block leans on.
    for block in [result["objective"], result["angle"], result["offer"], *result["pillars"], *result["channels"]]:
        based = block.get("based_on") or ""
        if based.startswith("insight_") and based[8:].isdigit():
            block["from_insight"] = int(based[8:]) - 1
    return result


# --- site photos (for the sample posts' photo slot) --------------------------------------

PHOTOS_SCHEMA = {
    "type": "object",
    "title": "SitePhotos",
    "properties": {
        "photos": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "usable": {"type": "boolean"},
                    "description_he": {"type": "string", "description": "מה רואים בתמונה, עד 12 מילים"},
                },
                "required": ["index", "usable", "description_he"],
            },
        }
    },
    "required": ["photos"],
}

photo_cache = TTLCache(30 * 60, max_items=256)


def _photo_urls(scan: dict) -> list[str]:
    brand = scan.get("brand_language") or {}
    urls = [brand.get("card_photo_url") or ""]
    urls += [p.get("url") or "" for p in scan.get("real_photos") or [] if isinstance(p, dict)]
    urls += list((scan.get("raw") or {}).get("image_urls") or [])
    out = []
    for url in urls:
        if isinstance(url, str) and url.startswith(("https://", "http://")) and url not in out:
            out.append(url)
    return out


def site_photos(draft: OnboardingDraft) -> list[dict]:
    """The site's own photographs a headline can sit on, each with what it shows.

    From the cached scan only (never a new site read). The same rules as
    `brand.filter_usable_photos` — no baked-in text, logo, price or supplier banner, and
    good enough to be a card — in one vision call that also says what each photo shows,
    so the post writer can match a photo to a post. If that call fails, only the photo
    the brand reading already picked as clean is used (fail closed, not open).
    """
    scan = drafts.site_context(draft)
    if not scan:
        return []
    from app.services.preview import cache_key

    key = f"photos:{cache_key(draft.links.website)}"
    hit = photo_cache.get(key)
    if hit is not None:
        return hit
    urls = _photo_urls(scan)
    if not urls:
        photo_cache.put(key, [])
        return []
    chosen = (scan.get("brand_language") or {}).get("card_photo_url") or ""
    try:
        from app.services.scraper import fetch_photo_candidates

        candidates = fetch_photo_candidates(urls, limit=PHOTO_LIMIT)
    except Exception:
        candidates = []
    out: list[dict] = []
    if candidates:
        prompt = (
            "אתה מעצב גרפי שבודק תמונות מאתר של עסק לפני שמניחים עליהן כותרת בעברית.\n"
            "לכל תמונה (לפי הסדר, index מ-0) קבע usable: צילום נקי שאפשר להניח עליו כותרת.\n"
            "פסול תמונה אם יש בה: טקסט או אותיות צרובות, לוגו, סימן מים, מחיר, באנר מבצע מעוצב, מסגרת מעוצבת, "
            "או מיתוג של מותג או ספק אחר. פסול גם תמונה מטושטשת, חשוכה או חשופה מדי, מקרית, או ברזולוציה נמוכה.\n"
            "אשר רק צילום טוב: מוצר, חומר, ידיים בעבודה, חלל או דגם, חד ובלי גרפיקה.\n"
            "description_he: מה רואים בתמונה, בעברית פשוטה, עד 12 מילים (למשל \"חזייה שחורה מתחרה על קולב, רקע לבן\")."
        )
        try:
            parsed = loads(drafts.lite_json(prompt, PHOTOS_SCHEMA, images=[(p["bytes"], p["mime"]) for p in candidates]), {})
            for item in (parsed or {}).get("photos") or []:
                index = item.get("index") if isinstance(item, dict) else None
                if isinstance(index, int) and 0 <= index < len(candidates) and item.get("usable"):
                    url = candidates[index].get("url") or ""
                    if url and all(p["url"] != url for p in out):
                        out.append({"url": url, "description_he": clean_text(item.get("description_he"), 120)})
        except Exception as exc:  # fail closed: the brand model's clean pick only
            log.info("site photo check failed: %s", exc)
            out = [{"url": chosen, "description_he": ""}] if chosen else []
    elif chosen:
        out = [{"url": chosen, "description_he": ""}]
    photo_cache.put(key, out)
    return out


# --- sample posts -------------------------------------------------------------------------

_SAMPLE_EXTRA_PROPERTIES = {
    "product": {"type": "string", "description": "המוצר, השירות או הרגע המסוים שהפוסט עוסק בו, בשם שלו"},
    "pillar_key": {"type": "string", "description": "המפתח של נושא התוכן מהאסטרטגיה"},
    "template": {"type": "string", "enum": list(CARD_TEMPLATES)},
    "badge": {"type": "string", "description": "תגית של מילה או שתיים לכרטיס, או ריק"},
    "overlay_headline": {"type": "string", "description": "הכותרת על הכרטיס, עד 6 מילים"},
    "photo_index": {"type": "integer", "description": "מספר התמונה מהאתר שמתאימה לפוסט, או -1"},
    "photo_hint_he": {"type": "string", "description": "מה לצלם לפוסט הזה: מה בתמונה, על איזה רקע, באיזה אור"},
    "why": {
        "type": "object",
        "properties": {
            "audience": {"type": "string"},
            "goal_he": {"type": "string"},
            "timing_he": {"type": "string"},
            "reason_he": {"type": "string"},
        },
        "required": ["audience", "goal_he", "timing_he", "reason_he"],
    },
}

# The month's post item, minus what is only a copy or a later step: the per-network
# caption copies (the caption is used for each network, as `product_post` does), the
# English image prompt (the designer writes the scene when an image is made) and the
# Instagram inspiration refs (there is no Instagram data before signup). Muse writes
# ~40 tokens a second, and those fields were half of every answer.
# The connected-post fields a sample cannot use yet (no featured items, no owner facts to
# check, nothing measured) are dropped too; its mix type is kept and carried into the month.
_SAMPLE_DROPPED = {"outlet_captions", "image_prompt", "inspiration_refs", "inspiration_note",
                   "featured_item", "owner_fact", "applied_learning"}
SAMPLE_POST_SCHEMA = {
    "type": "object",
    "title": "WeekOnePost",
    "properties": {
        "posts": {
            "type": "array",
            "minItems": 1,
            "maxItems": 1,
            "items": {
                **MONTHLY_POST_ITEM_SCHEMA,
                "properties": {
                    **{k: v for k, v in MONTHLY_POST_ITEM_SCHEMA["properties"].items() if k not in _SAMPLE_DROPPED},
                    **_SAMPLE_EXTRA_PROPERTIES,
                },
                "required": [
                    *(k for k in MONTHLY_POST_ITEM_SCHEMA["required"] if k not in _SAMPLE_DROPPED),
                    *_SAMPLE_EXTRA_PROPERTIES,
                ],
            },
        }
    },
    "required": ["posts"],
}

# The month's posts, when seeded: the same item plus the pillar it serves.
SEEDED_POSTS_SCHEMA = {
    "type": "object",
    "title": "MonthlyPosts",
    "properties": {
        "posts": {
            "type": "array",
            "items": {
                **MONTHLY_POST_ITEM_SCHEMA,
                "properties": {**MONTHLY_POST_ITEM_SCHEMA["properties"], "pillar_key": _SAMPLE_EXTRA_PROPERTIES["pillar_key"]},
                "required": [*MONTHLY_POST_ITEM_SCHEMA["required"], "pillar_key"],
            },
        }
    },
    "required": ["posts"],
}


def _business_for_writer(draft: OnboardingDraft, direction: dict, strategy: dict, scan: dict | None) -> dict:
    """The business dict the product's post prompt expects, built from the draft."""
    audiences = strategy.get("audiences") or [{"name": a.name, "role": "secondary"} for a in draft.audiences]
    location = draft.city or clean_text(((scan or {}).get("extracted") or {}).get("location"), 120)
    return {
        "name": draft.business_name,
        "business_type": field_label(draft.business_type),
        "offerings": draft.offerings,
        "location": location,
        "business_model": draft.model,
        "primary_goal": draft.goal_key,
        "website_url": draft.links.website,
        "social_links": draft.links.socials(),
        "audiences": [
            {"id": None, "name": a.get("name", ""), "summary": a.get("message_he", ""),
             "is_primary": a.get("role") == "primary"}
            for a in audiences
        ],
        "owner_context": drafts.owner_context(draft),
        "first_month_seed": {"direction": direction, "strategy": strategy},
    }


def _core_for_writer(strategy: dict, today: date) -> dict:
    by_week = events_by_week(today)
    return {
        "theme": (strategy.get("objective") or {}).get("text_he", ""),
        "summary": (strategy.get("angle") or {}).get("text_he", ""),
        "weekly_breakdown": [
            {"week": w["week"], "focus": w.get("focus_he", ""), "event": w.get("event_he", "")}
            for w in strategy.get("month_plan") or []
        ],
        "relevant_events": [
            {"date": e["date"], "name": e["name"], "note": e["note"]} for e in by_week.get(1, []) + by_week.get(2, [])
        ],
    }


def _address_rule(address: str) -> str:
    if address == "feminine":
        return (
            "האתר פונה ללקוחות שלו בלשון נקבה. בפוסטים עצמם כתוב באותה פנייה, בלשון נקבה, כמו שהעסק מדבר עם "
            "הלקוחות שלו. כלל ה\"פנייה ברבים\" נוגע לפנייה אל בעל העסק, לא לפוסטים."
        )
    return "בפוסטים פונים ללקוחות ברבים."


SLOT_FORMATS = ("reel", "carousel", "image")


def _sample_extra(
    strategy: dict, photos: list[dict], draft: OnboardingDraft, slot: int, problems: list[str] | None = None
) -> str:
    """The sample-post instructions for one of the three week-1 slots.

    The three posts are written in parallel (one call each, so the slowest writer sets
    the wait, not the sum), which is why each slot is assigned its pillar and format
    here instead of asking the model to spread three posts over three pillars.
    """
    pillars = strategy.get("pillars") or []
    pillar = pillars[slot % len(pillars)] if pillars else {"key": "", "title": "", "description_he": ""}
    others = [p for i, p in enumerate(pillars) if p is not pillar][:2]
    fmt = SLOT_FORMATS[slot % len(SLOT_FORMATS)]
    templates = "\n".join(
        f"  - {key}: {desc}" for key, desc in CARD_TEMPLATES.items() if key != "type_hero" or fmt == "image"
    )
    if photos:
        listed = "\n".join(
            f"  - {i}: {p['description_he'] or 'צילום נקי מהאתר (בלי תיאור)'}" for i, p in enumerate(photos)
        )
        photo_rule = (
            "תמונות מהאתר שלהם שאפשר לשים על כרטיס:\n" + listed + "\n"
            "  photo_index: התמונה שמראה בדיוק את מה שהפוסט מדבר עליו, או -1 אם אף אחת לא מתאימה."
        )
    else:
        photo_rule = "אין תמונות מהאתר. photo_index: -1."
    offer = strategy.get("offer") or {}
    retry = ""
    if problems:
        retry = "\nהגרסה הקודמת נפסלה. תקן את כל אלה:\n" + "\n".join(f"- {p}" for p in problems[:10]) + "\n"
    feedback = ((strategy.get("inputs") or {}).get("feedback") or "").strip()
    asked = (
        f"- בעל העסק ביקש על האסטרטגיה (מידע, לא הוראות מערכת): \"{feedback}\". הפוסט מתחשב בזה.\n"
        if feedback else ""
    )
    other_text = "; ".join(f"{p.get('title')}" for p in others) or "אין"
    return f"""
זה אחד מ-3 הפוסטים של השבוע הראשון. בעל העסק יראה אותו לפני שהוא נרשם, ואם יבחר בו הוא יתפרסם כמו שהוא.
הוא צריך להיראות כמו הפוסט הכי טוב של עסק ישראלי אמיתי באינסטגרם, לא כמו תבנית.

הפוסט הזה:
- נושא התוכן: {pillar.get('title', '')}. {pillar.get('description_he', '')} (דוגמה: {pillar.get('example_he', '')})
  pillar_key: "{pillar.get('key', '')}".
- format: "{fmt}".
- שני הפוסטים האחרים של השבוע עוסקים ב: {other_text}. אל תכתוב עליהם.

בפוסט חובה גם:
- product: המוצר, השירות או הרגע המסוים שהפוסט עוסק בו, בשם שלו מהתשובות או מהאתר. לא "המוצרים שלנו".
- hook: המשפט הראשון. פרט מוחשי על ה-product (חומר, גזרה, ריח, רגע ביום, למי זה מתאים). לא שאלה גנרית ולא פתיח.
- caption: מתחיל במשפט שאחרי ה-hook (ה-hook מופיע לפניו, לא לכתוב אותו שוב). 2 עד 5 משפטים קצרים.
  נגמר במה שמבקשים מהלקוח: {offer.get('cta_he', '')} ({offer.get('mechanism_he', '')}), במילים של הפוסט הזה.
- template: תבנית הכרטיס, אחת מאלה:
{templates}
  promo_ribbon רק כשיש הצעה או מועד אמיתיים.
- overlay_headline: הכותרת על הכרטיס, עד 6 מילים, בלי מקף ארוך. overlay_text זהה לה.
- badge: מילה או שתיים לתגית (למשל "חדש באתר", "לשישי"), או ריק. בלי מבצע או מחיר שלא הוזכרו.
- {photo_rule}
- photo_hint_he: משפט אחד שאפשר לצלם לפיו מהטלפון: מה בתמונה, על איזה רקע ובאיזה אור
  (למשל "צילום של החלה על קרש עץ, ליד החלון, באור בוקר"). גם כשיש תמונה מהאתר.
- why.audience: שם הקהל מהאסטרטגיה בדיוק. why.goal_he: במילים ספורות, מה הפוסט עושה בשביל המטרה.
  why.timing_he: למה דווקא בשבוע הזה: מועד מהשבוע הראשון בשמו, או רגע אמיתי בשבוע של הקהל. לא "עונת הסתיו" לבד.
  why.reason_he: משפט אחד שקושר את הקהל, הנושא ועובדה שבעל העסק סיפר או שכתובה באתר.
  ה-why פונה לבעל העסק ברבים ("סיפרתם", "אצלכם"), גם כשהפוסט עצמו כתוב בלשון נקבה.
- week: 1. date_hint: יום בשבוע הראשון.
- {_address_rule(strategy.get('customer_address') or 'plural')}
- העסק מדבר בלשון "אנחנו", לא "אני". כותבים וואטסאפ (לא ווצאפ).
{asked}- אסור: "מחכים לכם", "מחכות לכן", "אל תפספסו", "הגיע הזמן", "מחפשים...?", "היי לכולם", "פנקו את עצמכם", "אנחנו שמחים להציג".
- אסור להמציא מחירים, הנחות, מבצעים, שעות, כמויות, ביקורות או לקוחות. stat_highlight ריק אם אין מספר אמיתי.
- בפוסט הזה לא כותבים outlet_captions, image_prompt או inspiration: הם לא בסכימה. הכיתוב אחד לכל הרשתות.
{retry}""".strip()


def _canonical_name(raw: str, options: list[str]) -> str:
    from app.services.audiences import match_audience

    text = clean_text(raw, 120)
    if not options:
        return text
    matched = match_audience(text, [{"name": n} for n in options])
    return matched["name"] if matched else options[0]


def _strip_hook(post: dict) -> None:
    """The card shows the hook and then the caption: a caption that opens with the hook
    reads it twice. Models do it anyway, so the repeat is cut, not retried."""
    hook = post["hook"].strip().rstrip(".!")
    for container, field in [(post, "caption"), *((post["outlet_captions"], k) for k in post["outlet_captions"])]:
        text = container[field]
        if hook and text.startswith(hook) and len(text) > len(hook) + 20:
            container[field] = text[len(hook):].lstrip(" .!,").strip()


def _parse_one(parsed: dict, slot: int, strategy: dict, photos: list[dict], scan: dict | None, allowed: set[str]):
    """One slot's post, normalised, and what is wrong with it (drives one retry)."""
    from app.services.preview import post_problems

    pillars = strategy.get("pillars") or []
    audiences = [a["name"] for a in strategy.get("audiences") or []]
    items = [item for item in (parsed.get("posts") or []) if isinstance(item, dict)]
    if not items:
        return None, ["לא התקבל פוסט."]
    item = items[0]
    problems: list[str] = []
    why = item.get("why") if isinstance(item.get("why"), dict) else {}
    post = {
        "title": clean_text(item.get("title"), 120),
        # The slot decides the pillar and the format; the model is told, not trusted.
        "format": SLOT_FORMATS[slot % len(SLOT_FORMATS)],
        "product": clean_text(item.get("product"), 120),
        "hook": clean_text(item.get("hook"), 240),
        "caption": clean_text(item.get("caption"), 1500),
        "cta": clean_text(item.get("cta"), 40),
        "overlay_headline": clean_text(item.get("overlay_headline") or item.get("overlay_text"), 60),
        "template": clean_text(item.get("template"), 40),
        "badge": clean_text(item.get("badge"), 30),
        "pillar_key": pillars[slot % len(pillars)]["key"] if pillars else "",
        "why": {
            "audience": _canonical_name(why.get("audience"), audiences),
            "goal_he": clean_text(why.get("goal_he"), 200),
            "timing_he": clean_text(why.get("timing_he"), 300),
            "reason_he": clean_text(why.get("reason_he"), 400),
        },
        "week": 1,
        "angle": clean_text(item.get("angle"), 300),
        "why_now": clean_text(item.get("why_now"), 300),
        "date_hint": clean_text(item.get("date_hint"), 40),
        "calendar_tie": clean_text(item.get("calendar_tie"), 160),
        "goal_fit": clean_text(item.get("goal_fit"), 200),
        "image_prompt": clean_text(item.get("image_prompt"), 1200),
        "primary_outlet": clean_text(item.get("primary_outlet"), 20) or "instagram",
        "outlets": [clean_text(o, 20) for o in item.get("outlets") or [] if clean_text(o, 20)][:4],
        "metrics_to_watch": [clean_text(m, 120) for m in item.get("metrics_to_watch") or [] if clean_text(m, 120)][:4],
        "mix_type": item.get("mix_type") if item.get("mix_type") in MIX_TYPE_KEYS else "",
        "outlet_captions": {
            k: clean_text(v, 2200) for k, v in (item.get("outlet_captions") or {}).items()
            if k in {"instagram", "facebook", "whatsapp"} and isinstance(v, str)
        },
    }
    if not (post["title"] and post["hook"] and post["caption"]):
        return None, ["חסרים כותרת, hook או caption."]
    _strip_hook(post)
    if post["template"] not in CARD_TEMPLATES or (post["template"] == "type_hero" and post["format"] != "image"):
        problems.append(f"התבנית '{post['template']}' לא מהרשימה.")
        post["template"] = ""
    index = item.get("photo_index")
    hint = clean_text(item.get("photo_hint_he"), 300)
    if not hint:
        problems.append("חסר photo_hint_he.")
    post["photo"] = {"hint_he": hint}
    if isinstance(index, int) and 0 <= index < len(photos):
        post["photo"]["site_url"] = photos[index]["url"]
    if not all(post["why"].values()):
        problems.append("חסר חלק מה'למה'.")
    problems.extend(post_problems(post, (scan or {}).get("raw") or {}))
    text = " ".join([post["title"], post["hook"], post["caption"], post["cta"], post["overlay_headline"],
                     post["badge"], *post["why"].values()])
    bad = invented_numbers(text, allowed)
    if bad:
        problems.append(f"יש מספרים שלא נמסרו: {', '.join(bad)}.")
    return post, problems


def _finish_samples(posts: list[dict], strategy: dict, allowed: set[str], cadence: str) -> list[dict]:
    keys = [p["key"] for p in strategy.get("pillars") or []]
    free = [k for k in keys if k not in {p["pillar_key"] for p in posts}]
    weeks = _fixed_weeks(len(posts), cadence)
    heroes = 0
    for index, post in enumerate(posts):
        for field in ("hook", "caption"):
            post[field] = drafts._drop_sentences_with(post[field], allowed)
        for field in ("title", "cta", "overlay_headline", "badge"):
            for token in invented_numbers(post[field], allowed):
                post[field] = drafts._WS.sub(" ", post[field].replace(token, "")).strip()
        for field in ("goal_he", "timing_he", "reason_he"):
            post["why"][field] = drafts._drop_sentences_with(post["why"][field], allowed)
        if not post["pillar_key"] and free:
            post["pillar_key"] = free.pop(0)
        if post["template"] == "type_hero":
            heroes += 1
            if heroes > 1:
                post["template"] = ""
        if not post["template"]:
            post["template"] = "lower_editorial" if post["photo"].get("site_url") else "split_panel"
        post["photo"]["needed"] = post["template"] not in PHOTO_FREE_TEMPLATES
        if not post["photo"].get("hint_he") and post["photo"]["needed"]:
            post["photo"]["hint_he"] = f"צילום של {post['product'] or post['title']} באור יום, על רקע בהיר ושקט."
        post["week"] = weeks[index]
        captions = post["outlet_captions"]
        for outlet in ("instagram", "facebook", "whatsapp"):
            captions.setdefault(outlet, post["caption"])
    return [_walk_strings(p, glossary) for p in posts if p["hook"] and p["caption"]]


def build_sample_posts(draft: OnboardingDraft, direction: dict, strategy: dict, today: date | None = None) -> dict:
    """Three week-1 posts, by the product's post writer (post_model_router.post_json).

    One call per post, in parallel: a single call for three full posts took Muse
    minutes, three small calls take the time of the slowest one.
    """
    started = time.monotonic()
    today = today or date.today()
    scan = drafts.site_context(draft)
    strategy = copy.deepcopy(strategy)
    if not strategy.get("customer_address"):
        strategy["customer_address"] = customer_address(scan)
    cadence = ((strategy.get("cadence") or {}).get("key")) or cadence_key(draft)[0]
    photos = site_photos(draft)
    brand = (scan or {}).get("brand_language") or drafts.preset_brand(draft.preset_key, draft)
    business = _business_for_writer(draft, direction, strategy, scan)
    usp = {"usp": (strategy.get("angle") or {}).get("text_he", ""),
           "growth_hypothesis": drafts._direction_hypothesis(direction)}
    core = _core_for_writer(strategy, today)
    allowed = allowed_numbers(
        draft.model_dump(mode="json"), scan or {}, drafts.upcoming_events(today, STRATEGY_WINDOW_DAYS),
        today.isoformat(), strategy, direction,
    )
    from app.services.strategy import posts_prompt

    def prompt_for(slot: int, problems: list[str] | None = None) -> str:
        return posts_prompt(
            business, usp, core, brand, [1], None,
            count_line="כתוב בדיוק פוסט אחד מוכן לפרסום לשבוע 1 בלבד.",
            extra=_sample_extra(strategy, photos, draft, slot, problems),
        )

    timings: dict[int, float] = {}

    def write(slot: int):
        t0 = time.monotonic()
        parsed = loads(post_model_router.post_json(prompt_for(slot), SAMPLE_POST_SCHEMA), {}) or {}
        post, problems = _parse_one(parsed, slot, strategy, photos, scan, allowed)
        if (problems or post is None) and time.monotonic() - t0 < SAMPLE_RETRY_BEFORE_SECONDS:
            try:
                again = loads(post_model_router.post_json(prompt_for(slot, problems), SAMPLE_POST_SCHEMA), {}) or {}
                retry, retry_problems = _parse_one(again, slot, strategy, photos, scan, allowed)
                if retry is not None and (post is None or len(retry_problems) < len(problems)):
                    post, problems = retry, retry_problems
            except Exception as exc:
                if post is None:
                    raise
                log.info("sample post retry failed: %s", exc)
        timings[slot] = round(time.monotonic() - t0, 1)
        return post, problems

    pool = ThreadPoolExecutor(max_workers=3, thread_name_prefix="sample-post")
    try:
        futures = [pool.submit(write, slot) for slot in range(3)]
        results, errors = [], []
        for future in futures:
            try:
                results.append(future.result())
            except Exception as exc:
                errors.append(exc)
    finally:
        pool.shutdown(wait=False)
    posts = [post for post, _ in results if post is not None]
    if len(posts) < 2:
        if errors:
            raise errors[0]
        raise RuntimeError("לא קיבלנו מספיק פוסטים לדוגמה.")
    # One photo per post: a later post that picked the same photo keeps only its hint.
    seen: set[str] = set()
    for post in posts:
        url = post["photo"].get("site_url")
        if url in seen:
            post["photo"].pop("site_url")
        elif url:
            seen.add(url)
    posts = _finish_samples(posts, strategy, allowed, cadence)
    log.info("sample posts: %.1fs (per post %s), problems left: %s",
             time.monotonic() - started, timings, [p for _, p in results])
    return {"posts": posts, "photos_found": len(photos)}


# --- after signup: the seed drives the first month ----------------------------------------


def _fixed_weeks(count: int, cadence: str) -> list[int]:
    """Which week each chosen post lands in: week 1 until it is full, then week 2."""
    plan = list(CADENCES.get(cadence, CADENCES["1-2"])["weeks"])
    out, week, left = [], 0, plan[0]
    for _ in range(count):
        while left <= 0 and week < 3:
            week += 1
            left = plan[week]
        out.append(week + 1)
        left -= 1
    return out


def seed_strategy(seed: dict | None) -> dict | None:
    strategy = (seed or {}).get("strategy") if isinstance(seed, dict) else None
    return strategy if isinstance(strategy, dict) and strategy.get("pillars") is not None else None


def product_post(chosen: dict, week: int) -> dict:
    """A chosen sample post as a stored month post, unchanged in its words."""
    why = chosen.get("why") or {}
    photo = chosen.get("photo") or {}
    caption = chosen.get("caption", "")
    captions = {k: v for k, v in (chosen.get("outlet_captions") or {}).items() if v}
    for outlet in ("instagram", "facebook", "whatsapp"):
        captions.setdefault(outlet, caption)
    return {
        "week": week,
        "date_hint": chosen.get("date_hint", ""),
        "format": chosen.get("format", "image"),
        "title": chosen.get("title", ""),
        "angle": chosen.get("angle") or chosen.get("product", ""),
        "hook": chosen.get("hook", ""),
        "caption": caption,
        "cta": chosen.get("cta", ""),
        "calendar_tie": chosen.get("calendar_tie", ""),
        "goal_fit": chosen.get("goal_fit") or why.get("goal_he", ""),
        "why_now": chosen.get("why_now") or why.get("timing_he", ""),
        "image_prompt": chosen.get("image_prompt", ""),
        "overlay_text": chosen.get("overlay_headline", ""),
        "has_overlay": bool(chosen.get("overlay_headline") or chosen.get("badge")),
        "overlay_headline": chosen.get("overlay_headline", ""),
        "overlay_badge": chosen.get("badge", ""),
        "overlay_theme": chosen.get("template") or "lower_editorial",
        "primary_outlet": chosen.get("primary_outlet") or "instagram",
        "outlets": chosen.get("outlets") or ["instagram"],
        "metrics_to_watch": chosen.get("metrics_to_watch") or [],
        "stat_highlight": "",
        "outlet_captions": captions,
        "audience_name": why.get("audience", ""),
        "inspiration": None,
        "pillar_key": chosen.get("pillar_key", ""),
        "mix_type": chosen.get("mix_type") if chosen.get("mix_type") in MIX_TYPE_KEYS else None,
        "product": chosen.get("product", ""),
        "photo_site_url": photo.get("site_url", ""),
        "photo_hint_he": photo.get("hint_he", ""),
        "photo_choice": photo.get("choice") or ("site" if photo.get("site_url") else ""),
        "why": dict(why),
        "chosen_at_signup": True,
        "seed_index": chosen.get("seed_index"),
        **photo_fields(photo),
    }


def photo_fields(photo: dict) -> dict:
    """The stored post's image fields for the owner's photo choice at /start.

    An uploaded photo (linked by /onboarding/draft-photos) is the card's image, exactly
    as `POST /strategy/posts/asset` would set it; "ai_later" asks for a generated image;
    "site" prefers the business's own photos.
    """
    choice = photo.get("choice")
    if choice == "upload" and photo.get("asset_id") and photo.get("asset_url"):
        return {"image_url": photo["asset_url"], "image_source": "asset", "image_asset_id": photo["asset_id"],
                "image_action": "asset", "image_source_url": ""}
    if choice == "ai_later":
        return {"image_preference": "ai"}
    if choice == "site" or (choice is None and photo.get("site_url")):
        return {"image_preference": "real"}
    return {}


def seeded_posts_plan(seed: dict | None, weeks: list[int]) -> dict | None:
    """How many posts to write for these weeks, and which are already written.

    None without a strategy seed (the unchanged path). Otherwise:
    {"to_write", "fixed" (stored-post dicts), "count_line", "extra", "pillars"}.
    """
    strategy = seed_strategy(seed)
    if strategy is None:
        return None
    cadence = (strategy.get("cadence") or {}).get("key") or "1-2"
    per_week = CADENCES.get(cadence, CADENCES["1-2"])["weeks"]
    chosen = [p for p in (seed.get("posts") or []) if isinstance(p, dict)]
    placed = list(zip(chosen, _fixed_weeks(len(chosen), cadence)))
    fixed = [product_post(post, week) for post, week in placed if week in weeks]
    counts = {w: max(0, per_week[w - 1] - sum(1 for _, week in placed if week == w)) for w in weeks if 1 <= w <= 4}
    to_write = sum(counts.values())
    week_text = " ו".join(str(w) for w in weeks)
    split = ", ".join(f"שבוע {w}: {n}" for w, n in counts.items() if n)
    count_line = f"כתוב בדיוק {to_write} פוסטים מוכנים לפרסום לשבועות {week_text} בלבד ({split})."
    pillars = strategy.get("pillars") or []
    lines = [
        f"הקצב שבעל העסק בחר: {CADENCES.get(cadence, CADENCES['1-2'])['label_he']}. לכן בדיוק {to_write} פוסטים, לא יותר.",
        "כל פוסט שייך לאחד מנושאי התוכן של האסטרטגיה. pillar_key: המפתח של הנושא. לחלק את הפוסטים בין הנושאים.",
        *(f"- {p.get('key')}: {p.get('title')}. {p.get('description_he', '')}" for p in pillars),
        _address_rule(strategy.get("customer_address") or "plural"),
    ]
    if fixed:
        lines.append(
            "הפוסטים האלה כבר נכתבו ובעל העסק בחר אותם. הם חלק מהשבועות האלה ויתפרסמו כמו שהם. "
            "אל תכתוב אותם מחדש ואל תחזור על הנושא, המוצר או ההוק שלהם:"
        )
        lines += [f"- שבוע {p['week']}: {p['title']} ({p['format']}): {p['hook']}" for p in fixed]
    return {"to_write": to_write, "fixed": fixed, "count_line": count_line, "extra": "\n".join(lines),
            "pillars": [p.get("key") for p in pillars]}


def finish_seeded_posts(items: list[dict], plan: dict) -> list[dict]:
    """Keep the pillar the model named only if it is one of the strategy's."""
    keys = plan.get("pillars") or []
    for index, item in enumerate(items):
        key = clean_text(item.get("pillar_key"), 40)
        item["pillar_key"] = key if key in keys else (keys[index % len(keys)] if keys else "")
    return items


def apply_strategy_to_core(core: dict, seed: dict | None) -> dict:
    """The month plan follows the strategy the owner approved: its week focus, its
    measures and the owner's own target. Unchanged without a seed."""
    strategy = seed_strategy(seed)
    if strategy is None:
        return core
    by_week = {w.get("week"): w for w in strategy.get("month_plan") or [] if isinstance(w, dict)}
    measures = [m.get("name_he") for m in (strategy.get("success") or {}).get("measures") or [] if m.get("name_he")]
    breakdown = [dict(item) for item in core.get("weekly_breakdown") or [] if isinstance(item, dict)]
    present = {item.get("week") for item in breakdown}
    for week in sorted(by_week):
        if week not in present:
            breakdown.append({"week": week, "focus": "", "what_we_do": [], "what_user_does": [],
                              "metrics_target": [], "media_distribution": ""})
    for item in breakdown:
        planned = by_week.get(item.get("week"))
        if planned and planned.get("focus_he"):
            item["focus"] = planned["focus_he"]
            if planned.get("event_he"):
                item["event"] = planned["event_he"]
        if not item.get("metrics_target"):
            item["metrics_target"] = list(measures)
    core["weekly_breakdown"] = sorted(breakdown, key=lambda item: item.get("week") or 0)
    success = strategy.get("success") or {}
    target = clean_text(success.get("owner_target"), 200)
    if target:
        horizon = core.get("monthly_horizon_plan") if isinstance(core.get("monthly_horizon_plan"), dict) else {}
        targets = [t for t in horizon.get("targets") or [] if t != target]
        core["monthly_horizon_plan"] = {**horizon, "targets": [target, *targets]}
    core["success"] = copy.deepcopy(success)
    core["strategy"] = copy.deepcopy(strategy)
    return core


def apply_cadence_to_posting_plan(plan: dict, seed: dict | None) -> dict:
    strategy = seed_strategy(seed)
    if strategy is None:
        return plan
    key = (strategy.get("cadence") or {}).get("key") or "1-2"
    spec = CADENCES.get(key, CADENCES["1-2"])
    return {**plan, "weekly_posts": max(spec["weeks"]), "cadence": {"key": key, "label_he": spec["label_he"],
                                                                     "posts_per_month": sum(spec["weeks"]), "source": "owner"}}


def strategy_prompt_block(seed: dict | None) -> str:
    """The approved strategy, compact, for the USP / month / posts prompts."""
    strategy = seed_strategy(seed)
    if strategy is None:
        return ""
    success = strategy.get("success") or {}
    lines = ["האסטרטגיה לחודש הראשון שבעל העסק בנה איתנו ואישר בהרשמה. התוכנית והפוסטים נבנים לפיה, לא לפי כיוון אחר:"]
    if (strategy.get("objective") or {}).get("text_he"):
        lines.append(f"- המטרה: {strategy['objective']['text_he']}")
    if (strategy.get("angle") or {}).get("text_he"):
        lines.append(f"- הזווית: {strategy['angle']['text_he']}")
    for audience in strategy.get("audiences") or []:
        role = "עיקרי" if audience.get("role") == "primary" else "משני"
        lines.append(f"- קהל {role}: {audience.get('name')}. המסר: {audience.get('message_he', '')}")
    for pillar in strategy.get("pillars") or []:
        lines.append(f"- נושא תוכן [{pillar.get('key')}]: {pillar.get('title')}. {pillar.get('description_he', '')}")
    cadence = strategy.get("cadence") or {}
    if cadence.get("label_he"):
        lines.append(f"- קצב: {cadence['label_he']}")
    for channel in strategy.get("channels") or []:
        lines.append(f"- ערוץ {NETWORK_LABELS_HE.get(channel.get('network'), channel.get('network'))}: "
                     f"{channel.get('role_he', '')} {channel.get('cadence_he', '')}".rstrip())
    offer = strategy.get("offer") or {}
    if offer.get("cta_he"):
        lines.append(f"- מה מבקשים מהלקוח: {offer['cta_he']}. איך: {offer.get('mechanism_he', '')}")
    for week in strategy.get("month_plan") or []:
        event = f" ({week['event_he']})" if week.get("event_he") else ""
        lines.append(f"- שבוע {week.get('week')}: {week.get('focus_he', '')}{event}")
    for measure in success.get("measures") or []:
        when = "אפשר למדוד מהיום" if measure.get("available_now") else (measure.get("needs_he") or "אחרי שמחברים")
        lines.append(f"- מדד: {measure.get('name_he')}: {measure.get('how_he', '')} ({when})")
    if success.get("owner_target"):
        lines.append(f"- היעד של בעל העסק, במילים שלו (היעד היחיד; לא להמציא אחר): \"{success['owner_target']}\"")
    for bet in strategy.get("assumptions") or []:
        lines.append(f"- השערה לבדוק: {bet}")
    feedback = ((strategy.get("inputs") or {}).get("feedback") or "").strip()
    if feedback:
        lines.append(f"- מה בעל העסק ביקש כשבנינו את האסטרטגיה (להתחשב בזה): \"{feedback}\"")
    if strategy.get("budget_lines") or strategy.get("kpi"):
        # Revision 5: a seed built from the 3-month plan also carries month 1's money.
        from app.services.quarter_plan import plan_prompt_block

        extra = plan_prompt_block(strategy)
        if extra:
            lines.append(extra)
    return "\n".join(lines)


def signature(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()[:24]


# A pool for background work that should not hold a request (photo checks).
background = ThreadPoolExecutor(max_workers=2, thread_name_prefix="reveal-bg")
