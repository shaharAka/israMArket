"""Tests for target audiences.

Hermetic: a throwaway SQLite file per test, two businesses, no network. The two model
calls in the product (`propose_audiences` and the post writer) are mocked, while the
measurement tests build their GA4/Meta payload through the real `performance._attribute`
— so the rollup is exercised against the attribution the product actually stores.
"""

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
from app.models import Audience, Business, Integration, PerformanceSnapshot, Strategy, User
from app.routers import performance as performance_router
from app.services import audiences as audiences_service
from app.services import strategy as strategy_service
from app.services.jsonutil import dumps

CAMPAIGN = "isramarket-2026-01"

PROPOSALS = {
    "audiences": [
        {
            "name": "זוגות צעירים לפני חתונה",
            "summary": "מחפשים מתנה או שירות לזוגיות בתחילת הדרך",
            "description": "מגיעים בחיפוש ובהמלצות, מחליטים לאט ומשווים בין ספקים.",
            "needs": ["משהו אישי ולא גנרי", "המלצה של מישהו שהם סומכים עליו"],
            "where": ["אינסטגרם", "קבוצות חתונה בפייסבוק"],
            "targeting": {
                "interests": ["חתונות", "עיצוב"],
                "keywords": ["מתנה לחתונה"],
                "age_range": "25-35",
                "gender": "הכל",
                "geo": "תל אביב והסביבה",
            },
            "priority": "primary",
        },
        {
            "name": "משפחות מהשכונה",
            "summary": "קונות לעצמן באמצע השבוע ובחגים",
            "description": "לקוחות חוזרים שמגיעים ברגל.",
            "needs": ["זמינות", "מחיר הוגן"],
            "where": ["קבוצת השכונה בוואטסאפ"],
            "targeting": {
                "interests": ["אוכל"],
                "keywords": [],
                "age_range": "30-50",
                "gender": "הכל",
                "geo": "השכונה",
            },
            "priority": "secondary",
        },
        {
            "name": "עסקים קטנים באזור",
            "summary": "צריכים ספק קבוע להזמנות מרוכזות",
            "description": "מזמינים בכמויות וחוזרים כל חודש.",
            "needs": ["חשבונית", "עמידה בזמנים"],
            "where": ["לינקדאון", "המלצות של בעלי עסקים"],
            "targeting": {
                "interests": [],
                "keywords": ["ספק לעסקים"],
                "age_range": "",
                "gender": "הכל",
                "geo": "מרכז",
            },
            "priority": "secondary",
        },
    ]
}


def post(
    index: int,
    title: str,
    *,
    utm_content: str = "",
    caption: str = "",
    published_url: str = "",
) -> dict:
    return {
        "week": 1,
        "format": "image",
        "title": title,
        "caption": caption or f"כיתוב עבור {title}",
        "published_url": published_url,
        "approval_status": "approved",
        "utm": {
            "utm_source": "instagram",
            "utm_medium": "organic",
            "utm_campaign": CAMPAIGN,
            "utm_content": utm_content or f"p{index}-{index}",
        },
    }


def model_post(index: int, audience_name: str) -> dict:
    return {
        "week": 1,
        "date_hint": "2026-01-05",
        "format": "image",
        "title": f"פוסט {index}",
        "angle": "זווית",
        "hook": "פתיחה",
        "caption": "כיתוב",
        "cta": "לפרטים",
        "calendar_tie": "",
        "goal_fit": "מכירות",
        "why_now": "כי עכשיו",
        "image_prompt": "a warm bakery photo",
        "overlay_text": "טרי מהתנור",
        "primary_outlet": "instagram",
        "outlets": ["instagram"],
        "metrics_to_watch": ["שמירות"],
        "stat_highlight": "100 חלות",
        "outlet_captions": {"instagram": "א", "facebook": "ב", "whatsapp": "ג"},
        "audience_name": audience_name,
    }


class AudienceTestCase(unittest.TestCase):
    """One isolated database, two businesses."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-audiences-"))
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
            offerings="חלות מחמצת ומאפים",
            location="תל אביב",
            business_model="products",
            primary_goal="sales",
            monthly_budget_ils=4500,
        )
        self.rival = Business(
            user_id=self.other.id, name="מתחרה", website_url="https://rival.example"
        )
        self.db.add_all([self.business, self.rival])
        self.db.commit()

        self.addCleanup(self._cleanup)

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: self.owner
        self.client = TestClient(app)

    def _cleanup(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()
        shutil.rmtree(self.tmp, ignore_errors=True)

    # --- helpers ------------------------------------------------------------------

    def add_audience(self, business=None, **fields) -> Audience:
        audience = Audience(
            business_id=(business or self.business).id,
            name=fields.pop("name", "קהל"),
            summary=fields.pop("summary", ""),
            description=fields.pop("description", ""),
            needs_json=fields.pop("needs_json", "[]"),
            where_json=fields.pop("where_json", "[]"),
            targeting_json=fields.pop("targeting_json", "{}"),
            priority=fields.pop("priority", "secondary"),
            source=fields.pop("source", "manual"),
            is_primary=fields.pop("is_primary", 0),
        )
        self.db.add(audience)
        self.db.commit()
        self.db.refresh(audience)
        return audience

    def add_strategy(self, posts: list[dict], business=None) -> Strategy:
        today = date.today()
        strategy = Strategy(
            business_id=(business or self.business).id,
            year=today.year,
            month=today.month,
            usp_json=dumps({"usp": "חלה מחמצת"}),
            calendar_json=dumps([]),
            roadmap_json=dumps({"roadmap": {"posts": posts}}),
        )
        self.db.add(strategy)
        self.db.commit()
        self.db.refresh(strategy)
        return strategy

    def add_snapshot(self, ga4_data: dict | None = None, meta_data: dict | None = None) -> PerformanceSnapshot:
        snap = PerformanceSnapshot(
            business_id=self.business.id,
            period_start="2026-01-01",
            period_end="2026-01-28",
            ga4_json=dumps(ga4_data or {}),
            meta_json=dumps(meta_data or {}),
            diagnostic_json=dumps({}),
        )
        self.db.add(snap)
        self.db.commit()
        self.db.refresh(snap)
        return snap

    def connect(self, provider: str) -> Integration:
        item = Integration(
            business_id=self.business.id,
            provider=provider,
            status="connected",
            external_id="12345",
            access_token_enc="encrypted",
        )
        self.db.add(item)
        self.db.commit()
        return item

    def stored_posts(self) -> list[dict]:
        strategy = self.db.query(Strategy).order_by(Strategy.id.desc()).first()
        return json.loads(strategy.roadmap_json)["roadmap"]["posts"]

    def rollup(self) -> dict:
        return self.client.get("/performance/latest").json()["audiences"]

    # --- ownership ----------------------------------------------------------------

    def test_foreign_audience_id_is_invisible_not_just_forbidden(self):
        """An id from another business must 404 on read, edit, delete, primary and tag —
        anything else confirms which ids exist and leaks another customer's segments."""
        self.add_strategy([post(1, "פוסט")])
        theirs = self.add_audience(business=self.rival, name="קהל של מישהו אחר", is_primary=1)

        self.assertEqual(self.client.patch(f"/audiences/{theirs.id}", json={"summary": "נגנוב"}).status_code, 404)
        self.assertEqual(self.client.delete(f"/audiences/{theirs.id}").status_code, 404)
        self.assertEqual(self.client.post(f"/audiences/{theirs.id}/primary").status_code, 404)
        tagged = self.client.post(
            "/strategy/posts/audience", json={"post_index": 0, "audience_id": theirs.id}
        )
        self.assertEqual(tagged.status_code, 404)
        self.assertNotIn("קהל של מישהו אחר", json.dumps(self.client.get("/audiences").json()))

        self.db.refresh(theirs)
        self.assertEqual(theirs.summary, "")
        self.assertEqual(theirs.is_primary, 1)
        self.assertIsNone(self.stored_posts()[0].get("audience_id"))
        self.assertEqual(self.db.query(Audience).filter_by(business_id=self.business.id).count(), 0)

    # --- generate -----------------------------------------------------------------

    def test_generate_persists_segments_and_keeps_the_manual_one(self):
        manual = self.add_audience(name="לקוחות חוזרים", summary="שלי", is_primary=1, priority="primary")

        with mock.patch.object(
            audiences_service, "strategy_json", return_value=json.dumps(PROPOSALS, ensure_ascii=False)
        ):
            response = self.client.post("/audiences/generate")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["generated"], 3)
        self.assertEqual(payload["kept_manual"], 1)
        self.assertIn("ידנית", payload["note"])  # it says so instead of duplicating quietly

        audiences = payload["audiences"]
        self.assertEqual(len(audiences), 4)
        by_source = {item["source"] for item in audiences}
        self.assertEqual(by_source, {"manual", "generated"})
        generated = [item for item in audiences if item["source"] == "generated"]
        self.assertEqual(len(generated), 3)

        # The fields the model filled survive as real lists and objects, in Hebrew.
        first = generated[0]
        self.assertEqual(first["name"], "זוגות צעירים לפני חתונה")
        self.assertEqual(first["needs"], ["משהו אישי ולא גנרי", "המלצה של מישהו שהם סומכים עליו"])
        self.assertEqual(first["where"][0], "אינסטגרם")
        self.assertEqual(first["targeting"]["geo"], "תל אביב והסביבה")
        self.assertEqual(first["targeting"]["age_range"], "25-35")
        self.assertNotEqual(first["created_at"], "")

        # The owner's own primary is an explicit choice and is not overruled.
        manual_out = next(item for item in audiences if item["id"] == manual.id)
        self.assertTrue(manual_out["is_primary"])
        self.assertEqual([item["id"] for item in audiences if item["is_primary"]], [manual.id])
        self.assertEqual([item["priority"] for item in audiences].count("primary"), 1)

        self.assertEqual(
            self.db.query(Audience).filter_by(business_id=self.business.id, source="generated").count(),
            3,
        )

    def test_generate_replaces_the_previous_generated_set_without_duplicates(self):
        with mock.patch.object(
            audiences_service, "strategy_json", return_value=json.dumps(PROPOSALS, ensure_ascii=False)
        ):
            first = self.client.post("/audiences/generate").json()
            second = self.client.post("/audiences/generate").json()

        self.assertEqual(len(first["audiences"]), 3)
        self.assertEqual(len(second["audiences"]), 3)
        self.assertEqual(second["replaced"], 3)
        self.assertEqual(
            self.db.query(Audience).filter_by(business_id=self.business.id).count(), 3
        )
        self.assertEqual(
            [item["name"] for item in second["audiences"]],
            [item["name"] for item in first["audiences"]],
        )

    def test_regenerating_keeps_posts_pointing_at_a_segment_that_still_exists(self):
        """A name that comes back unchanged is the same segment, so its posts keep it —
        including the rows the regenerated set replaced under different ids."""
        self.add_strategy([post(1, "פוסט")])
        with mock.patch.object(
            audiences_service, "strategy_json", return_value=json.dumps(PROPOSALS, ensure_ascii=False)
        ):
            self.client.post("/audiences/generate")
            target = next(
                item
                for item in self.client.get("/audiences").json()["audiences"]
                if item["name"] == "זוגות צעירים לפני חתונה"
            )
            self.client.post(
                "/strategy/posts/audience",
                json={"post_index": 0, "audience_id": target["id"]},
            )
            # A manual segment shifts the next generated ids, so the remap is real work
            # rather than the database handing the replacement the same rowid.
            self.client.post("/audiences", json={"name": "קהל ידני"})
            self.client.post("/audiences/generate")

        after = self.client.get("/audiences").json()["audiences"]
        matching = next(item for item in after if item["name"] == target["name"])
        self.assertNotEqual(matching["id"], target["id"])
        saved = self.stored_posts()[0]
        self.assertEqual(saved["audience_id"], matching["id"])
        self.assertEqual(saved["audience_name"], matching["name"])

    def test_generate_failure_is_reported_and_persists_nothing(self):
        with mock.patch.object(audiences_service, "strategy_json", return_value='{"audiences": []}'):
            response = self.client.post("/audiences/generate")
        self.assertEqual(response.status_code, 502)
        self.assertIn("קהלי יעד", response.json()["detail"])
        self.assertEqual(self.db.query(Audience).count(), 0)

    def test_proposals_are_grounded_in_the_business_and_forked_by_model(self):
        captured = {}

        def fake(prompt, schema):
            captured["prompt"] = prompt
            captured["schema"] = schema
            return json.dumps(PROPOSALS, ensure_ascii=False)

        business = {
            "name": "מאפיית תום",
            "business_type": "מאפייה",
            "offerings": "חלות מחמצת",
            "business_model": "products",
            "primary_goal": "sales",
            "monthly_budget_ils": 4500,
        }
        with mock.patch.object(audiences_service, "strategy_json", side_effect=fake):
            audiences_service.propose_audiences(business, {"voice": "חם ואישי"}, {"value_propositions": ["מחמצת"]})

        prompt = captured["prompt"]
        self.assertIn("חלות מחמצת", prompt)
        self.assertIn("חם ואישי", prompt)
        self.assertIn("אל תמציא", prompt)
        self.assertIn("מקטע קונים", prompt)  # the products fork
        priority_schema = captured["schema"]["properties"]["audiences"]["items"]["properties"]["priority"]
        self.assertEqual(priority_schema["enum"], ["primary", "secondary"])

        with mock.patch.object(audiences_service, "strategy_json", side_effect=fake):
            audiences_service.propose_audiences({**business, "business_model": "services"}, {}, {})
        self.assertIn("סוג לקוח", captured["prompt"])  # the services fork

    def test_parse_proposals_survives_a_rough_model_answer(self):
        parsed = audiences_service.parse_proposals(
            {
                "audiences": [
                    {"name": "  קהל   א  ", "needs": "לא רשימה", "priority": "PRIMARY"},
                    {"name": "קהל א", "summary": "כפילות"},
                    {"name": "", "summary": "בלי שם"},
                    "לא אובייקט",
                    {"name": "קהל ב", "targeting": {"keywords": ["מילה"], "age_range": "30-40"}},
                ]
            }
        )
        self.assertEqual([item["name"] for item in parsed], ["קהל א", "קהל ב"])
        self.assertEqual(parsed[0]["priority"], "primary")
        self.assertEqual(parsed[1]["priority"], "secondary")
        self.assertEqual(parsed[0]["needs"], [])
        self.assertEqual(parsed[1]["targeting"]["keywords"], ["מילה"])
        self.assertEqual(parsed[1]["targeting"]["geo"], "")

    # --- CRUD ---------------------------------------------------------------------

    def test_create_patch_and_delete(self):
        created = self.client.post(
            "/audiences",
            json={
                "name": "  זוגות צעירים  ",
                "summary": "מחפשים מתנה",
                "needs": ["משהו אישי"],
                "where": ["אינסטגרם", "קבוצת השכונה"],
                "targeting": {"interests": ["חתונות"], "age_range": "25-35"},
            },
        )
        self.assertEqual(created.status_code, 200)
        audience = created.json()["audience"]
        self.assertEqual(audience["name"], "זוגות צעירים")
        self.assertEqual(audience["source"], "manual")
        self.assertTrue(audience["is_primary"])  # the first segment is the primary one
        self.assertEqual(audience["priority"], "primary")
        self.assertEqual(audience["targeting"]["interests"], ["חתונות"])
        self.assertEqual(audience["where"], ["אינסטגרם", "קבוצת השכונה"])

        patched = self.client.patch(
            f"/audiences/{audience['id']}",
            json={"summary": "עודכן", "targeting": {"geo": "תל אביב"}},
        ).json()["audience"]
        self.assertEqual(patched["summary"], "עודכן")
        self.assertEqual(patched["needs"], ["משהו אישי"])  # untouched fields survive
        self.assertEqual(patched["targeting"]["geo"], "תל אביב")
        self.assertEqual(patched["targeting"]["interests"], [])

        self.assertEqual(self.client.delete(f"/audiences/{audience['id']}").json()["ok"], True)
        self.assertEqual(self.client.delete(f"/audiences/{audience['id']}").status_code, 404)

    def test_exactly_one_primary_per_business(self):
        first = self.client.post("/audiences", json={"name": "קהל א"}).json()["audience"]
        second = self.client.post("/audiences", json={"name": "קהל ב"}).json()["audience"]
        third = self.client.post("/audiences", json={"name": "קהל ג"}).json()["audience"]

        made = self.client.post(f"/audiences/{third['id']}/primary").json()["audiences"]
        self.assertEqual([item["id"] for item in made if item["is_primary"]], [third["id"]])
        self.assertEqual([item["priority"] for item in made].count("primary"), 1)

        patched = self.client.patch(
            f"/audiences/{second['id']}", json={"priority": "primary"}
        ).json()["audience"]
        self.assertTrue(patched["is_primary"])
        self.assertEqual(
            self.db.query(Audience)
            .filter(Audience.business_id == self.business.id, Audience.is_primary == 1)
            .count(),
            1,
        )
        self.assertFalse(self.db.query(Audience).filter_by(id=first["id"]).first().is_primary)

        # A rival business keeps its own primary untouched.
        rival_audience = self.add_audience(business=self.rival, name="קהל של המתחרה", is_primary=1)
        self.client.post(f"/audiences/{second['id']}/primary")
        self.db.refresh(rival_audience)
        self.assertEqual(rival_audience.is_primary, 1)

    def test_deleting_the_primary_promotes_another_segment(self):
        first = self.client.post("/audiences", json={"name": "קהל א"}).json()["audience"]
        second = self.client.post("/audiences", json={"name": "קהל ב"}).json()["audience"]
        body = self.client.delete(f"/audiences/{first['id']}").json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["promoted_audience"]["id"], second["id"])
        self.assertEqual(
            self.db.query(Audience)
            .filter(Audience.business_id == self.business.id, Audience.is_primary == 1)
            .count(),
            1,
        )

    # --- tagging a post -----------------------------------------------------------

    def test_tagging_a_post_sets_and_clears_the_audience(self):
        self.add_strategy([post(1, "פוסט")])
        audience = self.add_audience(name="זוגות צעירים")

        tagged = self.client.post(
            "/strategy/posts/audience", json={"post_index": 0, "audience_id": audience.id}
        )
        self.assertEqual(tagged.status_code, 200)
        self.assertEqual(tagged.json()["post"]["audience_id"], audience.id)
        self.assertEqual(tagged.json()["post"]["audience_name"], "זוגות צעירים")
        self.assertEqual(self.stored_posts()[0]["audience_id"], audience.id)
        self.assertEqual(tagged.json()["strategy"]["roadmap"]["posts"][0]["audience_id"], audience.id)

        cleared = self.client.post(
            "/strategy/posts/audience", json={"post_index": 0, "audience_id": None}
        ).json()["post"]
        self.assertIsNone(cleared["audience_id"])
        self.assertEqual(cleared["audience_name"], "")
        self.assertIsNone(self.stored_posts()[0]["audience_id"])

    def test_tagging_a_post_that_does_not_exist_404s(self):
        self.add_strategy([post(1, "פוסט")])
        audience = self.add_audience(name="קהל")
        response = self.client.post(
            "/strategy/posts/audience", json={"post_index": 7, "audience_id": audience.id}
        )
        self.assertEqual(response.status_code, 404)

    def test_deleting_an_audience_that_posts_reference_clears_the_reference(self):
        audience = self.add_audience(name="קהל זמני")
        self.add_strategy(
            [{**post(1, "פוסט"), "audience_id": audience.id, "audience_name": audience.name}]
        )

        response = self.client.delete(f"/audiences/{audience.id}")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["detached_posts"], 1)
        self.assertIn("לא משויך", body["message"])  # reported, in Hebrew

        self.assertIsNone(self.db.query(Audience).filter_by(id=audience.id).first())
        saved = self.stored_posts()[0]
        self.assertIsNone(saved["audience_id"])
        self.assertEqual(saved["audience_name"], "")
        rows = self.rollup()["rows"]
        self.assertEqual([row["name"] for row in rows], ["לא משויך"])
        self.assertEqual(rows[0]["posts"], 1)

    # --- measurement --------------------------------------------------------------

    def _attributed_snapshot(
        self,
        sessions: tuple[int, ...] = (41, 10, 5, 3),
        conversions: tuple[int, ...] = (2, 1, 1, 0),
        meta_permalink: str = "",
        meta_caption: str = "",
    ) -> PerformanceSnapshot:
        """Store the snapshot exactly the way the sync does, through `_attribute`.

        The campaign rows are built from the posts' own UTM, so the numbers land on the
        same key the product attributes with instead of on a hand-written one.
        """
        posts = performance_router._posts(self.business, self.db)
        campaigns = []
        for index, item in enumerate(posts):
            if index >= len(sessions):
                break
            utm = item.get("utm") or {}
            campaigns.append(
                {
                    "sessionCampaignName": utm.get("utm_campaign"),
                    "sessionSource": utm.get("utm_source"),
                    "sessionManualAdContent": utm.get("utm_content"),
                    "sessions": str(sessions[index]),
                    "conversions": str(conversions[index]),
                    "engagedSessions": str(max(0, sessions[index] - 11)),
                }
            )
        meta_data: dict = {"posts": []}
        if meta_permalink:
            meta_data = {
                "posts": [
                    {
                        "permalink": meta_permalink,
                        "caption": meta_caption,
                        "like_count": 12,
                        "comments_count": 3,
                        "insights": {"impressions": 900, "reach": 700, "saved": 8, "shares": 4},
                    }
                ]
            }
        ga4_data = {"campaigns": campaigns}
        ga4_data["post_attribution"] = performance_router._attribute(posts, ga4_data, meta_data)
        return self.add_snapshot(ga4_data, meta_data)

    def test_a_tagged_post_is_measured_under_its_audience_and_the_rest_is_unassigned(self):
        audience = self.add_audience(name="זוגות צעירים", is_primary=1, priority="primary")
        self.add_strategy(
            [
                post(1, "פוסט לזוגות", utm_content="p1-zugot", caption="מתנה לזוגות",
                     published_url="https://instagram.com/p/1"),
                post(2, "פוסט כללי", utm_content="p2-kolol"),
            ]
        )
        self.client.post(
            "/strategy/posts/audience", json={"post_index": 0, "audience_id": audience.id}
        )
        self._attributed_snapshot(
            meta_permalink="https://instagram.com/p/1", meta_caption="מתנה לזוגות"
        )
        self.connect("ga4")
        self.connect("meta")

        payload = self.rollup()
        self.assertTrue(payload["available"])
        rows = {row["name"]: row for row in payload["rows"]}
        self.assertEqual(set(rows), {"זוגות צעירים", "לא משויך"})

        tagged = rows["זוגות צעירים"]
        self.assertEqual(tagged["audience_id"], audience.id)
        self.assertTrue(tagged["is_primary"])
        self.assertEqual(tagged["posts"], 1)  # the sample size travels with the row
        self.assertEqual(tagged["measured_posts"], 1)
        # Only the numbers GA4 and Meta actually reported, summed.
        self.assertEqual(tagged["ga4"], {"sessions": 41, "conversions": 2, "engaged_sessions": 30})
        self.assertEqual(
            tagged["meta"],
            {"likes": 12, "comments": 3, "impressions": 900, "reach": 700, "saves": 8, "shares": 4},
        )

        # The untagged post is its own bucket: not dropped, and its 10 sessions are not
        # added to the audience's 41.
        unassigned = rows["לא משויך"]
        self.assertIsNone(unassigned["audience_id"])
        self.assertEqual(unassigned["posts"], 1)
        self.assertEqual(unassigned["ga4"]["sessions"], 10)
        self.assertEqual(unassigned["ga4"]["conversions"], 1)
        self.assertIsNone(unassigned["meta"])
        self.assertEqual(payload["unassigned_posts"], 1)
        self.assertIn("לא משויך", payload["explanation"])

        # No rate or benchmark is invented anywhere in the payload.
        dumped = json.dumps(payload, ensure_ascii=False)
        for invented in ("rate", "roas", "roi", "average", "benchmark"):
            self.assertNotIn(invented, dumped.lower())
        self.assertIn("סשנים", payload["method"])

    def test_without_a_connection_there_are_no_metrics_only_an_explanation(self):
        audience = self.add_audience(name="זוגות צעירים")
        self.add_strategy(
            [{**post(1, "פוסט"), "audience_id": audience.id, "audience_name": audience.name}]
        )

        payload = self.rollup()
        self.assertFalse(payload["available"])
        self.assertEqual(payload["connected"], {"ga4": False, "meta": False})
        self.assertIn("חיבור", payload["explanation"])
        self.assertIn("Google Analytics", payload["explanation"])
        self.assertEqual(payload["rows"][0]["posts"], 1)  # the sample size is still honest
        self.assertEqual(payload["rows"][0]["measured_posts"], 0)
        dumped = json.dumps(payload["rows"], ensure_ascii=False)
        self.assertNotIn("sessions", dumped)
        self.assertNotIn("conversions", dumped)
        for row in payload["rows"]:
            self.assertIsNone(row["ga4"])
            self.assertIsNone(row["meta"])

    def test_a_connected_provider_without_a_sync_asks_for_one(self):
        self.connect("ga4")
        self.add_audience(name="קהל")
        payload = self.rollup()
        self.assertFalse(payload["available"])
        self.assertTrue(payload["connected"]["ga4"])
        self.assertIn("סנכרון", payload["explanation"])

    def test_untagged_posts_are_reported_never_dropped_or_spread(self):
        self.add_strategy([post(1, "פוסט א", utm_content="p1-a"), post(2, "פוסט ב", utm_content="p2-b")])
        self.add_audience(name="קהל אחר")  # exists, but no post serves it
        self._attributed_snapshot()
        self.connect("ga4")

        payload = self.rollup()
        rows = {row["name"]: row for row in payload["rows"]}
        self.assertEqual(rows["קהל אחר"]["posts"], 0)
        self.assertIsNone(rows["קהל אחר"]["ga4"])  # no metrics invented for an empty segment
        self.assertEqual(rows["לא משויך"]["posts"], 2)
        self.assertEqual(rows["לא משויך"]["ga4"]["sessions"], 51)  # 41 + 10
        self.assertEqual(rows["לא משויך"]["ga4"]["conversions"], 3)
        self.assertEqual(payload["unassigned_posts"], 2)

    # --- audience on generated posts ----------------------------------------------

    def test_a_generated_post_naming_an_unknown_audience_falls_back_to_the_primary(self):
        business = {
            "name": "מאפיית תום",
            "monthly_budget_ils": 4500,
            "primary_goal": "sales",
            "audiences": [
                {
                    "id": 7,
                    "name": "זוגות צעירים",
                    "summary": "מחפשים מתנה",
                    "priority": "secondary",
                    "is_primary": False,
                    "needs": [],
                    "where": [],
                    "targeting": {},
                },
                {
                    "id": 9,
                    "name": "משפחות מהשכונה",
                    "summary": "קונות באמצע השבוע",
                    "priority": "primary",
                    "is_primary": True,
                    "needs": [],
                    "where": [],
                    "targeting": {},
                },
            ],
        }
        reply = {
            "posts": [
                model_post(1, "זוגות צעירים"),
                model_post(2, "קהל שלא הוגדר בכלל"),
                model_post(3, ""),
            ]
        }
        captured = {}

        def fake(prompt, schema):
            captured["prompt"] = prompt
            return json.dumps(reply, ensure_ascii=False)

        with mock.patch.object(strategy_service, "strategy_json", side_effect=fake):
            posts = strategy_service._write_posts_for_weeks(business, {}, {}, {}, [1, 2])

        self.assertEqual(posts[0]["audience_id"], 7)
        self.assertEqual(posts[0]["audience_name"], "זוגות צעירים")
        for index in (1, 2):
            self.assertEqual(posts[index]["audience_id"], 9)
            self.assertEqual(posts[index]["audience_name"], "משפחות מהשכונה")

        # The prompt names the segments and asks for the exact one; the business dict
        # itself is stripped so the same block is not printed twice.
        prompt = captured["prompt"]
        self.assertIn("זוגות צעירים", prompt)
        self.assertIn("משפחות מהשכונה", prompt)
        self.assertIn("audience_name", prompt)
        self.assertEqual(prompt.count("זוגות צעירים"), 1)

    def test_a_resumed_generation_reattaches_saved_posts_to_current_audiences(self):
        """The early posts come back from the saved generation state, where the audience
        list may already be stale. Nothing is stored pointing at a segment that is gone."""
        business = {
            "name": "מאפיית תום",
            "monthly_budget_ils": 4500,
            "primary_goal": "sales",
            "audiences": [
                {
                    "id": 5,
                    "name": "קהל ב",
                    "summary": "",
                    "is_primary": True,
                    "priority": "primary",
                    "needs": [],
                    "where": [],
                    "targeting": {},
                }
            ],
        }
        late_reply = json.dumps(
            {"posts": [model_post(3, "קהל ב"), model_post(4, "קהל שלא קיים")]}, ensure_ascii=False
        )
        state = {
            "stage": "posts_late",
            "roadmap_core": {"theme": "חגים"},
            "posts_early": [
                {**model_post(1, "קהל א"), "audience_id": 999, "audience_name": "קהל א"},
                {**model_post(2, "קהל ב"), "audience_id": 999, "audience_name": "קהל ב"},
            ],
        }
        with mock.patch.object(strategy_service, "strategy_json", return_value=late_reply):
            generated = strategy_service.generate_monthly_strategy(
                business,
                year=2026,
                month=1,
                scan={"brand_language": {"voice": "חם"}, "extracted": {}},
                state=state,
                one_stage=True,
            )

        posts = generated["roadmap"]["posts"]
        self.assertEqual(len(posts), 4)
        self.assertEqual([item["audience_id"] for item in posts], [5, 5, 5, 5])
        self.assertEqual({item["audience_name"] for item in posts}, {"קהל ב"})

    def test_posts_generated_without_audiences_leave_the_field_empty(self):
        business = {"name": "מאפיית תום", "monthly_budget_ils": 4500, "primary_goal": "sales"}
        captured = {}
        reply = {"posts": [model_post(1, ""), model_post(2, "קהל שהומצא")]}

        def fake(prompt, schema):
            captured["prompt"] = prompt
            return json.dumps(reply, ensure_ascii=False)

        with mock.patch.object(strategy_service, "strategy_json", side_effect=fake):
            posts = strategy_service._write_posts_for_weeks(business, {}, {}, {}, [1, 2])

        for item in posts:
            self.assertIsNone(item["audience_id"])
            self.assertEqual(item["audience_name"], "")
        self.assertIn("אל תמציא קהל", captured["prompt"])

    def test_audiences_reach_the_usp_and_the_month_plan(self):
        business = {
            "name": "מאפיית תום",
            "monthly_budget_ils": 4500,
            "primary_goal": "sales",
            "audiences": [
                {
                    "id": 3,
                    "name": "זוגות צעירים",
                    "summary": "מחפשים מתנה",
                    "is_primary": True,
                    "priority": "primary",
                    "needs": ["משהו אישי"],
                    "where": ["אינסטגרם"],
                    "targeting": {"geo": "תל אביב"},
                }
            ],
        }
        prompts = []

        def usp_fake(prompt, schema):
            prompts.append(prompt)
            return json.dumps({"usp": "חלה מחמצת"}, ensure_ascii=False)

        core_reply = json.dumps(
            {
                "theme": "חגים",
                "summary": "סיכום",
                "relevant_events": [],
                "long_horizon_plan": {"horizon": "רבעון", "hypothesis": "ה", "targets": [], "milestones": []},
                "monthly_horizon_plan": {"hypothesis": "ה", "targets": []},
                "management_and_checkpoints": {"how_we_help": "א", "when_we_need_user": [], "checkpoints": []},
                "weekly_breakdown": [{"week": 1, "focus": "פתיחה"}],
            },
            ensure_ascii=False,
        )

        def plan_fake(prompt, schema):
            prompts.append(prompt)
            return core_reply

        with mock.patch.object(strategy_service, "strategy_json", side_effect=usp_fake):
            strategy_service.build_usp({}, [], business, {})
        with mock.patch.object(strategy_service, "strategy_json", side_effect=plan_fake):
            strategy_service.build_roadmap(business, {}, [], {}, {})

        self.assertEqual(len(prompts), 2)
        for prompt in prompts:
            self.assertIn("זוגות צעירים", prompt)
            self.assertIn("הקהל הראשי", prompt)
            self.assertEqual(prompt.count("זוגות צעירים"), 1)

    def test_a_business_without_audiences_gets_no_audience_block(self):
        business = {"name": "מאפיית תום", "monthly_budget_ils": 4500, "primary_goal": "sales"}
        prompts = []

        def fake(prompt, schema):
            prompts.append(prompt)
            return json.dumps({"usp": "x"}, ensure_ascii=False)

        with mock.patch.object(strategy_service, "strategy_json", side_effect=fake):
            strategy_service.build_usp({}, [], business, {})
        self.assertNotIn("קהלי היעד שהעסק הגדיר", prompts[0])

    # --- rollup plumbing ----------------------------------------------------------

    def test_attribution_rows_carry_the_audience_they_are_tagged_with(self):
        audience = self.add_audience(name="זוגות צעירים")
        posts = [
            {**post(1, "פוסט", utm_content="p1-a"), "audience_id": audience.id, "audience_name": audience.name},
            post(2, "פוסט ב", utm_content="p2-b"),
        ]
        rows = performance_router._attribute(posts, {"campaigns": []}, {"posts": []})
        self.assertEqual(rows[0]["audience_id"], audience.id)
        self.assertEqual(rows[0]["audience_name"], "זוגות צעירים")
        self.assertIsNone(rows[1]["audience_id"])

    def test_clearing_a_tag_after_the_sync_moves_the_post_to_unassigned(self):
        audience = self.add_audience(name="קהל א")
        self.add_strategy([{**post(1, "פוסט", utm_content="p1-a"), "audience_id": audience.id}])
        self._attributed_snapshot()
        self.connect("ga4")
        self.assertEqual(self.rollup()["rows"][0]["ga4"]["sessions"], 41)

        self.client.post("/strategy/posts/audience", json={"post_index": 0, "audience_id": None})
        rows = {row["name"]: row for row in self.rollup()["rows"]}
        self.assertIsNone(rows["קהל א"]["ga4"])
        self.assertIsNone(rows["לא משויך"]["audience_id"])
        self.assertEqual(rows["לא משויך"]["ga4"]["sessions"], 41)

    def test_rollup_reports_an_audience_whose_posts_were_retagged_after_the_sync(self):
        """The live post wins: the owner re-tagging a post must move its numbers with it."""
        first = self.add_audience(name="קהל א")
        second = self.add_audience(name="קהל ב")
        self.add_strategy([{**post(1, "פוסט", utm_content="p1-a"), "audience_id": first.id}])
        self._attributed_snapshot()
        self.connect("ga4")

        before = {row["name"]: row for row in self.rollup()["rows"]}
        self.assertEqual(before["קהל א"]["ga4"]["sessions"], 41)

        self.client.post("/strategy/posts/audience", json={"post_index": 0, "audience_id": second.id})
        after = {row["name"]: row for row in self.rollup()["rows"]}
        self.assertIsNone(after["קהל א"]["ga4"])
        self.assertEqual(after["קהל ב"]["ga4"]["sessions"], 41)


if __name__ == "__main__":
    unittest.main()
