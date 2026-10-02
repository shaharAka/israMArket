"""A Design DNA's colours are the brand's own (docs/design-dna.md, Revision 1, rule 7).

Evidence, strongest first:

1. the logo's own pixels (services/brand_logo.py; the scan's logo measurement before a
   copy exists), source `logo`;
2. the site: the brand palette read off it (and corrected by the owner), the screenshot
   and the stylesheet colours the scraper kept, source `site`.

Every role (`ink`, `paper`, `accent`, `accent_2`, `on_photo`, `tint`) is either one of
those colours exactly (a model's pick within ΔE 6 of one is snapped to it), or derived
from one by lightness only: the same hue in CIE LCh, the lightness moved, the chroma
lowered only as far as the sRGB gamut forces it (a very light tint of a saturated pink is
a paler pink, never another hue). `colors_source.<role>` says which, and
`colors_base.<role>` names the brand colour a derived role came from.

Text stays readable the same way: ink on paper is at least 4.5:1, reached by moving the
ink's lightness (never by mixing in black or another hue).

ΔE is CIE76 in Lab (D65): about 2 is a just-noticeable step; 6 is "the same colour" for a
brand; 50 or more is a different colour.
"""

from __future__ import annotations

import colorsys
import math
from dataclasses import dataclass

from app.services import colors as color_tools

# A model's colour within this of a brand colour is that brand colour.
BRAND_TOLERANCE = 6.0
MIN_TEXT_CONTRAST = 4.5
LIGHT_PAPER_L = 80.0
DARK_PAPER_L = 25.0
CHROMATIC = 12.0


# --- conversions ------------------------------------------------------------------------


def norm_hex(value) -> str | None:
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


_WHITE = (0.95047, 1.0, 1.08883)


def to_lab(hex_value: str) -> tuple[float, float, float]:
    """sRGB (D65) to CIE Lab."""

    def linear(v: int) -> float:
        c = v / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (linear(v) for v in _rgb(hex_value))
    x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / _WHITE[0]
    y = r * 0.2126 + g * 0.7152 + b * 0.0722
    z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / _WHITE[2]

    def f(t: float) -> float:
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116

    fx, fy, fz = f(x), f(y), f(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def _lab_to_linear(L: float, a: float, b: float) -> tuple[float, float, float]:
    fy = (L + 16) / 116
    fx = fy + a / 500
    fz = fy - b / 200

    def inv(t: float) -> float:
        return t ** 3 if t ** 3 > 0.008856 else (t - 16 / 116) / 7.787

    x, y, z = inv(fx) * _WHITE[0], inv(fy) * _WHITE[1], inv(fz) * _WHITE[2]
    r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z
    g = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z
    bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z
    return r, g, bl


def _in_gamut(rgb: tuple[float, float, float]) -> bool:
    return all(-0.0005 <= c <= 1.0005 for c in rgb)


def _encode(rgb: tuple[float, float, float]) -> str:
    def gamma(c: float) -> int:
        c = min(1.0, max(0.0, c))
        v = c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
        return round(min(1.0, max(0.0, v)) * 255)

    return "#" + "".join(f"{gamma(c):02x}" for c in rgb)


def lch(hex_value: str) -> tuple[float, float, float]:
    L, a, b = to_lab(hex_value)
    return L, math.hypot(a, b), math.degrees(math.atan2(b, a)) % 360


def lightness(hex_value: str) -> float:
    return to_lab(hex_value)[0]


def chroma(hex_value: str) -> float:
    return lch(hex_value)[1]


def delta_e(a: str, b: str) -> float:
    """CIE76 colour difference."""
    la, lb = to_lab(a), to_lab(b)
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(la, lb)))


def with_lightness(hex_value: str, target_l: float) -> str:
    """The same colour at another lightness: hue kept, chroma kept unless the sRGB gamut
    cannot hold it at that lightness (then the most chroma that fits)."""
    L, C, h = lch(hex_value)
    target = min(100.0, max(0.0, float(target_l)))
    rad = math.radians(h)

    def at(c: float) -> tuple[float, float, float]:
        return _lab_to_linear(target, c * math.cos(rad), c * math.sin(rad))

    if _in_gamut(at(C)):
        return _encode(at(C))
    low, high = 0.0, C
    for _ in range(24):
        mid = (low + high) / 2
        if _in_gamut(at(mid)):
            low = mid
        else:
            high = mid
    return _encode(at(low))


def derived_from(value: str, base: str) -> bool:
    """True when `value` is `base` moved in lightness only (within the brand tolerance)."""
    return delta_e(value, with_lightness(base, lightness(value))) <= BRAND_TOLERANCE


# --- evidence -------------------------------------------------------------------------------


@dataclass
class Swatch:
    hex: str
    source: str  # "logo" | "site"
    role: str = ""
    share: float = 0.0
    origin: str = ""  # "logo" | "palette" | "screenshot" | "css"

    @property
    def L(self) -> float:  # noqa: N802 - CIE notation
        return lightness(self.hex)

    @property
    def C(self) -> float:  # noqa: N802
        return chroma(self.hex)


def evidence_from(logo_colors, palette, screenshot, css) -> list[Swatch]:
    """The brand's colours, strongest first, near-duplicates (ΔE <= 6) merged into the
    first one seen. A palette role is kept on the merged colour (the logo's pink is also
    the site's "primary")."""
    out: list[Swatch] = []

    def offer(value, source: str, origin: str, role: str = "", share: float = 0.0) -> None:
        hex_value = norm_hex(value)
        if not hex_value:
            return
        for item in out:
            if delta_e(item.hex, hex_value) <= BRAND_TOLERANCE:
                if role and not item.role:
                    item.role = role
                return
        out.append(Swatch(hex_value, source, role, share, origin))

    for item in logo_colors or []:
        if isinstance(item, dict):
            offer(item.get("hex"), "logo", "logo", share=float(item.get("share") or 0))
        else:
            offer(item, "logo", "logo")
    for item in palette or []:
        if isinstance(item, dict):
            offer(item.get("hex"), "site", "palette", role=str(item.get("role") or ""))
    for item in screenshot or []:
        offer(item.get("hex") if isinstance(item, dict) else item, "site", "screenshot")
    for item in css or []:
        offer(item.get("hex") if isinstance(item, dict) else item, "site", "css")
    return out[:14]


def evidence_line(swatches: list[Swatch]) -> str:
    """The brand colours as the DNA model sees them."""
    parts = []
    for item in swatches:
        bits = [item.source]
        if item.role:
            bits.append(f"role {item.role}")
        if item.share:
            bits.append(f"{round(item.share * 100)}% of the logo")
        parts.append(f"{item.hex} ({', '.join(bits)})")
    return "; ".join(parts) or "none read"


def _seed_neutrals(seed: int) -> list[Swatch]:
    """A business with no colour at all: a quiet seeded set, all of it `derived`."""
    hue = (seed % 360) / 360

    def hls(h: float, l: float, s: float) -> str:
        r, g, b = colorsys.hls_to_rgb(h % 1, l, s)
        return "#" + "".join(f"{round(v * 255):02x}" for v in (r, g, b))

    return [
        Swatch(hls(hue, 0.42, 0.45), "derived", "primary"),
        Swatch(hls(hue, 0.96, 0.18), "derived", "background"),
        Swatch(hls(hue, 0.12, 0.20), "derived", "ink"),
    ]


# --- roles --------------------------------------------------------------------------------


@dataclass
class Pick:
    hex: str
    source: str
    base: str = ""  # the brand colour a derived pick came from


def match(value, swatches: list[Swatch]) -> Pick | None:
    """A colour the model named, as the brand colour it is (ΔE <= 6, snapped exactly to
    it) or as one derived from a brand colour by lightness, else None."""
    hex_value = norm_hex(value)
    if not hex_value or not swatches:
        return None
    nearest = min(swatches, key=lambda s: delta_e(s.hex, hex_value))
    if delta_e(nearest.hex, hex_value) <= BRAND_TOLERANCE:
        return Pick(nearest.hex, nearest.source if nearest.source != "derived" else "derived",
                    nearest.hex if nearest.source == "derived" else "")
    target = lightness(hex_value)
    fits = [(delta_e(hex_value, with_lightness(s.hex, target)), s) for s in swatches]
    fits = [(gap, s) for gap, s in fits if gap <= BRAND_TOLERANCE]
    if not fits:
        return None
    # Of the brand colours it can come from, a near-exact one closest in lightness: an
    # off-white is the site's light grey made lighter, not its black.
    gap, best = min(fits, key=lambda item: (item[0] > 2.0, abs(item[1].L - target), item[0]))
    return Pick(with_lightness(best.hex, target), "derived", best.hex)


def _derive(base: Pick | Swatch, target_l: float) -> Pick:
    root = base.base if isinstance(base, Pick) and base.base else base.hex
    value = with_lightness(base.hex, target_l)
    if delta_e(value, base.hex) <= 1.0:
        return Pick(base.hex, base.source, getattr(base, "base", ""))
    return Pick(value, "derived", root)


def _as_pick(swatch: Swatch) -> Pick:
    if swatch.source == "derived":
        return Pick(swatch.hex, "derived", "")
    return Pick(swatch.hex, swatch.source)


def readable_ink(ink: Pick, paper: str) -> Pick:
    """Ink moved in lightness only (darker on a light paper, lighter on a dark one) until
    it reads at 4.5:1."""
    if contrast(ink.hex, paper) >= MIN_TEXT_CONTRAST:
        return ink
    darker = luminance(paper) > 0.18
    start = lightness(ink.hex)
    steps = range(int(start), -1, -1) if darker else range(int(start), 101)
    for target in steps:
        candidate = with_lightness(ink.hex, target)
        if contrast(candidate, paper) >= MIN_TEXT_CONTRAST:
            return _derive(ink, target)
    return _derive(ink, 0 if darker else 100)


def build(raw, swatches: list[Swatch], seed: int) -> tuple[dict, dict, dict]:
    """(colors, colors_source, colors_base) for a DNA. `raw` is the model's answer
    ({role: "#hex"}); a role it did not answer, or answered off-brand, is chosen locally."""
    raw = raw if isinstance(raw, dict) else {}
    pool = list(swatches) or _seed_neutrals(seed)

    def model(role: str, ok) -> Pick | None:
        pick = match(raw.get(role), pool)
        return pick if pick and ok(pick.hex) else None

    def with_role(*roles: str) -> list[Swatch]:
        return [s for s in pool if s.role in roles]

    # paper: the brand's light ground (or, for a dark brand, its dark ground).
    def paper_ok(value: str) -> bool:
        return lightness(value) >= LIGHT_PAPER_L or lightness(value) <= DARK_PAPER_L

    paper = model("paper", paper_ok)
    if paper is None:
        background = with_role("background")
        light = [s for s in pool if s.L >= LIGHT_PAPER_L]
        if background and background[0].L >= LIGHT_PAPER_L:
            paper = _as_pick(background[0])
        elif background and background[0].L <= DARK_PAPER_L and any(s.L >= 85 for s in pool):
            paper = _as_pick(background[0])
        elif light:
            paper = _as_pick(max(light, key=lambda s: s.L))
        else:
            base = background[0] if background else min(pool, key=lambda s: s.C)
            paper = _derive(_as_pick(base), 96)
    dark_paper = lightness(paper.hex) <= DARK_PAPER_L

    # ink: the brand's own text colour (else its darkest; its lightest on a dark paper),
    # made readable by lightness. A brand ink that is too light is darkened, never swapped.
    def ink_ok(value: str) -> bool:
        if delta_e(value, paper.hex) < 20:
            return False
        return lightness(value) > lightness(paper.hex) if dark_paper else lightness(value) < lightness(paper.hex)

    ink = model("ink", ink_ok)
    if ink is None:
        named = [s for s in with_role("ink") if ink_ok(s.hex)]
        if named:
            ink = _as_pick(named[0])
        elif dark_paper:
            fitting = [s for s in pool if s.L >= 80 and delta_e(s.hex, paper.hex) > 10]
            ink = _as_pick(max(fitting, key=lambda s: s.L)) if fitting else _derive(paper, 97)
        else:
            fitting = [s for s in pool if s.L <= 45]
            if fitting:
                ink = _as_pick(min(fitting, key=lambda s: s.L))
            else:
                base = min(pool, key=lambda s: s.L)
                ink = _derive(_as_pick(base), 18)
    ink = readable_ink(ink, paper.hex)

    # accent: the colour people know the brand by. The logo's first chromatic colour.
    def accent_ok(value: str) -> bool:
        return delta_e(value, paper.hex) >= 15

    accent = model("accent", accent_ok)
    if accent is None:
        chromatic = [s for s in pool if s.C >= CHROMATIC and delta_e(s.hex, paper.hex) >= 15]
        # The logo's most saturated colour that is more than a speck of it (a pink wordmark
        # over pale beige shapes: the pink).
        logo = sorted((s for s in chromatic if s.source == "logo" and delta_e(s.hex, ink.hex) >= 10
                       and (s.share >= 0.15 or not s.share)), key=lambda s: -s.C)
        named = [s for s in chromatic if s.role in ("primary", "accent")]
        if logo:
            accent = _as_pick(logo[0])
        elif named:
            accent = _as_pick(named[0])
        elif chromatic:
            accent = _as_pick(chromatic[0])
        else:
            accent = Pick(ink.hex, ink.source, ink.base)  # a black-and-white brand stays one

    # accent_2: a second brand colour, else the accent lighter or darker.
    def accent2_ok(value: str) -> bool:
        return delta_e(value, accent.hex) >= 8 and delta_e(value, paper.hex) >= 8

    accent_2 = model("accent_2", accent2_ok)
    if accent_2 is None:
        others = [s for s in pool if delta_e(s.hex, accent.hex) >= 10 and delta_e(s.hex, paper.hex) >= 10
                  and delta_e(s.hex, ink.hex) >= 8]
        others.sort(key=lambda s: (s.C < CHROMATIC, pool.index(s)))
        if others:
            accent_2 = _as_pick(others[0])
        else:
            level = lightness(accent.hex)
            accent_2 = _derive(accent, level - 25 if level > 55 else level + 25)

    # tint: a quiet ground for a band or a type-led card.
    def tint_ok(value: str) -> bool:
        level = lightness(value)
        good = level <= 35 if dark_paper else level >= 82
        return good and delta_e(value, paper.hex) >= 3

    tint = model("tint", tint_ok)
    if tint is None:
        quiet = [s for s in pool if tint_ok(s.hex) and s.hex != paper.hex]
        tint = _as_pick(quiet[0]) if quiet else _derive(accent, 22 if dark_paper else 92)
        if not tint_ok(tint.hex):
            tint = _derive(paper, lightness(paper.hex) + (6 if dark_paper else -6))

    # on_photo: the headline over a photograph: very light or very dark, of the brand.
    def on_photo_ok(value: str) -> bool:
        return luminance(value) >= 0.75 or luminance(value) <= 0.04

    on_photo = model("on_photo", on_photo_ok)
    if on_photo is None:
        if luminance(paper.hex) >= 0.75:
            on_photo = paper
        else:
            light_base = paper if not dark_paper else ink
            on_photo = _derive(light_base, 97)

    picks = {"ink": ink, "paper": paper, "accent": accent, "accent_2": accent_2, "on_photo": on_photo, "tint": tint}
    colors = {role: pick.hex for role, pick in picks.items()}
    sources = {role: pick.source for role, pick in picks.items()}
    bases = {role: pick.base for role, pick in picks.items() if pick.source == "derived" and pick.base}
    return colors, sources, bases


def source_of(value: str, swatches: list[Swatch]) -> tuple[str, str]:
    """(source, base) of a colour set by hand: the brand colour it is, one derived from a
    brand colour by lightness, or the owner's own."""
    pick = match(value, swatches)
    if pick is None:
        return "owner", ""
    return pick.source, pick.base


def is_brand_color(value: str, swatches: list[Swatch]) -> bool:
    """The rule tests and QA check: a brand colour (ΔE <= 6) or one derived from a brand
    colour by lightness only."""
    hex_value = norm_hex(value)
    if not hex_value:
        return False
    return any(delta_e(hex_value, s.hex) <= BRAND_TOLERANCE or derived_from(hex_value, s.hex) for s in swatches)
