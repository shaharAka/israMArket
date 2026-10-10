"""Offline campaign versions: isolation, safe keep/undo and no duplicate generation."""
import _test_env  # noqa: F401
import copy
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path
from unittest import mock
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from app.db import Base, get_db, sqlite_pragmas
from app.deps import get_current_user
from app.main import app
from app.models import Asset, Business, CampaignRevision, Strategy, User
from app.services import campaign_revisions as revisions
from app.services.jsonutil import dumps


def post(uid, **kw):
    return {"uid": uid, "week": 1, "format": "image", "title": uid, "caption": "הנוסח הקודם", "cta": "להזמין",
            "content_language": "ru", "approval_status": "review", **kw}


class CampaignTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.engine = sqlite_pragmas(create_engine(f"sqlite:///{Path(self.tmp.name)/'db.sqlite'}", connect_args={"check_same_thread": False}))
        self.addCleanup(self.engine.dispose); Base.metadata.create_all(self.engine)
        self.db = Session(self.engine); self.addCleanup(self.db.close)
        self.user = User(email="campaign@example.com", full_name="Campaign", trial_started_at=datetime.utcnow())
        self.db.add(self.user); self.db.commit()
        self.biz = Business(user_id=self.user.id, name="Shop", onboarding_complete=1)
        self.db.add(self.biz); self.db.commit()
        today = date.today()
        self.plan = Strategy(business_id=self.biz.id, year=today.year, month=today.month,
            roadmap_json=dumps({"roadmap": {"posts": [post("one"), post("two"), post("out", published_url="https://instagram.com/p/old")]}}))
        self.db.add(self.plan); self.db.commit()
        app.dependency_overrides[get_current_user] = lambda: self.user
        def database():
            with Session(self.engine) as db: yield db
        app.dependency_overrides[get_db] = database; self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app)
        self.producer = mock.patch.object(revisions, "propose", side_effect=lambda db,b,s,p,k,i,r: {**copy.deepcopy(p), "caption": "נוסח חדש", "image_url": "/media/1/new.png"})
        self.fake = self.producer.start(); self.addCleanup(self.producer.stop)

    def create(self, uids=None, **kw):
        return self.client.post("/campaign/revisions", json={"request_id": "request_abcdefgh1234", "post_uids": uids or ["one"], "kind": "text", "instruction": "קצר יותר", **kw})

    def posts(self):
        self.db.expire_all()
        return revisions.posts_of(self.db.get(Strategy, self.plan.id))

    def change(self, uid, **kw):
        posts = self.posts(); next(p for p in posts if p["uid"] == uid).update(kw)
        self.plan.roadmap_json = dumps({"roadmap": {"posts": posts}}); self.db.commit()

    def test_no_layout_job_for_plain_photography_or_burned_video(self):
        for change in ({"has_overlay": False}, {"has_overlay": True, "design": {"text_mode": "photo_only"}},
                       {"has_overlay": True, "design": {}, "video_url": "/media/1/clip.mp4"}):
            self.change("one", **change)
            response = self.create(kind="layout")
            self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(self.db.query(CampaignRevision).count(), 0)
            self.fake.assert_not_called()

    def test_stage_keep_undo_preserves_other_posts_language_and_measurements(self):
        before = copy.deepcopy(self.posts()); result = self.create(["one", "two"])
        self.assertEqual(result.status_code, 202, result.text); rid = result.json()["id"]
        self.assertEqual(self.posts(), before)
        self.assertEqual(self.client.get(f"/campaign/revisions/{rid}").json()["state"], "ready")
        self.assertEqual(self.client.post(f"/campaign/revisions/{rid}/keep").status_code, 200)
        self.assertEqual(self.posts()[0]["caption"], "נוסח חדש")
        self.assertEqual(self.posts()[0]["content_language"], "ru"); self.assertEqual(self.posts()[2], before[2])
        self.change("one", results={"value": 3})
        self.assertEqual(self.client.post(f"/campaign/revisions/{rid}/undo").status_code, 200)
        self.assertEqual(self.posts()[0]["caption"], before[0]["caption"])
        self.assertEqual(self.posts()[0]["results"], {"value": 3})

    def test_one_stale_member_prevents_entire_batch_overwrite(self):
        rid = self.create(["one", "two"]).json()["id"]; self.change("two", caption="עריכה חדשה")
        self.assertEqual(self.client.post(f"/campaign/revisions/{rid}/keep").status_code, 409)
        self.assertEqual(self.posts()[0]["caption"], "הנוסח הקודם"); self.assertEqual(self.posts()[1]["caption"], "עריכה חדשה")

    def test_video_result_needs_the_original_durable_job_before_any_file_write(self):
        from app.services import campaign_video as video
        old_id = self.biz.id
        self.db.query(Strategy).delete(); self.db.query(Business).delete(); self.db.commit()
        replacement = Business(user_id=self.user.id, name="Replacement")
        self.db.add(replacement); self.db.commit()
        self.assertEqual(replacement.id, old_id)
        with mock.patch.object(video, "store_asset_bytes") as write:
            with self.assertRaises(HTTPException): video.store(self.db, old_id, "deleted-job-uuid", b"clip", "private")
            write.assert_not_called()

    def test_real_text_revision_does_not_pretend_to_edit_burned_video_text(self):
        self.producer.stop()
        self.change("one", video_url="/backend/media/1/original.mp4", overlay_headline="הכיתוב שבסרטון", overlay_text="הכיתוב שבסרטון")
        original = self.posts()[0]
        from app.services import strategy as strategy_service
        with mock.patch.object(strategy_service, "rewrite_post", return_value={**original, "caption": "הנוסח החדש\nלהזמין", "overlay_text": "כיתוב חדש"}) as write:
            result = self.create()
        self.assertEqual(result.status_code, 202, result.text)
        row = self.client.get("/campaign/revisions/"+result.json()["id"]).json()
        self.assertEqual(row["state"], "ready", row)
        proposal = row["items"][0]["proposal"]
        self.assertEqual(proposal["overlay_headline"], original["overlay_headline"])
        self.assertEqual(proposal["caption"], "הנוסח החדש\nלהזמין")
        self.assertEqual(proposal["content_language"], "ru")
        self.assertEqual(write.call_args.args[0]["creative_brief"]["content_language"], "ru")
        self.assertEqual(self.posts()[0], original)

    def test_failed_image_edit_is_reported_without_silently_reusing_the_old_photo(self):
        self.producer.stop()
        extra = {"brand_language": {"tone": "רגוע"}, "roadmap": {"posts": self.posts()}}
        self.plan.roadmap_json = dumps(extra); self.db.commit()
        from app.routers import strategy as routes
        from app.services import designer
        with mock.patch.object(revisions.media_allowances, "status", return_value={"images":{"generation_available":True,"remaining":3}}), \
             mock.patch.object(designer, "design_and_generate_post", side_effect=lambda *args,**kw: kw["image_provider"](args[1])), \
             mock.patch.object(routes, "_produce_post_image", side_effect=RuntimeError("private provider detail")) as image:
            result = self.create(kind="image")
        row = self.client.get("/campaign/revisions/"+result.json()["id"]).json()
        self.assertEqual(row["state"], "failed")
        self.assertNotIn("private", row["items"][0]["error"])
        self.assertTrue(image.call_args.kwargs["strict"])
        self.assertEqual(self.posts()[0]["caption"], "הנוסח הקודם")

    def test_approved_scheduled_and_published_never_generated(self):
        for kw in ({"approval_status": "approved"}, {"scheduled_for": "2026-10-20"}, {"published_at": "2026-10-10"}):
            self.change("one", **{"approval_status": "review", "scheduled_for": "", "published_at": "", **kw})
            self.assertEqual(self.create().status_code, 409)
        self.fake.assert_not_called(); self.assertEqual(self.create(["out"]).status_code, 409)

    def test_approval_after_preview_prevents_keep_and_after_keep_prevents_undo(self):
        rid = self.create().json()["id"]; self.change("one", approval_status="approved")
        self.assertEqual(self.client.post(f"/campaign/revisions/{rid}/keep").status_code, 409)
        self.change("one", approval_status="review")
        self.assertEqual(self.client.post(f"/campaign/revisions/{rid}/keep").status_code, 200)
        self.change("one", published_url="https://instagram.com/p/new")
        self.assertEqual(self.client.post(f"/campaign/revisions/{rid}/undo").status_code, 409)

    def test_retry_does_not_generate_again_or_change_scope(self):
        first = self.create().json(); again = self.create().json()
        self.assertEqual(first["id"], again["id"]); self.assertEqual(self.fake.call_count, 1)
        self.assertEqual(self.create(["two"]).status_code, 409)

    def test_history_and_choice_are_business_scoped(self):
        rid = self.create().json()["id"]
        user = User(email="other@example.com", full_name="Other"); self.db.add(user); self.db.commit()
        business = Business(user_id=user.id, name="Other", onboarding_complete=1)
        self.db.add(business); self.db.commit(); app.dependency_overrides[get_current_user] = lambda: user
        self.assertEqual(self.client.get(f"/campaign/revisions/{rid}").status_code, 404)
        self.assertEqual(self.client.post(f"/campaign/revisions/{rid}/keep").status_code, 404)

    def test_exhaustion_blocks_producer_but_layout_remains_usable(self):
        with mock.patch.object(revisions.media_allowances, "status", return_value={"images": {"generation_available": False, "remaining": 0}}):
            self.assertEqual(self.create(kind="image").status_code, 429)
        self.fake.assert_not_called(); self.assertEqual(self.create(kind="layout", instruction="").status_code, 202)

    def test_reads_never_generate_and_failure_keeps_original(self):
        self.fake.side_effect = RuntimeError("private-provider-token"); before = self.posts(); rid = self.create().json()["id"]
        self.assertEqual(self.posts(), before); result = self.client.get(f"/campaign/revisions/{rid}")
        self.assertEqual(result.json()["state"], "failed"); self.assertNotIn("private-provider", result.text)
        self.client.get("/campaign/revisions"); self.assertEqual(self.fake.call_count, 1)
        self.assertEqual(self.client.post(f"/campaign/revisions/{rid}/keep").status_code, 409)

    def test_partial_success_can_keep_only_completed_versions_and_undo_them(self):
        def partial(db,b,s,p,k,i,r):
            if p["uid"] == "two": raise RuntimeError("provider failure")
            return {**p, "caption": "partial"}
        self.fake.side_effect = partial
        rid = self.create(["one", "two"]).json()["id"]
        self.assertEqual(self.client.post(f"/campaign/revisions/{rid}/keep").status_code, 200)
        self.assertEqual([p["caption"] for p in self.posts()[:2]], ["partial", "הנוסח הקודם"])
        self.assertEqual(self.client.post(f"/campaign/revisions/{rid}/undo").status_code, 200)
        self.assertEqual(self.posts()[0]["caption"], "הנוסח הקודם")

    def test_free_footage_path_stages_a_real_mp4_and_undo_restores_format(self):
        from test_campaign_video import VideoTest
        from app.services import campaign_video as video
        if not video.shutil.which("ffmpeg"): self.skipTest("FFmpeg unavailable")
        VideoTest.setUpClass()
        folder = Path(self.tmp.name) / str(self.biz.id); folder.mkdir(exist_ok=True)
        (folder / "own.mp4").write_bytes(VideoTest.clip)
        asset = Asset(business_id=self.biz.id, filename="own.mp4", kind="video", mime="video/mp4")
        self.db.add(asset); self.db.commit()
        self.producer.stop()
        with mock.patch.object(video, "media_root", return_value=Path(self.tmp.name)), \
             mock.patch("app.services.assets.media_root", return_value=Path(self.tmp.name)), \
             mock.patch.object(video, "generate") as paid:
            result = self.create(kind="finish", instruction="", options={"asset_id":asset.id, "start":.5, "end":1.5})
        self.assertEqual(result.status_code,202,result.text); rid=result.json()["id"]
        paid.assert_not_called()
        row = self.client.get(f"/campaign/revisions/{rid}").json()
        self.assertEqual(row["state"],"ready",row)
        proposal=row["items"][0]["proposal"]
        self.assertEqual(proposal["format"],"reel"); self.assertIn(".mp4",proposal["video_url"])
        self.assertEqual(self.posts()[0]["format"],"image")
        self.assertEqual(self.client.post(f"/campaign/revisions/{rid}/keep").status_code,200)
        self.assertEqual(self.posts()[0]["video_raw_asset_id"],asset.id)
        self.assertEqual(self.client.post(f"/campaign/revisions/{rid}/undo").status_code,200)
        self.assertNotIn("video_url",self.posts()[0]); self.assertEqual(self.posts()[0]["format"],"image")

    def test_video_gate_and_options_validation_do_not_submit_paid_work(self):
        self.assertEqual(self.create(kind="video").status_code, 429)
        self.assertEqual(self.create(kind="finish", options={"asset_id": 999}).status_code, 404)
        self.assertEqual(self.create(kind="finish", options={"start": -2}).status_code, 422)
        self.assertEqual(self.create(kind="finish", options={"overlay_png": "https://other/photo"}).status_code, 422)
        self.fake.assert_not_called()

    def test_interrupted_request_not_retried_by_reads_or_resubmit(self):
        self.fake.side_effect = RuntimeError("offline"); rid = self.create().json()["id"]
        row = self.db.get(CampaignRevision, rid); row.state = "working"; row.updated_at = datetime.utcnow() - timedelta(hours=1); self.db.commit()
        self.client.get(f"/campaign/revisions/{rid}"); self.assertEqual(self.fake.call_count, 1)
        self.create(); self.assertEqual(self.fake.call_count, 1)
        self.assertEqual(self.create(request_id="brand_new_request_1234").status_code, 202)


if __name__ == "__main__": unittest.main()
