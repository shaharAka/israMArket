"""Each post's design from its business's DNA: rotation, format, old posts, storage."""
import _test_env  # noqa: F401  (must come before any `app` import)

import json
import unittest

from _dna_fixtures import DnaTestCase
from app.models import Strategy
from app.services import design_dna, month_posts
from app.services.dna_library import COMPOSITIONS, LEGACY_THEME_COMPOSITION
from app.services.jsonutil import dumps
from app.services.post_design import (
    assign_designs,
    clean_design,
    ensure_post_design,
    legacy_design,
    post_needs_photo,
    view_designs,
)

DNA = {"seed": 41827, "compositions": ["arch_window", "editorial_column", "ticket", "type_led"]}


def month(formats=None, mix=None):
    formats = formats or ["image", "carousel", "image", "reel", "image", "story", "image", "carousel"]
    return [{"title": f"פוסט {i}", "format": fmt, "mix_type": (mix or {}).get(i)} for i, fmt in enumerate(formats)]


class RotationTest(unittest.TestCase):
    def test_neighbours_never_share_a_composition(self):
        posts = assign_designs(month(), DNA)
        comps = [p["design"]["composition"] for p in posts]
        for a, b in zip(comps, comps[1:]):
            self.assertNotEqual(a, b, comps)
        self.assertTrue(set(comps) <= set(DNA["compositions"]))
        self.assertGreaterEqual(len(set(comps)), 3, "the month uses the DNA's range, not one layout")

    def test_the_format_sets_the_crop_and_vertical_posts_skip_feed_only_layouts(self):
        posts = assign_designs(month(), DNA)
        for post in posts:
            with self.subTest(format=post["format"]):
                vertical = post["format"] in {"reel", "story"}
                self.assertEqual(post["design"]["crop"], "9:16" if vertical else "4:5")
                if vertical:
                    self.assertNotEqual(post["design"]["composition"], "editorial_column")
                self.assertIn(post["design"]["text_position"],
                              COMPOSITIONS[post["design"]["composition"]].text_positions)

    def test_product_posts_never_get_the_photo_free_layout(self):
        posts = assign_designs(month(mix={i: "product" for i in range(8)}), DNA)
        self.assertNotIn("type_led", [p["design"]["composition"] for p in posts])
        self.assertTrue(all(post_needs_photo(p) for p in posts))

    def test_two_businesses_with_the_same_set_do_not_line_up(self):
        a = [p["design"]["composition"] for p in assign_designs(month(), {**DNA, "seed": 1})]
        b = [p["design"]["composition"] for p in assign_designs(month(), {**DNA, "seed": 2})]
        self.assertNotEqual(a, b)

    def test_a_chosen_design_is_kept(self):
        posts = month()
        posts[2]["design"] = {"composition": "circle_crop", "text_position": "top"}
        assign_designs(posts, DNA)
        self.assertEqual(posts[2]["design"], {"composition": "circle_crop", "crop": "4:5", "text_position": "top"})
        self.assertNotEqual(posts[1]["design"]["composition"], "circle_crop")
        self.assertNotEqual(posts[3]["design"]["composition"], "circle_crop")


class LegacyTest(unittest.TestCase):
    def test_old_layouts_map_to_the_closest_composition(self):
        expected = {
            "lower_editorial": ("full_bleed", "bottom"),
            "split_panel": ("split", "bottom"),
            "framed_inset": ("inset_frame", "bottom"),
            "cover_type": ("full_bleed", "top"),
            "promo_ribbon": ("stacked_bands", "top"),
            "type_hero": ("type_led", "center"),
            "ink_pill": ("full_bleed", "bottom"),
            "accent_banner": ("stacked_bands", "top"),
        }
        for theme, (composition, position) in expected.items():
            with self.subTest(theme=theme):
                design = legacy_design({"overlay_theme": theme, "format": "image"})
                self.assertEqual((design["composition"], design["text_position"]), (composition, position))
        self.assertEqual(set(LEGACY_THEME_COMPOSITION), set(expected) | {"minimal_text", "paper_badge", "frosted_glass"})

    def test_reading_old_posts_keeps_their_layout_and_new_ones_rotate(self):
        posts = [{"title": "ישן", "format": "image", "overlay_theme": "promo_ribbon"},
                 {"title": "חדש", "format": "image"},
                 {"title": "חדש", "format": "image"}]
        designs = view_designs(posts, DNA)
        self.assertEqual(designs[0]["composition"], "stacked_bands")
        self.assertNotEqual(designs[1]["composition"], designs[2]["composition"])
        self.assertNotIn("design", posts[1], "reading never writes")

    def test_a_redesign_moves_an_old_post_onto_the_dna(self):
        posts = [{"title": "ישן", "format": "image", "overlay_theme": "lower_editorial"}]
        kept = ensure_post_design(posts, 0, DNA)
        self.assertEqual(kept["composition"], "full_bleed")
        posts[0].pop("design")
        moved = ensure_post_design(posts, 0, DNA, prefer_dna=True)
        self.assertIn(moved["composition"], DNA["compositions"])

    def test_invalid_designs_are_rejected(self):
        self.assertIsNone(clean_design({"composition": "mosaic"}, {"format": "image"}))
        self.assertIsNone(clean_design({"composition": "editorial_column"}, {"format": "story"}))
        self.assertEqual(clean_design({"composition": "ticket", "text_position": "top"}, {"format": "image"}),
                         {"composition": "ticket", "crop": "4:5", "text_position": "bottom"})


class StorageTest(DnaTestCase, unittest.TestCase):
    def setUp(self):
        self.setUp_dna()
        self.business = self.add_business("מאפייה")
        self.business.brand_dna_json = dumps({**design_dna.preview_dna(self.business), **DNA})
        self.db.commit()

    def test_a_built_month_stores_a_design_on_every_post(self):
        from app.routers.strategy import upsert_generated_strategy

        generated = {"year": 2026, "month": 11, "usp": {}, "calendar": [], "posting_plan": {},
                     "roadmap": {"posts": month()}, "competitors": [], "brand_language": {}}
        strategy = upsert_generated_strategy(self.db, self.business, generated)
        self.db.commit()
        posts = json.loads(strategy.roadmap_json)["roadmap"]["posts"]
        comps = [p["design"]["composition"] for p in posts]
        self.assertTrue(all(c in DNA["compositions"] for c in comps))
        self.assertTrue(all(a != b for a, b in zip(comps, comps[1:])))
        self.assertNotIn("overlay_theme", posts[0], "new posts carry no old layout choice")

    def test_a_week_added_later_rotates_on_from_the_month(self):
        strategy = Strategy(business_id=self.business.id, year=2026, month=11, usp_json="{}", calendar_json="[]",
                            roadmap_json=dumps({"roadmap": {"posts": assign_designs(month()[:3], DNA)}}))
        self.db.add(strategy)
        self.db.commit()
        month_posts.add_week_posts(strategy, 2, [{"title": "חדש", "format": "image", "week": 2}],
                                   dna=design_dna.dna_for_posts(self.business))
        posts = json.loads(strategy.roadmap_json)["roadmap"]["posts"]
        self.assertIn(posts[3]["design"]["composition"], DNA["compositions"])
        self.assertNotEqual(posts[3]["design"]["composition"], posts[2]["design"]["composition"])

    def test_saving_a_post_validates_its_design_and_keeps_it_from_the_old_default(self):
        posts = assign_designs(month()[:2], DNA)
        strategy = Strategy(business_id=self.business.id, year=2026, month=10, usp_json="{}", calendar_json="[]",
                            roadmap_json=dumps({"roadmap": {"posts": posts}}))
        self.db.add(strategy)
        self.db.commit()
        client = self.client_for(self.business)
        body = {"post_index": 0, "title": "שמור", "format": "image"}
        bad = client.post("/strategy/posts/save", json={**body, "design": {"composition": "mosaic"}})
        self.assertEqual(bad.status_code, 422)
        ok = client.post("/strategy/posts/save", json={**body, "design": {"composition": "circle_crop",
                                                                           "text_position": "top"}})
        self.assertEqual(ok.status_code, 200, ok.text)
        self.assertEqual(ok.json()["post"]["design"], {"composition": "circle_crop", "crop": "4:5",
                                                        "text_position": "top"})
        again = client.post("/strategy/posts/save", json={**body, "format": "story"})
        stored = json.loads(self.db.get(Strategy, strategy.id).roadmap_json)["roadmap"]["posts"][0]
        self.assertEqual(again.status_code, 200)
        self.assertNotIn("overlay_theme", stored, "the old default no longer overwrites the layout")
        self.assertEqual(stored["design"]["crop"], "9:16")


if __name__ == "__main__":
    unittest.main()
