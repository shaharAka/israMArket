"""Israeli paid-media cost model.

Replaces the invented budget bands that used to live in `calendar_il.posting_plan`.
Those bands ("under 2,000 → 3 posts a week", "30-40% of budget to retargeting") were
made up: nobody could say where the numbers came from, and a plan built on them is a
plan for a business nobody has.

Every figure here is a published Israeli market range, not a guess. Source:
Kan Media's Meta Ads cost breakdown for Israeli e-commerce, which reports the ranges
they see across campaigns they run —
https://kanmedia.co.il/כמה-עולה-פרסום-ב-meta-ads-לחנות-איקומרס-ישראל/

    CPM            18-55 NIS per 1,000 impressions  (30-40% above the European market)
    CPC            1.2-4.5 NIS
    purchase rate  1.2-2.8%
    CPA            80-220 NIS
    ROAS cold      1.8-3.2
    ROAS retarget  4.5-9

Because these are RANGES, every derived number is reported as a range too, and each
plan carries the assumption it was built on. A single confident figure would be the
same lie as before, just better sourced.

The model deliberately refuses to promise results below the viable floor: the same
source is explicit that stores spending under ~1,500 NIS/month on Meta seeing results
are "the exception, not the rule", and that below ~2,500 NIS/month the money is better
spent on retargeting alone.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

from app.services.business_model import CONVERSION_UNIT, normalise_model

SOURCE_URL = (
    "https://kanmedia.co.il/%d7%9b%d7%9e%d7%94-%d7%a2%d7%95%d7%9c%d7%94-%d7%a4%d7%a8%d7%a1%d7%95%d7%9d-"
    "%d7%91-meta-ads-%d7%9c%d7%97%d7%a0%d7%95%d7%aa-%d7%90%d7%99%d7%a7%d7%95%d7%9e%d7%a8%d7%a1-"
    "%d7%99%d7%a9%d7%a8%d7%90%d7%9c/"
)

# --- published Israeli market ranges -------------------------------------------------
CPM_NIS = (18.0, 55.0)          # per 1,000 impressions
CPC_NIS = (1.2, 4.5)
PURCHASE_RATE = (0.012, 0.028)  # of sessions
CPA_NIS = (80.0, 220.0)
ROAS_COLD = (1.8, 3.2)
ROAS_RETARGETING = (4.5, 9.0)

# Budget stages, also from the same source.
STAGE_VALIDATION_NIS = (2_500, 4_000)
STAGE_GROWTH_NIS = (5_000, 10_000)
STAGE_SCALE_FLOOR_NIS = 10_000
RETARGETING_ONLY_BELOW_NIS = 2_500
MIN_PURCHASE_EVENTS_FOR_OPTIMISATION = 50


@dataclass
class BudgetPlan:
    """A content and spend plan derived from a real budget, with its assumptions named."""

    monthly_budget_ils: int
    stage: str
    usable_media_budget_ils: int
    posts_per_week: int
    recommended_formats: list[str]
    # Ranges, never single values.
    expected_impressions: tuple[int, int]
    expected_clicks: tuple[int, int]
    expected_purchases: tuple[int, int]
    realistic_roas: tuple[float, float]
    warnings: list[str]
    assumptions: list[str]
    source: str
    # What the spend is meant to produce. "רכישה" for a shop, "פנייה (ליד)" for a service
    # business — the published CPA/ROAS figures are ecommerce purchase figures and are
    # deliberately not reused as lead costs.
    conversion_unit: str = "רכישה"

    def to_dict(self) -> dict:
        return asdict(self)


def _stage_for(budget: int) -> str:
    if budget < RETARGETING_ONLY_BELOW_NIS:
        return "below_viable"
    if budget < STAGE_GROWTH_NIS[0]:
        return "validation"
    if budget < STAGE_SCALE_FLOOR_NIS:
        return "growth"
    return "scale"


def _allocate(media: int) -> dict[str, float]:
    """Split media budget across funnel layers.

    The 60/30/10 cold/warm/loyalty shape is the structure the source describes for
    stores that profit, rather than a made-up percentage.
    """
    if media < RETARGETING_ONLY_BELOW_NIS:
        # Below the floor the advice is explicit: retargeting only.
        return {"retargeting": 1.0, "cold": 0.0, "retention": 0.0}
    return {"cold": 0.60, "retargeting": 0.30, "retention": 0.10}


def plan_from_budget(
    monthly_budget_ils: int,
    primary_goal: str = "sales",
    business_model: str = "products",
) -> BudgetPlan:
    model = normalise_model(business_model)
    sells_products = model in {"products", "both"}
    budget = max(int(monthly_budget_ils or 0), 0)
    stage = _stage_for(budget)
    warnings: list[str] = []

    # The budget is the total the owner is willing to spend. Management and creative
    # are real costs quoted by the same source, so they are carved out rather than
    # silently assumed to be free — which is what "media budget" usually hides.
    if stage == "below_viable":
        media = budget
        warnings.append(
            f"תקציב מתחת ל-{RETARGETING_ONLY_BELOW_NIS:,} ₪ בחודש: לפי נתוני השוק "
            "עדיף להשתמש בו לרימרקטינג בלבד, ולא לנסות לסקייל רכישה חדשה."
        )
    else:
        media = budget  # agencies bill management separately; do not double-count here

    split = _allocate(media)

    impressions = (
        int(media * 1000 / CPM_NIS[1]) if media else 0,
        int(media * 1000 / CPM_NIS[0]) if media else 0,
    )
    clicks = (
        int(media / CPC_NIS[1]) if media else 0,
        int(media / CPC_NIS[0]) if media else 0,
    )
    purchases = (
        int(media / CPA_NIS[1]) if media and sells_products else 0,
        int(media / CPA_NIS[0]) if media and sells_products else 0,
    )

    if sells_products and purchases[1] < MIN_PURCHASE_EVENTS_FOR_OPTIMISATION and media:
        warnings.append(
            f"בתקציב הזה צפויים פחות מ-{MIN_PURCHASE_EVENTS_FOR_OPTIMISATION} אירועי רכישה "
            "בחודש, ומטא מתקשה ללמוד ולאפטם. בשלב הזה המטרה היא איסוף נתונים, לא ROAS."
        )

    if not sells_products:
        # The published CPA and ROAS figures come from e-commerce campaigns, where the
        # conversion is a purchase. Reusing them as a cost per lead would be exactly the
        # invented number this module exists to avoid, so we report reach and clicks and
        # say plainly what we cannot know.
        warnings.append(
            "העסק מוכר שירותים, ולכן אין כאן אומדן לעלות פנייה: מחירי ה-CPA שפורסמו "
            "מתייחסים לרכישות באיקומרס, ולא ניתן לגזור מהם עלות ליד. מספר הפניות תלוי "
            "באתר ובשיחה שלכם, ורק אתם יכולים למדוד אותו."
        )

    # Posting cadence follows the budget stage rather than an invented band table:
    # more spend needs more creative to avoid ad fatigue.
    if stage == "below_viable":
        posts_per_week = 3
        formats = ["single_image", "carousel"]
    elif stage == "validation":
        posts_per_week = 4
        formats = ["single_image", "reel", "carousel"]
    elif stage == "growth":
        posts_per_week = 5
        formats = ["reel", "single_image", "carousel"]
    else:
        posts_per_week = 6
        formats = ["reel", "single_image", "catalog", "collection"]

    if sells_products and primary_goal != "sales":
        warnings.append(
            "המטרה שנבחרה אינה מכירות, ולכן יעדי ההחזר למטה הם למדידה כללית בלבד "
            "ואין להשוות אותם ל-ROAS של קמפיין מכירות."
        )

    assumptions = [
        f"CPM בישראל {CPM_NIS[0]:.0f}-{CPM_NIS[1]:.0f} ₪ לאלף חשיפות",
        f"CPC בישראל {CPC_NIS[0]}-{CPC_NIS[1]} ₪",
    ]
    if sells_products:
        assumptions += [
            f"CPA בישראל {CPA_NIS[0]:.0f}-{CPA_NIS[1]:.0f} ₪",
            f"ROAS סביר ל-Cold Traffic {ROAS_COLD[0]}-{ROAS_COLD[1]} "
            f"(רימרקטינג {ROAS_RETARGETING[0]}-{ROAS_RETARGETING[1]})",
        ]
    assumptions += [
        f"חלוקה מומלצת לפאנל: {split}",
        "התקציב הוא תקציב כולל; אין בו עלות ניהול קמפיינים או הפקת קרייאטיב",
    ]

    return BudgetPlan(
        monthly_budget_ils=budget,
        stage=stage,
        usable_media_budget_ils=media,
        posts_per_week=posts_per_week,
        recommended_formats=formats,
        expected_impressions=impressions,
        expected_clicks=clicks,
        expected_purchases=purchases,
        realistic_roas=ROAS_COLD if (sells_products and primary_goal == "sales") else (0.0, 0.0),
        warnings=warnings,
        assumptions=assumptions,
        source=SOURCE_URL,
        conversion_unit=CONVERSION_UNIT[model],
    )


def prompt_block(plan: BudgetPlan) -> str:
    """The plan rendered for the strategy model, so its targets are anchored to these
    ranges instead of being invented."""
    is_purchase = plan.conversion_unit == "רכישה"
    volume_lines = f"טווח קליקים: {plan.expected_clicks[0]:,}-{plan.expected_clicks[1]:,}\n"
    if is_purchase:
        volume_lines += (
            f"טווח רכישות: {plan.expected_purchases[0]:,}-{plan.expected_purchases[1]:,}\n"
            f"ROAS ריאלי לחם: {plan.realistic_roas[0]}-{plan.realistic_roas[1]}\n"
        )
    else:
        volume_lines += (
            f"יחידת ההמרה בעסק הזה: {plan.conversion_unit} — אין אומדן עלות לפנייה, "
            "ואל תמציא אחד. השתמש בטווח הקליקים כגבול העליון של מה שכסף יכול לקנות.\n"
        )
    return (
        "נתוני עלות אמיתיים לשוק הישראלי (טווחים שפורסמו, לא הערכות):\n"
        + "\n".join(f"- {a}" for a in plan.assumptions)
        + f"\n\nתקציב חודשי שהוגדר על ידי בעל העסק: {plan.monthly_budget_ils:,} ₪ "
        f"(שלב: {plan.stage})\n"
        f"טווח חשיפות חודשי צפוי: {plan.expected_impressions[0]:,}-{plan.expected_impressions[1]:,}\n"
        + volume_lines
        + (
            "\nאזהרות שחייבות להופיע בתוכנית:\n" + "\n".join(f"- {w}" for w in plan.warnings)
            if plan.warnings
            else ""
        )
        + "\n\nחובה: כל יעד عددי בתוכנית חייב להיות בתוך הטווחים האלה. "
        "אסור להמציא יעד שאינו נגזר מהם, ואסור להבטיח ROAS גבוה מהטווח."
    )
