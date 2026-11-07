"""Customer/flow/read isolation. SQLite and contract fixtures, no provider/model spend."""
import _test_env  # noqa: F401
import unittest
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse
from unittest import mock

from jose import jwt
from app.config import get_settings
from app.models import Integration
from app.routers import tiktok_connections
from app.security import ALGORITHM, decrypt_secret, encrypt_secret
from app.services import tiktok, tiktok_data, research
from app.services.jsonutil import dumps, loads
import test_ga4_readiness as fixture
from test_tiktok import tokens, video


class CustomerTest(unittest.TestCase):
    setUp_base=fixture.SourceReadinessTest.setUp
    cleanup=fixture.SourceReadinessTest.cleanup

    def setUp(self):
        self.setUp_base()
        for key,value in {'tiktok_client_key':'qa-client','tiktok_client_secret':'qa-secret',
                          'tiktok_access_mode':'sandbox','tiktok_sandbox_emails':self.owner.email}.items():
            p=mock.patch.object(get_settings(),key,value); p.start(); self.addCleanup(p.stop)
        self.now=datetime.utcnow()
        self.provider_tokens={**tokens(), 'scopes':list(tiktok.SCOPES), 'expires_at':self.now+timedelta(hours=1),
                              'refresh_expires_at':(self.now+timedelta(days=365)).isoformat()}
        self.profile={'open_id':'qa-person','display_name':'QA designer'}
        self.snap={'videos':[tiktok._video(video())], 'checked_at':self.now.replace(microsecond=0).isoformat(),
                   'complete':True,'measurement':'cumulative_public_video_counts','max_videos':60}

    def item(self): return tiktok_data.item_for(self.db,self.business.id)
    def seed(self,business=None,**changes):
        item=Integration(business_id=(business or self.business).id,provider='tiktok',status='connected',
                         external_id='qa-person',display_name='QA designer', access_token_enc=encrypt_secret('qa-access'),
                         refresh_token_enc=encrypt_secret('qa-refresh'), token_expires_at=self.now+timedelta(hours=1),
                         extra_json=dumps({'scopes':list(tiktok.SCOPES),'refresh_expires_at':(self.now+timedelta(days=365)).isoformat()}))
        for key,value in changes.items(): setattr(item,key,value)
        self.db.add(item); self.db.commit(); return item
    def start(self):
        response=self.client.get('/integrations/tiktok/start')
        self.assertEqual(response.status_code,200,response.text)
        return parse_qs(urlparse(response.json()['url']).query)['state'][0]
    def callback(self,state,**args):
        with mock.patch.object(tiktok,'exchange_code',return_value=self.provider_tokens) as exchange, mock.patch.object(tiktok,'profile',return_value=self.profile):
            result=self.client.get('/integrations/tiktok/callback',params={'state':state,'code':'qa-code',**args},follow_redirects=False)
        return result,exchange
    def read(self):
        with mock.patch.object(tiktok,'profile',return_value=self.profile), mock.patch.object(tiktok,'videos',return_value=self.snap) as fetch:
            response=self.client.post('/integrations/tiktok/read')
        return response,fetch

    def test_disabled_and_wrong_sandbox_owner_cannot_start_or_read(self):
        with mock.patch.object(get_settings(),'tiktok_access_mode','off'):
            self.assertEqual(self.client.get('/integrations/tiktok/start').status_code,503)
            self.assertFalse(self.client.get('/integrations').json()['tiktok_ready'])
        with mock.patch.object(get_settings(),'tiktok_sandbox_emails','another@example.com'):
            self.assertEqual(self.client.get('/integrations/tiktok/start').status_code,503)
        self.assertIsNone(self.item())

    def test_consent_is_not_selection_or_read_and_tokens_are_private(self):
        response,_=self.callback(self.start()); self.assertIn('success',response.headers['location'])
        item=self.item(); self.assertEqual(item.status,'select_account')
        self.assertEqual(decrypt_secret(item.access_token_enc),'qa-access'); self.assertNotEqual(item.access_token_enc,'qa-access')
        public=self.client.get('/integrations').json()['integrations'][0]
        self.assertFalse(public['connected']); self.assertEqual(public['tiktok_data']['videos'],[])
        self.assertNotIn('qa-access',str(public)); self.assertNotIn('qa-refresh',str(public))
        self.assertNotIn('qa-secret',str(public))

    def test_cookie_owner_and_provider_binding(self):
        state=self.start(); self.client.cookies.clear()
        response,exchange=self.callback(state); self.assertIn('expired',response.headers['location']); exchange.assert_not_called()
        state=self.start()
        from app.deps import get_current_user
        from app.main import app
        app.dependency_overrides[get_current_user]=lambda:self.other
        response,exchange=self.callback(state); self.assertIn('expired',response.headers['location']); exchange.assert_not_called()

    def test_wrong_provider_and_expired_state_are_rejected(self):
        state=self.start(); claims=jwt.decode(state,get_settings().jwt_secret,algorithms=[ALGORITHM])
        for change in [{'p':'meta'},{'exp':1},{'ep':-1}]:
            bad=jwt.encode({**claims,**change},get_settings().jwt_secret,algorithm=ALGORITHM)
            response,exchange=self.callback(bad); self.assertIn('expired',response.headers['location']); exchange.assert_not_called()

    def test_callback_replay_and_superseded_attempt_are_rejected(self):
        old=self.start(); newer=self.start()
        response,exchange=self.callback(old); exchange.assert_not_called()
        # A stale return preserves the newer browser binding.
        active=newer; nonce=self.client.cookies.get(tiktok_connections.FLOW_COOKIE)
        self.callback(active)
        self.client.cookies.set(tiktok_connections.FLOW_COOKIE,nonce)
        response,exchange=self.callback(active); exchange.assert_not_called()

    def test_cancel_and_failed_reconnect_preserve_old_grant_and_plan(self):
        original=self.seed(); state=self.start()
        response,exchange=self.callback(state,error='access_denied')
        exchange.assert_not_called(); self.assertIn('cancelled',response.headers['location'])
        self.assertEqual(self.item().access_token_enc,original.access_token_enc)
        state=self.start()
        with mock.patch.object(tiktok,'exchange_code',side_effect=tiktok.TikTokError('permission')):
            response=self.client.get('/integrations/tiktok/callback',params={'state':state,'code':'qa'},follow_redirects=False)
        self.assertIn('permission',response.headers['location']); self.assertEqual(self.item().status,'connected')

    def test_account_confirmation_and_first_read(self):
        self.callback(self.start()); attempt=loads(self.item().extra_json)['connection_attempt']
        self.assertEqual(self.client.post('/integrations/tiktok/account',json={'connection_attempt':'stale'}).status_code,409)
        with mock.patch.object(tiktok,'profile',return_value=self.profile), mock.patch.object(tiktok,'videos',return_value=self.snap):
            response=self.client.post('/integrations/tiktok/account',json={'connection_attempt':attempt})
        self.assertEqual(response.status_code,200,response.text)
        public=self.client.get('/integrations').json()['integrations'][0]
        self.assertTrue(public['connected']); self.assertEqual(public['source_readiness']['status'],'ready')
        self.assertEqual(public['tiktok_data']['videos'][0]['like_count'],0)

    def test_pending_account_cannot_be_read(self):
        self.seed(status='select_account'); response,fetch=self.read()
        self.assertEqual(response.status_code,400); fetch.assert_not_called()

    def test_rotating_refresh_and_identity_guard(self):
        self.seed(token_expires_at=self.now-timedelta(seconds=1))
        with mock.patch.object(tiktok,'refresh_token',return_value={**self.provider_tokens,'refresh_token':'qa-rotated'}) as refresh:
            response,fetch=self.read()
        self.assertEqual(response.status_code,200,response.text); refresh.assert_called_once()
        self.assertEqual(decrypt_secret(self.item().refresh_token_enc),'qa-rotated')
        fetch.assert_called_once_with('qa-access',now=mock.ANY)

    def test_wrong_refresh_subject_and_expired_refresh_do_not_fetch(self):
        self.seed(token_expires_at=self.now-timedelta(seconds=1))
        with mock.patch.object(tiktok,'refresh_token',return_value={**self.provider_tokens,'open_id':'someone-else'}):
            _,fetch=self.read()
        fetch.assert_not_called(); self.assertEqual(tiktok_data.public_state(self.item())['status'],'reconnect')

    def test_failed_read_retains_original_measurement_date(self):
        self.seed(); self.read(); item=self.item(); extra=loads(item.extra_json)
        before=extra['video_snapshot']['checked_at']; extra['source_readiness']['checked_at']=(self.now-timedelta(minutes=6)).isoformat()
        item.extra_json=dumps(extra); self.db.commit()
        with mock.patch.object(tiktok,'profile',side_effect=tiktok.TikTokError('unavailable')):
            self.client.post('/integrations/tiktok/read')
        data=tiktok_data.public_data(self.item())
        self.assertEqual(data['checked_at'],before); self.assertEqual(data['source_readiness']['status'],'unavailable')

    def test_read_cache_and_disconnect_clear_local_access_even_if_revoke_fails(self):
        self.seed(); self.read(); _,fetch=self.read(); fetch.assert_not_called()
        with mock.patch.object(tiktok,'revoke',side_effect=tiktok.TikTokError()) as revoke:
            response=self.client.delete('/integrations/tiktok')
        self.assertEqual(response.json(),{'ok':True,'remote_revoked':False}); revoke.assert_called_once()
        self.assertIsNone(self.item()); self.assertEqual(self.client.post('/integrations/tiktok/read').status_code,400)

    def test_other_customer_data_never_exposed(self):
        self.seed(business=self.other_business)
        self.assertEqual(self.client.get('/integrations').json()['integrations'],[])
        response,fetch=self.read(); self.assertEqual(response.status_code,400); fetch.assert_not_called()
        self.client.delete('/integrations/tiktok'); self.assertIsNotNone(tiktok_data.item_for(self.db,self.other_business.id))

    def test_disconnect_during_fetch_cannot_restore_snapshot(self):
        item=self.seed()
        def removed(*a,**kw):
            self.db.delete(item); self.db.commit(); return self.snap
        with mock.patch.object(tiktok,'profile',return_value=self.profile), mock.patch.object(tiktok,'videos',side_effect=removed):
            response=self.client.post('/integrations/tiktok/read')
        self.assertEqual(response.status_code,409); self.assertIsNone(self.item())

    def test_disconnect_during_exchange_cannot_restore_grant(self):
        state=self.start()
        def removed(*a):
            self.db.delete(self.item()); self.db.commit(); return self.provider_tokens
        with mock.patch.object(tiktok,'exchange_code',side_effect=removed), mock.patch.object(tiktok,'profile',return_value=self.profile):
            response=self.client.get('/integrations/tiktok/callback',params={'state':state,'code':'qa'},follow_redirects=False)
        self.assertIn('failed',response.headers['location']); self.assertIsNone(self.item())

    def test_research_uses_counts_and_original_read_date_without_claiming_sales(self):
        self.seed(); self.read()
        items,_,_=research.gather_own_results(self.db,self.business,{'now':self.now+timedelta(minutes=1)})
        findings=[i for i in items if i['origin'].startswith('TikTok')]
        self.assertEqual(len(findings),1)
        self.assertEqual(findings[0]['observed_at'],self.snap['checked_at'])
        self.assertEqual(findings[0]['data']['measurement'],'cumulative_public_video_counts')
        self.assertEqual(findings[0]['data']['metrics']['view_count'],300)
        self.assertIn('אין כאן מדידת פניות או מכירות',findings[0]['text_he'])

    def test_account_deletion_revokes_only_its_tiktok_and_removes_all_its_data(self):
        from app.services.account_deletion import delete_account
        business_id,other_id=self.business.id,self.other_business.id
        self.seed(); self.seed(business=self.other_business)
        with mock.patch.object(tiktok,'revoke') as revoke, mock.patch('app.services.billing.cancel_for_deletion'):
            delete_account(self.db,self.owner)
        revoke.assert_called_once_with('qa-access')
        self.assertIsNone(tiktok_data.item_for(self.db,business_id))
        self.assertIsNotNone(tiktok_data.item_for(self.db,other_id))

    def test_stale_counts_are_not_included_in_new_research(self):
        item=self.seed()
        snap={**self.snap, 'open_id':item.external_id,'checked_at':(self.now-timedelta(days=8)).isoformat()}
        extra=loads(item.extra_json); extra['video_snapshot']=snap; item.extra_json=dumps(extra); self.db.commit()
        with mock.patch.object(tiktok,'profile',side_effect=tiktok.TikTokError()):
            items,_,_=research.gather_own_results(self.db,self.business,{'now':self.now})
        self.assertFalse(any(i['origin'].startswith('TikTok') for i in items))

    def test_empty_account_and_missing_metrics_have_distinct_states(self):
        self.seed(); self.snap['videos']=[]
        self.read(); self.assertEqual(tiktok_data.public_state(self.item())['status'],'empty')
        item=self.item(); extra=loads(item.extra_json); extra['source_readiness']={'status':'unchecked'}
        item.extra_json=dumps(extra); self.db.commit()
        self.snap['videos']=[{**tiktok._video(video()),'comment_count':None}]
        self.read(); self.assertEqual(tiktok_data.public_state(self.item())['status'],'partial')

    def test_each_interface_language_survives_consent_return(self):
        for lang in ('he','en','ar','ru'):
            response=self.client.get('/integrations/tiktok/start',params={'lang':lang})
            state=parse_qs(urlparse(response.json()['url']).query)['state'][0]
            result,_=self.callback(state)
            self.assertEqual(parse_qs(urlparse(result.headers['location']).query)['lang'],[lang])
        self.assertEqual(self.client.get('/integrations/tiktok/start',params={'lang':'evil'}).status_code,422)

    def test_presence_reports_the_connected_tiktok_with_original_read_date(self):
        self.seed(); self.read()
        self.business.social_links_json=dumps({'tiktok':'https://www.tiktok.com/@qa'})
        self.db.commit()
        items,_,_=research.gather_presence(self.db,self.business,{'now':self.now,'today':self.now.date()})
        self.assertFalse(any('בפייסבוק ובטיקטוק אנחנו לא רואים' in i['text_he'] for i in items))
        self.assertTrue(any(i['origin'].startswith('TikTok') and i['observed_at']==self.snap['checked_at'] for i in items))

    def test_cancelled_consent_and_disconnect_do_not_change_the_saved_plan(self):
        from app.models import Strategy
        plan=Strategy(business_id=self.business.id,year=2026,month=10,
                      roadmap_json=dumps({'roadmap':{'posts':[{'title':'An owner draft','text_he':'Keep this draft'}]}}))
        self.db.add(plan); self.db.commit(); original=plan.roadmap_json
        self.seed(); self.callback(self.start(),error='access_denied')
        with mock.patch.object(tiktok,'revoke'):
            self.client.delete('/integrations/tiktok')
        self.assertEqual(self.db.get(Strategy,plan.id).roadmap_json,original)

    def test_presence_keeps_owner_social_links_when_tiktok_is_not_connected(self):
        self.business.social_links_json=dumps({'instagram':'https://instagram.com/qa'})
        self.db.commit()
        findings,_,_=research.gather_presence(self.db,self.business,{'now':self.now,'today':self.now.date()})
        self.assertTrue(any('הרשתות שמצאנו' in i['text_he'] for i in findings))
        self.assertFalse(any('לא מצאנו קישורים לרשתות' in i['text_he'] for i in findings))

    def test_unknown_views_do_not_hide_known_comments_or_turn_into_zero(self):
        self.seed(); self.snap['videos'][0]['view_count']=None
        self.read()
        items,_,_=research.gather_own_results(self.db,self.business,{'now':self.now+timedelta(minutes=1)})
        findings=[i for i in items if i['origin'].startswith('TikTok')]
        self.assertEqual(findings[0]['data']['metrics']['comment_count'],4)
        self.assertIsNone(findings[0]['data']['metrics']['view_count'])
        self.assertIn('מספר הצפיות לא התקבל',findings[0]['text_he'])

    def test_tiktok_findings_reach_saved_insights_and_the_plan_prompt(self):
        self.seed(); self.read()
        def synthesize(prompt,schema):
            self.assertIn('TikTok Display API',prompt)
            self.assertIn('300 צפיות',prompt)
            return dumps({'headline':'נבדוק עוד סרטון על תכנון דירה קטנה', 'insights':[
                {'title':title, 'text':'לסרטון יש 300 צפיות מצטברות.', 'plan_change':action,
                 'refs':['R1'], 'confidence':'weak', 'confidence_reason':'סרטון אחד, לא מגמה'}
                for title,action in [('תכנון חדר קטן','לנסות פוסט נוסף על תכנון חדר קטן.'),
                                     ('תגובות לסרטון','לשאול בפוסט הבא מה קשה בתכנון חדר קטן.'),
                                     ('בדיקת השיתופים','לבדוק אם הטיפ הבא מעורר שיתופים.')] ]})
        run=research.run_research(self.db,self.business,sources=('own_results',),now=self.now,synthesize=synthesize,model_label='qa-model')
        self.assertEqual(run.status,'done')
        block=research.research_prompt_block(self.business,self.db)
        self.assertIn('תכנון חדר קטן',block)
        self.assertIn('TikTok Display API',block)

    def guides(self):
        setup=self.client.get('/setup'); trial=self.client.get('/trial')
        self.assertEqual(setup.status_code,200,setup.text)
        self.assertEqual(trial.status_code,200,trial.text)
        return ({i['key']:i for g in setup.json()['groups'] for i in g['items']},
                {i['key']:i for i in trial.json()['steps']},trial.json()['measurement'])

    def plan_tiktok(self):
        self.business.scraped_profile_json=dumps({'quarter_plan':{'integrations':[{'key':'tiktok_business'}]}})
        self.db.commit()

    def test_both_guides_require_a_confirmed_read_and_only_the_saved_plan_source(self):
        self.plan_tiktok()
        self.callback(self.start())
        setup,steps,measurement=self.guides()
        self.assertFalse(setup['tiktok']['done']); self.assertEqual(steps['tiktok']['status'],'todo')
        self.assertNotIn('google',setup); self.assertNotIn('instagram',setup)
        self.assertFalse(measurement['has_numbers']); self.assertIsNone(measurement['first_numbers_at'])
        attempt=loads(self.item().extra_json,{})['connection_attempt']
        with mock.patch.object(tiktok,'profile',return_value=self.profile), mock.patch.object(tiktok,'videos',return_value=self.snap):
            self.client.post('/integrations/tiktok/account',json={'connection_attempt':attempt})
        setup,steps,measurement=self.guides()
        self.assertTrue(setup['tiktok']['done']); self.assertEqual(steps['tiktok']['status'],'done')
        self.assertTrue(measurement['has_numbers']); self.assertEqual(measurement['first_numbers_at'],self.snap['checked_at'])
        self.assertEqual(measurement['verified_sources'],['נתוני הטיקטוק'])
        self.business.scraped_profile_json=dumps({'quarter_plan':{'integrations':[]}}); self.db.commit()
        setup,steps,_=self.guides()
        self.assertNotIn('tiktok',setup); self.assertNotIn('tiktok',steps)

    def test_disabled_or_failed_read_is_not_a_working_measurement(self):
        self.plan_tiktok(); self.seed(); self.read()
        with mock.patch.object(get_settings(),'tiktok_access_mode','off'):
            setup,steps,measurement=self.guides()
            self.assertEqual(setup['tiktok']['status'],'soon'); self.assertEqual(steps['tiktok']['status'],'soon')
            self.assertFalse(measurement['has_numbers']); self.assertIsNone(measurement['first_numbers_at'])
            self.assertNotIn('tiktok',measurement['connected'])
        item=self.item(); extra=loads(item.extra_json,{})
        extra['source_readiness']['status']='reconnect'; item.extra_json=dumps(extra); self.db.commit()
        setup,steps,measurement=self.guides()
        self.assertFalse(setup['tiktok']['done']); self.assertEqual(steps['tiktok']['status'],'todo')
        self.assertFalse(measurement['has_numbers']); self.assertIsNone(measurement['first_numbers_at'])

    def test_empty_read_completes_connection_without_claiming_measurements(self):
        self.plan_tiktok(); self.seed(); self.snap['videos']=[]; self.read()
        setup,steps,measurement=self.guides()
        self.assertTrue(setup['tiktok']['done']); self.assertEqual(steps['tiktok']['status'],'done')
        self.assertFalse(measurement['has_numbers']); self.assertIsNone(measurement['first_numbers_at'])

    def test_partial_read_keeps_known_zero_counts_as_measurements(self):
        self.plan_tiktok(); self.seed()
        self.snap['videos'][0].update(view_count=None,comment_count=None,share_count=None,like_count=0)
        self.read(); setup,steps,measurement=self.guides()
        self.assertTrue(setup['tiktok']['done']); self.assertEqual(steps['tiktok']['status'],'done')
        self.assertTrue(measurement['has_numbers'])
