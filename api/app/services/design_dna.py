"""Design DNA: one visual identity per business, unique in its field (docs/design-dna.md).

A business's DNA (`Business.brand_dna_json`, the `brand_dna` contract) is generated once
from the business's own signals: its logo and logo description, the colours a customer
sees on its site, its fonts (each mapped to the nearest library font), its photos, field,
voice, audience and Instagram. Every post is then drawn from it (services/post_design.py).

How it stays unique by construction:

* A per-business seed picks which library options are on the table this time
  (`candidates`), so two businesses with the same signals are offered different sets.
* The model may only answer with library keys (the schema's enums), and every answer is
  validated again here (`validate_dna`): an unknown key falls back to a seeded choice.
* The result is compared with every other DNA in the same field (`distance`) and, for
  the type pair + motif combination, with every DNA at all. Too close: regenerated with
  the close genes excluded, at most MAX_TRIES model calls, then moved apart locally.

Owner-facing: GET/PUT /brand/dna, POST /brand/dna/regenerate (routers/brand_dna.py).
Two keys beyond the contract are additive: `source` ("model" | "local", i.e. built
without the model) and `locked` (genes the owner set; "all" = the owner kept the style).
"""

from __future__ import annotations

import copy
import hashlib
import logging
import math
import random
import re
from datetime import datetime, timezone

from app.config import get_settings
from app.services import colors as color_tools
from app.services.business_fields import coerce_field, field_label
from app.services.dna_library import (
    COLOR_ROLES,
    COMPOSITIONS,
    CTA_STYLES,
    DISPLAY_FONTS,
    FONTS,
    HEADLINE_CASES,
    MOTIF_COLORS,
    MOTIF_DENSITIES,
    MOTIFS,
    PRICE_STYLES,
    SIGNATURES,
    TEXT_FONTS,
    TYPE_SCALES,
    nearest_font,
    snap_weight,
)
from app.services.jsonutil import dumps, loads

log = logging.getLogger(__name__)

DNA_VERSION = 1
# Model calls per generation, the first one included. After that the close genes are
# moved apart locally, without the model.
MAX_TRIES = 3
# Below this, two DNAs in the same field read as the same template (see `distance`).
FIELD_MIN_DISTANCE = 0.4
DISTANCE_WEIGHTS = {"type": 0.30, "motif": 0.15, "signature": 0.10, "compositions": 0.20, "palette": 0.25}
GENES = ("type", "colors", "compositions", "motif", "signature", "photo", "copy")
# What the owner may set by hand (PUT /brand/dna).
EDITABLE_GENES = ("type", "motif", "colors")
KEEP_ALL = "all"
# How many options of each gene the seed puts on the table.
CANDIDATE_COUNTS = {"display": 6, "text": 5, "motif": 5, "signature": 3, "compositions": 7}
MAX_MODEL_IMAGES = 3
MIN_TEXT_CONTRAST = 4.5

# Never in any image, whatever the business. Faces only by default: a business can be
# about people, but a generated face is the fastest "this is AI" tell.
DEFAULT_NEVER = (
    "text, letters or numbers in any language",
    "logos, watermarks or price tags",
    "people's faces",
    "a white studio sweep or a generic marble backdrop",
    "waxy or plastic-looking surfaces",
    "drawn frames, borders or panels",
)

# Photo-direction words that belong to every business and so to none. Stripped from the
# model's answer (docs/image-models.md: shared art direction is what makes posts generic).
_STOCK_PHRASES = (
    "soft natural light",
    "warm and inviting",
    "inviting atmosphere",
    "cozy atmosphere",
    "cosy atmosphere",
    "rustic wooden table",
    "rustic wood table",
    "shallow depth of field",
    "bokeh",
    "golden hour glow",
    "high-end",
    "lifestyle shot",
    "white studio",
    "studio backdrop",
    "marble surface",
    "clean and modern",
    "instagrammable",
    "cinematic",
)
# Bakery vocabulary leaked into every business's prompts once (designer.py, images.py).
# A non-bakery never gets these; a food business that is not a bakery keeps oven/dough.
_BAKERY_WORDS = (
    "bakery", "bakeries", "bread", "loaf", "loaves", "challah", "sourdough", "croissant",
    "pastry", "pastries", "flour", "baker", "baking", "baked goods",
    "מאפייה", "מאפה", "מאפים", "לחם", "חלה", "חלות", "קמח",
)
_BAKERY_WORDS_NON_FOOD = _BAKERY_WORDS + ("oven", "dough", "crumb", "crumbs", "crust", "תנור", "בצק")
_BAKERY_HINT = re.compile(
    r"מאפי|מאפה|מאפים|לחם|חלות|\bחלה\b|עוגות|קונדיטור|בייקרי|bakery|bread|pastr|patisserie|boulangerie",
    re.IGNORECASE,
)
_HEBREW = re.compile(r"[֐-׿]")

DNA_SYSTEM = (
    "You are the art director who gives one Israeli small business its own visual identity "
    "for social posts. You answer only with the JSON asked for, using only the keys offered."
)


# --- seeds ------------------------------------------------------------------------------


def _hash_int(text: str) -> int:
    return int(hashlib.sha256(text.encode("utf-8")).hexdigest()[:12], 16)


def seed_for(business) -> int:
    """Deterministic per business: the same business always starts from the same seed."""
    created = business.created_at.isoformat() if getattr(business, "created_at", None) else ""
    return _hash_int(f"isramarket-dna:{business.id}:{created}") % 100_000


def next_seed(seed: int) -> int:
    """'לנסות סגנון אחר': a new seed, derived from the current one (still deterministic)."""
    value = _hash_int(f"isramarket-dna-next:{seed}") % 100_000
    return value if value != seed else (value + 1) % 100_000


# --- colours ----------------------------------------------------------------------------


def _norm_hex(value) -> str | None:
    return color_tools.normalize_hex(str(value or "")) if value else None


def _rgb(hex_value: str) -> tuple[int, int, int]:
    return color_tools.hex_to_rgb(hex_value) or (0, 0, 0)


def luminance(hex_value: str) -> float:
    """WCAG relative luminance."""

    def channel(v: int) -> float:
        c = v / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (channel(v) for v in _rgb(hex_value))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def to_lab(hex_value: str) -> tuple[float, float, float]:
    """sRGB (D65) to CIE Lab."""

    def linear(v: int) -> float:
        c = v / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (linear(v) for v in _rgb(hex_value))
    x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
    y = r * 0.2126 + g * 0.7152 + b * 0.0722
    z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883

    def f(t: float) -> float:
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116

    fx, fy, fz = f(x), f(y), f(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def delta_e(a: str, b: str) -> float:
    """CIE76 colour difference: ~2 is a just-noticeable step, 50+ a different colour."""
    la, lb = to_lab(a), to_lab(b)
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(la, lb)))


def mix(a: str, b: str, t: float) -> str:
    ra, rb = _rgb(a), _rgb(b)
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(ra, rb))


def _readable_ink(ink: str, paper: str) -> str:
    """Ink moved towards black (or white, on a dark paper) until it reads on the paper."""
    if contrast(ink, paper) >= MIN_TEXT_CONTRAST:
        return ink
    target = "#000000" if luminance(paper) > 0.18 else "#ffffff"
    for step in range(1, 11):
        candidate = mix(ink, target, step / 10)
        if contrast(candidate, paper) >= MIN_TEXT_CONTRAST:
            return candidate
    return target


def _seed_palette(seed: int) -> dict[str, str]:
    """A business with no palette at all still gets its own colours, never a house one."""
    import colorsys

    hue = (seed % 360) / 360

    def hls(h: float, l: float, s: float) -> str:
        r, g, b = colorsys.hls_to_rgb(h % 1, l, s)
        return "#" + "".join(f"{round(v * 255):02x}" for v in (r, g, b))

    return {
        "primary": hls(hue, 0.42, 0.55),
        "accent": hls(hue + 0.08, 0.52, 0.65),
        "background": hls(hue, 0.95, 0.35),
        "ink": hls(hue, 0.13, 0.30),
        "secondary": hls(hue + 0.5, 0.45, 0.35),
    }


# --- signals ----------------------------------------------------------------------------


def dna_field(business) -> str:
    return coerce_field(getattr(business, "business_type", "") or "", getattr(business, "offerings", "") or "").key


def _unique(items) -> list:
    out: list = []
    for item in items:
        if item and item not in out:
            out.append(item)
    return out


def signals_for(db, business, *, with_images: bool = True) -> dict:
    """Everything the DNA is derived from. `db` may be None (no library, no Instagram)."""
    from app.services.images import read_stored_bytes

    stored = loads(getattr(business, "scraped_profile_json", "") or "", {}) or {}
    brand = stored.get("brand_language") or {}
    raw = stored.get("raw") or {}
    typography = brand.get("typography") or {}
    site_fonts = [str(name) for name in (raw.get("fonts") or []) if str(name).strip()][:6]
    mapped = _unique(nearest_font(name) for name in [typography.get("primary") or "", *site_fonts])
    palette = []
    for swatch in brand.get("palette") or []:
        value = _norm_hex(swatch.get("hex")) if isinstance(swatch, dict) else None
        if value:
            palette.append({"hex": value, "role": swatch.get("role") or "secondary", "name": swatch.get("name") or ""})
    evidence = raw.get("color_evidence") or {}
    measured = _unique(
        _norm_hex(item.get("hex")) for key in ("screenshot", "logo")
        for item in (evidence.get(key) or []) if isinstance(item, dict)
    )
    field = dna_field(business)

    photo_notes: list[dict] = []
    images: list[tuple[bytes, str]] = []
    image_labels: list[str] = []
    for photo in stored.get("real_photos") or []:
        alt = str(photo.get("alt") or "").strip()
        if alt:
            photo_notes.append({"source": "site", "text": alt[:160]})
        if with_images and len(images) < MAX_MODEL_IMAGES:
            loaded = read_stored_bytes(str(photo.get("public_url") or ""))
            if loaded and loaded[1] in {"image/jpeg", "image/png", "image/webp"}:
                images.append(loaded)
                image_labels.append("a photo from the business's own website")
    instagram: dict = {}
    if db is not None:
        from app.models import Asset, InstagramPost
        from app.services.images import image_public_url

        assets = (
            db.query(Asset)
            .filter(Asset.business_id == business.id, Asset.kind == "image")
            .order_by(Asset.created_at.desc(), Asset.id.desc())
            .limit(12)
            .all()
        )
        for asset in assets:
            tags = ", ".join(loads(asset.tags_json, []) or [])
            text = " | ".join(part for part in (asset.description or "", tags) if part)
            if text:
                photo_notes.append({"source": "library", "text": text[:200]})
            if with_images and len(images) < MAX_MODEL_IMAGES and asset.mime in {"image/jpeg", "image/png", "image/webp"}:
                loaded = read_stored_bytes(image_public_url(business.id, asset.filename))
                if loaded:
                    images.append(loaded)
                    image_labels.append("a photo the owner uploaded to their library")
        posts = (
            db.query(InstagramPost)
            .filter(InstagramPost.business_id == business.id)
            .order_by(InstagramPost.posted_at.desc())
            .limit(30)
            .all()
        )
        if posts:
            reels = sum(1 for p in posts if (p.media_product_type or "").upper() == "REELS" or (p.media_type or "") == "VIDEO")
            ranked = sorted(posts, key=lambda p: -(p.like_count or 0))
            instagram = {
                "posts": len(posts),
                "reels_share": round(reels / len(posts), 2),
                "top_captions": [(p.caption or "").strip()[:140] for p in ranked[:5] if (p.caption or "").strip()],
            }
            for caption in instagram["top_captions"][:3]:
                photo_notes.append({"source": "instagram", "text": caption})

    text_blob = " ".join(
        str(part or "") for part in (business.name, business.offerings, brand.get("visual_style"), brand.get("photography"))
    )
    return {
        "name": business.name or brand.get("business_name") or "",
        "field": field,
        "field_label": field_label(field),
        "offerings": (business.offerings or "")[:400],
        "location": getattr(business, "location", "") or "",
        "business_model": getattr(business, "business_model", "") or "products",
        "palette": palette,
        "measured_colors": measured[:8],
        "typography": {"primary": typography.get("primary") or "", "mood": typography.get("mood") or ""},
        "site_fonts": site_fonts,
        "mapped_fonts": [key for key in mapped if key in FONTS],
        "visual_style": brand.get("visual_style") or "",
        "photography": brand.get("photography") or "",
        "voice": brand.get("voice") or "",
        "audience": brand.get("audience") or "",
        "logo_description": brand.get("logo_description") or "",
        "has_logo": bool(brand.get("logo_url") or raw.get("logo_url")),
        "brand_source": brand.get("source") or ("site" if brand else ""),
        "photo_notes": photo_notes[:12],
        "instagram": instagram,
        "images": images,
        "image_labels": image_labels,
        "is_bakery": field == "food" and bool(_BAKERY_HINT.search(text_blob)),
    }


# --- candidates (what the seed puts on the table) ---------------------------------------


def _merge_exclusions(a: dict, b: dict) -> dict:
    out = {key: set(value) for key, value in (a or {}).items()}
    for key, value in (b or {}).items():
        out.setdefault(key, set()).update(value)
    return out


def candidates(seed: int, signals: dict, exclusions: dict | None = None) -> dict[str, list[str]]:
    """The options this generation may choose from: seeded, minus the excluded genes.

    The site's own fonts (mapped to the library) are always offered first, so a business
    keeps the type its customers already know when it fits.
    """
    ex = {key: set(value) for key, value in (exclusions or {}).items()}
    rng = random.Random(f"candidates:{seed}")
    mapped = signals.get("mapped_fonts") or []

    def pick(pool: list[str], preferred: list[str], count: int) -> list[str]:
        first = [key for key in preferred if key in pool][:2]
        rest = [key for key in pool if key not in first]
        rng.shuffle(rest)
        return first + rest[: max(0, count - len(first))]

    def pool(keys, excluded: set[str], minimum: int) -> list[str]:
        kept = [key for key in keys if key not in excluded]
        return kept if len(kept) >= minimum else list(keys)

    display = pick(pool(DISPLAY_FONTS, ex.get("display", set()), 3), mapped, CANDIDATE_COUNTS["display"])
    text = pick(pool(TEXT_FONTS, ex.get("text", set()), 3), mapped, CANDIDATE_COUNTS["text"])
    motifs = pick(pool(tuple(MOTIFS), ex.get("motif", set()), 2), [], CANDIDATE_COUNTS["motif"])
    signatures = pick(pool(tuple(SIGNATURES), ex.get("signature", set()), 1), [], CANDIDATE_COUNTS["signature"])
    comp_pool = pool(tuple(COMPOSITIONS), ex.get("compositions", set()), 5)
    if sum(1 for key in comp_pool if _vertical_photo(key)) < 4:
        comp_pool = list(COMPOSITIONS)
    compositions = pick(comp_pool, [], CANDIDATE_COUNTS["compositions"])
    if sum(1 for key in compositions if _vertical_photo(key)) < 3:
        extra = [key for key in comp_pool if _vertical_photo(key) and key not in compositions]
        compositions = compositions + extra[: 3 - sum(1 for key in compositions if _vertical_photo(key))]
    return {
        "display": display,
        "text": text,
        "motif": motifs,
        "signature": signatures,
        "compositions": compositions,
    }


# --- the model call -----------------------------------------------------------------------


def dna_schema(cands: dict[str, list[str]]) -> dict:
    string = {"type": "string"}
    return {
        "type": "object",
        "title": "BrandDna",
        "properties": {
            "type": {
                "type": "object",
                "properties": {
                    "display": {"type": "string", "enum": cands["display"]},
                    "display_weight": {"type": "integer"},
                    "text": {"type": "string", "enum": cands["text"]},
                    "text_weight": {"type": "integer"},
                    "headline_case": {"type": "string", "enum": list(HEADLINE_CASES)},
                    "scale": {"type": "string", "enum": list(TYPE_SCALES)},
                },
                "required": ["display", "display_weight", "text", "text_weight", "headline_case", "scale"],
            },
            "colors": {
                "type": "object",
                "properties": {role: {"type": "string", "description": "#rrggbb"} for role in COLOR_ROLES},
                "required": list(COLOR_ROLES),
            },
            "compositions": {
                "type": "array",
                "items": {"type": "string", "enum": cands["compositions"]},
                "minItems": 3,
                "maxItems": 4,
            },
            "motif": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "enum": cands["motif"]},
                    "color": {"type": "string", "enum": list(MOTIF_COLORS)},
                    "density": {"type": "string", "enum": list(MOTIF_DENSITIES)},
                },
                "required": ["kind", "color", "density"],
            },
            "signature": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "enum": cands["signature"]},
                    "use_logo": {"type": "boolean"},
                },
                "required": ["kind", "use_logo"],
            },
            "photo": {
                "type": "object",
                "properties": {
                    "grade": string,
                    "light": string,
                    "angle": string,
                    "props": {"type": "array", "items": string},
                    "background": string,
                    "never": {"type": "array", "items": string},
                },
                "required": ["grade", "light", "angle", "props", "background", "never"],
            },
            "copy": {
                "type": "object",
                "properties": {
                    "price_style": {"type": "string", "enum": list(PRICE_STYLES)},
                    "cta_style": {"type": "string", "enum": list(CTA_STYLES)},
                },
                "required": ["price_style", "cta_style"],
            },
            "rationale_he": string,
        },
        "required": ["type", "colors", "compositions", "motif", "signature", "photo", "copy", "rationale_he"],
    }


def _gene_line(dna: dict) -> str:
    t = dna.get("type") or {}
    return (
        f"- display {t.get('display')} + text {t.get('text')}, motif {(dna.get('motif') or {}).get('kind')}, "
        f"signature {(dna.get('signature') or {}).get('kind')}, compositions {', '.join(dna.get('compositions') or [])}"
    )


def _font_options(keys: list[str]) -> str:
    return "; ".join(
        f"{key} ({FONTS[key].family}, {FONTS[key].category}, weights {'/'.join(str(w) for w in FONTS[key].weights)})"
        for key in keys
    )


def dna_prompt(signals: dict, cands: dict, peers: list[dict], exclusions: dict, seed: int,
               fixed: dict | None = None) -> str:
    palette = ", ".join(f"{p['hex']} ({p['role']}{', ' + p['name'] if p['name'] else ''})" for p in signals["palette"]) or "none read"
    measured = ", ".join(signals["measured_colors"]) or "none"
    fonts = ", ".join(signals["site_fonts"]) or "none found"
    mapped = ", ".join(signals["mapped_fonts"]) or "none"
    notes = "\n".join(f"- ({n['source']}) {n['text']}" for n in signals["photo_notes"]) or "- none"
    attached = "\n".join(f"{i + 1}. {label}" for i, label in enumerate(signals["image_labels"])) or "none"
    ig = signals.get("instagram") or {}
    instagram = (
        f"{ig['posts']} recent posts, {round(ig['reels_share'] * 100)}% reels. Top captions: "
        + " / ".join(ig.get("top_captions") or [])
        if ig else "not connected"
    )
    others = "\n".join(_gene_line(dna) for dna in peers[:8]) or "- none yet"
    avoid = "; ".join(f"{gene}: {', '.join(sorted(values))}" for gene, values in (exclusions or {}).items() if values) or "nothing"
    fixed_lines = "\n".join(f"- {gene}: {value}" for gene, value in (fixed or {}).items()) or "- nothing"
    bakery_rule = (
        "" if signals["is_bakery"]
        else "- This is not a bakery: never mention bread, loaves, flour, pastry, challah or a bakery.\n"
    )
    return f"""
Set the Design DNA of this business: the fixed visual character every one of its posts is
drawn from. A renderer draws the posts and knows only the keys offered below. The goal is
posts that look like THIS business and nobody else, never like a template that other
businesses in its field also get.

BUSINESS
- name: {signals['name']}
- field: {signals['field']} ({signals['field_label']})
- what it sells / does: {signals['offerings'] or 'not stated'}
- location: {signals['location'] or 'not stated'}
- voice (from its site): {signals['voice'] or 'not read'}
- audience: {signals['audience'] or 'not read'}

ITS OWN BRAND (read off its site and logo)
- palette with roles: {palette}
- colours measured from what customers see (screenshot, logo): {measured}
- logo: {signals['logo_description'] or ('it has a logo' if signals['has_logo'] else 'no logo found')}
- typography: "{signals['typography']['primary']}", mood: {signals['typography']['mood'] or 'not read'}
- fonts its site loads: {fonts} -> nearest library fonts: {mapped}
- visual style: {signals['visual_style'] or 'not read'}
- photography on its site: {signals['photography'] or 'not read'}
- Instagram: {instagram}

ITS PHOTOS
Attached images, in order:
{attached}
What its photos show (library descriptions, site alt text, Instagram captions):
{notes}

STYLES THIS ONE MUST DIFFER FROM (other businesses in the same field, and this business's
previous style if the owner asked for another one). Do not repeat these combinations:
{others}
Excluded this time (too close to someone else): {avoid}
Set by the owner (kept exactly as is, choose the rest around them):
{fixed_lines}
Variation seed: {seed}. Use it to break ties, so this business does not get the default pick.

CHOOSE
- type.display from: {_font_options(cands['display'])}
- type.text from: {_font_options(cands['text'])}
  Prefer the site's own fonts (the nearest library fonts above) when they fit its character.
  Weights must be ones the family has. Headline (display) and text must be clearly different.
  headline_case applies to Latin letters only (Hebrew has no case). scale: large | medium | editorial.
- compositions: 3 or 4 from {', '.join(cands['compositions'])}. They rotate across the
  month, so pick ones that differ from each other and fit the business's photos. type_led
  draws no photo: include it only if the business also posts messages without a picture.
- motif.kind from {', '.join(cands['motif'])}: one recurring graphic drawn from its logo or field.
  motif.color is a role (accent | accent_2 | ink | tint); density low | mid.
- signature.kind from {', '.join(cands['signature'])}: how the logo or name sits on every post.
  use_logo: {'true if the logo should appear' if signals['has_logo'] else 'false (no logo was found)'}.
- colors (#rrggbb): ink, paper and accent must be colours of this brand (palette or measured),
  at most slightly lighter or darker. accent_2 and tint may be derived from them. ink on paper
  must be easy to read. on_photo is the headline colour over a photo: very light or very dark,
  and not white by default if the brand has a light colour of its own.
- photo: the photo direction for THIS business only, from its own photos, its field and what
  it sells. grade (colour grade), light (source, direction, time of day), angle (lens, height),
  props (2 to 5 things that really belong to this business), background (its real surfaces and
  places), never (what must never appear in its images). Concrete nouns from this business.
  Write every photo field in English: it goes to an image model.
  No stock phrases such as "soft natural light", "warm and inviting", "shallow depth of field",
  "rustic wooden table", "bokeh", "cinematic". Never name products it does not sell.
{bakery_rule}- copy: price_style tag | inline | circle; cta_style underline | pill | arrow.
- rationale_he: one short line in Hebrew for the owner (up to 15 words) on why this style is
  theirs. Plural second person (אתם, שלכם), everyday Israeli Hebrew, no English words, no
  exclamation mark, no em dash, no "חוויה", "פתרון" or "מותג".
""".strip()


def _ask_model(prompt: str, schema: dict, images: list | None) -> dict:
    from app.services.gemini import generate_json

    settings = get_settings()
    text = generate_json(
        model=settings.design_dna_model,
        prompt=prompt,
        schema=schema,
        thinking_level="LOW",
        images=images or None,
        system=DNA_SYSTEM,
        attempts=2,
    )
    parsed = loads(text, {})
    return parsed if isinstance(parsed, dict) else {}


# --- validation: library keys only, sensible fallbacks -----------------------------------


def _prefer(mapped: list[str], pool: list[str], rng: random.Random) -> str:
    for key in mapped:
        if key in pool:
            return key
    return rng.choice(pool)


def _brand_roles(signals: dict, seed: int) -> dict[str, str]:
    roles: dict[str, str] = {}
    for swatch in signals["palette"]:
        roles.setdefault(swatch["role"], swatch["hex"])
    if not signals["palette"]:
        return _seed_palette(seed)
    hexes = [p["hex"] for p in signals["palette"]]
    roles.setdefault("background", max(hexes, key=luminance))
    roles.setdefault("ink", min(hexes, key=luminance))
    roles.setdefault("primary", roles.get("accent") or hexes[0])
    roles.setdefault("accent", roles["primary"])
    return roles


def validate_colors(raw, signals: dict, seed: int) -> dict[str, str]:
    raw = raw if isinstance(raw, dict) else {}
    roles = _brand_roles(signals, seed)
    evidence = [p["hex"] for p in signals["palette"]] + list(signals["measured_colors"])

    def of_brand(value, fallback: str, tolerance: float = 28) -> str:
        candidate = _norm_hex(value)
        if candidate and (not evidence or min(delta_e(candidate, e) for e in evidence) <= tolerance):
            return candidate
        return fallback

    paper_fallback = roles["background"] if luminance(roles["background"]) > 0.55 else mix(roles["background"], "#ffffff", 0.9)
    paper = of_brand(raw.get("paper"), paper_fallback)
    ink = _readable_ink(of_brand(raw.get("ink"), roles["ink"]), paper)
    accent = of_brand(raw.get("accent"), roles.get("accent") or roles["primary"])
    if delta_e(accent, paper) < 12:
        accent = roles["primary"] if delta_e(roles["primary"], paper) >= 12 else mix(paper, ink, 0.6)
    secondary = roles.get("secondary") or roles["primary"]
    accent2_fallback = secondary if delta_e(secondary, accent) >= 10 else mix(accent, ink, 0.35)
    accent_2 = of_brand(raw.get("accent_2"), accent2_fallback, tolerance=45)
    tint = _norm_hex(raw.get("tint"))
    if not tint or luminance(tint) < 0.45:
        tint = mix(paper, accent, 0.14)
    on_photo = _norm_hex(raw.get("on_photo"))
    if not on_photo or 0.04 < luminance(on_photo) < 0.75:
        on_photo = paper if luminance(paper) >= 0.75 else mix(paper, "#ffffff", 0.85)
    return {"ink": ink, "paper": paper, "accent": accent, "accent_2": accent_2, "on_photo": on_photo, "tint": tint}


def _banned_words(signals: dict) -> tuple[str, ...]:
    if signals["is_bakery"]:
        return ()
    return _BAKERY_WORDS if signals["field"] == "food" else _BAKERY_WORDS_NON_FOOD


def _contains(text: str, word: str) -> bool:
    if _HEBREW.search(word):
        return word in text
    return re.search(rf"(?<![a-z]){re.escape(word)}(?![a-z])", text.lower()) is not None


def _clean_direction(value, banned: tuple[str, ...], limit: int = 220) -> str:
    """The model's phrase minus stock wording and words that are not this business's."""
    text = " ".join(str(value or "").split())
    if not text:
        return ""
    kept = []
    for segment in re.split(r"[,;]", text):
        part = segment.strip()
        if not part:
            continue
        lowered = part.lower()
        if any(phrase in lowered for phrase in _STOCK_PHRASES) or any(_contains(part, word) for word in banned):
            continue
        kept.append(part)
    return ", ".join(kept)[:limit].strip(" ,")


_FIELD_FALLBACK_PROPS = {
    "food": ["the dish as it is served here", "the counter it is sold from"],
    "fashion": ["the garment on its own hanger", "a fitting-room mirror"],
    "jewelry": ["the piece on the owner's own display tray", "a jeweller's loupe"],
    "beauty": ["the products the treatment uses", "the treatment chair"],
    "health": ["the clinic's own equipment", "a folded towel"],
    "fitness": ["the studio's own equipment", "a water bottle"],
    "home": ["a material sample", "a finished corner of a real project"],
    "real_estate": ["the property's real windows and light", "a set of keys"],
    "professional": ["the desk where the work is done", "a printed document"],
    "education": ["the materials of the class", "a used notebook"],
    "hospitality": ["the place's own view", "a made bed or a set table"],
    "kids": ["the product in a child-sized setting", "a toy box"],
    "pets": ["the product next to a pet bowl", "a leash"],
    "gifts": ["the wrapped gift", "a ribbon offcut"],
}


def local_photo(signals: dict) -> dict:
    """Photo direction without the model, still from this business's own words."""
    palette = ", ".join(p["hex"] for p in signals["palette"][:4])
    offer = (signals["offerings"] or signals["name"] or "").strip()
    return {
        "grade": f"colours kept close to its own palette ({palette})" if palette else "true-to-life colour",
        "light": signals["photography"][:200] or "one window as the only light source",
        "angle": "at the height of someone standing at the counter, 50mm",
        "props": _FIELD_FALLBACK_PROPS.get(signals["field"], ["what the business really works with"])[:3],
        "background": (signals["visual_style"][:200] or f"the real place where {offer[:80]} happens"),
        "never": list(DEFAULT_NEVER),
    }


def validate_photo(raw, signals: dict) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    banned = _banned_words(signals)
    fallback = local_photo(signals)
    out: dict = {}
    for key in ("grade", "light", "angle", "background"):
        out[key] = _clean_direction(raw.get(key), banned) or fallback[key]
    props = []
    for item in raw.get("props") or []:
        cleaned = _clean_direction(item, banned, limit=80)
        if cleaned and cleaned not in props:
            props.append(cleaned)
    out["props"] = props[:5] or fallback["props"]
    never = list(DEFAULT_NEVER)
    for item in raw.get("never") or []:
        cleaned = " ".join(str(item or "").split())[:100]
        if cleaned and cleaned.lower() not in {n.lower() for n in never}:
            never.append(cleaned)
    out["never"] = never[:12]
    return out


def _clean_rationale(value, dna: dict) -> str:
    text = " ".join(str(value or "").split()).replace("!", "")
    text = text.replace(" — ", ", ").replace("—", ", ")
    # A font's own name may stay in Latin letters; any other English word may not.
    latin_check = text
    for font in FONTS.values():
        latin_check = latin_check.replace(font.family, "")
    if len(_HEBREW.findall(text)) < 6 or re.search(r"[A-Za-z]{3,}", latin_check):
        family = FONTS[dna["type"]["display"]].family
        motif = MOTIFS[dna["motif"]["kind"]]
        text = f"כותרות ב-{family}, {motif} שחוזר בכל פוסט והצבעים שלכם: ככה מזהים אתכם בפיד."
    return text[:160]


def _vertical_photo(composition: str) -> bool:
    comp = COMPOSITIONS[composition]
    return comp.photo and "9:16" in comp.crops


def validate_dna(raw, signals: dict, cands: dict, seed: int, *, source: str = "model",
                 base: dict | None = None, locked=()) -> dict:
    """The model's answer, reduced to library keys and valid values. Every missing or
    unknown value falls back to a seeded pick (the site's own font first)."""
    raw = raw if isinstance(raw, dict) else {}
    rng = random.Random(f"fallback:{seed}")
    mapped = signals.get("mapped_fonts") or []

    t = raw.get("type") if isinstance(raw.get("type"), dict) else {}
    display = t.get("display") if t.get("display") in cands["display"] else _prefer(mapped, cands["display"], rng)
    # A pair is two families: one family for both is what every template does. (The owner
    # may still choose that by hand, PUT /brand/dna.)
    text_pool = [key for key in cands["text"] if key != display] or [key for key in TEXT_FONTS if key != display]
    text = t.get("text") if t.get("text") in text_pool else _prefer(mapped, text_pool, rng)
    display_weight = snap_weight(display, t.get("display_weight", 700))
    text_weight = snap_weight(text, t.get("text_weight", 400), role="text")
    type_gene = {
        "display": display,
        "display_weight": display_weight,
        "text": text,
        "text_weight": text_weight,
        "headline_case": t.get("headline_case") if t.get("headline_case") in HEADLINE_CASES else "sentence",
        "scale": t.get("scale") if t.get("scale") in TYPE_SCALES else rng.choice(TYPE_SCALES),
    }

    chosen = _unique(c for c in (raw.get("compositions") or []) if isinstance(c, str) and c in cands["compositions"])
    chosen = chosen[:4]
    # Product posts need a photo, and reels and stories a 9:16 layout: at least two of
    # the set must be photo compositions that work in both frames.
    extra = [c for c in cands["compositions"] if _vertical_photo(c) and c not in chosen]
    while sum(1 for c in chosen if _vertical_photo(c)) < 2 and extra:
        if len(chosen) >= 4:
            chosen.pop(max(i for i, c in enumerate(chosen) if not _vertical_photo(c)))
        chosen.append(extra.pop(0))
    if len(chosen) < 3:
        rest = [c for c in cands["compositions"] if c not in chosen]
        rng.shuffle(rest)
        chosen += rest[: 3 - len(chosen)]
    compositions = chosen[:4]

    m = raw.get("motif") if isinstance(raw.get("motif"), dict) else {}
    motif = {
        "kind": m.get("kind") if m.get("kind") in cands["motif"] else rng.choice(cands["motif"]),
        "color": m.get("color") if m.get("color") in MOTIF_COLORS else "accent",
        "density": m.get("density") if m.get("density") in MOTIF_DENSITIES else "low",
    }
    s = raw.get("signature") if isinstance(raw.get("signature"), dict) else {}
    if s.get("kind") in cands["signature"]:
        sig_kind = s["kind"]
    elif signals["has_logo"] and "corner_mark" in cands["signature"]:
        sig_kind = "corner_mark"
    else:
        sig_kind = rng.choice(cands["signature"])
    use_logo = signals["has_logo"] and (s.get("use_logo") if isinstance(s.get("use_logo"), bool) else True)
    c = raw.get("copy") if isinstance(raw.get("copy"), dict) else {}
    dna = {
        "version": DNA_VERSION,
        "seed": seed,
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "field": signals["field"],
        "type": type_gene,
        "colors": validate_colors(raw.get("colors"), signals, seed),
        "compositions": compositions,
        "motif": motif,
        "signature": {"kind": sig_kind, "use_logo": bool(use_logo)},
        "photo": validate_photo(raw.get("photo"), signals),
        "copy": {
            "price_style": c.get("price_style") if c.get("price_style") in PRICE_STYLES else rng.choice(PRICE_STYLES),
            "cta_style": c.get("cta_style") if c.get("cta_style") in CTA_STYLES else rng.choice(CTA_STYLES),
        },
        "rationale_he": "",
        "distance_checked_against": 0,
        "source": source,
    }
    _apply_locked(dna, base, locked)
    dna["rationale_he"] = _clean_rationale(raw.get("rationale_he"), dna)
    return dna


def _apply_locked(dna: dict, base: dict | None, locked) -> None:
    if not base:
        return
    genes = [gene for gene in (locked or ()) if gene in GENES and isinstance(base.get(gene), (dict, list))]
    for gene in genes:
        dna[gene] = copy.deepcopy(base[gene])
    if genes:
        dna["locked"] = sorted(set(genes))


def is_valid_dna(dna) -> bool:
    """Shape check for a stored DNA (other businesses' rows are read with it)."""
    if not isinstance(dna, dict):
        return False
    t = dna.get("type") or {}
    return (
        isinstance(t, dict)
        and t.get("display") in FONTS
        and t.get("text") in FONTS
        and isinstance(dna.get("colors"), dict)
        and isinstance(dna.get("compositions"), list)
        and all(c in COMPOSITIONS for c in dna["compositions"])
        and (dna.get("motif") or {}).get("kind") in MOTIFS
        and (dna.get("signature") or {}).get("kind") in SIGNATURES
    )


# --- distance -------------------------------------------------------------------------------


def _type_distance(a: dict, b: dict) -> float:
    same_display = a.get("display") == b.get("display")
    same_text = a.get("text") == b.get("text")
    if same_display and same_text:
        return 0.0
    if same_display:
        return 0.4
    if same_text:
        return 0.75
    return 1.0


def palette_distance(a: dict, b: dict) -> float:
    """Mean Lab difference of the roles that carry a card (paper, ink, accent, accent_2),
    scaled so 50 (a clearly different colour) or more is 1."""
    diffs = []
    for role in ("paper", "ink", "accent", "accent_2"):
        x, y = _norm_hex((a or {}).get(role)), _norm_hex((b or {}).get(role))
        if x and y:
            diffs.append(delta_e(x, y))
    if not diffs:
        return 1.0
    return min(1.0, (sum(diffs) / len(diffs)) / 50)


def gene_distances(a: dict, b: dict) -> dict[str, float]:
    ca, cb = set(a.get("compositions") or []), set(b.get("compositions") or [])
    union = ca | cb
    ma, mb = a.get("motif") or {}, b.get("motif") or {}
    if ma.get("kind") != mb.get("kind"):
        motif = 1.0
    else:
        motif = 0.0 if (ma.get("color"), ma.get("density")) == (mb.get("color"), mb.get("density")) else 0.15
    return {
        "type": _type_distance(a.get("type") or {}, b.get("type") or {}),
        "motif": motif,
        "signature": 0.0 if (a.get("signature") or {}).get("kind") == (b.get("signature") or {}).get("kind") else 1.0,
        "compositions": 1 - (len(ca & cb) / len(union)) if union else 0.0,
        "palette": palette_distance(a.get("colors") or {}, b.get("colors") or {}),
    }


def distance(a: dict, b: dict) -> float:
    """0 = the same DNA, 1 = nothing in common. Weighted over type pair, motif,
    signature, composition set and palette (DISTANCE_WEIGHTS)."""
    parts = gene_distances(a, b)
    return round(sum(DISTANCE_WEIGHTS[gene] * value for gene, value in parts.items()), 4)


def same_type_and_motif(a: dict, b: dict) -> bool:
    ta, tb = a.get("type") or {}, b.get("type") or {}
    return (
        ta.get("display") == tb.get("display")
        and ta.get("text") == tb.get("text")
        and (a.get("motif") or {}).get("kind") == (b.get("motif") or {}).get("kind")
    )


def close_genes(dna: dict, other: dict) -> dict[str, set[str]]:
    """What to exclude when `dna` is too close to `other`: the genes they share."""
    parts = gene_distances(dna, other)
    out: dict[str, set[str]] = {}
    t = dna.get("type") or {}
    if parts["type"] <= 0.4:
        out["display"] = {t.get("display")}
    elif parts["type"] < 1:
        out["text"] = {t.get("text")}
    if parts["motif"] < 1:
        out["motif"] = {(dna.get("motif") or {}).get("kind")}
    if parts["signature"] == 0:
        out["signature"] = {(dna.get("signature") or {}).get("kind")}
    shared = set(dna.get("compositions") or []) & set(other.get("compositions") or [])
    if len(shared) >= 2:
        out["compositions"] = shared
    return out


_LOCK_BLOCKS = {"type": ("display", "text"), "motif": ("motif",), "signature": ("signature",),
                "compositions": ("compositions",)}


def _drop_locked(exclusions: dict, locked) -> dict:
    blocked = {key for gene in (locked or ()) for key in _LOCK_BLOCKS.get(gene, ())}
    return {key: value for key, value in exclusions.items() if key not in blocked and value}


def check_unique(dna: dict, same_field: list[dict], everyone: list[dict], locked=()) -> tuple[bool, dict]:
    """(unique?, genes to exclude to get there)."""
    found: dict = {}
    close = False
    for other in same_field:
        if distance(dna, other) < FIELD_MIN_DISTANCE:
            close = True
            found = _merge_exclusions(found, close_genes(dna, other))
    for other in everyone:
        if same_type_and_motif(dna, other):
            close = True
            found = _merge_exclusions(found, {"display": {(dna.get("type") or {}).get("display")},
                                               "motif": {(dna.get("motif") or {}).get("kind")}})
    return (not close), _drop_locked(found, locked)


def _min_distance(dna: dict, same_field: list[dict], everyone: list[dict]) -> float:
    values = [distance(dna, other) for other in same_field]
    values += [0.0 for other in everyone if same_type_and_motif(dna, other)]
    return min(values) if values else 1.0


def move_apart(dna: dict, exclusions: dict, signals: dict, seed: int, same_field: list[dict],
               everyone: list[dict], locked=()) -> dict:
    """After MAX_TRIES model answers that stayed too close: change only the close genes,
    locally and deterministically, to the nearest-to-the-brand option that is unique.
    If no option is, keep the one furthest from everyone."""
    best, best_score = dna, _min_distance(dna, same_field, everyone)
    blocked = {gene for gene in (locked or ())}
    for attempt in range(40):
        rng = random.Random(f"apart:{seed}:{attempt}")
        variant = copy.deepcopy(dna)
        if "type" not in blocked and exclusions.get("display"):
            pool = [k for k in DISPLAY_FONTS if k not in exclusions["display"]]
            variant["type"]["display"] = _prefer(signals.get("mapped_fonts") or [], pool, rng) if attempt == 0 else rng.choice(pool)
            variant["type"]["display_weight"] = snap_weight(variant["type"]["display"], variant["type"]["display_weight"])
        if "type" not in blocked and (exclusions.get("text") or variant["type"]["text"] == variant["type"]["display"]):
            pool = [k for k in TEXT_FONTS if k not in exclusions.get("text", set()) and k != variant["type"]["display"]]
            variant["type"]["text"] = rng.choice(pool)
            variant["type"]["text_weight"] = snap_weight(variant["type"]["text"], variant["type"]["text_weight"], role="text")
        if "motif" not in blocked and exclusions.get("motif"):
            variant["motif"]["kind"] = rng.choice([k for k in MOTIFS if k not in exclusions["motif"]])
        if "signature" not in blocked and exclusions.get("signature"):
            pool = [k for k in SIGNATURES if k not in exclusions["signature"]]
            if pool:
                variant["signature"]["kind"] = rng.choice(pool)
        if "compositions" not in blocked and exclusions.get("compositions"):
            keep = [c for c in variant["compositions"] if c not in exclusions["compositions"]]
            pool = [c for c in COMPOSITIONS if c not in exclusions["compositions"] and c not in keep]
            rng.shuffle(pool)
            photo_first = sorted(pool, key=lambda c: not _vertical_photo(c))
            comps = (keep + photo_first)[: max(3, min(4, len(dna["compositions"])))]
            for extra in (c for c in photo_first if _vertical_photo(c) and c not in comps):
                if sum(1 for c in comps if _vertical_photo(c)) >= 2:
                    break
                if len(comps) >= 4:
                    comps.pop(max(i for i, c in enumerate(comps) if not _vertical_photo(c)))
                comps.append(extra)
            variant["compositions"] = comps
        ok, _ = check_unique(variant, same_field, everyone)
        if ok:
            return variant
        score = _min_distance(variant, same_field, everyone)
        if score > best_score:
            best, best_score = variant, score
    return best


# --- storage ------------------------------------------------------------------------------------


def load_dna(business) -> dict | None:
    dna = loads(getattr(business, "brand_dna_json", "") or "", None)
    return dna if is_valid_dna(dna) else None


def store_dna(business, dna: dict) -> None:
    business.brand_dna_json = dumps(dna)


def peers(db, business) -> tuple[list[dict], list[dict]]:
    """(other DNAs in the same field, every other DNA)."""
    if db is None:
        return [], []
    from app.models import Business

    field = dna_field(business)
    same: list[dict] = []
    everyone: list[dict] = []
    rows = db.query(Business.id, Business.brand_dna_json).filter(Business.id != business.id).all()
    for _id, raw in rows:
        if not raw:
            continue
        dna = loads(raw, None)
        if not is_valid_dna(dna):
            continue
        everyone.append(dna)
        if dna.get("field") == field:
            same.append(dna)
    return same, everyone


def build_dna(db, business, *, seed: int, base: dict | None = None, locked=(), avoid: list[dict] | None = None,
              use_model: bool = True) -> dict:
    """Generate a DNA for `business` that is unique in its field. Does not store it.

    `avoid` holds DNAs this one must also differ from (the business's current DNA, when
    the owner asks for another style). `locked` genes are copied from `base` unchanged.
    """
    signals = signals_for(db, business, with_images=use_model)
    same_field, everyone = peers(db, business)
    targets = same_field + [dna for dna in (avoid or []) if dna]
    gene_locks = [gene for gene in (locked or ()) if gene in GENES]
    fixed = {gene: base[gene] for gene in gene_locks if base and gene in base}
    exclusions: dict = {}
    model_up = use_model
    dna: dict | None = None
    unique = False
    for _attempt in range(MAX_TRIES):
        cands = candidates(seed, signals, exclusions)
        raw: dict = {}
        source = "local"
        if model_up:
            try:
                raw = _ask_model(
                    dna_prompt(signals, cands, targets, exclusions, seed, fixed=fixed),
                    dna_schema(cands),
                    signals["images"],
                )
                source = "model"
            except Exception as exc:  # the model is down or refused: build it locally
                log.warning("design dna: model call failed for business %s: %s", business.id, exc)
                model_up = False
        dna = validate_dna(raw, signals, cands, seed, source=source, base=base, locked=gene_locks)
        unique, found = check_unique(dna, targets, everyone, gene_locks)
        if unique or not found:
            break
        exclusions = _merge_exclusions(exclusions, found)
    assert dna is not None
    if not unique:
        _, found = check_unique(dna, targets, everyone, gene_locks)
        if found:
            dna = move_apart(dna, _merge_exclusions(exclusions, found), signals, seed, targets, everyone, gene_locks)
    dna["distance_checked_against"] = len(everyone)
    return dna


def create_dna(db, business) -> dict:
    """First DNA for a business: built, checked, stored (the caller commits)."""
    dna = build_dna(db, business, seed=seed_for(business))
    store_dna(business, dna)
    return dna


def regenerate_dna(db, business) -> dict:
    """'לנסות סגנון אחר': a new seed within the same signals, different from the current
    style and still unique. Genes the owner set stay."""
    current = load_dna(business)
    if current is None:
        return create_dna(db, business)
    locked = [gene for gene in current.get("locked") or [] if gene in GENES]
    dna = build_dna(db, business, seed=next_seed(int(current.get("seed") or 0)), base=current, locked=locked,
                    avoid=[current])
    store_dna(business, dna)
    return dna


def preview_dna(business) -> dict:
    """A DNA without the model or the database (deterministic, not stored), for posts of
    a business whose DNA is not ready yet."""
    return build_dna(None, business, seed=seed_for(business), use_model=False)


def dna_for_posts(business) -> dict:
    return load_dna(business) or preview_dna(business)


class DnaEditError(ValueError):
    """An owner edit that is not valid; the message is Hebrew, for the owner."""


def edit_dna(db, business, edit: dict) -> dict:
    """The owner keeps or changes a few genes (type, motif, colours). Validated; what the
    owner set is locked, so a later 'another style' or re-scan keeps it."""
    current = load_dna(business) or create_dna(db, business)
    dna = copy.deepcopy(current)
    locked = set(current.get("locked") or [])
    type_edit = edit.get("type") or {}
    if type_edit:
        t = dna["type"]
        display = type_edit.get("display") or t["display"]
        text = type_edit.get("text") or t["text"]
        if display not in DISPLAY_FONTS:
            raise DnaEditError("הפונט לכותרות לא נמצא ברשימת הפונטים.")
        if text not in TEXT_FONTS:
            raise DnaEditError("הפונט לטקסט לא נמצא ברשימת הפונטים, או שהוא מתאים רק לכותרות.")
        t["display"], t["text"] = display, text
        t["display_weight"] = snap_weight(display, type_edit.get("display_weight", t["display_weight"]))
        t["text_weight"] = snap_weight(text, type_edit.get("text_weight", t["text_weight"]), role="text")
        locked.add("type")
    motif_edit = edit.get("motif") or {}
    if motif_edit:
        m = dna["motif"]
        kind = motif_edit.get("kind") or m["kind"]
        if kind not in MOTIFS:
            raise DnaEditError("הקישוט הזה לא נמצא ברשימה.")
        color = motif_edit.get("color") or m["color"]
        density = motif_edit.get("density") or m["density"]
        if color not in MOTIF_COLORS or density not in MOTIF_DENSITIES:
            raise DnaEditError("הצבע או הצפיפות של הקישוט לא מהרשימה.")
        dna["motif"] = {"kind": kind, "color": color, "density": density}
        locked.add("motif")
    colors_edit = edit.get("colors") or {}
    if colors_edit:
        updated = dict(dna["colors"])
        for role, value in colors_edit.items():
            if role not in COLOR_ROLES:
                raise DnaEditError("אחד הצבעים לא מוכר.")
            normalized = _norm_hex(value)
            if not normalized:
                raise DnaEditError("צבע צריך להיות בפורמט #RRGGBB.")
            updated[role] = normalized
        if contrast(updated["ink"], updated["paper"]) < MIN_TEXT_CONTRAST:
            raise DnaEditError("צבע הטקסט לא נקרא על צבע הרקע. בחרו טקסט כהה יותר או רקע בהיר יותר.")
        dna["colors"] = updated
        locked.add("colors")
    if edit.get("keep"):
        locked.add(KEEP_ALL)
    if locked:
        dna["locked"] = sorted(locked)
    store_dna(business, dna)
    return dna


def refresh_after_scan(bind, business_id: int) -> None:
    """Background, after a site scan or signup: build (or rebuild) the business's DNA.

    Never raises: the scan and the signup already answered. A style the owner kept
    ("לשמור") is left alone; genes the owner set stay. Off when DESIGN_DNA_ON_SCAN=false.
    """
    if not get_settings().design_dna_on_scan or bind is None:
        return
    from sqlalchemy.orm import sessionmaker

    from app.models import Business

    db = sessionmaker(bind=bind, autoflush=False, autocommit=False)()
    try:
        business = db.get(Business, business_id)
        if business is None:
            return
        current = load_dna(business)
        if current is None:
            create_dna(db, business)
        elif KEEP_ALL in (current.get("locked") or []):
            return
        else:
            locked = [gene for gene in current.get("locked") or [] if gene in GENES]
            store_dna(business, build_dna(db, business, seed=int(current.get("seed") or seed_for(business)),
                                          base=current, locked=locked))
        db.commit()
    except Exception:  # background: log, never surface
        log.exception("design dna: refresh after scan failed for business %s", business_id)
        db.rollback()
    finally:
        db.close()
