"""Bounded public product/pricing reads, within the brand scan the owner requested.

No extra model call, login, form submission or arbitrary crawl. Each source retains
its URL/time. Missing pages never prevent the plan from using owner-declared context.
"""
import time
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from app.services.scraper import capped_get, USER_AGENT

TERMS = ("product", "feature", "pricing", "solution", "מוצרים", "מוצר", "תמחור", "מחירים", "פתרונות", "יכולות")
SKIP = ("login", "signin", "signup", "logout", "account", "checkout", "delete", "admin")

def content_links(base: str, soup: BeautifulSoup) -> list[dict]:
    host = urlparse(base).netloc.lower()
    seen = {base.rstrip("/")}
    result = []
    for node in soup.find_all("a", href=True):
        target = urljoin(base, str(node["href"]))
        parts = urlparse(target)
        text = " ".join(node.get_text(" ", strip=True).split())[:120]
        search = (parts.path + " " + text).lower()
        if (parts.scheme not in {"http", "https"} or parts.netloc.lower() != host
                or parts.query or parts.fragment or parts.username or parts.password
                or any(word in parts.path.lower() for word in SKIP)
                or not any(word in search for word in TERMS) or target.rstrip("/") in seen):
            continue
        seen.add(target.rstrip("/"))
        result.append({"url": target, "label": text})
        if len(result) == 12:
            break
    return result

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
    candidates = content_links(base, soup)[:2]
    pages = []
    failed = 0
    deadline = time.monotonic() + 6.0
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=3.0) as client:
        for item in candidates:
            try:
                response = capped_get(client, item["url"], max_bytes=150_000, deadline=deadline, request_timeout=3.0)
                if response.status_code >= 400 or len(response.content) > 150_000:
                    raise ValueError("unreadable page")
                if urlparse(str(response.url)).netloc.lower() != urlparse(base).netloc.lower():
                    raise ValueError("foreign destination")
                if "html" not in response.headers.get("content-type", ""):
                    raise ValueError("not HTML")
                work = BeautifulSoup(response.text, "lxml")
                for tag in work(["script", "style", "noscript", "svg", "iframe", "nav", "footer"]):
                    tag.decompose()
                text = " ".join(work.get_text(" ", strip=True).split())[:3000]
                if len(text) < 40:
                    raise ValueError("no useful text")
                pages.append({"url": str(response.url), "label": item["label"], "text": text,
                              "read_at": datetime.now(timezone.utc).isoformat()})
            except (httpx.HTTPError, ValueError, RuntimeError):
                failed += 1
    return {"product_pages": pages, "product_research": {
        "status": "partial" if failed else "ready" if pages else "no_pages",
        "read": len(pages), "attempted": len(candidates),
        "note_he": "קראנו עמודי מוצר/תמחור ציבוריים מהאתר. טענות האתר אינן הוכחת שימוש או תוצאה." if pages
        else "לא קראנו עמודי מוצר נוספים. התוכנית תשתמש במה שסיפרתם ובחומר הקיים; יכולות ומחירים חסרים נשארים לבירור.",
    }}
