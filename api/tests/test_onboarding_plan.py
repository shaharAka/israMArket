import json
import unittest
from unittest import mock

from pydantic import ValidationError

from app.schemas import DiagnosticsIn, OnboardingIn
from app.services import strategy as strategy_service


def _business() -> dict:
    return {"name": "מאפיית לחם תום", "monthly_budget_ils": 4500, "primary_goal": "sales"}


def _usp() -> dict:
    return {"usp": "חלה מחמצת", "growth_hypothesis": "אם נסגור הזמנות מוקדם נמכור יותר"}


APPROVED_PLAN = {
    "horizon": "שלושת החודשים הקרובים",
    "hypothesis": "אם נבנה קלאב לקוחות נגדיל מכירות חוזרות",
    "targets": ["300 חברי קלאב"],
    "milestones": [
        {"month_label": "אוקטובר", "milestone": "השקת הקלאב", "checkpoint": "100 נרשמים"},
    ],
}

# What the month model would write on its own if it were allowed to.
RIVAL_PLAN = {
    "horizon": "רבעון",
    "hypothesis": "תוכנית מתחרה שהמודל המציא",
    "targets": ["משהו אחר"],
    "milestones": [],
}


def _core_payload(long_horizon_plan: dict) -> str:
    return json.dumps(
        {
            "theme": "חגי תשרי",
            "summary": "סיכום החודש",
            "relevant_events": [],
            "long_horizon_plan": long_horizon_plan,
            "monthly_horizon_plan": {"hypothesis": "החודש", "targets": ["יעד חודשי"]},
            "management_and_checkpoints": {
                "how_we_help": "אנחנו בונים",
                "when_we_need_user": [],
                "checkpoints": [],
            },
            "weekly_breakdown": [{"week": 1, "focus": "פתיחה"}],
        },
        ensure_ascii=False,
    )


class ApprovedQuarterPlanTest(unittest.TestCase):
    """The quarter plan is what the owner read and approved during onboarding. The month
    plan is generated later and must never silently replace it."""

    def test_approved_plan_survives_a_rival_plan_from_the_model(self):
        with mock.patch.object(
            strategy_service, "strategy_json", return_value=_core_payload(RIVAL_PLAN)
        ):
            core = strategy_service.build_roadmap(
                _business(), _usp(), [], {}, {}, long_horizon=APPROVED_PLAN
            )
        self.assertEqual(core["long_horizon_plan"], APPROVED_PLAN)
        self.assertNotEqual(core["long_horizon_plan"]["hypothesis"], RIVAL_PLAN["hypothesis"])

    def test_model_plan_is_kept_when_nothing_was_approved(self):
        with mock.patch.object(
            strategy_service, "strategy_json", return_value=_core_payload(RIVAL_PLAN)
        ):
            core = strategy_service.build_roadmap(_business(), _usp(), [], {}, {})
        self.assertEqual(core["long_horizon_plan"], RIVAL_PLAN)

    def test_approved_plan_is_put_in_front_of_the_model(self):
        captured = {}

        def fake(prompt, schema):
            captured["prompt"] = prompt
            return _core_payload(RIVAL_PLAN)

        with mock.patch.object(strategy_service, "strategy_json", side_effect=fake):
            strategy_service.build_roadmap(
                _business(), _usp(), [], {}, {}, long_horizon=APPROVED_PLAN
            )
        self.assertIn(APPROVED_PLAN["hypothesis"], captured["prompt"])
        self.assertIn("אסור לשנות", captured["prompt"])


class ProposeTargetsTest(unittest.TestCase):
    def test_rejects_too_few_targets(self):
        with mock.patch.object(
            strategy_service,
            "strategy_json",
            return_value=json.dumps({"targets": [{"id": "1", "category": "מכירות", "target": "x", "why_this": "y"}]}),
        ):
            with self.assertRaises(RuntimeError):
                strategy_service.propose_targets(_business(), {}, {}, None)

    def test_returns_candidates_for_ranking(self):
        items = [
            {"id": str(i), "category": "מכירות", "target": f"יעד {i}", "why_this": "כי"}
            for i in range(6)
        ]
        with mock.patch.object(
            strategy_service, "strategy_json", return_value=json.dumps({"targets": items})
        ):
            result = strategy_service.propose_targets(_business(), {}, {}, None)
        self.assertEqual(len(result), 6)

    def test_prompt_asks_for_exactly_three_recommendations(self):
        captured = {}

        def fake(prompt, schema):
            captured["prompt"] = prompt
            return json.dumps({"targets": []})

        with mock.patch.object(strategy_service, "strategy_json", side_effect=fake):
            with self.assertRaises(RuntimeError):
                strategy_service.propose_targets(_business(), {}, {}, None)
        self.assertIn("שלושה", captured["prompt"])
        self.assertIn("recommended_rank", captured["prompt"])

    def test_ranked_order_is_passed_to_the_quarter_planner(self):
        captured = {}

        def fake(prompt, schema):
            captured["prompt"] = prompt
            return json.dumps(APPROVED_PLAN, ensure_ascii=False)

        ranked = ["היעד החשוב ביותר", "היעד השני", "היעד השלישי"]
        with mock.patch.object(strategy_service, "strategy_json", side_effect=fake):
            strategy_service.build_long_horizon_plan(_business(), {}, {}, ranked, None)

        prompt = captured["prompt"]
        for target in ranked:
            self.assertIn(target, prompt)
        # The owner's order must survive into the prompt, not be alphabetised or ranked.
        self.assertLess(prompt.index(ranked[0]), prompt.index(ranked[1]))
        self.assertLess(prompt.index(ranked[1]), prompt.index(ranked[2]))

    def test_incomplete_quarter_plan_is_rejected(self):
        with mock.patch.object(
            strategy_service, "strategy_json", return_value=json.dumps({"hypothesis": "רק השערה"})
        ):
            with self.assertRaises(RuntimeError):
                strategy_service.build_long_horizon_plan(_business(), {}, {}, ["יעד"], None)


class OnboardingSchemaTest(unittest.TestCase):
    def _base(self, **extra) -> dict:
        payload = {
            "name": "מאפיית לחם תום",
            "business_type": "מאפייה / קפה / מסעדה",
            "offerings": "חלות ולחמים",
            "monthly_budget_ils": 4500,
            "primary_goal": "sales",
        }
        payload.update(extra)
        return payload

    def test_diagnostics_and_plan_are_accepted(self):
        parsed = OnboardingIn(
            **self._base(
                diagnostics={
                    "has_customer_club": "no",
                    "repeat_vs_new": "balanced",
                    "priority_channel": "physical",
                    "capacity_constraint": "תנור אחד",
                },
                long_horizon_plan=APPROVED_PLAN,
                growth_targets=["א", "ב"],
            )
        )
        self.assertEqual(parsed.diagnostics.has_customer_club, "no")
        self.assertEqual(parsed.long_horizon_plan, APPROVED_PLAN)
        self.assertEqual(parsed.growth_targets, ["א", "ב"])

    def test_diagnostics_are_optional(self):
        parsed = OnboardingIn(**self._base())
        self.assertIsNone(parsed.diagnostics)
        self.assertIsNone(parsed.long_horizon_plan)

    def test_unknown_diagnostic_value_is_rejected(self):
        with self.assertRaises(ValidationError):
            OnboardingIn(**self._base(diagnostics={"has_customer_club": "maybe"}))

    def test_more_than_three_priorities_is_rejected(self):
        # A quarter with four priorities has none; the cap is not just a UI rule.
        with self.assertRaises(ValidationError):
            OnboardingIn(**self._base(growth_targets=["א", "ב", "ג", "ד"]))

    def test_exactly_three_priorities_is_allowed(self):
        parsed = OnboardingIn(**self._base(growth_targets=["א", "ב", "ג"]))
        self.assertEqual(len(parsed.growth_targets), 3)

    def test_partial_diagnostics_are_allowed(self):
        parsed = DiagnosticsIn(has_customer_club="unsure")
        self.assertIsNone(parsed.repeat_vs_new)
        self.assertEqual(parsed.capacity_constraint, "")


if __name__ == "__main__":
    unittest.main()
