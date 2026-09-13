"""Target audiences: the segment is defined once, planned for, carried by each post and measured.

Every route here is scoped to the caller's business. An audience id that belongs to
somebody else must 404 exactly like a missing one — anything else confirms which ids
exist and, through the rollup, would leak another business's segment names.

Post tagging lives here too, next to the segments it points at, and follows
`strategy._store_post_image` for loading, mutating and serialising the roadmap.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_business
from app.models import Audience, Business, Strategy
from app.routers.strategy import _active_strategy, serialize_strategy
from app.schemas import AudienceIn, AudienceUpdateIn, PostAudienceIn
from app.services.audiences import (
    MAX_AUDIENCES,
    PRIMARY,
    SECONDARY,
    propose_audiences,
    serialize_audience,
)
from app.services.jsonutil import dumps, loads

router = APIRouter(tags=["audiences"])

NOT_FOUND = "קהל היעד לא נמצא"


def _owned(db: Session, business: Business, audience_id: int) -> Audience:
    """Load an audience, but only if this business owns it. Otherwise 404, never 403."""
    audience = (
        db.query(Audience)
        .filter(Audience.id == audience_id, Audience.business_id == business.id)
        .first()
    )
    if not audience:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return audience


def _list(db: Session, business: Business) -> list[Audience]:
    return (
        db.query(Audience)
        .filter(Audience.business_id == business.id)
        .order_by(Audience.is_primary.desc(), Audience.created_at.asc(), Audience.id.asc())
        .all()
    )


def _stored(business: Business) -> dict:
    """Whatever the scan/wizard saved about this business, best-effort."""
    return loads(business.scraped_profile_json, {}) or {}


def _make_primary(db: Session, business: Business, audience: Audience) -> None:
    """Exactly one primary per business — enforced here, not in the UI.

    The previous primary is demoted on both fields so the label and the flag never
    disagree about who is primary.
    """
    others = db.query(Audience).filter(Audience.business_id == business.id).all()
    for other in others:
        if other.id == audience.id:
            continue
        if other.is_primary:
            other.is_primary = 0
            if (other.priority or "") == PRIMARY:
                other.priority = SECONDARY
    audience.is_primary = 1
    audience.priority = PRIMARY


def _has_primary(db: Session, business: Business) -> bool:
    return (
        db.query(Audience)
        .filter(Audience.business_id == business.id, Audience.is_primary == 1)
        .first()
        is not None
    )


def _detach_posts(
    db: Session, business: Business, mapping: dict[int, tuple[int, str] | None]
) -> int:
    """Re-point or clear audience references in every post of every stored strategy.

    Deleting a segment must not crash and must not leave a post pointing at an id that no
    longer exists: the post would then vanish from every rollup row instead of being
    counted as "לא משויך". Returns how many posts were touched.
    """
    changed = 0
    strategies = db.query(Strategy).filter(Strategy.business_id == business.id).all()
    for strategy in strategies:
        extra = loads(strategy.roadmap_json, {})
        if not isinstance(extra, dict):
            continue
        roadmap = extra.get("roadmap")
        if not isinstance(roadmap, dict):
            continue
        posts = roadmap.get("posts")
        if not isinstance(posts, list):
            continue
        touched = False
        for post in posts:
            if not isinstance(post, dict):
                continue
            try:
                current = int(post.get("audience_id"))
            except (TypeError, ValueError):
                continue
            if current not in mapping:
                continue
            replacement = mapping[current]
            if replacement is None:
                post["audience_id"] = None
                post["audience_name"] = ""
            else:
                post["audience_id"] = replacement[0]
                post["audience_name"] = replacement[1]
            changed += 1
            touched = True
        if touched:
            strategy.roadmap_json = dumps(extra)
    return changed


def _payload_for_prompt(business: Business, stored: dict) -> dict:
    return {
        "name": business.name,
        "business_type": business.business_type,
        "offerings": business.offerings,
        "location": business.location,
        "presence_type": business.presence_type,
        "business_model": business.business_model or "products",
        "primary_goal": business.primary_goal,
        "monthly_budget_ils": business.monthly_budget_ils,
        "growth_hypothesis": stored.get("growth_hypothesis") or "",
    }


# --- CRUD -------------------------------------------------------------------------


@router.get("/audiences")
def list_audiences(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    return {"audiences": [serialize_audience(audience) for audience in _list(db, business)]}


@router.post("/audiences/generate")
def generate_audiences(
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    """Propose 3-5 grounded segments with a real model call, replacing the generated set.

    Regeneration is idempotent in the only sense that matters to the owner: the previous
    *generated* set is replaced rather than piled up, and a segment they wrote themselves
    is never deleted. If they already had audiences, the response says so instead of
    quietly producing near-duplicates.
    """
    stored = _stored(business)
    if not (business.name or business.business_type or business.offerings):
        raise HTTPException(
            status_code=400,
            detail="אין מספיק פרטים על העסק כדי להציע קהלי יעד. השלימו את פרטי העסק קודם.",
        )

    existing = _list(db, business)
    manual = [audience for audience in existing if (audience.source or "") != "generated"]
    try:
        proposals = propose_audiences(
            _payload_for_prompt(business, stored),
            stored.get("brand_language") or {},
            stored.get("extracted") or {},
            stored.get("diagnostics"),
            loads(business.competitors_json, []) or [],
            existing=[serialize_audience(audience) for audience in manual],
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"יצירת קהלי היעד נכשלה: {exc}") from exc

    previous = [audience for audience in existing if (audience.source or "") == "generated"]
    # A generated name that comes back unchanged should keep pointing at its posts, so the
    # replacement is matched by name rather than leaving those posts untagged.
    removed = {audience.id: audience.name or "" for audience in previous}
    for audience in previous:
        db.delete(audience)
    db.flush()

    created: list[Audience] = []
    primary_index = next(
        (index for index, item in enumerate(proposals) if item.get("priority") == PRIMARY), 0
    )
    for index, item in enumerate(proposals[:MAX_AUDIENCES]):
        audience = Audience(
            business_id=business.id,
            name=item["name"],
            summary=item.get("summary") or "",
            description=item.get("description") or "",
            needs_json=dumps(item.get("needs") or []),
            where_json=dumps(item.get("where") or []),
            targeting_json=dumps(item.get("targeting") or {}),
            priority=PRIMARY if index == primary_index else SECONDARY,
            source="generated",
            is_primary=0,
        )
        db.add(audience)
        created.append(audience)
    db.flush()

    by_name = {item.name: item for item in created}
    remap = {
        old_id: ((by_name[old_name].id, by_name[old_name].name) if old_name in by_name else None)
        for old_id, old_name in removed.items()
    }
    detached = _detach_posts(db, business, remap) if remap else 0

    # The owner's own primary is an explicit choice; a regenerated set does not overrule it.
    kept_primary = _has_primary(db, business)
    if not kept_primary and created:
        _make_primary(db, business, created[min(primary_index, len(created) - 1)])
    elif kept_primary:
        # One "primary" label per business: the model's top pick keeps its order in the
        # list but not the label, which belongs to the owner's own choice.
        for audience in created:
            audience.priority = SECONDARY

    business.updated_at = datetime.utcnow()
    db.commit()
    for audience in created:
        db.refresh(audience)

    note = f"נוצרו {len(created)} קהלי יעד"
    if previous:
        note += f", והסט הקודם שנוצר אוטומטית ({len(previous)}) הוחלף"
    note += " — יצירה חוזרת לא יוצרת כפילויות."
    if manual:
        note += f" {len(manual)} קהלים שהוגדרו ידנית נשמרו ללא שינוי."
    if kept_primary:
        current = next((a for a in _list(db, business) if a.is_primary), None)
        if current is not None:
            note += f" הקהל הראשי נשאר '{current.name}'."
    elif created:
        current = next((a for a in _list(db, business) if a.is_primary), None)
        if current is not None:
            note += f" הקהל הראשי הוא '{current.name}'."

    return {
        "audiences": [serialize_audience(audience) for audience in _list(db, business)],
        "generated": len(created),
        "replaced": len(previous),
        "kept_manual": len(manual),
        "detached_posts": detached,
        "note": note,
    }


@router.post("/audiences")
def create_audience(
    body: AudienceIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="לקהל היעד חייב להיות שם.")
    audience = Audience(
        business_id=business.id,
        name=name,
        summary=body.summary.strip(),
        description=body.description.strip(),
        needs_json=dumps([item.strip() for item in body.needs if item and item.strip()]),
        where_json=dumps([item.strip() for item in body.where if item and item.strip()]),
        targeting_json=dumps(body.targeting.model_dump()),
        priority=body.priority,
        source="manual",
        is_primary=0,
    )
    db.add(audience)
    db.flush()
    # The first segment a business defines is its primary one: a plan with no primary has
    # no fallback for a post whose audience the model could not name.
    if body.priority == PRIMARY or not _has_primary(db, business):
        _make_primary(db, business, audience)
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(audience)
    return {"audience": serialize_audience(audience)}


@router.patch("/audiences/{audience_id}")
def update_audience(
    audience_id: int,
    body: AudienceUpdateIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    audience = _owned(db, business, audience_id)
    message = ""

    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="לקהל היעד חייב להיות שם.")
        audience.name = name
    if body.summary is not None:
        audience.summary = body.summary.strip()
    if body.description is not None:
        audience.description = body.description.strip()
    if body.needs is not None:
        audience.needs_json = dumps([item.strip() for item in body.needs if item and item.strip()])
    if body.where is not None:
        audience.where_json = dumps([item.strip() for item in body.where if item and item.strip()])
    if body.targeting is not None:
        audience.targeting_json = dumps(body.targeting.model_dump())
    if body.priority is not None:
        if body.priority == PRIMARY:
            _make_primary(db, business, audience)
        elif audience.is_primary:
            # Demoting the primary is allowed, but the business keeps a fallback: the role
            # moves to the next segment rather than leaving the plan with none. The only
            # audience a business has stays primary, and the response says so.
            remaining = [item for item in _list(db, business) if item.id != audience.id]
            if remaining:
                _make_primary(db, business, remaining[0])
            else:
                message = "זהו קהל היעד היחיד בעסק, ולכן הוא נשאר הקהל הראשי."

    # A rename must not leave posts showing a name that no longer exists anywhere.
    if body.name is not None:
        _detach_posts(db, business, {audience.id: (audience.id, audience.name)})

    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(audience)
    payload = {"audience": serialize_audience(audience)}
    if message:
        payload["message"] = message
    return payload


@router.delete("/audiences/{audience_id}")
def delete_audience(
    audience_id: int,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    audience = _owned(db, business, audience_id)
    was_primary = bool(audience.is_primary)
    name = audience.name or ""
    # Posts pointing at it are cleared, never left dangling: a post with a dead audience id
    # disappears from every rollup row, which reads as "no results" instead of "unassigned".
    detached = _detach_posts(db, business, {audience.id: None})
    db.delete(audience)
    db.flush()

    promoted = None
    if was_primary:
        remaining = _list(db, business)
        if remaining:
            promoted = remaining[0]
            _make_primary(db, business, promoted)

    business.updated_at = datetime.utcnow()
    db.commit()

    message = f"הקהל '{name}' נמחק."
    if detached:
        message += (
            f" {detached} פוסטים היו משויכים אליו והשיוך שלהם בוטל — "
            "הם יופיעו כ'לא משויך' עד שתשויכו אותם לקהל אחר."
        )
    if promoted is not None:
        message += f" '{promoted.name}' הוגדר כקהל הראשי."
    return {
        "ok": True,
        "detached_posts": detached,
        "promoted_audience": serialize_audience(promoted) if promoted is not None else None,
        "message": message,
    }


@router.post("/audiences/{audience_id}/primary")
def set_primary_audience(
    audience_id: int,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    audience = _owned(db, business, audience_id)
    _make_primary(db, business, audience)
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(audience)
    return {"audiences": [serialize_audience(item) for item in _list(db, business)]}


# --- carrying the audience on a post ------------------------------------------------


@router.post("/strategy/posts/audience")
def tag_post_audience(
    body: PostAudienceIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    """Tag one planned post with the audience it serves. `null` clears the tag."""
    strategy = _active_strategy(db, business)
    extra = loads(strategy.roadmap_json, {})
    roadmap = extra.get("roadmap") or {}
    posts = list(roadmap.get("posts") or [])
    if body.post_index >= len(posts):
        raise HTTPException(status_code=404, detail="הפוסט לא נמצא בתוכנית")

    target = posts[body.post_index]
    if body.audience_id is None:
        target["audience_id"] = None
        target["audience_name"] = ""
    else:
        audience = _owned(db, business, body.audience_id)
        target["audience_id"] = audience.id
        target["audience_name"] = audience.name or ""

    posts[body.post_index] = target
    extra["roadmap"] = {**roadmap, "posts": posts}
    strategy.roadmap_json = dumps(extra)
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(strategy)
    return {"post": target, "strategy": serialize_strategy(strategy, business)}
