"""Bounded public offering/pricing/about reads for every business route.

No extra model call, login, form submission or arbitrary crawl. Each attempted
source retains its URL/time/status. Site claims are not measured business results.
The legacy product_pages/product_research fields remain usable by existing callers.
"""
import threading
import time
from concurrent.futures import ThreadPoolExecutor, wait
from datetime import datetime, timezone
from urllib.parse import unquote, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup, Comment
from app.services.netguard import UnsafeUrlError
from app.services.scraper import capped_get, USER_AGENT, ScrapeBudgetExceeded

PAGE_TERMS = {
    "pricing": ("pricing", "prices", "price-list", "תמחור", "מחירים", "מחירון", "أسعار", "цены"),
    "products": ("product", "feature", "solution", "מוצרים", "מוצר", "פתרונות", "יכולות", "منتجات", "продукт"),
    "services": ("service", "treatment", "שירות", "טיפול", "خدمات", "услуг"),
    "about": ("about", "אודות", "מי אנחנו", "من نحن", "о нас"),
    "impact": ("impact", "mission", "עשייה", "השפעה", "חזון", "أثر", "миссия"),
    "donate": ("donat", "support", "תרומ", "תמיכה", "تبرع", "пожертв"),
}
TERMS = tuple(term for terms in PAGE_TERMS.values() for term in terms)
SKIP = ("login", "signin", "signup", "logout", "account", "checkout", "delete", "admin", "cart", "payment")
MAX_PAGES = 3
DEADLINE_SECONDS = 6.0
_POOL = ThreadPoolExecutor(max_workers=MAX_PAGES, thread_name_prefix="public-site-research")
# Bound submissions too: the executor's internal queue is otherwise unbounded.
_SLOTS = threading.BoundedSemaphore(MAX_PAGES)


def _origin(url: str) -> tuple:
    parts = urlparse(url)
    return (parts.scheme.lower(), (parts.hostname or "").lower(),
            parts.port or (443 if parts.scheme == "https" else 80))


def _kind(path: str, label: str) -> str:
    search = unquote(path + " " + label).lower()
    return next((kind for kind, terms in PAGE_TERMS.items() if any(term in search for term in terms)), "")


def content_links(base: str, soup: BeautifulSoup) -> list[dict]:
    seen = {base.rstrip("/")}
    result = []
    for node in soup.find_all("a", href=True):
        target = urljoin(base, str(node["href"]))
        parts = urlparse(target)
        text = " ".join(node.get_text(" ", strip=True).split())[:120]
        kind = _kind(parts.path, text)
        try:
            same_origin = _origin(target) == _origin(base)
        except ValueError:
            continue
        if (parts.scheme not in {"http", "https"} or not same_origin
                or parts.query or parts.fragment or parts.username or parts.password
                or any(word in unquote(parts.path).lower() for word in SKIP)
                or not kind or target.rstrip("/") in seen):
            continue
        seen.add(target.rstrip("/"))
        result.append({"url": target, "label": text, "kind": kind})
        if len(result) == 12:
            break
    return result


def _select(candidates: list[dict]) -> list[dict]:
    # Prefer price evidence and distinct page purposes over three product links.
    selected = []
    for kind in PAGE_TERMS:
        item = next((item for item in candidates if item["kind"] == kind), None)
        if item:
            selected.append(item)
        if len(selected) == MAX_PAGES:
            return selected
    selected.extend(item for item in candidates if item not in selected)
    return selected[:MAX_PAGES]


def _source(item: dict, status: str, reason: str = "") -> dict:
    return {**item, "status": status, "reason": reason,
            "checked_at": datetime.now(timezone.utc).isoformat()}


def _read(item: dict, base: str, deadline: float) -> tuple[dict | None, dict]:
    try:
        if time.monotonic() >= deadline:
            raise ScrapeBudgetExceeded("deadline")
        with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=3.0, trust_env=False) as client:
            response = capped_get(client, item["url"], max_bytes=150_000, deadline=deadline,
                                  request_timeout=3.0, allowed_origin=base)
        if response.status_code == 429:
            return None, _source(item, "limited", "rate_limited")
        if response.status_code in {401, 403}:
            return None, _source(item, "blocked", "access_restricted")
        if response.status_code >= 400:
            return None, _source(item, "unavailable", "http_error")
        if len(response.content) > 150_000:
            return None, _source(item, "limited", "byte_limit")
        if _origin(str(response.url)) != _origin(base):
            return None, _source(item, "blocked", "foreign_destination")
        if "html" not in response.headers.get("content-type", "").lower():
            return None, _source(item, "unavailable", "not_html")
        work = BeautifulSoup(response.text, "lxml")
        for tag in work(["script", "style", "noscript", "svg", "iframe", "nav", "footer", "form"]):
            tag.decompose()
        for comment in work.find_all(string=lambda value: isinstance(value, Comment)):
            comment.extract()
        text = " ".join(work.get_text(" ", strip=True).split())[:3000]
        if len(text) < 40:
            return None, _source(item, "unavailable", "no_useful_text")
        stamp = datetime.now(timezone.utc).isoformat()
        page = {**item, "url": str(response.url), "text": text, "read_at": stamp}
        return page, {**_source(item, "read"), "url": str(response.url), "read_at": stamp}
    except UnsafeUrlError:
        return None, _source(item, "blocked", "unsafe_destination")
    except (ScrapeBudgetExceeded, httpx.TimeoutException):
        return None, _source(item, "limited", "timeout")
    except (httpx.HTTPError, ValueError, RuntimeError):
        return None, _source(item, "unavailable", "read_failed")


def read_product_pages(raw: dict) -> dict:
    base = str(raw.get("url") or "")
    # Recheck stored candidates; caller input cannot introduce foreign hosts/actions.
    links = raw.get("content_links") or []
    soup = BeautifulSoup("", "lxml")
    for item in links[:12]:
        if isinstance(item, dict):
            node = soup.new_tag("a", href=str(item.get("url") or ""))
            node.string = str(item.get("label") or "")
            soup.append(node)
    candidates = _select(content_links(base, soup))
    deadline = time.monotonic() + DEADLINE_SECONDS
    futures = {}
    results = {}
    for index, item in enumerate(candidates):
        if not _SLOTS.acquire(blocking=False):
            results[index] = (None, _source(item, "limited", "capacity"))
            continue
        def job(item=item):
            try:
                return _read(item, base, deadline)
            finally:
                _SLOTS.release()
        try:
            futures[index] = _POOL.submit(job)
        except RuntimeError:
            _SLOTS.release()
            results[index] = (None, _source(item, "limited", "capacity"))
    if futures:
        wait(futures.values(), timeout=max(0.0, deadline - time.monotonic()))
    for index, future in futures.items():
        if future.done():
            try:
                results[index] = future.result()
            except Exception:
                results[index] = (None, _source(candidates[index], "unavailable", "read_failed"))
        else:
            # Running fetches observe the same deadline; don't block the visitor.
            results[index] = (None, _source(candidates[index], "limited", "timeout"))
    pages = [results[index][0] for index in sorted(results) if results[index][0]]
    sources = [results[index][1] for index in sorted(results)]
    failed = len(pages) != len(candidates)
    return {"product_pages": pages, "product_research": {
        "status": "partial" if failed else "ready" if pages else "no_pages",
        "read": len(pages), "attempted": len(candidates), "sources": sources,
        "max_pages": MAX_PAGES, "deadline_seconds": DEADLINE_SECONDS,
        "note_he": "קראנו עמודי הצעה/תמחור/אודות ציבוריים מהאתר. טענות האתר אינן הוכחת שימוש או תוצאה." if pages
        else "לא קראנו עמודי מוצר נוספים. התוכנית תשתמש במה שסיפרתם ובחומר הקיים; יכולות ומחירים חסרים נשארים לבירור.",
    }}
