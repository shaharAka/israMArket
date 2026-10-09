"""A successful connection produces a finding without another user action.

The source snapshot is already committed. A small durable queue interprets it, then
prepares a reviewable recommendation using the current plan. No extra provider read,
webhook, notification, plan mutation or publishing. Leases survive a process restart;
CAS claims and a unique snapshot prevent duplicate results. Two attempts per snapshot.
"""
import hashlib
import logging
import os
import secrets
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

from sqlalchemy import func, or_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.services import marketing_outcome

from app.models import AnalysisJob, Business, PerformanceSnapshot, Recommendation, User
from app.services import billing, diagnostics, recommendation_context, service_results
from app.services.business_fields import field_label
from app.services.jsonutil import dumps, loads

logger = logging.getLogger(__name__)
MAX_ATTEMPTS = 2
LEASE_SECONDS = 120
RETRY_SECONDS = 30
_lock = threading.Lock()
_loops = {}


def context_key(business) -> str:
    # Includes the owner's creation date: SQLite may reuse a deleted account's ids.
    # Tokens only contribute to a private digest; never enter model input or logs.
    items = sorted((item.provider, item.status, item.external_id, item.access_token_enc,
                    loads(item.extra_json, {}).get("selected_page_id"),
                    loads(item.extra_json, {}).get("selected_instagram_id"),
                    loads(item.extra_json, {}).get("selected_ad_account_id"),
                    loads(item.extra_json, {}).get("selected_pixel_id"),
                    dumps(loads(item.extra_json, {}).get("page_tokens")))
                   for item in business.integrations if item.provider in {"ga4", "meta"})
    return hashlib.sha256(dumps([business.user_id, business.created_at.isoformat(),
                                business.website_url, items, service_results.fingerprint(business), marketing_outcome.fingerprint(business)]).encode()).hexdigest()


def enqueue(db, snap) -> None:
    business = db.get(Business, snap.business_id)
    if not business or db.query(AnalysisJob).filter_by(snapshot_id=snap.id).first():
        return
    db.add(AnalysisJob(business_id=business.id, snapshot_id=snap.id, context_key=context_key(business)))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # another process already queued this committed source read
    start(sessionmaker(bind=db.get_bind(), autoflush=False))


def _eligible(now):
    return or_((AnalysisJob.status == "pending") & (AnalysisJob.available_at <= now),
               (AnalysisJob.status == "running") & (AnalysisJob.lease_until <= now))


def _claim(factory):
    now, token = datetime.utcnow(), secrets.token_hex(16)
    with factory() as db:
        job = db.query(AnalysisJob).filter(_eligible(now)).order_by(AnalysisJob.id).first()
        if not job:
            return None
        job_id = job.id
        claimed = db.execute(update(AnalysisJob).where(AnalysisJob.id == job_id, _eligible(now)).values(
            status="running", worker_token=token, lease_until=now + timedelta(seconds=LEASE_SECONDS),
            attempts=AnalysisJob.attempts + 1))
        db.commit()
        return (job_id, token) if claimed.rowcount == 1 else None


def _owned(db, job_id, token):
    return db.query(AnalysisJob).filter_by(id=job_id, status="running", worker_token=token).first()


def _current(db, job):
    business = db.get(Business, job.business_id)
    snap = db.get(PerformanceSnapshot, job.snapshot_id)
    latest = db.query(PerformanceSnapshot.id).filter_by(business_id=job.business_id).order_by(
        PerformanceSnapshot.created_at.desc(), PerformanceSnapshot.id.desc()).first()
    return business, snap, bool(business and snap and snap.business_id == business.id and
                                latest and latest[0] == snap.id and context_key(business) == job.context_key)


def _supersede(job, snap):
    job.status = "superseded"
    if snap and loads(snap.diagnostic_json, {}).get("analysis_status") == "pending":
        snap.diagnostic_json = dumps({**loads(snap.diagnostic_json, {}), "analysis_status": "superseded"})


def _execute(factory, job_id, token):
    from app.services import model_usage

    # Model calls are counted for the job's business once it is known (_execute_job).
    with model_usage.scoped():
        _execute_job(factory, job_id, token)


def _execute_job(factory, job_id, token):
    from app.services import model_usage

    # Router serializers are imported here, after app startup, avoiding import cycles.
    from app.routers.recommendations import current_plan
    from app.services.plan_editing import revision

    try:
        with factory() as db:
            job = _owned(db, job_id, token)
            if not job:
                return
            business, snap, current = _current(db, job)
            if not current:
                _supersede(job, snap)
                db.commit()
                return
            model_usage.note_business(business.id, db.get_bind())
            user = db.get(User, business.user_id)
            # Suspended in the backoffice: paused like a locked account, resumed by nobody
            # until a later read queues it again.
            if not user or billing.locked(db, user) or user.suspended_at is not None:
                job.status = "paused"
                snap.diagnostic_json = dumps({**loads(snap.diagnostic_json, {}), "analysis_status": "paused"})
                db.commit()
                return
            plan = current_plan(db, business)
            plan_key = (plan.get("id"), revision(business))
            ga, meta, basis = recommendation_context.prepare(business, plan, recommendation_context.snapshot_view(snap))
            payload = {"name": business.name, "business_type": field_label(business.business_type),
                       "offerings": business.offerings, "primary_goal": business.primary_goal,
                       "business_model": business.business_model or "products",
                       "monthly_budget_ils": business.monthly_budget_ils, "analysis_basis": basis,
                       **marketing_outcome.context(business),
                       **service_results.model_context(business)}
            diagnostic = loads(snap.diagnostic_json, {})
            if job.attempts > MAX_ATTEMPTS:
                job.status = "unavailable"
                snap.diagnostic_json = dumps({**diagnostic, "analysis_status": "unavailable"})
                db.commit()
                return
        # No DB transaction or request session is held across model calls.
        if not diagnostic.get("diagnosis_complete"):
            diagnostic = diagnostics.diagnose(payload, ga, meta)
            if not isinstance(diagnostic, dict) or not isinstance(diagnostic.get("headline"), str):
                raise ValueError("Invalid diagnostic response")
            diagnostic = {**diagnostic, "diagnosis_complete": True, "analysis_status": "pending"}
            with factory() as db:
                job = _owned(db, job_id, token)
                if not job or not _current(db, job)[2]:
                    if job:
                        _supersede(job, db.get(PerformanceSnapshot, job.snapshot_id))
                        db.commit()
                    return
                db.get(PerformanceSnapshot, job.snapshot_id).diagnostic_json = dumps(diagnostic)
                db.commit()
        proposed = diagnostics.recommend(payload, recommendation_context.for_model(plan), diagnostic, ga, meta)
        if not isinstance(proposed, dict) or not isinstance(proposed.get("suggestions"), list):
            raise ValueError("Invalid recommendation response")
        suggestions = recommendation_context.bind(proposed, basis, plan)
        with factory() as db:
            job = _owned(db, job_id, token)
            if not job:
                return
            business, snap, current = _current(db, job)
            if not current:
                _supersede(job, snap)
            elif (current_plan(db, business).get("id"), revision(business)) != plan_key:
                # A plan edit while the model worked must be interpreted before offering
                # an action. One bounded retry; never silently bind to a different plan.
                job.status = "pending" if job.attempts < MAX_ATTEMPTS else "unavailable"
                job.available_at = datetime.utcnow() + timedelta(seconds=RETRY_SECONDS)
                snap.diagnostic_json = dumps({**diagnostic, "analysis_status": job.status})
            else:
                db.add(Recommendation(business_id=business.id, week_of=diagnostics.week_of(), suggestions_json=dumps(suggestions)))
                snap.diagnostic_json = dumps({**diagnostic, "analysis_status": "ready"})
                job.status = "done"
            db.commit()
    except Exception:
        # No raw provider/model exception text: it may include private content or tokens.
        logger.warning("Automatic source analysis needs a retry (job %s)", job_id)
        with factory() as db:
            job = _owned(db, job_id, token)
            if not job:
                return
            _, snap, current = _current(db, job)
            job.status = ("pending" if job.attempts < MAX_ATTEMPTS else "unavailable") if current else "superseded"
            job.available_at = datetime.utcnow() + timedelta(seconds=RETRY_SECONDS)
            if current:
                snap.diagnostic_json = dumps({**loads(snap.diagnostic_json, {}), "analysis_status": job.status})
            else:
                _supersede(job, snap)
            db.commit()


def run_next(factory) -> bool:
    """One claimed job; also used by offline tests and controlled maintenance."""
    claim = _claim(factory)
    if claim:
        _execute(factory, *claim)
    return bool(claim)


def _loop(factory, stop):
    with ThreadPoolExecutor(max_workers=2, thread_name_prefix="source-analysis") as pool:
        active = {}
        while not stop.is_set():
            try:
                active = {claim: future for claim, future in active.items() if not future.done()}
                with factory() as db:
                    for job_id, token in active:
                        db.execute(update(AnalysisJob).where(AnalysisJob.id == job_id, AnalysisJob.worker_token == token,
                                   AnalysisJob.status == "running").values(lease_until=datetime.utcnow() + timedelta(seconds=LEASE_SECONDS)))
                    db.commit()
                while len(active) < 2:
                    claim = _claim(factory)
                    if not claim:
                        break
                    active[claim] = pool.submit(_execute, factory, *claim)
            except Exception:
                logger.warning("Automatic source analysis queue could not be checked")
            stop.wait(5)


def start(factory=None):
    if os.getenv("ANALYSIS_JOBS_ENABLED", "true").lower() == "false":
        return
    if factory is None:
        from app.db import SessionLocal
        factory = SessionLocal
    engine = factory.kw["bind"]
    with _lock:
        if engine in _loops:
            return
        stop = threading.Event()
        _loops[engine] = stop
        threading.Thread(target=_loop, args=(factory, stop), daemon=True, name="source-analysis-queue").start()


def resume_on_startup():
    from app.db import SessionLocal
    with SessionLocal() as db:
        # Backfill the latest source read left pending by the previous implementation.
        # Historical/manual findings are never re-analysed on a restart.
        latest_ids = db.query(PerformanceSnapshot.business_id, func.max(PerformanceSnapshot.id)).group_by(PerformanceSnapshot.business_id).all()
        for _, snap_id in latest_ids:
            snap = db.get(PerformanceSnapshot, snap_id)
            if loads(snap.diagnostic_json, {}).get("analysis_status") == "pending":
                enqueue(db, snap)
    start()


def stop():
    with _lock:
        for event in _loops.values():
            event.set()
        _loops.clear()
