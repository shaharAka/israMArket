#!/usr/bin/env python3
"""Serve fictional QA accounts from a fresh SQLite DB, bound to loopback only."""

from __future__ import annotations

import argparse
import os
import secrets
import shutil
import sys
import tempfile
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
API = REPO / "api"
TESTS = API / "tests"
sys.path[:0] = [str(API), str(TESTS)]

# Reuse the test suite's provider-safe settings before app imports, then point it at this
# launcher run's own data directory instead of the test module's temporary defaults.
import _test_env  # noqa: E402,F401


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765, help="local API port (default: 8765)")
    parser.add_argument("--web-origin", default="http://127.0.0.1:3160", help="local web origin allowed by CORS")
    parser.add_argument("--scenario", choices=("empty", "populated"), default="empty",
                        help="fixture state for the fictional accounts")
    parser.add_argument("--fail-read", choices=("history", "allowance"),
                        help="QA-only: return 503 for one campaign-history or media-allowance GET")
    parser.add_argument("--fail-post-saves", type=int, default=0,
                        help="QA-only: return 503 for the first N post saves, then recover")
    args = parser.parse_args()
    if not 0 <= args.fail_post_saves <= 10:
        parser.error("--fail-post-saves must be between 0 and 10")
    if not 1024 <= args.port <= 65535:
        parser.error("--port must be between 1024 and 65535")
    if not args.web_origin.startswith(("http://127.0.0.1:", "http://localhost:")):
        parser.error("--web-origin must be a loopback HTTP origin")

    temp_root = Path(tempfile.mkdtemp(prefix="isramarket-qa-personas-"))
    os.environ.update({
        "DATABASE_URL": f"sqlite:///{temp_root / 'personas.sqlite'}",
        "MEDIA_DIR": str(temp_root / "media"),
        "JWT_SECRET": secrets.token_urlsafe(32),
        "TOKEN_ENCRYPTION_KEY": "",
        "ENVIRONMENT": "development",
        "WEB_ORIGIN": args.web_origin,
        "API_ORIGIN": f"http://127.0.0.1:{args.port}",
        # Fake, non-routable credentials make the real billing dependency enforce trial
        # expiry locally. The fixture server never calls checkout or PayPal.
        "BILLING_ENFORCE": "true",
        "PAYPAL_ENV": "sandbox",
        "PAYPAL_CLIENT_ID": "qa-fixture-disabled",
        "PAYPAL_CLIENT_SECRET": "qa-fixture-disabled",
        "PAYPAL_PLAN_ID": "qa-fixture-disabled",
        "PAYPAL_WEBHOOK_ID": "",
        "GOOGLE_CLIENT_ID": "",
        "GOOGLE_CLIENT_SECRET": "",
        "META_APP_ID": "",
        "META_APP_SECRET": "",
        "META_MODEL_API_KEY": "",
        "GEMINI_API_KEY": "",
        "OPENAI_API_KEY": "",
        "TEXT_PROVIDER": "gemini",
        "TEXT_FALLBACK_PROVIDER": "none",
        "POST_MODEL": "gemini",
        "IMAGE_GENERATE_PROVIDER": "muse",
        "IMAGE_EDIT_PROVIDER": "muse",
        "IMAGE_FALLBACK_MODEL": "",
        "IMAGE_JOBS_ON_BUILD": "false",
        "GENERATION_JOBS_INLINE": "1",
        "ANALYSIS_JOBS_ENABLED": "false",
        "DESIGN_DNA_ON_SCAN": "false",
        "BRAND_LOGO_COPY": "false",
        "PHOTO_ANALYSIS": "false",
        "PHOTO_ANALYSIS_MODEL": "",
        "SITE_SCREENSHOT": "false",
    })

    from app.db import Base, SessionLocal, engine  # noqa: E402
    from app.models import User  # noqa: E402
    from app.main import app  # noqa: E402
    from _qa_personas import QA_PASSWORD, seed_personas  # noqa: E402

    if args.fail_read:
        from fastapi.responses import JSONResponse  # noqa: E402

        failed_path = {
            "history": "/campaign/revisions",
            "allowance": "/billing/media-allowance",
        }[args.fail_read]

        @app.middleware("http")
        async def fail_one_qa_read(request, call_next):
            if request.method == "GET" and request.url.path == failed_path:
                return JSONResponse(status_code=503, content={"detail": "תקלה זמנית בתצוגת QA."})
            return await call_next(request)

    if args.fail_post_saves:
        from starlette.responses import JSONResponse
        saves_left = args.fail_post_saves

        @app.middleware("http")
        async def fail_qa_saves(request, call_next):
            nonlocal saves_left
            if saves_left and request.method == "POST" and request.url.path == "/strategy/posts/save":
                saves_left -= 1
                return JSONResponse(status_code=503, content={"detail": "לא הצלחנו לשמור את העיצוב. נסו שוב."})
            return await call_next(request)

    try:
        Base.metadata.create_all(bind=engine)
        with SessionLocal() as db:
            seeded = seed_personas(db, populated=args.scenario == "populated")
        import uvicorn

        print(f"QA API: http://127.0.0.1:{args.port}")
        print(f"Web origin: {args.web_origin}")
        print(f"Temporary SQLite and media: {temp_root}")
        print(f"QA-only password for every account: {QA_PASSWORD}")
        if args.fail_read:
            print(f"QA-only 503 read fault: GET {failed_path}")
        if args.fail_post_saves:
            print(f"QA-only 503 write fault: first {args.fail_post_saves} post saves")
        print("Accounts:")
        for case in seeded:
            print(f"  {case['id']}: {case['name']} · {case['email']} · {case['state']}")
        print("OAuth, model, and image credentials are blank. PayPal values are fake placeholders; do not open checkout.")
        print("Ctrl+C stops the API and removes its temporary data.")
        uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning", access_log=False)
    finally:
        engine.dispose()
        shutil.rmtree(temp_root, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
