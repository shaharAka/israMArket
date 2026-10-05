"""Account-isolated reports and an owner-only support queue."""
import secrets
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import AdminAudit, SupportMessage, SupportTicket, User
from app.services import ratelimit, support
from app.services.admin_access import require_admin

router = APIRouter(prefix="/support", tags=["support"])
admin_router = APIRouter(prefix="/admin/support", tags=["admin"], dependencies=[Depends(require_admin)])


class ReportIn(BaseModel):
    client_ref: UUID
    body: str = Field(min_length=5, max_length=3000)
    category: Literal["other", "plan", "posts", "connections", "results", "billing", "bug", "login"] = "other"
    page: Literal["", "/dashboard", "/strategy", "/plan", "/posts", "/performance", "/integrations", "/account", "/assets", "/help", "/support"] = ""
    human: bool = False


class ReplyIn(BaseModel):
    client_ref: UUID
    body: str = Field(min_length=1, max_length=3000)


class StateIn(BaseModel):
    status: Literal["open", "waiting", "resolved"]


def _budget(user, *, report=False):
    if not ratelimit.allow(f"support:{'report' if report else 'reply'}:{user.id}", 5 if report else 30, 3600):
        raise HTTPException(429, "יש כבר כמה פניות שלכם. נסו שוב בעוד שעה, או הוסיפו פרטים לפנייה הקיימת.")


def _ticket(db, ticket_id, user=None):
    query = db.query(SupportTicket).filter_by(id=ticket_id)
    if user is not None:
        query = query.filter_by(user_id=user.id)
    ticket = query.first()
    if not ticket:
        raise HTTPException(404, "לא מצאנו את הפנייה.")
    return ticket


@router.get("")
def mine(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.query(SupportTicket).filter_by(user_id=user.id).order_by(SupportTicket.updated_at.desc()).limit(50).all()
    return {"tickets": [support.serialize(db, row) for row in rows]}


@router.post("", status_code=201)
def create(body: ReportIn, background: BackgroundTasks, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ref = str(body.client_ref)
    prior = db.query(SupportTicket).filter_by(user_id=user.id, client_ref=ref).first()
    if prior:
        return support.serialize(db, prior)
    text = support.clean(body.body)
    if len(text) < 5:
        raise HTTPException(422, "כתבו בכמה מילים מה קרה.")
    _budget(user, report=True)
    ticket = SupportTicket(id=secrets.token_hex(16), user_id=user.id, client_ref=ref,
                           category=body.category, page=body.page, ai_status="skipped" if body.human else "pending")
    try:
        db.add(ticket)
        db.flush()
        support.message(db, ticket, "user", text, ref)
        db.commit()
    except IntegrityError:
        db.rollback()
        return support.serialize(db, db.query(SupportTicket).filter_by(user_id=user.id, client_ref=ref).one())
    result = support.serialize(db, ticket)
    if not body.human:
        background.add_task(support.schedule, ticket.id, support.factory_for(db))
    return result


@router.get("/{ticket_id}")
def detail(ticket_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return support.serialize(db, _ticket(db, ticket_id, user))


def _reply(db, ticket, body, role):
    if db.query(SupportMessage).filter_by(ticket_id=ticket.id, client_ref=str(body.client_ref)).first():
        return False
    text = support.clean(body.body)
    if not text:
        raise HTTPException(422, "כתבו הודעה לפני השליחה.")
    if db.query(SupportMessage).filter_by(ticket_id=ticket.id).count() >= 100:
        raise HTTPException(422, "הפנייה ארוכה מאוד. פתחו פנייה חדשה והזכירו את מספר הפנייה הזו.")
    support.message(db, ticket, role, text, str(body.client_ref))
    ticket.ai_status = "skipped"
    ticket.status = "waiting" if role == "support" else "open"
    return True


def _commit_reply(db, ticket, body):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # A concurrent retry of this same message has already committed it.
        if not db.query(SupportMessage).filter_by(ticket_id=ticket.id, client_ref=str(body.client_ref)).first():
            raise


@router.post("/{ticket_id}/messages")
def reply(ticket_id: str, body: ReplyIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ticket = _ticket(db, ticket_id, user)
    _budget(user)
    _reply(db, ticket, body, "user")
    _commit_reply(db, ticket, body)
    return support.serialize(db, ticket)


@router.patch("/{ticket_id}")
def customer_state(ticket_id: str, body: StateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ticket = _ticket(db, ticket_id, user)
    if body.status == "waiting":
        raise HTTPException(422, "בחרו לבקש עזרה או לסגור את הפנייה.")
    ticket.status, ticket.ai_status, ticket.updated_at = body.status, "skipped", datetime.utcnow()
    db.commit()
    return support.serialize(db, ticket)


@admin_router.get("")
def queue(status: Literal["active", "all", "open", "waiting", "resolved"] = "active", db: Session = Depends(get_db)):
    query = db.query(SupportTicket)
    if status == "active":
        query = query.filter(SupportTicket.status != "resolved")
    elif status != "all":
        query = query.filter_by(status=status)
    rows = query.order_by(SupportTicket.updated_at.desc()).limit(100).all()
    return {"tickets": [support.serialize(db, row, admin=True) for row in rows]}


@admin_router.post("/{ticket_id}/messages")
def staff_reply(ticket_id: str, body: ReplyIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    ticket = _ticket(db, ticket_id)
    _budget(admin)
    if _reply(db, ticket, body, "support"):
        db.add(AdminAudit(admin_user_id=admin.id, target_user_id=ticket.user_id, action="support_reply"))
    _commit_reply(db, ticket, body)
    return support.serialize(db, ticket, admin=True)


@admin_router.patch("/{ticket_id}")
def staff_state(ticket_id: str, body: StateIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    ticket = _ticket(db, ticket_id)
    ticket.status, ticket.ai_status, ticket.updated_at = body.status, "skipped", datetime.utcnow()
    db.add(AdminAudit(admin_user_id=admin.id, target_user_id=ticket.user_id, action="support_status"))
    db.commit()
    return support.serialize(db, ticket, admin=True)
