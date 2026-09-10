from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    gemini_api_key: str = ""
    jwt_secret: str = "dev-only-change-me"
    token_encryption_key: str = ""
    web_origin: str = "http://localhost:3000"
    api_origin: str = "http://localhost:8000"
    google_client_id: str = ""
    google_client_secret: str = ""
    meta_app_id: str = ""
    meta_app_secret: str = ""
    database_url: str = Field(default="sqlite:///./data/isramarket.db")

    gemini_strategy_model: str = "gemini-3.7-flash"
    gemini_lite_model: str = "gemini-3.5-flash-lite"
    gemini_image_model: str = "gemini-3.1-flash-lite-image"


@lru_cache
def get_settings() -> Settings:
    return Settings()
