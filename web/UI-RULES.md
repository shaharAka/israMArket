# UI rules for IsraMarket

The owner is a small-business person, not a marketer and not technical. They open the
app between customers. Every page competes with their actual work, so the burden is on
the page to be scannable, not on them to study it.

These rules came from measuring the app rather than from taste: a page audit counted
screens of height, words, bordered blocks and competing primary buttons. `/decisions`
went from 3.7 screens and 891 words to 1 screen and 69 words by following them.

## 1. One primary action per page

A page gets **exactly one** dark filled button. That is the thing we are asking for.

Everything else — and there is always something else — is a **link**, a **quiet outline
button**, or lives inside the row it belongs to. Two dark buttons of equal weight is the
single most common failure in this codebase: the owner cannot tell what we want.

If two actions genuinely compete, one of them is not a page-level action. Demote it.

## 2. Scannable first, detail on demand

A page should be understandable in one pass without scrolling where possible.

- Lead with the conclusion, not the reasoning.
- Explanation, caveats, method and sources go behind an expand — not inline above the
  thing they explain.
- Target **1–1.5 screens** for a normal page. A dashboard or an editor may reach 2.
  Anything past 2 screens needs a justification.

## 3. Fewer boxes

A border per block turns a page into a grid of equal-weight rectangles, and nothing has
priority. Prefer, in order:

1. A single container with **hairline dividers** between rows.
2. A heading and whitespace.
3. A border, only when the block is genuinely a separate object (a card, a preview).

Aim for a handful of bordered boxes per page, not fifteen.

## 4. Plain Hebrew, no unexplained jargon

The audience does not know what ROAS, CPC, CPA, CTR, UTM, OAuth or SEO mean, and should
never have to learn.

- If a term is genuinely needed, explain it in a short clause the first time.
- Prefer the concrete over the abstract: "כמה עולה להביא לקוח" over "CPA".
- Never leave an English acronym standing alone in a heading.

## 5. Numbers keep their honesty, but not all at once

This product refuses to invent figures — ranges stay ranges, and a missing number is
stated rather than faked. That discipline stays.

But honesty does not require showing everything simultaneously. Lead with the one number
that answers the owner's question; the rest belongs one level down.

## 6. Every control says what it does

No icon-only buttons without an accessible label and a tooltip. No "המשך" without a
subject. A button the owner has to guess at is a button they will not press.

## 7. Word budget per page

Height and box count are not enough. A page can be one screen tall and still be a wall of
prose — `/plan` was cut from 1.5 screens to 1.1 and stayed at 300 words, and the owner
still called it overwhelming.

Measured as `main.innerText`, which already excludes anything inside a collapsed expand.
The reference is `/decisions`, the page the owner called good:

| page | ceiling |
|---|---|
| `/decisions` | **69** — the reference, do not exceed |
| `/assets`, `/integrations`, `/calendar`, `/performance`, `/plan`, `/strategy` | **140** |
| `/dashboard` | **150** |
| `/posts` | **160** — an editor is inherently denser |
| `/promotion` | **200** — it carries real published figures, which are the one thing worth words |

**Measure against a real account, not only demo mode.** These ceilings were first
calibrated in demo mode, and demo fixtures are shorter than real generated content:
`/posts` measured 149 in demo and **194 on a real account with eight real posts**, so a
page can look on-budget while the owner is reading something twice as long. Demo mode is
also the reason a stale backend went unnoticed for a whole session — it serves fixtures
client-side and never touches the API. Worth checking both.

When a page is over budget the answer is almost never to delete information. It is:

1. Move the explanation behind the expand that already exists.
2. Cut the sentence that restates what the control next to it already says.
3. Shorten labels — a row called `תקציב חודשי` does not need a note explaining that it is
   the monthly budget.
4. Delete the "why this matters" line when the item itself is self-evident.

What is never allowed: dropping a caveat, a warning, a source, or a "we cannot measure
this" statement to hit the number. Those are the product's honesty and they stay visible.
