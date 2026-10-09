"""Story capture, attribution and scheduling: offline Graph fixtures, no model calls."""
import _test_env  # noqa: F401
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock
from app.models import Business, User, InstagramPost, Integration
from app.services import connected_posts as cp, instagram_signal as sig, meta, meta_readiness, meta_marketing
from app.services.jsonutil import dumps, loads
from app.jobs import capture_stories
from app.routers import performance
from test_connected_posts import ConnectedTestCase, stored_post
import test_meta_readiness as readiness_fixture
from test_instagram_signal import FakeResponse, insights_payload, graph_error

ACCOUNT = "222"
STAMP = "2026-10-09T10:00:00+00:00"


def story(value=20, stamp=STAMP, media_id="178123", **extra):
    return {"id": media_id, "instagram_id": ACCOUNT, "media_product_type": "STORY", "media_type": "IMAGE",
            "timestamp": "2026-10-09T09:00:00+0000", "caption": "This caption is shared by feed and Story", "insights": {"reach": value},
            "observations": {"reach": {"source": "instagram", "scope": "cumulative", "product_type": "STORY", "account_id": ACCOUNT, "media_id": media_id, "read_at": stamp}}, **extra}


def report(posts=None, **extra):
    return {"instagram_id": ACCOUNT, "posts": [story()] if posts is None else posts, "read_at": STAMP, "status": "ready", **extra}


class StoryGraphTest(unittest.TestCase):
    def test_story_metrics_exclude_saves_and_pages_are_deduplicated(self):
        calls = []
        def get(url, params=None, **kw):
            calls.append((url, params))
            if url.endswith('/222/stories'):
                if params.get('after') == 'next': return FakeResponse({'data': [{'id': '178123'}, {'id': '178456'}]})
                return FakeResponse({'data': [{'id': '178123', 'timestamp': '2026-10-09T09:00:00+0000'}], 'paging': {'next': 'https://attacker.example/?access_token=bad', 'cursors': {'after': 'next'}}})
            return FakeResponse(insights_payload(reach=20, views=30, shares=0, link_clicks=2))
        with mock.patch.object(meta.httpx, 'get', side_effect=get): result = meta.fetch_stories('USER_TOKEN', ACCOUNT)
        self.assertEqual([p['id'] for p in result['posts']], ['178123', '178456'])
        self.assertFalse(result['limited']); self.assertEqual(result['status'], 'ready')
        self.assertEqual(result['posts'][0]['insights']['shares'], 0)
        self.assertEqual(result['posts'][0]['observations']['reach']['account_id'], ACCOUNT)
        self.assertTrue(all(url.startswith(meta.GRAPH + '/') for url, _ in calls))
        self.assertFalse(any('saved' in params.get('metric', '') for _, params in calls))

    def test_rate_limit_stops_the_read_and_keeps_captured_story(self):
        def get(url, **kw):
            if url.endswith('/stories'): return FakeResponse({'data': [{'id':'178123'}, {'id':'178456'}, {'id':'178789'}]})
            if '/178123/' in url: return FakeResponse(insights_payload(reach=20))
            return graph_error(4, 'private-token-never-persist')
        with mock.patch.object(meta.httpx, 'get', side_effect=get) as calls:
            result = meta.fetch_stories('USER_TOKEN', ACCOUNT)
        self.assertEqual(calls.call_count, 3)
        self.assertEqual(result['status'], 'partial'); self.assertEqual(result['failure'], 'rate_limited')
        self.assertEqual(result['posts'][0]['insights'], {'reach':20})
        self.assertNotIn('private-token', dumps(result))

    def test_revoked_insight_permission_stops_without_claiming_a_successful_read(self):
        def get(url, **kw):
            return FakeResponse({'data':[{'id':'178123'},{'id':'178456'}]}) if url.endswith('/stories') else graph_error(10,'Application has no insights permission')
        with mock.patch.object(meta.httpx,'get',side_effect=get) as calls:
            result=meta.fetch_stories('USER_TOKEN',ACCOUNT)
        self.assertEqual(calls.call_count,2)
        self.assertEqual(result['status'],'permission');self.assertEqual(result['posts'],[])

    def test_small_counts_are_unknown_not_zero_or_reconnect(self):
        def get(url, **kw):
            return FakeResponse({'data':[{'id':'178123'}]}) if url.endswith('/stories') else graph_error(10, 'Not enough viewers')
        with mock.patch.object(meta.httpx, 'get', side_effect=get): result = meta.fetch_stories('USER_TOKEN', ACCOUNT)
        self.assertEqual(result['status'], 'ready'); self.assertEqual(result['posts'][0]['insights'], {})
        self.assertEqual(set(result['posts'][0]['insight_errors']), set(meta.STORY_METRICS))
        self.assertNotIn('Not enough viewers', dumps(result))

    def test_cursor_bound_marks_partial_and_field_fallback_preserves_identity(self):
        def get(url, params=None, **kw):
            if params.get('fields') == meta.STORY_FIELDS: return graph_error(100)
            if url.endswith('/stories'): return FakeResponse({'data': [{'id': '178123'}], 'paging': {'next':'yes','cursors':{'after':'same'}}})
            return FakeResponse(insights_payload(reach=10))
        with mock.patch.object(meta.httpx, 'get', side_effect=get): result = meta.fetch_stories('USER_TOKEN', ACCOUNT)
        self.assertTrue(result['limited']); self.assertEqual(result['status'], 'partial')
        self.assertEqual(result['posts'][0]['media_product_type'], 'STORY')

    def test_no_data_is_unknown_and_snapshot_excludes_full_story_caption(self):
        with mock.patch.object(meta, 'graph_get', return_value={'data': []}): self.assertEqual(meta.fetch_stories('USER_TOKEN', ACCOUNT)['status'], 'empty')
        snap = meta.snapshot_view({'stories':report([story(caption_full='long')])})
        self.assertNotIn('caption_full', dumps(snap))


class StoryPostTest(ConnectedTestCase):
    def setUp(self):
        super().setUp()
        self.db.add(Integration(business_id=self.business.id, provider='meta', status='connected', external_id='111', access_token_enc='unused', extra_json=dumps({'selected_instagram_id':ACCOUNT})))
        self.db.commit()
        self.month([stored_post('A Story', uid='story00001', channel='instagram', mix_type='value', cta='לפרטים', format='story', published_url='https://www.instagram.com/stories/example/178123/?igsh=x')])

    def test_capture_survives_expiry_and_missing_metric_retains_original_date(self):
        sig.store_media(self.db, self.business.id, {'instagram_id':ACCOUNT, 'stories':report()}); self.db.commit()
        cp.refresh_results(self.db,self.business, phrase=False); self.db.commit()
        first=self.current_posts()[0]
        self.assertEqual(first['measure']['metric'],'reach'); self.assertEqual(first['results']['value'],20)
        self.assertEqual(first['results']['matched_by'],['instagram_story_link'])
        self.assertEqual(first['results']['observations']['reach']['read_at'],STAMP)
        sig.store_media(self.db, self.business.id, {'instagram_id':ACCOUNT, 'stories':report([story(insights={},observations={},insight_errors={'reach':'missing'})])}); self.db.commit()
        cp.refresh_results(self.db,self.business,meta_data={'instagram_id':ACCOUNT,'stories':report([])},phrase=False); self.db.commit()
        result=self.current_posts()[0]['results']
        self.assertEqual(result['value'],20); self.assertEqual(result['observations']['reach']['read_at'],STAMP)
        self.assertIsNone(result['compare'])
        row=self.db.query(InstagramPost).one(); self.assertIsNone(row.saved)
        measured=cp.measured_posts(self.current_posts())['items'][0]
        self.assertEqual(measured['observation']['read_at'],STAMP)

    def test_late_response_cannot_rewind_a_captured_count_or_its_date(self):
        sig.store_media(self.db,self.business.id,{'instagram_id':ACCOUNT,'stories':report([story(40, "2026-10-09T11:00:00+00:00", permalink="https://www.instagram.com/stories/example/178123/")])})
        self.db.commit()
        old = {'instagram_id':ACCOUNT,'stories':report([story(20, STAMP, caption="", permalink="")])}
        sig.store_media(self.db,self.business.id,old);self.db.commit()
        cp.refresh_results(self.db,self.business,meta_data=old,phrase=False);self.db.commit()
        result=self.current_posts()[0]['results']
        self.assertEqual(result['value'],40)
        self.assertEqual(result['observations']['reach']['read_at'],"2026-10-09T11:00:00+00:00")
        self.assertTrue(self.db.query(InstagramPost).one().permalink)
        self.assertEqual(cp.what_worked(self.db,self.business),{'block':'','refs':{}})

    def test_wrong_account_and_other_business_story_do_not_match(self):
        other_owner=User(email="other-story@example.com",password_hash="unused",full_name="Other owner")
        self.db.add(other_owner);self.db.flush()
        other_business=Business(user_id=other_owner.id,name="Other business")
        self.db.add(other_business);self.db.flush()
        sig.store_media(self.db,other_business.id,{"instagram_id":ACCOUNT,"stories":report()})
        self.db.commit()
        sig.store_media(self.db,self.business.id,{'stories':report([story(instagram_id='999')]),'instagram_id':'999'}); self.db.commit()
        cp.refresh_results(self.db,self.business,phrase=False); self.db.commit()
        self.assertIsNone(self.current_posts()[0]['results'])

    def test_story_requires_correct_id_and_channel_not_a_caption(self):
        data=[{**story(), 'product_type':'STORY', 'reach':20}]
        owner=self.current_posts()[0]
        self.assertIsNotNone(cp._match_media(owner,data,set())[0])
        for altered in [{'channel':'facebook'}, {'published_url':''}, {'published_url':'https://evil.example/stories/example/178123/'}, {'format':'image','published_url':''}, {'published_url':'https://www.instagram.com/stories/example/178999/'}]:
            self.assertIsNone(cp._match_media({**owner,**altered},data,set())[0])
        attribution=performance._attribute([{**owner,'channel':'facebook'}],{}, {'stories':report()})
        self.assertIsNone(attribution[0]['meta'])

    def test_no_story_caption_enters_feed_ranking(self):
        sig.store_media(self.db,self.business.id,{'instagram_id':ACCOUNT,'stories':report([story(insights={'reach':100,'views':150,'shares':40})])});self.db.commit()
        self.assertEqual(sig.top_own_posts(self.business,db=self.db),[])


class StoryCaptureTest(unittest.TestCase):
    setUp = readiness_fixture.MetaReadinessTest.setUp
    cleanup = readiness_fixture.MetaReadinessTest.cleanup
    seed = readiness_fixture.MetaReadinessTest.seed
    def connect(self):
        item=self.seed(); extra=loads(item.extra_json,{}); extra['scopes']=list(meta.STORY_SCOPES); item.extra_json=dumps(extra); self.db.commit(); return item

    def test_hourly_capture_no_ai_and_selection_change_discards_response(self):
        item=self.connect()
        with mock.patch.object(meta,'fetch_stories',return_value=report()) as fetch, mock.patch.object(cp,'lite_json',side_effect=AssertionError('No paid call')):
            self.assertIsNotNone(meta_readiness.capture_stories(self.db,item))
        fetch.assert_called_once_with('test-user-grant',ACCOUNT)
        self.assertEqual(self.db.query(InstagramPost).count(),1)
        def replace(*args):
            extra=loads(item.extra_json,{});extra['selected_instagram_id']='999';item.extra_json=dumps(extra);self.db.commit();return report([story(media_id='178456')])
        with mock.patch.object(meta,'fetch_stories',side_effect=replace): self.assertIsNone(meta_readiness.capture_stories(self.db,item))
        self.assertEqual(self.db.query(InstagramPost).count(),1)

    def test_job_eligibility_honours_scopes_suspension_and_recent_read(self):
        item=self.connect(); now=datetime.now(timezone.utc)
        self.assertTrue(capture_stories.eligible(self.db,item,now))
        extra=loads(item.extra_json,{});extra['story_capture']={'read_at':now.isoformat(),'selection_key':meta_readiness.key(item)};item.extra_json=dumps(extra); self.db.commit()
        self.assertFalse(capture_stories.eligible(self.db,item,now+timedelta(minutes=5)))
        self.assertTrue(capture_stories.eligible(self.db,item,now+timedelta(hours=1)))
        self.owner.suspended_at=datetime.utcnow(); self.db.commit(); self.assertFalse(capture_stories.eligible(self.db,item,now+timedelta(hours=2)))

    def test_dry_run_does_not_contact_meta_and_job_continues_after_one_failure(self):
        from contextlib import redirect_stdout
        from io import StringIO
        item=self.connect()
        other=self.seed(business=self.other_business)
        extra=loads(other.extra_json,{});extra['scopes']=list(meta.STORY_SCOPES);other.extra_json=dumps(extra);self.db.commit()
        factory=__import__('sqlalchemy.orm',fromlist=['sessionmaker']).sessionmaker(bind=self.engine,autoflush=False)
        with mock.patch.object(capture_stories,'SessionLocal',factory), mock.patch.object(capture_stories,'engine',self.engine), mock.patch.object(capture_stories,'migrate_db'), mock.patch.object(meta_readiness,'capture_stories') as capture, redirect_stdout(StringIO()) as output:
            self.assertEqual(capture_stories.main(['--dry-run']),0)
            capture.assert_not_called()
            self.assertIn('due=2',output.getvalue())
            capture.side_effect=[RuntimeError('private-provider-token'),report([])]
            self.assertEqual(capture_stories.main([]),1)
            self.assertEqual(capture.call_count,2)
            self.assertNotIn('private-provider-token',output.getvalue())
            self.assertIn('failures=1',output.getvalue())

    def test_additive_migration_preserves_existing_media_and_is_repeatable(self):
        from app import db as database
        from sqlalchemy import text
        self.db.add(InstagramPost(business_id=self.business.id,media_id="old",caption="Existing caption"))
        self.db.commit()
        with self.engine.begin() as conn:
            conn.execute(text('ALTER TABLE instagram_posts DROP COLUMN instagram_id'))
            conn.execute(text('ALTER TABLE instagram_posts DROP COLUMN insights_json'))
        with mock.patch.object(database,'engine',self.engine):
            database.migrate_db();database.migrate_db()
        self.db.expire_all()
        row=self.db.query(InstagramPost).one()
        self.assertEqual((row.caption,row.instagram_id,row.insights_json),('Existing caption','','{}'))

    def test_story_only_success_does_not_restamp_retained_feed(self):
        item=self.connect()
        old=datetime(2026,9,1,10)
        self.db.add(InstagramPost(business_id=self.business.id,media_id='feed123',instagram_id=ACCOUNT,media_product_type='FEED',caption='Retained feed',synced_at=old))
        self.db.commit()
        data={'instagram_id':ACCOUNT,'posts':[{'id':'feed123','caption':'Retained feed','media_product_type':'FEED'}], 'stories':report(), 'source_read_at':STAMP,'source_reads':{'social':{'read_at':old.isoformat()}}}
        sig.store_media(self.db,self.business.id,meta_readiness.media_for_storage(data));self.db.commit()
        row=self.db.query(InstagramPost).filter_by(media_id='feed123').one()
        self.assertEqual(row.synced_at,old)
        self.assertEqual(self.db.query(InstagramPost).count(),2)

    def test_story_success_survives_feed_failure(self):
        item=self.connect()
        with mock.patch.object(meta,'fetch_insights',side_effect=meta.GraphError('private',kind='unavailable')), mock.patch.object(meta,'fetch_stories',return_value=report()), mock.patch.object(meta_marketing,'measurement',return_value={}):
            data,sections=meta_readiness.fetch(item,'','2026-09-12','2026-10-09')
        self.assertEqual(sections['stories']['status'],'ready'); self.assertEqual(meta_readiness.aggregate(sections),'partial')
        self.assertTrue(meta_readiness.has_observations(data)); self.assertEqual(data['stories']['posts'][0]['insights']['reach'],20)
        retained=meta_readiness.retain_sections(data,sections,None)
        self.assertEqual(retained['source_reads']['stories'],{'scope':'cumulative','period':None,'read_at':STAMP})

