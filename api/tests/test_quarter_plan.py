"""Onboarding v2 revision 5: the 3-month plan (/public/quarter-plan) and what signup keeps.

Hermetic: the strategy model (`onboarding_draft._strategy_call`) answers from fixtures.
"""
import _test_env  # noqa: F401  (must come before any `app` import)

import copy
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Business, Integration, User
from app.routers import onboarding as onboarding_router
from app.routers import public_onboarding as public_router
from app.services import onboarding_draft as drafts
from app.services import preview as preview_service
from app.services import quarter_plan as quarter
from app.services import ratelimit
from app.services import strategy as strategy_service
from app.services.jsonutil import loads

BAKERY = {
    "business_name": "מאפיית הדקל",
    "business_type": "food",
    "offerings": "בייגלה ירושלמי עם זעתר, פיתות מהטאבון ובורקס. פתוחים כל יום מ-06:00.",
    "differentiator": "הכול נאפה בטאבון עצים",
    "city": "יפו",
    "links": {"instagram": "@hadekel_bakery"},
    "activity": {"instagram": "sometimes"},
    "business_model": "products",
    "audiences": [{"name": "עוברים בבוקר", "description": "בדרך לעבודה"}],
    "tried": {"channels": ["social_posts"], "what_worked": "תמונות של הטאבון בסטורי"},
    "budget": {"range": "none"},
    "grow_where": "store",
    "success": {"kpi": "store_visits"},
}
SHOP = {
    **BAKERY,
    "business_name": "ת'ציצי פנימה",
    "business_type": "חנות אונליין (אי-קומרס)",
    "offerings": "חזיות של מותגים מוכרים והלבשה תחתונה",
    "links": {"website": "shop.example", "instagram": "@shop_example"},
    "budget": {"range": "1k-3k"},
    "grow_where": "both",
    "success": {"kpi": "online_orders"},
    "tried": {"channels": ["social_posts", "paid_social"], "what_worked": ""},
}
SHOP_SCAN = {
    "raw": {"url": "https://shop.example", "title": "חנות", "text": "חזיות מותגים",
            "detected_tags": {"ga4": ["G-7MPBWRW3FT"], "gtm": ["GTM-TVGNWVV"], "meta_pixel": [], "google_ads": [],
                              "search_console": []}},
    "extracted": {"business_name": "ת'ציצי פנימה"},
    "brand_language": {"business_name": "ת'ציצי פנימה", "voice": "קליל",
                       "palette": [{"hex": "#ed427a", "role": "primary", "name": "ורוד"}]},
}
DIRECTION = {"title": "בוקר של טאבון", "approach_he": "מצלמים את הטאבון בבוקר.", "audience": "עוברים בבוקר",
             "goal_he": "יותר קונים בבוקר", "why_he": "זה עבד בסטורי.", "first_steps": ["לצלם", "להעלות", "לשאול"]}
INSIGHTS = [{"text_he": "סיפרתם שתמונות הטאבון מביאות אנשים.", "source": "answers"}]


def answer(today: date | None = None, **overrides) -> dict:
    months = quarter.plan_months(today or date.today())
    first_event = next((e for m in months for e in m["events"]), None)
    data = {
        "strategy": {"one_liner_he": "מצלמים את הטאבון בבוקר ומביאים עוברים לדלפק.", "angle_he": "טאבון עצים ביפו.",
                     "why_he": "סיפרתם שתמונות הטאבון מביאות אנשים.", "based_on": "insight_1"},
        "kpi_how_he": "סופרים בסוף היום כמה קנו בדלפק.",
        "measures": [{"name_he": "צפיות בסטורי", "how_he": "בנתוני האינסטגרם.", "needs": ["instagram_insights"]}],
        "audiences": [{"name": "עוברים בבוקר", "role": "primary", "message_he": "הבייגלה חם מהטאבון."}],
        "channels": [
            {"key": "instagram", "why_he": "זה כבר עבד.", "based_on": "tried", "starts_month": 1,
             "effort_he": "שעה בשבוע לצלם.", "cadence_he": "1-2 בשבוע"},
            {"key": "gbp", "why_he": "מחפשים מאפייה באזור.", "based_on": "city", "starts_month": 2,
             "effort_he": "להקים פעם אחת.", "cadence_he": "פעם בחודש"},
        ],
        "budget_months": [{"month": i, "lines": []} for i in (1, 2, 3)],
        "unlock_he": "מתחת ל-2,500 ₪ בחודש עדיף לפרסם רק למי שכבר מכיר אתכם.",
        "calendar": [
            {"month": 1, "weeks": [{"week": w, "focus_he": f"שבוע {w}: מצלמים."} for w in (1, 2, 3, 4)],
             "dates": ([{"date": first_event["date"], "action_he": "סטורי לחג."}] if first_event else []),
             "checkpoint_he": "בודקים כמה אמרו שראו באינסטגרם."},
            {"month": 2, "weeks": [], "dates": [], "checkpoint_he": "בודקים את הכרטיס בגוגל."},
            {"month": 3, "weeks": [], "dates": [], "checkpoint_he": "מחליטים על החורף."},
        ],
        "content": [
            {"month": i, "pillars": [{"key": "taboon", "title": "הטאבון", "description_he": "האש."},
                                     {"key": "zaatar", "title": "הזעתר", "description_he": "התערובת."}],
             "cadence": [{"channel_key": "instagram", "per_week": "1–2"}],
             "mix": [{"type_key": "product", "per_month": "2", "purpose_he": "מה יוצא מהטאבון השבוע."},
                     {"type_key": "behind_scenes", "per_month": "2", "purpose_he": "האש והידיים בבוקר."},
                     {"type_key": "social_proof", "per_month": "1-2", "purpose_he": "מה אומרים הקבועים."}]}
            for i in (1, 2, 3)
        ],
        "assumptions": [{"bet_he": "אנחנו מהמרים שהטאבון מושך.", "if_wrong_he": "נעבור לבייגלה לשישי."},
                        {"bet_he": "אנחנו מהמרים שהכרטיס בגוגל מביא.", "if_wrong_he": "נתמקד באינסטגרם."}],
        "changed_he": "",
    }
    data.update(overrides)
    return data


class FakeModel:
    def __init__(self):
        self.prompts: list[str] = []
        self.answers: list = []

    def __call__(self, prompt, schema):
        self.prompts.append(prompt)
        item = self.answers.pop(0) if self.answers else answer()
        if isinstance(item, Exception):
            raise item
        return json.dumps(item, ensure_ascii=False)


class QuarterTestCase(unittest.TestCase):
    def setUp(self):
        ratelimit.reset()
        preview_service.reset_cache()
        public_router.answers.clear()
        public_router.latest.clear()
        self.model = FakeModel()
        patch = mock.patch.object(drafts, "_strategy_call", side_effect=self.model)
        patch.start()
        self.addCleanup(patch.stop)
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app)

    def plan(self, draft=None, ip="203.0.113.31", **extra):
        body = {"draft": draft or copy.deepcopy(BAKERY), "direction": DIRECTION, "insights": INSIGHTS, **extra}
        return self.client.post("/public/quarter-plan", json=body, headers={"X-Forwarded-For": ip})


class DraftFieldsTest(unittest.TestCase):
    def test_success_options_follow_the_model_and_where_to_grow(self):
        keys = lambda model, grow=None: [o["key"] for o in drafts.success_options(model, grow)]  # noqa: E731
        self.assertEqual(keys("products", "online"), ["online_orders", "whatsapp_inquiries", "local_awareness"])
        self.assertEqual(keys("products", "store"), ["store_visits", "whatsapp_inquiries", "local_awareness"])
        self.assertIn("bookings", keys("services"))
        self.assertNotIn("online_orders", keys("services"))
        body = TestClient(app).get("/public/success-options?model=services&grow_where=store").json()
        self.assertEqual(body["grow_where"], [])
        self.assertIn("form_leads", [o["key"] for o in body["options"]])
        self.assertEqual(len(body["budgets"]), 6)

    def test_a_kpi_that_does_not_fit_is_rejected(self):
        with self.assertRaises(ValidationError):
            drafts.OnboardingDraft(**{**BAKERY, "grow_where": "store", "success": {"kpi": "online_orders"}})
        with self.assertRaises(ValidationError):
            drafts.OnboardingDraft(**{**BAKERY, "success": {"kpi": "nonsense"}})
        services = drafts.OnboardingDraft(**{**BAKERY, "business_type": "עיצוב / אדריכלות / נדל״ן",
                                             "business_model": "services", "success": {"kpi": "bookings"}})
        self.assertIsNone(services.grow_where)

    def test_budget_number(self):
        budget = drafts.DraftBudget
        self.assertEqual(budget(range="none").monthly_ils(), 0)
        self.assertEqual(budget(range="lt1k").monthly_ils(), 500)
        self.assertEqual(budget(range="1k-3k").monthly_ils(), 2000)
        self.assertEqual(budget(range="gt7k").monthly_ils(), 7000)
        self.assertIsNone(budget(range="unknown").monthly_ils())
        self.assertEqual(budget(range="1k-3k", exact_ils=2500).monthly_ils(), 2500)


class QuarterContractTest(QuarterTestCase):
    def test_organic_bakery_shape(self):
        response = self.plan()
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        for key in ("strategy", "kpi", "measures", "integrations", "channels", "budget", "calendar", "content",
                    "assumptions", "cached"):
            self.assertIn(key, body)
        self.assertEqual(body["strategy"]["from_insight"], 0)
        self.assertEqual(body["kpi"]["key"], "store_visits")
        self.assertEqual(body["kpi"]["baseline_he"], quarter.BASELINE_HE)
        self.assertTrue(body["kpi"]["available_now"])  # counted by the owner, needs nothing
        self.assertNotIn("target", body["kpi"])
        budget = body["budget"]
        self.assertTrue(budget["organic_only"])
        self.assertEqual(budget["monthly_ils"], 0)
        self.assertTrue(all(month["lines"] == [] for month in budget["months"]))
        self.assertTrue(budget["unlock_he"])
        self.assertEqual(len(budget["sources_he"]), 2)
        kinds = {c["key"]: (c["kind"], c["starts_month"]) for c in body["channels"]}
        self.assertEqual(kinds, {"instagram": ("existing", 1), "gbp": ("new", 2)})
        status = {i["key"]: i["status"] for i in body["integrations"]}
        self.assertEqual(status["instagram_insights"], "connect")
        self.assertEqual(status["gbp"], "unknown")
        self.assertNotIn("ga4", status)  # no website, nothing to install
        self.assertEqual([m["month_label"] for m in body["calendar"]],
                         [m["label"] for m in quarter.plan_months(date.today())])
        self.assertEqual(len(body["calendar"][0]["weeks"]), 4)
        self.assertEqual(body["content"][0]["cadence"][0]["per_week"], "1-2")  # hyphen, not en dash
        prompt = self.model.prompts[0]
        for fragment in ("בלי תקציב פרסום", "unlock_he", "איך כותבים בעברית", "יותר אנשים בחנות"):
            self.assertIn(fragment, prompt)

    def test_paid_channels_need_a_budget(self):
        bad = answer()
        bad["channels"].append({"key": "meta_ads", "why_he": "x", "based_on": "direction", "starts_month": 1,
                                "effort_he": "x", "cadence_he": "x"})
        self.model.answers = [bad, copy.deepcopy(bad)]
        body = self.plan().json()
        self.assertIn("עולה כסף, ואין תקציב", self.model.prompts[1])
        self.assertNotIn("meta_ads", [c["key"] for c in body["channels"]])

    def test_new_streams_are_capped_and_paced(self):
        many = answer()
        many["channels"] += [
            {"key": key, "why_he": "x", "based_on": "direction", "starts_month": 1, "effort_he": "x", "cadence_he": "x"}
            for key in ("whatsapp_list", "email", "local_partnerships")
        ]
        self.model.answers = [many, copy.deepcopy(many)]
        body = self.plan().json()
        new = [c for c in body["channels"] if c["kind"] == "new"]
        self.assertLessEqual(len(new), 2)  # posts "sometimes"
        self.assertEqual(len({c["starts_month"] for c in new}), len(new))  # one new stream a month

    def test_invented_numbers_and_dates(self):
        bad = answer()
        bad["channels"][0]["effort_he"] = "35 דקות בכל בוקר לצלם."
        bad["calendar"][1]["dates"] = [{"date": "2031-01-01", "action_he": "מבצע"}]
        self.model.answers = [bad, copy.deepcopy(bad)]
        body = self.plan().json()
        retry = self.model.prompts[1]
        self.assertIn("מספרים שלא נמסרו", retry)
        self.assertIn("2031-01-01", retry)
        self.assertNotIn("35 דקות", json.dumps(body, ensure_ascii=False))
        self.assertEqual(body["calendar"][1]["dates"], [])
        # The cost ranges are facts for the budget lines, so the unlock line keeps 2,500.
        self.assertIn("2,500", body["budget"]["unlock_he"])

    def test_inputs_revise_and_say_what_changed(self):
        self.plan()
        self.model.answers = [answer(changed_he="הורדנו את המבצעים.")]
        body = self.plan(inputs={"target": "10 הזמנות", "cadence": "1-2", "feedback": "פחות על מבצעים",
                                 "changed": ["target", "feedback"]}).json()
        prompt = self.model.prompts[1]
        self.assertIn("זו גרסה מתוקנת", prompt)
        self.assertIn("היעד שלהם: \"10 הזמנות\"", prompt)
        self.assertEqual(body["kpi"]["target"], "10 הזמנות")
        self.assertIn("הורדנו את המבצעים", body["changed_he"])
        self.assertIn("10 הזמנות", body["changed_he"])  # every changed input is named
        self.assertEqual(body["cadence"]["source"], "owner")

    def test_cached_and_limited(self):
        with mock.patch.object(public_router, "QUARTER_PER_IP", 1):
            self.assertEqual(self.plan().status_code, 200)
            self.assertTrue(self.plan().json()["cached"])
            self.assertEqual(self.plan(inputs={"target": "5 הזמנות"}).status_code, 429)
        self.assertEqual(len(self.model.prompts), 1)


class ShopWithBudgetTest(QuarterTestCase):
    def setUp(self):
        super().setUp()
        preview_service._cache_put(preview_service.cache_key("https://shop.example"), {"scan": SHOP_SCAN, "preview": {}})

    def shop_answer(self, lines):
        data = answer()
        data["kpi_how_he"] = "סופרים הזמנות באתר לפי נתוני האתר."
        data["measures"] = [{"name_he": "לחיצות על הקישור בביו", "how_he": "בנתוני האינסטגרם.",
                             "needs": ["instagram_insights"]}]
        data["channels"] = [
            {"key": "instagram", "why_he": "x", "based_on": "activity", "starts_month": 1, "effort_he": "x", "cadence_he": "1-2 בשבוע"},
            {"key": "meta_ads", "why_he": "x", "based_on": "tried", "starts_month": 1, "effort_he": "x", "cadence_he": "רץ ברקע"},
            {"key": "email", "why_he": "x", "based_on": "direction", "starts_month": 2, "effort_he": "x", "cadence_he": "פעם בשבועיים"},
        ]
        data["budget_months"] = [{"month": i, "lines": lines(i)} for i in (1, 2, 3)]
        data["unlock_he"] = ""
        return data

    def test_budget_lines_fit_and_integrations_are_ours(self):
        def lines(month):
            out = [{"channel_key": "meta_ads", "min_ils": 1500, "max_ils": 2600, "note_he": "רק למי שביקר באתר."}]
            if month == 1:
                out.append({"channel_key": "email", "min_ils": 100, "max_ils": 200, "note_he": "כלי דיוור."})
            return out

        self.model.answers = [self.shop_answer(lines), self.shop_answer(lines)]
        body = self.plan(draft=copy.deepcopy(SHOP)).json()
        self.assertIn("לפני החודש שהוא מתחיל", self.model.prompts[1])
        budget = body["budget"]
        self.assertFalse(budget["organic_only"])
        self.assertEqual(budget["monthly_ils"], 2000)
        self.assertIn("1,000-3,000", budget["basis_he"])
        month1 = budget["months"][0]["lines"]
        self.assertEqual([line["channel_key"] for line in month1], ["meta_ads"])  # email starts in month 2
        for month in budget["months"]:
            self.assertLessEqual(sum(line["ils_range"][1] for line in month["lines"]), 3000)
        status = {i["key"]: i for i in body["integrations"]}
        self.assertEqual(status["ga4"]["status"], "have")
        self.assertIn("זיהינו באתר", status["ga4"]["why_he"])
        self.assertIn("G-7MPBWRW3FT", status["ga4"]["why_he"])
        self.assertEqual(status["gtm"]["status"], "have")
        self.assertEqual(status["meta_pixel"]["status"], "unknown")  # GTM could be hiding it
        self.assertTrue(body["kpi"]["available_now"])
        kinds = {c["key"]: c["kind"] for c in body["channels"]}
        self.assertEqual(kinds["meta_ads"], "existing")  # they tried paid social
        self.assertIn("פרסום ממומן", self.model.prompts[0])  # the cost block is in front of the model

    def test_over_the_cap_is_scaled_down(self):
        lines = lambda month: [{"channel_key": "meta_ads", "min_ils": 3000, "max_ils": 6000, "note_he": "x"}]  # noqa: E731
        self.model.answers = [self.shop_answer(lines), self.shop_answer(lines)]
        body = self.plan(draft=copy.deepcopy(SHOP)).json()
        self.assertIn("עובר את התקרה", self.model.prompts[1])
        for month in body["budget"]["months"]:
            self.assertLessEqual(sum(line["ils_range"][1] for line in month["lines"]), 3000)


# --- after signup ----------------------------------------------------------------------------


class FromDraftQuarterTest(QuarterTestCase):
    def setUp(self):
        super().setUp()
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-quarter-"))
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
        self.quarter = self.plan(inputs={"target": "20 לקוחות בבוקר", "cadence": "1-2"}).json()

    def submit(self, draft=None, plan=None):
        body = {"draft": draft or copy.deepcopy(BAKERY), "chosen_direction": DIRECTION,
                "quarter_plan": plan or self.quarter}
        return self.client.post("/onboarding/from-draft", json=body)

    def test_the_plan_seeds_the_business(self):
        response = self.submit()
        self.assertEqual(response.status_code, 200, response.text)
        business = response.json()["business"]
        self.assertEqual(business["monthly_budget_ils"], 0)
        self.assertEqual(business["primary_goal"], "sales")
        self.assertEqual(business["quarter_plan"]["kpi"]["target"], "20 לקוחות בבוקר")
        self.assertEqual(business["long_horizon_plan"]["source"], "quarter_plan")
        self.assertEqual(len(business["long_horizon_plan"]["milestones"]), 3)
        checklist = {i["key"]: i for i in business["integrations_checklist"]}
        self.assertEqual(checklist["instagram_insights"]["status"], "connect")
        seed = business["first_month_seed"]
        self.assertEqual([p["key"] for p in seed["strategy"]["pillars"]], ["taboon", "zaatar"])
        self.assertEqual(seed["strategy"]["cadence"]["key"], "1-2")
        self.assertEqual(seed["strategy"]["success"]["owner_target"], "20 לקוחות בבוקר")
        self.assertEqual(seed["start"], self.quarter["start"])
        # Idempotent.
        again = self.submit().json()["business"]
        self.assertEqual(again["first_month_seed"], seed)
        self.assertEqual(self.db.query(Business).count(), 1)
        # The app can read it before the month exists.
        read = self.client.get("/strategy/quarter").json()
        self.assertEqual(read["quarter_plan"]["strategy"], self.quarter["strategy"])

    def test_a_client_cannot_mark_an_integration_have(self):
        plan = copy.deepcopy(self.quarter)
        plan["integrations"] = [{"key": "instagram_insights", "status": "have"}]
        self.submit(plan=plan)
        stored = loads(self.db.query(Business).one().scraped_profile_json, {})
        status = {i["key"]: i["status"] for i in stored["integrations_checklist"]}
        self.assertEqual(status["instagram_insights"], "connect")
        business = self.db.query(Business).one()
        self.db.add(Integration(business_id=business.id, provider="meta", status="connected"))
        self.db.commit()
        self.submit(plan=plan)
        stored = loads(self.db.query(Business).one().scraped_profile_json, {})
        self.assertEqual({i["key"]: i["status"] for i in stored["integrations_checklist"]}["instagram_insights"], "have")

    def test_generation_builds_the_plans_first_month_without_the_budget_step(self):
        self.submit()
        captured = {}

        def fake_generate(payload, **kwargs):
            captured.update(kwargs)
            captured["payload"] = payload
            return {"complete": False, "scraped_profile": kwargs["scan"], "generate_state": {"stage": "plan"}}

        with mock.patch.object(onboarding_router, "generate_monthly_strategy", side_effect=fake_generate):
            response = self.client.post("/onboarding/generate")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual((captured["year"], captured["month"]),
                         (self.quarter["start"]["year"], self.quarter["start"]["month"]))
        self.assertEqual(captured["payload"]["monthly_budget_ils"], 0)
        block = strategy_service._owner_block(captured["payload"])
        self.assertIn("הטאבון", block)
        self.assertIn("המדד העיקרי שבעל העסק בחר: יותר אנשים בחנות", block)


if __name__ == "__main__":
    unittest.main()


class HypothesisWordingTest(unittest.TestCase):
    """The plan states hypotheses to measure, never bets (owner, 2026-10-01)."""

    def test_bets_become_hypotheses(self):
        from app.services.quarter_plan import _as_hypothesis

        self.assertEqual(_as_hypothesis("אנחנו מהמרים שהטאבון מושך."), "אנחנו מניחים שהטאבון מושך.")
        self.assertEqual(_as_hypothesis("ההימור: הכרטיס בגוגל"), "ההשערה: הכרטיס בגוגל")
        self.assertEqual(_as_hypothesis("אנחנו מניחים ש..."), "אנחנו מניחים ש...")
