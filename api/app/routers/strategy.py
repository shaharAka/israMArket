import copy
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import ValidationError
from sqlalchemy import update
from sqlalchemy.orm import Session, object_session

from app.db import get_db
from app.config import get_settings
from app.deps import get_business
from app.models import Asset, Business, PerformanceSnapshot, Recommendation, Strategy, User
from app.schemas import (
    PostApprovalIn,
    PostCreateIn,
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
from app.services import (
    billing,
    connected_posts,
    design_dna,
    generation_jobs,
    hypotheses,
    image_jobs,
    photo_analysis,
    photo_choice,
    post_rewrite,
    plan_editing,
    quick_posts,
)
from app.services.assets import (
    asset_catalogue,
    suggest_assets,
)
from app.services.audiences import catalogue_for
from app.services.calendar_il import gregorian_month_meta, israeli_events_for_month
from app.services.designer import design_and_generate_post, vibe_composition
from app.services.image_routing import edit_for_post, generate_for_post
from app.services.images import image_public_url, read_stored_bytes, store_image_bytes
from app.services.post_design import (
    assign_designs,
    clean_design,
    dna_compositions,
    ensure_post_design,
    make_design,
    photo_fields,
    post_needs_photo,
    sync_text_mode,
    view_designs,
)
from app.services.instagram_signal import signal_for
from app.services import content_language
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
    if isinstance(roadmap, dict) and isinstance(roadmap.get("posts"), list):
        # docs/posts-v2.md: every post with the contract fields (uid, channel, plan_link,
        # why_line, owner_needs, measure, results, lifecycle...), old posts included.
        roadmap = {**roadmap, "posts": _connected(strategy, roadmap, business)}
    usp = loads(strategy.usp_json, {})
    payload = {
        "id": strategy.id,
        "post_workspace_only": bool(extra.get(quick_posts.WORKSPACE_ONLY)),
        "business_name": business.name if business else None,
        "plan_revision": plan_editing.revision(business),
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
        # docs/posts-v2.md, Phase C: where the month's hypothesis, its targets and the
        # plan's assumptions stand, each with one evidence line (services/hypotheses.py).
        "hypothesis_review": hypotheses.review_view(
            extra.get(hypotheses.REVIEW_KEY),
            connected_posts.strategy_core(roadmap) if isinstance(roadmap, dict) else {},
            (scraped or {}).get("quarter_plan"),
            scraped,
        ),
        # docs/design-dna.md (additive): the business's Design DNA, what every post's
        # `design` is drawn from. None until it is built.
        "brand_dna": design_dna.load_dna(business) if business else None,
    }
    if horizon:
        payload["horizon"] = horizon
    return payload


def _connected(strategy: Strategy, roadmap: dict, business: Business | None) -> list:
    return connected_posts.connect_posts(
        roadmap.get("posts") or [],
        business_id=strategy.business_id,
        year=strategy.year,
        month=strategy.month,
        core=connected_posts.strategy_core(roadmap),
        website=(business.website_url if business else "") or "",
        dna=design_dna.load_dna(business) if business else None,
    )


def _post_view(strategy: Strategy, business: Business, index: int, post: dict) -> dict:
    """The post an endpoint just changed, as every reader sees it (with lifecycle etc.)."""
    roadmap = (loads(strategy.roadmap_json, {}) or {}).get("roadmap") or {}
    posts = roadmap.get("posts") or []
    designs = view_designs(posts, design_dna.load_dna(business)) if index < len(posts) else []
    return connected_posts.connected_view(
        post,
        index=index,
        business_id=strategy.business_id,
        year=strategy.year,
        month=strategy.month,
        core=connected_posts.strategy_core(roadmap),
        website=business.website_url or "",
        design=clean_design(post.get("design"), post) or (designs[index] if designs else None),
    )


def upsert_generated_strategy(db: Session, business: Business, generated: dict) -> Strategy:
    table = Business.__table__
    db.execute(update(table).where(table.c.id == business.id).values(id=table.c.id))
    existing = (
        db.query(Strategy)
        .filter(
            Strategy.business_id == business.id,
            Strategy.year == generated["year"],
            Strategy.month == generated["month"],
        )
        .first()
    )
    # Every post of the month gets its design from the business's DNA, compositions
    # rotating so neighbours differ (services/post_design.py). No model call here.
    roadmap_posts = (generated.get("roadmap") or {}).get("posts")
    if isinstance(roadmap_posts, list):
        assign_designs(roadmap_posts, design_dna.dna_for_posts(business))
    generated = copy.deepcopy(generated)
    if existing:
        db.execute(update(Strategy).where(Strategy.id == existing.id).values(id=Strategy.id))
        db.refresh(existing)
        old_posts = (loads(existing.roadmap_json, {}).get("roadmap") or {}).get("posts") or []
        generated["roadmap"]["posts"] = quick_posts.merge_generated_posts(
            old_posts, generated["roadmap"].get("posts") or [], business.id, generated["year"], generated["month"])
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


def _legacy_site_photos(scraped: dict) -> list[dict] | None:
    """Site photos for a scan older than the stored-photo flag, or None (the stored ones
    are read from disk when a post picks one, see services/photo_choice.gather).

    If the scan already ran the vision check, its verdict is final: an empty result means
    "everything was rejected", NOT "we never looked". Re-fetching here used to silently
    bypass the filter and put a supplier's promo banner (or a blurred snapshot) on the
    customer's cards.
    """
    if scraped.get("photos_checked"):
        return None
    # Older scans predate the flag: fetch, then apply the same check before use.
    from app.services.brand import filter_usable_photos

    return filter_usable_photos(
        fetch_photo_candidates((scraped.get("raw") or {}).get("image_urls") or [])
    )


def _photo_pool(db: Session | None, business: Business, scraped: dict, posts: list, index: int):
    """The owner's photos this post may use, and how often the month already used each."""
    candidates = photo_choice.gather(db, business, scraped, site_photos=_legacy_site_photos(scraped))
    return candidates, photo_choice.usage_counts(posts, exclude_index=index)


def _biz_dict(business: Business, strategy: Strategy) -> dict:
    usp_data = loads(strategy.usp_json, {}) or {}
    return {
        "name": business.name,
        "business_type": field_label(business.business_type),
        "offerings": business.offerings,
        "location": business.location,
        "presence_type": business.presence_type,
        "primary_goal": business.primary_goal,
        "business_model": business.business_model or "products",
        "growth_hypothesis": usp_data.get("growth_hypothesis") or "",
    }


_IMAGE_FIELDS_RESET = ("image_provider", "image_model", "image_fallback_reason", "image_edit_error")


def _produce_post_image(
    business: Business,
    post: dict,
    brand: dict,
    biz_dict: dict,
    candidates: list,
    used: dict,
    *,
    index: int = 0,
    dna: dict | None = None,
    force: bool = False,
    allow_generation: bool = True,
    preference: str = "auto",
    db: Session | None = None,
) -> str:
    """Decide where a card's image comes from, real first (docs/design-dna.md).

    1. The owner's own photo that best matches the post's subject (library, Instagram,
       site), not always the first one; the month's other posts count against reuse.
    2. That photo edited to the DNA (Muse, then Nano Banana 2 with it as a labelled
       reference). A failed edit keeps the photo as it is: the real photo is never lost.
    3. No matching photo: a new image from the DNA's photo direction (Muse, then NB2).

    `preference` is the user's explicit intent ("real" = the photo as it is, never an
    AI call; "ai" = a new image; "auto"), kept separate from `force` ("redo the work",
    which in auto mode means a new image). `allow_generation=False` never spends money:
    an own photo is used as it is, otherwise nothing.
    """
    settings = get_settings()

    if not post_needs_photo(post):
        # Typographic cards carry no photograph on purpose. Say so, rather than
        # silently emptying the image and leaving the owner to guess why nothing came.
        post["image_url"] = ""
        post["image_source"] = "none"
        post["image_action"] = "no_photo_theme"
        photo_analysis.attach(db, business.id, post, None)
        return ""

    def stored(data: bytes, mime: str) -> str:
        # Where the photo's subject is and where text may sit (design.safe_area/focal):
        # one cheap vision call per photo, cached by its hash; never when browsing.
        photo_analysis.attach(db, business.id, post, data, mime, allow_model=allow_generation)
        return store_image_bytes(business.id, post.get("title") or "post", data, mime, post.get("week", 0))

    def mark_own(candidate, reason: str) -> None:
        post["image_source"] = candidate.image_source
        post["image_origin"] = candidate.origin
        post["image_source_url"] = candidate.source_url
        post["image_candidate_key"] = candidate.key
        post["image_match"] = reason
        post["image_action"] = "asset" if candidate.origin == "library" else "real_photo"
        if candidate.asset_id:
            post["image_asset_id"] = candidate.asset_id
        else:
            post.pop("image_asset_id", None)

    def use_as_is(picked) -> str:
        candidate, (data, mime), reason = picked
        url = stored(data, mime)
        for key in _IMAGE_FIELDS_RESET:
            post.pop(key, None)
        mark_own(candidate, reason)
        post["image_edited"] = False
        post["image_task"] = "as_is"
        post["image_cost_usd"] = 0.0
        return url

    def edit(picked) -> str:
        candidate, photo, reason = picked
        try:
            outcome = edit_for_post(post, photo, biz_dict, dna, business_id=business.id, db=db)
        except Exception as exc:
            url = use_as_is(picked)
            post["image_edit_error"] = str(exc)[:200]
            return url
        url = stored(outcome.data, outcome.mime)
        post.pop("image_edit_error", None)
        mark_own(candidate, reason)
        post["image_edited"] = True
        post.update(outcome.post_fields())
        return url

    def generate() -> str:
        outcome = generate_for_post(post, brand, biz_dict, dna, business_id=business.id, db=db)
        url = stored(outcome.data, outcome.mime)
        for key in ("image_candidate_key", "image_match", "image_edit_error"):
            post.pop(key, None)
        post["image_source"] = "generated"
        post["image_origin"] = "generated"
        post["image_source_url"] = ""
        post["image_action"] = "generated"
        post["image_edited"] = False
        post.update(outcome.post_fields())
        return url

    def leave_without_image() -> str:
        post["image_url"] = ""
        post["image_source"] = "pending"
        post["image_action"] = "pending"
        photo_analysis.attach(db, business.id, post, None)
        return ""

    def pick():
        return photo_choice.choose(candidates, post, used, index)

    if preference == "real":
        picked = pick()
        return use_as_is(picked) if picked else leave_without_image()

    if preference == "ai":
        return generate() if allow_generation else leave_without_image()

    # auto: the business's own photograph first, edited when spending is allowed.
    if settings.real_photo_first and not force:
        picked = pick()
        if picked:
            return edit(picked) if allow_generation else use_as_is(picked)
    if not allow_generation:
        return leave_without_image()
    return generate()


def _prepare_post_image(
    business: Business,
    strategy: Strategy,
    posts: list,
    post_index: int,
    force: bool = False,
    vibe: str = "",
    custom_prompt: str = "",
    allow_generation: bool = True,
    preference: str = "auto",
    db: Session | None = None,
) -> dict:
    """One post's image (and its design), on `posts` (a copy of the month): the post as
    the work left it. Writes nothing; services/image_jobs.py writes that one post."""
    if post_index >= len(posts):
        raise HTTPException(status_code=404, detail="הפוסט לא נמצא בתוכנית")
    if not force and posts[post_index].get("image_url") and not vibe and not custom_prompt:
        # Nothing to do — but the caller must be able to tell "we generated something"
        # apart from "we kept what was already there". Without this the UI showed a
        # success toast for work that never happened, which reads as a broken button.
        return {**posts[post_index], "image_action": "kept_existing"}

    brand = _brand_of(business, strategy)
    if not brand:
        raise HTTPException(status_code=400, detail=NO_BRAND_FOR_IMAGES_HE)

    db = db if db is not None else object_session(business)
    scraped = loads(business.scraped_profile_json, {}) or {}
    dna = design_dna.dna_for_posts(business)
    target = posts[post_index]
    biz_dict = _biz_dict(business, strategy)
    # The post's design first: the image is composed for it.
    ensure_post_design(
        posts,
        post_index,
        dna,
        composition=vibe_composition(vibe, dna_compositions(dna), target.get("format")),
        prefer_dna=bool(vibe or custom_prompt),
    )
    candidates, used = _photo_pool(db, business, scraped, posts, post_index)

    def provide(target_post: dict) -> str:
        return _produce_post_image(
            business,
            target_post,
            brand,
            biz_dict,
            candidates,
            used,
            index=post_index,
            dna=dna,
            force=force,
            allow_generation=allow_generation,
            preference=preference,
            db=db,
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
            dna=dna,
        )
    else:
        target["image_url"] = provide(target)

    if preference in ("real", "ai"):
        target["image_preference"] = preference
    return target


NO_BRAND_FOR_IMAGES_HE = (
    "עוד לא קראנו את האתר, ולכן אין לנו את הצבעים והסגנון שלכם. קראו את האתר לפני שיוצרים תמונות."
)


def _brand_of(business: Business, strategy: Strategy) -> dict:
    extra = loads(strategy.roadmap_json, {}) or {}
    scraped = loads(business.scraped_profile_json, {}) or {}
    return extra.get("brand_language") or scraped.get("brand_language") or {}


def _run_image_item(db: Session, business: Business, strategy: Strategy, posts: list, index: int, item: dict) -> dict:
    """How the image job (services/image_jobs.py) makes one post's image."""
    return _prepare_post_image(
        business,
        strategy,
        posts,
        index,
        force=bool(item.get("force")),
        vibe=str(item.get("vibe") or ""),
        custom_prompt=str(item.get("custom_prompt") or ""),
        allow_generation=bool(item.get("allow_generation", True)),
        preference=str(item.get("preference") or "auto"),
        db=db,
    )


image_jobs.register(_run_image_item)


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


def _editable_strategy(db: Session, business: Business) -> Strategy | None:
    today = date.today()
    return _strategy_for_month(db, business, today.year, today.month) or _newest_strategy(db, business)


@router.get("/strategy/edit")
def editable_plan(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    strategy = _editable_strategy(db, business)
    return plan_editing.view(db, business, None if quick_posts.workspace_only(strategy) else strategy)


@router.patch("/strategy/edit")
def save_plan_edit(body: dict, business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    try:
        edit = plan_editing.EditIn.model_validate(body)
    except ValidationError:
        raise HTTPException(422, "מלאו כיוון וקהל. הכיוון וההנחות יכולים להכיל עד 300 תווים, והקהל עד 160. אפשר להוסיף עד 4 הנחות.")
    strategy = _editable_strategy(db, business)
    return plan_editing.save(db, business, None if quick_posts.workspace_only(strategy) else strategy, edit)


@router.get("/strategy/current")
def current_strategy(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    strategy = _active_strategy(db, business)
    if quick_posts.workspace_only(strategy):
        raise HTTPException(404, "עוד אין תוכנית לחודש.")
    return serialize_strategy(strategy, business, horizon=_horizon_for(db, business, strategy))


@router.get("/strategy/posts/workspace")
def posts_workspace(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    return serialize_strategy(_active_strategy(db, business), business)


@router.post("/strategy/posts/create")
def create_post(body: PostCreateIn, business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    strategy, index = quick_posts.create(db, business, body)
    return {"post_index": index, "post": _post_view(strategy, business, index, _posts_of(strategy)[index]),
            "strategy": serialize_strategy(strategy, business)}


@router.post("/strategy/posts/image", dependencies=[Depends(require_generation_access)])
def generate_post_image(
    body: PostImageIn,
    response: Response,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    """The owner asked for this post's image ("ליצור תמונה", "תמונה אחרת", a source switch).

    It goes through the business's image job (services/image_jobs.py), first in its queue:
    never a second job beside a running one, and only this post is written. The answer
    waits for the image, as before. When the month's images are still being made and this
    one is not ready within the wait, it answers 202 `queued: true`; the page shows it
    once the job is done."""
    strategy = _active_strategy(db, business)
    posts = _posts_of(strategy)
    if body.post_index >= len(posts):
        raise HTTPException(status_code=404, detail="הפוסט לא נמצא בתוכנית")
    post = posts[body.post_index]
    if not body.force and post.get("image_url") and not body.vibe and not body.custom_prompt:
        kept = {**post, "image_action": "kept_existing"}
        return {"post": _post_view(strategy, business, body.post_index, kept), "strategy": serialize_strategy(strategy, business)}
    if not _brand_of(business, strategy):
        raise HTTPException(status_code=400, detail=NO_BRAND_FOR_IMAGES_HE)

    item = image_jobs.make_item(
        strategy,
        body.post_index,
        post,
        source=image_jobs.OWNER,
        force=body.force,
        preference=body.image_preference,
        allow_generation=body.allow_generation,
        vibe=body.vibe,
        custom_prompt=body.custom_prompt,
    )
    job, ids = image_jobs.queue(db, business, [item])
    result = image_jobs.wait_for(db, business.id, ids[0]) if ids else None
    db.expire_all()
    strategy = db.get(Strategy, strategy.id)
    if result is not None and result.get("state") == image_jobs.ERROR:
        raise HTTPException(status_code=502, detail=result.get("error_he") or image_jobs.ERROR_HE)
    stored = _posts_of(strategy)
    current = stored[body.post_index] if body.post_index < len(stored) else post
    payload = {
        "post": _post_view(strategy, business, body.post_index, current),
        "strategy": serialize_strategy(strategy, business),
        "job": image_jobs.status(db, business),
    }
    if result is not None and result.get("state") != image_jobs.DONE:
        response.status_code = 202
        payload["queued"] = True
    return payload


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
    before = copy.deepcopy(target)
    biz_dict = _biz_dict(business, strategy)
    dna = design_dna.dna_for_posts(business)
    # A redesign draws the post from the DNA: the composition the editor chose, the one
    # the vibe asks for, or the next in the DNA's rotation.
    ensure_post_design(
        posts,
        body.post_index,
        dna,
        composition=body.composition or vibe_composition(body.vibe, dna_compositions(dna), target.get("format")),
        text_position=body.text_position,
        prefer_dna=True,
        by_hand=bool(body.composition),
    )
    # The image follows the same real-first route as /strategy/posts/image (it used to be
    # a plain generation here, with none of the business's photos).
    candidates, used = _photo_pool(db, business, scraped, posts, body.post_index) if body.generate_image else ([], {})

    def provide(target_post: dict) -> str:
        return _produce_post_image(
            business, target_post, brand, biz_dict, candidates, used, index=body.post_index, dna=dna, db=db
        )

    try:
        target, image_url = design_and_generate_post(
            business.id,
            target,
            brand,
            biz_dict,
            vibe=body.vibe,
            custom_prompt=body.custom_prompt,
            generate_image=body.generate_image,
            image_provider=provide,
            dna=dna,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"לא הצלחנו לעצב את הפוסט: {exc}") from exc

    # Seconds of model calls went by: write this post only, onto the month as it is now,
    # so an image the job saved for another post meanwhile stays (#123).
    business.updated_at = datetime.utcnow()
    target = image_jobs.save_post(db, strategy, body.post_index, before, target)
    db.refresh(strategy)
    return {"post": _post_view(strategy, business, body.post_index, target), "strategy": serialize_strategy(strategy, business)}


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
    before = copy.deepcopy(target)
    target["image_url"] = image_public_url(asset.business_id, asset.filename)
    target["image_source"] = "asset"
    target["image_asset_id"] = asset.id
    target["image_action"] = "asset"
    target["image_source_url"] = asset.source_url or ""
    # The owner's own photo: where its subject is and where text may sit. The design is
    # stored first so the analysis has somewhere to go.
    ensure_post_design(posts, body.post_index, design_dna.dna_for_posts(business))
    loaded = read_stored_bytes(target["image_url"])
    owner = db.get(User, business.user_id)
    may_spend = owner is None or not billing.locked(db, owner)
    photo_analysis.attach(db, business.id, target, loaded[0] if loaded else None, loaded[1] if loaded else "",
                          allow_model=may_spend)
    # The photo's analysis may take a model call: write this post only (#123).
    business.updated_at = datetime.utcnow()
    target = image_jobs.save_post(db, strategy, body.post_index, before, target)
    db.refresh(strategy)
    return {"post": _post_view(strategy, business, body.post_index, target), "strategy": serialize_strategy(strategy, business)}


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


def _posts_of(strategy: Strategy) -> list:
    return list((loads(strategy.roadmap_json, {}).get("roadmap") or {}).get("posts") or [])


@router.post("/strategy/posts/images", dependencies=[Depends(require_generation_access)])
def generate_all_post_images(
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    """Prepare the month's missing images: start (or join) the business's image job and
    answer at once with its status (`job`); GET /strategy/posts/images/status follows it.

    The posts it takes are the ones the job would prepare by itself after the month was
    written (image_jobs.wants_image): none twice, so a second call (a second tab, an old
    page) costs nothing. Pages never call this on open (#123)."""
    strategy = _active_strategy(db, business)
    items = image_jobs.build_items(strategy)
    if items and not _brand_of(business, strategy):
        raise HTTPException(status_code=400, detail=NO_BRAND_FOR_IMAGES_HE)
    job, _ids = image_jobs.queue(db, business, items)
    db.expire_all()
    strategy = db.get(Strategy, strategy.id)
    errors = [item["error_he"] for item in job["items"] if item.get("state") == image_jobs.ERROR and item.get("error_he")]
    return {"strategy": serialize_strategy(strategy, business), "job": job, "errors": errors}


@router.get("/strategy/posts/images/status")
def post_images_status(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    """The business's image job, for the Posts page and the editor: whether images are
    being made, how many are done, which posts are waiting (`waiting`, by uid). Only a
    read: it never starts, resumes or pays for anything."""
    return image_jobs.status(db, business)


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
    before = copy.deepcopy(target)
    target["title"] = body.title
    target["format"] = body.format
    target["hook"] = body.hook
    target["caption"] = body.caption
    target["cta"] = body.cta
    target["has_overlay"] = body.has_overlay
    headline = body.overlay_headline or (body.overlay_text if body.has_overlay else "")
    target["overlay_headline"] = headline
    target["overlay_badge"] = body.overlay_badge
    # Only an explicit old-layout choice is stored: the field's default ("ink_pill")
    # must not overwrite a post's Design DNA layout every time it is saved.
    if "overlay_theme" in body.model_fields_set:
        target["overlay_theme"] = body.overlay_theme
    previous_design = target.get("design") if isinstance(target.get("design"), dict) else {}
    if body.design is not None:
        submitted = {**body.design.model_dump(), "text_mode": previous_design.get("text_mode")}
        # Picked by hand in the editor: a feed-only layout may go on a story too.
        design = clean_design(submitted, {**target, "format": body.format}, by_hand=True)
        if design is None:
            raise HTTPException(status_code=422, detail="הקומפוזיציה הזו לא מתאימה לפוסט הזה.")
        # A composition change keeps the photo, and so what we know about it.
        design.update(photo_fields(previous_design))
        target["design"] = design
    elif previous_design:
        # The format may have changed (a post became a story): keep the crop in step.
        target["design"] = clean_design(previous_design, target) or make_design(
            "full_bleed", target, photo=photo_fields(previous_design))
    if isinstance(target.get("design"), dict):
        # The owner's overlay switch decides the text mode: off = photo only.
        sync_text_mode(target["design"], body.has_overlay)
    # The one short line under the headline: kept unless the editor sends it (an older
    # editor does not know the field) or the owner turned the text off.
    if not body.has_overlay:
        target["overlay_sub"] = ""
    elif "overlay_sub" in body.model_fields_set:
        target["overlay_sub"] = " ".join(body.overlay_sub.split())
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
    target["channel"] = connected_posts.channel_of({"primary_outlet": body.primary_outlet})
    target["outlets"] = body.outlets
    target["approval_status"] = "review"
    target["approved_at"] = None
    if "outlet_captions" not in target or not isinstance(target["outlet_captions"], dict):
        target["outlet_captions"] = {}
    target["outlet_captions"][body.primary_outlet] = body.caption
    # The owner went over the text: a fact we asked them to check is theirs now, and so is
    # every price in it (a later rewrite keeps them as they are).
    if target.get("owner_fact"):
        target["owner_fact_done"] = True
    post_rewrite.confirm_prices(target, post_rewrite.post_text(target))
    # The price on the post follows the text the owner saved (theirs now).
    target["price"] = connected_posts.price_after_edit(target)
    target.pop("rewrite_instruction", None)

    # Write this post only, onto the month as it is now: an image the job saved for any
    # post between this request's read and its write stays (#123).
    business.updated_at = datetime.utcnow()
    target = image_jobs.save_post(db, strategy, body.post_index, before, target)
    db.refresh(strategy)
    return {"post": _post_view(strategy, business, body.post_index, target), "strategy": serialize_strategy(strategy, business)}


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

    stored = loads(business.scraped_profile_json, {}) or {}
    brand = extra.get("brand_language") or stored.get("brand_language") or {}
    target = posts[body.post_index]
    before = copy.deepcopy(target)
    instruction = post_rewrite.clean_instruction(body.instruction)
    label = post_rewrite.label_for(instruction, body.tone)
    featured = _featured_for(stored, target)

    def answer(*, changed: bool, message: str | None = None) -> dict:
        # The rewrite took a model call: write this post only, onto the month as it is
        # now, so an image the job saved meanwhile stays (#123).
        business.updated_at = datetime.utcnow()
        saved = image_jobs.save_post(db, strategy, body.post_index, before, target)
        db.refresh(strategy)
        return {
            "post": _post_view(strategy, business, body.post_index, saved),
            "strategy": serialize_strategy(strategy, business),
            "changed": changed,
            "message": message,
            "instruction": label,
        }

    # "להוסיף מחיר" and no price the owner gave or confirmed: the writer would have to
    # invent one. The post stays as it is and asks the owner (docs/posts-v2.md, Phase C).
    if post_rewrite.wants_price(instruction) and not post_rewrite.known_money(target, instruction, featured):
        target["owner_fact"] = post_rewrite.PRICE_QUESTION_HE
        target["owner_fact_done"] = False
        target["approval_status"] = "review"
        target["approved_at"] = None
        target.pop("rewrite_instruction", None)
        return answer(changed=False, message=post_rewrite.NO_PRICE_MESSAGE_HE)

    # docs/posts-v2.md: a rewrite knows the post's place in the plan, how it is measured,
    # what it got so far, and what worked for this business (the post itself excluded).
    view = _post_view(strategy, business, body.post_index, target)
    worked = connected_posts.what_worked(db, business, exclude_uid=view["uid"])
    context = {
        "plan_link": view["plan_link"],
        "why_line": view["why_line"],
        "mix_type": view["mix_type"],
        "business_model": business.business_model or "products",
        "featured": featured,
        "channel": view["channel"],
        "measure": view["measure"],
        "results": view["results"],
        "what_worked": worked,
        "facts": post_rewrite.facts_block(target, instruction, featured),
    }
    try:
        rewritten = rewrite_post(
            target,
            body.tone,
            brand,
            instagram=signal_for(db, business, strategy.year, strategy.month),
            context=context,
            instruction=instruction,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"לא הצלחנו לכתוב את הפוסט מחדש: {exc}") from exc

    # .get: a post stored without one of these (an old or a chosen sample post) still rewrites.
    proposed = {name: rewritten.get(name) or target.get(name) or "" for name in post_rewrite.TEXT_FIELDS}
    if rewritten.get("outlet_captions"):
        proposed["outlet_captions"] = rewritten["outlet_captions"]
    checked = post_rewrite.guard(target, proposed, instruction, featured)
    if checked.rejected:
        # A confirmed fact went missing, or a discount appeared: the old text stays.
        return answer(changed=False, message=checked.message)

    had_cta_in_caption = post_rewrite.cta_in_caption(target)
    for name in post_rewrite.TEXT_FIELDS:
        target[name] = checked.fields[name]
    if had_cta_in_caption and not post_rewrite.cta_in_caption(target):
        # The caption is what gets posted, and it carried the call to action: the rewrite
        # keeps it there, or the post stops asking for what it is measured by (WhatsApp
        # taps) while "עודכן לפי…" still credits it (#111).
        target["caption"] = f"{str(target.get('caption') or '').rstrip()}\n{str(target.get('cta') or '').strip()}"
    if target.get("has_overlay") is not False and target.get("overlay_text"):
        # The headline the card prints follows the rewritten text: one message, 6 words.
        target["overlay_headline"] = target["overlay_text"]
        connected_posts.one_message(target)
    if checked.fields.get("outlet_captions"):
        target["outlet_captions"] = checked.fields["outlet_captions"]
    if isinstance(target.get("outlet_captions"), dict):
        # The post is the one for its channel; the other copies stay a cross-post option.
        target["outlet_captions"][view["channel"]] = target["caption"]
    if "inspiration" in rewritten:
        target["inspiration"] = rewritten["inspiration"]
    target["uid"] = view["uid"]
    # A price the owner typed in the instruction is theirs from now on.
    typed = post_rewrite.money_in(instruction)
    post_rewrite.confirm_prices(target, instruction)
    fact = str(rewritten.get("owner_fact") or "").strip()[:120]
    if checked.placeholders or post_rewrite.has_placeholder(checked.fields):
        # The writer reached for a price nobody gave (and it became [מחיר]), or left the
        # placeholder itself: the owner fills it in. The writer's own words for what to
        # check are kept when they are about the price.
        target["owner_fact"] = fact if "מחיר" in fact else post_rewrite.PRICE_FACT_HE
        target["owner_fact_done"] = False
    elif typed and typed <= post_rewrite.money_in(post_rewrite.post_text(target)):
        # The owner typed the price, and it is in the post now: nothing left to check.
        target["owner_fact_done"] = True
    elif fact and not target.get("owner_fact_done"):
        # A fact the owner already went over stays theirs; a new one is asked about.
        target["owner_fact"] = fact
        target["owner_fact_done"] = False
    if isinstance(target.get("price"), dict) or post_rewrite.money_in(target.get("overlay_headline") or ""):
        # Only prices the guard let through (known to the owner) can be here.
        target["price"] = connected_posts.price_after_edit(target)
    note, sources = connected_posts.informed_note(target, worked, rewritten.get("applied_learning"))
    target["informed_by_note"] = note
    target["informed_by"] = sources
    target["approval_status"] = "review"
    target["approved_at"] = None
    # "שונה לפי: קצר יותר" until the owner saves or approves the text.
    target["rewrite_instruction"] = label or None
    return answer(changed=True)


def _featured_for(stored: dict, post: dict) -> dict | None:
    """The owner's featured item this post is about ({id, name, why}), or None."""
    wanted_id = str(post.get("featured_item_id") or "")
    wanted_name = str(post.get("featured_item_name") or "").strip().lower()
    if not wanted_id and not wanted_name:
        return None
    for item in featured_items_from(stored):
        entry = item if isinstance(item, dict) else {"id": connected_posts.featured_item_id(item), "name": item, "why": ""}
        if (wanted_id and entry.get("id") == wanted_id) or (wanted_name and str(entry.get("name") or "").lower() == wanted_name):
            return entry
    return {"id": wanted_id, "name": post.get("featured_item_name") or "", "why": ""} if wanted_name else None


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
    before = copy.deepcopy(target)
    target["approval_status"] = "approved" if body.approved else "review"
    target["approved_at"] = datetime.utcnow().isoformat() if body.approved else None
    if body.approved and target.get("owner_fact"):
        target["owner_fact_done"] = True
    if body.approved:
        post_rewrite.confirm_prices(target, post_rewrite.post_text(target))
        target.pop("rewrite_instruction", None)
    # Write this post only, onto the month as it is now: an image the job saved for any
    # post between this request's read and its write stays (#123).
    business.updated_at = datetime.utcnow()
    target = image_jobs.save_post(db, strategy, body.post_index, before, target)
    db.refresh(strategy)
    return {"post": _post_view(strategy, business, body.post_index, target), "strategy": serialize_strategy(strategy, business)}


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
    before = copy.deepcopy(target)
    target["scheduled_for"] = scheduled_for
    target["scheduled_at"] = datetime.utcnow().isoformat() if scheduled_for else None
    # Write this post only, onto the month as it is now: an image the job saved for any
    # post between this request's read and its write stays (#123).
    business.updated_at = datetime.utcnow()
    target = image_jobs.save_post(db, strategy, body.post_index, before, target)
    db.refresh(strategy)
    return {"post": _post_view(strategy, business, body.post_index, target), "strategy": serialize_strategy(strategy, business)}


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
    before = copy.deepcopy(target)
    url = body.published_url.strip()
    if url and not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=422, detail="הקישור צריך להתחיל ב-https://")
    if url:
        target["published_url"] = url
    # The first "פרסמתי" sets the time; adding the link later keeps it.
    if not target.get("published_at"):
        target["published_at"] = datetime.utcnow().isoformat()
    # Write this post only, onto the month as it is now: an image the job saved for any
    # post between this request's read and its write stays (#123).
    business.updated_at = datetime.utcnow()
    target = image_jobs.save_post(db, strategy, body.post_index, before, target)
    db.refresh(strategy)
    return {"post": _post_view(strategy, business, body.post_index, target), "strategy": serialize_strategy(strategy, business)}


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

    # The month closes: its hypothesis, targets and the plan's assumptions get their last
    # word (docs/posts-v2.md, Phase C), and the next month is planned knowing it.
    closing_review = hypotheses.refresh_for_business(db, business, closing=True, strategy=source)
    if closing_review is not None:
        db.commit()

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
    if closing_review is not None:
        prior["hypotheses"] = hypotheses.for_prompt(closing_review)
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
        "plan_edit": stored.get("plan_edit") or None,
        # Revision 8: the products/services the owner chose to feature, when they have.
        "featured_items": featured_items_from(stored),
        # docs/posts-v2.md: this business's measured posts, best and worst ("" when none).
        "content_language": content_language.preferences(stored),
        "what_worked": connected_posts.what_worked(db, business),
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


generation_jobs.register(generation_jobs.NEXT_MONTH, run_next_month_stage, on_done=image_jobs.after_month_job)


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
    from app.services.strategy_writes import lock_and_refresh
    lock_and_refresh(db, strategy)
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
    roadmap = loads(strategy.roadmap_json, {}).get("roadmap") if strategy else None
    if strategy and isinstance(roadmap, dict) and isinstance(roadmap.get("posts"), list):
        roadmap = {**roadmap, "posts": _connected(strategy, roadmap, business)}
    return {
        **gregorian_month_meta(year, month),
        "events": events,
        "roadmap": roadmap,
    }
