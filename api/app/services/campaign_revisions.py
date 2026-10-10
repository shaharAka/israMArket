"""Staged campaign changes with stable identities and optimistic keep/undo.

Generation never writes the live plan. A durable request id also survives browser retries.
A stopped process does not retry paid work; the previous campaign remains untouched.
"""
from __future__ import annotations

import copy
import hashlib
import json
import uuid
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Business, CampaignRevision, Strategy, User
from app.services import billing, connected_posts, creative_brief, design_dna, media_allowances, model_usage, post_rewrite
from app.services.jsonutil import dumps, loads
from app.services.strategy_writes import lock_and_refresh

# No scheduling, approval, publication, measurement or content-language fields here.
FIELDS = (*post_rewrite.TEXT_FIELDS, "overlay_headline", "overlay_sub", "overlay_badge", "has_overlay",
          "outlet_captions", "design", "image_url", "image_source", "image_asset_id", "image_action",
          "image_source_url", "format", "video_url", "video_asset_id", "video_raw_asset_id", "video_source", "video_overlay_png", "scene_description", "image_prompt", "creative_concept", "visual_style")


def snapshot(post):
    return {key: copy.deepcopy(post[key]) for key in FIELDS if key in post}


def fingerprint(post):
    # Include protected creative context: do not apply a proposal made for an older
    # audience, language or goal, even if somebody changed only the plan meanwhile.
    fields = {**snapshot(post), **{k: post.get(k) for k in (
        "uid", "content_language", "audience_id", "audience_name", "plan_link", "goal_fit", "featured_item_id")}}
    return hashlib.sha256(json.dumps(fields, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def protected(post):
    return bool(post.get("published_at") or post.get("published_url") or post.get("scheduled_for")
                or post.get("approval_status") in {"approved", "published", "scheduled"})


def posts_of(strategy):
    return (loads(strategy.roadmap_json, {}).get("roadmap") or {}).get("posts") or []


def owned(db, business, revision_id):
    row = db.query(CampaignRevision).filter_by(id=revision_id, business_id=business.id).first()
    if not row:
        raise HTTPException(404, "לא מצאנו את הגרסה הזו.")
    return row


def view(row):
    return {"id": row.id, "strategy_id": row.strategy_id, "kind": row.kind,
            "instruction": row.instruction, "state": row.state, "items": loads(row.items_json, []),
            "error": row.error_he, "created_at": row.created_at.isoformat() + "Z"}


def create(db, business, strategy, *, request_id, uids, kind, instruction, options=None):
    options = options or {}
    if kind not in {"video", "video_edit", "finish"}:
        options = {}
    lock_and_refresh(db, strategy)
    existing = db.query(CampaignRevision).filter_by(business_id=business.id, request_id=request_id).first()
    if existing:
        if existing.kind != kind or existing.instruction != instruction or loads(existing.options_json, {}) != options or set(
            i["uid"] for i in loads(existing.items_json, [])) != set(uids):
            raise HTTPException(409, "מזהה הבקשה כבר שייך לשינוי אחר. רעננו ובחרו שוב.")
        db.rollback()
        return existing, False
    # Never resubmit an interrupted paid request. An explicit new owner action is
    # allowed once an old worker has been quiet longer than every provider timeout.
    for stale in db.query(CampaignRevision).filter(CampaignRevision.business_id == business.id,
              CampaignRevision.state == "working", CampaignRevision.updated_at < datetime.utcnow() - timedelta(minutes=30)):
        stale.state = "failed"
        stale.error_he = "היצירה נעצרה. הפוסטים הקודמים נשארו שמורים; בדקו את המכסה לפני יצירה חדשה."
    if db.query(CampaignRevision).filter_by(business_id=business.id, state="working").first():
        raise HTTPException(409, "כבר מכינים גרסה חדשה. תוכלו לראות אותה לפני שינוי נוסף.")
    posts = posts_of(strategy)
    connected_posts.ensure_uids(posts, business.id, strategy.year, strategy.month)
    selected = [p for p in posts if p.get("uid") in uids]
    if len(selected) != len(uids):
        raise HTTPException(404, "אחד הפוסטים שבחרתם כבר לא נמצא בתוכנית. רעננו ובחרו שוב.")
    if any(protected(p) for p in selected):
        raise HTTPException(409, "פוסט שאושר או נשלח לפרסום נשאר כמו שהוא. בחרו טיוטה כדי להכין גרסה חדשה.")
    if kind == "layout" and any(p.get("video_url") or p.get("has_overlay") is False or (p.get("design") or {}).get("text_mode") == "photo_only" for p in selected):
        raise HTTPException(422, "כדי לשנות צילום או סרטון, בחרו שינוי בתמונה או בסרטון.")
    if kind not in {"layout", "finish"}:
        owner = db.get(User, business.user_id)
        if billing.locked(db, owner):
            raise billing.PlanRequiredError()
    if kind == "text" and not instruction:
        raise HTTPException(422, "כתבו מה תרצו לשנות בנוסח.")
    if kind in {"image", "video", "video_edit"}:
        allowance = media_allowances.status(db, db.get(User, business.user_id))["images" if kind == "image" else "videos"]
        if not allowance["generation_available"] or len(selected) > allowance["remaining"]:
            raise media_allowances.limit_error()
    if kind in {"video", "video_edit", "finish"}:
        from app.services import campaign_video
        if len(selected) != 1:
            raise HTTPException(422, "בחרו פוסט אחד לסרטון.")
        if kind == "video_edit" and not instruction:
            raise HTTPException(422, "כתבו מה תרצו לשנות בסרטון.")
        campaign_video.clean_overlay(options.get("overlay_png", ""))
        if kind in {"video_edit", "finish"}:
            asset_id = options.get("asset_id") or selected[0].get("video_raw_asset_id") or selected[0].get("video_asset_id")
            _asset, path = campaign_video.own_asset(db, business, asset_id)
            duration, _, _ = campaign_video.probe(path)
            end = options.get("end") or min(duration, options.get("start", 0) + (5 if kind == "video_edit" else 30))
            if end > duration or not .5 <= end-options.get("start", 0) <= (5 if kind == "video_edit" else 30):
                raise HTTPException(422, "בחרו קטע קצר מתוך הסרטון.")
    extra = loads(strategy.roadmap_json, {})
    extra["roadmap"]["posts"] = posts
    strategy.roadmap_json = dumps(extra)
    items = [{"uid": p["uid"], "base_hash": fingerprint(p), "original": copy.deepcopy(p),
              "proposal": None, "state": "waiting", "error": ""} for p in selected]
    row = CampaignRevision(id=uuid.uuid4().hex, business_id=business.id, strategy_id=strategy.id,
                           request_id=request_id, kind=kind, instruction=instruction, items_json=dumps(items), options_json=dumps(options))
    db.add(row)
    db.commit()
    db.refresh(row)
    return row, True


def propose(db, business, strategy, post, kind, instruction, request_key, options=None):
    # Reuse the production renderer/provider and the same real marketing brief.
    from app.routers import strategy as routes
    from app.services.post_design import dna_compositions, ensure_post_design
    from app.services.strategy import rewrite_post
    from app.services.designer import design_and_generate_post
    target = copy.deepcopy(post)
    target["creative_brief"] = creative_brief.for_post(target, business, strategy, db)
    extra = loads(strategy.roadmap_json, {})
    scraped = loads(business.scraped_profile_json, {})
    brand = extra.get("brand_language") or scraped.get("brand_language") or {}
    dna = design_dna.dna_for_posts(business)
    if kind == "text":
        featured = routes._featured_for(scraped, target)
        if post_rewrite.wants_price(instruction) and not post_rewrite.known_money(target, instruction, featured):
            raise HTTPException(422, post_rewrite.NO_PRICE_MESSAGE_HE)
        current = routes._post_view(strategy, business, next(i for i,p in enumerate(posts_of(strategy))
                       if p.get("uid") == target["uid"]), target)
        context = {"plan_link": current.get("plan_link"), "measure": current.get("measure"),
                   "business_model": business.business_model, "featured": featured,
                   "what_worked": connected_posts.what_worked(db, business, exclude_uid=target["uid"]),
                   "facts": post_rewrite.facts_block(target, instruction, featured)}
        written = rewrite_post(target, None, brand, context=context, instruction=instruction)
        checked = post_rewrite.guard(target, {k: written.get(k) or target.get(k) or "" for k in post_rewrite.TEXT_FIELDS}, instruction, featured)
        if checked.rejected:
            raise HTTPException(422, checked.message)
        target.update(checked.fields)
        if target.get("has_overlay") is not False:
            target["overlay_headline"] = target.get("overlay_text", "")
            connected_posts.one_message(target)
        if post_rewrite.cta_in_caption(post) and not post_rewrite.cta_in_caption(target):
            target["caption"] = f'{target["caption"].rstrip()}\n{target["cta"]}'
        captions = dict(target.get("outlet_captions") or {})
        captions[current["channel"]] = target["caption"]
        target["outlet_captions"] = captions
        if post.get("video_url"):
            # Caption changes must not pretend to have changed burned-in footage.
            # The free video finishing operation edits that visible headline.
            for field in ("overlay_text", "overlay_headline", "overlay_sub", "overlay_badge", "has_overlay"):
                if field in post:
                    target[field] = copy.deepcopy(post[field])
                else:
                    target.pop(field, None)
        return target
    if kind in {"video", "video_edit", "finish"}:
        from app.services import campaign_video as video
        options = options or {}
        business_id = business.id
        revision_id = request_key.split(":", 2)[1]
        if options.get("overlay_headline") is not None:
            target.update(overlay_headline=options["overlay_headline"].strip(), overlay_text=options["overlay_headline"].strip(), has_overlay=bool(options["overlay_headline"].strip()))
        source_data = None
        raw_asset_id = options.get("asset_id") or post.get("video_raw_asset_id") or post.get("video_asset_id")
        if kind in {"video_edit", "finish"}:
            source_asset, path = video.own_asset(db, business, raw_asset_id)
            source_data = video.finish_bytes(path.read_bytes(), start=options.get("start",0), end=options.get("end"),
                                            max_duration=5 if kind == "video_edit" else 30)
        if kind != "finish":
            source_data = video.generate(db, business, target, dna, instruction, request_key, source_data=source_data)
            raw = video.store(db, business_id, revision_id, source_data, target.get("title", ""))
            raw_asset_id = raw.id
        overlay = video.clean_overlay(options.get("overlay_png", ""))
        finished = video.finish_bytes(source_data, overlay=overlay, max_duration=30)
        asset = video.store(db, business_id, revision_id, finished, target.get("title", ""), source="processed" if kind == "finish" else "generated")
        target.update(format="reel", video_url=video.image_public_url(business_id, asset.filename), video_asset_id=asset.id,
                      video_raw_asset_id=raw_asset_id, video_source=("generated" if source_asset.source == "generated" else post.get("video_source") or "asset") if kind == "finish" else "generated")
        return target
    all_posts = copy.deepcopy(posts_of(strategy))
    index = next(i for i,p in enumerate(all_posts) if p.get("uid") == target["uid"])
    if kind == "image":
        target["format"] = "image"
        for field in ("video_url", "video_asset_id", "video_raw_asset_id", "video_source", "video_overlay_png"):
            target.pop(field, None)
    all_posts[index] = target
    if kind == "layout":
        choices = dna_compositions(dna)
        current = (target.get("design") or {}).get("composition")
        alternatives = [c for c in choices if c != current]
        choice = alternatives[index % len(alternatives)] if alternatives else ""
        ensure_post_design(all_posts, index, dna, composition=choice, prefer_dna=True)
        return all_posts[index]
    if not brand:
        raise HTTPException(422, "בחרו קודם את הסגנון של העסק במסך המותג.")
    ensure_post_design(all_posts, index, dna, prefer_dna=True)
    candidates, used = routes._photo_pool(db, business, scraped, all_posts, index)
    from app.services import campaign_video
    business_id = business.id
    revision_id = request_key.split(":", 2)[1]
    generated_assets = []
    def store_media(data, mime):
        asset = campaign_video.store(db, business_id, revision_id, data, target.get("title", ""), mime=mime, kind="image")
        generated_assets.append(asset.id)
        return campaign_video.image_public_url(business_id, asset.filename)
    def provide(item):
        with media_allowances.request_scope(request_key):
            return routes._produce_post_image(business, item, brand, routes._biz_dict(business, strategy),
                                              candidates, used, index=index, dna=dna, db=db, strict=True, store_media=store_media)
    target, _url = design_and_generate_post(business.id, target, brand, routes._biz_dict(business, strategy),
                          custom_prompt=instruction, generate_image=True, image_provider=provide, dna=dna)
    checked = post_rewrite.guard(post, {k: target.get(k) or post.get(k) or "" for k in post_rewrite.TEXT_FIELDS},
                                 instruction, routes._featured_for(scraped, post))
    if checked.rejected:
        raise HTTPException(422, checked.message)
    target.update(checked.fields)
    if generated_assets:
        target["image_asset_id"] = generated_assets[-1]
    target["format"] = "image"
    for field in ("video_url", "video_asset_id", "video_raw_asset_id", "video_source", "video_overlay_png"):
        target.pop(field, None)
    return target


def run(bind, revision_id):
    with Session(bind=bind) as db:
        row = db.get(CampaignRevision, revision_id)
        if not row or row.state != "working":
            return
        business = db.get(Business, row.business_id)
        strategy = db.get(Strategy, row.strategy_id)
        if not business or not strategy or strategy.business_id != business.id:
            return
        items = loads(row.items_json, [])
        with model_usage.attributed(business.id, bind=bind):
            for item in items:
                try:
                    fresh = next((p for p in posts_of(strategy) if p.get("uid") == item["uid"]), None)
                    if not fresh or protected(fresh) or fingerprint(fresh) != item["base_hash"]:
                        raise HTTPException(409, "הפוסט השתנה מאז הבחירה. בחרו אותו שוב כדי להכין גרסה מעודכנת.")
                    item["proposal"] = propose(db, business, strategy, item["original"], row.kind,
                                               row.instruction, f'campaign:{row.id}:{item["uid"]}', **({"options": loads(row.options_json, {})} if row.kind in {"video", "video_edit", "finish"} else {}))
                    item["state"] = "ready"
                except Exception as exc:
                    db.rollback()
                    # Provider internals/URLs must never enter customer error messages.
                    item["state"] = "failed"
                    item["error"] = exc.detail if isinstance(exc, HTTPException) and isinstance(exc.detail, str) else (
                        "לא הצלחנו להכין את הגרסה הזו. הפוסט הקודם נשאר שמור.")
                row = db.get(CampaignRevision, revision_id)
                if not row or row.state != "working" or not db.get(Business, row.business_id):
                    return
                row.items_json = dumps(items)
                row.updated_at = datetime.utcnow()
                db.commit()
                db.expire_all()
                strategy = db.get(Strategy, row.strategy_id)
            row.state = "ready" if all(i["state"] == "ready" for i in items) else "failed"
            db.commit()


def apply(db, business, row, action):
    from app.routers.strategy import _active_strategy
    if _active_strategy(db, business).id != row.strategy_id:
        raise HTTPException(409, "התוכנית הזו כבר לא פעילה. הגרסה נשארה בהיסטוריה.")
    strategy = db.query(Strategy).filter_by(id=row.strategy_id, business_id=business.id).first()
    if not strategy:
        raise HTTPException(409, "התוכנית הזו כבר לא פעילה. הגרסה נשארה בהיסטוריה.")
    lock_and_refresh(db, strategy)
    db.refresh(row)
    expected = {"ready", "failed"} if action == "keep" else {"kept"}
    items = [i for i in loads(row.items_json, []) if i.get("state") == "ready" and i.get("proposal")]
    if row.state not in expected or not items:
        raise HTTPException(409, "הגרסה הזו כבר השתנתה. רעננו כדי לראות את המצב הנוכחי.")
    extra = loads(strategy.roadmap_json, {})
    posts = extra["roadmap"]["posts"]
    for item in items:
        target = next((p for p in posts if p.get("uid") == item["uid"]), None)
        previous = item["original"] if action == "keep" else item["proposal"]
        if not target or protected(target) or fingerprint(target) != fingerprint(previous):
            raise HTTPException(409, "אחד הפוסטים השתנה או אושר בינתיים. לא החלפנו אף פוסט; רעננו את התוכנית.")
    for item in items:
        target = next(p for p in posts if p.get("uid") == item["uid"])
        desired = snapshot(item["proposal"] if action == "keep" else item["original"])
        for key in FIELDS:
            target.pop(key, None)
        target.update(desired)
    strategy.roadmap_json = dumps(extra)
    row.state = "kept" if action == "keep" else "undone"
    row.updated_at = datetime.utcnow()
    db.commit()
    return strategy


def stop_interrupted():
    """Single-instance deployment startup. Never replay a provider submission."""
    from app.db import SessionLocal
    with SessionLocal() as db:
        for row in db.query(CampaignRevision).filter_by(state="working"):
            row.state = "failed"
            row.error_he = "היצירה נעצרה. הפוסטים הקודמים נשארו שמורים; בדקו את המכסה לפני יצירה חדשה."
            row.updated_at = datetime.utcnow()
        db.commit()
