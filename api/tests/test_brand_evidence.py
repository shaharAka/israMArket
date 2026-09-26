"""Brand evidence for the public preview: logo, colours customers see, the screenshot.

Hermetic like test_public_preview: DNS is faked, HTTP goes to a MockTransport, Gemini is
replaced by a fake that answers by schema title, and Chrome is never launched (the
screenshot is off in `_test_env`; the tests that exercise it mock the launch).

The three fixture pages are cut-down copies of what real Israeli small-business sites
serve (Sept 2026): a Wix shop (tazizi.co.il's header logo, Wix's default favicon and
theme colours), a Shopify Dawn store and a WordPress/Elementor/WooCommerce florist.
"""
import _test_env  # noqa: F401  (must come before any `app` import)

import io
import json
import socket
import unittest
from unittest import mock

import httpx
from bs4 import BeautifulSoup
from PIL import Image

from app.main import _with_loopback_twins
from app.services import brand as brand_service
from app.services import colors
from app.services import gemini
from app.services import preview as preview_service
from app.services import ratelimit
from app.services import scraper
from app.services import screenshot
from app.services import strategy as strategy_service

WIX_LOGO = (
    "https://static.wixstatic.com/media/4f0f37_47009e0181c444ff8516a3d458f04bb9~mv2.png/v1/fill/"
    "w_{w},h_{h},al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/"
    "%D7%9C%D7%95%D7%92%D7%95-%D7%97%D7%93%D7%A9.png"
)
WIX_HTML = f"""<!doctype html><html lang="he"><head>
<title>ת'ציצי פנימה - חנות הלבשה תחתונה</title>
<meta name="description" content="קולקציות אופנתיות ובלעדיות בתחום הלבשה תחתונה והלבשת שינה לנשים">
<meta name="generator" content="Wix.com Website Builder">
<link rel="icon" sizes="192x192" href="https://static.wixstatic.com/media/f94c49_5b9421d358c945a291d3ab80f241f0be%7Emv2.png/v1/fill/w_192%2Ch_192/f94c49_5b.png">
<link rel="apple-touch-icon" href="https://static.wixstatic.com/media/f94c49_5b9421d358c945a291d3ab80f241f0be%7Emv2.png/v1/fill/w_180%2Ch_180/f94c49_5b.png">
<script type="application/ld+json">{{"@context":"https://schema.org/","@type":"LocalBusiness","name":"תציצי פנימה","image":"https://static.wixstatic.com/media/4f0f37_18f55f8bcc214a6998a5e1f506193219~mv2.png"}}</script>
<style>:root{{--color_11:#2b5672;--color_12:#2f5dff;--color_13:#597dff;--color_14:#acbeff;--color_15:#383838;--color_16:#e0dfdf;--brand-pink:#ee386f}}
.err{{color:#df3336;background:#fcebeb}}</style>
</head><body>
<header id="SITE_HEADER"><a href="/"><img fetchpriority="high" sizes="376px"
 srcSet="{WIX_LOGO.format(w=376, h=85)} 1x, {WIX_LOGO.format(w=752, h=170)} 2x"
 src="{WIX_LOGO.format(w=376, h=85)}" alt="לוגו ת&#x27;ציצי פנימה" width="376" height="85"></a>
<nav><a href="/bras">חזיות</a><a href="/sleep">שינה ופנאי</a></nav></header>
<h1>קולקציית פיג׳מות חורף 2026</h1>
<p>התחברי לאתר ותיהני ממשלוח חינם. לחצי לרכישה של פיג׳מת פוטר רכה, עם החלפות עד הבית.</p>
<p>חזיית Shape Smart של טריומף, בלי ברזלים ובלי ריפוד, מחכה במידות 70 עד 90.</p>
<img src="https://static.wixstatic.com/media/4f0f37_photo1~mv2.jpg/v1/fit/w_960,h_700/p1.jpg" alt="">
<img src="https://static.wixstatic.com/media/4f0f37_photo2~mv2.jpg/v1/fit/w_900,h_700/p2.jpg" alt="">
<a href="/cart">לחצי לרכישה</a><a href="/login">התחברי</a>
</body></html>"""

SHOPIFY_HTML = """<!doctype html><html lang="he"><head>
<title>Hadas Jewelry - תכשיטים בעבודת יד</title>
<meta name="description" content="תכשיטים בעבודת יד מכסף וזהב, מעוצבים בסטודיו בתל אביב">
<link rel="stylesheet" href="//cdn.shopify.com/s/files/1/theme/base.css">
<script>window.Shopify = {}; Shopify.theme = {"name":"Dawn"};</script>
<script type="application/ld+json">{"@context":"http://schema.org","@type":"Organization","name":"Hadas Jewelry",
 "logo":"https://hadas.example/cdn/shop/files/hadas_logo.png?width=455","sameAs":[]}</script>
<style>:root{--color-button:#121212;--color-accent-2:#334fb4;--color-brand:#996e5c}
.shopify-payment-button{background:#5a31f4}</style>
</head><body>
<header class="header"><a href="/" class="header__heading-link"><img class="header__heading-logo"
 src="//hadas.example/cdn/shop/files/hadas_koka.png?v=1&width=300" alt="Hadas Jewelry" width="300" height="66"></a></header>
<h1>שרשרת קוקה בציפוי זהב</h1>
<p>כל שרשרת נעשית ביד בסטודיו, מחוט כסף 925 בעובי מילימטר, עם סגירה קטנה ונוחה.</p>
</body></html>"""

WORDPRESS_HTML = """<!doctype html><html lang="he"><head>
<title>בוטיק הפרח - חנות פרחים בחדרה</title>
<meta name="generator" content="WordPress 7.1.2">
<link rel="apple-touch-icon" href="https://flowers.example/wp-content/uploads/2024/09/icon-180.png">
<style>:root{--e-global-color-primary:#6ec1e4;--e-global-color-secondary:#54595f;--e-global-color-text:#7a7a7a;
--e-global-color-accent:#61ce70;--brand-rose:#e5b1be}.woocommerce a.button{background:#7f54b3}
.site{color:#65785d}</style>
<link rel="stylesheet" href="https://flowers.example/wp-content/themes/woodmart/style.css">
</head><body>
<header class="whb-header"><div class="site-logo"><a href="https://flowers.example/" class="custom-logo-link">
<img src="https://flowers.example/wp-content/uploads/2024/09/%D7%9C%D7%95%D7%92%D7%95-wide.png" width="600" height="222" alt="בוטיק הפרח"></a></div></header>
<h1>זרי כלה ופרחים לאירועים</h1>
<p>אנחנו מכינים זרים טריים כל בוקר בחדרה, עם משלוח לכל השרון באותו היום.</p>
<footer><img src="https://flowers.example/wp-content/uploads/2023/bit-logo.png" alt="bit logo" width="60" height="60"></footer>
</body></html>"""


def png(colors_share: list[tuple[tuple[int, int, int, int], float]], size=(100, 100)) -> bytes:
    """A PNG whose pixels are split between the given RGBA colours by share, row by row."""
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    rows = []
    for rgba, share in colors_share:
        rows.extend([rgba] * round(share * size[1]))
    rows = (rows + [rows[-1]] * size[1])[: size[1]]
    for y, rgba in enumerate(rows):
        for x in range(size[0]):
            image.putpixel((x, y), rgba)
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def jpeg(color: tuple[int, int, int], size=(800, 600)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, format="JPEG", quality=90)
    # Solid colour compresses to almost nothing; pad past the photo-size floor.
    return out.getvalue() + b"\x00" * 13_000


PINK = (238, 56, 111, 255)
NUDE = (232, 188, 171, 255)
BEIGE = (232, 218, 198, 255)
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)


class LogoCandidatesTest(unittest.TestCase):
    def ranked(self, html: str, base: str) -> list[dict]:
        return scraper.logo_candidates(base, BeautifulSoup(html, "lxml"))

    def test_wix_header_logo_beats_jsonld_image_and_skips_the_default_favicon(self):
        ranked = self.ranked(WIX_HTML, "https://www.tazizi.example/")
        self.assertEqual(ranked[0]["source"], "img_logo")
        # The widest srcset variant, despite Wix's commas inside the URL.
        self.assertEqual(ranked[0]["url"], WIX_LOGO.format(w=752, h=170))
        sources = [item["source"] for item in ranked]
        self.assertIn("jsonld_image", sources)
        self.assertLess(sources.index("img_logo"), sources.index("jsonld_image"))
        # Wix's default favicon (the f94c49_ media prefix) is nobody's logo.
        self.assertFalse(any("f94c49_" in item["url"] for item in ranked))

    def test_shopify_jsonld_logo_comes_first(self):
        ranked = self.ranked(SHOPIFY_HTML, "https://hadas.example/")
        self.assertEqual(ranked[0]["source"], "jsonld_logo")
        self.assertEqual(ranked[0]["url"], "https://hadas.example/cdn/shop/files/hadas_logo.png?width=455")
        # The header logo is still a candidate (class says "logo"), ranked after it.
        self.assertIn("https://hadas.example/cdn/shop/files/hadas_koka.png?v=1&width=300", [i["url"] for i in ranked])

    def test_wordpress_custom_logo_wins_and_a_payment_badge_is_never_the_logo(self):
        ranked = self.ranked(WORDPRESS_HTML, "https://flowers.example/")
        self.assertEqual(ranked[0]["source"], "img_logo")
        self.assertIn("%D7%9C%D7%95%D7%92%D7%95-wide.png", ranked[0]["url"])
        self.assertFalse(any("bit-logo" in item["url"] for item in ranked))
        self.assertEqual(ranked[-1]["source"], "apple_touch_icon")

    def test_priority_order_without_an_img(self):
        html = """<html><head>
        <link rel="apple-touch-icon" href="/touch.png">
        <meta property="og:logo" content="/og-logo.png">
        <script type="application/ld+json">{"@graph":[{"@type":"Organization","logo":{"@type":"ImageObject","url":"/ld-logo.png"}}]}</script>
        </head><body><div itemprop="logo" content="/microdata.png"></div></body></html>"""
        ranked = self.ranked(html, "https://shop.example/")
        self.assertEqual(
            [item["url"].rsplit("/", 1)[-1] for item in ranked],
            ["ld-logo.png", "microdata.png", "og-logo.png", "touch.png"],
        )

    def test_logo_is_excluded_from_photo_candidates(self):
        soup = BeautifulSoup(WIX_HTML, "lxml")
        logos = scraper.logo_candidates("https://www.tazizi.example/", soup)
        claimed = {scraper._asset_key(item["url"]) for item in logos}
        photos = scraper._image_candidates("https://www.tazizi.example/", soup, WIX_HTML, exclude=claimed)
        self.assertFalse(any("47009e0181c444ff8516a3d458f04bb9" in url for url in photos))
        self.assertTrue(any("photo1" in url for url in photos))


class PlatformDefaultsTest(unittest.TestCase):
    def css_colors(self, html: str) -> list[str]:
        soup = BeautifulSoup(html, "lxml")
        return scraper._extract_colors(html, soup, [], colors.detect_platform(html))

    def test_detects_the_platform(self):
        self.assertEqual(colors.detect_platform(WIX_HTML), "wix")
        self.assertEqual(colors.detect_platform(SHOPIFY_HTML), "shopify")
        self.assertEqual(colors.detect_platform(WORDPRESS_HTML), "wordpress")
        self.assertEqual(colors.detect_platform("<html><body>שלום</body></html>"), "")

    def test_wix_theme_and_ui_ramps_are_dropped_the_brand_colour_kept(self):
        found = self.css_colors(WIX_HTML)
        self.assertIn("#ee386f", found)
        for default in ("#2b5672", "#2f5dff", "#597dff", "#acbeff", "#383838", "#df3336"):
            self.assertNotIn(default, found)

    def test_shopify_dawn_and_shop_pay_are_dropped(self):
        found = self.css_colors(SHOPIFY_HTML)
        self.assertIn("#996e5c", found)
        for default in ("#334fb4", "#5a31f4"):
            self.assertNotIn(default, found)

    def test_elementor_and_woocommerce_defaults_are_dropped(self):
        found = self.css_colors(WORDPRESS_HTML)
        self.assertIn("#e5b1be", found)
        self.assertIn("#65785d", found)
        for default in ("#6ec1e4", "#54595f", "#61ce70", "#7f54b3"):
            self.assertNotIn(default, found)

    def test_builder_fonts_are_not_brand_fonts(self):
        sheet = "body{font-family:madefor-text,'メイリオ',var(--wix-font-Body-M-family),Heebo,sans-serif}"
        self.assertEqual(scraper._fonts_from_text(sheet), ["Heebo"])


class DominantColorsTest(unittest.TestCase):
    def test_most_common_first_and_minor_white_dropped(self):
        found = colors.dominant_colors(png([(PINK, 0.6), (BEIGE, 0.3), (WHITE, 0.1)]))
        hexes = [item["hex"] for item in found]
        self.assertEqual(len(hexes), 2, found)
        self.assertLess(colors.color_distance(colors.hex_to_rgb(hexes[0]), PINK[:3]), 25)
        self.assertLess(colors.color_distance(colors.hex_to_rgb(hexes[1]), BEIGE[:3]), 25)
        self.assertGreater(found[0]["share"], found[1]["share"])

    def test_a_dominant_neutral_is_kept(self):
        found = colors.dominant_colors(png([(WHITE, 0.8), (PINK, 0.2)]))
        self.assertEqual(found[0]["hex"], "#ffffff")

    def test_transparent_pixels_are_ignored(self):
        found = colors.dominant_colors(png([(CLEAR, 0.7), (NUDE, 0.2), (PINK, 0.1)]))
        self.assertEqual(len(found), 2)
        self.assertAlmostEqual(sum(item["share"] for item in found), 1.0, places=2)

    def test_undecodable_bytes_are_no_evidence(self):
        self.assertEqual(colors.dominant_colors(b"not an image"), [])

    def test_svg_logo_colours(self):
        svg = '<svg><path fill="#EE386F"/><path fill="#ee386f"/><circle style="fill:#e8bcab"/><rect fill="#fff"/></svg>'
        self.assertEqual([c["hex"] for c in colors.svg_colors(svg)], ["#ee386f", "#e8bcab"])


class CleanPaletteTest(unittest.TestCase):
    scraped = {
        "platform": "wix",
        "color_evidence": {
            "screenshot": [{"hex": "#e8dac6", "share": 0.3}],
            "logo": [{"hex": "#eabeac", "share": 0.6}, {"hex": "#ed427a", "share": 0.4}],
            "photos": [],
            "css": [],
        },
    }

    def test_platform_defaults_from_the_model_are_dropped(self):
        palette = [
            {"hex": "#2B5672", "role": "primary", "name": "כחול"},
            {"hex": "#ed427a", "role": "accent", "name": "ורוד"},
            {"hex": "#e8dac6", "role": "background", "name": "בז׳"},
        ]
        cleaned = brand_service.clean_palette(palette, self.scraped)
        self.assertEqual([s["hex"] for s in cleaned], ["#ed427a", "#e8dac6"])

    def test_a_default_that_customers_really_see_stays(self):
        scraped = {**self.scraped, "color_evidence": {**self.scraped["color_evidence"], "logo": [{"hex": "#2b5672", "share": 1}]}}
        cleaned = brand_service.clean_palette([{"hex": "#2b5672", "role": "primary", "name": "כחול"}], scraped)
        self.assertEqual(cleaned[0]["hex"], "#2b5672")

    def test_measured_colours_fill_an_empty_palette(self):
        palette = [{"hex": "#2f5dff", "role": "primary", "name": ""}, {"hex": "nonsense", "role": "ink", "name": ""}]
        cleaned = brand_service.clean_palette(palette, self.scraped)
        self.assertEqual(cleaned[0]["hex"], "#eabeac")
        self.assertEqual(cleaned[0]["role"], "primary")
        self.assertTrue(all(s["name"] for s in cleaned))


# --- End to end: scrape → brand → preview payload -------------------------------------

LOGO_PNG = png([(CLEAR, 0.5), (NUDE, 0.3), (PINK, 0.2)], size=(376, 85))
PHOTO = jpeg((200, 150, 120))

BRAND_REPLY = {
    "business_name": "ת'ציצי פנימה",
    "palette": [
        {"hex": "#2b5672", "role": "primary", "name": "כחול"},  # a Wix default: must go
        {"hex": "#ee386f", "role": "accent", "name": "ורוד", "seen_in": "logo"},
        {"hex": "#e8dac6", "role": "background", "name": "בז׳", "seen_in": "screenshot"},
    ],
    "typography": {"primary": "Assistant", "mood": "נשי"},
    "visual_style": "",
    "photography": "",
    "voice": "ישיר ומחויך",
    "voice_examples": [],
    "do_say": [],
    "dont_say": [],
    "messaging": [],
    "offers_seen": ["פיג׳מות חורף"],
    "audience": "נשים",
    "logo_description": "כיתוב ורוד וציור בגוון ניוד",
    "card_photo_index": 1,
}
GOOD_POST = {
    "product": "פיג׳מת פוטר חורף",
    "title": "פיג׳מת פוטר",
    "hook": "פוטר עבה עם גזרה רחבה לערבים הקרים.",
    "caption": "הבד רך מבפנים ולא מתכווץ בכביסה. יש מידות S עד XL.",
    "cta": "לראות את הדגמים",
    "overlay_headline": "פוטר חם לערבי חורף",
}
BAD_POST = {
    **GOOD_POST,
    "hook": "פיג׳מות פוטר חמות מחכות לכן באתר.",
    "caption": "קולקציות אופנתיות ובלעדיות בתחום הלבשה תחתונה והלבשת שינה לנשים.",
    "cta": "קנו",
    "overlay_headline": "הפיג׳מות הכי חמות של החורף הזה מחכות",
}


def guess_with(post: dict) -> dict:
    return {
        "business_type": "חנות אונליין (אי-קומרס)",
        "business_model": "products",
        "presence_type": "online_only",
        "offerings_summary": "הלבשה תחתונה",
        "post": post,
    }


class ScanTestCase(unittest.TestCase):
    def setUp(self):
        ratelimit.reset()
        preview_service.reset_cache()
        self.calls: list[tuple[str, list]] = []
        self.posts = [GOOD_POST]
        real_client = httpx.Client

        def handler(request: httpx.Request) -> httpx.Response:
            url = str(request.url)
            if request.url.path in {"", "/"}:
                return httpx.Response(200, headers={"content-type": "text/html"}, text=WIX_HTML)
            if "47009e0181c444ff8516a3d458f04bb9" in url:
                return httpx.Response(200, headers={"content-type": "image/png"}, content=LOGO_PNG)
            if "photo" in url:
                return httpx.Response(200, headers={"content-type": "image/jpeg"}, content=PHOTO)
            return httpx.Response(404)

        def client_factory(*args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handler)
            return real_client(*args, **kwargs)

        def fake_dns(host, port, *args, **kwargs):
            return [(2, 1, 6, "", ("93.184.216.34", port))]

        def fake_model(prompt, schema, images=None, thinking_level="LOW"):
            title = schema.get("title")
            self.calls.append((title, list(images or [])))
            if title == "BrandLanguage":
                return json.dumps(BRAND_REPLY, ensure_ascii=False)
            if title == "SiteExtract":
                return json.dumps({"business_name": "ת'ציצי פנימה", "location": ""}, ensure_ascii=False)
            if title == "PreviewGuess":
                post = self.posts.pop(0) if len(self.posts) > 1 else self.posts[0]
                return json.dumps(guess_with(post), ensure_ascii=False)
            raise AssertionError(title)

        self._patches = [
            mock.patch.object(scraper.httpx, "Client", side_effect=client_factory),
            mock.patch("app.services.netguard.socket.getaddrinfo", side_effect=fake_dns),
            mock.patch.object(brand_service, "extract_json", side_effect=fake_model),
            mock.patch.object(strategy_service, "extract_json", side_effect=fake_model),
            mock.patch.object(preview_service, "extract_json", side_effect=fake_model),
        ]
        for patch in self._patches:
            patch.start()
        self.addCleanup(self._cleanup)

    def _cleanup(self):
        for patch in reversed(self._patches):
            patch.stop()
        preview_service.reset_cache()

    def titles(self) -> list[str]:
        return [title for title, _ in self.calls]


class ScrapeEvidenceTest(ScanTestCase):
    def test_logo_has_its_own_slot_and_colour_evidence(self):
        scraped = scraper.scrape_site("https://www.tazizi.example/", limits=scraper.PREVIEW_LIMITS)
        self.assertEqual(scraped["platform"], "wix")
        self.assertEqual(scraped["logo_url"], WIX_LOGO.format(w=752, h=170))
        self.assertEqual(scraped["logo"]["source"], "img_logo")
        self.assertEqual((scraped["logo"]["width"], scraped["logo"]["height"]), (376, 85))
        # Photos are photos: the logo did not take one of the slots.
        self.assertEqual(len(scraped["images"]), 2)
        self.assertFalse(any("47009e0181c444ff8516a3d458f04bb9" in p["url"] for p in scraped["images"]))
        evidence = scraped["color_evidence"]
        logo_hexes = [item["hex"] for item in evidence["logo"]]
        self.assertTrue(any(colors.shown_in(h, [{"hex": "#ee386f"}], 30) for h in logo_hexes), logo_hexes)
        self.assertTrue(evidence["photos"])
        self.assertNotIn("#2b5672", evidence["css"])
        self.assertEqual(evidence["screenshot"], [])

    def test_stored_scan_carries_the_logo_url_but_no_bytes(self):
        scraped = scraper.scrape_site("https://www.tazizi.example/", limits=scraper.PREVIEW_LIMITS)
        scan = brand_service.public_scan(scraped, {}, {"business_name": "x"})
        self.assertNotIn("logo", scan["raw"])
        self.assertNotIn("images", scan["raw"])
        self.assertEqual(scan["raw"]["logo_url"], WIX_LOGO.format(w=752, h=170))
        json.dumps(scan)  # must be storable as JSON

    def test_brand_model_sees_the_logo_after_any_screenshot_and_before_photos(self):
        scraped = scraper.scrape_site("https://www.tazizi.example/", limits=scraper.PREVIEW_LIMITS)
        brand = brand_service.extract_brand_language(scraped)
        _, images = self.calls[-1]
        self.assertEqual(images[0], (LOGO_PNG, "image/png"))
        self.assertEqual(len(images), 3)
        self.assertEqual([s["hex"] for s in brand["palette"]], ["#ee386f", "#e8dac6"])
        self.assertEqual(brand["logo_url"], WIX_LOGO.format(w=752, h=170))
        self.assertEqual(brand["card_photo_url"], scraped["images"][1]["url"])
        self.assertNotIn("card_photo_index", brand)


class PreviewPayloadTest(ScanTestCase):
    def test_payload_carries_logo_palette_and_card_photo(self):
        body = preview_service.build_preview("https://www.tazizi.example/")
        logo = WIX_LOGO.format(w=752, h=170)
        self.assertEqual(body["logo_url"], logo)
        self.assertEqual(body["brand_language"]["logo_url"], logo)
        self.assertTrue(body["brand_language"]["logo_description"])
        self.assertEqual([s["hex"] for s in body["palette"]], ["#ee386f", "#e8dac6"])
        post = body["sample_post"]
        self.assertEqual(post["product"], "פיג׳מת פוטר חורף")
        self.assertIn("photo2", post["photo_url"])
        dumped = json.dumps(body, ensure_ascii=False)
        self.assertNotIn("bytes", dumped)
        self.assertNotIn("color_evidence", dumped)
        # And the cached scan (reused by onboarding) keeps the logo for later cards.
        self.assertEqual(preview_service.cached_scan("tazizi.example")["brand_language"]["logo_url"], logo)

    def test_a_post_that_breaks_the_rules_is_retried_once(self):
        self.posts = [BAD_POST, GOOD_POST]
        body = preview_service.build_preview("https://www.tazizi.example/")
        self.assertEqual(self.titles().count("PreviewGuess"), 2)
        self.assertEqual(body["sample_post"]["hook"], GOOD_POST["hook"])
        retry_prompt = [t for t in self.calls if t[0] == "PreviewGuess"]
        self.assertEqual(len(retry_prompt), 2)

    def test_no_retry_when_the_post_is_fine(self):
        preview_service.build_preview("https://www.tazizi.example/")
        self.assertEqual(self.titles().count("PreviewGuess"), 1)


class NoChromeTest(ScanTestCase):
    def test_preview_works_without_chrome(self):
        with mock.patch.object(screenshot, "find_chrome", return_value=None), mock.patch.object(
            screenshot.subprocess, "Popen"
        ) as popen, mock.patch.dict("os.environ", {"SITE_SCREENSHOT": "true"}):
            screenshot.get_settings.cache_clear()
            try:
                body = preview_service.build_preview("https://www.tazizi.example/")
            finally:
                screenshot.get_settings.cache_clear()
        popen.assert_not_called()
        self.assertEqual(body["business_name"], "ת'ציצי פנימה")
        brand_images = next(images for title, images in self.calls if title == "BrandLanguage")
        self.assertEqual(brand_images[0][1], "image/png")  # the logo leads; no screenshot

    def test_capture_refuses_without_launching(self):
        with mock.patch.object(screenshot, "find_chrome", return_value="/bin/true"), mock.patch.object(
            screenshot.subprocess, "Popen"
        ) as popen, mock.patch.dict("os.environ", {"SITE_SCREENSHOT": "true"}):
            screenshot.get_settings.cache_clear()
            try:
                self.assertIsNone(screenshot.capture_site("http://plain.example/"))
                with mock.patch("app.services.netguard.socket.getaddrinfo", return_value=[(2, 1, 6, "", ("10.0.0.5", 443))]):
                    self.assertIsNone(screenshot.capture_site("https://internal.example/"))
            finally:
                screenshot.get_settings.cache_clear()
        popen.assert_not_called()

    def test_off_switch_is_respected(self):
        with mock.patch.object(screenshot, "find_chrome") as find:
            self.assertIsNone(screenshot.capture_site("https://www.tazizi.example/"))
        find.assert_not_called()

    def test_a_screenshot_leads_the_brand_images_and_the_evidence(self):
        shot = png([(BEIGE, 0.5), (WHITE, 0.3), (PINK, 0.2)], size=(1280, 900))
        with mock.patch.object(preview_service, "capture_site", return_value=shot):
            preview_service.build_preview("https://www.tazizi.example/")
        brand_images = next(images for title, images in self.calls if title == "BrandLanguage")
        self.assertEqual(brand_images[0][1], "image/jpeg")
        self.assertEqual(len(brand_images), 4)  # screenshot, logo, two photos


class GuardProxyTest(unittest.TestCase):
    """Chrome's proxy: refuses anything but CONNECT to a public host on 443."""

    def ask(self, request: bytes) -> bytes:
        proxy = screenshot._GuardProxy(deadline=__import__("time").monotonic() + 5)
        thread = __import__("threading").Thread(target=proxy.serve_forever, daemon=True)
        thread.start()
        try:
            # A numeric address, so the tests' fake DNS is not asked where the proxy is.
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(3)
                sock.connect(("127.0.0.1", proxy.server_address[1]))
                sock.sendall(request)
                return sock.recv(200)
        finally:
            proxy.shutdown()
            proxy.server_close()

    def test_private_and_plain_http_are_refused(self):
        with mock.patch("app.services.netguard.socket.getaddrinfo", return_value=[(2, 1, 6, "", ("10.0.0.5", 443))]):
            self.assertIn(b"403", self.ask(b"CONNECT intranet.example:443 HTTP/1.1\r\nHost: x\r\n\r\n"))
        self.assertIn(b"403", self.ask(b"CONNECT 127.0.0.1:443 HTTP/1.1\r\n\r\n"))
        self.assertIn(b"403", self.ask(b"CONNECT 169.254.169.254:443 HTTP/1.1\r\n\r\n"))
        self.assertIn(b"403", self.ask(b"GET http://example.com/ HTTP/1.1\r\nHost: example.com\r\n\r\n"))
        self.assertIn(b"403", self.ask(b"CONNECT example.com:22 HTTP/1.1\r\n\r\n"))


class SamplePostRulesTest(unittest.TestCase):
    scraped = {"meta": ["קולקציות אופנתיות ובלעדיות בתחום הלבשה תחתונה והלבשת שינה לנשים"], "text": "", "buttons": []}

    def test_the_owners_real_failure_is_caught(self):
        problems = preview_service.post_problems(
            {**GOOD_POST, "hook": "פיג'מות פוטר של סנופי ופרינדס מחכות לכן באתר."}, self.scraped
        )
        self.assertTrue(any("קלישאה" in p for p in problems), problems)

    def test_meta_copy_lengths_and_repeated_hook(self):
        problems = preview_service.post_problems(BAD_POST, self.scraped)
        joined = " ".join(problems)
        for needle in ("meta", "overlay_headline", "cta"):
            self.assertIn(needle, joined)
        repeated = {**GOOD_POST, "caption": GOOD_POST["hook"] + " ועוד משפט."}
        self.assertTrue(any("חוזר" in p for p in preview_service.post_problems(repeated, self.scraped)))
        self.assertEqual(preview_service.post_problems(GOOD_POST, self.scraped), [])

    def test_feminine_address_is_detected_from_the_site(self):
        self.assertTrue(preview_service.addresses_women({"text": "התחברי לאתר ולחצי לרכישה", "buttons": []}))
        self.assertFalse(preview_service.addresses_women({"text": "הזמינו עכשיו ובואו לבקר", "buttons": []}))
        prompt = preview_service._sample_prompt({"text": "התחברי, לחצי לרכישה", "buttons": [], "meta": []}, {}, {})
        self.assertIn("בלשון נקבה", prompt)


class ModelSettingsTest(unittest.TestCase):
    def test_extraction_uses_the_extract_model(self):
        with mock.patch.object(gemini, "generate_json", return_value="{}") as generate:
            gemini.extract_json("p", {"title": "x"})
        self.assertEqual(generate.call_args.kwargs["model"], gemini.get_settings().gemini_extract_model)
        self.assertEqual(generate.call_args.kwargs["thinking_level"], "MEDIUM")
        self.assertEqual(gemini.get_settings().gemini_extract_model, "gemini-3.8-flash")

    def test_depleted_credit_is_not_retried(self):
        depleted = RuntimeError("402 RESOURCE_EXHAUSTED. Your prepayment credits are depleted.")
        self.assertFalse(gemini._is_retryable(depleted))
        self.assertTrue(gemini._is_retryable(RuntimeError("429 RESOURCE_EXHAUSTED check your plan and billing details")))
        self.assertTrue(gemini._is_retryable(RuntimeError("503 UNAVAILABLE")))


class LoopbackOriginTest(unittest.TestCase):
    def test_localhost_and_127_are_the_same_origin(self):
        allowed = _with_loopback_twins(["http://localhost:3000", "https://app.example"])
        self.assertIn("http://127.0.0.1:3000", allowed)
        self.assertIn("https://app.example", allowed)
        self.assertNotIn("https://127.0.0.1", allowed)


if __name__ == "__main__":
    unittest.main()
