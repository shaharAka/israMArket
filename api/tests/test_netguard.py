"""Tests for the outbound-URL guard — the piece that stops the API being an SSRF pivot.

Hermetic on purpose: every hostname case mocks `socket.getaddrinfo` rather than doing a
real lookup, so the suite does not depend on DNS being reachable in CI.
"""

import socket
import unittest
from unittest.mock import patch

from app.services.netguard import UnsafeUrlError, assert_public_url

PUBLIC_IP = "93.184.216.34"  # example.com, a routable unicast address


def resolves_to(*addresses: str):
    """Patch getaddrinfo so `host` resolves to the given addresses."""

    def fake(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (addr, port or 443)) for addr in addresses]

    return patch("app.services.netguard.socket.getaddrinfo", side_effect=fake)


class NetguardTest(unittest.TestCase):
    def test_blocks_cloud_metadata(self):
        # The single most valuable SSRF target on a cloud host.
        with self.assertRaises(UnsafeUrlError):
            assert_public_url("http://169.254.169.254/latest/meta-data/")

    def test_blocks_loopback_and_localhost(self):
        for url in (
            "http://127.0.0.1/",
            "http://localhost:8000/health",
            "http://[::1]/",
            "http://0.0.0.0/",
        ):
            with self.subTest(url=url), self.assertRaises(UnsafeUrlError):
                assert_public_url(url)

    def test_blocks_private_ranges(self):
        for url in ("http://10.0.0.5/", "http://192.168.1.1/", "http://172.16.0.1/"):
            with self.subTest(url=url), self.assertRaises(UnsafeUrlError):
                assert_public_url(url)

    def test_blocks_internal_hostnames(self):
        # These are refused on the name alone, without needing DNS.
        for url in ("http://metadata.google.internal/", "http://db.internal/", "http://x.local/"):
            with self.subTest(url=url), self.assertRaises(UnsafeUrlError):
                assert_public_url(url)

    def test_blocks_foreign_schemes(self):
        for url in ("file:///etc/passwd", "ftp://example.com/x", "gopher://example.com/"):
            with self.subTest(url=url), self.assertRaises(UnsafeUrlError):
                assert_public_url(url)

    def test_allows_public_urls(self):
        with resolves_to(PUBLIC_IP):
            for url in (
                "https://example.com/",
                "https://example.com/path?a=1#frag",
                "http://example.com/",
            ):
                with self.subTest(url=url):
                    self.assertEqual(assert_public_url(url), url)

    def test_blocks_hostname_that_resolves_to_a_private_ip(self):
        """The DNS-rebinding shape: a perfectly ordinary-looking hostname whose A record
        points inside the network. Blocking literal IPs alone would miss this."""
        for private in ("10.0.0.7", "127.0.0.1", "169.254.169.254", "192.168.0.10"):
            with self.subTest(resolves_to=private), resolves_to(private), self.assertRaises(UnsafeUrlError):
                assert_public_url("https://innocent-looking.example/")

    def test_blocks_when_any_resolved_address_is_private(self):
        # A host with both a public and a private record must be refused outright.
        with resolves_to(PUBLIC_IP, "10.0.0.7"), self.assertRaises(UnsafeUrlError):
            assert_public_url("https://mixed.example/")

    def test_fails_closed_when_dns_fails(self):
        """If we cannot resolve the host we cannot prove it is public, so it is refused.
        An attacker must not be able to bypass the guard by breaking resolution."""
        with patch(
            "app.services.netguard.socket.getaddrinfo",
            side_effect=socket.gaierror("nodename nor servname provided"),
        ), self.assertRaises(UnsafeUrlError):
            assert_public_url("https://unresolvable.example/")

    def test_rejects_empty_and_malformed(self):
        for url in ("", "   ", "not a url", "https://"):
            with self.subTest(url=url), self.assertRaises(UnsafeUrlError):
                assert_public_url(url)


class ScraperGuardTest(unittest.TestCase):
    def test_scrape_site_refuses_internal_targets(self):
        from app.services.scraper import scrape_site

        for url in ("http://169.254.169.254/", "http://localhost:8000/", "http://10.1.2.3/"):
            with self.subTest(url=url), self.assertRaises(RuntimeError):
                scrape_site(url)

    def test_scrape_site_rejects_foreign_scheme_clearly(self):
        from app.services.scraper import scrape_site

        with self.assertRaises(ValueError) as ctx:
            scrape_site("file:///etc/passwd")
        self.assertIn("http", str(ctx.exception))

    def test_photo_candidates_reject_private_hosts(self):
        from app.services.scraper import fetch_photo_candidates

        self.assertEqual(fetch_photo_candidates(["http://127.0.0.1/secret.png"]), [])

    def test_photo_candidates_skip_icons_and_logos(self):
        from app.services.scraper import fetch_photo_candidates

        urls = [
            "https://example.com/favicon.ico",
            "https://example.com/logo.png",
            "https://example.com/pixel.gif",
            "https://example.com/1x1.png",
        ]
        self.assertEqual(fetch_photo_candidates(urls), [])


if __name__ == "__main__":
    unittest.main()


class PhotoShapeTest(unittest.TestCase):
    """CDN filenames are opaque hashes, so shape — not the name — identifies a logo."""

    def _png(self, w, h):
        import struct, zlib

        raw = b"".join(b"\x00" + bytes((200, 60, 30)) * w for _ in range(h))

        def chunk(t, d):
            c = t + d
            return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

        return (
            b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw))
            + chunk(b"IEND", b"")
        )

    def test_reads_png_dimensions(self):
        from app.services.scraper import _image_dimensions

        self.assertEqual(_image_dimensions(self._png(998, 480)), (998, 480))

    def test_rejects_a_wordmark_shape(self):
        """The real case: a 998x480 Wix logo passed the old byte-size filter and would
        have been used full-bleed as the customer's card photo."""
        from app.services.scraper import _looks_like_a_photograph

        self.assertFalse(_looks_like_a_photograph(self._png(998, 480)))

    def test_accepts_ordinary_photo_shapes(self):
        from app.services.scraper import _looks_like_a_photograph

        for w, h in ((1080, 1350), (1200, 1200), (1600, 1200), (800, 1000)):
            with self.subTest(size=f"{w}x{h}"):
                self.assertTrue(_looks_like_a_photograph(self._png(w, h)))

    def test_rejects_tiny_assets(self):
        from app.services.scraper import _looks_like_a_photograph

        self.assertFalse(_looks_like_a_photograph(self._png(180, 180)))

    def test_unknown_format_is_not_punished(self):
        from app.services.scraper import _looks_like_a_photograph

        self.assertTrue(_looks_like_a_photograph(b"\x00\x01\x02\x03 not an image"))
