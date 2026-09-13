"""The business's own asset library.

Every route here is scoped to the caller's business. An asset id that belongs to
somebody else must 404 exactly like a missing one — anything else leaks which ids exist
and, through the media URL, another customer's photographs.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Asset, Business, User
from app.schemas import AssetImportUrlIn, AssetUpdateIn
from app.services.assets import (
    ALLOWED_MIMES,
    MAX_TAGS,
    MAX_UPLOAD_BYTES,
    business_folder,
    describe_image_bytes,
    delete_asset_file,
    dimensions_for,
    import_from_url,
    normalize_mime,
    parse_description,
    parse_tags,
    resolve_mime,
    scan_site_images,
    serialize_asset,
    store_asset_bytes,
    store_tags,
    unsupported_message,
)
from app.services.netguard import UnsafeUrlError

router = APIRouter(prefix="/assets", tags=["assets"])

NOT_FOUND = "הנכס לא נמצא"


def _business_for(db: Session, user: User) -> Business:
    business = (
        db.query(Business).filter(Business.user_id == user.id).order_by(Business.id.desc()).first()
    )
    if not business:
        raise HTTPException(status_code=404, detail="לא הוגדר עסק")
    return business


def _owned_asset(db: Session, business: Business, asset_id: int) -> Asset:
    """Load an asset, but only if this business owns it. Otherwise 404, never 403."""
    asset = (
        db.query(Asset)
        .filter(Asset.id == asset_id, Asset.business_id == business.id)
        .first()
    )
    if not asset:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return asset


def _create_asset(business_id: int, fields: dict) -> Asset:
    return Asset(
        business_id=business_id,
        filename=fields["filename"],
        kind=fields.get("kind") or "image",
        mime=fields.get("mime") or "",
        source=fields.get("source") or "upload",
        source_url=fields.get("source_url") or "",
        width=fields.get("width") or 0,
        height=fields.get("height") or 0,
        tags_json="[]",
    )


def _save_imports(db: Session, business: Business, stored: list[dict]) -> list[Asset]:
    assets = [_create_asset(business.id, item) for item in stored]
    for asset in assets:
        db.add(asset)
    business.updated_at = datetime.utcnow()
    db.commit()
    for asset in assets:
        db.refresh(asset)
    return assets


@router.get("")
def list_assets(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    business = _business_for(db, user)
    assets = (
        db.query(Asset)
        .filter(Asset.business_id == business.id)
        .order_by(Asset.created_at.desc(), Asset.id.desc())
        .all()
    )
    return {"assets": [serialize_asset(asset) for asset in assets]}


@router.post("/upload")
async def upload_asset(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Store one uploaded photo or short video.

    The payload is read with the cap applied one byte over, so a 2GB upload is refused
    without ever being held in memory, and the type is decided by sniffing the bytes —
    the client's content type is only a hint.
    """
    business = _business_for(db, user)
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="הקובץ גדול מ-25MB. העלו קובץ קטן יותר.")
    if not data:
        raise HTTPException(status_code=400, detail="הקובץ שהעליתם ריק.")

    mime = resolve_mime(file.content_type or "", data)
    if mime not in ALLOWED_MIMES:
        raise HTTPException(status_code=415, detail=unsupported_message())

    width, height = dimensions_for(data, mime)
    filename = store_asset_bytes(business.id, data, mime)
    asset = _create_asset(
        business.id,
        {
            "filename": filename,
            "kind": "video" if mime.startswith("video/") else "image",
            "mime": mime,
            "source": "upload",
            "source_url": "",
            "width": width,
            "height": height,
        },
    )
    db.add(asset)
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(asset)
    return {"asset": serialize_asset(asset)}


@router.post("/import-url")
def import_asset_url(
    body: AssetImportUrlIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    business = _business_for(db, user)
    try:
        stored, skipped = import_from_url(body.url, business.id)
    except UnsafeUrlError as exc:
        # The guard's messages are already user-facing Hebrew.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    assets = _save_imports(db, business, stored)
    return {"assets": [serialize_asset(asset) for asset in assets], "skipped": skipped}


@router.post("/scan-site")
def scan_business_site(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Pull the business's own imagery off its website, including CSS backgrounds."""
    business = _business_for(db, user)
    try:
        stored, skipped = scan_site_images(business.website_url or "", business.id)
    except UnsafeUrlError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    assets = _save_imports(db, business, stored)
    return {"assets": [serialize_asset(asset) for asset in assets], "skipped": skipped}


@router.patch("/{asset_id}")
def update_asset(
    asset_id: int,
    body: AssetUpdateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    business = _business_for(db, user)
    asset = _owned_asset(db, business, asset_id)

    if body.description is not None:
        asset.description = parse_description(body.description)
    if body.tags is not None:
        # Accepts the same shapes the model can return, so a client that echoes a raw
        # model answer is normalised rather than rejected.
        asset.tags_json = store_tags(parse_tags(body.tags)[:MAX_TAGS])
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(asset)
    return {"asset": serialize_asset(asset)}


@router.delete("/{asset_id}")
def delete_asset(
    asset_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    business = _business_for(db, user)
    asset = _owned_asset(db, business, asset_id)
    filename = asset.filename
    db.delete(asset)
    business.updated_at = datetime.utcnow()
    db.commit()
    delete_asset_file(business.id, filename)
    return {"ok": True}


@router.post("/{asset_id}/describe")
def describe_asset(
    asset_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """(Re)generate the description and tags from the image itself, with vision."""
    business = _business_for(db, user)
    asset = _owned_asset(db, business, asset_id)
    if asset.kind != "image":
        raise HTTPException(
            status_code=400,
            detail="אפשר לתאר רק תמונות. סרטונים מקבלים תיאור ידני.",
        )
    path = business_folder(business.id) / asset.filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="קובץ הנכס לא נמצא בדיסק")

    mime = normalize_mime(asset.mime) or "image/jpeg"
    try:
        described = describe_image_bytes(path.read_bytes(), mime)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"תיאור התמונה נכשל: {exc}") from exc

    if described["description"]:
        asset.description = described["description"]
    asset.tags_json = store_tags(described["tags"])
    business.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(asset)
    return {"asset": serialize_asset(asset)}
