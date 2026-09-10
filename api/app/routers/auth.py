from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import LoginRequest, PasswordChangeIn, RegisterRequest, UserOut
from app.security import COOKIE_NAME, create_access_token, hash_password, verify_password
from app.services.ratelimit import auth_rate_limit

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_cookie(response: Response, user_id: int) -> None:
    settings = get_settings()
    secure = (
        settings.cookie_secure
        if settings.cookie_secure is not None
        else settings.web_origin.startswith("https://")
    )
    response.set_cookie(
        key=COOKIE_NAME,
        value=create_access_token(user_id),
        httponly=True,
        samesite="lax",
        secure=secure,
        max_age=60 * 60 * 24 * 7,
        path="/",
    )


@router.post("/register", response_model=UserOut)
def register(
    body: RegisterRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(auth_rate_limit("register", by_email=False)),
) -> User:
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(status_code=409, detail="האימייל כבר רשום")
    user = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        full_name=body.full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _set_cookie(response, user.id)
    return user


@router.post("/login", response_model=UserOut)
def login(
    body: LoginRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(auth_rate_limit("login", by_email=True)),
) -> User:
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="אימייל או סיסמה שגויים")
    _set_cookie(response, user.id)
    return user


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.post("/password")
def change_password(
    body: PasswordChangeIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Change the signed-in user's password.

    Requiring the current password means a stolen session cookie alone cannot lock the
    real owner out. There was previously no way to change a password at all, so a
    mistyped or stale one was unrecoverable.
    """
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="הסיסמה הנוכחית שגויה")
    if body.current_password == body.new_password:
        raise HTTPException(status_code=400, detail="הסיסמה החדשה זהה לנוכחית")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
