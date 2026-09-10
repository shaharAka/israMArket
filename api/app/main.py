from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import Base, engine, get_db, migrate_db
from app.deps import get_current_user
from app.models import Business, User
from app.routers import auth, integrations, onboarding, performance, recommendations, strategy
from app.security import DEFAULT_JWT_SECRET

Base.metadata.create_all(bind=engine)
migrate_db()
settings = get_settings()

if settings.jwt_secret == DEFAULT_JWT_SECRET and settings.environment != "development":
    raise RuntimeError(
        "JWT_SECRET הוא עדיין ברירת המחדל בסביבת production. הגדירו סוד אמיתי לפני עלייה."
    )

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
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(onboarding.router)
app.include_router(strategy.router)
app.include_router(integrations.router)
app.include_router(performance.router)
app.include_router(recommendations.router)
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
            allowed = {settings.web_origin, "http://localhost:3000"}
            if origin not in allowed:
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
