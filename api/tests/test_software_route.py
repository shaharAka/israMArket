"""Software has a distinct owner context, first-post gate and unit of success."""
import _test_env  # noqa: F401
from datetime import date
from pydantic import ValidationError
from app.services import onboarding_draft as drafts, quarter_plan as quarter
from app.services.business_model import model_framing
import unittest
from unittest.mock import patch
from app.services.jsonutil import loads
import test_featured_recommendations as fixtures
from test_quarter_plan import answer

SOFTWARE = {
    "business_name": "מערכת לדוגמה", "business_type": "professional",
    "business_model": "saas", "offerings": "ניהול תיאום פגישות ותשלומים לסטודיואים",
    "software": {"stage": "beta", "buying_motion": "demo", "problem": "זמן רב על תיאום ותשלומים", "buyer": "מנהלות סטודיו", "market": "ישראל בעברית", "focus_product": "תיאום פגישות", "commercial_offer": "מנוי חודשי אחרי הדגמה", "product_evidence": "תיאום ותזכורת אמיתיים"},
    "budget": {"range": "none"},
}

class SoftwareRouteTest(unittest.TestCase):
    setUp = fixtures.FeaturedRecommendationsTest.setUp
    profile = fixtures.FeaturedRecommendationsTest.profile
    get = fixtures.FeaturedRecommendationsTest.get
    def test_context_survives_signup_and_partial_edit_without_shop_target(self):
        draft = drafts.OnboardingDraft(**SOFTWARE, grow_where="store", baseline={"orders_month": "20"})
        self.assertIsNone(draft.baseline)
        self.assertIsNone(draft.grow_where)
        self.profile({"goal_numbers": {"view": {"target_he": "חנויות"}}, "untouched": "keep"})
        drafts.apply_draft(self.db, self.business, draft)
        self.db.commit()
        self.assertEqual(self.business.business_model, "saas")
        stored = loads(self.business.scraped_profile_json, {})
        self.assertNotIn("goal_numbers", stored)
        self.assertEqual(stored["owner_context"]["software"]["buying_motion"], "demo")
        block = drafts.owner_context_block(stored["owner_context"])
        self.assertIn("בקשה להדגמה", block)
        self.assertIn("מנוי חודשי אחרי הדגמה", block)
        from app.services.strategy import _owner_block
        self.assertIn("תיאום ותזכורת אמיתיים", _owner_block({"owner_context": stored["owner_context"]}))
        drafts.apply_owner_context(self.business, drafts.OwnerContextIn(software={**SOFTWARE["software"], "market": "אירופה באנגלית"}))
        updated = loads(self.business.scraped_profile_json, {})
        self.assertEqual(updated["owner_context"]["software"]["market"], "אירופה באנגלית")
        self.assertEqual(updated["untouched"], "keep")

    def test_gate_and_recommendations_use_software_content_not_stock_products(self):
        self.business.business_model = "saas"
        self.business.offerings = SOFTWARE["offerings"]
        self.db.commit()
        payload = self.get()
        self.assertEqual(payload["business_model"], "saas")
        self.assertEqual(payload["min"], 1)
        self.assertNotIn("product", [k["key"] for k in payload["kinds"]])
        self.assertEqual(payload["kinds"][0], {"key": "offering", "label_he": "מוצר או יכולת"})
        demo = next(r for r in payload["recommendations"] if r["kind"] == "work")
        self.assertTrue(demo["needs_detail"])
        self.assertIn("אמיתית", demo["why_he"])
        self.assertNotIn("in_stock", [r["key"] for r in payload["reasons"]])
        base = self.client.get("/business/baseline").json()
        self.assertNotIn("orders_month", [f["key"] for f in base["fields"]])
        self.assertIn("software_signups_month", [f["key"] for f in base["fields"]])
        options = self.client.get("/public/success-options?model=saas").json()
        self.assertEqual(options["grow_where"], [])
        self.assertEqual({o["key"] for o in options["options"]}, {"software_signups", "software_demos", "software_paid"})

    def test_motion_and_goal_determine_metric_without_inventing_traction(self):
        for motion, goal, expected in [("demo", "leads", "software_demos"), ("waitlist", "leads", "software_signups"), ("self_serve", "sales", "software_paid")]:
            draft = drafts.OnboardingDraft(**{**SOFTWARE, "goal": goal, "software": {**SOFTWARE["software"], "buying_motion": motion}})
            self.assertEqual(draft.kpi_key, expected)
            today = date(2026, 10, 6)
            plan, _ = quarter.parse_plan(answer(today), draft, None, [], today, {}, quarter.budget_frame(draft), quarter.plan_months(today), set())
            self.assertEqual(plan["kpi"]["key"], expected)
            self.assertNotIn("target", plan["kpi"])
            self.assertFalse(quarter.has_numbers(draft))
            self.assertEqual(plan["budget"]["sources_he"], [])
            self.assertIn("אין כאן מקור מאומת", quarter._cost_blocks(draft, quarter.budget_frame(draft))[0])
        self.assertIn("אל תמציא", model_framing("saas"))

    def test_owner_selected_product_guides_topics_and_search_even_when_other_site_offers_rank(self):
        drafts.apply_draft(self.db, self.business, drafts.OnboardingDraft(**SOFTWARE))
        stored = loads(self.business.scraped_profile_json, {})
        stored["extracted"] = {"offers": ["ניהול תשלומים", "מוצר נוסף"]}
        self.profile(stored)
        data = self.get()
        self.assertEqual(data["recommendations"][0]["name"], "תיאום פגישות")
        self.assertEqual(data["recommendations"][0]["source_he"], "הבחירה שלכם")
        self.assertIn("תיאום פגישות", next(r["name"] for r in data["recommendations"] if r["kind"] == "work"))
        from app.services.research import research_seeds
        with patch("app.services.research.keywords.seeds_for", return_value=["תיאום פגישות"]) as seeds:
            self.assertEqual(research_seeds(self.business), ["תיאום פגישות"])
        self.assertIn("תיאום פגישות", seeds.call_args.args[0]["offerings"])
        self.assertNotIn("ניהול תשלומים", seeds.call_args.args[0]["offerings"])

    def test_bad_stage_rejected_and_software_does_not_leak_to_shop(self):
        with self.assertRaises(ValidationError):
            drafts.OnboardingDraft(**{**SOFTWARE, "software": {"stage": "funded"}})
        draft = drafts.OnboardingDraft(**{**SOFTWARE, "business_model": "products"})
        self.assertIsNone(draft.software)
