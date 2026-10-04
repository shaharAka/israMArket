"""Which of the owner's own photos fits a post: real first, chosen by subject.

Candidates, in the order an owner trusts them:
* the photo library (uploads, URL and site imports), matched by its description and tags;
* the business's Instagram posts, matched by their captions;
* the photos kept from the site scan, matched by their alt text and file name.

Matching is local word overlap (Hebrew-aware, no model call), weighted by where the
post names its subject: the featured item first, then the title, angle, hook, photo hint
and scene. A photo already used by other posts of the month counts against itself, so a
month is not one photo repeated. A post that names a specific product and matches none
of the photos gets no photo (a generated image, and the post asks the owner for one),
rather than a picture of something else. Otherwise the least-used photo, taken in turn.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Callable
from urllib.parse import unquote, urlparse

import httpx

from app.services.jsonutil import loads

log = logging.getLogger(__name__)

MODEL_MIMES = {"image/jpeg", "image/png", "image/webp"}
_MAX_REMOTE_BYTES = 8_000_000
ORIGIN_RANK = {"library": 3, "instagram": 2, "site": 1}
# How much one earlier use this month weighs against a photo's subject score.
REUSE_PENALTY = 0.75

_FINALS = str.maketrans("ךםןףץ", "כמנפצ")
_NIQQUD = re.compile(r"[֑-ׇ]")
_WORD = re.compile(r"[א-תA-Za-z0-9]+")
_HEB_PREFIXES = "והבלמשכ"
# Written with final letters already folded (ם → מ), longest first.
_HEB_SUFFIXES = ("יות", "ימ", "ות", "ה", "ת", "י")
# Folded like every word they are compared with: "עם" is looked up as "עמ", so a stop word
# written with a final letter ("עם", "גם", "שם", "בין") is really skipped.
_STOP = {word.translate(_FINALS) for word in (
    "של", "עם", "על", "את", "זה", "זו", "כל", "לא", "יש", "אנחנו", "שלנו", "שלכם", "היום", "חדש", "חדשה",
    "או", "גם", "רק", "עוד", "כמו", "אצלנו", "אתכם", "לכם", "הכי", "מאוד", "בין", "אחד", "אחת", "שם",
    "the", "and", "of", "with", "a", "an", "for", "in", "on", "at", "to", "photo", "image", "shot", "picture",
    "jpg", "jpeg", "png", "webp", "img", "dsc", "scaled", "large", "min", "copy", "final", "mv2", "media",
)}


def _is_hebrew(word: str) -> bool:
    return "א" <= word[0] <= "ת"


def _strip_suffix(word: str) -> str:
    for suffix in _HEB_SUFFIXES:
        if word.endswith(suffix) and len(word) - len(suffix) >= 2:
            return word[: -len(suffix)]
    return word


def stems(text: str) -> set[str]:
    """Every form a word may match on: as written, without its plural/feminine ending,
    and without one or two prefix letters (ה, ו, ב, ל...). Prefix-stripped forms must
    keep three letters, so "לחם" (bread) never matches "חמים" (warm)."""
    out: set[str] = set()
    for raw in _WORD.findall(_NIQQUD.sub("", str(text or "")).lower()):
        word = raw.translate(_FINALS)
        if len(word) < 2 or word in _STOP or word.isdigit():
            continue
        if not _is_hebrew(word):
            out.add(word[:-1] if len(word) > 3 and word.endswith("s") else word)
            continue
        out.add(word)
        out.add(_strip_suffix(word))
        stripped = word
        for _ in range(2):
            if len(stripped) > 3 and stripped[0] in _HEB_PREFIXES:
                stripped = stripped[1:]
                out.add(stripped)
                trimmed = _strip_suffix(stripped)
                if len(trimmed) >= 3:
                    out.add(trimmed)
            else:
                break
    return {stem for stem in out if len(stem) >= 2 and stem not in _STOP}


def subject_terms(post: dict) -> list[tuple[set[str], float]]:
    """The post's words, each group with the weight of where it was said."""
    fields = (
        (post.get("featured_item_name") or post.get("product"), 3.0),
        (post.get("title"), 2.0),
        (post.get("photo_hint_he"), 2.0),
        (post.get("angle"), 1.5),
        (post.get("hook"), 1.0),
        (post.get("scene_description") or post.get("image_prompt"), 1.0),
        (post.get("caption"), 0.5),
    )
    return [(stems(text), weight) for text, weight in fields if text]


def score(candidate_stems: set[str], terms: list[tuple[set[str], float]]) -> float:
    total = 0.0
    counted: set[str] = set()
    for group, weight in terms:
        for stem in group & candidate_stems:
            if stem not in counted:
                counted.add(stem)
                total += weight
    return total


@dataclass
class Candidate:
    key: str
    origin: str  # "library" | "instagram" | "site"
    text: str
    loader: Callable[[], tuple[bytes, str] | None]
    source_url: str = ""
    asset_id: int | None = None

    @property
    def image_source(self) -> str:
        # The values the editor already knows: a library photo is "asset", any other
        # photo of the owner's (site, Instagram) is "real_photo".
        return "asset" if self.origin == "library" else "real_photo"


def _url_words(url: str) -> str:
    path = unquote(urlparse(url or "").path)
    return re.sub(r"[_\-./~]+", " ", path.rsplit("/", 1)[-1])


def _remote_loader(url: str) -> Callable[[], tuple[bytes, str] | None]:
    def load() -> tuple[bytes, str] | None:
        from app.services.netguard import UnsafeUrlError, safe_get

        try:
            with httpx.Client(timeout=15.0) as client:
                response = safe_get(client, url, timeout=15.0)
        except (httpx.HTTPError, UnsafeUrlError):
            return None
        mime = response.headers.get("content-type", "").split(";")[0].strip().lower()
        if response.status_code >= 400 or mime not in MODEL_MIMES or len(response.content) > _MAX_REMOTE_BYTES:
            return None
        return response.content, mime

    return load


def _stored_loader(public_url: str) -> Callable[[], tuple[bytes, str] | None]:
    def load() -> tuple[bytes, str] | None:
        from app.services.images import read_stored_bytes

        loaded = read_stored_bytes(public_url)
        if loaded and loaded[1] in MODEL_MIMES:
            return loaded
        return None

    return load


def gather(db, business, scraped: dict, *, site_photos: list[dict] | None = None) -> list[Candidate]:
    """Every photo of the owner's that could carry a post. Nothing is downloaded here.

    `site_photos` are already-loaded site photos ({url, mime, bytes}) for scans older than
    the stored-photo flag (routers/strategy._candidate_photos); otherwise the stored ones
    are read from disk when chosen.
    """
    from app.services.images import image_public_url

    out: list[Candidate] = []
    if db is not None:
        from app.models import Asset, InstagramPost

        assets = (
            db.query(Asset)
            .filter(Asset.business_id == business.id, Asset.kind == "image")
            .order_by(Asset.created_at.desc(), Asset.id.desc())
            .all()
        )
        for asset in assets:
            if asset.mime not in MODEL_MIMES:
                continue
            tags = " ".join(loads(asset.tags_json, []) or [])
            out.append(
                Candidate(
                    key=f"asset:{asset.id}",
                    origin="library",
                    text=f"{asset.description or ''} {tags} {_url_words(asset.source_url or '')}",
                    loader=_stored_loader(image_public_url(business.id, asset.filename)),
                    source_url=asset.source_url or "",
                    asset_id=asset.id,
                )
            )
        posts = (
            db.query(InstagramPost)
            .filter(InstagramPost.business_id == business.id)
            .order_by(InstagramPost.posted_at.desc())
            .limit(40)
            .all()
        )
        for post in posts:
            url = post.media_url if (post.media_type or "") in {"IMAGE", "CAROUSEL_ALBUM"} else post.thumbnail_url
            if not url or not str(url).startswith("https://"):
                continue
            out.append(
                Candidate(
                    key=f"ig:{post.media_id}",
                    origin="instagram",
                    text=post.caption or "",
                    loader=_remote_loader(url),
                    source_url=post.permalink or url,
                )
            )
    if site_photos is not None:
        for index, photo in enumerate(site_photos):
            data, mime = photo.get("bytes"), photo.get("mime")
            out.append(
                Candidate(
                    key=f"site:{photo.get('url') or index}",
                    origin="site",
                    text=f"{photo.get('alt') or ''} {_url_words(photo.get('url') or '')}",
                    loader=(lambda d=data, m=mime: (d, m) if d and m in MODEL_MIMES else None),
                    source_url=photo.get("url") or "",
                )
            )
    else:
        for photo in scraped.get("real_photos") or []:
            public_url = str(photo.get("public_url") or "")
            if not public_url:
                continue
            out.append(
                Candidate(
                    key=f"site:{photo.get('url') or public_url}",
                    origin="site",
                    text=f"{photo.get('alt') or ''} {_url_words(photo.get('url') or '')}",
                    loader=_stored_loader(public_url),
                    source_url=photo.get("url") or "",
                )
            )
    return out


def candidate_key_of(post: dict) -> str | None:
    """Which candidate a stored post's image came from (for the month's reuse count)."""
    if post.get("image_asset_id") and post.get("image_source") == "asset":
        return f"asset:{post['image_asset_id']}"
    return post.get("image_candidate_key") or None


def usage_counts(posts: list, exclude_index: int | None = None) -> dict[str, int]:
    counts: dict[str, int] = {}
    for index, post in enumerate(posts or []):
        if index == exclude_index or not isinstance(post, dict) or not post.get("image_url"):
            continue
        key = candidate_key_of(post)
        if key:
            counts[key] = counts.get(key, 0) + 1
    return counts


def rank(candidates: list[Candidate], post: dict, used: dict[str, int], index: int = 0) -> list[tuple[Candidate, str, float]]:
    """Candidates best first, each with why it was picked ("subject" | "rotation").

    Only subject matches are returned when the post names a specific product, and only
    photos that show that product: one that shares just a word like "מגש" or "מאפייה"
    with the post shows something else, and the post gets a new image instead.
    """
    terms = subject_terms(post)
    scored = [(candidate, score(stems(candidate.text), terms)) for candidate in candidates]
    matched = [(c, s) for c, s in scored if s > 0]
    product = stems(post.get("featured_item_name") or post.get("product") or "")
    if product:
        matched = [(c, s) for c, s in matched if stems(c.text) & product]
    if matched:
        matched.sort(key=lambda item: (-(item[1] - REUSE_PENALTY * used.get(item[0].key, 0)),
                                       -ORIGIN_RANK[item[0].origin], used.get(item[0].key, 0)))
        return [(c, "subject", s) for c, s in matched]
    if post.get("featured_item_name") or post.get("product") or post.get("featured_item_id"):
        return []
    if not candidates:
        return []
    least = min(used.get(c.key, 0) for c in candidates)
    fresh = [c for c in candidates if used.get(c.key, 0) == least]
    fresh.sort(key=lambda c: -ORIGIN_RANK[c.origin])
    start = index % len(fresh)
    turn = fresh[start:] + fresh[:start]
    rest = [c for c in candidates if c not in turn]
    return [(c, "rotation", 0.0) for c in turn + rest]


def choose(candidates: list[Candidate], post: dict, used: dict[str, int], index: int = 0,
           max_loads: int = 3) -> tuple[Candidate, tuple[bytes, str], str] | None:
    """The best photo that actually loads: (candidate, (bytes, mime), reason), or None."""
    for candidate, reason, _score in rank(candidates, post, used, index)[:max_loads]:
        try:
            loaded = candidate.loader()
        except Exception:  # a photo that cannot be read is skipped, never fatal
            log.warning("photo choice: could not load %s", candidate.key)
            loaded = None
        if loaded:
            return candidate, loaded, reason
    return None
