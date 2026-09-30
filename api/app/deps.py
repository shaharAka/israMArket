from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Business, User
from app.security import COOKIE_NAME, decode_access_claims


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="צריך להתחבר")
    claims = decode_access_claims(token)
    if claims is None:
        raise HTTPException(status_code=401, detail="עבר הרבה זמן מאז שהתחברתם. התחברו שוב.")
    user_id, epoch = claims
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="לא מצאנו את החשבון")
    if epoch != (user.session_epoch or 0):
        # Signed out by a password change or a Google takeover (models.User.session_epoch).
        raise HTTPException(status_code=401, detail="צריך להתחבר שוב")
    return user


def get_business(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Business:
    business = (
        db.query(Business).filter(Business.user_id == user.id).order_by(Business.id.desc()).first()
    )
    if not business:
        raise HTTPException(status_code=404, detail="עוד לא הגדרתם עסק")
    return business
