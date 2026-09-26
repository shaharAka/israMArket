import _test_env  # noqa: F401  (must come before any `app` import)
import json
import unittest
from types import SimpleNamespace
from unittest import mock

import httpx

from app.services import meta_model, post_model_router

SCHEMA = {
    "type": "object",
    "title": "MonthlyPosts",
    "properties": {"posts": {"type": "array", "items": {"type": "object"}}},
    "required": ["posts"],
}


def _settings(**overrides):
    values = {
        "meta_model_api_key": "test-key-not-real",
        "meta_model_base_url": "https://api.meta.test/v1",
        "meta_post_model": "muse-spark-1.3",
        "post_model": "gemini",
        "post_model_fallback": True,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _reply(content: str) -> dict:
    return {"choices": [{"index": 0, "message": {"role": "assistant", "content": content}}]}


class Recorder:
    """An httpx MockTransport that serves queued responses and keeps every request."""

    def __init__(self, *responses: httpx.Response):
        self.responses = list(responses)
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if not self.responses:
            raise AssertionError("unexpected extra request")
        return self.responses.pop(0)

    def client(self) -> httpx.Client:
        return httpx.Client(transport=httpx.MockTransport(self))

    def body(self, index: int = 0) -> dict:
        return json.loads(self.requests[index].content)


class MetaModelClientTest(unittest.TestCase):
    def setUp(self):
        patches = [
            mock.patch.object(meta_model, "get_settings", return_value=_settings()),
            mock.patch.object(meta_model.time, "sleep"),
        ]
        for patcher in patches:
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_success_sends_structured_request_and_parses_reply(self):
        recorder = Recorder(httpx.Response(200, json=_reply(json.dumps({"posts": [{"title": "חלות"}]}))))
        result = meta_model.chat_json(
            "כתוב פוסטים",
            SCHEMA,
            images=[(b"\x89PNG....", "image/png"), "https://cdn.example/x.jpg"],
            web_search=True,
            system="system prompt",
            client=recorder.client(),
        )
        self.assertEqual(result, {"posts": [{"title": "חלות"}]})
        self.assertEqual(len(recorder.requests), 1)
        request = recorder.requests[0]
        self.assertEqual(str(request.url), "https://api.meta.test/v1/chat/completions")
        self.assertEqual(request.headers["authorization"], "Bearer test-key-not-real")
        body = recorder.body()
        self.assertEqual(body["model"], "muse-spark-1.3")
        self.assertEqual(body["response_format"]["type"], "json_schema")
        self.assertEqual(body["response_format"]["json_schema"]["schema"], SCHEMA)
        self.assertEqual(body["tools"], [{"type": "web_search"}])
        self.assertEqual(body["messages"][0], {"role": "system", "content": "system prompt"})
        parts = body["messages"][1]["content"]
        self.assertEqual(parts[0], {"type": "text", "text": "כתוב פוסטים"})
        self.assertTrue(parts[1]["image_url"]["url"].startswith("data:image/png;base64,"))
        self.assertEqual(parts[2]["image_url"]["url"], "https://cdn.example/x.jpg")

    def test_billing_not_configured_raises_typed_error_without_retry(self):
        error = {"error": {"code": "billing_not_configured", "message": "Add a payment method."}}
        recorder = Recorder(httpx.Response(403, json=error))
        with self.assertRaises(meta_model.BillingNotConfigured) as caught:
            meta_model.chat_json("x", SCHEMA, client=recorder.client())
        self.assertEqual(caught.exception.code, "billing_not_configured")
        self.assertIn("billing_not_configured", str(caught.exception))
        self.assertNotIn("test-key-not-real", str(caught.exception))
        self.assertEqual(len(recorder.requests), 1)

    def test_billing_error_on_a_5xx_is_not_retried_either(self):
        recorder = Recorder(httpx.Response(500, text='{"error": "billing_not_configured"}'))
        with self.assertRaises(meta_model.BillingNotConfigured):
            meta_model.chat_json("x", SCHEMA, client=recorder.client())
        self.assertEqual(len(recorder.requests), 1)

    def test_429_is_retried_once_then_succeeds(self):
        recorder = Recorder(
            httpx.Response(429, json={"error": {"code": "rate_limited", "message": "slow down"}}, headers={"retry-after": "1"}),
            httpx.Response(200, json=_reply('{"posts": []}')),
        )
        self.assertEqual(meta_model.chat_json("x", SCHEMA, client=recorder.client()), {"posts": []})
        self.assertEqual(len(recorder.requests), 2)
        meta_model.time.sleep.assert_called_once_with(1.0)

    def test_429_twice_raises_rate_limited(self):
        recorder = Recorder(httpx.Response(429, json={}), httpx.Response(429, json={}))
        with self.assertRaises(meta_model.RateLimited):
            meta_model.chat_json("x", SCHEMA, client=recorder.client())
        self.assertEqual(len(recorder.requests), 2)

    def test_5xx_is_retried_once(self):
        recorder = Recorder(httpx.Response(503, text="unavailable"), httpx.Response(200, json=_reply('{"posts": []}')))
        self.assertEqual(meta_model.chat_json("x", SCHEMA, client=recorder.client()), {"posts": []})
        self.assertEqual(len(recorder.requests), 2)

    def test_5xx_twice_raises_model_error(self):
        recorder = Recorder(httpx.Response(502, text="bad gateway"), httpx.Response(502, text="bad gateway"))
        with self.assertRaises(meta_model.ModelError):
            meta_model.chat_json("x", SCHEMA, client=recorder.client())

    def test_4xx_is_not_retried(self):
        recorder = Recorder(httpx.Response(401, json={"error": {"code": "invalid_api_key", "message": "no"}}))
        with self.assertRaises(meta_model.ModelError) as caught:
            meta_model.chat_json("x", SCHEMA, client=recorder.client())
        self.assertEqual(caught.exception.status, 401)
        self.assertEqual(len(recorder.requests), 1)

    def test_json_parse_fallback_handles_fences_and_prose(self):
        content = 'הנה התשובה:\n```json\n{"posts": [{"title": "סוכות"}]}\n```\nבהצלחה!'
        recorder = Recorder(httpx.Response(200, json=_reply(content)))
        self.assertEqual(
            meta_model.chat_json("x", SCHEMA, client=recorder.client()),
            {"posts": [{"title": "סוכות"}]},
        )

    def test_unparseable_reply_raises_model_error(self):
        recorder = Recorder(httpx.Response(200, json=_reply("sorry, I can't")))
        with self.assertRaises(meta_model.ModelError):
            meta_model.chat_json("x", SCHEMA, client=recorder.client())

    def test_unsupported_response_format_falls_back_to_prompted_schema(self):
        recorder = Recorder(
            httpx.Response(400, json={"error": {"code": "invalid_request", "message": "response_format json_schema is not supported"}}),
            httpx.Response(200, json=_reply('{"posts": [{"title": "א"}]}')),
        )
        result = meta_model.chat_json("כתוב", SCHEMA, client=recorder.client())
        self.assertEqual(result, {"posts": [{"title": "א"}]})
        self.assertIn("response_format", recorder.body(0))
        retry = recorder.body(1)
        self.assertNotIn("response_format", retry)
        self.assertIn('"MonthlyPosts"', retry["messages"][-1]["content"])

    def test_contributor_models_are_refused_before_any_request(self):
        recorder = Recorder()
        for name in ("muse-spark-1.3-contributor", "Muse-Spark-1.2-CONTRIBUTOR"):
            with self.assertRaises(meta_model.ContributorModelRefused):
                meta_model.chat_json("x", SCHEMA, model=name, client=recorder.client())
        self.assertEqual(recorder.requests, [])

    def test_missing_key_raises_before_any_request(self):
        recorder = Recorder()
        with mock.patch.object(meta_model, "get_settings", return_value=_settings(meta_model_api_key="")):
            with self.assertRaises(meta_model.MissingApiKey):
                meta_model.chat_json("x", SCHEMA, client=recorder.client())
        self.assertEqual(recorder.requests, [])

    def test_transport_error_is_retried_once(self):
        calls = []

        def handler(request):
            calls.append(request)
            if len(calls) == 1:
                raise httpx.ReadTimeout("timed out", request=request)
            return httpx.Response(200, json=_reply('{"posts": []}'))

        client = httpx.Client(transport=httpx.MockTransport(handler))
        self.assertEqual(meta_model.chat_json("x", SCHEMA, client=client), {"posts": []})
        self.assertEqual(len(calls), 2)


class PostModelRouterTest(unittest.TestCase):
    def test_gemini_is_the_default_and_passes_straight_through(self):
        with (
            mock.patch.object(post_model_router, "get_settings", return_value=_settings()),
            mock.patch.object(post_model_router.gemini, "strategy_json", return_value='{"posts": []}') as gemini_call,
            mock.patch.object(post_model_router.meta_model, "chat_json") as meta_call,
        ):
            self.assertEqual(post_model_router.post_json("p", SCHEMA), '{"posts": []}')
        gemini_call.assert_called_once_with("p", SCHEMA)
        meta_call.assert_not_called()

    def test_muse_spark_alias_uses_configured_model_and_returns_a_json_string(self):
        with (
            mock.patch.object(post_model_router, "get_settings", return_value=_settings(meta_post_model="muse-spark-1.2")),
            mock.patch.object(post_model_router.meta_model, "chat_json", return_value={"posts": [{"title": "ש"}]}) as meta_call,
        ):
            raw = post_model_router.write_posts_with("muse-spark", "p", SCHEMA)
        self.assertEqual(json.loads(raw), {"posts": [{"title": "ש"}]})
        self.assertEqual(meta_call.call_args.kwargs["model"], "muse-spark-1.2")
        self.assertEqual(meta_call.call_args.kwargs["system"], post_model_router.gemini.SYSTEM_HE)

    def test_post_json_falls_back_to_gemini_when_muse_fails(self):
        with (
            mock.patch.object(post_model_router, "get_settings", return_value=_settings(post_model="muse-spark")),
            mock.patch.object(
                post_model_router.meta_model,
                "chat_json",
                side_effect=meta_model.BillingNotConfigured("no billing", code="billing_not_configured"),
            ),
            mock.patch.object(post_model_router.gemini, "strategy_json", return_value='{"posts": []}') as gemini_call,
            self.assertLogs(post_model_router.log, level="WARNING"),
        ):
            self.assertEqual(post_model_router.post_json("p", SCHEMA), '{"posts": []}')
        gemini_call.assert_called_once()

    def test_post_json_raises_when_fallback_is_off(self):
        with (
            mock.patch.object(
                post_model_router, "get_settings", return_value=_settings(post_model="muse-spark", post_model_fallback=False)
            ),
            mock.patch.object(post_model_router.meta_model, "chat_json", side_effect=meta_model.RateLimited("429")),
            mock.patch.object(post_model_router.gemini, "strategy_json") as gemini_call,
        ):
            with self.assertRaises(meta_model.RateLimited):
                post_model_router.post_json("p", SCHEMA)
        gemini_call.assert_not_called()

    def test_contributor_model_in_config_is_never_swallowed_by_the_fallback(self):
        with (
            mock.patch.object(
                post_model_router,
                "get_settings",
                return_value=_settings(post_model="muse-spark", meta_post_model="muse-spark-1.3-contributor"),
            ),
            mock.patch.object(meta_model, "get_settings", return_value=_settings()),
            mock.patch.object(post_model_router.gemini, "strategy_json") as gemini_call,
        ):
            with self.assertRaises(meta_model.ContributorModelRefused):
                post_model_router.post_json("p", SCHEMA)
        gemini_call.assert_not_called()

    def test_unknown_model_name_is_rejected(self):
        with self.assertRaises(ValueError):
            post_model_router.write_posts_with("gpt-9", "p", SCHEMA)


if __name__ == "__main__":
    unittest.main()
