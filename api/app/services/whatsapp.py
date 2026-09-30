"""The WhatsApp tracked link: the measurement that works from day one.

The owner sets the business's WhatsApp number once. Every place a customer can tap "write
to us" gets its own short link, `{PUBLIC_BASE_URL}/r/{code}`, which redirects to
`https://wa.me/<digits>?text=<the prefilled message + a short source code>`.

What this measures, and what it does not (the UI says the same, in the same words):

* It counts **taps on the link**, per source and per day. That is all a redirect can see.
* It does **not** know whether a message was actually sent, or whether anyone bought.
  wa.me opens the chat with the text filled in; the customer may never press send.
* The source code in the message ("(קוד: IG-BIO)") is what tells the owner, inside the
  chat itself, where a conversation came from — when a chat does start.

Privacy (see /security): a click stores the day, the link and a coarse device bucket
(instagram / facebook in-app browser, ios, android, desktop, other). No IP address, no
full user agent, nothing that identifies who tapped. Link-preview crawlers and bots are
not counted, and neither are HEAD requests or browser prefetches. The same person tapping
twice counts twice: these are taps, not people, and the labels say so.
"""

from __future__ import annotations

import re
import secrets
import string
from datetime import date, datetime, timedelta
from urllib.parse import quote
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Business, Strategy, WhatsappClick, WhatsappLink
from app.services import ratelimit
from app.services.jsonutil import loads

ISRAEL = ZoneInfo("Asia/Jerusalem")
CODE_ALPHABET = string.ascii_letters + string.digits  # base62
CODE_LENGTH = 7  # 62^7 ≈ 3.5e12: unguessable enough to not be enumerable by accident

# Created as soon as the number is set, in this order.
AUTO_SOURCES: tuple[tuple[str, str], ...] = (
    ("default", "הקישור הכללי"),
    ("ig-bio", "הביו באינסטגרם"),
    ("story", "סטורי"),
    ("gbp", "הכרטיס של העסק בגוגל"),
)
AUTO_KEYS = tuple(key for key, _ in AUTO_SOURCES)

# The short code the customer's message carries, so the owner sees the source in the chat.
FIXED_TAGS = {"default": "WA", "ig-bio": "IG-BIO", "story": "STORY", "gbp": "GOOGLE", "fb-post": "FB-POST"}

DEFAULT_TEXT_HE = "היי, אשמח לפרטים"
MAX_TEXT = 300

SOURCE_KEY_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,47}$")
POST_KEY_RE = re.compile(r"^(ig|fb|wa|tt)-post-(\d{6})-(\d{1,3})$")
OUTLET_PREFIX = {"instagram": "ig", "facebook": "fb", "whatsapp": "wa", "tiktok": "tt"}
OUTLET_HE = {"ig": "אינסטגרם", "fb": "פייסבוק", "wa": "וואטסאפ", "tt": "טיקטוק"}

INVALID_NUMBER_HE = "המספר לא נראה כמו מספר ישראלי. כתבו אותו כך: 050-1234567, או ‎+972501234567."
INVALID_SOURCE_HE = "שם המקור יכול לכלול רק אותיות באנגלית, ספרות ומקפים, למשל ig-bio."
NO_NUMBER_HE = "עוד לא הגדרתם את מספר הוואטסאפ של העסק."


# --- the number ------------------------------------------------------------------------

class InvalidNumber(ValueError):
    pass


def normalize_israeli_number(raw: str) -> str:
    """Any common way of writing an Israeli number → E.164, e.g. "+972501234567".

    Accepts 050-1234567, 050 123 4567, (050)1234567, +972-50-1234567, 972501234567,
    00972501234567 and +972 0 50… (a stray trunk zero). Mobile (05X), VoIP (07X) and
    landline (02/03/04/08/09) numbers are accepted, because WhatsApp Business also runs on
    landlines. Anything else raises InvalidNumber.
    """
    text = (raw or "").strip()
    if not text or len(text) > 32:
        raise InvalidNumber(INVALID_NUMBER_HE)
    if re.search(r"[^\d\s+().\-‎‏]", text):
        raise InvalidNumber(INVALID_NUMBER_HE)
    has_plus = text.lstrip("‎‏").startswith("+")
    digits = re.sub(r"\D", "", text)
    if digits.startswith("00972"):
        national = digits[5:]
    elif digits.startswith("972") and (has_plus or len(digits) in (11, 12, 13)):
        national = digits[3:]
    elif has_plus:
        # A plus with a country code that is not Israel's.
        raise InvalidNumber(INVALID_NUMBER_HE)
    else:
        national = digits
    national = national.lstrip("0")
    # Mobile 5X + 7 digits, VoIP 7X + 7 digits, landline area 2/3/4/8/9 + 7 digits.
    if re.fullmatch(r"5\d{8}", national) or re.fullmatch(r"7\d{8}", national) or re.fullmatch(
        r"[23489]\d{7}", national
    ):
        return f"+972{national}"
    raise InvalidNumber(INVALID_NUMBER_HE)


def wa_digits(e164: str) -> str:
    """wa.me wants the international number with no plus, spaces or dashes."""
    return re.sub(r"\D", "", e164 or "")


def display_number(e164: str | None) -> str:
    """"+972501234567" → "050-1234567", the way an Israeli writes it."""
    if not e164 or not e164.startswith("+972"):
        return e164 or ""
    national = "0" + e164[4:]
    if len(national) == 10:
        return f"{national[:3]}-{national[3:]}"
    return f"{national[:2]}-{national[2:]}"


def suggested_number(business: Business) -> str:
    """A number we already saw for this business (its links, or a wa.me link on the site),
    offered as a starting value. Never saved without the owner pressing save."""
    candidates: list[str] = []
    social = loads(business.social_links_json, {}) or {}
    if isinstance(social, dict) and isinstance(social.get("whatsapp"), str):
        candidates.append(social["whatsapp"])
    found = re.findall(
        r"(?:wa\.me/|api\.whatsapp\.com/send/?\?phone=)(\+?\d{9,15})", business.scraped_profile_json or ""
    )
    candidates.extend(found[:3])
    for candidate in candidates:
        match = re.search(r"(?:wa\.me/|phone=)?(\+?[\d\s\-()]{9,20})", candidate or "")
        if not match:
            continue
        try:
            return display_number(normalize_israeli_number(match.group(1)))
        except InvalidNumber:
            continue
    return ""


# --- links -------------------------------------------------------------------------------

def public_base_url() -> str:
    settings = get_settings()
    return (settings.public_base_url or settings.web_origin or settings.api_origin).rstrip("/")


def link_url(code: str) -> str:
    return f"{public_base_url()}/r/{code}"


def source_tag(source_key: str) -> str:
    """The code the customer's message carries: "IG-BIO", "IG-POST-3", "STORY"…"""
    if source_key in FIXED_TAGS:
        return FIXED_TAGS[source_key]
    post = POST_KEY_RE.match(source_key)
    if post:
        return f"{post.group(1).upper()}-POST-{int(post.group(3))}"
    return source_key.upper()[:20]


def prefilled_message(business: Business, link: WhatsappLink) -> str:
    text = (link.prefilled_text_he or business.whatsapp_default_text_he or DEFAULT_TEXT_HE).strip()
    return f"{text}\n(קוד: {source_tag(link.source_key)})"


def wa_url(business: Business, link: WhatsappLink) -> str:
    return f"https://wa.me/{wa_digits(business.whatsapp_number_e164 or '')}?text={quote(prefilled_message(business, link), safe='')}"


def _new_code(db: Session) -> str:
    for _ in range(12):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        if not db.query(WhatsappLink.id).filter(WhatsappLink.code == code).first():
            return code
    raise RuntimeError("לא הצלחנו ליצור קוד לקישור. נסו שוב.")


def validate_source_key(source_key: str) -> str:
    key = (source_key or "").strip().lower()
    if not SOURCE_KEY_RE.fullmatch(key):
        raise ValueError(INVALID_SOURCE_HE)
    return key


def default_label(source_key: str) -> str:
    for key, label in AUTO_SOURCES:
        if key == source_key:
            return label
    if source_key == "fb-post":
        return "פוסט בפייסבוק"
    post = POST_KEY_RE.match(source_key)
    if post:
        return f"פוסט {int(post.group(3))} ב{OUTLET_HE[post.group(1)]}"
    return source_key


def ensure_link(db: Session, business: Business, source_key: str, label_he: str = "") -> WhatsappLink:
    """The link for this source, created on first use. Idempotent per (business, source)."""
    key = validate_source_key(source_key)
    existing = (
        db.query(WhatsappLink)
        .filter(WhatsappLink.business_id == business.id, WhatsappLink.source_key == key)
        .first()
    )
    label = (label_he or "").strip()[:255]
    if existing:
        if label and existing.label_he != label:
            existing.label_he = label
            db.flush()
        return existing
    link = WhatsappLink(
        business_id=business.id,
        code=_new_code(db),
        source_key=key,
        label_he=label or default_label(key),
    )
    db.add(link)
    try:
        db.flush()
    except IntegrityError:
        # A concurrent request created the same source first; use that one.
        db.rollback()
        return (
            db.query(WhatsappLink)
            .filter(WhatsappLink.business_id == business.id, WhatsappLink.source_key == key)
            .one()
        )
    return link


def ensure_auto_links(db: Session, business: Business) -> None:
    for key, label in AUTO_SOURCES:
        ensure_link(db, business, key, label)


def set_number(db: Session, business: Business, number: str, default_text_he: str | None = None) -> None:
    """Save (or clear, with "") the number and the default text; create the fixed links."""
    if (number or "").strip():
        business.whatsapp_number_e164 = normalize_israeli_number(number)
    else:
        business.whatsapp_number_e164 = None
    if default_text_he is not None:
        business.whatsapp_default_text_he = default_text_he.strip()[:MAX_TEXT]
    db.flush()
    if business.whatsapp_number_e164:
        ensure_auto_links(db, business)
    db.commit()


# --- posts ---------------------------------------------------------------------------------

_WHATSAPP_WORDS = re.compile(r"וואטסאפ|ווטסאפ|וואצאפ|ווצאפ|whats\s?app|wa\.me", re.IGNORECASE)


def post_cta_is_whatsapp(post: dict) -> bool:
    """A post whose call to action sends people to WhatsApp — "כתבו לנו בוואטסאפ",
    "הזמינו מראש בוואטסאפ" — or that goes out on WhatsApp itself."""
    if not isinstance(post, dict):
        return False
    if str(post.get("cta_channel") or "").lower() == "whatsapp":
        return True
    if str(post.get("primary_outlet") or "").lower() == "whatsapp":
        return True
    return bool(_WHATSAPP_WORDS.search(str(post.get("cta") or "")))


def post_source_key(strategy: Strategy, index: int, post: dict) -> str:
    prefix = OUTLET_PREFIX.get(str(post.get("primary_outlet") or "").lower(), "ig")
    return f"{prefix}-post-{strategy.year}{strategy.month:02d}-{index + 1}"


def post_label(strategy: Strategy, index: int, post: dict) -> str:
    key = post_source_key(strategy, index, post)
    base = default_label(key)
    title = str(post.get("title") or "").strip()
    return f"{base}: {title}"[:255] if title else base


def link_for_post(db: Session, business: Business, strategy: Strategy, index: int, post: dict) -> WhatsappLink | None:
    """The post's own link when its CTA is WhatsApp and the number is set; else None."""
    if not business.whatsapp_number_e164 or not post_cta_is_whatsapp(post):
        return None
    return ensure_link(db, business, post_source_key(strategy, index, post), post_label(strategy, index, post))


# --- clicks ---------------------------------------------------------------------------------

_KNOWN_BOTS = re.compile(
    r"facebookexternalhit|facebookcatalog|meta-externalagent|meta-externalfetcher|whatsapp|"
    r"twitterbot|slackbot|slack-imgproxy|telegrambot|googlebot|google-inspectiontool|adsbot-google|"
    r"bingbot|bingpreview|applebot|discordbot|linkedinbot|pinterestbot|skypeuripreview|"
    r"yandex|baiduspider|duckduckbot|petalbot|embedly|iframely|vkshare|redditbot|"
    r"headlesschrome|lighthouse|python-requests|python-urllib|aiohttp|httpx|go-http-client|"
    r"java/|okhttp/|libwww|wget|curl/|node-fetch|axios/|undici",
    re.IGNORECASE,
)
_GENERIC_BOTS = re.compile(r"bot|crawler|crawling|spider|preview|scraper|fetcher", re.IGNORECASE)
# Real phones whose model name happens to contain "bot".
_BOT_FALSE_POSITIVES = re.compile(r"cubot", re.IGNORECASE)


def is_bot(user_agent: str) -> bool:
    ua = (user_agent or "").strip()
    if not ua:
        return True
    if _KNOWN_BOTS.search(ua):
        return True
    return bool(_GENERIC_BOTS.search(_BOT_FALSE_POSITIVES.sub("", ua)))


def ua_family(user_agent: str) -> str:
    """The only thing kept from the user agent: one of six coarse buckets."""
    ua = user_agent or ""
    if "Instagram" in ua:
        return "instagram"
    if re.search(r"FBAN|FBAV|FB_IAB|FBIOS", ua):
        return "facebook"
    if re.search(r"iPhone|iPad|iPod", ua):
        return "ios"
    if "Android" in ua:
        return "android"
    if re.search(r"Windows NT|Macintosh|X11|CrOS|Linux x86_64", ua):
        return "desktop"
    return "other"


def is_prefetch(headers) -> bool:
    for name in ("purpose", "sec-purpose", "x-purpose", "x-moz"):
        if "prefetch" in (headers.get(name) or "").lower() or "preview" in (headers.get(name) or "").lower():
            return True
    return False


def israel_today() -> date:
    return datetime.now(ISRAEL).date()


def should_count(method: str, headers) -> bool:
    if method.upper() != "GET":
        return False
    if is_prefetch(headers):
        return False
    return not is_bot(headers.get("user-agent") or "")


def record_click(db: Session, link: WhatsappLink, user_agent: str) -> bool:
    """Add one to today's bucket for this link. False when over the per-minute cap."""
    limit = max(1, get_settings().whatsapp_clicks_per_minute)
    if not ratelimit.allow(f"wa-click:{link.code}", limit, 60):
        return False
    day = israel_today().isoformat()
    family = ua_family(user_agent)
    for _ in range(2):
        row = (
            db.query(WhatsappClick)
            .filter(WhatsappClick.link_id == link.id, WhatsappClick.day == day, WhatsappClick.ua_family == family)
            .first()
        )
        if row:
            row.count = (row.count or 0) + 1
        else:
            db.add(WhatsappClick(business_id=link.business_id, link_id=link.id, day=day, ua_family=family, count=1))
        try:
            db.commit()
            return True
        except IntegrityError:
            db.rollback()
    return False


# --- the read ------------------------------------------------------------------------------

def _order(link: WhatsappLink) -> tuple:
    if link.source_key in AUTO_KEYS:
        return (0, AUTO_KEYS.index(link.source_key), link.id)
    return (1, 0, link.id)


def summary(db: Session, business: Business, today: date | None = None) -> dict:
    today = today or israel_today()
    since = (today - timedelta(days=6)).isoformat()
    links = db.query(WhatsappLink).filter(WhatsappLink.business_id == business.id).all()
    totals: dict[int, int] = {}
    recent: dict[int, int] = {}
    families: dict[str, int] = {}
    rows = (
        db.query(WhatsappClick.link_id, WhatsappClick.day, WhatsappClick.ua_family, func.sum(WhatsappClick.count))
        .filter(WhatsappClick.business_id == business.id)
        .group_by(WhatsappClick.link_id, WhatsappClick.day, WhatsappClick.ua_family)
        .all()
    )
    for link_id, day, family, count in rows:
        count = int(count or 0)
        totals[link_id] = totals.get(link_id, 0) + count
        if day >= since:
            recent[link_id] = recent.get(link_id, 0) + count
        families[family] = families.get(family, 0) + count
    number = business.whatsapp_number_e164
    return {
        "number_e164": number,
        "number_display": display_number(number),
        "suggested_number": "" if number else suggested_number(business),
        "default_text_he": business.whatsapp_default_text_he or "",
        "default_text_fallback_he": DEFAULT_TEXT_HE,
        "public_base_url": public_base_url(),
        "links": [
            {
                "code": link.code,
                "source_key": link.source_key,
                "label_he": link.label_he,
                "tag": source_tag(link.source_key),
                "url": link_url(link.code),
                "clicks_7d": recent.get(link.id, 0),
                "clicks_total": totals.get(link.id, 0),
            }
            for link in sorted(links, key=_order)
        ],
        "clicks_by_family": families,
        "clicks_7d": sum(recent.values()),
        "clicks_total": sum(totals.values()),
    }


def public_link(business: Business, link: WhatsappLink) -> dict:
    return {
        "code": link.code,
        "source_key": link.source_key,
        "label_he": link.label_he,
        "tag": source_tag(link.source_key),
        "url": link_url(link.code),
    }
