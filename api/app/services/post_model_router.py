"""Which model writes the posts: Gemini (default) or Meta's Muse Spark (Stream H experiment).

Both entry points return a raw JSON *string*, exactly like `gemini.strategy_json`, so the
post-writing call in strategy.py can be switched with a one-line change:

    posts = loads(post_json(prompt, MONTHLY_POSTS_SCHEMA), {})

`post_json` follows the `POST_MODEL` setting. `write_posts_with` names the model
explicitly — the comparison harness uses it to run the same prompt through both.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from typing import Any, Callable

from app.config import get_settings
from app.services import gemini, meta_model
from app.services.jsonutil import dumps

log = logging.getLogger(__name__)

GEMINI = "gemini"
MUSE_SPARK = "muse-spark"
MODEL_NAMES = (GEMINI, MUSE_SPARK)


def _meta_model_for(model_name: str) -> str | None:
    """The concrete Meta model id, or None when `model_name` is not a Meta model.

    Accepts the family alias (`muse-spark` -> META_POST_MODEL) or a pinned id such as
    `muse-spark-1.2`. The contributor guard lives in meta_model and runs on both.
    """
    name = (model_name or "").strip().lower()
    if name == MUSE_SPARK:
        return get_settings().meta_post_model
    if name.startswith(MUSE_SPARK + "-"):
        return name
    return None


def write_posts_with(
    model_name: str, prompt: str, schema: dict[str, Any], *, timeout: float | None = None, system: str | None = None
) -> str:
    """Run `prompt` through the named model and return its JSON reply as a string.

    No fallback here: the caller asked for a specific model and should see its failure
    (billing, rate limit, bad JSON, `timeout` seconds passing) rather than silently get
    Gemini's output. `timeout` applies to the Meta call; None keeps its own limits.
    """
    name = (model_name or GEMINI).strip().lower()
    if name == GEMINI:
        return gemini.strategy_json(prompt, schema, **({"system": system} if system else {}))
    meta_id = _meta_model_for(name)
    if meta_id is None:
        raise ValueError(f"Unknown post model {model_name!r}. Use one of: {', '.join(MODEL_NAMES)}.")
    parsed = meta_model.chat_json(prompt, schema, model=meta_id, system=system or gemini.SYSTEM_HE, timeout=timeout)
    return dumps(parsed)


# A few threads for the wall-clock guard below. A Meta call that overruns keeps its
# thread until its own (matching) HTTP timeout ends it; the caller has moved on by then.
_guard_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="post-model")
# Past the budget the client should already have given up; this is the margin before the
# wall-clock guard stops waiting for it anyway.
GUARD_GRACE_SECONDS = 2.0


def _within(seconds: float, fn: Callable[[], str]) -> str:
    """`fn()`, or ModelTimeout once `seconds` have passed, whatever the call is doing."""
    future = _guard_pool.submit(fn)
    try:
        return future.result(timeout=seconds)
    except FutureTimeout as exc:
        future.cancel()
        raise meta_model.ModelTimeout(f"Meta Model API: no answer within {seconds:.0f}s.", code="timeout") from exc


def post_json(prompt: str, schema: dict[str, Any], *, system: str | None = None) -> str:
    """Drop-in replacement for `gemini.strategy_json` on the post-writing path.

    Follows POST_MODEL. When that is a Meta model and the call fails (billing not
    configured, rate limit, unusable reply) or does not answer within
    POST_MODEL_TIMEOUT_SECONDS, it falls back to Gemini unless POST_MODEL_FALLBACK is
    false, so the experiment can never cost a user their posts or stall their month.
    The contributor-model guard is never swallowed: that is a configuration error.
    """
    settings = get_settings()
    name = settings.post_model or GEMINI
    if name.strip().lower() == GEMINI:
        return write_posts_with(name, prompt, schema, **({"system": system} if system else {}))
    budget = float(getattr(settings, "post_model_timeout_seconds", 0) or 0)
    try:
        if budget > 0:
            # The client stops itself at `budget`; the guard is for anything it misses.
            return _within(budget + GUARD_GRACE_SECONDS, lambda: write_posts_with(name, prompt, schema, timeout=budget, **({"system": system} if system else {})))
        return write_posts_with(name, prompt, schema, **({"system": system} if system else {}))
    except meta_model.MetaModelError as exc:
        if not settings.post_model_fallback:
            raise
        log.warning("POST_MODEL=%s failed (%s: %s); falling back to Gemini.", name, type(exc).__name__, exc.code)
        return gemini.strategy_json(prompt, schema, **({"system": system} if system else {}))
