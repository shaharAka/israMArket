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

## Model routing (from docs/image-models.md, 2026-10-01; owner decision: Muse for both tasks)
Implemented in `api/app/services/image_routing.py`; every attempt is a row in `image_usage`
(provider, model, outcome, fallback reason, estimated cost) and the post records
`image_provider`, `image_model`, `image_fallback_reason`, `image_cost_usd`.

| Task | Default | Fallback (automatic) |
|---|---|---|
| Generate from scratch (no matching photo of the owner's) | Muse Image `/v1/images/generations`, $0.01 | Nano Banana 2 (`gemini-3.1-flash-image`, 1K, ~$0.068) |
| Edit / improve the owner's real photo | Muse Image `/v1/images/edits`, $0.01 | Nano Banana 2 with the photo as a labelled `REFERENCE PHOTO 1` |

- The fallback runs when Muse refuses (`400 content_policy_violation`, e.g. lingerie
  generation), errors, or does not answer within `MUSE_IMAGE_TIMEOUT_SECONDS` (45 s). A
  refused or failed Muse image is not billed, so a post never pays for more than one image.
- A failed edit (Muse and the fallback) keeps the owner's photo as it is: the real photo is
  never lost.
- Settings, switchable without code: `IMAGE_GENERATE_PROVIDER=muse|gemini`,
  `IMAGE_EDIT_PROVIDER=muse|gemini`, `IMAGE_FALLBACK_MODEL` (default
  `gemini-3.1-flash-image`, empty = no fallback), `GEMINI_IMAGE_MODEL` (default
  `gemini-3.1-flash-image`; `gemini-3-pro-image` stays selectable as the "best" option),
  `GEMINI_IMAGE_SIZE` (default 1K), `MUSE_IMAGE_MODEL` (`muse-image-1.0`).
- Never a `-contributor` Meta model (refused before any request).
- `gemini-2.5-flash-image` is retired: a setting that still names it is read as Nano Banana 2.
- Not built yet: drafts while the owner waits on `gemini-3.1-flash-lite-image`.

## Photos real first (implemented: `api/app/services/photo_choice.py`)
Per post, the owner's photo that best matches its subject: the photo library (description +
tags), Instagram (captions), the site photos kept at the scan (alt text, file name). Local word
matching, Hebrew-aware, no model call. A photo the month already used counts against itself; a
post that names a product no photo shows gets a generated image instead of the wrong photo.
`image_source` stays in the editor's vocabulary (`asset` for a library photo, `real_photo` for a
site or Instagram photo, `generated`, `none`, `pending`); `image_origin` is
`library | instagram | site | generated`, `image_match` is `subject | rotation`,
`image_edited` says whether the photo was edited by a model.

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

Server notes (`api/app/services/design_dna.py`, `dna_library.py`):
- `display` and `text` are always two different families (the owner may pick one family for
  both by hand). Weights are ones the family ships; text weights stay 300–600.
- `headline_case`: `sentence | upper`, applies to Latin letters only (Hebrew has no case).
- `motif.color` is a colour role: `accent | accent_2 | ink | tint`.
- `ink` on `paper` is at least 4.5:1. `on_photo` is very light or very dark.
- Two additive keys: `source` (`model`, or `local` when it was built without the model) and
  `locked` (genes the owner set with `PUT /brand/dna`: `type`, `motif`, `colors`; `all` = the
  owner pressed `לשמור`, so a re-scan leaves the style alone).
- Uniqueness: distance = 0.30 type pair + 0.15 motif + 0.10 signature + 0.20 composition set
  (1 − Jaccard) + 0.25 palette (mean Lab ΔE of paper, ink, accent, accent_2 / 50). Below 0.4
  against another DNA in the same `field`, or the same type pair + motif as any DNA at all, the
  close genes are excluded and the model asked again (3 calls at most), then the close genes
  are moved apart locally. `distance_checked_against` = the number of other DNAs compared.

Endpoints: `GET /brand/dna/library`, `GET /brand/dna` (built on the first read), `POST
/brand/dna/regenerate` (`לנסות סגנון אחר`, billing-gated), `PUT /brand/dna` (type, motif,
colours, `keep`). Also (re)built in the background, after the response, by `/onboarding/scan`,
`/onboarding/from-draft`, `/onboarding/brand` and `/onboarding/palette` (`DESIGN_DNA_ON_SCAN`);
a style the owner kept is left alone, and genes the owner set stay.

## Contract: a post's `design` (implemented: `api/app/services/post_design.py`)
```json
{"composition": "arch_window", "crop": "4:5", "text_position": "bottom"}
```
- `composition`: one of the DNA's compositions, rotated across the month so neighbours differ;
  a product post never gets `type_led`; `editorial_column` is feed-only.
- `crop`: `9:16` for a reel or story, else `4:5`.
- `text_position`: `top | center | bottom | start | end` (start = the reading start, the right
  edge in Hebrew), one the composition allows (`/brand/dna/library`).
- Old posts keep `overlay_theme`; every read maps it: lower_editorial → full_bleed/bottom,
  split_panel → split/bottom, framed_inset → inset_frame/bottom, cover_type → full_bleed/top,
  promo_ribbon → stacked_bands/top, type_hero → type_led/center. New posts get no
  `overlay_theme`. `serialize_strategy` also returns the business's `brand_dna`.

---

# Revision 1 (2026-10-02): art direction, not parameters

Owner, after seeing the first renders: keep the logo; align the style with the logo and the
website's palette; "I don't want styling to be described as the position, crop and colour of a
stroke"; judge the posts as a designer and as a customer.

## The verdict on D1 (Claude, as design owner)
- **What works:** three bakeries with the same photo no longer look alike. Hebrew type pairs are
  well chosen. There is no shared badge or gradient. The quiet DNAs (Noto Serif on grain,
  Bellefair, the full-bleed photo with one strong line) look like a real brand.
- **What a designer sees:**
  - **One skeleton under every skin:** across all 9 businesses there is a kicker with a little
    dash, a headline, an underlined CTA and a logo in a corner. Swap the fonts and the ornament,
    and it is the same template. A trained eye spots the system on the second post, which is
    exactly the "IsraMarket look" the owner wants to avoid.
  - **Ornament that is applied, not designed:** scalloped flower frames, rainbow arcs on a ticket,
    rings around an arch, dashed "thread" rectangles crossing the photo. These are Canva moves.
    They come from a list, not from the brand.
  - **Text covers the product:** the ticket card hides half the doughnuts. The editorial column
    crops the product to a strip. Text goes where the composition says, not where the photo has
    room.
  - **Too much text, too small:** 4–5 text elements per post, and the CTA line ("להזמנה בוואטסאפ
    עד רביעי") is unreadable at feed size on a phone.
  - **An invented logo:** a business with no logo gets a circle stamp with its first letter. That
    is fake branding.
  - **Colours that are "of the brand" only loosely:** colours may sit ΔE 28 from the brand's own,
    and the logo image is never actually looked at.
- **What a customer scrolling Instagram feels:** the full-bleed photo with one line looks like
  the bakery's own post, and they stop. The framed, decorated ones read as a promo flyer, and
  they scroll on. People respond to the real place, the product and hands at work, not to frames.
- **What the owner asks:** "Is that my brand?" Only when it is their logo, their colours and their
  photo. Today two of those three are approximations.

## The change: a style is an art direction
A style is described the way a designer briefs a photographer and a typesetter, in words. Every
parameter is derived from that brief and never shown to the owner.

**`direction` (owner-facing, Hebrew, replaces `rationale_he` as the main description)**
- `feel_he`: one sentence for the feeling ("שקט ובטוח, כמו מאפייה שאופה באותו תנור 40 שנה").
- `world_he`: the real world it comes from (the place, the materials, the street).
- `photo_he`: how its photos look (light, closeness, what is in the frame).
- `text_he`: how text behaves ("מילה אחת גדולה או בלי טקסט בכלל; המחיר רק כשהוא הסיפור").
- `never_he`: 3–5 things this brand would never do.

**Design rules that apply to every business (the renderer and the server enforce them)**
1. **One message per post.** On the image: at most a headline and one short line. The CTA,
   hours, address and conditions live in the caption. The price goes on the image only when it is
   the message, and then it is the headline.
2. **The product is the hero.** Text sits in the photo's empty area (`design.safe_area`, from a
   vision pass on the chosen photo), never on a box over the subject. With no room, the text goes
   on its own band above or below the photo (split), not over it.
3. **Readable on a phone.** The smallest text on the image is at least 3.2% of the card width
   (≈35px at 1080); the headline at least 7%.
4. **Most posts are photo-led.** The DNA sets a mix (e.g. 50% photo only or one word, 40%
   headline on photo, 10% type-led). Variety comes from the photography (close-up, process,
   hands, the place, people), not from frames.
5. **Ornament only from the brand.** Motif `none` is the default. At most one quiet element that
   comes from the brand itself: a shape from its logo, a texture of its real place, a detail of
   its product (`motif.from: logo | place | product`). Generic list ornaments are retired as
   defaults: scalloped edges, rainbow arcs, rings, dashed frames, tape.
6. **The real logo, small.** The logo is a same-origin PNG copy (`signature.logo_url`); an SVG logo
   is rasterised to that PNG first and never served as SVG (see "Logo copy" below). On feed posts
   it is small or absent, because the profile already shows it. On stories and WhatsApp it is
   small and clear. With no logo, the name is set in the display face. Never an invented monogram
   or stamp.
7. **Colours are the brand's own.**
   - Colours are read from the logo pixels and the site's CSS (`colors.*.source: logo | site`).
   - Tints and shades are derived by lightness only (ΔE ≤ 6 from a brand colour, before the
     lightness change).
   - Uniqueness never moves a brand's colours. Two same-field businesses are told apart by type,
     photography and composition.
8. **No shared skeleton.** Kicker lines, dashes before the kicker and underlined CTAs are
   per-DNA choices, and most DNAs use none of them.

**Owner-facing**
- The brand page shows the direction in words with 3 sample posts.
- "לשנות פרטים" offers choices in words, not pickers:
  - quieter or bolder
  - more photo or more text
  - and only then fonts and colours
- The QA page shows the brief, not "Suez One · stamp · underline/tag".

**Quality gate (dev and QA)**
- A designer-review pass sends rendered PNGs to a vision model with a rubric:
  - looks like a template or ad?
  - product visible?
  - text readable on a phone?
  - fits the brand?
  - would a customer stop?
- Gives a 1–5 score with one line of notes per post.
- Used on `/dev/dna` with real businesses (including tazizi.co.il) before anything ships.

## Contract additions (v2)
- `brand_dna.version: 2`.
  - `direction{feel_he, world_he, photo_he, text_he, never_he[]}`
  - `colors.<role> = "#hex"`, plus `colors_source{<role>: logo|site|derived}`
  - `signature{kind: corner_mark | footer_band | name_only | none, use_logo, logo_url, logo_on: light | dark | any}`
  - `motif{kind | "none", from: logo | place | product, color, density}`
  - `mix{photo_only, headline, type_led}` (fractions)
  - `copy{headline_accent: bool, price_style, cta_on_image: false}`
- A post's `design` adds `safe_area{x, y, w, h}` (0–1 of the photo, where text may go) and
  `focal{x, y}`.
- A post adds `price{amount, currency: "ILS", note}` when the plan's offer has a price.
- `POST /brand/dna/regenerate` on a plan that doesn't allow it → 402 `{code: "plan_required"}`.
- **Decisions on the renderer's questions:**
  - A composition change keeps the photo.
  - `editorial_column` at 9:16 is allowed only when picked by hand.
  - A focal-point crop is the `focal` above.

### As built (server, 2026-10-02)
Services: `design_dna.py` (v2 genes, validation, uniqueness, upgrade, adjust),
`dna_colors.py` (evidence, ΔE, lightness-only derivation), `brand_logo.py` (the logo copy),
`photo_analysis.py` (safe area), `post_design.py` (text modes), `connected_posts.py` (one
message, price). The library (`GET /brand/dna/library`) is `version: 2`.

**`brand_dna` v2, field by field** (additive keys marked +)
- `direction{feel_he, world_he, photo_he, text_he, never_he[3–5]}`: Hebrew, no English word
  the business does not use, no `!`, no em dash, no generic marketing word (`GENERIC_HE`:
  חוויה, פתרון, מותג, איכותי, ייחודי, מושלם, מזמין… and the stock photo phrases). `world_he`
  and `photo_he` must share a word with the business's own signals, else they fall back to
  its own words. `rationale_he` is kept and equals `feel_he`.
- `colors{ink, paper, accent, accent_2, on_photo, tint}`, `colors_source{role: logo | site |
  derived | owner}` (`owner` + = set by hand in `PUT /brand/dna` and not a brand colour),
  `colors_base{role: "#hex"}` + = the brand colour a `derived` role came from.
  - Evidence order: the logo copy's pixel colours (else the scan's logo measurement), then the
    site: palette swatches (with roles), screenshot colours, CSS colours (`raw.colors`, the
    scraper already keeps them, builder defaults removed).
  - A model colour within ΔE 6 (CIE76) of a brand colour is snapped to it exactly; one that is
    a brand colour moved in lightness (CIE LCh, same hue, chroma lowered only by the gamut) is
    `derived`; anything else is replaced locally.
  - Ink reaches 4.5:1 on paper by moving its lightness only. The accent is the logo's most
    saturated colour (not its largest area).
- `signature{kind, use_logo, logo_url, logo_on, logo_colors[] +}`: `corner_mark | footer_band
  | none` when a same-origin logo copy exists (`logo_url` = `/backend/media/{id}/logo-<sha1>.png`,
  owner-only like every media file; a PNG also for an SVG logo, rasterised), else `name_only | none`
  (`logo_url: ""`, `logo_on: any`).
  `logo_on` comes from the logo's own alpha and luminance: it reads on a ground when 90% of it
  is visible there (1.5:1) and 20% legible (3:1); an opaque logo follows its own ground.
- `motif{kind, from, note_he +, color, density}`: `none` by default. Any other kind needs
  `from: logo | place | product`, a Hebrew `note_he` naming the thing, and the brand's own words
  for that `from` (logo description; visual style, photography, location, photo notes; offerings,
  featured items) must mention it (`MOTIF_EVIDENCE` keywords). `from: owner` + when the owner
  picks a motif by hand. Library motifs carry `generic: true` for scalloped_edge, arches, tape,
  thread, stamp.
- `mix{photo_only, headline, type_led}`: fractions summing to 1, steps of 0.05, from the field
  (`FIELD_MIX`, e.g. food 0.5/0.4/0.1, professional 0.3/0.45/0.25) nudged by the voice (quiet
  → more photo, lively → more headline). `type_led > 0` exactly when the DNA has a photo-free
  composition. Every DNA keeps at least two compositions that can carry a photo alone.
- `copy{headline_accent, price_style, cta_on_image: false}`; `cta_style` is gone.
- `source: model | local | upgraded`, `upgraded_from` +, `adjusted[]` + (the owner's word
  adjustments, replayed after a regenerate or re-scan), `locked` as before.
- A stored v1 DNA is upgraded on read without a model call (`source: "upgraded"`): direction
  from the brand's own words (the v1 rationale only when it is a feeling, not a list of fonts
  and motifs), colours rebuilt from the evidence unless the owner locked them, motif `none`
  unless the logo description names it, `stamp`/`tab` → the logo or the name. `GET /brand/dna`
  stores the upgrade.

**Uniqueness:** distance = 0.35 type + 0.25 compositions + 0.15 photo direction (word Jaccard)
+ 0.10 motif + 0.05 mix + 0.05 signature + 0.05 palette, re-weighted over the genes both
carry. Against the business's own earlier style the palette is left out. Colours are never
excluded or moved; a motif too close becomes `none`; `none` is never excluded. Across fields
the look that may not repeat is the same type pair + motif (with no motif: also ≥ 60% of the
compositions).

**`PUT /brand/dna`** adds `adjust{tone: quieter | bolder, text: more_photo | more_text}`:
quieter = display weight one step down, scale one step smaller, +0.1 photo only, motif density
low; bolder the reverse; more_photo +0.15 photo only; more_text +0.15 headline (or +0.1 and
+0.05 type-led). `direction.text_he` follows the mix. Locked genes stay. `motif` takes `from`
and `note_he`.

**Logo copy:** on scan, from-draft, brand save and palette save (`refresh_after_scan`), and on
the first build or a regenerate. `brand_language.logo_url` is fetched with the scraper's
`capped_get` (SSRF guard on every hop, 900 KB cap, 20 s), `_download_logo` (image types only,
≥ 24 px), normalised with Pillow (first frame, EXIF, RGBA, transparent margins trimmed, ≤ 1024
px, PNG) and stored as `Business.brand_logo_json` + the file. `POST /onboarding/brand` keeps the
scanned `logo_url` and accepts a new one (`https://` only). Settings: `BRAND_LOGO_COPY`.

**An SVG logo is rasterised, never served** (an SVG from our origin can carry script;
`services/svg_logo.py`, 2026-10-04). Only the PNG it becomes is stored, and from there it is a
PNG logo like any other: trimmed, ≤ 1024 px, `logo_on` and colours from its pixels, the same
`logo_url` (the record adds `format: "svg"`).
- **Read:** ≤ 512 KB; a `.svgz` is unpacked to ≤ 512 KB (a gzip bomb stops at the cap). A plain
  `<!DOCTYPE svg PUBLIC "…" "…">` line (Illustrator's) is dropped; any other DTD, every entity
  and external reference is refused by defusedxml (billion laughs, XXE).
- **Sanitised by allowlist:** SVG drawing elements only (shapes, text, gradients, patterns,
  clip paths, masks, markers, filters, `use`, `switch`, `style`). `script`, `foreignObject`,
  animation, `metadata` and every element of another namespace go with their content; `on*`
  handlers, `xml:base` and foreign attributes go. An `href` stays only as a same-document
  `#fragment`, or on `image`/`feImage` as an inline `data:image/(png|jpeg|webp);base64` that
  Pillow opens as that format (≤ 16 MP). `url(…)` stays only as `url(#id)`, in attributes and
  CSS; `@import`/`@font-face` leave the CSS, and CSS with escapes is dropped.
- **Limits:** 5,000 elements, nesting depth 40, 20,000 elements drawn once every `use` and
  `url(#…)` is expanded (a `use` bomb; reference cycles refused), width/height/viewBox positive,
  finite, ≤ 1,000,000 units, aspect ≤ 25:1.
- **Render:** resvg (`resvg-py`, a static Rust wheel: no script engine, no network client, no
  system library) in a child process (`services/svg_render_child.py`): empty environment,
  empty working directory, CPU/memory/file-size rlimits, a fixed 2048 px box (the pixel cap,
  whatever the SVG declares), system fonts only when it has text, killed at a 10 s
  wall-clock timeout, at most two renders at once.
- **Fallback:** anything refused or failed is `status: unsupported` with a `reason`
  (`dtd`, `too_deep`, `too_many_drawn`, `bad_size`, `timeout`, `blank`, …); the DNA signs with
  the name and the SVG's fill colours still count as logo evidence. A refusal is retried after
  6 h like a failure; an `unsupported` record from before rasterisation (no `reason`) is retried
  at the next refresh.

**A post** (written by `finish_written`, the designer and a rewrite)
- `overlay_headline` ≤ 6 words, `overlay_sub` + ≤ 6 words or "" (dropped when it is a CTA,
  hours or conditions); `overlay_text` = `overlay_headline`; `overlay_badge` is retired ("").
  The CTA, hours, address and conditions stay in the caption. `stat_highlight` is not printed
  separately.
- `price{amount, currency: "ILS", note}` or `null`: only an amount found in the plan's offer,
  the plan, the offerings, the owner context or the featured items; after an owner save, the
  amount in their text.
- `design.text_mode` +: `photo_only | headline | type_led`, from the DNA mix across the month
  (has_overlay false → photo only, a price → headline, product posts never type-led); the
  layout always carries its mode (`compositions[].text_modes` in the library); neighbours
  still never share a composition. The editor's overlay switch sets it.
- `design.safe_area{x,y,w,h} | null`, `design.focal{x,y}`, `design.subject{x,y,w,h}` +,
  `design.photo_hash` +: one vision call per photo (DESIGN_DNA_MODEL, answered on Gemini's
  0–1000 grid, stored 0–1), cached per business by the image's sha256 (`photo_analyses`
  table), never when the call may not spend (browsing), removed when the photo changes. A safe
  area that overlaps the subject by more than 12% is `null`. With a safe area, `text_position`
  moves to the allowed position nearest it. Settings: `PHOTO_ANALYSIS`, `PHOTO_ANALYSIS_MODEL`.
- `design.by_hand: true` + marks a feed-only layout the owner picked for a story.
- Generated photos for a headline post ask for calm negative space at the text position.

**Gate:** every billing-gated endpoint, `/brand/dna/regenerate` included, answers 402
`{detail, code: "plan_required", detail_he}` (`detail` = `detail_he`, so older clients still
show the sentence).

**Tools:** `api/scripts/design_review.py FOLDER [--meta]` (rubric: template_look, lower is
better; subject_visible; readable_on_phone; fits_direction; would_stop; notes in Hebrew and
English; report in `.runtime/design-review/<ts>/`), `api/scripts/dna_smoke.py` (tazizi.co.il
through the scraper path + 3 fictional businesses; fixtures in `web/app/dev/dna/fixtures/`, the
logo in `web/public/dev-dna/`).

### As built (renderer, 2026-10-02)
`web/lib/dna/layout.ts` plans every card (the renderer draws the plan, the editor names it);
`photoInfo.ts` reads each photo's shape and light; `measure.ts` measures words in the loaded
face; `resolve.ts` reads v1 and v2 DNAs; `components/dna/` draws; `CardCanvas.tsx` ties them.

- **Compositions drawn:** `full_bleed`, `inset_frame`, `split`, `type_led`, `arch_window`. The
  server's other keys are drawn as the nearest of these (`ticket`, `handwritten_note`,
  `corner_tab` → `full_bleed`; `stacked_bands` → `split`; `collage_grid`, `circle_crop`,
  `editorial_column` → `inset_frame`). Nothing is ever drawn over the photo but words.
- **Words:** `overlay_headline` and `overlay_sub` only. `photo_only` shows one word at most, and
  nothing when `has_overlay` is false. `price` only on a headline post, as a line in the display
  face (`price_style: tag | circle` read as `inline`; `headline` makes the amount the headline).
- **Placement:** `safe_area` is mapped through the crop. The crop may slide toward it while the
  focal point stays within 18–82% of the frame, and keeps the whole `subject` in frame when it
  fits. Words never touch the subject. No safe area, or words that do not fit it: a band of the
  brand's ground above or below the photo. Stories keep their words high (the bottom is under
  Instagram's reply bar).
- **Phone sizes:** no text under 3.2% of the width, no headline under 7% (the library's
  `rules`). A setting that would need less moves to a band; it is never drawn smaller.
  `/dev/dna` checks every card (smallest size, lines drawn against lines planned).
- **Colour on a photo:** the photo's own light under the words picks the ink (the DNA's
  `on_photo` first) and whether a soft shade is needed.
- **Motif:** v1 → none. v2 needs `from`; drawn quietly: `grain`, one fine rule (`thread`,
  `underline`, `stripes`), the logo as a small closing detail (`logo_mark`). The generic list
  ornaments draw nothing.
- **Signature:** `none` = no mark. The logo small; a plate only where none of `logo_colors`
  reads on the photo (3:1), or by `logo_on` when the colours are unknown. A photo-only feed post
  carries no name (the profile shows it). Stories and WhatsApp always carry the mark.
- **Ground:** quiet DNAs set bands on paper, bold ones on the accent (when it carries text),
  medium ones on the tint, unless the tint is a neutral grey (a site panel colour).
- **Editor:** three designs named by what they draw (`רק התמונה`, `כותרת על התמונה`, `כותרת
  מתחת לתמונה`, `התמונה עם שוליים`, `טקסט על רקע`). "רק התמונה" saves `has_overlay: false`
  (the server derives the mode). **Brand page:** the direction in words, three samples in the
  DNA's mix, `adjust` first, fonts and colours under it, 402 → a link to `/billing`.
- **Review:** "לייצא את כל הכרטיסים" on `/dev/dna` writes `web/.design-review/dna/<ratio>/`
  (PNG + JSON per card), ready for `api/scripts/design_review.py web/.design-review/dna/4x5`.
