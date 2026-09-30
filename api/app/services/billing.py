"""Who has paid, until when, and the one gate on AI generation.

The free month is ours (routers/trial.py): 30 days from `users.trial_started_at`, in
Israel's calendar. No card at signup. Near the end of that month the owner subscribes
with PayPal (routers/billing.py); the subscription's first charge is set to the day the
free month ends, so subscribing early never shortens the free month.

Trial end: the start of day 31 in Israel's calendar, i.e. midnight (Asia/Jerusalem) at
the beginning of `israel_date(trial_start) + 30 days`. That is exactly when
`GET /trial` turns `ended` (day > 30), so the two can never disagree. Stored and compared
as naive UTC, like every other timestamp in this codebase.

Access ("may this account start new AI generation?"):

* during the free month and GRACE_DAYS after it: yes;
* with a subscription PayPal reports ACTIVE or APPROVED: yes;
* with one that was cancelled, suspended or expired: until the end of the period already
  paid for (`next_billing_time` as last reported, never before the trial end), plus the
  same grace;
* APPROVAL_PENDING (created in the browser but never approved) grants nothing.

Enforcement (`require_generation_access`) is off unless BILLING_ENFORCE is true *and*
PayPal is configured: nobody is locked out of something they have no way to pay for.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta, timezone

from fastapi import Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Business, Payment, Subscription, User
from app.services import paypal

logger = logging.getLogger(__name__)

TRIAL_DAYS = 30  # routers/trial.DAYS_TOTAL
GRACE_DAYS = 3
REMIND_DAYS = 7

GRANTING = {"ACTIVE", "APPROVED"}
FINISHED = {"CANCELLED", "EXPIRED"}
KNOWN_STATUSES = {"APPROVAL_PENDING", "APPROVED", "ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"}
# What POST /billing/paypal/confirm accepts from PayPal.
CONFIRMABLE = {"APPROVAL_PENDING", "APPROVED", "ACTIVE"}

LOCKED_HE = (
    "החודש החינמי נגמר, ולכן כרגע אי אפשר ליצור תוכן חדש. "
    "כל מה שכבר נוצר פתוח לצפייה, לעריכה ולהורדה. "
    "כדי להמשיך, הפעילו מנוי בעמוד המנוי (בחשבון)."
)

try:  # same fallback as routers/trial.py
    from zoneinfo import ZoneInfo

    ISRAEL_TZ = ZoneInfo("Asia/Jerusalem")
except Exception:  # pragma: no cover - depends on the host
    ISRAEL_TZ = timezone(timedelta(hours=3))


# --- time ---------------------------------------------------------------------------


def _israel_date(moment: datetime) -> date:
    return moment.replace(tzinfo=timezone.utc).astimezone(ISRAEL_TZ).date()


def _israel_midnight_utc(day: date) -> datetime:
    """00:00 in Israel on `day`, as naive UTC."""
    return datetime.combine(day, time(0, 0), tzinfo=ISRAEL_TZ).astimezone(timezone.utc).replace(tzinfo=None)


def trial_start(db: Session, user: User) -> datetime:
    """routers/trial.trial_start, without importing the router."""
    if user.trial_started_at:
        return user.trial_started_at
    if user.created_at:
        return user.created_at
    business = db.query(Business).filter(Business.user_id == user.id).order_by(Business.id.desc()).first()
    return (business.created_at if business else None) or datetime.utcnow()


def trial_end(db: Session, user: User) -> datetime:
    """The start of day 31: when the free month is over. See the module docstring."""
    return _israel_midnight_utc(_israel_date(trial_start(db, user)) + timedelta(days=TRIAL_DAYS))


def days_left(end: datetime, now: datetime) -> int:
    """Free days left, today included: 1 on day 30, 0 once it has ended."""
    return max(0, (_israel_date(end) - _israel_date(now)).days) if now < end else 0


def iso_utc(value: datetime | None) -> str | None:
    """"2026-10-31T22:00:00Z": what PayPal's `start_time` expects, and unambiguous for the browser."""
    return value.replace(microsecond=0).isoformat() + "Z" if value else None


def parse_paypal_time(value: object) -> datetime | None:
    """PayPal's "2026-11-01T10:00:00Z" as naive UTC; None for anything else."""
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


# --- state --------------------------------------------------------------------------


def subscription_for(db: Session, user: User) -> Subscription | None:
    return db.query(Subscription).filter(Subscription.user_id == user.id).first()


def paid_through(sub: Subscription | None, end: datetime) -> datetime | None:
    """The end of what is already covered by a subscription that no longer renews."""
    if sub is None or sub.status in GRANTING or sub.status == "APPROVAL_PENDING":
        return None
    candidates = [end] + ([sub.next_billing_time] if sub.next_billing_time else [])
    return max(candidates)


def has_access(sub: Subscription | None, end: datetime, now: datetime) -> bool:
    if now < end + timedelta(days=GRACE_DAYS):
        return True
    if sub is None:
        return False
    if sub.status in GRANTING:
        return True
    through = paid_through(sub, end)
    return bool(through and now < through + timedelta(days=GRACE_DAYS))


def state_of(sub: Subscription | None, end: datetime, now: datetime) -> str:
    """trial | trial_ended | active | payment_failed | cancelled."""
    if sub is not None:
        if sub.status == "SUSPENDED" or (sub.status in GRANTING and sub.payment_failed_at):
            return "payment_failed"
        if sub.status in GRANTING:
            return "active"
        if sub.status in FINISHED:
            through = paid_through(sub, end)
            if through and now < through:
                return "cancelled"
    return "trial" if now < end else "trial_ended"


def enforcing() -> bool:
    return bool(paypal.settings().billing_enforce) and paypal.configured()


def locked(db: Session, user: User, now: datetime | None = None) -> bool:
    """True only when enforcement is on and this account has no access."""
    if not enforcing():
        return False
    now = now or datetime.utcnow()
    return not has_access(subscription_for(db, user), trial_end(db, user), now)


def require_generation_access(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    """THE billing gate. Attached (as a route dependency) only to endpoints that start new
    AI generation; tests/test_billing.py lists them and fails if the set changes unnoticed.
    Viewing, editing, exporting, the account and deletion never carry it."""
    if locked(db, user):
        raise HTTPException(status_code=402, detail=LOCKED_HE)


def status_payload(db: Session, user: User, now: datetime | None = None) -> dict:
    now = now or datetime.utcnow()
    s = paypal.settings()
    is_configured = paypal.configured()
    sub = subscription_for(db, user)
    started = trial_start(db, user)
    end = trial_end(db, user)
    state = state_of(sub, end, now)
    left = days_left(end, now)
    access = has_access(sub, end, now)
    # A new subscription is what the owner needs, unless one is renewing (ACTIVE with a
    # failed charge: PayPal is retrying it, and a second subscription would double-charge).
    needs_payment = state in {"trial", "trial_ended", "cancelled"} or (
        state == "payment_failed" and sub is not None and sub.status == "SUSPENDED"
    )
    # The first charge: never before the free month (or an already-paid period) ends.
    through = paid_through(sub, end) if state == "cancelled" else None
    first_charge = max(end, through) if through else end
    start_time = first_charge if first_charge > now + timedelta(minutes=5) else None
    return {
        "configured": is_configured,
        "enforce": enforcing(),
        "env": paypal.env(),
        "price_ils": paypal.PRICE_ILS,
        "currency": paypal.CURRENCY,
        "trial": {
            "started_at": iso_utc(started),
            "ends_at": iso_utc(end),
            "days_left": left,
            "ended": now >= end,
        },
        "state": state,
        "subscription": None
        if sub is None
        else {
            "status": sub.status,
            "next_billing_time": iso_utc(sub.next_billing_time) if sub.status in GRANTING else None,
            "paid_through": iso_utc(paid_through(sub, end)),
            "cancelled_at": iso_utc(sub.cancelled_at),
            "payment_failed": sub.payment_failed_at is not None or sub.status == "SUSPENDED",
        },
        "needs_payment": needs_payment,
        "access": access,
        "locked": enforcing() and not access,
        # Today's one-line reminder: the last week of the free month, and after it, while
        # there is nothing paid. Never when there is no way to pay.
        "remind": is_configured and state in {"trial", "trial_ended", "payment_failed"} and left <= REMIND_DAYS,
        # For the browser's PayPal buttons. The client id is public by design.
        "client_id": s.paypal_client_id.strip() if is_configured else None,
        "plan_id": s.paypal_plan_id.strip() if is_configured else None,
        "custom_id": str(user.id),
        "start_time": iso_utc(start_time),
    }


# --- writing what PayPal says -------------------------------------------------------


def apply_paypal_subscription(sub: Subscription, data: dict, now: datetime | None = None) -> None:
    """Copy PayPal's view of a subscription onto our row."""
    now = now or datetime.utcnow()
    status = str(data.get("status") or "").upper()
    if status in KNOWN_STATUSES:
        sub.status = status
    plan_id = data.get("plan_id")
    if isinstance(plan_id, str) and plan_id:
        sub.plan_id = plan_id
    billing = data.get("billing_info") if isinstance(data.get("billing_info"), dict) else {}
    next_time = parse_paypal_time(billing.get("next_billing_time"))
    if next_time and sub.status not in FINISHED:
        # After a cancellation PayPal drops next_billing_time; the last one we saw stays as
        # the end of the paid period.
        sub.next_billing_time = next_time
    if sub.status == "CANCELLED" and sub.cancelled_at is None:
        sub.cancelled_at = parse_paypal_time(data.get("status_update_time")) or now
    sub.updated_at = now


def cancel_at_paypal(sub: Subscription, reason: str) -> None:
    """Cancel a subscription that still renews. Raises paypal.PayPalError."""
    if sub.status in FINISHED:
        return
    paypal.cancel_subscription(sub.provider_subscription_id, reason)


def cancel_for_deletion(db: Session, user: User) -> None:
    """Best effort, before an account is deleted: stop PayPal from charging a deleted
    account. A failure is logged (with the subscription id, so it can be cancelled by
    hand in PayPal) and never blocks the deletion."""
    sub = subscription_for(db, user)
    if sub is None or sub.status in FINISHED:
        return
    if not paypal.credentials_configured():
        logger.error("account %s deleted with PayPal subscription %s still %s: PayPal is not configured, cancel it by hand",
                     user.id, sub.provider_subscription_id, sub.status)
        return
    try:
        paypal.cancel_subscription(sub.provider_subscription_id, "Account deleted")
    except paypal.PayPalError as exc:
        logger.error("account %s deleted but PayPal subscription %s was not cancelled (status %s, debug_id=%s): cancel it by hand",
                     user.id, sub.provider_subscription_id, exc.status, exc.debug_id)


def record_payment(db: Session, user_id: int, sale: dict, subscription_id: str) -> bool:
    """Store a completed sale once. False when it was already stored (a repeated webhook)."""
    sale_id = str(sale.get("id") or "")
    if not paypal.valid_id(sale_id):
        return False
    if db.query(Payment.id).filter(Payment.provider_payment_id == sale_id).first():
        return False
    amount = sale.get("amount") if isinstance(sale.get("amount"), dict) else {}
    payment = Payment(
        user_id=user_id,
        provider="paypal",
        provider_payment_id=sale_id,
        provider_subscription_id=subscription_id,
        amount=str(amount.get("total") or amount.get("value") or ""),
        currency=str(amount.get("currency") or amount.get("currency_code") or paypal.CURRENCY)[:3],
        paid_at=parse_paypal_time(sale.get("create_time")) or datetime.utcnow(),
        raw_status=str(sale.get("state") or "")[:40],
    )
    db.add(payment)
    try:
        db.flush()
    except IntegrityError:  # the same sale, stored by a concurrent delivery
        db.rollback()
        return False
    return True
