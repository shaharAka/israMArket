from typing import Literal, TypedDict

from pydantic import BaseModel, EmailStr, Field, HttpUrl, model_validator

from app.services.business_model import goals_for


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


class DiagnosticsIn(BaseModel):
    """Answers that shape priorities, split by business model.

    Shop questions (customer club, repeat vs new) are meaningless for a designer, and
    lead-source questions are meaningless for a bakery, so which fields apply depends on
    `business_model` — see services/business_model.py.

    `has_customer_club` remains a prioritisation signal only — there is no loyalty/CRM
    integration and none is implied.
    """

    # Both / products
    has_customer_club: Literal["yes", "no", "unsure"] | None = None
    repeat_vs_new: Literal["mostly_repeat", "mostly_new", "balanced"] | None = None
    priority_channel: Literal["online", "physical", "balanced"] | None = None
    # Services / both
    lead_source: Literal["referrals", "social", "search", "mixed", "none"] | None = None
    has_portfolio: Literal["yes", "partial", "no"] | None = None
    brand_owner: Literal["personal", "studio", "unsure"] | None = None
    # Shared
    capacity_constraint: str = Field(default="", max_length=500)


class OnboardingIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    website_url: str = Field(default="", max_length=500)
    business_type: str = Field(min_length=2, max_length=120)
    offerings: str = Field(min_length=2, max_length=2000)
    location: str = Field(default="", max_length=255)
    presence_type: Literal["brick_and_mortar", "online_only", "hybrid"] = "brick_and_mortar"
    # Forks diagnostics, goals and the whole plan engine. Defaults to the historic
    # behaviour so older clients and pre-fork rows keep working.
    business_model: Literal["products", "services", "both"] = "products"
    social_links: dict[str, str] = Field(default_factory=dict)
    monthly_budget_ils: int = Field(ge=0, le=10_000_000)
    competitors: list[CompetitorIn] = Field(default_factory=list, max_length=5)
    primary_goal: Literal["sales", "brand_awareness", "leads", "personal_brand"]
    growth_hypothesis: str = Field(default="", max_length=2000)
    # A quarter with more than three priorities has none, so the cap is enforced at the
    # API boundary rather than trusted to the UI alone.
    growth_targets: list[str] = Field(default_factory=list, max_length=3)
    diagnostics: DiagnosticsIn | None = None
    # The quarterly plan the user reviewed and approved in step 5. Sent back on
    # confirmation so the month plan is built inside it rather than inventing a rival.
    long_horizon_plan: dict | None = None

    @model_validator(mode="after")
    def _goal_must_match_model(self) -> "OnboardingIn":
        """A purchase goal on a service business is a contradiction, and it would be
        passed straight to the planner. Rejected at the boundary rather than trusted to
        the UI, the same way the three-priority cap is."""
        allowed = goals_for(self.business_model)
        if self.primary_goal not in allowed:
            raise ValueError(
                f"המטרה '{self.primary_goal}' אינה מתאימה לעסק מסוג '{self.business_model}'. "
                f"אפשרויות: {', '.join(allowed)}"
            )
        return self


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


# --- Assets library ---------------------------------------------------------------
# The shape every /assets endpoint returns. `tags` is a real list here even though it
# is stored as JSON text, so the client never has to parse a column.
class AssetOut(TypedDict):
    id: int
    kind: str
    mime: str
    source: str
    source_url: str
    description: str
    tags: list[str]
    url: str
    width: int
    height: int
    created_at: str


class AssetSuggestion(TypedDict):
    asset_id: int
    reason: str


class AssetImportUrlIn(BaseModel):
    url: str = Field(min_length=8, max_length=1000)


class AssetUpdateIn(BaseModel):
    """Partial edit. `description=None` means "leave it", so an owner can retag an
    asset without wiping a description the vision model already wrote."""

    description: str | None = Field(default=None, max_length=2000)
    tags: list[str] | None = Field(default=None, max_length=30)


class PostAssetIn(BaseModel):
    post_index: int = Field(ge=0, le=50)
    asset_id: int = Field(ge=1)


class PostSuggestAssetsIn(BaseModel):
    post_index: int = Field(ge=0, le=50)


# --- Target audiences --------------------------------------------------------------
# The shape every /audiences endpoint returns. JSON columns (`needs`, `where`,
# `targeting`) come back as real lists and objects so no client has to parse a column.
class AudienceOut(TypedDict):
    id: int
    name: str
    summary: str
    description: str
    needs: list[str]
    where: list[str]
    targeting: dict
    priority: str
    source: str
    is_primary: bool
    created_at: str


class AudienceTargetingIn(BaseModel):
    """The advertising layer of a segment. Every field is optional on purpose: a small
    business often knows who its customers are without knowing an age range, and an
    invented range is worse than an empty one."""

    interests: list[str] = Field(default_factory=list, max_length=12)
    keywords: list[str] = Field(default_factory=list, max_length=12)
    age_range: str = Field(default="", max_length=40)
    gender: str = Field(default="", max_length=40)
    geo: str = Field(default="", max_length=120)


class AudienceIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    summary: str = Field(default="", max_length=300)
    description: str = Field(default="", max_length=2000)
    needs: list[str] = Field(default_factory=list, max_length=12)
    where: list[str] = Field(default_factory=list, max_length=12)
    targeting: AudienceTargetingIn = Field(default_factory=AudienceTargetingIn)
    priority: Literal["primary", "secondary"] = "secondary"


class AudienceUpdateIn(BaseModel):
    """Partial edit: `None` means "leave it", so renaming a segment never wipes the
    description or the targeting that came with it."""

    name: str | None = Field(default=None, min_length=1, max_length=160)
    summary: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=2000)
    needs: list[str] | None = Field(default=None, max_length=12)
    where: list[str] | None = Field(default=None, max_length=12)
    targeting: AudienceTargetingIn | None = None
    priority: Literal["primary", "secondary"] | None = None


class PostAudienceIn(BaseModel):
    post_index: int = Field(ge=0, le=50)
    # null clears the tag; the post then reports under "לא משויך" instead of being lost.
    audience_id: int | None = Field(default=None, ge=1)
