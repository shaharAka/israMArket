"""Which measurement tags a site's homepage HTML visibly carries.

Cheap and conservative: a regex pass over the HTML the scraper already downloaded, no
extra request and no JavaScript. Site builders print their configured tags into the raw
page — Wix, for one, inlines its "promoteAnalyticsChannels" config with the GA4 and GTM
ids — so a plain read catches most of them. It answers "we saw it" or "we did not see
it", never "they do not have it": a tag injected later by GTM, a consent manager or a
script bundle does not appear in the source. The quarter plan marks an integration
"have" only when it was seen here, and "unknown" when GTM could be hiding it.
"""

from __future__ import annotations

import re

_GA4 = re.compile(r"(?<![A-Z0-9-])(G-[A-Z0-9]{6,12}|GT-[A-Z0-9]{6,12})(?![A-Z0-9])")
_GTM = re.compile(r"(?<![A-Z0-9-])(GTM-[A-Z0-9]{4,10})(?![A-Z0-9])")
_ADS = re.compile(r"(?<![A-Z0-9-])(AW-\d{6,12})(?![0-9])")
_PIXEL_ID = re.compile(
    r"""fbq\(\s*['"]init['"]\s*,\s*['"](\d{8,20})['"]"""
    r"""|(?:facebookPixel|facebook_pixel|pixelId|fbPixelId)["']?\s*[:=]\s*["'](\d{8,20})["']""",
    re.IGNORECASE,
)
_PIXEL_SCRIPT = re.compile(r"connect\.facebook\.net/[^\"'\s]*fbevents\.js")
_SEARCH_CONSOLE = re.compile(r"""<meta[^>]+name=["']google-site-verification["']""", re.IGNORECASE)

TAG_KEYS = ("ga4", "gtm", "meta_pixel", "google_ads", "search_console")


def _unique(values) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))[:5]


def detect_tags(html: str) -> dict[str, list[str]]:
    """{"ga4": ["G-…"], "gtm": ["GTM-…"], "meta_pixel": ["<id>" | "seen"],
    "google_ads": ["AW-…"], "search_console": ["verified"]} — empty lists when not seen."""
    text = html or ""
    pixels = _unique(a or b for a, b in _PIXEL_ID.findall(text))
    if not pixels and _PIXEL_SCRIPT.search(text):
        pixels = ["seen"]
    return {
        "ga4": _unique(_GA4.findall(text)),
        "gtm": _unique(_GTM.findall(text)),
        "meta_pixel": pixels,
        "google_ads": _unique(_ADS.findall(text)),
        "search_console": ["verified"] if _SEARCH_CONSOLE.search(text) else [],
    }
