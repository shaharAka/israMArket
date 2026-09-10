"""In-process rate limiting for the auth endpoints.

Deliberately dependency-free: an in-memory sliding window is enough to stop credential
stuffing and signup abuse on a single-process deployment, which is what this app runs as.
It is NOT shared across workers or machines — if the API is ever scaled horizontally,
this must move to Redis or the platform's edge limiter, otherwise every worker gets its
own budget. That limitation is called out so nobody assumes more protection than exists.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from app.config import get_settings

_hits: dict[str, deque[float]] = defaultdict(deque)
_lock = threading.Lock()
_MAX_KEYS = 10_000


def _client_ip(request: Request) -> str:
    """Best-effort client identity for rate limiting.

    X-Forwarded-For is trusted only when `trust_forwarded_for` is on, which is the
    correct default for the documented deployment (the Next.js server proxies to the
    API, so every request would otherwise share one bucket and a single user could
    exhaust everyone's budget). If the API is ever exposed directly to the internet,
    set TRUST_FORWARDED_FOR=false — otherwise a client can spoof the header and give
    itself a fresh budget on every request.
    """
    if get_settings().trust_forwarded_for:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def allow(key: str, limit: int, window_seconds: int) -> bool:
    """Record a hit and report whether it is within budget."""
    now = time.monotonic()
    cutoff = now - window_seconds
    with _lock:
        bucket = _hits[key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        # Bound memory: drop empty buckets if the map grows unreasonably.
        if len(_hits) > _MAX_KEYS:
            for stale in [k for k, v in _hits.items() if not v]:
                _hits.pop(stale, None)
        return True


def reset() -> None:
    """Test helper."""
    with _lock:
        _hits.clear()


def auth_rate_limit(name: str, *, by_email: bool = False):
    """FastAPI dependency factory.

    When `by_email` is set the limit applies per IP *and* per submitted email, so a
    single attacker cannot lock out every account from one address, while a distributed
    attack still cannot grind one mailbox. Starlette caches the parsed body, so reading
    it here does not stop the endpoint from reading it again.
    """

    async def dependency(request: Request) -> None:
        settings = get_settings()
        limit = settings.auth_rate_limit
        window = settings.auth_rate_window_seconds

        if not allow(f"{name}:ip:{_client_ip(request)}", limit, window):
            raise HTTPException(
                status_code=429,
                detail="יותר מדי ניסיונות מהכתובת הזו. נסו שוב בעוד כמה דקות.",
            )

        if by_email:
            email = ""
            try:
                payload = await request.json()
                if isinstance(payload, dict):
                    email = str(payload.get("email", "")).strip().lower()
            except Exception:
                email = ""
            if email and not allow(f"{name}:email:{email}", limit, window):
                raise HTTPException(
                    status_code=429,
                    detail="יותר מדי ניסיונות לחשבון הזה. נסו שוב בעוד כמה דקות.",
                )

    return dependency
