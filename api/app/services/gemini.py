from typing import Any
import time

from google import genai
from google.genai import types

from app.config import get_settings

ImageBlob = tuple[bytes, str]

SYSTEM_HE = (
    "אתה אסטרטג שיווק בכיר לעסקים קטנים בישראל. "
    "כל הפלט בעברית ישראלית חדה ומעשית. "
    "התחשב בלוח השנה העברי, ימי קניות ישראליים, שפה מדוברת, ווצאפ, אינסטגרם ומטא. "
    "אל תמציא מדדים. אם חסר מידע — ציין זאת במפורש."
)

_RETRYABLE = (
    "503",
    "UNAVAILABLE",
    "unavailable",
    "high demand",
    "overloaded",
    "429",
    "RESOURCE_EXHAUSTED",
    "resource exhausted",
)


def _client() -> genai.Client:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise RuntimeError("חסר GEMINI_API_KEY. הוסיפו מפתח ב-.env כדי להריץ את מנוע האסטרטגיה.")
    return genai.Client(api_key=settings.gemini_api_key)


def _is_retryable(exc: Exception) -> bool:
    text = str(exc)
    if "limit: 0" in text:
        return False
    return any(token in text for token in _RETRYABLE)


def _call_with_retry(fn, *, attempts: int = 5):
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            return fn()
        except Exception as exc:
            last_error = exc
            if attempt >= attempts - 1 or not _is_retryable(exc):
                raise
            time.sleep(4 * (2 ** attempt))
    raise last_error or RuntimeError("קריאת Gemini נכשלה")


def generate_json(
    *,
    model: str,
    prompt: str,
    schema: dict[str, Any],
    thinking_level: str,
    images: list[ImageBlob] | None = None,
) -> str:
    settings = get_settings()
    client = _client()
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_HE,
        response_mime_type="application/json",
        response_json_schema=schema,
        thinking_config=types.ThinkingConfig(thinking_level=thinking_level),
    )
    contents: Any = prompt
    if images:
        parts: list[types.Part] = [types.Part.from_text(text=prompt)]
        for data, mime in images:
            parts.append(types.Part.from_bytes(data=data, mime_type=mime))
        contents = parts

    def _run() -> str:
        response = client.models.generate_content(
            model=model or settings.gemini_strategy_model,
            contents=contents,
            config=config,
        )
        if not response.text:
            raise RuntimeError("Gemini החזיר תשובה ריקה")
        return response.text

    return _call_with_retry(_run)


def lite_json(
    prompt: str,
    schema: dict[str, Any],
    images: list[ImageBlob] | None = None,
    thinking_level: str = "LOW",
) -> str:
    settings = get_settings()
    return generate_json(
        model=settings.gemini_lite_model,
        prompt=prompt,
        schema=schema,
        thinking_level=thinking_level,
        images=images,
    )


def generate_image_bytes(
    prompt: str,
    aspect_ratio: str,
) -> tuple[bytes, str]:
    settings = get_settings()
    client = _client()

    def _run() -> tuple[bytes, str]:
        response = client.models.generate_content(
            model=settings.gemini_image_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(aspect_ratio=aspect_ratio, image_size="1K"),
                thinking_config=types.ThinkingConfig(thinking_level="MINIMAL"),
            ),
        )
        parts = getattr(response, "parts", None) or []
        if not parts and response.candidates:
            candidate = response.candidates[0]
            content = candidate.content
            parts = content.parts if content else []
            finish = getattr(candidate, "finish_reason", None)
            if finish and str(finish) not in {"STOP", "FinishReason.STOP", "1"} and not parts:
                raise RuntimeError(f"Gemini לא החזיר תמונה ({finish}).")
        for part in parts:
            if getattr(part, "thought", False):
                continue
            inline = getattr(part, "inline_data", None)
            if inline and inline.data:
                return bytes(inline.data), inline.mime_type or "image/png"
        raise RuntimeError("Gemini לא החזיר תמונה. בדקו את מודל התמונות ואת המפתח.")

    try:
        return _call_with_retry(_run, attempts=2)
    except Exception as exc:
        text = str(exc)
        if "429" in text or "RESOURCE_EXHAUSTED" in text:
            model = settings.gemini_image_model
            if "limit: 0" in text:
                raise RuntimeError(
                    f"למודל {model} אין מכסה במפתח הזה (limit 0). "
                    "צריך תוכנית בתשלום ב-Google AI Studio."
                ) from exc
            raise RuntimeError(f"נגמרה מכסת התמונות למודל {model}.") from exc
        raise


def strategy_json(prompt: str, schema: dict[str, Any]) -> str:
    settings = get_settings()
    return generate_json(
        model=settings.gemini_strategy_model,
        prompt=prompt,
        schema=schema,
        thinking_level="MEDIUM",
    )
