"""Outbound-URL safety.

Every URL in this app that a *user* can influence — a website to scan, a webhook to
deliver to — is fetched by the server. Without a guard that turns the API into an SSRF
pivot: `http://169.254.169.254/` reaches cloud metadata, `http://localhost:8000/`
reaches the API itself, and `http://10.0.0.5/` reaches the private network.

The guard resolves the hostname and refuses anything that is not a public unicast
address. It also has to run on EVERY redirect hop, because a public URL is free to
redirect to a private one.
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

import httpx

# Hostnames that never need DNS to know they are local.
_BLOCKED_HOSTNAMES = {
    "localhost",
    "localhost.localdomain",
    "ip6-localhost",
    "ip6-loopback",
    "metadata",
    "metadata.google.internal",
}
_BLOCKED_SUFFIXES = (".local", ".internal", ".localhost", ".home.arpa")


class UnsafeUrlError(ValueError):
    """Raised when a URL points somewhere the server must not fetch."""


def _is_public_ip(raw: str) -> bool:
    try:
        ip = ipaddress.ip_address(raw)
    except ValueError:
        return False
    if ip.version == 6 and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def assert_public_url(url: str) -> str:
    """Validate scheme, hostname and every resolved address. Returns the URL unchanged.

    Raises UnsafeUrlError with a message safe to show a Hebrew-speaking end user.
    """
    parsed = urlparse((url or "").strip())

    if parsed.scheme not in {"http", "https"}:
        raise UnsafeUrlError("אפשר לסרוק רק כתובות http או https.")
    host = (parsed.hostname or "").strip().lower()
    if not host:
        raise UnsafeUrlError("הכתובת לא כוללת שם מתחם תקין.")
    if host in _BLOCKED_HOSTNAMES or host.endswith(_BLOCKED_SUFFIXES):
        raise UnsafeUrlError("לא ניתן לגשת לכתובת פנימית של השרת.")

    # A literal IP can be checked directly; a hostname needs resolving.
    try:
        ipaddress.ip_address(host)
        candidates = [host]
    except ValueError:
        try:
            infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80))
        except socket.gaierror as exc:
            raise UnsafeUrlError(f"לא הצלחנו לזהות את שם המתחם {host}.") from exc
        candidates = [info[4][0] for info in infos]

    if not candidates:
        raise UnsafeUrlError(f"לא הצלחנו לזהות את שם המתחם {host}.")
    for address in candidates:
        if not _is_public_ip(address):
            raise UnsafeUrlError("לא ניתן לגשת לכתובות פנימיות או מקומיות של השרת.")
    return url


def safe_get(
    client: httpx.Client,
    url: str,
    *,
    max_redirects: int = 5,
    **kwargs,
) -> httpx.Response:
    """GET with manual redirect handling so every hop is validated.

    httpx's own `follow_redirects=True` would happily land on a private address after a
    public first hop, which is the standard way this guard gets bypassed.
    """
    current = assert_public_url(url)
    for _ in range(max_redirects + 1):
        response = client.get(current, follow_redirects=False, **kwargs)
        if response.status_code not in {301, 302, 303, 307, 308}:
            return response
        location = response.headers.get("location")
        if not location:
            return response
        current = assert_public_url(str(httpx.URL(current).join(location)))
    raise UnsafeUrlError("יותר מדי הפניות בכתובת הזו.")
