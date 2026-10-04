"""Design DNA: library keys only, unique in its field, the owner's endpoints, the scan hook.

Every model call is replaced by `FakeDnaModel` (or made to fail); nothing leaves the machine.
"""
import _test_env  # noqa: F401  (must come before any `app` import)

import itertools
import json
import unittest
from unittest import mock

from fastapi import BackgroundTasks

from _dna_fixtures import FRESH, WARM, DnaTestCase, FakeDnaModel
from app.config import get_settings
from app.models import Business
from app.services import design_dna
from app.services.design_dna import (
    DEFAULT_NEVER,
    FIELD_MIN_DISTANCE,
    MAX_TRIES,
    candidates,
    contrast,
    distance,
    signals_for,
    validate_dna,
)
from app.services.dna_library import (
    COMPOSITIONS,
    DISPLAY_FONTS,
    FONTS,
    MOTIFS,
    SIGNATURES,
    TEXT_FONTS,
    library_payload,
    nearest_font,
    snap_weight,
)

SHARED_FONTS = ["frank-ruhl-libre", "noto-serif-hebrew", "david-libre", "bellefair", "suez-one", "secular-one", "rubik",
                "assistant", "ibm-plex-sans-hebrew", "heebo", "varela-round", "karantina", "amatic-sc",
                "playpen-sans-hebrew"]
SHARED_COMPOSITIONS = ["full_bleed", "inset_frame", "split", "type_led", "stacked_bands", "corner_tab", "arch_window",
                       "circle_crop", "ticket", "collage_grid", "handwritten_note", "editorial_column"]
SHARED_MOTIFS = ["none", "scalloped_edge", "stripes", "arches", "dots", "grain", "stamp", "underline", "tape", "thread"]
SHARED_SIGNATURES = ["corner_mark", "footer_band", "name_only", "none"]


def assert_library_only(test: unittest.TestCase, dna: dict) -> None:
    test.assertIn(dna["type"]["display"], DISPLAY_FONTS)
    test.assertIn(dna["type"]["text"], TEXT_FONTS)
    test.assertIn(dna["type"]["display_weight"], FONTS[dna["type"]["display"]].weights)
    test.assertIn(dna["type"]["text_weight"], FONTS[dna["type"]["text"]].weights)
    test.assertTrue(3 <= len(dna["compositions"]) <= 4)
    test.assertEqual(len(set(dna["compositions"])), len(dna["compositions"]))
    for key in dna["compositions"]:
        test.assertIn(key, COMPOSITIONS)
    test.assertGreaterEqual(
        sum(1 for c in dna["compositions"] if COMPOSITIONS[c].photo and "9:16" in COMPOSITIONS[c].crops), 2,
        "two photo layouts that also fit a reel or a story",
    )
    test.assertIn(dna["motif"]["kind"], MOTIFS)
    test.assertIn(dna["signature"]["kind"], SIGNATURES)
    for role in ("ink", "paper", "accent", "accent_2", "on_photo", "tint"):
        test.assertRegex(dna["colors"][role], r"^#[0-9a-f]{6}$")
        test.assertIn(dna["colors_source"][role], ("logo", "site", "derived", "owner"))
    test.assertGreaterEqual(contrast(dna["colors"]["ink"], dna["colors"]["paper"]), 4.5)
    # v2: an art direction in Hebrew, a photo-led mix, no shared skeleton.
    test.assertEqual(dna["version"], 2)
    for key in ("feel_he", "world_he", "photo_he", "text_he"):
        test.assertRegex(dna["direction"][key], r"[֐-׿]")
    test.assertTrue(3 <= len(dna["direction"]["never_he"]) <= 5)
    test.assertAlmostEqual(sum(dna["mix"].values()), 1.0, places=2)
    test.assertFalse(dna["copy"]["cta_on_image"])
    if not dna["signature"]["use_logo"]:
        test.assertIn(dna["signature"]["kind"], ("name_only", "none"), "never an invented mark")


class LibraryTest(unittest.TestCase):
    def test_the_library_is_exactly_the_shared_keys(self):
        payload = library_payload()
        self.assertEqual([f["key"] for f in payload["fonts"]], SHARED_FONTS)
        self.assertEqual([c["key"] for c in payload["compositions"]], SHARED_COMPOSITIONS)
        self.assertEqual([m["key"] for m in payload["motifs"]], SHARED_MOTIFS)
        self.assertEqual([s["key"] for s in payload["signatures"]], SHARED_SIGNATURES)

    def test_every_font_says_how_to_load_it(self):
        for font in library_payload()["fonts"]:
            with self.subTest(font=font["key"]):
                self.assertTrue(font["google_fonts"].startswith(font["family"].replace(" ", "+") + ":wght@"))

    def test_site_fonts_map_to_the_nearest_library_family(self):
        cases = {
            "Frank Ruhl Libre": "frank-ruhl-libre",
            "'Heebo', sans-serif": "heebo",
            "Open Sans Hebrew": "assistant",
            "Playfair Display": "frank-ruhl-libre",
            "Bebas Neue": "karantina",
            "Assistant ExtraBold": "assistant",
            "Some Rounded Thing": "varela-round",
            "Custom Slab": "suez-one",
            "": None,
            "wfont_8a1b2c": None,
        }
        for name, key in cases.items():
            with self.subTest(name=name):
                self.assertEqual(nearest_font(name), key)

    def test_weights_snap_to_what_the_family_ships(self):
        self.assertEqual(snap_weight("bellefair", 800), 400)
        self.assertEqual(snap_weight("david-libre", 650), 700)
        self.assertEqual(snap_weight("heebo", 900, role="text"), 600)


class ValidationTest(DnaTestCase, unittest.TestCase):
    def setUp(self):
        self.setUp_dna()

    def test_a_garbage_answer_becomes_library_keys_only(self):
        business = self.add_business("פיתות הדר", offerings="פיתות וסלטים", logo=False)
        signals = signals_for(self.db, business)
        cands = candidates(1234, signals)
        raw = {
            "type": {"display": "Comic Sans", "display_weight": 1200, "text": "papyrus", "text_weight": -3},
            "colors": {"ink": "#fff", "paper": "#ffffff", "accent": "not a colour", "on_photo": "#777777"},
            "compositions": ["mosaic", "type_led", "type_led"],
            "motif": {"kind": "glitter", "color": "neon", "density": "max"},
            "signature": {"kind": "watermark", "use_logo": True},
            "photo": "nope",
            "copy": {"price_style": "banner", "cta_style": "blink"},
            "rationale_he": "Great style!",
        }
        dna = validate_dna(raw, signals, cands, 1234)
        assert_library_only(self, dna)
        self.assertFalse(dna["signature"]["use_logo"], "no logo was found, so none can be used")
        for item in DEFAULT_NEVER:
            self.assertIn(item, dna["photo"]["never"])
        self.assertTrue(all(dna["photo"][key] for key in ("grade", "light", "angle", "background")))
        self.assertRegex(dna["rationale_he"], r"[֐-׿]")
        self.assertNotIn("Great", dna["rationale_he"])

    def test_an_off_brand_colour_is_replaced_by_the_brand_own(self):
        business = self.add_business("מאפה", palette=WARM)
        signals = signals_for(self.db, business)
        dna = validate_dna({"colors": {"accent": "#00ff00", "paper": "#f7f0e6", "ink": "#2b211c"}}, signals,
                           candidates(5, signals), 5)
        # v2: the logo's own colour is the accent (the fixture's logo measures #c0643b).
        self.assertEqual(dna["colors"]["accent"], "#c0643b")
        self.assertEqual(dna["colors_source"]["accent"], "logo")
        self.assertEqual(dna["colors"]["paper"], "#f7f0e6")

    def test_the_site_font_is_preferred_when_the_model_names_none(self):
        business = self.add_business("סטודיו", field="fitness", fonts=["Rubik", "Open Sans"], typography="Rubik")
        signals = signals_for(self.db, business)
        self.assertEqual(signals["mapped_fonts"][:2], ["rubik", "assistant"])
        cands = candidates(77, signals)
        self.assertEqual(cands["display"][0], "rubik")
        dna = validate_dna({}, signals, cands, 77)
        self.assertEqual(dna["type"]["display"], "rubik")
        self.assertNotEqual(dna["type"]["text"], "rubik", "headline and text must be told apart")

    def test_photo_direction_drops_bakery_words_and_stock_phrases_for_a_non_bakery(self):
        business = self.add_business("מרפסת", field="fitness", offerings="יוגה בבוקר על הכרמל", palette=FRESH)
        signals = signals_for(self.db, business)
        self.assertFalse(signals["is_bakery"])
        raw = {"photo": {
            "grade": "soft natural light, cool morning blue",
            "light": "dawn through the steel window, warm and inviting",
            "angle": "low, 28mm",
            "props": ["a sourdough loaf", "rolled cotton mats", "flour dust"],
            "background": "rustic wooden table, the cork floor",
            "never": ["incense"],
        }}
        dna = validate_dna(raw, signals, candidates(9, signals), 9)
        text = json.dumps(dna["photo"]).lower()
        for banned in ("sourdough", "loaf", "flour", "soft natural light", "warm and inviting", "rustic wooden table"):
            with self.subTest(banned=banned):
                self.assertNotIn(banned, text)
        self.assertEqual(dna["photo"]["props"], ["rolled cotton mats"])
        self.assertIn("cool morning blue", dna["photo"]["grade"])
        self.assertIn("the cork floor", dna["photo"]["background"])
        self.assertIn("incense", dna["photo"]["never"])

    def test_a_bakery_keeps_its_own_words(self):
        business = self.add_business("מאפיית הגליל", offerings="לחם מחמצת וחלות")
        signals = signals_for(self.db, business)
        self.assertTrue(signals["is_bakery"])
        dna = validate_dna({"photo": {"props": ["a sourdough loaf on the peel"]}}, signals, candidates(3, signals), 3)
        self.assertEqual(dna["photo"]["props"], ["a sourdough loaf on the peel"])

    def test_the_seed_changes_what_is_on_the_table(self):
        business = self.add_business("עסק")
        signals = signals_for(self.db, business)
        tables = {json.dumps(candidates(seed, signals), sort_keys=True) for seed in range(6)}
        self.assertGreater(len(tables), 3)
        self.assertEqual(candidates(42, signals), candidates(42, signals), "a seed is deterministic")

    def test_excluded_genes_are_not_offered(self):
        business = self.add_business("עסק")
        signals = signals_for(self.db, business)
        cands = candidates(8, signals, {"display": {"frank-ruhl-libre"}, "motif": {"stripes"}})
        self.assertNotIn("frank-ruhl-libre", cands["display"])
        self.assertNotIn("stripes", cands["motif"])


class DistanceTest(unittest.TestCase):
    BASE = {
        "type": {"display": "frank-ruhl-libre", "text": "assistant"},
        "motif": {"kind": "stripes", "color": "accent", "density": "low"},
        "signature": {"kind": "corner_mark"},
        "compositions": ["full_bleed", "split", "ticket"],
        "colors": {"paper": "#f7f0e6", "ink": "#2b211c", "accent": "#c0643b", "accent_2": "#e0a43a"},
    }

    def test_the_same_dna_is_zero_and_nothing_in_common_is_near_one(self):
        self.assertEqual(distance(self.BASE, self.BASE), 0)
        other = {
            "type": {"display": "karantina", "text": "rubik"},
            "motif": {"kind": "dots"},
            "signature": {"kind": "tab"},
            "compositions": ["arch_window", "circle_crop", "collage_grid"],
            "colors": {"paper": "#10203a", "ink": "#f0f4ff", "accent": "#36e0c0", "accent_2": "#7040ff"},
        }
        self.assertGreater(distance(self.BASE, other), 0.95)

    def test_palette_alone_does_not_make_two_dnas_different(self):
        recoloured = json.loads(json.dumps(self.BASE))
        recoloured["colors"] = {"paper": "#eef6f0", "ink": "#1d2b24", "accent": "#2f7d5b", "accent_2": "#b7d26a"}
        self.assertLess(distance(self.BASE, recoloured), FIELD_MIN_DISTANCE)

    def test_close_genes_name_what_they_share(self):
        twin = json.loads(json.dumps(self.BASE))
        twin["compositions"] = ["full_bleed", "split", "arch_window"]
        close = design_dna.close_genes(twin, self.BASE)
        self.assertEqual(close["display"], {"frank-ruhl-libre"})
        self.assertEqual(close["motif"], {"stripes"})
        self.assertEqual(close["signature"], {"corner_mark"})
        self.assertEqual(close["compositions"], {"full_bleed", "split"})


class UniquenessTest(DnaTestCase, unittest.TestCase):
    """Several bakeries with the same preset palette and the same site fonts, and a model
    that answers the same genes every time: the worst case for 'unique in its field'."""

    def setUp(self):
        self.setUp_dna()
        self.model = FakeDnaModel()
        patch = mock.patch.object(design_dna, "_ask_model", side_effect=self.model)
        patch.start()
        self.addCleanup(patch.stop)

    def bakery(self, name: str) -> Business:
        return self.add_business(name, offerings="לחם מחמצת, חלות ועוגות שמרים", palette=WARM,
                                 fonts=["Frank Ruhl Libre", "Assistant"], typography="Frank Ruhl Libre")

    def test_same_field_businesses_come_out_apart(self):
        made = []
        for name in ("מאפיית א", "מאפיית ב", "מאפיית ג", "מאפיית ד", "מאפיית ה"):
            business = self.bakery(name)
            before = len(self.model.calls)
            dna = design_dna.create_dna(self.db, business)
            self.db.commit()
            assert_library_only(self, dna)
            self.assertLessEqual(len(self.model.calls) - before, MAX_TRIES)
            self.assertEqual(dna["distance_checked_against"], len(made))
            made.append(dna)
        for a, b in itertools.combinations(made, 2):
            self.assertGreaterEqual(distance(a, b), FIELD_MIN_DISTANCE, (a["type"], b["type"]))
        # The first bakery got the site's own type pair; the next ones were steered off it.
        self.assertEqual((made[0]["type"]["display"], made[0]["type"]["text"]), ("frank-ruhl-libre", "assistant"))

    def test_regeneration_excludes_the_close_genes(self):
        # The same seed for both: the same options and the same answer, so the second
        # bakery's first DNA is a copy of the first one's.
        with mock.patch.object(design_dna, "seed_for", return_value=100):
            first = self.bakery("מאפיית א")
            taken = design_dna.create_dna(self.db, first)
            self.db.commit()
            second = self.bakery("מאפיית ב")
            start = len(self.model.calls)
            dna = design_dna.create_dna(self.db, second)
        calls = self.model.calls[start:]
        self.assertGreater(len(calls), 1, "the first answer was too close, so it was asked again")
        self.assertIn("frank-ruhl-libre", calls[0]["display"])
        self.assertNotIn("frank-ruhl-libre", calls[1]["display"])
        # v2: "none" is the default motif and is never excluded.
        self.assertEqual(taken["motif"]["kind"], "none")
        self.assertIn("none", calls[1]["motif"])
        self.assertRegex(calls[1]["prompt"], r"Excluded this time \(too close to someone else\): [^\n]*"
                                             r"display: frank-ruhl-libre")
        self.assertIn(f"display frank-ruhl-libre + text assistant, motif {taken['motif']['kind']}", calls[0]["prompt"],
                      "the other bakery's genes are named in the prompt")
        self.assertGreaterEqual(distance(dna, taken), FIELD_MIN_DISTANCE)

    def test_type_pair_and_motif_are_unique_across_fields(self):
        bakery = self.bakery("מאפייה")
        design_dna.create_dna(self.db, bakery)
        self.db.commit()
        yoga = self.add_business("מרפסת", field="fitness", offerings="יוגה", palette=FRESH,
                                 fonts=["Frank Ruhl Libre", "Assistant"], typography="Frank Ruhl Libre")
        dna = design_dna.create_dna(self.db, yoga)
        self.assertFalse(design_dna.same_type_and_motif(dna, design_dna.load_dna(bakery)))
        self.assertEqual(dna["distance_checked_against"], 1)

    def test_without_the_model_the_dna_is_built_locally_and_still_unique(self):
        with mock.patch.object(design_dna, "_ask_model", side_effect=RuntimeError("חסר GEMINI_API_KEY")), \
                self.assertLogs("app.services.design_dna", level="WARNING"):
            made = []
            for name in ("א", "ב", "ג"):
                dna = design_dna.create_dna(self.db, self.bakery(name))
                self.db.commit()
                self.assertEqual(dna["source"], "local")
                assert_library_only(self, dna)
                made.append(dna)
        for a, b in itertools.combinations(made, 2):
            self.assertGreaterEqual(distance(a, b), FIELD_MIN_DISTANCE)

    def test_move_apart_when_every_answer_stays_close(self):
        """A model that ignores the exclusions (answers outside the enums are replaced, so
        it can only stay close through the seed) still ends unique, locally."""
        first = self.bakery("א")
        design_dna.create_dna(self.db, first)
        self.db.commit()
        clone = design_dna.load_dna(first)
        with mock.patch.object(design_dna, "check_unique", wraps=design_dna.check_unique) as check, \
                mock.patch.object(design_dna, "validate_dna", side_effect=lambda *a, **k: json.loads(json.dumps(clone))):
            dna = design_dna.build_dna(self.db, self.bakery("ב"), seed=5)
        self.assertGreaterEqual(check.call_count, MAX_TRIES)
        self.assertGreaterEqual(distance(dna, clone), FIELD_MIN_DISTANCE)


class EndpointTest(DnaTestCase, unittest.TestCase):
    def setUp(self):
        self.setUp_dna()
        self.model = FakeDnaModel()
        patch = mock.patch.object(design_dna, "_ask_model", side_effect=self.model)
        patch.start()
        self.addCleanup(patch.stop)
        self.business = self.add_business("מאפיית תום", offerings="חלות ולחם", fonts=["Frank Ruhl Libre"])
        self.client = self.client_for(self.business)

    def test_library_needs_no_account(self):
        from fastapi.testclient import TestClient

        from app.main import app

        response = TestClient(app).get("/brand/dna/library")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["fonts"]), 14)

    def test_get_creates_once_and_stores(self):
        first = self.client.get("/brand/dna")
        self.assertEqual(first.status_code, 200, first.text)
        dna = first.json()["brand_dna"]
        assert_library_only(self, dna)
        self.assertEqual(dna["version"], 2)
        self.assertEqual(dna["field"], "food")
        self.assertEqual(dna["seed"], design_dna.seed_for(self.business))
        calls = len(self.model.calls)
        self.assertEqual(self.client.get("/brand/dna").json()["brand_dna"], dna)
        self.assertEqual(len(self.model.calls), calls, "a stored DNA is read, not rebuilt")
        self.db.refresh(self.business)
        self.assertEqual(json.loads(self.business.brand_dna_json)["seed"], dna["seed"])

    def test_regenerate_is_a_new_seed_and_a_different_style(self):
        dna = self.client.get("/brand/dna").json()["brand_dna"]
        response = self.client.post("/brand/dna/regenerate")
        self.assertEqual(response.status_code, 200, response.text)
        new = response.json()["brand_dna"]
        assert_library_only(self, new)
        self.assertNotEqual(new["seed"], dna["seed"])
        self.assertGreaterEqual(distance(new, dna), FIELD_MIN_DISTANCE)

    def test_put_validates_and_locks_what_the_owner_set(self):
        self.client.get("/brand/dna")
        bad_font = self.client.put("/brand/dna", json={"type": {"display": "comic-sans"}})
        self.assertEqual(bad_font.status_code, 422)
        self.assertRegex(bad_font.json()["detail"], r"[֐-׿]")
        text_only = self.client.put("/brand/dna", json={"type": {"text": "karantina"}})
        self.assertEqual(text_only.status_code, 422, "a display-only font cannot set the body text")
        unreadable = self.client.put("/brand/dna", json={"colors": {"ink": "#eeeeee", "paper": "#ffffff"}})
        self.assertEqual(unreadable.status_code, 422)
        bad_hex = self.client.put("/brand/dna", json={"colors": {"accent": "red"}})
        self.assertEqual(bad_hex.status_code, 422)

        ok = self.client.put("/brand/dna", json={"type": {"display": "suez-one", "display_weight": 800},
                                                  "motif": {"kind": "tape"}, "colors": {"accent": "#AA3311"}})
        self.assertEqual(ok.status_code, 200, ok.text)
        dna = ok.json()["brand_dna"]
        self.assertEqual(dna["type"]["display"], "suez-one")
        self.assertEqual(dna["type"]["display_weight"], 400, "Suez One ships one weight")
        self.assertEqual(dna["motif"]["kind"], "tape")
        self.assertEqual(dna["colors"]["accent"], "#aa3311")
        self.assertEqual(dna["locked"], ["colors", "motif", "type"])

        regenerated = self.client.post("/brand/dna/regenerate").json()["brand_dna"]
        self.assertEqual(regenerated["type"], dna["type"], "the owner's fonts stay through 'another style'")
        self.assertEqual(regenerated["motif"], dna["motif"])
        self.assertEqual(regenerated["colors"], dna["colors"])
        self.assertNotEqual(regenerated["seed"], dna["seed"])

    def test_keep_protects_the_style_from_a_rescan(self):
        self.client.get("/brand/dna")
        kept = self.client.put("/brand/dna", json={"keep": True}).json()["brand_dna"]
        self.assertIn("all", kept["locked"])
        calls = len(self.model.calls)
        with mock.patch.object(get_settings(), "design_dna_on_scan", True):
            design_dna.refresh_after_scan(self.engine, self.business.id)
        self.assertEqual(len(self.model.calls), calls)

    def test_strategy_payload_carries_the_dna(self):
        from app.models import Strategy
        from app.services.jsonutil import dumps

        self.db.add(Strategy(business_id=self.business.id, year=2026, month=10, usp_json="{}", calendar_json="[]",
                             roadmap_json=dumps({"roadmap": {"posts": [{"title": "א", "format": "image",
                                                                         "overlay_theme": "split_panel"}]}})))
        self.db.commit()
        dna = self.client.get("/brand/dna").json()["brand_dna"]
        strategy = self.client.get("/strategy/current").json()
        self.assertEqual(strategy["brand_dna"], dna)
        post = strategy["roadmap"]["posts"][0]
        self.assertEqual(post["design"], {"composition": "split", "crop": "4:5", "text_position": "bottom",
                                          "text_mode": "headline"})


class ScanHookTest(DnaTestCase, unittest.TestCase):
    def setUp(self):
        self.setUp_dna()
        self.model = FakeDnaModel()
        patch = mock.patch.object(design_dna, "_ask_model", side_effect=self.model)
        patch.start()
        self.addCleanup(patch.stop)

    def test_refresh_builds_the_dna_in_its_own_session(self):
        business = self.add_business("מאפייה")
        with mock.patch.object(get_settings(), "design_dna_on_scan", True):
            design_dna.refresh_after_scan(self.engine, business.id)
        self.db.refresh(business)
        assert_library_only(self, design_dna.load_dna(business))

    def test_refresh_is_off_by_setting_and_never_raises(self):
        business = self.add_business("מאפייה")
        design_dna.refresh_after_scan(self.engine, business.id)  # DESIGN_DNA_ON_SCAN=false in tests
        self.db.refresh(business)
        self.assertEqual(business.brand_dna_json, "")
        with mock.patch.object(get_settings(), "design_dna_on_scan", True), \
                mock.patch.object(design_dna, "build_dna", side_effect=RuntimeError("boom")), \
                self.assertLogs("app.services.design_dna", level="ERROR"):
            design_dna.refresh_after_scan(self.engine, business.id)  # logged, not raised

    def test_the_scan_schedules_it_after_the_response(self):
        from app.routers import onboarding as onboarding_router

        business = self.add_business("מאפייה")
        owner = mock.Mock(id=business.user_id)
        scanned = {"brand_language": {"business_name": "מאפייה"}, "extracted": {}, "raw": {}}
        tasks = BackgroundTasks()
        with mock.patch.object(onboarding_router, "cached_scan", return_value=scanned), \
                mock.patch.object(onboarding_router, "fetch_photo_candidates", return_value=[]), \
                mock.patch.object(onboarding_router, "filter_usable_photos", return_value=[]), \
                mock.patch.object(onboarding_router, "_business_payload", return_value={}):
            onboarding_router.scan_business_site(
                onboarding_router.WebsiteScanIn(website_url="https://b1.example"), background_tasks=tasks,
                user=owner, db=self.db,
            )
        self.assertEqual(len(tasks.tasks), 1)
        self.assertIs(tasks.tasks[0].func, design_dna.refresh_after_scan)
        self.assertEqual(tasks.tasks[0].args[1], business.id)


if __name__ == "__main__":
    unittest.main()
