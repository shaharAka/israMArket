"""Each post's design, drawn from its business's Design DNA (docs/design-dna.md).

Every post carries `design: {composition, crop, text_position}`:

* `composition`: one of the DNA's 3–4 compositions, rotated across the month so two
  neighbouring posts never share one (the grid looks designed, not repeated).
* `crop`: the card frame, from the post's format: "9:16" for a reel or a story, "4:5"
  otherwise.
* `text_position`: where the headline sits, one the composition allows (top, center,
  bottom, start, end; start is the reading start, the right edge in Hebrew).

The DNA replaces the old per-post `overlay_theme` choice. Posts written before it keep
their theme, and every read maps it onto the closest composition (`legacy_design`).
"""

from __future__ import annotations

from app.services.dna_library import (
    COMPOSITIONS,
    LEGACY_THEME_COMPOSITION,
    PHOTO_FREE_COMPOSITIONS,
)

VERTICAL_FORMATS = frozenset({"reel", "story"})
# Only for a business that has no DNA yet (it is created at the end of the site scan).
DEFAULT_COMPOSITIONS = ("full_bleed", "inset_frame", "split")
# Mix types whose post shows a real product, place or person (connected_posts uses the
# same set): those never get the photo-free composition.
_PRODUCT_MIX = frozenset({"product", "offer", "behind_scenes", "social_proof"})


def crop_for(fmt: str | None) -> str:
    return "9:16" if (fmt or "") in VERTICAL_FORMATS else "4:5"


def _fits(composition: str, post: dict) -> bool:
    comp = COMPOSITIONS.get(composition)
    if comp is None:
        return False
    if crop_for(post.get("format")) not in comp.crops:
        return False
    if composition in PHOTO_FREE_COMPOSITIONS and (
        post.get("mix_type") in _PRODUCT_MIX or post.get("featured_item_id") or post.get("featured_item_name")
    ):
        return False
    return True


def _text_position(composition: str, preferred: str | None, turn: int) -> str:
    allowed = COMPOSITIONS[composition].text_positions
    if preferred in allowed:
        return preferred
    return allowed[turn % len(allowed)]


def make_design(composition: str, post: dict, *, text_position: str | None = None, turn: int = 0) -> dict:
    return {
        "composition": composition,
        "crop": crop_for(post.get("format")),
        "text_position": _text_position(composition, text_position, turn),
    }


def clean_design(design, post: dict) -> dict | None:
    """A stored or submitted design, made valid for this post, or None if it is not one."""
    if not isinstance(design, dict):
        return None
    composition = design.get("composition")
    if composition not in COMPOSITIONS:
        return None
    # A vertical post cannot use a feed-only composition.
    if crop_for(post.get("format")) not in COMPOSITIONS[composition].crops:
        return None
    return make_design(composition, post, text_position=design.get("text_position"))


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


def _seed(dna: dict | None) -> int:
    try:
        return int((dna or {}).get("seed") or 0)
    except (TypeError, ValueError):
        return 0


def rotate(post: dict, index: int, dna: dict | None, previous: str | None, following: str | None = None) -> dict:
    """The DNA composition for the post at `index`, never the same as its neighbours'.

    The rotation starts at a point set by the DNA's seed, so two businesses with the same
    composition set still do not line up post for post.
    """
    comps = dna_compositions(dna)
    start = (_seed(dna) + index) % len(comps)
    ordered = comps[start:] + comps[:start]
    fitting = [c for c in ordered if _fits(c, post)]
    choice = next((c for c in fitting if c != previous and c != following), None)
    if choice is None:
        choice = next((c for c in fitting if c != previous), None)
    if choice is None:
        choice = fitting[0] if fitting else next(
            (c for c in ("full_bleed", "inset_frame") if _fits(c, post)), "full_bleed"
        )
    return make_design(choice, post, turn=_seed(dna) // 7 + index)


def _composition_of(post) -> str | None:
    design = post.get("design") if isinstance(post, dict) else None
    return design.get("composition") if isinstance(design, dict) else None


def assign_designs(posts: list, dna: dict | None) -> list:
    """Give every post that has none its design, in place. Returns the list.

    A post with a valid design keeps it (the owner may have chosen it). A post that
    still carries an old `overlay_theme` (a sample post chosen at /start) gets that
    layout's closest composition; any other post gets the DNA's next composition.
    """
    for index, post in enumerate(posts or []):
        if not isinstance(post, dict):
            continue
        kept = clean_design(post.get("design"), post)
        if kept is not None:
            post["design"] = kept
            continue
        legacy = legacy_design(post)
        if legacy is not None:
            post["design"] = legacy
            continue
        previous = _composition_of(posts[index - 1]) if index > 0 else None
        following = _composition_of(posts[index + 1]) if index + 1 < len(posts) else None
        post["design"] = rotate(post, index, dna, previous, following)
    return posts


def view_designs(posts: list, dna: dict | None) -> list[dict | None]:
    """The design every reader sees for each post, without changing what is stored.

    Old posts get their mapped layout, posts with neither get the DNA rotation.
    """
    out: list[dict | None] = []
    previous: str | None = None
    for index, post in enumerate(posts or []):
        if not isinstance(post, dict):
            out.append(None)
            previous = None
            continue
        design = clean_design(post.get("design"), post) or legacy_design(post) or rotate(post, index, dna, previous)
        out.append(design)
        previous = design["composition"]
    return out


def ensure_post_design(posts: list, index: int, dna: dict | None, *, composition: str = "",
                       text_position: str = "", prefer_dna: bool = False) -> dict:
    """Store the design of one post (before its image is made) and return it.

    `composition` is an explicit choice (the editor's design step); `prefer_dna` moves an
    old post off its mapped layout onto the DNA (an explicit redesign).
    """
    post = posts[index]
    previous = _composition_of(posts[index - 1]) if index > 0 else None
    following = _composition_of(posts[index + 1]) if index + 1 < len(posts) else None
    design = None
    if composition:
        design = clean_design({"composition": composition, "text_position": text_position}, post)
    if design is None:
        design = clean_design(post.get("design"), post)
        if design is not None and prefer_dna and design["composition"] not in dna_compositions(dna):
            design = None
    if design is None and not prefer_dna:
        design = legacy_design(post)
    if design is None:
        design = rotate(post, index, dna, previous, following)
    post["design"] = design
    return design


def post_composition(post: dict) -> str:
    design = clean_design(post.get("design"), post) or legacy_design(post)
    return design["composition"] if design else "full_bleed"


def post_needs_photo(post: dict) -> bool:
    """False for a post whose card draws no photograph (no image is made for it)."""
    return post_composition(post) not in PHOTO_FREE_COMPOSITIONS
