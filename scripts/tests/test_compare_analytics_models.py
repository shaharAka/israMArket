"""Offline checks of billing boundaries and equivalent provider contracts."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "model_comparison", Path(__file__).parents[1] / "compare-analytics-models.py")
comparison = importlib.util.module_from_spec(spec)
spec.loader.exec_module(comparison)


class ModelComparisonTest(unittest.TestCase):
    def test_sol_actual_usage_accounts_for_writes_and_reasoning_once(self):
        # Saved first response: output_tokens=554 already includes 383 reasoning tokens.
        usage = {"input_tokens": 2910, "cached_input_tokens": 0,
                 "cache_write_tokens": 2907, "billed_output_tokens": 554}
        self.assertEqual(comparison.cost("gpt-6.1-sol", usage), .0128135)

    def test_cached_input_is_not_charged_again_as_ordinary_input(self):
        usage = {"input_tokens": 1000, "cached_input_tokens": 500,
                 "cache_write_tokens": 300, "billed_output_tokens": 100}
        self.assertEqual(comparison.cost("gpt-6.1-sol", usage), .0022)

    def test_google_candidates_and_thinking_are_billed_output(self):
        usage = {"input_tokens": 3306, "cached_input_tokens": 0,
                 "cache_write_tokens": 0, "billed_output_tokens": 149 + 1452}
        self.assertEqual(comparison.cost("gemini-3.8-flash", usage), .00848325)

    def test_invalid_cache_usage_is_rejected(self):
        with self.assertRaises(ValueError):
            comparison.cost("gpt-6.1-sol", {"input_tokens": 10,
                "cached_input_tokens": 8, "cache_write_tokens": 8, "billed_output_tokens": 0})

    def test_shared_schema_preserves_enums_bounds_and_original(self):
        schema = {"type": "object", "properties": {"keys": {"type": "array", "maxItems": 3,
            "items": {"type": "string", "enum": ["ga4:purchase"]}}}, "required": ["keys"]}
        result = comparison.closed_schema(schema)
        self.assertFalse(result["additionalProperties"])
        self.assertEqual(result["properties"], schema["properties"])
        self.assertNotIn("additionalProperties", schema)

    def test_optional_properties_cannot_silently_change_benchmark(self):
        with self.assertRaises(ValueError):
            comparison.closed_schema({"type": "object", "properties": {"title": {"type": "string"}}, "required": []})


if __name__ == "__main__":
    unittest.main()
