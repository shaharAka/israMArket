from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import Base, engine, get_db, migrate_db
from app.deps import get_current_user
from app.models import Business, User
from app.routers import (
    assets,
    audiences,
    auth,
    instagram,
    integrations,
    onboarding,
    performance,
    promotion,
    public,
    public_onboarding,
    publish,
    recommendations,
    research,
    setup,
    strategy,
    whatsapp,
)
from app.security import DEFAULT_JWT_SECRET

Base.metadata.create_all(bind=engine)
migrate_db()
settings = get_settings()

if settings.jwt_secret == DEFAULT_JWT_SECRET and settings.environment != "development":
    raise RuntimeError(
        "JWT_SECRET הוא עדיין ברירת המחדל בסביבת production. הגדירו סוד אמיתי לפני עלייה."
    )

def _encrypt_legacy_page_tokens() -> None:
    """Facebook Page tokens used to be stored in plain text; encrypt any that still are.
    Best effort: without an encryption key there is nothing to encrypt with, and
    connecting an account is refused in that state anyway (security._fernet)."""
    from app.db import SessionLocal

    db = SessionLocal()
    try:
        integrations.encrypt_legacy_page_tokens(db)
    except Exception:
        db.rollback()
    finally:
        db.close()


_encrypt_legacy_page_tokens()

MEDIA_DIR = Path(__file__).resolve().parents[1] / "data" / "generated"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

# Interactive docs enumerate every endpoint; keep them for local work only.
_expose_docs = settings.environment == "development"
app = FastAPI(
    title="IsraMarket API",
    version="0.1.0",
    docs_url="/docs" if _expose_docs else None,
    redoc_url="/redoc" if _expose_docs else None,
    openapi_url="/openapi.json" if _expose_docs else None,
)
def _with_loopback_twins(origins: list[str]) -> set[str]:
    """`localhost` and `127.0.0.1` are the same machine, and the web app is configured to
    be opened on either (see web/next.config.ts). The Next proxy forwards the browser's
    Origin, so a page opened on http://127.0.0.1:3000 had every POST — the landing
    page's preview included — refused as a foreign origin."""
    out = set(origins)
    for origin in origins:
        if "://localhost" in origin:
            out.add(origin.replace("://localhost", "://127.0.0.1", 1))
        elif "://127.0.0.1" in origin:
            out.add(origin.replace("://127.0.0.1", "://localhost", 1))
    return out


ALLOWED_ORIGINS = _with_loopback_twins([settings.web_origin, "http://localhost:3000"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(ALLOWED_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(onboarding.router)
app.include_router(assets.router)
app.include_router(audiences.router)
app.include_router(strategy.router)
app.include_router(publish.router)
app.include_router(integrations.router)
app.include_router(performance.router)
app.include_router(recommendations.router)
app.include_router(setup.router)
app.include_router(promotion.router)
app.include_router(instagram.router)
app.include_router(research.router)
app.include_router(whatsapp.router)
# The WhatsApp tracked link's public redirect, /r/{code}: anonymous, stores no visitor data.
app.include_router(whatsapp.public_router)
# Anonymous on purpose (the landing-page preview); it carries its own rate limits.
app.include_router(public.router)
# Onboarding v2 (/start, before signup): anonymous too, with its own budgets.
app.include_router(public_onboarding.router)


@app.on_event("startup")
def _resume_month_generation() -> None:
    """A month that was being built when the API stopped continues from its saved stage
    (services/generation_jobs.py). Never blocks or fails the startup."""
    from app.services import generation_jobs

    try:
        generation_jobs.resume_on_startup()
    except Exception:
        pass


@app.middleware("http")
async def csrf_origin_check(request: Request, call_next):
    """Reject state-changing requests that carry a foreign Origin.

    SameSite=Lax already stops cross-site cookies on POST, so this is defence in depth.
    A missing Origin is allowed on purpose: curl, scripts and server-to-server calls do
    not send one, and blocking them would break the API for no security gain.
    """
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("origin")
        if origin:
            if origin not in ALLOWED_ORIGINS:
                return JSONResponse(status_code=403, content={"detail": "בקשה ממקור לא מורשה."})
    return await call_next(request)


@app.get("/media/{business_id}/{filename}")
def media(
    business_id: int,
    filename: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Serve a generated card image, but only to the business that owns it.

    This replaced a public StaticFiles mount: business ids are sequential, so anyone
    could enumerate every customer's generated artwork.
    """
    owns = (
        db.query(Business)
        .filter(Business.id == business_id, Business.user_id == user.id)
        .first()
    )
    if not owns:
        raise HTTPException(status_code=404, detail="הקובץ לא נמצא")

    # Take only the final path segment, then confirm the result is still inside the
    # business folder, so '../../etc/passwd' cannot escape it.
    safe_name = Path(filename).name
    folder = (MEDIA_DIR / str(business_id)).resolve()
    target = (folder / safe_name).resolve()
    if not target.is_file() or folder not in target.parents:
        raise HTTPException(status_code=404, detail="הקובץ לא נמצא")
    return FileResponse(target)


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "gemini": bool(settings.gemini_api_key),
        "ga4": bool(settings.google_client_id and settings.google_client_secret),
        "meta": bool(settings.meta_app_id and settings.meta_app_secret),
    }
