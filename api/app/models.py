from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    businesses: Mapped[list["Business"]] = relationship(back_populates="owner")


class Business(Base):
    __tablename__ = "businesses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    website_url: Mapped[str] = mapped_column(String(500), default="")
    business_type: Mapped[str] = mapped_column(String(120), default="")
    offerings: Mapped[str] = mapped_column(Text, default="")
    location: Mapped[str] = mapped_column(String(255), default="")
    presence_type: Mapped[str] = mapped_column(String(40), default="brick_and_mortar")
    # "products" | "services" | "both". This forks the diagnostics, the goals and the
    # whole plan engine, so it earns a real column rather than another key in the
    # scraped-profile blob. Existing rows default to "products" (see migrate_db).
    business_model: Mapped[str] = mapped_column(String(20), default="products")
    social_links_json: Mapped[str] = mapped_column(Text, default="{}")
    monthly_budget_ils: Mapped[int] = mapped_column(Integer, default=0)
    competitors_json: Mapped[str] = mapped_column(Text, default="[]")
    primary_goal: Mapped[str] = mapped_column(String(40), default="")
    scraped_profile_json: Mapped[str] = mapped_column(Text, default="")
    generate_state_json: Mapped[str] = mapped_column(Text, default="")
    onboarding_complete: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner: Mapped[User] = relationship(back_populates="businesses")
    strategies: Mapped[list["Strategy"]] = relationship(back_populates="business")
    integrations: Mapped[list["Integration"]] = relationship(back_populates="business")
    snapshots: Mapped[list["PerformanceSnapshot"]] = relationship(back_populates="business")
    recommendations: Mapped[list["Recommendation"]] = relationship(back_populates="business")
    webhooks: Mapped[list["WebhookEndpoint"]] = relationship(back_populates="business")
    assets: Mapped[list["Asset"]] = relationship(back_populates="business")
    audiences: Mapped[list["Audience"]] = relationship(back_populates="business")


class Strategy(Base):
    __tablename__ = "strategies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    year: Mapped[int] = mapped_column(Integer)
    month: Mapped[int] = mapped_column(Integer)
    usp_json: Mapped[str] = mapped_column(Text, default="")
    calendar_json: Mapped[str] = mapped_column(Text, default="")
    roadmap_json: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    business: Mapped[Business] = relationship(back_populates="strategies")

    __table_args__ = (UniqueConstraint("business_id", "year", "month", name="uq_strategy_month"),)


class Integration(Base):
    __tablename__ = "integrations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    provider: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(40), default="pending")
    external_id: Mapped[str] = mapped_column(String(255), default="")
    display_name: Mapped[str] = mapped_column(String(255), default="")
    access_token_enc: Mapped[str] = mapped_column(Text, default="")
    refresh_token_enc: Mapped[str] = mapped_column(Text, default="")
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    extra_json: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    business: Mapped[Business] = relationship(back_populates="integrations")

    __table_args__ = (UniqueConstraint("business_id", "provider", name="uq_integration_provider"),)


class WebhookDelivery(Base):
    """One row per delivery attempt, so a failing endpoint is diagnosable."""

    __tablename__ = "webhook_deliveries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    endpoint_id: Mapped[int] = mapped_column(ForeignKey("webhook_endpoints.id"), index=True)
    event: Mapped[str] = mapped_column(String(60), default="")
    url: Mapped[str] = mapped_column(String(800), default="")
    ok: Mapped[int] = mapped_column(Integer, default=0)
    status_code: Mapped[int] = mapped_column(Integer, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=1)
    error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PerformanceSnapshot(Base):
    __tablename__ = "performance_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    period_start: Mapped[str] = mapped_column(String(20))
    period_end: Mapped[str] = mapped_column(String(20))
    ga4_json: Mapped[str] = mapped_column(Text, default="")
    meta_json: Mapped[str] = mapped_column(Text, default="")
    diagnostic_json: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    business: Mapped[Business] = relationship(back_populates="snapshots")


class Recommendation(Base):
    __tablename__ = "recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    week_of: Mapped[str] = mapped_column(String(20))
    suggestions_json: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    business: Mapped[Business] = relationship(back_populates="recommendations")


class Asset(Base):
    """A photo or short video the business supplied, ready to be matched to a post.

    Files live in the same per-business media folder as generated cards — so the
    existing auth-gated /media/{business_id}/{filename} route serves them unchanged —
    and are prefixed `asset-` so a card and a source photo are distinguishable on disk.
    """

    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    # "image" | "video"
    kind: Mapped[str] = mapped_column(String(20), default="image")
    mime: Mapped[str] = mapped_column(String(120), default="")
    # "upload" | "url" | "site"
    source: Mapped[str] = mapped_column(String(20), default="upload")
    source_url: Mapped[str] = mapped_column(String(1000), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    tags_json: Mapped[str] = mapped_column(Text, default="[]")
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    business: Mapped[Business] = relationship(back_populates="assets")


class Audience(Base):
    """One audience segment the business defines once and reuses everywhere.

    A plan that never names *who* it is for produces content addressed to nobody, and a
    post that cannot say who it targets cannot be measured per audience. So the segment
    lives here — with the shape a shop needs (buyer segments) and a service business
    needs (client types) — and each planned post carries `audience_id`/`audience_name`
    into the roadmap JSON, where the per-post GA4/Meta attribution already lives.

    `is_primary` is an int because SQLite has no boolean and existing tables use 0/1;
    exactly one row per business may carry it (enforced by the router).
    """

    __tablename__ = "audiences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    # One line the owner reads in a list; `description` carries the longer reasoning.
    summary: Mapped[str] = mapped_column(String(500), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    # JSON lists: what they want / why they buy, and where they spend time or how they
    # find the business. Stored as text, parsed in services/audiences.py.
    needs_json: Mapped[str] = mapped_column(Text, default="[]")
    where_json: Mapped[str] = mapped_column(Text, default="[]")
    # JSON object: interests, keyword themes, age range, gender, geo.
    targeting_json: Mapped[str] = mapped_column(Text, default="{}")
    # "primary" | "secondary" — the label. `is_primary` is the enforced single flag.
    priority: Mapped[str] = mapped_column(String(20), default="secondary")
    # "generated" | "manual". Regeneration replaces the generated set and never a manual.
    source: Mapped[str] = mapped_column(String(20), default="manual")
    is_primary: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    business: Mapped[Business] = relationship(back_populates="audiences")


class WebhookEndpoint(Base):
    __tablename__ = "webhook_endpoints"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    url: Mapped[str] = mapped_column(String(800))
    secret: Mapped[str] = mapped_column(String(255))
    events: Mapped[str] = mapped_column(String(255), default="recommendations,strategy")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    business: Mapped[Business] = relationship(back_populates="webhooks")
