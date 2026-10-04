"""What each text-model call cost, estimated, and which account it was for.

Image calls were already logged per business (`image_usage`, services/image_usage.py).
Text calls (plans, posts, research, Design DNA, photo checks) were not, so the backoffice
could not say what an account costs. This is the minimal log: one `model_usage` row per
Gemini text call, with token counts and an estimate from list prices. Never the prompt,
the answer or the key.

Attribution. `gemini.generate_json` knows nothing about accounts, so the account is
carried in a context variable:

* a request: `RequestScopeMiddleware` (app/main.py) opens an empty scope for every
  request; `deps.get_current_user` notes the user and `deps.get_business` the business.
  The scope is one mutable dict, and FastAPI's worker threads run in a copy of the
  request's context, so a note made in a dependency is seen by the endpoint's model call.
  With only a user noted, the row goes to that user's newest business (the one the rest
  of the app is scoped to, routers/setup.newest_business).
* a background job (the month build, source analysis, the weekly research, the Design
  DNA rebuilt after a scan): `attributed(business_id)` around the job.

A call outside any scope, or with no account behind it (the anonymous landing preview,
/start before signup), is not logged: it belongs to no account.

Writing never slows or fails the model call: rows go to one background writer thread,
which retries briefly if SQLite is busy and otherwise drops the row with a log line. The
cost is an estimate, like `image_usage.est_cost_usd`, not an invoice line.
"""

from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime
from typing import Iterator

log = logging.getLogger(__name__)

# Assumed list prices per 1M tokens (paid tier; thinking is billed as output), the same
# figures api/scripts/dna_smoke.py uses for its spend estimate. Unknown models get the
# Flash price: an estimate errs high rather than reading as free.
PRICES_PER_M = {
    "gemini-3.8-flash": {"in": 0.50, "out": 3.00},
    "gemini-3.5-flash-lite": {"in": 0.10, "out": 0.40},
}
DEFAULT_PRICE = {"in": 0.50, "out": 3.00}

_scope: ContextVar[dict | None] = ContextVar("model_usage_scope", default=None)
_writer: ThreadPoolExecutor | None = None
_writer_lock = threading.Lock()


def estimate_cost(model: str, numbers: dict) -> float:
    price = PRICES_PER_M.get((model or "").strip(), DEFAULT_PRICE)
    prompt = int(numbers.get("prompt_tokens") or 0)
    out = int(numbers.get("output_tokens") or 0) + int(numbers.get("thinking_tokens") or 0)
    return round((prompt * price["in"] + out * price["out"]) / 1e6, 6)


# --- scope ------------------------------------------------------------------------------


def open_scope():
    """A fresh, empty scope for one request. Returns the reset token."""
    return _scope.set({})


def close_scope(token) -> None:
    _scope.reset(token)


def note_user(user_id: int, bind=None) -> None:
    holder = _scope.get()
    if holder is not None and user_id:
        holder["user_id"] = int(user_id)
        if bind is not None:
            holder.setdefault("bind", bind)


def note_business(business_id: int, bind=None) -> None:
    holder = _scope.get()
    if holder is not None and business_id:
        holder["business_id"] = int(business_id)
        if bind is not None:
            holder["bind"] = bind


@contextmanager
def scoped() -> Iterator[None]:
    """An empty scope for work that learns its business later (note_business)."""
    token = _scope.set({})
    try:
        yield
    finally:
        _scope.reset(token)


@contextmanager
def attributed(business_id: int, bind=None) -> Iterator[None]:
    """Model calls inside this block are counted for `business_id` (a background job)."""
    token = _scope.set({"business_id": int(business_id), **({"bind": bind} if bind is not None else {})})
    try:
        yield
    finally:
        _scope.reset(token)


# --- recording ------------------------------------------------------------------------


def _pool() -> ThreadPoolExecutor:
    global _writer
    with _writer_lock:
        if _writer is None:
            _writer = ThreadPoolExecutor(max_workers=1, thread_name_prefix="model-usage")
        return _writer


def record(model: str, numbers: dict) -> Future | None:
    """The gemini.USAGE_HOOKS hook: queue one row for the account in scope, if any."""
    holder = _scope.get()
    if not holder or not (holder.get("business_id") or holder.get("user_id")):
        return None
    row = {
        "business_id": holder.get("business_id"),
        "user_id": holder.get("user_id"),
        "model": (model or "")[:80],
        "prompt_tokens": int(numbers.get("prompt_tokens") or 0),
        "output_tokens": int(numbers.get("output_tokens") or 0),
        "thinking_tokens": int(numbers.get("thinking_tokens") or 0),
        "est_cost_usd": estimate_cost(model, numbers),
        "created_at": datetime.utcnow(),
    }
    try:
        return _pool().submit(_write, holder.get("bind"), row)
    except RuntimeError:  # pragma: no cover - interpreter shutting down
        return None


def _write(bind, row: dict) -> bool:
    from sqlalchemy.orm import Session

    from app.models import Business, ModelUsage

    if bind is None:
        from app.db import engine as bind
    for attempt in range(3):
        db = Session(bind=bind)
        try:
            business_id = row["business_id"]
            if not business_id and row["user_id"]:
                found = (
                    db.query(Business.id)
                    .filter(Business.user_id == row["user_id"])
                    .order_by(Business.id.desc())
                    .first()
                )
                business_id = found[0] if found else None
            if not business_id:
                return False
            db.add(
                ModelUsage(
                    business_id=business_id,
                    model=row["model"],
                    prompt_tokens=row["prompt_tokens"],
                    output_tokens=row["output_tokens"],
                    thinking_tokens=row["thinking_tokens"],
                    est_cost_usd=row["est_cost_usd"],
                    created_at=row["created_at"],
                )
            )
            db.commit()
            return True
        except Exception:
            db.rollback()
            if attempt == 2:
                log.warning("model usage: could not record a %s call", row["model"], exc_info=True)
                return False
            time.sleep(0.5 * (attempt + 1))
        finally:
            db.close()
    return False


def flush(timeout: float = 5.0) -> None:
    """Wait for queued rows (tests, and the end of a CLI job)."""
    if _writer is None:
        return
    _pool().submit(lambda: None).result(timeout=timeout)


def install() -> None:
    """Register the hook once (app/main.py and the CLI jobs)."""
    from app.services import gemini

    if record not in gemini.USAGE_HOOKS:
        gemini.USAGE_HOOKS.append(record)
