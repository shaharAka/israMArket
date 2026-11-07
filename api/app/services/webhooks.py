import hashlib
import hmac
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

import httpx
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.models import WebhookDelivery, WebhookEndpoint
from app.services.jsonutil import dumps
from app.services.netguard import UnsafeUrlError, assert_public_url
from app.services.webhook_urls import receiver_origin, validate_endpoint_url


@dataclass(frozen=True)
class Receiver:
    id: int
    business_id: int
    url: str
    secret: str
    events: str


def sign_payload(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def _attempt(endpoint: Receiver, body: bytes, event: str, signature: str, event_id: str) -> tuple[bool, int, str, bool]:
    try:
        # The URL is user-supplied, so re-validate at delivery time: a hostname can be
        # repointed at a private address after the endpoint was created.
        validate_endpoint_url(endpoint.url)
        assert_public_url(endpoint.url)
    except (UnsafeUrlError, ValueError):
        return False, 0, "receiver_url_unavailable", False
    try:
        response = httpx.post(
            endpoint.url,
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-IsraMarket-Event": event,
                "X-IsraMarket-Signature": signature,
                "X-IsraMarket-Delivery-Id": event_id,
            },
            timeout=15.0,
            # Never follow redirects: that is the standard way past an SSRF check.
            follow_redirects=False,
        )
    except httpx.TimeoutException:
        return False, 0, "receiver_timeout", True
    except httpx.HTTPError:
        # Exceptions and response bodies can echo URL credentials or received data.
        return False, 0, "receiver_connection_failed", True
    status = response.status_code
    if 200 <= status < 300:
        return True, status, "", False
    if 300 <= status < 400:
        return False, status, "receiver_redirect_refused", False
    return False, status, "receiver_rejected_delivery", status in {408, 425, 429} or 500 <= status < 600


def _current(db, endpoint: Receiver) -> bool:
    """A captured ORM relationship is not permission to retry a removed receiver."""
    if db is None:
        return True
    try:
        return db.execute(select(WebhookEndpoint.id).where(
            WebhookEndpoint.id == endpoint.id,
            WebhookEndpoint.business_id == endpoint.business_id,
            WebhookEndpoint.url == endpoint.url,
            WebhookEndpoint.secret == endpoint.secret,
            WebhookEndpoint.events == endpoint.events,
        )).first() is not None
    except SQLAlchemyError:
        db.rollback()
        return False


def deliver(
    endpoints: list[WebhookEndpoint],
    event: str,
    payload: dict,
    db=None,
    attempts: int = 3,
    *,
    event_id: str | None = None,
) -> list[dict]:
    """Deliver to this business's current receivers, with at most three attempts.

    The ID and exact signed bytes are stable across retries. Callers use the saved
    record identity so receivers can deduplicate a repeated logical event. Only 2xx
    acknowledges delivery; redirects and permanent refusals are not retried. The
    plan/recommendation must already be committed before invoking this service.
    """
    if event not in {"strategy", "recommendations"}:
        return []
    event_id = event_id or str(uuid4())
    attempts = max(1, min(attempts, 3))
    body = dumps(
        {
            "id": event_id,
            "event": event,
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }
    ).encode("utf-8")
    results = []
    # Do not refresh an expired ORM object after a receiver was deleted mid-request.
    receivers = [Receiver(item.id, item.business_id, item.url, item.secret, item.events) for item in endpoints]
    for endpoint in receivers:
        if endpoint.business_id != payload.get("business_id"):
            continue
        allowed = {item.strip() for item in endpoint.events.split(",") if item.strip()}
        if event not in allowed:
            continue
        signature = sign_payload(endpoint.secret, body)

        ok, status, error = False, 0, ""
        used = 0
        for attempt in range(1, attempts + 1):
            if not _current(db, endpoint):
                error = "receiver_disconnected"
                break
            used = attempt
            ok, status, error, retry = _attempt(endpoint, body, event, signature, event_id)
            if ok or not retry:
                break
            if attempt < attempts:
                time.sleep(min(2 ** (used - 1), 4))

        results.append(
            {"endpoint_id": endpoint.id, "event_id": event_id, "url": receiver_origin(endpoint.url),
             "ok": ok, "status": status, "attempts": used, "error": error}
        )

        if db is not None and _current(db, endpoint):
            try:
                db.add(
                    WebhookDelivery(
                        endpoint_id=endpoint.id,
                        event=event,
                        url=receiver_origin(endpoint.url),
                        ok=1 if ok else 0,
                        status_code=status or 0,
                        attempts=used,
                        error=error[:500],
                    )
                )
                db.commit()
            except Exception:
                # A logging failure must never break delivery.
                db.rollback()
    return results
