"""PUT /onboarding/owner-context: changing what the owner told us at /start, from /decisions.

Hermetic like test_onboarding_draft: the business is created through /onboarding/from-draft
(no model calls on that path), on a throwaway SQLite file.
"""
import _test_env  # noqa: F401  (must come before any `app` import)

import copy
import json
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Business, User
from app.services.jsonutil import loads

import test_onboarding_draft as base

DIRECTION = base.DIRECTION


class OwnerContextTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-owner-context-"))
        engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=engine)
        self.db = sessionmaker(bind=engine, autoflush=False, autocommit=False)()
        self.owner = User(email="owner@example.com", password_hash="x", full_name="נועה")
        self.db.add(self.owner)
        self.db.commit()

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: self.owner
        self.addCleanup(app.dependency_overrides.clear)
        self.addCleanup(self.db.close)
        self.client = TestClient(app)

    # helpers ---------------------------------------------------------------------------

    def signup(self, **overrides) -> dict:
        draft = copy.deepcopy(base.BAKERY)
        draft.update(overrides)
        response = self.client.post("/onboarding/from-draft", json={"draft": draft, "chosen_direction": DIRECTION})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["business"]

    def put(self, body):
        return self.client.put("/onboarding/owner-context", json=body)

    def business(self) -> Business:
        self.db.expire_all()
        return self.db.query(Business).filter(Business.user_id == self.owner.id).one()

    def stored(self) -> dict:
        return loads(self.business().scraped_profile_json, {})

    # partial updates -------------------------------------------------------------------

    def test_deferred_link_survives_signup_and_can_be_repaired_without_other_changes(self):
        raw = "https://www.facebook.com/groups/123456"
        response = self.client.post("/onboarding/from-draft", json={
            "draft": base.BAKERY, "chosen_direction": DIRECTION,
            "deferred_links": {"facebook": raw},
        })
        self.assertEqual(response.status_code, 200, response.text)
        before = response.json()["business"]
        self.assertEqual(before["owner_context"]["pending_links"]["facebook"]["url"], raw)
        self.assertNotIn("facebook", before["social_links"])
        self.assertEqual(self.put({"links": {"facebook": raw}}).status_code, 422)
        self.assertEqual(self.client.get("/onboarding/me").json()["business"]["owner_context"]["pending_links"]["facebook"]["url"], raw)
        fixed = self.put({"links": {"facebook": "https://m.facebook.com/example.shop?ref=share"}})
        self.assertEqual(fixed.status_code, 200, fixed.text)
        after = fixed.json()["business"]
        self.assertEqual(after["social_links"]["facebook"], "https://www.facebook.com/example.shop")
        self.assertEqual(after["social_links"].get("instagram"), before["social_links"].get("instagram"))
        self.assertEqual(after["website_url"], before["website_url"])
        self.assertEqual(after["primary_goal"], before["primary_goal"])
        self.assertEqual(after["owner_context"]["pending_links"], {})

    def test_public_link_repair_cannot_store_another_protocol(self):
        self.signup()
        before = self.business().website_url
        response = self.put({"links": {"website": "javascript:alert(1)"}})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.business().website_url, before)

    def test_unchecked_valid_link_is_kept_until_the_owner_confirms_it(self):
        response = self.client.post("/onboarding/from-draft", json={
            "draft": base.BAKERY, "deferred_links": {"facebook": "https://facebook.com/example.shop?ref=share"},
        })
        self.assertEqual(response.status_code, 200, response.text)
        pending = response.json()["business"]["owner_context"]["pending_links"]
        self.assertIn("facebook", pending)
        fixed = self.put({"links": {"facebook": pending["facebook"]["url"]}})
        self.assertEqual(fixed.status_code, 200, fixed.text)
        self.assertEqual(fixed.json()["business"]["social_links"]["facebook"], "https://www.facebook.com/example.shop")
        self.assertEqual(fixed.json()["business"]["owner_context"]["pending_links"], {})

    def test_seasons_only_changes_seasons(self):
        before = self.signup()["owner_context"]
        response = self.put({"seasons": {"busy": [12, 11, 11], "slow": [1]}})
        self.assertEqual(response.status_code, 200, response.text)
        after = response.json()["business"]["owner_context"]
        self.assertEqual(after["seasons"], {"busy": [11, 12], "slow": [1]})
        for key in ("differentiator", "tried", "activity", "competitors"):
            self.assertEqual(after[key], before[key], key)
        # Same shape as /onboarding/me.
        self.assertEqual(response.json(), self.client.get("/onboarding/me").json())

    def test_differentiator_can_change_and_clear(self):
        self.signup()
        self.assertEqual(
            self.put({"differentiator": "  אופים מול הלקוחות  "}).json()["business"]["owner_context"]["differentiator"],
            "אופים מול הלקוחות",
        )
        self.assertEqual(self.put({"differentiator": ""}).json()["business"]["owner_context"]["differentiator"], "")

    def test_tried_keeps_what_worked_unless_sent(self):
        self.signup()
        tried = self.put({"tried": {"channels": ["google", "google", "flyers"]}}).json()["business"]["owner_context"]["tried"]
        self.assertEqual(tried, {"channels": ["google", "flyers"], "what_worked": "רוב הלקוחות מגיעים מהמלצות"})
        tried = self.put({"tried": {"channels": [], "what_worked": ""}}).json()["business"]["owner_context"]["tried"]
        self.assertEqual(tried, {"channels": [], "what_worked": ""})

    def test_activity_updates_only_the_networks_sent(self):
        self.signup()
        activity = self.put({"activity": {"facebook": "regular"}}).json()["business"]["owner_context"]["activity"]
        self.assertEqual(activity, {"instagram": "sometimes", "facebook": "regular"})
        activity = self.put({"activity": {"instagram": None}}).json()["business"]["owner_context"]["activity"]
        self.assertEqual(activity, {"facebook": "regular"})

    def test_empty_body_changes_nothing(self):
        before = self.signup()
        response = self.put({})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["business"]["owner_context"], before["owner_context"])

    def test_business_without_owner_context_gets_the_full_shape(self):
        business = Business(user_id=self.owner.id, name="סטודיו", business_type="אחר", offerings="עיצוב")
        business.scraped_profile_json = json.dumps({"growth_hypothesis": "ההשערה"}, ensure_ascii=False)
        self.db.add(business)
        self.db.commit()
        context = self.put({"seasons": {"busy": [4], "slow": []}}).json()["business"]["owner_context"]
        self.assertEqual(
            context,
            {
                "differentiator": "",
                "seasons": {"busy": [4], "slow": []},
                "activity": {},
                "tried": {"channels": [], "what_worked": ""},
                "competitors": [],
            },
        )
        self.assertEqual(self.stored()["growth_hypothesis"], "ההשערה")

    def test_no_business_is_400(self):
        response = self.put({"seasons": {"busy": [1], "slow": []}})
        self.assertEqual(response.status_code, 400)
        self.assertRegex(response.json()["detail"], "[א-ת]")

    # validation ------------------------------------------------------------------------

    def test_invalid_input_is_a_hebrew_422_and_changes_nothing(self):
        self.signup()
        before = self.business().scraped_profile_json
        cases = {
            "גם עמוס וגם שקט": {"seasons": {"busy": [5], "slow": [5]}},
            "בין 1 ל-12": {"seasons": {"busy": [13], "slow": []}},
            "מתוך הרשימה": {"tried": {"channels": ["billboards"]}},
            "כמה אתם מפרסמים": {"activity": {"instagram": "daily"}},
            "עד 3 מתחרים": {"competitors": [{"name": f"מתחרה {i}"} for i in range(4)]},
            "הקישור של מישהו": {"competitors": [{"name": "מישהו", "link": "https://tiktok.com/video/1"}]},
            "לא תקין": ["not", "an", "object"],
        }
        for expected, body in cases.items():
            with self.subTest(expected=expected):
                response = self.put(body)
                self.assertEqual(response.status_code, 422, response.text)
                detail = response.json()["detail"]
                self.assertIsInstance(detail, str)
                self.assertIn(expected, detail)
                self.assertNotIn("Value error", detail)
                self.assertRegex(detail, "[א-ת]")
                self.assertNotRegex(detail, "Input should|Field required|List should")
        self.assertEqual(self.business().scraped_profile_json, before)

    # merge -----------------------------------------------------------------------------

    def test_merge_keeps_the_seed_hypothesis_and_other_decisions(self):
        self.signup()
        business = self.business()
        stored = loads(business.scraped_profile_json, {})
        stored["diagnostics"] = {"has_customer_club": "no"}
        stored["growth_targets"] = ["יותר קונים בשישי"]
        business.scraped_profile_json = json.dumps(stored, ensure_ascii=False)
        self.db.commit()
        before = self.stored()

        self.put({"seasons": {"busy": [3], "slow": [8]}, "differentiator": "מחמצת", "tried": {"channels": ["google"]}})
        after = self.stored()
        for key in ("first_month_seed", "growth_hypothesis", "brand_language", "brand_source", "diagnostics", "growth_targets"):
            self.assertEqual(after.get(key), before.get(key), key)
        self.assertTrue(after["growth_hypothesis"].startswith(DIRECTION["title"]))
        self.assertEqual(after["owner_context"]["seasons"], {"busy": [3], "slow": [8]})

    # competitors -----------------------------------------------------------------------

    def test_competitors_sync_to_where_the_planner_reads_them(self):
        me = self.signup()
        self.assertEqual(me["instagram_handles"], ["abulafia_bakery"])
        # A peer account the owner added on the Instagram screen, not from a competitor.
        business = self.business()
        business.instagram_handles_json = json.dumps(["abulafia_bakery", "peer_one"])
        self.db.commit()

        response = self.put(
            {
                "competitors": [
                    {"name": "לחמים", "link": "lehamim.co.il"},
                    {"name": "מאפייה חדשה", "link": "@New_Bakery"},
                    {"name": "אנחנו", "link": "@pishpeshim_bakery"},  # the owner's own account
                ]
            }
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()["business"]
        self.assertEqual(
            payload["competitors"],
            [
                {"name": "לחמים", "website_url": "https://lehamim.co.il"},
                {"name": "מאפייה חדשה", "website_url": ""},
                {"name": "אנחנו", "website_url": ""},
            ],
        )
        # abulafia came from a competitor that is gone; peer_one was added elsewhere and stays.
        self.assertEqual(payload["instagram_handles"], ["peer_one", "new_bakery"])
        self.assertEqual(
            payload["owner_context"]["competitors"][1],
            {"name": "מאפייה חדשה", "kind": "instagram", "link": "https://www.instagram.com/new_bakery/"},
        )

    def test_duplicate_competitor_names_collapse(self):
        self.signup()
        payload = self.put({"competitors": [{"name": "לחמים"}, {"name": "לחמים "}]}).json()["business"]
        self.assertEqual(payload["competitors"], [{"name": "לחמים", "website_url": ""}])

    def test_clearing_competitors_clears_the_list(self):
        self.signup()
        payload = self.put({"competitors": []}).json()["business"]
        self.assertEqual(payload["competitors"], [])
        self.assertEqual(payload["owner_context"]["competitors"], [])
        self.assertEqual(payload["instagram_handles"], [])


if __name__ == "__main__":
    unittest.main()
