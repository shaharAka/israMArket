# Service-provider journey: first review

[Task #67](https://github.com/shaharAka/israMArket/issues/67), 2 October 2026.
The designer journey can be rehearsed at `/design/flows?persona=designer&step=what`.
The example is fictional. “Services are an easier sell” remains a hypothesis to test with
real owners; this code audit does not establish market demand or conversion rates.

## What already supports services

- `api/app/services/business_model.py`: services, products and mixed businesses, lead or
  personal-brand goals, and an inquiry unit. Planner instructions avoid online carts and
  product-purchase assumptions for pure services.
- `web/lib/businessModel.ts` and `web/lib/goals.ts`: service-specific goals, lead source,
  portfolio and personal-brand diagnostics. Pre-signup baseline asks about inquiries,
  close rate, client value and capacity, retaining ranges and unknown answers.
- `web/components/start/script.ts`: services skip the store/website growth question, but
  still complete fifteen screens. This is conditional support, not a short service journey.
- Trial foundations have service titles and service featured-item reasons. Content can
  follow a service plan and the owner's voice.

## Friction and the first correction

The landing page examples and growth story primarily describe a shop. A designer needs
to recognize a service problem before completing the same discovery sequence.

The trial called the selection “services” but explained it with stock and seasonality.
Its writing gate and post-writing explanation also said “products”. This patch aligns
pure-service explanations with suitable clients, available time, services and work that
demonstrates them. The welcome now uses neutral wording for choosing what to promote.
The product and mixed-business branch keeps its inventory guidance.

The WhatsApp setup incorrectly promised to count every inquiry. Short links count clicks,
not sent messages. Both default and KPI-specific explanations now say so. Regression
coverage checks service wording and both WhatsApp explanations against the real trial API.

No gate or plan logic is changed in this first correction. Three featured items and three
assets still gate initial writing. A specialist could have one clear service and a useful
expertise post before three publishable images; this requirement deserves a deliberate
content-path decision rather than an undocumented bypass.

## Proposed service path to validate

Begin with a suitable client and the kind of work the owner wants more of. Ask how clients
usually find them, then offer three evidence paths: portfolio example, professional
explanation, or client outcome they are entitled to share. Keep uncertain numbers optional.
Recommend a goal based on fit and available capacity, explain why, and allow correction.

After showing the plan, ask for the easiest proof material and one first content decision.
Recommend one relevant connection with a reason. A portfolio-only owner should not be
blocked by a missing website property, Pixel or product stock list.

A designer's first post should explain a professional decision and help a suitable
prospect recognize their need. Use a clear invitation to a relevant conversation. Avoid
automatic discount language, invented testimonials or implying that everyone who clicks
is a sales lead.

The measurement ladder must remain separate:

1. Portfolio/profile interest and tracked contact-link clicks: available source evidence.
2. Inquiry received: requires owner reporting or a connector that can observe that event.
3. Suitable inquiry: owner assessment with a defined fit criterion.
4. Project won and its value: owner/CRM evidence.
5. Capacity and profitable fit: planning input, not inferred from reach or clicks.

The post-signup baseline stores inquiries, close rate and deal value as planning inputs.
The reporting change described below adds owner-entered outcomes. It does not provide
automatic inquiry attribution, a CRM or a verified click-to-client funnel.

## Optional results check-in (4 October change)

Service and mixed businesses can record a month of inquiries, the suitable subset and
new clients signed. A suitable count requires the owner's short definition of fit. A blank
count stays unknown, and zero stays zero. Clients signed may have inquired in a previous
month, so no conversion rate is calculated between these totals. There are no client names
or per-post/channel attribution fields.

Current-month reports can also record how many additional clients the owner can accept
now. Availability older than seven days or from an earlier month is excluded from current
planning and flagged for an update. Historical corrections retain their own month and do
not replace the latest month's results. Concurrent edits require a fresh revision and
show the saved values before the owner decides to replace them.

The check-in is optional and works before any provider connection. Saving makes no model
or provider request and edits no baseline, plan or post. The owner can then request a
reviewable plan suggestion using the report, its fit definition, project-value inputs,
portfolio availability and capacity constraints. Planning ranges remain ranges; they are
not presented as observed revenue. Earlier proposals are marked stale after a correction,
and an in-flight background analysis cannot save advice against changed reporting facts.

Results leads with the proposal when one exists; the report then lives in an expandable
row. Owner counts lead the proposal's evidence, separately labelled from provider data.
An existing plan without later milestones also opens without a rendering crash.

Delivery remains subject to PR review, a Claude design pass and deployment verification.
The local preview uses a fictional designer and simulated AI replies; it verifies the
working API/UI path, not recommendation quality or real-customer adoption.

## Pitch and test

Pitch to try:

> לא חייבים פרויקט חדש כדי להראות מה אתם יודעים לעשות.
> בונים תוכנית סביב הלקוחות והעבודות שמתאימים לכם, ומתחילים מפוסט אחד מועיל.

Run observed sessions with service owners who differ in portfolio maturity and inquiry
volume. Record whether they can explain the recommended goal, supply one usable proof,
prepare a post and interpret its next action without technical help. Compare with shop
sessions for time to useful plan and first meaningful action, not only signup counts.
Record unanswered questions, assistance and exits; a small qualitative sample is not a
conversion benchmark.

The subsequent first-content correction already allows one service and one evidence item;
shops retain their three-item requirement. Remaining work in #67 includes real owner
discovery/pilots and a verified service example in the customer journey. Coordinate guided
connection delivery with #44/#45 and findings with #46. Do not call the service segments
validated or the simulated preview live customer data.
