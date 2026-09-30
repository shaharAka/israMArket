"""Onboarding v2 revision 4: /public/strategy, /public/sample-posts, and the seed they leave.

Hermetic: the strategy model (`onboarding_draft._strategy_call`), the post writer
(`post_model_router.post_json`), the photo vision check (`onboarding_draft.lite_json`)
and photo downloads are all replaced.
"""
import _test_env  # noqa: F401  (must come before any `app` import)

import copy
import json
import re
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Asset, Business, User
from app.routers import onboarding as onboarding_router
from app.routers import public_onboarding as public_router
from app.services import onboarding_draft as drafts
from app.services import post_model_router
from app.services import preview as preview_service
from app.services import ratelimit
from app.services import strategy as strategy_service
from app.services import strategy_reveal as reveal
from app.services.jsonutil import loads
from app.services.tracking_detect import detect_tags

BAKERY = {
    "business_name": "מאפיית הפשפשים",
    "business_type": "food",
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
    "tried": {"channels": ["social_posts"], "what_worked": "רוב הלקוחות מגיעים מהמלצות"},
}
SCAN = {
    "raw": {"url": "https://bakery.example", "title": "מאפיית הפשפשים", "headings": ["לחם מחמצת"],
            "text": "אופים מחמצת כל בוקר ביפו.", "image_urls": ["https://bakery.example/a.jpg"]},
    "extracted": {"business_name": "מאפיית הפשפשים", "location": "יפו"},
    "brand_language": {"business_name": "מאפיית הפשפשים", "voice": "חם", "card_photo_url": "https://bakery.example/a.jpg",
                       "palette": [{"hex": "#c0392b", "role": "primary", "name": "אדום"}]},
}
DIRECTION = {
    "title": "חלת שישי של השכונה", "approach_he": "פוסט בשבוע על חלות שישי.", "audience": "תושבי השכונה",
    "goal_he": "יותר קונים בשישי", "why_he": "זה ההרגל שכבר קיים.", "first_steps": ["לצלם", "לכתוב", "להעלות"],
}
INSIGHTS = [
    {"text_he": "סיפרתם שרוב הלקוחות מגיעים מהמלצות.", "source": "answers"},
    {"text_he": "המחמצת נאפית מול הלקוחות.", "source": "answers"},
]


def strategy_answer(**overrides) -> dict:
    answer = {
        "objective": {"text_he": "שתושבי השכונה יקנו אצלנו חלה לשישי.", "why_he": "סיפרתם שהלקוחות מגיעים מהמלצות.",
                      "based_on": "insight_1"},
        "success": {
            "measures": [
                {"kind": "whatsapp_message", "name_he": "הודעות בוואטסאפ מהפוסטים", "how_he": "סופרים הודעות עם המשפט המוכן."},
                {"kind": "instagram_insights", "name_he": "שמירות של הפוסטים", "how_he": "בנתונים של האינסטגרם."},
            ],
            "first_check_he": "בסוף השבוע השני נבדוק כמה הודעות הגיעו.",
        },
        "angle": {"text_he": "המחמצת נאפית מול העיניים שלכם.", "why_he": "זה מה שמייחד אתכם.", "based_on": "differentiator"},
        "audiences": [
            {"name": "תושבי השכונה", "role": "primary", "message_he": "החלה של שישי מחכה בבוקר."},
            {"name": "מבקרים בשוק בסופ״ש", "role": "secondary", "message_he": "בואו לראות את הלישה."},
        ],
        "pillars": [
            {"key": "friday_challah", "title": "חלת שישי", "description_he": "החלות של שישי.", "example_he": "חלה יוצאת מהתנור.",
             "why_he": "סיפרתם שאופים חלות לשישי.", "based_on": "offerings"},
            {"key": "sourdough_live", "title": "מחמצת מול העיניים", "description_he": "הלישה.", "example_he": "סרטון לישה.",
             "why_he": "זה מה שמייחד אתכם.", "based_on": "differentiator"},
            {"key": "market_morning", "title": "בוקר בשוק", "description_he": "השוק.", "example_he": "בורקס בשוק.",
             "why_he": "אתם ליד השוק.", "based_on": "direction"},
        ],
        "channels": [
            {"network": "instagram", "role_he": "הפוסטים.", "cadence_he": "1-2 בשבוע", "why_he": "יש לכם חשבון.",
             "based_on": "activity"},
            {"network": "whatsapp", "role_he": "הזמנות.", "cadence_he": "עונים באותו יום", "why_he": "הכי קל להזמין.",
             "based_on": "direction"},
        ],
        "offer": {"cta_he": "לשלוח הודעה", "mechanism_he": "קישור לוואטסאפ עם הודעה מוכנה.", "why_he": "הכי קל.",
                  "based_on": "direction"},
        "month_plan": [{"week": w, "focus_he": f"מיקוד לשבוע {w}.", "event_he": ""} for w in (1, 2, 3, 4)],
        "quarter": [{"month_label": "x", "direction_he": "ממשיכים."}, {"month_label": "y", "direction_he": "מרחיבים."}],
        "assumptions": ["אנחנו מהמרים שחלה בבוקר תביא קונים.", "אנחנו מהמרים שהלישה מושכת."],
        "changed_he": "",
    }
    answer.update(overrides)
    return answer


def sample_answer(slot_title: str = "חלה חמה", **overrides) -> dict:
    post = {
        "week": 1, "date_hint": "2026-10-02", "format": "reel", "title": slot_title, "angle": "חלה", "product": "חלה לשישי",
        "hook": "החלה יוצאת מהתנור עם קרום מבריק.", "caption": "אנחנו קולעים אותה בבוקר. בואו לקחת לשישי.",
        "cta": "לשלוח הודעה", "calendar_tie": "", "goal_fit": "מכירות", "why_now": "לפני שישי.",
        "overlay_text": "חלה חמה לשישי", "overlay_headline": "חלה חמה לשישי", "primary_outlet": "instagram",
        "outlets": ["instagram"], "metrics_to_watch": [], "stat_highlight": "", "audience_name": "תושבי השכונה",
        "pillar_key": "whatever", "template": "lower_editorial", "badge": "לשישי", "photo_index": 0,
        "photo_hint_he": "צילום של החלה על קרש עץ ליד החלון באור בוקר.",
        "why": {"audience": "תושבי השכונה", "goal_he": "יותר קונים", "timing_he": "לפני שישי בבוקר.",
                "reason_he": "סיפרתם שאופים חלות לשישי."},
    }
    post.update(overrides)
    return {"posts": [post]}


class FakeModels:
    def __init__(self):
        self.prompts: dict[str, list[str]] = {}
        self.answers: dict[str, list] = {}

    def strategy(self, prompt, schema):
        title = schema.get("title")
        self.prompts.setdefault(title, []).append(prompt)
        queue = self.answers.get(title) or []
        answer = queue.pop(0) if queue else (strategy_answer() if title == "FirstMonthStrategy" else {})
        if isinstance(answer, Exception):
            raise answer
        return json.dumps(answer, ensure_ascii=False)


class RevealTestCase(unittest.TestCase):
    def setUp(self):
        ratelimit.reset()
        preview_service.reset_cache()
        public_router.answers.clear()
        public_router.latest.clear()
        reveal.photo_cache.clear()
        self.models = FakeModels()
        self.post_prompts: list[str] = []
        self.post_answers: list = []

        def post_json(prompt, schema):
            self.post_prompts.append(prompt)
            answer = self.post_answers.pop(0) if self.post_answers else sample_answer()
            return json.dumps(answer, ensure_ascii=False)

        self._patches = [
            mock.patch.object(drafts, "_strategy_call", side_effect=self.models.strategy),
            mock.patch.object(post_model_router, "post_json", side_effect=post_json),
            mock.patch.object(reveal, "site_photos", return_value=[]),
            mock.patch.object(public_router, "_prefetch_samples"),
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
        public_router.latest.clear()

    def post(self, path, body, ip="203.0.113.21"):
        return self.client.post(path, json=body, headers={"X-Forwarded-For": ip})

    def draft(self, **overrides):
        data = copy.deepcopy(BAKERY)
        data.update(overrides)
        return data

    def strategy(self, **extra):
        body = {"draft": self.draft(), "direction": DIRECTION, "insights": INSIGHTS, **extra}
        return self.post("/public/strategy", body)


class StrategyContractTest(RevealTestCase):
    def test_shape_and_honest_measures(self):
        response = self.strategy()
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        for key in ("objective", "success", "angle", "audiences", "pillars", "channels", "offer", "month_plan",
                    "quarter", "assumptions", "cadence", "cached"):
            self.assertIn(key, body)
        self.assertFalse(body["cached"])
        self.assertEqual(len(body["pillars"]), 3)
        self.assertEqual([w["week"] for w in body["month_plan"]], [1, 2, 3, 4])
        self.assertTrue(all(w["dates_he"] for w in body["month_plan"]))
        self.assertEqual([q["month_label"] for q in body["quarter"]], reveal.quarter_labels(date.today()))
        measures = {m["kind"]: m for m in body["success"]["measures"]}
        self.assertTrue(measures["whatsapp_message"]["available_now"])
        self.assertFalse(measures["instagram_insights"]["available_now"])
        self.assertEqual(measures["instagram_insights"]["needs_he"], "צריך לחבר את האינסטגרם")
        self.assertNotIn("owner_target", body["success"])
        self.assertEqual(body["cadence"]["key"], "1-2")  # posts "sometimes" today
        self.assertEqual(body["cadence"]["source"], "default")
        self.assertEqual(body["objective"]["from_insight"], 0)
        self.assertEqual(body["audiences"][0]["role"], "primary")
        prompt = self.models.prompts["FirstMonthStrategy"][0]
        self.assertIn("איך כותבים בעברית", prompt)
        self.assertIn("insight_1", prompt)
        self.assertIn("אסור לכתוב יעד מספרי", prompt)

    def test_an_invented_target_is_retried_then_removed(self):
        bad = strategy_answer()
        bad["success"]["first_check_he"] = "נגיע ל-45 הזמנות בחודש. בסוף השבוע השני נבדוק."
        self.models.answers["FirstMonthStrategy"] = [bad, copy.deepcopy(bad)]
        body = self.strategy().json()
        self.assertEqual(len(self.models.prompts["FirstMonthStrategy"]), 2)
        self.assertIn("מספרים שלא נמסרו", self.models.prompts["FirstMonthStrategy"][1])
        self.assertNotIn("45", json.dumps(body["success"], ensure_ascii=False))

    def test_a_measure_we_cannot_back_is_dropped(self):
        bad = strategy_answer()
        bad["success"]["measures"].append({"kind": "site_data", "name_he": "כניסות לאתר", "how_he": "באנליטיקס"})
        bad["objective"]["based_on"] = "insight_4"  # only 2 insights exist
        self.models.answers["FirstMonthStrategy"] = [bad, copy.deepcopy(bad)]
        body = self.strategy().json()
        self.assertIn("לא אפשרי לעסק הזה", self.models.prompts["FirstMonthStrategy"][1])
        self.assertIn("מקור שאין לנו", self.models.prompts["FirstMonthStrategy"][1])
        self.assertNotIn("site_data", [m["kind"] for m in body["success"]["measures"]])
        self.assertNotIn("from_insight", body["objective"])

    def test_inputs_rerun_the_strategy_they_saw(self):
        first = self.strategy().json()
        self.models.answers["FirstMonthStrategy"] = [strategy_answer(changed_he="עכשיו 3 עד 4 פוסטים בשבוע.")]
        inputs = {"target": "10 הזמנות", "cadence": "3-4", "feedback": "פחות על מבצעים"}
        body = self.strategy(inputs=inputs, changed=["target", "cadence"]).json()
        prompt = self.models.prompts["FirstMonthStrategy"][1]
        self.assertIn("זו גרסה מתוקנת", prompt)
        self.assertIn(first["pillars"][0]["title"], prompt)
        self.assertIn("הקצב: 3 עד 4 פוסטים בשבוע", prompt)
        self.assertIn("\"10 הזמנות\"", prompt)
        self.assertNotIn("ביקשו: ", prompt.split("מה הוא שינה עכשיו")[1][:200])  # feedback was not in `changed`
        self.assertEqual(body["success"]["owner_target"], "10 הזמנות")
        self.assertEqual(body["cadence"], {"key": "3-4", "label_he": "3 עד 4 פוסטים בשבוע", "posts_per_month": 14,
                                           "source": "owner"})
        self.assertTrue(body["changed_he"])

    def test_a_removed_pillar_never_comes_back(self):
        again = strategy_answer()
        self.models.answers["FirstMonthStrategy"] = [strategy_answer(), again, copy.deepcopy(again)]
        self.strategy()
        body = self.strategy(inputs={"pillars_removed": ["market_morning"]}).json()
        self.assertNotIn("market_morning", [p["key"] for p in body["pillars"]])
        self.assertIn("הוסר על ידי בעל העסק", self.models.prompts["FirstMonthStrategy"][2])

    def test_cached_and_limited_apart_from_the_plan(self):
        with mock.patch.object(public_router, "STRATEGY_PER_IP", 1):
            self.assertEqual(self.strategy().status_code, 200)
            again = self.strategy()
            self.assertTrue(again.json()["cached"])
            self.assertEqual(self.strategy(inputs={"cadence": "5+"}).status_code, 429)
        self.assertEqual(len(self.models.prompts["FirstMonthStrategy"]), 1)
        self.assertTrue(ratelimit.allow("onboarding-plan:ip:203.0.113.21", public_router.PLAN_PER_IP, 3600))


def card_template_keys() -> set[str]:
    source = (Path(__file__).resolve().parents[2] / "web" / "components" / "CardCanvas.tsx").read_text()
    block = source.split("export const CARD_TEMPLATES")[1].split("];")[0]
    return set(re.findall(r'key: "([a-z_]+)"', block))


class SamplePostsTest(RevealTestCase):
    def samples(self, strategy=None, draft=None):
        strategy = strategy or self.strategy().json()
        body = {"draft": draft or self.draft(), "direction": DIRECTION, "strategy": strategy}
        return self.post("/public/sample-posts", body)

    def test_written_by_the_product_post_writer_with_real_templates(self):
        response = self.samples()
        self.assertEqual(response.status_code, 200, response.text)
        posts = response.json()["posts"]
        self.assertEqual(len(posts), 3)
        self.assertEqual(len(self.post_prompts), 3)  # one per slot, through post_model_router
        for prompt in self.post_prompts:
            self.assertIn("לכל פוסט חובה", prompt)  # the month's own post prompt
            self.assertIn("איך כותבים בעברית", prompt)
            self.assertIn("כתוב בדיוק פוסט אחד", prompt)
        self.assertIn("friday_challah", self.post_prompts[0])
        self.assertEqual([p["pillar_key"] for p in posts], ["friday_challah", "sourdough_live", "market_morning"])
        self.assertEqual([p["format"] for p in posts], ["reel", "carousel", "image"])
        self.assertTrue(card_template_keys() >= set(reveal.CARD_TEMPLATES))
        for post in posts:
            self.assertIn(post["template"], card_template_keys())
            self.assertTrue(post["photo"]["hint_he"])
            self.assertNotIn("site_url", post["photo"])  # no site photos
            self.assertEqual(set(post["why"]), {"audience", "goal_he", "timing_he", "reason_he"})
        # 1-2 a week: week 1 holds two, the third lands in week 2.
        self.assertEqual([p["week"] for p in posts], [1, 1, 2])

    def test_site_photo_when_one_fits_else_a_hint(self):
        photo = {"url": "https://bakery.example/a.jpg", "description_he": "חלה על קרש"}
        self.post_answers = [sample_answer(), sample_answer("שני", photo_index=0), sample_answer("שלישי", photo_index=-1)]
        with mock.patch.object(reveal, "site_photos", return_value=[photo]):
            posts = self.samples().json()["posts"]
        self.assertIn("חלה על קרש", self.post_prompts[0])
        self.assertEqual(posts[0]["photo"]["site_url"], photo["url"])
        self.assertNotIn("site_url", posts[1]["photo"])  # the same photo is not used twice
        self.assertNotIn("site_url", posts[2]["photo"])
        self.assertTrue(posts[2]["photo"]["hint_he"])

    def test_a_caption_that_repeats_the_hook_is_cut(self):
        hook = "החלה יוצאת מהתנור עם קרום מבריק."
        self.post_answers = [sample_answer(caption=f"{hook} אנחנו קולעים אותה בבוקר ומחכים לשישי איתה."),
                             sample_answer(), sample_answer()]
        posts = self.samples().json()["posts"]
        self.assertFalse(posts[0]["caption"].startswith("החלה יוצאת"))

    def test_invalid_template_falls_back_to_a_real_one(self):
        self.post_answers = [sample_answer(template="neon_glow"), sample_answer(template="neon_glow"),
                             sample_answer(), sample_answer()]
        posts = self.samples().json()["posts"]
        self.assertIn(posts[0]["template"], reveal.CARD_TEMPLATES)


class SitePhotosTest(unittest.TestCase):
    def setUp(self):
        preview_service.reset_cache()
        reveal.photo_cache.clear()
        preview_service._cache_put(preview_service.cache_key("https://bakery.example"), {"scan": SCAN, "preview": {}})
        self.draft = drafts.OnboardingDraft(**{**BAKERY, "links": {"website": "bakery.example"}})

    def tearDown(self):
        preview_service.reset_cache()
        reveal.photo_cache.clear()

    def test_usable_photos_with_what_they_show(self):
        photos = [{"url": "https://bakery.example/a.jpg", "bytes": b"x", "mime": "image/jpeg"},
                  {"url": "https://bakery.example/banner.jpg", "bytes": b"y", "mime": "image/jpeg"}]
        verdict = {"photos": [{"index": 0, "usable": True, "description_he": "חלה על קרש"},
                              {"index": 1, "usable": False, "description_he": "באנר"}]}
        with mock.patch("app.services.scraper.fetch_photo_candidates", return_value=photos), \
                mock.patch.object(drafts, "lite_json", return_value=json.dumps(verdict, ensure_ascii=False)):
            out = reveal.site_photos(self.draft)
        self.assertEqual(out, [{"url": "https://bakery.example/a.jpg", "description_he": "חלה על קרש"}])

    def test_a_failed_check_keeps_only_the_brand_pick(self):
        photos = [{"url": "https://bakery.example/b.jpg", "bytes": b"x", "mime": "image/jpeg"}]
        with mock.patch("app.services.scraper.fetch_photo_candidates", return_value=photos), \
                mock.patch.object(drafts, "lite_json", side_effect=RuntimeError("down")):
            out = reveal.site_photos(self.draft)
        self.assertEqual([p["url"] for p in out], ["https://bakery.example/a.jpg"])


class TagDetectionTest(unittest.TestCase):
    WIX = """
    <script>window.promoteAnalyticsChannels = [{name: 'google', report: gtag,
      config: { trackingId: 'GTM-TVGNWVV' }}, {name: 'ga', config: { trackingId: 'G-7MPBWRW3FT' }}];</script>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-7MPBWRW3FT"></script>
    <meta name="google-site-verification" content="abc">
    <script>fbq('init', '123456789012345');</script>
    <script>gtag('config', 'AW-987654321');</script>
    """

    def test_wix_inline_config(self):
        tags = detect_tags(self.WIX)
        self.assertEqual(tags["ga4"], ["G-7MPBWRW3FT"])
        self.assertEqual(tags["gtm"], ["GTM-TVGNWVV"])
        self.assertEqual(tags["meta_pixel"], ["123456789012345"])
        self.assertEqual(tags["google_ads"], ["AW-987654321"])
        self.assertEqual(tags["search_console"], ["verified"])

    def test_nothing_seen_is_empty(self):
        self.assertEqual(detect_tags("<html><body>שלום</body></html>"),
                         {"ga4": [], "gtm": [], "meta_pixel": [], "google_ads": [], "search_console": []})


# --- after signup ----------------------------------------------------------------------------


class SeedTestCase(RevealTestCase):
    def setUp(self):
        super().setUp()
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-reveal-"))
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
        self.strategy_body = self.strategy().json()
        self.posts = self.post("/public/sample-posts", {"draft": self.draft(), "direction": DIRECTION,
                                                         "strategy": self.strategy_body}).json()["posts"]

    def submit(self, posts=None):
        body = {"draft": self.draft(), "chosen_direction": DIRECTION, "strategy": self.strategy_body,
                "chosen_posts": self.posts if posts is None else posts}
        return self.client.post("/onboarding/from-draft", json=body)

    def stored(self) -> dict:
        self.db.expire_all()
        return loads(self.db.query(Business).one().scraped_profile_json, {})


class FromDraftSeedTest(SeedTestCase):
    def test_strategy_and_posts_are_the_seed_and_idempotent(self):
        first = self.submit()
        self.assertEqual(first.status_code, 200, first.text)
        seed = first.json()["business"]["first_month_seed"]
        self.assertEqual([p["key"] for p in seed["strategy"]["pillars"]],
                         ["friday_challah", "sourdough_live", "market_morning"])
        self.assertEqual(len(seed["posts"]), 3)
        self.assertEqual([p["seed_index"] for p in seed["posts"]], [0, 1, 2])
        second = self.submit().json()["business"]["first_month_seed"]
        self.assertEqual(seed, second)
        self.assertEqual(self.db.query(Business).count(), 1)

    def test_draft_photos_link_an_owned_asset(self):
        self.submit()
        business = self.db.query(Business).one()
        asset = Asset(business_id=business.id, filename="asset-1.jpg", mime="image/jpeg")
        other = Asset(business_id=business.id + 99, filename="asset-2.jpg", mime="image/jpeg")
        self.db.add_all([asset, other])
        self.db.commit()
        ok = self.client.post("/onboarding/draft-photos", json=[{"post_index": 0, "asset_id": asset.id}])
        self.assertEqual(ok.status_code, 200, ok.text)
        photo = self.stored()["first_month_seed"]["posts"][0]["photo"]
        self.assertEqual((photo["choice"], photo["asset_id"]), ("upload", asset.id))
        self.assertEqual(self.client.post("/onboarding/draft-photos", json=[{"post_index": 1, "asset_id": other.id}])
                         .status_code, 404)
        # A client-sent asset id is never trusted; a repeat from-draft keeps the server's link.
        posts = copy.deepcopy(self.posts)
        posts[0]["photo"] = {**posts[0]["photo"], "choice": "upload", "asset_id": other.id}
        posts[1]["photo"] = {**posts[1]["photo"], "asset_id": other.id}
        self.submit(posts)
        seeded = self.stored()["first_month_seed"]["posts"]
        self.assertEqual(seeded[0]["photo"]["asset_id"], asset.id)
        self.assertNotIn("asset_id", seeded[1]["photo"])
        fixed = reveal.product_post(seeded[0], 1)
        self.assertEqual((fixed["image_source"], fixed["image_asset_id"]), ("asset", asset.id))


class GenerationUsesSeedTest(SeedTestCase):
    def business_payload(self) -> dict:
        self.submit()
        return {"name": "מאפיית הפשפשים", "business_model": "products", "audiences": [],
                "first_month_seed": self.stored()["first_month_seed"], "monthly_budget_ils": 0, "primary_goal": "sales"}

    def test_week_one_is_the_chosen_posts_and_the_cadence_counts(self):
        payload = self.business_payload()
        writer = mock.Mock()
        with mock.patch.object(strategy_service, "strategy_json", writer):
            early = strategy_service._write_posts_for_weeks(payload, {}, {"theme": "t"}, {}, [1, 2])
        writer.assert_not_called()  # 1-2 a week: the three chosen posts fill weeks 1 and 2
        self.assertEqual([p["week"] for p in early], [1, 1, 2])
        self.assertEqual([p["title"] for p in early], [p["title"] for p in self.posts])
        self.assertTrue(all(p["chosen_at_signup"] for p in early))
        self.assertEqual(early[0]["overlay_theme"], self.posts[0]["template"])

        answer = {"posts": [{**sample_answer()["posts"][0], "pillar_key": "sourdough_live", "week": 3},
                            {**sample_answer()["posts"][0], "pillar_key": "nope", "week": 4},
                            {**sample_answer()["posts"][0], "pillar_key": "friday_challah", "week": 4}]}
        captured = {}

        def fake(prompt, schema):
            captured["prompt"], captured["schema"] = prompt, schema
            return json.dumps(answer, ensure_ascii=False)

        with mock.patch.object(strategy_service, "strategy_json", side_effect=fake):
            late = strategy_service._write_posts_for_weeks(payload, {}, {"theme": "t"}, {}, [3, 4])
        self.assertIn("כתוב בדיוק 3 פוסטים", captured["prompt"])
        self.assertIn("friday_challah", captured["prompt"])
        self.assertIs(captured["schema"], reveal.SEEDED_POSTS_SCHEMA)
        self.assertEqual({p["pillar_key"] for p in late} - {"friday_challah", "sourdough_live", "market_morning"}, set())

    def test_month_plan_follows_the_strategy(self):
        payload = self.business_payload()
        payload["first_month_seed"]["strategy"]["success"]["owner_target"] = "10 הזמנות"
        core = {"theme": "t", "weekly_breakdown": [{"week": 1, "focus": "משהו אחר", "metrics_target": []}],
                "monthly_horizon_plan": {"targets": ["יעד של המודל"]}}
        with mock.patch.object(strategy_service, "strategy_json", return_value=json.dumps(core, ensure_ascii=False)):
            out = strategy_service.build_roadmap(payload, {}, [], {}, {})
        self.assertEqual([w["focus"] for w in out["weekly_breakdown"]],
                         [w["focus_he"] for w in self.strategy_body["month_plan"]])
        self.assertEqual(out["monthly_horizon_plan"]["targets"][0], "10 הזמנות")
        self.assertIn("הודעות בוואטסאפ מהפוסטים", out["weekly_breakdown"][0]["metrics_target"])
        plan = reveal.apply_cadence_to_posting_plan({"weekly_posts": 3}, payload["first_month_seed"])
        self.assertEqual((plan["weekly_posts"], plan["cadence"]["posts_per_month"]), (2, 6))

    def test_no_seed_means_the_unchanged_prompt(self):
        business = {"name": "x", "audiences": []}
        prompt = strategy_service.posts_prompt(business, {}, {}, {}, [1, 2])
        self.assertIn("כתוב 3 עד 4 פוסטים מוכנים לפרסום לשבועות 1 ו2 בלבד.", prompt)
        self.assertIsNone(reveal.seeded_posts_plan(None, [1, 2]))
        self.assertEqual(reveal.apply_strategy_to_core({"theme": "t"}, None), {"theme": "t"})


if __name__ == "__main__":
    unittest.main()
