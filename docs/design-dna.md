# Design DNA — every business gets its own visual character

Owner (2026-10-01): "We can't have generic templates that all look like a Canva template with
AI slop, so that everyone sees them and knows they were generated via IsraMarket. They must be
unique even when many businesses are the same kind."

## Why posts look generic today (from the designer map)
1. One renderer, 6 fixed layouts, identical spacing/badges/chips/gradients; only colours vary
   (`web/components/CardCanvas.tsx`, `web/lib/cardTokens.ts`).
2. One font for everyone (Heebo 900); the site's own fonts are scraped and ignored.
3. Image prompts carry bakery wording and the same lighting phrases for every business
   (`api/app/services/designer.py:83,91`, `api/app/services/images.py:147-151`).
4. The logo is missing from the editor card and the PNG export, and from every image prompt.
5. Real photos are wasted: auto mode reuses the first site photo; owner uploads and Instagram
   images are never used as references; references are unlabelled.
6. Editor presets promise looks the renderer can't draw.

## The fix: a Design DNA per business, generated once, kept consistent, unique by construction

A **Design DNA** is a small structured identity stored on the business (`brand_dna`), derived
from the business's own signals (logo, site screenshot, its fonts, its photos, its Instagram,
its field and voice) and checked for distance from other businesses in the same field.

| Gene | Options (a library, combined parametrically) | Comes from |
|---|---|---|
| **Type pair** | ~14 Hebrew families × weights (e.g. Frank Ruhl Libre, Noto Serif Hebrew, David Libre, Bellefair, Suez One, Secular One, Rubik, Assistant, IBM Plex Sans Hebrew, Heebo, Varela Round, Karantina, Amatic SC, Playpen Sans Hebrew) — display + text | the site's own fonts first, then personality |
| **Colour system** | the brand's roles + derived tints, contrast-checked; text colour on photos per DNA (not always white) | logo + site + photos |
| **Composition grammar** | ~12 primitives (full-bleed photo, inset frame, split, type-led, stacked bands, corner tab, arch window, circle crop, ticket, grid collage, handwritten note, editorial column) × alignment × text position × scale | personality + format |
| **Signature motif** | one recurring graphic drawn from the logo/field: stripes, arches, dots, scalloped edge, grain, stamp, underline stroke, tape, thread line | logo shapes + field |
| **Brand signature** | how the logo/name sits on every post (corner mark, footer band, stamp, tab) | logo |
| **Photo direction** | lighting, colour grade, angle, props, background — written for THIS business (no shared stock phrasing) | its own photos + field |
| **Copy treatment** | headline scale, weight, case of accents, where the price/CTA lives | voice |

**Unique by construction**
- A per-business seed picks within what the signals allow.
- A distance check against other businesses' DNA in the same field (type pair, motif,
  composition set, palette distance): if two bakeries come out too close, the second one's DNA is
  regenerated with the close genes excluded.
- No shared house style: no IsraMarket watermark, badge or gradient that repeats across
  businesses.

**Consistent within a business**
- Every post of a business uses its DNA: same type pair, motif, signature and photo grade,
  with 3–4 compositions rotating so the grid looks designed, not repeated.

**Photos: real first**
1. The owner's own photos (uploads, Instagram, site), chosen per post by subject — not always the
   first one.
2. AI *editing* of those photos (relight, clean background, crop, grade to the DNA) with the photo
   as a labelled reference, keeping the product faithful.
3. AI generation from scratch only when no photo exists, with the DNA's photo direction and a
   field-specific art direction; never fake text, never people's faces as a default.

**Owner-facing (simple)**
- On the brand page: "הסגנון שלכם" — the DNA shown as 3 sample posts, with one action:
  `לנסות סגנון אחר` (regenerate within the same signals) or `לשמור`.
- In the editor, the design step offers 3 compositions of the same DNA, not generic presets.

## Phases
| Phase | Result |
|---|---|
| **D1. DNA + renderer** | `brand_dna` per business (generation + uniqueness check), parametric CardCanvas (fonts, motif, signature, compositions), logo on every post and in the export; brand page "הסגנון שלכם" |
| **D2. Photos real-first** | per-post photo choice from the owner's library/Instagram/site; AI edit of real photos as default; field-specific art direction; model per task from `docs/image-models.md` |
| **D3. Variety & check** | composition rotation per business, same-field distance check, a visual QA script that renders N businesses side by side |

## Model routing (from docs/image-models.md, 2026-10-01)
- Generate from scratch: `gemini-3.1-flash-image` (Nano Banana 2) at 1K — matched Pro at half the price.
- Edit / improve the owner's real photo: Muse Image edits (`/v1/images/edits`, $0.01) → fallback Nano Banana 2 with the photo as a labelled reference (Muse refuses some categories, e.g. lingerie generation).
- Drafts while the owner waits: `gemini-3.1-flash-lite-image`; background drafts: Muse.
- Retire `gemini-2.5-flash-image`. Keep `gemini-3-pro-image` only as an explicit "best" option.

## Contract: `brand_dna` (stored on the business; versioned)
```json
{
  "version": 1, "seed": 41827, "created_at": "…", "field": "bakery",
  "type": {"display": "frank-ruhl-libre", "display_weight": 700, "text": "assistant", "text_weight": 500,
           "headline_case": "sentence", "scale": "large|medium|editorial"},
  "colors": {"ink": "#…", "paper": "#…", "accent": "#…", "accent_2": "#…", "on_photo": "#…", "tint": "#…"},
  "compositions": ["arch_window", "editorial_column", "ticket", "split"],
  "motif": {"kind": "scalloped_edge|stripes|arches|dots|grain|stamp|underline|tape|thread", "color": "accent", "density": "low|mid"},
  "signature": {"kind": "corner_mark|footer_band|stamp|tab", "use_logo": true},
  "photo": {"grade": "warm film, lifted blacks", "light": "…", "angle": "…", "props": ["…"], "background": "…",
            "never": ["…"]},
  "copy": {"price_style": "tag|inline|circle", "cta_style": "underline|pill|arrow"},
  "rationale_he": "…one line for the owner…",
  "distance_checked_against": 7
}
```
Fonts are a fixed, licensed (Google Fonts, OFL) library with Hebrew support; the web loads only the
business's two families. Composition and motif keys are the renderer's library (≈12 compositions,
≈9 motifs, ≈4 signatures); the server only picks keys the renderer knows (`/brand/dna/library`).
