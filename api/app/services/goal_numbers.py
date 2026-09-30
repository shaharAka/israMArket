"""Onboarding v2, revision 6: setting the goal like a professional.

"Asking how many buys through the website is a success is a bit stupid. What are the
current sales? What is the average sale? Do we want to increase the average, the amount,
or what?" So /start asks where the business is today (the baseline), what is the right
thing to grow (the lever), and then shows a *calculated* 3-month target the owner can
accept or edit. This module is that calculation. It is deterministic on purpose: no
model call, so it answers in milliseconds and every number can be checked by hand.

Where each number comes from, and nothing else:

- The owner's own answers (orders, average sale, inquiries, close rate, capacity, how
  much is left from a sale). A range chip is computed at its middle (an open top range
  at its floor, as the budget does) and the text says "כ-".
- The published Israeli cost ranges already in the product: Meta in `cost_model`
  (Kan Media: CPM, CPC, cost per purchase for Israeli e-commerce) and Google in
  `google_cost` (Rulers: CPC by industry, conversion rate by sector, minimum budgets,
  learning thresholds, fees). Their sources travel with every figure.
- Planning assumptions where no published number exists (how much a bundle lifts the
  average sale, how many more inquiries a faster reply closes). Each one is conservative,
  labelled "הנחת עבודה" in the text, and never presented as a benchmark.

Which market figure applies: a shop that sells online is priced on Meta (the source is
Israeli e-commerce on Meta, and its cost per purchase is published); a service business
or a shop that wants people in the store is priced on Google search (the source publishes
a click price per industry and a conversion rate per sector). When the industry is not in
the table the general click price is used and the text says so; when the sector has no
published conversion rate there is no results estimate at all, only clicks.

The budget is the money for the ads themselves ("זה הסכום לפרסום עצמו", as the budget
screen says): management and setup are not taken out of it, they are named separately.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.services import cost_model, google_cost
from app.services.calendar_il import GREGORIAN_MONTHS

CAVEAT_HE = "טווח לתכנון, לא הבטחה."

META_SOURCE = {"title": "Kan Media: כמה עולה פרסום באינסטגרם ובפייסבוק לחנות בישראל", "url": cost_model.SOURCE_URL}
GOOGLE_SOURCE = {"title": google_cost.SOURCE_TITLE, "url": google_cost.SOURCE_URL}

# --- the baseline: chips, bounds, labels -------------------------------------------------

# Range chips per numeric answer: key -> (low, high). `None` high = "and more".
RANGES: dict[str, dict[str, tuple[float, float | None]]] = {
    "orders_month": {"lt20": (0, 20), "20-50": (20, 50), "50-200": (50, 200), "gt200": (200, None)},
    "avg_order_ils": {"lt100": (0, 100), "100-300": (100, 300), "300-1000": (300, 1000), "gt1000": (1000, None)},
    "inquiries_month": {"lt5": (0, 5), "5-15": (5, 15), "15-40": (15, 40), "gt40": (40, None)},
    "deal_value_ils": {"lt2k": (0, 2000), "2k-10k": (2000, 10000), "10k-30k": (10000, 30000), "gt30k": (30000, None)},
    "capacity_more": {"none": (0, 0), "1-2": (1, 2), "3-5": (3, 5), "gt5": (5, None)},
    # Percent of inquiries that become clients. "רובן" is read as 7 of 10: the chip's own
    # meaning ("most"), taken at its cautious end.
    "close_rate": {"1of10": (10, 10), "3of10": (30, 30), "half": (50, 50), "most": (70, 70)},
    "margin_pct": {"m20": (20, 20), "m40": (40, 40), "m60": (60, None)},
}
# Answers that are a choice, not a quantity. A number (percent) is also accepted.
CATEGORIES: dict[str, tuple[str, ...]] = {
    "online_share": ("mostly_online", "half", "mostly_store"),
    "returning": ("few", "half", "most"),
}
BOUNDS: dict[str, tuple[float, float]] = {
    "orders_month": (0, 100_000),
    "avg_order_ils": (1, 1_000_000),
    "online_share": (0, 100),
    "returning": (0, 100),
    "inquiries_month": (0, 100_000),
    "close_rate": (0, 100),
    "deal_value_ils": (1, 10_000_000),
    "capacity_more": (0, 10_000),
    "margin_pct": (1, 95),
}
FIELD_HE = {
    "orders_month": "הזמנות בחודש",
    "avg_order_ils": "סכום ממוצע לקנייה",
    "online_share": "כמה מהמכירות באתר",
    "returning": "כמה מהקונים חוזרים",
    "inquiries_month": "פניות בחודש",
    "close_rate": "כמה מהפניות נסגרות",
    "deal_value_ils": "שווי ממוצע של לקוח",
    "capacity_more": "כמה לקוחות נוספים אפשר לקבל",
    "margin_pct": "כמה נשאר לכם מכל מכירה",
}
UNKNOWN = "unknown"


def _check(field: str, value: Any) -> Any:
    """A range/choice key, "unknown", or a number inside the field's bounds."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if isinstance(value, bool):
        raise ValueError(f"{FIELD_HE[field]}: בחרו מהאפשרויות או כתבו מספר.")
    keys = set(RANGES.get(field, {})) | set(CATEGORIES.get(field, ())) | {UNKNOWN}
    if isinstance(value, str):
        text = value.strip()
        if text in keys:
            return text
        cleaned = text.replace(",", "").replace("₪", "").replace("%", "").strip()
        try:
            value = float(cleaned)
        except ValueError:
            raise ValueError(f"{FIELD_HE[field]}: בחרו מהאפשרויות או כתבו מספר.") from None
    if not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{FIELD_HE[field]}: בחרו מהאפשרויות או כתבו מספר.")
    low, high = BOUNDS[field]
    if not low <= value <= high:
        raise ValueError(f"{FIELD_HE[field]}: מספר בין {low:,.0f} ל-{high:,.0f}.")
    return int(value) if float(value).is_integer() else round(float(value), 2)


class DraftBaseline(BaseModel):
    """"איפה העסק היום". Every answer optional; each a chip key, "unknown" or a number."""

    model_config = ConfigDict(extra="ignore")

    orders_month: int | float | str | None = None
    avg_order_ils: int | float | str | None = None
    online_share: int | float | str | None = None
    returning: int | float | str | None = None
    inquiries_month: int | float | str | None = None
    close_rate: int | float | str | None = None
    deal_value_ils: int | float | str | None = None
    capacity_more: int | float | str | None = None
    margin_pct: int | float | str | None = None

    @field_validator("*", mode="before")
    @classmethod
    def _value(cls, value: Any, info) -> Any:
        return _check(info.field_name, value)


# --- the lever -------------------------------------------------------------------------------

LEVERS: dict[str, dict] = {
    "new_customers": {
        "models": {"products", "services", "both"},
        "name_he": {"products": "יותר לקוחות חדשים", "services": "יותר לקוחות חדשים"},
        "when_he": {
            "products": "נכון כשכל קנייה משאירה מספיק כדי לשלם על פרסום.",
            "services": "נכון כשיש מקום, ורוב הפניות כבר נסגרות.",
        },
    },
    "bigger_basket": {
        "models": {"products", "services", "both"},
        "name_he": {"products": "קנייה ממוצעת גדולה יותר", "services": "עסקה ממוצעת גדולה יותר"},
        "when_he": {
            "products": "נכון כשרוב הקונים לוקחים מוצר אחד וזהו.",
            "services": "נכון כשהיומן מלא: חבילה או מחיר, לא עוד פניות.",
        },
    },
    "returning": {
        "models": {"products", "services", "both"},
        "name_he": {"products": "לקוחות שחוזרים יותר", "services": "לקוחות שחוזרים וממליצים"},
        "when_he": {
            "products": "נכון כשרוב הקונים קונים פעם אחת.",
            "services": "נכון כשלקוחות מרוצים יכולים לחזור או להמליץ.",
        },
    },
    "close_more": {
        "models": {"services", "both"},
        "name_he": {"products": "לסגור יותר מהפניות", "services": "לסגור יותר מהפניות"},
        "when_he": {
            "products": "נכון כשמגיעות פניות, אבל מעט מהן נסגרות.",
            "services": "נכון כשמגיעות פניות, אבל מעט מהן נסגרות.",
        },
    },
    "fill_quiet": {
        "models": {"products", "services", "both"},
        "name_he": {"products": "למלא את החודשים השקטים", "services": "למלא את החודשים השקטים"},
        "when_he": {
            "products": "נכון כשיש כל שנה חודשים חלשים קבועים.",
            "services": "נכון כשיש כל שנה חודשים חלשים קבועים.",
        },
    },
}
# The plan's main measure for each lever (onboarding_draft.KPI_OPTIONS). The two levers
# that bring more people use the model's natural measure (orders, visits, inquiries).
LEVER_KPI = {"bigger_basket": "avg_order", "returning": "repeat_customers", "close_more": "close_rate"}


def _side(model: str) -> str:
    """Services ask the services questions; a shop, and "both", ask the shop's."""
    return "services" if model == "services" else "products"


def levers_for(model: str) -> list[dict]:
    side = _side(model)
    return [
        {"key": key, "name_he": spec["name_he"][side], "when_he": spec["when_he"][side]}
        for key, spec in LEVERS.items()
        if model in spec["models"]
    ]


def lever_name(key: str, model: str) -> str:
    spec = LEVERS.get(key)
    return spec["name_he"][_side(model)] if spec else ""


class DraftLever(BaseModel):
    """"מה הכי נכון להגדיל": one primary lever, an optional secondary one."""

    model_config = ConfigDict(extra="ignore")

    primary: str = Field(max_length=40)
    secondary: str | None = Field(default=None, max_length=40)

    @field_validator("primary", "secondary")
    @classmethod
    def _key(cls, value: str | None) -> str | None:
        if value in (None, ""):
            return None
        if value not in LEVERS:
            raise ValueError("בחרו מה להגדיל מהרשימה.")
        return value

    @model_validator(mode="after")
    def _distinct(self) -> "DraftLever":
        if self.primary is None:
            raise ValueError("בחרו מה להגדיל מהרשימה.")
        if self.secondary == self.primary:
            self.secondary = None
        return self


TARGET_KINDS = (
    "orders", "inquiries", "clients", "avg_order", "deal_value", "repeat_orders", "close_rate", "qualitative",
)


class DraftTarget(BaseModel):
    """"היעד ל-3 חודשים", as the owner accepted or edited it.

    `value_min`/`value_max` are the increase over today (e.g. +9 to +25 orders a month),
    in `unit_he`. A qualitative target (no budget or no baseline) has no values, only
    `text_he`. Replaces `success.target` (still read for old drafts)."""

    model_config = ConfigDict(extra="ignore")

    kind: str = Field(max_length=30)
    value_min: float | None = None
    value_max: float | None = None
    unit_he: str = Field(default="", max_length=60)
    text_he: str = Field(default="", max_length=300)
    accepted: bool = False
    edited_by_owner: bool = False

    @field_validator("kind")
    @classmethod
    def _kind(cls, value: str) -> str:
        if value not in TARGET_KINDS:
            raise ValueError("היעד: סוג לא מוכר. בחרו שוב את היעד.")
        return value

    @field_validator("value_min", "value_max", mode="before")
    @classmethod
    def _number(cls, value: Any) -> Any:
        if value is None or value == "":
            return None
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError("היעד: כתבו מספר.")
        if not 0 <= value <= 10_000_000:
            raise ValueError("היעד: מספר בין 0 ל-10,000,000.")
        return value

    @field_validator("unit_he", "text_he")
    @classmethod
    def _text(cls, value: str) -> str:
        return re.sub(r"[\x00-\x1f\x7f]", "", re.sub(r"\s+", " ", value or "")).strip()

    @model_validator(mode="after")
    def _order(self) -> "DraftTarget":
        if self.kind != "qualitative":
            if self.value_min is None and self.value_max is None:
                raise ValueError("היעד: כתבו לפחות מספר אחד.")
            if self.value_min is None:
                self.value_min = self.value_max
            if self.value_max is None:
                self.value_max = self.value_min
            if self.value_min > self.value_max:
                raise ValueError("היעד: המספר הראשון צריך להיות קטן מהשני.")
        return self


# --- arithmetic and Hebrew numbers ---------------------------------------------------------


def _half_up(x: float) -> int:
    return int(math.floor(x + 0.5))


def _n(x: float) -> str:
    """7,200 · 1.2 · 444: integers with commas, one decimal only below 10."""
    if abs(x) < 10 and not float(x).is_integer() and abs(x - _half_up(x)) >= 0.05:
        return f"{x:.1f}".rstrip("0").rstrip(".")
    return f"{_half_up(x):,}"


def _rng(low: float, high: float) -> str:
    """"444-1,666": one left-to-right run (a hyphen, not a dash, keeps RTL order)."""
    return _n(low) if _n(low) == _n(high) else f"{_n(low)}-{_n(high)}"


def _ils(x: float) -> str:
    return f"{_n(x)} ₪"


def _nice(x: float) -> float:
    """Revenue for a sentence: to the nearest 100 above 1,000, the nearest 10 below."""
    if x >= 1000:
        return round(x / 100) * 100
    if x >= 100:
        return round(x / 10) * 10
    return x


def _pct(part: float, whole: float) -> int:
    return _half_up(part / whole * 100)


def _g(x: float) -> str:
    return f"{x:g}"


@dataclass
class Value:
    low: float
    high: float | None
    point: float
    exact: bool
    key: str = ""

    def label(self) -> str:
        """The number as the owner gave it: "40", "20-50", "עד 20", "יותר מ-200"."""
        if self.exact:
            return _n(self.point)
        if self.high is None:
            return f"יותר מ-{_n(self.low)}"
        if self.low == 0:
            return f"עד {_n(self.high)}"
        return _rng(self.low, self.high)


def resolve(baseline: DraftBaseline | None) -> dict[str, Value | str | None]:
    """Each answer as a Value (numbers), a category key, or None (not given / unknown)."""
    out: dict[str, Value | str | None] = {}
    data = baseline.model_dump() if baseline is not None else {}
    for field in BOUNDS:
        raw = data.get(field)
        if raw is None or raw == UNKNOWN:
            out[field] = None
        elif field in CATEGORIES and isinstance(raw, str):
            out[field] = raw
        elif isinstance(raw, str):
            low, high = RANGES[field][raw]
            point = low if high is None else (low + high) / 2
            out[field] = Value(low, high, point, exact=False, key=raw)
        else:
            out[field] = Value(float(raw), float(raw), float(raw), exact=True)
    return out


def _close_label(rate: Value) -> str:
    """"2 מתוך 10" for a round share, "25%" otherwise; the chips say it their way."""
    tenth = rate.point / 10
    return f"{_n(tenth)} מתוך 10" if float(tenth).is_integer() else f"{_n(rate.point)}%"


def _margin_label(margin: Value) -> str:
    return f"{_n(margin.point)}%" + ("" if margin.exact or margin.high is not None else " ומעלה")


# --- the budget and what it buys ----------------------------------------------------------------


def monthly_budget(draft) -> int | None:
    budget = getattr(draft, "budget", None)
    if budget is None:
        return None
    value = budget.monthly_ils()
    return value if value and value > 0 else None


def channel_for(draft) -> str:
    """Meta for a shop that sells on its site, Google search for everyone else."""
    if _side(draft.model) == "products" and draft.links.website and draft.grow_where != "store":
        return "meta"
    return "google"


@dataclass
class Paid:
    channel: str
    channel_he: str
    channel_short: str                        # "באינסטגרם ובפייסבוק" / "בגוגל", for a math line
    budget: int
    cpc: tuple[float, float]
    clicks: tuple[int, int] | None
    impressions: tuple[int, int] | None
    results: tuple[int, int] | None           # purchases (Meta) or inquiries (Google)
    cost_per_result: tuple[int, int] | None
    rate: tuple[float, float] | None          # Google: share of clicks that become inquiries
    result_he: str                            # "קניות" / "פניות"
    industry_label: str
    industry_matched: bool
    sector_label: str | None
    warnings: list[str]
    lines: list[str]                          # sourced assumptions, short
    source: dict


def paid_estimate(draft, budget: int) -> Paid:
    """What `budget` buys on the channel that fits this business (budget 0: prices only)."""
    if channel_for(draft) == "meta":
        plan = cost_model.plan_from_budget(budget, "sales", "products")
        warnings = []
        if budget and budget < cost_model.RETARGETING_ONLY_BELOW_NIS:
            warnings.append(
                f"מתחת ל-{cost_model.RETARGETING_ONLY_BELOW_NIS:,} ₪ בחודש המקור ממליץ לפרסם רק למי שכבר מכיר אתכם. "
                "לכן החודש הראשון הוא בעיקר למידה, ומכוונים לצד הנמוך של הטווח."
            )
        if budget and plan.expected_purchases[1] < cost_model.MIN_PURCHASE_EVENTS_FOR_OPTIMISATION:
            warnings.append(
                f"פחות מ-{cost_model.MIN_PURCHASE_EVENTS_FOR_OPTIMISATION} קניות בחודש: למערכת המודעות קשה ללמוד מזה, "
                "אז בהתחלה אוספים נתונים."
            )
        return Paid(
            channel="meta", channel_he="פרסום באינסטגרם ובפייסבוק", channel_short="באינסטגרם ובפייסבוק",
            budget=budget, cpc=cost_model.CPC_NIS,
            clicks=plan.expected_clicks if budget else None,
            impressions=plan.expected_impressions if budget else None,
            results=plan.expected_purchases if budget else None,
            cost_per_result=(int(cost_model.CPA_NIS[0]), int(cost_model.CPA_NIS[1])),
            rate=None, result_he="קניות", industry_label="חנויות אונליין בישראל", industry_matched=True,
            sector_label=None, warnings=warnings,
            lines=[
                f"מחיר לקליק באינסטגרם ובפייסבוק בישראל: {_g(cost_model.CPC_NIS[0])}-{_g(cost_model.CPC_NIS[1])} ₪, "
                f"ולאלף חשיפות {_g(cost_model.CPM_NIS[0])}-{_g(cost_model.CPM_NIS[1])} ₪ (Kan Media).",
                f"קנייה מפרסום עולה {_g(cost_model.CPA_NIS[0])}-{_g(cost_model.CPA_NIS[1])} ₪ (Kan Media, חנויות אונליין "
                "בישראל, בלי פילוח לפי תחום).",
            ],
            source=META_SOURCE,
        )

    presence = getattr(draft, "presence_type", None) or ("online_only" if draft.grow_where == "online" else None)
    plan = google_cost.plan_from_budget(budget, draft.business_type, draft.offerings, draft.model, presence_type=presence)
    matched = plan.industry_key != google_cost.UNMATCHED_KEY
    warnings = []
    if not matched:
        warnings.append(
            f"לא מצאנו את התחום שלכם בטבלה של המקור, אז השתמשנו במחיר הכללי שלו: "
            f"{_g(plan.cpc_range[0])}-{_g(plan.cpc_range[1])} ₪ לקליק."
        )
    if plan.conversion_rate_range is None:
        warnings.append("לתחום הזה לא פורסם כמה מהקליקים הופכים לפניות, אז אין הערכה של כמה פניות יגיעו.")
    low_min = plan.minimum_viable_budget
    if budget and low_min:
        if budget < low_min[0]:
            warnings.append(
                f"התקציב נמוך מהמינימום שפורסם ל{plan.sector_label} ({low_min[0]:,}-{low_min[1]:,} ₪). "
                "מתחת לזה גוגל לומד לאט, והתוצאות בדרך כלל חלשות."
            )
        elif budget < low_min[1]:
            warnings.append(
                f"התקציב בחלק התחתון של המינימום שפורסם ל{plan.sector_label} ({low_min[0]:,}-{low_min[1]:,} ₪). "
                "אין הרבה מקום לטעויות."
            )
    if budget and plan.expected_conversions and plan.expected_conversions[1] < google_cost.LEARNING_CONVERSIONS_PER_MONTH[0]:
        low, high = google_cost.LEARNING_CONVERSIONS_PER_MONTH
        warnings.append(f"גוגל צריך {low}-{high} פניות בחודש כדי ללמוד. החודש הראשון הוא איסוף נתונים.")
    lines = [
        f"מחיר לקליק בגוגל בתחום '{plan.industry_label}': {_g(plan.cpc_range[0])}-{_g(plan.cpc_range[1])} ₪ (רולרס)."
        if matched else
        f"מחיר לקליק בגוגל כשהתחום לא בטבלה: {_g(plan.cpc_range[0])}-{_g(plan.cpc_range[1])} ₪, הרצועה האמצעית של המקור (רולרס)."
    ]
    if plan.conversion_rate_range:
        low, high = plan.conversion_rate_range
        lines.append(f"ב{plan.sector_label}, {_g(low * 100)}%-{_g(high * 100)}% מהקליקים הופכים לפניות (רולרס).")
    lines.append(
        f"דמי ניהול, אם סוכנות מנהלת: {google_cost.MANAGEMENT_PERCENT[0] * 100:.0f}%-{google_cost.MANAGEMENT_PERCENT[1] * 100:.0f}% "
        f"מהתקציב או {google_cost.MANAGEMENT_FLAT_ILS[0]:,}-{google_cost.MANAGEMENT_FLAT_ILS[1]:,} ₪ בחודש, והקמה "
        f"{google_cost.SETUP_FEE_ILS[0]:,}-{google_cost.SETUP_FEE_ILS[1]:,} ₪. הם לא כלולים בתקציב (רולרס)."
    )
    cost = plan.cost_per_conversion if plan.cost_per_conversion and all(plan.cost_per_conversion) else None
    return Paid(
        channel="google", channel_he="פרסום בחיפוש בגוגל", channel_short="בחיפוש בגוגל",
        budget=budget, cpc=plan.cpc_range,
        clicks=plan.expected_clicks if budget else None, impressions=None,
        results=plan.expected_conversions if budget and plan.expected_conversions else None,
        cost_per_result=cost, rate=plan.conversion_rate_range, result_he="פניות",
        industry_label=plan.industry_label, industry_matched=matched, sector_label=plan.sector_label,
        warnings=warnings, lines=lines, source=GOOGLE_SOURCE,
    )


# --- the numbers of today -------------------------------------------------------------------------


def _v(base: dict, field: str) -> Value | None:
    value = base.get(field)
    return value if isinstance(value, Value) else None


def _clients(base: dict) -> float | None:
    inquiries, rate = _v(base, "inquiries_month"), _v(base, "close_rate")
    return inquiries.point * rate.point / 100 if inquiries and rate else None


def baseline_known(draft, base: dict) -> bool:
    if _side(draft.model) == "services":
        return bool(_v(base, "inquiries_month"))
    return bool(_v(base, "orders_month"))


def baseline_summary(draft, base: dict | None = None) -> str:
    """"בערך 40 הזמנות בחודש, ממוצע 180 ₪ — כ-7,200 ₪ בחודש." The arithmetic, said back."""
    base = base if base is not None else resolve(getattr(draft, "baseline", None))
    parts: list[str] = []
    if _side(draft.model) == "services":
        inquiries, rate, deal = _v(base, "inquiries_month"), _v(base, "close_rate"), _v(base, "deal_value_ils")
        capacity = _v(base, "capacity_more")
        if inquiries:
            first = f"בערך {inquiries.label()} פניות בחודש"
            if rate:
                first += f", {_close_label(rate)} נסגרות"
                clients = _clients(base)
                if deal:
                    first += f" — כ-{_n(clients)} לקוחות, כ-{_ils(_nice(clients * deal.point))} בחודש"
                else:
                    first += f" — כ-{_n(clients)} לקוחות בחודש"
            parts.append(first + ".")
        elif deal:
            parts.append(f"לקוח שווה לכם בערך {deal.label()} ₪.")
        if inquiries and deal and not rate:
            parts.append(f"לקוח שווה לכם בערך {deal.label()} ₪.")
        if capacity:
            parts.append("אין מקום ללקוחות נוספים כרגע." if capacity.high == 0
                         else f"אפשר לקבל עוד {capacity.label()} לקוחות בחודש.")
        value = deal
    else:
        orders, avg = _v(base, "orders_month"), _v(base, "avg_order_ils")
        if orders and avg:
            parts.append(f"בערך {orders.label()} הזמנות בחודש, ממוצע {avg.label()} ₪ — כ-{_ils(_nice(orders.point * avg.point))} בחודש.")
        elif orders:
            parts.append(f"בערך {orders.label()} הזמנות בחודש.")
        elif avg:
            parts.append(f"קנייה ממוצעת של בערך {avg.label()} ₪.")
        share = base.get("online_share")
        if share is not None and draft.grow_where == "both":
            if isinstance(share, Value):
                parts.append(f"כ-{_n(share.point)}% מזה באתר.")
            else:
                parts.append({"mostly_online": "רובן באתר.", "half": "בערך חצי באתר.", "mostly_store": "רובן בחנות."}[share])
        returning = base.get("returning")
        if returning is not None:
            if isinstance(returning, Value):
                parts.append(f"כ-{_n(returning.point)}% מהקונים חוזרים.")
            else:
                parts.append({"few": "מעט קונים חוזרים.", "half": "בערך חצי מהקונים חוזרים.", "most": "רוב הקונים חוזרים."}[returning])
        value = avg
    margin = _v(base, "margin_pct")
    if margin and value:
        what = "מכל לקוח" if _side(draft.model) == "services" else "מכל קנייה"
        parts.append(f"{what} נשארים לכם כ-{_ils(_nice(value.point * margin.point / 100))}.")
    elif margin:
        parts.append(f"מכל מכירה נשארים לכם כ-{_margin_label(margin)}.")
    if not parts:
        return "עוד לא יודעים כמה יש היום. נמדוד מהשבוע הראשון, וזו תהיה נקודת הפתיחה."
    if not baseline_known(draft, base):
        parts.append("את השאר נמדוד מהשבוע הראשון.")
    return " ".join(parts)


# --- unit economics ---------------------------------------------------------------------------------


def unit_economics(draft, base: dict, paid: Paid) -> tuple[str | None, str | None]:
    """(text, verdict): what one new customer is worth against what it costs to bring one.

    verdict: "pays" (even at the expensive end), "partly" (only at the cheap end), "no"
    (not on the first sale), or None when we cannot say (no margin, or no published cost)."""
    services = _side(draft.model) == "services"
    value = _v(base, "deal_value_ils" if services else "avg_order_ils")
    margin = _v(base, "margin_pct")
    cost = paid.cost_per_result
    rate = _v(base, "close_rate") if services else None

    # What bringing one costs, by the source.
    per_one: tuple[float, float] | None = None
    if cost and services and rate and rate.point > 0:
        per_one = (cost[0] * 100 / rate.point, cost[1] * 100 / rate.point)
        cost_text = (f"לפי המקור, לקוח חדש מגוגל עולה כ-{_rng(*per_one)} ₪ "
                     f"({_rng(*cost)} ₪ לפנייה, ו-{_close_label(rate)} נסגרות)")
    elif cost and services:
        cost_text = f"לפי המקור, פנייה מגוגל עולה {_rng(*cost)} ₪"
    elif cost:
        per_one = (float(cost[0]), float(cost[1]))
        cost_text = f"לפי המקור, קנייה מפרסום עולה {_rng(*cost)} ₪"
    else:
        cost_text = ""

    if value and margin:
        worth = value.point * margin.point / 100
        if services:
            head = (f"כל לקוח חדש משאיר לכם כ-{_ils(_nice(worth))} ({_ils(value.point)} × {_margin_label(margin)}). "
                    "זה המקסימום שכדאי לשלם כדי להביא לקוח.")
        else:
            head = (f"כל קנייה משאירה לכם כ-{_ils(_nice(worth))} ({_ils(value.point)} × {_margin_label(margin)}). "
                    "זה המקסימום שכדאי לשלם כדי להביא קנייה חדשה.")
        if not per_one:
            return (f"{head} {cost_text}." if cost_text else head), None
        low, high = per_one
        first = "הלקוח הראשון" if services else "הקנייה הראשונה"
        if worth >= high:
            return f"{head} {cost_text}, פחות מזה. הפרסום מחזיר את עצמו כבר על {first}, גם בצד היקר.", "pays"
        if worth >= low:
            return (f"{head} {cost_text}. בצד הזול זה משתלם, בצד היקר לא. לכן מתחילים בקטן ומודדים כמה זה עולה אצלכם.",
                    "partly")
        times = _rng(math.ceil(low / worth), math.ceil(high / worth))
        again = f"לקוח כזה חוזר {times} פעמים" if services else f"לקוח כזה קונה {times} פעמים"
        return (f"{head} {cost_text}, יותר מזה: על {first} זה הפסד. פרסום משתלם רק אם {again}.",
                "no")
    if value and cost_text and services:
        short = f"לפי המקור, לקוח חדש מגוגל עולה כ-{_rng(*per_one)} ₪" if per_one else cost_text
        return (f"{short}, ולקוח שווה לכם כ-{_ils(value.point)} במחזור. כמה נשאר לכם מכל עסקה? "
                "עם זה נגיד כמה מקסימום כדאי לשלם.", None)
    if value and cost_text:
        return f"{cost_text}. ספרו לנו כמה נשאר לכם מכל מכירה, ונגיד אם זה משתלם.", None
    return None, None


# --- the recommendation ------------------------------------------------------------------------------


def _slow_months(draft) -> list[int]:
    return list(getattr(getattr(draft, "seasons", None), "slow", []) or [])


def _months_he(months: list[int]) -> str:
    names = [GREGORIAN_MONTHS[m - 1]["he"] for m in months]
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} ו{names[-1]}"


def recommend(draft, base: dict, verdict: str | None, economics_cost: tuple[int, int] | None) -> tuple[str, str]:
    """The lever the numbers point to, and why, in one or two plain sentences."""
    services = _side(draft.model) == "services"
    slow = _slow_months(draft)
    if services:
        capacity, rate, inquiries = _v(base, "capacity_more"), _v(base, "close_rate"), _v(base, "inquiries_month")
        if capacity and capacity.high == 0:
            return "bigger_basket", "אין לכם מקום ללקוחות נוספים. הדרך לגדול היא עסקה גדולה יותר, לא עוד פניות."
        if rate and inquiries and rate.point <= 30 and draft.model in LEVERS["close_more"]["models"]:
            lift = _pct(10, rate.point) if rate.point else 0
            return "close_more", (
                f"רק {_close_label(rate)} פניות נסגרות. עוד פנייה אחת מכל 10 שנסגרת היא {lift}% יותר לקוחות, "
                "בלי לשלם על פנייה אחת נוספת."
            )
        if slow:
            return "fill_quiet", f"יש לכם חודשים שקטים ({_months_he(slow)}). שם הכי קל לגדול."
        if not inquiries:
            return "new_customers", "עוד אין לנו מספרים, אז מתחילים ממה שהכי קל למדוד: פניות חדשות."
        return "new_customers", "יש מקום ללקוחות, ורוב הפניות נסגרות. עכשיו שווה להביא עוד פניות."
    returning = base.get("returning")
    few = returning == "few" or (isinstance(returning, Value) and returning.point <= 25)
    if few:
        return "returning", "מעט קונים חוזרים. לקוח שחוזר לא עולה פרסום, ושם הכי קל לגדול."
    if verdict == "no" and economics_cost:
        avg, margin = _v(base, "avg_order_ils"), _v(base, "margin_pct")
        worth = _ils(_nice(avg.point * margin.point / 100)) if avg and margin else ""
        key = "bigger_basket" if returning == "most" else "returning"
        return key, (
            f"כל קנייה משאירה לכם כ-{worth}, וקנייה מפרסום עולה לפי המקור {_rng(*economics_cost)} ₪. "
            "קודם מרוויחים יותר מלקוחות שכבר יש."
        )
    if slow:
        return "fill_quiet", f"יש לכם חודשים שקטים ({_months_he(slow)}). שם הכי קל לגדול."
    if not _v(base, "orders_month"):
        return "new_customers", "עוד אין לנו מספרים, אז מתחילים ממה שהכי קל למדוד: לקוחות חדשים."
    return "new_customers", "כל קנייה משאירה מספיק, ויש לאן לגדול. עכשיו שווה להביא לקוחות חדשים."


# --- the target, per lever ---------------------------------------------------------------------------------


def first_month_label(today: date | None = None) -> str:
    """The plan's first month, by the quarter plan's rule (where the next 2 weeks mostly fall)."""
    middle = (today or date.today()) + timedelta(days=14)
    return GREGORIAN_MONTHS[middle.month - 1]["he"]


def headline(kind: str, low: float, high: float, unit_he: str, pct: tuple[int, int] | None = None) -> str:
    """"+9 עד +25 הזמנות בחודש (+23%-63%)"."""
    text = f"+{_n(low)} {unit_he}" if _n(low) == _n(high) else f"+{_n(low)} עד +{_n(high)} {unit_he}"
    if pct:
        text += f" (+{pct[0]}%)" if pct[0] == pct[1] else f" (+{pct[0]}%-{pct[1]}%)"
    return text


def target_text(target: DraftTarget | dict | None) -> str:
    """The owner's accepted or edited target, in one line."""
    if target is None:
        return ""
    t = target if isinstance(target, dict) else target.model_dump()
    if t.get("kind") == "qualitative" or t.get("value_min") is None:
        return (t.get("text_he") or "").strip()
    return headline(t["kind"], t["value_min"], t["value_max"], t.get("unit_he") or "")


UNITS = {
    "orders": "הזמנות בחודש",
    "inquiries": "פניות בחודש",
    "clients": "לקוחות בחודש",
    "avg_order": "₪ לקנייה ממוצעת",
    "deal_value": "₪ לעסקה ממוצעת",
    "repeat_orders": "הזמנות חוזרות בחודש",
    "close_rate": "מכל 10 פניות נסגרות",
}


def _qualitative(draft, lever: str, month: str) -> tuple[str, str]:
    """(target, first checkpoint) when there is no honest number to stand on."""
    services = _side(draft.model) == "services"
    store = not services and draft.grow_where == "store"
    if lever == "close_more":
        return ("בחודש הראשון רושמים כל פנייה ומה קרה איתה. ככה נדע כמה נסגרות, ונקבע יעד במספרים.",
                f"בסוף {month}: כמה פניות הגיעו, כמה נסגרו, ולמה השאר לא.")
    if lever == "bigger_basket":
        what = "העסקה הממוצעת" if services else "הקנייה הממוצעת"
        return (f"בחודש הראשון מודדים את {what}, ובודקים {'חבילה' if services else 'מארז או תוספת'} אחד. אחר כך קובעים יעד במספרים.",
                f"בסוף {month}: מה {what} עכשיו, ומה קרה אחרי שהצענו {'חבילה' if services else 'מארז או תוספת'}.")
    if lever == "returning":
        return ("בחודש הראשון בונים רשימת לקוחות (וואטסאפ או מועדון לקוחות) ומודדים כמה חוזרים. אחר כך קובעים יעד.",
                f"בסוף {month}: כמה לקוחות נכנסו לרשימה, וכמה מהם חזרו.")
    if lever == "fill_quiet" and _slow_months(draft):
        months = _months_he(_slow_months(draft))
        return (f"בחודשים השקטים ({months}) מתחילים להזכיר ללקוחות שלושה שבועות לפני, ומודדים מול אותו חודש בשנה שעברה.",
                f"בסוף {month}: הרשימה מוכנה, וידוע מה יוצא לקראת החודש השקט הקרוב.")
    if services:
        return ("בחודש הראשון רושמים כל פנייה ומאיפה הגיעה. זו נקודת הפתיחה, ובסוף החודש קובעים יעד במספרים.",
                f"בסוף {month}: כמה פניות הגיעו, מאיפה, וכמה נסגרו.")
    if store:
        return ("בחודש הראשון סופרים כל יום כמה לקוחות חדשים נכנסו ומאיפה שמעו עלינו. בסוף החודש קובעים יעד במספרים.",
                f"בסוף {month}: כמה לקוחות חדשים הגיעו, ומה הביא אותם.")
    return ("בחודש הראשון סופרים כמה הזמנות הגיעו מהפוסטים ומהקישור בביו. בסוף החודש קובעים יעד במספרים.",
            f"בסוף {month}: כמה הזמנות הגיעו, ומאיזה ערוץ.")


def _monthly_or_quarter(low: float, high: float, unit: str) -> tuple[float, float, str, bool]:
    """Fractions of a customer a month read badly: below 1 a month, say it for the quarter."""
    if high < 1:
        return low * 3, high * 3, unit.replace("בחודש", "ב-3 חודשים"), True
    return low, high, unit, False


def suggest(draft, today: date | None = None) -> dict:
    """`POST /public/target-suggestion`: the baseline said back, the lever we recommend,
    and a calculated 3-month target with its math, unit economics and sources."""
    today = today or date.today()
    base = resolve(getattr(draft, "baseline", None))
    services = _side(draft.model) == "services"
    budget = monthly_budget(draft)
    paid = paid_estimate(draft, budget or 0)
    economics, verdict = unit_economics(draft, base, paid)
    recommended, why = recommend(draft, base, verdict, paid.cost_per_result)
    lever = draft.lever.primary if getattr(draft, "lever", None) else recommended
    if lever not in LEVERS or draft.model not in LEVERS[lever]["models"]:
        lever = recommended
    month = first_month_label(today)

    orders, avg = _v(base, "orders_month"), _v(base, "avg_order_ils")
    inquiries, rate, deal = _v(base, "inquiries_month"), _v(base, "close_rate"), _v(base, "deal_value_ils")
    capacity = _v(base, "capacity_more")
    clients = _clients(base)

    math_he: list[str] = []
    assumptions: list[str] = []
    sources: list[dict] = []
    suggestion: dict | None = None
    budget_he: str | None = None
    uses_paid = False

    def today_line() -> str | None:
        if services and inquiries and rate:
            money = f" (כ-{_ils(_nice(clients * deal.point))})" if deal else ""
            return f"היום: {_n(inquiries.point)} פניות × {_close_label(rate)} = כ-{_n(clients)} לקוחות בחודש{money}."
        if services and inquiries:
            return f"היום: כ-{_n(inquiries.point)} פניות בחודש."
        if not services and orders and avg:
            return f"היום: {_n(orders.point)} הזמנות × {_ils(avg.point)} = כ-{_ils(_nice(orders.point * avg.point))} בחודש."
        if not services and orders:
            return f"היום: כ-{_n(orders.point)} הזמנות בחודש."
        return None

    def cost_compare() -> str | None:
        """What the alternative costs: bringing one more by paying for it (unless the unit
        economics below already say it)."""
        if not paid.cost_per_result:
            return None
        sources.append(paid.source)
        if economics:
            return None
        if services:
            return (f"לשם השוואה: פנייה חדשה מגוגל עולה לפי המקור {_rng(*paid.cost_per_result)} ₪. "
                    "לסגור פנייה שכבר הגיעה לא עולה פרסום.")
        return (f"לשם השוואה: קנייה חדשה מפרסום עולה לפי המקור {_rng(*paid.cost_per_result)} ₪. "
                "מה שמרוויחים מלקוח שכבר יש לא עולה פרסום.")

    line = today_line()
    if line:
        math_he.append(line)

    if lever in {"new_customers", "fill_quiet"} and budget and paid.clicks:
        uses_paid = True
        sources.append(paid.source)
        clicks = f"{_rng(*paid.clicks)} קליקים ({_g(paid.cpc[0])}-{_g(paid.cpc[1])} ₪ לקליק)"
        if paid.impressions:
            clicks += f", {_rng(*paid.impressions)} חשיפות"
        math_he.append(f"{_ils(budget)} {paid.channel_short} = {clicks}.")
        if paid.results is None:
            math_he.append("לתחום הזה לא פורסם כמה מהקליקים הופכים לפניות, אז אין כאן הערכה של כמה יגיעו.")
        else:
            low, high = paid.results
            if paid.channel == "meta":
                math_he.append(f"לפי {_rng(*paid.cost_per_result)} ₪ לקנייה, זה {_rng(low, high)} הזמנות נוספות בחודש.")
                kind, unit = "orders", UNITS["orders"]
                reference = orders
            else:
                share = f"{_g(paid.rate[0] * 100)}%-{_g(paid.rate[1] * 100)}%"
                math_he.append(f"{share} מהקליקים הופכים לפניות, כלומר {_rng(low, high)} פניות נוספות בחודש.")
                kind, unit = "inquiries", UNITS["inquiries"]
                reference = inquiries
                if services and rate:
                    c_low, c_high = low * rate.point / 100, high * rate.point / 100
                    capped = ""
                    if capacity is not None:
                        cap_low = capacity.low
                        cap_high = capacity.high if capacity.high is not None else math.inf
                        if c_high > cap_high or c_low > cap_low:
                            capped = f", אבל יש מקום רק לעוד {capacity.label()}"
                        c_low, c_high = min(c_low, cap_low), min(c_high, cap_high)
                    low, high = c_low, c_high
                    kind, unit, reference = "clients", UNITS["clients"], clients
                    math_he[-1] = (f"{share} מהקליקים הופכים לפניות: {_rng(*paid.results)} פניות. "
                                   f"אם {_close_label(rate)} נסגרות, כ-{_rng(*(r * rate.point / 100 for r in paid.results))} "
                                   f"לקוחות{capped}.")
            if high <= 0:
                suggestion = None
            else:
                low, high, unit, quarterly = _monthly_or_quarter(low, high, unit)
                base_value = reference.point if isinstance(reference, Value) else reference
                if quarterly and base_value:
                    base_value *= 3
                pct = (_pct(low, base_value), _pct(high, base_value)) if base_value else None
                low_r, high_r = (round(low, 1), round(high, 1)) if high < 10 else (_half_up(low), _half_up(high))
                suggestion = {"kind": kind, "min": low_r, "max": high_r, "unit_he": unit,
                              "headline_he": headline(kind, low_r, high_r, unit, pct)}
                if pct:
                    suggestion["pct_min"], suggestion["pct_max"] = pct
                    suggestion["level_he"] = f"{_rng(base_value + low_r, base_value + high_r)} {unit}"
                if lever == "fill_quiet" and _slow_months(draft):
                    suggestion["headline_he"] += f", בחודשים השקטים ({_months_he(_slow_months(draft))})"
                target_line = f"היעד: {suggestion['headline_he']}."
                math_he.append(target_line)
        assumptions += paid.lines
        assumptions.append("חלק מהקונים שמגיעים מפרסום היו מגיעים גם בלעדיו. לזה אין מספר שפורסם, אז נמדוד אצלכם.")
        assumptions.append("לא ספרנו את מה שהפוסטים יביאו בלי תשלום. זה נוסף על היעד, ונמדוד אותו בנפרד.")

    elif lever == "bigger_basket":
        value = deal if services else avg
        if value:
            d_low, d_high = max(1, _half_up(value.point * 0.05)), max(1, _half_up(value.point * 0.10))
            what = "העסקה הממוצעת" if services else "הקנייה הממוצעת"
            how = "חבילה מלאה יותר או מחיר מעודכן ללקוחות חדשים" if services else "מארז, מוצר משלים או משלוח חינם מעל סכום"
            per = "לעסקה" if services else "לקנייה"
            math_he.append(f"הנחת עבודה: {how} מגדילים את {what} ב-5%-10%.")
            step = f"{_ils(value.point)} × 5%-10% = עוד {_rng(d_low, d_high)} ₪ {per}"
            count = clients if services else (orders.point if orders else None)
            if count:
                noun = "לקוחות" if services else "הזמנות"
                step += f". על {_n(count)} {noun} בחודש: עוד {_rng(count * d_low, count * d_high)} ₪ בחודש"
            math_he.append(step + ".")
            kind = "deal_value" if services else "avg_order"
            suggestion = {"kind": kind, "min": d_low, "max": d_high, "unit_he": UNITS[kind], "pct_min": 5, "pct_max": 10,
                          "headline_he": headline(kind, d_low, d_high, UNITS[kind], (5, 10)),
                          "level_he": f"{_rng(value.point + d_low, value.point + d_high)} ₪ {per}"}
            assumptions.append(f"הנחת עבודה: {how} מגדילים את {what} ב-5%-10%. זה לא נתון שפורסם, "
                               "אלא נקודת פתיחה זהירה. נעדכן אותה אחרי החודש הראשון.")
            compare = cost_compare()
            if compare:
                math_he.append(compare)

    elif lever == "returning":
        count = clients if services else (orders.point if orders else None)
        if count:
            unit = "לקוחות חוזרים בחודש" if services else UNITS["repeat_orders"]
            low, high, unit, quarterly = _monthly_or_quarter(count * 0.05, count * 0.10, unit)
            if high >= 1:
                how = ("בקשה מסודרת להמלצה ותזכורת ללקוחות קודמים" if services
                       else "תזכורת קבועה בוואטסאפ או מועדון לקוחות")
                math_he.append(f"הנחת עבודה: {how} מחזירים עוד 5-10 מכל 100 לקוחות.")
                low_r, high_r = (round(low, 1), round(high, 1)) if high < 10 else (_half_up(low), _half_up(high))
                noun = "לקוחות" if services else "הזמנות"
                period = "ב-3 חודשים" if quarterly else "בחודש"
                amount = count * 3 if quarterly else count
                step = f"{_n(amount)} {noun} {period} × 5%-10% = עוד {_rng(low_r, high_r)} {unit}"
                value = deal if services else avg
                if value:
                    step += f", כ-{_rng(low * value.point, high * value.point)} ₪"
                math_he.append(step + ".")
                kind = "clients" if services else "repeat_orders"
                pct = (_pct(low_r, amount), _pct(high_r, amount))
                suggestion = {"kind": kind, "min": low_r, "max": high_r, "unit_he": unit,
                              "pct_min": pct[0], "pct_max": pct[1],
                              "headline_he": headline(kind, low_r, high_r, unit, pct)}
                assumptions.append(f"הנחת עבודה: {how} מחזירים עוד 5-10 מכל 100 לקוחות. זה לא נתון שפורסם, "
                                   "ונעדכן אותו לפי מה שנמדוד אצלכם.")
                compare = cost_compare()
                if compare:
                    math_he.append(compare)

    elif lever == "close_more" and inquiries and rate:
        p = rate.point
        new_low, new_high = min(p + 10, 90), min(p + 20, 90)
        d_low, d_high = inquiries.point * (new_low - p) / 100, inquiries.point * (new_high - p) / 100
        capped = ""
        if capacity is not None:
            cap_high = capacity.high if capacity.high is not None else math.inf
            if d_high > cap_high or d_low > capacity.low:
                capped = f" יש לכם מקום לעוד {capacity.label()} לקוחות בחודש, וזו התקרה."
            d_low, d_high = min(d_low, capacity.low), min(d_high, cap_high)
        if d_high > 0:
            math_he.append("הנחת עבודה: מענה באותו יום ומעקב אחרי כל הצעה סוגרים עוד 1-2 מכל 10 פניות.")
            q_low, q_high = d_low * 3, d_high * 3
            money = f" (כ-{_rng(q_low * deal.point, q_high * deal.point)} ₪)" if deal else ""
            step_low, step_high = (new_low - p) / 10, (new_high - p) / 10
            math_he.append(f"{_n(inquiries.point)} פניות × עוד {_rng(step_low, step_high)} מכל 10 = עוד {_rng(d_low, d_high)} "
                           f"לקוחות בחודש, כ-{_rng(_half_up(q_low), _half_up(q_high))} ב-3 החודשים{money}.{capped}")
            levels = f"{_rng(new_low / 10, new_high / 10)} מתוך 10 (היום {_n(p / 10)})"
            pct = (_pct(d_low, clients), _pct(d_high, clients)) if clients else None
            suggestion = {"kind": "close_rate", "min": round(step_low, 1), "max": round(step_high, 1),
                          "unit_he": UNITS["close_rate"], "level_he": levels,
                          "headline_he": headline("close_rate", step_low, step_high, UNITS["close_rate"])}
            if pct:
                suggestion["pct_min"], suggestion["pct_max"] = pct
                suggestion["headline_he"] += f" (+{pct[0]}%-{pct[1]}% לקוחות)" if pct[0] != pct[1] else f" (+{pct[0]}% לקוחות)"
            assumptions.append("הנחת עבודה: מענה מהיר ומעקב מסודר סוגרים עוד 1-2 מכל 10 פניות. זה לא נתון שפורסם, "
                               "ונעדכן אותו אחרי החודש הראשון.")
            compare = cost_compare()
            if compare:
                math_he.append(compare)

    # What the budget does when it is not the lever's own engine.
    if budget and lever not in {"new_customers", "fill_quiet"} and paid.clicks:
        if paid.results and services and rate:
            c_low, c_high = (r * rate.point / 100 for r in paid.results)
            room = ""
            if capacity is not None and capacity.high is not None and c_high > capacity.high:
                room = (f" זה יותר ממה שיש לכם מקום (עוד {capacity.label()} בחודש), אז קודם סוגרים יותר, "
                        "ואחר כך מגדילים את הפרסום.")
            budget_he = (f"{_ils(budget)} בחודש ב{paid.channel_he} יכולים להביא לפי המקור {_rng(*paid.results)} פניות נוספות. "
                         f"אם {_close_label(rate)} נסגרות, זה כ-{_rng(c_low, c_high)} לקוחות.{room}")
        elif paid.results:
            budget_he = (f"{_ils(budget)} בחודש ב{paid.channel_he} יכולים להביא לפי המקור {_rng(*paid.results)} "
                         f"{'הזמנות' if paid.channel == 'meta' else 'פניות'} מלקוחות חדשים. בתוכנית הזו הם הולכים קודם "
                         "כול למי שכבר קנה או ביקר אצלכם.")
        else:
            budget_he = f"{_ils(budget)} בחודש ב{paid.channel_he} קונים לפי המקור {_rng(*paid.clicks)} קליקים."
        uses_paid = True
        if paid.source not in sources:
            sources.append(paid.source)
        assumptions += paid.lines

    if uses_paid:
        assumptions += paid.warnings
        budget_obj = getattr(draft, "budget", None)
        if budget_obj is not None and budget_obj.exact_ils is None:
            assumptions.append(f"חישבנו לפי כ-{_ils(budget)} בחודש, האמצע של הטווח שבחרתם.")
    if any(isinstance(v, Value) and not v.exact and v.high != v.low for v in base.values()):
        assumptions.append("כשבחרתם טווח, חישבנו לפי האמצע שלו.")

    if economics and paid.cost_per_result and paid.source not in sources:
        sources.append(paid.source)

    if suggestion is None:
        qualitative, checkpoint = _qualitative(draft, lever, month)
        if lever in {"new_customers", "fill_quiet"} and not budget:
            math_he.append("בלי תקציב פרסום אין מספר אמיתי לכמה לקוחות חדשים יגיעו. לא ננחש: נמדוד חודש, ואז נקבע יעד.")
        if services and capacity is not None and capacity.high == 0 and lever in {"new_customers", "close_more", "fill_quiet"}:
            qualitative = "אין מקום ללקוחות נוספים כרגע, אז לא נכוון ליותר לקוחות. עדיף להגדיל את העסקה הממוצעת."
    else:
        qualitative = None
        checkpoint = (f"בסוף {month}: בודקים כמה נוסף מול היעד, ומחליטים אם להמשיך, לשנות או להגדיל.")

    unique_sources: list[dict] = []
    for item in sources:
        if item not in unique_sources:
            unique_sources.append(item)

    out = {
        "baseline_summary_he": baseline_summary(draft, base),
        "baseline_known": baseline_known(draft, base),
        "recommended_lever": recommended,
        "lever_hint_he": why,
        "lever": lever,
        "lever_name_he": lever_name(lever, draft.model),
        "levers": levers_for(draft.model),
        "suggestion": suggestion,
        "math_he": math_he[:4],
        "assumptions_he": list(dict.fromkeys(assumptions)),
        "sources": unique_sources,
        "organic_only": not budget,
        "first_checkpoint_he": checkpoint,
        "caveat_he": CAVEAT_HE,
        "payback": verdict,
    }
    if qualitative:
        out["qualitative_he"] = qualitative
    if budget_he:
        out["budget_he"] = budget_he
    if economics:
        out["unit_economics_he"] = economics
    return out


def numbers_view(draft, today: date | None = None) -> dict:
    """The plan's "המספרים": the suggestion plus the owner's own target, as the plan shows it."""
    result = suggest(draft, today)
    target = getattr(draft, "target", None)
    suggestion = result.get("suggestion")
    view: dict = {
        "baseline_he": result["baseline_summary_he"],
        "baseline_known": result["baseline_known"],
        "lever": {"key": result["lever"], "name_he": result["lever_name_he"],
                  "recommended_key": result["recommended_lever"], "recommended_he": result["lever_hint_he"],
                  "recommended_name_he": lever_name(result["recommended_lever"], draft.model)},
        "math_he": result["math_he"],
        "assumptions_he": result["assumptions_he"],
        "sources": result["sources"],
        "organic_only": result["organic_only"],
        "first_checkpoint_he": result["first_checkpoint_he"],
        "caveat_he": result["caveat_he"],
    }
    if target is not None and (target.accepted or target.edited_by_owner):
        view["target"] = {**target.model_dump(), "text_he": target_text(target), "from": "owner" if target.edited_by_owner else "suggestion"}
        if target.edited_by_owner and suggestion:
            view["target"]["suggested_he"] = suggestion["headline_he"]
    elif suggestion:
        view["target"] = {"kind": suggestion["kind"], "value_min": suggestion["min"], "value_max": suggestion["max"],
                          "unit_he": suggestion["unit_he"], "text_he": suggestion["headline_he"],
                          "accepted": False, "edited_by_owner": False, "from": "suggestion"}
    elif result.get("qualitative_he"):
        view["target"] = {"kind": "qualitative", "text_he": result["qualitative_he"], "accepted": False,
                          "edited_by_owner": False, "from": "suggestion"}
    if suggestion and suggestion.get("level_he") and view.get("target", {}).get("from") == "suggestion" \
            and not view["target"].get("edited_by_owner"):
        view["target"]["level_he"] = suggestion["level_he"]
    for key in ("budget_he", "unit_economics_he", "payback"):
        if result.get(key):
            view[key] = result[key]
    return view


def prompt_block(view: dict) -> str:
    """The numbers for the strategy model: facts it may quote, never change or extend."""
    lever = view["lever"]
    lines = [
        "המספרים (חישבנו אותם בעצמנו, לפי תשובות בעל העסק והמקורות. אל תשנה אותם ואל תוסיף מספרים משלך):",
        f"- איפה העסק היום: {view['baseline_he']}",
        f"- מה מגדילים (בעל העסק בחר): {lever['name_he']}."
        + (f" ההמלצה שלנו הייתה {lever['recommended_name_he']}: {lever['recommended_he']}"
           if lever["recommended_key"] != lever["key"] else f" {lever['recommended_he']}"),
    ]
    target = view.get("target") or {}
    if target.get("text_he"):
        lines.append(f"- היעד ל-3 חודשים: {target['text_he']} ({CAVEAT_HE})")
    lines += [f"  - {line}" for line in view.get("math_he") or []]
    if view.get("unit_economics_he"):
        lines.append(f"- כמה שווה לקוח: {view['unit_economics_he']}")
    if view.get("budget_he"):
        lines.append(f"- התקציב: {view['budget_he']}")
    lines.append(LEVER_GUIDE.get(lever["key"], ""))
    return "\n".join(line for line in lines if line)


# How the strategy centres on each lever. Structure, not products: which products to feature
# is the owner's decision inside the app.
LEVER_GUIDE = {
    "new_customers": "האסטרטגיה נבנית סביב להביא אנשים שעוד לא קנו: להופיע איפה שהקהל כבר מחפש, סיבה ברורה לנסות "
                     "בפעם הראשונה, והמלצות של לקוחות שמורידות חשש.",
    "bigger_basket": "האסטרטגיה נבנית סביב להגדיל כל קנייה: מארזים, שילובים ומוצרים משלימים, סף למשלוח חינם, "
                     "ופוסטים שמראים איך משלבים. לא להביא יותר אנשים, אלא שכל אחד ייקח יותר.",
    "returning": "האסטרטגיה נבנית סביב לקוחות שכבר קנו: רשימת וואטסאפ או מועדון לקוחות, תזכורת בזמן הנכון, "
                 "המלצות וקהילה. פחות תקציב על זרים, יותר על מי שכבר מכיר.",
    "close_more": "האסטרטגיה נבנית סביב לסגור יותר מהפניות שכבר מגיעות: מענה מהיר, סיפורי לקוחות ותהליך העבודה "
                  "שמורידים חשש, ומעקב אחרי כל הצעה. לא להביא עוד פניות לפני שסוגרים את אלה.",
    "fill_quiet": "האסטרטגיה נבנית סביב החודשים השקטים: מתחילים להתכונן שלושה שבועות לפני, סיבה לבוא דווקא אז, "
                  "ותזכורת ללקוחות קבועים.",
}


def errors_he(errors: list[dict]) -> str:
    """Validation problems as Hebrew sentences (pydantic's own messages are English)."""
    out: list[str] = []
    for error in errors:
        message = ""
        if error.get("type") == "value_error":
            message = str((error.get("ctx") or {}).get("error") or error.get("msg") or "").removeprefix("Value error, ")
        if not re.search("[א-ת]", message):
            loc = [str(part) for part in error.get("loc") or []]
            field = next((part for part in reversed(loc) if part in FIELD_HE), "")
            message = f"{FIELD_HE[field]}: בחרו מהאפשרויות או כתבו מספר." if field else "משהו בתשובות לא תקין. בדקו ונסו שוב."
        if message not in out:
            out.append(message)
    return " ".join(out) or "משהו בתשובות לא תקין. בדקו ונסו שוב."
