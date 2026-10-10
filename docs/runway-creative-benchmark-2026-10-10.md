# Runway production benchmark and campaign direction

10 October 2026 · Codex · Refs #186, #183, #184, #158

## Outcome

Four approved, eight-second portrait Runway jobs completed with no submission retries or regeneration. Measured debit: **272 credits ($2.72)**, from 1,000 to 728 credits. Originals, briefs, job records, metadata, contact sheets and a playable six-clip comparison are retained in the private local review workspace. No customer assets, production configuration or publication changed.

Runway Gen-4 Turbo cost $0.40 per clip, with observed submission-to-download times of 28.80 seconds (DJ) and 28.13 seconds (designer). Gen-4.5 cost $0.96, taking 127.91 and 129.03 seconds respectively. All four outputs are 720 × 1280 and decode fully. Output durations are approximately 8.04–8.08 seconds. Wait includes queue, polling and download, not only inference. Debit is a credit-balance measurement, not a tax invoice.

## Creative findings

- **DJ / Turbo:** genuine hand, head and shoulder motion; quickly produced. The face moves out of the right edge, and the requested action sequence is not fully retained. Budget candidate with better source framing.
- **DJ / Gen-4.5:** more expressive headphone/deck action; viewpoint and appearance shift despite the locked-camera direction. Additional action does not clearly earn the higher price here.
- **Designer / Turbo:** recognizable terracotta texture and samples, but insufficient movement through the light to explain the intended design decision.
- **Designer / Gen-4.5:** samples rotate/fold like a book and one changes colour. Reject for this brief: the demonstration loses its meaning.
- **Earlier DJ / Veo Fast:** useful service action with a visible face, but black padding must be addressed in source preparation.
- **Earlier designer / Veo Fast:** the single-board sunlight/shade lesson is clearer, but the board partly leaves the frame. This is a separate text-to-video approach.

The local gallery provides row playback, speed controls, source references and original downloads. It is a review artifact, not a public production feature. Browser playback verification is recorded in the issue outcome.

## Limits of the comparison

Runway models share the same source, motion brief, duration, ratio and seed per case. Equal seeds do not imply equivalent randomness across models. DJ uses the same source and action as the earlier Veo image-to-video shot, with the audio instruction removed. Designer Runway starts with two boards in an image; earlier Veo used text-to-video with one board. Do not claim a controlled cross-provider designer winner. Source images were 4:5; models handle the requested 9:16 output differently. A portrait source should be prepared before a production comparison.

One sample per model/brief does not establish acceptance rates, reliability, conversion performance or cost per accepted campaign. All references are fictional. Original outputs were not corrected before comparison.

## What the owner clarified

IsraMarket's product is an ongoing marketing plan and its execution. Nontechnical architects, shop owners and service providers need a coherent offer, recognisable identity and useful customer actions. They should be able to direct creative work in everyday language while the platform remembers their business, manages the sequence and learns from outcomes. Novel visuals alone are insufficient, and likes are not the default business objective.

Proposed experience:

1. Research the business and confirm the offer, audience, real assets and desired action.
2. Establish an approved visual direction and business facts once; retain preferences across assets.
3. Propose a small campaign sequence with different jobs: explain, demonstrate, answer a hesitation, invite action.
4. Let the owner change tone, imagery, colours or emphasis on the selected draft. Preserve unrelated approved facts/assets, editable text and earlier versions.
5. Publish through authorised connections after owner approval, using the measurement available for that business.
6. Report the useful finding and next proposed change. Separate measured outcomes, owner feedback and hypotheses; do not automatically attribute revenue to a visual change.

Runway can supply production operations. IsraMarket should retain the business/brand context, campaign decisions, scheduling, approvals, source provenance, asset history, language and measurement links independently of the provider.

## Verified toolkit fit and remaining proof

Runway's [API reference](https://docs.dev.runwayml.com/api/) lists image/video generation and editing, audio, upscaling and production recipes. [Published workflows](https://dev.runwayml.com/workflows) can chain model/processing steps behind one endpoint and are billed by those steps. This is a plausible way to reduce orchestration work, not proof of a fixed-price campaign or maintained brand fidelity.

[Brand Kits](https://help.runwayml.com/hc/en-us/articles/47057921993491-Brand-Kits-for-Enterprises) organise reference assets and usage guidance in Runway's app. Programmatic kit management has not been verified; do not promise that a developer key includes every web-app capability. Keep IsraMarket's approved context as the source of truth.

**Recommendation:** retain the current Veo option, keep Turbo as a budget candidate, and evaluate Runway as a toolkit through a campaign-level proof rather than switching every generation to Gen-4.5. The next evaluation should use one architect/service brief and one shop brief, approved real material when available, three assets with distinct purposes per brief and one targeted revision. Measure continuity, factual fidelity, message clarity, editing effort, total processing cost and phone-size final exports. Provider quality checks must catch a changed product or a meaningless demonstration.

The campaign-level provider evaluation is scoped in [#187](https://github.com/shaharAka/israMArket/issues/187), Ready for claim. Its provider mapping and dry-run design can proceed before paid proof. No additional paid generation is authorised by this report. The completed benchmark budget has been consumed. Integration with server-side reservations, allowance and cost preview remains under #158; photo/copy separation and final output review under #184. Product UI remains in Claude's lane.

Sources checked 10 October 2026: [Runway pricing](https://docs.dev.runwayml.com/guides/pricing/), [Google pricing](https://ai.google.dev/gemini-api/docs/pricing/), [Runway API/web credit separation](https://help.runwayml.com/hc/en-us/articles/21668552945171-Runway-API-FAQs), [Runway attribution](https://docs.dev.runwayml.com/usage/attribution/).
