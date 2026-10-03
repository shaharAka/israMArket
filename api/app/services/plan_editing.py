"""Owner edits to plan intent. No model call, content rewrite or publication."""
from copy import deepcopy
from datetime import datetime
import hashlib

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import exists, update

from app.models import Audience, Business, GenerationJob, Strategy
from app.services.audiences import MAX_AUDIENCES, PRIMARY, SECONDARY
from app.services.jsonutil import dumps, loads


def _dict(value):
    return value if isinstance(value, dict) else {}


def _text(value):
    return value.strip() if isinstance(value, str) else ""


def _list(value):
    return value if isinstance(value, list) else []


class AssumptionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bet_he: str = Field(min_length=1, max_length=300)
    if_wrong_he: str = Field(default="", max_length=300)

    @field_validator("bet_he", "if_wrong_he", mode="before")
    @classmethod
    def trim(cls, value):
        return value.strip() if isinstance(value, str) else value


class EditIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: str = Field(min_length=64, max_length=64)
    direction: str = Field(min_length=1, max_length=300)
    audience: str = Field(min_length=1, max_length=160)
    assumptions: list[AssumptionIn] = Field(default_factory=list, max_length=4)

    @field_validator("direction", "audience", mode="before")
    @classmethod
    def trim(cls, value):
        return value.strip() if isinstance(value, str) else value


def revision(business) -> int:
    value = _dict(loads(getattr(business, "scraped_profile_json", ""), {})).get("plan_revision", 0)
    return value if type(value) is int and value >= 0 else 0


def _version(business, strategy):
    parts = [business.id, business.scraped_profile_json,
             strategy.id if strategy else None,
             strategy.roadmap_json if strategy else None, strategy.usp_json if strategy else None,
             [(a.id, a.name, a.is_primary) for a in sorted(business.audiences, key=lambda a: a.id)]]
    return hashlib.sha256(repr(parts).encode()).hexdigest()


def view(db, business, strategy=None):
    stored = _dict(loads(business.scraped_profile_json, {}))
    quarter = _dict(stored.get("quarter_plan"))
    saved = _dict(stored.get("plan_edit"))
    core = _dict(_dict(loads(strategy.roadmap_json, {})).get("roadmap")) if strategy else {}
    usp = _dict(loads(strategy.usp_json, {})) if strategy else {}
    primary = next((a for a in _list(quarter.get("audiences")) if isinstance(a, dict) and a.get("role") == "primary"), {})
    fallback_audience = next((a.name for a in business.audiences if a.is_primary), "")
    direction = saved.get("direction") or _dict(quarter.get("strategy")).get("one_liner_he") or usp.get("growth_hypothesis") or _dict(core.get("monthly_horizon_plan")).get("hypothesis") or usp.get("usp_one_liner")
    raw_assumptions = saved.get("assumptions", quarter.get("assumptions", []))
    return {"business_id": business.id, "strategy_id": strategy.id if strategy else None,
            "available": bool(quarter or strategy or saved), "version": _version(business, strategy),
            "revision": revision(business), "saved_at": saved.get("saved_at"),
            "blocked": bool(db.query(GenerationJob.id).filter(GenerationJob.business_id == business.id, GenerationJob.status == "running").first()),
            "fields": {"direction": _text(direction), "audience": _text(saved.get("audience") or primary.get("name") or fallback_audience),
                       "assumptions": [{"bet_he": _text(a.get("bet_he")), "if_wrong_he": _text(a.get("if_wrong_he"))}
                                       for a in _list(raw_assumptions) if isinstance(a, dict)][:4]}}


def save(db, business, strategy, body: EditIn):
    current = view(db, business, strategy)
    if not current["available"]:
        raise HTTPException(409, "עוד אין תוכנית לעריכה. חזרו לתוכנית כדי לבנות אותה.")
    if current["blocked"]:
        raise HTTPException(409, "בונים כרגע את תוכנית החודש או את הפוסטים. חזרו לתוכנית לראות את ההתקדמות, ואז נסו לשמור שוב.")
    if body.version != current["version"]:
        raise HTTPException(409, "התוכנית עודכנה בינתיים. השינויים שלכם נשארו כאן; בדקו את העדכון לפני שמירה.")
    fields = body.model_dump(exclude={"version"})
    if fields == current["fields"]:
        return current
    direction_changed = body.direction != current["fields"]["direction"]
    # Reuse an existing segment or create the owner's named one. Never rename a
    # historical segment: stored posts keep their original audience id and name.
    segments = list(business.audiences)
    chosen = next((a for a in segments if a.name.strip().casefold() == body.audience.casefold()), None)
    if chosen is None and len(segments) >= MAX_AUDIENCES:
        raise HTTPException(422, "כבר הגדרתם 5 קהלים. בחרו שם של קהל קיים, או עדכנו את הקהלים בהחלטות שלי ואז חזרו לכאן.")
    original_profile = business.scraped_profile_json
    stored = deepcopy(_dict(loads(original_profile, {})))
    saved_at = datetime.utcnow().isoformat()
    next_revision = revision(business) + 1
    stored["plan_revision"] = next_revision
    stored["plan_edit"] = {**fields, "saved_at": saved_at, "revision": next_revision}
    # Preserve the actual original plan for audit; subsequent saves retain this copy.
    if "plan_before_owner_edit" not in stored:
        stored["plan_before_owner_edit"] = deepcopy(stored.get("quarter_plan"))
        stored["first_month_seed_before_owner_edit"] = deepcopy(stored.get("first_month_seed"))
    quarter = _dict(stored.get("quarter_plan"))
    if quarter:
        quarter["strategy"] = {**_dict(quarter.get("strategy")), "one_liner_he": body.direction,
                               "why_he": "התוכנית עודכנה על ידכם. בהצעות הבאות נתכנן לפי העדכון הזה.", "based_on": "עדכון שלכם"}
        if direction_changed:
            quarter["strategy"]["angle_he"] = ""
            quarter["strategy"].pop("from_insight", None)
        audiences = [a for a in _list(quarter.get("audiences")) if isinstance(a, dict) and a.get("role") != "primary"]
        quarter["audiences"] = [{"name": body.audience, "role": "primary", "message_he": ""}, *audiences[:3]]
        quarter["assumptions"] = fields["assumptions"]
    # Seed edits travel into a first month's stage and all later generation prompts.
    seed = _dict(stored.get("first_month_seed"))
    if seed:
        seed_strategy = _dict(seed.get("strategy"))
        seed_strategy.update(objective={**_dict(seed_strategy.get("objective")), "text_he": body.direction},
                             audiences=[{"name": body.audience, "role": "primary", "message_he": ""}],
                             assumptions=[a["bet_he"] for a in fields["assumptions"]])
        if direction_changed:
            # Old seed weeks otherwise overwrite newly generated weeks deterministically.
            # Keep approved numeric measures, budget, channels and cadence; let future
            # generation propose tactics for the owner's new intent.
            for key in ("angle", "month_plan", "offer"):
                seed_strategy.pop(key, None)
            # A valid seed needs a pillar catalog. Use the owner's actual intent,
            # rather than retain tactics from the superseded direction or drop
            # the seed (which would also discard approved targets and cadence).
            seed_strategy["pillars"] = [{"key": "owner_direction", "title": body.direction[:80],
                                         "description_he": body.direction}]
            seed.pop("idea", None)
            seed.pop("posts", None)
        seed["strategy"] = seed_strategy
        direction = _dict(seed.get("direction"))
        direction.update(approach_he=body.direction, audience=body.audience)
        if direction_changed:
            direction["title"] = body.direction
            direction["why_he"] = "הכיוון עודכן על ידי בעל העסק."
            direction.pop("first_steps", None)
        seed["direction"] = direction
    stored["growth_hypothesis"] = body.direction
    horizon = _dict(stored.get("long_horizon_plan"))
    if horizon:
        horizon["hypothesis"] = body.direction
    # CAS guards another profile writer and a generation job that started meanwhile.
    running = exists().where(GenerationJob.business_id == business.id, GenerationJob.status == "running")
    # A failed, partial build was planned before the edit. Retry from the new inputs,
    # rather than resume those stale stages. No generation is started by this save.
    state = _dict(loads(business.generate_state_json, {}))
    next_state = "" if state and state.get("stage") != "done" else business.generate_state_json
    changed = db.execute(update(Business).where(Business.id == business.id, Business.scraped_profile_json == original_profile,
                                              Business.generate_state_json == business.generate_state_json, ~running)
                         .values(scraped_profile_json=dumps(stored), generate_state_json=next_state, updated_at=datetime.utcnow()), execution_options={"synchronize_session": False})
    if changed.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "התוכנית עודכנה בינתיים. בדקו את העדכון לפני שמירה.")
    if strategy:
        extra = deepcopy(_dict(loads(strategy.roadmap_json, {})))
        core = _dict(extra.get("roadmap"))
        extra["roadmap"] = core
        core["summary"] = body.direction
        for key in ("monthly_horizon_plan", "long_horizon_plan"):
            if isinstance(core.get(key), dict):
                core[key]["hypothesis"] = body.direction
        core["owner_plan_edit"] = {**fields, "saved_at": saved_at, "revision": next_revision}
        usp = _dict(loads(strategy.usp_json, {}))
        usp["growth_hypothesis"] = body.direction
        changed = db.execute(update(Strategy).where(Strategy.id == strategy.id, Strategy.business_id == business.id,
                                                    Strategy.roadmap_json == strategy.roadmap_json, Strategy.usp_json == strategy.usp_json)
                             .values(roadmap_json=dumps(extra), usp_json=dumps(usp)), execution_options={"synchronize_session": False})
        if changed.rowcount != 1:
            db.rollback()
            raise HTTPException(409, "התוכנית עודכנה בינתיים. בדקו את העדכון לפני שמירה.")
    for audience in segments:
        if audience.is_primary:
            audience.is_primary = 0
            audience.priority = SECONDARY
    if chosen is None:
        chosen = Audience(business_id=business.id, name=body.audience)
        db.add(chosen)
    chosen.is_primary = 1
    chosen.priority = PRIMARY
    db.commit()
    db.refresh(business)
    db.expire(business, ["audiences"])
    if strategy:
        db.refresh(strategy)
    return view(db, business, strategy)


def prompt_block(edit):
    edit = _dict(edit)
    if not edit.get("direction"):
        return ""
    assumptions = "; ".join(_text(a.get("bet_he")) + (f" (אם לא: {_text(a.get('if_wrong_he'))})" if _text(a.get("if_wrong_he")) else "")
                            for a in _list(edit.get("assumptions")) if isinstance(a, dict))
    return ("עדכון מפורש של בעל העסק לתוכנית המתמשכת. הוא גובר על כיוונים וקהל שהוצעו קודם:\n"
            f"- כיוון: {_text(edit.get('direction'))}\n- קהל בתוכנית: {_text(edit.get('audience'))}\n"
            f"- השערות שצריך לבדוק, לא תוצאות מוכחות: {assumptions or 'לא הוגדרו'}\n"
            "תכננו פוסטים חדשים לפי העדכון. אל תשנו יעדים מספריים, תקציב או נתוני עבר בגללו.")
