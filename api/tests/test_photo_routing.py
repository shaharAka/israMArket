"""Photos real first: which of the owner's photos a post gets, which model edits or makes it,
the fallback when Muse refuses, and what each image cost. Every model and HTTP call is faked.
"""
import _test_env  # noqa: F401  (must come before any `app` import)

import base64
import json
import unittest
from unittest import mock

import httpx

from _dna_fixtures import DnaTestCase, png_bytes
from app.config import get_settings
from app.models import Asset, ImageUsage, InstagramPost, Strategy
from app.services import design_dna, image_routing, muse_image, photo_choice
from app.services.image_usage import estimate_cost
from app.services.jsonutil import dumps
from app.services.meta_model import ContributorModelRefused

PHOTO = (png_bytes(16, 20), "image/png")


def candidate(key, origin, text):
    return photo_choice.Candidate(key=key, origin=origin, text=text, loader=lambda: PHOTO)


class StemTest(unittest.TestCase):
    def test_hebrew_forms_of_one_word_meet(self):
        self.assertTrue(photo_choice.stems("חלות שבת") & photo_choice.stems("חלה קלועה"))
        self.assertTrue(photo_choice.stems("הלחמים שלנו") & photo_choice.stems("לחם מחמצת"))
        self.assertTrue(photo_choice.stems("בעוגות") & photo_choice.stems("עוגה"))

    def test_a_stripped_prefix_never_makes_a_two_letter_match(self):
        self.assertFalse(photo_choice.stems("לחם") & photo_choice.stems("חמים"))


class ChoiceTest(unittest.TestCase):
    def setUp(self):
        self.pool = [
            candidate("asset:1", "library", "עוגת שוקולד על מגש | עוגה, שוקולד"),
            candidate("asset:2", "library", "חלה קלועה על שיש | חלה, שבת"),
            candidate("ig:9", "instagram", "המחצלות החדשות הגיעו לסטודיו"),
            candidate("site:x", "site", "cinnamon buns tray"),
        ]

    def test_the_photo_of_the_subject_wins_not_the_first(self):
        post = {"title": "החלות של שישי", "featured_item_name": "חלת שאור"}
        picked, _photo, reason = photo_choice.choose(self.pool, post, {})
        self.assertEqual((picked.key, reason), ("asset:2", "subject"))

    def test_instagram_captions_and_site_alt_text_are_matched_too(self):
        picked, _p, _r = photo_choice.choose(self.pool, {"title": "מחצלות חדשות בסטודיו"}, {})
        self.assertEqual(picked.key, "ig:9")
        self.assertEqual(picked.image_source, "real_photo")
        picked, _p, _r = photo_choice.choose(self.pool, {"scene_description": "cinnamon bun close-up"}, {})
        self.assertEqual(picked.key, "site:x")

    def test_a_photo_used_this_month_gives_way_to_an_equal_one(self):
        pool = [candidate("asset:1", "library", "חלה"), candidate("asset:2", "library", "חלה")]
        picked, _p, _r = photo_choice.choose(pool, {"title": "חלה"}, {"asset:1": 2})
        self.assertEqual(picked.key, "asset:2")

    def test_a_named_product_with_no_matching_photo_gets_none(self):
        self.assertIsNone(photo_choice.choose(self.pool, {"title": "קרואסון", "featured_item_name": "קרואסון חמאה"}, {}))

    def test_without_a_subject_the_photos_take_turns(self):
        post = {"title": "בוקר טוב"}
        firsts = {photo_choice.choose(self.pool, post, {}, index=i)[0].key for i in range(4)}
        self.assertGreater(len(firsts), 1, "not always the first photo")

    def test_a_photo_that_does_not_load_is_skipped(self):
        broken = photo_choice.Candidate(key="asset:2", origin="library", text="חלה", loader=lambda: None)
        fine = candidate("asset:3", "library", "חלה בתנור")
        picked, _p, _r = photo_choice.choose([broken, fine], {"title": "חלה"}, {})
        self.assertEqual(picked.key, "asset:3")

    def test_month_usage_counts_come_from_stored_posts(self):
        posts = [{"image_url": "/x", "image_source": "asset", "image_asset_id": 1},
                 {"image_url": "/y", "image_candidate_key": "ig:9"},
                 {"image_url": "", "image_candidate_key": "ig:9"}]
        self.assertEqual(photo_choice.usage_counts(posts, exclude_index=None), {"asset:1": 1, "ig:9": 1})


def gemini_result(model="gemini-3.1-flash-image", usage=None):
    return {"data": b"nb2-bytes", "mime": "image/png", "model": model, "image_size": "1K",
            "usage": usage if usage is not None else {"prompt_tokens": 600, "output_tokens": 1120,
                                                       "thinking_tokens": 0, "output_image_tokens": 1120}}


class RoutingTest(unittest.TestCase):
    def route(self, task="edit"):
        return image_routing.route(task, muse_prompt="muse prompt", gemini_prompt="gemini prompt", aspect="4:5",
                                   photo=PHOTO if task == "edit" else None, label="REFERENCE PHOTO 1: x")

    def test_muse_makes_it_when_it_can(self):
        with mock.patch.object(muse_image, "edit", return_value=(b"muse", "image/jpeg")) as edit, \
                mock.patch.object(image_routing, "generate_image") as gemini:
            outcome = self.route()
        edit.assert_called_once()
        gemini.assert_not_called()
        self.assertEqual((outcome.provider, outcome.model, outcome.cost_usd), ("muse", "muse-image-1.0", 0.01))
        self.assertEqual(outcome.post_fields()["image_fallback_reason"], "")

    def test_a_muse_refusal_falls_back_to_nano_banana_2_with_the_photo_labelled(self):
        refused = muse_image.MuseRefused("400 content_policy_violation", code="content_policy_violation")
        with mock.patch.object(muse_image, "edit", side_effect=refused), \
                mock.patch.object(image_routing, "generate_image", return_value=gemini_result()) as gemini:
            outcome = self.route()
        args, kwargs = gemini.call_args
        self.assertEqual(kwargs["model"], "gemini-3.1-flash-image")
        self.assertEqual(kwargs["image_size"], "1K")
        self.assertEqual(kwargs["labelled"], [(PHOTO[0], PHOTO[1], "REFERENCE PHOTO 1: x")])
        self.assertEqual(args[0], "gemini prompt")
        self.assertEqual(outcome.provider, "gemini")
        self.assertEqual(outcome.fallback_reason, "muse refused (content_policy_violation)")
        self.assertEqual([a["outcome"] for a in outcome.attempts], ["refused", "ok"])
        self.assertEqual(outcome.attempts[0]["cost_usd"], 0.0, "a refused Muse image is not billed")
        self.assertAlmostEqual(outcome.cost_usd, 0.0675, places=3)

    def test_timeouts_and_errors_fall_back_too(self):
        for exc, reason in ((muse_image.MuseTimeout("slow", code="timeout"), "muse timed out"),
                            (muse_image.MuseImageError("missing", code="missing_key"), "muse error (missing_key)"),
                            (ContributorModelRefused("no"), "muse model refused (contributor models are never used)")):
            with self.subTest(reason=reason), \
                    mock.patch.object(muse_image, "generate", side_effect=exc), \
                    mock.patch.object(image_routing, "generate_image", return_value=gemini_result()) as gemini:
                outcome = self.route("generate")
                self.assertEqual(outcome.fallback_reason, reason)
                self.assertIsNone(gemini.call_args.kwargs["labelled"], "a new image has no reference")

    def test_the_provider_is_a_setting(self):
        settings = get_settings()
        with mock.patch.object(settings, "image_generate_provider", "gemini"), \
                mock.patch.object(settings, "gemini_image_model", "gemini-3-pro-image"), \
                mock.patch.object(muse_image, "generate") as muse, \
                mock.patch.object(image_routing, "generate_image", return_value=gemini_result("gemini-3-pro-image", {})) as gemini:
            outcome = self.route("generate")
        muse.assert_not_called()
        self.assertEqual(gemini.call_args.kwargs["model"], "gemini-3-pro-image")
        self.assertEqual(outcome.fallback_reason, "")
        self.assertAlmostEqual(outcome.cost_usd, 0.14, places=2)

    def test_no_fallback_model_means_the_error_shows(self):
        with mock.patch.object(get_settings(), "image_fallback_model", ""), \
                mock.patch.object(muse_image, "generate", side_effect=muse_image.MuseRefused("x")):
            with self.assertRaises(image_routing.ImageRoutingError):
                self.route("generate")

    def test_never_more_than_one_billed_image(self):
        with mock.patch.object(muse_image, "edit", return_value=(b"muse", "image/png")), \
                mock.patch.object(image_routing, "generate_image", return_value=gemini_result()) as gemini:
            outcome = self.route()
        gemini.assert_not_called()
        self.assertEqual(sum(1 for a in outcome.attempts if a["cost_usd"] > 0), 1)


class CostTest(unittest.TestCase):
    def test_list_prices_from_the_bench(self):
        self.assertEqual(estimate_cost("muse", "muse-image-1.0"), 0.01)
        self.assertEqual(estimate_cost("muse", "muse-image-1.0", produced=False), 0.0)
        self.assertAlmostEqual(estimate_cost("gemini", "gemini-3.1-flash-image", image_size="1K"), 0.068, places=3)
        self.assertAlmostEqual(estimate_cost("gemini", "gemini-3-pro-image", image_size="2K"), 0.140, places=3)
        self.assertAlmostEqual(estimate_cost("gemini", "gemini-3.1-flash-lite-image", image_size="1K"), 0.034, places=3)
        usage = {"prompt_tokens": 1000, "output_tokens": 1120, "output_image_tokens": 1120, "thinking_tokens": 0}
        self.assertAlmostEqual(estimate_cost("gemini", "gemini-3.1-flash-image", usage=usage), 0.0677, places=4)

    def test_the_retired_model_reads_as_nano_banana_2(self):
        from app.config import Settings

        self.assertEqual(Settings(gemini_image_model="gemini-2.5-flash-image").gemini_image_model,
                         "gemini-3.1-flash-image")
        self.assertEqual(Settings().gemini_image_model, "gemini-3.1-flash-image")
        self.assertEqual(Settings().gemini_image_size, "1K")
        self.assertEqual((Settings().image_generate_provider, Settings().image_edit_provider), ("muse", "muse"))


class MuseClientTest(unittest.TestCase):
    def client(self, handler):
        return httpx.Client(transport=httpx.MockTransport(handler))

    def test_edit_request_shape(self):
        seen = {}

        def handler(request):
            seen["path"] = request.url.path
            seen["auth"] = request.headers["authorization"]
            seen["body"] = json.loads(request.content)
            return httpx.Response(200, json={"data": [{"b64_json": base64.b64encode(b"\xff\xd8\xffjpeg").decode()}]})

        with mock.patch.object(get_settings(), "meta_model_api_key", "test-key"):
            data, mime = muse_image.edit("keep it", PHOTO, "9:16", client=self.client(handler))
        self.assertEqual((data[:3], mime), (b"\xff\xd8\xff", "image/jpeg"))
        self.assertEqual(seen["path"], "/v1/images/edits")
        self.assertEqual(seen["auth"], "Bearer test-key")
        body = seen["body"]
        self.assertEqual((body["model"], body["size"], body["n"], body["response_format"]),
                         ("muse-image-1.0", "1080x1920", 1, "b64_json"))
        self.assertTrue(body["images"][0]["image_url"].startswith("data:image/png;base64,"))

    def test_a_policy_refusal_is_its_own_error_and_never_echoes_the_key(self):
        def handler(request):
            return httpx.Response(400, json={"error": {"code": "content_policy_violation",
                                                       "message": "The response was filtered due to the prompt triggering our content management policy."}})

        with mock.patch.object(get_settings(), "meta_model_api_key", "secret-key"):
            with self.assertRaises(muse_image.MuseRefused) as caught:
                muse_image.generate("a bra on a hanger", "4:5", client=self.client(handler))
        self.assertEqual(caught.exception.code, "content_policy_violation")
        self.assertNotIn("secret-key", str(caught.exception))

    def test_a_contributor_model_is_refused_before_any_request(self):
        def handler(request):  # pragma: no cover - must not be reached
            raise AssertionError("no request may be sent")

        settings = get_settings()
        with mock.patch.object(settings, "meta_model_api_key", "k"), \
                mock.patch.object(settings, "muse_image_model", "muse-image-1.0-contributor"):
            with self.assertRaises(ContributorModelRefused):
                muse_image.generate("x", "4:5", client=self.client(handler))

    def test_no_key_fails_without_a_request(self):
        with self.assertRaises(muse_image.MuseImageError) as caught:
            muse_image.generate("x", "4:5", client=self.client(lambda r: httpx.Response(500)))
        self.assertEqual(caught.exception.code, "missing_key")


class EndpointTest(DnaTestCase, unittest.TestCase):
    """POST /strategy/posts/image, end to end, with the models faked."""

    def setUp(self):
        self.setUp_dna()
        self.business = self.add_business("מאפיית תום", offerings="חלות ולחם")
        self.business.brand_dna_json = dumps(design_dna.preview_dna(self.business))
        folder = self.media / str(self.business.id)
        folder.mkdir()
        for name in ("asset-cake.png", "asset-challah.png"):
            (folder / name).write_bytes(PHOTO[0])
        self.db.add_all([
            Asset(business_id=self.business.id, filename="asset-cake.png", mime="image/png",
                  description="עוגת שוקולד", tags_json=dumps(["עוגה"])),
            Asset(business_id=self.business.id, filename="asset-challah.png", mime="image/png",
                  description="חלה קלועה", tags_json=dumps(["חלה"])),
            InstagramPost(business_id=self.business.id, media_id="m1", caption="בוקר במאפייה",
                          media_type="IMAGE", media_url="https://cdn.example.test/m1.jpg"),
        ])
        posts = [
            {"uid": "p1", "title": "החלות של שישי", "format": "image", "featured_item_name": "חלה",
             "design_creative": {"scene_description": "x"}, "scene_description": "a challah"},
            {"uid": "p2", "title": "קרואסון חמאה", "format": "image", "featured_item_name": "קרואסון",
             "design_creative": {"scene_description": "x"}, "scene_description": "a croissant"},
        ]
        self.strategy = Strategy(business_id=self.business.id, year=2026, month=10, usp_json="{}",
                                 calendar_json="[]", roadmap_json=dumps({"roadmap": {"posts": posts}}))
        self.db.add(self.strategy)
        self.db.commit()
        self.client = self.client_for(self.business)

    def usage(self):
        return self.db.query(ImageUsage).filter(ImageUsage.business_id == self.business.id).order_by(ImageUsage.id).all()

    def test_the_matching_own_photo_is_edited_by_muse(self):
        with mock.patch.object(muse_image, "edit", return_value=(png_bytes(4, 5), "image/png")) as edit, \
                mock.patch.object(image_routing, "generate_image") as gemini:
            response = self.client.post("/strategy/posts/image", json={"post_index": 0})
        self.assertEqual(response.status_code, 200, response.text)
        post = response.json()["post"]
        self.assertEqual((post["image_source"], post["image_origin"], post["image_match"]), ("asset", "library", "subject"))
        challah = self.db.query(Asset).filter(Asset.filename == "asset-challah.png").one()
        self.assertEqual(post["image_asset_id"], challah.id, "the challah photo, not the first one")
        self.assertTrue(post["image_edited"])
        self.assertEqual((post["image_provider"], post["image_model"], post["image_cost_usd"]), ("muse", "muse-image-1.0", 0.01))
        self.assertIn("design", post)
        prompt = edit.call_args.args[0]
        self.assertIn("Keep what it shows exactly as it is", prompt)
        self.assertIn(design_dna.load_dna(self.business)["photo"]["grade"], prompt)
        gemini.assert_not_called()
        rows = self.usage()
        self.assertEqual([(r.provider, r.task, r.outcome, r.post_uid) for r in rows], [("muse", "edit", "ok", "p1")])
        self.assertEqual(rows[0].est_cost_usd, 0.01)

    def test_a_refused_edit_falls_back_and_both_attempts_are_logged(self):
        refused = muse_image.MuseRefused("400 content_policy_violation", code="content_policy_violation")
        with mock.patch.object(muse_image, "edit", side_effect=refused), \
                mock.patch.object(image_routing, "generate_image", return_value=gemini_result()) as gemini:
            post = self.client.post("/strategy/posts/image", json={"post_index": 0}).json()["post"]
        self.assertEqual(post["image_provider"], "gemini")
        self.assertEqual(post["image_fallback_reason"], "muse refused (content_policy_violation)")
        self.assertIn("REFERENCE PHOTO 1", gemini.call_args.args[0])
        self.assertEqual([(r.provider, r.outcome) for r in self.usage()], [("muse", "refused"), ("gemini", "ok")])

    def test_a_failed_edit_keeps_the_real_photo_as_it_is(self):
        with mock.patch.object(muse_image, "edit", side_effect=muse_image.MuseTimeout("slow", code="timeout")), \
                mock.patch.object(image_routing, "generate_image", side_effect=RuntimeError("503")):
            post = self.client.post("/strategy/posts/image", json={"post_index": 0}).json()["post"]
        self.assertEqual(post["image_source"], "asset")
        self.assertFalse(post["image_edited"])
        self.assertTrue(post["image_url"])
        self.assertIn("503", post["image_edit_error"])

    def test_no_matching_photo_means_a_new_image_from_the_dna(self):
        with mock.patch.object(muse_image, "generate", return_value=(png_bytes(4, 5), "image/png")) as muse, \
                mock.patch.object(muse_image, "edit") as edit:
            post = self.client.post("/strategy/posts/image", json={"post_index": 1}).json()["post"]
        edit.assert_not_called()
        self.assertEqual((post["image_source"], post["image_provider"]), ("generated", "muse"))
        prompt = muse.call_args.args[0]
        self.assertIn(design_dna.load_dna(self.business)["photo"]["light"], prompt)
        self.assertIn("People's faces", prompt)

    def test_browsing_never_spends(self):
        with mock.patch.object(muse_image, "edit") as edit, mock.patch.object(muse_image, "generate") as gen:
            first = self.client.post("/strategy/posts/image", json={"post_index": 0, "allow_generation": False}).json()["post"]
            second = self.client.post("/strategy/posts/image", json={"post_index": 1, "allow_generation": False}).json()["post"]
        edit.assert_not_called()
        gen.assert_not_called()
        self.assertEqual((first["image_source"], first["image_edited"]), ("asset", False))
        self.assertEqual(second["image_source"], "pending")
        self.assertEqual(self.usage(), [])

    def test_the_design_endpoint_uses_the_real_photo_too(self):
        creative = {"creative_concept": "c", "visual_style": "v", "scene_description": "a challah on the counter",
                    "has_overlay": True, "overlay_headline": "חלות לשישי", "overlay_badge": "שישי"}
        with mock.patch("app.services.designer.strategy_json", return_value=json.dumps(creative)) as designer, \
                mock.patch.object(muse_image, "edit", return_value=(png_bytes(4, 5), "image/png")):
            response = self.client.post("/strategy/posts/design", json={"post_index": 0, "composition": "circle_crop"})
        self.assertEqual(response.status_code, 200, response.text)
        post = response.json()["post"]
        self.assertEqual(post["design"]["composition"], "circle_crop")
        self.assertEqual((post["image_source"], post["image_edited"]), ("asset", True))
        prompt = designer.call_args.args[0]
        self.assertIn("תמונה עגולה", prompt)
        self.assertNotIn("החלות החמות של שישי", prompt, "no bakery examples in the designer prompt")
        self.assertNotIn("overlay_theme", json.dumps(designer.call_args.args[1]))


if __name__ == "__main__":
    unittest.main()
