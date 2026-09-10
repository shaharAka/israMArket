import hashlib
import re
import time
from pathlib import Path

from app.services.gemini import generate_image_bytes

ASPECT = {
    "reel": "9:16",
    "carousel": "4:5",
    "image": "4:5",
    "story": "9:16",
}

# Mirrors resolveTemplate() in web/components/CardCanvas.tsx. Legacy `overlay_theme`
# values stored on existing strategies map onto the compositions the renderer actually
# draws, so the prompt can describe the real text placement.
_LEGACY_TEMPLATES = {
    "ink_pill": "lower_editorial",
    "minimal_text": "cover_type",
    "paper_badge": "framed_inset",
    "frosted_glass": "split_panel",
    "accent_banner": "promo_ribbon",
}

# Where the card renderer will paint the headline. The photo has to leave this zone
# calm and uncluttered, otherwise the text lands on top of the subject and the whole
# card looks accidental. Keep in sync with CardCanvas.tsx.
_SAFE_ZONE = {
    "lower_editorial": (
        "the BOTTOM THIRD will carry the headline over a dark gradient. That band must "
        "still be part of the photograph — keep lighting the same surface, texture and "
        "props into it — but quieter and darker, with no faces, hands or key product "
        "detail. It must NOT be blank, blurred out, or an empty wash of colour."
    ),
    "split_panel": (
        "compose everything the viewer needs to see in the UPPER portion of the frame. The "
        "bottom of the picture is cropped away by the layout, so let it be plain, evenly "
        "lit surface — the same surface continued, nothing else. Do not draw a panel, "
        "band, block of flat colour, or any border."
    ),
    "framed_inset": (
        "the photo is shown as an inset frame on a flat brand-colour ground. Compose a "
        "self-contained square-ish image with even margins of interest; no important "
        "detail hard against the edges."
    ),
    "cover_type": (
        "an oversized headline sits across the TOP THIRD, and a small brand line at the "
        "very bottom. Keep the top third low-contrast and quiet (sky, wall, soft shadow) "
        "and keep the bottom edge uncluttered — but both areas must still be real parts "
        "of the photograph, never blank or blurred-out filler."
    ),
    "promo_ribbon": (
        "compose the subject across the MIDDLE of the frame at a generous size, with the "
        "surrounding surface filling the rest. The top and bottom edges are cropped by "
        "the layout, so keep them plain — never a thin strip of detail surrounded by "
        "emptiness, and never a painted band or block of flat colour."
    ),
    # Photo-free: no image is generated for this template at all (see needs_photo).
    "type_hero": "no photograph is used — this card is typography on a brand ground.",
}

_ORIENTATION = {
    "9:16": "a vertical 9:16 frame (portrait, like a phone screen)",
    "4:5": "a vertical 4:5 portrait frame (the Instagram feed shape)",
}


# Templates that draw no photograph. Mirrors PHOTO_FREE_TEMPLATES in CardCanvas.tsx.
PHOTO_FREE_TEMPLATES = {"type_hero"}

# What viewers have learned to read as "generated". A positive prompt does not remove
# these; an explicit never-list does. The glossy, saturated, symmetrical look is the
# fastest-recognised tell, and it is exactly what a model produces by default.
_NEVER = """- Any text, letters, numbers, Hebrew or Latin, logos, watermarks, price tags, captions.
- Slick advertising gloss: no gradients, no lens flare, no sparkle or bokeh overlays,
  no glassmorphism, no drop shadows, no vignette, no HDR glow.
- Perfect symmetry, or a centred, staged, catalogue arrangement.
- Plastic-looking or waxy food; over-saturated colour; unnaturally uniform texture.
- Poreless skin, identical catchlights, or hands with the wrong number of fingers.
- Floating or physically impossible objects, cut-out edges, missing contact shadows.
- Anything that reads as stock: white studio sweep, generic marble surface, a person in
  a suit pointing at a laptop, an unblemished flat-lay.
- Invented signage, menus, labels or packaging.
- Collage, split panels, borders, frames, or any card-like layout drawn inside the image."""


def resolve_template(theme: str | None) -> str:
    if not theme:
        return "lower_editorial"
    if theme in _LEGACY_TEMPLATES:
        return _LEGACY_TEMPLATES[theme]
    return theme if theme in _SAFE_ZONE else "lower_editorial"


def needs_photo(theme: str | None) -> bool:
    """False for templates that draw no photograph, so no image is generated at all."""
    if theme in PHOTO_FREE_TEMPLATES:
        return False
    return resolve_template(theme) not in PHOTO_FREE_TEMPLATES


def build_image_prompt(post: dict, brand: dict, business: dict) -> str:
    palette = ", ".join(
        f"{swatch.get('name', '')} {swatch.get('hex')}" for swatch in brand.get("palette") or []
    )
    scene = post.get("scene_description") or post.get("image_prompt") or post.get("title")
    format_ = post.get("format") or "image"
    aspect = ASPECT.get(format_, "4:5")
    orientation = _ORIENTATION.get(aspect, _ORIENTATION["4:5"])

    has_overlay = post.get("has_overlay")
    if has_overlay is False:
        layout_rules = (
            "No text will be placed on this image, so treat it as a clean hero photograph. "
            "Place the subject confidently in the frame with deliberate, balanced margins."
        )
    else:
        template = resolve_template(post.get("overlay_theme"))
        layout_rules = (
            f"Graphic text WILL be added on top of this photo. Composition constraint: "
            f"{_SAFE_ZONE[template]}\n"
            f"Keep the main subject and any face out of that area, but it must still be "
            f"photographed content — surface, texture and light — not emptiness."
        )

    return f"""
Create one finished, art-directed photograph for an Israeli small business's Instagram post.
This must look like a real photograph taken for this business — not a website screenshot,
not a UI mockup, not a stock-library image.

Framing: {orientation}. Fill the frame; it will be used full-bleed.

Business: {business.get("name")}
What they sell: {business.get("offerings")}
Brand visual style: {brand.get("visual_style")}
Photography style: {brand.get("photography")}
Typography mood: {(brand.get("typography") or {}).get("mood")}
Exact palette to lean into: {palette}
Voice (do not invent a luxury/agency look if the brand is neighbourhood/handmade): {brand.get("voice")}

Scene and art direction to depict:
{scene}

COMPOSITION — this matters as much as the subject:
- {layout_rules}
- Direct the light: one clear source, natural and directional, with real falloff and shadow.
  Avoid flat, evenly-lit catalogue lighting.
- Show authentic materials and texture — real crumbs, flour, worn wood, linen, condensation,
  thumbprints. Imperfection reads as honest; plastic perfection reads as stock.
- Work the brand palette into props, surfaces and light, not into painted-on colour.
- Shallow depth of field, with the subject sharp and the background falling away.
- FILL THE FRAME. Every part of the picture must be real photographed content.
- Never draw layout furniture: no panels, bands, bars, blocks of flat colour,
  borders or frames. The app adds those; anything like them in the photo is wrong.
  Never leave a large area blank, flat, blurred out or an empty wash of colour —
  a quiet zone means calmer content, not absent content. A card whose photo is a
  third empty space looks like a mistake, which is exactly what it is.

STRICT RULES — never include any of these:
{_NEVER}
"""



def media_root() -> Path:
    root = Path(__file__).resolve().parents[2] / "data" / "generated"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _slug(value: str) -> str:
    """ASCII-only slug.

    Hebrew titles used to produce percent-encoded, mid-word-truncated filenames
    ("1-פתיחת-קבוצת-הוואטסאפ-השקטה-לשריון-חלות-ש-1789..."), which are awkward in URLs
    and unreadable on disk. Keep a short transliteration-safe tail plus a hash so two
    posts with the same title never collide.
    """
    cleaned = re.sub(r"[^A-Za-z0-9]+", "-", value or "").strip("-").lower()
    digest = hashlib.sha1((value or "").encode("utf-8")).hexdigest()[:8]
    return f"{(cleaned[:40] or 'post')}-{digest}"


def image_public_url(business_id: int, filename: str) -> str:
    return f"/backend/media/{business_id}/{filename}"


def store_image_bytes(business_id: int, title: str, data: bytes, mime: str, week: int = 0) -> str:
    """Persist image bytes into the served media folder and return the public URL."""
    ext = "jpg" if "jpeg" in mime else ("webp" if "webp" in mime else "png")
    timestamp = int(time.time())
    filename = f"{week}-{_slug(title or 'post')}-{timestamp}.{ext}"
    folder = media_root() / str(business_id)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / filename).write_bytes(data)
    return image_public_url(business_id, filename)


def read_stored_bytes(public_url: str) -> tuple[bytes, str] | None:
    """Load a previously stored image back off disk from its public URL.

    Lets us reuse a photo captured at scan time instead of re-downloading it from the
    customer's site on every single card generation.
    """
    prefix = "/backend/media/"
    if not public_url.startswith(prefix):
        return None
    rest = public_url[len(prefix):]
    parts = rest.split("/", 1)
    if len(parts) != 2:
        return None
    business_id, filename = parts
    path = media_root() / business_id / Path(filename).name
    if not path.is_file():
        return None
    mime = "image/png"
    suffix = path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        mime = "image/jpeg"
    elif suffix == ".webp":
        mime = "image/webp"
    return path.read_bytes(), mime


def generate_and_store(
    business_id: int,
    post: dict,
    brand: dict,
    business: dict,
    references: list[tuple[bytes, str]] | None = None,
) -> str:
    aspect = ASPECT.get(post.get("format") or "image", "4:5")
    prompt = build_image_prompt(post, brand, business)
    data, mime = generate_image_bytes(prompt, aspect, references=references)
    return store_image_bytes(business_id, post.get("title") or "post", data, mime, post.get("week", 0))

