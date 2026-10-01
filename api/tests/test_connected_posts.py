"""Connected posts (docs/posts-v2.md, Revision 1 and the field contract).

Every post is a small, measured step of the plan: a stable uid that the tracking codes
come from, the one channel the plan chose, its place in the plan and one "why" line, what
the owner must add, how it is measured, the results written back by the performance
refresh (null when nothing matched, never 0 for unknown), one learning line, and the
"what worked so far" block every posts job and rewrite gets. Old posts keep working.

Hermetic: a throwaway SQLite file per test, every model call is a fake, no network.
"""

import _test_env  # noqa: F401  (must come before any `app` import)

import json
import shutil
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Asset, Audience, Business, InstagramPost, Integration, Strategy, User, WhatsappClick, WhatsappLink
from app.routers import performance as performance_router
from app.services import connected_posts as cp
from app.services import ga4 as ga4_service
from app.services import month_posts
from app.services import strategy as strategy_service
from app.services.jsonutil import dumps, loads
from app.services.quarter_plan import CONTENT_TYPES

TODAY = date.today()
YEAR, MONTH = TODAY.year, TODAY.month
PREV_YEAR, PREV_MONTH = (YEAR - 1, 12) if MONTH == 1 else (YEAR, MONTH - 1)

BRAND = {"business_name": "מאפיית תום", "voice": "חם ושכונתי", "do_say": ["טרי"], "dont_say": ["הכי"], "palette": []}
USP = {"usp": "בידול", "usp_one_liner": "משפט", "growth_hypothesis": "השערה"}
CORE = {
    "theme": "חנוכה בשכונה",
    "summary": "סיכום",
    "relevant_events": [],
    "long_horizon_plan": {"hypothesis": "רבעון", "targets": [], "milestones": []},
    "monthly_horizon_plan": {
        "hypothesis": "אם נפרסם כל שבוע מארז, נגדיל את ההזמנות מראש עד סוף החודש",
        "targets": [],
        "goal_he": "הזמנות מראש לחנוכה",
    },
    "management_and_checkpoints": {"how_we_help": "", "when_we_need_user": [], "checkpoints": []},
    "weekly_breakdown": [
        {"week": 1, "focus": "הלקוחות הקבועים", "media_distribution": "אינסטגרם, סטורי"},
        {"week": 2, "focus": "מארזים לחג", "media_distribution": "פייסבוק ואינסטגרם"},
        {"week": 3, "focus": "תזכורת", "media_distribution": "אינסטגרם"},
        {"week": 4, "focus": "סיכום", "media_distribution": "אינסטגרם"},
    ],
}


def written(week: int, **overrides) -> dict:
    """One post as the writer returns it (the full schema, connected fields included)."""
    post = {
        "week": week,
        "date_hint": "",
        "format": "image",
        "title": f"פוסט לשבוע {week}",
        "angle": "זווית",
        "hook": "פתיחה",
        "caption": "חלות טריות מהתנור כל בוקר, בואו לקחת",
        "cta": "כתבו לנו בוואטסאפ",
        "calendar_tie": "",
        "goal_fit": "",
        "why_now": "",
        "image_prompt": "bakery",
        "overlay_text": "טרי",
        "primary_outlet": "instagram",
        "outlets": ["instagram"],
        "metrics_to_watch": [],
        "stat_highlight": "",
        "outlet_captions": {"instagram": "כיתוב לאינסטגרם", "facebook": "כיתוב לפייסבוק", "whatsapp": "כיתוב לוואטסאפ"},
        "audience_name": "",
        "inspiration_refs": [],
        "inspiration_note": "",
        "mix_type": "product",
        "featured_item": "",
        "owner_fact": "",
        "applied_learning": "",
    }
    post.update(overrides)
    return post


class PostsModel:
    """strategy_json for the posts job: answers MonthlyPosts with `posts(prompt)`."""

    def __init__(self, posts):
        self.posts = posts
        self.prompts: list[str] = []

    def __call__(self, prompt, schema):
        if schema.get("title") != "MonthlyPosts":
            raise AssertionError(f"unexpected model call {schema.get('title')}")
        self.prompts.append(prompt)
        return json.dumps({"posts": self.posts(prompt)}, ensure_ascii=False)


def stored_post(title: str, *, uid: str, week: int = 1, cta: str = "כתבו לנו בוואטסאפ", channel: str = "instagram",
                mix_type: str | None = "product", published: bool = True, caption: str = "", **extra) -> dict:
    """A post as the month stores it after the posts job (uid-based codes included)."""
    post = {
        "uid": uid,
        "week": week,
        "format": "image",
        "title": title,
        "hook": "פתיחה",
        "caption": caption or f"{title}: חלות טריות מהתנור כל בוקר, בואו",
        "cta": cta,
        "primary_outlet": channel,
        "channel": channel,
        "outlets": [channel],
        "mix_type": mix_type,
        "approval_status": "approved",
        "utm": {"utm_source": channel, "utm_medium": "organic", "utm_campaign": f"isramarket-{YEAR}-{MONTH:02d}",
                "utm_content": f"p-{uid}"},
        "tracking_url": f"https://bakery.example/?utm_content=p-{uid}",
        "whatsapp_source_key": f"ig-post-{uid}",
        "published_url": f"https://www.instagram.com/p/{uid}/" if published else "",
        "published_at": f"{YEAR}-{MONTH:02d}-02T10:00:00" if published else None,
        "image_url": "/media/1/x.png",
        "image_source": "asset",
    }
    post.update(extra)
    return post


class ConnectedTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-connected-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        self.addCleanup(self.db.close)
        self.owner = User(email="owner@example.com", password_hash="x", full_name="תום")
        self.db.add(self.owner)
        self.db.commit()
        self.business = Business(
            user_id=self.owner.id,
            name="מאפיית תום",
            website_url="https://bakery.example",
            business_type="food",
            offerings="לחם וחלות",
            monthly_budget_ils=0,
            primary_goal="sales",
            competitors_json="[]",
            onboarding_complete=1,
            scraped_profile_json=dumps({"brand_language": BRAND, "extracted": {}, "raw": {}}),
        )
        self.db.add(self.business)
        self.db.commit()

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: self.owner
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app)
        # The cheap model is offline unless a test answers for it: nothing reaches Gemini.
        offline = mock.patch.object(cp, "lite_json", side_effect=RuntimeError("offline"))
        offline.start()
        self.addCleanup(offline.stop)
        self.codes = iter(range(1000, 9999))

    # --- helpers --------------------------------------------------------------------------

    def month(self, posts: list[dict] | None = None, year: int = YEAR, month: int = MONTH, core: dict | None = None,
              status: dict | None = None) -> Strategy:
        extra = {"roadmap": {**(core or CORE), "posts": list(posts or [])}, "brand_language": BRAND}
        if status is not None:
            extra["posts_status"] = status
        strategy = Strategy(business_id=self.business.id, year=year, month=month, usp_json=dumps(USP),
                            calendar_json="[]", roadmap_json=dumps(extra))
        self.db.add(strategy)
        self.db.commit()
        return strategy

    def stored(self, strategy: Strategy) -> list[dict]:
        self.db.expire_all()
        return loads(self.db.get(Strategy, strategy.id).roadmap_json, {})["roadmap"]["posts"]

    def current_posts(self) -> list[dict]:
        response = self.client.get("/strategy/current")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["roadmap"]["posts"]

    def write_week(self, week: int, model: PostsModel):
        with mock.patch.object(strategy_service, "strategy_json", side_effect=model):
            response = self.client.post("/onboarding/posts/start", json={"week": week})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def add_clicks(self, source_key: str, count: int) -> WhatsappLink:
        link = WhatsappLink(business_id=self.business.id, code=f"code{next(self.codes)}",
                            source_key=source_key, label_he="")
        self.db.add(link)
        self.db.flush()
        if count:
            self.db.add(WhatsappClick(business_id=self.business.id, link_id=link.id, day=TODAY.isoformat(),
                                      ua_family="ios", count=count))
        self.db.commit()
        return link

    def primary_audience(self, name: str = "הלקוחות הקבועים") -> Audience:
        audience = Audience(business_id=self.business.id, name=name, is_primary=1, priority="primary")
        self.db.add(audience)
        self.db.commit()
        return audience


PENDING = {"1": "pending", "2": "pending", "3": "pending", "4": "pending"}


# --- 1. the featured-items bug ------------------------------------------------------------


class FeaturedItemsTest(ConnectedTestCase):
    SAVED = {"items": [{"name": "חלת שאור", "reason": "best_seller", "note": "נגמרת כל שישי"},
                       {"name": "עוגת גבינה", "reason": None, "note": ""}],
             "saved_at": "2026-10-01T09:00:00"}

    def test_the_shape_the_picks_screen_saves_is_read(self):
        items = strategy_service.featured_items_from({"featured_items": self.SAVED})
        self.assertEqual([item["name"] for item in items], ["חלת שאור", "עוגת גבינה"])
        self.assertEqual(items[0]["why"], "הכי נמכר, נגמרת כל שישי")
        self.assertEqual(items[0]["id"], cp.featured_item_id("חלת שאור"))
        block = strategy_service._featured_block({"featured_items": items})
        self.assertIn("1. חלת שאור: הכי נמכר, נגמרת כל שישי", block)
        self.assertIn("2. עוגת גבינה", block)
        self.assertNotIn("best_seller", block)
        # The list shape (and the /start answers) keep working.
        self.assertEqual(strategy_service.featured_items_from({"featured_items": ["לחם"]}), ["לחם"])
        self.assertEqual(strategy_service.featured_items_from({"owner_context": {"featured_items": self.SAVED}})[0]["name"],
                         "חלת שאור")
        self.assertEqual(strategy_service.featured_items_from({"featured_items": {"saved_at": "x"}}), [])

    def test_saved_picks_reach_the_post_prompt_and_the_post_records_the_item(self):
        self.month(status=PENDING)
        saved = self.client.put("/business/featured-items", json={"items": [
            {"name": "חלת שאור", "reason": "best_seller", "note": "נגמרת כל שישי"},
            {"name": "עוגת גבינה", "reason": "seasonal"},
            {"name": "לחם כוסמין"},
        ]})
        self.assertEqual(saved.status_code, 200, saved.text)
        ids = {item["name"]: item["id"] for item in saved.json()["items"]}
        model = PostsModel(lambda prompt: [written(1, featured_item="חלת שאור"),
                                           written(1, title="פוסט אחר", featured_item="מוצר שלא ברשימה")])
        self.write_week(1, model)
        self.assertIn("1. חלת שאור: הכי נמכר, נגמרת כל שישי", model.prompts[0])
        self.assertIn("2. עוגת גבינה: עונתי", model.prompts[0])
        posts = self.current_posts()
        self.assertEqual(posts[0]["featured_item_id"], ids["חלת שאור"])
        self.assertEqual(posts[0]["featured_item_name"], "חלת שאור")
        # A name that is not on the owner's list is not a featured item.
        self.assertIsNone(posts[1]["featured_item_id"])


# --- 2. the contract fields on every post ---------------------------------------------------


class ContractFieldsTest(ConnectedTestCase):
    def test_a_written_post_carries_the_contract(self):
        self.primary_audience()
        strategy = self.month(status=PENDING)
        model = PostsModel(lambda prompt: [
            written(1, owner_fact="המחיר של מארז החג", caption="מארז חג ב-[מחיר]"),
            written(1, title="סדנה", cta="להרשמה באתר", mix_type="value"),
        ])
        self.write_week(1, model)
        prompt = model.prompts[0]
        # One channel per post, from the plan; the other networks are only a copy.
        self.assertIn("ערוץ אחד בלבד", prompt)
        self.assertIn("הערוצים שהתוכנית בחרה: שבוע 1: אינסטגרם.", prompt)
        self.assertNotIn("outlet_captions לאינסטגרם, פייסבוק ווואטסאפ", prompt)
        self.assertIn("mix_type", prompt)

        first, second = self.current_posts()
        for post in (first, second):
            for key in ("uid", "channel", "plan_link", "mix_type", "why_line", "owner_needs", "measure",
                        "results", "learning", "informed_by_note", "lifecycle"):
                self.assertIn(key, post)
        self.assertEqual(first["channel"], "instagram")
        self.assertEqual(first["plan_link"], {"goal": "הזמנות מראש לחנוכה", "week": 1, "week_focus": "הלקוחות הקבועים"})
        self.assertEqual(first["why_line"], "בשביל הזמנות מראש לחנוכה, ללקוחות הקבועים.")
        self.assertEqual(first["mix_type"], "product")
        self.assertEqual(first["measure"], {"metric": "whatsapp_clicks", "label_he": "לחיצות לוואטסאפ",
                                            "link_code": f"ig-post-{first['uid']}"})
        self.assertEqual(second["measure"]["metric"], "site_visits")
        self.assertEqual(second["measure"]["link_code"], f"p-{second['uid']}")
        self.assertEqual(second["measure"]["label_he"], "כניסות לאתר")
        # No image yet, and a price only the owner knows: the post waits for them.
        self.assertEqual(first["owner_needs"], [{"kind": "photo", "text": "תמונה שמתאימה לפוסט"},
                                                {"kind": "fact", "text": "לבדוק את המחיר של מארז החג"}])
        self.assertEqual(first["lifecycle"], "needs_owner")
        self.assertIsNone(first["results"])
        self.assertIsNone(first["learning"])
        self.assertIsNone(first["informed_by_note"])
        # Stored on the post too, not only computed.
        raw = self.stored(strategy)[0]
        self.assertEqual(raw["plan_link"]["goal"], "הזמנות מראש לחנוכה")
        self.assertEqual(raw["why_line"], "בשביל הזמנות מראש לחנוכה, ללקוחות הקבועים.")
        self.assertEqual(raw["measure"]["metric"], "whatsapp_clicks")

        # The owner's photo answers the photo; approving answers the rest.
        asset = Asset(business_id=self.business.id, filename="asset-1.jpg", kind="image")
        self.db.add(asset)
        self.db.commit()
        after_photo = self.client.post("/strategy/posts/asset", json={"post_index": 0, "asset_id": asset.id}).json()
        self.assertEqual(after_photo["post"]["owner_needs"], [{"kind": "fact", "text": "לבדוק את המחיר של מארז החג"}])
        self.assertEqual(after_photo["post"]["lifecycle"], "needs_owner")
        approved = self.client.post("/strategy/posts/approve", json={"post_index": 0, "approved": True}).json()
        self.assertEqual(approved["post"]["lifecycle"], "approved")
        self.assertEqual(approved["post"]["owner_needs"], [])
        published = self.client.post("/strategy/posts/publish", json={
            "post_index": 0, "published_url": "https://www.instagram.com/p/abc/"}).json()
        self.assertEqual(published["post"]["lifecycle"], "published")
        self.assertEqual(published["strategy"]["roadmap"]["posts"][0]["lifecycle"], "published")

    def test_the_channel_is_one_the_plan_chose_and_the_mix_type_is_real(self):
        self.month(status=PENDING)
        # Week 1 is Instagram only: a Facebook post becomes the Instagram copy it came with.
        model = PostsModel(lambda prompt: [written(1, primary_outlet="facebook", outlets=["facebook"], mix_type="poster")])
        self.write_week(1, model)
        post = self.current_posts()[0]
        self.assertEqual((post["channel"], post["primary_outlet"]), ("instagram", "instagram"))
        self.assertEqual(post["caption"], "כיתוב לאינסטגרם")
        self.assertEqual(post["outlets"][0], "instagram")
        self.assertEqual(post["outlet_captions"]["instagram"], "כיתוב לאינסטגרם")
        self.assertIsNone(post["mix_type"])

    def test_a_typographic_card_and_an_ai_choice_need_no_photo(self):
        view = cp.connected_view({"title": "t", "overlay_theme": "type_hero", "mix_type": "product"},
                                 index=0, business_id=1, year=YEAR, month=MONTH)
        self.assertEqual(view["owner_needs"], [])
        self.assertEqual(view["lifecycle"], "ready")
        ai = cp.connected_view({"title": "t", "mix_type": "product", "image_url": "/m/1.png", "image_source": "generated",
                                "image_preference": "ai"}, index=0, business_id=1, year=YEAR, month=MONTH)
        self.assertEqual(ai["owner_needs"], [])
        generated = cp.connected_view({"title": "t", "mix_type": "product", "image_url": "/m/1.png",
                                       "image_source": "generated", "featured_item_name": "חלת שאור"},
                                      index=0, business_id=1, year=YEAR, month=MONTH)
        self.assertEqual(generated["owner_needs"], [{"kind": "photo", "text": "תמונה של חלת שאור"}])
        teaching = cp.connected_view({"title": "t", "mix_type": "value", "image_url": "/m/1.png",
                                      "image_source": "generated"}, index=0, business_id=1, year=YEAR, month=MONTH)
        self.assertEqual(teaching["owner_needs"], [])
        self.assertEqual(teaching["measure"]["metric"], "saves")
        facebook = cp.connected_view({"title": "t", "primary_outlet": "facebook", "cta": "לפרטים"},
                                     index=0, business_id=1, year=YEAR, month=MONTH)
        self.assertEqual(facebook["measure"]["metric"], "reach")

    def test_lifecycle_words(self):
        base = {"title": "t", "overlay_theme": "type_hero"}
        self.assertEqual(cp.lifecycle(base), "ready")
        self.assertEqual(cp.lifecycle({**base, "owner_fact": "המחיר"}), "needs_owner")
        self.assertEqual(cp.lifecycle({**base, "owner_fact": "המחיר", "owner_fact_done": True}), "ready")
        self.assertEqual(cp.lifecycle({**base, "approval_status": "approved"}), "approved")
        self.assertEqual(cp.lifecycle({**base, "published_url": "https://x.example/p/1"}), "published")
        self.assertEqual(cp.lifecycle({**base, "published_url": "https://x", "results": {"value": None}}), "published")
        self.assertEqual(cp.lifecycle({**base, "results": {"value": 0}}), "measured")

    def test_why_line_and_goal(self):
        self.assertEqual(cp.why_line("הזמנות מראש לחנוכה", "הלקוחות הקבועים"), "בשביל הזמנות מראש לחנוכה, ללקוחות הקבועים.")
        self.assertEqual(cp.why_line("הזמנות", "הורים צעירים"), "בשביל הזמנות, להורים צעירים.")
        self.assertEqual(cp.why_line("הזמנות", "משפחות בשכונה"), "בשביל הזמנות, למשפחות בשכונה.")
        self.assertEqual(cp.why_line("הזמנות", ""), "בשביל הזמנות.")
        self.assertEqual(cp.why_line("", ""), "")
        # The planner's goal first; else the hypothesis' outcome; else the theme.
        self.assertEqual(cp.month_goal(CORE), "הזמנות מראש לחנוכה")
        old = {**CORE, "monthly_horizon_plan": {"hypothesis": CORE["monthly_horizon_plan"]["hypothesis"]}}
        self.assertEqual(cp.month_goal(old), "ההזמנות מראש")
        self.assertEqual(cp.month_goal({"theme": "חנוכה בשכונה", "monthly_horizon_plan": {"hypothesis": "רק משפט"}}),
                         "חנוכה בשכונה")
        seeded = {"theme": "x", "strategy": {"kpi": {"name_he": "פניות בוואטסאפ"}}, "monthly_horizon_plan": {}}
        self.assertEqual(cp.month_goal(seeded), "פניות בוואטסאפ")

    def test_mix_types_are_the_content_mix(self):
        self.assertEqual(set(cp.MIX_TYPES), set(CONTENT_TYPES))


# --- 3. stable ids and tracking codes ------------------------------------------------------


class UidAndTrackingTest(ConnectedTestCase):
    OLD = [
        {"week": 1, "format": "image", "title": "חלות לשבת", "caption": "כיתוב", "cta": "כתבו לנו בוואטסאפ",
         "primary_outlet": "instagram", "outlets": ["instagram"], "approval_status": "review",
         "utm": {"utm_content": "p1-חלות-לשבת", "utm_campaign": "isramarket-x"}, "tracking_url": ""},
        {"week": 1, "format": "image", "title": "סדנה", "caption": "כיתוב", "cta": "לפרטים",
         "primary_outlet": "facebook", "outlets": ["facebook"]},
    ]

    def test_old_posts_get_a_stable_uid_that_survives_edits_and_is_stored_later(self):
        strategy = self.month([dict(post) for post in self.OLD], status={"1": "done", "2": "pending", "3": "pending",
                                                                          "4": "pending"})
        first = [post["uid"] for post in self.current_posts()]
        self.assertEqual(len(set(first)), 2)
        self.assertEqual(first, [post["uid"] for post in self.current_posts()])
        self.assertEqual(first[0], cp.backfill_uid(self.business.id, YEAR, MONTH, 0))
        saved = self.client.post("/strategy/posts/save", json={
            "post_index": 0, "title": "כותרת חדשה", "format": "image", "caption": "כיתוב חדש", "cta": "כתבו לנו בוואטסאפ",
        })
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["post"]["uid"], first[0])
        self.assertEqual([post["uid"] for post in self.current_posts()], first)
        # The old UTM content is kept (old matching keeps working).
        self.assertEqual(self.current_posts()[0]["utm"]["utm_content"], "p1-חלות-לשבת")
        # When the next week is written, the old posts get the same uids stored.
        self.write_week(2, PostsModel(lambda prompt: [written(2)]))
        stored = self.stored(strategy)
        self.assertEqual([post["uid"] for post in stored[:2]], first)
        self.assertNotIn(stored[2]["uid"], first)

    def test_new_codes_come_from_the_uid_and_do_not_move_with_edits(self):
        self.business.whatsapp_number_e164 = "+972501234567"
        self.db.commit()
        self.month([dict(post) for post in self.OLD], status={"1": "done", "2": "pending", "3": "pending", "4": "pending"})
        self.write_week(2, PostsModel(lambda prompt: [written(2, primary_outlet="facebook", outlets=["facebook"])]))
        post = self.current_posts()[2]
        uid = post["uid"]
        self.assertEqual(post["utm"]["utm_content"], f"p-{uid}")
        self.assertEqual(post["whatsapp_source_key"], f"fb-post-{uid}")
        self.assertIn(f"utm_content=p-{uid}", post["tracking_url"])
        link = self.client.get("/whatsapp/link/post/2").json()["link"]
        self.assertEqual(link["source_key"], f"fb-post-{uid}")
        self.assertEqual(link["tag"], f"FB-POST-{uid[:5].upper()}")
        # A new title and even a new channel keep the code already handed out.
        self.client.post("/strategy/posts/save", json={
            "post_index": 2, "title": "שם אחר", "format": "image", "caption": "כיתוב", "cta": "כתבו לנו בוואטסאפ",
            "primary_outlet": "instagram",
        })
        again = self.client.get("/whatsapp/link/post/2").json()["link"]
        self.assertEqual(again["code"], link["code"])
        edited = self.current_posts()[2]
        self.assertEqual((edited["uid"], edited["utm"]["utm_content"]), (uid, f"p-{uid}"))
        self.assertEqual(edited["channel"], "instagram")
        # An old post still uses its index-based code.
        old = self.client.get("/whatsapp/link/post/0").json()["link"]
        self.assertEqual(old["source_key"], f"ig-post-{YEAR}{MONTH:02d}-1")


# --- 4. results back onto the post, compare, learning ------------------------------------


class ResultsTest(ConnectedTestCase):
    def setUp(self):
        super().setUp()
        self.previous = self.month([
            stored_post("חלות לשבת", uid="aaaaaaaaa1", caption="חלות לשבת, טריות מהתנור כל בוקר",
                        published_at=f"{PREV_YEAR}-{PREV_MONTH:02d}-05T10:00:00"),
        ], year=PREV_YEAR, month=PREV_MONTH)
        self.current = self.month([
            stored_post("מארז חג", uid="bbbbbbbbb2", caption="מארז חג ב-60 ₪, טרי מהתנור לשולחן החג"),
            stored_post("סדנת אפייה", uid="ccccccccc3", cta="להרשמה באתר", mix_type="value"),
            stored_post("פוסט שלא נמדד", uid="ddddddddd4", cta="לפרטים", channel="facebook"),
            stored_post("עוד לא פורסם", uid="eeeeeeeee5", published=False),
        ])
        self.add_clicks("ig-post-aaaaaaaaa1", 14)
        self.add_clicks("ig-post-bbbbbbbbb2", 21)
        self.add_clicks("ig-post-eeeeeeeee5", 0)  # the link exists, the post is not out yet

    def connect_ga4(self):
        self.db.add(Integration(business_id=self.business.id, provider="ga4", status="connected",
                                external_id="properties/1", access_token_enc="enc"))
        self.db.commit()

    def sync(self, campaigns: list[dict]):
        report = {"campaigns": campaigns, "pages": [], "channels": []}
        with mock.patch.object(performance_router, "tokens_for", return_value=("a", "r", None)), \
                mock.patch.object(ga4_service, "fetch_report", return_value=report), \
                mock.patch.object(performance_router, "diagnose", return_value={}), \
                mock.patch.object(cp, "lite_json", side_effect=RuntimeError("offline")):
            response = self.client.post("/performance/sync")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_sync_writes_results_compare_and_learning_and_null_when_unmatched(self):
        self.connect_ga4()
        body = self.sync([{"sessionCampaignName": f"isramarket-{YEAR}-{MONTH:02d}", "sessionManualAdContent": "p-ccccccccc3",
                           "sessionSource": "instagram", "sessions": "7", "conversions": "2"}])
        self.assertEqual(body["post_results"]["updated"], 3)
        posts = self.current_posts()
        box, workshop, unmatched, not_out = posts
        self.assertEqual(box["results"]["value"], 21)
        self.assertEqual(box["results"]["whatsapp_clicks"], 21)
        self.assertEqual(box["results"]["matched_by"], ["whatsapp_code"])
        self.assertTrue(box["results"]["updated_at"])
        # Same mix type and channel, measured the same way, an earlier month.
        self.assertEqual(box["results"]["compare"], {"label": "בפוסט דומה", "value": 14, "uid": "aaaaaaaaa1", "direction": "above"})
        self.assertEqual(box["lifecycle"], "measured")
        self.assertEqual(box["learning"], "21 לחיצות לוואטסאפ, יותר מהפוסט הדומה (14). מה היה רק בפוסט הזה: מחיר בטקסט.")
        self.assertEqual((workshop["results"]["value"], workshop["results"]["visits"], workshop["results"]["conversions"]),
                         (7, 7, 2))
        self.assertEqual(workshop["results"]["matched_by"], ["utm"])
        self.assertIsNone(workshop["results"]["compare"])
        self.assertEqual(workshop["learning"], "7 כניסות לאתר. זה הפוסט הראשון מהסוג הזה שמדדנו, נשווה אליו את הבאים.")
        # Nothing matched: no results at all, not zeros.
        self.assertIsNone(unmatched["results"])
        self.assertEqual(unmatched["lifecycle"], "published")
        self.assertIsNone(unmatched["learning"])
        # A link nobody could tap yet is unknown, not 0.
        self.assertIsNone(not_out["results"])
        previous = self.stored(self.previous)[0]
        self.assertEqual(previous["results"]["value"], 14)

    def test_instagram_numbers_by_the_posts_link_and_earlier_values_are_kept(self):
        self.db.add(InstagramPost(business_id=self.business.id, media_id="m1",
                                  permalink="https://www.instagram.com/p/ddddddddd4", caption="", reach=320, saved=None))
        self.db.commit()
        cp.refresh_results(self.db, self.business)
        self.db.commit()
        unmatched = self.current_posts()[2]
        self.assertEqual(unmatched["results"]["reach"], 320)
        self.assertEqual(unmatched["results"]["value"], 320)  # a Facebook "לפרטים" post is measured by reach
        self.assertNotIn("saves", unmatched["results"])  # Meta gave no number: absent, never 0
        self.assertEqual(unmatched["results"]["matched_by"], ["instagram_link"])
        # Next refresh, the media row is gone from the window: the earlier number stays.
        self.db.query(InstagramPost).delete()
        self.db.commit()
        cp.refresh_results(self.db, self.business)
        self.db.commit()
        self.assertEqual(self.current_posts()[2]["results"]["reach"], 320)

    def test_whatsapp_only_still_writes_results(self):
        self.business.whatsapp_number_e164 = "+972501234567"
        self.db.commit()
        with mock.patch.object(cp, "lite_json", side_effect=RuntimeError("offline")):
            response = self.client.post("/performance/sync")
        self.assertEqual(response.status_code, 400)  # nothing connected: same answer as before
        self.assertEqual(self.current_posts()[0]["results"]["value"], 21)


class LearningTest(ConnectedTestCase):
    FACTS = {"ref": "u1", "metric": "whatsapp_clicks", "value": 21, "compare": 14, "direction": "above",
             "only_here": "מחיר בטקסט", "only_there": ""}

    def phrase(self, text: str) -> str:
        reply = json.dumps({"lines": [{"ref": "u1", "text": text}]}, ensure_ascii=False)
        with mock.patch.object(cp, "lite_json", return_value=reply):
            return cp.phrase_learnings([self.FACTS])["u1"]

    def test_the_plain_sentence_when_the_model_is_unavailable(self):
        with mock.patch.object(cp, "lite_json", side_effect=RuntimeError("402 RESOURCE_EXHAUSTED")):
            line = cp.phrase_learnings([self.FACTS])["u1"]
        self.assertEqual(line, "21 לחיצות לוואטסאפ, יותר מהפוסט הדומה (14). מה היה רק בפוסט הזה: מחיר בטקסט.")

    def test_a_phrase_is_used_only_when_it_keeps_the_facts(self):
        plain = cp.template_learning(self.FACTS)
        self.assertEqual(self.phrase("21 לחיצות, יותר מהפוסט הדומה (14). כאן היה מחיר בטקסט."),
                         "21 לחיצות, יותר מהפוסט הדומה (14). כאן היה מחיר בטקסט.")
        self.assertEqual(self.phrase("21 לחיצות, פי 3 מהרגיל."), plain)  # a number we never gave
        self.assertEqual(self.phrase("21 לחיצות בגלל המחיר בטקסט, יותר מ-14."), plain)  # a cause
        self.assertEqual(self.phrase("הרבה יותר לחיצות מהפוסט הדומה."), plain)  # our number is gone
        self.assertEqual(self.phrase(""), plain)

    def test_templates(self):
        below = {**self.FACTS, "value": 4, "direction": "below", "only_here": "", "only_there": "ריל"}
        self.assertEqual(cp.template_learning(below), "4 לחיצות לוואטסאפ, פחות מהפוסט הדומה (14). מה היה רק בפוסט הדומה: ריל.")
        similar = {**self.FACTS, "value": 15, "direction": "similar"}
        self.assertEqual(cp.template_learning(similar), "15 לחיצות לוואטסאפ, בערך כמו הפוסט הדומה (14).")
        one = {**self.FACTS, "metric": "saves", "value": 1, "compare": None, "direction": "first"}
        self.assertEqual(cp.template_learning(one), "שמירה אחת. זה הפוסט הראשון מהסוג הזה שמדדנו, נשווה אליו את הבאים.")

    def test_a_learning_is_phrased_once_until_its_facts_change(self):
        self.month([stored_post("מארז חג", uid="bbbbbbbbb2")])
        link = self.add_clicks("ig-post-bbbbbbbbb2", 5)
        reply = json.dumps({"lines": [{"ref": "bbbbbbbbb2", "text": "5 לחיצות לוואטסאפ, נשווה אליו את הבאים."}]},
                           ensure_ascii=False)
        with mock.patch.object(cp, "lite_json", return_value=reply) as lite:
            cp.refresh_results(self.db, self.business)
            self.db.commit()
            cp.refresh_results(self.db, self.business)
            self.db.commit()
        self.assertEqual(lite.call_count, 1)
        self.assertEqual(self.current_posts()[0]["learning"], "5 לחיצות לוואטסאפ, נשווה אליו את הבאים.")
        self.db.add(WhatsappClick(business_id=self.business.id, link_id=link.id, day="2000-01-01", ua_family="ios", count=3))
        self.db.commit()
        with mock.patch.object(cp, "lite_json", side_effect=RuntimeError("offline")) as lite:
            cp.refresh_results(self.db, self.business)
            self.db.commit()
        self.assertEqual(lite.call_count, 1)
        self.assertEqual(self.current_posts()[0]["learning"],
                         "8 לחיצות לוואטסאפ. זה הפוסט הראשון מהסוג הזה שמדדנו, נשווה אליו את הבאים.")


# --- 5. what worked, in every posts job and every rewrite ----------------------------------


class WhatWorkedTest(ConnectedTestCase):
    def measured_month(self):
        strategy = self.month([
            stored_post("מארז חג", uid="bbbbbbbbb2", caption="מארז חג ב-60 ₪, טרי מהתנור",
                        results={"value": 21, "whatsapp_clicks": 21, "metric": "whatsapp_clicks",
                                 "matched_by": ["whatsapp_code"]}),
            stored_post("חלות", uid="ccccccccc3", caption="חלות טריות מהתנור כל בוקר",
                        results={"value": 3, "whatsapp_clicks": 3, "metric": "whatsapp_clicks",
                                 "matched_by": ["whatsapp_code"]}),
        ], status={"1": "done", "2": "pending", "3": "pending", "4": "pending"})
        return strategy

    def test_no_measured_post_means_no_block(self):
        self.month(status=PENDING)
        model = PostsModel(lambda prompt: [written(1, applied_learning="B1")])
        self.write_week(1, model)
        self.assertNotIn("מה הצליח אצלכם עד עכשיו", model.prompts[0])
        self.assertIsNone(self.current_posts()[0]["informed_by_note"])

    def test_the_block_reaches_the_posts_job_and_a_real_learning_is_noted(self):
        self.measured_month()
        model = PostsModel(lambda prompt: [
            written(2, title="מארז שני", caption="מארז ב-80 ₪ לחג", applied_learning="B1"),
            written(2, title="בלי שום דבר ממנו", caption="חלות טריות", cta="לפרטים", format="carousel",
                    applied_learning="B1"),
            written(2, title="מזהה מומצא", caption="מארז ב-80 ₪", applied_learning="B7"),
        ])
        self.write_week(2, model)
        prompt = model.prompts[0]
        self.assertIn("מה הצליח אצלכם עד עכשיו", prompt)
        self.assertIn("[B1] הכי הצליח מבין 2 פוסטים שנמדדו בלחיצות לוואטסאפ: \"מארז חג\"", prompt)
        self.assertIn("21 לחיצות לוואטסאפ. מה היה בו: מחיר בטקסט, הזמנה לכתוב בוואטסאפ.", prompt)
        self.assertIn("- פחות הצליח: \"חלות\"", prompt)
        self.assertIn("3 לחיצות לוואטסאפ", prompt)
        noted, no_trait, invented = self.current_posts()[2:]
        self.assertEqual(noted["informed_by_note"], "עודכן לפי מה שהצליח אצלכם: מחיר בטקסט")
        self.assertEqual(noted["informed_by"], ["bbbbbbbbb2"])
        # The model said B1 but the post has nothing visible of it (only the same mix type).
        self.assertIsNone(no_trait["informed_by_note"])
        self.assertEqual(no_trait["informed_by"], [])
        # A ref that was never in the block.
        self.assertIsNone(invented["informed_by_note"])
        self.assertEqual(invented["informed_by"], [])

    def test_a_post_sharing_only_the_mix_type_is_not_informed(self):
        what = {"refs": {"B1": {"uid": "u", "traits": [("price_in_text", "מחיר בטקסט"), ("mix:product", "המוצרים")]}}}
        note, sources = cp.informed_note({"mix_type": "product", "caption": "בלי"}, what, "B1")
        self.assertEqual((note, sources), (None, []))

    def test_the_first_month_weeks_after_the_first_measured_post_get_the_block(self):
        # The month's own week-1 post is measured; week 2 of the same (first) month sees it.
        strategy = self.month([stored_post("מארז חג", uid="bbbbbbbbb2")], status={"1": "done", "2": "pending",
                                                                                 "3": "pending", "4": "pending"})
        self.add_clicks("ig-post-bbbbbbbbb2", 9)
        with mock.patch.object(cp, "lite_json", side_effect=RuntimeError("offline")):
            cp.refresh_results(self.db, self.business)
        self.db.commit()
        model = PostsModel(lambda prompt: [written(2)])
        self.write_week(2, model)
        self.assertIn("[B1] הפוסט היחיד שנמדד בלחיצות לוואטסאפ: \"מארז חג\"", model.prompts[0])
        self.assertIn("9 לחיצות לוואטסאפ", model.prompts[0])
        self.assertEqual(len(self.stored(strategy)), 2)

    def test_the_rewrite_gets_the_plan_card_results_and_what_worked(self):
        self.measured_month()
        prompts = []
        output = {"title": "מארז חדש", "hook": "h", "caption": "מארז ב-90 ₪", "cta": "כתבו לנו בוואטסאפ",
                  "overlay_text": "", "outlet_captions": {"instagram": "x", "facebook": "y", "whatsapp": "z"},
                  "inspiration_refs": [], "inspiration_note": "", "owner_fact": "המחיר של המארז", "applied_learning": "B1"}

        def lite(prompt, schema, **kwargs):
            prompts.append(prompt)
            return json.dumps(output, ensure_ascii=False)

        with mock.patch.object(strategy_service, "lite_json", side_effect=lite):
            response = self.client.post("/strategy/posts/rewrite", json={"post_index": 1, "tone": "punchy"})
        self.assertEqual(response.status_code, 200, response.text)
        prompt = prompts[0]
        self.assertIn("המטרה של החודש: הזמנות מראש לחנוכה.", prompt)
        self.assertIn("שבוע 1 בתוכנית: הלקוחות הקבועים.", prompt)
        self.assertIn("איך נדע אם הצליח: לחיצות לוואטסאפ.", prompt)
        self.assertIn("מה כבר נמדד בפוסט הזה: 3 לחיצות לוואטסאפ.", prompt)
        self.assertIn("[B1]", prompt)
        # The post being rewritten is not its own learning: only the other post is listed.
        self.assertNotIn("\"חלות\"", prompt)
        post = response.json()["post"]
        self.assertEqual(post["uid"], "ccccccccc3")
        self.assertEqual(post["informed_by_note"], "עודכן לפי מה שהצליח אצלכם: מחיר בטקסט")
        self.assertEqual((post["owner_fact"], post["owner_fact_done"]), ("המחיר של המארז", False))
        # Already published (and measured): nothing is asked of the owner any more.
        self.assertEqual(post["owner_needs"], [])
        self.assertEqual(post["lifecycle"], "measured")
        self.assertEqual(post["outlet_captions"]["instagram"], "מארז ב-90 ₪")


# --- 6. posts from before all this --------------------------------------------------------


class OldPostsTest(ConnectedTestCase):
    def test_a_month_of_old_posts_reads_with_honest_defaults(self):
        old_core = {"theme": "חודש ישן", "weekly_breakdown": [{"week": 1, "focus": "פתיחה"}],
                    "monthly_horizon_plan": {"hypothesis": "השערה בלי פסיק"}}
        self.month([
            {"week": 1, "title": "פוסט ישן", "format": "reel", "caption": "כיתוב", "cta": "לפרטים",
             "primary_outlet": "tiktok", "approval_status": "approved", "published_url": "https://x.example/p/1"},
            {"title": "בלי שבוע"},
        ], core=old_core)
        posts = self.current_posts()
        first, second = posts
        self.assertEqual(first["channel"], "instagram")
        self.assertEqual(first["plan_link"], {"goal": "חודש ישן", "week": 1, "week_focus": "פתיחה"})
        self.assertEqual(first["why_line"], "בשביל חודש ישן.")
        self.assertIsNone(first["mix_type"])
        self.assertIsNone(first["results"])
        self.assertIsNone(first["learning"])
        self.assertIsNone(first["informed_by_note"])
        self.assertIsNone(first["featured_item_id"])
        self.assertEqual(first["lifecycle"], "published")
        self.assertEqual(second["plan_link"]["week"], None)
        self.assertIn(second["lifecycle"], cp.LIFECYCLES)
        queue = self.client.get("/publish/queue")
        self.assertEqual(queue.status_code, 200, queue.text)
        calendar = self.client.get("/calendar", params={"year": YEAR, "month": MONTH}).json()
        self.assertEqual(calendar["roadmap"]["posts"][0]["lifecycle"], "published")
        # The refresh tolerates them too.
        cp.refresh_results(self.db, self.business)


if __name__ == "__main__":
    unittest.main()
