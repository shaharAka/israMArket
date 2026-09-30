# IsraMarket design standard (finesse)

The bar is the landing page (`components/landing-v2`). Every screen should feel like the same
product: calm, precise, blue and sun, never "a template". This file is the checklist a page
is held to. It complements `UI-RULES.md` (one filled button, word budgets, honesty) and
`HEBREW-COPY.md` (copy). Where they overlap, those files win on content; this one on looks.

## 1. Colour: tokens only

Use the tokens in `app/globals.css`, never a hex in a class (`text-[#1d2940]` → `text-[var(--ink)]`).
Business artwork (post designs, brand swatches, logos) keeps its own colours.

| Role | Token | Use |
|---|---|---|
| App background | `--canvas` | behind everything |
| Surface | `--paper` | cards, sheets, inputs |
| Soft fill | `--soft` | a quiet inset panel, a hovered row |
| Text | `--ink` | headings, body, values |
| Secondary text | `--ink-soft` | descriptions |
| Muted text | `--ink-muted` | labels, captions, meta (still ≥ 4.5:1 on white) |
| Faint | `--ink-faint` | disabled, placeholders, non-text marks only |
| Lines | `--rule` / `--rule-dark` | dividers / input borders |
| Action | `--primary` / `--primary-dark` / `--primary-soft` | the one filled button, links, selection |
| Sun | `--sun` / `--sand` / `--sand-rule` / `--sand-dark` | highlights, "now", warnings |
| Good | `--good` / `--good-soft` / `--good-rule` | done, up, connected |
| Danger | `--danger` / `--danger-soft` / `--danger-rule` | errors, destructive |

Never pure black. Never more than one accent per component.

## 2. Type

- Heebo only. Weights **400 / 500 / 600 / 700**. No 800–900 (`font-black` renders 700).
- Page title: 28–32px, 700, `tracking-tight`. One per page. No eyebrow that repeats it.
- Section title: 17–20px, 650–700.
- Body: 15–16px, line-height 1.6–1.7, `--ink-soft` for descriptions.
- Labels and meta: 12–13px, 500–600, `--ink-muted`.
- Numbers: `tabular-nums`, 700, `tracking-tight`.

## 3. Shape, depth, space

- Radii: controls 10px, cards 14–16px, sheets and dialogs 18–20px, pills 999px.
  (`rounded` 8, `rounded-md` 10, `rounded-lg` 12, `rounded-xl` 14, `rounded-2xl` 18.)
- Depth instead of boxes: a card is `bg-[var(--paper)]` + `shadow-[var(--shadow-card)]`
  (a hairline ring plus a soft drop). Don't frame every row; divide lists with hairlines.
- No coloured top rules or side tails on cards. Emphasis = a soft fill (`--primary-soft`) or
  the sun dot, not a stripe.
- 8px rhythm: 4, 8, 12, 16, 24, 32, 48, 64. Sections breathe (32–48px apart).
- Content column centred in the space next to the sidebar, max 760–880px.

## 4. Components

- **Primary button** (`.drawn-button` / `UIAction` primary): blue, 44–52px high, radius 12px,
  600 weight, inset highlight + soft blue shadow, lifts 1px on hover.
- **Secondary**: white, 1px `--rule-dark` border, same radius, no shadow beyond 1px.
- **Text action**: `--primary`, 600, underline only on hover.
- **Inputs**: 46px, radius 10px, `--rule-dark` border, focus = primary border + 3px
  `--primary-soft` ring.
- **Disclosure**: a real chevron icon (`IconChevron`), never a typed ▾ ▸ or ›.
- **Status**: words first, a small dot second; pills only for real states.
- **Icons**: 18–20px, 1.6px stroke, `--ink-muted` unless active.

## 5. Motion

Short and purposeful: 160–240ms for UI, `cubic-bezier(.2,.7,.2,1)`. Things follow the user
(press, hover, reveal); nothing loops unless it is waiting. Respect reduced motion.

## 6. Checklist per page

1. No hex classes, no `font-black` look, no 4px corners.
2. One title, no duplicate eyebrow; one filled button.
3. Cards use depth, not frames; lists use hairlines.
4. Chevrons are icons; arrows point the RTL way.
5. Desktop 1440 and phone 390: no horizontal scroll, balanced whitespace, tap targets ≥ 44px.
6. Screenshot both before and after; compare with the landing page side by side.
