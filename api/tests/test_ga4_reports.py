"""Actual report construction and partial reads; no Google/model/network calls."""
import _test_env  # noqa: F401
import unittest
from types import SimpleNamespace as NS
from unittest import mock
from urllib.parse import parse_qs, urlsplit
from app.config import get_settings
from app.services import ga4


def reply(metrics, values, dimensions=(), dim_values=()):
    return NS(metric_headers=[NS(name=name) for name in metrics],
              dimension_headers=[NS(name=name) for name in dimensions],
              rows=[NS(metric_values=[NS(value=value) for value in values],
                       dimension_values=[NS(value=value) for value in dim_values])])


class Ga4ReportsTest(unittest.TestCase):
    def read(self, answer, **kwargs):
        with mock.patch.object(ga4, "_credentials", return_value=NS(token="offline")), \
                mock.patch.object(ga4, "BetaAnalyticsDataClient") as client:
            client.return_value.run_report.side_effect = answer
            result = ga4.fetch_report("offline", "offline", None, "123", "2026-09-01", "2026-09-28", **kwargs)
            return result, client.return_value.run_report.call_args_list

    def test_first_detailed_read_uses_current_metrics_and_keeps_all_breakdowns(self):
        def answer(request, **kwargs):
            names = [m.name for m in request.metrics]
            self.assertNotIn("conversions", names)
            dims = [d.name for d in request.dimensions]
            if dims:
                self.assertTrue(request.order_bys[0].desc)
                self.assertLessEqual(kwargs["timeout"], 6)
            return reply(names, ["3"] * len(names), dims, ["example"] * len(dims))
        result, calls = self.read(answer)
        self.assertEqual(len(calls), 5)
        self.assertEqual(result["overview"]["conversions"], "3")
        self.assertNotIn("keyEvents", result["overview"])
        self.assertEqual(result["events"][0]["eventCount"], "3")
        self.assertEqual(result["channels"][0]["sessionSourceMedium"], "example")
        self.assertEqual(result["report_scope"], "detailed")
        self.assertTrue(all(v["status"] == "available" for v in result["report_reads"].values()))

    def test_optional_failure_keeps_overview_and_reads_other_sections(self):
        def answer(request, **kwargs):
            dims = [d.name for d in request.dimensions]
            if "sessionCampaignName" in dims:
                raise RuntimeError("private-provider-error")
            return reply([m.name for m in request.metrics], ["0"] * len(request.metrics), dims, ["example"] * len(dims))
        result, calls = self.read(answer)
        self.assertEqual(len(calls), 5)
        self.assertEqual(result["overview"]["sessions"], "0")
        self.assertEqual(result["report_scope"], "partial")
        self.assertNotIn("campaigns", result)
        self.assertEqual(result["report_reads"]["campaigns"]["status"], "unavailable")
        self.assertIn("events", result)
        self.assertNotIn("private-provider", repr(result))

    def test_overview_failure_propagates_instead_of_manufacturing_zero(self):
        with self.assertRaises(RuntimeError):
            self.read(lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("offline")))

    def test_budget_exhaustion_keeps_the_overview_without_more_provider_calls(self):
        with mock.patch.object(ga4, "monotonic", side_effect=[0, 26, 27, 28, 29]):
            result, calls = self.read(lambda *a, **kw: reply(["sessions"], ["42"]))
        self.assertEqual(len(calls), 1)
        self.assertEqual(result["overview"]["sessions"], "42")
        self.assertEqual(result["report_scope"], "partial")

    def test_row_limit_is_declared_and_largest_rows_requested_first(self):
        def answer(request, **kwargs):
            rows = reply(["sessions"], ["1"])
            rows.rows *= int(request.limit) or 1
            return rows
        result, _ = self.read(answer)
        self.assertEqual(result["report_reads"]["campaigns"], {"status": "available", "limit": 30, "limited": True})

    def test_google_account_hint_and_scope_are_encoded_as_single_parameters(self):
        settings = get_settings()
        with mock.patch.object(settings, "google_client_id", "offline"), mock.patch.object(settings, "google_client_secret", "offline"):
            url = ga4.authorization_url("state&not-a-param", "owner+analytics@example.com&other=1")
        query = parse_qs(urlsplit(url).query)
        self.assertEqual(query["state"], ["state&not-a-param"])
        self.assertEqual(query["login_hint"], ["owner+analytics@example.com&other=1"])
        self.assertEqual(query["scope"], [" ".join(ga4.GA4_SCOPES)])
        self.assertNotIn("other", query)
