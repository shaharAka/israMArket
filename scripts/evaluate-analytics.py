"""Opt-in real Gemini checks on fictional data. Never writes a customer database.

Run with the API test runtime:
  python scripts/evaluate-analytics.py --live --env-file /private/file --output /tmp/results.json
Eight text requests maximum, one attempt each. No ads, images, video or account writes.
Results require semantic review; successful JSON is not evidence of useful advice.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from unittest.mock import patch


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Explicitly allow up to eight billable text requests")
    parser.add_argument("--env-file", type=Path, help="Private Gemini environment file; defaults to environment variables")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not args.live:
        parser.error("No requests made: --live is required")
    if args.output.exists():
        parser.error("Choose a new output file to preserve the earlier evaluation")
    root = Path(__file__).resolve().parents[1]
    sys.path[:0] = [str(root / "api"), str(root / "api/tests")]
    # Read the key before the test environment deliberately replaces app settings.
    from dotenv import dotenv_values
    private = dotenv_values(args.env_file) if args.env_file else os.environ.copy()
    key = private.get("GEMINI_API_KEY") or ""
    model = private.get("GEMINI_LITE_MODEL") or "gemini-3.5-flash-lite"
    if not key:
        parser.error("No configured Gemini key; no requests made")
    import _test_env  # noqa: F401 — isolate storage/background jobs before importing the app
    from _decision_scenarios import prepared_case, scenarios
    from app.services import diagnostics, recommendation_context
    from app.services.gemini import SYSTEM_HE
    from google import genai
    from google.genai import types
    revision = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, check=True).stdout.strip()
    dirty = bool(subprocess.run(["git", "status", "--porcelain"], cwd=root, capture_output=True, text=True, check=True).stdout.strip())
    results = {"revision": revision, "working_tree_modified": dirty, "synthetic": True,
               "model": model, "calls_limit": 8, "paid_retries": 0, "calls_made": 0, "cases": [], "usage": []}
    client = genai.Client(api_key=key, http_options=types.HttpOptions(
        timeout=40000, retry_options=types.HttpRetryOptions(attempts=1)))

    def gateway(prompt, schema, images=None, thinking_level="LOW", **kwargs):
        if results["calls_made"] >= 8 or images:
            raise RuntimeError("Evaluation request limit reached")
        results["calls_made"] += 1
        started = time.monotonic()
        response = client.models.generate_content(model=model, contents=prompt,
            config=types.GenerateContentConfig(system_instruction=SYSTEM_HE,
                response_mime_type="application/json", response_json_schema=schema,
                thinking_config=types.ThinkingConfig(thinking_level=thinking_level), max_output_tokens=4096))
        usage = response.usage_metadata
        results["usage"].append({"call": results["calls_made"], "seconds": round(time.monotonic() - started, 2),
            "input_tokens": getattr(usage, "prompt_token_count", 0),
            "output_tokens": getattr(usage, "candidates_token_count", 0),
            "thinking_tokens": getattr(usage, "thoughts_token_count", 0)})
        if not response.text:
            raise RuntimeError("Empty model response")
        json.loads(response.text)
        return response.text

    try:
        with patch.object(diagnostics, "lite_json", side_effect=gateway):
            for index, case in enumerate(scenarios()):
                item = prepared_case(index, case)
                inputs = item["inputs"]
                business, ga, meta, plan = (inputs[key] for key in ("business", "ga4", "meta", "plan"))
                try:
                    item["diagnosis"] = diagnostics.diagnose(business, ga, meta)
                    item["proposal"] = diagnostics.recommend(business, recommendation_context.for_model(plan), item["diagnosis"], ga, meta)
                    item["bound"] = recommendation_context.bind(item["proposal"], business["analysis_basis"], plan)
                    item["execution"] = "completed"
                except Exception as exc:
                    # Never print provider exceptions, which may contain request credentials.
                    item.update(execution="failed", error_type=type(exc).__name__, status_code=getattr(exc, "code", None))
                results["cases"].append(item)
                args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2))
                print(json.dumps({"case": item["case"], "execution": item["execution"],
                    "calls_made": results["calls_made"]}), flush=True)
                if item["execution"] == "failed":
                    return 1
    finally:
        client.close()
    print(f"Saved fictional responses for semantic review: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
