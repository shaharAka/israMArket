"""Imported first by every test module, before anything from `app`.

Settings also read the developer's `.env`, and a local `.env` may switch post writing to
Muse Spark (`POST_MODEL=muse-spark`) and carry real API keys. Tests stub the model calls,
but a stub on the Gemini path does not catch a call routed to Meta — so without this a
test run could make live, billed requests. Environment variables beat `.env` in
pydantic-settings, so pinning them here keeps every run offline and on the stubbed path.
"""

import os

os.environ["POST_MODEL"] = "gemini"
os.environ["META_MODEL_API_KEY"] = ""
