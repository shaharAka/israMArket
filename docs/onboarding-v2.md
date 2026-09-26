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
| 2 | מה אתם עושים? | business-type chips + free text ("במילים שלכם") | types = `BUSINESS_TYPES` |
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
  business_type: string;              // one of BUSINESS_TYPES
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

## Ownership (parallel build)

| Part | Owns |
|---|---|
| Landing + examples carousel | `web/app/page.tsx`, `web/components/landing/*`, `web/public/examples/*`, example data |
| Conversation flow (web) | `web/app/start/*`, `web/components/start/*`, `web/lib/draft.ts`, `web/app/signup` (draft hand-off), redirects from `/onboarding` first-run to `/start` where appropriate |
| Onboarding API | `api/app/routers/public_onboarding.py` (new), `api/app/services/onboarding_draft.py` (new), `routers/onboarding.py` (`from-draft` only), `main.py` registration, tests |
| Preview fix (already running) | `services/scraper.py`, `services/brand.py`, `services/preview.py`, `routers/public.py`, `web/components/onboarding/*` |
