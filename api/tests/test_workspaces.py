"""New workspaces keep authenticated onboarding and connected data separate."""
import _test_env  # noqa: F401

import unittest
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import Business, Integration, User
from app.security import create_access_token
from test_discovery_interview import payload


class WorkspacesTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
        Base.metadata.create_all(engine)
        self.session = sessionmaker(bind=engine)
        self.addCleanup(engine.dispose)

        def database():
            with self.session() as db:
                yield db

        app.dependency_overrides[get_db] = database
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        with self.session() as db:
            owner = User(email="owner@test.example", full_name="Test owner")
            other = User(email="foreign@test.example", full_name="Other owner")
            db.add_all([owner, other])
            db.flush()
            first = Business(user_id=owner.id, name="Existing shop", onboarding_complete=1)
            foreign = Business(user_id=other.id, name="Other account")
            db.add_all([first, foreign])
            db.flush()
            db.add(Integration(business_id=first.id, provider="ga4", status="connected", external_id="test-property"))
            db.commit()
            self.first = first.id
            self.foreign = foreign.id
            self.client.headers["Authorization"] = "Bearer " + create_access_token(owner.id)

    def create(self, name, key=None):
        response = self.client.post("/workspaces", json={"name": name, "request_id": str(key or uuid4())})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["workspace"]["id"]

    def scope(self, workspace_id):
        return {"X-Workspace-Id": str(workspace_id)}

    def test_retry_legacy_default_and_separate_onboarding(self):
        key = uuid4()
        second = self.create("New workspace", key)
        self.assertEqual(self.create("New workspace", key), second)
        found = self.client.get("/workspaces").json()
        self.assertEqual(found["active_id"], self.first)
        self.assertEqual([choice["id"] for choice in found["workspaces"]], [self.first, second])
        self.assertFalse(found["workspaces"][0]["scope_required"])
        self.assertTrue(found["workspaces"][1]["scope_required"])
        self.assertEqual(self.client.get("/onboarding/me").json()["business"]["name"], "Existing shop")
        headers = self.scope(second)
        self.assertEqual(self.client.get("/workspaces", headers=headers).json()["active_id"], second)
        draft = {**payload(), "business_name": "New workspace"}
        saved = self.client.post("/onboarding/from-draft", json={"draft": draft}, headers=headers)
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["business"]["id"], second)
        self.assertFalse(saved.json()["business"]["onboarding_complete"])
        self.assertTrue(saved.json()["business"]["owner_context"]["research_journey"])
        self.assertEqual(self.client.get("/onboarding/me").json()["business"]["name"], "Existing shop")
        self.assertTrue(self.client.get("/integrations").json()["integrations"])
        self.assertEqual(self.client.get("/integrations", headers=headers).json()["integrations"], [])
        no_assets = self.client.get("/assets", headers=headers)
        self.assertEqual(no_assets.json()["assets"], [])

    def test_invalid_scope_never_falls_back_to_an_owned_business(self):
        headers = self.scope(self.foreign)
        found = self.client.get("/workspaces", headers=headers).json()
        self.assertIsNone(found["active_id"])
        for path in ("/onboarding/me", "/assets", "/integrations", "/trial", "/strategy/current"):
            response = self.client.get(path, headers=headers)
            self.assertEqual(response.status_code, 404, path)
            self.assertEqual(response.json()["code"], "workspace_not_found")
        response = self.client.post("/onboarding/from-draft", headers=headers, json={"draft": payload()})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(self.client.get("/onboarding/me").json()["business"]["name"], "Existing shop")
        self.assertEqual(self.client.get("/onboarding/me", headers={"X-Workspace-Id": "none"}).status_code, 400)

    def test_trial_is_shared_but_progress_is_separate(self):
        second = self.create("Another workspace")
        first_trial = self.client.get("/trial").json()
        response = self.client.post("/trial/confirm", headers=self.scope(second), json={"what": "gbp"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["started_at"], first_trial["started_at"])
        with self.session() as db:
            self.assertIn("gbp_confirmed_at", db.get(Business, second).workspace_events_json)
            self.assertNotIn("gbp_confirmed_at", db.get(Business, self.first).owner.trial_events_json)
