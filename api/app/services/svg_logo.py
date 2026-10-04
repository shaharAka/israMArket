"""A customer's SVG logo, made safe as a PNG (docs/design-dna.md, Revision 1, rule 6).

An SVG served from our origin can carry script, so we never serve one: `rasterise` turns it
into PNG bytes, and services/brand_logo.py treats those exactly like a PNG logo (trim,
1024 px, `logo_on`, colours, the same-origin copy).

1. **Read.** At most 512 KB. A gzipped `.svgz` is unpacked to at most the same 512 KB, so a
   gzip bomb stops at the cap. A plain `<!DOCTYPE svg PUBLIC "…" "…">` line (Illustrator
   writes one) is dropped; any other DTD, every entity and every external reference is
   refused by defusedxml (billion laughs, XXE).
2. **Sanitise by allowlist.** Only SVG drawing elements stay. `script`, `foreignObject`,
   animation, `metadata` and every element of another namespace go with their content.
   Event handlers (`on*`), `xml:base` and attributes of other namespaces go. An `href` stays
   only as a same-document `#fragment`, or on `image`/`feImage` as an inline
   `data:image/(png|jpeg|webp);base64` that Pillow opens as that format within a pixel cap.
   `url(…)` stays only as `url(#id)`, in attributes and in CSS. `@import` and `@font-face`
   leave the CSS, and CSS with escapes is dropped.
3. **Limits.** Elements (5,000), nesting depth (40), elements drawn once every `use` and
   `url(#…)` reference is expanded (20,000: a `use` bomb), a sane width/height/viewBox
   (positive, finite, at most 1,000,000 units, aspect at most 25:1).
4. **Render.** resvg (resvg-py): it has no script engine and no network client. It can read
   a local file named by an `href`, and none survives step 2. It runs in a child process
   (services/svg_render_child.py) with an empty environment, an empty working directory,
   CPU, memory and file-size limits, a fixed 2048 px box (so the pixel count is capped,
   whatever the SVG declares), killed at a 10 s wall-clock timeout, at most two at once.

`rasterise` returns PNG bytes or raises `SvgRejected(reason)`; it never touches the network.
"""

from __future__ import annotations

import base64
import io
import math
import re
import subprocess
import sys
import tempfile
import threading
import zlib
from dataclasses import dataclass
from pathlib import Path

MAX_SVG_BYTES = 512 * 1024
MAX_ELEMENTS = 5_000
MAX_DEPTH = 40
MAX_DRAWN = 20_000
MAX_UNITS = 1_000_000.0
MAX_ASPECT = 25.0
MAX_EMBEDDED_PIXELS = 16_000_000
RENDER_BOX = 2048
RENDER_TIMEOUT_SECONDS = 10.0
CHILD_MEMORY_BYTES = 1 << 30
MAX_PNG_BYTES = 32 * 1024 * 1024
# Two renders at once at most; a third waits this long, then gives up (the logo is retried later).
_RENDER_SLOTS = threading.BoundedSemaphore(2)
SLOT_WAIT_SECONDS = 30.0
_CHILD = Path(__file__).with_name("svg_render_child.py")

SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
XML_NS = "http://www.w3.org/XML/1998/namespace"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"

# What resvg draws, and nothing that only animates, scripts, links out or embeds HTML.
# `title`, `desc` and `metadata` are not drawn, so they go too.
ALLOWED_ELEMENTS = frozenset({
    "svg", "g", "defs", "symbol", "use", "switch", "a",
    "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
    "text", "tspan", "textPath", "image", "style",
    "linearGradient", "radialGradient", "stop", "pattern", "clipPath", "mask", "marker",
    "filter", "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix",
    "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feDropShadow", "feFlood",
    "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feImage", "feMerge",
    "feMergeNode", "feMorphology", "feOffset", "fePointLight", "feSpecularLighting",
    "feSpotLight", "feTile", "feTurbulence",
})
TEXT_ELEMENTS = frozenset({"text", "tspan", "textPath"})
# Elements whose href points at another element that is drawn through them.
_REFERENCING = frozenset({"use", "textPath", "linearGradient", "radialGradient", "pattern", "filter", "feImage"})
# Elements that draw nothing without their href.
_NEEDS_HREF = frozenset({"use", "image"})
_DATA_FORMATS = {"png": "PNG", "jpeg": "JPEG", "jpg": "JPEG", "webp": "WEBP"}

_PLAIN_DOCTYPE_RE = re.compile(
    rb'<!DOCTYPE\s+svg(?:\s+PUBLIC\s+"[^"<>\[\]]*"\s+"[^"<>\[\]]*"|\s+SYSTEM\s+"[^"<>\[\]]*")?\s*>', re.I
)
_FRAGMENT_RE = re.compile(r"#[^\s'\"()<>\\#]{1,256}")
_DATA_IMAGE_RE = re.compile(r"data:image/(png|jpe?g|webp);base64,(.*)", re.I | re.S)
_URL_RE = re.compile(r"url\(\s*(?:'([^']*)'|\"([^\"]*)\"|([^)'\"]*))\s*\)", re.I)
_KEPT_URL_RE = re.compile(r"url\(#[^)]*\)", re.I)
_ANY_URL_RE = re.compile(r"url\s*\(", re.I)
_CSS_COMMENT_RE = re.compile(r"/\*.*?\*/", re.S)
_CSS_IMPORT_RE = re.compile(r"@import[^;]*;?", re.I)
_CSS_FONT_FACE_RE = re.compile(r"@font-face\s*\{[^}]*\}?", re.I)
_LENGTH_RE = re.compile(r"\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(px|pt|pc|mm|cm|in|em|ex|%)?\s*")
_UNIT_PX = {None: 1.0, "px": 1.0, "pt": 96 / 72, "pc": 16.0, "mm": 96 / 25.4, "cm": 96 / 2.54, "in": 96.0,
            "em": 16.0, "ex": 8.0}


class SvgRejected(ValueError):
    """The SVG cannot become a logo; `reason` is a short code kept on the logo record."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


@dataclass
class _Node:
    tag: str
    attrs: dict[str, str]
    text: str = ""
    tail: str = ""
    children: list["_Node"] | None = None


@dataclass
class Sanitised:
    svg: str  # well-formed SVG text, safe to hand to the renderer
    has_text: bool  # draws text, so the renderer needs the system fonts
    elements: int


# --- 1. read --------------------------------------------------------------------------------


def _unpack(data: bytes) -> bytes:
    if len(data) > MAX_SVG_BYTES:
        raise SvgRejected("too_large")
    if data[:2] == b"\x1f\x8b":  # .svgz
        inflater = zlib.decompressobj(16 + zlib.MAX_WBITS)
        try:
            data = inflater.decompress(data, MAX_SVG_BYTES + 1)
        except zlib.error:
            raise SvgRejected("not_svg") from None
        if len(data) > MAX_SVG_BYTES or inflater.unconsumed_tail:
            raise SvgRejected("too_large")
    return data


def _parse(data: bytes):
    from xml.etree.ElementTree import ParseError

    from defusedxml import DefusedXmlException, DTDForbidden, EntitiesForbidden
    from defusedxml.ElementTree import fromstring

    data = _PLAIN_DOCTYPE_RE.sub(b"", data, count=1)
    try:
        return fromstring(data, forbid_dtd=True, forbid_entities=True, forbid_external=True)
    except DTDForbidden:
        raise SvgRejected("dtd") from None
    except EntitiesForbidden:
        raise SvgRejected("entities") from None
    except DefusedXmlException:
        raise SvgRejected("unsafe_xml") from None
    except (ParseError, ValueError, UnicodeError):
        raise SvgRejected("not_svg") from None


def _split(name: str) -> tuple[str, str]:
    if name.startswith("{"):
        ns, _, local = name[1:].partition("}")
        return ns, local
    return "", name


def _check_shape(root) -> int:
    """Element count and nesting depth of the parsed tree, without recursion."""
    count = 0
    stack = [(root, 1)]
    while stack:
        elem, depth = stack.pop()
        count += 1
        if count > MAX_ELEMENTS:
            raise SvgRejected("too_many_elements")
        if depth > MAX_DEPTH:
            raise SvgRejected("too_deep")
        stack.extend((child, depth + 1) for child in elem)
    return count


# --- 2. sanitise -----------------------------------------------------------------------------


def _clean_urls(value: str) -> str | None:
    """`value` with every `url(…)` other than `url(#id)` replaced by `none`; None if one is left."""

    def keep(match: re.Match) -> str:
        target = (match.group(1) or match.group(2) or match.group(3) or "").strip()
        return f"url({target})" if _FRAGMENT_RE.fullmatch(target) else "none"

    cleaned = _URL_RE.sub(keep, value)
    if _ANY_URL_RE.search(_KEPT_URL_RE.sub("", cleaned)):
        return None
    return cleaned


def _clean_css(text: str) -> str:
    # Escapes can spell `url` or `@import` without the letters; a logo's CSS never needs them.
    if "\\" in text or "<" in text:
        return ""
    text = _CSS_COMMENT_RE.sub("", text)
    text = _CSS_IMPORT_RE.sub("", text)
    text = _CSS_FONT_FACE_RE.sub("", text)
    if "@import" in text.lower() or "@font-face" in text.lower():
        return ""
    return _clean_urls(text) or ""


def _embedded_image(value: str) -> str | None:
    """A verified `data:image/(png|jpeg|webp);base64,…` URI, re-written cleanly, or None."""
    match = _DATA_IMAGE_RE.fullmatch(value)
    if not match:
        return None
    declared = _DATA_FORMATS[match.group(1).lower()]
    payload = re.sub(r"\s+", "", match.group(2))
    try:
        raw = base64.b64decode(payload, validate=True)
        from PIL import Image

        # Opening reads the header only; the pixels are decoded by the renderer, in the child.
        with Image.open(io.BytesIO(raw)) as image:
            width, height = image.size
            actual = image.format
    except Exception:  # bad base64 (binascii.Error), not an image, a decompression bomb…
        return None
    if actual != declared or width < 1 or height < 1 or width * height > MAX_EMBEDDED_PIXELS:
        return None
    return f"data:image/{actual.lower()};base64,{payload}"


def _clean_href(value: str, tag: str) -> str | None:
    value = value.strip()
    if tag == "a":
        return None  # a link means nothing in a PNG
    if _FRAGMENT_RE.fullmatch(value):
        return value
    if tag in {"image", "feImage"}:
        return _embedded_image(value)
    return None


def _clean_attrs(elem, tag: str) -> dict[str, str]:
    attrs: dict[str, str] = {}
    href_plain = href_xlink = None
    for name, value in elem.attrib.items():
        ns, local = _split(name)
        if local == "href" and ns in {"", XLINK_NS}:
            cleaned = _clean_href(value, tag)
            if ns:
                href_xlink = cleaned
            else:
                href_plain = cleaned
            continue
        if ns == XML_NS and local == "space":
            if value in {"default", "preserve"}:
                attrs["xml:space"] = value
            continue
        if ns or local.lower().startswith("on"):
            continue  # other namespaces, xml:base, event handlers
        cleaned = _clean_css(value) if local == "style" else _clean_urls(value)
        if cleaned is not None:
            attrs[local] = cleaned
    href = href_plain or href_xlink  # SVG 2: a plain href wins
    if href:
        attrs["xlink:href"] = href
    return attrs


def _sanitise_tree(root) -> tuple[_Node, bool]:
    clean_root = _Node("svg", _clean_attrs(root, "svg"), root.text or "", "", [])
    has_text = False
    # Children in document order: pushed reversed, so a dropped element's tail can join the
    # text of what precedes it (it matters inside <text>).
    stack = [(child, clean_root) for child in reversed(list(root))]
    while stack:
        elem, parent = stack.pop()
        ns, tag = _split(elem.tag)
        keep = ns in {SVG_NS, ""} and tag in ALLOWED_ELEMENTS
        attrs = _clean_attrs(elem, tag) if keep else {}
        if keep and tag in _NEEDS_HREF and "xlink:href" not in attrs:
            keep = False
        if keep and tag == "style" and attrs.get("type", "text/css").strip().lower() != "text/css":
            keep = False
        if not keep:
            tail = elem.tail or ""
            if tail:
                if parent.children:
                    parent.children[-1].tail += tail
                else:
                    parent.text += tail
            continue
        text = elem.text or ""
        if tag == "style":
            text = _clean_css(text)
        node = _Node(tag, attrs, text, elem.tail or "", [])
        parent.children.append(node)
        has_text = has_text or tag in TEXT_ELEMENTS
        if tag != "style":
            stack.extend((child, node) for child in reversed(list(elem)))
    return clean_root, has_text


# --- 3. limits ----------------------------------------------------------------------------------


def _references(node: _Node, ids: dict[str, _Node]) -> list[_Node]:
    targets: list[_Node] = []
    href = node.attrs.get("xlink:href", "")
    if href.startswith("#") and node.tag in _REFERENCING and href[1:] in ids:
        targets.append(ids[href[1:]])
    for value in node.attrs.values():
        for match in _KEPT_URL_RE.finditer(value):
            target = ids.get(match.group(0)[5:-1])
            if target is not None:
                targets.append(target)
    return targets


def _drawn_count(root: _Node) -> int:
    """Elements drawn once every `use` and `url(#…)` reference is expanded, without recursion.

    Raises for a reference cycle or more than MAX_DRAWN (a `use` bomb: ten uses of a group of
    ten uses of … is 10^n elements from a few hundred bytes)."""
    ids: dict[str, _Node] = {}
    stack = [root]
    while stack:
        node = stack.pop()
        ident = node.attrs.get("id")
        if ident and ident not in ids:
            ids[ident] = node
        stack.extend(node.children or [])
    cost: dict[int, int] = {}
    active: set[int] = set()
    work: list[tuple[_Node, bool]] = [(root, False)]
    while work:
        node, done = work.pop()
        key = id(node)
        deps = list(node.children or []) + _references(node, ids)
        if done:
            active.discard(key)
            total = 1 + sum(cost[id(dep)] for dep in deps)
            if total > MAX_DRAWN:
                raise SvgRejected("too_many_drawn")
            cost[key] = total
            continue
        if key in cost:
            continue
        active.add(key)
        work.append((node, True))
        for dep in deps:
            if id(dep) in active:
                raise SvgRejected("reference_cycle")
            if id(dep) not in cost:
                work.append((dep, False))
    return cost[id(root)]


def _length(value: str | None) -> float | None:
    """A width/height in px; None when absent, relative (%) or `auto`."""
    if value is None or value.strip() in {"", "auto"}:
        return None
    match = _LENGTH_RE.fullmatch(value)
    if not match:
        raise SvgRejected("bad_size")
    if match.group(2) == "%":
        return None
    number = float(match.group(1)) * _UNIT_PX[match.group(2)]
    if not math.isfinite(number) or number <= 0 or number > MAX_UNITS:
        raise SvgRejected("bad_size")
    return number


def _check_size(root: _Node) -> None:
    width, height = _length(root.attrs.get("width")), _length(root.attrs.get("height"))
    shape = (width, height) if width and height else None
    box = root.attrs.get("viewBox")
    if box is not None:
        try:
            numbers = [float(part) for part in re.split(r"[\s,]+", box.strip()) if part]
        except ValueError:
            raise SvgRejected("bad_size") from None
        if len(numbers) != 4 or not all(math.isfinite(n) and abs(n) <= MAX_UNITS for n in numbers):
            raise SvgRejected("bad_size")
        if numbers[2] <= 0 or numbers[3] <= 0:
            raise SvgRejected("bad_size")
        shape = (numbers[2], numbers[3])
    if shape and max(shape[0] / shape[1], shape[1] / shape[0]) > MAX_ASPECT:
        raise SvgRejected("bad_size")


# --- serialise ------------------------------------------------------------------------------------


def _serialise(root: _Node) -> str:
    from xml.sax.saxutils import escape, quoteattr

    out: list[str] = []
    stack: list[tuple[_Node, bool]] = [(root, False)]
    while stack:
        node, closing = stack.pop()
        if closing:
            out.append(f"</{node.tag}>{escape(node.tail)}")
            continue
        attrs = dict(node.attrs)
        if node is root:
            attrs = {"xmlns": SVG_NS, "xmlns:xlink": XLINK_NS, **attrs}
        rendered = "".join(f" {name}={quoteattr(value)}" for name, value in attrs.items())
        out.append(f"<{node.tag}{rendered}>{escape(node.text)}")
        stack.append((node, True))
        stack.extend((child, False) for child in reversed(node.children or []))
    return "".join(out)


def sanitise(data: bytes) -> Sanitised:
    """Steps 1–3: safe SVG text for the renderer, or SvgRejected."""
    root = _parse(_unpack(data))
    ns, tag = _split(root.tag)
    if tag != "svg" or ns not in {SVG_NS, ""}:
        raise SvgRejected("not_svg")
    elements = _check_shape(root)
    clean, has_text = _sanitise_tree(root)
    _check_size(clean)
    _drawn_count(clean)
    return Sanitised(svg=_serialise(clean), has_text=has_text, elements=elements)


# --- 4. render ------------------------------------------------------------------------------------


def render(svg: str, *, fonts: bool, timeout: float | None = None) -> bytes:
    """PNG bytes of sanitised SVG text, rendered in a child process; SvgRejected otherwise."""
    timeout = RENDER_TIMEOUT_SECONDS if timeout is None else timeout
    if not sys.executable:
        raise SvgRejected("renderer_missing")
    if not _RENDER_SLOTS.acquire(timeout=SLOT_WAIT_SECONDS):
        raise SvgRejected("busy")
    try:
        with tempfile.TemporaryDirectory(prefix="svg-render-") as empty:
            # -I: no environment variables, no user site, not the app's folder; -B: no .pyc writes.
            command = [sys.executable, "-I", "-B", str(_CHILD), str(RENDER_BOX), "1" if fonts else "0",
                       str(math.ceil(timeout) + 1), str(CHILD_MEMORY_BYTES)]
            try:
                done = subprocess.run(command, input=svg.encode("utf-8"), capture_output=True, timeout=timeout,
                                      env={}, cwd=empty, check=False)
            except subprocess.TimeoutExpired:  # run() has killed the child
                raise SvgRejected("timeout") from None
            except OSError:
                raise SvgRejected("render_failed") from None
    finally:
        _RENDER_SLOTS.release()
    if done.returncode == 3:
        raise SvgRejected("renderer_missing")
    png = done.stdout
    if done.returncode != 0 or not png.startswith(PNG_MAGIC) or len(png) > MAX_PNG_BYTES:
        raise SvgRejected("render_failed")
    return png


def rasterise(data: bytes, *, timeout: float | None = None) -> bytes:
    """PNG bytes of an SVG logo (at most 2048 px on the long side), or SvgRejected."""
    clean = sanitise(data)
    return render(clean.svg, fonts=clean.has_text, timeout=timeout)
