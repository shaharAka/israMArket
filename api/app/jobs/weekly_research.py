"""Run the research engine once a week for every business.

    cd api && python -m app.jobs.weekly_research              # every business due
    python -m app.jobs.weekly_research --business-id 1        # one business
    python -m app.jobs.weekly_research --force                # ignore the 6-day gap
    python -m app.jobs.weekly_research --dry-run              # list who is due

A business is due when its newest research run is older than six days (or it has none).
Scheduled runs are stored with `trigger="scheduled"` and do not use the owner's three
manual runs a day. No scheduler lives inside the API: cron (or the platform's scheduled
job) calls this module — see DEPLOY.md. Exit code 1 if any business failed.

Each business run also writes the week's numbers onto its posts (WhatsApp taps and stored
Instagram numbers, services/connected_posts.refresh_results) and then refreshes the month's
hypothesis statuses (services/hypotheses.py), best effort: a failure there is logged and
never counts as the business failing.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime

from app.db import Base, SessionLocal, engine, migrate_db
from app.models import Business
from app.services import billing, connected_posts, hypotheses, model_usage, research


def due(db, business: Business, now: datetime, force: bool = False) -> bool:
    if force:
        return True
    last = research.latest_run(db, business.id)
    return last is None or (now - last.created_at) >= research.WEEKLY_MIN_GAP


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Weekly research run for every business.")
    parser.add_argument("--business-id", type=int, default=None)
    parser.add_argument("--force", action="store_true", help="run even if a run exists from the last 6 days")
    parser.add_argument("--dry-run", action="store_true", help="only print which businesses are due")
    args = parser.parse_args(argv)

    # Same boot as the API, so a fresh volume or a new table works from cron too.
    Base.metadata.create_all(bind=engine)
    migrate_db()
    model_usage.install()

    now = datetime.utcnow()
    failures = 0
    db = SessionLocal()
    try:
        query = db.query(Business).order_by(Business.id.asc())
        if args.business_id is not None:
            query = query.filter(Business.id == args.business_id)
        businesses = query.all()
        for business in businesses:
            if not due(db, business, now, args.force):
                print(f"skip  business={business.id} (ran in the last 6 days)")
                continue
            # The same gate as the API's generation endpoints (off unless BILLING_ENFORCE).
            if business.owner is not None and billing.locked(db, business.owner, now):
                print(f"skip  business={business.id} (free month over, no subscription)")
                continue
            # Suspended in the backoffice: no API use, so no scheduled model spend either.
            if business.owner is not None and business.owner.suspended_at is not None:
                print(f"skip  business={business.id} (account suspended)")
                continue
            if args.dry_run:
                print(f"due   business={business.id} {business.name}")
                continue
            # Model calls below are counted for this business (services/model_usage.py).
            with model_usage.attributed(business.id, engine):
                try:
                    run = research.run_research(db, business, trigger="scheduled", now=datetime.utcnow())
                    insights = (research.serialize_run(run, with_findings=False).get("insights")) or []
                    print(f"done  business={business.id} run={run.id} status={run.status} insights={len(insights)}")
                except Exception as exc:  # keep going; one business must not stop the rest
                    db.rollback()
                    failures += 1
                    print(f"fail  business={business.id}: {type(exc).__name__}: {exc}", file=sys.stderr)
                # The week's numbers onto the posts first (docs/posts-v2.md, Feedback 6-7): the
                # WhatsApp taps per post code and the Instagram numbers already stored, so a post
                # becomes "נמדד" and gets its "מה לומדים" line without the owner opening Results.
                # No provider is read here. Best effort, like the hypotheses below.
                try:
                    outcome = connected_posts.refresh_results(db, business)
                    db.commit()
                    print(f"posts business={business.id} updated={outcome['updated']} measured={outcome['measured']}")
                except Exception as exc:  # noqa: BLE001
                    db.rollback()
                    print(f"warn  business={business.id} post results: {type(exc).__name__}", file=sys.stderr)
                # The week's look at the month's hypotheses (docs/posts-v2.md, Phase C): the
                # statuses move with this week's numbers. Best effort, never fails the job.
                review = hypotheses.refresh_for_business(db, business)
            if review is not None:
                db.commit()
                moved = sum(1 for item in review.get("items") or [] if item.get("status") != "measuring")
                print(f"hyp   business={business.id} items={len(review.get('items') or [])} decided={moved}")
    finally:
        db.close()
        try:
            model_usage.flush(timeout=15)
        except Exception:
            pass
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
