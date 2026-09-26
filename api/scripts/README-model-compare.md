# Gemini vs Muse Spark — how to run the comparison

Stream H experiment. Nothing changes for users: posts are written by Gemini unless
`POST_MODEL=muse-spark` is set.

## Prerequisites

- `META_MODEL_API_KEY` in the root `.env` (already there).
- **Billing on the Meta developer account.** Until a payment method is added every call
  fails with `billing_not_configured` (HTTP 402). The scripts stop with a clear
  Hebrew/English message and exit code 2, before any Gemini spend.
- Only `muse-spark-1.x` models. `-contributor` models are refused in code: their inputs
  are used to improve Meta's products, and we send business data.

## 1. Post writing, blind A/B

```sh
cd api
.venv/bin/python scripts/compare_post_models.py --business-id 1
```

- Reads a **copy** of `api/data/isramarket.db` (sqlite backup API, source opened read-only;
  the copy is deleted when the run ends — `--keep-db-copy` to keep it). `--db PATH` for another DB.
- Uses the business's latest saved month plan (`--year/--month` to pick one) and runs the
  app's own `strategy._write_posts_for_weeks` for weeks 1–2 and 3–4, once per model. The
  prompt is the app's prompt, not a copy of it.
- Output in `.runtime/model-compare/<timestamp>/`:
  - `report.html` — two columns, A and B, posts shuffled, no model names. Rate each post,
    pick a side, press "copy" to get your ratings as JSON. The automatic checks (clichés,
    repeated/template openers, hook length, format variety, specific business facts,
    numbers that are not in the source material) are folded away until after you rate.
  - `key.json` — which side is which, timings, errors, the exact prompts and raw posts.
    Open it only after rating.

Useful flags: `--dry-run` (print the prompt, call nothing), `--muse-model muse-spark-1.2`,
`--gemini-source stored` (use the Gemini posts already saved for that month instead of
paying for a new Gemini run), `--weeks "1,2"`, `--seed N`.

For the plan's "owner-blind comparison of 10 posts": one run gives ~8 posts per side; send
the owner `report.html` only.

## 2. Visual analysis probe (images / reels)

```sh
cd api
.venv/bin/python scripts/probe_visual_analysis.py URL_OR_FILE [URL_OR_FILE ...] --context "competitor, bakery"
```

Same media bytes to both models, fixed question (first-frame hook, framing, text-overlay
position, colours, lighting, pacing, one reusable pattern). Output:
`.runtime/model-compare/visual-<timestamp>/report.html` + `results.json`. Videos go to
Gemini as-is; Muse gets 3 frames if `ffmpeg` is installed (Meta's video input format is not
verified yet). No business data is sent.

## 3. Switching the app over (later)

`app/services/post_model_router.py` has `post_json(prompt, schema)`, a drop-in for
`gemini.strategy_json` that follows `POST_MODEL` and falls back to Gemini when Muse fails
(`POST_MODEL_FALLBACK=false` to surface errors instead). In `strategy._write_posts_for_weeks`:

```python
posts = loads(post_json(prompt, MONTHLY_POSTS_SCHEMA), {})   # was strategy_json(...)
```

Settings: `POST_MODEL` (`gemini` | `muse-spark` | a pinned `muse-spark-1.x`),
`META_POST_MODEL` (default `muse-spark-1.3`), `META_MODEL_BASE_URL`, `POST_MODEL_FALLBACK`.

## Tests

```sh
cd api
.venv/bin/python -m unittest tests.test_meta_model tests.test_model_compare -v
```
