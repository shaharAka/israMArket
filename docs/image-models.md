# Image models for the post designer: cost and quality (2026-10-01)

Research only, nothing in the product changed. Harness: `api/scripts/image_bench.py`.
Sheet: `comparison.png` / `index.html` in the run folder (see "Re-running" below).
Spend for the whole run: **$4.40 for 68 images** (Gemini + Muse). OpenAI did not run: no
`OPENAI_API_KEY` in `.env` when this was written (checked at the start and again at the end).

## TL;DR

- **The model is not why posts look generic.** Given one brief, five models drew nearly the
  same picture (bakery A: three loaves on a peel in front of a glowing arched oven, in all five).
  Given two different briefs, every model drew two clearly different brands. What makes a post
  look like a template is a shared, generic art direction. A model switch will not fix that.
- **Re-rolling adds no variety.** Second samples from Nano Banana Pro and Muse were near-copies
  of the first ones. Variety across a month has to be written into each post's brief.
- **Editing a real photo is the strongest tool against AI slop**, and every current model keeps
  the product (bra lace, mat colours, desk layout). The challah test separates them:
  Muse ≈ Nano Banana 2 > Pro > Lite >> 2.5.
- **Recommendation:**
  - Generate with **Nano Banana 2** (`gemini-3.1-flash-image`, 1K, 4:5): **$0.068/image**, about 10 s.
    Pro costs $0.140 and was not better in this test.
  - Edit real photos with **Muse Image 1.0** at **$0.01/image**. Fall back to Nano Banana 2 when it
    refuses or errors.
  - Drafts: **Nano Banana 2 Lite** ($0.034, 3–5 s) when the owner is waiting on screen; **Muse**
    ($0.01) for background bulk drafts. Retire `gemini-2.5-flash-image`.
- **Policy:** Muse refused to generate the lingerie post 2/2 (`content_policy_violation`).
  `muse-image-1.0` rejects the `moderation` parameter, so there is no setting to change. It did
  accept editing the real bra photo, 2/2. Gemini refused nothing.

## 1. Prices (official pages only, checked 2026-10-01)

Sources:
- Google: <https://ai.google.dev/gemini-api/docs/pricing> (page says "Last updated 2026-10-01 UTC"),
  sizes and limits from <https://ai.google.dev/gemini-api/docs/image-generation>.
- OpenAI: <https://developers.openai.com/api/docs/pricing> (platform.openai.com/docs/pricing
  redirects here). Per-image figures come from the official token calculator in
  <https://developers.openai.com/api/docs/guides/image-generation#calculating-costs>.
  Its formula is reproduced in the script's `estimate()`.
- Meta: <https://dev.meta.ai/docs/pricing-rate-limits>, <https://dev.meta.ai/docs/image-generation>,
  <https://dev.meta.ai/docs/api-reference/images/create-image>, `.../edit-image`.

Paid tier, standard (not batch), USD.

| Model (id) | Output, 4:5 as we'd use it | Output, 1:1 | Reference / edit input image | Batch | Notes |
|---|---|---|---|---|---|
| Nano Banana Pro (`gemini-3-pro-image`) | $0.134 at 1K or 2K (1120 tokens × $120/1M). We use 2K = 1856×2304. $0.24 at 4K | same: 1K/2K $0.134, 4K $0.24 | $2.00/1M input tokens. Page: "560 tokens or $0.0011 per image". **Measured: 258 tokens ($0.0005)** per reference | $0.067 (1K/2K) | Thinking is billed at $12/1M. Measured 150–280 tokens/call (~$0.003) → **$0.140 measured** |
| Nano Banana 2 (`gemini-3.1-flash-image`) | 0.5K $0.045 · **1K $0.067** (928×1152) · 2K $0.101 · 4K $0.151 ($60/1M; 1120 / 1680 / 2520 tokens) | same tiers | $0.50/1M. Per-image count not published. **Measured 258 tokens ($0.0001)** | $0.022 / $0.034 / $0.050 / $0.076 | **$0.068 measured** at 1K |
| Nano Banana 2 Lite (`gemini-3.1-flash-lite-image`) | **1K only: $0.0336** (928×1152; 1120 × $30/1M) | same | $0.25/1M. Not published. **Measured 1120 tokens ($0.0003)** | $0.0168 | **$0.034 measured** |
| Nano Banana (`gemini-2.5-flash-image`) | $0.039/image (1290 tokens, ≤1024 px; 896×1152 at 4:5) | same | $0.30/1M. **Measured 258 tokens** | $0.0195 | Google marks it deprecated |
| GPT Image 2.5 Flare / Sunburst (`gpt-image-2.5-flare`, `gpt-image-2.5-sunburst`, snapshot 2026-09-08). These are current: the guide names them for new work, Flare for "everyday generation", Sunburst for "editing precision" | 1088×1360 (nearest to 1080×1350 in multiples of 16): low $0.0054 · medium $0.0119 · **high $0.0476** · xhigh $0.0852 · max $0.1929 | 1024²: $0.0059 · $0.0132 · $0.0527 · $0.0937 · $0.2107 | Image input **$8/1M** tokens, text $5/1M. The per-image input token count for 2.5 is **not published**, so it gets measured from `usage` when the column runs | 50% off: image out $15/1M | Cached input applies only to the Responses API tool, not `/v1/images/edits`. OpenAI says GPT Image may need API Organization Verification |
| GPT Image 2 (`gpt-image-2`, previous) | 1024×1536: $0.005 / $0.041 / $0.165 (low/med/high) | 1024²: $0.006 / $0.053 / $0.211 | $8/1M. Always high input fidelity, so edit inputs cost more | 50% | Listed for reference only |
| Muse Image 1.0 (`muse-image-1.0`) | **$0.01 flat per generated image** (4:5 returned 1408×1760) | $0.01 | Pricing is per generated image, and the page lists no input-image charge. "Failed or safety-filtered images aren't counted toward billing" | not listed | Reasoning and web/image search are included. 150 requests/min. `size` "sets the aspect ratio, not the exact pixel size" |

Not published (not guessed): per-image input tokens for Gemini 3.1 Flash / Flash Lite / 2.5
(measured instead), for GPT Image 2.5 (to be measured), and any batch price for Muse.

## 2. What was run

**Same briefs for every model.** There were 5 businesses and 2 tasks, and each brief was written
for that business. The only shared text is one line of hard rules: 4:5 full-bleed, no text,
letters, numbers, logos or signage in any language. The full prompts are in `BUSINESSES` in the
script, and `--dry-run` prints them.

| Business | Brand DNA in the brief | Generate | Edit a real photo (reference) |
|---|---|---|---|
| Bakery A, "Tanur Even", Rosh Pina | warm rustic, earthy: embers, scorched peel, olive wood, burlap | spelt loaves at a stone oven | `challah_pan.jpg` (below) on olive wood and Galilee stone, oven light |
| Bakery B, "Anan", Modi'in | modern minimal, bright pastel: pistachio/blush/butter, hard midday shadow | one cruffin, design-magazine still life | **the same challah** on a pistachio platter, pastel counter |
| Lingerie, Tazizi (tazizi.co.il) | frank, warm boutique; product only, no body | bra on a hanger before a black velvet curtain | Tazizi's own catalogue photo of a powder-blue lace bra, laid on linen |
| Yoga, "Mirpeset", Haifa | Bauhaus flat on the Carmel, dawn, cork and wool, no spa clichés | empty studio before class | four rolled cotton mats in a basket by a steel window |
| Accountant, "Michal Levi CPA" | a service: calm, exact, human; no laptop/suit/charts | desk at day's end, binder, tea, blinds | a real home-office desk, relit; same objects, same layout |

Reference photos:
- `challah_pan.jpg`: Wikimedia Commons, "Challah bread on a pan.jpg" by Eden Aviv,
  **CC0** (<https://commons.wikimedia.org/wiki/File:Challah_bread_on_a_pan.jpg>).
- `tazizi_bra_lace.jpg`: product photo from the owner's site,
  `static.wixstatic.com/media/4f0f37_36d7dac360ee47aa85a8f801da012308~mv2.jpg`, from
  <https://www.tazizi.co.il/brassieres>. Product only, white background.
- `yoga_mats.jpg`: Commons, "Yoga mats.png" by Sha89sha, **CC0**
  (<https://commons.wikimedia.org/wiki/File:Yoga_mats.png>).
- `home_office.jpg`: Commons, "Home-office-336377.jpg", Free-Photos via Pixabay, **CC0**
  (<https://commons.wikimedia.org/wiki/File:Home-office-336377.jpg>).
- `web/public/examples/*.webp` were not used: they are generated images, not real photos.

Settings:
- Gemini runs through `generate_content` with `response_modalities=["IMAGE"]`, `aspect_ratio="4:5"`
  and `thinking_level=MINIMAL` on 3.x, as `app/services/gemini.py` does. Pro ran at 2K (the
  production setting), Flash and Lite at 1K.
- Muse ran through `/v1/images/generations` and `/v1/images/edits` with `size=1024x1280`.
- OpenAI is set to `quality=high` at `1088x1360`. Flare does generate and edit; Sunburst does edit
  only.
- One sample each, plus a second for Nano Banana Pro and for the best other model after pass 1.
  That was Muse: strongest edits, and at $0.01 the cheapest to re-check.
- Cost per image = the provider's `usage` × the prices above. For Muse it is the flat $0.01.

## 3. Results

| Model | Images | Refused | Avg cost / image (measured) | Latency median (range) |
|---|---|---|---|---|
| Nano Banana Pro, 2K | 20/20 | 0 | $0.140 | 22 s (20–24) |
| Nano Banana 2, 1K | 10/10 | 0 | $0.068 | 10 s (8–11) |
| Nano Banana 2 Lite, 1K | 10/10 | 0 | $0.034 | 4 s (3–5) |
| Nano Banana 2.5 | 10/10 | 0 | $0.039 | 7 s (6–9) |
| Muse Image 1.0 | 18/20 | **2: lingerie generation, both samples** | $0.010 | 17 s (14–41) |
| GPT Image 2.5 Flare / Sunburst | not run (no key) | | est. ~$0.05 high, ~$0.013 medium | |

Refusal message (Muse, lingerie generation, both samples): `400 content_policy_violation: The
response was filtered due to the prompt triggering our content management policy.` A retry with
`moderation=low` returned `400 unsupported_parameter: moderation is not supported for model
muse-image-1.0`. Earlier test, PLAN.md 2026-09-30: the same refusal on a different lingerie
prompt. The lingerie **edit** (the real bra photo) passed 2/2.

### Scores (1–5; 5 = best, and for "AI slop" 5 = no signs)

| Model | Realism | Faithful to the real product (edit) | Brand-specific | AI slop | Text / Hebrew | **Overall** |
|---|---|---|---|---|---|---|
| Nano Banana Pro | 4 | 3.5 | 4 | 3.5 | 5 | **4** |
| Nano Banana 2 | 4 | 4 | 4 | 3.5 | 5 | **4** |
| Nano Banana 2 Lite | 3.5 | 3.5 | 4 | 3.5 | 5 | **3.5** |
| Nano Banana 2.5 | 3 | 2 | 3 | 2.5 | 5 | **2.5** |
| Muse Image 1.0 | 4 | 4.5 | 4.5 | 3 | 5 | **4** (lingerie generation: 0) |

Why, in one line each:
- **Pro.** The most photographic light and texture (bread crust, the yoga room). It also produced
  the run's worst structural error: one of two lingerie renders twisted the bra into a
  bodysuit-like shape. It tidied the real challah into a neater braid in both samples, and it
  ignored the brief's light direction (bakery A is evenly lit, not oven-raked).
- **Nano Banana 2.** The best lingerie generation of all: a believable shop moment, brass rail,
  pink tape end. It keeps the challah's lobes well. Misses: drew a white frame on the yoga post,
  the cruffin reads as raw green dough, it added a fifth mat in the yoga edit, and a blue mug
  broke "no cool tones".
- **Lite.** Follows the brief (warm stripe, plywood edge) and is the fastest. Detail is softer at
  100%, and its edits look pasted on (the bra is lit differently from the linen under it).
- **2.5.** Centred, symmetric catalogue compositions and painterly crusts. In both bakery edits it
  replaced our challah with a generic braid, and it shifted the bra to grey.
- **Muse.** The most faithful edits: the challah lobe for lobe, consistent across both samples.
  The strongest art direction: Anan's still life is the one that reads as a magazine page. But it
  has the polished, dramatic look people recognise as AI (embers, flying flour, sun flare), it
  ignores counts (6 mats instead of 4, in both samples), and it dropped the logo marks from the
  mats' paper bands.

Brand specificity (do bakery A and B look like different brands?): **yes, in every model and
both
tasks**, including the edit of the *same* challah photo. Palette, surface, light and props all
followed the brief. Inside one brief there was very little difference between models (see TL;DR).

AI-slop signs seen:
- warm "cinematic rustic" defaults: Pro, Muse, bakery A
- centred, symmetric staging: 2.5 in most rows
- HDR-ish over-sharpening: Muse
- a drawn white frame: 2 of 20 Gemini-3 generations, Pro yoga #2 and NB2 yoga. The briefs here
  did not repeat production's "no borders, frames" rule, and production's `_NEVER` list keeps it,
  so keep it.
- edits that look composited: Lite, 2.5

No waxy food except 2.5's crusts. No fake text and **no Hebrew in any image**. The only
characters are real tape-measure numerals and the laptop's own "MacBook Air" mark carried over in
the edit.

## 4. Recommendation

1. **Default for generation: Nano Banana 2 (`gemini-3.1-flash-image`), 1K, 4:5: $0.068, ~10 s.**
   It matched Pro in this test at half the price, and had fewer structural errors (Pro broke one
   garment). 1K is 928×1152, which Instagram upscales about 1.17× to 1080. Move to 2K ($0.101)
   only if owners see softness. Keep Pro, if at all, as an explicit "high quality" re-render.
2. **Editing real photos: Muse Image 1.0 (`/v1/images/edits`): $0.01, the most faithful and the
   most consistent.** Fall back to Nano Banana 2 on refusal, error or timeout (budget ~45 s; Muse
   took up to 41 s). Use only the non-contributor model (`muse-image-1.0`), as `meta_model.py`
   already enforces for text.
3. **Cheap draft tier: Nano Banana 2 Lite ($0.034, 3–5 s)** wherever someone is watching the
   screen, such as the onboarding preview. **Muse ($0.01)** for drafts built in the background
   (the monthly plan), with Lite as the fallback for refusals (lingerie, likely swimwear and
   similar).
4. **Retire `gemini-2.5-flash-image`.** It is deprecated and was worst on every criterion that
   matters here.
5. **What actually fixes "Canva template + AI slop"** is in the brief and the inputs, not the
   model:
   - Turn each business's brand DNA into concrete art direction: surface, light source and
     direction, lens and height, props, palette, and what to avoid. Write it per business, never
     from a shared vocabulary.
   - Vary the brief per post (subject, angle, time of day). Sampling will not vary it for you.
   - Prefer editing the owner's own photos (already `REAL_PHOTO_FIRST`).
   - Keep the never-list, including frames.
6. **OpenAI:** still open. Run the one command below once the key is in `.env`. Its list price at
   high (~$0.05) sits between Nano Banana 2 Lite and Nano Banana 2, and at medium (~$0.013) near
   Muse. Whether it is worth it depends on the quality column, which we do not have yet.

## 5. Monthly cost per business

Per-image cost as measured above. The table counts **images actually generated**: if owners
regenerate, say 1.5 tries per published post, multiply by 1.5.

| Model | $/image | 12 / month | 20 / month | 30 / month | 100 businesses × 20 |
|---|---|---|---|---|---|
| Nano Banana Pro 2K (today's production setting) | 0.140 | $1.68 | $2.80 | $4.20 | $280 |
| Nano Banana 2, 2K | 0.102 | $1.22 | $2.04 | $3.06 | $204 |
| **Nano Banana 2, 1K** | 0.068 | $0.82 | $1.37 | $2.05 | $137 |
| GPT Image 2.5 Flare, high (list est., not measured) | ~0.050 | ~$0.60 | ~$1.00 | ~$1.50 | ~$100 |
| Nano Banana 2.5 (deprecated) | 0.039 | $0.47 | $0.78 | $1.17 | $78 |
| **Nano Banana 2 Lite** | 0.034 | $0.41 | $0.69 | $1.03 | $69 |
| GPT Image 2.5 Flare, medium (list est.) | ~0.013 | ~$0.16 | ~$0.27 | ~$0.41 | ~$27 |
| **Muse Image 1.0** | 0.010 | $0.12 | $0.20 | $0.30 | $20 |

The recommended mix: 20 posts a month, each with one Muse draft, one final on Nano Banana 2 (or
a Muse edit when there is a real photo), and about 30% regenerations on Nano Banana 2. That comes
to about 20 × $0.01 + 26 × $0.068 ≈ **$2.0 per business per month**. The same 26 final renders
on Pro, today's setting with no drafts, cost about $3.6. With Gemini Batch (50% off), anything not needed immediately, such as a
month built overnight, halves again.

## Re-running

The script is in the repo. In the main checkout, from `api/`, using its venv. `--png` needs
`cd web && npm ci` once, for `puppeteer-core`, plus Google Chrome; set `CHROME_PATH` if Chrome is
somewhere else.

```
cd api
.venv/bin/python scripts/image_bench.py run --out <dir> --refs <dir>/refs --dry-run   # prompts + estimate
.venv/bin/python scripts/image_bench.py run --out <dir> --refs <dir>/refs               # all models with a key
.venv/bin/python scripts/image_bench.py report --out <dir> --openai-placeholder --png  # index.html + comparison.png
```

**OpenAI column, once `OPENAI_API_KEY` is in `.env`:** this is one command. It adds 15 images
(~$1) and skips everything already run:

```
.venv/bin/python scripts/image_bench.py run --out <dir> --refs <dir>/refs --models oai-flare,oai-sunburst \
  && .venv/bin/python scripts/image_bench.py report --out <dir> --png
```

The 1–5 scores in `<dir>/scores.json` are judged by hand. Add the OpenAI rows to it after looking
at the new images.

On a refusal, Meta and OpenAI are retried once with `moderation=low`. The result records whether
the image passed only at `low`.

Guards in the script:
- a per-call price guard (`MAX_CALL_USD = 0.50`)
- a run budget (`--budget`, default $8)
- keys read from `.env` and used only in headers; any error text is scrubbed of them
- `-contributor` Meta models refused before any request

This run's files (images, `results.json`, `scores.json`, `index.html`, `comparison.png`) are in
the session scratchpad: `/private/tmp/claude-501/-Users-shahar-Documents-isramarket/2d52f260-76ed-45c2-b1b3-ad1300f8875b/scratchpad/image-bench/`.
