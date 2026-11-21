from fastapi import APIRouter, Depends
from pydantic import BaseModel, UUID4, constr
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import default_business, get_current_user
from app.models import Business, User
from app.services.jsonutil import loads

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


class WorkspaceIn(BaseModel):
    name: constr(strip_whitespace=True, min_length=2, max_length=100)
    request_id: UUID4


def _brief(business: Business, default_id: int | None = None) -> dict:
    profile = loads(business.scraped_profile_json, {}) or {}
    return {
        "id": business.id,
        "scope_required": bool(business.workspace_key or business.id != default_id),
        "name": business.name,
        "ready": bool(business.onboarding_complete or profile.get("quarter_plan")),
    }


@router.get("")
def workspaces(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    choices = db.query(Business).filter(Business.user_id == user.id).order_by(Business.id).all()
    explicit = vars(user).get("_request_workspace_id")
    fallback = default_business(db, user)
    default_id = fallback.id if fallback else None
    active_id = default_id if explicit is None else explicit
    return {
        "active_id": active_id if any(choice.id == active_id for choice in choices) else None,
        "workspaces": [_brief(choice, default_id) for choice in choices],
    }


@router.post("", status_code=201)
def create_workspace(
    body: WorkspaceIn, user: User = Depends(get_current_user), db: Session = Depends(get_db),
) -> dict:
    key = str(body.request_id)
    existing = db.query(Business).filter_by(user_id=user.id, workspace_key=key)
    workspace = existing.one_or_none()
    if workspace is None:
        workspace = Business(user_id=user.id, name=body.name, workspace_key=key)
        db.add(workspace)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            workspace = existing.one_or_none()
            if workspace is None:
                raise
    return {"workspace": _brief(workspace)}
