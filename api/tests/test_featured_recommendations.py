"""Grounding, account scope and service content in the real feature API."""
import _test_env  # noqa: F401
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Business, ResearchRun, Strategy, User
from app.services import strategy
from app.services.jsonutil import dumps, loads

class FeaturedRecommendationsTest(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory(prefix="featured-proof-"); self.addCleanup(tmp.cleanup)
        self.engine=create_engine(f"sqlite:///{Path(tmp.name)/'proof.db'}",connect_args={"check_same_thread":False})
        self.addCleanup(self.engine.dispose); Base.metadata.create_all(self.engine)
        self.db=sessionmaker(bind=self.engine,autoflush=False)(); self.addCleanup(self.db.close)
        self.user=User(email="example@example.com",password_hash="x",full_name="Synthetic"); self.db.add(self.user); self.db.flush()
        self.business=Business(user_id=self.user.id, name="סטודיו", offerings="תכנון סלון, עיצוב מטבח",business_model="services")
        other_user=User(email="other@example.com",password_hash="x",full_name="Synthetic other")
        self.db.add(other_user); self.db.flush()
        self.other=Business(user_id=other_user.id,name="עסק אחר",offerings="סוד של עסק אחר")
        self.db.add_all([self.business,self.other]); self.db.commit()
        def database(): yield self.db
        app.dependency_overrides[get_db]=database
        app.dependency_overrides[get_current_user]=lambda:self.user
        self.addCleanup(app.dependency_overrides.clear); self.client=TestClient(app)
    def profile(self,value):
        self.business.scraped_profile_json=dumps(value); self.db.commit()
    def get(self):
        response=self.client.get("/business/featured-items"); self.assertEqual(response.status_code,200,response.text); return response.json()
    def insight(self,business=None,age=0,confidence="strong",title="מחפשים עיצוב מטבח",evidence=True):
        self.db.add(ResearchRun(business_id=(business or self.business).id,status="done",created_at=datetime.utcnow()-timedelta(days=age),insights_json=dumps({"items":[{"title":title,"text":"עיצוב מטבח","plan_change":"להסביר עיצוב מטבח", "confidence":confidence,"evidence":[{"id":"own-finding","origin":"search"}] if evidence else []}]}))); self.db.commit()
    def test_research_ranks_only_known_offers_without_write_or_model_work(self):
        self.insight(title="מחפשים עיצוב מטבח וגם שירות שאין לנו")
        before=self.business.scraped_profile_json
        with patch("app.services.gemini.generate_json") as model:
            data=self.get()
        model.assert_not_called(); self.assertEqual(self.business.scraped_profile_json,before)
        self.assertEqual(data["recommendations"][0]["name"],"עיצוב מטבח")
        self.assertEqual(data["recommendations"][0]["source_he"],"המחקר השוטף")
        self.assertNotIn("שירות שאין לנו",[r["name"] for r in data["recommendations"]])
        self.assertNotIn("רווחי",data["recommendations"][0]["why_he"])
    def test_stale_weak_unsourced_and_other_business_research_are_not_recommendation_evidence(self):
        for kwargs in ({"age":46},{"confidence":"weak"},{"evidence":False},{"business":self.other}):
            self.db.query(ResearchRun).delete(); self.db.commit(); self.insight(**kwargs)
            self.assertEqual(self.get()["recommendations"][0]["name"],"תכנון סלון")
            self.assertNotIn("המחקר השוטף",[r["source_he"] for r in self.get()["recommendations"]])
    def test_current_plan_not_another_business_or_old_month_guides_order(self):
        today=date.today()
        self.db.add(Strategy(business_id=self.other.id,year=today.year,month=today.month,roadmap_json=dumps({"roadmap":{"theme":"עיצוב מטבח"}})))
        self.db.commit(); self.assertEqual(self.get()["recommendations"][0]["name"],"תכנון סלון")
        self.db.add(Strategy(business_id=self.business.id,year=today.year,month=today.month,roadmap_json=dumps({"roadmap":{"theme":"עיצוב מטבח","summary":"להסביר איך עובדים"}})))
        self.db.commit(); data=self.get(); self.assertEqual(data["recommendations"][0]["name"],"עיצוב מטבח")
        self.assertEqual(data["recommendations"][0]["source_he"],"התוכנית")
    def test_saved_site_offers_are_candidates_but_preset_and_competitors_are_not(self):
        self.profile({"extracted":{"offers":["עיצוב חדר ילדים"]},"brand_language":{"source":"preset","offers_seen":["מוצר דוגמה בדוי"]},"competitors":[{"offers":["דבר של מתחרה"]}]})
        data=self.get(); names=[r["name"] for r in data["recommendations"]]
        self.assertIn("עיצוב חדר ילדים",names); self.assertNotIn("מוצר דוגמה בדוי",names); self.assertNotIn("דבר של מתחרה",names)
        self.assertEqual(data["recommendations"][0]["source_he"],"האתר שלכם")
    def test_work_is_a_proposal_until_owner_gives_real_details_and_writer_keeps_them(self):
        data=self.get(); self.assertNotIn("in_stock",[r["key"] for r in data["reasons"]])
        work=next(r for r in data["recommendations"] if r["kind"]=="work"); self.assertTrue(work["needs_detail"])
        item={"name":work["name"],"kind":"work"}
        self.assertEqual(self.client.put("/business/featured-items",json={"items":[item]}).status_code,422)
        item["note"]="תכנון מטבח קטן עם מקום לאחסון"
        response=self.client.put("/business/featured-items",json={"items":[item]})
        self.assertEqual(response.status_code,200); self.assertEqual(response.json()["items"][0]["kind"],"work")
        picks=strategy.featured_items_from(loads(self.business.scraped_profile_json))
        block=strategy._featured_block({"featured_items":picks})
        self.assertIn(item["note"],block); self.assertIn("דוגמה מעבודה",block); self.assertIn("אין להמציא לקוח",block)
        self.assertNotIn(item["name"],[r["name"] for r in response.json()["recommendations"]])
    def test_mixed_has_products_and_service_content_and_no_offers_means_no_fabricated_candidates(self):
        self.business.business_model="both"; self.db.commit(); data=self.get()
        self.assertEqual(data["kind_he"],"מוצרים ושירותים")
        self.assertTrue({"product","service","work","expertise"}.issubset({k["key"] for k in data["kinds"]}))
        self.business.offerings=""; self.db.commit(); self.assertEqual(self.get()["recommendations"],[])
        self.profile({"extracted":[],"brand_language":None,"quarter_plan":{"content":"bad"}})
        self.assertEqual(self.get()["recommendations"],[])
