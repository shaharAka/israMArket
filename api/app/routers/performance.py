import logging
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_business
from app.models import Audience, Business, Integration, PerformanceSnapshot, Recommendation
from app.routers.integrations import tokens_for
from app.routers.strategy import _active_strategy, _connected, serialize_strategy
from app.services import connected_posts, ga4, ga4_readiness, hypotheses, instagram_signal, meta, meta_readiness
from app.services import audiences as audiences_service
from app.services.diagnostics import diagnose, recommend, week_of
from app.services.jsonutil import dumps, loads
from app.services.webhooks import deliver
from app.services.business_fields import field_label
from app.services.billing import require_generation_access  # the one billing gate
from app.services import journey, plan_connections, recommendation_context, service_results

router = APIRouter(prefix="/performance", tags=["performance"])
logger = logging.getLogger(__name__)


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
                # Carried on the attributed row so a per-audience rollup groups the very
                # same numbers — no second attribution path, and no per-audience metric
                # that GA4 cannot support.
                "audience_id": post.get("audience_id"),
                "audience_name": post.get("audience_name") or "",
                "ga4": campaign_hits,
                "meta": media_hit,
            }
        )
    return rows


def _audience_payload(
    business: Business, db: Session, posts: list[dict], snap: PerformanceSnapshot | None
) -> dict:
    """One row per audience, summed from the results already attributed to each post.

    The input is `ga4.post_attribution` as the sync stored it: the per-post GA4 campaign
    rows and the matched Meta post. A post with no audience is its own "לא משויך" bucket,
    and when neither provider is connected the rows come back with no metrics at all plus
    an explanation of what connecting would enable — never zeros dressed up as results.
    """
    rows = (
        db.query(Audience)
        .filter(Audience.business_id == business.id)
        .order_by(Audience.is_primary.desc(), Audience.created_at.asc(), Audience.id.asc())
        .all()
    )
    stored = loads(snap.ga4_json, {}) if snap else {}
    attributions = (stored or {}).get("post_attribution") or []
    return audiences_service.rollup(
        audiences=[audiences_service.serialize_audience(row) for row in rows],
        posts=posts,
        attributions=attributions,
        ga4_connected=_optional(business, "ga4") is not None,
        meta_connected=_optional(business, "meta") is not None,
        period_start=snap.period_start if snap else "",
        period_end=snap.period_end if snap else "",
        synced_at=snap.created_at.isoformat() if snap else "",
    )


def _refresh_post_results(business: Business, db: Session, ga4_data: dict | None, meta_data: dict | None) -> dict:
    """Write each post's results (and its learning line) back onto the post.

    docs/posts-v2.md: WhatsApp taps per post code, GA4 visits by UTM, Instagram reach and
    saves by the post's link. Best effort: a failure here never costs the sync its numbers.
    """
    try:
        outcome = connected_posts.refresh_results(db, business, ga4_data=ga4_data, meta_data=meta_data)
        db.commit()
        return outcome
    except Exception:  # noqa: BLE001
        db.rollback()
        logger.exception("writing post results failed for business %s", business.id)
        return {"updated": 0, "measured": 0}


def _refresh_hypotheses(business: Business, db: Session) -> None:
    """Move the month's hypothesis statuses with the numbers just stored (docs/posts-v2.md,
    Phase C). Best effort, like the post results: it never fails the refresh."""
    try:
        if hypotheses.refresh_for_business(db, business) is not None:
            db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
        logger.exception("hypothesis review failed for business %s", business.id)


def _measured_posts(business: Business, db: Session) -> dict:
    """The month's measured posts, each with the number its card shows
    (connected_posts.measured_posts): the one per-post list Results reads."""
    try:
        strategy = _active_strategy(db, business)
    except HTTPException:
        return {"items": [], "waiting": 0}
    roadmap = (loads(strategy.roadmap_json, {}) or {}).get("roadmap") or {}
    if not isinstance(roadmap, dict) or not isinstance(roadmap.get("posts"), list):
        return {"items": [], "waiting": 0}
    return connected_posts.measured_posts(_connected(strategy, roadmap, business))


def _sync_payload(business: Business, db: Session) -> dict:
    ga4_item = _optional(business, "ga4")
    meta_item = _optional(business, "meta")
    if not ga4_item and not meta_item:
        if not business.whatsapp_number_e164:
            raise HTTPException(
                status_code=400,
                detail="כדי לרענן את הנתונים, חברו קודם את נתוני האתר או את אינסטגרם בעמוד החיבורים.",
            )
        # WhatsApp taps need no connected account: the posts get theirs and the month's
        # hypotheses move with them. That is a refresh that worked, so it answers like one
        # (the latest numbers, no new snapshot), not with "connect first".
        post_results = _refresh_post_results(business, db, None, None)
        _refresh_hypotheses(business, db)
        return {**latest(business, db), "post_results": post_results}

    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=27)
    ga4_data: dict = {}
    meta_data: dict = {}
    fresh_ga4 = False
    ga4_error = None
    meta_error = None
    # Providers are independent. Retain only matching, dated Google evidence if
    # its read fails; never pass those older figures as a fresh post measurement.
    previous = db.query(PerformanceSnapshot).filter_by(business_id=business.id).order_by(
        PerformanceSnapshot.created_at.desc(), PerformanceSnapshot.id.desc()).first()
    if ga4_item:
        selected_property = ga4_item.external_id
        try:
            access, refresh, expires = tokens_for(ga4_item)
            report = ga4.fetch_report(access, refresh, expires, selected_property, start.isoformat(), end.isoformat())
            if not isinstance(report, dict) or report.get("property_id") != selected_property or not isinstance(report.get("overview"), dict):
                raise RuntimeError("Invalid source response")
            db.refresh(ga4_item)
            if ga4_item.external_id != selected_property:
                raise HTTPException(409, "בחירת האתר השתנתה בזמן הקריאה. רעננו את הנתונים שוב.")
            ga4_data = report
            ga4_data["read_at"] = datetime.utcnow().isoformat()
            fresh_ga4 = bool(report["overview"])
            if not fresh_ga4:
                ga4_readiness.record(db, ga4_item, "empty", report=report)
        except HTTPException:
            raise
        except Exception as exc:
            ga4_error = ga4_readiness.record(db, ga4_item, ga4_readiness.failure(exc)["status"])
    if not fresh_ga4 and previous:
        old_ga = loads(previous.ga4_json, {}) or {}
        selected = next((i for i in business.integrations if i.provider == "ga4"), None)
        if selected and selected.external_id and old_ga.get("property_id") == selected.external_id:
            ga4_data = {**old_ga, "read_at": old_ga.get("read_at") or previous.created_at.isoformat(),
                        "period": old_ga.get("period") or {"start": previous.period_start, "end": previous.period_end}}
            if ga4_error:
                ga4_data["source_error"] = {"status": ga4_error["status"], "note_he": ga4_error["note_he"]}
    if meta_item:
        result = meta_readiness.read(db, meta_item, business.website_url, start.isoformat(), end.isoformat())
        if result is None:
            raise HTTPException(409, "בחירת החשבון השתנתה בזמן הקריאה. רעננו את הנתונים שוב.")
        meta_data = result
        state = meta_readiness.public_state(meta_item)
        if state["status"] in {"reconnect", "permission", "link_instagram", "unavailable"}:
            meta_error = state
    if not meta_item and previous:
        old_meta = loads(previous.meta_json, {}) or {}
        selected_meta = next((i for i in business.integrations if i.provider == "meta"), None)
        if selected_meta and old_meta.get("source_selection") == meta_readiness.selection(selected_meta):
            meta_data = {**old_meta, "source_read_at": old_meta.get("source_read_at") or previous.created_at.isoformat(),
                         "source_period": old_meta.get("source_period") or {"start": previous.period_start, "end": previous.period_end}}
    meta_sections = (meta_readiness.public_state(meta_item).get("sections") or {}) if meta_item else {}
    fresh_meta = any(section.get("status") in {"ready", "empty"} for name, section in meta_sections.items() if name in {"social", "ads"}) and meta_readiness.has_observations(meta_data)
    if not fresh_ga4 and not fresh_meta:
        # If neither provider delivered a fresh report, preserve the snapshot and
        # recommendation. A new timestamp must not make old evidence look new.
        error = ga4_error or meta_error
        if error:
            raise HTTPException(502, error["note_he"])
        return latest(business, db)

    # Every synced Instagram post, with the numbers Meta returned, feeds the post writer
    # (services/instagram_signal). The snapshot keeps the short caption as before.
    # Committed now, so a diagnostic failure below does not throw the numbers away.
    fresh_social = fresh_meta and meta_sections.get("social", {}).get("status") in {"ready", "empty"} and (
        not meta_data.get("source_reads") or (meta_data.get("source_reads", {}).get("social") or {}).get("read_at") == meta_data.get("source_read_at"))
    if fresh_social and instagram_signal.store_media(db, business.id, meta_data):
        db.commit()
    meta_data = meta.snapshot_view(meta_data)

    posts = _posts(business, db)
    ga4_data["post_attribution"] = _attribute(posts, ga4_data, meta_data if fresh_social else {})
    post_results = _refresh_post_results(business, db, ga4_data if fresh_ga4 else None, meta_data if fresh_social else None)

    business_payload = {
        "name": business.name,
        "business_type": field_label(business.business_type),
        "offerings": business.offerings,
        "primary_goal": business.primary_goal,
        "business_model": business.business_model or "products",
        "monthly_budget_ils": business.monthly_budget_ils,
        **service_results.model_context(business),
    }
    # Store the observations before analysis: a model outage must not lose source data.
    diagnostic = {"analysis_status": "pending", "headline": "", "top_content": [],
                  "bottom_content": [], "funnel_issues": [], "metric_highlights": []}
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
    if fresh_ga4:
        ga4_readiness.record(db, ga4_item, "ready" if ga4_readiness.has_activity(ga4_data) else "empty", report=ga4_data)
    try:
        diagnostic = {**diagnose(business_payload, ga4_data, meta_data), "analysis_status": "ready"}
    except Exception:
        diagnostic = {**diagnostic, "analysis_status": "unavailable"}
        logger.warning("analysis unavailable for business %s; source snapshot retained", business.id)
    snap.diagnostic_json = dumps(diagnostic)
    db.commit()
    # Now that the snapshot is the latest, the targets are read against its numbers.
    _refresh_hypotheses(business, db)
    return {
        "id": snap.id,
        "period_start": snap.period_start,
        "period_end": snap.period_end,
        "ga4": ga4_data,
        "meta": meta_data,
        "diagnostic": diagnostic,
        "created_at": snap.created_at.isoformat(),
        # How many posts got numbers from this refresh, and how many are measured overall.
        "post_results": post_results,
        "measured_posts": _measured_posts(business, db),
        "sources": _source_states(business),
        "measurement_setup": _measurement_setup(business, db),
    }


def _source_states(business: Business) -> dict:
    return {item.provider: ga4_readiness.public_state(item) if item.provider == "ga4" else meta_readiness.public_state(item)
            for item in business.integrations if item.provider in {"ga4", "meta"}}


def _measurement_setup(business: Business, db: Session) -> dict:
    """The same saved-plan requirements as Setup/Today, without any provider read."""
    facts = journey.load(db, business)
    required = plan_connections.keys(facts) or set()
    requirements = []
    if "whatsapp_link" in required:
        requirements.append({"key": "whatsapp", "title": "לחיצות על הקישור לוואטסאפ",
                             "status": "done" if business.whatsapp_number_e164 else "todo",
                             "why": "הקישור סופר לחיצות. הוא לא סופר הודעות, פניות או לקוחות.",
                             "action_href": "/integrations#whatsapp", "action_label": "להכין קישור מדיד לוואטסאפ"})
    for provider in ("ga4", "meta"):
        if not plan_connections.needed(facts, provider):
            continue
        state = plan_connections.state(facts, provider)
        requirements.append({"key": provider, **state,
                             "action_href": f"/integrations#{provider}", "action_label": state["action"]})
    # A refresh with only the WhatsApp number writes the posts' taps (#111), so it can run.
    return {"requirements": requirements,
            "can_refresh": bool(business.whatsapp_number_e164)
            or any(_optional(business, provider) is not None for provider in ("ga4", "meta"))}


def _meta_snapshot(business: Business, snap: PerformanceSnapshot) -> dict:
    stored = loads(snap.meta_json, {}) or {}
    item = next((item for item in business.integrations if item.provider == "meta"), None)
    if item:
        extra = loads(item.extra_json, {}) or {}
        check = extra.get("pixel_verification") or {}
        current_check = not extra.get("pixel_verification_key") or extra["pixel_verification_key"] == meta_readiness.key(item)
        if current_check and stored.get("source_selection") == meta_readiness.selection(item) and check.get("pixel_id") == extra.get("selected_pixel_id") and check.get("pixel_id"):
            stored["tracking"] = check
    return stored


@router.get("/latest")
def latest(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    snap = (
        db.query(PerformanceSnapshot)
        .filter(PerformanceSnapshot.business_id == business.id)
        .order_by(PerformanceSnapshot.created_at.desc())
        .first()
    )
    posts = _posts(business, db)
    # Built in both branches: "no sync yet" still has audiences and posts, and the owner
    # should still see how many posts each segment has — just without invented numbers.
    audience_payload = _audience_payload(business, db, posts, snap)
    if not snap:
        # 200 with an explicit flag instead of a 404: "no data yet" is a normal state,
        # and a 404 here showed up as a console/error-tracking error on every page view.
        return {
            "available": False,
            "id": None,
            "period_start": "",
            "period_end": "",
            "ga4": {},
            "meta": {},
            "diagnostic": {},
            "created_at": "",
            "audiences": audience_payload,
            # Our own numbers (WhatsApp taps) need no snapshot.
            "measured_posts": _measured_posts(business, db),
            "sources": _source_states(business),
            "measurement_setup": _measurement_setup(business, db),
        }
    return {
        "available": True,
        "id": snap.id,
        "period_start": snap.period_start,
        "period_end": snap.period_end,
        "ga4": loads(snap.ga4_json, {}),
        "meta": _meta_snapshot(business, snap),
        "diagnostic": loads(snap.diagnostic_json, {}),
        "created_at": snap.created_at.isoformat(),
        "audiences": audience_payload,
        "measured_posts": _measured_posts(business, db),
        "sources": _source_states(business),
        "measurement_setup": _measurement_setup(business, db),
    }


@router.post("/sync")
def sync(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    return _sync_payload(business, db)


@router.post("/weekly", dependencies=[Depends(require_generation_access)])
def weekly(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    snap = _sync_payload(business, db)
    strategy = _active_strategy(db, business)
    plan = serialize_strategy(strategy, business)
    if snap.get("available") is False:
        # Only WhatsApp taps (nothing connected): the posts got their numbers, and there is
        # no new site or Instagram read to propose from. The last proposal stays as it was.
        rec = (
            db.query(Recommendation)
            .filter(Recommendation.business_id == business.id)
            .order_by(Recommendation.created_at.desc())
            .first()
        )
        return {
            "performance": snap,
            "recommendation": recommendation_context.serialize(rec, plan, business) if rec else {
                "available": False, "id": None, "week_of": "", "suggestions": {}, "created_at": ""},
        }
    ga4_data, meta_data, basis = recommendation_context.prepare(business, plan, snap)
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
            snap["diagnostic"] if not basis["excluded_sources"] else {},
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
    return {
        "performance": snap,
        "recommendation": {**recommendation_context.serialize(rec, plan, business), "webhook_deliveries": deliveries},
    }
