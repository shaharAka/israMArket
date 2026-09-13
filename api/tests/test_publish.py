"""Tests for the publishing handoff.

Hermetic: a throwaway SQLite file per test and no network at all. The Meta capability is
exercised by seeding the *stored grant* exactly the way the OAuth callback stores it, so
the tests prove the answer comes from the grant and not from a constant.

The one thing these tests deliberately do not assert is that anything gets published:
this product cannot post to Instagram or Facebook, and the suite pins that down as data
(`capability["auto_publish"] is False`) instead of pretending otherwise.
"""

import shutil
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Audience, Business, Integration, Strategy, User
from app.services import meta as meta_service
from app.services import publish as publish_service
from app.services.jsonutil import dumps, loads

TODAY = date.today()
QUEUE_KEYS = ("due", "upcoming", "unscheduled", "awaiting_approval", "published")

PLAN = {
    "weekly_posts": 4,
    "format_mix": {"formats": ["reel", "single_image", "carousel"]},
    "ads_guidance": "תקציב בטווח סביר לפרסום ממומן.",
    "mix_note": "דגש על קרוסלות הצעה ורילס עם CTA ברור.",
    "monthly_budget_ils": 2500,
    "primary_goal": "sales",
    "conversion_unit": "רכישה",
    "business_model": "products",
    "stage": "validation",
    "realistic_roas": [1.8, 3.2],
    "expected_impressions": [45000, 138000],
    "expected_clicks": [555, 2083],
    "expected_purchases": [11, 31],
    "warnings": ["בתקציב הזה צפויים פחות מ-50 אירועי רכישה בחודש, ולכן המטרה היא איסוף נתונים."],
    "assumptions": ["CPM בישראל 18-55 ₪ לאלף חשיפות"],
    "source": "https://example.invalid/source",
}

USP = {
    "usp": "חלה מחמצת שנאפית לפני הזריחה",
    "growth_hypothesis": "אם נעלה ארבעה פוסטים בשבוע נגדיל את ההזמנות לפני שבת",
    "budget_allocation": {
        "meta_ads_share_pct": 60,
        "organic_production_share_pct": 25,
        "local_promotion_share_pct": 15,
        "guidance": "רוב התקציב למטא, ורבע להפקת תוכן.",
    },
    "growth_targets": ["להגדיל מכירות", "להביא לקוחות חדשים"],
}


def day(offset: int) -> str:
    return (TODAY + timedelta(days=offset)).isoformat()


def make_post(title: str, **overrides) -> dict:
    item = {
        "week": 1,
        "format": "image",
        "title": title,
        "angle": "טריות",
        "hook": "מהתנור ישר לשולחן",
        "caption": "כל שישי אנחנו מוציאים חלות חמות",
        "cta": "להזמנות",
        "primary_outlet": "instagram",
        "outlets": ["instagram", "facebook"],
        "date_hint": "2026-03-06",
        "approval_status": "review",
        "published_url": "",
        "published_at": None,
        "image_url": "",
        "utm": {
            "utm_source": "instagram",
            "utm_medium": "organic",
            "utm_campaign": f"isramarket-{TODAY.year}-{TODAY.month:02d}",
            "utm_content": f"p-{title}",
        },
        "tracking_url": "https://bakery.example/?utm_source=instagram&utm_medium=organic",
    }
    item.update(overrides)
    return item


class PublishTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-publish-"))
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

        self.business = Business(
            user_id=self.owner.id,
            name="מאפיית תום",
            website_url="https://bakery.example",
            business_type="מאפייה",
            business_model="products",
            primary_goal="sales",
            monthly_budget_ils=2500,
            scraped_profile_json=dumps(
                {
                    "brand_language": {"voice": "חם ואישי"},
                    "growth_targets": ["להגדיל מכירות ב-20% ברבעון", "להביא 30 לקוחות חדשים"],
                }
            ),
        )
        self.rival = Business(user_id=self.other.id, name="מתחרה בע״מ", website_url="https://rival.example")
        self.db.add_all([self.business, self.rival])
        self.db.commit()

        self.audience = Audience(
            business_id=self.business.id,
            name="זוגות צעירים",
            summary="מחפשים משהו טרי לשולחן השבת",
            needs_json=dumps(["משהו טרי", "מתנה יפה"]),
            where_json=dumps(["אינסטגרם"]),
            targeting_json=dumps(
                {"interests": ["אפייה ביתית"], "keywords": [], "age_range": "25-40", "gender": "", "geo": "תל אביב"}
            ),
            priority="primary",
            source="manual",
            is_primary=1,
        )
        self.db.add(self.audience)
        self.db.commit()

        self.owner_posts = [
            make_post("פוסט מאושר להיום", approval_status="approved", scheduled_for=day(0)),
            make_post(
                "פוסט מאושר שעבר זמנו",
                approval_status="approved",
                scheduled_for=day(-4),
                primary_outlet="facebook",
                image_url="/media/1/a.png",
            ),
            make_post("פוסט מתוזמן לעתיד", approval_status="approved", scheduled_for=day(6)),
            make_post("פוסט בלי תאריך", approval_status="approved"),
            make_post("פוסט שממתין לאישור", approval_status="review", scheduled_for=day(-2)),
            make_post(
                "פוסט שפורסם",
                approval_status="approved",
                scheduled_for=day(3),
                published_url="https://instagram.com/p/abc",
                published_at="2026-03-01T09:00:00",
            ),
            make_post(
                "פוסט שפורסם בלי אישור",
                approval_status="review",
                published_url="https://instagram.com/p/def",
                published_at="2026-03-02T09:00:00",
            ),
            make_post(
                "פוסט מתוזמן מאוחר יותר",
                approval_status="approved",
                scheduled_for=day(9),
                primary_outlet="facebook",
            ),
        ]
        self.strategy = self.seed_strategy(self.business, self.owner_posts, plan=PLAN, usp=USP)
        self.rival_strategy = self.seed_strategy(
            self.rival,
            [make_post("פוסט סודי של המתחרה", approval_status="approved", scheduled_for=day(-1))],
        )

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: self.owner
        self.client = TestClient(app)
        self.addCleanup(self._cleanup)

    def _cleanup(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()
        shutil.rmtree(self.tmp, ignore_errors=True)

    # --- helpers ------------------------------------------------------------------

    def seed_strategy(self, business, posts, plan=None, usp=None) -> Strategy:
        extra: dict = {"roadmap": {"posts": [dict(item) for item in posts], "theme": "חודש של חלות"}}
        if plan is not None:
            extra["posting_plan"] = plan
        row = Strategy(
            business_id=business.id,
            year=TODAY.year,
            month=TODAY.month,
            usp_json=dumps(usp or {}),
            calendar_json=dumps([]),
            roadmap_json=dumps(extra),
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def stored_posts(self, strategy: Strategy | None = None) -> list[dict]:
        row = strategy or self.db.query(Strategy).filter(Strategy.business_id == self.business.id).first()
        return loads(row.roadmap_json, {}).get("roadmap", {}).get("posts", [])

    def connect(self, provider: str, scopes=None, status: str = "connected", business=None) -> Integration:
        item = Integration(
            business_id=(business or self.business).id,
            provider=provider,
            status=status,
            external_id="12345",
            display_name=provider,
            access_token_enc="encrypted",
            refresh_token_enc="encrypted",
            extra_json=dumps({"scopes": list(scopes or [])}),
        )
        self.db.add(item)
        self.db.commit()
        return item

    def set_scopes(self, provider: str, scopes, business=None) -> None:
        target = business or self.business
        item = (
            self.db.query(Integration)
            .filter(Integration.business_id == target.id, Integration.provider == provider)
            .first()
        )
        item.extra_json = dumps({**(loads(item.extra_json, {}) or {}), "scopes": list(scopes)})
        self.db.commit()

    def as_user(self, user) -> None:
        app.dependency_overrides[get_current_user] = lambda: user

    def queue(self) -> dict:
        response = self.client.get("/publish/queue")
        self.assertEqual(response.status_code, 200)
        return response.json()

    def titles(self, payload: dict) -> list[str]:
        return [item["title"] for key in QUEUE_KEYS for item in payload[key]]

    # --- 1. scheduling ------------------------------------------------------------

    def test_scheduling_sets_the_date_and_records_when_it_was_set(self):
        response = self.client.post(
            "/strategy/posts/schedule", json={"post_index": 3, "scheduled_for": day(5)}
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["post"]["scheduled_for"], day(5))
        self.assertTrue(body["post"]["scheduled_at"])
        # The serialized strategy the client already holds stays in step with the post.
        self.assertEqual(body["strategy"]["roadmap"]["posts"][3]["scheduled_for"], day(5))
        self.assertEqual(self.stored_posts()[3]["scheduled_for"], day(5))
        self.assertTrue(self.stored_posts()[3]["scheduled_at"])

    def test_scheduling_clears_the_date_with_an_empty_string(self):
        self.client.post("/strategy/posts/schedule", json={"post_index": 3, "scheduled_for": day(5)})
        response = self.client.post(
            "/strategy/posts/schedule", json={"post_index": 3, "scheduled_for": ""}
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["post"]["scheduled_for"], "")
        self.assertIsNone(response.json()["post"]["scheduled_at"])
        self.assertEqual(self.stored_posts()[3]["scheduled_for"], "")

    def test_scheduling_accepts_a_padded_date(self):
        self.assertEqual(publish_service.parse_scheduled_for(" 2026-03-15 "), "2026-03-15")

    def test_an_invalid_date_is_rejected_in_hebrew_and_changes_nothing(self):
        for bad in ("15/03/2026", "2026-13-01", "2026-02-30", "20260315", "מחר", "2026-3-5"):
            with self.subTest(bad=bad):
                response = self.client.post(
                    "/strategy/posts/schedule", json={"post_index": 3, "scheduled_for": bad}
                )
                self.assertEqual(response.status_code, 400)
                self.assertIn("תאריך", response.json()["detail"])
        self.assertEqual(self.stored_posts()[3].get("scheduled_for", ""), "")

    def test_scheduling_a_post_that_is_not_in_the_plan_is_a_404(self):
        response = self.client.post(
            "/strategy/posts/schedule", json={"post_index": 50, "scheduled_for": day(1)}
        )
        self.assertEqual(response.status_code, 404)
        self.assertIn("הפוסט לא נמצא", response.json()["detail"])

    # --- 2. the queue -------------------------------------------------------------

    def test_due_holds_only_approved_posts_scheduled_today_or_earlier(self):
        payload = self.queue()
        self.assertEqual(
            [item["title"] for item in payload["due"]],
            ["פוסט מאושר שעבר זמנו", "פוסט מאושר להיום"],
        )
        for item in payload["due"]:
            self.assertEqual(item["approval_status"], "approved")
            self.assertEqual(item["published_url"], "")

    def test_upcoming_is_ordered_by_date(self):
        payload = self.queue()
        self.assertEqual(
            [item["title"] for item in payload["upcoming"]],
            ["פוסט מתוזמן לעתיד", "פוסט מתוזמן מאוחר יותר"],
        )
        self.assertEqual(
            [item["scheduled_for"] for item in payload["upcoming"]],
            sorted(item["scheduled_for"] for item in payload["upcoming"]),
        )

    def test_an_unapproved_post_never_appears_in_due(self):
        payload = self.queue()
        self.assertNotIn("פוסט שממתין לאישור", [item["title"] for item in payload["due"]])
        self.assertIn("פוסט שממתין לאישור", [item["title"] for item in payload["awaiting_approval"]])

    def test_a_post_with_no_date_is_unscheduled_not_due(self):
        payload = self.queue()
        self.assertEqual([item["title"] for item in payload["unscheduled"]], ["פוסט בלי תאריך"])

    def test_published_posts_land_in_published_and_nowhere_else(self):
        payload = self.queue()
        published = [item["title"] for item in payload["published"]]
        self.assertEqual(sorted(published), ["פוסט שפורסם", "פוסט שפורסם בלי אישור"])
        elsewhere = [
            item["title"]
            for key in QUEUE_KEYS
            if key != "published"
            for item in payload[key]
        ]
        for title in published:
            self.assertNotIn(title, elsewhere)
        # And a post with no published_url is never counted as published.
        self.assertNotIn("פוסט מאושר להיום", published)

    def test_an_unscheduled_post_becomes_due_once_approved_and_scheduled_for_today(self):
        self.assertEqual([item["title"] for item in self.queue()["unscheduled"]], ["פוסט בלי תאריך"])
        self.client.post("/strategy/posts/approve", json={"post_index": 3, "approved": True})
        self.client.post("/strategy/posts/schedule", json={"post_index": 3, "scheduled_for": day(0)})
        payload = self.queue()
        self.assertIn("פוסט בלי תאריך", [item["title"] for item in payload["due"]])
        self.assertNotIn("פוסט בלי תאריך", [item["title"] for item in payload["unscheduled"]])

    def test_counts_add_up(self):
        payload = self.queue()
        counts = payload["counts"]
        self.assertEqual(counts["total"], len(self.owner_posts))
        self.assertEqual(counts["total"], sum(counts[key] for key in QUEUE_KEYS))
        for key in QUEUE_KEYS:
            self.assertEqual(counts[key], len(payload[key]))
        self.assertEqual(counts["due"], 2)
        self.assertEqual(counts["upcoming"], 2)
        self.assertEqual(counts["unscheduled"], 1)
        self.assertEqual(counts["awaiting_approval"], 1)
        self.assertEqual(counts["published"], 2)

    def test_the_brief_of_a_post_carries_the_fields_the_queue_promises(self):
        payload = self.queue()
        brief = next(item for item in payload["due"] if item["title"] == "פוסט מאושר שעבר זמנו")
        self.assertEqual(
            sorted(brief),
            sorted(
                [
                    "index",
                    "title",
                    "format",
                    "primary_outlet",
                    "outlets",
                    "date_hint",
                    "scheduled_for",
                    "approval_status",
                    "published_url",
                    "published_at",
                    "has_image",
                    "tracking_url",
                ]
            ),
        )
        self.assertTrue(brief["has_image"])
        self.assertEqual(brief["primary_outlet"], "facebook")
        self.assertEqual(brief["outlets"], ["instagram", "facebook"])
        self.assertEqual(brief["tracking_url"], "https://bakery.example/?utm_source=instagram&utm_medium=organic")

    def test_the_queue_carries_the_same_capability_object_as_the_endpoint(self):
        self.assertEqual(self.queue()["capability"], self.client.get("/publish/capability").json())

    # --- 3. capability ------------------------------------------------------------

    def test_capability_is_false_with_only_the_read_scopes_we_request(self):
        self.assertFalse(set(meta_service.META_SCOPES) & set(publish_service.PUBLISH_SCOPES))
        self.connect("meta", scopes=list(meta_service.META_SCOPES))
        capability = self.client.get("/publish/capability").json()
        self.assertFalse(capability["auto_publish"])
        self.assertTrue(capability["can_schedule"])
        self.assertEqual(capability["connected"], {"meta": True, "ga4": False})
        self.assertEqual(capability["missing"], ["instagram_content_publish", "pages_manage_posts"])
        self.assertTrue(capability["reasons"])
        joined = " ".join(capability["reasons"])
        self.assertIn("מטא", joined)
        self.assertIn("אישור", joined)
        self.assertIn("ידנית", joined)
        for word in ("OAuth", "App Review", "בקרוב"):
            self.assertNotIn(word, joined)

    def test_capability_without_any_connection_says_meta_is_not_connected(self):
        capability = self.client.get("/publish/capability").json()
        self.assertFalse(capability["auto_publish"])
        self.assertEqual(capability["connected"], {"meta": False, "ga4": False})
        self.assertIn("לא מחובר", " ".join(capability["reasons"]))
        self.assertEqual(capability["missing"], list(publish_service.PUBLISH_SCOPES))

    def test_capability_flips_true_when_meta_actually_granted_a_publish_scope(self):
        self.connect("meta", scopes=list(meta_service.META_SCOPES))
        self.assertFalse(self.client.get("/publish/capability").json()["auto_publish"])

        self.set_scopes("meta", list(meta_service.META_SCOPES) + ["instagram_content_publish"])
        capability = self.client.get("/publish/capability").json()
        self.assertTrue(capability["auto_publish"])
        self.assertEqual(capability["missing"], ["pages_manage_posts"])
        self.assertIn("הרשאה", " ".join(capability["reasons"]))

        # Read from the stored grant, not from anything hardcoded: take it away and the
        # answer goes back to false.
        self.set_scopes("meta", list(meta_service.META_SCOPES))
        self.assertFalse(self.client.get("/publish/capability").json()["auto_publish"])

    def test_a_publish_scope_on_a_disconnected_grant_does_not_count(self):
        self.connect("meta", scopes=["instagram_content_publish", "pages_manage_posts"], status="select_page")
        capability = self.client.get("/publish/capability").json()
        self.assertFalse(capability["auto_publish"])
        self.assertFalse(capability["connected"]["meta"])

    def test_another_business_publish_grant_does_not_leak_in(self):
        self.connect("meta", scopes=["instagram_content_publish"], business=self.rival)
        capability = self.client.get("/publish/capability").json()
        self.assertFalse(capability["auto_publish"])
        self.assertEqual(capability["connected"], {"meta": False, "ga4": False})

    def test_a_connected_ga4_is_reported_separately(self):
        self.connect("ga4", scopes=["https://www.googleapis.com/auth/analytics.readonly"])
        self.assertEqual(
            self.client.get("/publish/capability").json()["connected"], {"meta": False, "ga4": True}
        )

    # --- 4. the campaign brief ----------------------------------------------------

    def test_the_brief_carries_the_budget_and_allocation_of_the_stored_plan(self):
        brief = self.client.get("/publish/brief").json()
        text = brief["text"]
        self.assertEqual(brief["budget"]["monthly_budget_ils"], 2500)
        self.assertEqual(brief["budget"]["stage"], "validation")
        self.assertEqual([row["share_pct"] for row in brief["allocation"]], [60, 25, 15])
        self.assertEqual([row["amount_ils"] for row in brief["allocation"]], [1500, 625, 375])

        self.assertIn("2,500", text)
        self.assertIn("שלב בדיקה", text)
        self.assertIn("60%", text)
        self.assertIn("1,500", text)
        self.assertIn("רוב התקציב למטא", text)
        self.assertIn("4 פוסטים בשבוע", text)
        self.assertIn("reel", text)
        self.assertIn("אינסטגרם: 6 פוסטים", text)
        self.assertIn("פייסבוק: 2 פוסטים", text)
        self.assertIn("45,000-138,000", text)
        self.assertIn("1.8-3.2", text)
        self.assertIn("להגדיל מכירות ב-20% ברבעון", text)

    def test_the_brief_names_the_audiences_and_the_tracking_convention(self):
        text = self.client.get("/publish/brief").json()["text"]
        self.assertIn("זוגות צעירים", text)
        self.assertIn("הקהל הראשי", text)
        self.assertIn("אזור: תל אביב", text)
        self.assertIn("גיל: 25-40", text)
        self.assertIn("תחומי עניין: אפייה ביתית", text)
        self.assertIn("משהו טרי", text)
        self.assertIn(f"utm_campaign: isramarket-{TODAY.year}-{TODAY.month:02d}", text)
        self.assertIn("utm_medium: organic", text)
        self.assertIn("https://bakery.example/", text)

    def test_the_brief_omits_figures_the_plan_does_not_have_instead_of_inventing_them(self):
        self.strategy.roadmap_json = dumps(
            {
                "roadmap": {
                    "posts": [make_post("פוסט בלי מספרים", approval_status="approved", scheduled_for=day(0))],
                    "theme": "נושא החודש",
                },
                "posting_plan": {"weekly_posts": 3, "format_mix": {"formats": ["image"]}},
            }
        )
        self.strategy.usp_json = dumps({})
        self.business.monthly_budget_ils = 0
        self.db.commit()

        brief = self.client.get("/publish/brief").json()
        text = brief["text"]
        self.assertIsNone(brief["budget"])
        self.assertEqual(brief["allocation"], [])
        self.assertEqual(brief["expectations"], {})
        self.assertIn("3 פוסטים בשבוע", text)
        # No money figure existed anywhere in the plan, so none may appear.
        self.assertNotIn("₪", text)
        for absent in ("תקציב", "חשיפות", "קליקים", "רכישות", "ROAS"):
            self.assertNotIn(absent, text)

    def test_the_brief_reports_a_service_business_without_inventing_purchases(self):
        plan = dict(PLAN)
        plan["conversion_unit"] = "פנייה (ליד)"
        plan["realistic_roas"] = [0.0, 0.0]
        plan["expected_purchases"] = [0, 0]
        self.strategy.roadmap_json = dumps(
            {"roadmap": {"posts": [make_post("פוסט")]}, "posting_plan": plan}
        )
        self.db.commit()

        brief = self.client.get("/publish/brief").json()
        text = brief["text"]
        self.assertNotIn("realistic_roas", brief["expectations"])
        self.assertNotIn("expected_purchases", brief["expectations"])
        self.assertIn("expected_clicks", brief["expectations"])
        self.assertNotIn("ROAS", text)
        self.assertNotIn("רכישות", text)

    def test_a_brief_with_nothing_stored_says_so_rather_than_showing_blank_lines(self):
        self.strategy.roadmap_json = dumps({"roadmap": {"posts": []}, "posting_plan": {}})
        self.strategy.usp_json = dumps({})
        self.business.monthly_budget_ils = 0
        self.business.scraped_profile_json = dumps({"brand_language": {"voice": "חם"}})
        self.db.query(Audience).delete()
        self.db.commit()
        brief = self.client.get("/publish/brief").json()
        text = brief["text"]
        self.assertIn("אין כאן נתונים", text)
        self.assertEqual(brief["audiences"], [])
        self.assertEqual(brief["priorities"], [])

    # --- 5. ownership -------------------------------------------------------------

    def test_the_queue_never_shows_another_business_posts(self):
        self.assertNotIn("פוסט סודי של המתחרה", self.titles(self.queue()))
        self.assertIn("פוסט מאושר להיום", self.titles(self.queue()))

    def test_each_owner_only_ever_sees_their_own_month(self):
        self.as_user(self.other)
        payload = self.queue()
        self.assertEqual(self.titles(payload), ["פוסט סודי של המתחרה"])
        self.assertNotIn("פוסט מאושר להיום", self.titles(payload))
        # The rival has one post, so an index that exists for the bakery does not exist here.
        response = self.client.post(
            "/strategy/posts/schedule", json={"post_index": 3, "scheduled_for": day(1)}
        )
        self.assertEqual(response.status_code, 404)
        self.as_user(self.owner)

    def test_a_business_without_a_strategy_is_a_404(self):
        stranger = User(email="stranger@example.com", password_hash="x", full_name="בלי תוכנית")
        self.db.add(stranger)
        self.db.flush()
        self.db.add(Business(user_id=stranger.id, name="עסק בלי תוכנית"))
        self.db.commit()
        self.as_user(stranger)
        for path in ("/publish/queue", "/publish/brief"):
            self.assertEqual(self.client.get(path).status_code, 404)
        # Capability needs no plan: it answers from the connection, and there is none.
        self.assertFalse(self.client.get("/publish/capability").json()["auto_publish"])
        self.as_user(self.owner)

    def test_the_publish_endpoints_require_a_login(self):
        app.dependency_overrides.pop(get_current_user, None)
        for path in ("/publish/queue", "/publish/capability", "/publish/brief"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 401)


if __name__ == "__main__":
    unittest.main()
