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
