"""Tests for the card-image decision logic — who gets a photo, and who pays for one."""
import _test_env  # noqa: F401  (must come before any `app` import)

import unittest

from app.services.dna_library import COMPOSITIONS
from app.services.images import (
    FIELD_ART_DIRECTION,
    build_edit_prompt,
    build_image_prompt,
    composition_zone,
    read_stored_bytes,
)
from app.services.post_design import legacy_design, post_needs_photo

DNA = {
    "photo": {
        "grade": "faded teal shadows, warm highlights",
        "light": "late afternoon sun through the studio's steel window, from the left",
        "angle": "35mm, at mat height",
        "props": ["a rolled cork block", "a wool blanket"],
        "background": "the bare plaster wall of the Haifa studio",
        "never": ["incense smoke", "people's faces"],
    },
    "colors": {"paper": "#f2ede4", "accent": "#2f6f8f", "accent_2": "#c96f4a"},
}


class TemplateTest(unittest.TestCase):
    def test_names_older_than_the_six_layouts_map_like_them(self):
        expected = {
            "ink_pill": "lower_editorial",
            "minimal_text": "cover_type",
            "paper_badge": "framed_inset",
            "frosted_glass": "split_panel",
            "accent_banner": "promo_ribbon",
        }
        for legacy, modern in expected.items():
            with self.subTest(legacy=legacy):
                self.assertEqual(legacy_design({"overlay_theme": legacy}), legacy_design({"overlay_theme": modern}))

    def test_unknown_and_missing_fall_back(self):
        self.assertEqual(legacy_design({"overlay_theme": "nonsense"})["composition"], "full_bleed")
        self.assertIsNone(legacy_design({}))
        self.assertTrue(post_needs_photo({}))

    def test_type_hero_needs_no_photo(self):
        self.assertFalse(post_needs_photo({"overlay_theme": "type_hero"}))

    def test_photo_templates_need_a_photo(self):
        for theme in ("lower_editorial", "split_panel", "framed_inset", "cover_type", "promo_ribbon"):
            with self.subTest(theme=theme):
                self.assertTrue(post_needs_photo({"overlay_theme": theme}))

    def test_the_post_design_decides_before_the_old_theme(self):
        post = {"overlay_theme": "lower_editorial", "design": {"composition": "type_led"}}
        self.assertFalse(post_needs_photo(post))
        self.assertTrue(post_needs_photo({"overlay_theme": "type_hero", "design": {"composition": "arch_window"}}))


class PromptTest(unittest.TestCase):
    def _post(self, **post):
        base = {"format": "image", "title": "t", "scene_description": "s", "has_overlay": True}
        base.update(post)
        return base

    def _prompt(self, dna=None, business=None, **post):
        return build_image_prompt(
            self._post(**post),
            {"palette": [{"name": "x", "hex": "#123456"}]},
            business or {"name": "b", "business_type": "fitness", "offerings": "yoga classes"},
            dna,
        )

    def test_never_list_is_present(self):
        prompt = self._prompt(design={"composition": "full_bleed", "text_position": "bottom"})
        for banned in ("no lens flare", "gradients", "Collage, split panels", "watermarks", "People's faces"):
            with self.subTest(banned=banned):
                self.assertIn(banned, prompt)

    def test_the_dna_never_list_is_added(self):
        prompt = self._prompt(dna=DNA, design={"composition": "full_bleed"})
        self.assertIn("- incense smoke", prompt)

    def test_composition_zone_follows_the_design(self):
        bottom = self._prompt(design={"composition": "full_bleed", "text_position": "bottom"})
        self.assertIn("over the bottom third", bottom)
        top = self._prompt(design={"composition": "full_bleed", "text_position": "top"})
        self.assertIn("over the top third", top)
        arch = self._prompt(design={"composition": "arch_window"})
        self.assertIn("arch-shaped window", arch)

    def test_old_posts_get_the_zone_of_their_mapped_composition(self):
        self.assertIn("one half", self._prompt(overlay_theme="split_panel"))
        self.assertIn("over the bottom third", self._prompt(overlay_theme="lower_editorial"))
        self.assertIn("over the top third", self._prompt(overlay_theme="cover_type"))

    def test_zones_never_invite_an_empty_or_painted_band(self):
        """Real cards came back with a flat brand-coloured band painted across the
        bottom, because the zone text described the layout panel to the image model —
        which then drew it — and the renderer covered it with another one."""
        for key, comp in COMPOSITIONS.items():
            if not comp.photo:
                continue
            with self.subTest(composition=key):
                prompt = self._prompt(design={"composition": key})
                self.assertNotIn("solid brand-colour panel", prompt)
                self.assertNotIn("deliberate negative space", prompt)
                self.assertIn("no panels, bands, bars", prompt)

    def test_orientation_follows_the_format(self):
        self.assertIn("9:16", self._prompt(format="reel"))
        self.assertIn("4:5", self._prompt(format="image"))

    def test_hero_mode_drops_the_text_zone_language(self):
        hero = self._prompt(has_overlay=False)
        self.assertIn("hero photograph", hero)
        self.assertNotIn("headline is set over", hero)

    def test_the_dna_photo_direction_replaces_shared_wording(self):
        prompt = self._prompt(dna=DNA)
        self.assertIn("late afternoon sun through the studio's steel window", prompt)
        self.assertIn("a rolled cork block", prompt)
        # The fixed lighting and bakery phrases every business used to get.
        for shared in ("one clear source, natural and directional", "crumbs, flour", "worn wood",
                       "Shallow depth of field"):
            with self.subTest(shared=shared):
                self.assertNotIn(shared, prompt)

    def test_no_bakery_words_for_a_non_bakery(self):
        prompt = self._prompt(dna=DNA).lower()
        for word in ("bread", "flour", "loaf", "challah", "bakery", "oven", "crumb"):
            with self.subTest(word=word):
                self.assertNotIn(word, prompt)

    def test_field_art_direction_is_the_business_field(self):
        prompt = self._prompt(business={"name": "b", "business_type": "jewelry", "offerings": "rings"})
        self.assertIn(FIELD_ART_DIRECTION["jewelry"], prompt)
        self.assertNotIn(FIELD_ART_DIRECTION["food"], prompt)

    def test_every_composition_has_a_photo_zone(self):
        for key, comp in COMPOSITIONS.items():
            with self.subTest(key=key):
                self.assertTrue(comp.photo_zone)
                zone = composition_zone({"design": {"composition": key, "text_position": comp.text_positions[0]},
                                         "has_overlay": True})
                self.assertNotIn("{pos}", zone)


class EditPromptTest(unittest.TestCase):
    def test_edit_keeps_the_product_and_changes_only_light_background_grade(self):
        post = {"format": "image", "featured_item_name": "מחצלת שעם", "design": {"composition": "inset_frame"}}
        prompt = build_edit_prompt(post, DNA, {"name": "מרפסת", "business_type": "fitness"})
        self.assertIn("This is a real photo of מחצלת שעם", prompt)
        self.assertIn("Keep what it shows exactly as it is", prompt)
        self.assertIn("relight it as late afternoon sun", prompt)
        self.assertIn("the bare plaster wall", prompt)
        self.assertIn("faded teal shadows", prompt)

    def test_labelled_edit_names_the_reference(self):
        prompt = build_edit_prompt({"format": "story"}, DNA, {"name": "b"}, labelled=True)
        self.assertIn("REFERENCE PHOTO 1", prompt)
        self.assertIn("9:16", prompt)


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
        self.assertTrue(any("לאלף חשיפות" in a for a in p.assumptions))
        self.assertTrue(any("להביא קונה" in a for a in p.assumptions))

    def test_prompt_block_forbids_invented_targets(self):
        from app.services.cost_model import plan_from_budget, prompt_block

        block = prompt_block(plan_from_budget(5_000))
        self.assertIn("אסור להמציא יעד", block)
        self.assertIn("לאלף חשיפות", block)
