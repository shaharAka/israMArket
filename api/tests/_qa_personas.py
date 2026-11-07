"""Test-only account fixtures for isolated browser QA; never imported by application code."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import Audience, Business, GenerationJob, MediaAllowance, Strategy, User
from app.security import hash_password, initial_session_epoch
from app.services import billing
from app.services.jsonutil import dumps

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "qa_personas.json"
QA_PASSWORD = "qa-only-personas-2026"
EXPECTED_IDS = {"store", "physical", "designer", "software", "fundraising"}


def personas() -> list[dict]:
    payload = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    if payload.get("version") != 1 or not isinstance(payload.get("personas"), list):
        raise ValueError("Unsupported QA persona fixture version")
    cases = payload["personas"]
    ids = {case.get("id") for case in cases}
    if ids != EXPECTED_IDS or len(cases) != len(EXPECTED_IDS):
        raise ValueError("QA fixtures must contain exactly the five reviewed personas")
    for case in cases:
        if case.get("state", {}).get("trial") not in {"active", "expired"}:
            raise ValueError(f"Invalid trial state for {case.get('id')}")
        if case.get("state", {}).get("images") not in {"available", "exhausted"}:
            raise ValueError(f"Invalid image allowance state for {case.get('id')}")
        if case.get("state", {}).get("generation") not in {"idle", "failed"}:
            raise ValueError(f"Invalid generation state for {case.get('id')}")
    return cases


def seed_personas(db: Session) -> list[dict]:
    """Seed an empty SQLite database with fictional accounts and deterministic states."""
    if db.get_bind().dialect.name != "sqlite":
        raise ValueError("QA persona fixtures may only seed SQLite")
    if db.query(User).count() or db.query(Business).count():
        raise ValueError("Refusing to seed a database that already contains accounts")

    now = datetime.utcnow()
    password_hash = hash_password(QA_PASSWORD)
    result: list[dict] = []
    for case in personas():
        state = case["state"]
        started = now - timedelta(days=45 if state["trial"] == "expired" else 2)
        user = User(
            email=case["email"], full_name=case["name"], password_hash=password_hash,
            session_epoch=initial_session_epoch(), created_at=started, trial_started_at=started,
        )
        db.add(user)
        db.flush()

        plan_case = case["plan"]
        quarter_plan = {
            "strategy": {
                "one_liner_he": plan_case["hypothesis"],
                "angle_he": plan_case["week_focus"],
                "why_he": "נבדוק את הכיוון מול נתונים שיתחברו בהמשך, בלי להניח תוצאה מראש.",
            },
            "kpi": {
                "key": plan_case["kpi"],
                "name_he": plan_case["kpi_name"],
                "how_he": "היעד העסקי ייבדק כשיהיו נתונים מתאימים; חשיפה לפוסט היא מדד ביניים בלבד.",
                "baseline_he": "הנתון עדיין לא נמדד",
                "needs": [],
                "available_now": False,
            },
            "measures": [{
                "name_he": "חשיפה לפוסטים",
                "how_he": "מדד ביניים לתוכן; אינו מוכיח הזמנה, ביקור או פנייה.",
                "needs": ["instagram_insights"],
                "available_now": False,
            }],
            "integrations": [],
            "channels": [{
                "key": case["post"]["channel"],
                "name_he": {"instagram": "אינסטגרם", "facebook": "פייסבוק", "whatsapp": "וואטסאפ", "tiktok": "טיקטוק", "linkedin": "לינקדאין"}[case["post"]["channel"]],
                "kind": "existing",
                "why_he": "הערוץ שנבחר לפוסט הדוגמה.",
                "starts_month": 1,
                "effort_he": "לפי הזמן של בעלת או בעל העסק",
            }],
            "audiences": [{"name": case["audience"]["name"], "role": "primary", "message_he": case["audience"]["summary"]}],
            "budget": {"monthly_ils": None, "months": [], "organic_only": True, "sources_he": []},
            "calendar": [{"month_label": f"{now.month:02d}/{now.year}", "year": now.year, "month": now.month,
                          "weeks": [{"week": 1, "focus_he": plan_case["week_focus"]}], "dates": [],
                          "checkpoint_he": "נבדוק יחד מה אפשר ללמוד אחרי שיהיו נתונים."}],
            "content": [{"month_label": f"{now.month:02d}/{now.year}",
                         "pillars": [{"key": "qa-topic", "title": plan_case["week_focus"], "description_he": case["offerings"]}],
                         "cadence": [{"channel_key": case["post"]["channel"], "per_week": "פוסט דוגמה אחד"}],
                         "mix": []}],
            "assumptions": [{"bet_he": plan_case["hypothesis"], "if_wrong_he": "נעדכן את הכיוון לפי מה שנלמד."}],
            "start": {"year": now.year, "month": now.month},
        }
        research_journey = {
            "version": 1,
            "segment": case["segment"],
            "phase": "after",
            "step": "build",
            "replies": [],
            "observations": [
                {"key": "outcomes", "status": "unknown", "unit": "count", "period": "last_30_days", "source": "owner"},
                {"key": "marketing_budget", "status": "unknown", "unit": "ILS", "period": "per_month", "source": "owner"},
            ],
        }
        stored = {
            "quarter_plan": quarter_plan,
            "owner_context": {"research_journey": research_journey},
        }
        business = Business(
            user_id=user.id, name=case["name"], website_url="", business_type=case["business_type"],
            offerings=case["offerings"], location=case["location"], presence_type=case["presence_type"],
            business_model=case["business_model"], primary_goal=case["primary_goal"],
            monthly_budget_ils=0, scraped_profile_json=dumps(stored), onboarding_complete=1,
        )
        db.add(business)
        db.flush()

        audience_case = case["audience"]
        audience = Audience(
            business_id=business.id,
            name=audience_case["name"],
            summary=audience_case["summary"],
            description=audience_case["summary"],
            needs_json=dumps(audience_case["needs"]),
            where_json=dumps(audience_case["where"]),
            targeting_json=dumps({}),
            priority="primary",
            source="manual",
            is_primary=1,
        )
        db.add(audience)
        db.flush()

        post_case = case["post"]
        roadmap = {
            "posts": [{
                **post_case,
                "week": 1,
                "primary_outlet": post_case["channel"],
                "outlets": [post_case["channel"]],
                "approval_status": "review",
                "approved_at": None,
                "published_url": "",
                "published_at": None,
                "audience_id": audience.id,
                "audience_name": audience.name,
                "created_at": now.isoformat(),
            }],
            "relevant_events": [],
            "long_horizon_plan": {
                "horizon": "שלושת החודשים הקרובים",
                "hypothesis": plan_case["hypothesis"],
                "targets": plan_case["targets"],
                "milestones": [],
            },
            "monthly_horizon_plan": {
                "hypothesis": plan_case["hypothesis"],
                "goal_he": plan_case["kpi_name"],
                "targets": plan_case["targets"],
            },
            "management_and_checkpoints": {
                "how_we_help": "הטיוטה נועדה לבדיקה ולעריכה לפני פרסום.",
                "when_we_need_user": ["לבדוק שהכיוון והפרטים מתאימים לעסק."],
                "checkpoints": [{"timing": "אחרי איסוף נתונים", "purpose": "לבדוק אם המדד תומך בכיוון.", "user_action": "לאשר מה קרה בפועל."}],
            },
            "weekly_breakdown": [{
                "week": week,
                "focus": plan_case["week_focus"] if week == 1 else f"ממשיכים לבדוק: {case['primary_goal']}",
                "what_we_do": ["עורכים את טיוטת הקמפיין."],
                "what_user_does": ["מאשרים שהמסר נכון לעסק."],
                "metrics_target": ["חשיפה לפוסטים (מדד ביניים בלבד)"],
                "media_distribution": case["post"]["channel"],
            } for week in range(1, 5)],
        }
        db.add(Strategy(
            business_id=business.id, year=now.year, month=now.month,
            usp_json=dumps({"usp": case["offerings"], "growth_hypothesis": ""}),
            calendar_json=dumps([]),
            roadmap_json=dumps({"roadmap": roadmap, "posting_plan": {}, "competitors": []}),
        ))

        if state["images"] == "exhausted":
            end = billing.trial_end(db, user)
            db.add(MediaAllowance(
                user_id=user.id, kind="image", period_start=started, period_end=end,
                used=20, reserved=0, attempts=40, committed_microusd=0, reserved_microusd=0,
            ))
        if state["generation"] == "failed":
            db.add(GenerationJob(
                business_id=business.id, kind="first_month", status="failed",
                year=now.year, month=now.month,
                error_he="בניית התוכנית נעצרה. התשובות נשמרו; אפשר לנסות שוב.",
                error_detail="qa_fixture: offline failure state",
                started_at=now - timedelta(minutes=5), updated_at=now,
                heartbeat_at=now, finished_at=now,
            ))
        result.append({**case, "user_id": user.id, "business_id": business.id, "audience_id": audience.id})

    db.commit()
    return result
