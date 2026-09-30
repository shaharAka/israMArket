# IsraMarket: blue and sun

The marketing plan is the main artifact. The interface should help a business owner
understand the direction, its reasons, the measure, the next decision and what changes
when an assumption fails. Posts are a tool for executing that plan.

Product source: `docs/onboarding-v2.md`, revisions 5 and 8. The first-month sequence is
measurement → owner-selected products and materials → content → review and adjustment.
The UI must not invent product availability, profitability, baseline numbers or evidence.

## Live review

- `/design`: plan brief first, then an interactive component library, transitions,
  and collapsed foundations/product examples. Palette and motion settings are behind
  a disclosure. There is one leading example per category.
- `/preview`: entry to the existing application with explicit example data. The plan
  opens first. Onboarding is a separate `/start?mock=1` walkthrough.
- `/motion`: nine isolated motion assets, both moods and reduced-motion controls.

The blue palette is applied to product chrome in this branch. A business's publishing
palette, post renderer and export artwork keep their own colors. Gallery palette choice
is local; the application does not read it. The branch is a local design preview.

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

## Hierarchy and geometry

One filled primary action. Plain text statuses; no decorative pills, colored panel tails,
shadows as hierarchy, or a card around every paragraph. Hairline dividers separate real
lists. Supporting examples and explanations live behind disclosures.

Four-pixel corners for controls. Most tap targets are at least 44px. Spacing follows
4/8/12/16/24/32/48px. Content is aligned for RTL, with logical edges and readable Hebrew.
A heading leads; source, caveat and rationale stay accessible with their related content.

## Behavior contract

- Buttons react immediately; busy actions disable repeated submissions and retain labels.
- Errors are linked to fields and announced; labels remain visible while typing.
- Tabs use one keyboard stop, arrows in visual RTL order, Home/End and a labelled panel.
- Native dialogs contain focus, close with Escape and return focus to the trigger.
- File selection is distinct from an upload. Library files are never sent to a server.
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
Live-account content and backend writes were not exercised during this design review.
