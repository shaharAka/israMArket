"""Owner corrections, forgotten sources and unlimited audience entry; no provider I/O."""
import _test_env
import json
import unittest
from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.db import Base
from app.models import User, Business, Audience
from app.services import onboarding_draft as drafts, discovery_interview as discovery
from app.services.jsonutil import loads, dumps

def draft(**extra):
    return drafts.OnboardingDraft(**dict({'business_name':'פעילות לדוגמה','business_type':'other','offerings':'ליווי אישי למשפחות','business_model':'services','research_journey':{'segment':'fundraising','phase':'after','step':'connections'}},**extra))

class OnboardingReviewTest(unittest.TestCase):
    def test_more_than_three_audiences_survive_save_and_recovery(self):
        value=draft(audiences=[{'name':f'קהל {i}','description':'משפחות בקהילה'} for i in range(8)])
        with create_engine('sqlite://').begin() as conn:
            Base.metadata.create_all(conn)
            with Session(bind=conn) as db:
                owner=User(email='qa@example.test',full_name='QA');db.add(owner);db.flush()
                business=Business(user_id=owner.id);db.add(business);db.flush()
                drafts.apply_draft(db,business,value)
                self.assertEqual(db.query(Audience).filter_by(business_id=business.id).count(),8)
                saved=loads(business.scraped_profile_json,{})['owner_context']['research_journey']
                self.assertEqual(len(saved['answers']['audiences']),8)

    def test_excluded_domain_is_removed_from_links_and_saved_site_evidence(self):
        value=draft(links={'website':'https://shop.example','instagram':'https://www.instagram.com/example_shop/'},research_journey={'segment':'fundraising','excluded_sources':['https://shop.example/about','https://instagram.com/example_shop/']})
        self.assertEqual(value.links.website,'');self.assertEqual(value.links.instagram,'')
        evidence={'site_scan':{'raw':{'url':'https://shop.example','text':'Do not reuse this claim.'}},'social_excerpts':[{'url':'https://instagram.com/p/test','text':'An old claim.'}]}
        sources,texts=discovery._evidence(value,evidence)
        self.assertEqual(sources,[]);self.assertEqual(texts,[])
        self.assertIsNone(drafts.site_context(value))

    def test_remaining_source_ids_still_validate_the_right_quote(self):
        value=draft(research_journey={'segment':'fundraising','excluded_sources':['https://instagram.com/example/']})
        evidence={'social_excerpts':[{'url':'https://instagram.com/p/a','text':'Removed claim.'},{'url':'https://other.example/post','text':'Kept claim.'}]}
        sources,texts=discovery._evidence(value,evidence)
        self.assertEqual(len(sources),1);self.assertEqual(texts[0]['source_id'],0);self.assertEqual(texts[0]['text'],'Kept claim.')

    def test_correction_is_owner_context_and_rejected_claim_is_not_returned(self):
        value=draft(links={'website':'https://group.example'},research_journey={'segment':'fundraising','corrections':[{'source_url':'https://group.example','original':'Only children.','corrected':'Children and parents.'}]})
        scan={'raw':{'url':'https://group.example','text':'Only children.'}}
        with patch.object(discovery.preview,'cached_scan',return_value=scan),patch.object(discovery.gemini,'generate_json',return_value=json.dumps({'facts':[{'quote':'Only children.','source_id':0}],'questions':[]})) as model:
            result=discovery.research_questions(value)
        self.assertEqual(result['facts'],[])
        context=json.loads(model.call_args.kwargs['prompt'])['owner_answers']
        self.assertEqual(context['owner_corrections'][0]['corrected'],'Children and parents.')
        self.assertIn('Children and parents.',discovery.planning_context(value.research_journey.model_dump()))

    def test_fundraising_does_not_accept_a_customer_followup(self):
        with patch.object(discovery.gemini,'generate_json',return_value=json.dumps({'questions':[{'question':'מי הלקוחות שלכם?','quote':''}]})):
            result=discovery.research_questions(draft(),after_signup=True)
        self.assertNotIn('לקוחות',str(result['questions']))
        self.assertIn('תרומה',result['questions'][0]['question'])

    def test_forgetting_site_removes_stored_brand_research(self):
        value=draft(research_journey={'segment':'fundraising','phase':'after','step':'connections','excluded_sources':['https://group.example/about']})
        with create_engine('sqlite://').begin() as conn:
            Base.metadata.create_all(conn)
            with Session(bind=conn) as db:
                owner=User(email='forgot@example.test',full_name='QA');db.add(owner);db.flush()
                business=Business(user_id=owner.id,website_url='https://group.example',scraped_profile_json=dumps({'raw':{'url':'https://group.example','text':'Old claim'},'extracted':{'offering':'Old claim'},'brand_language':{'source':'site'}}));db.add(business);db.flush()
                drafts.apply_draft(db,business,value)
                saved=loads(business.scraped_profile_json,{})
                self.assertNotIn('raw',saved);self.assertNotIn('extracted',saved)
                self.assertEqual(business.website_url,'')
                self.assertEqual(saved['owner_context']['research_journey']['excluded_sources'],['https://group.example/about'])
