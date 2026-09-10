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
        raise HTTPException(status_code=404, detail="עדיין אין המלצות שבועיות")
    return {
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
    if not snap:
        raise HTTPException(status_code=400, detail="סנכרנו קודם נתוני GA4 ומטא בעמוד הביצועים")
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
            loads(snap.diagnostic_json, {}),
            loads(snap.ga4_json, {}),
            loads(snap.meta_json, {}),
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
    )
    return {
        "id": rec.id,
        "week_of": rec.week_of,
        "suggestions": suggestions,
        "created_at": rec.created_at.isoformat(),
        "webhook_deliveries": deliveries,
    }
