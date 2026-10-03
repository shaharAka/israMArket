"""DELETE /auth/account: the account, its businesses, every dependent row and its files.

The landing page and /security say "אפשר למחוק את החשבון וכל המידע בכל רגע". These tests
are what that sentence rests on. Hermetic: a throwaway SQLite file, a temporary media
root, the real cookie auth (so clearing the session is tested too), no network.
"""
import _test_env  # noqa: F401  (must come before any `app` import)

import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.main import app
from app.models import (
    Asset,
    AnalysisJob,
    Audience,
    Business,
    GenerationJob,
    HashtagQuery,
    ImageUsage,
    InspirationBrief,
    InstagramPost,
    Integration,
    Payment,
    PerformanceSnapshot,
    PhotoAnalysis,
    Recommendation,
    ResearchRun,
    ServiceReport,
    Strategy,
    Subscription,
    User,
    WebhookDelivery,
    WebhookEndpoint,
    WhatsappClick,
    WhatsappLink,
)
from app.security import COOKIE_NAME, create_access_token, hash_password
from app.services import account_deletion, images, ratelimit

PASSWORD = "correct-horse-battery"


class AccountDeletionTest(unittest.TestCase):
    def setUp(self):
        ratelimit.reset()
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-delete-"))
        self.engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.media = self.tmp / "media"
        self.media.mkdir()
        patch = mock.patch.object(images, "media_root", return_value=self.media)
        patch.start()
        self.addCleanup(patch.stop)

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

        self.owner_id, self.owner_businesses = self._seed("owner@example.com", businesses=2)
        self.other_id, self.other_businesses = self._seed("other@example.com", businesses=1)
        self.client = TestClient(app)

    def _seed(self, email: str, businesses: int) -> tuple[int, list[int]]:
        """One user with `businesses` businesses, each with a row in every dependent table
        and a media folder holding a card and an uploaded photo."""
        db = self.Session()
        user = User(email=email, password_hash=hash_password(PASSWORD), full_name="בעלת העסק")
        db.add(user)
        db.flush()
        # Billing rows are the user's, not a business's. Already cancelled, so the deletion
        # has nothing to cancel at PayPal (tests/test_billing.py covers that call).
        db.add(Subscription(user_id=user.id, provider_subscription_id=f"I-SEED{user.id}", status="CANCELLED"))
        db.add(Payment(user_id=user.id, provider_payment_id=f"SALE-SEED-{user.id}", amount="99.00"))
        ids: list[int] = []
        for index in range(businesses):
            business = Business(user_id=user.id, name=f"עסק {index}")
            db.add(business)
            db.flush()
            bid = business.id
            ids.append(bid)
            endpoint = WebhookEndpoint(business_id=bid, url="https://hooks.example/x", secret="s")
            db.add(endpoint)
            wa_link = WhatsappLink(business_id=bid, code=f"code{bid}x", source_key="default")
            db.add(wa_link)
            db.flush()
            db.add(WhatsappClick(business_id=bid, link_id=wa_link.id, day="2026-10-01", ua_family="ios", count=3))
            snapshot = PerformanceSnapshot(business_id=bid, period_start="2026-09-01", period_end="2026-09-28")
            db.add(snapshot)
            db.flush()
            db.add_all(
                [
                    Strategy(business_id=bid, year=2026, month=10),
                    Integration(business_id=bid, provider="meta", access_token_enc="enc", refresh_token_enc="enc"),
                    Integration(business_id=bid, provider="ga4", access_token_enc="enc", refresh_token_enc="enc"),
                    AnalysisJob(business_id=bid, snapshot_id=snapshot.id, context_key="fake", status="done"),
                    InstagramPost(business_id=bid, media_id=f"m{bid}"),
                    InspirationBrief(business_id=bid, year=2026, month=10),
                    HashtagQuery(business_id=bid, instagram_id="ig", hashtag="חלות"),
                    Recommendation(business_id=bid, week_of="2026-09-28"),
                    ServiceReport(business_id=bid, month="2026-10", inquiries=4, suitable=2, fit_criterion="דוגמה"),
                    Asset(business_id=bid, filename="asset-photo.png"),
                    Audience(business_id=bid, name="שכונה"),
                    ResearchRun(business_id=bid, period="2026-W40"),
                    GenerationJob(business_id=bid, kind="first_month", status="done"),
                    ImageUsage(business_id=bid, task="generate", provider="muse", model="muse-image-1.0",
                               est_cost_usd=0.01),
                    PhotoAnalysis(business_id=bid, content_hash=f"{bid:064d}", result_json="{}"),
                    WebhookDelivery(endpoint_id=endpoint.id, event="strategy"),
                ]
            )
            folder = self.media / str(bid)
            folder.mkdir()
            (folder / "1-card-abc.png").write_bytes(b"card")
            (folder / "asset-photo.png").write_bytes(b"photo")
        db.commit()
        user_id = user.id
        db.close()
        return user_id, ids

    def _login_as(self, user_id: int) -> None:
        self.client.cookies.set(COOKIE_NAME, create_access_token(user_id))

    def _delete(self, password: str):
        return self.client.request("DELETE", "/auth/account", json={"password": password})

    def _rows_for(self, user_id: int, business_ids: list[int]) -> dict[str, int]:
        """Rows left anywhere that belong to this user, table by table."""
        left: dict[str, int] = {}
        with self.engine.connect() as conn:
            endpoint_ids = [
                row[0]
                for row in conn.execute(
                    select(WebhookEndpoint.id).where(WebhookEndpoint.business_id.in_(business_ids))
                )
            ]
            for table in Base.metadata.sorted_tables:
                clauses = []
                if "business_id" in table.c:
                    clauses.append(table.c.business_id.in_(business_ids))
                if "user_id" in table.c:
                    clauses.append(table.c.user_id == user_id)
                if table.name == "users":
                    clauses.append(table.c.id == user_id)
                if table.name == "businesses":
                    clauses.append(table.c.id.in_(business_ids))
                if "endpoint_id" in table.c:
                    clauses.append(table.c.endpoint_id.in_(endpoint_ids or [-1]))
                for clause in clauses:
                    count = conn.execute(select(func.count()).select_from(table).where(clause)).scalar_one()
                    left[table.name] = left.get(table.name, 0) + count
        return left

    # --- tests --------------------------------------------------------------------

    def test_seed_covers_every_table(self):
        """If a new table is added, it must be seeded here, so the deletion test proves it."""
        seeded = {table for table, count in self._rows_for(self.owner_id, self.owner_businesses).items() if count}
        self.assertEqual(seeded, set(Base.metadata.tables))

    def test_analysis_job_with_missing_or_foreign_snapshot_is_swept(self):
        db = self.Session()
        owner_bid, other_bid = self.owner_businesses[0], self.other_businesses[0]
        foreign_snapshot = db.query(PerformanceSnapshot).filter_by(business_id=other_bid).first()
        db.query(AnalysisJob).filter_by(business_id=other_bid).delete()
        db.add_all([AnalysisJob(business_id=owner_bid, snapshot_id=999999, context_key="missing"),
                    AnalysisJob(business_id=owner_bid, snapshot_id=foreign_snapshot.id, context_key="foreign")])
        db.commit()
        account_deletion.purge_orphans(db)
        db.commit()
        self.assertEqual(db.query(AnalysisJob).filter(AnalysisJob.context_key.in_(["missing", "foreign"])).count(), 0)
        self.assertEqual(db.query(PerformanceSnapshot).filter_by(business_id=other_bid).count(), 1)
        db.close()

    def test_every_foreign_key_points_at_a_handled_parent(self):
        """A table hanging off something other than users / businesses / webhook
        endpoints would survive the deletion; it needs its own step in account_deletion."""
        for table in Base.metadata.sorted_tables:
            for fk in table.foreign_keys:
                self.assertIn(
                    fk.column.table.name,
                    account_deletion.HANDLED_PARENTS,
                    f"{table.name}.{fk.parent.name} -> {fk.column.table.name} is not cascaded by delete_account",
                )

    def test_deletes_every_row_and_file_and_signs_out(self):
        self._login_as(self.owner_id)
        response = self._delete(PASSWORD)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"ok": True})

        left = self._rows_for(self.owner_id, self.owner_businesses)
        self.assertEqual({table: count for table, count in left.items() if count}, {})
        for bid in self.owner_businesses:
            self.assertFalse((self.media / str(bid)).exists(), f"media folder {bid} survived")

        # The session cookie is cleared, and the old token no longer resolves to anyone.
        set_cookie = response.headers.get("set-cookie", "")
        self.assertIn(COOKIE_NAME, set_cookie)
        self.assertTrue("Max-Age=0" in set_cookie or "expires=" in set_cookie.lower())
        self._login_as(self.owner_id)
        self.assertEqual(self.client.get("/auth/me").status_code, 401)

    def test_wrong_password_is_403_and_deletes_nothing(self):
        self._login_as(self.owner_id)
        response = self._delete("not-the-password")
        self.assertEqual(response.status_code, 403)
        left = self._rows_for(self.owner_id, self.owner_businesses)
        self.assertEqual(set(table for table, count in left.items() if count), set(Base.metadata.tables))
        for bid in self.owner_businesses:
            self.assertTrue((self.media / str(bid) / "asset-photo.png").is_file())

    def test_requires_a_session(self):
        self.assertEqual(self._delete(PASSWORD).status_code, 401)

    def test_other_users_are_untouched(self):
        before = self._rows_for(self.other_id, self.other_businesses)
        self._login_as(self.owner_id)
        self.assertEqual(self._delete(PASSWORD).status_code, 200)
        self.assertEqual(self._rows_for(self.other_id, self.other_businesses), before)
        for bid in self.other_businesses:
            self.assertTrue((self.media / str(bid) / "1-card-abc.png").is_file())
            self.assertTrue((self.media / str(bid) / "asset-photo.png").is_file())
        # The other owner can still sign in.
        response = self.client.post("/auth/login", json={"email": "other@example.com", "password": PASSWORD})
        self.assertEqual(response.status_code, 200, response.text)

    def test_a_recycled_business_id_does_not_inherit_the_old_strategy(self):
        """SQLite reuses the highest free id: after the owner's account is deleted, the next
        business can get the same id, and must open on nothing of the deleted one's."""
        # The other owner holds the highest business id, the one SQLite gives out again.
        last_id = max(self.owner_businesses + self.other_businesses)
        self.assertEqual(self.other_businesses[-1], last_id)
        self._login_as(self.other_id)
        self.assertEqual(self._delete(PASSWORD).status_code, 200)
        # A month the background build finished writing after the deletion committed.
        db = self.Session()
        db.add(Strategy(business_id=last_id, year=2026, month=11))
        db.commit()
        db.close()

        db = self.Session()
        user = User(email="new@example.com", password_hash=hash_password(PASSWORD), full_name="")
        db.add(user)
        db.flush()
        business = Business(user_id=user.id, name="עסק חדש")
        db.add(business)
        db.commit()
        new_id = business.id
        db.close()
        self.assertEqual(new_id, last_id, "the test relies on SQLite handing the id out again")
        with self.engine.connect() as conn:
            strategies = conn.execute(select(func.count()).select_from(Strategy).where(Strategy.business_id == new_id)).scalar_one()
        self.assertEqual(strategies, 0)

    def test_deletion_sweeps_rows_left_by_earlier_deletions(self):
        """A strategy (or any business-keyed row) whose business is already gone is removed
        by the next account deletion, not left for a future business with that id."""
        db = self.Session()
        db.add(Strategy(business_id=9999, year=2026, month=9))
        db.add(GenerationJob(business_id=9999, kind="first_month", status="running"))
        db.add(Business(user_id=8888, name="של משתמש שנמחק"))
        db.commit()
        db.close()
        self._login_as(self.owner_id)
        self.assertEqual(self._delete(PASSWORD).status_code, 200)
        with self.engine.connect() as conn:
            self.assertEqual(conn.execute(select(func.count()).select_from(Strategy).where(Strategy.business_id == 9999)).scalar_one(), 0)
            self.assertEqual(conn.execute(select(func.count()).select_from(GenerationJob).where(GenerationJob.business_id == 9999)).scalar_one(), 0)
            self.assertEqual(conn.execute(select(func.count()).select_from(Business).where(Business.user_id == 8888)).scalar_one(), 0)
        # The other owner's rows are not orphans and stay.
        self.assertTrue(all(self._rows_for(self.other_id, self.other_businesses).values()))

    def test_account_without_a_business(self):
        db = self.Session()
        user = User(email="empty@example.com", password_hash=hash_password(PASSWORD), full_name="")
        db.add(user)
        db.commit()
        user_id = user.id
        db.close()
        self._login_as(user_id)
        self.assertEqual(self._delete(PASSWORD).status_code, 200)
        with self.engine.connect() as conn:
            self.assertEqual(conn.execute(select(func.count()).select_from(User).where(User.id == user_id)).scalar_one(), 0)


class PageTokenEncryptionTest(unittest.TestCase):
    """Facebook Page tokens are stored encrypted, and legacy plain ones still read."""

    def setUp(self):
        from app.config import Settings
        from app import security

        fake = Settings(jwt_secret="a-real-secret-value", token_encryption_key="")
        patch = mock.patch.object(security, "get_settings", return_value=fake)
        patch.start()
        self.addCleanup(patch.stop)

    def test_roundtrip_and_legacy(self):
        from app.security import decrypt_page_token, encrypt_page_tokens

        stored = encrypt_page_tokens({"page1": "EAAPAGE"})
        self.assertNotIn("EAAPAGE", stored["page1"])
        self.assertEqual(decrypt_page_token({"page_tokens": stored}, "page1"), "EAAPAGE")
        self.assertEqual(decrypt_page_token({"page_tokens": {"page1": "EAALEGACY"}}, "page1"), "EAALEGACY")
        self.assertEqual(decrypt_page_token({}, "page1"), "")

    def test_legacy_rows_are_rewritten_encrypted(self):
        from app.routers.integrations import encrypt_legacy_page_tokens
        from app.security import decrypt_page_token
        from app.services.jsonutil import dumps, loads

        tmp = Path(tempfile.mkdtemp(prefix="isramarket-pagetok-"))
        self.addCleanup(shutil.rmtree, tmp, True)
        engine = create_engine(f"sqlite:///{tmp / 't.db'}")
        self.addCleanup(engine.dispose)
        Base.metadata.create_all(bind=engine)
        db = sessionmaker(bind=engine)()
        self.addCleanup(db.close)
        user = User(email="a@example.com", password_hash="x", full_name="")
        db.add(user)
        db.flush()
        business = Business(user_id=user.id)
        db.add(business)
        db.flush()
        item = Integration(business_id=business.id, provider="meta", extra_json=dumps({"page_tokens": {"p": "EAAPLAIN"}}))
        db.add(item)
        db.commit()

        self.assertEqual(encrypt_legacy_page_tokens(db), 1)
        extra = loads(db.get(Integration, item.id).extra_json, {})
        self.assertNotIn("EAAPLAIN", extra["page_tokens"]["p"])
        self.assertEqual(decrypt_page_token(extra, "p"), "EAAPLAIN")
        self.assertEqual(encrypt_legacy_page_tokens(db), 0)


if __name__ == "__main__":
    unittest.main()
