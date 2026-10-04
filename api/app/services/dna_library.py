"""The Design DNA library: the only keys a business's `brand_dna` may use (docs/design-dna.md).

One source of truth for the server. The renderer (web/components/CardCanvas.tsx) draws
exactly these fonts, compositions, motifs and signatures, and reads this list from
`GET /brand/dna/library`. A key that is not here never reaches a stored DNA or a post:
`services/design_dna.py` validates every model answer against it.

Fonts are Google Fonts families with Hebrew support (all OFL). Weights are the ones the
family really ships, so a stored weight always exists when the web loads the family.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

LIBRARY_VERSION = 2


@dataclass(frozen=True)
class Font:
    family: str
    category: str  # serif | slab | sans | rounded | display | hand
    weights: tuple[int, ...]
    roles: tuple[str, ...]  # "display" (headlines) and/or "text" (body, CTA, price)


FONTS: dict[str, Font] = {
    "frank-ruhl-libre": Font("Frank Ruhl Libre", "serif", (300, 400, 500, 600, 700, 800, 900), ("display", "text")),
    "noto-serif-hebrew": Font("Noto Serif Hebrew", "serif", (100, 200, 300, 400, 500, 600, 700, 800, 900), ("display", "text")),
    "david-libre": Font("David Libre", "serif", (400, 500, 700), ("display", "text")),
    "bellefair": Font("Bellefair", "serif", (400,), ("display",)),
    "suez-one": Font("Suez One", "slab", (400,), ("display",)),
    "secular-one": Font("Secular One", "sans", (400,), ("display",)),
    "rubik": Font("Rubik", "sans", (300, 400, 500, 600, 700, 800, 900), ("display", "text")),
    "assistant": Font("Assistant", "sans", (200, 300, 400, 500, 600, 700, 800), ("display", "text")),
    "ibm-plex-sans-hebrew": Font("IBM Plex Sans Hebrew", "sans", (100, 200, 300, 400, 500, 600, 700), ("display", "text")),
    "heebo": Font("Heebo", "sans", (100, 200, 300, 400, 500, 600, 700, 800, 900), ("display", "text")),
    "varela-round": Font("Varela Round", "rounded", (400,), ("display", "text")),
    "karantina": Font("Karantina", "display", (300, 400, 700), ("display",)),
    "amatic-sc": Font("Amatic SC", "hand", (400, 700), ("display",)),
    "playpen-sans-hebrew": Font("Playpen Sans Hebrew", "hand", (100, 200, 300, 400, 500, 600, 700, 800), ("display", "text")),
}

DISPLAY_FONTS = tuple(key for key, font in FONTS.items() if "display" in font.roles)
TEXT_FONTS = tuple(key for key, font in FONTS.items() if "text" in font.roles)
# Body text below 300 or above 600 stops reading as text on a phone.
TEXT_WEIGHT_RANGE = (300, 600)

# Text positions are logical: "start" is the reading start (the right edge in Hebrew).
TEXT_POSITIONS = ("top", "center", "bottom", "start", "end")
# The card frame. Feed posts are 4:5; reels and stories are 9:16.
CROPS = ("4:5", "9:16")


# How much text a post carries (docs/design-dna.md, Revision 1, "one message per post"):
# `photo_only` = no text on the image, or one word; `headline` = a headline (and at most
# one short line) on the photo's calm area; `type_led` = the text is the picture.
TEXT_MODES = ("photo_only", "headline", "type_led")


@dataclass(frozen=True)
class Composition:
    photo: bool
    text_positions: tuple[str, ...]
    crops: tuple[str, ...]
    # What the photograph must leave room for, written into the image prompt. `{pos}` is
    # the post's text position. Never describes a panel to draw: the renderer draws it.
    photo_zone: str
    label_he: str
    # The text modes this composition can carry. A layout built around a text stub
    # (ticket, split, corner tab...) has no photo-only form.
    text_modes: tuple[str, ...] = ("headline",)


COMPOSITIONS: dict[str, Composition] = {
    "full_bleed": Composition(
        True, ("bottom", "top"), CROPS,
        "The photo fills the whole card. The headline is set over the {pos} third, so keep "
        "that third calmer: the same surface and light continued, with less detail and no key "
        "part of the subject. It must still be photographed content, never blank or blurred out.",
        "תמונה מלאה",
        text_modes=("photo_only", "headline"),
    ),
    "inset_frame": Composition(
        True, ("bottom", "top"), CROPS,
        "The photo is shown inside a frame, with a margin of brand colour around it. Compose a "
        "self-contained picture with nothing important touching the edges.",
        "תמונה ממוסגרת",
        text_modes=("photo_only", "headline"),
    ),
    "split": Composition(
        True, ("bottom", "top"), CROPS,
        "The card is split: the photo takes one half and the text the other. Keep the subject "
        "compact and near the middle of the frame so it survives a tight crop.",
        "חצי תמונה, חצי טקסט",
    ),
    "type_led": Composition(
        False, ("center", "top"), CROPS,
        "No photograph is used: this card is typography on the brand's paper colour.",
        "טקסט גדול בלי תמונה",
        text_modes=("type_led",),
    ),
    "stacked_bands": Composition(
        True, ("top", "bottom"), CROPS,
        "Bands of brand colour cross the top and the bottom of the card. Put the subject across "
        "the middle at a generous size; the top and bottom edges will be covered.",
        "פסים של צבע",
    ),
    "corner_tab": Composition(
        True, ("bottom", "top"), CROPS,
        "A small tab carrying the text covers one corner at the {pos}. Keep that corner free of "
        "the subject.",
        "לשונית בפינה",
    ),
    "arch_window": Composition(
        True, ("bottom", "top"), CROPS,
        "The photo is seen through an arch-shaped window with a rounded top. Keep the subject "
        "central and in the lower two thirds; the top corners will be cut away.",
        "חלון קשת",
        text_modes=("photo_only", "headline"),
    ),
    "circle_crop": Composition(
        True, ("bottom", "top"), CROPS,
        "The photo is cropped to a circle. Centre the subject with room around it; the corners "
        "will be cut away.",
        "תמונה עגולה",
        text_modes=("photo_only", "headline"),
    ),
    "ticket": Composition(
        True, ("bottom",), CROPS,
        "The photo fills the upper part of a ticket-shaped card. Keep the subject in the upper "
        "middle; the bottom quarter is cut off for the text stub.",
        "כרטיס",
    ),
    "collage_grid": Composition(
        True, ("center", "bottom"), CROPS,
        "The photo is one cell of a small grid. Keep one clear subject that still reads when "
        "small, without busy detail.",
        "רשת תמונות",
        text_modes=("photo_only", "headline"),
    ),
    "handwritten_note": Composition(
        True, ("bottom", "start"), CROPS,
        "A handwritten note is placed over the {pos} of the photo. Keep that area quiet.",
        "פתק בכתב יד",
    ),
    "editorial_column": Composition(
        True, ("start", "end"), ("4:5",),
        "Magazine layout: the photo is a tall column on one side and the text a column on the "
        "other. Compose vertically, with the subject in the middle of the column.",
        "עמודה של מגזין",
    ),
}
PHOTO_FREE_COMPOSITIONS = frozenset(key for key, comp in COMPOSITIONS.items() if not comp.photo)
# Compositions a photo can carry alone (text mode `photo_only`). Every DNA keeps at least one.
PHOTO_ONLY_COMPOSITIONS = frozenset(key for key, comp in COMPOSITIONS.items() if "photo_only" in comp.text_modes)

# Revision 1: "none" is the default motif. Any other is allowed only when the DNA can say
# what in this brand it comes from (`motif.from` + `motif.note_he`, checked against the
# brand's own words with MOTIF_EVIDENCE). The renderer still draws every key.
NO_MOTIF = "none"
MOTIFS: dict[str, str] = {
    NO_MOTIF: "בלי קישוט",
    "scalloped_edge": "קצה גלי",
    "stripes": "פסים",
    "arches": "קשתות",
    "dots": "נקודות",
    "grain": "גרעיניות של נייר",
    "stamp": "חותמת",
    "underline": "קו תחתון בכתב יד",
    "tape": "סלוטייפ",
    "thread": "קו של חוט",
}
# The list ornaments the owner review called Canva moves (scalloped frames, rainbow arcs and
# rings, dashed thread frames, tape, stamps). Never a default; drawn only as the quiet echo
# of something real in the brand.
GENERIC_MOTIFS = frozenset({"scalloped_edge", "arches", "tape", "thread", "stamp"})
# Where a motif may come from: a shape in the logo, a texture of the real place, a detail
# of the product. "owner" = set by hand in PUT /brand/dna (the owner knows their brand).
MOTIF_FROM = ("logo", "place", "product")
MOTIF_FROM_OWNER = "owner"
# What the brand's own words must mention for a motif to be justified (Hebrew stems and
# English, matched as substrings of the logo description, the place or the product text).
MOTIF_EVIDENCE: dict[str, tuple[str, ...]] = {
    "scalloped_edge": ("גלי", "גלים", "סלסול", "תחרה", "מפית", "scallop", "wave", "lace", "doily"),
    "stripes": ("פסים", "מפוספס", "סוכך", "stripe", "awning"),
    "arches": ("קשת", "קמרון", "arch"),
    "dots": ("נקודות", "נקודה", "פולקה", "polka", "dots", "dotted"),
    "grain": ("נייר", "גרעיני", "טקסטור", "מרקם", "פשתן", "קרטון", "טיח", "בטון", "אבן",
              "paper", "grain", "texture", "linen", "kraft", "plaster", "concrete", "stone"),
    "stamp": ("חותמת", "חותם", "stamp", "seal"),
    "underline": ("כתב יד", "מכחול", "חתימה", "handwrit", "hand-drawn", "brush", "signature"),
    "tape": ("סלוטייפ", "נייר דבק", "מדבק", "tape", "sticker"),
    "thread": ("חוט", "תפר", "תפיר", "רקמה", "רקום", "thread", "stitch", "embroider", "sewing"),
}
MOTIF_COLORS = ("accent", "accent_2", "ink", "tint")
MOTIF_DENSITIES = ("low", "mid")

# How the business signs a post. With a same-origin logo copy: the logo small in a corner
# or on a quiet footer band. Without one: the name set in the display face. "none" for
# posts that need no mark (on the feed the profile already shows it). Never an invented
# monogram or stamp.
SIGNATURES: dict[str, str] = {
    "corner_mark": "הלוגו קטן בפינה",
    "footer_band": "פס תחתון שקט עם הלוגו",
    "name_only": "שם העסק בפונט הכותרות",
    "none": "בלי סימן",
}
LOGO_SIGNATURES = ("corner_mark", "footer_band", "none")
NAME_SIGNATURES = ("name_only", "none")
# v1 kinds, read by the v1 -> v2 upgrade.
LEGACY_SIGNATURES = {"stamp": "corner_mark", "tab": "corner_mark"}
# Which ground the logo reads on, worked out from its own pixels (services/brand_logo.py).
LOGO_ON = ("light", "dark", "any")

TYPE_SCALES = ("large", "medium", "editorial")
# Hebrew has no letter case: this applies to Latin letters in a headline (a product name).
HEADLINE_CASES = ("sentence", "upper")
PRICE_STYLES = ("tag", "inline", "circle")
# v1 only: the CTA lives in the caption now (`copy.cta_on_image` is always false).
CTA_STYLES = ("underline", "pill", "arrow")
COLOR_ROLES = ("ink", "paper", "accent", "accent_2", "on_photo", "tint")
# `colors_source.<role>`: read off the logo's pixels, off the site (palette, screenshot,
# CSS), derived from one of those by lightness only, or set by the owner by hand.
COLOR_SOURCES = ("logo", "site", "derived", "owner")
# PUT /brand/dna `adjust`: the owner's words, not pickers.
ADJUST_TONES = ("quieter", "bolder")
ADJUST_TEXT = ("more_photo", "more_text")
# Design rules the renderer and the server enforce (docs/design-dna.md, Revision 1).
RULES = {
    "overlay_headline_max_words": 6,
    "overlay_sub_max_words": 6,
    # Smallest text on the image, and the headline, as a share of the card width.
    "min_text_pct_of_width": 3.2,
    "min_headline_pct_of_width": 7.0,
    "cta_on_image": False,
}

# The old renderer's six layouts (`overlay_theme`, still stored on older posts) and the
# composition each one is closest to, with where its text sat.
LEGACY_THEME_COMPOSITION: dict[str, tuple[str, str]] = {
    "lower_editorial": ("full_bleed", "bottom"),
    "split_panel": ("split", "bottom"),
    "framed_inset": ("inset_frame", "bottom"),
    "cover_type": ("full_bleed", "top"),
    "promo_ribbon": ("stacked_bands", "top"),
    "type_hero": ("type_led", "center"),
    # Names older than the six layouts (they mapped onto them in CardCanvas.tsx).
    "ink_pill": ("full_bleed", "bottom"),
    "minimal_text": ("full_bleed", "top"),
    "paper_badge": ("inset_frame", "bottom"),
    "frosted_glass": ("split", "bottom"),
    "accent_banner": ("stacked_bands", "top"),
}


# --- the site's own fonts → the nearest library family ---------------------------------

# Families sites use (and system fonts), mapped by look: serif to serif, rounded to
# rounded, condensed display to condensed display.
_KNOWN_FONTS: dict[str, str] = {
    "alef": "assistant",
    "arimo": "heebo",
    "open sans": "assistant",
    "open sans hebrew": "assistant",
    "noto sans": "heebo",
    "noto sans hebrew": "heebo",
    "roboto": "heebo",
    "arial": "heebo",
    "helvetica": "heebo",
    "helvetica neue": "heebo",
    "montserrat": "heebo",
    "madefor": "heebo",
    "wix madefor display": "heebo",
    "wix madefor text": "assistant",
    "poppins": "rubik",
    "gisha": "rubik",
    "lato": "assistant",
    "raleway": "assistant",
    "source sans pro": "assistant",
    "source sans 3": "assistant",
    "josefin sans": "assistant",
    "miriam libre": "assistant",
    "miriam": "assistant",
    "tahoma": "assistant",
    "segoe ui": "assistant",
    "inter": "ibm-plex-sans-hebrew",
    "work sans": "ibm-plex-sans-hebrew",
    "dm sans": "ibm-plex-sans-hebrew",
    "ibm plex sans": "ibm-plex-sans-hebrew",
    "nunito": "varela-round",
    "nunito sans": "varela-round",
    "quicksand": "varela-round",
    "fredoka": "varela-round",
    "m plus rounded 1c": "varela-round",
    "playfair display": "frank-ruhl-libre",
    "libre baskerville": "frank-ruhl-libre",
    "georgia": "frank-ruhl-libre",
    "times new roman": "frank-ruhl-libre",
    "times": "frank-ruhl-libre",
    "narkisim": "frank-ruhl-libre",
    "noto serif": "noto-serif-hebrew",
    "merriweather": "noto-serif-hebrew",
    "pt serif": "noto-serif-hebrew",
    "lora": "david-libre",
    "eb garamond": "david-libre",
    "david": "david-libre",
    "cormorant": "bellefair",
    "cormorant garamond": "bellefair",
    "cinzel": "bellefair",
    "abril fatface": "suez-one",
    "alfa slab one": "suez-one",
    "roboto slab": "suez-one",
    "anton": "secular-one",
    "bebas neue": "karantina",
    "oswald": "karantina",
    "league gothic": "karantina",
    "pacifico": "amatic-sc",
    "dancing script": "amatic-sc",
    "caveat": "amatic-sc",
    "indie flower": "amatic-sc",
    "playpen sans": "playpen-sans-hebrew",
    "comic neue": "playpen-sans-hebrew",
}

_FAMILY_TO_KEY = {font.family.lower(): key for key, font in FONTS.items()}


def _fold_font(name: str) -> str:
    cleaned = re.sub(r"[\"'`]", "", str(name or "")).strip().lower()
    cleaned = re.sub(r"[-_+]+", " ", cleaned)
    cleaned = re.sub(r"\b(regular|bold|light|medium|semibold|black|italic|variable|vf|webfont|web)\b", "", cleaned)
    return " ".join(cleaned.split())


def nearest_font(name: str) -> str | None:
    """The library key closest to a font name a site uses, or None when it says nothing.

    Exact family first ("Frank Ruhl Libre" → frank-ruhl-libre), then families sites use
    that the library does not carry, then the name's own hints (serif, slab, round...).
    """
    folded = _fold_font(name)
    if not folded:
        return None
    if folded.replace(" ", "-") in FONTS:
        return folded.replace(" ", "-")
    if folded in _FAMILY_TO_KEY:
        return _FAMILY_TO_KEY[folded]
    for family, key in _FAMILY_TO_KEY.items():
        if folded.startswith(family):
            return key
    if folded in _KNOWN_FONTS:
        return _KNOWN_FONTS[folded]
    for known, key in sorted(_KNOWN_FONTS.items(), key=lambda item: -len(item[0])):
        if folded.startswith(known):
            return key
    if "slab" in folded:
        return "suez-one"
    if "round" in folded:
        return "varela-round"
    if any(word in folded for word in ("script", "hand", "marker", "brush")):
        return "amatic-sc"
    if any(word in folded for word in ("condensed", "narrow", "compressed")):
        return "karantina"
    if "mono" in folded:
        return "ibm-plex-sans-hebrew"
    if "serif" in folded and "sans" not in folded:
        return "frank-ruhl-libre"
    if "sans" in folded:
        return "assistant"
    return None


def snap_weight(font_key: str, weight, *, role: str = "display") -> int:
    """The family's real weight nearest to `weight` (text weights stay readable)."""
    font = FONTS[font_key]
    available = list(font.weights)
    if role == "text":
        low, high = TEXT_WEIGHT_RANGE
        readable = [w for w in available if low <= w <= high]
        available = readable or available
    try:
        wanted = int(weight)
    except (TypeError, ValueError):
        wanted = 700 if role == "display" else 400
    return min(available, key=lambda w: (abs(w - wanted), -w))


def google_fonts_family(font_key: str) -> str:
    """The `family=` value for the Google Fonts CSS2 API, with this family's weights."""
    font = FONTS[font_key]
    weights = ";".join(str(w) for w in font.weights)
    return f"{font.family.replace(' ', '+')}:wght@{weights}"


def library_payload() -> dict:
    """What `GET /brand/dna/library` returns: every key the renderer must draw (v2)."""
    return {
        "version": LIBRARY_VERSION,
        "fonts": [
            {
                "key": key,
                "family": font.family,
                "category": font.category,
                "weights": list(font.weights),
                "roles": list(font.roles),
                "google_fonts": google_fonts_family(key),
            }
            for key, font in FONTS.items()
        ],
        "compositions": [
            {
                "key": key,
                "photo": comp.photo,
                "text_positions": list(comp.text_positions),
                "crops": list(comp.crops),
                "text_modes": list(comp.text_modes),
                "label_he": comp.label_he,
            }
            for key, comp in COMPOSITIONS.items()
        ],
        "motifs": [
            {"key": key, "label_he": label, "generic": key in GENERIC_MOTIFS}
            for key, label in MOTIFS.items()
        ],
        "signatures": [
            {"key": key, "label_he": label, "needs_logo": key in ("corner_mark", "footer_band")}
            for key, label in SIGNATURES.items()
        ],
        "enums": {
            "type_scale": list(TYPE_SCALES),
            "headline_case": list(HEADLINE_CASES),
            "price_style": list(PRICE_STYLES),
            "motif_color": list(MOTIF_COLORS),
            "motif_density": list(MOTIF_DENSITIES),
            "motif_from": [*MOTIF_FROM, MOTIF_FROM_OWNER],
            "color_roles": list(COLOR_ROLES),
            "color_sources": list(COLOR_SOURCES),
            "text_position": list(TEXT_POSITIONS),
            "text_mode": list(TEXT_MODES),
            "logo_on": list(LOGO_ON),
            "crop": list(CROPS),
            "adjust_tone": list(ADJUST_TONES),
            "adjust_text": list(ADJUST_TEXT),
        },
        "rules": dict(RULES),
        "legacy_signatures": dict(LEGACY_SIGNATURES),
        "legacy_overlay_theme": {
            theme: {"composition": comp, "text_position": pos}
            for theme, (comp, pos) in LEGACY_THEME_COMPOSITION.items()
        },
    }
