"""Service acquisition answers reach plans without becoming measured attribution."""
import _test_env  # noqa: F401

import copy
import json
import unittest
from datetime import date
from unittest import mock

from pydantic import ValidationError

import test_onboarding_draft as fixture
import test_quarter_plan as quarter_fixture
from app.models import Business
from app.services import onboarding_draft as drafts, quarter_plan, strategy


SOURCES = {"status": "known", "channels": ["referrals", "social"],
           "main_channel": "referrals", "details": "ממליצים על ליווי אישי בתכנון המטבח"}


def designer(**overrides):
    return drafts.OnboardingDraft.model_validate({**copy.deepcopy(fixture.BAKERY),
        "business_name": "סטודיו לדוגמה", "business_type": "home", "business_model": "services",
        "goal": "leads", "offerings": "עיצוב מטבחים קטנים למשפחות",
        "client_sources": copy.deepcopy(SOURCES), **overrides})


class AcquisitionValidationTest(unittest.TestCase):
    def test_unknown_is_distinct_from_starting_and_legacy_absence(self):
        legacy = designer(client_sources=None)
        self.assertNotIn("client_sources", drafts.owner_context(legacy))
        unknown = drafts._draft_block(designer(client_sources={"status": "unknown"}))
        starting = drafts._draft_block(designer(client_sources={"status": "starting"}))
        self.assertIn("לא להסיק שאין לקוחות", unknown)
        self.assertIn("עוד לא הגיעו לקוחות", starting)
        self.assertNotIn("עוד לא הגיעו לקוחות", unknown)

    def test_rejects_contradictory_sources_and_unknown_values(self):
        for value in ({"status": "known"}, {"status": "unknown", "channels": ["social"]},
                      {"status": "starting", "main_channel": "social"},
                      {"status": "known", "channels": ["referrals"], "main_channel": "social"},
                      {"status": "known", "channels": ["invented"]}):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                designer(client_sources=value)
        self.assertEqual(designer(client_sources={**SOURCES, "channels": ["social", "social"] ,
                                                 "main_channel": "social"}).client_sources.channels, ["social"])

    def test_partial_edit_keeps_scan_seed_and_tactics_and_can_clear_acquisition(self):
        stored = {"scan": {"real": True}, "first_month_seed": {"direction": {"title": "ליווי אישי"}},
                  "owner_context": drafts.owner_context(designer())}
        business = Business(name="סטודיו לדוגמה", user_id=1, scraped_profile_json=json.dumps(stored))
        drafts.apply_owner_context(business, drafts.OwnerContextIn(differentiator="ליווי בתקציב מוגדר"))
        kept = json.loads(business.scraped_profile_json)
        self.assertEqual(kept["owner_context"]["client_sources"], SOURCES)
        drafts.apply_owner_context(business, drafts.OwnerContextIn(client_sources={"status": "unknown"}))
        changed = json.loads(business.scraped_profile_json)
        self.assertEqual(changed["owner_context"]["client_sources"]["status"], "unknown")
        self.assertEqual(changed["owner_context"]["tried"], stored["owner_context"]["tried"])
        self.assertEqual(changed["scan"], stored["scan"])
        self.assertEqual(changed["first_month_seed"], stored["first_month_seed"])
        drafts.apply_owner_context(business, drafts.OwnerContextIn(client_sources=None))
        self.assertNotIn("client_sources", json.loads(business.scraped_profile_json)["owner_context"])

    def test_corrupt_stored_acquisition_cannot_crash_monthly_planning(self):
        context = {"client_sources": {"status": "known", "channels": ["invented"]},
                   "differentiator": "ליווי אישי"}
        block = drafts.owner_context_block(context)
        self.assertIn("ליווי אישי", block)
        self.assertNotIn("invented", block)


class AcquisitionPromptTest(fixture.DraftTestCase):
    def test_research_and_plan_keep_owner_sources_separate_from_attempted_tactics(self):
        draft = designer(tried={"channels": ["paid_social"], "what_worked": "עוד לא ברור"})
        response = self.post("/public/audiences", {"draft": draft.model_dump()})
        self.assertEqual(response.status_code, 200, response.text)
        drafts.build_plan_preview(draft, today=date(2026, 9, 26))
        for prompt in (self.models.lite_prompts[0], self.models.plan_prompts[0]):
            self.assertIn("המקור העיקרי שסימנו: המלצות אישיות", prompt)
            self.assertIn(SOURCES["details"], prompt)
            self.assertIn("לא נתונים שמדדנו", prompt)
            self.assertIn("עוד לא ברור", prompt)
        monthly = strategy._owner_block({"owner_context": drafts.owner_context(draft)})
        self.assertIn("אין להסיק אחוזים", monthly)
        self.assertIn(SOURCES["details"], monthly)

    def test_first_plan_receives_actual_acquisition(self):
        with mock.patch.object(drafts, "_strategy_call", return_value=json.dumps(quarter_fixture.answer(), ensure_ascii=False)) as call:
            quarter_plan.build_quarter_plan(designer(), fixture.DIRECTION, today=date(2026, 9, 26))
        prompt = call.call_args_list[0].args[0]
        self.assertIn("המקור העיקרי שסימנו: המלצות אישיות", prompt)
        self.assertIn("לא נתונים שמדדנו", prompt)

