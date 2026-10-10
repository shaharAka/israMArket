"""Owner-scoped language and writing jobs; all providers mocked, no paid calls."""
import _test_env  # noqa: F401
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Business, GenerationJob, Strategy, User
from app.services import content_language as cl, strategy, post_model_router, meta_model, designer, generation_jobs
from app.services.jsonutil import dumps, loads
from app.routers.onboarding import run_posts_stage

EN = {"default_language": "en", "audience_languages": ["en"], "allow_language_tests": False}
MULTI = {"default_language": "en", "audience_languages": ["en", "ar"], "allow_language_tests": True}


def post(lang="en", reason=""):
    return {"week": 1, "format": "image", "title": "A thoughtful kitchen", "hook": "Room for your routine", "caption": "A kitchen planned around your daily routine.", "cta": "Book a consultation", "overlay_headline": "Room for your routine", "content_language": lang, "language_reason": reason, "primary_outlet": "instagram"}


class ContentLanguageTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.engine = create_engine(f"sqlite:///{Path(self.tmp.name) / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, autoflush=False)()
        self.owner = User(email="owner@example.com", password_hash="x", full_name="Test owner", trial_started_at=datetime.utcnow())
        self.other = User(email="other@example.com", password_hash="x", full_name="Test owner", trial_started_at=datetime.utcnow())
        self.db.add_all([self.owner, self.other]); self.db.flush()
        self.biz = Business(user_id=self.owner.id, name="Studio", business_model="services", onboarding_complete=1, scraped_profile_json=dumps({"brand_language": {"voice": "personal"}, "owner_context": {"note": "keep me"}}))
        self.rival = Business(user_id=self.other.id, name="Other")
        self.db.add_all([self.biz, self.rival]); self.db.flush()
        self.month = Strategy(business_id=self.biz.id, year=date.today().year, month=date.today().month, roadmap_json=dumps({"roadmap": {"theme": "Thoughtful spaces", "posts": [post("he")]}, "posts_status": {"1": "pending", "2": "pending", "3": "pending", "4": "pending"}}))
        self.db.add(self.month); self.db.commit()
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.owner
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear(); self.db.close(); self.engine.dispose(); self.tmp.cleanup()

    def test_save_is_owner_scoped_and_preserves_existing_brand_posts_and_answers(self):
        before = self.month.roadmap_json
        self.assertEqual(self.client.get('/business/content-language').json(), cl.DEFAULT)
        response = self.client.put('/business/content-language', json=MULTI)
        self.assertEqual(response.status_code, 200, response.text)
        self.db.expire_all()
        self.assertEqual(self.client.get('/business/content-language').json(), MULTI)
        stored = loads(self.biz.scraped_profile_json, {})
        self.assertEqual(stored['owner_context'], {'note': 'keep me'})
        self.assertEqual(stored['brand_language'], {'voice': 'personal'})
        self.assertEqual(self.month.roadmap_json, before)
        app.dependency_overrides[get_current_user] = lambda: self.other
        self.assertEqual(self.client.get('/business/content-language').json(), cl.DEFAULT)

    def test_invalid_language_rejected_before_writing_or_saving(self):
        for body in ({'default_language': 'de'}, {'audience_languages': ['he', 'zz']}, {'audience_languages': []}):
            self.assertEqual(self.client.put('/business/content-language', json=body).status_code, 422)
        with patch.object(generation_jobs, 'start') as writer:
            self.assertEqual(self.client.post('/onboarding/posts/start', json={'content_language': 'de'}).status_code, 422)
            writer.assert_not_called()

    def test_default_included_and_test_needs_two_confirmed_languages(self):
        reply = self.client.put('/business/content-language', json={'default_language': 'ru', 'audience_languages': ['ru'], 'allow_language_tests': True})
        self.assertEqual(reply.json(), {'default_language': 'ru', 'audience_languages': ['ru'], 'allow_language_tests': False})
        self.assertEqual(cl.preferences({'content_language': {'default_language': 'ar', 'audience_languages': ['he', 'he', 'bad']}})['audience_languages'], ['ar', 'he'])

    def test_batch_override_does_not_change_preference_or_old_posts(self):
        self.client.put('/business/content-language', json=EN)
        before = loads(self.month.roadmap_json, {})['roadmap']['posts']
        with patch.object(generation_jobs, 'start', return_value={'running': True}):
            response = self.client.post('/onboarding/posts/start', json={'week': 2, 'content_language': 'ru'})
        self.assertEqual(response.status_code, 200, response.text)
        stored = loads(self.month.roadmap_json, {})
        self.assertEqual(stored['posts_language_preferences'], cl.for_batch(EN, 'ru'))
        self.assertEqual(stored['roadmap']['posts'], before)
        self.assertEqual(self.client.get('/business/content-language').json(), EN)

    def test_active_batch_rejects_new_language(self):
        extra = loads(self.month.roadmap_json, {}); extra['posts_language_preferences'] = EN
        self.month.roadmap_json = dumps(extra)
        self.db.add(GenerationJob(business_id=self.biz.id, kind='posts', status='running', year=self.month.year, month=self.month.month)); self.db.commit()
        with patch.object(generation_jobs, 'start') as writer:
            response = self.client.post('/onboarding/posts/start', json={'week': 2, 'content_language': 'ar'})
        self.assertEqual(response.status_code, 409, response.text)
        writer.assert_not_called()
        self.assertEqual(loads(self.month.roadmap_json, {})['posts_language_preferences'], EN)

    def test_worker_uses_snapshot_after_default_changed(self):
        extra = loads(self.month.roadmap_json, {}); extra['posts_language_preferences'] = EN
        self.month.roadmap_json = dumps(extra)
        self.biz.scraped_profile_json = dumps({'content_language': cl.for_batch(EN, 'ar')}); self.db.commit()
        with patch('app.routers.onboarding.month_posts.next_queued', side_effect=[1, None]), patch('app.routers.onboarding.write_week_posts', return_value=[post()]) as writer:
            self.assertTrue(run_posts_stage(self.db, self.biz))
        self.assertEqual(writer.call_args.args[0]['content_language'], EN)
        written = loads(self.month.roadmap_json, {})['roadmap']['posts']
        self.assertEqual(written[-1]['content_language'], 'en')
        self.assertEqual(written[0]['content_language'], 'he')

    def test_every_language_reaches_writer_and_draft(self):
        for language in cl.LANGUAGES:
            prefs = cl.for_batch(cl.DEFAULT, language)
            with self.subTest(language=language), patch.object(strategy, 'strategy_json', return_value=dumps({'posts': [post(language), post(language)]})) as writer:
                items = strategy.write_week_posts({'name': 'Studio', 'business_model': 'services', 'content_language': prefs}, {}, {}, {}, 1)
                self.assertEqual([p['content_language'] for p in items], [language, language])
                self.assertIn(cl.LANGUAGES[language], writer.call_args.args[0])
                self.assertIn('הסברים לבעל העסק והנחיות', writer.call_args.args[0])
                self.assertIn('אל תנסח אותם באנגלית ואז תתרגם', writer.call_args.args[0])
                if language != 'he': self.assertEqual(writer.call_args.args[1]['properties']['posts']['items']['properties']['content_language']['enum'], [language])
                if language != 'he':
                    self.assertIn(cl.LANGUAGES[language], writer.call_args.kwargs['system'])
                    self.assertNotIn('עברית', writer.call_args.args[1]['properties']['posts']['items']['properties']['overlay_headline']['description'])

    def test_unapproved_language_or_missing_reason_not_saved(self):
        with self.assertRaises(RuntimeError): cl.tag_written([post('ar')], EN)
        with self.assertRaises(RuntimeError): cl.tag_written([post('ar')], MULTI)
        with self.assertRaises(RuntimeError): cl.tag_written([post('ar', 'ניסוי'), post('ar', 'ניסוי')], MULTI)
        self.assertEqual(cl.tag_written([post(), post('ar', 'ניסוי לקהל שקורא ערבית')], MULTI)[1]['content_language'], 'ar')

    def test_rewrite_uses_saved_post_language(self):
        with patch.object(strategy, 'lite_json', return_value=dumps({'caption': 'A quieter kitchen'})) as writer:
            strategy.rewrite_post(post(), None, {})
        self.assertIn('English', writer.call_args.kwargs['system'])
        self.assertIn('Every new post must use en', writer.call_args.args[0])

    def test_designer_keeps_overlay_language(self):
        with patch.object(designer, 'strategy_json', return_value=dumps({'scene_description': 'a kitchen', 'has_overlay': True, 'overlay_headline': 'Room for your routine'})) as writer:
            creative = designer.plan_post_design(post(), {}, {})
        self.assertIn('English', writer.call_args.kwargs['system'])
        self.assertEqual(creative['overlay_headline'], 'Room for your routine')

    def test_muse_fallback_keeps_language(self):
        settings = SimpleNamespace(post_model='muse-spark', post_model_timeout_seconds=0, post_model_fallback=True, meta_post_model='muse-spark-1.3')
        instruction = cl.system(EN)
        with patch.object(post_model_router, 'get_settings', return_value=settings), patch.object(post_model_router.meta_model, 'chat_json', side_effect=meta_model.RateLimited('429')) as muse, patch.object(post_model_router.gemini, 'strategy_json', return_value='{}') as fallback:
            post_model_router.post_json('prompt', {}, system=instruction)
        self.assertEqual(muse.call_args.kwargs['system'], instruction)
        self.assertEqual(fallback.call_args.kwargs['system'], instruction)

    def test_new_language_writes_fresh_copy_without_changing_preview_selection(self):
        seed = {"strategy": {"pillars": [], "cadence": {"key": "1-2"}}, "posts": [{"title": "מטבח אישי", "caption": "תכנון מטבח אישי", "hook": "למי שרוצה מטבח אישי", "format": "image"}]}
        before = dumps(seed)
        with patch.object(strategy, 'strategy_json', return_value=dumps({'posts': [post(), post()]})) as writer:
            items = strategy.write_week_posts({'name': 'Studio', 'business_model': 'services', 'content_language': EN, 'first_month_seed': seed}, {}, {}, {}, 1)
        writer.assert_called_once()
        self.assertEqual([item['content_language'] for item in items], ['en', 'en'])
        self.assertEqual(dumps(seed), before)
