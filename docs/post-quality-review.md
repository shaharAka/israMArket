# Excellent posts: quality before more tools

Source audit and proposed acceptance bar, 2 October 2026. This is not a completed
creative benchmark. Coordinate real-asset validation with #53 and model comparison with #55.

## What the code already supplies

`post_model_router.py` routes text writing to Gemini or Muse Spark, with fallback.
`design_dna.py`, `post_design.py`, `designer.py` and the editor provide per-business visual
direction and composed layouts. `image_routing.py` supports Muse Image generation and
edits of owner photos, with Nano Banana 2 fallback and attempt/cost records. The prompt
distinguishes source photos from generated content and keeps editable text out of images.
These code paths do not prove that today's outputs meet the quality bar.

Uploaded video can be previewed in the editor, and plans can describe reels. This does not
amount to a finished reel-rendering pipeline. No end-to-end video editor, sound/caption
composition or 3D content-production pipeline was identified in this audit.

## The bar to review against

Start from one task in the business plan, one specific audience and one useful idea.
Record what the reader should learn or do, why it fits now, and which real business
material supports it. A fluent caption and attractive image alone are insufficient.

Each output needs:

- Natural Hebrew, a specific opening, useful information and one appropriate action.
- Correct business facts, offers and availability. No invented prices, outcomes,
  testimonials, products, portfolio projects or measurements.
- The business's identity, voice and palette; a recognizable layout family with variation.
  Do not apply IsraMarket's own blue palette to every customer's posts.
- Clear hierarchy, readable Hebrew text at phone size, appropriate contrast and margins,
  intentional photo crop, and a correctly sized export for its intended placement.
- Honest images: preserve real product/work identity. If illustrative generation changes
  what is being sold or implies a completed project, it fails review.
- A coherent sequence of posts: distinct jobs in the plan, rather than the same caption
  and composition repeated with a new noun.

Review a small representative set: product offer, service portfolio/process, expertise
post, carousel explanation and story. Use authorized real assets privately. Compare
existing providers with the same brief, source material and composition. Record failures,
required edits, render time and observed/estimated cost separately. Brand fit and factual
correctness cannot be rescued by averaging them with an attractive image score.

This rubric is a proposed review process. It is not yet an automated release gate,
visual critic or evidence of owner satisfaction. Improve the failed brief, layout or
photo handling before deciding that another generator is needed.

## Additional capabilities to evaluate

For static posts, benchmark the existing Muse Image/Nano Banana routes first. Google
documents [image generation and reference-based editing](https://ai.google.dev/gemini-api/docs/image-generation).
Adding a third image provider is justified only by a demonstrated, repeatable improvement
on the same inputs and an acceptable operating cost.

For reels, first evaluate deterministic assembly of owner clips and stills: shot list,
timing, transitions, editable Hebrew captions, audio, preview and export. A video generator
does not perform all of those product tasks. Google's [Veo API](https://ai.google.dev/gemini-api/docs/veo)
is a candidate for individual generated shots or image-to-video when the story benefits.
No video API was enabled or purchased by this review.

3D is a selective format: useful for an explanatory visualization or a deliberately
stylized brand asset. It is not a prerequisite for a strong service portfolio post and
must not fabricate a product or finished client project. Defer a dedicated 3D integration
until a concrete campaign needs it and a shared example shows its value.

First engineering gap to scope after real-output review: a reviewable brief → rendered
candidate → quality findings → targeted revision loop, retaining owner approval before
publication. A model's self-assigned score is not proof of excellent content.

## Second tool review: practical shortlist, 2 October 2026

This is a sourced engineering shortlist, not an output-quality ranking. No new paid
vendor was enabled, no benchmark result is invented, and no customer material was
submitted to a new provider.

First prototype: a short vertical reel assembled from owner clips/stills or IsraMarket’s
own app demonstration. Keep the Hebrew caption layer editable and separate from generated
footage; show the intended audience and action from the plan, then retain owner approval.
Test one portfolio/process format and one product explanation before increasing scope.

For **assembly**, compare a React composition with a hosted template renderer:

- [Remotion](https://www.remotion.dev/docs/license/pricing) fits code-defined layouts,
  captions and an app preview. The published free commercial license applies to individuals
  and organisations of up to three people, subject to its terms; four or more requires
  the company license. Automators pricing is $0.01/render with a $100/month minimum,
  excluding our compute/storage. Confirm eligibility rather than assuming “open source”
  means free production use.
- [Creatomate](https://creatomate.com/docs/api/quick-start/create-a-video-by-template)
  provides template rendering through an API with named content modifications. Its
  [pricing page](https://creatomate.com/pricing) offers a 50-credit trial; it describes
  credits and temporary output hosting. Current dollar plan amounts were not exposed
  in the retrieved page, so no exact monthly price is recorded here. Verify Hebrew RTL,
  line breaks, fonts and required preview features before committing to a plan; store
  accepted exports ourselves rather than depending on temporary vendor hosting.

For **optional generated shots**, benchmark one candidate first:

- [Veo](https://ai.google.dev/gemini-api/docs/veo) supports reference-based video generation.
  The [official price](https://ai.google.dev/gemini-api/docs/pricing) for Veo 3.1 Fast is
  $0.10/second at 720p and $0.12 at 1080p; Standard is $0.40 at either resolution. An
  eight-second Fast 720p generation is $0.80. Three successful generations cost $2.40,
  even if only one is accepted; editing, storage and tax are extra. This is a calculated
  example, not our observed campaign cost. Existing Google credentials do not prove
  this paid capability is enabled for the project.
- [Runway](https://docs.dev.runwayml.com/guides/pricing/) is an alternate shot-generation
  benchmark: credits cost $0.01, Gen-4.5 is 12 credits/second and Gen-4 Turbo is 5.
  Those correspond to $0.12 and $0.05 per generated second. Compare the same allowed
  reference, duration and brief; a lower per-second price is not proof of a better
  accepted reel.

For **brand illustrations**, [Recraft’s API](https://www.recraft.ai/docs/api-reference/getting-started)
can generate raster/vector assets and control palettes/styles. Keep it as a candidate
for a specific brand-asset gap, not a new default photo editor. Exact current API cost
and faithful real-product handling still need validation.

For **optional narration**, [ElevenLabs’ current models](https://elevenlabs.io/docs/overview/models)
include Hebrew. Test pronunciation and pacing with a stock voice or the owner’s own
recording; voice cloning is outside this prototype. No voice account, paid plan or
recording upload was created by this review.

Decision order: existing Muse/Nano image-quality baseline → finished branded reel
composition/export → optional generated shot → optional narration/illustration. Defer
3D until a specific brief shows why it helps. Retain the customer’s palette and real
proof throughout; the generator does not decide the business facts.

## Bounded low-cost review work

DeepSeek may review public copy, propose regression cases or check a supplied brief for
missing acceptance criteria. Give it one task, explicit input boundaries, a small output
limit and no tools or write access. Its suggestions must be checked against source and
real tests; the first activation review included unsupported concerns which were rejected.
The successful review used the official `deepseek-flash` endpoint alias; refer to the
[current API contract](https://api-docs.deepseek.com/api/create-chat-completion/) when
updating the runner. Credentials stay local and ignored, never in these docs or prompts.
Do not send customer assets, analytics, tokens or private owner declarations as routine
review context. Report actual token usage; do not invent an exact cost without the
current account/model pricing.


## Human images and generated reel shots, 7 October 2026

Shahar requested a more colorful, lively public website, with independent service-provider
and retail examples. The marketing plan remains the main artifact: each post has an
audience, a useful idea and a next action. This extends the current homepage task #154.

The homepage preview now has distinct designer, DJ, makeup, phone-shop, everyday wellness
and clothing examples. Built-in image generation produced fictional artwork, including a
makeup session and a clothing model with natural skin and a believable working pose. Full
prompts and provenance are in `web/public/showcase/*art-direction.json`; these are website
creative samples, not a benchmark of the application's Muse/Gemini pipeline. The DJ and
clothing motion previews animate still photographs. They are explicitly labelled and do
not claim a generative video capability in the app.

Three practical creative directions:

- **Expert at work:** a makeup brush, a designer comparing colors, a DJ changing the mix.
  Show the specific decision that demonstrates the professional's character.
- **Product in use:** a person handling fabric or a phone, with one useful buying tip.
  For an actual customer's campaign preserve their real product, not a fictional stand-in.
- **People plus product proof:** a brief human moment followed by an actual IsraMarket
  plan/screen and the next action. Avoid a synthetic spokesperson explaining the whole app.

For a first generated-video comparison, keep one approved source image and one short
9:16 shot brief consistent across providers. Add our own editable caption and brand layer
when assembling the reel. The current local Remotion export prototype (#71) is relevant
to that assembly stage; it does not prove the generated-shot stage.

Official API documentation, checked 7 October 2026:

- Google now recommends [Gemini Omni Flash](https://ai.google.dev/gemini-api/docs/video)
  as its default video generator. Its [generation guide](https://ai.google.dev/gemini-api/docs/omni)
  documents 9:16 output, subject references and first/last-frame roles. Character consistency
  is a provider claim to test on our shots. The [published price](https://ai.google.dev/gemini-api/docs/pricing)
  is approximately $0.10 per second of 720p video output, plus inputs/text output. Eight
  seconds is therefore about $0.80 in video output alone; retries, edits and assembly are
  additional. Veo 3.1 remains an option for particular shot controls.
- [Runway's API](https://docs.dev.runwayml.com/guides/using-the-api/) is a comparison
  candidate for image-to-video. Its [current pricing](https://docs.dev.runwayml.com/guides/pricing/)
  lists Gen-4.5 at 12 credits per second and $0.01 per credit, equivalent to $0.12 per
  output second before applicable tax. Model availability and shot quality still need an
  actual test; a higher price is not evidence of a better result.

Recommended first comparison: makeup brush motion and a clothing sleeve/fabric shot.
Score identity/product preservation, face/hands, movement, crop, brand fit, required edits
and cost **per accepted shot**, including retries. Then compare a generated shot with an
animated still in the same reel. No new paid video provider, billed video request or public
campaign publication was performed in this review. Before running paid jobs, agree the
small benchmark's spending ceiling with Shahar.
