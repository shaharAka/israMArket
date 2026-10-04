"""The WhatsApp tracked link: number validation, the fixed links, the public redirect,
the bot filter, and the per-post link in the publishing kit.

Hermetic: a throwaway SQLite file per test and no network. The privacy promise — no IP
address and no full user agent stored — is asserted against the raw database rows, not
against the API's answer.
"""
import _test_env  # noqa: F401  (must come before any `app` import)

import shutil
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Business, Strategy, User, WhatsappClick, WhatsappLink
from app.services import ratelimit
from app.services import whatsapp
from app.services.jsonutil import dumps

TODAY = date.today()

IPHONE_IG = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_0; he_IL; he; scale=3.00; 1179x2556)"
)
ANDROID = (
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/128.0.0.0 Mobile Safari/537.36"
)
BOTS = [
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "WhatsApp/2.23.20.0 A",
    "Twitterbot/1.0",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "TelegramBot (like TwitterBot)",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "SomeLinkPreview/3.0",
    "Mozilla/5.0 (compatible; MyCrawler/1.0)",
    "node",
    " NODE ",
    "undici",
    "",
]


def make_post(title: str, cta: str, outlet: str = "instagram") -> dict:
    return {
        "week": 1,
        "format": "image",
        "title": title,
        "caption": "כיתוב",
        "cta": cta,
        "primary_outlet": outlet,
        "outlets": [outlet],
        "approval_status": "approved",
        "published_url": "",
        "tracking_url": "",
    }


class WhatsappLinkTestCase(unittest.TestCase):
    def setUp(self):
        ratelimit.reset()
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-wa-"))
        self.engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()

        self.owner = User(email="owner@example.com", password_hash="x", full_name="בעלת העסק")
        self.other = User(email="other@example.com", password_hash="x", full_name="אחר")
        self.db.add_all([self.owner, self.other])
        self.db.commit()
        self.business = Business(user_id=self.owner.id, name="מאפיית תום", website_url="https://bakery.example")
        self.rival = Business(user_id=self.other.id, name="מתחרה")
        self.db.add_all([self.business, self.rival])
        self.db.commit()

        self.posts = [
            make_post("חלות לשבת", "הזמינו בוואטסאפ"),
            make_post("סדנת אפייה", "להרשמה באתר"),
            make_post("עוגות לחג", "כתבו לנו", outlet="whatsapp"),
            make_post("מבצע בפייסבוק", "שלחו הודעה לווטסאפ", outlet="facebook"),
        ]
        self.strategy = Strategy(
            business_id=self.business.id,
            year=TODAY.year,
            month=TODAY.month,
            roadmap_json=dumps({"roadmap": {"theme": "חגים", "posts": self.posts}}),
        )
        self.db.add(self.strategy)
        self.db.commit()

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: self.owner
        self.client = TestClient(app)
        self.addCleanup(self._cleanup)

    def _cleanup(self):
        app.dependency_overrides.clear()
        ratelimit.reset()
        self.db.close()
        self.engine.dispose()
        shutil.rmtree(self.tmp, ignore_errors=True)

    # --- helpers -------------------------------------------------------------------

    def set_number(self, number="050-1234567", **extra):
        return self.client.put("/whatsapp/link", json={"number": number, **extra})

    def link(self, source_key: str) -> WhatsappLink:
        return (
            self.db.query(WhatsappLink)
            .filter(WhatsappLink.business_id == self.business.id, WhatsappLink.source_key == source_key)
            .one()
        )

    def click(self, code: str, ua: str = ANDROID, method: str = "GET", headers: dict | None = None):
        return self.client.request(
            method, f"/r/{code}", headers={"user-agent": ua, **(headers or {})}, follow_redirects=False
        )

    def total_clicks(self) -> int:
        self.db.expire_all()
        return sum(row.count for row in self.db.query(WhatsappClick).all())

    # --- number validation -----------------------------------------------------------

    def test_israeli_numbers_normalise_to_e164(self):
        cases = {
            "050-1234567": "+972501234567",
            "050 123 4567": "+972501234567",
            "(050)1234567": "+972501234567",
            "0501234567": "+972501234567",
            "+972-50-1234567": "+972501234567",
            "+972 50 123 4567": "+972501234567",
            "972501234567": "+972501234567",
            "00972501234567": "+972501234567",
            "+972 0 50 1234567": "+972501234567",
            "03-1234567": "+97231234567",
            "077-1234567": "+972771234567",
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(whatsapp.normalize_israeli_number(raw), expected)

    def test_bad_numbers_are_a_hebrew_422(self):
        for raw in ["12345", "050-12345", "+1 415 555 0100", "05O-1234567", "050-1234567-89", "abc"]:
            with self.subTest(raw=raw):
                response = self.set_number(raw)
                self.assertEqual(response.status_code, 422, response.text)
                self.assertIn("מספר ישראלי", response.json()["detail"])
        self.db.expire_all()
        self.assertIsNone(self.db.get(Business, self.business.id).whatsapp_number_e164)

    def test_display_number(self):
        self.assertEqual(whatsapp.display_number("+972501234567"), "050-1234567")
        self.assertEqual(whatsapp.display_number("+97231234567"), "03-1234567")

    # --- the fixed links -------------------------------------------------------------

    def test_setting_the_number_creates_the_fixed_links(self):
        self.assertEqual(self.client.get("/whatsapp/link").json()["links"], [])
        response = self.set_number("+972 50 123 4567", default_text_he="היי, ראיתי אתכם באינסטגרם")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["number_e164"], "+972501234567")
        self.assertEqual(body["number_display"], "050-1234567")
        self.assertEqual(body["default_text_he"], "היי, ראיתי אתכם באינסטגרם")
        self.assertEqual([link["source_key"] for link in body["links"]], ["default", "ig-bio", "story", "gbp"])
        for item in body["links"]:
            self.assertRegex(item["code"], r"^[A-Za-z0-9]{7}$")
            self.assertTrue(item["url"].endswith(f"/r/{item['code']}"))
            self.assertEqual((item["clicks_7d"], item["clicks_total"]), (0, 0))
            self.assertTrue(item["label_he"])

        # Saving again keeps the same links (and codes already posted keep working).
        codes = [link["code"] for link in body["links"]]
        again = self.set_number("0501234567").json()
        self.assertEqual([link["code"] for link in again["links"]], codes)

    def test_source_link_is_created_once(self):
        self.assertEqual(
            self.client.post("/whatsapp/link/source", json={"source_key": "flyer"}).status_code, 409
        )
        self.set_number()
        first = self.client.post("/whatsapp/link/source", json={"source_key": "flyer", "label_he": "פלאייר"})
        self.assertEqual(first.status_code, 200, first.text)
        second = self.client.post("/whatsapp/link/source", json={"source_key": "flyer"})
        self.assertEqual(first.json()["link"]["code"], second.json()["link"]["code"])
        self.assertEqual(second.json()["link"]["label_he"], "פלאייר")
        bad = self.client.post("/whatsapp/link/source", json={"source_key": "../../x"})
        self.assertEqual(bad.status_code, 422)

    def test_other_business_cannot_see_the_links(self):
        self.set_number()
        app.dependency_overrides[get_current_user] = lambda: self.other
        self.assertEqual(self.client.get("/whatsapp/link").json()["links"], [])

    # --- the redirect ------------------------------------------------------------------

    def test_redirect_goes_to_wa_me_with_the_source_code_and_counts(self):
        self.set_number(default_text_he="היי, אשמח להזמין")
        code = self.link("ig-bio").code
        response = self.click(code, IPHONE_IG)
        self.assertEqual(response.status_code, 302)
        location = urlparse(response.headers["location"])
        self.assertEqual((location.scheme, location.netloc, location.path), ("https", "wa.me", "/972501234567"))
        message = parse_qs(location.query)["text"][0]
        self.assertEqual(message, "היי, אשמח להזמין\n(קוד: IG-BIO)")
        self.assertEqual(response.headers["cache-control"], "no-store")

        self.click(code, ANDROID)
        body = self.client.get("/whatsapp/link").json()
        bio = next(link for link in body["links"] if link["source_key"] == "ig-bio")
        self.assertEqual((bio["clicks_7d"], bio["clicks_total"]), (2, 2))
        self.assertEqual(body["clicks_by_family"], {"instagram": 1, "android": 1})

    def test_default_text_fallback(self):
        self.set_number()
        response = self.click(self.link("default").code)
        message = parse_qs(urlparse(response.headers["location"]).query)["text"][0]
        self.assertEqual(message, f"{whatsapp.DEFAULT_TEXT_HE}\n(קוד: WA)")

    def test_bots_and_previews_are_not_counted(self):
        self.set_number()
        code = self.link("story").code
        for ua in BOTS:
            with self.subTest(ua=ua):
                response = self.click(code, ua)
                self.assertEqual(response.status_code, 302)
        self.click(code, ANDROID, headers={"sec-purpose": "prefetch"})
        self.assertEqual(self.total_clicks(), 0)
        # A phone whose model name contains "bot" is still a person.
        self.click(code, "Mozilla/5.0 (Linux; Android 10; CUBOT X30) Chrome/120 Mobile Safari/537.36")
        self.assertEqual(self.total_clicks(), 1)

    def test_head_is_ignored(self):
        self.set_number()
        response = self.click(self.link("gbp").code, ANDROID, method="HEAD")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(self.total_clicks(), 0)

    def test_missing_agent_and_node_checks_keep_the_redirect_without_adding_taps(self):
        self.set_number()
        code = self.link("default").code
        self.click(code, ANDROID)
        self.assertEqual(self.total_clicks(), 1)
        for ua in ("node", "undici"):
            self.assertEqual(self.click(code, ua).status_code, 302)
        self.client.headers.pop("user-agent", None)
        response = self.client.get(f"/r/{code}", follow_redirects=False)
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.headers["location"].startswith("https://wa.me/"))
        self.assertEqual(self.total_clicks(), 1)

    def test_unknown_code_is_a_hebrew_page(self):
        for code in ["nope123", "a-b", "x" * 40]:
            with self.subTest(code=code):
                response = self.click(code)
                self.assertEqual(response.status_code, 404)
                self.assertIn('dir="rtl"', response.text)
                self.assertIn("הקישור הזה כבר לא פעיל", response.text)
                # A way on, not a dead end: the site's home page.
                home = whatsapp.get_settings().web_origin.rstrip("/")
                self.assertIn(f'href="{home}/"', response.text)
        self.assertEqual(self.total_clicks(), 0)

    def test_cleared_number_turns_links_off(self):
        self.set_number()
        code = self.link("default").code
        self.assertEqual(self.set_number("").status_code, 200)
        response = self.click(code)
        self.assertEqual(response.status_code, 404)
        self.assertIn("לא פעיל", response.text)

    def test_rate_limit_per_code_per_minute(self):
        self.set_number()
        code = self.link("default").code
        limit = whatsapp.get_settings().whatsapp_clicks_per_minute
        for _ in range(limit + 5):
            self.assertEqual(self.click(code).status_code, 302)
        self.assertEqual(self.total_clicks(), limit)

    def test_no_ip_or_user_agent_is_stored(self):
        self.set_number()
        code = self.link("default").code
        self.click(code, IPHONE_IG, headers={"x-forwarded-for": "203.0.113.77"})
        columns = {row[1] for row in self.db.execute(text("PRAGMA table_info(whatsapp_clicks)")).fetchall()}
        self.assertEqual(columns, {"id", "business_id", "link_id", "day", "ua_family", "count"})
        dump = "\n".join(
            str(tuple(row))
            for table in ("whatsapp_clicks", "whatsapp_links")
            for row in self.db.execute(text(f"SELECT * FROM {table}")).fetchall()
        )
        self.assertNotIn("203.0.113.77", dump)
        self.assertNotIn("testclient", dump)
        self.assertNotIn("Mozilla", dump)
        self.assertNotIn("Instagram 350", dump)
        row = self.db.query(WhatsappClick).one()
        self.assertEqual((row.ua_family, row.count), ("instagram", 1))

    def test_clicks_7d_only_counts_the_last_week(self):
        self.set_number()
        link = self.link("default")
        old = (whatsapp.israel_today() - timedelta(days=10)).isoformat()
        self.db.add(WhatsappClick(business_id=self.business.id, link_id=link.id, day=old, ua_family="ios", count=4))
        self.db.commit()
        self.click(link.code)
        item = next(i for i in self.client.get("/whatsapp/link").json()["links"] if i["source_key"] == "default")
        self.assertEqual((item["clicks_7d"], item["clicks_total"]), (1, 5))

    # --- posts ---------------------------------------------------------------------------

    def test_post_link_only_for_whatsapp_cta(self):
        no_number = self.client.get("/whatsapp/link/post/0").json()
        self.assertEqual((no_number["number_set"], no_number["cta_is_whatsapp"], no_number["link"]), (False, True, None))

        self.set_number()
        first = self.client.get("/whatsapp/link/post/0").json()["link"]
        self.assertEqual(first["source_key"], f"ig-post-{TODAY.year}{TODAY.month:02d}-1")
        self.assertEqual(first["tag"], "IG-POST-1")
        self.assertIn("חלות לשבת", first["label_he"])
        self.assertEqual(self.client.get("/whatsapp/link/post/0").json()["link"]["code"], first["code"])

        site_cta = self.client.get("/whatsapp/link/post/1").json()
        self.assertEqual((site_cta["cta_is_whatsapp"], site_cta["link"]), (False, None))
        self.assertEqual(self.client.get("/whatsapp/link/post/2").json()["link"]["tag"], "WA-POST-3")
        self.assertEqual(self.client.get("/whatsapp/link/post/3").json()["link"]["tag"], "FB-POST-4")
        self.assertEqual(self.client.get("/whatsapp/link/post/99").status_code, 404)

        response = self.click(first["code"])
        message = parse_qs(urlparse(response.headers["location"]).query)["text"][0]
        self.assertTrue(message.endswith("(קוד: IG-POST-1)"))

    def test_publish_kit_carries_the_per_post_link(self):
        before = self.client.get("/publish/queue").json()
        self.assertTrue(all(post["whatsapp_url"] == "" for post in before["unscheduled"]))

        self.set_number()
        queue = self.client.get("/publish/queue").json()
        by_title = {post["title"]: post for post in queue["unscheduled"]}
        self.assertRegex(by_title["חלות לשבת"]["whatsapp_url"], r"/r/[A-Za-z0-9]{7}$")
        self.assertEqual(by_title["סדנת אפייה"]["whatsapp_url"], "")
        self.assertTrue(by_title["עוגות לחג"]["whatsapp_url"])
        # The same link as the editor's endpoint, not a second one.
        code = self.client.get("/whatsapp/link/post/0").json()["link"]["code"]
        self.assertTrue(by_title["חלות לשבת"]["whatsapp_url"].endswith(f"/r/{code}"))
        again = self.client.get("/publish/queue").json()
        self.assertEqual(
            {p["title"]: p["whatsapp_url"] for p in again["unscheduled"]},
            {p["title"]: p["whatsapp_url"] for p in queue["unscheduled"]},
        )

    def test_cta_detection(self):
        self.assertTrue(whatsapp.post_cta_is_whatsapp({"cta": "דברי איתנו בוואטסאפ"}))
        self.assertTrue(whatsapp.post_cta_is_whatsapp({"cta": "WhatsApp לפרטים"}))
        self.assertTrue(whatsapp.post_cta_is_whatsapp({"cta": "להזמנות", "primary_outlet": "whatsapp"}))
        self.assertFalse(whatsapp.post_cta_is_whatsapp({"cta": "סרקו בקופה להטבה"}))

    # --- account deletion -------------------------------------------------------------

    def test_account_deletion_removes_links_and_clicks(self):
        from app.services.account_deletion import delete_account

        self.set_number()
        self.click(self.link("default").code)
        self.assertEqual(self.total_clicks(), 1)
        # Deletion removes media_root()/<business id>: without this it removed the checkout's
        # real api/data/generated/1 (a developer's local media for business 1).
        with mock.patch("app.services.account_deletion.images.media_root", return_value=self.tmp / "media"):
            delete_account(self.db, self.db.get(User, self.owner.id))
        self.assertEqual(self.db.query(WhatsappClick).count(), 0)
        self.assertEqual(self.db.query(WhatsappLink).count(), 0)


if __name__ == "__main__":
    unittest.main()
