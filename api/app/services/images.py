"""Image prompts and the served media folder.

The prompts are written from the business's Design DNA (services/design_dna.py): its own
photo direction (grade, light, angle, props, background, never-list) plus an art
direction for its field, and the post's composition decides what the photo must leave
room for. Nothing here is shared house wording: the fixed lighting and bakery phrases
that once went into every business's prompt are gone (docs/design-dna.md).

Which model gets the prompt, and the fallback, is services/image_routing.py.
"""

import hashlib
import re
import time
from pathlib import Path

from app.services.business_fields import coerce_field, field_label
from app.services.dna_library import COMPOSITIONS
from app.services.post_design import clean_design, crop_for, legacy_design

_ORIENTATION = {
    "9:16": "a vertical 9:16 frame (portrait, like a phone screen)",
    "4:5": "a vertical 4:5 portrait frame (the Instagram feed shape)",
}
_POSITION_WORDS = {
    "top": "top",
    "bottom": "bottom",
    "center": "middle",
    "start": "right-hand side (where Hebrew reading starts)",
    "end": "left-hand side",
}

# What viewers have learned to read as "generated". A positive prompt does not remove
# these; an explicit never-list does. The glossy, saturated, symmetrical look is the
# fastest-recognised tell, and it is exactly what a model produces by default.
_NEVER = """- Any text, letters, numbers, Hebrew or Latin, logos, watermarks, price tags, captions.
- Slick advertising gloss: no gradients, no lens flare, no sparkle or bokeh overlays,
  no glassmorphism, no drop shadows, no vignette, no HDR glow.
- Perfect symmetry, or a centred, staged, catalogue arrangement.
- Plastic-looking or waxy surfaces (food, skin, fabric); over-saturated colour; unnaturally
  uniform texture.
- Poreless skin, identical catchlights, or hands with the wrong number of fingers.
- People's faces, unless the brief asks for one.
- Floating or physically impossible objects, cut-out edges, missing contact shadows.
- Anything that reads as stock: a white studio sweep, a generic marble surface, a person in
  a suit pointing at a laptop, an unblemished flat-lay.
- Invented signage, menus, labels or packaging.
- Collage, split panels, borders, frames, or any card-like layout drawn inside the image."""

_LAYOUT_FURNITURE = (
    "Never draw layout furniture: no panels, bands, bars, blocks of flat colour, borders or "
    "frames. The app adds those; anything like them in the photo is wrong. Never leave a "
    "large area blank, flat, blurred out or an empty wash of colour: a quiet zone means "
    "calmer content, not absent content."
)

# Art direction per field: what a real photo in that trade shows. Field-level, so it is
# only ever added to the business's own photo direction, never instead of it.
FIELD_ART_DIRECTION = {
    "food": (
        "Food as this place really serves it: the actual portion in the plate, cup or wrapping it "
        "leaves the counter in, with the marks of real handling (a drip, a torn edge, a spoon resting "
        "in it). Shot where it is made or eaten here, not on a styled set."
    ),
    "fashion": (
        "The garment as a customer meets it: on its hanger, folded on the shop's own table, or worn "
        "with the face out of frame. The weave, seams and drape must read up close."
    ),
    "jewelry": (
        "The piece at true scale, with the real reflections of its metal and the actual cut of its "
        "stones, on the shop's own tray or a hand with the face out of frame. No floating pieces, no "
        "sparkle effects."
    ),
    "beauty": (
        "The result and the tools of the treatment: real skin texture, nails or hair, the products in "
        "use, the studio's own chair, basin or shelf. Never a retouched beauty-advert face."
    ),
    "health": (
        "Care as it happens in this clinic: its own room and equipment, a practitioner's hands at work, "
        "calm and honest. No stock doctors, no anatomy graphics."
    ),
    "fitness": (
        "The studio or field as it is used: its own floor, equipment and windows, a body in motion seen "
        "from behind or cropped below the face, effort visible."
    ),
    "home": (
        "Finished work and what it is made of: a real room, or a close detail of a joint, a tile or a "
        "fabric sample, in the true light of that space."
    ),
    "real_estate": (
        "The property's real rooms, views and light at an honest time of day, verticals kept straight. "
        "No virtual staging, no replaced sky."
    ),
    "professional": (
        "The work behind the service, never a person in a suit: the desk, the documents, the tools of "
        "the trade, the office's own window."
    ),
    "education": (
        "A class or a workshop in progress: materials on the table, hands working, the room's own boards "
        "and walls. No faces in focus."
    ),
    "hospitality": (
        "The place itself: its rooms, view, table or path at the hour guests know it, with the marks of "
        "being lived in."
    ),
    "kids": (
        "Products and spaces at a child's height, in a real home or in the shop. Colour comes from the "
        "products themselves; children only from behind or out of frame."
    ),
    "pets": (
        "The product in use by a real animal, or beside its bowl, bed or leash, at the animal's eye "
        "level."
    ),
    "gifts": (
        "The gift as it will be received: the wrapping, the card, the flowers or the box being opened by "
        "hands, on the shop's own counter."
    ),
    "other": (
        "What this business really makes or does, in the place it happens, with its own materials and "
        "light."
    ),
}


def _field_key(business: dict) -> str:
    return coerce_field(business.get("business_type") or business.get("field") or "", business.get("offerings") or "").key


def _post_design(post: dict) -> dict:
    return (
        clean_design(post.get("design"), post)
        or legacy_design(post)
        or {"composition": "full_bleed", "crop": crop_for(post.get("format")), "text_position": "bottom"}
    )


def aspect_for(post: dict) -> str:
    """The image's aspect ratio: the card's crop (9:16 for a reel or story, else 4:5)."""
    return _post_design(post)["crop"]


def _no_text(post: dict, design: dict) -> bool:
    return post.get("has_overlay") is False or design.get("text_mode") == "photo_only"


def composition_zone(post: dict) -> str:
    """What the photo must leave room for, from the post's composition and text position."""
    design = _post_design(post)
    if _no_text(post, design):
        return (
            "No text will be placed on this image, so treat it as a clean hero photograph. "
            "Place the subject confidently in the frame with deliberate, balanced margins."
        )
    zone = COMPOSITIONS[design["composition"]].photo_zone
    return zone.replace("{pos}", _POSITION_WORDS.get(design["text_position"], "bottom"))


def negative_space_line(post: dict) -> str:
    """Design DNA v2, rule 2: the text sits in the photo's calm area, so a generated photo
    leaves one where the composition sets the headline."""
    design = _post_design(post)
    if _no_text(post, design) or not COMPOSITIONS[design["composition"]].photo:
        return ""
    where = _POSITION_WORDS.get(design["text_position"], "bottom")
    return (
        f"- Leave calm negative space in the {where} of the frame (about a third of it) where a "
        "short headline will be set: the same surface and light continued, with no part of the "
        "subject, no face and no busy detail there."
    )


def _photo_lines(dna: dict | None, brand: dict) -> list[str]:
    photo = (dna or {}).get("photo") or {}
    if photo:
        lines = [
            f"- Colour grade: {photo.get('grade')}",
            f"- Light: {photo.get('light')}",
            f"- Camera: {photo.get('angle')}",
            f"- Background: {photo.get('background')}",
        ]
        if photo.get("props"):
            lines.append(f"- Props that belong to this business: {', '.join(photo['props'])}")
        colors = (dna or {}).get("colors") or {}
        if colors:
            lines.append(
                f"- Palette to find in real surfaces, props and light (never painted on): "
                f"{colors.get('paper')}, {colors.get('accent')}, {colors.get('accent_2')}"
            )
        return lines
    palette = ", ".join(f"{s.get('name', '')} {s.get('hex')}" for s in brand.get("palette") or [])
    return [
        f"- Brand visual style: {brand.get('visual_style') or 'not read'}",
        f"- How its own photos look: {brand.get('photography') or 'not read'}",
        f"- Palette to find in real surfaces, props and light (never painted on): {palette or 'not read'}",
    ]


def _never_block(dna: dict | None) -> str:
    from app.services.design_dna import DEFAULT_NEVER  # the defaults are already in _NEVER

    extra = [item for item in ((dna or {}).get("photo") or {}).get("never") or [] if item and item not in DEFAULT_NEVER]
    lines = _NEVER
    if extra:
        lines += "\n" + "\n".join(f"- {item}" for item in extra)
    return lines


def build_image_prompt(post: dict, brand: dict, business: dict, dna: dict | None = None) -> str:
    """A new photograph for the post, from the DNA's photo direction (the brand's
    description when there is no DNA), the field's art direction and the composition."""
    scene = post.get("scene_description") or post.get("image_prompt") or post.get("title")
    orientation = _ORIENTATION.get(aspect_for(post), _ORIENTATION["4:5"])
    field = _field_key(business)
    photo = "\n".join(_photo_lines(dna, brand))
    return f"""
Create one finished photograph for an Israeli small business's Instagram post.
It must look like a real photograph taken for this business: not a website screenshot,
not a UI mockup, not a stock-library image, not an advert.

Framing: {orientation}. Fill the frame; it will be used as the card's photo.

Business: {business.get("name")} ({field_label(field)})
What they sell or do: {business.get("offerings")}
Voice (do not invent a luxury or agency look if the business is neighbourhood or handmade): {brand.get("voice")}

Scene for this post:
{scene}

This business's photo direction:
{photo}

What a real photo in this field shows: {FIELD_ART_DIRECTION.get(field, FIELD_ART_DIRECTION["other"])}

COMPOSITION, as important as the subject:
- {composition_zone(post)}
{negative_space_line(post) or "- The subject is the hero; nothing will cover it."}
- Keep the main subject and any face out of the text area, but that area must still be
  photographed content: surface, texture and light.
- {_LAYOUT_FURNITURE}

STRICT RULES, never include any of these:
{_never_block(dna)}
"""


def edit_subject(post: dict) -> str:
    return str(post.get("featured_item_name") or post.get("product") or "").strip()[:80]


def build_edit_prompt(post: dict, dna: dict | None, business: dict, *, labelled: bool = False) -> str:
    """Improve the owner's real photo for this post, keeping the product exactly as it is.

    `labelled`: the photo arrives as REFERENCE PHOTO 1 (the Gemini fallback), rather than
    as the image being edited (Muse's edits endpoint)."""
    photo = (dna or {}).get("photo") or {}
    subject = edit_subject(post)
    field = _field_key(business)
    what = f"of {subject}" if subject else "of what it sells"
    source = "The attached REFERENCE PHOTO 1 is" if labelled else "This is"
    orientation = _ORIENTATION.get(aspect_for(post), _ORIENTATION["4:5"])
    # No props here: an edit adds nothing. The DNA's props are for a new image; offered to an
    # edit ("a prop that belongs here: sesame seeds beside braided challah, baker hands"),
    # Muse added a challah and hands to the owner's sourdough photo (#111 loop run).
    lines = [
        f"{source} a real photo {what}, taken by {business.get('name')} ({field_label(field)}). "
        "Prepare it for their Instagram feed.",
        "Keep what it shows exactly as it is: the same product, shape, proportions, colour, texture, "
        "count and every detail. Do not redraw, restyle, re-make or replace it, and do not add or "
        "remove items.",
        "Change only:",
        f"- the light: relight it as {photo.get('light') or 'one clear directional source, true to the place'}",
        f"- the background: clean it up into {photo.get('background') or 'the real surface it stands on, tidied'}",
        f"- the colour grade: {photo.get('grade') or 'true to life'}",
        "Add nothing to the scene: no extra products, food, props or hands.",
    ]
    lines += [
        f"Framing: {orientation}. {composition_zone(post)}",
        _LAYOUT_FURNITURE,
        "Never include:",
        _never_block(dna),
    ]
    return "\n".join(lines)


def reference_label(post: dict) -> str:
    subject = edit_subject(post)
    of = f" of {subject}" if subject else ""
    return (
        f"REFERENCE PHOTO 1: the business's own photograph{of}. Edit this photo; keep the product "
        "in it exactly as it is."
    )


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
    references: list[tuple[bytes, str]] | None = None,  # noqa: ARG001 - kept for callers
    dna: dict | None = None,
    db=None,
) -> str:
    """Generate the post's image (Muse, falling back to Nano Banana 2) and store it."""
    from app.services.image_routing import generate_for_post

    outcome = generate_for_post(post, brand, business, dna, business_id=business_id, db=db)
    post.update(outcome.post_fields())
    return store_image_bytes(business_id, post.get("title") or "post", outcome.data, outcome.mime, post.get("week", 0))
