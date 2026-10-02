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

The post-signup baseline currently stores inquiries, close rate and deal value; it does
not yet provide this full qualification/reporting ladder. Do not label it as shipped.

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

Next product decisions in #67: whether to shorten initial discovery, whether one evidence
item can unlock a service post, where to capture suitable/won inquiries, and a service
landing example. Coordinate guided connection delivery with #44/#45 and findings with
#46 rather than duplicating their ownership or claiming their prototypes are live data.
