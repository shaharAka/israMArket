from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Business, User
from app.security import COOKIE_NAME, decode_access_token


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="נדרשת התחברות")
    user_id = decode_access_token(token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="הסשן פג תוקף")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="המשתמש לא נמצא")
    return user


def get_business(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Business:
    business = (
        db.query(Business).filter(Business.user_id == user.id).order_by(Business.id.desc()).first()
    )
    if not business:
        raise HTTPException(status_code=404, detail="לא הוגדר עסק")
    return business
