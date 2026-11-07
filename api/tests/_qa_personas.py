"""Test-only account fixtures for isolated browser QA; never imported by application code."""

from __future__ import annotations

import hashlib
import json
import shutil
import calendar
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import Asset, Audience, Business, GenerationJob, MediaAllowance, Strategy, User
from app.security import hash_password, initial_session_epoch
from app.services import billing, connected_posts
from app.services.images import media_root
from app.services.jsonutil import dumps

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "qa_personas.json"
QA_PASSWORD = "qa-only-personas-2026"
EXPECTED_IDS = {"store", "physical", "designer", "software", "fundraising"}
PERSONA_ORDER = ("store", "physical", "designer", "software", "fundraising")
SHOWCASE = Path(__file__).resolve().parents[2] / "web" / "public" / "showcase"
POPULATED_ASSETS = {
    "store": ("bakery-challah-ai.png", "bakery-bread-choice-ai.jpg", "bakery-human-motion-ai.mp4"),
    "physical": ("clothing-weekend-look-ai.jpg", "clothing-linen-ai.png", "kefel-fitting-room-campaign.mp4"),
    "designer": ("interior-finished-corner-ai.jpg", "interior-materials-ai.png", "designer-human-motion-ai.mp4"),
    "software": ("maslul-project-demo-he.jpg", "software-owner-focus-ai.jpg", "maslul-project-demo-he.mp4"),
    "fundraising": ("nonprofit-community-ai.png", "nonprofit-volunteer-detail-ai.png", "community-human-motion-ai.mp4"),
}
WEEKLY_FOCUS = {
    "store": ("מכירים את האפשרויות לשולחן שישי", "בוחרים מה מתאים להזמנה", "רואים איך מכינים את המאפים", "מזמינים מראש לסוף השבוע"),
    "physical": ("מגלים פריטים נוחים ליום יום", "מרכיבים שילובים לעונות מעבר", "רואים פרטים מקרוב", "בוחרים ומגיעים למדוד בחנות"),
    "designer": ("מגדירים מה חשוב בבית", "בוחרים חומרים וכיווני תכנון", "רואים איך רעיון מתחבר לחלל", "קובעים שיחת היכרות לתכנון"),
    "software": ("רואים משימות והתקדמות בפרויקט", "מחלקים אחריות בין חברי הצוות", "סוקרים לוח פרויקט עובד", "בודקים את מסלול בניסיון צוותי"),
    "fundraising": ("מכירים את פעילות החונכות", "רואים איך נראה תרגול בקצב אישי", "מציגים את עבודת המתנדבים", "מגלים איך אפשר לתמוך בלמידה"),
}
POST_TITLES = {
    "store": ("מארזים לשולחן שישי", "לחם מחמצת לבוקר", "עוגה לסוף השבוע", "מה נכנס למארז", "בחירת המאפה", "רגע לפני האיסוף", "כך נראית ההכנה", "עובדים עם מחמצת", "מה יוצא מהתנור", "איך בוחרים מראש", "מתכננים את שישי", "אפשרויות להזמנה"),
    "physical": ("פריט נוח ליום יום", "שכבה לעונה מתחלפת", "פרט שעושה הבדל", "שלושה פריטים לשילוב", "איך בוחרים מידה", "צבעים שעובדים יחד", "הבד מקרוב", "גזרה בתנועה", "שילוב לבוקר ולערב", "מחפשים בגד נוח", "מודדים בחנות", "שכבה אחרונה למראה"),
    "designer": ("מתחילים מההרגלים בבית", "מתכננים לפני השיפוץ", "חדר אחד, כמה שימושים", "בוחרים חומרים", "אור בחלל", "מה חשוב למדוד", "מחברים צבע ומרקם", "רואים פינה גמורה", "פרט קטן בחדר", "מה להביא לפגישה", "מחדדים את הצרכים", "שיחת היכרות לתכנון"),
    "software": ("משימות הפרויקט במקום אחד", "מי אחראי על כל שלב", "רואים מה הושלם", "מחלקים עבודה לשלבים", "מעבירים משימה בין מצבים", "סוקרים את לוח הצוות", "תכנון השבוע בצוות", "פחות רדיפה אחרי עדכונים", "מסלול הפרויקט מקרוב", "פותחים פרויקט לדוגמה", "רואים אחריות והתקדמות", "מנסים את הלוח בצוות"),
    "fundraising": ("מקום לשאול ולתרגל", "מתקדמים בקצב אישי", "פוגשים את החונכות", "מה מתרגלים יחד", "לומדים צעד אחר צעד", "שגרה של תרגול", "מתנדבים לצד הילדים", "רגע של הבנה חדשה", "איך נראית פגישה", "מכירים את הפעילות", "דרך לתמוך בלמידה", "עוזרים ליצור מקום ללמוד"),
}
STATE_BY_POST = ("review", "review", "approved", "review", "review", "published",
                 "review", "review", "published", "review", "review", "published")
CHANNELS_BY_PERSONA = {
    "store": ("instagram", "facebook", "tiktok"),
    "physical": ("instagram", "facebook", "tiktok"),
    "designer": ("instagram", "facebook", "tiktok"),
    "software": ("linkedin", "facebook", "instagram"),
    "fundraising": ("instagram", "facebook", "tiktok"),
}


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


def _populated_assets(db: Session, business_id: int, persona_id: str) -> list[Asset]:
    """Copy reviewed public fixture art into the throwaway account's private media folder."""
    assets: list[Asset] = []
    folder = media_root() / str(business_id)
    folder.mkdir(parents=True, exist_ok=True)
    for filename in POPULATED_ASSETS[persona_id]:
        source = SHOWCASE / filename
        if not source.is_file():
            raise FileNotFoundError(f"Missing QA showcase asset: {source}")
        digest = hashlib.sha256(source.read_bytes()).hexdigest()[:12]
        stored_name = f"qa-{Path(filename).stem}-{digest}{source.suffix.lower()}"
        shutil.copyfile(source, folder / stored_name)
        mime = "video/mp4" if source.suffix.lower() == ".mp4" else (
            "image/png" if source.suffix.lower() == ".png" else "image/jpeg")
        asset = Asset(business_id=business_id, filename=stored_name,
                      kind="video" if mime.startswith("video/") else "image", mime=mime,
                      source="upload", description="קובץ דוגמה ציבורי לבדיקת ממשק QA",
                      tags_json=json.dumps(["qa", persona_id], ensure_ascii=False))
        db.add(asset)
        db.flush()
        assets.append(asset)
    return assets


def _populated_posts(case: dict, business_id: int, audience: Audience, now: datetime,
                     assets: list[Asset]) -> list[dict]:
    """Four weeks of staged drafts and explicitly labelled, fictional QA measurements."""
    posts = []
    persona_index = PERSONA_ORDER.index(case["id"])
    image_assets = [asset for asset in assets if asset.kind == "image"]
    video_asset = next(asset for asset in assets if asset.kind == "video")
    for index in range(12):
        week = index // 3 + 1
        state = STATE_BY_POST[index]
        image = image_assets[index % len(image_assets)]
        seed = case["post"]
        channel = CHANNELS_BY_PERSONA[case["id"]][index % 3]
        is_video = channel == "tiktok" or (case["id"] == "software" and channel == "instagram")
        day = min(calendar.monthrange(now.year, now.month)[1], 2 + (week - 1) * 7 + (index % 3) * 2)
        date_hint = now.replace(day=day).date().isoformat()
        title = POST_TITLES[case["id"]][index]
        fmt = "reel" if is_video else ("carousel" if channel == "facebook" else "image")
        post = {
            **seed,
            "uid": f"qa-{case['id']}-w{week}-p{index % 3 + 1}",
            "week": week,
            "primary_outlet": channel,
            "channel": channel,
            "outlets": [channel],
            "title": title,
            "format": fmt,
            "date_hint": date_hint,
            "hook": seed["hook"],
            "caption": f"{title}. {seed['caption']}",
            "content_language": "he",
            "audience_id": audience.id,
            "audience_name": audience.name,
            "approval_status": "review" if state == "review" else "approved",
            "approved_at": None if state == "review" else (now - timedelta(days=12 - index)).isoformat(),
            "published_url": "",
            "published_at": None,
            "image_url": f"/backend/media/{business_id}/{image.filename}",
            "image_source": "asset",
            "image_asset_id": image.id,
            "mix_type": "value" if index % 4 == 0 else "product",
            "created_at": (now - timedelta(days=28 - index)).isoformat(),
        }
        if is_video:
            post.update(format="reel", video_url=f"/backend/media/{business_id}/{video_asset.filename}",
                        video_asset_id=video_asset.id, video_source="asset")
        if state == "published":
            published = now - timedelta(days=max(1, 12 - index))
            post.update(published_at=published.isoformat(),
                        published_url=f"https://qa-fixture.invalid/{case['id']}/{post['uid']}")
            measure = connected_posts.measure_for(post)
            metric = measure["metric"]
            number = 18 + persona_index * 9 + index * 3
            result_key = connected_posts.RESULT_KEY[metric]
            observation = {"value": number, "source": "qa_fixture", "read_at": now.isoformat(),
                           "fixture_notice": "מספר דוגמה לסביבת QA; אינו נתון מערוץ מחובר."}
            post["results"] = {"metric": metric, "value": number, result_key: number,
                               "matched_by": ["qa_fixture"], "updated_at": now.isoformat(),
                               "observations": {metric: observation}, "fixture_data": True}
        posts.append(post)
    return posts


def seed_personas(db: Session, populated: bool = False) -> list[dict]:
    """Seed fictional accounts; populated mode adds local media and clearly tagged metrics."""
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

        staged_assets = _populated_assets(db, business.id, case["id"]) if populated else []

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
        sample_post = {
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
        }
        roadmap = {
            "posts": _populated_posts(case, business.id, audience, now, staged_assets)
            if populated else [sample_post],
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
                "focus": (WEEKLY_FOCUS[case["id"]][week - 1] if populated else
                          plan_case["week_focus"] if week == 1 else f"ממשיכים לבדוק: {case['primary_goal']}"),
                "what_we_do": ["עורכים את טיוטת הקמפיין."],
                "what_user_does": ["מאשרים שהמסר נכון לעסק."],
                "metrics_target": ["חשיפה לפוסטים (מדד ביניים בלבד)"],
                "media_distribution": ", ".join(CHANNELS_BY_PERSONA[case["id"]]) if populated else case["post"]["channel"],
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
