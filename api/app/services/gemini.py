import re
import time
from typing import Any

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


# A prepaid account that ran out of credit answers 402 RESOURCE_EXHAUSTED. That is not
# load: waiting will not fix it, and retrying it held the public preview for over a
# minute (4+8+16+32s of backoff) before the visitor saw an error.
# ("billing" alone is not a signal: a per-minute 429 also says "check your plan and
# billing details", and that one does clear up.)
_NOT_RETRYABLE = ("limit: 0", "prepayment", "credits are depleted")
_PAYMENT_REQUIRED = re.compile(r"\b402\b")


def _is_retryable(exc: Exception) -> bool:
    text = str(exc)
    if any(token in text for token in _NOT_RETRYABLE) or _PAYMENT_REQUIRED.search(text):
        return False
    # Depleted prepaid credits come back as "402 RESOURCE_EXHAUSTED". Retrying cannot
    # fix billing and only makes the caller wait a minute for the same error.
    if text.startswith("402") or "credits are depleted" in text:
        return False
    return any(token in text for token in _RETRYABLE)


_UNAVAILABLE = ("402", "credits are depleted", "RESOURCE_EXHAUSTED", "limit: 0", "חסר GEMINI_API_KEY")


def is_provider_unavailable(exc: BaseException | None) -> bool:
    """True when the model provider cannot serve us at all right now (billing, quota,
    missing key), as opposed to a bad answer. Walks the cause chain, because callers
    usually see the provider error wrapped in their own."""
    seen = 0
    while exc is not None and seen < 5:
        text = str(exc)
        if any(token in text for token in _UNAVAILABLE):
            return True
        exc = exc.__cause__ or exc.__context__
        seen += 1
    return False


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
    raise last_error or RuntimeError("לא קיבלנו תשובה מה-AI. נסו שוב בעוד כמה דקות.")


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
            raise RuntimeError("קיבלנו תשובה ריקה מה-AI. נסו שוב.")
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


def extract_json(
    prompt: str,
    schema: dict[str, Any],
    images: list[ImageBlob] | None = None,
    thinking_level: str = "MEDIUM",
) -> str:
    """Reading a business off its own site: brand, site profile, the preview's sample post.

    A stronger model than `lite_json`: these outputs are the first thing an owner sees,
    and the lite model followed instructions too literally (platform-default CSS colours,
    a caption copied from the meta description).
    """
    settings = get_settings()
    return generate_json(
        model=settings.gemini_extract_model,
        prompt=prompt,
        schema=schema,
        thinking_level=thinking_level,
        images=images,
    )


def generate_image_bytes(
    prompt: str,
    aspect_ratio: str,
    references: list[ImageBlob] | None = None,
) -> tuple[bytes, str]:
    """Render one image.

    `references` are the business's OWN photographs, scraped from their site. Feeding
    them back in is the cheapest way to stop the model falling back to its default
    look, and to keep a set of cards consistent with each other — see the "kill the
    default look" / "keep the set consistent" rules this implements.
    """
    settings = get_settings()
    client = _client()

    contents: Any = prompt
    if references:
        parts: list[types.Part] = [types.Part.from_text(text=prompt)]
        for data, mime in references:
            parts.append(types.Part.from_bytes(data=data, mime_type=mime))
        contents = parts

    def _run() -> tuple[bytes, str]:
        response = client.models.generate_content(
            model=settings.gemini_image_model,
            contents=contents,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(aspect_ratio=aspect_ratio, image_size=settings.gemini_image_size),
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
                raise RuntimeError(f"לא הצלחנו ליצור תמונה ({finish}). נסו שוב.")
        for part in parts:
            if getattr(part, "thought", False):
                continue
            inline = getattr(part, "inline_data", None)
            if inline and inline.data:
                return bytes(inline.data), inline.mime_type or "image/png"
        raise RuntimeError("לא הצלחנו ליצור תמונה. בדקו את מודל התמונות ואת המפתח.")

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
            raise RuntimeError(f"נגמרה מכסת התמונות של {model}. נסו שוב מאוחר יותר.") from exc
        raise


def strategy_json(prompt: str, schema: dict[str, Any]) -> str:
    settings = get_settings()
    return generate_json(
        model=settings.gemini_strategy_model,
        prompt=prompt,
        schema=schema,
        thinking_level="MEDIUM",
    )
