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
    # Without a timeout a request that never answers holds its caller (a month being
    # built in the background, services/generation_jobs.py) forever. HttpOptions is in ms.
    timeout = float(getattr(settings, "gemini_timeout_seconds", 0) or 0)
    if timeout > 0:
        return genai.Client(
            api_key=settings.gemini_api_key,
            http_options=types.HttpOptions(timeout=int(timeout * 1000)),
        )
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


# Callables `(model, usage)` told about every text call's token usage (prompt, output,
# thinking). Empty in the app; scripts (dna_smoke, design_review) add one to measure
# what a run really spent. Never carries the prompt, the answer or the key.
USAGE_HOOKS: list = []


def _report_usage(model: str, response) -> None:
    if not USAGE_HOOKS:
        return
    usage = getattr(response, "usage_metadata", None)
    numbers = {
        "prompt_tokens": getattr(usage, "prompt_token_count", 0) or 0,
        "output_tokens": getattr(usage, "candidates_token_count", 0) or 0,
        "thinking_tokens": getattr(usage, "thoughts_token_count", 0) or 0,
    }
    for hook in list(USAGE_HOOKS):
        try:
            hook(model, numbers)
        except Exception:  # a measuring hook never breaks a call
            pass


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
    system: str | None = None,
    attempts: int = 5,
) -> str:
    settings = get_settings()
    client = _client()
    config = types.GenerateContentConfig(
        system_instruction=system or SYSTEM_HE,
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
        _report_usage(model or settings.gemini_strategy_model, response)
        if not response.text:
            raise RuntimeError("קיבלנו תשובה ריקה מה-AI. נסו שוב.")
        return response.text

    return _call_with_retry(_run, attempts=attempts)


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


# A reference photo is the business's OWN photograph. Each one is sent right after a text
# part saying what it is, so the model edits it instead of reading it as a loose style hint
# (the "unlabelled references" problem in docs/design-dna.md).
LabelledImage = tuple[bytes, str, str]


def _image_usage(response) -> dict:
    usage = getattr(response, "usage_metadata", None)
    if usage is None:
        return {}
    out = {
        "prompt_tokens": getattr(usage, "prompt_token_count", 0) or 0,
        "output_tokens": getattr(usage, "candidates_token_count", 0) or 0,
        "thinking_tokens": getattr(usage, "thoughts_token_count", 0) or 0,
        "output_image_tokens": 0,
    }
    for detail in getattr(usage, "candidates_tokens_details", None) or []:
        modality = getattr(detail, "modality", None)
        name = str(getattr(modality, "name", modality) or "")
        if name.upper().endswith("IMAGE"):
            out["output_image_tokens"] = getattr(detail, "token_count", 0) or 0
    return out


def generate_image_bytes(
    prompt: str,
    aspect_ratio: str,
    references: list[ImageBlob] | None = None,
) -> tuple[bytes, str]:
    """Render one image with the configured Gemini image model; (bytes, mime)."""
    result = generate_image(prompt, aspect_ratio, references=references)
    return result["data"], result["mime"]


def generate_image(
    prompt: str,
    aspect_ratio: str,
    *,
    model: str | None = None,
    image_size: str | None = None,
    references: list[ImageBlob] | None = None,
    labelled: list[LabelledImage] | None = None,
) -> dict:
    """Render one image: {"data", "mime", "model", "image_size", "usage"}.

    `labelled` are (bytes, mime, label) photos, each sent after its label: how the
    business's real photo is handed over to be edited. `references` (unlabelled) are kept
    for older callers.
    """
    settings = get_settings()
    client = _client()
    model = model or settings.gemini_image_model
    size = image_size or settings.gemini_image_size

    contents: Any = prompt
    if references or labelled:
        parts: list[types.Part] = [types.Part.from_text(text=prompt)]
        for data, mime, label in labelled or []:
            parts.append(types.Part.from_text(text=label))
            parts.append(types.Part.from_bytes(data=data, mime_type=mime))
        for data, mime in references or []:
            parts.append(types.Part.from_bytes(data=data, mime_type=mime))
        contents = parts

    image_config: dict[str, Any] = {"aspect_ratio": aspect_ratio}
    if size:
        image_config["image_size"] = size

    def _run() -> dict:
        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(**image_config),
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
                return {
                    "data": bytes(inline.data),
                    "mime": inline.mime_type or "image/png",
                    "model": model,
                    "image_size": size,
                    "usage": _image_usage(response),
                }
        raise RuntimeError("לא הצלחנו ליצור תמונה. בדקו את מודל התמונות ואת המפתח.")

    try:
        return _call_with_retry(_run, attempts=2)
    except Exception as exc:
        text = str(exc)
        if "429" in text or "RESOURCE_EXHAUSTED" in text:
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
