"""Tests for the ongoing research engine (services/research.py, routers/research.py).

Hermetic: a throwaway SQLite file per test; Google autocomplete, homepage reads, Meta
Business Discovery and the strategy model are all patched. Nothing touches the network.
"""
import _test_env  # noqa: F401  (must come before any `app` import)

import json
import shutil
import tempfile
import unittest
import io
from contextlib import ExitStack, redirect_stdout
from datetime import datetime, timedelta
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import (
    Business,
    InstagramPost,
    Integration,
    PerformanceSnapshot,
    ResearchRun,
    Strategy,
    User,
)
from app.services import keywords, meta, research
from app.services import strategy as strategy_service
from app.services.jsonutil import dumps, loads

NOW = datetime(2026, 9, 26, 7, 0, 0)

OWN_HTML = """
<html><head><title>ת'ציצי פנימה - חנות הלבשה תחתונה</title>
<meta name="description" content="הלבשה תחתונה, הלבשת שינה ובגדי ים"></head>
<body>
<h1>שווה להציץ</h1><h2>קולקציית סתיו</h2>
<div class="product"><span>חזיית תחרה שחורה</span> <span>₪129.90</span></div>
<div class="product"><span>פיג'מה כותנה לחורף</span> <span>189 ש"ח</span></div>
<p>תחתונים 4 ב-100 ש"ח לזמן מוגבל</p>
<p>משלוח חינם בקנייה מעל 250</p>
<a href="https://www.instagram.com/tazizi_store/">אינסטגרם</a>
<a href="https://www.facebook.com/sharer.php?u=x">שתפו</a>
<script>var price = "₪1";</script>
</body></html>
"""

RIVAL_HTML_V1 = """
<html><head><title>המתחרה — הלבשה תחתונה</title></head><body>
<h1>חדש בחנות</h1>
<div><span>חזייה בסיסית</span><span>₪99</span></div>
<a href="https://wa.me/972500000000">וואטסאפ</a><a href="tel:03-5555555">חייגו</a>
<p>שעות פתיחה: א׳-ה׳ 10:00-19:00</p>
</body></html>
"""

RIVAL_HTML_V2 = """
<html><head><title>המתחרה — סייל סוף עונה</title></head><body>
<h1>חדש בחנות</h1><h2>סייל סוף עונה</h2>
<div><span>חזייה בסיסית</span><span>₪79</span></div>
<p>1+1 על כל התחתונים עד גמר המלאי</p>
<a href="https://wa.me/972500000000">וואטסאפ</a><a href="tel:03-5555555">חייגו</a>
<p>שעות פתיחה: א׳-ה׳ 10:00-19:00</p>
</body></html>
"""


def discovery(handle="rival.lingerie", posts=None):
    posts = posts if posts is not None else [
        {"id": "r1", "caption": "3 טעויות במידת חזייה\nמה עושים", "media_type": "VIDEO", "media_product_type": "REELS",
         "timestamp": "2026-09-24T17:00:00+0000", "like_count": 120, "comments_count": 14, "permalink": "https://instagram.com/p/r1"},
        {"id": "r2", "caption": "מארזי חג", "media_type": "CAROUSEL_ALBUM", "media_product_type": "FEED",
         "timestamp": "2026-09-18T09:00:00+0000", "like_count": 40, "comments_count": 2, "permalink": "https://instagram.com/p/r2"},
        {"id": "r3", "caption": "ישן", "media_type": "IMAGE", "media_product_type": "FEED",
         "timestamp": "2026-07-01T09:00:00+0000", "like_count": 10, "comments_count": 0, "permalink": "https://instagram.com/p/r3"},
    ]
    return {"username": handle, "name": "מתחרה", "followers_count": 4000, "media_count": 300, "media": {"data": posts}}


def model_output(refs=("K1", "S1", "P1")):
    return json.dumps(
        {
            "headline": "סוכות עכשיו, ובגוגל מחפשים פיג'מות",
            "insights": [
                {
                    "title": "פיג'מות לחג",
                    "text": "מחפשים בגוגל פיג'מה לחורף, וסוכות כבר כאן.",
                    "plan_change": "לפרסם השבוע קרוסלת פיג'מות עם קישור לוואטסאפ.",
                    "refs": list(refs),
                    "confidence": "strong",
                    "confidence_reason": "חג בתאריך קבוע וביטויים אמיתיים",
                },
                {
                    "title": "הערכת מחיר",
                    "text": "קליק בגוגל יקר יחסית.",
                    "plan_change": "לא לפתוח קמפיין חיפוש החודש.",
                    "refs": ["S99", "S_EST"],
                    "confidence": "strong",
                    "confidence_reason": "x",
                },
                {
                    "title": "מספר מומצא",
                    "text": "4,300 אנשים מחפשים חזיות בחודש.",
                    "plan_change": "להגדיל תקציב.",
                    "refs": ["S1"],
                    "confidence": "strong",
                    "confidence_reason": "x",
                },
            ],
        },
        ensure_ascii=False,
    )


class DbCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-research-"))
        self.engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        self.user = User(email="owner@example.com", password_hash="x", full_name="בעלת העסק")
        self.db.add(self.user)
        self.db.flush()
        self.business = Business(
            user_id=self.user.id,
            name="ת'ציצי פנימה",
            website_url="https://www.tazizi.co.il/",
            business_type="חנות פיזית / קמעונאות",
            offerings="תחתונים 4 ב-100 ש\"ח, מארזי פיג'מות",
            presence_type="hybrid",
            business_model="products",
            primary_goal="sales",
            monthly_budget_ils=4500,
            social_links_json=dumps({"instagram": "tazizi_store", "whatsapp": ""}),
            scraped_profile_json=dumps({"extracted": {"offers": ["הלבשה תחתונה", "פיג'מות"]}}),
        )
        self.db.add(self.business)
        self.db.commit()
        self.stack = ExitStack()
        self.addCleanup(self._cleanup)

    def _cleanup(self):
        self.stack.close()
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def offline(self, *, pages=None, suggestions=None, model=None):
        """Patch every outbound call. `pages` maps host substring -> html (or Exception)."""
        pages = pages if pages is not None else {"tazizi": OWN_HTML}
        suggestions = suggestions if suggestions is not None else {
            "הלבשה תחתונה": ["הלבשה תחתונה לנשים", "הלבשה תחתונה מבצע", "הלבשה תחתונה חנות"],
            "פיג'מות": ["פיג'מות לחורף", "פיג'מות נשים מחיר"],
        }

        def fake_html(url):
            for key, html in pages.items():
                if key in url:
                    if isinstance(html, Exception):
                        raise html
                    return url, html
            raise research.PageReadError("לא הצלחנו לקרוא")

        self.fetched = []

        def track(url):
            self.fetched.append(url)
            return fake_html(url)

        self.stack.enter_context(mock.patch.object(research, "_fetch_html", side_effect=track))
        self.suggest = self.stack.enter_context(
            mock.patch.object(keywords, "autocomplete", side_effect=lambda seed, **kw: suggestions.get(seed, []))
        )
        self.model = self.stack.enter_context(
            mock.patch.object(research, "strategy_json", side_effect=model or (lambda prompt, schema: model_output()))
        )

    def connect_meta(self):
        self.db.add(
            Integration(
                business_id=self.business.id,
                provider="meta",
                status="connected",
                external_id="page1",
                access_token_enc="not-a-real-ciphertext",
                extra_json=dumps({"selected_instagram_id": "ig1", "page_tokens": {"page1": "PAGE_TOKEN"}}),
            )
        )
        self.db.commit()
        self.db.refresh(self.business)

    def ctx(self, previous_state=None):
        return {"now": NOW, "today": NOW.date(), "previous_state": previous_state or {}}


# --- page snapshots -------------------------------------------------------------------


class SnapshotTest(unittest.TestCase):
    def test_parse_reads_prices_offers_basics_and_social(self):
        snap = research.parse_page_snapshot("https://www.tazizi.co.il/", OWN_HTML, NOW)
        self.assertIn("ת'ציצי", snap["title"])
        values = {item["value"] for item in snap["prices"]}
        self.assertIn("129.90", values)
        self.assertIn("189", values)
        self.assertNotIn("1", values)  # the <script> price is not page content
        self.assertTrue(any("4 ב-100" in offer for offer in snap["offers"]))
        self.assertTrue(any("משלוח חינם" in offer for offer in snap["offers"]))
        self.assertFalse(snap["basics"]["whatsapp_link"])
        self.assertFalse(snap["basics"]["hours"])
        self.assertIn("instagram", snap["social"])
        self.assertNotIn("facebook", snap["social"])  # a share button is not a page link

    def test_parse_detects_whatsapp_phone_and_hours(self):
        snap = research.parse_page_snapshot("https://rival.co.il/", RIVAL_HTML_V1, NOW)
        self.assertTrue(snap["basics"]["whatsapp_link"])
        self.assertTrue(snap["basics"]["phone"])
        self.assertTrue(snap["basics"]["hours"])

    def test_diff_baseline_changes_and_quiet(self):
        v1 = research.parse_page_snapshot("https://rival.co.il/", RIVAL_HTML_V1, NOW - timedelta(days=7))
        v2 = research.parse_page_snapshot("https://rival.co.il/", RIVAL_HTML_V2, NOW)
        self.assertTrue(research.diff_snapshots(None, v1)["baseline"])
        diff = research.diff_snapshots(v1, v2)
        self.assertTrue(diff["has_changes"])
        self.assertEqual(diff["title"][1], "המתחרה — סייל סוף עונה")
        self.assertIn("79", {item["value"] for item in diff["prices_added"]})
        self.assertIn("99", {item["value"] for item in diff["prices_removed"]})
        self.assertTrue(any("1+1" in offer for offer in diff["offers_added"]))
        self.assertIn("סייל סוף עונה", diff["headings_added"])
        same = research.diff_snapshots(v2, research.parse_page_snapshot("https://rival.co.il/", RIVAL_HTML_V2, NOW))
        self.assertFalse(same["has_changes"])


# --- competitors ----------------------------------------------------------------------


class CompetitorTest(DbCase):
    def test_nothing_configured_is_an_honest_empty(self):
        self.offline()
        items, status, _ = research.gather_competitors(self.db, self.business, self.ctx())
        self.assertEqual(items, [])
        self.assertEqual(status["state"], "empty")
        self.assertIn("competitor_handles", status["needs"])
        self.assertIn("competitor_websites", status["needs"])

    def test_handles_without_meta_say_not_connected(self):
        self.offline()
        self.business.instagram_handles_json = dumps(["rival.lingerie"])
        self.db.commit()
        with mock.patch.object(meta, "business_discovery") as discovery_call:
            items, status, _ = research.gather_competitors(self.db, self.business, self.ctx())
        discovery_call.assert_not_called()
        self.assertEqual(status["state"], "not_connected")
        self.assertIn("instagram_connection", status["needs"])
        self.assertEqual(items[0]["kind"], "absence")
        self.assertIn("@rival.lingerie", items[0]["text_he"])

    def test_business_discovery_summarises_recent_public_posts(self):
        self.offline()
        self.connect_meta()
        self.business.instagram_handles_json = dumps(["rival.lingerie"])
        self.db.commit()
        with mock.patch.object(meta, "business_discovery", return_value=discovery()):
            items, status, state = research.gather_competitors(self.db, self.business, self.ctx())
        self.assertEqual(status["state"], "ok")  # websites are optional
        finding = items[0]
        self.assertEqual(finding["kind"], "fact")
        self.assertEqual(finding["data"]["posts_last_14d"], 2)
        self.assertEqual(finding["data"]["posts_last_30d"], 2)
        self.assertIn("3 טעויות במידת חזייה", finding["text_he"])
        self.assertIn("לייקים ותגובות ציבוריים בלבד", finding["text_he"])
        self.assertEqual(finding["date"], "2026-09-24")
        self.assertEqual(state["instagram"]["rival.lingerie"]["media_ids"], ["r1", "r2", "r3"])

        # Next week: one new post is a change.
        newer = discovery(posts=[{"id": "r0", "caption": "חדש", "media_type": "IMAGE", "timestamp": "2026-10-01T09:00:00+0000", "like_count": 5, "comments_count": 1}] + discovery()["media"]["data"])
        later = {**self.ctx({"competitors": state}), "today": NOW.date() + timedelta(days=7)}
        with mock.patch.object(meta, "business_discovery", return_value=newer):
            items, _, _ = research.gather_competitors(self.db, self.business, later)
        self.assertEqual(items[0]["kind"], "change")
        self.assertEqual(items[0]["data"]["new_since_last_run"], 1)

    def test_discovery_permission_error_stops_asking(self):
        self.offline()
        self.connect_meta()
        self.business.instagram_handles_json = dumps(["one", "two"])
        self.db.commit()
        with mock.patch.object(meta, "business_discovery", side_effect=meta.GraphError("no", kind="permission")) as call:
            items, status, _ = research.gather_competitors(self.db, self.business, self.ctx())
        self.assertEqual(call.call_count, 1)
        self.assertEqual([item["kind"] for item in items], ["absence", "absence"])
        self.assertEqual(status["state"], "error")

    def test_competitor_website_baseline_then_diff(self):
        self.business.competitors_json = dumps([{"name": "המתחרה", "website_url": "rival.co.il"}, {"name": "בלי אתר", "website_url": ""}])
        self.db.commit()
        self.offline(pages={"rival": RIVAL_HTML_V1})
        items, status, state = research.gather_competitors(self.db, self.business, self.ctx())
        self.assertEqual(items[0]["kind"], "fact")
        self.assertIn("בפעם הראשונה", items[0]["text_he"])
        self.assertTrue(any("בלי אתר" in item["text_he"] for item in items))
        self.assertIn("https://rival.co.il/", state["sites"])

        self.stack.close()
        self.stack = ExitStack()
        self.offline(pages={"rival": RIVAL_HTML_V2})
        items, _, _ = research.gather_competitors(self.db, self.business, self.ctx({"competitors": state}))
        change = items[0]
        self.assertEqual(change["kind"], "change")
        self.assertIn("79", change["text_he"])
        self.assertIn("1+1", change["text_he"])
        self.assertIn("סייל סוף עונה", change["text_he"])

    def test_unreadable_competitor_site_is_reported_not_raised(self):
        self.business.competitors_json = dumps([{"name": "המתחרה", "website_url": "rival.co.il"}])
        self.db.commit()
        self.offline(pages={"rival": research.PageReadError("האתר איטי")})
        items, status, _ = research.gather_competitors(self.db, self.business, self.ctx())
        self.assertEqual(items[0]["kind"], "absence")
        self.assertEqual(status["state"], "error")


# --- search ---------------------------------------------------------------------------


class SearchTest(DbCase):
    def test_new_journey_excludes_agency_costs_without_losing_search_evidence(self):
        self.offline()
        self.business.scraped_profile_json = dumps({"owner_context": {"research_journey": {}},
                                                  "extracted": {"offers": ["הלבשה תחתונה", "פיג'מות"]}})
        with mock.patch.object(research.google_cost, "plan_for_business", side_effect=AssertionError("agency cost forbidden")):
            items, status, state = research.gather_search(self.db, self.business, self.ctx())
        self.assertTrue(state["phrases"])
        self.assertTrue(any(item["origin"].startswith("Google autocomplete") for item in items))
        self.assertFalse(any(item["origin"] == research.google_cost.SOURCE_URL for item in items))
        self.assertIn("google_search_console", status["needs"])

    def test_real_phrases_no_volumes_and_estimates_labelled(self):
        self.offline()
        items, status, state = research.gather_search(self.db, self.business, self.ctx())
        kinds = {item["kind"] for item in items}
        phrases = [item for item in items if item["origin"].startswith("Google autocomplete (")]
        self.assertTrue(phrases)
        self.assertIn("בלי מספר חיפושים", phrases[0]["text_he"])
        # The category read off the site is asked first.
        self.assertEqual(research.research_seeds(self.business)[0], "הלבשה תחתונה")
        self.assertIn("absence", kinds)  # Search Console not connected
        self.assertIn("google_search_console", status["needs"])
        self.assertEqual(status["state"], "partial")
        self.assertIn("אין לנו כמה אנשים מחפשים", status["note_he"])
        for item in items:
            self.assertNotRegex(item["text_he"], r"חיפושים בחודש")
        estimates = [item for item in items if item["kind"] == "estimate"]
        for item in estimates:
            self.assertTrue(item["text_he"].startswith("הערכה"))
        self.assertIn("הלבשה תחתונה", state["phrases"])

    def test_new_phrases_since_last_run_are_a_change(self):
        self.offline()
        _, _, state = research.gather_search(self.db, self.business, self.ctx())
        self.stack.close()
        self.stack = ExitStack()
        self.offline(suggestions={"הלבשה תחתונה": ["הלבשה תחתונה לנשים", "הלבשה תחתונה אחרי ניתוח"]})
        items, _, _ = research.gather_search(self.db, self.business, self.ctx({"search": state}))
        changes = [item for item in items if item["kind"] == "change"]
        self.assertEqual(len(changes), 1)
        self.assertIn("אחרי ניתוח", changes[0]["text_he"])

    def test_search_console_rows_are_real_numbers(self):
        self.offline()
        console = {
            "queries": [{"query": "חזיות אחרי ניתוח", "clicks": 12, "impressions": 340, "ctr": 0.035, "position": 8.2}],
            "quick_wins": [{"query": "חזיות אחרי ניתוח", "clicks": 12, "impressions": 340, "position": 8.2}],
            "period": {"start": "2026-08-29", "end": "2026-09-25"},
        }
        with mock.patch.object(research, "_search_console_for", return_value=(console, "")):
            items, status, _ = research.gather_search(self.db, self.business, self.ctx())
        self.assertEqual(status["state"], "ok")
        console_items = [item for item in items if item["origin"] == "Google Search Console"]
        self.assertTrue(any("340 חשיפות" in item["text_he"] for item in console_items))
        self.assertEqual(console_items[0]["date"], "2026-09-25")

    def test_google_unreachable_is_an_error_not_an_invention(self):
        self.offline(suggestions={})
        items, status, _ = research.gather_search(self.db, self.business, self.ctx())
        self.assertEqual(status["state"], "error")
        self.assertFalse([item for item in items if item["kind"] == "fact"])


# --- calendar -------------------------------------------------------------------------


class CalendarTest(DbCase):
    def test_next_six_weeks_and_shopping_lookahead(self):
        items, status, _ = research.gather_calendar(self.db, self.business, self.ctx())
        names = [item["data"]["name"] for item in items]
        self.assertIn("סוכות", names)
        self.assertIn("שמחת תורה", names)
        black = next(item for item in items if item["data"]["name"] == "בלאק פריידי")
        self.assertFalse(black["data"]["in_window"])
        self.assertTrue(black["text_he"].startswith("להתכונן מראש"))
        for item in items:
            self.assertLessEqual(item["data"]["days_away"], research.SHOPPING_LOOKAHEAD_DAYS)
            self.assertTrue(item["date"])
        self.assertEqual(status["state"], "ok")

    def test_history_from_a_prior_plan(self):
        roadmap = {
            "roadmap": {
                "relevant_events": [{"date": "2026-09-26", "name": "סוכות וחול המועד", "relevance_tier": "high"}],
                "posts": [
                    {"title": "מתארגנות לסוכות: מארזי פיג'מות", "approval_status": "approved"},
                    {"title": "אחר", "approval_status": "approved"},
                ],
            }
        }
        self.db.add(Strategy(business_id=self.business.id, year=2026, month=9, roadmap_json=dumps(roadmap)))
        self.db.add(
            PerformanceSnapshot(
                business_id=self.business.id,
                period_start="2026-09-01",
                period_end="2026-09-28",
                ga4_json=dumps({"overview": {"sessions": "812", "conversions": "9"}}),
            )
        )
        self.db.commit()
        items, _, _ = research.gather_calendar(self.db, self.business, self.ctx())
        sukkot = next(item for item in items if item["data"]["name"] == "סוכות")
        history = sukkot["data"]["history"]
        self.assertEqual(history["posts_planned"], 1)
        self.assertEqual(history["posts_approved"], 1)
        self.assertEqual(history["measured"]["sessions"], 812)
        self.assertIn("כבר בתוכנית של 9/2026", sukkot["text_he"])
        self.assertIn("לא רק בגלל החג", sukkot["text_he"])

    def test_memorial_days_are_flagged(self):
        ctx = {"now": datetime(2027, 4, 20), "today": datetime(2027, 4, 20).date(), "previous_state": {}}
        items, _, _ = research.gather_calendar(self.db, self.business, ctx)
        memorial = [item for item in items if item["data"]["kind"] == "זיכרון"]
        self.assertTrue(memorial)
        self.assertTrue(all(item["data"]["no_promotions"] for item in memorial))


# --- own results ----------------------------------------------------------------------


class OwnResultsTest(DbCase):
    def test_nothing_synced_says_what_is_not_measured(self):
        items, status, _ = research.gather_own_results(self.db, self.business, self.ctx())
        self.assertEqual(status["state"], "not_connected")
        self.assertEqual(set(status["needs"]), {"instagram_connection", "google_analytics"})
        self.assertEqual(items[-1]["kind"], "absence")
        self.assertIn("לא נמדד", items[-1]["text_he"])
        self.assertFalse(any(ch.isdigit() for ch in items[-1]["text_he"]))

    def test_plan_facts_without_metrics(self):
        roadmap = {"roadmap": {"theme": "חגים", "posts": [
            {"title": "a", "approval_status": "approved", "format": "reel"},
            {"title": "b", "approval_status": "review", "format": "image", "published_url": "https://instagram.com/p/b"},
        ]}}
        self.db.add(Strategy(business_id=self.business.id, year=2026, month=9, roadmap_json=dumps(roadmap)))
        self.db.commit()
        items, _, _ = research.gather_own_results(self.db, self.business, self.ctx())
        plan = next(item for item in items if item["origin"] == "התוכנית ב-IsraMarket")
        self.assertIn("2 פוסטים, 1 אושרו, 1 סומנו כפורסמו", plan["text_he"])

    def test_synced_posts_and_site_numbers(self):
        self.connect_meta()
        for index, (reach, saved) in enumerate([(1000, 80), (900, 10), (800, 40), (700, 5), (600, 30)]):
            self.db.add(
                InstagramPost(
                    business_id=self.business.id,
                    media_id=f"m{index}",
                    caption=f"הוק {index}\nגוף",
                    media_type="VIDEO" if index % 2 == 0 else "IMAGE",
                    media_product_type="REELS" if index % 2 == 0 else "FEED",
                    posted_at=f"2026-09-{10 + index}T10:00:00+0000",
                    reach=reach,
                    saved=saved,
                    shares=0,
                )
            )
        self.db.add(PerformanceSnapshot(business_id=self.business.id, period_start="2026-07-01", period_end="2026-07-28",
                                        ga4_json=dumps({"overview": {"sessions": "400"}})))
        self.db.add(PerformanceSnapshot(business_id=self.business.id, period_start="2026-08-29", period_end="2026-09-25",
                                        created_at=datetime.utcnow() + timedelta(seconds=5),
                                        ga4_json=dumps({"overview": {"sessions": "500", "engagedSessions": "300", "conversions": "7"},
                                                        "landing_pages": [{"landingPagePlusQueryString": "/", "sessionDefaultChannelGroup": "Organic Social", "sessions": "300", "conversions": "4"}]})))
        self.db.commit()
        items, status, _ = research.gather_own_results(self.db, self.business, self.ctx())
        texts = " ".join(item["text_he"] for item in items)
        self.assertIn("הוק 0", texts)  # best by saves per reach
        self.assertIn("שמירות 80", texts)
        self.assertIn("500 כניסות", texts)
        self.assertIn("+25%", texts)
        self.assertEqual(status["state"], "partial")  # GA4 not connected as an integration
        self.assertFalse(any(item["kind"] == "absence" for item in items))


# --- presence -------------------------------------------------------------------------


class PresenceTest(DbCase):
    def test_site_basics_and_platforms(self):
        self.offline()
        items, status, state = research.gather_presence(self.db, self.business, self.ctx())
        texts = [item["text_he"] for item in items]
        missing = next(text for text in texts if text.startswith("בעמוד הבית של האתר לא מצאנו"))
        self.assertIn("וואטסאפ", missing)
        self.assertIn("שעות פתיחה", missing)
        self.assertTrue(any("אינסטגרם (בפרטי העסק ובקישור מהאתר)" in text for text in texts))
        self.assertTrue(any("אין עיר או כתובת" in text for text in texts))
        self.assertIn("instagram_connection", status["needs"])
        self.assertIn("site", state)

    def test_own_site_change_since_last_run(self):
        self.offline()
        _, _, state = research.gather_presence(self.db, self.business, self.ctx())
        self.stack.close()
        self.stack = ExitStack()
        self.offline(pages={"tazizi": OWN_HTML.replace("₪129.90", "₪99.90")})
        items, _, _ = research.gather_presence(self.db, self.business, self.ctx({"presence": state}))
        change = next(item for item in items if item["kind"] == "change")
        self.assertIn("באתר שלכם", change["text_he"])
        self.assertIn("99.90", change["text_he"])

    def test_no_website(self):
        self.offline()
        self.business.website_url = ""
        self.business.social_links_json = "{}"
        self.db.commit()
        items, status, _ = research.gather_presence(self.db, self.business, self.ctx())
        self.assertEqual(status["state"], "empty")
        self.assertIn("website", status["needs"])
        self.assertEqual(self.fetched, [])
        self.assertTrue(all(item["kind"] in {"absence", "fact"} for item in items))

    def test_onboarding_v2_nested_links(self):
        self.business.social_links_json = dumps({"links": {"tiktok": "tazizi", "facebook": "fb.com/tazizi"}})
        links = research.own_links(self.business)
        self.assertEqual(links["tiktok"], "tazizi")
        self.assertEqual(links["facebook"], "fb.com/tazizi")


# --- insights -------------------------------------------------------------------------


class InsightTest(unittest.TestCase):
    FINDINGS = [
        {"id": "K1", "source": "calendar", "kind": "fact", "text_he": "סוכות 26.9.2026", "date": "2026-09-26", "origin": "x", "data": {}},
        {"id": "S1", "source": "search", "kind": "fact", "text_he": "פיג'מות לחורף", "date": "", "origin": "x", "data": {}},
        {"id": "S_EST", "source": "search", "kind": "estimate", "text_he": "קליק 6–12 ₪", "date": "", "origin": "x", "data": {}},
        {"id": "P1", "source": "presence", "kind": "fact", "text_he": "אין וואטסאפ", "date": "", "origin": "x", "data": {}},
    ]

    def test_refs_validated_confidence_and_numbers(self):
        headline, items = research.clean_insights(json.loads(model_output()), self.FINDINGS, "context 4 ב-100")
        self.assertTrue(headline)
        self.assertEqual(len(items), 3)
        first, estimate_only, invented = items
        self.assertEqual(first["refs"], ["K1", "S1", "P1"])
        self.assertEqual(first["sources"], ["search", "calendar", "presence"])
        self.assertEqual(first["confidence"], "strong")
        self.assertEqual([e["id"] for e in first["evidence"]], ["K1", "S1", "P1"])
        self.assertEqual(estimate_only["refs"], ["S_EST"])  # S99 dropped
        self.assertEqual(estimate_only["confidence"], "weak")
        self.assertEqual(invented["confidence"], "weak")
        self.assertIn("4300", invented["unverified_numbers"])
        for item in items:
            for key in ("id", "title", "text", "plan_change", "confidence", "sources", "refs", "evidence"):
                self.assertIn(key, item)

    def test_derived_deadline_is_not_an_invented_number(self):
        raw = {"headline": "h", "insights": [
            {"title": "t", "text": "סוכות עכשיו", "plan_change": "לפרסם עד 2.10 פוסט אחד", "refs": ["K1"], "confidence": "strong"},
            {"title": "t", "text": "יש 57% הנחה", "plan_change": "לפרסם עד 2.10", "refs": ["K1"], "confidence": "strong"},
        ]}
        _, items = research.clean_insights(raw, self.FINDINGS, "")
        self.assertEqual(items[0]["confidence"], "strong")
        self.assertEqual(items[0]["unverified_numbers"], [])
        self.assertEqual(items[1]["unverified_numbers"], ["57"])

    def test_insight_without_real_refs_is_dropped_and_capped_at_six(self):
        raw = {"headline": "h", "insights": [
            {"title": "t", "text": "x", "plan_change": "y", "refs": ["NOPE"], "confidence": "strong"},
            *[{"title": f"t{i}", "text": "x", "plan_change": "y", "refs": ["K1"], "confidence": "weak"} for i in range(8)],
        ]}
        _, items = research.clean_insights(raw, self.FINDINGS, "")
        self.assertEqual(len(items), research.MAX_INSIGHTS)
        self.assertTrue(all(item["refs"] == ["K1"] for item in items))

    def test_schema_bounds(self):
        schema = research.INSIGHTS_SCHEMA["properties"]["insights"]
        self.assertEqual((schema["minItems"], schema["maxItems"]), (3, 6))
        self.assertIn("plan_change", schema["items"]["required"])


# --- runs, persistence, prompt block ---------------------------------------------------


class RunTest(DbCase):
    def test_new_journey_publication_mix_cannot_carry_fresh_or_resumed_forecasts(self):
        business = {"name": "QA", "monthly_budget_ils": 4500, "primary_goal": "sales",
                    "business_model": "products", "owner_context": {"research_journey": {}}}
        scan = {"extracted": {}, "brand_language": {"tone": "simple"}}
        for stage in ("usp", "plan"):
            state = {"stage": stage, "posting_plan": {"realistic_roas": [2, 3], "expected_clicks": [100, 200]}}
            with self.subTest(stage=stage), mock.patch.object(strategy_service, "posting_plan", side_effect=AssertionError("agency model forbidden")), \
                    mock.patch.object(strategy_service, "build_usp", return_value={}), \
                    mock.patch.object(strategy_service, "build_roadmap", return_value={"theme": "QA"}) as roadmap:
                result = strategy_service.generate_monthly_strategy(business, scan=scan, state=state, one_stage=True)
            self.assertEqual(result["posting_plan"], {"business_model": "products", "primary_goal": "sales"})
            self.assertEqual(result["generate_state"]["posting_plan"], result["posting_plan"])
            if stage == "plan":
                self.assertEqual(roadmap.call_args.args[3], result["posting_plan"])

    def test_saved_agency_insights_are_removed_for_journey_in_both_prompts(self):
        def insight(title, origin, kind="estimate"):
            return {"title": title, "text": title, "plan_change": title, "confidence": "weak",
                    "evidence": [{"origin": origin, "kind": kind}], "source_labels_he": ["חיפושים בגוגל"]}
        agency_google = insight("old agency cpc", research.google_cost.SOURCE_URL)
        agency_meta = insight("old agency roas", research.cost_model.SOURCE_URL)
        # A mixed insight retains a measured citation but still contains an agency
        # estimate. Removing just the citation would keep the unsupported claim.
        mixed = insight("mixed derived forecast", "Google Search Console", "fact")
        mixed["evidence"].append({"origin": research.google_cost.SOURCE_URL, "kind": "estimate"})
        measured = insight("measured clicks", "Google Search Console", "fact")
        saved = [agency_google, agency_meta, mixed, measured]
        self.db.add(ResearchRun(business_id=self.business.id, status="done", created_at=datetime.utcnow(),
                                insights_json=dumps({"items": saved})))
        self.db.commit()
        # Legacy businesses retain their existing behavior.
        legacy = research.research_prompt_block(self.business, self.db)
        self.assertIn("old agency cpc", legacy)
        self.assertIn("old agency roas", legacy)
        self.business.scraped_profile_json = dumps({"owner_context": {"research_journey": {"version": 1}}})
        self.db.commit()
        for business in (self.business, {"id": self.business.id},
                         {"id": self.business.id, "owner_context": {"research_journey": {}}}):
            with self.subTest(business=type(business).__name__):
                block = research.research_prompt_block(business, self.db)
                self.assertIn("measured clicks", block)
                for text in ("old agency cpc", "old agency roas", "mixed derived forecast"):
                    self.assertNotIn(text, block)
        prompt = research.insights_prompt(self.db, self.business, [], {}, saved)
        self.assertIn("measured clicks", prompt)
        self.assertNotIn("old agency cpc", prompt)
        self.assertNotIn("old agency roas", prompt)
        self.assertNotIn("mixed derived forecast", prompt)

    def test_only_saved_agency_evidence_leaves_no_research_claim(self):
        self.business.scraped_profile_json = dumps({"owner_context": {"research_journey": {}}})
        self.db.add(ResearchRun(business_id=self.business.id, status="done", created_at=datetime.utcnow(),
                                insights_json=dumps({"items": [{"title": "unsupported", "text": "forecast",
                                    "evidence": [{"origin": research.google_cost.SOURCE_URL}]}]})))
        self.db.commit()
        self.assertEqual(research.research_prompt_block(self.business, self.db), "")

    def test_run_persists_findings_insights_and_statuses(self):
        self.offline()
        run = research.run_research(self.db, self.business, trigger="manual", now=NOW)
        stored = self.db.get(ResearchRun, run.id)
        self.assertEqual(stored.status, "done")
        self.assertEqual(stored.period, "2026-W39")
        findings = loads(stored.findings_json, {})
        self.assertEqual({item["source"] for item in findings["items"]} - set(research.SOURCES), set())
        self.assertIn("presence", findings["state"])
        statuses = loads(stored.sources_json, {})
        self.assertEqual(set(statuses), set(research.SOURCES))
        self.assertEqual(statuses["competitors"]["state"], "empty")
        payload = research.serialize_run(stored)
        self.assertGreaterEqual(len(payload["insights"]), 1)
        self.assertEqual(set(payload["findings"]), set(research.SOURCES))
        prompt = self.model.call_args[0][0]
        self.assertIn("[K1]", prompt)
        self.assertIn("איך כותבים בעברית", prompt)  # HEBREW_STYLE

    def test_other_synthesizer_is_labelled(self):
        self.offline()
        run = research.run_research(
            self.db, self.business, now=NOW, synthesize=lambda prompt, schema: model_output(), model_label="muse-spark (verification)"
        )
        self.assertEqual(run.model, "muse-spark (verification)")
        self.model.assert_not_called()
        default = research.run_research(self.db, self.business, now=NOW + timedelta(days=1))
        self.assertEqual(default.model, research.get_settings().gemini_strategy_model)

    def test_model_failure_keeps_findings(self):
        self.offline(model=mock.Mock(side_effect=RuntimeError("חסר GEMINI_API_KEY")))
        run = research.run_research(self.db, self.business, now=NOW)
        self.assertEqual(run.status, "insights_failed")
        payload = research.serialize_run(run)
        self.assertEqual(payload["insights"], [])
        self.assertIn("אין מפתח AI", payload["insights_error_he"])
        self.assertTrue(payload["findings"]["calendar"])

    def test_broken_source_does_not_sink_the_run(self):
        self.offline()
        with mock.patch.dict(research.GATHERERS, {"search": mock.Mock(side_effect=ValueError("boom"))}):
            run = research.run_research(self.db, self.business, now=NOW)
        statuses = loads(run.sources_json, {})
        self.assertEqual(statuses["search"]["state"], "error")
        self.assertEqual(statuses["calendar"]["state"], "ok")

    def test_second_run_diffs_against_the_first(self):
        self.offline()
        research.run_research(self.db, self.business, now=NOW)
        self.stack.close()
        self.stack = ExitStack()
        self.offline(pages={"tazizi": OWN_HTML.replace("משלוח חינם בקנייה מעל 250", "סייל סוף עונה 30% הנחה")})
        run = research.run_research(self.db, self.business, now=NOW + timedelta(days=7))
        presence = research.serialize_run(run)["findings"]["presence"]
        self.assertTrue(any(item["kind"] == "change" and "30%" in item["text_he"] for item in presence))
        prompt = self.model.call_args[0][0]
        self.assertIn("תובנות מהבדיקה הקודמת", prompt)

    def test_rate_limit_counts_only_manual_runs(self):
        now = datetime.utcnow()
        for _ in range(research.MANUAL_RUNS_PER_DAY):
            self.db.add(ResearchRun(business_id=self.business.id, trigger="manual", created_at=now - timedelta(hours=1)))
        self.db.add(ResearchRun(business_id=self.business.id, trigger="scheduled", created_at=now))
        self.db.commit()
        with self.assertRaises(research.ResearchRateLimited):
            research.check_rate_limit(self.db, self.business.id, now)
        self.assertEqual(research.rate_status(self.db, self.business.id, now)["runs_left_today"], 0)
        later = now + timedelta(hours=24)
        research.check_rate_limit(self.db, self.business.id, later)  # window rolled

    def test_prompt_block(self):
        self.assertEqual(research.research_prompt_block(self.business, self.db), "")
        self.offline()
        research.run_research(self.db, self.business, now=datetime.utcnow())
        block = research.research_prompt_block(self.business, self.db)
        self.assertIn("מה למדנו במחקר השוטף", block)
        self.assertIn("מה זה משנה בתוכנית: לפרסם השבוע קרוסלת פיג'מות", block)
        self.assertIn("[חזק]", block)
        self.assertIn("[חלש]", block)
        self.assertIn("מה לא נמדד במחקר", block)
        self.assertIn("ב-summary", block)
        # The payload dict the strategy router builds carries "id".
        with mock.patch("app.db.SessionLocal", self.Session):
            self.assertEqual(research.research_prompt_block({"id": self.business.id}), block)
        self.assertEqual(research.research_prompt_block({"name": "no id"}), "")

    def test_old_or_failed_runs_are_not_fed_to_the_plan(self):
        self.db.add(ResearchRun(business_id=self.business.id, status="done", created_at=datetime.utcnow() - timedelta(days=60),
                                insights_json=dumps({"items": [{"title": "ישן", "text": "x", "plan_change": "y"}]})))
        self.db.add(ResearchRun(business_id=self.business.id, status="insights_failed", created_at=datetime.utcnow()))
        self.db.commit()
        self.assertEqual(research.research_prompt_block(self.business, self.db), "")

    def test_month_plan_prompt_carries_the_block(self):
        self.offline()
        research.run_research(self.db, self.business, now=datetime.utcnow())
        captured = []

        def fake_strategy(prompt, schema):
            captured.append(prompt)
            return json.dumps({"theme": "t", "weekly_breakdown": [{"week": 1}]})

        payload = {"id": self.business.id, "name": "x", "business_type": "חנות", "monthly_budget_ils": 0, "primary_goal": "sales"}
        with mock.patch("app.db.SessionLocal", self.Session), mock.patch.object(strategy_service, "strategy_json", side_effect=fake_strategy):
            strategy_service.build_roadmap(payload, {}, [], {}, {})
        self.assertIn("מה למדנו במחקר השוטף", captured[0])
        captured.clear()
        with mock.patch.object(strategy_service, "strategy_json", side_effect=fake_strategy):
            strategy_service.build_roadmap({"name": "x", "monthly_budget_ils": 0, "primary_goal": "sales"}, {}, [], {}, {})
        self.assertNotIn("מה למדנו במחקר השוטף", captured[0])


# --- endpoints ------------------------------------------------------------------------


class EndpointTest(DbCase):
    def setUp(self):
        super().setUp()

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)

    def test_latest_empty_state_is_demo_friendly(self):
        self.business.instagram_handles_json = dumps(["rival.lingerie"])
        self.db.commit()
        body = self.client.get("/research/latest").json()
        self.assertFalse(body["available"])
        self.assertIsNone(body["run"])
        self.assertTrue(body["empty_state_he"])
        self.assertEqual(body["sources"]["competitors"]["state"], "not_connected")
        self.assertIn("instagram_connection", body["sources"]["competitors"]["needs"])
        self.assertEqual(body["rate_limit"]["runs_left_today"], 3)
        self.assertEqual(body["source_labels_he"]["search"], "חיפושים בגוגל")

    def test_run_then_latest_then_history_then_429(self):
        self.offline()
        for expected_left in (2, 1, 0):
            response = self.client.post("/research/run")
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["rate_limit"]["runs_left_today"], expected_left)
        body = self.client.get("/research/latest").json()
        self.assertTrue(body["available"])
        run = body["run"]
        self.assertEqual(run["trigger"], "manual")
        self.assertTrue(run["insights"][0]["plan_change"])
        self.assertIn("calendar", run["findings"])
        blocked = self.client.post("/research/run")
        self.assertEqual(blocked.status_code, 429)
        self.assertIn("3 פעמים", blocked.json()["detail"])
        self.assertIn("Retry-After", blocked.headers)
        history = self.client.get("/research/history", params={"limit": 2}).json()
        self.assertEqual(len(history["runs"]), 2)
        self.assertNotIn("findings", history["runs"][0])
        self.assertIn("findings_count", history["runs"][0])
        self.assertEqual(self.client.get("/research/history", params={"limit": 0}).status_code, 422)

    def test_history_empty(self):
        body = self.client.get("/research/history").json()
        self.assertEqual(body["runs"], [])
        self.assertTrue(body["empty_state_he"])


# --- weekly job ---------------------------------------------------------------------------


class WeeklyJobTest(DbCase):
    def test_job_runs_due_businesses_once(self):
        from app.jobs import weekly_research

        self.offline()
        with mock.patch.object(weekly_research, "SessionLocal", self.Session), \
                mock.patch.object(weekly_research, "engine", self.engine), \
                mock.patch.object(weekly_research, "migrate_db", lambda: None), \
                redirect_stdout(io.StringIO()):
            self.assertEqual(weekly_research.main([]), 0)
            self.assertEqual(weekly_research.main([]), 0)  # second call: ran < 6 days ago
            self.assertEqual(weekly_research.main(["--force"]), 0)
        runs = self.db.query(ResearchRun).filter(ResearchRun.business_id == self.business.id).all()
        self.assertEqual(len(runs), 2)
        self.assertTrue(all(run.trigger == "scheduled" for run in runs))
        self.assertEqual(research.rate_status(self.db, self.business.id)["runs_left_today"], 3)


if __name__ == "__main__":
    unittest.main()
