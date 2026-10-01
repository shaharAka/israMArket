"""Imported first by every test module, before anything from `app`.

Settings also read the developer's `.env`, and a local `.env` may switch post writing to
Muse Spark (`POST_MODEL=muse-spark`) and carry real API keys. Tests stub the model calls,
but a stub on the Gemini path does not catch a call routed to Meta — so without this a
test run could make live, billed requests. Environment variables beat `.env` in
pydantic-settings, so pinning them here keeps every run offline and on the stubbed path.

The brand scan may also launch a local headless Chrome for a screenshot of the site. A
test's fake DNS would hand Chrome's proxy a real public address for `bakery.example`, so
the screenshot is switched off here; tests of that path turn it on explicitly.
"""

import os

os.environ["POST_MODEL"] = "gemini"
os.environ["META_MODEL_API_KEY"] = ""
os.environ["SITE_SCREENSHOT"] = "false"
# Month generation runs as a background job (services/generation_jobs.py). In tests it
# runs to the end inside the request that started it, so `mock.patch` blocks and the
# overridden test database still apply; tests of the worker threads switch it off.
os.environ["GENERATION_JOBS_INLINE"] = "1"
# PayPal: a developer `.env` may hold sandbox credentials. Tests that need PayPal patch the
# settings and mock the HTTP transport (tests/test_billing.py); nothing may reach PayPal.
os.environ["PAYPAL_ENV"] = "sandbox"
os.environ["PAYPAL_CLIENT_ID"] = ""
os.environ["PAYPAL_CLIENT_SECRET"] = ""
os.environ["PAYPAL_PLAN_ID"] = ""
os.environ["PAYPAL_WEBHOOK_ID"] = ""
os.environ["BILLING_ENFORCE"] = "false"
# Design DNA is (re)built in the background after a site scan and at signup, with a model
# call. Off here so no scan or signup test can make one; tests of that path turn it on and
# mock the model (tests/test_design_dna.py).
os.environ["DESIGN_DNA_ON_SCAN"] = "false"
# Image routing at the code defaults, whatever a developer's .env says (a local .env with
# GEMINI_IMAGE_MODEL=gemini-3-pro-image / 2K would otherwise reach the routing tests).
os.environ["IMAGE_GENERATE_PROVIDER"] = "muse"
os.environ["IMAGE_EDIT_PROVIDER"] = "muse"
os.environ["IMAGE_FALLBACK_MODEL"] = "gemini-3.1-flash-image"
os.environ["GEMINI_IMAGE_MODEL"] = "gemini-3.1-flash-image"
os.environ["GEMINI_IMAGE_SIZE"] = "1K"
# Images go to Muse first. META_MODEL_API_KEY is blank above, so Muse fails before any
# request; tests that exercise the routing patch services/muse_image.py.
