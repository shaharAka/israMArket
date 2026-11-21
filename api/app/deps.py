import logging
import re
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, Request
from sqlalchemy import case, update
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import CodedError, account_suspended
from app.models import Business, User
from app.security import COOKIE_NAME, decode_access_claims
from app.services import model_usage

log = logging.getLogger(__name__)

# `users.last_seen_at` (the backoffice's "last active") is written at most this often per
# user: one UPDATE an hour, and no extra query on any other request.
LAST_SEEN_EVERY = timedelta(hours=1)


def session_token(request: Request) -> str:
    """The session token from the cookie, else an `Authorization: Bearer` header, else ""."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth.removeprefix("Bearer ").strip()
    return token or ""


def _touch_last_seen(db: Session, user: User) -> None:
    now = datetime.utcnow()
    if user.last_seen_at is not None and now - user.last_seen_at < LAST_SEEN_EVERY:
        return
    try:
        db.execute(update(User).where(User.id == user.id).values(last_seen_at=now))
        db.commit()
    except Exception:
        # A busy database must never fail the request; the next one tries again.
        db.rollback()
        log.debug("last_seen_at not written for user %s", user.id, exc_info=True)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = session_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="צריך להתחבר")
    claims = decode_access_claims(token)
    if claims is None:
        raise HTTPException(status_code=401, detail="עבר הרבה זמן מאז שהתחברתם. התחברו שוב.")
    user_id, epoch = claims
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="לא מצאנו את החשבון")
    if user.suspended_at is not None:
        # Before the epoch check: suspending also signs every session out, and a person
        # holding an old session should read why, not just "sign in again".
        raise account_suspended()
    if epoch != (user.session_epoch or 0):
        # Signed out by a password change, a reset link, a Google takeover, or the
        # backoffice (models.User.session_epoch).
        raise HTTPException(status_code=401, detail="צריך להתחבר שוב")
    scope = request.headers.get("X-Workspace-Id")
    if scope is not None and not re.fullmatch(r"[1-9][0-9]{0,15}", scope):
        raise HTTPException(status_code=400, detail="מרחב העבודה לא תקין")
    user._request_workspace_id = int(scope) if scope is not None else None
    _touch_last_seen(db, user)
    model_usage.note_user(user.id, db.get_bind())
    return user


def default_business(db: Session, user: User) -> Business | None:
    """Keep the pre-existing default when another workspace is added."""
    return db.query(Business).filter(Business.user_id == user.id).order_by(
        Business.workspace_key.is_not(None),
        case((Business.workspace_key.is_(None), -Business.id), else_=Business.id),
    ).first()


def selected_business(db: Session, user: User) -> Business | None:
    workspace_id = vars(user).get("_request_workspace_id")
    if workspace_id is None:
        business = default_business(db, user)
    else:
        business = db.query(Business).filter(Business.id == workspace_id, Business.user_id == user.id).one_or_none()
        if business is None:
            raise CodedError(404, "workspace_not_found", "מרחב העבודה לא נמצא")
    if business:
        model_usage.note_business(business.id, db.get_bind())
    return business


def get_business(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Business:
    business = selected_business(db, user)
    if not business:
        raise HTTPException(status_code=404, detail="עוד לא הגדרתם עסק")
    return business
