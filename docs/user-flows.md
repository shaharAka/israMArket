# Reviewable user flows

The shared visual review is `/design/flows`, linked from `/design` and [task #65](https://github.com/shaharAka/israMArket/issues/65).
This is a product review tool inside the app, available without signing in. It never saves
a business, grants access, generates content, publishes, pays or emits review analytics.
Examples of a shop and designer are fictional. The IsraMarket branch is a pilot proposal,
not a live business or measured campaign.

## How to review

1. Choose a shop, designer or IsraMarket, then before signup, after signup or returning use.
2. Pan and zoom the React Flow screen canvas. Use the minimap, +/- controls, fit-all or
   chapter focus selector. Arrowheads show the next screen; named arrows show branches;
   dashed lines lead to proposals. Screen positions can be dragged locally, and reset
   when changing journey/phase. This is not a shared Figma document or live multiplayer.
3. Select a thumbnail to inspect its larger screen and action beside the canvas. Six question screens reuse
   actual components with local answers. Sixteen nodes also have actual route captures from
   the synthetic bakery demo; exact OAuth, writing and publishing states remain schematic.
   Captures show a shared route, not proof of a distinct account or the exact workflow state.
4. Try its primary action, alternative branch and failure/cancel/missing-information case.
   The recovery example describes what the source supports; it is not a new API behavior.
5. Inspect saved state, the proposed improvement and measurement. The source disclosure
   links to the audited commit, and separately to the current app route.
6. Copy the permanent step link into a GitHub discussion. Record the observation, proposed
   change and success measure in #65 or the relevant linked issue. Browser notes are not a
   second shared task system.

Before signup, the map follows `STEP_ORDER` in `web/components/start/script.ts`; services
skip `grow`. After signup, the columns organize related actions and optional branches.
They do **not** mandate connecting every provider, or waiting a week between actions.
The sample walkthrough chooses one route so clicks can be rehearsed. The source inspector
describes conditions that route alone cannot show.

## Current source and branch conditions

Audit baseline: `1c037008fa932a9cd4781eb3428fd29fd2da7241`, 2 October 2026, with the
first-value onboarding follow-up on top. The inspector links to the follow-up implementation
revision. Maintain the
data in `web/lib/uxFlows.ts` when behavior changes; update the baseline only after checking
the mapped routes and conditions. The board is excluded from search indexing.

- `/start`: 13 answer/confirmation stages for products, 12 for services, followed by the
  research summary, plan and save (16/15 main-path stages total). Local draft until save.
  Research links and authorization to read account data are separate. Invalid or
  inaccessible links are excluded from research and retained for later correction.
- Save: Google or email/password, then `from-draft`. Delete the local draft only after
  successful persistence. Existing-account login and direct signup are separate entry branches.
- `/onboarding`: no business goes to `/start`; completed business to `/dashboard`; a named
  business with a saved start plan to `/strategy`. A legacy partial business can still see
  the older three-part completion form. This is not a business switcher.
- `/strategy`: saved plan first; month preparation happens in the background. The saved plan has
  one current next action. The three-card tour opens only through `?tour=1` from the account;
  dismissal is stored in the account.
- `/integrations`: actual connections UI. `/design/connections` is a guided UX prototype;
  account wiring and full source readiness are still #44 and #45. OAuth, choosing an asset,
  useful data arriving and publication rights are different states.
- Google: identity login is distinct from Analytics access and selecting a property.
  Meta: public customer access still depends on provider approval (#41). Pixel selection
  and receiving an event signal are distinct. Each business chooses its own assets.
- WhatsApp: short-link clicks, not messages sent or qualified inquiries. Google Business
  Profile: conditional owner checklist confirmation; API work remains #51.
- Foundations: services require one uploaded asset, one selected service and a saved
  style answer. Products/both/unknown retain three assets and three selected items.
  Explicitly saved unknown baseline answers count as answered, never as measured figures.
  Connections follow the saved plan; old accounts without a plan keep their fallback.
- Posts: editing, approval, manual publishing kit, then owner report of publication.
  `api/app/services/publish.py` does not call a social publishing API. A reported publication
  is not independent provider confirmation and does not prove a marketing result.
- Results: `/performance` and source snapshots; approachable findings remain #46. Decisions
  and a next-month loop exist; complete plan editing remains #48. Billing is a separate branch.

## Measurement proposal, not installed instrumentation

The event names in the inspector are a measurement contract to review. They do not start
tracking because this page exists. Use a stable flow/session identifier and, after login,
an internal business identifier. Allowed dimensions: step ID, business model, entry route,
provider type, previous/next step, duration, retry count and an enumerated outcome/error code.
Never send answer text, email addresses, access tokens, private URLs, customer messages or
portfolio contents as event properties.

- Before signup: step reached/completed, return-to-edit, unknown/skip, research retry,
  plan shown and account-save success. Measure abandonment against the preceding step,
  with separate store/service cohorts and unknowns preserved.
- Connections: authorization returned, asset chosen, first useful source read, empty data
  and retry outcomes. A successful callback alone is not activation.
- Content: foundations complete, post generated, edited, approved, publishing kit opened
  and reported published. Keep those independent; label owner versus provider evidence.
- Value: source finding understood, action selected, plan/post updated and subsequent
  observed result. Ask an owner to explain the recommendation in their own words.
- Retention: return in the next week and an actual action; subscription confirmed by the
  billing provider separately from pricing-page views or button presses.

A real funnel needs deduplicated events, a documented observation window and consent-aware
collection. Show numerator, denominator and missing data; do not create conversion rates
from the review examples.

## First review decisions

- Preserve the plan as the first value; ask for one useful next action after save.
- Explain why a connection helps *this* business before asking for authorization.
- Make cancellation and unknown data resumable. Name the missing access/asset/action,
  rather than telling a nontechnical owner only that a provider failed.
- Test whether service portfolios and an initial expertise post can shorten activation
  without pretending that no customer proof or measurement is needed.
- Keep findings tied to an understandable business outcome and one proposed action.

The first service wording correction is tracked in #67. The real customer pilot and its
remaining identity/asset/measurement requirements are tracked in #66.

## First useful publication

Setup groups are presented as readiness stages rather than calendar weeks. The free
account's 30-day period is unchanged. Existing usable content can be reviewed, an approved
first post can be published, and ready materials can start generation while other
connections remain unfinished. The guide prioritises that first content action when it
is actually available. After first publication, missing measurement is still shown.
The Posts page uses the real publishing queue to prioritise the first due publication
over approving the rest of the batch; future scheduled posts are not made due early.
This does not install tracking, grant consent, publish automatically or claim attribution.

## Optional first-look proposal (#69)

`/design/flows/shorter` is a review diagram, not a changed `/start` implementation. Following
the owner's feedback, full discovery remains the default. A quiet “just show me how it looks”
action offers three proposed input screens (business, initial customer, optional links)
followed by an explicitly provisional draft. It does not claim a verified marketing plan,
a calculated goal or connected analytics. No duration or conversion improvement is claimed.

The full map groups existing screens for readability: 3 business questions, 6 context screens
for shops / 5 for services, and 4 baseline/recommendation/budget/goal screens. These are groups,
not a claim that production onboarding has fewer screens. Summary, plan and save follow.
The quick route rejoins discovery without repeating answered questions; all remaining inputs
are needed before the full recommendation/goal. The review simulates navigation, not research,
saved answers or resumable account state. Adopting it requires explicit planner/state-contract
changes and meaningful regression checks. Owner preview approval is tracked in #69.

## Repeatable real-screen captures

Capture through the normal local demo UI using the authorised CUA browser. Do not reuse
a customer session, tokens, or private analytics. Start `/preview`, select the bakery and
choose “לראות את התוכנית”; then capture the actual routes below after their visible data
is settled. The atlas lives in `web/public/flow-screens/` and the node mapping in
`web/lib/flowScreens.ts`. Use the browser's screenshot API and write the returned PNG bytes
to those paths; do not manipulate the DOM, authentication or storage to fabricate a state.

Routes: `/`, `/login`, `/signup`, `/strategy?welcome=1` (plan), `/strategy?tour=1`
(optional welcome), `/dashboard`, `/integrations`, `/baseline`, `/featured`, `/assets`,
`/voice`, `/posts`, `/performance`, `/decisions`, `/strategy`, `/billing`. Capture the
editor by opening a demo post for review; do not approve or publish. Clear the local demo
through its visible exit control afterward.

Use one consistent desktop viewport and real app styling. Wait for the relevant heading
and populated state, then inspect the result: no loading skeleton, missing font or mid-enter
fade. Never label a generic route capture as an OAuth callback, a generated post or a
confirmed publication. Refresh affected captures whenever route UI changes and record the
date and synthetic persona in the mapping. The board displays exact unsupported states as
sketches until they have an authorised, reproducible capture. This recipe uses CUA rather
than a parallel headless browser driver to respect the current browser-control instructions.
