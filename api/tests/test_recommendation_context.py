"""Review destinations, provenance and tenant isolation. No live models/providers."""
import _test_env  # noqa: F401

import shutil
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest import mock
from urllib.parse import parse_qs, urlsplit

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Business, Integration, PerformanceSnapshot, Recommendation, Strategy, User
from app.routers import performance, recommendations
from app.routers.strategy import serialize_strategy
from app.services import recommendation_context as context
from app.services.billing import require_generation_access
from app.services.jsonutil import dumps, loads


def plan():
    return {"id": 7, "roadmap": {"posts": [{"uid": "p1", "title": "ראשון", "caption": "קיים"}, {"uid": "p2", "title": "שני"}]}}


def snapshot():
    end = date.today() - timedelta(days=1)
    return {"id": 4, "period_start": (end - timedelta(days=27)).isoformat(), "period_end": end.isoformat(),
            "created_at": datetime.utcnow().isoformat(), "ga4": {"property_id": "123", "overview": {"sessions": "42", "conversions": "0"}},
            "meta": {"source_read_at": "2026-01-02T08:00:00", "source_period": {"start": "2025-12-01", "end": "2025-12-28"},
                     "ads": {"status": "available", "account_id": "act_1", "overview": {"link_clicks": 11}}}, "diagnostic": {}}


def proposal(**kwargs):
    return {"week_summary": "ניסוי קטן", "suggestions": [{"title": "נבדוק את הנוסח", "action": "נשנה דבר אחד", "priority": "medium",
            "action_kind": "post", "post_uid": "p1", "hypothesis": "ייתכן שהניסוח יעזור", "success_check": "נבדוק לחיצות אחרי שבוע", **kwargs}]}


def record(stored):
    return SimpleNamespace(id=13, week_of="2026-09-28", created_at=datetime.utcnow(), suggestions_json=dumps(stored))


class ContextTest(unittest.TestCase):
    def setUp(self):
        self.business = SimpleNamespace(integrations=[SimpleNamespace(provider="ga4", status="connected", external_id="123"),
                                                     SimpleNamespace(provider="meta", status="connected", external_id="", extra_json=dumps({"selected_ad_account_id": "act_1"}))])
        self.plan = plan()
        self.ga, self.meta, self.basis = context.prepare(self.business, self.plan, snapshot())

    def response(self, raw=None, current=None):
        bound = context.bind(proposal() if raw is None else raw, self.basis, self.plan)
        return context.serialize(record(bound), self.plan if current is None else current)

    def test_zero_is_preserved_and_meta_keeps_its_older_window(self):
        self.assertEqual([row["value"] for row in self.basis["observations"]], [42, 0, 11])
        sources = self.response()["suggestions"]["basis"]["sources"]
        self.assertFalse(sources[0]["stale"])
        self.assertTrue(sources[1]["stale"])
        self.assertEqual(sources[1]["period"]["start"], "2025-12-01")
        self.assertEqual(sources[1]["read_at"], "2026-01-02T08:00:00")

    def test_invalid_or_missing_numbers_do_not_become_zero(self):
        for value in (None, "", "NaN", "inf", True, -1, {}):
            snap = snapshot()
            snap["ga4"]["overview"] = {"sessions": value}
            basis = context.prepare(self.business, self.plan, snap)[2]
            self.assertFalse(any(row["source"] == "ga4" for row in basis["observations"]))

    def test_empty_history_has_no_results_and_explains_limits(self):
        basis = context.prepare(self.business, self.plan, {})[2]
        self.assertEqual(basis["observations"], [])
        self.assertTrue(all(source["status"] == "missing" for source in basis["sources"]))
        self.assertIn("נתון חסר אינו אפס", " ".join(basis["limits"]))

    def test_instagram_only_has_a_real_observation_and_its_own_window(self):
        snap = snapshot()
        snap["ga4"] = {}
        snap["meta"] = {"account": {"windows": {"28": {"current": {"start": "2026-08-01", "end": "2026-08-28", "values": {"reach": 50}}}}}}
        basis = context.prepare(self.business, self.plan, snap)[2]
        self.assertEqual(basis["observations"], [{"source": "meta_social", "metric": "reach", "label": "אנשים שראו באינסטגרם", "value": 50}])
        self.assertEqual(basis["sources"][-1]["period"], {"start": "2026-08-01", "end": "2026-08-28"})

    def test_model_gets_plan_intent_without_old_unscoped_post_results(self):
        self.plan["roadmap"]["posts"][0].update(results={"conversions": 9000}, learning={"fact": "old results"})
        self.plan["hypothesis_review"] = {"result": "old review"}
        given = context.for_model(self.plan)
        self.assertNotIn("results", given["roadmap"]["posts"][0])
        self.assertNotIn("learning", given["roadmap"]["posts"][0])
        self.assertNotIn("hypothesis_review", given)
        self.assertEqual(given["roadmap"]["posts"][0]["uid"], "p1")
        self.assertIn("results", self.plan["roadmap"]["posts"][0])

    def test_another_selected_site_or_ad_account_is_excluded(self):
        self.business.integrations[0].external_id = "999"
        self.business.integrations[1].extra_json = dumps({"selected_ad_account_id": "act_999"})
        ga, meta, basis = context.prepare(self.business, self.plan, snapshot())
        self.assertEqual(ga, {})
        self.assertEqual(meta["ads"], {})
        self.assertEqual(basis["observations"], [])
        self.assertTrue(basis["excluded_sources"])

    def test_model_cannot_replace_basis_or_choose_a_url(self):
        raw = proposal(href="https://evil.example", review={"href": "/admin"})
        raw["basis"] = {"observations": [{"value": 9000}]}
        result = self.response(raw)
        self.assertEqual(result["suggestions"]["basis"]["snapshot_id"], 4)
        review = result["suggestions"]["suggestions"][0]["review"]
        self.assertEqual(urlsplit(review["href"]).path, "/posts")
        self.assertEqual(parse_qs(urlsplit(review["href"]).query)["post_uid"], ["p1"])

    def test_reordered_posts_resolve_by_uid_not_saved_position(self):
        current = plan()
        current["roadmap"]["posts"].reverse()
        query = parse_qs(urlsplit(self.response(current=current)["suggestions"]["suggestions"][0]["review"]["href"]).query)
        self.assertEqual(query["post"], ["1"])

    def test_missing_foreign_or_duplicate_post_targets_fall_back_to_plan(self):
        for uid in ("foreign", "", "https://example.com"):
            item = self.response(proposal(post_uid=uid))["suggestions"]["suggestions"][0]
            self.assertEqual(item["review"]["kind"], "plan")
            self.assertEqual(item["review"]["status"], "missing")
        current = plan()
        current["roadmap"]["posts"].append(current["roadmap"]["posts"][0].copy())
        self.assertEqual(self.response(current=current)["suggestions"]["suggestions"][0]["review"]["status"], "missing")
        current["roadmap"]["posts"] = []
        self.assertEqual(self.response(current=current)["suggestions"]["suggestions"][0]["review"]["kind"], "plan")

    def test_replaced_plan_and_edited_post_are_explained(self):
        current = plan()
        current["id"] = 9
        self.assertEqual(self.response(current=current)["suggestions"]["suggestions"][0]["review"]["status"], "stale")
        current = plan()
        current["roadmap"]["posts"][0]["caption"] = "כבר נערך"
        self.assertEqual(self.response(current=current)["suggestions"]["suggestions"][0]["review"]["status"], "changed")

    def test_selection_change_and_disconnect_are_not_current_data(self):
        bound = context.bind(proposal(), self.basis, self.plan)
        self.business.integrations[0].external_id = "999"
        self.business.integrations[1].status = "reconnect"
        sources = context.serialize(record(bound), self.plan, self.business)["suggestions"]["basis"]["sources"]
        self.assertEqual(sources[0]["status"], "different_selection")
        self.assertEqual(sources[1]["status"], "historical")
        self.assertTrue(sources[0]["stale"] and sources[1]["stale"])

    def test_published_post_is_learning_for_the_next_post_not_a_retroactive_edit(self):
        current = plan()
        current["roadmap"]["posts"][0]["published_at"] = "2026-09-28T08:00:00"
        review = self.response(current=current)["suggestions"]["suggestions"][0]["review"]
        self.assertEqual(review["kind"], "plan")
        self.assertEqual(review["status"], "published")
        self.assertEqual(urlsplit(review["href"]).path, "/strategy")

    def test_legacy_recommendation_never_guesses_a_post_target(self):
        result = context.serialize(record(proposal()), self.plan)
        self.assertIsNone(result["suggestions"]["basis"])
        self.assertEqual(result["suggestions"]["suggestions"][0]["review"]["status"], "legacy")
        self.assertTrue(result["suggestions"]["suggestions"][0]["review"]["href"].startswith("/strategy?"))

    def test_measurement_and_website_actions_use_fixed_review_destinations(self):
        for kind, path in (("measurement", "/integrations"), ("website", "/strategy"), ("arbitrary", "/strategy")):
            review = self.response(proposal(action_kind=kind))["suggestions"]["suggestions"][0]["review"]
            self.assertEqual(urlsplit(review["href"]).path, path)

    def test_malformed_model_result_is_bounded_without_fabricating_an_action(self):
        for raw in ([], None, {"suggestions": "not a list"}, {"suggestions": [None, {}, {"title": "only a title"}]}):
            self.assertEqual(context.bind(raw, self.basis, self.plan)["suggestions"], [])
        raw = proposal()
        raw["suggestions"] *= 10
        self.assertEqual(len(context.bind(raw, self.basis, self.plan)["suggestions"]), 3)


class RecommendationEndpointTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-findings-"))
        self.engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, autoflush=False)()
        self.addCleanup(self.cleanup)
        self.owner = User(email="owner@example.com", password_hash="x", full_name="Owner")
        self.other = User(email="other@example.com", password_hash="x", full_name="Other")
        self.db.add_all([self.owner, self.other]); self.db.flush()
        self.business = Business(user_id=self.owner.id, name="עסק לדוגמה")
        self.other_business = Business(user_id=self.other.id, name="אחר")
        self.db.add_all([self.business, self.other_business]); self.db.flush()
        self.strategy = Strategy(business_id=self.business.id, year=date.today().year, month=date.today().month,
                                 roadmap_json=dumps({"roadmap": {"posts": [{"title": "פוסט ישן ללא UID", "caption": "נוסח"}]}}))
        self.db.add(self.strategy); self.db.commit()
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.owner
        app.dependency_overrides[require_generation_access] = lambda: None
        self.client = TestClient(app)

    def cleanup(self):
        app.dependency_overrides.clear()
        self.db.close(); self.engine.dispose(); shutil.rmtree(self.tmp, ignore_errors=True)

    def rec(self, business=None):
        view = serialize_strategy(self.strategy, self.business)
        uid = view["roadmap"]["posts"][0]["uid"]
        basis = context.prepare(self.business, view, snapshot())[2]
        rec = Recommendation(business_id=(business or self.business).id, week_of="2026-09-28",
                             suggestions_json=dumps(context.bind(proposal(post_uid=uid), basis, view)))
        self.db.add(rec); self.db.commit()
        return rec

    def test_customer_cannot_read_other_customer_recommendation(self):
        other = self.rec(self.other_business)
        self.assertEqual(self.client.get(f"/recommendations/{other.id}").status_code, 404)
        self.assertFalse(self.client.get("/recommendations/latest").json()["available"])

    def test_specific_id_remains_stable_and_read_does_not_edit_the_plan(self):
        rec = self.rec()
        self.rec()
        before = self.strategy.roadmap_json
        response = self.client.get(f"/recommendations/{rec.id}")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["id"], rec.id)
        self.assertEqual(response.json()["suggestions"]["suggestions"][0]["review"]["kind"], "post")
        self.db.refresh(self.strategy)
        self.assertEqual(self.strategy.roadmap_json, before)

    def test_generate_passes_real_uids_and_persists_server_basis(self):
        def model(business, strategy, diagnostic, ga, meta):
            self.assertIn("analysis_basis", business)
            self.assertEqual(ga, {})
            uid = strategy["roadmap"]["posts"][0]["uid"]
            return {**proposal(post_uid=uid), "basis": {"snapshot_id": "invented"}}
        before = self.strategy.roadmap_json
        with mock.patch.object(recommendations, "recommend", side_effect=model), mock.patch.object(recommendations, "deliver", return_value=[]):
            response = self.client.post("/recommendations/generate")
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertIsNone(data["suggestions"]["basis"]["snapshot_id"])
        self.assertEqual(data["suggestions"]["suggestions"][0]["review"]["kind"], "post")
        self.assertEqual(self.client.get(f"/recommendations/{data['id']}").json()["suggestions"]["basis"]["observations"], [])
        self.db.refresh(self.strategy)
        self.assertEqual(self.strategy.roadmap_json, before)

    def test_weekly_uses_the_same_binding_contract(self):
        with mock.patch.object(performance, "_sync_payload", return_value=snapshot()), \
                mock.patch.object(performance, "recommend", return_value=proposal(post_uid="foreign")), \
                mock.patch.object(performance, "deliver", return_value=[]):
            response = self.client.post("/performance/weekly")
        self.assertEqual(response.status_code, 200, response.text)
        rec = response.json()["recommendation"]
        self.assertEqual(rec["suggestions"]["basis"]["snapshot_id"], 4)
        self.assertEqual(rec["suggestions"]["suggestions"][0]["review"]["status"], "missing")
        self.assertEqual(loads(self.db.get(Recommendation, rec["id"]).suggestions_json)["basis"]["snapshot_id"], 4)

    def test_failed_generation_keeps_plan_and_old_recommendation_without_raw_error(self):
        prior = self.rec()
        before = self.strategy.roadmap_json
        with mock.patch.object(recommendations, "recommend", side_effect=RuntimeError("private provider details")):
            response = self.client.post("/recommendations/generate")
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("private provider", response.text)
        self.assertEqual(self.db.query(Recommendation).count(), 1)
        self.assertEqual(self.client.get("/recommendations/latest").json()["id"], prior.id)
        self.db.refresh(self.strategy)
        self.assertEqual(self.strategy.roadmap_json, before)
