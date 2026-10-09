"""Connection → persisted source → automatic finding, without another browser action.

Temporary SQLite and fake provider/model replies; nothing calls a live service.
"""
import _test_env  # noqa: F401

import os
import shutil
import tempfile
import threading
import time
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path
from unittest import mock

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import AnalysisJob, Business, GenerationJob, Integration, PerformanceSnapshot, Recommendation, Strategy, User
from app.security import encrypt_secret
from app.services import analysis_jobs as jobs, diagnostics, ga4, ga4_readiness, meta_readiness
from app.services.jsonutil import dumps, loads


DIAG = {"headline": "נקראו 42 כניסות לאתר; עוד אין מדידה של פניות.", "top_content": [],
        "bottom_content": [], "funnel_issues": [], "metric_highlights": []}
PROPOSAL = {"week_summary": "נבדוק הצעה פשוטה בפוסט הקרוב", "suggestions": [{
    "title": "להבהיר איך קובעים פגישה", "action": "להוסיף בפוסט הזמנה לפגישה קצרה.",
    "action_kind": "post", "post_uid": "p1", "priority": "medium", "hypothesis": "ייתכן שההזמנה אינה ברורה.",
    "success_check": "לבדוק כניסות מהפוסט בשבוע הבא.", "evidence": "יש כניסות; פניות אינן נמדדות."}]}


class AutomaticAnalysisTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-auto-analysis-"))
        self.engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.factory = sessionmaker(bind=self.engine, autoflush=False)
        self.db = self.factory()
        key = mock.patch.object(get_settings(), "token_encryption_key", Fernet.generate_key().decode())
        key.start(); self.addCleanup(key.stop)
        self.addCleanup(self.cleanup)
        self.user = User(email="owner@example.com", full_name="דוגמה", password_hash="x")
        self.db.add(self.user); self.db.flush()
        self.business = Business(user_id=self.user.id, name="עסק לדוגמה", business_model="services")
        self.db.add(self.business); self.db.flush()
        self.item = Integration(business_id=self.business.id, provider="ga4", status="connected", external_id="123",
                                access_token_enc=encrypt_secret("fake-access"), refresh_token_enc=encrypt_secret("fake-refresh"))
        self.plan = Strategy(business_id=self.business.id, year=date.today().year, month=date.today().month,
                             roadmap_json=dumps({"roadmap": {"posts": [{"uid": "p1", "title": "פגישה ראשונה", "caption": "ניפגש", "cta": "לקבוע"}]}}))
        self.db.add_all([self.item, self.plan]); self.db.commit()
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)
        self.diag = mock.patch.object(diagnostics, "diagnose", return_value=DIAG.copy()).start()
        self.rec = mock.patch.object(diagnostics, "recommend", return_value=PROPOSAL.copy()).start()
        self.addCleanup(mock.patch.stopall)

    def cleanup(self):
        jobs.stop()
        app.dependency_overrides.clear()
        self.db.close(); self.engine.dispose(); shutil.rmtree(self.tmp, ignore_errors=True)

    def read(self):
        end = date.today() - timedelta(days=1)
        report = {"property_id": "123", "overview": {"sessions": "42", "conversions": "0"},
                  "period": {"start": (end - timedelta(days=27)).isoformat(), "end": end.isoformat()}}
        with mock.patch.object(ga4, "fetch_report", return_value=report):
            result = self.client.post("/integrations/ga4/read")
        self.assertEqual(result.status_code, 200, result.text)
        return self.db.query(PerformanceSnapshot).order_by(PerformanceSnapshot.id.desc()).first()

    def test_connection_queues_one_finding_and_reviewable_action_without_another_read(self):
        snap = self.read()
        jobs.enqueue(self.db, snap)
        self.assertEqual(self.db.query(AnalysisJob).count(), 1)
        self.diag.assert_not_called()  # the connection does not wait for AI
        with mock.patch.object(ga4, "fetch_report", side_effect=AssertionError("Do not read again")):
            self.assertTrue(jobs.run_next(self.factory))
            self.assertFalse(jobs.run_next(self.factory))
        self.db.expire_all()
        data = self.client.get("/performance/latest").json()
        rec = self.client.get("/recommendations/latest").json()
        self.assertEqual(data["diagnostic"]["analysis_status"], "ready")
        self.assertEqual(data["ga4"]["overview"]["sessions"], "42")
        self.assertEqual(rec["suggestions"]["basis"]["snapshot_id"], snap.id)
        self.assertIn("/posts?", rec["suggestions"]["suggestions"][0]["review"]["href"])
        self.assertEqual(loads(self.plan.roadmap_json, {})["roadmap"]["posts"][0]["caption"], "ניפגש")
        self.diag.assert_called_once(); self.rec.assert_called_once()

    def test_real_worker_finishes_with_no_open_client_and_leaves_post_generation_alone(self):
        month = GenerationJob(business_id=self.business.id, kind="posts", status="running")
        self.db.add(month); self.db.commit()
        snap = self.read()
        with mock.patch.dict(os.environ, {"ANALYSIS_JOBS_ENABLED": "true"}):
            jobs.start(self.factory)
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                self.db.expire_all()
                if self.db.query(AnalysisJob).first().status == "done":
                    break
                time.sleep(.03)
            self.assertEqual(self.db.query(AnalysisJob).first().status, "done")
        jobs.stop()
        self.assertEqual(self.db.get(GenerationJob, month.id).status, "running")
        self.assertEqual(self.db.query(Recommendation).count(), 1)

    def test_only_one_worker_can_claim_a_snapshot(self):
        self.read()
        started, release = threading.Event(), threading.Event()
        def slow(*args):
            started.set(); release.wait(3); return DIAG.copy()
        self.diag.side_effect = slow
        worker = threading.Thread(target=jobs.run_next, args=(self.factory,))
        worker.start()
        self.assertTrue(started.wait(2))
        self.assertFalse(jobs.run_next(self.factory))
        release.set(); worker.join(3)
        self.assertFalse(worker.is_alive())
        self.db.expire_all()
        self.assertEqual(self.db.query(Recommendation).count(), 1)

    def test_expired_lease_resumes_and_old_worker_cannot_save(self):
        self.read()
        old_id, old_token = jobs._claim(self.factory)
        job = self.db.get(AnalysisJob, old_id)
        job.lease_until = datetime.utcnow() - timedelta(seconds=1); self.db.commit()
        jobs.run_next(self.factory)
        jobs._execute(self.factory, old_id, old_token)
        self.db.expire_all()
        self.assertEqual(self.db.query(Recommendation).count(), 1)
        self.assertEqual(job.status, "done")

    def test_startup_backfills_only_latest_pending_read_and_never_duplicates(self):
        snap = self.read()
        self.db.query(AnalysisJob).delete(); self.db.commit()
        with mock.patch("app.db.SessionLocal", self.factory), mock.patch.object(jobs, "start"):
            jobs.resume_on_startup(); jobs.resume_on_startup()
        self.assertEqual(self.db.query(AnalysisJob).count(), 1)
        self.assertEqual(self.db.query(AnalysisJob).first().snapshot_id, snap.id)
        jobs.run_next(self.factory)
        with mock.patch("app.db.SessionLocal", self.factory), mock.patch.object(jobs, "start"):
            jobs.resume_on_startup()
        self.assertFalse(jobs.run_next(self.factory))

    def test_transient_recommendation_failure_reuses_diagnosis_and_retries_automatically(self):
        snap = self.read()
        self.rec.side_effect = [RuntimeError("private model text"), PROPOSAL.copy()]
        jobs.run_next(self.factory)
        self.db.expire_all()
        job = self.db.query(AnalysisJob).first()
        self.assertEqual(job.status, "pending")
        self.assertEqual(loads(snap.ga4_json, {})["overview"]["sessions"], "42")
        job.available_at = datetime.utcnow(); self.db.commit()
        jobs.run_next(self.factory)
        self.db.expire_all()
        self.assertEqual(job.status, "done")
        self.diag.assert_called_once(); self.assertEqual(self.rec.call_count, 2)

    def test_permanent_failure_is_bounded_and_never_loses_numbers(self):
        snap = self.read()
        self.diag.side_effect = RuntimeError("private model text")
        for _ in range(2):
            jobs.run_next(self.factory)
            self.db.expire_all()
            job = self.db.query(AnalysisJob).first()
            job.available_at = datetime.utcnow(); self.db.commit()
        self.assertFalse(jobs.run_next(self.factory))
        self.assertEqual(job.status, "unavailable")
        self.assertEqual(loads(snap.ga4_json, {})["overview"]["sessions"], "42")
        self.assertNotIn("private", snap.diagnostic_json)

    def test_account_or_newer_snapshot_wins_over_inflight_analysis(self):
        for change in ("property", "grant", "disconnect", "newer_snapshot", "outcome"):
            with self.subTest(change=change):
                self.read()
                def changed(*args):
                    with self.factory() as db:
                        item = db.get(Integration, self.item.id)
                        if change == "property": item.external_id = "456"
                        elif change == "grant": item.access_token_enc = encrypt_secret("new-grant")
                        elif change == "disconnect": item.status = "disconnected"
                        elif change == "outcome":
                            business = db.get(Business, self.business.id)
                            business.scraped_profile_json = dumps({"owner_context": {"research_journey": {"segment": "software", "metric": "paid_accounts"}}})
                        else:
                            db.add(PerformanceSnapshot(business_id=self.business.id, period_start="", period_end=""))
                        db.commit()
                    return DIAG.copy()
                self.diag.side_effect = changed
                jobs.run_next(self.factory)
                self.db.expire_all()
                self.assertEqual(self.db.query(Recommendation).count(), 0)
                old = self.db.query(PerformanceSnapshot).filter(PerformanceSnapshot.diagnostic_json != "").order_by(PerformanceSnapshot.id.desc()).first()
                self.assertEqual(loads(old.diagnostic_json, {})["analysis_status"], "superseded")
                self.item.external_id = "123"; self.item.status = "connected"; self.db.commit()
        self.rec.assert_not_called()

    def test_account_deletion_cannot_resurrect_a_result(self):
        self.read()
        def delete(*args):
            from app.models import purge_business_rows
            with self.engine.begin() as conn:
                purge_business_rows(conn, [self.business.id])
            return DIAG.copy()
        self.diag.side_effect = delete
        jobs.run_next(self.factory)
        self.assertEqual(self.db.query(AnalysisJob).count(), 0)
        self.assertEqual(self.db.query(Recommendation).count(), 0)

    def test_paid_generation_gate_applies_to_the_automatic_worker(self):
        snap = self.read()
        with mock.patch.object(jobs.billing, "locked", return_value=True):
            jobs.run_next(self.factory)
        self.db.expire_all()
        self.assertEqual(loads(snap.diagnostic_json, {})["analysis_status"], "paused")
        self.diag.assert_not_called(); self.rec.assert_not_called()

    def test_meta_first_read_queues_the_same_automatic_pipeline(self):
        item = Integration(business_id=self.business.id, provider="meta", status="connected", external_id="page-1",
                           access_token_enc=encrypt_secret("fake-meta"), extra_json=dumps({"selected_page_id": "page-1"}))
        self.db.add(item); self.db.commit()
        report = {"page": {"name": "עסק לדוגמה", "fan_count": 4}, "source_read_at": datetime.utcnow().isoformat(),
                  "source_selection": meta_readiness.selection(item), "source_reads": {}, "posts": []}
        with mock.patch.object(meta_readiness, "read", return_value=report), \
                mock.patch.object(meta_readiness, "public_state", return_value={"sections": {"social": {"status": "ready"}}}):
            meta_readiness.initial_read(self.db, item, "")
        self.assertEqual(self.db.query(AnalysisJob).count(), 1)

    def test_plan_edit_during_analysis_retries_against_new_plan(self):
        self.read()
        def edit(*args):
            with self.factory() as db:
                business = db.get(Business, self.business.id)
                business.scraped_profile_json = dumps({"plan_revision": 1})
                db.commit()
            return PROPOSAL.copy()
        self.rec.side_effect = edit
        jobs.run_next(self.factory)
        self.db.expire_all()
        job = self.db.query(AnalysisJob).first()
        self.assertEqual(job.status, "pending")
        self.assertEqual(self.db.query(Recommendation).count(), 0)
        self.rec.side_effect = None
        job.available_at = datetime.utcnow(); self.db.commit()
        jobs.run_next(self.factory)
        self.db.expire_all()
        rec = self.db.query(Recommendation).first()
        self.assertEqual(loads(rec.suggestions_json, {})["basis"]["plan_revision"], 1)

    def test_empty_provider_response_does_not_queue_fake_analysis(self):
        with mock.patch.object(ga4, "fetch_report", return_value={"property_id": "123", "overview": {}}):
            ga4_readiness.initial_read(self.db, self.item)
        self.assertEqual(self.db.query(AnalysisJob).count(), 0)
        self.diag.assert_not_called()

    def test_first_connection_details_reach_diagnosis_and_plan_action_without_manual_refresh(self):
        end = date.today() - timedelta(days=1)
        details = {"property_id": "123", "overview": {"sessions": "42", "conversions": "4"},
                   "period": {"start": (end - timedelta(days=27)).isoformat(), "end": end.isoformat()},
                   "channels": [{"sessionSourceMedium": "instagram / social", "sessions": "21"}],
                   "landing_pages": [{"landingPagePlusQueryString": "/book", "sessions": "21"}],
                   "campaigns": [{"sessionManualAdContent": "p1", "sessions": "21"}],
                   "events": [{"eventName": "generate_lead", "eventCount": "4"}],
                   "report_reads": {"events": {"status": "available", "limit": 30, "limited": False}}}
        with mock.patch.object(ga4, "fetch_report", return_value=details) as read:
            response = self.client.post("/integrations/ga4/read")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(read.call_args.kwargs.get("overview_only", False))
        self.assertTrue(jobs.run_next(self.factory))
        for key in ("channels", "landing_pages", "campaigns", "events", "report_reads"):
            self.assertEqual(self.diag.call_args.args[1][key], details[key])
            self.assertEqual(self.rec.call_args.args[3][key], details[key])
        self.assertIn('/posts?', self.client.get('/recommendations/latest').json()['suggestions']['suggestions'][0]['review']['href'])
