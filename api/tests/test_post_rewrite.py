"""One-instruction rewrite (docs/posts-v2.md, Phase C).

The editor's text step sends one instruction: a chip ("קצר יותר", "להוסיף מחיר", "יותר
חם", "עם שאלה ללקוחות") or the owner's own words (at most 200 characters). The rewrite
gets the post's plan card, the featured item, what worked, the brand voice and the Hebrew
style; it keeps what the owner confirmed and never invents a price or a discount. With no
known price, "להוסיף מחיר" leaves the post as it is and asks "מה המחיר?".

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
from app.models import Business, Strategy, User
from app.services import connected_posts as cp
from app.services import post_rewrite as pr
from app.services import strategy as strategy_service
from app.services.hebrew_style import HEBREW_STYLE
from app.services.jsonutil import dumps, loads

TODAY = date.today()
YEAR, MONTH = TODAY.year, TODAY.month
BRAND = {"business_name": "מאפיית תום", "voice": "חם ושכונתי", "do_say": ["טרי"], "dont_say": ["הכי"], "palette": []}
CORE = {
    "theme": "חנוכה בשכונה",
    "monthly_horizon_plan": {"hypothesis": "אם נפרסם כל שבוע מארז, נגדיל את ההזמנות מראש", "targets": [],
                             "goal_he": "הזמנות מראש לחנוכה"},
    "weekly_breakdown": [{"week": 1, "focus": "הלקוחות הקבועים", "media_distribution": "אינסטגרם"}],
}


def post(**overrides) -> dict:
    item = {
        "uid": "aaaaaaaaa1",
        "week": 1,
        "format": "image",
        "title": "מארז שישי",
        "hook": "מה לוקחים לשישי",
        "caption": "חלה, ריבה ועוגה קטנה, הכול במארז אחד לשישי.",
        "cta": "כתבו לנו בוואטסאפ",
        "overlay_text": "מארז שישי",
        "primary_outlet": "instagram",
        "channel": "instagram",
        "outlets": ["instagram"],
        "outlet_captions": {"instagram": "חלה, ריבה ועוגה קטנה, הכול במארז אחד לשישי."},
        "mix_type": "offer",
        "audience_name": "הלקוחות הקבועים",
        "featured_item_id": cp.featured_item_id("מארז שישי"),
        "featured_item_name": "מארז שישי",
        "approval_status": "approved",
        "approved_at": "2026-10-01T08:00:00",
        "image_url": "/media/1/x.png",
        "image_source": "asset",
    }
    item.update(overrides)
    return item


def written(**overrides) -> dict:
    """The writer's answer (POST_REWRITE_SCHEMA)."""
    answer = {
        "title": "מארז שישי",
        "hook": "שישי בלי לרוץ",
        "caption": "חלה, ריבה ועוגה. מארז אחד.",
        "cta": "כתבו לנו בוואטסאפ",
        "overlay_text": "מארז שישי",
        "outlet_captions": {"instagram": "x", "facebook": "y", "whatsapp": "z"},
        "inspiration_refs": [],
        "inspiration_note": "",
        "owner_fact": "",
        "applied_learning": "",
    }
    answer.update(overrides)
    return answer


class Writer:
    """lite_json for the rewrite: records every prompt and answers PostRewrite."""

    def __init__(self, answer: dict):
        self.answer = answer
        self.prompts: list[str] = []

    def __call__(self, prompt, schema, **kwargs):
        if schema.get("title") != "PostRewrite":
            raise AssertionError(f"unexpected model call {schema.get('title')}")
        self.prompts.append(prompt)
        return json.dumps(self.answer, ensure_ascii=False)


class RewriteTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-rewrite-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)()
        self.addCleanup(self.db.close)
        self.owner = User(email="owner@example.com", password_hash="x", full_name="תום")
        self.db.add(self.owner)
        self.db.commit()
        self.business = Business(
            user_id=self.owner.id, name="מאפיית תום", website_url="https://bakery.example", business_type="food",
            offerings="לחם וחלות", monthly_budget_ils=0, primary_goal="sales", competitors_json="[]",
            onboarding_complete=1,
            scraped_profile_json=dumps({"brand_language": BRAND, "featured_items": {
                "items": [{"name": "מארז שישי", "reason": "best_seller", "note": ""}]}}),
        )
        self.db.add(self.business)
        self.db.commit()

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: self.owner
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app)
        offline = mock.patch.object(cp, "lite_json", side_effect=RuntimeError("offline"))
        offline.start()
        self.addCleanup(offline.stop)

    def month(self, *posts: dict) -> Strategy:
        extra = {"roadmap": {**CORE, "posts": list(posts)}, "brand_language": BRAND}
        strategy = Strategy(business_id=self.business.id, year=YEAR, month=MONTH, usp_json="{}", calendar_json="[]",
                            roadmap_json=dumps(extra))
        self.db.add(strategy)
        self.db.commit()
        return strategy

    def stored(self, strategy: Strategy, index: int = 0) -> dict:
        self.db.expire_all()
        return loads(self.db.get(Strategy, strategy.id).roadmap_json, {})["roadmap"]["posts"][index]

    def rewrite(self, writer: Writer | None, **body):
        payload = {"post_index": 0, **body}
        model = writer or Writer(written())
        with mock.patch.object(strategy_service, "lite_json", side_effect=model):
            return self.client.post("/strategy/posts/rewrite", json=payload)

    def set_featured_note(self, note: str):
        stored = loads(self.business.scraped_profile_json, {})
        stored["featured_items"]["items"][0]["note"] = note
        self.business.scraped_profile_json = dumps(stored)
        self.db.commit()


class MoneyTest(unittest.TestCase):
    def test_amounts_are_read_and_normalised(self):
        self.assertEqual(pr.money_in("מארז ב-120 ₪, ₪45 או 1,200 ש״ח. 30 שקלים."), {"120", "45", "1200", "30"})
        self.assertEqual(pr.percents_in("20% הנחה"), {"20"})
        self.assertTrue(pr.wants_price("להוסיף מחיר"))
        self.assertTrue(pr.wants_price("תכתבו שזה עולה 45 ₪"))
        self.assertFalse(pr.wants_price("קצר יותר"))

    def test_known_and_kept(self):
        item = post(caption="מארז ב-60 ₪, פתוחים 07:00", owner_prices=["60"])
        self.assertEqual(pr.known_money(item), {"60"})
        self.assertEqual(pr.kept_facts(item), ["60 ₪"])
        item["owner_fact_done"] = True
        self.assertEqual(pr.kept_facts(item), ["07:00", "60 ₪"])
        self.assertEqual(pr.known_money(post(), "להוסיף מחיר 45 ₪"), {"45"})
        self.assertEqual(pr.known_money(post(), "", {"name": "מארז", "why": "הכי נמכר, 120 ₪ למארז"}), {"120"})
        self.assertEqual(pr.known_money(post()), set())

    def test_the_guard(self):
        item = post(caption="מארז ב-60 ₪", owner_prices=["60"])
        dropped = pr.guard(item, {"caption": "מארז לשישי"})
        self.assertTrue(dropped.rejected)
        self.assertIn("60 ₪", dropped.message)
        discount = pr.guard(item, {"caption": "מארז ב-60 ₪, עכשיו 20% הנחה"})
        self.assertTrue(discount.rejected)
        invented = pr.guard(post(), {"caption": "מארז ב-39 ₪", "outlet_captions": {"facebook": "רק 39 ₪"}})
        self.assertFalse(invented.rejected)
        self.assertEqual(invented.fields["caption"], "מארז ב-[מחיר]")
        self.assertEqual(invented.fields["outlet_captions"]["facebook"], "רק [מחיר]")
        self.assertEqual(invented.placeholders, ["39"])
        kept = pr.guard(item, {"caption": "60 ₪ למארז שלם"})
        self.assertEqual((kept.rejected, kept.fields["caption"], kept.placeholders), (False, "60 ₪ למארז שלם", []))


class InstructionTest(RewriteTestCase):
    def test_a_chip_rewrites_with_the_whole_context_and_is_noted(self):
        strategy = self.month(post())
        writer = Writer(written(caption="חלה, ריבה ועוגה. מארז אחד, בלי לרוץ בשישי."))
        response = self.rewrite(writer, instruction="קצר יותר")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertTrue(body["changed"])
        self.assertIsNone(body["message"])
        self.assertEqual(body["instruction"], "קצר יותר")
        prompt = writer.prompts[0]
        self.assertIn(pr.INSTRUCTIONS["קצר יותר"], prompt)
        self.assertIn("המטרה של החודש: הזמנות מראש לחנוכה.", prompt)
        self.assertIn("שבוע 1 בתוכנית: הלקוחות הקבועים.", prompt)
        self.assertIn("למה הפוסט הזה: בשביל הזמנות מראש לחנוכה, ללקוחות הקבועים.", prompt)
        self.assertIn("סוג הפוסט בתמהיל: מבצע או הזמנה לפעולה.", prompt)
        self.assertIn("המוצר שבעל העסק בחר להבליט בפוסט: מארז שישי (הכי נמכר).", prompt)
        self.assertIn("הערוץ של הפוסט: אינסטגרם.", prompt)
        self.assertIn("איך נדע אם הצליח: לחיצות לוואטסאפ.", prompt)
        self.assertIn("אין מחיר ידוע. אל תכתוב מחיר.", prompt)
        self.assertIn("טון כללי: חם ושכונתי", prompt)
        self.assertIn(HEBREW_STYLE.strip()[:40], prompt)
        result = body["post"]
        self.assertEqual(result["caption"], "חלה, ריבה ועוגה. מארז אחד, בלי לרוץ בשישי.")
        self.assertEqual(result["outlet_captions"]["instagram"], result["caption"])
        self.assertEqual(result["rewrite_instruction"], "קצר יותר")
        # The result goes back to review, as every rewrite did.
        self.assertEqual(result["approval_status"], "review")
        self.assertEqual(result["lifecycle"], "ready")
        self.assertEqual(self.stored(strategy)["rewrite_instruction"], "קצר יותר")

    def test_the_owners_words_are_the_instruction(self):
        self.month(post())
        writer = Writer(written())
        response = self.rewrite(writer, instruction="  תזכירו שאנחנו   פתוחים גם בשבת  ")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn('בעל העסק ביקש, במילים שלו: "תזכירו שאנחנו פתוחים גם בשבת".', writer.prompts[0])
        self.assertEqual(response.json()["post"]["rewrite_instruction"], "תזכירו שאנחנו פתוחים גם בשבת")
        long = "תכתבו " + "ממש " * 20 + "קצר"
        response = self.rewrite(Writer(written()), instruction=long)
        self.assertEqual(response.json()["post"]["rewrite_instruction"], "הבקשה שלכם")

    def test_add_a_price_with_no_known_price_asks_the_owner(self):
        strategy = self.month(post())
        writer = Writer(written(caption="מארז ב-49 ₪"))
        response = self.rewrite(writer, instruction="להוסיף מחיר")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(writer.prompts, [])  # the writer was never asked to guess
        body = response.json()
        self.assertFalse(body["changed"])
        self.assertEqual(body["message"], pr.NO_PRICE_MESSAGE_HE)
        result = body["post"]
        self.assertEqual(result["caption"], post()["caption"])  # unchanged
        self.assertIn({"kind": "fact", "text": "מה המחיר?"}, result["owner_needs"])
        self.assertEqual(result["lifecycle"], "needs_owner")
        self.assertIsNone(result["rewrite_instruction"])
        self.assertNotIn("49", json.dumps(self.stored(strategy), ensure_ascii=False))

    def test_a_price_the_owner_typed_is_used_and_kept_as_theirs(self):
        strategy = self.month(post(owner_fact="מה המחיר?", owner_fact_done=False, approval_status="review"))
        writer = Writer(written(caption="חלה, ריבה ועוגה במארז אחד, 45 ₪."))
        response = self.rewrite(writer, instruction="להוסיף מחיר 45 ₪")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("המחירים המותרים בפוסט: 45 ₪. אסור מחיר אחר.", writer.prompts[0])
        result = response.json()["post"]
        self.assertIn("45 ₪", result["caption"])
        self.assertEqual(result["owner_needs"], [])  # the question is answered
        self.assertEqual(self.stored(strategy)["owner_prices"], ["45"])

    def test_a_price_in_the_featured_item_note_is_known(self):
        self.set_featured_note("120 ₪ למארז")
        self.month(post())
        writer = Writer(written(caption="המארז של שישי, 120 ₪."))
        response = self.rewrite(writer, instruction="להוסיף מחיר")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(writer.prompts), 1)
        self.assertIn("120 ₪", writer.prompts[0])
        self.assertTrue(response.json()["changed"])
        self.assertIn("120 ₪", response.json()["post"]["caption"])

    def test_confirmed_facts_stay_or_the_old_text_does(self):
        confirmed = post(caption="מארז ב-60 ₪, איסוף 07:00 עד 13:00", owner_fact="המחיר", owner_fact_done=True,
                         approval_status="review")
        strategy = self.month(confirmed)
        writer = Writer(written(caption="מארז לשישי, איסוף בבוקר."))
        response = self.rewrite(writer, instruction="קצר יותר")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("עובדות שבעל העסק כבר אישר. חובה להשאיר אותן בדיוק כמו שהן: 07:00, 13:00, 60 ₪.",
                      writer.prompts[0])
        body = response.json()
        self.assertFalse(body["changed"])
        self.assertEqual(body["message"], pr.DROPPED_FACT_MESSAGE_HE.format(fact="07:00"))
        self.assertEqual(self.stored(strategy)["caption"], "מארז ב-60 ₪, איסוף 07:00 עד 13:00")
        # Kept: the new version is used, and the fact the owner went over stays theirs.
        writer = Writer(written(caption="60 ₪ למארז. איסוף 07:00 עד 13:00.", owner_fact="המחיר של המארז"))
        body = self.rewrite(writer, instruction="קצר יותר").json()
        self.assertTrue(body["changed"])
        self.assertEqual(body["post"]["caption"], "60 ₪ למארז. איסוף 07:00 עד 13:00.")
        self.assertTrue(self.stored(strategy)["owner_fact_done"])
        self.assertEqual(body["post"]["owner_needs"], [])

    def test_an_invented_price_becomes_the_placeholder_and_a_question(self):
        strategy = self.month(post())
        response = self.rewrite(Writer(written(caption="מארז שלם ב-39 ₪ בלבד")), instruction="יותר חם")
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()["post"]
        self.assertEqual(result["caption"], "מארז שלם ב-[מחיר] בלבד")
        self.assertIn({"kind": "fact", "text": "לבדוק את המחיר"}, result["owner_needs"])
        self.assertNotIn("39", json.dumps(self.stored(strategy), ensure_ascii=False))

    def test_an_invented_discount_is_not_used(self):
        strategy = self.month(post())
        response = self.rewrite(Writer(written(caption="רק השבוע: 20% הנחה על המארז")), instruction="עם שאלה ללקוחות")
        body = response.json()
        self.assertFalse(body["changed"])
        self.assertEqual(body["message"], pr.INVENTED_DISCOUNT_MESSAGE_HE)
        self.assertEqual(self.stored(strategy)["caption"], post()["caption"])
        self.assertEqual(self.stored(strategy)["approval_status"], "approved")  # nothing changed

    def test_saving_or_approving_ends_the_note_and_confirms_the_prices(self):
        strategy = self.month(post(approval_status="review"))
        self.rewrite(Writer(written()), instruction="יותר חם")
        self.assertEqual(self.stored(strategy)["rewrite_instruction"], "יותר חם")
        saved = self.client.post("/strategy/posts/save", json={
            "post_index": 0, "title": "מארז שישי", "format": "image", "hook": "h", "caption": "מארז ב-55 ₪",
            "cta": "כתבו לנו", "primary_outlet": "instagram", "outlets": ["instagram"]})
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertIsNone(saved.json()["post"]["rewrite_instruction"])
        self.assertEqual(self.stored(strategy)["owner_prices"], ["55"])
        self.rewrite(Writer(written(caption="מארז ב-55 ₪, חם מהתנור")), instruction="יותר חם")
        approved = self.client.post("/strategy/posts/approve", json={"post_index": 0})
        self.assertIsNone(approved.json()["post"]["rewrite_instruction"])

    def test_the_old_tone_call_still_works_and_one_of_the_two_is_needed(self):
        self.month(post())
        writer = Writer(written())
        response = self.rewrite(writer, tone="punchy")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("קצרצר וקצבי", writer.prompts[0])
        self.assertEqual(response.json()["post"]["rewrite_instruction"], "קצר יותר")
        self.assertEqual(self.rewrite(None).status_code, 422)
        self.assertEqual(self.rewrite(None, instruction="   ").status_code, 422)
        self.assertEqual(self.rewrite(None, instruction="א" * 201).status_code, 422)

    def test_a_writer_failure_is_an_honest_error(self):
        self.month(post())
        with mock.patch.object(strategy_service, "lite_json", side_effect=RuntimeError("503")):
            response = self.client.post("/strategy/posts/rewrite", json={"post_index": 0, "instruction": "קצר יותר"})
        self.assertEqual(response.status_code, 502)
        self.assertIn("לא הצלחנו", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
