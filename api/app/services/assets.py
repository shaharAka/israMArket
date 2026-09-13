"""The business's own asset library: upload, pull from a URL, or deep-scan their site.

Everything here keeps two promises the rest of the app already makes:

- **Nothing a client sends becomes a path.** The stored filename is derived locally
  (`asset-<slug>-<hash>.<ext>`) and always lands inside `MEDIA_DIR/{business_id}/`, so
  a crafted filename cannot escape the business's folder or overwrite a generated card.
- **Nothing is described that was not seen.** The description/tags prompt is allowed to
  return "not visible" but never to invent a product, a name or a number. Tags are
  normalised in code (deduplicated, trimmed, capped) because a model's JSON is not a
  contract.
"""

from __future__ import annotations

import hashlib
import json
import re
import struct
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from app.services.gemini import lite_json
from app.services.images import image_public_url, media_root
from app.services.jsonutil import dumps, loads
from app.services.netguard import UnsafeUrlError, assert_public_url, safe_get
from app.services.scraper import (
    CSS_URL_RE,
    USER_AGENT,
    _NOT_A_PHOTO,
    collect_image_references,
)
from app.services.schemas_llm import (
    ASSET_DESCRIPTION_SCHEMA,
    ASSET_SUGGEST_SCHEMA,
    ASSET_TAG_MENU,
)

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
# One page yields at most this many stored assets; the rest are reported as skipped so
# the owner knows the import was capped rather than silently truncated.
IMPORT_CAP = 12
# A page can reference hundreds of images (CDN variants, sprites). Look at a bounded
# number of candidates before giving up on filling IMPORT_CAP slots.
MAX_CANDIDATES = 60
MAX_TAGS = 10

IMAGE_MIMES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
}
VIDEO_MIMES = {
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "video/x-m4v": "m4v",
}
ALLOWED_MIMES = {**IMAGE_MIMES, **VIDEO_MIMES}

# Fallback when the client sends `application/octet-stream` (common for drag-and-drop
# and for fetch-based uploads): trust the bytes, not the header.
_SIGNATURES = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"\x1a\x45\xdf\xa3", "video/webm"),
)

_TAG_WS = re.compile(r"\s+")


def kind_for_mime(mime: str) -> str:
    return "video" if (mime or "").lower().startswith("video/") else "image"


def normalize_mime(raw: str) -> str:
    return (raw or "").split(";")[0].strip().lower()


def sniff_mime(data: bytes) -> str | None:
    """Identify the payload from its header. Returns None for anything unknown."""
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    for signature, mime in _SIGNATURES:
        if data.startswith(signature):
            return mime
    # ISO-BMFF (`ftyp` box): mp4, mov, m4v and friends.
    if len(data) >= 12 and data[4:8] == b"ftyp":
        brand = data[8:12].lower()
        if brand.startswith(b"qt"):
            return "video/quicktime"
        return "video/mp4"
    # AVIF is ISO-BMFF too, but with an `avif`/`avis` brand and an image meaning.
    if len(data) >= 12 and b"avif" in data[4:16]:
        return "image/avif"
    return None


def resolve_mime(declared: str, data: bytes) -> str:
    """The mime we will trust: the sniffed type when the declared one is unusable.

    A browser sends a real content type for a picked file but `application/octet-stream`
    for many drag-and-drop and API uploads, so rejecting on the declared value alone
    would refuse legitimate photos.
    """
    sniffed = sniff_mime(data)
    declared = normalize_mime(declared)
    if declared in ALLOWED_MIMES:
        return declared
    if sniffed:
        return sniffed
    return declared


def unsupported_message() -> str:
    return "סוג הקובץ לא נתמך. אפשר להעלות תמונות (JPG, PNG, WebP, GIF) או סרטון קצר (MP4, MOV, WebM)."


def business_folder(business_id: int):
    folder = (media_root() / str(business_id)).resolve()
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def filename_for(mime: str, data: bytes) -> str:
    """Build the stored name ourselves — never from anything the client sent.

    The mime decides the extension and the bytes decide the name, so a file called
    `../../etc/passwd` or `photo.php` cannot influence where the bytes land or how they
    are served. Deriving the name from the content (and nothing else) also means the
    same photo imported twice, or two photos that happen to share a CDN filename,
    resolve to exactly one file instead of clobbering each other.
    """
    ext = ALLOWED_MIMES.get(mime) or "bin"
    return f"asset-{hashlib.sha1(data).hexdigest()[:20]}.{ext}"


def store_asset_bytes(business_id: int, data: bytes, mime: str) -> str:
    filename = filename_for(mime, data)
    (business_folder(business_id) / filename).write_bytes(data)
    return filename


def delete_asset_file(business_id: int, filename: str) -> None:
    """Remove one asset file, refusing to touch anything outside the business folder."""
    folder = business_folder(business_id)
    target = (folder / filename).resolve()
    if folder not in target.parents:
        return
    try:
        target.unlink()
    except OSError:
        # A missing file is not an error: the row is being deleted either way.
        pass


def public_url(business_id: int, filename: str) -> str:
    return image_public_url(business_id, filename)


# --- dimensions -------------------------------------------------------------------


def image_dimensions(data: bytes) -> tuple[int, int] | None:
    """Width/height from the file header, without decoding the image."""
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


def _atom_boxes(data: bytes, offset: int, end: int):
    while offset + 8 <= end:
        size = int.from_bytes(data[offset : offset + 4], "big")
        kind = data[offset + 4 : offset + 8]
        if size < 8:
            return
        yield kind, offset + 8, min(offset + size, end)
        offset += size


def video_dimensions(data: bytes) -> tuple[int, int] | None:
    """Width/height from the mp4 `tkhd` box, so imported videos are not 0x0.

    Depth-first over the ISO-BMFF boxes; `tkhd` stores the display size as 16.16
    fixed-point after the transformation matrix, which is enough for the UI's
    aspect-ratio math. Version 0 and version 1 headers differ by 8 bytes.
    """
    try:
        for kind, start, end in _atom_boxes(data, 0, len(data)):
            if kind == b"tkhd":
                version = data[start]
                # version+flags (4) + created/modified (4 or 8 each) + track id (4)
                # + reserved (4) + duration (4 or 8). The size fields sit 60 bytes
                # further on, after the reserved/layer/volume block and the matrix.
                base = start + 4 + (8 if version == 1 else 0) + 16
                width = int.from_bytes(data[base + 60 : base + 64], "big") / 65536
                height = int.from_bytes(data[base + 64 : base + 68], "big") / 65536
                if width and height:
                    return int(width), int(height)
                return None
            if kind in {b"moov", b"trak", b"mdia"}:
                found = video_dimensions(data[start:end])
                if found:
                    return found
    except (IndexError, struct.error, ValueError):
        return None
    return None


def dimensions_for(data: bytes, mime: str) -> tuple[int, int]:
    found = image_dimensions(data) if kind_for_mime(mime) == "image" else video_dimensions(data)
    if not found:
        return 0, 0
    width, height = found
    return int(width or 0), int(height or 0)


# --- tags -------------------------------------------------------------------------


def parse_tags(raw) -> list[str]:
    """Turn whatever the model returned into a clean list of tags.

    Tolerates the shapes a vision model actually produces: a JSON list, a JSON string
    of a list, or a comma-separated string. A string that is neither valid JSON nor a
    delimiter-separated list is treated as garbage rather than becoming one long tag.
    """
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return []
        try:
            decoded = json.loads(text)
        except ValueError:
            decoded = None
        if isinstance(decoded, list):
            raw = decoded
        elif "{" in text or "[" in text or '"' in text:
            return []
        else:
            raw = [part for part in re.split(r"[,،;|\n]", text)]
    if not isinstance(raw, list):
        return []

    tags: list[str] = []
    for item in raw:
        if isinstance(item, dict):
            item = item.get("tag") or item.get("name") or ""
        if not isinstance(item, str):
            continue
        cleaned = _TAG_WS.sub(" ", item).strip().strip("#").strip().strip(",;|")
        if not cleaned or len(cleaned) > 40:
            continue
        if cleaned not in tags:
            tags.append(cleaned)
    # Tags from the fixed menu come first, so a well-tagged asset reads consistently;
    # free tags follow in model order.
    return sorted(tags, key=lambda tag: (tag not in ASSET_TAG_MENU,))[:MAX_TAGS]


def parse_description(raw) -> str:
    if isinstance(raw, dict):
        raw = raw.get("description") or raw.get("text") or ""
    if not isinstance(raw, str):
        return ""
    return _TAG_WS.sub(" ", raw).strip()[:2000]


def parse_suggestions(raw, allowed_ids: set[int], limit: int = 6) -> list[dict]:
    """Keep only suggestions whose asset id the business actually owns.

    This is the last line of defence: a hallucinated id must never reach the client,
    and a duplicate must not appear twice.
    """
    if isinstance(raw, str):
        raw = loads(raw, {})
    if isinstance(raw, list):
        raw = {"suggestions": raw}
    if not isinstance(raw, dict):
        return []

    suggestions = raw.get("suggestions")
    if not isinstance(suggestions, list):
        return []

    out: list[dict] = []
    seen: set[int] = set()
    for item in suggestions:
        if not isinstance(item, dict):
            continue
        raw_id = item.get("asset_id", item.get("id"))
        try:
            asset_id = int(raw_id)
        except (TypeError, ValueError):
            continue
        if asset_id not in allowed_ids or asset_id in seen:
            continue
        reason = item.get("reason") or item.get("why") or ""
        if not isinstance(reason, str) or not reason.strip():
            reason = "הנכס מתאים לפוסט הזה."
        seen.add(asset_id)
        out.append({"asset_id": asset_id, "reason": _TAG_WS.sub(" ", reason).strip()[:300]})
        if len(out) >= limit:
            break
    return out


# --- model calls ------------------------------------------------------------------


def describe_prompt() -> str:
    menu = ", ".join(ASSET_TAG_MENU)
    return f"""
בעל העסק העלה תמונה לספריית הנכסים שלו. תאר אותה בדיוק כפי שהיא נראית.

כללים:
- תאר רק מה שמופיע בתמונה: הנושא, הסביבה, האווירה, הצבעים, החומרים והתאורה.
- אל תמציא מוצר, שם עסק, שם אדם, מחיר, מספר או מקום שלא רואים בתמונה.
- בלי סיסמאות שיווקיות ובלי פנייה ללקוח. זה תיאור לצרכים פנימיים, לא פרסומת.
- אם התמונה מטושטשת, חשוכה או לא ברורה — כתוב זאת בפשטות.
- description: משפט עד שניים בעברית.
- tags: 5 עד 10 תגיות בעברית. העדף תגיות מהרשימה: {menu}. מותר להוסיף תגית
  משלך רק אם אין ברשימה תגית שמתאימה.
""".strip()


def describe_image_bytes(data: bytes, mime: str) -> dict:
    """One vision call → {"description": str, "tags": [...]} (never raises on shape)."""
    raw = lite_json(describe_prompt(), ASSET_DESCRIPTION_SCHEMA, images=[(data, mime)])
    parsed = loads(raw, {})
    if not isinstance(parsed, dict):
        parsed = {}
    return {
        "description": parse_description(parsed.get("description")),
        "tags": parse_tags(parsed.get("tags")),
    }


def suggest_prompt(post: dict, business_name: str, assets: list[dict]) -> str:
    lines = []
    for asset in assets:
        tags = ", ".join(asset.get("tags") or [])
        description = (asset.get("description") or "").strip() or "אין תיאור"
        lines.append(
            f"- id={asset['id']} | סוג: {asset.get('kind') or 'image'} | "
            f"תיאור: {description} | תגיות: {tags or 'אין'}"
        )
    catalogue = "\n".join(lines) or "- אין נכסים"
    return f"""
לפניך פוסט שתוכנן לעסק "{business_name}" וספריית הנכסים (תמונות וסרטונים) שהעסק סיפק.

הפוסט:
- כותרת: {post.get("title") or ""}
- פתיח (hook): {post.get("hook") or ""}
- כיתוב: {post.get("caption") or ""}
- נושא/אנגל: {post.get("angle") or post.get("theme") or ""}
- קונספט ויזואלי: {post.get("creative_concept") or post.get("scene_description") or ""}

ספריית הנכסים:
{catalogue}

דרג את שלושת עד חמשת הנכסים המתאימים ביותר לפוסט הזה, מהמתאים ביותר.
- השתמש אך ורק במזהים (id) שמופיעים ברשימה למעלה. אסור להמציא מזהה.
- אם אף נכס לא מתאים באמת — החזר רשימה ריקה. עדיף כלום מאשר התאמה מאולצת.
- reason: משפט קצר בעברית שמסביר למה הנכס מתאים לפוסט (למשל "תמונת המוצר
  המרכזי עם טקסטורה חמה מתאימה לפוסט על החלה הטרייה").
""".strip()


def suggest_assets(post: dict, business_name: str, assets: list[dict]) -> list[dict]:
    """Rank the business's own assets against one post. Real model call."""
    if not assets:
        return []
    raw = lite_json(suggest_prompt(post, business_name, assets), ASSET_SUGGEST_SCHEMA)
    return parse_suggestions(raw, {int(asset["id"]) for asset in assets})


# --- importing from the web -------------------------------------------------------

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp", ".tiff")


def _fetch_headers(url: str) -> dict:
    """Some CDNs 403 a hotlink; sending the page as referer is what a browser does."""
    parsed = urlparse(url)
    return {"User-Agent": USER_AGENT, "Referer": f"{parsed.scheme}://{parsed.netloc}/"}


def _looks_like_image_url(url: str) -> bool:
    path = urlparse(url).path.lower()
    return path.endswith(IMAGE_EXTENSIONS)


def _download_image(client: httpx.Client, url: str, max_bytes: int) -> dict | None:
    """Fetch one image through the SSRF guard. Returns None when it is not usable."""
    try:
        response = safe_get(client, url, timeout=15.0, headers=_fetch_headers(url))
    except (httpx.HTTPError, UnsafeUrlError):
        return None
    if response.status_code >= 400:
        return None
    if len(response.content) > max_bytes:
        return None

    data = response.content
    mime = normalize_mime(response.headers.get("content-type", ""))
    if mime not in IMAGE_MIMES:
        sniffed = sniff_mime(data)
        if sniffed not in IMAGE_MIMES:
            if not _looks_like_image_url(str(response.url)):
                return None
            mime = sniffed or "image/jpeg"
        else:
            mime = sniffed
    if not data:
        return None
    return {"url": str(response.url), "mime": mime, "bytes": data}


def _store_download(business_id: int, source: str, item: dict) -> dict:
    """Persist one downloaded image and return the fields its Asset row needs."""
    filename = store_asset_bytes(business_id, item["bytes"], item["mime"])
    width, height = dimensions_for(item["bytes"], item["mime"])
    return {
        "filename": filename,
        "kind": "image",        "mime": item["mime"],
        "source": source,
        "source_url": item.get("url", "")[:1000],
        "width": width,
        "height": height,
    }


def _harvest(
    client: httpx.Client,
    candidates: list[str],
    business_id: int,
    source: str,
    cap: int,
) -> tuple[list[dict], int]:
    """Download candidates until the cap is reached, then report what was left out.

    Shared by the URL import and the site scan so `skipped` means the same thing in
    both: the images the page referenced that did not become assets — because the cap
    was reached, the download failed, or the file was not an image we could use.
    """
    stored: list[dict] = []
    skipped = 0
    seen: set[str] = set()
    for index, candidate in enumerate(candidates):
        if len(stored) >= cap:
            # Everything from here on is unprocessed. Count what the owner would
            # actually recognise: distinct images, not repeated CDN variants of them.
            rest = {url.split("#")[0] for url in candidates[index:]}
            skipped += len(rest - seen)
            break
        key = candidate.split("#")[0]
        if key in seen:
            continue
        seen.add(key)
        item = _download_image(client, candidate, MAX_UPLOAD_BYTES)
        if not item:
            skipped += 1
            continue
        stored.append(_store_download(business_id, source, item))
    return stored, skipped


def import_from_url(url: str, business_id: int, cap: int = IMPORT_CAP) -> tuple[list[dict], int]:
    """Fetch a user-supplied URL and store the images it exposes.

    Returns (stored, skipped). The URL goes through the same SSRF guard as every other
    user-supplied fetch in this app, and every image inside the page is fetched through
    it too — a page that is public is free to reference `http://10.0.0.5/secret.png`.
    """
    target = assert_public_url(url)
    with httpx.Client(follow_redirects=False, timeout=20.0, headers=_fetch_headers(target)) as client:
        response = safe_get(client, target, timeout=20.0)
        if response.status_code >= 400:
            raise RuntimeError(f"הכתובת החזירה סטטוס {response.status_code}.")

        content_type = normalize_mime(response.headers.get("content-type", ""))
        # The user pasted a direct image link: there is no page to parse.
        if content_type in IMAGE_MIMES or _looks_like_image_url(str(response.url)):
            if content_type not in IMAGE_MIMES:
                content_type = sniff_mime(response.content) or content_type
            if content_type not in IMAGE_MIMES:
                raise RuntimeError("הכתובת הזו אינה תמונה שאפשר לשמור.")
            if len(response.content) > MAX_UPLOAD_BYTES:
                raise RuntimeError("התמונה בכתובת הזו גדולה מ-25MB.")
            item = {"url": str(response.url), "mime": content_type, "bytes": response.content}
            return [_store_download(business_id, "url", item)], 0

        if "html" not in content_type and not response.text.lstrip().startswith("<"):
            raise RuntimeError("הכתובת הזו אינה עמוד HTML ואינה תמונה שאפשר לשמור.")

        page_url = str(response.url)
        soup = BeautifulSoup(response.text, "lxml")
        candidates = collect_image_references(page_url, soup, response.text)[:MAX_CANDIDATES]
        stored, skipped = _harvest(client, candidates, business_id, "url", cap)
        if not stored:
            raise RuntimeError(
                "לא נמצאו תמונות שאפשר לשמור בכתובת הזו. "
                "נסו קישור ישיר לתמונה או עמוד עם תמונות בכתובת ציבורית."
            )
        return stored, skipped


def scan_site_images(website_url: str, business_id: int, cap: int = IMPORT_CAP) -> tuple[list[dict], int]:
    """Deep-scan the business's OWN website for images, CSS backgrounds included."""
    base = website_url.strip()
    if not base:
        raise RuntimeError("לא הוגדרה כתובת אתר לעסק. עדכנו את כתובת האתר ואז סרקו שוב.")
    target = assert_public_url(base)
    with httpx.Client(follow_redirects=False, timeout=20.0, headers=_fetch_headers(target)) as client:
        response = safe_get(client, target, timeout=20.0)
        if response.status_code >= 400:
            raise RuntimeError(f"האתר החזיר סטטוס {response.status_code}.")
        content_type = normalize_mime(response.headers.get("content-type", ""))
        if "html" not in content_type and not response.text.lstrip().startswith("<"):
            raise RuntimeError("כתובת האתר לא החזירה עמוד HTML שאפשר לסרוק.")

        page_url = str(response.url)
        soup = BeautifulSoup(response.text, "lxml")
        candidates = collect_image_references(page_url, soup, response.text)
        # CSS files are fetched only once the markup has had its say, and their images
        # are appended so a page with plenty of <img> never loses them to the cap.
        candidates.extend(_stylesheet_images(client, page_url, soup))
        stored, skipped = _harvest(client, candidates[:MAX_CANDIDATES], business_id, "site", cap)
        if not stored:
            raise RuntimeError(
                "לא נמצאו תמונות באתר. ייתכן שהאתר חסום לסריקה או שהתמונות נטענות רק בדפדפן."
            )
        return stored, skipped


def _stylesheet_images(client: httpx.Client, base: str, soup: BeautifulSoup) -> list[str]:
    """Background images declared in the site's CSS files, fetched best-effort."""
    from app.services.scraper import _stylesheet_urls

    out: list[str] = []
    for sheet_url in _stylesheet_urls(base, soup)[:3]:
        try:
            response = safe_get(client, sheet_url, timeout=12.0)
        except (httpx.HTTPError, UnsafeUrlError):
            continue
        if response.status_code >= 400:
            continue
        for match in CSS_URL_RE.finditer(response.text[:400_000]):
            raw = match.group("url").strip()
            if raw.startswith("data:"):
                continue
            url = urljoin(sheet_url, raw)
            if _NOT_A_PHOTO.search(url) or url in out:
                continue
            out.append(url)
    return out


def serialize_asset(asset) -> dict:
    """The AssetOut contract: tags as a real list, url as the public media URL."""
    return {
        "id": asset.id,
        "kind": asset.kind or "image",
        "mime": asset.mime or "",
        "source": asset.source or "upload",
        "source_url": asset.source_url or "",
        "description": asset.description or "",
        "tags": parse_tags(asset.tags_json),
        "url": public_url(asset.business_id, asset.filename),
        "width": asset.width or 0,
        "height": asset.height or 0,
        "created_at": asset.created_at.isoformat() if asset.created_at else "",
    }


def asset_catalogue(assets: list) -> list[dict]:
    """Compact view of the library for the matching prompt."""
    return [
        {
            "id": asset.id,
            "kind": asset.kind or "image",
            "description": asset.description or "",
            "tags": parse_tags(asset.tags_json),
        }
        for asset in assets
    ]


def store_tags(tags: list[str]) -> str:
    return dumps(tags or [])
