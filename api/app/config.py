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
    # Graph API version for every Meta call (OAuth dialog included). v25.0 is supported
    # until July 2028 per Meta's version table; bump here, not in code.
    meta_graph_version: str = "v25.0"
    # Hashtag Search needs the "Instagram Public Content Access" feature (Advanced Access
    # via app review) and is capped by Meta at 30 unique hashtags per 7 days per IG
    # account. Off until the app is approved.
    instagram_hashtag_search: bool = False
    database_url: str = Field(default="sqlite:///./data/isramarket.db")

    gemini_strategy_model: str = "gemini-3.8-flash"
    gemini_lite_model: str = "gemini-3.5-flash-lite"
    # Reading a business off its site: the brand (colours, logo, voice), the site profile
    # and the public preview's sample post. The lite model obeyed "palette from the CSS"
    # literally and returned Wix's navy defaults for a beige-and-pink shop, and copied the
    # meta description into the sample caption. Cheap checks (photo usability) stay lite.
    gemini_extract_model: str = "gemini-3.8-flash"
    gemini_image_model: str = "gemini-3-pro-image"
    # 1K returns ~928px wide for 4:5 — under Instagram's 1080px ideal, so an export
    # would have to upscale. 2K gives real headroom. Set to "1K" to trade quality for speed.
    gemini_image_size: str = "2K"

    # Prefer the business's OWN scraped photographs over a generated one. Photoreal
    # generated images of a product the business never shot are the exact case that
    # triggers "is this real?" suspicion, and suspicion taxes the real photos too.
    # Generation stays as the fallback when no usable photo is found.
    real_photo_first: bool = True

    # Headless Chrome for one rendered screenshot of the site during a brand scan — the
    # best single signal of what the customer actually sees. Empty = look for Chrome in
    # the usual places; if none is found the screenshot is skipped silently. Chrome is
    # routed through a local netguard proxy, so every hop it makes is SSRF-checked.
    site_screenshot: bool = True
    chrome_path: str = ""
    # Containers running as a user without namespaces need Chrome's sandbox off.
    chrome_no_sandbox: bool = False
    # Wall-clock cap for the whole Chrome run (launch, load, capture).
    screenshot_timeout_seconds: float = 14.0

    # Session cookie hardening. None = derive from the web_origin scheme, so an
    # https deployment gets Secure cookies automatically and local http dev does not.
    cookie_secure: bool | None = None

    # See services/ratelimit._client_ip. True is correct behind the Next.js proxy;
    # set False if the API is reachable directly from the internet.
    trust_forwarded_for: bool = True

    # Stream H experiment: Meta's Muse Spark as an alternative post writer. Off unless
    # POST_MODEL=muse-spark. Never point META_POST_MODEL at a `-contributor` model —
    # services/meta_model.py refuses them, because their inputs train Meta's products.
    meta_model_api_key: str = ""
    meta_model_base_url: str = "https://api.meta.ai/v1"
    meta_post_model: str = "muse-spark-1.3"
    # "gemini" (default) | "muse-spark". See services/post_model_router.py.
    post_model: str = "gemini"
    # With POST_MODEL=muse-spark, fall back to Gemini when the Meta call fails, so an
    # experiment can never leave a user without posts.
    post_model_fallback: bool = True
    # The most one Meta post-writing call may take (retries included) before the posts
    # are written by Gemini instead. Muse writes a week of posts in ~80-110 s, so the
    # budget sits above that; it exists so a hung or crawling call can never stall a
    # month. 0 = no budget (the client's own 180 s read timeout, retried once).
    post_model_timeout_seconds: float = 180.0
    # Wall-clock limit for one Gemini request, so a call that never answers fails (and
    # is retried or reported) instead of holding a month's build forever. 0 = none.
    gemini_timeout_seconds: float = 180.0

    # The origin printed in front of every WhatsApp tracked link: {PUBLIC_BASE_URL}/r/{code}.
    # Empty = WEB_ORIGIN, because in the documented deployment only the web tier is public
    # and it forwards /r/{code} to the API (web/app/r/[code]/route.ts); API_ORIGIN is an
    # internal address there. Set it when links should live on a different short domain.
    public_base_url: str = ""
    # Counted clicks per link per minute. Past this the redirect still works, it just is
    # not counted — a stuck refresh loop or a scraper cannot inflate the owner's numbers.
    whatsapp_clicks_per_minute: int = 30

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
