"""Which weeks of a stored month have their posts (onboarding-v2.md, Revision 8).

After signup the first month is built as a structure only (weeks, focus, content mix,
budget lines, KPI); its posts are written later, per week, once the owner has chosen what
to feature (`POST /onboarding/posts/start`). Each week of a month is therefore:

    "pending"  no posts yet, nothing asked
    "running"  asked for; the background job writes it (or will, after the week before)
    "done"     its posts are in the month
    "error"    writing it failed twice; asking again retries it

Kept in the Strategy row (`roadmap_json["posts_status"]`, keys "1".."4"). A month stored
before this existed has no such key: a week with posts is "done", one without "pending".
"""

from __future__ import annotations

from app.models import Strategy
from app.services.jsonutil import dumps, loads

WEEKS = (1, 2, 3, 4)
STATES = ("pending", "running", "done", "error")


def _extra(strategy: Strategy) -> dict:
    return loads(strategy.roadmap_json, {}) or {}


def month_posts(strategy: Strategy) -> list[dict]:
    return list(((_extra(strategy).get("roadmap") or {}).get("posts")) or [])


def posts_status(strategy: Strategy | None) -> dict[str, str]:
    if strategy is None:
        return {str(week): "pending" for week in WEEKS}
    extra = _extra(strategy)
    stored = extra.get("posts_status")
    posts = ((extra.get("roadmap") or {}).get("posts")) or []
    with_posts = {int(post.get("week") or 0) for post in posts if isinstance(post, dict)}
    status = {}
    for week in WEEKS:
        value = (stored or {}).get(str(week)) if isinstance(stored, dict) else None
        if value not in STATES:
            value = "done" if week in with_posts else "pending"
        status[str(week)] = value
    return status


def save_posts_status(strategy: Strategy, status: dict[str, str]) -> None:
    extra = _extra(strategy)
    extra["posts_status"] = {str(week): status.get(str(week), "pending") for week in WEEKS}
    strategy.roadmap_json = dumps(extra)


def queue_weeks(strategy: Strategy, weeks: list[int] | None) -> list[int]:
    """Mark the asked weeks (all when None) that are not done as "running". Returns them."""
    status = posts_status(strategy)
    asked = [week for week in (weeks or list(WEEKS)) if week in WEEKS]
    queued = [week for week in asked if status[str(week)] != "done"]
    for week in queued:
        status[str(week)] = "running"
    save_posts_status(strategy, status)
    return queued


def next_queued(strategy: Strategy) -> int | None:
    status = posts_status(strategy)
    for week in WEEKS:
        if status[str(week)] == "running":
            return week
    return None


def add_week_posts(strategy: Strategy, week: int, posts: list[dict], dna: dict | None = None) -> None:
    """Append the week's posts (never reorder: posts are addressed by index) and mark it done.

    The new posts get their design from the business's DNA (`dna`), rotating on from the
    posts already in the month, so neighbours never share a composition."""
    from app.services.connected_posts import ensure_uids  # avoids an import cycle
    from app.services.post_design import assign_designs

    extra = _extra(strategy)
    roadmap = dict(extra.get("roadmap") or {})
    existing = list(roadmap.get("posts") or [])
    # Posts written before uids get theirs stored now (the same id every read gave them).
    ensure_uids(existing, strategy.business_id, strategy.year, strategy.month)
    roadmap["posts"] = existing + list(posts)
    if dna is not None:
        assign_designs(roadmap["posts"], dna)
    extra["roadmap"] = roadmap
    strategy.roadmap_json = dumps(extra)
    status = posts_status(strategy)
    status[str(week)] = "done"
    save_posts_status(strategy, status)


def stop_queue(strategy: Strategy, failed_week: int | None) -> None:
    """The job stopped: the failing week is "error", the rest it did not reach "pending"."""
    status = posts_status(strategy)
    for week in WEEKS:
        if status[str(week)] == "running":
            status[str(week)] = "error" if week == failed_week else "pending"
    save_posts_status(strategy, status)
