"""Account creation retains independent session generations and legacy compatibility."""
import _test_env  # noqa: F401

import shutil
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.main import app
from app.models import User
from app.routers.auth import _google_user
from app.security import COOKIE_NAME, create_access_token
from app.services import account_deletion, ratelimit


class SessionCreationTest(unittest.TestCase):
    def setUp(self):
        ratelimit.reset()
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-session-"))
        self.engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, autoflush=False)()
        self.addCleanup(self.cleanup)
        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)

    def cleanup(self):
        app.dependency_overrides.clear()
        ratelimit.reset()
        self.db.close()
        self.engine.dispose()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def prior_account(self):
        user = User(email="prior@example.com", full_name="Prior", password_hash="", session_epoch=0)
        self.db.add(user)
        self.db.commit()
        prior_id = user.id
        token = create_access_token(user.id, user.session_epoch)
        account_deletion.delete_account(self.db, user)
        return prior_id, token

    def assert_prior_session_refused(self, token):
        with TestClient(app) as prior:
            prior.cookies.set(COOKIE_NAME, token)
            self.assertEqual(prior.get("/auth/me").status_code, 401)

    def test_password_signup_has_an_independent_session_generation(self):
        prior_id, prior_token = self.prior_account()
        response = self.client.post("/auth/register", json={"email": "new@example.com", "password": "long-enough-password", "full_name": "New"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["id"], prior_id)
        self.assert_prior_session_refused(prior_token)
        self.assertEqual(self.client.get("/auth/me").status_code, 200)

    def test_google_signup_has_an_independent_session_generation(self):
        prior_id, prior_token = self.prior_account()
        user = _google_user(self.db, {"email": "google@example.com", "sub": "synthetic-sub", "name": "Google"})
        self.assertEqual(user.id, prior_id)
        self.assert_prior_session_refused(prior_token)
        self.client.cookies.set(COOKIE_NAME, create_access_token(user.id, user.session_epoch))
        self.assertEqual(self.client.get("/auth/me").status_code, 200)

    def test_existing_sessions_and_google_linking_preserve_the_generation(self):
        user = User(email="existing@example.com", full_name="Existing", password_hash="", session_epoch=0)
        self.db.add(user)
        self.db.commit()
        self.client.cookies.set(COOKIE_NAME, create_access_token(user.id, user.session_epoch))
        self.assertEqual(self.client.get("/auth/me").status_code, 200)
        linked = _google_user(self.db, {"email": user.email, "sub": "synthetic-existing", "name": "Existing"})
        self.assertEqual(linked.session_epoch, 0)
        self.assertEqual(self.client.get("/auth/me").status_code, 200)
