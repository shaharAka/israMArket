# IsraMarket as an IsraMarket customer

[Task #66](https://github.com/shaharAka/israMArket/issues/66). Working plan, 2 October 2026.
This document is a launch brief and experiment proposal. No invented visits, account
connections, customers, revenue, posts or results. Actual account and asset details belong
in the private tracker, not this public repository.

## The business and the plan

IsraMarket helps an Israeli small-business owner decide what to do in marketing, produce
content for that plan, and turn available evidence into the next decision. The plan is
the product. The editor supports it. The initial pilot audience is independent designers
and other service providers with a portfolio, an existing social profile and limited time
for marketing. This is a testable segment choice, not evidence that services sell more easily.

Positioning to test:

> תוכנית שיווק שמתחילה בעסק שלכם, ומלווה אתכם בצעד הבא.
> יודעים מה להציג, למי, ואיך לבדוק אם זה עזר.

Primary outcome: owners who save a useful plan and take its first meaningful action.
Visits and clicks are supporting indicators. Account creation alone is not success.
Use two activation paths, reported separately: a useful read from a connected source, or
a reviewed first post prepared from the owner's materials. Weekly return should include
an action, not just a page load.

Initial baseline: unknown. Obtain observations before setting a numeric growth target.
No paid promotion is authorized by this brief. Start with owned organic publication and
manual delivery; public automatic publishing is not implemented.

The current product's `services` model is only a proxy for a software subscription.
Its inquiry count, deal value and project capacity are not a SaaS activation/retention
model. Record this friction during normal onboarding; do not fill made-up service revenue
to make its goal calculator pass.

## First experiment

Hypothesis: a specific owner problem followed by one plan decision and a concrete next
action will attract more suitable, activated owners than a generic AI-content promise.
This first run establishes a baseline; it cannot prove a comparison without a second
variant and enough observations.

First content brief: **“What should a designer publish when there is no new finished project?”**
Show one decision from a plan, one explanatory post, and how to judge the next response.
Use a designer example labelled as an example, with no fabricated project testimonial.
Visual: the plan's objective, one next action and its evidence slot in the product's blue
and sun language. No stock-photo business owner or screenshot containing customer data.

Draft caption for review before publication:

> אין פרויקט חדש להעלות השבוע? עדיין יש לכם משהו מועיל להגיד.
>
> מעצבת יכולה להסביר החלטה מקצועית אחת: למה בחרה כיוון מסוים, למי הוא מתאים
> ומה כדאי ללקוח לבדוק לפני שמתחילים. הפוסט נובע מהמטרה בתוכנית, ולא רק מהצורך
> ״להעלות משהו״.
>
> בישראמארקט מתחילים בהיכרות עם העסק ובתוכנית שיווק. אחר כך בוחרים מה לקדם,
> מכינים תוכן ובודקים את הצעד הבא לפי המידע שיש.
>
> אפשר להתחיל בלי להירשם ולראות את הכיוון לעסק שלכם.

Destination: the verified live `/start` route, with distinct UTM source/medium/campaign/content
for each actual publication. The owned domain is still pending DNS/registry release at
this audit; use the current working deployment only after rechecking it. Do not insert
a guessed social profile or tell users the owned domain works before it does.

After the first review, two follow-up briefs:

- A plan decision: “More inquiries, or better-fitting projects?” Explain capacity and lead
  quality; show where an owner adjusts an assumption.
- A result decision: “People clicked, but did anyone contact you?” Explain what a link
  measures, what it cannot know, and what the owner should record next.

## Pass through the customer's actual journey

1. Verify the chosen customer identity and its active business. The app currently chooses
   the latest business and `from-draft` updates it. Never replace another customer's business
   or create a hidden database row to imitate a business switcher.
2. Complete `/start` as IsraMarket using truthful answers and unknown baselines. Save via
   the normal signup/login flow only after the account is safe for this business.
3. Record what the app recommended, where it used an assumption and whether its software
   service proxy distorted the plan. Compare the resulting plan with this brief.
4. Select only IsraMarket-owned accounts/assets in `/integrations`: its site Analytics
   property, Facebook Page, associated professional Instagram account, ad account/Pixel
   if available. Another customer's assets are not IsraMarket's marketing assets.
5. Verify each source with a real data read and timestamp. Configure site collection and
   consent before claiming that a Google account connection measures website activity.
6. Add real, non-sensitive brand/product materials, choose the offering and check voice.
   Generate and review the first post inside the product. Record any failed or onerous step.
7. Use the actual publishing kit. Publish to the confirmed owned destination, then save
   the public post URL and report publication. No social grant is proof a post went live.
8. Read the measured window, explain the finding in plain language, choose one next action,
   and update the plan. Retain the denominator and uncertainties with the conclusion.

## Instrumentation needed before useful evaluation

The site's root layout currently has no GA measurement tag. Connecting a customer GA4
property reads its data; it does not install tracking on this website. The general
measurement contract is in `docs/user-flows.md`.

Required pilot evidence:

- Property and web stream belong to IsraMarket, with a supplied measurement ID and a
  verified page/event signal under the site's consent choices.
- A tagged publication visit can be joined to pre-signup flow start and a saved plan
  without leaking answers or personal data into analytics properties.
- First useful source read and first generated/approved/reported-published post are
  independent states. OAuth success and clicking “connect” are not value delivery.
- Weekly return/action is deduplicated for a documented time window. Subscription and
  cancellation evidence comes from billing, not a landing-page estimate.

Dependencies remain: safe customer account, confirmed owned social assets, IsraMarket
Analytics collection, relevant provider approvals and the real publish/read cycle. Those
are open work, not completed by merging this brief or viewing the local flow-board sample.
