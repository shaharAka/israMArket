"""Offline measurement, consent and tenant-boundary regression tests."""
import _test_env  # noqa: F401
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urlsplit
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.config import get_settings
from app.db import Base, get_db
from app.main import app
from app.models import Business, Integration, PerformanceSnapshot, User
from app.routers import performance
from app.security import COOKIE_NAME, create_access_token, decrypt_secret, encrypt_page_tokens, encrypt_secret
from app.services import meta, meta_marketing as m
from app.services.jsonutil import dumps, loads

NOW = datetime(2026, 10, 1, 12, tzinfo=timezone.utc)

class MeasurementTest(unittest.TestCase):
    def test_pagination_uses_cursor_not_provider_next_url(self):
        pages = [{"data": [{"id": "1"}], "paging": {"next": "https://evil.invalid/token", "cursors": {"after": "cursor"}}}, {"data": [{"id": "2"}]}]
        with mock.patch.object(meta, "graph_get", side_effect=pages) as get:
            self.assertEqual(len(m.collection("me/adaccounts", {}, "secret")), 2)
        self.assertEqual(get.call_args_list[1].args, ("me/adaccounts", {"limit": 100, "after": "cursor"}, "secret"))

    def test_partial_lists_with_missing_or_repeated_cursor_fail(self):
        for paging in ({"next": "url"}, {"next": "url", "cursors": {"after": "same"}}):
            with self.subTest(paging=paging), mock.patch.object(meta, "graph_get", return_value={"data": [], "paging": paging}), self.assertRaises(meta.GraphError):
                m.collection("me/adaccounts", {}, "secret")

    def test_invalid_ids_are_never_graph_paths(self):
        for value in ("../me", "1/stats", "act_", "https://example.com", "x"):
            with self.assertRaises(ValueError): m.object_id(value, account=True)

    def test_missing_and_invalid_numbers_are_not_zero(self):
        for value in (None, "", "NaN", "inf", -1, "bad"): self.assertIsNone(m.number(value))
        self.assertIsNone(m.report_row({})["website_purchases"])
        self.assertEqual(m.number("0"), 0)

    def test_purchase_aliases_not_added_and_currency_preserved(self):
        row = m.report_row({"spend": "80", "inline_link_clicks": "20", "account_currency": "USD", "actions": [{"action_type": "omni_purchase", "value": "12"}, {"action_type": "offsite_conversion.fb_pixel_purchase", "value": "4"}], "action_values": [{"action_type": "offsite_conversion.fb_pixel_purchase", "value": "200"}]})
        self.assertEqual((row["website_purchases"], row["currency"], row["cost_per_purchase"], row["cost_per_link_click"], row["purchase_roas"]), (4, "USD", 20, 4, 2.5))
        self.assertIsNone(m.report_row({"actions": [{"action_type": "omni_purchase", "value": "9"}]})["website_purchases"])

    def test_zero_denominator_has_no_cost_or_roas(self):
        row = m.report_row({"spend": "0", "inline_link_clicks": "0"})
        for key in ("cost_per_link_click", "cost_per_purchase", "purchase_roas"): self.assertIsNone(row[key])

    def test_account_reach_is_direct_total_not_campaign_sum(self):
        with mock.patch.object(m, "collection", side_effect=[[{"reach": "80", "account_currency": "EUR"}], [{"campaign_id": "1", "reach": "60"}, {"campaign_id": "2", "reach": "70"}]]) as read:
            report = m.ads_report("secret", "act_123", "2026-09-01", "2026-09-30")
        self.assertEqual(report["overview"]["reach"], 80)
        self.assertEqual(read.call_args_list[0].args[1]["level"], "account")
        self.assertEqual(read.call_args_list[1].args[1]["level"], "campaign")
        self.assertEqual(read.call_args_list[0].args[1]["action_attribution_windows"], dumps(["7d_click", "1d_view"]))

    def test_empty_report_is_not_fabricated_zeros(self):
        with mock.patch.object(m, "collection", return_value=[]): report = m.ads_report("secret", "123", "a", "b")
        self.assertEqual((report["status"], report["overview"]), ("no_activity", {}))

    def test_campaign_failure_never_labels_partial_report_complete(self):
        with mock.patch.object(m, "collection", side_effect=[[{"spend": "50"}], meta.GraphError("denied")]), self.assertRaises(meta.GraphError):
            m.ads_report("secret", "123", "a", "b")

    def test_ads_failure_does_not_erase_pixel_evidence_or_leak_error(self):
        with mock.patch.object(m, "ads_report", side_effect=meta.GraphError("secret", kind="permission")), mock.patch.object(m, "verify_pixel", return_value={"status": "receiving"}):
            result = m.measurement("secret", {"selected_ad_account_id": "123", "selected_pixel_id": "456"}, "https://store.example", "a", "b")
        self.assertEqual(result["ads"]["status"], "permission")
        self.assertEqual(result["tracking"]["status"], "receiving")
        self.assertNotIn("secret", dumps(result))

    def check_pixel(self, fired=NOW, hosts=None, events=None):
        def stats(token, pixel, aggregation, now):
            value = hosts if aggregation == "host" else events
            if isinstance(value, Exception): raise value
            return value or []
        with mock.patch.object(meta, "graph_get", return_value={"id": "456", "last_fired_time": fired.isoformat() if fired else None}), mock.patch.object(m, "stats", side_effect=stats):
            return m.verify_pixel("secret", "456", "https://www.store.example/products", now=NOW)

    def test_receipt_and_domain_match_do_not_claim_complete_tracking(self):
        result = self.check_pixel(hosts=[{"value": "store.example", "count": 12}], events=[{"event": "Purchase", "count": 2}])
        self.assertEqual(result["status"], "receiving")
        self.assertTrue(result["checks"]["purchase_event"])
        for key in ("server_delivery", "deduplication", "purchase_value_currency"): self.assertIsNone(result["checks"][key])

    def test_wrong_domain_is_not_verified(self):
        self.assertEqual(self.check_pixel(hosts=[{"value": "another.example", "count": 2}])["status"], "wrong_site")

    def test_denied_evidence_remains_unknown(self):
        result = self.check_pixel(hosts=meta.GraphError("secret", kind="permission"), events=meta.GraphError("secret", kind="permission"))
        self.assertEqual(result["status"], "site_unconfirmed")
        self.assertIsNone(result["website_match"])
        self.assertIsNone(result["checks"]["purchase_event"])
        self.assertNotIn("secret", dumps(result))

    def test_zero_purchase_events_not_evidence(self):
        self.assertFalse(self.check_pixel(events=[{"event": "Purchase", "count": 0}])["checks"]["purchase_event"])

    def test_old_missing_or_future_timestamp_not_recent(self):
        for fired in (None, NOW-timedelta(days=3), NOW+timedelta(minutes=2)):
            self.assertEqual(self.check_pixel(fired, hosts=[{"value": "store.example", "count": 2}])["status"], "waiting")

    def test_malformed_host_and_nested_stats(self):
        self.assertEqual(m.host("[broken"), "")
        with mock.patch.object(m, "collection", return_value=[{"aggregation": "event", "data": [{"event": "PageView", "count": 12}]}]):
            self.assertEqual(m.stats("secret", "456", "event", NOW), [{"event": "PageView", "count": 12}])

class CustomerConnectionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.engine = create_engine(f"sqlite:///{Path(self.tmp.name)/'test.db'}", connect_args={"check_same_thread": False}); self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine); self.Session = sessionmaker(self.engine)
        def override_db():
            with self.Session() as db: yield db
        app.dependency_overrides[get_db] = override_db; self.addCleanup(app.dependency_overrides.clear)
        for name, value in {"meta_app_id": "test-app", "meta_app_secret": "test-secret", "web_origin": "http://testserver", "cookie_secure": False, "token_encryption_key": Fernet.generate_key().decode()}.items():
            patch = mock.patch.object(get_settings(), name, value); patch.start(); self.addCleanup(patch.stop)
        with self.Session() as db:
            u = User(email="test@example.invalid", full_name="Test"); db.add(u); db.flush()
            b = Business(user_id=u.id, name="Test", website_url="https://store.example"); db.add(b); db.commit(); self.uid, self.bid = u.id, b.id
        self.client = TestClient(app); self.addCleanup(self.client.close); self.client.cookies.set(COOKIE_NAME, create_access_token(self.uid))

    def start(self, ads=True):
        response = self.client.get("/integrations/meta/start", params={"ads": ads, "popup": True}); self.assertEqual(response.status_code, 200)
        self.attempt = response.json()["attempt"]
        return parse_qs(urlsplit(response.json()["url"]).query)

    def callback(self, query, scopes=None, pages=None, accounts=None, error=""):
        tokens = {"access_token": "customer-secret", "refresh_token": "customer-secret", "expires_at": NOW+timedelta(days=60), "scopes": scopes if scopes is not None else ["pages_show_list", "ads_read"]}
        with mock.patch.object(meta, "exchange_code", return_value=tokens), mock.patch.object(meta, "list_pages", return_value=pages or []), mock.patch.object(m, "list_ad_accounts", return_value=accounts or []):
            return self.client.get("/integrations/meta/callback", params={"state": query["state"][0], "code": "code", "error": error}, follow_redirects=False)

    def seed(self):
        with self.Session() as db:
            db.add(Integration(business_id=self.bid, provider="meta", status="connected", external_id="111", access_token_enc=encrypt_secret("customer-secret"), refresh_token_enc=encrypt_secret("customer-secret"), extra_json=dumps({"pages": [{"page_id": "111", "display_name": "My shop", "instagram_id": "222"}], "page_tokens": encrypt_page_tokens({"111": "page-secret"}), "ad_accounts": [{"id": "act_333", "name": "My ads", "currency": "USD"}], "pixels_by_account": {"act_333": [{"id": "444", "name": "My site"}]}}))); db.commit()

    def other_customer(self):
        with self.Session() as db:
            user = User(email="other@example.invalid", full_name="Other owner")
            db.add(user); db.flush()
            business = Business(user_id=user.id, name="Other shop", website_url="https://other.example")
            db.add(business); db.flush()
            db.add(Integration(business_id=business.id, provider="meta", status="connected", external_id="777",
                               access_token_enc=encrypt_secret("other-secret"), refresh_token_enc=encrypt_secret("other-secret"),
                               extra_json=dumps({"pages": [{"page_id": "777", "display_name": "Other shop", "instagram_id": "778"}],
                                                 "page_tokens": encrypt_page_tokens({"777": "other-page-secret"}),
                                                 "ad_accounts": [{"id": "act_888", "name": "Other ads", "currency": "ILS"}],
                                                 "pixels_by_account": {"act_888": [{"id": "999", "name": "Other site"}]}})))
            db.commit(); uid, bid = user.id, business.id
        client = TestClient(app); self.addCleanup(client.close)
        client.cookies.set(COOKIE_NAME, create_access_token(uid))
        return client, bid

    def test_two_customers_see_only_their_own_granted_assets(self):
        self.seed(); other, _ = self.other_customer()
        for client, page, account, hidden in ((self.client, "111", "act_333", "Other shop"), (other, "777", "act_888", "My shop")):
            with self.subTest(page=page):
                response = client.get("/integrations/meta/assets")
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual([p["page_id"] for p in data["pages"]], [page])
                self.assertEqual([a["id"] for a in data["ad_accounts"]], [account])
                self.assertNotIn(hidden, response.text)
                self.assertNotIn("secret", response.text)

    def test_two_customers_cannot_select_or_read_each_others_pixels(self):
        self.seed(); other, other_bid = self.other_customer()
        with mock.patch.object(m, "list_pixels") as read:
            for client, page, account, pixel in ((self.client, "777", "act_888", "999"), (other, "111", "act_333", "444")):
                self.assertEqual(client.post("/integrations/meta/account", json={"page_id": page}).status_code, 400)
                self.assertEqual(client.post("/integrations/meta/account", json={"ad_account_id": account, "pixel_id": pixel}).status_code, 400)
                self.assertEqual(client.get("/integrations/meta/pixels", params={"ad_account_id": account}).status_code, 400)
            # Even a valid account cannot be paired with the other customer's Pixel.
            self.assertEqual(self.client.post("/integrations/meta/account", json={"ad_account_id": "act_333", "pixel_id": "999"}).status_code, 400)
            self.assertEqual(other.post("/integrations/meta/account", json={"ad_account_id": "act_888", "pixel_id": "444"}).status_code, 400)
        read.assert_not_called()
        offered = [{"id": "998", "name": "Other customer's new Pixel"}]
        with mock.patch.object(m, "list_pixels", return_value=offered) as read:
            self.assertEqual(other.get("/integrations/meta/pixels", params={"ad_account_id": "act_888"}).json()["pixels"], offered)
        read.assert_called_once_with("other-secret", "act_888")
        with self.Session() as db:
            first = loads(db.query(Integration).filter_by(business_id=self.bid).one().extra_json, {})
            second = loads(db.query(Integration).filter_by(business_id=other_bid).one().extra_json, {})
        self.assertEqual(first["pixels_by_account"], {"act_333": [{"id": "444", "name": "My site"}]})
        self.assertEqual(second["pixels_by_account"], {"act_888": offered})

    def test_two_customers_verify_and_disconnect_only_their_own_connection(self):
        self.seed(); other, _ = self.other_customer()
        self.assertEqual(self.client.post("/integrations/meta/account", json={"ad_account_id": "act_333", "pixel_id": "444"}).status_code, 200)
        self.assertEqual(other.post("/integrations/meta/account", json={"ad_account_id": "act_888", "pixel_id": "999"}).status_code, 200)
        with mock.patch.object(m, "verify_pixel", side_effect=[{"status": "receiving"}, {"status": "waiting"}]) as verify:
            self.assertEqual(self.client.post("/integrations/meta/verify").json()["status"], "receiving")
            self.assertIsNone(other.get("/integrations").json()["integrations"][0]["pixel_verification"])
            self.assertEqual(other.post("/integrations/meta/verify").json()["status"], "waiting")
        self.assertEqual(verify.call_args_list, [mock.call("customer-secret", "444", "https://store.example"),
                                                mock.call("other-secret", "999", "https://other.example")])
        self.assertEqual(other.delete("/integrations/meta").status_code, 200)
        self.assertEqual(other.get("/integrations").json()["integrations"], [])
        first = self.client.get("/integrations").json()["integrations"][0]
        self.assertEqual((first["connected"], first["pixel_id"], first["pixel_verification"]["status"]), (True, "444", "receiving"))

    def test_minimal_read_scopes_and_optional_ads_browser_nonce(self):
        scopes = self.start(False)["scope"][0].split(",")
        for unnecessary in ("ads_read", "business_management", "pages_read_user_content", "ads_management", "instagram_content_publish"): self.assertNotIn(unnecessary, scopes)
        self.assertIn("isramarket_meta_flow", self.client.cookies)
        self.assertIn("ads_read", self.start()["scope"][0])

    def test_start_cannot_make_existing_grant_look_like_completed_consent(self):
        self.seed(); self.start()
        offers = self.client.get("/integrations/meta/assets").json()
        self.assertNotEqual(offers["connection_attempt"], self.attempt)

    def test_missing_nonce_rejects_before_token_exchange(self):
        query = self.start(); self.client.cookies.delete("isramarket_meta_flow")
        with mock.patch.object(meta, "exchange_code") as exchange:
            response = self.client.get("/integrations/meta/callback", params={"state": query["state"][0], "code": "code"}, follow_redirects=False)
        self.assertIn("meta_result=expired", response.headers["location"]); exchange.assert_not_called()
        with self.Session() as db: self.assertEqual(db.query(Integration).count(), 0)

    def test_different_logged_in_owner_cannot_bind_grant(self):
        query = self.start()
        with self.Session() as db:
            other = User(email="other@example.invalid", full_name="Other"); db.add(other); db.commit(); oid = other.id
        self.client.cookies.set(COOKIE_NAME, create_access_token(oid))
        self.assertIn("meta_result=expired", self.callback(query).headers["location"])

    def test_ads_only_grant_can_connect_without_page_and_tokens_not_public(self):
        response = self.callback(self.start(), scopes=["ads_read"], accounts=[{"id": "act_333", "name": "My ads", "currency": "USD"}])
        self.assertIn("/integrations/meta/complete?meta_result=success", response.headers["location"])
        offers = self.client.get("/integrations/meta/assets").json(); self.assertEqual(offers["connection_attempt"], self.attempt); self.assertEqual(offers["pages"], []); self.assertNotIn("customer-secret", dumps(offers))
        saved = self.client.post("/integrations/meta/account", json={"ad_account_id": "act_333"})
        self.assertEqual(saved.status_code, 200, saved.text); self.assertTrue(self.client.get("/integrations").json()["integrations"][0]["connected"])

    def test_replay_and_cancel(self):
        query = self.start(); self.callback(query)
        self.assertIn("meta_result=expired", self.callback(query).headers["location"])
        self.client.delete("/integrations/meta"); self.seed()
        self.assertIn("meta_result=cancelled", self.callback(self.start(), error="access_denied").headers["location"])
        with self.Session() as db: self.assertEqual(db.query(Integration).one().status, "connected")

    def test_failed_reconnect_preserves_old_grant_and_hides_provider_secrets(self):
        self.seed(); query = self.start()
        with mock.patch.object(meta, "exchange_code", side_effect=RuntimeError("customer-secret & api_secret=private")):
            response = self.client.get("/integrations/meta/callback", params={"state": query["state"][0], "code": "code"}, follow_redirects=False)
        self.assertTrue(response.headers["location"].endswith("meta_result=failed"))
        with self.Session() as db: self.assertEqual(decrypt_secret(db.query(Integration).one().access_token_enc), "customer-secret")

    def test_asset_selection_and_pixel_read_bound_to_granted_lists(self):
        self.seed()
        for body in ({"page_id": "999"}, {"ad_account_id": "act_999"}, {"page_id": "111", "pixel_id": "999"}):
            self.assertEqual(self.client.post("/integrations/meta/account", json=body).status_code, 400)
        with mock.patch.object(m, "list_pixels") as read: self.assertEqual(self.client.get("/integrations/meta/pixels", params={"ad_account_id": "act_999"}).status_code, 400)
        read.assert_not_called()

    def test_ig_association_and_name_derived_from_meta(self):
        self.seed(); response = self.client.post("/integrations/meta/account", json={"page_id": "111", "instagram_id": "attacker", "display_name": "wrong", "ad_account_id": "act_333", "pixel_id": "444"})
        self.assertEqual(response.status_code, 200, response.text); self.assertEqual(self.client.get("/integrations").json()["integrations"][0]["display_name"], "My shop")
        with self.Session() as db:
            extra = loads(db.query(Integration).one().extra_json, {}); self.assertEqual(extra["selected_instagram_id"], "222"); self.assertEqual(extra["selected_pixel_id"], "444")

    def test_verification_uses_business_website_and_is_stored(self):
        self.seed(); self.client.post("/integrations/meta/account", json={"ad_account_id": "act_333", "pixel_id": "444"})
        with mock.patch.object(m, "verify_pixel", return_value={"status": "receiving"}) as verify: response = self.client.post("/integrations/meta/verify")
        self.assertEqual(response.status_code, 200); verify.assert_called_once_with("customer-secret", "444", "https://store.example")
        self.assertEqual(self.client.get("/integrations").json()["integrations"][0]["pixel_verification"]["status"], "receiving")

    def test_sync_passes_measurement_to_analysis_and_persists_snapshot(self):
        self.seed(); self.client.post("/integrations/meta/account", json={"ad_account_id": "act_333", "pixel_id": "444"})
        evidence = {"ads": {"status": "available", "overview": {"spend": 20, "currency": "USD"}}, "tracking": {"status": "site_unconfirmed"}}
        diagnosis = {"headline": "Test", "top_content": [], "bottom_content": [], "funnel_issues": [], "metric_highlights": []}
        with mock.patch.object(m, "measurement", return_value=evidence), mock.patch.object(performance, "diagnose", return_value=diagnosis) as analyse: response = self.client.post("/performance/sync")
        evidence["posts"] = []
        self.assertEqual(response.status_code, 200, response.text); self.assertEqual(response.json()["meta"], evidence); self.assertEqual(analyse.call_args.args[2], evidence)
        with self.Session() as db: self.assertEqual(loads(db.query(PerformanceSnapshot).one().meta_json, {}), evidence)
