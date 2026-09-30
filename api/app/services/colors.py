"""Colour evidence from what a customer actually sees.

The brand scan used to trust the stylesheet. On a site built with a website builder the
stylesheet is mostly the *builder's* palette: a beige-and-hot-pink Wix lingerie shop
reported `#2b5672 #2f5dff #597dff …` — Wix's default theme — and the model dutifully
painted her brand navy and blue. What the customer sees is the logo, the photographs and
the rendered page, so those are measured here and the CSS becomes supporting evidence.

Two jobs:

- `dominant_colors(image bytes)`: a small, deterministic palette of an image (Pillow,
  median-cut quantisation on a thumbnail). Near-white, near-black and greys are dropped
  unless they dominate the image — a white page ground or a black wordmark is real brand
  evidence; a thin grey divider is not.
- `PLATFORM_DEFAULT_COLORS`: the builder defaults that show up in the CSS of sites that
  never customised them. Only colours with a source or an observation (see below): a
  colour on this list is dropped from the CSS evidence, and from a model's palette unless
  the logo, the photos or the screenshot show it too.
"""

from __future__ import annotations

import io
import re

# --- Website-builder defaults -------------------------------------------------------
#
# Wix: the default site theme (`--color_0`…`--color_N`: #2b5672, #2f5dff ramp, #383838,
#   #e0dfdf) as served on a site that never customised it — tazizi.co.il (Sept 2026),
#   whose real colours are beige and hot pink — plus the UI ramps Wix inlines on every
#   page for its own widgets (blue, red, green, yellow, orange and purple, 6–8 steps each)
#   and the blue banner of free `*.wixsite.com` sites (#116dff, #166aea, #20303c, #eff1f2).
#   The ramps were taken as the colours shared *identically* by three unrelated Israeli
#   Wix sites (tazizi, artisan1991, amramstudio); none of them uses any as a brand colour.
# Shopify Dawn: the default colour schemes in Dawn's `config/settings_data.json`
#   (text/accent #121212, accent-2 #334FB4, background-2 #F3F3F3, scheme-3 #242833) plus
#   the Shop Pay button purple (#5A31F4) that Shopify injects on product pages, and the
#   Polaris green/critical-red (#008060, #D72C0D) its storefront widgets inline.
# WordPress core: the block editor's preset palette (`--wp--preset--color--*`), which
#   every block theme inlines.
# Elementor: the four default Global Colours of a new site kit (Primary #6EC1E4,
#   Secondary #54595F, Text #7A7A7A, Accent #61CE70).
# WooCommerce: the default button/brand purples (#7F54B3 current, #A46497 legacy).
PLATFORM_DEFAULT_COLORS: dict[str, frozenset[str]] = {
    "wix": frozenset(
        {
            # theme
            "#2b5672", "#383838", "#e0dfdf", "#f1f0ef",
            # blue
            "#0f2ccf", "#2f5dff", "#597dff", "#acbeff", "#d5dfff", "#eaefff",
            # red
            "#9c2426", "#df3336", "#e55c5e", "#ed8f90", "#f4b8b9", "#f9d6d7", "#fcebeb",
            # green
            "#0d4f3d", "#4b916d", "#97c693", "#bde2a7", "#daf3c0", "#effae5", "#f1f5ed",
            # yellow
            "#d49341", "#f9ad4d", "#fabd71", "#fcd29d", "#fdead2", "#fef3e5", "#fef6ed",
            # orange
            "#ae3e09", "#ff8044", "#fe9361", "#fda77f", "#fbcfbb", "#fbe3d9", "#fdf1ec",
            # purple
            "#5000aa", "#4d3dd0", "#5a48f5", "#7200f3", "#8b2df5", "#be89f9", "#d7b7fb",
            "#f1e5fe", "#f8f2ff",
            # free-site banner
            "#116dff", "#166aea", "#20303c", "#eff1f2",
        }
    ),
    "shopify": frozenset({"#121212", "#334fb4", "#f3f3f3", "#242833", "#5a31f4", "#008060", "#d72c0d"}),
    "wordpress": frozenset(
        {
            "#cf2e2e", "#ff6900", "#fcb900", "#7bdcb5", "#00d084", "#8ed1fc",
            "#0693e3", "#abb8c3", "#eb144c", "#f78da7", "#9900ef",
        }
    ),
    "elementor": frozenset({"#6ec1e4", "#54595f", "#7a7a7a", "#61ce70"}),
    "woocommerce": frozenset({"#7f54b3", "#a46497"}),
}
ALL_PLATFORM_DEFAULTS: frozenset[str] = frozenset().union(*PLATFORM_DEFAULT_COLORS.values())

# Fallback fonts a builder ships, which say nothing about the brand's typography.
PLATFORM_FONT_RE = re.compile(
    r"madefor|wixfreemium|helveticaneue|helvetica-w0|wfont_|wf_|メイリオ|meiryo|ｍｓ ｐゴシック|ms pgothic|"
    r"ヒラギノ|hiragino|-apple-system|blinkmacsystemfont|segoe ui|noto color emoji|"
    r"apple color emoji|segoe ui emoji|dashicons|eicons|font ?awesome|woocommerce",
    re.I,
)

_PLATFORM_MARKERS = (
    ("wix", re.compile(r"static\.wixstatic\.com|static\.parastorage\.com|content=\"Wix\.com", re.I)),
    ("shopify", re.compile(r"cdn\.shopify\.com|Shopify\.theme|myshopify\.com", re.I)),
    ("wordpress", re.compile(r"/wp-content/|/wp-includes/|content=\"WordPress", re.I)),
)


def detect_platform(html: str) -> str:
    """"wix" / "shopify" / "wordpress" / "" — from markers every such site carries."""
    head = html[:600_000]
    for name, marker in _PLATFORM_MARKERS:
        if marker.search(head):
            return name
    return ""


def platform_defaults(platform: str = "") -> frozenset[str]:
    """Defaults to drop. Unknown platform: all of them — none is anyone's brand colour by
    coincidence often enough to be worth keeping from CSS alone."""
    if platform == "wordpress":
        return (
            PLATFORM_DEFAULT_COLORS["wordpress"]
            | PLATFORM_DEFAULT_COLORS["elementor"]
            | PLATFORM_DEFAULT_COLORS["woocommerce"]
        )
    if platform in PLATFORM_DEFAULT_COLORS:
        return PLATFORM_DEFAULT_COLORS[platform]
    return ALL_PLATFORM_DEFAULTS


def is_platform_font(name: str) -> bool:
    return bool(PLATFORM_FONT_RE.search(name or ""))


# --- Measuring images ---------------------------------------------------------------


def _hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def hex_to_rgb(value: str) -> tuple[int, int, int] | None:
    raw = (value or "").strip().lstrip("#")
    if len(raw) == 3:
        raw = "".join(ch * 2 for ch in raw)
    if not re.fullmatch(r"[0-9a-fA-F]{6}", raw):
        return None
    return int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)


def normalize_hex(value: str) -> str | None:
    rgb = hex_to_rgb(value)
    return _hex(rgb) if rgb else None


def is_neutral(rgb: tuple[int, int, int]) -> bool:
    """Near-white, near-black, or a grey (low chroma)."""
    r, g, b = rgb
    mx, mn = max(rgb), min(rgb)
    if mx < 40:
        return True
    if mn > 235:
        return True
    return (mx - mn) < 18


def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    # "Redmean" weighting: cheap and much closer to perception than plain RGB distance.
    rmean = (a[0] + b[0]) / 2
    dr, dg, db = a[0] - b[0], a[1] - b[1], a[2] - b[2]
    return ((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db) ** 0.5


def dominant_colors(
    data: bytes,
    max_colors: int = 5,
    *,
    neutral_share: float = 0.3,
    min_share: float = 0.02,
) -> list[dict]:
    """The main colours of an image, most common first: `[{"hex", "share"}]`.

    Transparent pixels (a logo's background) are ignored. Neutrals survive only with at
    least `neutral_share` of the visible pixels. Returns [] for anything Pillow cannot
    decode — this is evidence, never a reason to fail a scan.
    """
    try:
        from PIL import Image
    except ImportError:  # pragma: no cover - Pillow is in requirements.txt
        return []
    try:
        image = Image.open(io.BytesIO(data))
        image.draft("RGB", (256, 256))  # JPEG: decode at a fraction of the size
        image = image.convert("RGBA")
        image.thumbnail((120, 120))
    except Exception:
        return []

    raw = image.tobytes()  # RGBA, 4 bytes a pixel
    pixels = [(raw[i], raw[i + 1], raw[i + 2]) for i in range(0, len(raw), 4) if raw[i + 3] >= 128]
    if not pixels:
        return []
    solid = Image.new("RGB", (len(pixels), 1))
    solid.putdata(pixels)
    try:
        quantized = solid.quantize(colors=12, method=Image.Quantize.MEDIANCUT)
    except Exception:
        return []
    palette = quantized.getpalette() or []
    counts = sorted(quantized.getcolors() or [], reverse=True)
    total = float(len(pixels))

    merged: list[list] = []  # [rgb, count]
    for count, index in counts:
        rgb = tuple(palette[index * 3 : index * 3 + 3])
        if len(rgb) != 3:
            continue
        for item in merged:
            if color_distance(item[0], rgb) < 40:
                item[1] += count
                break
        else:
            merged.append([rgb, count])
    merged.sort(key=lambda item: -item[1])

    out: list[dict] = []
    for rgb, count in merged:
        share = count / total
        if share < min_share:
            continue
        if is_neutral(rgb) and share < neutral_share:
            continue
        out.append({"hex": _hex(rgb), "share": round(share, 3)})
        if len(out) >= max_colors:
            break
    return out


SVG_COLOR_RE = re.compile(r"(?:fill|stop-color|stroke|color)\s*[:=]\s*[\"']?\s*(#[0-9a-fA-F]{3,6})\b")


def svg_colors(svg_text: str, max_colors: int = 5) -> list[dict]:
    """Colours named in an SVG logo (fills, strokes, gradient stops), most used first."""
    counts: dict[str, int] = {}
    for match in SVG_COLOR_RE.finditer(svg_text or ""):
        value = normalize_hex(match.group(1))
        if value:
            counts[value] = counts.get(value, 0) + 1
    total = float(sum(counts.values()) or 1)
    ranked = sorted(counts.items(), key=lambda kv: -kv[1])
    out = []
    for value, count in ranked:
        rgb = hex_to_rgb(value)
        if rgb and is_neutral(rgb) and count / total < 0.3:
            continue
        out.append({"hex": value, "share": round(count / total, 3)})
        if len(out) >= max_colors:
            break
    return out


def image_size(data: bytes) -> tuple[int, int] | None:
    try:
        from PIL import Image

        with Image.open(io.BytesIO(data)) as image:
            return image.size
    except Exception:
        return None


def to_model_jpeg(data: bytes, max_width: int = 1280, quality: int = 80) -> bytes | None:
    """A compact JPEG for the vision model (a 1280x900 PNG screenshot is ~1 MB)."""
    try:
        from PIL import Image

        with Image.open(io.BytesIO(data)) as image:
            image = image.convert("RGB")
            if image.width > max_width:
                image.thumbnail((max_width, max_width * 4))
            out = io.BytesIO()
            image.save(out, format="JPEG", quality=quality, optimize=True)
            return out.getvalue()
    except Exception:
        return None


def to_model_png(data: bytes, max_side: int = 800) -> bytes | None:
    """A PNG copy (keeps a logo's transparency) for formats the model does not take."""
    try:
        from PIL import Image

        with Image.open(io.BytesIO(data)) as image:
            image = image.convert("RGBA")
            image.thumbnail((max_side, max_side))
            out = io.BytesIO()
            image.save(out, format="PNG", optimize=True)
            return out.getvalue()
    except Exception:
        return None


def merge_color_lists(lists: list[list[dict]], max_colors: int = 6) -> list[dict]:
    """Combine per-image palettes into one: close colours merge, shares average across
    the images, so a colour in every photo outranks one that fills a single photo."""
    lists = [palette for palette in lists if palette]
    if not lists:
        return []
    merged: list[list] = []  # [rgb, share_sum]
    for palette in lists:
        for item in palette:
            rgb = hex_to_rgb(item.get("hex", ""))
            if not rgb:
                continue
            share = float(item.get("share") or 0)
            for entry in merged:
                if color_distance(entry[0], rgb) < 40:
                    entry[1] += share
                    break
            else:
                merged.append([rgb, share])
    merged.sort(key=lambda entry: -entry[1])
    return [
        {"hex": _hex(rgb), "share": round(total / len(lists), 3)} for rgb, total in merged[:max_colors]
    ]


def shown_in(hex_value: str, evidence: list[dict], tolerance: float = 60) -> bool:
    """True when `hex_value` is close to a colour measured from something customers see."""
    rgb = hex_to_rgb(hex_value)
    if not rgb:
        return False
    for item in evidence:
        other = hex_to_rgb(item.get("hex", ""))
        if other and color_distance(rgb, other) <= tolerance:
            return True
    return False
