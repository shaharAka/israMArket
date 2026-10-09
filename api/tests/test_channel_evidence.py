"""Channel evidence validation is deterministic and makes no provider calls."""
import _test_env  # noqa: F401
import unittest
from datetime import date, timedelta
from app.services.channel_evidence import MAX_RECORDS, planning_prompt, validate_records


def evidence(**changes):
    return {"kind": "published_benchmark", "channel": "search_mixed", "metric": "cpc",
            "objective": "leads", "location": "United States", "unit": "money", "currency": "USD",
            "statistic": "median", "value": 5.42, "source_url": "https://publisher.example/report",
            "source_date": "2026-06-01", "period_start": "2025-04-01", "period_end": "2026-03-31",
            "sample_size": 13474, "methodology": "Campaign medians, US sample across Google and Microsoft search.",
            **changes}


class ChannelEvidenceTests(unittest.TestCase):
    def test_future_source_date_rejected_but_provider_horizon_can_be_future(self):
        today = date.today()
        tomorrow = today + timedelta(days=1)
        future = tomorrow + timedelta(days=30)
        for kind, statistic in (("account_result", "aggregate"), ("published_benchmark", "median"),
                                ("provider_forecast", "point")):
            with self.subTest(kind=kind):
                record = evidence(kind=kind, statistic=statistic, source_date=tomorrow.isoformat(),
                                  period_start=tomorrow.isoformat(), period_end=tomorrow.isoformat())
                self.assertEqual(validate_records([record])[0], [])
        record = evidence(kind="provider_forecast", statistic="point", source_date=today.isoformat(),
                          period_start=tomorrow.isoformat(), period_end=future.isoformat())
        accepted, rejected = validate_records([record])
        self.assertFalse(rejected)
        self.assertEqual(accepted[0]["period_end"], future.isoformat())

    def test_record_limit_caps_validated_and_prompt_evidence(self):
        accepted, rejected = validate_records([evidence()] * (MAX_RECORDS + 10))
        self.assertEqual(len(accepted), MAX_RECORDS)
        self.assertEqual(rejected[0]["index"], MAX_RECORDS)
        self.assertIn("10 additional", rejected[0]["reasons"][0])

    def test_account_totals_preserve_unknown_dimensions_but_forecasts_need_targeting(self):
        record = evidence(kind="account_result", statistic="aggregate")
        record.pop("objective"); record.pop("location")
        accepted, rejected = validate_records([record])
        self.assertFalse(rejected)
        self.assertEqual((accepted[0]["objective"], accepted[0]["location"]), ("unknown", "unknown"))
        self.assertIn("Do not infer them", planning_prompt(accepted))
        for patch in ({"objective": "unknown"}, {"location": "mixed"}):
            self.assertEqual(validate_records([evidence(**patch)])[0], [])
            forecast = evidence(kind="provider_forecast", statistic="point", period_start="2026-06-02",
                                period_end="2026-06-30", **patch)
            self.assertEqual(validate_records([forecast])[0], [])

    def test_three_evidence_kinds_stay_separate(self):
        records = [evidence(), evidence(kind="account_result", channel="google_search", statistic="aggregate", value=4.2),
                   evidence(kind="provider_forecast", channel="google_search", statistic="point", value=4.5,
                            period_start="2026-06-02", period_end="2026-06-30")]
        accepted, rejected = validate_records(records)
        self.assertEqual(len(accepted), 3)
        self.assertEqual(rejected, [])
        prompt = planning_prompt(records)
        for kind in ("account_result", "provider_forecast", "published_benchmark"):
            self.assertIn(kind, prompt)
        self.assertNotIn("Missing evidence:", prompt)

    def test_median_cannot_acquire_invented_range_or_unknown_value(self):
        for patch in ({"lower": 2, "upper": 9}, {"value": None}, {"value": True}, {"value": float("nan")}, {"value": float("inf")}):
            with self.subTest(patch=patch):
                accepted, rejected = validate_records([evidence(**patch)])
                self.assertEqual(accepted, [])
                self.assertEqual(len(rejected), 1)

    def test_explicit_range_is_preserved_without_midpoint(self):
        accepted, rejected = validate_records([evidence(statistic="range", value=None, lower=2.5, upper=9.2)])
        self.assertFalse(rejected)
        self.assertEqual((accepted[0]["lower"], accepted[0]["upper"]), (2.5, 9.2))
        self.assertNotIn("value", accepted[0])
        self.assertNotIn("5.85", planning_prompt(accepted))

    def test_source_methodology_and_scope_are_required(self):
        for key in ("source_url", "source_date", "period_start", "period_end", "objective", "location", "currency", "sample_size", "methodology"):
            record = evidence(); record.pop(key)
            with self.subTest(key=key):
                self.assertEqual(validate_records([record])[0], [])
        self.assertEqual(validate_records([evidence(location=" ")])[0], [])

    def test_dates_flag_future_observations_and_broken_publisher_period(self):
        for patch in ({"period_end": "2028-06-30"}, {"period_start": "2026-04-01"},
                      {"kind": "provider_forecast", "statistic": "point"}):
            with self.subTest(patch=patch):
                self.assertEqual(validate_records([evidence(**patch)])[0], [])

    def test_event_definitions_and_rate_units_cannot_be_inferred(self):
        self.assertEqual(validate_records([evidence(metric="conversion_rate", unit="percent", currency=None, value=8.18)])[0], [])
        accepted, rejected = validate_records([evidence(metric="conversion_rate", unit="percent", currency=None, value=8.18,
                                                      result_definition="Recorded leads divided by ad clicks")])
        self.assertFalse(rejected)
        self.assertEqual(accepted[0]["value"], 8.18)
        self.assertEqual(validate_records([evidence(metric="ctr", unit="fraction", currency=None, value=8.18)])[0], [])

    def test_missing_invalid_and_zero_have_distinct_meanings(self):
        prompt = planning_prompt([evidence(value=None)], missing=["Israel campaign forecast access"])
        self.assertIn("Unknown is not zero", prompt)
        self.assertIn("Israel campaign forecast access", prompt)
        self.assertIn("excluded", prompt)
        self.assertNotIn('"value":', prompt)
        accepted, _ = validate_records([evidence(kind="account_result", statistic="aggregate", value=0)])
        self.assertEqual(accepted[0]["value"], 0)

    def test_source_tokens_never_enter_planning_prompt(self):
        prompt = planning_prompt([evidence(source_url="https://provider.example/report?access_token=secret")])
        self.assertNotIn("secret", prompt)
        self.assertIn("excluded", prompt)


if __name__ == "__main__":
    unittest.main()
