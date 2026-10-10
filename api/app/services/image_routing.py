"""Which model makes a post's image, and what happens when it says no (docs/design-dna.md).

    generate (no usable photo of the owner's)  -> Muse Image /images/generations
    edit (the owner's real photo)              -> Muse Image /images/edits
    Muse definitively rejects the request     -> Nano Banana 2 (gemini-3.1-flash-image, 1K);
                                                  an edit hands it the photo as a labelled
                                                  REFERENCE PHOTO 1

Both providers are settings (IMAGE_GENERATE_PROVIDER / IMAGE_EDIT_PROVIDER = "muse" |
"gemini", IMAGE_FALLBACK_MODEL), so the route changes without code. Every attempt is
logged to `image_usage` with its provider, model, outcome and estimated cost, and the
post records which provider made its image and why it fell back.

Timeouts and ambiguous responses retain their account reservation and never submit a
fallback. Confirmed request/policy rejection is settled before the fallback reserves.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from app.config import get_settings
from app.services import colors as color_tools
from app.services import muse_image
from app.services.gemini import generate_image
from app.services.image_usage import estimate_cost, log_attempt
from app.services.images import aspect_for, build_edit_prompt, build_image_prompt, reference_label
from app.services.meta_model import ContributorModelRefused
from app.services import media_allowances

# Photos above this are re-encoded before upload (an owner's 25 MB phone original).
_MAX_EDIT_BYTES = 1_500_000


class ImageRoutingError(RuntimeError):
    """No provider produced an image. The message is Hebrew, for the owner."""


@dataclass
class ImageOutcome:
    data: bytes
    mime: str
    task: str
    provider: str
    model: str
    image_size: str
    cost_usd: float
    fallback_reason: str = ""
    attempts: list[dict] = field(default_factory=list)

    def post_fields(self) -> dict:
        """What the post records about its image (read by the editor and the cost view)."""
        return {
            "image_task": self.task,
            "image_provider": self.provider,
            "image_model": self.model,
            "image_fallback_reason": self.fallback_reason,
            "image_cost_usd": round(sum(a["cost_usd"] for a in self.attempts), 4),
        }


def _muse_reason(exc: BaseException) -> tuple[str, str]:
    """(outcome, reason) for a failed Muse attempt. Never carries the request or the key."""
    if isinstance(exc, muse_image.MuseRefused):
        return "refused", f"muse refused ({exc.code or 'content_policy_violation'})"
    if isinstance(exc, muse_image.MuseTimeout):
        return "timeout", "muse timed out"
    if isinstance(exc, ContributorModelRefused):
        return "error", "muse model refused (contributor models are never used)"
    code = getattr(exc, "code", "") or type(exc).__name__
    status = getattr(exc, "status", None)
    return "error", f"muse error ({code}{f' {status}' if status else ''})"


def _upload_ready(photo: tuple[bytes, str]) -> tuple[bytes, str]:
    data, mime = photo
    if len(data) > _MAX_EDIT_BYTES:
        smaller = color_tools.to_model_jpeg(data, max_width=1600, quality=88)
        if smaller:
            return smaller, "image/jpeg"
    return data, mime


def route(
    task: str,
    *,
    muse_prompt: str,
    gemini_prompt: str,
    aspect: str,
    photo: tuple[bytes, str] | None = None,
    label: str = "",
    business_id: int = 0,
    post_uid: str = "",
    db=None,
) -> ImageOutcome:
    """Run one image task through the configured provider and its fallback."""
    settings = get_settings()
    provider = (settings.image_edit_provider if task == "edit" else settings.image_generate_provider) or "muse"
    attempts: list[dict] = []
    reason = ""
    if task == "edit" and photo is not None:
        photo = _upload_ready(photo)

    def reserve(provider_name: str, model_name: str, size: str = "") -> int:
        ceiling = media_allowances.image_ceiling(provider_name, model_name, size)
        return media_allowances.reserve(db, business_id, kind="image",
            key=media_allowances.request_key(provider_name), provider=provider_name,
            model=model_name, ceiling=ceiling)

    def record(**entry) -> None:
        attempts.append(entry)
        log_attempt(db, business_id, post_uid=post_uid, task=task, **entry)

    if provider == "muse":
        reservation = reserve("muse", settings.muse_image_model)
        started = time.monotonic()
        try:
            if task == "edit":
                data, mime = muse_image.edit(muse_prompt, photo, aspect)
            else:
                data, mime = muse_image.generate(muse_prompt, aspect)
        except Exception as exc:
            outcome, reason = _muse_reason(exc)
            definitive = (isinstance(exc, muse_image.MuseRefused) and exc.code != "no_image") or isinstance(exc, ContributorModelRefused) or (
                isinstance(exc, muse_image.MuseImageError) and
                (exc.code == "missing_key" or (exc.status and 400 <= exc.status < 500)))
            media_allowances.settle(db, reservation, state="failed" if definitive else "unknown",
                                    cost_usd=0.0 if definitive else None)
            record(provider="muse", model=settings.muse_image_model, image_size="", outcome=outcome,
                   fallback_reason="", cost_usd=0.0, latency_ms=int((time.monotonic() - started) * 1000))
            if not definitive:
                # The provider may have generated/billed an image. Retain its unit and
                # cost hold; neither a fallback nor an automatic retry is safe.
                raise ImageRoutingError("יצירת התמונה עדיין לא אושרה. התוכן הקיים שמור; אל תשלחו את אותה בקשה שוב.") from exc
        else:
            cost = estimate_cost("muse", settings.muse_image_model)
            media_allowances.settle(db, reservation, state="succeeded", cost_usd=cost)
            record(provider="muse", model=settings.muse_image_model, image_size="", outcome="ok",
                   fallback_reason="", cost_usd=cost, latency_ms=int((time.monotonic() - started) * 1000))
            return ImageOutcome(data, mime, task, "muse", settings.muse_image_model, "", cost, "", attempts)
        model = settings.image_fallback_model
        if not model:
            raise ImageRoutingError("לא הצלחנו ליצור תמונה כרגע. נסו שוב בעוד כמה דקות.")
    else:
        model = settings.gemini_image_model

    labelled = [(photo[0], photo[1], label)] if task == "edit" and photo is not None else None
    reservation = reserve("gemini", model, settings.gemini_image_size)
    started = time.monotonic()
    try:
        result = generate_image(gemini_prompt, aspect, model=model, image_size=settings.gemini_image_size,
                                labelled=labelled)
    except Exception as exc:
        code = getattr(exc, "code", None) or getattr(exc.__cause__, "code", None)
        preflight = isinstance(exc, media_allowances.MediaPreflightRejected)
        definitive = preflight or (isinstance(code, int) and 400 <= code < 500)
        media_allowances.settle(db, reservation, state="failed" if definitive else "unknown",
                                cost_usd=0.0 if preflight else None)
        record(provider="gemini", model=model, image_size=settings.gemini_image_size, outcome="error",
               fallback_reason=reason, cost_usd=0.0, latency_ms=int((time.monotonic() - started) * 1000))
        raise
    size = result.get("image_size") or settings.gemini_image_size
    cost = estimate_cost("gemini", model, image_size=size, usage=result.get("usage"))
    media_allowances.settle(db, reservation, state="succeeded", cost_usd=cost)
    record(provider="gemini", model=model, image_size=size, outcome="ok", fallback_reason=reason,
           cost_usd=cost, latency_ms=int((time.monotonic() - started) * 1000))
    return ImageOutcome(result["data"], result.get("mime") or "image/png", task, "gemini", model, size, cost,
                        reason, attempts)


def generate_for_post(post: dict, brand: dict, business: dict, dna: dict | None, *, business_id: int = 0,
                      db=None) -> ImageOutcome:
    """A new photo for a post with no usable photo of the owner's."""
    prompt = build_image_prompt(post, brand, business, dna)
    return route("generate", muse_prompt=prompt, gemini_prompt=prompt, aspect=aspect_for(post),
                 business_id=business_id, post_uid=str(post.get("uid") or ""), db=db)


def edit_for_post(post: dict, photo: tuple[bytes, str], business: dict, dna: dict | None, *,
                  business_id: int = 0, db=None) -> ImageOutcome:
    """The owner's real photo, relit, cleaned and graded to the DNA; the product kept."""
    return route(
        "edit",
        muse_prompt=build_edit_prompt(post, dna, business),
        gemini_prompt=build_edit_prompt(post, dna, business, labelled=True),
        aspect=aspect_for(post),
        photo=photo,
        label=reference_label(post),
        business_id=business_id,
        post_uid=str(post.get("uid") or ""),
        db=db,
    )
