# IsraMarket: blue and sun

The marketing plan is the main artifact. The interface should help a business owner
understand the direction, its reasons, the measure, the next decision and what changes
when an assumption fails. Posts are a tool for executing that plan.

Product source: `docs/onboarding-v2.md`, revisions 5 and 8. The first-month sequence is
measurement → owner-selected products and materials → content → review and adjustment.
The UI must not invent product availability, profitability, baseline numbers or evidence.

## Live review

- `/design`: three areas — language, components, and transitions. Language opens with
  the storefront/sun anchor and three schematic palette choices. Components start with
  the plan; supporting examples appear on demand.
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
