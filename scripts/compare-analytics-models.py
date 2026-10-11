"""Bounded, opt-in text comparison on saved fictional analytics inputs.

Uses production diagnosis/recommendation prompts; no customer storage, tools or writes.
Run once per provider with the same fixture file. Eight requests maximum, no retries.
Private keys are read from --env-file outside the repository and never written to results.
"""
import argparse
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from unittest.mock import patch


RATES = {  # Standard USD/million tokens, checked 2026-10-11; not invoice totals.
    "gemini-3.8-flash": {"input": .75, "cached": .075, "cache_write": 0., "output": 3.75},
    "gpt-6.1-sol": {"input": 2., "cached": .10, "cache_write": 2.50, "output": 10.},
}


def closed_schema(schema):
    """Both providers receive identical closed schemas, with all fields required."""
    result = deepcopy(schema)
    if result.get("type") == "object":
        properties = result.get("properties", {})
        if set(result.get("required", [])) != set(properties):
            raise ValueError("Benchmark must not change optional field semantics")
        result["additionalProperties"] = False
        result["properties"] = {key: closed_schema(value) for key, value in properties.items()}
    if isinstance(result.get("items"), dict):
        result["items"] = closed_schema(result["items"])
    return result


def cost(model, usage):
    rate = RATES[model]
    writes = usage.get("cache_write_tokens", 0)
    ordinary = usage["input_tokens"] - usage["cached_input_tokens"] - writes
    if ordinary < 0:
        raise ValueError("Cache token counts exceed input usage")
    return round((ordinary * rate["input"]
                  + usage["cached_input_tokens"] * rate["cached"]
                  + writes * rate["cache_write"]
                  + usage["billed_output_tokens"] * rate["output"]) / 1_000_000, 8)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--provider", choices=("google", "openai"), required=True)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--fixtures", type=Path, required=True,
                        help="Saved synthetic evaluation containing exactly four cases")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not args.live or args.output.exists():
        parser.error("--live and a new output path are required; no requests made")
    fixture_bytes = args.fixtures.read_bytes()
    fixtures = json.loads(fixture_bytes)
    if fixtures.get("synthetic") is not True or len(fixtures.get("cases", [])) != 4:
        parser.error("Only the four saved fictional cases are accepted")
    root = Path(__file__).resolve().parents[1]
    sys.path[:0] = [str(root / "api"), str(root / "api/tests")]
    from dotenv import dotenv_values
    private = dotenv_values(args.env_file)
    key = private.get("GEMINI_API_KEY" if args.provider == "google" else "OPENAI_API_KEY")
    if not key:
        parser.error("No configured provider key; no requests made")
    import _test_env  # noqa: F401 — isolate settings, database and jobs
    from app.services import diagnostics, recommendation_context
    from app.services.gemini import SYSTEM_HE
    import httpx
    from google import genai
    from google.genai import types
    model = "gemini-3.8-flash" if args.provider == "google" else "gpt-6.1-sol"
    results = {"synthetic": True, "model": model, "provider": args.provider,
               "revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(),
               "fixture_sha256": hashlib.sha256(fixture_bytes).hexdigest(),
               "method": "production two-stage pipeline; each model's own diagnosis informs its recommendation",
               "thinking": "MEDIUM; provider labels do not imply equal compute",
               "output_token_cap": 4096, "timeout_seconds": 60,
               "calls_limit": 8, "paid_retries": 0, "calls_made": 0,
               "standard_rates_usd_per_million": RATES[model],
               "price_date": "2026-10-11", "cases": [], "usage": []}
    google = genai.Client(api_key=key, http_options=types.HttpOptions(
        timeout=60000, retry_options=types.HttpRetryOptions(attempts=1))) if args.provider == "google" else None
    http = httpx.Client(timeout=60, transport=httpx.HTTPTransport(retries=0))
    active = {}

    def save():
        args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2))
        os.chmod(args.output, 0o600)

    def gateway(prompt, schema, images=None, thinking_level="MEDIUM", **kwargs):
        if results["calls_made"] >= 8 or images or thinking_level != "MEDIUM":
            raise ValueError("Evaluation contract rejected")
        schema = closed_schema(schema)
        results["calls_made"] += 1
        call = {"call": results["calls_made"], "case": active["case"],
                "prompt": prompt, "system": SYSTEM_HE, "schema": schema}
        active.setdefault("requests", []).append(call)
        started = time.monotonic()
        try:
            if google:
                response = google.models.generate_content(model=model, contents=prompt,
                    config=types.GenerateContentConfig(system_instruction=SYSTEM_HE,
                        response_mime_type="application/json", response_json_schema=schema,
                        thinking_config=types.ThinkingConfig(thinking_level="MEDIUM"), max_output_tokens=4096))
                raw = response.usage_metadata.model_dump(mode="json", exclude_none=True)
                usage = {"input_tokens": raw.get("prompt_token_count", 0),
                         "cached_input_tokens": raw.get("cached_content_token_count", 0),
                         "cache_write_tokens": 0,
                         "visible_output_tokens": raw.get("candidates_token_count", 0),
                         "thinking_tokens": raw.get("thoughts_token_count", 0)}
                usage["billed_output_tokens"] = usage["visible_output_tokens"] + usage["thinking_tokens"]
                output = response.text or ""
                call["finish_reason"] = str(response.candidates[0].finish_reason) if response.candidates else None
            else:
                response = http.post("https://api.openai.com/v1/responses",
                    headers={"Authorization": "Bearer " + key}, json={
                        "model": model, "instructions": SYSTEM_HE, "input": prompt,
                        "reasoning": {"effort": "medium"}, "max_output_tokens": 4096,
                        "store": False, "service_tier": "default",
                        "text": {"format": {"type": "json_schema", "name": "marketing_analysis",
                                             "strict": True, "schema": schema}}})
                response.raise_for_status()
                body = response.json()
                raw = body.get("usage") or {}
                thinking = raw.get("output_tokens_details", {}).get("reasoning_tokens", 0)
                usage = {"input_tokens": raw.get("input_tokens", 0),
                         "cached_input_tokens": raw.get("input_tokens_details", {}).get("cached_tokens", 0),
                         "cache_write_tokens": raw.get("input_tokens_details", {}).get("cache_write_tokens", 0),
                         "visible_output_tokens": raw.get("output_tokens", 0) - thinking,
                         "thinking_tokens": thinking, "billed_output_tokens": raw.get("output_tokens", 0)}
                call["response_status"] = body.get("status")
                call["incomplete_details"] = body.get("incomplete_details")
                output = "".join(block.get("text", "") for item in body.get("output", [])
                                 if item.get("type") == "message" for block in item.get("content", [])
                                 if block.get("type") == "output_text")
            call["raw_output"] = output
            usage.update(call=call["call"], case=active["case"], seconds=round(time.monotonic() - started, 3),
                         raw_usage=raw)
            usage["estimated_cost_usd"] = cost(model, usage)
            results["usage"].append(usage)
            if not output or (not google and call["response_status"] != "completed"):
                raise ValueError("Empty or incomplete model response")
            json.loads(output)
            call["execution"] = "completed"
            return output
        except Exception as exc:
            # Provider messages/headers can contain credentials: record only type/status.
            status = getattr(getattr(exc, "response", None), "status_code", getattr(exc, "code", None))
            call.update(execution="failed", error_type=type(exc).__name__,
                        status_code=status if isinstance(status, int) else None,
                        seconds=round(time.monotonic() - started, 3))
            raise
        finally:
            save()

    try:
        with patch.object(diagnostics, "lite_json", side_effect=gateway):
            for fixture in fixtures["cases"]:
                active = deepcopy({key: fixture[key] for key in ("case", "expected", "inputs")})
                results["cases"].append(active)
                business, ga, meta, plan = (active["inputs"][key] for key in ("business", "ga4", "meta", "plan"))
                try:
                    active["diagnosis"] = diagnostics.diagnose(business, ga, meta)
                    active["proposal"] = diagnostics.recommend(business, recommendation_context.for_model(plan), active["diagnosis"], ga, meta)
                    active["bound"] = recommendation_context.bind(active["proposal"], business["analysis_basis"], plan)
                    active["execution"] = "completed"
                except Exception as exc:
                    active.update(execution="failed", error_type=type(exc).__name__)
                    save()
                    print(json.dumps({"model": model, "case": active["case"], "execution": "failed"}), flush=True)
                    return 1  # No fallback, retry, or further spending after failure.
                save()
                print(json.dumps({"model": model, "case": active["case"], "execution": "completed"}), flush=True)
    finally:
        http.close()
        if google:
            google.close()
    print(json.dumps({"model": model, "calls": results["calls_made"],
                      "estimated_cost_usd": round(sum(x["estimated_cost_usd"] for x in results["usage"]), 6)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
