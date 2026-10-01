"""Hypothesis statuses that move (docs/posts-v2.md, Phase C).

The month's hypothesis, its targets and the 3-month plan's assumptions each get a status
(measuring / on_track / confirmed / not_yet / changed) and one evidence line. Rules decide
the status and the numbers: measured posts split by a visible trait, WhatsApp taps this
month, the latest refresh's site and Instagram numbers, the targets' own numbers. The cheap
model may only re-phrase a line, behind the same guard as the posts' learning lines.

Hermetic: a throwaway SQLite file per test, every model call is a fake, no network.
"""

import _test_env  # noqa: F401  (must come before any `app` import)

import io
import json
import shutil
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Business, Integration, PerformanceSnapshot, Strategy, User, WhatsappClick, WhatsappLink
from app.routers import performance as performance_router
from app.routers import strategy as strategy_router
from app.services import connected_posts as cp
from app.services import ga4 as ga4_service
from app.services import hypotheses as hy
from app.services.jsonutil import dumps, loads

TODAY = date.today()
FIXED = (2026, 9)  # the unit tests' month, read on a chosen day
BRAND = {"business_name": "מאפיית תום", "voice": "חם", "do_say": [], "dont_say": [], "palette": []}

PRICE_BET = "אנחנו מניחים שמחיר בפוסט יביא יותר פניות בוואטסאפ"
REEL_BET = "רילס מהתנור בבוקר יביא יותר שמירות ושיתופים מתמונות מדף."
ORDERS_BET = "אנחנו מניחים שהזמנות מראש לחגים יביאו יותר הזמנות באתר מפוסטים של מוצר מוכן."
MONTH_HYPOTHESIS = "אם נפתח את ההזמנות לחג בוואטסאפ מוקדם יותר, החלות יימכרו מראש."
WHATSAPP_TARGET = "לפחות 120 הזמנות מראש בוואטסאפ"
UNSEEN_TARGET = "כל החלות לערב החג נמכרות מראש"


def core(targets=None, hypothesis=MONTH_HYPOTHESIS) -> dict:
    return {
        "theme": "חגים",
        "monthly_horizon_plan": {"hypothesis": hypothesis, "targets": list(targets or []), "goal_he": "הזמנות לחג"},
        "weekly_breakdown": [{"week": 1, "focus": "פותחים הזמנות", "media_distribution": "אינסטגרם"}],
    }


def measured(uid: str, value: int, *, metric: str = "whatsapp_clicks", price: bool = False, fmt: str = "image",
             mix: str = "product", year: int = FIXED[0], month: int = FIXED[1], **results) -> dict:
    key = cp.RESULT_KEY.get(metric, metric)
    return {
        "uid": uid, "week": 1, "format": fmt, "title": f"פוסט {uid}", "hook": "פתיחה",
        "caption": f"מארז חג ב-60 ₪, {uid}" if price else f"מארז חג טרי, {uid}",
        "cta": "כתבו לנו בוואטסאפ" if metric == "whatsapp_clicks" else "לפרטים",
        "primary_outlet": "instagram", "channel": "instagram", "mix_type": mix, "approval_status": "approved",
        "published_url": f"https://www.instagram.com/p/{uid}/", "published_at": f"{year}-{month:02d}-03T10:00:00",
        "results": {"updated_at": "x", "metric": metric, "value": value, key: value, "matched_by": ["test"], **results},
    }


class HypothesisTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-hypotheses-"))
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
            user_id=self.owner.id, name="מאפיית תום", website_url="https://bakery.example", business_type="food",
            offerings="לחם", monthly_budget_ils=0, primary_goal="sales", competitors_json="[]", onboarding_complete=1,
            scraped_profile_json=dumps({"brand_language": BRAND}),
        )
        self.db.add(self.business)
        self.db.commit()

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: self.owner
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app)
        # Every cheap-model call is offline unless a test answers for it.
        for module in (cp, hy):
            patcher = mock.patch.object(module, "lite_json", side_effect=RuntimeError("offline"))
            patcher.start()
            self.addCleanup(patcher.stop)
        self.codes = iter(range(1000, 9999))

    # --- helpers ---------------------------------------------------------------------------

    def plan(self, *bets: str):
        stored = loads(self.business.scraped_profile_json, {})
        stored["quarter_plan"] = {"assumptions": [{"bet_he": bet, "if_wrong_he": "נשנה כיוון"} for bet in bets]}
        self.business.scraped_profile_json = dumps(stored)
        self.db.commit()

    def month(self, posts=(), *, year: int = FIXED[0], month: int = FIXED[1], plan: dict | None = None,
              review: dict | None = None) -> Strategy:
        extra = {"roadmap": {**(plan or core()), "posts": list(posts)}, "brand_language": BRAND}
        if review is not None:
            extra[hy.REVIEW_KEY] = review
        strategy = Strategy(business_id=self.business.id, year=year, month=month, usp_json="{}", calendar_json="[]",
                            roadmap_json=dumps(extra))
        self.db.add(strategy)
        self.db.commit()
        return strategy

    def clicks(self, count: int, day: str, source: str = "ig-bio"):
        link = self.db.query(WhatsappLink).filter_by(business_id=self.business.id, source_key=source).first()
        if link is None:
            link = WhatsappLink(business_id=self.business.id, code=f"c{next(self.codes)}", source_key=source)
            self.db.add(link)
            self.db.flush()
        if count:
            self.db.add(WhatsappClick(business_id=self.business.id, link_id=link.id, day=day, ua_family="ios", count=count))
        self.db.commit()

    def snapshot(self, sessions=None, followers=None):
        ga4 = {"overview": {"sessions": str(sessions)}} if sessions is not None else {}
        meta = {"account": {"followers_count": followers, "windows": {}}} if followers is not None else {}
        self.db.add(PerformanceSnapshot(business_id=self.business.id, period_start="", period_end="",
                                        ga4_json=dumps(ga4), meta_json=dumps(meta), diagnostic_json="{}"))
        self.db.commit()

    def refresh(self, strategy: Strategy, day: int = 20, closing=None) -> dict:
        review = hy.refresh_strategy(self.db, self.business, strategy, closing=closing,
                                     today=date(strategy.year, strategy.month, day))
        self.db.commit()
        return {item["key"]: item for item in review["items"]}

    def view(self, strategy: Strategy) -> dict:
        self.db.expire_all()
        stored = self.db.get(Strategy, strategy.id)
        roadmap = loads(stored.roadmap_json, {})["roadmap"]
        profile = loads(self.business.scraped_profile_json, {})
        review = hy.review_view(hy.stored_review(stored), cp.strategy_core(roadmap), profile.get("quarter_plan"), profile)
        return {item["key"]: item for item in review["items"]}


# --- reading the sentences ----------------------------------------------------------------------


class ParseTest(unittest.TestCase):
    def test_what_we_do_what_should_grow_and_against_what(self):
        self.assertEqual(hy.parse(ORDERS_BET), {"trait": "offer", "metric": "conversions", "against": "product"})
        self.assertEqual(hy.parse(REEL_BET), {"trait": "reel", "metric": "saves", "against": "image"})
        self.assertEqual(hy.parse(PRICE_BET), {"trait": "price", "metric": "whatsapp_clicks", "against": None})
        self.assertEqual(hy.parse("אם נשאל את הלקוחות שאלה בפתיחה, נקבל יותר תגובות")["trait"], "question")
        self.assertEqual(hy.parse("נהיה נחמדים יותר")["trait"], None)

    def test_where_a_target_is_counted(self):
        cases = {
            WHATSAPP_TARGET: "whatsapp_clicks",
            "50 הזמנות באתר": "conversions",
            "2,000 כניסות לאתר": "site_visits",
            "1,000 עוקבים באינסטגרם": "followers",
            UNSEEN_TARGET: None,
            "400 לקוחות קבועים ברשימת הוואטסאפ": None,
            "70% פחות שאלות על שעות הפתיחה": None,
            "25% יותר חלות בשישי": None,
        }
        for text, source in cases.items():
            self.assertEqual(hy.target_source(text), source, text)


# --- the rules, one status at a time -----------------------------------------------------------


class AssumptionStatusTest(HypothesisTestCase):
    def setUp(self):
        super().setUp()
        self.plan(PRICE_BET, REEL_BET)

    def test_measuring_says_what_is_missing(self):
        strategy = self.month([measured("p1", 20, price=True), measured("r1", 30, metric="saves", fmt="reel")])
        items = self.refresh(strategy)
        price, reel = items["assumption:0"], items["assumption:1"]
        self.assertEqual(price["status"], "measuring")
        self.assertEqual(price["evidence_he"], "עד עכשיו יש תוצאה רק לפוסט אחד עם מחיר. צריך לפחות 2 כדי להשוות.")
        self.assertEqual(reel["status"], "measuring")
        self.assertEqual(reel["evidence_he"], "עד עכשיו יש תוצאה רק לריל אחד. צריך לפחות 2 כדי להשוות.")
        strategy = self.month([measured("p1", 20, price=True), measured("p2", 22, price=True)], month=10)
        self.assertEqual(self.refresh(strategy)["assumption:0"]["evidence_he"],
                         "צריך גם פוסט בלי מחיר עם תוצאה, כדי להשוות.")

    def test_on_track_and_confirmed(self):
        posts = [measured("p1", 30, price=True), measured("p2", 25, price=True), measured("p3", 5, price=True),
                 measured("n1", 10), measured("n2", 12)]
        strategy = self.month(posts)
        price = self.refresh(strategy)["assumption:0"]
        self.assertEqual(price["status"], "on_track")
        self.assertEqual(price["evidence_he"],
                         "2 מתוך 3 פוסטים עם מחיר הביאו יותר לחיצות לוואטסאפ מהפוסטים בלי מחיר.")
        self.assertEqual(self.view(strategy)["assumption:0"]["status_he"], "בדרך")
        # When the month closes, what supports it is its verdict.
        self.assertEqual(self.refresh(strategy, closing=True)["assumption:0"]["status"], "confirmed")
        self.assertEqual(self.view(strategy)["assumption:0"]["status_he"], "התאמתה")

    def test_strong_evidence_confirms_before_the_month_ends(self):
        posts = [measured(f"p{i}", v, price=True) for i, v in enumerate((30, 25, 20, 5))]
        strategy = self.month(posts + [measured("n1", 10), measured("n2", 12)])
        price = self.refresh(strategy)["assumption:0"]
        self.assertEqual(price["status"], "confirmed")
        self.assertEqual(price["evidence_he"],
                         "3 מתוך 4 פוסטים עם מחיר הביאו יותר לחיצות לוואטסאפ מהפוסטים בלי מחיר.")

    def test_not_yet(self):
        posts = [measured("p1", 5, price=True), measured("p2", 8, price=True), measured("p3", 30, price=True),
                 measured("n1", 10), measured("n2", 12)]
        strategy = self.month(posts)
        price = self.refresh(strategy)["assumption:0"]
        self.assertEqual(price["status"], "not_yet")
        self.assertEqual(price["evidence_he"],
                         "רק 1 מתוך 3 פוסטים עם מחיר הביא יותר לחיצות לוואטסאפ מהפוסטים בלי מחיר.")
        self.assertEqual(self.view(strategy)["assumption:0"]["status_he"], "בינתיים לא")
        self.refresh(strategy, closing=True)
        self.assertEqual(self.view(strategy)["assumption:0"]["status_he"], "לא התאמתה")

    def test_against_the_kind_it_names(self):
        posts = [measured("r1", 40, metric="saves", fmt="reel"), measured("r2", 35, metric="saves", fmt="reel"),
                 measured("i1", 12, metric="saves"), measured("c1", 90, metric="saves", fmt="carousel")]
        strategy = self.month(posts)
        reel = self.refresh(strategy)["assumption:1"]
        # Against the images it names, not against the carousel.
        self.assertEqual(reel["status"], "on_track")
        self.assertEqual(reel["evidence_he"], "2 מתוך 2 רילס נשמרו יותר מהפוסטים של תמונה.")

    def test_changed_when_the_plan_moves_and_until_there_is_evidence(self):
        old = {"items": [{"key": "assumption:0", "kind": "assumption", "text_he": "השערה ישנה על מחיר",
                          "status": "on_track", "evidence_he": "2 מתוך 3"}]}
        strategy = self.month([measured("p1", 20, price=True)], review=old)
        # On read, before any refresh: the text moved, so it says so.
        self.assertEqual(self.view(strategy)["assumption:0"]["status"], "changed")
        self.assertEqual(self.view(strategy)["assumption:0"]["status_he"], "השתנתה")
        price = self.refresh(strategy)["assumption:0"]
        self.assertEqual(price["status"], "changed")
        self.assertEqual(price["previous_he"], "השערה ישנה על מחיר")
        self.assertEqual(price["evidence_he"], hy.CHANGED_HE["hypothesis"])
        self.assertEqual(self.refresh(strategy)["assumption:0"]["status"], "changed")  # still no evidence
        stored = loads(self.db.get(Strategy, strategy.id).roadmap_json, {})
        stored["roadmap"]["posts"] += [measured("p2", 30, price=True), measured("p3", 28, price=True), measured("n1", 4)]
        strategy.roadmap_json = dumps(stored)
        self.db.commit()
        self.assertEqual(self.refresh(strategy)["assumption:0"]["status"], "on_track")


class TargetStatusTest(HypothesisTestCase):
    def test_whatsapp_against_the_months_pace(self):
        strategy = self.month([measured("p1", 3)], plan=core([WHATSAPP_TARGET, "130 פניות בוואטסאפ"]))
        self.assertEqual(self.refresh(strategy)["target:0"]["evidence_he"],
                         "צריך את קישור הוואטסאפ שלנו כדי לספור פניות. מכינים אותו בעמוד החיבורים.")
        self.clicks(70, "2026-09-12")
        items = self.refresh(strategy, day=20)
        self.assertEqual(items["target:0"]["status"], "on_track")
        self.assertEqual(items["target:0"]["evidence_he"], "70 לחיצות לוואטסאפ החודש, מול יעד של 120.")
        self.assertEqual(items["target:1"]["status"], "on_track")
        early = self.refresh(strategy, day=5)["target:0"]
        self.assertEqual(early["status"], "measuring")
        self.assertEqual(early["evidence_he"], "מוקדם לדעת: 70 לחיצות לוואטסאפ החודש, מול יעד של 120.")
        late = self.refresh(strategy, day=29)["target:0"]
        self.assertEqual(late["status"], "not_yet")  # 70 < 80% of 116
        self.assertEqual(self.view(strategy)["target:0"]["status_he"], "מתחת לקצב")
        self.refresh(strategy, closing=True)
        self.assertEqual(self.view(strategy)["target:0"]["status_he"], "לא הושג")

    def test_taps_are_never_confirmed_as_orders(self):
        strategy = self.month([measured("p1", 3)], plan=core([WHATSAPP_TARGET, "130 פניות בוואטסאפ"]))
        self.clicks(130, "2026-09-08")
        items = self.refresh(strategy, day=20)
        self.assertEqual(items["target:0"]["status"], "on_track")  # 130 taps, the target is orders
        self.assertEqual(items["target:1"]["status"], "confirmed")  # 130 taps, the target is taps
        self.assertEqual(self.view(strategy)["target:1"]["status_he"], "הושג")

    def test_site_numbers_unseen_numbers_and_a_change(self):
        strategy = self.month([], plan=core(["2,000 כניסות לאתר", UNSEEN_TARGET, "30% יותר פניות בוואטסאפ"]))
        items = self.refresh(strategy)
        self.assertEqual(items["target:0"]["evidence_he"], "צריך לחבר את נתוני האתר כדי למדוד את זה.")
        self.assertEqual(items["target:1"]["status"], "measuring")
        self.assertEqual(items["target:1"]["evidence_he"], hy.UNSEEN_HE)
        self.snapshot(sessions=1900)
        self.clicks(20, "2026-08-10")
        self.clicks(30, "2026-09-10")
        items = self.refresh(strategy, day=20)
        self.assertEqual(items["target:0"]["status"], "on_track")
        self.assertEqual(items["target:0"]["evidence_he"], "1,900 כניסות לאתר ב-28 הימים האחרונים, מול יעד של 2,000.")
        self.assertEqual(items["target:2"]["status"], "on_track")
        self.assertEqual(items["target:2"]["evidence_he"],
                         "50% יותר פניות בוואטסאפ מאשר באותם ימים בחודש הקודם, מול יעד של 30%.")

    def test_the_month_hypothesis_follows_its_measurable_targets(self):
        strategy = self.month([measured("p1", 3)], plan=core([UNSEEN_TARGET, WHATSAPP_TARGET]))
        self.assertEqual(self.refresh(strategy)["month"]["status"], "measuring")
        self.clicks(70, "2026-09-12")
        month = self.refresh(strategy, day=20)["month"]
        self.assertEqual(month["status"], "on_track")
        self.assertEqual(month["evidence_he"], "70 לחיצות לוואטסאפ החודש, מול יעד של 120.")
        self.assertEqual(self.view(strategy)["month"]["status_he"], "בדרך")


# --- the phrasing and its guard -----------------------------------------------------------------


class PhraseTest(HypothesisTestCase):
    TEMPLATE = "2 מתוך 3 פוסטים עם מחיר הביאו יותר לחיצות לוואטסאפ מהפוסטים בלי מחיר."

    def setUp(self):
        super().setUp()
        self.plan(PRICE_BET)
        posts = [measured("p1", 30, price=True), measured("p2", 25, price=True), measured("p3", 5, price=True),
                 measured("n1", 10), measured("n2", 12)]
        self.strategy = self.month(posts)

    def answer(self, text: str):
        return mock.patch.object(hy, "lite_json",
                                 return_value=json.dumps({"lines": [{"ref": "assumption:0", "text": text}]}, ensure_ascii=False))

    def test_the_guard(self):
        self.assertTrue(hy.acceptable("2 מתוך 3 פוסטים עם מחיר הביאו יותר פניות מהפוסטים בלי מחיר.", self.TEMPLATE))
        self.assertFalse(hy.acceptable("4 מתוך 3 פוסטים עם מחיר הצליחו.", self.TEMPLATE))  # a new number
        self.assertFalse(hy.acceptable("2 פוסטים עם מחיר הצליחו.", self.TEMPLATE))  # a number dropped
        self.assertFalse(hy.acceptable("2 מתוך 3 הצליחו בגלל המחיר.", self.TEMPLATE))  # a cause
        self.assertFalse(hy.acceptable("2 מתוך 3 פוסטים עם מחיר לא הביאו יותר.", self.TEMPLATE))  # flipped
        self.assertFalse(hy.acceptable("", self.TEMPLATE))

    def test_a_good_phrase_is_used_once_until_the_facts_change(self):
        line = "2 מתוך 3 פוסטים עם מחיר הביאו יותר פניות מהפוסטים בלי מחיר."
        with self.answer(line) as model:
            self.assertEqual(self.refresh(self.strategy)["assumption:0"]["evidence_he"], line)
            self.refresh(self.strategy)
        self.assertEqual(model.call_count, 1)  # the same facts are not phrased again
        prompt = model.call_args[0][0]
        self.assertIn(self.TEMPLATE, prompt)
        self.assertIn("מצב: בדרך", prompt)

    def test_a_phrase_that_strays_falls_back_to_the_template(self):
        for text in ("4 מתוך 5 פוסטים עם מחיר הצליחו.", "2 מתוך 3 הביאו יותר בגלל המחיר."):
            with self.answer(text):
                stored = loads(self.strategy.roadmap_json, {})
                stored.pop(hy.REVIEW_KEY, None)
                self.strategy.roadmap_json = dumps(stored)
                self.db.commit()
                self.assertEqual(self.refresh(self.strategy)["assumption:0"]["evidence_he"], self.TEMPLATE)

    def test_the_template_when_the_model_is_unavailable(self):
        with mock.patch.object(hy, "lite_json", side_effect=RuntimeError("402 RESOURCE_EXHAUSTED")):
            self.assertEqual(self.refresh(self.strategy)["assumption:0"]["evidence_he"], self.TEMPLATE)


# --- where it runs and where it is read ---------------------------------------------------------


class EndpointTest(HypothesisTestCase):
    def setUp(self):
        super().setUp()
        self.plan(PRICE_BET, REEL_BET)
        posts = [measured("p1", 30, price=True, year=TODAY.year, month=TODAY.month),
                 measured("p2", 25, price=True, year=TODAY.year, month=TODAY.month),
                 measured("p3", 5, price=True, year=TODAY.year, month=TODAY.month),
                 measured("n1", 10, year=TODAY.year, month=TODAY.month),
                 measured("n2", 12, year=TODAY.year, month=TODAY.month)]
        self.current = self.month(posts, year=TODAY.year, month=TODAY.month,
                                  plan=core(["לפחות 1,000 כניסות לאתר", UNSEEN_TARGET]))
        self.db.add(Integration(business_id=self.business.id, provider="ga4", status="connected",
                                external_id="properties/1", access_token_enc="enc"))
        self.db.commit()

    def sync(self):
        report = {"overview": {"sessions": "1500"}, "campaigns": [], "landing_pages": []}
        with mock.patch.object(performance_router, "tokens_for", return_value=("a", "r", None)), \
                mock.patch.object(ga4_service, "fetch_report", return_value=report), \
                mock.patch.object(performance_router, "diagnose", return_value={}):
            response = self.client.post("/performance/sync")
        self.assertEqual(response.status_code, 200, response.text)

    def test_the_refresh_writes_and_the_plan_and_today_read(self):
        before = self.client.get("/strategy/current").json()["hypothesis_review"]
        self.assertIsNone(before["updated_at"])
        self.assertEqual({item["status"] for item in before["items"]}, {"measuring"})
        self.assertEqual(before["items"][0]["evidence_he"], hy.PENDING_HE)
        self.sync()
        review = self.client.get("/strategy/current").json()["hypothesis_review"]
        items = {item["key"]: item for item in review["items"]}
        self.assertTrue(review["updated_at"])
        self.assertEqual([item["kind"] for item in review["items"]], ["month", "target", "target", "assumption", "assumption"])
        self.assertEqual((items["target:0"]["status"], items["target:0"]["status_he"]), ("confirmed", "הושג"))
        self.assertEqual(items["target:0"]["evidence_he"], "1,500 כניסות לאתר ב-28 הימים האחרונים, מול יעד של 1,000.")
        self.assertEqual(items["target:1"]["status"], "measuring")
        self.assertEqual(items["month"]["status"], "confirmed")
        self.assertEqual(items["assumption:0"]["status"], "on_track")
        self.assertEqual(items["assumption:0"]["if_wrong_he"], "נשנה כיוון")
        self.assertNotIn("facts", items["assumption:0"])  # the rules' working stays on the server
        trial = self.client.get("/trial").json()["hypotheses"]
        self.assertEqual([h["kind"] for h in trial], ["month", "assumption", "assumption"])
        self.assertEqual(trial[1]["status_he"], "בדרך")
        self.assertEqual(trial[1]["evidence_he"],
                         "2 מתוך 3 פוסטים עם מחיר הביאו יותר לחיצות לוואטסאפ מהפוסטים בלי מחיר.")
        self.assertEqual(trial[2]["status"], "measuring")

    def test_whatsapp_only_refresh_still_moves_them(self):
        self.db.query(Integration).delete()
        self.business.whatsapp_number_e164 = "+972501234567"
        self.db.commit()
        self.assertEqual(self.client.post("/performance/sync").status_code, 400)
        review = self.client.get("/strategy/current").json()["hypothesis_review"]
        self.assertTrue(review["updated_at"])

    def test_the_month_closes_with_the_next_months_generation(self):
        seen = {}

        def generate(payload, **kwargs):
            seen["prior"] = kwargs.get("prior")
            return {"complete": False}

        with mock.patch.object(strategy_router, "generate_monthly_strategy", side_effect=generate):
            self.assertFalse(strategy_router.run_next_month_stage(self.db, self.business))
        self.db.expire_all()
        review = hy.stored_review(self.db.get(Strategy, self.current.id))
        self.assertTrue(review["closed"])
        items = {item["key"]: item for item in review["items"]}
        self.assertEqual(items["assumption:0"]["status"], "confirmed")  # on track, and the month is over
        self.assertIn({"text": PRICE_BET, "status": "confirmed", "evidence": items["assumption:0"]["evidence_he"]},
                      seen["prior"]["hypotheses"])
        view = self.client.get("/strategy/current").json()["hypothesis_review"]
        self.assertTrue(view["closed"])

    def test_the_weekly_job_refreshes_them(self):
        from app.jobs import weekly_research

        run = SimpleNamespace(id=1, status="done")
        with mock.patch.object(weekly_research, "SessionLocal", self.Session), \
                mock.patch.object(weekly_research, "engine", self.engine), \
                mock.patch.object(weekly_research, "migrate_db", lambda: None), \
                mock.patch.object(weekly_research.research, "run_research", return_value=run), \
                mock.patch.object(weekly_research.research, "serialize_run", return_value={"insights": []}), \
                redirect_stdout(io.StringIO()) as out:
            self.assertEqual(weekly_research.main(["--force"]), 0)
        self.assertIn("hyp   business=", out.getvalue())
        self.db.expire_all()
        review = hy.stored_review(self.db.get(Strategy, self.current.id))
        self.assertEqual({item["key"]: item["status"] for item in review["items"]}["assumption:0"], "on_track")


if __name__ == "__main__":
    unittest.main()
