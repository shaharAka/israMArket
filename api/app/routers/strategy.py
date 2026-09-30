from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.config import get_settings
from app.deps import get_business
from app.models import Asset, Business, PerformanceSnapshot, Recommendation, Strategy
from app.schemas import (
    PostApprovalIn,
    PostAssetIn,
    PostDesignIn,
    PostImageIn,
    PostPublishIn,
    PostRewriteIn,
    PostScheduleIn,
    PostSuggestAssetsIn,
    PostUpdateIn,
    StrategyApproveIn,
)
from app.services import generation_jobs
from app.services.assets import (
    asset_catalogue,
    suggest_assets,
)
from app.services.audiences import catalogue_for
from app.services.calendar_il import gregorian_month_meta, israeli_events_for_month
from app.services.designer import apply_creative_to_post, design_and_generate_post, plan_post_design
from app.services.images import (
    generate_and_store,
    image_public_url,
    needs_photo,
    read_stored_bytes,
    store_image_bytes,
)
from app.services.instagram_signal import signal_for
from app.services.jsonutil import dumps, loads
from app.services.meta import account_digest
from app.services.month_loop import horizon_payload, next_civil_month, prior_month_review
from app.services.publish import parse_scheduled_for
from app.services.scraper import fetch_photo_candidates
from app.services.strategy import featured_items_from, generate_monthly_strategy, rewrite_post
from app.services.business_fields import field_label
from app.services.billing import require_generation_access  # the one billing gate

router = APIRouter(tags=["strategy"])


def serialize_strategy(
    strategy: Strategy,
    business: Business | None = None,
    horizon: dict | None = None,
) -> dict:
    extra = loads(strategy.roadmap_json, {})
    scraped = loads(business.scraped_profile_json, {}) if business else {}
    roadmap = extra.get("roadmap") or {}
    usp = loads(strategy.usp_json, {})
    payload = {
        "id": strategy.id,
        **gregorian_month_meta(strategy.year, strategy.month),
        "year": strategy.year,
        "month": strategy.month,
        "usp": usp,
        "calendar": loads(strategy.calendar_json, []),
        "posting_plan": extra.get("posting_plan"),
        "roadmap": roadmap,
        "relevant_events": roadmap.get("relevant_events") or [],
        "long_horizon_plan": roadmap.get("long_horizon_plan") or {},
        "monthly_horizon_plan": roadmap.get("monthly_horizon_plan") or {},
        "management_and_checkpoints": roadmap.get("management_and_checkpoints") or {},
        "weekly_breakdown": roadmap.get("weekly_breakdown") or [],
        "competitors": extra.get("competitors"),
        "brand_language": extra.get("brand_language") or scraped.get("brand_language"),
        "created_at": strategy.created_at.isoformat(),
        # Onboarding v2 revision 5 (additive): the 3-month plan saved at signup.
        "quarter_plan": (scraped or {}).get("quarter_plan"),
    }
    if horizon:
        payload["horizon"] = horizon
    return payload


def upsert_generated_strategy(db: Session, business: Business, generated: dict) -> Strategy:
    existing = (
        db.query(Strategy)
        .filter(
            Strategy.business_id == business.id,
            Strategy.year == generated["year"],
            Strategy.month == generated["month"],
        )
        .first()
    )
    payload = dumps(
        {
            "posting_plan": generated["posting_plan"],
            "roadmap": generated["roadmap"],
            "competitors": generated["competitors"],
            "brand_language": generated["brand_language"],
        }
    )
    if existing:
        existing.usp_json = dumps(generated["usp"])
        existing.calendar_json = dumps(generated["calendar"])
        existing.roadmap_json = payload
        return existing
    strategy = Strategy(
        business_id=business.id,
        year=generated["year"],
        month=generated["month"],
        usp_json=dumps(generated["usp"]),
        calendar_json=dumps(generated["calendar"]),
        roadmap_json=payload,
    )
    db.add(strategy)
    return strategy


def _strategy_for_month(db: Session, business: Business, year: int, month: int) -> Strategy | None:
    return (
        db.query(Strategy)
        .filter(Strategy.business_id == business.id, Strategy.year == year, Strategy.month == month)
        .first()
    )


def _newest_strategy(db: Session, business: Business) -> Strategy | None:
    return (
        db.query(Strategy)
        .filter(Strategy.business_id == business.id)
        .order_by(Strategy.year.desc(), Strategy.month.desc())
        .first()
    )


def _horizon_for(db: Session, business: Business, strategy: Strategy) -> dict:
    year, month = next_civil_month(strategy.year, strategy.month)
    existing = _strategy_for_month(db, business, year, month)
    state = loads(business.generate_state_json, {}) or {}
    stage = None
    if state.get("year") == year and state.get("month") == month:
        stage = state.get("stage")
    return horizon_payload(strategy.year, strategy.month, next_exists=bool(existing), next_stage=stage)


def _local_photos(scraped: dict) -> list[dict]:
    """Photos already stored during the scan, re-read from disk (no network)."""
    out: list[dict] = []
    for item in scraped.get("real_photos") or []:
        loaded = read_stored_bytes(item.get("public_url", ""))
        if loaded:
            data, mime = loaded
            out.append({"url": item.get("url", ""), "mime": mime, "bytes": data})
    return out


def _candidate_photos(scraped: dict) -> list[dict]:
    """The business's own usable photographs, or [] if there are none.

    If the scan already ran the vision check, its verdict is final — an empty result
    means "everything was rejected", NOT "we never looked". Re-fetching here used to
    silently bypass the filter and put a supplier's promo banner (or a blurred
    snapshot) on the customer's cards.
    """
    if scraped.get("photos_checked"):
        return _local_photos(scraped)

    # Older scans predate the flag: fetch, then apply the same check before use.
    from app.services.brand import filter_usable_photos

    return filter_usable_photos(
        fetch_photo_candidates((scraped.get("raw") or {}).get("image_urls") or [])
    )


def _produce_post_image(
    business: Business,
    post: dict,
    brand: dict,
    biz_dict: dict,
    scraped_photos: list[dict],
    force: bool = False,
    allow_generation: bool = True,
    preference: str = "auto",
) -> str:
    """Decide where a card's image comes from.

    `preference` is the user's explicit intent ("real" / "ai" / "auto"), kept separate
    from `force` (which only means "redo the work"). Conflating the two made
    "use my own photo" fall through to no image at all.
    """
    settings = get_settings()

    if not needs_photo(post.get("overlay_theme")):
        # Typographic cards carry no photograph on purpose. Say so, rather than
        # silently emptying the image and leaving the owner to guess why nothing came.
        post["image_url"] = ""
        post["image_source"] = "none"
        post["image_action"] = "no_photo_theme"
        return ""

    def use_real_photo() -> str:
        photo = scraped_photos[0]
        url = store_image_bytes(
            business.id,
            post.get("title") or "post",
            photo["bytes"],
            photo["mime"],
            post.get("week", 0),
        )
        post["image_source"] = "real_photo"
        post["image_source_url"] = photo.get("url", "")
        post["image_action"] = "real_photo"
        return url

    def leave_without_image() -> str:
        post["image_url"] = ""
        post["image_source"] = "pending"
        post["image_action"] = "pending"
        return ""

    if preference == "real":
        return use_real_photo() if scraped_photos else leave_without_image()

    if preference == "ai":
        if not allow_generation:
            return leave_without_image()
        references = [(p["bytes"], p["mime"]) for p in scraped_photos[:3]] or None
        url = generate_and_store(business.id, post, brand, biz_dict, references=references)
        post["image_source"] = "generated"
        post["image_source_url"] = ""
        post["image_action"] = "generated"
        return url

    # auto: prefer the business's own photograph.
    if settings.real_photo_first and scraped_photos and not force:
        return use_real_photo()
    if not allow_generation:
        return leave_without_image()
    references = [(p["bytes"], p["mime"]) for p in scraped_photos[:3]] or None
    url = generate_and_store(business.id, post, brand, biz_dict, references=references)
    post["image_source"] = "generated"
    post["image_action"] = "generated"
    post["image_source_url"] = ""
    return url


def _store_post_image(
    business: Business,
    strategy: Strategy,
    post_index: int,
    force: bool = False,
    vibe: str = "",
    custom_prompt: str = "",
    allow_generation: bool = True,
    preference: str = "auto",
) -> dict:
    extra = loads(strategy.roadmap_json, {})
    roadmap = extra.get("roadmap") or {}
    posts = list(roadmap.get("posts") or [])
    if post_index >= len(posts):
        raise HTTPException(status_code=404, detail="הפוסט לא נמצא בתוכנית")
    if not force and posts[post_index].get("image_url") and not vibe and not custom_prompt:
        # Nothing to do — but the caller must be able to tell "we generated something"
        # apart from "we kept what was already there". Without this the UI showed a
        # success toast for work that never happened, which reads as a broken button.
        posts[post_index]["image_action"] = "kept_existing"
        return posts[post_index]

    scraped = loads(business.scraped_profile_json, {}) or {}
    brand = extra.get("brand_language") or scraped.get("brand_language") or {}
    if not brand:
        raise HTTPException(status_code=400, detail="עוד לא קראנו את האתר, ולכן אין לנו את הצבעים והסגנון שלכם. קראו את האתר לפני שיוצרים תמונות.")

    target = posts[post_index]
    usp_data = loads(strategy.usp_json, {}) or {}
    biz_dict = {
        "name": business.name,
        "business_type": field_label(business.business_type),
        "offerings": business.offerings,
        "location": business.location,
        "presence_type": business.presence_type,
        "primary_goal": business.primary_goal,
        "business_model": business.business_model or "products",
        "growth_hypothesis": usp_data.get("growth_hypothesis") or "",
    }

    # The business's real photographs, used both as the card image and as style
    # references for generation. Fetched once per call.
    scraped_photos = _candidate_photos(scraped)

    def provide(target_post: dict) -> str:
        return _produce_post_image(
            business,
            target_post,
            brand,
            biz_dict,
            scraped_photos,
            force=force,
            allow_generation=allow_generation,
            preference=preference,
        )

    if not target.get("design_creative") or force or vibe or custom_prompt:
        target, _ = design_and_generate_post(
            business.id,
            target,
            brand,
            biz_dict,
            vibe=vibe,
            custom_prompt=custom_prompt,
            generate_image=True,
            image_provider=provide,
        )
    else:
        target["image_url"] = provide(target)

    posts[post_index] = target
    extra["roadmap"] = {**roadmap, "posts": posts}
    strategy.roadmap_json = dumps(extra)
    return posts[post_index]


def _active_strategy(db: Session, business: Business) -> Strategy:
    today = date.today()
    civil = _strategy_for_month(db, business, today.year, today.month)
    if civil:
        return civil
    strategy = _newest_strategy(db, business)
    if not strategy:
        raise HTTPException(status_code=404, detail="עוד אין תוכנית. בנו את התוכנית של החודש קודם.")
    return strategy


@router.get("/strategy/quarter")
def quarter_plan(business: Business = Depends(get_business)) -> dict:
    """The 3-month plan built at /start, and its integrations checklist. Readable right
    after signup, before (and while) the first month is generated. `quarter_plan` is
    null for businesses that did not come through /start."""
    stored = loads(business.scraped_profile_json, {}) or {}
    return {
        "quarter_plan": stored.get("quarter_plan"),
        "integrations_checklist": stored.get("integrations_checklist") or [],
        "long_horizon_plan": stored.get("long_horizon_plan"),
    }


@router.get("/strategy/current")
def current_strategy(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    strategy = _active_strategy(db, business)
    return serialize_strategy(strategy, business, horizon=_horizon_for(db, business, strategy))


@router.post("/strategy/posts/image", dependencies=[Depends(require_generation_access)])
def generate_post_image(
    body: PostImageIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    strategy = _active_strategy(db, business)
    try:
        post = _store_post_image(
            business,
            strategy,
            body.post_index,
            force=body.force,
            vibe=body.vibe,
            custom_prompt=body.custom_prompt,
            allow_generation=body.allow_generation,
            preference=body.image_preference,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(strategy)
    return {"post": post, "strategy": serialize_strategy(strategy, business)}


@router.post("/strategy/posts/design", dependencies=[Depends(require_generation_access)])
def design_post_endpoint(
    body: PostDesignIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    strategy = _active_strategy(db, business)
    extra = loads(strategy.roadmap_json, {})
    roadmap = extra.get("roadmap") or {}
    posts = list(roadmap.get("posts") or [])
    if body.post_index >= len(posts):
        raise HTTPException(status_code=404, detail="הפוסט לא נמצא בתוכנית")

    scraped = loads(business.scraped_profile_json, {}) or {}
    brand = extra.get("brand_language") or scraped.get("brand_language") or {}
    if not brand:
        raise HTTPException(status_code=400, detail="עוד לא קראנו את האתר, ולכן אין לנו את הצבעים והסגנון שלכם. קראו את האתר לפני שמעצבים פוסטים.")

    target = posts[body.post_index]
    usp_data = loads(strategy.usp_json, {}) or {}
    biz_dict = {
        "name": business.name,
        "business_type": field_label(business.business_type),
        "offerings": business.offerings,
        "location": business.location,
        "presence_type": business.presence_type,
        "primary_goal": business.primary_goal,
        "business_model": business.business_model or "products",
        "growth_hypothesis": usp_data.get("growth_hypothesis") or "",
    }
    try:
        target, image_url = design_and_generate_post(
            business.id,
            target,
            brand,
            biz_dict,
            vibe=body.vibe,
            custom_prompt=body.custom_prompt,
            generate_image=body.generate_image,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"לא הצלחנו לעצב את הפוסט: {exc}") from exc

    posts[body.post_index] = target
    extra["roadmap"] = {**roadmap, "posts": posts}
    strategy.roadmap_json = dumps(extra)
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(strategy)
    return {"post": target, "strategy": serialize_strategy(strategy, business)}


@router.post("/strategy/posts/asset")
def attach_post_asset(
    body: PostAssetIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    """Point a post's image at one of the business's own assets.

    Ownership is checked against the caller's business, so an id from another account
    404s rather than exposing somebody else's media URL.
    """
    strategy = _active_strategy(db, business)
    asset = (
        db.query(Asset)
        .filter(Asset.id == body.asset_id, Asset.business_id == business.id)
        .first()
    )
    if not asset:
        raise HTTPException(status_code=404, detail="לא מצאנו את התמונה הזו")

    extra = loads(strategy.roadmap_json, {})
    roadmap = extra.get("roadmap") or {}
    posts = list(roadmap.get("posts") or [])
    if body.post_index >= len(posts):
        raise HTTPException(status_code=404, detail="הפוסט לא נמצא בתוכנית")

    target = posts[body.post_index]
    target["image_url"] = image_public_url(asset.business_id, asset.filename)
    target["image_source"] = "asset"
    target["image_asset_id"] = asset.id
    target["image_action"] = "asset"
    target["image_source_url"] = asset.source_url or ""
    posts[body.post_index] = target
    extra["roadmap"] = {**roadmap, "posts": posts}
    strategy.roadmap_json = dumps(extra)
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(strategy)
    return {"post": target, "strategy": serialize_strategy(strategy, business)}


@router.post("/strategy/posts/suggest-assets")
def suggest_post_assets(
    body: PostSuggestAssetsIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    """Which of the business's own assets best fit this post, and why.

    A real model call over the post's copy and the library's descriptions/tags. The
    result is filtered against the ids that actually exist before it is returned, so a
    hallucinated id can never reach the client.
    """
    strategy = _active_strategy(db, business)
    extra = loads(strategy.roadmap_json, {})
    posts = list((extra.get("roadmap") or {}).get("posts") or [])
    if body.post_index >= len(posts):
        raise HTTPException(status_code=404, detail="הפוסט לא נמצא בתוכנית")

    assets = (
        db.query(Asset)
        .filter(Asset.business_id == business.id)
        .order_by(Asset.created_at.desc(), Asset.id.desc())
        .all()
    )
    if not assets:
        # No library, no call — an empty list is the honest answer.
        return {"suggestions": []}

    try:
        suggestions = suggest_assets(
            posts[body.post_index], business.name or "", asset_catalogue(assets)
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"לא הצלחנו להתאים תמונות לפוסט: {exc}") from exc
    return {"suggestions": suggestions}


@router.post("/strategy/posts/images", dependencies=[Depends(require_generation_access)])
def generate_all_post_images(
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    strategy = _active_strategy(db, business)
    extra = loads(strategy.roadmap_json, {})
    posts = list((extra.get("roadmap") or {}).get("posts") or [])
    errors: list[str] = []
    for index, post in enumerate(posts):
        if post.get("image_url"):
            continue
        try:
            _store_post_image(business, strategy, index)
        except Exception as exc:
            errors.append(f"פוסט {index + 1}: {exc}")
    if errors and not any(item.get("image_url") for item in loads(strategy.roadmap_json, {}).get("roadmap", {}).get("posts", [])):
        raise HTTPException(status_code=502, detail=errors[0])
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(strategy)
    return {"strategy": serialize_strategy(strategy, business), "errors": errors}


@router.post("/strategy/posts/save")
def save_post(
    body: PostUpdateIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    strategy = _active_strategy(db, business)
    extra = loads(strategy.roadmap_json, {})
    roadmap = extra.get("roadmap") or {}
    posts = list(roadmap.get("posts") or [])
    if body.post_index >= len(posts):
        raise HTTPException(status_code=404, detail="הפוסט לא נמצא בתוכנית")

    target = posts[body.post_index]
    target["title"] = body.title
    target["format"] = body.format
    target["hook"] = body.hook
    target["caption"] = body.caption
    target["cta"] = body.cta
    target["has_overlay"] = body.has_overlay
    headline = body.overlay_headline or (body.overlay_text if body.has_overlay else "")
    target["overlay_headline"] = headline
    target["overlay_badge"] = body.overlay_badge
    target["overlay_theme"] = body.overlay_theme
    target["overlay_text"] = headline if body.has_overlay else ""
    if body.creative_concept:
        target["creative_concept"] = body.creative_concept
    if body.visual_style:
        target["visual_style"] = body.visual_style
    if body.image_prompt:
        target["image_prompt"] = body.image_prompt
        target["scene_description"] = body.image_prompt

    if body.date_hint:
        target["date_hint"] = body.date_hint
    target["primary_outlet"] = body.primary_outlet
    target["outlets"] = body.outlets
    target["approval_status"] = "review"
    target["approved_at"] = None
    if "outlet_captions" not in target or not isinstance(target["outlet_captions"], dict):
        target["outlet_captions"] = {}
    target["outlet_captions"][body.primary_outlet] = body.caption

    posts[body.post_index] = target
    extra["roadmap"] = {**roadmap, "posts": posts}
    strategy.roadmap_json = dumps(extra)
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(strategy)
    return {"post": target, "strategy": serialize_strategy(strategy, business)}


@router.post("/strategy/posts/rewrite", dependencies=[Depends(require_generation_access)])
def rewrite_post_endpoint(
    body: PostRewriteIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    strategy = _active_strategy(db, business)
    extra = loads(strategy.roadmap_json, {})
    roadmap = extra.get("roadmap") or {}
    posts = list(roadmap.get("posts") or [])
    if body.post_index >= len(posts):
        raise HTTPException(status_code=404, detail="הפוסט לא נמצא בתוכנית")

    brand = extra.get("brand_language") or (loads(business.scraped_profile_json, {}) or {}).get("brand_language") or {}
    target = posts[body.post_index]
    try:
        rewritten = rewrite_post(
            target, body.tone, brand, instagram=signal_for(db, business, strategy.year, strategy.month)
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"לא הצלחנו לכתוב את הפוסט מחדש: {exc}") from exc

    target["title"] = rewritten.get("title") or target["title"]
    target["hook"] = rewritten.get("hook") or target["hook"]
    target["caption"] = rewritten.get("caption") or target["caption"]
    target["cta"] = rewritten.get("cta") or target["cta"]
    target["overlay_text"] = rewritten.get("overlay_text") or target["overlay_text"]
    if rewritten.get("outlet_captions"):
        target["outlet_captions"] = rewritten["outlet_captions"]
    if "inspiration" in rewritten:
        target["inspiration"] = rewritten["inspiration"]
    target["approval_status"] = "review"
    target["approved_at"] = None

    posts[body.post_index] = target
    extra["roadmap"] = {**roadmap, "posts": posts}
    strategy.roadmap_json = dumps(extra)
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(strategy)
    return {"post": target, "strategy": serialize_strategy(strategy, business)}


@router.post("/strategy/posts/approve")
def approve_post(
    body: PostApprovalIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    strategy = _active_strategy(db, business)
    extra = loads(strategy.roadmap_json, {})
    roadmap = extra.get("roadmap") or {}
    posts = list(roadmap.get("posts") or [])
    if body.post_index >= len(posts):
        raise HTTPException(status_code=404, detail="הפוסט לא נמצא בתוכנית")

    target = posts[body.post_index]
    target["approval_status"] = "approved" if body.approved else "review"
    target["approved_at"] = datetime.utcnow().isoformat() if body.approved else None
    posts[body.post_index] = target
    extra["roadmap"] = {**roadmap, "posts": posts}
    strategy.roadmap_json = dumps(extra)
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(strategy)
    return {"post": target, "strategy": serialize_strategy(strategy, business)}


@router.post("/strategy/posts/schedule")
def schedule_post(
    body: PostScheduleIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    """Set (or clear) the day a post should go out.

    The date is what the publishing queue sorts on, so it is validated strictly: a value
    that cannot be read back is rejected with a Hebrew message rather than stored.
    `scheduled_at` records when the owner set it, not when the post will go out.
    """
    strategy = _active_strategy(db, business)
    extra = loads(strategy.roadmap_json, {})
    roadmap = extra.get("roadmap") or {}
    posts = list(roadmap.get("posts") or [])
    if body.post_index >= len(posts):
        raise HTTPException(status_code=404, detail="הפוסט לא נמצא בתוכנית")

    try:
        scheduled_for = parse_scheduled_for(body.scheduled_for)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    target = posts[body.post_index]
    target["scheduled_for"] = scheduled_for
    target["scheduled_at"] = datetime.utcnow().isoformat() if scheduled_for else None
    posts[body.post_index] = target
    extra["roadmap"] = {**roadmap, "posts": posts}
    strategy.roadmap_json = dumps(extra)
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(strategy)
    return {"post": target, "strategy": serialize_strategy(strategy, business)}


@router.post("/strategy/posts/publish")
def publish_post(
    body: PostPublishIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    strategy = _active_strategy(db, business)
    extra = loads(strategy.roadmap_json, {})
    roadmap = extra.get("roadmap") or {}
    posts = list(roadmap.get("posts") or [])
    if body.post_index >= len(posts):
        raise HTTPException(status_code=404, detail="הפוסט לא נמצא בתוכנית")
    target = posts[body.post_index]
    target["published_url"] = body.published_url
    target["published_at"] = datetime.utcnow().isoformat()
    posts[body.post_index] = target
    extra["roadmap"] = {**roadmap, "posts": posts}
    strategy.roadmap_json = dumps(extra)
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(strategy)
    return {"post": target, "strategy": serialize_strategy(strategy, business)}


def _next_month_target(db: Session, business: Business) -> tuple[Strategy, int, int, dict, bool]:
    """(source month, next year, next month, saved state, whether that state is for it)."""
    source = _active_strategy(db, business)
    year, month = next_civil_month(source.year, source.month)
    state = loads(business.generate_state_json, {}) or {}
    resume = state.get("year") == year and state.get("month") == month
    return source, year, month, state, resume


def run_next_month_stage(db: Session, business: Business) -> bool:
    """Run ONE stage of the next month and persist it; True once it is stored. Raises on
    failure (the background job retries it once). What `POST /strategy/next-month` did
    per call before month generation moved to services/generation_jobs.py."""
    source, year, month, state, resume = _next_month_target(db, business)
    existing = _strategy_for_month(db, business, year, month)
    if existing and not resume:
        return True

    stored = loads(business.scraped_profile_json, {}) or {}
    if not stored.get("brand_language"):
        raise RuntimeError("עוד לא קראנו את האתר. בלי הצבעים והסגנון שלכם אי אפשר לבנות חודש.")

    snap = (
        db.query(PerformanceSnapshot)
        .filter(PerformanceSnapshot.business_id == business.id)
        .order_by(PerformanceSnapshot.created_at.desc())
        .first()
    )
    rec = (
        db.query(Recommendation)
        .filter(Recommendation.business_id == business.id)
        .order_by(Recommendation.created_at.desc())
        .first()
    )
    prior = prior_month_review(
        serialize_strategy(source, business),
        {
            "ga4": loads(snap.ga4_json, {}),
            "diagnostic": loads(snap.diagnostic_json, {}),
            "instagram_account": account_digest((loads(snap.meta_json, {}) or {}).get("account")),
        }
        if snap
        else None,
        {"suggestions": loads(rec.suggestions_json, {})} if rec else None,
    )
    payload = {
        # Lets services/research.research_prompt_block find this business's latest research.
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
        "growth_hypothesis": prior.get("growth_hypothesis") or "",
        "growth_targets": (prior.get("long_horizon") or {}).get("targets") or [],
        # The segments the next month is planned for. Empty when none were defined.
        "audiences": catalogue_for(db, business),
        # Own top Instagram posts + the month's inspiration brief (or an honest "none").
        "instagram_signal": signal_for(db, business, year, month),
        # What the owner told us at /start (seasons, what they tried...). Absent for
        # businesses onboarded before v2. The first-month seed deliberately stays out.
        "owner_context": stored.get("owner_context") or None,
        # Revision 8: the products/services the owner chose to feature, when they have.
        "featured_items": featured_items_from(stored),
    }

    def persist_stage(next_state: dict) -> None:
        business.generate_state_json = dumps(next_state)
        business.updated_at = datetime.utcnow()
        db.commit()

    generated = generate_monthly_strategy(
        payload,
        year=year,
        month=month,
        scan=stored if stored.get("brand_language") else None,
        state=state if resume else {},
        on_stage=persist_stage,
        one_stage=True,
        prior=prior,
    )
    if not generated.get("complete"):
        return False

    upsert_generated_strategy(db, business, generated)
    business.generate_state_json = ""
    business.updated_at = datetime.utcnow()
    db.commit()
    return True


generation_jobs.register(generation_jobs.NEXT_MONTH, run_next_month_stage)


@router.post("/strategy/next-month", dependencies=[Depends(require_generation_access)])
def generate_next_month(
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    """Start (or join) building the next month in the background, and return at once.

    Poll `GET /onboarding/generate/status` (kind "next_month"). When the next month
    already exists (and nothing is mid-way for it) this answers `done` with it, as before.
    """
    source, year, month, _state, resume = _next_month_target(db, business)
    existing = _strategy_for_month(db, business, year, month)
    if existing and not resume:
        return {
            "done": True,
            "strategy": serialize_strategy(existing, business, horizon=_horizon_for(db, business, existing)),
        }

    stored = loads(business.scraped_profile_json, {}) or {}
    if not stored.get("brand_language"):
        raise HTTPException(status_code=400, detail="עוד לא קראנו את האתר. בלי הצבעים והסגנון שלכם אי אפשר לבנות חודש.")

    job = generation_jobs.start(db, business, generation_jobs.NEXT_MONTH, year, month)
    db.refresh(business)
    response: dict = {
        "done": False,
        "job": job,
        "business": {"generate_state": loads(business.generate_state_json, {}) or {}},
        "generate_state": loads(business.generate_state_json, {}) or {},
    }
    built = _strategy_for_month(db, business, year, month)
    if job["kind"] == generation_jobs.NEXT_MONTH and job["done"] and built is not None:
        response["done"] = True
        response["strategy"] = serialize_strategy(built, business, horizon=_horizon_for(db, business, source))
    return response


@router.post("/strategy/approve")
def approve_strategy(
    body: StrategyApproveIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    strategy = _active_strategy(db, business)
    extra = loads(strategy.roadmap_json, {})
    roadmap = extra.get("roadmap") or {}
    mgmnt = roadmap.get("management_and_checkpoints") or {}
    mgmnt["user_approved"] = body.approved
    mgmnt["approved_at"] = datetime.utcnow().isoformat()
    if body.monthly_notes:
        mgmnt["monthly_notes"] = body.monthly_notes
    roadmap["management_and_checkpoints"] = mgmnt
    extra["roadmap"] = roadmap
    strategy.roadmap_json = dumps(extra)
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(strategy)
    return {"ok": True, "strategy": serialize_strategy(strategy, business)}


@router.get("/strategy/studio")
def studio_overview(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    strat = _active_strategy(db, business)
    serialized = serialize_strategy(strat, business)
    roadmap = serialized.get("roadmap") or {}
    posts = roadmap.get("posts") or []
    ready_count = sum(1 for p in posts if p.get("image_url"))
    mgmnt = serialized.get("management_and_checkpoints") or {}
    approved = mgmnt.get("user_approved", False)

    updates = [
        {
            "id": "posts-ready",
            "type": "posts",
            "title": f"{len(posts)} פוסטים בתוכנית החודשית",
            "description": f"ל-{ready_count} מתוך {len(posts)} פוסטים יש כבר תמונה בסגנון של האתר",
            "action_label": "לעבור לפוסטים",
            "action_tab": "posts",
            "status": "ready" if ready_count == len(posts) else "action_required",
        },
        {
            "id": "brand-sync",
            "type": "brand",
            "title": "הצבעים והסגנון מהאתר",
            "description": f"הצבעים, סגנון הצילום וסגנון הכתיבה נלקחו מ-{business.website_url or 'התמונות של העסק'}",
            "action_label": "לראות את הסגנון",
            "action_tab": "brand",
            "status": "ready",
        },
        {
            "id": "hypothesis-approval",
            "type": "checkpoint",
            "title": "ההשערה של החודש",
            "description": roadmap.get("monthly_horizon_plan", {}).get("hypothesis")
            or "ההשערה של החודש מוכנה לבדיקה",
            "action_label": "לאשר את ההשערה" if not approved else "ההשערה אושרה ✓",
            "action_tab": "schedule",
            "status": "ready" if approved else "action_required",
        },
    ]

    return {
        "strategy": serialized,
        "studio_updates": updates,
        "long_horizon_tracker": {
            "horizon": roadmap.get("long_horizon_plan", {}).get("horizon") or "הרבעון הקרוב",
            "hypothesis": roadmap.get("long_horizon_plan", {}).get("hypothesis") or serialized.get("usp", {}).get("growth_hypothesis", ""),
            "targets": roadmap.get("long_horizon_plan", {}).get("targets") or serialized.get("usp", {}).get("growth_targets", []),
            "milestones": roadmap.get("long_horizon_plan", {}).get("milestones") or [],
            "progress_pct": None,
        },
        "monthly_analysis": {
            "month_name": serialized.get("month_name_he"),
            "hypothesis": roadmap.get("monthly_horizon_plan", {}).get("hypothesis") or "",
            "targets": roadmap.get("monthly_horizon_plan", {}).get("targets") or [],
            "status": "active",
            "what_we_measure": "פניות בוואטסאפ, הזמנות מהאתר ואיסופים בימי שישי",
        },
    }


@router.get("/calendar")
def calendar(year: int, month: int, business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    events = israeli_events_for_month(year, month)
    strategy = (
        db.query(Strategy)
        .filter(Strategy.business_id == business.id, Strategy.year == year, Strategy.month == month)
        .first()
    )
    return {
        **gregorian_month_meta(year, month),
        "events": events,
        "roadmap": loads(strategy.roadmap_json, {}).get("roadmap") if strategy else None,
    }
