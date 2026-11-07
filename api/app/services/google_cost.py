"""Google Ads planning guidance without agency-derived personal forecasts.

The owner chooses the campaign budget. A useful search forecast depends on that
campaign's keywords and settings, so this app does not infer clicks, conversions, costs,
or a minimum from business category or a third-party agency table. Owners can review
Google's Keyword Planner forecast and choose the daily budget in their own Google Ads
account. No Google Ads account is read or changed here.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

from app.services import business_fields
from app.services.business_model import CONVERSION_UNIT, normalise_model

LEGACY_AGENCY_SOURCE_URL = (
    "https://www.rulers.co.il/blog/"
    "how-much-does-a-successful-google-ads-campaign-really-cost-in-israel/"
)
SOURCE_URL = "https://support.google.com/google-ads/answer/7337243?hl=he"
SOURCE_TITLE = "Google Ads — שימוש במתכנן מילות המפתח"
BUDGET_SOURCE_URL = "https://support.google.com/google-ads/answer/6385083?hl=he"
BUDGET_SOURCE_TITLE = "Google Ads — בחירת תקציב יומי ממוצע"

# --- published Israeli market ranges -------------------------------------------------
# The three CPC tiers the source groups its industries into.
CPC_TIERS: dict[str, tuple[float, float]] = {
    "low": (2.0, 6.0),
    "medium": (6.0, 12.0),
    "high": (12.0, 30.0),
}
TIER_LABELS = {"low": "נמוכה", "medium": "בינונית", "high": "גבוהה", "general": "כללית"}

# Management is quoted by the source in two alternative forms; both are reported, and
# this module refuses to pick one for the owner.
MANAGEMENT_PERCENT = (0.15, 0.20)
MANAGEMENT_FLAT_ILS = (2_000, 8_000)
SETUP_FEE_ILS = (1_500, 4_000)

# "כדי שאלגוריתמים של גוגל ילמדו... צריך לאסוף לפחות 30-50 המרות בחודש".
LEARNING_CONVERSIONS_PER_MONTH = (30, 50)

# Published for the channel comparison only; the Meta cost model has its own source.
META_CPC_ILS = (1.5, 8.0)

# The default when nothing matches. It is the source's MEDIUM tier — not the cheapest
# and not the most expensive tier — and it is announced in a warning, never silent.
DEFAULT_CPC_TIER = "medium"

# --- sector profiles -----------------------------------------------------------------
# A sector carries the two numbers the source publishes per sector: a conversion rate
# and a minimum viable media budget. Only the sectors the source actually publishes
# exist here; `conversion_rate=None` means "the source did not publish one", and the
# plan then reports no conversion estimate at all.
SECTORS: dict[str, dict] = {
    "ecommerce": {
        "label": "חנות אונליין",
        "conversion_rate": (0.015, 0.025),
        "minimum_budget": (8_000, 12_000),
        "conversion_unit": "רכישה",
    },
    "local_services": {
        "label": "שירותים מקומיים",
        "conversion_rate": (0.03, 0.05),
        "minimum_budget": (5_000, 8_000),
        "conversion_unit": "פנייה",
    },
    "professional": {
        "label": "שירותים מקצועיים ולעסקים",
        "conversion_rate": (0.05, 0.08),
        "minimum_budget": (10_000, 15_000),
        "conversion_unit": "פנייה",
    },
    "tech": {
        "label": "סטארטאפים וטכנולוגיה",
        # The source lists a minimum budget for this sector but publishes no
        # conversion rate for it. Left empty on purpose.
        "conversion_rate": None,
        "minimum_budget": (15_000, 25_000),
        "conversion_unit": "פנייה",
    },
}

# Spoken sector signals: an owner says "חנות אונליין", not "eCommerce". These let the
# sector be identified even when the product category is not one of the priced
# industries, so an online store still gets the eCommerce rate and floor.
SECTOR_SIGNALS: dict[str, tuple[str, ...]] = {
    "ecommerce": ("איקומרס", "אי-קומרס", "ecommerce", "e-commerce", "חנות אונליין", "מכירה אונליין", "חנות מקוונת"),
    "local_services": ("שירותים מקומיים", "עסק מקומי", "בעל מקצוע", "נותן שירות"),
    "professional": ("שירותים מקצועיים", "מקצועי", "ייעוץ", "b2b", "עסקי", "ארגוני"),
    "tech": ("סטארטאפ", "סטרטאפ", "startup", "הייטק", "היי-טק", "טכנולוג", "תוכנה", "saas"),
}


@dataclass(frozen=True)
class Industry:
    """One row of the source's CPC table, plus the words Israeli owners use for it.

    The label is the source's own label. The keywords are matching aids only — they
    carry no numbers and change no price; they exist so that "מוסך" lands on
    "רכב ואביזרים" instead of falling through to the default.
    """

    key: str
    label: str
    cpc: tuple[float, float]
    tier: str
    sector: str | None
    keywords: tuple[str, ...]


# The source's table, in its own order. Keywords = the published label words first,
# then the everyday Hebrew names for the same trade.
INDUSTRIES: tuple[Industry, ...] = (
    Industry(
        key="fashion",
        label="אופנה ואקססוריז",
        cpc=(2.5, 4.5),
        tier="low",
        sector="ecommerce",
        keywords=("אופנה", "אקססוריז", "ביגוד", "בגדים", "הלבשה", "נעל", "תיקים", "תכשיט", "קולקציה"),
    ),
    Industry(
        key="home_garden",
        label="מוצרי בית וגינה",
        cpc=(3.0, 5.0),
        tier="low",
        sector="ecommerce",
        keywords=("מוצרי בית", "בית וגינה", "גינה", "ריהוט", "רהיט", "כלי בית", "עיצוב הבית", "מטבח", "צמחים"),
    ),
    Industry(
        key="art_craft",
        label="אומנות ומלאכה",
        cpc=(2.0, 4.0),
        tier="low",
        sector="ecommerce",
        keywords=("אומנות", "אמנות", "מלאכה", "עבודת יד", "עבודות יד", "יצירה", "ציור", "קרמיקה", "תפירה", "נגרות אמנותית"),
    ),
    Industry(
        key="food",
        label="מזון ומשקאות",
        cpc=(3.5, 5.5),
        tier="low",
        # Food and drink businesses in Israel sell mostly to people nearby, so the
        # source's local-services rate fits them better than a cart-based rate.
        sector="local_services",
        keywords=(
            "מזון", "משקאות", "מאפייה", "מאפיית", "מסעדה", "קפה", "בית קפה", "קייטרינג", "אוכל",
            "שוקולד", "גלידה", "פיצה", "חומוס", "מכולת", "יין", "בירה", "משלוחי אוכל",
        ),
    ),
    Industry(
        key="renovation",
        label="שיפוצים ובנייה",
        cpc=(7.0, 11.0),
        tier="medium",
        # The source's own local-services example is a renovation business.
        sector="local_services",
        keywords=(
            "שיפוץ", "שיפוצים", "בנייה", "בניה", "קבלן", "אינסטלציה", "אינסטלטור", "חשמלאי",
            "צבעי", "ריצוף", "אלומיניום", "מיזוג", "אדריכל", "עיצוב פנים", "הרחבת דירה",
        ),
    ),
    Industry(
        key="automotive",
        label="רכב ואביזרים",
        cpc=(6.0, 10.0),
        tier="medium",
        sector="local_services",
        keywords=("רכב", "אביזרי רכב", "מוסך", "טיפולי רכב", "שטיפת רכב", "צמיג", "דיטיילינג", "פחחות"),
    ),
    Industry(
        key="education",
        label="חינוך והדרכה",
        cpc=(5.0, 9.0),
        tier="medium",
        # A coach or a training studio sells instruction; the source's education and
        # training band is the closest published one.
        sector="local_services",
        keywords=(
            "חינוך", "הדרכה", "הדרכות", "קורס", "קורסים", "שיעורים", "מורה", "לימוד", "לימודים",
            "הכשרה", "אימון", "מאמן", "חוג", "גן ילדים", "ספורט", "כושר", "סטודיו",
        ),
    ),
    Industry(
        key="beauty",
        label="יופי וקוסמטיקה",
        cpc=(6.0, 10.0),
        tier="medium",
        sector="local_services",
        keywords=(
            "יופי", "קוסמטיקה", "קוסמטיקאית", "מספרה", "ציפורן", "איפור", "שיער", "ספא",
            "טיפוח", "מכון יופי", "ריסים", "גבות", "הסרת שיער",
        ),
    ),
    Industry(
        key="tourism",
        label="תיירות ונופש",
        cpc=(8.0, 12.0),
        tier="medium",
        sector="local_services",
        keywords=("תיירות", "נופש", "מלון", "צימר", "אירוח", "טיולים", "טיול", "נסיעות", "טיסות", "ריזורט", "אטרקציה"),
    ),
    Industry(
        key="legal",
        label="שירותים משפטיים",
        cpc=(18.0, 28.0),
        tier="high",
        # The source's own professional-services example is a lawyer.
        sector="professional",
        keywords=("משפט", "עורך דין", "עורכת דין", "עו\"ד", "נוטריון", "עריכת דין", "סנגור", "תביעה"),
    ),
    Industry(
        key="insurance_finance",
        label="ביטוח ופיננסים",
        cpc=(15.0, 25.0),
        tier="high",
        sector="professional",
        keywords=(
            "ביטוח", "פיננס", "השקעות", "משכנתא", "פנסיה", "רואה חשבון", "רו\"ח", "הנהלת חשבונות",
            "ייעוץ מס", "בנק", "פינטק", "קרן", "אשראי", "גמל",
        ),
    ),
    Industry(
        key="health",
        label="רפואה ובריאות",
        cpc=(12.0, 22.0),
        tier="high",
        sector="professional",
        keywords=(
            "רפואה", "בריאות", "רופא", "מרפאה", "קליניקה", "מרפאת", "שיניים", "פיזיותרפ",
            "פסיכולוג", "פסיכיאטר", "תזונה", "דיאטן", "אופטומ", "וטרינר", "קליניק",
        ),
    ),
    Industry(
        key="real_estate",
        label="נדל״ן",
        cpc=(14.0, 24.0),
        tier="high",
        sector="professional",
        keywords=("נדלן", "נדל״ן", "נכסים", "נכס", "תיווך", "מתווך", "דירה", "דירות", "מגרש", "מגרשים", "שכירות", "פרויקט מגורים"),
    ),
    Industry(
        key="b2b_tech",
        label="B2B וטכנולוגיה",
        cpc=(16.0, 30.0),
        tier="high",
        # The source gives this sector a minimum budget but no conversion rate.
        sector="tech",
        keywords=(
            "b2b", "טכנולוגיה", "הייטק", "היי-טק", "תוכנה", "סטארטאפ", "סטרטאפ", "saas", "מחשוב",
            "סייבר", "אבטחת מידע", "פיתוח", "אפליקציה", "אוטומציה", "בינה מלאכותית", "ענן",
            "מערכות מידע", "אינטגרציה", "פלטפורמה",
        ),
    ),
)

INDUSTRIES_BY_KEY = {industry.key: industry for industry in INDUSTRIES}

# What no identified industry/keyword costs the owner in clarity — reported, not hidden.
UNMATCHED_KEY = "general"
UNMATCHED_LABEL = "כללי (לא זיהינו את התחום בטבלה)"

# The published channel comparison, kept next to the numbers so the plan can say why
# search is not the only answer.
CHANNEL_COMPARISON: dict = {
    "google": {
        "label": "מודעות בגוגל",
        "intent": "מי שמחפש כבר רוצה לקנות: אנשים מחפשים בדיוק את מה שאתם מציעים",
        "downside": "קליק עולה יותר מאשר בפייסבוק ובאינסטגרם",
        "timing": "תוצאות מיד",
    },
    "meta": {
        "label": "פייסבוק ואינסטגרם",
        "cpc_ils": META_CPC_ILS,
        "intent": "מי שגולל פחות מחפש לקנות: המודעה קוטעת אותו באמצע משהו אחר",
        "upside": "קליק זול יותר, ואפשר לכוון לפי גיל, מקום ותחומי עניין",
    },
    "recommendation": (
        "המקור ממליץ לשלב: גוגל למי שכבר מחפש לקנות, ופייסבוק ואינסטגרם כדי שיכירו אתכם "
        "ולפנות שוב למי שכבר ביקר. לא לשים את כל התקציב במקום אחד."
    ),
}


@dataclass
class GooglePlan:
    """What Google would cost this business, with its ranges and its unknowns named."""

    monthly_budget_ils: int
    industry_key: str
    industry_label: str
    industry_tier: str
    matched_keywords: list[str]
    sector_key: str | None
    sector_label: str | None
    # Ranges, never single values. None means "the source does not publish this".
    cpc_range: tuple[float, float] | None
    expected_clicks: tuple[int, int] | None
    conversion_rate_range: tuple[float, float] | None
    expected_conversions: tuple[int, int] | None
    cost_per_conversion: tuple[int, int] | None
    minimum_viable_budget: tuple[int, int] | None
    # Agency fees are unknown unless the owner supplies a quote.
    management_fee: dict | None
    setup_fee: tuple[int, int] | None
    total_monthly_ils: tuple[int, int] | None
    first_month_total_ils: tuple[int, int] | None
    warnings: list[str]
    assumptions: list[str]
    source: str
    source_title: str
    conversion_unit: str
    channel_comparison: dict

    def to_dict(self) -> dict:
        return asdict(self)


# --- matching ------------------------------------------------------------------------

_QUOTE_CHARS = "״׳\"'`´()[]{}.,:;!?/\\|-–—"


def _normalise(value: str) -> str:
    """Lowercase, drop quoting/punctuation and collapse whitespace.

    Hebrew industry labels are written with gershayim (נדל״ן, עו״ד, רו״ח) and owners type
    them a dozen different ways. Both sides of a comparison go through this, so the
    punctuation cannot decide whether a business is recognised.
    """
    cleaned = (value or "").strip().lower()
    for char in _QUOTE_CHARS:
        cleaned = cleaned.replace(char, " ")
    return " ".join(cleaned.split())


def _contains(haystack: str, needle: str) -> bool:
    """Substring match, but short needles must align to word edges.

    Without this, "מה" fires inside "מהדורה" and "ליד" inside "לידור" — and an intent
    label that is wrong half the time is worse than no label.
    """
    needle = _normalise(needle)
    if not needle:
        return False
    if len(needle) >= 4:
        return needle in haystack
    return f" {needle} " in f" {haystack} "


def _field_text(business_type: str) -> str:
    """The business type as matchable words: a field key ("food") becomes its Hebrew label,
    and an old label is kept as written next to the label it maps to."""
    resolved = business_fields.resolve_field(business_type)
    label = business_fields.field_label(resolved.key) if resolved else ""
    return business_type if label in {"", business_type} else f"{business_type} {label}"


def match_industry(business_type: str = "", offerings: str = "") -> tuple[Industry | None, list[str]]:
    """Map free Hebrew text onto one of the source's priced industries.

    Scoring is deliberately boring and explainable: the industry with the most matched
    keywords wins; ties go to the industry with the single longest matched keyword (the
    more specific evidence), and only then to the source's table order. An unclear
    business therefore does NOT drift to the cheapest or the priciest row — it comes
    back as no match at all, and the caller reports the default and says so.

    The owner's words decide first. Only when they match no row does the business field
    ("ספורט וכושר" → חינוך והדרכה) pick its row (`cost_industry` in
    app/data/business_fields.json); a field without a published row stays unmatched.
    """
    haystack = _normalise(f"{_field_text(business_type)} {offerings}")
    if not haystack:
        return None, []

    best_industry: Industry | None = None
    best_matched: list[str] = []
    best_score: tuple[int, int, int] | None = None
    for position, industry in enumerate(INDUSTRIES):
        matched = [kw for kw in industry.keywords if _contains(haystack, kw)]
        if not matched:
            continue
        score = (len(matched), max(len(_normalise(kw)) for kw in matched), -position)
        if best_score is None or score > best_score:
            best_score, best_industry, best_matched = score, industry, matched
    if best_industry is None:
        resolved = business_fields.resolve_field(business_type, offerings)
        row = INDUSTRIES_BY_KEY.get(business_fields.cost_industry(resolved.key) or "") if resolved else None
        if row is not None:
            return row, [business_fields.field_label(resolved.key)]
    return best_industry, best_matched


def unpriced_field_label(business_type: str = "", offerings: str = "") -> str | None:
    """The field's label when the published table has no row for it (ילדים, חיות מחמד…),
    so a fallback price can say which field it stands in for. None for "other" or unknown."""
    resolved = business_fields.resolve_field(business_type, offerings)
    if not resolved or resolved.key == business_fields.OTHER:
        return None
    return None if business_fields.cost_industry(resolved.key) else business_fields.field_label(resolved.key)


def match_sector(
    business_type: str = "",
    offerings: str = "",
    industry: Industry | None = None,
    online_shop: bool = False,
) -> str | None:
    """The sector profile — conversion rate and minimum budget — for this business.

    An explicit signal in the business's own words ("חנות אונליין", "שירותים
    מקצועיים") wins, because it is what the owner actually said. Then where customers
    come: a shop that sells only online (`online_shop`, from presence_type / grow_where —
    the field list no longer says "online") is eCommerce. Otherwise the sector comes from
    the matched industry. Otherwise: unknown, and the plan says so.
    """
    haystack = _normalise(f"{_field_text(business_type)} {offerings}")
    best_signal: tuple[int, str] | None = None
    for sector_key, signals in SECTOR_SIGNALS.items():
        for signal in signals:
            if _contains(haystack, signal):
                length = len(_normalise(signal))
                if best_signal is None or length > best_signal[0]:
                    best_signal = (length, sector_key)
    if best_signal:
        return best_signal[1]
    if online_shop:
        return "ecommerce"
    return industry.sector if industry else None


# --- the plan ------------------------------------------------------------------------


def _percent_range(pair: tuple[float, float]) -> str:
    return f"{pair[0] * 100:.1f}%-{pair[1] * 100:.1f}%"


def unit_label(unit: str) -> str:
    """The conversion unit without its own parentheses, for use inside a sentence.

    `CONVERSION_UNIT` spells the service unit "פנייה (ליד)", which reads badly inside
    "שיעור המרה (...)". The value itself stays untouched for everything else.
    """
    return unit.replace(" (ליד)", "")


_UNIT_PLURAL = {"רכישה": "רכישות", "פנייה": "פניות", "רכישה או פנייה": "רכישות או פניות"}


def unit_plural(unit: str) -> str:
    """The conversion unit in the plural, for "X% of the clicks become ___"."""
    return _UNIT_PLURAL.get(unit_label(unit), "פניות או הזמנות")


def plan_from_budget(
    monthly_budget_ils: int,
    business_type: str = "",
    offerings: str = "",
    business_model: str | None = None,
    presence_type: str | None = None,
) -> GooglePlan:
    """Describe the owner's chosen budget and the official path to a real forecast.

    The old Rulers table supplied campaign and agency averages, but those do not
    establish this business's Google Ads costs or minimum. Keep the payload fields for
    client compatibility, and deliberately leave every unobserved metric empty.
    """
    budget = max(int(monthly_budget_ils or 0), 0)
    resolved = business_fields.resolve_field(business_type, offerings)
    industry_key = resolved.key if resolved else UNMATCHED_KEY
    industry_label = business_fields.field_label(industry_key) if resolved else "לא סווג"
    return GooglePlan(
        monthly_budget_ils=budget,
        industry_key=industry_key,
        industry_label=industry_label,
        industry_tier="",
        matched_keywords=[],
        sector_key=None,
        sector_label=None,
        cpc_range=None,
        expected_clicks=None,
        conversion_rate_range=None,
        expected_conversions=None,
        cost_per_conversion=None,
        minimum_viable_budget=None,
        management_fee=None,
        setup_fee=None,
        total_monthly_ils=None,
        first_month_total_ils=None,
        warnings=[],
        assumptions=[
            "התקציב שמוצג הוא הסכום שבעל העסק בחר; גוגל מאפשרת לבחור ולשנות תקציב יומי ממוצע לכל קמפיין.",
            "תחזית שימושית דורשת מילות מפתח והגדרות הקמפיין בחשבון Google Ads. לא חיברנו את החשבון ולא חישבנו תחזית לעסק.",
            "דמי ניהול והקמה תלויים בהצעה של ספק שבעל העסק בחר; לא הנחנו מחיר לסוכנות.",
        ],
        source=SOURCE_URL,
        source_title=SOURCE_TITLE,
        conversion_unit="",
        channel_comparison={},
    )

def plan_for_business(business: dict) -> GooglePlan:
    """The endpoint / prompt entry point: takes the business payload as the app stores it."""
    return plan_from_budget(
        int(business.get("monthly_budget_ils") or 0),
        business_type=business.get("business_type") or "",
        offerings=business.get("offerings") or "",
        business_model=business.get("business_model"),
        presence_type=business.get("presence_type"),
    )


# --- Google Business Profile (the free local surface) --------------------------------

def business_profile_guidance(business: dict) -> dict:
    """A GBP checklist for a local business.

    Google Business Profile is free — that is the whole reason it belongs in a promotion
    plan built on published costs. Nothing here claims a statistic ("profiles with photos
    get X% more calls" would be exactly the invented number this codebase bans), and
    nothing here pretends to know the state of the owner's profile: we have no access to
    it, and the checklist says so.
    """
    plan = plan_for_business(business)
    presence = (business.get("presence_type") or "brick_and_mortar").strip()
    is_local = presence != "online_only"
    location = (business.get("location") or "").strip()
    name = (business.get("name") or "").strip() or "שם העסק"

    service_area_step = {
        "id": "service_area",
        "title": "אזור שירות וכתובת",
        "priority": "critical" if is_local else "medium",
        "why": (
            "גוגל מציג את הכרטיס למי שמחפש בסביבה. אם אתם מגיעים ללקוח, הגדירו אזור שירות "
            "והסתירו את הכתובת. אם הלקוח מגיע אליכם, הכתובת חייבת להיות מדויקת."
            if is_local
            else "עסק שפועל אונליין בלבד יכול להגדיר אזור שירות בלי להציג כתובת, ואז להופיע "
            "למחפשים באזורים שבהם אתם עובדים."
        ),
        "how": [
            "בחרו אם הלקוחות מגיעים אליכם או שאתם מגיעים אליהם. לפי זה נקבע אם הכתובת מוצגת.",
            "אם אתם מגיעים ללקוח: הגדירו אזור שירות (ערים או רדיוס) והסתירו את הכתובת.",
            "ודאו שהטלפון והאתר בכרטיס הם של העסק ולא של סוכנות.",
        ],
    }

    steps = [
        {
            "id": "claim",
            "title": "לקבל בעלות על הכרטיס בגוגל",
            "priority": "critical",
            "why": f"בלי כרטיס שאתם מנהלים, גוגל עלול להציג על {name} מידע שאף אחד לא עדכן, "
                   "או לא להציג אותו בכלל כשמחפשים אתכם.",
            "how": [
                f"חפשו את '{name}' בגוגל מפות ובחיפוש של גוגל.",
                "אם הכרטיס קיים ואתם לא מנהלים אותו, לחצו על 'בעלים של העסק הזה?' ובקשו בעלות.",
                "אם אין כרטיס, פתחו אחד עם חשבון הגוגל של העסק (לא עם חשבון אישי של עובד).",
            ],
        },
        {
            "id": "verify",
            "title": "לאמת את הכרטיס",
            "priority": "critical",
            "why": "כרטיס לא מאומת לא מוצג כמו כרטיס מאומת, ואי אפשר לערוך בו חלק מהפרטים.",
            "how": [
                "בחרו את שיטת האימות שגוגל מציע (סרטון, טלפון או גלויה).",
                "אמתו מיד. רק אחרי האימות הכרטיס באמת שלכם.",
                "רשמו למי בחשבון יש הרשאה, והוסיפו בעלים נוסף כדי לא לאבד גישה.",
            ],
        },
        {
            "id": "categories",
            "title": "קטגוריה ראשית וקטגוריות משנה",
            "priority": "critical",
            "why": "הקטגוריה הראשית קובעת באילו חיפושים הכרטיס בכלל יופיע.",
            "how": [
                f"בחרו קטגוריה ראשית שמתאימה לתחום שזוהה: {plan.industry_label}.",
                "בחרו מהרשימה של גוגל את הקטגוריה המדויקת ביותר, לא את הרחבה ביותר.",
                "הוסיפו 2-4 קטגוריות משנה של השירותים שאתם באמת נותנים.",
            ],
        },
        service_area_step,
        {
            "id": "hours",
            "title": "שעות פעילות",
            "priority": "high",
            "why": "שעות חסרות שולחות לקוחות לכתובת סגורה, ואלה בדיוק הלקוחות שכבר החליטו לבוא.",
            "how": [
                "מלאו שעות לכל יום, כולל הפסקות.",
                "הוסיפו שעות מיוחדות לחגים ולמועדים ישראליים לפני שהם מגיעים.",
                "עדכנו שעות חריגות (חופשה, סגירה זמנית) באותו יום, לא אחריו.",
            ],
        },
        {
            "id": "photos",
            "title": "תמונות אמיתיות",
            "priority": "high",
            "why": "את התמונות רואים לפני שמחליטים אם להתקשר. תמונות אמיתיות של העסק "
                   "עובדות טוב יותר מתמונות מאגר שלא קשורות אליו.",
            "how": [
                "העלו תמונות של המקום מבחוץ ומבפנים, של הצוות ושל העבודה עצמה.",
                "השתמשו בתמונות שצילמתם, לא בתמונות מהאינטרנט.",
                "הוסיפו תמונות חדשות כל חודש. כרטיס שלא מתעדכן נראה כמו עסק שנסגר.",
            ],
        },
        {
            "id": "posts",
            "title": "פוסטים בכרטיס",
            "priority": "medium",
            "why": "פוסטים בכרטיס מראים למי שמחפש מה קורה בעסק עכשיו, ומחברים בין החיפוש "
                   "לפוסטים שאתם כבר מפרסמים ברשתות.",
            "how": [
                "פרסמו פוסט קצר בכרטיס לפחות פעם בשבוע: מבצע, מוצר חדש או עדכון.",
                "השתמשו באותן תמונות שכבר מוכנות בתוכנית של החודש.",
                "כתבו קריאה אחת ברורה (להתקשר, להזמין, להגיע).",
            ],
        },
        {
            "id": "qa",
            "title": "שאלות ותשובות",
            "priority": "medium",
            "why": "אנשים שואלים שאלות בכרטיס. תשובה שלכם עדיפה על ניחוש של מישהו אחר.",
            "how": [
                "רשמו את 5 השאלות שהכי הרבה אנשים שואלים בטלפון, ופרסמו אותן כשאלות עם תשובה.",
                "אפשר לפרסם שאלה ולענות עליה בעצמכם. זה מותר ומקובל.",
                "ענו גם לשאלות של אחרים, לא רק לאלה שאתם כתבתם.",
            ],
        },
        {
            "id": "reviews",
            "title": "ביקורות",
            "priority": "critical",
            "why": "את הביקורות רוב האנשים קוראים לפני שהם יוצרים קשר. וגם גוגל לומד "
                   "מהן על העסק.",
            "how": [
                "בקשו ביקורת מיד אחרי רגע טוב: בסוף תיקון, בסוף טיפול, במסירה.",
                "בקשו בפנים או בוואטסאפ עם קישור ישיר לטופס הביקורת של הכרטיס.",
                "אל תכתבו ביקורות בעצמכם ואל תקנו ביקורות. גוגל מסנן אותן, והנזק גדול מהתועלת.",
            ],
        },
        {
            "id": "reviews_reply",
            "title": "להגיב לכל ביקורת",
            "priority": "high",
            "why": "תגובה עניינית, גם לביקורת שלילית, מראה למי שקורא שיש מישהו אמיתי מאחורי העסק.",
            "how": [
                "הגיבו לכל ביקורת בתוך כמה ימים, בקצרה ובלי להתווכח.",
                "בביקורת שלילית: הכירו בבעיה, אמרו מה תעשו, והעבירו את ההמשך לשיחה פרטית.",
                "אל תבקשו מלקוחות להסיר ביקורת שלילית כתנאי לשירות.",
            ],
        },
        {
            "id": "insights",
            "title": "נתונים אמיתיים על החיפושים סביבכם",
            "priority": "high",
            "why": "נתוני חיפוש אמיתיים על העסק שלכם יש רק בשני מקומות: בכרטיס עצמו, וב-Search "
                   "Console, הכלי החינמי של גוגל שמראה איך האתר מופיע בחיפוש. אין לנו נפחי חיפוש, "
                   "ואנחנו לא ממציאים אותם.",
            "how": [
                "פתחו את 'ביצועים' בכרטיס וראו אילו חיפושים הביאו אליו אנשים.",
                "חברו את גוגל בעמוד החיבורים, כולל Search Console, ותראו את החיפושים שהאתר כבר מופיע בהם.",
                "הביאו לכאן את מה שמצאתם. ככה הקמפיין יהיה מדויק יותר.",
            ],
        },
    ]

    notes = [
        "הכרטיס של העסק בגוגל הוא בחינם: לא משלמים לגוגל על חשיפה, ולא מתחרים במכרז על מקום.",
        "אין לנו גישה לכרטיס שלכם, ואנחנו לא יודעים אם הוא קיים או מאומת. זו רשימת "
        "פעולות, לא דוח מצב.",
        "אם הכרטיס כבר קיים ומאומת, התחילו מהקטגוריה, השעות, התמונות והביקורות. "
        "אלה משפיעים ישירות על מי שמגיע אליכם.",
        "אין כאן נפחי חיפוש, ואין הבטחה למקום בתוצאות. אנחנו לא מציגים מספרים שלא פורסמו.",
    ]
    if not is_local:
        notes.append(
            "העסק מוגדר כעסק אונליין, אז הכרטיס פחות חשוב מהאתר ומהפוסטים. אבל הוא בחינם, "
            "ואין סיבה לוותר עליו."
        )
    if location:
        notes.append(f"המיקום שרשמתם ({location}) הוא מה שקובע לאיזה אזור הכרטיס יוצג.")

    return {
        "title": "הכרטיס של העסק בגוגל (Google Business Profile)",
        "summary": (
            "לפני שמשלמים לגוגל על קליקים, כדאי לסדר את מה שבחינם: הכרטיס של העסק בגוגל. "
            "הוא מופיע כשמחפשים את שם העסק, ודרכו מבקשים ביקורות."
        ),
        "free": True,
        "is_local": is_local,
        "suggested_category_hint": plan.industry_label,
        "steps": steps,
        "notes": notes,
    }


# --- prompt block --------------------------------------------------------------------

def prompt_block(plan: GooglePlan) -> str:
    """Prompt guidance: do not turn a chosen budget into an ungrounded forecast."""
    return (
        "Google Ads: use only the monthly amount the owner supplied as their own budget choice. "
        "This app has no Google Ads campaign forecast or account data. Never infer or state CPC, "
        "clicks, impressions, conversions, cost per lead, a sector minimum, learning threshold, "
        "or agency/setup fees from business type or third-party benchmarks. If a Google Ads "
        "forecast matters to the plan, direct the owner to Google's Keyword Planner with their "
        "actual keywords and campaign settings; label that result as Google's forecast for the "
        "chosen configuration, not a promise or this business's measured history. Agency fees "
        "must come from a quote the owner provides."
    )
