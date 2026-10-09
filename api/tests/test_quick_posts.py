"""A saved owner draft must survive retries, plan creation and concurrent editor work."""
import _test_env  # noqa: F401

from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
from unittest import mock

from sqlalchemy.orm import sessionmaker

from app.models import Business, Strategy, User
from app.routers.strategy import upsert_generated_strategy
from app.schemas import PostCreateIn
from app.services import connected_posts, image_jobs, month_posts, quick_posts
from app.services.jsonutil import dumps, loads
from test_post_rewrite import RewriteTestCase, post, CORE, YEAR, MONTH


class QuickPostsTest(RewriteTestCase):
    def request(self, **changes):
        return {"client_ref": str(uuid4()), "text": "A new workshop.\nBring your own sketchbook.",
                "destination": "facebook", "content_language": "en", **changes}

    def create(self, body=None):
        return self.client.post("/strategy/posts/create", json=body or self.request())

    def test_create_without_plan_or_connections_keeps_owner_text_and_language(self):
        self.business.onboarding_complete = 0
        self.db.commit()
        body = self.request(text="  لقاء جديد\nيوم الجمعة  ", content_language="ar")
        # Saving a draft never calls a writer or creates an image.
        with mock.patch("app.services.strategy.lite_json", side_effect=AssertionError("paid call")), \
             mock.patch("app.routers.strategy.generate_for_post", side_effect=AssertionError("image call")):
            response = self.create(body)
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertTrue(data["strategy"]["post_workspace_only"])
        self.assertEqual(data["post_index"], 0)
        self.assertEqual(data["post"]["caption"], body["text"])
        self.assertEqual(data["post"]["content_language"], "ar")
        self.assertEqual(data["post"]["channel"], "facebook")
        self.assertEqual(data["post"]["why_line"], "")
        self.assertFalse(data["post"]["plan_link"]["goal"])
        self.assertNotIn("create_request_hash", data["post"])
        self.assertEqual(self.client.get("/strategy/current").status_code, 404)
        self.assertEqual(self.client.get("/strategy/posts/workspace").status_code, 200)
        strategy = self.db.get(Strategy, data["strategy"]["id"])
        self.assertEqual(month_posts.posts_status(strategy), {str(w): "pending" for w in range(1, 5)})
        self.assertEqual(self.business.onboarding_complete, 0)

    def test_retry_returns_same_draft_even_after_editor_changes_it(self):
        body = self.request()
        first = self.create(body).json()
        saved = self.client.post("/strategy/posts/save", json={"post_index": 0, "title": "Workshop",
            "format": "image", "caption": "Updated in the editor", "primary_outlet": "facebook", "outlets": ["facebook"]})
        self.assertEqual(saved.status_code, 200, saved.text)
        retry = self.create(body)
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertEqual(retry.json()["post"]["uid"], first["post"]["uid"])
        self.assertEqual(retry.json()["post"]["caption"], "Updated in the editor")
        self.assertEqual(len(retry.json()["strategy"]["roadmap"]["posts"]), 1)
        conflict = self.create({**body, "text": "Different"})
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json()["detail"]["code"], "draft_already_saved")

    def test_append_keeps_existing_publication_and_index(self):
        existing = post(published_url="https://www.instagram.com/p/owner-post/")
        strategy = self.month(existing)
        result = self.create().json()
        self.assertEqual(result["post_index"], 1)
        self.assertEqual(result["strategy"]["roadmap"]["posts"][0]["uid"], existing["uid"])
        self.assertEqual(self.stored(strategy)["published_url"], existing["published_url"])
        self.assertEqual(self.client.get("/strategy/current").status_code, 200)

    def test_later_plan_and_week_generation_preserve_draft_and_identity(self):
        created = self.create().json()
        generated = {"year": YEAR, "month": MONTH, "usp": {}, "calendar": [], "posting_plan": {},
            "competitors": [], "brand_language": {}, "roadmap": {**CORE, "posts": [post()]}}
        strategy = upsert_generated_strategy(self.db, self.business, generated)
        self.db.commit()
        self.assertFalse(quick_posts.workspace_only(strategy))
        self.assertEqual(self.stored(strategy)["uid"], created["post"]["uid"])
        self.assertEqual(self.stored(strategy)["caption"], created["post"]["caption"])
        self.assertEqual(self.client.get("/strategy/current").status_code, 200)
        self.assertEqual(self.client.get("/strategy/posts/workspace").json()["roadmap"]["posts"][0]["why_line"], "")
        month_posts.add_week_posts(strategy, 2, [post(uid="planned-week-2", week=2)])
        self.db.commit()
        self.assertEqual(self.stored(strategy)["uid"], created["post"]["uid"])
        self.assertEqual(len(loads(strategy.roadmap_json)["roadmap"]["posts"]), 3)

    def test_concurrent_same_request_creates_one_draft(self):
        factory = sessionmaker(bind=self.engine, autoflush=False)
        business_id = self.business.id
        request = PostCreateIn(**self.request())
        def create_in_session():
            with factory() as db:
                strategy, index = quick_posts.create(db, db.get(Business, business_id), request)
                return strategy.id, index
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: create_in_session(), range(2)))
        self.assertEqual(results[0], results[1])
        self.db.expire_all()
        self.assertEqual(self.db.query(Strategy).count(), 1)
        self.assertEqual(len(loads(self.db.get(Strategy, results[0][0]).roadmap_json)["roadmap"]["posts"]), 1)

    def test_inflight_editor_save_does_not_remove_appended_draft(self):
        strategy = self.month(post())
        before = self.stored(strategy)
        self.create()
        # Image/editor merge uses the same stale-before/current-after protection.
        image_jobs.save_post(self.db, strategy, 0, before, {**before, "caption": "Owner edited"})
        self.assertEqual(len(loads(strategy.roadmap_json)["roadmap"]["posts"]), 2)
        self.assertEqual(self.stored(strategy)["caption"], "Owner edited")

    def test_queued_generation_does_not_drop_a_new_draft(self):
        strategy = self.month(post(week=1))
        factory = sessionmaker(bind=self.engine, autoflush=False)
        with factory() as stale:
            before = stale.get(Strategy, strategy.id)
            self.create()
            month_posts.queue_weeks(before, [2])
            stale.commit()
        self.db.expire_all()
        self.assertEqual(len(loads(self.db.get(Strategy, strategy.id).roadmap_json)["roadmap"]["posts"]), 2)
        self.assertEqual(month_posts.posts_status(self.db.get(Strategy, strategy.id))["2"], "running")

    def test_measurement_refresh_preserves_draft_created_after_month_was_loaded(self):
        existing = post(utm={"utm_campaign": "owned", "utm_content": "same"})
        strategy = self.month(existing)
        factory = sessionmaker(bind=self.engine, autoflush=False)
        with factory() as stale:
            stale.get(Strategy, strategy.id)
            business = stale.get(Business, self.business.id)
            draft = self.create().json()
            with mock.patch.object(connected_posts, "phrase_learnings", return_value={}):
                connected_posts.refresh_results(stale, business, ga4_data={"campaigns": [
                    {"sessionCampaignName": "owned", "sessionManualAdContent": "same", "sessions": 2}]})
            stale.commit()
        self.db.expire_all()
        posts = loads(self.db.get(Strategy, strategy.id).roadmap_json)["roadmap"]["posts"]
        self.assertEqual(len(posts), 2)
        self.assertEqual(posts[1]["uid"], draft["post"]["uid"])
        self.assertEqual(posts[0]["results"]["visits"], 2)

    def test_content_workspace_is_not_a_plan_for_recommendations(self):
        self.create()
        from app.routers.recommendations import current_plan
        self.assertEqual(current_plan(self.db,self.business), {})

    def test_failed_queue_preserves_draft_saved_after_worker_read(self):
        strategy = self.month(post())
        month_posts.queue_weeks(strategy, [2]); self.db.commit()
        factory = sessionmaker(bind=self.engine, autoflush=False)
        with factory() as stale:
            before = stale.get(Strategy, strategy.id)
            self.create()
            month_posts.stop_queue(before, 2)
            stale.commit()
        self.db.expire_all()
        result = self.db.get(Strategy, strategy.id)
        self.assertEqual(len(loads(result.roadmap_json)["roadmap"]["posts"]), 2)
        self.assertEqual(month_posts.posts_status(result)["2"], "error")

    def test_language_defaults_to_business_setting_and_unknown_destination_rejected(self):
        self.business.scraped_profile_json = dumps({"content_language": {"default_language": "ru"}})
        self.db.commit()
        response = self.create(self.request(content_language=None))
        self.assertEqual(response.json()["post"]["content_language"], "ru")
        self.assertEqual(self.create(self.request(text="  ")).status_code, 422)
        self.assertEqual(self.create(self.request(destination="linkedin")).status_code, 422)

    def test_request_ids_are_scoped_to_each_business(self):
        body = self.request()
        first = self.create(body).json()
        owner = User(email="different@example.com", password_hash="x", full_name="Different")
        self.db.add(owner); self.db.flush()
        business = Business(user_id=owner.id, name="Different", business_type="services", offerings="Design",
                            competitors_json="[]", primary_goal="leads", monthly_budget_ils=0)
        self.db.add(business); self.db.commit()
        strategy, index = quick_posts.create(self.db, business, PostCreateIn(**body))
        self.assertNotEqual(strategy.id, first["strategy"]["id"])
        self.assertEqual(index, 0)
