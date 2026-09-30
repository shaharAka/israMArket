"""The public, pre-signup preview: "give us your site, see how your business sounds".

One scan of the owner's site produces what the landing page shows before any account
exists — brand colours, the voice, a guess at the business, and ONE sample post — and
nothing is written to the database. The full scan is kept in a short in-memory cache
keyed by the normalised URL, so the onboarding that follows signup can reuse it instead
of reading the same site a second time.

This path is anonymous and spends Gemini quota, so it is deliberately smaller than the
authenticated scan: the scrape runs under `scraper.PREVIEW_LIMITS` (byte caps, one
shared deadline, three photos plus the logo), and the router in front of it rate-limits
by IP. Reading the brand and writing the sample post use `gemini_extract_model`: this
page is the first thing an owner sees, and the lite model painted a beige-and-pink shop
in its website builder's navy and copied the meta description into the caption. The cache is per-process, like the rate limiter: fine
for the single-process deployment this app runs as, not shared across workers.
"""

from __future__ import annotations

import copy
import logging
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

from app.services import business_fields
from app.services.brand import extract_brand_language, public_scan
from app.services.gemini import extract_json
from app.services.hebrew_style import HEBREW_STYLE
from app.services.jsonutil import loads
from app.services.scraper import PREVIEW_LIMITS, _normalize_url, scrape_site
from app.services.screenshot import attach_screenshot, capture_site
from app.services.strategy import extract_site_profile

logger = logging.getLogger(__name__)

# The model picks a Hebrew label (it reads them better than keys); the response carries
# the key, which is what the onboarding select and the draft store. One list for both
# sides: app/data/business_fields.json.
BUSINESS_TYPES = business_fields.FIELD_KEYS
BUSINESS_TYPE_LABELS = tuple(field.label for field in business_fields.fields())
FALLBACK_BUSINESS_TYPE = business_fields.OTHER

CACHE_TTL_SECONDS = 30 * 60
_CACHE_MAX = 256
_cache: dict[str, tuple[float, dict]] = {}
_cache_lock = threading.Lock()

SAMPLE_POST_SCHEMA = {
    "type": "object",
    "title": "PreviewGuess",
    "description": "ניחוש על העסק ופוסט אחד לדוגמה, מתוך האתר בלבד",
    "properties": {
        "business_type": {"type": "string", "enum": list(BUSINESS_TYPE_LABELS)},
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
                "product": {
                    "type": "string",
                    "description": "המוצר, הקולקציה או השירות המסוים מהאתר שהפוסט עוסק בו, בשם שלו באתר",
                },
                "title": {"type": "string", "description": "כותרת פנימית קצרה לפוסט"},
                "hook": {"type": "string", "description": "משפט הפתיחה של הפוסט: פרט אמיתי על המוצר"},
                "caption": {"type": "string", "description": "הכיתוב המלא, 2 עד 4 משפטים, בניסוח חדש"},
                "cta": {"type": "string", "description": "קריאה לפעולה, 2 עד 4 מילים"},
                "overlay_headline": {
                    "type": "string",
                    "description": "כותרת לכרטיס הגרפי, עד 6 מילים",
                },
            },
            "required": ["product", "title", "hook", "caption", "cta", "overlay_headline"],
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
    """The full public preview (with the sample post) if built recently, else None.
    A brand-only entry (`build_brand_preview`) does not count: it has no post yet."""
    try:
        entry = _cache_get(cache_key(url))
    except ValueError:
        return None
    return entry["preview"] if entry and entry.get("post_done", True) else None


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


# Openers and clichés the sample post must not use. HEBREW_STYLE names most of them; the
# owner's first real test still came back "…מחכות לכן באתר", so the preview checks.
_CLICHE_RE = re.compile(
    r"מחכ(?:ים|ות|ה)\s+(?:ל(?:כם|כן|ך)|רק)|אל\s+תפספס|הגיע\s+הזמן|היי\s+לכול|"
    r"אנחנו\s+שמחים\s+להציג|פנק(?:ו|י)\s+את\s+עצמ|מחפשי(?:ם|ות)\s"
)
# The site addressing its customers as women: feminine singular imperatives that are
# unambiguous in shop copy ("התחברי", "לחצי לרכישה", "הירשמי לניוזלטר").
_FEMININE_RE = re.compile(
    r"(?<![א-ת])ו?(?:התחברי|הירשמי|הרשמי|לחצי|הזמיני|הצטרפי|בחרי|גלי|קני|בואי|תתחדשי|שלחי|"
    r"היכנסי|כנסי|מדדי|צרי|תהני|שתפי|עקבי)(?![א-ת])"
)
_WORD_RE = re.compile(r"[\w֐-׿׳״'\"-]+")
SAMPLE_RETRY_BEFORE_SECONDS = 40.0


def _words(text: str) -> list[str]:
    return _WORD_RE.findall(text or "")


def addresses_women(scraped: dict) -> bool:
    """True when the site plainly speaks to its customers in the feminine."""
    blob = " ".join([scraped.get("text") or "", " ".join(scraped.get("buttons") or [])])
    return len(set(_FEMININE_RE.findall(blob))) >= 2


def _shingles(text: str, size: int = 5) -> set[tuple[str, ...]]:
    words = [w.strip("׳״'\".,:!?-").lower() for w in _words(text)]
    words = [w for w in words if w]
    return {tuple(words[i : i + size]) for i in range(len(words) - size + 1)}


def post_problems(post: dict, scraped: dict) -> list[str]:
    """What is wrong with a sample post, in Hebrew, for one corrective retry."""
    if not isinstance(post, dict):
        return ["לא התקבל פוסט."]
    problems = []
    body = " ".join(str(post.get(k) or "") for k in ("hook", "caption", "overlay_headline"))
    meta = " ".join(scraped.get("meta") or [])
    if meta and _shingles(body) & _shingles(meta):
        problems.append("הכיתוב מעתיק משפט מתיאור האתר (meta description). כתוב אותו מחדש במילים שלך.")
    hook_words = _shingles(post.get("hook") or "", size=4)
    if hook_words and len(hook_words & _shingles(post.get("caption") or "", size=4)) >= max(1, len(hook_words) // 2):
        # The card shows the hook, then the caption: repeating it reads twice.
        problems.append("ה-caption חוזר על ה-hook. הכיתוב צריך להמשיך אותו, לא לחזור עליו.")
    cliche = _CLICHE_RE.search(body)
    if cliche:
        problems.append(f"יש קלישאה אסורה: \"{cliche.group(0).strip()}\". פתח בפרט אמיתי על המוצר.")
    if len(_words(post.get("overlay_headline") or "")) > 6:
        problems.append("overlay_headline ארוכה מ-6 מילים.")
    cta_words = len(_words(post.get("cta") or ""))
    if cta_words < 2 or cta_words > 4:
        problems.append("cta חייבת להיות 2 עד 4 מילים.")
    if not str(post.get("product") or "").strip():
        problems.append("חסר מוצר או הצעה מסוימת מהאתר.")
    return problems


def _sample_prompt(scraped: dict, profile: dict, brand: dict, problems: list[str] | None = None) -> str:
    women = addresses_women(scraped)
    address_rule = (
        "האתר פונה ללקוחות שלו בלשון נקבה (למשל \"התחברי\", \"לחצי\"). בפוסט עצמו כתוב באותה פנייה, "
        "בלשון נקבה, כמו שהעסק מדבר עם הלקוחות שלו. כלל ה\"פנייה ברבים\" שבהנחיות הכתיבה למטה "
        "נוגע לפנייה אל בעל העסק, לא לפוסט הזה."
        if women
        else "פנה ללקוחות כמו שהאתר פונה אליהם; אם לא ברור, ברבים."
    )
    retry = ""
    if problems:
        retry = "\nהגרסה הקודמת נפסלה. תקן את כל אלה:\n" + "\n".join(f"- {p}" for p in problems) + "\n"
    return f"""
לפניך אתר של עסק ישראלי קטן. עשה שני דברים, רק מתוך מה שכתוב באתר:

1. נחש את סוג העסק (business_type מתוך הרשימה), אם הוא מוכר מוצרים, שירותים או את שניהם,
   ואיך לקוחות מגיעים אליו (מקום פיזי / אונליין בלבד / משולב). אם לא ברור — בחר "{business_fields.field_label(business_fields.OTHER)}".
   התחום הוא סוג הפעילות (אוכל, אופנה, יופי…), לא איפה מוכרים: חנות או אתר הם לא תחום.
2. כתוב פוסט אחד לאינסטגרם, מוכן לפרסום, בטון של האתר עצמו:
   - בחר מוצר, קולקציה או שירות אחד מסוים שבאמת מופיע באתר (בכותרות, בכפתורים או בטקסט) וכתוב עליו בלבד.
     כתוב את השם שלו ב-product. לא פוסט כללי על העסק.
   - hook: פרט אמיתי ומוחשי על המוצר הזה (חומר, גזרה, עונה, איך משתמשים בו, למי הוא מתאים). בלי פתיח גנרי.
   - caption: 2 עד 4 משפטים בניסוח שלך, שממשיכים את ה-hook (לא חוזרים עליו).
     אסור להעתיק את תיאור האתר (meta) או משפטים מהאתר כמו שהם.
   - בלי מבצעים, מחירים, הנחות או מספרים שלא כתובים באתר. אסור להמציא.
   - אסור: "מחכים לכם", "מחכות לכן", "מחכה לך", "אל תפספסו", "הגיע הזמן", "מחפשים...?", "היי לכולם".
   - overlay_headline: עד 6 מילים, הכותרת שמודפסת על הכרטיס. cta: 2 עד 4 מילים.
   - {address_rule}
{retry}
שם העסק: {brand.get("business_name") or profile.get("business_name")}
טון הדיבור: {brand.get("voice")}
דוגמאות לטון: {brand.get("voice_examples")}
מילים שהאתר משתמש בהן: {brand.get("do_say")}
מילים שהאתר נמנע מהן: {brand.get("dont_say")}
מוצרים והצעות שראינו באתר: {brand.get("offers_seen") or profile.get("offers")}
הצעות ערך: {profile.get("value_propositions")}
מיקום: {profile.get("location")}

כותרת האתר: {scraped.get("title")}
תיאור האתר (meta, לא להעתיק): {scraped.get("meta")}
כותרות: {scraped.get("headings")}
כפתורים וקישורים: {scraped.get("buttons")}
טקסט מהאתר (מקוצר):
{_clip(scraped.get("text"), 5000)}

{HEBREW_STYLE}
"""


def _sample_post(scraped: dict, profile: dict, brand: dict, started: float | None = None) -> dict:
    """The guess and one sample post, with one corrective retry when the post breaks a
    rule we can check (meta copied, cliché, lengths) and the time budget allows it."""
    started = started if started is not None else time.monotonic()
    guess = loads(extract_json(_sample_prompt(scraped, profile, brand), SAMPLE_POST_SCHEMA), {}) or {}
    problems = post_problems(guess.get("post"), scraped)
    if problems and time.monotonic() - started < SAMPLE_RETRY_BEFORE_SECONDS:
        try:
            second = loads(
                extract_json(_sample_prompt(scraped, profile, brand, problems), SAMPLE_POST_SCHEMA), {}
            ) or {}
        except Exception:
            second = {}
        if second.get("post") and len(post_problems(second.get("post"), scraped)) < len(problems):
            guess = second
    return guess


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

    summary = str(guess.get("offerings_summary") or "")
    resolved = business_fields.resolve_field(guess.get("business_type"), summary)
    business_type = resolved.key if resolved else (business_fields.infer_field(summary) or FALLBACK_BUSINESS_TYPE)
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
            "product": _clip(post.get("product"), 120),
            "title": _clip(post.get("title"), 120),
            "hook": _clip(post.get("hook"), 240),
            "caption": _clip(post.get("caption"), 900),
            "cta": _clip(post.get("cta"), 40),
            "overlay_headline": _clip(post.get("overlay_headline"), 60),
            # One of the site's own photographs, picked by the brand model as clean
            # (no baked-in text or logo). Empty = the card is typographic.
            "photo_url": _public_image_url(brand.get("card_photo_url")),
        }
    logo_url = _public_image_url(brand.get("logo_url") or raw.get("logo_url"))
    social = {
        network: _public_image_url(link)
        for network, link in (brand.get("social_links") or raw.get("social_links") or {}).items()
        if network in {"instagram", "facebook", "tiktok"} and _public_image_url(link)
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
        "logo_url": logo_url,
        # The business's own accounts, linked from its site (footer / JSON-LD sameAs).
        "social_links": social,
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
            "logo_url": logo_url,
            "logo_description": _clip(brand.get("logo_description"), 200),
        },
        "sample_post": sample,
    }


def _public_image_url(value) -> str:
    """An absolute http(s) URL the visitor's browser can load, or ""."""
    url = _clip(value, 1000)
    return url if url.startswith(("https://", "http://")) else ""


# What `build_brand_preview` returns: the brand half of the public payload.
BRAND_FIELDS = (
    "url", "business_name", "offerings", "location", "palette", "voice", "logo_url",
    "social_links", "brand_language",
)


def brand_part(preview: dict) -> dict:
    """The brand half of a public preview (no business guess, no sample post)."""
    return {field: copy.deepcopy(preview.get(field)) for field in BRAND_FIELDS}


def cached_brand_preview(url: str) -> dict | None:
    """The brand for this site if a brand or full preview was built recently, else None."""
    try:
        entry = _cache_get(cache_key(url))
    except ValueError:
        return None
    return brand_part(entry["preview"]) if entry else None


def _scan_brand(url: str, started: float, marks: dict[str, float]) -> dict:
    """Scrape (+ screenshot), read the brand and the site profile. Returns the scan.

    Raises PreviewError with a visitor-safe Hebrew message. Anything else (a Gemini
    outage, a bug) is left to the router, which answers with a generic message rather
    than leaking a provider error to an anonymous caller.
    """
    pool = ThreadPoolExecutor(max_workers=2)
    try:
        # The rendered screenshot needs only the (netguard-checked) URL, so Chrome starts
        # at once and runs beside the scrape. None when Chrome is missing or too slow.
        shot_future = pool.submit(capture_site, _normalize_url(url))
        try:
            scraped = scrape_site(url, limits=PREVIEW_LIMITS)
        except (RuntimeError, ValueError) as exc:
            # The scraper's own messages are Hebrew and name only the URL the visitor typed.
            raise PreviewError(str(exc)) from exc
        marks["scrape"] = time.monotonic() - started

        # The site profile reads text only: start it before waiting for the screenshot.
        profile_future = pool.submit(extract_site_profile, scraped)
        attach_screenshot(scraped, shot_future.result())
        marks["screenshot"] = time.monotonic() - started
        brand = extract_brand_language(scraped)
        marks["brand"] = time.monotonic() - started
        try:
            profile = profile_future.result() or {}
        except Exception:
            # The value-proposition extract enriches the plan later; the preview does
            # not need it to show the brand, so a failure here is not a failed preview.
            profile = {}
    finally:
        # On a failed scrape, answer now; a running Chrome ends on its own deadline.
        pool.shutdown(wait=False)
    if not profile.get("business_name") and brand.get("business_name"):
        profile["business_name"] = brand["business_name"]
    marks["screenshot_used"] = 1.0 if scraped.get("screenshot") else 0.0
    marks["logo_found"] = 1.0 if scraped.get("logo") else 0.0
    return public_scan(scraped, profile, brand)


def _log(kind: str, key: str, marks: dict[str, float]) -> None:
    timings = " ".join(f"{k}={v:.1f}s" for k, v in marks.items() if not k.endswith(("_used", "_found")))
    logger.info(
        "%s %s: %s (screenshot %s, logo %s)",
        kind,
        key,
        timings,
        "yes" if marks.get("screenshot_used") else "no",
        "yes" if marks.get("logo_found") else "no",
    )


def build_brand_preview(url: str) -> dict:
    """The brand only — palette, voice, logo, name, offerings, social links — without the
    business guess or the sample post, so it answers one model call sooner.

    Shares the cache with `build_preview`: a full preview built earlier answers this
    for free, and a brand scan stored here is reused by a later `build_preview` (which
    then only writes the post) and by `/onboarding/scan` via `cached_scan`.
    Returns `brand_part(...)` of the public payload. Raises like `build_preview`.
    """
    cached = cached_brand_preview(url)
    if cached is not None:
        return cached
    key = cache_key(url)
    started = time.monotonic()
    marks: dict[str, float] = {}
    scan = _scan_brand(url, started, marks)
    preview = _public_payload(scan, {})
    _cache_put(key, {"scan": scan, "preview": preview, "post_done": False})
    _log("brand preview", key, marks)
    return brand_part(preview)


def build_preview(url: str) -> dict:
    """Scan, extract, write one post, cache. Returns the public payload.

    When a brand-only scan of this site is cached (`build_brand_preview`), the site is
    not read again: only the business guess and the sample post are written.
    Raises PreviewError with a visitor-safe Hebrew message; see `_scan_brand`.
    """
    key = cache_key(url)
    started = time.monotonic()
    marks: dict[str, float] = {}
    entry = _cache_get(key)
    if entry and entry.get("post_done", True):
        return entry["preview"]
    scan = entry["scan"] if entry else _scan_brand(url, started, marks)
    # The stored scan keeps everything the post needs (title, meta, headings, buttons,
    # text); only image bytes were dropped, and the post does not use them.
    scraped = scan.get("raw") or {}
    profile = scan.get("extracted") or {}
    brand = scan.get("brand_language") or {}

    try:
        guess = _sample_post(scraped, profile, brand, started)
    except Exception:
        # The brand is the promise; the sample post is the bonus. Show what we have.
        guess = {}
    marks["post"] = time.monotonic() - started

    preview = _public_payload(scan, guess)
    _cache_put(key, {"scan": scan, "preview": preview, "post_done": True})
    _log("preview", key, marks)
    return preview
