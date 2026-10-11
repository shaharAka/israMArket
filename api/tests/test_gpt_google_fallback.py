import _test_env  # noqa: F401

import json
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from app.config import Settings
from app.services import gemini, openai_text, post_model_router

SCHEMA = {"type": "object", "properties": {"answer": {"type": "string"}}, "required": ["answer"]}


class GoogleFallbackTest(unittest.TestCase):
    def setUp(self):
        self.settings = Settings(_env_file=None, text_provider="openai", text_fallback_provider="gemini",
                                 post_model="openai", openai_api_key="test-only", gemini_api_key="test-only")
        self.enterContext(patch.object(gemini, "get_settings", return_value=self.settings))
        self.enterContext(patch.object(post_model_router, "get_settings", return_value=self.settings))
        self.google = Mock()
        self.google.models.generate_content.return_value = SimpleNamespace(
            text='{"answer":"Google"}', usage_metadata=SimpleNamespace(
                prompt_token_count=100, candidates_token_count=20, thoughts_token_count=10))
        self.client = self.enterContext(patch.object(gemini.genai, "Client", return_value=self.google))

    def call(self, **kwargs):
        return gemini.generate_json(model=self.settings.gemini_lite_model, prompt="בקשה", schema=SCHEMA,
                                    thinking_level="MEDIUM", **kwargs)

    def test_success_stays_gpt_without_google(self):
        with patch.object(openai_text, "generate_json", return_value='{"answer":"GPT"}'):
            self.assertEqual(json.loads(self.call())["answer"], "GPT")
        self.client.assert_not_called()

    def test_fallback_preserves_task_and_reports_actual_google_usage(self):
        usage = []
        failure = openai_text.OpenAITextError("Unavailable", fallback_eligible=True)
        with patch.object(openai_text, "generate_json", side_effect=failure) as gpt, \
                patch.object(gemini.time, "monotonic", side_effect=[100, 117]), \
                patch.object(gemini, "USAGE_HOOKS", [lambda *args: usage.append(args)]):
            result = self.call(images=[(b"picture", "image/png")], system="Write in Arabic", attempts=1,
                               timeout_seconds=25, max_output_tokens=1700)
        self.assertEqual(json.loads(result)["answer"], "Google")
        self.assertEqual(result.provider_model, "gemini-3.5-flash-lite")
        self.assertEqual(gpt.call_args.kwargs["timeout_seconds"], 16.25)
        self.assertEqual(gpt.call_args.kwargs["attempts"], 1)
        options = self.client.call_args.kwargs["http_options"]
        self.assertEqual(options.timeout, 8000)
        self.assertEqual(options.retry_options.attempts, 1)
        sent = self.google.models.generate_content.call_args.kwargs
        self.assertEqual(sent["model"], "gemini-3.5-flash-lite")
        self.assertEqual(sent["config"].response_json_schema, SCHEMA)
        self.assertEqual(sent["config"].system_instruction, "Write in Arabic")
        self.assertEqual(sent["config"].max_output_tokens, 1700)
        self.assertEqual(sent["config"].thinking_config.thinking_level, "MEDIUM")
        self.assertEqual(sent["contents"][0].text, "בקשה")
        self.assertEqual(sent["contents"][1].inline_data.data, b"picture")
        self.assertEqual(usage, [("gemini-3.5-flash-lite", {"prompt_tokens": 100, "output_tokens": 20, "thinking_tokens": 10})])

    def test_explicit_sol_posts_use_original_google_strategy_without_meta(self):
        with patch.object(openai_text, "generate_json", side_effect=openai_text.OpenAITextError("Down", fallback_eligible=True)), \
                patch.object(post_model_router.meta_model, "chat_json", side_effect=AssertionError("No Meta")):
            self.assertEqual(json.loads(post_model_router.post_json("Write", SCHEMA))["answer"], "Google")
        sent = self.google.models.generate_content.call_args.kwargs
        self.assertEqual(sent["model"], "gemini-3.8-flash")
        self.assertEqual(sent["config"].max_output_tokens, 16384)

    def test_deeper_named_slot_keeps_its_rollback_model(self):
        self.settings.design_dna_model = "gemini-3.8-flash"
        with patch.object(openai_text, "generate_json", side_effect=openai_text.OpenAITextError("Down", fallback_eligible=True)):
            gemini.generate_json(model=self.settings.design_dna_model, prompt="Read", schema=SCHEMA, thinking_level="LOW")
        self.assertEqual(self.google.models.generate_content.call_args.kwargs["model"], self.settings.design_dna_model)

    def test_disabled_or_missing_google_key_does_not_switch(self):
        for key, value in (("text_fallback_provider", "none"), ("gemini_api_key", "")):
            with self.subTest(key=key):
                old = getattr(self.settings, key)
                setattr(self.settings, key, value)
                with patch.object(openai_text, "generate_json", side_effect=openai_text.OpenAITextError("Down", fallback_eligible=True)), \
                        self.assertRaises(openai_text.OpenAITextError):
                    self.call()
                setattr(self.settings, key, old)
        self.client.assert_not_called()

    def test_refusal_invalid_output_and_programming_errors_never_switch(self):
        for failure in (openai_text.OpenAITextError("Refused"), openai_text.OpenAITextError("Incomplete"),
                        openai_text.OpenAITextError("Invalid JSON"), ValueError("Invalid model")):
            with self.subTest(failure=str(failure)), patch.object(openai_text, "generate_json", side_effect=failure), \
                    self.assertRaises(type(failure)):
                self.call()
        self.client.assert_not_called()

    def test_exhausted_request_budget_does_not_start_google(self):
        with patch.object(openai_text, "generate_json", side_effect=openai_text.OpenAITextError("Timeout", fallback_eligible=True)), \
                patch.object(gemini.time, "monotonic", side_effect=[100, 125]), self.assertRaises(openai_text.OpenAITextError):
            self.call(timeout_seconds=25)
        self.client.assert_not_called()

    def test_google_failure_does_not_retry_or_loop_back_to_gpt(self):
        self.google.models.generate_content.side_effect = RuntimeError("503 unavailable")
        with patch.object(openai_text, "generate_json", side_effect=openai_text.OpenAITextError("Down", fallback_eligible=True)) as gpt, \
                patch.object(gemini.time, "sleep") as sleep, self.assertRaises(RuntimeError):
            self.call()
        self.assertEqual(gpt.call_count, 1)
        self.assertEqual(self.google.models.generate_content.call_count, 1)
        sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
