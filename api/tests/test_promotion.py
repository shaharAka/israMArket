"""Tests for the Google promotion basics.

Hermetic: no network anywhere. Autocomplete and Search Console are exercised through
mocked `httpx` calls or through their parsing helpers; the endpoints run against a
throwaway SQLite file, the same pattern as the assets suite.
"""

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
from app.services.google_cost import (
    CPC_TIERS,
    INDUSTRIES_BY_KEY,
    SECTORS,
    match_industry,
    plan_for_business,
    plan_from_budget,
)
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


# --- 1. industry mapping -------------------------------------------------------------


class IndustryMappingTest(unittest.TestCase):
    def test_real_product_business_types_land_on_the_right_row(self):
        cases = [
            ("מאפייה / קפה / מסעדה", "חלות ולחמים", "food"),
            ("חנות פיזית / קמעונאות", "בגדים ונעליים", "fashion"),
            ("סטודיו לאימון / ספורט", "אימוני כוח", "education"),
            ("הדרכות, קורסים וחינוך", "קורס צילום", "education"),
            ("תיירות ואירוח", "צימרים בגליל", "tourism"),
            ("קליניקה, יופי ובריאות", "פיזיותרפיה", "health"),
            ("שירותים מקצועיים (עו\"ד, רו\"ח, ייעוץ)", "ייצוג בתביעות", "legal"),
            ("עיצוב / אדריכלות / נדל״ן", "תיווך דירות", "real_estate"),
        ]
        for business_type, offerings, expected in cases:
            with self.subTest(business_type=business_type):
                industry, matched = match_industry(business_type, offerings)
                self.assertIsNotNone(industry)
                self.assertEqual(industry.key, expected)
                self.assertTrue(matched, "matching must be explainable")

    def test_matched_keywords_are_reported(self):
        industry, matched = match_industry("מוסך", "טיפולים וצמיגים")
        self.assertEqual(industry.key, "automotive")
        self.assertIn("מוסך", matched)

    def test_ambiguous_evidence_does_not_drift_to_the_cheapest_row(self):
        """"חנות פיזית / קמעונאות" alone names no category: it must not silently become
        fashion (the cheapest CPC row) or B2B (the priciest)."""
        industry, matched = match_industry("חנות פיזית / קמעונאות", "")
        self.assertIsNone(industry)
        self.assertEqual(matched, [])

    def test_documented_default_is_the_middle_tier_not_an_extreme(self):
        plan = plan_from_budget(10_000, "עסק אחר", "משהו שלא מופיע בטבלה")
        self.assertEqual(plan.industry_key, "general")
        self.assertEqual(plan.cpc_range, CPC_TIERS["medium"])
        cheapest = INDUSTRIES_BY_KEY["fashion"].cpc
        priciest = INDUSTRIES_BY_KEY["b2b_tech"].cpc
        self.assertNotEqual(plan.cpc_range, cheapest)
        self.assertNotEqual(plan.cpc_range, priciest)
        self.assertTrue(any("רצועת הביניים" in warning for warning in plan.warnings))

    def test_unmatched_industry_reports_no_conversion_estimate(self):
        plan = plan_from_budget(10_000, "עסק אחר", "משהו שלא מופיע בטבלה")
        self.assertIsNone(plan.conversion_rate_range)
        self.assertIsNone(plan.expected_conversions)
        self.assertIsNone(plan.cost_per_conversion)
        self.assertIsNone(plan.minimum_viable_budget)

    def test_a_category_signal_gives_an_online_store_the_ecommerce_sector(self):
        """An online store with no priced category still gets the eCommerce rate and
        floor — the sector is known even when the CPC row is not."""
        plan = plan_from_budget(10_000, "חנות אונליין (אי-קומרס)", "מוצרי חשמל")
        self.assertEqual(plan.industry_key, "general")
        self.assertEqual(plan.sector_key, "ecommerce")
        self.assertEqual(plan.conversion_rate_range, SECTORS["ecommerce"]["conversion_rate"])
        self.assertEqual(plan.minimum_viable_budget, SECTORS["ecommerce"]["minimum_budget"])

    def test_b2b_tech_has_a_published_floor_and_no_published_rate(self):
        plan = plan_from_budget(20_000, "סטארטאפ", "פלטפורמת SaaS")
        self.assertEqual(plan.industry_key, "b2b_tech")
        self.assertEqual(plan.sector_key, "tech")
        self.assertEqual(plan.minimum_viable_budget, (15_000, 25_000))
        self.assertIsNone(plan.conversion_rate_range)
        self.assertIsNone(plan.expected_conversions)
        self.assertTrue(any("לא מפרסם עבורו שיעור המרה" in warning for warning in plan.warnings))

    def test_plan_for_business_reads_the_stored_payload(self):
        plan = plan_for_business(BUSINESS)
        self.assertEqual(plan.industry_key, "food")
        self.assertEqual(plan.monthly_budget_ils, 10_000)


# --- 2. ranges, hand-checked ---------------------------------------------------------


class RangeTest(unittest.TestCase):
    def test_renovation_example_is_hand_checked(self):
        """10,000 ₪ · CPC 7-11 ₪ · CR 3-5%
        clicks = 10,000/11 .. 10,000/7 = 909 .. 1,428
        conversions = 909x3% .. 1,428x5% = 27 .. 71
        cost per conversion = 7/5% .. 11/3% = 140 .. 367
        """
        plan = plan_from_budget(10_000, "שיפוצים ובנייה", "שיפוצים לדירות")
        self.assertEqual(plan.cpc_range, (7.0, 11.0))
        self.assertEqual(plan.expected_clicks, (909, 1428))
        self.assertEqual(plan.conversion_rate_range, (0.03, 0.05))
        self.assertEqual(plan.expected_conversions, (27, 71))
        self.assertEqual(plan.cost_per_conversion, (140, 367))

    def test_source_example_falls_inside_our_range(self):
        """The article's own worked example for renovations is 180-300 ₪ per lead at an
        average CPC of 9 ₪. Using the whole CPC range must contain it, not contradict it."""
        plan = plan_from_budget(10_000, "שיפוצים ובנייה", "שיפוצים")
        self.assertLessEqual(plan.cost_per_conversion[0], 180)
        self.assertGreaterEqual(plan.cost_per_conversion[1], 300)

    def test_cost_per_conversion_is_derived_from_the_published_ranges(self):
        plan = plan_from_budget(10_000, "שיפוצים ובנייה", "שיפוצים")
        self.assertEqual(
            plan.cost_per_conversion,
            (round(plan.cpc_range[0] / plan.conversion_rate_range[1]),
             round(plan.cpc_range[1] / plan.conversion_rate_range[0])),
        )
        self.assertTrue(any("נגזרה מהטווחים שפורסמו" in line for line in plan.assumptions))

    def test_every_computed_number_is_a_range(self):
        for budget in (0, 1_000, 5_000, 10_000, 40_000):
            for business_type, offerings in (
                ("מאפייה", "חלות"),
                ("עורך דין", "דיני עבודה"),
                ("חנות אונליין (אי-קומרס)", "מוצרי חשמל"),
                ("עסק אחר", "משהו"),
            ):
                with self.subTest(budget=budget, business_type=business_type):
                    plan = plan_from_budget(budget, business_type, offerings)
                    for value in (
                        plan.expected_clicks,
                        plan.expected_conversions,
                        plan.cost_per_conversion,
                    ):
                        if value is None:
                            continue
                        self.assertEqual(len(value), 2)
                        self.assertLessEqual(value[0], value[1])

    def test_zero_budget_does_not_crash_and_says_so(self):
        plan = plan_from_budget(0, "מאפייה", "חלות")
        self.assertEqual(plan.monthly_budget_ils, 0)
        self.assertTrue(any("לא הוגדר תקציב" in warning for warning in plan.warnings))
        self.assertFalse(any("גוגל צריך" in warning for warning in plan.warnings))

    def test_fees_are_separate_line_items(self):
        plan = plan_from_budget(10_000, "מאפייה", "חלות")
        self.assertEqual(plan.setup_fee, (1_500, 4_000))
        self.assertEqual(plan.management_fee["percent_amount_ils"], (1_500, 2_000))
        self.assertEqual(plan.management_fee["flat_range_ils"], (2_000, 8_000))
        self.assertGreater(plan.total_monthly_ils[1], plan.monthly_budget_ils)
        self.assertGreater(plan.first_month_total_ils[0], plan.total_monthly_ils[0])
        self.assertTrue(any("ניהול" in line for line in plan.assumptions))

    def test_no_search_volume_is_claimed_anywhere(self):
        plan = plan_from_budget(10_000, "מאפייה", "חלות")
        self.assertFalse(hasattr(plan, "search_volume"))
        self.assertTrue(any("נפחי חיפוש" in line for line in plan.assumptions))

    def test_to_dict_is_json_serialisable(self):
        payload = plan_from_budget(10_000, "מאפייה", "חלות").to_dict()
        self.assertEqual(payload["industry_key"], "food")
        self.assertIn("warnings", payload)
        json.dumps(payload, ensure_ascii=False)


# --- 3. warnings ---------------------------------------------------------------------


class WarningTest(unittest.TestCase):
    def test_below_minimum_budget_names_the_trap(self):
        plan = plan_from_budget(3_000, "שיפוצים ובנייה", "שיפוצים")
        self.assertEqual(plan.minimum_viable_budget, (5_000, 8_000))
        trap = [w for w in plan.warnings if "מלכודת" in w]
        self.assertEqual(len(trap), 1)
        self.assertIn("3,000", trap[0])
        self.assertIn("5,000-8,000", trap[0])

    def test_budget_in_the_lower_half_of_the_published_floor_is_flagged(self):
        plan = plan_from_budget(6_000, "שיפוצים ובנייה", "שיפוצים")
        self.assertTrue(any("בחלק התחתון" in warning for warning in plan.warnings))
        self.assertFalse(any("מלכודת" in warning for warning in plan.warnings))

    def test_no_budget_warning_when_the_budget_clears_the_floor(self):
        plan = plan_from_budget(12_000, "שיפוצים ובנייה", "שיפוצים")
        self.assertFalse(any("מינימום שפורסם למגזר" in warning for warning in plan.warnings))

    def test_learning_phase_warning_when_even_the_best_case_is_short(self):
        # Lawyer, 5,000 ₪: clicks 178-277, conversions 8-22 — below 30 even optimistically.
        plan = plan_from_budget(5_000, "שירותים משפטיים", "עורך דין")
        self.assertEqual(plan.expected_conversions, (8, 22))
        learning = [w for w in plan.warnings if "ללמוד" in w]
        self.assertEqual(len(learning), 1)
        self.assertIn("איסוף נתונים", learning[0])
        self.assertIn("ROAS", learning[0])

    def test_learning_phase_warning_when_the_range_straddles_thirty(self):
        plan = plan_from_budget(10_000, "שירותים משפטיים", "עורך דין")
        self.assertEqual(plan.expected_conversions, (17, 44))
        self.assertTrue(any("חוצה את סף" in warning for warning in plan.warnings))

    def test_no_learning_warning_when_the_range_clears_the_threshold(self):
        plan = plan_from_budget(20_000, "חנות אונליין (אי-קומרס)", "בגדים")
        self.assertEqual(plan.industry_key, "fashion")
        self.assertGreaterEqual(plan.expected_conversions[0], 30)
        self.assertFalse(any("ללמוד" in warning for warning in plan.warnings))

    def test_prompt_block_forbids_inventing_numbers(self):
        block = google_cost.prompt_block(plan_from_budget(10_000, "מאפייה", "חלות"))
        self.assertIn("אסור להמציא", block)
        self.assertIn("Keyword Planner", block)
        self.assertIn("טווח CPC", block)


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
        self.assertIn("sc-domain", captured["url"])
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
        self.assertTrue(any("אין לנו גישה לפרופיל" in note for note in guidance["notes"]))


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
        self.assertEqual(body["plan"]["expected_clicks"], first.json()["plan"]["expected_clicks"])
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
