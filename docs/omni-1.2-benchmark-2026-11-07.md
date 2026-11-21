# Gemini Omni 1.2 Flash vs 1.1 for campaign video

7 November 2026 · Claude · Refs #230

## Outcome

Omni 1.2 Flash is **31% cheaper per second** ($0.070 vs $0.102 measured), accepts **15-second**
clips (1.1 stops at 10 s), and kept the owner's reference photo more faithfully. On
consistency it was **not better** in this sample: the hero product or person stayed the
same in 11 of 12 clips, and the one identity drift (a woman's hair changing during her
final turn) was 1.2 at 15 s. 1.2 at 8 s also had two background slips between shots that
1.1 did not. No clip invented text, logos or lettering. One take per cell, so these are
observations, not rates.

The owner decided to switch. The branch makes Omni 1.2 the default (`VIDEO_MODEL`), keeps
1.1 as the refusal fallback (`VIDEO_FALLBACK_MODEL`), allows 3–15 s where a new clip asks for
a length (default still 5 s) and prices reservations by model and length. Google routes all
1.1 requests to 1.2 from **3 December 2026**, billed at 1.2 rates, so staying on 1.1 was
not an option beyond four weeks anyway.

Total spend: **$10.59** of the $15 cap (twelve clips at $10.58 from returned usage at the
official prices, plus a $0.015 upper bound for one ambiguous probe).

## Official limits and prices (checked 7 Nov 2026)

| Model | Length | Video output | Per 720p second | Input | Status |
|---|---|---|---|---|---|
| `gemini-omni-1.2-flash` | 3–15 s | $12.00 / 1M tokens | ~$0.07 (5,792 tokens/s) | $1.50 / 1M | GA 5 Nov 2026 |
| `gemini-omni-1.1-flash` | 3–10 s | $17.50 / 1M tokens | ~$0.10 | $1.50 / 1M | GA 27 Aug 2026; routes to 1.2 on 3 Dec 2026 |
| `gemini-omni-flash-preview` | 3–10 s, 720p | not listed | – | – | deprecated 30 Sep 2026; the models page says shut down, though our key's model list still shows it |

Text output is $9.00 / 1M on both. The pricing page's 1.2 footnote gives ~$0.70 for 10 s and
~$1.04 for 15 s at 720p, and 360p/1080p/4K at 1,931/8,688/17,376 tokens per second. The
changelog states the 1.2 claims: up to 15 s, "improved character and subject consistency
across up to 6 reference images", 30% lower video output price and doubled paid rate limits.
The third-party figures in circulation ($0.10/s, $17.50/M, "up to 10 s") are 1.1's and the
preview's. Sources: [pricing](https://ai.google.dev/gemini-api/docs/pricing),
[models](https://ai.google.dev/gemini-api/docs/models),
[Omni Flash model page](https://ai.google.dev/gemini-api/docs/models/gemini-omni-flash),
[Omni guide](https://ai.google.dev/gemini-api/docs/omni),
[changelog](https://ai.google.dev/gemini-api/docs/changelog) (ai.google.dev now redirects to
aistudio.google.com/docs).

## Verified on our key

- Models list: `gemini-omni-1.1-flash`, `gemini-omni-1.2-flash` and `gemini-omni-flash-preview`,
  each listing a 65,536-token output limit.
- 1.2 at 16 s: HTTP 400 `Requested video duration 16s 0ns exceeds the maximum allowed 15s 0ns`
  in 0.8 s, nothing generated. 1.1 at 11 s: the same error with "maximum allowed 10s".
- `response_format.duration` ("15s") fixes the length: every clip came back at the requested
  length plus 0.03–0.04 s.
- `max_output_tokens` must cover the clip. A 15 s request with a 1,000-token budget was refused
  after 13.3 s with a generic `Request contains an invalid argument.` (no usage returned; kept
  in the ledger at a $0.015 upper bound). With 100,000, both models accepted, despite the
  listed 65,536 limit, and a 15 s clip returned exactly 86,880 video tokens. Production now
  asks for seconds × 5,792 + 8,000.
- Usage returns `output_tokens_by_modality` (all video) and separate thought tokens
  (244–1,657 per clip). Input: about 630 text tokens; the 512 px reference image adds ~1,050.
- Both models returned an AAC soundtrack with quiet ambience (mean −37 to −52 dB), although
  the model page lists 1.1 as "video only". Audio was not transcribed.

## Method

`api/scripts/video_bench.py` reproduces it. Same request shape as production (Interactions
API, 9:16, 720p, `store`/`stream`/`background` false), the production prompt guardrails (no
text, logos, invented customers or offers), and a timed shot plan in the format of the
creative director in PR #216. Four briefs in IsraMarket's own shape, reusing Codex's October
briefs:

1. **Clothing shop**, text to video: a woman in an oatmeal linen shirt rolls a cuff, a cuff
   close-up, then she turns and walks to the window.
2. **Bakery**, text to video: hands lift a sesame challah, a macro press of the crust, the
   challah goes into a paper bag.
3. **Interior designer**, text to video, no faces: a terracotta sample board moves from sun to
   shadow on plaster, a close-up, then a finished terracotta corner.
4. **Ceramics with the owner's photo** (`web/public/examples/ceramics.webp`, sent as
   production does: 512 px JPEG, `image_to_video`): lift a blue mug from the shelf, turn it in
   the light, set it down beside the wheel.

Each brief ran on 1.1 at 10 s (its maximum), and on 1.2 at 8 s and at 15 s: one take each,
no retries. Every call was estimated before submission from duration × official price
against the cap. FFmpeg measured length, size, fps and audio, sampled one frame per second
and detected cuts. The Gemini vision reviewer (`gemini-3.8-flash`) was blocked: the first
review call after the twelfth clip returned **HTTP 402 "Your prepayment credits are
depleted"**. The scores are therefore Claude's hand review of the one-per-second frames plus
dense strips (3–4 frames/s) around every cut, on the same 1–5 rubric: consistency, prompt
adherence, clean frame (no invented text), motion, reference fidelity.

## Results

Cost is returned usage at official prices (thoughts at the text rate when the API splits
modalities). All clips are 720×1280, 9:16, 24 fps H.264 with AAC.

| Brief | Model · length | Real s | Latency s | Video tokens | Cost | $/s | Consistency | Adherence | Clean | Motion | Fidelity |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Clothing | 1.1 · 10 s | 10.03 | 34.1 | 57,920 | $1.018 | 0.102 | 5 | 4 | 5 | 4 | – |
| Clothing | 1.2 · 8 s | 8.04 | 35.2 | 46,336 | $0.566 | 0.070 | 4 | 4 | 5 | 4 | – |
| Clothing | 1.2 · 15 s | 15.04 | 62.5 | 86,880 | $1.057 | 0.070 | 3 | 5 | 5 | 4 | – |
| Bakery | 1.1 · 10 s | 10.03 | 34.7 | 57,920 | $1.017 | 0.101 | 5 | 5 | 5 | 4 | – |
| Bakery | 1.2 · 8 s | 8.04 | 35.2 | 46,336 | $0.565 | 0.070 | 4 | 5 | 5 | 4 | – |
| Bakery | 1.2 · 15 s | 15.04 | 68.0 | 86,880 | $1.058 | 0.070 | 4 | 5 | 5 | 4 | – |
| Designer | 1.1 · 10 s | 10.03 | 35.2 | 57,920 | $1.018 | 0.102 | 5 | 3 | 5 | 3 | – |
| Designer | 1.2 · 8 s | 8.04 | 32.4 | 46,336 | $0.566 | 0.070 | 5 | 4 | 5 | 4 | – |
| Designer | 1.2 · 15 s | 15.04 | 60.0 | 86,880 | $1.057 | 0.070 | 5 | 4 | 5 | 4 | – |
| Ceramics + photo | 1.1 · 10 s | 10.03 | 35.4 | 57,920 | $1.020 | 0.102 | 4 | 4 | 5 | 4 | 3 |
| Ceramics + photo | 1.2 · 8 s | 8.04 | 33.3 | 46,336 | $0.563 | 0.070 | 3 | 4 | 5 | 4 | 4 |
| Ceramics + photo | 1.2 · 15 s | 15.04 | 65.3 | 86,880 | $1.056 | 0.070 | 5 | 3 | 5 | 4 | 5 |
| **Mean** | **1.1 · 10 s** | | 34.9 | | $4.073 | **0.102** | **4.75** | 4.00 | 5 | 3.75 | 3 |
| **Mean** | **1.2 · 8 s** | | 34.0 | | $2.260 | **0.070** | **4.00** | 4.25 | 5 | 4.00 | 4 |
| **Mean** | **1.2 · 15 s** | | 63.9 | | $4.228 | **0.070** | **4.25** | 4.25 | 5 | 4.00 | 5 |

What the scores rest on:

- **Clothing.** 1.1 kept the same face, low bun and shirt in all three shots, and she really
  walks. 1.2 at 8 s kept her and the shirt, but its last shot is a different room. 1.2 at
  15 s followed every beat with a natural walk and a long fabric close-up, but during the
  final turn her tied-back hair becomes a loose bob and her face reads younger.
- **Bakery.** The same challah from tray to bag in all three. 1.2 at 15 s reframes the last
  shot (bread rack behind) and carries the loaf in from the frame edge, and its 5 s macro
  press drags.
- **Designer.** The rigid terracotta board never changes colour or shape in any clip. 1.1
  barely moves it from sun into shadow, so the lesson is not shown; both 1.2 clips move it.
- **Ceramics.** 1.1 reframed the studio and turned the owner's handled grey jug into a
  handle-less cup; its glaze is glossier than the photo. 1.2 at 8 s matched the glaze, tan
  foot and shelf, but the piece on the wheel switches between shots. 1.2 at 15 s opens almost
  on the owner's photo and keeps every object in one continuous take, but it skipped the
  requested close-up.

## Verdict

- **Cost:** 1.2 wins. $0.070 per delivered second against $0.102, as published. A 15 s 1.2
  clip ($1.06) costs about the same as a 10 s 1.1 clip ($1.02); the default 5 s clip is
  about $0.36.
- **Length:** 1.2 wins. 15 s verified; 1.1 refuses above 10 s. A 15 s clip takes about 64 s
  to come back, against 34 s for 8–10 s.
- **Fidelity to the owner's photo:** 1.2 was better in the one reference brief, at both
  lengths.
- **Consistency:** a draw on the hero subject at 8 s, slightly worse on backgrounds; one
  person-identity drift at 15 s. Google's "more consistent" claim is not shown by this
  sample.
- **Invented text and logos:** none in any clip, on either model.

## Recommendation

Switch now, as the owner decided: cheaper, longer, better on references, and 1.1 disappears
on 3 December. Keep the default at 5 s. Offer 15 s for product and space clips. For a person
wearing the product, prefer up to 10 s until a few more takes show whether the 15 s
identity drift repeats. Clear `VIDEO_FALLBACK_MODEL` after 3 December, when 1.1 becomes 1.2.

Before activation:

1. **Top up the Google prepaid credit.** The bench key returned 402 after this run. If
   production uses the same project, its Gemini image and text-rollback calls fail too.
2. Run the scoped canary on 1.2: one 5 s clip, one 15 s clip and one **edit** (edits were not
   part of this benchmark).
3. Codex (PR #216): the creative director's `Shot` bounds stop at 10 s and it plans for
   `duration=5`; pass the requested `seconds` through when rebasing.

## On the branch (`claude/omni-1-2`)

- `VIDEO_MODEL` (default `gemini-omni-1.2-flash`) and `VIDEO_FALLBACK_MODEL` (default
  `gemini-omni-1.1-flash`; empty = none). Allowlisted names only; anything else leaves video
  off.
- Fallback follows `image_routing.py`: only a definitive refusal (HTTP 400/403/404/422/429,
  nothing generated) is settled as failed, and the same request then goes once to the
  fallback, shortened to its maximum, under its own reservation (`<key>:fallback`). A 401,
  a timeout, a 5xx or ambiguous output never falls back and never retries.
- `options.seconds` (3–15) on new campaign clips, checked against the configured model; an
  explicit `response_format.duration`; token budget seconds × 5,792 + 8,000.
- Reservations price that whole budget at the model's video rate plus bounded input: 1.2
  $0.46 (5 s) to $1.16 (15 s); 1.1 at 10 s $1.17. All fit the $1.20 per-request bound and
  the regular period's $3 video budget. A refusal keeps its ceiling (unchanged behaviour), so
  a refused 15 s request plus its fallback uses most of a period's budget.
- Settled cost uses the model's own price ($12/M for 1.2).
- The settings are in `.env.example`, `DEPLOY.md` and `tests/_test_env.py`. The tests mock
  every provider call. `CAMPAIGN_VIDEO_ENABLED` stays false.

Clips, frames, the review sheet and the ledger are local only (not in git).
