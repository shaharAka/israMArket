"""Design DNA v2: one art direction per business, unique in its field (docs/design-dna.md).

A business's DNA (`Business.brand_dna_json`, the `brand_dna` contract) is generated once
from the business's own signals: its logo (a same-origin copy, services/brand_logo.py, and
its pixel colours), the colours of its site, its fonts (each mapped to the nearest library
font), its photos, field, voice, audience and Instagram. Every post is then drawn from it
(services/post_design.py).

Revision 1 (owner review of the first renders): a style is an *art direction in words*
(`direction`: feel, world, photo, text, never), and the parameters follow from it:

* colours are the brand's own (services/dna_colors.py): the logo's pixels first, then
  the site; every role is a brand colour (ΔE <= 6) or one derived by lightness only, and
  `colors_source` says which;
* motif `none` by default; any other only with what in the brand it comes from
  (`motif.from` + `note_he`, checked against the brand's own words);
* the real logo, or the name in the display face: never an invented monogram;
* `mix`: how many posts are photo only, headline, type-led (photo-led by default).

How it stays unique by construction:

* A per-business seed picks which library options are on the table this time.
* The model may only answer with library keys (the schema's enums), and every answer is
  validated again here (`validate_dna`).
* The result is compared with every other DNA in the same field (`distance`: type pair,
  compositions, photo direction, motif, mix, signature; palette barely counts) and, for
  the overall look, with every DNA at all. Too close: regenerated with the close genes
  excluded, at most MAX_TRIES model calls, then moved apart locally. Colours are never
  moved: two same-field businesses differ by type, photography and composition.

A v1 DNA is upgraded on read without a model call (`upgrade_v1`, `source: "upgraded"`),
so a later regenerate or re-scan improves it.

Owner-facing: GET/PUT /brand/dna, POST /brand/dna/regenerate (routers/brand_dna.py).
Additive keys: `source` ("model" | "local" | "upgraded"), `locked` (genes the owner set;
"all" = the owner kept the style), `adjusted` (the owner's word adjustments, replayed on a
rebuild), `colors_base` (the brand colour each derived role came from).
"""

from __future__ import annotations

import copy
import hashlib
import logging
import random
import re
from datetime import datetime, timezone

from app.config import get_settings
from app.services import brand_logo
from app.services import dna_colors
from app.services.business_fields import coerce_field, field_label
from app.services.dna_library import (
    ADJUST_TEXT,
    ADJUST_TONES,
    COLOR_ROLES,
    COMPOSITIONS,
    DISPLAY_FONTS,
    FONTS,
    GENERIC_MOTIFS,
    HEADLINE_CASES,
    LEGACY_SIGNATURES,
    LOGO_ON,
    LOGO_SIGNATURES,
    MOTIF_COLORS,
    MOTIF_DENSITIES,
    MOTIF_EVIDENCE,
    MOTIF_FROM,
    MOTIF_FROM_OWNER,
    MOTIFS,
    NAME_SIGNATURES,
    NO_MOTIF,
    PHOTO_FREE_COMPOSITIONS,
    PHOTO_ONLY_COMPOSITIONS,
    PRICE_STYLES,
    SIGNATURES,
    TEXT_FONTS,
    TEXT_MODES,
    TYPE_SCALES,
    nearest_font,
    snap_weight,
)
from app.services.jsonutil import dumps, loads

log = logging.getLogger(__name__)

DNA_VERSION = 2
# Model calls per generation, the first one included. After that the close genes are
# moved apart locally, without the model.
MAX_TRIES = 3
# Below this, two DNAs in the same field read as the same template (see `distance`).
FIELD_MIN_DISTANCE = 0.4
# Colours are the brand's own and never moved for uniqueness, so the palette barely counts:
# same-field businesses are told apart by type, composition and photography.
DISTANCE_WEIGHTS = {"type": 0.35, "compositions": 0.25, "photo": 0.15, "motif": 0.10, "mix": 0.05,
                    "signature": 0.05, "palette": 0.05}
GENES = ("direction", "type", "colors", "compositions", "mix", "motif", "signature", "photo", "copy")
# What the owner may set by hand (PUT /brand/dna).
EDITABLE_GENES = ("type", "motif", "colors")
KEEP_ALL = "all"
# How many options of each gene the seed puts on the table.
CANDIDATE_COUNTS = {"display": 6, "text": 5, "compositions": 7}
MAX_MODEL_IMAGES = 3
MIN_TEXT_CONTRAST = dna_colors.MIN_TEXT_CONTRAST
MAX_ADJUSTMENTS = 8

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
# The same, in the Hebrew the direction is written in, plus marketing words that say
# nothing about any one business ("חוויה", "פתרון", "מותג"...). A clause with one is dropped.
GENERIC_HE = (
    "חוויה", "חוויית", "פתרון", "פתרונות", "מותג", "איכותי", "איכות גבוהה", "מקצועי", "מקצועיות",
    "ייחודי", "מושלם", "מדהים", "מהמם", "יוקרתי", "יוקרה", "חדשני", "בלתי נשכח", "ברמה הגבוהה",
    "הטוב ביותר", "הכי טוב", "מרהיב", "עוצר נשימה", "קסום", "פרימיום", "אולטימטיבי", "מזמין",
    "מזמינה", "אווירה חמימה", "סטייל", "טרנדי", "אינסטגרמי", "וייב",
    "אור טבעי רך", "עומק שדה רדוד", "בוקה", "קולנועי", "שולחן עץ כפרי", "רקע שיש", "נקי ומודרני",
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
_LATIN_WORD = re.compile(r"[A-Za-z]{3,}")

DNA_SYSTEM = (
    "You are the art director who gives one Israeli small business its own visual identity "
    "for social posts. You answer only with the JSON asked for, using only the keys offered."
)

# --- the share of posts by text mode, per field (Revision 1, rule 4: photo-led) ---------

FIELD_MIX = {
    "food": (0.5, 0.4, 0.1),
    "fashion": (0.55, 0.4, 0.05),
    "jewelry": (0.6, 0.35, 0.05),
    "beauty": (0.5, 0.4, 0.1),
    "health": (0.4, 0.45, 0.15),
    "fitness": (0.45, 0.4, 0.15),
    "home": (0.55, 0.4, 0.05),
    "real_estate": (0.5, 0.45, 0.05),
    "professional": (0.3, 0.45, 0.25),
    "education": (0.35, 0.45, 0.2),
    "hospitality": (0.6, 0.35, 0.05),
    "kids": (0.45, 0.4, 0.15),
    "pets": (0.5, 0.4, 0.1),
    "gifts": (0.5, 0.4, 0.1),
    "other": (0.45, 0.4, 0.15),
}
_QUIET_VOICE = ("שקט", "רגוע", "עדין", "מינימל", "נקי", "איטי", "מאופק", "צנוע", "אלגנט", "calm", "quiet",
                "minimal", "understated", "elegant")
_BOLD_VOICE = ("צעיר", "משחק", "נועז", "אנרגטי", "צבעוני", "חצוף", "שמח", "תוסס", "קליל", "playful", "bold",
               "energetic", "loud", "fun")
MIX_LIMITS = {"photo_only": (0.2, 0.85), "headline": (0.15, 0.7), "type_led": (0.0, 0.25)}

# --- the direction without the model, from the business's own words -----------------------

FIELD_WORLD_HE = {
    "food": "הדלפק והמטבח, הכלים שמגישים בהם והידיים שמכינות",
    "fashion": "החנות, המדפים והבדים עצמם, קרוב מספיק לראות תפרים",
    "jewelry": "שולחן העבודה, המגש שעליו מציגים, והתכשיט בגודל האמיתי שלו",
    "beauty": "הכיסא, המדף והמוצרים שבאמת משתמשים בהם בטיפול",
    "health": "החדר שבו מטפלים והציוד שלו",
    "fitness": "הסטודיו, הרצפה והציוד, וגוף בתנועה",
    "home": "החומרים והפינות של עבודות שהסתיימו באמת",
    "real_estate": "החדרים, החלונות והנוף של הנכס עצמו",
    "professional": "השולחן, המסמכים והכלים של העבודה עצמה",
    "education": "החומרים על השולחן, הלוח והידיים שעובדות",
    "hospitality": "המקום עצמו, החדרים והנוף בשעה שהאורחים מכירים",
    "kids": "המוצרים בגובה של ילד, בבית או בחנות",
    "pets": "המוצר ליד הקערה, המיטה או הרצועה של חיה אמיתית",
    "gifts": "העטיפה, הכרטיס והמתנה ברגע שפותחים אותה",
    "other": "המקום שבו העבודה נעשית, עם החומרים שלו",
}
FIELD_PHOTO_HE = {
    "food": "צילום קרוב של מה שיוצא מהדלפק, כמו שהוא מוגש, עם סימנים של ידיים ושימוש",
    "fashion": "הבגד על קולב או על הגוף בלי פנים, קרוב מספיק לראות את האריג",
    "jewelry": "התכשיט בגודל אמיתי, עם ההשתקפות של המתכת, על המגש של החנות",
    "beauty": "התוצאה והכלים מקרוב, עור ושיער אמיתיים בלי ריטוש",
    "health": "הידיים בעבודה והחדר עצמו, רגוע וישר",
    "fitness": "תנועה מאחור או מהכתפיים ומטה, באור של הסטודיו",
    "home": "הפינה הגמורה או פרט קרוב של חומר, באור של החדר",
    "real_estate": "החדרים באור של שעה אמיתית, קווים ישרים",
    "professional": "פרטים של העבודה עצמה: מסמכים, כלים, החלון של המשרד",
    "education": "שיעור בזמן אמת, חומרים על השולחן וידיים שעובדות",
    "hospitality": "המקום בשעה שהאורחים מכירים, עם סימנים שגרים בו",
    "kids": "המוצרים בגובה של ילד, צבע שבא מהמוצרים עצמם",
    "pets": "המוצר בשימוש של חיה אמיתית, בגובה העיניים שלה",
    "gifts": "המתנה ביד, העטיפה נפתחת על הדלפק",
    "other": "מה שהעסק עושה, במקום שבו זה קורה, באור של המקום",
}
FIELD_NEVER_HE = {
    "food": "אוכל מבריק שנראה כמו פלסטיק",
    "fashion": "דוגמנית עם פנים מלוטשות של פרסומת",
    "jewelry": "ניצוצות ואפקטים של ברק",
    "beauty": "פנים מרוטשות של פרסומת",
    "health": "רופאים מחייכים ממאגר תמונות",
    "fitness": "גוף מושלם של פרסומת",
    "home": "חדר מעוצב שלא שלכם",
    "real_estate": "שמיים מוחלפים וריהוט וירטואלי",
    "professional": "איש בחליפה שמצביע על מחשב",
    "education": "פנים של ילדים בפוקוס",
    "hospitality": "חדר מלון גנרי",
    "kids": "פנים של ילדים",
    "pets": "חיה מצוירת או מושלמת מדי",
    "gifts": "מתנה צפה על רקע לבן",
    "other": "תמונה ממאגר",
}


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


# --- colours (services/dna_colors.py; these names stay for older callers) ---------------

luminance = dna_colors.luminance
contrast = dna_colors.contrast
to_lab = dna_colors.to_lab
delta_e = dna_colors.delta_e


def _norm_hex(value) -> str | None:
    return dna_colors.norm_hex(value)


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

    # The logo: a same-origin copy and its pixels (services/brand_logo.py). Its colours are
    # the first colour evidence; before a copy exists, the scan's own logo measurement.
    logo_record = brand_logo.load(business)
    logo_ok = brand_logo.usable(logo_record)
    if logo_record and logo_record.get("status") in {"ok", "unsupported"} and logo_record.get("colors"):
        logo_colors = list(logo_record.get("colors") or [])
    else:
        logo_colors = [item for item in (evidence.get("logo") or []) if isinstance(item, dict)]
    css = [value for value in (raw.get("colors") or []) if isinstance(value, str)]
    swatches = dna_colors.evidence_from(logo_colors, palette, evidence.get("screenshot") or [], css)
    logo_bytes = None
    if logo_ok and with_images:
        logo_bytes = read_stored_bytes(str(logo_record["public_url"]))

    photo_notes: list[dict] = []
    images: list[tuple[bytes, str]] = []
    image_labels: list[str] = []
    if logo_bytes:
        images.append(logo_bytes)
        image_labels.append("the business's own logo (its real colours and shapes)")
    photo_count = 0
    for photo in stored.get("real_photos") or []:
        alt = str(photo.get("alt") or "").strip()
        if alt:
            photo_notes.append({"source": "site", "text": alt[:160]})
        if with_images and photo_count < MAX_MODEL_IMAGES:
            loaded = read_stored_bytes(str(photo.get("public_url") or ""))
            if loaded and loaded[1] in {"image/jpeg", "image/png", "image/webp"}:
                images.append(loaded)
                image_labels.append("a photo from the business's own website")
                photo_count += 1
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
            if with_images and photo_count < MAX_MODEL_IMAGES and asset.mime in {"image/jpeg", "image/png", "image/webp"}:
                loaded = read_stored_bytes(image_public_url(business.id, asset.filename))
                if loaded:
                    images.append(loaded)
                    image_labels.append("a photo the owner uploaded to their library")
                    photo_count += 1
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

    name = business.name or brand.get("business_name") or ""
    offerings = (business.offerings or "")[:400]
    location = getattr(business, "location", "") or ""
    featured = " ".join(
        str(item.get("name") or "") if isinstance(item, dict) else str(item or "")
        for item in stored.get("featured_items") or []
    )
    notes_text = " ".join(note["text"] for note in photo_notes)
    text_blob = " ".join(
        str(part or "") for part in (business.name, business.offerings, brand.get("visual_style"), brand.get("photography"))
    )
    logo_url = brand_logo.logo_url_of(business)
    return {
        "name": name,
        "field": field,
        "field_label": field_label(field),
        "offerings": offerings,
        "location": location,
        "business_model": getattr(business, "business_model", "") or "products",
        "palette": palette,
        "measured_colors": measured[:8],
        "swatches": swatches,
        "typography": {"primary": typography.get("primary") or "", "mood": typography.get("mood") or ""},
        "site_fonts": site_fonts,
        "mapped_fonts": [key for key in mapped if key in FONTS],
        "visual_style": brand.get("visual_style") or "",
        "photography": brand.get("photography") or "",
        "voice": brand.get("voice") or "",
        "audience": brand.get("audience") or "",
        "logo_description": brand.get("logo_description") or "",
        # A same-origin copy of the logo exists (services/brand_logo.py).
        "has_logo": logo_ok,
        # The site has a logo, whether or not a copy could be made.
        "logo_on_site": bool(logo_url),
        "logo": {
            "status": (logo_record or {}).get("status") or ("missing" if logo_url else "none"),
            "public_url": str((logo_record or {}).get("public_url") or "") if logo_ok else "",
            "logo_on": (logo_record or {}).get("logo_on") if (logo_record or {}).get("logo_on") in LOGO_ON else "any",
            "colors": [item.get("hex") for item in logo_colors if isinstance(item, dict) and item.get("hex")][:5],
        },
        "brand_source": brand.get("source") or ("site" if brand else ""),
        "photo_notes": photo_notes[:12],
        "instagram": instagram,
        "images": images,
        "image_labels": image_labels,
        "is_bakery": field == "food" and bool(_BAKERY_HINT.search(text_blob)),
        # The brand's own words a motif must be found in (Revision 1, rule 5).
        "logo_text": brand.get("logo_description") or "",
        "place_text": " ".join(str(part or "") for part in (brand.get("visual_style"), brand.get("photography"),
                                                             location, notes_text)),
        "product_text": " ".join(str(part or "") for part in (offerings, featured, notes_text,
                                                               " ".join(brand.get("offers_seen") or []))),
    }


def _own_stems(signals: dict) -> set[str]:
    from app.services.photo_choice import stems

    text = " ".join(str(signals.get(key) or "") for key in (
        "name", "offerings", "location", "visual_style", "photography", "logo_description", "voice", "audience",
    ))
    text += " " + " ".join(note["text"] for note in signals.get("photo_notes") or [])
    return stems(text)


# --- candidates (what the seed puts on the table) ---------------------------------------


def _merge_exclusions(a: dict, b: dict) -> dict:
    out = {key: set(value) for key, value in (a or {}).items()}
    for key, value in (b or {}).items():
        out.setdefault(key, set()).update(value)
    return out


def _vertical_photo(composition: str) -> bool:
    comp = COMPOSITIONS[composition]
    return comp.photo and "9:16" in comp.crops


def allowed_signatures(signals: dict) -> tuple[str, ...]:
    """The real logo when a copy exists, else the name; never an invented mark."""
    return LOGO_SIGNATURES if signals.get("has_logo") else NAME_SIGNATURES


def candidates(seed: int, signals: dict, exclusions: dict | None = None) -> dict[str, list[str]]:
    """The options this generation may choose from: seeded, minus the excluded genes.

    The site's own fonts (mapped to the library) are always offered first, so a business
    keeps the type its customers already know when it fits. Motif "none" is always offered
    (and is the default); every other motif needs a reason found in the brand's own words.
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
    motifs = [NO_MOTIF] + [key for key in MOTIFS if key != NO_MOTIF and key not in ex.get("motif", set())]
    allowed = allowed_signatures(signals)
    signatures = [key for key in allowed if key not in ex.get("signature", set())] or list(allowed)
    comp_pool = pool(tuple(COMPOSITIONS), ex.get("compositions", set()), 5)
    if sum(1 for key in comp_pool if _vertical_photo(key)) < 4 or len(set(comp_pool) & PHOTO_ONLY_COMPOSITIONS) < 2:
        comp_pool = list(COMPOSITIONS)
    compositions = pick(comp_pool, [], CANDIDATE_COUNTS["compositions"])
    if sum(1 for key in compositions if _vertical_photo(key)) < 3:
        extra = [key for key in comp_pool if _vertical_photo(key) and key not in compositions]
        compositions = compositions + extra[: 3 - sum(1 for key in compositions if _vertical_photo(key))]
    for key in [k for k in comp_pool if k in PHOTO_ONLY_COMPOSITIONS and k not in compositions]:
        if sum(1 for c in compositions if c in PHOTO_ONLY_COMPOSITIONS) >= 3:
            break
        compositions.append(key)
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
    number = {"type": "number"}
    return {
        "type": "object",
        "title": "BrandDna",
        "properties": {
            "direction": {
                "type": "object",
                "properties": {
                    "feel_he": string,
                    "world_he": string,
                    "photo_he": string,
                    "text_he": string,
                    "never_he": {"type": "array", "items": string, "minItems": 3, "maxItems": 5},
                },
                "required": ["feel_he", "world_he", "photo_he", "text_he", "never_he"],
            },
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
            "mix": {
                "type": "object",
                "properties": {mode: number for mode in TEXT_MODES},
                "required": list(TEXT_MODES),
            },
            "motif": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "enum": cands["motif"]},
                    "from": {"type": "string", "enum": ["", *MOTIF_FROM]},
                    "note_he": string,
                    "color": {"type": "string", "enum": list(MOTIF_COLORS)},
                    "density": {"type": "string", "enum": list(MOTIF_DENSITIES)},
                },
                "required": ["kind", "from", "note_he", "color", "density"],
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
                    "headline_accent": {"type": "boolean"},
                    "price_style": {"type": "string", "enum": list(PRICE_STYLES)},
                },
                "required": ["headline_accent", "price_style"],
            },
        },
        "required": ["direction", "type", "colors", "compositions", "mix", "motif", "signature", "photo", "copy"],
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


def _logo_line(signals: dict) -> str:
    description = signals["logo_description"] or ("it has a logo" if signals.get("logo_on_site") else "no logo found")
    if signals.get("has_logo"):
        ground = {"light": "it reads on light grounds", "dark": "it reads on dark grounds",
                  "any": "it reads on light and dark grounds"}[signals["logo"]["logo_on"]]
        colors = ", ".join(signals["logo"]["colors"]) or "not measured"
        return f"{description}. A copy of the real logo is attached ({ground}; its colours: {colors})."
    if signals.get("logo_on_site"):
        return f"{description}. No usable copy of the logo file: posts sign with the name in the display face."
    return f"{description}. Posts sign with the name in the display face, never an invented monogram."


def _signature_line(signals: dict, kinds: list[str]) -> str:
    meaning = {
        "corner_mark": "the real logo, small, in a corner",
        "footer_band": "the real logo on a quiet band at the foot",
        "name_only": "the business name set small in the display face",
        "none": "no mark (the feed already shows the profile)",
    }
    return "; ".join(f"{kind} = {meaning[kind]}" for kind in kinds)


def base_mix(field: str, voice: str = "") -> dict[str, float]:
    """The field's photo-led mix, nudged by the voice: a quiet voice posts more photos, a
    lively one more headlines."""
    photo, headline, typed = FIELD_MIX.get(field, FIELD_MIX["other"])
    lowered = (voice or "").lower()
    if any(word in lowered for word in _QUIET_VOICE):
        photo, headline, typed = photo + 0.1, headline - 0.05, typed - 0.05
    if any(word in lowered for word in _BOLD_VOICE):
        photo, headline, typed = photo - 0.1, headline + 0.05, typed + 0.05
    return _round_mix({"photo_only": photo, "headline": headline, "type_led": max(0.0, typed)})


def dna_prompt(signals: dict, cands: dict, peers: list[dict], exclusions: dict, seed: int,
               fixed: dict | None = None) -> str:
    swatches = dna_colors.evidence_line(signals.get("swatches") or [])
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
    mix = base_mix(signals["field"], signals["voice"])
    photo_only = ", ".join(c for c in cands["compositions"] if c in PHOTO_ONLY_COMPOSITIONS)
    motifs = ", ".join(cands["motif"])
    return f"""
Set the Design DNA of this business: the art direction every one of its social posts is
drawn from, written the way a designer briefs a photographer and a typesetter, plus the few
keys a renderer needs. The posts must look like THIS business's own posts, never like a
template that other businesses in its field also get.

RULES FOR EVERY BUSINESS
1. One message per post. On the image at most a headline and one short line. The call to
   action, hours, address and conditions live in the caption, never on the image.
2. The product is the hero. Text sits in the photo's calm area, never on a box over the subject.
3. Most posts are photo-led: a photo alone (or with one word), a headline on the photo, and
   only rarely a type-led card. Variety comes from the photography (close-up, process, hands,
   the place, people from behind), not from frames.
4. Ornament only from the brand. motif.kind is "none" unless you can name the exact thing in
   THIS brand it echoes: a shape in its logo, a texture of its real place, a detail of its
   product. Never scalloped frames, rainbow arcs, rings, dashed lines or tape as decoration.
5. The real logo, small, or the name in the display face. Never an invented monogram or stamp.
6. Colours are the brand's own: every colour role is one of the brand colours listed below
   (its exact hex), or one of them made lighter or darker (the same hue).

BUSINESS
- name: {signals['name']}
- field: {signals['field']} ({signals['field_label']})
- what it sells / does: {signals['offerings'] or 'not stated'}
- location: {signals['location'] or 'not stated'}
- voice (from its site): {signals['voice'] or 'not read'}
- audience: {signals['audience'] or 'not read'}

ITS OWN BRAND (read off its logo and site)
- brand colours, strongest first (the logo's own pixels, then the site): {swatches}
- logo: {_logo_line(signals)}
- typography: "{signals['typography']['primary']}", mood: {signals['typography']['mood'] or 'not read'}
- fonts its site loads: {fonts} -> nearest library fonts: {mapped}
- visual style: {signals['visual_style'] or 'not read'}
- photography on its site: {signals['photography'] or 'not read'}
- Instagram: {instagram}

ITS PHOTOS AND LOGO
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
- direction: the art direction in Hebrew, for the owner. Concrete and about THIS business:
  name its real place, materials, products and light. Everyday Israeli Hebrew, no English
  words, no exclamation mark, no em dash. Never marketing words such as חוויה, פתרון, מותג,
  איכותי, מקצועי, ייחודי, מושלם, יוקרתי, מזמין, אווירה חמימה.
  - feel_he: one sentence for the feeling, up to 16 words (for example
    "שקט ובטוח, כמו מאפייה שאופה באותו תנור 40 שנה").
  - world_he: the real world it comes from: the place, the materials, the street. One sentence.
  - photo_he: how its photos look: the light, how close, what is in the frame. One sentence.
  - text_he: how text behaves on its posts, one sentence (for example
    "מילה אחת גדולה או בלי טקסט בכלל; המחיר רק כשהוא הסיפור").
  - never_he: 3 to 5 short things this business would never do in a post.
- type.display from: {_font_options(cands['display'])}
- type.text from: {_font_options(cands['text'])}
  Prefer the site's own fonts (the nearest library fonts above) when they fit its character.
  Weights must be ones the family has. Headline (display) and text must be clearly different.
  headline_case applies to Latin letters only (Hebrew has no case). scale: large | medium | editorial.
- compositions: 3 or 4 from {', '.join(cands['compositions'])}. They rotate across the month,
  so pick ones that differ from each other and fit the business's photos. At least two must
  carry a photo in a 9:16 story too, and at least one must work with the photo alone
  ({photo_only}). type_led draws no photo: include it only if the business also posts
  messages without a picture.
- mix: the share of posts that are photo_only (no text, or one word), headline (a headline on
  the photo) and type_led (the text is the picture); fractions that sum to 1. For this field
  and voice start near photo_only {mix['photo_only']}, headline {mix['headline']}, type_led
  {mix['type_led']}. type_led is 0 unless compositions include type_led.
- motif.kind from {motifs}: "none" unless rule 4 holds. motif.from: logo | place | product
  (where it comes from; "" when none). motif.note_he: the thing itself in a few Hebrew words
  ("הקשת בלוגו", "הפסים של הסוכך מעל הדלפק"; "" when none). motif.color is a role
  (accent | accent_2 | ink | tint); density low | mid.
- signature.kind from {', '.join(cands['signature'])}: {_signature_line(signals, cands['signature'])}.
  use_logo: {'true when the kind shows the logo' if signals['has_logo'] else 'false (there is no logo copy)'}.
- colors (#rrggbb) for ink, paper, accent, accent_2, on_photo, tint: each one of the brand
  colours above, or one of them lighter or darker (same hue). paper is the ground of a
  type-led card or a band; ink must read on paper at 4.5:1; accent is the colour people know
  the business by (usually its logo's); on_photo is the headline colour over a photo, very
  light or very dark, and not white by default if the brand has a light colour of its own.
- photo: the photo direction for THIS business only, from its own photos, its field and what
  it sells. grade (colour grade), light (source, direction, time of day), angle (lens, height),
  props (2 to 5 things that really belong to this business), background (its real surfaces and
  places), never (what must never appear in its images). Concrete nouns from this business.
  Write every photo field in English: it goes to an image model.
  No stock phrases such as "soft natural light", "warm and inviting", "shallow depth of field",
  "rustic wooden table", "bokeh", "cinematic". Never name products it does not sell.
{bakery_rule}- copy: headline_accent true only if one word of a headline may be set in the accent
  colour (a lively voice); price_style tag | inline | circle (used only when a price is the
  post's message).
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


def validate_colors(raw, signals: dict, seed: int) -> dict[str, str]:
    """The DNA's colours (the sources come with `color_system`)."""
    return color_system(raw, signals, seed)[0]


def color_system(raw, signals: dict, seed: int) -> tuple[dict, dict, dict]:
    return dna_colors.build(raw, signals.get("swatches") or [], seed)


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


# --- the direction (Hebrew, owner-facing) ---------------------------------------------------


def _allowed_latin(signals: dict) -> set[str]:
    text = " ".join(str(signals.get(key) or "") for key in ("name", "offerings", "visual_style", "location"))
    return {word.lower() for word in _LATIN_WORD.findall(text)}


def clean_hebrew(value, signals: dict, *, limit: int = 160, banned: tuple[str, ...] = ()) -> str:
    """One owner-facing Hebrew line: no exclamation mark, no em dash, no English word the
    business does not use itself, and no clause carrying a generic marketing word."""
    text = " ".join(str(value or "").split()).replace("!", "")
    text = re.sub(r"\s*[—–]\s*", ", ", text)
    if not text:
        return ""
    latin_ok = _allowed_latin(signals)
    parts = re.split(r"([,;.:])", text)
    kept: list[str] = []
    for index in range(0, len(parts), 2):
        clause = parts[index].strip()
        mark = parts[index + 1] if index + 1 < len(parts) else ""
        if not clause:
            continue
        if any(word in clause for word in GENERIC_HE) or any(_contains(clause, word) for word in banned):
            continue
        if any(word.lower() not in latin_ok for word in _LATIN_WORD.findall(clause)):
            continue
        kept.append(clause + (mark if mark in ",;:" else ("." if mark == "." else "")))
    out = " ".join(kept).strip(" ,;:")
    if len(_HEBREW.findall(out)) < 6:
        return ""
    if len(out) > limit:
        cut = out[:limit]
        out = cut[: cut.rfind(" ")] if " " in cut else cut
        out = out.strip(" ,;:")
    return out


def _grounded(text: str, own: set[str]) -> bool:
    from app.services.photo_choice import stems

    return bool(stems(text) & own)


def _first_words(text: str, count: int) -> str:
    words = str(text or "").split()
    return " ".join(words[:count]).strip(" ,.;:")


def text_he_for_mix(mix: dict) -> str:
    photo = float(mix.get("photo_only") or 0)
    typed = float(mix.get("type_led") or 0)
    if photo >= 0.55:
        line = "רוב הפוסטים בלי טקסט או עם מילה אחת. כשיש מה להגיד, כותרת קצרה אחת על אזור שקט בתמונה"
    elif photo >= 0.4:
        line = "חצי מהפוסטים רק תמונה. בשאר כותרת קצרה אחת על אזור שקט, והמחיר רק כשהוא הסיפור"
    else:
        line = "כותרת קצרה אחת ברוב הפוסטים, תמיד על אזור שקט בתמונה ולא על המוצר"
    if typed >= 0.15:
        line += ". מדי פעם פוסט של מילים בלבד"
    return line + "."


def _rationale_feel(rationale, signals: dict) -> str:
    """A v1 rationale as the feeling line, unless it only names parameters ("כותרות ב-Suez
    One, קצה גלי שחוזר בכל פוסט"): the owner asked for a style in words, not keys."""
    text = " ".join(str(rationale or "").split())
    if not text:
        return ""
    if any(font.family in text for font in FONTS.values()) or any(
            label in text for key, label in MOTIFS.items() if key != NO_MOTIF) or "מזהים אתכם בפיד" in text:
        return ""
    return clean_hebrew(text, signals, limit=140)


def local_direction(signals: dict, mix: dict, base: dict | None = None) -> dict:
    """The direction without the model, from the business's own words (and, for a v1
    DNA, its one-line rationale when it is a feeling, not a list of parameters)."""
    field = signals.get("field") or "other"
    name = signals.get("name") or "העסק"
    voice = clean_hebrew(_first_words(signals.get("voice"), 8), signals, limit=60)
    feel = _rationale_feel((base or {}).get("rationale_he"), signals)
    if not feel:
        feel = f"{voice}, כמו ב{name} ביום רגיל" if voice else f"פשוט ואמיתי, כמו ב{name} ביום רגיל"
    world = clean_hebrew(_first_words(signals.get("visual_style"), 18), signals, limit=160)
    if not world:
        location = signals.get("location") or ""
        world = FIELD_WORLD_HE.get(field, FIELD_WORLD_HE["other"]) + (f", ב{location}" if location else "")
    photo = clean_hebrew(_first_words(signals.get("photography"), 18), signals, limit=180)
    if not photo:
        photo = FIELD_PHOTO_HE.get(field, FIELD_PHOTO_HE["other"])
    never = [
        "מסגרות וקישוטים שלא באים מהלוגו, מהמקום או מהמוצר",
        "טקסט שמכסה את המוצר",
        "יותר משתי שורות טקסט על התמונה",
        "לוגו מומצא או חותמת עם אות" if not signals.get("has_logo") else "לשנות את הצבעים של הלוגו",
        FIELD_NEVER_HE.get(field, FIELD_NEVER_HE["other"]),
    ]
    return {"feel_he": feel, "world_he": world, "photo_he": photo, "text_he": text_he_for_mix(mix), "never_he": never}


def validate_direction(raw, signals: dict, mix: dict) -> dict:
    """The model's direction, cleaned; a line that says nothing about this business (no
    word of its own) falls back to the business's own words."""
    raw = raw if isinstance(raw, dict) else {}
    fallback = local_direction(signals, mix)
    own = _own_stems(signals)
    banned = _banned_words(signals)
    out = {}
    for key, limit, must_ground in (("feel_he", 140, False), ("world_he", 160, True), ("photo_he", 180, True),
                                    ("text_he", 140, False)):
        cleaned = clean_hebrew(raw.get(key), signals, limit=limit, banned=banned)
        if cleaned and must_ground and not _grounded(cleaned, own):
            cleaned = ""
        out[key] = cleaned or fallback[key]
    never: list[str] = []
    for item in raw.get("never_he") or []:
        cleaned = clean_hebrew(item, signals, limit=70, banned=banned)
        if cleaned and cleaned not in never:
            never.append(cleaned)
    for item in fallback["never_he"]:
        if len(never) >= 3:
            break
        if item not in never:
            never.append(item)
    out["never_he"] = never[:5]
    return out


# --- motif, signature, mix, copy -------------------------------------------------------------


def motif_justified(kind: str, origin: str, signals: dict) -> bool:
    """True when the brand's own words for `origin` mention what the motif echoes."""
    evidence = {"logo": signals.get("logo_text"), "place": signals.get("place_text"),
                "product": signals.get("product_text")}.get(origin) or ""
    lowered = evidence.lower()
    return any(word.lower() in lowered for word in MOTIF_EVIDENCE.get(kind, ()))


def validate_motif(raw, signals: dict, allowed: list[str]) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    kind = raw.get("kind") if raw.get("kind") in allowed else NO_MOTIF
    origin = raw.get("from") if raw.get("from") in MOTIF_FROM else ""
    note = clean_hebrew(raw.get("note_he"), signals, limit=60)
    if kind != NO_MOTIF and not (origin and len(_HEBREW.findall(note)) >= 4 and motif_justified(kind, origin, signals)):
        kind = NO_MOTIF
    if kind == NO_MOTIF:
        origin, note = "", ""
    return {
        "kind": kind,
        "from": origin,
        "note_he": note,
        "color": raw.get("color") if raw.get("color") in MOTIF_COLORS else "accent",
        "density": raw.get("density") if raw.get("density") in MOTIF_DENSITIES else "low",
    }


def make_signature(kind: str, signals: dict) -> dict:
    has_logo = bool(signals.get("has_logo"))
    allowed = allowed_signatures(signals)
    kind = LEGACY_SIGNATURES.get(kind, kind)
    if kind not in allowed:
        kind = "corner_mark" if has_logo else "name_only"
    logo = signals.get("logo") or {}
    return {
        "kind": kind,
        "use_logo": has_logo and kind in ("corner_mark", "footer_band"),
        "logo_url": (logo.get("public_url") or "") if has_logo else "",
        "logo_on": logo.get("logo_on") if has_logo and logo.get("logo_on") in LOGO_ON else "any",
        "logo_colors": list(logo.get("colors") or []) if has_logo else [],
    }


def _round_mix(mix: dict) -> dict[str, float]:
    def r(value: float) -> float:
        return round(round(float(value) * 20) / 20, 2)

    photo = r(min(MIX_LIMITS["photo_only"][1], max(MIX_LIMITS["photo_only"][0], mix.get("photo_only", 0.5))))
    typed = r(min(MIX_LIMITS["type_led"][1], max(MIX_LIMITS["type_led"][0], mix.get("type_led", 0.0))))
    headline = round(1 - photo - typed, 2)
    if headline < MIX_LIMITS["headline"][0]:
        photo = round(1 - typed - MIX_LIMITS["headline"][0], 2)
        headline = MIX_LIMITS["headline"][0]
    return {"photo_only": photo, "headline": headline, "type_led": typed}


def fit_mix(mix: dict, compositions: list[str]) -> dict[str, float]:
    """type_led posts exist exactly when the DNA has a photo-free composition."""
    has_typed = any(c in PHOTO_FREE_COMPOSITIONS for c in compositions)
    out = dict(mix)
    if not has_typed and out.get("type_led", 0) > 0:
        out["headline"] = out.get("headline", 0) + out["type_led"]
        out["type_led"] = 0.0
    elif has_typed and out.get("type_led", 0) <= 0:
        out["type_led"] = 0.05
        out["headline"] = out.get("headline", 0) - 0.05
    return _round_mix(out)


def validate_mix(raw, signals: dict, compositions: list[str]) -> dict[str, float]:
    base = base_mix(signals["field"], signals["voice"])
    raw = raw if isinstance(raw, dict) else {}
    values = {}
    for mode in TEXT_MODES:
        try:
            values[mode] = max(0.0, float(raw.get(mode)))
        except (TypeError, ValueError):
            values = {}
            break
    total = sum(values.values()) if values else 0
    mix = {mode: values[mode] / total for mode in TEXT_MODES} if total > 0 else base
    return fit_mix(_round_mix(mix), compositions)


MIN_PHOTO_ONLY = 2


def _ensure_photo_only(chosen: list[str], pool: list[str]) -> list[str]:
    """Most posts are photo-led, and neighbours never share a layout: a DNA carries at
    least two compositions a photo can fill alone."""
    chosen = list(chosen)
    extras = [c for c in [*pool, *COMPOSITIONS] if c in PHOTO_ONLY_COMPOSITIONS and c not in chosen]
    extras = list(dict.fromkeys(extras))
    while sum(1 for c in chosen if c in PHOTO_ONLY_COMPOSITIONS) < MIN_PHOTO_ONLY and extras:
        if len(chosen) >= 4:
            drop = next((i for i in range(len(chosen) - 1, -1, -1)
                         if chosen[i] not in PHOTO_ONLY_COMPOSITIONS and chosen[i] not in PHOTO_FREE_COMPOSITIONS
                         and (not _vertical_photo(chosen[i])
                              or sum(1 for c in chosen if _vertical_photo(c)) > 2)), None)
            if drop is None:
                drop = next((i for i in range(len(chosen) - 1, -1, -1) if chosen[i] not in PHOTO_ONLY_COMPOSITIONS),
                            len(chosen) - 1)
            chosen.pop(drop)
        chosen.append(extras.pop(0))
    return chosen


def validate_compositions(raw, cands: dict, rng: random.Random) -> list[str]:
    chosen = _unique(c for c in (raw or []) if isinstance(c, str) and c in cands["compositions"])[:4]
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
    return _ensure_photo_only(chosen[:4], cands["compositions"])


def validate_dna(raw, signals: dict, cands: dict, seed: int, *, source: str = "model",
                 base: dict | None = None, locked=()) -> dict:
    """The model's answer, reduced to library keys and valid values. Every missing or
    unknown value falls back to a seeded pick (the site's own font first) or to the
    business's own words."""
    raw = raw if isinstance(raw, dict) else {}
    rng = random.Random(f"fallback:{seed}")
    mapped = signals.get("mapped_fonts") or []

    t = raw.get("type") if isinstance(raw.get("type"), dict) else {}
    display = t.get("display") if t.get("display") in cands["display"] else _prefer(mapped, cands["display"], rng)
    # A pair is two families: one family for both is what every template does. (The owner
    # may still choose that by hand, PUT /brand/dna.)
    text_pool = [key for key in cands["text"] if key != display] or [key for key in TEXT_FONTS if key != display]
    text = t.get("text") if t.get("text") in text_pool else _prefer(mapped, text_pool, rng)
    type_gene = {
        "display": display,
        "display_weight": snap_weight(display, t.get("display_weight", 700)),
        "text": text,
        "text_weight": snap_weight(text, t.get("text_weight", 400), role="text"),
        "headline_case": t.get("headline_case") if t.get("headline_case") in HEADLINE_CASES else "sentence",
        "scale": t.get("scale") if t.get("scale") in TYPE_SCALES else rng.choice(TYPE_SCALES),
    }
    compositions = validate_compositions(raw.get("compositions"), cands, rng)
    mix = validate_mix(raw.get("mix"), signals, compositions)
    s = raw.get("signature") if isinstance(raw.get("signature"), dict) else {}
    sig_kind = s.get("kind") if s.get("kind") in cands["signature"] else ""
    colors, sources, bases = color_system(raw.get("colors"), signals, seed)
    c = raw.get("copy") if isinstance(raw.get("copy"), dict) else {}
    dna = {
        "version": DNA_VERSION,
        "seed": seed,
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "field": signals["field"],
        "direction": validate_direction(raw.get("direction"), signals, mix),
        "type": type_gene,
        "colors": colors,
        "colors_source": sources,
        "colors_base": bases,
        "compositions": compositions,
        "mix": mix,
        "motif": validate_motif(raw.get("motif"), signals, cands["motif"]),
        "signature": make_signature(sig_kind, signals),
        "photo": validate_photo(raw.get("photo"), signals),
        "copy": {
            "headline_accent": bool(c.get("headline_accent")) if isinstance(c.get("headline_accent"), bool) else False,
            "price_style": c.get("price_style") if c.get("price_style") in PRICE_STYLES else rng.choice(PRICE_STYLES),
            "cta_on_image": False,
        },
        "rationale_he": "",
        "distance_checked_against": 0,
        "source": source,
    }
    _apply_locked(dna, base, locked)
    _replay_adjustments(dna, base, locked)
    dna["rationale_he"] = dna["direction"]["feel_he"]
    return dna


def _apply_locked(dna: dict, base: dict | None, locked) -> None:
    if not base:
        return
    genes = [gene for gene in (locked or ()) if gene in GENES and isinstance(base.get(gene), (dict, list))]
    for gene in genes:
        dna[gene] = copy.deepcopy(base[gene])
        if gene == "colors":
            dna["colors_source"] = copy.deepcopy(base.get("colors_source") or {})
            dna["colors_base"] = copy.deepcopy(base.get("colors_base") or {})
    if genes:
        dna["locked"] = sorted(set(genes))


def _replay_adjustments(dna: dict, base: dict | None, locked) -> None:
    """The owner's word adjustments ("quieter", "more photo") survive a rebuild."""
    history = [item for item in (base or {}).get("adjusted") or [] if item in (*ADJUST_TONES, *ADJUST_TEXT)]
    for item in history[-MAX_ADJUSTMENTS:]:
        apply_adjust(dna, item, locked=locked)
    if history:
        dna["adjusted"] = history[-MAX_ADJUSTMENTS:]


def is_valid_dna(dna) -> bool:
    """Shape check for a stored v2 DNA (other businesses' rows are read with it)."""
    if not isinstance(dna, dict) or int(dna.get("version") or 0) < 2:
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
        and isinstance(dna.get("direction"), dict)
        and isinstance(dna.get("mix"), dict)
    )


def is_valid_v1(dna) -> bool:
    if not isinstance(dna, dict) or int(dna.get("version") or 0) != 1:
        return False
    t = dna.get("type") or {}
    return (
        isinstance(t, dict)
        and t.get("display") in FONTS
        and t.get("text") in FONTS
        and isinstance(dna.get("colors"), dict)
        and isinstance(dna.get("compositions"), list)
        and all(c in COMPOSITIONS for c in dna["compositions"])
    )


# --- v1 -> v2, without a model call ---------------------------------------------------------


def upgrade_v1(old: dict, signals: dict | None = None) -> dict:
    """A v1 DNA as v2. Direction from its rationale and the brand's own words, colours
    rebuilt from the brand's evidence (unless the owner set them), motif none unless the
    logo description itself names it, the logo or the name as the signature. Marked
    `source: "upgraded"` so a later regenerate or re-scan improves it."""
    dna = copy.deepcopy(old)
    locked = [gene for gene in dna.get("locked") or [] if gene in GENES or gene == KEEP_ALL]
    field = dna.get("field") or (signals or {}).get("field") or "other"
    sig_signals = signals or {"has_logo": False, "logo": {}}
    rng = random.Random(f"upgrade:{dna.get('seed')}")
    cands = {"compositions": list(COMPOSITIONS)}
    compositions = validate_compositions(dna.get("compositions"), cands, rng)
    voice = (signals or {}).get("voice") or ""
    mix = fit_mix(base_mix(field, voice), compositions)

    old_motif = dna.get("motif") if isinstance(dna.get("motif"), dict) else {}
    kind = old_motif.get("kind") if old_motif.get("kind") in MOTIFS else NO_MOTIF
    motif = {"kind": NO_MOTIF, "from": "", "note_he": "", "color": old_motif.get("color") if old_motif.get("color") in MOTIF_COLORS else "accent",
             "density": old_motif.get("density") if old_motif.get("density") in MOTIF_DENSITIES else "low"}
    if "motif" in locked and kind != NO_MOTIF:
        motif.update({"kind": kind, "from": MOTIF_FROM_OWNER})
    elif signals and kind != NO_MOTIF and motif_justified(kind, "logo", signals):
        motif.update({"kind": kind, "from": "logo",
                      "note_he": clean_hebrew(_first_words(signals.get("logo_description"), 8), signals, limit=60)})

    old_sig = dna.get("signature") if isinstance(dna.get("signature"), dict) else {}
    if signals is None:
        sig_kind = "corner_mark" if old_sig.get("use_logo") else "name_only"
        signature = {"kind": sig_kind, "use_logo": False, "logo_url": "", "logo_on": "any", "logo_colors": []}
    else:
        wanted = LEGACY_SIGNATURES.get(old_sig.get("kind"), old_sig.get("kind") or "")
        signature = make_signature(wanted, sig_signals)

    if signals is not None and "colors" not in locked:
        colors, sources, bases = dna_colors.build({}, signals.get("swatches") or [], int(dna.get("seed") or 0))
    else:
        colors = {role: _norm_hex((dna.get("colors") or {}).get(role)) or "#000000" for role in COLOR_ROLES}
        sources, bases = {}, {}
        for role, value in colors.items():
            source, base = dna_colors.source_of(value, (signals or {}).get("swatches") or [])
            sources[role] = source
            if base:
                bases[role] = base

    if signals is not None:
        direction = local_direction(signals, mix, base=dna)
    else:
        rationale = " ".join(str(dna.get("rationale_he") or "").split())
        direction = {"feel_he": rationale, "world_he": "", "photo_he": "", "text_he": text_he_for_mix(mix),
                     "never_he": []}
    old_copy = dna.get("copy") if isinstance(dna.get("copy"), dict) else {}
    upgraded = {
        "version": DNA_VERSION,
        "seed": dna.get("seed"),
        "created_at": dna.get("created_at"),
        "field": field,
        "direction": direction,
        "type": dna.get("type"),
        "colors": colors,
        "colors_source": sources,
        "colors_base": bases,
        "compositions": compositions,
        "mix": mix,
        "motif": motif,
        "signature": signature,
        "photo": dna.get("photo") or (local_photo(signals) if signals else {}),
        "copy": {
            "headline_accent": False,
            "price_style": old_copy.get("price_style") if old_copy.get("price_style") in PRICE_STYLES else "inline",
            "cta_on_image": False,
        },
        "rationale_he": dna.get("rationale_he") or direction["feel_he"],
        "distance_checked_against": dna.get("distance_checked_against") or 0,
        "source": "upgraded",
        "upgraded_from": dna.get("source") or "model",
    }
    if locked:
        upgraded["locked"] = sorted(set(locked))
    return upgraded


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


_PHOTO_STOP = {"with", "from", "that", "this", "into", "over", "under", "their", "they", "light", "only", "where",
               "which", "never", "same", "each", "very", "more", "less", "like", "near", "onto", "about"}


def _photo_words(dna: dict) -> set[str]:
    photo = dna.get("photo") if isinstance(dna.get("photo"), dict) else {}
    text = " ".join(str(photo.get(key) or "") for key in ("grade", "light", "angle", "background"))
    text += " " + " ".join(str(item) for item in photo.get("props") or [])
    return {word for word in re.findall(r"[a-z]{4,}", text.lower()) if word not in _PHOTO_STOP}


def photo_distance(a: dict, b: dict) -> float | None:
    wa, wb = _photo_words(a), _photo_words(b)
    if not wa or not wb:
        return None
    return round(1 - len(wa & wb) / len(wa | wb), 4)


def mix_distance(a: dict, b: dict) -> float | None:
    ma, mb = a.get("mix"), b.get("mix")
    if not isinstance(ma, dict) or not isinstance(mb, dict):
        return None
    try:
        return min(1.0, sum(abs(float(ma.get(m) or 0) - float(mb.get(m) or 0)) for m in TEXT_MODES) * 2)
    except (TypeError, ValueError):
        return None


def gene_distances(a: dict, b: dict) -> dict[str, float | None]:
    ca, cb = set(a.get("compositions") or []), set(b.get("compositions") or [])
    union = ca | cb
    ma, mb = a.get("motif") or {}, b.get("motif") or {}
    if ma.get("kind") != mb.get("kind"):
        motif = 1.0
    else:
        motif = 0.0 if (ma.get("color"), ma.get("density")) == (mb.get("color"), mb.get("density")) else 0.15
    return {
        "type": _type_distance(a.get("type") or {}, b.get("type") or {}),
        "compositions": 1 - (len(ca & cb) / len(union)) if union else 0.0,
        "photo": photo_distance(a, b),
        "motif": motif,
        "mix": mix_distance(a, b),
        "signature": 0.0 if (a.get("signature") or {}).get("kind") == (b.get("signature") or {}).get("kind") else 1.0,
        "palette": palette_distance(a.get("colors") or {}, b.get("colors") or {}),
    }


def distance(a: dict, b: dict, *, with_palette: bool = True) -> float:
    """0 = the same DNA, 1 = nothing in common. Weighted over type pair, composition set,
    photo direction, motif, mix, signature and (barely) palette; a gene one of the two
    does not carry is left out and the rest re-weighted. `with_palette=False` compares a
    business with its own earlier style, whose colours are the same brand's by design."""
    parts = gene_distances(a, b)
    weights = {gene: weight for gene, weight in DISTANCE_WEIGHTS.items()
               if parts.get(gene) is not None and (with_palette or gene != "palette")}
    total = sum(weights.values()) or 1.0
    return round(sum(weight * float(parts[gene]) for gene, weight in weights.items()) / total, 4)


def same_type_and_motif(a: dict, b: dict) -> bool:
    """The overall look two businesses must never share, across fields: the same type pair
    and motif (with no motif, also mostly the same compositions)."""
    ta, tb = a.get("type") or {}, b.get("type") or {}
    if ta.get("display") != tb.get("display") or ta.get("text") != tb.get("text"):
        return False
    ka, kb = (a.get("motif") or {}).get("kind"), (b.get("motif") or {}).get("kind")
    if ka != kb:
        return False
    if ka not in (None, NO_MOTIF):
        return True
    ca, cb = set(a.get("compositions") or []), set(b.get("compositions") or [])
    return bool(ca | cb) and len(ca & cb) / len(ca | cb) >= 0.6


def close_genes(dna: dict, other: dict) -> dict[str, set[str]]:
    """What to exclude when `dna` is too close to `other`: the genes they share. Never the
    colours (the brand's own) and never motif "none" (the default)."""
    parts = gene_distances(dna, other)
    out: dict[str, set[str]] = {}
    t = dna.get("type") or {}
    if parts["type"] <= 0.4:
        out["display"] = {t.get("display")}
    elif parts["type"] < 1:
        out["text"] = {t.get("text")}
    kind = (dna.get("motif") or {}).get("kind")
    if parts["motif"] < 1 and kind not in (None, NO_MOTIF):
        out["motif"] = {kind}
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


def check_unique(dna: dict, same_field: list[dict], everyone: list[dict], locked=(), avoid=()) -> tuple[bool, dict]:
    """(unique?, genes to exclude to get there). `avoid` are this business's own earlier
    styles: compared without the palette."""
    found: dict = {}
    close = False
    for other in same_field:
        if distance(dna, other) < FIELD_MIN_DISTANCE:
            close = True
            found = _merge_exclusions(found, close_genes(dna, other))
    for other in avoid or ():
        if distance(dna, other, with_palette=False) < FIELD_MIN_DISTANCE:
            close = True
            found = _merge_exclusions(found, close_genes(dna, other))
    for other in everyone:
        if same_type_and_motif(dna, other):
            close = True
            kind = (dna.get("motif") or {}).get("kind")
            extra = {"display": {(dna.get("type") or {}).get("display")}}
            if kind not in (None, NO_MOTIF):
                extra["motif"] = {kind}
            shared = set(dna.get("compositions") or []) & set(other.get("compositions") or [])
            if len(shared) >= 2:
                extra["compositions"] = shared
            found = _merge_exclusions(found, extra)
    return (not close), _drop_locked(found, locked)


def _min_distance(dna: dict, same_field: list[dict], everyone: list[dict], avoid=()) -> float:
    values = [distance(dna, other) for other in same_field]
    values += [distance(dna, other, with_palette=False) for other in avoid or ()]
    values += [0.0 for other in everyone if same_type_and_motif(dna, other)]
    return min(values) if values else 1.0


def move_apart(dna: dict, exclusions: dict, signals: dict, seed: int, same_field: list[dict],
               everyone: list[dict], locked=(), avoid=()) -> dict:
    """After MAX_TRIES model answers that stayed too close: change only the close genes,
    locally and deterministically, to the nearest-to-the-brand option that is unique.
    If no option is, keep the one furthest from everyone. Colours never move; a motif that
    is too close becomes "none"."""
    best, best_score = dna, _min_distance(dna, same_field, everyone, avoid)
    blocked = {gene for gene in (locked or ())}
    allowed_sigs = allowed_signatures(signals)
    for attempt in range(40):
        rng = random.Random(f"apart:{seed}:{attempt}")
        variant = copy.deepcopy(dna)
        if "type" not in blocked and exclusions.get("display"):
            pool = [k for k in DISPLAY_FONTS if k not in exclusions["display"]]
            variant["type"]["display"] = _prefer(signals.get("mapped_fonts") or [], pool, rng) if attempt == 0 else rng.choice(pool)
            variant["type"]["display_weight"] = snap_weight(variant["type"]["display"], variant["type"]["display_weight"])
        if "type" not in blocked and (exclusions.get("text") or variant["type"]["text"] == variant["type"]["display"]
                                      or attempt % 2 == 1):
            pool = [k for k in TEXT_FONTS if k not in exclusions.get("text", set()) and k != variant["type"]["display"]]
            variant["type"]["text"] = rng.choice(pool)
            variant["type"]["text_weight"] = snap_weight(variant["type"]["text"], variant["type"]["text_weight"], role="text")
        if "motif" not in blocked and exclusions.get("motif"):
            variant["motif"] = {**variant["motif"], "kind": NO_MOTIF, "from": "", "note_he": ""}
        if "signature" not in blocked and exclusions.get("signature"):
            pool = [k for k in allowed_sigs if k not in exclusions["signature"]]
            if pool:
                variant["signature"] = make_signature(rng.choice(pool), signals)
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
            variant["compositions"] = _ensure_photo_only(comps, list(COMPOSITIONS))
            variant["mix"] = fit_mix(variant.get("mix") or {}, variant["compositions"])
        ok, _ = check_unique(variant, same_field, everyone, avoid=avoid)
        if ok:
            return variant
        score = _min_distance(variant, same_field, everyone, avoid)
        if score > best_score:
            best, best_score = variant, score
    return best


# --- storage ------------------------------------------------------------------------------------


def _read_stored(raw_json: str, signals_source=None) -> dict | None:
    dna = loads(raw_json or "", None)
    if is_valid_dna(dna):
        return dna
    if is_valid_v1(dna):
        signals = signals_source() if callable(signals_source) else None
        return upgrade_v1(dna, signals)
    return None


def load_dna(business) -> dict | None:
    """The business's DNA as v2 (a stored v1 DNA is upgraded on read, without the model;
    the router stores the upgrade)."""
    return _read_stored(getattr(business, "brand_dna_json", "") or "",
                        lambda: signals_for(None, business, with_images=False))


def stored_version(business) -> int:
    dna = loads(getattr(business, "brand_dna_json", "") or "", None)
    try:
        return int((dna or {}).get("version") or 0) if isinstance(dna, dict) else 0
    except (TypeError, ValueError):
        return 0


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
        dna = _read_stored(raw)
        if dna is None:
            continue
        everyone.append(dna)
        if dna.get("field") == field:
            same.append(dna)
    return same, everyone


def _ensure_logo(business) -> None:
    """The logo copy before a DNA is built, when the setting allows a download."""
    if not get_settings().brand_logo_copy:
        return
    try:
        brand_logo.ensure(business)
    except Exception:  # the logo is evidence, never a reason to fail the DNA
        log.exception("design dna: logo copy failed for business %s", getattr(business, "id", None))


def build_dna(db, business, *, seed: int, base: dict | None = None, locked=(), avoid: list[dict] | None = None,
              use_model: bool = True) -> dict:
    """Generate a DNA for `business` that is unique in its field. Does not store it.

    `avoid` holds DNAs this one must also differ from (the business's current DNA, when
    the owner asks for another style). `locked` genes are copied from `base` unchanged.
    """
    signals = signals_for(db, business, with_images=use_model)
    same_field, everyone = peers(db, business)
    avoid = [dna for dna in (avoid or []) if dna]
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
                    dna_prompt(signals, cands, same_field + avoid, exclusions, seed, fixed=fixed),
                    dna_schema(cands),
                    signals["images"],
                )
                source = "model"
            except Exception as exc:  # the model is down or refused: build it locally
                log.warning("design dna: model call failed for business %s: %s", business.id, exc)
                model_up = False
        dna = validate_dna(raw, signals, cands, seed, source=source, base=base, locked=gene_locks)
        unique, found = check_unique(dna, same_field, everyone, gene_locks, avoid=avoid)
        if unique or not found:
            break
        exclusions = _merge_exclusions(exclusions, found)
    assert dna is not None
    if not unique:
        _, found = check_unique(dna, same_field, everyone, gene_locks, avoid=avoid)
        if found:
            dna = move_apart(dna, _merge_exclusions(exclusions, found), signals, seed, same_field, everyone,
                             gene_locks, avoid=avoid)
    dna["distance_checked_against"] = len(everyone)
    return dna


def create_dna(db, business) -> dict:
    """First DNA for a business: built, checked, stored (the caller commits)."""
    _ensure_logo(business)
    dna = build_dna(db, business, seed=seed_for(business))
    store_dna(business, dna)
    return dna


def regenerate_dna(db, business) -> dict:
    """'לנסות סגנון אחר': a new seed within the same signals, different from the current
    style and still unique. Genes the owner set stay."""
    current = load_dna(business)
    if current is None:
        return create_dna(db, business)
    _ensure_logo(business)
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


# --- the owner's adjustments, in words, and explicit edits -----------------------------------

_SCALE_ORDER = ("editorial", "medium", "large")


def _step_weight(font_key: str, weight: int, direction: int) -> int:
    weights = sorted(FONTS[font_key].weights)
    if direction < 0:
        lower = [w for w in weights if w < weight]
        return lower[-1] if lower else weight
    higher = [w for w in weights if w > weight]
    return higher[0] if higher else weight


def _shift_mix(mix: dict, to: str, amount: float, sources: tuple[str, ...]) -> dict:
    out = {mode: float(mix.get(mode) or 0) for mode in TEXT_MODES}
    room = MIX_LIMITS[to][1] - out[to]
    amount = max(0.0, min(amount, room))
    for source in sources:
        if amount <= 0:
            break
        take = min(amount, out[source] - MIX_LIMITS[source][0])
        if take <= 0:
            continue
        out[source] -= take
        out[to] += take
        amount -= take
    return out


def apply_adjust(dna: dict, adjustment: str, *, locked=()) -> None:
    """One adjustment in the owner's words, in place. Genes the owner locked stay."""
    locked = set(locked or ()) | set(dna.get("locked") or ())
    t = dna.get("type") or {}
    mix = dna.get("mix") or base_mix(dna.get("field") or "other")
    comps = dna.get("compositions") or []
    has_typed = any(c in PHOTO_FREE_COMPOSITIONS for c in comps)
    motif = dna.get("motif") or {}
    if adjustment in ADJUST_TONES:
        direction = -1 if adjustment == "quieter" else 1
        if "type" not in locked and t.get("display") in FONTS:
            t["display_weight"] = _step_weight(t["display"], int(t.get("display_weight") or 400), direction)
            scale = t.get("scale") if t.get("scale") in _SCALE_ORDER else "medium"
            index = max(0, min(len(_SCALE_ORDER) - 1, _SCALE_ORDER.index(scale) + direction))
            t["scale"] = _SCALE_ORDER[index]
        if adjustment == "quieter":
            mix = _shift_mix(mix, "photo_only", 0.1, ("type_led", "headline"))
        else:
            mix = _shift_mix(mix, "headline", 0.1, ("photo_only",))
        if "motif" not in locked and motif.get("kind") not in (None, NO_MOTIF):
            motif["density"] = "low" if adjustment == "quieter" else "mid"
    elif adjustment in ADJUST_TEXT:
        if adjustment == "more_photo":
            mix = _shift_mix(mix, "photo_only", 0.15, ("headline", "type_led"))
        else:
            mix = _shift_mix(mix, "headline", 0.1 if has_typed else 0.15, ("photo_only",))
            if has_typed:
                mix = _shift_mix(mix, "type_led", 0.05, ("photo_only", "headline"))
    else:
        return
    dna["mix"] = fit_mix(_round_mix(mix), comps)
    direction_gene = dna.get("direction")
    if isinstance(direction_gene, dict):
        direction_gene["text_he"] = text_he_for_mix(dna["mix"])


class DnaEditError(ValueError):
    """An owner edit that is not valid; the message is Hebrew, for the owner."""


def edit_dna(db, business, edit: dict) -> dict:
    """The owner keeps or changes a few genes (type, motif, colours), or adjusts the style in
    words (`adjust`: quieter | bolder, more_photo | more_text). Validated; what the owner set
    is locked, so a later 'another style' or re-scan keeps it."""
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
        origin = motif_edit.get("from") or (MOTIF_FROM_OWNER if kind != m.get("kind") else m.get("from"))
        if kind != NO_MOTIF and origin not in (*MOTIF_FROM, MOTIF_FROM_OWNER):
            raise DnaEditError("צריך לומר מאיפה הקישוט בא: מהלוגו, מהמקום או מהמוצר.")
        note = " ".join(str(motif_edit.get("note_he") or (m.get("note_he") if kind == m.get("kind") else "")).split())[:60]
        dna["motif"] = {"kind": kind, "from": origin if kind != NO_MOTIF else "", "note_he": note if kind != NO_MOTIF else "",
                        "color": color, "density": density}
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
        swatches = signals_for(None, business, with_images=False).get("swatches") or []
        sources = dict(dna.get("colors_source") or {})
        bases = dict(dna.get("colors_base") or {})
        for role in colors_edit:
            source, base = dna_colors.source_of(updated[role], swatches)
            sources[role] = source
            bases.pop(role, None)
            if base:
                bases[role] = base
        dna["colors"], dna["colors_source"], dna["colors_base"] = updated, sources, bases
        locked.add("colors")
    adjust = edit.get("adjust") or {}
    for key, allowed in (("tone", ADJUST_TONES), ("text", ADJUST_TEXT)):
        value = adjust.get(key)
        if not value:
            continue
        if value not in allowed:
            raise DnaEditError("השינוי הזה לא מוכר.")
        apply_adjust(dna, value, locked=locked)
        history = [item for item in dna.get("adjusted") or [] if item in (*ADJUST_TONES, *ADJUST_TEXT)]
        dna["adjusted"] = (history + [value])[-MAX_ADJUSTMENTS:]
    if edit.get("keep"):
        locked.add(KEEP_ALL)
    if locked:
        dna["locked"] = sorted(locked)
    dna["rationale_he"] = (dna.get("direction") or {}).get("feel_he") or dna.get("rationale_he") or ""
    store_dna(business, dna)
    return dna


def refresh_after_scan(bind, business_id: int) -> None:
    """Background, after a site scan, the signup or a brand save: copy the logo, then build
    (or rebuild) the business's DNA. Its model call is counted for the business
    (services/model_usage.py).
    """
    from app.services import model_usage

    with model_usage.attributed(business_id, bind):
        _refresh_after_scan(bind, business_id)


def _refresh_after_scan(bind, business_id: int) -> None:
    """refresh_after_scan, inside its model-usage scope.

    Never raises: the scan and the signup already answered. A style the owner kept
    ("לשמור") is left alone; genes the owner set stay. The logo copy is off when
    BRAND_LOGO_COPY=false, the DNA when DESIGN_DNA_ON_SCAN=false.
    """
    settings = get_settings()
    if bind is None or not (settings.design_dna_on_scan or settings.brand_logo_copy):
        return
    from sqlalchemy.orm import sessionmaker

    from app.models import Business

    db = sessionmaker(bind=bind, autoflush=False, autocommit=False)()
    try:
        business = db.get(Business, business_id)
        if business is None:
            return
        if settings.brand_logo_copy:
            try:
                brand_logo.ensure(business)
                db.commit()
            except Exception:
                log.exception("design dna: logo copy failed for business %s", business_id)
                db.rollback()
        if not settings.design_dna_on_scan:
            return
        current = load_dna(business)
        if current is None:
            create_dna(db, business)
        elif KEEP_ALL in (current.get("locked") or []):
            if stored_version(business) < DNA_VERSION:
                store_dna(business, current)  # the upgrade, kept as the owner's style
            else:
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
