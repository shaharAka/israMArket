"""Offline Page reads, retention and exact owner/post attribution."""
import _test_env  # noqa: F401
import unittest
from unittest import mock
from app.models import Integration, PerformanceSnapshot
from app.services import facebook_posts as fb, meta, meta_marketing, meta_readiness, connected_posts as cp
from app.services.jsonutil import dumps, loads
from test_connected_posts import ConnectedTestCase, stored_post
import test_meta_readiness as fixture

STAMP = "2026-10-09T10:00:00+00:00"
def post(value=42, stamp=STAMP, page="111", identity="222", **extra):
    key=f"{page}_{identity}"
    return {"id":key,"page_id":page,"permalink":f"https://www.facebook.com/{page}/posts/{identity}/",
            "insights":{fb.METRICS[0]:value},"observations":{fb.METRICS[0]:{"source":"facebook","scope":"cumulative","period":"lifetime","provider_metric":fb.METRICS[0],"account_id":page,"media_id":key,"read_at":stamp}},**extra}
def report(posts=None,page="111",**extra):
    return {"page_id":page,"posts":[post()] if posts is None else posts,"read_at":STAMP,"status":"ready","limited":False,**extra}

class PageGraphTest(unittest.TestCase):
    def read(self, side_effect):
        with mock.patch.object(meta_marketing,"collection",return_value=[{"id":"111","tasks":["ANALYZE"]}]),mock.patch.object(meta,"graph_get",side_effect=side_effect):
            return fb.read("USER","PAGE","111")
    def test_unique_viewers_and_views_are_separate_dated_lifetime_counts(self):
        calls=[]
        def get(path,params,token):
            calls.append((path,params,token))
            if path.endswith("published_posts"):return {"data":[{"id":"111_222","permalink_url":"https://facebook.com/111/posts/222"},{"id":"999_222"}]}
            return {"data":[{"name":params["metric"],"period":"lifetime","values":[{"value":42 if params["metric"]==fb.METRICS[0] else 85}]}]}
        result=self.read(get)
        self.assertEqual(result["posts"][0]["insights"],{fb.METRICS[0]:42,fb.METRICS[1]:85})
        self.assertEqual(len(result["posts"]),1)
        self.assertTrue(all(token=="PAGE" for _,_,token in calls))
        self.assertEqual(result["posts"][0]["observations"][fb.METRICS[0]]["period"],"lifetime")
    def test_rate_limit_preserves_earlier_metric_and_stops(self):
        def get(path,params,token):
            if path.endswith("published_posts"):return {"data":[{"id":"111_222"},{"id":"111_333"}]}
            if params["metric"]==fb.METRICS[0]:return {"data":[{"name":fb.METRICS[0],"period":"lifetime","values":[{"value":0}]}]}
            raise meta.GraphError("private-token",kind="rate_limited")
        result=self.read(get)
        self.assertEqual(result["status"],"partial");self.assertEqual(result["failure"],"rate_limited")
        self.assertEqual(result["posts"][0]["insights"],{fb.METRICS[0]:0})
        self.assertNotIn("private-token",dumps(result))
    def test_unknown_daily_object_negative_and_boolean_counts_are_not_zero(self):
        for raw,period in [(None,"lifetime"),({"x":4},"lifetime"),(-1,"lifetime"),(True,"lifetime"),(42,"day")]:
            def get(path,params,token):
                if path.endswith("published_posts"):return {"data":[{"id":"111_222"}]}
                return {"data":[{"name":params["metric"],"period":period,"values":[{"value":raw}]}]}
            self.assertEqual(self.read(get)["posts"][0]["insights"],{})
    def test_no_analyze_task_never_reads_any_post(self):
        with mock.patch.object(meta_marketing,"collection",return_value=[{"id":"111","tasks":["CREATE_CONTENT"]}]),mock.patch.object(meta,"graph_get") as get:
            with self.assertRaises(meta.GraphError):fb.read("USER","PAGE","111")
            get.assert_not_called()
    def test_cursor_bound_deduplicates_and_does_not_follow_provider_url(self):
        calls=[]
        def get(path,params,token):
            calls.append(path)
            if path.endswith("published_posts"):return {"data":[{"id":"111_222"}],"paging":{"next":"https://evil.example/?token=x","cursors":{"after":"same"}}}
            return {"data":[]}
        result=self.read(get)
        self.assertTrue(result["limited"]);self.assertEqual(len(result["posts"]),1)
        self.assertTrue(all(not path.startswith("http") for path in calls))
    def test_merge_missing_and_older_counts_retains_original_date_and_page(self):
        before=report()
        merged=fb.merge(report([post(insights={},observations={})]),before)
        self.assertEqual(merged["posts"][0]["insights"],before["posts"][0]["insights"])
        self.assertEqual(merged["posts"][0]["observations"],before["posts"][0]["observations"])
        self.assertEqual(fb.merge(report([post(20,"2026-10-08T09:00:00+00:00")]),before)["posts"][0]["insights"][fb.METRICS[0]],42)
        self.assertEqual(fb.merge(report([],page="999"),before)["posts"],[])

class PageAttributionTest(ConnectedTestCase):
    def setUp(self):
        super().setUp()
        self.db.add(Integration(business_id=self.business.id,provider="meta",status="connected",external_id="111",extra_json=dumps({"selected_page_id":"111"})))
        self.db.add(PerformanceSnapshot(business_id=self.business.id,period_start="2026-09-10",period_end="2026-10-09",meta_json=dumps({"facebook":report()})))
        self.db.commit()
        self.month([stored_post("Workshop",uid="facebook01",channel="facebook",mix_type="value",cta="Learn more",published_url="https://www.facebook.com/permalink.php?story_fbid=222&id=111")])
    def test_exact_page_post_reach_and_date_visible_without_repeated_learning_or_comparison(self):
        with mock.patch.object(cp,"lite_json",side_effect=AssertionError("No paid call")):
            cp.refresh_results(self.db,self.business,phrase=False);self.db.commit()
        saved=self.current_posts()[0]
        self.assertEqual(saved["results"]["value"],42)
        self.assertEqual(saved["results"]["matched_by"],["facebook_link"])
        self.assertIsNone(saved["learning"]);self.assertIsNone(saved["results"]["compare"])
        self.assertEqual(cp.measured_posts([saved])["items"][0]["observation"]["read_at"],STAMP)
    def test_link_channel_and_tenant_boundaries_not_caption_guessing(self):
        rows=cp._media_rows(self.db,self.business.id,{})
        owner=self.current_posts()[0]
        for changes in [{"channel":"instagram"},{"published_url":""},{"published_url":"https://facebook.com/permalink.php?story_fbid=333&id=111"},{"published_url":"https://facebook.com/permalink.php?story_fbid=222&id=999"},{"published_url":"https://evil.example/111/posts/222"}]:
            self.assertIsNone(cp._match_media({**owner,**changes},rows,set())[0])
        self.assertEqual(cp._media_rows(self.db,999,{}),[])
        item=self.db.query(Integration).one();item.extra_json=dumps({"selected_page_id":"999"});self.db.commit()
        self.assertEqual(cp._media_rows(self.db,self.business.id,{}),[])
    def test_total_views_alone_do_not_become_people_or_conversions(self):
        snapshot=self.db.query(PerformanceSnapshot).one();snapshot.meta_json=dumps({"facebook":report([post(insights={fb.METRICS[1]:85},observations={})])});self.db.commit()
        cp.refresh_results(self.db,self.business,phrase=False);self.db.commit()
        self.assertIsNone(self.current_posts()[0]["results"])
    def test_old_instagram_or_undated_count_cannot_appear_on_facebook(self):
        original=self.current_posts()[0]
        for result in [{"metric":"reach","value":80,"reach":80},{"metric":"saves","value":5,"saves":5}]:
            view=cp.connected_view({**original,"results":result},index=0,business_id=self.business.id,year=2026,month=10)
            self.assertEqual(cp.measured_posts([view])["items"],[])
    def test_analysis_preserves_individual_post_counts_and_cannot_sum_unique_people(self):
        from app.services import recommendation_context
        payload={"facebook":report(),"source_selection":meta_readiness.selection(self.db.query(Integration).one()),"source_reads":{"facebook":{"read_at":STAMP}}}
        _,_,basis=recommendation_context.prepare(self.business,{}, {"meta":payload})
        found=[row for row in basis["observations"] if row["source"]=="facebook_posts"]
        self.assertEqual(len(found),1);self.assertEqual(found[0]["value"],42)
        self.assertEqual(found[0]["media_id"],"111_222");self.assertEqual(found[0]["read_at"],STAMP)

class PageReadinessTest(unittest.TestCase):
    setUp=fixture.MetaReadinessTest.setUp
    cleanup=fixture.MetaReadinessTest.cleanup
    seed=fixture.MetaReadinessTest.seed
    def test_missing_scope_never_reads_and_facebook_only_does_not_require_instagram(self):
        item=self.seed(instagram="")
        with mock.patch.object(fb,"read") as get,mock.patch.object(meta_marketing,"measurement",return_value={}):
            result,sections=meta_readiness.fetch(item,"","2026-09-10","2026-10-09")
        get.assert_not_called();self.assertNotIn("social",sections)
        self.assertEqual(sections["facebook"]["status"],"permission")
    def test_page_only_initial_read_persists_without_instagram_or_model(self):
        item=self.seed(instagram="");extra=loads(item.extra_json,{});extra["scopes"]=list(fb.SCOPES);item.extra_json=dumps(extra);self.db.commit()
        with mock.patch.object(fb,"read",return_value=report()) as get,mock.patch.object(meta,"fetch_insights") as instagram,mock.patch.object(meta_marketing,"measurement",return_value={}):
            state=meta_readiness.initial_read(self.db,item,"")
        self.assertEqual(state["status"],"ready");instagram.assert_not_called()
        get.assert_called_once_with("test-user-grant","test-page-grant","111")
        saved=loads(self.db.query(PerformanceSnapshot).one().meta_json,{})
        self.assertEqual(saved["source_reads"]["facebook"]["scope"],"cumulative")
        self.assertIsNone(saved["source_reads"]["facebook"]["period"])
    def test_failed_page_preserves_earlier_evidence_and_successful_instagram(self):
        item=self.seed();extra=loads(item.extra_json,{});extra["scopes"]=list(fb.SCOPES);item.extra_json=dumps(extra);self.db.commit()
        old=PerformanceSnapshot(business_id=self.business.id,period_start="2026-09-10",period_end="2026-10-09",meta_json=dumps({"facebook":report(),"source_reads":{"facebook":{"read_at":STAMP,"scope":"cumulative","period":None}}}))
        self.db.add(old);self.db.commit()
        with mock.patch.object(fb,"read",side_effect=meta.GraphError("private token",kind="permission")),mock.patch.object(meta,"fetch_insights",return_value=fixture.social()),mock.patch.object(meta,"account_overview",return_value={"followers_count":12,"windows":{}}),mock.patch.object(meta_marketing,"measurement",return_value={}):
            result=meta_readiness.read(self.db,item,"","2026-09-10","2026-10-09")
        self.assertEqual(result["facebook"]["posts"][0]["insights"][fb.METRICS[0]],42)
        self.assertEqual(meta_readiness.public_state(item)["status"],"partial")
        self.assertEqual(result["source_reads"]["facebook"]["read_at"],STAMP)
        self.assertNotIn("private token",dumps(result))

if __name__=="__main__":unittest.main()
