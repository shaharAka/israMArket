"""The publishing handoff.

Three reads that answer the owner's real questions: what is due today, what can this
product actually do for me, and what do I hand to whoever runs the ads.

Nothing here posts to Instagram or Facebook, and nothing here pretends to. `capability`
reports what the stored Meta grant actually permits and says in plain Hebrew what is
missing and why — see `services/publish.py`.

Every route is scoped to the caller's business through `get_business`, and the month is
resolved by the very same `_active_strategy` the post editor uses, so the two can never
disagree about which month is being worked on — and another business's plan 404s exactly
like one that does not exist.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_business
from app.models import Business
from app.routers.strategy import _active_strategy
from app.services import publish as publish_service

router = APIRouter(prefix="/publish", tags=["publish"])


@router.get("/capability")
def publish_capability(
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    """What this product can and cannot do for this business today."""
    return publish_service.capability_for(db, business)


@router.get("/queue")
def publish_queue(
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    """The month's posts, grouped by what the owner has to do about them."""
    strategy = _active_strategy(db, business)
    return publish_service.queue_for(db, business, strategy)


@router.get("/brief")
def publish_brief(
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    """A copyable campaign brief built only from the stored plan."""
    strategy = _active_strategy(db, business)
    return publish_service.campaign_brief(db, business, strategy)
