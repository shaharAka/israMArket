"""Design DNA v2 (docs/design-dna.md, Revision 1): the real logo as a same-origin copy, the
brand's own colours, an art direction in words, the owner's word adjustments, one message
per post, the text-mode mix, the photo's safe area, the plan gate and the review script.

Every model and HTTP call is faked: HTTP goes to an httpx.MockTransport behind fake DNS,
the models are stand-ins. Nothing leaves the machine.
"""
import _test_env  # noqa: F401  (must come before any `app` import)

import io
import itertools
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import httpx
from PIL import Image

from _dna_fixtures import FRESH, WARM, DnaTestCase, FakeDnaModel, png_bytes
from app.config import get_settings
from app.models import PhotoAnalysis, Strategy
from app.services import (
    brand_logo,
    connected_posts,
    design_dna,
    dna_colors,
    image_routing,
    images,
    muse_image,
    photo_analysis,
)
from app.services.dna_library import COMPOSITIONS, GENERIC_MOTIFS, library_payload
from app.services.jsonutil import dumps
from app.services.post_design import assign_designs, sync_text_mode

HEBREW = r"[֐-׿]"
LOGO_URL = "https://shop.example/media/logo.png"


def rgba_png(size=(1600, 640), mark=(176, 30, 90, 255), ground=(0, 0, 0, 0), box=(300, 160, 1300, 480)) -> bytes:
    """A logo: a flat mark on a transparent (or coloured) ground, with margins around it."""
    image = Image.new("RGBA", size, ground)
    image.paste(Image.new("RGBA", (box[2] - box[0], box[3] - box[1]), mark), box[:2])
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def photo_bytes(color=(120, 140, 160), size=(800, 1000)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, format="JPEG", quality=90)
    return out.getvalue()


class FakeWeb:
    """An httpx transport for the logo download, behind fake public DNS."""

    def __init__(self, routes: dict[str, tuple[int, str, bytes]]):
        self.routes = routes
        self.requests: list[str] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(str(request.url))
        status, mime, body = self.routes.get(str(request.url), (404, "text/plain", b""))
        return httpx.Response(status, headers={"content-type": mime}, content=body)

    def start(self, test: unittest.TestCase, ip: str = "93.184.216.34") -> None:
        real = httpx.Client

        def factory(*args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(self.handler)
            return real(*args, **kwargs)

        for patch in (
            mock.patch.object(brand_logo.httpx, "Client", side_effect=factory),
            mock.patch("app.services.netguard.socket.getaddrinfo",
                       side_effect=lambda host, port, *a, **k: [(2, 1, 6, "", (ip, port))]),
            mock.patch.object(get_settings(), "brand_logo_copy", True),
        ):
            patch.start()
            test.addCleanup(patch.stop)


def set_logo_url(business, url: str = LOGO_URL) -> None:
    stored = json.loads(business.scraped_profile_json)
    stored["brand_language"]["logo_url"] = url
    business.scraped_profile_json = dumps(stored)


# --- 1. the logo, as a same-origin copy -------------------------------------------------------


class LogoCopyTest(DnaTestCase, unittest.TestCase):
    def setUp(self):
        self.setUp_dna()
        self.business = self.add_business("תחרה", field="fashion", offerings="הלבשה תחתונה")
        set_logo_url(self.business)
        self.db.commit()

    def test_downloaded_normalised_and_stored_in_the_business_media_folder(self):
        web = FakeWeb({LOGO_URL: (200, "image/png", rgba_png(size=(2400, 900), box=(400, 200, 2000, 700)))})
        web.start(self)
        record = brand_logo.ensure(self.business)
        self.assertEqual(record["status"], "ok")
        self.assertTrue(record["public_url"].startswith(f"/backend/media/{self.business.id}/logo-"))
        path = self.media / str(self.business.id) / record["filename"]
        self.assertTrue(path.is_file())
        with Image.open(path) as image:
            self.assertEqual(image.format, "PNG")
            self.assertEqual(image.mode, "RGBA", "transparency kept")
            self.assertLessEqual(max(image.size), 1024)
            # The transparent margins were trimmed: the mark fills the copy.
            self.assertEqual(image.getchannel("A").getextrema(), (255, 255))
        self.assertEqual((record["width"], record["height"]), (1024, 320))
        self.assertTrue(record["has_alpha"])
        self.assertEqual(record["logo_on"], "any", "a saturated mark on transparency reads on light and dark")
        self.assertEqual(record["colors"][0]["hex"], "#b01e5a")
        # A second refresh with the same URL downloads nothing.
        before = len(web.requests)
        self.assertEqual(brand_logo.ensure(self.business), record)
        self.assertEqual(len(web.requests), before)

    def test_served_same_origin_to_the_owner_only(self):
        FakeWeb({LOGO_URL: (200, "image/png", rgba_png())}).start(self)
        record = brand_logo.ensure(self.business)
        self.db.commit()
        from app import main as app_main

        with mock.patch.object(app_main, "MEDIA_DIR", self.media):
            owner = self.client_for(self.business)
            response = owner.get(f"/media/{self.business.id}/{record['filename']}")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["content-type"], "image/png")
            self.assertEqual(response.content, (self.media / str(self.business.id) / record["filename"]).read_bytes())
            stranger = self.client_for(self.add_business("אחר"))
            self.assertEqual(stranger.get(f"/media/{self.business.id}/{record['filename']}").status_code, 404)

    def test_logo_on_comes_from_the_logo_pixels(self):
        cases = {
            "light": rgba_png(mark=(40, 30, 30, 255)),                       # a dark mark on transparency
            "dark": rgba_png(mark=(250, 248, 240, 255)),                     # a white mark on transparency
            "any": rgba_png(mark=(206, 17, 38, 255)),                        # a saturated red reads on both
        }
        for expected, data in cases.items():
            with self.subTest(expected=expected):
                _png, reading = brand_logo.normalise(data, "image/png")
                self.assertEqual(reading["logo_on"], expected)
                self.assertTrue(reading["has_alpha"])
        _png, opaque_white = brand_logo.normalise(rgba_png(ground=(255, 255, 255, 255)), "image/png")
        self.assertEqual(opaque_white["logo_on"], "light", "a logo on its own white box sits on light grounds")
        _png, opaque_dark = brand_logo.normalise(rgba_png(ground=(12, 12, 14, 255), mark=(230, 200, 120, 255)),
                                                 "image/png")
        self.assertEqual(opaque_dark["logo_on"], "dark")

    def test_a_wordmark_with_pale_shapes_reads_on_light_too(self):
        """tazizi.co.il's logo: a pink wordmark beside large pale beige cups, on transparency.
        The beige alone has 1.7:1 on white, yet the logo reads there: never "dark only"."""
        image = Image.new("RGBA", (1200, 300), (0, 0, 0, 0))
        image.paste(Image.new("RGBA", (420, 120), (236, 66, 122, 255)), (40, 90))     # the wordmark
        image.paste(Image.new("RGBA", (560, 260), (234, 190, 172, 255)), (600, 20))   # the cups
        out = io.BytesIO()
        image.save(out, format="PNG")
        _png, reading = brand_logo.normalise(out.getvalue(), "image/png")
        self.assertEqual(reading["logo_on"], "any")
        self.assertEqual({c["hex"] for c in reading["colors"]}, {"#ec427a", "#eabeac"})
        business = self.add_business("ת'ציצי", field="fashion", palette=[])
        business.brand_logo_json = dumps({"status": "unsupported", "colors": reading["colors"], "logo_on": "any"})
        dna = design_dna.preview_dna(business)
        self.assertEqual((dna["colors"]["accent"], dna["colors_source"]["accent"]), ("#ec427a", "logo"),
                         "the accent is the logo's saturated colour, not its largest area")

    def test_dominant_colours_ignore_the_white_ground_and_transparency(self):
        _png, reading = brand_logo.normalise(rgba_png(ground=(255, 255, 255, 255), mark=(222, 49, 99, 255)),
                                             "image/png")
        hexes = [item["hex"] for item in reading["colors"]]
        self.assertEqual(hexes, ["#de3163"])
        _png, transparent = brand_logo.normalise(rgba_png(mark=(222, 49, 99, 255)), "image/png")
        self.assertEqual([item["hex"] for item in transparent["colors"]], ["#de3163"])

    def test_svg_is_served_from_our_origin_only_as_a_png(self):
        """An SVG from our origin can carry script: it is rasterised (services/svg_logo.py,
        tests/test_svg_logo.py), and only the PNG is stored and served."""
        svg = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#c2185b" d="M0 0h10v10z"/>' \
              b'<path fill="#c2185b" d="M1 1h2v2z"/></svg>'
        FakeWeb({LOGO_URL: (200, "image/svg+xml", svg + b" " * 200)}).start(self)
        record = brand_logo.ensure(self.business)
        self.assertEqual((record["status"], record["format"]), ("ok", "svg"))
        files = list((self.media / str(self.business.id)).glob("logo-*"))
        self.assertEqual([p.name for p in files], [record["filename"]])
        self.assertTrue(files[0].read_bytes().startswith(b"\x89PNG"), "the SVG itself is never stored")
        signals = design_dna.signals_for(self.db, self.business)
        self.assertEqual((signals["swatches"][0].hex, signals["swatches"][0].source), ("#c2185b", "logo"))
        self.assertTrue(signals["has_logo"])
        dna = design_dna.preview_dna(self.business)
        self.assertEqual(dna["signature"]["logo_url"], record["public_url"])

    def test_a_private_address_or_a_non_image_is_refused(self):
        web = FakeWeb({LOGO_URL: (200, "image/png", rgba_png())})
        web.start(self, ip="10.0.0.5")
        record = brand_logo.ensure(self.business)
        self.assertEqual(record["status"], "failed")
        self.assertEqual(web.requests, [], "the SSRF guard refuses before any request")

    def test_html_or_an_oversized_file_is_not_a_logo(self):
        for response in ((200, "text/html", b"<html>" + b"x" * 500 + b"</html>"),
                         (200, "image/png", b"\x89PNG" + b"0" * 950_000)):
            with self.subTest(mime=response[1]):
                business = self.add_business("עוד", field="fashion")
                set_logo_url(business)
                web = FakeWeb({LOGO_URL: response})
                web.start(self)
                self.assertEqual(brand_logo.ensure(business)["status"], "failed")

    def test_the_dna_signs_with_the_real_logo_and_sends_it_to_the_model(self):
        FakeWeb({LOGO_URL: (200, "image/png", rgba_png())}).start(self)
        model = FakeDnaModel()
        with mock.patch.object(design_dna, "_ask_model", side_effect=model), \
                mock.patch.object(get_settings(), "design_dna_on_scan", True):
            design_dna.refresh_after_scan(self.engine, self.business.id)
        self.db.refresh(self.business)
        record = brand_logo.load(self.business)
        dna = design_dna.load_dna(self.business)
        self.assertEqual(record["status"], "ok")
        self.assertIn(dna["signature"]["kind"], ("corner_mark", "footer_band", "none"))
        self.assertEqual(dna["signature"]["logo_url"], record["public_url"])
        self.assertEqual(dna["signature"]["logo_on"], "any")
        self.assertTrue(dna["signature"]["use_logo"] or dna["signature"]["kind"] == "none")
        # The logo's pixels are the first colour evidence the model is shown.
        signals = design_dna.signals_for(self.db, self.business, with_images=False)
        self.assertEqual((signals["swatches"][0].hex, signals["swatches"][0].source), ("#b01e5a", "logo"))
        self.assertIn("#b01e5a (logo", model.calls[0]["prompt"])
        assert_brand_colours(self, dna, signals["swatches"])
        self.assertIn("the business's own logo", model.calls[0]["prompt"])
        self.assertEqual(model.calls[0]["images"][0][1], "image/png")

    def test_without_a_logo_the_name_signs_never_a_monogram(self):
        business = self.add_business("פיתות הדר", logo=False)
        dna = design_dna.preview_dna(business)
        self.assertIn(dna["signature"]["kind"], ("name_only", "none"))
        self.assertFalse(dna["signature"]["use_logo"])
        self.assertEqual(dna["signature"]["logo_url"], "")
        self.assertNotIn("stamp", json.dumps(dna["signature"]))

    def test_a_brand_save_keeps_the_logo_url_and_can_change_it(self):
        client = self.client_for(self.business)
        body = {
            "business_name": "תחרה", "palette": [{"hex": "#c0643b", "role": "primary", "name": "x"}],
            "typography": {"primary": "Heebo", "mood": "רך"}, "visual_style": "חנות קטנה", "photography": "צילומי מוצר",
            "voice": "חם וישיר", "voice_examples": ["א"], "do_say": ["א"], "dont_say": ["ב"], "messaging": ["ג"],
            "audience": "נשים", "logo_description": "שם בכתב יד",
        }
        response = client.post("/onboarding/brand", json=body)
        self.assertEqual(response.status_code, 200, response.text)
        self.db.refresh(self.business)
        self.assertEqual(json.loads(self.business.scraped_profile_json)["brand_language"]["logo_url"], LOGO_URL)
        bad = client.post("/onboarding/brand", json={**body, "logo_url": "javascript:alert(1)"})
        self.assertEqual(bad.status_code, 422)
        client.post("/onboarding/brand", json={**body, "logo_url": ""})
        self.db.refresh(self.business)
        self.assertEqual(json.loads(self.business.scraped_profile_json)["brand_language"]["logo_url"], "")


# --- 2. colours are the brand's own ------------------------------------------------------------

PINK_SHOP = [
    {"hex": "#e7c9b8", "role": "background", "name": "בז׳"},
    {"hex": "#e5127d", "role": "primary", "name": "ורוד"},
    {"hex": "#3a2a2f", "role": "ink", "name": "שוקולד"},
]
MONO = [{"hex": "#111111", "role": "ink", "name": "שחור"}, {"hex": "#ffffff", "role": "background", "name": "לבן"}]
WEAK_INK = [{"hex": "#f4efe8", "role": "background", "name": "נייר"}, {"hex": "#9a7b6a", "role": "ink", "name": "חום"},
            {"hex": "#2f7d5b", "role": "primary", "name": "ירוק"}]


def assert_brand_colours(test: unittest.TestCase, dna: dict, swatches: list) -> None:
    for role, value in dna["colors"].items():
        source = dna["colors_source"][role]
        with test.subTest(role=role, value=value, source=source):
            if source in ("logo", "site"):
                test.assertIn(value, [s.hex for s in swatches], "a brand colour is exactly the brand's")
                test.assertEqual(next(s.source for s in swatches if s.hex == value), source)
            elif source == "derived":
                base = dna["colors_base"].get(role)
                test.assertIn(base, [s.hex for s in swatches], "derived from a brand colour")
                # Lightness only: the base moved to this colour's lightness is this colour.
                test.assertLessEqual(dna_colors.delta_e(value, dna_colors.with_lightness(base, dna_colors.lightness(value))),
                                     dna_colors.BRAND_TOLERANCE)
                if dna_colors.chroma(base) > 8 and dna_colors.chroma(value) > 8:
                    hue = abs(dna_colors.lch(value)[2] - dna_colors.lch(base)[2]) % 360
                    test.assertLessEqual(min(hue, 360 - hue), 4.0, "the hue is the brand's")
            test.assertTrue(dna_colors.is_brand_color(value, swatches))


class ColourTest(DnaTestCase, unittest.TestCase):
    def setUp(self):
        self.setUp_dna()

    def test_every_role_is_a_brand_colour_or_a_lightness_derivation(self):
        for name, palette in (("warm", WARM), ("fresh", FRESH), ("pink", PINK_SHOP), ("mono", MONO), ("weak", WEAK_INK)):
            with self.subTest(palette=name):
                business = self.add_business(name, palette=palette)
                signals = design_dna.signals_for(self.db, business)
                dna = design_dna.preview_dna(business)
                assert_brand_colours(self, dna, signals["swatches"])
                self.assertGreaterEqual(design_dna.contrast(dna["colors"]["ink"], dna["colors"]["paper"]), 4.5)

    def test_a_model_colour_within_de_6_is_the_brand_colour_and_further_is_refused(self):
        business = self.add_business("ורוד", palette=PINK_SHOP)
        signals = design_dna.signals_for(self.db, business)
        near = "#e3147b"  # ΔE ~2 from the brand pink
        far = "#7a3cff"   # another colour
        self.assertLess(dna_colors.delta_e(near, "#e5127d"), 6)
        dna = design_dna.validate_dna({"colors": {"accent": near, "accent_2": far}}, signals,
                                      design_dna.candidates(4, signals), 4)
        self.assertEqual(dna["colors"]["accent"], "#e5127d", "snapped exactly to the brand's own")
        self.assertNotEqual(dna["colors"]["accent_2"], far)
        assert_brand_colours(self, dna, signals["swatches"])

    def test_ink_is_made_readable_by_lightness_only(self):
        business = self.add_business("נייר", palette=WEAK_INK)
        signals = design_dna.signals_for(self.db, business)
        self.assertLess(design_dna.contrast("#9a7b6a", "#f4efe8"), 4.5)
        dna = design_dna.validate_dna({"colors": {"ink": "#9a7b6a", "paper": "#f4efe8"}}, signals,
                                      design_dna.candidates(4, signals), 4)
        self.assertGreaterEqual(design_dna.contrast(dna["colors"]["ink"], dna["colors"]["paper"]), 4.5)
        self.assertEqual(dna["colors_source"]["ink"], "derived")
        self.assertEqual(dna["colors_base"]["ink"], "#9a7b6a")
        self.assertLess(dna_colors.lightness(dna["colors"]["ink"]), dna_colors.lightness("#9a7b6a"))

    def test_logo_pixels_come_before_the_site(self):
        business = self.add_business("כחול", palette=[{"hex": "#1f4e9c", "role": "primary", "name": "כחול"},
                                                     {"hex": "#ffffff", "role": "background", "name": "לבן"}])
        business.brand_logo_json = dumps({"source_url": LOGO_URL, "status": "unsupported",
                                          "colors": [{"hex": "#e5127d", "share": 0.6}], "logo_on": "light"})
        dna = design_dna.preview_dna(business)
        self.assertEqual((dna["colors"]["accent"], dna["colors_source"]["accent"]), ("#e5127d", "logo"))

    def test_the_site_css_colours_are_evidence_too(self):
        business = self.add_business("סטודיו", field="fitness", palette=[])
        stored = json.loads(business.scraped_profile_json)
        stored["brand_language"]["palette"] = []
        stored["raw"] = {"colors": ["#1f6f5c", "#f3efe6"], "color_evidence": {}}
        business.scraped_profile_json = dumps(stored)
        signals = design_dna.signals_for(self.db, business)
        self.assertEqual([(s.hex, s.source, s.origin) for s in signals["swatches"]],
                         [("#1f6f5c", "site", "css"), ("#f3efe6", "site", "css")])
        dna = design_dna.preview_dna(business)
        self.assertEqual(dna["colors"]["accent"], "#1f6f5c")
        self.assertEqual(dna["colors"]["paper"], "#f3efe6")
        assert_brand_colours(self, dna, signals["swatches"])


# --- uniqueness never moves colours ---------------------------------------------------------------


class UniqueWithoutColoursTest(DnaTestCase, unittest.TestCase):
    def setUp(self):
        self.setUp_dna()
        self.model = FakeDnaModel()
        patch = mock.patch.object(design_dna, "_ask_model", side_effect=self.model)
        patch.start()
        self.addCleanup(patch.stop)

    def test_same_field_businesses_keep_their_brand_colours_and_still_differ(self):
        made = []
        for name in ("מאפיית א", "מאפיית ב", "מאפיית ג", "מאפיית ד"):
            business = self.add_business(name, offerings="לחם מחמצת וחלות", palette=WARM,
                                         fonts=["Frank Ruhl Libre", "Assistant"], typography="Frank Ruhl Libre")
            made.append(design_dna.create_dna(self.db, business))
            self.db.commit()
        first = made[0]["colors"]
        for dna in made[1:]:
            self.assertEqual(dna["colors"], first, "uniqueness never moves the brand's colours")
        for a, b in itertools.combinations(made, 2):
            self.assertGreaterEqual(design_dna.distance(a, b), design_dna.FIELD_MIN_DISTANCE)
            self.assertEqual(design_dna.gene_distances(a, b)["palette"], 0.0)

    def test_close_genes_and_move_apart_never_touch_colours(self):
        business = self.add_business("מאפייה", palette=WARM)
        dna = design_dna.preview_dna(business)
        twin = json.loads(json.dumps(dna))
        found = design_dna.close_genes(dna, twin)
        self.assertFalse({"colors", "palette", "paper", "ink", "accent"} & set(found))
        moved = design_dna.move_apart(dna, found, design_dna.signals_for(None, business), 3, [twin], [twin])
        self.assertEqual(moved["colors"], dna["colors"])
        self.assertEqual(moved["colors_source"], dna["colors_source"])

    def test_palette_barely_counts_and_not_at_all_against_the_own_style(self):
        self.assertLessEqual(design_dna.DISTANCE_WEIGHTS["palette"], 0.05)
        business = self.add_business("מאפייה", palette=WARM)
        dna = design_dna.preview_dna(business)
        recoloured = {**json.loads(json.dumps(dna)), "colors": {"paper": "#10203a", "ink": "#f0f4ff",
                                                                 "accent": "#36e0c0", "accent_2": "#7040ff"}}
        self.assertLessEqual(design_dna.distance(dna, recoloured), 0.05)
        self.assertEqual(design_dna.distance(dna, recoloured, with_palette=False), 0.0)


# --- 3. the v2 schema, the direction, motifs, the v1 upgrade ----------------------------------------

V1_DNA = {
    "version": 1, "seed": 41827, "created_at": "2026-10-01T10:00:00+00:00", "field": "food",
    "type": {"display": "suez-one", "display_weight": 400, "text": "assistant", "text_weight": 500,
             "headline_case": "sentence", "scale": "large"},
    "colors": {"ink": "#2b211c", "paper": "#f7f0e6", "accent": "#d0402b", "accent_2": "#e0a43a",
               "on_photo": "#f7f0e6", "tint": "#f3e3d3"},
    "compositions": ["ticket", "arch_window", "split", "stacked_bands"],
    "motif": {"kind": "scalloped_edge", "color": "accent", "density": "mid"},
    "signature": {"kind": "stamp", "use_logo": True},
    "photo": {"grade": "warm film", "light": "side window", "angle": "45 degrees", "props": ["enamel tray"],
              "background": "tiled counter", "never": ["plastic wrap"]},
    "copy": {"price_style": "tag", "cta_style": "underline"},
    "rationale_he": "כותרות ב-Suez One וקצה גלי שחוזר בכל פוסט: ככה מזהים אתכם בפיד.",
    "distance_checked_against": 2, "source": "model",
}


class SchemaV2Test(DnaTestCase, unittest.TestCase):
    def setUp(self):
        self.setUp_dna()

    def test_the_library_is_v2(self):
        payload = library_payload()
        self.assertEqual(payload["version"], 2)
        self.assertEqual(payload["motifs"][0], {"key": "none", "label_he": "בלי קישוט", "generic": False})
        self.assertEqual({m["key"] for m in payload["motifs"] if m["generic"]}, set(GENERIC_MOTIFS))
        self.assertEqual([s["key"] for s in payload["signatures"]], ["corner_mark", "footer_band", "name_only", "none"])
        self.assertEqual(payload["enums"]["text_mode"], ["photo_only", "headline", "type_led"])
        self.assertEqual(payload["enums"]["logo_on"], ["light", "dark", "any"])
        self.assertEqual(payload["enums"]["motif_from"], ["logo", "place", "product", "owner"])
        self.assertFalse(payload["rules"]["cta_on_image"])
        for comp in payload["compositions"]:
            self.assertTrue(comp["text_modes"])
        self.assertEqual(next(c for c in payload["compositions"] if c["key"] == "type_led")["text_modes"], ["type_led"])

    def test_the_direction_is_concrete_hebrew_without_marketing_words(self):
        business = self.add_business("תנור אבן", offerings="לחם כוסמין ומחמצת מתנור אבן")
        signals = design_dna.signals_for(self.db, business)
        raw = {"direction": {
            "feel_he": "חוויה ייחודית ומזמינה! — שקט ובטוח, כמו מאפייה שאופה באותו תנור 40 שנה",
            "world_he": "Premium lifestyle, פתרון מושלם לכל בית",
            "photo_he": "כיכרות לחם כוסמין ליד פתח התנור, אור הגחלים מהצד",
            "text_he": "מילה אחת גדולה או בלי טקסט בכלל",
            "never_he": ["חוויה בלתי נשכחת", "כוכבים מנצנצים", "לחם מפלסטיק"],
        }}
        dna = design_dna.validate_dna(raw, signals, design_dna.candidates(1, signals), 1)
        direction = dna["direction"]
        text = json.dumps(direction, ensure_ascii=False)
        for banned in ("חוויה", "ייחודית", "מזמינה", "פתרון", "מושלם", "Premium", "!", "—"):
            with self.subTest(banned=banned):
                self.assertNotIn(banned, text)
        self.assertEqual(direction["feel_he"], "שקט ובטוח, כמו מאפייה שאופה באותו תנור 40 שנה")
        self.assertIn("כוסמין", direction["photo_he"])
        self.assertRegex(direction["world_he"], HEBREW, "an empty line falls back to the business's own words")
        self.assertTrue(3 <= len(direction["never_he"]) <= 5)
        self.assertNotIn("חוויה בלתי נשכחת", direction["never_he"])
        self.assertEqual(dna["rationale_he"], direction["feel_he"])

    def test_motif_none_by_default_and_generic_ornament_needs_a_reason_in_the_brand(self):
        plain = self.add_business("מאפייה", offerings="לחם וחלות")
        signals = design_dna.signals_for(self.db, plain)
        self.assertEqual(design_dna.preview_dna(plain)["motif"]["kind"], "none")
        cands = design_dna.candidates(2, signals)
        self.assertEqual(cands["motif"][0], "none")
        unjustified = {"kind": "scalloped_edge", "from": "product", "note_he": "קצה גלי יפה מסביב לתמונה",
                       "color": "accent", "density": "mid"}
        dna = design_dna.validate_dna({"motif": unjustified}, signals, cands, 2)
        self.assertEqual(dna["motif"], {"kind": "none", "from": "", "note_he": "", "color": "accent", "density": "mid"})

        lace = self.add_business("תחרה", field="fashion", offerings="הלבשה תחתונה מתחרה צרפתית")
        lace_signals = design_dna.signals_for(self.db, lace)
        justified = {"kind": "scalloped_edge", "from": "product", "note_he": "הקצה הגלי של התחרה בחזיות",
                     "color": "accent", "density": "low"}
        kept = design_dna.validate_dna({"motif": justified}, lace_signals, design_dna.candidates(2, lace_signals), 2)
        self.assertEqual((kept["motif"]["kind"], kept["motif"]["from"]), ("scalloped_edge", "product"))
        self.assertIn("תחרה", kept["motif"]["note_he"])
        no_from = {**justified, "from": ""}
        self.assertEqual(design_dna.validate_dna({"motif": no_from}, lace_signals,
                                                 design_dna.candidates(2, lace_signals), 2)["motif"]["kind"], "none")

    def test_mix_follows_the_field_and_the_voice(self):
        quiet = design_dna.base_mix("food", "רגוע ושקט")
        loud = design_dna.base_mix("food", "צעיר ומשחקי")
        pro = design_dna.base_mix("professional", "")
        for mix in (quiet, loud, pro):
            self.assertAlmostEqual(sum(mix.values()), 1.0, places=2)
        self.assertGreater(quiet["photo_only"], loud["photo_only"])
        self.assertGreater(pro["type_led"], design_dna.base_mix("jewelry")["type_led"])
        self.assertEqual(design_dna.fit_mix({"photo_only": 0.5, "headline": 0.4, "type_led": 0.1},
                                            ["full_bleed", "arch_window", "split"])["type_led"], 0.0,
                         "no type-led posts without a photo-free composition")

    def test_every_dna_has_two_photo_only_compositions(self):
        for seed in range(12):
            business = self.add_business(f"עסק {seed}")
            dna = design_dna.preview_dna(business)
            with self.subTest(seed=seed):
                photo_only = [c for c in dna["compositions"] if "photo_only" in COMPOSITIONS[c].text_modes]
                self.assertGreaterEqual(len(photo_only), 2)
                self.assertTrue(3 <= len(dna["compositions"]) <= 4)


class UpgradeTest(DnaTestCase, unittest.TestCase):
    def setUp(self):
        self.setUp_dna()

    def test_a_v1_dna_is_upgraded_on_read_without_a_model_call(self):
        business = self.add_business("מאפיית תום", offerings="חלות ולחם", palette=WARM)
        business.brand_dna_json = dumps(V1_DNA)
        with mock.patch.object(design_dna, "_ask_model", side_effect=AssertionError("no model call")):
            dna = design_dna.load_dna(business)
        self.assertEqual((dna["version"], dna["source"], dna["upgraded_from"]), (2, "upgraded", "model"))
        self.assertEqual(dna["type"], V1_DNA["type"])
        self.assertEqual(dna["motif"]["kind"], "none", "the v1 ornament came from a list, not the brand")
        self.assertEqual(dna["signature"]["kind"], "name_only", "no logo copy: the name, never a stamp")
        # The v1 line only named parameters ("Suez One", "קצה גלי"): the feeling comes from
        # the business's own voice instead. A v1 line that is a feeling is kept.
        self.assertEqual(dna["direction"]["feel_he"], "חם וישיר, כמו במאפיית תום ביום רגיל")
        self.assertRegex(dna["direction"]["photo_he"], HEBREW)
        felt = design_dna.upgrade_v1({**V1_DNA, "rationale_he": "שקט ובטוח, כמו מאפייה שאופה באותו תנור 40 שנה"},
                                     design_dna.signals_for(None, business))
        self.assertEqual(felt["direction"]["feel_he"], "שקט ובטוח, כמו מאפייה שאופה באותו תנור 40 שנה")
        self.assertFalse(dna["copy"]["cta_on_image"])
        self.assertNotIn("cta_style", dna["copy"])
        self.assertAlmostEqual(sum(dna["mix"].values()), 1.0, places=2)
        # The v1 accent sat ΔE ~10 from the brand; v2 colours are the brand's own.
        assert_brand_colours(self, dna, design_dna.signals_for(None, business)["swatches"])
        self.assertTrue(design_dna.is_valid_dna(dna))
        self.assertTrue(set(dna["compositions"]) >= {"ticket", "arch_window"})

    def test_a_motif_the_logo_itself_names_is_kept_and_owner_locks_survive(self):
        business = self.add_business("מאפייה", palette=WARM)
        stored = json.loads(business.scraped_profile_json)
        stored["brand_language"]["logo_description"] = "חותמת עגולה עם קשת של תנור"
        business.scraped_profile_json = dumps(stored)
        old = {**V1_DNA, "motif": {"kind": "arches", "color": "accent", "density": "low"},
               "locked": ["colors"], "colors": {**V1_DNA["colors"], "accent": "#123456"}}
        business.brand_dna_json = dumps(old)
        dna = design_dna.load_dna(business)
        self.assertEqual((dna["motif"]["kind"], dna["motif"]["from"]), ("arches", "logo"))
        self.assertEqual(dna["colors"]["accent"], "#123456", "the owner's colours stay")
        self.assertEqual(dna["colors_source"]["accent"], "owner")
        self.assertEqual(dna["locked"], ["colors"])

    def test_get_stores_the_upgrade_and_regenerate_improves_it(self):
        business = self.add_business("מאפיית תום", offerings="חלות ולחם")
        business.brand_dna_json = dumps(V1_DNA)
        self.db.commit()
        client = self.client_for(business)
        model = FakeDnaModel()
        with mock.patch.object(design_dna, "_ask_model", side_effect=model):
            got = client.get("/brand/dna").json()["brand_dna"]
            self.assertEqual(got["source"], "upgraded")
            self.assertEqual(model.calls, [])
            self.db.refresh(business)
            self.assertEqual(json.loads(business.brand_dna_json)["version"], 2)
            again = client.post("/brand/dna/regenerate").json()["brand_dna"]
        self.assertEqual(again["source"], "model")
        self.assertEqual(again["version"], 2)

    def test_peers_read_v1_rows_as_v2(self):
        bakery = self.add_business("מאפייה")
        bakery.brand_dna_json = dumps(V1_DNA)
        self.db.commit()
        other = self.add_business("מאפייה ב")
        same, everyone = design_dna.peers(self.db, other)
        self.assertEqual([dna["version"] for dna in everyone], [2])
        self.assertEqual(len(same), 1)


# --- 4. the owner's adjustments in words ------------------------------------------------------------


class AdjustTest(DnaTestCase, unittest.TestCase):
    def setUp(self):
        self.setUp_dna()
        self.model = FakeDnaModel()
        patch = mock.patch.object(design_dna, "_ask_model", side_effect=self.model)
        patch.start()
        self.addCleanup(patch.stop)
        self.business = self.add_business("מאפיית תום", offerings="חלות ולחם", fonts=["Frank Ruhl Libre"])
        self.client = self.client_for(self.business)
        self.dna = self.client.get("/brand/dna").json()["brand_dna"]

    def put(self, **body):
        response = self.client.put("/brand/dna", json=body)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["brand_dna"]

    def test_quieter_and_bolder_move_type_mix_and_motif(self):
        start = self.dna
        quiet = self.put(adjust={"tone": "quieter"})
        self.assertLess(quiet["type"]["display_weight"], start["type"]["display_weight"])
        self.assertGreater(quiet["mix"]["photo_only"], start["mix"]["photo_only"])
        self.assertIn(quiet["type"]["scale"], ("medium", "editorial"))
        self.assertEqual(quiet["adjusted"], ["quieter"])
        bold = self.put(adjust={"tone": "bolder"})
        self.assertEqual(bold["type"]["display_weight"], start["type"]["display_weight"])
        self.assertLess(bold["mix"]["photo_only"], quiet["mix"]["photo_only"])
        self.assertEqual(bold["adjusted"], ["quieter", "bolder"])

    def test_more_photo_and_more_text_change_the_mix_and_the_words(self):
        more_photo = self.put(adjust={"text": "more_photo"})
        self.assertGreater(more_photo["mix"]["photo_only"], self.dna["mix"]["photo_only"])
        self.assertAlmostEqual(sum(more_photo["mix"].values()), 1.0, places=2)
        more_text = self.put(adjust={"text": "more_text"})
        self.assertLess(more_text["mix"]["photo_only"], more_photo["mix"]["photo_only"])
        self.assertEqual(more_text["direction"]["text_he"], design_dna.text_he_for_mix(more_text["mix"]))

    def test_locked_genes_stay_and_adjustments_survive_another_style(self):
        locked = self.put(type={"display": "suez-one"})
        quiet = self.put(adjust={"tone": "quieter"})
        self.assertEqual(quiet["type"], locked["type"], "the owner's fonts stay through an adjustment")
        regenerated = self.client.post("/brand/dna/regenerate").json()["brand_dna"]
        self.assertEqual(regenerated["adjusted"], ["quieter"])
        self.assertEqual(regenerated["type"], locked["type"])

    def test_motif_and_colour_edits_still_work_and_say_where_they_come_from(self):
        motif = self.put(motif={"kind": "grain", "from": "place", "note_he": "הקיר של המאפייה"})
        self.assertEqual(motif["motif"]["kind"], "grain")
        self.assertEqual(motif["motif"]["from"], "place")
        self.assertIn("motif", motif["locked"])
        by_hand = self.put(motif={"kind": "dots"})
        self.assertEqual(by_hand["motif"]["from"], "owner")
        colours = self.put(colors={"accent": "#C0643B", "accent_2": "#123456"})
        self.assertEqual(colours["colors_source"]["accent"], "logo")
        self.assertEqual(colours["colors_source"]["accent_2"], "owner")
        bad = self.client.put("/brand/dna", json={"adjust": {"tone": "louder"}})
        self.assertEqual(bad.status_code, 422)


# --- 5. one message per post, the price, the text-mode mix ---------------------------------------------


class OneMessageTest(unittest.TestCase):
    def test_the_image_carries_one_headline_and_at_most_one_short_line(self):
        item = {"title": "החלות של שישי", "overlay_headline": "החלות הכי טריות של שישי בבוקר בשכונה שלנו",
                "overlay_sub": "להזמנה בוואטסאפ עד רביעי", "cta": "להזמנה בוואטסאפ"}
        connected_posts.one_message(item)
        self.assertEqual(item["overlay_headline"], "החלות הכי טריות של שישי בבוקר")
        self.assertEqual(len(item["overlay_headline"].split()), 6)
        self.assertEqual(item["overlay_sub"], "", "a call to action stays in the caption")
        self.assertEqual(item["overlay_text"], item["overlay_headline"])
        cta_headline = {"title": "מארז שישי", "overlay_headline": "הזמינו עכשיו בוואטסאפ"}
        connected_posts.one_message(cta_headline)
        self.assertEqual(cta_headline["overlay_headline"], "מארז שישי")
        kept = {"overlay_headline": "מהתנור ב-05:00", "overlay_sub": "כל בוקר מחדש"}
        connected_posts.one_message(kept)
        self.assertEqual((kept["overlay_headline"], kept["overlay_sub"]), ("מהתנור ב-05:00", "כל בוקר מחדש"))

    def test_a_price_only_when_the_plan_offer_has_it(self):
        core = {"strategy": {"offer": {"cta_he": "מארז שישי ב-120 ₪", "mechanism_he": "הזמנה בוואטסאפ"}}}
        business = {"offerings": "חלות ולחם"}
        written = [
            {"title": "מארז שישי", "overlay_headline": "מארז שישי ב-120 ₪", "price_amount": 120, "price_note": "למארז",
             "mix_type": "offer", "week": 1},
            {"title": "מבצע", "overlay_headline": "רק 99 ₪", "price_amount": 99, "price_note": "", "week": 1},
            {"title": "בוקר", "overlay_headline": "בוקר טוב", "price_amount": 0, "price_note": "", "week": 1},
        ]
        connected_posts.finish_written(written, business, core)
        self.assertEqual(written[0]["price"], {"amount": 120, "currency": "ILS", "note": "למארז"})
        self.assertIsNone(written[1]["price"], "an invented price is never kept")
        self.assertIsNone(written[2]["price"])
        for item in written:
            self.assertNotIn("price_amount", item)
            self.assertNotIn("price_note", item)
        no_plan = [{"title": "x", "overlay_headline": "45 ₪ למגש", "price_amount": 45, "week": 1}]
        connected_posts.finish_written(no_plan, {"offerings": "מגשי אירוח"}, {})
        self.assertIsNone(no_plan[0]["price"])

    def test_the_writer_is_asked_for_one_message_and_a_real_price(self):
        from app.services.schemas_llm import MONTHLY_POST_ITEM_SCHEMA
        from app.services.strategy import posts_prompt

        for key in ("overlay_headline", "overlay_sub", "price_amount", "price_note"):
            self.assertIn(key, MONTHLY_POST_ITEM_SCHEMA["properties"])
            self.assertIn(key, MONTHLY_POST_ITEM_SCHEMA["required"])
        self.assertIn("לא לתמונה", MONTHLY_POST_ITEM_SCHEMA["properties"]["cta"]["description"])
        prompt = posts_prompt({"name": "x"}, {}, {}, {}, [1])
        self.assertIn("מסר אחד לפוסט", prompt)
        self.assertNotIn("מודפס על הכרטיס", prompt)

    def test_a_saved_price_follows_the_owners_text(self):
        post = {"overlay_headline": "מארז ב-150 ₪", "price": {"amount": 120, "currency": "ILS", "note": "למארז"}}
        self.assertEqual(connected_posts.price_after_edit(post), {"amount": 150, "currency": "ILS", "note": ""})
        post = {"overlay_headline": "מארז שישי", "caption": "המארז ב-120 ₪", "price": {"amount": 120, "currency": "ILS",
                                                                                        "note": "למארז"}}
        self.assertEqual(connected_posts.price_after_edit(post)["amount"], 120)
        self.assertIsNone(connected_posts.price_after_edit({"overlay_headline": "בוקר טוב", "price": None}))


class TextModeTest(unittest.TestCase):
    DNA = {"seed": 7, "compositions": ["full_bleed", "arch_window", "split", "type_led"],
           "mix": {"photo_only": 0.5, "headline": 0.4, "type_led": 0.1}}

    def month(self, n=20, **extra):
        return [{"title": f"פוסט {i}", "format": "image", **extra} for i in range(n)]

    def test_posts_follow_the_dna_mix(self):
        posts = assign_designs(self.month(), self.DNA)
        modes = [p["design"]["text_mode"] for p in posts]
        counts = {mode: modes.count(mode) for mode in ("photo_only", "headline", "type_led")}
        self.assertTrue(9 <= counts["photo_only"] <= 11, counts)
        self.assertTrue(7 <= counts["headline"] <= 9, counts)
        self.assertTrue(1 <= counts["type_led"] <= 3, counts)
        for post in posts:
            design = post["design"]
            self.assertIn(design["text_mode"], COMPOSITIONS[design["composition"]].text_modes)
            if design["text_mode"] == "type_led":
                self.assertEqual(design["composition"], "type_led")
        comps = [p["design"]["composition"] for p in posts]
        self.assertTrue(all(a != b for a, b in zip(comps, comps[1:])), comps)
        quieter = assign_designs(self.month(), {**self.DNA, "mix": {"photo_only": 0.7, "headline": 0.3, "type_led": 0}})
        self.assertGreater(sum(1 for p in quieter if p["design"]["text_mode"] == "photo_only"), counts["photo_only"])
        self.assertFalse(any(p["design"]["text_mode"] == "type_led" for p in quieter))

    def test_the_post_content_decides_first(self):
        products = assign_designs(self.month(8, mix_type="product"), self.DNA)
        self.assertFalse(any(p["design"]["text_mode"] == "type_led" for p in products))
        priced = assign_designs(self.month(4, price={"amount": 120, "currency": "ILS", "note": ""}), self.DNA)
        self.assertEqual({p["design"]["text_mode"] for p in priced}, {"headline"}, "the price is the headline")
        silent = assign_designs(self.month(4, has_overlay=False), self.DNA)
        self.assertEqual({p["design"]["text_mode"] for p in silent}, {"photo_only"})

    def test_the_overlay_switch_sets_the_mode(self):
        design = {"composition": "full_bleed", "text_mode": "headline"}
        self.assertEqual(sync_text_mode(design, False)["text_mode"], "photo_only")
        self.assertEqual(sync_text_mode(design, True)["text_mode"], "headline")
        self.assertEqual(sync_text_mode({"composition": "type_led"}, True)["text_mode"], "type_led")
        self.assertEqual(sync_text_mode({"composition": "ticket", "text_mode": "headline"}, False)["text_mode"],
                         "headline", "a ticket has no photo-only form")


class EditorDesignTest(DnaTestCase, unittest.TestCase):
    """The renderer's questions, decided: a composition change keeps the photo (and what we
    know about it); editorial_column at 9:16 only when picked by hand."""

    def setUp(self):
        self.setUp_dna()
        self.business = self.add_business("מאפייה")
        self.business.brand_dna_json = dumps(design_dna.preview_dna(self.business))
        analysed = {"composition": "full_bleed", "crop": "4:5", "text_position": "top", "text_mode": "headline",
                    "safe_area": {"x": 0.1, "y": 0.05, "w": 0.8, "h": 0.2}, "focal": {"x": 0.5, "y": 0.6},
                    "subject": {"x": 0.2, "y": 0.4, "w": 0.6, "h": 0.5}, "photo_hash": "abcd1234abcd1234"}
        posts = [{"uid": "p1", "title": "שישי", "format": "image", "image_url": "/backend/media/1/x.png",
                  "design": analysed}]
        self.strategy = Strategy(business_id=self.business.id, year=2026, month=10, usp_json="{}", calendar_json="[]",
                                 roadmap_json=dumps({"roadmap": {"posts": posts}}))
        self.db.add(self.strategy)
        self.db.commit()
        self.client = self.client_for(self.business)

    def save(self, **body):
        response = self.client.post("/strategy/posts/save", json={"post_index": 0, "title": "שישי", **body})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["post"]

    def test_a_composition_change_keeps_the_photo_analysis(self):
        post = self.save(format="image", design={"composition": "circle_crop", "text_position": "bottom"})
        self.assertEqual(post["design"]["composition"], "circle_crop")
        self.assertEqual(post["design"]["safe_area"], {"x": 0.1, "y": 0.05, "w": 0.8, "h": 0.2})
        self.assertEqual(post["design"]["focal"], {"x": 0.5, "y": 0.6})
        off = self.save(format="image", has_overlay=False)
        self.assertEqual(off["design"]["text_mode"], "photo_only", "the overlay switch off = photo only")
        self.assertEqual(off["design"]["safe_area"]["w"], 0.8)

    def test_editorial_column_on_a_story_only_by_hand(self):
        from app.services.post_design import clean_design

        self.assertIsNone(clean_design({"composition": "editorial_column"}, {"format": "story"}))
        post = self.save(format="story", design={"composition": "editorial_column", "text_position": "start"})
        self.assertEqual((post["design"]["composition"], post["design"]["crop"], post["design"]["by_hand"]),
                         ("editorial_column", "9:16", True))
        strategy = self.client.get("/strategy/current").json()
        self.assertEqual(strategy["roadmap"]["posts"][0]["design"]["composition"], "editorial_column",
                         "every later read keeps the hand-picked layout")
        stories = assign_designs([{"title": str(i), "format": "story"} for i in range(8)],
                                 {"seed": 3, "compositions": ["editorial_column", "full_bleed", "arch_window"]})
        self.assertNotIn("editorial_column", [p["design"]["composition"] for p in stories])


# --- 6. safe_area and focal per post photo ----------------------------------------------------------


def layout_answer(safe=(0.08, 0.05, 0.84, 0.22)):
    return json.dumps({"subject": {"x": 0.2, "y": 0.4, "w": 0.6, "h": 0.5}, "focal": {"x": 0.5, "y": 0.62},
                       "has_safe_area": safe is not None,
                       "safe_area": dict(zip("xywh", safe)) if safe else {"x": 0, "y": 0, "w": 0, "h": 0}})


class SafeAreaTest(DnaTestCase, unittest.TestCase):
    def setUp(self):
        self.setUp_dna()
        self.business = self.add_business("מאפיית תום", offerings="חלות ולחם")
        self.post = {"design": {"composition": "full_bleed", "crop": "4:5", "text_position": "bottom",
                                "text_mode": "headline"}}
        patch = mock.patch.object(get_settings(), "photo_analysis", True)
        patch.start()
        self.addCleanup(patch.stop)

    def test_validation_keeps_only_a_calm_area_that_misses_the_subject(self):
        good = photo_analysis.validate(json.loads(layout_answer()))
        self.assertEqual(good["safe_area"], {"x": 0.08, "y": 0.05, "w": 0.84, "h": 0.22})
        self.assertEqual(good["focal"], {"x": 0.5, "y": 0.62})
        over = photo_analysis.validate(json.loads(layout_answer((0.2, 0.45, 0.6, 0.3))))
        self.assertIsNone(over["safe_area"], "a box over the subject is no safe area")
        tiny = photo_analysis.validate(json.loads(layout_answer((0.0, 0.0, 0.1, 0.05))))
        self.assertIsNone(tiny["safe_area"])
        clamped = photo_analysis.validate({"subject": {"x": -1, "y": 0.5, "w": 3, "h": 0.4}, "has_safe_area": False})
        self.assertEqual(clamped["subject"], {"x": 0.0, "y": 0.5, "w": 1.0, "h": 0.4})
        self.assertIsNone(clamped["safe_area"])

    def test_the_models_0_1000_grid_and_pixel_answers_are_scaled(self):
        """Live, Gemini answered on its own 0-1000 grid (tazizi.co.il smoke): read as 0-1."""
        grid = {"subject": {"x": 286, "y": 178, "w": 600, "h": 700}, "focal": {"x": 427, "y": 428},
                "has_safe_area": True, "safe_area": {"x": 40, "y": 20, "w": 900, "h": 140}}
        result = photo_analysis.validate(photo_analysis.normalise_scale(grid))
        self.assertEqual(result["subject"], {"x": 0.286, "y": 0.178, "w": 0.6, "h": 0.7})
        self.assertEqual(result["focal"], {"x": 0.427, "y": 0.428})
        self.assertEqual(result["safe_area"], {"x": 0.04, "y": 0.02, "w": 0.9, "h": 0.14})
        pixels = {"subject": {"x": 1200, "y": 300, "w": 300, "h": 600}, "focal": {"x": 1350, "y": 600},
                  "has_safe_area": False, "safe_area": {"x": 0, "y": 0, "w": 0, "h": 0}}
        scaled = photo_analysis.validate(photo_analysis.normalise_scale(pixels, (1500, 1200)))
        self.assertEqual(scaled["subject"], {"x": 0.8, "y": 0.25, "w": 0.2, "h": 0.5})
        self.assertIsNone(scaled["safe_area"])
        fractions = json.loads(layout_answer())
        self.assertEqual(photo_analysis.normalise_scale(fractions), fractions)

    def test_one_call_per_photo_cached_by_its_hash(self):
        photo = photo_bytes()
        with mock.patch("app.services.gemini.generate_json", return_value=layout_answer()) as model:
            first = photo_analysis.attach(self.db, self.business.id, self.post, photo, "image/jpeg")
            post_b = {"design": {"composition": "split", "crop": "4:5", "text_position": "bottom"}}
            again = photo_analysis.attach(self.db, self.business.id, post_b, photo, "image/jpeg")
            other = photo_analysis.attach(self.db, self.business.id, {"design": {"composition": "full_bleed"}},
                                          photo_bytes((10, 200, 40)), "image/jpeg")
        self.assertEqual(model.call_count, 2, "the same photo is never analysed twice")
        self.assertEqual(first["safe_area"], again["safe_area"])
        self.assertIsNotNone(other)
        self.assertEqual(self.db.query(PhotoAnalysis).filter(PhotoAnalysis.business_id == self.business.id).count(), 2)
        design = self.post["design"]
        self.assertEqual(design["safe_area"], {"x": 0.08, "y": 0.05, "w": 0.84, "h": 0.22})
        self.assertEqual(design["focal"], {"x": 0.5, "y": 0.62})
        self.assertEqual(design["text_position"], "top", "the headline moves to the photo's calm area")
        self.assertEqual(len(design["photo_hash"]), 16)
        kwargs = model.call_args.kwargs
        self.assertEqual(kwargs["model"], get_settings().design_dna_model)
        self.assertEqual(kwargs["images"][0][1], "image/jpeg")

    def test_no_call_when_it_may_not_spend_and_never_a_failure(self):
        with mock.patch("app.services.gemini.generate_json") as model:
            self.assertIsNone(photo_analysis.attach(self.db, self.business.id, self.post, photo_bytes(), "image/jpeg",
                                                    allow_model=False))
        model.assert_not_called()
        self.assertNotIn("safe_area", self.post["design"])
        with mock.patch("app.services.gemini.generate_json", side_effect=RuntimeError("503")), \
                self.assertLogs("app.services.photo_analysis", level="WARNING"):
            self.assertIsNone(photo_analysis.attach(self.db, self.business.id, self.post, photo_bytes(), "image/jpeg"))

    def test_a_new_photo_never_inherits_the_old_safe_area(self):
        with mock.patch("app.services.gemini.generate_json", return_value=layout_answer()):
            photo_analysis.attach(self.db, self.business.id, self.post, photo_bytes(), "image/jpeg")
        self.assertIn("safe_area", self.post["design"])
        with mock.patch("app.services.gemini.generate_json", side_effect=RuntimeError("down")), \
                self.assertLogs("app.services.photo_analysis", level="WARNING"):
            photo_analysis.attach(self.db, self.business.id, self.post, photo_bytes((1, 2, 3)), "image/jpeg")
        self.assertNotIn("safe_area", self.post["design"])

    def test_the_post_image_endpoint_stores_the_layout_on_the_design(self):
        self.business.brand_dna_json = dumps(design_dna.preview_dna(self.business))
        posts = [{"uid": "p1", "title": "קרואסון חמאה", "format": "image", "featured_item_name": "קרואסון",
                  "design_creative": {"scene_description": "x"}, "scene_description": "a croissant"}]
        self.db.add(Strategy(business_id=self.business.id, year=2026, month=10, usp_json="{}", calendar_json="[]",
                             roadmap_json=dumps({"roadmap": {"posts": posts}})))
        self.db.commit()
        client = self.client_for(self.business)
        generated = photo_bytes((200, 180, 150))
        with mock.patch.object(muse_image, "generate", return_value=(generated, "image/jpeg")) as muse, \
                mock.patch("app.services.gemini.generate_json", return_value=layout_answer()) as vision:
            post = client.post("/strategy/posts/image", json={"post_index": 0}).json()["post"]
        self.assertEqual(post["image_source"], "generated")
        self.assertEqual(post["design"]["safe_area"], {"x": 0.08, "y": 0.05, "w": 0.84, "h": 0.22})
        self.assertEqual(post["design"]["focal"], {"x": 0.5, "y": 0.62})
        self.assertEqual(vision.call_count, 1)
        prompt = muse.call_args.args[0]
        if post["design"]["text_mode"] != "photo_only":
            self.assertIn("calm negative space", prompt)

    def test_generated_photos_leave_calm_space_where_the_text_goes(self):
        headline = {"title": "x", "format": "image", "design": {"composition": "full_bleed", "text_position": "top",
                                                                "text_mode": "headline"}}
        prompt = images.build_image_prompt(headline, {}, {"name": "x", "offerings": "y"}, None)
        self.assertIn("Leave calm negative space in the top of the frame", prompt)
        photo_only = {**headline, "design": {**headline["design"], "text_mode": "photo_only"}}
        prompt = images.build_image_prompt(photo_only, {}, {"name": "x", "offerings": "y"}, None)
        self.assertNotIn("negative space", prompt)
        self.assertIn("clean hero photograph", prompt)


# --- 7. the plan gate --------------------------------------------------------------------------------


class PlanGateTest(DnaTestCase, unittest.TestCase):
    def setUp(self):
        self.setUp_dna()

    def test_regenerate_on_a_plan_that_does_not_allow_it_is_402_plan_required(self):
        business = self.add_business("מאפייה")
        client = self.client_for(business)
        with mock.patch("app.services.billing.locked", return_value=True), \
                mock.patch.object(design_dna, "regenerate_dna") as regenerate:
            response = client.post("/brand/dna/regenerate")
        regenerate.assert_not_called()
        self.assertEqual(response.status_code, 402)
        body = response.json()
        self.assertEqual(body["code"], "plan_required")
        self.assertRegex(body["detail_he"], HEBREW)
        self.assertEqual(body["detail"], body["detail_he"], "the old shape still carries the sentence")


# --- 8. the designer review script ---------------------------------------------------------------------


class DesignReviewScriptTest(unittest.TestCase):
    def setUp(self):
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
        import design_review

        self.review = design_review
        self.tmp = Path(tempfile.mkdtemp(prefix="design-review-test-"))
        self.addCleanup(lambda: __import__("shutil").rmtree(self.tmp, ignore_errors=True))

    def test_scores_every_png_and_writes_json_and_html(self):
        folder = self.tmp / "renders"
        folder.mkdir()
        for name in ("a.png", "b.png"):
            (folder / name).write_bytes(png_bytes(40, 50))
        meta = {"default": {"business": "תחרה", "direction": {"feel_he": "רך ובטוח"}}}

        def reviewer(data, info, model):
            self.assertEqual(info["business"], "תחרה")
            return {"template_look": 2, "subject_visible": 5, "readable_on_phone": 4, "fits_direction": 4,
                    "would_stop": 3, "notes_he": "הצילום עובד, הכותרת קטנה מדי", "notes_en": "Photo works, headline small"}

        out = self.tmp / "report"
        results = self.review.run(sorted(folder.glob("*.png")), meta, out, "gemini-test", reviewer=reviewer,
                                  log=lambda *_: None)
        self.assertEqual(len(results), 2)
        payload = json.loads((out / "review.json").read_text(encoding="utf-8"))
        self.assertEqual(payload["summary"]["subject_visible"], 5)
        self.assertEqual(payload["posts"][0]["scores"]["notes_he"], "הצילום עובד, הכותרת קטנה מדי")
        page = (out / "index.html").read_text(encoding="utf-8")
        self.assertIn("הכותרת קטנה מדי", page)
        self.assertTrue((out / results[0]["thumb"]).is_file())

    def test_the_rubric_and_a_fixture_as_meta(self):
        keys = [key for key, _label, _note in self.review.RUBRIC]
        self.assertEqual(keys, ["template_look", "subject_visible", "readable_on_phone", "fits_direction", "would_stop"])
        self.assertEqual(set(self.review.SCHEMA["required"]), {*keys, "notes_he", "notes_en"})
        fixture = self.tmp / "tazizi.json"
        fixture.write_text(json.dumps({"name": "ת'ציצי", "brand_dna": {"direction": {"feel_he": "x"}}}), encoding="utf-8")
        meta = self.review.load_meta(str(fixture))
        self.assertEqual(meta["default"]["business"], "ת'ציצי")
        self.assertIn("feel_he: x", self.review.prompt_for(meta["default"]))


if __name__ == "__main__":
    unittest.main()
