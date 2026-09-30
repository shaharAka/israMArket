"""PayPal REST client for subscription billing (Billing Plans + Subscriptions).

Only what billing needs: an OAuth client-credentials token (cached until shortly before it
expires), reading and cancelling a subscription, verifying a webhook's signature, and —
for the one-off setup job (app/jobs/paypal_setup.py) — creating the product and plan.

Card details never reach us: the browser's PayPal buttons (JS SDK, `vault=true&
intent=subscription`) talk to PayPal directly, and we only ever see a subscription id,
which this module then reads back from PayPal itself.

Secrets: the client secret and the access token are never logged, never returned and
never put in an exception message. Log lines carry the HTTP status and PayPal's
`debug_id` (which PayPal support asks for), nothing else from the response.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import time
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

BASE_URLS = {
    "sandbox": "https://api-m.sandbox.paypal.com",
    "live": "https://api-m.paypal.com",
}

# The monthly price, charged in shekels. Must match PRICE_ILS in web/lib/pricing.ts
# (tests/test_billing.py checks it). VAT excluded: see docs/billing.md, "VAT".
PRICE_ILS = 99
CURRENCY = "ILS"

TIMEOUT = httpx.Timeout(15.0, connect=5.0)
# Refresh the token this many seconds before PayPal says it expires.
TOKEN_MARGIN_SECONDS = 120

# PayPal's ids are upper-case letters, digits and dashes ("I-BW452GLLEP1G", "P-5ML4271244454362WXNWU5NQ").
# Anything else is refused before it can be put into a URL path.
_ID = re.compile(r"^[A-Za-z0-9-]{3,64}$")

# Tests replace this with an httpx.MockTransport; production uses the default transport.
_TRANSPORT: httpx.BaseTransport | None = None

# Hebrew messages the owner may see.
MSG_UNAVAILABLE = "לא הצלחנו להתחבר לפייפאל. נסו שוב בעוד כמה דקות."
MSG_NOT_CONFIGURED = "התשלום עוד לא פתוח."
MSG_NOT_FOUND = "לא מצאנו את המנוי בפייפאל. נסו שוב."


class PayPalError(Exception):
    """A PayPal call failed. `message_he` is safe to show; `status` is PayPal's HTTP status
    (0 when PayPal could not be reached)."""

    def __init__(self, message_he: str, status: int = 0, debug_id: str = "", name: str = ""):
        super().__init__(message_he)
        self.message_he = message_he
        self.status = status
        self.debug_id = debug_id
        self.name = name


def settings():
    """The one place billing reads settings from (tests patch `get_settings` here)."""
    return get_settings()


def env() -> str:
    value = (settings().paypal_env or "sandbox").strip().lower()
    return value if value in BASE_URLS else "sandbox"


def base_url() -> str:
    return BASE_URLS[env()]


def credentials_configured() -> bool:
    """API credentials exist (enough for the setup job)."""
    s = settings()
    return bool(s.paypal_client_id.strip() and s.paypal_client_secret.strip())


def configured() -> bool:
    """Checkout can be offered: credentials and the monthly plan are set."""
    return credentials_configured() and bool(settings().paypal_plan_id.strip())


def webhook_configured() -> bool:
    return credentials_configured() and bool(settings().paypal_webhook_id.strip())


def valid_id(value: str) -> bool:
    return bool(value) and bool(_ID.match(value))


# --- token --------------------------------------------------------------------------

_token_lock = threading.Lock()
_token_cache: dict[str, Any] = {"token": None, "expires_at": 0.0, "key": None}


def reset_token_cache() -> None:
    with _token_lock:
        _token_cache.update(token=None, expires_at=0.0, key=None)


def _client() -> httpx.Client:
    return httpx.Client(base_url=base_url(), timeout=TIMEOUT, transport=_TRANSPORT)


def _debug_id(response: httpx.Response) -> str:
    return response.headers.get("paypal-debug-id", "")


def _error_name(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return ""
    if isinstance(data, dict):
        return str(data.get("name") or data.get("error") or "")
    return ""


def access_token() -> str:
    """A client-credentials token, cached until TOKEN_MARGIN_SECONDS before expiry."""
    if not credentials_configured():
        raise PayPalError(MSG_NOT_CONFIGURED)
    s = settings()
    # A change of environment or client id must never reuse the other one's token.
    key = (env(), s.paypal_client_id)
    with _token_lock:
        if _token_cache["token"] and _token_cache["key"] == key and time.time() < _token_cache["expires_at"]:
            return _token_cache["token"]
        try:
            with _client() as client:
                response = client.post(
                    "/v1/oauth2/token",
                    data={"grant_type": "client_credentials"},
                    auth=(s.paypal_client_id, s.paypal_client_secret),
                    headers={"Accept": "application/json"},
                )
        except httpx.HTTPError as exc:
            logger.warning("paypal token request failed: %s", type(exc).__name__)
            raise PayPalError(MSG_UNAVAILABLE) from None
        if response.status_code != 200:
            logger.warning("paypal token request answered %s (debug_id=%s)", response.status_code, _debug_id(response))
            raise PayPalError(MSG_UNAVAILABLE, response.status_code, _debug_id(response), _error_name(response))
        try:
            data = response.json()
            token = str(data["access_token"])
            expires_in = float(data.get("expires_in") or 0)
        except (ValueError, KeyError, TypeError):
            raise PayPalError(MSG_UNAVAILABLE, response.status_code) from None
        _token_cache.update(
            token=token,
            expires_at=time.time() + max(0.0, expires_in - TOKEN_MARGIN_SECONDS),
            key=key,
        )
        return token


def _request(
    method: str,
    path: str,
    *,
    json_body: Any = None,
    content: bytes | None = None,
    headers: dict | None = None,
    params: dict | None = None,
    _retry: bool = True,
) -> httpx.Response:
    token = access_token()
    all_headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    if json_body is not None or content is not None:
        all_headers["Content-Type"] = "application/json"
    all_headers.update(headers or {})
    try:
        with _client() as client:
            response = client.request(method, path, json=json_body, content=content, headers=all_headers, params=params)
    except httpx.HTTPError as exc:
        logger.warning("paypal %s %s failed: %s", method, path.split("?")[0], type(exc).__name__)
        raise PayPalError(MSG_UNAVAILABLE) from None
    if response.status_code == 401 and _retry:
        # The cached token was revoked or expired early: drop it and try once more.
        reset_token_cache()
        return _request(method, path, json_body=json_body, content=content, headers=headers, params=params, _retry=False)
    return response


def _raise_for(response: httpx.Response, what: str, not_found_he: str = MSG_UNAVAILABLE) -> None:
    if 200 <= response.status_code < 300:
        return
    logger.warning("paypal %s answered %s (debug_id=%s)", what, response.status_code, _debug_id(response))
    message = not_found_he if response.status_code == 404 else MSG_UNAVAILABLE
    raise PayPalError(message, response.status_code, _debug_id(response), _error_name(response))


# --- subscriptions ------------------------------------------------------------------


def get_subscription(subscription_id: str) -> dict:
    if not valid_id(subscription_id):
        raise PayPalError(MSG_NOT_FOUND, 404)
    response = _request("GET", f"/v1/billing/subscriptions/{subscription_id}")
    _raise_for(response, "get subscription", MSG_NOT_FOUND)
    try:
        data = response.json()
    except ValueError:
        raise PayPalError(MSG_UNAVAILABLE, response.status_code) from None
    if not isinstance(data, dict):
        raise PayPalError(MSG_UNAVAILABLE, response.status_code)
    return data


def cancel_subscription(subscription_id: str, reason: str) -> None:
    """Cancel at PayPal. A subscription that is already cancelled or expired counts as done
    (PayPal answers 422 SUBSCRIPTION_STATUS_INVALID for it)."""
    if not valid_id(subscription_id):
        raise PayPalError(MSG_NOT_FOUND, 404)
    response = _request(
        "POST",
        f"/v1/billing/subscriptions/{subscription_id}/cancel",
        json_body={"reason": reason[:127]},
    )
    if response.status_code == 422 and _error_name(response) in {"UNPROCESSABLE_ENTITY", ""}:
        try:
            details = response.json().get("details") or []
        except (ValueError, AttributeError):
            details = []
        if any(isinstance(d, dict) and d.get("issue") == "SUBSCRIPTION_STATUS_INVALID" for d in details):
            return
    _raise_for(response, "cancel subscription", MSG_NOT_FOUND)


# --- webhooks -----------------------------------------------------------------------

WEBHOOK_HEADERS = {
    "auth_algo": "paypal-auth-algo",
    "cert_url": "paypal-cert-url",
    "transmission_id": "paypal-transmission-id",
    "transmission_sig": "paypal-transmission-sig",
    "transmission_time": "paypal-transmission-time",
}


def verify_webhook(headers: dict[str, str], raw_body: bytes) -> bool:
    """Ask PayPal whether this delivery is genuine (`/v1/notifications/verify-webhook-signature`).

    False for anything short of PayPal's "SUCCESS": missing headers, a body that is not
    JSON, PayPal unreachable. The event is sent back exactly as received (the raw bytes are
    spliced in, not re-serialised), because a re-encoded body can fail verification.
    """
    if not webhook_configured():
        return False
    lowered = {key.lower(): value for key, value in headers.items()}
    fields = {name: lowered.get(header, "") for name, header in WEBHOOK_HEADERS.items()}
    if not all(fields.values()):
        return False
    try:
        event = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return False
    if not isinstance(event, dict):
        return False
    fields["webhook_id"] = settings().paypal_webhook_id.strip()
    # {"auth_algo": …, …, "webhook_event": <raw body>}
    head = json.dumps(fields)[:-1]
    payload = head.encode() + b', "webhook_event": ' + raw_body.strip() + b"}"
    try:
        response = _request("POST", "/v1/notifications/verify-webhook-signature", content=payload)
    except PayPalError:
        return False
    if response.status_code != 200:
        logger.warning("paypal webhook verification answered %s (debug_id=%s)", response.status_code, _debug_id(response))
        return False
    try:
        return response.json().get("verification_status") == "SUCCESS"
    except (ValueError, AttributeError):
        return False


# --- catalog (setup job only) -------------------------------------------------------


def create_product(payload: dict, request_id: str) -> dict:
    response = _request("POST", "/v1/catalogs/products", json_body=payload, headers={"PayPal-Request-Id": request_id})
    _raise_for(response, "create product")
    return response.json()


def get_product(product_id: str) -> dict | None:
    if not valid_id(product_id):
        return None
    response = _request("GET", f"/v1/catalogs/products/{product_id}")
    if response.status_code == 404:
        return None
    _raise_for(response, "get product")
    return response.json()


def list_plans(product_id: str) -> list[dict]:
    response = _request(
        "GET",
        "/v1/billing/plans",
        params={"product_id": product_id, "page_size": 20, "total_required": "true"},
        headers={"Prefer": "return=representation"},
    )
    _raise_for(response, "list plans")
    plans = response.json().get("plans") or []
    return [plan for plan in plans if isinstance(plan, dict)]


def create_plan(payload: dict, request_id: str) -> dict:
    response = _request(
        "POST",
        "/v1/billing/plans",
        json_body=payload,
        headers={"PayPal-Request-Id": request_id, "Prefer": "return=representation"},
    )
    _raise_for(response, "create plan")
    return response.json()
