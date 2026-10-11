"""Evidence and citation regressions. These do not pretend to evaluate live AI advice."""
import _test_env  # noqa: F401
import unittest
from unittest.mock import patch

from _decision_scenarios import prepared_case, scenarios
from app.services import diagnostics, recommendation_context as context
from app.services.schemas_llm import RECOMMENDATION_SCHEMA


class DecisionEvidenceTest(unittest.TestCase):
    def setUp(self):
        self.raw = scenarios()
        self.cases = {case[0]: prepared_case(index, case)["inputs"] for index, case in enumerate(self.raw)}

    def test_ads_cost_and_outcomes_exist_without_google(self):
        inputs = self.cases["ads_cheap_clicks"]
        self.assertEqual(inputs["ga4"], {})
        basis = inputs["business"]["analysis_basis"]
        facts = {fact["metric"]: fact for fact in basis["observations"]}
        self.assertEqual(facts["spend"]["value"], 1000)
        self.assertEqual(facts["website_purchases"]["value"], 2)
        self.assertEqual(facts["website_purchase_value"]["value"], 240)
        self.assertEqual(facts["cost_per_purchase"]["value"], 500)
        self.assertEqual(facts["purchase_roas"]["value"], .24)
        for metric in ("spend", "website_purchase_value", "cost_per_purchase"):
            self.assertEqual(facts[metric]["currency"], "ILS")
            self.assertEqual(facts[metric]["unit"], "money")
        self.assertTrue(all(fact["scope"] == "meta_attributed" for fact in facts.values()))
        self.assertEqual(basis["sources"][1]["period"], inputs["meta"]["ads"]["period"])

    def test_provider_leads_key_and_foreign_currency_are_preserved(self):
        _, row, ga, meta, _ = self.raw[2]
        meta["ads"]["overview"].update(currency="USD", leads=4)
        facts = context.prepare(row, {}, {"ga4": ga, "meta": meta})[2]["observations"]
        self.assertEqual(next(f for f in facts if f["metric"] == "leads")["value"], 4)
        self.assertEqual(next(f for f in facts if f["metric"] == "spend")["currency"], "USD")

    def test_missing_invalid_money_and_purchase_values_are_not_fabricated(self):
        _, row, ga, meta, _ = self.raw[2]
        for invalid in (None, "", "USDX", "usd", "₪", 123):
            meta["ads"]["overview"]["currency"] = invalid
            facts = context.prepare(row, {}, {"ga4": ga, "meta": meta})[2]["observations"]
            self.assertFalse(any(f["unit"] == "money" for f in facts))
            self.assertTrue(any(f["metric"] == "website_purchases" for f in facts))
        for metric in ("website_purchases", "website_purchase_value", "cost_per_purchase", "purchase_roas"):
            meta["ads"]["overview"].pop(metric)
        facts = context.prepare(row, {}, {"ga4": ga, "meta": meta})[2]["observations"]
        self.assertEqual([f["metric"] for f in facts], ["link_clicks"])

    def test_actual_zero_purchase_count_is_preserved(self):
        _, row, ga, meta, _ = self.raw[2]
        meta["ads"]["overview"].update(website_purchases=0, website_purchase_value=0, cost_per_purchase=None)
        facts = {f["metric"]: f for f in context.prepare(row, {}, {"ga4": ga, "meta": meta})[2]["observations"]}
        self.assertEqual(facts["website_purchases"]["value"], 0)
        self.assertEqual(facts["website_purchase_value"]["value"], 0)
        self.assertNotIn("cost_per_purchase", facts)

    def test_failed_read_is_retained_without_inventing_zero_purchases(self):
        inputs = self.cases["tracking_incomplete"]
        self.assertEqual(inputs["ga4"]["report_reads"]["events"]["status"], "unavailable")
        self.assertEqual([f["metric"] for f in inputs["business"]["analysis_basis"]["observations"]], ["sessions"])

    def test_owner_and_website_inquiries_remain_separate_sources(self):
        facts = {f"{f['source']}:{f['metric']}": f["value"] for f in self.cases["designer_inquiry_fit"]["business"]["analysis_basis"]["observations"]}
        self.assertEqual(facts["service_owner:inquiries"], 20)
        self.assertEqual(facts["service_owner:suitable"], 2)
        self.assertEqual(facts["ga4:generate_lead"], 18)

    @patch("app.services.diagnostics.lite_json", return_value='{"week_summary":"", "suggestions":[]}')
    def test_citations_are_constrained_to_each_case_and_schema_is_not_mutated(self, model):
        for inputs in self.cases.values():
            diagnostics.recommend(inputs["business"], inputs["plan"], {}, inputs["ga4"], inputs["meta"])
            schema = model.call_args.args[1]
            suggestions = schema["properties"]["suggestions"]
            self.assertEqual(suggestions["maxItems"], 1)
            supplied = suggestions["items"]["properties"]["evidence_keys"]["items"]["enum"]
            self.assertEqual(set(supplied), {f"{f['source']}:{f['metric']}" for f in inputs["business"]["analysis_basis"]["observations"]})
        self.assertNotIn("enum", RECOMMENDATION_SCHEMA["properties"]["suggestions"]["items"]["properties"]["evidence_keys"]["items"])

    @patch("app.services.diagnostics.lite_json", return_value='{"week_summary":"", "suggestions":[]}')
    def test_no_observations_allows_only_empty_citations(self, model):
        diagnostics.recommend({"analysis_basis": {"observations": []}}, {}, {}, {}, {})
        evidence = model.call_args.args[1]["properties"]["suggestions"]["items"]["properties"]["evidence_keys"]
        self.assertEqual(evidence["maxItems"], 0)

    def test_outcome_references_survive_binding_and_cannot_cite_unknown_metrics(self):
        inputs = self.cases["ads_cheap_clicks"]
        keys = ["meta_ads:spend", "meta_ads:website_purchases", "meta_ads:website_purchase_value"]
        raw = {"week_summary": "בדיקה", "suggestions": [{"title": "לבדוק את ההצעה", "action": "לבדוק בעמוד", "action_kind": "website", "evidence_keys": keys + ["ga4:profit"]}]}
        bound = context.bind(raw, inputs["business"]["analysis_basis"], inputs["plan"])
        self.assertEqual(bound["suggestions"][0]["evidence_keys"], keys)
        self.assertEqual(bound["basis"]["observations"], inputs["business"]["analysis_basis"]["observations"])
