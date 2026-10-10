# Small direct Google video-editing proof

10 October 2026 · Codex · Refs #187, #158, #184, #117

## Outcome

One direct Google Gemini Omni Flash edit completed in **54.51 seconds**. The eight-second, 720 × 1280 result changes the fictional designer clip's plaster wall to cool grey while closely retaining the hand movement, rigid sample geometry and framing. The sample and skin also appear lighter and less saturated. This is a useful targeted edit, with **partial colour fidelity**, rather than proof of exact product preservation.

The owner approved up to $1.50 total for one generated edit, with no paid regenerations. The conservative token-based estimate is **$0.904143**, within that cap; this is not an invoice or a measured account debit. Two HTTP 400 request validations occurred before generation, with no interaction ID or usage returned. Their explicit errors prohibited duration and aspect-ratio settings for editing. Those settings were removed, following the documented uploaded-video editing example. There was one generated clip and no paid regeneration or automatic submission retry.

The private local review contains original/output clips, prompt, source/output hashes, validation diagnostics, usage, metadata, contact sheets and a playable before/after. No production provider configuration, customer asset or published post changed.

## Request and checks

The existing fictional, single-shot designer clip shows a hand moving a terracotta paint sample through sunlight and shadow. The request changed only the plaster wall to muted cool grey and asked to retain the sample colour and rigid shape, hand, movement, camera framing and timing, with no added text or objects.

- Wall appearance: visibly grey after editing.
- Sample geometry: retained as a rigid rectangular board in the reviewed frames; no folding or newly added objects.
- Motion and framing: closely retained across the sampled sequence and browser playback. Source and output both last eight seconds.
- Colour: partial. The board and skin look lighter/less saturated under the edited rendering; reject any promise of exact merchandise colour preservation from this one result.
- Technical export: H.264 video, AAC audio, 720 × 1280, 24 fps; fully decodes. Presence of an audio track does not establish that generative editing preserves source audio.

For customer footage, keep the approved original and make the output a reviewable version. Offer deterministic original-audio remuxing separately when sound must remain unchanged. Do not silently replace the owner's accepted product or project asset. One hand-and-board scene does not establish face identity, multi-shot consistency, performance transfer or acceptance rates across business types.

## API behavior and cost lesson

The successful request used `gemini-omni-1.1-flash` through the [Interactions API](https://ai.google.dev/api/interactions-api), with inline MP4 input, the editing prompt, `video_config.task=edit` and `max_output_tokens=60000`. `store`, `stream` and `background` were false. Explicit `response_format` was omitted after validation established that an edit cannot override duration or aspect ratio. This source remained eight-second portrait footage; do not generalise that to arbitrary export sizes without another test.

Recorded usage:

- Input: **46,869 tokens** (46,809 video; 60 text).
- Video output: **46,336 tokens**, consistent with 5,792 tokens per second for eight seconds at 720p.
- Total output: **47,323 tokens**, plus **325 thought tokens** reported separately.

Using [published pricing](https://ai.google.dev/gemini-api/docs/pricing), the conservative estimate applies $1.50/M to input and $17.50/M to all reported output plus thoughts. That intentionally overprices non-video output instead of presenting false billing precision. No further generation consumed the remaining allowance.

**Important discrepancy:** the separate model `countTokens` call returned **2,685**, while Interactions reported **46,869 input tokens**. That generic count is not a reliable price preview for this native video edit. Production reservations under #158 must use conservative task-specific video/input estimates and reconcile actual returned usage. Do not rely on `countTokens` alone, or present a token limit as an independently verified merchant spending cap. This one observed request remained within the owner's approved total.

## Finishing we already tested without an AI call

Local FFmpeg produced a five-second cut from source seconds 1–6, with 0.15-second entry and 0.25-second exit picture/audio fades. The result keeps source imagery and sound, exports a 720 × 1280 MP4 and fully decodes. Original and shortened outputs both completed browser playback. API spend for this operation: $0; local processing still has an infrastructure cost.

## Product direction

Build a small experience in IsraMarket: select an asset, describe one change, preview it, then keep or undo. Keep the marketing brief, approved references, original, version history, campaign decisions and cost allowance in IsraMarket. Use our own processing for cuts, assembly, editable captions, branding and export; call direct Google for generative edits when needed. Runway remains an optional specialist for a concrete capability gap.

The test preview plays prepared results. It is not a shipped arbitrary-request interpreter, customer background-job system, campaign editor or entitlement implementation. Next delivery is a bounded selected-asset revision flow coordinated with Claude in #117/#184 and reservations in #158. The broader campaign-level evaluation in #187 remains open.

Sources checked 10 October 2026: [Google Omni editing guide](https://ai.google.dev/gemini-api/docs/omni), [Interactions API](https://ai.google.dev/api/interactions-api), [Google pricing](https://ai.google.dev/gemini-api/docs/pricing). Provider keys, raw diagnostics and media stay out of git and public issues.
