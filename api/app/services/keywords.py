"""Search demand signals for Google — real queries, never invented volumes.

Two things live here, and both are deliberately humble:

1. **Autocomplete.** Google's public suggest endpoint returns the phrases people
   actually type. It is a real signal and it is free, but it is *only* a list of
   phrases: it says nothing about how many people search them. So nothing in this
   module converts a suggestion into a number, and the payload says so out loud.

2. **Search Console.** The queries the site already appears for, with real clicks,
   impressions, CTR and position. This is the only place in the product where a real
   Google demand number can come from, and only when the owner has connected the
   account. Without it, the endpoint still works on autocomplete alone and says that
   the numbers are missing.

What is banned here: search volume. There is no Keyword Planner access, so "1,300
searches a month" would be a fabrication. If we do not have the number, the response
carries `available: false` and a note, not a guess.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from urllib.parse import quote, urlparse

import httpx

SUGGEST_ENDPOINT = "https://suggestqueries.google.com/complete/search"
SUGGEST_DEFAULTS = {"client": "firefox", "hl": "he", "gl": "il"}
SUGGEST_TIMEOUT_SECONDS = 6.0

SEARCH_CONSOLE_API = "https://www.googleapis.com/webmasters/v3"
SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
SEARCH_CONSOLE_DAYS = 28
SEARCH_CONSOLE_ROW_LIMIT = 100
SEARCH_CONSOLE_TIMEOUT_SECONDS = 15.0

# "Quick win" = a real query with real impressions sitting just off the first page.
# These two numbers are a product display rule (which rows are worth showing), not a
# market statistic, and they are reported back in `thresholds` so the UI can be honest
# about why a row was picked or dropped.
QUICK_WIN_POSITION = (5.0, 20.0)
QUICK_WIN_MIN_IMPRESSIONS = 50

# --- intent rules --------------------------------------------------------------------
# Order = precedence. Brand and location are the strongest signals ("ספרות של מספרה
# בתל אביב" is about this business in this city); then the action words, then the
# evaluation words, then research. The rules are fixed Hebrew lists — cheap, testable
# and explainable, with no model and no score to argue with.
INTENTS = ("branded", "local", "transactional", "commercial", "informational", "general")
INTENT_LABELS = {
    "branded": "מיתוג (שם העסק)",
    "local": "מקומי",
    "transactional": "כוונת קנייה",
    "commercial": "בחינה והשוואה",
    "informational": "מידע",
    "general": "כללי",
}

# The rules are explicit word lists, not stems: Hebrew inflects the end of a word
# (מומלץ / מומלצים) and a substring match cannot see through that. Common inflections are
# listed next to their singular, and an unusual one falls through to "general" — a label
# that is honest about not knowing beats a stemmer that guesses.
TRANSACTIONAL_WORDS = (
    "קנה", "לקנות", "קנייה", "קניות", "רכישה", "לרכוש", "מחיר", "מחירים", "מחירון", "עלות",
    "עלויות", "כמה עולה", "הזמנה", "הזמנות", "להזמין", "משלוח", "משלוחים", "מבצע", "מבצעים",
    "ליד", "לידים", "זמין", "במלאי", "הנחה", "הנחות", "קופון", "קופונים", "מכירה", "מכירות",
    "תשלום", "חנות",
)
COMMERCIAL_WORDS = (
    "המלצה", "המלצות", "מומלץ", "מומלצת", "מומלצים", "מומלצות", "השוואה", "השוואות",
    "להשוות", "הטוב", "הטובים", "הכי טוב", "ביקורת", "ביקורות", "דירוג", "דירוגים",
    "חוות דעת", "סקירה", "סקירות", "אלטרנטיבה", "כדאי",
)
INFORMATIONAL_WORDS = (
    "איך", "מה", "למה", "מתי", "איפה", "מדריך", "מדריכים", "טיפים", "טיפ", "מידע", "הסבר",
    "הסברים", "שיטות", "דוגמאות", "יתרונות", "חסרונות", "רעיונות", "רעיון", "השראה", "למה כדאי",
)
LOCAL_WORDS = (
    "קרוב", "קרובה", "באזור", "בשכונ", "מקומי", "בסביבה", "בעיר", "במרכז",
    "בצפון", "בדרום", "בשרון", "בשפלה",
)
# "ליד" is a lead word in the product's vocabulary ("לידים לשיפוצים"), so it lives in the
# transactional list and not in the local one, even though it also means "near".

_QUOTE_CHARS = "״׳\"'`´()[]{}.,:;!?/\\|-–—"


def normalise_term(value: str) -> str:
    """Lowercase, drop quoting/punctuation, collapse spaces.

    Same rule as `google_cost` (kept local so this module does not depend on the cost
    model): נדל״ן, נדל"ן and נדלן are the same query, and so are עו״ד and עו"ד.
    """
    cleaned = (value or "").strip().lower()
    for char in _QUOTE_CHARS:
        cleaned = cleaned.replace(char, " ")
    return " ".join(cleaned.split())


def _contains(haystack: str, needle: str) -> bool:
    """Substring match, but short needles must align to word edges.

    Without this, "מה" fires inside "מהדורה" and "ליד" inside "לידור".
    """
    needle = normalise_term(needle)
    if not needle:
        return False
    if len(needle) >= 4:
        return needle in haystack
    return f" {needle} " in f" {haystack} "


# --- autocomplete --------------------------------------------------------------------

def _parse_suggest(payload: str) -> list[str]:
    """Parse Google's suggest response, and survive every shape it comes in.

    `client=firefox` returns `["seed", ["suggestion", ...]]`; the chrome-style clients
    return `["seed", [["suggestion", 0], ...], {...}]`. A blocked, empty or HTML
    response is not an error worth raising — it is "no suggestions".
    """
    try:
        data = json.loads(payload)
    except (TypeError, ValueError):
        return []
    if not isinstance(data, list) or len(data) < 2:
        return []
    raw = data[1]
    if not isinstance(raw, list):
        return []
    terms: list[str] = []
    for item in raw:
        if isinstance(item, str):
            term = item
        elif isinstance(item, list) and item and isinstance(item[0], str):
            term = item[0]
        else:
            continue
        term = term.strip()
        if term:
            terms.append(term)
    return terms


def autocomplete(
    seed: str,
    *,
    hl: str = SUGGEST_DEFAULTS["hl"],
    gl: str = SUGGEST_DEFAULTS["gl"],
    client: str = SUGGEST_DEFAULTS["client"],
    limit: int = 10,
    timeout: float = SUGGEST_TIMEOUT_SECONDS,
) -> list[str]:
    """Real queries people type for this seed, or [] if Google cannot be reached.

    Never raises. An unreachable suggest endpoint is a degraded answer, not a 500 —
    the endpoint that calls this still has Search Console data and the rest of the plan.
    """
    seed = (seed or "").strip()
    if len(seed) < 2:
        return []
    try:
        response = httpx.get(
            SUGGEST_ENDPOINT,
            params={"client": client, "hl": hl, "gl": gl, "q": seed},
            timeout=timeout,
            headers={"User-Agent": "isramarket/0.1 (+promotion-research)"},
        )
        if response.status_code >= 400:
            return []
        return _parse_suggest(response.text)[:limit]
    except Exception:
        # Deliberately broad: DNS failure, TLS failure, timeout and a truncated body are
        # all the same answer here — no suggestions right now.
        return []


def seeds_for(business: dict) -> list[str]:
    """The queries to ask Google about, built only from what the owner told us."""
    seeds: list[str] = []

    def add(value: str) -> None:
        value = " ".join((value or "").split())
        if len(value) >= 2 and normalise_term(value) not in {normalise_term(s) for s in seeds}:
            seeds.append(value)

    add(business.get("name") or "")
    add(business.get("business_type") or "")
    location = (business.get("location") or "").strip()
    add(location)
    offerings = _split_offerings(business.get("offerings") or "")
    for part in offerings:
        add(part)
    if location:
        for part in offerings[:2]:
            add(f"{part} {location}")
    for competitor in business.get("competitors") or []:
        if isinstance(competitor, dict):
            add(competitor.get("name") or "")
        elif isinstance(competitor, str):
            add(competitor)
    return seeds[:10]


def _split_offerings(value: str) -> list[str]:
    parts: list[str] = []
    for chunk in value.replace("|", ",").replace(";", ",").replace("\n", ",").split(","):
        chunk = " ".join(chunk.split())
        if len(chunk) >= 2:
            parts.append(chunk)
    return parts[:6]


# --- intent --------------------------------------------------------------------------

def _brand_terms(business: dict) -> list[str]:
    """The words that make a query "about this business".

    Only the full name and tokens of four characters or more count. A bakery called
    "מאפיית לחם תום" must not turn every query containing "לחם" (bread) into a branded
    query — a brand rule that fires on the product is not a brand rule.
    """
    terms: list[str] = []
    name = normalise_term(business.get("name") or "")
    if name:
        terms.append(name)
        terms += [token for token in name.split() if len(token) >= 4]
    host = _host_of(business.get("website_url") or "")
    if host:
        stem = normalise_term(host.split(".")[0])
        if len(stem) >= 3:
            terms.append(stem)
    return terms


# Hebrew attaches ב/ל/מ/ה/ו/כ/ש to the front of a word, so "לשיפוצי אבי" is the same
# brand query as "שיפוצי אבי". Nothing else may be attached.
_HEBREW_PREFIXES = "בלמהוכש"


def _matches_brand(text: str, brand: str) -> bool:
    """Brand matching with word boundaries.

    Plain substring matching is wrong in Hebrew: a business called "שיפוצי אבי" would
    claim every query containing "שיפוצים" (renovations). A single-word brand must
    therefore match a whole word, while a multi-word brand name may appear as a phrase.
    """
    brand = normalise_term(brand)
    if not brand:
        return False
    if " " in brand:
        return brand in text
    for token in text.split():
        if token == brand:
            return True
        if len(token) > len(brand) and token[0] in _HEBREW_PREFIXES and token[1:] == brand:
            return True
    return False


def classify_intent(term: str, business: dict | None = None) -> dict:
    """One primary intent plus a plain Hebrew label. Rule-based, no confidence score.

    Precedence (documented, not tuned): branded → local → transactional → commercial →
    informational → general. The first rule that fires wins, so a query that mentions the
    business name is branded even if it also contains "מחיר".
    """
    text = normalise_term(term)
    business = business or {}

    for brand_term in _brand_terms(business):
        if _matches_brand(text, brand_term):
            return {"intent": "branded", "label": INTENT_LABELS["branded"], "matched": [brand_term]}

    local_markers = list(LOCAL_WORDS)
    location = business.get("location") or ""
    if location:
        local_markers.insert(0, location)
        local_markers += [token for token in normalise_term(location).split() if len(token) >= 3]
    for marker in local_markers:
        if _contains(text, marker):
            return {"intent": "local", "label": INTENT_LABELS["local"], "matched": [marker]}

    for intent, words in (
        ("transactional", TRANSACTIONAL_WORDS),
        ("commercial", COMMERCIAL_WORDS),
        ("informational", INFORMATIONAL_WORDS),
    ):
        matched = [word for word in words if _contains(text, word)]
        if matched:
            return {"intent": intent, "label": INTENT_LABELS[intent], "matched": matched}

    return {"intent": "general", "label": INTENT_LABELS["general"], "matched": []}


# --- Search Console ------------------------------------------------------------------

def search_console_scope_granted(granted_scopes: list[str] | None) -> bool:
    """Whether the connected Google account granted the Search Console scope.

    Older connections have no stored scope list (the scope was added later). An unknown
    list is treated as "try it": the API call itself degrades to None on a 403, and
    refusing to try would hide Search Console from every connection made before today.
    """
    if not granted_scopes:
        return True
    return any(str(scope).rstrip("/").endswith("webmasters.readonly") for scope in granted_scopes)


def _host_of(url: str) -> str:
    """The bare hostname of a URL, tolerating missing schemes and `sc-domain:` forms."""
    value = (url or "").strip().lower()
    if value.startswith("sc-domain:"):
        value = value.split(":", 1)[1]
    if "//" not in value:
        value = f"//{value}"
    parsed = urlparse(value)
    host = (parsed.hostname or "").strip().lower()
    if not host:
        host = (parsed.path or "").strip("/").lower()
    return host.removeprefix("www.")


def site_for_website(sites: list, website_url: str) -> str | None:
    """Pick the Search Console property that belongs to this website.

    Handles both property forms: URL-prefix (`https://example.co.il/`) and domain
    (`sc-domain:example.co.il`). A domain property covers every subdomain, so it wins
    whenever it matches; otherwise the exact host wins, and a parent/child host match is
    the fallback.
    """
    target = _host_of(website_url)
    if not target:
        return None
    if isinstance(sites, dict):
        # Tolerate the raw Search Console payload as well as its `siteEntry` list.
        sites = sites.get("siteEntry") or sites.get("sites") or []
    fallback: str | None = None
    for entry in sites or []:
        if isinstance(entry, dict):
            site_url = str(entry.get("siteUrl") or "")
        else:
            site_url = str(entry or "")
        if not site_url:
            continue
        if site_url.strip().lower().startswith("sc-domain:"):
            domain = _host_of(site_url)
            if domain and (target == domain or target.endswith(f".{domain}")):
                return site_url
            continue
        host = _host_of(site_url)
        if not host:
            continue
        if host == target:
            return site_url
        if fallback is None and (target.endswith(f".{host}") or host.endswith(f".{target}")):
            fallback = site_url
    return fallback


def _parse_search_rows(payload: dict) -> list[dict]:
    """Search Analytics rows → flat dicts. Unknown shapes produce an empty list."""
    rows = (payload or {}).get("rows")
    if not isinstance(rows, list):
        return []
    parsed: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        keys = row.get("keys") or []
        query = keys[0] if isinstance(keys, list) and keys else ""
        if not isinstance(query, str) or not query.strip():
            continue
        try:
            parsed.append(
                {
                    "query": query.strip(),
                    "clicks": int(row.get("clicks") or 0),
                    "impressions": int(row.get("impressions") or 0),
                    "ctr": round(float(row.get("ctr") or 0.0), 4),
                    "position": round(float(row.get("position") or 0.0), 1),
                }
            )
        except (TypeError, ValueError):
            continue
    return parsed


def quick_wins(
    rows: list[dict],
    *,
    min_impressions: int = QUICK_WIN_MIN_IMPRESSIONS,
    position_range: tuple[float, float] = QUICK_WIN_POSITION,
    limit: int = 10,
) -> list[dict]:
    """Queries with real impressions sitting just off page one — the actionable rows.

    A query at position 1-4 is already won and a query at 60 is not a quick win; between
    roughly 5 and 20, a better title, page or piece of content can move it, and that is
    work the owner can actually do this month.
    """
    wins: list[dict] = []
    for row in rows or []:
        try:
            position = float(row.get("position") or 0.0)
            impressions = int(row.get("impressions") or 0)
        except (TypeError, ValueError):
            continue
        if impressions < min_impressions:
            continue
        if not position_range[0] <= position <= position_range[1]:
            continue
        wins.append(
            {
                **row,
                "why": (
                    f"מקום {position:.1f} עם {impressions:,} חשיפות — קרוב לעמוד הראשון. "
                    "שיפור הכותרת, הדף או התוכן יכול להזיז אותו בלי לשלם על קליק."
                ),
            }
        )
    wins.sort(key=lambda item: (-int(item.get("impressions") or 0), float(item.get("position") or 0)))
    return wins[:limit]


def search_console_queries(
    access_token: str | None,
    website_url: str,
    *,
    days: int = SEARCH_CONSOLE_DAYS,
    row_limit: int = SEARCH_CONSOLE_ROW_LIMIT,
    today: date | None = None,
) -> dict | None:
    """The real queries this site already ranks for, or None.

    Returns None — never raises — when the account is not connected, when the token is
    rejected, when no Search Console property matches the site, or when Google answers
    with anything unexpected. The caller then reports `search_console_connected: false`
    and still serves the autocomplete keywords.
    """
    if not access_token:
        return None
    end = today or date.today()
    start = end - timedelta(days=days)
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        sites_response = httpx.get(
            f"{SEARCH_CONSOLE_API}/sites", headers=headers, timeout=SEARCH_CONSOLE_TIMEOUT_SECONDS
        )
        if sites_response.status_code >= 400:
            return None
        payload = sites_response.json()
        sites = payload.get("siteEntry") or payload.get("sites") or []
        if not isinstance(sites, list) or not sites:
            return None
        if website_url:
            site_url = site_for_website(sites, website_url)
        else:
            # No website on file: only an unambiguous single property is safe to query.
            site_url = str(sites[0].get("siteUrl") or "") if len(sites) == 1 and isinstance(sites[0], dict) else None
        if not site_url:
            return None

        query_response = httpx.post(
            f"{SEARCH_CONSOLE_API}/sites/{quote(site_url, safe='')}/searchanalytics/query",
            headers=headers,
            json={
                "startDate": start.isoformat(),
                "endDate": end.isoformat(),
                "dimensions": ["query"],
                "rowLimit": row_limit,
                "type": "web",
            },
            timeout=SEARCH_CONSOLE_TIMEOUT_SECONDS,
        )
        if query_response.status_code >= 400:
            return None
        rows = _parse_search_rows(query_response.json())
    except Exception:
        # Token refresh failures, DNS, TLS, timeouts and malformed JSON all degrade the
        # same way: no Search Console data, the rest of the answer still stands.
        return None

    return {
        "site_url": site_url,
        "period": {"start": start.isoformat(), "end": end.isoformat(), "days": days},
        "queries": rows,
        "quick_wins": quick_wins(rows),
        "thresholds": {"position": QUICK_WIN_POSITION, "min_impressions": QUICK_WIN_MIN_IMPRESSIONS},
    }


# --- assembly ------------------------------------------------------------------------

NO_VOLUME_NOTE = (
    "אין לנו גישה ל-Google Keyword Planner, ולכן אין במערכת נפח חיפוש חודשי. "
    "כל מספר כזה היה מומצא. מה שכן יש: ביטויים אמיתיים שאנשים מקלידים, ונתוני "
    "Search Console אם החשבון מחובר."
)
SEARCH_CONSOLE_MISSING_NOTE = (
    "חשבון Search Console לא מחובר, ולכן אין כאן את השאילתות שהאתר כבר מופיע בהן "
    "ואין נתוני קליקים, חשיפות ומיקום. אפשר לחבר אותו בעמוד החיבורים, ואז אותם "
    "ביטויים יופיעו עם מספרים אמיתיים."
)


def collect(
    business: dict,
    *,
    search_console: dict | None = None,
    search_console_note: str = "",
    suggest=None,
    max_keywords: int = 60,
) -> dict:
    """Assemble the keyword payload: autocomplete always, Search Console when it exists."""
    suggest = suggest or autocomplete
    seeds = seeds_for(business)
    keywords: dict[str, dict] = {}
    autocomplete_answered = False

    for seed in seeds:
        terms = suggest(seed) or []
        if terms:
            autocomplete_answered = True
        for term in terms:
            key = normalise_term(term)
            if not key or key in keywords:
                continue
            intent = classify_intent(term, business)
            keywords[key] = {
                "term": term,
                "intent": intent["intent"],
                "intent_label": intent["label"],
                "source": "autocomplete",
                "matched": intent["matched"],
            }

    console_rows = (search_console or {}).get("queries") or []
    for row in console_rows:
        query = str(row.get("query") or "").strip()
        key = normalise_term(query)
        if not key:
            continue
        numbers = {
            "clicks": int(row.get("clicks") or 0),
            "impressions": int(row.get("impressions") or 0),
            "ctr": row.get("ctr"),
            "position": row.get("position"),
        }
        if key in keywords:
            keywords[key].update(numbers)
            keywords[key]["source"] = "autocomplete+search_console"
        else:
            intent = classify_intent(query, business)
            keywords[key] = {
                "term": query,
                "intent": intent["intent"],
                "intent_label": intent["label"],
                "source": "search_console",
                "matched": intent["matched"],
                **numbers,
            }

    ordered = sorted(
        keywords.values(),
        key=lambda item: (item["source"] != "autocomplete+search_console", item["source"] == "search_console"),
    )[:max_keywords]

    connected = search_console is not None
    return {
        "keywords": ordered,
        "quick_wins": (search_console or {}).get("quick_wins") or [],
        "search_console_connected": connected,
        "seeds": seeds,
        "sources": {
            "autocomplete": {
                "available": autocomplete_answered,
                "endpoint": SUGGEST_ENDPOINT,
                "note": (
                    "השלמות החיפוש של גוגל: ביטויים אמיתיים שאנשים מקלידים. אלה ביטויים, "
                    "לא נפחים — אין כאן מספר חיפושים."
                    if autocomplete_answered
                    else "לא הצלחנו להגיע להשלמות החיפוש של גוגל כרגע. אפשר לנסות שוב; "
                    "שום דבר אחר לא נשבר."
                ),
            },
            "search_console": {
                "connected": connected,
                "site_url": (search_console or {}).get("site_url", ""),
                "period": (search_console or {}).get("period") or {},
                "note": (
                    "מחובר: אלה שאילתות אמיתיות שהאתר כבר מופיע בהן, עם קליקים, חשיפות "
                    "ומיקום אמיתיים מגוגל."
                    if connected
                    else (search_console_note or SEARCH_CONSOLE_MISSING_NOTE)
                ),
            },
            "search_volumes": {"available": False, "note": NO_VOLUME_NOTE},
        },
        "thresholds": {
            "quick_win_position": QUICK_WIN_POSITION,
            "quick_win_min_impressions": QUICK_WIN_MIN_IMPRESSIONS,
        },
    }
