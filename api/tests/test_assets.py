"""Tests for the assets library.

Hermetic: a throwaway SQLite file per test, a temporary media root, and no network.
Anything that would talk to the web or to Gemini is either refused by the SSRF guard
before a socket is opened, or mocked.
"""

import json
import shutil
import struct
import tempfile
import unittest
import zlib
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app import main as main_module
from app.models import Asset, Business, Strategy, User
from app.routers import assets as assets_router
from app.services import assets as assets_service
from app.services.jsonutil import dumps


def png_bytes(width: int, height: int) -> bytes:
    """A real, decodable PNG of a known size — the dimension reader needs actual bytes."""
    raw = b"".join(b"\x00" + bytes((200, 60, 30)) * width for _ in range(height))

    def chunk(tag: bytes, payload: bytes) -> bytes:
        body = tag + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


POST = {
    "week": 1,
    "format": "image",
    "title": "החלות של שישי",
    "angle": "טריות",
    "hook": "מהתנור ישר לשולחן",
    "caption": "כל שישי אנחנו מוציאים חלות חמות",
    "cta": "להזמנות",
    "overlay_theme": "lower_editorial",
}


class AssetTestCase(unittest.TestCase):
    """One isolated database, one isolated media folder, two businesses."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-assets-"))
        self.engine = create_engine(
            f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False}
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()

        self.owner = User(email="owner@example.com", password_hash="x", full_name="בעלת העסק")
        self.other = User(email="other@example.com", password_hash="x", full_name="עסק אחר")
        self.db.add_all([self.owner, self.other])
        self.db.flush()
        self.business = Business(user_id=self.owner.id, name="מאפיית תום", website_url="https://bakery.example")
        self.rival = Business(user_id=self.other.id, name="מתחרה", website_url="https://rival.example")
        self.db.add_all([self.business, self.rival])
        self.db.commit()

        self.media = self.tmp / "media"
        self.media.mkdir(parents=True, exist_ok=True)
        self._patches = [
            mock.patch.object(assets_service, "media_root", return_value=self.media),
        ]
        for patch in self._patches:
            patch.start()
        self.addCleanup(self._cleanup)

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: self.owner
        self.client = TestClient(app)

    def _cleanup(self):
        for patch in self._patches:
            patch.stop()
        app.dependency_overrides.clear()
        self.db.close()
        # Release pooled SQLite handles before the file is removed, so the suite does
        # not leave a trail of "unclosed database" warnings.
        self.engine.dispose()
        shutil.rmtree(self.tmp, ignore_errors=True)

    # --- helpers ------------------------------------------------------------------

    def add_asset(self, business=None, filename="asset-photo-abc123.png", **fields) -> Asset:
        business = business or self.business
        asset = Asset(
            business_id=business.id,
            filename=fields.pop("filename", filename),
            kind=fields.pop("kind", "image"),
            mime=fields.pop("mime", "image/png"),
            source=fields.pop("source", "upload"),
            source_url=fields.pop("source_url", ""),
            description=fields.pop("description", ""),
            tags_json=fields.pop("tags_json", "[]"),
            width=fields.pop("width", 1080),
            height=fields.pop("height", 1080),
        )
        self.db.add(asset)
        self.db.commit()
        self.db.refresh(asset)
        return asset

    def add_strategy(self, business=None) -> Strategy:
        strategy = Strategy(
            business_id=(business or self.business).id,
            year=2026,
            month=1,
            usp_json=dumps({"usp": "חלה מחמצת"}),
            calendar_json=dumps([]),
            roadmap_json=dumps({"roadmap": {"posts": [dict(POST)]}}),
        )
        self.db.add(strategy)
        self.db.commit()
        self.db.refresh(strategy)
        return strategy

    # --- ownership ----------------------------------------------------------------

    def test_foreign_asset_id_is_invisible_not_just_forbidden(self):
        """An id from another business must 404 on read, edit, delete and describe, so
        the API never confirms that somebody else's asset exists."""
        theirs = self.add_asset(business=self.rival, description="שלי", tags_json=dumps(["מוצר"]))

        self.assertEqual(self.client.patch(f"/assets/{theirs.id}", json={"description": "נגנוב"}).status_code, 404)
        self.assertEqual(self.client.delete(f"/assets/{theirs.id}").status_code, 404)
        self.assertEqual(self.client.post(f"/assets/{theirs.id}/describe").status_code, 404)

        self.db.refresh(theirs)
        self.assertEqual(theirs.description, "שלי")
        self.assertEqual(self.client.get("/assets").json()["assets"], [])

    def test_own_assets_are_listed_with_a_public_url_and_real_tag_list(self):
        mine = self.add_asset(description="חלות טריות", tags_json=dumps(["מוצר", "מנה"]))
        self.add_asset(business=self.rival, description="שלי")

        payload = self.client.get("/assets").json()
        self.assertEqual([item["id"] for item in payload["assets"]], [mine.id])
        out = payload["assets"][0]
        self.assertEqual(out["tags"], ["מוצר", "מנה"])
        self.assertEqual(out["url"], f"/backend/media/{self.business.id}/{mine.filename}")
        self.assertEqual(out["kind"], "image")
        self.assertEqual(out["width"], 1080)

    def test_media_route_refuses_a_foreign_business_folder(self):
        mine = self.add_asset(filename="asset-mine.png")
        folder = self.media / str(self.business.id)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / mine.filename).write_bytes(png_bytes(4, 4))

        # The route reads its own MEDIA_DIR constant; point it at this test's folder.
        with mock.patch.object(main_module, "MEDIA_DIR", self.media):
            self.assertEqual(self.client.get(f"/media/{self.business.id}/{mine.filename}").status_code, 200)
            self.assertEqual(self.client.get(f"/media/{self.rival.id}/{mine.filename}").status_code, 404)

    # --- PATCH / DELETE -----------------------------------------------------------

    def test_patch_updates_description_and_tags(self):
        asset = self.add_asset(description="ישן", tags_json=dumps(["מוצר"]))
        response = self.client.patch(
            f"/assets/{asset.id}",
            json={"description": "  חלות   מחמצת   טריות  ", "tags": ["מוצר", "מוצר", "#טקסטורה", "חג"]},
        )
        self.assertEqual(response.status_code, 200)
        out = response.json()["asset"]
        self.assertEqual(out["description"], "חלות מחמצת טריות")
        # duplicates collapse, the leading '#' is dropped
        self.assertEqual(out["tags"], ["מוצר", "טקסטורה", "חג"])

        self.db.refresh(asset)
        self.assertEqual(json.loads(asset.tags_json), ["מוצר", "טקסטורה", "חג"])

    def test_patch_with_one_field_leaves_the_other_alone(self):
        asset = self.add_asset(description="מקורי", tags_json=dumps(["מוצר"]))
        self.client.patch(f"/assets/{asset.id}", json={"tags": ["חוץ"]})
        self.db.refresh(asset)
        self.assertEqual(asset.description, "מקורי")
        self.assertEqual(json.loads(asset.tags_json), ["חוץ"])
        self.assertEqual(self.client.patch(f"/assets/{asset.id}", json={}).status_code, 200)

    def test_delete_removes_the_row_and_the_file(self):
        asset = self.add_asset()
        folder = self.media / str(self.business.id)
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / asset.filename
        target.write_bytes(png_bytes(4, 4))

        self.assertEqual(self.client.delete(f"/assets/{asset.id}").json(), {"ok": True})
        self.assertIsNone(self.db.query(Asset).filter(Asset.id == asset.id).first())
        self.assertFalse(target.exists())
        self.assertEqual(self.client.delete(f"/assets/{asset.id}").status_code, 404)

    def test_delete_never_touches_a_file_outside_the_business_folder(self):
        """A corrupted or forged filename in the row must not turn DELETE into an
        arbitrary file-removal primitive."""
        outside = self.media / "someone-elses-card.png"
        outside.write_bytes(b"generated card")
        asset = self.add_asset()
        asset.filename = "../someone-elses-card.png"
        self.db.commit()

        self.assertEqual(self.client.delete(f"/assets/{asset.id}").status_code, 200)
        self.assertTrue(outside.exists())

    # --- upload -------------------------------------------------------------------

    def test_upload_stores_the_file_and_reads_its_real_dimensions(self):
        response = self.client.post(
            "/assets/upload",
            files={"file": ("../../etc/passwd.png", png_bytes(800, 1000), "image/png")},
        )
        self.assertEqual(response.status_code, 200)
        out = response.json()["asset"]
        self.assertEqual((out["width"], out["height"]), (800, 1000))
        self.assertEqual(out["source"], "upload")
        # The client's filename never becomes the stored path.
        stored_name = out["url"].rsplit("/", 1)[-1]
        self.assertTrue(stored_name.startswith("asset-"))
        self.assertTrue(stored_name.endswith(".png"))
        self.assertTrue((self.media / str(self.business.id) / stored_name).is_file())
        # Nothing escaped the business's folder.
        self.assertFalse((self.tmp / "etc").exists())

    def test_upload_rejects_an_unsupported_type(self):
        response = self.client.post(
            "/assets/upload",
            files={"file": ("notes.pdf", b"%PDF-1.4 not an image at all", "application/pdf")},
        )
        self.assertEqual(response.status_code, 415)
        self.assertIn("לא נתמך", response.json()["detail"])

    def test_upload_rejects_an_oversized_file(self):
        """The cap is real, not a guess: read it with one byte of headroom and refuse."""
        with mock.patch.object(assets_router, "MAX_UPLOAD_BYTES", 32):
            response = self.client.post(
                "/assets/upload",
                files={"file": ("big.png", png_bytes(40, 40), "image/png")},
            )
        self.assertEqual(response.status_code, 413)
        self.assertIn("25MB", response.json()["detail"])

    def test_upload_sniffs_the_type_when_the_client_lies(self):
        response = self.client.post(
            "/assets/upload",
            files={"file": ("photo.bin", png_bytes(20, 20), "application/octet-stream")},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["asset"]["mime"], "image/png")

    # --- URL import ---------------------------------------------------------------

    def test_import_url_rejects_a_non_http_scheme(self):
        """The guard runs before any client is created, so this makes no network call."""
        for url in ("file:///etc/passwd", "ftp://example.com/a.png", "javascript:alert(1)xxxxx"):
            with self.subTest(url=url):
                response = self.client.post("/assets/import-url", json={"url": url})
                self.assertEqual(response.status_code, 400)
                self.assertIn("http", response.json()["detail"])
        self.assertEqual(self.db.query(Asset).count(), 0)

    def test_import_url_reports_how_many_images_were_skipped(self):
        page = b"""<html><head><meta property="og:image" content="/hero.jpg"></head>
        <body><img src="/a.jpg"><img src="/b.jpg"></body></html>"""
        fetched: list[str] = []

        def fake_safe_get(client, url, **kwargs):
            fetched.append(url)
            if url == "https://shop.example/":
                return mock.Mock(status_code=200, headers={"content-type": "text/html"}, text=page.decode(), url=url)
            if url.endswith("b.jpg"):
                return mock.Mock(status_code=404, headers={}, content=b"", url=url)
            return mock.Mock(status_code=200, headers={"content-type": "image/png"}, content=png_bytes(600, 600), url=url)

        # The real guard is exercised by the non-http test; here the host check is
        # stubbed so the suite never needs DNS.
        with mock.patch.object(
            assets_service, "assert_public_url", side_effect=lambda url: url
        ), mock.patch.object(assets_service, "safe_get", side_effect=fake_safe_get), mock.patch.object(
            assets_service.httpx, "Client", mock.MagicMock()
        ):
            response = self.client.post("/assets/import-url", json={"url": "https://shop.example/"})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["assets"]), 2)  # hero.jpg + a.jpg
        self.assertEqual(payload["skipped"], 1)  # b.jpg failed
        self.assertTrue(all(item["source"] == "url" for item in payload["assets"]))
        self.assertIn("https://shop.example/a.jpg", fetched)

    def test_import_url_reports_the_cap_instead_of_silently_truncating(self):
        links = "".join(f'<img src="/p{i}.jpg">' for i in range(15))
        page = f"<html><body>{links}</body></html>"
        downloaded = []
        colours = [png_bytes(600 + i, 600) for i in range(15)]

        def fake_safe_get(client, url, **kwargs):
            if url == "https://shop.example/":
                return mock.Mock(status_code=200, headers={"content-type": "text/html"}, text=page, url=url)
            index = int(url.rsplit("/p", 1)[1].split(".")[0])
            downloaded.append(index)
            return mock.Mock(status_code=200, headers={"content-type": "image/png"}, content=colours[index], url=url)

        with mock.patch.object(
            assets_service, "assert_public_url", side_effect=lambda url: url
        ), mock.patch.object(assets_service, "safe_get", side_effect=fake_safe_get), mock.patch.object(
            assets_service.httpx, "Client", mock.MagicMock()
        ):
            response = self.client.post("/assets/import-url", json={"url": "https://shop.example/"})

        payload = response.json()
        self.assertEqual(len(payload["assets"]), assets_service.IMPORT_CAP)
        self.assertEqual(payload["skipped"], 15 - assets_service.IMPORT_CAP)
        self.assertEqual(downloaded, list(range(assets_service.IMPORT_CAP)))

    def test_scan_site_pulls_images_from_markup_and_css(self):
        """A deep scan is worth nothing if it only reads <img src>: lazy loaders keep the
        real photo in srcset, and shop themes paint hero images from CSS."""
        page = """
        <html><head>
          <meta property="og:image" content="/img/og.jpg">
          <link rel="stylesheet" href="/static/main.css">
          <style>.hero{background-image:url('/img/style-bg.jpg')}</style>
        </head><body>
          <img src="/img/placeholder.gif" srcset="/img/small.jpg 400w, /img/large.jpg 1200w">
          <div style="background-image: url(/img/inline-bg.jpg)"></div>
          <img src="/img/logo.png">
        </body></html>
        """
        scanned: list[str] = []

        def fake_download(client, url, max_bytes):
            scanned.append(url)
            return {"url": url, "mime": "image/png", "bytes": png_bytes(600, 600)}

        def fake_sheet(client, url, **kwargs):
            return mock.Mock(status_code=200, text=".promo{background-image:url('/img/sheet-bg.jpg')}")

        engine = mock.MagicMock()
        with mock.patch.object(
            assets_service, "assert_public_url", side_effect=lambda url: url
        ), mock.patch.object(
            assets_service, "safe_get", return_value=mock.Mock(status_code=200, headers={"content-type": "text/html"}, text=page, url="https://shop.example/")
        ), mock.patch.object(assets_service, "_download_image", side_effect=fake_download), mock.patch.object(
            assets_service, "_stylesheet_images", side_effect=lambda client, base, soup: ["https://shop.example/img/sheet-bg.jpg"]
        ), mock.patch.object(assets_service.httpx, "Client", mock.MagicMock(return_value=engine)):
            response = self.client.post("/assets/scan-site")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        # og + widest srcset candidate + <style> background + inline style + stylesheet
        self.assertEqual(len(payload["assets"]), 5)
        for expected in ("/img/og.jpg", "/img/large.jpg", "/img/style-bg.jpg", "/img/inline-bg.jpg"):
            self.assertIn(f"https://shop.example{expected}", scanned)
        # Icons and placeholder sprites are never even attempted; the sheet's image is.
        self.assertNotIn("https://shop.example/img/logo.png", scanned)
        self.assertNotIn("https://shop.example/img/placeholder.gif", scanned)
        self.assertNotIn("https://shop.example/img/small.jpg", scanned)  # srcset winner only
        self.assertIn("https://shop.example/img/sheet-bg.jpg", scanned)
        self.assertTrue(all(item["source"] == "site" for item in payload["assets"]))

    def test_scan_site_without_a_website_says_so(self):
        self.business.website_url = ""
        self.db.commit()
        response = self.client.post("/assets/scan-site")
        self.assertEqual(response.status_code, 502)
        self.assertIn("אתר", response.json()["detail"])

    # --- describe (vision) --------------------------------------------------------

    def test_describe_stores_the_parsed_description_and_tags(self):
        asset = self.add_asset()
        folder = self.media / str(self.business.id)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / asset.filename).write_bytes(png_bytes(600, 600))

        model_reply = json.dumps(
            {
                "description": "  חלות מחמצת   על שולחן עץ, אור חם מהצד.  ",
                "tags": ["מוצר", "מוצר", {"tag": "טקסטורה"}, "", 7, "מוצר" * 40, "חג"],
            },
            ensure_ascii=False,
        )
        with mock.patch.object(assets_service, "lite_json", return_value=model_reply):
            response = self.client.post(f"/assets/{asset.id}/describe")

        self.assertEqual(response.status_code, 200)
        out = response.json()["asset"]
        self.assertEqual(out["description"], "חלות מחמצת על שולחן עץ, אור חם מהצד.")
        self.assertEqual(out["tags"], ["מוצר", "טקסטורה", "חג"])

    def test_describe_rejects_a_video(self):
        asset = self.add_asset(kind="video", mime="video/mp4", filename="asset-clip.mp4")
        response = self.client.post(f"/assets/{asset.id}/describe")
        self.assertEqual(response.status_code, 400)
        self.assertIn("תמונות", response.json()["detail"])

    # --- model-output parsing -----------------------------------------------------

    def test_tag_parsing_tolerates_malformed_model_output(self):
        self.assertEqual(assets_service.parse_tags(None), [])
        self.assertEqual(assets_service.parse_tags(""), [])
        self.assertEqual(assets_service.parse_tags(17), [])
        self.assertEqual(assets_service.parse_tags({"tags": ["מוצר"]}), [])
        # A JSON string of a list, a comma-separated string, and junk all survive.
        self.assertEqual(assets_service.parse_tags('["מוצר", "חג"]'), ["מוצר", "חג"])
        self.assertEqual(assets_service.parse_tags("מוצר, חג , מוצר"), ["מוצר", "חג"])
        self.assertEqual(assets_service.parse_tags("{not json"), [])
        self.assertEqual(assets_service.parse_tags(["מוצר", None, [], "  "]), ["מוצר"])

    def test_description_parsing_tolerates_malformed_model_output(self):
        self.assertEqual(assets_service.parse_description({"description": "מה שרואים"}), "מה שרואים")
        self.assertEqual(assets_service.parse_description(None), "")
        self.assertEqual(assets_service.parse_description(["לא", "מחרוזת"]), "")
        self.assertEqual(assets_service.parse_description("  שורה\nשנייה  "), "שורה שנייה")

    def test_describe_survives_a_model_that_returns_nonsense(self):
        asset = self.add_asset(description="תיאור קודם")
        folder = self.media / str(self.business.id)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / asset.filename).write_bytes(png_bytes(600, 600))

        with mock.patch.object(assets_service, "lite_json", return_value="לא JSON בכלל"):
            response = self.client.post(f"/assets/{asset.id}/describe")

        self.assertEqual(response.status_code, 200)
        out = response.json()["asset"]
        self.assertEqual(out["tags"], [])
        self.assertEqual(out["description"], "תיאור קודם")  # never blanked by garbage

    # --- attaching to a post ------------------------------------------------------

    def test_attaching_an_asset_sets_the_post_image_fields(self):
        self.add_strategy()
        asset = self.add_asset()

        response = self.client.post("/strategy/posts/asset", json={"post_index": 0, "asset_id": asset.id})
        self.assertEqual(response.status_code, 200)
        post = response.json()["post"]
        self.assertEqual(post["image_url"], f"/backend/media/{self.business.id}/{asset.filename}")
        self.assertEqual(post["image_source"], "asset")
        self.assertEqual(post["image_asset_id"], asset.id)

        stored = json.loads(self.db.query(Strategy).first().roadmap_json)
        saved = stored["roadmap"]["posts"][0]
        self.assertEqual(saved["image_url"], post["image_url"])
        self.assertEqual(saved["image_asset_id"], asset.id)
        self.assertEqual(response.json()["strategy"]["id"], self.db.query(Strategy).first().id)

    def test_attaching_a_foreign_asset_404s(self):
        self.add_strategy()
        theirs = self.add_asset(business=self.rival)
        response = self.client.post("/strategy/posts/asset", json={"post_index": 0, "asset_id": theirs.id})
        self.assertEqual(response.status_code, 404)
        stored = json.loads(self.db.query(Strategy).first().roadmap_json)
        self.assertNotIn("image_url", stored["roadmap"]["posts"][0])

    # --- suggest-assets -----------------------------------------------------------

    def test_suggest_assets_filters_out_invented_ids(self):
        """The model is mocked, but the filtering is the real code: a hallucinated or
        duplicated id must never reach the client."""
        self.add_strategy()
        first = self.add_asset(description="חלות טריות", tags_json=dumps(["מוצר", "מנה"]))
        second = self.add_asset(filename="asset-two.png", description="חלל החנות", tags_json=dumps(["חנות"]))
        self.add_asset(business=self.rival, description="נכס של מישהו אחר")

        model_reply = json.dumps(
            {
                "suggestions": [
                    {"asset_id": first.id, "reason": "התמונה מציגה את המוצר המרכזי"},
                    {"asset_id": 999999, "reason": "מזהה מומצא"},
                    {"asset_id": second.id, "reason": "החלל מתאים לפוסט על החנות"},
                    {"asset_id": first.id, "reason": "כפילות"},
                    {"asset_id": None, "reason": "בלי מזהה"},
                ]
            },
            ensure_ascii=False,
        )
        with mock.patch.object(assets_service, "lite_json", return_value=model_reply):
            response = self.client.post("/strategy/posts/suggest-assets", json={"post_index": 0})

        self.assertEqual(response.status_code, 200)
        suggestions = response.json()["suggestions"]
        self.assertEqual([item["asset_id"] for item in suggestions], [first.id, second.id])
        self.assertTrue(all(item["reason"] for item in suggestions))

    def test_suggest_assets_returns_empty_without_calling_the_model(self):
        self.add_strategy()
        with mock.patch.object(assets_service, "lite_json") as model:
            response = self.client.post("/strategy/posts/suggest-assets", json={"post_index": 0})
        self.assertEqual(response.json(), {"suggestions": []})
        model.assert_not_called()

    def test_suggest_assets_sends_the_post_and_the_library_to_the_model(self):
        self.add_strategy()
        asset = self.add_asset(description="חלות מחמצת על שולחן עץ", tags_json=dumps(["מוצר", "טקסטורה"]))
        captured = {}

        def fake_lite_json(prompt, schema, images=None, thinking_level="LOW"):
            captured["prompt"] = prompt
            captured["schema"] = schema
            captured["images"] = images
            return json.dumps({"suggestions": [{"asset_id": asset.id, "reason": "מתאים"}]}, ensure_ascii=False)

        with mock.patch.object(assets_service, "lite_json", side_effect=fake_lite_json):
            response = self.client.post("/strategy/posts/suggest-assets", json={"post_index": 0})

        self.assertEqual(response.json()["suggestions"], [{"asset_id": asset.id, "reason": "מתאים"}])
        self.assertIn(POST["title"], captured["prompt"])
        self.assertIn(f"id={asset.id}", captured["prompt"])
        self.assertIn("חלות מחמצת על שולחן עץ", captured["prompt"])
        self.assertIn("טקסטורה", captured["prompt"])
        # No asset image is sent: matching runs on descriptions and tags.
        self.assertIsNone(captured["images"])
        self.assertEqual(captured["schema"]["required"], ["suggestions"])

    def test_suggestions_are_survivable_when_the_model_returns_garbage(self):
        ids = {1, 2}
        for raw in ("not json", "{}", '{"suggestions": "nope"}', '{"suggestions": [1, 2]}', None):
            with self.subTest(raw=raw):
                self.assertEqual(assets_service.parse_suggestions(raw, ids), [])
        parsed = assets_service.parse_suggestions(
            {"suggestions": [{"asset_id": "3", "reason": ""}, {"asset_id": 1.9, "reason": "סבבה"}]}, {3, 1}
        )
        self.assertEqual([item["asset_id"] for item in parsed], [3, 1])
        self.assertTrue(parsed[0]["reason"])  # an empty reason gets a default, never blank

    # --- helpers ------------------------------------------------------------------

    def test_mime_sniffing_and_filename_derivation(self):
        self.assertEqual(assets_service.resolve_mime("application/octet-stream", png_bytes(4, 4)), "image/png")
        self.assertEqual(assets_service.resolve_mime("image/jpeg", b"\xff\xd8\xff\xe0rest"), "image/jpeg")
        self.assertEqual(assets_service.resolve_mime("application/pdf", b"%PDF-1.4"), "application/pdf")
        self.assertEqual(assets_service.sniff_mime(b"\x1a\x45\xdf\xa3webm-ish"), "video/webm")
        self.assertEqual(assets_service.kind_for_mime("video/mp4"), "video")
        self.assertEqual(assets_service.kind_for_mime("image/png"), "image")

        name = assets_service.filename_for("image/png", b"abc")
        self.assertTrue(name.startswith("asset-"))
        self.assertTrue(name.endswith(".png"))
        self.assertNotIn("/", name)
        self.assertNotIn("..", name)
        # Identity comes from the bytes alone: the same photo pulled from two different
        # URLs is stored once, and two different photos sharing a CDN filename cannot
        # silently overwrite each other.
        self.assertEqual(name, assets_service.filename_for("image/png", b"abc"))
        self.assertNotEqual(name, assets_service.filename_for("image/png", b"abd"))

    def test_video_dimensions_are_read_from_the_header(self):
        def atom(tag: bytes, payload: bytes) -> bytes:
            return struct.pack(">I", len(payload) + 8) + tag + payload

        def tkhd(version: int, width: int, height: int) -> bytes:
            if version == 1:
                head = (
                    b"\x01\x00\x00\x07"
                    + b"\x00" * 16  # created / modified (64-bit)
                    + b"\x00\x00\x00\x01"  # track id
                    + b"\x00" * 4  # reserved
                    + b"\x00" * 8  # duration (64-bit)
                )
            else:
                head = (
                    b"\x00\x00\x00\x07"
                    + b"\x00" * 8  # created / modified
                    + b"\x00\x00\x00\x01"  # track id
                    + b"\x00" * 4  # reserved
                    + b"\x00" * 8  # duration
                )
            return atom(
                b"tkhd",
                head
                + b"\x00" * 8  # reserved
                + b"\x00" * 8  # layer / alt group / volume / reserved
                + b"\x00" * 36  # matrix
                + struct.pack(">II", width * 65536, height * 65536),
            )

        for version in (0, 1):
            with self.subTest(version=version):
                movie = atom(b"moov", atom(b"trak", tkhd(version, 720, 1280)))
                self.assertEqual(assets_service.video_dimensions(movie), (720, 1280))
                self.assertEqual(assets_service.dimensions_for(movie, "video/mp4"), (720, 1280))
        self.assertEqual(assets_service.dimensions_for(b"not a video", "video/mp4"), (0, 0))


if __name__ == "__main__":
    unittest.main()
