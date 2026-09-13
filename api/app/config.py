from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    gemini_api_key: str = ""
    jwt_secret: str = "dev-only-change-me"
    token_encryption_key: str = ""
    environment: str = "development"
    web_origin: str = "http://localhost:3000"
    api_origin: str = "http://localhost:8000"
    google_client_id: str = ""
    google_client_secret: str = ""
    meta_app_id: str = ""
    meta_app_secret: str = ""
    database_url: str = Field(default="sqlite:///./data/isramarket.db")

    gemini_strategy_model: str = "gemini-3.7-flash"
    gemini_lite_model: str = "gemini-3.5-flash-lite"
    gemini_image_model: str = "gemini-3-pro-image"
    # 1K returns ~928px wide for 4:5 — under Instagram's 1080px ideal, so an export
    # would have to upscale. 2K gives real headroom. Set to "1K" to trade quality for speed.
    gemini_image_size: str = "2K"

    # Prefer the business's OWN scraped photographs over a generated one. Photoreal
    # generated images of a product the business never shot are the exact case that
    # triggers "is this real?" suspicion, and suspicion taxes the real photos too.
    # Generation stays as the fallback when no usable photo is found.
    real_photo_first: bool = True

    # Session cookie hardening. None = derive from the web_origin scheme, so an
    # https deployment gets Secure cookies automatically and local http dev does not.
    cookie_secure: bool | None = None

    # See services/ratelimit._client_ip. True is correct behind the Next.js proxy;
    # set False if the API is reachable directly from the internet.
    trust_forwarded_for: bool = True

    # Rate limits (requests per window, seconds).
    auth_rate_limit: int = 8
    auth_rate_window_seconds: int = 300

    @field_validator("cookie_secure", mode="before")
    @classmethod
    def _blank_bool_is_none(cls, value: object) -> object:
        # `.env.example` ships `COOKIE_SECURE=` with the comment "leave blank to derive
        # from WEB_ORIGIN's scheme". An empty string is not a bool, and pydantic-settings
        # feeds the empty value through validation rather than falling back to the
        # default, so a verbatim copy of the example crashed the API at first request.
        # Treat blank as unset (None => derive) instead of failing to parse. Deployment
        # platforms that export `COOKIE_SECURE=""` hit the same path.
        if isinstance(value, str) and not value.strip():
            return None
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
