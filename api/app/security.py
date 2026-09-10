from datetime import datetime, timedelta, timezone
from hashlib import sha256

from cryptography.fernet import Fernet, InvalidToken
from jose import JWTError, jwt
import bcrypt

from app.config import get_settings

DEFAULT_JWT_SECRET = "dev-only-change-me"

ALGORITHM = "HS256"
COOKIE_NAME = "isramarket_token"


def hash_password(password: str) -> str:
    """bcrypt directly, not via passlib.

    passlib 1.7.4 (unmaintained) reads `bcrypt.__about__`, which bcrypt 4.x removed, so
    every hash and verify printed a trapped AttributeError traceback into the logs.
    The stored `$2b$` hashes are standard bcrypt, so no migration is needed.
    """
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        # A malformed or non-bcrypt stored hash must read as "wrong password", not a 500.
        return False


def create_access_token(user_id: int) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    return jwt.encode({"sub": str(user_id), "exp": expire}, settings.jwt_secret, algorithm=ALGORITHM)


def create_oauth_state(user_id: int, business_id: int, provider: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=20)
    return jwt.encode(
        {"sub": str(user_id), "biz": business_id, "p": provider, "exp": expire},
        settings.jwt_secret,
        algorithm=ALGORITHM,
    )


def decode_oauth_state(state: str) -> dict:
    settings = get_settings()
    payload = jwt.decode(state, settings.jwt_secret, algorithms=[ALGORITHM])
    return {"user_id": int(payload["sub"]), "business_id": int(payload["biz"]), "provider": payload["p"]}


def decode_access_token(token: str) -> int | None:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
        return int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return None


def _fernet() -> Fernet:
    settings = get_settings()
    key = settings.token_encryption_key.strip()
    if not key:
        # Deriving from jwt_secret is acceptable ONLY when that secret is a real one.
        # With the shipped default it would mean every stored OAuth token is encrypted
        # under a key that is public in the repository.
        if settings.jwt_secret == DEFAULT_JWT_SECRET:
            raise RuntimeError(
                "חסר TOKEN_ENCRYPTION_KEY וה-JWT_SECRET הוא ברירת המחדל. "
                "הגדירו JWT_SECRET אמיתי ו-TOKEN_ENCRYPTION_KEY לפני חיבור חשבונות."
            )
        import base64

        digest = sha256(settings.jwt_secret.encode("utf-8")).digest()
        key = base64.urlsafe_b64encode(digest).decode()
    return Fernet(key.encode("utf-8"))


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_secret(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Could not decrypt stored credential") from exc
