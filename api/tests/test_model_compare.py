"""The genericness checks in scripts/compare_post_models.py (pure functions, no model calls)."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import compare_post_models as compare  # noqa: E402

BUSINESS = {"name": "מאפיית הדר", "location": "חיפה", "offerings": 'חלות מתוקות, 100 חלות כל שישי, קרואסון Valrhona'}
PROFILE = {"offers": ["חלות", "עוגות שמרים"], "proof_points": []}
BRAND = {"do_say": ["בואו לטעום"], "offers_seen": []}


def post(hook: str, caption: str = "", fmt: str = "image") -> dict:
    return {"hook": hook, "caption": caption, "title": "", "cta": "", "overlay_text": "", "format": fmt}


class GenericnessChecksTest(unittest.TestCase):
    def setUp(self):
        self.facts = compare.business_facts(BUSINESS, PROFILE, BRAND)
        self.known = compare.source_numbers(BUSINESS, PROFILE)

    def test_facts_include_numbers_and_brands(self):
        self.assertIn("100 חלות כל שישי", self.facts)
        self.assertIn("קרואסון Valrhona", self.facts)
        self.assertTrue(compare.is_specific_fact("קרואסון Valrhona"))
        self.assertFalse(compare.is_specific_fact("עוגות שמרים"))

    def test_cliches_and_template_openers_are_flagged(self):
        check = compare.check_post(post("מחפשים משהו מתוק לשבת?", "אל תפספסו, מחכים לכם!"), self.facts, self.known)
        self.assertIn("אל תפספסו", check["cliches"])
        self.assertIn("מחכים לכם", check["cliches"])
        self.assertEqual(check["template_opener"], "מחפשים")
        self.assertIn("no_business_facts", check["flags"])

    def test_brand_phrases_are_voice_not_cliche(self):
        check = compare.check_post(post("בואו לטעום את החלה של שישי"), self.facts, self.known, ("בואו לטעום",))
        self.assertEqual(check["cliches"], [])

    def test_specific_facts_and_unsourced_numbers(self):
        check = compare.check_post(
            post("100 חלות כל שישי בחיפה", "ו-350 לקוחות מרוצים"), self.facts, self.known, business_name="מאפיית הדר"
        )
        self.assertIn("100 חלות כל שישי", check["specific_facts_found"])
        self.assertEqual(check["unsourced_numbers"], ["350"])
        self.assertIn("unsourced_numbers", check["flags"])

    def test_set_summary_counts_repeated_openers_and_formats(self):
        posts = [
            post("החלה של שישי כבר בתנור", fmt="reel"),
            post("החלה של שישי יוצאת ב-07:00", fmt="reel"),
            post("עוגת שמרים לסוכות, בלי מרגרינה", fmt="carousel"),
        ]
        result = compare.check_set(posts, self.facts, self.known)
        self.assertEqual(result["summary"]["repeated_openers"], 2)
        self.assertEqual(result["summary"]["formats"], {"reel": 2, "carousel": 1})
        self.assertEqual(result["summary"]["format_variety"], 0.67)

    def test_hook_length_flags(self):
        long_hook = " ".join(["מילה"] * (compare.HOOK_MAX_WORDS + 1))
        self.assertIn("hook_too_long", compare.check_post(post(long_hook), self.facts, self.known)["flags"])
        self.assertIn("hook_too_short", compare.check_post(post("היי"), self.facts, self.known)["flags"])

    def test_report_is_blind(self):
        checked = compare.check_set([post("חלה")], self.facts, self.known)
        sides = {
            "A": {"items": list(zip([post("חלה")], checked["checks"])), "summary": checked["summary"], "errors": []},
            "B": {"items": [], "summary": checked["summary"], "errors": ["boom"]},
        }
        page = compare.render_report("t", "מאפיית הדר", sides).lower()
        for leak in ("gemini", "muse", "llama", "boom"):
            self.assertNotIn(leak, page)


if __name__ == "__main__":
    unittest.main()
