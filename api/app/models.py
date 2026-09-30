from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, delete, event, select
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    # "" for an account opened with Google that never set a password (the column predates
    # Google sign-in and is NOT NULL in existing SQLite files, so empty stands in for NULL).
    # An empty hash never verifies: see security.verify_password.
    password_hash: Mapped[str] = mapped_column(String(255), default="")
    full_name: Mapped[str] = mapped_column(String(255))
    # Google's stable account id (the ID token's `sub`), set on the first "להמשיך עם Google".
    # Sign-in matches on it first, so a later change of the Google address still finds the
    # account. Unique; NULL for password-only accounts. See routers/auth.google_callback.
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    # Sessions carry this number (the token's `ep`); raising it signs out every session
    # issued before. Raised when a password changes and when a Google identity takes over
    # an email-only account (routers/auth._google_user).
    session_epoch: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # The free first month (docs/onboarding-v2.md, Revision 7 B). Account-level, not
    # per business: the trial is what the owner signed up for, and a second business does
    # not restart it. Set at signup (and by from-draft for older accounts); NULL on rows
    # from before the trial existed, which /trial reads as "started when the account did".
    trial_started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # When the first-entry welcome was seen or skipped. Server-side so a second device or
    # a cleared browser does not show it again.
    welcomed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # What the journey cannot read from other rows: when the plan and the results were
    # last opened. {"plan_seen_at": iso, "plan_last_seen_at": iso, ...}. See routers/trial.py.
    trial_events_json: Mapped[str] = mapped_column(Text, default="{}")

    businesses: Mapped[list["Business"]] = relationship(back_populates="owner")

    @property
    def has_password(self) -> bool:
        return bool(self.password_hash)

    @property
    def google_linked(self) -> bool:
        return bool(self.google_sub)


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
    # Up to five other Instagram usernames (competitors or peers) whose public posts feed
    # the monthly inspiration brief via Business Discovery. Normalised in
    # services/instagram_signal.normalize_handles: no "@", lowercase, IG charset.
    instagram_handles_json: Mapped[str] = mapped_column(Text, default="[]")
    primary_goal: Mapped[str] = mapped_column(String(40), default="")
    scraped_profile_json: Mapped[str] = mapped_column(Text, default="")
    generate_state_json: Mapped[str] = mapped_column(Text, default="")
    onboarding_complete: Mapped[int] = mapped_column(Integer, default=0)
    # The WhatsApp tracked link (services/whatsapp.py). E.164 with the plus, e.g.
    # "+972501234567"; NULL until the owner sets it. The default text is what the customer's
    # message starts with — every link appends its own short source code to it.
    whatsapp_number_e164: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    whatsapp_default_text_he: Mapped[str] = mapped_column(Text, default="")
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


class InstagramPost(Base):
    """One of the business's own Instagram posts, with the latest numbers Meta gave us.

    Upserted on every performance sync (keyed by Meta's media id), so ranking can look
    across more than the last 20 posts and a post keeps its numbers after it scrolls out
    of the sync window. A metric Meta did not return is NULL — never 0 — and the reason
    is in `metric_errors_json`.
    """

    __tablename__ = "instagram_posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    media_id: Mapped[str] = mapped_column(String(64))
    caption: Mapped[str] = mapped_column(Text, default="")
    # IMAGE | VIDEO | CAROUSEL_ALBUM
    media_type: Mapped[str] = mapped_column(String(40), default="")
    # FEED | REELS | STORY | AD ("" when Meta did not say)
    media_product_type: Mapped[str] = mapped_column(String(40), default="")
    permalink: Mapped[str] = mapped_column(String(500), default="")
    media_url: Mapped[str] = mapped_column(Text, default="")
    thumbnail_url: Mapped[str] = mapped_column(Text, default="")
    posted_at: Mapped[str] = mapped_column(String(40), default="")
    like_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    comments_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    views: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reach: Mapped[int | None] = mapped_column(Integer, nullable=True)
    saved: Mapped[int | None] = mapped_column(Integer, nullable=True)
    shares: Mapped[int | None] = mapped_column(Integer, nullable=True)
    metric_errors_json: Mapped[str] = mapped_column(Text, default="{}")
    synced_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("business_id", "media_id", name="uq_instagram_post_media"),)


class InspirationBrief(Base):
    """The monthly pattern brief distilled from own-top and competitor-top posts.

    `brief_json` is the model's output (see INSPIRATION_BRIEF_SCHEMA); `sources_json` is
    exactly what it was given — own posts, competitor posts and per-handle errors — so
    every pattern it cites can be traced back to a real post.
    """

    __tablename__ = "inspiration_briefs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    year: Mapped[int] = mapped_column(Integer)
    month: Mapped[int] = mapped_column(Integer)
    brief_json: Mapped[str] = mapped_column(Text, default="{}")
    sources_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("business_id", "year", "month", name="uq_inspiration_brief_month"),)


class HashtagQuery(Base):
    """One Hashtag Search lookup, kept to respect Meta's 30-unique-tags-per-7-days cap.

    The cap is per Instagram account, so rows are keyed by `instagram_id` (the connected
    IG user), not only by business.
    """

    __tablename__ = "hashtag_queries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    instagram_id: Mapped[str] = mapped_column(String(64), index=True)
    hashtag: Mapped[str] = mapped_column(String(120))
    hashtag_id: Mapped[str] = mapped_column(String(64), default="")
    queried_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


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


class ResearchRun(Base):
    """One run of the ongoing research engine for one business (services/research.py).

    `findings_json` is everything the sources returned, each finding sourced and dated;
    `insights_json` is what the strategy model concluded from exactly those findings
    (every insight cites finding ids that exist in the same row); `sources_json` is the
    per-source status — ok / empty / not connected / error — with what would unlock it.
    Kept per run rather than upserted, so the next run can diff competitor sites and
    search phrases against the previous one, and the history shows what changed when.
    """

    __tablename__ = "research_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    # ISO week the run belongs to, e.g. "2026-W39" (the weekly job runs once per week).
    period: Mapped[str] = mapped_column(String(20), default="")
    # "manual" (the owner pressed the button; rate-limited) | "scheduled" (weekly job).
    trigger: Mapped[str] = mapped_column(String(20), default="manual")
    # "done" | "insights_failed" (findings stored, the model call failed or was skipped).
    status: Mapped[str] = mapped_column(String(30), default="done")
    findings_json: Mapped[str] = mapped_column(Text, default="{}")
    insights_json: Mapped[str] = mapped_column(Text, default="[]")
    sources_json: Mapped[str] = mapped_column(Text, default="{}")
    model: Mapped[str] = mapped_column(String(80), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class WhatsappLink(Base):
    """One short tracked link, /r/{code}, that redirects to wa.me with a prefilled message.

    One row per (business, source): the Instagram bio, a story, the Google card, or one
    post. `source_key` is what the owner's results group by; the code is what goes out in
    public. The message text is resolved at redirect time (the link's own text, else the
    business default), so editing the default updates every link already posted.
    """

    __tablename__ = "whatsapp_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    # e.g. "default", "ig-bio", "story", "gbp", "ig-post-202610-3"
    source_key: Mapped[str] = mapped_column(String(64))
    label_he: Mapped[str] = mapped_column(String(255), default="")
    # Empty = use the business's default text.
    prefilled_text_he: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("business_id", "source_key", name="uq_whatsapp_link_source"),)


class WhatsappClick(Base):
    """A daily counter of clicks on one link, split by a coarse device bucket.

    Deliberately not an event log: no IP address, no full user agent, no timestamp finer
    than the day and nothing that identifies who clicked. Preview crawlers and bots are
    never counted (services/whatsapp.is_bot). `business_id` is carried so account
    deletion (services/account_deletion.py) removes these rows with the business.
    """

    __tablename__ = "whatsapp_clicks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    link_id: Mapped[int] = mapped_column(ForeignKey("whatsapp_links.id"), index=True)
    # Israel's calendar day, "YYYY-MM-DD".
    day: Mapped[str] = mapped_column(String(10))
    # "instagram" | "facebook" | "ios" | "android" | "desktop" | "other"
    ua_family: Mapped[str] = mapped_column(String(20), default="other")
    count: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (UniqueConstraint("link_id", "day", "ua_family", name="uq_whatsapp_click_bucket"),)


class GenerationJob(Base):
    """The month being built for one business, in the background (services/generation_jobs.py).

    One row per business (the unique constraint is the "one job per business" guard): the
    row is claimed with a compare-and-set on `status`/`heartbeat_at`, so a double click, a
    second tab or a second API process never starts a second writer. The month's own
    progress stays in `Business.generate_state_json` (the stage machine in
    services/strategy.py); this row says who is running it, since when, and how it ended.
    """

    __tablename__ = "generation_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), unique=True, index=True)
    # "first_month" (/onboarding/generate) | "next_month" (/strategy/next-month).
    kind: Mapped[str] = mapped_column(String(20), default="first_month")
    # "running" | "failed" | "done".
    status: Mapped[str] = mapped_column(String(20), default="running")
    # Changes on every claim; a worker whose token is no longer the row's stops writing.
    token: Mapped[str] = mapped_column(String(40), default="")
    year: Mapped[int] = mapped_column(Integer, default=0)
    month: Mapped[int] = mapped_column(Integer, default=0)
    # Shown to the owner when the job stopped; the raw error is kept in `error_detail`.
    error_he: Mapped[str] = mapped_column(Text, default="")
    error_detail: Mapped[str] = mapped_column(Text, default="")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # The last time a stage finished (or the job started): what "updated" means to the owner.
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # Ticked every few seconds by the process running the job, also mid-stage. A running
    # job whose heartbeat went quiet belongs to a process that is gone, and is resumed.
    heartbeat_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)


# --- ids that come back ---------------------------------------------------------------
#
# SQLite hands out the highest free rowid again (these tables have no AUTOINCREMENT), so a
# business or a user created after a deletion can get a deleted one's id. Anything still
# keyed by that id — a month a background build wrote while the account was being deleted,
# or a row from before services/account_deletion.py existed — would silently become the
# new owner's: an old plan, an old token. A row that was just inserted has no children by
# definition, so whatever already points at its id is a leftover, and goes (children
# first). services/account_deletion.py also sweeps rows whose parent is gone.


def business_scoped_tables():
    """Every table keyed by `business_id`, children before parents (businesses excluded)."""
    return [t for t in reversed(Base.metadata.sorted_tables) if t.name != "businesses" and "business_id" in t.c]


def user_scoped_tables():
    """Every table keyed by `user_id`, children before parents (users excluded)."""
    return [t for t in reversed(Base.metadata.sorted_tables) if t.name != "users" and "user_id" in t.c]


def purge_business_rows(connection, business_ids) -> dict[str, int]:
    """Delete every row keyed by these business ids (not the businesses themselves)."""
    ids = list(business_ids)
    counts: dict[str, int] = {}
    if not ids:
        return counts
    endpoints = WebhookEndpoint.__table__
    deliveries = WebhookDelivery.__table__
    result = connection.execute(
        delete(deliveries).where(
            deliveries.c.endpoint_id.in_(select(endpoints.c.id).where(endpoints.c.business_id.in_(ids)))
        )
    )
    counts["webhook_deliveries"] = result.rowcount or 0
    for table in business_scoped_tables():
        result = connection.execute(delete(table).where(table.c.business_id.in_(ids)))
        counts[table.name] = result.rowcount or 0
    return counts


@event.listens_for(Business, "after_insert")
def _new_business_starts_clean(mapper, connection, target) -> None:  # noqa: ARG001
    purge_business_rows(connection, [target.id])


@event.listens_for(User, "after_insert")
def _new_user_starts_clean(mapper, connection, target) -> None:  # noqa: ARG001
    businesses = Business.__table__
    stale = [row[0] for row in connection.execute(select(businesses.c.id).where(businesses.c.user_id == target.id))]
    purge_business_rows(connection, stale)
    for table in user_scoped_tables():  # `businesses` is one of these, after its children
        connection.execute(delete(table).where(table.c.user_id == target.id))
