"""The business's real logo, as a same-origin copy (docs/design-dna.md, Revision 1, rule 6).

After a site scan, the signup from the draft and a brand save (all through
`design_dna.refresh_after_scan`), `brand_language.logo_url` is downloaded with the
scraper's own rules: the SSRF guard on every redirect hop (`scraper.capped_get`), a byte
cap, image types only, a minimum size (`scraper._download_logo`). Then, with Pillow:

* normalised: first frame, EXIF orientation, RGBA (transparency kept), fully transparent
  margins trimmed, at most 1024 px on the long side, saved as PNG;
* stored in the business's media folder (`media_root()/{business_id}/logo-<sha1>.png`),
  served same-origin at `/backend/media/{business_id}/logo-….png` by the media endpoint
  (owner-only), so the renderer and the PNG export never hot-link someone else's server;
* read: its dominant colours (transparent pixels and the ground of an opaque logo
  ignored) and the ground it reads on (`logo_on`: light | dark | any), from its own
  alpha and luminance.

An SVG logo is never served: an SVG from our origin can carry script. It is sanitised and
rendered to a PNG in a sandboxed child process (services/svg_logo.py), and that PNG goes
through the same steps (`format: "svg"` on the record).

The result is `Business.brand_logo_json` (`load`): `status` is `ok` (a copy exists),
`unsupported` (an SVG that could not be made a safe PNG: `reason` says why, and its fill
colours still count as logo colour evidence) or `failed`. No logo, no copy: the DNA signs
with the name (`signature.kind` name_only | none), never an invented monogram.
"""

from __future__ import annotations

import hashlib
import io
import logging
import time
from datetime import datetime, timezone

import httpx

from app.config import get_settings
from app.services import colors as color_tools
from app.services import svg_logo
from app.services.jsonutil import dumps, loads

log = logging.getLogger(__name__)

MAX_SIDE = 1024
MAX_BYTES = 900_000
# A 900 KB PNG can still decode to a huge canvas (a decompression bomb): refuse it.
MAX_PIXELS = 25_000_000
FILE_PREFIX = "logo-"
FETCH_DEADLINE_SECONDS = 20.0
# A logo that could not be fetched is tried again on a later refresh, not on every one.
RETRY_AFTER_SECONDS = 6 * 3600


# --- fetch ------------------------------------------------------------------------------


def fetch(url: str) -> dict | None:
    """The logo at `url` ({url, mime, bytes, width, height}) or None. Never raises."""
    from app.services.netguard import UnsafeUrlError
    from app.services.scraper import USER_AGENT, ScrapeBudgetExceeded, _download_logo, capped_get

    deadline = time.monotonic() + FETCH_DEADLINE_SECONDS

    def fetch_one(client: httpx.Client, target: str, **_kwargs) -> httpx.Response:
        return capped_get(client, target, max_bytes=MAX_BYTES, deadline=deadline, request_timeout=10.0)

    try:
        with httpx.Client(timeout=10.0, headers={"User-Agent": USER_AGENT}) as client:
            logo = _download_logo(client, [{"url": url, "source": "brand"}], fetch=fetch_one, attempts=1)
    except (httpx.HTTPError, UnsafeUrlError, ScrapeBudgetExceeded, ValueError):
        return None
    if logo and len(logo.get("bytes") or b"") > MAX_BYTES:
        return None
    return logo


# --- normalise and read ---------------------------------------------------------------------


def normalise(data: bytes, mime: str) -> tuple[bytes, dict] | None:
    """(PNG bytes, analysis) for a raster logo, or None (SVG, not an image, too large).

    An SVG never comes here as SVG: `rasterise_svg` renders it to a PNG first."""
    if mime == "image/svg+xml":
        return None
    try:
        from PIL import Image, ImageOps

        image = Image.open(io.BytesIO(data))
        width, height = image.size
        if width * height > MAX_PIXELS or min(width, height) < 1:
            return None
        image.seek(0)
        image.load()
        try:
            image = ImageOps.exif_transpose(image)
        except Exception:  # an odd EXIF block is not a reason to lose the logo
            pass
        image = image.convert("RGBA")
        box = image.getchannel("A").getbbox()
        if box is None:
            return None  # fully transparent
        # Read the pixels before the margins go: the transparent ground is what says the
        # logo was made to sit on any colour.
        reading = analyse(image)
        if box != (0, 0, image.width, image.height):
            image = image.crop(box)
        image.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        image.save(out, format="PNG", optimize=True)
    except Exception:
        return None
    return out.getvalue(), reading


def _quantise(pixels: list[tuple[int, int, int]], max_colors: int = 5, min_share: float = 0.03) -> list[dict]:
    from PIL import Image

    if not pixels:
        return []
    strip = Image.new("RGB", (len(pixels), 1))
    strip.putdata(pixels)
    try:
        quantised = strip.quantize(colors=10, method=Image.Quantize.MEDIANCUT)
    except Exception:
        return []
    palette = quantised.getpalette() or []
    merged: list[list] = []
    for count, index in sorted(quantised.getcolors() or [], reverse=True):
        rgb = tuple(palette[index * 3: index * 3 + 3])
        if len(rgb) != 3:
            continue
        for item in merged:
            if color_tools.color_distance(item[0], rgb) < 40:
                item[1] += count
                break
        else:
            merged.append([rgb, count])
    merged.sort(key=lambda item: -item[1])
    total = float(len(pixels))
    out = []
    for rgb, count in merged:
        share = count / total
        if share < min_share:
            continue
        out.append({"hex": "#{:02x}{:02x}{:02x}".format(*rgb), "share": round(share, 3)})
        if len(out) >= max_colors:
            break
    return out


def _relative(rgb: tuple[int, int, int]) -> float:
    def channel(v: int) -> float:
        c = v / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (channel(v) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _ratio(lum: float, ground: float) -> float:
    high, low = max(lum, ground), min(lum, ground)
    return (high + 0.05) / (low + 0.05)


# A logo reads on a ground when nearly all of it can be seen there (1.5:1, enough for a
# soft shape) and its key parts can be read (3:1, the non-text contrast of WCAG): a pink
# wordmark with pale beige shapes reads on white, though the beige alone would not.
VISIBLE_RATIO, LEGIBLE_RATIO = 1.5, 3.0
# A wordmark's strokes are thin: its legible part is often a fifth of the logo's pixels.
VISIBLE_SHARE, LEGIBLE_SHARE = 0.9, 0.2


def _logo_on(weighted: list[tuple[float, float]]) -> str:
    """light | dark | any from (luminance, weight) pairs of the logo's own colours."""
    total = sum(weight for _lum, weight in weighted) or 1.0

    def reads(ground: float) -> tuple[bool, float]:
        visible = sum(w for lum, w in weighted if _ratio(lum, ground) >= VISIBLE_RATIO) / total
        legible = sum(w for lum, w in weighted if _ratio(lum, ground) >= LEGIBLE_RATIO) / total
        return visible >= VISIBLE_SHARE and legible >= LEGIBLE_SHARE, legible

    on_light, light_legible = reads(1.0)
    on_dark, dark_legible = reads(0.0)
    if on_light and on_dark:
        return "any"
    if on_light or on_dark:
        return "light" if on_light else "dark"
    return "light" if light_legible >= dark_legible else "dark"


def analyse(image) -> dict:
    """What the logo's own pixels say: {has_alpha, colors, logo_on, ground}."""
    small = image.copy()
    small.thumbnail((200, 200))
    raw = small.tobytes()
    pixels = [(raw[i], raw[i + 1], raw[i + 2], raw[i + 3]) for i in range(0, len(raw), 4)]
    total = len(pixels) or 1
    transparent = sum(1 for p in pixels if p[3] < 128)
    has_alpha = transparent / total >= 0.05
    opaque = [p[:3] for p in pixels if p[3] >= 128]
    ground = None
    mark = opaque
    if not has_alpha and opaque:
        w, h = small.size
        border = [pixels[i][:3] for i in range(len(pixels))
                  if (i % w) in (0, w - 1) or (i // w) in (0, h - 1)]
        buckets: dict[tuple[int, int, int], int] = {}
        for rgb in border:
            key = (rgb[0] // 16, rgb[1] // 16, rgb[2] // 16)
            buckets[key] = buckets.get(key, 0) + 1
        top = max(buckets.items(), key=lambda kv: kv[1])[0] if buckets else None
        if top is not None:
            members = [rgb for rgb in border if (rgb[0] // 16, rgb[1] // 16, rgb[2] // 16) == top]
            ground = tuple(round(sum(c[i] for c in members) / len(members)) for i in range(3))
            off_ground = [rgb for rgb in opaque if color_tools.color_distance(rgb, ground) > 45]
            if len(off_ground) >= 0.02 * len(opaque):
                mark = off_ground
    # A near-white ground around an opaque logo is background, never a brand colour.
    colors = _quantise(mark)
    if ground is None:
        logo_on = _logo_on([(_relative(rgb), 1.0) for rgb in mark])
    else:
        lum = _relative(ground)
        logo_on = "light" if lum >= 0.7 else ("dark" if lum <= 0.06 else "any")
    return {
        "has_alpha": has_alpha,
        "colors": colors,
        "logo_on": logo_on,
        "ground": "#{:02x}{:02x}{:02x}".format(*ground) if ground else "",
    }


def rasterise_svg(data: bytes) -> tuple[tuple[bytes, dict] | None, str]:
    """(`normalise` of the SVG rendered to PNG, "") or (None, why it could not be)."""
    try:
        png = svg_logo.rasterise(data)
    except svg_logo.SvgRejected as exc:
        return None, exc.reason
    except Exception:  # the logo is evidence, never a reason to fail the refresh
        log.exception("brand logo: SVG rasterisation failed")
        return None, "render_failed"
    normalised = normalise(png, "image/png")
    return normalised, "" if normalised else "blank"


def _svg_reading(data: bytes) -> dict:
    colors = color_tools.svg_colors(data.decode("utf-8", "ignore"), max_colors=5)
    weighted = [(_relative(color_tools.hex_to_rgb(c["hex"]) or (0, 0, 0)), float(c.get("share") or 1)) for c in colors]
    return {"colors": colors, "logo_on": _logo_on(weighted) if weighted else "any"}


# --- storage ------------------------------------------------------------------------------


def load(business) -> dict | None:
    value = loads(getattr(business, "brand_logo_json", "") or "", None)
    return value if isinstance(value, dict) else None


def usable(record: dict | None) -> bool:
    """True when a same-origin copy of the logo exists (a file check, nothing is read)."""
    if not record or record.get("status") != "ok" or not record.get("public_url"):
        return False
    from pathlib import Path

    from app.services.images import media_root

    parts = str(record["public_url"]).removeprefix("/backend/media/").split("/")
    if len(parts) != 2 or not parts[0].isdigit():
        return False
    return (media_root() / parts[0] / Path(parts[1]).name).is_file()


def logo_url_of(business) -> str:
    stored = loads(getattr(business, "scraped_profile_json", "") or "", {}) or {}
    brand = stored.get("brand_language") or {}
    raw = stored.get("raw") or {}
    return str(brand.get("logo_url") or raw.get("logo_url") or "").strip()


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _recent(record: dict) -> bool:
    try:
        checked = datetime.fromisoformat(str(record.get("checked_at")))
    except (TypeError, ValueError):
        return False
    return (datetime.now(timezone.utc) - checked).total_seconds() < RETRY_AFTER_SECONDS


def store_png(business_id: int, png: bytes) -> tuple[str, str]:
    """(filename, public url) of the normalised logo in the business's media folder."""
    from app.services.assets import business_folder
    from app.services.images import image_public_url

    filename = f"{FILE_PREFIX}{hashlib.sha1(png).hexdigest()[:20]}.png"
    (business_folder(business_id) / filename).write_bytes(png)
    return filename, image_public_url(business_id, filename)


def _drop_old_file(business_id: int, previous: dict | None, keep: str) -> None:
    name = str((previous or {}).get("filename") or "")
    if name and name != keep and name.startswith(FILE_PREFIX):
        from app.services.assets import delete_asset_file

        delete_asset_file(business_id, name)


def ensure(business, *, force: bool = False) -> dict | None:
    """Make sure the business's logo copy matches its `logo_url`; returns the record.

    Downloads only when the URL changed, the file is missing, or an earlier failure is old
    enough to try again. Writes `business.brand_logo_json` (the caller commits).
    """
    url = logo_url_of(business)
    current = load(business)
    if not url:
        if current is not None:
            _drop_old_file(business.id, current, keep="")
            business.brand_logo_json = ""
        return None
    if current and current.get("source_url") == url and not force:
        if current.get("status") == "ok" and usable(current):
            return current
        # An `unsupported` record without a `reason` predates SVG rasterisation: try it now.
        if (current.get("status") == "failed" or (current.get("status") == "unsupported" and current.get("reason"))) \
                and _recent(current):
            return current
    if not get_settings().brand_logo_copy:
        return current
    fetched = fetch(url)
    svg = bool(fetched) and fetched.get("mime") == "image/svg+xml"
    if fetched is None:
        normalised, record = None, {"source_url": url, "status": "failed", "checked_at": _now()}
    elif svg:
        normalised, reason = rasterise_svg(fetched["bytes"])
        record = {"source_url": url, "status": "unsupported", "format": "svg", "reason": reason,
                  "checked_at": _now(), **(_svg_reading(fetched["bytes"]) if normalised is None else {})}
    else:
        normalised = normalise(fetched["bytes"], fetched.get("mime") or "")
        record = {"source_url": url, "status": "failed", "checked_at": _now()}
    if normalised is not None:
        png, reading = normalised
        filename, public = store_png(business.id, png)
        size = color_tools.image_size(png) or (0, 0)
        record = {
            "source_url": url,
            "status": "ok",
            "public_url": public,
            "filename": filename,
            "width": size[0],
            "height": size[1],
            "has_alpha": reading["has_alpha"],
            "logo_on": reading["logo_on"],
            "colors": reading["colors"],
            "ground": reading["ground"],
            **({"format": "svg"} if svg else {}),
            "checked_at": _now(),
        }
        _drop_old_file(business.id, current, keep=filename)
    if record["status"] != "ok":
        log.info("brand logo: no copy for business %s (%s %s)", business.id, record["status"],
                 record.get("reason") or "")
    business.brand_logo_json = dumps(record)
    return record
