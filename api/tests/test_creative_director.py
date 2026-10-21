"""Direction affects real layout/media inputs and cannot widen asset access or spend."""
import _test_env  # noqa: F401
from copy import deepcopy
import json
import unittest
from unittest.mock import Mock

from _creative_fixtures import direction
from app.services import creative_director as director, designer
from app.services.campaign_revisions import snapshot, fingerprint


def creative(*, duration=0):
    return {"creative_concept": "בחירה בחומר דרך פעולה ולא צילום קטלוגי",
            "visual_style": "חומרים טבעיים ואור צד",
            "scene_description": "Hands slide a sage fabric sample beside a terracotta tile in warm light.",
            "has_overlay": False, "overlay_headline": "", "overlay_sub": "", "overlay_badge": "",
            "direction": direction(duration=duration)}


class DirectorTest(unittest.TestCase):
    def setUp(self):
        self.post = {"uid": "post-one", "title": "בחירת חומרים", "channel": "instagram", "format": "image",
                     "content_language": "he", "creative_brief": {"goal": "פניות לפגישת תכנון",
                     "assets": [{"id": 17, "kind": "image", "description": "בד מרווה"}],
                     "campaign_context": [{"title": "תכנון מעברים", "concept": "מבט מהדלת"}]}}
        self.brand = {"palette": [{"hex": "#123456"}], "typography": {"font": "Rubik"}, "voice": "ישיר"}
        self.dna = {"compositions": ["full_bleed", "inset_frame"]}

    def validate(self, value, **kwargs):
        return director.validate(value, self.post, choices=["full_bleed", "inset_frame"], assets=[{"id": 17}], **kwargs)

    def test_platform_brand_assets_audience_and_sequence_reach_the_planner(self):
        for channel in director.PLATFORMS:
            with self.subTest(channel=channel):
                self.post["channel"] = channel
                planner = Mock(return_value=json.dumps(creative()))
                result = director.plan(self.post, self.brand, {}, self.dna, planner=planner)
                prompt, schema = planner.call_args.args
                for text in ("#123456", "Rubik", "פניות לפגישת תכנון", "בד מרווה", "מבט מהדלת", director.PLATFORMS[channel]):
                    self.assertIn(text, prompt)
                self.assertIn("direction", schema["required"])
                self.assertEqual(result["direction"]["channel"], channel)
                planner.assert_called_once()

    def test_foreign_asset_and_unsupported_layout_are_rejected(self):
        for change in ({"asset_ids": [999]}, {"layout": {"composition": "invented", "text_position": "bottom", "text_mode": "photo_only"}}):
            value = creative(); value["direction"].update(change)
            with self.assertRaises(ValueError): self.validate(value)

    def test_video_plan_cannot_have_a_gap_overlap_or_wrong_duration(self):
        for start, end in ((1., 5.), (0., 4.), (0., 6.)):
            value = creative(duration=5)
            value["direction"]["shots"][0].update(start=start, end=end)
            with self.assertRaises(ValueError): self.validate(value, duration=5)
        result = self.validate(creative(duration=5), duration=5)
        self.assertEqual(result["direction"]["duration_seconds"], 5)
        value = creative(duration=5)
        value["direction"]["shots"] *= 2
        with self.assertRaises(ValueError): self.validate(value, duration=5)

    def test_image_has_no_accidental_video_script(self):
        with self.assertRaises(ValueError): self.validate(creative(duration=5))

    def test_director_cannot_add_a_price_or_discount_to_the_overlay(self):
        for text in ("רק 300 ₪", "20% הנחה"):
            value = creative(); value.update(has_overlay=True, overlay_headline=text)
            value["direction"]["layout"]["text_mode"] = "headline"
            with self.assertRaises(ValueError): self.validate(value)

    def test_invalid_direction_never_reaches_media_provider(self):
        provider = Mock()
        from unittest.mock import patch
        with patch.object(designer, "strategy_json", return_value=json.dumps({**creative(), "direction": {}})):
            with self.assertRaises(ValueError):
                designer.design_and_generate_post(1, self.post, self.brand, {}, dna=self.dna, image_provider=provider)
        provider.assert_not_called()

    def test_director_layout_reaches_renderer_and_persisted_revision(self):
        value = creative(); value["direction"]["layout"]["composition"] = "inset_frame"
        value = self.validate(value)
        before = fingerprint(self.post)
        designer.apply_creative_to_post(self.post, value, self.dna)
        self.assertEqual(self.post["design"]["composition"], "inset_frame")
        self.assertEqual(self.post["design"]["text_mode"], "photo_only")
        self.assertEqual(snapshot(self.post)["creative_direction"]["version"], director.VERSION)
        self.assertNotEqual(before, fingerprint(self.post))
        self.assertIn("design_creative", snapshot(self.post))

    def test_explicit_layout_is_locked_and_product_cards_stay_photographic(self):
        self.post["design"] = {"composition": "inset_frame", "crop": "4:5", "text_position": "bottom", "by_hand": True}
        self.assertEqual(director.layout_choices(self.post, self.dna), ["inset_frame"])
        self.post.pop("design")
        self.post["featured_item_name"] = "דגם אמיתי"
        self.assertNotIn("type_led", director.layout_choices(self.post, {"compositions": ["type_led", "full_bleed"]}))

    def test_video_prompt_carries_actual_action_timing_and_sound(self):
        value = self.validate(creative(duration=8), duration=8)
        director.apply_layout(self.post, value)
        self.post["scene_description"] = value["scene_description"]
        prompt = director.video_prompt(self.post)
        for text in ("8", "ידיים מבצעות", "מצלמה יציבה", "צלילי עבודה", "sage fabric"):
            self.assertIn(text, prompt)


if __name__ == "__main__":
    unittest.main()
