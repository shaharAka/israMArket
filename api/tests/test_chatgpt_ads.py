"""A proposed ads channel is not proof of eligibility or authority to spend."""
import _test_env  # noqa: F401
import unittest
from datetime import date
from app.services import onboarding_draft as drafts, quarter_plan as quarter
from test_quarter_plan import answer, SHOP

class ChatGPTAdsTest(unittest.TestCase):
    def parse(self, budget="1k-3k"):
        draft = drafts.OnboardingDraft(**{**SHOP, "budget": {"range": budget}})
        today = date(2026, 10, 6)
        parsed = answer(today)
        parsed["channels"].append({"key": "chatgpt_ads", "kind": "existing", "why_he": "מחובר וכבר מביא מכירות בישראל", "starts_month": 1, "effort_he": "אין מה לעשות", "cadence_he": "פעיל"})
        for month in parsed["budget_months"]:
            month["lines"].append({"channel_key": "chatgpt_ads", "min_ils": 500, "max_ils": 1000})
        frame = quarter.budget_frame(draft)
        plan, problems = quarter.parse_plan(parsed, draft, None, [], today, {}, frame, quarter.plan_months(today), set())
        return draft, frame, plan, problems

    def test_channel_is_available_for_planning_but_not_claimed_connected(self):
        draft, frame, plan, _ = self.parse()
        channel = next(c for c in plan["channels"] if c["key"] == "chatgpt_ads")
        self.assertEqual(channel["availability"], "needs_check")
        self.assertEqual(channel["kind"], "new")
        self.assertNotIn("מחובר", channel["why_he"])
        self.assertIn("עדיין בפיתוח", channel["effort_he"])
        self.assertIn("chatgpt_ads", quarter._channels_block(draft, frame))
        self.assertFalse(quarter.CHANNELS["chatgpt_ads"]["posting"])

    def test_unverified_account_cannot_receive_budget(self):
        _, _, plan, problems = self.parse()
        self.assertFalse(any(l["channel_key"] == "chatgpt_ads" for m in plan["budget"]["months"] for l in m["lines"]))
        self.assertTrue(any("אימות גישה" in p for p in problems))

    def test_no_budget_excludes_paid_ads(self):
        draft, frame, plan, _ = self.parse("none")
        self.assertNotIn("chatgpt_ads", [c["key"] for c in plan["channels"]])
        self.assertNotIn("chatgpt_ads", quarter._channels_block(draft, frame))

    def test_signup_cannot_turn_a_proposed_channel_into_verified_spend(self):
        raw = {"channels": [{"key": "chatgpt_ads", "availability": "ready", "kind": "existing"}],
               "budget": {"months": [{"lines": [{"channel_key": "chatgpt_ads", "ils_range": [500, 1000]}, {"channel_key": "meta_ads", "ils_range": [100, 200]}]}]}}
        saved = quarter.QuarterPlanIn(**raw).stored()
        self.assertEqual(saved["channels"][0]["availability"], "needs_check")
        self.assertEqual([l["channel_key"] for l in saved["budget"]["months"][0]["lines"]], ["meta_ads"])
