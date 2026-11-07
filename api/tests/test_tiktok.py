"""Offline TikTok contract tests. No live grants, reads or model calls."""
import _test_env  # noqa: F401
import unittest
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse
from unittest import mock

import httpx
from app.config import get_settings
from app.services import tiktok

NOW = datetime(2026, 10, 12, 10)


def tokens(**overrides):
    return {'access_token': 'qa-access', 'refresh_token': 'qa-refresh', 'open_id': 'qa-person',
            'expires_in': 86400, 'refresh_expires_in': 31536000,
            'scope': 'user.info.basic,video.list', **overrides}


def video(id='123', **changes):
    return {'id': id, 'create_time': 1791712800, 'title': 'A small-space tip',
            'share_url': f'https://www.tiktok.com/@qa/video/{id}', 'view_count': 300,
            'like_count': 0, 'comment_count': 4, 'share_count': 2, 'duration': 8, **changes}


class ContractTest(unittest.TestCase):
    def setUp(self):
        s = get_settings()
        for key, val in {'tiktok_client_key':'qa-key', 'tiktok_client_secret':'qa-secret',
                         'tiktok_access_mode':'sandbox', 'tiktok_sandbox_emails':'Owner@Example.com'}.items():
            patch = mock.patch.object(s, key, val); patch.start(); self.addCleanup(patch.stop)

    def test_public_and_sandbox_read_gate(self):
        self.assertTrue(tiktok.configured_for('owner@example.com'))
        self.assertFalse(tiktok.configured_for('someone@example.com'))
        with mock.patch.object(get_settings(), 'tiktok_access_mode','off'):
            self.assertFalse(tiktok.configured_for('owner@example.com'))
        with mock.patch.object(get_settings(), 'tiktok_client_secret',''):
            self.assertFalse(tiktok.configured_for('owner@example.com'))

    def test_minimal_scopes_fixed_origin_and_static_callback(self):
        url = urlparse(tiktok.authorization_url('qa-state'))
        self.assertEqual(url.hostname, 'www.tiktok.com')
        args = parse_qs(url.query)
        self.assertEqual(args['scope'], ['user.info.basic,video.list'])
        self.assertEqual(args['state'], ['qa-state'])
        self.assertNotIn('qa-secret', url.query)
        self.assertTrue(args['redirect_uri'][0].endswith('/integrations/tiktok/callback'))

    def test_exchange_form_and_rotating_refresh(self):
        with mock.patch.object(tiktok, '_request', return_value=tokens()) as request:
            data = tiktok.exchange_code('qa-code')
        self.assertEqual(data['open_id'],'qa-person')
        self.assertEqual(request.call_args.kwargs['form']['client_secret'],'qa-secret')
        self.assertEqual(request.call_args.kwargs['form']['grant_type'],'authorization_code')
        with mock.patch.object(tiktok, '_request', return_value=tokens(refresh_token='qa-rotated')):
            self.assertEqual(tiktok.refresh_token('qa-old')['refresh_token'], 'qa-rotated')

    def test_missing_scope_and_malformed_token_are_not_usable(self):
        for value, expected in [(tokens(scope='user.info.basic'), 'permission'), (tokens(expires_in=0),'unavailable'), ({},'unavailable')]:
            with mock.patch.object(tiktok, '_request', return_value=value):
                with self.assertRaises(tiktok.TikTokError) as error: tiktok.exchange_code('qa-code')
                self.assertEqual(error.exception.status,expected)

    def test_identity_match_is_required(self):
        for user in [{'open_id':'another','display_name':'QA'}, None, {'open_id':'qa-person'}]:
            with mock.patch.object(tiktok, '_request', return_value={'data':{'user':user}}):
                with self.assertRaises(tiktok.TikTokError): tiktok.profile('qa-token','qa-person')

    def test_error_bodies_and_redirects_never_leak_or_follow(self):
        for status, code, expected in [(401,'access_token_invalid','reconnect'),(403,'scope_not_authorized','permission'),(429,'rate_limit_exceeded','unavailable'),(302,'','unavailable')]:
            response = httpx.Response(status, json={'error':{'code':code,'message':'qa-sensitive-provider-body'}})
            with mock.patch.object(httpx.Client,'request',return_value=response):
                with self.assertRaises(tiktok.TikTokError) as error: tiktok.profile('qa-token','qa-person')
                self.assertEqual(str(error.exception),expected)
                self.assertNotIn('qa-sensitive',str(error.exception))

    def test_empty_revocation_is_success(self):
        with mock.patch.object(httpx.Client,'request',return_value=httpx.Response(200,content=b'')) as request:
            tiktok.revoke('qa-token')
        self.assertEqual(request.call_args.kwargs['data']['token'],'qa-token')

    def test_network_error_is_sanitized_and_not_retried(self):
        with mock.patch.object(httpx.Client,'request',side_effect=httpx.ConnectError('qa-private')) as request:
            with self.assertRaises(tiktok.TikTokError) as error: tiktok.profile('qa-token','qa-person')
        request.assert_called_once(); self.assertEqual(str(error.exception),'unavailable')

    def test_counts_zero_unknown_and_untrusted_link(self):
        row = tiktok._video(video(like_count=0, comment_count=None, share_count=True, share_url='https://attacker.example/123'))
        self.assertEqual(row['like_count'],0); self.assertIsNone(row['comment_count'])
        self.assertIsNone(row['share_count']); self.assertEqual(row['url'],'')
        self.assertIsNone(tiktok._video(video(id='bad-id')))

    def test_pagination_deduplicates_and_has_a_cap(self):
        values = [{'data':{'videos':[video()], 'has_more':True,'cursor':1}},
                  {'data':{'videos':[video(),video('456')], 'has_more':True,'cursor':2}},
                  {'data':{'videos':[video('789')], 'has_more':True,'cursor':3}}]
        with mock.patch.object(tiktok,'_request',side_effect=values) as request:
            snap = tiktok.videos('qa-token',now=NOW)
        self.assertEqual(request.call_count,3); self.assertEqual(len(snap['videos']),3)
        self.assertFalse(snap['complete']); self.assertEqual(snap['measurement'],'cumulative_public_video_counts')
        self.assertEqual(request.call_args_list[1].kwargs['payload']['cursor'],1)

    def test_empty_list_is_measured_empty_not_missing(self):
        with mock.patch.object(tiktok,'_request',return_value={'data':{'videos':[], 'has_more':False}}):
            snap=tiktok.videos('qa-token',now=NOW)
        self.assertTrue(snap['complete']); self.assertEqual(snap['videos'],[])

    def test_malformed_list_is_a_failure(self):
        with mock.patch.object(tiktok,'_request',return_value={'data':{'videos':None, 'has_more':False}}):
            with self.assertRaises(tiktok.TikTokError): tiktok.videos('qa-token',now=NOW)
