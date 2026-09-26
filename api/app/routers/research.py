"""The ongoing research engine, for the owner (services/research.py).

* `GET /research/latest` — the newest run: headline, insights ("מה למדנו" + "מה זה
  משנה"), findings per source and each source's status (incl. "needs an Instagram
  connection"). Before the first run: `available: false` and what each source will use.
* `POST /research/run` — run it now. At most 3 manual runs per business per 24 hours
  (the weekly job does not count); 429 with a Hebrew message beyond that.
* `GET /research/history?limit=` — earlier runs, newest first, insights without the
  raw findings.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_business
from app.models import Business, ResearchRun
from app.services import research

router = APIRouter(prefix="/research", tags=["research"])

EMPTY_HE = (
    "עוד לא הרצנו מחקר לעסק הזה. המחקר בודק מה המתחרים מפרסמים, מה מחפשים בגוגל, "
    "אילו חגים וימי קניות מתקרבים, מה הצליח אצלכם ומה חסר באתר, ואומר מה זה משנה בתוכנית."
)


@router.get("/latest")
def latest(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    run = research.latest_run(db, business.id)
    rate = research.rate_status(db, business.id)
    if not run:
        # 200 with a flag, like /performance/latest: "not run yet" is a normal state.
        return {
            "available": False,
            "empty_state_he": EMPTY_HE,
            "run": None,
            "sources": research.readiness(db, business),
            "source_labels_he": research.SOURCE_LABEL_HE,
            "rate_limit": rate,
        }
    payload = research.serialize_run(run)
    return {
        "available": True,
        "empty_state_he": "",
        "run": payload,
        "sources": payload["sources"],
        "source_labels_he": research.SOURCE_LABEL_HE,
        "rate_limit": rate,
    }


@router.post("/run")
def run_now(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    try:
        research.check_rate_limit(db, business.id)
    except research.ResearchRateLimited as exc:
        raise HTTPException(
            status_code=429,
            detail=str(exc),
            headers={"Retry-After": str(max(60, int((exc.retry_at - datetime.utcnow()).total_seconds())))},
        ) from exc
    run = research.run_research(db, business, trigger="manual")
    payload = research.serialize_run(run)
    return {
        "available": True,
        "empty_state_he": "",
        "run": payload,
        "sources": payload["sources"],
        "source_labels_he": research.SOURCE_LABEL_HE,
        "rate_limit": research.rate_status(db, business.id),
    }


@router.get("/history")
def history(
    limit: int = Query(default=10, ge=1, le=50),
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    runs = (
        db.query(ResearchRun)
        .filter(ResearchRun.business_id == business.id)
        .order_by(ResearchRun.created_at.desc(), ResearchRun.id.desc())
        .limit(limit)
        .all()
    )
    return {
        "runs": [research.serialize_run(run, with_findings=False) for run in runs],
        "empty_state_he": "" if runs else EMPTY_HE,
    }
