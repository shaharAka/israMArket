# Actual builder creative review — 10 October 2026

Task: #183. This is a small output review, not evidence of audience performance or a
production quality improvement. Four fictional posts used the existing creative designer,
image router, photo analysis and CardCanvas. A fifth output tested a proposed isolated
photographic prompt. Business descriptions, brand directions and captions were authored
for the test, rather than discovered from a customer's website. No customer database was
opened, no post published and no production configuration changed.

## Outputs and decisions

- **DJ, broad brief:** keep as a baseline. The result was better than expected: a believable
  small room, candid hands and tactile equipment, without text banners. The caption was
  generic. Equipment marks/background faces need checking. A fictional event is not proof
  of a real booking or an actual owner's identity.
- **DJ, precise cueing moment:** keep the direction. Listening and adjusting the mixer show
  the judgement behind the service. It remains close to the first image's style; this pair
  does not prove creative variety across a month. A distinctive owner story is still needed.
- **Designer, paint in light/shade:** reject the first export. The image model drew a label
  and a layout seam despite explicit instructions against both. The actual renderer then
  added the editable headline, producing competing text. Readability checks passed, proving
  that legibility alone is not a creative quality gate.
- **Designer, isolated photo input:** keep the improvement. Passing only the photographic
  scene and explicit image-only constraints removed the generated label/layout. The
  original editable headline, placed by photo analysis and CardCanvas, remained. One
  successful correction is a hypothesis for the prompt contract, not proof of reliability.
- **Phone shop, connector buying tip:** revise the detail. The subject and message are
  clear; photo analysis let the real renderer place text over calm space rather than a large
  blue band. Connector geometry is unverified and the photograph remains fairly ordinary.
  Real product material and a concrete buyer comparison should improve it.

The final exports include the production photo-analysis step. An initial diagnostic render
without that step fell back to large color bands; it must not be represented as the complete
normal pipeline. Even with analysis, the original designer export failed creative review.

## Video experiments

Two eight-second 720 × 1280, 24fps MP4 shots were generated with
`veo-3.1-fast-generate-preview`, within a fresh US$2 video cap. Both decoded fully and
played in the browser without media errors.

- **DJ, image-to-video:** genuine finger, wrist, head and shoulder movement, with stable
  identity at review size. The 4:5 source produced black padding in the 9:16 output.
  Revise framing and check the precision hand movement before using it as a reel shot.
- **Designer, text-to-video:** genuine hand/sample movement under natural light. The sample
  is partly out of frame at the start/end, and its return to shade is incomplete. Tighten
  the action and use a real sample reference before accepting it as an educational reel.

The initial designer request used the image-to-video person setting on a text-to-video
request and was rejected before generation. Correcting the parameter submitted the second
successful job; no paid video regeneration was performed. Generated shots remain a local
experiment, separate from customer reel assembly/export (#71) and allowances (#158).

## Recorded usage

- First four image outputs: US$0.34403 estimated from router/provider usage records.
- Targeted fifth image: US$0.06875 estimated.
- Four creative-planning calls: 7,153 input, 1,829 answer and 3,536 thinking tokens;
  approximately US$0.02549 using current Flash pricing.
- Five photo-analysis calls: 6,890 input and 688 output tokens; approximately US$0.00775.
- Two successful eight-second Fast 720p jobs: approximately US$1.60 at US$0.10/second.
- Total: approximately **US$2.05**, excluding account-specific tax. These are usage/list-price
  estimates, not a billing invoice. Image/planning usage is separate from the video cap.

Muse returned `billing_not_configured` for the local test credentials; the configured
Gemini fallback made the first four images. This does not establish production Muse status.
The fifth explicitly used the existing Gemini image route for the proposed prompt test.

Prices checked against [Google's official pricing](https://ai.google.dev/gemini-api/docs/pricing).
The current [Veo specification](https://ai.google.dev/gemini-api/docs/veo) supports 4/6/8-second
shots; longer reels require assembly or separately billed extension workflows.

## Builder changes justified by this review

1. Separate the image-generation contract from captions and renderer layout instructions.
   Let the app own editable text; check for baked-in words/layout before accepting an image.
2. Retain photo analysis, but evaluate the final export for duplicate messages, focal crop,
   product/identity fidelity and repetitive composition. Do not treat a self-assigned model
   score or a successful PNG export as evidence of excellent content.
3. Plan visual variety across a sequence: proof, process, useful explanation and invitation.
   Preserve each business's character while varying the idea, not merely the photograph.
4. Give generated shots a start, meaningful action and end state. Check reference aspect
   ratio before spending, then review identity, hands, framing and whether the action
   actually explains the post's message. Keep paid attempts bounded.

Review assets, complete prompts and attempt records are retained locally in
`.runtime/creative-review/`. The playable gallery is at `http://127.0.0.1:3141/`; these local
links are not shareable remotely. The standalone canvas contains embedded media. Record
owner creative acceptance in #183; product changes require their own implementation and
real-owner-material validation (#53), beyond this small fictional sample.
