"""What each image call costs, estimated from list prices, and the log it goes into.

Prices: docs/image-models.md (official pages, checked 2026-10-01; paid tier, standard).
* Muse Image 1.0: a flat $0.01 per generated image; refused or failed images are not
  billed ("Failed or safety-filtered images aren't counted toward billing").
* Gemini image models bill output image tokens per size tier, plus input and thinking
  tokens. With the response's usage numbers the cost is computed from tokens (as the
  bench did); without them, the per-tier list price plus the measured overhead.
"""

from __future__ import annotations

import logging

log = logging.getLogger(__name__)

MUSE_PER_IMAGE_USD = 0.01

# Per 1M tokens. Output images: tokens per tier x the image rate gives the tier prices.
GEMINI_TOKEN_PRICES = {
    "gemini-3.1-flash-image": {"in": 0.50, "out_text": 3.00, "out_image": 60.00},
    "gemini-3-pro-image": {"in": 2.00, "out_text": 12.00, "out_image": 120.00},
    "gemini-3.1-flash-lite-image": {"in": 0.25, "out_text": 1.50, "out_image": 30.00},
}
# List price per image by size tier (output image only).
GEMINI_TIER_PRICES = {
    "gemini-3.1-flash-image": {"0.5K": 0.045, "1K": 0.067, "2K": 0.101, "4K": 0.151},
    "gemini-3-pro-image": {"1K": 0.134, "2K": 0.134, "4K": 0.24},
    "gemini-3.1-flash-lite-image": {"1K": 0.0336},
}
# Measured per call on top of the image (prompt, reference photo, thinking): NB2 came to
# $0.068 at 1K, Pro to $0.140 at 2K, Lite to $0.034.
GEMINI_OVERHEAD = {"gemini-3.1-flash-image": 0.001, "gemini-3-pro-image": 0.006, "gemini-3.1-flash-lite-image": 0.0004}


def estimate_cost(provider: str, model: str, *, image_size: str = "", produced: bool = True,
                  usage: dict | None = None) -> float:
    if not produced:
        # Muse does not bill a refusal; a Gemini call that returned no image billed only
        # its prompt, a fraction of a cent.
        return 0.0
    if provider == "muse":
        return MUSE_PER_IMAGE_USD
    prices = GEMINI_TOKEN_PRICES.get(model)
    if usage and prices and usage.get("output_tokens"):
        image_out = usage.get("output_image_tokens") or usage.get("output_tokens") or 0
        text_out = max(0, (usage.get("output_tokens") or 0) - image_out) + (usage.get("thinking_tokens") or 0)
        cost = (
            (usage.get("prompt_tokens") or 0) * prices["in"]
            + image_out * prices["out_image"]
            + text_out * prices["out_text"]
        ) / 1e6
        return round(cost, 5)
    tiers = GEMINI_TIER_PRICES.get(model) or {}
    base = tiers.get(image_size) or (max(tiers.values()) if tiers else 0.14)
    return round(base + GEMINI_OVERHEAD.get(model, 0.002), 5)


def log_attempt(db, business_id: int, *, post_uid: str, task: str, provider: str, model: str,
                image_size: str, outcome: str, fallback_reason: str, cost_usd: float, latency_ms: int) -> None:
    """Add one row to `image_usage` in the caller's session (committed with the post).
    A failure to log never fails the image."""
    if db is None or not business_id:
        return
    from app.models import ImageUsage

    try:
        db.add(
            ImageUsage(
                business_id=business_id,
                post_uid=(post_uid or "")[:40],
                task=task,
                provider=provider,
                model=(model or "")[:80],
                image_size=(image_size or "")[:10],
                outcome=outcome,
                fallback_reason=(fallback_reason or "")[:500],
                est_cost_usd=float(cost_usd or 0.0),
                latency_ms=int(latency_ms or 0),
            )
        )
    except Exception:  # pragma: no cover - logging must never break an image
        log.exception("image usage: could not log an attempt")
