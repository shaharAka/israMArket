"""Five isolated persona accounts for real-backend browser QA; offline and throwaway DB."""

import _test_env  # noqa: F401  (must come before any `app` import)

import shutil
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Asset, Business, Strategy
from app.services import billing, connected_posts
from app.services.images import media_root
from app.services.jsonutil import loads
from _qa_personas import QA_PASSWORD, personas, seed_personas


class QaPersonaFixtureTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-qa-personas-test-"))
        self.engine = create_engine(f"sqlite:///{self.tmp / 'personas.sqlite'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False, autocommit=False)
        self.old_overrides = dict(app.dependency_overrides)
        self.old_billing_enforce = billing.paypal.settings().billing_enforce
        billing.paypal.settings().billing_enforce = True
        self.old_paypal_configured = billing.paypal.configured
        billing.paypal.configured = lambda: True

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides.pop(get_current_user, None)
        self.client = TestClient(app)
        self.cases = seed_personas(self.db)

    def tearDown(self):
        self.client.close()
        self.db.close()
        self.engine.dispose()
        app.dependency_overrides.clear()
        app.dependency_overrides.update(self.old_overrides)
        billing.paypal.configured = self.old_paypal_configured
        billing.paypal.settings().billing_enforce = self.old_billing_enforce
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_five_fictional_accounts_edit_campaign_and_keep_results_unknown(self):
        self.assertEqual({case["id"] for case in self.cases}, {case["id"] for case in personas()})
        seen_businesses = set()
        for case in self.cases:
            with self.subTest(persona=case["id"]):
                login = self.client.post("/auth/login", json={"email": case["email"], "password": QA_PASSWORD})
                self.assertEqual(login.status_code, 200, login.text)
                self.assertEqual(login.json()["full_name"], case["name"])

                business = self.client.get("/onboarding/me")
                self.assertEqual(business.status_code, 200, business.text)
                self.assertEqual(business.json()["business"]["name"], case["name"])
                business_id = business.json()["business"]["id"]
                self.assertNotIn(business_id, seen_businesses)
                seen_businesses.add(business_id)

                current = self.client.get("/strategy/current")
                self.assertEqual(current.status_code, 200, current.text)
                posts = current.json()["roadmap"]["posts"]
                self.assertEqual(len(posts), 1)
                self.assertEqual(posts[0]["uid"], case["post"]["uid"])
                self.assertEqual(posts[0]["caption"], case["post"]["caption"])
                self.assertEqual(posts[0]["approval_status"], "review")
                self.assertFalse(posts[0]["published_url"])
                self.assertIsNone(posts[0].get("results"))
                self.assertEqual(posts[0]["measure"]["metric"], "reach")
                self.assertEqual(posts[0]["plan_link"]["goal"], case["plan"]["kpi_name"])
                self.assertEqual(posts[0]["plan_link"]["week_focus"], case["plan"]["week_focus"])
                self.assertEqual(current.json()["monthly_horizon_plan"]["hypothesis"], case["plan"]["hypothesis"])
                self.assertEqual(current.json()["monthly_horizon_plan"]["targets"], case["plan"]["targets"])
                self.assertEqual(len(current.json()["monthly_horizon_plan"]["targets"]), 3)
                self.assertEqual(current.json()["quarter_plan"]["kpi"]["key"], case["plan"]["kpi"])
                self.assertEqual(current.json()["weekly_breakdown"][0]["focus"], case["plan"]["week_focus"])

                audiences = self.client.get("/audiences")
                self.assertEqual(audiences.status_code, 200, audiences.text)
                self.assertEqual([item["name"] for item in audiences.json()["audiences"]], [case["audience"]["name"]])

                # Editing remains available in the read-only results lifecycle, including
                # after trial expiry. There are no invented impressions, clicks or sales.
                updated_caption = f"{case['post']['caption']} ניסוח בדיקה {case['id']}"
                saved = self.client.post("/strategy/posts/save", json={
                    "post_index": 0,
                    "title": case["post"]["title"],
                    "format": case["post"]["format"],
                    "hook": case["post"]["hook"],
                    "caption": updated_caption,
                    "cta": case["post"]["cta"],
                    "primary_outlet": case["post"]["channel"],
                    "outlets": [case["post"]["channel"]],
                    "has_overlay": False,
                })
                self.assertEqual(saved.status_code, 200, saved.text)
                refreshed = self.client.get("/strategy/current")
                self.assertEqual(refreshed.json()["roadmap"]["posts"][0]["caption"], updated_caption)

                performance = self.client.get("/performance/latest")
                self.assertEqual(performance.status_code, 200, performance.text)
                self.assertFalse(performance.json()["available"])
                self.assertEqual(performance.json()["measured_posts"], {"items": [], "waiting": 0})

                trial = self.client.get("/trial")
                self.assertEqual(trial.status_code, 200, trial.text)
                self.assertFalse(trial.json()["measurement"]["has_numbers"])
                self.assertEqual(trial.json()["ended"], case["state"]["trial"] == "expired")

                setup = self.client.get("/setup")
                self.assertEqual(setup.status_code, 200, setup.text)
                self.assertIsInstance(setup.json()["groups"], list)

                allowance = self.client.get("/billing/media-allowance")
                self.assertEqual(allowance.status_code, 200, allowance.text)
                expected_remaining = 0 if case["state"]["images"] == "exhausted" else 20
                self.assertEqual(allowance.json()["images"]["remaining"], expected_remaining)

                generation = self.client.get("/onboarding/generate/status")
                self.assertEqual(generation.status_code, 200, generation.text)
                self.assertEqual(generation.json()["status"], case["state"]["generation"])

                billing = self.client.get("/billing/status")
                self.assertEqual(billing.status_code, 200, billing.text)
                self.assertEqual(billing.json()["state"], "trial_ended" if case["state"]["trial"] == "expired" else "trial")
                self.assertTrue(billing.json()["enforce"])
                if case["state"]["trial"] == "expired":
                    # The endpoint is gated before any generation/provider code runs.
                    self.assertEqual(self.client.post("/audiences/generate").status_code, 402)

    def test_populated_mode_seeds_four_weeks_assets_and_attributed_fixture_metrics(self):
        engine = create_engine(f"sqlite:///{self.tmp / 'populated.sqlite'}")
        Base.metadata.create_all(engine)
        try:
            with Session(engine) as db:
                cases = seed_personas(db, populated=True)
                self.assertEqual({case["id"] for case in cases}, {case["id"] for case in personas()})
                for case in cases:
                    with self.subTest(persona=case["id"]):
                        business = db.get(Business, case["business_id"])
                        strategy = db.query(Strategy).filter_by(business_id=business.id).one()
                        roadmap = loads(strategy.roadmap_json)
                        posts = roadmap["roadmap"]["posts"]
                        self.assertEqual(len(posts), 12)
                        self.assertTrue(all(post["channel"] == post["primary_outlet"] for post in posts))
                        self.assertEqual({post["week"] for post in posts}, {1, 2, 3, 4})
                        for week in range(1, 5):
                            week_posts = [post for post in posts if post["week"] == week]
                            self.assertEqual(len(week_posts), 3)
                            self.assertGreaterEqual(sum(post["approval_status"] == "review" for post in week_posts), 2)
                        self.assertTrue(any(post.get("video_url") for post in posts))
                        self.assertTrue(any(post.get("approval_status") == "approved" for post in posts))
                        published = [post for post in posts if post.get("published_at")]
                        self.assertTrue(published)
                        for post in published:
                            self.assertTrue(post["published_url"].startswith("https://qa-fixture.invalid/"))
                            self.assertEqual(post["results"]["matched_by"], ["qa_fixture"])
                            self.assertTrue(post["results"]["fixture_data"])
                            metric = post["results"]["metric"]
                            self.assertEqual(post["results"]["observations"][metric]["source"], "qa_fixture")
                        self.assertEqual(len({post["title"] for post in posts}), 12)
                        assets = db.query(Asset).filter_by(business_id=business.id).all()
                        self.assertEqual(len(assets), 3)
                        for asset in assets:
                            self.assertTrue((media_root() / str(business.id) / asset.filename).is_file())
                        measured = connected_posts.measured_posts(connected_posts.connect_posts(
                            posts, business_id=business.id, year=strategy.year, month=strategy.month))
                        self.assertEqual(len(measured["items"]), len(published))
                        self.assertEqual({item["matched_by"][0] for item in measured["items"]}, {"qa_fixture"})
                software = next(case for case in cases if case["id"] == "software")
                self.assertEqual(software["name"], "מסלול")
                self.assertIn("פרויקטים", software["offerings"])
        finally:
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
