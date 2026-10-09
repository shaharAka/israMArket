"""Company research is bounded, attributed and optional; fixtures make no network calls."""
import _test_env  # noqa: F401
import unittest
import threading
import time
from unittest.mock import patch
import httpx
from bs4 import BeautifulSoup
from app.services import software_site, onboarding_draft as drafts, preview
from app.services import scraper
from app.services.netguard import UnsafeUrlError

BASE = "https://software.example/"
HTML = """<a href='/products/calendar'>Calendar product</a><a href='/pricing'>Pricing</a>
<a href='https://foreign.example/products'>Other product</a><a href='/products/delete'>Delete</a>
<a href='/account/pricing'>Account</a><a href='/pricing?token=secret'>Pricing</a>"""

class SoftwareSiteTest(unittest.TestCase):
    def raw(self):
        return {"url": BASE, "content_links": software_site.content_links(BASE, BeautifulSoup(HTML, "lxml"))}

    def test_only_two_public_same_site_pages_and_sources_reach_plan(self):
        raw = self.raw()
        self.assertEqual([item["url"] for item in raw["content_links"]], [BASE + "products/calendar", BASE + "pricing"])
        def get(_client, url, **kwargs):
            self.assertEqual(kwargs["max_bytes"], 150_000)
            return httpx.Response(200, request=httpx.Request("GET", url), headers={"content-type":"text/html"},
                                  text="<h1>Calendar</h1><p>Book appointments and send reminders. Subscription after a demo.</p>")
        with patch.object(software_site, "capped_get", side_effect=get) as fetch:
            raw.update(software_site.read_product_pages(raw))
        self.assertEqual(fetch.call_count, 2)
        self.assertEqual(raw["product_research"]["read"], 2)
        block = drafts._site_block({"raw": raw})
        self.assertIn(BASE + "pricing", block)
        self.assertIn("נקרא:", block)
        self.assertIn("send reminders", block)

    def test_failed_or_foreign_redirect_does_not_become_company_evidence(self):
        bad = httpx.Response(200, request=httpx.Request("GET", "https://other.example/pricing"), headers={"content-type":"text/html"}, text="Invented product features " * 10)
        with patch.object(software_site, "capped_get", side_effect=[httpx.ConnectError("no network"), bad]):
            result = software_site.read_product_pages(self.raw())
        self.assertEqual(result["product_pages"], [])
        self.assertEqual(result["product_research"]["status"], "partial")
        self.assertIn("התוכנית תשתמש", result["product_research"]["note_he"])

    def test_cached_brand_is_enriched_without_another_model_call(self):
        preview.reset_cache()
        self.addCleanup(preview.reset_cache)
        preview._cache_put(preview.cache_key(BASE), {"scan": {"raw":self.raw(), "brand_language":{"business_name":"Synthetic software"}},
                                                   "preview":{"business_name":"Synthetic software", "brand_language":{}}, "post_done":False})
        with patch.object(software_site, "read_product_pages", return_value={"product_pages":[], "product_research":{"status":"no_pages"}}) as read, patch.object(preview, "_scan_brand") as model_scan:
            preview.build_brand_preview(BASE, include_products=True)
            preview.build_brand_preview(BASE, include_products=True)
        self.assertEqual(read.call_count, 1)
        model_scan.assert_not_called()

    def test_three_distinct_pages_run_concurrently_with_one_deadline(self):
        raw = {"url": BASE, "content_links": software_site.content_links(BASE, BeautifulSoup(
            "<a href='/products/a'>Product A</a><a href='/products/b'>Product B</a>"
            "<a href='/about'>About us</a><a href='/pricing'>Prices</a>", "lxml"))}
        barrier = threading.Barrier(3)
        deadlines = []
        lock = threading.Lock()
        def get(_client, url, **kwargs):
            with lock: deadlines.append(kwargs["deadline"])
            self.assertEqual(kwargs["allowed_origin"], BASE)
            barrier.wait(timeout=2)
            return httpx.Response(200, request=httpx.Request("GET", url),
                headers={"content-type": "text/html"}, text="<p>Actual public offering and price details from this business.</p>")
        with patch.object(software_site, "capped_get", side_effect=get):
            result = software_site.read_product_pages(raw)
        self.assertEqual(result["product_research"]["status"], "ready")
        self.assertEqual(len(set(deadlines)), 1)
        self.assertEqual([page["kind"] for page in result["product_pages"]], ["pricing", "products", "about"])
        self.assertTrue(all(source["status"] == "read" and source["read_at"] for source in result["product_research"]["sources"]))

    def test_services_impact_and_donations_are_discovered_but_actions_excluded(self):
        html = """<a href='/services'>Treatments</a><a href='/impact'>Our mission</a>
        <a href='/donate'>Support our work</a><a href='/checkout/donate'>Donate now</a>
        <a href='/account/about'>About</a><a href='/pricing?secret=1'>Prices</a>
        <a href='http://software.example/pricing'>Prices</a><a href='/products/%64elete'>Product</a>"""
        links = software_site.content_links(BASE, BeautifulSoup(html, "lxml"))
        self.assertEqual([item["kind"] for item in links], ["services", "impact", "donate"])

    def test_limits_and_blocks_are_not_reads(self):
        raw = self.raw()
        def get(_client, url, **kwargs):
            return httpx.Response(429 if "pricing" in url else 403,
                request=httpx.Request("GET", url), headers={"content-type":"text/html"}, text="Private data " * 50)
        with patch.object(software_site, "capped_get", side_effect=get):
            result = software_site.read_product_pages(raw)
        self.assertEqual(result["product_pages"], [])
        self.assertEqual(result["product_research"]["status"], "partial")
        self.assertEqual([source["status"] for source in result["product_research"]["sources"]], ["limited", "blocked"])

    def test_global_capacity_is_reported_without_queuing(self):
        acquired = [software_site._SLOTS.acquire(blocking=False) for _ in range(3)]
        self.assertTrue(all(acquired))
        try:
            with patch.object(software_site, "capped_get") as fetch:
                result = software_site.read_product_pages(self.raw())
            fetch.assert_not_called()
            self.assertEqual(result["product_research"]["status"], "partial")
            self.assertTrue(all(source["reason"] == "capacity" for source in result["product_research"]["sources"]))
        finally:
            for _ in acquired: software_site._SLOTS.release()

    def test_deadline_returns_available_evidence_without_waiting_for_slow_page(self):
        release = threading.Event()
        finished = threading.Event()
        raw = {"url": BASE, "content_links": [{"url": BASE + "pricing", "label": "Pricing"}]}
        def slow(item, base, deadline):
            release.wait(timeout=1)
            finished.set()
            return None, software_site._source(item, "limited", "timeout")
        try:
            with patch.object(software_site, "DEADLINE_SECONDS", .02), patch.object(software_site, "_read", side_effect=slow):
                started = time.monotonic()
                result = software_site.read_product_pages(raw)
            self.assertLess(time.monotonic() - started, .5)
            self.assertEqual(result["product_research"]["sources"][0]["reason"], "timeout")
            self.assertEqual(result["product_pages"], [])
        finally:
            release.set()
            self.assertTrue(finished.wait(timeout=1))

    def test_foreign_redirect_is_rejected_before_request(self):
        calls = []
        def respond(request):
            calls.append(str(request.url))
            return httpx.Response(302, headers={"location": "https://other.example/pricing"})
        with httpx.Client(transport=httpx.MockTransport(respond)) as client, patch.object(scraper, "assert_public_url", side_effect=lambda url: url):
            with self.assertRaises(UnsafeUrlError):
                scraper.capped_get(client, BASE + "pricing", max_bytes=150_000,
                    deadline=time.monotonic()+6, allowed_origin=BASE)
        self.assertEqual(calls, [BASE + "pricing"])

    def test_same_origin_redirect_retains_byte_cap(self):
        def respond(request):
            if request.url.path == "/pricing":
                return httpx.Response(302, headers={"location": "/prices"})
            return httpx.Response(200, text="x" * 100)
        with httpx.Client(transport=httpx.MockTransport(respond)) as client, patch.object(scraper, "assert_public_url", side_effect=lambda url: url):
            response = scraper.capped_get(client, BASE + "pricing", max_bytes=10,
                deadline=time.monotonic()+6, allowed_origin=BASE)
        self.assertEqual(str(response.url), BASE + "prices")
        self.assertEqual(len(response.content), 11)
