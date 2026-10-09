"""Research uses bounded, dated, business-owned evidence and distinct outcomes."""
import _test_env  # noqa: F401
import json
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db import Base
from app.models import Business, Integration, InstagramPost, PerformanceSnapshot, User
from app.services import discovery_interview as discovery, interview_evidence, marketing_outcome, service_results
from app.services.onboarding_draft import OnboardingDraft
from app.services.jsonutil import dumps


class InterviewEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        user = User(email='research@example.com', full_name='QA', password_hash='offline')
        self.db.add(user); self.db.flush()
        self.business = Business(user_id=user.id, name='Workshop', website_url='https://owner.example', offerings='Workshops', business_model='services',
            scraped_profile_json=dumps({'raw': {'url': 'https://owner.example', 'text': 'Small group workshops.'}}))
        self.db.add(self.business); self.db.commit()
    def tearDown(self):
        self.db.close(); self.engine.dispose()
    def draft(self, segment='services', **extra):
        return OnboardingDraft(**{'business_name':'Workshop', 'business_type':'other', 'offerings':'Workshops',
            'business_model':'services', 'links': {'website':'https://owner.example'},
            'research_journey': {'segment': segment, 'phase':'after'}, **extra})
    def report(self, **changes):
        report = {'property_id':'properties/owned', 'read_at':(datetime.utcnow()-timedelta(days=15)).isoformat(),
            'period': {'start':'2026-09-01','end':'2026-09-28'}, 'events':[
                {'eventName':'purchase','eventCount':'4'}, {'eventName':'add_to_cart','eventCount':'12'},
                {'eventName':'generate_lead','eventCount':'nan'}],
            'report_reads': {'events': {'status':'available', 'limited':True}}, **changes}
        record = PerformanceSnapshot(business_id=self.business.id, period_start='2026-10-01', period_end='2026-10-08', ga4_json=dumps(report))
        self.db.add(record); self.db.commit()
        return record
    def connect(self, property_id='properties/owned'):
        item = Integration(business_id=self.business.id, provider='ga4', status='connected', external_id=property_id)
        self.db.add(item); self.db.commit(); return item
    def test_saved_site_survives_cache_expiry_but_not_different_business(self):
        value = interview_evidence.snapshot(self.db,self.business,self.draft())
        with patch.object(discovery.preview,'cached_scan',return_value=None):
            sources, excerpts = discovery._evidence(self.draft(),value)
        self.assertEqual(excerpts[0]['text'],'Small group workshops.')
        self.assertEqual(sources[0]['status'],'read')
        self.assertEqual(interview_evidence.snapshot(self.db,self.business,self.draft(links={'website':'https://different.example'})),{})
    def test_original_source_date_period_and_coverage_retained(self):
        self.connect(); self.report()
        value = interview_evidence.snapshot(self.db,self.business,self.draft('online_shop'))['analytics']
        self.assertTrue(value['stale'])
        self.assertEqual(value['period']['end'],'2026-09-28')
        self.assertTrue(value['rows_limited'])
        self.assertEqual(value['stages'][0]['status'],'unknown')
        self.assertEqual(value['stages'][-1]['count'],4)
        self.assertIn('not unique',value['count_unit'])
        self.assertIn('unknown',value['missing_event_rule'])
    def test_no_selected_property_or_changed_property_has_no_analytics(self):
        self.report()
        self.assertEqual(interview_evidence.snapshot(self.db,self.business,self.draft())['analytics'],{})
        self.connect('properties/another')
        self.assertEqual(interview_evidence.snapshot(self.db,self.business,self.draft())['analytics'],{})
    def test_malformed_reports_do_not_lock_interview(self):
        self.connect(); row=self.report(report_reads={'events':[]}); row.ga4_json='[]'; self.db.commit()
        self.assertEqual(interview_evidence.snapshot(self.db,self.business,self.draft())['analytics'],{})
    def test_authorized_social_excerpt_is_historical_and_citation_checked(self):
        self.db.add(InstagramPost(business_id=self.business.id, media_id='own', caption='Book a private workshop.', permalink='https://www.instagram.com/p/own/'))
        self.db.commit()
        saved=interview_evidence.snapshot(self.db,self.business,self.draft())
        result={'facts':[{'quote':'Book a private workshop.', 'source_id':1}], 'questions':[{'question':'Which group size suits private workshops?', 'quote':'private workshop', 'source_id':1}]}
        with patch.object(discovery.preview,'cached_scan',return_value=None),patch.object(discovery.gemini,'generate_json',return_value=json.dumps(result)):
            value=discovery.research_questions(self.draft(),after_signup=True,locale='en',saved_evidence=saved)
        self.assertEqual(value['sources'][1]['scope'],'saved_post')
        self.assertEqual(value['questions'][0]['source'],'instagram')
        self.assertEqual(value['facts'][0]['url'],'https://www.instagram.com/p/own/')
    def test_all_routes_get_distinct_questions_context_and_no_extra_if_answered(self):
        for segment in interview_evidence.ROUTE_RULES:
            with self.subTest(segment=segment):
                draft=self.draft(segment)
                with patch.object(discovery.preview,'cached_scan',return_value=None),patch.object(discovery.gemini,'generate_json',return_value='{"questions":[]}') as model:
                    result=discovery.research_questions(draft,after_signup=True,locale='en')
                context=json.loads(model.call_args.kwargs['prompt'])['owner_answers']
                self.assertEqual(context['route_rules'],interview_evidence.ROUTE_RULES[segment])
                self.assertEqual(result['questions'],[])
                self.assertIn('Conflicting owner and site claims',model.call_args.kwargs['system'])
    def test_answered_question_not_repeated_and_owner_range_remains_range(self):
        draft=self.draft(research_journey={'segment':'services','phase':'after','replies':[{'question':'Who books?', 'answer':'Small teams'}],
            'observations':[{'key':'marketing_budget','status':'range','lower':3000,'upper':7000,'unit':'ILS','period':'per_month'}]})
        with patch.object(discovery.preview,'cached_scan',return_value=None),patch.object(discovery.gemini,'generate_json',return_value='{"questions":[{"question":"Who books?", "quote":""}]}') as model:
            result=discovery.research_questions(draft,after_signup=True,locale='en')
        self.assertEqual(result['questions'],[])
        observation=json.loads(model.call_args.kwargs['prompt'])['owner_answers']['previous_answers']['observations'][0]
        self.assertEqual((observation['lower'],observation['upper']), (3000,7000))
    def test_donation_context_is_not_service_clients(self):
        for segment in interview_evidence.ROUTE_RULES:
            self.business.scraped_profile_json=dumps({'owner_context': {'research_journey': {'segment':segment,'metric':'donations' if segment=='fundraising' else None}}})
            value=marketing_outcome.context(self.business)['marketing_outcome']
            self.assertEqual(value['segment'],segment)
            self.assertEqual(service_results.enabled(self.business),segment=='services')
            self.assertEqual(value['interpretation'],interview_evidence.ROUTE_RULES[segment])
