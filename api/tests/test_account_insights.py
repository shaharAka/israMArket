"""Instagram account-level insights: `meta.account_insights` / `meta.account_overview`,
the `account` block of the performance snapshot, and where it is read back.

Hermetic: every Graph call goes through a mocked `httpx.get`, the diagnosis model call is
patched, and each test gets a throwaway SQLite file. No network.
"""
import _test_env  # noqa: F401  (must come before any `app` import)

import json
import shutil
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Business, Integration, PerformanceSnapshot, User
from app.routers import performance as performance_router
from app.services import meta, research
from app.services.jsonutil import dumps, loads
from app.services.month_loop import prior_month_review

TODAY = date(2026, 9, 30)
RETIRED = ("impressions", "profile_views", "website_clicks", "email_contacts", "get_directions_clicks",
           "phone_call_clicks", "text_message_clicks")


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.text = json.dumps(payload, ensure_ascii=False)

    def json(self):
        return self._payload


def graph_error(code, message="err", status=400):
    return FakeResponse({"error": {"message": message, "type": "OAuthException", "code": code}}, status_code=status)


def ts(day: date) -> int:
    return int(datetime(day.year, day.month, day.day, tzinfo=timezone.utc).timestamp())


def total(name, value, breakdown=None, dimension=""):
    metric = {"name": name, "period": "day", "total_value": {"value": value}}
    if breakdown:
        metric["total_value"]["breakdowns"] = [
            {"dimension_keys": [dimension], "results": [{"dimension_values": [k], "value": v} for k, v in breakdown.items()]}
        ]
    return metric


class FakeGraph:
    """A tiny Instagram account. The current window of each length gets bigger numbers than
    the one before it, so "vs the previous period" is visible in every assertion.

    `refuse`: metric names Meta answers with (#100) — alone or in any request naming them.
    """

    def __init__(self, followers=640, refuse=(), fail_first=None, token_dead=False, follower_series=True):
        self.followers = followers
        self.refuse = set(refuse)
        self.fail_first = fail_first
        self.token_dead = token_dead
        self.follower_series = follower_series
        self.calls: list[tuple[str, dict]] = []

    def insight_calls(self):
        return [params for url, params in self.calls if url.endswith("/ig1/insights")]

    def __call__(self, url, params=None, timeout=None):
        params = dict(params or {})
        self.calls.append((url, params))
        if self.token_dead:
            return graph_error(190, "Error validating access token")
        if url.endswith("/ig1"):
            payload = {"id": "ig1", "media_count": 31}
            if self.followers is not None:
                payload["followers_count"] = self.followers
            return FakeResponse(payload)
        if url.endswith("/ig1/insights"):
            return self.insights(params)
        if url.endswith("/ig1/media"):
            return FakeResponse({"data": [{"id": "m1", "caption": "חלה", "permalink": "https://i/m1", "like_count": 4}]})
        if url.endswith("/m1/insights"):
            return FakeResponse({"data": [{"name": "reach", "values": [{"value": 90}]}]})
        if url.endswith("/page1"):
            return FakeResponse({"name": "דף", "fan_count": 10})
        raise AssertionError(url)

    def insights(self, params):
        names = params["metric"].split(",")
        if self.fail_first and params["metric"] == self.fail_first:
            return graph_error(100, "(#100) metric[3] must be one of the following values")
        if self.refuse.intersection(names):
            return graph_error(100, "(#100) The value must be a valid insights metric")
        if names == ["follower_count"]:
            if not self.follower_series:
                return FakeResponse({"data": []})
            end = TODAY
            values = [
                {"value": 2, "end_time": f"{(end - timedelta(days=offset)).isoformat()}T07:00:00+0000"}
                for offset in range(0, 28)
            ]
            return FakeResponse({"data": [{"name": "follower_count", "period": "day", "values": values}]})
        current = params["until"] == ts(TODAY)
        days = (params["until"] - params["since"]) // 86400
        scale = (2 if current else 1) * days
        data = []
        for name in names:
            if name == "profile_links_taps":
                data.append(total(name, 3 * scale, {"CALL": 2 * scale, "DIRECTION": scale}, "contact_button_type")
                            if params.get("breakdown") else total(name, 3 * scale))
            elif name == "follows_and_unfollows":
                data.append(total(name, 5 * scale, {"FOLLOWER": 4 * scale, "NON_FOLLOWER": scale}, "follow_type")
                            if params.get("breakdown") else total(name, 5 * scale))
            else:
                data.append(total(name, {"reach": 100, "views": 400, "accounts_engaged": 20, "total_interactions": 50}[name] * scale))
        return FakeResponse({"data": data})


class AccountInsightsTest(unittest.TestCase):
    def test_totals_are_asked_together_and_breakdowns_alone(self):
        graph = FakeGraph()
        with mock.patch.object(meta.httpx, "get", side_effect=graph):
            window = meta.account_insights("ig1", "TOKEN", TODAY - timedelta(days=7), TODAY, followers=640)

        calls = graph.insight_calls()
        self.assertEqual(len(calls), 3)
        combined = calls[0]
        self.assertEqual(combined["metric"], "reach,views,accounts_engaged,total_interactions")
        self.assertEqual(combined["period"], "day")
        self.assertEqual(combined["metric_type"], "total_value")
        self.assertEqual(combined["since"], ts(TODAY - timedelta(days=7)))
        self.assertEqual(combined["until"], ts(TODAY))
        self.assertNotIn("breakdown", combined)
        self.assertEqual({c["metric"]: c.get("breakdown") for c in calls[1:]},
                         {"profile_links_taps": "contact_button_type", "follows_and_unfollows": "follow_type"})
        self.assertIn(meta.GRAPH_VERSION, graph.calls[0][0])

        self.assertEqual(window["start"], "2026-09-23")
        self.assertEqual(window["end"], "2026-09-29")  # today is not in yet
        self.assertEqual(window["values"]["reach"], 1400)
        self.assertEqual(window["values"]["profile_links_taps"], 42)
        self.assertEqual(window["breakdowns"]["profile_links_taps"], {"CALL": 28, "DIRECTION": 14})
        self.assertEqual(window["values"]["follows"], 56)
        self.assertEqual(window["values"]["unfollows"], 14)
        self.assertEqual(window["values"]["net_followers"], 42)
        self.assertEqual(window["errors"], {})
        self.assertEqual(window["stopped"], "")

    def test_a_refused_combined_request_is_retried_metric_by_metric(self):
        # Meta fails the whole request for one metric it will not serve ("views" is still
        # marked in development); the other three still come back.
        graph = FakeGraph(refuse={"views"})
        with mock.patch.object(meta.httpx, "get", side_effect=graph):
            window = meta.account_insights("ig1", "TOKEN", TODAY - timedelta(days=28), TODAY, followers=640)

        asked = [c["metric"] for c in graph.insight_calls()]
        self.assertEqual(asked[:5], ["reach,views,accounts_engaged,total_interactions", "reach", "views",
                                     "accounts_engaged", "total_interactions"])
        self.assertNotIn("views", window["values"])  # missing, never zero
        self.assertEqual(window["errors"]["views"], meta.MISSING_METRIC_HE)
        self.assertEqual(window["values"]["reach"], 5600)
        self.assertEqual(window["values"]["accounts_engaged"], 1120)
        self.assertEqual(set(window["errors"]), {"views"})

    def test_a_metric_missing_from_the_answer_is_not_measured(self):
        graph = FakeGraph()
        original = graph.insights

        def without_engaged(params):
            response = original(params)
            response._payload["data"] = [m for m in response._payload["data"] if m["name"] != "accounts_engaged"]
            return response

        graph.insights = without_engaged
        with mock.patch.object(meta.httpx, "get", side_effect=graph):
            window = meta.account_insights("ig1", "TOKEN", TODAY - timedelta(days=7), TODAY, followers=640)
        self.assertNotIn("accounts_engaged", window["values"])
        self.assertEqual(window["errors"]["accounts_engaged"], meta.MISSING_METRIC_HE)

    def test_a_refused_breakdown_falls_back_to_the_total(self):
        graph = FakeGraph()
        original = graph.insights

        def no_breakdown(params):
            if params.get("breakdown") == "contact_button_type":
                return graph_error(100, "(#100) Incompatible breakdowns")
            return original(params)

        graph.insights = no_breakdown
        with mock.patch.object(meta.httpx, "get", side_effect=graph):
            window = meta.account_insights("ig1", "TOKEN", TODAY - timedelta(days=7), TODAY, followers=640)
        self.assertEqual(window["values"]["profile_links_taps"], 42)
        self.assertNotIn("profile_links_taps", window["breakdowns"])
        self.assertNotIn("profile_links_taps", window["errors"])

    def test_no_retired_metric_is_ever_requested(self):
        graph = FakeGraph()
        with mock.patch.object(meta.httpx, "get", side_effect=graph):
            meta.account_overview("TOKEN", "ig1", today=TODAY)
        asked = " ".join(c["metric"] for c in graph.insight_calls())
        for retired in RETIRED:
            self.assertNotIn(retired, asked)

    def test_a_retired_metric_answer_is_recorded_in_hebrew(self):
        # If Meta retires one of today's metrics too, it costs that number and says so.
        graph = FakeGraph(refuse={"total_interactions"})
        with mock.patch.object(meta.httpx, "get", side_effect=graph):
            window = meta.account_insights("ig1", "TOKEN", TODAY - timedelta(days=7), TODAY, followers=640)
        self.assertEqual(window["errors"], {"total_interactions": meta.MISSING_METRIC_HE})
        self.assertNotIn("(#100)", json.dumps(window, ensure_ascii=False))

    def test_under_100_followers_skips_the_follower_metrics_with_an_honest_note(self):
        graph = FakeGraph(followers=42)
        with mock.patch.object(meta.httpx, "get", side_effect=graph):
            block = meta.account_overview("TOKEN", "ig1", today=TODAY)

        asked = [c["metric"] for c in graph.insight_calls()]
        self.assertNotIn("follows_and_unfollows", asked)
        self.assertNotIn("follower_count", asked)
        self.assertEqual(block["followers_count"], 42)
        self.assertTrue(block["few_followers"])
        self.assertEqual(block["errors"]["follower_count"], meta.FEW_FOLLOWERS_HE)
        current = block["windows"]["7"]["current"]
        self.assertEqual(current["errors"]["follows_and_unfollows"], meta.FEW_FOLLOWERS_HE)
        self.assertNotIn("net_followers", current["values"])
        self.assertEqual(current["values"]["reach"], 1400)  # the rest is still measured
        self.assertIn("100", meta.FEW_FOLLOWERS_HE)

    def test_meta_refusing_a_small_account_reads_as_the_100_follower_rule(self):
        graph = FakeGraph(followers=99, refuse={"follows_and_unfollows"})
        with mock.patch.object(meta.httpx, "get", side_effect=graph):
            window = meta.account_insights("ig1", "TOKEN", TODAY - timedelta(days=7), TODAY)
        # Followers unknown to the call: Meta is asked, refuses, and the note stays generic.
        self.assertEqual(window["errors"]["follows_and_unfollows"], meta.MISSING_METRIC_HE)
        with mock.patch.object(meta.httpx, "get", side_effect=graph):
            window = meta.account_insights("ig1", "TOKEN", TODAY - timedelta(days=7), TODAY, followers=99)
        self.assertEqual(window["errors"]["follows_and_unfollows"], meta.FEW_FOLLOWERS_HE)

    def test_a_window_over_30_days_is_not_requested(self):
        graph = FakeGraph()
        with mock.patch.object(meta.httpx, "get", side_effect=graph):
            window = meta.account_insights("ig1", "TOKEN", TODAY - timedelta(days=31), TODAY)
        self.assertEqual(graph.calls, [])
        self.assertEqual(set(window["errors"]), set(meta.ACCOUNT_METRICS))
        self.assertTrue(all(message == meta.ACCOUNT_WINDOW_HE for message in window["errors"].values()))

    def test_a_dead_token_stops_after_one_call_and_never_raises(self):
        graph = FakeGraph(token_dead=True)
        with mock.patch.object(meta.httpx, "get", side_effect=graph):
            block = meta.account_overview("TOKEN", "ig1", today=TODAY)
        self.assertEqual(len(graph.calls), 1)
        self.assertEqual(block["stopped"], "token")
        self.assertIn("חברו את אינסטגרם מחדש", block["errors"]["followers_count"])
        self.assertIsNone(block["followers_count"])

    def test_overview_compares_each_window_with_the_one_before(self):
        graph = FakeGraph()
        with mock.patch.object(meta.httpx, "get", side_effect=graph):
            block = meta.account_overview("TOKEN", "ig1", today=TODAY)

        self.assertEqual(block["followers_count"], 640)
        self.assertEqual(set(block["windows"]), {"7", "28"})
        week = block["windows"]["7"]
        self.assertEqual((week["current"]["start"], week["current"]["end"]), ("2026-09-23", "2026-09-29"))
        self.assertEqual((week["previous"]["start"], week["previous"]["end"]), ("2026-09-16", "2026-09-22"))
        self.assertEqual(week["current"]["values"]["reach"], 1400)
        self.assertEqual(week["previous"]["values"]["reach"], 700)
        # follower_count: 2 new followers a day, summed per window, today excluded.
        self.assertEqual(block["new_followers"], {"7": 14, "28": 56})
        follower_call = next(c for c in graph.insight_calls() if c["metric"] == "follower_count")
        self.assertEqual(follower_call["until"], ts(TODAY))
        self.assertLessEqual((follower_call["until"] - follower_call["since"]) // 86400, 30)
        self.assertEqual(block["stopped"], "")

        digest = meta.account_digest(block, 28)
        self.assertEqual(digest["values"]["reach"], 5600)
        self.assertEqual(digest["previous"]["reach"], 2800)
        self.assertEqual(digest["new_followers"], 56)
        self.assertIsNone(meta.account_digest({}, 28))
        self.assertIsNone(meta.account_digest(None))

    def test_follower_count_that_comes_back_empty_is_not_a_zero(self):
        graph = FakeGraph(follower_series=False)
        with mock.patch.object(meta.httpx, "get", side_effect=graph):
            block = meta.account_overview("TOKEN", "ig1", today=TODAY)
        self.assertEqual(block["new_followers"], {})
        self.assertEqual(block["errors"]["follower_count"], meta.MISSING_METRIC_HE)


class AccountSnapshotTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-account-"))
        self.engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)()
        self.owner = User(email="owner@example.com", password_hash="x", full_name="בעלת העסק")
        self.db.add(self.owner)
        self.db.flush()
        self.business = Business(user_id=self.owner.id, name="מאפיית תום", website_url="https://bakery.example",
                                 business_type="מאפייה", offerings="חלות")
        self.db.add(self.business)
        self.db.commit()

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

    def connect_meta(self):
        self.db.add(Integration(
            business_id=self.business.id, provider="meta", status="connected", external_id="page1",
            access_token_enc="encrypted",
            extra_json=dumps({"selected_instagram_id": "ig1", "page_tokens": {"page1": "PAGE_TOKEN"}}),
        ))
        self.db.commit()

    def sync(self, graph):
        real_overview = meta.account_overview
        with mock.patch.object(meta.httpx, "get", side_effect=graph), \
                mock.patch.object(performance_router, "diagnose", return_value={"headline": "x"}), \
                mock.patch.object(meta, "account_overview", side_effect=lambda t, i: real_overview(t, i, today=TODAY)):
            return self.client.post("/performance/sync")

    def test_the_snapshot_and_latest_carry_the_account_block(self):
        self.connect_meta()
        response = self.sync(FakeGraph())
        self.assertEqual(response.status_code, 200, response.text)
        account = response.json()["meta"]["account"]
        self.assertEqual(account["followers_count"], 640)
        self.assertEqual(account["windows"]["28"]["current"]["values"]["reach"], 5600)

        snap = self.db.query(PerformanceSnapshot).one()
        stored = loads(snap.meta_json, {})
        self.assertEqual(stored["account"]["windows"]["7"]["previous"]["values"]["reach"], 700)
        self.assertEqual(stored["posts"][0]["id"], "m1")  # the per-post numbers are untouched

        latest = self.client.get("/performance/latest").json()
        self.assertTrue(latest["available"])
        self.assertEqual(latest["meta"]["account"]["windows"]["7"]["current"]["values"]["net_followers"], 42)
        self.assertEqual(latest["meta"]["account"]["new_followers"], {"7": 14, "28": 56})

    def test_the_diagnosis_gets_the_account_numbers_as_data(self):
        self.connect_meta()
        with mock.patch.object(meta.httpx, "get", side_effect=FakeGraph()), \
                mock.patch.object(performance_router, "diagnose", return_value={}) as diagnose:
            self.client.post("/performance/sync")
        meta_arg = diagnose.call_args.args[2]
        self.assertIn("account", meta_arg)
        self.assertEqual(meta_arg["account"]["followers_count"], 640)

    def test_a_crash_in_the_account_call_does_not_fail_the_sync(self):
        self.connect_meta()
        with mock.patch.object(meta.httpx, "get", side_effect=FakeGraph()), \
                mock.patch.object(performance_router, "diagnose", return_value={}), \
                mock.patch.object(meta, "account_overview", side_effect=KeyError("boom")), \
             self.assertLogs("app.services.meta_readiness", level="ERROR"):
            response = self.client.post("/performance/sync")
        self.assertEqual(response.status_code, 200, response.text)
        account = response.json()["meta"]["account"]
        self.assertEqual(account["errors"]["account"], meta.MISSING_METRIC_HE)
        self.assertEqual(response.json()["meta"]["posts"][0]["id"], "m1")

    def test_research_and_month_review_read_the_account_numbers(self):
        self.connect_meta()
        self.sync(FakeGraph())
        ctx = {"now": datetime(2026, 9, 30, 9, 0), "today": TODAY, "previous_state": {}}
        items, _, _ = research.gather_own_results(self.db, self.business, ctx)
        fact = next(item for item in items if item["origin"] == "Instagram Graph API (המספרים של החשבון)")
        self.assertEqual(fact["kind"], "change")
        self.assertIn("5,600 אנשים ראו את התוכן", fact["text_he"])
        self.assertIn("640 עוקבים (+168 בתקופה)", fact["text_he"])
        self.assertIn("+100%", fact["text_he"])

        snap = self.db.query(PerformanceSnapshot).one()
        review = prior_month_review(
            {"roadmap": {"posts": []}},
            {"instagram_account": meta.account_digest(loads(snap.meta_json, {})["account"])},
        )
        self.assertEqual(review["instagram_account"]["values"]["reach"], 5600)
        self.assertEqual(review["instagram_account"]["followers_count"], 640)


if __name__ == "__main__":
    unittest.main()
