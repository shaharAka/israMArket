from typing import Literal

from pydantic import BaseModel, EmailStr, Field, HttpUrl


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=2, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=200)


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str


class CompetitorIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    website_url: str = Field(default="", max_length=500)


class OnboardingIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    website_url: str = Field(default="", max_length=500)
    business_type: str = Field(min_length=2, max_length=120)
    offerings: str = Field(min_length=2, max_length=2000)
    location: str = Field(default="", max_length=255)
    presence_type: Literal["brick_and_mortar", "online_only", "hybrid"] = "brick_and_mortar"
    social_links: dict[str, str] = Field(default_factory=dict)
    monthly_budget_ils: int = Field(ge=0, le=10_000_000)
    competitors: list[CompetitorIn] = Field(default_factory=list, max_length=5)
    primary_goal: Literal["sales", "brand_awareness"]
    growth_hypothesis: str = Field(default="", max_length=2000)
    growth_targets: list[str] = Field(default_factory=list)


class PostUpdateIn(BaseModel):
    post_index: int = Field(ge=0, le=50)
    title: str = Field(min_length=1, max_length=300)
    format: Literal["reel", "carousel", "image", "story"]
    hook: str = Field(default="", max_length=500)
    caption: str = Field(default="", max_length=4000)
    cta: str = Field(default="", max_length=500)
    overlay_text: str = Field(default="", max_length=200)
    date_hint: str = Field(default="", max_length=50)
    primary_outlet: Literal["instagram", "facebook", "whatsapp", "tiktok"] = "instagram"
    outlets: list[str] = Field(default_factory=lambda: ["instagram", "facebook"])
    has_overlay: bool = True
    overlay_headline: str = Field(default="", max_length=200)
    overlay_badge: str = Field(default="", max_length=100)
    overlay_theme: str = Field(default="ink_pill", max_length=40)
    creative_concept: str = Field(default="", max_length=1000)
    visual_style: str = Field(default="", max_length=500)
    image_prompt: str = Field(default="", max_length=4000)


class PostDesignIn(BaseModel):
    post_index: int = Field(ge=0, le=50)
    vibe: str = Field(default="", max_length=120)
    custom_prompt: str = Field(default="", max_length=1000)
    generate_image: bool = True


class PostRewriteIn(BaseModel):
    post_index: int = Field(ge=0, le=50)
    tone: Literal["direct", "neighborhood", "punchy", "holiday", "story"]


class PostApprovalIn(BaseModel):
    post_index: int = Field(ge=0, le=50)
    approved: bool = True


class StrategyApproveIn(BaseModel):
    approved: bool = True
    monthly_notes: str = Field(default="", max_length=2000)


class BrandSwatchIn(BaseModel):
    # Length alone let "#zzz" through. The palette drives every card colour,
    # so reject anything that is not a real hex before it reaches the renderer.
    hex: str = Field(pattern=r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
    role: Literal["primary", "accent", "background", "ink", "secondary"]
    name: str = Field(min_length=1, max_length=80)


class TypographyIn(BaseModel):
    primary: str = Field(min_length=1, max_length=200)
    mood: str = Field(min_length=1, max_length=400)


class BrandLanguageIn(BaseModel):
    business_name: str = Field(min_length=1, max_length=160)
    palette: list[BrandSwatchIn] = Field(min_length=1, max_length=8)
    typography: TypographyIn
    visual_style: str = Field(min_length=4, max_length=800)
    photography: str = Field(min_length=4, max_length=800)
    voice: str = Field(min_length=4, max_length=800)
    voice_examples: list[str] = Field(min_length=1, max_length=8)
    do_say: list[str] = Field(min_length=1, max_length=16)
    dont_say: list[str] = Field(min_length=1, max_length=16)
    messaging: list[str] = Field(min_length=1, max_length=12)
    offers_seen: list[str] = Field(default_factory=list, max_length=16)
    audience: str = Field(min_length=2, max_length=400)
    logo_description: str = Field(default="", max_length=400)


class PaletteIn(BaseModel):
    """Palette-only edit. Deliberately narrower than BrandLanguageIn, which requires a
    dozen fields a business owner has no way to supply."""

    palette: list[BrandSwatchIn] = Field(min_length=1, max_length=8)


class WebsiteScanIn(BaseModel):
    website_url: str = Field(min_length=8, max_length=500)


class PostImageIn(BaseModel):
    post_index: int = Field(ge=0, le=50)
    force: bool = False
    # Explicit user request ("create an image") = True. Automatic preparation while
    # browsing = False, so merely clicking through the plan can never spend money.
    allow_generation: bool = True
    # Which source the user wants. "auto" prefers their own photo and falls back to
    # generation; "real" never spends a generation; "ai" always generates.
    image_preference: Literal["auto", "real", "ai"] = "auto"
    vibe: str = Field(default="", max_length=120)
    custom_prompt: str = Field(default="", max_length=1000)


class PostPublishIn(BaseModel):
    post_index: int = Field(ge=0, le=50)
    published_url: str = Field(min_length=8, max_length=800)


class WebhookIn(BaseModel):
    url: HttpUrl
    events: str = "recommendations,strategy"


class Ga4PropertyIn(BaseModel):
    property_id: str = Field(min_length=3, max_length=40)
    display_name: str = Field(default="", max_length=160)


class MetaAccountIn(BaseModel):
    page_id: str = Field(min_length=3, max_length=40)
    instagram_id: str = Field(default="", max_length=40)
    ad_account_id: str = Field(default="", max_length=40)
    display_name: str = Field(default="", max_length=160)
