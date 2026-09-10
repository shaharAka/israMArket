from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_business
from app.models import Business, Integration, PerformanceSnapshot, Recommendation
from app.routers.integrations import tokens_for
from app.routers.strategy import _active_strategy, serialize_strategy
from app.services import ga4, meta
from app.services.diagnostics import diagnose, recommend, week_of
from app.services.jsonutil import dumps, loads
from app.services.webhooks import deliver

router = APIRouter(prefix="/performance", tags=["performance"])


def _optional(business: Business, provider: str) -> Integration | None:
    item = next((i for i in business.integrations if i.provider == provider and i.status == "connected"), None)
    if not item or not item.access_token_enc or not item.external_id:
        return None
    return item


def _posts(business: Business, db: Session) -> list[dict]:
    try:
        strategy = _active_strategy(db, business)
    except HTTPException:
        return []
    extra = loads(strategy.roadmap_json, {})
    return list((extra.get("roadmap") or {}).get("posts") or [])


def _attribute(posts: list[dict], ga4_data: dict, meta_data: dict) -> list[dict]:
    campaigns = ga4_data.get("campaigns") or []
    media = meta_data.get("posts") or []
    rows = []
    for post in posts:
        utm = post.get("utm") or {}
        campaign_hits = [
            row
            for row in campaigns
            if row.get("sessionCampaignName") == utm.get("utm_campaign")
            and (
                not utm.get("utm_content")
                or row.get("sessionManualAdContent") == utm.get("utm_content")
            )
        ]
        published = (post.get("published_url") or "").rstrip("/")
        media_hit = None
        for item in media:
            permalink = (item.get("permalink") or "").rstrip("/")
            if published and permalink and published == permalink:
                media_hit = item
                break
        if not media_hit and post.get("caption"):
            needle = (post.get("caption") or "")[:40]
            for item in media:
                if needle and needle in (item.get("caption") or ""):
                    media_hit = item
                    break
        rows.append(
            {
                "title": post.get("title"),
                "utm_content": utm.get("utm_content"),
                "published_url": post.get("published_url") or "",
                "ga4": campaign_hits,
                "meta": media_hit,
            }
        )
    return rows


def _sync_payload(business: Business, db: Session) -> dict:
    ga4_item = _optional(business, "ga4")
    meta_item = _optional(business, "meta")
    if not ga4_item and not meta_item:
        raise HTTPException(
            status_code=400,
            detail="חברו לפחות את גוגל אנליטיקס או את אינסטגרם בעמוד החיבורים לפני סנכרון.",
        )

    end = date.today()
    start = end - timedelta(days=28)
    ga4_data: dict = {}
    meta_data: dict = {}
    try:
        if ga4_item:
            access, refresh, expires = tokens_for(ga4_item)
            ga4_data = ga4.fetch_report(access, refresh, expires, ga4_item.external_id, start.isoformat(), end.isoformat())
        if meta_item:
            extra_meta = loads(meta_item.extra_json, {})
            instagram_id = extra_meta.get("selected_instagram_id") or ""
            page_tokens = extra_meta.get("page_tokens") or {}
            page_token = page_tokens.get(meta_item.external_id)
            if not page_token:
                raise RuntimeError("חסר טוקן לדף המטא שנבחר. חברו את מטא מחדש.")
            meta_data = meta.fetch_insights(page_token, instagram_id, meta_item.external_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    posts = _posts(business, db)
    ga4_data["post_attribution"] = _attribute(posts, ga4_data, meta_data)

    business_payload = {
        "name": business.name,
        "business_type": business.business_type,
        "offerings": business.offerings,
        "primary_goal": business.primary_goal,
        "monthly_budget_ils": business.monthly_budget_ils,
    }
    try:
        diagnostic = diagnose(business_payload, ga4_data, meta_data)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    snap = PerformanceSnapshot(
        business_id=business.id,
        period_start=start.isoformat(),
        period_end=end.isoformat(),
        ga4_json=dumps(ga4_data),
        meta_json=dumps(meta_data),
        diagnostic_json=dumps(diagnostic),
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return {
        "id": snap.id,
        "period_start": snap.period_start,
        "period_end": snap.period_end,
        "ga4": ga4_data,
        "meta": meta_data,
        "diagnostic": diagnostic,
        "created_at": snap.created_at.isoformat(),
    }


@router.get("/latest")
def latest(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    snap = (
        db.query(PerformanceSnapshot)
        .filter(PerformanceSnapshot.business_id == business.id)
        .order_by(PerformanceSnapshot.created_at.desc())
        .first()
    )
    if not snap:
        raise HTTPException(status_code=404, detail="עדיין אין סנכרון ביצועים")
    return {
        "id": snap.id,
        "period_start": snap.period_start,
        "period_end": snap.period_end,
        "ga4": loads(snap.ga4_json, {}),
        "meta": loads(snap.meta_json, {}),
        "diagnostic": loads(snap.diagnostic_json, {}),
        "created_at": snap.created_at.isoformat(),
    }


@router.post("/sync")
def sync(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    return _sync_payload(business, db)


@router.post("/weekly")
def weekly(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    snap = _sync_payload(business, db)
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
            snap["diagnostic"],
            snap["ga4"],
            snap["meta"],
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
        "performance": snap,
        "recommendation": {
            "id": rec.id,
            "week_of": rec.week_of,
            "suggestions": suggestions,
            "created_at": rec.created_at.isoformat(),
            "webhook_deliveries": deliveries,
        },
    }
