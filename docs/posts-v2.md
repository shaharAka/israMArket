# Posts v2 — every post is a step of the plan

Owner request (2026-10-01): treat post generation as a product feature, connected to the
plan, the suggestions and the analysis; smart and connected, explained simply to a
non-technical owner; pretty and actionable.

## The idea in one line

**A post is a small, measured step of the plan.** It knows what it is for, who it is for,
what the owner must add, and how we will know if it worked. After it is published it comes
back with what happened and what we learn, and the next post uses that.

## Revision 1 (owner, 2026-10-01): simpler

"Good direction, still a little complicated for a simple user. And we offer 3 versions of a
post, but we have a plan, so we already know what post to generate."

So:
- **One post, for the channel the plan chose.** No Instagram / Facebook / WhatsApp switch.
  Cross-posting is a quiet option at publish time ("אותו פוסט גם לפייסבוק"), never a choice
  up front.
- **One sentence of "why"**, not three questions: "בשביל הזמנות מראש לחנוכה, ללקוחות הקבועים."
- **One button that changes with the state:** `להעלות תמונה` → `לאשר` → `לפרסם` → (after
  publishing) `להדביק את הקישור לפוסט`. Editing the text or replacing the photo stay
  available as quiet secondary actions.
- **No suggestion box to decide on.** What worked is applied automatically when a post is
  written or rewritten, and the post says so in one line: "עודכן לפי מה שהצליח אצלכם: מחיר
  על התמונה".
- **Measurement appears only when there is something to show:** after publishing, "מה קרה"
  with the one number (vs. a similar post when we have one) and one line of "מה לומדים".

### The editor (revised)
- Top: breadcrumb (week + its focus), the post title, the state word.
- Left/right: the post preview for its channel · beside it, a short panel:
  1. the why sentence (+ "עודכן לפי…" line when it applies),
  2. what we need from you, only if anything (a photo of X / check the price),
  3. the one primary button for the current state; quiet links: לשנות את הטקסט · להחליף
     תמונה · להוריד,
  4. after publishing: מה קרה (one number + compare) and מה לומדים.

### The posts page (revised)
- Grouped by plan week ("שבוע 2 · הלקוחות הקבועים"), each post a row: thumbnail, title,
  channel icon, the state word, and after measuring a tiny result ("21 לחיצות").
- One filled button: the next thing that needs the owner.

### Lifecycle words (one vocabulary everywhere)
`מחכה לכם` (needs a photo or a fact) → `מוכן לאישור` → `אושר` → `פורסם` → `נמדד` (HEBREW-COPY: "אושר", not "מאושר"). Publishing does not require a link: "פרסמתי" marks it published; pasting the link stays optional (it adds Instagram reach); WhatsApp clicks are measured either way.

### Contract: new fields on each post (additive, old posts degrade gracefully)
| Field | Type | Meaning |
|---|---|---|
| `uid` | str | stable id (not the list index); used by UTM `utm_content` and the WhatsApp code |
| `channel` | `instagram`/`facebook`/`whatsapp` | the one channel the plan chose (= `primary_outlet`) |
| `plan_link` | `{goal, week, week_focus}` | goal = the month hypothesis in a few words |
| `mix_type` | MixType key | product / value / behind_scenes / social_proof / offer / community / seasonal |
| `why_line` | str | one sentence: "בשביל {goal}, ל{audience}." |
| `owner_needs` | `[{kind: "photo"|"fact", text}]` | empty = nothing needed |
| `measure` | `{metric, label_he, link_code}` | metric: whatsapp_clicks / site_visits / saves / reach |
| `results` | `{updated_at, value, compare?: {label, value}, whatsapp_clicks?, visits?, conversions?, reach?, saves?, matched_by}` or null | written by performance sync |
| `learning` | str or null | one line, after measuring |
| `informed_by_note` | str or null | "עודכן לפי מה שהצליח אצלכם: …" |
| `lifecycle` | `needs_owner`/`ready`/`approved`/`published`/`measured` | computed by the server |

## Engineering (what changes under the hood)

**Data on each post** (in the roadmap JSON; additive):
`uid` (stable id, not the list index) · `plan_link {hypothesis, week_focus}` · `mix_type` ·
`featured_item_id` · `owner_needs [photo|fact|none]` · `measure {metric, source, link_code}` ·
`results {period, whatsapp_clicks, visits, conversions, ig_reach, saves, matched_by}` ·
`learning` (one line) · `informed_by [post uids]`.

**Generation**
1. Fix the featured-items shape bug (`featured_items_from` must read `{"items": [...]}`).
2. The post prompt asks for `mix_type`, `measure`, `owner_needs` and returns them; plan link
   filled from the month hypothesis + the week's focus (not guessed).
3. A **"what worked so far" block** for every posts job and every rewrite (not only next
   month): per-post results of this business, best and worst, with the reason.
4. Rewrites get the plan card + results context, and accept one instruction
   ("להוסיף מחיר").
5. UTM `utm_content` and the WhatsApp source code use the post `uid`, so edits don't break
   matching; store the code on the post.

**Feedback**
6. `performance/sync` writes `results` back onto each post (GA4 attribution + Instagram match +
   WhatsApp clicks per post code).
7. Weekly: one "מה לומדים" line per measured post, and at most one suggestion for the next
   unpublished post (stored on that post, shown in the editor).
8. Hypothesis status writer: when a month closes, mark each hypothesis
   `confirmed / not yet / changed` with the evidence line (feeds Today and the plan).

## Phases

| Phase | Owner-visible result |
|---|---|
| **A. Connected posts** | Plan card on every post (why · who · what we need · how we'll know), lifecycle words, posts grouped by week with the mix strip, featured items bug fixed, stable uid |
| **B. Results on the post** | Results + "מה לומדים" in the editor and the list; WhatsApp clicks per post; the next post marked "עודכן לפי מה שלמדנו" |
| **C. Smart suggestion** | One grounded suggestion per post with a one-click targeted rewrite; rewrites with context; hypothesis statuses move |

### Phase C as built (Revision 1 applies: no suggestion box)
- **One-instruction rewrite.** The text step has quiet chips (`קצר יותר` · `להוסיף מחיר` ·
  `יותר חם` · `עם שאלה ללקוחות`) and "או במילים שלכם" (≤200). `POST /strategy/posts/rewrite`
  takes `instruction` (the old `tone` still works) and answers `{post, strategy, changed,
  message, instruction}`. The writer gets the plan link, why line, mix type, channel, measure,
  featured item, what worked, brand voice and HEBREW_STYLE. Money is decided by the server
  (`services/post_rewrite.py`): a price is known only when the owner typed, saved or approved
  it (`owner_prices`, `owner_fact_done`, the instruction, a featured item's note) or it is
  already in the post. `להוסיף מחיר` with no known price never reaches the writer: the post
  stays, asks "מה המחיר?" and says so. A new price becomes `[מחיר]` (and is asked about); a
  new discount, or a confirmed fact the new version dropped, keeps the old text.
  `rewrite_instruction` on the post drives "שונה לפי: …" until the text is saved or approved.
- **Hypothesis statuses** (`services/hypotheses.py`): the month's hypothesis, its targets and
  the 3-month plan's assumptions get `measuring / on_track / confirmed / not_yet / changed`
  and one evidence line, decided by rules (measured posts split by a visible trait, WhatsApp
  taps this month, the latest refresh's site and Instagram numbers, the targets' numbers);
  the cheap model may only re-phrase the line (same numbers, no cause). Written by
  `/performance/sync`, the weekly job and next-month generation (the month's last word,
  also handed to the next month's planner), stored as `hypothesis_review` beside the
  roadmap, and read as `strategy.hypothesis_review` (/strategy) and `trial.hypotheses`
  (Today). A tap is never confirmed as an order: a count that only stands for the target
  is at most on track.

Copy follows HEBREW-COPY.md; visuals follow DESIGN-STANDARD.md; word budgets in UI-RULES.md.
