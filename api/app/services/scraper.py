import json
import re
import struct
import time
from collections import Counter
from dataclasses import dataclass
from urllib.parse import unquote, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from app.services import colors as color_evidence
from app.services.netguard import UnsafeUrlError, assert_public_url, safe_get
from app.services.tracking_detect import detect_tags


class ScrapeBudgetExceeded(RuntimeError):
    """The scrape ran out of its wall-clock budget (only raised under ScrapeLimits)."""


USER_AGENT = "IsraMarketBot/1.0 (+https://isramarket.local; marketing research for the site owner)"
MAX_CHARS = 14000
HEX_RE = re.compile(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b")
RGB_RE = re.compile(r"rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})")
FONT_RE = re.compile(r"font-family\s*:\s*([^;}{]+)", re.I)
GENERIC_FONTS = {
    "sans-serif",
    "serif",
    "monospace",
    "cursive",
    "fantasy",
    "system-ui",
    "ui-sans-serif",
    "ui-serif",
    "arial",
    "helvetica",
    "times",
    "times new roman",
    "georgia",
    "verdana",
    "tahoma",
    "inherit",
    "initial",
}
SKIP_CSS = re.compile(
    r"tailwindcss|bootstrap|font-awesome|fontawesome|normalize\.css|modern-normalize",
    re.I,
)
VAR_RE = re.compile(r"--([a-zA-Z0-9_-]+)\s*:\s*([^;]+)")
BRAND_VAR = re.compile(r"brand|primary|accent|theme|main|bg|background|ink|text|color|cta", re.I)
# CMS boilerplate that would otherwise masquerade as the brand palette. WordPress
# ships `--wp--preset--color--vivid-red: #cf2e2e` & co. in an inline <style> on
# essentially every block theme; because the name contains "color" it matched
# BRAND_VAR and got 4x weight, so unrelated sites all reported the same defaults.
SKIP_VAR = re.compile(
    r"wp--preset|wp--style|wp--custom|wp-block|gutenberg|--e-global-typography",
    re.I,
)
# The WordPress core palette by value, as a second line of defence for themes that
# inline it under non-standard variable names.
WP_DEFAULT_COLORS = {
    "#cf2e2e", "#ff6900", "#fcb900", "#7bdcb5", "#00d084", "#8ed1fc",
    "#0693e3", "#abb8c3", "#eb144c", "#f78da7", "#9900ef", "#ffffff", "#000000",
}


def _normalize_url(url: str) -> str:
    raw = url.strip()
    # Reject an explicit foreign scheme instead of mangling it into a hostname.
    if "://" in raw and not raw.startswith(("http://", "https://")):
        raise ValueError("אפשר לקרוא רק כתובות אתר רגילות (שמתחילות ב-http או https).")
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"כתובת לא תקינה: {url}")
    return raw


def _to_hex(r: int, g: int, b: int) -> str:
    return f"#{r:02x}{g:02x}{b:02x}"


def _expand_hex(value: str) -> str:
    raw = value.lower()
    if len(raw) == 4:
        return f"#{raw[1]*2}{raw[2]*2}{raw[3]*2}"
    return raw


def _rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _keep_color(hex_color: str) -> bool:
    r, g, b = _rgb(hex_color)
    mx, mn = max(r, g, b), min(r, g, b)
    if mx < 28 and mn < 28:
        return False
    if mn > 242:
        return False
    if mx - mn < 12 and 70 < r < 210:
        return False
    return True


def _colors_in(value: str) -> list[str]:
    found = [_expand_hex(match.group(0)) for match in HEX_RE.finditer(value)]
    found.extend(
        _to_hex(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        for match in RGB_RE.finditer(value)
    )
    return found


def _extract_colors(
    html: str, soup: BeautifulSoup, stylesheets: list[str], platform: str = ""
) -> list[str]:
    found: list[str] = []
    theme = soup.find("meta", attrs={"name": "theme-color"})
    if theme and theme.get("content"):
        content = str(theme["content"]).strip()
        if HEX_RE.fullmatch(content):
            found.extend([_expand_hex(content)] * 4)
    css_blobs = [tag.get_text(" ", strip=True) for tag in soup.find_all("style")]
    css_blobs.append(html)
    css_blobs.extend(stylesheets)
    for blob in css_blobs:
        for match in VAR_RE.finditer(blob):
            name = match.group(1)
            # CMS preset palettes are not the brand's colours.
            if SKIP_VAR.search(name):
                continue
            weight = 4 if BRAND_VAR.search(name) else 1
            for color in _colors_in(match.group(2)):
                found.extend([color] * weight)
        if len(blob) < 220_000:
            # Preset palettes are also inlined as raw values. Drop the known CMS
            # constants here, but keep them if a brand variable vouched for them above.
            found.extend(color for color in _colors_in(blob) if color not in WP_DEFAULT_COLORS)
    # A website builder's own theme is not the brand (see services/colors.py). These are
    # dropped even when a variable "vouched" for them: on an uncustomised Wix site the
    # vouching variable is the builder's.
    builder = color_evidence.platform_defaults(platform)
    ranked = [
        color
        for color, _ in Counter(found).most_common(32)
        if _keep_color(color) and color not in builder
    ]
    unique: list[str] = []
    for color in ranked:
        if color not in unique:
            unique.append(color)
    return unique[:8]


def _fonts_from_text(blob: str) -> list[str]:
    names: list[str] = []
    for match in FONT_RE.finditer(blob):
        for part in match.group(1).split(","):
            name = part.replace("!important", "").strip().strip("'\"")
            if (
                name
                and name.lower() not in GENERIC_FONTS
                and not color_evidence.is_platform_font(name)
                # `var(--wix-font-…)` and escaped CJK fallbacks are not font names.
                and "var(" not in name
                and "\\" not in name
                and ")" not in name
            ):
                names.append(name)
    return names


def _extract_fonts(soup: BeautifulSoup, stylesheets: list[str]) -> list[str]:
    names: list[str] = []
    for link in soup.find_all("link"):
        href = str(link.get("href") or "")
        if "fonts.googleapis.com" in href or "fonts.gstatic.com" in href:
            family = re.findall(r"family=([^&:]+)", href)
            names.extend(item.replace("+", " ") for item in family)
    for style in soup.find_all("style"):
        names.extend(_fonts_from_text(style.get_text()))
    for sheet in stylesheets:
        names.extend(_fonts_from_text(sheet))
    unique: list[str] = []
    for name in names:
        if name not in unique:
            unique.append(name)
    return unique[:6]


def _stylesheet_urls(base: str, soup: BeautifulSoup) -> list[str]:
    parsed_base = urlparse(base)
    ranked: list[tuple[int, str]] = []
    for link in soup.find_all("link"):
        rel = " ".join(link.get("rel") or []).lower()
        as_attr = str(link.get("as") or "").lower()
        if "stylesheet" not in rel and as_attr != "style":
            continue
        href = _abs(base, link.get("href"))
        if not href or SKIP_CSS.search(href):
            continue
        host = urlparse(href).netloc
        same_host = 0 if host == parsed_base.netloc else 1
        ranked.append((same_host, href))
    ranked.sort()
    unique: list[str] = []
    for _, url in ranked:
        if url not in unique:
            unique.append(url)
    return unique[:5]


def _fetch_stylesheets(
    client: httpx.Client, urls: list[str], fetch=None, max_sheets: int = 4
) -> list[str]:
    fetch = fetch or safe_get
    sheets: list[str] = []
    for url in urls:
        try:
            response = fetch(client, url, timeout=12.0)
        except ScrapeBudgetExceeded:
            break
        except (httpx.HTTPError, UnsafeUrlError):
            continue
        if response.status_code >= 400:
            continue
        content_type = response.headers.get("content-type", "").lower()
        if "css" not in content_type and "text/plain" not in content_type and not url.lower().split("?")[0].endswith(".css"):
            continue
        text = response.text[:400_000]
        if text.strip():
            sheets.append(text)
        if len(sheets) >= max_sheets:
            break
    return sheets


def _abs(base: str, src: str | None) -> str | None:
    if not src:
        return None
    cleaned = src.strip()
    if cleaned.startswith("data:"):
        return None
    return urljoin(base, cleaned)


# Any absolute image URL in the document — including inside <script> JSON, where
# JS-rendered sites (Wix, most Shopify themes, SPAs) keep their real product imagery.
_IMG_URL_RE = re.compile(
    r"https?://[^\s\"'\\)<>]+?\.(?:jpe?g|png|webp|avif)(?:[?#][^\s\"'\\)<>]*)?",
    re.I,
)
_LOGO_HINT_RE = re.compile(r"logo|icon|favicon|sprite|badge|placeholder|avatar", re.I)
# Wix-style transform segments let one asset appear at many sizes; the widest wins.
_SIZE_RE = re.compile(r"[?&,/]w_(\d+)", re.I)
_TRANSFORM_SPLIT_RE = re.compile(r"/v1/")
# `/v1/fit/w_480,h_480/...` — ask for a card-sized variant instead of a thumbnail.
_CDN_SIZE_RE = re.compile(r"(/v1/(?:fit|fill)/)w_\d+(?:,h_\d+)?", re.I)
_TARGET_PHOTO_WIDTH = 1200


def _larger_variant(url: str) -> str | None:
    """Rewrite a CDN thumbnail URL to a larger size, or None if it has no size part."""
    def swap(match: re.Match) -> str:
        return f"{match.group(1)}w_{_TARGET_PHOTO_WIDTH},h_{_TARGET_PHOTO_WIDTH}"

    if not _CDN_SIZE_RE.search(url):
        return None
    return _CDN_SIZE_RE.sub(swap, url, count=1)


def _asset_key(url: str) -> str:
    """Identity of the underlying asset, ignoring CDN resize transforms and query."""
    return _TRANSFORM_SPLIT_RE.split(url.split("?")[0], 1)[0]


def _image_alts(base: str, soup: BeautifulSoup) -> dict[str, str]:
    """The alt text the site gives each <img>, keyed by asset (CDN sizes ignored).
    Lets a post find the site photo of its subject (services/photo_choice.py)."""
    alts: dict[str, str] = {}
    for img in soup.find_all("img"):
        alt = " ".join(str(img.get("alt") or "").split())
        url = _abs(base, img.get("src") or img.get("data-src") or img.get("data-lazy-src"))
        if alt and url and not _LOGO_HINT_RE.search(url):
            alts.setdefault(_asset_key(url), alt[:160])
    return dict(list(alts.items())[:60])


def image_alt_for(alts: dict | None, url: str) -> str:
    """The alt text recorded for a photo's URL (or one of its CDN size variants)."""
    if not alts or not url:
        return ""
    return str(alts.get(_asset_key(url)) or "")


def _variant_width(url: str) -> int:
    match = _SIZE_RE.search(url)
    return int(match.group(1)) if match else 0


def _image_candidates(
    base: str, soup: BeautifulSoup, html: str = "", exclude: set[str] | None = None
) -> list[str]:
    """Collect candidate images, best-first.

    Two things this has to get right on a real store:

    - **Script-embedded URLs.** The old version only looked at <img> tags and meta
      tags, so on a Wix site it saw 3 usable images out of 91 and picked the logo.
    - **Ordering.** It used to `insert(0, ...)` anything whose alt/class mentioned
      "logo", then download only the first three — i.e. it preferentially fetched the
      logo. Product imagery matters here; logos are still collected, but last, since
      they remain useful for brand colours.

    `exclude` holds asset keys already claimed by the logo (see `logo_candidates`), which
    has its own download slot and must never take a photo slot.
    """
    best: dict[str, tuple[int, str]] = {}
    logos: list[str] = []
    excluded = exclude or set()

    def offer(raw: str | None) -> None:
        url = _abs(base, raw)
        if not url:
            return
        if _LOGO_HINT_RE.search(url):
            logos.append(url)
            return
        key = _asset_key(url)
        if key in excluded:
            return
        width = _variant_width(url)
        if key not in best or width > best[key][0]:
            best[key] = (width, url)

    for meta_attr in ({"property": "og:image"}, {"name": "og:image"}, {"name": "twitter:image"}):
        node = soup.find("meta", attrs=meta_attr)
        if node:
            offer(node.get("content"))

    for img in soup.find_all("img"):
        offer(img.get("src") or img.get("data-src") or img.get("data-lazy-src"))

    # Everything else in the document, scripts included.
    for match in _IMG_URL_RE.finditer(html or ""):
        offer(match.group(0))

    # Icons last: useful for the palette, never a card photo.
    for rel in ("apple-touch-icon", "icon", "shortcut icon"):
        node = soup.find("link", rel=lambda value: value and rel in value.lower())
        if node:
            logos.append(_abs(base, node.get("href")) or "")

    ordered = [url for _, url in sorted(best.values(), key=lambda item: -item[0])]
    return ordered + [u for u in logos if u and _asset_key(u) not in excluded][:4]


# --- Logo ----------------------------------------------------------------------------

# "logo" in any script the attribute or filename is written in — including a Hebrew
# filename that arrives percent-encoded (`%D7%9C%D7%95%D7%92%D7%95` is "לוגו").
_LOGO_WORD_RE = re.compile(r"logo|לוגו", re.I)
# Icons and logos a platform serves when the owner never uploaded their own. Wix's
# default favicon lives under the `f94c49_` media prefix on every uncustomised site.
_PLATFORM_DEFAULT_ICON_RE = re.compile(
    r"static\.wixstatic\.com/media/f94c49_|/wp-includes/images/w-logo|"
    r"/elementor/assets/images/placeholder|/universal/default-favicon|"
    r"cdn\.shopify\.com/s/files/.*/shopify-favicon|/favicon\.ico(?:$|\?)",
    re.I,
)
# Other people's logos a small-business page shows: payment badges (Bit, Visa…), social
# icons, accessibility plugins, delivery partners. "logo" in their filename is a trap.
_NOT_OUR_LOGO_RE = re.compile(
    r"(?<![a-z])bit(?![a-z])|visa|mastercard|amex|paypal|payment|credit|isracard|apple-?pay|"
    r"google-?pay|whatsapp|facebook|instagram|tiktok|youtube|waze|buy-?me|location|"
    r"accessib|nagish|negish|partner|client|sponsor|award|certif|trustpilot|shipping|delivery|"
    r"wolt|10bis|cibus",
    re.I,
)
_LOGO_MIMES = {"image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "image/avif"}


def _jsonld_nodes(soup: BeautifulSoup):
    """Every object in the page's JSON-LD blocks, flattened (@graph, lists, nesting)."""
    for script in soup.find_all("script", attrs={"type": re.compile("ld\\+json", re.I)}):
        try:
            data = json.loads(script.string or script.get_text() or "")
        except (ValueError, TypeError):
            continue
        stack = [data]
        while stack:
            node = stack.pop()
            if isinstance(node, list):
                stack.extend(node)
            elif isinstance(node, dict):
                yield node
                stack.extend(value for value in node.values() if isinstance(value, (dict, list)))


def _ld_url(value) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get("url") or value.get("contentUrl") or value.get("@id")
    if isinstance(value, list) and value:
        return _ld_url(value[0])
    return None


def _widest_srcset(value: str | None) -> str | None:
    """The largest candidate of a srcset. Wix URLs carry commas of their own
    (`/v1/fill/w_376,h_85,al_c/…`), so candidates are split at a comma that follows a
    width/density descriptor or is followed by whitespace — never at every comma."""
    text = str(value or "").strip()
    if not text:
        return None
    parts = re.split(r"(?<=\d[wx]),\s*|,\s+", text)
    best: tuple[float, str] | None = None
    for part in parts:
        pieces = part.strip().split()
        if not pieces:
            continue
        weight = 1.0
        if len(pieces) > 1:
            try:
                weight = float(pieces[-1].lower().rstrip("wx") or 1)
            except ValueError:
                weight = 1.0
        if best is None or weight > best[0]:
            best = (weight, pieces[0])
    return best[1] if best else None


def _int_attr(node, name: str) -> int:
    try:
        return int(float(str(node.get(name) or "0").replace("px", "")))
    except ValueError:
        return 0


def _in_brand_region(img, region: str) -> bool:
    """Semantic landmarks and CMS header/footer templates carry the same evidence."""
    role = "banner" if region == "header" else "contentinfo"
    return any(
        parent.name == region or parent.get("role") == role
        or parent.get("data-elementor-type") == region
        for parent in img.parents if getattr(parent, "attrs", None) is not None
    )


def _links_to_site_home(base: str, href: str) -> bool:
    if not href or href.startswith("#"):
        return False
    target, site = urlparse(_abs(base, href) or ""), urlparse(base)
    # A partner's root URL and a menu's in-page link are not the site's identity.
    target_host = (target.hostname or "").lower().removeprefix("www.")
    site_host = (site.hostname or "").lower().removeprefix("www.")
    return bool(
        target.scheme in {"http", "https"} and target_host == site_host
        and target.path in {"", "/"} and not target.fragment
    )


def logo_candidates(base: str, soup: BeautifulSoup) -> list[dict]:
    """Where the business's logo is likely to be, best first: `[{url, source, score}]`.

    Static HTML only (no browser). In priority order:

    1. schema.org `logo` in JSON-LD (Organization / LocalBusiness / any type), or an
       `itemprop="logo"` element — the site telling us outright.
    2. An `<img>` whose alt / class / id / filename says "logo" or "לוגו" — ranked up when
       it sits in `<header>` or near the top of the document, links home, or is wide
       (wordmarks are). A header image linking to the site's own home is stronger
       identity evidence than an unrelated image whose filename happens to say logo.
    3. `og:logo`, then the JSON-LD `image` of an Organization / LocalBusiness.
    4. `apple-touch-icon` / a large `icon`, unless it is a platform default (Wix's
       `f94c49_` favicon is on every site that never set one).
    """
    found: dict[str, dict] = {}

    def offer(raw: str | None, source: str, score: float) -> None:
        url = _abs(base, raw)
        if not url or not url.lower().startswith(("http://", "https://")):
            return
        if _PLATFORM_DEFAULT_ICON_RE.search(url):
            return
        key = _asset_key(url)
        if key not in found or found[key]["score"] < score:
            found[key] = {"url": url, "source": source, "score": score}

    org_types = re.compile(r"organization|localbusiness|store|restaurant|bakery|brand|corporation", re.I)
    for node in _jsonld_nodes(soup):
        if node.get("logo"):
            offer(_ld_url(node.get("logo")), "jsonld_logo", 100)
        kind = node.get("@type")
        kinds = " ".join(kind) if isinstance(kind, list) else str(kind or "")
        if org_types.search(kinds) and node.get("image"):
            offer(_ld_url(node.get("image")), "jsonld_image", 45)

    for node in soup.find_all(attrs={"itemprop": re.compile(r"\blogo\b", re.I)}):
        offer(node.get("src") or node.get("content") or node.get("href"), "itemprop_logo", 95)

    images = soup.find_all("img")
    for position, img in enumerate(images):
        src = _widest_srcset(img.get("srcset") or img.get("srcSet")) or (
            img.get("src") or img.get("data-src") or img.get("data-lazy-src")
        )
        if not src:
            continue
        classes = " ".join(img.get("class") or []) if isinstance(img.get("class"), list) else str(img.get("class") or "")
        words = " ".join(
            [str(img.get("alt") or ""), classes, str(img.get("id") or ""), unquote(str(src))]
        )
        # The wrapper often carries the word instead: <a class="site-logo"><img …></a>.
        parent = img.parent
        for _ in range(3):
            if parent is None or getattr(parent, "name", None) in {None, "body", "[document]"}:
                break
            parent_class = parent.get("class")
            words += " " + (" ".join(parent_class) if isinstance(parent_class, list) else str(parent_class or ""))
            words += " " + str(parent.get("id") or "")
            parent = parent.parent
        in_header = _in_brand_region(img, "header")
        links_home = False
        anchor = img.find_parent("a")
        if anchor is not None:
            href = str(anchor.get("href") or "").strip()
            links_home = _links_to_site_home(base, href)
        width, height = _int_attr(img, "width"), _int_attr(img, "height")
        wide = bool(width and height and width / height >= 1.6)
        own_words = " ".join([str(img.get("alt") or ""), classes, unquote(str(src))])
        if _NOT_OUR_LOGO_RE.search(own_words):
            continue
        if _LOGO_WORD_RE.search(words):
            score = 60.0
            score += 12 if in_header else 0
            score -= 20 if _in_brand_region(img, "footer") else 0
            score += 8 if links_home else 0
            score += 6 if wide else 0
            score -= 8 if (width and height and max(width, height) < 64) else 0
            score += max(0.0, 8 - position)  # top of the document
            offer(src, "img_logo", min(score, 94))
        elif in_header and links_home and position < 12:
            offer(src, "header_home_img", min(84 + (6 if wide else 0) + max(0, 4 - position), 94))
        elif in_header and wide and position < 12:
            offer(src, "header_img", 35 - position)

    for attrs in ({"property": "og:logo"}, {"name": "og:logo"}, {"itemprop": "logo"}):
        node = soup.find("meta", attrs=attrs)
        if node and node.get("content"):
            offer(node.get("content"), "og_logo", 50)

    for link in soup.find_all("link"):
        rel = " ".join(link.get("rel") or []).lower() if isinstance(link.get("rel"), list) else str(link.get("rel") or "").lower()
        if "apple-touch-icon" in rel:
            offer(link.get("href"), "apple_touch_icon", 30)
        elif "icon" in rel:
            sizes = str(link.get("sizes") or "")
            match = re.match(r"(\d+)x\d+", sizes)
            if match and int(match.group(1)) >= 96:
                offer(link.get("href"), "icon", 25)

    return sorted(found.values(), key=lambda item: -item["score"])


# --- Social links ----------------------------------------------------------------------

_SOCIAL_PATTERNS = {
    "instagram": re.compile(r"^https?://(?:www\.|m\.)?instagram\.com/([A-Za-z0-9._]{1,30})/?(?:[?#].*)?$", re.I),
    "facebook": re.compile(
        r"^https?://(?:www\.|m\.|he-il\.)?(?:facebook|fb)\.com/((?:profile\.php\?id=\d+)|[A-Za-z0-9.\-]{2,80})/?(?:[?#].*)?$",
        re.I,
    ),
    "tiktok": re.compile(r"^https?://(?:www\.|m\.)?tiktok\.com/@([A-Za-z0-9._]{2,24})/?(?:[?#].*)?$", re.I),
}
# Paths on those hosts that are not an account: share buttons, posts, the network's own pages.
_NOT_AN_ACCOUNT = {
    "p", "reel", "reels", "explore", "stories", "accounts", "tv", "share", "sharer", "sharer.php",
    "dialog", "plugins", "tr", "login", "login.php", "home.php", "groups", "events", "watch",
    "hashtag", "policies", "privacy", "help", "business", "pages", "intent", "wix", "shopify",
}


def social_links(soup: BeautifulSoup) -> dict[str, str]:
    """The business's own Instagram / Facebook / TikTok, from links on its page (usually
    the footer) and JSON-LD `sameAs`. Public HTML only — the networks are never fetched.
    `{}` when none; one URL per network, the first seen."""
    hrefs = [str(a.get("href") or "").strip() for a in soup.find_all("a")]
    for node in _jsonld_nodes(soup):
        same = node.get("sameAs")
        hrefs.extend([same] if isinstance(same, str) else [s for s in same or [] if isinstance(s, str)])
    found: dict[str, str] = {}
    for href in hrefs:
        if href.startswith("//"):
            href = "https:" + href
        for network, pattern in _SOCIAL_PATTERNS.items():
            if network in found:
                continue
            match = pattern.match(href)
            if not match:
                continue
            account = match.group(1)
            if account.lower().rstrip("/") in _NOT_AN_ACCOUNT:
                continue
            if network == "instagram":
                found[network] = f"https://www.instagram.com/{account}/"
            elif network == "tiktok":
                found[network] = f"https://www.tiktok.com/@{account}"
            else:
                found[network] = f"https://www.facebook.com/{account}"
    return found


def _download_logo(
    client: httpx.Client, candidates: list[dict], fetch=None, attempts: int = 3
) -> dict | None:
    """Fetch the first candidate that is really an image. Its own slot: the photo cap
    does not apply, and a failure costs the scan nothing but the logo."""
    fetch = fetch or safe_get
    for candidate in candidates[:attempts]:
        url = candidate["url"]
        try:
            response = fetch(client, url, timeout=10.0)
        except ScrapeBudgetExceeded:
            return None
        except (httpx.HTTPError, UnsafeUrlError):
            continue
        if response.status_code >= 400:
            continue
        mime = response.headers.get("content-type", "").split(";")[0].strip().lower()
        data = response.content
        if mime not in _LOGO_MIMES:
            lowered = url.lower().split("?")[0]
            if lowered.endswith(".svg"):
                mime = "image/svg+xml"
            elif lowered.endswith(".png"):
                mime = "image/png"
            else:
                continue
        if len(data) < 100 or len(data) > 900_000:
            continue
        logo = {
            "url": str(response.url) if not str(response.url).startswith("data:") else url,
            "mime": mime,
            "bytes": data,
            "source": candidate["source"],
            "width": 0,
            "height": 0,
        }
        if mime == "image/svg+xml":
            if b"<svg" not in data[:4000].lower():
                continue
            return logo
        size = color_evidence.image_size(data) or _image_dimensions(data)
        if not size:
            continue
        logo["width"], logo["height"] = size
        if min(size) < 24:
            continue
        return logo
    return None


def _logo_colors(logo: dict | None) -> list[dict]:
    if not logo:
        return []
    if logo["mime"] == "image/svg+xml":
        return color_evidence.svg_colors(logo["bytes"].decode("utf-8", "ignore"))
    # A logo is mostly flat colour on transparency or white: white only counts when it
    # is most of the mark, not because it is the ground around it.
    return color_evidence.dominant_colors(logo["bytes"], max_colors=4, neutral_share=0.5)


def build_color_evidence(logo: dict | None, photos: list[dict], css: list[str]) -> dict:
    """What the brand model is told about colour, strongest signal first. The screenshot
    slot is filled by `screenshot.attach_screenshot` when one was captured.

    Photo colours count only for images shaped like photographs and not named after a
    partner (a Wolt banner's cyan is Wolt's colour, not the bakery's)."""
    photo_lists = [
        color_evidence.dominant_colors(p["bytes"], max_colors=4)
        for p in photos
        if _looks_like_a_photograph(p["bytes"]) and not _NOT_OUR_LOGO_RE.search(unquote(p.get("url", "")))
    ]
    evidence = {
        "screenshot": [],
        "logo": _logo_colors(logo),
        "photos": color_evidence.merge_color_lists(photo_lists, max_colors=6),
        "css": list(css),
    }
    return evidence


def _download_images(
    client: httpx.Client, urls: list[str], fetch=None, max_images: int = 6
) -> list[dict]:
    fetch = fetch or safe_get
    images: list[dict] = []
    for url in urls:
        if len(images) >= max_images:
            break
        try:
            response = fetch(client, url, timeout=12.0)
        except ScrapeBudgetExceeded:
            break
        except (httpx.HTTPError, UnsafeUrlError):
            continue
        if response.status_code >= 400:
            continue
        content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
        if content_type not in {"image/jpeg", "image/png", "image/webp", "image/gif"}:
            if not url.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")):
                continue
            content_type = "image/jpeg"
        if len(response.content) < 1200 or len(response.content) > 900_000:
            continue
        images.append({"url": str(response.url), "mime": content_type, "bytes": response.content})
    return images


# URLs that are almost never a usable product photograph.
_NOT_A_PHOTO = re.compile(
    r"icon|favicon|logo|sprite|avatar|placeholder|badge|payment|visa|mastercard|"
    r"whatsapp|facebook|instagram|twitter|linkedin|youtube|pixel|tracking|1x1|spacer",
    re.I,
)
# A real photograph is comfortably larger than an icon or a logo lockup.
# Real product thumbnails are commonly 20-35 KB. The old 40 KB floor threw away
# legitimate photographs while still letting a 43 KB logo through.
_MIN_PHOTO_BYTES = 12_000

# Background images are only ever referenced through CSS url(...). The URL may be bare
# or wrapped in quotes, so the closing paren is excluded and quotes are trimmed by the
# caller rather than being swallowed into the captured URL.
CSS_URL_RE = re.compile(r"url\(\s*(?P<quote>['\"]?)(?P<url>.*?)(?P=quote)\s*\)", re.I)


def collect_image_references(base: str, soup: BeautifulSoup, html: str = "") -> list[str]:
    """Every image the page references, including the places a deep scan has to look.

    `scrape_site` only needs a handful of candidates for palette and style work. The
    assets library does the opposite job: the owner asked us to pull THEIR imagery, so
    it has to see lazy-loaded `srcset` variants (a plain <img> often carries a 1px
    placeholder, so only the srcset holds the real photograph), `og:image`, <source>
    tags, and images painted by CSS — inline `style="background-image:url(...)"` and
    <style> blocks.

    Icon-sized assets are dropped: the logo is not what a post needs. Each srcset
    contributes only its widest candidate — otherwise one hero image would consume a
    third of the caller's cap at three different resolutions — and the result is
    de-duplicated in document order.
    """
    seen: list[str] = []

    def offer(raw: str | None) -> None:
        url = _abs(base, raw)
        if not url or not url.lower().startswith(("http://", "https://")):
            return
        if _NOT_A_PHOTO.search(url):
            return
        if url not in seen:
            seen.append(url)

    def offer_srcset(value: str | None) -> None:
        """Offer only the widest candidate in a srcset — the real photograph."""
        best: tuple[int, str] | None = None
        for candidate in str(value or "").split(","):
            parts = candidate.strip().split()
            if not parts:
                continue
            descriptor = parts[1].lower() if len(parts) > 1 else "1x"
            digits = descriptor.rstrip("wx")
            weight = int(digits) if digits.isdigit() else 1
            if best is None or weight > best[0]:
                best = (weight, parts[0])
        if best:
            offer(best[1])

    # Head first, matching document order: og:image is the page's own hero.
    for node in soup.find_all("meta"):
        key = f"{node.get('property') or ''} {node.get('name') or ''}".lower()
        if "image" in key:
            offer(node.get("content"))

    # srcset matters more than src: a lazy loader often leaves a placeholder in src.
    for node in soup.find_all(["img", "source"]):
        for value in (node.get("srcset"), node.get("data-srcset"), node.get("data-lazy-srcset")):
            offer_srcset(value)
        offer(node.get("src") or node.get("data-src") or node.get("data-lazy-src"))

    for node in soup.find_all("style"):
        for match in CSS_URL_RE.finditer(node.get_text(" ", strip=True)):
            offer(match.group("url"))
    for node in soup.find_all(attrs={"style": True}):
        for match in CSS_URL_RE.finditer(str(node.get("style") or "")):
            offer(match.group("url"))

    # Absolute URLs hiding inside inline scripts (Wix/Shopify/SPA galleries).
    for match in _IMG_URL_RE.finditer(html or ""):
        offer(match.group(0))

    return seen


def fetch_photo_candidates(urls: list[str], limit: int = 3) -> list[dict]:
    """Download the business's OWN photographs from URLs found while scraping.

    These are used two ways: fed back to the image model as style references, and as
    the card photo itself under `real_photo_first`. Icons, logos and tracking pixels
    are rejected, and anything too small to be a photograph is dropped.
    """
    picked: list[str] = []
    for url in urls or []:
        if not url or _NOT_A_PHOTO.search(url):
            continue
        if url not in picked:
            picked.append(url)
    if not picked:
        return []

    out: list[dict] = []
    try:
        with httpx.Client(follow_redirects=True, timeout=20.0, headers={"User-Agent": USER_AGENT}) as client:
            for url in picked:
                if len(out) >= limit:
                    break
                response = None
                for candidate_url in (_larger_variant(url), url):
                    if not candidate_url:
                        continue
                    try:
                        response = safe_get(client, candidate_url, timeout=15.0)
                    except (httpx.HTTPError, UnsafeUrlError):
                        response = None
                        continue
                    if response.status_code < 400:
                        break
                    response = None
                if response is None:
                    continue
                if response.status_code >= 400:
                    continue
                mime = response.headers.get("content-type", "").split(";")[0].strip().lower()
                if mime not in {"image/jpeg", "image/png", "image/webp"}:
                    continue
                data = response.content
                if len(data) < _MIN_PHOTO_BYTES or len(data) > 1_200_000:
                    continue
                if not _looks_like_a_photograph(data):
                    continue
                out.append({"url": str(response.url), "mime": mime, "bytes": data})
    except httpx.HTTPError:
        return out
    return out


def _image_dimensions(data: bytes) -> tuple[int, int] | None:
    """Width/height from the file header, without decoding the image.

    Needed because CDN filenames are opaque hashes (`005c54_3c8aff44...%7Emv2.png`), so
    there is no filename to tell a product photo from a wordmark. Shape is the signal.
    """
    try:
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            return struct.unpack(">II", data[16:24])
        if data[:3] == b"GIF":
            return struct.unpack("<HH", data[6:10])
        if data[:2] == b"\xff\xd8":  # JPEG: walk segments to the SOF marker
            i = 2
            while i < len(data) - 9:
                if data[i] != 0xFF:
                    i += 1
                    continue
                marker = data[i + 1]
                if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB}:
                    height, width = struct.unpack(">HH", data[i + 5 : i + 9])
                    return width, height
                if marker in {0xD8, 0xD9} or 0xD0 <= marker <= 0xD7:
                    i += 2
                    continue
                i += 2 + struct.unpack(">H", data[i + 2 : i + 4])[0]
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            chunk = data[12:16]
            if chunk == b"VP8X":
                w = 1 + int.from_bytes(data[24:27], "little")
                h = 1 + int.from_bytes(data[27:30], "little")
                return w, h
            if chunk == b"VP8 ":
                w = int.from_bytes(data[26:28], "little") & 0x3FFF
                h = int.from_bytes(data[28:30], "little") & 0x3FFF
                return w, h
            if chunk == b"VP8L":
                bits = int.from_bytes(data[21:25], "little")
                return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    except (struct.error, IndexError, ValueError):
        return None
    return None


def _looks_like_a_photograph(data: bytes) -> bool:
    """Reject the shapes that wordmarks, logos and banners have.

    A 998x480 asset is a lockup, not a photograph; used full-bleed on a 4:5 card it
    looks broken. Both bounds are deliberately loose so ordinary photos always pass.
    """
    dims = _image_dimensions(data)
    if not dims:
        return True  # unknown format: don't punish it, the caller still has other checks
    width, height = dims
    if width < 400 or height < 260:
        return False
    ratio = width / height if height else 0
    return 0.45 <= ratio <= 1.9


@dataclass(frozen=True)
class ScrapeLimits:
    """Hard caps for a scrape nobody has paid for yet — the public pre-signup preview.

    httpx's `timeout` bounds each network *operation*, not a request: a server that
    drips one byte every few seconds never trips it, and a response body has no size
    limit at all. Under limits every fetch is streamed, cut at a byte cap, and abandoned
    once the whole scrape's deadline has passed.
    """

    deadline_seconds: float = 20.0
    request_timeout: float = 8.0
    # A Wix storefront's homepage is ~2.3 MB of HTML (tazizi.co.il, Sept 2026).
    max_html_bytes: int = 3_000_000
    max_stylesheet_bytes: int = 400_000
    max_image_bytes: int = 900_000
    max_images: int = 3
    max_stylesheets: int = 3


PREVIEW_LIMITS = ScrapeLimits()

_REDIRECT_CODES = {301, 302, 303, 307, 308}
# The body is re-wrapped already decoded, so these would make httpx decode it twice or
# expect bytes that were cut off.
_DROP_HEADERS = {"content-encoding", "content-length", "transfer-encoding"}


def capped_get(
    client: httpx.Client,
    url: str,
    *,
    max_bytes: int,
    deadline: float,
    request_timeout: float = 8.0,
    max_redirects: int = 5,
    **_ignored,
) -> httpx.Response:
    """`netguard.safe_get` with a byte cap and a wall-clock deadline.

    Same SSRF discipline — every redirect hop is re-validated — but the body is streamed
    and cut at `max_bytes + 1` (so a caller can still tell "too big" from "exactly the
    cap"), and the request is abandoned once `deadline` (a `time.monotonic()` value) has
    passed. Decoded bytes are counted, so a gzip bomb hits the cap too.
    """
    current = assert_public_url(url)
    for _ in range(max_redirects + 1):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ScrapeBudgetExceeded("קריאת האתר לקחה יותר מדי זמן.")
        with client.stream(
            "GET", current, follow_redirects=False, timeout=min(request_timeout, remaining)
        ) as response:
            location = response.headers.get("location")
            if response.status_code in _REDIRECT_CODES and location:
                current = assert_public_url(str(httpx.URL(current).join(location)))
                continue
            body = bytearray()
            for chunk in response.iter_bytes():
                body.extend(chunk)
                if len(body) > max_bytes:
                    del body[max_bytes + 1 :]
                    break
                if time.monotonic() > deadline:
                    raise ScrapeBudgetExceeded("קריאת האתר לקחה יותר מדי זמן.")
            headers = [
                (key, value)
                for key, value in response.headers.multi_items()
                if key.lower() not in _DROP_HEADERS
            ]
            return httpx.Response(
                response.status_code,
                headers=headers,
                content=bytes(body),
                request=response.request,
            )
    raise UnsafeUrlError("הכתובת הזו מעבירה יותר מדי פעמים לכתובות אחרות.")


def _limited_fetchers(limits: ScrapeLimits):
    """Page / stylesheet / image fetchers that share one deadline."""
    deadline = time.monotonic() + limits.deadline_seconds

    def make(max_bytes: int):
        def fetch(client: httpx.Client, url: str, **_kwargs) -> httpx.Response:
            return capped_get(
                client,
                url,
                max_bytes=max_bytes,
                deadline=deadline,
                request_timeout=limits.request_timeout,
            )

        return fetch

    return make(limits.max_html_bytes), make(limits.max_stylesheet_bytes), make(limits.max_image_bytes)


def _product_links(page_url: str, soup: BeautifulSoup) -> list[dict]:
    from app.services.software_site import content_links
    return content_links(page_url, soup)


def scrape_site(url: str, limits: ScrapeLimits | None = None) -> dict:
    """Read one public page: text, colours, fonts and a few images.

    `limits=None` is the historic behaviour. Passing `ScrapeLimits` (the public preview
    does) streams every fetch under a byte cap and one shared deadline.
    """
    target = _normalize_url(url)
    if limits:
        fetch_page, fetch_css, fetch_image = _limited_fetchers(limits)
        max_images, max_sheets = limits.max_images, limits.max_stylesheets
        client_timeout = limits.request_timeout
    else:
        fetch_page, fetch_css, fetch_image = safe_get, safe_get, safe_get
        max_images, max_sheets = 6, 4
        client_timeout = 20.0
    try:
        with httpx.Client(timeout=client_timeout, headers={"User-Agent": USER_AGENT}) as client:
            # Validates scheme, host and every redirect hop against the SSRF guard.
            response = fetch_page(client, target)
            if response.status_code >= 400:
                raise RuntimeError(f"לא הצלחנו לקרוא את האתר {target} (קוד {response.status_code}).")

            content_type = response.headers.get("content-type", "")
            if "html" not in content_type and not response.text.lstrip().startswith("<"):
                raise RuntimeError(f"לא הצלחנו לקרוא את האתר {target}. ודאו שהוא פתוח לכולם.")

            soup = BeautifulSoup(response.text, "lxml")
            page_url = str(response.url)
            platform = color_evidence.detect_platform(response.text)
            logos = logo_candidates(page_url, soup)
            # The logo has its own slot, fetched first: it is the strongest colour
            # signal a static page gives, and it must never take a photo's place.
            logo = _download_logo(client, logos, fetch=fetch_image)
            claimed = {_asset_key(item["url"]) for item in logos}
            image_urls = _image_candidates(page_url, soup, response.text, exclude=claimed)
            downloaded = _download_images(client, image_urls, fetch=fetch_image, max_images=max_images)
            stylesheets = _fetch_stylesheets(
                client, _stylesheet_urls(page_url, soup), fetch=fetch_css, max_sheets=max_sheets
            )
    except ScrapeBudgetExceeded as exc:
        raise RuntimeError(f"האתר {target} איטי מדי לקריאה כרגע. נסו שוב בעוד דקה.") from exc
    except httpx.HTTPError as exc:
        raise RuntimeError(f"לא הצלחנו לטעון את האתר {target}: {exc}") from exc
    except UnsafeUrlError as exc:
        raise RuntimeError(str(exc)) from exc

    work = BeautifulSoup(response.text, "lxml")
    for tag in work(["script", "style", "noscript", "svg", "iframe"]):
        tag.decompose()

    title = (work.title.string or "").strip() if work.title else ""
    metas: list[str] = []
    for name in ("description", "og:description", "og:title"):
        node = work.find("meta", attrs={"name": name}) or work.find("meta", attrs={"property": name})
        if node and node.get("content"):
            metas.append(str(node["content"]).strip())

    headings = [h.get_text(" ", strip=True) for h in work.find_all(["h1", "h2", "h3"]) if h.get_text(strip=True)]
    paragraphs = [p.get_text(" ", strip=True) for p in work.find_all("p") if len(p.get_text(strip=True)) > 40]
    buttons = [el.get_text(" ", strip=True) for el in work.find_all(["a", "button"]) if 2 < len(el.get_text(strip=True)) < 40]

    text_parts = [title, *metas, *headings[:20], *paragraphs[:40], *buttons[:20]]
    text = "\n".join(part for part in text_parts if part)
    text = " ".join(text.split())
    if len(text) < 80:
        raise RuntimeError(
            f"כמעט לא מצאנו טקסט באתר {target}. אולי הוא נטען רק בדפדפן, ואנחנו לא יכולים לקרוא אותו."
        )

    colors = _extract_colors(response.text, soup, stylesheets, platform)
    fonts = _extract_fonts(soup, stylesheets)
    if not colors and not downloaded and not logo:
        raise RuntimeError(
            f"לא מצאנו באתר {target} צבעים או תמונות שאפשר לקרוא. "
            "כדי לבנות תוכנית אנחנו צריכים אתר פתוח לכולם, עם עיצוב ותמונות."
        )

    return {
        "url": page_url,
        "title": title,
        "meta": metas[:5],
        "headings": headings[:15],
        "buttons": buttons[:15],
        "content_links": _product_links(page_url, soup),
        "text": text[:MAX_CHARS],
        "colors": colors,
        "fonts": fonts,
        "image_urls": [item["url"] for item in downloaded] or image_urls[:4],
        "image_alts": _image_alts(page_url, soup),
        "images": downloaded,
        "platform": platform,
        # `logo` carries bytes (for the vision model) and never leaves the server or
        # reaches the database: `brand.public_scan` keeps only `logo_url`.
        "logo": logo,
        "logo_url": logo["url"] if logo else "",
        "color_evidence": build_color_evidence(logo, downloaded, colors),
        "social_links": social_links(soup),
        # Measurement tags seen in the page source (GA4, GTM, Meta pixel, Google Ads,
        # Search Console verification). The quarter plan's integrations read this.
        "detected_tags": detect_tags(response.text),
    }
