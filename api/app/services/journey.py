"""What the owner has actually done, read once from real rows — the one source that both
the setup checklist (`/setup`) and the free month's journey (`/trial`) are computed from.

The two lists ask different questions — "what is still missing in the account" and "what
is the next step of the first month" — but they must never disagree about a fact: the
checklist cannot say Instagram is connected while the journey asks to connect it. So
neither router reads the database for these facts itself; both read `Facts`.

The rules the setup checklist was built on apply to every field here:

* **Never guess.** A blank string, an empty container or a missing key is not done.
* **No business is not an error.** `load(db, None)` returns facts where nothing is done.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Asset, Audience, Business, Integration, PerformanceSnapshot, ResearchRun, Strategy

# The only status that means "this account is wired up". `pending`, `select_property`
# and `select_page` are all mid-OAuth states where nothing can be read or published yet.
CONNECTED = "connected"


def filled(value) -> bool:
    """Whether a stored value actually carries something.

    Blank strings and empty containers do not count. The wizard saves models as-is, so an
    untouched field arrives as `None`, `""` or `[]` — treating any of those as an answer
    would mark the item done for a business that answered nothing.
    """
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return bool(value)


def has_answers(diagnostics) -> bool:
    """At least one diagnostic field that was actually answered."""
    if not isinstance(diagnostics, dict):
        return False
    return any(filled(value) for value in diagnostics.values())


def ranked_targets(value) -> list[str]:
    """The ranked growth targets, blank entries dropped."""
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def all_approved(posts: list[dict]) -> bool:
    """Every post approved — and there has to be at least one post to approve.

    An empty strategy is not "all approved", and a post without `approval_status` was
    never approved either: the approval endpoint is the only thing that writes that value.
    """
    return bool(posts) and all(item.get("approval_status") == "approved" for item in posts)


def is_published(post: dict) -> bool:
    """A post the owner marked as published ("פרסמתי"). The link is optional: the publish
    endpoint always writes `published_at`, and a pasted URL only adds Instagram matching."""
    return filled(post.get("published_url")) or filled(post.get("published_at"))


def parse_time(value) -> datetime | None:
    """An ISO timestamp we wrote ourselves, or None. Never raises."""
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed


@dataclass
class Facts:
    business: Business | None = None
    stored: dict = field(default_factory=dict)
    audiences: bool = False
    asset_count: int = 0
    connected: set[str] = field(default_factory=set)
    # When each connected provider was last written (the connect callback's update).
    connected_at: dict[str, datetime] = field(default_factory=dict)
    # When the library reached three photos (the journey's "a few photos" step).
    third_asset_at: datetime | None = None
    # The posts of the strategy the rest of the app treats as current (`_active_strategy`).
    posts: list[dict] = field(default_factory=list)
    has_month: bool = False
    # That month's plan (the roadmap without its posts) and its stored hypothesis review
    # (docs/posts-v2.md, Phase C: services/hypotheses.py). Empty without a month.
    month_core: dict = field(default_factory=dict)
    hypothesis_review: dict = field(default_factory=dict)
    # How many months exist, and the first one — "month 2 is built" is a second row.
    month_count: int = 0
    first_month: tuple[int, int] | None = None
    second_month_at: datetime | None = None
    research_count: int = 0
    first_research_at: datetime | None = None
    # The first synced numbers from a connected source ("המדידה עובדת").
    first_snapshot_at: datetime | None = None

    # --- derived ------------------------------------------------------------------

    @property
    def brand_scanned(self) -> bool:
        return filled(self.stored.get("brand_language"))

    @property
    def diagnostics(self) -> bool:
        return has_answers(self.stored.get("diagnostics"))

    @property
    def targets(self) -> list[str]:
        return ranked_targets(self.stored.get("growth_targets"))

    @property
    def long_horizon(self) -> bool:
        return filled(self.stored.get("long_horizon_plan"))

    @property
    def quarter_plan(self) -> dict | None:
        plan = self.stored.get("quarter_plan")
        return plan if isinstance(plan, dict) and plan else None

    @property
    def integrations_checklist(self) -> list[dict]:
        items = self.stored.get("integrations_checklist")
        return [item for item in items if isinstance(item, dict)] if isinstance(items, list) else []

    @property
    def website(self) -> str:
        return (self.business.website_url or "").strip() if self.business else ""

    @property
    def baseline(self) -> dict:
        value = self.stored.get("baseline")
        return value if isinstance(value, dict) else {}

    @property
    def featured_items(self) -> list[dict]:
        raw = self.stored.get("featured_items")
        items = raw.get("items") if isinstance(raw, dict) else None
        return [item for item in items if isinstance(item, dict) and item.get("name")] if isinstance(items, list) else []

    @property
    def voice_check(self) -> dict | None:
        value = self.stored.get("voice_check")
        return value if isinstance(value, dict) and value.get("at") else None

    @property
    def approved_posts(self) -> list[dict]:
        return [post for post in self.posts if post.get("approval_status") == "approved"]

    @property
    def all_approved(self) -> bool:
        return all_approved(self.posts)

    @property
    def published_posts(self) -> list[dict]:
        return [post for post in self.posts if is_published(post)]

    @property
    def first_published_at(self) -> datetime | None:
        times = [parse_time(post.get("published_at")) for post in self.published_posts]
        times = [value for value in times if value]
        return min(times) if times else None


def _active_month(db: Session, business: Business) -> tuple[bool, list[dict], dict, dict]:
    """The posts of the month `/posts` and `/performance` treat as current, with its plan
    (the roadmap without the posts) and its stored hypothesis review.

    Resolved through the same `_active_strategy` helper those routes use, so the lists
    can never point at a page that disagrees with them. "No month yet" is simply no posts.
    """
    from app.routers.strategy import _active_strategy  # the routers import this module
    from app.services.jsonutil import loads

    try:
        strategy = _active_strategy(db, business)
    except HTTPException:
        return False, [], {}, {}
    extra = loads(strategy.roadmap_json, {})
    if not isinstance(extra, dict):
        return True, [], {}, {}
    review = extra.get("hypothesis_review") if isinstance(extra.get("hypothesis_review"), dict) else {}
    roadmap = extra.get("roadmap")
    core = {key: value for key, value in roadmap.items() if key != "posts"} if isinstance(roadmap, dict) else {}
    raw = roadmap.get("posts") if isinstance(roadmap, dict) else None
    if not isinstance(raw, list):
        return True, [], core, review
    # Only well-formed post objects count. A malformed entry must not be able to make the
    # month look approved or published.
    return True, [item for item in raw if isinstance(item, dict)], core, review


def load(db: Session, business: Business | None) -> Facts:
    """Every fact both lists need, for one business (or none)."""
    if business is None:
        return Facts()
    from app.services.jsonutil import loads

    stored = loads(business.scraped_profile_json, {}) if business.scraped_profile_json else {}
    connected_rows = (
        db.query(Integration.provider, Integration.updated_at)
        .filter(Integration.business_id == business.id, Integration.status == CONNECTED)
        .all()
    )
    asset_times = [
        row[0]
        for row in db.query(Asset.created_at)
        .filter(Asset.business_id == business.id)
        .order_by(Asset.created_at.asc(), Asset.id.asc())
        .limit(3)
        .all()
    ]
    months = (
        db.query(Strategy.year, Strategy.month, Strategy.created_at)
        .filter(Strategy.business_id == business.id)
        .order_by(Strategy.year.asc(), Strategy.month.asc())
        .all()
    )
    first_run = (
        db.query(ResearchRun.created_at)
        .filter(ResearchRun.business_id == business.id)
        .order_by(ResearchRun.created_at.asc())
        .first()
    )
    first_snapshot = (
        db.query(PerformanceSnapshot.created_at)
        .filter(PerformanceSnapshot.business_id == business.id)
        .order_by(PerformanceSnapshot.created_at.asc())
        .first()
    )
    has_month, posts, month_core, review = _active_month(db, business)
    return Facts(
        business=business,
        stored=stored if isinstance(stored, dict) else {},
        audiences=db.query(Audience.id).filter(Audience.business_id == business.id).first() is not None,
        asset_count=db.query(Asset.id).filter(Asset.business_id == business.id).count(),
        connected={row[0] for row in connected_rows},
        connected_at={row[0]: row[1] for row in connected_rows if row[1]},
        third_asset_at=asset_times[2] if len(asset_times) >= 3 else None,
        posts=posts,
        has_month=has_month,
        month_core=month_core,
        hypothesis_review=review,
        month_count=len(months),
        first_month=(months[0][0], months[0][1]) if months else None,
        second_month_at=months[1][2] if len(months) >= 2 else None,
        research_count=db.query(ResearchRun.id).filter(ResearchRun.business_id == business.id).count(),
        first_research_at=first_run[0] if first_run else None,
        first_snapshot_at=first_snapshot[0] if first_snapshot else None,
    )
