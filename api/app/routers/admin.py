"""The owner's backoffice: every account, and the few things the owner can do to one.

Every route here depends on `require_admin` (services/admin_access.py): 401 without a
session, 403 `admin_only` for anyone who is not an admin signed in with Google. The web
page at /admin is only a view of these routes; the server is the authority.

Actions, each written to `admin_audit` in the same commit as the change itself:

* `POST /admin/users/{id}/reset-link`: a one-time password link (24 h, single use, only its
  hash stored, older unused links revoked). The URL is in this one response and nowhere
  else; the audit entry records only that a link was made and when it expires.
* `POST /admin/users/{id}/sign-out`: every session of the account ends (`session_epoch`).
* `POST /admin/users/{id}/suspend` / `reactivate`: sign-in and every authenticated call
  answer 403 `account_suspended`; suspending also ends every session. The data stays.
* `DELETE /admin/users/{id}`: the account-deletion pipeline the owner's own "delete my
  account" uses (services/account_deletion.py), confirmed by typing the account's email.
* `POST /admin/users/{id}/billing-exempt`: a free account (services/billing.py).

The owner cannot suspend or delete their own account here (the way back in would be gone).
Responses never carry a password, a hash, a token other than the new link, a Google id,
a provider token or any of the customer's content (services/backoffice.py).
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import AdminAudit, Business, User
from app.services import account_deletion, backoffice, password_reset
from app.services.admin_access import require_admin
from app.services.jsonutil import dumps

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

NOT_FOUND_HE = "לא מצאנו את החשבון."
NOT_YOURSELF_HE = "את החשבון שלכם אי אפשר להשהות או למחוק מכאן."


class SuspendIn(BaseModel):
    reason: str = Field(default="", max_length=300)


class DeleteIn(BaseModel):
    confirm_email: str = Field(default="", max_length=255)


class ExemptIn(BaseModel):
    exempt: bool


def _target(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND_HE)
    return user


def _audit(db: Session, admin: User, action: str, target_id: int | None, **details) -> None:
    """Added to the session; committed with the action it records."""
    db.add(AdminAudit(admin_user_id=admin.id, action=action, target_user_id=target_id, details_json=dumps(details)))


def _detail(db: Session, user_id: int) -> dict:
    db.expire_all()
    return backoffice.account_detail(db, _target(db, user_id))


@router.get("/users")
def list_users(
    q: str = Query(default="", max_length=120),
    stage: str = Query(default="", max_length=20),
    status: str = Query(default="", max_length=20),
    sort: str = Query(default="last_active", max_length=20),
    db: Session = Depends(get_db),
) -> dict:
    accounts = backoffice.list_accounts(db, q=q, stage=stage, status=status, sort=sort)
    return {"accounts": accounts, "count": len(accounts), "stages": list(backoffice.STAGES)}


@router.get("/users/{user_id}")
def get_user(user_id: int, db: Session = Depends(get_db)) -> dict:
    return backoffice.account_detail(db, _target(db, user_id))


@router.post("/users/{user_id}/reset-link")
def reset_link(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    user = _target(db, user_id)
    _audit(db, admin, "reset_link", user.id, google_only=not bool(user.password_hash) and bool(user.google_sub))
    # create_link commits: the audit entry and the new link are one transaction.
    url, expires_at = password_reset.create_link(db, user)
    return {"url": url, "expires_at": backoffice.iso(expires_at)}


@router.post("/users/{user_id}/sign-out")
def sign_out_everywhere(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    user = _target(db, user_id)
    user.session_epoch = (user.session_epoch or 0) + 1
    _audit(db, admin, "sign_out_everywhere", user.id)
    db.commit()
    return _detail(db, user_id)


@router.post("/users/{user_id}/suspend")
def suspend(user_id: int, body: SuspendIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    user = _target(db, user_id)
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail=NOT_YOURSELF_HE)
    if user.suspended_at is None:
        user.suspended_at = datetime.utcnow()
        # Every session ends now; the 403 then answers any that is still tried.
        user.session_epoch = (user.session_epoch or 0) + 1
    user.suspended_reason = body.reason.strip()[:300]
    # The reason stays on the account (deleted with it), not in the audit log.
    _audit(db, admin, "suspend", user.id, with_reason=bool(user.suspended_reason))
    db.commit()
    return _detail(db, user_id)


@router.post("/users/{user_id}/reactivate")
def reactivate(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    user = _target(db, user_id)
    user.suspended_at = None
    user.suspended_reason = ""
    _audit(db, admin, "reactivate", user.id)
    db.commit()
    return _detail(db, user_id)


@router.post("/users/{user_id}/billing-exempt")
def billing_exempt(user_id: int, body: ExemptIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    user = _target(db, user_id)
    user.billing_exempt = bool(body.exempt)
    _audit(db, admin, "billing_exempt", user.id, exempt=bool(body.exempt))
    db.commit()
    return _detail(db, user_id)


@router.delete("/users/{user_id}")
def delete_user(user_id: int, body: DeleteIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    user = _target(db, user_id)
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail=NOT_YOURSELF_HE)
    if body.confirm_email.strip().lower() != (user.email or "").strip().lower():
        raise HTTPException(status_code=403, detail="האימייל לא תואם לחשבון. החשבון לא נמחק.")
    businesses = db.query(Business.id).filter(Business.user_id == user.id).count()
    # In the deletion's own commit (account_deletion.delete_account commits once): either
    # the account is gone and the entry says so, or neither happened.
    _audit(db, admin, "delete", user.id, businesses=businesses)
    account_deletion.delete_account(db, user)
    return {"ok": True}


@router.get("/audit")
def audit(
    limit: int = Query(default=100, ge=1, le=200),
    before_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
) -> dict:
    return {"entries": backoffice.audit_entries(db, limit=limit, before_id=before_id)}
