"""The public site preview and the three-step first run it feeds.

Hermetic: DNS is faked (so the SSRF guard sees public addresses without a network), every
HTTP request goes to an in-process MockTransport, and each Gemini entry point is replaced
by a fake that answers by schema title. No real site and no real model is ever called.
"""
import _test_env  # noqa: F401  (must come before any `app` import)

import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Business, Strategy, User
from app.routers import onboarding as onboarding_router
from app.routers import public as public_router
from app.services import brand as brand_service
from app.services import preview as preview_service
from app.services import ratelimit
from app.services import scraper
from app.services import strategy as strategy_service
from app.services.jsonutil import dumps, loads

# A sentence only the page body contains. If it ever shows up in a response, the endpoint
# is leaking page text.
PAGE_SECRET = "המשפט הזה מופיע רק בגוף העמוד ואסור שיחזור בתשובה הציבורית של התצוגה"

PAGE_HTML = f"""<!doctype html>
<html lang="he"><head>
<title>מאפיית לחם תום — יפו</title>
<meta name="description" content="מאפייה שכונתית ביפו, חלות ולחם מחמצת כל בוקר">
<style>:root {{ --brand-primary: #c0392b; --brand-accent: #e8a33d; }}</style>
<link rel="stylesheet" href="/site.css">
</head><body>
<h1>לחם מחמצת מהתנור</h1>
<h2>חלות לשישי</h2>
<p>אנחנו אופים כל בוקר מ-05:00 לחם מחמצת, חלות ומאפים לשכונה, עם קמח טוב ומים.</p>
<p>{PAGE_SECRET}</p>
<img src="/hero.jpg" alt="לחם">
<a href="/order">להזמנות</a>
</body></html>"""

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 5000

PUBLIC_IPS = {
    "bakery.example": "93.184.216.34",
    "www.bakery.example": "93.184.216.34",
    "other.example": "93.184.216.35",
    "third.example": "93.184.216.36",
    "sneaky.example": "93.184.216.37",
    "internal.example": "10.0.0.5",
}

BRAND = {
    "business_name": "מאפיית לחם תום",
    "palette": [
        {"hex": "#c0392b", "role": "primary", "name": "אדום לבנים"},
        {"hex": "#e8a33d", "role": "accent", "name": "חרדל"},
        {"hex": "#f4efe6", "role": "background", "name": "שמנת"},
    ],
    "typography": {"primary": "Heebo", "mood": "חם"},
    "visual_style": "עץ וקמח",
    "photography": "אור בוקר",
    "voice": "חם, שכונתי וישיר",
    "voice_examples": ["מהתנור ישר אליכם"],
    "do_say": ["מחמצת"],
    "dont_say": ["מבצע"],
    "messaging": ["טרי כל בוקר"],
    "offers_seen": ["חלות", "לחם מחמצת", "מאפים"],
    "audience": "משפחות מהשכונה",
    "logo_description": "",
}

SITE_PROFILE = {
    "business_name": "מאפיית לחם תום",
    "location": "יפו",
    "value_propositions": ["מחמצת אמיתית"],
    "tone": "חם",
    "audience": "שכונה",
    "offers": ["חלות"],
    "proof_points": [],
}

GUESS = {
    "business_type": "מאפייה / קפה / מסעדה",
    "business_model": "products",
    "presence_type": "brick_and_mortar",
    "offerings_summary": "חלות ולחם מחמצת",
    "post": {
        "product": "חלות לשישי",
        "title": "החלות של שישי",
        "hook": "מה ריח הבוקר ביפו?",
        "caption": "כל שישי מ-05:00 החלות יוצאות מהתנור. בואו מוקדם.",
        "cta": "להזמנה בוואטסאפ",
        "overlay_headline": "חלות חמות לשישי",
    },
}


class FakeWeb:
    """A MockTransport-backed stand-in for the internet, with a request log."""

    def __init__(self):
        self.requests: list[str] = []
        self.routes: dict[str, callable] = {}

    def handler(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        self.requests.append(url)
        route = self.routes.get(request.url.host)
        if route:
            return route(request)
        path = request.url.path
        if path in {"", "/"}:
            return httpx.Response(200, headers={"content-type": "text/html; charset=utf-8"}, text=PAGE_HTML)
        if path == "/site.css":
            return httpx.Response(200, headers={"content-type": "text/css"}, text="body{color:#2d3f32}")
        if path == "/hero.jpg":
            return httpx.Response(200, headers={"content-type": "image/jpeg"}, content=JPEG)
        return httpx.Response(404)


def fake_gemini(calls: list[str]):
    answers = {
        "BrandLanguage": BRAND,
        "SiteExtract": SITE_PROFILE,
        "PreviewGuess": GUESS,
        "PhotoUsability": {"usable_indexes": []},
    }

    def fake(prompt, schema, images=None, thinking_level="LOW"):
        title = schema.get("title")
        calls.append(title)
        return json.dumps(answers[title], ensure_ascii=False)

    return fake


class PreviewTestCase(unittest.TestCase):
    def setUp(self):
        ratelimit.reset()
        preview_service.reset_cache()
        self.web = FakeWeb()
        self.gemini_calls: list[str] = []
        real_client = httpx.Client

        def client_factory(*args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(self.web.handler)
            return real_client(*args, **kwargs)

        def fake_dns(host, port, *args, **kwargs):
            ip = PUBLIC_IPS.get(host)
            if ip is None:
                import socket

                raise socket.gaierror("unknown host")
            return [(2, 1, 6, "", (ip, port))]

        fake = fake_gemini(self.gemini_calls)
        self._patches = [
            mock.patch.object(scraper.httpx, "Client", side_effect=client_factory),
            mock.patch("app.services.netguard.socket.getaddrinfo", side_effect=fake_dns),
            mock.patch.object(brand_service, "lite_json", side_effect=fake),
            mock.patch.object(brand_service, "extract_json", side_effect=fake),
            mock.patch.object(strategy_service, "extract_json", side_effect=fake),
            mock.patch.object(strategy_service, "lite_json", side_effect=fake),
            mock.patch.object(preview_service, "extract_json", side_effect=fake),
        ]
        for patch in self._patches:
            patch.start()
        self.addCleanup(self._cleanup)
        # TestClient subclasses httpx.Client at import time, so the Client patch above
        # does not reach it: it keeps talking to the app, not to the fake web.
        self.client = TestClient(app)

    def _cleanup(self):
        for patch in reversed(self._patches):
            patch.stop()
        app.dependency_overrides.clear()
        ratelimit.reset()
        preview_service.reset_cache()

    def preview(self, url: str, ip: str = "203.0.113.7"):
        return self.client.post("/public/preview", json={"url": url}, headers={"X-Forwarded-For": ip})


class PublicPreviewTest(PreviewTestCase):
    def test_returns_brand_voice_guess_and_one_sample_post(self):
        response = self.preview("bakery.example")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["business_name"], "מאפיית לחם תום")
        self.assertEqual([s["hex"] for s in body["palette"]], ["#c0392b", "#e8a33d", "#f4efe6"])
        self.assertEqual(body["voice"], "חם, שכונתי וישיר")
        self.assertEqual(body["business_type"], "מאפייה / קפה / מסעדה")
        self.assertEqual(body["business_model"], "products")
        self.assertEqual(body["location"], "יפו")
        self.assertEqual(body["offerings"][:2], ["חלות", "לחם מחמצת"])
        post = body["sample_post"]
        for field in ("title", "hook", "caption", "cta", "overlay_headline"):
            self.assertTrue(post[field], field)
        self.assertFalse(body["cached"])
        # One call each: brand, site profile, and the guess + post (no retry needed).
        self.assertCountEqual(self.gemini_calls, ["BrandLanguage", "SiteExtract", "PreviewGuess"])

    def test_never_returns_page_html_or_text(self):
        body = self.preview("https://bakery.example/").json()
        dumped = json.dumps(body, ensure_ascii=False)
        self.assertNotIn(PAGE_SECRET, dumped)
        self.assertNotIn("<html", dumped)
        self.assertNotIn("<p>", dumped)
        for leaked in ("raw", "text", "headings", "images", "image_urls", "extracted"):
            self.assertNotIn(leaked, body)
        self.assertNotIn("text", body["brand_language"])

    def test_is_anonymous_and_writes_nothing(self):
        route = next(r for r in app.routes if getattr(r, "path", "") == "/public/preview")
        dependencies = {dep.call for dep in route.dependant.dependencies}
        self.assertNotIn(get_current_user, dependencies)
        self.assertNotIn(get_db, dependencies)
        # No cookie, no bearer token — and still a 200.
        self.assertEqual(self.preview("bakery.example").status_code, 200)

    def test_repeat_is_served_from_cache_without_scraping_or_spending(self):
        self.assertEqual(self.preview("bakery.example").status_code, 200)
        requests, calls = len(self.web.requests), len(self.gemini_calls)
        for variant in ("https://www.bakery.example/", "http://bakery.example", "BAKERY.example/"):
            response = self.preview(variant)
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json()["cached"], variant)
        self.assertEqual(len(self.web.requests), requests)
        self.assertEqual(len(self.gemini_calls), calls)

    def test_cached_answers_do_not_use_up_the_budget(self):
        with mock.patch.object(public_router, "PREVIEW_PER_IP", 1):
            self.assertEqual(self.preview("bakery.example").status_code, 200)
            for _ in range(5):
                self.assertEqual(self.preview("bakery.example").status_code, 200)

    def test_rate_limited_per_ip(self):
        with mock.patch.object(public_router, "PREVIEW_PER_IP", 2):
            self.assertEqual(self.preview("bakery.example", ip="198.51.100.1").status_code, 200)
            self.assertEqual(self.preview("other.example", ip="198.51.100.1").status_code, 200)
            blocked = self.preview("third.example", ip="198.51.100.1")
            self.assertEqual(blocked.status_code, 429)
            self.assertIn("נסו שוב", blocked.json()["detail"])
            # Another visitor still has a budget.
            self.assertEqual(self.preview("third.example", ip="198.51.100.2").status_code, 200)

    def test_global_budget_caps_everyone(self):
        with mock.patch.object(public_router, "PREVIEW_GLOBAL", 1):
            self.assertEqual(self.preview("bakery.example", ip="198.51.100.1").status_code, 200)
            self.assertEqual(self.preview("other.example", ip="198.51.100.9").status_code, 429)

    def test_default_limit_is_tight(self):
        self.assertLessEqual(public_router.PREVIEW_PER_IP, 5)
        self.assertEqual(public_router.PREVIEW_WINDOW_SECONDS, 3600)

    def test_refuses_internal_targets_before_any_request(self):
        for url in (
            "http://127.0.0.1/",
            "http://localhost:8000/health",
            "http://169.254.169.254/latest/meta-data/",
            "http://internal.example/",
            "ftp://bakery.example/",
        ):
            with self.subTest(url=url):
                response = self.preview(url)
                self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(self.web.requests, [])
        self.assertEqual(self.gemini_calls, [])

    def test_internal_targets_do_not_use_up_the_budget(self):
        with mock.patch.object(public_router, "PREVIEW_PER_IP", 1):
            self.preview("http://127.0.0.1/")
            self.assertEqual(self.preview("bakery.example").status_code, 200)

    def test_redirect_to_a_private_address_is_blocked(self):
        self.web.routes["sneaky.example"] = lambda request: httpx.Response(
            302, headers={"location": "http://10.0.0.1/admin"}
        )
        response = self.preview("sneaky.example")
        self.assertEqual(response.status_code, 422)
        self.assertNotIn("http://10.0.0.1/admin", self.web.requests)
        self.assertEqual(self.gemini_calls, [])

    def test_provider_errors_are_not_shown_to_a_visitor(self):
        def broken(prompt, schema, images=None, thinking_level="LOW"):
            raise RuntimeError("upstream said: key AIza-secret-123 is invalid")

        with mock.patch.object(brand_service, "extract_json", side_effect=broken):
            response = self.preview("bakery.example")
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("AIza", response.text)
        self.assertIn("נסו שוב", response.json()["detail"])
        # A failure is not cached: the retry does the work again.
        self.assertIsNone(preview_service.cached_preview("bakery.example"))

    def test_a_failed_sample_post_still_shows_the_brand(self):
        real = fake_gemini(self.gemini_calls)

        def no_post(prompt, schema, images=None, thinking_level="LOW"):
            if schema.get("title") == "PreviewGuess":
                raise RuntimeError("timeout")
            return real(prompt, schema, images, thinking_level)

        with mock.patch.object(preview_service, "extract_json", side_effect=no_post):
            body = self.preview("bakery.example").json()
        self.assertEqual(body["business_name"], "מאפיית לחם תום")
        self.assertIsNone(body["sample_post"])
        self.assertEqual(body["business_type"], preview_service.FALLBACK_BUSINESS_TYPE)

    def test_invented_business_type_falls_back(self):
        weird = {**GUESS, "business_type": "חללית", "business_model": "x", "presence_type": "y"}
        payload = preview_service._public_payload(
            {"brand_language": BRAND, "extracted": SITE_PROFILE, "raw": {"url": "https://a.example/"}}, weird
        )
        self.assertEqual(payload["business_type"], preview_service.FALLBACK_BUSINESS_TYPE)
        self.assertEqual(payload["business_model"], "products")
        self.assertEqual(payload["presence_type"], "brick_and_mortar")

    def test_slow_site_answers_504_and_finishes_into_the_cache(self):
        def slow(url):
            time.sleep(0.3)
            return {"business_name": "איטי", "palette": []}

        with mock.patch.object(public_router, "PREVIEW_REQUEST_SECONDS", 0.05), mock.patch.object(
            preview_service, "build_preview", side_effect=slow
        ):
            response = self.preview("bakery.example")
            self.assertEqual(response.status_code, 504)
            time.sleep(0.5)
        self.assertEqual(public_router._inflight, {})

    def test_malformed_url_is_a_400(self):
        self.assertEqual(self.preview("javascript:alert(1)").status_code, 400)


class CappedFetchTest(unittest.TestCase):
    """The byte cap and the deadline, on a client that never leaves the process."""

    def _client(self, handler):
        return httpx.Client(transport=httpx.MockTransport(handler))

    def _public_dns(self):
        return mock.patch(
            "app.services.netguard.socket.getaddrinfo",
            return_value=[(2, 1, 6, "", ("93.184.216.34", 443))],
        )

    def test_body_is_cut_at_the_cap(self):
        huge = b"<html>" + b"a" * 500_000

        with self._public_dns(), self._client(lambda r: httpx.Response(200, content=huge)) as client:
            response = scraper.capped_get(
                client, "https://big.example/", max_bytes=10_000, deadline=time.monotonic() + 5
            )
        self.assertEqual(len(response.content), 10_001)
        self.assertEqual(response.status_code, 200)

    def test_gzip_is_counted_after_decoding(self):
        import gzip

        bomb = gzip.compress(b"a" * 2_000_000)
        handler = lambda r: httpx.Response(200, headers={"content-encoding": "gzip"}, content=bomb)
        with self._public_dns(), self._client(handler) as client:
            response = scraper.capped_get(
                client, "https://bomb.example/", max_bytes=50_000, deadline=time.monotonic() + 5
            )
        self.assertEqual(len(response.content), 50_001)
        # Re-wrapped already decoded: reading it again must not try to gunzip.
        self.assertTrue(response.text.startswith("aaaa"))

    def test_expired_deadline_stops_before_the_request(self):
        seen = []
        with self._public_dns(), self._client(lambda r: seen.append(r) or httpx.Response(200)) as client:
            with self.assertRaises(scraper.ScrapeBudgetExceeded):
                scraper.capped_get(client, "https://late.example/", max_bytes=10, deadline=time.monotonic() - 1)
        self.assertEqual(seen, [])

    def test_redirect_hops_are_revalidated(self):
        def handler(request):
            return httpx.Response(302, headers={"location": "http://127.0.0.1/"})

        with self._public_dns(), self._client(handler) as client:
            with self.assertRaises(Exception) as ctx:
                scraper.capped_get(client, "https://hop.example/", max_bytes=10, deadline=time.monotonic() + 5)
        self.assertIn("פנימיות", str(ctx.exception))

    def test_default_scrape_keeps_the_historic_path(self):
        """No limits = the authenticated scan is untouched by the preview's caps."""
        with mock.patch.object(scraper, "_limited_fetchers") as limited, mock.patch.object(
            scraper, "safe_get", side_effect=httpx.ConnectError("offline")
        ), self._public_dns():
            with self.assertRaises(RuntimeError):
                scraper.scrape_site("https://bakery.example/")
        limited.assert_not_called()


def _posts_reply(first_week: int) -> str:
    posts = []
    for offset in range(2):
        posts.append(
            {
                "week": first_week + offset,
                "date_hint": "",
                "format": "image",
                "title": f"פוסט {first_week + offset}",
                "angle": "זווית",
                "hook": "פתיחה",
                "caption": "כיתוב",
                "cta": "לפרטים",
                "calendar_tie": "",
                "goal_fit": "",
                "why_now": "",
                "image_prompt": "bakery",
                "overlay_text": "טרי",
                "primary_outlet": "instagram",
                "outlets": ["instagram"],
                "metrics_to_watch": [],
                "stat_highlight": "",
                "outlet_captions": {"instagram": "א", "facebook": "ב", "whatsapp": "ג"},
                "audience_name": "",
                "inspiration_refs": [],
                "inspiration_note": "",
            }
        )
    return json.dumps({"posts": posts}, ensure_ascii=False)


MODEL_QUARTER = {
    "horizon": "שלושת החודשים הקרובים",
    "hypothesis": "רבעון שהמודל הציע בעצמו",
    "targets": ["יעד א"],
    "milestones": [{"month_label": "אוקטובר", "milestone": "פתיחה", "checkpoint": "בדיקה"}],
}


class FirstRunTest(PreviewTestCase):
    """Signup → three short steps → a generated month, with no deferred decision made."""

    def setUp(self):
        super().setUp()
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-firstrun-"))
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

    def test_onboarding_scan_reuses_the_preview(self):
        self.assertEqual(self.preview("bakery.example").status_code, 200)
        requests, calls = len(self.web.requests), list(self.gemini_calls)
        with mock.patch.object(onboarding_router, "scan_website") as scan, mock.patch.object(
            onboarding_router, "fetch_photo_candidates", return_value=[]
        ):
            response = self.client.post("/onboarding/scan", json={"website_url": "https://bakery.example"})
        self.assertEqual(response.status_code, 200, response.text)
        scan.assert_not_called()
        self.assertEqual(len(self.web.requests), requests)
        self.assertEqual(self.gemini_calls, calls)
        business = response.json()["business"]
        self.assertEqual(business["name"], "מאפיית לחם תום")
        self.assertEqual(business["location"], "יפו")
        self.assertEqual(business["brand_language"]["voice"], "חם, שכונתי וישיר")

    def test_onboarding_scan_without_a_preview_still_scans(self):
        with mock.patch.object(
            onboarding_router,
            "scan_website",
            return_value={"raw": {"url": "https://x.example/"}, "extracted": {}, "brand_language": BRAND},
        ) as scan, mock.patch.object(onboarding_router, "fetch_photo_candidates", return_value=[]):
            response = self.client.post("/onboarding/scan", json={"website_url": "https://x.example"})
        self.assertEqual(response.status_code, 200)
        scan.assert_called_once()

    def _three_steps(self, business_model: str, goal: str) -> None:
        # Step 1 + 2: the business and the budget, in the profile shape the web sends.
        profile = {
            "name": "סטודיו נועה",
            "website_url": "https://bakery.example",
            "business_type": "עיצוב / אדריכלות / נדל״ן",
            "offerings": "עיצוב פנים לדירות",
            "location": "חיפה",
            "business_model": business_model,
            "presence_type": "hybrid",
            "monthly_budget_ils": 3500,
            "competitors": [{"name": "מתחרה", "website_url": ""}],
            "primary_goal": goal,
        }
        response = self.client.post("/onboarding/profile", json=profile)
        self.assertEqual(response.status_code, 200, response.text)
        # Step 3: competitor Instagram usernames.
        business = self.db.query(Business).one()
        stored = loads(business.scraped_profile_json, {}) or {}
        stored.update({"brand_language": BRAND, "extracted": SITE_PROFILE, "raw": {}})
        business.scraped_profile_json = dumps(stored)
        self.db.commit()
        handles = self.client.put("/instagram/handles", json={"handles": ["@Rival.Studio", "https://instagram.com/other_one/"]})
        self.assertEqual(handles.status_code, 200, handles.text)

    def _generate(self) -> dict:
        prompts: list[tuple[str, str]] = []

        def fake_strategy(prompt, schema):
            title = schema.get("title")
            prompts.append((title, prompt))
            if title == "StrategyDefinition":
                return json.dumps({"usp": "בידול", "usp_one_liner": "משפט", "growth_hypothesis": "השערה"}, ensure_ascii=False)
            if title == "MonthlyPlanCore":
                return json.dumps(
                    {
                        "theme": "חודש ראשון",
                        "summary": "סיכום",
                        "relevant_events": [],
                        "long_horizon_plan": MODEL_QUARTER,
                        "monthly_horizon_plan": {"hypothesis": "החודש", "targets": []},
                        "management_and_checkpoints": {"how_we_help": "", "when_we_need_user": [], "checkpoints": []},
                        "weekly_breakdown": [{"week": 1, "focus": "פתיחה"}],
                    },
                    ensure_ascii=False,
                )
            if title == "MonthlyPosts":
                return _posts_reply(3 if "3 ו4" in prompt or "[3, 4]" in prompt else 1)
            raise AssertionError(f"unexpected strategy call {title}")

        with mock.patch.object(strategy_service, "strategy_json", side_effect=fake_strategy), mock.patch.object(
            strategy_service, "scrape_site", side_effect=AssertionError("competitor without a site is not scraped")
        ):
            result = {}
            for _ in range(6):
                response = self.client.post("/onboarding/generate")
                self.assertEqual(response.status_code, 200, response.text)
                result = response.json()
                if result.get("done"):
                    break
        self.prompts = prompts
        return result

    def test_month_is_generated_with_no_targets_quarter_diagnostics_or_direction(self):
        self._three_steps("products", "sales")
        result = self._generate()
        self.assertTrue(result["done"])
        business = result["business"]
        self.assertTrue(business["onboarding_complete"])
        self.assertEqual(len(result["strategy"]["roadmap"]["posts"]), 4)
        # The deferred decisions are still open, and say so, for /decisions and /plan.
        self.assertCountEqual(
            business["deferred_decisions"],
            ["diagnostics", "growth_targets", "long_horizon_plan", "growth_hypothesis"],
        )
        # The planner proposed its own quarter; nothing was approved, so nothing was forced.
        self.assertEqual(result["strategy"]["long_horizon_plan"], MODEL_QUARTER)
        self.assertEqual(business["instagram_handles"], ["rival.studio", "other_one"])
        # The brand from the scan survived generation.
        self.assertEqual(business["brand_language"]["voice"], "חם, שכונתי וישיר")
        self.assertEqual(self.db.query(Strategy).count(), 1)
        titles = [title for title, _ in self.prompts]
        self.assertEqual(titles.count("StrategyDefinition"), 1)
        self.assertEqual(titles.count("MonthlyPosts"), 2)

    def test_goal_defaults_from_the_business_model(self):
        self._three_steps("services", "leads")
        business = self.db.query(Business).one()
        business.primary_goal = ""
        self.db.commit()
        result = self._generate()
        self.assertTrue(result["done"])
        self.assertEqual(result["business"]["primary_goal"], "leads")

    def test_mismatched_goal_is_repaired_not_passed_to_the_planner(self):
        self._three_steps("products", "sales")
        business = self.db.query(Business).one()
        business.primary_goal = "personal_brand"
        self.db.commit()
        result = self._generate()
        self.assertEqual(result["business"]["primary_goal"], "sales")

    def test_deferred_decisions_close_when_made_later(self):
        self._three_steps("products", "sales")
        response = self.client.post(
            "/onboarding/profile",
            json={
                "name": "סטודיו נועה",
                "business_type": "חנות פיזית / קמעונאות",
                "offerings": "כלים",
                "monthly_budget_ils": 3500,
                "primary_goal": "sales",
                "growth_targets": ["יעד"],
                "diagnostics": {"has_customer_club": "no"},
            },
        )
        self.assertCountEqual(
            response.json()["business"]["deferred_decisions"], ["long_horizon_plan", "growth_hypothesis"]
        )

    def test_an_unreachable_competitor_site_does_not_block_the_month(self):
        self._three_steps("products", "sales")
        self.client.post(
            "/onboarding/profile",
            json={
                "name": "סטודיו נועה",
                "website_url": "https://bakery.example",
                "business_type": "חנות פיזית / קמעונאות",
                "offerings": "כלים",
                "monthly_budget_ils": 3500,
                "primary_goal": "sales",
                "competitors": [{"name": "המתחרה", "website_url": "https://down.example"}],
            },
        )
        scraped = []

        def unreachable(url, *args, **kwargs):
            scraped.append(url)
            raise RuntimeError("לא הצלחנו לטעון את האתר")

        usp = json.dumps({"usp": "בידול", "growth_hypothesis": "השערה"}, ensure_ascii=False)
        with mock.patch.object(strategy_service, "scrape_site", side_effect=unreachable), mock.patch.object(
            strategy_service, "strategy_json", return_value=usp
        ):
            first = self.client.post("/onboarding/generate")
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(scraped, ["https://down.example"])
        self.assertEqual(first.json()["generate_state"]["stage"], "plan")
        names = [item["name"] for item in first.json()["generate_state"]["competitors"]]
        self.assertEqual(names, ["המתחרה"])

    def test_generation_that_scans_itself_keeps_saved_decisions(self):
        """No saved scan: the planner reads the site and must not wipe what was stored."""
        self.client.post(
            "/onboarding/profile",
            json={
                "name": "סטודיו נועה",
                "website_url": "https://bakery.example",
                "business_type": "חנות פיזית / קמעונאות",
                "offerings": "כלים",
                "monthly_budget_ils": 3500,
                "primary_goal": "sales",
                "growth_targets": ["היעד שבחרתי"],
            },
        )
        fresh = {"raw": {}, "extracted": SITE_PROFILE, "brand_language": BRAND}
        with mock.patch.object(strategy_service, "scan_website", return_value=fresh):
            result = self._generate()
        self.assertTrue(result["done"])
        self.assertEqual(result["business"]["growth_targets"], ["היעד שבחרתי"])
        self.assertEqual(result["business"]["brand_language"]["voice"], BRAND["voice"])


if __name__ == "__main__":
    unittest.main()
