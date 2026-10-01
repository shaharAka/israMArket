"""Subscription billing with PayPal (routers/billing.py, services/billing.py, services/paypal.py).

Hermetic: a throwaway SQLite file and a fake PayPal behind httpx.MockTransport. Nothing
here can reach PayPal: the transport is the only way out of services/paypal.py, and it is
replaced in every test.
"""
import _test_env  # noqa: F401  (must come before any `app` import)

import io
import json
import re
import shutil
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta
from pathlib import Path
from unittest import mock

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.config import Settings
from app.db import Base, get_db
from app.main import app
from app.models import Payment, Subscription, User
from app.routers import trial as trial_router
from app.security import COOKIE_NAME, create_access_token, hash_password
from app.services import billing, images, paypal, ratelimit

PLAN = "P-TESTPLAN123"
WEBHOOK_ID = "WH-TEST-1"
SECRET = "the-client-secret-value"
PASSWORD = "correct-horse-battery"
HEBREW = re.compile(r"[֐-׿]")


def settings(**overrides) -> Settings:
    values = dict(
        paypal_env="sandbox",
        paypal_client_id="client-id-public",
        paypal_client_secret=SECRET,
        paypal_plan_id=PLAN,
        paypal_webhook_id=WEBHOOK_ID,
        billing_enforce=False,
    )
    values.update(overrides)
    return Settings(**values)


class FakePayPal:
    """Just enough of api-m.sandbox.paypal.com, recording every request."""

    def __init__(self):
        self.requests: list[httpx.Request] = []
        self.subscriptions: dict[str, dict] = {}
        self.token_expires_in = 32400
        self.tokens_issued = 0
        self.verification = "SUCCESS"
        self.cancel_status = 204
        self.fail_get = False

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handle)

    def add(self, sub_id: str, *, user_id: int, status: str = "ACTIVE", plan_id: str = PLAN, next_billing: str | None = "2026-11-30T10:00:00Z"):
        self.subscriptions[sub_id] = {
            "id": sub_id,
            "plan_id": plan_id,
            "custom_id": str(user_id),
            "status": status,
            "billing_info": {"next_billing_time": next_billing} if next_billing else {},
        }
        return self.subscriptions[sub_id]

    def count(self, path_part: str) -> int:
        return sum(1 for r in self.requests if path_part in r.url.path)

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path = request.url.path
        if path == "/v1/oauth2/token":
            self.tokens_issued += 1
            return httpx.Response(200, json={"access_token": f"TOKEN-{self.tokens_issued}", "expires_in": self.token_expires_in})
        if not request.headers.get("authorization", "").startswith("Bearer TOKEN-"):
            return httpx.Response(401, json={"name": "AUTHENTICATION_FAILURE"})
        if path == "/v1/notifications/verify-webhook-signature":
            return httpx.Response(200, json={"verification_status": self.verification})
        match = re.fullmatch(r"/v1/billing/subscriptions/([A-Za-z0-9-]+)(/cancel)?", path)
        if match:
            sub = self.subscriptions.get(match.group(1))
            if sub is None:
                return httpx.Response(404, json={"name": "RESOURCE_NOT_FOUND"})
            if match.group(2):
                if self.cancel_status == 204:
                    sub["status"] = "CANCELLED"
                    sub["billing_info"] = {}
                    return httpx.Response(204)
                return httpx.Response(self.cancel_status, json={"name": "INTERNAL_SERVER_ERROR"}, headers={"paypal-debug-id": "dbg1"})
            if self.fail_get:
                return httpx.Response(503, json={"name": "SERVICE_UNAVAILABLE"})
            return httpx.Response(200, json=sub)
        return httpx.Response(404, json={"name": "NOT_FOUND"})


class BillingTestCase(unittest.TestCase):
    enforce = False

    def setUp(self):
        ratelimit.reset()
        paypal.reset_token_cache()
        self.addCleanup(paypal.reset_token_cache)
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-billing-"))
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)

        def override_db():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_db
        self.addCleanup(app.dependency_overrides.clear)

        media = self.tmp / "media"
        media.mkdir()
        for patch in (
            mock.patch.object(images, "media_root", return_value=media),
            mock.patch.object(paypal, "get_settings", return_value=settings(billing_enforce=self.enforce)),
        ):
            patch.start()
            self.addCleanup(patch.stop)

        self.fake = FakePayPal()
        transport = mock.patch.object(paypal, "_TRANSPORT", self.fake.transport())
        transport.start()
        self.addCleanup(transport.stop)

        self.client = TestClient(app)

    # --- helpers --------------------------------------------------------------------

    def make_user(self, email="owner@example.com", days_ago: float = 0) -> int:
        db = self.Session()
        user = User(
            email=email,
            password_hash=hash_password(PASSWORD),
            full_name="בעלת העסק",
            trial_started_at=datetime.utcnow() - timedelta(days=days_ago),
        )
        db.add(user)
        db.commit()
        user_id = user.id
        db.close()
        return user_id

    def login(self, user_id: int):
        self.client.cookies.set(COOKIE_NAME, create_access_token(user_id))

    def add_row(self, user_id: int, sub_id="I-EXISTING1", status="ACTIVE", next_billing: datetime | None = None):
        db = self.Session()
        db.add(Subscription(user_id=user_id, provider_subscription_id=sub_id, plan_id=PLAN, status=status, next_billing_time=next_billing))
        db.commit()
        db.close()

    def row(self, user_id: int) -> Subscription | None:
        db = self.Session()
        try:
            sub = db.query(Subscription).filter(Subscription.user_id == user_id).first()
            if sub is not None:
                db.expunge(sub)
            return sub
        finally:
            db.close()

    def payments(self) -> int:
        with self.engine.connect() as conn:
            return conn.execute(select(func.count()).select_from(Payment)).scalar_one()

    def status(self) -> dict:
        response = self.client.get("/billing/status")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    WEBHOOK_HEADERS = {
        "PAYPAL-AUTH-ALGO": "SHA256withRSA",
        "PAYPAL-CERT-URL": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
        "PAYPAL-TRANSMISSION-ID": "tx-1",
        "PAYPAL-TRANSMISSION-SIG": "sig",
        "PAYPAL-TRANSMISSION-TIME": "2026-10-01T10:00:00Z",
        "Content-Type": "application/json",
    }

    def webhook(self, event: dict, headers: dict | None = None, raw: bytes | None = None):
        body = raw if raw is not None else json.dumps(event, ensure_ascii=False).encode()
        # A fresh client without the session cookie: PayPal has none.
        return TestClient(app).post("/billing/paypal/webhook", content=body, headers=headers if headers is not None else self.WEBHOOK_HEADERS)


# --- the PayPal client --------------------------------------------------------------


class PayPalClientTest(BillingTestCase):
    def test_token_is_cached_until_expiry(self):
        self.fake.add("I-AAA111", user_id=1)
        paypal.get_subscription("I-AAA111")
        paypal.get_subscription("I-AAA111")
        self.assertEqual(self.fake.tokens_issued, 1)
        token_request = next(r for r in self.fake.requests if r.url.path == "/v1/oauth2/token")
        self.assertIn(b"grant_type=client_credentials", token_request.content)
        self.assertTrue(token_request.headers["authorization"].startswith("Basic "))

    def test_token_near_expiry_is_refreshed(self):
        self.fake.token_expires_in = paypal.TOKEN_MARGIN_SECONDS - 1  # already inside the margin
        self.fake.add("I-AAA111", user_id=1)
        paypal.get_subscription("I-AAA111")
        paypal.get_subscription("I-AAA111")
        self.assertEqual(self.fake.tokens_issued, 2)

    def test_a_rejected_token_is_dropped_and_retried_once(self):
        self.fake.add("I-AAA111", user_id=1)
        paypal.get_subscription("I-AAA111")
        with paypal._token_lock:
            paypal._token_cache["token"] = "REVOKED"
        self.assertEqual(paypal.get_subscription("I-AAA111")["id"], "I-AAA111")
        self.assertEqual(self.fake.tokens_issued, 2)

    def test_errors_are_hebrew_and_never_carry_the_secret(self):
        with self.assertLogs("app.services.paypal", level="WARNING") as logs:
            with self.assertRaises(paypal.PayPalError) as caught:
                paypal.get_subscription("I-MISSING1")
        self.assertRegex(caught.exception.message_he, HEBREW)
        self.assertEqual(caught.exception.status, 404)
        joined = " ".join(logs.output)
        self.assertNotIn(SECRET, joined)
        self.assertNotIn("TOKEN-", joined)

    def test_ids_that_could_change_the_url_are_refused(self):
        with self.assertRaises(paypal.PayPalError):
            paypal.get_subscription("../../v1/oauth2/token")
        self.assertEqual(self.fake.requests, [])

    def test_not_configured_is_clean(self):
        with mock.patch.object(paypal, "get_settings", return_value=settings(paypal_client_id="", paypal_client_secret="")):
            self.assertFalse(paypal.configured())
            self.assertFalse(paypal.webhook_configured())
            with self.assertRaises(paypal.PayPalError):
                paypal.access_token()
        self.assertEqual(self.fake.requests, [])

    def test_live_and_sandbox_hosts(self):
        self.assertEqual(paypal.base_url(), "https://api-m.sandbox.paypal.com")
        with mock.patch.object(paypal, "get_settings", return_value=settings(paypal_env="live")):
            self.assertEqual(paypal.base_url(), "https://api-m.paypal.com")

    def test_price_matches_the_web_pricing_file(self):
        pricing = Path(__file__).resolve().parents[2] / "web" / "lib" / "pricing.ts"
        if not pricing.is_file():
            self.skipTest("web/ not present")
        match = re.search(r"export const PRICE_ILS = (\d+);", pricing.read_text(encoding="utf-8"))
        self.assertIsNotNone(match)
        self.assertEqual(int(match.group(1)), paypal.PRICE_ILS)


# --- status ---------------------------------------------------------------------------


class StatusTest(BillingTestCase):
    def test_first_day_of_the_trial(self):
        self.login(self.make_user())
        data = self.status()
        self.assertTrue(data["configured"])
        self.assertEqual(data["state"], "trial")
        self.assertEqual(data["trial"]["days_left"], 30)
        self.assertFalse(data["trial"]["ended"])
        self.assertTrue(data["needs_payment"])
        self.assertTrue(data["access"])
        self.assertFalse(data["remind"])
        self.assertIsNone(data["subscription"])
        self.assertEqual(data["client_id"], "client-id-public")
        self.assertEqual(data["plan_id"], PLAN)
        self.assertEqual(data["price_ils"], 99)
        self.assertEqual(data["currency"], "ILS")
        # The first charge is the day the free month ends, never earlier.
        self.assertEqual(data["start_time"], data["trial"]["ends_at"])
        self.assertTrue(data["start_time"].endswith("Z"))
        self.assertNotIn(SECRET, json.dumps(data))
        self.assertNotIn(WEBHOOK_ID, json.dumps(data))

    def test_last_week_reminds(self):
        self.login(self.make_user(days_ago=25))
        data = self.status()
        self.assertEqual(data["state"], "trial")
        self.assertLessEqual(data["trial"]["days_left"], 7)
        self.assertTrue(data["remind"])

    def test_trial_end_matches_the_trial_journey(self):
        """/billing and /trial agree on when the free month is over: day 31."""
        for days_ago in (29.5, 30.5, 31.5):
            db = self.Session()
            user = User(email=f"u{days_ago}@example.com", password_hash="x", full_name="",
                        trial_started_at=datetime.utcnow() - timedelta(days=days_ago))
            db.add(user)
            db.commit()
            now = datetime.utcnow()
            ended_by_trial = trial_router.day_of(user.trial_started_at, now) > trial_router.DAYS_TOTAL
            ended_by_billing = now >= billing.trial_end(db, user)
            self.assertEqual(ended_by_trial, ended_by_billing, days_ago)
            db.close()

    def test_ended_without_subscription(self):
        self.login(self.make_user(days_ago=40))
        data = self.status()
        self.assertEqual(data["state"], "trial_ended")
        self.assertTrue(data["trial"]["ended"])
        self.assertEqual(data["trial"]["days_left"], 0)
        self.assertTrue(data["needs_payment"])
        self.assertFalse(data["access"])
        self.assertFalse(data["locked"])  # enforcement is off
        self.assertTrue(data["remind"])
        self.assertIsNone(data["start_time"])  # the charge can start right away

    def test_within_the_grace_days_access_continues(self):
        self.login(self.make_user(days_ago=31.5))
        data = self.status()
        self.assertEqual(data["state"], "trial_ended")
        self.assertTrue(data["access"])

    def test_active(self):
        user_id = self.make_user(days_ago=45)
        self.add_row(user_id, status="ACTIVE", next_billing=datetime(2026, 11, 30, 10, 0))
        self.login(user_id)
        data = self.status()
        self.assertEqual(data["state"], "active")
        self.assertFalse(data["needs_payment"])
        self.assertTrue(data["access"])
        self.assertFalse(data["remind"])
        self.assertEqual(data["subscription"]["next_billing_time"], "2026-11-30T10:00:00Z")

    def test_approval_pending_grants_nothing(self):
        user_id = self.make_user(days_ago=45)
        self.add_row(user_id, status="APPROVAL_PENDING")
        self.login(user_id)
        data = self.status()
        self.assertEqual(data["state"], "trial_ended")
        self.assertFalse(data["access"])
        self.assertTrue(data["needs_payment"])

    def test_not_configured(self):
        self.login(self.make_user(days_ago=40))
        with mock.patch.object(paypal, "get_settings", return_value=settings(paypal_client_id="", paypal_client_secret="", paypal_plan_id="")):
            data = self.status()
        self.assertFalse(data["configured"])
        self.assertIsNone(data["client_id"])
        self.assertIsNone(data["plan_id"])
        self.assertFalse(data["remind"])
        self.assertFalse(data["locked"])

    def test_requires_a_session(self):
        self.assertEqual(self.client.get("/billing/status").status_code, 401)


# --- confirm -----------------------------------------------------------------------------


class ConfirmTest(BillingTestCase):
    def confirm(self, sub_id: str):
        return self.client.post("/billing/paypal/confirm", json={"subscription_id": sub_id})

    def test_happy_path(self):
        user_id = self.make_user(days_ago=25)
        self.login(user_id)
        self.fake.add("I-NEWSUB001", user_id=user_id, status="ACTIVE", next_billing="2026-10-31T22:00:00Z")
        response = self.confirm("I-NEWSUB001")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["state"], "active")
        row = self.row(user_id)
        self.assertEqual(row.provider_subscription_id, "I-NEWSUB001")
        self.assertEqual(row.status, "ACTIVE")
        self.assertEqual(row.plan_id, PLAN)
        self.assertEqual(row.next_billing_time, datetime(2026, 10, 31, 22, 0))
        # Read back from PayPal, server-side.
        self.assertEqual(self.fake.count("/v1/billing/subscriptions/I-NEWSUB001"), 1)

    def test_other_plan_is_refused(self):
        user_id = self.make_user()
        self.login(user_id)
        self.fake.add("I-OTHERPLAN", user_id=user_id, plan_id="P-SOMETHINGELSE")
        response = self.confirm("I-OTHERPLAN")
        self.assertEqual(response.status_code, 400)
        self.assertRegex(response.json()["detail"], HEBREW)
        self.assertIsNone(self.row(user_id))

    def test_someone_elses_subscription_is_refused(self):
        user_id = self.make_user()
        other_id = self.make_user("other@example.com")
        self.login(user_id)
        self.fake.add("I-NOTYOURS1", user_id=other_id)
        self.assertEqual(self.confirm("I-NOTYOURS1").status_code, 400)
        self.assertIsNone(self.row(user_id))
        self.assertIsNone(self.row(other_id))

    def test_a_status_paypal_did_not_approve_is_refused(self):
        user_id = self.make_user()
        self.login(user_id)
        self.fake.add("I-CANCELLED", user_id=user_id, status="CANCELLED")
        self.assertEqual(self.confirm("I-CANCELLED").status_code, 400)
        self.assertIsNone(self.row(user_id))

    def test_unknown_subscription(self):
        self.login(self.make_user())
        self.assertEqual(self.confirm("I-DOESNOTEXIST").status_code, 404)

    def test_not_configured(self):
        self.login(self.make_user())
        with mock.patch.object(paypal, "get_settings", return_value=settings(paypal_plan_id="")):
            self.assertEqual(self.confirm("I-WHATEVER1").status_code, 503)
        self.assertEqual(self.fake.requests, [])

    def test_resubscribing_replaces_and_cancels_a_suspended_one(self):
        user_id = self.make_user(days_ago=60)
        self.fake.add("I-OLDSUSP01", user_id=user_id, status="SUSPENDED")
        self.add_row(user_id, sub_id="I-OLDSUSP01", status="SUSPENDED")
        self.fake.add("I-NEWSUB002", user_id=user_id, status="ACTIVE")
        self.login(user_id)
        response = self.confirm("I-NEWSUB002")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.fake.subscriptions["I-OLDSUSP01"]["status"], "CANCELLED")
        self.assertEqual(self.row(user_id).provider_subscription_id, "I-NEWSUB002")


# --- cancel ------------------------------------------------------------------------------


class CancelTest(BillingTestCase):
    def test_cancel_keeps_the_paid_period(self):
        user_id = self.make_user(days_ago=45)
        paid_until = datetime.utcnow() + timedelta(days=12)
        self.fake.add("I-TOCANCEL1", user_id=user_id)
        self.add_row(user_id, sub_id="I-TOCANCEL1", status="ACTIVE", next_billing=paid_until)
        self.login(user_id)
        response = self.client.post("/billing/cancel")
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(self.fake.count("/v1/billing/subscriptions/I-TOCANCEL1/cancel"), 1)
        self.assertEqual(data["state"], "cancelled")
        self.assertTrue(data["access"])
        self.assertTrue(data["needs_payment"])  # may subscribe again
        self.assertEqual(data["subscription"]["paid_through"], billing.iso_utc(paid_until))
        # A new subscription would start charging when the paid period ends.
        self.assertEqual(data["start_time"], billing.iso_utc(paid_until))
        row = self.row(user_id)
        self.assertEqual(row.status, "CANCELLED")
        self.assertIsNotNone(row.cancelled_at)

    def test_cancel_in_the_free_month_keeps_the_free_month(self):
        user_id = self.make_user(days_ago=10)
        self.fake.add("I-TRIALCAN1", user_id=user_id, next_billing=None)
        self.add_row(user_id, sub_id="I-TRIALCAN1", status="ACTIVE")
        self.login(user_id)
        data = self.client.post("/billing/cancel").json()
        self.assertEqual(data["state"], "cancelled")
        self.assertEqual(data["subscription"]["paid_through"], data["trial"]["ends_at"])

    def test_paypal_failure_changes_nothing(self):
        user_id = self.make_user(days_ago=45)
        self.fake.add("I-TOCANCEL2", user_id=user_id)
        self.fake.cancel_status = 500
        self.add_row(user_id, sub_id="I-TOCANCEL2", status="ACTIVE")
        self.login(user_id)
        response = self.client.post("/billing/cancel")
        self.assertEqual(response.status_code, 502)
        self.assertRegex(response.json()["detail"], HEBREW)
        self.assertEqual(self.row(user_id).status, "ACTIVE")

    def test_nothing_to_cancel(self):
        self.login(self.make_user())
        self.assertEqual(self.client.post("/billing/cancel").status_code, 400)


# --- webhook -----------------------------------------------------------------------------


def sale_event(sale_id="SALE-1", sub_id="I-SUBWEB001", event_id="WH-EVT-1") -> dict:
    return {
        "id": event_id,
        "event_type": "PAYMENT.SALE.COMPLETED",
        "resource": {
            "id": sale_id,
            "state": "completed",
            "amount": {"total": "99.00", "currency": "ILS"},
            "billing_agreement_id": sub_id,
            "create_time": "2026-11-01T10:00:00Z",
        },
    }


def subscription_event(event_type: str, sub_id="I-SUBWEB001", user_id=1, status="ACTIVE") -> dict:
    return {
        "id": "WH-EVT-S",
        "event_type": event_type,
        "resource": {"id": sub_id, "plan_id": PLAN, "custom_id": str(user_id), "status": status,
                     "billing_info": {"next_billing_time": "2026-12-01T10:00:00Z"}},
    }


class WebhookTest(BillingTestCase):
    def test_bad_signature_is_rejected(self):
        user_id = self.make_user()
        self.add_row(user_id, sub_id="I-SUBWEB001")
        self.fake.verification = "FAILURE"
        response = self.webhook(sale_event())
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.payments(), 0)

    def test_missing_signature_headers_are_rejected_without_asking_paypal(self):
        response = self.webhook(sale_event(), headers={"Content-Type": "application/json"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.fake.count("verify-webhook-signature"), 0)

    def test_verification_sends_the_raw_event_and_our_webhook_id(self):
        user_id = self.make_user()
        self.add_row(user_id, sub_id="I-SUBWEB001")
        raw = json.dumps(sale_event(), ensure_ascii=False, indent=1).encode()  # unusual spacing, kept verbatim
        self.assertEqual(self.webhook({}, raw=raw).status_code, 200)
        verify = next(r for r in self.fake.requests if r.url.path.endswith("verify-webhook-signature"))
        self.assertIn(raw.strip(), verify.content)
        body = json.loads(verify.content)
        self.assertEqual(body["webhook_id"], WEBHOOK_ID)
        self.assertEqual(body["transmission_id"], "tx-1")
        self.assertEqual(body["cert_url"], self.WEBHOOK_HEADERS["PAYPAL-CERT-URL"])
        self.assertEqual(body["webhook_event"]["id"], "WH-EVT-1")

    def test_sale_is_recorded_once(self):
        user_id = self.make_user(days_ago=45)
        self.add_row(user_id, sub_id="I-SUBWEB001")
        self.fake.add("I-SUBWEB001", user_id=user_id)
        self.assertEqual(self.webhook(sale_event()).status_code, 200)
        self.assertEqual(self.webhook(sale_event()).status_code, 200)  # PayPal redelivers
        self.assertEqual(self.payments(), 1)
        db = self.Session()
        payment = db.query(Payment).one()
        self.assertEqual(payment.user_id, user_id)
        self.assertEqual(payment.amount, "99.00")
        self.assertEqual(payment.currency, "ILS")
        self.assertEqual(payment.provider_subscription_id, "I-SUBWEB001")
        self.assertEqual(payment.paid_at, datetime(2026, 11, 1, 10, 0))
        self.assertIsNone(payment.invoice_ref)
        db.close()

    def test_sale_clears_a_failed_payment(self):
        user_id = self.make_user(days_ago=45)
        self.add_row(user_id, sub_id="I-SUBWEB001")
        self.fake.add("I-SUBWEB001", user_id=user_id)
        self.webhook(subscription_event("BILLING.SUBSCRIPTION.PAYMENT.FAILED", user_id=user_id))
        self.login(user_id)
        data = self.status()
        self.assertEqual(data["state"], "payment_failed")
        self.assertFalse(data["needs_payment"])  # PayPal is retrying; no second subscription
        self.webhook(sale_event())
        self.assertEqual(self.status()["state"], "active")

    def test_cancelled_event(self):
        user_id = self.make_user(days_ago=45)
        self.add_row(user_id, sub_id="I-SUBWEB001", next_billing=datetime.utcnow() + timedelta(days=9))
        self.fake.add("I-SUBWEB001", user_id=user_id, status="CANCELLED", next_billing=None)
        self.assertEqual(self.webhook(subscription_event("BILLING.SUBSCRIPTION.CANCELLED", user_id=user_id, status="CANCELLED")).status_code, 200)
        row = self.row(user_id)
        self.assertEqual(row.status, "CANCELLED")
        self.assertIsNotNone(row.cancelled_at)
        self.assertIsNotNone(row.next_billing_time)  # the paid period is remembered
        self.login(user_id)
        self.assertEqual(self.status()["state"], "cancelled")

    def test_suspended_and_expired(self):
        user_id = self.make_user(days_ago=45)
        self.add_row(user_id, sub_id="I-SUBWEB001")
        self.fake.add("I-SUBWEB001", user_id=user_id, status="SUSPENDED")
        self.webhook(subscription_event("BILLING.SUBSCRIPTION.SUSPENDED", user_id=user_id, status="SUSPENDED"))
        self.assertEqual(self.row(user_id).status, "SUSPENDED")
        self.fake.subscriptions["I-SUBWEB001"]["status"] = "EXPIRED"
        self.webhook(subscription_event("BILLING.SUBSCRIPTION.EXPIRED", user_id=user_id, status="EXPIRED"))
        self.assertEqual(self.row(user_id).status, "EXPIRED")

    def test_the_webhook_can_arrive_before_confirm(self):
        user_id = self.make_user()
        self.fake.add("I-SUBWEB001", user_id=user_id)
        self.webhook(subscription_event("BILLING.SUBSCRIPTION.ACTIVATED", user_id=user_id))
        self.assertEqual(self.row(user_id).status, "ACTIVE")

    def test_a_stray_subscription_never_replaces_an_existing_one(self):
        user_id = self.make_user()
        self.add_row(user_id, sub_id="I-MINE00001")
        self.fake.add("I-STRAY0001", user_id=user_id, status="CANCELLED")
        self.webhook(subscription_event("BILLING.SUBSCRIPTION.CANCELLED", sub_id="I-STRAY0001", user_id=user_id, status="CANCELLED"))
        row = self.row(user_id)
        self.assertEqual(row.provider_subscription_id, "I-MINE00001")
        self.assertEqual(row.status, "ACTIVE")

    def test_out_of_order_events_follow_paypal(self):
        """An old ACTIVATED arriving after a cancellation must not revive the subscription."""
        user_id = self.make_user()
        self.add_row(user_id, sub_id="I-SUBWEB001", status="CANCELLED")
        self.fake.add("I-SUBWEB001", user_id=user_id, status="CANCELLED")
        self.webhook(subscription_event("BILLING.SUBSCRIPTION.ACTIVATED", user_id=user_id, status="ACTIVE"))
        self.assertEqual(self.row(user_id).status, "CANCELLED")

    def test_unknown_events_are_a_no_op(self):
        response = self.webhook({"id": "WH-X", "event_type": "CUSTOMER.DISPUTE.CREATED", "resource": {"id": "PP-D-1"}})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.payments(), 0)

    def test_no_csrf_check_on_the_webhook_only(self):
        headers = dict(self.WEBHOOK_HEADERS, Origin="https://www.paypal.com")
        response = self.webhook({"id": "WH-X", "event_type": "CUSTOMER.DISPUTE.CREATED", "resource": {}}, headers=headers)
        self.assertEqual(response.status_code, 200)
        # Every other path still refuses a foreign origin.
        user_id = self.make_user()
        self.login(user_id)
        refused = self.client.post("/billing/cancel", headers={"Origin": "https://www.paypal.com"})
        self.assertEqual(refused.status_code, 403)

    def test_not_configured(self):
        with mock.patch.object(paypal, "get_settings", return_value=settings(paypal_webhook_id="")):
            self.assertEqual(self.webhook(sale_event()).status_code, 503)
        self.assertEqual(self.fake.requests, [])


# --- account deletion --------------------------------------------------------------------


class DeletionTest(BillingTestCase):
    def delete(self):
        return self.client.request("DELETE", "/auth/account", json={"password": PASSWORD})

    def test_deletion_cancels_the_subscription_then_deletes_the_rows(self):
        user_id = self.make_user(days_ago=45)
        self.fake.add("I-DELETEME1", user_id=user_id)
        self.add_row(user_id, sub_id="I-DELETEME1")
        db = self.Session()
        db.add(Payment(user_id=user_id, provider_payment_id="SALE-DEL-1", amount="99.00"))
        db.commit()
        db.close()
        self.login(user_id)
        self.assertEqual(self.delete().status_code, 200)
        self.assertEqual(self.fake.subscriptions["I-DELETEME1"]["status"], "CANCELLED")
        self.assertIsNone(self.row(user_id))
        self.assertEqual(self.payments(), 0)

    def test_a_paypal_failure_does_not_block_deletion(self):
        user_id = self.make_user(days_ago=45)
        self.fake.add("I-DELETEME2", user_id=user_id)
        self.fake.cancel_status = 500
        self.add_row(user_id, sub_id="I-DELETEME2")
        self.login(user_id)
        with self.assertLogs("app.services.billing", level="ERROR") as logs:
            self.assertEqual(self.delete().status_code, 200)
        self.assertIn("I-DELETEME2", " ".join(logs.output))
        self.assertIsNone(self.row(user_id))

    def test_an_already_cancelled_subscription_is_not_cancelled_again(self):
        user_id = self.make_user(days_ago=45)
        self.add_row(user_id, sub_id="I-GONE00001", status="CANCELLED")
        self.login(user_id)
        self.assertEqual(self.delete().status_code, 200)
        self.assertEqual(self.fake.count("/cancel"), 0)


# --- enforcement -------------------------------------------------------------------------

# The endpoints that start new AI generation, and only they. Changing this set is a product
# decision: viewing, editing, exporting, the account and deletion are never gated.
GATED = {
    ("POST", "/onboarding/hypotheses"),
    ("POST", "/onboarding/targets"),
    ("POST", "/onboarding/plan"),
    ("POST", "/onboarding/generate"),
    ("POST", "/onboarding/posts/start"),
    ("POST", "/strategy/next-month"),
    ("POST", "/strategy/posts/rewrite"),
    ("POST", "/strategy/posts/image"),
    ("POST", "/strategy/posts/images"),
    ("POST", "/strategy/posts/design"),
    ("POST", "/research/run"),
    ("POST", "/recommendations/generate"),
    ("POST", "/performance/weekly"),
    ("POST", "/audiences/generate"),
    ("POST", "/instagram/brief/refresh"),
    # "לנסות סגנון אחר" writes a new Design DNA with the model.
    ("POST", "/brand/dna/regenerate"),
}


def _uses(dependant, call) -> bool:
    return any(dep.call is call or _uses(dep, call) for dep in dependant.dependencies)


class EnforcementAuditTest(unittest.TestCase):
    def test_exactly_the_generation_endpoints_carry_the_gate(self):
        found = set()
        for route in app.routes:
            dependant = getattr(route, "dependant", None)
            if dependant is not None and _uses(dependant, billing.require_generation_access):
                for method in route.methods:
                    found.add((method, route.path))
        self.assertEqual(found, GATED)

    def test_off_by_default(self):
        self.assertFalse(Settings().billing_enforce)


class EnforcementOffTest(BillingTestCase):
    enforce = False

    def test_expired_account_is_not_blocked(self):
        self.login(self.make_user(days_ago=60))
        # No business: the endpoint itself answers 404. The gate let it through.
        self.assertEqual(self.client.post("/research/run").status_code, 404)


class EnforcementOnTest(BillingTestCase):
    enforce = True

    def test_expired_account_gets_402_on_generation(self):
        self.login(self.make_user(days_ago=60))
        for method, path in sorted(GATED):
            response = self.client.request(method, path, json={})
            self.assertEqual(response.status_code, 402, f"{method} {path}: {response.text}")
            self.assertRegex(response.json()["detail"], HEBREW)
        self.assertTrue(self.status()["locked"])

    def test_viewing_account_and_deletion_still_work(self):
        user_id = self.make_user(days_ago=60)
        self.login(user_id)
        self.assertEqual(self.client.get("/auth/me").status_code, 200)
        self.assertEqual(self.client.get("/billing/status").status_code, 200)
        self.assertEqual(self.client.get("/trial").status_code, 200)
        self.assertEqual(self.client.request("DELETE", "/auth/account", json={"password": PASSWORD}).status_code, 200)

    def test_trial_grace_and_active_are_not_blocked(self):
        for days_ago in (5, 32):  # in the month; in the grace days after it
            self.login(self.make_user(f"t{days_ago}@example.com", days_ago=days_ago))
            self.assertEqual(self.client.post("/research/run").status_code, 404)
        user_id = self.make_user("paid@example.com", days_ago=90)
        self.add_row(user_id, sub_id="I-PAID00001", status="ACTIVE")
        self.login(user_id)
        self.assertEqual(self.client.post("/research/run").status_code, 404)

    def test_cancelled_is_open_until_the_paid_period_ends(self):
        user_id = self.make_user(days_ago=90)
        self.add_row(user_id, sub_id="I-CANC00001", status="CANCELLED", next_billing=datetime.utcnow() + timedelta(days=5))
        self.login(user_id)
        self.assertEqual(self.client.post("/research/run").status_code, 404)
        other = self.make_user("lapsed@example.com", days_ago=90)
        self.add_row(other, sub_id="I-CANC00002", status="CANCELLED", next_billing=datetime.utcnow() - timedelta(days=10))
        self.login(other)
        self.assertEqual(self.client.post("/research/run").status_code, 402)

    def test_nothing_is_enforced_while_paypal_is_not_configured(self):
        self.login(self.make_user(days_ago=60))
        with mock.patch.object(paypal, "get_settings", return_value=settings(billing_enforce=True, paypal_plan_id="")):
            self.assertEqual(self.client.post("/research/run").status_code, 404)


# --- setup job ---------------------------------------------------------------------------


class SetupJobTest(BillingTestCase):
    def test_dry_run_prints_the_plan_and_calls_nothing(self):
        from app.jobs import paypal_setup

        out = io.StringIO()
        with redirect_stdout(out):
            self.assertEqual(paypal_setup.main(["--dry-run"]), 0)
        text = out.getvalue()
        self.assertEqual(self.fake.requests, [])
        self.assertIn('"currency_code": "ILS"', text)
        self.assertIn('"value": "99"', text)
        self.assertIn('"interval_unit": "MONTH"', text)
        self.assertNotIn("TRIAL", text)
        self.assertNotIn(SECRET, text)

    def test_creates_product_and_plan_and_prints_the_plan_id(self):
        from app.jobs import paypal_setup

        created = {}

        def handle(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/v1/oauth2/token":
                return httpx.Response(200, json={"access_token": "TOKEN-1", "expires_in": 3600})
            if request.url.path == "/v1/catalogs/products":
                created["product_request_id"] = request.headers.get("paypal-request-id")
                return httpx.Response(201, json={"id": "PROD-1"})
            if request.url.path == "/v1/billing/plans" and request.method == "GET":
                return httpx.Response(200, json={"plans": []})
            if request.url.path == "/v1/billing/plans":
                created["plan"] = json.loads(request.content)
                return httpx.Response(201, json={"id": "P-NEW"})
            return httpx.Response(404)

        out = io.StringIO()
        with mock.patch.object(paypal, "_TRANSPORT", httpx.MockTransport(handle)), redirect_stdout(out):
            self.assertEqual(paypal_setup.main([]), 0)
        self.assertIn("PAYPAL_PLAN_ID=P-NEW", out.getvalue())
        self.assertNotIn(SECRET, out.getvalue())
        self.assertNotIn("TOKEN-1", out.getvalue())
        self.assertTrue(created["product_request_id"])
        self.assertEqual(created["plan"]["product_id"], "PROD-1")
        self.assertNotIn("taxes", created["plan"])

    def test_an_existing_plan_is_reused(self):
        from app.jobs import paypal_setup

        def handle(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/v1/oauth2/token":
                return httpx.Response(200, json={"access_token": "TOKEN-1", "expires_in": 3600})
            if request.url.path == "/v1/catalogs/products/PROD-1":
                return httpx.Response(200, json={"id": "PROD-1"})
            if request.url.path == "/v1/billing/plans" and request.method == "GET":
                return httpx.Response(200, json={"plans": [{"id": "P-OLD", "status": "ACTIVE", "billing_cycles": [
                    {"tenure_type": "REGULAR", "pricing_scheme": {"fixed_price": {"value": "99.0", "currency_code": "ILS"}}}]}]})
            raise AssertionError(f"unexpected {request.method} {request.url.path}")

        out = io.StringIO()
        with mock.patch.object(paypal, "_TRANSPORT", httpx.MockTransport(handle)), redirect_stdout(out):
            self.assertEqual(paypal_setup.main(["--product-id", "PROD-1"]), 0)
        self.assertIn("PAYPAL_PLAN_ID=P-OLD", out.getvalue())


if __name__ == "__main__":
    unittest.main()
