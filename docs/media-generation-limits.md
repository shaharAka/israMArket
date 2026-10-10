# Included media and creative context

The account owns the allowance, shared across its workspaces. Payment-gate bypass and
backoffice billing exemptions cannot disable the media ledger. There is no rollover,
credit purchase or browser refund endpoint in this release.

## Policy

- Regular period: at most 60 successful image generations, 120 provider attempts and
  US$5 of estimated committed/reserved image spend.
- One free trial: at most 20 successful images, 40 attempts and US$2 estimated spend.
  An expired unpaid trial does not replenish while payment enforcement is disabled.
- Video policy is prepared: two successful units, four attempts and US$3 estimated
  spend per regular period; zero trial videos. **Customer video generation is not
  enabled.** The read endpoint explicitly reports video generation unavailable. Every
  future video generation, regeneration or generative edit must reserve in this ledger
  before submission, with duration/model bounds and verified settlement.

New images and AI image edits each consume one unit. Uploads, selecting an existing
photo, text/layout editing and exporting existing content do not consume media units.
The operator budget and attempt limit can stop generation before the successful-unit
limit; existing content remains editable. These are application estimates and upper
reservations, not a reconciliation of the provider invoice or of text/research costs.

Paid periods use the subscription renewal reported server-side by PayPal. Cancellation
and payment grace retain the same window. A stale renewal date never advances locally.
Early subscription approval keeps the trial allowance until the trial ends. Exempt
accounts use a stable monthly anniversary after the trial.

Recorded `image_usage` in the current period seeds the first ledger row. Previous
periods are excluded. This can only account for historical records that still exist;
it cannot reconstruct deleted workspaces, unlogged attempts or provider invoices.
After ledger creation, deleting a workspace does not replenish its account allowance.

## Submission and settlement

`media_allowances.reserve` atomically reserves a unit, attempt and conservative cost
before network submission, in an independently committed transaction. Account/request
uniqueness prevents duplicate submission; image jobs use their durable item IDs and
direct design requests accept a validated request ID. The browser creates the ID once
per explicit request. SDK and application image retries are disabled.

Success settles actual reported/estimated cost and consumes a unit. A confirmed failure
releases the unit, retains the attempt and retains the cost ceiling unless known unbilled.
Timeout, transport error or ambiguous output retains both reservations. Muse fallback
runs only after a definitive rejection. An empty successful response is ambiguous.
Internal reconciliation may settle an unknown reservation once after verifying the
provider outcome; repeated terminal callbacks cannot refund or debit again.

Muse is restricted to non-contributor `muse-image-1.0`. Gemini image models are explicitly
allowlisted at 1K with a preflight input limit of 12,000 tokens, 4,096 output tokens and
conservative per-call cost ceilings. Configuration outside these bounds is rejected
before generation. Preflight failure releases its unit at zero generation cost.
Pricing basis: [Google API pricing](https://ai.google.dev/gemini-api/docs/pricing) and
the repository's reviewed [image models](image-models.md). Recheck prices before adding
models or changing bounds.

`GET /billing/media-allowance` is authenticated, account-scoped and read-only. It exposes
remaining units and renewal date, never keys, account IDs or internal spend. Both
tables participate in account deletion and the privacy orphan sweep.

## Creative brief

The editor and image/design prompts use the post's target audience, marketing goal,
customer action, measure, content language and available learning, alongside approved
Design DNA. Audience lookup is workspace-scoped; missing audiences are not invented.
Plan learning and observed post results are distinguished from first tests. Existing
context is not proof that a newly generated asset has already worked. Opening the
editor makes no new research or generation call.

This is the first delivery of #190. Campaign-wide asset selection, revisions with
keep/undo and coordinated versions across a whole campaign remain separate work.

## Rollout and validation

Tables are additive and created through the existing startup schema setup. Normal
deployment takes a database backup before restart. Verify model configuration, health,
table creation, anonymous 401 and account-scoped reads without paid provider calls.
Offline tests exercise concurrent reservations, duplicate submissions and settlements,
shared workspaces, historical usage, billing windows, trials, provider failures and
account deletion. UI review includes phone layouts, all four interface languages and
independent customer content language.

Rolling back application code also removes application enforcement; keeping the new
tables alone does not protect spend. Do not enable customer video routes until their
end-to-end bounded provider path and tests are delivered.
