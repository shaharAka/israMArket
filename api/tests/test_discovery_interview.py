"""Research boundaries, evidence and reported money. All provider calls are stubbed."""
import _test_env
import json
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.main import app
from app.db import Base, get_db
from app.deps import get_current_user
from app.models import Business, User
from app.services import discovery_interview as discovery, onboarding_draft as drafts
from app.services.jsonutil import loads
from app.routers import onboarding

def payload(step='sources', observations=None):
    return {'business_name':'בדיקה','business_type':'other','offerings':'פיג׳מות בעיצוב מקומי','business_model':'products','research_journey':{'version':1,'segment':'online_shop','phase':'after','step':step,'observations':observations or []}}

class ResearchTests(unittest.TestCase):
    def test_ranges_and_unknowns(self):
        value=discovery.Observation(key='order_value',status='range',lower=300,upper=2000,unit='ILS',period='per_order')
        self.assertEqual((value.lower,value.upper,value.status),(300,2000,'range'))
        self.assertIn('אין להמיר טווח',discovery.planning_context({'observations':[value.model_dump()]}))
        unknown=discovery.Observation(key='outcomes',lower=0,upper=9,unit='count',period='last_30_days')
        self.assertIsNone(unknown.lower);self.assertIsNone(unknown.upper)
    def test_invalid_numbers(self):
        for extra in ({'status':'range','lower':2000,'upper':300},{'status':'exact'},{'status':'exact','lower':float('inf')},{'status':'exact','lower':-1}):
            with self.subTest(extra=extra),self.assertRaises(ValidationError):
                discovery.Observation(key='order_value',unit='ILS',period='per_order',**extra)
    def test_route_contract(self):
        for segment,metric in [('online_shop','purchases'),('physical_shop','store_sales'),('services','booked_work'),('software','paid_accounts'),('fundraising','donations')]:
            self.assertEqual(discovery.Interview(segment=segment,metric=metric).metric,metric)
        with self.assertRaises(ValidationError):discovery.Interview(segment='online_shop',metric='qualified_inquiries')
        with self.assertRaises(ValidationError):discovery.Interview(segment='services',observations=[{'key':'order_value','unit':'ILS','period':'per_order'}])
    def test_unread_social_and_provider_failure(self):
        draft=drafts.OnboardingDraft(**{**payload(),'links':{'instagram':'@local_shop'}})
        with patch.object(discovery.gemini,'generate_json',side_effect=RuntimeError('offline')):
            result=discovery.research_questions(draft)
        self.assertFalse(result['assisted']);self.assertEqual(result['sources'][0]['status'],'not_read')
        self.assertNotIn('posts',result);self.assertNotIn('plan',result)
    def test_quotes_must_exist_in_site(self):
        draft=drafts.OnboardingDraft(**{**payload(),'links':{'website':'https://shop.example'}})
        result={'questions':[{'question':'מי מחפש מידות רחבות?','quote':'מידות רחבות'},{'question':'מיליון?','quote':'מיליון לקוחות'}]}
        with patch.object(discovery.preview,'cached_scan',return_value={'raw':{'text':'פיג׳מות בעיצוב מקומי. מידות רחבות.'}}),patch.object(discovery.gemini,'generate_json',return_value=json.dumps(result)):
            value=discovery.research_questions(draft)
        self.assertEqual(len(value['questions']),1);self.assertEqual(value['sources'][0]['status'],'read')

    def test_per_page_citations_and_evidence_revision(self):
        draft=drafts.OnboardingDraft(**{**payload(),'links':{'website':'https://shop.example'}})
        scan={'raw':{'text':'Handmade clothing.', 'product_pages':[{'url':'https://shop.example/about','kind':'about','text':'Made in Haifa.','read_at':'2026-10-09'}]}}
        result={'facts':[{'quote':'Made in Haifa.','source_id':1}, {'quote':'clothing. Made','source_id':0}],
                'questions':[{'question':'Who buys locally?','quote':'Made in Haifa.','source_id':1}, {'question':'False source','quote':'Made in Haifa.','source_id':0}]}
        with patch.object(discovery.preview,'cached_scan',return_value=scan),patch.object(discovery.gemini,'generate_json',return_value=json.dumps(result)) as model:
            first=discovery.evidence_revision(draft)
            value=discovery.research_questions(draft,locale='en')
            self.assertEqual(len(value['facts']),1)
            self.assertEqual(value['facts'][0]['url'],'https://shop.example/about')
            self.assertEqual(len(value['questions']),1)
            self.assertEqual(value['questions'][0]['url'],'https://shop.example/about')
            self.assertEqual(len(json.loads(model.call_args.kwargs['prompt'])['source_excerpts']),2)
            scan['raw']['product_pages'][0]['text']='Made in Jerusalem.'
            self.assertNotEqual(first,discovery.evidence_revision(draft))
    def test_attempted_sources_are_not_claimed_read(self):
        draft=drafts.OnboardingDraft(**{**payload(),'links':{'website':'https://shop.example'}})
        scan={'raw':{'text':'Public homepage', 'product_research':{'sources':[{'url':'https://shop.example/about','kind':'about','status':'blocked'}, {'url':'https://shop.example/pricing','kind':'pricing','status':'limited'}]}}}
        with patch.object(discovery.preview,'cached_scan',return_value=scan),patch.object(discovery.gemini,'generate_json',side_effect=RuntimeError('offline')):
            value=discovery.research_questions(draft)
        self.assertEqual([s['status'] for s in value['sources']],['read','blocked','limited'])
        self.assertEqual(value['facts'],[])
        self.assertIn('ערוץ השיווק',discovery.planning_context(draft.research_journey.model_dump()))

class SavedJourneyTests(unittest.TestCase):
    def setUp(self):
        self.engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
        Base.metadata.create_all(self.engine);self.Session=sessionmaker(bind=self.engine)
        with self.Session() as db:
            user=User(email='qa@example.com',password_hash='offline',full_name='QA');db.add(user);db.commit();self.owner_id=user.id
        def database():
            with self.Session() as db:yield db
        def owner():
            with self.Session() as db:return db.get(User,self.owner_id)
        app.dependency_overrides[get_db]=database;app.dependency_overrides[get_current_user]=owner
        self.client=TestClient(app);self.scan=patch('app.services.onboarding_draft.site_context',return_value=None);self.scan.start()
    def tearDown(self):
        self.client.close();self.scan.stop();app.dependency_overrides.clear();self.engine.dispose()
    def save(self,**kw):return self.client.post('/onboarding/from-draft',json={'draft':payload(**kw)})
    def test_no_plan_and_no_background_ai_at_signup(self):
        with patch('app.services.design_dna.refresh_after_scan') as design:response=self.save()
        self.assertEqual(response.status_code,200,response.text);design.assert_not_called()
        business=response.json()['business'];self.assertFalse(business['onboarding_complete']);self.assertFalse(business.get('quarter_plan'))
        self.assertEqual(business['owner_context']['research_journey']['answers']['offerings'],'פיג׳מות בעיצוב מקומי')
    def test_money_range_preserved(self):
        values=[{'key':'order_value','status':'range','lower':300,'upper':2000,'unit':'ILS','period':'per_order'},{'key':'marketing_budget','status':'range','lower':3000,'upper':7000,'unit':'ILS','period':'per_month'}]
        response=self.save(observations=values);self.assertEqual(response.status_code,200,response.text)
        business=response.json()['business'];self.assertEqual(business['monthly_budget_ils'],0)
        self.assertEqual(business['owner_context']['research_journey']['observations'][0]['upper'],2000)
        with self.Session() as db:self.assertNotIn('goal_numbers',loads(db.query(Business).first().scraped_profile_json,{}))
    def test_plan_guard_and_optional_connections(self):
        self.save();response=self.client.post('/onboarding/generate');self.assertEqual(response.status_code,409,response.text)
        self.save(step='build')
        with self.Session() as db:self.assertIsNotNone(onboarding._generation_precheck(db.query(Business).first()))
    def test_existing_workspace_preserved(self):
        with self.Session() as db:db.add(Business(user_id=self.owner_id,name='Keep',offerings='Existing',onboarding_complete=1));db.commit()
        self.assertEqual(self.save().status_code,409)
        with self.Session() as db:self.assertEqual(db.query(Business).first().name,'Keep')
    def test_legacy_preview_not_used_as_research(self):
        from app.services.jsonutil import dumps
        with self.Session() as db:
            db.add(Business(user_id=self.owner_id, name='Incomplete', scraped_profile_json=dumps({
                'first_month_seed': {'hypothesis':'Old unsupported direction','strategy':{'goal':'invented'}},
                'growth_hypothesis':'Old unsupported direction', 'goal_numbers':{'target':2000}})))
            db.commit()
        self.assertEqual(self.save().status_code,200)
        with self.Session() as db:
            stored=loads(db.query(Business).first().scraped_profile_json,{})
            for key in ('first_month_seed','growth_hypothesis','goal_numbers'):self.assertNotIn(key,stored)
    def test_all_routes_can_save_and_build_without_measurements(self):
        for segment,model,metric in [('online_shop','products','purchases'),('physical_shop','products','store_sales'),('services','services','booked_work'),('software','saas','paid_accounts'),('fundraising','services','donations')]:
            with self.subTest(segment=segment):
                draft=payload(step='build');draft['business_model']=model
                draft['research_journey'].update(segment=segment,metric=metric)
                response=self.client.post('/onboarding/from-draft',json={'draft':draft})
                self.assertEqual(response.status_code,200,response.text)
                self.assertEqual(response.json()['business']['owner_context']['research_journey']['metric'],metric)
                with self.Session() as db:self.assertIsNotNone(onboarding._generation_precheck(db.query(Business).first()))
    def test_new_plan_excludes_agency_cost_models(self):
        from app.services import strategy
        business={'name':'QA','business_model':'products','owner_context':{'research_journey':payload()['research_journey']}}
        with patch.object(strategy,'plan_from_budget',side_effect=AssertionError('Agency CPA forbidden')),patch.object(strategy.google_cost,'plan_for_business',side_effect=AssertionError('Agency CPC forbidden')),patch.object(strategy,'strategy_json',return_value=json.dumps({'theme':'QA','weekly_breakdown':[{'week':1}]})) as generate:
            core=strategy.build_roadmap(business,{},[],{}, {})
        self.assertEqual(core['theme'],'QA')
        self.assertIn('אין להמיר טווח',generate.call_args.args[0])
        self.assertIn('Unknown is not zero',generate.call_args.args[0])
        self.assertIn('published_benchmark',generate.call_args.args[0])
    def test_deferred_link(self):
        response=self.client.post('/onboarding/from-draft',json={'draft':payload(),'deferred_links':{'facebook':'not a page'}})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['business']['owner_context']['pending_links']['facebook']['url'],'not a page')
