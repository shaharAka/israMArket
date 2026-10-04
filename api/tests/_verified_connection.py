"""Stored proof of a successful source read; no provider request or actual grant."""
from datetime import datetime

from app.services import meta_readiness
from app.services.jsonutil import dumps, loads


def verified_connection(item):
    # Non-secret sentinel, never sent to a provider or decrypted by these journey tests.
    item.access_token_enc = item.access_token_enc or "synthetic-test-grant"
    now = datetime.now().isoformat()
    extra = loads(item.extra_json, {}) or {}
    if item.provider == "ga4":
        extra["source_readiness"] = {"status": "ready", "property_id": item.external_id,
                                     "last_success_at": now}
    elif item.provider == "meta":
        extra.update(selected_page_id=item.external_id, selected_instagram_id="instagram-example",
                     selected_ad_account_id="act_example", selected_pixel_id="pixel-example")
        item.extra_json = dumps(extra)
        extra["source_readiness"] = {
            "selection_key": meta_readiness.key(item), "status": "ready", "last_success_at": now,
            "sections": {name: {"status": "receiving" if name == "tracking" else "ready", "read_at": now}
                         for name in ("social", "ads", "tracking")},
        }
    item.extra_json = dumps(extra)
