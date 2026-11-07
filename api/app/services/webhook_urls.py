"""Only the configured HTTPS receiver receives a signed webhook.

מטרה: לשמור כתובת תקינה של המערכת המקבלת. פעולה: לתקן את הכתובת או סוג ההודעה.
DNS/public-address checks still run separately at registration and every delivery.
"""
from urllib.parse import urlsplit


def validate_endpoint_url(url: str) -> str:
    try:
        parsed = urlsplit(url)
        port = parsed.port
        valid = (len(url) <= 800 and parsed.scheme == "https" and bool(parsed.hostname)
                 and parsed.username is None and parsed.password is None
                 and "#" not in url and (port is None or 1 <= port <= 65535))
    except (ValueError, TypeError):
        valid = False
    if not valid:
        raise ValueError("הזינו כתובת HTTPS מלאה של המערכת המקבלת, בלי שם משתמש, סיסמה או סימן #.")
    return url


def receiver_origin(url: str) -> str:
    """Diagnostics identify the receiver without copying path/query credentials."""
    try:
        parsed = urlsplit(url)
        host = parsed.hostname or ""
        if ":" in host:
            host = f"[{host}]"
        return f"{parsed.scheme}://{host}" + (f":{parsed.port}" if parsed.port else "")
    except (TypeError, ValueError):
        return ""
