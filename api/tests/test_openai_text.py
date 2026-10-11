import _test_env  # noqa: F401

from copy import deepcopy
import json
import unittest
from unittest.mock import patch

import httpx

from app.config import Settings
from app.services import gemini, model_usage, openai_text, post_model_router, schemas_llm

SCHEMA = {"type": "object", "properties": {"answer": {"type": "string"}}, "required": ["answer"]}
CLIENT = httpx.Client


def completed(text='{"answer":"בסדר"}', **extra):
    return {"status": "completed", "output": [{"type": "message", "content": [
        {"type": "output_text", "text": text}]}], "usage": {
            "input_tokens": 1000, "input_tokens_details": {"cached_tokens": 200, "cache_write_tokens": 300},
            "output_tokens": 100, "output_tokens_details": {"reasoning_tokens": 40}}, **extra}


class GPTGatewayTest(unittest.TestCase):
    def setUp(self):
        self.settings = Settings(_env_file=None, text_provider="openai", openai_api_key="test-only-key")
        self.enterContext(patch.object(gemini, "get_settings", return_value=self.settings))
        self.enterContext(patch.object(openai_text, "get_settings", return_value=self.settings))
        self.enterContext(patch.object(post_model_router, "get_settings", return_value=self.settings))

    def transport(self, handler):
        transport = httpx.MockTransport(handler)
        self.enterContext(patch.object(openai_text.httpx, "Client", side_effect=lambda **kw:
            CLIENT(timeout=kw["timeout"], transport=transport)))

    def call(self, **kwargs):
        return gemini.generate_json(model=self.settings.gemini_lite_model, prompt="בקשה", schema=SCHEMA,
                                   thinking_level="MEDIUM", **kwargs)

    def test_fast_route_contract_vision_usage_and_no_gemini(self):
        requests, usage = [], []
        def handler(request):
            requests.append(json.loads(request.content))
            self.assertEqual(request.headers["authorization"], "Bearer test-only-key")
            return httpx.Response(200, json=completed())
        self.transport(handler)
        with patch.object(gemini, "_client", side_effect=AssertionError("Gemini must not run")), patch.object(gemini, "USAGE_HOOKS", [lambda *args: usage.append(args)]):
            result = self.call(images=[(b"picture", "image/png")], system="Exact system", attempts=1,
                               timeout_seconds=25, max_output_tokens=1700)
        self.assertEqual(json.loads(result), {"answer": "בסדר"})
        sent = requests[0]
        self.assertEqual(sent["model"], "gpt-6-luna")
        self.assertEqual(sent["reasoning"], {"effort": "low"})
        self.assertFalse(sent["store"])
        self.assertEqual(sent["service_tier"], "default")
        self.assertEqual(sent["instructions"], "Exact system")
        self.assertEqual(sent["max_output_tokens"], 1700)
        self.assertNotIn("tools", sent)
        self.assertTrue(sent["input"][0]["content"][1]["image_url"].startswith("data:image/png;base64,"))
        self.assertEqual(usage[0][0], "gpt-6-luna")
        self.assertEqual(usage[0][1]["output_tokens"], 60)
        self.assertEqual(usage[0][1]["thinking_tokens"], 40)
        self.assertAlmostEqual(model_usage.estimate_cost(*usage[0]), 0.00014)

    def test_all_deeper_slots_use_sol(self):
        for slot in (self.settings.gemini_strategy_model, self.settings.gemini_extract_model,
                     self.settings.design_dna_model, self.settings.support_ai_model):
            self.assertEqual(gemini.text_model(slot), "gpt-6.1-sol")
        seen = []
        self.transport(lambda request: (seen.append(json.loads(request.content)), httpx.Response(200, json=completed()))[1])
        gemini.strategy_json("Write", SCHEMA)
        self.assertEqual(seen[0]["model"], "gpt-6.1-sol")
        self.assertEqual(seen[0]["reasoning"], {"effort": "medium"})
        self.assertEqual(seen[0]["max_output_tokens"], 16384)

    def test_gemini_rollback_preserves_model_slots(self):
        self.settings.text_provider = "gemini"
        self.assertEqual(gemini.text_model(self.settings.gemini_lite_model), self.settings.gemini_lite_model)
        with patch.object(gemini, "_client") as google, patch.object(openai_text, "generate_json") as gpt:
            google.return_value.models.generate_content.return_value.text = '{"answer":"rollback"}'
            self.assertEqual(self.call(), '{"answer":"rollback"}')
            gpt.assert_not_called()

    def test_explicit_post_route_uses_sol_without_meta(self):
        self.settings.post_model = "openai"
        self.transport(lambda _: httpx.Response(200, json=completed()))
        with patch.object(post_model_router.meta_model, "chat_json", side_effect=AssertionError("Meta must not run")):
            self.assertEqual(json.loads(post_model_router.post_json("Write", SCHEMA)), {"answer": "בסדר"})

    def test_nullable_optionals_return_original_shape(self):
        schema = {"type": "object", "properties": {
            "facts": {"type": "array", "items": {"type": "object", "properties": {
                "quote": {"type": "string"}, "source_id": {"type": "integer"}}, "required": ["quote"]}},
            "keep_null": {"type": ["string", "null"]}}, "required": ["facts"]}
        original = deepcopy(schema)
        strict = openai_text.strict_schema(schema)
        self.assertEqual(schema, original)
        self.assertFalse(strict["additionalProperties"])
        self.assertEqual(set(strict["required"]), {"facts", "keep_null"})
        self.assertEqual(strict["properties"]["facts"]["items"]["properties"]["source_id"]["anyOf"][1], {"type": "null"})
        shaped = openai_text.original_shape({"facts": [{"quote": "", "source_id": None}], "keep_null": None}, schema)
        self.assertEqual(shaped, {"facts": [{"quote": ""}], "keep_null": None})

    def test_all_shared_schemas_can_be_closed_without_mutation(self):
        for name, schema in vars(schemas_llm).items():
            if isinstance(schema, dict) and schema.get("type") == "object":
                with self.subTest(name=name):
                    original = deepcopy(schema)
                    self.assertFalse(openai_text.strict_schema(schema)["additionalProperties"])
                    self.assertEqual(original, schema)

    def test_auth_and_billing_errors_are_sanitized_and_not_retried(self):
        for status, code in ((401, "invalid_api_key"), (429, "insufficient_quota"), (400, "invalid_json_schema")):
            with self.subTest(status=status):
                calls = []
                self.transport(lambda request: (calls.append(request), httpx.Response(status, json={"error": {
                    "code": code, "message": "secret prompt test-only-key"}}))[1])
                with self.assertRaises(openai_text.OpenAITextError) as caught:
                    self.call()
                self.assertEqual(len(calls), 1)
                self.assertNotIn("secret", str(caught.exception))
                self.assertNotIn("test-only-key", str(caught.exception))
                self.assertEqual(gemini.is_provider_unavailable(caught.exception), status in {401, 429})

    def test_transient_retries_are_bounded_and_single_attempt_is_respected(self):
        for attempts, expected in ((5, 2), (1, 1)):
            calls = []
            self.transport(lambda request: (calls.append(request), httpx.Response(503, json={"error": {}}))[1])
            with patch.object(openai_text.time, "sleep"), self.assertRaises(openai_text.OpenAITextError):
                self.call(attempts=attempts)
            self.assertEqual(len(calls), expected)

    def test_timeout_has_no_paid_retry(self):
        calls = []
        def handler(request):
            calls.append(request)
            raise httpx.ReadTimeout("private request content", request=request)
        self.transport(handler)
        with self.assertRaises(openai_text.OpenAITextError) as caught:
            self.call()
        self.assertEqual(len(calls), 1)
        self.assertNotIn("private", str(caught.exception))

    def test_incomplete_refused_and_bad_json_are_rejected_but_usage_recorded(self):
        for body in (completed(status="incomplete"), completed(output=[{"content": [{"type": "refusal"}]}]), completed("bad json")):
            usage = []
            self.transport(lambda _: httpx.Response(200, json=body))
            with patch.object(gemini, "USAGE_HOOKS", [lambda *args: usage.append(args)]), self.assertRaises(openai_text.OpenAITextError):
                self.call()
            self.assertEqual(len(usage), 1)

    def test_missing_key_and_unknown_model_fail_before_network(self):
        self.settings.openai_api_key = ""
        with patch.object(openai_text.httpx, "Client") as client, self.assertRaises(openai_text.OpenAITextError):
            self.call()
        client.assert_not_called()
        self.settings.openai_api_key = "test-only-key"
        with patch.object(openai_text.httpx, "Client") as client, self.assertRaises(ValueError):
            gemini.generate_json(model="gpt-unknown", prompt="", schema=SCHEMA, thinking_level="LOW")
        client.assert_not_called()

    def test_cache_write_cost_is_replacement_and_reasoning_counted_once(self):
        usage = openai_text.usage_numbers(completed())
        self.assertAlmostEqual(model_usage.estimate_cost("gpt-6.1-sol", usage), 0.00277)
        self.assertAlmostEqual(model_usage.estimate_cost("gpt-6-luna", usage), 0.00014)


if __name__ == "__main__":
    unittest.main()
