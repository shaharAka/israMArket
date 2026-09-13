import unittest

from pydantic import ValidationError

from app.schemas import OnboardingIn
from app.services.business_model import (
    diagnostics_for,
    goals_for,
    model_framing,
    normalise_model,
)
from app.services.cost_model import plan_from_budget, prompt_block


def _payload(**extra) -> dict:
    base = {
        "name": "סטודיו דנה",
        "business_type": "עיצוב / אדריכלות / נדל״ן",
        "offerings": "מיתוג וזהות חזותית לעסקים קטנים",
        "monthly_budget_ils": 4500,
        "primary_goal": "leads",
        "business_model": "services",
    }
    base.update(extra)
    return base


class FramingTest(unittest.TestCase):
    def test_services_framing_talks_about_leads_not_purchases(self):
        text = model_framing("services")
        self.assertIn("פנייה", text)
        self.assertIn("ROAS", text)  # named only to say it does not apply
        self.assertNotIn("יחידת ההמרה היא רכישה", text)

    def test_products_framing_is_purchase_shaped(self):
        text = model_framing("products")
        self.assertIn("רכישה", text)

    def test_unknown_model_falls_back_to_products(self):
        self.assertEqual(normalise_model("nonsense"), "products")
        self.assertEqual(normalise_model(""), "products")
        self.assertEqual(normalise_model(None), "products")
        self.assertIn("רכישה", model_framing("nonsense"))

    def test_goal_sets_do_not_overlap_wrongly(self):
        self.assertEqual(set(goals_for("services")), {"leads", "personal_brand"})
        self.assertEqual(set(goals_for("products")), {"sales", "brand_awareness"})
        self.assertIn("sales", goals_for("both"))
        self.assertIn("leads", goals_for("both"))

    def test_diagnostics_are_model_specific(self):
        self.assertIn("has_customer_club", diagnostics_for("products"))
        self.assertNotIn("has_customer_club", diagnostics_for("services"))
        self.assertIn("lead_source", diagnostics_for("services"))
        self.assertIn("capacity_constraint", diagnostics_for("services"))


class ServiceCostModelTest(unittest.TestCase):
    """The published CPA/ROAS figures are e-commerce purchase figures. Turning them into
    a cost per lead would be exactly the invented number this module exists to prevent."""

    def test_services_get_no_purchase_or_roas_estimate(self):
        plan = plan_from_budget(4500, "leads", "services")
        self.assertEqual(plan.expected_purchases, (0, 0))
        self.assertEqual(plan.realistic_roas, (0.0, 0.0))
        self.assertEqual(plan.conversion_unit, "פנייה (ליד)")

    def test_services_still_get_reach_and_clicks(self):
        plan = plan_from_budget(4500, "leads", "services")
        self.assertGreater(plan.expected_clicks[1], 0)
        self.assertGreater(plan.expected_impressions[1], 0)

    def test_services_are_told_why_there_is_no_lead_cost(self):
        plan = plan_from_budget(4500, "leads", "services")
        self.assertTrue(any("אין כאן אומדן לעלות פנייה" in w for w in plan.warnings))
        self.assertFalse(any("CPA בישראל" in a for a in plan.assumptions))
        self.assertFalse(any("ROAS סביר" in a for a in plan.assumptions))

    def test_products_keep_their_purchase_numbers(self):
        plan = plan_from_budget(4500, "sales", "products")
        self.assertGreater(plan.expected_purchases[1], 0)
        self.assertNotEqual(plan.realistic_roas, (0.0, 0.0))
        self.assertTrue(any("CPA בישראל" in a for a in plan.assumptions))

    def test_prompt_block_never_offers_roas_to_a_service_business(self):
        block = prompt_block(plan_from_budget(4500, "leads", "services"))
        self.assertNotIn("ROAS ריאלי", block)
        self.assertNotIn("טווח רכישות", block)
        self.assertIn("אל תמציא", block)

    def test_prompt_block_keeps_roas_for_products(self):
        block = prompt_block(plan_from_budget(4500, "sales", "products"))
        self.assertIn("ROAS ריאלי", block)


class GoalModelRuleTest(unittest.TestCase):
    def test_service_business_accepts_a_lead_goal(self):
        parsed = OnboardingIn(**_payload())
        self.assertEqual(parsed.primary_goal, "leads")
        self.assertEqual(parsed.business_model, "services")

    def test_service_business_rejects_a_sales_goal(self):
        with self.assertRaises(ValidationError):
            OnboardingIn(**_payload(primary_goal="sales"))

    def test_product_business_rejects_a_lead_goal(self):
        with self.assertRaises(ValidationError):
            OnboardingIn(**_payload(business_model="products", primary_goal="leads"))

    def test_both_accepts_either_family(self):
        for goal in ("sales", "leads", "brand_awareness", "personal_brand"):
            parsed = OnboardingIn(**_payload(business_model="both", primary_goal=goal))
            self.assertEqual(parsed.primary_goal, goal)

    def test_service_diagnostics_accept_the_new_fields(self):
        parsed = OnboardingIn(
            **_payload(
                diagnostics={
                    "lead_source": "referrals",
                    "has_portfolio": "partial",
                    "brand_owner": "personal",
                    "capacity_constraint": "עובדת לבד, עד 3 פרויקטים במקביל",
                }
            )
        )
        self.assertEqual(parsed.diagnostics.lead_source, "referrals")
        self.assertEqual(parsed.diagnostics.brand_owner, "personal")


if __name__ == "__main__":
    unittest.main()
