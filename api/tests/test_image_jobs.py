"""Post images: one job per business, and never paid for by opening a page (#123).

Found in the loop run of #111: opening Posts started image generation for every post
without an image, every time; two overlapping runs were both billed and crashed on
SQLite "database is locked"; and a single-post request overwrote three images a
parallel run had just saved. Every image model call here is a fake (Muse answers a
small PNG; Gemini and the designer are stubbed), so nothing reaches a provider.
"""

import _test_env  # noqa: F401  (must come before any `app` import)

import json
import shutil
import tempfile
import threading
import time
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from _dna_fixtures import png_bytes
from app.config import get_settings
from app.db import Base, get_db, sqlite_pragmas
from app.deps import get_current_user
from app.main import app
from app.models import Business, ImageJob, ImageUsage, Strategy, User
from app.services import image_jobs, image_routing, muse_image
from app.services import strategy as strategy_service
from app.services.jsonutil import dumps, loads

BRAND = {
    "business_name": "מאפיית תום",
    "voice": "חם ושכונתי",
    "do_say": ["טרי"],
    "dont_say": ["הכי"],
    "palette": [],
}
PHOTO_DESIGN = {"composition": "full_bleed", "crop": "4:5", "text_position": "bottom", "text_mode": "headline"}
CREATIVE = {"creative_concept": "c", "visual_style": "v", "scene_description": "a loaf on the counter",
            "has_overlay": False, "overlay_headline": "", "overlay_sub": "", "overlay_badge": ""}


def month_post(n: int, **extra) -> dict:
    post = {
        "uid": f"post{n:06d}",
        "week": 1,
        "format": "image",
        "title": f"פוסט {n}",
        "hook": "פתיחה",
        "caption": "כיתוב",
        "cta": "לפרטים",
        "primary_outlet": "instagram",
        "approval_status": "review",
        "image_url": "",
        "design": dict(PHOTO_DESIGN),
        # Already designed: the image is the only work (no designer call).
        "design_creative": dict(CREATIVE),
        "scene_description": "a loaf on the counter",
    }
    post.update(extra)
    return post


class FakeMuse:
    """Muse's generation: a PNG after `delay`; counts calls and how many ran at once.
    `during(n)` runs inside the n-th call, before it answers."""

    def __init__(self, delay: float = 0.0, during=None):
        self.delay = delay
        self.during = during
        self.calls = 0
        self.active = 0
        self.max_active = 0
        self.lock = threading.Lock()

    def generate(self, prompt, aspect_ratio, **kwargs):
        with self.lock:
            self.calls += 1
            self.active += 1
            self.max_active = max(self.max_active, self.active)
            n = self.calls
        try:
            if self.during:
                self.during(n)
            if self.delay:
                time.sleep(self.delay)
            return png_bytes(4, 5), "image/png"
        finally:
            with self.lock:
                self.active -= 1


class ImageJobTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-image-jobs-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        # The app's own SQLite settings (WAL, busy timeout), on a throwaway file.
        self.engine = sqlite_pragmas(create_engine(
            f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False, "timeout": 30}))
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        self.addCleanup(self.db.close)
        owner = User(email="owner@example.com", password_hash="x", full_name="תום")
        self.db.add(owner)
        self.db.commit()
        business = Business(
            user_id=owner.id,
            name="מאפיית תום",
            website_url="https://bakery.example",
            business_type="מאפייה",
            offerings="לחם וחלות",
            monthly_budget_ils=0,
            primary_goal="sales",
            competitors_json="[]",
            scraped_profile_json=dumps({"brand_language": BRAND, "extracted": {}, "raw": {}, "photos_checked": True}),
        )
        self.db.add(business)
        self.db.commit()
        self.business_id = business.id
        self.db.refresh(owner)
        self.db.expunge(owner)
        self.owner = owner

        def override_db():
            # One session per request, as in the app: requests may run on two threads.
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: self.owner
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app)
        self.addCleanup(self._drain)
        # No provider other than the fake Muse may be reached.
        for target, name in ((muse_image, "edit"), (image_routing, "generate_image")):
            patcher = mock.patch.object(target, name, side_effect=AssertionError(f"unexpected {name} call"))
            patcher.start()
            self.addCleanup(patcher.stop)
        designer = mock.patch("app.services.designer.strategy_json", return_value=json.dumps(CREATIVE))
        designer.start()
        self.addCleanup(designer.stop)

    def _drain(self):
        deadline = time.monotonic() + 10
        while image_jobs._active and time.monotonic() < deadline:
            time.sleep(0.02)
        image_jobs._active.clear()

    # --- helpers -----------------------------------------------------------------------------

    def threads(self):
        """Run the job on its real worker thread for this test (tests default to inline)."""
        return mock.patch.object(image_jobs, "INLINE", False)

    def muse(self, fake: FakeMuse):
        return mock.patch.object(muse_image, "generate", side_effect=fake.generate)

    def month(self, posts: list[dict]) -> Strategy:
        today = datetime.utcnow()
        strategy = Strategy(business_id=self.business_id, year=today.year, month=today.month, usp_json="{}",
                            calendar_json="[]", roadmap_json=dumps({"roadmap": {"posts": posts}, "brand_language": BRAND}))
        self.db.add(strategy)
        self.db.commit()
        return strategy

    def stored(self) -> list[dict]:
        db = self.Session()
        try:
            strategy = db.query(Strategy).filter(Strategy.business_id == self.business_id).first()
            return loads(strategy.roadmap_json, {})["roadmap"]["posts"]
        finally:
            db.close()

    def usage(self) -> list[ImageUsage]:
        db = self.Session()
        try:
            return db.query(ImageUsage).filter(ImageUsage.business_id == self.business_id).order_by(ImageUsage.id).all()
        finally:
            db.close()

    def job(self) -> ImageJob | None:
        db = self.Session()
        try:
            return db.query(ImageJob).filter(ImageJob.business_id == self.business_id).first()
        finally:
            db.close()

    def open_posts_page(self) -> dict:
        """What the Posts page and the editor read when they open: nothing else."""
        strategy = self.client.get("/strategy/current")
        self.assertEqual(strategy.status_code, 200, strategy.text)
        images = self.client.get("/strategy/posts/images/status")
        self.assertEqual(images.status_code, 200, images.text)
        self.client.get("/onboarding/generate/status")
        return images.json()

    def wait_until_done(self, timeout: float = 15.0) -> dict:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            status = self.client.get("/strategy/posts/images/status").json()
            if status["status"] in {"done", "failed"} and not image_jobs._active:
                return status
            time.sleep(0.05)
        self.fail(f"the image job never finished: {self.client.get('/strategy/posts/images/status').json()}")

    def after_build(self):
        db = self.Session()
        try:
            business = db.get(Business, self.business_id)
            strategy = db.query(Strategy).filter(Strategy.business_id == self.business_id).first()
            with mock.patch.object(get_settings(), "image_jobs_on_build", True):
                return image_jobs.after_build(db, business, strategy)
        finally:
            db.close()


class PageOpenTest(ImageJobTestCase):
    def test_opening_posts_twice_spends_nothing_extra(self):
        self.month([month_post(n) for n in range(3)])
        fake = FakeMuse()
        with self.muse(fake):
            for _ in range(2):
                status = self.open_posts_page()
            self.assertEqual((fake.calls, self.usage()), (0, []))
            self.assertEqual(status["status"], "idle")
            self.assertTrue(all(not post["image_url"] for post in self.stored()))

            # The month's posts were written: the server prepares their images, once.
            self.after_build()
            self.assertEqual(fake.calls, 3)
            self.assertTrue(all(post["image_url"] and post["image_job_at"] for post in self.stored()))

            for _ in range(2):
                status = self.open_posts_page()
            self.assertEqual((status["status"], status["done"], status["waiting"]), ("done", 3, []))
            # An old page (or a second tab) asking for the missing images joins: none left.
            for _ in range(2):
                response = self.client.post("/strategy/posts/images")
                self.assertEqual(response.status_code, 200, response.text)
            self.after_build()
        self.assertEqual(fake.calls, 3)
        self.assertEqual(len(self.usage()), 3)

    def test_a_failed_image_is_not_paid_for_again_by_itself(self):
        self.month([month_post(0)])
        refused = mock.patch.object(muse_image, "generate",
                                    side_effect=muse_image.MuseRefused("400", code="content_policy_violation"))
        with refused as muse, mock.patch.object(image_routing, "generate_image", side_effect=RuntimeError("503")) as nb2:
            self.after_build()
            status = self.open_posts_page()
            self.assertEqual((status["failed"], status["items"][0]["state"]), (1, "error"))
            self.assertTrue(status["items"][0]["error_he"])
            post = self.stored()[0]
            self.assertEqual(post["image_url"], "")
            self.assertTrue(post["image_job_at"], "the post records that the job tried it")
            # Both attempts are logged even though the image failed.
            self.assertEqual([(row.provider, row.outcome) for row in self.usage()], [("muse", "refused"), ("gemini", "error")])
            self.after_build()
            self.client.post("/strategy/posts/images")
            self.assertEqual((muse.call_count, nb2.call_count), (1, 1))
        # The owner can still ask for it.
        fake = FakeMuse()
        with self.muse(fake):
            response = self.client.post("/strategy/posts/image", json={"post_index": 0, "image_preference": "ai"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["post"]["image_url"])
        self.assertEqual(fake.calls, 1)

    def test_writing_the_months_posts_prepares_their_images_once(self):
        from test_generation_jobs import FakeModel

        with mock.patch.object(strategy_service, "strategy_json", side_effect=FakeModel()):
            self.assertTrue(self.client.post("/onboarding/generate").json()["done"])
        fake = FakeMuse()
        with self.muse(fake), mock.patch.object(get_settings(), "image_jobs_on_build", True), \
                mock.patch.object(strategy_service, "strategy_json", side_effect=FakeModel()):
            # Opening Posts before the posts exist costs nothing.
            self.open_posts_page()
            self.assertEqual(fake.calls, 0)
            response = self.client.post("/onboarding/posts/start", json={"week": 1})
            self.assertEqual(response.status_code, 200, response.text)
            week_one = self.stored()
            photo_posts = [post for post in week_one if post.get("image_job_at")]
            self.assertTrue(photo_posts)
            self.assertEqual(fake.calls, len(photo_posts))
            self.assertTrue(all(post["image_url"] for post in photo_posts))
            for _ in range(2):
                self.open_posts_page()
            self.assertEqual(fake.calls, len(photo_posts))
            # The next week's posts get theirs; week 1's are not made again.
            self.client.post("/onboarding/posts/start", json={"week": 2})
            new = [post for post in self.stored()[len(week_one):] if post.get("image_job_at")]
            self.assertEqual(fake.calls, len(photo_posts) + len(new))


class OneJobTest(ImageJobTestCase):
    def test_two_concurrent_image_requests_for_one_business_run_one_job(self):
        self.month([month_post(n) for n in range(4)])
        fake = FakeMuse(delay=0.15)
        answers: list[int] = []
        errors: list[BaseException] = []
        start = threading.Barrier(2)

        def ask():
            try:
                client = TestClient(app)
                start.wait()
                answers.append(client.post("/strategy/posts/images").status_code)
            except BaseException as exc:  # noqa: BLE001 - reported below
                errors.append(exc)

        with self.threads(), self.muse(fake):
            workers = [threading.Thread(target=ask) for _ in range(2)]
            for worker in workers:
                worker.start()
            for worker in workers:
                worker.join(10)
            status = self.wait_until_done()
        self.assertEqual(errors, [])
        self.assertEqual(answers, [200, 200])
        # Four posts, four images: the second request joined the first job.
        self.assertEqual(fake.calls, 4)
        self.assertEqual(fake.max_active, 1)
        self.assertEqual((status["status"], status["done"], status["total"]), ("done", 4, 4))
        self.assertTrue(all(post["image_url"] for post in self.stored()))
        self.assertEqual(len(self.usage()), 4)

    def test_a_single_post_request_joins_the_running_job_and_goes_first(self):
        posts = [month_post(n) for n in range(3)]
        # The owner asks for another image of a post that has one ("תמונה אחרת").
        posts.append(month_post(3, image_url="/backend/media/1/old.png", image_source="generated",
                                approval_status="approved"))
        self.month(posts)
        fake = FakeMuse(delay=0.2)
        with self.threads(), self.muse(fake):
            self.assertEqual(self.client.post("/strategy/posts/images").status_code, 200)
            deadline = time.monotonic() + 5
            while self.client.get("/strategy/posts/images/status").json()["current"] != "post000000":
                self.assertLess(time.monotonic(), deadline)
                time.sleep(0.02)
            response = self.client.post("/strategy/posts/image",
                                        json={"post_index": 3, "force": True, "image_preference": "ai"})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertNotEqual(response.json()["post"]["image_url"], "/backend/media/1/old.png")
            self.wait_until_done()
        self.assertEqual(fake.max_active, 1)
        self.assertEqual(fake.calls, 4)
        # The image being made when the owner asked finished first; theirs came next.
        self.assertEqual([row.post_uid for row in self.usage()], ["post000000", "post000003", "post000001", "post000002"])
        stored = self.stored()
        self.assertTrue(all(post["image_url"] for post in stored))
        self.assertEqual(stored[3]["approval_status"], "approved")

    def test_a_single_post_request_never_overwrites_other_posts(self):
        # The incident: while the owner's image was being made, a parallel run saved three
        # images; the single-post request then wrote the whole month back and undid them.
        posts = [month_post(n) for n in range(4)]
        self.month(posts)

        def parallel_run(n):
            other = self.Session()
            try:
                row = other.query(Strategy).filter(Strategy.business_id == self.business_id).one()
                extra = loads(row.roadmap_json, {})
                for index in range(3):
                    extra["roadmap"]["posts"][index]["image_url"] = f"/backend/media/1/parallel-{index}.png"
                row.roadmap_json = dumps(extra)
                other.commit()
            finally:
                other.close()

        fake = FakeMuse(during=parallel_run)
        with self.muse(fake):
            response = self.client.post("/strategy/posts/image", json={"post_index": 3, "image_preference": "ai"})
        self.assertEqual(response.status_code, 200, response.text)
        stored = self.stored()
        self.assertEqual([post["image_url"] for post in stored[:3]],
                         [f"/backend/media/1/parallel-{index}.png" for index in range(3)])
        self.assertTrue(stored[3]["image_url"].startswith("/backend/media/"))
        self.assertEqual(response.json()["post"]["image_url"], stored[3]["image_url"])
        self.assertEqual(response.json()["strategy"]["roadmap"]["posts"][0]["image_url"], "/backend/media/1/parallel-0.png")

    def test_the_owners_own_photo_is_written_onto_that_post_only(self):
        # Attaching a photo may take a model call (its layout); an image the job saved for
        # another post meanwhile stays.
        from app.models import Asset
        from app.services import photo_analysis

        self.month([month_post(n) for n in range(2)])
        asset = Asset(business_id=self.business_id, filename="asset-own.png", mime="image/png")
        self.db.add(asset)
        self.db.commit()

        def meanwhile(db, business_id, post, data, mime="", allow_model=True):
            other = self.Session()
            try:
                row = other.query(Strategy).filter(Strategy.business_id == self.business_id).one()
                extra = loads(row.roadmap_json, {})
                extra["roadmap"]["posts"][0]["image_url"] = "/backend/media/1/from-the-job.png"
                row.roadmap_json = dumps(extra)
                other.commit()
            finally:
                other.close()

        with mock.patch.object(photo_analysis, "attach", side_effect=meanwhile):
            response = self.client.post("/strategy/posts/asset", json={"post_index": 1, "asset_id": asset.id})
        self.assertEqual(response.status_code, 200, response.text)
        stored = self.stored()
        self.assertEqual(stored[0]["image_url"], "/backend/media/1/from-the-job.png")
        self.assertEqual((stored[1]["image_source"], stored[1]["image_asset_id"]), ("asset", asset.id))

    def test_writes_never_hit_database_is_locked(self):
        # The app's SQLite settings: readers never block the writer, and a writer waits.
        with self.engine.connect() as conn:
            self.assertEqual(conn.execute(text("PRAGMA journal_mode")).scalar(), "wal")
            self.assertGreaterEqual(conn.execute(text("PRAGMA busy_timeout")).scalar(), 30000)
        # A month of images while the owner keeps saving: every save goes through.
        self.month([month_post(n) for n in range(4)] + [month_post(9, image_url="/backend/media/1/own.png")])
        fake = FakeMuse(delay=0.1)
        saved: list[int] = []
        with self.threads(), self.muse(fake):
            self.client.post("/strategy/posts/images")
            while self.client.get("/strategy/posts/images/status").json()["running"]:
                response = self.client.post("/strategy/posts/approve", json={"post_index": 4, "approved": True})
                saved.append(response.status_code)
                time.sleep(0.02)
            self.wait_until_done()
        self.assertTrue(saved)
        self.assertEqual(set(saved), {200})
        self.assertEqual(sum(1 for post in self.stored() if post["image_url"]), 5)


class LeaseTest(ImageJobTestCase):
    def dead_job(self, *, lease_left: timedelta, attempts: int = 1) -> Strategy:
        strategy = self.month([month_post(n) for n in range(2)])
        posts = loads(strategy.roadmap_json, {})["roadmap"]["posts"]
        items = [image_jobs.make_item(strategy, n, post) for n, post in enumerate(posts)]
        items[0].update(state=image_jobs.RUNNING, attempts=attempts)
        now = datetime.utcnow()
        self.db.add(ImageJob(business_id=self.business_id, status="running", token="dead-worker", version=3,
                             items_json=dumps(items), lease_until=now + lease_left, started_at=now - timedelta(minutes=5),
                             updated_at=now - timedelta(minutes=2)))
        self.db.commit()
        return strategy

    def test_a_crashed_jobs_lock_expires(self):
        self.dead_job(lease_left=timedelta(seconds=60))
        fake = FakeMuse()
        with self.muse(fake):
            # While its lease runs, the job is someone's: a request joins, nothing starts.
            status = self.client.post("/strategy/posts/images").json()["job"]
            self.assertEqual((status["status"], status["running"]), ("running", True))
            self.assertEqual(fake.calls, 0)
            self.assertEqual(self.job().token, "dead-worker")
            # Its process died: the lease passes, and the page says so without starting anything.
            db = self.Session()
            db.query(ImageJob).update({"lease_until": datetime.utcnow() - timedelta(seconds=1)})
            db.commit()
            db.close()
            status = self.open_posts_page()
            self.assertEqual((status["status"], status["running"]), ("stalled", False))
            self.assertEqual(fake.calls, 0)
            # The next request takes it over and finishes the queue, the interrupted image too.
            status = self.client.post("/strategy/posts/images").json()["job"]
        self.assertNotEqual(self.job().token, "dead-worker")
        self.assertEqual((status["status"], status["done"]), ("done", 2))
        self.assertEqual(fake.calls, 2)
        self.assertTrue(all(post["image_url"] for post in self.stored()))

    def test_an_image_interrupted_twice_is_reported_not_retried_forever(self):
        self.dead_job(lease_left=-timedelta(seconds=1), attempts=image_jobs.ITEM_ATTEMPTS)
        fake = FakeMuse()
        with self.muse(fake):
            status = self.client.post("/strategy/posts/images").json()["job"]
            self.assertEqual(fake.calls, 1)
            self.assertEqual([item["state"] for item in status["items"]], ["error", "done"])
            self.assertEqual(status["items"][0]["error_he"], image_jobs.STOPPED_HE)
            self.assertTrue(self.stored()[0]["image_job_at"])
            # Not started again by itself; the owner can still ask for it.
            self.client.post("/strategy/posts/images")
            self.assertEqual(fake.calls, 1)

    def test_the_api_restart_continues_a_job_whose_worker_died(self):
        self.dead_job(lease_left=-timedelta(seconds=1))
        fake = FakeMuse()
        with self.muse(fake):
            resumed = image_jobs.resume_stale(self.Session)
        self.assertEqual(resumed, [])  # inline: finished within the call, nothing left running
        self.assertEqual(fake.calls, 2)
        self.assertEqual(self.job().status, "done")


class QueueTest(unittest.TestCase):
    """The queue's rules, without a database."""

    def item(self, uid: str, source: str = image_jobs.BUILD, **options) -> dict:
        strategy = Strategy(id=1, business_id=1, year=2026, month=10)
        return image_jobs.make_item(strategy, 0, {"uid": uid}, source=source, **options)

    def test_a_post_already_queued_is_not_queued_twice(self):
        queue, _ = image_jobs._merge_queue([], [self.item("a"), self.item("b")])
        merged, ids = image_jobs._merge_queue(queue, [self.item("a"), self.item("c")])
        self.assertEqual([item["uid"] for item in merged], ["a", "b", "c"])
        self.assertEqual(ids[0], queue[0]["id"])

    def test_the_owner_goes_first_and_a_double_click_waits_on_one_image(self):
        queue, _ = image_jobs._merge_queue([], [self.item("a"), self.item("b"), self.item("c")])
        queue[0]["state"] = image_jobs.RUNNING
        merged, first = image_jobs._merge_queue(queue, [self.item("c", image_jobs.OWNER, force=True)])
        self.assertEqual([(item["uid"], item["source"]) for item in merged],
                         [("a", "build"), ("c", "owner"), ("b", "build")])
        again, second = image_jobs._merge_queue(merged, [self.item("c", image_jobs.OWNER, force=True)])
        self.assertEqual(again, merged)
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
