# IsraMarket design library

First direction: **the business notebook**. Use the existing market-stall mark,
warm paper, ink, sage, a small sun accent, drawn routes and the owner's own words.
Product identity stays consistent; the business name, photos and content provide
personalisation. Keep those separate from the business's own publishing palette.

## Preview

- `/design`: foundations and an interactive first-post example. Change the business
  name, add the illustrated example photo, choose the writing tone and prepare a
  sample draft. All state stays in this page.
- `/motion`: nine motion assets, category filters, quiet/playful intensity and a
  manual reduction control. System reduced-motion preferences always win.

These routes have `noindex` metadata and do not appear in customer navigation.
They do not call application APIs. Copying the example post uses the real clipboard;
all other actions are explicitly local demonstrations.

## Use the components

```tsx
import { ActionButton, DesignScope, JourneyRail, NotebookHeading } from "@/components/design";
import { MotionResult } from "@/components/motion";

<DesignScope>
  <NotebookHeading eyebrow="הצעד של היום" title="נכין את הפוסט הראשון" />
  <JourneyRail label="הכנת הפוסט" steps={steps} />
  <ActionButton disabled={saving} onClick={saveDraft}>לשמור טיוטה</ActionButton>
  {saved && <MotionResult>הטיוטה נשמרה</MotionResult>}
</DesignScope>
```

Wrap a screen in `DesignScope`, or use `MotionScope` for motion alone. Components
keep native button, input and details semantics. `ActionButton` accepts normal
button props and a `primary` or `quiet` variant. Keep one primary action per screen.

`foundations.ts` owns the four semantic palette values; `DesignScope` writes them
as CSS variables. `primitives.module.css` owns type, spacing and component treatment.
`Motion.tsx` and `motion.module.css` own the reusable interaction assets. Galleries
are separate from the production primitives.

## Motion rules

- An illustration is decorative. Keep a visible, accessible result message.
- Set `active` on `MotionIllustration` after the action has actually succeeded.
  For `prepare`, set it while work is pending. Change `replayKey` for a new event.
- `MotionProgress` takes a real measured value from 0–100. It clamps invalid values.
  Use a waiting status when the backend cannot report progress.
- `MotionChoice` is a controlled toggle button using `aria-pressed`.
- `MotionResult` announces a confirmed result with `role="status"`.
- `MotionDisclosure` uses native details/summary. Keyboard access works before
  hydration, and opening the content adds a short reveal.
- No animation delays navigation or completion. Looping dots exist only during
  pending work. Success animations run once. Reduced motion shows final states.
- Forward points left in Hebrew. Layout uses logical margins and padding; progress
  grows from the start edge in RTL and LTR.

## Applying the direction

Start with the trial welcome screen, the next task, empty photo states and saving
feedback. Use a route only to explain actual steps, a note for a useful thought,
and the market-stall sunrise for a real milestone. Keep the existing UI-RULES.md
limits on actions, copy and density. The preview does not replace those screens.
