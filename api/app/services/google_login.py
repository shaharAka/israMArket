"""Sign in with Google: OpenID Connect, authorization-code flow with PKCE.

Deliberately separate from the Analytics connection in services/ga4.py. It uses the same
OAuth client (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) but asks only for `openid email
profile`, which Google classes as non-sensitive, so signing in never waits on the
sensitive-scope verification the Analytics and Search Console scopes need. Nothing from
Google is stored except the account id (`sub`): no access token, no refresh token.

The browser round trip:

1. `/auth/google/start` makes a PKCE verifier and a nonce, keeps both in a short-lived
   signed httpOnly cookie, and sends the browser to Google with a signed `state` that
   carries where to go next and the same nonce.
2. `/auth/google/callback` accepts the code only when the state's signature holds, it has
   not expired, and its nonce matches the cookie in *this* browser (so a code started by
   someone else cannot sign this browser into their account). The code is exchanged with
   the verifier, and the ID token is checked: Google's signature, issuer, audience, expiry,
   nonce, and `email_verified`.

Tokens and codes are never logged, and Google's error bodies never reach a redirect.
"""

from __future__ import annotations

import base64
import hashlib
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlsplit

import httpx
from jose import JWTError, jwt

from app.config import get_settings
from app.security import ALGORITHM

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
LOGIN_SCOPES = ["openid", "email", "profile"]
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}

# The PKCE verifier and nonce, between /start and /callback. httpOnly, 10 minutes.
FLOW_COOKIE = "isramarket_google_login"
FLOW_TTL_SECONDS = 600
_STATE_KIND = "google_login"
_FLOW_KIND = "google_login_flow"

# Where a success lands when `next` is missing or refused, and where an error lands when
# the page that started the flow is unknown.
DEFAULT_NEXT = "/dashboard"
DEFAULT_BACK = "/login"


class GoogleLoginError(Exception):
    """A failure with a short code the web app turns into a Hebrew sentence.

    Codes: cancelled, denied, misconfigured, expired, unverified, conflict, failed,
    rate_limited, account_suspended (the backoffice suspended the account). See
    web/lib/googleAuth.ts for the copy.
    """

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def configured() -> bool:
    settings = get_settings()
    return bool(settings.google_client_id and settings.google_client_secret)


def redirect_uri() -> str:
    return f"{get_settings().oauth_callback_base()}/auth/google/callback"


def safe_path(value: str | None, default: str) -> str:
    """`value` when it is a path on this site, otherwise `default`.

    The only redirect targets are paths appended to WEB_ORIGIN, never a URL taken from the
    request, so `https://evil.example`, `//evil.example`, `/\\evil.example` and anything
    with a scheme, a host, whitespace or control characters falls back to the default.
    The API's own proxy prefix is refused too: a login never bounces back into the API.
    """
    if not value or len(value) > 512:
        return default
    if not value.startswith("/") or value.startswith("//") or "\\" in value:
        return default
    if any(ord(ch) <= 0x20 or ord(ch) == 0x7F for ch in value):
        return default
    parts = urlsplit(value)
    if parts.scheme or parts.netloc:
        return default
    if parts.path == "/backend" or parts.path.startswith("/backend/"):
        return default
    return value


def with_error(path: str, code: str) -> str:
    joiner = "&" if "?" in path else "?"
    return f"{path}{joiner}{urlencode({'google_error': code})}"


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def new_flow() -> dict:
    """A fresh PKCE verifier (RFC 7636, 43+ chars) with its S256 challenge, and a nonce."""
    verifier = _b64url(secrets.token_bytes(48))
    challenge = _b64url(hashlib.sha256(verifier.encode("ascii")).digest())
    return {"verifier": verifier, "challenge": challenge, "nonce": _b64url(secrets.token_bytes(24))}


def _expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(seconds=FLOW_TTL_SECONDS)


def encode_state(next_path: str, back_path: str, nonce: str) -> str:
    return jwt.encode(
        {"p": _STATE_KIND, "next": next_path, "back": back_path, "n": nonce, "exp": _expiry()},
        get_settings().jwt_secret,
        algorithm=ALGORITHM,
    )


def decode_state(state: str) -> dict:
    """The state's claims, or GoogleLoginError("expired") for anything not ours or stale."""
    try:
        claims = jwt.decode(state or "", get_settings().jwt_secret, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise GoogleLoginError("expired") from exc
    if claims.get("p") != _STATE_KIND or not claims.get("n"):
        raise GoogleLoginError("expired")
    return claims


def encode_flow_cookie(verifier: str, nonce: str) -> str:
    return jwt.encode(
        {"p": _FLOW_KIND, "v": verifier, "n": nonce, "exp": _expiry()},
        get_settings().jwt_secret,
        algorithm=ALGORITHM,
    )


def decode_flow_cookie(value: str | None) -> dict:
    try:
        claims = jwt.decode(value or "", get_settings().jwt_secret, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise GoogleLoginError("expired") from exc
    if claims.get("p") != _FLOW_KIND or not claims.get("v") or not claims.get("n"):
        raise GoogleLoginError("expired")
    return claims


def authorization_url(state: str, challenge: str, nonce: str) -> str:
    settings = get_settings()
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": " ".join(LOGIN_SCOPES),
        "state": state,
        "nonce": nonce,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        # Let the owner pick which Google account, instead of silently using the one the
        # browser happens to be signed into. No offline access: nothing is kept.
        "prompt": "select_account",
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


def exchange_code(code: str, verifier: str) -> str:
    """The raw ID token for `code`. Google's response body is never logged or surfaced."""
    settings = get_settings()
    if not code:
        raise GoogleLoginError("failed")
    try:
        response = httpx.post(
            TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": redirect_uri(),
                "grant_type": "authorization_code",
                "code_verifier": verifier,
            },
            timeout=15.0,
        )
    except httpx.HTTPError as exc:
        raise GoogleLoginError("failed") from exc
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    if response.status_code >= 400:
        error = str(payload.get("error") or "") if isinstance(payload, dict) else ""
        # A wrong secret or an unregistered redirect URI is ours to fix, not the owner's.
        if error in {"invalid_client", "unauthorized_client", "redirect_uri_mismatch"}:
            raise GoogleLoginError("misconfigured")
        raise GoogleLoginError("failed")
    raw = payload.get("id_token") if isinstance(payload, dict) else None
    if not raw or not isinstance(raw, str):
        raise GoogleLoginError("failed")
    return raw


def _google_verify(raw: str, audience: str) -> dict:
    """Google's signature check (its published certs), plus issuer, audience and expiry.

    Imported lazily and kept as its own function so tests replace exactly this network step
    and still exercise every check in `verify_id_token`.
    """
    from google.auth import exceptions as google_exceptions
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    try:
        return google_id_token.verify_oauth2_token(
            raw, google_requests.Request(), audience=audience, clock_skew_in_seconds=10
        )
    except (ValueError, google_exceptions.GoogleAuthError) as exc:
        raise GoogleLoginError("failed") from exc


def _verified_claims(raw: str) -> dict:
    """Signature, issuer, audience and expiry. The library already checks the last three;
    they are checked again here so the rules are visible in one place and do not depend on
    a library default."""
    settings = get_settings()
    claims = _google_verify(raw, settings.google_client_id)
    if claims.get("iss") not in GOOGLE_ISSUERS:
        raise GoogleLoginError("failed")
    aud = claims.get("aud")
    if (aud if isinstance(aud, str) else None) != settings.google_client_id:
        raise GoogleLoginError("failed")
    exp = claims.get("exp")
    if not isinstance(exp, (int, float)) or exp < time.time() - 10:
        raise GoogleLoginError("expired")
    return claims


def _identity(claims: dict) -> dict:
    sub = str(claims.get("sub") or "").strip()
    email = str(claims.get("email") or "").strip().lower()
    if not sub or not email:
        raise GoogleLoginError("failed")
    name = str(claims.get("name") or "").strip()[:120]
    return {"sub": sub, "email": email, "name": name}


def verify_id_token(raw: str, nonce: str) -> dict:
    """The verified identity for signing in: {"sub", "email", "name"}. Also requires the
    nonce of this browser's flow and a Google-verified email address."""
    claims = _verified_claims(raw)
    if not nonce or claims.get("nonce") != nonce:
        raise GoogleLoginError("expired")
    identity = _identity(claims)
    if claims.get("email_verified") not in (True, "true"):
        raise GoogleLoginError("unverified")
    return identity


def account_of(raw: str | None) -> dict | None:
    """Which Google account granted a connection (the Analytics flow asks for `openid
    email` too, so its token response carries an ID token): {"sub", "email", "name"}, or
    None when it cannot be told. Never raises: knowing the account is for a warning, and a
    failed check must not undo a grant the owner just gave."""
    if not raw:
        return None
    try:
        return _identity(_verified_claims(raw))
    except GoogleLoginError:
        return None
