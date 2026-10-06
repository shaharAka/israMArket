"""Company research is bounded, attributed and optional; fixtures make no network calls."""
import _test_env  # noqa: F401
import unittest
from unittest.mock import patch
import httpx
from bs4 import BeautifulSoup
from app.services import software_site, onboarding_draft as drafts, preview

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
