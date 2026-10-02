"""Where a post photo's subject is, and where text may sit (docs/design-dna.md, rule 2).

When a post gets its photo (the owner's, edited or as it is, or a generated one), one
cheap vision call (DESIGN_DNA_MODEL, Gemini Flash, the client the DNA uses) answers, in
fractions of the photo (0–1, origin top-left):

* `subject{x,y,w,h}`: the box around the main subject;
* `focal{x,y}`: the point a crop must keep;
* `safe_area{x,y,w,h}`: the largest calm area where a short headline can sit without
  covering the subject, or null when there is none (the renderer then sets the text on
  its own band, above or below the photo, never over it).

The answer is validated here (a safe area that overlaps the subject is no safe area) and
cached per business by the photo's content hash (`PhotoAnalysis`), so the same photo is
never analysed twice. It never fails a post: without an answer the design simply carries
no safe area. Off with PHOTO_ANALYSIS=false; a call that would spend is skipped when the
caller may not spend (browsing never spends), and a cached answer is still used.
"""

from __future__ import annotations

import hashlib
import logging

from app.config import get_settings
from app.services import colors as color_tools
from app.services.jsonutil import dumps, loads
from app.services.post_design import PHOTO_FIELDS, position_for_safe_area

log = logging.getLogger(__name__)

# A calm area smaller than this cannot hold a headline at phone size.
MIN_SAFE_W = 0.2
MIN_SAFE_H = 0.1
# Share of the safe area the subject may still cover (a soft edge, a shadow).
MAX_OVERLAP = 0.12
_MODEL_SIDE = 768

# The model answers on Gemini's native 0-1000 grid (its own boxes are measured that way, and
# asked for fractions it still answered 0-1000 in the live smoke); the server stores 0-1.
GRID = 1000
_INT = {"type": "integer", "minimum": 0, "maximum": GRID}
_BOX = {
    "type": "object",
    "properties": {"x": _INT, "y": _INT, "w": _INT, "h": _INT},
    "required": ["x", "y", "w", "h"],
}
SCHEMA = {
    "type": "object",
    "title": "PhotoLayout",
    "properties": {
        "subject": _BOX,
        "focal": {"type": "object", "properties": {"x": _INT, "y": _INT}, "required": ["x", "y"]},
        "has_safe_area": {"type": "boolean"},
        "safe_area": _BOX,
    },
    "required": ["subject", "focal", "has_safe_area", "safe_area"],
}
SYSTEM = "You are a photo editor laying out a social post. You answer only with the JSON asked for."
PROMPT = """
This photograph will carry a short Hebrew headline on an Instagram post. Measure it.
Coordinates are integers on a 0 to 1000 grid over the image, origin at the top-left
corner: x to the right, y downwards (1000 = the full width or height); w and h are the
width and height of a box on the same grid.

- subject: the box around the main subject (the product, the dish, the garment, the hands
  at work, the room's main feature). Include all of it.
- focal: the one point a crop must keep (the most important detail of the subject).
- safe_area: the largest calm rectangle where a headline could sit without covering any
  part of the subject or another important detail: an even surface, a wall, sky, a table,
  a soft background. Never over a face, text, a logo or a busy pattern. It must be at
  least 200 wide and 100 high on the grid. If there is no such area, has_safe_area is
  false and safe_area is all zeros.
""".strip()


def normalise_scale(raw, size: tuple[int, int] | None = None) -> dict:
    """The answer on a 0-1 scale: 0-1000 grid values divided by 1000; fractions kept as
    they are (every value at most 1); pixel values (over 1000) divided by the image size."""
    raw = raw if isinstance(raw, dict) else {}
    numbers = []
    for key in ("subject", "focal", "safe_area"):
        value = raw.get(key)
        if isinstance(value, dict):
            for item in value.values():
                try:
                    numbers.append(float(item))
                except (TypeError, ValueError):
                    pass
    peak = max(numbers) if numbers else 0.0
    if peak <= 1.0:
        return raw
    if peak <= GRID:
        scale_x = scale_y = float(GRID)
    elif size:
        scale_x, scale_y = float(size[0] or 1), float(size[1] or 1)
    else:
        return {"has_safe_area": False}

    def scaled(value: dict) -> dict:
        out = {}
        for key, item in value.items():
            try:
                out[key] = float(item) / (scale_x if key in ("x", "w") else scale_y)
            except (TypeError, ValueError):
                out[key] = item
        return out

    return {**raw, **{key: scaled(raw[key]) for key in ("subject", "focal", "safe_area") if isinstance(raw.get(key), dict)}}


def content_hash(data: bytes) -> str:
    return hashlib.sha256(data or b"").hexdigest()


def _box(value) -> dict | None:
    if not isinstance(value, dict):
        return None
    try:
        x, y, w, h = (float(value[key]) for key in ("x", "y", "w", "h"))
    except (KeyError, TypeError, ValueError):
        return None
    x, y = min(1.0, max(0.0, x)), min(1.0, max(0.0, y))
    w, h = min(1.0 - x, max(0.0, w)), min(1.0 - y, max(0.0, h))
    if w <= 0.01 or h <= 0.01:
        return None
    return {"x": round(x, 3), "y": round(y, 3), "w": round(w, 3), "h": round(h, 3)}


def _overlap(a: dict, b: dict) -> float:
    """Share of `a` covered by `b`."""
    left, right = max(a["x"], b["x"]), min(a["x"] + a["w"], b["x"] + b["w"])
    top, bottom = max(a["y"], b["y"]), min(a["y"] + a["h"], b["y"] + b["h"])
    if right <= left or bottom <= top:
        return 0.0
    return (right - left) * (bottom - top) / (a["w"] * a["h"])


def validate(raw) -> dict:
    """The model's answer as {subject, focal, safe_area}; anything unusable is None."""
    raw = raw if isinstance(raw, dict) else {}
    subject = _box(raw.get("subject"))
    focal = None
    if isinstance(raw.get("focal"), dict):
        try:
            focal = {key: round(min(1.0, max(0.0, float(raw["focal"][key]))), 3) for key in ("x", "y")}
        except (KeyError, TypeError, ValueError):
            focal = None
    if focal is None and subject:
        focal = {"x": round(subject["x"] + subject["w"] / 2, 3), "y": round(subject["y"] + subject["h"] / 2, 3)}
    safe = _box(raw.get("safe_area")) if raw.get("has_safe_area") is not False else None
    if safe and (safe["w"] < MIN_SAFE_W or safe["h"] < MIN_SAFE_H):
        safe = None
    if safe and subject and _overlap(safe, subject) > MAX_OVERLAP:
        safe = None
    return {"subject": subject, "focal": focal, "safe_area": safe}


def _ask(data: bytes, mime: str) -> dict:
    from app.services.gemini import generate_json

    settings = get_settings()
    image = color_tools.to_model_jpeg(data, max_width=_MODEL_SIDE, quality=82)
    blob = (image, "image/jpeg") if image else (data, mime or "image/jpeg")
    text = generate_json(
        model=settings.photo_analysis_model or settings.design_dna_model,
        prompt=PROMPT,
        schema=SCHEMA,
        thinking_level="LOW",
        images=[blob],
        system=SYSTEM,
        attempts=2,
    )
    parsed = loads(text, {})
    return normalise_scale(parsed if isinstance(parsed, dict) else {}, color_tools.image_size(blob[0]))


def analyse(db, business_id: int, data: bytes, mime: str, *, allow_model: bool = True) -> dict | None:
    """The photo's layout ({subject, focal, safe_area, photo_hash}), cached by content hash.
    None when it is not known and may not (or could not) be asked."""
    if not data:
        return None
    digest = content_hash(data)
    row = None
    if db is not None and business_id:
        from app.models import PhotoAnalysis

        row = (
            db.query(PhotoAnalysis)
            .filter(PhotoAnalysis.business_id == business_id, PhotoAnalysis.content_hash == digest)
            .first()
        )
    if row is not None:
        cached = loads(row.result_json, {}) or {}
        return {**validate({**cached, "has_safe_area": cached.get("safe_area") is not None}), "photo_hash": digest}
    settings = get_settings()
    if not settings.photo_analysis or not allow_model:
        return None
    try:
        result = validate(_ask(data, mime))
    except Exception as exc:  # the layout is a nicety: never fail the post over it
        log.warning("photo analysis: no answer for business %s: %s", business_id, exc)
        return None
    if db is not None and business_id:
        from app.models import PhotoAnalysis

        db.add(PhotoAnalysis(business_id=business_id, content_hash=digest, result_json=dumps(result),
                             model=(settings.photo_analysis_model or settings.design_dna_model)[:80]))
        db.flush()
    return {**result, "photo_hash": digest}


def attach(db, business_id: int, post: dict, data: bytes | None, mime: str = "", *, allow_model: bool = True) -> dict | None:
    """Put the photo's layout on the post's design, in place. An earlier photo's layout is
    always removed first, so a new photo never inherits the old one's calm area."""
    design = post.get("design") if isinstance(post.get("design"), dict) else None
    if design is not None:
        for key in PHOTO_FIELDS:
            design.pop(key, None)
    if not data or design is None:
        return None
    result = analyse(db, business_id, data, mime, allow_model=allow_model)
    if result is None:
        return None
    design["safe_area"] = result["safe_area"]
    design["focal"] = result["focal"]
    design["subject"] = result["subject"]
    design["photo_hash"] = result["photo_hash"][:16]
    composition = design.get("composition")
    if result["safe_area"] and composition:
        from app.services.dna_library import COMPOSITIONS

        if composition in COMPOSITIONS and COMPOSITIONS[composition].photo:
            design["text_position"] = position_for_safe_area(result["safe_area"], composition,
                                                             design.get("text_position"))
    return result
