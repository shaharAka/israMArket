from datetime import datetime
from typing import Any, Annotated, Literal

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Business, Strategy, User
from app.schemas import BrandLanguageIn, OnboardingIn, PaletteIn, WebsiteScanIn
from app.services import generation_jobs, month_posts
from app.services.audiences import attach_audiences
from app.services.brand import filter_usable_photos
from app.services.audiences import catalogue_for
from app.services.business_model import goals_for, normalise_model
from app.services.images import store_image_bytes
from app.services.instagram_signal import handles_for, signal_for
from app.services.onboarding_draft import (
    OWNER_CONTEXT_FALLBACK_HE,
    DirectionIn,
    DraftPhotoError,
    IdeaIn,
    OnboardingDraft,
    OwnerContextIn,
    apply_draft,
    apply_owner_context,
    link_draft_photos,
    owner_context_errors_he,
    normalize_links,
    seed_from_stored,
)
from app.services.preview import cached_scan
from app.services.quarter_plan import QuarterPlanIn
from app.services.strategy_reveal import SamplePostIn, StrategyIn
from app.services.jsonutil import dumps, loads
from app.services.scraper import fetch_photo_candidates
from app.routers.strategy import serialize_strategy, upsert_generated_strategy
from app.services.strategy import (
    attach_tracking,
    build_long_horizon_plan,
    featured_items_from,
    generate_monthly_strategy,
    month_from_state,
    write_week_posts,
    propose_hypotheses,
    propose_targets,
    scan_website,
)
from app.services.webhooks import deliver
from app.services.business_fields import field_label
from app.services.billing import require_generation_access  # the one billing gate

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

# First run asks three things: the business, the budget, the competitors. These four
# decisions used to be wizard steps and now wait until the owner wants them — generation
# runs without them (the model proposes a quarter and a direction itself), and they stay
# editable from /decisions and /plan. Listed so a screen can say what is still open.
DEFERRED_DECISIONS = ("diagnostics", "growth_targets", "long_horizon_plan", "growth_hypothesis")


def _deferred(stored: dict) -> list[str]:
    def filled(value) -> bool:
        if isinstance(value, dict):
            return any(str(item or "").strip() for item in value.values())
        if isinstance(value, (list, tuple)):
            return any(str(item or "").strip() for item in value)
        return bool(str(value or "").strip())

    return [key for key in DEFERRED_DECISIONS if not filled(stored.get(key))]


def default_goal(business_model: str | None, current: str | None) -> str:
    """The stored goal when it fits the model, else the model's first goal.

    First run no longer asks for a goal: a shop is planned for sales and a service
    business for inquiries, which is what the owner would pick nine times out of ten,
    and /decisions changes it.
    """
    allowed = goals_for(business_model)
    return current if current in allowed else allowed[0]


def _business_payload(business: Business) -> dict:
    stored = loads(business.scraped_profile_json, {}) or {}
    return {
        "id": business.id,
        "name": business.name,
        "website_url": business.website_url,
        "business_type": business.business_type,
        "offerings": business.offerings,
        "location": business.location or "",
        "presence_type": business.presence_type or "brick_and_mortar",
        "business_model": business.business_model or "products",
        "social_links": loads(business.social_links_json, {}),
        "monthly_budget_ils": business.monthly_budget_ils,
        "competitors": loads(business.competitors_json, []),
        "primary_goal": business.primary_goal,
        "onboarding_complete": bool(business.onboarding_complete),
        "scraped_profile": loads(business.scraped_profile_json, None),
        "brand_language": stored.get("brand_language"),
        "growth_targets": stored.get("growth_targets", []),
        "diagnostics": stored.get("diagnostics"),
        "long_horizon_plan": stored.get("long_horizon_plan"),
        "generate_state": loads(business.generate_state_json, {}),
        "instagram_handles": handles_for(business),
        "deferred_decisions": _deferred(stored),
        # Onboarding v2 (additive): the first-meeting answers, where the brand came from
        # ("preset" when it is a style preset, not a scan) and the chosen first-month seed.
        "owner_context": stored.get("owner_context"),
        "brand_source": stored.get("brand_source") or ("scan" if stored.get("brand_language") else None),
        "first_month_seed": seed_from_stored(stored),
        # Revision 5: the 3-month plan saved at signup, and the measurement checklist it needs.
        "quarter_plan": stored.get("quarter_plan"),
        "integrations_checklist": stored.get("integrations_checklist") or [],
    }


@router.get("/me")
def current_business(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    business = db.query(Business).filter(Business.user_id == user.id).order_by(Business.id.desc()).first()
    if not business:
        return {"business": None}
    return {"business": _business_payload(business)}


class FromDraftIn(BaseModel):
    draft: OnboardingDraft
    # Expected from the web flow; optional so a signup never fails because the plan
    # preview could not be shown. Without it the first month is planned as before.
    chosen_direction: DirectionIn | None = None
    chosen_idea: IdeaIn | None = None
    # Revision 4: the strategy from /public/strategy (as the owner last shaped it) and
    # the sample posts they chose from /public/sample-posts. Both optional; with them the
    # first month follows the strategy and the chosen posts are its first posts.
    strategy: StrategyIn | None = None
    chosen_posts: list[SamplePostIn] | None = Field(default=None, max_length=3)
    # Revision 5: the 3-month plan from /public/quarter-plan, as the owner last saw it.
    quarter_plan: QuarterPlanIn | None = None
    deferred_links: dict[Literal["website", "instagram", "facebook", "tiktok"], Annotated[str, Field(max_length=300)]] = Field(default_factory=dict)


def _stored_plan(plan: QuarterPlanIn | None) -> dict | None:
    if plan is None:
        return None
    try:
        return plan.stored()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/from-draft")
def from_draft(
    body: FromDraftIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Turn the pre-signup draft (/start) into the owner's business. Idempotent.

    Same response as /onboarding/me. The budget step and /onboarding/generate follow
    unchanged; generation reads the brand this stores (the cached site scan, or the
    style preset) and the chosen direction/idea (see onboarding_draft.apply_draft).
    """
    business = db.query(Business).filter(Business.user_id == user.id).order_by(Business.id.desc()).first()
    if not business:
        business = Business(user_id=user.id)
        db.add(business)
    apply_draft(
        db,
        business,
        body.draft,
        body.chosen_direction.model_dump() if body.chosen_direction else None,
        body.chosen_idea.model_dump() if body.chosen_idea else None,
        strategy=body.strategy.stored() if body.strategy else None,
        chosen_posts=[post.model_dump(mode="json") for post in body.chosen_posts or []],
        quarter_plan=_stored_plan(body.quarter_plan),
    )
    # Keep deferred public links as owner reminders, away from planner inputs.
    # Invalid optional sources must not prevent signup or erase the original answer.
    if body.deferred_links:
        _, errors = normalize_links(body.deferred_links)
        stored = loads(business.scraped_profile_json, {}) or {}
        context = stored.get("owner_context") or {}
        context["pending_links"] = {
            key: {"url": value, "error": errors.get(key, "הקישור נשמר לבדיקה בהמשך. אפשר לאשר או להחליף אותו כאן.")}
            for key, value in body.deferred_links.items() if value.strip()
        }
        stored["owner_context"] = context
        business.scraped_profile_json = dumps(stored)
    # The free month (Revision 7 B) starts at signup; an account from before the trial
    # existed starts it here, the first time it brings a plan in.
    if user.trial_started_at is None:
        user.trial_started_at = datetime.utcnow()
    db.commit()
    db.refresh(business)
    return {"business": _business_payload(business)}


class DraftPhotoLink(BaseModel):
    post_index: int = Field(ge=0, le=2)
    asset_id: int = Field(ge=1)


@router.post("/draft-photos")
def draft_photos(
    body: list[DraftPhotoLink] = Body(..., max_length=3),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Link the photos uploaded right after signup (kept in the browser until then) to
    the week-1 posts chosen at /start, so the month uses them. Idempotent. Same
    response as /onboarding/me."""
    business = db.query(Business).filter(Business.user_id == user.id).order_by(Business.id.desc()).first()
    if not business:
        raise HTTPException(status_code=404, detail="עוד אין עסק. קודם שומרים את מה שבנינו.")
    try:
        link_draft_photos(db, business, [item.model_dump() for item in body])
    except DraftPhotoError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    db.commit()
    db.refresh(business)
    return {"business": _business_payload(business)}


@router.put("/owner-context")
def update_owner_context(
    body: Any = Body(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Change what the owner told us at /start, from /decisions. Partial; see OwnerContextIn.

    The body is validated here rather than by FastAPI so a 422 says what is wrong in
    Hebrew (the default is pydantic's English, prefixed with "Value error").
    Same response as /onboarding/me.
    """
    if not isinstance(body, dict):
        raise HTTPException(status_code=422, detail=OWNER_CONTEXT_FALLBACK_HE)
    try:
        update = OwnerContextIn.model_validate(body)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=owner_context_errors_he(exc.errors())) from exc
    business = db.query(Business).filter(Business.user_id == user.id).order_by(Business.id.desc()).first()
    if not business:
        raise HTTPException(status_code=400, detail="מלאו קודם את פרטי העסק.")
    apply_owner_context(business, update)
    db.commit()
    db.refresh(business)
    return {"business": _business_payload(business)}


@router.post("/scan")
def scan_business_site(
    body: WebsiteScanIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    # Right after signup the landing page has usually just read this site for the public
    # preview; reuse that scan instead of reading the site (and paying Gemini) twice.
    scanned = cached_scan(body.website_url)
    if scanned is None:
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
    extracted = scanned.get("extracted") or {}
    if extracted.get("location") and not business.location:
        business.location = extracted["location"]
    # Keep the business's own photographs now, while we already have the page, so card
    # generation can reuse them without hitting their site again on every request.
    try:
        # Flush FIRST: a business created moments ago in this request still has
        # id=None, which stored the photos under a "None" folder nothing can serve.
        db.flush()
        business_id = business.id
        stored_photos = []
        candidates = fetch_photo_candidates((scanned.get("raw") or {}).get("image_urls") or [])
        for photo in filter_usable_photos(candidates):
            public_url = store_image_bytes(
                business_id, "source-photo", photo["bytes"], photo["mime"]
            )
            stored_photos.append({"url": photo.get("url", ""), "public_url": public_url})
        # Record that the photos were checked even when NONE survived the filter.
        # Without this flag an empty list is indistinguishable from "never checked",
        # and the generation path would re-fetch the rejected photos.
        scanned["real_photos"] = stored_photos
        scanned["photos_checked"] = True
    except Exception:
        # Storing source photos is an optimisation; never fail the scan over it.
        pass

    # The stored profile also carries the owner's own decisions (growth hypothesis,
    # targets, diagnostics, the /start answers and the first-month seed). A re-scan
    # refreshes only what the scan produces; replacing the whole blob wiped them.
    previous = loads(business.scraped_profile_json, {}) or {}
    business.scraped_profile_json = dumps({**previous, **scanned})
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
        raise HTTPException(status_code=400, detail="קודם צריך לקרוא את האתר. עד אז אין סגנון לשמור.")
    brand = body.model_dump()
    stored["brand_language"] = brand
    business.scraped_profile_json = dumps(stored)
    if brand.get("business_name"):
        business.name = brand["business_name"]
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(business)
    return {"business": _business_payload(business), "scan": stored}


@router.post("/palette")
def save_palette(
    body: PaletteIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Let the owner correct the colours we extracted.

    The palette drives every card, badge and CTA, so a wrong extraction is not cosmetic
    — and extraction genuinely gets it wrong (CMS preset palettes, social-icon colours).
    Without this the user was stuck with whatever we guessed.
    """
    business = db.query(Business).filter(Business.user_id == user.id).order_by(Business.id.desc()).first()
    stored = loads(business.scraped_profile_json, {}) if business else {}
    brand = stored.get("brand_language") if business else None
    if not business or not brand:
        raise HTTPException(status_code=400, detail="אין עדיין צבעים לשמור. קראו קודם את האתר.")

    brand["palette"] = [item.model_dump() for item in body.palette]
    stored["brand_language"] = brand
    business.scraped_profile_json = dumps(stored)
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(business)
    return {"business": _business_payload(business)}


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
    business.business_model = body.business_model
    business.social_links_json = dumps(body.social_links)
    business.monthly_budget_ils = body.monthly_budget_ils
    business.competitors_json = dumps([item.model_dump() for item in body.competitors])
    business.primary_goal = body.primary_goal
    stored = loads(business.scraped_profile_json, {}) or {}
    if body.growth_hypothesis:
        stored["growth_hypothesis"] = body.growth_hypothesis
    if body.growth_targets:
        stored["growth_targets"] = body.growth_targets
    if body.diagnostics is not None:
        stored["diagnostics"] = body.diagnostics.model_dump()
    if body.long_horizon_plan:
        stored["long_horizon_plan"] = body.long_horizon_plan
    business.scraped_profile_json = dumps(stored)
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(business)
    return {"business": _business_payload(business)}


@router.post("/preview-scan")
def preview_scan(
    body: WebsiteScanIn,
    user: User = Depends(get_current_user),
) -> dict:
    # Authenticated: this endpoint fetches a user-supplied URL AND spends Gemini
    # quota, so leaving it open made the API a free SSRF pivot and a quota faucet.
    _ = user
    try:
        scanned = scan_website(body.website_url)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"scan": scanned}


@router.post("/hypotheses", dependencies=[Depends(require_generation_access)])
def hypotheses(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    business, stored = _require_business(db, user)
    brand = stored.get("brand_language") or {}
    payload = _wizard_payload(business, stored)
    try:
        items = propose_hypotheses(
            payload,
            brand,
            stored.get("extracted") or {},
            stored.get("diagnostics"),
            stored.get("long_horizon_plan"),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    stored["hypotheses"] = items
    business.scraped_profile_json = dumps(stored)
    business.updated_at = datetime.utcnow()
    db.commit()
    return {"hypotheses": items}


def _require_business(db: Session, user: User) -> tuple[Business, dict]:
    business = db.query(Business).filter(Business.user_id == user.id).order_by(Business.id.desc()).first()
    if not business or not business.name or not business.business_type:
        raise HTTPException(status_code=400, detail="מלאו קודם את פרטי העסק.")
    return business, loads(business.scraped_profile_json, {}) or {}


def _wizard_payload(business: Business, stored: dict) -> dict:
    return {
        "name": business.name,
        "business_type": field_label(business.business_type),
        "offerings": business.offerings,
        "location": business.location,
        "presence_type": business.presence_type,
        "business_model": business.business_model or "products",
        "primary_goal": business.primary_goal,
        "monthly_budget_ils": business.monthly_budget_ils,
        "diagnostics": stored.get("diagnostics") or {},
    }


@router.post("/targets", dependencies=[Depends(require_generation_access)])
def targets(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Candidate growth targets for the owner to choose from and rank.

    A website scan is optional here: the diagnostics and profile are enough to propose
    real targets, so a business with no site can still complete the wizard.
    """
    business, stored = _require_business(db, user)
    try:
        items = propose_targets(
            _wizard_payload(business, stored),
            stored.get("brand_language") or {},
            stored.get("extracted") or {},
            stored.get("diagnostics"),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    stored["target_candidates"] = items
    business.scraped_profile_json = dumps(stored)
    business.updated_at = datetime.utcnow()
    db.commit()
    return {"targets": items}


@router.post("/plan", dependencies=[Depends(require_generation_access)])
def long_horizon_plan(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """The quarterly plan, built from the ranked targets *before* the monthly direction
    is chosen, so the month gets context instead of appearing from nowhere."""
    business, stored = _require_business(db, user)
    # A quarter carries three priorities. Rows saved before the cap existed may hold
    # more, so trim to the top three rather than fail the build.
    ranked = [str(item).strip() for item in (stored.get("growth_targets") or []) if str(item).strip()][:3]
    if not ranked:
        raise HTTPException(
            status_code=400,
            detail="בחרו את היעדים וסדרו אותם לפי החשיבות, ואז נבנה את התוכנית של הרבעון.",
        )
    try:
        plan = build_long_horizon_plan(
            _wizard_payload(business, stored),
            stored.get("brand_language") or {},
            stored.get("extracted") or {},
            ranked,
            stored.get("diagnostics"),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    stored["long_horizon_plan"] = plan
    business.scraped_profile_json = dumps(stored)
    business.updated_at = datetime.utcnow()
    db.commit()
    return {"long_horizon_plan": plan}


def _generation_precheck(business: Business | None) -> tuple[Business, dict]:
    """What a month needs before it can be built; the 400s a POST answers at once."""
    if not business or not business.business_type or not business.name:
        raise HTTPException(
            status_code=400,
            detail="מלאו קודם את פרטי העסק, ואז נבנה את התוכנית.",
        )
    stored = loads(business.scraped_profile_json, {}) or {}
    if not stored.get("brand_language") and not business.website_url:
        raise HTTPException(
            status_code=400,
            detail="הזינו את כתובת האתר של העסק, ואז נבנה את התוכנית.",
        )
    return business, stored


def _first_month_of(stored: dict) -> dict:
    """A plan built at /start names its first month (it starts two weeks out, so on the
    30th it is next month); the first generation builds that month, not today's."""
    start = (seed_from_stored(stored) or {}).get("start") or {}
    if isinstance(start.get("year"), int) and isinstance(start.get("month"), int) and 1 <= start["month"] <= 12:
        return {"year": start["year"], "month": start["month"]}
    return {}


def _first_month_payload(db: Session, business: Business, stored: dict, *, with_seed: bool = True) -> dict:
    """The business as the planner and the post writer read it, for the first month."""
    return {
        # The research hook in strategy.build_roadmap looks the business up by id.
        "id": business.id,
        "name": business.name,
        "website_url": business.website_url,
        "business_type": field_label(business.business_type),
        "offerings": business.offerings,
        "location": business.location,
        "presence_type": business.presence_type,
        "social_links": loads(business.social_links_json, {}),
        "monthly_budget_ils": business.monthly_budget_ils,
        "competitors": loads(business.competitors_json, []),
        "primary_goal": business.primary_goal,
        "business_model": business.business_model or "products",
        "growth_hypothesis": stored.get("growth_hypothesis", ""),
        "growth_targets": stored.get("growth_targets", []),
        "diagnostics": stored.get("diagnostics") or {},
        "long_horizon_plan": stored.get("long_horizon_plan") or None,
        # Who the content is for. Empty list = the business never defined a segment, and
        # then the plan and the posts are generated without one.
        "audiences": catalogue_for(db, business),
        # Usually empty at onboarding, and then the post prompt says so explicitly.
        "instagram_signal": signal_for(db, business),
        # From /onboarding/from-draft (absent otherwise): the first-meeting answers, and
        # the direction + idea the owner chose, which only the first month is built on.
        "owner_context": stored.get("owner_context") or None,
        "first_month_seed": seed_from_stored(stored) if with_seed else None,
        # Revision 8: what the owner chose to feature (week 2). [] until they choose.
        "featured_items": featured_items_from(stored),
    }


def _store_structure(db: Session, business: Business, state: dict, scraped_profile: dict) -> Strategy:
    """Store the first month from its saved plan stages: the structure, no posts (Revision 8).

    Weeks whose posts were already written (a build that started before Revision 8 and
    stopped at weeks 3–4) keep them and read "done"; every other week is "pending" until
    the owner asks for its posts (POST /onboarding/posts/start).
    """
    early = list(state.get("posts_early") or [])
    generated = month_from_state(state, scraped_profile, posts=[])
    strategy = upsert_generated_strategy(db, business, generated)
    db.flush()
    if early:
        year, month = generated["year"], generated["month"]
        tagged = attach_audiences(attach_tracking(early, _first_month_payload(db, business, scraped_profile), year, month),
                                  catalogue_for(db, business))
        weeks = {int(post.get("week") or 0) for post in tagged}
        extra = loads(strategy.roadmap_json, {}) or {}
        extra["roadmap"] = {**(extra.get("roadmap") or {}), "posts": tagged}
        strategy.roadmap_json = dumps(extra)
        month_posts.save_posts_status(
            strategy, {str(w): ("done" if w in weeks else "pending") for w in month_posts.WEEKS}
        )
    else:
        month_posts.save_posts_status(strategy, {str(w): "pending" for w in month_posts.WEEKS})
    return strategy


def run_first_month_stage(db: Session, business: Business) -> bool:
    """Run ONE stage of the business's first month and persist it. True once the month's
    structure is stored (onboarding complete, every week's posts "pending"). Raises on
    failure; the job retries it once.

    Revision 8: after signup only the structure is built (USP, weeks, focus, content mix,
    budget lines, KPI). The stage machine's post stages are not run here: posts are
    written later, per week, by the "posts" job (run_posts_stage).
    """
    business, stored = _generation_precheck(business)
    # Minimal first-run defaults. Everything else the old wizard asked for (diagnostics,
    # ranked targets, the quarter, the month's direction) is optional input here: the
    # planner proposes its own when it is missing — see DEFERRED_DECISIONS.
    business.business_model = normalise_model(business.business_model)
    business.primary_goal = default_goal(business.business_model, business.primary_goal)
    if business.monthly_budget_ils is None or business.monthly_budget_ils < 0:
        business.monthly_budget_ils = 0
    scan = stored if stored.get("brand_language") else None
    state = loads(business.generate_state_json, {}) or {}

    if state.get("stage") in {"posts", "posts_late", "done"} and scan is not None:
        # The plan stages are done (also: a build that stopped at its posts): store it.
        return _finish_structure(db, business, state, stored)

    payload = _first_month_payload(db, business, stored)

    def persist_stage(next_state: dict) -> None:
        business.generate_state_json = dumps(next_state)
        business.updated_at = datetime.utcnow()
        db.commit()

    first_month = _first_month_of(stored)

    def run() -> dict:
        return generate_monthly_strategy(
            payload,
            scan=scan,
            state=state,
            on_stage=persist_stage,
            one_stage=True,
            **first_month,
        )

    try:
        generated = run()
    except Exception:
        # First run now asks for competitor sites, and the first stage reads each one.
        # One unreachable competitor must not block the owner's month: retry that stage
        # once with the names only (the planner handles a site-less competitor already).
        first_stage = (state.get("stage") or "scan") in {"scan", "usp"}
        with_sites = [item for item in payload["competitors"] or [] if (item or {}).get("website_url")]
        if not (first_stage and with_sites):
            raise
        db.rollback()
        payload["competitors"] = [
            {"name": (item or {}).get("name") or "", "website_url": ""} for item in payload["competitors"]
        ]
        generated = run()

    # Without a saved scan the planner reads the site itself and hands back a fresh scan
    # dict. Merge it over what was stored, or the owner's saved decisions would be wiped.
    scraped_profile = generated["scraped_profile"]
    if scan is None:
        scraped_profile = {**stored, **(scraped_profile or {})}
    business.scraped_profile_json = dumps(scraped_profile)
    db.commit()

    after = generated.get("generate_state") or {}
    if generated.get("complete") or after.get("stage") in {"posts", "posts_late", "done"}:
        return _finish_structure(db, business, after, scraped_profile)
    return False


def _finish_structure(db: Session, business: Business, state: dict, scraped_profile: dict) -> bool:
    strategy = _store_structure(db, business, state, scraped_profile)
    business.generate_state_json = ""
    business.onboarding_complete = 1
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(strategy)
    try:
        deliver(
            business.webhooks,
            "strategy",
            {
                "business_id": business.id,
                "year": strategy.year,
                "month": strategy.month,
                "usp": state.get("usp") or {},
                "posts": "pending",
            },
            db=db,
        )
    except Exception:
        # The month is stored; a failing webhook must not turn it into a failed job.
        db.rollback()
    return True


def _posts_marker(db: Session, business: Business, job) -> str:
    strategy = generation_jobs.target_strategy(db, business, job)
    return dumps(month_posts.posts_status(strategy)) if strategy is not None else ""


def run_posts_stage(db: Session, business: Business) -> bool:
    """Write the posts of the next asked-for week of the month (one week per stage).
    True when no asked-for week is left. Raises on failure; the job retries it once."""
    job = generation_jobs.job_for(db, business.id)
    strategy = generation_jobs.target_strategy(db, business, job)
    if strategy is None:
        raise RuntimeError("עוד אין תוכנית לחודש. קודם בונים אותה, ואז כותבים את הפוסטים.")
    week = month_posts.next_queued(strategy)
    if week is None:
        return True
    stored = loads(business.scraped_profile_json, {}) or {}
    extra = loads(strategy.roadmap_json, {}) or {}
    roadmap = dict(extra.get("roadmap") or {})
    core = {key: value for key, value in roadmap.items() if key != "posts"}
    brand = stored.get("brand_language") or extra.get("brand_language") or {}
    # The /start seed (chosen direction, sample posts, cadence) belongs to the first month only.
    first = (
        db.query(Strategy)
        .filter(Strategy.business_id == business.id)
        .order_by(Strategy.year.asc(), Strategy.month.asc())
        .first()
    )
    payload = _first_month_payload(db, business, stored, with_seed=first is not None and first.id == strategy.id)
    written = write_week_posts(payload, loads(strategy.usp_json, {}) or {}, core, brand, week)
    existing = month_posts.month_posts(strategy)
    tagged = attach_audiences(
        attach_tracking(existing + written, payload, strategy.year, strategy.month), payload.get("audiences") or []
    )
    month_posts.add_week_posts(strategy, week, tagged[len(existing):])
    business.updated_at = datetime.utcnow()
    db.commit()
    return month_posts.next_queued(strategy) is None


def _posts_failed(db: Session, business: Business, job) -> None:
    strategy = generation_jobs.target_strategy(db, business, job)
    if strategy is not None:
        month_posts.stop_queue(strategy, month_posts.next_queued(strategy))


generation_jobs.register(generation_jobs.FIRST_MONTH, run_first_month_stage)
generation_jobs.register(generation_jobs.POSTS, run_posts_stage, marker=_posts_marker, on_fail=_posts_failed)


def _owned_business(db: Session, user: User) -> Business | None:
    return db.query(Business).filter(Business.user_id == user.id).order_by(Business.id.desc()).first()


def _first_month_strategy(db: Session, business: Business, year: int, month: int) -> Strategy | None:
    return (
        db.query(Strategy)
        .filter(Strategy.business_id == business.id, Strategy.year == year, Strategy.month == month)
        .first()
    )


@router.post("/generate", dependencies=[Depends(require_generation_access)])
def generate(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Start (or join) building the first month's structure in the background; answers at once.

    The job runs on the server stage by stage (services/generation_jobs.py) whether or
    not a tab stays open; poll `GET /onboarding/generate/status`. A POST while it runs
    joins it (a double click never starts a second build); a POST after it failed
    retries from the saved stage; a POST once the month exists answers with it (it never
    rebuilds a month whose posts may be written). `done` and `strategy` are set once the
    structure is stored; its weeks' posts are "pending" (POST /onboarding/posts/start).
    """
    business, stored = _generation_precheck(_owned_business(db, user))
    first_month = _first_month_of(stored)
    today = datetime.utcnow()
    year, month = first_month.get("year") or today.year, first_month.get("month") or today.month
    existing = _first_month_strategy(db, business, year, month)
    if existing is not None and business.onboarding_complete and not generation_jobs.stage_of(business):
        job = generation_jobs.status(db, business)
    else:
        job = generation_jobs.start(db, business, generation_jobs.FIRST_MONTH, year, month)
    db.refresh(business)
    built = _first_month_strategy(db, business, year, month)
    done = built is not None and bool(business.onboarding_complete) and not job["running"]
    response: dict = {
        "done": done,
        "job": job,
        "business": _business_payload(business),
        "generate_state": loads(business.generate_state_json, {}) or {},
    }
    if done:
        response["strategy"] = serialize_strategy(built, business)
    return response


@router.get("/generate/status")
def generate_status(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """The business's month job: `{stage, stage_label_he, label_he, started_at,
    updated_at, error_he, done, running, status, kind, posts, ...}` (generation_jobs.status).

    Covers the first month, its posts and the next month alike (`kind`); `posts` is the
    per-week state of that month's posts. Polling it also resumes a job whose process
    died, so the page never has to drive the build itself.
    """
    business = _owned_business(db, user)
    if not business:
        raise HTTPException(status_code=404, detail="עוד אין עסק.")
    return generation_jobs.status(db, business)


class PostsStartIn(BaseModel):
    # One week, or every week that is not written yet when omitted.
    week: int | None = Field(default=None, ge=1, le=4)


@router.post("/posts/start", dependencies=[Depends(require_generation_access)])
def start_posts(
    body: PostsStartIn | None = Body(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Write the month's posts in the background — one week, or all weeks still pending.

    Revision 8: the first month is built without posts; this is "להתחיל לכתוב את
    הפוסטים", once the owner has chosen what to feature (`featured_items`) and added
    media. Same job machinery as the month (one job per business, resumable, one retry
    per week, Muse timeout → Gemini). Answers at once with the status (its `posts` says
    each week's state); poll GET /onboarding/generate/status.
    """
    business = _owned_business(db, user)
    if not business:
        raise HTTPException(status_code=404, detail="עוד אין עסק.")
    strategy = generation_jobs.target_strategy(db, business)
    if strategy is None:
        raise HTTPException(status_code=400, detail="עוד אין תוכנית לחודש. קודם בונים אותה, ואז כותבים את הפוסטים.")
    running = generation_jobs.busy(db, business)
    if running is not None and running.kind != generation_jobs.POSTS:
        raise HTTPException(
            status_code=409,
            detail="עוד בונים את התוכנית של החודש. נכתוב את הפוסטים כשהיא תהיה מוכנה.",
        )
    weeks = [body.week] if body and body.week else None
    queued = month_posts.queue_weeks(strategy, weeks)
    db.commit()
    if not queued:
        return generation_jobs.status(db, business)
    # A posts job already running picks the new weeks up; otherwise this starts one.
    return generation_jobs.start(db, business, generation_jobs.POSTS, strategy.year, strategy.month)
