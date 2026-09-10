from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.db import Base, engine, migrate_db
from app.routers import auth, integrations, onboarding, performance, recommendations, strategy

Base.metadata.create_all(bind=engine)
migrate_db()
settings = get_settings()

MEDIA_DIR = Path(__file__).resolve().parents[1] / "data" / "generated"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="IsraMarket API", version="0.1.0")
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
app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "gemini": bool(settings.gemini_api_key),
        "ga4": bool(settings.google_client_id and settings.google_client_secret),
        "meta": bool(settings.meta_app_id and settings.meta_app_secret),
    }
