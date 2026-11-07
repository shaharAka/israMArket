"""Owner logo changes never fetch remote URLs, run models or rewrite saved posts."""
import _test_env  # noqa: F401
from pathlib import Path
from unittest import mock
from app.services import brand_logo, images, design_dna
from app.services.jsonutil import dumps, loads
from test_assets import AssetTestCase, png_bytes


class OwnerLogoTest(AssetTestCase):
    def setUp(self):
        super().setUp()
        self.logo_root = mock.patch.object(images, "media_root", return_value=self.media)
        self.logo_root.start()
        self.addCleanup(self.logo_root.stop)

    def upload(self):
        response = self.client.post("/assets/upload", files={"file": ("logo.png", png_bytes(40, 30), "image/png")})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["asset"]

    def test_save_owned_logo_without_site_scan_keeps_posts(self):
        strategy = self.add_strategy()
        before = strategy.roadmap_json
        asset = self.upload()
        with mock.patch.object(brand_logo, "fetch", side_effect=AssertionError("no network")):
            result = self.client.post("/onboarding/logo", json={"asset_id": asset["id"]})
        self.assertEqual(result.status_code, 200, result.text)
        business = result.json()["business"]
        url = business["brand_language"]["logo_url"]
        self.assertTrue(url.startswith(f"/backend/media/{self.business.id}/logo-"))
        self.db.refresh(self.business)
        self.assertEqual(brand_logo.logo_url_of(self.business), url)
        self.assertTrue(brand_logo.usable(loads(self.business.brand_logo_json)))
        self.db.refresh(strategy)
        self.assertEqual(strategy.roadmap_json, before)
        self.assertEqual(self.client.get("/onboarding/me").json()["business"]["brand_language"]["logo_url"], url)

    def test_other_business_asset_is_indistinguishable_from_missing(self):
        other = self.add_asset(business=self.rival)
        a = self.client.post("/onboarding/logo", json={"asset_id": other.id})
        b = self.client.post("/onboarding/logo", json={"asset_id": 999999})
        self.assertEqual(a.status_code, 404)
        self.assertEqual(a.json(), b.json())

    def test_reject_video_svg_missing_file_and_url_input(self):
        for asset in [self.add_asset(kind="video", mime="video/mp4"), self.add_asset(mime="image/svg+xml"), self.add_asset()]:
            self.assertIn(self.client.post("/onboarding/logo", json={"asset_id": asset.id}).status_code, [404, 422])
        self.assertEqual(self.client.post("/onboarding/logo", json={"logo_url": "https://example.com/a.png"}).status_code, 422)
        self.assertEqual(self.client.post("/onboarding/logo", json={"asset_id": True}).status_code, 422)

    def test_clear_does_not_resurrect_old_site_logo_or_delete_exported_file(self):
        asset = self.upload()
        self.assertEqual(self.client.post("/onboarding/logo", json={"asset_id": asset["id"]}).status_code, 200)
        self.db.refresh(self.business)
        record = loads(self.business.brand_logo_json)
        stored = loads(self.business.scraped_profile_json)
        stored["raw"] = {"logo_url": "https://old.example/logo.png"}
        self.business.scraped_profile_json = dumps(stored)
        self.db.commit()
        response = self.client.post("/onboarding/logo", json={"asset_id": None})
        self.assertEqual(response.status_code, 200)
        self.db.refresh(self.business)
        self.assertEqual(brand_logo.logo_url_of(self.business), "")
        self.assertTrue((Path(self.media) / str(self.business.id) / record["filename"]).is_file())

    def test_oversized_or_corrupt_image_does_not_replace_logo(self):
        asset = self.add_asset()
        folder = self.media / str(self.business.id)
        folder.mkdir(parents=True, exist_ok=True)
        file = folder / asset.filename
        for content in [b"not an image", b"x" * (5 * 1024 * 1024 + 1)]:
            file.write_bytes(content)
            self.assertEqual(self.client.post("/onboarding/logo", json={"asset_id": asset.id}).status_code, 422)
            self.db.refresh(self.business)
            self.assertFalse(self.business.brand_logo_json)

    def test_save_other_brand_fields_preserves_owned_logo_and_unknown_fields(self):
        asset = self.upload()
        response = self.client.post("/onboarding/logo", json={"asset_id": asset["id"]})
        brand = response.json()["business"]["brand_language"]
        brand["voice"] = "חם וקצר"
        with mock.patch("app.services.design_dna.refresh_after_scan"):
            saved = self.client.post("/onboarding/brand", json=brand)
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["business"]["brand_language"]["logo_url"], brand["logo_url"])
        self.assertEqual(saved.json()["business"]["brand_language"]["voice"], "חם וקצר")
        brand["logo_url"] = "/backend/media/999/logo-abcdef.png"
        self.assertEqual(self.client.post("/onboarding/brand", json=brand).status_code, 422)

    def test_logo_signature_carries_hex_strings_not_pixel_evidence_objects(self):
        # The browser renderer consumes strings; pixel evidence belongs in the logo record.
        with mock.patch.object(design_dna, "_ask_model", return_value=None):
            original = self.client.get("/brand/dna").json()["brand_dna"]
        self.assertTrue(original)
        asset = self.upload()
        response = self.client.post("/onboarding/logo", json={"asset_id": asset["id"]})
        self.assertEqual(response.status_code, 200, response.text)
        self.db.refresh(self.business)
        dna = design_dna.load_dna(self.business)
        self.assertEqual(dna["seed"], original["seed"])
        self.assertEqual(dna["type"], original["type"])
        self.assertTrue(dna["signature"]["use_logo"])
        self.assertTrue(dna["signature"]["logo_colors"])
        self.assertTrue(all(isinstance(color, str) and color.startswith("#") for color in dna["signature"]["logo_colors"]))
