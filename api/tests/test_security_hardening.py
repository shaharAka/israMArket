"""Tests for auth hardening: token encryption, rate limiting, and schema validation."""

import unittest

from pydantic import ValidationError

from app.schemas import BrandSwatchIn
from app.security import DEFAULT_JWT_SECRET, create_access_token, decode_access_token
from app.services import ratelimit
from app.services.jsonutil import loads


class TokenTest(unittest.TestCase):
    def test_roundtrip(self):
        token = create_access_token(42)
        self.assertEqual(decode_access_token(token), 42)

    def test_rejects_tampered_token(self):
        token = create_access_token(42)
        self.assertIsNone(decode_access_token(token + "x"))

    def test_rejects_garbage(self):
        self.assertIsNone(decode_access_token("not-a-token"))

    def test_encryption_refuses_the_default_secret(self):
        """Deriving the token-encryption key from the shipped default would mean every
        stored OAuth token is encrypted under a key published in the repository."""
        from unittest.mock import patch

        from app.config import Settings
        from app import security

        fake = Settings(jwt_secret=DEFAULT_JWT_SECRET, token_encryption_key="")
        with patch.object(security, "get_settings", return_value=fake):
            with self.assertRaises(RuntimeError) as ctx:
                security.encrypt_secret("secret-value")
            self.assertIn("TOKEN_ENCRYPTION_KEY", str(ctx.exception))

    def test_encryption_roundtrip_with_real_secret(self):
        from app.config import Settings
        from unittest.mock import patch

        from app import security

        fake = Settings(jwt_secret="a-real-secret-value", token_encryption_key="")
        with patch.object(security, "get_settings", return_value=fake):
            blob = security.encrypt_secret("ga4-token")
            self.assertNotIn("ga4-token", blob)
            self.assertEqual(security.decrypt_secret(blob), "ga4-token")


class RateLimitTest(unittest.TestCase):
    def setUp(self):
        ratelimit.reset()

    def test_allows_up_to_limit_then_blocks(self):
        for i in range(8):
            self.assertTrue(ratelimit.allow("k", 8, 300), f"hit {i} should be allowed")
        self.assertFalse(ratelimit.allow("k", 8, 300))

    def test_keys_are_independent(self):
        for _ in range(8):
            ratelimit.allow("a", 8, 300)
        self.assertTrue(ratelimit.allow("b", 8, 300))

    def test_window_expiry_frees_budget(self):
        # A zero-length window means every previous hit is already outside it.
        for _ in range(8):
            ratelimit.allow("k", 8, 0)
        self.assertTrue(ratelimit.allow("k", 8, 0))


class JsonUtilTest(unittest.TestCase):
    def test_malformed_json_falls_back_instead_of_raising(self):
        """One corrupt column used to 500 the whole request."""
        for raw in ("{not json", "", None, "null", "[unclosed"):
            with self.subTest(raw=raw):
                self.assertEqual(loads(raw, {"default": True}), {"default": True})

    def test_valid_json_parses(self):
        self.assertEqual(loads('{"a": 1}', {}), {"a": 1})
        self.assertEqual(loads("[1, 2]", []), [1, 2])


class PaletteValidationTest(unittest.TestCase):
    def test_accepts_real_hex(self):
        for h in ("#0b6e4f", "#ABC", "#ffffff"):
            with self.subTest(hex=h):
                self.assertEqual(BrandSwatchIn(hex=h, role="primary", name="x").hex, h)

    def test_rejects_non_hex(self):
        """Length alone previously let '#zzz' and 'red' through into the card renderer."""
        for h in ("#zzz", "red", "#12345", "", "#1234567"):
            with self.subTest(hex=h), self.assertRaises(ValidationError):
                BrandSwatchIn(hex=h, role="primary", name="x")


if __name__ == "__main__":
    unittest.main()


class PasswordChangeTest(unittest.TestCase):
    """There was no way to change a password at all, so a stale or mistyped one was
    unrecoverable — exactly how a real account got locked out.

    These tests run against the configured database, so each one creates a uniquely
    named user and deletes it again. Leaving rows behind would pollute real data.
    """

    def setUp(self):
        import uuid

        from fastapi.testclient import TestClient

        from app.main import app

        self.email = f"pwtest-{uuid.uuid4().hex[:12]}@example.com"
        self.original = "original-pass-123"
        self.client = TestClient(app)
        self.client.post(
            "/auth/register",
            json={"email": self.email, "password": self.original, "full_name": "בדיקה"},
        )

    def tearDown(self):
        from app.db import SessionLocal
        from app.models import User

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.email == self.email).first()
            if user:
                db.delete(user)
                db.commit()
        finally:
            db.close()

    def _change(self, current, new):
        return self.client.post(
            "/auth/password", json={"current_password": current, "new_password": new}
        )

    def test_requires_the_current_password(self):
        self.assertEqual(self._change("wrong", "brand-new-pass-1").status_code, 401)

    def test_rejects_reusing_the_same_password(self):
        self.assertEqual(self._change(self.original, self.original).status_code, 400)

    def test_rejects_a_short_password(self):
        self.assertEqual(self._change(self.original, "short").status_code, 422)

    def test_requires_a_session(self):
        from fastapi.testclient import TestClient

        from app.main import app

        r = TestClient(app).post(
            "/auth/password", json={"current_password": "a", "new_password": "brand-new-pass-1"}
        )
        self.assertEqual(r.status_code, 401)

    def test_changes_the_password_and_invalidates_the_old_one(self):
        self.assertEqual(self._change(self.original, "brand-new-pass-1").status_code, 200)

        from fastapi.testclient import TestClient

        from app.main import app

        fresh = TestClient(app)
        self.assertEqual(
            fresh.post("/auth/login", json={"email": self.email, "password": self.original}).status_code,
            401,
        )
        self.assertEqual(
            fresh.post("/auth/login", json={"email": self.email, "password": "brand-new-pass-1"}).status_code,
            200,
        )
