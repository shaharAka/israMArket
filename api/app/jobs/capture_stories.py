"""Capture active Instagram Stories hourly, without models or publishing."""
import argparse
from datetime import datetime, timedelta, timezone
from app.db import Base, SessionLocal, engine, migrate_db
from app.models import Integration
from app.services import billing, meta, meta_readiness
from app.services.jsonutil import loads


def eligible(db, item, now):
    owner = item.business.owner
    if not owner or owner.suspended_at is not None or billing.locked(db, owner, now.replace(tzinfo=None)):
        return False
    extra = loads(item.extra_json, {}) or {}
    if item.status != "connected" or not meta_readiness.selection(item)["instagram_id"] or not meta.STORY_SCOPES.issubset(set(extra.get("scopes") or [])):
        return False
    capture = extra.get("story_capture") or {}
    if capture.get("selection_key") == meta_readiness.key(item):
        try:
            previous = datetime.fromisoformat(capture["read_at"].replace("Z", "+00:00"))
            if previous.tzinfo is None:
                previous = previous.replace(tzinfo=timezone.utc)
            if now - previous < timedelta(minutes=55):
                return False
        except (KeyError, TypeError, ValueError):
            pass
    return True


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    Base.metadata.create_all(bind=engine)
    migrate_db()
    failures, captured, due = 0, 0, 0
    with SessionLocal() as db:
        for item in db.query(Integration).filter_by(provider="meta", status="connected").order_by(Integration.id).all():
            if not eligible(db, item, datetime.now(timezone.utc)):
                continue
            due += 1
            if args.dry_run:
                continue
            try:
                report = meta_readiness.capture_stories(db, item)
                if report is not None:
                    captured += len(report["posts"])
                    if report["status"] not in {"ready", "empty"}:
                        failures += 1
            except Exception as exc:
                db.rollback()
                failures += 1
                # Provider exception strings can contain tokens. Only its type is logged.
                print(f"Story capture failed: {type(exc).__name__}")
    print(f"Story capture: due={due} captured={captured} failures={failures} dry_run={args.dry_run}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
