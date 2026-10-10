"""Post images as a background job: one per business, never started by opening a page (#123).

Why this exists. The Posts page called POST /strategy/posts/images every time it opened,
for every post without an image, and that request made the whole month's images inside
one database transaction. Found in the loop run of #111:

* every open of Posts paid for images again, and two tabs paid twice;
* two overlapping runs held SQLite's write lock for minutes and crashed on "database is
  locked";
* a single-post request read the month, spent half a minute on the model, then wrote the
  whole month back, undoing three images a parallel run had just saved.

The rules now:

* **When images are made.** Once, when the server finishes writing a month's posts
  (`after_build`, from services/generation_jobs.py), and when the owner asks for one
  ("ליצור תמונה", "תמונה אחרת": an "owner" item). Pages only read `status`. A post the job
  already tried carries `image_job_at` and is not tried again by itself, so a failed image
  is not paid for on every build; the owner can still ask for it.
* **One job per business.** `ImageJob.business_id` is unique and the row is a lease lock,
  claimed with a compare-and-set on `version` while `status != running` or `lease_until`
  has passed. A second request queues its posts on the running job (a post already
  queued is not queued twice) and gets its status back; it never starts a second worker.
  An owner's request goes before the automatic ones still waiting.
* **The lease.** The worker renews `lease_until` every few seconds, also in the middle of
  an image. A process that died stops renewing it; after LEASE the next request, or the
  API's next start, takes the job over and continues its queue. An image that was being
  made when it died is tried once more, then reported.
* **Short transactions.** An image is made with no write open (reads only), then written
  in one short write that takes the month's row first, reads it as it is now and applies
  only that post's image fields (`merge_image_work`), so an owner's edit or another
  post's image saved meanwhile is never overwritten.

How one post's image is made stays in routers/strategy.py, which registers it (`register`).

Tests set IMAGE_JOBS_INLINE=1 (tests/_test_env.py): the job then runs to the end inside
the request that queued it, on the request's own session. Tests of the threads switch
`INLINE` off themselves.
"""

from __future__ import annotations

import copy
import logging
import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import Callable, Iterator

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.models import Business, ImageJob, Strategy, User
from app.errors import CodedError
from app.services.jsonutil import dumps, loads

log = logging.getLogger(__name__)

# A running job whose lease passed has no live worker behind it.
LEASE = timedelta(seconds=90)
HEARTBEAT_SECONDS = 10.0
# An image whose worker died is tried this many times in all, then reported.
ITEM_ATTEMPTS = 2
# How long a single-post request waits for its own image before answering "queued".
WAIT_SECONDS = 150.0
WAIT_POLL_SECONDS = 0.5
CAS_ATTEMPTS = 50
MAX_WORKERS = 4

INLINE = os.environ.get("IMAGE_JOBS_INLINE", "").strip().lower() in {"1", "true", "yes"}

BUILD = "build"  # after the month's posts were written (or "prepare the missing ones")
OWNER = "owner"  # the owner asked for this post's image
QUEUED, RUNNING, DONE, ERROR = "queued", "running", "done", "error"
OPTION_KEYS = ("force", "preference", "allow_generation", "vibe", "custom_prompt")

ERROR_HE = "לא הצלחנו להכין את התמונה. אפשר לנסות שוב מהפוסט."
STOPPED_HE = "הכנת התמונה נעצרה באמצע. אפשר לנסות שוב מהפוסט."

# (db, business, strategy, posts, index, item) -> the post as the image work left it.
# It works on the `posts` copy it is given and writes nothing; the job writes the post.
Runner = Callable[[Session, Business, Strategy, list, int, dict], dict]
_runner: Runner | None = None

_lock = threading.Lock()
# business_id -> (token, session factory) for every job this process is running.
_active: dict[int, tuple[str, Callable[[], Session]]] = {}
_executor: ThreadPoolExecutor | None = None
_ticker: threading.Thread | None = None


class Superseded(RuntimeError):
    """The job was taken over by another worker (or the business is gone): stop, write nothing."""


def register(runner: Runner) -> None:
    global _runner
    _runner = runner


def _now() -> datetime:
    return datetime.utcnow()


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


# --- which posts, and the queue's items ----------------------------------------------------


def post_uid(strategy: Strategy, index: int, post: dict) -> str:
    from app.services.connected_posts import backfill_uid  # avoids an import cycle

    return str(post.get("uid") or "") or backfill_uid(strategy.business_id, strategy.year, strategy.month, index)


def wants_image(post) -> bool:
    """A post the job prepares by itself: no image yet, its card draws a photograph, the
    owner has not approved or published it as it is, and the job never tried it."""
    from app.services.post_design import post_needs_photo

    if not isinstance(post, dict):
        return False
    if str(post.get("image_url") or "").strip() or post.get("image_job_at"):
        return False
    if post.get("approval_status") == "approved":
        return False
    if str(post.get("published_url") or "").strip() or post.get("published_at"):
        return False
    return post_needs_photo(post)


def make_item(
    strategy: Strategy,
    index: int,
    post: dict,
    *,
    source: str = BUILD,
    force: bool = False,
    preference: str = "auto",
    allow_generation: bool = True,
    vibe: str = "",
    custom_prompt: str = "",
) -> dict:
    return {
        "id": uuid.uuid4().hex[:12],
        "uid": post_uid(strategy, index, post),
        "index": index,
        "strategy_id": strategy.id,
        "source": source,
        "force": bool(force),
        "preference": preference,
        "allow_generation": bool(allow_generation),
        "vibe": vibe,
        "custom_prompt": custom_prompt,
        "state": QUEUED,
        "attempts": 0,
        "action": "",
        "error_he": "",
    }


def build_items(strategy: Strategy) -> list[dict]:
    """An item for every post of the month the job should prepare by itself."""
    posts = ((loads(strategy.roadmap_json, {}) or {}).get("roadmap") or {}).get("posts") or []
    return [make_item(strategy, index, post) for index, post in enumerate(posts) if wants_image(post)]


def _items(row: ImageJob | None) -> list[dict]:
    value = loads(row.items_json, []) if row is not None else []
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _same_post(a: dict, b: dict) -> bool:
    return a.get("uid") == b.get("uid") and a.get("strategy_id") == b.get("strategy_id")


def _merge_queue(current: list[dict], new: list[dict]) -> tuple[list[dict], list[str]]:
    """The queue with `new` added, and the id each new item has in it.

    An automatic item for a post already queued or being made is not added again. An
    owner's item goes before every automatic item still waiting; it replaces a queued
    item for the same post (an owner's keeps its id, so a double click waits on one),
    and joins one being made with the same options."""
    out = [dict(item) for item in current]
    ids: list[str] = []
    for item in new:
        waiting = [i for i in out if _same_post(i, item) and i["state"] in (QUEUED, RUNNING)]
        if item["source"] != OWNER:
            # Not again in this run either when it already failed in it.
            tried = waiting or [i for i in out if _same_post(i, item) and i["state"] == ERROR]
            if tried:
                ids.append(tried[0]["id"])
                continue
            out.append(dict(item))
            ids.append(item["id"])
            continue
        options = {key: item.get(key) for key in OPTION_KEYS}
        mine = next((i for i in waiting if i["source"] == OWNER and i["state"] == QUEUED), None)
        if mine is not None:
            mine.update(options)
            ids.append(mine["id"])
            continue
        running = next((i for i in waiting if i["source"] == OWNER and i["state"] == RUNNING
                        and all(i.get(key) == value for key, value in options.items())), None)
        if running is not None:
            ids.append(running["id"])
            continue
        out = [i for i in out if not (_same_post(i, item) and i["state"] == QUEUED)]
        at = next((n for n, i in enumerate(out) if i["state"] == QUEUED and i["source"] != OWNER), len(out))
        out.insert(at, dict(item))
        ids.append(item["id"])
    return out, ids


def _requeue_dead(items: list[dict]) -> list[dict]:
    """A takeover: the image the dead worker was making is tried again, or reported."""
    out = []
    for item in items:
        item = dict(item)
        if item["state"] == RUNNING:
            if int(item.get("attempts") or 0) >= ITEM_ATTEMPTS:
                item.update(state=ERROR, error_he=STOPPED_HE, finished_at=_iso(_now()))
            else:
                item["state"] = QUEUED
        out.append(item)
    return out


# --- the row: read, compare-and-set ----------------------------------------------------------


def job_for(db: Session, business_id: int) -> ImageJob | None:
    return db.query(ImageJob).filter(ImageJob.business_id == business_id).first()


def _live(row: ImageJob | None) -> bool:
    """A worker is running this job right now (its lease is still being renewed)."""
    return row is not None and row.status == "running" and row.lease_until is not None and row.lease_until >= _now()


def _ensure_row(db: Session, business_id: int) -> None:
    if job_for(db, business_id) is not None:
        return
    now = _now()
    db.add(ImageJob(business_id=business_id, status="idle", token="", version=0, items_json="[]",
                    lease_until=now, started_at=now, updated_at=now))
    try:
        db.commit()
    except IntegrityError:  # another request inserted it between our read and our write
        db.rollback()


def _mutate(db: Session, business_id: int, change: Callable[[ImageJob], tuple[dict | None, object]]):
    """Read the row, let `change` decide the new values, and write them only if nobody
    changed the row in between (`version`); otherwise read again. Returns change's result.
    Every write here is one short UPDATE."""
    for _ in range(CAS_ATTEMPTS):
        db.expire_all()
        row = job_for(db, business_id)
        if row is None:
            _ensure_row(db, business_id)
            continue
        values, result = change(row)
        if values is None:
            return result
        values = {**values, "version": row.version + 1, "updated_at": _now()}
        written = db.execute(
            update(ImageJob)
            .where(ImageJob.business_id == business_id, ImageJob.version == row.version)
            .values(**values)
            .execution_options(synchronize_session=False)
        )
        if written.rowcount == 1:
            db.commit()
            return result
        db.rollback()
        time.sleep(0.01)
    raise RuntimeError("image job: the row kept changing")


# --- public API ------------------------------------------------------------------------------


def queue(db: Session, business: Business, items: list[dict]) -> tuple[dict, list[str]]:
    """Queue these posts' images on the business's job and make sure one worker runs them.

    A running job is joined: its worker picks the new items up, nothing else starts. A job
    whose worker died is taken over. Returns the status and each item's id in the queue.
    The caller commits its own changes first (a conflict rolls the session back)."""
    business_id = business.id
    token = uuid.uuid4().hex

    def change(row: ImageJob):
        current = _items(row)
        if _live(row):
            merged, ids = _merge_queue(current, items)
            return ({"items_json": dumps(merged)} if merged != current else None), (None, ids)
        # Nobody runs it: this request starts a run, or takes over one whose worker died.
        base = _requeue_dead(current) if row.status == "running" else []
        merged, ids = _merge_queue(base, items)
        if not any(item["state"] == QUEUED for item in merged):
            # Nothing to make. A run whose worker died with nothing left is over.
            values = (
                {"items_json": dumps(merged), "status": "done", "finished_at": _now()}
                if row.status == "running"
                else None
            )
            return values, (None, ids)
        now = _now()
        values = {
            "items_json": dumps(merged),
            "status": "running",
            "token": token,
            "lease_until": now + LEASE,
            "error_he": "",
            "finished_at": None,
        }
        if row.status != "running":
            values["started_at"] = now
        return values, (token, ids)

    claimed, ids = _mutate(db, business_id, change)
    if claimed:
        _launch(db, business_id, claimed)
    db.expire_all()
    return status(db, business), ids


def after_build(db: Session, business: Business, strategy: Strategy | None) -> dict | None:
    """The month's posts were just written: prepare their images, once, in the background.
    Nothing when it is switched off, the account may not generate, or no post needs one."""
    from app.config import get_settings
    from app.services import billing

    if strategy is None or not get_settings().image_jobs_on_build:
        return None
    owner = db.get(User, business.user_id)
    if owner is not None and billing.locked(db, owner):
        return None
    items = build_items(strategy)
    if not items:
        return None
    return queue(db, business, items)[0]


def after_month_job(db: Session, business: Business, job) -> None:
    """generation_jobs' `on_done` for the kinds that write posts: the job's month."""
    from app.services import generation_jobs

    after_build(db, business, generation_jobs.target_strategy(db, business, job))


def wait_for(db: Session, business_id: int, item_id: str, timeout: float = WAIT_SECONDS) -> dict | None:
    """The item once it is done or failed; as it is when `timeout` passed or the job
    stopped running; None when it is no longer in the queue."""
    factory = _session_factory_for(db) if not INLINE else (lambda: db)
    deadline = time.monotonic() + timeout
    while True:
        session = factory()
        try:
            session.expire_all()
            row = job_for(session, business_id)
            item = next((i for i in _items(row) if i.get("id") == item_id), None)
            live = _live(row)
        finally:
            if session is not db:
                session.close()
        if item is None or item["state"] in (DONE, ERROR) or not live or time.monotonic() >= deadline:
            return item
        time.sleep(WAIT_POLL_SECONDS)


def status(db: Session, business: Business) -> dict:
    """What a page shows, and all it may do: read. Never starts or resumes anything.

    `status`: "idle" (never ran) | "running" | "stalled" (its worker died; the next
    request or the API's next start continues it) | "done" | "failed". `waiting` lists the
    posts (uids) whose image is on its way."""
    row = job_for(db, business.id)
    items = _items(row)
    live = _live(row)
    state = row.status if row is not None else "idle"
    if state == "running" and not live:
        state = "stalled"
    return {
        "status": state,
        "running": live,
        "total": len(items),
        "done": sum(1 for item in items if item["state"] == DONE),
        "failed": sum(1 for item in items if item["state"] == ERROR),
        "waiting": [item["uid"] for item in items if item["state"] in (QUEUED, RUNNING)],
        "current": next((item["uid"] for item in items if item["state"] == RUNNING), None),
        "items": [
            {key: item.get(key) for key in ("uid", "index", "source", "state", "action", "error_he")}
            for item in items
        ],
        "error_he": (row.error_he or None) if row is not None and state == "failed" else None,
        "started_at": _iso(row.started_at) if row is not None and row.status != "idle" else None,
        "updated_at": _iso(row.updated_at) if row is not None else None,
        "finished_at": _iso(row.finished_at) if row is not None else None,
    }


def resume_stale(session_factory: Callable[[], Session]) -> list[int]:
    """Continue every job whose worker died (API restart). Returns the business ids."""
    resumed: list[int] = []
    db = session_factory()
    try:
        rows = (
            db.query(ImageJob.business_id)
            .filter(ImageJob.status == "running", ImageJob.lease_until < _now())
            .all()
        )
        for (business_id,) in rows:
            business = db.get(Business, business_id)
            if business is None:
                continue
            try:
                if queue(db, business, [])[0]["running"]:
                    resumed.append(business_id)
            except Exception:  # one bad row must not stop the others
                db.rollback()
                log.exception("could not resume the image job of business %s", business_id)
    finally:
        db.close()
    if resumed:
        log.warning("resumed image jobs for businesses %s", resumed)
    return resumed


def resume_on_startup(session_factory: Callable[[], Session] | None = None) -> None:
    """Called when the API starts. A lease still fresh may belong to the process being
    replaced, so everything is checked once more after LEASE."""
    if session_factory is None:
        from app.db import SessionLocal

        session_factory = SessionLocal

    def sweep() -> None:
        try:
            resume_stale(session_factory)
        except Exception:
            log.exception("resuming image jobs failed")

    sweep()
    timer = threading.Timer(LEASE.total_seconds() + 5, sweep)
    timer.daemon = True
    timer.start()


# --- writing one post --------------------------------------------------------------------------


def merge_image_work(before: dict, produced: dict, current: dict) -> dict:
    """Apply what image work changed in one post (`before` → `produced`) onto the post as
    it is now (`current`), keeping whatever the owner changed in the meantime.

    Key by key: a field the image work changed is taken from `produced` unless the owner
    changed that same field meanwhile. A post that got its own photo meanwhile, or is no
    longer the same post, is left as it is now."""
    if before.get("uid") != current.get("uid") or before.get("image_url") != current.get("image_url"):
        return current
    merged = dict(current)
    for key in set(before) | set(produced):
        if (key in before) == (key in produced) and before.get(key) == produced.get(key):
            continue
        if (key in current) != (key in before) or current.get(key) != before.get(key):
            continue
        if key in produced:
            merged[key] = produced[key]
        else:
            merged.pop(key, None)
    return merged


def owner_changes(before: dict, after: dict, current: dict) -> dict:
    """An owner's own action on one post (`before` → `after`) onto the post as it is now:
    every field the action changed is theirs; every other field stays as it is now."""
    merged = dict(current)
    for key in set(before) | set(after):
        if (key in before) == (key in after) and before.get(key) == after.get(key):
            continue
        if key in after:
            merged[key] = after[key]
        else:
            merged.pop(key, None)
    return merged


def save_post(db: Session, strategy: Strategy, index: int, before: dict, after: dict,
              merge: Callable[[dict, dict, dict], dict] = owner_changes) -> dict:
    """Write one post of the month in one short write, and never the others.

    The month's row is taken first (a no-op UPDATE starts the write), then read as it is
    now: nobody can write it between that read and this commit, and whatever another
    request or the image job saved meanwhile stays. Commits (with anything else pending
    on the session, such as image usage rows). Returns the post as stored."""
    table = Strategy.__table__
    db.execute(update(table).where(table.c.id == strategy.id).values(id=table.c.id))
    db.refresh(strategy)
    extra = loads(strategy.roadmap_json, {}) or {}
    roadmap = dict(extra.get("roadmap") or {})
    posts = list(roadmap.get("posts") or [])
    if not (0 <= index < len(posts)) or not isinstance(posts[index], dict):
        db.commit()
        return after
    posts[index] = merge(before, after, posts[index])
    extra["roadmap"] = {**roadmap, "posts": posts}
    strategy.roadmap_json = dumps(extra)
    db.commit()
    return posts[index]


# --- the worker --------------------------------------------------------------------------------


def _session_factory_for(db: Session) -> Callable[[], Session]:
    """New sessions on the same database as `db` (the app's, or a test's override)."""
    return sessionmaker(bind=db.get_bind(), autoflush=False, autocommit=False)


def _pool() -> ThreadPoolExecutor:
    global _executor
    with _lock:
        if _executor is None:
            _executor = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix="image-job")
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


def _work(business_id: int, token: str, factory: Callable[[], Session]) -> None:
    try:
        _note_stopped(factory, business_id, token)
        while True:
            item = _next_item(factory, business_id, token)
            if item is None:
                break
            _run_item(factory, business_id, token, item)
    except Superseded:
        pass
    except Exception:  # never let a worker die without saying so on the row
        log.exception("image job for business %s crashed", business_id)
        try:
            with _session(factory) as db:
                _finish_failed(db, business_id, token)
        except Exception:
            log.exception("could not record the crash of the image job of business %s", business_id)
    finally:
        with _lock:
            if _active.get(business_id, ("",))[0] == token:
                _active.pop(business_id, None)


def _note_stopped(factory: Callable[[], Session], business_id: int, token: str) -> None:
    """A takeover reported an image that died twice: its post is marked as tried, so the
    job does not start it again by itself."""
    with _session(factory) as db:
        stopped = [item for item in _items(job_for(db, business_id))
                   if item["state"] == ERROR and item.get("error_he") == STOPPED_HE and not item.get("noted")]
        if not stopped:
            return
        for item in stopped:
            _note_tried(db, item)
        ids = {item["id"] for item in stopped}

        def change(row: ImageJob):
            if row.token != token:
                raise Superseded("the image job was taken over")
            items = _items(row)
            for item in items:
                if item.get("id") in ids:
                    item["noted"] = True
            return {"items_json": dumps(items)}, None

        _mutate(db, business_id, change)


def _next_item(factory: Callable[[], Session], business_id: int, token: str) -> dict | None:
    """Take the next queued item (it becomes "running"), or end the run when none is left.
    Ending only succeeds if nothing was queued since the queue was read (`version`)."""

    def change(row: ImageJob):
        if row.token != token or row.status != "running":
            raise Superseded("the image job was taken over")
        items = _items(row)
        for item in items:
            if item["state"] == QUEUED:
                item["state"] = RUNNING
                item["attempts"] = int(item.get("attempts") or 0) + 1
                return {"items_json": dumps(items), "lease_until": _now() + LEASE}, dict(item)
        return {"status": "done", "finished_at": _now(), "lease_until": _now()}, None

    with _session(factory) as db:
        return _mutate(db, business_id, change)


def _run_item(factory: Callable[[], Session], business_id: int, token: str, item: dict) -> None:
    with _session(factory) as db:
        try:
            outcome = _make_and_write(db, business_id, token, item)
        except Superseded:
            raise
        except Exception as exc:
            log.warning("image job %s: post %s failed: %s", business_id, item.get("uid"), exc)
            outcome = {"state": ERROR, "action": "", "error_he": _error_he(exc)}
            if isinstance(exc, CodedError):
                outcome.update(error_code=exc.code, error_status=exc.status_code)
            _note_tried(db, item)

    def change(row: ImageJob):
        if row.token != token:
            raise Superseded("the image job was taken over")
        items = _items(row)
        for entry in items:
            if entry.get("id") == item["id"]:
                entry.update(outcome, finished_at=_iso(_now()))
        return {"items_json": dumps(items), "lease_until": _now() + LEASE}, None

    with _session(factory) as db:
        _mutate(db, business_id, change)


def _locate(strategy: Strategy, posts: list, item: dict) -> int | None:
    """Where the item's post is now (posts are appended, never reordered)."""
    index = int(item.get("index") or 0)
    if 0 <= index < len(posts) and isinstance(posts[index], dict) and post_uid(strategy, index, posts[index]) == item["uid"]:
        return index
    for n, post in enumerate(posts):
        if isinstance(post, dict) and post_uid(strategy, n, post) == item["uid"]:
            return n
    return None


def _make_and_write(db: Session, business_id: int, token: str, item: dict) -> dict:
    business = db.get(Business, business_id)
    if business is None:
        raise Superseded("the business is gone")
    strategy = db.get(Strategy, int(item.get("strategy_id") or 0))
    if strategy is None or strategy.business_id != business_id:
        return {"state": ERROR, "action": "", "error_he": "החודש של הפוסט הזה לא נמצא."}
    posts = list(((loads(strategy.roadmap_json, {}) or {}).get("roadmap") or {}).get("posts") or [])
    index = _locate(strategy, posts, item)
    if index is None:
        return {"state": ERROR, "action": "", "error_he": "הפוסט לא נמצא בתוכנית."}
    if item["source"] != OWNER and not wants_image(posts[index]):
        # It got an image (the owner's own photo) or was approved while it waited.
        return {"state": DONE, "action": "kept_existing", "error_he": ""}
    if _runner is None:
        raise RuntimeError("no image runner registered")
    before = copy.deepcopy(posts[index])
    # The image itself: model calls and files, with no write open.
    produced = dict(_runner(db, business, strategy, copy.deepcopy(posts), index, item))
    produced["image_job_at"] = _iso(_now())
    _check_token(db, business_id, token)
    save_post(db, strategy, index, before, produced, merge=merge_image_work)
    return {"state": DONE, "action": str(produced.get("image_action") or ""), "error_he": ""}


def _check_token(db: Session, business_id: int, token: str) -> None:
    row = db.query(ImageJob.token).filter(ImageJob.business_id == business_id).first()
    if row is None or row[0] != token:
        raise Superseded("the image job was taken over")


def _note_tried(db: Session, item: dict) -> None:
    """A failed image: keep the attempts' usage rows, and mark the post as tried so the
    job does not pay for it again by itself."""
    strategy = None
    try:
        strategy = db.get(Strategy, int(item.get("strategy_id") or 0))
        if strategy is None:
            db.commit()
            return
        posts = list(((loads(strategy.roadmap_json, {}) or {}).get("roadmap") or {}).get("posts") or [])
        index = _locate(strategy, posts, item)
        if index is None:
            db.commit()
            return
        before = posts[index]
        save_post(db, strategy, index, before, {**before, "image_job_at": _iso(_now())}, merge=merge_image_work)
    except Exception:
        db.rollback()
        log.exception("image job: could not note a failed image of business %s", strategy.business_id if strategy else "?")


def _error_he(exc: BaseException) -> str:
    if isinstance(exc, HTTPException) and isinstance(exc.detail, str) and exc.detail.strip():
        return exc.detail
    from app.services.image_routing import ImageRoutingError

    if isinstance(exc, ImageRoutingError) and str(exc).strip():
        return str(exc)
    return ERROR_HE


def _finish_failed(db: Session, business_id: int, token: str) -> None:
    def change(row: ImageJob):
        if row.token != token:
            return None, None
        items = _requeue_dead(_items(row))
        for item in items:
            if item["state"] == QUEUED:
                item.update(state=ERROR, error_he=ERROR_HE)
        return {"items_json": dumps(items), "status": "failed", "error_he": ERROR_HE, "finished_at": _now(),
                "lease_until": _now()}, None

    _mutate(db, business_id, change)


# --- the lease ---------------------------------------------------------------------------------


def _ensure_ticker() -> None:
    global _ticker
    with _lock:
        if _ticker is not None and _ticker.is_alive():
            return
        _ticker = threading.Thread(target=_tick_forever, name="image-job-lease", daemon=True)
        _ticker.start()


def _tick_forever() -> None:
    while True:
        time.sleep(HEARTBEAT_SECONDS)
        beat()


def beat() -> None:
    """Renew the lease of every job this process is running (no `version` change: renewing
    never conflicts with a request queueing more posts)."""
    with _lock:
        running = list(_active.items())
    for business_id, (token, factory) in running:
        try:
            with _session(factory) as db:
                db.execute(
                    update(ImageJob)
                    .where(ImageJob.business_id == business_id, ImageJob.token == token, ImageJob.status == "running")
                    .values(lease_until=_now() + LEASE)
                    .execution_options(synchronize_session=False)
                )
                db.commit()
        except Exception:
            log.warning("image job lease for business %s failed", business_id, exc_info=True)
