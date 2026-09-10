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


class CostModelTest(unittest.TestCase):
    """The old budget bands were invented. These assert the model stays anchored to the
    published Israeli ranges, and that it reports ranges rather than false precision."""

    def test_stages_track_the_published_budget_floors(self):
        from app.services.cost_model import plan_from_budget

        self.assertEqual(plan_from_budget(1_000).stage, "below_viable")
        self.assertEqual(plan_from_budget(3_000).stage, "validation")
        self.assertEqual(plan_from_budget(7_000).stage, "growth")
        self.assertEqual(plan_from_budget(15_000).stage, "scale")

    def test_derived_numbers_are_ranges_not_single_values(self):
        from app.services.cost_model import plan_from_budget

        p = plan_from_budget(7_000)
        for lo, hi in (p.expected_impressions, p.expected_clicks, p.expected_purchases):
            self.assertLess(lo, hi)
        self.assertLess(p.realistic_roas[0], p.realistic_roas[1])

    def test_roas_stays_inside_the_published_range(self):
        from app.services.cost_model import ROAS_COLD, plan_from_budget

        for budget in (1_000, 3_000, 7_000, 15_000, 100_000):
            with self.subTest(budget=budget):
                self.assertEqual(tuple(plan_from_budget(budget).realistic_roas), ROAS_COLD)

    def test_small_budgets_warn_instead_of_promising_results(self):
        from app.services.cost_model import plan_from_budget

        self.assertTrue(plan_from_budget(1_000).warnings)
        self.assertTrue(plan_from_budget(3_000).warnings)  # under the 50-event floor

    def test_every_plan_names_its_source_and_assumptions(self):
        from app.services.cost_model import plan_from_budget

        p = plan_from_budget(5_000)
        self.assertTrue(p.source.startswith("http"))
        self.assertTrue(any("CPM" in a for a in p.assumptions))
        self.assertTrue(any("CPA" in a for a in p.assumptions))

    def test_prompt_block_forbids_invented_targets(self):
        from app.services.cost_model import plan_from_budget, prompt_block

        block = prompt_block(plan_from_budget(5_000))
        self.assertIn("אסור להמציא יעד", block)
        self.assertIn("CPM", block)
