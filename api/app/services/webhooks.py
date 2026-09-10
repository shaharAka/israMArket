import hashlib
import hmac
from datetime import datetime, timezone

import httpx

from app.models import WebhookEndpoint
from app.services.jsonutil import dumps


def sign_payload(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def deliver(endpoints: list[WebhookEndpoint], event: str, payload: dict) -> list[dict]:
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
            )
            if response.status_code >= 400:
                results.append({"url": endpoint.url, "ok": False, "error": response.text[:300]})
            else:
                results.append({"url": endpoint.url, "ok": True, "status": response.status_code})
        except httpx.HTTPError as exc:
            results.append({"url": endpoint.url, "ok": False, "error": str(exc)})
    return results
