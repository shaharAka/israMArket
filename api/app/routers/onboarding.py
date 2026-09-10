from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Business, User
from app.schemas import BrandLanguageIn, OnboardingIn, WebsiteScanIn
from app.services.jsonutil import dumps, loads
from app.routers.strategy import serialize_strategy, upsert_generated_strategy
from app.services.strategy import generate_monthly_strategy, propose_hypotheses, scan_website
from app.services.webhooks import deliver

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


def _business_payload(business: Business) -> dict:
    return {
        "id": business.id,
        "name": business.name,
        "website_url": business.website_url,
        "business_type": business.business_type,
        "offerings": business.offerings,
        "location": business.location or "",
        "presence_type": business.presence_type or "brick_and_mortar",
        "social_links": loads(business.social_links_json, {}),
        "monthly_budget_ils": business.monthly_budget_ils,
        "competitors": loads(business.competitors_json, []),
        "primary_goal": business.primary_goal,
        "onboarding_complete": bool(business.onboarding_complete),
        "scraped_profile": loads(business.scraped_profile_json, None),
        "brand_language": (loads(business.scraped_profile_json, {}) or {}).get("brand_language"),
        "generate_state": loads(business.generate_state_json, {}),
    }


@router.get("/me")
def current_business(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    business = db.query(Business).filter(Business.user_id == user.id).order_by(Business.id.desc()).first()
    if not business:
        return {"business": None}
    return {"business": _business_payload(business)}


@router.post("/scan")
def scan_business_site(
    body: WebsiteScanIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    try:
        scanned = scan_website(body.website_url)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    business = db.query(Business).filter(Business.user_id == user.id).order_by(Business.id.desc()).first()
    if not business:
        business = Business(user_id=user.id, website_url=body.website_url)
        db.add(business)
    business.website_url = body.website_url
    if scanned["brand_language"].get("business_name") and not business.name:
        business.name = scanned["brand_language"]["business_name"]
    business.scraped_profile_json = dumps(scanned)
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(business)
    return {"business": _business_payload(business), "scan": scanned}


@router.post("/brand")
def save_brand_language(
    body: BrandLanguageIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    business = db.query(Business).filter(Business.user_id == user.id).order_by(Business.id.desc()).first()
    stored = loads(business.scraped_profile_json, {}) if business else {}
    if not business or not stored.get("brand_language"):
        raise HTTPException(status_code=400, detail="קודם קוראים את האתר. אין שפת מותג לשמור לפני הסריקה.")
    brand = body.model_dump()
    stored["brand_language"] = brand
    business.scraped_profile_json = dumps(stored)
    if brand.get("business_name"):
        business.name = brand["business_name"]
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(business)
    return {"business": _business_payload(business), "scan": stored}


@router.post("/profile")
def save_profile(
    body: OnboardingIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    business = db.query(Business).filter(Business.user_id == user.id).order_by(Business.id.desc()).first()
    if not business:
        business = Business(user_id=user.id)
        db.add(business)
    business.name = body.name
    business.website_url = body.website_url
    business.business_type = body.business_type
    business.offerings = body.offerings
    business.location = body.location
    business.presence_type = body.presence_type
    business.social_links_json = dumps(body.social_links)
    business.monthly_budget_ils = body.monthly_budget_ils
    business.competitors_json = dumps([item.model_dump() for item in body.competitors])
    business.primary_goal = body.primary_goal
    stored = loads(business.scraped_profile_json, {}) or {}
    if body.growth_hypothesis:
        stored["growth_hypothesis"] = body.growth_hypothesis
    if body.growth_targets:
        stored["growth_targets"] = body.growth_targets
    business.scraped_profile_json = dumps(stored)
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(business)
    return {"business": _business_payload(business)}


@router.post("/preview-scan")
def preview_scan(body: WebsiteScanIn) -> dict:
    try:
        scanned = scan_website(body.website_url)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"scan": scanned}


@router.post("/hypotheses")
def hypotheses(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    business = db.query(Business).filter(Business.user_id == user.id).order_by(Business.id.desc()).first()
    stored = loads(business.scraped_profile_json, {}) if business else {}
    brand = stored.get("brand_language")
    if not business or not brand:
        raise HTTPException(status_code=400, detail="סרקו קודם את האתר כדי להציע כיוון צמיחה.")
    payload = {
        "name": business.name,
        "business_type": business.business_type,
        "offerings": business.offerings,
        "location": business.location,
        "presence_type": business.presence_type,
        "primary_goal": business.primary_goal,
        "monthly_budget_ils": business.monthly_budget_ils,
    }
    try:
        items = propose_hypotheses(payload, brand, stored.get("extracted") or {})
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    stored["hypotheses"] = items
    business.scraped_profile_json = dumps(stored)
    business.updated_at = datetime.utcnow()
    db.commit()
    return {"hypotheses": items}


@router.post("/generate")
def generate(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    business = db.query(Business).filter(Business.user_id == user.id).order_by(Business.id.desc()).first()
    if not business or not business.business_type or not business.name:
        raise HTTPException(
            status_code=400,
            detail="יש להגדיר את פרטי העסק לפני יצירת התוכנית",
        )

    stored = loads(business.scraped_profile_json, {}) or {}
    if not stored.get("brand_language") and not business.website_url:
        raise HTTPException(
            status_code=400,
            detail="סרקו אתר ציבורי או הזינו כתובת לפני יצירת התוכנית",
        )
    payload = {
        "name": business.name,
        "website_url": business.website_url,
        "business_type": business.business_type,
        "offerings": business.offerings,
        "location": business.location,
        "presence_type": business.presence_type,
        "social_links": loads(business.social_links_json, {}),
        "monthly_budget_ils": business.monthly_budget_ils,
        "competitors": loads(business.competitors_json, []),
        "primary_goal": business.primary_goal,
        "growth_hypothesis": stored.get("growth_hypothesis", ""),
        "growth_targets": stored.get("growth_targets", []),
    }
    scan = stored if stored.get("brand_language") else None
    state = loads(business.generate_state_json, {}) or {}

    def persist_stage(next_state: dict) -> None:
        business.generate_state_json = dumps(next_state)
        business.updated_at = datetime.utcnow()
        db.commit()

    try:
        generated = generate_monthly_strategy(
            payload,
            scan=scan,
            state=state,
            on_stage=persist_stage,
            one_stage=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if not generated.get("complete"):
        business.scraped_profile_json = dumps(generated["scraped_profile"])
        db.commit()
        db.refresh(business)
        return {
            "done": False,
            "business": _business_payload(business),
            "generate_state": generated["generate_state"],
        }

    business.scraped_profile_json = dumps(generated["scraped_profile"])
    business.generate_state_json = ""
    business.onboarding_complete = 1
    business.updated_at = datetime.utcnow()

    strategy = upsert_generated_strategy(db, business, generated)

    db.commit()
    db.refresh(business)
    db.refresh(strategy)

    deliveries = deliver(
        business.webhooks,
        "strategy",
        {"business_id": business.id, "year": strategy.year, "month": strategy.month, "usp": generated["usp"]},
    )
    return {
        "done": True,
        "business": _business_payload(business),
        "strategy": serialize_strategy(strategy, business),
        "webhook_deliveries": deliveries,
    }
