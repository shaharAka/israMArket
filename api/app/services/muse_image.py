"""Muse Image (Meta Model API): new images and edits of the owner's real photos.

`POST {META_MODEL_BASE_URL}/images/generations` and `/images/edits`, the request shapes
`scripts/image_bench.py` ran in the bench (docs/image-models.md). $0.01 per image; a
refused or failed image is not billed.

Rules enforced here, as in services/meta_model.py:
* never a `-contributor` model (refused before any network I/O);
* the key goes only in the Authorization header and never into an error message;
* a policy refusal (`content_policy_violation`, e.g. lingerie generation) is its own
  exception, so the router can fall back to Nano Banana 2 and record why.
"""

from __future__ import annotations

import base64
import time

import httpx

from app.config import get_settings
from app.services.jsonutil import loads
from app.services.meta_model import assert_allowed_model
from app.services.netguard import UnsafeUrlError, safe_get

# Muse's `size` sets the aspect ratio, not the exact pixel size.
SIZES = {"4:5": "1024x1280", "9:16": "1080x1920", "1:1": "1024x1024"}
_REFUSAL_CODES = {"content_policy_violation", "moderation_blocked"}


class MuseImageError(RuntimeError):
    def __init__(self, message: str, *, code: str = "", status: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.status = status


class MuseRefused(MuseImageError):
    """The provider's content policy refused the request (not billed)."""


class MuseTimeout(MuseImageError):
    pass


def size_for(aspect_ratio: str) -> str:
    return SIZES.get(aspect_ratio, SIZES["4:5"])


def _sniff(data: bytes) -> str:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/png"


def _error(response: httpx.Response) -> MuseImageError:
    body = loads(response.text, None)
    error = body.get("error") if isinstance(body, dict) else None
    if isinstance(error, dict):
        code = str(error.get("code") or error.get("type") or "")
        message = str(error.get("message") or "")
    else:
        code, message = str(error or ""), (response.text or "")[:300]
    text = f"Muse Image {response.status_code} {code}: {message}".strip()
    # `unsupported_parameter` is a request error, never a refusal.
    if code in _REFUSAL_CODES or (code != "unsupported_parameter" and "content management policy" in message.lower()):
        return MuseRefused(text, code=code or "content_policy_violation", status=response.status_code)
    return MuseImageError(text, code=code, status=response.status_code)


def _request(path: str, body: dict, *, client: httpx.Client | None, timeout: float | None) -> tuple[bytes, str]:
    settings = get_settings()
    model = assert_allowed_model(settings.muse_image_model)
    key = settings.meta_model_api_key
    if not key:
        raise MuseImageError("Muse Image: META_MODEL_API_KEY is not set.", code="missing_key")
    budget = float(timeout if timeout is not None else settings.muse_image_timeout_seconds or 0) or None
    url = settings.meta_model_base_url.rstrip("/") + path
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    payload = {"model": model, "n": 1, "response_format": "b64_json", **body}
    http_timeout = httpx.Timeout(budget, connect=min(10.0, budget)) if budget else httpx.Timeout(300, connect=15)
    owns = client is None
    http = client or httpx.Client(timeout=http_timeout)
    started = time.monotonic()
    try:
        try:
            response = http.post(url, headers=headers, json=payload, timeout=http_timeout)
        except httpx.TimeoutException as exc:
            raise MuseTimeout(f"Muse Image: no answer within {budget or 300:.0f} s.", code="timeout") from exc
        except httpx.TransportError as exc:
            raise MuseImageError(f"Muse Image: request failed ({type(exc).__name__}).", code="transport") from exc
        if response.status_code >= 400:
            raise _error(response)
        reply = loads(response.text, None)
        item = ((reply or {}).get("data") or [{}])[0] if isinstance(reply, dict) else {}
        if item.get("b64_json"):
            data = base64.b64decode(item["b64_json"])
        elif item.get("url"):
            left = None if budget is None else max(5.0, budget - (time.monotonic() - started))
            try:
                fetched = safe_get(http, str(item["url"]), timeout=left or 60)
            except (httpx.HTTPError, UnsafeUrlError) as exc:
                raise MuseImageError(f"Muse Image: could not download the image ({type(exc).__name__}).") from exc
            if fetched.status_code >= 400:
                raise MuseImageError(f"Muse Image: image download answered {fetched.status_code}.")
            data = fetched.content
        else:
            # An empty answer is how a filtered image can come back: treat it as a refusal.
            raise MuseRefused("Muse Image: the reply carried no image.", code="no_image")
        return data, _sniff(data)
    finally:
        if owns:
            http.close()


def generate(prompt: str, aspect_ratio: str, *, client: httpx.Client | None = None,
             timeout: float | None = None) -> tuple[bytes, str]:
    """A new image from the prompt alone; (bytes, mime)."""
    return _request("/images/generations", {"prompt": prompt, "size": size_for(aspect_ratio)},
                    client=client, timeout=timeout)


def edit(prompt: str, image: tuple[bytes, str], aspect_ratio: str, *, client: httpx.Client | None = None,
         timeout: float | None = None) -> tuple[bytes, str]:
    """The owner's photo, edited by the prompt; (bytes, mime)."""
    data, mime = image
    data_url = f"data:{mime or 'image/jpeg'};base64,{base64.b64encode(data).decode('ascii')}"
    return _request(
        "/images/edits",
        {"prompt": prompt, "size": size_for(aspect_ratio), "images": [{"image_url": data_url}]},
        client=client,
        timeout=timeout,
    )
