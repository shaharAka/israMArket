"""Results asks for the saved plan's sources, without provider calls or invented counts."""
import _test_env  # noqa: F401

import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Business, Integration, PerformanceSnapshot, User
from app.services.jsonutil import dumps
from _verified_connection import verified_connection


class MeasurementSetupTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-measurement-"))
        self.engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, autoflush=False)()
        self.addCleanup(self.cleanup)
        self.owner = User(email="owner@example.com", password_hash="x", full_name="דוגמה")
        self.db.add(self.owner)
        self.db.flush()
        self.business = Business(user_id=self.owner.id, name="עסק לדוגמה")
        self.db.add(self.business)
        self.db.commit()
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.owner
        self.client = TestClient(app)

    def cleanup(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def plan(self, keys, **stored):
        self.business.scraped_profile_json = dumps({**stored, "quarter_plan": {"integrations": [{"key": key} for key in keys]}})
        self.db.commit()

    def connection(self, provider, *, selected=True, verified=False):
        item = Integration(business_id=self.business.id, provider=provider,
                           status="connected" if selected else "select_property",
                           external_id="synthetic-selection" if selected else "",
                           access_token_enc="synthetic-unused-grant")
        self.db.add(item)
        self.db.flush()
        if verified:
            verified_connection(item)
        self.db.commit()
        return item

    def latest(self):
        with patch("app.services.ga4.fetch_report", side_effect=AssertionError("No provider read")), \
                patch("app.services.meta_readiness.fetch", side_effect=AssertionError("No provider read")):
            response = self.client.get("/performance/latest")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_whatsapp_only_plan_does_not_request_site_or_instagram(self):
        self.plan(["whatsapp_link"])
        result = self.latest()
        self.assertFalse(result["available"])
        self.assertFalse(result["measurement_setup"]["can_refresh"])
        requirements = result["measurement_setup"]["requirements"]
        self.assertEqual([row["key"] for row in requirements], ["whatsapp"])
        self.assertEqual(requirements[0]["status"], "todo")
        self.assertEqual(requirements[0]["action_href"], "/integrations#whatsapp")
        self.assertEqual(result["ga4"], {})
        self.assertEqual(result["meta"], {})

    def test_current_plan_overrides_old_checklist_even_when_empty(self):
        for keys in ([], ["ga4"]):
            with self.subTest(keys=keys):
                self.plan(keys, integrations_checklist=[{"key": "instagram_insights"}])
                self.assertEqual([row["key"] for row in self.latest()["measurement_setup"]["requirements"]], keys)

    def test_grant_without_selection_cannot_refresh(self):
        self.plan(["ga4"])
        self.connection("ga4", selected=False)
        setup = self.latest()["measurement_setup"]
        self.assertFalse(setup["can_refresh"])
        self.assertEqual(setup["requirements"][0]["status"], "todo")

    def test_selected_grant_can_refresh_but_is_not_verified_measurement(self):
        self.plan(["ga4"])
        self.connection("ga4")
        setup = self.latest()["measurement_setup"]
        self.assertTrue(setup["can_refresh"])
        self.assertEqual(setup["requirements"][0]["status"], "todo")
        self.assertEqual(self.db.query(PerformanceSnapshot).count(), 0)

    def test_verified_ads_only_plan_does_not_require_instagram(self):
        self.plan(["meta_business"])
        self.connection("meta", verified=True)
        setup = self.latest()["measurement_setup"]
        self.assertTrue(setup["can_refresh"])
        self.assertEqual([(row["key"], row["title"], row["status"]) for row in setup["requirements"]],
                         [("meta", "נתוני הפרסום", "done")])

    def test_facebook_requires_its_own_read_before_counting_as_connected(self):
        self.plan(["facebook_insights"])
        setup = self.latest()["measurement_setup"]
        self.assertEqual(setup["requirements"][0]["status"], "todo")
        self.assertFalse(setup["can_refresh"])

    def test_saved_snapshot_keeps_current_plan_requirements_and_numbers(self):
        self.plan(["ga4"])
        self.connection("ga4", verified=True)
        self.db.add(PerformanceSnapshot(business_id=self.business.id, period_start="2026-09-01", period_end="2026-09-28",
                                       ga4_json=dumps({"overview": {"sessions": "42"}})))
        self.db.commit()
        self.plan(["whatsapp_link"])
        self.business.whatsapp_number_e164 = "+972500000000"
        self.db.commit()
        result = self.latest()
        self.assertTrue(result["available"])
        self.assertEqual(result["ga4"]["overview"]["sessions"], "42")
        self.assertEqual([(row["key"], row["status"]) for row in result["measurement_setup"]["requirements"]],
                         [("whatsapp", "done")])
