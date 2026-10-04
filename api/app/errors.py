"""HTTP errors that carry a machine-readable `code` next to the Hebrew sentence.

The body is `{"detail": detail_he, "code": code, "detail_he": detail_he}` (app/main.py
renders it), the same shape as the billing gate's 402: `detail` stays the one sentence
every client already shows, and `code` lets the web app tell this case apart.
"""

from __future__ import annotations

from fastapi import HTTPException

ACCOUNT_SUSPENDED = "account_suspended"
ACCOUNT_SUSPENDED_HE = "החשבון מושהה כרגע. כל המידע שמור. כדי לברר למה, פנו אלינו."

ADMIN_ONLY = "admin_only"
ADMIN_ONLY_HE = "העמוד הזה פתוח רק למנהלי ישראמארקט, אחרי כניסה עם Google."


class CodedError(HTTPException):
    def __init__(self, status_code: int, code: str, detail_he: str) -> None:
        super().__init__(status_code=status_code, detail=detail_he)
        self.code = code
        self.detail_he = detail_he

    def body(self) -> dict:
        return {"detail": self.detail_he, "code": self.code, "detail_he": self.detail_he}


def account_suspended() -> CodedError:
    """403 for a suspended account: on sign-in (password and Google) and on every
    authenticated call (deps.get_current_user). The data is kept; see routers/admin.py."""
    return CodedError(403, ACCOUNT_SUSPENDED, ACCOUNT_SUSPENDED_HE)


def admin_only() -> CodedError:
    """403 for a signed-in non-admin on any /admin route. The same answer whatever the
    reason (not on the list, no Google sign-in), so it does not reveal who is an admin."""
    return CodedError(403, ADMIN_ONLY, ADMIN_ONLY_HE)
