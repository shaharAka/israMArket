from datetime import datetime, timedelta, timezone
from hashlib import sha256

from cryptography.fernet import Fernet, InvalidToken
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"
COOKIE_NAME = "isramarket_token"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


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
        digest = sha256(settings.jwt_secret.encode("utf-8")).digest()
        key = __import__("base64").urlsafe_b64encode(digest).decode()
    return Fernet(key.encode("utf-8"))


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_secret(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Could not decrypt stored credential") from exc
