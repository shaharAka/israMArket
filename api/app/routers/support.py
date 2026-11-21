"""Account-isolated reports and an owner-only support queue."""
import secrets
from datetime import datetime
from io import BytesIO
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, Response, UploadFile
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user, session_token
from app.models import AdminAudit, FeedbackEvidence, SupportMessage, SupportTicket, User
from app.security import METHOD_GOOGLE, session_method
from app.services import feedback_board, ratelimit, support
from app.services.admin_access import is_admin_request, require_admin

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


def _feedback_screenshot(file: UploadFile | None):
    if file is None:
        return None
    limit = 2 * 1024 * 1024
    contents = file.file.read(limit + 1)
    if len(contents) > limit:
        raise HTTPException(413, "צילום המסך גדול מדי. אפשר לשלוח את הדיווח בלעדיו.")
    try:
        with Image.open(BytesIO(contents), formats=["JPEG", "PNG", "WEBP"]) as image:
            if max(image.size) > 2400 or image.width * image.height > 3_000_000:
                raise ValueError("large image")
            output = BytesIO()
            image.convert("RGB").save(output, "JPEG", quality=85)
            return output.getvalue()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
        raise HTTPException(422, "לא הצלחנו לקרוא את צילום המסך.") from None


@router.post("/feedback", status_code=201)
def feedback(
    client_ref: UUID = Form(),
    kind: Literal["bug", "suggestion"] = Form(),
    body: str = Form(min_length=5, max_length=3000),
    page: str = Form(default="/", max_length=40, pattern=r"^/(?:[a-z0-9-]+(?:/[a-z0-9-]+)*)?$"),
    screenshot: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ref = str(client_ref)
    ticket = db.query(SupportTicket).filter_by(user_id=user.id, client_ref=ref).first()
    if ticket is None:
        text = support.clean(body)
        if len(text) < 5:
            raise HTTPException(422, "כתבו בכמה מילים מה קרה.")
        _budget(user, report=True)
        image = _feedback_screenshot(screenshot)
        ticket = SupportTicket(id=secrets.token_hex(16), user_id=user.id, client_ref=ref,
                               category=kind, page=page, ai_status="skipped")
        try:
            db.add(ticket)
            db.flush()
            support.message(db, ticket, "user", text, ref)
            db.add(FeedbackEvidence(ticket_id=ticket.id, user_id=user.id, screenshot=image))
            db.commit()
        except IntegrityError:
            db.rollback()
            ticket = db.query(SupportTicket).filter_by(user_id=user.id, client_ref=ref).one()
    ticket_id = ticket.id
    feedback_board.publish(db, ticket_id)
    evidence = db.get(FeedbackEvidence, ticket_id)
    if evidence is None:
        raise HTTPException(409, "מספר הדיווח כבר משויך לפנייה אחרת.")
    return {"id": ticket_id, "board_synced": evidence.board_state == "sent"}


@router.get("/{ticket_id}/screenshot")
def screenshot(
    ticket_id: str, request: Request, db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    evidence = db.get(FeedbackEvidence, ticket_id)
    reviewers = {email.strip().lower() for email in get_settings().feedback_reviewer_emails.split(",") if email.strip()}
    reviewer = user.email.lower() in reviewers and user.google_sub and session_method(session_token(request)) == METHOD_GOOGLE
    if not evidence or not evidence.screenshot or not (
        evidence.user_id == user.id or reviewer or is_admin_request(request, user)
    ):
        raise HTTPException(404, "צילום המסך לא נמצא.")
    return Response(evidence.screenshot, media_type="image/jpeg",
                    headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


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
