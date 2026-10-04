"""Month generation as a background job: one per business, resumable, never tied to a tab.

Why this exists (onboarding-v2.md, Revision 7 A). The month used to be built by the
browser: `generateUntilDone` in web/lib/api.ts called `POST /onboarding/generate` once
per stage, up to ten times, and the whole build lived and died with that tab. The last
stage (weeks 3–4 posts, on Muse Spark) takes about 80 s; a tab that stopped driving it
left the business with a plan, no month and `onboarding_complete=0`, silently.

Now a POST starts (or joins) a job and returns at once; a worker thread runs the stages,
and each stage persists as before. The page only polls `status()`
(GET /onboarding/generate/status).

What is built (`kind`), per Revision 8 ("foundations before posts"):

* "first_month" (/onboarding/generate): the month's structure only — USP, weeks, focus,
  content mix, budget lines, KPI. Its weeks' posts stay "pending".
* "posts" (/onboarding/posts/start): the posts of the weeks the owner asked for, one week
  per stage, once they have chosen what to feature (services/month_posts.py).
* "next_month" (/strategy/next-month): a later month, posts included, as before.

The rules:

* **One job per business.** `GenerationJob.business_id` is unique and a job is claimed
  with a compare-and-set (`status != running` or its heartbeat is stale), so a double
  click, a second tab or a second API process joins the running job instead of starting
  another writer. Inside one process `_active` says the same without a query.
* **Heartbeat.** A ticker thread refreshes `heartbeat_at` for every job this process is
  running, also in the middle of an 80-second stage. A running job whose heartbeat went
  quiet for `STALE_AFTER` belongs to a process that is gone.
* **Resume.** On API startup (and on any status poll) a running job with a stale heartbeat
  is claimed again and continues from the saved stage. So does a first month that stopped
  mid-way before this module existed (a saved stage, no job row).
* **One retry per stage.** A stage that raises, or returns without moving on, is run once
  more; the second failure stops the job with a Hebrew `error_he` the page shows next to
  "לנסות שוב". Asking again resumes from the stage that failed. Never a silent loop.

The routers register how each kind runs one stage (`register`), so this module owns the
job and they keep owning the month.

Tests set GENERATION_JOBS_INLINE=1 (tests/_test_env.py): the job then runs to the end
inside the request that started it, on the request's own session, so `mock.patch`
blocks and dependency-overridden databases still apply. Tests of the threads switch
`INLINE` off themselves.
"""

from __future__ import annotations

import logging
import os
import re
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Callable, Iterator

from sqlalchemy import or_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.models import Business, GenerationJob, Strategy
from app.services import month_posts
from app.services.calendar_il import gregorian_month_meta
from app.services.jsonutil import loads

log = logging.getLogger(__name__)

FIRST_MONTH = "first_month"
NEXT_MONTH = "next_month"
POSTS = "posts"

# A running job whose heartbeat is older than this has no live process behind it.
STALE_AFTER = timedelta(seconds=90)
HEARTBEAT_SECONDS = 10.0
# A stage that has not finished for this long is stuck (a call with no timeout, a hung
# socket) even though its process still heartbeats; the owner may retry it.
STAGE_STUCK_AFTER = timedelta(minutes=15)
# Legacy mid-way first months (saved stage, no job row) older than this are not resumed
# by themselves; the owner restarts them from the page.
LEGACY_RESUME_WITHIN = timedelta(days=7)
STAGE_ATTEMPTS = 2
RETRY_DELAY_SECONDS = 5.0
MAX_WORKERS = 4

INLINE = os.environ.get("GENERATION_JOBS_INLINE", "").strip().lower() in {"1", "true", "yes"}

STAGE_LABELS_HE = {
    "usp": "מנסחים מה מייחד אתכם",
    "plan": "מתכננים את השבועות",
    "posts": "כותבים את הפוסטים לשבועות 1–2",
    "posts_late": "כותבים את הפוסטים לשבועות 3–4",
    "done": "החודש מוכן",
}
# Next month opens by reading the month that ran, not by "what makes you special".
NEXT_MONTH_LABELS_HE = {**STAGE_LABELS_HE, "usp": "לומדים מהחודש שעבר"}
STAGE_ORDER = {
    # The first month stops at its structure; its posts are their own job (POSTS).
    FIRST_MONTH: ("usp", "plan"),
    NEXT_MONTH: ("usp", "plan", "posts", "posts_late"),
}

# One stage for this business on this session; True when the job has nothing left to do.
StageRunner = Callable[[Session, Business], bool]
# What "moved on" means for a kind: a value that changes when a stage succeeds.
Marker = Callable[[Session, Business, GenerationJob], str]


@dataclass
class _Kind:
    run: StageRunner
    marker: Marker
    # The job stopped (a stage failed twice): tidy what the kind keeps outside the job row.
    on_fail: Callable[[Session, Business, GenerationJob], None] | None = None
    # The job finished: what follows it (the posts' images, services/image_jobs.py).
    on_done: Callable[[Session, Business, GenerationJob], None] | None = None


_kinds: dict[str, _Kind] = {}

_lock = threading.Lock()
# business_id -> (token, session factory) for every job this process is running.
_active: dict[int, tuple[str, Callable[[], Session]]] = {}
_executor: ThreadPoolExecutor | None = None
_ticker: threading.Thread | None = None


class Superseded(RuntimeError):
    """The job was claimed by someone else (or the business is gone): stop, write nothing."""


class NoProgress(RuntimeError):
    pass


def stage_of(business: Business) -> str:
    return str((loads(business.generate_state_json, {}) or {}).get("stage") or "")


def _stage_marker(db: Session, business: Business, job: GenerationJob) -> str:
    return stage_of(business)


def register(
    kind: str,
    runner: StageRunner,
    *,
    marker: Marker | None = None,
    on_fail: Callable[[Session, Business, GenerationJob], None] | None = None,
    on_done: Callable[[Session, Business, GenerationJob], None] | None = None,
) -> None:
    _kinds[kind] = _Kind(run=runner, marker=marker or _stage_marker, on_fail=on_fail, on_done=on_done)


def _now() -> datetime:
    return datetime.utcnow()


def _stage_key(stage: str) -> str:
    return "usp" if stage in {"", "scan"} else stage


def job_for(db: Session, business_id: int) -> GenerationJob | None:
    return db.query(GenerationJob).filter(GenerationJob.business_id == business_id).first()


# --- claiming ----------------------------------------------------------------------------


def _claimable():
    now = _now()
    return or_(
        GenerationJob.status != "running",
        GenerationJob.heartbeat_at < now - STALE_AFTER,
        GenerationJob.updated_at < now - STAGE_STUCK_AFTER,
    )


def _claim(db: Session, business_id: int, kind: str, year: int, month: int, *, fresh: bool) -> str | None:
    """Take the business's job row for a new worker. Returns its token, or None when a
    live worker already has it. `fresh` restarts the clock (a new build or a retry);
    otherwise it is a takeover of a job whose process died, which keeps its start time."""
    token = uuid.uuid4().hex
    now = _now()
    if job_for(db, business_id) is None:
        db.add(
            GenerationJob(
                business_id=business_id,
                kind=kind,
                status="running",
                token=token,
                year=year,
                month=month,
                started_at=now,
                updated_at=now,
                heartbeat_at=now,
            )
        )
        try:
            db.commit()
            return token
        except IntegrityError:  # someone inserted it between our read and our write
            db.rollback()
    values = {
        "kind": kind,
        "status": "running",
        "token": token,
        "year": year,
        "month": month,
        "heartbeat_at": now,
        "updated_at": now,
        "error_he": "",
        "error_detail": "",
        "finished_at": None,
    }
    if fresh:
        values["started_at"] = now
    result = db.execute(
        update(GenerationJob)
        .where(GenerationJob.business_id == business_id, _claimable())
        .values(**values)
        .execution_options(synchronize_session=False)
    )
    db.commit()
    return token if result.rowcount == 1 else None


def _running_here(business_id: int) -> bool:
    with _lock:
        return business_id in _active


def _session_factory_for(db: Session) -> Callable[[], Session]:
    """New sessions on the same database as `db` (the app's, or a test's override)."""
    return sessionmaker(bind=db.get_bind(), autoflush=False, autocommit=False)


# --- public API ----------------------------------------------------------------------------


def busy(db: Session, business: Business) -> GenerationJob | None:
    """The job running for this business right now (any kind), or None."""
    job = job_for(db, business.id)
    if job is not None and job.status == "running" and not _is_stuck(job):
        if _running_here(business.id) or job.heartbeat_at >= _now() - STALE_AFTER:
            return job
    return None


def start(db: Session, business: Business, kind: str, year: int, month: int) -> dict:
    """Start or join the business's job and return its status at once.

    A running job (any kind) is joined, not restarted: its status comes back and nothing
    new runs. Otherwise the job is claimed and handed to a worker, and resumes from what
    the kind saved (the caller decides whether that applies).
    """
    if kind not in _kinds:
        raise RuntimeError(f"unknown generation kind {kind!r}")
    business_id = business.id
    job = job_for(db, business_id)
    if not _running_here(business_id) or (job is not None and _is_stuck(job)):
        token = _claim(db, business_id, kind, year, month, fresh=True)
        if token:
            _launch(db, business_id, token)
    db.expire_all()
    return status(db, business)


def status(db: Session, business: Business, *, kick: bool = True) -> dict:
    """What the page shows: `{stage, stage_label_he, label_he, started_at, updated_at,
    error_he, done, running, posts, ...}`. With `kick`, a job whose process died is
    resumed here, so a poll after a restart is enough to continue."""
    job = job_for(db, business.id)
    if kick and job is not None and job.status == "running" and not _running_here(business.id):
        if job.heartbeat_at < _now() - STALE_AFTER:
            resume(db, business.id)
            db.expire_all()
            job = job_for(db, business.id)
    return _status_payload(db, business, job)


def resume(db: Session, business_id: int) -> bool:
    """Take over a stale running job (or a legacy mid-way first month) and continue it."""
    if _running_here(business_id):
        return False
    job = job_for(db, business_id)
    if job is None:
        business = db.get(Business, business_id)
        if business is None:
            return False
        state = loads(business.generate_state_json, {}) or {}
        kind = FIRST_MONTH if not business.onboarding_complete else NEXT_MONTH
        token = _claim(db, business_id, kind, int(state.get("year") or 0), int(state.get("month") or 0), fresh=True)
    else:
        token = _claim(db, business_id, job.kind, job.year, job.month, fresh=False)
    if not token:
        return False
    _launch(db, business_id, token)
    return True


def resume_stale(session_factory: Callable[[], Session]) -> list[int]:
    """Continue every job left running by a process that is gone. Returns the business ids.

    Also picks up a first month that stopped mid-way before jobs existed (a saved stage,
    onboarding not complete, no job row) when it was touched within LEGACY_RESUME_WITHIN.
    A next month left mid-way that way waits for the owner: it costs model calls, and
    they may have moved on.
    """
    resumed: list[int] = []
    db = session_factory()
    try:
        now = _now()
        stale = (
            db.query(GenerationJob.business_id)
            .filter(GenerationJob.status == "running", GenerationJob.heartbeat_at < now - STALE_AFTER)
            .all()
        )
        candidates = [row[0] for row in stale]
        with_job = {row[0] for row in db.query(GenerationJob.business_id).all()}
        legacy = (
            db.query(Business)
            .filter(
                Business.onboarding_complete == 0,
                Business.generate_state_json != "",
                Business.updated_at > now - LEGACY_RESUME_WITHIN,
                Business.updated_at < now - STALE_AFTER,
            )
            .all()
        )
        for business in legacy:
            if business.id in with_job:
                continue
            if stage_of(business) not in {"", "scan", "done"}:
                candidates.append(business.id)
        for business_id in candidates:
            try:
                if resume(db, business_id):
                    resumed.append(business_id)
            except Exception:  # one bad row must not stop the others from resuming
                db.rollback()
                log.exception("could not resume the month job of business %s", business_id)
    finally:
        db.close()
    if resumed:
        log.warning("resumed month generation for businesses %s", resumed)
    return resumed


def resume_on_startup(session_factory: Callable[[], Session] | None = None) -> None:
    """Called when the API starts. Stale jobs resume now; a job whose heartbeat is still
    fresh may belong to the process being replaced (uvicorn --reload waits for it), so
    everything is checked once more after STALE_AFTER."""
    if session_factory is None:
        from app.db import SessionLocal

        session_factory = SessionLocal

    def sweep() -> None:
        try:
            resume_stale(session_factory)
        except Exception:
            log.exception("resuming month generation failed")

    sweep()
    timer = threading.Timer(STALE_AFTER.total_seconds() + 5, sweep)
    timer.daemon = True
    timer.start()


# --- the worker ----------------------------------------------------------------------------


def _pool() -> ThreadPoolExecutor:
    global _executor
    with _lock:
        if _executor is None:
            _executor = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix="month-job")
        return _executor


def _launch(db: Session, business_id: int, token: str) -> None:
    if INLINE:
        factory = _inline_factory(db)
        with _lock:
            _active[business_id] = (token, factory)
        _work(business_id, token, factory)
        return
    factory = _session_factory_for(db)
    with _lock:
        _active[business_id] = (token, factory)
    _ensure_ticker()
    _pool().submit(_work, business_id, token, factory)


def _inline_factory(db: Session) -> Callable[[], Session]:
    """The request's own session, closed by the request and never by the worker."""

    class _Borrowed:
        def __init__(self, session: Session) -> None:
            self._session = session

        def __getattr__(self, name):
            return getattr(self._session, name)

        def close(self) -> None:
            self._session.expire_all()

    return lambda: _Borrowed(db)  # type: ignore[return-value]


@contextmanager
def _session(factory: Callable[[], Session]) -> Iterator[Session]:
    db = factory()
    try:
        yield db
    finally:
        db.close()


def _job_row(db: Session, business_id: int, token: str) -> GenerationJob:
    db.expire_all()
    job = job_for(db, business_id)
    if job is None or job.token != token:
        raise Superseded("the job was taken over")
    return job


def _work(business_id: int, token: str, factory: Callable[[], Session]) -> None:
    try:
        while True:
            outcome = _run_stage_with_retry(business_id, token, factory)
            if outcome != "progress":
                break
    except Superseded:
        pass
    except Exception:  # never let a worker die without saying why on the row
        log.exception("month job for business %s crashed", business_id)
        try:
            with _session(factory) as db:
                _fail(db, business_id, token, RuntimeError("שגיאה פנימית"))
        except Exception:
            log.exception("could not record the crash of business %s", business_id)
    finally:
        with _lock:
            if _active.get(business_id, ("",))[0] == token:
                _active.pop(business_id, None)


def _run_stage_with_retry(business_id: int, token: str, factory: Callable[[], Session]) -> str:
    """Run the next stage, once more if it fails. "progress" | "done" | "failed"."""
    last_error: Exception | None = None
    for attempt in range(STAGE_ATTEMPTS):
        if attempt and not INLINE:
            time.sleep(RETRY_DELAY_SECONDS)
        with _session(factory) as db:
            job = _job_row(db, business_id, token)
            business = db.get(Business, business_id)
            if business is None:
                raise Superseded("the business is gone")
            kind = _kinds[job.kind]
            before = kind.marker(db, business, job)
            try:
                done = kind.run(db, business)
            except Superseded:
                raise
            except Exception as exc:
                db.rollback()
                last_error = exc
                log.warning("month job %s (%s) attempt %s failed: %s", business_id, job.kind, attempt + 1, exc)
                continue
            job = _job_row(db, business_id, token)
            now = _now()
            if done:
                job.status = "done"
                job.finished_at = now
                job.updated_at = now
                job.error_he = ""
                job.error_detail = ""
                db.commit()
                _after_done(db, business, job, kind)
                return "done"
            if kind.marker(db, business, job) == before:
                last_error = NoProgress(f"{job.kind} stage returned without moving on")
                log.warning("month job %s: %s", business_id, last_error)
                continue
            job.updated_at = now
            db.commit()
            return "progress"
    with _session(factory) as db:
        _fail(db, business_id, token, last_error or RuntimeError(""))
    return "failed"


def _after_done(db: Session, business: Business, job: GenerationJob, kind: _Kind) -> None:
    """What follows a finished job (the month's images). Never turns it into a failure."""
    if kind.on_done is None:
        return
    try:
        kind.on_done(db, business, job)
    except Exception:
        db.rollback()
        log.exception("what follows the %s job of business %s failed", job.kind, business.id)


def _fail(db: Session, business_id: int, token: str, exc: Exception) -> None:
    job = _job_row(db, business_id, token)
    business = db.get(Business, business_id)
    label = _describe(db, business, job)["stage_label_he"] if business is not None else ""
    now = _now()
    job.status = "failed"
    job.finished_at = now
    job.updated_at = now
    job.error_he = error_he(label, exc)
    job.error_detail = f"{type(exc).__name__}: {exc}"[:2000]
    hook = _kinds.get(job.kind)
    if hook and hook.on_fail and business is not None:
        try:
            hook.on_fail(db, business, job)
        except Exception:
            log.exception("on_fail for business %s failed", business_id)
    db.commit()


_HEBREW = re.compile(r"[֐-׿]")


def error_he(stage_label: str, exc: BaseException | None) -> str:
    """One Hebrew sentence for the owner: where it stopped, why when we know, what to do."""
    from app.services.gemini import is_provider_unavailable

    head = f"הבנייה נעצרה בשלב „{stage_label or STAGE_LABELS_HE['usp']}”."
    tail = "לחצו „לנסות שוב” ונמשיך מאותו שלב."
    if is_provider_unavailable(exc):
        return f"{head} שירות ה-AI לא זמין כרגע. {tail}"
    detail = str(exc or "").strip()
    # A Hebrew message is ours (the stage machine's own checks); an English one is a
    # provider's or a library's, and is kept in error_detail rather than shown.
    if detail and _HEBREW.search(detail) and len(detail) <= 240 and "Meta Model API" not in detail:
        return f"{head} {detail} {tail}"
    return f"{head} {tail}"


# --- heartbeat -----------------------------------------------------------------------------


def _ensure_ticker() -> None:
    global _ticker
    with _lock:
        if _ticker is not None and _ticker.is_alive():
            return
        _ticker = threading.Thread(target=_tick_forever, name="month-job-heartbeat", daemon=True)
        _ticker.start()


def _tick_forever() -> None:
    while True:
        time.sleep(HEARTBEAT_SECONDS)
        beat()


def beat() -> None:
    """Refresh the heartbeat of every job this process is running."""
    with _lock:
        running = list(_active.items())
    for business_id, (token, factory) in running:
        try:
            with _session(factory) as db:
                db.execute(
                    update(GenerationJob)
                    .where(GenerationJob.business_id == business_id, GenerationJob.token == token)
                    .values(heartbeat_at=_now())
                    .execution_options(synchronize_session=False)
                )
                db.commit()
        except Exception:
            log.warning("heartbeat for business %s failed", business_id, exc_info=True)


# --- status --------------------------------------------------------------------------------


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _is_stuck(job: GenerationJob) -> bool:
    return job.status == "running" and job.updated_at < _now() - STAGE_STUCK_AFTER


def target_strategy(db: Session, business: Business, job: GenerationJob | None = None) -> Strategy | None:
    """The month a status talks about: the job's month when it has one, else the newest."""
    query = db.query(Strategy).filter(Strategy.business_id == business.id)
    if job is not None and job.year and job.month:
        exact = query.filter(Strategy.year == job.year, Strategy.month == job.month).first()
        if exact is not None or job.kind != NEXT_MONTH:
            return exact
    return query.order_by(Strategy.year.desc(), Strategy.month.desc()).first()


def _describe(db: Session, business: Business, job: GenerationJob | None) -> dict:
    """stage / labels / progress for the kind the job is building."""
    state = loads(business.generate_state_json, {}) or {}
    kind = job.kind if job else (FIRST_MONTH if not business.onboarding_complete else NEXT_MONTH)
    if kind == POSTS:
        strategy = target_strategy(db, business, job)
        week = month_posts.next_queued(strategy) if strategy is not None else None
        status = month_posts.posts_status(strategy)
        if week is None:  # nothing queued: the job is done, or it stopped on a week
            failed = [int(w) for w, value in status.items() if value == "error"]
            week = failed[0] if failed else None
        done_weeks = sum(1 for value in status.values() if value == "done")
        return {
            "kind": kind,
            "stage": f"posts_w{week}" if week else "done",
            "stage_label_he": f"כותבים את הפוסטים לשבוע {week}" if week else "הפוסטים מוכנים",
            "stage_index": done_weeks,
            "stage_count": len(month_posts.WEEKS),
            "year": job.year if job else 0,
            "month": job.month if job else 0,
        }
    stage = _stage_key(str(state.get("stage") or ""))
    order = STAGE_ORDER.get(kind, STAGE_ORDER[NEXT_MONTH])
    labels = NEXT_MONTH_LABELS_HE if kind == NEXT_MONTH else STAGE_LABELS_HE
    running = job is not None and job.status == "running"
    if not state.get("stage") and not running and (job is None or job.status == "done"):
        if kind == NEXT_MONTH or business.onboarding_complete:
            stage = "done"
    if kind == FIRST_MONTH and stage in {"posts", "posts_late"}:
        stage = "plan"  # its plan stages are done; only storing the structure is left
    index = order.index(stage) if stage in order else (len(order) if stage == "done" else 0)
    return {
        "kind": kind,
        "stage": stage,
        "stage_label_he": labels.get(stage, labels["usp"]),
        "stage_index": index,
        "stage_count": len(order),
        "year": int(state.get("year") or (job.year if job else 0) or 0),
        "month": int(state.get("month") or (job.month if job else 0) or 0),
    }


def _status_payload(db: Session, business: Business, job: GenerationJob | None) -> dict:
    described = _describe(db, business, job)
    kind = described["kind"]
    job_status = job.status if job else "idle"
    stuck_error = ""
    if job is not None and _is_stuck(job):
        # Still "running" on the row, but no stage has finished for a quarter of an hour:
        # say so and let the owner retry (start() takes a stuck job over).
        job_status = "failed"
        stuck_error = error_he(described["stage_label_he"], None).replace("נעצרה", "נתקעה", 1)
    running = job_status == "running"
    key = described["stage"]
    year, month = described["year"], described["month"]
    month_name = gregorian_month_meta(year, month)["month_name_he"] if year and 1 <= month <= 12 else ""
    stage_label = described["stage_label_he"]
    if key == "done":
        label = stage_label if kind == POSTS else (f"{month_name} מוכן" if month_name else "החודש מוכן")
    elif month_name:
        label = f"בונים את {month_name}: {stage_label}…"
    else:
        label = f"בונים את החודש: {stage_label}…"
    strategy = target_strategy(db, business, job)
    posts = month_posts.posts_status(strategy) if strategy is not None else None
    if posts and not (running and kind == POSTS):
        # A week marked "running" with no posts job behind it is not being written.
        posts = {week: ("pending" if value == "running" else value) for week, value in posts.items()}
    done = job_status == "done" or (job is None and key == "done")
    return {
        "kind": kind,
        # "idle" (no job yet) | "running" | "failed" | "done".
        "status": job_status,
        "running": running,
        "done": done,
        "stage": key,
        "stage_label_he": stage_label,
        "label_he": label,
        "stage_index": described["stage_index"],
        "stage_count": described["stage_count"],
        "year": year or None,
        "month": month or None,
        "month_name_he": month_name,
        "started_at": _iso(job.started_at) if job else None,
        "updated_at": _iso(job.updated_at) if job else None,
        "error_he": (stuck_error or job.error_he or None) if job and job_status == "failed" else None,
        # A saved stage with nothing running: starting again continues from it.
        "resumable": not running and key != "done" and (bool(stage_of(business)) or job_status == "failed"),
        # Per week of that month: "pending" | "running" | "done" | "error" (Revision 8).
        "posts": posts,
    }
