"""Meta first reads, partial recovery and tenant/race boundaries; no provider/model calls."""
import _test_env  # noqa: F401
import unittest
from datetime import datetime, timedelta
from unittest import mock
import test_ga4_readiness as fixture
from app.models import Integration, PerformanceSnapshot
from app.routers import performance
from app.security import encrypt_page_tokens, encrypt_secret
from app.services import ga4, meta, meta_marketing, meta_readiness, recommendation_context
from app.services.jsonutil import dumps, loads


def social():
    return {"page": {"id": "111", "name": "דף לדוגמה", "fan_count": 12}, "instagram_id": "222", "posts": []}


def measured(spend=20):
    return {"ads": {"status": "available", "account_id": "act_333", "overview": {"spend": spend, "currency": "ILS", "link_clicks": 0}, "period": {"start": "2026-09-05", "end": "2026-10-02"}}, "tracking": {"status": "receiving", "pixel_id": "444", "note_he": "אירועים התקבלו מהאתר."}}


class MetaReadinessTest(unittest.TestCase):
    setUp = fixture.SourceReadinessTest.setUp
    cleanup = fixture.SourceReadinessTest.cleanup
    snapshot = fixture.SourceReadinessTest.snapshot

    def seed(self, *, page="111", instagram="222", ads="", pixel="", business=None, status="connected"):
        item = Integration(business_id=(business or self.business).id, provider="meta", status=status, external_id=page or ads, access_token_enc=encrypt_secret("test-user-grant"), extra_json=dumps({"selected_page_id": page, "selected_instagram_id": instagram if page else "", "selected_ad_account_id": ads, "selected_pixel_id": pixel, "page_tokens": encrypt_page_tokens({page: "test-page-grant"}) if page else {}, "pages": [{"page_id": page, "display_name": "דף לדוגמה", "instagram_id": instagram}] if page else [], "ad_accounts": [{"id": ads, "name": "חשבון לדוגמה"}] if ads else []}))
        self.db.add(item); self.db.commit()
        return item

    def read(self, *, social_error=None, measurement=None):
        with mock.patch.object(meta, "fetch_insights", side_effect=social_error, return_value=social()) as fetch, mock.patch.object(meta, "account_overview", return_value={"followers_count": 12, "windows": {}}), mock.patch.object(meta_marketing, "measurement", return_value=measurement if measurement is not None else measured()) as measures, mock.patch.object(performance, "diagnose", side_effect=AssertionError("No model prerequisite")) as model:
            response = self.client.post("/integrations/meta/read")
        model.assert_not_called()
        return response, fetch, measures

    def state(self):
        return next(item for item in self.client.get("/integrations").json()["integrations"] if item["provider"] == "meta")["source_readiness"]

    def test_legacy_selection_is_not_a_verified_read(self):
        self.seed(); item = self.client.get("/integrations").json()["integrations"][0]
        self.assertTrue(item["connected"]); self.assertEqual(item["source_readiness"]["status"], "unchecked")
        self.assertNotIn("selection_key", item["source_readiness"])

    def test_permission_without_selection_never_reads(self):
        self.seed(page="", status="select_assets"); response, fetch, measures = self.read()
        self.assertEqual(response.status_code, 400); self.assertEqual(self.state()["status"], "no_assets")
        fetch.assert_not_called(); measures.assert_not_called()

    def test_first_read_persists_numbers_without_ai_and_retains_site_date(self):
        self.seed(); previous = self.snapshot(); response, fetch, _ = self.read()
        self.assertEqual(response.status_code, 200, response.text); self.assertEqual(self.state()["status"], "ready")
        fetch.assert_called_once_with("test-page-grant", "222", "111")
        payload = self.client.get("/performance/latest").json()
        self.assertEqual(payload["meta"]["page"]["fan_count"], 12)
        self.assertEqual(payload["ga4"]["read_at"], previous.created_at.isoformat())
        self.assertEqual(payload["diagnostic"]["analysis_status"], "pending")
        self.assertEqual(payload["sources"]["meta"]["status"], "ready")
        self.assertEqual(payload["meta"]["source_reads"]["social"]["read_at"], payload["meta"]["source_read_at"])

    def test_ads_only_empty_report_never_invents_a_baseline(self):
        self.seed(page="", ads="act_333"); response, fetch, _ = self.read(measurement={"ads": {"status": "no_activity", "overview": {}, "campaigns": []}})
        self.assertEqual(response.status_code, 200, response.text); self.assertEqual(self.state()["status"], "empty")
        fetch.assert_not_called(); self.assertEqual(self.db.query(PerformanceSnapshot).count(), 0)
        self.assertFalse(self.client.get("/performance/latest").json()["available"])

    def test_measured_zero_is_stored_as_zero(self):
        self.seed(page="", ads="act_333"); self.read(measurement=measured(0))
        self.assertEqual(self.state()["status"], "empty")
        payload = self.client.get("/performance/latest").json(); self.assertTrue(payload["available"])
        self.assertEqual(payload["meta"]["ads"]["overview"]["spend"], 0)

    def test_failures_keep_prior_snapshot_date_and_hide_provider_details(self):
        self.seed(); self.read(); before = self.client.get("/performance/latest").json()
        for kind, expected in (("token", "reconnect"), ("permission", "permission"), ("rate_limited", "unavailable")):
            with self.subTest(kind=kind):
                response, _, _ = self.read(social_error=meta.GraphError("private-token-message", kind=kind)); state = self.state()
                self.assertEqual(state["status"], expected); self.assertEqual(state["last_success_at"], before["meta"]["source_read_at"])
                self.assertNotIn("private-token-message", response.text)
                self.assertEqual(self.client.get("/performance/latest").json()["id"], before["id"])
                self.assertTrue(response.json()["integration"]["connected"])

    def test_wrapped_graph_failure_preserves_recovery_type(self):
        error = RuntimeError("unsafe wrapper"); error.__cause__ = meta.GraphError("unsafe token", kind="token")
        self.seed(); self.assertEqual(self.read(social_error=error)[0].json()["integration"]["source_readiness"]["status"], "reconnect")

    def test_page_without_linked_instagram_does_not_claim_post_data(self):
        self.seed(instagram=""); response, fetch, _ = self.read()
        self.assertEqual(response.json()["integration"]["source_readiness"]["status"], "link_instagram")
        self.assertIn("קשרו", self.state()["note_he"]); self.assertEqual(self.db.query(PerformanceSnapshot).count(), 0)
        fetch.assert_not_called()

    def test_partial_read_keeps_matching_old_social_with_its_own_date(self):
        self.seed(ads="act_333"); self.read(); prior = self.db.query(PerformanceSnapshot).one()
        old = loads(prior.meta_json, {}); old_date = "2026-09-20T09:00:00"
        old["source_read_at"] = old_date; old["source_reads"]["social"]["read_at"] = old_date; prior.meta_json = dumps(old); self.db.commit()
        self.read(social_error=meta.GraphError("denied", kind="permission"), measurement=measured(35))
        payload = self.client.get("/performance/latest").json(); self.assertEqual(self.state()["status"], "partial")
        self.assertEqual(payload["meta"]["ads"]["overview"]["spend"], 35); self.assertEqual(payload["meta"]["page"]["fan_count"], 12)
        self.assertEqual(payload["meta"]["source_reads"]["social"]["read_at"], old_date)
        self.assertEqual(self.state()["sections"]["social"]["retained_at"], old_date)
        _, _, basis = recommendation_context.prepare(self.business, {}, payload)
        self.assertEqual(next(row for row in basis["sources"] if row["key"] == "meta_social")["read_at"], old_date)

    def test_wrong_account_history_is_not_carried_into_new_read(self):
        item = self.seed(ads="act_333"); self.read(); extra = loads(item.extra_json, {}); extra["selected_instagram_id"] = "999"; item.extra_json = dumps(extra); self.db.commit()
        self.read(social_error=meta.GraphError("denied", kind="permission")); payload = self.client.get("/performance/latest").json()
        self.assertNotIn("account", payload["meta"]); self.assertEqual(payload["meta"]["posts"], [])
        self.assertNotIn("retained_at", self.state()["sections"]["social"])

    def test_wrong_site_pixel_is_partial_and_never_verified(self):
        self.seed(ads="act_333", pixel="444"); evidence = measured(); evidence["tracking"] = {"status": "wrong_site", "pixel_id": "444", "note_he": "הכתובת אינה של העסק."}
        response, _, _ = self.read(measurement=evidence); item = response.json()["integration"]
        self.assertEqual(item["source_readiness"]["status"], "partial"); self.assertEqual(item["pixel_verification"]["status"], "wrong_site")

    def test_other_customer_grant_is_never_used(self):
        self.seed(business=self.other_business); response, fetch, measures = self.read()
        self.assertEqual(response.status_code, 400); fetch.assert_not_called(); measures.assert_not_called()
        self.assertFalse(self.client.get("/performance/latest").json()["available"])

    def test_new_selection_or_grant_or_request_wins_over_old_read(self):
        item = self.seed()
        for change in ("selection", "grant", "request"):
            with self.subTest(change=change):
                def replace(*args):
                    extra = loads(item.extra_json, {})
                    if change == "selection": extra["selected_instagram_id"] = "999"
                    elif change == "grant": item.access_token_enc = encrypt_secret("new-grant")
                    else: extra["source_readiness"]["request_id"] = "newer-request"
                    item.extra_json = dumps(extra); self.db.commit(); return social()
                with mock.patch.object(meta, "fetch_insights", side_effect=replace), mock.patch.object(meta, "account_overview", return_value={}), mock.patch.object(meta_marketing, "measurement", return_value={}): self.client.post("/integrations/meta/read")
                self.assertEqual(self.db.query(PerformanceSnapshot).count(), 0)

    def test_interrupted_read_can_be_retried(self):
        item = self.seed(); extra = loads(item.extra_json, {}); extra["source_readiness"] = {"selection_key": meta_readiness.key(item), "status": "reading", "started_at": (datetime.utcnow()-timedelta(minutes=6)).isoformat()}; item.extra_json = dumps(extra); self.db.commit()
        self.assertEqual(self.state()["status"], "unavailable"); self.read(); self.assertEqual(self.state()["status"], "ready")

    def test_combined_sync_keeps_good_site_data_on_meta_and_model_failure(self):
        fixture.SourceReadinessTest.connect(self); self.seed()
        with mock.patch.object(ga4, "fetch_report", return_value=fixture.report()), mock.patch.object(meta, "fetch_insights", side_effect=meta.GraphError("private", kind="token")), mock.patch.object(meta_marketing, "measurement", return_value={}), mock.patch.object(performance, "diagnose", side_effect=RuntimeError("model outage")): response = self.client.post("/performance/sync")
        self.assertEqual(response.status_code, 200, response.text); self.assertNotIn("private", response.text); payload = response.json()
        self.assertEqual(payload["ga4"]["overview"]["sessions"], "42"); self.assertEqual(payload["sources"]["meta"]["status"], "reconnect")
        self.assertEqual(payload["diagnostic"]["analysis_status"], "unavailable")

    def test_meta_only_failed_results_refresh_does_not_replace_observations(self):
        self.seed(); self.read(); previous = self.client.get("/performance/latest").json()
        with mock.patch.object(meta, "fetch_insights", side_effect=meta.GraphError("private", kind="token")), mock.patch.object(meta_marketing, "measurement", return_value={}): response = self.client.post("/performance/sync")
        self.assertEqual(response.status_code, 502); self.assertNotIn("private", response.text)
        self.assertEqual(self.client.get("/performance/latest").json()["id"], previous["id"])

    def test_account_summary_token_failure_keeps_post_figures_and_requests_reconnect(self):
        self.seed()
        with mock.patch.object(meta, "fetch_insights", return_value=social()), mock.patch.object(meta, "account_overview", return_value={"stopped": "token", "windows": {}}), mock.patch.object(meta_marketing, "measurement", return_value={}):
            response = self.client.post("/integrations/meta/read")
        self.assertEqual(response.status_code, 200)
        state = self.state()
        self.assertEqual(state["status"], "partial")
        self.assertEqual(state["sections"]["social"]["recovery_status"], "reconnect")
        self.assertEqual(self.client.get("/performance/latest").json()["meta"]["page"]["fan_count"], 12)

    def test_manual_pixel_check_updates_current_readiness_and_results(self):
        self.seed(ads="act_333", pixel="444")
        evidence = measured(); evidence["tracking"].update(status="waiting")
        self.read(measurement=evidence)
        self.assertEqual(self.state()["status"], "partial")
        verified = {"status": "receiving", "pixel_id": "444", "note_he": "אירועים התקבלו מהאתר.", "checked_at": datetime.utcnow().isoformat()}
        with mock.patch.object(meta_marketing, "verify_pixel", return_value=verified):
            self.assertEqual(self.client.post("/integrations/meta/verify").status_code, 200)
        self.assertEqual(self.state()["status"], "ready")
        self.assertEqual(self.client.get("/performance/latest").json()["meta"]["tracking"], verified)

    def test_failed_ads_keep_their_original_date_beside_new_social_figures(self):
        self.seed(ads="act_333"); self.read()
        prior = self.db.query(PerformanceSnapshot).one(); old = loads(prior.meta_json, {})
        old_date = "2026-09-20T09:00:00"; old["source_reads"]["ads"]["read_at"] = old_date
        prior.meta_json = dumps(old); self.db.commit()
        self.read(measurement={"ads": {"status": "permission", "note_he": "חסרה גישה."}})
        payload = self.client.get("/performance/latest").json()
        self.assertEqual(self.state()["status"], "partial")
        self.assertEqual(payload["meta"]["ads"]["overview"]["spend"], 20)
        _, _, basis = recommendation_context.prepare(self.business, {}, payload)
        self.assertEqual(next(row for row in basis["sources"] if row["key"] == "meta_ads")["read_at"], old_date)

    def test_disconnect_during_read_cannot_restore_integration(self):
        item = self.seed()
        def disconnect(*args):
            self.db.delete(item); self.db.commit(); return social()
        with mock.patch.object(meta, "fetch_insights", side_effect=disconnect), mock.patch.object(meta, "account_overview", return_value={}), mock.patch.object(meta_marketing, "measurement", return_value={}):
            response = self.client.post("/integrations/meta/read")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.db.query(Integration).count(), 0)
        self.assertEqual(self.db.query(PerformanceSnapshot).count(), 0)

    def test_website_change_invalidates_old_pixel_verification(self):
        self.seed(ads="act_333", pixel="444"); self.read()
        self.business.website_url = "https://new.example.com"; self.db.commit()
        self.assertEqual(self.state()["status"], "unchecked")
        self.assertIsNone(self.client.get("/integrations").json()["integrations"][0]["pixel_verification"])

    def test_google_failure_does_not_prevent_meta_read_and_preserves_dated_site_data(self):
        fixture.SourceReadinessTest.connect(self); self.seed()
        previous = fixture.SourceReadinessTest.snapshot(self)
        old_ga = fixture.report(); old_ga['read_at'] = '2026-08-28T10:00:00'
        old_ga['period'] = {'start': '2026-08-01', 'end': '2026-08-28'}
        previous.ga4_json = dumps(old_ga); self.db.commit()
        from google.api_core.exceptions import PermissionDenied
        with mock.patch.object(ga4, 'fetch_report', side_effect=PermissionDenied('private')), \
                mock.patch.object(meta, 'fetch_insights', return_value=social()) as social_read, \
                mock.patch.object(meta, 'account_overview', return_value={}), \
                mock.patch.object(meta_marketing, 'measurement', return_value={}), \
                mock.patch.object(performance, 'diagnose', return_value={}), \
                mock.patch.object(performance, '_refresh_post_results', return_value={}) as post_results:
            response = self.client.post('/performance/sync')
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        social_read.assert_called_once()
        self.assertEqual(result['sources']['ga4']['status'], 'reconnect')
        self.assertEqual(result['ga4']['read_at'], old_ga['read_at'])
        self.assertEqual(result['ga4']['period'], old_ga['period'])
        self.assertEqual(result['ga4']['overview']['sessions'], '42')
        self.assertEqual(result['ga4']['source_error']['status'], 'reconnect')
        self.assertEqual(result['meta']['page']['fan_count'], 12)
        self.assertIsNone(post_results.call_args.args[2])  # old GA4 is not a new post read
        self.assertNotEqual(result['id'], previous.id)
        self.assertNotIn('private', response.text)

    def test_old_google_data_from_another_property_is_not_carried_into_meta_refresh(self):
        fixture.SourceReadinessTest.connect(self, property_id='999'); self.seed()
        fixture.SourceReadinessTest.snapshot(self)
        with mock.patch.object(ga4, 'fetch_report', side_effect=RuntimeError('offline')), \
                mock.patch.object(meta, 'fetch_insights', return_value=social()), \
                mock.patch.object(meta, 'account_overview', return_value={}), \
                mock.patch.object(meta_marketing, 'measurement', return_value={}), \
                mock.patch.object(performance, 'diagnose', return_value={}):
            response = self.client.post('/performance/sync')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotIn('overview', response.json()['ga4'])

    def test_both_reads_fail_without_replacing_snapshot_or_running_analysis(self):
        fixture.SourceReadinessTest.connect(self); self.seed()
        previous = fixture.SourceReadinessTest.snapshot(self)
        with mock.patch.object(ga4, 'fetch_report', side_effect=RuntimeError('offline')), \
                mock.patch.object(meta, 'fetch_insights', side_effect=meta.GraphError('private', kind='token')) as social_read, \
                mock.patch.object(meta_marketing, 'measurement', return_value={}), \
                mock.patch.object(performance, 'diagnose') as analyse:
            response = self.client.post('/performance/sync')
        self.assertEqual(response.status_code, 502)
        social_read.assert_called_once(); analyse.assert_not_called()
        self.assertEqual(self.client.get('/performance/latest').json()['id'], previous.id)
