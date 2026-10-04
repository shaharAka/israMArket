"""One-time password reset links, made by the owner in the backoffice.

There is no email sending in the product, so the owner makes a link (POST
/admin/users/{id}/reset-link) and sends it to the person, e.g. on WhatsApp. The person
opens /reset/{token} and chooses a new password. Nobody else ever sees or sets it.

* The token is 32 random bytes (`secrets.token_urlsafe`, 43 characters). Only its SHA-256
  is stored; the token itself is in the one response that creates it, and nowhere else:
  not in a log, not in the audit entry.
* Valid for 24 hours, and used at most once: redeeming is a compare-and-set on `used_at`,
  in the same transaction as the new password.
* A new link for an account revokes every older unused one.
* Redeeming bumps `session_epoch`: every session of the account, including whoever had the
  old password, is signed out.
* The page reads and submits the token in a POST body, never a query string, so the API's
  access log never holds it.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import PasswordResetToken, User
from app.security import hash_password

TOKEN_BYTES = 32
VALID_FOR = timedelta(hours=24)


def token_hash(token: str) -> str:
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


def create_link(db: Session, user: User, now: datetime | None = None) -> tuple[str, datetime]:
    """A new link for `user`: (url, expires_at). Revokes older unused links. Commits."""
    now = now or datetime.utcnow()
    db.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )
    token = secrets.token_urlsafe(TOKEN_BYTES)
    expires_at = now + VALID_FOR
    db.add(PasswordResetToken(user_id=user.id, token_hash=token_hash(token), created_at=now, expires_at=expires_at))
    db.commit()
    return f"{get_settings().web_origin.rstrip('/')}/reset/{token}", expires_at


def _usable(row: PasswordResetToken | None, now: datetime) -> bool:
    return bool(row and row.used_at is None and row.revoked_at is None and now < row.expires_at)


def find(db: Session, token: str, now: datetime | None = None) -> tuple[PasswordResetToken, User] | None:
    """The live link and its account, or None (unknown, used, revoked, expired, or the
    account is gone)."""
    if not token or len(token) > 200:
        return None
    now = now or datetime.utcnow()
    row = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == token_hash(token)).first()
    if not _usable(row, now):
        return None
    user = db.get(User, row.user_id)
    if user is None:
        return None
    return row, user


def mask_email(email: str) -> str:
    """"n•••@bakery.example": enough for the person to recognise their own account."""
    local, _, domain = (email or "").partition("@")
    if not domain:
        return ""
    return f"{local[:1]}•••@{domain}"


def redeem(db: Session, token: str, new_password: str, now: datetime | None = None) -> User | None:
    """Set the new password, mark the link used and sign out every session, atomically.
    None when the link cannot be used (then nothing changed)."""
    now = now or datetime.utcnow()
    found = find(db, token, now)
    if found is None:
        return None
    row, user = found
    claimed = db.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.id == row.id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.revoked_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
        .values(used_at=now)
        .execution_options(synchronize_session=False)
    )
    if claimed.rowcount != 1:
        db.rollback()
        return None
    user.password_hash = hash_password(new_password)
    user.session_epoch = (user.session_epoch or 0) + 1
    db.commit()
    return user
