"""The public, pre-signup preview: "give us your site, see how your business sounds".

One scan of the owner's site produces what the landing page shows before any account
exists — brand colours, the voice, a guess at the business, and ONE sample post — and
nothing is written to the database. The full scan is kept in a short in-memory cache
keyed by the normalised URL, so the onboarding that follows signup can reuse it instead
of reading the same site a second time.

This path is anonymous and spends Gemini quota, so it is deliberately smaller than the
authenticated scan: the scrape runs under `scraper.PREVIEW_LIMITS` (byte caps, one
shared deadline, three images), the brand extraction uses the lite model, and the router
in front of it rate-limits by IP. The cache is per-process, like the rate limiter: fine
for the single-process deployment this app runs as, not shared across workers.
"""

from __future__ import annotations

import copy
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

from app.services.brand import extract_brand_language, public_scan
from app.services.gemini import lite_json
from app.services.hebrew_style import HEBREW_STYLE
from app.services.jsonutil import loads
from app.services.scraper import PREVIEW_LIMITS, _normalize_url, scrape_site
from app.services.strategy import extract_site_profile

# Mirrors BUSINESS_TYPES in web/components/onboarding/constants.ts — the onboarding
# select offers exactly these, so the guess has to be one of them to prefill it.
BUSINESS_TYPES = (
    "מאפייה / קפה / מסעדה",
    "חנות פיזית / קמעונאות",
    "חנות אונליין (אי-קומרס)",
    'שירותים מקצועיים (עו"ד, רו"ח, ייעוץ)',
    "קליניקה, יופי ובריאות",
    "סטודיו לאימון / ספורט",
    "עיצוב / אדריכלות / נדל״ן",
    "הדרכות, קורסים וחינוך",
    "תיירות ואירוח",
    "עסק אחר",
)
FALLBACK_BUSINESS_TYPE = "עסק אחר"

CACHE_TTL_SECONDS = 30 * 60
_CACHE_MAX = 256
_cache: dict[str, tuple[float, dict]] = {}
_cache_lock = threading.Lock()

SAMPLE_POST_SCHEMA = {
    "type": "object",
    "title": "PreviewGuess",
    "description": "ניחוש על העסק ופוסט אחד לדוגמה, מתוך האתר בלבד",
    "properties": {
        "business_type": {"type": "string", "enum": list(BUSINESS_TYPES)},
        "business_model": {"type": "string", "enum": ["products", "services", "both"]},
        "presence_type": {
            "type": "string",
            "enum": ["brick_and_mortar", "online_only", "hybrid"],
        },
        "offerings_summary": {
            "type": "string",
            "description": "משפט קצר: מה העסק מוכר או מציע, במילים של האתר",
        },
        "post": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "כותרת פנימית קצרה לפוסט"},
                "hook": {"type": "string", "description": "משפט הפתיחה של הפוסט"},
                "caption": {"type": "string", "description": "הכיתוב המלא, 2 עד 4 משפטים"},
                "cta": {"type": "string", "description": "קריאה לפעולה, 2 עד 4 מילים"},
                "overlay_headline": {
                    "type": "string",
                    "description": "כותרת לכרטיס הגרפי, עד 6 מילים",
                },
            },
            "required": ["title", "hook", "caption", "cta", "overlay_headline"],
        },
    },
    "required": ["business_type", "business_model", "presence_type", "offerings_summary", "post"],
}


class PreviewError(RuntimeError):
    """A failure whose message is safe to show an anonymous visitor (Hebrew)."""


def cache_key(url: str) -> str:
    """The identity of a site for caching: host without `www.`, path without the
    trailing slash, query kept. Scheme is ignored — http and https are the same shop.

    Raises ValueError (Hebrew) for a URL the scraper would refuse anyway.
    """
    parsed = urlparse(_normalize_url(url))
    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    if parsed.port and parsed.port not in {80, 443}:
        host = f"{host}:{parsed.port}"
    path = parsed.path.rstrip("/")
    query = f"?{parsed.query}" if parsed.query else ""
    return f"{host}{path}{query}"


def _cache_get(key: str) -> dict | None:
    now = time.monotonic()
    with _cache_lock:
        hit = _cache.get(key)
        if not hit:
            return None
        expires, entry = hit
        if expires < now:
            _cache.pop(key, None)
            return None
        return copy.deepcopy(entry)


def _cache_put(key: str, entry: dict) -> None:
    with _cache_lock:
        if len(_cache) >= _CACHE_MAX:
            # Oldest expiry first: the cache is a courtesy, not a store.
            for stale in sorted(_cache, key=lambda k: _cache[k][0])[: len(_cache) - _CACHE_MAX + 1]:
                _cache.pop(stale, None)
        _cache[key] = (time.monotonic() + CACHE_TTL_SECONDS, copy.deepcopy(entry))


def reset_cache() -> None:
    """Test helper."""
    with _cache_lock:
        _cache.clear()


def cached_preview(url: str) -> dict | None:
    """The public preview for this site if it was built recently, else None."""
    try:
        entry = _cache_get(cache_key(url))
    except ValueError:
        return None
    return entry["preview"] if entry else None


def cached_scan(url: str) -> dict | None:
    """The full scan behind a recent preview — the same shape `scan_website` returns —
    so `/onboarding/scan` can reuse it right after signup. None when it has expired."""
    try:
        entry = _cache_get(cache_key(url))
    except ValueError:
        return None
    return entry["scan"] if entry else None


def _clip(value, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _sample_post(scraped: dict, profile: dict, brand: dict) -> dict:
    prompt = f"""
לפניך אתר של עסק ישראלי קטן. עשה שני דברים, רק מתוך מה שכתוב באתר:

1. נחש את סוג העסק (business_type מתוך הרשימה), אם הוא מוכר מוצרים, שירותים או את שניהם,
   ואיך לקוחות מגיעים אליו (מקום פיזי / אונליין בלבד / משולב). אם לא ברור — בחר "עסק אחר".
2. כתוב פוסט אחד לאינסטגרם, מוכן לפרסום, בטון של האתר עצמו.
   - בלי מבצעים, מחירים, הנחות או מספרים שלא כתובים באתר. אסור להמציא.
   - הוק שעוצר גלילה, כיתוב של 2 עד 4 משפטים, קריאה לפעולה של 2 עד 4 מילים.
   - overlay_headline עד 6 מילים — זו הכותרת שמודפסת על הכרטיס.

שם העסק: {brand.get("business_name") or profile.get("business_name")}
טון הדיבור: {brand.get("voice")}
דוגמאות לטון: {brand.get("voice_examples")}
מילים שהאתר משתמש בהן: {brand.get("do_say")}
מילים שהאתר נמנע מהן: {brand.get("dont_say")}
מה ראינו באתר: {brand.get("offers_seen") or profile.get("offers")}
הצעות ערך: {profile.get("value_propositions")}
מיקום: {profile.get("location")}

כותרת האתר: {scraped.get("title")}
כותרות: {scraped.get("headings")}
טקסט מהאתר (מקוצר):
{_clip(scraped.get("text"), 5000)}

{HEBREW_STYLE}
"""
    return loads(lite_json(prompt, SAMPLE_POST_SCHEMA, thinking_level="LOW"), {}) or {}


def _public_payload(scan: dict, guess: dict) -> dict:
    """Only named, model-derived fields leave the server — never the page's HTML or text."""
    brand = scan.get("brand_language") or {}
    profile = scan.get("extracted") or {}
    raw = scan.get("raw") or {}

    palette = []
    for swatch in brand.get("palette") or []:
        if isinstance(swatch, dict) and isinstance(swatch.get("hex"), str):
            palette.append(
                {
                    "hex": _clip(swatch.get("hex"), 9),
                    "role": _clip(swatch.get("role"), 20) or "secondary",
                    "name": _clip(swatch.get("name"), 40),
                }
            )
    offerings = [
        _clip(item, 80)
        for item in (brand.get("offers_seen") or profile.get("offers") or [])
        if str(item or "").strip()
    ][:6]

    business_type = guess.get("business_type")
    if business_type not in BUSINESS_TYPES:
        business_type = FALLBACK_BUSINESS_TYPE
    model = guess.get("business_model")
    if model not in {"products", "services", "both"}:
        model = "products"
    presence = guess.get("presence_type")
    if presence not in {"brick_and_mortar", "online_only", "hybrid"}:
        presence = "brick_and_mortar"

    post = guess.get("post") if isinstance(guess.get("post"), dict) else None
    sample = None
    if post and _clip(post.get("hook"), 10) and _clip(post.get("caption"), 10):
        sample = {
            "format": "image",
            "title": _clip(post.get("title"), 120),
            "hook": _clip(post.get("hook"), 240),
            "caption": _clip(post.get("caption"), 900),
            "cta": _clip(post.get("cta"), 40),
            "overlay_headline": _clip(post.get("overlay_headline"), 60),
        }

    return {
        "url": _clip(raw.get("url"), 500),
        "business_name": _clip(brand.get("business_name") or profile.get("business_name"), 160),
        "business_type": business_type,
        "business_model": model,
        "presence_type": presence,
        "offerings": offerings,
        "offerings_summary": _clip(guess.get("offerings_summary"), 300),
        "location": _clip(profile.get("location"), 120),
        "palette": palette,
        "voice": _clip(brand.get("voice"), 400),
        # A trimmed BrandLanguage for the card renderer (it paints from the palette).
        # Model-derived fields only; nothing here is page text.
        "brand_language": {
            "business_name": _clip(brand.get("business_name"), 160),
            "palette": palette,
            "voice": _clip(brand.get("voice"), 400),
            "typography": {
                "primary": _clip((brand.get("typography") or {}).get("primary"), 60),
                "mood": _clip((brand.get("typography") or {}).get("mood"), 120),
            },
            "offers_seen": offerings,
        },
        "sample_post": sample,
    }


def build_preview(url: str) -> dict:
    """Scan, extract, write one post, cache. Returns the public payload.

    Raises PreviewError with a visitor-safe Hebrew message. Anything else (a Gemini
    outage, a bug) is left to the router, which answers with a generic message rather
    than leaking a provider error to an anonymous caller.
    """
    key = cache_key(url)
    try:
        scraped = scrape_site(url, limits=PREVIEW_LIMITS)
    except (RuntimeError, ValueError) as exc:
        # The scraper's own messages are Hebrew and name only the URL the visitor typed.
        raise PreviewError(str(exc)) from exc

    # The two extractions are independent; run them side by side to halve the wait.
    with ThreadPoolExecutor(max_workers=2) as pool:
        profile_future = pool.submit(extract_site_profile, scraped)
        brand_future = pool.submit(extract_brand_language, scraped)
        brand = brand_future.result()
        try:
            profile = profile_future.result() or {}
        except Exception:
            # The value-proposition extract enriches the plan later; the preview does
            # not need it to show the brand, so a failure here is not a failed preview.
            profile = {}
    if not profile.get("business_name") and brand.get("business_name"):
        profile["business_name"] = brand["business_name"]
    scan = public_scan(scraped, profile, brand)

    try:
        guess = _sample_post(scraped, profile, brand)
    except Exception:
        # The brand is the promise; the sample post is the bonus. Show what we have.
        guess = {}

    preview = _public_payload(scan, guess)
    _cache_put(key, {"scan": scan, "preview": preview})
    return preview
