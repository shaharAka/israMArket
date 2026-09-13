"""Tests for the setup checklist endpoint.

Hermetic: a throwaway SQLite file per test, three users, two businesses, no network.
Nothing about the checklist itself is mocked — every assertion is made against rows and
profile fields this test wrote, because the whole point of the endpoint is that `done`
means something really exists.
"""

import re
import shutil
import tempfile
import unittest
from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Asset, Audience, Business, Integration, Strategy, User
from app.services.jsonutil import dumps, loads

# The checklist in reading order: the setup group first, then the running group.
SETUP_KEYS = [
    "scan",
    "diagnostics",
    "priorities",
    "quarter",
    "audiences",
    "media",
    "google",
    "instagram",
]
RUNNING_KEYS = ["plan", "approve", "publish"]
ALL_KEYS = SETUP_KEYS + RUNNING_KEYS

# The order `next` must walk: the wizard chain, then the zero-friction wins (audiences,
# media) before the connections, then the recurring loop. Mirrors setup.NEXT_ORDER on
# purpose — if the router's ranking changes, this test is the place that notices.
NEXT_ORDER = [
    "scan",
    "diagnostics",
    "priorities",
    "quarter",
    "audiences",
    "media",
    "google",
    "instagram",
    "plan",
    "approve",
    "publish",
]

ACTION_HREFS = {
    "scan": "/decisions",
    "diagnostics": "/decisions",
    "priorities": "/decisions",
    "quarter": "/plan",
    "audiences": "/decisions#audiences",
    "media": "/assets",
    "google": "/integrations",
    "instagram": "/integrations",
    "plan": "/strategy",
    "approve": "/posts",
    "publish": "/posts",
}

HEBREW = re.compile(r"[\u0590-\u05FF]")

# The only items that come along for free when another item is done: an approval is
# always an approval *of posts in a plan*, and a published post is by definition an
# approved one. Every other item must flip alone.
IMPLIED = {
    "approve": {"plan", "approve"},
    "publish": {"plan", "approve", "publish"},
}


def post(title: str, approved: bool = False, published_url: str = "") -> dict:
    """A roadmap post shaped like the one the generator writes."""
    return {
        "title": title,
        "approval_status": "approved" if approved else "review",
        "published_url": published_url,
    }


class SetupChecklistTestCase(unittest.TestCase):
    """One isolated database; the owner, a rival business and a user with no business."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-setup-"))
        self.engine = create_engine(
            f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False}
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()

        self.owner = User(email="owner@example.com", password_hash="x", full_name="בעלת העסק")
        self.other = User(email="other@example.com", password_hash="x", full_name="עסק אחר")
        self.stranger = User(email="new@example.com", password_hash="x", full_name="משתמשת חדשה")
        self.db.add_all([self.owner, self.other, self.stranger])
        self.db.flush()
        self.business = Business(user_id=self.owner.id, name="מאפיית תום", website_url="https://bakery.example")
        self.rival = Business(user_id=self.other.id, name="מתחרה", website_url="https://rival.example")
        self.db.add_all([self.business, self.rival])
        self.db.commit()

        self.addCleanup(self._cleanup)

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: self.owner
        self.client = TestClient(app)

    def _cleanup(self):
        app.dependency_overrides.clear()
        self.db.close()
        # Release pooled SQLite handles before the file is removed, so the suite does not
        # leave a trail of "unclosed database" warnings.
        self.engine.dispose()
        shutil.rmtree(self.tmp, ignore_errors=True)

    # --- helpers ------------------------------------------------------------------

    def as_user(self, user: User) -> None:
        app.dependency_overrides[get_current_user] = lambda: user

    def payload(self) -> dict:
        response = self.client.get("/setup")
        self.assertEqual(response.status_code, 200)
        return response.json()

    def by_key(self, payload: dict | None = None) -> dict:
        payload = payload if payload is not None else self.payload()
        return {item["key"]: item for group in payload["groups"] for item in group["items"]}

    def done(self, key: str, payload: dict | None = None) -> bool:
        return self.by_key(payload)[key]["done"]

    def next_key(self, payload: dict | None = None) -> str | None:
        nxt = (payload if payload is not None else self.payload())["next"]
        return None if nxt is None else nxt["key"]

    def save_profile(self, fields: dict, business: Business | None = None) -> None:
        business = business or self.business
        stored = loads(business.scraped_profile_json, {}) or {}
        stored.update(fields)
        business.scraped_profile_json = dumps(stored)
        self.db.commit()

    def add_audience(self, business: Business | None = None) -> Audience:
        business = business or self.business
        row = Audience(business_id=business.id, name="משפחות מהשכונה", summary="קונות באמצע השבוע")
        self.db.add(row)
        self.db.commit()
        return row

    def add_asset(self, business: Business | None = None) -> Asset:
        business = business or self.business
        row = Asset(business_id=business.id, filename="asset-photo-abc123.png", mime="image/png")
        self.db.add(row)
        self.db.commit()
        return row

    def connect(self, provider: str, status: str = "connected", business: Business | None = None) -> Integration:
        business = business or self.business
        row = (
            self.db.query(Integration)
            .filter(Integration.business_id == business.id, Integration.provider == provider)
            .first()
        )
        if row:
            row.status = status
        else:
            row = Integration(
                business_id=business.id,
                provider=provider,
                status=status,
                external_id="ext-1",
                display_name=provider,
            )
            self.db.add(row)
        self.db.commit()
        return row

    def add_strategy(self, posts: list | None = None, business: Business | None = None, raw: str = "") -> Strategy:
        """The current month's strategy, so `_active_strategy` resolves to it."""
        business = business or self.business
        today = date.today()
        payload = raw or dumps({"roadmap": {"posts": posts if posts is not None else []}})
        row = (
            self.db.query(Strategy)
            .filter(
                Strategy.business_id == business.id,
                Strategy.year == today.year,
                Strategy.month == today.month,
            )
            .first()
        )
        if row:
            row.roadmap_json = payload
        else:
            row = Strategy(
                business_id=business.id,
                year=today.year,
                month=today.month,
                usp_json=dumps({"usp": "לחם טרי כל בוקר"}),
                calendar_json=dumps({}),
                roadmap_json=payload,
            )
            self.db.add(row)
        self.db.commit()
        return row

    def reset(self, business: Business | None = None) -> None:
        """Back to a business that has nothing at all."""
        business = business or self.business
        for model in (Strategy, Audience, Asset, Integration):
            self.db.query(model).filter(model.business_id == business.id).delete()
        business.scraped_profile_json = ""
        self.db.commit()

    def make_done(self, key: str, business: Business | None = None) -> None:
        """Create exactly the state that one item asks for, and nothing else."""
        business = business or self.business
        if key == "scan":
            self.save_profile({"brand_language": {"business_name": "מאפיית תום"}}, business)
        elif key == "diagnostics":
            self.save_profile({"diagnostics": {"has_customer_club": "yes"}}, business)
        elif key == "priorities":
            self.save_profile({"growth_targets": ["עוד לקוחות חוזרים"]}, business)
        elif key == "quarter":
            self.save_profile({"long_horizon_plan": {"quarters": [{"title": "רבעון ראשון"}]}}, business)
        elif key == "audiences":
            self.add_audience(business)
        elif key == "media":
            self.add_asset(business)
        elif key == "google":
            self.connect("ga4", business=business)
        elif key == "instagram":
            self.connect("meta", business=business)
        elif key == "plan":
            self.add_strategy([post("פוסט 1")], business)
        elif key == "approve":
            self.add_strategy([post("פוסט 1", approved=True)], business)
        elif key == "publish":
            self.add_strategy(
                [post("פוסט 1", approved=True, published_url="https://instagram.com/p/abc")], business
            )
        else:
            raise AssertionError(f"no fixture for {key}")

    def full_setup(self, business: Business | None = None) -> None:
        """A business that finished everything, one item at a time."""
        for key in ALL_KEYS:
            self.make_done(key, business)

    # --- shape --------------------------------------------------------------------

    def test_new_business_reports_every_item_incomplete(self):
        payload = self.payload()
        self.assertEqual(payload["total"], len(ALL_KEYS))
        self.assertEqual(payload["completed"], 0)
        by_key = self.by_key(payload)
        self.assertEqual(list(by_key), ALL_KEYS)
        for key, item in by_key.items():
            self.assertIs(item["done"], False, key)
        # The first thing to fix is the reading of the site: nothing generates without it.
        self.assertEqual(payload["next"]["key"], NEXT_ORDER[0])
        self.assertEqual(payload["next"]["action_href"], ACTION_HREFS["scan"])
        self.assertEqual(payload["next"], {k: payload["next"][k] for k in ("key", "title", "action_href", "action_label")})

    def test_groups_are_the_setup_and_running_groups(self):
        groups = self.payload()["groups"]
        self.assertEqual([group["key"] for group in groups], ["setup", "running"])
        for group in groups:
            self.assertTrue(group["title"].strip())
        self.assertEqual([item["key"] for item in groups[0]["items"]], SETUP_KEYS)
        self.assertEqual([item["key"] for item in groups[1]["items"]], RUNNING_KEYS)

    def test_every_item_carries_hebrew_copy_and_a_link(self):
        payload = self.payload()
        self.assertEqual(
            set(payload), {"completed", "total", "next", "groups"}
        )
        for item in self.by_key(payload).values():
            self.assertEqual(
                set(item), {"key", "title", "why", "done", "action_href", "action_label"}
            )
            for field in ("title", "why", "action_label"):
                self.assertTrue(item[field].strip(), f"{item['key']}.{field}")
                self.assertRegex(item[field], HEBREW, f"{item['key']}.{field} is not Hebrew")
            self.assertEqual(item["action_href"], ACTION_HREFS[item["key"]])
            self.assertTrue(item["action_href"].startswith("/"))

    def test_next_has_no_why_field(self):
        nxt = self.payload()["next"]
        self.assertEqual(set(nxt), {"key", "title", "action_href", "action_label"})
        self.assertTrue(nxt["title"].strip())

    # --- access -------------------------------------------------------------------

    def test_requires_authentication(self):
        app.dependency_overrides.pop(get_current_user, None)
        try:
            response = self.client.get("/setup")
        finally:
            app.dependency_overrides[get_current_user] = lambda: self.owner
        self.assertEqual(response.status_code, 401)

    def test_a_user_without_a_business_gets_the_full_checklist(self):
        self.as_user(self.stranger)
        payload = self.payload()
        self.assertEqual(payload["completed"], 0)
        self.assertEqual(payload["total"], len(ALL_KEYS))
        self.assertIs(self.by_key(payload)["scan"]["done"], False)
        self.assertEqual(payload["next"]["key"], "scan")

    # --- each item ----------------------------------------------------------------

    def test_each_item_flips_on_its_own(self):
        for key in ALL_KEYS:
            with self.subTest(item=key):
                self.reset()
                self.assertEqual(self.payload()["completed"], 0)
                self.make_done(key)
                payload = self.payload()
                done = {name for name, item in self.by_key(payload).items() if item["done"]}
                expected = IMPLIED.get(key, {key})
                self.assertEqual(done, expected, f"{key} flipped more than itself")
                self.assertEqual(payload["completed"], len(expected))

    def test_approve_is_not_done_when_only_some_posts_are_approved(self):
        self.add_strategy([post("פוסט 1", approved=True), post("פוסט 2")])
        self.assertIs(self.done("plan"), True)
        self.assertIs(self.done("approve"), False)
        self.add_strategy([post("פוסט 1", approved=True), post("פוסט 2", approved=True)])
        self.assertIs(self.done("approve"), True)

    def test_a_strategy_with_no_posts_does_not_mark_anything_running_done(self):
        self.add_strategy([])
        self.assertIs(self.done("plan"), False)
        self.assertIs(self.done("approve"), False)
        self.assertIs(self.done("publish"), False)

    def test_a_roadmap_without_posts_is_not_done(self):
        self.add_strategy(raw=dumps({}))
        self.assertIs(self.done("plan"), False)
        self.assertIs(self.done("approve"), False)

    def test_a_post_without_an_approval_status_is_not_approved(self):
        self.add_strategy([{"title": "פוסט ישן", "published_url": ""}])
        self.assertIs(self.done("plan"), True)
        self.assertIs(self.done("approve"), False)
        self.assertIs(self.done("publish"), False)

    def test_publishing_needs_a_real_url(self):
        self.add_strategy([post("פוסט 1", approved=True, published_url="")])
        self.assertIs(self.done("publish"), False)
        self.add_strategy([post("פוסט 1", approved=True, published_url="https://instagram.com/p/abc")])
        self.assertIs(self.done("publish"), True)

    def test_half_filled_profile_fields_are_not_done(self):
        self.save_profile({"brand_language": {}})
        self.assertIs(self.done("scan"), False)
        self.save_profile({"diagnostics": {"has_customer_club": None, "capacity_constraint": "   "}})
        self.assertIs(self.done("diagnostics"), False)
        self.save_profile({"growth_targets": ["", "   "]})
        self.assertIs(self.done("priorities"), False)
        self.save_profile({"long_horizon_plan": {}})
        self.assertIs(self.done("quarter"), False)
        self.save_profile({"long_horizon_plan": None, "growth_targets": []})
        self.assertIs(self.done("priorities"), False)
        self.assertIs(self.done("quarter"), False)

    def test_only_a_connected_integration_counts(self):
        self.connect("ga4", status="select_property")
        self.connect("meta", status="pending")
        self.assertIs(self.done("google"), False)
        self.assertIs(self.done("instagram"), False)
        self.connect("ga4", status="connected")
        self.assertIs(self.done("google"), True)
        self.assertIs(self.done("instagram"), False)
        self.connect("meta", status="connected")
        self.assertIs(self.done("instagram"), True)

    def test_an_integration_for_another_provider_is_not_a_connection(self):
        self.connect("google_ads")
        self.assertIs(self.done("google"), False)
        self.assertIs(self.done("instagram"), False)

    # --- the whole checklist -------------------------------------------------------

    def test_fully_configured_business_is_complete(self):
        self.full_setup()
        payload = self.payload()
        self.assertEqual(payload["completed"], payload["total"])
        self.assertEqual(payload["total"], len(ALL_KEYS))
        self.assertTrue(all(item["done"] for item in self.by_key(payload).values()))
        self.assertIsNone(payload["next"])

    def test_next_follows_the_documented_order(self):
        self.assertEqual(self.next_key(), NEXT_ORDER[0])
        for index, key in enumerate(NEXT_ORDER[:-1]):
            self.make_done(key)
            self.assertEqual(self.next_key(), NEXT_ORDER[index + 1], f"after {key}")
        self.make_done(NEXT_ORDER[-1])
        self.assertIsNone(self.payload()["next"])

    def test_audiences_and_media_rank_before_the_connections(self):
        # The wizard chain is done, nothing else is: the guide must point at the
        # zero-friction wins first, not at an OAuth trip.
        for key in ("scan", "diagnostics", "priorities", "quarter"):
            self.make_done(key)
        self.assertEqual(self.next_key(), "audiences")
        self.make_done("audiences")
        self.assertEqual(self.next_key(), "media")
        self.make_done("media")
        self.assertEqual(self.next_key(), "google")
        self.make_done("google")
        self.assertEqual(self.next_key(), "instagram")
        self.make_done("instagram")
        self.assertEqual(self.next_key(), "plan")

    # --- ownership ----------------------------------------------------------------

    def test_another_business_rows_never_affect_the_result(self):
        self.full_setup(self.rival)
        payload = self.payload()
        self.assertEqual(payload["completed"], 0)
        self.assertEqual(payload["total"], len(ALL_KEYS))
        self.assertTrue(all(not item["done"] for item in self.by_key(payload).values()))
        self.assertEqual(payload["next"]["key"], "scan")

    def test_another_business_rows_do_not_change_a_partly_ready_business(self):
        self.make_done("scan")
        self.make_done("audiences")
        before = self.payload()
        self.full_setup(self.rival)
        after = self.payload()
        self.assertEqual(after["completed"], before["completed"])
        self.assertEqual(after["completed"], 2)
        self.assertEqual({k: v["done"] for k, v in self.by_key(after).items()},
                         {k: v["done"] for k, v in self.by_key(before).items()})

    def test_only_the_newest_business_is_checked(self):
        self.full_setup(self.business)
        newer = Business(user_id=self.owner.id, name="עסק חדש")
        self.db.add(newer)
        self.db.commit()
        payload = self.payload()
        self.assertEqual(payload["completed"], 0)
        self.assertEqual(payload["next"]["key"], "scan")

        self.full_setup(newer)
        payload = self.payload()
        self.assertEqual(payload["completed"], payload["total"])
        self.assertIsNone(payload["next"])


if __name__ == "__main__":
    unittest.main()
