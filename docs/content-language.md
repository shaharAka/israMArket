# Post language

Interface locale (`isramarket.interface-language`) and marketing content language are independent.
The latter is stored per business under `scraped_profile_json.content_language` and read/saved
through owner-scoped `GET/PUT /business/content-language`. Supported values are he, en, ar, ru.
Legacy businesses default to Hebrew. No locale selection or preference save rewrites saved posts.

Choose the default under Business → Post language or Prepare → Posts. Optional audience languages
are owner-confirmed; enabling experiments allows at most one alternate-language draft per writing
call, grounded in the audience, offer and business context. Its `language_reason` is shown before
approval as a hypothesis. Measured-post context includes its language, but does not establish a
causal language winner. No automatic inference from nationality, geography or business type.

`POST /onboarding/posts/start` accepts optional `content_language` alongside `week`. That batch
uses one language, disables experiments, and does not change the business default. The month's
`posts_language_preferences` freezes a posts job's choice across weeks and retries; a conflicting
explicit language while the job is running returns 409 before queueing another week. Monthly
strategy generation also freezes its writing preference in its persisted stage state.

New drafts carry `content_language` and an optional experiment reason. Rewrites keep the original
post language even when the business default later changes. Muse and its Gemini fallback receive
the same language instructions; public-copy schema descriptions must agree with them. Image scene
instructions remain English and forbid embedded text; the designer's overlay uses the post language.
The card keeps the business's visual design, with direction/font fallback for the content language.

The pre-signup Hebrew preview selection stays stored as chosen. When a non-Hebrew first batch is
requested, new copy is written from the same strategy rather than silently reusing Hebrew samples.
Public-copy language and owner-facing explanations are separate: existing API explanation fields
remain Hebrew until the broader runtime localization in #142 is completed. All new interface copy
and release notes are included in the automatic he/en/ar/ru catalogs. Native-language copy review
and real campaign evidence are still required before claiming measured language optimization.

Verification uses mocked providers and temporary databases (`api/tests/test_content_language.py`).
The demo preference has its own browser key, `isramarket.demo-post-language`, for repeatable review.
