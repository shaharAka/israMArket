from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_business
from app.models import Business, PerformanceSnapshot, Recommendation
from app.routers.strategy import _active_strategy, serialize_strategy
from app.services.diagnostics import recommend, week_of
from app.services.jsonutil import dumps, loads
from app.services.webhooks import deliver

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("/latest")
def latest(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    rec = (
        db.query(Recommendation)
        .filter(Recommendation.business_id == business.id)
        .order_by(Recommendation.created_at.desc())
        .first()
    )
    if not rec:
        # See performance.latest — an un-run weekly loop is a normal state, not an error.
        return {
            "available": False,
            "id": None,
            "week_of": "",
            "suggestions": {},
            "created_at": "",
        }
    return {
        "available": True,
        "id": rec.id,
        "week_of": rec.week_of,
        "suggestions": loads(rec.suggestions_json, {}),
        "created_at": rec.created_at.isoformat(),
    }


@router.post("/generate")
def generate(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    snap = (
        db.query(PerformanceSnapshot)
        .filter(PerformanceSnapshot.business_id == business.id)
        .order_by(PerformanceSnapshot.created_at.desc())
        .first()
    )
    # A snapshot is NOT required. Most small businesses have no GA4 at all, and
    # gating the weekly loop on it made half the product unreachable for them —
    # the prompt already knows how to work from the plan alone and say so.
    strategy = _active_strategy(db, business)

    business_payload = {
        "name": business.name,
        "business_type": business.business_type,
        "offerings": business.offerings,
        "primary_goal": business.primary_goal,
        "monthly_budget_ils": business.monthly_budget_ils,
    }
    try:
        suggestions = recommend(
            business_payload,
            serialize_strategy(strategy),
            loads(snap.diagnostic_json, {}) if snap else {},
            loads(snap.ga4_json, {}) if snap else {},
            loads(snap.meta_json, {}) if snap else {},
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    rec = Recommendation(
        business_id=business.id,
        week_of=week_of(),
        suggestions_json=dumps(suggestions),
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    deliveries = deliver(
        business.webhooks,
        "recommendations",
        {"business_id": business.id, "week_of": rec.week_of, "suggestions": suggestions},
        db=db,
    )
    return {
        "id": rec.id,
        "week_of": rec.week_of,
        "suggestions": suggestions,
        "created_at": rec.created_at.isoformat(),
        "webhook_deliveries": deliveries,
    }
