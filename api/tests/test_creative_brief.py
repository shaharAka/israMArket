"""Creative generation uses the marketing brief, without fabricating results."""
import _test_env  # noqa: F401

import unittest

from _dna_fixtures import DnaTestCase
from app.models import Audience, Strategy
from app.services.creative_brief import for_post, prompt_context
from app.services.images import visual_message


class BriefTest(DnaTestCase, unittest.TestCase):
    def setUp(self):
        self.setUp_dna()
        self.business = self.add_business("Design studio", field="design")
        self.other = self.add_business("Other shop")
        self.strategy = Strategy(business_id=self.business.id, year=2026, month=10,
                                 roadmap_json='{"roadmap":{"monthly_horizon_plan":{"hypothesis":"Consultations"}}}')
        self.audience = Audience(business_id=self.business.id, name="Renovating homeowners",
                                 summary="Need help before hiring a builder", needs_json='["Layout decisions"]')
        self.foreign = Audience(business_id=self.other.id, name="Foreign customers")
        self.db.add_all([self.strategy, self.audience, self.foreign])
        self.db.commit()

    def brief(self, **fields):
        return for_post({"audience_id": self.audience.id, "cta": "Book a consultation",
                         "content_language": "en", **fields}, self.business, self.strategy, self.db)

    def test_goal_audience_action_language_and_brand_brief_reach_generation(self):
        brief = self.brief(plan_link={"goal": "Qualified consultation requests"})
        self.assertEqual(brief["audience"]["name"], "Renovating homeowners")
        self.assertEqual(brief["goal"], "Qualified consultation requests")
        self.assertEqual(brief["content_language"], "en")
        text = visual_message({"title": "Choosing a layout", "creative_brief": brief})
        self.assertIn("Renovating homeowners", text)
        self.assertIn("Book a consultation", text)
        self.assertIn("approved brand identity", text)
        self.assertEqual(brief["learning_source"], "first_test")

    def test_a_foreign_or_unassigned_audience_is_not_substituted(self):
        for key in (self.foreign.id, None, 99999):
            self.assertIsNone(self.brief(audience_id=key)["audience"])

    def test_learning_without_measured_attribution_is_not_a_result(self):
        brief = self.brief(learning="This worked brilliantly", results={"value": 100})
        self.assertIsNone(brief["learning"])
        self.assertEqual(brief["learning_source"], "first_test")

    def test_existing_plan_learning_is_distinct_from_new_asset_performance(self):
        brief = self.brief(informed_by_note="Earlier layout examples brought inquiries")
        self.assertEqual(brief["learning_source"], "plan_learning")
        self.assertIn("not evidence", prompt_context({"creative_brief": brief}))

    def test_verified_post_observation_can_supply_learning(self):
        brief = self.brief(learning="Consultation inquiries increased", results={
            "observations": {"site_visits": {"source": "ga4", "read_at": "2026-10-10"}},
            "matched_by": ["utm"], "value": 14,
        })
        self.assertEqual(brief["learning_source"], "measured_post")
