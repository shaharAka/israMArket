"""Shared fixtures for the Design DNA tests: a throwaway database, businesses with real-looking
signals, a media folder, and stand-ins for every model call. Nothing here touches the network.
"""
import _test_env  # noqa: F401  (must come before any `app` import)

import shutil
import struct
import tempfile
import zlib
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.deps import get_current_user
from app.main import app
from app.models import Business, User
from app.services import assets as assets_service
from app.services import images
from app.services.jsonutil import dumps

WARM = [
    {"hex": "#c0643b", "role": "primary", "name": "טרקוטה"},
    {"hex": "#e0a43a", "role": "accent", "name": "חרדל"},
    {"hex": "#f7f0e6", "role": "background", "name": "שמנת"},
    {"hex": "#2b211c", "role": "ink", "name": "קפה שחור"},
    {"hex": "#8a5a44", "role": "secondary", "name": "קינמון"},
]
FRESH = [
    {"hex": "#2f7d5b", "role": "primary", "name": "ירוק עלה"},
    {"hex": "#b7d26a", "role": "accent", "name": "ליים"},
    {"hex": "#f2f6ef", "role": "background", "name": "לבן ירקרק"},
    {"hex": "#1d2b24", "role": "ink", "name": "ירוק לילה"},
]


def png_bytes(width: int = 8, height: int = 8, rgb=(200, 60, 30)) -> bytes:
    raw = b"".join(b"\x00" + bytes(rgb) * width for _ in range(height))

    def chunk(tag: bytes, payload: bytes) -> bytes:
        body = tag + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def profile(name: str, palette=None, fonts=(), typography="", photography="", logo=True, real_photos=()):
    return dumps(
        {
            "brand_language": {
                "business_name": name,
                "palette": list(palette or WARM),
                "typography": {"primary": typography, "mood": "חם וביתי"},
                "visual_style": "חומרים טבעיים ואור יום",
                "photography": photography or "צילומים קרובים של המוצר באור יום",
                "voice": "חם וישיר",
                "audience": "שכונה",
                "logo_description": "חותמת עגולה עם שם העסק" if logo else "",
                "logo_url": "https://example.test/logo.png" if logo else "",
            },
            "raw": {"fonts": list(fonts), "color_evidence": {"logo": [{"hex": (palette or WARM)[0]["hex"], "share": 0.4}]}},
            "real_photos": list(real_photos),
            "photos_checked": True,
        }
    )


class DnaTestCase:
    """Mixin: call `setUp_dna()` from setUp."""

    def setUp_dna(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="isramarket-dna-"))
        self.engine = create_engine(f"sqlite:///{self.tmp / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        self.media = self.tmp / "media"
        self.media.mkdir()
        self._patches = [
            mock.patch.object(images, "media_root", return_value=self.media),
            mock.patch.object(assets_service, "media_root", return_value=self.media),
        ]
        for patch in self._patches:
            patch.start()
        self.users = 0
        self.addCleanup(self._cleanup_dna)

    def _cleanup_dna(self):
        for patch in self._patches:
            patch.stop()
        app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def add_business(self, name: str, field: str = "food", offerings: str = "", **signals) -> Business:
        self.users += 1
        user = User(email=f"owner{self.users}@example.com", password_hash="x", full_name="בעלים")
        self.db.add(user)
        self.db.flush()
        business = Business(
            user_id=user.id,
            name=name,
            business_type=field,
            offerings=offerings,
            website_url=f"https://b{self.users}.example",
            scraped_profile_json=profile(name, **signals),
        )
        self.db.add(business)
        self.db.commit()
        self.db.refresh(business)
        return business

    def client_for(self, business: Business) -> TestClient:
        def override_db():
            yield self.db

        owner = self.db.get(User, business.user_id)
        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_user] = lambda: owner
        return TestClient(app)


class FakeDnaModel:
    """Stands in for the DNA model call. Answers the same genes for every business when
    the schema allows them (the worst case for uniqueness), and records every call."""

    PREFERRED = {
        "display": "frank-ruhl-libre",
        "text": "assistant",
        "motif": "scalloped_edge",
        "signature": "corner_mark",
        "compositions": ["arch_window", "editorial_column", "ticket", "split"],
    }

    def __init__(self, photo=None, rationale="הסגנון שלכם חם וביתי, כמו המטבח שלכם בבוקר"):
        self.calls: list[dict] = []
        self.photo = photo or {
            "grade": "warm, lifted blacks",
            "light": "side window light from the left",
            "angle": "45 degrees, 50mm",
            "props": ["the shop's own enamel tray"],
            "background": "the shop's tiled counter",
            "never": ["plastic wrap"],
        }
        self.rationale = rationale

    def __call__(self, prompt, schema, images):
        props = schema["properties"]
        enum = lambda gene, key: props[gene]["properties"][key]["enum"]  # noqa: E731
        displays, texts = enum("type", "display"), enum("type", "text")
        motifs, sigs = enum("motif", "kind"), enum("signature", "kind")
        comps = props["compositions"]["items"]["enum"]
        self.calls.append({"prompt": prompt, "schema": schema, "images": images,
                           "display": displays, "text": texts, "motif": motifs, "compositions": comps})
        pick = lambda pref, allowed: pref if pref in allowed else allowed[0]  # noqa: E731
        return {
            "type": {"display": pick(self.PREFERRED["display"], displays), "display_weight": 700,
                     "text": pick(self.PREFERRED["text"], texts), "text_weight": 400,
                     "headline_case": "sentence", "scale": "large"},
            "colors": {"ink": "#2b211c", "paper": "#f7f0e6", "accent": "#c0643b", "accent_2": "#e0a43a",
                       "on_photo": "#f7f0e6", "tint": "#f3e3d3"},
            "compositions": [c for c in self.PREFERRED["compositions"] if c in comps] or comps[:4],
            "motif": {"kind": pick(self.PREFERRED["motif"], motifs), "color": "accent", "density": "low"},
            "signature": {"kind": pick(self.PREFERRED["signature"], sigs), "use_logo": True},
            "photo": dict(self.photo),
            "copy": {"price_style": "tag", "cta_style": "underline"},
            "rationale_he": self.rationale,
        }
