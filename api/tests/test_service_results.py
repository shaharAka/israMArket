"""Real reporting/recommendation endpoints, isolated SQLite and fake models only."""
import _test_env  # noqa: F401

import shutil
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import AnalysisJob, Business, PerformanceSnapshot, Recommendation, ServiceReport, Strategy, User
from app.routers import recommendations
from app.services import analysis_jobs, diagnostics, recommendation_context, service_results
from app.services.account_deletion import delete_account
from app.services.billing import require_generation_access
from app.services.jsonutil import dumps, loads


PROPOSAL = {"week_summary": "נבדוק למי השירות מתאים", "suggestions": [{"title": "להסביר למי השירות מתאים",
            "action": "לבדוק בתוכנית פוסט שמסביר את היקף השירות.", "action_kind": "plan"}]}


class ServiceResultsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-service-results-"))
        self.engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.factory = sessionmaker(bind=self.engine, autoflush=False)
        self.db = self.factory()
        self.owner = User(email="service@example.test", password_hash="x", full_name="דוגמה")
        self.other = User(email="other@example.test", password_hash="x", full_name="אחר")
        self.db.add_all([self.owner, self.other]); self.db.flush()
        self.business = Business(user_id=self.owner.id, name="עיצוב לדוגמה", business_model="services",
            scraped_profile_json=dumps({"baseline": {"deal_value_ils": "3000-7000", "capacity_more": "1-2"},
                "diagnostics": {"capacity_constraint": "עד שני פרויקטים", "has_portfolio": True}}))
        self.other_business = Business(user_id=self.other.id, name="אחר", business_model="services")
        self.db.add_all([self.business, self.other_business]); self.db.flush()
        self.plan = Strategy(business_id=self.business.id, year=date.today().year, month=date.today().month,
                             roadmap_json=dumps({"roadmap": {"posts": [{"uid": "p1", "title": "סיפור לקוח אמיתי", "caption": "קיים"}]}}))
        self.db.add(self.plan); self.db.commit()
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.owner
        app.dependency_overrides[require_generation_access] = lambda: None
        self.client = TestClient(app)
        self.month = date.today().strftime("%Y-%m")
        self.addCleanup(self.cleanup)

    def cleanup(self):
        analysis_jobs.stop(); app.dependency_overrides.clear()
        self.db.close(); self.engine.dispose(); shutil.rmtree(self.tmp, ignore_errors=True)

    def report(self, **changes):
        return {"month": self.month, "revision": None, "inquiries": 10, "suitable": 3,
                "clients_won": 1, "capacity": 2, "fit_criterion": "שיפוץ דירה קטנה בחיפה", **changes}

    def save(self, **changes):
        response = self.client.put("/performance/service-results", json=self.report(**changes))
        self.assertEqual(response.status_code, 200, response.text)
        self.db.expire_all()
        return response.json()["report"]

    def test_optional_empty_state_without_any_connector(self):
        self.assertEqual(self.client.get("/performance/service-results").json(), {"enabled": True, "report": None})
        self.assertFalse(self.client.get("/performance/latest").json()["available"])

    def test_save_reload_preserves_zero_and_unknown_and_does_not_touch_plan_or_baseline(self):
        before = self.business.scraped_profile_json, self.plan.roadmap_json
        report = self.save(inquiries=0, suitable=0, clients_won=None, capacity=0)
        reread = self.client.get("/performance/service-results").json()["report"]
        self.assertEqual(reread, report)
        self.assertEqual((report["inquiries"], report["suitable"], report["capacity"]), (0, 0, 0))
        self.assertIsNone(report["clients_won"])
        self.assertEqual(report["source"], "owner")
        self.assertEqual(before, (self.business.scraped_profile_json, self.plan.roadmap_json))
        self.assertEqual(self.db.query(Recommendation).count(), 0)
        self.assertEqual(self.db.query(AnalysisJob).count(), 0)

    def test_suitable_inquiries_require_total_and_owner_definition(self):
        for changes in ({"inquiries": None}, {"suitable": 11}, {"fit_criterion": "  "}):
            with self.subTest(changes=changes):
                self.assertEqual(self.client.put("/performance/service-results", json=self.report(**changes)).status_code, 422)
        self.assertEqual(self.db.query(ServiceReport).count(), 0)

    def test_new_clients_can_exceed_this_months_inquiries_without_faking_conversion(self):
        report = self.save(inquiries=1, suitable=1, clients_won=4)
        self.assertEqual(report["clients_won"], 4)
        evidence = service_results.evidence(self.business)
        self.assertNotIn("close_rate", evidence["report"])
        self.assertIn("חודש קודם", " ".join(evidence["limits"]))

    def test_invalid_counts_months_and_extra_identity_are_rejected(self):
        for changes in ({"inquiries": -1}, {"inquiries": True}, {"inquiries": 1.5}, {"inquiries": "10"},
                        {"capacity": 100001}, {"month": "2026-13"}, {"month": "2099-01"},
                        {"business_id": self.other_business.id}, {"fit_criterion": "a" * 301}):
            with self.subTest(changes=changes):
                self.assertEqual(self.client.put("/performance/service-results", json=self.report(**changes)).status_code, 422)
        self.assertEqual(self.client.get("/performance/service-results?month=bad").status_code, 422)

    def test_tenants_cannot_read_or_overwrite_each_others_months(self):
        self.save()
        app.dependency_overrides[get_current_user] = lambda: self.other
        self.assertIsNone(self.client.get("/performance/service-results", params={"month": self.month}).json()["report"])
        self.save(inquiries=100, suitable=99)
        app.dependency_overrides[get_current_user] = lambda: self.owner
        self.assertEqual(self.client.get("/performance/service-results").json()["report"]["inquiries"], 10)
        self.assertEqual(self.db.query(ServiceReport).count(), 2)

    def test_unauthenticated_access_is_refused(self):
        app.dependency_overrides.pop(get_current_user)
        self.assertEqual(self.client.get("/performance/service-results").status_code, 401)
        self.assertEqual(self.client.put("/performance/service-results", json=self.report()).status_code, 401)

    def test_shop_stays_disabled_and_mixed_can_report_services(self):
        self.business.business_model = "products"; self.db.commit()
        self.assertFalse(self.client.get("/performance/service-results").json()["enabled"])
        self.assertEqual(self.client.put("/performance/service-results", json=self.report()).status_code, 409)
        self.business.business_model = "both"; self.db.commit()
        self.save()

    def test_correcting_a_month_requires_its_current_revision(self):
        self.save()
        second = self.save(revision=1, inquiries=20)
        self.assertEqual(second["revision"], 2)
        for revision in (None, 1):
            response = self.client.put("/performance/service-results", json=self.report(revision=revision, inquiries=30))
            self.assertEqual(response.status_code, 409)
        self.assertEqual(self.client.get("/performance/service-results").json()["report"]["inquiries"], 20)
        self.assertEqual(self.db.query(ServiceReport).count(), 1)

    def test_clearing_unknowns_does_not_turn_them_into_zero(self):
        self.save()
        report = self.save(revision=1, inquiries=None, suitable=None, clients_won=None, capacity=None, fit_criterion="")
        self.assertTrue(all(report[key] is None for key in ("inquiries", "suitable", "clients_won", "capacity")))

    def test_historical_correction_does_not_replace_current_month_or_availability(self):
        self.save(capacity=0)
        previous = (date.today().replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
        self.save(month=previous, inquiries=5, suitable=2, capacity=None)
        latest = self.client.get("/performance/service-results").json()["report"]
        self.assertEqual((latest["month"], latest["capacity"]), (self.month, 0))
        self.assertEqual(self.client.get("/performance/service-results", params={"month": previous}).json()["report"]["inquiries"], 5)
        self.assertEqual(self.client.put("/performance/service-results", json=self.report(month=previous, revision=1)).status_code, 422)

    def test_old_capacity_is_not_a_current_planning_constraint(self):
        self.save(capacity=0)
        row = self.db.query(ServiceReport).one()
        row.updated_at = datetime.utcnow() - timedelta(days=8); self.db.commit()
        evidence = service_results.evidence(self.business)
        self.assertIsNone(evidence["report"]["capacity"])
        self.assertTrue(evidence["report"]["capacity_outdated"])
        self.assertEqual(evidence["report"]["suitable"], 3)

    def test_dated_report_does_not_expand_its_observed_window_when_read_later(self):
        self.save()
        row = self.db.query(ServiceReport).one()
        later = service_results.view(row, today=row.updated_at.date() + timedelta(days=3))
        self.assertEqual(later["period"]["end"], row.updated_at.date().isoformat())

    def test_changed_service_planning_inputs_invalidate_existing_advice(self):
        self.save()
        before = service_results.fingerprint(self.business)
        profile = loads(self.business.scraped_profile_json, {})
        profile["baseline"]["deal_value_ils"] = "7000-12000"
        self.business.scraped_profile_json = dumps(profile); self.db.commit()
        self.assertNotEqual(before, service_results.fingerprint(self.business))

    def test_owner_evidence_reaches_recommendation_without_any_provider_or_snapshot(self):
        self.save(capacity=0)
        with mock.patch.object(recommendations, "recommend", return_value=PROPOSAL) as model:
            result = self.client.post("/recommendations/generate")
        self.assertEqual(result.status_code, 200, result.text)
        business_input = model.call_args.args[0]
        evidence = business_input["service_results"]
        self.assertEqual(evidence["report"]["capacity"], 0)
        self.assertEqual(evidence["report"]["fit_criterion"], "שיפוץ דירה קטנה בחיפה")
        self.assertEqual(evidence["planning_inputs"]["deal_value_ils"], "3000-7000")
        basis = result.json()["suggestions"]["basis"]
        owner = [item for item in basis["observations"] if item["source"] == "service_owner"]
        self.assertEqual([item["value"] for item in owner], [10, 3, 1])
        self.assertEqual([item["source"] for item in owner], ["service_owner"] * 3)
        source = next(item for item in basis["sources"] if item["key"] == "service_owner")
        self.assertEqual(source["status"], "available")
        self.assertFalse(source["stale"])
        self.assertIsNone(basis["snapshot_id"])
        self.assertEqual(model.call_args.args[-2:], ({}, {}))

    def test_report_correction_marks_existing_proposal_as_stale_without_editing_plan(self):
        self.save()
        with mock.patch.object(recommendations, "recommend", return_value=PROPOSAL):
            self.client.post("/recommendations/generate")
        self.save(revision=1, capacity=0)
        result = self.client.get("/recommendations/latest").json()["suggestions"]
        self.assertEqual(result["suggestions"][0]["review"]["status"], "stale")
        self.assertIn("הדיווח", result["suggestions"][0]["review"]["note_he"])
        self.assertTrue(next(item for item in result["basis"]["sources"] if item["key"] == "service_owner")["stale"])
        self.assertEqual(loads(self.plan.roadmap_json, {})["roadmap"]["posts"][0]["caption"], "קיים")

    def test_background_analysis_uses_owner_facts_and_does_not_rebind_after_midflight_change(self):
        self.save(capacity=0)
        snap = PerformanceSnapshot(business_id=self.business.id, period_start=f"{self.month}-01", period_end=date.today().isoformat(),
            ga4_json="{}", meta_json="{}", diagnostic_json=dumps({"analysis_status": "pending"}))
        self.db.add(snap); self.db.commit()
        analysis_jobs.enqueue(self.db, snap)
        def change_report(*args):
            with self.factory() as db:
                row = db.query(ServiceReport).one(); row.capacity = 2; row.revision += 1; db.commit()
            return PROPOSAL
        with mock.patch.object(diagnostics, "diagnose", return_value={"headline": "בדיקה"}) as diagnose, \
             mock.patch.object(diagnostics, "recommend", side_effect=change_report):
            self.assertTrue(analysis_jobs.run_next(self.factory))
        self.assertEqual(diagnose.call_args.args[0]["service_results"]["report"]["capacity"], 0)
        self.db.expire_all()
        self.assertEqual(self.db.query(AnalysisJob).one().status, "superseded")
        self.assertEqual(self.db.query(Recommendation).count(), 0)

    def test_deleting_one_account_removes_its_reports_and_preserves_another(self):
        self.save()
        app.dependency_overrides[get_current_user] = lambda: self.other
        self.save()
        other_id = self.other_business.id
        with mock.patch("app.services.account_deletion.images.media_root", return_value=self.tmp / "media"):
            delete_account(self.db, self.owner)
        reports = self.db.query(ServiceReport).all()
        self.assertEqual([row.business_id for row in reports], [other_id])


if __name__ == "__main__":
    unittest.main()
