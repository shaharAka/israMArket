"""Minimal client for Meta's Model API (Muse Spark), used only by the Stream H experiment.

The API is OpenAI-compatible (`/v1/chat/completions`, bearer auth), so this is plain
httpx rather than the `openai` SDK: one fewer dependency for one POST.

Two rules this module enforces rather than documents:

* Never call a `-contributor` model. Their inputs are used to improve Meta's products,
  and every prompt here carries a real business's data. `ContributorModelRefused` is
  raised before any network I/O.
* Never log or echo the key. Error messages carry the API's error code and message,
  never the request headers.
"""

from __future__ import annotations

import base64
import json
import re
import time
from typing import Any, Iterable

import httpx

from app.config import get_settings
from app.services.jsonutil import loads

DEFAULT_MODEL = "muse-spark-1.3"
# The models we have actually seen listed for this key. Anything else is allowed through
# (Meta will add versions) as long as it is not a contributor model.
KNOWN_MODELS = ("muse-spark-1.3", "muse-spark-1.2", "muse-spark-1.1")

# (bytes, mime) — the same shape as gemini.ImageBlob, so callers can pass one list to both.
ImageBlob = tuple[bytes, str]
ImageInput = str | ImageBlob

_TIMEOUT = httpx.Timeout(connect=10.0, read=180.0, write=30.0, pool=10.0)
_RETRY_DELAY_SECONDS = 3.0
_MAX_RETRY_AFTER_SECONDS = 20.0


class MetaModelError(RuntimeError):
    """Base class. `code` is the API's machine-readable error code when it sent one."""

    def __init__(self, message: str, *, status: int | None = None, code: str = "") -> None:
        super().__init__(message)
        self.status = status
        self.code = code


class MissingApiKey(MetaModelError):
    pass


class BillingNotConfigured(MetaModelError):
    pass


class RateLimited(MetaModelError):
    pass


class ModelError(MetaModelError):
    """Anything else: 4xx/5xx, transport failure, or a reply we could not turn into JSON."""


class ModelTimeout(ModelError):
    """The call did not answer within its time budget (`chat_json(timeout=...)`)."""


class ContributorModelRefused(ValueError):
    pass


BILLING_MESSAGE = (
    "Meta Model API: החיוב לא מוגדר בחשבון המפתחים של Meta (billing_not_configured). "
    "צריך להוסיף אמצעי תשלום ב-Meta for Developers ואז להריץ שוב. "
    "/ Billing is not configured on the Meta developer account — add a payment method, then retry."
)


def assert_allowed_model(model: str) -> str:
    name = (model or "").strip()
    if not name:
        raise ValueError("Meta model name is empty.")
    if "contributor" in name.lower():
        raise ContributorModelRefused(
            f"סירוב להשתמש במודל {name}: מודלי contributor משתמשים בקלט לשיפור מוצרי Meta, "
            "ואנחנו שולחים נתוני עסק אמיתיים. / Refusing contributor model: its inputs are "
            "used to improve Meta's products."
        )
    return name


def _image_part(image: ImageInput) -> dict:
    if isinstance(image, str):
        url = image
    else:
        data, mime = image
        url = f"data:{mime or 'image/jpeg'};base64,{base64.b64encode(data).decode('ascii')}"
    return {"type": "image_url", "image_url": {"url": url}}


def _schema_instruction(schema: dict[str, Any]) -> str:
    return (
        "\n\nהחזר JSON תקין בלבד, בלי טקסט לפניו או אחריו ובלי גדרות קוד, "
        "שתואם לסכימת JSON הבאה:\n"
        + json.dumps(schema, ensure_ascii=False)
    )


def _messages(prompt: str, images: Iterable[ImageInput] | None, system: str | None, schema_hint: str) -> list[dict]:
    text = prompt + schema_hint
    content: Any = text
    image_list = list(images or [])
    if image_list:
        content = [{"type": "text", "text": text}, *(_image_part(image) for image in image_list)]
    messages: list[dict] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": content})
    return messages


def _error_fields(response: httpx.Response) -> tuple[str, str]:
    """(code, message) from an OpenAI-style error body, tolerating anything else."""
    body = loads(response.text, None)
    error = body.get("error") if isinstance(body, dict) else None
    if isinstance(error, dict):
        code = str(error.get("code") or error.get("type") or "")
        return code, str(error.get("message") or "")
    if isinstance(error, str):
        return error, ""
    return "", (response.text or "")[:300]


def _is_billing(response: httpx.Response, code: str) -> bool:
    return code == "billing_not_configured" or "billing_not_configured" in (response.text or "") or response.status_code == 402


def _looks_like_unsupported_response_format(response: httpx.Response) -> bool:
    if response.status_code not in {400, 422}:
        return False
    text = (response.text or "").lower()
    return any(token in text for token in ("response_format", "json_schema", "structured"))


def _raise_for(response: httpx.Response) -> None:
    code, message = _error_fields(response)
    status = response.status_code
    if _is_billing(response, code):
        raise BillingNotConfigured(BILLING_MESSAGE, status=status, code=code or "billing_not_configured")
    if status == 429:
        raise RateLimited(
            f"Meta Model API: חריגה ממגבלת קצב (429). נסו שוב בעוד דקה. / Rate limited: {message}",
            status=status,
            code=code,
        )
    if status in {401, 403}:
        raise ModelError(
            f"Meta Model API: המפתח נדחה ({status} {code}). בדקו את META_MODEL_API_KEY. / Key rejected: {message}",
            status=status,
            code=code,
        )
    raise ModelError(f"Meta Model API error {status} {code}: {message}", status=status, code=code)


def _retry_delay(response: httpx.Response | None) -> float:
    if response is not None:
        raw = response.headers.get("retry-after", "")
        try:
            return max(0.0, min(float(raw), _MAX_RETRY_AFTER_SECONDS))
        except ValueError:
            pass
    return _RETRY_DELAY_SECONDS


def _post(
    client: httpx.Client, url: str, headers: dict, payload: dict, deadline: float | None = None
) -> httpx.Response:
    """POST with exactly one retry on 429, 5xx or a transport failure.

    With a `deadline` (time.monotonic()) there is no retry once it has passed, each try
    waits at most until it, and running out raises ModelTimeout, so a slow model costs
    at most its budget. A read timeout is the slow-model case: it is not retried at all.
    """

    def remaining() -> float | None:
        return None if deadline is None else deadline - time.monotonic()

    for attempt in range(2):
        left = remaining()
        if left is not None and left <= 0:
            raise ModelTimeout("Meta Model API: no answer within the time budget.", code="timeout")
        kwargs = {}
        if left is not None:
            kwargs["timeout"] = httpx.Timeout(connect=min(10.0, left), read=left, write=min(30.0, left), pool=min(10.0, left))
        try:
            response = client.post(url, headers=headers, json=payload, **kwargs)
        except httpx.TimeoutException as exc:
            if deadline is not None:
                raise ModelTimeout(
                    f"Meta Model API: no answer within the time budget ({type(exc).__name__}).", code="timeout"
                ) from exc
            if attempt == 0:
                time.sleep(_RETRY_DELAY_SECONDS)
                continue
            raise ModelError(f"Meta Model API: הבקשה נכשלה ({type(exc).__name__}). / Request failed.") from exc
        except httpx.TransportError as exc:
            if attempt == 0:
                time.sleep(_RETRY_DELAY_SECONDS)
                continue
            raise ModelError(f"Meta Model API: הבקשה נכשלה ({type(exc).__name__}). / Request failed.") from exc
        retryable = response.status_code == 429 or response.status_code >= 500
        # A billing error is never going to succeed on retry, whatever status it came with.
        if retryable and attempt == 0 and not _is_billing(response, _error_fields(response)[0]):
            delay = _retry_delay(response)
            left = remaining()
            if left is not None and left <= delay:
                return response
            time.sleep(delay)
            continue
        return response
    raise ModelError("Meta Model API: unreachable retry state")  # pragma: no cover


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def parse_json_text(text: str) -> Any:
    """Parse a model reply that should be JSON but may be wrapped in prose or code fences."""
    raw = (text or "").strip()
    parsed = loads(raw, None)
    if parsed is not None:
        return parsed
    unfenced = _FENCE.sub("", raw).strip()
    parsed = loads(unfenced, None)
    if parsed is not None:
        return parsed
    # Last resort: the outermost {...} or [...] span.
    for opener, closer in (("{", "}"), ("[", "]")):
        start, end = unfenced.find(opener), unfenced.rfind(closer)
        if start != -1 and end > start:
            parsed = loads(unfenced[start : end + 1], None)
            if parsed is not None:
                return parsed
    raise ModelError("Meta Model API: התשובה לא הייתה JSON תקין. / Reply was not valid JSON.")


def _reply_text(body: dict) -> str:
    choices = body.get("choices") or []
    if not choices:
        raise ModelError("Meta Model API: תשובה בלי choices. / Reply had no choices.")
    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, list):  # some OpenAI-compatible servers return content parts
        content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
    if not content:
        refusal = message.get("refusal")
        raise ModelError(f"Meta Model API: תשובה ריקה. / Empty reply. {refusal or ''}".strip())
    return str(content)


def chat_json(
    prompt: str,
    schema: dict[str, Any],
    *,
    model: str = DEFAULT_MODEL,
    images: Iterable[ImageInput] | None = None,
    web_search: bool = False,
    system: str | None = None,
    client: httpx.Client | None = None,
    timeout: float | None = None,
) -> Any:
    """Send one prompt and return the parsed JSON reply.

    `timeout` (seconds) is the budget for the whole call, retries included; past it
    ModelTimeout is raised (a MetaModelError, so post writing falls back to Gemini).

    Structured output is requested with an OpenAI-style `json_schema` response format.
    If the server rejects that parameter, the call is repeated once with the schema
    written into the prompt instead, and the reply is parsed leniently. `images` are
    URLs or (bytes, mime) pairs.
    """
    model = assert_allowed_model(model)
    settings = get_settings()
    key = settings.meta_model_api_key
    if not key:
        raise MissingApiKey("חסר META_MODEL_API_KEY ב-.env. / META_MODEL_API_KEY is not set.")

    url = settings.meta_model_base_url.rstrip("/") + "/chat/completions"
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    image_list = list(images or [])

    def payload(structured: bool) -> dict:
        body: dict[str, Any] = {
            "model": model,
            "messages": _messages(prompt, image_list, system, "" if structured else _schema_instruction(schema)),
        }
        if structured:
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": str(schema.get("title") or "result"), "schema": schema, "strict": False},
            }
        if web_search:
            body["tools"] = [{"type": "web_search"}]
        return body

    deadline = time.monotonic() + timeout if timeout else None
    owns_client = client is None
    http = client or httpx.Client(timeout=_TIMEOUT)
    try:
        response = _post(http, url, headers, payload(structured=True), deadline)
        if _looks_like_unsupported_response_format(response) and not _is_billing(response, _error_fields(response)[0]):
            response = _post(http, url, headers, payload(structured=False), deadline)
        if response.status_code >= 400:
            _raise_for(response)
        body = loads(response.text, None)
        if not isinstance(body, dict):
            raise ModelError("Meta Model API: גוף התשובה אינו JSON. / Response body was not JSON.")
        return parse_json_text(_reply_text(body))
    finally:
        if owns_client:
            http.close()


def list_models(client: httpx.Client | None = None) -> list[str]:
    """`GET /v1/models` — handy for a smoke test; costs nothing."""
    settings = get_settings()
    if not settings.meta_model_api_key:
        raise MissingApiKey("חסר META_MODEL_API_KEY ב-.env. / META_MODEL_API_KEY is not set.")
    owns_client = client is None
    http = client or httpx.Client(timeout=_TIMEOUT)
    try:
        response = http.get(
            settings.meta_model_base_url.rstrip("/") + "/models",
            headers={"Authorization": f"Bearer {settings.meta_model_api_key}"},
        )
        if response.status_code >= 400:
            _raise_for(response)
        body = loads(response.text, {}) or {}
        return [str(item.get("id")) for item in body.get("data") or [] if isinstance(item, dict)]
    finally:
        if owns_client:
            http.close()
