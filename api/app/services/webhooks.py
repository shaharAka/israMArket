import hashlib
import hmac
import time
from datetime import datetime, timezone

import httpx

from app.models import WebhookDelivery, WebhookEndpoint
from app.services.jsonutil import dumps
from app.services.netguard import UnsafeUrlError, assert_public_url


def sign_payload(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def _attempt(endpoint: WebhookEndpoint, body: bytes, event: str, signature: str) -> tuple[bool, int, str]:
    try:
        # The URL is user-supplied, so re-validate at delivery time: a hostname can be
        # repointed at a private address after the endpoint was created.
        assert_public_url(endpoint.url)
    except UnsafeUrlError as exc:
        return False, 0, str(exc)
    try:
        response = httpx.post(
            endpoint.url,
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-IsraMarket-Event": event,
                "X-IsraMarket-Signature": signature,
            },
            timeout=15.0,
            # Never follow redirects: that is the standard way past an SSRF check.
            follow_redirects=False,
        )
    except httpx.HTTPError as exc:
        return False, 0, str(exc)
    if response.status_code >= 400:
        return False, response.status_code, response.text[:300]
    return True, response.status_code, ""


def deliver(
    endpoints: list[WebhookEndpoint],
    event: str,
    payload: dict,
    db=None,
    attempts: int = 3,
) -> list[dict]:
    """Deliver an event, retrying transient failures with backoff.

    Previously a single failed POST was the end of it — a webhook that was briefly down
    lost the event silently. Each attempt is now recorded so a broken endpoint is
    visible instead of invisible.
    """
    body = dumps(
        {
            "event": event,
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }
    ).encode("utf-8")
    results = []
    for endpoint in endpoints:
        allowed = {item.strip() for item in endpoint.events.split(",") if item.strip()}
        if event not in allowed:
            continue
        signature = sign_payload(endpoint.secret, body)

        ok, status, error = False, 0, ""
        used = 0
        for used in range(1, attempts + 1):
            ok, status, error = _attempt(endpoint, body, event, signature)
            if ok:
                break
            if used < attempts:
                time.sleep(min(2 ** (used - 1), 4))

        results.append(
            {"url": endpoint.url, "ok": ok, "status": status, "attempts": used, "error": error}
        )

        if db is not None:
            try:
                db.add(
                    WebhookDelivery(
                        endpoint_id=endpoint.id,
                        event=event,
                        url=endpoint.url,
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
