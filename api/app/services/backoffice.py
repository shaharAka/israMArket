"""What the backoffice shows about each account, read from rows that already exist.

Nothing here is stored for the backoffice except `users.last_seen_at`; the stage, the
connections, the post counts and the costs are derived on every read, so they can never
disagree with the account itself.

What it deliberately leaves out: post texts, captions, plans, photos, research, anything
read from Google or Facebook, tokens, password hashes and Google ids. The owner sees the
business's name and site, how far the account got, whether its connections work, what it
cost, and its billing state; enough to run the service, not to read the customer's work.

**Stages** (in order): signup → business details → a plan → the first post approved →
the first post published → the first post measured. Each has `reached_at` when a stored
timestamp says when (a post's `approved_at` / `published_at` / `results.updated_at`, the
first month's row); a later stage implies the earlier ones even when their moment is not
recorded (a post published without the approve step). "Time in stage" is now minus the
current stage's `reached_at`.

**Connections**, per provider (`ga4` = Google, `meta` = Facebook and Instagram): `none`,
`connected` (access granted, no usable read yet), `usable` (a dated read returned data),
`attention` (the owner has to act: reconnect, choose the site or page, permission, an
Instagram not linked, the last read failed). From the same readiness states the owner's
connections page shows (services/ga4_readiness.py, services/meta_readiness.py).

**Costs** per calendar month (UTC), estimated: images from `image_usage`, text models
from `model_usage` (services/model_usage.py), in USD at list prices.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    AdminAudit,
    Business,
    ImageUsage,
    Integration,
    ModelUsage,
    PasswordResetToken,
    Strategy,
    Subscription,
    User,
)
from app.services import billing, connected_posts, ga4_readiness, meta_readiness
from app.services.jsonutil import loads

log = logging.getLogger(__name__)

STAGES = ("signup", "business", "plan", "approved", "published", "measured")
PROVIDERS = {"google": "ga4", "meta": "meta"}
LIFECYCLES = ("needs_owner", "ready", "approved", "published", "measured")

USABLE = {"ready", "partial"}
CONNECTED_NO_DATA = {"unchecked", "reading", "empty"}
COST_MONTHS = 4  # this month and the 3 before it


def iso(value: datetime | None) -> str | None:
    return value.replace(microsecond=0).isoformat() + "Z" if value else None


def _time(value) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed


def _earliest(values) -> datetime | None:
    times = [value for value in values if value is not None]
    return min(times) if times else None


# --- posts ------------------------------------------------------------------------------


def _posts_of(strategy: Strategy) -> list[dict]:
    extra = loads(strategy.roadmap_json, {}) if strategy.roadmap_json else {}
    roadmap = extra.get("roadmap") if isinstance(extra, dict) else None
    posts = roadmap.get("posts") if isinstance(roadmap, dict) else None
    return [post for post in posts if isinstance(post, dict)] if isinstance(posts, list) else []


def _lifecycle(post: dict) -> str:
    try:
        return connected_posts.lifecycle(post)
    except Exception:  # a malformed old post must not break the backoffice
        return "ready"


def post_facts(strategies: list[Strategy]) -> dict:
    """Counts by lifecycle across every month, and when each post milestone first happened."""
    counts = {key: 0 for key in LIFECYCLES}
    approved_at, published_at, measured_at = [], [], []
    any_approved = any_published = any_measured = False
    total = 0
    for strategy in strategies:
        for post in _posts_of(strategy):
            total += 1
            stage = _lifecycle(post)
            counts[stage] = counts.get(stage, 0) + 1
            if stage in {"approved", "published", "measured"}:
                any_approved = True
                approved_at.append(_time(post.get("approved_at")))
            if stage in {"published", "measured"}:
                any_published = True
                published_at.append(_time(post.get("published_at")))
            if stage == "measured":
                any_measured = True
                results = post.get("results") if isinstance(post.get("results"), dict) else {}
                measured_at.append(_time(results.get("updated_at")))
    return {
        "total": total,
        "months": len(strategies),
        "by_lifecycle": counts,
        "approved": (any_approved, _earliest(approved_at)),
        "published": (any_published, _earliest(published_at)),
        "measured": (any_measured, _earliest(measured_at)),
    }


# --- stage --------------------------------------------------------------------------------


def timeline(user: User, business: Business | None, strategies: list[Strategy], posts: dict) -> list[dict]:
    stored = loads(business.scraped_profile_json, {}) if business and business.scraped_profile_json else {}
    has_quarter_plan = isinstance(stored, dict) and isinstance(stored.get("quarter_plan"), dict) and bool(stored.get("quarter_plan"))
    first_month = min((s.created_at for s in strategies if s.created_at), default=None)
    reached = {
        "signup": (True, user.created_at),
        "business": (business is not None, business.created_at if business else None),
        # A /start business has its 3-month plan from signup; older ones from the first month.
        "plan": (bool(strategies) or has_quarter_plan, first_month or (business.created_at if has_quarter_plan and business else None)),
        "approved": posts["approved"],
        "published": posts["published"],
        "measured": posts["measured"],
    }
    # A later stage implies every earlier one (a post marked published without approving).
    furthest = max(index for index, key in enumerate(STAGES) if reached[key][0])
    return [
        {"key": key, "reached": index <= furthest, "reached_at": iso(reached[key][1]) if index <= furthest else None}
        for index, key in enumerate(STAGES)
    ]


def current_stage(steps: list[dict], now: datetime) -> dict:
    current = [step for step in steps if step["reached"]][-1]
    since = _time(current["reached_at"])
    return {
        "key": current["key"],
        "since": current["reached_at"],
        "days_in_stage": max(0, (now - since).days) if since else None,
    }


# --- connections ----------------------------------------------------------------------------


def connection(item: Integration | None) -> dict:
    if item is None or (item.status == "pending" and not item.access_token_enc):
        return {"state": "none", "status": None, "checked_at": None, "last_success_at": None}
    try:
        readiness = ga4_readiness.public_state(item) if item.provider == "ga4" else meta_readiness.public_state(item)
    except Exception:
        log.debug("backoffice: readiness of integration %s unreadable", item.id, exc_info=True)
        readiness = {"status": "unavailable"}
    status = str(readiness.get("status") or "")
    if item.status == "reconnect":
        state = "attention"
    elif status in USABLE:
        state = "usable"
    elif status in CONNECTED_NO_DATA:
        state = "connected"
    else:
        state = "attention"
    return {
        "state": state,
        # The readiness word only (ready, reconnect, choose_property…): no ids, no notes.
        "status": status or None,
        "checked_at": readiness.get("checked_at"),
        "last_success_at": readiness.get("last_success_at"),
    }


def connections_for(integrations: list[Integration]) -> dict:
    by_provider = {item.provider: item for item in integrations}
    return {name: connection(by_provider.get(provider)) for name, provider in PROVIDERS.items()}


# --- costs ------------------------------------------------------------------------------------


def month_keys(now: datetime, count: int = COST_MONTHS) -> list[str]:
    keys, year, month = [], now.year, now.month
    for _ in range(count):
        keys.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return keys


def _month_start(key: str) -> datetime:
    year, month = key.split("-")
    return datetime(int(year), int(month), 1)


def costs_by_business(db: Session, business_ids: list[int], now: datetime) -> dict[int, dict[str, dict]]:
    """{business_id: {"2026-10": {"images_usd", "image_calls", "models_usd", "model_calls"}}}."""
    out: dict[int, dict[str, dict]] = defaultdict(lambda: defaultdict(lambda: {
        "images_usd": 0.0, "image_calls": 0, "models_usd": 0.0, "model_calls": 0}))
    if not business_ids:
        return out
    since = _month_start(month_keys(now)[-1])
    for model, cost_key, count_key in ((ImageUsage, "images_usd", "image_calls"), (ModelUsage, "models_usd", "model_calls")):
        month = func.strftime("%Y-%m", model.created_at)
        rows = (
            db.query(model.business_id, month, func.coalesce(func.sum(model.est_cost_usd), 0.0), func.count(model.id))
            .filter(model.business_id.in_(business_ids), model.created_at >= since)
            .group_by(model.business_id, month)
            .all()
        )
        for business_id, key, cost, calls in rows:
            cell = out[business_id][key]
            cell[cost_key] += float(cost or 0.0)
            cell[count_key] += int(calls or 0)
    return out


def costs_for(business_ids: list[int], costs: dict[int, dict[str, dict]], now: datetime) -> list[dict]:
    months = []
    for key in month_keys(now):
        images = sum(costs.get(bid, {}).get(key, {}).get("images_usd", 0.0) for bid in business_ids)
        models = sum(costs.get(bid, {}).get(key, {}).get("models_usd", 0.0) for bid in business_ids)
        months.append({
            "month": key,
            "images_usd": round(images, 4),
            "image_calls": sum(costs.get(bid, {}).get(key, {}).get("image_calls", 0) for bid in business_ids),
            "models_usd": round(models, 4),
            "model_calls": sum(costs.get(bid, {}).get(key, {}).get("model_calls", 0) for bid in business_ids),
            "total_usd": round(images + models, 4),
        })
    return months


# --- billing ----------------------------------------------------------------------------------


def billing_for(db: Session, user: User, sub: Subscription | None, now: datetime) -> dict:
    end = billing.trial_end(db, user)
    return {
        "state": billing.state_of(sub, end, now),
        "exempt": bool(user.billing_exempt),
        "trial_ends_at": iso(end),
        "days_left": billing.days_left(end, now),
        "subscription_status": sub.status if sub else None,
    }


# --- accounts ---------------------------------------------------------------------------------


class Snapshot:
    """Everything the list needs, loaded in a fixed number of queries for all accounts."""

    def __init__(self, db: Session, users: list[User], now: datetime):
        self.db, self.now = db, now
        ids = [user.id for user in users]
        self.businesses: dict[int, list[Business]] = defaultdict(list)
        for business in db.query(Business).filter(Business.user_id.in_(ids)).order_by(Business.id.desc()).all():
            self.businesses[business.user_id].append(business)
        business_ids = [b.id for group in self.businesses.values() for b in group]
        self.strategies: dict[int, list[Strategy]] = defaultdict(list)
        self.integrations: dict[int, list[Integration]] = defaultdict(list)
        if business_ids:
            for strategy in db.query(Strategy).filter(Strategy.business_id.in_(business_ids)).all():
                self.strategies[strategy.business_id].append(strategy)
            for item in db.query(Integration).filter(Integration.business_id.in_(business_ids)).all():
                self.integrations[item.business_id].append(item)
        self.subscriptions = {sub.user_id: sub for sub in db.query(Subscription).filter(Subscription.user_id.in_(ids)).all()}
        self.costs = costs_by_business(db, business_ids, now)
        self.admins = get_settings().admin_email_set()

    def row(self, user: User) -> dict:
        businesses = self.businesses.get(user.id, [])
        business = businesses[0] if businesses else None  # the newest: what the app is scoped to
        strategies = self.strategies.get(business.id, []) if business else []
        posts = post_facts(strategies)
        steps = timeline(user, business, strategies, posts)
        costs = costs_for([b.id for b in businesses], self.costs, self.now)
        return {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name or "",
            "created_at": iso(user.created_at),
            "last_seen_at": iso(user.last_seen_at),
            "google_linked": bool(user.google_sub),
            "has_password": bool(user.password_hash),
            "is_admin": (user.email or "").lower() in self.admins,
            "suspended": user.suspended_at is not None,
            "business": {"id": business.id, "name": business.name or ""} if business else None,
            "stage": current_stage(steps, self.now),
            "connections": connections_for(self.integrations.get(business.id, []) if business else []),
            "billing": billing_for(self.db, user, self.subscriptions.get(user.id), self.now),
            "cost_this_month_usd": costs[0]["total_usd"],
        }

    def detail(self, user: User) -> dict:
        row = self.row(user)
        businesses = self.businesses.get(user.id, [])
        business = businesses[0] if businesses else None
        strategies = self.strategies.get(business.id, []) if business else []
        posts = post_facts(strategies)
        reset = (
            self.db.query(PasswordResetToken)
            .filter(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.used_at.is_(None),
                PasswordResetToken.revoked_at.is_(None),
                PasswordResetToken.expires_at > self.now,
            )
            .order_by(PasswordResetToken.id.desc())
            .first()
        )
        row.update({
            "suspended_at": iso(user.suspended_at),
            "suspended_reason": user.suspended_reason or "",
            "businesses": [
                {
                    "id": b.id,
                    "name": b.name or "",
                    "website_url": b.website_url or "",
                    "created_at": iso(b.created_at),
                }
                for b in businesses
            ],
            "timeline": timeline(user, business, strategies, posts),
            "posts": {"total": posts["total"], "months": posts["months"], "by_lifecycle": posts["by_lifecycle"]},
            "costs": costs_for([b.id for b in businesses], self.costs, self.now),
            # Whether an unused link is out there, and until when. Never the link.
            "reset_link_expires_at": iso(reset.expires_at) if reset else None,
            "audit": audit_entries(self.db, target_user_id=user.id, not_before=user.created_at, limit=20),
        })
        return row


STATUS_FILTERS = {"active", "suspended", "free", "trial", "trial_ended", "paying", "payment_failed"}


def _matches_status(row: dict, status: str) -> bool:
    billing_state = row["billing"]["state"]
    return {
        "active": not row["suspended"],
        "suspended": row["suspended"],
        "free": row["billing"]["exempt"],
        "trial": billing_state == "trial" and not row["billing"]["exempt"],
        "trial_ended": billing_state == "trial_ended" and not row["billing"]["exempt"],
        "paying": billing_state in {"active", "cancelled"},
        "payment_failed": billing_state == "payment_failed",
    }.get(status, True)


def list_accounts(db: Session, *, q: str = "", stage: str = "", status: str = "", sort: str = "last_active",
                  now: datetime | None = None) -> list[dict]:
    now = now or datetime.utcnow()
    users = db.query(User).all()
    snapshot = Snapshot(db, users, now)
    needle = (q or "").strip().lower()
    rows = []
    for user in users:
        if needle:
            names = [user.email or "", user.full_name or ""] + [b.name or "" for b in snapshot.businesses.get(user.id, [])]
            if not any(needle in name.lower() for name in names):
                continue
        row = snapshot.row(user)
        if stage in STAGES and row["stage"]["key"] != stage:
            continue
        if status in STATUS_FILTERS and not _matches_status(row, status):
            continue
        rows.append(row)
    if sort == "created":
        rows.sort(key=lambda r: (r["created_at"] or "", r["id"]), reverse=True)
    else:
        # Most recently active first; never-seen accounts last, newest of them first.
        rows.sort(key=lambda r: (r["last_seen_at"] is not None, r["last_seen_at"] or "", r["created_at"] or ""), reverse=True)
    return rows


def account_detail(db: Session, user: User, now: datetime | None = None) -> dict:
    return Snapshot(db, [user], now or datetime.utcnow()).detail(user)


# --- audit ------------------------------------------------------------------------------------


def audit_entries(db: Session, *, target_user_id: int | None = None, not_before: datetime | None = None,
                  limit: int = 100, before_id: int | None = None) -> list[dict]:
    query = db.query(AdminAudit)
    if target_user_id is not None:
        query = query.filter(AdminAudit.target_user_id == target_user_id)
    if not_before is not None:
        query = query.filter(AdminAudit.created_at >= not_before)
    if before_id:
        query = query.filter(AdminAudit.id < before_id)
    entries = query.order_by(AdminAudit.id.desc()).limit(max(1, min(limit, 200))).all()
    ids = {e.admin_user_id for e in entries} | {e.target_user_id for e in entries if e.target_user_id}
    users = {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()} if ids else {}

    def label(user_id: int | None, at: datetime) -> str | None:
        user = users.get(user_id) if user_id else None
        # SQLite reuses ids: an account opened after the entry is not the one it is about.
        if user is None or (user.created_at and at and user.created_at > at):
            return None
        return user.email

    return [
        {
            "id": e.id,
            "action": e.action,
            "admin_user_id": e.admin_user_id,
            "admin_email": label(e.admin_user_id, e.created_at),
            "target_user_id": e.target_user_id,
            "target_email": label(e.target_user_id, e.created_at),
            "details": loads(e.details_json, {}) or {},
            "created_at": iso(e.created_at),
        }
        for e in entries
    ]
