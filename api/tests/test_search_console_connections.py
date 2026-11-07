"""Real application lifecycle with isolated SQLite and mocked Google transport only."""
import _test_env  # noqa: F401

import unittest
from datetime import datetime, timedelta
from unittest import mock
from urllib.parse import parse_qs, urlsplit

import httpx
from fastapi.testclient import TestClient
from google.auth.exceptions import RefreshError
from jose import jwt

import test_ga4_readiness as fixture
from app.config import get_settings
from app.deps import get_current_user
from app.main import app
from app.models import Integration
from app.routers import promotion
from app.routers.search_console_connections import FLOW_COOKIE
from app.security import ALGORITHM, COOKIE_NAME, create_access_token, decrypt_secret, encrypt_secret
from app.services import ga4, google_login, keywords, search_console as source
from app.services.jsonutil import dumps, loads

SITE = "https://studio.example/"
ROWS = [{"keys": ["תכנון דירה קטנה"], "clicks": 12, "impressions": 360, "ctr": 0.0333, "position": 8}]


class SearchConsoleTest(unittest.TestCase):
    cleanup = fixture.SourceReadinessTest.cleanup

    def setUp(self):
        fixture.SourceReadinessTest.setUp(self)
        app.dependency_overrides.pop(get_current_user)
        self.client.cookies.set(COOKIE_NAME, create_access_token(self.owner.id, self.owner.session_epoch))
        for name, value in {"google_client_id": "qa-google", "google_client_secret": "qa-secret",
                            "cookie_secure": False, "web_origin": "http://testserver"}.items():
            patch = mock.patch.object(get_settings(), name, value)
            patch.start(); self.addCleanup(patch.stop)
        self.business.website_url = SITE
        self.db.commit()
        promotion.cache_clear()
        self.addCleanup(promotion.cache_clear)
        self.grant = {"access_token": "qa-search-access", "refresh_token": "qa-search-refresh",
                      "scopes": [keywords.SEARCH_CONSOLE_SCOPE], "expires_at": datetime.utcnow() + timedelta(hours=1), "id_token": ""}
        self.sites = [{"site_url": SITE}]
        self.token = mock.patch.object(ga4, "fresh_access_token", return_value="qa-search-access")
        self.token.start(); self.addCleanup(self.token.stop)
        self.listing = mock.patch.object(source, "list_sites", return_value=self.sites)
        self.listed = self.listing.start(); self.addCleanup(self.listing.stop)
        self.reading = mock.patch.object(source, "query", return_value={"site_url": SITE, "period": {"start": "2026-10-01", "end": "2026-10-28", "days": 28},
                                                                      "queries": keywords._parse_search_rows({"rows": ROWS}), "quick_wins": [], "limited": False})
        self.read_query = self.reading.start(); self.addCleanup(self.reading.stop)

    def item(self):
        return source.item_for(self.db, self.business.id)

    def seed(self, *, business=None, status="connected", site=SITE, **extra):
        item = Integration(business_id=(business or self.business).id, provider=source.PROVIDER, status=status,
                           external_id=site, display_name=site, access_token_enc=encrypt_secret("old-search-access"),
                           refresh_token_enc=encrypt_secret("old-search-refresh"),
                           token_expires_at=datetime.utcnow() + timedelta(hours=1), extra_json=dumps({"scopes": [keywords.SEARCH_CONSOLE_SCOPE], **extra}))
        self.db.add(item); self.db.commit()
        return item

    def start(self, lang="he"):
        response = self.client.get("/integrations/search-console/start", params={"lang": lang})
        self.assertEqual(response.status_code, 200, response.text)
        return {k: v[0] for k, v in parse_qs(urlsplit(response.json()["url"]).query).items()}

    def callback(self, params, **extra):
        with mock.patch.object(ga4, "exchange_code", return_value=self.grant) as exchange:
            response = self.client.get("/integrations/ga4/callback", params={"state": params["state"], "code": "qa-code", **extra}, follow_redirects=False)
        return response, exchange

    def read(self):
        return self.client.post("/integrations/search-console/read")

    def test_minimal_consent_reuses_registered_callback_and_offers_account_choice(self):
        params = self.start("ru")
        self.assertEqual(set(params["scope"].split()), set(source.SCOPES))
        self.assertNotIn(ga4.GA4_SCOPES[0], params["scope"])
        self.assertEqual(params["redirect_uri"], ga4.redirect_uri())
        self.assertEqual(params["prompt"], "select_account consent")
        self.assertNotIn("login_hint", params)

    def test_permission_is_not_selection_and_does_not_need_any_analytics_property(self):
        response, exchange = self.callback(self.start())
        self.assertIn("search_result=connected", response.headers["location"])
        exchange.assert_called_once_with("qa-code", required_scope=keywords.SEARCH_CONSOLE_SCOPE)
        self.assertEqual(self.item().status, "select_site")
        self.assertEqual(source.public_state(self.item(), SITE)["status"], "choose_site")
        self.read_query.assert_not_called()
        response = self.client.post("/integrations/search-console/site", json={"site_url": SITE})
        item = response.json()["integration"]
        self.assertEqual(item["source_readiness"]["status"], "ready")
        self.assertEqual(item["search_data"]["queries"][0]["clicks"], 12)
        self.assertTrue(item["connected"])
        self.assertFalse(self.db.query(Integration).filter_by(provider="ga4").count())
        self.assertNotIn("qa-search-access", str(item))
        self.assertNotIn("qa-search-refresh", str(item))

    def test_search_only_data_reaches_keyword_decisions_without_analytics(self):
        self.seed()
        with mock.patch.object(keywords, "autocomplete", return_value=[]):
            response = self.client.get("/promotion/keywords?refresh=true")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["search_console_connected"])
        self.assertEqual(response.json()["keywords"][0]["clicks"], 12)

    def test_cached_search_queries_never_follow_a_changed_business_website(self):
        self.seed()
        with mock.patch.object(keywords, "autocomplete", return_value=[]):
            first = self.client.get("/promotion/keywords").json()
            self.business.website_url = "https://different.example/"; self.db.commit()
            second = self.client.get("/promotion/keywords").json()
        self.assertTrue(first["search_console_connected"])
        self.assertFalse(second["search_console_connected"])
        self.assertFalse(second["cached"])
        self.assertNotIn("תכנון דירה קטנה", str(second["keywords"]))

    def test_disconnect_during_keyword_build_cannot_cache_or_return_revoked_searches(self):
        item = self.seed()
        def disconnect(*args, **kwargs):
            source.disconnect(self.db, item)
            return []
        with mock.patch.object(keywords, "autocomplete", side_effect=disconnect):
            response = self.client.get("/promotion/keywords?refresh=true")
        self.assertEqual(response.status_code, 409)
        self.assertNotIn(self.business.id, promotion._KEYWORD_CACHE)

    def test_unselected_analytics_legacy_grant_migrates_without_faking_a_read(self):
        old = fixture.SourceReadinessTest.connect(self, "", scopes=[keywords.SEARCH_CONSOLE_SCOPE])
        original = old.access_token_enc
        source.ensure_legacy(self.db, self.business)
        self.assertEqual(self.item().access_token_enc, original)
        self.assertEqual(source.public_state(self.item(), SITE)["status"], "choose_site")
        self.assertFalse(loads(self.item().extra_json).get("data"))
        self.assertEqual(old.status, "select_property")

    def test_disconnect_search_does_not_remove_analytics_or_reimport_legacy_permission(self):
        old = fixture.SourceReadinessTest.connect(self, scopes=[keywords.SEARCH_CONSOLE_SCOPE])
        access = old.access_token_enc
        source.ensure_legacy(self.db, self.business)
        self.assertEqual(self.client.delete("/integrations/search_console").status_code, 200)
        self.client.get("/integrations")
        self.assertEqual(self.item().status, "disconnected")
        self.assertEqual(self.item().access_token_enc, "")
        self.assertEqual(self.db.get(Integration, old.id).access_token_enc, access)
        self.assertEqual(self.read().status_code, 400)

    def test_disconnect_analytics_preserves_search_grant_and_drops_cached_keywords(self):
        fixture.SourceReadinessTest.connect(self, scopes=[keywords.SEARCH_CONSOLE_SCOPE])
        promotion._KEYWORD_CACHE[self.business.id] = (99999999999, {"keywords": ["old"]})
        self.client.delete("/integrations/ga4")
        self.assertIsNotNone(self.item())
        self.assertNotIn(self.business.id, promotion._KEYWORD_CACHE)
        response = self.client.post("/integrations/search-console/site", json={"site_url": SITE})
        self.assertEqual(response.json()["integration"]["source_readiness"]["status"], "ready")

    def test_partial_consent_preserves_both_working_sources(self):
        item = self.seed()
        self.read()
        old_access = item.access_token_enc
        analytics = fixture.SourceReadinessTest.connect(self, scopes=[ga4.GA4_SCOPES[0]])
        old_ga = analytics.access_token_enc
        params = self.start()
        self.grant["scopes"] = [ga4.GA4_SCOPES[0]]
        response, _ = self.callback(params)
        self.assertIn("search_result=permission", response.headers["location"])
        self.assertEqual(self.item().access_token_enc, old_access)
        self.assertEqual(self.db.get(Integration, analytics.id).access_token_enc, old_ga)
        self.assertIsNotNone(source.public_data(self.item(), SITE))

    def test_cancel_and_failed_exchange_preserve_saved_data(self):
        self.seed(); self.read()
        before = source.public_data(self.item(), SITE)
        response, exchange = self.callback(self.start(), error="access_denied")
        self.assertIn("search_result=cancelled", response.headers["location"])
        exchange.assert_not_called()
        params = self.start()
        with mock.patch.object(ga4, "exchange_code", side_effect=RuntimeError("private-provider-error")):
            response = self.client.get("/integrations/ga4/callback", params={"state": params["state"], "code": "qa"}, follow_redirects=False)
        self.assertNotIn("private-provider-error", response.headers["location"])
        self.assertEqual(source.public_data(self.item(), SITE), before)

    def test_missing_cookie_and_wrong_owner_cannot_exchange(self):
        params = self.start()
        self.client.cookies.delete(FLOW_COOKIE)
        response, exchange = self.callback(params)
        self.assertIn("expired", response.headers["location"]); exchange.assert_not_called()
        params = self.start()
        self.client.cookies.set(COOKIE_NAME, create_access_token(self.other.id, self.other.session_epoch))
        _, exchange = self.callback(params)
        exchange.assert_not_called()

    def test_replay_and_out_of_order_tabs_cannot_replace_newer_flow(self):
        older, newer = self.start(), self.start()
        nonce = self.client.cookies.get(FLOW_COOKIE)
        _, exchange = self.callback(older); exchange.assert_not_called()
        self.assertEqual(self.client.cookies.get(FLOW_COOKIE), nonce)
        self.callback(newer)
        self.client.cookies.set(FLOW_COOKIE, nonce)
        _, exchange = self.callback(newer); exchange.assert_not_called()

    def test_signed_out_session_generation_cannot_finish_old_flow(self):
        params = self.start()
        self.owner.session_epoch += 1; self.db.commit()
        self.client.cookies.set(COOKIE_NAME, create_access_token(self.owner.id, self.owner.session_epoch))
        _, exchange = self.callback(params)
        exchange.assert_not_called()

    def test_expired_and_wrong_provider_states_never_exchange(self):
        params = self.start()
        claims = jwt.decode(params["state"], get_settings().jwt_secret, algorithms=[ALGORITHM])
        for change in ({"exp": 1}, {"p": "meta"}):
            bad = jwt.encode({**claims, **change}, get_settings().jwt_secret, algorithm=ALGORITHM)
            _, exchange = self.callback({"state": bad})
            exchange.assert_not_called()

    def test_return_preserves_selected_language_and_source(self):
        for lang in ("he", "en", "ar", "ru"):
            response, _ = self.callback(self.start(lang), error="access_denied")
            self.assertIn("lang=" + lang, response.headers["location"])
            self.assertTrue(response.headers["location"].endswith("#search_console"))

    def test_foreign_tenant_read_select_and_disconnect_do_not_touch_its_data(self):
        foreign = self.seed(business=self.other_business)
        self.assertEqual(self.read().status_code, 400)
        self.assertEqual(self.client.post("/integrations/search-console/site", json={"site_url": SITE}).status_code, 400)
        self.client.delete("/integrations/search_console")
        self.assertTrue(self.db.get(Integration, foreign.id).access_token_enc)
        self.assertEqual(self.client.get("/integrations").json()["integrations"], [])

    def test_unrelated_site_not_selected_even_if_sent_by_client(self):
        self.seed(status="select_site", site="")
        for site in ("https://other.example/", "https://studio.example.evil/", "sc-domain:other.example"):
            response = self.client.post("/integrations/search-console/site", json={"site_url": site})
            self.assertEqual(response.status_code, 400)
        self.read_query.assert_not_called()

    def test_matching_site_must_still_be_currently_authorized(self):
        self.seed(status="select_site", site="")
        self.listed.return_value = []
        response = self.client.post("/integrations/search-console/site", json={"site_url": SITE})
        self.assertEqual(response.json()["integration"]["source_readiness"]["status"], "no_sites")
        self.read_query.assert_not_called()

    def test_empty_success_is_distinct_from_failed_read(self):
        self.seed()
        self.read_query.return_value = {"site_url": SITE, "period": {"start": "2026-10-01", "end": "2026-10-28"}, "queries": [], "quick_wins": [], "limited": False}
        item = self.read().json()["integration"]
        self.assertEqual(item["source_readiness"]["status"], "empty")
        self.assertTrue(item["source_readiness"]["last_success_at"])
        self.assertEqual(item["search_data"]["queries"], [])

    def test_failed_or_expired_read_keeps_original_data_date_without_changing_analytics(self):
        self.seed(); self.read()
        before = source.public_data(self.item(), SITE)
        for exc, status in ((source.AccessError("unavailable"), "unavailable"), (RefreshError(), "reconnect")):
            with mock.patch.object(ga4, "fresh_access_token", side_effect=exc):
                response = self.read()
            item = response.json()["integration"]
            self.assertEqual(item["source_readiness"]["status"], status)
            self.assertEqual(item["search_data"], before)

    def test_disconnect_during_fetch_cannot_restore_grant_or_snapshot(self):
        item = self.seed()
        data = self.read_query.return_value
        def concurrent_disconnect(*args):
            source.disconnect(self.db, item)
            return data
        self.read_query.side_effect = concurrent_disconnect
        response = self.read()
        self.assertEqual(response.json()["integration"]["status"], "disconnected")
        self.assertIsNone(response.json()["integration"]["search_data"])

    def test_newer_grant_during_fetch_cannot_receive_old_read(self):
        item = self.seed()
        data = self.read_query.return_value
        def newer_grant(*args):
            item.access_token_enc = encrypt_secret("new-account")
            item.external_id = ""; item.status = "select_site"
            item.extra_json = dumps({"scopes": source.SCOPES, "newer": True})
            self.db.commit()
            return data
        self.read_query.side_effect = newer_grant
        response = self.read()
        self.assertEqual(response.json()["integration"]["status"], "select_site")
        self.assertIsNone(response.json()["integration"]["search_data"])
        self.assertEqual(decrypt_secret(self.item().access_token_enc), "new-account")

    def test_website_change_during_fetch_cannot_save_previous_site_data(self):
        self.seed()
        data = self.read_query.return_value
        def website_change(*args):
            self.business.website_url = "https://different.example/"; self.db.commit()
            return data
        self.read_query.side_effect = website_change
        response = self.read()
        self.assertIsNone(response.json()["integration"]["search_data"])
        self.assertFalse(loads(self.item().extra_json).get("data"))

    def test_disconnect_during_callback_exchange_cannot_recreate_connection(self):
        params = self.start()
        def disconnect(*args, **kwargs):
            source.disconnect(self.db, self.item())
            return self.grant
        with mock.patch.object(ga4, "exchange_code", side_effect=disconnect):
            response = self.client.get("/integrations/ga4/callback", params={"state": params["state"], "code": "qa"}, follow_redirects=False)
        self.assertIn("expired", response.headers["location"])
        self.assertEqual(self.item().status, "disconnected")

    def test_stored_domain_property_data_is_bound_to_original_business_url(self):
        self.seed(site="sc-domain:studio.example")
        self.listed.return_value = [{"site_url": "sc-domain:studio.example"}]
        self.read_query.return_value = {**self.read_query.return_value, "site_url": "sc-domain:studio.example"}
        self.read()
        self.assertIsNotNone(source.public_data(self.item(), SITE))
        self.business.website_url = "https://shop.studio.example/"; self.db.commit()
        self.assertIsNone(source.public_data(self.item(), self.business.website_url))


class SearchConsoleContractTest(unittest.TestCase):
    def test_strict_property_matching(self):
        for prop in (SITE, "sc-domain:studio.example", "https://studio.example"):
            self.assertTrue(source.matching_site(prop, SITE))
        for prop in ("https://other.studio.example/", "https://studio.example/private/", "http://studio.example/", "sc-domain:evil.example"):
            self.assertFalse(source.matching_site(prop, SITE))
        self.assertTrue(source.matching_site("sc-domain:studio.example", "https://shop.studio.example/path"))

    def test_site_listing_excludes_unverified_unrelated_and_malformed_entries(self):
        with mock.patch.object(httpx, "get", return_value=httpx.Response(200, json={"siteEntry": [
            {"siteUrl": SITE, "permissionLevel": "siteFullUser"},
            {"siteUrl": "sc-domain:studio.example", "permissionLevel": "siteUnverifiedUser"},
            {"siteUrl": "https://unrelated.example/", "permissionLevel": "siteOwner"}, None,
        ]})):
            self.assertEqual(source.list_sites("qa", SITE), [{"site_url": SITE}])

    def test_permission_expiry_service_disabled_and_quota_have_distinct_recovery(self):
        for code, reason, status in ((401, "", "reconnect"), (403, "insufficientPermissions", "permission"),
                                     (403, "SERVICE_DISABLED", "unavailable"), (429, "", "unavailable"), (503, "", "unavailable")):
            with self.subTest(code=code, reason=reason), mock.patch.object(httpx, "get", return_value=httpx.Response(code, text=reason)):
                with self.assertRaises(source.AccessError) as caught:
                    source.list_sites("qa", SITE)
                self.assertEqual(caught.exception.status, status)

    def test_query_has_an_honest_28_day_final_window_and_empty_is_success(self):
        with mock.patch.object(httpx, "post", return_value=httpx.Response(200, json={})) as post:
            data = source.query("qa", SITE)
        self.assertEqual(data["queries"], [])
        self.assertEqual((datetime.fromisoformat(data["period"]["end"]) - datetime.fromisoformat(data["period"]["start"])).days, 27)
        self.assertEqual(post.call_args.kwargs["json"]["dataState"], "final")
        self.assertIn("https%3A%2F%2Fstudio.example%2F", post.call_args.args[0])

    def test_malformed_rows_are_not_claimed_as_empty_success(self):
        for data in ({"rows": "not rows"}, {"rows": [None]}, {"rows": [{"keys": []}]},
                     {"rows": [{"keys": ["unknown metrics"]}]}):
            with mock.patch.object(httpx, "post", return_value=httpx.Response(200, json=data)):
                with self.assertRaises(source.AccessError):
                    source.query("qa", SITE)

    def test_malformed_json_is_a_retryable_failure_not_a_request_for_new_access(self):
        with mock.patch.object(httpx, "get", return_value=httpx.Response(200, text="broken json")):
            with self.assertRaises(source.AccessError) as caught:
                source.list_sites("qa", SITE)
        self.assertEqual(caught.exception.status, "unavailable")

    def test_broad_domain_grant_is_filtered_to_the_business_pages(self):
        with mock.patch.object(httpx, "post", return_value=httpx.Response(200, json={})) as post:
            source.query("qa", "sc-domain:example.com", "https://shop.example.com/brand-a/")
        filters = post.call_args.kwargs["json"]["dimensionFilterGroups"][0]["filters"]
        self.assertEqual(filters[0]["dimension"], "page")
        self.assertEqual(filters[0]["operator"], "includingRegex")
        import re
        pattern = filters[0]["expression"]
        self.assertTrue(re.match(pattern, "https://shop.example.com/brand-a/product"))
        self.assertFalse(re.match(pattern, "https://other.example.com/brand-a/product"))
        self.assertFalse(re.match(pattern, "https://shop.example.com/brand-ab/product"))


class AnalyticsRecoveryTest(unittest.TestCase):
    setUp = SearchConsoleTest.setUp
    cleanup = SearchConsoleTest.cleanup

    def start(self, lang="he"):
        response = self.client.get("/integrations/ga4/start", params={"lang": lang})
        self.assertEqual(response.status_code, 200, response.text)
        return parse_qs(urlsplit(response.json()["url"]).query)["state"][0]

    def callback(self, state, **extra):
        with mock.patch.object(ga4, "exchange_code", return_value={**self.grant, "scopes": [ga4.GA4_SCOPES[0]]}) as exchange, \
                mock.patch.object(ga4, "list_properties", return_value=[]):
            response = self.client.get("/integrations/ga4/callback", params={"state": state, "code": "qa", **extra}, follow_redirects=False)
        return response, exchange

    def test_analytics_alone_requests_no_search_permission(self):
        response = self.client.get("/integrations/ga4/start")
        scope = parse_qs(urlsplit(response.json()["url"]).query)["scope"][0]
        self.assertNotIn(keywords.SEARCH_CONSOLE_SCOPE, scope)

    def test_analytics_consent_return_preserves_language(self):
        for lang in ("he", "en", "ar", "ru"):
            response, _ = self.callback(self.start(lang), error="access_denied")
            if lang != "he":
                self.assertIn("lang=" + lang, response.headers["location"])
            self.assertTrue(response.headers["location"].endswith("#ga4"))

    def test_sign_out_during_identity_verification_blocks_the_final_grant_write(self):
        item = fixture.SourceReadinessTest.connect(self)
        original = item.access_token_enc
        state = self.start()
        def sign_out(*args):
            self.owner.session_epoch += 1; self.db.commit()
            return None
        with mock.patch.object(google_login, "account_of", side_effect=sign_out):
            response, _ = self.callback(state)
        self.assertIn("error=", response.headers["location"])
        self.assertEqual(self.db.get(Integration, item.id).access_token_enc, original)

    def test_cancel_preserves_analytics_and_independent_search(self):
        item = fixture.SourceReadinessTest.connect(self, scopes=[keywords.SEARCH_CONSOLE_SCOPE])
        before = item.access_token_enc
        response, exchange = self.callback(self.start(), error="access_denied")
        exchange.assert_not_called()
        self.assertIn("error=", response.headers["location"])
        self.assertEqual(self.db.get(Integration, item.id).access_token_enc, before)
        self.assertIsNotNone(source.item_for(self.db, self.business.id))

    def test_stale_tab_replay_wrong_browser_and_other_owner_cannot_exchange(self):
        old, current = self.start(), self.start()
        _, exchange = self.callback(old); exchange.assert_not_called()
        nonce = self.client.cookies.get("isramarket_ga4_flow")
        self.callback(current)
        self.client.cookies.set("isramarket_ga4_flow", nonce)
        _, exchange = self.callback(current); exchange.assert_not_called()
        state = self.start(); self.client.cookies.delete("isramarket_ga4_flow")
        _, exchange = self.callback(state); exchange.assert_not_called()
        state = self.start(); self.client.cookies.set(COOKIE_NAME, create_access_token(self.other.id, self.other.session_epoch))
        _, exchange = self.callback(state); exchange.assert_not_called()

    def test_disconnect_during_exchange_cannot_restore_analytics(self):
        state = self.start()
        def remove(*args, **kwargs):
            item = self.db.query(Integration).filter_by(business_id=self.business.id, provider="ga4").one()
            self.db.delete(item); self.db.commit()
            return {**self.grant, "scopes": [ga4.GA4_SCOPES[0]]}
        with mock.patch.object(ga4, "exchange_code", side_effect=remove), mock.patch.object(ga4, "list_properties", return_value=[]):
            response = self.client.get("/integrations/ga4/callback", params={"state": state, "code": "qa"}, follow_redirects=False)
        self.assertIn("error=", response.headers["location"])
        self.assertIsNone(self.db.query(Integration).filter_by(provider="ga4").first())

    def test_disconnect_during_read_cannot_restore_data_or_crash(self):
        item = fixture.SourceReadinessTest.connect(self)
        def remove(*args, **kwargs):
            self.db.delete(item); self.db.commit()
            return fixture.report()
        with mock.patch.object(ga4, "fetch_report", side_effect=remove):
            response = self.client.post("/integrations/ga4/read")
        self.assertEqual(response.status_code, 409)

    def test_newer_grant_for_same_property_cannot_receive_old_read(self):
        item = fixture.SourceReadinessTest.connect(self)
        def replace(*args, **kwargs):
            item.access_token_enc = encrypt_secret("new-google-account")
            item.extra_json = dumps({"newer_grant": True})
            self.db.commit()
            return fixture.report()
        with mock.patch.object(ga4, "fetch_report", side_effect=replace):
            response = self.client.post("/integrations/ga4/read")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["integration"]["source_readiness"]["status"], "unchecked")
        self.assertTrue(loads(self.db.get(Integration, item.id).extra_json)["newer_grant"])

    def test_newer_grant_during_property_discovery_cannot_be_overwritten(self):
        item = fixture.SourceReadinessTest.connect(self)
        def replace(*args):
            item.extra_json = dumps({"newer_grant": True}); self.db.commit()
            return [{"property_id": "123", "display_name": "Site", "account": "Owner"}]
        with mock.patch.object(ga4, "list_properties", side_effect=replace):
            response = self.client.post("/integrations/ga4/property", json={"property_id": "123"})
        self.assertEqual(response.status_code, 409)
        self.assertTrue(loads(self.db.get(Integration, item.id).extra_json)["newer_grant"])


if __name__ == "__main__":
    unittest.main()
