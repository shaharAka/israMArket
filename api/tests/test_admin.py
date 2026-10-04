"""The backoffice (routers/admin.py) and everything it changes about the rest of the API.

Hermetic: a throwaway SQLite file, a temporary media root, the real cookie sessions, and
no network (Google's token endpoint and signature check are replaced, like
tests/test_google_login.py; PayPal is "configured" through patched settings only).

Covers: the 401/403 gate and the Google requirement; suspension on password sign-in,
Google sign-in, existing sessions and the API, and reactivation; one-time reset links
(single use, expiry, hash-only storage, older links revoked, sessions revoked, rate
limit); an audit entry for every action; deletion through the existing pipeline;
`billing_exempt`; `last_seen_at` throttling; no secrets or customer content in responses;
the derived stage, connections and costs; and the model-usage log.
"""
import _test_env  # noqa: F401  (must come before any `app` import)

import hashlib
import json
import logging
import shutil
import tempfile
import time
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest import mock
from urllib.parse import parse_qs, urlsplit

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect, select, text
from sqlalchemy.orm import sessionmaker

from app.config import Settings, get_settings
from app.db import Base, get_db
from app.deps import LAST_SEEN_EVERY
from app.main import app
from app.models import (
    AdminAudit,
    Business,
    ImageUsage,
    Integration,
    ModelUsage,
    PasswordResetToken,
    Strategy,
    User,
)
from app.security import COOKIE_NAME, METHOD_GOOGLE, METHOD_PASSWORD, create_access_token, hash_password
from app.services import account_deletion, admin_access, gemini, google_login, images, model_usage, paypal, ratelimit
from app.services.jsonutil import dumps

ADMIN_EMAIL = "owner@isramarket.example"
PASSWORD = "correct-horse-battery"
NEW_PASSWORD = "a-brand-new-password"
WEB = "http://localhost:3000"
CLIENT_ID = "test-client.apps.googleusercontent.com"
SUSPENDED = "account_suspended"


class AdminTestCase(unittest.TestCase):
    require_google = True
    admin_emails = f"  {ADMIN_EMAIL.upper()} , second-admin@isramarket.example ,"

    def setUp(self):
        ratelimit.reset()
        settings = get_settings()
        for name, value in {
            "admin_emails": self.admin_emails,
            "admin_require_google": self.require_google,
            "web_origin": WEB,
            "google_client_id": CLIENT_ID,
            "google_client_secret": "test-secret",
            "oauth_redirect_base": "",
            "cookie_secure": None,
        }.items():
            patcher = mock.patch.object(settings, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-admin-"))
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
        self.media = self.tmp / "media"
        self.media.mkdir()
        patch = mock.patch.object(images, "media_root", return_value=self.media)
        patch.start()
        self.addCleanup(patch.stop)
        # Rows queued for the model-usage writer land before the database goes away.
        self.addCleanup(model_usage.flush)

        self.client = TestClient(app)
        self.admin_id = self.make_user(ADMIN_EMAIL, password=None, google_sub="google-owner-sub", name="שחר")

    # --- helpers ---------------------------------------------------------------------

    def make_user(self, email, *, password=PASSWORD, google_sub=None, name="בעלת העסק", trial_days_ago=0.0,
                  created_days_ago=0.0) -> int:
        db = self.Session()
        user = User(
            email=email,
            password_hash=hash_password(password) if password else "",
            full_name=name,
            google_sub=google_sub,
            trial_started_at=datetime.utcnow() - timedelta(days=trial_days_ago),
            created_at=datetime.utcnow() - timedelta(days=created_days_ago),
        )
        db.add(user)
        db.commit()
        user_id = user.id
        db.close()
        return user_id

    def make_business(self, user_id, name="מאפיית תום", **fields) -> int:
        db = self.Session()
        business = Business(user_id=user_id, name=name, website_url="https://bakery.example", **fields)
        db.add(business)
        db.commit()
        business_id = business.id
        db.close()
        return business_id

    def token(self, user_id, method=METHOD_PASSWORD) -> str:
        return create_access_token(user_id, self.user(user_id).session_epoch or 0, method)

    def as_user(self, user_id, method=METHOD_PASSWORD, client=None):
        (client or self.client).cookies.set(COOKIE_NAME, self.token(user_id, method))

    def as_admin(self):
        self.as_user(self.admin_id, METHOD_GOOGLE)

    def user(self, user_id) -> User | None:
        db = self.Session()
        try:
            user = db.get(User, user_id)
            if user is not None:
                db.expunge(user)
            return user
        finally:
            db.close()

    def audit(self) -> list[AdminAudit]:
        db = self.Session()
        try:
            rows = db.query(AdminAudit).order_by(AdminAudit.id.asc()).all()
            for row in rows:
                db.expunge(row)
            return rows
        finally:
            db.close()

    def login(self, email, password, client=None):
        return (client or self.client).post("/auth/login", json={"email": email, "password": password})

    def make_link(self, user_id) -> str:
        self.as_admin()
        response = self.client.post(f"/admin/users/{user_id}/reset-link")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["url"].rsplit("/", 1)[1]

    def assert_suspended(self, response):
        self.assertEqual(response.status_code, 403, response.text)
        body = response.json()
        self.assertEqual(body["code"], SUSPENDED)
        self.assertRegex(body["detail_he"], r"[֐-׿]")
        self.assertEqual(body["detail"], body["detail_he"])

    # Google sign-in, as in tests/test_google_login.py.
    def google_start(self, client=None, **params) -> dict:
        response = (client or self.client).get("/auth/google/start", params=params, follow_redirects=False)
        self.assertEqual(response.status_code, 303)
        return {key: values[0] for key, values in parse_qs(urlsplit(response.headers["location"]).query).items()}

    def google_callback(self, query, *, sub, email, client=None):
        claims = {
            "iss": "https://accounts.google.com",
            "aud": CLIENT_ID,
            "exp": int(time.time()) + 3600,
            "iat": int(time.time()),
            "sub": sub,
            "email": email,
            "email_verified": True,
            "name": "שחר",
            "nonce": query["nonce"],
        }

        def fake_post(url, data=None, timeout=None):
            return httpx.Response(200, json={"id_token": "raw", "access_token": "at"}, request=httpx.Request("POST", url))

        with mock.patch.object(google_login.httpx, "post", side_effect=fake_post), \
                mock.patch.object(google_login, "_google_verify", return_value=claims):
            return (client or self.client).get(
                "/auth/google/callback", params={"code": "c", "state": query["state"]}, follow_redirects=False
            )

    def google_error(self, response) -> str:
        self.assertEqual(response.status_code, 303)
        return parse_qs(urlsplit(response.headers["location"]).query).get("google_error", [""])[0]


def admin_requests(target_id: int, email: str = "") -> list[tuple[str, str, dict | None]]:
    """One request per /admin route, with a valid body."""
    return [
        ("GET", "/admin/users", None),
        ("GET", f"/admin/users/{target_id}", None),
        ("POST", f"/admin/users/{target_id}/reset-link", None),
        ("POST", f"/admin/users/{target_id}/sign-out", None),
        ("POST", f"/admin/users/{target_id}/suspend", {"reason": "בדיקה"}),
        ("POST", f"/admin/users/{target_id}/reactivate", None),
        ("POST", f"/admin/users/{target_id}/billing-exempt", {"exempt": True}),
        ("DELETE", f"/admin/users/{target_id}", {"confirm_email": email}),
        ("GET", "/admin/audit", None),
    ]


def _uses(dependant, call) -> bool:
    return any(dep.call is call or _uses(dep, call) for dep in dependant.dependencies)


# --- the gate ---------------------------------------------------------------------------


class GateTest(AdminTestCase):
    def setUp(self):
        super().setUp()
        self.owner_id = self.make_user("noa@bakery.example")

    def test_every_admin_route_carries_require_admin(self):
        paths = set()
        for route in app.routes:
            if getattr(route, "path", "").startswith("/admin"):
                self.assertTrue(_uses(route.dependant, admin_access.require_admin), route.path)
                for method in route.methods:
                    paths.add((method, route.path))
        # Every route is exercised by the 401/403 tests below.
        self.assertEqual(len(paths), len(admin_requests(1)))

    def test_unauthenticated_is_401_everywhere_and_changes_nothing(self):
        for method, path, body in admin_requests(self.owner_id, "noa@bakery.example"):
            response = self.client.request(method, path, json=body)
            self.assertEqual(response.status_code, 401, f"{method} {path}")
        self.assertIsNotNone(self.user(self.owner_id))
        self.assertEqual(self.audit(), [])

    def test_a_signed_in_owner_is_403_everywhere_and_changes_nothing(self):
        other = self.make_user("other@bakery.example")
        self.as_user(other)
        for method, path, body in admin_requests(self.owner_id, "noa@bakery.example"):
            response = self.client.request(method, path, json=body)
            self.assertEqual(response.status_code, 403, f"{method} {path}")
            self.assertEqual(response.json()["code"], "admin_only")
        user = self.user(self.owner_id)
        self.assertIsNone(user.suspended_at)
        self.assertFalse(user.billing_exempt)
        self.assertEqual(self.audit(), [])

    def test_admin_signed_in_with_google_gets_in(self):
        self.as_admin()
        response = self.client.get("/admin/users")
        self.assertEqual(response.status_code, 200, response.text)
        emails = {row["email"] for row in response.json()["accounts"]}
        self.assertEqual(emails, {ADMIN_EMAIL, "noa@bakery.example"})

    def test_admin_email_with_a_password_session_is_403(self):
        # The owner's account, but this session came from email + password.
        self.as_user(self.admin_id, METHOD_PASSWORD)
        self.assertEqual(self.client.get("/admin/users").status_code, 403)

    def test_admin_email_without_google_link_is_403_even_with_a_google_claim(self):
        # Someone registered the owner's address with a password (no email verification).
        squatter = self.make_user("second-admin@isramarket.example")
        for method in (METHOD_PASSWORD, METHOD_GOOGLE):
            self.as_user(squatter, method)
            self.assertEqual(self.client.get("/admin/users").status_code, 403)

    def test_the_403_does_not_say_why(self):
        self.as_user(self.admin_id, METHOD_PASSWORD)
        admin_without_google = self.client.get("/admin/users").json()
        self.as_user(self.owner_id)
        not_listed = self.client.get("/admin/users").json()
        self.assertEqual(admin_without_google, not_listed)

    def test_session_from_a_real_google_sign_in_is_an_admin_session(self):
        db = self.Session()
        db.get(User, self.admin_id).password_hash = hash_password(PASSWORD)
        db.commit()
        db.close()
        # Email + password: not enough.
        self.assertEqual(self.login(ADMIN_EMAIL, PASSWORD).status_code, 200)
        self.assertEqual(self.client.get("/admin/users").status_code, 403)
        self.assertFalse(self.client.get("/auth/me").json()["is_admin"])
        # "להמשיך עם Google": the callback's session opens the backoffice.
        query = self.google_start(next="/admin", back="/login")
        response = self.google_callback(query, sub="google-owner-sub", email=ADMIN_EMAIL)
        self.assertEqual(response.headers["location"], f"{WEB}/admin")
        self.assertEqual(self.client.get("/admin/users").status_code, 200)
        self.assertTrue(self.client.get("/auth/me").json()["is_admin"])

    def test_old_tokens_without_the_method_claim_are_password_sessions(self):
        from jose import jwt

        legacy = jwt.encode(
            {"sub": str(self.admin_id), "ep": 0, "exp": datetime.utcnow() + timedelta(days=1)},
            get_settings().jwt_secret,
            algorithm="HS256",
        )
        self.client.cookies.set(COOKIE_NAME, legacy)
        self.assertEqual(self.client.get("/auth/me").status_code, 200)
        self.assertEqual(self.client.get("/admin/users").status_code, 403)

    def test_emails_are_case_insensitive_and_trimmed(self):
        self.assertEqual(get_settings().admin_email_set(), {ADMIN_EMAIL, "second-admin@isramarket.example"})

    def test_nobody_is_admin_when_the_list_is_empty(self):
        with mock.patch.object(get_settings(), "admin_emails", ""):
            self.as_admin()
            self.assertEqual(self.client.get("/admin/users").status_code, 403)
            self.assertFalse(self.client.get("/auth/me").json()["is_admin"])

    def test_me_says_is_admin_only_for_the_admin_session(self):
        self.as_admin()
        self.assertTrue(self.client.get("/auth/me").json()["is_admin"])
        self.as_user(self.owner_id)
        self.assertFalse(self.client.get("/auth/me").json()["is_admin"])

    def test_defaults(self):
        settings = Settings()
        self.assertTrue(settings.admin_require_google)
        self.assertEqual(Settings(admin_emails="").admin_email_set(), set())


class GateWithoutGoogleTest(AdminTestCase):
    require_google = False

    def test_password_session_of_a_listed_email_is_enough(self):
        admin = self.make_user("second-admin@isramarket.example")
        self.as_user(admin, METHOD_PASSWORD)
        self.assertEqual(self.client.get("/admin/users").status_code, 200)

    def test_an_unlisted_email_is_still_403(self):
        self.as_user(self.make_user("noa@bakery.example"))
        self.assertEqual(self.client.get("/admin/users").status_code, 403)


# --- suspension -------------------------------------------------------------------------


class SuspensionTest(AdminTestCase):
    def setUp(self):
        super().setUp()
        self.owner_id = self.make_user("noa@bakery.example")
        self.make_business(self.owner_id)
        self.owner_client = TestClient(app)

    def suspend(self, reason="לא שילם"):
        self.as_admin()
        response = self.client.post(f"/admin/users/{self.owner_id}/suspend", json={"reason": reason})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_password_sign_in_is_refused_with_the_hebrew_message(self):
        self.suspend()
        self.assert_suspended(self.login("noa@bakery.example", PASSWORD, self.owner_client))
        self.assertNotIn(COOKIE_NAME, self.owner_client.cookies)

    def test_a_wrong_password_learns_nothing_about_suspension(self):
        self.suspend()
        response = self.login("noa@bakery.example", "wrong-password", self.owner_client)
        self.assertEqual(response.status_code, 401)
        self.assertNotIn("code", response.json())

    def test_google_sign_in_of_a_linked_account_is_refused(self):
        db = self.Session()
        db.get(User, self.owner_id).google_sub = "google-noa"
        db.commit()
        db.close()
        self.suspend()
        query = self.google_start(client=self.owner_client, next="/dashboard", back="/login")
        response = self.google_callback(query, sub="google-noa", email="noa@bakery.example", client=self.owner_client)
        self.assertEqual(self.google_error(response), SUSPENDED)
        self.assertFalse([c for c in response.headers.get_list("set-cookie") if c.startswith(f"{COOKIE_NAME}=")])

    def test_google_sign_in_by_email_is_refused_and_does_not_touch_the_account(self):
        self.suspend()
        before = self.user(self.owner_id)
        query = self.google_start(client=self.owner_client, next="/dashboard", back="/login")
        response = self.google_callback(query, sub="google-new", email="noa@bakery.example", client=self.owner_client)
        self.assertEqual(self.google_error(response), SUSPENDED)
        after = self.user(self.owner_id)
        self.assertIsNone(after.google_sub)
        self.assertEqual(after.password_hash, before.password_hash)
        self.assertEqual(after.session_epoch, before.session_epoch)

    def test_an_existing_session_is_blocked_on_every_api_call(self):
        self.as_user(self.owner_id, client=self.owner_client)
        self.assertEqual(self.owner_client.get("/auth/me").status_code, 200)
        self.suspend()
        for path in ("/auth/me", "/onboarding/me", "/trial", "/billing/status", "/setup"):
            self.assert_suspended(self.owner_client.get(path))
        self.assert_suspended(self.owner_client.post("/auth/password/set", json={"new_password": "whatever-123"}))

    def test_blocked_even_if_only_the_flag_is_set(self):
        # Defence in depth: the 403 does not rely on the session epoch having moved.
        self.as_user(self.owner_id, client=self.owner_client)
        db = self.Session()
        db.get(User, self.owner_id).suspended_at = datetime.utcnow()
        db.commit()
        db.close()
        self.assert_suspended(self.owner_client.get("/onboarding/me"))

    def test_suspending_signs_out_and_keeps_the_data(self):
        epoch = self.user(self.owner_id).session_epoch
        detail = self.suspend("חוב")
        user = self.user(self.owner_id)
        self.assertIsNotNone(user.suspended_at)
        self.assertEqual(user.session_epoch, epoch + 1)
        self.assertEqual(user.suspended_reason, "חוב")
        self.assertTrue(detail["suspended"])
        self.assertEqual(detail["suspended_reason"], "חוב")
        db = self.Session()
        self.assertEqual(db.query(Business).filter_by(user_id=self.owner_id).count(), 1)
        db.close()

    def test_reactivation_restores_access_with_a_new_sign_in(self):
        self.as_user(self.owner_id, client=self.owner_client)
        self.suspend()
        response = self.client.post(f"/admin/users/{self.owner_id}/reactivate")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse(response.json()["suspended"])
        self.assertIsNone(self.user(self.owner_id).suspended_at)
        # The session from before the suspension stays signed out...
        self.assertEqual(self.owner_client.get("/auth/me").status_code, 401)
        # ...and signing in again works, API included.
        self.assertEqual(self.login("noa@bakery.example", PASSWORD, self.owner_client).status_code, 200)
        self.assertEqual(self.owner_client.get("/onboarding/me").status_code, 200)

    def test_the_admin_cannot_suspend_or_delete_themselves(self):
        self.as_admin()
        self.assertEqual(self.client.post(f"/admin/users/{self.admin_id}/suspend", json={}).status_code, 400)
        response = self.client.request("DELETE", f"/admin/users/{self.admin_id}", json={"confirm_email": ADMIN_EMAIL})
        self.assertEqual(response.status_code, 400)
        self.assertIsNone(self.user(self.admin_id).suspended_at)

    def test_a_suspended_admin_is_not_an_admin(self):
        db = self.Session()
        db.get(User, self.admin_id).suspended_at = datetime.utcnow()
        db.commit()
        db.close()
        self.as_admin()
        self.assert_suspended(self.client.get("/admin/users"))


# --- reset links --------------------------------------------------------------------------


class ResetLinkTest(AdminTestCase):
    def setUp(self):
        super().setUp()
        self.owner_id = self.make_user("noa@bakery.example")
        self.reset_client = TestClient(app)

    def redeem(self, token, password=NEW_PASSWORD):
        return self.reset_client.post("/auth/reset", json={"token": token, "new_password": password})

    def test_the_link_is_returned_once_with_a_long_random_token(self):
        self.as_admin()
        response = self.client.post(f"/admin/users/{self.owner_id}/reset-link")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["url"].startswith(f"{WEB}/reset/"))
        token = body["url"].rsplit("/", 1)[1]
        self.assertGreaterEqual(len(token), 43)  # 32 random bytes, base64url
        self.assertRegex(token, r"^[A-Za-z0-9_-]+$")
        expires = datetime.fromisoformat(body["expires_at"].replace("Z", ""))
        self.assertAlmostEqual((expires - datetime.utcnow()).total_seconds(), 24 * 3600, delta=120)
        # The account view says a link is out there, never the link.
        detail = self.client.get(f"/admin/users/{self.owner_id}")
        self.assertIsNotNone(detail.json()["reset_link_expires_at"])
        self.assertNotIn(token, detail.text)

    def test_only_the_hash_is_stored(self):
        token = self.make_link(self.owner_id)
        db = self.Session()
        row = db.query(PasswordResetToken).one()
        self.assertEqual(row.token_hash, hashlib.sha256(token.encode()).hexdigest())
        db.close()
        # Not in any column of any table.
        with self.engine.connect() as conn:
            for table in Base.metadata.sorted_tables:
                for row in conn.execute(select(table)).all():
                    self.assertNotIn(token, json.dumps([str(value) for value in row]), table.name)

    def test_check_says_valid_with_a_masked_email(self):
        token = self.make_link(self.owner_id)
        body = self.reset_client.post("/auth/reset/check", json={"token": token}).json()
        self.assertTrue(body["valid"])
        self.assertEqual(body["email_hint"], "n•••@bakery.example")
        self.assertNotIn("noa@", json.dumps(body))
        self.assertFalse(self.reset_client.post("/auth/reset/check", json={"token": "nope"}).json()["valid"])

    def test_reset_sets_the_password_once_and_signs_out_every_session(self):
        session_client = TestClient(app)
        self.as_user(self.owner_id, client=session_client)
        self.assertEqual(session_client.get("/auth/me").status_code, 200)
        epoch = self.user(self.owner_id).session_epoch

        token = self.make_link(self.owner_id)
        self.assertEqual(self.redeem(token).status_code, 200)
        user = self.user(self.owner_id)
        self.assertEqual(user.session_epoch, epoch + 1)
        self.assertEqual(session_client.get("/auth/me").status_code, 401)
        self.assertEqual(self.login("noa@bakery.example", PASSWORD, TestClient(app)).status_code, 401)
        self.assertEqual(self.login("noa@bakery.example", NEW_PASSWORD, TestClient(app)).status_code, 200)
        # The redeem itself does not sign anyone in.
        self.assertNotIn(COOKIE_NAME, self.reset_client.cookies)

        # Single use.
        second = self.redeem(token, "yet-another-password")
        self.assertEqual(second.status_code, 400)
        self.assertRegex(second.json()["detail"], r"[֐-׿]")
        self.assertFalse(self.reset_client.post("/auth/reset/check", json={"token": token}).json()["valid"])
        self.assertEqual(self.login("noa@bakery.example", NEW_PASSWORD, TestClient(app)).status_code, 200)
        db = self.Session()
        self.assertIsNotNone(db.query(PasswordResetToken).one().used_at)
        db.close()

    def test_an_expired_link_does_nothing(self):
        token = self.make_link(self.owner_id)
        db = self.Session()
        db.query(PasswordResetToken).update({"expires_at": datetime.utcnow() - timedelta(seconds=1)})
        db.commit()
        db.close()
        self.assertFalse(self.reset_client.post("/auth/reset/check", json={"token": token}).json()["valid"])
        self.assertEqual(self.redeem(token).status_code, 400)
        self.assertEqual(self.login("noa@bakery.example", PASSWORD, TestClient(app)).status_code, 200)

    def test_a_new_link_revokes_the_older_unused_one(self):
        first = self.make_link(self.owner_id)
        second = self.make_link(self.owner_id)
        self.assertNotEqual(first, second)
        self.assertEqual(self.redeem(first).status_code, 400)
        self.assertEqual(self.redeem(second).status_code, 200)

    def test_a_short_password_is_refused_and_keeps_the_link(self):
        token = self.make_link(self.owner_id)
        self.assertEqual(self.redeem(token, "short").status_code, 422)
        self.assertTrue(self.reset_client.post("/auth/reset/check", json={"token": token}).json()["valid"])
        self.assertEqual(self.redeem(token).status_code, 200)

    def test_attempts_are_rate_limited(self):
        with mock.patch.object(get_settings(), "auth_rate_limit", 3):
            codes = [self.redeem(f"guess-{i}").status_code for i in range(5)]
        self.assertEqual(codes[:3], [400, 400, 400])
        self.assertEqual(codes[3:], [429, 429])

    def test_a_google_only_account_can_get_a_password(self):
        google_only = self.make_user("google@bakery.example", password=None, google_sub="google-x")
        token = self.make_link(google_only)
        self.assertEqual(self.redeem(token).status_code, 200)
        self.assertTrue(self.user(google_only).password_hash)
        entry = self.audit()[-1]
        self.assertEqual(json.loads(entry.details_json), {"google_only": True})

    def test_the_token_is_never_logged_or_audited(self):
        records: list[str] = []

        class Capture(logging.Handler):
            def emit(self, record):
                records.append(record.getMessage())

        handler = Capture(level=logging.DEBUG)
        root = logging.getLogger()
        previous = root.level
        root.addHandler(handler)
        root.setLevel(logging.DEBUG)
        try:
            token = self.make_link(self.owner_id)
            self.redeem(token)
        finally:
            root.removeHandler(handler)
            root.setLevel(previous)
        self.assertFalse([line for line in records if token in line])
        self.assertFalse([e for e in self.audit() if token in e.details_json])
        self.as_admin()
        self.assertNotIn(token, self.client.get("/admin/audit").text)


# --- audit and deletion ----------------------------------------------------------------------


class AuditTest(AdminTestCase):
    def setUp(self):
        super().setUp()
        self.owner_id = self.make_user("noa@bakery.example")
        self.business_id = self.make_business(self.owner_id)
        folder = self.media / str(self.business_id)
        folder.mkdir()
        (folder / "1-card.png").write_bytes(b"card")

    def test_every_action_is_recorded(self):
        self.as_admin()
        base = f"/admin/users/{self.owner_id}"
        calls = [
            ("POST", f"{base}/reset-link", None, "reset_link", {"google_only": False}),
            ("POST", f"{base}/sign-out", None, "sign_out_everywhere", {}),
            ("POST", f"{base}/suspend", {"reason": "חוב"}, "suspend", {"with_reason": True}),
            ("POST", f"{base}/reactivate", None, "reactivate", {}),
            ("POST", f"{base}/billing-exempt", {"exempt": True}, "billing_exempt", {"exempt": True}),
            ("POST", f"{base}/billing-exempt", {"exempt": False}, "billing_exempt", {"exempt": False}),
            ("DELETE", base, {"confirm_email": "noa@bakery.example"}, "delete", {"businesses": 1}),
        ]
        for method, path, body, action, details in calls:
            response = self.client.request(method, path, json=body)
            self.assertEqual(response.status_code, 200, f"{path}: {response.text}")
            entry = self.audit()[-1]
            self.assertEqual(entry.action, action)
            self.assertEqual(entry.admin_user_id, self.admin_id)
            self.assertEqual(entry.target_user_id, self.owner_id)
            self.assertEqual(json.loads(entry.details_json), details)
        self.assertEqual(len(self.audit()), len(calls))

        listed = self.client.get("/admin/audit").json()["entries"]
        self.assertEqual([e["action"] for e in listed], [c[3] for c in reversed(calls)])
        self.assertTrue(all(e["admin_email"] == ADMIN_EMAIL for e in listed))
        # The account is gone: its entries say so instead of naming anyone.
        self.assertTrue(all(e["target_email"] is None for e in listed))
        # Reading the backoffice is not an action.
        self.client.get("/admin/users")
        self.assertEqual(len(self.audit()), len(calls))

    def test_the_reason_is_on_the_account_not_in_the_log(self):
        self.as_admin()
        self.client.post(f"/admin/users/{self.owner_id}/suspend", json={"reason": "טלפון 050-0000000"})
        self.assertNotIn("050", self.audit()[-1].details_json)

    def test_a_recycled_id_is_not_named_in_old_entries(self):
        self.as_admin()
        self.client.request("DELETE", f"/admin/users/{self.owner_id}", json={"confirm_email": "noa@bakery.example"})
        time.sleep(0.01)
        newcomer = self.make_user("new@bakery.example")
        self.assertEqual(newcomer, self.owner_id)  # SQLite hands the id out again
        self.client.post(f"/admin/users/{newcomer}/sign-out")
        entries = self.client.get("/admin/audit").json()["entries"]
        self.assertEqual(entries[0]["target_email"], "new@bakery.example")
        self.assertIsNone(entries[1]["target_email"])


class DeletionTest(AdminTestCase):
    def setUp(self):
        super().setUp()
        self.owner_id = self.make_user("noa@bakery.example")
        self.business_id = self.make_business(self.owner_id)
        db = self.Session()
        db.add(Strategy(business_id=self.business_id, year=2026, month=10))
        db.add(ImageUsage(business_id=self.business_id, provider="muse", model="muse-image-1.0", est_cost_usd=0.01))
        db.commit()
        db.close()
        folder = self.media / str(self.business_id)
        folder.mkdir()
        (folder / "1-card.png").write_bytes(b"card")
        self.as_admin()

    def test_a_wrong_email_deletes_nothing(self):
        response = self.client.request("DELETE", f"/admin/users/{self.owner_id}", json={"confirm_email": "noa@other.example"})
        self.assertEqual(response.status_code, 403)
        self.assertIsNotNone(self.user(self.owner_id))
        self.assertTrue((self.media / str(self.business_id)).is_dir())
        self.assertEqual(self.audit(), [])

    def test_deletion_goes_through_the_account_deletion_pipeline(self):
        with mock.patch.object(account_deletion, "delete_account", wraps=account_deletion.delete_account) as pipeline:
            response = self.client.request(
                "DELETE", f"/admin/users/{self.owner_id}", json={"confirm_email": "  NOA@bakery.example "}
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(pipeline.call_count, 1)
        self.assertEqual(pipeline.call_args.args[1].id, self.owner_id)
        self.assertIsNone(self.user(self.owner_id))
        db = self.Session()
        self.assertEqual(db.query(Business).count(), 0)
        self.assertEqual(db.query(Strategy).count(), 0)
        self.assertEqual(db.query(ImageUsage).count(), 0)
        db.close()
        self.assertFalse((self.media / str(self.business_id)).exists())
        # The record that it happened survives the account.
        self.assertEqual([e.action for e in self.audit()], ["delete"])
        self.assertIsNotNone(self.user(self.admin_id))

    def test_a_failed_deletion_leaves_no_entry(self):
        with mock.patch.object(account_deletion, "delete_account", side_effect=RuntimeError("disk")):
            client = TestClient(app, raise_server_exceptions=False)
            self.as_admin()
            client.cookies = self.client.cookies
            response = client.request("DELETE", f"/admin/users/{self.owner_id}", json={"confirm_email": "noa@bakery.example"})
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self.audit(), [])
        self.assertIsNotNone(self.user(self.owner_id))


# --- billing ------------------------------------------------------------------------------------


def paypal_settings(**overrides) -> Settings:
    values = dict(
        paypal_env="sandbox",
        paypal_client_id="client-id-public",
        paypal_client_secret="secret",
        paypal_plan_id="P-TESTPLAN123",
        paypal_webhook_id="WH-1",
        billing_enforce=True,
    )
    values.update(overrides)
    return Settings(**values)


class BillingExemptTest(AdminTestCase):
    def setUp(self):
        super().setUp()
        patch = mock.patch.object(paypal, "get_settings", return_value=paypal_settings())
        patch.start()
        self.addCleanup(patch.stop)
        self.owner_id = self.make_user("friend@bakery.example", trial_days_ago=60, created_days_ago=60)
        self.owner_client = TestClient(app)
        self.as_user(self.owner_id, client=self.owner_client)

    def exempt(self, value: bool):
        self.as_admin()
        response = self.client.post(f"/admin/users/{self.owner_id}/billing-exempt", json={"exempt": value})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["billing"]["exempt"], value)

    def test_enforcement_skips_a_free_account(self):
        self.assertEqual(self.owner_client.post("/research/run").status_code, 402)
        status = self.owner_client.get("/billing/status").json()
        self.assertTrue(status["locked"])
        self.assertFalse(status["exempt"])

        self.exempt(True)
        # Past the gate: no business, so the endpoint itself answers 404.
        self.assertEqual(self.owner_client.post("/research/run").status_code, 404)
        status = self.owner_client.get("/billing/status").json()
        self.assertTrue(status["exempt"])
        self.assertTrue(status["access"])
        self.assertFalse(status["locked"])
        self.assertFalse(status["needs_payment"])
        self.assertFalse(status["remind"])

        self.exempt(False)
        self.assertEqual(self.owner_client.post("/research/run").status_code, 402)

    def test_the_weekly_research_job_reads_the_same_gate(self):
        from app.services import billing

        self.exempt(True)
        db = self.Session()
        self.assertFalse(billing.locked(db, db.get(User, self.owner_id)))
        db.close()


# --- last active ------------------------------------------------------------------------------


class LastSeenTest(AdminTestCase):
    def setUp(self):
        super().setUp()
        self.owner_id = self.make_user("noa@bakery.example")
        self.as_user(self.owner_id)
        self.updates: list[str] = []

        def count(conn, cursor, statement, parameters, context, executemany):
            if statement.lstrip().upper().startswith("UPDATE USERS") and "last_seen_at" in statement:
                self.updates.append(statement)

        event.listen(self.engine, "before_cursor_execute", count)
        self.addCleanup(event.remove, self.engine, "before_cursor_execute", count)

    def test_written_at_most_once_an_hour(self):
        self.assertIsNone(self.user(self.owner_id).last_seen_at)
        for _ in range(4):
            self.assertEqual(self.client.get("/auth/me").status_code, 200)
        self.assertEqual(len(self.updates), 1)
        first = self.user(self.owner_id).last_seen_at
        self.assertIsNotNone(first)

        db = self.Session()
        db.get(User, self.owner_id).last_seen_at = datetime.utcnow() - LAST_SEEN_EVERY - timedelta(minutes=1)
        db.commit()
        db.close()
        self.updates.clear()  # that was this test's own UPDATE
        self.client.get("/auth/me")
        self.client.get("/auth/me")
        self.assertEqual(len(self.updates), 1)
        self.assertGreater(self.user(self.owner_id).last_seen_at, first)

    def test_the_list_shows_it_and_sorts_by_it(self):
        other = self.make_user("other@bakery.example")
        self.client.get("/auth/me")
        db = self.Session()
        db.get(User, self.owner_id).last_seen_at = datetime.utcnow() - timedelta(minutes=30)
        db.commit()
        db.close()
        self.as_admin()
        rows = self.client.get("/admin/users").json()["accounts"]
        by_email = {row["email"]: row for row in rows}
        self.assertIsNotNone(by_email["noa@bakery.example"]["last_seen_at"])
        self.assertIsNone(by_email["other@bakery.example"]["last_seen_at"])
        # The admin's own request is the most recent; never-seen accounts come last.
        self.assertEqual([row["email"] for row in rows], [ADMIN_EMAIL, "noa@bakery.example", "other@bakery.example"])
        self.assertTrue(other)


# --- what the backoffice shows ------------------------------------------------------------------


SECRET_CAPTION = "המתכון הסודי של סבתא, רק ללקוחות"
SECRET_STRINGS = ("ENC-ACCESS-SECRET", "ENC-REFRESH-SECRET", "PAGE-TOKEN-SECRET", "google-secret-sub", SECRET_CAPTION,
                  "הטון של המותג הסודי", "properties/123456")


class ViewTest(AdminTestCase):
    def setUp(self):
        super().setUp()
        now = datetime.utcnow()
        self.now = now
        # 1. signed up only.
        self.signup_id = self.make_user("signup@bakery.example", created_days_ago=3)
        # 2. a business, nothing else.
        self.business_only_id = self.make_user("biz@bakery.example")
        self.make_business(self.business_only_id, name="נגריית עץ")
        # 3. the whole loop, with connections, costs and secrets that must not leak.
        self.full_id = self.make_user("full@bakery.example", google_sub="google-secret-sub")
        self.full_business = self.make_business(
            self.full_id,
            name="מאפיית תום",
            scraped_profile_json=dumps({"quarter_plan": {"months": [1]}, "brand_language": {"voice": "הטון של המותג הסודי"}}),
        )
        approved_at = now - timedelta(days=9)
        published_at = now - timedelta(days=6)
        measured_at = now - timedelta(days=2)
        posts = [
            {"uid": "p1", "caption": SECRET_CAPTION, "approval_status": "approved", "approved_at": approved_at.isoformat()},
            {"uid": "p2", "caption": SECRET_CAPTION, "approval_status": "approved", "approved_at": (approved_at + timedelta(days=1)).isoformat(),
             "published_at": published_at.isoformat()},
            {"uid": "p3", "caption": SECRET_CAPTION, "approval_status": "approved", "published_at": published_at.isoformat(),
             "results": {"value": 21, "updated_at": measured_at.isoformat()}},
            {"uid": "p4", "caption": SECRET_CAPTION, "image_url": "/media/x.png", "image_source": "own"},
        ]
        db = self.Session()
        db.add(Strategy(business_id=self.full_business, year=2026, month=10, created_at=now - timedelta(days=12),
                        roadmap_json=dumps({"roadmap": {"posts": posts, "hypothesis": SECRET_CAPTION}})))
        db.add(Integration(business_id=self.full_business, provider="ga4", status="connected", external_id="properties/123456",
                           access_token_enc="ENC-ACCESS-SECRET", refresh_token_enc="ENC-REFRESH-SECRET",
                           extra_json=dumps({"source_readiness": {"status": "ready", "property_id": "properties/123456",
                                                                  "checked_at": now.isoformat()}})))
        db.add(Integration(business_id=self.full_business, provider="meta", status="reconnect",
                           access_token_enc="ENC-ACCESS-SECRET",
                           extra_json=dumps({"page_tokens": {"1": "PAGE-TOKEN-SECRET"}})))
        month_start = datetime(now.year, now.month, 1, 12)
        last_month = (month_start - timedelta(days=5)).replace(day=10)
        five_months_ago = month_start - timedelta(days=160)
        for cost in (0.01, 0.01, 0.068):
            db.add(ImageUsage(business_id=self.full_business, provider="muse", model="m", est_cost_usd=cost, created_at=month_start))
        db.add(ImageUsage(business_id=self.full_business, provider="muse", model="m", est_cost_usd=1.0, created_at=last_month))
        db.add(ImageUsage(business_id=self.full_business, provider="muse", model="m", est_cost_usd=9.0, created_at=five_months_ago))
        db.add(ModelUsage(business_id=self.full_business, model="gemini-3.8-flash", est_cost_usd=0.002, created_at=month_start))
        db.commit()
        db.close()
        self.make_link(self.full_id)  # an outstanding reset link
        self.as_admin()

    def rows(self, **params) -> dict:
        response = self.client.get("/admin/users", params=params)
        self.assertEqual(response.status_code, 200, response.text)
        return {row["email"]: row for row in response.json()["accounts"]}

    def test_stage_per_account_with_time_in_stage(self):
        rows = self.rows()
        self.assertEqual(rows["signup@bakery.example"]["stage"]["key"], "signup")
        self.assertEqual(rows["signup@bakery.example"]["stage"]["days_in_stage"], 3)
        self.assertEqual(rows["biz@bakery.example"]["stage"]["key"], "business")
        full = rows["full@bakery.example"]["stage"]
        self.assertEqual(full["key"], "measured")
        self.assertEqual(full["days_in_stage"], 2)

    def test_detail_has_the_timeline_post_counts_and_cost_history(self):
        detail = self.client.get(f"/admin/users/{self.full_id}").json()
        steps = {step["key"]: step for step in detail["timeline"]}
        self.assertEqual(list(steps), ["signup", "business", "plan", "approved", "published", "measured"])
        self.assertTrue(all(step["reached"] for step in steps.values()))
        self.assertTrue(steps["approved"]["reached_at"].startswith((self.now - timedelta(days=9)).date().isoformat()))
        self.assertEqual(detail["posts"]["total"], 4)
        self.assertEqual(detail["posts"]["by_lifecycle"]["approved"], 1)
        self.assertEqual(detail["posts"]["by_lifecycle"]["published"], 1)
        self.assertEqual(detail["posts"]["by_lifecycle"]["measured"], 1)
        costs = detail["costs"]
        self.assertEqual(len(costs), 4)
        self.assertEqual(costs[0]["month"], f"{self.now.year:04d}-{self.now.month:02d}")
        self.assertAlmostEqual(costs[0]["images_usd"], 0.088, places=4)
        self.assertEqual(costs[0]["image_calls"], 3)
        self.assertAlmostEqual(costs[0]["models_usd"], 0.002, places=4)
        self.assertAlmostEqual(costs[0]["total_usd"], 0.09, places=4)
        self.assertAlmostEqual(costs[1]["images_usd"], 1.0, places=4)
        self.assertAlmostEqual(sum(month["total_usd"] for month in costs), 1.09, places=4)  # 5 months ago: out
        self.assertEqual(detail["businesses"][0]["name"], "מאפיית תום")

    def test_connections_per_provider(self):
        rows = self.rows()
        full = rows["full@bakery.example"]["connections"]
        self.assertEqual(full["google"]["state"], "usable")
        self.assertEqual(full["meta"]["state"], "attention")
        self.assertEqual(rows["biz@bakery.example"]["connections"]["google"]["state"], "none")

    def test_cost_this_month_in_the_list(self):
        self.assertAlmostEqual(self.rows()["full@bakery.example"]["cost_this_month_usd"], 0.09, places=4)

    def test_search_filters_and_sort(self):
        self.assertEqual(set(self.rows(q="נגריית")), {"biz@bakery.example"})
        self.assertEqual(set(self.rows(q="FULL@")), {"full@bakery.example"})
        self.assertEqual(set(self.rows(stage="measured")), {"full@bakery.example"})
        self.assertEqual(set(self.rows(stage="signup")), {"signup@bakery.example", ADMIN_EMAIL})
        self.client.post(f"/admin/users/{self.signup_id}/suspend", json={})
        self.client.post(f"/admin/users/{self.business_only_id}/billing-exempt", json={"exempt": True})
        self.assertEqual(set(self.rows(status="suspended")), {"signup@bakery.example"})
        self.assertEqual(set(self.rows(status="free")), {"biz@bakery.example"})
        response = self.client.get("/admin/users", params={"sort": "created"})
        created = [row["email"] for row in response.json()["accounts"]]
        self.assertEqual(created[-1], "signup@bakery.example")  # created 3 days ago

    def test_no_secrets_or_customer_content_in_any_response(self):
        db = self.Session()
        hashes = [u.password_hash for u in db.query(User).all() if u.password_hash]
        token_hashes = [row.token_hash for row in db.query(PasswordResetToken).all()]
        db.close()
        self.client.post(f"/admin/users/{self.full_id}/sign-out")
        bodies = [
            self.client.get("/admin/users").text,
            self.client.get(f"/admin/users/{self.full_id}").text,
            self.client.post(f"/admin/users/{self.full_id}/billing-exempt", json={"exempt": True}).text,
            self.client.get("/admin/audit").text,
        ]
        forbidden = list(SECRET_STRINGS) + hashes + token_hashes + ["password_hash", "token_hash", "access_token", "google_sub"]
        for body in bodies:
            for secret in forbidden:
                self.assertNotIn(secret, body)


# --- the model-usage log --------------------------------------------------------------------------


class ModelUsageTest(AdminTestCase):
    def setUp(self):
        super().setUp()
        self.owner_id = self.make_user("noa@bakery.example")
        self.make_business(self.owner_id, name="ישן")
        self.business_id = self.make_business(self.owner_id, name="מאפיית תום", offerings="לחמים")

    def rows(self) -> list[ModelUsage]:
        model_usage.flush()
        db = self.Session()
        try:
            return db.query(ModelUsage).all()
        finally:
            db.close()

    def test_estimate_from_list_prices(self):
        self.assertAlmostEqual(model_usage.estimate_cost("gemini-3.8-flash", {"prompt_tokens": 1_000_000}), 0.5)
        self.assertAlmostEqual(
            model_usage.estimate_cost("gemini-3.5-flash-lite", {"output_tokens": 500_000, "thinking_tokens": 500_000}), 0.4
        )
        self.assertAlmostEqual(model_usage.estimate_cost("unknown", {"output_tokens": 1_000_000}), 3.0)

    def test_a_call_with_no_account_is_not_logged(self):
        self.assertIsNone(model_usage.record("gemini-3.8-flash", {"prompt_tokens": 10}))
        self.assertEqual(self.rows(), [])

    def test_a_job_scope_logs_for_its_business(self):
        with model_usage.attributed(self.business_id, self.engine):
            model_usage.record("gemini-3.8-flash", {"prompt_tokens": 2000, "output_tokens": 100, "thinking_tokens": 50})
        rows = self.rows()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].business_id, self.business_id)
        self.assertEqual((rows[0].prompt_tokens, rows[0].output_tokens, rows[0].thinking_tokens), (2000, 100, 50))
        self.assertAlmostEqual(rows[0].est_cost_usd, (2000 * 0.5 + 150 * 3.0) / 1e6)

    def test_a_request_logs_for_the_signed_in_owner(self):
        """End to end: a real endpoint's Gemini call, through the request scope."""
        response_obj = SimpleNamespace(
            text='{"audiences": []}',
            usage_metadata=SimpleNamespace(prompt_token_count=1200, candidates_token_count=300, thoughts_token_count=100),
        )
        fake = SimpleNamespace(models=SimpleNamespace(generate_content=lambda **kwargs: response_obj))
        client = TestClient(app, raise_server_exceptions=False)
        self.as_user(self.owner_id, client=client)
        with mock.patch.object(gemini, "_client", return_value=fake):
            client.post("/audiences/generate")
        rows = self.rows()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].business_id, self.business_id)  # the newest business
        self.assertEqual(rows[0].prompt_tokens, 1200)
        self.assertGreater(rows[0].est_cost_usd, 0)
        # Token counts only.
        columns = set(inspect(ModelUsage).columns.keys())
        self.assertFalse(columns & {"prompt", "response", "text", "content"})

    def test_installed_once(self):
        self.assertEqual(gemini.USAGE_HOOKS.count(model_usage.record), 1)


class MigrationTest(unittest.TestCase):
    def test_existing_users_table_gains_the_new_columns(self):
        from app import db as db_module

        tmp = Path(tempfile.mkdtemp(prefix="isramarket-admin-migrate-"))
        self.addCleanup(shutil.rmtree, tmp, True)
        engine = create_engine(f"sqlite:///{tmp / 'old.db'}")
        self.addCleanup(engine.dispose)
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR(255), password_hash VARCHAR(255) NOT NULL, full_name VARCHAR(255), created_at DATETIME)"))
            conn.execute(text("CREATE TABLE businesses (id INTEGER PRIMARY KEY, user_id INTEGER, name VARCHAR(255), "
                              "business_type VARCHAR(120), offerings TEXT)"))
            conn.execute(text("INSERT INTO users (email, password_hash, full_name) VALUES ('a@b.example', 'x', 'A')"))
        with mock.patch.object(db_module, "engine", engine), \
                mock.patch.object(db_module.settings, "database_url", f"sqlite:///{tmp / 'old.db'}"):
            db_module.migrate_db()
        with engine.connect() as conn:
            columns = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()}
            row = conn.exec_driver_sql("SELECT billing_exempt, suspended_reason, suspended_at, last_seen_at FROM users").one()
        self.assertTrue({"last_seen_at", "suspended_at", "suspended_reason", "billing_exempt"} <= columns)
        self.assertEqual(tuple(row), (0, "", None, None))


if __name__ == "__main__":
    unittest.main()
