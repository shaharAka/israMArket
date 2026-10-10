"""Owner-scoped campaign revisions: read never creates media."""
from typing import Literal, Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_business
from app.models import Business, CampaignRevision
from app.routers.strategy import _active_strategy, serialize_strategy
from app.services.strategy_writes import lock_and_refresh
from app.services import campaign_revisions as revisions

router = APIRouter(prefix="/campaign", tags=["campaign"])


class VideoOptions(BaseModel):
    asset_id: int | None = Field(default=None, gt=0)
    start: float = Field(default=0, ge=0, le=180, allow_inf_nan=False)
    end: float | None = Field(default=None, gt=0, le=180, allow_inf_nan=False)
    overlay_headline: str | None = Field(default=None, max_length=90)
    overlay_png: str = Field(default="", max_length=4_000_000)


class RevisionIn(BaseModel):
    request_id: str = Field(min_length=16, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    post_uids: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(min_length=1, max_length=3)
    kind: Literal["text", "layout", "image", "video", "video_edit", "finish"]
    instruction: str = Field(default="", max_length=200)
    options: VideoOptions = Field(default_factory=VideoOptions)


@router.get("/revisions")
def list_revisions(business: Business = Depends(get_business), db: Session = Depends(get_db)):
    strategy = _active_strategy(db, business)
    rows = db.query(CampaignRevision).filter_by(business_id=business.id, strategy_id=strategy.id).order_by(
        CampaignRevision.created_at.desc()).limit(20).all()
    return {"revisions": [revisions.view(r) for r in rows]}


@router.post("/revisions", status_code=202)
def create_revision(body: RevisionIn, tasks: BackgroundTasks, business: Business = Depends(get_business), db: Session = Depends(get_db)):
    if len(set(body.post_uids)) != len(body.post_uids):
        raise HTTPException(422, "בחרו כל פוסט פעם אחת.")
    strategy = _active_strategy(db, business)
    row, created = revisions.create(db, business, strategy, request_id=body.request_id, uids=body.post_uids,
                                   kind=body.kind, instruction=body.instruction.strip(), options=body.options.model_dump())
    if created:
        tasks.add_task(revisions.run, db.get_bind(), row.id)
    return revisions.view(row)


@router.get("/revisions/{revision_id}")
def get_revision(revision_id: str, business: Business = Depends(get_business), db: Session = Depends(get_db)):
    return revisions.view(revisions.owned(db, business, revision_id))


@router.post("/revisions/{revision_id}/{action}")
def choose_revision(revision_id: str, action: Literal["keep", "undo", "discard"],
                    business: Business = Depends(get_business), db: Session = Depends(get_db)):
    row = revisions.owned(db, business, revision_id)
    if action == "discard":
        strategy = _active_strategy(db, business)
        lock_and_refresh(db, strategy)
        db.refresh(row)
        if row.state not in {"ready", "failed"}:
            raise HTTPException(409, "הגרסה הזו כבר השתנתה. רעננו כדי לראות את המצב הנוכחי.")
        row.state = "discarded"
        db.commit()
        return {"revision": revisions.view(row)}
    strategy = revisions.apply(db, business, row, action)
    return {"revision": revisions.view(row), "strategy": serialize_strategy(strategy, business)}
