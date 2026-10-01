"""The ongoing research engine: what changed around the business, and what it means.

The owner's words: the posts are execution; the plan, the strategy and the *ongoing
research* are the product. This module is that research. One run gathers **findings**
from five sources, then one strategy-model call turns them into 3–6 **insights**
("מה למדנו"), each with what it should change in the plan ("מה זה משנה").

Sources, and exactly what each one is today:

- ``competitors`` — recent public posts of the competitor Instagram accounts the owner
  named (Meta Business Discovery: public like/comment counts only, no reach). Works only
  with a connected Instagram account; otherwise an honest "not connected" status. Plus
  the competitors' homepages, read with the scraper's SSRF-guarded capped fetch, and
  diffed against the previous run (title, offers, prices, headings).
- ``search`` — Google autocomplete (hl=he, gl=il): real phrases Israelis type, with
  **no volume**. Search Console (real clicks / impressions / position for the queries the
  site already appears in) when Google is connected with that permission. Google Ads CPC
  ranges from a published Israeli agency table are included and labelled *estimate*.
  No search-volume number exists anywhere in the app, and none is invented here.
- ``calendar`` — Israeli holidays, memorial days, shopping days and school dates in the
  next six weeks (`calendar_il`, computed locally), big shopping days up to ten weeks out
  as "prepare", and what the business planned / measured around the same event before.
- ``own_results`` — the business's own synced Instagram posts, the GA4 / Meta
  performance snapshots, and what happened to last month's plan. Only synced data; when
  nothing is synced the finding says what is not measured.
- ``presence`` — the business's own homepage (basics such as a WhatsApp link, a phone,
  opening hours, social links; changes since the last run), its stored social links and
  which platforms we can actually see activity on.

Every finding carries an id (C1, S2, K3, R1, P4…), its source, a kind — ``fact``,
``change``, ``estimate`` or ``absence`` — the date the fact refers to, the time we
observed it and where it came from. Insights must cite finding ids; an insight whose
citations do not resolve is dropped, and one that leans only on estimates cannot be
"strong".
"""

from __future__ import annotations

import hashlib
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup, Comment
from sqlalchemy.orm import Session, object_session

from app.config import get_settings
from app.models import (
    Business,
    InstagramPost,
    PerformanceSnapshot,
    ResearchRun,
    Strategy,
)
from app.services import google_cost, instagram_signal, keywords, meta
from app.services.calendar_il import israeli_events_for_month
from app.services.gemini import strategy_json
from app.services.hebrew_style import HEBREW_STYLE
from app.services.jsonutil import dumps, loads
from app.services.month_loop import prior_month_review
from app.services.netguard import UnsafeUrlError, assert_public_url
from app.services.business_fields import field_label

SOURCES = ("competitors", "search", "calendar", "own_results", "presence")
SOURCE_LABEL_HE = {
    "competitors": "מתחרים",
    "search": "חיפושים בגוגל",
    "calendar": "לוח השנה",
    "own_results": "התוצאות שלכם",
    "presence": "האתר והרשתות שלכם",
}
_PREFIX = {"competitors": "C", "search": "S", "calendar": "K", "own_results": "R", "presence": "P"}
KINDS = ("fact", "change", "estimate", "absence")

# The owner may press "run research" this many times in a rolling 24 hours. The weekly
# job does not count: it is ours, not theirs.
MANUAL_RUNS_PER_DAY = 3
RATE_WINDOW = timedelta(hours=24)
# The weekly job skips a business that already has a run this recent.
WEEKLY_MIN_GAP = timedelta(days=6)

CALENDAR_WINDOW_DAYS = 42
SHOPPING_LOOKAHEAD_DAYS = 70

MAX_COMPETITOR_SITES = 3
MAX_SEARCH_SEEDS = 8
SUGGESTIONS_PER_SEED = 8

# One homepage per site, small: a research read is not a crawl.
PAGE_MAX_BYTES = 1_500_000
PAGE_DEADLINE_SECONDS = 12.0
PAGE_REQUEST_TIMEOUT = 8.0

# The plan prompt ignores research older than this — a stale "what we learned" is worse
# than none.
PROMPT_MAX_AGE_DAYS = 45

MIN_INSIGHTS, MAX_INSIGHTS = 3, 6


class ResearchRateLimited(Exception):
    """The owner ran research too often. Hebrew message; `retry_at` is UTC."""

    def __init__(self, message: str, retry_at: datetime):
        super().__init__(message)
        self.retry_at = retry_at


class PageReadError(RuntimeError):
    """A homepage we could not read. Hebrew message, safe to show."""


# --- findings -------------------------------------------------------------------------


class _Findings:
    """Collects findings for one source and numbers them C1, C2…"""

    def __init__(self, source: str, observed_at: datetime):
        self.source = source
        self.observed_at = observed_at.replace(microsecond=0).isoformat()
        self.items: list[dict] = []

    def add(self, kind: str, text_he: str, *, origin: str, date_ref: str = "", data: dict | None = None) -> dict:
        if kind not in KINDS:
            raise ValueError(kind)
        item = {
            "id": f"{_PREFIX[self.source]}{len(self.items) + 1}",
            "source": self.source,
            "kind": kind,
            "text_he": " ".join((text_he or "").split()),
            "date": date_ref,
            "observed_at": self.observed_at,
            "origin": origin,
            "data": data or {},
        }
        self.items.append(item)
        return item


def _status(state: str, note_he: str, *, needs: list[str] | None = None, provider: str = "") -> dict:
    """Per-source status. state: ok | partial | empty | not_connected | error."""
    return {"state": state, "note_he": note_he, "needs": needs or [], "provider": provider}


def _d(value: date | datetime | str | None) -> str:
    """7.10.2026 — how an Israeli writes a date."""
    if isinstance(value, str):
        parsed = _parse_date(value)
        if not parsed:
            return value
        value = parsed
    if isinstance(value, datetime):
        value = value.date()
    if not value:
        return ""
    return f"{value.day}.{value.month}.{value.year}"


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    raw = str(value).strip()
    try:
        return datetime.strptime(raw, "%Y-%m-%dT%H:%M:%S%z").date()
    except ValueError:
        pass
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except ValueError:
        pass
    try:
        return datetime.strptime(raw[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _num(value) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _posts_he(count: int) -> str:
    return "פוסט אחד" if count == 1 else f"{count} פוסטים"


def _fmt(value: int | float | None) -> str:
    if value is None:
        return "לא נמדד"
    return f"{int(value):,}"


# --- page snapshots (competitor and own homepages) ------------------------------------

_PRICE_RE = re.compile(
    r"(?:₪\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)"
    r"|(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s?(?:₪|ש\"ח|ש״ח|שח(?![֐-׿])|NIS|ils))",
    re.I,
)
_OFFER_RE = re.compile(
    r"מבצע|מבצעים|הנחה|הנחות|\d+\s?%|%\s?\d+|1\s?\+\s?1|\d+\s?ב\s?[-־]?\s?\d+|משלוח חינם|חינם|קופון|"
    r"סייל|\bsale\b|מתנה|השקה|קולקציה חדשה|עד גמר המלאי|לזמן מוגבל|רק השבוע|חיסול",
    re.I,
)
_HOURS_RE = re.compile(
    r"שעות\s?(?:ה)?(?:פתיחה|פעילות)|א[׳']\s?[-–]\s?ה[׳']|ימים\s?א[׳']|\b\d{1,2}:\d{2}\s?[-–]\s?\d{1,2}:\d{2}\b"
)
_PHONE_RE = re.compile(r"(?<!\d)(?:0\d{1,2}[-\s]?\d{3}[-\s]?\d{4}|\*\d{4})(?!\d)")
_SOCIAL_HOSTS = {
    "instagram": ("instagram.com", "instagr.am"),
    "facebook": ("facebook.com", "fb.com", "fb.me"),
    "tiktok": ("tiktok.com",),
    "youtube": ("youtube.com", "youtu.be"),
}
_WHATSAPP_HREF = ("wa.me/", "api.whatsapp.com", "whatsapp://", "web.whatsapp.com", "chat.whatsapp.com")


def _host(url: str) -> str:
    host = (urlparse(url if "://" in url else f"https://{url}").hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def _norm_url(url: str) -> str:
    raw = (url or "").strip()
    if not raw:
        return ""
    if "://" not in raw:
        raw = "https://" + raw
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return ""
    return f"{parsed.scheme}://{parsed.hostname.lower()}{parsed.path or '/'}"


def _fetch_html(url: str) -> tuple[str, str]:
    """(final_url, html) of one page, SSRF-guarded, capped in bytes and time."""
    target = _norm_url(url)
    if not target:
        raise PageReadError(f"הכתובת '{url}' לא נראית כמו כתובת אתר.")
    try:
        assert_public_url(target)
        from app.services import scraper  # read-only use of the scraper's guarded fetch

        user_agent = getattr(scraper, "USER_AGENT", "IsraMarketBot/1.0")
        deadline = time.monotonic() + PAGE_DEADLINE_SECONDS
        with httpx.Client(timeout=PAGE_REQUEST_TIMEOUT, headers={"User-Agent": user_agent}) as client:
            capped = getattr(scraper, "capped_get", None)
            if capped is not None:
                response = capped(
                    client,
                    target,
                    max_bytes=PAGE_MAX_BYTES,
                    deadline=deadline,
                    request_timeout=PAGE_REQUEST_TIMEOUT,
                )
            else:  # pragma: no cover - only if the scraper stops exporting it
                from app.services.netguard import safe_get

                response = safe_get(client, target)
    except UnsafeUrlError as exc:
        raise PageReadError(str(exc)) from exc
    except httpx.HTTPError as exc:
        raise PageReadError(f"לא הצלחנו לטעון את {_host(target)} כרגע.") from exc
    except PageReadError:
        raise
    except Exception as exc:  # budget exceeded and anything else the fetch raises
        raise PageReadError(f"לא הצלחנו לקרוא את {_host(target)} כרגע ({type(exc).__name__}).") from exc
    if response.status_code >= 400:
        raise PageReadError(f"האתר {_host(target)} החזיר שגיאה (קוד {response.status_code}).")
    return str(response.url or target), response.text


def _short(text: str, limit: int = 120) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _price_context(node) -> str:
    """The nearest ancestor text that says what the price is for (a product line)."""
    current = node.parent
    for _ in range(4):
        if current is None:
            break
        text = " ".join(current.get_text(" ", strip=True).split())
        if 12 <= len(text) <= 160:
            return text
        if len(text) > 160:
            break
        current = current.parent
    return " ".join(str(node).split())


def parse_page_snapshot(url: str, html: str, fetched_at: datetime | None = None) -> dict:
    """What a strategist would notice on a homepage, as comparable lists."""
    soup = BeautifulSoup(html or "", "lxml")
    links = [(a.get("href") or "").strip() for a in soup.find_all("a")]
    for tag in soup(["script", "style", "noscript", "svg", "iframe", "template"]):
        tag.decompose()

    title = _short(soup.title.get_text(" ", strip=True) if soup.title else "", 160)
    meta_description = ""
    for name in ("description", "og:description"):
        node = soup.find("meta", attrs={"name": name}) or soup.find("meta", attrs={"property": name})
        if node and node.get("content"):
            meta_description = _short(str(node["content"]), 300)
            break

    headings: list[str] = []
    for node in soup.find_all(["h1", "h2", "h3"]):
        text = _short(node.get_text(" ", strip=True), 100)
        if text and text not in headings:
            headings.append(text)

    offers: list[str] = []
    prices: list[dict] = []
    seen_prices: set[str] = set()
    for node in soup.find_all(string=True):
        if isinstance(node, Comment):
            continue
        text = " ".join(str(node).split())
        if not (2 <= len(text) <= 160):
            continue
        for match in _PRICE_RE.finditer(text):
            value = (match.group(1) or match.group(2) or "").replace(",", "")
            context = _short(_price_context(node), 120)
            key = f"{value}|{context}"
            if value and key not in seen_prices and len(prices) < 20:
                seen_prices.add(key)
                prices.append({"value": value, "context": context})
        if len(text) >= 4 and _OFFER_RE.search(text):
            short = _short(text, 120)
            if short not in offers and len(offers) < 15:
                offers.append(short)

    body_text = " ".join(soup.get_text(" ", strip=True).split())
    social: dict[str, str] = {}
    whatsapp_link = False
    phone_link = False
    for href in links:
        low = href.lower()
        if any(marker in low for marker in _WHATSAPP_HREF):
            whatsapp_link = True
        if low.startswith("tel:"):
            phone_link = True
        if low.startswith(("http://", "https://", "//")):
            host = _host(low if not low.startswith("//") else "https:" + low)
            for network, hosts in _SOCIAL_HOSTS.items():
                if network in social:
                    continue
                if any(host == item or host.endswith("." + item) for item in hosts) and "sharer" not in low and "/share" not in low:
                    social[network] = href[:300]

    return {
        "url": url,
        "fetched_at": (fetched_at or datetime.utcnow()).replace(microsecond=0).isoformat(),
        "title": title,
        "meta_description": meta_description,
        "headings": headings[:20],
        "offers": offers,
        "prices": prices,
        "basics": {
            "whatsapp_link": whatsapp_link,
            "whatsapp_mention": bool(re.search(r"וואטסאפ|ווטסאפ|whatsapp", body_text, re.I)),
            "phone": phone_link or bool(_PHONE_RE.search(body_text)),
            "hours": bool(_HOURS_RE.search(body_text)),
        },
        "social": social,
        "text_hash": hashlib.sha1(body_text.encode("utf-8")).hexdigest(),
        "text_chars": len(body_text),
    }


def fetch_page_snapshot(url: str) -> dict:
    """Read one homepage into a snapshot. Raises `PageReadError` (Hebrew)."""
    final_url, html = _fetch_html(url)
    return parse_page_snapshot(final_url, html)


def diff_snapshots(old: dict | None, new: dict) -> dict:
    """What changed on a page between two runs, in the terms a strategist cares about."""
    if not old:
        return {"baseline": True, "has_changes": False}

    def added(key: str) -> list:
        before = {str(item) for item in old.get(key) or []}
        return [item for item in new.get(key) or [] if str(item) not in before]

    def removed(key: str) -> list:
        after = {str(item) for item in new.get(key) or []}
        return [item for item in old.get(key) or [] if str(item) not in after]

    def price_key(item: dict) -> str:
        return f"{item.get('value')}|{item.get('context')}"

    old_prices = {price_key(item): item for item in old.get("prices") or []}
    new_prices = {price_key(item): item for item in new.get("prices") or []}
    old_basics, new_basics = old.get("basics") or {}, new.get("basics") or {}
    diff = {
        "baseline": False,
        "since": old.get("fetched_at") or "",
        "title": [old.get("title"), new.get("title")] if old.get("title") != new.get("title") else None,
        "meta_description": [old.get("meta_description"), new.get("meta_description")]
        if old.get("meta_description") != new.get("meta_description")
        else None,
        "headings_added": added("headings")[:8],
        "headings_removed": removed("headings")[:8],
        "offers_added": added("offers")[:8],
        "offers_removed": removed("offers")[:8],
        "prices_added": [new_prices[key] for key in new_prices if key not in old_prices][:10],
        "prices_removed": [old_prices[key] for key in old_prices if key not in new_prices][:10],
        "basics_changed": {
            key: [old_basics.get(key), new_basics.get(key)]
            for key in new_basics
            if key in old_basics and old_basics.get(key) != new_basics.get(key)
        },
        "text_changed": old.get("text_hash") != new.get("text_hash"),
    }
    diff["has_changes"] = any(
        diff[key]
        for key in (
            "title",
            "meta_description",
            "headings_added",
            "headings_removed",
            "offers_added",
            "offers_removed",
            "prices_added",
            "prices_removed",
            "basics_changed",
        )
    )
    return diff


def _diff_text_he(name: str, diff: dict) -> str:
    parts: list[str] = []
    if diff.get("title"):
        parts.append(f"הכותרת השתנתה מ-\"{diff['title'][0]}\" ל-\"{diff['title'][1]}\"")
    if diff.get("offers_added"):
        parts.append("מבצעים או הצעות חדשים: " + " | ".join(diff["offers_added"][:4]))
    if diff.get("offers_removed"):
        parts.append("ירדו מהעמוד: " + " | ".join(diff["offers_removed"][:3]))
    if diff.get("prices_added"):
        parts.append(
            "מחירים חדשים בעמוד: "
            + " | ".join(f"{item['value']} ₪ ({item['context']})" for item in diff["prices_added"][:4])
        )
    if diff.get("prices_removed"):
        parts.append(
            "מחירים שירדו: " + " | ".join(f"{item['value']} ₪ ({item['context']})" for item in diff["prices_removed"][:3])
        )
    if diff.get("headings_added"):
        parts.append("כותרות חדשות: " + " | ".join(diff["headings_added"][:4]))
    if diff.get("meta_description") and not diff.get("title"):
        parts.append("תיאור האתר בגוגל השתנה")
    basics = diff.get("basics_changed") or {}
    labels = {"whatsapp_link": "קישור לוואטסאפ", "phone": "טלפון", "hours": "שעות פתיחה", "whatsapp_mention": "אזכור וואטסאפ"}
    for key, (before, after) in basics.items():
        parts.append(f"{labels.get(key, key)}: {'נוסף' if after and not before else 'ירד'}")
    since = _d(diff.get("since"))
    return f"באתר של {name} מאז {since}: " + "; ".join(parts) + "."


# --- source: competitors ---------------------------------------------------------------


def _competitor_sites(business: Business) -> tuple[list[dict], list[str]]:
    """(competitors with a website, names without one)."""
    stored = loads(getattr(business, "competitors_json", "") or "[]", [])
    sites: list[dict] = []
    names: list[str] = []
    for item in stored if isinstance(stored, list) else []:
        if isinstance(item, str):
            if item.strip():
                names.append(item.strip())
            continue
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        url = _norm_url(str(item.get("website_url") or ""))
        if url and len(sites) < MAX_COMPETITOR_SITES:
            sites.append({"name": name or _host(url), "url": url})
        elif name:
            names.append(name)
    return sites, names


def _discovery_summary(handle: str, raw: dict, previous_ids: set[str], today: date) -> dict:
    """Recency, format mix and the top post of one competitor, from public data only."""
    parsed = instagram_signal.parse_discovery(handle, raw)
    media = (raw.get("media") or {}).get("data") if isinstance(raw.get("media"), dict) else []
    media = [item for item in media or [] if isinstance(item, dict)]
    dated = [(item, _parse_date(item.get("timestamp"))) for item in media]
    last_14 = [item for item, day in dated if day and (today - day).days <= 14]
    last_30 = [item for item, day in dated if day and (today - day).days <= 30]
    formats: dict[str, int] = {}
    for item in last_30:
        kind = instagram_signal.format_of(item.get("media_type"), item.get("media_product_type"))
        formats[kind] = formats.get(kind, 0) + 1
    newest = max((day for _, day in dated if day), default=None)
    new_ids = [str(item.get("id")) for item in media if item.get("id") and str(item.get("id")) not in previous_ids]
    top = (parsed.get("posts") or [None])[0]
    return {
        "handle": handle,
        "followers": (parsed.get("profile") or {}).get("followers_count"),
        "posts_seen": len(media),
        "posts_last_14d": len(last_14),
        "posts_last_30d": len(last_30),
        "formats_last_30d": formats,
        "newest_post": newest.isoformat() if newest else "",
        "media_ids": [str(item.get("id")) for item in media if item.get("id")],
        "new_since_last_run": len(new_ids) if previous_ids else None,
        "top_post": {
            "hook": top.get("hook"),
            "format": top.get("format"),
            "posted_at": top.get("posted_at"),
            "likes": (top.get("metrics") or {}).get("likes"),
            "comments": (top.get("metrics") or {}).get("comments"),
            "permalink": top.get("permalink"),
        }
        if top
        else None,
    }


def gather_competitors(db: Session, business: Business, ctx: dict) -> tuple[list[dict], dict, dict]:
    """(findings, status, state-for-next-run)."""
    out = _Findings("competitors", ctx["now"])
    today: date = ctx["today"]
    previous_state = (ctx.get("previous_state") or {}).get("competitors") or {}
    state: dict = {"sites": {}, "instagram": {}}
    handles = instagram_signal.handles_for(business)
    sites, names_only = _competitor_sites(business)
    connection = instagram_signal.meta_context(business) if handles else None
    needs: list[str] = []
    notes: list[str] = []
    ok_parts = 0

    # Instagram: Business Discovery.
    if handles and connection is None:
        needs.append("instagram_connection")
        out.add(
            "absence",
            f"שמרתם {len(handles)} חשבונות מתחרים באינסטגרם ({', '.join('@' + h for h in handles)}), "
            "אבל אינסטגרם לא מחובר, ולכן לא קראנו מה הם פרסמו.",
            origin="Meta Business Discovery",
        )
        notes.append("כדי לקרוא פוסטים של מתחרים צריך לחבר את אינסטגרם בעמוד החיבורים.")
    elif handles and connection:
        previous_ids = {
            handle: set(entry.get("media_ids") or [])
            for handle, entry in (previous_state.get("instagram") or {}).items()
        }
        stopped: tuple[str, str] | None = None
        for handle in handles[: instagram_signal.MAX_HANDLES]:
            if stopped:
                failure = instagram_signal._failed_handle(handle, *stopped)
                out.add("absence", failure["error_he"], origin=f"Meta Business Discovery @{handle}")
                continue
            try:
                raw = meta.business_discovery(
                    connection["instagram_id"], connection["access_token"], handle, instagram_signal.DISCOVERY_MEDIA_LIMIT
                )
            except meta.GraphError as exc:
                failure = instagram_signal._failed_handle(handle, exc.kind, str(exc))
                out.add("absence", failure["error_he"], origin=f"Meta Business Discovery @{handle}")
                if exc.kind in instagram_signal._STOP_KINDS:
                    stopped = (exc.kind, str(exc))
                continue
            summary = _discovery_summary(handle, raw, previous_ids.get(handle, set()), today)
            state["instagram"][handle] = {"media_ids": summary["media_ids"]}
            ok_parts += 1
            formats = ", ".join(
                f"{instagram_signal.FORMAT_HE.get(kind, kind)} {count}"
                for kind, count in sorted(summary["formats_last_30d"].items(), key=lambda kv: -kv[1])
            )
            top = summary["top_post"]
            text = (
                f"@{handle}: {summary['posts_last_14d']} פוסטים בשבועיים האחרונים, {summary['posts_last_30d']} בחודש"
                + (f" ({formats})" if formats else "")
                + (f". הפוסט האחרון: {_d(summary['newest_post'])}" if summary["newest_post"] else "")
            )
            if summary["new_since_last_run"] is not None:
                text += f". {summary['new_since_last_run']} פוסטים חדשים מאז הבדיקה הקודמת"
            if top:
                text += (
                    f". הכי הרבה תגובות מהקהל שלהם ({_fmt(top['likes'])} לייקים, {_fmt(top['comments'])} תגובות, "
                    f"{instagram_signal.FORMAT_HE.get(top['format'], top['format'])}, {_d(top['posted_at'])}): "
                    f"\"{_short(top['hook'] or '', 100)}\""
                )
            out.add(
                "change" if summary["new_since_last_run"] else "fact",
                text + ". (לייקים ותגובות ציבוריים בלבד — אין לנו כמה אנשים ראו.)",
                origin=f"Meta Business Discovery @{handle}",
                date_ref=summary["newest_post"],
                data={key: value for key, value in summary.items() if key != "media_ids"},
            )
    else:
        needs.append("competitor_handles")

    # Competitor websites: homepage diff since the previous run.
    previous_sites = previous_state.get("sites") or {}
    if sites:
        with ThreadPoolExecutor(max_workers=min(3, len(sites))) as pool:
            results = list(pool.map(lambda site: _safe_snapshot(site["url"]), sites))
        for site, (snapshot, error) in zip(sites, results):
            if error:
                out.add("absence", f"לא הצלחנו לקרוא את האתר של {site['name']}: {error}", origin=site["url"])
                continue
            ok_parts += 1
            key = _norm_url(site["url"])
            state["sites"][key] = snapshot
            diff = diff_snapshots(previous_sites.get(key), snapshot)
            if diff.get("baseline"):
                offers = " | ".join(snapshot["offers"][:4]) or "לא מצאנו מבצעים בעמוד הבית"
                prices = ", ".join(f"{p['value']} ₪" for p in snapshot["prices"][:6])
                out.add(
                    "fact",
                    f"קראנו את עמוד הבית של {site['name']} בפעם הראשונה (נקודת התחלה להשוואה): "
                    f"\"{snapshot['title']}\". מבצעים: {offers}."
                    + (f" מחירים בעמוד: {prices}." if prices else ""),
                    origin=snapshot["url"],
                    date_ref=snapshot["fetched_at"][:10],
                    data={"name": site["name"], "offers": snapshot["offers"][:8], "prices": snapshot["prices"][:8]},
                )
            elif diff.get("has_changes"):
                out.add(
                    "change",
                    _diff_text_he(site["name"], diff),
                    origin=snapshot["url"],
                    date_ref=snapshot["fetched_at"][:10],
                    data={"name": site["name"], "diff": diff},
                )
            else:
                out.add(
                    "fact",
                    f"באתר של {site['name']} לא השתנו מבצעים, מחירים או כותרות מאז {_d(diff.get('since'))}.",
                    origin=snapshot["url"],
                    date_ref=snapshot["fetched_at"][:10],
                    data={"name": site["name"], "diff": diff},
                )
    else:
        needs.append("competitor_websites")
    if names_only:
        out.add(
            "absence",
            f"ציינתם מתחרים בלי כתובת אתר ({', '.join(names_only[:5])}), ולכן לא בדקנו מה השתנה אצלם.",
            origin="פרטי העסק",
        )

    if not handles and not sites:
        status = _status(
            "empty",
            "עוד לא בחרתם מתחרים. הוסיפו עד 5 חשבונות אינסטגרם ועד 3 אתרים של מתחרים, ונבדוק כל שבוע מה הם מפרסמים ומה השתנה אצלם.",
            needs=needs,
        )
    elif ok_parts == 0:
        state_name = "not_connected" if "instagram_connection" in needs and not sites else "error"
        status = _status(
            state_name,
            " ".join(notes) or "לא הצלחנו לקרוא אף מתחרה הפעם. ננסה שוב בבדיקה הבאה.",
            needs=needs,
            provider="Meta Business Discovery + אתרי המתחרים",
        )
    else:
        partial = bool(notes) or any(item["kind"] == "absence" for item in out.items)
        status = _status(
            "partial" if partial else "ok",
            " ".join(notes) or "קראנו את המתחרים שבחרתם.",
            needs=needs if partial else [],
            provider="Meta Business Discovery + אתרי המתחרים",
        )
    return out.items, status, state


def _safe_snapshot(url: str) -> tuple[dict | None, str]:
    try:
        return fetch_page_snapshot(url), ""
    except PageReadError as exc:
        return None, str(exc)
    except Exception as exc:  # never let one site sink the run
        return None, f"שגיאה לא צפויה ({type(exc).__name__})"


# --- source: search --------------------------------------------------------------------


def _business_payload(business: Business) -> dict:
    return {
        "name": business.name,
        "website_url": business.website_url,
        "business_type": field_label(business.business_type),
        "offerings": business.offerings,
        "location": business.location,
        "presence_type": business.presence_type,
        "business_model": business.business_model or "products",
        "primary_goal": business.primary_goal,
        "monthly_budget_ils": business.monthly_budget_ils,
        "competitors": loads(getattr(business, "competitors_json", "") or "[]", []),
    }


def research_seeds(business: Business) -> list[str]:
    """What to ask Google about: the owner's words plus the categories read off the site."""
    seeds = keywords.seeds_for(_business_payload(business))
    scraped = loads(business.scraped_profile_json, {}) or {}
    offers = ((scraped.get("extracted") or {}).get("offers")) or []
    known = {keywords.normalise_term(seed) for seed in seeds}
    extra: list[str] = []
    for offer in offers:
        if isinstance(offer, str) and 2 <= len(offer.strip()) <= 40:
            key = keywords.normalise_term(offer)
            if key and key not in known:
                known.add(key)
                extra.append(offer.strip())
    # Category words first: "what people type after 'הלבשה תחתונה'" is demand for the
    # category; the owner's promo sentences rarely are.
    ordered = extra[:4] + seeds
    return ordered[:MAX_SEARCH_SEEDS]


def _search_console_for(business: Business) -> tuple[dict | None, str]:
    """Search Console via the promotion router's existing path (token refresh included)."""
    try:
        from app.routers.promotion import _search_console

        return _search_console(business)
    except Exception:
        return None, keywords.SEARCH_CONSOLE_MISSING_NOTE


def gather_search(db: Session, business: Business, ctx: dict) -> tuple[list[dict], dict, dict]:
    out = _Findings("search", ctx["now"])
    previous = ((ctx.get("previous_state") or {}).get("search") or {}).get("phrases") or {}
    seeds = research_seeds(business)
    per_seed: dict[str, list[str]] = {}

    def ask(seed: str) -> tuple[str, list[str]]:
        try:
            return seed, list(keywords.autocomplete(seed, limit=SUGGESTIONS_PER_SEED) or [])
        except Exception:
            return seed, []

    if seeds:
        with ThreadPoolExecutor(max_workers=min(6, len(seeds))) as pool:
            for seed, terms in pool.map(ask, seeds):
                per_seed[seed] = terms

    payload = _business_payload(business)
    answered = {seed: terms for seed, terms in per_seed.items() if terms}
    intents: dict[str, list[str]] = {}
    for seed, terms in answered.items():
        new_terms = []
        prior_terms = {keywords.normalise_term(t) for t in previous.get(seed) or []}
        for term in terms:
            label = keywords.classify_intent(term, payload)
            intents.setdefault(label["intent"], []).append(term)
            if previous and seed in previous and keywords.normalise_term(term) not in prior_terms:
                new_terms.append(term)
        out.add(
            "fact",
            f"מה שמקלידים בגוגל אחרי \"{seed}\": " + ", ".join(terms[:SUGGESTIONS_PER_SEED]) + ". (ביטויים אמיתיים, בלי מספר חיפושים.)",
            origin="Google autocomplete (hl=he, gl=il)",
            date_ref=ctx["today"].isoformat(),
            data={"seed": seed, "phrases": terms},
        )
        if new_terms:
            out.add(
                "change",
                f"ביטויים חדשים בהשלמה של גוגל ל-\"{seed}\" מאז הבדיקה הקודמת: " + ", ".join(new_terms[:6]) + ".",
                origin="Google autocomplete (hl=he, gl=il)",
                date_ref=ctx["today"].isoformat(),
                data={"seed": seed, "new_phrases": new_terms},
            )
    buying = intents.get("transactional", []) + intents.get("commercial", [])
    if answered and buying:
        out.add(
            "fact",
            f"{len(buying)} מתוך {sum(len(v) for v in answered.values())} הביטויים הם של מי שרוצה לקנות או להשוות "
            f"(למשל: {', '.join(buying[:4])}).",
            origin="Google autocomplete + סיווג לפי מילים (קבוע, בלי AI)",
            date_ref=ctx["today"].isoformat(),
            data={"intents": {key: len(value) for key, value in intents.items()}},
        )

    console, console_note = _search_console_for(business)
    needs: list[str] = []
    if console:
        queries = sorted(console.get("queries") or [], key=lambda row: -(row.get("impressions") or 0))[:5]
        period = console.get("period") or {}
        if queries:
            out.add(
                "fact",
                "החיפושים שהאתר כבר מופיע בהם בגוגל (28 ימים): "
                + "; ".join(
                    f"\"{row.get('query')}\" — {_fmt(row.get('impressions'))} חשיפות, {_fmt(row.get('clicks'))} קליקים, "
                    f"מקום {round(float(row.get('position') or 0), 1)}"
                    for row in queries
                )
                + ".",
                origin="Google Search Console",
                date_ref=str(period.get("end") or ""),
                data={"queries": queries, "period": period},
            )
        for row in (console.get("quick_wins") or [])[:3]:
            out.add(
                "fact",
                f"קרוב לעמוד הראשון: \"{row.get('query')}\" במקום {round(float(row.get('position') or 0), 1)} "
                f"עם {_fmt(row.get('impressions'))} חשיפות ב-28 ימים.",
                origin="Google Search Console",
                date_ref=str(period.get("end") or ""),
                data=row,
            )
    else:
        needs.append("google_search_console")
        out.add(
            "absence",
            "אין לנו את החיפושים שהאתר שלכם כבר מופיע בהם (קליקים, חשיפות, מיקום): " + (console_note or keywords.SEARCH_CONSOLE_MISSING_NOTE),
            origin="Google Search Console",
        )

    plan = google_cost.plan_for_business(payload)
    if plan.cpc_range:
        out.add(
            "estimate",
            f"הערכה, לא נתון שלכם: לפי טבלה מפורסמת של סוכנות ישראלית, קליק בגוגל בתחום \"{plan.industry_label}\" "
            f"עולה בערך {plan.cpc_range[0]:g}–{plan.cpc_range[1]:g} ₪.",
            origin=google_cost.SOURCE_URL,
            data={"industry": plan.industry_key, "cpc_range": list(plan.cpc_range), "tier": plan.industry_tier},
        )

    volume_note = (
        "אין לנו כמה אנשים מחפשים כל ביטוי (אין גישה לכלי תכנון המילים של גוגל), ולכן אין כאן מספרי חיפושים."
    )
    if not answered and not console:
        status = _status(
            "error",
            "לא הצלחנו לקבל כרגע את ההשלמות של גוגל, ו-Search Console לא מחובר. " + volume_note,
            needs=needs,
            provider="Google autocomplete",
        )
    else:
        status = _status(
            "ok" if console else "partial",
            ("ביטויים אמיתיים מההשלמה של גוגל" + (" ונתוני Search Console אמיתיים. " if console else ". ")) + volume_note,
            needs=needs,
            provider="Google autocomplete" + (" + Search Console" if console else ""),
        )
    return out.items, status, {"phrases": per_seed}


# --- source: calendar ------------------------------------------------------------------


def _events_between(start: date, end: date) -> list[dict]:
    months: list[tuple[int, int]] = []
    cursor = date(start.year, start.month, 1)
    while cursor <= end:
        months.append((cursor.year, cursor.month))
        cursor = date(cursor.year + (cursor.month == 12), cursor.month % 12 + 1, 1)
    events = []
    for year, month in months:
        for event in israeli_events_for_month(year, month):
            day = _parse_date(event.get("date"))
            if day and start <= day <= end:
                events.append({**event, "day": day})
    events.sort(key=lambda item: item["day"])
    return events


def _event_key(name: str) -> str:
    return re.sub(r"[\s\"'״׳()]+", "", (name or "").split("(")[0]).strip()


def _history_for(event: dict, strategies: list[Strategy], snapshots: list[PerformanceSnapshot]) -> dict | None:
    """What this business planned — and measured — around the same event before."""
    key = _event_key(event["name"])
    if len(key) < 3:
        return None
    for strategy in strategies:
        roadmap = (loads(strategy.roadmap_json, {}) or {}).get("roadmap") or {}
        match = next(
            (
                item
                for item in roadmap.get("relevant_events") or []
                if isinstance(item, dict) and key in _event_key(item.get("name") or "")
            ),
            None,
        )
        posts = [
            post
            for post in roadmap.get("posts") or []
            if key in _event_key(f"{post.get('title', '')} {post.get('why_now', '')}")
        ]
        if not match and not posts:
            continue
        when = _parse_date((match or {}).get("date")) if match else None
        measured = None
        if when:
            for snap in snapshots:
                start, end = _parse_date(snap.period_start), _parse_date(snap.period_end)
                if start and end and start <= when <= end:
                    overview = (loads(snap.ga4_json, {}) or {}).get("overview") or {}
                    measured = {
                        "period_start": snap.period_start,
                        "period_end": snap.period_end,
                        "sessions": _num(overview.get("sessions")),
                        "conversions": _num(overview.get("conversions")),
                    }
                    break
        return {
            "year": strategy.year,
            "month": strategy.month,
            "event_name": (match or {}).get("name") or event["name"],
            "relevance_tier": (match or {}).get("relevance_tier") or "",
            "posts_planned": len(posts),
            "posts_approved": sum(1 for post in posts if post.get("approval_status") == "approved"),
            "posts_published": sum(1 for post in posts if post.get("published_url") or post.get("published_at")),
            "measured": measured,
        }
    return None


def gather_calendar(db: Session, business: Business, ctx: dict) -> tuple[list[dict], dict, dict]:
    out = _Findings("calendar", ctx["now"])
    today: date = ctx["today"]
    window_end = today + timedelta(days=CALENDAR_WINDOW_DAYS)
    lookahead_end = today + timedelta(days=SHOPPING_LOOKAHEAD_DAYS)
    strategies = (
        db.query(Strategy)
        .filter(Strategy.business_id == business.id)
        .order_by(Strategy.year.desc(), Strategy.month.desc())
        .all()
    )
    snapshots = (
        db.query(PerformanceSnapshot)
        .filter(PerformanceSnapshot.business_id == business.id)
        .order_by(PerformanceSnapshot.created_at.desc())
        .all()
    )
    for event in _events_between(today, lookahead_end):
        day: date = event["day"]
        days_away = (day - today).days
        in_window = day <= window_end
        if not in_window and event.get("kind") != "קניות":
            continue
        when = "היום" if days_away == 0 else f"בעוד {days_away} ימים"
        caution = event.get("kind") == "זיכרון"
        text = f"{event['name']} — {_d(day)} ({when}). {event.get('note') or ''}"
        if not in_window:
            text = f"להתכונן מראש: {text}"
        history = _history_for(event, strategies, snapshots)
        if history:
            same_month = (history["year"], history["month"]) == (day.year, day.month)
            label = f"{history['month']}/{history['year']}"
            posts_line = (
                f"{_posts_he(history['posts_planned'])} ({history['posts_approved']} אושרו, "
                f"{history['posts_published']} פורסמו דרך המערכת)"
                if history["posts_planned"]
                else "בלי פוסט ייעודי"
            )
            measured = history.get("measured")
            measured_line = (
                f"בתקופה {_d(measured['period_start'])}–{_d(measured['period_end'])} היו באתר {_fmt(measured['sessions'])} כניסות "
                f"ו-{_fmt(measured['conversions'])} פניות או הזמנות (לכל התקופה, לא רק בגלל החג)."
                if measured
                else "אין מדידה מהתאריכים האלה."
            )
            text += (
                f" {'כבר בתוכנית של' if same_month else 'בעבר, בתוכנית של'} {label}: {posts_line}. {measured_line}"
            )
        out.add(
            "fact",
            text,
            origin="לוח השנה העברי (pyluach) + ימי קניות בישראל" if event.get("source") == "hebrew_calendar" else "ימי קניות ועונות בישראל (calendar_il)",
            date_ref=day.isoformat(),
            data={
                "name": event["name"],
                "kind": event.get("kind"),
                "days_away": days_away,
                "in_window": in_window,
                "no_promotions": caution,
                "history": history,
            },
        )
    if not out.items:
        out.add(
            "fact",
            f"אין חגים, ימי זיכרון או ימי קניות בשישה השבועות הקרובים (עד {_d(window_end)}). זמן טוב לשגרה ולבניית קהל.",
            origin="לוח השנה העברי (pyluach) + ימי קניות בישראל",
            date_ref=window_end.isoformat(),
        )
    status = _status(
        "ok",
        "חגים, ימי זיכרון, ימי קניות, פתיחת שנת הלימודים והחופש הגדול. חופשות בית ספר אחרות (חנוכה, פסח) לא מסומנות בנפרד.",
        provider="לוח שנה מקומי (pyluach)",
    )
    return out.items, status, {}


# --- source: own results ----------------------------------------------------------------


def _account_fact_he(account: dict) -> tuple[str, str]:
    """One sentence from `meta.account_digest`: only numbers Meta returned, and the change
    against the period before only where both periods have the number."""
    values, previous = account.get("values") or {}, account.get("previous") or {}
    parts = [
        f"{_fmt(values[key])} {meta.ACCOUNT_LABELS_HE[key]}"
        for key in ("reach", "accounts_engaged", "profile_links_taps")
        if _num(values.get(key)) is not None
    ]
    followers = _num(account.get("followers_count"))
    if followers is not None:
        net = _num(values.get("net_followers"))
        parts.append(f"{_fmt(followers)} עוקבים" + (f" ({net:+d} בתקופה)" if net is not None else ""))
    period = f"{_d(account.get('start'))}–{_d(account.get('end'))}" if account.get("start") else ""
    text = f"החשבון באינסטגרם{f' בין {period}' if period else ''}: " + (", ".join(parts) or "לא נמדד") + "."
    changes = []
    for key in ("reach", "accounts_engaged", "profile_links_taps"):
        now, before = _num(values.get(key)), _num(previous.get(key))
        if now is not None and before:
            changes.append(f"{meta.ACCOUNT_LABELS_HE[key]}: {_fmt(before)} ({round((now - before) / before * 100):+d}%)")
    if changes:
        text += f" ב-{account.get('days')} הימים שלפני: " + "; ".join(changes) + "."
        return text, "change"
    return text, "fact"


def gather_own_results(db: Session, business: Business, ctx: dict) -> tuple[list[dict], dict, dict]:
    out = _Findings("own_results", ctx["now"])
    measured = False
    needs: list[str] = []

    # Instagram: the business's own synced posts.
    synced = db.query(InstagramPost).filter(InstagramPost.business_id == business.id).count()
    if synced:
        posts = instagram_signal.own_posts(business, db)
        ranked = instagram_signal.rank_posts(posts, n=len(posts))
        if ranked:
            measured = True
            for post in ranked[:3]:
                out.add(
                    "fact",
                    f"פוסט שהצליח ({instagram_signal.FORMAT_HE.get(post['format'], post['format'])}, {_d(post['posted_at'])}): "
                    f"\"{_short(post['hook'], 90)}\" — {instagram_signal._metrics_line(post)}. דירוג לפי {post['score_basis_he']}.",
                    origin="Instagram Graph API (הפוסטים שלכם)",
                    date_ref=(post.get("posted_at") or "")[:10],
                    data={"media_id": post["media_id"], "metrics": post["metrics"], "score": post["score"], "basis": post["score_basis"]},
                )
            same_basis = [post for post in ranked if post["score_basis"] == ranked[0]["score_basis"]]
            if len(same_basis) >= 5:
                for post in same_basis[-2:]:
                    out.add(
                        "fact",
                        f"פוסט שהצליח פחות ({instagram_signal.FORMAT_HE.get(post['format'], post['format'])}, {_d(post['posted_at'])}): "
                        f"\"{_short(post['hook'], 90)}\" — {instagram_signal._metrics_line(post)}.",
                        origin="Instagram Graph API (הפוסטים שלכם)",
                        date_ref=(post.get("posted_at") or "")[:10],
                        data={"media_id": post["media_id"], "metrics": post["metrics"], "score": post["score"]},
                    )
            by_format: dict[str, list[float]] = {}
            for post in same_basis:
                by_format.setdefault(post["format"], []).append(post["score"])
            comparable = {kind: scores for kind, scores in by_format.items() if len(scores) >= 2}
            if len(comparable) >= 2:
                line = ", ".join(
                    f"{instagram_signal.FORMAT_HE.get(kind, kind)}: ממוצע {sum(s) / len(s):.3f} ב-{len(s)} פוסטים"
                    for kind, s in sorted(comparable.items(), key=lambda kv: -sum(kv[1]) / len(kv[1]))
                )
                out.add(
                    "fact",
                    f"לפי פורמט ({ranked[0]['score_basis_he']}): {line}.",
                    origin="Instagram Graph API (הפוסטים שלכם)",
                    data={"by_format": {k: len(v) for k, v in comparable.items()}},
                )
        else:
            out.add(
                "absence",
                f"סונכרנו {synced} פוסטים שלכם מאינסטגרם, אבל אף אחד מהם עוד לא הגיע למספיק אנשים כדי להשוות ביניהם.",
                origin="Instagram Graph API (הפוסטים שלכם)",
            )

    # Site and Meta snapshots.
    snaps = (
        db.query(PerformanceSnapshot)
        .filter(PerformanceSnapshot.business_id == business.id)
        .order_by(PerformanceSnapshot.created_at.desc())
        .limit(2)
        .all()
    )
    if snaps:
        latest = snaps[0]
        ga4 = loads(latest.ga4_json, {}) or {}
        overview = ga4.get("overview") or {}
        if overview:
            measured = True
            sessions, engaged, conversions = (
                _num(overview.get("sessions")),
                _num(overview.get("engagedSessions")),
                _num(overview.get("conversions")),
            )
            text = (
                f"באתר בין {_d(latest.period_start)} ל-{_d(latest.period_end)}: {_fmt(sessions)} כניסות, "
                f"{_fmt(engaged)} מהן נשארו באתר, {_fmt(conversions)} פניות או הזמנות."
            )
            kind = "fact"
            if len(snaps) > 1:
                prev = (loads(snaps[1].ga4_json, {}) or {}).get("overview") or {}
                prev_sessions = _num(prev.get("sessions"))
                if prev_sessions and sessions is not None:
                    change = round((sessions - prev_sessions) / prev_sessions * 100)
                    text += f" בבדיקה הקודמת ({_d(snaps[1].period_start)}–{_d(snaps[1].period_end)}) היו {_fmt(prev_sessions)} כניסות ({change:+d}%)."
                    kind = "change"
            out.add(
                kind,
                text,
                origin="Google Analytics (נתוני האתר)",
                date_ref=latest.period_end,
                data={"overview": overview, "period": [latest.period_start, latest.period_end]},
            )
            channels: dict[str, int] = {}
            pages = []
            for row in ga4.get("landing_pages") or []:
                count = _num(row.get("sessions")) or 0
                channel = row.get("sessionDefaultChannelGroup") or "לא ידוע"
                channels[channel] = channels.get(channel, 0) + count
                pages.append((count, row.get("landingPagePlusQueryString") or "", _num(row.get("conversions"))))
            if channels:
                total = sum(channels.values()) or 1
                out.add(
                    "fact",
                    "מאיפה הגיעו לאתר (עמודי הכניסה המובילים): "
                    + ", ".join(f"{name} {round(count / total * 100)}%" for name, count in sorted(channels.items(), key=lambda kv: -kv[1])[:5])
                    + ".",
                    origin="Google Analytics (נתוני האתר)",
                    date_ref=latest.period_end,
                    data={"channels": channels},
                )
            if pages:
                pages.sort(key=lambda item: -item[0])
                out.add(
                    "fact",
                    "העמודים שהכי נכנסים אליהם: "
                    + "; ".join(f"{path or '/'} ({_fmt(count)} כניסות, {_fmt(conv)} פניות)" for count, path, conv in pages[:3])
                    + ".",
                    origin="Google Analytics (נתוני האתר)",
                    date_ref=latest.period_end,
                    data={"pages": [{"path": p, "sessions": c, "conversions": v} for c, p, v in pages[:5]]},
                )
        account = meta.account_digest((loads(latest.meta_json, {}) or {}).get("account"))
        if account:
            measured = True
            text, kind = _account_fact_he(account)
            out.add(
                kind,
                text,
                origin="Instagram Graph API (המספרים של החשבון)",
                date_ref=account["end"] or latest.period_end,
                data=account,
            )
        attribution = [
            row
            for row in ga4.get("post_attribution") or []
            if any(_num(hit.get("sessions")) for hit in row.get("ga4") or [])
        ]
        if attribution:
            measured = True
            out.add(
                "fact",
                "פוסטים מהתוכנית שהביאו כניסות לאתר (לפי קישור המעקב): "
                + "; ".join(
                    f"\"{row.get('title')}\" — {sum(_num(hit.get('sessions')) or 0 for hit in row.get('ga4') or [])} כניסות"
                    for row in attribution[:4]
                )
                + ".",
                origin="Google Analytics (קישורי המעקב של הפוסטים)",
                date_ref=latest.period_end,
                data={"posts": [row.get("title") for row in attribution]},
            )

    # The plan itself: what happened to last month's posts. Real, even with nothing synced.
    strategy = (
        db.query(Strategy)
        .filter(Strategy.business_id == business.id)
        .order_by(Strategy.year.desc(), Strategy.month.desc())
        .first()
    )
    if strategy:
        extra = loads(strategy.roadmap_json, {}) or {}
        review = prior_month_review(
            {
                "year": strategy.year,
                "month": strategy.month,
                "usp": loads(strategy.usp_json, {}) or {},
                "roadmap": extra.get("roadmap") or {},
            }
        )
        if review["posts_total"]:
            formats: dict[str, int] = {}
            for kind in review["formats_used"]:
                if kind:
                    formats[kind] = formats.get(kind, 0) + 1
            out.add(
                "fact",
                f"בתוכנית של {strategy.month}/{strategy.year}: {review['posts_total']} פוסטים, {review['posts_approved']} אושרו, "
                f"{review['posts_published']} סומנו כפורסמו (עם קישור לפוסט).",
                origin="התוכנית ב-IsraMarket",
                date_ref=f"{strategy.year}-{strategy.month:02d}-01",
                data={
                    "posts_total": review["posts_total"],
                    "posts_approved": review["posts_approved"],
                    "posts_published": review["posts_published"],
                    "formats": formats,
                    "theme": review["theme"],
                },
            )

    ga4_connected = any(i.provider == "ga4" and i.status == "connected" for i in business.integrations)
    meta_connected = any(i.provider == "meta" and i.status == "connected" for i in business.integrations)
    if not meta_connected:
        needs.append("instagram_connection")
    if not ga4_connected:
        needs.append("google_analytics")
    if not measured:
        missing = []
        if not meta_connected:
            missing.append("אינסטגרם לא מחובר, אז אין לנו כמה אנשים ראו, שמרו או שיתפו כל פוסט")
        elif not synced:
            missing.append("אינסטגרם מחובר אבל עוד לא רעננו את הנתונים בעמוד התוצאות")
        if not ga4_connected:
            missing.append("נתוני האתר לא מחוברים, אז אין לנו כניסות לאתר ופניות או הזמנות")
        elif not snaps:
            missing.append("נתוני האתר מחוברים אבל עוד לא רעננו אותם")
        out.add(
            "absence",
            "לא נמדד: " + "; ".join(missing or ["עוד אין נתוני ביצוע"]) + ". לכן אי אפשר לדעת עדיין מה הצליח ומה לא.",
            origin="החיבורים של העסק",
        )
        status = _status(
            "not_connected",
            "עוד אין נתוני ביצוע אמיתיים. חברו את אינסטגרם ואת נתוני האתר, ורעננו אותם בעמוד התוצאות.",
            needs=needs,
        )
    else:
        status = _status(
            "ok" if not needs else "partial",
            "נתונים אמיתיים מהחשבונות המחוברים." + (" חלק מהמקורות עוד לא מחוברים." if needs else ""),
            needs=needs,
            provider="Instagram Graph API + Google Analytics",
        )
    return out.items, status, {}


# --- source: presence -----------------------------------------------------------------

_BASIC_LABELS = {
    "whatsapp_link": "כפתור או קישור לוואטסאפ",
    "phone": "מספר טלפון",
    "hours": "שעות פתיחה",
}
_NETWORK_HE = {"instagram": "אינסטגרם", "facebook": "פייסבוק", "tiktok": "טיקטוק", "youtube": "יוטיוב", "whatsapp": "וואטסאפ"}


def own_links(business: Business) -> dict[str, str]:
    """The business's own links (onboarding v2: website / instagram / facebook / tiktok)."""
    raw = loads(getattr(business, "social_links_json", "") or "{}", {})
    links = {}
    if isinstance(raw, dict):
        nested = raw.get("links") if isinstance(raw.get("links"), dict) else {}
        for key, value in {**raw, **nested}.items():
            if isinstance(value, str) and value.strip():
                links[str(key)] = value.strip()
    return links


def gather_presence(db: Session, business: Business, ctx: dict) -> tuple[list[dict], dict, dict]:
    out = _Findings("presence", ctx["now"])
    previous = ((ctx.get("previous_state") or {}).get("presence") or {}).get("site")
    links = own_links(business)
    website = business.website_url or links.get("website") or ""
    state: dict = {}
    needs: list[str] = []
    site_ok = False
    site_social: dict = {}

    if website:
        snapshot, error = _safe_snapshot(website)
        if error:
            out.add("absence", f"לא הצלחנו לקרוא את האתר שלכם הפעם: {error}", origin=website)
        else:
            site_ok = True
            state["site"] = snapshot
            site_social = snapshot.get("social") or {}
            basics = snapshot.get("basics") or {}
            missing = [label for key, label in _BASIC_LABELS.items() if not basics.get(key)]
            present = [label for key, label in _BASIC_LABELS.items() if basics.get(key)]
            if missing:
                extra = ""
                if not basics.get("whatsapp_link") and basics.get("whatsapp_mention"):
                    extra = " (וואטסאפ מוזכר בטקסט, אבל בלי קישור שאפשר ללחוץ עליו)"
                out.add(
                    "fact",
                    f"בעמוד הבית של האתר לא מצאנו: {', '.join(missing)}{extra}."
                    + (f" כן מצאנו: {', '.join(present)}." if present else "")
                    + " (בדקנו רק את עמוד הבית, בלי כפתורים שנטענים בדפדפן.)",
                    origin=snapshot["url"],
                    date_ref=snapshot["fetched_at"][:10],
                    data={"basics": basics},
                )
            else:
                out.add(
                    "fact",
                    "בעמוד הבית יש קישור לוואטסאפ, טלפון ושעות פתיחה.",
                    origin=snapshot["url"],
                    date_ref=snapshot["fetched_at"][:10],
                    data={"basics": basics},
                )
            diff = diff_snapshots(previous, snapshot)
            if diff.get("baseline"):
                offers = " | ".join(snapshot["offers"][:5])
                out.add(
                    "fact",
                    f"מה מופיע היום בעמוד הבית: \"{snapshot['title']}\"."
                    + (f" מבצעים והצעות: {offers}." if offers else " לא מצאנו בעמוד הבית מבצע או הצעה בולטים.")
                    + " (זו נקודת ההתחלה, בבדיקה הבאה נראה מה השתנה.)",
                    origin=snapshot["url"],
                    date_ref=snapshot["fetched_at"][:10],
                    data={"offers": snapshot["offers"][:8], "prices": snapshot["prices"][:8], "headings": snapshot["headings"][:8]},
                )
            elif diff.get("has_changes"):
                out.add(
                    "change",
                    _diff_text_he("העסק", diff).replace("באתר של העסק", "באתר שלכם"),
                    origin=snapshot["url"],
                    date_ref=snapshot["fetched_at"][:10],
                    data={"diff": diff},
                )
            else:
                out.add(
                    "fact",
                    f"בעמוד הבית שלכם לא השתנו מבצעים, מחירים או כותרות מאז {_d(diff.get('since'))}.",
                    origin=snapshot["url"],
                    date_ref=snapshot["fetched_at"][:10],
                    data={"diff": diff},
                )
    else:
        needs.append("website")
        out.add("absence", "אין לנו כתובת אתר של העסק, אז לא בדקנו את האתר.", origin="פרטי העסק")

    # Platforms: what the owner told us, what the site links to, what we can see.
    networks: dict[str, dict] = {}
    for key, value in links.items():
        if key in _NETWORK_HE:
            networks.setdefault(key, {})["given"] = value
    for key, value in site_social.items():
        networks.setdefault(key, {})["on_site"] = value
    meta_connected = instagram_signal.meta_context(business) is not None
    last_post = (
        db.query(InstagramPost.posted_at)
        .filter(InstagramPost.business_id == business.id)
        .order_by(InstagramPost.posted_at.desc())
        .first()
    )
    lines = []
    for key, info in networks.items():
        where = []
        if info.get("given"):
            where.append("בפרטי העסק")
        if info.get("on_site"):
            where.append("בקישור מהאתר")
        lines.append(f"{_NETWORK_HE.get(key, key)} ({' ו'.join(where)})")
    activity = []
    if last_post and last_post[0]:
        days = (ctx["today"] - (_parse_date(last_post[0]) or ctx["today"])).days
        activity.append(f"הפוסט האחרון שלכם באינסטגרם שסונכרן: {_d(last_post[0])} (לפני {days} ימים)")
    elif meta_connected:
        activity.append("אינסטגרם מחובר, אבל עוד לא סונכרנו פוסטים")
    else:
        activity.append("אינסטגרם לא מחובר, אז אין לנו מתי פרסמתם לאחרונה")
    if networks:
        out.add(
            "fact",
            "הרשתות שמצאנו: " + ", ".join(lines) + ". " + "; ".join(activity)
            + ". בפייסבוק ובטיקטוק אנחנו לא רואים פעילות (אין חיבור).",
            origin="פרטי העסק + עמוד הבית",
            data={"networks": networks, "instagram_connected": meta_connected, "last_instagram_post": (last_post or [""])[0] or ""},
        )
    else:
        out.add(
            "absence",
            "לא מצאנו קישורים לרשתות חברתיות, לא בפרטי העסק ולא בעמוד הבית. " + "; ".join(activity) + ".",
            origin="פרטי העסק + עמוד הבית",
        )
    if not meta_connected:
        needs.append("instagram_connection")
    if (business.presence_type or "") in {"brick_and_mortar", "hybrid"} and not (business.location or "").strip():
        out.add(
            "fact",
            "יש לכם חנות פיזית, אבל בפרטי העסק אין עיר או כתובת. בלי זה אי אפשר לכוון לחיפושים מקומיים.",
            origin="פרטי העסק",
        )

    if site_ok:
        status = _status("ok" if not needs else "partial", "קראנו את עמוד הבית ואת הקישורים של העסק.", needs=needs, provider="עמוד הבית + פרטי העסק")
    elif website:
        status = _status("error", "לא הצלחנו לקרוא את האתר הפעם. ננסה שוב בבדיקה הבאה.", needs=needs, provider="עמוד הבית")
    else:
        status = _status("empty", "אין כתובת אתר. הוסיפו אותה בפרטי העסק כדי שנבדוק גם את האתר.", needs=needs)
    return out.items, status, state


GATHERERS = {
    "competitors": gather_competitors,
    "search": gather_search,
    "calendar": gather_calendar,
    "own_results": gather_own_results,
    "presence": gather_presence,
}


# --- insights ----------------------------------------------------------------------------

INSIGHTS_SCHEMA = {
    "type": "object",
    "title": "ResearchInsights",
    "description": "מה למדנו השבוע מהמחקר השוטף, ומה זה משנה בתוכנית",
    "properties": {
        "headline": {
            "type": "string",
            "description": "משפט אחד לבעל העסק: הדבר הכי חשוב שלמדנו השבוע.",
        },
        "insights": {
            "type": "array",
            "minItems": MIN_INSIGHTS,
            "maxItems": MAX_INSIGHTS,
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "עד 7 מילים."},
                    "text": {
                        "type": "string",
                        "description": "מה למדנו: 1–2 משפטים עם הפרט הקונקרטי מהממצא (שם, תאריך, ביטוי, מספר שסופק).",
                    },
                    "plan_change": {
                        "type": "string",
                        "description": "מה זה משנה בתוכנית: פעולה אחת קונקרטית (מה, מתי, איפה). לא עצה כללית.",
                    },
                    "refs": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 1,
                        "description": "מזהי הממצאים שהתובנה נשענת עליהם (C1, S2, K3...). רק מזהים שסופקו.",
                    },
                    "confidence": {
                        "type": "string",
                        "enum": ["strong", "weak"],
                        "description": "strong רק כשהתובנה נשענת על עובדה או שינוי שנמדדו. הערכה, ממצא יחיד חלש או היסק — weak.",
                    },
                    "confidence_reason": {"type": "string", "description": "חצי משפט: למה חזק או חלש."},
                },
                "required": ["title", "text", "plan_change", "refs", "confidence", "confidence_reason"],
            },
        },
    },
    "required": ["headline", "insights"],
}

_KIND_HE = {"fact": "עובדה", "change": "שינוי", "estimate": "הערכה", "absence": "חסר"}


def _finding_line(item: dict) -> str:
    when = f", {_d(item['date'])}" if item.get("date") else ""
    return f"[{item['id']}] ({SOURCE_LABEL_HE[item['source']]}, {_KIND_HE[item['kind']]}{when}) {item['text_he']} — מקור: {item['origin']}"


def _plan_context(db: Session, business: Business) -> str:
    strategy = (
        db.query(Strategy)
        .filter(Strategy.business_id == business.id)
        .order_by(Strategy.year.desc(), Strategy.month.desc())
        .first()
    )
    if not strategy:
        return "עוד אין תוכנית חודשית שמורה."
    roadmap = (loads(strategy.roadmap_json, {}) or {}).get("roadmap") or {}
    monthly = roadmap.get("monthly_horizon_plan") or {}
    long_horizon = roadmap.get("long_horizon_plan") or {}
    weeks = [
        f"שבוע {week.get('week')}: {week.get('focus')}"
        for week in roadmap.get("weekly_breakdown") or []
        if isinstance(week, dict)
    ]
    return (
        f"התוכנית הנוכחית ({strategy.month}/{strategy.year}): נושא \"{roadmap.get('theme') or ''}\". "
        f"השערת החודש: {monthly.get('hypothesis') or '—'}. "
        f"השערת הרבעון: {long_horizon.get('hypothesis') or '—'}. "
        + ("שבועות: " + "; ".join(weeks[:4]) if weeks else "")
    )


def insights_prompt(db: Session, business: Business, findings: list[dict], sources: dict, previous: list[dict]) -> str:
    audiences = [row.name for row in getattr(business, "audiences", []) or []]
    not_ok = [
        f"{SOURCE_LABEL_HE[name]}: {status.get('note_he')}"
        for name, status in sources.items()
        if status.get("state") not in {"ok"}
    ]
    previous_block = (
        "תובנות מהבדיקה הקודמת (אל תחזרו עליהן אלא אם יש ממצא חדש שמחזק או משנה אותן):\n"
        + "\n".join(f"- {item.get('title')}: {item.get('text')}" for item in previous[:6])
        if previous
        else "זו הבדיקה הראשונה."
    )
    return f"""
אתם אסטרטג שיווק בכיר שעובד עם עסק ישראלי קטן. קיבלתם את ממצאי המחקר השבועי. הפיקו {MIN_INSIGHTS} עד {MAX_INSIGHTS} תובנות ("מה למדנו"),
וכל אחת עם השינוי הקונקרטי שהיא מחייבת בתוכנית ("מה זה משנה").

העסק: {business.name} — {field_label(business.business_type)}. מה הם מוכרים: {business.offerings or '—'}.
מודל: {business.business_model or 'products'}. מטרה: {business.primary_goal or '—'}. תקציב חודשי: {business.monthly_budget_ils or 0} ₪.
עיר: {business.location or 'לא צוינה'}. קהלים: {', '.join(audiences) or 'לא הוגדרו'}.
{_plan_context(db, business)}

הממצאים (כל אחד עם מזהה, מקור ותאריך):
{chr(10).join(_finding_line(item) for item in findings)}

מקורות שחסרים או חלקיים:
{chr(10).join('- ' + line for line in not_ok) or '- אין'}

{previous_block}

הנחיות:
1. כל תובנה נשענת על ממצאים מהרשימה ומצטטת את המזהים שלהם ב-refs. אסור מזהה שלא מופיע.
2. תובנה טובה מחברת בין ממצאים (למשל חג קרוב + מה שמחפשים בגוגל + מה שחסר באתר), לא חוזרת על ממצא אחד במילים אחרות.
3. plan_change הוא פעולה אחת שאפשר לבצע: מה לפרסם או לשנות, באיזה שבוע או תאריך, ובאיזה ערוץ. לא "לשפר נוכחות" ולא "להמשיך לעקוב".
4. אסור להמציא מספרים, נפחי חיפוש, אחוזים או תוצאות. מותר מספר רק אם הוא מופיע בממצאים או בפרטי העסק. אין לנו כמה אנשים מחפשים — אל תכתבו "הרבה מחפשים".
5. ממצא מסוג "הערכה" אינו נתון של העסק; תובנה שנשענת רק עליו היא weak. ממצא מסוג "חסר" אומר מה לא נמדד — לכל היותר תובנה אחת על חיבור חסר, ורק אם הוא באמת משנה החלטה החודש.
6. בלי ימי זיכרון כהזדמנות מכירה. אם יש יום זיכרון קרוב — רק הנחיה לשקט.
7. סדרו מהתובנה שהכי משנה את התוכנית לפחות.
8. headline: משפט אחד, הדבר הכי חשוב.

{HEBREW_STYLE}
"""


_NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)?")


def _numbers(text: str) -> set[str]:
    return {match.replace(",", "") for match in _NUMBER_RE.findall(text or "") if len(match.replace(",", "").replace(".", "")) >= 2}


def _is_day_month(token: str) -> bool:
    match = re.fullmatch(r"(\d{1,2})\.(\d{1,2})", token)
    return bool(match) and 1 <= int(match.group(1)) <= 31 and 1 <= int(match.group(2)) <= 12


def clean_insights(raw: dict, findings: list[dict], context_text: str) -> tuple[str, list[dict]]:
    """Validate the model output against the findings it was given.

    Unknown refs are dropped; an insight with no surviving ref is dropped whole. An
    insight whose only support is estimates or absences cannot be "strong". A number
    that appears nowhere in the findings or the business context is reported in
    `unverified_numbers` and demotes the insight to weak.
    """
    by_id = {item["id"]: item for item in findings}
    known_numbers = _numbers(context_text) | _numbers(dumps(findings))
    out: list[dict] = []
    for item in (raw or {}).get("insights") or []:
        if not isinstance(item, dict):
            continue
        refs: list[str] = []
        for ref in item.get("refs") or []:
            key = str(ref).strip().upper()
            if key in by_id and key not in refs:
                refs.append(key)
        text = " ".join(str(item.get("text") or "").split())
        change = " ".join(str(item.get("plan_change") or "").split())
        if not refs or not text or not change:
            continue
        cited = [by_id[ref] for ref in refs]
        confidence = "strong" if item.get("confidence") == "strong" else "weak"
        reason = " ".join(str(item.get("confidence_reason") or "").split())
        if confidence == "strong" and not any(entry["kind"] in {"fact", "change"} for entry in cited):
            confidence = "weak"
            reason = "נשען רק על הערכה או על מידע חסר"
        # A deadline the model derives ("עד 2.10") is a date, not a claimed statistic.
        unverified = sorted(
            number for number in _numbers(f"{text} {change}") - known_numbers if not _is_day_month(number)
        )
        if unverified:
            confidence = "weak"
            reason = "יש מספר שלא מופיע בממצאים"
        sources = [name for name in SOURCES if any(entry["source"] == name for entry in cited)]
        out.append(
            {
                "id": f"I{len(out) + 1}",
                "title": " ".join(str(item.get("title") or "").split()),
                "text": text,
                "plan_change": change,
                "confidence": confidence,
                "confidence_reason": reason,
                "sources": sources,
                "source_labels_he": [SOURCE_LABEL_HE[name] for name in sources],
                "refs": refs,
                "evidence": [
                    {
                        "id": entry["id"],
                        "source": entry["source"],
                        "kind": entry["kind"],
                        "text_he": entry["text_he"],
                        "origin": entry["origin"],
                        "date": entry["date"],
                    }
                    for entry in cited
                ],
                "unverified_numbers": unverified,
            }
        )
        if len(out) >= MAX_INSIGHTS:
            break
    headline = " ".join(str((raw or {}).get("headline") or "").split())
    return headline, out


# --- runs -------------------------------------------------------------------------------


def iso_period(day: date) -> str:
    year, week, _ = day.isocalendar()
    return f"{year}-W{week:02d}"


def latest_run(db: Session, business_id: int) -> ResearchRun | None:
    return (
        db.query(ResearchRun)
        .filter(ResearchRun.business_id == business_id)
        .order_by(ResearchRun.created_at.desc(), ResearchRun.id.desc())
        .first()
    )


def manual_runs_since(db: Session, business_id: int, since: datetime) -> list[ResearchRun]:
    return (
        db.query(ResearchRun)
        .filter(
            ResearchRun.business_id == business_id,
            ResearchRun.trigger == "manual",
            ResearchRun.created_at >= since,
        )
        .order_by(ResearchRun.created_at.asc())
        .all()
    )


def rate_status(db: Session, business_id: int, now: datetime | None = None) -> dict:
    now = now or datetime.utcnow()
    runs = manual_runs_since(db, business_id, now - RATE_WINDOW)
    left = max(0, MANUAL_RUNS_PER_DAY - len(runs))
    retry_at = (runs[0].created_at + RATE_WINDOW) if not left and runs else None
    return {
        "limit_per_day": MANUAL_RUNS_PER_DAY,
        "runs_left_today": left,
        "next_run_at": retry_at.replace(microsecond=0).isoformat() if retry_at else "",
    }


def check_rate_limit(db: Session, business_id: int, now: datetime | None = None) -> None:
    status = rate_status(db, business_id, now)
    if status["runs_left_today"] <= 0:
        retry_at = datetime.fromisoformat(status["next_run_at"]) if status["next_run_at"] else (now or datetime.utcnow())
        raise ResearchRateLimited(
            f"כבר הרצתם את המחקר {MANUAL_RUNS_PER_DAY} פעמים ביממה האחרונה. אפשר שוב אחרי {retry_at.strftime('%H:%M')} (UTC). "
            "המחקר גם רץ לבד פעם בשבוע.",
            retry_at,
        )


def run_research(
    db: Session,
    business: Business,
    *,
    trigger: str = "manual",
    now: datetime | None = None,
    sources: tuple[str, ...] = SOURCES,
    synthesize=None,
    model_label: str = "",
) -> ResearchRun:
    """Gather every source, distill insights, store the run. Only DB errors raise.

    A source that fails is recorded as an error status and the run goes on; a model
    failure stores the findings with `status="insights_failed"` rather than losing them.
    `synthesize(prompt, schema) -> json str` defaults to the configured Gemini strategy
    model; a verification script may pass another model, and `model_label` records it.
    """
    synthesize = synthesize or strategy_json
    now = now or datetime.utcnow()
    previous = latest_run(db, business.id)
    previous_findings = loads(previous.findings_json, {}) if previous else {}
    ctx = {
        "now": now,
        # The owner's calendar day: after 21:00 UTC it is already tomorrow in Israel.
        "today": now.replace(tzinfo=timezone.utc).astimezone(instagram_signal.ISRAEL_TZ).date(),
        "previous_state": (previous_findings or {}).get("state") or {},
    }
    findings: list[dict] = []
    statuses: dict[str, dict] = {}
    state: dict[str, dict] = {}
    for name in sources:
        try:
            items, status, source_state = GATHERERS[name](db, business, ctx)
        except Exception as exc:  # one broken source must not sink the run
            items, source_state = [], {}
            status = _status("error", f"לא הצלחנו לבדוק את המקור הזה הפעם ({type(exc).__name__}). ננסה שוב בבדיקה הבאה.")
        findings.extend(items)
        statuses[name] = {**status, "findings": len(items), "checked_at": now.replace(microsecond=0).isoformat()}
        state[name] = source_state or {}

    settings = get_settings()
    previous_insights = loads(previous.insights_json, {}) if previous else {}
    previous_list = (previous_insights or {}).get("items") if isinstance(previous_insights, dict) else []
    run_status = "done"
    headline, insights, error_he, error_detail = "", [], "", ""
    if findings:
        prompt = insights_prompt(db, business, findings, statuses, previous_list or [])
        try:
            raw = loads(synthesize(prompt, INSIGHTS_SCHEMA), {})
            headline, insights = clean_insights(raw, findings, prompt)
            if not insights:
                run_status, error_he = "insights_failed", "המודל לא החזיר תובנות שנשענות על הממצאים. הממצאים נשמרו."
        except Exception as exc:
            run_status = "insights_failed"
            # For the operator only (never serialized to the owner): billing, quota, bad JSON.
            error_detail = f"{type(exc).__name__}: {str(exc)[:300]}"
            error_he = "לא הצלחנו להפיק תובנות הפעם. הממצאים נשמרו, ונסו שוב בעוד כמה דקות."
            if "GEMINI_API_KEY" in str(exc):
                error_he = "אין מפתח AI מוגדר בשרת, ולכן יש ממצאים בלי תובנות."
    else:
        run_status, error_he = "insights_failed", "לא נאסף אף ממצא."

    run = ResearchRun(
        business_id=business.id,
        period=iso_period(now.date()),
        trigger=trigger if trigger in {"manual", "scheduled"} else "manual",
        status=run_status,
        findings_json=dumps({"items": findings, "state": state}),
        insights_json=dumps(
            {"headline": headline, "items": insights, "error_he": error_he, "error_detail": error_detail}
        ),
        sources_json=dumps(statuses),
        model=(model_label or settings.gemini_strategy_model) if run_status == "done" else "",
        created_at=now,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


# --- reading ----------------------------------------------------------------------------


def readiness(db: Session, business: Business) -> dict:
    """Per-source status without touching the network — for the empty state."""
    handles = instagram_signal.handles_for(business)
    sites, _ = _competitor_sites(business)
    meta_connected = instagram_signal.meta_context(business) is not None
    ga4 = next((i for i in business.integrations if i.provider == "ga4" and i.status == "connected"), None)
    console = bool(ga4 and keywords.search_console_scope_granted((loads(ga4.extra_json, {}) or {}).get("scopes")))
    synced = db.query(InstagramPost).filter(InstagramPost.business_id == business.id).count()
    snaps = db.query(PerformanceSnapshot).filter(PerformanceSnapshot.business_id == business.id).count()
    competitor_needs = ([] if handles else ["competitor_handles"]) + ([] if sites else ["competitor_websites"])
    if handles and not meta_connected:
        competitor_needs.append("instagram_connection")
    own_needs = ([] if meta_connected else ["instagram_connection"]) + ([] if ga4 else ["google_analytics"])
    return {
        "competitors": _status(
            "ready" if (sites or (handles and meta_connected)) else ("not_connected" if handles else "empty"),
            (
                "נבדוק את המתחרים שבחרתם."
                if sites or (handles and meta_connected)
                else "כדי לקרוא פוסטים של מתחרים צריך לחבר את אינסטגרם בעמוד החיבורים."
                if handles
                else "עוד לא בחרתם מתחרים. הוסיפו חשבונות אינסטגרם או אתרים של מתחרים."
            ),
            needs=competitor_needs,
        ),
        "search": _status(
            "ready",
            "ביטויים אמיתיים מההשלמה של גוגל, בלי מספר חיפושים."
            + ("" if console else " חברו את Search Console כדי לקבל גם קליקים וחשיפות אמיתיים."),
            needs=[] if console else ["google_search_console"],
        ),
        "calendar": _status("ready", "חגים, ימי זיכרון וימי קניות בשישה השבועות הקרובים."),
        "own_results": _status(
            "ready" if (synced or snaps) else "not_connected",
            "נשתמש בנתונים שסונכרנו." if (synced or snaps) else "עוד אין נתוני ביצוע. חברו את אינסטגרם ואת נתוני האתר.",
            needs=own_needs,
        ),
        "presence": _status(
            "ready" if business.website_url else "empty",
            "נבדוק את עמוד הבית ואת הקישורים שלכם." if business.website_url else "אין כתובת אתר בפרטי העסק.",
            needs=[] if business.website_url else ["website"],
        ),
    }


def serialize_run(run: ResearchRun, *, with_findings: bool = True) -> dict:
    findings = loads(run.findings_json, {}) or {}
    insights = loads(run.insights_json, {}) or {}
    items = findings.get("items") or []
    grouped = {name: [item for item in items if item.get("source") == name] for name in SOURCES}
    payload = {
        "id": run.id,
        "created_at": run.created_at.replace(microsecond=0).isoformat() if run.created_at else "",
        "period": run.period,
        "trigger": run.trigger,
        "status": run.status,
        "headline": insights.get("headline") or "",
        "insights": insights.get("items") or [],
        "insights_error_he": insights.get("error_he") or "",
        "sources": loads(run.sources_json, {}) or {},
        "model": run.model,
    }
    if with_findings:
        payload["findings"] = grouped
    else:
        payload["findings_count"] = {name: len(group) for name, group in grouped.items()}
    return payload


def research_prompt_block(business, db: Session | None = None) -> str:
    """The latest insights as a Hebrew block for the month-plan prompt, or "".

    `business` is the ORM row or the payload dict the strategy router builds (it must
    then carry `id`). Research older than PROMPT_MAX_AGE_DAYS is ignored. Never raises:
    a plan must never fail because research could not be read.
    """
    try:
        business_id = business.get("id") if isinstance(business, dict) else getattr(business, "id", None)
        if not business_id:
            return ""
        session = db or (None if isinstance(business, dict) else object_session(business))
        own_session = None
        if session is None:
            from app.db import SessionLocal

            own_session = session = SessionLocal()
        try:
            run = (
                session.query(ResearchRun)
                .filter(ResearchRun.business_id == business_id, ResearchRun.status == "done")
                .order_by(ResearchRun.created_at.desc(), ResearchRun.id.desc())
                .first()
            )
        finally:
            if own_session is not None:
                own_session.close()
        if not run or (datetime.utcnow() - run.created_at) > timedelta(days=PROMPT_MAX_AGE_DAYS):
            return ""
        insights = (loads(run.insights_json, {}) or {}).get("items") or []
        if not insights:
            return ""
        statuses = loads(run.sources_json, {}) or {}
    except Exception:
        return ""

    lines = []
    for index, item in enumerate(insights, start=1):
        strength = "חזק" if item.get("confidence") == "strong" else "חלש"
        origins = "; ".join(
            f"{entry.get('origin')}{' ' + _d(entry.get('date')) if entry.get('date') else ''}"
            for entry in (item.get("evidence") or [])[:3]
        )
        lines.append(
            f"{index}. [{strength}] {item.get('title')}: {item.get('text')}\n"
            f"   מה זה משנה בתוכנית: {item.get('plan_change')}\n"
            f"   מקור: {', '.join(item.get('source_labels_he') or [])} ({origins})"
        )
    missing = [
        f"{SOURCE_LABEL_HE.get(name, name)}: {status.get('note_he')}"
        for name, status in statuses.items()
        if status.get("state") in {"not_connected", "empty", "error"}
    ]
    missing_block = ("\nמה לא נמדד במחקר:\n" + "\n".join(f"- {line}" for line in missing)) if missing else ""
    return f"""
מה למדנו במחקר השוטף (בדיקה מ-{_d(run.created_at)}). אלה ממצאים עם מקור ותאריך, לא ניחושים:
{chr(10).join(lines)}{missing_block}

איך להשתמש בזה:
- כיוון החודש, האירועים והשבועות חייבים להתחשב בתובנות החזקות. תובנה חלשה — לשקול, לא לבנות עליה את החודש.
- ב-summary כתבו במשפט אחד מה מהמחקר שינה את כיוון החודש, ואם לא שינה — למה.
- אסור להמציא מספרים שלא מופיעים כאן או בנתוני העסק.
""".strip()


__all__ = [
    "SOURCES",
    "ResearchRateLimited",
    "check_rate_limit",
    "clean_insights",
    "diff_snapshots",
    "fetch_page_snapshot",
    "latest_run",
    "parse_page_snapshot",
    "rate_status",
    "readiness",
    "research_prompt_block",
    "run_research",
    "serialize_run",
]
