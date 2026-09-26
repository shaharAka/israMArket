"""Tests for the Instagram signal pipeline (Stream D).

Hermetic: a throwaway SQLite file per test, every Graph call goes through a mocked
`httpx.get` (or a mocked `meta.*` helper), and Gemini is never called — `strategy_json`
is patched wherever a prompt would be sent. META_APP_ID/SECRET are not needed.
"""

import json
import shutil
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Business, HashtagQuery, InspirationBrief, InstagramPost, Integration, User
from app.services import instagram_signal as sig
from app.services import meta
from app.services import strategy as strategy_service
from app.services.jsonutil import dumps, loads


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.text = json.dumps(payload, ensure_ascii=False)

    def json(self):
        return self._payload


def graph_error(code, message="err", subcode=None, status=400):
    error = {"message": message, "type": "OAuthException", "code": code}
    if subcode:
        error["error_subcode"] = subcode
    return FakeResponse({"error": error}, status_code=status)


def insights_payload(**values):
    return {"data": [{"name": name, "period": "lifetime", "values": [{"value": value}]} for name, value in values.items()]}


def own(media_id, *, reach=None, views=None, saved=None, shares=None, likes=None, comments=None, posted_at="2026-09-10T16:00:00+0000", caption="הוק ראשון\nהמשך", media_type="IMAGE", product="FEED"):
    return {
        "kind": "own",
        "media_id": media_id,
        "caption": caption,
        "caption_length": len(caption),
        "hook": sig.hook_of(caption),
        "format": sig.format_of(media_type, product),
        "permalink": f"https://www.instagram.com/p/{media_id}/",
        "posted_at": posted_at,
        "metrics": {"views": views, "reach": reach, "saved": saved, "shares": shares, "likes": likes, "comments": comments},
    }


# Business Discovery, as Meta documents the response shape.
DISCOVERY_OK = {
    "business_discovery": {
        "username": "rival_bakery",
        "name": "מאפיית המתחרה",
        "followers_count": 5000,
        "media_count": 320,
        "id": "17841400000000001",
        "media": {
            "data": [
                {
                    "id": "c1",
                    "caption": "שלוש סיבות שהחלה שלנו נגמרת עד 9:00\nהכי מוקדם שיש",
                    "media_type": "VIDEO",
                    "media_product_type": "REELS",
                    "like_count": 400,
                    "comments_count": 50,
                    "timestamp": "2026-09-04T05:30:00+0000",
                    "permalink": "https://www.instagram.com/reel/c1/",
                },
                {
                    "id": "c2",
                    "caption": "תמונה רגילה",
                    "media_type": "IMAGE",
                    "media_product_type": "FEED",
                    "like_count": 40,
                    "comments_count": 2,
                    "timestamp": "2026-09-03T10:00:00+0000",
                    "permalink": "https://www.instagram.com/p/c2/",
                },
                {
                    # Likes hidden by the owner: like_count is omitted.
                    "id": "c3",
                    "caption": "קרוסלה",
                    "media_type": "CAROUSEL_ALBUM",
                    "media_product_type": "FEED",
                    "comments_count": 30,
                    "timestamp": "2026-09-01T10:00:00+0000",
                    "permalink": "https://www.instagram.com/p/c3/",
                },
                {
                    "id": "c4",
                    "caption": "",
                    "media_type": "IMAGE",
                    "like_count": 0,
                    "comments_count": 0,
                    "timestamp": "2026-08-30T10:00:00+0000",
                    "permalink": "https://www.instagram.com/p/c4/",
                },
            ]
        },
    },
    "id": "17841400000000000",
}


class DbCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-ig-"))
        self.engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)()
        self.user = User(email="owner@example.com", password_hash="x", full_name="בעלת העסק")
        self.db.add(self.user)
        self.db.flush()
        self.business = Business(user_id=self.user.id, name="מאפיית תום", business_type="מאפייה")
        self.db.add(self.business)
        self.db.commit()
        self.addCleanup(self._cleanup)

    def _cleanup(self):
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def connect_meta(self):
        item = Integration(
            business_id=self.business.id,
            provider="meta",
            status="connected",
            external_id="page1",
            display_name="דף",
            # Not decryptable on purpose: meta_context falls back to the page token.
            access_token_enc="not-a-real-ciphertext",
            extra_json=dumps({"selected_instagram_id": "ig1", "page_tokens": {"page1": "PAGE_TOKEN"}}),
        )
        self.db.add(item)
        self.db.commit()
        self.db.refresh(self.business)

    def seed_posts(self):
        meta_data = {
            "posts": [
                {
                    "id": "m1",
                    "caption": "קצר",
                    "caption_full": "למה החלה נגמרת עד 9?\nכי אנחנו אופים 100 בלבד",
                    "media_type": "VIDEO",
                    "media_product_type": "REELS",
                    "permalink": "https://www.instagram.com/reel/m1/",
                    "timestamp": "2026-09-04T15:00:00+0000",
                    "like_count": 80,
                    "comments_count": 9,
                    "insights": {"views": 3000, "reach": 1000, "saved": 60, "shares": 40},
                    "insight_errors": {},
                },
                {
                    "id": "m2",
                    "caption": "מבצע",
                    "media_type": "IMAGE",
                    "media_product_type": "FEED",
                    "permalink": "https://www.instagram.com/p/m2/",
                    "timestamp": "2026-09-06T08:00:00+0000",
                    "like_count": 20,
                    "comments_count": 1,
                    "insights": {"reach": 800, "saved": 4, "shares": 1},
                    "insight_errors": {"views": "מטא לא החזירה את המדד"},
                },
            ]
        }
        sig.store_media(self.db, self.business.id, meta_data)
        self.db.commit()


# --- ranking ------------------------------------------------------------------------


class RankingTest(unittest.TestCase):
    def test_saves_and_shares_per_reach_beats_raw_size(self):
        big = own("big", reach=10000, saved=50, shares=50, likes=900)  # 1%
        small = own("small", reach=500, saved=30, shares=20, likes=40)  # 10%
        ranked = sig.rank_posts([big, small])
        self.assertEqual([p["media_id"] for p in ranked], ["small", "big"])
        self.assertEqual(ranked[0]["score_basis"], "saves_shares_per_reach")
        self.assertAlmostEqual(ranked[0]["score"], 0.1)

    def test_fallbacks_are_ordered_by_trust_and_zero_is_not_top(self):
        per_reach = own("a", reach=1000, saved=1, shares=0)
        engagement_per_reach = own("b", reach=1000, likes=500)
        per_view = own("c", views=1000, saved=900)
        raw = own("d", likes=10000)
        nothing = own("e")
        zero = own("f", reach=1000, saved=0, shares=0)
        ranked = sig.rank_posts([raw, per_view, nothing, engagement_per_reach, zero, per_reach], n=10)
        self.assertEqual([p["media_id"] for p in ranked], ["a", "b", "c", "d"])
        self.assertEqual(
            [p["score_basis"] for p in ranked],
            ["saves_shares_per_reach", "engagement_per_reach", "saves_shares_per_view", "raw_engagement"],
        )

    def test_tiny_reach_is_not_a_ratio(self):
        tiny = own("tiny", reach=5, saved=4, likes=3)
        self.assertEqual(sig.score_post(tiny), ("raw_engagement", 3.0))

    def test_top_n_and_labels(self):
        posts = [own(f"p{i}", reach=1000, saved=i, shares=0) for i in range(1, 9)]
        labelled = sig._label(sig.rank_posts(posts, n=5), "O")
        self.assertEqual(len(labelled), 5)
        self.assertEqual(labelled[0]["media_id"], "p8")
        self.assertEqual(labelled[0]["ref"], "O1")

    def test_format_and_hook(self):
        self.assertEqual(sig.format_of("VIDEO", "REELS"), "reel")
        self.assertEqual(sig.format_of("VIDEO", "FEED"), "video")
        self.assertEqual(sig.format_of("CAROUSEL_ALBUM", ""), "carousel")
        self.assertEqual(sig.format_of("IMAGE", None), "image")
        self.assertEqual(sig.hook_of("\n\n  פתיחה חדה  \nשאר הטקסט"), "פתיחה חדה")
        self.assertEqual(sig.hook_of(""), "")
        self.assertLessEqual(len(sig.hook_of("א" * 500)), 141)


# --- handles --------------------------------------------------------------------------


class HandleValidationTest(unittest.TestCase):
    def test_normalises(self):
        self.assertEqual(sig.normalize_handle("  @Rival.Bakery_ "), "rival.bakery_")
        self.assertEqual(sig.normalize_handle("https://www.instagram.com/Rival_Bakery/?hl=he"), "rival_bakery")
        self.assertEqual(sig.normalize_handle("instagram.com/rival"), "rival")

    def test_rejects_bad_names_in_hebrew(self):
        for bad in ["מאפייה", "rival bakery", ".rival", "rival.", "ri..val", "a" * 31, "rival!", "@"]:
            with self.subTest(bad=bad):
                with self.assertRaises(sig.HandleError) as ctx:
                    sig.normalize_handle(bad)
                self.assertRegex(str(ctx.exception), "[א-ת]")

    def test_post_link_is_not_a_profile(self):
        with self.assertRaises(sig.HandleError):
            sig.normalize_handle("https://www.instagram.com/p/ABC123/")

    def test_dedupes_skips_blank_and_caps_at_five(self):
        self.assertEqual(sig.normalize_handles(["@A", "a", " ", "b"]), ["a", "b"])
        self.assertEqual(len(sig.normalize_handles(["a", "b", "c", "d", "e", "@E"])), 5)
        with self.assertRaises(sig.HandleError):
            sig.normalize_handles(["a", "b", "c", "d", "e", "f"])


# --- Graph: metric degradation ----------------------------------------------------------


class MetricDegradationTest(unittest.TestCase):
    def test_one_failing_metric_costs_one_number_not_the_sync(self):
        calls = []

        def fake_get(url, params=None, timeout=None):
            calls.append((url, dict(params or {})))
            if url.endswith("/ig1/media"):
                return FakeResponse(
                    {
                        "data": [
                            {"id": "m1", "caption": "א" * 500, "media_type": "VIDEO", "media_product_type": "REELS",
                             "timestamp": "2026-09-01T10:00:00+0000", "permalink": "https://i/m1", "like_count": 5,
                             "comments_count": 1, "thumbnail_url": "https://cdn/t.jpg"},
                            {"id": "m2", "caption": "ב", "media_type": "CAROUSEL_ALBUM", "media_product_type": "FEED",
                             "timestamp": "2026-09-02T10:00:00+0000", "permalink": "https://i/m2"},
                        ]
                    }
                )
            if url.endswith("/m1/insights"):
                return FakeResponse(insights_payload(views=900, reach=700, saved=8, shares=4))
            if url.endswith("/m2/insights"):
                if params["metric"] in {"views,reach,saved,shares", "views"}:
                    return graph_error(100, "(#100) metric[0] must be one of the following values")
                return FakeResponse(insights_payload(**{params["metric"]: 3}))
            if url.endswith("/page1"):
                return FakeResponse({"name": "דף", "fan_count": 10})
            raise AssertionError(url)

        with mock.patch.object(meta.httpx, "get", side_effect=fake_get):
            data = meta.fetch_insights("TOKEN", "ig1", "page1")

        self.assertNotIn("impressions", json.dumps(calls))
        self.assertIn(meta.GRAPH_VERSION, calls[0][0])
        self.assertNotEqual(meta.GRAPH_VERSION, "v21.0")
        first, second = data["posts"]
        self.assertEqual(first["insights"], {"views": 900, "reach": 700, "saved": 8, "shares": 4})
        self.assertEqual(first["insight_errors"], {})
        self.assertEqual(first["media_product_type"], "REELS")
        self.assertEqual(first["thumbnail_url"], "https://cdn/t.jpg")
        self.assertEqual(len(first["caption"]), meta.CAPTION_SNAPSHOT)
        self.assertEqual(first["caption_length"], 500)
        self.assertEqual(second["insights"], {"reach": 3, "saved": 3, "shares": 3})
        self.assertNotIn("views", second["insights"])  # missing, never zero
        self.assertIn("views", second["insight_errors"])
        self.assertEqual(data["metric_failures"], {"views": 1})
        self.assertNotIn("caption_full", json.dumps(meta.snapshot_view(data)))

    def test_token_error_is_not_retried_per_metric(self):
        responses = [graph_error(190, "Error validating access token")]
        with mock.patch.object(meta.httpx, "get", side_effect=lambda *a, **k: responses[0]) as fake:
            values, errors = meta.media_insights("m1", "TOKEN")
        self.assertEqual(values, {})
        self.assertEqual(set(errors), set(meta.INSIGHT_METRICS))
        self.assertEqual(fake.call_count, 1)

    def test_transport_error_does_not_raise(self):
        with mock.patch.object(meta.httpx, "get", side_effect=httpx.ConnectError("no dns")):
            values, errors = meta.media_insights("m1", "TOKEN")
        self.assertEqual(values, {})
        self.assertEqual(len(errors), 4)

    def test_media_field_fallback(self):
        seen = []

        def fake_get(url, params=None, timeout=None):
            seen.append(params.get("fields"))
            if "media_product_type" in (params.get("fields") or ""):
                return graph_error(100, "Tried accessing nonexisting field (media_product_type)")
            return FakeResponse({"data": [{"id": "m1"}]})

        with mock.patch.object(meta.httpx, "get", side_effect=fake_get):
            media = meta._list_media("ig1", "TOKEN", 20)
        self.assertEqual(media, [{"id": "m1"}])
        self.assertEqual(seen[-1], meta.MEDIA_FIELDS_BASIC)

    def test_error_classification(self):
        self.assertEqual(meta.graph_error(graph_error(110, "Cannot find User", 2207013)).kind, "not_found")
        self.assertEqual(meta.graph_error(graph_error(4, "limit")).kind, "rate_limited")
        self.assertEqual(meta.graph_error(graph_error(10, "perm", status=403)).kind, "permission")
        self.assertEqual(meta.graph_error(graph_error(190, "token")).kind, "token")
        self.assertEqual(meta.graph_error(FakeResponse("oops", status_code=503)).kind, "unavailable")


# --- Business Discovery -----------------------------------------------------------------


class BusinessDiscoveryTest(unittest.TestCase):
    def test_parses_and_ranks_by_engagement_per_follower(self):
        entry = sig.parse_discovery("rival_bakery", DISCOVERY_OK["business_discovery"])
        self.assertTrue(entry["ok"])
        self.assertEqual(entry["profile"]["followers_count"], 5000)
        self.assertEqual(entry["posts_seen"], 4)
        self.assertEqual([p["media_id"] for p in entry["posts"]], ["c1", "c2", "c3"])  # zero-engagement c4 dropped
        top = entry["posts"][0]
        self.assertEqual(top["format"], "reel")
        self.assertEqual(top["hook"], "שלוש סיבות שהחלה שלנו נגמרת עד 9:00")
        self.assertEqual(top["metrics"], {"likes": 400, "comments": 50})
        self.assertAlmostEqual(top["engagement_per_follower"], 0.09)
        self.assertEqual(top["day_he"], "יום שישי")  # 05:30 UTC Friday = 08:30 in Israel (IDT)
        self.assertEqual(top["hour_il"], 8)
        hidden = entry["posts"][2]
        self.assertIsNone(hidden["metrics"]["likes"])  # hidden likes stay unknown
        self.assertEqual(hidden["engagement"], 30)

    def test_not_found_private_or_personal_gets_hebrew_note_and_others_continue(self):
        def fake_get(url, params=None, timeout=None):
            if "username(ghost)" in params["fields"]:
                return graph_error(110, "Invalid user id", 2207013)
            return FakeResponse(DISCOVERY_OK)

        with mock.patch.object(meta.httpx, "get", side_effect=fake_get):
            results = sig.competitor_posts(["ghost", "rival_bakery"], instagram_id="ig1", access_token="T")
        self.assertFalse(results[0]["ok"])
        self.assertEqual(results[0]["error_kind"], "not_found")
        self.assertIn("פרטי", results[0]["error_he"])
        self.assertIn("@ghost", results[0]["error_he"])
        self.assertTrue(results[1]["ok"])
        self.assertEqual(len(results[1]["posts"]), 3)

    def test_permission_error_stops_asking(self):
        with mock.patch.object(meta.httpx, "get", return_value=graph_error(10, "needs review", status=403)) as fake:
            results = sig.competitor_posts(["a", "b", "c"], instagram_id="ig1", access_token="T")
        self.assertEqual(fake.call_count, 1)
        self.assertTrue(all(r["error_kind"] == "permission" for r in results))
        self.assertTrue(all("אישור" in r["error_he"] for r in results))

    def test_field_fallback_and_request_shape(self):
        seen = []

        def fake_get(url, params=None, timeout=None):
            seen.append(params["fields"])
            if "media_product_type" in params["fields"]:
                return graph_error(100, "nonexisting field")
            return FakeResponse(DISCOVERY_OK)

        with mock.patch.object(meta.httpx, "get", side_effect=fake_get):
            found = meta.business_discovery("ig1", "T", "rival_bakery")
        self.assertEqual(found["username"], "rival_bakery")
        self.assertTrue(seen[0].startswith("business_discovery.username(rival_bakery){"))
        self.assertIn("media.limit(12)", seen[0])
        self.assertNotIn("media_product_type", seen[-1])


# --- prompt block ---------------------------------------------------------------------


class PromptBlockTest(unittest.TestCase):
    def test_no_data_forbids_claims(self):
        block = sig.prompt_block(None)
        self.assertIn("אין נתוני אינסטגרם מחוברים", block)
        self.assertIn("אסור לטעון מה עבד", block)
        self.assertIn("inspiration_refs ריק", block)
        self.assertIn("פתיחים גנריים", block)  # variety rule is always there

    def test_connected_but_empty_says_so(self):
        block = sig.prompt_block({"connected": True, "own_top_posts": [], "brief": None})
        self.assertIn("אינסטגרם מחובר", block)
        self.assertIn("אסור לטעון מה עבד", block)

    def test_with_own_posts_and_brief(self):
        top = sig._label(sig.rank_posts([own("m1", reach=1000, saved=60, shares=40, media_type="VIDEO", product="REELS")]), "O")
        brief = {
            "year": 2026,
            "month": 9,
            "summary": "רילס עם שאלה עובדים",
            "patterns": [
                {"category": "hook", "category_he": "הוק", "pattern": "פתיחה בשאלה", "strength": "strong", "source_refs": ["O1", "C1"]}
            ],
            "caveats": ["רק 2 פוסטים נותחו"],
            "catalogue": {
                "C1": {"ref": "C1", "handle": "rival", "hashtag": "", "format_he": "רילס", "hook": "למה?", "metrics": {"likes": 10}},
            },
        }
        block = sig.prompt_block({"connected": True, "own_top_posts": top, "brief": brief})
        self.assertIn("[O1]", block)
        self.assertIn("רילס", block)
        self.assertIn("שמירות 60", block)
        self.assertIn("לא להעתיק", block)
        self.assertIn("פתיחה בשאלה", block)
        self.assertIn("מקור: O1, C1", block)
        self.assertIn("[C1] @rival", block)
        self.assertIn("רק 2 פוסטים נותחו", block)
        self.assertNotIn("אין נתוני אינסטגרם מחוברים", block)
        self.assertIn("inspiration_refs", block)

    def test_brief_without_own_posts_is_explicit(self):
        brief = {"year": 2026, "month": 9, "summary": "", "caveats": [], "catalogue": {},
                 "patterns": [{"category": "format", "pattern": "קרוסלה", "strength": "weak", "source_refs": ["C1"]}]}
        block = sig.prompt_block({"own_top_posts": [], "brief": brief})
        self.assertIn("אין עדיין פוסטים של העסק עצמו", block)

    def test_attach_inspiration_drops_invented_refs(self):
        signal = {"catalogue": {"O1": {"ref": "O1", "permalink": "https://i/m1"}}}
        items = sig.attach_inspiration(
            [
                {"title": "א", "inspiration_refs": ["o1", "Z9"], "inspiration_note": "כמו הרילס שלך"},
                {"title": "ב", "inspiration_refs": ["Z9"], "inspiration_note": "המצאה"},
                {"title": "ג"},
            ],
            signal,
        )
        self.assertEqual(items[0]["inspiration"]["sources"], [{"ref": "O1", "permalink": "https://i/m1"}])
        self.assertIsNone(items[1]["inspiration"])
        self.assertIsNone(items[2]["inspiration"])
        self.assertNotIn("inspiration_refs", items[0])


# --- persistence and the brief --------------------------------------------------------


class PersistenceTest(DbCase):
    def test_store_media_upserts_and_keeps_missing_as_null(self):
        self.seed_posts()
        rows = {row.media_id: row for row in self.db.query(InstagramPost).all()}
        self.assertEqual(set(rows), {"m1", "m2"})
        self.assertEqual(rows["m1"].caption, "למה החלה נגמרת עד 9?\nכי אנחנו אופים 100 בלבד")  # full caption
        self.assertIsNone(rows["m2"].views)
        self.assertIn("views", loads(rows["m2"].metric_errors_json, {}))
        # A second sync updates in place.
        sig.store_media(self.db, self.business.id, {"posts": [{"id": "m1", "insights": {"reach": 2000, "saved": 1}}]})
        self.db.commit()
        self.assertEqual(self.db.query(InstagramPost).count(), 2)
        self.db.refresh(rows["m1"])
        self.assertEqual(rows["m1"].reach, 2000)
        self.assertIsNone(rows["m1"].shares)

    def test_top_own_posts_from_db(self):
        self.seed_posts()
        top = sig.top_own_posts(self.business)
        self.assertEqual([p["ref"] for p in top], ["O1", "O2"])
        self.assertEqual(top[0]["media_id"], "m1")
        self.assertEqual(top[0]["format"], "reel")
        self.assertEqual(top[0]["hook"], "למה החלה נגמרת עד 9?")
        self.assertEqual(top[0]["metrics"]["saved"], 60)

    def test_brief_is_built_cleaned_stored_and_upserted(self):
        self.seed_posts()
        own_top = sig.top_own_posts(self.business, db=self.db)
        competitors = [sig.parse_discovery("rival_bakery", DISCOVERY_OK["business_discovery"]),
                       sig._failed_handle("ghost", "not_found")]
        model_output = {
            "summary": "רילס שפותח בשאלה נשמר הכי הרבה",
            "patterns": [
                {"category": "format", "pattern": "רילס קצר", "evidence": "O1: 60 שמירות", "source_refs": ["O1", "C1"], "strength": "strong"},
                {"category": "timing", "pattern": "בוקר", "evidence": "", "source_refs": ["X7"], "strength": "strong"},
                {"category": "nonsense", "pattern": "משהו", "evidence": "", "source_refs": ["c2"], "strength": "maybe"},
            ],
            "caveats": ["@ghost לא נמצא"],
        }
        prompts = []
        with mock.patch.object(sig, "strategy_json", side_effect=lambda p, s: prompts.append(p) or json.dumps(model_output)):
            row = sig.build_inspiration_brief(self.db, self.business, 2026, 9, own=own_top, competitors=competitors)
            self.db.commit()
        self.assertEqual(len(prompts), 1)
        self.assertIn("[O1]", prompts[0])
        self.assertIn("[C1] @rival_bakery", prompts[0])
        self.assertIn("לא מצאנו את @ghost", prompts[0])
        stored = loads(row.brief_json, {})
        self.assertEqual([p["pattern"] for p in stored["patterns"]], ["רילס קצר", "משהו"])  # X7 dropped
        self.assertEqual(stored["patterns"][1]["category"], "topic")
        self.assertEqual(stored["patterns"][1]["strength"], "weak")
        self.assertEqual(stored["patterns"][1]["source_refs"], ["C2"])

        with mock.patch.object(sig, "strategy_json", return_value=json.dumps({"summary": "שני", "patterns": [], "caveats": []})):
            sig.build_inspiration_brief(self.db, self.business, 2026, 9, own=own_top, competitors=[])
            self.db.commit()
        self.assertEqual(self.db.query(InspirationBrief).count(), 1)
        self.assertEqual(loads(self.db.query(InspirationBrief).one().brief_json, {})["summary"], "שני")

    def test_no_posts_means_no_gemini_call(self):
        with mock.patch.object(sig, "strategy_json") as fake:
            row = sig.build_inspiration_brief(self.db, self.business, 2026, 9, own=[], competitors=[sig._failed_handle("x", "not_found")])
        self.assertIsNone(row)
        fake.assert_not_called()

    def test_brief_for_month_fallback_and_ref_remap(self):
        self.db.add_all(
            [
                InspirationBrief(business_id=self.business.id, year=2026, month=7, brief_json=dumps({"summary": "יולי"})),
                InspirationBrief(
                    business_id=self.business.id,
                    year=2026,
                    month=8,
                    brief_json=dumps({"summary": "אוגוסט", "patterns": [{"category": "hook", "pattern": "שאלה", "source_refs": ["O1"], "strength": "weak"}], "caveats": []}),
                    sources_json=dumps({"own": [{**own("m2", reach=800, saved=5), "ref": "O1"}], "competitors": []}),
                ),
            ]
        )
        self.db.commit()
        self.assertEqual(sig.brief_for(self.db, self.business.id, 2026, 9).month, 8)
        self.assertEqual(sig.brief_for(self.db, self.business.id, 2026, 7).month, 7)
        self.assertEqual(sig.brief_for(self.db, self.business.id, 2026, 1).month, 8)  # nothing earlier: newest

        # m2 was O1 in August's brief; today m1 outranks it, so the citation follows m2.
        self.seed_posts()
        signal = sig.signal_for(self.db, self.business, 2026, 9)
        self.assertEqual([p["media_id"] for p in signal["own_top_posts"]], ["m1", "m2"])
        pattern = signal["brief"]["patterns"][0]
        self.assertEqual(pattern["source_refs"], ["O2"])
        self.assertEqual(pattern["sources"][0]["permalink"], "https://www.instagram.com/p/m2/")
        self.assertIn("O2", signal["catalogue"])


class HashtagTest(DbCase):
    def test_flag_off_calls_nothing(self):
        with mock.patch.object(sig, "get_settings", return_value=SimpleNamespace(instagram_hashtag_search=False)), \
                mock.patch.object(meta, "hashtag_id") as search:
            result = sig.hashtag_top_posts(self.db, self.business, ["חלה"], instagram_id="ig1", access_token="T")
        self.assertFalse(result["enabled"])
        search.assert_not_called()

    def test_weekly_cap_of_30_unique_tags(self):
        now = datetime(2026, 9, 20, 12, 0)
        for index in range(30):
            self.db.add(HashtagQuery(business_id=self.business.id, instagram_id="ig1", hashtag=f"tag{index}",
                                     hashtag_id=f"id{index}", queried_at=now - timedelta(days=2)))
        # Older than the window: does not count.
        self.db.add(HashtagQuery(business_id=self.business.id, instagram_id="ig1", hashtag="old", queried_at=now - timedelta(days=8)))
        self.db.commit()
        media = [{"id": "h1", "caption": "חלה", "media_type": "IMAGE", "like_count": 5, "comments_count": 1, "permalink": "https://i/h1"}]
        with mock.patch.object(sig, "get_settings", return_value=SimpleNamespace(instagram_hashtag_search=True)), \
                mock.patch.object(meta, "hashtag_id", return_value="new-id") as search, \
                mock.patch.object(meta, "hashtag_top_media", return_value=media):
            result = sig.hashtag_top_posts(self.db, self.business, ["#NewTag", "tag3"], instagram_id="ig1", access_token="T", now=now)
        by_tag = {item["tag"]: item for item in result["results"]}
        self.assertFalse(by_tag["newtag"]["ok"])
        self.assertIn("30", by_tag["newtag"]["error_he"])
        self.assertTrue(by_tag["tag3"]["ok"])  # already in the window: free, and its id is cached
        search.assert_not_called()
        self.assertEqual(by_tag["tag3"]["posts"][0]["kind"], "hashtag")
        self.assertEqual(result["used_7d"], 30)

    def test_new_tag_is_recorded(self):
        with mock.patch.object(sig, "get_settings", return_value=SimpleNamespace(instagram_hashtag_search=True)), \
                mock.patch.object(meta, "hashtag_id", return_value="17843") as search, \
                mock.patch.object(meta, "hashtag_top_media", return_value=[]):
            result = sig.hashtag_top_posts(self.db, self.business, ["חלה"], instagram_id="ig1", access_token="T")
            self.db.commit()
        search.assert_called_once()
        self.assertEqual(result["used_7d"], 1)
        self.assertEqual(self.db.query(HashtagQuery).one().hashtag_id, "17843")


# --- the post writer ------------------------------------------------------------------


class PostPromptWiringTest(unittest.TestCase):
    POST = {
        "week": 1, "date_hint": "", "format": "reel", "title": "חלה", "angle": "", "hook": "למה?", "caption": "",
        "cta": "להזמנה", "calendar_tie": "", "goal_fit": "", "why_now": "", "image_prompt": "", "overlay_text": "",
        "primary_outlet": "instagram", "outlets": ["instagram"], "metrics_to_watch": [], "outlet_captions": {},
        "audience_name": "",
    }

    def run_writer(self, signal):
        prompts = []
        posts = [
            {**self.POST, "inspiration_refs": ["O1"], "inspiration_note": "כמו הרילס שלך"},
            {**self.POST, "title": "ב", "inspiration_refs": [], "inspiration_note": ""},
        ]
        with mock.patch.object(strategy_service, "strategy_json", side_effect=lambda p, s: prompts.append(p) or json.dumps({"posts": posts})):
            items = strategy_service._write_posts_for_weeks(
                {"name": "מאפייה", "business_model": "products", "instagram_signal": signal},
                {}, {"relevant_events": []}, {"voice": "חם"}, [1, 2],
            )
        return prompts[0], items

    def test_no_data_prompt_and_refs_dropped(self):
        prompt, items = self.run_writer(None)
        self.assertIn("אין נתוני אינסטגרם מחוברים", prompt)
        self.assertNotIn("instagram_signal", prompt)
        self.assertTrue(all(item["inspiration"] is None for item in items))

    def test_signal_reaches_the_prompt_and_posts(self):
        top = sig._label(sig.rank_posts([own("m1", reach=1000, saved=60, shares=40)]), "O")
        signal = {"connected": True, "own_top_posts": top, "brief": None,
                  "catalogue": {"O1": sig._compact_source(top[0])}}
        prompt, items = self.run_writer(signal)
        self.assertIn("[O1]", prompt)
        self.assertIn("שמירות 60", prompt)
        self.assertEqual(items[0]["inspiration"]["sources"][0]["permalink"], "https://www.instagram.com/p/m1/")
        self.assertEqual(items[0]["inspiration"]["note"], "כמו הרילס שלך")
        self.assertIsNone(items[1]["inspiration"])

    def test_rewrite_gets_the_block(self):
        prompts = []
        output = {"title": "t", "hook": "h", "caption": "c", "cta": "x", "overlay_text": "", "outlet_captions": {},
                  "inspiration_refs": ["C9"], "inspiration_note": "לא קיים"}
        with mock.patch.object(strategy_service, "lite_json", side_effect=lambda p, s, **k: prompts.append(p) or json.dumps(output)):
            result = strategy_service.rewrite_post(self.POST, "punchy", {"voice": "חם"}, instagram=None)
        self.assertIn("אין נתוני אינסטגרם מחוברים", prompts[0])
        self.assertIn("פתיח גנרי", prompts[0])
        self.assertIsNone(result["inspiration"])
        self.assertEqual(result["title"], "t")


# --- endpoints ------------------------------------------------------------------------


class EndpointTest(DbCase):
    def setUp(self):
        super().setUp()

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)

    def test_get_brief_not_connected_is_an_honest_200(self):
        response = self.client.get("/instagram/brief", params={"year": 2026, "month": 9})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body["meta_connected"])
        self.assertIsNone(body["brief"])
        self.assertEqual(body["own_top_posts"], [])
        self.assertTrue(body["empty_reason"])
        self.assertEqual(body["max_handles"], 5)
        self.assertEqual(body["hashtag_search"]["limit"], 30)

    def test_put_handles(self):
        response = self.client.put("/instagram/handles", json={"handles": ["@Rival", "https://instagram.com/peer.one/"]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["handles"], ["rival", "peer.one"])
        self.db.refresh(self.business)
        self.assertEqual(loads(self.business.instagram_handles_json, []), ["rival", "peer.one"])
        bad = self.client.put("/instagram/handles", json={"handles": ["שם בעברית"]})
        self.assertEqual(bad.status_code, 422)
        self.assertIn("אינו שם משתמש תקין", bad.json()["detail"])
        too_many = self.client.put("/instagram/handles", json={"handles": list("abcdef")})
        self.assertEqual(too_many.status_code, 422)
        self.assertEqual(self.client.get("/instagram/brief").json()["handles"], ["rival", "peer.one"])

    def test_refresh_without_meta_is_empty_and_calls_nothing(self):
        self.client.put("/instagram/handles", json={"handles": ["rival"]})
        with mock.patch.object(sig, "strategy_json") as gemini, mock.patch.object(meta.httpx, "get") as http:
            response = self.client.post("/instagram/brief/refresh", json={"year": 2026, "month": 9})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["refresh"]["status"], "empty")
        self.assertIn("לא מחובר", body["refresh"]["reason_he"])
        self.assertFalse(body["refresh"]["competitors"][0]["ok"])
        gemini.assert_not_called()
        http.assert_not_called()

    def test_refresh_connected_builds_and_serves_the_brief(self):
        self.connect_meta()
        self.seed_posts()
        self.client.put("/instagram/handles", json={"handles": ["rival_bakery", "ghost"]})

        def fake_get(url, params=None, timeout=None):
            self.assertEqual(params["access_token"], "PAGE_TOKEN")
            if "username(ghost)" in params["fields"]:
                return graph_error(110, "Cannot find User", 2207013)
            return FakeResponse(DISCOVERY_OK)

        output = {"summary": "רילס עם שאלה", "caveats": ["@ghost לא נמצא"],
                  "patterns": [{"category": "hook", "pattern": "שאלה בפתיחה", "evidence": "O1 ו-C1", "source_refs": ["O1", "C1"], "strength": "strong"}]}
        with mock.patch.object(meta.httpx, "get", side_effect=fake_get), \
                mock.patch.object(sig, "strategy_json", return_value=json.dumps(output)) as gemini:
            response = self.client.post("/instagram/brief/refresh", json={"year": 2026, "month": 9})
        self.assertEqual(response.status_code, 200, response.text)
        gemini.assert_called_once()
        body = response.json()
        self.assertEqual(body["refresh"]["status"], "created")
        self.assertEqual([c["ok"] for c in body["refresh"]["competitors"]], [True, False])
        self.assertTrue(body["meta_connected"])
        self.assertEqual(body["empty_reason"], "")
        brief = body["brief"]
        self.assertEqual(brief["month"], 9)
        self.assertNotIn("catalogue", brief)
        sources = brief["patterns"][0]["sources"]
        self.assertEqual([s["ref"] for s in sources], ["O1", "C1"])
        self.assertEqual(sources[1]["permalink"], "https://www.instagram.com/reel/c1/")
        self.assertEqual(brief["sources"]["competitors"][1]["handle"], "ghost")
        self.assertIn("פרטי", brief["sources"]["competitors"][1]["error_he"])
        self.assertEqual(body["own_top_posts"][0]["ref"], "O1")

        again = self.client.get("/instagram/brief", params={"year": 2026, "month": 10}).json()
        self.assertEqual(again["brief"]["month"], 9)  # newest earlier brief

    def test_refresh_gemini_failure_is_502(self):
        self.seed_posts()
        with mock.patch.object(sig, "strategy_json", side_effect=RuntimeError("quota")):
            response = self.client.post("/instagram/brief/refresh", json={})
        self.assertEqual(response.status_code, 502)
        self.assertEqual(self.db.query(InspirationBrief).count(), 0)


if __name__ == "__main__":
    unittest.main()
