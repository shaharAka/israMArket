"""Onboarding v2 revision 6: the baseline, the lever and the calculated 3-month target.

`goal_numbers.suggest` is deterministic (no model), so every figure here is checked
against the published ranges it must come from (cost_model = Kan Media, google_cost =
Rulers) or against a labelled planning assumption.
"""
import _test_env  # noqa: F401  (must come before any `app` import)

import copy
import math
import re
import tempfile
import unittest
from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import User
from app.services import cost_model, google_cost
from app.services import goal_numbers as goals
from app.services import onboarding_draft as drafts
from app.services import quarter_plan as quarter
from app.services import ratelimit
from app.services.jsonutil import loads
from test_quarter_plan import BAKERY as PLAN_BAKERY
from test_quarter_plan import DIRECTION, QuarterTestCase, answer

TODAY = date(2026, 9, 30)

LINGERIE = {
    "business_name": "תציצי", "business_type": "fashion",
    "offerings": "חזיות והלבשה תחתונה של מותגים מוכרים, אונליין ובחנות",
    "links": {"website": "tazizi.example"}, "business_model": "products", "grow_where": "both",
    "budget": {"range": "1k-3k"},
    "baseline": {"orders_month": 40, "avg_order_ils": 180, "margin_pct": "m40", "online_share": "half"},
    "lever": {"primary": "new_customers"},
}
ARCHITECT = {
    "business_name": "סטודיו גל", "business_type": "home",
    "offerings": "תכנון ועיצוב בתים פרטיים ושיפוץ דירות, אדריכלית",
    "links": {"website": "studio.example"}, "business_model": "services",
    "budget": {"range": "3k-7k"},
    "baseline": {"inquiries_month": 6, "close_rate": 20, "deal_value_ils": 25000, "capacity_more": 2},
    "lever": {"primary": "close_more"},
}
BAKERY = {
    "business_name": "מאפיית הדקל", "business_type": "food",
    "offerings": "לחמים, בורקס ועוגות", "business_model": "products", "grow_where": "store",
    "budget": {"range": "none"},
    "baseline": {"orders_month": "unknown", "avg_order_ils": "unknown"},
}


def draft(base: dict, **changes) -> drafts.OnboardingDraft:
    data = copy.deepcopy(base)
    for key, value in changes.items():
        if value is None:
            data.pop(key, None)
        else:
            data[key] = value
    return drafts.OnboardingDraft(**data)


def numbers_in(text: str) -> list[str]:
    return re.findall(r"\d[\d,]*(?:\.\d+)?", text)


def half_up(x: float) -> int:
    return int(math.floor(x + 0.5))


class LingerieMathTest(unittest.TestCase):
    """~40 orders, 180 ₪ average, 40% left, 1,000-3,000 ₪, "more new customers"."""

    def setUp(self):
        self.result = goals.suggest(draft(LINGERIE), TODAY)

    def test_baseline_is_said_back_with_the_arithmetic(self):
        self.assertEqual(
            self.result["baseline_summary_he"],
            "בערך 40 הזמנות בחודש, ממוצע 180 ₪ — כ-7,200 ₪ בחודש. בערך חצי באתר. מכל קנייה נשארים לכם כ-72 ₪.",
        )

    def test_every_number_comes_from_the_meta_source(self):
        budget = 2000  # the middle of 1,000-3,000, as the plan does
        clicks = (int(budget / cost_model.CPC_NIS[1]), int(budget / cost_model.CPC_NIS[0]))
        impressions = (int(budget * 1000 / cost_model.CPM_NIS[1]), int(budget * 1000 / cost_model.CPM_NIS[0]))
        orders = (int(budget / cost_model.CPA_NIS[1]), int(budget / cost_model.CPA_NIS[0]))
        self.assertEqual((clicks, impressions, orders), ((444, 1666), (36363, 111111), (9, 25)))
        math_he = self.result["math_he"]
        self.assertEqual(math_he[0], "היום: 40 הזמנות × 180 ₪ = כ-7,200 ₪ בחודש.")
        self.assertTrue(math_he[1].startswith("2,000 ₪ באינסטגרם ובפייסבוק ="), math_he[1])
        self.assertIn("36,363-111,111 חשיפות", math_he[1])
        self.assertIn("444-1,666 קליקים (1.2-4.5 ₪ לקליק)", math_he[1])
        self.assertEqual(math_he[2], "לפי 80-220 ₪ לקנייה, זה 9-25 הזמנות נוספות בחודש.")
        suggestion = self.result["suggestion"]
        self.assertEqual((suggestion["kind"], suggestion["min"], suggestion["max"]), ("orders", 9, 25))
        self.assertEqual((suggestion["pct_min"], suggestion["pct_max"]), (half_up(9 / 40 * 100), half_up(25 / 40 * 100)))
        self.assertEqual(suggestion["headline_he"], "+9 עד +25 הזמנות בחודש (+23%-63%)")
        self.assertEqual(suggestion["level_he"], "49-65 הזמנות בחודש")
        self.assertEqual(self.result["sources"][0]["url"], cost_model.SOURCE_URL)
        self.assertFalse(self.result["organic_only"])
        self.assertEqual(self.result["caveat_he"], "טווח לתכנון, לא הבטחה.")

    def test_the_margin_says_plainly_that_paid_does_not_pay_back(self):
        self.assertEqual(self.result["payback"], "no")
        text = self.result["unit_economics_he"]
        self.assertIn("כ-72 ₪ (180 ₪ × 40%)", text)
        self.assertIn("80-220 ₪", text)
        self.assertIn("על הקנייה הראשונה זה הפסד", text)
        # 80 / 72 and 220 / 72, rounded up: the purchases a customer must make to break even.
        self.assertIn(f"{math.ceil(80 / 72)}-{math.ceil(220 / 72)} פעמים", text)
        # So the lever we recommend is not "more new customers".
        self.assertEqual(self.result["recommended_lever"], "returning")
        self.assertIn("72 ₪", self.result["lever_hint_he"])

    def test_below_the_viable_floor_is_said(self):
        joined = " ".join(self.result["assumptions_he"])
        self.assertIn("מתחת ל-2,500 ₪", joined)
        self.assertIn("האמצע של הטווח", joined)

    def test_a_margin_that_pays(self):
        result = goals.suggest(draft(LINGERIE, baseline={"orders_month": 40, "avg_order_ils": 1000, "margin_pct": 60}), TODAY)
        self.assertEqual(result["payback"], "pays")
        self.assertIn("600 ₪", result["unit_economics_he"])
        result = goals.suggest(draft(LINGERIE, baseline={"orders_month": 40, "avg_order_ils": 400, "margin_pct": 40}), TODAY)
        self.assertEqual(result["payback"], "partly")  # 160 ₪: between 80 and 220


class ArchitectMathTest(unittest.TestCase):
    """6 inquiries, 2 of 10 close, 25,000 ₪, room for 2 more, 3,000-7,000 ₪, "close more"."""

    def setUp(self):
        self.result = goals.suggest(draft(ARCHITECT), TODAY)

    def test_close_more_is_recommended_and_calculated(self):
        self.assertEqual(self.result["recommended_lever"], "close_more")
        self.assertIn("50% יותר לקוחות", self.result["lever_hint_he"])  # 1 more of 10 on top of 2 of 10
        suggestion = self.result["suggestion"]
        self.assertEqual((suggestion["kind"], suggestion["min"], suggestion["max"]), ("close_rate", 1, 2))
        self.assertEqual(suggestion["level_he"], "3-4 מתוך 10 (היום 2)")
        self.assertEqual((suggestion["pct_min"], suggestion["pct_max"]), (50, 100))
        math_he = self.result["math_he"]
        self.assertEqual(math_he[0], "היום: 6 פניות × 2 מתוך 10 = כ-1.2 לקוחות בחודש (כ-30,000 ₪).")
        self.assertTrue(math_he[1].startswith("הנחת עבודה:"))  # no invented benchmark
        # 6 × 0.1..0.2 = 0.6..1.2 a month: under one client a month, so whole people for the
        # quarter: ×3 = 1.8..3.6 ≈ 2-4 clients; × 25,000 = 45,000..90,000.
        self.assertIn("6 פניות × עוד 1-2 מכל 10 = עוד כ-2-4 לקוחות ב-3 החודשים (כ-45,000-90,000 ₪)", math_he[2])

    def test_the_google_numbers_and_the_capacity(self):
        plan = google_cost.plan_from_budget(5000, "home", ARCHITECT["offerings"], "services")
        self.assertEqual(plan.industry_key, "renovation")
        self.assertEqual(plan.expected_conversions, (13, 35))  # 5,000/11×3% .. 5,000/7×5%
        self.assertEqual(plan.cost_per_conversion, (140, 367))  # 7/5% .. 11/3%
        self.assertEqual(len(self.result["math_he"]), 3)  # the cost comparison lives in the unit economics
        budget = self.result["budget_he"]
        self.assertIn("13-35 פניות נוספות", budget)
        self.assertIn("כ-3-7 לקוחות", budget)  # 13×20% .. 35×20% = 2.6..7, in whole people
        self.assertIn("יותר ממה שיש לכם מקום", budget)
        unit = self.result["unit_economics_he"]
        self.assertIn("700-1,835 ₪", unit)  # 140/20% .. 367/20%
        self.assertIn("25,000 ₪", unit)
        self.assertIn("כמה נשאר לכם", unit)
        self.assertEqual(self.result["sources"][0]["url"], google_cost.SOURCE_URL)  # no margin given: no verdict invented
        self.assertIsNone(self.result["payback"])
        self.assertEqual(self.result["sources"][0]["url"], google_cost.SOURCE_URL)

    def test_new_customers_are_capped_by_capacity(self):
        result = goals.suggest(draft(ARCHITECT, lever={"primary": "new_customers"}), TODAY)
        suggestion = result["suggestion"]
        self.assertEqual(suggestion["kind"], "clients")
        self.assertEqual((suggestion["min"], suggestion["max"]), (2, 2))  # 2.6-7 capped at 2
        self.assertIn("יש מקום רק לעוד 2", result["math_he"][2])
        full = goals.suggest(draft(ARCHITECT, lever={"primary": "new_customers"},
                                   baseline={**ARCHITECT["baseline"], "capacity_more": "none"}), TODAY)
        self.assertIsNone(full["suggestion"])
        self.assertEqual(full["recommended_lever"], "bigger_basket")
        self.assertIn("אין מקום", full["qualitative_he"])


class BakeryAndUnknownsTest(unittest.TestCase):
    def test_no_budget_and_no_baseline_is_organic_and_qualitative(self):
        result = goals.suggest(draft(BAKERY), TODAY)
        self.assertTrue(result["organic_only"])
        self.assertIsNone(result["suggestion"])
        self.assertFalse(result["baseline_known"])
        self.assertIn("נמדוד מהשבוע הראשון", result["baseline_summary_he"])
        self.assertIn("סופרים כל יום", result["qualitative_he"])
        self.assertTrue(result["first_checkpoint_he"].startswith("בסוף אוקטובר"))
        self.assertEqual(result["sources"], [])
        # No number that is not the owner's or the calendar's.
        for line in result["math_he"]:
            self.assertEqual(numbers_in(line), [])

    def test_unknown_baseline_with_a_budget_gives_the_increase_without_a_percent(self):
        result = goals.suggest(draft(LINGERIE, baseline={"orders_month": "unknown"}), TODAY)
        suggestion = result["suggestion"]
        self.assertEqual((suggestion["min"], suggestion["max"]), (9, 25))
        self.assertNotIn("pct_min", suggestion)
        self.assertIn("נמדוד מהשבוע הראשון", result["baseline_summary_he"])

    def test_a_range_chip_is_computed_at_its_middle(self):
        result = goals.suggest(draft(LINGERIE, baseline={"orders_month": "20-50", "avg_order_ils": "100-300"}), TODAY)
        self.assertIn("בערך 20-50 הזמנות בחודש, ממוצע 100-300 ₪ — כ-7,000 ₪ בחודש.", result["baseline_summary_he"])
        self.assertIn("כשבחרתם טווח, חישבנו לפי האמצע שלו.", result["assumptions_he"])
        self.assertEqual(result["suggestion"]["pct_min"], half_up(9 / 35 * 100))

    def test_bigger_basket_and_returning_use_labelled_assumptions(self):
        basket = goals.suggest(draft(LINGERIE, lever={"primary": "bigger_basket"}), TODAY)
        self.assertEqual((basket["suggestion"]["min"], basket["suggestion"]["max"]), (9, 18))  # 5%-10% of 180
        self.assertIn("עוד 360-720 ₪ בחודש", basket["math_he"][2])  # 40 × 9..18
        self.assertTrue(basket["math_he"][1].startswith("הנחת עבודה:"))
        back = goals.suggest(draft(LINGERIE, lever={"primary": "returning"}), TODAY)
        self.assertEqual((back["suggestion"]["min"], back["suggestion"]["max"]), (2, 4))  # 5%-10% of 40
        self.assertIn("כ-360-720 ₪", back["math_he"][2])
        self.assertIn("budget_he", back)  # the budget goes to those who already bought

    def test_unmatched_industry_uses_the_general_row_and_says_so(self):
        result = goals.suggest(draft(ARCHITECT, business_type="other", offerings="ייעוץ לחברות בתחום הלוגיסטיקה",
                                     lever={"primary": "new_customers"}), TODAY)
        joined = " ".join(result["assumptions_he"])
        # Consulting is a sector signal (professional) but no industry row: the general price.
        self.assertIn("השתמשנו במחיר הכללי", joined)
        self.assertIn("6-12 ₪", joined)


class SourcesTest(unittest.TestCase):
    """Whenever a market figure is shown, its source is there; planning numbers are labelled."""

    def test_sources_whenever_market_numbers_are_shown(self):
        cases = [LINGERIE, ARCHITECT, BAKERY]
        levers = ["new_customers", "bigger_basket", "returning", "close_more", "fill_quiet"]
        budgets = [{"range": "none"}, {"range": "1k-3k"}, {"range": "3k-7k", "exact_ils": 4000}]
        for base in cases:
            for lever in levers:
                if base["business_model"] == "products" and lever == "close_more":
                    continue
                for budget in budgets:
                    result = goals.suggest(draft(base, lever={"primary": lever}, budget=budget), TODAY)
                    text = " ".join(result["math_he"] + [result.get("unit_economics_he", ""), result.get("budget_he", "")])
                    market = re.search(r"לקליק|לפי המקור|לקנייה,|מהקליקים", text)
                    with self.subTest(base=base["business_name"], lever=lever, budget=budget["range"]):
                        if market:
                            self.assertTrue(result["sources"], text)
                        for line in result["math_he"]:
                            if "5%-10%" in line or "1-2 מכל 10" in line.split("=")[0]:
                                self.assertTrue(line.startswith("הנחת עבודה:") or "×" in line, line)
                        self.assertEqual(result["caveat_he"], "טווח לתכנון, לא הבטחה.")


class ValidationTest(unittest.TestCase):
    def test_bounds_and_keys(self):
        for bad in ({"orders_month": -1}, {"close_rate": 150}, {"avg_order_ils": "abc"}, {"margin_pct": 99},
                    {"returning": "sometimes"}, {"capacity_more": True}):
            with self.subTest(bad=bad), self.assertRaises(ValidationError) as caught:
                draft(LINGERIE, baseline=bad)
            self.assertRegex(goals.errors_he(caught.exception.errors()), "[א-ת]")
        ok = draft(LINGERIE, baseline={"orders_month": "40", "avg_order_ils": "1,200", "margin_pct": "35%"})
        self.assertEqual((ok.baseline.orders_month, ok.baseline.avg_order_ils, ok.baseline.margin_pct), (40, 1200, 35))

    def test_lever_and_target(self):
        with self.assertRaises(ValidationError):
            draft(LINGERIE, lever={"primary": "close_more"})  # a shop has no inquiries to close
        with self.assertRaises(ValidationError):
            draft(LINGERIE, lever={"primary": "nonsense"})
        with self.assertRaises(ValidationError):
            draft(LINGERIE, target={"kind": "orders", "value_min": 20, "value_max": 5, "unit_he": "הזמנות בחודש"})
        with self.assertRaises(ValidationError):
            draft(LINGERIE, target={"kind": "orders", "value_min": -3, "unit_he": "הזמנות בחודש"})
        t = draft(LINGERIE, target={"kind": "orders", "value_min": 9, "value_max": 25, "unit_he": "הזמנות בחודש",
                                    "accepted": True})
        self.assertEqual(t.target_text, "+9 עד +25 הזמנות בחודש")

    def test_kpi_follows_the_lever(self):
        self.assertEqual(draft(LINGERIE).kpi_key, "online_orders")
        self.assertEqual(draft(LINGERIE, lever={"primary": "bigger_basket"}).kpi_key, "avg_order")
        self.assertEqual(draft(ARCHITECT).kpi_key, "close_rate")
        self.assertEqual(draft(BAKERY).kpi_key, "store_visits")
        # Old drafts: success.target is still read, and the derived measures are not offered as picks.
        old = draft(BAKERY, success={"kpi": "store_visits", "target": "20 לקוחות"})
        self.assertEqual(old.target_text, "20 לקוחות")
        self.assertNotIn("avg_order", [o["key"] for o in drafts.success_options("products")])


class EndpointTest(unittest.TestCase):
    def setUp(self):
        ratelimit.reset()
        self.client = TestClient(app)

    def post(self, body, ip="203.0.113.61"):
        return self.client.post("/public/target-suggestion", json=body, headers={"X-Forwarded-For": ip})

    def test_answers_fast_with_the_contract(self):
        response = self.post({"draft": LINGERIE})
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        for key in ("baseline_summary_he", "lever_hint_he", "suggestion", "math_he", "assumptions_he", "sources",
                    "organic_only", "recommended_lever", "first_checkpoint_he", "caveat_he"):
            self.assertIn(key, body)
        self.assertEqual(body["suggestion"]["headline_he"], "+9 עד +25 הזמנות בחודש (+23%-63%)")

    def test_invalid_is_a_hebrew_422_and_costs_nothing(self):
        bad = {**LINGERIE, "baseline": {"orders_month": -5}}
        response = self.post({"draft": bad})
        self.assertEqual(response.status_code, 422)
        self.assertIsInstance(response.json()["detail"], str)
        self.assertIn("הזמנות בחודש", response.json()["detail"])
        self.assertEqual(self.post({"nothing": 1}).status_code, 422)
        for _ in range(goals_limit()):
            self.assertEqual(self.post({"draft": bad}, ip="203.0.113.62").status_code, 422)
        self.assertEqual(self.post({"draft": LINGERIE}, ip="203.0.113.62").status_code, 200)


def goals_limit() -> int:
    from app.routers import public_onboarding

    return public_onboarding.TARGET_PER_IP + 1


# --- the plan: numbers, content mix, no specific products, what's inside -------------------------


REV6_BAKERY = {**PLAN_BAKERY, "baseline": {"orders_month": 300, "avg_order_ils": 35},
               "lever": {"primary": "returning"},
               "target": {"kind": "repeat_orders", "value_min": 15, "value_max": 30, "unit_he": "הזמנות חוזרות בחודש",
                          "accepted": True}}
REV6_BAKERY.pop("success")


class PlanNumbersTest(QuarterTestCase):
    def test_the_plan_carries_the_numbers_and_the_mix(self):
        body = self.plan(draft=copy.deepcopy(REV6_BAKERY)).json()
        numbers = body["numbers"]
        self.assertEqual(numbers["lever"]["key"], "returning")
        self.assertEqual(numbers["target"]["text_he"], "+15 עד +30 הזמנות חוזרות בחודש")
        self.assertIn("300 הזמנות", numbers["baseline_he"])
        self.assertEqual(body["kpi"]["key"], "repeat_customers")
        self.assertEqual(body["kpi"]["target"], "+15 עד +30 הזמנות חוזרות בחודש")
        self.assertIn("300 הזמנות", body["kpi"]["baseline_he"])
        prompt = self.model.prompts[0]
        self.assertIn("המספרים (חישבנו אותם בעצמנו", prompt)
        self.assertIn("לקוחות שכבר קנו", prompt)  # the strategy centres on the lever
        self.assertIn("social_proof ו-community", prompt)  # the mix leans with it
        month = body["content"][0]
        self.assertEqual([m["type_key"] for m in month["mix"]], ["product", "behind_scenes", "social_proof"])
        self.assertEqual(month["mix"][0]["name_he"], "המוצרים")
        self.assertNotIn("example_titles", month)
        self.assertIn("אתם מחליטים כאן", month["products_note_he"])
        self.assertEqual([i["key"] for i in body["inside"]][:2], ["plan", "posts"])

    def test_a_draft_from_before_revision_6_has_no_numbers(self):
        body = self.plan().json()
        self.assertNotIn("numbers", body)
        self.assertEqual(body["kpi"]["baseline_he"], quarter.BASELINE_HE)

    def test_specific_products_brands_and_prices_are_sent_back_then_removed(self):
        def bad():
            data = answer()
            data["strategy"]["one_liner_he"] = "מבליטים את Triumph Smart N בכל שבוע. מצלמים את הטאבון בבוקר."
            data["content"][0]["pillars"][0] = {"key": "sku", "title": "חזיית Triumph", "description_he": "הדגם."}
            data["content"][1]["mix"][0]["purpose_he"] = "הבורקס ב-12 ₪. מה יוצא מהטאבון."
            return data

        self.model.answers = [bad(), bad()]
        body = self.plan(draft=copy.deepcopy(REV6_BAKERY)).json()
        self.assertIn("מוצר, מותג או מחיר מסוים", self.model.prompts[1])
        self.assertIn("Triumph", self.model.prompts[1])
        self.assertNotIn("Triumph", body["strategy"]["one_liner_he"])
        self.assertIn("הטאבון", body["strategy"]["one_liner_he"])
        self.assertNotIn("sku", [p["key"] for p in body["content"][0]["pillars"]])
        self.assertNotIn("₪", body["content"][1]["mix"][0]["purpose_he"])

    def test_a_mix_that_does_not_fit_the_cadence_is_sent_back(self):
        data = answer()
        for month in data["content"]:
            month["mix"] = [{"type_key": "product", "per_month": "10", "purpose_he": "הרבה."},
                            {"type_key": "offer", "per_month": "8", "purpose_he": "עוד."},
                            {"type_key": "value", "per_month": "6", "purpose_he": "ועוד."}]
        self.model.answers = [data, answer()]
        self.plan(draft=copy.deepcopy(REV6_BAKERY))
        self.assertIn("לא מתאים לקצב", self.model.prompts[1])

    def test_the_mix_type_is_not_an_enum(self):
        # One more enum in the plan schema and Gemini rejects the whole request (400 invalid argument).
        mix = quarter.QUARTER_SCHEMA["properties"]["content"]["items"]["properties"]["mix"]["items"]["properties"]
        self.assertNotIn("enum", mix["type_key"])

    def test_no_bets_in_the_new_copy(self):
        text = repr(goals.LEVER_GUIDE) + repr(quarter.INSIDE) + repr(quarter.MIX_BY_LEVER) + repr(quarter.CONTENT_TYPES)
        for word in ("הימור", "מהמרים", "אם טעינו"):
            self.assertNotIn(word, text)


class FromDraftNumbersTest(QuarterTestCase):
    def setUp(self):
        super().setUp()
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-goals-"))
        engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=engine)
        self.db = sessionmaker(bind=engine, autoflush=False, autocommit=False)()
        self.owner = User(email="owner@example.com", password_hash="x", full_name="נועה")
        self.db.add(self.owner)
        self.db.commit()

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: self.owner
        self.addCleanup(self.db.close)

    def test_from_draft_keeps_the_numbers_and_month_one_plans_against_them(self):
        plan = self.plan(draft=copy.deepcopy(REV6_BAKERY)).json()
        response = self.client.post("/onboarding/from-draft", json={
            "draft": REV6_BAKERY, "chosen_direction": DIRECTION, "quarter_plan": plan})
        self.assertEqual(response.status_code, 200, response.text)
        from app.models import Business

        stored = loads(self.db.query(Business).one().scraped_profile_json, {})
        self.assertEqual(stored["goal_numbers"]["lever"], {"primary": "returning"})
        self.assertEqual(stored["goal_numbers"]["target"]["value_max"], 30)
        self.assertEqual(stored["goal_numbers"]["kpi"], "repeat_customers")
        seed = stored["first_month_seed"]["strategy"]
        self.assertEqual(seed["numbers"]["lever_key"], "returning")
        self.assertEqual(seed["numbers"]["target_he"], "+15 עד +30 הזמנות חוזרות בחודש")
        self.assertEqual([m["type_key"] for m in seed["mix"]], ["product", "behind_scenes", "social_proof"])
        block = quarter.plan_prompt_block(seed)
        self.assertIn("מה מגדילים: לקוחות שחוזרים יותר", block)
        self.assertIn("+15 עד +30 הזמנות חוזרות בחודש", block)
        self.assertIn("אילו מוצרים להבליט בעל העסק בוחר", block)
        self.assertIn("מה מגדילים: לקוחות שחוזרים יותר", stored["long_horizon_plan"]["targets"][1])


# --- #117: whole-number targets, quiet months inside the plan, service wording ------------------

# The first-hour shop: 20-50 orders (35 at the middle), few come back, 40% left, under 1,000 ₪.
CERAMICS = {
    "business_name": "סטודיו טין ואש", "business_type": "other",
    "offerings": "כלי קרמיקה בעבודת יד: ספלים, קערות וצלחות", "business_model": "products", "grow_where": "online",
    "budget": {"range": "lt1k"},
    "baseline": {"orders_month": "20-50", "avg_order_ils": "100-300", "returning": "few", "margin_pct": "m40"},
    "lever": {"primary": "returning"},
}
# The first-hour physiotherapist: quiet in July and August, no budget.
PHYSIO = {
    "business_name": "פיזיותרפיה עם מיכל", "business_type": "health",
    "offerings": "פיזיותרפיה לכאבי גב וצוואר ושיקום אחרי פציעות ספורט", "business_model": "services",
    "budget": {"range": "none"}, "seasons": {"busy": [1, 2, 3], "slow": [7, 8]},
    "baseline": {"inquiries_month": "15-40", "close_rate": "half", "deal_value_ils": "lt2k", "capacity_more": "3-5",
                 "margin_pct": "m60"},
}
OCTOBER = date(2026, 10, 5)  # the plan is October, November and December
DECIMAL = re.compile(r"\+\d+\.\d")


class WholeTargetsTest(unittest.TestCase):
    """A target is something people count: "+2 עד +4 הזמנות", never "+1.8 עד +3.5"."""

    def test_the_first_hour_shop(self):
        result = goals.suggest(draft(CERAMICS), OCTOBER)
        suggestion = result["suggestion"]
        self.assertEqual((suggestion["min"], suggestion["max"]), (2, 4))  # 35 × 5%-10% = 1.75-3.5
        self.assertIsInstance(suggestion["min"], int)
        # The share is the assumption's (5-10 of 100), not the rounding's.
        self.assertEqual(suggestion["headline_he"], "+2 עד +4 הזמנות חוזרות בחודש (+5%-10%)")
        self.assertIn("35 הזמנות בחודש × 5%-10% = עוד 2-4 הזמנות חוזרות בחודש, כ-400-800 ₪.", result["math_he"][2])
        view = goals.numbers_view(draft(CERAMICS), OCTOBER)
        self.assertEqual(view["target"]["text_he"], "+2 עד +4 הזמנות חוזרות בחודש (+5%-10%)")

    def test_under_one_a_month_is_said_for_the_quarter(self):
        small = draft(CERAMICS, baseline={**CERAMICS["baseline"], "orders_month": 12})
        suggestion = goals.suggest(small, OCTOBER)["suggestion"]
        # 12 × 5%-10% = 0.6-1.2 a month: "+1" would hide half of it, so 1.8-3.6 in 3 months.
        self.assertEqual((suggestion["min"], suggestion["max"]), (2, 4))
        self.assertEqual(suggestion["unit_he"], "הזמנות חוזרות ב-3 חודשים")

    def test_service_clients_from_a_budget_are_whole(self):
        physio = draft(PHYSIO, budget={"range": "1k-3k"}, lever={"primary": "new_customers"})
        result = goals.suggest(physio, OCTOBER)
        suggestion = result["suggestion"]
        self.assertTrue(all(isinstance(v, int) for v in (suggestion["min"], suggestion["max"])), suggestion)
        self.assertNotRegex(suggestion["headline_he"], DECIMAL)
        self.assertNotRegex(" ".join(result["math_he"]), r"\d\.\d+ לקוחות")

    def test_every_suggested_target_is_whole(self):
        baselines = {
            "products": [{"orders_month": key, "avg_order_ils": "100-300", "returning": back, "margin_pct": "m40"}
                         for key in ("lt20", "20-50", "50-200", "gt200", 7, 13) for back in ("few", "half")],
            "services": [{"inquiries_month": key, "close_rate": rate, "deal_value_ils": "2k-10k", "capacity_more": room}
                         for key in ("lt5", "5-15", "15-40", "gt40", 3) for rate in ("1of10", "half", 80, 85)
                         for room in ("1-2", "gt5")],
        }
        levers = ["new_customers", "bigger_basket", "returning", "close_more", "fill_quiet"]
        budgets = [{"range": "none"}, {"range": "lt1k"}, {"range": "1k-3k"}, {"range": "3k-7k", "exact_ils": 4000}]
        for model, base, shop in (("products", baselines["products"], LINGERIE), ("services", baselines["services"], ARCHITECT)):
            for baseline in base:
                for lever in levers:
                    if model == "products" and lever == "close_more":
                        continue
                    for budget in budgets:
                        result = goals.suggest(draft(shop, baseline=baseline, lever={"primary": lever}, budget=budget), OCTOBER)
                        suggestion = result["suggestion"]
                        if not suggestion:
                            continue
                        with self.subTest(model=model, baseline=baseline, lever=lever, budget=budget["range"]):
                            self.assertEqual(suggestion["min"], int(suggestion["min"]))
                            self.assertEqual(suggestion["max"], int(suggestion["max"]))
                            self.assertNotRegex(suggestion["headline_he"], DECIMAL)
                            if lever != "close_more":
                                self.assertNotRegex(suggestion.get("level_he", ""), r"\d\.\d")

    def test_close_more_steps_are_whole_and_stop_at_nine_of_ten(self):
        eighty = goals.suggest(draft(ARCHITECT, baseline={**ARCHITECT["baseline"], "close_rate": 80}), OCTOBER)
        self.assertEqual((eighty["suggestion"]["min"], eighty["suggestion"]["max"]), (1, 1))
        self.assertTrue(eighty["suggestion"]["level_he"].startswith("9 מתוך 10"))
        # 85% leaves half a step before 9 of 10: no number to count, so measure first.
        nearly = goals.suggest(draft(ARCHITECT, baseline={**ARCHITECT["baseline"], "close_rate": 85}), OCTOBER)
        self.assertIsNone(nearly["suggestion"])
        self.assertIn("qualitative_he", nearly)

    def test_a_target_stored_with_fractions_reads_whole(self):
        old = draft(CERAMICS, target={"kind": "repeat_orders", "value_min": 1.8, "value_max": 3.5,
                                      "unit_he": "הזמנות חוזרות בחודש", "accepted": True})
        self.assertEqual(old.target_text, "+2 עד +4 הזמנות חוזרות בחודש")
        self.assertEqual(goals.headline("orders", 9, 25, "הזמנות בחודש"), "+9 עד +25 הזמנות בחודש")


class QuietMonthsInThePlanTest(unittest.TestCase):
    """An October-December plan does not recommend filling July and August."""

    def test_plan_months_follow_the_plan(self):
        self.assertEqual(goals.plan_month_numbers(OCTOBER), [10, 11, 12])
        self.assertEqual(goals.plan_month_numbers(date(2026, 12, 20)), [1, 2, 3])
        self.assertEqual(goals.plan_month_numbers(OCTOBER), [m["month"] for m in quarter.plan_months(OCTOBER)])
        self.assertEqual(goals.quiet_in_plan(draft(PHYSIO), OCTOBER), [])
        self.assertEqual(goals.quiet_in_plan(draft(PHYSIO), date(2026, 7, 25)), [8])

    def test_quiet_months_outside_the_plan_are_not_recommended(self):
        result = goals.suggest(draft(PHYSIO), OCTOBER)
        self.assertNotEqual(result["recommended_lever"], "fill_quiet")
        self.assertNotRegex(result["lever_hint_he"], "יולי|אוגוסט")

    def test_quiet_months_inside_the_plan_are(self):
        june = goals.suggest(draft(PHYSIO), date(2026, 6, 20))  # the plan is July-September
        self.assertEqual(june["recommended_lever"], "fill_quiet")
        self.assertIn("(יולי ואוגוסט)", june["lever_hint_he"])
        july = goals.suggest(draft(PHYSIO), date(2026, 7, 25))  # August-October: only August is in it
        self.assertIn("(אוגוסט)", july["lever_hint_he"])
        self.assertNotIn("יולי", july["lever_hint_he"])

    def test_chosen_anyway_it_names_no_month_outside_the_plan(self):
        chosen = draft(PHYSIO, lever={"primary": "fill_quiet"})
        result = goals.suggest(chosen, OCTOBER)
        text = " ".join([result.get("qualitative_he", ""), result["first_checkpoint_he"], *result["math_he"]])
        self.assertNotRegex(text, "יולי|אוגוסט")
        self.assertIn("אין חודש שקט", result["qualitative_he"])
        view = goals.numbers_view(chosen, OCTOBER)
        self.assertEqual(view["quiet_in_plan_he"], "")
        block = goals.prompt_block(view)
        self.assertIn("אף חודש שקט שלהם לא נופל בחודשי התוכנית", block)
        paid = goals.suggest(draft(PHYSIO, lever={"primary": "fill_quiet"}, budget={"range": "1k-3k"}), OCTOBER)
        self.assertNotIn("בחודשים השקטים", paid["suggestion"]["headline_he"])
        june = goals.numbers_view(draft(PHYSIO, lever={"primary": "fill_quiet"}), date(2026, 6, 20))
        self.assertIn("(יולי ואוגוסט)", june["target"]["text_he"])
        self.assertIn("החודשים השקטים שבתוכנית: יולי ואוגוסט", goals.prompt_block(june))


class ServiceWordingTest(unittest.TestCase):
    """A service business is not told about sales, stock or products."""

    def test_margin_without_a_value(self):
        physio = draft(PHYSIO, baseline={"inquiries_month": "15-40", "margin_pct": "m60"})
        self.assertIn("מכל לקוח נשארים לכם כ-60% ומעלה", goals.baseline_summary(physio))
        shop = draft(CERAMICS, baseline={"orders_month": "20-50", "margin_pct": "m40"})
        self.assertIn("מכל קנייה נשארים לכם כ-40%", goals.baseline_summary(shop))
        self.assertNotIn("מכירה", goals.FIELD_HE["margin_pct"])

    def test_the_plan_notes_follow_the_model(self):
        self.assertIn("שירותים", quarter.yours_note("services"))
        self.assertNotIn("מלאי", quarter.yours_note("services"))
        self.assertEqual(quarter.yours_note("products"), quarter.PRODUCTS_ARE_YOURS_HE)
        posts = {item["key"]: item for item in quarter.inside_for("services")}["posts"]
        self.assertIn("אילו שירותים להבליט", posts["what_he"])
        self.assertIn("אילו מוצרים להבליט", {item["key"]: item for item in quarter.inside_for("products")}["posts"]["what_he"])


if __name__ == "__main__":
    unittest.main()
