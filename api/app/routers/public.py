"""Endpoints that work without an account.

The site preview, in two sizes: `/public/preview` (brand + business guess + one sample
post) and `/public/brand` (the brand only, for a flow that reads the site in the
background). They share one cache and one budget. It is anonymous by design — the
point is to show an owner what we make of their business *before* asking them to sign
up — so everything that normally protects a scan has to be explicit instead:

- SSRF: the scraper validates every hop through `netguard` (no private, loopback,
  link-local or metadata addresses, including after a redirect).
- Cost: a tight per-IP budget plus a global one, so neither one visitor nor a botnet can
  turn the landing page into a free Gemini faucet. A cached answer costs nothing and is
  served without touching either budget.
- Size and time: the scrape runs under byte caps and one deadline, and the whole request
  is bounded; a slow site answers 504 while the scan finishes in the background and
  lands in the cache for the retry.
- Output: named, model-derived fields only. The page's HTML and text never leave.
"""

from __future__ import annotations

import threading
from concurrent.futures import Future, ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.services import preview as preview_service
from app.services import ratelimit
from app.services.netguard import UnsafeUrlError, assert_public_url
from app.services.scraper import _normalize_url

router = APIRouter(prefix="/public", tags=["public"])

# Per visitor: five fresh scans an hour is plenty to try a typo'd URL and the real one.
PREVIEW_PER_IP = 5
PREVIEW_WINDOW_SECONDS = 60 * 60
# Across everyone: the ceiling on anonymous Gemini spend per hour.
PREVIEW_GLOBAL = 120
# The request gives up after this long; the scan keeps going and fills the cache.
PREVIEW_REQUEST_SECONDS = 75.0
# Concurrent anonymous scans. Beyond this the visitor is asked to retry, instead of
# queueing work nobody may still be waiting for.
PREVIEW_CONCURRENCY = 4

_pool = ThreadPoolExecutor(max_workers=PREVIEW_CONCURRENCY, thread_name_prefix="preview")
_slots = threading.BoundedSemaphore(PREVIEW_CONCURRENCY)
_inflight: dict[str, Future] = {}
_inflight_lock = threading.Lock()

GENERIC_FAILURE = "לא הצלחנו לקרוא את האתר הזה כרגע. נסו שוב בעוד דקה, או הירשמו והמשיכו בלי הדוגמה."
SLOW_SITE = "האתר נטען לאט. נסו שוב בעוד דקה, ומה שכבר קראנו יישמר."


class PreviewIn(BaseModel):
    url: str = Field(min_length=4, max_length=500)


# The two kinds of scan. "brand" reads the site and the brand only; "full" also writes
# the business guess and the sample post, reusing a cached brand scan when there is one.
FULL, BRAND = "full", "brand"


def _run(key: str, url: str, kind: str) -> dict:
    try:
        if kind == BRAND:
            return preview_service.build_brand_preview(url)
        return preview_service.build_preview(url)
    finally:
        _slots.release()
        with _inflight_lock:
            _inflight.pop(key, None)


def _start(key: str, url: str, kind: str, request: Request) -> Future:
    """Charge the budgets and start a scan, or join one already running for this site."""
    # Refuse internal targets up front, before they cost anyone budget. The scraper
    # checks again on every hop, so this is a fast path, not the guard itself.
    try:
        assert_public_url(url)
    except UnsafeUrlError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    ip = ratelimit._client_ip(request)
    if not ratelimit.allow(f"preview:ip:{ip}", PREVIEW_PER_IP, PREVIEW_WINDOW_SECONDS):
        raise HTTPException(
            status_code=429,
            detail="כבר קראנו מכאן כמה אתרים בשעה האחרונה. נסו שוב מאוחר יותר, או הירשמו והמשיכו משם.",
        )
    if not ratelimit.allow("preview:global", PREVIEW_GLOBAL, PREVIEW_WINDOW_SECONDS):
        raise HTTPException(
            status_code=429,
            detail="יש עומס כרגע. נסו שוב בעוד כמה דקות.",
        )
    if not _slots.acquire(blocking=False):
        raise HTTPException(status_code=503, detail="יש עומס כרגע. נסו שוב בעוד דקה.")
    with _inflight_lock:
        current = _inflight.get(key)
        if current is None:
            future = _pool.submit(_run, key, url, kind)
            _inflight[key] = (kind, future)
            return future
    # Someone else started the same site between our two looks; share it.
    _slots.release()
    return current[1]


def _await(future: Future) -> dict:
    try:
        return future.result(timeout=PREVIEW_REQUEST_SECONDS)
    except FutureTimeout as exc:
        raise HTTPException(status_code=504, detail=SLOW_SITE) from exc
    except preview_service.PreviewError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        # A provider error message is not for an anonymous visitor.
        raise HTTPException(status_code=502, detail=GENERIC_FAILURE) from exc


def _serve(raw_url: str, request: Request, kind: str) -> dict:
    try:
        url = _normalize_url(raw_url)
        key = preview_service.cache_key(url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    lookup = preview_service.cached_brand_preview if kind == BRAND else preview_service.cached_preview
    cached = lookup(url)
    if cached:
        return {**cached, "cached": True}

    with _inflight_lock:
        current = _inflight.get(key)
    if current is not None and (kind == BRAND or current[0] == FULL):
        # Any scan in flight answers a brand request; only a full one answers a full one.
        future = current[1]
    else:
        if current is not None:
            # A brand scan of this site is running: let it land in the cache, so the
            # full preview only has to write the post instead of reading the site again.
            try:
                current[1].result(timeout=PREVIEW_REQUEST_SECONDS)
            except Exception:
                pass
        future = _start(key, url, kind, request)

    result = _await(future)
    if kind == BRAND:
        result = preview_service.brand_part(result)
    return {**result, "cached": False}


@router.post("/preview")
def site_preview(body: PreviewIn, request: Request) -> dict:
    """Brand colours, voice, logo, a business guess and one sample post for a public site.

    No account, no database writes. See the module docstring for the limits.
    """
    return _serve(body.url, request, FULL)


@router.post("/brand")
def site_brand(body: PreviewIn, request: Request) -> dict:
    """The brand only (palette, voice, logo, name, offerings, social links), one model
    call sooner than `/public/preview`, for a flow that reads the site in the background.
    Same limits and the same cache as `/public/preview`.
    """
    return _serve(body.url, request, BRAND)

