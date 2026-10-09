"""First reads, ownership and recovery. Temporary SQLite; no provider or model calls."""
import _test_env  # noqa: F401

import shutil
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import httpx
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from google.api_core.exceptions import PermissionDenied
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Business, Integration, PerformanceSnapshot, User
from app.routers import performance
from app.security import encrypt_secret
from app.services import ga4, ga4_readiness
from app.services.jsonutil import dumps


def report(property_id="123", overview=None):
    end = date.today() - timedelta(days=1)
    return {"property_id": property_id, "period": {"start": (end - timedelta(days=27)).isoformat(),
            "end": end.isoformat()}, "overview": {"sessions": "42", "conversions": "0"} if overview is None else overview}


class SourceReadinessTest(unittest.TestCase):
    def setUp(self):
        key = mock.patch.object(get_settings(), "token_encryption_key", Fernet.generate_key().decode())
        key.start()
        self.addCleanup(key.stop)
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-source-"))
        self.engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, autoflush=False)()
        self.addCleanup(self.cleanup)
        self.owner = User(email="owner@example.com", password_hash="x", full_name="Owner")
        self.other = User(email="other@example.com", password_hash="x", full_name="Other")
        self.db.add_all([self.owner, self.other])
        self.db.flush()
        self.business = Business(user_id=self.owner.id, name="עסק לדוגמה")
        self.other_business = Business(user_id=self.other.id, name="עסק אחר")
        self.db.add_all([self.business, self.other_business])
        self.db.commit()
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.owner
        self.client = TestClient(app)

    def cleanup(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def connect(self, property_id="123", business=None, **extra):
        item = Integration(business_id=(business or self.business).id, provider="ga4",
                           status="connected" if property_id else "select_property", external_id=property_id,
                           access_token_enc=encrypt_secret("test-access"), refresh_token_enc=encrypt_secret("test-refresh"),
                           extra_json=dumps(extra))
        self.db.add(item)
        self.db.commit()
        return item

    def snapshot(self, business=None):
        snap = PerformanceSnapshot(business_id=(business or self.business).id, period_start="2026-08-01",
                                   period_end="2026-08-28", ga4_json=dumps(report()),
                                   meta_json=dumps({"page": {"name": "דף קודם"}}), diagnostic_json=dumps({"headline": "קודם"}))
        self.db.add(snap)
        self.db.commit()
        return snap

    def test_legacy_grant_does_not_claim_a_successful_read(self):
        self.connect()
        item = self.client.get("/integrations").json()["integrations"][0]
        self.assertTrue(item["connected"])
        self.assertEqual(item["source_readiness"]["status"], "unchecked")

    def test_empty_property_list_is_permission_without_site_selection(self):
        self.connect("", properties=[])
        item = self.client.get("/integrations").json()["integrations"][0]
        self.assertFalse(item["connected"])
        self.assertEqual(item["source_readiness"]["status"], "no_properties")

    def test_interrupted_read_can_be_retried_instead_of_staying_busy_forever(self):
        item = self.connect(source_readiness={"property_id": "123", "status": "reading",
                            "started_at": (datetime.utcnow() - timedelta(minutes=3)).isoformat()})
        self.assertEqual(ga4_readiness.public_state(item)["status"], "unavailable")

    def test_malformed_report_is_not_saved_as_customer_data(self):
        self.connect()
        for value in ({"property_id": "123", "overview": "not rows"}, report(property_id="999")):
            with mock.patch.object(ga4, "fetch_report", return_value=value):
                response = self.client.post("/integrations/ga4/read")
            self.assertEqual(response.json()["integration"]["source_readiness"]["status"], "unavailable")
        self.assertEqual(self.db.query(PerformanceSnapshot).count(), 0)

    def test_valid_selection_uses_current_grant_and_persists_real_numbers_without_ai(self):
        self.connect("", properties=[{"property_id": "999"}])
        props = [{"property_id": "123", "display_name": "החנות", "account": "העסק"}]
        with mock.patch.object(ga4, "list_properties", return_value=props) as listed, \
                mock.patch.object(ga4, "fetch_report", return_value=report()) as read, \
                mock.patch.object(performance, "diagnose", side_effect=AssertionError("No AI prerequisite")) as diagnose:
            response = self.client.post("/integrations/ga4/property", json={"property_id": "123", "display_name": "untrusted name"})
        self.assertEqual(response.status_code, 200, response.text)
        item = response.json()["integration"]
        self.assertEqual(item["display_name"], "החנות (העסק)")
        self.assertEqual(item["source_readiness"]["status"], "ready")
        self.assertIn("last_success_at", item["source_readiness"])
        self.assertFalse(read.call_args.kwargs.get("overview_only", False))
        listed.assert_called_once()
        diagnose.assert_not_called()
        latest = self.client.get("/performance/latest").json()
        self.assertEqual(latest["ga4"]["overview"]["sessions"], "42")
        self.assertEqual(latest["diagnostic"]["analysis_status"], "pending")
        start, end = latest["period_start"], latest["period_end"]
        self.assertEqual((date.fromisoformat(end) - date.fromisoformat(start)).days, 27)
        self.assertEqual(date.fromisoformat(end), date.today() - timedelta(days=1))

    def test_stale_or_foreign_selection_cannot_overwrite_existing_site(self):
        item = self.connect(properties=[{"property_id": "999"}])
        with mock.patch.object(ga4, "list_properties", return_value=[{"property_id": "123"}]), \
                mock.patch.object(ga4, "fetch_report") as read:
            response = self.client.post("/integrations/ga4/property", json={"property_id": "999"})
        self.assertEqual(response.status_code, 400)
        self.db.refresh(item)
        self.assertEqual(item.external_id, "123")
        read.assert_not_called()

    def test_property_id_is_not_a_path_or_query(self):
        self.connect()
        for value in ("properties/123", "123?secret=x", "../123"):
            with self.subTest(value=value):
                self.assertEqual(self.client.post("/integrations/ga4/property", json={"property_id": value}).status_code, 422)

    def test_no_rows_is_normal_and_does_not_complete_a_numeric_baseline(self):
        self.connect()
        with mock.patch.object(ga4, "fetch_report", return_value=report(overview={})):
            response = self.client.post("/integrations/ga4/read")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["integration"]["source_readiness"]["status"], "empty")
        latest = self.client.get("/performance/latest").json()
        self.assertFalse(latest["available"])
        self.assertEqual(latest["ga4"], {})
        self.assertEqual(self.db.query(PerformanceSnapshot).count(), 0)

    def test_measured_zero_is_retained_as_a_real_observation(self):
        self.connect()
        with mock.patch.object(ga4, "fetch_report", return_value=report(overview={"sessions": "0", "conversions": "0"})):
            self.client.post("/integrations/ga4/read")
        latest = self.client.get("/performance/latest").json()
        self.assertTrue(latest["available"])
        self.assertEqual(latest["ga4"]["overview"]["sessions"], "0")
        self.assertEqual(latest["sources"]["ga4"]["status"], "empty")

    def test_failed_retry_keeps_prior_observations_and_does_not_expose_provider_text(self):
        item = self.connect()
        original = self.snapshot()
        ga4_readiness.record(self.db, item, "ready", report=report())
        prior_success = ga4_readiness.public_state(item)["last_success_at"]
        for error, expected in ((TimeoutError("secret-provider-token"), "unavailable"),
                                (PermissionDenied("secret-provider-token"), "reconnect")):
            with self.subTest(state=expected), mock.patch.object(ga4, "fetch_report", side_effect=error):
                response = self.client.post("/integrations/ga4/read")
                self.assertEqual(response.status_code, 200)
                self.assertNotIn("secret-provider-token", response.text)
                state = response.json()["integration"]["source_readiness"]
                self.assertEqual(state["status"], expected)
                self.assertEqual(state["last_success_at"], prior_success)
                latest = self.client.get("/performance/latest").json()
                self.assertEqual(latest["id"], original.id)
                self.assertEqual(latest["ga4"]["overview"]["sessions"], "42")

    def test_retry_never_uses_another_customers_grant(self):
        self.connect(business=self.other_business)
        self.snapshot(self.other_business)
        with mock.patch.object(ga4, "fetch_report") as read:
            self.assertEqual(self.client.post("/integrations/ga4/read").status_code, 400)
        read.assert_not_called()
        self.assertFalse(self.client.get("/performance/latest").json()["available"])

    def test_results_refresh_failure_updates_source_state_and_preserves_last_snapshot(self):
        self.connect()
        prior = self.snapshot()
        with mock.patch.object(ga4, "fetch_report", side_effect=PermissionDenied("private-provider-token")):
            response = self.client.post("/performance/sync")
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("private-provider-token", response.text)
        latest = self.client.get("/performance/latest").json()
        self.assertEqual(latest["id"], prior.id)
        self.assertEqual(latest["sources"]["ga4"]["status"], "reconnect")

    def test_newer_site_selection_is_not_overwritten_by_old_read(self):
        item = self.connect()
        def change_selection(*args, **kwargs):
            item.external_id = "456"
            self.db.commit()
            return report()
        with mock.patch.object(ga4, "fetch_report", side_effect=change_selection):
            response = self.client.post("/integrations/ga4/read")
        self.assertEqual(response.json()["integration"]["external_id"], "456")
        self.assertEqual(response.json()["integration"]["source_readiness"]["status"], "unchecked")
        self.assertEqual(self.db.query(PerformanceSnapshot).count(), 0)

    def test_initial_read_preserves_meta_with_its_own_date_and_window(self):
        self.connect()
        prior = self.snapshot()
        with mock.patch.object(ga4, "fetch_report", return_value=report()):
            self.client.post("/integrations/ga4/read")
        latest = self.client.get("/performance/latest").json()
        self.assertEqual(latest["meta"]["source_read_at"], prior.created_at.isoformat())
        self.assertEqual(latest["meta"]["source_period"], {"start": "2026-08-01", "end": "2026-08-28"})
        self.assertEqual(latest["meta"]["page"]["name"], "דף קודם")

    def test_model_failure_keeps_new_source_observations_available(self):
        self.connect()
        with mock.patch.object(ga4, "fetch_report", return_value=report()), \
                mock.patch.object(performance, "diagnose", side_effect=RuntimeError("model unavailable")):
            response = self.client.post("/performance/sync")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["diagnostic"]["analysis_status"], "unavailable")
        latest = self.client.get("/performance/latest").json()
        self.assertEqual(latest["ga4"]["overview"]["sessions"], "42")
        self.assertEqual(latest["sources"]["ga4"]["status"], "ready")


class PropertyListingTest(unittest.TestCase):
    def test_current_grant_lists_all_pages_and_empty_is_normal(self):
        def response(payload, status=200):
            return httpx.Response(status, json=payload, request=httpx.Request("GET", "https://analyticsadmin.googleapis.com"))
        pages = [response({"accountSummaries": [], "nextPageToken": "second"}), response({"accountSummaries": [
            {"displayName": "Owner", "propertySummaries": [{"property": "properties/456", "displayName": "Site"}]}]})]
        with mock.patch.object(ga4, "_credentials", return_value=SimpleNamespace(token="test")), \
                mock.patch.object(ga4.httpx, "get", side_effect=pages) as get:
            properties = ga4.list_properties("", "", None)
        self.assertEqual(properties, [{"property_id": "456", "display_name": "Site", "account": "Owner"}])
        self.assertEqual(get.call_args.kwargs["params"], {"pageToken": "second"})
        with mock.patch.object(ga4, "_credentials", return_value=SimpleNamespace(token="test")), \
                mock.patch.object(ga4.httpx, "get", return_value=response({"accountSummaries": []})):
            self.assertEqual(ga4.list_properties("", "", None), [])

    def test_repeated_page_token_is_bounded_and_permission_errors_are_sanitized(self):
        with mock.patch.object(ga4, "_credentials", return_value=SimpleNamespace(token="test")):
            repeated = httpx.Response(200, json={"nextPageToken": "repeat"})
            with mock.patch.object(ga4.httpx, "get", return_value=repeated) as get:
                with self.assertRaises(ga4.Ga4AccessError):
                    ga4.list_properties("", "", None)
                self.assertEqual(get.call_count, 2)
            for status, expected in ((403, "reconnect"), (503, "unavailable")):
                with mock.patch.object(ga4.httpx, "get", return_value=httpx.Response(status, text="private provider error")):
                    with self.assertRaises(ga4.Ga4AccessError) as raised:
                        ga4.list_properties("", "", None)
                    self.assertEqual(raised.exception.readiness_status, expected)
                    self.assertNotIn("private", str(raised.exception))
