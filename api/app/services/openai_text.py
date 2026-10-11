"""Bounded GPT Responses gateway for the existing structured text/vision workloads.

No hosted tools, response storage, media generation or provider fallback. Public-site
research remains in our guarded readers; their evidence enters the existing prompts.
"""
from __future__ import annotations

import base64
from copy import deepcopy
import json
import time
from typing import Any

import httpx

from app.config import get_settings

MODELS = {"gpt-6-luna", "gpt-6.1-sol"}


class OpenAITextError(RuntimeError):
    def __init__(self, message: str, *, retryable: bool = False, provider_unavailable: bool = False):
        super().__init__(message)
        self.retryable = retryable
        self.provider_unavailable = provider_unavailable


def strict_schema(schema: dict) -> dict:
    """Close objects and encode optional fields as nullable, without mutating callers.

    Responses strict output requires every property to be required. After parsing we
    omit only the nulls introduced for originally optional, non-nullable fields.
    """
    out = deepcopy(schema)
    if out.get("type") == "object":
        props = out.get("properties", {})
        if out.get("additionalProperties") not in (None, False):
            raise ValueError("Open-ended output objects require an explicit schema")
        required = set(out.get("required", []))
        out["additionalProperties"] = False
        out["required"] = list(props)
        out["properties"] = {
            name: strict_schema(value) if name in required or nullable(value)
            else {"anyOf": [strict_schema(value), {"type": "null"}]}
            for name, value in props.items()
        }
    if isinstance(out.get("items"), dict):
        out["items"] = strict_schema(out["items"])
    for key in ("anyOf", "oneOf", "allOf"):
        if key in out:
            out[key] = [strict_schema(item) for item in out[key]]
    for key in ("$defs", "definitions"):
        if key in out:
            out[key] = {name: strict_schema(item) for name, item in out[key].items()}
    return out


def nullable(schema: dict) -> bool:
    kind = schema.get("type")
    return kind == "null" or (isinstance(kind, list) and "null" in kind) or any(
        nullable(item) for item in schema.get("anyOf", [])
    )


def original_shape(value: Any, schema: dict) -> Any:
    if isinstance(value, dict) and schema.get("type") == "object":
        required = set(schema.get("required", []))
        props = schema.get("properties", {})
        return {key: original_shape(item, props.get(key, {})) for key, item in value.items()
                if not (key in props and key not in required and item is None and not nullable(props[key]))}
    if isinstance(value, list):
        return [original_shape(item, schema.get("items", {})) for item in value]
    return value


def usage_numbers(body: dict) -> dict:
    usage = body.get("usage") or {}
    details = usage.get("input_tokens_details") or {}
    thinking = (usage.get("output_tokens_details") or {}).get("reasoning_tokens", 0) or 0
    # Responses output_tokens INCLUDES reasoning. The shared hook contract keeps
    # visible output separate so accounting never bills thinking twice.
    return {
        "prompt_tokens": usage.get("input_tokens", 0) or 0,
        "cached_input_tokens": details.get("cached_tokens", 0) or 0,
        "cache_write_tokens": details.get("cache_creation_tokens", details.get("cache_write_tokens", 0)) or 0,
        "output_tokens": max(0, (usage.get("output_tokens", 0) or 0) - thinking),
        "thinking_tokens": thinking,
    }


def _response_text(body: dict) -> str:
    if body.get("status") != "completed":
        raise OpenAITextError("התשובה לא הושלמה. אפשר לנסות שוב.")
    parts = []
    for item in body.get("output") or []:
        for content in item.get("content") or []:
            if content.get("type") == "refusal":
                raise OpenAITextError("לא הצלחנו להכין תשובה לבקשה הזו.")
            if content.get("type") == "output_text":
                parts.append(content.get("text") or "")
    if not parts:
        raise OpenAITextError("קיבלנו תשובה ריקה מה-AI. נסו שוב.")
    return "".join(parts)


def generate_json(*, model: str, prompt: str, schema: dict, thinking_level: str,
                  images: list[tuple[bytes, str]] | None = None, system: str = "",
                  attempts: int = 2, timeout_seconds: float | None = None,
                  max_output_tokens: int | None = None, usage_hooks: list | None = None) -> str:
    settings = get_settings()
    if not settings.openai_api_key:
        raise OpenAITextError("חסר OPENAI_API_KEY.", provider_unavailable=True)
    if model not in MODELS:
        raise ValueError("Unsupported GPT text model")
    effort = (thinking_level or "MEDIUM").lower()
    if effort not in {"low", "medium", "high", "xhigh", "max"}:
        effort = "low"
    content = [{"type": "input_text", "text": prompt}]
    for data, mime in images or []:
        if mime not in {"image/png", "image/jpeg", "image/webp", "image/gif"}:
            raise ValueError("Unsupported vision image type")
        content.append({"type": "input_image", "image_url": f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"})
    payload = {
        "model": model, "instructions": system, "input": [{"role": "user", "content": content}],
        "reasoning": {"effort": effort}, "store": False, "service_tier": "default",
        "max_output_tokens": max_output_tokens or (4096 if model == "gpt-6-luna" else 16384),
        "text": {"format": {"type": "json_schema", "name": "marketing_output",
                            "strict": True, "schema": strict_schema(schema)}},
    }
    timeout = timeout_seconds if timeout_seconds is not None else settings.openai_timeout_seconds
    with httpx.Client(timeout=timeout or 180, transport=httpx.HTTPTransport(retries=0)) as client:
        for attempt in range(max(1, min(attempts, 2))):
            try:
                response = client.post("https://api.openai.com/v1/responses", json=payload,
                                       headers={"Authorization": "Bearer " + settings.openai_api_key})
            except httpx.RequestError:
                # A timed-out request may have completed and been billed. No retry.
                raise OpenAITextError("השירות לא השיב בזמן. אפשר לנסות שוב.") from None
            if response.is_error:
                try:
                    code = (response.json().get("error") or {}).get("code", "")
                except (ValueError, AttributeError):
                    code = ""
                unavailable = response.status_code in {401, 403, 402} or code in {"insufficient_quota", "billing_hard_limit_reached"}
                retryable = not unavailable and response.status_code in {429, 500, 502, 503, 504}
                if retryable and attempt + 1 < max(1, min(attempts, 2)):
                    time.sleep(2)
                    continue
                # Do not expose provider bodies, submitted content or credentials.
                raise OpenAITextError("שירות ה-AI אינו זמין כרגע. אפשר לנסות שוב מאוחר יותר.",
                                      retryable=retryable, provider_unavailable=unavailable)
            body = response.json()
            for hook in list(usage_hooks or []):
                try:
                    hook(model, usage_numbers(body))
                except Exception:
                    pass
            raw = _response_text(body)
            try:
                parsed = json.loads(raw)
            except ValueError:
                raise OpenAITextError("לא הצלחנו לקרוא את התשובה. אפשר לנסות שוב.") from None
            return json.dumps(original_shape(parsed, schema), ensure_ascii=False)
    raise OpenAITextError("שירות ה-AI אינו זמין כרגע.")
