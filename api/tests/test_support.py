"""Real API gates, durable handoff, and races; no provider calls or customer data."""
import _test_env  # noqa: F401
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.db import Base, get_db
from app.main import app
from app.models import AdminAudit, SupportMessage, SupportTicket, User
from app.security import METHOD_GOOGLE, create_access_token
from app.services import account_deletion, ratelimit, support


class SupportTest(unittest.TestCase):
    def setUp(self):
        ratelimit.reset()
        self.tmp = tempfile.TemporaryDirectory(prefix="isramarket-support-test-")
        self.addCleanup(self.tmp.cleanup)
        self.engine = create_engine(f"sqlite:///{Path(self.tmp.name)/'test.db'}", connect_args={"check_same_thread": False})
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        self.factory = sessionmaker(bind=self.engine, autoflush=False)
        with self.factory() as db:
            for email in ("one@example.com", "two@example.com", "owner@example.com"):
                db.add(User(email=email, full_name="Synthetic", password_hash="", google_sub=email, session_epoch=9))
            db.commit()
        def get_proof_db():
            with self.factory() as db:
                yield db
        app.dependency_overrides[get_db] = get_proof_db
        self.addCleanup(app.dependency_overrides.clear)
        patch = mock.patch.object(support, "schedule")
        self.scheduled = patch.start(); self.addCleanup(patch.stop)
        for name, value in (("admin_emails", "owner@example.com"), ("admin_require_google", True), ("support_ai_enabled", True)):
            patch = mock.patch.object(get_settings(), name, value); patch.start(); self.addCleanup(patch.stop)
        self.client = TestClient(app)

    def headers(self, user=1, method=METHOD_GOOGLE):
        return {"Authorization": "Bearer " + create_access_token(user, 9, method)}

    def report(self, user=1, **extra):
        return self.client.post("/support", headers=self.headers(user), json={"client_ref": str(uuid4()), "body": "איך מאשרים פוסט?", **extra})

    def run_ai(self, ticket_id, *, result=None, side_effect=None):
        result = result or {"outcome": "suggestion", "article": "posts", "answer": "פתחו את הפוסט, בדקו את הטקסט והתמונה ואז אשרו."}
        with mock.patch.object(support.gemini, "generate_json", return_value=json.dumps(result), side_effect=side_effect) as call:
            support.triage(ticket_id, self.factory)
        return call

    def test_auth_and_account_isolation(self):
        self.assertEqual(self.client.get("/support").status_code, 401)
        self.assertEqual(self.client.get("/admin/support", headers=self.headers()).status_code, 403)
        self.assertEqual(self.client.get("/admin/support", headers=self.headers(3, "password")).status_code, 403)
        ticket = self.report().json()
        for method, url, data in (("get", f"/support/{ticket['id']}", None),
                                  ("patch", f"/support/{ticket['id']}", {"status": "resolved"}),
                                  ("post", f"/support/{ticket['id']}/messages", {"body": "test", "client_ref": str(uuid4())})):
            self.assertEqual(self.client.request(method, url, headers=self.headers(2), json=data).status_code, 404)
        self.assertEqual(self.client.get("/support", headers=self.headers(2)).json(), {"tickets": []})
        queue = self.client.get("/admin/support", headers=self.headers(3))
        self.assertEqual(queue.status_code, 200)
        self.assertEqual(len(queue.json()["tickets"]), 1)

    def test_duplicate_create_is_saved_once_and_spends_once(self):
        data = {"client_ref": str(uuid4()), "body": "איך מאשרים פוסט?"}
        first = self.client.post("/support", headers=self.headers(), json=data).json()
        second = self.client.post("/support", headers=self.headers(), json=data).json()
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(len(second["messages"]), 1)
        self.assertEqual(self.scheduled.call_count, 1)
        call = self.run_ai(first["id"])
        with mock.patch.object(support.gemini, "generate_json") as duplicate:
            support.triage(first["id"], self.factory)
        duplicate.assert_not_called()
        self.assertEqual(call.call_args.kwargs["attempts"], 1)
        self.assertEqual(call.call_args.kwargs["timeout_seconds"], 12)
        self.assertEqual(self.client.get(f"/support/{first['id']}", headers=self.headers()).json()["status"], "suggested")

    def test_failure_saved_and_human_opt_out_never_calls_model(self):
        ticket = self.report().json()
        self.run_ai(ticket["id"], side_effect=RuntimeError("provider secret details"))
        result = self.client.get(f"/support/{ticket['id']}", headers=self.headers()).json()
        self.assertEqual(result["ai_status"], "unavailable")
        self.assertEqual(result["status"], "open")
        self.assertEqual(result["messages"][-1]["body"], support.FALLBACK)
        ticket = self.report(human=True).json()
        self.scheduled.assert_called_once()
        with mock.patch.object(support.gemini, "generate_json") as call:
            support.triage(ticket["id"], self.factory)
        call.assert_not_called()

    def test_human_reply_visible_and_audit_has_no_content(self):
        ticket = self.report(human=True).json()
        body = {"client_ref": str(uuid4()), "body": "בדקו את התמונה בפוסט ונסו שוב."}
        url = f"/admin/support/{ticket['id']}/messages"
        self.assertEqual(self.client.post(url, headers=self.headers(3), json=body).status_code, 200)
        self.client.post(url, headers=self.headers(3), json=body)
        result = self.client.get(f"/support/{ticket['id']}", headers=self.headers()).json()
        self.assertEqual(result["status"], "waiting")
        self.assertEqual(len(result["messages"]), 2)
        self.assertEqual(result["messages"][-1]["role"], "support")
        with self.factory() as db:
            self.assertEqual(db.query(AdminAudit).count(), 1)
            self.assertEqual(db.query(AdminAudit).first().details_json, "{}")

    def test_customer_controls_resolution_and_followup_reopens(self):
        ticket = self.report().json(); self.run_ai(ticket["id"])
        url = f"/support/{ticket['id']}"
        self.assertEqual(self.client.patch(url, headers=self.headers(), json={"status": "resolved"}).json()["status"], "resolved")
        result = self.client.post(url + "/messages", headers=self.headers(), json={"client_ref": str(uuid4()), "body": "עדיין לא עובד"}).json()
        self.assertEqual(result["status"], "open")

    def test_late_model_does_not_override_human_response(self):
        ticket = self.report().json()
        def human_first(**kwargs):
            self.client.post(f"/admin/support/{ticket['id']}/messages", headers=self.headers(3), json={"client_ref": str(uuid4()), "body": "אנחנו בודקים את הפנייה."})
            return json.dumps({"outcome": "suggestion", "article": "posts", "answer": "הצעה מאוחרת"})
        self.run_ai(ticket["id"], side_effect=human_first)
        result = self.client.get(f"/support/{ticket['id']}", headers=self.headers()).json()
        self.assertEqual(result["status"], "waiting")
        self.assertEqual(len(result["messages"]), 2)

    def test_model_receives_minimal_redacted_input_and_bad_output_handoffs(self):
        ticket = self.report(body="איך מאשרים? bearer secret-token user@example.com https://site.example/?access_token=private").json()
        call = self.run_ai(ticket["id"], result={"outcome": "suggestion", "article": "made-up", "answer": "ספק שלא קיים"})
        prompt = call.call_args.kwargs["prompt"]
        for forbidden in ("secret-token", "user@example.com", "site.example", "access_token=private"):
            self.assertNotIn(forbidden, prompt)
        result = self.client.get(f"/support/{ticket['id']}", headers=self.headers()).json()
        self.assertEqual(result["status"], "open")

    def test_report_rate_limit_and_validation(self):
        for _ in range(5):
            self.assertEqual(self.report(human=True).status_code, 201)
        self.assertEqual(self.report(human=True).status_code, 429)
        self.assertEqual(self.report(2, body=" ").status_code, 422)
        self.assertEqual(self.report(2, page="/reset/secret?token=private").status_code, 422)

    def test_deletion_removes_support_and_late_worker_cannot_write(self):
        ticket = self.report().json()
        with self.factory() as db:
            account_deletion.delete_account(db, db.get(User, 1))
        self.run_ai(ticket["id"])
        with self.factory() as db:
            self.assertEqual(db.query(SupportTicket).count(), 0)
            self.assertEqual(db.query(SupportMessage).count(), 0)

    def test_restart_interrupted_is_human_handoff_not_retry(self):
        ticket = self.report().json()
        with self.factory() as db:
            db.get(SupportTicket, ticket["id"]).ai_status = "running"; db.commit()
        with mock.patch("app.db.SessionLocal", self.factory):
            support.resume_on_startup()
        self.assertEqual(self.scheduled.call_count, 1)
        result = self.client.get(f"/support/{ticket['id']}", headers=self.headers()).json()
        self.assertEqual(result["ai_status"], "unavailable")
        self.assertEqual(result["status"], "open")
