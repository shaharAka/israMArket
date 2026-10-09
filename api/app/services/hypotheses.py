"""Hypothesis statuses that move (docs/posts-v2.md, Phase C).

The month is a test. Its hypothesis (`monthly_horizon_plan.hypothesis`), the targets that
say how we will know (`monthly_horizon_plan.targets`) and the 3-month plan's assumptions
(`quarter_plan.assumptions` in the stored profile) each get a status and one evidence line:

* `measuring` — not enough data yet; the line says what is missing.
* `on_track` / `confirmed` — the evidence supports it (so far / for good).
* `not_yet` — the evidence so far is against it.
* `changed` — the plan or the owner changed it since it was last measured.

Rules decide the status and every number, here, deterministically:

* An assumption (and a month hypothesis whose targets give nothing to count) names what
  we do ("רילס", "מחיר", "הזמנות מראש") and what should grow ("שמירות", "לחיצות לוואטסאפ").
  The measured posts of the business are split by that visible trait: the ones that have
  it against the ones that do not (or against the kind it names, "מתמונות מדף"). Each post
  that has it and beat the median of the others is a win. 2+ posts with it and 1+ without
  are needed; a share of 60% or more supports it, 40% or less is against, between is mixed.
* A target with a number is counted where we can see it: WhatsApp taps this month (every
  tracked link), the site's visits and orders and Instagram's reach and followers from the
  latest refresh, the saves of this month's posts. Against the month's pace: reached ->
  confirmed, at least 80% of the pace -> on track, below it -> not yet (in the first week:
  measuring, "מוקדם לדעת"). A count that only stands for the target (taps for orders) is at
  most on track: we never confirm orders we did not see. What we cannot see (sales in the
  shop, a list's size, questions at the counter) stays measuring, and says so.
* The month hypothesis follows its measurable targets.

The cheap model (`gemini-3.5-flash-lite`, `lite_json`) may only re-phrase a line, with the
same guard as the posts' learning lines (services/connected_posts.py): the same numbers,
no cause, one short line; else the plain template stays.

Written by the performance refresh, the weekly job and when a month closes (next-month
generation), stored on the strategy (`hypothesis_review` beside the roadmap), and read
through `review_view` by /strategy and Today.
"""

from __future__ import annotations

import calendar
import logging
import re
from datetime import date, datetime
from statistics import median

from app.services import connected_posts as cp
from app.services.gemini import lite_json
from app.services.jsonutil import dumps, loads
from app.services.schemas_llm import HYPOTHESIS_LINES_SCHEMA

log = logging.getLogger(__name__)

STATUSES = ("measuring", "on_track", "confirmed", "not_yet", "changed")
DECIDED = frozenset({"on_track", "confirmed", "not_yet"})
REVIEW_KEY = "hypothesis_review"

# The word next to the dot. A hypothesis (השערה) is feminine, a target (יעד) masculine.
# "בבדיקה" while measuring fits both, and never reads as the post state "נמדד" (measured).
STATUS_HE = {
    "hypothesis": {"measuring": "בבדיקה", "on_track": "בדרך", "confirmed": "התאמתה", "not_yet": "בינתיים לא",
                   "changed": "השתנתה"},
    "target": {"measuring": "בבדיקה", "on_track": "בדרך", "confirmed": "הושג", "not_yet": "מתחת לקצב",
               "changed": "השתנה"},
}
CLOSED_NOT_YET_HE = {"hypothesis": "לא התאמתה", "target": "לא הושג"}

PENDING_HE = "נמדוד אחרי עדכון הנתונים הבא."
UNSEEN_HE = "את זה אנחנו לא רואים במספרים. נשאל אתכם בסיכום החודש."
CHANGED_HE = {"hypothesis": "ההשערה השתנתה, אז מתחילים למדוד אותה מחדש.",
              "target": "היעד השתנה, אז מתחילים למדוד אותו מחדש."}

_WS = re.compile(r"\s+")


def _clean(value, limit: int = 300) -> str:
    return _WS.sub(" ", str(value or "")).strip()[:limit] if isinstance(value, (str, int, float)) else ""


def _now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds")


def _grammar(kind: str) -> str:
    return "target" if kind == "target" else "hypothesis"


def status_he(kind: str, status: str, closed: bool = False) -> str:
    grammar = _grammar(kind)
    if status == "not_yet" and closed:
        return CLOSED_NOT_YET_HE[grammar]
    return STATUS_HE[grammar].get(status, STATUS_HE[grammar]["measuring"])


# --- reading a hypothesis --------------------------------------------------------------------

# What we do: a visible trait of a post (connected_posts.traits keys). First match wins, so
# the more specific come first ("רילס מהתנור" is about reels).
TRAITS: list[dict] = [
    {"key": "price", "pattern": r"מחיר|₪|שקל", "has": {"price_on_image", "price_in_text"},
     "plural": "פוסטים עם מחיר", "one": "פוסט אחד עם מחיר", "a": "פוסט עם מחיר", "others": "הפוסטים בלי מחיר",
     "other_a": "פוסט בלי מחיר"},
    {"key": "reel", "pattern": r"ריל|סרטון|וידאו", "has": {"format:reel"},
     "plural": "רילס", "one": "ריל אחד", "a": "ריל"},
    {"key": "carousel", "pattern": r"קרוסל", "has": {"format:carousel"},
     "plural": "קרוסלות", "one": "קרוסלה אחת", "a": "קרוסלה", "fem": True},
    {"key": "story", "pattern": r"סטורי", "has": {"format:story"},
     "plural": "סטוריז", "one": "סטורי אחד", "a": "סטורי"},
    {"key": "question", "pattern": r"שאל(?:ה|ות)\s+(?:ל|את|ב)|עם שאלה|בשאלה|שואלים את", "has": {"question_hook"},
     "plural": "פוסטים עם שאלה", "one": "פוסט אחד עם שאלה", "a": "פוסט עם שאלה", "others": "הפוסטים בלי שאלה",
     "other_a": "פוסט בלי שאלה"},
    {"key": "offer", "pattern": r"מבצע|הנחה|הטבה|הזמנ(?:ה|ות)\s+מראש|מארז", "has": {"mix:offer"},
     "plural": "פוסטים של הזמנה מראש ומבצע", "one": "פוסט אחד של הזמנה מראש", "a": "פוסט של הזמנה מראש"},
    {"key": "seasonal", "pattern": r"חג(?![א-ת])|חגים|ראש השנה|סוכות|חנוכה|פסח|פורים|עונ", "has": {"mix:seasonal"},
     "plural": "פוסטים לחג", "one": "פוסט אחד לחג", "a": "פוסט לחג"},
    {"key": "behind_scenes", "pattern": r"מאחורי הקלעים|מהתנור|מהמטבח|תהליך|משמרת|איך מכינים", "has": {"mix:behind_scenes"},
     "plural": "פוסטים מאחורי הקלעים", "one": "פוסט אחד מאחורי הקלעים", "a": "פוסט מאחורי הקלעים"},
    {"key": "social_proof", "pattern": r"ביקור(?:ת|ות)|המלצ|לקוחות מספרים", "has": {"mix:social_proof"},
     "plural": "פוסטים עם המלצה", "one": "פוסט אחד עם המלצה", "a": "פוסט עם המלצה"},
    {"key": "value", "pattern": r"טיפ|מתכון|מדריך|מלמד", "has": {"mix:value"},
     "plural": "פוסטים עם טיפ", "one": "פוסט אחד עם טיפ", "a": "פוסט עם טיפ"},
    {"key": "image", "pattern": r"תמונ", "has": {"format:image"},
     "plural": "פוסטים של תמונה", "one": "פוסט תמונה אחד", "a": "פוסט של תמונה"},
    {"key": "product", "pattern": r"מוצר", "has": {"mix:product"},
     "plural": "פוסטים של מוצר", "one": "פוסט מוצר אחד", "a": "פוסט של מוצר"},
    {"key": "community", "pattern": r"קהילה|שכונ", "has": {"mix:community"},
     "plural": "פוסטים לקהילה", "one": "פוסט קהילה אחד", "a": "פוסט לקהילה"},
    {"key": "whatsapp", "pattern": r"וואטסאפ|ווטסאפ|וואצאפ", "has": {"whatsapp_cta"},
     "plural": "פוסטים עם הזמנה לוואטסאפ", "one": "פוסט אחד עם הזמנה לוואטסאפ", "a": "פוסט עם הזמנה לוואטסאפ",
     "others": "הפוסטים בלי וואטסאפ", "other_a": "פוסט בלי וואטסאפ"},
]
_TRAIT = {trait["key"]: trait for trait in TRAITS}

# What should grow, read from the part after the verb. Orders on the site before visits.
PER_POST_METRICS: list[tuple[str, str]] = [
    ("conversions", r"(?:הזמנות|רכישות|קניות)\s+(?:ב|מה)אתר"),
    ("whatsapp_clicks", r"וואטסאפ|ווטסאפ|פניות|פנייה"),
    ("saves", r"שמיר|שומרים|שיתופ"),
    ("site_visits", r"כניסות|ביקורים|מבקרים|לאתר|באתר"),
    ("reach", r"חשיפ|ראו|צפיות|יותר אנשים|עוקבים"),
]
RESULT_KEY = {**cp.RESULT_KEY, "conversions": "conversions"}
# "3 מתוך 4 פוסטים עם מחיר הביאו יותר לחיצות לוואטסאפ": the verb (plural, m., f.) and object.
VERB = {
    "whatsapp_clicks": ("הביאו", "הביא", "הביאה", "יותר לחיצות לוואטסאפ"),
    "site_visits": ("הביאו", "הביא", "הביאה", "יותר כניסות לאתר"),
    "conversions": ("הביאו", "הביא", "הביאה", "יותר הזמנות באתר"),
    "saves": ("נשמרו", "נשמר", "נשמרה", "יותר"),
    "reach": ("הגיעו", "הגיע", "הגיעה", "ליותר אנשים"),
}

_LEAD = re.compile(r"^(?:אנחנו\s+)?(?:מניחים|מהמרים|משערים)\s+ש")
_VERB = re.compile(r"\s(?:יביאו?|תביא|יגדילו?|תגדיל|ימשכו|ימשוך|ייצרו?|יעלו?|יובילו?|יגרמו|יגרום|ישיגו?|יניבו?)(?=[\s,.]|$)")
_NOT_AGAINST = ("מראש", "מוקדם", "מאוד", "מהר", "מחר", "מיד", "מעט", "מספיק", "מלא", "מחדש")


def split(text: str) -> tuple[str, str]:
    """(what we do, what should happen) of one hypothesis sentence."""
    text = _LEAD.sub("", _clean(text))
    if text.startswith("אם ") and "," in text:
        first, rest = text[3:].split(",", 1)
        return first.strip(), rest.strip()
    match = _VERB.search(text)
    if match:
        return text[: match.start()].strip(), text[match.start():].strip()
    return text, text


def _trait_in(text: str, skip: str | None = None) -> str | None:
    for trait in TRAITS:
        if trait["key"] != skip and re.search(trait["pattern"], text):
            return trait["key"]
    return None


def _metric_in(text: str) -> str | None:
    for metric, pattern in PER_POST_METRICS:
        if re.search(pattern, text):
            return metric
    return None


def _against_in(outcome: str, trait: str | None) -> str | None:
    """The kind it is compared with: "יותר שמירות מתמונות מדף" -> image."""
    after = outcome.split("יותר", 1)[1] if "יותר" in outcome else ""
    words = after.split()
    for index, word in enumerate(words):
        if word.startswith("מאשר"):
            rest = " ".join(words[index + 1: index + 5])
        elif word.startswith("מ") and len(word) > 3 and not word.startswith(_NOT_AGAINST):
            rest = " ".join([word[1:].lstrip("-־"), *words[index + 1: index + 4]])
        else:
            continue
        found = _trait_in(rest, skip=trait)
        if found:
            return found
    return None


def parse(text: str) -> dict:
    """{trait, metric, against} of a hypothesis; any of them None when it does not say."""
    action, outcome = split(text)
    trait = _trait_in(action)
    return {"trait": trait, "metric": _metric_in(outcome), "against": _against_in(outcome, trait)}


# --- the evidence ------------------------------------------------------------------------------


class Evidence:
    """Everything the rules read, loaded once per evaluation."""

    def __init__(self, db, business, strategy, *, today: date | None = None):
        self.today = today or date.today()
        self.year, self.month = int(strategy.year), int(strategy.month)
        self.days = calendar.monthrange(self.year, self.month)[1]
        start = date(self.year, self.month, 1)
        end = date(self.year, self.month, self.days)
        if self.today < start:
            self.elapsed_days = 0
        elif self.today > end:
            self.elapsed_days = self.days
        else:
            self.elapsed_days = self.today.day
        self.elapsed = self.elapsed_days / self.days
        website = getattr(business, "website_url", "") or ""
        records = cp._records(cp._strategies(db, business.id), website)
        # Only published posts are evidence: taps on a post not out yet do not count (#123).
        self.records = [
            record for record in records
            if isinstance(record["view"].get("results"), dict) and cp._is_published(record["view"])
        ]
        self.month_records = [r for r in records if int(r["year"]) == self.year and int(r["month"]) == self.month]
        self.published_this_month = any(cp._is_published(r["view"]) for r in self.month_records)
        connected = {i.provider for i in getattr(business, "integrations", []) or [] if i.status == "connected"}
        self.ga4_connected = "ga4" in connected
        self.meta_connected = "meta" in connected
        self._load_snapshot(db, business)
        self._load_whatsapp(db, business)

    def _load_snapshot(self, db, business) -> None:
        from app.models import PerformanceSnapshot
        from app.services.meta import account_digest

        snap = (
            db.query(PerformanceSnapshot)
            .filter(PerformanceSnapshot.business_id == business.id)
            .order_by(PerformanceSnapshot.created_at.desc(), PerformanceSnapshot.id.desc())
            .first()
        )
        ga4 = loads(snap.ga4_json, {}) if snap else {}
        meta = loads(snap.meta_json, {}) if snap else {}
        overview = (ga4 or {}).get("overview") if isinstance((ga4 or {}).get("overview"), dict) else {}
        self.sessions = cp._number(overview.get("sessions"))
        self.conversions = cp._number(overview.get("conversions"))
        digest = account_digest((meta or {}).get("account")) or {}
        self.followers = cp._number(digest.get("followers_count"))
        self.reach = cp._number((digest.get("values") or {}).get("reach"))
        self.reach_before = cp._number((digest.get("previous") or {}).get("reach"))

    def _load_whatsapp(self, db, business) -> None:
        from sqlalchemy import func

        from app.models import WhatsappClick, WhatsappLink

        self.has_whatsapp = db.query(WhatsappLink.id).filter(WhatsappLink.business_id == business.id).first() is not None

        def clicks(year: int, month: int, last_day: int) -> int:
            first, last = f"{year:04d}-{month:02d}-01", f"{year:04d}-{month:02d}-{last_day:02d}"
            total = (
                db.query(func.coalesce(func.sum(WhatsappClick.count), 0))
                .filter(WhatsappClick.business_id == business.id, WhatsappClick.day >= first, WhatsappClick.day <= last)
                .scalar()
            )
            return int(total or 0)

        self.whatsapp_month = clicks(self.year, self.month, self.days) if self.has_whatsapp else None
        prev_year, prev_month = (self.year - 1, 12) if self.month == 1 else (self.year, self.month - 1)
        prev_days = calendar.monthrange(prev_year, prev_month)[1]
        same_days = min(max(self.elapsed_days, 1), prev_days)
        self.whatsapp_before = clicks(prev_year, prev_month, same_days) if self.has_whatsapp else None
        self.whatsapp_so_far = (
            clicks(self.year, self.month, max(self.elapsed_days, 1)) if self.has_whatsapp else None
        )

    def month_saves(self) -> int | None:
        values = [cp._number((r["view"].get("results") or {}).get("saves")) for r in self.month_records]
        values = [value for value in values if value is not None]
        return sum(values) if values else None


def _value(view: dict, metric: str) -> int | None:
    return cp._number((view.get("results") or {}).get(RESULT_KEY[metric]))


def _has(view: dict, trait: str) -> bool:
    return bool({key for key, _ in cp.traits(view)} & _TRAIT[trait]["has"])


def _count_he(metric: str, value: int) -> str:
    if metric in cp.METRIC_LABEL_HE:
        return cp.count_he(metric, value)
    if metric == "conversions":
        return "הזמנה אחת באתר" if int(value) == 1 else f"{int(value):,} הזמנות באתר"
    return "עוקב אחד" if int(value) == 1 else f"{int(value):,} עוקבים"


# --- the rules ------------------------------------------------------------------------------


def compare(evidence: Evidence, parsed: dict, closed: bool = False) -> dict:
    """The trait rule. {status, template, facts}."""
    trait_key, against_key = parsed.get("trait"), parsed.get("against")
    if not trait_key:
        return {"status": "measuring", "template": UNSEEN_HE, "facts": {"rule": "unseen"}}
    trait = _TRAIT[trait_key]
    metric = parsed.get("metric")
    if metric is None:
        # Not named: the measure most of the posts with the trait were counted by.
        counted = [r["view"]["results"].get("metric") for r in evidence.records if _has(r["view"], trait_key)]
        counted = [m for m in counted if m in RESULT_KEY]
        metric = max(set(counted), key=counted.count) if counted else None
    facts = {"rule": "compare", "trait": trait_key, "against": against_key, "metric": metric}
    pool = []
    if metric:
        pool = [(r, _value(r["view"], metric)) for r in evidence.records]
        pool = [(r, v) for r, v in pool if v is not None]
    with_values = [v for r, v in pool if _has(r["view"], trait_key)]
    if against_key:
        others = [v for r, v in pool if _has(r["view"], against_key) and not _has(r["view"], trait_key)]
        other_a = _TRAIT[against_key]["a"]
        than = "מה" + _TRAIT[against_key]["plural"]
    else:
        others = [v for r, v in pool if not _has(r["view"], trait_key)]
        other_a = trait.get("other_a", "פוסט מסוג אחר")
        than = "מ" + trait.get("others", "הפוסטים האחרים")
    facts.update({"with": len(with_values), "others": len(others)})
    if not with_values:
        return {"status": "measuring", "template": f"עוד אין תוצאות ל{trait['plural']}.", "facts": facts}
    if len(with_values) == 1:
        return {"status": "measuring", "template": f"עד עכשיו יש תוצאה רק ל{trait['one']}. צריך לפחות 2 כדי להשוות.",
                "facts": facts}
    if not others:
        return {"status": "measuring", "template": f"צריך גם {other_a} עם תוצאה, כדי להשוות.", "facts": facts}
    baseline = median(others)
    wins = sum(1 for value in with_values if value > baseline)
    n = len(with_values)
    share = wins / n
    facts.update({"wins": wins, "baseline": baseline})
    plural_verb, verb_m, verb_f, obj = VERB[metric]
    fem = bool(trait.get("fem"))
    if wins == 0:
        line = f"{'אף אחת' if fem else 'אף אחד'} מ-{n} ה{trait['plural']} לא {verb_f if fem else verb_m} {obj} {than}."
    elif wins == 1:
        line = f"רק 1 מתוך {n} {trait['plural']} {verb_f if fem else verb_m} {obj} {than}."
    else:
        line = f"{wins} מתוך {n} {trait['plural']} {plural_verb} {obj} {than}."
    if share >= 0.6:
        strong = n >= 4 and share >= 0.75
        status = "confirmed" if (closed or strong) else "on_track"
    elif share <= 0.4:
        status = "not_yet"
    else:
        status = "measuring"
        line = f"התוצאות עוד מעורבות: {line}"
    return {"status": status, "template": line, "facts": facts}


_NUMBER = re.compile(r"\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?")
_UNSEEN = re.compile(r"רשימ|נמכר|מכירות|בחנות|בקופה|שאלות|תורים|תור(?![א-ת])|נזרק|זורקים|מלאי|ממוצע|הכנסות|רווח|מועדון|מנויים")
_SITE_ORDERS = re.compile(r"(?:הזמנות|רכישות|מכירות|קניות)\s+(?:ב|מה)אתר|(?:הזמנות|רכישות)\s+אונליין")
_PROXY_NOUN = re.compile(r"הזמנ|מכיר|קני|רכיש|לקוח")
_LESS = re.compile(r"(?<![א-ת])פחות(?![א-ת])")
TARGET_SOURCES: list[tuple[str, str]] = [
    ("whatsapp_clicks", r"וואטסאפ|ווטסאפ|וואצאפ|פניות|פנייה"),
    ("followers", r"עוקבים"),
    ("reach", r"חשיפ|אנשים שראו|ראו את|צפיות"),
    ("saves", r"שמירות|שמירה"),
    ("site_visits", r"כניסות|ביקורים|מבקרים|לאתר|באתר"),
]
# Counted over the whole month (against its pace) or a level from the latest refresh.
CUMULATIVE = frozenset({"whatsapp_clicks", "saves"})


def target_source(text: str) -> str | None:
    if _SITE_ORDERS.search(text):
        return "conversions"
    if _UNSEEN.search(text):
        return None
    for source, pattern in TARGET_SOURCES:
        if re.search(pattern, text):
            return source
    return None


def _target_number(text: str) -> tuple[int | None, bool]:
    match = _NUMBER.search(text)
    if not match:
        return None, False
    number = int(float(match.group(0).replace(",", "")))
    percent = text[match.end(): match.end() + 2].strip().startswith("%")
    return number, percent


def _missing_source(evidence: Evidence, source: str) -> str:
    if source == "whatsapp_clicks":
        return "צריך את קישור הוואטסאפ שלנו כדי לספור פניות. מכינים אותו בעמוד החיבורים."
    if source in ("site_visits", "conversions"):
        return PENDING_HE if evidence.ga4_connected else "צריך לחבר את נתוני האתר כדי למדוד את זה."
    if source in ("reach", "followers"):
        return PENDING_HE if evidence.meta_connected else "צריך לחבר את האינסטגרם כדי למדוד את זה."
    return "עוד אין שמירות שנמדדו לפוסטים של החודש."


def target(evidence: Evidence, text: str, closed: bool = False) -> dict:
    """The number rule for one target. {status, template, facts}."""
    source = target_source(text)
    number, percent = _target_number(text)
    facts = {"rule": "target", "source": source, "number": number, "percent": percent}
    if source is None:
        return {"status": "measuring", "template": UNSEEN_HE, "facts": facts}
    less = bool(_LESS.search(text))  # "70% פחות שאלות"; "לפחות 120" is at least
    proxy = source in ("whatsapp_clicks", "site_visits") and bool(_PROXY_NOUN.search(text))
    facts["proxy"] = proxy
    if percent or number is None:
        return _change_target(evidence, source, number, less, closed, facts)
    value = {
        "whatsapp_clicks": evidence.whatsapp_month,
        "saves": evidence.month_saves(),
        "site_visits": evidence.sessions,
        "conversions": evidence.conversions,
        "reach": evidence.reach,
        "followers": evidence.followers,
    }[source]
    if value is None:
        return {"status": "measuring", "template": _missing_source(evidence, source), "facts": facts}
    if source == "whatsapp_clicks" and value == 0 and not evidence.published_this_month:
        return {"status": "measuring", "template": "עוד לא פורסם פוסט החודש, אז עוד אין פניות לספור.", "facts": facts}
    facts["value"] = value
    count = _count_he(source, value)
    if source in CUMULATIVE:
        line = f"{count} החודש, מול יעד של {number:,}."
    elif source == "followers":
        line = f"{count}, מול יעד של {number:,}."
    else:
        line = f"{count} ב-28 הימים האחרונים, מול יעד של {number:,}."
    reached = value <= number if less else value >= number
    if reached:
        return {"status": "on_track" if proxy else "confirmed", "template": line, "facts": facts}
    if closed:
        return {"status": "not_yet", "template": line, "facts": facts}
    if evidence.elapsed < 0.25:
        return {"status": "measuring", "template": f"מוקדם לדעת: {line}", "facts": facts}
    pace = number * (evidence.elapsed if source in CUMULATIVE else 1.0)
    on_pace = not less and value >= 0.8 * pace
    return {"status": "on_track" if on_pace else "not_yet", "template": line, "facts": facts}


def _change_target(evidence: Evidence, source: str, number: int | None, less: bool, closed: bool, facts: dict) -> dict:
    """"25% יותר פניות": this month so far against the same days of the month before."""
    if source == "whatsapp_clicks":
        now, before, when = evidence.whatsapp_so_far, evidence.whatsapp_before, "מאשר באותם ימים בחודש הקודם"
    elif source == "reach":
        now, before, when = evidence.reach, evidence.reach_before, "מאשר ב-28 הימים שלפני"
    else:
        return {"status": "measuring", "template": "אין לנו עוד נקודת השוואה ליעד הזה.", "facts": facts}
    if now is None:
        return {"status": "measuring", "template": _missing_source(evidence, source), "facts": facts}
    if not before:
        return {"status": "measuring", "template": "אין לנו עוד נקודת השוואה ליעד הזה.", "facts": facts}
    change = round((now - before) / before * 100)
    facts.update({"value": now, "before": before, "change": change})
    noun = {"whatsapp_clicks": "פניות בוואטסאפ", "reach": "אנשים שראו"}[source]
    word = "יותר" if change >= 0 else "פחות"
    line = f"{abs(change)}% {word} {noun} {when}"
    line += f", מול יעד של {number}%." if number is not None else "."
    if number is None:  # "יותר פניות": any rise is the target
        good = change < 0 if less else change > 0
    else:
        good = -change >= number if less else change >= number
    if good:
        status = "confirmed" if closed else "on_track"
    elif closed or evidence.elapsed >= 0.25:
        status = "not_yet"
    else:
        status = "measuring"
        line = f"מוקדם לדעת: {line}"
    return {"status": status, "template": line, "facts": facts}


def month_hypothesis(evidence: Evidence, text: str, target_results: list[dict], closed: bool = False) -> dict:
    """The month's hypothesis follows its measurable targets; else the trait rule."""
    measurable = [result for result in target_results if result["status"] in DECIDED]
    if len(measurable) == 1:
        only = measurable[0]
        status = only["status"]
        return {"status": status, "template": only["template"], "facts": {"rule": "targets", "from": [only["facts"]]}}
    if measurable:
        good = sum(1 for result in measurable if result["status"] in ("on_track", "confirmed"))
        bad = len(measurable) - good
        m = len(measurable)
        facts = {"rule": "targets", "good": good, "bad": bad, "m": m}
        if good > bad:
            if all(result["status"] == "confirmed" for result in measurable):
                return {"status": "confirmed", "template": f"כל {m} היעדים שמודדים הושגו.", "facts": facts}
            return {"status": "on_track", "template": f"{good} מתוך {m} היעדים שמודדים בדרך.", "facts": facts}
        if bad > good:
            word = "לא הושגו" if closed else "מתחת לקצב"
            return {"status": "not_yet", "template": f"{bad} מתוך {m} היעדים שמודדים {word}.", "facts": facts}
        return {"status": "measuring", "template": f"התוצאות עוד מעורבות: {good} מתוך {m} היעדים בדרך.", "facts": facts}
    parsed = parse(text)
    if parsed["trait"] and not (parsed["trait"] == "whatsapp" and parsed["metric"] in (None, "whatsapp_clicks")):
        result = compare(evidence, parsed, closed)
        if result["status"] in DECIDED:
            return result
        if not target_results:
            return result
    if target_results:
        first = target_results[0]
        return {"status": "measuring", "template": first["template"], "facts": {"rule": "targets", "from": [first["facts"]]}}
    return {"status": "measuring", "template": UNSEEN_HE, "facts": {"rule": "unseen"}}


# --- what the plan says now ------------------------------------------------------------------


def current_items(core: dict | None, quarter_plan: dict | None) -> list[dict]:
    """[{key, kind, text_he, if_wrong_he}] for this month: its hypothesis, its targets, and
    the 3-month plan's assumptions (keyed by their index in the stored list)."""
    core = core if isinstance(core, dict) else {}
    monthly = core.get("monthly_horizon_plan") if isinstance(core.get("monthly_horizon_plan"), dict) else {}
    items = []
    hypothesis = _clean(monthly.get("hypothesis"), 400)
    if hypothesis:
        items.append({"key": "month", "kind": "month", "text_he": hypothesis, "if_wrong_he": ""})
    for index, text in enumerate(monthly.get("targets") or []):
        text = _clean(text, 200)
        if text:
            items.append({"key": f"target:{index}", "kind": "target", "text_he": text, "if_wrong_he": ""})
    raw = (quarter_plan or {}).get("assumptions") if isinstance(quarter_plan, dict) else None
    for index, item in enumerate(raw if isinstance(raw, list) else []):
        if not isinstance(item, dict):
            continue
        text = _clean(item.get("bet_he"), 300)
        if text:
            items.append({"key": f"assumption:{index}", "kind": "assumption", "text_he": text,
                          "if_wrong_he": _clean(item.get("if_wrong_he"), 300)})
    return items


def stored_review(strategy) -> dict:
    extra = loads(getattr(strategy, "roadmap_json", "") or "", {}) or {}
    review = extra.get(REVIEW_KEY) if isinstance(extra, dict) else None
    return review if isinstance(review, dict) else {}


def _legacy(stored_profile: dict | None) -> dict:
    """`hypothesis_status` in the stored profile ({index: "confirmed"|"not_confirmed"}),
    the monthly review's old way of setting an assumption by hand."""
    raw = (stored_profile or {}).get("hypothesis_status") if isinstance(stored_profile, dict) else None
    mapping = {"confirmed": "confirmed", "not_confirmed": "not_yet"}
    return {f"assumption:{k}": mapping[v] for k, v in (raw or {}).items() if v in mapping} if isinstance(raw, dict) else {}


def review_view(review: dict | None, core: dict | None, quarter_plan: dict | None,
                stored_profile: dict | None = None) -> dict:
    """What /strategy and Today show: today's plan, with each item's stored status when it
    is still the same text, `changed` when the text moved since, else measuring."""
    review = review if isinstance(review, dict) else {}
    closed = bool(review.get("closed"))
    stored = {item.get("key"): item for item in review.get("items") or [] if isinstance(item, dict)}
    legacy = _legacy(stored_profile)
    items = []
    for item in current_items(core, quarter_plan):
        previous = stored.get(item["key"])
        grammar = _grammar(item["kind"])
        if previous and _clean(previous.get("text_he"), 400) == item["text_he"]:
            status = previous.get("status") if previous.get("status") in STATUSES else "measuring"
            evidence = _clean(previous.get("evidence_he"), 240)
        elif previous:
            status, evidence = "changed", CHANGED_HE[grammar]
        elif item["key"] in legacy:
            status, evidence = legacy[item["key"]], ""
        else:
            status, evidence = "measuring", PENDING_HE
        items.append({**item, "status": status, "status_he": status_he(item["kind"], status, closed),
                      "evidence_he": evidence})
    return {"updated_at": review.get("updated_at") or None, "closed": closed, "items": items}


# --- the writer -------------------------------------------------------------------------------


def evaluate(evidence: Evidence, items: list[dict], *, closed: bool = False) -> list[dict]:
    """Status + template + facts for each current item (no phrasing, no storage)."""
    results: dict[str, dict] = {}
    targets = [item for item in items if item["kind"] == "target"]
    for item in targets:
        results[item["key"]] = target(evidence, item["text_he"], closed)
    for item in items:
        if item["kind"] == "assumption":
            results[item["key"]] = compare(evidence, parse(item["text_he"]), closed)
        elif item["kind"] == "month":
            results[item["key"]] = month_hypothesis(evidence, item["text_he"], [results[t["key"]] for t in targets],
                                                    closed)
    return [{**item, **results[item["key"]]} for item in items]


_CAUSE_WORDS = cp._CAUSE_WORDS
_DIGITS = re.compile(r"\d+(?:[.,]\d+)?")
_NEGATION = re.compile(r"(?<![א-ת])(?:לא|אף|פחות|מתחת)(?![א-ת])")


def _numbers(text: str) -> list[str]:
    return sorted(token.replace(",", "") for token in _DIGITS.findall(text or ""))


def acceptable(text: str, template: str) -> bool:
    """A phrased line keeps the facts: exactly the template's numbers, no cause, no added
    or dropped negation, one short line."""
    text = _clean(text, 400)
    if not text or len(text) > 170 or "\n" in text or _CAUSE_WORDS.search(text):
        return False
    if _numbers(text) != _numbers(template):
        return False
    return bool(_NEGATION.search(text)) == bool(_NEGATION.search(template))


def phrase(batch: list[dict]) -> dict[str, str]:
    """{key: line}: the cheap model re-phrases, the server checks; the template otherwise."""
    lines = {item["key"]: item["template"] for item in batch}
    if not batch:
        return lines
    listed = "\n".join(
        f"- {item['key']}: מצב: {status_he(item['kind'], item['status'])} | משפט בסיס: {item['template']}" for item in batch
    )
    prompt = f"""
נסח מחדש לכל שורה משפט ראיה אחד קצר לבעל עסק קטן, בעברית ישראלית מדוברת, עד 18 מילים.
המשפט אומר מה המספרים מראים על ההשערה או היעד. השתמש רק במספרים שבמשפט הבסיס, כולם, בלי מספר חדש.
אל תוסיף סיבה, הסבר, עצה או הבטחה. אל תכתוב "בגלל", "כי" או "בזכות". אל תהפוך את הכיוון.
אם אין לך ניסוח טוב יותר, החזר את משפט הבסיס כמו שהוא. לכל שורה החזר ref ו-text.

{listed}
"""
    try:
        parsed = loads(lite_json(prompt, HYPOTHESIS_LINES_SCHEMA, thinking_level="LOW"), {}) or {}
    except Exception as exc:  # the plain sentence is always there
        log.info("hypothesis lines: cheap model unavailable (%s)", type(exc).__name__)
        return lines
    by_key = {item["key"]: item for item in batch}
    for answer in parsed.get("lines") or []:
        if not isinstance(answer, dict):
            continue
        key = str(answer.get("ref") or "")
        if key in by_key and acceptable(answer.get("text"), by_key[key]["template"]):
            lines[key] = _clean(answer.get("text"), 170)
    return lines


def _previous_review(db, business, strategy) -> dict:
    """This month's stored review; for a month that has none yet, the month before's
    assumptions (they belong to the 3-month plan, so their history carries over)."""
    own = stored_review(strategy)
    if own:
        return own
    from app.models import Strategy

    earlier = (
        db.query(Strategy)
        .filter(Strategy.business_id == business.id)
        .filter((Strategy.year < strategy.year) | ((Strategy.year == strategy.year) & (Strategy.month < strategy.month)))
        .order_by(Strategy.year.desc(), Strategy.month.desc())
        .first()
    )
    review = stored_review(earlier) if earlier is not None else {}
    items = [item for item in review.get("items") or [] if isinstance(item, dict) and item.get("kind") == "assumption"]
    return {"items": items} if items else {}


def _is_closed(db, business, strategy, today: date) -> bool:
    """The month is over, or the next month exists: its verdict is final."""
    from app.models import Strategy

    if (today.year, today.month) > (int(strategy.year), int(strategy.month)):
        return True
    year, month = (strategy.year + 1, 1) if strategy.month == 12 else (strategy.year, strategy.month + 1)
    return db.query(Strategy.id).filter(Strategy.business_id == business.id, Strategy.year == year,
                                        Strategy.month == month).first() is not None


def refresh_strategy(db, business, strategy, *, closing: bool | None = None, today: date | None = None,
                     now: str | None = None) -> dict:
    """Evaluate, phrase what changed and store the review on `strategy`. The caller commits.

    `closing=True` is the month's last word (next-month generation); None decides it: the
    month is over, the next one exists, or it was closed before.
    """
    today = today or date.today()
    now = now or _now()
    from app.services.strategy_writes import lock_and_refresh
    lock_and_refresh(db, strategy)
    extra = loads(strategy.roadmap_json or "", {}) or {}
    roadmap = extra.get("roadmap") if isinstance(extra.get("roadmap"), dict) else {}
    core = cp.strategy_core(roadmap)
    stored_profile = loads(business.scraped_profile_json or "", {}) or {}
    quarter_plan = stored_profile.get("quarter_plan") if isinstance(stored_profile.get("quarter_plan"), dict) else None
    items = current_items(core, quarter_plan)
    previous = _previous_review(db, business, strategy)
    closed = bool(closing) if closing is not None else (bool(previous.get("closed")) or _is_closed(db, business, strategy, today))
    evidence = Evidence(db, business, strategy, today=today)
    evaluated = evaluate(evidence, items, closed=closed)
    before = {item.get("key"): item for item in previous.get("items") or [] if isinstance(item, dict)}
    out, to_phrase = [], []
    for item in evaluated:
        prior = before.get(item["key"]) or {}
        grammar = _grammar(item["kind"])
        entry = {key: item[key] for key in ("key", "kind", "text_he", "if_wrong_he", "status")}
        entry["facts"] = item["facts"]
        moved = bool(prior) and _clean(prior.get("text_he"), 400) != item["text_he"]
        still_changed = not moved and prior.get("status") == "changed" and item["status"] == "measuring"
        if moved or still_changed:
            # The plan (or the owner) changed it: "changed" until there is evidence again.
            entry["status"] = "changed"
            entry["changed_at"] = now if moved else prior.get("changed_at")
            entry["previous_he"] = _clean(prior.get("text_he"), 400) if moved else prior.get("previous_he", "")
            entry["evidence_he"] = CHANGED_HE[grammar]
            entry["facts_key"] = ""
            out.append(entry)
            continue
        signature = dumps({"status": item["status"], "template": item["template"], "closed": closed})
        entry["template"] = item["template"]
        if prior.get("facts_key") == signature and prior.get("evidence_he"):
            entry["evidence_he"] = prior["evidence_he"]
        elif item["status"] in DECIDED and _numbers(item["template"]):
            to_phrase.append(item)
        else:
            entry["evidence_he"] = item["template"]
        entry["facts_key"] = signature
        out.append(entry)
    if to_phrase:
        lines = phrase(to_phrase)
        for entry in out:
            if "evidence_he" not in entry:
                entry["evidence_he"] = lines.get(entry["key"]) or entry["template"]
    for entry in out:
        entry.setdefault("evidence_he", entry.get("template") or PENDING_HE)
    review = {"updated_at": now, "closed": closed, "items": out}
    extra[REVIEW_KEY] = review
    strategy.roadmap_json = dumps(extra)
    return review


def refresh_for_business(db, business, *, closing: bool | None = None, strategy=None, today: date | None = None) -> dict | None:
    """The active month's review (or `strategy`'s), refreshed. None when there is no month.
    Never raises: a status line must never cost the owner their numbers. The caller commits."""
    try:
        if strategy is None:
            from fastapi import HTTPException

            from app.routers.strategy import _active_strategy  # the router owns "the current month"

            try:
                strategy = _active_strategy(db, business)
            except HTTPException:
                return None
        return refresh_strategy(db, business, strategy, closing=closing, today=today)
    except Exception:  # noqa: BLE001
        log.exception("hypothesis review failed for business %s", getattr(business, "id", None))
        return None


def for_prompt(review: dict | None) -> list[dict]:
    """The closing month's statuses, for the next month's planner: facts only."""
    out = []
    for item in (review or {}).get("items") or []:
        if isinstance(item, dict) and item.get("text_he"):
            out.append({"text": item["text_he"], "status": item.get("status"), "evidence": item.get("evidence_he") or ""})
    return out
