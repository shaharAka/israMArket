"""Tests for the card-image decision logic — who gets a photo, and who pays for one."""

import unittest

from app.services.images import (
    _SAFE_ZONE,
    build_image_prompt,
    needs_photo,
    read_stored_bytes,
    resolve_template,
)


class TemplateTest(unittest.TestCase):
    def test_legacy_themes_map_onto_real_compositions(self):
        expected = {
            "ink_pill": "lower_editorial",
            "minimal_text": "cover_type",
            "paper_badge": "framed_inset",
            "frosted_glass": "split_panel",
            "accent_banner": "promo_ribbon",
        }
        for legacy, modern in expected.items():
            with self.subTest(legacy=legacy):
                self.assertEqual(resolve_template(legacy), modern)

    def test_unknown_and_missing_fall_back(self):
        self.assertEqual(resolve_template(None), "lower_editorial")
        self.assertEqual(resolve_template("nonsense"), "lower_editorial")

    def test_type_hero_needs_no_photo(self):
        self.assertFalse(needs_photo("type_hero"))

    def test_photo_templates_need_a_photo(self):
        for theme in ("lower_editorial", "split_panel", "framed_inset", "cover_type", "promo_ribbon", None):
            with self.subTest(theme=theme):
                self.assertTrue(needs_photo(theme))


class PromptTest(unittest.TestCase):
    def _prompt(self, **post):
        base = {"format": "image", "title": "t", "scene_description": "s", "has_overlay": True}
        base.update(post)
        return build_image_prompt(base, {"palette": [{"name": "x", "hex": "#123456"}]}, {"name": "b"})

    def test_never_list_is_present(self):
        prompt = self._prompt(overlay_theme="lower_editorial")
        for banned in ("no lens flare", "gradients", "Collage, split panels", "watermarks"):
            with self.subTest(banned=banned):
                self.assertIn(banned, prompt)

    def test_composition_zone_follows_the_template(self):
        split = self._prompt(overlay_theme="split_panel")
        self.assertIn("UPPER portion", split)
        lower = self._prompt(overlay_theme="lower_editorial")
        self.assertIn("BOTTOM THIRD", lower)

    def test_zones_never_invite_an_empty_or_painted_band(self):
        """Real cards came back with a flat brand-coloured band painted across the
        bottom, because the zone text described the layout panel to the image model —
        which then drew it — and the renderer covered it with another one."""
        for theme in ("split_panel", "lower_editorial", "cover_type", "promo_ribbon"):
            with self.subTest(theme=theme):
                prompt = self._prompt(overlay_theme=theme)
                self.assertNotIn("solid brand-colour panel", prompt)
                self.assertNotIn("accent band covers", prompt)
                self.assertNotIn("deliberate negative space", prompt)
                self.assertIn("no panels, bands, bars", prompt)

    def test_orientation_follows_the_format(self):
        self.assertIn("9:16", self._prompt(format="reel"))
        self.assertIn("4:5", self._prompt(format="image"))

    def test_hero_mode_drops_the_text_zone_language(self):
        hero = self._prompt(has_overlay=False)
        self.assertIn("hero photograph", hero)
        self.assertNotIn("Graphic text WILL be added", hero)

    def test_every_template_has_a_zone_definition(self):
        for key in ("lower_editorial", "split_panel", "framed_inset", "cover_type", "promo_ribbon"):
            with self.subTest(key=key):
                self.assertIn(key, _SAFE_ZONE)


class StoredImageTest(unittest.TestCase):
    def test_reads_back_a_stored_file(self):
        from app.services.images import media_root, store_image_bytes

        url = store_image_bytes(999_999, "unit-test-photo", b"fake-bytes", "image/webp")
        loaded = read_stored_bytes(url)
        self.assertIsNotNone(loaded)
        data, mime = loaded
        self.assertEqual(data, b"fake-bytes")
        self.assertEqual(mime, "image/webp")

        # clean up
        path = media_root() / "999999"
        for child in path.glob("*"):
            child.unlink()
        path.rmdir()

    def test_rejects_foreign_and_traversing_urls(self):
        self.assertIsNone(read_stored_bytes("https://evil.example/x.png"))
        self.assertIsNone(read_stored_bytes("/backend/media/"))
        self.assertIsNone(read_stored_bytes("/backend/media/1/../../etc/passwd"))


if __name__ == "__main__":
    unittest.main()
