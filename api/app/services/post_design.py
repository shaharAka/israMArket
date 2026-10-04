"""Each post's design, drawn from its business's Design DNA (docs/design-dna.md).

Every post carries `design: {composition, crop, text_position, text_mode}` and, once its
photo is analysed (services/photo_analysis.py), `safe_area`, `focal` and `subject`:

* `composition`: one of the DNA's 3–4 compositions, rotated across the month so two
  neighbouring posts never share one (the grid looks designed, not repeated).
* `crop`: the card frame, from the post's format: "9:16" for a reel or a story, "4:5"
  otherwise.
* `text_position`: where the headline sits, one the composition allows (top, center,
  bottom, start, end; start is the reading start, the right edge in Hebrew). Once the
  photo is analysed, the allowed position closest to the photo's calm area.
* `text_mode` (v2, "one message per post"): `photo_only` (no text on the image, or one
  word), `headline` (the headline and at most one short line, on the calm area) or
  `type_led` (the text is the picture, a photo-free composition). Assigned across the
  month by the DNA's `mix` (photo-led by default); a price post is a headline post.
* `safe_area{x,y,w,h}` (0–1 of the photo, the largest calm area where text may sit; null
  when there is none, and then the text goes on its own band, not over the photo),
  `focal{x,y}` (the point a crop keeps) and `subject{x,y,w,h}`.

The DNA replaces the old per-post `overlay_theme` choice. Posts written before it keep
their theme, and every read maps it onto the closest composition (`legacy_design`).
"""

from __future__ import annotations

from app.services.dna_library import (
    COMPOSITIONS,
    LEGACY_THEME_COMPOSITION,
    PHOTO_FREE_COMPOSITIONS,
    TEXT_MODES,
)

VERTICAL_FORMATS = frozenset({"reel", "story"})
# Only for a business that has no DNA yet (it is created at the end of the site scan).
DEFAULT_COMPOSITIONS = ("full_bleed", "inset_frame", "split")
DEFAULT_MIX = {"photo_only": 0.5, "headline": 0.4, "type_led": 0.1}
# Mix types whose post shows a real product, place or person (connected_posts uses the
# same set): those never get the photo-free composition.
_PRODUCT_MIX = frozenset({"product", "offer", "behind_scenes", "social_proof"})
# What the photo analysis adds to a design. Kept through a composition change: the photo
# is the same (docs/design-dna.md, "a composition change keeps the photo").
PHOTO_FIELDS = ("safe_area", "focal", "subject", "photo_hash")


def crop_for(fmt: str | None) -> str:
    return "9:16" if (fmt or "") in VERTICAL_FORMATS else "4:5"


def _product_like(post: dict) -> bool:
    return bool(post.get("mix_type") in _PRODUCT_MIX or post.get("featured_item_id") or post.get("featured_item_name"))


def _fits(composition: str, post: dict) -> bool:
    comp = COMPOSITIONS.get(composition)
    if comp is None:
        return False
    if crop_for(post.get("format")) not in comp.crops:
        return False
    if composition in PHOTO_FREE_COMPOSITIONS and _product_like(post):
        return False
    return True


def _text_position(composition: str, preferred: str | None, turn: int) -> str:
    allowed = COMPOSITIONS[composition].text_positions
    if preferred in allowed:
        return preferred
    return allowed[turn % len(allowed)]


def _mode_for(composition: str, wanted: str | None) -> str:
    modes = COMPOSITIONS[composition].text_modes
    if wanted in modes:
        return wanted
    return "headline" if "headline" in modes else modes[0]


def _box(value, *, point: bool = False) -> dict | None:
    if not isinstance(value, dict):
        return None
    keys = ("x", "y") if point else ("x", "y", "w", "h")
    try:
        out = {key: round(min(1.0, max(0.0, float(value[key]))), 3) for key in keys}
    except (KeyError, TypeError, ValueError):
        return None
    if not point and (out["w"] <= 0 or out["h"] <= 0):
        return None
    return out


def photo_fields(design) -> dict:
    """The photo analysis carried by a design, validated (safe_area may be None)."""
    if not isinstance(design, dict) or "photo_hash" not in design:
        return {}
    return {
        "safe_area": _box(design.get("safe_area")),
        "focal": _box(design.get("focal"), point=True),
        "subject": _box(design.get("subject")),
        "photo_hash": str(design.get("photo_hash") or "")[:64],
    }


def make_design(composition: str, post: dict, *, text_position: str | None = None, turn: int = 0,
                text_mode: str | None = None, photo: dict | None = None, by_hand: bool = False) -> dict:
    design = {
        "composition": composition,
        "crop": crop_for(post.get("format")),
        "text_position": _text_position(composition, text_position, turn),
    }
    if text_mode:
        design["text_mode"] = _mode_for(composition, text_mode)
    if by_hand:
        design["by_hand"] = True
    if photo:
        design.update(photo)
    return design


def clean_design(design, post: dict, *, by_hand: bool = False) -> dict | None:
    """A stored or submitted design, made valid for this post, or None if it is not one.
    v2 fields (`text_mode`, the photo analysis, `by_hand`) are kept when present and valid.

    A vertical post cannot use a feed-only composition, unless the owner picked it by hand
    (docs/design-dna.md: `editorial_column` at 9:16 only when picked by hand); that choice
    is stored as `by_hand: true`, so every later read keeps it."""
    if not isinstance(design, dict):
        return None
    composition = design.get("composition")
    if composition not in COMPOSITIONS:
        return None
    by_hand = by_hand or design.get("by_hand") is True
    needs_hand = crop_for(post.get("format")) not in COMPOSITIONS[composition].crops
    if needs_hand and not by_hand:
        return None
    mode = design.get("text_mode") if design.get("text_mode") in TEXT_MODES else None
    return make_design(composition, post, text_position=design.get("text_position"), text_mode=mode,
                       photo=photo_fields(design), by_hand=needs_hand)


def legacy_design(post: dict) -> dict | None:
    """The closest composition to an old post's `overlay_theme`, or None without one."""
    theme = post.get("overlay_theme")
    if not theme:
        return None
    composition, position = LEGACY_THEME_COMPOSITION.get(theme, ("full_bleed", "bottom"))
    if crop_for(post.get("format")) not in COMPOSITIONS[composition].crops:
        composition, position = "full_bleed", "bottom"
    return make_design(composition, post, text_position=position)


def dna_compositions(dna: dict | None) -> tuple[str, ...]:
    comps = [c for c in ((dna or {}).get("compositions") or []) if c in COMPOSITIONS]
    unique = tuple(dict.fromkeys(comps))
    return unique or DEFAULT_COMPOSITIONS


def dna_mix(dna: dict | None) -> dict[str, float]:
    mix = (dna or {}).get("mix")
    if not isinstance(mix, dict):
        mix = DEFAULT_MIX
    try:
        values = {mode: max(0.0, float(mix.get(mode) or 0)) for mode in TEXT_MODES}
    except (TypeError, ValueError):
        values = dict(DEFAULT_MIX)
    if not any(c in PHOTO_FREE_COMPOSITIONS for c in dna_compositions(dna)):
        values["headline"] += values["type_led"]
        values["type_led"] = 0.0
    total = sum(values.values()) or 1.0
    return {mode: value / total for mode, value in values.items()}


def _seed(dna: dict | None) -> int:
    try:
        return int((dna or {}).get("seed") or 0)
    except (TypeError, ValueError):
        return 0


def _mode_of(post) -> str | None:
    design = post.get("design") if isinstance(post, dict) else None
    mode = design.get("text_mode") if isinstance(design, dict) else None
    return mode if mode in TEXT_MODES else None


def pick_text_mode(post: dict, dna: dict | None, earlier: list[str | None], *, previous: str | None = None,
                   composition: str | None = None) -> str:
    """The post's text mode: what its own content asks for first (no overlay -> photo only,
    a price -> headline), else the mode furthest behind the DNA's mix so far this month."""
    allowed = list(COMPOSITIONS[composition].text_modes) if composition in COMPOSITIONS else list(TEXT_MODES)
    if composition is None:
        typed_fits = any(_fits(c, post) for c in dna_compositions(dna) if c in PHOTO_FREE_COMPOSITIONS)
        if not typed_fits or previous == "type_led":
            allowed = [mode for mode in allowed if mode != "type_led"]
    if post.get("has_overlay") is False and "photo_only" in allowed:
        return "photo_only"
    if post.get("price") and "headline" in allowed:
        return "headline"
    if len(allowed) == 1:
        return allowed[0]
    mix = dna_mix(dna)
    counts = {mode: sum(1 for m in earlier if m == mode) for mode in TEXT_MODES}
    n = len(earlier) + 1
    seed = _seed(dna)
    # A per-business phase, so two businesses with the same mix do not start alike.
    phase = {"photo_only": (seed % 7) / 20, "headline": ((seed // 7) % 7) / 20, "type_led": 0.0}

    def deficit(mode: str) -> float:
        return mix[mode] * n + phase[mode] - counts[mode]

    return max(allowed, key=lambda mode: (deficit(mode), mix[mode]))


def rotate(post: dict, index: int, dna: dict | None, previous: str | None, following: str | None = None,
           text_mode: str | None = None) -> dict:
    """The DNA composition for the post at `index`, never the same as its neighbours'.

    The rotation starts at a point set by the DNA's seed, so two businesses with the same
    composition set still do not line up post for post. A type-led post gets the DNA's
    photo-free composition; a photo post one whose layout carries its text mode.
    """
    comps = dna_compositions(dna)
    start = (_seed(dna) + index) % len(comps)
    ordered = comps[start:] + comps[:start]
    fitting = [c for c in ordered if _fits(c, post)]
    if text_mode == "type_led":
        typed = [c for c in fitting if c in PHOTO_FREE_COMPOSITIONS]
        if typed:
            fitting = typed
        else:
            text_mode = "headline"
    if text_mode in ("photo_only", "headline"):
        photo = [c for c in fitting if c not in PHOTO_FREE_COMPOSITIONS]
        with_mode = [c for c in photo if text_mode in COMPOSITIONS[c].text_modes]
        # Neighbours never share a composition, even when only one of the DNA's layouts
        # carries this text mode: then the post takes the next layout and its mode.
        apart = [c for c in with_mode if c != previous and c != following] or \
            [c for c in photo if c != previous and c != following]
        fitting = apart + [c for c in (with_mode or photo or fitting) if c not in apart]
    choice = next((c for c in fitting if c != previous and c != following), None)
    if choice is None:
        choice = next((c for c in fitting if c != previous), None)
    if choice is None:
        choice = fitting[0] if fitting else next(
            (c for c in ("full_bleed", "inset_frame") if _fits(c, post)), "full_bleed"
        )
    return make_design(choice, post, turn=_seed(dna) // 7 + index, text_mode=text_mode or "headline")


def _composition_of(post) -> str | None:
    design = post.get("design") if isinstance(post, dict) else None
    return design.get("composition") if isinstance(design, dict) else None


def _with_mode(design: dict, post: dict, dna: dict | None, earlier: list[str | None], previous_mode: str | None) -> dict:
    if design.get("text_mode") in TEXT_MODES:
        return design
    mode = pick_text_mode(post, dna, earlier, previous=previous_mode, composition=design["composition"])
    return {**design, "text_mode": _mode_for(design["composition"], mode)}


def _design_for(posts: list, index: int, dna: dict | None, earlier: list[str | None],
                previous: str | None, following: str | None) -> dict:
    post = posts[index]
    previous_mode = earlier[-1] if earlier else None
    kept = clean_design(post.get("design"), post)
    if kept is not None:
        return _with_mode(kept, post, dna, earlier, previous_mode)
    legacy = legacy_design(post)
    if legacy is not None:
        return _with_mode(legacy, post, dna, earlier, previous_mode)
    mode = pick_text_mode(post, dna, earlier, previous=previous_mode)
    return rotate(post, index, dna, previous, following, text_mode=mode)


def assign_designs(posts: list, dna: dict | None) -> list:
    """Give every post that has none its design, in place. Returns the list.

    A post with a valid design keeps it (the owner may have chosen it), and gets a text
    mode if it has none. A post that still carries an old `overlay_theme` (a sample post
    chosen at /start) gets that layout's closest composition; any other post gets the
    DNA's next composition and the text mode the month's mix calls for.
    """
    earlier: list[str | None] = []
    for index, post in enumerate(posts or []):
        if not isinstance(post, dict):
            earlier.append(None)
            continue
        previous = _composition_of(posts[index - 1]) if index > 0 else None
        following = _composition_of(posts[index + 1]) if index + 1 < len(posts) else None
        post["design"] = _design_for(posts, index, dna, earlier, previous, following)
        earlier.append(post["design"].get("text_mode"))
    return posts


def view_designs(posts: list, dna: dict | None) -> list[dict | None]:
    """The design every reader sees for each post, without changing what is stored.

    Old posts get their mapped layout, posts with neither get the DNA rotation; every
    design carries a text mode.
    """
    out: list[dict | None] = []
    earlier: list[str | None] = []
    previous: str | None = None
    for index, post in enumerate(posts or []):
        if not isinstance(post, dict):
            out.append(None)
            earlier.append(None)
            previous = None
            continue
        design = _design_for(posts, index, dna, earlier, previous, None)
        out.append(design)
        earlier.append(design.get("text_mode"))
        previous = design["composition"]
    return out


def ensure_post_design(posts: list, index: int, dna: dict | None, *, composition: str = "",
                       text_position: str = "", prefer_dna: bool = False, by_hand: bool = False) -> dict:
    """Store the design of one post (before its image is made) and return it.

    `composition` is an explicit choice (the editor's design step; `by_hand` when the owner
    picked it, which may put a feed-only layout on a story); `prefer_dna` moves an old post
    off its mapped layout onto the DNA (an explicit redesign). The photo analysis stays:
    the photo does not change with the layout.
    """
    post = posts[index]
    previous = _composition_of(posts[index - 1]) if index > 0 else None
    following = _composition_of(posts[index + 1]) if index + 1 < len(posts) else None
    earlier = [_mode_of(p) for p in posts[:index]]
    previous_mode = earlier[-1] if earlier else None
    stored = post.get("design") if isinstance(post.get("design"), dict) else {}
    photo = photo_fields(stored)
    design = None
    if composition:
        design = clean_design({"composition": composition, "text_position": text_position,
                               "text_mode": stored.get("text_mode")}, post, by_hand=by_hand)
    if design is None:
        design = clean_design(stored, post)
        if design is not None and prefer_dna and design["composition"] not in dna_compositions(dna):
            design = None
    if design is None and not prefer_dna:
        design = legacy_design(post)
    if design is None:
        mode = pick_text_mode(post, dna, earlier, previous=previous_mode)
        design = rotate(post, index, dna, previous, following, text_mode=mode)
    design = _with_mode(design, post, dna, earlier, previous_mode)
    if photo:
        design.update(photo)
    post["design"] = design
    return design


def post_composition(post: dict) -> str:
    design = clean_design(post.get("design"), post) or legacy_design(post)
    return design["composition"] if design else "full_bleed"


def post_needs_photo(post: dict) -> bool:
    """False for a post whose card draws no photograph (no image is made for it)."""
    return post_composition(post) not in PHOTO_FREE_COMPOSITIONS


def sync_text_mode(design: dict, has_overlay: bool) -> dict:
    """The owner's overlay switch in the editor decides the text mode, in place: off is
    photo only (when the composition can carry a photo alone); on is a headline."""
    composition = design.get("composition")
    if composition not in COMPOSITIONS:
        return design
    modes = COMPOSITIONS[composition].text_modes
    current = design.get("text_mode")
    if composition in PHOTO_FREE_COMPOSITIONS:
        design["text_mode"] = "type_led"
    elif not has_overlay and "photo_only" in modes:
        design["text_mode"] = "photo_only"
    elif has_overlay and current in (None, "photo_only"):
        design["text_mode"] = "headline"
    elif current not in modes:
        design["text_mode"] = _mode_for(composition, current)
    return design


def position_for_safe_area(safe_area: dict | None, composition: str, current: str | None = None) -> str:
    """The composition's allowed text position nearest the photo's calm area."""
    allowed = COMPOSITIONS[composition].text_positions
    if not safe_area:
        return current if current in allowed else allowed[0]
    cx = safe_area["x"] + safe_area["w"] / 2
    cy = safe_area["y"] + safe_area["h"] / 2
    wanted = []
    wanted.append("top" if cy < 0.4 else ("bottom" if cy > 0.6 else "center"))
    # Hebrew reads from the right: "start" is the right-hand side.
    if cx > 0.6:
        wanted.append("start")
    elif cx < 0.4:
        wanted.append("end")
    for position in wanted:
        if position in allowed:
            return position
    return current if current in allowed else allowed[0]
