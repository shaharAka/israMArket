"""Capacity must preserve active limits and respect each endpoint's own window."""
import _test_env  # noqa: F401

from concurrent.futures import ThreadPoolExecutor
import unittest
from unittest.mock import patch

from fastapi import Request

from app.config import Settings
from app.services import ratelimit


class RateLimitCapacityTests(unittest.TestCase):
    def setUp(self):
        ratelimit.reset()
        self.addCleanup(ratelimit.reset)

    def test_new_identities_do_not_evict_active_allowances_at_capacity(self):
        with patch.object(ratelimit, '_MAX_KEYS', 2), patch.object(ratelimit.time, 'monotonic', return_value=100):
            self.assertTrue(ratelimit.allow('first', 2, 300))
            self.assertTrue(ratelimit.allow('second', 2, 300))
            for i in range(20):
                self.assertFalse(ratelimit.allow(f'new-{i}', 2, 300))
            self.assertEqual(len(ratelimit._hits), 2)
            self.assertEqual(len(ratelimit._expires_at), 2)
            self.assertTrue(ratelimit.allow('first', 2, 300))
            self.assertFalse(ratelimit.allow('first', 2, 300))
            self.assertTrue(ratelimit.allow('second', 2, 300))

    def test_reclaims_expired_keys_without_resetting_a_longer_window(self):
        with patch.object(ratelimit, '_MAX_KEYS', 2):
            with patch.object(ratelimit.time, 'monotonic', return_value=100):
                self.assertTrue(ratelimit.allow('short', 1, 5))
                self.assertTrue(ratelimit.allow('long', 1, 3600))
            with patch.object(ratelimit.time, 'monotonic', return_value=110):
                self.assertTrue(ratelimit.allow('new', 1, 5))
                self.assertNotIn('short', ratelimit._hits)
                self.assertFalse(ratelimit.allow('long', 1, 3600))
                self.assertEqual(set(ratelimit._hits), {'long', 'new'})

    def test_sweeps_at_most_once_a_second_while_full(self):
        with patch.object(ratelimit, '_MAX_KEYS', 1):
            with patch.object(ratelimit.time, 'monotonic', return_value=100):
                self.assertTrue(ratelimit.allow('first', 1, 0.5))
                self.assertFalse(ratelimit.allow('new', 1, 300))
                self.assertEqual(ratelimit._next_prune, 101)
            with patch.object(ratelimit.time, 'monotonic', return_value=100.9):
                self.assertFalse(ratelimit.allow('new', 1, 300))
                self.assertEqual(ratelimit._next_prune, 101)
            with patch.object(ratelimit.time, 'monotonic', return_value=101):
                self.assertTrue(ratelimit.allow('new', 1, 300))

    def test_parallel_requests_cannot_exceed_capacity(self):
        with patch.object(ratelimit, '_MAX_KEYS', 4), patch.object(ratelimit.time, 'monotonic', return_value=100):
            with ThreadPoolExecutor(max_workers=8) as pool:
                accepted = list(pool.map(lambda i: ratelimit.allow(f'identity-{i}', 2, 300), range(30)))
            self.assertEqual(sum(accepted), 4)
            self.assertEqual(len(ratelimit._hits), 4)

    def test_non_positive_limit_does_not_reserve_capacity(self):
        self.assertFalse(ratelimit.allow('zero', 0, 300))
        self.assertFalse(ratelimit.allow('negative', -1, 300))
        self.assertEqual(ratelimit._hits, {})
        self.assertEqual(ratelimit._expires_at, {})


class ClientAddressTests(unittest.TestCase):
    def request(self, forwarded=None):
        headers=[] if forwarded is None else [(b'x-forwarded-for', forwarded.encode())]
        return Request({'type':'http','headers':headers,'client':('192.0.2.9', 12000)})

    def test_direct_api_ignores_forwarded_header(self):
        with patch.object(ratelimit, 'get_settings', return_value=Settings(trust_forwarded_for=False)):
            self.assertEqual(ratelimit._client_ip(self.request('203.0.113.1')), '192.0.2.9')

    def test_trusted_proxy_uses_the_first_address_or_connection_fallback(self):
        with patch.object(ratelimit, 'get_settings', return_value=Settings(trust_forwarded_for=True)):
            self.assertEqual(ratelimit._client_ip(self.request(' 203.0.113.1, 198.51.100.2')), '203.0.113.1')
            self.assertEqual(ratelimit._client_ip(self.request()), '192.0.2.9')
