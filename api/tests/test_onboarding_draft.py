"""Onboarding v2: the /start draft, the anonymous endpoints it calls, and /onboarding/from-draft.

Hermetic: every model call is replaced (`onboarding_draft.lite_json` for audiences,
`onboarding_draft._strategy_call` for the plan preview, the preview builders for the
brand), and the brand's SSRF fast path is stubbed except where the test is about it.
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
from app.models import Audience, Business, User
from app.routers import onboarding as onboarding_router
from app.routers import public_onboarding as public_router
from app.services import gemini
from app.services import onboarding_draft as drafts
from app.services import preview as preview_service
from app.services import ratelimit
from app.services import strategy as strategy_service
from app.services.jsonutil import loads

BAKERY = {
    "business_name": "  מאפיית הפשפשים  ",
    "business_type": "מאפייה / קפה / מסעדה",
    "offerings": "לחם מחמצת, חלות לשישי ובורקס. אופים כל בוקר מ-05:00 ליד שוק הפשפשים.",
    "differentiator": "המחמצת נאפית מול הלקוחות",
    "city": "יפו",
    "links": {"instagram": "@Pishpeshim_Bakery"},
    "activity": {"instagram": "sometimes"},
    "business_model": "products",
    "goal": "sales",
    "audiences": [
        {"name": "תושבי השכונה", "description": "קונים לחם בבוקר בדרך לעבודה"},
        {"name": "מבקרים בשוק בסופ״ש", "description": "מסתובבים בשוק ומחפשים משהו לאכול"},
    ],
    "seasons": {"busy": [9, 10], "slow": [7, 8]},
    "tried": {"channels": ["social_posts", "word_of_mouth"], "what_worked": "רוב הלקוחות מגיעים מהמלצות"},
    "competitors": [{"name": "אבולעפיה", "link": "@abulafia_bakery"}, {"name": "לחמים", "link": "lehamim.co.il"}],
}

SCAN = {
    "raw": {"url": "https://bakery.example", "title": "מאפיית הפשפשים", "headings": ["לחם מחמצת"],
            "text": "אופים מחמצת כל בוקר ביפו. 12 סוגי לחם."},
    "extracted": {"business_name": "מאפיית הפשפשים", "location": "יפו", "offers": ["חלות"],
                  "value_propositions": ["מחמצת אמיתית"], "proof_points": []},
    "brand_language": {
        "business_name": "מאפיית הפשפשים",
        "palette": [{"hex": "#c0392b", "role": "primary", "name": "אדום"}],
        "typography": {"primary": "Heebo", "mood": "חם"},
        "voice": "חם ושכונתי",
        "offers_seen": ["חלות", "לחם מחמצת"],
        "logo_url": "https://bakery.example/logo.png",
        "messaging": ["טרי כל בוקר"],
    },
}


def idea(index: int, fmt: str, text: str = "") -> dict:
    return {
        "direction_index": index,
        "title": f"רעיון {fmt} {index}",
        "format": fmt,
        "hook": f"החלות יוצאות מהתנור בשישי בבוקר {text}".strip(),
        "caption": "אנחנו אופים מול העיניים שלכם. בואו לראות את המחמצת. מחכה לכם חלה חמה.",
        "cta": "לבוא בשישי",
        "overlay_headline": "חלה חמה לשישי",
        "why": {
            "audience": "תושבי השכונה",
            "goal_he": "יותר קונים בשישי",
            "timing_he": "לפני שמחת תורה, כשכולם קונים לשולחן החג",
            "reason_he": "תושבי השכונה קונים חלה לשישי, והאפייה מול העיניים היא מה שמייחד אתכם.",
        },
    }


def plan_answer(**overrides) -> dict:
    answer = {
        "insights": [
            {"text_he": "סיפרתם שרוב הלקוחות מגיעים מהמלצות, ולכן כל פוסט צריך לתת להם משהו להעביר הלאה.", "source": "answers"},
            {"text_he": "אתם מפרסמים באינסטגרם רק לפעמים, ולכן נתחיל בקצב שאפשר להחזיק.", "source": "social"},
            {"text_he": "שמחת תורה בעוד שבוע, והשולחן של החג מתחיל בחלה.", "source": "calendar"},
            {"text_he": "במאפיות שכונתיות הקונים חוזרים לפי הרגל שבועי.", "source": "category"},
        ],
        "directions": [
            {"title": "חלת שישי של השכונה", "approach_he": "פוסט אחד בשבוע באינסטגרם על חלות שישי.",
             "audience": "תושבי השכונה", "goal_he": "יותר קונים בשישי", "why_he": "זה ההרגל שכבר קיים.",
             "first_steps": ["לצלם את החלות יוצאות מהתנור", "לכתוב מתי אפשר להזמין", "להעלות סטורי ביום חמישי"]},
            {"title": "מחמצת מול העיניים", "approach_he": "רילס של האפייה בשוק.",
             "audience": "מבקרים בשוק בסופ״ש", "goal_he": "שיכירו אותנו", "why_he": "זה מה שמייחד אתכם.",
             "first_steps": ["לצלם את הלישה", "לשאול לקוח מה הוא אוהב", "להעלות רילס קצר"]},
        ],
        "ideas": [idea(0, "reel"), idea(0, "carousel"), idea(0, "image"),
                  idea(1, "reel"), idea(1, "carousel"), idea(1, "story")],
    }
    answer.update(overrides)
    return answer


AUDIENCES_ANSWER = {
    "audiences": [
        {"name": "משפחות לשישי", "description": "קונים חלות לארוחת שישי", "why_he": "כתבתם שאתם אופים חלות לשישי."},
        {"name": "עובדים בבוקר", "description": "עוצרים לקפה ומאפה", "why_he": "כתבתם שאתם אופים כל בוקר."},
        {"name": "תיירים בשוק", "description": "מסתובבים בשוק הפשפשים", "why_he": "אתם ליד השוק."},
    ]
}


class FakeModels:
    """Records every prompt; answers the plan from a queue, audiences from a constant."""

    def __init__(self):
        self.plan_prompts: list[str] = []
        self.lite_prompts: list[str] = []
        self.plan_answers: list = []

    def strategy(self, prompt, schema):
        self.plan_prompts.append(prompt)
        answer = self.plan_answers.pop(0) if self.plan_answers else plan_answer()
        if isinstance(answer, Exception):
            raise answer
        return json.dumps(answer, ensure_ascii=False)

    def lite(self, prompt, schema, images=None, thinking_level="LOW"):
        self.lite_prompts.append(prompt)
        return json.dumps(AUDIENCES_ANSWER, ensure_ascii=False)


class DraftTestCase(unittest.TestCase):
    def setUp(self):
        ratelimit.reset()
        preview_service.reset_cache()
        public_router.answers.clear()
        self.models = FakeModels()
        self._patches = [
            mock.patch.object(drafts, "_strategy_call", side_effect=self.models.strategy),
            mock.patch.object(drafts, "lite_json", side_effect=self.models.lite),
        ]
        for patch in self._patches:
            patch.start()
        self.addCleanup(self._cleanup)
        self.client = TestClient(app)

    def _cleanup(self):
        for patch in reversed(self._patches):
            patch.stop()
        app.dependency_overrides.clear()
        ratelimit.reset()
        preview_service.reset_cache()
        public_router.answers.clear()

    def post(self, path: str, body: dict, ip: str = "203.0.113.9"):
        return self.client.post(path, json=body, headers={"X-Forwarded-For": ip})

    def draft(self, **overrides) -> dict:
        data = copy.deepcopy(BAKERY)
        data.update(overrides)
        return data


# --- draft validation ---------------------------------------------------------------


class DraftValidationTest(unittest.TestCase):
    def make(self, **overrides):
        data = copy.deepcopy(BAKERY)
        data.update(overrides)
        return drafts.OnboardingDraft(**data)

    def test_valid_draft_is_normalised(self):
        draft = self.make(offerings="לחם‏   מחמצת\x07 וחלות")
        self.assertEqual(draft.business_name, "מאפיית הפשפשים")
        self.assertEqual(draft.offerings, "לחם מחמצת וחלות")
        self.assertEqual(draft.links.instagram, "https://www.instagram.com/pishpeshim_bakery/")
        self.assertEqual(draft.links.handle("instagram"), "pishpeshim_bakery")
        self.assertEqual(draft.model, "products")
        self.assertEqual(draft.goal_key, "sales")

    def test_model_is_inferred_from_the_type(self):
        draft = self.make(business_type='שירותים מקצועיים (עו"ד, רו"ח, ייעוץ)', business_model=None, goal=None)
        self.assertEqual(draft.model, "services")
        self.assertEqual(draft.goal_key, "leads")

    def test_rejects_junk_and_bad_enums(self):
        bad = [
            {"business_type": "חללית"},
            {"business_name": "!!!!"},
            {"business_name": "אאאאאאאא"},
            {"offerings": "12345"},
            {"audiences": [{"name": f"קהל {i}"} for i in range(4)]},
            {"goal": "leads"},  # a shop has no inquiry goal
            {"style_preset": "neon"},
            {"seasons": {"busy": [13]}},
            {"seasons": {"busy": [5], "slow": [5]}},
            {"tried": {"channels": ["billboards"]}},
            {"activity": {"instagram": "daily"}},
            {"competitors": [{"name": f"מתחרה {i}"} for i in range(4)]},
            {"offerings": "א" * 901},
        ]
        for overrides in bad:
            with self.subTest(overrides=list(overrides)):
                with self.assertRaises(ValidationError):
                    self.make(**overrides)

    def test_duplicate_audiences_collapse(self):
        draft = self.make(audiences=[{"name": "תושבי השכונה"}, {"name": "תושבי  השכונה "}])
        self.assertEqual(len(draft.audiences), 1)

    def test_links_per_network(self):
        links, errors = drafts.normalize_links(
            {
                "website": "Bakery.co.il/",
                "instagram": "https://instagram.com/Some.Shop/",
                "facebook": "https://m.facebook.com/lechem.tom.jaffa?ref=x",
                "tiktok": "https://www.tiktok.com/@shop_tlv?lang=he",
            }
        )
        self.assertEqual(errors, {})
        self.assertEqual(links["website"], "https://bakery.co.il")
        self.assertEqual(links["instagram"], {"url": "https://www.instagram.com/some.shop/", "handle": "some.shop"})
        self.assertEqual(links["facebook"]["url"], "https://www.facebook.com/lechem.tom.jaffa")
        self.assertEqual(links["tiktok"], {"url": "https://www.tiktok.com/@shop_tlv", "handle": "shop_tlv"})

        _, errors = drafts.normalize_links(
            {
                "website": "https://instagram.com/shop",
                "instagram": "https://facebook.com/shop",
                "facebook": "https://www.facebook.com/groups/123",
                "tiktok": "https://vm.tiktok.com/ZSabc/",
            }
        )
        self.assertEqual(set(errors), {"website", "instagram", "facebook", "tiktok"})
        for message in errors.values():
            self.assertRegex(message, "[א-ת]")

    def test_facebook_profile_id_links(self):
        url, handle = drafts.normalize_facebook("https://www.facebook.com/profile.php?id=1000123")
        self.assertEqual((url, handle), ("https://www.facebook.com/profile.php?id=1000123", "1000123"))

    def test_competitor_links_are_classified(self):
        draft = self.make()
        kinds = [(c.name, c.kind, c.handle) for c in draft.competitors]
        self.assertEqual(kinds, [("אבולעפיה", "instagram", "abulafia_bakery"), ("לחמים", "website", "")])
        with self.assertRaises(ValidationError):
            self.make(competitors=[{"name": "מישהו", "link": "https://tiktok.com/video/1"}])


class LinksEndpointTest(DraftTestCase):
    def test_returns_canonical_links_and_hebrew_errors(self):
        response = self.post("/public/links", {"links": {"instagram": "@Shop", "tiktok": "a"}})
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["links"]["instagram"]["handle"], "shop")
        self.assertIn("tiktok", body["errors"])


# --- the plan preview -----------------------------------------------------------------


class PlanPreviewTest(DraftTestCase):
    def test_works_without_a_website(self):
        response = self.post("/public/plan-preview", {"draft": self.draft()})
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertIsNone(body["brand"])
        self.assertEqual(len(body["directions"]), 2)
        self.assertEqual(len(body["ideas"]), 6)
        self.assertTrue(3 <= len(body["insights"]) <= 4)
        for insight in body["insights"]:
            self.assertIn(insight["source"], drafts.INSIGHT_SOURCES)
        for direction in body["directions"]:
            for field in ("title", "approach_he", "audience", "goal_he", "why_he"):
                self.assertTrue(direction[field], field)
            self.assertEqual(len(direction["first_steps"]), 3)
        for item in body["ideas"]:
            self.assertIn(item["direction_index"], (0, 1))
            self.assertIn(item["format"], drafts.FORMATS)
            for field in ("audience", "goal_he", "timing_he", "reason_he"):
                self.assertTrue(item["why"][field], field)
        for index in (0, 1):
            formats = {i["format"] for i in body["ideas"] if i["direction_index"] == index}
            self.assertEqual(len(formats), 3)
        prompt = self.models.plan_prompts[0]
        self.assertIn("לא קראנו אתר", prompt)
        self.assertIn("איך כותבים בעברית", prompt)
        # The first-meeting answers reach the prompt, competitors as "mentioned".
        for fragment in ("המחמצת נאפית מול הלקוחות", "המלצות מפה לאוזן", "ספטמבר", "אבולעפיה", "לא בדקנו אותם"):
            self.assertIn(fragment, prompt)
        self.assertLessEqual(len(prompt), drafts.MAX_PROMPT_CHARS)

    def test_uses_the_cached_site_and_returns_its_brand(self):
        preview_service._cache_put(preview_service.cache_key("https://bakery.example"), {"scan": SCAN, "preview": {}})
        response = self.post("/public/plan-preview", {"draft": self.draft(links={"website": "bakery.example"})})
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["brand"]["business_name"], "מאפיית הפשפשים")
        self.assertEqual(body["brand"]["logo_url"], "https://bakery.example/logo.png")
        prompt = self.models.plan_prompts[0]
        self.assertIn("מה ראינו באתר", prompt)
        self.assertIn("12 סוגי לחם", prompt)

    def test_a_source_we_did_not_have_is_retried_then_dropped(self):
        answer = plan_answer()
        answer["insights"][0] = {"text_he": "באתר כתוב שאתם אופים מחמצת.", "source": "site"}
        self.models.plan_answers = [answer, answer]
        body = self.post("/public/plan-preview", {"draft": self.draft()}).json()
        self.assertEqual(len(self.models.plan_prompts), 2)
        self.assertIn("אין לנו מקור כזה", self.models.plan_prompts[1])
        self.assertNotIn("site", [i["source"] for i in body["insights"]])

    def test_invented_numbers_are_retried_then_removed(self):
        answer = plan_answer()
        answer["ideas"][0]["caption"] = "אנחנו אופים מול העיניים שלכם. כבר 25 שנה ו-500 לקוחות מרוצים. בואו בשישי."
        answer["insights"][3] = {"text_he": "73% מהקונים במאפיות חוזרים.", "source": "category"}
        self.models.plan_answers = [answer, answer]
        body = self.post("/public/plan-preview", {"draft": self.draft()}).json()
        self.assertEqual(len(self.models.plan_prompts), 2)
        self.assertIn("מספרים שלא נמסרו", self.models.plan_prompts[1])
        dumped = json.dumps(body, ensure_ascii=False)
        for invented in ("25 שנה", "500", "73%"):
            self.assertNotIn(invented, dumped)
        # Numbers the owner gave us survive.
        self.assertIn("05:00", drafts.allowed_numbers(BAKERY))

    def test_audience_names_snap_to_the_owners_list(self):
        answer = plan_answer()
        answer["ideas"][0]["why"]["audience"] = "תושבי השכונה שקונים לשישי"
        answer["ideas"][1]["why"]["audience"] = "קהל שלא קיים"
        self.models.plan_answers = [answer]
        body = self.post("/public/plan-preview", {"draft": self.draft()}).json()
        names = {i["why"]["audience"] for i in body["ideas"]}
        self.assertLessEqual(names, {"תושבי השכונה", "מבקרים בשוק בסופ״ש"})

    def test_repeat_is_cached_and_free(self):
        with mock.patch.object(public_router, "PLAN_PER_IP", 1):
            self.assertEqual(self.post("/public/plan-preview", {"draft": self.draft()}).status_code, 200)
            again = self.post("/public/plan-preview", {"draft": self.draft()})
            self.assertEqual(again.status_code, 200)
            self.assertTrue(again.json()["cached"])
        self.assertEqual(len(self.models.plan_prompts), 1)

    def test_invalid_draft_is_422_and_costs_nothing(self):
        with mock.patch.object(public_router, "PLAN_PER_IP", 1):
            response = self.post("/public/plan-preview", {"draft": self.draft(business_type="חללית")})
            self.assertEqual(response.status_code, 422)
            self.assertEqual(self.post("/public/plan-preview", {"draft": self.draft()}).status_code, 200)
        self.assertEqual(len(self.models.plan_prompts), 1)


class CalendarTimingTest(unittest.TestCase):
    def test_events_in_the_next_three_weeks(self):
        events = drafts.upcoming_events(date(2026, 9, 26))
        names = [event["name"] for event in events]
        self.assertIn("סוכות", names)
        self.assertIn("שמחת תורה", names)
        for event in events:
            self.assertGreaterEqual(event["days_away"], 0)
            self.assertLessEqual(event["days_away"], drafts.CALENDAR_WINDOW_DAYS)

    def test_the_prompt_names_the_dates_or_says_there_are_none(self):
        draft = drafts.OnboardingDraft(**BAKERY)
        busy = drafts.plan_prompt(draft, None, date(2026, 9, 26), drafts.upcoming_events(date(2026, 9, 26)))
        self.assertIn("שמחת תורה", busy)
        self.assertIn("יום שבת, 2026-09-26", busy)
        quiet_day = date(2026, 6, 1)
        quiet = drafts.plan_prompt(draft, None, quiet_day, drafts.upcoming_events(quiet_day))
        self.assertEqual(drafts.upcoming_events(quiet_day), [])
        self.assertIn("אין מועד מיוחד", quiet)
        self.assertIn("קיץ", quiet)

    def test_season_notes_count_down_to_the_busy_months(self):
        draft = drafts.OnboardingDraft(**{**BAKERY, "seasons": {"busy": [11], "slow": [9]}})
        notes = drafts.season_notes(draft, date(2026, 9, 26))
        self.assertIn("נובמבר, בעוד כ-5 שבועות", notes[0])
        self.assertIn("אנחנו בתוך אחד מהם עכשיו", notes[1])


# --- audiences, brand, presets ---------------------------------------------------------


class AudiencesTest(DraftTestCase):
    def test_three_suggestions_from_the_lite_model(self):
        response = self.post("/public/audiences", {"draft": self.draft(audiences=[])})
        self.assertEqual(response.status_code, 200, response.text)
        audiences = response.json()["audiences"]
        self.assertEqual(len(audiences), 3)
        for item in audiences:
            self.assertEqual(set(item), {"name", "description", "why_he"})
        self.assertIn("איך כותבים בעברית", self.models.lite_prompts[0])
        self.assertEqual(self.models.plan_prompts, [])

    def test_already_chosen_audiences_are_not_suggested_again(self):
        response = self.post("/public/audiences", {"draft": self.draft(audiences=[{"name": "תיירים בשוק"}])})
        names = [a["name"] for a in response.json()["audiences"]]
        self.assertNotIn("תיירים בשוק", names)

    def test_budgets_are_separate_from_the_plan(self):
        with mock.patch.object(public_router, "PLAN_PER_IP", 1), mock.patch.object(public_router, "AUDIENCES_PER_IP", 2):
            self.assertEqual(self.post("/public/plan-preview", {"draft": self.draft()}).status_code, 200)
            blocked = self.post("/public/plan-preview", {"draft": self.draft(city="בת ים")})
            self.assertEqual(blocked.status_code, 429)
            self.assertIn("נסו שוב", blocked.json()["detail"])
            self.assertEqual(self.post("/public/audiences", {"draft": self.draft()}).status_code, 200)
            self.assertEqual(self.post("/public/audiences", {"draft": self.draft(city="לוד")}).status_code, 200)
            self.assertEqual(self.post("/public/audiences", {"draft": self.draft(city="רמלה")}).status_code, 429)
            # Another visitor still has a budget.
            other = self.post("/public/plan-preview", {"draft": self.draft(city="בת ים")}, ip="198.51.100.3")
            self.assertEqual(other.status_code, 200)

    def test_global_cap(self):
        with mock.patch.object(public_router, "PLAN_GLOBAL", 1):
            self.assertEqual(self.post("/public/plan-preview", {"draft": self.draft()}, ip="198.51.100.1").status_code, 200)
            capped = self.post("/public/plan-preview", {"draft": self.draft(city="לוד")}, ip="198.51.100.2")
            self.assertEqual(capped.status_code, 429)

    def test_default_limits_are_tight(self):
        self.assertLessEqual(public_router.PLAN_PER_IP, 10)
        self.assertLessEqual(public_router.BRAND_PER_IP, 10)
        self.assertEqual(public_router.WINDOW_SECONDS, 3600)


class BrandTest(DraftTestCase):
    def setUp(self):
        super().setUp()
        guard = mock.patch.object(public_router, "assert_public_url", return_value=None)
        guard.start()
        self.addCleanup(guard.stop)

    def test_uses_build_brand_preview_when_it_exists(self):
        flat = {"business_name": "תזיזי", "palette": [{"hex": "#111111", "role": "ink", "name": "שחור"}],
                "voice": "ישיר", "logo_url": "https://shop.example/logo.svg", "offerings": ["חזיות"]}
        with mock.patch.object(preview_service, "build_brand_preview", create=True, return_value=flat) as builder, \
                mock.patch.object(preview_service, "build_preview") as full:
            body = self.post("/public/brand", {"url": "shop.example"}).json()
        builder.assert_called_once()
        full.assert_not_called()
        self.assertEqual(body["status"], "ready")
        self.assertEqual(body["brand"], flat)

    def test_cached_scan_answers_without_scanning(self):
        preview_service._cache_put(preview_service.cache_key("https://bakery.example"), {"scan": SCAN, "preview": {}})
        with mock.patch.object(preview_service, "build_preview") as full:
            body = self.post("/public/brand", {"url": "https://www.bakery.example/"}).json()
        full.assert_not_called()
        self.assertTrue(body["cached"])
        self.assertEqual(body["brand"]["offerings"], ["חלות", "לחם מחמצת"])

    def test_failures_are_a_status_not_an_error(self):
        with mock.patch.object(preview_service, "build_brand_preview", side_effect=preview_service.PreviewError("לא נפתח")):
            body = self.post("/public/brand", {"url": "shop.example"}).json()
        self.assertEqual(body, {"status": "failed", "brand": None, "reason_he": "לא נפתח"})
        self.assertEqual(self.post("/public/brand", {"url": "not a url"}).json()["status"], "failed")

    def test_internal_targets_are_refused_before_any_scan(self):
        with mock.patch.object(public_router, "assert_public_url") as guard, \
                mock.patch.object(preview_service, "build_preview") as full:
            from app.services.netguard import UnsafeUrlError

            guard.side_effect = UnsafeUrlError("כתובת פנימית")
            body = self.post("/public/brand", {"url": "http://127.0.0.1/"}).json()
        full.assert_not_called()
        self.assertEqual(body["status"], "failed")

    def test_brand_budget(self):
        with mock.patch.object(public_router, "BRAND_PER_IP", 1), \
                mock.patch.object(preview_service, "build_preview", side_effect=preview_service.PreviewError("x")):
            self.post("/public/brand", {"url": "a.example"})
            self.assertEqual(self.post("/public/brand", {"url": "b.example"}).status_code, 429)


class StylePresetsTest(DraftTestCase):
    def test_six_presets_with_hebrew_names_and_valid_palettes(self):
        presets = self.client.get("/public/style-presets").json()["presets"]
        self.assertEqual(len(presets), 6)
        for preset in presets:
            self.assertRegex(preset["name_he"], "[א-ת]")
            roles = {s["role"] for s in preset["palette"]}
            self.assertEqual(roles, {"primary", "accent", "background", "ink", "secondary"})
            for swatch in preset["palette"]:
                self.assertRegex(swatch["hex"], r"^#[0-9a-f]{6}$")


class PublicIsAnonymousTest(unittest.TestCase):
    def test_no_auth_and_no_database_on_any_public_route(self):
        paths = {"/public/brand", "/public/links", "/public/audiences", "/public/plan-preview", "/public/style-presets"}
        routes = [r for r in app.routes if getattr(r, "path", "") in paths]
        self.assertEqual({r.path for r in routes}, paths)
        for route in routes:
            calls = {dep.call for dep in route.dependant.dependencies}
            self.assertNotIn(get_current_user, calls, route.path)
            self.assertNotIn(get_db, calls, route.path)


# --- the provider is down ---------------------------------------------------------------


class ProviderUnavailableTest(DraftTestCase):
    DEPLETED = RuntimeError(
        "402 RESOURCE_EXHAUSTED. {'error': {'code': 402, 'message': 'Your prepayment credits are depleted.'}}"
    )

    def test_402_is_not_retried(self):
        self.assertFalse(gemini._is_retryable(self.DEPLETED))
        calls = []

        def fail():
            calls.append(1)
            raise self.DEPLETED

        with mock.patch.object(gemini.time, "sleep") as sleep:
            with self.assertRaises(RuntimeError):
                gemini._call_with_retry(fail)
        self.assertEqual(len(calls), 1)
        sleep.assert_not_called()

    def test_public_endpoints_say_the_service_is_unavailable(self):
        self.models.plan_answers = [self.DEPLETED]
        response = self.post("/public/plan-preview", {"draft": self.draft()})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "השירות לא זמין כרגע, נסו שוב מאוחר יותר.")
        self.assertNotIn("402", response.text)

        with mock.patch.object(drafts, "lite_json", side_effect=self.DEPLETED):
            response = self.post("/public/audiences", {"draft": self.draft()})
        self.assertEqual(response.status_code, 503)

        wrapped = RuntimeError("scan failed")
        wrapped.__cause__ = self.DEPLETED
        with mock.patch.object(public_router, "assert_public_url", return_value=None), \
                mock.patch.object(preview_service, "build_brand_preview", side_effect=wrapped):
            body = self.post("/public/brand", {"url": "shop.example"}).json()
        self.assertEqual(body["reason_he"], "השירות לא זמין כרגע, נסו שוב מאוחר יותר.")

    def test_a_failure_is_not_cached(self):
        self.models.plan_answers = [self.DEPLETED]
        self.assertEqual(self.post("/public/plan-preview", {"draft": self.draft()}).status_code, 503)
        self.assertEqual(self.post("/public/plan-preview", {"draft": self.draft()}).status_code, 200)


# --- after signup ----------------------------------------------------------------------


DIRECTION = {
    "title": "חלת שישי של השכונה",
    "approach_he": "פוסט אחד בשבוע באינסטגרם על חלות שישי.",
    "audience": "תושבי השכונה",
    "goal_he": "יותר קונים בשישי",
    "why_he": "זה ההרגל שכבר קיים.",
    "first_steps": ["לצלם את החלות", "לכתוב מתי אפשר להזמין", "להעלות סטורי"],
}


class FromDraftTest(DraftTestCase):
    def setUp(self):
        super().setUp()
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-draft-"))
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

    def submit(self, draft=None, direction=DIRECTION, chosen_idea=None):
        body = {"draft": draft or self.draft(), "chosen_direction": direction}
        if chosen_idea is not None:
            body["chosen_idea"] = chosen_idea
        return self.client.post("/onboarding/from-draft", json=body)

    def business(self) -> Business:
        self.db.expire_all()
        return self.db.query(Business).filter(Business.user_id == self.owner.id).one()

    def test_creates_the_business_from_the_draft(self):
        response = self.submit(chosen_idea=idea(0, "reel"))
        self.assertEqual(response.status_code, 200, response.text)
        me = self.client.get("/onboarding/me").json()
        self.assertEqual(response.json(), me)
        payload = me["business"]
        self.assertEqual(payload["name"], "מאפיית הפשפשים")
        self.assertEqual(payload["business_type"], "מאפייה / קפה / מסעדה")
        self.assertEqual(payload["business_model"], "products")
        self.assertEqual(payload["primary_goal"], "sales")
        self.assertEqual(payload["location"], "יפו")
        self.assertEqual(payload["website_url"], "")
        # Own links on the business; the owner's account is not a "peer".
        self.assertEqual(payload["social_links"], {"instagram": "https://www.instagram.com/pishpeshim_bakery/"})
        self.assertEqual(payload["instagram_handles"], ["abulafia_bakery"])
        self.assertEqual(
            payload["competitors"],
            [{"name": "אבולעפיה", "website_url": ""}, {"name": "לחמים", "website_url": "https://lehamim.co.il"}],
        )
        # No site: the brand is the style preset for a bakery.
        self.assertEqual(payload["brand_source"], "preset")
        self.assertEqual(payload["brand_language"]["palette"], drafts.STYLE_PRESETS["warm"]["palette"])
        # The first-meeting answers and the chosen direction are kept.
        self.assertEqual(payload["owner_context"]["seasons"], {"busy": [9, 10], "slow": [7, 8]})
        self.assertEqual(payload["owner_context"]["tried"]["channels"], ["social_posts", "word_of_mouth"])
        self.assertEqual(payload["first_month_seed"]["direction"]["title"], DIRECTION["title"])
        self.assertEqual(payload["first_month_seed"]["idea"]["format"], "reel")
        stored = loads(self.business().scraped_profile_json, {})
        self.assertTrue(stored["growth_hypothesis"].startswith(DIRECTION["title"]))

    def test_audiences_are_created_with_one_primary(self):
        self.submit()
        rows = self.db.query(Audience).order_by(Audience.id).all()
        self.assertEqual([r.name for r in rows], ["תושבי השכונה", "מבקרים בשוק בסופ״ש"])
        self.assertEqual([r.is_primary for r in rows], [1, 0])
        self.assertEqual(rows[0].priority, "primary")
        self.assertEqual({r.source for r in rows}, {"manual"})

    def test_is_idempotent(self):
        first = self.submit().json()
        second = self.submit().json()
        self.assertEqual(self.db.query(Business).count(), 1)
        self.assertEqual(self.db.query(Audience).count(), 2)
        self.assertEqual(first["business"]["first_month_seed"], second["business"]["first_month_seed"])
        self.assertEqual(first["business"]["instagram_handles"], second["business"]["instagram_handles"])
        self.assertEqual(first["business"]["brand_language"], second["business"]["brand_language"])

    def test_chosen_preset_and_cached_scan(self):
        payload = self.submit(self.draft(style_preset="luxe")).json()["business"]
        self.assertEqual(payload["brand_language"]["preset"], "luxe")
        preview_service._cache_put(preview_service.cache_key("https://bakery.example"), {"scan": SCAN, "preview": {}})
        payload = self.submit(self.draft(links={"website": "bakery.example"})).json()["business"]
        self.assertEqual(payload["website_url"], "https://bakery.example")
        self.assertEqual(payload["brand_language"]["voice"], "חם ושכונתי")
        self.assertEqual(payload["brand_source"], "scan")
        self.assertEqual(payload["social_links"], {})

    def test_goal_must_fit_the_model(self):
        response = self.submit(self.draft(goal="leads"))
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.db.query(Business).count(), 0)
        ok = self.submit(self.draft(business_model="services", goal="leads"))
        self.assertEqual(ok.json()["business"]["primary_goal"], "leads")

    def test_instagram_handle_uses_the_same_validation(self):
        response = self.submit(self.draft(links={"instagram": "not a handle!"}))
        self.assertEqual(response.status_code, 422)
        self.assertIn("שם משתמש", response.text)

    def test_owner_written_hypothesis_is_not_overwritten(self):
        self.submit()
        business = self.business()
        stored = loads(business.scraped_profile_json, {})
        stored["growth_hypothesis"] = "ההשערה שלי"
        business.scraped_profile_json = json.dumps(stored, ensure_ascii=False)
        self.db.commit()
        self.submit(direction={**DIRECTION, "title": "כיוון אחר"})
        self.assertEqual(loads(self.business().scraped_profile_json, {})["growth_hypothesis"], "ההשערה שלי")

    def test_budget_step_and_generation_still_work(self):
        me = self.submit(chosen_idea=idea(0, "reel")).json()["business"]
        profile = {
            "name": me["name"], "website_url": me["website_url"], "business_type": me["business_type"],
            "offerings": me["offerings"], "location": me["location"], "business_model": me["business_model"],
            "presence_type": me["presence_type"], "social_links": me["social_links"],
            "monthly_budget_ils": 3000, "competitors": me["competitors"], "primary_goal": me["primary_goal"],
        }
        self.assertEqual(self.client.post("/onboarding/profile", json=profile).status_code, 200)
        captured = {}

        def fake_generate(payload, **kwargs):
            captured.update(payload)
            return {"complete": False, "scraped_profile": kwargs["scan"], "generate_state": {"stage": "plan"}}

        with mock.patch.object(onboarding_router, "generate_monthly_strategy", side_effect=fake_generate):
            response = self.client.post("/onboarding/generate")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(captured["monthly_budget_ils"], 3000)
        self.assertEqual(captured["first_month_seed"]["direction"]["title"], DIRECTION["title"])
        self.assertEqual(captured["owner_context"]["seasons"]["busy"], [9, 10])
        after = self.client.get("/onboarding/me").json()["business"]
        self.assertIsNotNone(after["first_month_seed"])

        # The month prompts read it; the raw dict does not print it twice.
        block = strategy_service._owner_block(captured, include_idea=True)
        self.assertIn(DIRECTION["title"], block)
        self.assertIn("ספטמבר", block)
        self.assertIn("רעיון לפוסט שבעל העסק בחר", block)
        self.assertNotIn("רעיון לפוסט", strategy_service._owner_block(captured))
        brief = strategy_service._business_brief(captured)
        self.assertNotIn("first_month_seed", brief)
        self.assertNotIn("owner_context", brief)

    def test_no_seed_means_unchanged_prompts(self):
        self.assertEqual(strategy_service._owner_block({"name": "x"}), "")


if __name__ == "__main__":
    unittest.main()


class RescanKeepsOwnerDecisionsTest(unittest.TestCase):
    """`/onboarding/scan` after `/start` must not wipe the owner's answers or seed."""

    def test_rescan_merges_into_the_stored_profile(self):
        from unittest import mock

        from app.routers import onboarding as onboarding_router

        business = mock.Mock()
        business.scraped_profile_json = json.dumps(
            {"owner_context": {"differentiator": "x"}, "first_month_seed": {"direction": {"title": "t"}},
             "growth_hypothesis": "h", "brand_language": {"business_name": "old"}}
        )
        business.name = "n"
        business.location = "l"
        scanned = {"brand_language": {"business_name": "new"}, "raw": {"image_urls": []}, "extracted": {}}
        db = mock.Mock()
        db.query.return_value.filter.return_value.order_by.return_value.first.return_value = business
        with mock.patch.object(onboarding_router, "cached_scan", return_value=scanned), \
             mock.patch.object(onboarding_router, "fetch_photo_candidates", return_value=[]), \
             mock.patch.object(onboarding_router, "filter_usable_photos", return_value=[]), \
             mock.patch.object(onboarding_router, "_business_payload", return_value={}):
            onboarding_router.scan_business_site(
                onboarding_router.WebsiteScanIn(website_url="https://shop.example"), user=mock.Mock(id=1), db=db
            )
        stored = json.loads(business.scraped_profile_json)
        self.assertEqual(stored["owner_context"], {"differentiator": "x"})
        self.assertEqual(stored["first_month_seed"], {"direction": {"title": "t"}})
        self.assertEqual(stored["growth_hypothesis"], "h")
        self.assertEqual(stored["brand_language"]["business_name"], "new")


class SuccessTargetTest(unittest.TestCase):
    """A chip target like "10" is a valid answer (it broke the whole flow before)."""

    def test_numeric_target_is_accepted(self):
        from app.services.onboarding_draft import DraftSuccess

        self.assertEqual(DraftSuccess(kpi="online_orders", target="10").target, "10")
        self.assertEqual(DraftSuccess(kpi="online_orders", target="25 הזמנות").target, "25 הזמנות")

    def test_junk_target_is_rejected_in_hebrew(self):
        from app.services.onboarding_draft import DraftSuccess

        with self.assertRaises(ValidationError) as ctx:
            DraftSuccess(kpi="online_orders", target="!!!")
        self.assertIn("היעד", str(ctx.exception))
