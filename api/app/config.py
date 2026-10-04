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
    # The public base every Google redirect URI is built on. In the documented deployment
    # only the web tier is reachable from the internet and it proxies /backend/* to the
    # API, so Google must send the browser back through it: that is also what puts the
    # session cookie on the origin the owner is actually on. Empty = WEB_ORIGIN + /backend,
    # giving {WEB_ORIGIN}/backend/auth/google/callback (sign-in) and
    # {WEB_ORIGIN}/backend/integrations/ga4/callback (Analytics + Search Console). Each must
    # be registered exactly on the OAuth client; see deploy/gcp/google-oauth.md.
    # Not PUBLIC_BASE_URL: that may be a short-link domain that forwards only /r/{code}.
    oauth_redirect_base: str = ""
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
    # Where generated cards, uploaded photos, logos and scan captures live (one folder per
    # business). Empty = api/data/generated. Tests point it at a throwaway folder
    # (tests/_test_env.py) so a run never touches a developer's real media.
    media_dir: str = ""

    gemini_strategy_model: str = "gemini-3.8-flash"
    gemini_lite_model: str = "gemini-3.5-flash-lite"
    # Reading a business off its site: the brand (colours, logo, voice), the site profile
    # and the public preview's sample post. The lite model obeyed "palette from the CSS"
    # literally and returned Wix's navy defaults for a beige-and-pink shop, and copied the
    # meta description into the sample caption. Cheap checks (photo usability) stay lite.
    gemini_extract_model: str = "gemini-3.8-flash"
    # Images (docs/image-models.md, docs/design-dna.md "Model routing"). Muse Image makes
    # both new images and edits of the owner's real photos ($0.01 each); when it refuses
    # (e.g. lingerie generation), errors or times out, Nano Banana 2 takes over. Switch
    # either task to "gemini" to skip Muse. Never a `-contributor` Meta model.
    image_generate_provider: str = "muse"
    image_edit_provider: str = "muse"
    muse_image_model: str = "muse-image-1.0"
    # Muse took up to 41 s in the bench; past this the fallback runs instead.
    muse_image_timeout_seconds: float = 45.0
    # The Gemini model a Muse failure falls back to. Empty = no fallback (the error shows).
    image_fallback_model: str = "gemini-3.1-flash-image"
    # The Gemini image model when a task's provider is "gemini". Nano Banana 2 matched Pro
    # in the bench at half the price; "gemini-3-pro-image" stays selectable as the "best"
    # option. "gemini-2.5-flash-image" is retired and is read as Nano Banana 2.
    gemini_image_model: str = "gemini-3.1-flash-image"
    # 1K is 928x1152 for 4:5 (Instagram upscales ~1.17x). "2K" if owners see softness.
    gemini_image_size: str = "1K"

    # Design DNA (services/design_dna.py): the model that writes each business's DNA, and
    # whether it is (re)built in the background after a site scan and at signup.
    design_dna_model: str = "gemini-3.8-flash"
    design_dna_on_scan: bool = True
    # Download the business's logo (brand_language.logo_url) after a scan, signup or brand
    # save and keep a normalised same-origin copy (services/brand_logo.py).
    brand_logo_copy: bool = True
    # One cheap vision call per post photo: where the subject is and where text may sit
    # (services/photo_analysis.py, cached per image hash). Empty model = DESIGN_DNA_MODEL.
    photo_analysis: bool = True
    photo_analysis_model: str = ""

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

    # Subscription billing through PayPal (services/paypal.py, routers/billing.py,
    # docs/billing.md). Blank credentials = "not configured": /billing says payment is not
    # open yet and nothing is enforced. The client id is public (the browser's PayPal
    # buttons need it); the secret and the webhook id never leave the API.
    # "sandbox" (api-m.sandbox.paypal.com) | "live" (api-m.paypal.com).
    paypal_env: str = "sandbox"
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    # The monthly plan, created once by `python -m app.jobs.paypal_setup`. Not secret.
    paypal_plan_id: str = ""
    # From developer.paypal.com > the app > Webhooks. Needed to verify every webhook.
    paypal_webhook_id: str = ""
    # Off by default. When on (and PayPal is configured), AI generation answers 402 once
    # the free month plus a short grace has passed without a paid-through subscription.
    # Viewing, editing, exporting, the account and deletion are never gated.
    billing_enforce: bool = False

    @field_validator("gemini_image_model", "image_fallback_model", mode="before")
    @classmethod
    def _retired_image_model(cls, value: object) -> object:
        # Deprecated by Google and worst in the bench on every criterion that matters
        # (docs/image-models.md). An old .env that still names it gets Nano Banana 2.
        if isinstance(value, str) and value.strip() == "gemini-2.5-flash-image":
            return "gemini-3.1-flash-image"
        return value

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

    def oauth_callback_base(self) -> str:
        """See `oauth_redirect_base`."""
        return (self.oauth_redirect_base.strip() or f"{self.web_origin}/backend").rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()
