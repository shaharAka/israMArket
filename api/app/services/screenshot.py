"""One rendered screenshot of a business's site, when a Chrome binary is available.

The static HTML of a website-builder site says little about how it looks: the colours
are the builder's, the fonts are fallbacks, and the layout only exists after JavaScript
runs. A 1280x900 screenshot of the rendered homepage is the best single piece of evidence
of what a customer sees, so the brand model gets it first.

Optional by design. No Chrome (the production API image ships none today), a slow site,
or anything else going wrong returns None and the scan carries on with the logo and the
photos — a screenshot is never a reason for a scan to fail.

Security. The URL has already passed `netguard`, but Chrome fetches far more than one URL:
every stylesheet, image, script, redirect and XHR the page asks for. Each of those could
point at the metadata endpoint or the private network, and Chrome would not ask netguard.
So Chrome runs with its proxy set to a tiny in-process CONNECT proxy that resolves each
host itself, refuses any non-public address (loopback included: `<-loopback>` stops
Chrome's implicit localhost bypass) and then connects to the address it validated, so a
DNS answer cannot change between the check and the connection. Only HTTPS (CONNECT to
port 443) is proxied; plain-HTTP subresources are refused, and a plain-HTTP site gets no
screenshot. UDP (WebRTC) is disabled, since it would not go through the proxy.
"""

from __future__ import annotations

import os
import select
import shutil
import signal
import socket
import socketserver
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from urllib.parse import urlparse

from app.config import get_settings
from app.services import colors
from app.services.netguard import UnsafeUrlError, _is_public_ip, assert_public_url

WIDTH, HEIGHT = 1280, 900
MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
_LINUX_NAMES = ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable")
# Everything Chrome may download for one screenshot, across all connections.
_MAX_PROXY_BYTES = 40_000_000


def find_chrome() -> str | None:
    """CHROME_PATH, else the macOS default install, else a Chromium on PATH."""
    settings = get_settings()
    configured = (settings.chrome_path or "").strip()
    candidates = [configured] if configured else [MAC_CHROME]
    if not configured:
        candidates.extend(filter(None, (shutil.which(name) for name in _LINUX_NAMES)))
    for path in candidates:
        if path and os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    return None


def _resolve_public(host: str, port: int) -> str | None:
    """A validated public address for `host`, or None."""
    try:
        assert_public_url(f"https://{host}:{port}/")
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except (UnsafeUrlError, OSError, ValueError):
        return None
    addresses = [info[4][0] for info in infos]
    if not addresses or not all(_is_public_ip(address) for address in addresses):
        return None
    return addresses[0]


class _GuardProxy(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, deadline: float):
        self.deadline = deadline
        self.bytes_moved = 0
        self.lock = threading.Lock()
        self.refused: list[str] = []
        super().__init__(("127.0.0.1", 0), _GuardHandler)


class _GuardHandler(socketserver.BaseRequestHandler):
    def handle(self) -> None:  # noqa: C901 - one linear protocol exchange
        server: _GuardProxy = self.server  # type: ignore[assignment]
        client = self.request
        client.settimeout(5)
        head = b""
        try:
            while b"\r\n\r\n" not in head and len(head) < 16_384:
                chunk = client.recv(4096)
                if not chunk:
                    return
                head += chunk
        except OSError:
            return
        line = head.split(b"\r\n", 1)[0].decode("latin-1", "ignore")
        parts = line.split()
        if len(parts) < 2 or parts[0].upper() != "CONNECT":
            server.refused.append(line[:80])
            self._reply(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
            return
        host, _, port_text = parts[1].rpartition(":")
        host = host.strip("[]")
        if port_text != "443" or not host:
            server.refused.append(parts[1][:80])
            self._reply(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
            return
        address = _resolve_public(host, 443)
        if address is None:
            server.refused.append(host[:80])
            self._reply(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
            return
        try:
            upstream = socket.create_connection((address, 443), timeout=5)
        except OSError:
            self._reply(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n")
            return
        with upstream:
            if not self._reply(b"HTTP/1.1 200 Connection Established\r\n\r\n"):
                return
            sockets = [client, upstream]
            while time.monotonic() < server.deadline:
                try:
                    readable, _, _ = select.select(sockets, [], [], 0.5)
                except (OSError, ValueError):
                    return
                for sock in readable:
                    try:
                        data = sock.recv(65536)
                    except OSError:
                        return
                    if not data:
                        return
                    with server.lock:
                        server.bytes_moved += len(data)
                        over = server.bytes_moved > _MAX_PROXY_BYTES
                    if over:
                        return
                    other = upstream if sock is client else client
                    try:
                        other.sendall(data)
                    except OSError:
                        return

    def _reply(self, payload: bytes) -> bool:
        try:
            self.request.sendall(payload)
            return True
        except OSError:
            return False


def _chrome_args(chrome: str, url: str, out: Path, profile: Path, proxy_port: int) -> list[str]:
    settings = get_settings()
    args = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--mute-audio",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-breakpad",
        "--disable-domain-reliability",
        "--password-store=basic",
        "--use-mock-keychain",
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        f"--proxy-server=http://127.0.0.1:{proxy_port}",
        "--proxy-bypass-list=<-loopback>",
        f"--user-data-dir={profile}",
        f"--window-size={WIDTH},{HEIGHT}",
        "--lang=he-IL",
        # Virtual time lets the page settle (fonts, hero images, client rendering) and
        # then captures, instead of guessing a sleep.
        "--virtual-time-budget=6000",
        f"--screenshot={out}",
    ]
    if settings.chrome_no_sandbox:
        args.append("--no-sandbox")
    args.append(url)
    return args


def capture_site(url: str, timeout: float | None = None) -> bytes | None:
    """A PNG of the rendered page at 1280x900, or None (no Chrome, unsafe, slow, failed)."""
    settings = get_settings()
    if not settings.site_screenshot:
        return None
    chrome = find_chrome()
    if not chrome:
        return None
    parsed = urlparse(url)
    if parsed.scheme != "https":
        return None
    try:
        assert_public_url(url)
    except UnsafeUrlError:
        return None

    budget = float(timeout if timeout is not None else settings.screenshot_timeout_seconds)
    deadline = time.monotonic() + budget
    proxy = _GuardProxy(deadline + 1)
    thread = threading.Thread(target=proxy.serve_forever, kwargs={"poll_interval": 0.2}, daemon=True)
    thread.start()
    try:
        with tempfile.TemporaryDirectory(prefix="isramarket-shot-") as tmp:
            out = Path(tmp) / "shot.png"
            profile = Path(tmp) / "profile"
            process = subprocess.Popen(
                _chrome_args(chrome, url, out, profile, proxy.server_address[1]),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            # Branded Chrome on macOS writes the screenshot and then lingers (it wakes its
            # updater), so wait for the file, not for the process to exit.
            data = _wait_for_file(process, out, deadline)
            _kill(process)
            return data if data and len(data) > 5_000 else None
    except OSError:
        return None
    finally:
        proxy.shutdown()
        proxy.server_close()


def attach_screenshot(scraped: dict, png: bytes | None) -> dict:
    """Add a captured screenshot to a scrape: a compact JPEG for the vision model and its
    measured colours as the first line of colour evidence. No-op for None."""
    if not png:
        return scraped
    jpeg = colors.to_model_jpeg(png)
    if jpeg:
        scraped["screenshot"] = {"bytes": jpeg, "mime": "image/jpeg"}
    evidence = scraped.setdefault("color_evidence", {})
    evidence["screenshot"] = colors.dominant_colors(png, max_colors=6, neutral_share=0.2)
    return scraped


def _wait_for_file(process: subprocess.Popen, out: Path, deadline: float) -> bytes | None:
    """The screenshot once its size has been stable for one poll, or None at the deadline."""
    last_size = -1
    while time.monotonic() < deadline:
        if out.exists():
            size = out.stat().st_size
            if size > 0 and size == last_size:
                return out.read_bytes()
            last_size = size
        elif process.poll() is not None:
            return None  # Chrome exited without writing anything
        time.sleep(0.25)
    return None


def _kill(process: subprocess.Popen) -> None:
    # The whole process group: Chrome's renderer and GPU helpers outlive a killed parent.
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except (OSError, ProcessLookupError):
        try:
            process.kill()
        except OSError:
            pass
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        pass
