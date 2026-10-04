from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.errors import account_suspended
from app.schemas import (
    AccountDeleteIn,
    LoginRequest,
    PasswordChangeIn,
    PasswordSetIn,
    RegisterRequest,
    ResetCheckIn,
    ResetIn,
    UserOut,
)
from app.security import (
    COOKIE_NAME,
    METHOD_GOOGLE,
    METHOD_PASSWORD,
    create_access_token,
    hash_password,
    verify_password,
)
from app.services import google_login, password_reset, ratelimit
from app.services.account_deletion import delete_account
from app.services.admin_access import is_admin_request
from app.services.ratelimit import auth_rate_limit

router = APIRouter(prefix="/auth", tags=["auth"])

# A Google-only account asked for a password: say where its sign-in is instead of the
# generic "wrong email or password", which would send the owner hunting for a password
# that never existed. Registration already tells an existing address apart (409), so this
# reveals nothing new about which addresses have accounts.
GOOGLE_ONLY_HINT = "החשבון הזה נפתח עם Google. היכנסו עם הכפתור ״להמשיך עם Google״."


def _cookie_secure() -> bool:
    settings = get_settings()
    return (
        settings.cookie_secure
        if settings.cookie_secure is not None
        else settings.web_origin.startswith("https://")
    )


def _set_cookie(response: Response, user: User, method: str = METHOD_PASSWORD) -> None:
    """The session cookie. `method` (password | google) is carried in the token: the
    backoffice requires a Google sign-in (services/admin_access.py)."""
    secure = _cookie_secure()
    response.set_cookie(
        key=COOKIE_NAME,
        value=create_access_token(user.id, user.session_epoch or 0, method),
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
) -> UserOut:
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(status_code=409, detail="כבר יש חשבון עם האימייל הזה")
    user = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        # The free month starts at signup (Revision 7 B).
        trial_started_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _set_cookie(response, user, METHOD_PASSWORD)
    return _user_out(request, user)


@router.post("/login", response_model=UserOut)
def login(
    body: LoginRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(auth_rate_limit("login", by_email=True)),
) -> UserOut:
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if user and not user.password_hash:
        raise HTTPException(status_code=401, detail=GOOGLE_ONLY_HINT)
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="האימייל או הסיסמה לא נכונים")
    if user.suspended_at is not None:
        # Only after the password matched: a wrong guess learns nothing about suspension.
        raise account_suspended()
    _set_cookie(response, user, METHOD_PASSWORD)
    return _user_out(request, user)


def _rate_ok(request: Request, name: str) -> bool:
    settings = get_settings()
    return ratelimit.allow(
        f"{name}:ip:{ratelimit._client_ip(request)}",
        settings.auth_rate_limit,
        settings.auth_rate_window_seconds,
    )


@router.get("/google/start")
def google_start(request: Request, next: str = "", back: str = "") -> RedirectResponse:
    """Send the browser to Google's account picker ("להמשיך עם Google").

    A full-page navigation, not a fetch: every outcome is a redirect. `next` is where a
    successful sign-in lands and `back` is the page that shows an error; both must be paths
    on this site (services/google_login.safe_path), anything else falls back to the
    defaults. Scopes are `openid email profile` only.
    """
    web = get_settings().web_origin
    next_path = google_login.safe_path(next, google_login.DEFAULT_NEXT)
    back_path = google_login.safe_path(back, google_login.DEFAULT_BACK)
    if not _rate_ok(request, "google_start"):
        return RedirectResponse(f"{web}{google_login.with_error(back_path, 'rate_limited')}", status_code=303)
    if not google_login.configured():
        return RedirectResponse(f"{web}{google_login.with_error(back_path, 'misconfigured')}", status_code=303)
    flow = google_login.new_flow()
    state = google_login.encode_state(next_path, back_path, flow["nonce"])
    response = RedirectResponse(
        google_login.authorization_url(state, flow["challenge"], flow["nonce"]), status_code=303
    )
    response.set_cookie(
        key=google_login.FLOW_COOKIE,
        value=google_login.encode_flow_cookie(flow["verifier"], flow["nonce"]),
        httponly=True,
        # Lax still travels on Google's top-level GET redirect back to the callback.
        samesite="lax",
        secure=_cookie_secure(),
        max_age=google_login.FLOW_TTL_SECONDS,
        path="/",
    )
    return response


def _google_user(db: Session, identity: dict) -> User:
    """The account for a verified Google identity: by Google id, then by email (linking
    it), else a new account with no password. Raises GoogleLoginError("conflict") when the
    email already belongs to an account linked to a different Google account."""
    user = db.query(User).filter(User.google_sub == identity["sub"]).first()
    if user:
        if user.suspended_at is not None:
            raise google_login.GoogleLoginError("account_suspended")
        return user
    user = db.query(User).filter(User.email == identity["email"]).first()
    if user:
        if user.google_sub and user.google_sub != identity["sub"]:
            raise google_login.GoogleLoginError("conflict")
        if user.suspended_at is not None:
            # Before linking: a suspended account is not changed by a sign-in attempt.
            raise google_login.GoogleLoginError("account_suspended")
        user.google_sub = identity["sub"]
        if user.password_hash:
            # There is no email verification on password signup, so whoever set this
            # password may not own the address. Google just proved who does: drop the
            # password and sign out every earlier session (pre-account-takeover). The owner
            # can set a new password on /account.
            user.password_hash = ""
            user.session_epoch = (user.session_epoch or 0) + 1
        if not (user.full_name or "").strip() and identity["name"]:
            user.full_name = identity["name"]
        db.commit()
        return user
    user = User(
        email=identity["email"],
        password_hash="",
        full_name=identity["name"],
        google_sub=identity["sub"],
        # The free month starts at signup (Revision 7 B), the same as /auth/register.
        trial_started_at=datetime.utcnow(),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        # Two callbacks for the same new account at once: the other one won.
        db.rollback()
        existing = db.query(User).filter(User.google_sub == identity["sub"]).first()
        if not existing:
            raise google_login.GoogleLoginError("failed") from exc
        return existing
    db.refresh(user)
    return user


@router.get("/google/callback")
def google_callback(
    request: Request,
    code: str = "",
    state: str = "",
    error: str = "",
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Google sends the browser back here. Signs in (or opens the account) and redirects to
    the `next` carried in the signed state; on any failure, back to the starting page with
    `?google_error=<code>`. Sets the same session cookie as a password login."""
    web = get_settings().web_origin
    back_path = google_login.DEFAULT_BACK

    def fail(reason: str) -> RedirectResponse:
        response = RedirectResponse(f"{web}{google_login.with_error(back_path, reason)}", status_code=303)
        response.delete_cookie(google_login.FLOW_COOKIE, path="/")
        return response

    if not _rate_ok(request, "google_callback"):
        return fail("rate_limited")
    try:
        claims = google_login.decode_state(state)
    except google_login.GoogleLoginError as exc:
        return fail(exc.code)
    # Signed by us, but re-checked: a path on this site, never a URL.
    back_path = google_login.safe_path(claims.get("back"), google_login.DEFAULT_BACK)
    next_path = google_login.safe_path(claims.get("next"), google_login.DEFAULT_NEXT)
    if error:
        # access_denied is the owner pressing cancel (or refusing) on Google's screen.
        return fail("cancelled" if error == "access_denied" else "denied")
    if not google_login.configured():
        return fail("misconfigured")
    try:
        flow = google_login.decode_flow_cookie(request.cookies.get(google_login.FLOW_COOKIE))
        if flow["n"] != claims["n"]:
            # Started in another browser (or a login-CSRF attempt): not this owner's code.
            raise google_login.GoogleLoginError("expired")
        raw = google_login.exchange_code(code, flow["v"])
        identity = google_login.verify_id_token(raw, flow["n"])
        user = _google_user(db, identity)
    except google_login.GoogleLoginError as exc:
        return fail(exc.code)
    response = RedirectResponse(f"{web}{next_path}", status_code=303)
    response.delete_cookie(google_login.FLOW_COOKIE, path="/")
    _set_cookie(response, user, METHOD_GOOGLE)
    return response


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.post("/password")
def change_password(
    body: PasswordChangeIn,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Change the signed-in user's password.

    Requiring the current password means a stolen session cookie alone cannot lock the
    real owner out. There was previously no way to change a password at all, so a
    mistyped or stale one was unrecoverable.
    """
    if not user.password_hash:
        raise HTTPException(status_code=400, detail="לחשבון עוד אין סיסמה. אפשר לקבוע אחת בעמוד החשבון.")
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="הסיסמה הנוכחית לא נכונה")
    if body.current_password == body.new_password:
        raise HTTPException(status_code=400, detail="הסיסמה החדשה זהה לישנה")
    user.password_hash = hash_password(body.new_password)
    # Sign out every other session; this one gets a fresh cookie.
    user.session_epoch = (user.session_epoch or 0) + 1
    db.commit()
    _set_cookie(response, user, METHOD_PASSWORD)
    return {"ok": True}


@router.post("/password/set")
def set_password(
    body: PasswordSetIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: None = Depends(auth_rate_limit("set_password", by_email=False)),
) -> dict:
    """A first password for an account opened with Google, so it can also sign in with
    email. Only while there is none: changing an existing one needs the current password
    (POST /auth/password)."""
    if user.password_hash:
        raise HTTPException(status_code=409, detail="כבר יש לחשבון סיסמה. אפשר להחליף אותה בטופס החלפת הסיסמה.")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}


@router.delete("/account")
def delete_my_account(
    body: AccountDeleteIn,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _: None = Depends(auth_rate_limit("delete_account", by_email=False)),
) -> dict:
    """Delete the signed-in account and everything stored for it, then sign out.

    Irreversible, so it asks for the current password (403 when wrong, not 401: the
    session is valid, the confirmation is not). What gets deleted is every row of the
    user's businesses in every table plus their media folders; see
    services/account_deletion.py. The landing page's "אפשר למחוק את החשבון" rests on this.
    """
    if not user.password_hash:
        # Opened with Google, no password: the typed email address is the confirmation.
        if body.confirm_email.strip().lower() != user.email.lower():
            raise HTTPException(status_code=403, detail="האימייל לא תואם לחשבון. החשבון לא נמחק.")
    elif not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=403, detail="הסיסמה לא נכונה. החשבון לא נמחק.")
    delete_account(db, user)
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


def _user_out(request: Request, user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        has_password=user.has_password,
        google_linked=user.google_linked,
        is_admin=is_admin_request(request, user),
    )


@router.get("/me", response_model=UserOut)
def me(request: Request, user: User = Depends(get_current_user)) -> UserOut:
    return _user_out(request, user)


# --- one-time reset links (made in the backoffice, services/password_reset.py) ----------

RESET_INVALID_HE = "הקישור הזה כבר לא בתוקף. בקשו קישור חדש ממי ששלח לכם אותו."


@router.post("/reset/check")
def reset_check(
    body: ResetCheckIn,
    db: Session = Depends(get_db),
    _: None = Depends(auth_rate_limit("reset_check", by_email=False)),
) -> dict:
    """Whether a reset link can still be used, before the page asks for a password.
    The token travels in the body (never a URL the API logs). A masked email only."""
    found = password_reset.find(db, body.token)
    if found is None:
        return {"valid": False}
    row, user = found
    return {
        "valid": True,
        "email_hint": password_reset.mask_email(user.email),
        "expires_at": row.expires_at.replace(microsecond=0).isoformat() + "Z",
    }


@router.post("/reset")
def reset_password(
    body: ResetIn,
    db: Session = Depends(get_db),
    _: None = Depends(auth_rate_limit("reset", by_email=False)),
) -> dict:
    """Set a new password with a one-time link: marks the link used and signs out every
    session of the account. Does not sign in: the page sends the person to /login."""
    if password_reset.redeem(db, body.token, body.new_password) is None:
        raise HTTPException(status_code=400, detail=RESET_INVALID_HE)
    return {"ok": True}
