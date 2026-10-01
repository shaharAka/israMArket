"""The business's Design DNA (docs/design-dna.md, services/design_dna.py).

    GET  /brand/dna/library      the keys the renderer draws (fonts, compositions, motifs,
                                 signatures, enums). Static, no account needed.
    GET  /brand/dna              the business's DNA; built on the first read if missing.
    POST /brand/dna/regenerate   "לנסות סגנון אחר": a new seed within the same signals,
                                 still unique in its field. Genes the owner set stay.
    PUT  /brand/dna              the owner keeps or changes a few genes (fonts, motif,
                                 colours), validated against the library; "keep" = "לשמור".
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_business
from app.models import Business
from app.schemas import BrandDnaEditIn
from app.services import design_dna
from app.services.billing import require_generation_access  # the one billing gate
from app.services.dna_library import library_payload

router = APIRouter(prefix="/brand", tags=["brand"])


def _payload(business: Business, dna: dict) -> dict:
    return {"brand_dna": dna, "business_id": business.id}


@router.get("/dna/library")
def dna_library() -> dict:
    return library_payload()


@router.get("/dna")
def get_brand_dna(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    dna = design_dna.load_dna(business)
    if dna is None:
        # Built once and stored. Without the model (no key, provider down) it is built
        # locally from the same signals, so this read never fails over it.
        dna = design_dna.create_dna(db, business)
        business.updated_at = datetime.utcnow()
        db.commit()
    return _payload(business, dna)


@router.post("/dna/regenerate", dependencies=[Depends(require_generation_access)])
def regenerate_brand_dna(business: Business = Depends(get_business), db: Session = Depends(get_db)) -> dict:
    try:
        dna = design_dna.regenerate_dna(db, business)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail="לא הצלחנו להציע סגנון אחר כרגע. נסו שוב בעוד כמה דקות.") from exc
    business.updated_at = datetime.utcnow()
    db.commit()
    return _payload(business, dna)


@router.put("/dna")
def edit_brand_dna(
    body: BrandDnaEditIn,
    business: Business = Depends(get_business),
    db: Session = Depends(get_db),
) -> dict:
    edit = {
        "type": body.type.model_dump(exclude_none=True) if body.type else {},
        "motif": body.motif.model_dump(exclude_none=True) if body.motif else {},
        "colors": body.colors.model_dump(exclude_none=True) if body.colors else {},
        "keep": body.keep,
    }
    try:
        dna = design_dna.edit_dna(db, business, edit)
    except design_dna.DnaEditError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    business.updated_at = datetime.utcnow()
    db.commit()
    return _payload(business, dna)
