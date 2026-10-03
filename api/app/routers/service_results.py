"""An optional, tenant-scoped check-in; saving never invokes AI or a provider."""
import re
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_business
from app.models import Business, ServiceReport
from app.services import service_results

router = APIRouter(prefix="/performance/service-results", tags=["performance"])


def check_month(value: str) -> str:
    if not re.fullmatch(r"20\d{2}-(0[1-9]|1[0-2])", value) or value > date.today().strftime("%Y-%m"):
        raise ValueError("בחרו חודש תקין, עד החודש הנוכחי.")
    return value


class ReportIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    month: str
    revision: int | None = Field(default=None, ge=1)
    inquiries: int | None = Field(default=None, ge=0, le=100000, strict=True)
    suitable: int | None = Field(default=None, ge=0, le=100000, strict=True)
    clients_won: int | None = Field(default=None, ge=0, le=100000, strict=True)
    capacity: int | None = Field(default=None, ge=0, le=100000, strict=True)
    fit_criterion: str = Field(default="", max_length=300)

    _month = field_validator("month")(check_month)

    @model_validator(mode="after")
    def coherent(self):
        self.fit_criterion = re.sub(r"\s+", " ", self.fit_criterion).strip()
        if self.suitable is not None:
            if self.inquiries is None or self.suitable > self.inquiries:
                raise ValueError("פניות מתאימות הן חלק מהפניות שהתקבלו. הזינו גם את סך הפניות ובדקו את המספרים.")
            if not self.fit_criterion:
                raise ValueError("כתבו בקצרה איזו פנייה מתאימה לכם, כדי שנוכל לפרש את המספר.")
        if self.capacity is not None and self.month != date.today().strftime("%Y-%m"):
            raise ValueError("מקום ללקוחות נוספים מעדכנים בדיווח של החודש הנוכחי.")
        return self


def payload(business, row):
    return {"enabled": service_results.enabled(business), "report": service_results.view(row)}


@router.get("")
def get(month: str | None = None, business: Business = Depends(get_business), db: Session = Depends(get_db)):
    if not service_results.enabled(business):
        return payload(business, None)
    if month is None:
        return payload(business, service_results.latest(business))
    try:
        check_month(month)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    row = db.query(ServiceReport).filter_by(business_id=business.id, month=month).first()
    return payload(business, row)


@router.put("")
def put(body: ReportIn, business: Business = Depends(get_business), db: Session = Depends(get_db)):
    if not service_results.enabled(business):
        raise HTTPException(409, "הדיווח הזה מיועד לעסק שמציע שירותים.")
    values = body.model_dump(exclude={"revision"})
    values["updated_at"] = datetime.utcnow()
    row = db.query(ServiceReport).filter_by(business_id=business.id, month=body.month).first()
    conflict = "הדיווח עודכן בחלון אחר. טענו את הדיווח מחדש לפני שמירה; המספרים שהקלדתם עדיין כאן."
    if row:
        result = db.execute(update(ServiceReport).where(ServiceReport.id == row.id, ServiceReport.revision == body.revision).values(
            **values, revision=ServiceReport.revision + 1))
        if result.rowcount != 1:
            db.rollback()
            raise HTTPException(409, conflict)
    else:
        if body.revision is not None:
            raise HTTPException(409, conflict)
        row = ServiceReport(business_id=business.id, **values)
        db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, conflict) from exc
    db.refresh(row)
    return payload(business, row)
