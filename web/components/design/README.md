# IsraMarket: blue and sun

The marketing plan is the main artifact. The interface should help a business owner
understand the direction, its reasons, the measure, the next decision and what changes
when an assumption fails. Posts are a tool for executing that plan.

Product source: `docs/onboarding-v2.md`, revisions 5 and 8. The first-month sequence is
measurement → owner-selected products and materials → content → review and adjustment.
The UI must not invent product availability, profitability, baseline numbers or evidence.

## Integration with Claude

Ownership agreed on 30 September 2026:

- Codex owns colors, typography, styles, CSS, motion, visual assets and shared UI components.
- Claude owns APIs, data, product flows, business rules and product copy.
- Future Codex edits must preserve Claude's handlers, payloads, persistence, generation,
  authentication and flow decisions. Presentation components should receive the data and
  actions supplied by Claude. Changes to behavior need to be handed back to Claude.
- Before each new design pass, fetch `origin` and check both the local integrated
  `ux-simplification` branch and `origin/ux-simplification` for new commits. Sync completed
  integration commits into `codex/motion-pool`; do not integrate individual running tasks.
- Claude first merges its three behavior tasks into `ux-simplification`, then merges
  `codex/motion-pool`, tests the complete flow, and handles PR #2. Resolve mixed files
  hunk by hunk, retaining Codex's presentation and Claude's behavior. A whole-file
  “ours/theirs” choice can discard either side's work.

The design worktree already contains local `ux-simplification` at `4ff09da`. Both that
branch and the fetched remote branch were checked when adopting this split; neither had
unmerged commits at that checkpoint. The visual implementation checkpoint is `8d1a085`.

### Existing behavior to review during integration

The earlier design requests produced some behavior changes before the ownership split.
They remain explicit handoff items for Claude; the design branch is not a CSS-only patch:

- `web/lib/api.ts`: `ensureDemoPlan` builds a stored quarterly plan for the explicit demo
  and includes it in mock business/current-strategy responses. No backend source or real
  API contract was changed.
- `web/components/AppShell.tsx`, `web/app/business/page.tsx`, `web/app/brand/page.tsx`,
  `web/components/BrandLink.tsx`: route ownership, calendar under the plan, brand utility
  navigation, existing logo display and brand refresh events. `/brand` replaces the deleted
  `BrandPicker.tsx` popup and saves the full brand draft explicitly through `saveBrand`.
- `web/components/posts/CalendarView.tsx`, `web/app/calendar/page.tsx`,
  `web/app/posts/page.tsx`: shared month/date selection, filters, active-plan post opening,
  dated quarterly actions, fallback business-plan loading, browser-local personal tasks
  with read/write protection, and manual copying after clipboard failure. Local tasks
  are a preview implementation, not a server-backed task service.
- `web/components/PostEditor.tsx`: direct photograph upload followed by asset attachment,
  validation, pending/error states and returned-strategy updates. Existing editing,
  approval and publishing handlers must be reconciled with Claude's final implementation.
  `web/components/posts/BottomSheet.tsx` also adds focus trapping and focus return.
- `web/components/start/StartFlow.tsx`: explicit `?mock=1` preview state and bypass of
  account-based redirects for that walkthrough. Keep Claude's real onboarding and auth flow.
- `web/components/plan/QuarterPlanView.tsx`, `web/components/start/StepQuarter.tsx`:
  folded supporting sections, abbreviated direction heading with the full statement
  preserved in the explanation, and a derived first action from integration status.
  Claude owns the final sequencing and prerequisite rules.
- `web/app/strategy/page.tsx`, `web/app/dashboard/page.tsx`: quarter/month selection,
  plan-first presentation, current-data fallbacks, and placement of execution/month-ahead
  actions. Keep Claude's final Today logic, generation triggers and setup gating while
  wiring them to the visual components.
- Existing page headings and instructional copy were also adjusted. Claude's final
  product wording takes precedence; design-library demonstration copy remains local.

For the complete file manifest at the implementation checkpoint, run
`git diff --name-status 4ff09da 8d1a085`. The principal shared surfaces are AppShell,
SetupChecklist, the dashboard/strategy/editor, QuarterPlanView, StartFlow and the goal,
plan and quarter steps. The integration must include these even when Git finds no
text conflict: a clean merge alone does not verify the behavior.

## Live review

- `/design`: language, components, results, and transitions. Language opens with
  the storefront/sun anchor and three schematic palette choices. Components start with
  the plan; supporting examples appear on demand.
- `/design/results`: an interactive recommendation component, using explicitly fictional
  bakery data. It leads with the business meaning and a prepared next step, rather than
  asking the owner to interpret a chart. Instagram interest, website measurements, a
  supplied page-audit observation and owner-approved business facts inform one proposed
  clarification to the order page and the planned post. Evidence, numbers, reporting
  periods and uncertainty live in a disclosure. Visits and paid orders are separate
  measures, not an assumed customer funnel. The owner can edit the prepared copy,
  copy it for manual website insertion, approve/reverse it locally and preview the post.
  All approval stays in React state; no site or account is changed. Sparse data retains
  the planned step. A missing source offers recovery and continuation with prepared work.
  `ResultsBrief` takes supplied observations and interpretations separately. This is the
  proposed experience, not a new working page-audit/connector service: authenticated
  Results data, APIs, OAuth, provider permissions and persistence are unchanged.
- `/preview`: entry to the existing application with explicit example data. The plan
  opens first. Onboarding is a separate `/start?mock=1` walkthrough.
- `/motion`: nine isolated motion assets, both moods and reduced-motion controls.

The blue palette is applied to product chrome in this branch. Gallery palette choice is
local and also applies to the explicit product demo and mock onboarding. A business's
publishing palette, post renderer and export artwork keep their own colors.

## Navigation and ownership

The four primary destinations are this week, the plan, posts, and results, on desktop
and mobile. The calendar belongs to the plan. Business settings live in `/business`;
the business identity in the shell links there. The paint-swatch icon opens `/brand`,
a dedicated page for the actual logo, publishing colors and writing style. It does not
open a popover. The design library belongs to `/preview`, outside the owner navigation.

`/brand` loads existing identity, uses a business initial when there is no saved logo,
and saves only after an explicit action. Failed saves retain the draft; successful
saves update the shell's logo and swatch icon. It preserves other brand fields.

## Reusable components

`Controls.tsx` exports native UIAction, TextField, ChoiceCard, SegmentedControl, UITabs,
ToggleField, FileField, UIDialog (modal/drawer), InlineNotice, StateBadge, EmptyState,
SkeletonBlock and TransitionPanel. UIAction and TextField are used in real onboarding;
UIAction backs the application Button. The plan uses SegmentedControl and TransitionPanel.

`PlanBrief.tsx` exports the direction/measurement/decision brief used on the weekly home,
and HypothesisNote used in the plan's assumptions. HypothesisNote displays supplied
evidence only; it does not infer confirmation from traffic or post approval.

`BusinessOverview.tsx` supplies a compact, responsive row for connection statuses,
post statuses and the plan's main measure, with an optional sourced bar figure. It is
presentation only: callers supply real statuses, labels, dates, figures and actions.
An approved post is not assumed published, a discovered tracking tag is not assumed
connected, and absent analytics never become zeroes or a decorative growth curve.
The landing uses existing fictional plan data and explicitly labelled planned budget
ranges. Each example uses its own supplied business palette for the header, reasoning,
months, status marks and figures; the surrounding website retains its blue/sun palette.
The finding and the hypothesis are visible on the card. Deeper detail uses a labelled
"לראות את התוכנית המלאה" disclosure, rather than relying on a plus icon.
`/design` shows a separately labelled design fixture with weekly order counts and follows
the library's selected palette.
Wiring this component into the owner's plan/dashboard belongs to Claude's flow work;
use authenticated integration and publication state, not pre-signup plan assumptions.

`MetricComparison.tsx` compares one supplied metric across named posts. It keeps measured
zeroes and missing readings distinct, with visible values, units, source and period. The
results screen supplies its existing per-post attribution and ranking; it does not add a
timeline, forecast, rate or evidence not already returned by the API. The library fixture
includes a positive count, a measured zero and a missing reading.

The first-entry welcome keeps its existing three steps and server completion. Its visual
hierarchy leads with the plan, and its modal now contains keyboard focus and restores it
on close. Connection guides use the shared blue/sun tokens, compact corners and reduced
motion on both desktop drawers and phone sheets. Connection state, resource selection,
provider consent and post-generation prerequisites remain Claude's behavior contract.

Primitives also provide headings, notes, journey rails, photo states and status lines.
The motion package supplies measured progress, drawn checks and contextual feedback.
`SunProgress` receives the actual post approval count or onboarding chapter.

`Storefront`, `SwatchFan` and `BusinessLogo` provide the shared brand drawings and actual
business identity. `EditorIcon` supplies one icon geometry across the editor tools.
`PhotoPlaceholder` shows a soft empty image with clear choose/upload guidance. Photo
upload attaches the returned asset and reports success only after both endpoints finish.

`CalendarView` is shared by `/calendar` and the posts calendar. It supports keyboard
date selection, month navigation, post/task/event filters and a selected-day inspector.
Only dated plan actions appear as plan tasks. Personal tasks are explicitly browser-local,
with separate storage for the demo and each active plan; storage failures stay visible.

## Hierarchy and geometry

One filled primary action. Plain text statuses; no decorative pills, colored panel tails,
or a card around every paragraph. Hairline dividers separate real lists. A short colored
edge and restrained offset paper shadow give the plan character. Supporting examples
and explanations live behind disclosures.

Four-pixel corners for controls. Most tap targets are at least 44px. Spacing follows
4/8/12/16/24/32/48px. Content is aligned for RTL, with logical edges and readable Hebrew.
A heading leads; source, caveat and rationale stay accessible with their related content.

## Behavior contract

- Buttons react immediately; busy actions disable repeated submissions and retain labels.
- Errors are linked to fields and announced; labels remain visible while typing.
- Tabs use one keyboard stop, arrows in visual RTL order, Home/End and a labelled panel.
- Native dialogs contain focus, close with Escape and return focus to the trigger.
- File selection is distinct from an upload. Design-library file examples stay local;
  the product editor's explicit upload sends the selected photograph to the asset API.
- Clipboard feedback waits for success; failure offers manual copying.
- Approval and save feedback follow endpoint completion. Sun approval progress uses
  returned data. Nothing delays navigation for an animation.
- Progress reflects known values. Unknown duration uses pending dots or a skeleton.
- Plain badges communicate status with words, not color alone.

## Transitions

Quiet: press 160ms, content fade 180ms, dialogs 200–240ms.
Playful: a restrained press and paper arrival at 420ms, drawn choice confirmation.
Sun progress: continuous 1800ms movement; completed milestone rays follow the rise.
Sending: forward trajectory, one exit, then a delivery mark after real success.
There are no idle celebration loops. Loops are reserved for actual waiting.

System and manual reduced motion show final results without travel, bounce or shimmer.
The result message always remains available to assistive technology.

## Scope and validation

This preview preserves current application APIs and account flows. Revision 8's full
weekly foundation gating, structure-only generation and evidence-linked hypothesis
tracking still require product/backend implementation; this UI does not fake them.
The demo adds a stored quarterly plan via the existing explicit mock-plan builder.

Verified with typecheck, lint, production build, and browser interaction checks:
RTL keyboard tabs; dialog focus/Escape/return; validation; retry and pending states;
manual/system reduced motion; real UI saves/approval using demo endpoints; clipboard
success and failure through injected test outcomes; desktop/mobile overflow checks.
Also checked all three demo palettes, calendar interaction and personal task persistence,
compact onboarding plan/caveats, editor upload/attachment, and brand save success/failure
using intercepted API responses with an existing logo.
Live-account content and backend writes were not exercised during this design review.

## Product screens in the public feature preview

The homepage and `/design/business` switch between Research, Plan, Posts and Results.
Business-role choices are neutral page links with one blue selected state. Product features use standard pressed
buttons beneath the product view, rather than a second tab bar. Inactive views are inert
and hidden from assistive technology; a shared grid reserves their height so feature
selection does not move the controls. Posts opens the native artwork, with its list
available from the back action. The hero scales the same views into a stable-height player;
`/design/business` keeps the full-size rendering. Reduced motion disables the reveal.
`MonthPlanOverview` is extracted from the real `/strategy` month view, including
hypothesis review, weekly disclosures and owner requests. The page still owns trial
routing, month building and API callbacks; it passes those actions as slots.
`PostWorkspace`, `PostPreview` and `PostActionPanel` are used by the real `PostEditor`
and the read-only public post view. Artwork uses the actual `CardStage` renderer.
The list uses `PostFeed`, and findings use `FindingCard`. Public fixture links stay
inside `/design/business`, including opening a post in another tab.

Fixture data is isolated in `landing-v2/productFixtures.ts`. It never enters demo mode,
reads a customer account, calls a provider or approves/publishes a post. The public
preview shows selected product views, not the authenticated shell or all editor tools.
Generic illustrative-data and fictional-customer captions are removed. Actual missing
measurements, analysis limits and integration readiness remain part of the product UI.
Final marketing recordings should follow review of the internal screens.

Hero playback cycles research → plan → posts → findings every 8.5 seconds. An original SVG hand
opens an actual weekly disclosure, local post and finding evidence. It only targets
these read-only fixture controls. Scrolling and feature selection keep playback running; the explicit play/pause control stops it. Keyboard focus within an interactive product view temporarily holds playback until focus leaves. Offscreen/hidden pages suspend timers,
and reduced-motion preferences disable autoplay and the hand. Timers clean up on each
stage, pause and unmount. The active screen is measured with ResizeObserver and scaled to fit the player, including expanded content; no automatic page or panel scrolling is needed. Cursor space is reserved beneath it.
The full-screen design preview remains manual. Landing headers embed the existing native
language selector beside login/start, with its accessible label retained but visually hidden.

Public shell palette: paper, ink, neutral surfaces and the existing blue interaction accent.
The full-name wordmark is monochrome; CTAs use ink. Business-specific colors belong
inside artwork and real product content, not separate colors for each navigation option.

`/design/identity` compares four typography-led full-name wordmarks in large, small and reversed settings, with an opt-in landing-page header preview. It removes the sun and stacked initials; alternate font studies remain selectable in the workshop.

The October 8 value pass uses `ResearchInsights` in both onboarding and the public tour.
`FeatureStory` groups research and planning with large native component views; `LearningBridge`
shows source categories feeding a finding, without adding incompatible metrics together.
The post gallery shows artwork directly, with only motion controls remaining. Interview/research/plan, posts and learning each use a separate feature group and a restrained canvas tint. Feature selections cycle while visible; every motion artwork has its own continuously looping player and explicit pause control. Reduced motion keeps them static. Connector
pages lead with benefits and actual app captures; provider eligibility remains visible and
setup instructions live below the value sections. Shared Rubik/Inter/Arabic fonts, ink
primary actions, neutral surfaces and blue interaction states now apply to onboarding and
signed-in screens. The identity workshop contains typography-only directions.

Landing business choices are consumed once by `applyLandingBusinessRoute`. Existing owner answers survive; changing route clears derived goals/plans and returns to the relevant questions. The confirmed route is collapsed to a change link. Verify this with `node web/scripts/test-landing-business-route.mjs`. Nonprofit remains gated until its dedicated route is ready.
