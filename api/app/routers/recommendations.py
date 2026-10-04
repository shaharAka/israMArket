from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_business
from app.models import Business, PerformanceSnapshot, Recommendation
from app.routers.strategy import _active_strategy, serialize_strategy
from app.services.diagnostics import recommend, week_of
from app.services.jsonutil import dumps, loads
from app.services.webhooks import deliver
from app.services.business_fields import field_label
from app.services.billing import require_generation_access  # the one billing gate
from app.services import recommendation_context, service_results

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


def current_plan(db: Session, business: Business) -> dict:
    try:
        return serialize_strategy(_active_strategy(db, business), business)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
        return {}


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
    return recommendation_context.serialize(rec, current_plan(db, business), business)


@router.get("/{recommendation_id}")
def by_id(recommendation_id: int, business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    rec = db.query(Recommendation).filter(Recommendation.id == recommendation_id,
                                         Recommendation.business_id == business.id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="ההמלצה הזו אינה זמינה בעסק הזה. אפשר לחזור להמלצות העדכניות.")
    return recommendation_context.serialize(rec, current_plan(db, business), business)


@router.post("/generate", dependencies=[Depends(require_generation_access)])
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
    plan = serialize_strategy(strategy, business)
    ga4_data, meta_data, basis = recommendation_context.prepare(business, plan, recommendation_context.snapshot_view(snap))

    business_payload = {
        "name": business.name,
        "business_type": field_label(business.business_type),
        "offerings": business.offerings,
        "primary_goal": business.primary_goal,
        "business_model": business.business_model or "products",
        "monthly_budget_ils": business.monthly_budget_ils,
        "analysis_basis": basis,
        **service_results.model_context(business),
    }
    try:
        proposed = recommend(
            business_payload,
            recommendation_context.for_model(plan),
            loads(snap.diagnostic_json, {}) if snap and not basis["excluded_sources"] else {},
            ga4_data,
            meta_data,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="לא הצלחנו להכין הצעה כרגע. התוכנית והנתונים נשמרו; אפשר לנסות שוב.") from exc
    suggestions = recommendation_context.bind(proposed, basis, plan)

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
    return {**recommendation_context.serialize(rec, plan, business), "webhook_deliveries": deliveries}
