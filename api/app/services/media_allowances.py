"""Durable, account-wide media limits, independent of the optional payment gate.

Reserve before a provider call; never hold the database transaction during the call.
Successful revisions count just like originals. Confirmed failures release a customer
unit, but keep an attempt and their conservative cost. Unknown outcomes keep both
reservations. Only a verified provider result may settle one; no timeout refund/retry.
"""
from __future__ import annotations

import calendar
import math
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime

from sqlalchemy import func, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.errors import CodedError
from app.models import Business, ImageUsage, MediaAllowance, MediaAttempt, User
from app.services import billing

# Fixed bounded regular/trial policy; never supplied by the browser or disabled with
# BILLING_ENFORCE. Paid video is reserved for the later capped production video path.
POLICY = {
    "regular": {"image": (60, 120, 5_000_000), "video": (2, 4, 3_000_000)},
    "trial": {"image": (20, 40, 2_000_000), "video": (0, 0, 0)},
}
IMAGE_MODELS = {"gemini-3.1-flash-image", "gemini-3.1-flash-lite-image", "gemini-3-pro-image"}
IMAGE_OUTPUT_TOKENS = 4096
IMAGE_INPUT_TOKENS = 12000
_request_key: ContextVar[str] = ContextVar("media_request_key", default="")


class MediaPreflightRejected(ValueError):
    """Preflight rejection: no generative provider submission occurred."""


class MediaInputTooLarge(MediaPreflightRejected):
    pass


def limit_error(code="media_allowance_exhausted") -> CodedError:
    return CodedError(429, code, "ניצלתם את מכסת היצירה לתקופה הזו. אפשר להמשיך לערוך ולהשתמש בתוכן שכבר יש לכם.")


@contextmanager
def request_scope(key: str):
    token = _request_key.set(key[:100])
    try:
        yield
    finally:
        _request_key.reset(token)


def request_key(provider: str) -> str:
    return f"{_request_key.get() or uuid.uuid4().hex}:{provider}"


def _shift_month(value: datetime, months: int) -> datetime:
    total = value.year * 12 + value.month - 1 + months
    year, month = divmod(total, 12)
    month += 1
    return value.replace(year=year, month=month, day=min(value.day, calendar.monthrange(year, month)[1]))


def window(db: Session, user: User, now: datetime) -> tuple[str, datetime, datetime]:
    start, end = billing.trial_start(db, user), billing.trial_end(db, user)
    sub = billing.subscription_for(db, user)
    # Early PayPal approval never creates a second allowance during the free month.
    if now < end:
        return "trial", start, end
    if sub and sub.status != "APPROVAL_PENDING" and sub.next_billing_time and sub.next_billing_time > end:
        # Provider-reported window, including cancelled-paid-through and grace. A
        # stale renewal date does NOT advance locally or create another allowance.
        paid_start = max(end, _shift_month(sub.next_billing_time, -1))
        if paid_start <= now:
            return "regular", paid_start, sub.next_billing_time
    if user.billing_exempt:
        months = max(0, (now.year - end.year) * 12 + now.month - end.month)
        if _shift_month(end, months) > now:
            months -= 1
        return "regular", _shift_month(end, months), _shift_month(end, months + 1)
    # Expired unpaid accounts retain one finite trial allowance, even while payment
    # enforcement is off during launch. No monthly free replenishment.
    return "trial", start, end


def _row(db: Session, user_id: int, kind: str, start: datetime):
    return db.query(MediaAllowance).filter_by(user_id=user_id, kind=kind, period_start=start).first()


def _write_transaction(db: Session) -> None:
    # Acquire the SQLite writer before reading a snapshot. Deferred read->write
    # upgrades can fail immediately under contention despite busy_timeout/WAL.
    # This transaction covers counters only; it ends before any provider call.
    if db.get_bind().dialect.name == "sqlite":
        db.execute(text("BEGIN IMMEDIATE"))


def _legacy_images(db: Session, user_id: int, start: datetime, end: datetime) -> tuple[int, int, int]:
    rows = db.query(ImageUsage).filter(
        ImageUsage.business_id.in_(db.query(Business.id).filter(Business.user_id == user_id)),
        ImageUsage.created_at >= start, ImageUsage.created_at < end,
    )
    return (rows.filter(ImageUsage.outcome == "ok").count(), rows.count(),
            math.ceil(float(rows.with_entities(func.sum(ImageUsage.est_cost_usd)).scalar() or 0) * 1_000_000))


def status(db: Session, user: User, now: datetime | None = None) -> dict:
    now = now or datetime.utcnow()
    tier, start, end = window(db, user, now)
    kinds = {}
    from app.config import get_settings
    settings = get_settings()
    # The read view must agree with the next reservation, including its cost ceiling.
    # No provider I/O. A misconfigured model remains unavailable until corrected.
    ceilings = []
    for provider in (settings.image_generate_provider or "muse", settings.image_edit_provider or "muse"):
        try:
            ceilings.append(image_ceiling(provider, settings.muse_image_model if provider == "muse"
                                          else settings.gemini_image_model, settings.gemini_image_size))
        except (CodedError, ValueError):
            pass
    minimum_image_cost = min(ceilings) if ceilings else None
    for kind, (limit, attempts, budget) in POLICY[tier].items():
        row = _row(db, user.id, kind, start)
        historical = _legacy_images(db, user.id, start, end) if row is None and kind == "image" else (0, 0, 0)
        used, held = (row.used, row.reserved) if row else (historical[0], 0)
        kinds[kind] = {
            "included": limit, "used": used, "reserved": held,
            "remaining": max(0, limit - used - held),
            "generation_available": kind == "image" and not billing.locked(db, user, now)
            and minimum_image_cost is not None and used + held < limit
            and ((historical[1] < attempts and historical[2] + minimum_image_cost <= budget) if row is None else (
                row.attempts < attempts and row.committed_microusd + row.reserved_microusd + minimum_image_cost <= budget)),
        }
    return {"tier": tier, "period_start": billing.iso_utc(start), "resets_at": billing.iso_utc(end)
            if tier == "regular" and end > now else None, "images": kinds["image"], "videos": kinds["video"]}


def image_ceiling(provider: str, model: str, size: str) -> int:
    if provider == "muse":
        from app.services.meta_model import assert_allowed_model
        assert_allowed_model(model)
        if model != "muse-image-1.0":
            raise CodedError(503, "media_model_unavailable", "מודל התמונות הזה עדיין לא זמין ליצירה בחשבון.")
        return 10_000
    if provider != "gemini" or model not in IMAGE_MODELS or size != "1K":
        raise CodedError(503, "media_model_unavailable", "מודל התמונות הזה עדיין לא זמין ליצירה בחשבון.")
    # Full output priced as image tokens, plus bounded input, including references.
    # Actual usage settles the reservation; this is a conservative ceiling, not a quote.
    return 600_000 if model == "gemini-3-pro-image" else 300_000


def reserve(db: Session | None, business_id: int, *, kind: str, key: str,
            provider: str, model: str, ceiling: int, now: datetime | None = None) -> int:
    if kind not in {"image", "video"} or ceiling <= 0 or ceiling > (1_200_000 if kind == "video" else 600_000):
        raise ValueError("Unbounded media reservation")
    # An independent session commits spend protection even if the post later rolls
    # back. Never commit unrelated editor writes or use the global DB in test workers.
    factory = SessionLocal if db is None else lambda: Session(bind=db.get_bind())
    with factory() as ledger:
        _write_transaction(ledger)
        business = ledger.get(Business, business_id)
        user = ledger.get(User, business.user_id) if business else None
        if not user:
            raise CodedError(404, "media_account_required", "לא מצאנו את החשבון ליצירת התוכן.")
        now = now or datetime.utcnow()
        if billing.locked(ledger, user, now):
            raise billing.PlanRequiredError()
        tier, start, end = window(ledger, user, now)
        limit, max_attempts, budget = POLICY[tier][kind]
        if limit == 0:
            raise limit_error()
        try:
            with ledger.begin_nested():
                if _row(ledger, user.id, kind, start) is None:
                    used, attempts, cost = _legacy_images(ledger, user.id, start, end) if kind == "image" else (0, 0, 0)
                    ledger.add(MediaAllowance(user_id=user.id, kind=kind, period_start=start, period_end=end,
                                              used=used, attempts=attempts, committed_microusd=cost))
                    ledger.flush()
        except IntegrityError:
            pass  # a concurrent request created the account-period row
        row = _row(ledger, user.id, kind, start)
        attempt = MediaAttempt(user_id=user.id, workspace_id=business_id, allowance_id=row.id,
                               request_key=key[:150], kind=kind, provider=provider, model=model,
                               reserved_microusd=ceiling)
        try:
            ledger.add(attempt)
            ledger.flush()  # uniqueness prevents a duplicate provider submission
        except IntegrityError:
            ledger.rollback()
            raise CodedError(409, "media_request_already_submitted", "הבקשה הזו כבר נשלחה. בדקו את התוצאה לפני יצירה נוספת.")
        updated = ledger.execute(update(MediaAllowance).where(
            MediaAllowance.id == row.id,
            MediaAllowance.used + MediaAllowance.reserved < limit,
            MediaAllowance.attempts < max_attempts,
            MediaAllowance.committed_microusd + MediaAllowance.reserved_microusd + ceiling <= budget,
        ).values(reserved=MediaAllowance.reserved + 1, attempts=MediaAllowance.attempts + 1,
                 reserved_microusd=MediaAllowance.reserved_microusd + ceiling))
        if updated.rowcount != 1:
            ledger.rollback()
            raise limit_error()
        attempt_id = attempt.id
        ledger.commit()
        return attempt_id


def settle(db: Session | None, attempt_id: int, *, state: str, cost_usd: float | None = None,
           provider_ref: str = "") -> None:
    """Internal verified settlement, never a browser refund. Unknown keeps the hold.

    For definitive failures without token usage, conservatively keep the full cost
    ceiling. Exact known-unbilled refusals may settle at zero. Repeated callbacks do
    nothing; terminal state cannot later be changed to release another unit.
    """
    if state not in {"succeeded", "failed", "unknown"}:
        raise ValueError("Invalid media settlement")
    factory = SessionLocal if db is None else lambda: Session(bind=db.get_bind())
    with factory() as ledger:
        _write_transaction(ledger)
        attempt = ledger.get(MediaAttempt, attempt_id)
        if not attempt:
            raise ValueError("Missing media reservation")
        cost = attempt.reserved_microusd if cost_usd is None else math.ceil(max(0, cost_usd) * 1_000_000)
        changed = ledger.execute(update(MediaAttempt).where(
            MediaAttempt.id == attempt_id, MediaAttempt.state.in_(["reserved", "unknown"])
        ).values(state=state, cost_microusd=None if state == "unknown" else cost,
                 provider_ref=provider_ref[:150], completed_at=None if state == "unknown" else datetime.utcnow()))
        if changed.rowcount and state != "unknown":
            ledger.execute(update(MediaAllowance).where(MediaAllowance.id == attempt.allowance_id).values(
                reserved=MediaAllowance.reserved - 1,
                used=MediaAllowance.used + (1 if state == "succeeded" else 0),
                reserved_microusd=MediaAllowance.reserved_microusd - attempt.reserved_microusd,
                committed_microusd=MediaAllowance.committed_microusd + cost,
            ))
        ledger.commit()
