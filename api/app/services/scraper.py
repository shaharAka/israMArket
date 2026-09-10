import re
from collections import Counter
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from app.services.netguard import UnsafeUrlError, safe_get

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
        raise ValueError("אפשר לסרוק רק כתובות http או https.")
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


def _extract_colors(html: str, soup: BeautifulSoup, stylesheets: list[str]) -> list[str]:
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
    ranked = [color for color, _ in Counter(found).most_common(24) if _keep_color(color)]
    unique: list[str] = []
    for color in ranked:
        if color not in unique:
            unique.append(color)
    return unique[:8]


def _fonts_from_text(blob: str) -> list[str]:
    names: list[str] = []
    for match in FONT_RE.finditer(blob):
        for part in match.group(1).split(","):
            name = part.strip().strip("'\"")
            if name and name.lower() not in GENERIC_FONTS:
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


def _fetch_stylesheets(client: httpx.Client, urls: list[str]) -> list[str]:
    sheets: list[str] = []
    for url in urls:
        try:
            response = safe_get(client, url, timeout=12.0)
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
        if len(sheets) >= 4:
            break
    return sheets


def _abs(base: str, src: str | None) -> str | None:
    if not src:
        return None
    cleaned = src.strip()
    if cleaned.startswith("data:"):
        return None
    return urljoin(base, cleaned)


def _image_candidates(base: str, soup: BeautifulSoup) -> list[str]:
    urls: list[str] = []
    og = soup.find("meta", attrs={"property": "og:image"}) or soup.find("meta", attrs={"name": "og:image"})
    if og:
        urls.append(_abs(base, og.get("content")))
    twitter = soup.find("meta", attrs={"name": "twitter:image"})
    if twitter:
        urls.append(_abs(base, twitter.get("content")))
    for rel in ("apple-touch-icon", "icon", "shortcut icon"):
        node = soup.find("link", rel=lambda value: value and rel in value.lower())
        if node:
            urls.append(_abs(base, node.get("href")))
    for img in soup.find_all("img"):
        alt = (img.get("alt") or "").lower()
        cls = " ".join(img.get("class") or []).lower()
        src = _abs(base, img.get("src") or img.get("data-src"))
        if src and ("logo" in alt or "logo" in cls or "hero" in cls or "banner" in cls):
            urls.insert(0, src)
        elif src:
            urls.append(src)
    unique: list[str] = []
    for url in urls:
        if url and url not in unique:
            unique.append(url)
    return unique[:8]


def _download_images(client: httpx.Client, urls: list[str]) -> list[dict]:
    images: list[dict] = []
    for url in urls:
        if len(images) >= 3:
            break
        try:
            response = safe_get(client, url, timeout=12.0)
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
_MIN_PHOTO_BYTES = 40_000


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
                try:
                    response = safe_get(client, url, timeout=15.0)
                except (httpx.HTTPError, UnsafeUrlError):
                    continue
                if response.status_code >= 400:
                    continue
                mime = response.headers.get("content-type", "").split(";")[0].strip().lower()
                if mime not in {"image/jpeg", "image/png", "image/webp"}:
                    continue
                data = response.content
                if len(data) < _MIN_PHOTO_BYTES or len(data) > 1_200_000:
                    continue
                out.append({"url": str(response.url), "mime": mime, "bytes": data})
    except httpx.HTTPError:
        return out
    return out


def scrape_site(url: str) -> dict:
    target = _normalize_url(url)
    try:
        with httpx.Client(timeout=20.0, headers={"User-Agent": USER_AGENT}) as client:
            # Validates scheme, host and every redirect hop against the SSRF guard.
            response = safe_get(client, target)
            if response.status_code >= 400:
                raise RuntimeError(f"האתר {target} החזיר סטטוס {response.status_code}")

            content_type = response.headers.get("content-type", "")
            if "html" not in content_type and not response.text.lstrip().startswith("<"):
                raise RuntimeError(f"האתר {target} לא החזיר HTML ציבורי שאפשר לנתח")

            soup = BeautifulSoup(response.text, "lxml")
            page_url = str(response.url)
            image_urls = _image_candidates(page_url, soup)
            downloaded = _download_images(client, image_urls)
            stylesheets = _fetch_stylesheets(client, _stylesheet_urls(page_url, soup))
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
            f"האתר {target} כמעט ריק אחרי החילוץ. ייתכן שהוא בנוי כולו ב-JavaScript בלי תוכן HTML."
        )

    colors = _extract_colors(response.text, soup, stylesheets)
    fonts = _extract_fonts(soup, stylesheets)
    if not colors and not downloaded:
        raise RuntimeError(
            f"האתר {target} לא חשף צבעים או תמונות שאפשר לקרוא. "
            "מעצב האסטרטגיה צריך HTML ציבורי עם עיצוב ותמונות — לא עמוד ריק או אפליקציית JavaScript בלבד."
        )

    return {
        "url": page_url,
        "title": title,
        "meta": metas[:5],
        "headings": headings[:15],
        "buttons": buttons[:15],
        "text": text[:MAX_CHARS],
        "colors": colors,
        "fonts": fonts,
        "image_urls": [item["url"] for item in downloaded] or image_urls[:4],
        "images": downloaded,
    }
