"""Google Ads cost basics for the Israeli market.

The product already prices Meta. Google was a blank: an owner could be told what a
Facebook campaign costs and nothing about what a search campaign costs, which terms are
worth bidding on, or that the local surface in Google is free.

Every figure here is a published Israeli market range, not a guess. Source: Rulers
(רולרס), an Israeli agency, published the CPC / conversion-rate / minimum-budget data
from the campaigns they run —
https://www.rulers.co.il/blog/how-much-does-a-successful-google-ads-campaign-really-cost-in-israel/

    CPC by industry       2-30 NIS per click, in three published tiers
    conversion rate       eCommerce 1.5-2.5%, local services (renovation) 3-5%,
                          professional services (lawyer) 5-8%
    minimum media budget  eCommerce 8,000-12,000, local services 5,000-8,000,
                          B2B/professional 10,000-15,000, startups/tech 15,000-25,000 NIS
    management            15-20% of media budget, or 2,000-8,000 NIS/month flat
    one-time setup        1,500-4,000 NIS
    learning phase        Google needs 30-50 conversions/month to optimise

Because these are RANGES, every derived number is a range too, and each plan carries the
assumptions it was built on. A single confident figure would be the same lie the Meta
cost model was written to replace, just better sourced.

Two things this module deliberately refuses to do:

* It will not invent a conversion rate. The source publishes rates for three sectors
  only. A business it cannot place in one of those sectors (B2B/tech is the published
  minimum budget without a published conversion rate) gets a CPC range, clicks, and a
  warning that the rest is unknown — not a made-up number.
* It will not invent search volume. There is no Keyword Planner access here, so the plan
  says nothing about how many people search. The click range is the upper bound of what
  the budget can buy, no more.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

from app.services.business_model import CONVERSION_UNIT, normalise_model

SOURCE_URL = (
    "https://www.rulers.co.il/blog/"
    "how-much-does-a-successful-google-ads-campaign-really-cost-in-israel/"
)
SOURCE_TITLE = "רולרס — כמה באמת עולה קמפיין Google Ads מוצלח בישראל?"

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
        "label": "איקומרס",
        "conversion_rate": (0.015, 0.025),
        "minimum_budget": (8_000, 12_000),
        "conversion_unit": "רכישה",
    },
    "local_services": {
        "label": "שירותים מקומיים",
        "conversion_rate": (0.03, 0.05),
        "minimum_budget": (5_000, 8_000),
        "conversion_unit": "פנייה (ליד)",
    },
    "professional": {
        "label": "B2B / שירותים מקצועיים",
        "conversion_rate": (0.05, 0.08),
        "minimum_budget": (10_000, 15_000),
        "conversion_unit": "פנייה (ליד)",
    },
    "tech": {
        "label": "סטארטאפים / טכנולוגיה",
        # The source lists a minimum budget for this sector but publishes no
        # conversion rate for it. Left empty on purpose.
        "conversion_rate": None,
        "minimum_budget": (15_000, 25_000),
        "conversion_unit": "פנייה (ליד)",
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
UNMATCHED_LABEL = "כללי (לא זוהה תחום מהטבלה)"

# The published channel comparison, kept next to the numbers so the plan can say why
# search is not the only answer.
CHANNEL_COMPARISON: dict = {
    "google": {
        "label": "Google Ads",
        "intent": "כוונת רכישה גבוהה — אנשים מחפשים בדיוק את מה שאתם מציעים",
        "downside": "CPC יקר יותר ממטא",
        "timing": "תוצאות מיידיות",
    },
    "meta": {
        "label": "Facebook / Instagram",
        "cpc_ils": META_CPC_ILS,
        "intent": "כוונת רכישה נמוכה יותר — שיווק בהפרעה",
        "upside": "CPC נמוך יותר ומיקוד מדויק לפי דמוגרפיה ותחומי עניין",
    },
    "recommendation": (
        "המקור ממליץ על מיקס: גוגל לכוונת קנייה גבוהה, מטא/אינסטגרם למודעות ולרימרקטינג. "
        "לא לשים את כל התקציב בערוץ אחד."
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
    # Fees are separate line items so the owner sees the true cost of the month, the way
    # the Meta model refuses to assume management is free.
    management_fee: dict
    setup_fee: tuple[int, int]
    total_monthly_ils: tuple[int, int]
    first_month_total_ils: tuple[int, int]
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


def match_industry(business_type: str = "", offerings: str = "") -> tuple[Industry | None, list[str]]:
    """Map free Hebrew text onto one of the source's priced industries.

    Scoring is deliberately boring and explainable: the industry with the most matched
    keywords wins; ties go to the industry with the single longest matched keyword (the
    more specific evidence), and only then to the source's table order. An unclear
    business therefore does NOT drift to the cheapest or the priciest row — it comes
    back as no match at all, and the caller reports the default and says so.
    """
    haystack = _normalise(f"{business_type} {offerings}")
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
    return best_industry, best_matched


def match_sector(business_type: str = "", offerings: str = "", industry: Industry | None = None) -> str | None:
    """The sector profile — conversion rate and minimum budget — for this business.

    An explicit signal in the business's own words ("חנות אונליין", "שירותים
    מקצועיים") wins, because it is what the owner actually said. Otherwise the sector
    comes from the matched industry. Otherwise: unknown, and the plan says so.
    """
    haystack = _normalise(f"{business_type} {offerings}")
    best_signal: tuple[int, str] | None = None
    for sector_key, signals in SECTOR_SIGNALS.items():
        for signal in signals:
            if _contains(haystack, signal):
                length = len(_normalise(signal))
                if best_signal is None or length > best_signal[0]:
                    best_signal = (length, sector_key)
    if best_signal:
        return best_signal[1]
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


def plan_from_budget(
    monthly_budget_ils: int,
    business_type: str = "",
    offerings: str = "",
    business_model: str | None = None,
) -> GooglePlan:
    """The Google plan for a budget, with every derived number kept as a range."""
    budget = max(int(monthly_budget_ils or 0), 0)
    industry, matched = match_industry(business_type, offerings)
    sector_key = match_sector(business_type, offerings, industry)
    sector = SECTORS.get(sector_key or "") or None

    warnings: list[str] = []
    assumptions: list[str] = []

    if industry is not None:
        cpc_range: tuple[float, float] | None = industry.cpc
        industry_key, industry_label, tier = industry.key, industry.label, industry.tier
    else:
        cpc_range = CPC_TIERS[DEFAULT_CPC_TIER]
        industry_key, industry_label, tier = UNMATCHED_KEY, UNMATCHED_LABEL, DEFAULT_CPC_TIER
        warnings.append(
            "לא הצלחנו לזהות את התחום מתוך טבלת המחירים שפורסמה, כי לא נמצאו מילות מפתח "
            "מוכרות ב'סוג העסק' וב'מה העסק מציע'. ה-CPC שלמטה הוא רצועת הביניים של המקור "
            f"({CPC_TIERS[DEFAULT_CPC_TIER][0]:.0f}-{CPC_TIERS[DEFAULT_CPC_TIER][1]:.0f} ₪) "
            "ולא המחיר של תחום מסוים — הוא לא הזול ולא היקר בטבלה. כתבו את התחום המדויק "
            "(למשל: אופנה ואקססוריז, שיפוצים ובנייה, שיפוצים, ביטוח ופיננסים) כדי לקבל טווח אמיתי."
        )

    # --- clicks ---------------------------------------------------------------------
    clicks: tuple[int, int] | None = None
    if cpc_range and budget:
        clicks = (int(budget / cpc_range[1]), int(budget / cpc_range[0]))
    elif cpc_range:
        clicks = (0, 0)

    # --- conversions ----------------------------------------------------------------
    conversion_rate = sector["conversion_rate"] if sector else None
    conversions: tuple[int, int] | None = None
    cost_per_conversion: tuple[int, int] | None = None
    if conversion_rate and cpc_range and budget:
        # conversions = clicks x rate. Derived on the unrounded click count, and the
        # cheapest conversion is the cheapest click at the best rate — so the range
        # spans the whole published CPC and CR ranges rather than an average of them.
        conversions = (
            int(budget / cpc_range[1] * conversion_rate[0]),
            int(budget / cpc_range[0] * conversion_rate[1]),
        )
        cost_per_conversion = (
            round(cpc_range[0] / conversion_rate[1]),
            round(cpc_range[1] / conversion_rate[0]),
        )
    elif conversion_rate:
        conversions = (0, 0)
        cost_per_conversion = (
            round(cpc_range[0] / conversion_rate[1]) if cpc_range else None,
            round(cpc_range[1] / conversion_rate[0]) if cpc_range else None,
        )

    minimum_budget = sector["minimum_budget"] if sector else None

    # --- warnings the owner needs ---------------------------------------------------
    if budget <= 0:
        warnings.append(
            "לא הוגדר תקציב חודשי, ולכן אין מה לתכנן מול גוגל. הזינו תקציב מדיה חודשי "
            "כדי לראות טווח קליקים, המרות ועלות להמרה."
        )
    elif minimum_budget:
        if budget < minimum_budget[0]:
            warnings.append(
                f"התקציב החודשי ({budget:,} ₪) נמוך מהמינימום שפורסם למגזר "
                f"'{sector['label']}' ({minimum_budget[0]:,}-{minimum_budget[1]:,} ₪). "
                "מתחת למינימום הזה המקור מתאר מלכודת: אין מספיק דאטה → האלגוריתם של גוגל לא "
                "לומד → הביצועים גרועים → התקציב נשרף מהר → נשאר אפילו פחות דאטה. "
                "עדיף להמתין לתקציב הולם, או להשקיע את הסכום הזה בערוצים חלופיים "
                "(SEO, תוכן, רשתות חברתיות) שבהם הכסף לא תלוי בלמידה של אלגוריתם."
            )
        elif budget < minimum_budget[1]:
            warnings.append(
                f"התקציב החודשי ({budget:,} ₪) נמצא בחלק התחתון של טווח המינימום שפורסם "
                f"למגזר '{sector['label']}' ({minimum_budget[0]:,}-{minimum_budget[1]:,} ₪). "
                "זו נקודת פתיחה צרה: פחות מקום לטעויות, ופחות דאטה ללמידה."
            )

    if budget > 0 and conversions is not None:
        floor = LEARNING_CONVERSIONS_PER_MONTH[0]
        ceiling = LEARNING_CONVERSIONS_PER_MONTH[1]
        if conversions[1] < floor:
            warnings.append(
                f"בתקציב הזה צפויות {conversions[0]:,}-{conversions[1]:,} המרות בחודש — פחות "
                f"מ-{floor} גם בתרחיש האופטימי. גוגל צריך {floor}-{ceiling} המרות בחודש כדי "
                "ללמוד ולאפטם, ולכן בשלב הזה המטרה היא איסוף נתונים ובניית מדידה, לא ROAS. "
                "אל תבטיחו החזר בתקופה הזו."
            )
        elif conversions[0] < floor:
            warnings.append(
                f"טווח ההמרות הצפוי ({conversions[0]:,}-{conversions[1]:,} בחודש) חוצה את סף "
                f"{floor} ההמרות שגוגל צריך כדי ללמוד: בתרחיש השמרני עדיין אין מספיק דאטה "
                "והקמפיין נשאר בשלב למידה. תכננו את החודש כאיסוף נתונים, לא כ-ROAS."
            )

    if sector is None:
        warnings.append(
            "לא זוהה עבור העסק מגזר שפורסם (איקומרס / שירותים מקומיים / שירותים מקצועיים / "
            "סטארטאפים וטכנולוגיה), ולכן אין כאן אומדן המרות או עלות להמרה. את המספרים האלה "
            "אפשר לדעת רק מקמפיין אמיתי או מנתוני האתר שלכם."
        )
    elif conversion_rate is None:
        warnings.append(
            f"המקור מפרסם תקציב מינימום למגזר '{sector['label']}' אבל לא מפרסם עבורו שיעור "
            "המרה, ולכן אין כאן אומדן המרות או עלות להמרה. מספר כזה היה מומצא. את שיעור "
            "ההמרה אפשר למדוד רק בקמפיין שלכם."
        )

    # --- fee line items -------------------------------------------------------------
    percent_amount = (int(budget * MANAGEMENT_PERCENT[0]), int(budget * MANAGEMENT_PERCENT[1]))
    management_fee = {
        "percent_range": MANAGEMENT_PERCENT,
        "percent_label": f"{MANAGEMENT_PERCENT[0] * 100:.0f}%-{MANAGEMENT_PERCENT[1] * 100:.0f}% מתקציב המדיה",
        "percent_amount_ils": percent_amount,
        "flat_range_ils": MANAGEMENT_FLAT_ILS,
        "note": (
            "המקור מצטט ניהול בשתי צורות חלופיות — אחוז מתקציב המדיה או תשלום חודשי קבוע. "
            "שתי הצורות מוצגות כאן, ואנחנו לא בוחרים עבורכם."
        ),
    }
    management_low = min(percent_amount[0], MANAGEMENT_FLAT_ILS[0])
    management_high = max(percent_amount[1], MANAGEMENT_FLAT_ILS[1])
    total_monthly = (budget + management_low, budget + management_high)
    first_month = (total_monthly[0] + SETUP_FEE_ILS[0], total_monthly[1] + SETUP_FEE_ILS[1])

    # --- assumptions ----------------------------------------------------------------
    if industry is not None:
        assumptions.append(
            f"CPC לתחום '{industry.label}': {industry.cpc[0]:g}-{industry.cpc[1]:g} ₪ לקליק "
            f"(רצועת CPC {TIER_LABELS[industry.tier]} של המקור)"
        )
    else:
        assumptions.append(
            f"לא זוהה תחום; ה-CPC הוא רצועת ה-CPC {TIER_LABELS[DEFAULT_CPC_TIER]} של המקור "
            f"{CPC_TIERS[DEFAULT_CPC_TIER][0]:g}-{CPC_TIERS[DEFAULT_CPC_TIER][1]:g} ₪ לקליק"
        )
    if sector and conversion_rate:
        assumptions.append(
            f"שיעור המרה ({unit_label(sector['conversion_unit'])}) במגזר '{sector['label']}': "
            f"{_percent_range(conversion_rate)} — השיעור שפורסם למגזר הזה, לא מדידה של העסק"
        )
    if minimum_budget:
        assumptions.append(
            f"תקציב מדיה מינימלי שפורסם למגזר '{sector['label']}': "
            f"{minimum_budget[0]:,}-{minimum_budget[1]:,} ₪ בחודש"
        )
    assumptions += [
        f"גוגל צריך {LEARNING_CONVERSIONS_PER_MONTH[0]}-{LEARNING_CONVERSIONS_PER_MONTH[1]} "
        "המרות בחודש כדי ללמוד ולאפטם; מתחת לזה אין אופטימיזציה אמיתית",
        "עלות להמרה נגזרה מהטווחים שפורסמו (CPC ÷ שיעור המרה) ואינה מדידה של העסק הזה. "
        "המקור מדגים את החישוב עם CPC ממוצע; כאן כל טווח ה-CPC מוכפל בכל טווח ההמרה, "
        "ולכן הטווח כאן רחב יותר מהדוגמאות שבמאמר",
        f"ניהול: {MANAGEMENT_PERCENT[0] * 100:.0f}%-{MANAGEMENT_PERCENT[1] * 100:.0f}% "
        f"מתקציב המדיה או {MANAGEMENT_FLAT_ILS[0]:,}-{MANAGEMENT_FLAT_ILS[1]:,} ₪ בחודש; "
        f"הקמה חד-פעמית {SETUP_FEE_ILS[0]:,}-{SETUP_FEE_ILS[1]:,} ₪",
        "התקציב שהוזן הוא תקציב מדיה בלבד; עלות הניהול וההקמה מפורטות בנפרד ולכן "
        "העלות החודשית האמיתית גבוהה ממנו",
        "אין לנו גישה ל-Keyword Planner ואין לנו נפחי חיפוש. מספר הקליקים הוא הגבול העליון "
        "של מה שהתקציב יכול לקנות — לא תחזית של כמה אנשים מחפשים",
        "הפרופיל העסקי בגוגל (Google Business Profile) הוא משטח חינמי ואינו נכלל בתקציב הזה",
    ]

    return GooglePlan(
        monthly_budget_ils=budget,
        industry_key=industry_key,
        industry_label=industry_label,
        industry_tier=tier,
        matched_keywords=matched,
        sector_key=sector_key,
        sector_label=sector["label"] if sector else None,
        cpc_range=cpc_range,
        expected_clicks=clicks,
        conversion_rate_range=conversion_rate,
        expected_conversions=conversions,
        cost_per_conversion=cost_per_conversion,
        minimum_viable_budget=minimum_budget,
        management_fee=management_fee,
        setup_fee=SETUP_FEE_ILS,
        total_monthly_ils=total_monthly,
        first_month_total_ils=first_month,
        warnings=warnings,
        assumptions=assumptions,
        source=SOURCE_URL,
        source_title=SOURCE_TITLE,
        conversion_unit=(sector["conversion_unit"] if sector else CONVERSION_UNIT[normalise_model(business_model)]),
        channel_comparison=CHANNEL_COMPARISON,
    )


def plan_for_business(business: dict) -> GooglePlan:
    """The endpoint / prompt entry point: takes the business payload as the app stores it."""
    return plan_from_budget(
        int(business.get("monthly_budget_ils") or 0),
        business_type=business.get("business_type") or "",
        offerings=business.get("offerings") or "",
        business_model=business.get("business_model"),
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
            "גוגל מציג את הפרופיל למחפשים בסביבה. אם אתם מגיעים ללקוח — הגדירו אזור שירות "
            "והסתירו את הכתובת; אם הלקוח מגיע אליכם — הכתובת חייבת להיות מדויקת."
            if is_local
            else "עסק שפועל אונליין בלבד יכול להגדיר אזור שירות בלי להציג כתובת, ואז להופיע "
            "למחפשים באזורים שבהם אתם עובדים."
        ),
        "how": [
            "בחרו אם הלקוחות מגיעים אליכם או שאתם מגיעים אליהם — התשובה קובעת אם הכתובת מוצגת.",
            "אם אתם מגיעים ללקוח: הגדירו אזור שירות (ערים או רדיוס) והסתירו את הכתובת.",
            "ודאו שהטלפון והאתר בפרופיל הם של העסק ולא של סוכנות.",
        ],
    }

    steps = [
        {
            "id": "claim",
            "title": "לתבוע את הפרופיל",
            "priority": "critical",
            "why": f"בלי פרופיל מגובה, גוגל עלולה להציג על {name} מידע שאף אחד לא עדכן — "
                   "או לא להציג אותו בכלל כשמחפשים אתכם.",
            "how": [
                f"חפשו את '{name}' בגוגל מפות ובגוגל Search.",
                "אם הפרופיל קיים ולא שלכם — לחצו 'בעלים של העסק הזה?' והתחילו תהליך תביעה.",
                "אם אין פרופיל — פתחו אחד עם חשבון הגוגל של העסק (לא חשבון אישי של עובד).",
            ],
        },
        {
            "id": "verify",
            "title": "לאמת את הפרופיל",
            "priority": "critical",
            "why": "פרופיל לא מאומת לא מופיע כמו פרופיל מאומת, ולא ניתן לעדכן בו חלק מהשדות.",
            "how": [
                "בחרו את שיטת האימות שגוגל מציעה (סרטון, טלפון או גלויה).",
                "אמתו מיד — האימות הוא מה שהופך את הפרופיל לנכס שלכם.",
                "רשמו למי בחשבון יש הרשאה, והוסיפו בעלים נוסף כדי לא לאבד גישה.",
            ],
        },
        {
            "id": "categories",
            "title": "קטגוריה ראשית וקטגוריות משנה",
            "priority": "critical",
            "why": "הקטגוריה הראשית היא מה שקובע לאילו חיפושים הפרופיל בכלל רלוונטי.",
            "how": [
                f"בחרו קטגוריה ראשית שמתאימה לתחום שזוהה: {plan.industry_label}.",
                "היכנסו לרשימת הקטגוריות של גוגל ובחרו את המדויק ביותר — לא את הרחב.",
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
            "why": "התמונות הן מה שהמחפש רואה לפני שהוא מחליט אם להתקשר. תמונות אמת של העסק "
                   "עובדות טוב יותר מתמונות מלאי שלא קשורות אליו.",
            "how": [
                "העלו תמונות של המקום מבחוץ ומבפנים, של הצוות ושל העבודה עצמה.",
                "השתמשו בתמונות שצילמתם — לא בתמונות מהאינטרנט.",
                "הוסיפו תמונות חדשות מדי חודש; פרופיל שלא מתעדכן נראה סגור.",
            ],
        },
        {
            "id": "posts",
            "title": "פוסטים בפרופיל",
            "priority": "medium",
            "why": "פוסטים בפרופיל מציגים למחפשים מה קורה בעסק עכשיו, ומחברים בין החיפוש "
                   "לתוכן שאתם כבר מפרסמים ברשתות.",
            "how": [
                "פרסמו פוסט קצר בפרופיל לפחות פעם בשבוע — מבצע, מוצר חדש או עדכון.",
                "השתמשו באותם נכסים גרפיים שכבר נוצרים בתוכנית החודשית.",
                "כתבו קריאה אחת ברורה (להתקשר, להזמין, להגיע).",
            ],
        },
        {
            "id": "qa",
            "title": "שאלות ותשובות",
            "priority": "medium",
            "why": "מחפשים מקלידים שאלות בפרופיל. תשובה שלכם עדיפה על ניחוש של מישהו אחר.",
            "how": [
                "רשמו את 5 השאלות שהכי הרבה אנשים שואלים בטלפון, ופרסמו אותן כשאלות עם תשובה.",
                "אפשר לפרסם שאלה ולענות עליה בעצמכם — זה מותר ומקובל.",
                "ענו גם לשאלות של מחפשים אחרים, ולא רק לאלה שאתם כתבתם.",
            ],
        },
        {
            "id": "reviews",
            "title": "ביקורות",
            "priority": "critical",
            "why": "הביקורות הן מה שרוב המחפשים קוראים לפני שהם יוצרים קשר. הן גם אות אמיתי "
                   "לגוגל על העסק.",
            "how": [
                "בקשו ביקורת מיד אחרי רגע טוב — סוף תיקון, סוף טיפול, מסירה.",
                "בקשו בפנים או בוואטסאפ עם קישור ישיר לטופס הביקורת של הפרופיל.",
                "אל תכתבו ביקורות בעצמכם ואל תקנו ביקורות — גוגל מסננת אותן, והנזק גדול מהתועלת.",
            ],
        },
        {
            "id": "reviews_reply",
            "title": "להגיב לכל ביקורת",
            "priority": "high",
            "why": "תגובה עניינית, כולל לביקורת שלילית, היא מה שמראה למי שקורא שהעסק אמיתי.",
            "how": [
                "הגיבו לכל ביקורת בתוך כמה ימים, בקצרה ובלי להתווכח.",
                "בביקורת שלילית: הכירו בבעיה, אמרו מה תעשו, והעבירו את ההמשך לשיחה פרטית.",
                "אל תבקשו מגולשים להסיר ביקורת שלילית כתנאי לשירות.",
            ],
        },
        {
            "id": "insights",
            "title": "נתונים אמיתיים על החיפושים סביבכם",
            "priority": "high",
            "why": "שני המקומות היחידים שבהם יש נתוני חיפוש אמיתיים של העסק שלכם הם הפרופיל "
                   "עצמו ו-Search Console. אין לנו נפחי חיפוש, ואנחנו לא ממציאים אותם.",
            "how": [
                "פתחו את 'ביצועים' בפרופיל וראו אילו חיפושים הביאו אליו אנשים.",
                "חברו את Search Console באפליקציה כדי לראות את השאילתות שהאתר כבר מופיע בהן.",
                "הביאו לכאן את מה שמצאתם — זה מה שיהפוך את הקמפיין למדויק.",
            ],
        },
    ]

    notes = [
        "הפרופיל העסקי בגוגל הוא משטח חינמי: אין עלות מדיה, אין מכרז, ואין תשלום לגוגל.",
        "אין לנו גישה לפרופיל שלכם, ואנחנו לא יודעים אם הוא קיים או מאומת. זו רשימת "
        "פעולות, לא דוח מצב.",
        "אם הפרופיל כבר קיים ומאומת — התחילו מהקטגוריה, השעות, התמונות והביקורות; "
        "אלה מה שמשפיע ישירות על מי שמגיע אליכם.",
        "אין כאן נפחי חיפוש ואין דירוג מובטח. אנחנו לא מפרסמים מספרים שלא פורסמו.",
    ]
    if not is_local:
        notes.append(
            "העסק הוגדר כעסק אונליין, ולכן הפרופיל פחות קריטי מאתר ותוכן — אבל הוא עדיין "
            "חינמי, ולכן אין סיבה לוותר עליו."
        )
    if location:
        notes.append(f"המיקום שרשמתם ({location}) הוא מה שקובע לאיזה אזור הפרופיל יוצג.")

    return {
        "title": "פרופיל עסק בגוגל (Google Business Profile)",
        "summary": (
            "לפני שמשלמים לגוגל על קליקים, כדאי לסדר את המשטח החינמי: הפרופיל העסקי בגוגל. "
            "הוא מה שמופיע כשמחפשים את שם העסק, והוא מה שמאפשר לבקש ביקורות."
        ),
        "free": True,
        "is_local": is_local,
        "suggested_category_hint": plan.industry_label,
        "steps": steps,
        "notes": notes,
    }


# --- prompt block --------------------------------------------------------------------

def prompt_block(plan: GooglePlan) -> str:
    """The compact Google block for the monthly plan prompt.

    Small on purpose: this is a signal that search promotion exists and what it costs,
    not a second strategy document. It carries the same refusal as the cost model — no
    search volumes exist here, so none may appear.
    """
    industry_line = f"תחום שזוהה לטבלת המחירים: {plan.industry_label}"
    if plan.matched_keywords:
        industry_line += f" (מילות מפתח שזוהו: {', '.join(plan.matched_keywords[:4])})"

    if plan.cpc_range:
        cpc_line = f"טווח CPC לתחום: {plan.cpc_range[0]:g}-{plan.cpc_range[1]:g} ₪ לקליק"
    else:
        cpc_line = "טווח CPC לתחום: לא ידוע"

    lines = [industry_line, cpc_line]
    if plan.expected_clicks:
        lines.append(f"טווח קליקים מהתקציב ({plan.monthly_budget_ils:,} ₪): "
                     f"{plan.expected_clicks[0]:,}-{plan.expected_clicks[1]:,}")
    if plan.conversion_rate_range:
        lines.append(
            f"שיעור המרה ({unit_label(plan.conversion_unit)}) במגזר {plan.sector_label}: "
            f"{plan.conversion_rate_range[0] * 100:.1f}%-{plan.conversion_rate_range[1] * 100:.1f}%"
            + (
                f" · טווח המרות צפוי: {plan.expected_conversions[0]:,}-{plan.expected_conversions[1]:,} בחודש"
                if plan.expected_conversions
                else ""
            )
        )
    else:
        lines.append(
            "אין שיעור המרה שפורסם למגזר הזה — אסור להמציא מספר המרות או עלות לפנייה בגוגל."
        )
    if plan.minimum_viable_budget:
        lines.append(
            f"תקציב מינימום שפורסם למגזר: {plan.minimum_viable_budget[0]:,}-{plan.minimum_viable_budget[1]:,} ₪"
        )
    lines.append(
        "ניהול 15%-20% מתקציב המדיה או 2,000-8,000 ₪ בחודש, והקמה 1,500-4,000 ₪ חד-פעמית — "
        "הצג אותם כשורה נפרדת, הניהול אינו כלול בתקציב"
    )
    lines.append(
        f"גוגל צריך {LEARNING_CONVERSIONS_PER_MONTH[0]}-{LEARNING_CONVERSIONS_PER_MONTH[1]} "
        "המרות בחודש כדי ללמוד"
    )
    lines.append("המשטח החינמי שרלוונטי לעסק מקומי: פרופיל עסק בגוגל (ביקורות, שעות, תמונות, פוסטים)")

    warning_block = ""
    if plan.warnings:
        warning_block = "\nאזהרות שחייבות להופיע בתוכנית אם היא מזכירה גוגל:\n" + "\n".join(
            f"- {w}" for w in plan.warnings
        )

    return (
        "חיפוש בגוגל (Google Ads) — טווחים שפורסמו, לא הערכות:\n"
        + "\n".join(f"- {line}" for line in lines)
        + warning_block
        + "\nחובה: אין לנו נפחי חיפוש (אין גישה ל-Keyword Planner). אסור להמציא מספר חיפושים "
        "חודשי, נפח, CPC או שיעור המרה, ואסור להמציא נתוני Search Console.\n"
        "אם החיפוש הממומן מתאים לעסק — שלב אותו בתוכנית החודשית בערוץ נפרד מגוגל, עם "
        "התקציב שהוא גוזל מהערוצים האחרים. אם הוא לא מתאים (למשל קהל שאינו מחפש, או תקציב "
        "מתחת למינימום) — כתוב זאת במפורש והצע את החלופה. המקור ממליץ על מיקס, לא על ערוץ אחד."
    )
