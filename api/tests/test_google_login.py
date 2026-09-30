"""Sign in with Google (routers/auth.google_start / google_callback, services/google_login).

Hermetic: a throwaway SQLite file and no network. Google's token endpoint (`httpx.post`)
and its signature check (`google_login._google_verify`) are replaced; every other check —
state signature and expiry, the browser-bound nonce, PKCE, issuer, audience, expiry,
`email_verified`, the redirect allow-list — runs for real.

Also the Analytics connection's incremental authorization on top of the sign-in
(routers/integrations.ga4_start / ga4_callback): the `login_hint`, the public redirect URI,
and the Hebrew note when a different Google account grants it.
"""
import _test_env  # noqa: F401  (must come before any `app` import)

import base64
import hashlib
import shutil
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urlsplit

import httpx
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.db import Base, get_db
from app.main import app
from app.models import Business, User
from app.security import COOKIE_NAME, hash_password
from app.services import ga4, google_login, ratelimit

WEB = "http://localhost:3000"
CLIENT_ID = "test-client.apps.googleusercontent.com"
PASSWORD = "correct-horse-battery"


class GoogleLoginTest(unittest.TestCase):
    def setUp(self):
        ratelimit.reset()
        settings = get_settings()
        for name, value in {
            "google_client_id": CLIENT_ID,
            "google_client_secret": "test-secret",
            "oauth_redirect_base": "",
            "web_origin": WEB,
            "cookie_secure": None,
        }.items():
            patcher = mock.patch.object(settings, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-google-"))
        self.engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
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
        self.addCleanup(self.engine.dispose)
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.client = TestClient(app)
        self.token_posts: list[dict] = []

    # ---- helpers -------------------------------------------------------------------

    def start(self, client: TestClient | None = None, **params) -> dict:
        client = client or self.client
        response = client.get("/auth/google/start", params=params, follow_redirects=False)
        self.assertEqual(response.status_code, 303)
        location = response.headers["location"]
        self.assertTrue(location.startswith(google_login.AUTHORIZE_URL), location)
        query = {key: values[0] for key, values in parse_qs(urlsplit(location).query).items()}
        return query

    def claims(self, expected_nonce: str, **overrides) -> dict:
        claims = {
            "iss": "https://accounts.google.com",
            "aud": CLIENT_ID,
            "exp": int(time.time()) + 3600,
            "iat": int(time.time()),
            "sub": "google-sub-123",
            "email": "Noa@Bakery.example",
            "email_verified": True,
            "name": "נועה כהן",
            "nonce": expected_nonce,
        }
        claims.update(overrides)
        return claims

    def token_response(self, status: int = 200, payload: dict | None = None):
        def fake_post(url, data=None, timeout=None):
            self.assertEqual(url, google_login.TOKEN_URL)
            self.token_posts.append(dict(data or {}))
            body = payload if payload is not None else {"id_token": "raw-id-token", "access_token": "at-secret"}
            return httpx.Response(status, json=body, request=httpx.Request("POST", url))

        return mock.patch.object(google_login.httpx, "post", side_effect=fake_post)

    def callback(self, query: dict, claims: dict | None = None, client: TestClient | None = None, **extra):
        client = client or self.client
        params = {"code": "auth-code", "state": query.get("state", ""), **extra}
        verify = mock.patch.object(
            google_login, "_google_verify", return_value=claims if claims is not None else self.claims(query["nonce"])
        )
        with self.token_response(), verify:
            return client.get("/auth/google/callback", params=params, follow_redirects=False)

    def error_of(self, response) -> str:
        self.assertEqual(response.status_code, 303)
        query = parse_qs(urlsplit(response.headers["location"]).query)
        return query.get("google_error", [""])[0]

    def users(self) -> list[User]:
        db = self.Session()
        try:
            return db.query(User).all()
        finally:
            db.close()

    def seed_password_user(self, email="noa@bakery.example", google_sub=None) -> int:
        db = self.Session()
        user = User(email=email, password_hash=hash_password(PASSWORD), full_name="", google_sub=google_sub)
        db.add(user)
        db.commit()
        user_id = user.id
        db.close()
        return user_id

    # ---- start ---------------------------------------------------------------------

    def test_start_asks_for_login_scopes_only_with_pkce_and_state(self):
        query = self.start(next="/start?resume=save", back="/start")
        self.assertEqual(query["scope"], "openid email profile")
        self.assertEqual(query["client_id"], CLIENT_ID)
        self.assertEqual(query["redirect_uri"], f"{WEB}/backend/auth/google/callback")
        self.assertEqual(query["code_challenge_method"], "S256")
        self.assertNotIn("access_type", query)
        self.assertTrue(query["state"] and query["nonce"] and query["code_challenge"])
        self.assertIn(google_login.FLOW_COOKIE, self.client.cookies)

    def test_start_without_client_is_misconfigured(self):
        with mock.patch.object(get_settings(), "google_client_id", ""):
            response = self.client.get("/auth/google/start", params={"back": "/signup"}, follow_redirects=False)
        self.assertEqual(response.status_code, 303)
        self.assertTrue(response.headers["location"].startswith(f"{WEB}/signup?"))
        self.assertEqual(self.error_of(response), "misconfigured")

    # ---- callback: the happy paths --------------------------------------------------

    def test_new_user_is_created_signed_in_and_sent_to_next(self):
        query = self.start(next="/start?resume=save", back="/start")
        response = self.callback(query)
        self.assertEqual(response.status_code, 303)
        self.assertEqual(response.headers["location"], f"{WEB}/start?resume=save")

        users = self.users()
        self.assertEqual(len(users), 1)
        user = users[0]
        self.assertEqual(user.email, "noa@bakery.example")
        self.assertEqual(user.google_sub, "google-sub-123")
        self.assertEqual(user.password_hash, "")
        self.assertEqual(user.full_name, "נועה כהן")
        self.assertIsNotNone(user.trial_started_at)

        me = self.client.get("/auth/me")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["email"], "noa@bakery.example")
        self.assertFalse(me.json()["has_password"])
        self.assertTrue(me.json()["google_linked"])

    def test_session_cookie_is_the_password_login_cookie(self):
        query = self.start()
        response = self.callback(query)
        cookies = response.headers.get_list("set-cookie")
        session = [c for c in cookies if c.startswith(f"{COOKIE_NAME}=")]
        self.assertEqual(len(session), 1, cookies)
        lowered = session[0].lower()
        self.assertIn("httponly", lowered)
        self.assertIn("samesite=lax", lowered)
        self.assertIn("path=/", lowered)
        self.assertIn("max-age=604800", lowered)
        # The PKCE/nonce cookie is single use.
        flow = [c for c in cookies if c.startswith(f"{google_login.FLOW_COOKIE}=")]
        self.assertEqual(len(flow), 1)
        self.assertIn("max-age=0", flow[0].lower())

    def test_pkce_verifier_matches_the_challenge_sent_to_google(self):
        query = self.start()
        self.callback(query)
        self.assertEqual(len(self.token_posts), 1)
        sent = self.token_posts[0]
        verifier = sent["code_verifier"]
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        self.assertEqual(challenge, query["code_challenge"])
        self.assertEqual(sent["redirect_uri"], query["redirect_uri"])
        self.assertEqual(sent["grant_type"], "authorization_code")

    def test_existing_user_is_linked_not_duplicated(self):
        user_id = self.seed_password_user()
        query = self.start()
        response = self.callback(query)
        self.assertEqual(response.headers["location"], f"{WEB}/dashboard")
        users = self.users()
        self.assertEqual(len(users), 1)
        self.assertEqual(users[0].id, user_id)
        self.assertEqual(users[0].google_sub, "google-sub-123")
        # Linking fills an empty name but keeps the password.
        self.assertEqual(users[0].full_name, "נועה כהן")
        self.assertEqual(self.client.get("/auth/me").json()["id"], user_id)
        fresh = TestClient(app)
        login = fresh.post("/auth/login", json={"email": "noa@bakery.example", "password": PASSWORD})
        self.assertEqual(login.status_code, 200)

    def test_linked_user_is_found_by_google_id_after_an_email_change(self):
        self.seed_password_user(email="old@bakery.example", google_sub="google-sub-123")
        query = self.start()
        self.callback(query, claims=self.claims(query["nonce"], email="new@bakery.example"))
        self.assertEqual(len(self.users()), 1)
        self.assertEqual(self.client.get("/auth/me").json()["email"], "old@bakery.example")

    def test_email_linked_to_another_google_account_is_refused(self):
        self.seed_password_user(google_sub="someone-else")
        query = self.start()
        response = self.callback(query)
        self.assertEqual(self.error_of(response), "conflict")
        self.assertNotIn(COOKIE_NAME, self.client.cookies)

    # ---- callback: refusals ----------------------------------------------------------

    def test_unverified_email_is_refused(self):
        query = self.start(back="/signup")
        response = self.callback(query, claims=self.claims(query["nonce"], email_verified=False))
        self.assertTrue(response.headers["location"].startswith(f"{WEB}/signup?"))
        self.assertEqual(self.error_of(response), "unverified")
        self.assertEqual(self.users(), [])
        self.assertNotIn(COOKIE_NAME, self.client.cookies)

    def test_tampered_state_is_refused(self):
        query = self.start()
        query["state"] = query["state"][:-2] + ("AA" if not query["state"].endswith("AA") else "BB")
        response = self.callback(query)
        self.assertEqual(self.error_of(response), "expired")
        self.assertEqual(self.token_posts, [])
        self.assertEqual(self.users(), [])

    def test_missing_state_is_refused(self):
        response = self.client.get("/auth/google/callback", params={"code": "x"}, follow_redirects=False)
        self.assertEqual(self.error_of(response), "expired")

    def test_expired_state_is_refused(self):
        query = self.start()
        with mock.patch.object(google_login, "FLOW_TTL_SECONDS", -60):
            stale = google_login.encode_state("/dashboard", "/login", query["nonce"])
        query["state"] = stale
        self.assertEqual(self.error_of(self.callback(query)), "expired")

    def test_state_from_another_browser_is_refused(self):
        """Login CSRF: an attacker's own code and state, replayed in the victim's browser."""
        attacker = TestClient(app)
        query = self.start(client=attacker)
        victim = TestClient(app)
        # The victim has a flow cookie of their own, from a different start.
        self.start(client=victim)
        response = self.callback(query, client=victim)
        self.assertEqual(self.error_of(response), "expired")
        self.assertEqual(self.token_posts, [])
        self.assertNotIn(COOKIE_NAME, victim.cookies)

    def test_callback_without_flow_cookie_is_refused(self):
        query = self.start()
        self.client.cookies.clear()
        self.assertEqual(self.error_of(self.callback(query)), "expired")

    def test_cancel_and_denial(self):
        query = self.start(back="/start")
        response = self.client.get(
            "/auth/google/callback", params={"state": query["state"], "error": "access_denied"}, follow_redirects=False
        )
        self.assertEqual(response.headers["location"], f"{WEB}/start?google_error=cancelled")
        response = self.client.get(
            "/auth/google/callback", params={"state": query["state"], "error": "org_internal"}, follow_redirects=False
        )
        self.assertEqual(self.error_of(response), "denied")

    def test_wrong_audience_issuer_nonce_or_expiry_is_refused(self):
        cases = {
            "aud": ("other-client", "failed"),
            "iss": ("https://evil.example", "failed"),
            "nonce": ("not-the-nonce", "expired"),
            "exp": (int(time.time()) - 3600, "expired"),
        }
        for claim, (value, code) in cases.items():
            with self.subTest(claim=claim):
                query = self.start()
                response = self.callback(query, claims=self.claims(query["nonce"], **{claim: value}))
                self.assertEqual(self.error_of(response), code)
        self.assertEqual(self.users(), [])

    def test_google_signature_failure_is_refused(self):
        query = self.start()
        with self.token_response(), mock.patch.object(
            google_login, "_google_verify", side_effect=google_login.GoogleLoginError("failed")
        ):
            response = self.client.get(
                "/auth/google/callback", params={"code": "c", "state": query["state"]}, follow_redirects=False
            )
        self.assertEqual(self.error_of(response), "failed")

    def test_token_endpoint_errors_are_mapped_and_never_echoed(self):
        for payload, code in (
            ({"error": "invalid_client", "error_description": "secret-detail-xyz"}, "misconfigured"),
            ({"error": "invalid_grant", "error_description": "secret-detail-xyz"}, "failed"),
        ):
            with self.subTest(code=code):
                query = self.start()
                with self.token_response(400, payload), mock.patch.object(google_login, "_google_verify"):
                    response = self.client.get(
                        "/auth/google/callback", params={"code": "c", "state": query["state"]}, follow_redirects=False
                    )
                self.assertEqual(self.error_of(response), code)
                self.assertNotIn("secret-detail", response.headers["location"])

    # ---- redirects ---------------------------------------------------------------------

    def test_open_redirect_attempts_land_on_the_default(self):
        for evil in (
            "https://evil.example/steal",
            "//evil.example",
            "/\\evil.example",
            "javascript:alert(1)",
            "evil.example",
            "/ok\nLocation: https://evil.example",
            "/backend/auth/google/start",
        ):
            with self.subTest(next=evil):
                ratelimit.reset()
                query = self.start(next=evil, back=evil)
                response = self.callback(query)
                self.assertEqual(response.headers["location"], f"{WEB}/dashboard")

    def test_error_redirect_is_same_site_too(self):
        response = self.client.get(
            "/auth/google/callback",
            params={"state": "garbage", "error": "access_denied"},
            follow_redirects=False,
        )
        self.assertTrue(response.headers["location"].startswith(f"{WEB}/login?"))

    def test_safe_path(self):
        self.assertEqual(google_login.safe_path("/start?resume=save", "/d"), "/start?resume=save")
        self.assertEqual(google_login.safe_path("/onboarding?site=https%3A%2F%2Fa.co", "/d"), "/onboarding?site=https%3A%2F%2Fa.co")
        for bad in ("", None, "https://a.co", "//a.co", "/\\a.co", "a.co", "/x y", "/" + "a" * 600, "/backend"):
            self.assertEqual(google_login.safe_path(bad, "/d"), "/d", bad)

    def test_rate_limited_like_login(self):
        limit = get_settings().auth_rate_limit
        for _ in range(limit):
            self.start()
        response = self.client.get("/auth/google/start", follow_redirects=False)
        self.assertEqual(self.error_of(response), "rate_limited")

    # ---- Google-only accounts and passwords ------------------------------------------

    def _google_only_user(self) -> TestClient:
        query = self.start()
        self.callback(query)
        return self.client

    def test_password_login_for_google_only_user_hints_at_google(self):
        self._google_only_user()
        fresh = TestClient(app)
        for password in ("", "anything-at-all"):
            response = fresh.post("/auth/login", json={"email": "noa@bakery.example", "password": password})
            self.assertEqual(response.status_code, 401)
            self.assertIn("Google", response.json()["detail"])
        self.assertNotIn(COOKIE_NAME, fresh.cookies)

    def test_google_only_user_can_set_a_password_once(self):
        client = self._google_only_user()
        response = client.post("/auth/password/set", json={"new_password": PASSWORD})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(client.get("/auth/me").json()["has_password"])
        again = client.post("/auth/password/set", json={"new_password": "another-password"})
        self.assertEqual(again.status_code, 409)
        fresh = TestClient(app)
        login = fresh.post("/auth/login", json={"email": "noa@bakery.example", "password": PASSWORD})
        self.assertEqual(login.status_code, 200)

    def test_set_password_needs_a_session(self):
        response = TestClient(app).post("/auth/password/set", json={"new_password": PASSWORD})
        self.assertEqual(response.status_code, 401)

    def test_google_only_user_deletes_by_confirming_the_email(self):
        client = self._google_only_user()
        wrong = client.request("DELETE", "/auth/account", json={"confirm_email": "other@bakery.example"})
        self.assertEqual(wrong.status_code, 403)
        self.assertEqual(len(self.users()), 1)
        ok = client.request("DELETE", "/auth/account", json={"confirm_email": "NOA@bakery.example"})
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(self.users(), [])

    def test_password_user_still_deletes_with_the_password(self):
        self.seed_password_user()
        client = TestClient(app)
        client.post("/auth/login", json={"email": "noa@bakery.example", "password": PASSWORD})
        refused = client.request("DELETE", "/auth/account", json={"confirm_email": "noa@bakery.example"})
        self.assertEqual(refused.status_code, 403)

    # ---- incremental authorization: Analytics on top of the sign-in -------------------

    def _signed_in_with_business(self) -> int:
        self._google_only_user()
        db = self.Session()
        user = db.query(User).one()
        business = Business(user_id=user.id, name="מאפיית נועה")
        db.add(business)
        db.commit()
        business_id = business.id
        db.close()
        return business_id

    def _ga4_start(self) -> dict:
        response = self.client.get("/integrations/ga4/start")
        self.assertEqual(response.status_code, 200, response.text)
        return {key: values[0] for key, values in parse_qs(urlsplit(response.json()["url"]).query).items()}

    def _ga4_callback(self, query: dict, claims: dict):
        payload = {
            "access_token": "ga-at-secret",
            "refresh_token": "ga-rt-secret",
            "expires_in": 3600,
            "scope": "openid https://www.googleapis.com/auth/userinfo.email "
            "https://www.googleapis.com/auth/analytics.readonly",
            "id_token": "ga-raw-id-token",
        }

        def fake_post(url, data=None, timeout=None):
            self.token_posts.append(dict(data or {}))
            return httpx.Response(200, json=payload, request=httpx.Request("POST", url))

        with mock.patch.object(ga4.httpx, "post", side_effect=fake_post), mock.patch.object(
            google_login, "_google_verify", return_value=claims
        ), mock.patch.object(ga4, "list_properties", return_value=[]), mock.patch.object(
            get_settings(), "token_encryption_key", Fernet.generate_key().decode()
        ):
            return self.client.get(
                "/integrations/ga4/callback",
                params={"code": "ga-code", "state": query["state"]},
                follow_redirects=False,
            )

    def _ga4_item(self) -> dict:
        items = self.client.get("/integrations").json()["integrations"]
        return next(item for item in items if item["provider"] == "ga4")

    def test_analytics_consent_hints_the_signed_in_google_account(self):
        self._signed_in_with_business()
        query = self._ga4_start()
        self.assertEqual(query["login_hint"], "google-sub-123")
        self.assertEqual(query["include_granted_scopes"], "true")
        self.assertEqual(query["redirect_uri"], f"{WEB}/backend/integrations/ga4/callback")
        self.assertIn("analytics.readonly", query["scope"])

    def test_analytics_consent_hints_the_email_for_a_password_account(self):
        user_id = self.seed_password_user()
        db = self.Session()
        db.add(Business(user_id=user_id, name="מאפיית נועה"))
        db.commit()
        db.close()
        self.client.post("/auth/login", json={"email": "noa@bakery.example", "password": PASSWORD})
        self.assertEqual(self._ga4_start()["login_hint"], "noa@bakery.example")

    def test_analytics_from_the_same_google_account_has_no_warning(self):
        self._signed_in_with_business()
        query = self._ga4_start()
        claims = self.claims("", aud=CLIENT_ID)
        claims.pop("nonce")
        response = self._ga4_callback(query, claims)
        self.assertEqual(response.headers["location"], f"{WEB}/integrations?ga4=connected")
        self.assertEqual(self.token_posts[-1]["redirect_uri"], f"{WEB}/backend/integrations/ga4/callback")
        item = self._ga4_item()
        self.assertEqual(item["status"], "select_property")
        self.assertEqual(item["account_email"], "noa@bakery.example")
        self.assertFalse(item["account_mismatch"])
        self.assertIsNone(item["account_note_he"])

    def test_analytics_from_another_google_account_is_allowed_with_a_warning(self):
        self._signed_in_with_business()
        query = self._ga4_start()
        claims = self.claims("", sub="work-account-sub", email="data@agency.example")
        claims.pop("nonce")
        response = self._ga4_callback(query, claims)
        self.assertEqual(response.headers["location"], f"{WEB}/integrations?ga4=connected&ga4_account=other")
        item = self._ga4_item()
        # The grant is kept, as before.
        self.assertEqual(item["status"], "select_property")
        self.assertTrue(item["account_mismatch"])
        self.assertEqual(item["account_email"], "data@agency.example")
        self.assertIn("data@agency.example", item["account_note_he"])
        self.assertIn("noa@bakery.example", item["account_note_he"])
        # Signing in is untouched: still the original Google account.
        db = self.Session()
        self.assertEqual(db.query(User).one().google_sub, "google-sub-123")
        db.close()

    def test_analytics_without_a_readable_identity_still_connects(self):
        self._signed_in_with_business()
        query = self._ga4_start()
        with mock.patch.object(google_login, "account_of", return_value=None):
            response = self._ga4_callback(query, {})
        self.assertEqual(response.headers["location"], f"{WEB}/integrations?ga4=connected")
        self.assertIsNone(self._ga4_item()["account_email"])


if __name__ == "__main__":
    unittest.main()
