"""Who may open the backoffice (routers/admin.py).

An admin is a signed-in, active account whose email is in ADMIN_EMAILS (comma-separated,
case-insensitive). With ADMIN_REQUIRE_GOOGLE (the default) the account must also be linked
to Google *and* this session must come from "להמשיך עם Google" (the token's `amr` claim,
security.create_access_token), so the owner's Google 2-step verification stands in front
of every account. A password session of the same account is not an admin session.

Why the Google requirement matters: password signup does not verify the address, so
anyone could open an account with the owner's address before the owner does. Google
proves the address; when the owner then signs in with Google, that account's password is
dropped and its sessions signed out (routers/auth._google_user).

`require_admin` is on every /admin route: 401 without a session (get_current_user), 403
`admin_only` for anyone else, whatever the reason, so the answer does not reveal which
addresses are admins.
"""

from __future__ import annotations

from fastapi import Depends, Request

from app.config import get_settings
from app.deps import get_current_user, session_token
from app.errors import admin_only
from app.models import User
from app.security import METHOD_GOOGLE, session_method


def is_admin(user: User | None, method: str) -> bool:
    settings = get_settings()
    emails = settings.admin_email_set()
    if user is None or not emails or (user.email or "").strip().lower() not in emails:
        return False
    if user.suspended_at is not None:
        return False
    if settings.admin_require_google:
        return bool(user.google_sub) and method == METHOD_GOOGLE
    return True


def is_admin_request(request: Request, user: User) -> bool:
    return is_admin(user, session_method(session_token(request)))


def require_admin(request: Request, user: User = Depends(get_current_user)) -> User:
    if not is_admin_request(request, user):
        raise admin_only()
    return user
