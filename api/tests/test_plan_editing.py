"""Actual owner edit/save/reload, conflict recovery and future generation inputs."""
import _test_env  # noqa: F401

import shutil
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Audience, Business, GenerationJob, Recommendation, Strategy, User
from app.routers.onboarding import _first_month_payload
from app.routers.strategy import serialize_strategy
from app.services import plan_editing, recommendation_context, strategy_reveal
from app.services.jsonutil import dumps, loads
from app.services.strategy import _owner_block, write_week_posts


class PlanEditTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-plan-edit-"))
        self.engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, autoflush=False)()
        self.addCleanup(self.cleanup)
        self.owner = User(email="owner@example.com", password_hash="x", full_name="דוגמה")
        self.other = User(email="other@example.com", password_hash="x", full_name="דוגמה")
        self.db.add_all([self.owner, self.other]); self.db.flush()
        self.quarter = {"strategy": {"one_liner_he": "לקדם הזמנות מראש", "angle_he": "עונת החגים", "why_he": "כיוון מקורי"},
                        "audiences": [{"name": "שכנים", "role": "primary", "message_he": "מקומי"}],
                        "assumptions": [{"bet_he": "מארזים יעזרו להזמנות", "if_wrong_he": "נבדוק חלות"}],
                        "budget": {"range": "3k-7k", "monthly_ils": None}, "numbers": {"range": [3000, 7000]},
                        "measures": [{"name_he": "הזמנות"}], "kpi": {"target": "20–30"}}
        seed = {"strategy": {"objective": {"text_he": "ישן", "kind": "orders"}, "pillars": [{"key": "old", "title": "טקטיקה קודמת"}], "cadence": {"key": "1-2"}, "measures": [{"key": "orders"}], "month_plan": [{"week": 1, "focus_he": "טקטיקה קודמת"}], "success": {"owner_target": "20–30"}}, "direction": {"approach_he": "ישן"}, "posts": [{"title": "דוגמה בכיוון הקודם", "caption": "קודם"}]}
        self.profile = {"quarter_plan": self.quarter, "first_month_seed": seed, "brand_language": {"business_name": "דוגמה"},
                        "owner_context": {"season": "קיץ"}, "long_horizon_plan": {"hypothesis": "ישן", "targets": ["20–30"]}}
        self.business = Business(user_id=self.owner.id, name="עסק לדוגמה", scraped_profile_json=dumps(self.profile))
        self.foreign = Business(user_id=self.other.id, name="עסק אחר", scraped_profile_json=dumps(self.profile))
        self.db.add_all([self.business, self.foreign]); self.db.flush()
        self.audience = Audience(business_id=self.business.id, name="שכנים", is_primary=1, priority="primary")
        self.db.add(self.audience); self.db.flush()
        self.posts = [{"uid": "owned-p1", "title": "פוסט קיים", "caption": "כבר פורסם", "week": 1,
                       "published_at": "2026-09-20T08:00:00", "audience_id": self.audience.id, "audience_name": "שכנים", "approval_status": "approved"}]
        self.core = {"summary": "ישן", "posts": self.posts, "monthly_horizon_plan": {"hypothesis": "ישן", "targets": ["20–30"], "goal_he": "הזמנות"},
                     "long_horizon_plan": {"hypothesis": "ישן", "targets": ["20–30"]}, "weekly_breakdown": [{"week": 1, "focus": "מארזים"}]}
        self.strategy = Strategy(business_id=self.business.id, year=date.today().year, month=date.today().month,
                                 roadmap_json=dumps({"roadmap": self.core, "posts_status": {"1": "done"}}), usp_json=dumps({"growth_hypothesis": "ישן"}))
        self.db.add(self.strategy); self.db.commit()
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.owner
        self.client = TestClient(app)

    def cleanup(self):
        app.dependency_overrides.clear()
        self.db.close(); self.engine.dispose(); shutil.rmtree(self.tmp, ignore_errors=True)

    def current(self):
        response = self.client.get("/strategy/edit")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def edit(self, **kwargs):
        current = self.current()
        return {"version": current["version"], **current["fields"], "direction": " לעזור לבחור מארז למתנה ", "audience": "קונים מתנה", **kwargs}

    def test_save_updates_real_plan_and_preserves_numbers_and_published_posts(self):
        result = self.client.patch("/strategy/edit", json=self.edit()).json()
        self.assertEqual(result["revision"], 1)
        self.assertEqual(result["fields"]["direction"], "לעזור לבחור מארז למתנה")
        self.db.refresh(self.business); self.db.refresh(self.strategy)
        stored = loads(self.business.scraped_profile_json, {})
        core = loads(self.strategy.roadmap_json, {})["roadmap"]
        self.assertEqual(core["posts"], self.posts)
        self.assertEqual(core["monthly_horizon_plan"]["targets"], ["20–30"])
        self.assertEqual(stored["plan_before_owner_edit"], self.quarter)
        for key in ("budget", "numbers", "kpi", "measures"):
            self.assertEqual(stored["quarter_plan"][key], self.quarter[key])
        self.assertEqual(stored["first_month_seed"]["strategy"]["objective"]["kind"], "orders")
        self.assertEqual(core["monthly_horizon_plan"]["hypothesis"], result["fields"]["direction"])
        self.assertTrue(result["saved_at"])
        self.assertEqual(self.current(), result)
        self.assertEqual(self.client.get("/strategy/current").json()["plan_revision"], 1)
        self.assertEqual(self.client.get("/strategy/quarter").json()["quarter_plan"]["strategy"]["one_liner_he"], result["fields"]["direction"])
        # A primary segment is created without renaming the one linked to old posts.
        self.db.refresh(self.audience)
        self.assertEqual(self.audience.name, "שכנים")
        self.assertEqual(self.audience.is_primary, 0)
        segments = self.db.query(Audience).filter(Audience.business_id == self.business.id).all()
        self.assertEqual([a.name for a in segments if a.is_primary], ["קונים מתנה"])

    def test_noop_and_second_save_keep_original_audit_and_post_copy(self):
        first = self.current()
        noop = self.client.patch("/strategy/edit", json={"version": first["version"], **first["fields"]}).json()
        self.assertEqual(noop["revision"], 0)
        self.client.patch("/strategy/edit", json=self.edit())
        second = self.client.patch("/strategy/edit", json=self.edit(direction="להציע מתנות לחברות"))
        self.assertEqual(second.json()["revision"], 2)
        self.db.refresh(self.business)
        self.assertEqual(loads(self.business.scraped_profile_json, {})["plan_before_owner_edit"], self.quarter)
        self.assertEqual(loads(self.strategy.roadmap_json, {})["roadmap"]["posts"], self.posts)

    def test_recommendation_is_stale_even_when_month_id_did_not_change(self):
        before = serialize_strategy(self.strategy, self.business)
        basis = recommendation_context.prepare(self.business, before, {})[2]
        rec = Recommendation(id=99, business_id=self.business.id, week_of="2026-10-01", created_at=datetime.utcnow(),
                             suggestions_json=dumps(recommendation_context.bind({"suggestions": [{"title": "הצעה", "action": "לבדוק ניסוח חדש", "action_kind": "post", "post_uid": "owned-p1"}]}, basis, before)))
        self.client.patch("/strategy/edit", json=self.edit())
        result = recommendation_context.serialize(rec, serialize_strategy(self.strategy, self.business), self.business)
        review = result["suggestions"]["suggestions"][0]["review"]
        self.assertEqual(review["status"], "stale")
        self.assertIn("נערכה", review["note_he"])
        self.assertTrue(review["href"].startswith("/strategy?"))

    def test_new_posts_and_plan_prompts_read_owner_edit_in_first_and_later_months(self):
        self.client.patch("/strategy/edit", json=self.edit())
        stored = loads(self.business.scraped_profile_json, {})
        for with_seed in (True, False):
            payload = _first_month_payload(self.db, self.business, stored, with_seed=with_seed)
            self.assertEqual(payload["plan_edit"]["direction"], "לעזור לבחור מארז למתנה")
            self.assertEqual(payload["audiences"][0]["name"], "קונים מתנה")
            block = _owner_block(payload)
            self.assertIn("גובר", block)
            self.assertIn("קונים מתנה", block)
            self.assertIn("נבדוק חלות", block)
            if with_seed:
                self.assertNotIn("posts", payload["first_month_seed"])
                self.assertEqual(stored["first_month_seed_before_owner_edit"]["posts"][0]["title"], "דוגמה בכיוון הקודם")
                fresh_core = {"weekly_breakdown": [{"week": 1, "focus": "מיקוד בכיוון החדש"}]}
                applied = strategy_reveal.apply_strategy_to_core(fresh_core, payload["first_month_seed"])
                self.assertEqual(applied["weekly_breakdown"][0]["focus"], "מיקוד בכיוון החדש")
                self.assertIn("20–30", applied["monthly_horizon_plan"]["targets"])
                self.assertEqual(payload["first_month_seed"]["strategy"]["cadence"], {"key": "1-2"})
                self.assertEqual(payload["first_month_seed"]["strategy"]["pillars"][0]["description_he"], "לעזור לבחור מארז למתנה")
            # Verify the actual post writer gets the updated block, with no provider call.
            with patch("app.services.strategy.strategy_json", return_value=dumps({"posts": [{"title": "חדש", "caption": "דוגמה", "week": 1}] * 2})) as model:
                write_week_posts(payload, {}, self.core, {}, 1)
                self.assertIn("לעזור לבחור מארז למתנה", model.call_args.args[0])

    def test_conflicting_profile_or_post_update_does_not_overwrite_or_partially_save(self):
        for field in ("scraped_profile_json", "roadmap_json"):
            body = self.edit()
            target = self.business if field == "scraped_profile_json" else self.strategy
            prior = getattr(target, field)
            setattr(target, field, dumps({**loads(prior, {}), "another_writer": True}))
            self.db.commit()
            response = self.client.patch("/strategy/edit", json=body)
            self.assertEqual(response.status_code, 409, response.text)
            self.assertEqual(self.current()["revision"], 0)
            self.assertIn("another_writer", loads(getattr(target, field), {}))

    def test_database_conflict_after_validation_rolls_back_profile_edit(self):
        body = self.edit()
        original = self.business.scraped_profile_json
        execute = self.db.execute
        def simulate_race(statement, *args, **kwargs):
            if getattr(getattr(statement, "table", None), "name", None) == "strategies":
                return type("Result", (), {"rowcount": 0})()
            return execute(statement, *args, **kwargs)
        with patch.object(self.db, "execute", side_effect=simulate_race):
            response = self.client.patch("/strategy/edit", json=body)
        self.assertEqual(response.status_code, 409, response.text)
        self.db.refresh(self.business)
        self.assertEqual(self.business.scraped_profile_json, original)

    def test_job_started_after_validation_prevents_the_save(self):
        body = self.edit()
        original = self.business.scraped_profile_json
        execute = self.db.execute
        started = False
        def start_job(statement, *args, **kwargs):
            nonlocal started
            if not started and getattr(getattr(statement, "table", None), "name", None) == "businesses":
                started = True
                with sessionmaker(bind=self.engine)() as other_db:
                    other_db.add(GenerationJob(business_id=self.business.id, status="running"))
                    other_db.commit()
            return execute(statement, *args, **kwargs)
        with patch.object(self.db, "execute", side_effect=start_job):
            response = self.client.patch("/strategy/edit", json=body)
        self.assertEqual(response.status_code, 409, response.text)
        self.db.refresh(self.business)
        self.assertEqual(self.business.scraped_profile_json, original)
        self.assertTrue(self.current()["blocked"])

    def test_running_build_blocks_save_and_stopped_partial_build_is_invalidated(self):
        self.business.generate_state_json = dumps({"stage": "plan", "usp": {"old": True}})
        job = GenerationJob(business_id=self.business.id, status="running")
        self.db.add(job); self.db.commit()
        body = self.edit()
        self.assertTrue(self.current()["blocked"])
        self.assertEqual(self.client.patch("/strategy/edit", json=body).status_code, 409)
        job.status = "failed"; self.db.commit()
        response = self.client.patch("/strategy/edit", json=self.edit())
        self.assertEqual(response.status_code, 200, response.text)
        self.db.refresh(self.business)
        self.assertEqual(self.business.generate_state_json, "")
        self.assertEqual(job.status, "failed")  # Saving never starts a paid build.

    def test_pre_month_and_legacy_accounts_can_edit_but_empty_account_cannot(self):
        self.db.delete(self.strategy); self.db.commit()
        response = self.client.patch("/strategy/edit", json=self.edit())
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIsNone(response.json()["strategy_id"])
        self.business.scraped_profile_json = ""; self.db.commit()
        current = self.current()
        self.assertFalse(current["available"])
        self.assertEqual(self.client.patch("/strategy/edit", json={"version": current["version"], "direction": "x", "audience": "y"}).status_code, 409)
        self.strategy = Strategy(business_id=self.business.id, year=date.today().year, month=date.today().month,
                                 roadmap_json=dumps({"roadmap": {"posts": []}}), usp_json=dumps({"usp_one_liner": "כיוון קודם"}))
        self.db.add(self.strategy); self.db.commit()
        self.assertEqual(self.current()["fields"]["direction"], "כיוון קודם")
        self.assertEqual(self.client.patch("/strategy/edit", json=self.edit()).status_code, 200)

    def test_foreign_version_and_extra_business_id_cannot_edit_another_tenant(self):
        body = self.edit()
        app.dependency_overrides[get_current_user] = lambda: self.other
        self.assertEqual(self.client.patch("/strategy/edit", json=body).status_code, 409)
        own = self.current()
        self.assertEqual(own["business_id"], self.foreign.id)
        self.assertEqual(self.client.patch("/strategy/edit", json={"version": own["version"], **own["fields"], "business_id": self.business.id}).status_code, 422)
        self.db.refresh(self.business)
        self.assertEqual(plan_editing.revision(self.business), 0)

    def test_invalid_fields_have_hebrew_recovery_and_do_not_save(self):
        for values in ({"direction": "  "}, {"audience": "x" * 161}, {"direction": "x" * 301},
                       {"assumptions": [{"bet_he": ""}]}, {"assumptions": [{"bet_he": "x"}] * 5}):
            response = self.client.patch("/strategy/edit", json=self.edit(**values))
            self.assertEqual(response.status_code, 422, response.text)
            self.assertIn("מלאו", response.json()["detail"])
            self.assertEqual(self.current()["revision"], 0)

    def test_five_segments_require_reusing_existing_name_without_deleting_history(self):
        self.db.add_all([Audience(business_id=self.business.id, name=f"קהל {i}") for i in range(4)])
        self.db.commit(); self.db.expire(self.business, ["audiences"])
        blocked = self.client.patch("/strategy/edit", json=self.edit())
        self.assertEqual(blocked.status_code, 422, blocked.text)
        self.assertIn("קהל קיים", blocked.json()["detail"])
        self.assertEqual(self.current()["revision"], 0)
        self.assertEqual(self.client.patch("/strategy/edit", json=self.edit(audience="קהל 2")).status_code, 200)
        self.assertEqual(self.db.query(Audience).filter_by(business_id=self.business.id).count(), 5)


if __name__ == "__main__":
    unittest.main()
