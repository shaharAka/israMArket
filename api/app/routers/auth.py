from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import LoginRequest, RegisterRequest, UserOut
from app.security import COOKIE_NAME, create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_cookie(response: Response, user_id: int) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=create_access_token(user_id),
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60 * 60 * 24 * 7,
        path="/",
    )


@router.post("/register", response_model=UserOut)
def register(body: RegisterRequest, response: Response, db: Session = Depends(get_db)) -> User:
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
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)) -> User:
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="אימייל או סיסמה שגויים")
    _set_cookie(response, user.id)
    return user


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
