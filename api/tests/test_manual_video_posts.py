"""Manual video attachment, approval and export metadata without model/provider calls."""
import _test_env  # noqa: F401
from unittest import mock
from app.services.jsonutil import dumps, loads
from app.services import connected_posts
from test_assets import AssetTestCase

class ManualVideoPostTest(AssetTestCase):
    def setup_post(self):
        strategy = self.add_strategy()
        payload = loads(strategy.roadmap_json)
        payload["roadmap"]["posts"][0].update(primary_outlet="tiktok", channel="tiktok", format="reel", approval_status="review", image_url="/a-photo.png")
        strategy.roadmap_json = dumps(payload)
        self.db.commit()
        return strategy

    def test_tiktok_photo_is_not_ready_and_cannot_be_approved_or_published(self):
        self.setup_post()
        self.assertEqual(connected_posts.owner_needs({"primary_outlet": "tiktok", "image_url": "/photo.png"})[0]["text"], "סרטון לפרסום בטיקטוק")
        for route, body in [("approve", {"approved": True}), ("publish", {"published_url": ""})]:
            response = self.client.post(f"/strategy/posts/{route}", json={"post_index": 0, **body})
            self.assertEqual(response.status_code, 422, response.text)
        image = self.add_asset()
        self.assertEqual(self.client.post("/strategy/posts/asset", json={"post_index": 0, "asset_id": image.id}).status_code, 422)

    def test_owned_video_uses_video_fields_and_resets_approval_without_generation(self):
        self.setup_post()
        video = self.add_asset(filename="asset-film.mp4", kind="video", mime="video/mp4")
        with mock.patch("app.services.photo_analysis.attach", side_effect=AssertionError("video must not trigger image analysis")):
            response = self.client.post("/strategy/posts/asset", json={"post_index": 0, "asset_id": video.id})
        self.assertEqual(response.status_code, 200, response.text)
        post = response.json()["post"]
        self.assertEqual(post["video_url"], f"/backend/media/{self.business.id}/{video.filename}")
        self.assertEqual(post["video_source"], "asset")
        self.assertEqual(post["approval_status"], "review")
        self.assertEqual(post["channel"], "tiktok")
        self.assertEqual(self.client.post("/strategy/posts/approve", json={"post_index": 0, "approved": True}).status_code, 200)
        foreign = self.add_asset(business=self.rival, kind="video", mime="video/mp4")
        self.assertEqual(self.client.post("/strategy/posts/asset", json={"post_index": 0, "asset_id": foreign.id}).status_code, 404)
