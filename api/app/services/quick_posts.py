"""Owner-authored drafts use the existing editor, without inventing a marketing plan.

The SQLite write lock is taken before reading the array, matching image_jobs.save_post.
Request IDs live on the saved post, so a lost response can be retried safely.
"""
from datetime import date
from hashlib import sha256

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import Business, Strategy
from app.services import connected_posts, content_language
from app.services.jsonutil import dumps, loads

WORKSPACE_ONLY = "post_workspace_only"


def workspace_only(strategy: Strategy | None) -> bool:
    return bool(strategy and loads(strategy.roadmap_json, {}).get(WORKSPACE_ONLY))


def merge_generated_posts(existing: list, generated: list, business_id: int, year: int, month: int) -> list:
    """A new plan cannot delete drafts or change indices already used by the editor.

    Historic plan replacement is unchanged until there is an owner-created draft.
    Once there is one, retain the whole existing array and append new planned posts.
    """
    if not any(isinstance(p, dict) and p.get("creation_source") == "quick" for p in existing):
        return generated
    connected_posts.ensure_uids(existing, business_id, year, month)
    ids = {p.get("uid") for p in existing if isinstance(p, dict)}
    return [*existing, *[p for p in generated if not isinstance(p, dict) or not p.get("uid") or p["uid"] not in ids]]


def create(db: Session, business: Business, request) -> tuple[Strategy, int]:
    # Serializes initial workspace creation as well as appending to an existing month.
    table = Business.__table__
    db.execute(update(table).where(table.c.id == business.id).values(id=table.c.id))
    today = date.today()
    query = db.query(Strategy).filter(Strategy.business_id == business.id)
    strategy = (query.filter(Strategy.year == today.year, Strategy.month == today.month).first()
                or query.order_by(Strategy.year.desc(), Strategy.month.desc()).first())
    if strategy:
        db.execute(update(Strategy).where(Strategy.id == strategy.id).values(id=Strategy.id))
        db.refresh(strategy)
    else:
        strategy = Strategy(business_id=business.id, year=today.year, month=today.month,
                            usp_json="{}", calendar_json="[]",
                            roadmap_json=dumps({WORKSPACE_ONLY: True, "roadmap": {"posts": []}}))
        db.add(strategy)
        db.flush()
    extra = loads(strategy.roadmap_json, {})
    roadmap = extra.get("roadmap") or {}
    posts = list(roadmap.get("posts") or [])
    request_id = str(request.client_ref)
    fingerprint = sha256(dumps(request.model_dump(mode="json")).encode()).hexdigest()
    for index, post in enumerate(posts):
        if isinstance(post, dict) and post.get("create_request_id") == request_id:
            if post.get("create_request_hash") != fingerprint:
                raise HTTPException(409, {"code": "draft_already_saved", "detail_he": "טיוטה זו כבר נשמרה. פתחו אותה כדי לערוך את הטקסט."})
            db.commit()
            return strategy, index
    if len(posts) >= 51:
        raise HTTPException(409, "החודש כבר כולל 51 פוסטים. אפשר לערוך פוסט קיים.")
    stored = loads(business.scraped_profile_json, {})
    language = request.content_language or content_language.preferences(stored)["default_language"]
    post = {"uid": connected_posts.new_uid(), "creation_source": "quick",
            "create_request_id": request_id, "create_request_hash": fingerprint,
            "owner_brief": request.text, "content_language": language,
            "week": 0, "date_hint": "", "format": "image",
            "title": request.title or request.text.strip().splitlines()[0][:300],
            "caption": request.text, "hook": "", "cta": "", "angle": "",
            "calendar_tie": "", "goal_fit": "", "primary_outlet": request.destination,
            "channel": request.destination, "outlets": [request.destination],
            "outlet_captions": {request.destination: request.text},
            "has_overlay": False, "approval_status": "review", "image_source": "pending"}
    connected_posts.ensure_uids(posts, business.id, strategy.year, strategy.month)
    posts.append(post)
    extra["roadmap"] = {**roadmap, "posts": posts}
    strategy.roadmap_json = dumps(extra)
    db.commit()
    return strategy, len(posts) - 1
