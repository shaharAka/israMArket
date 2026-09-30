"""Tests for the free month's journey (`/trial`, docs/onboarding-v2.md Revision 7 B in the
order of Revision 8) and its foundations (`/business/baseline`, `/business/featured-items`,
`/business/voice-check`).

Hermetic like test_setup: a throwaway SQLite file, no network. Every `done` is asserted
against rows this test wrote — the journey's whole promise is that a tick means the thing
really happened.
"""
import _test_env  # noqa: F401  (must come before any `app` import)

import re
import shutil
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Asset, Business, Integration, PerformanceSnapshot, Strategy, User
from app.services.jsonutil import dumps, loads

HEBREW = re.compile(r"[֐-׿]")

# The journey in order for a business whose plan measures the site and counts on the
# Google business card.
ALL_KEYS = [
    "instagram", "site_data", "whatsapp", "gbp", "baseline",
    "photos", "featured", "voice", "start_posts",
    "approve_first", "publish_first",
    "results", "month_two", "month_review",
]
WEEKS = {
    "instagram": 1, "site_data": 1, "whatsapp": 1, "gbp": 1, "baseline": 1,
    "photos": 2, "featured": 2, "voice": 2, "start_posts": 2,
    "approve_first": 3, "publish_first": 3,
    "results": 4, "month_two": 4, "month_review": 4,
}
# A website and no stored plan: the site counts, the Google card is not asked for.
DEFAULT_KEYS = [key for key in ALL_KEYS if key != "gbp"]

PLAN = {
    "strategy": {"one_liner_he": "לחם של בוקר לשכונה"},
    "kpi": {"key": "online_orders", "name_he": "יותר הזמנות באתר", "needs": ["ga4"]},
    "integrations": [{"key": "ga4"}, {"key": "whatsapp_link"}, {"key": "gbp"}],
    "assumptions": [
        {"bet_he": "אנחנו מניחים שהזמנות מראש לחג יעבדו", "if_wrong_he": "נעבור למבצע בחנות"},
        {"bet_he": "  ", "if_wrong_he": ""},
        {"bet_he": "רילס מהתנור יביא עוקבים חדשים", "if_wrong_he": "נחזור לתמונות"},
    ],
}


def post(week: int, approved: bool = False, published: bool = False) -> dict:
    return {
        "title": f"פוסט שבוע {week}",
        "week": week,
        "approval_status": "approved" if approved else "review",
        "approved_at": datetime.utcnow().isoformat() if approved else None,
        "published_url": "https://instagram.com/p/abc" if published else "",
        "published_at": datetime.utcnow().isoformat() if published else None,
    }


class TrialTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-trial-"))
        self.engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()

        self.owner = User(email="owner@example.com", password_hash="x", full_name="בעלת העסק", trial_started_at=datetime.utcnow())
        self.other = User(email="other@example.com", password_hash="x", full_name="אחר", trial_started_at=datetime.utcnow())
        self.db.add_all([self.owner, self.other])
        self.db.flush()
        self.business = Business(
            user_id=self.owner.id, name="מאפיית תום", website_url="https://bakery.example",
            offerings="חלות, עוגת דבש, לחם מחמצת",
        )
        self.rival = Business(user_id=self.other.id, name="מתחרה", website_url="https://rival.example")
        self.db.add_all([self.business, self.rival])
        self.db.commit()
        self.addCleanup(self._cleanup)

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: self.owner
        self.client = TestClient(app)
        for target in ("app.services.meta.meta_configured", "app.services.ga4.ga4_configured"):
            patcher = patch(target, return_value=True)
            patcher.start()
            self.addCleanup(patcher.stop)

    def _cleanup(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()
        shutil.rmtree(self.tmp, ignore_errors=True)

    # --- helpers ------------------------------------------------------------------

    def payload(self) -> dict:
        response = self.client.get("/trial")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def steps(self, payload: dict | None = None) -> dict:
        payload = payload or self.payload()
        return {step["key"]: step for step in payload["steps"]}

    def status(self, key: str) -> str:
        return self.steps()[key]["status"]

    def save_profile(self, fields: dict) -> None:
        stored = loads(self.business.scraped_profile_json, {}) or {}
        stored.update(fields)
        self.business.scraped_profile_json = dumps(stored)
        self.db.commit()

    def connect(self, provider: str, business: Business | None = None) -> None:
        business = business or self.business
        self.db.add(Integration(business_id=business.id, provider=provider, status="connected", external_id="x", display_name=provider))
        self.db.commit()

    def add_assets(self, count: int, business: Business | None = None) -> None:
        business = business or self.business
        for index in range(count):
            self.db.add(Asset(business_id=business.id, filename=f"asset-{index}.png", mime="image/png"))
        self.db.commit()

    def add_month(self, posts: list[dict], year: int | None = None, month: int | None = None, business: Business | None = None) -> None:
        business = business or self.business
        today = date.today()
        self.db.add(Strategy(
            business_id=business.id, year=year or today.year, month=month or today.month,
            usp_json=dumps({}), calendar_json=dumps({}), roadmap_json=dumps({"roadmap": {"posts": posts}}),
        ))
        self.db.commit()

    def add_snapshot(self, business: Business | None = None) -> None:
        business = business or self.business
        self.db.add(PerformanceSnapshot(business_id=business.id, period_start="2026-09-01", period_end="2026-09-28"))
        self.db.commit()

    def post_json(self, path: str, body: dict | None = None, method: str = "POST") -> dict:
        response = self.client.request(method, path, json=body)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def foundations(self) -> None:
        """Week 2's three foundations, through their own endpoints."""
        self.add_assets(3)
        self.post_json("/business/featured-items", {"items": [{"name": n} for n in ("חלות", "עוגת דבש", "מחמצת")]}, "PUT")
        self.post_json("/business/voice-check", {"ok": True}, "PUT")

    def start_days_ago(self, days: int) -> None:
        self.owner.trial_started_at = datetime.utcnow() - timedelta(days=days)
        self.db.commit()

    # --- shape --------------------------------------------------------------------

    def test_a_fresh_account_is_on_day_one_with_measurement_first(self):
        payload = self.payload()
        self.assertEqual((payload["day"], payload["days_total"], payload["week"]), (1, 30, 1))
        self.assertIs(payload["ended"], False)
        self.assertIsNone(payload["welcomed_at"])
        self.assertEqual(payload["next_key"], "instagram")
        self.assertEqual(payload["done"], 0)
        self.assertEqual([week["title_he"] for week in payload["weeks"]], ["מדידה", "חומרי גלם", "תוכן ראשון", "מודדים ומתאימים"])
        started = datetime.fromisoformat(payload["started_at"])
        self.assertEqual(datetime.fromisoformat(payload["ends_at"]) - started, timedelta(days=30))

    def test_every_step_carries_hebrew_copy_a_week_and_minutes(self):
        self.save_profile({"quarter_plan": PLAN})
        for step in self.payload()["steps"]:
            self.assertEqual(step["week"], WEEKS[step["key"]], step["key"])
            self.assertIn(step["status"], ("todo", "done", "locked", "soon"))
            self.assertGreater(step["minutes"], 0)
            for field in ("title_he", "why_he", "action_he"):
                self.assertRegex(step[field], HEBREW, f"{step['key']}.{field}")
            self.assertTrue(step["href"].startswith("/"), step["key"])
            if step["status"] in ("locked", "soon"):
                self.assertRegex(step.get("note_he", ""), HEBREW, step["key"])

    def test_the_order_is_foundations_first(self):
        self.assertEqual([step["key"] for step in self.payload()["steps"]], DEFAULT_KEYS)
        self.save_profile({"quarter_plan": PLAN})
        keys = [step["key"] for step in self.payload()["steps"]]
        self.assertEqual(keys, ALL_KEYS)
        self.assertEqual([WEEKS[k] for k in keys], sorted(WEEKS[k] for k in keys))

    def test_posts_wait_for_the_foundations(self):
        steps = self.steps()
        for key in ("start_posts", "approve_first", "publish_first", "results", "month_two", "month_review"):
            self.assertEqual(steps[key]["status"], "locked", key)

    def test_requires_authentication(self):
        app.dependency_overrides.pop(get_current_user, None)
        self.assertEqual(self.client.get("/trial").status_code, 401)
        self.assertEqual(self.client.post("/trial/welcomed").status_code, 401)
        self.assertEqual(self.client.post("/trial/seen", json={"what": "results"}).status_code, 401)
        self.assertEqual(self.client.post("/trial/confirm", json={"what": "gbp"}).status_code, 401)
        self.assertEqual(self.client.get("/business/featured-items").status_code, 401)

    # --- the day --------------------------------------------------------------------

    def test_the_day_counts_from_the_trial_start(self):
        self.start_days_ago(3)
        self.assertEqual((self.payload()["day"], self.payload()["week"]), (4, 1))
        self.start_days_ago(9)
        self.assertEqual(self.payload()["week"], 2)
        self.start_days_ago(28)
        payload = self.payload()
        self.assertEqual((payload["day"], payload["week"], payload["ended"]), (29, 4, False))

    def test_after_thirty_days_the_trial_has_ended(self):
        self.start_days_ago(40)
        payload = self.payload()
        self.assertEqual((payload["day"], payload["ended"]), (30, True))

    def test_an_account_from_before_the_trial_starts_when_it_was_created(self):
        self.owner.trial_started_at = None
        self.owner.created_at = datetime.utcnow() - timedelta(days=5)
        self.db.commit()
        self.assertEqual(self.payload()["day"], 6)

    def test_signup_starts_the_trial(self):
        app.dependency_overrides.pop(get_current_user, None)
        response = self.client.post("/auth/register", json={"email": "new@example.com", "password": "long-enough-1"})
        self.assertEqual(response.status_code, 200, response.text)
        user = self.db.query(User).filter(User.email == "new@example.com").one()
        self.assertLess(abs((datetime.utcnow() - user.trial_started_at).total_seconds()), 60)

    # --- week 1 · measurement -----------------------------------------------------------

    def test_instagram_is_done_only_when_connected(self):
        self.db.add(Integration(business_id=self.business.id, provider="meta", status="select_page"))
        self.db.commit()
        self.assertEqual(self.status("instagram"), "todo")
        self.db.query(Integration).delete()
        self.connect("meta")
        step = self.steps()["instagram"]
        self.assertEqual(step["status"], "done")
        self.assertEqual(self.payload()["next_key"], "site_data")

    def test_a_server_without_the_meta_app_says_soon(self):
        with patch("app.services.meta.meta_configured", return_value=False):
            step = self.steps()["instagram"]
        self.assertEqual(step["status"], "soon")
        self.assertRegex(step["note_he"], HEBREW)

    def test_site_data_follows_the_plan(self):
        self.save_profile({"quarter_plan": PLAN, "integrations_checklist": [{"key": "whatsapp_link"}]})
        self.assertNotIn("site_data", self.steps())
        self.save_profile({"integrations_checklist": [{"key": "ga4"}, {"key": "whatsapp_link"}]})
        step = self.steps()["site_data"]
        self.assertEqual(step["status"], "todo")
        self.assertIn("יותר הזמנות באתר", step["why_he"])
        self.connect("ga4")
        self.assertEqual(self.status("site_data"), "done")

    def test_no_website_and_no_plan_means_no_site_step(self):
        self.business.website_url = ""
        self.db.commit()
        self.assertNotIn("site_data", self.steps())

    def test_the_whatsapp_step_is_the_number(self):
        self.assertEqual(self.status("whatsapp"), "todo")
        self.business.whatsapp_number_e164 = "+972501234567"
        self.db.commit()
        self.assertEqual(self.status("whatsapp"), "done")
        self.assertIn("whatsapp", self.payload()["measurement"]["connected"])

    def test_the_google_card_is_confirmed_by_the_owner(self):
        self.save_profile({"quarter_plan": PLAN})
        self.assertEqual(self.status("gbp"), "todo")
        first = self.steps(self.post_json("/trial/confirm", {"what": "gbp"}))["gbp"]
        self.assertEqual(first["status"], "done")
        again = self.steps(self.post_json("/trial/confirm", {"what": "gbp"}))["gbp"]
        self.assertEqual(again["done_at"], first["done_at"])

    def test_the_baseline_from_the_owner_or_from_the_numbers(self):
        self.assertEqual(self.status("baseline"), "todo")
        form = self.client.get("/business/baseline").json()
        self.assertEqual([f["key"] for f in form["fields"]], ["orders_month", "avg_order_ils"])
        self.assertIs(form["from_integrations"], False)
        saved = self.post_json("/business/baseline", {"orders_month": None, "avg_order_ils": None}, "PUT")
        self.assertEqual(self.status("baseline"), "todo", "all 'not sure' is not a baseline")
        saved = self.post_json("/business/baseline", {"orders_month": 40, "avg_order_ils": 180, "close_rate": 30}, "PUT")
        self.assertEqual(saved["baseline"], {"orders_month": 40, "avg_order_ils": 180})
        self.assertEqual(self.status("baseline"), "done")
        self.assertIs(self.payload()["measurement"]["baseline"], True)

    def test_measured_numbers_are_a_baseline_too(self):
        self.connect("ga4")
        self.add_snapshot()
        payload = self.payload()
        self.assertEqual(self.steps(payload)["baseline"]["status"], "done")
        self.assertIs(payload["measurement"]["has_numbers"], True)
        self.assertIs(self.client.get("/business/baseline").json()["from_integrations"], True)

    def test_a_service_business_is_asked_service_numbers(self):
        self.business.business_model = "services"
        self.db.commit()
        keys = [f["key"] for f in self.client.get("/business/baseline").json()["fields"]]
        self.assertEqual(keys, ["inquiries_month", "close_rate", "deal_value_ils"])
        self.assertEqual(self.steps()["featured"]["title_he"], "לבחור אילו שירותים לקדם")
        self.assertEqual(self.client.put("/business/baseline", json={"close_rate": 140}).status_code, 422)

    # --- week 2 · raw materials ---------------------------------------------------------

    def test_photos_need_three(self):
        self.add_assets(2)
        step = self.steps()["photos"]
        self.assertEqual(step["status"], "todo")
        self.assertIn("2", step["why_he"])
        self.add_assets(1)
        self.assertEqual(self.status("photos"), "done")

    def test_featured_items_keep_the_owners_order_and_reasons(self):
        empty = self.client.get("/business/featured-items").json()
        self.assertEqual(empty["items"], [])
        self.assertEqual(empty["kind_he"], "מוצרים")
        self.assertEqual(empty["suggestions"], ["חלות", "עוגת דבש", "לחם מחמצת"])
        self.assertEqual([r["label_he"] for r in empty["reasons"]], ["במלאי", "רווחי", "עונתי", "חדש", "הכי נמכר"])
        saved = self.post_json("/business/featured-items", {"items": [
            {"name": "  עוגת   דבש ", "reason": "seasonal"},
            {"name": "חלות", "reason": "best_seller", "note": "לשישי"},
        ]}, "PUT")
        self.assertEqual([(i["name"], i["priority"], i["reason"]) for i in saved["items"]],
                         [("עוגת דבש", 1, "seasonal"), ("חלות", 2, "best_seller")])
        self.assertEqual(saved["suggestions"], ["לחם מחמצת"])
        step = self.steps()["featured"]
        self.assertEqual(step["status"], "todo")
        self.assertIn("2", step["why_he"])
        self.post_json("/business/featured-items", {"items": [{"name": n} for n in ("א׳", "ב׳", "ג׳")]}, "PUT")
        self.assertEqual(self.status("featured"), "done")

    def test_featured_items_are_validated(self):
        too_many = {"items": [{"name": f"מוצר {i}"} for i in range(11)]}
        self.assertEqual(self.client.put("/business/featured-items", json=too_many).status_code, 422)
        self.assertEqual(self.client.put("/business/featured-items", json={"items": [{"name": "x", "reason": "cheap"}]}).status_code, 422)
        self.assertEqual(self.client.put("/business/featured-items", json={"items": [{"name": "   "}]}).status_code, 422)

    def test_the_voice_check(self):
        self.save_profile({"brand_language": {"voice": "חם ופשוט", "voice_examples": ["בוקר טוב מהתנור", "חלות חמות", "שלישי"]}})
        voice = self.client.get("/business/voice-check").json()
        self.assertEqual(voice["voice_he"], "חם ופשוט")
        self.assertEqual(voice["examples_he"], ["בוקר טוב מהתנור", "חלות חמות"])
        self.assertIsNone(voice["check"])
        saved = self.post_json("/business/voice-check", {"ok": False, "note": "פחות רשמי"}, "PUT")
        self.assertEqual((saved["check"]["ok"], saved["check"]["note"]), (False, "פחות רשמי"))
        self.assertEqual(self.status("voice"), "done")

    def test_starting_the_posts_waits_for_the_foundations(self):
        self.add_assets(3)
        self.assertEqual(self.status("start_posts"), "locked")
        self.foundations()
        step = self.steps()["start_posts"]
        # The generation work's POST /onboarding/posts/start is not on this server yet.
        if not any(getattr(r, "path", "") == "/onboarding/posts/start" for r in app.routes):
            self.assertEqual(step["status"], "soon")

        def start_posts() -> dict:  # a stand-in for the generation work's endpoint
            return {"ok": True}

        app.add_api_route("/onboarding/posts/start", start_posts, methods=["POST"])
        self.addCleanup(lambda: app.router.routes.pop())
        self.assertEqual(self.status("start_posts"), "todo")
        self.add_month([post(1)])
        self.assertEqual(self.status("start_posts"), "done")

    def test_asking_for_the_posts_counts_while_they_are_written(self):
        self.foundations()
        self.add_month([])  # Revision 8: the month's structure, no posts yet
        self.assertEqual(self.status("start_posts"), "todo")
        self.assertEqual(self.status("approve_first"), "locked")
        step = self.steps(self.post_json("/trial/confirm", {"what": "posts_started"}))["start_posts"]
        self.assertEqual(step["status"], "done")
        self.assertTrue(step["done_at"])

    # --- week 3 · first content ---------------------------------------------------------

    def test_approving_the_first_posts_then_publishing(self):
        self.add_month([post(1), post(1), post(2)])
        steps = self.steps()
        self.assertEqual(steps["approve_first"]["status"], "todo")
        self.assertIn("2", steps["approve_first"]["why_he"])
        self.assertEqual(steps["publish_first"]["status"], "locked")
        self.assertEqual(steps["month_two"]["status"], "todo")

        self.db.query(Strategy).delete()
        self.add_month([post(1, approved=True), post(1), post(2)])
        steps = self.steps()
        self.assertEqual(steps["approve_first"]["status"], "todo")
        self.assertEqual(steps["publish_first"]["status"], "todo")
        self.assertEqual(steps["publish_first"]["href"], "/posts?post=0")

        self.db.query(Strategy).delete()
        self.add_month([post(1, approved=True, published=True), post(1, approved=True), post(2)])
        steps = self.steps()
        self.assertEqual(steps["approve_first"]["status"], "done")
        self.assertEqual(steps["publish_first"]["status"], "done")
        self.assertEqual(steps["results"]["status"], "todo")

    def test_a_month_without_week_numbers_takes_its_first_quarter(self):
        posts = [post(1) for _ in range(8)]
        for item in posts:
            item.pop("week")
        for item in posts[:2]:
            item["approval_status"] = "approved"
        self.add_month(posts)
        self.assertEqual(self.status("approve_first"), "done")

    # --- week 4 · measure and adjust ------------------------------------------------------

    def test_results_count_only_after_a_published_post(self):
        self.post_json("/trial/seen", {"what": "results"})
        self.assertEqual(self.status("results"), "locked")
        self.add_month([post(1, approved=True, published=True)])
        self.assertEqual(self.status("results"), "todo")
        self.assertEqual(self.steps(self.post_json("/trial/seen", {"what": "results"}))["results"]["status"], "done")

    def test_the_month_review_opens_on_day_22(self):
        self.add_month([post(1)])
        self.start_days_ago(10)
        self.post_json("/trial/seen", {"what": "results"})
        step = self.steps()["month_review"]
        self.assertEqual(step["status"], "locked")
        self.assertIn("22", step["note_he"])
        self.start_days_ago(21)
        self.assertEqual(self.status("month_review"), "todo")
        self.assertEqual(self.steps(self.post_json("/trial/seen", {"what": "results"}))["month_review"]["status"], "done")

    def test_month_two_is_a_second_month(self):
        today = date.today()
        self.add_month([post(1)])
        self.assertEqual(self.status("month_two"), "todo")
        year, month = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)
        self.add_month([post(1)], year=year, month=month)
        self.assertEqual(self.status("month_two"), "done")

    def test_seen_and_confirm_reject_other_values(self):
        self.assertEqual(self.client.post("/trial/seen", json={"what": "posts"}).status_code, 422)
        self.assertEqual(self.client.post("/trial/confirm", json={"what": "everything"}).status_code, 422)

    # --- hypotheses, next, counts ---------------------------------------------------------

    def test_hypotheses_come_from_the_plan_and_default_to_measuring(self):
        self.assertEqual(self.payload()["hypotheses"], [])
        self.save_profile({"quarter_plan": PLAN, "hypothesis_status": {"2": "confirmed", "0": "bogus"}})
        hypotheses = self.payload()["hypotheses"]
        self.assertEqual([h["status_he"] for h in hypotheses], ["נמדדת", "אושרה"])
        self.assertEqual(hypotheses[0]["if_wrong_he"], "נעבור למבצע בחנות")

    def test_next_skips_what_cannot_be_done_yet(self):
        self.connect("meta")
        self.connect("ga4")
        self.business.whatsapp_number_e164 = "+972501234567"
        self.db.commit()
        self.post_json("/business/baseline", {"orders_month": 40}, "PUT")
        self.assertEqual(self.payload()["next_key"], "photos")

    def test_soon_steps_are_not_counted(self):
        with patch("app.services.meta.meta_configured", return_value=False):
            payload = self.payload()
        soon = sum(1 for step in payload["steps"] if step["status"] == "soon")
        self.assertGreater(soon, 0)
        self.assertEqual(payload["total"], len(payload["steps"]) - soon)

    def test_the_welcome_is_stored_once(self):
        first = self.client.post("/trial/welcomed").json()["welcomed_at"]
        self.assertTrue(first)
        self.assertEqual(self.client.post("/trial/welcomed").json()["welcomed_at"], first)
        self.assertEqual(self.payload()["welcomed_at"], first)

    # --- one source with /setup -------------------------------------------------------

    def test_setup_and_trial_agree(self):
        self.connect("meta")
        self.add_assets(3)
        self.add_month([post(1, approved=True, published=True)])
        setup = {item["key"]: item for group in self.client.get("/setup").json()["groups"] for item in group["items"]}
        steps = self.steps()
        self.assertIs(setup["instagram"]["done"], True)
        self.assertEqual(steps["instagram"]["status"], "done")
        self.assertIs(setup["media"]["done"], True)
        self.assertEqual(steps["photos"]["status"], "done")
        self.assertIs(setup["publish"]["done"], True)
        self.assertEqual(steps["publish_first"]["status"], "done")
        self.assertIs(setup["google"]["done"], False)
        self.assertEqual(steps["site_data"]["status"], "todo")

    def test_another_business_rows_never_count(self):
        self.connect("meta", self.rival)
        self.add_assets(5, self.rival)
        self.add_snapshot(self.rival)
        self.add_month([post(1, approved=True, published=True)], business=self.rival)
        steps = self.steps()
        for key in ("instagram", "photos", "baseline"):
            self.assertEqual(steps[key]["status"], "todo", key)
        self.assertEqual(steps["approve_first"]["status"], "locked")


if __name__ == "__main__":
    unittest.main()
