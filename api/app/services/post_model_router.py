"""Which model writes the posts: Gemini (default) or Meta's Muse Spark (Stream H experiment).

Both entry points return a raw JSON *string*, exactly like `gemini.strategy_json`, so the
post-writing call in strategy.py can be switched with a one-line change:

    posts = loads(post_json(prompt, MONTHLY_POSTS_SCHEMA), {})

`post_json` follows the `POST_MODEL` setting. `write_posts_with` names the model
explicitly — the comparison harness uses it to run the same prompt through both.
"""

from __future__ import annotations

import logging
from typing import Any

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


def write_posts_with(model_name: str, prompt: str, schema: dict[str, Any]) -> str:
    """Run `prompt` through the named model and return its JSON reply as a string.

    No fallback here: the caller asked for a specific model and should see its failure
    (billing, rate limit, bad JSON) rather than silently get Gemini's output.
    """
    name = (model_name or GEMINI).strip().lower()
    if name == GEMINI:
        return gemini.strategy_json(prompt, schema)
    meta_id = _meta_model_for(name)
    if meta_id is None:
        raise ValueError(f"Unknown post model {model_name!r}. Use one of: {', '.join(MODEL_NAMES)}.")
    parsed = meta_model.chat_json(prompt, schema, model=meta_id, system=gemini.SYSTEM_HE)
    return dumps(parsed)


def post_json(prompt: str, schema: dict[str, Any]) -> str:
    """Drop-in replacement for `gemini.strategy_json` on the post-writing path.

    Follows POST_MODEL. When that is a Meta model and the call fails (billing not
    configured, rate limit, unusable reply) it falls back to Gemini unless
    POST_MODEL_FALLBACK is false, so the experiment can never cost a user their posts.
    The contributor-model guard is never swallowed: that is a configuration error.
    """
    settings = get_settings()
    name = settings.post_model or GEMINI
    try:
        return write_posts_with(name, prompt, schema)
    except meta_model.MetaModelError as exc:
        if not settings.post_model_fallback:
            raise
        log.warning("POST_MODEL=%s failed (%s: %s); falling back to Gemini.", name, type(exc).__name__, exc.code)
        return gemini.strategy_json(prompt, schema)
