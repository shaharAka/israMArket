"""Offline spend/entitlement tests. No provider request or paid generation."""
import _test_env  # noqa: F401

import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db import Base, get_db, sqlite_pragmas
from app.deps import get_current_user
from app.errors import CodedError
from app.main import app
from app.models import Business, ImageUsage, MediaAllowance, MediaAttempt, Subscription, User
from app.services import media_allowances as caps, muse_image, image_routing

NOW = datetime(2026, 10, 20, 12)


class MediaCapsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.engine = sqlite_pragmas(create_engine(f"sqlite:///{Path(self.tmp.name) / 'db.sqlite'}",
                                                  connect_args={"check_same_thread": False}))
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.db.close)
        self.user = User(email="caps@example.com", full_name="Caps", trial_started_at=datetime(2026, 9, 1),
                         created_at=datetime(2026, 9, 1))
        self.db.add(self.user)
        self.db.commit()
        self.biz = Business(user_id=self.user.id, name="One")
        self.other = Business(user_id=self.user.id, name="Two")
        self.db.add_all([self.biz, self.other])
        self.db.commit()
        self.sub = Subscription(user_id=self.user.id, provider_subscription_id="I-CAPS", status="ACTIVE",
                                next_billing_time=datetime(2026, 10, 31))
        self.db.add(self.sub)
        self.db.commit()

    def reserve(self, key="one", kind="video", business=None, ceiling=100_000, now=NOW):
        return caps.reserve(self.db, business or self.biz.id, kind=kind, key=key,
                            provider="fake", model="offline", ceiling=ceiling, now=now)

    def row(self, kind="video"):
        self.db.expire_all()
        return self.db.query(MediaAllowance).filter_by(kind=kind).one()

    def test_two_video_units_shared_across_businesses_and_ai_revisions(self):
        first = self.reserve("new-clip")
        caps.settle(self.db, first, state="succeeded", cost_usd=0.1)
        second = self.reserve("edit-clip", business=self.other.id)
        caps.settle(self.db, second, state="succeeded", cost_usd=0.1)
        with self.assertRaises(CodedError) as blocked:
            self.reserve("regenerate")
        self.assertEqual(blocked.exception.code, "media_allowance_exhausted")
        self.assertEqual((self.row().used, self.row().reserved), (2, 0))

    def test_atomic_concurrent_reservations_cannot_overspend(self):
        biz_id = self.biz.id
        def run(n):
            with Session(self.engine) as db:
                try:
                    return caps.reserve(db, biz_id, kind="video", key=f"parallel-{n}",
                                        provider="fake", model="offline", ceiling=100_000, now=NOW)
                except CodedError as exc:
                    return exc.status_code
        with ThreadPoolExecutor(max_workers=8) as pool:
            answers = list(pool.map(run, range(16)))
        self.assertEqual(answers.count(429), 14)
        self.assertEqual((self.row().reserved, self.row().attempts), (2, 2))

    def test_duplicate_request_and_duplicate_callback_debit_once(self):
        attempt = self.reserve()
        with self.assertRaises(CodedError) as duplicate:
            self.reserve()
        self.assertEqual(duplicate.exception.status_code, 409)
        for _ in range(2):
            caps.settle(self.db, attempt, state="succeeded", cost_usd=0.08)
        caps.settle(self.db, attempt, state="failed", cost_usd=0)
        self.assertEqual((self.row().used, self.row().attempts, self.row().committed_microusd), (1, 1, 80_000))

    def test_confirmed_failure_releases_unit_but_not_attempt_or_cost(self):
        attempt = self.reserve()
        caps.settle(self.db, attempt, state="failed")
        self.assertEqual((self.row().used, self.row().reserved, self.row().attempts,
                          self.row().committed_microusd), (0, 0, 1, 100_000))

    def test_unknown_outcome_retains_hold_and_can_be_reconciled_once(self):
        attempt = self.reserve()
        caps.settle(self.db, attempt, state="unknown")
        self.db.rollback()
        self.assertEqual((self.row().reserved, self.row().reserved_microusd), (1, 100_000))
        caps.settle(self.db, attempt, state="succeeded", cost_usd=0.07, provider_ref="verified-result")
        caps.settle(self.db, attempt, state="succeeded", cost_usd=0.07)
        self.assertEqual((self.row().used, self.row().reserved, self.row().committed_microusd), (1, 0, 70_000))

    def test_failed_output_cannot_create_unlimited_paid_retries(self):
        for n in range(4):
            caps.settle(self.db, self.reserve(str(n)), state="failed", cost_usd=0)
        with self.assertRaises(CodedError):
            self.reserve("fifth")
        self.assertEqual(self.row().attempts, 4)

    def test_operator_budget_blocks_before_submission(self):
        for n in range(2):
            caps.settle(self.db, self.reserve(str(n), kind="image", ceiling=600_000),
                        state="succeeded", cost_usd=2.3)
        with self.assertRaises(CodedError):
            self.reserve("budget-overflow", kind="image", ceiling=600_000)
        self.assertEqual(self.row("image").attempts, 2)

    def test_trial_has_twenty_images_and_no_video(self):
        self.db.delete(self.sub)
        self.db.commit()
        with self.assertRaises(CodedError):
            self.reserve()
        for n in range(20):
            attempt = self.reserve(str(n), kind="image")
            caps.settle(self.db, attempt, state="succeeded", cost_usd=0.01)
        with self.assertRaises(CodedError):
            self.reserve("extra", kind="image")

    def test_unpaid_expired_trial_never_replenishes_monthly(self):
        self.db.delete(self.sub)
        self.db.commit()
        self.assertEqual(caps.window(self.db, self.user, NOW), caps.window(self.db, self.user, NOW + timedelta(days=100)))

    def test_early_approval_does_not_multiply_trial_allowance(self):
        tier, _, _ = caps.window(self.db, self.user, datetime(2026, 9, 15))
        self.assertEqual(tier, "trial")

    def test_only_verified_renewal_changes_paid_window(self):
        original = caps.window(self.db, self.user, NOW)
        self.assertEqual(original, caps.window(self.db, self.user, datetime(2026, 12, 1)))
        self.sub.next_billing_time = datetime(2026, 12, 15)
        self.db.commit()
        renewed = caps.window(self.db, self.user, datetime(2026, 11, 20))
        self.assertNotEqual(original[1], renewed[1])

    def test_cancellation_keeps_paid_window_without_grace_reset(self):
        original = caps.window(self.db, self.user, NOW)
        self.sub.status = "CANCELLED"
        self.db.commit()
        self.assertEqual(original, caps.window(self.db, self.user, datetime(2026, 11, 16)))

    def test_exempt_accounts_are_bounded_and_use_stable_month_anniversary(self):
        self.db.delete(self.sub)
        self.user.billing_exempt = True
        self.db.commit()
        status = caps.status(self.db, self.user, NOW)
        self.assertEqual(status["images"]["included"], 60)
        self.assertEqual(status["videos"]["included"], 2)
        self.assertFalse(status["videos"]["generation_available"])

    def test_workspace_deletion_does_not_refund_account_usage(self):
        caps.settle(self.db, self.reserve(), state="succeeded", cost_usd=0.1)
        self.db.delete(self.biz)
        self.db.commit()
        self.assertEqual(self.row().used, 1)

    def test_another_account_does_not_share_or_read_allowance(self):
        owner = User(email="separate@example.com", full_name="Other", billing_exempt=True,
                     trial_started_at=datetime(2026, 9, 1))
        self.db.add(owner)
        self.db.commit()
        self.reserve()
        self.assertEqual(caps.status(self.db, owner, NOW)["videos"]["reserved"], 0)

    def test_allowance_http_read_is_authenticated_and_never_generates(self):
        def get_test_db():
            yield self.db
        app.dependency_overrides[get_db] = get_test_db
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.addCleanup(app.dependency_overrides.clear)
        with TestClient(app) as client, mock.patch.object(muse_image, "generate") as provider:
            result = client.get("/billing/media-allowance")
        self.assertEqual(result.status_code, 200)
        self.assertNotIn("user_id", result.text)
        provider.assert_not_called()

    def test_image_path_reserves_success_and_blocks_real_provider_when_full(self):
        with mock.patch.object(muse_image, "generate", return_value=(b"pixels", "image/png")) as provider:
            first = image_routing.route("generate", muse_prompt="one", gemini_prompt="one", aspect="4:5",
                                        business_id=self.biz.id, db=self.db)
            self.assertEqual(first.provider, "muse")
            row = self.row("image")
            row.used = 60
            self.db.commit()
            with self.assertRaises(CodedError):
                image_routing.route("generate", muse_prompt="two", gemini_prompt="two", aspect="4:5",
                                    business_id=self.other.id, db=self.db)
        self.assertEqual(provider.call_count, 1)

    def test_timeout_does_not_submit_fallback_or_refund(self):
        with mock.patch.object(muse_image, "generate", side_effect=muse_image.MuseTimeout("timeout")), \
                mock.patch.object(image_routing, "generate_image") as fallback:
            with self.assertRaises(image_routing.ImageRoutingError):
                image_routing.route("generate", muse_prompt="one", gemini_prompt="one", aspect="4:5",
                                    business_id=self.biz.id, db=self.db)
        fallback.assert_not_called()
        self.assertEqual(self.row("image").reserved, 1)
        self.assertEqual(self.db.query(MediaAttempt).one().state, "unknown")

    def test_current_period_recorded_images_are_not_given_a_fresh_allowance(self):
        self.db.add_all([ImageUsage(business_id=self.biz.id, outcome="ok", provider="muse",
                                   est_cost_usd=.01, created_at=NOW) for _ in range(60)])
        self.db.commit()
        self.assertEqual(caps.status(self.db, self.user, NOW)["images"]["remaining"], 0)
        with self.assertRaises(CodedError):
            self.reserve("extra", kind="image")

    def test_new_paid_period_excludes_previous_recorded_images(self):
        self.db.add(ImageUsage(business_id=self.biz.id, outcome="ok", created_at=datetime(2026, 9, 29)))
        self.db.commit()
        self.assertEqual(caps.status(self.db, self.user, NOW)["images"]["remaining"], 60)

    def test_gemini_preflight_failure_releases_customer_unit(self):
        with mock.patch.object(image_routing.get_settings(), "image_generate_provider", "gemini"), \
                mock.patch.object(image_routing, "generate_image", side_effect=caps.MediaPreflightRejected("no call")):
            with self.assertRaises(caps.MediaPreflightRejected):
                image_routing.route("generate", muse_prompt="one", gemini_prompt="one", aspect="4:5",
                                    business_id=self.biz.id, db=self.db)
        self.assertEqual((self.row("image").reserved, self.row("image").committed_microusd), (0, 0))

    def test_trial_end_is_not_advertised_as_a_free_quota_reset(self):
        self.db.delete(self.sub)
        self.db.commit()
        self.assertIsNone(caps.status(self.db, self.user, datetime(2026, 9, 20))["resets_at"])

    def test_future_first_charge_does_not_start_paid_allowance_early(self):
        self.sub.next_billing_time = datetime(2026, 12, 15)
        self.db.commit()
        self.assertEqual(caps.window(self.db, self.user, NOW)[0], "trial")

    def test_ambiguous_empty_muse_response_does_not_fall_back(self):
        with mock.patch.object(muse_image, "generate", side_effect=muse_image.MuseRefused("empty", code="no_image")), \
                mock.patch.object(image_routing, "generate_image") as fallback:
            with self.assertRaises(image_routing.ImageRoutingError):
                image_routing.route("generate", muse_prompt="one", gemini_prompt="one", aspect="4:5",
                                    business_id=self.biz.id, db=self.db)
        fallback.assert_not_called()
        self.assertEqual(self.row("image").reserved, 1)

    def test_read_availability_requires_enough_budget_for_next_call(self):
        caps.settle(self.db, self.reserve("image", kind="image"), state="succeeded", cost_usd=4.995)
        self.assertFalse(caps.status(self.db, self.user, NOW)["images"]["generation_available"])
