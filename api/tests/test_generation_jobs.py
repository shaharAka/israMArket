"""Month generation as a server-side job (onboarding-v2.md, Revision 7 A and Revision 8).

The month is built by a background worker, stage by stage, with no browser driving it:
it finishes with no client polling, resumes after a restart, never runs twice for one
business, falls back from a slow Muse call to Gemini, and stops with a visible Hebrew
error after a stage fails twice. After signup it builds the structure only; the posts
are written later, per week, from the owner's picks. Every model call is a fake
answering by schema title.
"""

import _test_env  # noqa: F401  (must come before any `app` import)

import json
import re
import shutil
import tempfile
import threading
import time
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Business, GenerationJob, Strategy, User
from app.services import generation_jobs as jobs
from app.services import meta_model, month_posts, post_model_router
from app.services import strategy as strategy_service
from app.services.jsonutil import dumps, loads

BRAND = {
    "business_name": "מאפיית תום",
    "voice": "חם ושכונתי",
    "do_say": ["טרי"],
    "dont_say": ["הכי"],
    "palette": [],
}

USP = {"usp": "בידול", "usp_one_liner": "משפט", "growth_hypothesis": "השערה"}
CORE = {
    "theme": "חודש ראשון",
    "summary": "סיכום",
    "relevant_events": [],
    "long_horizon_plan": {"hypothesis": "רבעון", "targets": [], "milestones": []},
    "monthly_horizon_plan": {"hypothesis": "החודש", "targets": []},
    "management_and_checkpoints": {"how_we_help": "", "when_we_need_user": [], "checkpoints": []},
    "weekly_breakdown": [{"week": 1, "focus": "פתיחה"}],
}

_WEEKS = re.compile(r"שבועות לכתיבה: \[([\d, ]+)\]")


def weeks_of(prompt: str) -> list[int]:
    match = _WEEKS.search(prompt)
    return [int(w) for w in match.group(1).split(",")] if match else []


def _posts(weeks: list[int]) -> str:
    posts = []
    for week in weeks:
        for n in range(2 if len(weeks) == 1 else 1):
            posts.append(
                {
                    "week": week,
                    "date_hint": "",
                    "format": "image",
                    "title": f"פוסט {week}.{n}",
                    "angle": "זווית",
                    "hook": "פתיחה",
                    "caption": "כיתוב",
                    "cta": "לפרטים",
                    "calendar_tie": "",
                    "goal_fit": "",
                    "why_now": "",
                    "image_prompt": "bakery",
                    "overlay_text": "טרי",
                    "primary_outlet": "instagram",
                    "outlets": ["instagram"],
                    "metrics_to_watch": [],
                    "stat_highlight": "",
                    "outlet_captions": {"instagram": "א", "facebook": "ב", "whatsapp": "ג"},
                    "audience_name": "",
                    "inspiration_refs": [],
                    "inspiration_note": "",
                }
            )
    return json.dumps({"posts": posts}, ensure_ascii=False)


def _raise(message: str):
    def fail(prompt):
        raise RuntimeError(message)

    return fail


class FakeModel:
    """strategy_json by schema title. `posts` / `plan` replace those calls when given."""

    def __init__(self, posts=None, plan=None, delay: float = 0.0):
        self.posts = posts
        self.plan = plan
        self.delay = delay
        self.calls: list[str] = []
        self.prompts: list[str] = []
        self.lock = threading.Lock()

    def __call__(self, prompt, schema):
        title = schema.get("title")
        name = f"MonthlyPosts:{weeks_of(prompt)}" if title == "MonthlyPosts" else title
        with self.lock:
            self.calls.append(name)
            self.prompts.append(prompt)
        if self.delay:
            time.sleep(self.delay)
        if title == "StrategyDefinition":
            return json.dumps(USP, ensure_ascii=False)
        if title == "MonthlyPlanCore":
            return self.plan(prompt) if self.plan else json.dumps(CORE, ensure_ascii=False)
        if title == "MonthlyPosts":
            return self.posts(prompt) if self.posts else _posts(weeks_of(prompt))
        raise AssertionError(f"unexpected model call {title}")

    def count(self, prefix: str) -> int:
        with self.lock:
            return sum(1 for call in self.calls if call.startswith(prefix))


class JobTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-jobs-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        self.addCleanup(self.db.close)
        self.owner = User(email="owner@example.com", password_hash="x", full_name="תום")
        self.db.add(self.owner)
        self.db.commit()
        business = Business(
            user_id=self.owner.id,
            name="מאפיית תום",
            website_url="https://bakery.example",
            business_type="מאפייה",
            offerings="לחם וחלות",
            monthly_budget_ils=0,
            primary_goal="sales",
            competitors_json="[]",
            scraped_profile_json=dumps({"brand_language": BRAND, "extracted": {}, "raw": {}}),
        )
        self.db.add(business)
        self.db.commit()
        self.business_id = business.id

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: self.owner
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app)
        # Nothing waits between retries here, and no job leaks from one test to the next.
        patcher = mock.patch.object(jobs, "RETRY_DELAY_SECONDS", 0.0)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self._drain)

    def _drain(self):
        deadline = time.monotonic() + 10
        while jobs._active and time.monotonic() < deadline:
            time.sleep(0.02)
        jobs._active.clear()

    def threads(self):
        """Run jobs on the real worker threads for this test (tests default to inline)."""
        return mock.patch.object(jobs, "INLINE", False)

    def fresh(self) -> tuple[Business, GenerationJob | None]:
        """The rows as another connection sees them now (detached, fully loaded)."""
        db = self.Session(expire_on_commit=False)
        try:
            business = db.get(Business, self.business_id)
            job = db.query(GenerationJob).filter(GenerationJob.business_id == self.business_id).first()
            db.expunge_all()
            return business, job
        finally:
            db.close()

    def month(self) -> Strategy:
        self.db.expire_all()
        return self.db.query(Strategy).order_by(Strategy.year, Strategy.month).first()

    def wait_for(self, status: str, timeout: float = 10.0) -> GenerationJob:
        """Wait on the database only — no status poll, so nothing is kicked by a client."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            _, job = self.fresh()
            if job is not None and job.status == status and not jobs._running_here(self.business_id):
                return job
            time.sleep(0.05)
        _, job = self.fresh()
        self.fail(f"job never reached {status!r}: {job and (job.kind, job.status, job.error_detail)}")

    def set_state(self, **state):
        business = self.db.get(Business, self.business_id)
        business.generate_state_json = dumps(state) if state else ""
        self.db.commit()

    def build_structure(self):
        with mock.patch.object(strategy_service, "strategy_json", side_effect=FakeModel()):
            body = self.client.post("/onboarding/generate").json()
        self.assertTrue(body["done"], body)
        return body


class StructureFirstTest(JobTestCase):
    def test_signup_builds_the_structure_without_a_client_and_without_posts(self):
        model = FakeModel(delay=0.2)
        with self.threads(), mock.patch.object(strategy_service, "strategy_json", side_effect=model):
            started = time.monotonic()
            response = self.client.post("/onboarding/generate")
            elapsed = time.monotonic() - started
            self.assertEqual(response.status_code, 200, response.text)
            body = response.json()
            # The POST answers at once: every stage takes 0.2 s here, the answer does not wait.
            self.assertLess(elapsed, 0.2)
            self.assertFalse(body["done"])
            self.assertTrue(body["job"]["running"])
            self.assertEqual(body["job"]["kind"], "first_month")
            # Nobody polls from here on: the worker stores the month by itself.
            self.wait_for("done")
        business, job = self.fresh()
        self.assertTrue(business.onboarding_complete)
        self.assertEqual(business.generate_state_json, "")
        self.assertIsNotNone(job.finished_at)
        # Revision 8: the structure only. No post was written, every week is pending.
        self.assertEqual(model.calls, ["StrategyDefinition", "MonthlyPlanCore"])
        strategy = self.month()
        self.assertEqual(loads(strategy.roadmap_json, {})["roadmap"]["posts"], [])
        self.assertEqual(loads(strategy.roadmap_json, {})["roadmap"]["theme"], "חודש ראשון")

        status = self.client.get("/onboarding/generate/status").json()
        self.assertTrue(status["done"])
        self.assertEqual(status["stage"], "done")
        self.assertIsNone(status["error_he"])
        self.assertEqual(status["posts"], {"1": "pending", "2": "pending", "3": "pending", "4": "pending"})

        # Asking again answers with the month; it never rebuilds it.
        with mock.patch.object(strategy_service, "strategy_json", side_effect=AssertionError("no rebuild")):
            again = self.client.post("/onboarding/generate").json()
        self.assertTrue(again["done"])
        self.assertEqual(self.db.query(Strategy).count(), 1)

    def test_a_double_click_joins_the_running_job(self):
        release = threading.Event()
        entered = threading.Event()

        def slow_plan(prompt):
            entered.set()
            release.wait(10)
            return json.dumps(CORE, ensure_ascii=False)

        model = FakeModel(plan=slow_plan)
        with self.threads(), mock.patch.object(strategy_service, "strategy_json", side_effect=model):
            first = self.client.post("/onboarding/generate").json()
            self.assertTrue(entered.wait(10))
            # Second click, a second tab, and a poll — all while the month's plan is written.
            second = self.client.post("/onboarding/generate").json()
            third = self.client.post("/onboarding/generate").json()
            polled = self.client.get("/onboarding/generate/status").json()
            for answer in (second["job"], third["job"], polled):
                self.assertTrue(answer["running"])
                self.assertEqual(answer["stage"], "plan")
                self.assertEqual(answer["started_at"], first["job"]["started_at"])
            # Posts cannot be started while the structure is being built.
            self.assertEqual(self.client.post("/onboarding/posts/start", json={}).status_code, 400)
            # Another process sees a live heartbeat and cannot claim the job either.
            other = self.Session()
            self.addCleanup(other.close)
            self.assertIsNone(jobs._claim(other, self.business_id, jobs.FIRST_MONTH, 2026, 10, fresh=True))
            release.set()
            self.wait_for("done")
        self.assertEqual(model.count("MonthlyPlanCore"), 1)
        self.assertEqual(model.count("StrategyDefinition"), 1)
        self.assertEqual(self.db.query(GenerationJob).count(), 1)
        self.assertEqual(self.db.query(Strategy).count(), 1)

    def test_heartbeat_moves_while_a_stage_runs(self):
        job = GenerationJob(business_id=self.business_id, token="t", status="running",
                            heartbeat_at=datetime.utcnow() - timedelta(minutes=5))
        self.db.add(job)
        self.db.commit()
        jobs._active[self.business_id] = ("t", self.Session)
        try:
            jobs.beat()
        finally:
            jobs._active.pop(self.business_id, None)
        _, row = self.fresh()
        self.assertGreater(row.heartbeat_at, datetime.utcnow() - timedelta(seconds=5))


class PostsLaterTest(JobTestCase):
    def test_posts_start_writes_every_week_in_the_background(self):
        self.build_structure()
        model = FakeModel()
        with self.threads(), mock.patch.object(strategy_service, "strategy_json", side_effect=model):
            started = self.client.post("/onboarding/posts/start", json={})
            self.assertEqual(started.status_code, 200, started.text)
            body = started.json()
            self.assertEqual(body["kind"], "posts")
            self.assertTrue(body["running"])
            self.assertEqual(set(body["posts"].values()) - {"done"}, {"running"} if body["running"] else set())
            self.wait_for("done")
        self.assertEqual(model.calls, [f"MonthlyPosts:[{week}]" for week in (1, 2, 3, 4)])
        strategy = self.month()
        posts = month_posts.month_posts(strategy)
        self.assertEqual([post["week"] for post in posts], [1, 1, 2, 2, 3, 3, 4, 4])
        # Tracking and review state as for any month's posts; indices are stable, and the
        # tracking codes come from each post's own uid (docs/posts-v2.md), all different.
        self.assertEqual(posts[0]["utm"]["utm_content"], f"p-{posts[0]['uid']}")
        self.assertEqual(posts[7]["utm"]["utm_content"], f"p-{posts[7]['uid']}")
        self.assertEqual(len({post["uid"] for post in posts}), 8)
        self.assertEqual({post["approval_status"] for post in posts}, {"review"})
        status = self.client.get("/onboarding/generate/status").json()
        self.assertEqual(status["posts"], {"1": "done", "2": "done", "3": "done", "4": "done"})
        self.assertTrue(status["done"])
        self.assertEqual(status["stage_label_he"], "הפוסטים מוכנים")

    def test_one_week_at_a_time_appends_and_uses_the_owners_picks(self):
        self.build_structure()
        business = self.db.get(Business, self.business_id)
        stored = loads(business.scraped_profile_json, {})
        stored["featured_items"] = [{"name": "חלת שאור", "why": "הכי נמכרת בשישי"}, "עוגת גבינה"]
        business.scraped_profile_json = dumps(stored)
        self.db.commit()
        model = FakeModel()
        with mock.patch.object(strategy_service, "strategy_json", side_effect=model):
            week3 = self.client.post("/onboarding/posts/start", json={"week": 3}).json()
            week1 = self.client.post("/onboarding/posts/start", json={"week": 1}).json()
            # A week that is done is not written again.
            again = self.client.post("/onboarding/posts/start", json={"week": 3}).json()
        self.assertEqual(week3["posts"]["3"], "done")
        self.assertEqual(week3["posts"]["1"], "pending")
        self.assertEqual(week1["posts"], {"1": "done", "2": "pending", "3": "done", "4": "pending"})
        self.assertEqual(again["posts"]["3"], "done")
        self.assertEqual(model.calls, ["MonthlyPosts:[3]", "MonthlyPosts:[1]"])
        prompt = model.prompts[0]
        self.assertIn("חלת שאור: הכי נמכרת בשישי", prompt)
        self.assertIn("2. עוגת גבינה", prompt)
        self.assertIn("שבוע 3 בלבד", prompt)
        # Posts are addressed by index: new weeks are appended, never re-ordered.
        self.assertEqual([post["week"] for post in month_posts.month_posts(self.month())], [3, 3, 1, 1])

    def test_without_picks_the_prompt_is_unchanged(self):
        self.assertEqual(strategy_service._featured_block({"featured_items": []}), "")
        self.assertEqual(strategy_service.featured_items_from({"owner_context": {"featured_items": ["א"]}}), ["א"])
        self.assertEqual(strategy_service.featured_items_from({"featured_items": "not a list"}), [])

    def test_posts_start_without_a_month_is_400(self):
        self.assertEqual(self.client.post("/onboarding/posts/start", json={"week": 2}).status_code, 400)
        self.assertEqual(self.client.post("/onboarding/posts/start", json={"week": 7}).status_code, 422)

    def test_a_week_that_fails_twice_is_error_and_can_be_retried(self):
        self.build_structure()
        model = FakeModel(posts=_raise("קיבלנו פחות מדי פוסטים לשבוע 3. נסו שוב."))
        with mock.patch.object(strategy_service, "strategy_json", side_effect=model):
            body = self.client.post("/onboarding/posts/start", json={}).json()
        # Weeks 1 and 2 fail the same way: week 1 is the one that stops the job.
        self.assertEqual(model.count("MonthlyPosts"), 2)  # one retry, then it stops
        self.assertEqual(body["status"], "failed")
        self.assertEqual(body["posts"], {"1": "error", "2": "pending", "3": "pending", "4": "pending"})
        self.assertIn("כותבים את הפוסטים לשבוע 1", body["error_he"])
        self.assertIn("קיבלנו פחות מדי פוסטים", body["error_he"])
        self.assertIn("לנסות שוב", body["error_he"])
        # It stays stopped: polling does not quietly loop it again.
        status = self.client.get("/onboarding/generate/status").json()
        self.assertEqual(status["status"], "failed")
        self.assertEqual(model.count("MonthlyPosts"), 2)

        model = FakeModel()
        with mock.patch.object(strategy_service, "strategy_json", side_effect=model):
            retry = self.client.post("/onboarding/posts/start", json={}).json()
        self.assertTrue(retry["done"])
        self.assertIsNone(retry["error_he"])
        self.assertEqual(set(retry["posts"].values()), {"done"})


class ResumeTest(JobTestCase):
    def _stop_at_plan(self):
        """The USP stage done and saved, then the month's plan fails (as if the process died)."""
        model = FakeModel(plan=_raise("boom"))
        with mock.patch.object(strategy_service, "strategy_json", side_effect=model):
            self.client.post("/onboarding/generate")
        business, job = self.fresh()
        self.assertEqual(loads(business.generate_state_json, {})["stage"], "plan")
        return job

    def _as_if_the_process_died(self):
        job = self.db.query(GenerationJob).one()
        job.status = "running"
        job.error_he = ""
        job.heartbeat_at = datetime.utcnow() - timedelta(minutes=3)
        self.db.commit()
        return job.started_at

    def test_resume_after_a_restart(self):
        self._stop_at_plan()
        started_at = self._as_if_the_process_died()
        model = FakeModel()
        with self.threads(), mock.patch.object(strategy_service, "strategy_json", side_effect=model):
            resumed = jobs.resume_stale(self.Session)  # what API startup runs
            self.assertEqual(resumed, [self.business_id])
            job = self.wait_for("done")
        # It continued from the saved stage: only the plan was written again.
        self.assertEqual(model.calls, ["MonthlyPlanCore"])
        self.assertEqual(job.started_at, started_at)
        self.assertTrue(self.fresh()[0].onboarding_complete)

    def test_a_posts_job_resumes_after_a_restart(self):
        self.build_structure()
        strategy = self.month()
        month_posts.queue_weeks(strategy, [2, 4])
        self.db.add(strategy)
        job = self.db.query(GenerationJob).one()
        job.kind, job.status, job.heartbeat_at = "posts", "running", datetime.utcnow() - timedelta(minutes=3)
        self.db.commit()
        model = FakeModel()
        with self.threads(), mock.patch.object(strategy_service, "strategy_json", side_effect=model):
            self.assertEqual(jobs.resume_stale(self.Session), [self.business_id])
            self.wait_for("done")
        self.assertEqual(model.calls, ["MonthlyPosts:[2]", "MonthlyPosts:[4]"])
        self.assertEqual(month_posts.posts_status(self.month())["4"], "done")

    def test_a_live_heartbeat_is_not_taken_over(self):
        self._stop_at_plan()
        job = self.db.query(GenerationJob).one()
        job.status = "running"
        job.heartbeat_at = datetime.utcnow()
        self.db.commit()
        with self.threads():
            self.assertEqual(jobs.resume_stale(self.Session), [])

    def test_a_status_poll_resumes_a_dead_job(self):
        self._stop_at_plan()
        self._as_if_the_process_died()
        with self.threads(), mock.patch.object(strategy_service, "strategy_json", side_effect=FakeModel()):
            status = self.client.get("/onboarding/generate/status").json()
            self.assertTrue(status["running"])
            self.wait_for("done")

    def test_the_incident_first_month_is_finished_on_startup(self):
        """The incident: a plan, weeks 1–2 written, stage posts_late, no month, no job row.
        On startup it is stored as the month's structure with no model call: weeks 1–2
        keep their posts, weeks 3–4 wait for the owner (Revision 8)."""
        early = json.loads(_posts([1, 2]))["posts"]
        self.set_state(stage="posts_late", year=2026, month=10, usp=USP, roadmap_core=CORE, calendar=[],
                       posting_plan={"weekly_posts": 2}, competitors=[], posts_early=early)
        business = self.db.get(Business, self.business_id)
        business.updated_at = datetime.utcnow() - timedelta(minutes=10)
        self.db.commit()
        with self.threads(), mock.patch.object(strategy_service, "strategy_json", side_effect=AssertionError("no call")):
            self.assertEqual(jobs.resume_stale(self.Session), [self.business_id])
            self.wait_for("done")
        business, _ = self.fresh()
        self.assertTrue(business.onboarding_complete)
        strategy = self.month()
        self.assertEqual((strategy.year, strategy.month), (2026, 10))
        self.assertEqual(month_posts.posts_status(strategy), {"1": "done", "2": "done", "3": "pending", "4": "pending"})
        self.assertEqual(len(month_posts.month_posts(strategy)), 2)


class FailureTest(JobTestCase):
    def test_a_stage_that_fails_twice_stops_with_a_hebrew_error(self):
        model = FakeModel(plan=_raise("לא קיבלנו תוכנית חודשית מלאה. נסו שוב."))
        with mock.patch.object(strategy_service, "strategy_json", side_effect=model):
            job = self.client.post("/onboarding/generate").json()["job"]
        self.assertEqual(model.count("MonthlyPlanCore"), 2)
        self.assertEqual(job["status"], "failed")
        self.assertFalse(job["running"])
        self.assertFalse(job["done"])
        self.assertEqual(job["stage"], "plan")
        self.assertIn("מתכננים את השבועות", job["error_he"])
        self.assertIn("לא קיבלנו תוכנית חודשית מלאה", job["error_he"])
        self.assertTrue(job["resumable"])
        model = FakeModel()
        with mock.patch.object(strategy_service, "strategy_json", side_effect=model):
            retry = self.client.post("/onboarding/generate").json()
        self.assertTrue(retry["done"])
        self.assertEqual(model.calls, ["MonthlyPlanCore"])

    def test_an_english_provider_error_is_not_shown_raw(self):
        model = FakeModel(plan=_raise("500 INTERNAL upstream exploded"))
        with mock.patch.object(strategy_service, "strategy_json", side_effect=model):
            job = self.client.post("/onboarding/generate").json()["job"]
        self.assertNotIn("exploded", job["error_he"])
        self.assertIn("לנסות שוב", job["error_he"])
        self.assertIn("exploded", self.db.query(GenerationJob).one().error_detail)

    def test_a_stage_that_does_not_move_on_is_a_failure_not_a_loop(self):
        calls = []

        def stuck(db, business):
            calls.append(1)
            return False

        with mock.patch.object(jobs._kinds[jobs.FIRST_MONTH], "run", stuck):
            job = self.client.post("/onboarding/generate").json()["job"]
        self.assertEqual(len(calls), 2)
        self.assertEqual(job["status"], "failed")
        self.assertTrue(job["error_he"])

    def test_a_job_stuck_mid_stage_is_reported_and_can_be_retried(self):
        self.set_state(stage="plan", year=2026, month=10)
        self.db.add(GenerationJob(business_id=self.business_id, status="running", token="old", year=2026, month=10,
                                  heartbeat_at=datetime.utcnow(),
                                  updated_at=datetime.utcnow() - timedelta(minutes=30)))
        self.db.commit()
        jobs._active[self.business_id] = ("old", self.Session)  # its thread is hung here
        self.addCleanup(jobs._active.pop, self.business_id, None)
        status = self.client.get("/onboarding/generate/status").json()
        self.assertEqual(status["status"], "failed")
        self.assertIn("נתקעה", status["error_he"])
        self.assertIn("אוקטובר", status["label_he"])
        with mock.patch.object(strategy_service, "strategy_json", side_effect=FakeModel()):
            retry = self.client.post("/onboarding/generate").json()
        self.assertTrue(retry["done"])


class StatusTest(JobTestCase):
    def test_status_shape_and_labels(self):
        self.set_state(stage="plan", year=2026, month=10)
        status = self.client.get("/onboarding/generate/status").json()
        for key in ("stage", "stage_label_he", "label_he", "started_at", "updated_at", "error_he", "done", "running",
                    "posts"):
            self.assertIn(key, status)
        self.assertEqual(status["status"], "idle")
        self.assertEqual(status["stage"], "plan")
        self.assertEqual(status["label_he"], "בונים את אוקטובר: מתכננים את השבועות…")
        self.assertEqual((status["stage_index"], status["stage_count"]), (1, 2))
        self.assertTrue(status["resumable"])
        self.assertFalse(status["done"])
        self.assertIsNone(status["posts"])  # no month stored yet

    def test_next_month_labels_name_the_weeks(self):
        business = self.db.get(Business, self.business_id)
        business.onboarding_complete = 1
        self.db.add(GenerationJob(business_id=self.business_id, kind="next_month", status="running", token="x",
                                  year=2026, month=10, heartbeat_at=datetime.utcnow()))
        self.db.commit()
        self.set_state(stage="posts_late", year=2026, month=10)
        jobs._active[self.business_id] = ("x", self.Session)
        self.addCleanup(jobs._active.pop, self.business_id, None)
        status = self.client.get("/onboarding/generate/status").json()
        self.assertEqual(status["label_he"], "בונים את אוקטובר: כותבים את הפוסטים לשבועות 3–4…")
        self.assertEqual((status["stage_index"], status["stage_count"]), (3, 4))

    def test_status_without_a_business_is_404(self):
        other = User(email="new@example.com", password_hash="x", full_name="")
        self.db.add(other)
        self.db.commit()
        app.dependency_overrides[get_current_user] = lambda: other
        self.assertEqual(self.client.get("/onboarding/generate/status").status_code, 404)

    def test_me_still_answers_while_a_job_runs(self):
        release = threading.Event()
        model = FakeModel(plan=lambda prompt: (release.wait(10), json.dumps(CORE, ensure_ascii=False))[1])
        with self.threads(), mock.patch.object(strategy_service, "strategy_json", side_effect=model):
            self.client.post("/onboarding/generate")
            self.assertEqual(self.client.get("/onboarding/me").status_code, 200)
            release.set()
            self.wait_for("done")


class NextMonthJobTest(JobTestCase):
    def test_next_month_is_built_by_the_job_with_its_posts(self):
        self.build_structure()
        business = self.db.get(Business, self.business_id)
        stored = loads(business.scraped_profile_json, {})
        stored["featured_items"] = ["לחם כוסמין"]
        business.scraped_profile_json = dumps(stored)
        self.db.commit()
        source = self.month()
        model = FakeModel()
        with mock.patch.object(strategy_service, "strategy_json", side_effect=model):
            response = self.client.post("/strategy/next-month")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertTrue(body["done"], body)
        expected = (source.year + (source.month == 12), source.month % 12 + 1)
        self.assertEqual((body["strategy"]["year"], body["strategy"]["month"]), expected)
        self.assertEqual(body["job"]["kind"], "next_month")
        self.assertEqual(len(body["strategy"]["roadmap"]["posts"]), 4)
        self.assertEqual(body["job"]["posts"], {"1": "done", "2": "done", "3": "done", "4": "done"})
        self.assertTrue(all("לחם כוסמין" in prompt for prompt, call in zip(model.prompts, model.calls)
                            if call.startswith("MonthlyPosts")))
        # Asking again answers with the month that exists; nothing is rebuilt.
        with mock.patch.object(strategy_service, "strategy_json", side_effect=AssertionError("no rebuild")):
            again = self.client.post("/strategy/next-month").json()
        self.assertTrue(again["done"])


class MuseTimeoutTest(unittest.TestCase):
    def _settings(self, **overrides):
        values = {
            "post_model": "muse-spark",
            "post_model_fallback": True,
            "post_model_timeout_seconds": 0.3,
            "meta_post_model": "muse-spark-1.3",
        }
        values.update(overrides)
        return SimpleNamespace(**values)

    def test_a_slow_muse_call_falls_back_to_gemini(self):
        def slow(*args, **kwargs):
            time.sleep(3)
            return {"posts": [{"title": "muse"}]}

        with mock.patch.object(post_model_router, "get_settings", return_value=self._settings()), mock.patch.object(
            post_model_router.meta_model, "chat_json", side_effect=slow
        ), mock.patch.object(post_model_router, "GUARD_GRACE_SECONDS", 0.1), mock.patch.object(
            post_model_router.gemini, "strategy_json", return_value='{"posts": [{"title": "gemini"}]}'
        ) as gem:
            started = time.monotonic()
            result = post_model_router.post_json("p", {"title": "MonthlyPosts"})
            elapsed = time.monotonic() - started
        self.assertEqual(json.loads(result)["posts"][0]["title"], "gemini")
        gem.assert_called_once()
        self.assertLess(elapsed, 1.5)  # the budget (0.3 s + grace), not the 3 s call

    def test_the_budget_reaches_the_http_client(self):
        with mock.patch.object(post_model_router, "get_settings", return_value=self._settings()), mock.patch.object(
            post_model_router.meta_model, "chat_json", return_value={"posts": []}
        ) as meta_call:
            post_model_router.post_json("p", {"title": "MonthlyPosts"})
        self.assertEqual(meta_call.call_args.kwargs["timeout"], 0.3)

    def test_a_read_timeout_is_not_retried_past_the_budget(self):
        attempts = []

        def handler(request):
            attempts.append(request)
            raise httpx.ReadTimeout("slow", request=request)

        client = httpx.Client(transport=httpx.MockTransport(handler))
        settings = SimpleNamespace(meta_model_api_key="k", meta_model_base_url="https://api.meta.example/v1")
        with mock.patch.object(meta_model, "get_settings", return_value=settings), mock.patch.object(
            meta_model.time, "sleep"
        ) as sleep:
            with self.assertRaises(meta_model.ModelTimeout):
                meta_model.chat_json("x", {"title": "T"}, client=client, timeout=5)
        self.assertEqual(len(attempts), 1)
        sleep.assert_not_called()

    def test_without_a_budget_the_old_single_retry_stays(self):
        attempts = []

        def handler(request):
            attempts.append(request)
            raise httpx.ReadTimeout("slow", request=request)

        client = httpx.Client(transport=httpx.MockTransport(handler))
        settings = SimpleNamespace(meta_model_api_key="k", meta_model_base_url="https://api.meta.example/v1")
        with mock.patch.object(meta_model, "get_settings", return_value=settings), mock.patch.object(meta_model.time, "sleep"):
            with self.assertRaises(meta_model.ModelError):
                meta_model.chat_json("x", {"title": "T"}, client=client)
        self.assertEqual(len(attempts), 2)


class MuseInTheMonthTest(JobTestCase):
    def test_a_hanging_muse_call_falls_back_and_the_week_is_written(self):
        """End to end: POST_MODEL=muse-spark, Muse never answers, Gemini writes the posts."""
        from app.config import get_settings as real_settings

        self.build_structure()
        settings = real_settings().model_copy(update={"post_model": "muse-spark", "post_model_timeout_seconds": 0.2})
        stop = threading.Event()
        self.addCleanup(stop.set)

        def hang(*args, **kwargs):  # a Muse call that never answers
            stop.wait(30)
            return {"posts": []}

        gemini_posts = FakeModel()
        with mock.patch.object(strategy_service, "get_settings", return_value=settings), mock.patch.object(
            post_model_router, "get_settings", return_value=settings
        ), mock.patch.object(post_model_router.meta_model, "chat_json", side_effect=hang), mock.patch.object(
            post_model_router, "GUARD_GRACE_SECONDS", 0.1
        ), mock.patch.object(
            post_model_router.gemini, "strategy_json", side_effect=gemini_posts
        ), mock.patch.object(strategy_service, "strategy_json", side_effect=AssertionError("not the direct path")):
            started = time.monotonic()
            body = self.client.post("/onboarding/posts/start", json={"week": 3}).json()
            elapsed = time.monotonic() - started
        self.assertTrue(body["done"], self.fresh()[1].error_detail)
        self.assertEqual(body["posts"]["3"], "done")
        self.assertEqual(gemini_posts.calls, ["MonthlyPosts:[3]"])
        self.assertLess(elapsed, 2.0)  # one capped Muse call, not a hang


if __name__ == "__main__":
    unittest.main()
