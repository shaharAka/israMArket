"""Subscription billing with PayPal: status, confirm, cancel, webhook. See docs/billing.md.

The free month is ours (services/billing.py). Near its end the owner subscribes on
/billing with PayPal's own buttons (PayPal account, or "Debit or Credit Card"); card
details go to PayPal only. The browser then hands us a subscription id, and every fact we
store about it is read back from PayPal server-side (`confirm`) or arrives in a webhook
whose signature PayPal itself verified. Nothing the browser says is trusted.

Invoices: none yet. Israeli tax invoices will come from an invoicing service; every
completed payment is stored (models.Payment) so that can be added. PayPal's receipts are
not tax invoices, and no copy may say otherwise.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Subscription, User
from app.services import billing, paypal

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/media-allowance")
def media_allowance(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    from app.services.media_allowances import status
    return status(db, user)

WEBHOOK_PATH = "/billing/paypal/webhook"

SUBSCRIPTION_EVENTS = {
    "BILLING.SUBSCRIPTION.ACTIVATED",
    "BILLING.SUBSCRIPTION.UPDATED",
    "BILLING.SUBSCRIPTION.CANCELLED",
    "BILLING.SUBSCRIPTION.SUSPENDED",
    "BILLING.SUBSCRIPTION.EXPIRED",
    "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
}
SALE_COMPLETED = "PAYMENT.SALE.COMPLETED"

MSG_NOT_CONFIGURED = "התשלום עוד לא פתוח. החודש החינמי ממשיך כרגיל."
MSG_MISMATCH = "המנוי הזה לא שייך לחשבון שלכם. נסו שוב מהעמוד הזה."
MSG_NOT_APPROVED = "פייפאל עוד לא אישר את המנוי. נסו שוב."
MSG_TAKEN = "המנוי הזה כבר מחובר לחשבון אחר."
MSG_NOTHING_TO_CANCEL = "אין מנוי פעיל לבטל."


@router.get("/status")
def status(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """The free month, the subscription, and what the browser's PayPal buttons need."""
    return billing.status_payload(db, user)


class ConfirmIn(BaseModel):
    subscription_id: str = Field(min_length=3, max_length=64)


@router.post("/paypal/confirm")
def confirm(body: ConfirmIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """After PayPal's onApprove: read the subscription from PayPal and keep it if it is ours.

    Ours means: our plan, `custom_id` == this user's id (set by the page in
    createSubscription), and a status PayPal gives a subscription the payer approved or is
    approving. APPROVAL_PENDING is stored but grants nothing until PayPal activates it.
    """
    if not paypal.configured():
        raise HTTPException(status_code=503, detail=MSG_NOT_CONFIGURED)
    subscription_id = body.subscription_id.strip()
    if not paypal.valid_id(subscription_id):
        raise HTTPException(status_code=400, detail=paypal.MSG_NOT_FOUND)
    try:
        data = paypal.get_subscription(subscription_id)
    except paypal.PayPalError as exc:
        raise HTTPException(status_code=404 if exc.status == 404 else 502, detail=exc.message_he) from None

    if str(data.get("id") or "") != subscription_id:
        raise HTTPException(status_code=400, detail=paypal.MSG_NOT_FOUND)
    if data.get("plan_id") != paypal.settings().paypal_plan_id.strip() or str(data.get("custom_id") or "") != str(user.id):
        logger.warning("billing confirm refused for user %s: plan or custom_id mismatch on %s", user.id, subscription_id)
        raise HTTPException(status_code=400, detail=MSG_MISMATCH)
    if str(data.get("status") or "").upper() not in billing.CONFIRMABLE:
        raise HTTPException(status_code=400, detail=MSG_NOT_APPROVED)

    taken = (
        db.query(Subscription)
        .filter(Subscription.provider_subscription_id == subscription_id, Subscription.user_id != user.id)
        .first()
    )
    if taken:
        raise HTTPException(status_code=409, detail=MSG_TAKEN)

    now = datetime.utcnow()
    sub = billing.subscription_for(db, user)
    if sub is None:
        sub = Subscription(user_id=user.id, provider="paypal", provider_subscription_id=subscription_id, created_at=now)
        db.add(sub)
    elif sub.provider_subscription_id != subscription_id:
        # A new subscription replaces the old one on this row. One that could still charge
        # (suspended, or a stray pending one) is cancelled first, best effort, so the owner
        # is never billed twice.
        if sub.status not in billing.FINISHED:
            try:
                billing.cancel_at_paypal(sub, "Replaced by a new subscription")
            except paypal.PayPalError as exc:
                logger.error("old PayPal subscription %s of user %s not cancelled (status %s, debug_id=%s)",
                             sub.provider_subscription_id, user.id, exc.status, exc.debug_id)
        sub.provider_subscription_id = subscription_id
        sub.next_billing_time = None
        sub.cancelled_at = None
        sub.payment_failed_at = None
        sub.created_at = now
    billing.apply_paypal_subscription(sub, data, now)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=MSG_TAKEN) from None
    return billing.status_payload(db, user)


@router.post("/cancel")
def cancel(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Cancel at PayPal. What was already paid for stays open until its end."""
    sub = billing.subscription_for(db, user)
    if sub is None or sub.status in billing.FINISHED:
        raise HTTPException(status_code=400, detail=MSG_NOTHING_TO_CANCEL)
    if not paypal.credentials_configured():
        raise HTTPException(status_code=503, detail=MSG_NOT_CONFIGURED)
    try:
        billing.cancel_at_paypal(sub, "Cancelled by the customer")
    except paypal.PayPalError as exc:
        raise HTTPException(status_code=502, detail=exc.message_he) from None
    now = datetime.utcnow()
    sub.status = "CANCELLED"
    sub.cancelled_at = sub.cancelled_at or now
    sub.updated_at = now
    db.commit()
    return billing.status_payload(db, user)


# --- webhook ------------------------------------------------------------------------


@router.post("/paypal/webhook")
async def webhook(request: Request, db: Session = Depends(get_db)) -> dict:
    """PayPal's notifications. No session and no Origin check (main.csrf_origin_check skips
    exactly this path); instead every delivery is verified with PayPal against
    PAYPAL_WEBHOOK_ID before anything is read from it. Unknown event types are a 200 no-op
    so PayPal stops retrying them."""
    if not paypal.webhook_configured():
        raise HTTPException(status_code=503, detail="webhook not configured")
    raw = await request.body()
    headers = dict(request.headers)
    return await run_in_threadpool(_handle_webhook, db, headers, raw)


def _handle_webhook(db: Session, headers: dict, raw: bytes) -> dict:
    if not paypal.verify_webhook(headers, raw):
        raise HTTPException(status_code=400, detail="invalid signature")
    event = json.loads(raw)
    event_type = str(event.get("event_type") or "")
    resource = event.get("resource") if isinstance(event.get("resource"), dict) else {}
    if event_type in SUBSCRIPTION_EVENTS:
        _on_subscription_event(db, event_type, resource)
    elif event_type == SALE_COMPLETED:
        _on_sale_completed(db, resource)
    return {"ok": True}


def _user_from_custom_id(db: Session, value: object) -> User | None:
    text = str(value or "").strip()
    return db.get(User, int(text)) if text.isdigit() else None


def _fresh(subscription_id: str, fallback: dict) -> dict:
    """PayPal's current view (webhooks can arrive out of order); the event's copy if PayPal
    cannot be reached right now."""
    try:
        data = paypal.get_subscription(subscription_id)
        if str(data.get("id") or "") == subscription_id:
            return data
    except paypal.PayPalError:
        pass
    return fallback


def _on_subscription_event(db: Session, event_type: str, resource: dict) -> None:
    subscription_id = str(resource.get("id") or "")
    if not paypal.valid_id(subscription_id):
        return
    now = datetime.utcnow()
    sub = db.query(Subscription).filter(Subscription.provider_subscription_id == subscription_id).first()
    if sub is None:
        # The webhook can beat the browser's confirm. Adopt it only for an account with no
        # subscription row at all, on our plan: a stray subscription naming someone else's
        # id can never replace one they already have.
        user = _user_from_custom_id(db, resource.get("custom_id"))
        if user is None or resource.get("plan_id") != paypal.settings().paypal_plan_id.strip():
            logger.info("paypal %s for unknown subscription %s ignored", event_type, subscription_id)
            return
        if billing.subscription_for(db, user) is not None:
            logger.info("paypal %s for subscription %s ignored: user %s already has one", event_type, subscription_id, user.id)
            return
        sub = Subscription(user_id=user.id, provider="paypal", provider_subscription_id=subscription_id, created_at=now)
        db.add(sub)
    billing.apply_paypal_subscription(sub, _fresh(subscription_id, resource), now)
    if event_type == "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
        sub.payment_failed_at = now
    try:
        db.commit()
    except IntegrityError:
        db.rollback()


def _on_sale_completed(db: Session, sale: dict) -> None:
    subscription_id = str(sale.get("billing_agreement_id") or "")
    sub = (
        db.query(Subscription).filter(Subscription.provider_subscription_id == subscription_id).first()
        if subscription_id
        else None
    )
    user_id = sub.user_id if sub else None
    if user_id is None:
        user = _user_from_custom_id(db, sale.get("custom") or sale.get("custom_id"))
        user_id = user.id if user else None
    if user_id is None:
        logger.warning("paypal sale %s for unknown subscription %s not recorded", sale.get("id"), subscription_id)
        return
    if not billing.record_payment(db, user_id, sale, subscription_id):
        return  # already stored: a repeated delivery changes nothing
    # TODO(invoicing): issue the Israeli tax invoice here through the invoicing service
    # (Morning / Green Invoice or iCount) and store its id in Payment.invoice_ref.
    # See docs/billing.md, "Invoices (later)".
    if sub is not None:
        sub.payment_failed_at = None
        if paypal.valid_id(subscription_id):
            fresh = _fresh(subscription_id, {})
            if fresh:
                billing.apply_paypal_subscription(sub, fresh)
    db.commit()
