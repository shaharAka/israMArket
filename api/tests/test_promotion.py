"""Tests for the Google promotion basics.

Hermetic: no network anywhere. Autocomplete and Search Console are exercised through
mocked `httpx` calls or through their parsing helpers; the endpoints run against a
throwaway SQLite file, the same pattern as the assets suite.
"""
import _test_env  # noqa: F401  (must come before any `app` import)

import json
import shutil
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
from app.models import Business, Integration, User
from app.routers import promotion as promotion_router
from app.services import google_cost, keywords
from app.services.google_cost import plan_for_business, plan_from_budget
from app.services.jsonutil import dumps


class FakeResponse:
    """Enough of an httpx.Response for the parsers under test."""

    def __init__(self, payload, status_code: int = 200):
        self.status_code = status_code
        self.text = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)

    def json(self):
        return json.loads(self.text)


BUSINESS = {
    "name": "מאפיית לחם תום",
    "website_url": "https://www.lechem-tom.co.il",
    "business_type": "מאפייה / קפה / מסעדה",
    "offerings": "חלות מחמצת, לחמים, מאפים",
    "location": "תל אביב",
    "presence_type": "brick_and_mortar",
    "business_model": "products",
    "monthly_budget_ils": 10_000,
}


# --- 1. Google forecasts remain in the owner's Google Ads account -----------------


class NoPersonalGoogleForecastTest(unittest.TestCase):
    def test_plan_keeps_the_owner_budget_and_leaves_all_market_estimates_empty(self):
        plan = plan_for_business(BUSINESS)
        self.assertEqual(plan.monthly_budget_ils, BUSINESS["monthly_budget_ils"])
        self.assertEqual(plan.industry_key, "food")
        self.assertIsNone(plan.cpc_range)
        self.assertIsNone(plan.expected_clicks)
        self.assertIsNone(plan.conversion_rate_range)
        self.assertIsNone(plan.expected_conversions)
        self.assertIsNone(plan.cost_per_conversion)
        self.assertIsNone(plan.minimum_viable_budget)
        self.assertIsNone(plan.management_fee)
        self.assertIsNone(plan.setup_fee)
        self.assertIsNone(plan.total_monthly_ils)
        self.assertIsNone(plan.first_month_total_ils)
        self.assertEqual(plan.warnings, [])

    def test_plan_does_not_compare_or_classify_the_owner_as_a_campaign(self):
        plan = plan_from_budget(3_000, "שיפוצים ובנייה", "שיפוצים")
        self.assertEqual(plan.monthly_budget_ils, 3_000)
        self.assertIsNone(plan.sector_key)
        self.assertIsNone(plan.sector_label)
        self.assertIsNone(plan.minimum_viable_budget)
        self.assertEqual(plan.channel_comparison, {})

    def test_prompt_directs_to_google_forecast_and_forbids_agency_assumptions(self):
        block = google_cost.prompt_block(plan_from_budget(10_000, "מאפייה", "חלות"))
        self.assertIn("Keyword Planner", block)
        self.assertIn("Never infer", block)
        for forbidden in ("CPC", "minimum", "agency/setup fees"):
            self.assertIn(forbidden, block)
        for unsupported in ("15%-20%", "Rulers"):
            self.assertNotIn(unsupported, block)

    def test_only_official_google_sources_are_returned(self):
        plan = plan_from_budget(10_000, "מאפייה", "חלות")
        self.assertIn("support.google.com/google-ads", plan.source)
        self.assertIn("support.google.com/google-ads", google_cost.BUDGET_SOURCE_URL)
        self.assertNotIn("rulers.co.il", json.dumps(plan.to_dict(), ensure_ascii=False))
        json.dumps(plan.to_dict(), ensure_ascii=False)

    def test_profile_guidance_uses_business_label_without_cost_claims(self):
        profile = google_cost.business_profile_guidance(BUSINESS)
        self.assertEqual(profile["suggested_category_hint"], "אוכל ושתייה")
        self.assertFalse(any("מינימום" in step["why"] for step in profile["steps"]))


# --- 4. autocomplete -----------------------------------------------------------------


class AutocompleteParseTest(unittest.TestCase):
    def test_parses_the_firefox_shape(self):
        payload = '["מאפייה", ["מאפייה תל אביב", "מאפייה פתוחה בשבת"]]'
        self.assertEqual(
            keywords._parse_suggest(payload),
            ["מאפייה תל אביב", "מאפייה פתוחה בשבת"],
        )

    def test_parses_the_chrome_shape(self):
        payload = json.dumps(["מאפייה", [["מאפייה קרובה", 0], ["מאפייה בחולון", 0]], {"k": 1}])
        self.assertEqual(keywords._parse_suggest(payload), ["מאפייה קרובה", "מאפייה בחולון"])

    def test_malformed_payloads_return_empty_lists(self):
        for payload in (
            "",
            "not json at all",
            '{"query": "מאפייה"}',
            '["מאפייה"]',
            '["מאפייה", "לא רשימה"]',
            '["מאפייה", [123, null, {"a": 1}]]',
            "[]",
        ):
            with self.subTest(payload=payload):
                self.assertEqual(keywords._parse_suggest(payload), [])

    def test_partial_garbage_is_skipped_not_fatal(self):
        payload = '["מאפייה", ["טוב", 17, ["גם טוב", 0], null]]'
        self.assertEqual(keywords._parse_suggest(payload), ["טוב", "גם טוב"])

    def test_autocomplete_uses_the_public_suggest_endpoint(self):
        captured = {}

        def fake_get(url, **kwargs):
            captured["url"] = url
            captured["params"] = kwargs.get("params")
            return FakeResponse('["מאפייה", ["מאפייה בתל אביב"]]')

        with mock.patch.object(keywords.httpx, "get", side_effect=fake_get):
            terms = keywords.autocomplete("מאפייה")
        self.assertEqual(terms, ["מאפייה בתל אביב"])
        self.assertEqual(captured["url"], keywords.SUGGEST_ENDPOINT)
        self.assertEqual(captured["params"]["client"], "firefox")
        self.assertEqual(captured["params"]["hl"], "he")
        self.assertEqual(captured["params"]["gl"], "il")
        self.assertEqual(captured["params"]["q"], "מאפייה")

    def test_unreachable_suggest_degrades_instead_of_raising(self):
        for error in (httpx.ConnectError("no dns"), httpx.ReadTimeout("slow"), OSError("boom")):
            with self.subTest(error=type(error).__name__):
                with mock.patch.object(keywords.httpx, "get", side_effect=error):
                    self.assertEqual(keywords.autocomplete("מאפייה"), [])

    def test_http_error_status_degrades(self):
        with mock.patch.object(keywords.httpx, "get", return_value=FakeResponse("nope", status_code=503)):
            self.assertEqual(keywords.autocomplete("מאפייה"), [])

    def test_too_short_seed_is_not_sent(self):
        with mock.patch.object(keywords.httpx, "get") as mocked:
            self.assertEqual(keywords.autocomplete("א"), [])
        mocked.assert_not_called()


# --- 5. intent -----------------------------------------------------------------------


class IntentTest(unittest.TestCase):
    def test_branded(self):
        result = keywords.classify_intent("מאפיית לחם תום תל אביב", BUSINESS)
        self.assertEqual(result["intent"], "branded")
        self.assertTrue(result["label"])

    def test_branded_beats_everything_else(self):
        result = keywords.classify_intent("מאפיית לחם תום מחיר", BUSINESS)
        self.assertEqual(result["intent"], "branded")

    def test_local_from_the_business_location(self):
        result = keywords.classify_intent("מאפייה בתל אביב", BUSINESS)
        self.assertEqual(result["intent"], "local")

    def test_local_from_a_proximity_word(self):
        result = keywords.classify_intent("מאפייה קרובה אלי", BUSINESS)
        self.assertEqual(result["intent"], "local")

    def test_transactional(self):
        for term in ("מאפייה מחיר", "להזמין חלות", "מבצע על לחם", "משלוח חלות", "לידים לשיפוצים"):
            with self.subTest(term=term):
                self.assertEqual(keywords.classify_intent(term, BUSINESS)["intent"], "transactional")

    def test_commercial(self):
        for term in ("מאפייה מומלצת", "השוואה בין מאפיות", "ביקורות על מאפיות"):
            with self.subTest(term=term):
                self.assertEqual(keywords.classify_intent(term, BUSINESS)["intent"], "commercial")

    def test_brand_words_do_not_come_from_the_product(self):
        """"מבצע על לחם" is a transactional query, not a branded one, even though the
        business is called "מאפיית לחם תום"."""
        self.assertEqual(keywords.classify_intent("מבצע על לחם", BUSINESS)["intent"], "transactional")

    def test_a_brand_word_does_not_match_inside_a_longer_common_word(self):
        """A business called "שיפוצי אבי" must not claim every query with "שיפוצים"."""
        business = {"name": "שיפוצי אבי", "business_type": "שיפוצים ובנייה", "location": "חולון"}
        self.assertEqual(keywords.classify_intent("שיפוצים ובנייה מחיר", business)["intent"], "transactional")
        self.assertEqual(keywords.classify_intent("שיפוצים מומלצים", business)["intent"], "commercial")
        self.assertEqual(keywords.classify_intent("שיפוצי אבי מחיר", business)["intent"], "branded")
        # A Hebrew prefixed letter is still the same brand word.
        self.assertEqual(keywords.classify_intent("לשיפוצי אבי", business)["intent"], "branded")

    def test_informational(self):
        for term in ("איך מכינים מחמצת", "מדריך לאפייה", "טיפים לאפייה ביתית"):
            with self.subTest(term=term):
                self.assertEqual(keywords.classify_intent(term, BUSINESS)["intent"], "informational")

    def test_general_when_no_rule_fires(self):
        result = keywords.classify_intent("חלות מחמצת", BUSINESS)
        self.assertEqual(result["intent"], "general")
        self.assertEqual(result["matched"], [])

    def test_short_words_do_not_fire_inside_longer_words(self):
        """"מה" must not turn "מהדורה" into an informational query."""
        self.assertEqual(keywords.classify_intent("מהדורה חדשה", BUSINESS)["intent"], "general")

    def test_classification_works_without_a_business(self):
        self.assertEqual(keywords.classify_intent("מחיר")["intent"], "transactional")
        self.assertEqual(keywords.classify_intent("משהו")["intent"], "general")

    def test_label_is_present_for_every_intent(self):
        for intent in keywords.INTENTS:
            self.assertTrue(keywords.INTENT_LABELS[intent])


# --- 6. Search Console ---------------------------------------------------------------


def sites_payload(*site_urls):
    return {"siteEntry": [{"siteUrl": url, "permissionLevel": "siteOwner"} for url in site_urls]}


def analytics_payload(*rows):
    return {"rows": list(rows)}


class SearchConsoleTest(unittest.TestCase):
    def test_no_token_returns_none_without_calling_google(self):
        with mock.patch.object(keywords.httpx, "get") as mocked:
            self.assertIsNone(keywords.search_console_queries(None, "https://example.co.il"))
            self.assertIsNone(keywords.search_console_queries("", "https://example.co.il"))
        mocked.assert_not_called()

    def test_api_error_returns_none(self):
        with mock.patch.object(keywords.httpx, "get", return_value=FakeResponse("denied", status_code=403)):
            self.assertIsNone(keywords.search_console_queries("token", "https://example.co.il"))

    def test_transport_error_returns_none(self):
        with mock.patch.object(keywords.httpx, "get", side_effect=httpx.ConnectError("no dns")):
            self.assertIsNone(keywords.search_console_queries("token", "https://example.co.il"))

    def test_no_matching_property_returns_none(self):
        with mock.patch.object(
            keywords.httpx, "get", return_value=FakeResponse(sites_payload("https://someone-else.co.il/"))
        ):
            self.assertIsNone(keywords.search_console_queries("token", "https://example.co.il"))

    def test_scope_check(self):
        self.assertTrue(keywords.search_console_scope_granted([keywords.SEARCH_CONSOLE_SCOPE]))
        self.assertTrue(keywords.search_console_scope_granted(None))  # unknown → try
        self.assertFalse(
            keywords.search_console_scope_granted(["https://www.googleapis.com/auth/analytics.readonly"])
        )

    def test_site_matching_handles_url_prefix_and_domain_properties(self):
        sites = sites_payload("https://someone-else.co.il/", "sc-domain:example.co.il")
        self.assertEqual(
            keywords.site_for_website(sites, "https://www.example.co.il/path"),
            "sc-domain:example.co.il",
        )
        self.assertEqual(
            keywords.site_for_website(sites_payload("https://example.co.il/"), "https://example.co.il"),
            "https://example.co.il/",
        )
        self.assertIsNone(keywords.site_for_website(sites_payload("https://a.co.il/"), "https://b.co.il"))

    def test_queries_and_quick_wins_come_back_parsed(self):
        def fake_get(url, **kwargs):
            self.assertEqual(url, f"{keywords.SEARCH_CONSOLE_API}/sites")
            return FakeResponse(sites_payload("sc-domain:example.co.il"))

        captured = {}

        def fake_post(url, **kwargs):
            captured["url"] = url
            captured["json"] = kwargs.get("json")
            return FakeResponse(
                analytics_payload(
                    {"keys": ["מאפייה תל אביב"], "clicks": 12, "impressions": 480, "ctr": 0.025, "position": 6.4},
                    {"keys": ["מאפייה"], "clicks": 90, "impressions": 4_000, "ctr": 0.0225, "position": 1.8},
                )
            )

        with mock.patch.object(keywords.httpx, "get", side_effect=fake_get), mock.patch.object(
            keywords.httpx, "post", side_effect=fake_post
        ):
            payload = keywords.search_console_queries("token", "https://example.co.il")

        self.assertIsNotNone(payload)
        self.assertEqual(payload["site_url"], "sc-domain:example.co.il")
        self.assertEqual(len(payload["queries"]), 2)
        self.assertEqual(payload["queries"][0]["query"], "מאפייה תל אביב")
        self.assertEqual(payload["queries"][0]["impressions"], 480)
        self.assertEqual([row["query"] for row in payload["quick_wins"]], ["מאפייה תל אביב"])
        # Google's REST path is case-sensitive; lowercase searchanalytics returns 404.
        self.assertEqual(
            captured["url"],
            "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aexample.co.il/searchAnalytics/query",
        )
        self.assertEqual(captured["json"]["dimensions"], ["query"])
        self.assertEqual(payload["period"]["days"], 28)

    def test_malformed_analytics_rows_are_dropped(self):
        rows = keywords._parse_search_rows(
            {"rows": [{"keys": ["טוב"], "clicks": "3", "impressions": "9"}, {"keys": []}, "not a dict"]}
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["query"], "טוב")
        self.assertEqual(rows[0]["clicks"], 3)


class QuickWinTest(unittest.TestCase):
    def rows(self):
        return [
            {"query": "כבר במקום ראשון", "clicks": 100, "impressions": 5_000, "position": 1.4},
            {"query": "קרוב לעמוד הראשון", "clicks": 4, "impressions": 900, "position": 7.2},
            {"query": "עוד יותר למטה", "clicks": 2, "impressions": 700, "position": 14.0},
            {"query": "רחוק מדי", "clicks": 0, "impressions": 600, "position": 45.0},
            {"query": "כמעט ואין חשיפות", "clicks": 0, "impressions": 9, "position": 8.0},
            {"query": "בדיוק בגבול", "clicks": 1, "impressions": 60, "position": 20.0},
        ]

    def test_filter_keeps_only_actionable_rows(self):
        wins = keywords.quick_wins(self.rows())
        self.assertEqual(
            [row["query"] for row in wins],
            ["קרוב לעמוד הראשון", "עוד יותר למטה", "בדיוק בגבול"],
        )

    def test_sorting_is_by_impressions(self):
        wins = keywords.quick_wins(self.rows())
        impressions = [row["impressions"] for row in wins]
        self.assertEqual(impressions, sorted(impressions, reverse=True))

    def test_every_win_carries_its_reason(self):
        for row in keywords.quick_wins(self.rows()):
            self.assertIn("חשיפות", row["why"])

    def test_thresholds_are_reported_to_the_caller(self):
        payload = keywords.collect(BUSINESS, suggest=lambda seed: [])
        self.assertEqual(payload["thresholds"]["quick_win_position"], keywords.QUICK_WIN_POSITION)
        self.assertEqual(
            payload["thresholds"]["quick_win_min_impressions"], keywords.QUICK_WIN_MIN_IMPRESSIONS
        )


# --- 7. assembly / degradation -------------------------------------------------------


class CollectTest(unittest.TestCase):
    def test_degrades_to_autocomplete_when_search_console_is_absent(self):
        payload = keywords.collect(BUSINESS, search_console=None, suggest=lambda seed: [f"{seed} מחיר"])
        self.assertFalse(payload["search_console_connected"])
        self.assertTrue(payload["keywords"])
        self.assertTrue(all("clicks" not in item for item in payload["keywords"]))
        self.assertFalse(payload["sources"]["search_console"]["connected"])
        self.assertIn("לא מחובר", payload["sources"]["search_console"]["note"])
        self.assertFalse(payload["sources"]["search_volumes"]["available"])
        self.assertIn("Keyword Planner", payload["sources"]["search_volumes"]["note"])

    def test_unreachable_suggest_is_reported_not_hidden(self):
        payload = keywords.collect(BUSINESS, suggest=lambda seed: [])
        self.assertEqual(payload["keywords"], [])
        self.assertFalse(payload["sources"]["autocomplete"]["available"])
        self.assertIn("לנסות שוב", payload["sources"]["autocomplete"]["note"])

    def test_seeds_come_from_the_business_and_include_competitors(self):
        business = dict(BUSINESS, competitors=[{"name": "מאפיית השכן"}])
        seeds = keywords.seeds_for(business)
        self.assertIn("מאפיית לחם תום", seeds)
        self.assertIn("מאפיית השכן", seeds)
        self.assertIn("תל אביב", seeds)

    def test_search_console_rows_enrich_and_extend_the_list(self):
        console = {
            "site_url": "sc-domain:lechem-tom.co.il",
            "period": {"start": "2026-01-01", "end": "2026-01-28", "days": 28},
            "queries": [
                {"query": "מאפייה תל אביב", "clicks": 5, "impressions": 300, "ctr": 0.016, "position": 7.0},
                {"query": "מאפייה פתוחה בשבת", "clicks": 1, "impressions": 90, "ctr": 0.011, "position": 11.0},
            ],
            "quick_wins": [{"query": "מאפייה תל אביב", "impressions": 300, "position": 7.0, "why": "x"}],
        }
        payload = keywords.collect(
            BUSINESS, search_console=console, suggest=lambda seed: ["מאפייה תל אביב"]
        )
        self.assertTrue(payload["search_console_connected"])
        by_term = {item["term"]: item for item in payload["keywords"]}
        enriched = by_term["מאפייה תל אביב"]
        self.assertEqual(enriched["source"], "autocomplete+search_console")
        self.assertEqual(enriched["impressions"], 300)
        self.assertEqual(enriched["position"], 7.0)
        self.assertEqual(by_term["מאפייה פתוחה בשבת"]["source"], "search_console")
        self.assertEqual(payload["quick_wins"][0]["query"], "מאפייה תל אביב")
        self.assertIn("מחובר", payload["sources"]["search_console"]["note"])

    def test_every_keyword_carries_an_intent_label(self):
        payload = keywords.collect(BUSINESS, suggest=lambda seed: [f"{seed} מחיר", f"איך {seed}"])
        self.assertTrue(payload["keywords"])
        for item in payload["keywords"]:
            self.assertIn(item["intent"], keywords.INTENTS)
            self.assertEqual(item["intent_label"], keywords.INTENT_LABELS[item["intent"]])

    def test_duplicate_terms_are_merged(self):
        payload = keywords.collect(BUSINESS, suggest=lambda seed: ["מאפייה תל אביב"] * 3)
        terms = [item["term"] for item in payload["keywords"]]
        self.assertEqual(terms.count("מאפייה תל אביב"), 1)


# --- 8. GBP guidance -----------------------------------------------------------------


class BusinessProfileTest(unittest.TestCase):
    def test_checklist_covers_the_free_local_surface(self):
        guidance = google_cost.business_profile_guidance(BUSINESS)
        ids = {step["id"] for step in guidance["steps"]}
        self.assertTrue({"claim", "verify", "categories", "hours", "photos", "posts", "qa", "reviews"} <= ids)
        self.assertTrue(guidance["free"])
        self.assertTrue(guidance["is_local"])
        self.assertTrue(all(step["how"] for step in guidance["steps"]))
        self.assertTrue(all(step["why"] for step in guidance["steps"]))

    def test_online_only_business_is_treated_differently(self):
        guidance = google_cost.business_profile_guidance(dict(BUSINESS, presence_type="online_only"))
        self.assertFalse(guidance["is_local"])
        service_area = next(step for step in guidance["steps"] if step["id"] == "service_area")
        self.assertIn("אזור שירות", service_area["title"])

    def test_no_statistics_are_invented(self):
        guidance = google_cost.business_profile_guidance(BUSINESS)
        blob = json.dumps(guidance, ensure_ascii=False)
        for invented in ("% יותר", "אחוז יותר", "מחקרים מראים"):
            self.assertNotIn(invented, blob)
        self.assertTrue(any("אין לנו גישה לכרטיס" in note for note in guidance["notes"]))


# --- 9. endpoints --------------------------------------------------------------------


class PromotionEndpointTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-promotion-"))
        self.engine = create_engine(
            f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False}
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()

        self.owner = User(email="owner@example.com", password_hash="x", full_name="בעל העסק")
        self.db.add(self.owner)
        self.db.flush()
        self.business = Business(
            user_id=self.owner.id,
            name="מאפיית לחם תום",
            website_url="https://lechem-tom.co.il",
            business_type="מאפייה / קפה / מסעדה",
            offerings="חלות מחמצת ולחמים",
            location="תל אביב",
            monthly_budget_ils=10_000,
            primary_goal="sales",
            business_model="products",
        )
        self.db.add(self.business)
        self.db.commit()

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: self.owner
        self.client = TestClient(app)
        promotion_router.cache_clear()
        self.addCleanup(self._cleanup)

    def _cleanup(self):
        app.dependency_overrides.clear()
        promotion_router.cache_clear()
        self.db.close()
        self.engine.dispose()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_routes_are_registered(self):
        paths = {route.path for route in app.routes}
        self.assertIn("/promotion/google", paths)
        self.assertIn("/promotion/keywords", paths)

    def test_requires_authentication(self):
        override = app.dependency_overrides.pop(get_current_user)
        try:
            response = self.client.get("/promotion/google")
        finally:
            app.dependency_overrides[get_current_user] = override
        self.assertEqual(response.status_code, 401)

    def test_google_plan_endpoint_is_deterministic_and_offline(self):
        with mock.patch.object(
            promotion_router.keywords, "autocomplete", side_effect=AssertionError("no network allowed")
        ):
            first = self.client.get("/promotion/google")
            second = self.client.get("/promotion/google")
        self.assertEqual(first.status_code, 200)
        body = first.json()
        self.assertEqual(body["plan"]["industry_key"], "food")
        self.assertIsNone(body["plan"]["expected_clicks"])
        self.assertIsNone(body["plan"]["minimum_viable_budget"])
        self.assertIsNone(body["plan"]["management_fee"])
        self.assertIn("support.google.com/google-ads", body["plan"]["source"])
        self.assertEqual(body["plan"]["warnings"], second.json()["plan"]["warnings"])
        self.assertEqual(body["business_profile"]["steps"][0]["id"], "claim")
        self.assertEqual(body["plan"]["source"], google_cost.SOURCE_URL)

    def test_keywords_endpoint_works_without_search_console(self):
        with mock.patch.object(
            promotion_router, "_search_console", return_value=(None, "לא מחובר בכוונה בבדיקה")
        ), mock.patch.object(
            promotion_router.keywords, "autocomplete", return_value=["חלות מחמצת מחיר"]
        ):
            response = self.client.get("/promotion/keywords")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body["search_console_connected"])
        self.assertIn("לא מחובר בכוונה בבדיקה", body["sources"]["search_console"]["note"])
        self.assertEqual(body["keywords"][0]["term"], "חלות מחמצת מחיר")
        self.assertEqual(body["keywords"][0]["intent"], "transactional")
        self.assertFalse(body["sources"]["search_volumes"]["available"])

    def test_keywords_endpoint_is_cached_and_refreshable(self):
        calls = []

        def fake_autocomplete(seed, **kwargs):
            calls.append(seed)
            return ["מאפייה תל אביב"]

        with mock.patch.object(
            promotion_router, "_search_console", return_value=(None, "")
        ), mock.patch.object(promotion_router.keywords, "autocomplete", side_effect=fake_autocomplete):
            first = self.client.get("/promotion/keywords").json()
            after_first = len(calls)
            second = self.client.get("/promotion/keywords").json()
            third = self.client.get("/promotion/keywords?refresh=true").json()

        self.assertFalse(first["cached"])
        self.assertTrue(second["cached"])
        self.assertFalse(third["cached"])
        self.assertEqual(len(calls), after_first * 2)
        self.assertEqual(first["keywords"], second["keywords"])

    def test_cached_payload_is_per_business(self):
        other = Business(user_id=self.owner.id, name="עסק אחר", business_type="עסק אחר", offerings="משהו")
        self.db.add(other)
        self.db.commit()
        try:
            with mock.patch.object(
                promotion_router, "_search_console", return_value=(None, "")
            ), mock.patch.object(promotion_router.keywords, "autocomplete", return_value=[]):
                self.client.get("/promotion/keywords")
            # get_business hands the caller their newest business, and only that business
            # may end up in the cache.
            self.assertEqual(list(promotion_router._KEYWORD_CACHE), [other.id])
            payload = promotion_router._KEYWORD_CACHE[other.id][1]
            self.assertIn("עסק אחר", payload["seeds"])
        finally:
            self.db.delete(other)
            self.db.commit()

    def test_search_console_helper_degrades_without_an_integration(self):
        payload, note = promotion_router._search_console(self.business)
        self.assertIsNone(payload)
        self.assertIn("לא מחובר", note)

    def test_search_console_helper_reports_a_missing_scope(self):
        self.db.add(
            Integration(
                business_id=self.business.id,
                provider="ga4",
                status="connected",
                external_id="123",
                access_token_enc="x",
                refresh_token_enc="y",
                extra_json=dumps({"scopes": ["https://www.googleapis.com/auth/analytics.readonly"]}),
            )
        )
        self.db.commit()
        self.db.refresh(self.business)
        payload, note = promotion_router._search_console(self.business)
        self.assertIsNone(payload)
        self.assertIn("Search Console", note)

    def test_search_console_helper_never_raises_on_a_broken_connection(self):
        self.db.add(
            Integration(
                business_id=self.business.id,
                provider="ga4",
                status="connected",
                external_id="123",
                access_token_enc="not-decryptable",
                refresh_token_enc="not-decryptable",
                extra_json=dumps({"scopes": [keywords.SEARCH_CONSOLE_SCOPE]}),
            )
        )
        self.db.commit()
        self.db.refresh(self.business)
        payload, note = promotion_router._search_console(self.business)
        self.assertIsNone(payload)
        self.assertTrue(note)

    def test_disconnecting_google_drops_the_cached_keywords(self):
        """Search Console queries must not outlive the grant that produced them."""
        self.db.add(
            Integration(
                business_id=self.business.id,
                provider="ga4",
                status="connected",
                external_id="123",
                access_token_enc="x",
                refresh_token_enc="y",
                extra_json=dumps({"scopes": [keywords.SEARCH_CONSOLE_SCOPE]}),
            )
        )
        self.db.commit()
        promotion_router._KEYWORD_CACHE[self.business.id] = (time.time() + 600, {"keywords": []})

        response = self.client.delete("/integrations/ga4")

        self.assertEqual(response.status_code, 200)
        self.assertNotIn(self.business.id, promotion_router._KEYWORD_CACHE)


if __name__ == "__main__":
    unittest.main()
