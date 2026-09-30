# Onboarding v2 — "build it together"

Owner feedback: "give me your website → get a post" is stressful. Why this post? What if
there is no website? What is the business? Who is the target? Onboarding should feel like
building the business's marketing portal together, step by step, and the landing page
should show examples instead of demanding a URL.

## Flow

**Landing (`/`)** — calm headline, one primary button "להתחיל" → `/start`. Below the fold:
a carousel of example posts for *fictional* businesses (never real brands), each with its
"למה הפוסט הזה" line. Log in and demo stay as quiet links.

**`/start` — a conversation, one question per screen**, no account needed. A live
**business card** ("העסק שלכם") fills in with every answer: side panel on desktop, a
compact pull-down summary on mobile. Answers live in a client-side draft
(`localStorage["isramarket_draft_v2"]`) until signup.

| # | Question | Input | Notes |
|---|---|---|---|
| 1 | איך קוראים לעסק? | text | |
| 2 | מה אתם עושים? | field chips (industries only, optional) + free text ("במילים שלכם") | fields = `BUSINESS_FIELDS` (`web/lib/businessFields.ts`, shared list in `businessFields.json`) |
| 3 | יש לכם אתר או אינסטגרם? | אתר / אינסטגרם / שניהם / עוד לא + the address/handle | site → background brand scan, the card updates when ready; "עוד לא" → pick a colour style (4–6 presets) |
| 4 | למי אתם מוכרים? | suggested audience chips (keep/edit/add), up to 3 | from `POST /public/audiences` |
| 5 | מה הכי חשוב לכם עכשיו? | one choice from `GOALS_BY_MODEL[business_model]` (`web/lib/businessModel.ts`) | existing goal keys; business_model is inferred from step 2 (products / services / both) and shown as a one-tap confirm |
| 6 | הנה מה שבנינו יחד | the card + audiences + **3 post ideas, each with why** | from `POST /public/ideas`; tap an idea to see it as a card |
| 7 | לשמור ולהמשיך | signup (email + password) | then `POST /onboarding/from-draft`, then budget → first month (existing flow) |

Every step: one primary button, a back link, fits one 390×844 screen, Hebrew per
`web/HEBREW-COPY.md`. Nothing is lost on refresh (draft in localStorage).

## Draft shape (client → API)

```ts
type OnboardingDraft = {
  business_name: string;
  business_type: string;              // a field key (food, fashion, …), see web/lib/businessFields.ts
  offerings: string;                  // free text, "what you do / sell"
  presence: "website" | "instagram" | "both" | "none";
  website?: string;                   // normalized later by the API
  instagram_handle?: string;          // without @
  style_preset?: string;              // when presence === "none" (or scan failed)
  audiences: { name: string; description: string }[];   // 0–3
  business_model?: "products" | "services" | "both";   // inferred at step 2, confirmable
  goal?: "sales" | "brand_awareness" | "leads" | "personal_brand";  // existing PrimaryGoal keys
  city?: string;
};
```

## Public endpoints (no auth, no DB writes, rate-limited like `/public/preview`)

`POST /public/brand` `{url}` → `{status: "ready"|"failed", brand: {business_name, palette:
[{hex, role, name}], voice, logo_url, offerings: [str]} | null, reason_he?}` — fast brand
only (reuses the preview scan + cache; see `preview.build_brand_preview`). Called in the
background at step 3.

`POST /public/audiences` `{draft}` → `{audiences: [{name, description, why_he}]}` — 3
suggestions from name/type/offerings (+ brand if scanned). Lite/cheap model, < 5 s.

`POST /public/ideas` `{draft}` → `{ideas: [Idea x3], brand: {...} | null}` where

```ts
type Idea = {
  title: string; format: "reel" | "carousel" | "image" | "story";
  hook: string; caption: string; cta: string; overlay_headline: string;
  why: { audience: string; goal_he: string; timing_he: string; reason_he: string };
};
```

`why.timing_he` uses the Israeli calendar (`services/calendar_il.py`) when a date is near;
`why.reason_he` is one plain sentence tying audience + goal + a concrete fact. Uses the
extract/strategy model and `HEBREW_STYLE`. Works with **no website** (from the answers
alone). Never invents numbers.

## Authenticated

`POST /onboarding/from-draft` `{draft, chosen_idea?: Idea}` → creates/updates the business
(name, type, model, offerings, website/instagram, goal, audiences, brand from the cached
scan or the style preset) and returns the same shape as `/onboarding/me`. Idempotent. The
existing budget step and month generation follow unchanged.

`PUT /onboarding/owner-context` `{differentiator?, seasons?: {busy, slow}, tried?: {channels,
what_worked?}, activity?: {instagram?, facebook?, tiktok?}, competitors?: [{name, link?}]}` →
same shape as `/onboarding/me`. The /start answers, edited later from `/decisions` ("מה
סיפרתם לנו"). Partial: a field not sent is kept; `seasons` and `competitors` replace,
`activity` updates only the networks named (`null` clears one), `tried.what_worked` is kept
when not sent. Validated with the draft's own models; a 422 carries a Hebrew `detail`
string. Only `owner_context` changes inside `scraped_profile_json`; competitors are also
written to `competitors_json` and (Instagram links) the peer list, as `from-draft` does —
a peer account that came from a removed competitor leaves with it.

## Ownership (parallel build)

| Part | Owns |
|---|---|
| Landing + examples carousel | `web/app/page.tsx`, `web/components/landing/*`, `web/public/examples/*`, example data |
| Conversation flow (web) | `web/app/start/*`, `web/components/start/*`, `web/lib/draft.ts`, `web/app/signup` (draft hand-off), redirects from `/onboarding` first-run to `/start` where appropriate |
| Onboarding API | `api/app/routers/public_onboarding.py` (new), `api/app/services/onboarding_draft.py` (new), `routers/onboarding.py` (`from-draft` only), `main.py` registration, tests |
| Preview fix (already running) | `services/scraper.py`, `services/brand.py`, `services/preview.py`, `routers/public.py`, `web/components/onboarding/*` |

## Revision 2 (owner feedback, same day) — supersedes the above where they conflict

1. **Social links.** Step 3 is "איפה אפשר למצוא אתכם?": אתר / אינסטגרם / פייסבוק / טיקטוק /
   עוד לא (multi-select). Draft: `links: {website?, instagram?, facebook?, tiktok?}` +
   `has_none?`. The business's own links are stored in `businesses.social_links_json` — not in
   `instagram_handles_json`, which holds competitor/peer accounts.
2. **Strategy is the heart, not post design.** Step 6 is "מה למדנו ואיך מתקדמים":
   (a) 3–4 research insights, each with an honest source; (b) exactly 2 strategic directions
   for the first month — the owner picks one (the main decision); (c) 3 post ideas for the
   picked direction, each with "למה הפוסט הזה". Endpoint `POST /public/plan-preview` →
   `{insights, directions, ideas (with direction_index), brand}`. `from-draft` takes
   `chosen_direction` and seeds the first month's strategy with it.
3. **Landing** tells a research → strategy → execution story; carousel examples show
   "מה גילינו" → "הכיוון לחודש" → a (smaller) example post.

## Revision 3 — the consultant interview

Owner: "think about this as the interview a business owner would do with a promoter to
decide if they are good for their business … build the plan together." `/start` is three
short chapters — **העסק** (name, what you do, what makes you different) → **הלקוחות**
(audiences, busy/slow seasons) → **איך אתם משווקים היום** (where to find you + how active
per network, what you've tried and what worked, competitors, goal) — then **מה למדנו ואיך
מתקדמים**. Most questions skippable. After each answer a one-line consultant reflection
(templated client-side) shows we listened. Draft adds `differentiator`, `seasons`,
`activity`, `tried`, `competitors`; `from-draft` persists all of it where the month
generation reads it.

## Next phase — strategy-first product (owner-approved direction)

- **Today** opens with this month's direction, what we learned this week, and the next
  decision; posts to approve come second, as execution.
- **Ongoing research** feeds the plan: competitors, search demand in Israel, calendar &
  seasons, the business's own results — plus the platforms the business uses and its site.
  Each finding is sourced and dated, and the plan says what it changed.

## Revision 4 — the end of onboarding is a strategy, built together (owner feedback 2026-09-30)

Owner: "the direction for the first month feels rushed — where is the strategy? what are
we after, where is the plan? how does the user affect it? only by picking A/B? what are
the metrics? why are we doing this?" and "the preview posts are very generic — they need to
be similar to what we will actually post, with placeholders to upload real product images."

The single reveal screen becomes four short screens (chapter "מה למדנו ואיך מתקדמים"):

1. **מה גילינו** — the sourced insights (as today), on their own screen.
2. **הכיוון** — the 2 directions (as today, richer "why"); pick one. Free-text "משהו אחר?
   ספרו לנו" is always available and revises the options.
3. **האסטרטגיה** — a one-page consultant strategy for the chosen direction, each block with
   a short "למה" tied to insights, and each block adjustable by the owner:
   | Block | What it says | How the owner shapes it |
   |---|---|---|
   | המטרה | the objective in one sentence | — |
   | איך נדע שהצלחנו | 2–3 measures, how each is measured, which are measurable today vs after connecting (honest) | optional own target ("כמה פניות נוספות בחודש ירגישו הצלחה?" — chips + free), never invented by us |
   | הזווית | the angle / positioning (from the differentiator) | — |
   | למי קודם | audiences with a primary one and the message for each | reorder / pick primary |
   | על מה נדבר | 3 content pillars, each with an example | swap/remove a pillar |
   | איפה וכמה | channels + realistic cadence for their activity level | cadence chips (1–2 / 3–4 / 5+ בשבוע) |
   | מה מבקשים מהלקוח | the offer / call to action and its mechanism (e.g. WhatsApp link) | — |
   | התוכנית | month 1 as 4 weeks (focus + calendar event) + months 2–3 in one line each | — |
   | על מה אנחנו מהמרים | 2–3 assumptions this month tests | — |
   Any change re-runs the strategy (debounced; only changed inputs), with a short
   "מה השתנה" note. "אפשר לשנות הכול אחר כך" is stated here.
4. **ככה זה ייראה** — 3 real posts for week 1, written by the same post writer the product
   uses (Muse via `post_model_router`, `HEBREW_STYLE`), rendered with the real card
   templates in the brand colours + logo, with caption, format and "למה הפוסט הזה". Each has
   a photo slot: the site's own photo when the scan found a usable one, otherwise a
   placeholder with a clear hint of what to shoot ("צילום של … על רקע בהיר") and small
   buttons **להעלות תמונה** / **לצלם עכשיו** (mobile camera) / **שה-AI ייצור** (later).
   Uploads before signup are kept in the browser (IndexedDB) and uploaded to the asset
   library right after signup, tagged to the post they were chosen for.
5. **נשמור את מה שבנינו** — signup, then `from-draft` with the full strategy.

### Contract additions

`POST /public/strategy {draft, direction: Direction, inputs?: {target?: string, cadence?:
"1-2"|"3-4"|"5+", primary_audience?: string, pillars_removed?: string[], feedback?: string}}` →
```ts
{ objective: {text_he, why_he},
  success: {owner_target?: string, measures: {name_he, how_he, available_now: boolean, needs_he?: string}[], first_check_he},
  angle: {text_he, why_he},
  audiences: {name, role: "primary"|"secondary", message_he}[],
  pillars: {key, title, description_he, example_he, why_he}[],          // 3
  channels: {network, role_he, cadence_he, why_he}[],
  offer: {cta_he, mechanism_he, why_he},
  month_plan: {week: 1|2|3|4, focus_he, event_he?}[],
  quarter: {month_label, direction_he}[],                                 // months 2–3
  assumptions: string[],
  changed_he?: string, cached: boolean }
```
`POST /public/sample-posts {draft, direction, strategy}` → `{posts: {title, format, hook,
caption, cta, overlay_headline, template, badge?, pillar_key, photo: {site_url?: string,
hint_he: string}, why: {audience, goal_he, timing_he, reason_he}}[3]}`.
`POST /onboarding/from-draft {draft, chosen_direction, strategy, chosen_posts?}` — the
strategy seeds the first month: the month plan follows its weeks, pillars, cadence and
measures; the sample posts become week-1 posts.
Both public endpoints: no auth, no DB, rate-limited and cached like `plan-preview`.

## Revision 5 — the product is the PLAN (owner feedback 2026-09-30) — supersedes Revision 4's artifact

Owner: "the product is the PLAN not the POST — we are not Canva, we don't give you
repetitive post templates, we BUILD A UNIQUE MARKETING STRATEGY for your own business."
"The WOW before the user enters the mail IS NOT THE POSTS — it is a marketing plan: how
will the next 3 months look? what is the strategy? what is the calendar? what posts are we
doing, where? do we start new marketing streams? with what budget? how are we measuring
(inform the user about the required integrations)? The user can edit it after login, but
they enter the site with an initial plan in place — that is the hook. The post editor and
generation are a tool inside."

### New questions in /start (chapter "איך משווקים היום" / new chapter "המטרה והתקציב")
- **תקציב שיווק משוער לחודש** — chips: "בלי תקציב פרסום, רק זמן" / "עד ₪1,000" / "₪1,000–3,000" /
  "₪3,000–7,000" / "מעל ₪7,000" / "עוד לא יודעים" + optional exact number. Explains in one
  line why we ask ("התוכנית נבנית לפי מה שאפשר באמת לעשות בתקציב הזה"). Budget moves here
  from the post-signup onboarding step (which is removed for /start businesses).
- **איפה אתם רוצים לגדול?** (products / both only) — "באתר (הזמנות אונליין)" / "בחנות" / "בשניהם".
- **מה ייחשב הצלחה?** — options depend on the model and the answer above, e.g. online shop:
  "יותר הזמנות באתר"; store: "יותר אנשים בחנות"; services: "יותר שיחות ופניות בוואטסאפ",
  "יותר פגישות/הזמנות מקום", "יותר טפסים באתר"; awareness: "שיכירו אותנו באזור". This
  becomes the plan's **main measure** (KPI). Optional own target number.
Draft additions: `budget: {range: "none"|"lt1k"|"1k-3k"|"3k-7k"|"gt7k"|"unknown", exact_ils?: number}`,
`grow_where?: "online"|"store"|"both"`, `success: {kpi: string (key), target?: string}`.

### The artifact: the 3-month plan (screens after "מה גילינו" and "הכיוון")
One scrollable, beautiful plan ("התוכנית שלכם ל-3 החודשים הקרובים") — the hook. Sections:
1. **האסטרטגיה בשורה אחת** + the angle and why (from insights).
2. **המטרה ואיך נמדוד** — the main KPI from "מה ייחשב הצלחה", 1–2 supporting measures;
   honest baseline ("עוד לא יודעים כמה יש היום — נמדוד מהשבוע הראשון"); for each measure,
   **which integration it needs** (Google Analytics, Meta Pixel, Google Tag/GTM, Search
   Console, Google Business Profile, WhatsApp tracked link — the last needs nothing) with a
   status (יש לכם / צריך לחבר / צריך להתקין באתר) and a one-line why. Links to the setup guide.
3. **הערוצים** — existing channels to strengthen + **new marketing streams to open** (e.g.
   Google Business Profile, Meta ads, Google Search ads, WhatsApp list, email, local
   partnerships, influencers), each with why, when it starts (month 1/2/3) and effort.
4. **התקציב** — split of the owner's budget per channel per month (a simple stacked bar /
   table), realistic per `cost_model` / `google_cost`; with "בלי תקציב" the plan is organic
   only and says what budget would unlock. Never invented results; costs are ranges with
   sources.
5. **לוח השנה** — 3 months on a timeline: key dates (calendar_il), campaigns/pushes, when
   each stream starts, checkpoints ("בסוף החודש הראשון בודקים…").
6. **התוכן** — per month: the content themes (pillars), cadence per channel (editable later),
   and 2–3 example post *titles* per month with the channel — no rendered post cards here;
   one line says "את הפוסטים עצמם נכתוב ונעצב יחד בתוך המערכת".
7. **על מה אנחנו מהמרים** — assumptions to test, and what we'll change if they're wrong.
Owner shaping before signup: direction choice + free-text feedback + primary audience +
cadence + target; everything else is edited after login. CTA: "לשמור את התוכנית ולהיכנס".
The sample-post screen with photo uploads (Revision 4 step 4) is **removed from onboarding**;
its components move to the app's post editor later.

### After signup
from-draft stores the plan; the app opens on it: `/strategy` (התוכנית) shows the 3-month
plan (quarter + current month), editable; Today shows this month's part of it; the first
month's posts are generated from it in the background.

### Contract
`POST /public/quarter-plan {draft, direction, inputs?: {target?, cadence?, primary_audience?,
feedback?, changed?: string[]}, insights?}` →
```ts
{ strategy: {one_liner_he, angle_he, why_he, from_insight?: number},
  kpi: {key, name_he, how_he, target?: string, baseline_he},
  measures: {name_he, how_he, needs: IntegrationKey[], available_now: boolean}[],
  integrations: {key: IntegrationKey, name_he, why_he, status: "have"|"connect"|"install"|"unknown", effort_he}[],
  channels: {key, name_he, kind: "existing"|"new", why_he, starts_month: 1|2|3, effort_he, cadence_he?}[],
  budget: {monthly_ils: number|null, months: {month_label, lines: {channel_key, ils_range: [number, number], note_he?}[]}[], organic_only: boolean, unlock_he?: string, sources_he: string[]},
  calendar: {month_label, weeks?: {week: 1|2|3|4, focus_he}[], dates: {date, name_he, action_he}[], checkpoint_he}[],   // 3 months
  content: {month_label, pillars: {key, title, description_he}[], cadence: {channel_key, per_week: string}[], example_titles: {title, channel_key, format}[]}[],
  assumptions: {bet_he, if_wrong_he}[],
  changed_he?: string, cached: boolean }
```
`IntegrationKey` = `"ga4"|"meta_pixel"|"gtm"|"search_console"|"gbp"|"meta_business"|"whatsapp_link"`.
`POST /onboarding/from-draft {draft, chosen_direction, quarter_plan}` — seeds `long_horizon_plan`
(the quarter), the first month (weeks, pillars, cadence, budget lines, KPI), and the
integrations checklist. `/public/strategy` and `/public/sample-posts` are superseded.
