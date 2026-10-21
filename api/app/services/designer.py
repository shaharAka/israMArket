"""Creative director entry point and application to existing editable post layers."""

from app.services.dna_library import COMPOSITIONS
from app.services.gemini import strategy_json
from app.services.images import generate_and_store

# What a vibe asks of the composition and the headline. A composition is kept only if
# the business's DNA has it (or nothing in the DNA fits, then the first that does).
VIBE_COMPOSITIONS = {
    "hero_clean": ("full_bleed", "inset_frame", "circle_crop", "arch_window"),
    "announcement_card": ("type_led", "ticket", "stacked_bands", "split", "inset_frame"),
    "corner_badge": ("corner_tab", "inset_frame", "full_bleed", "handwritten_note"),
    "ink_pill": ("full_bleed", "editorial_column", "split"),
}


def vibe_composition(vibe: str, dna_compositions, fmt: str | None = None) -> str:
    """The DNA composition that best fits a vibe, or "" (keep the post's own)."""
    wanted = VIBE_COMPOSITIONS.get(vibe or "")
    if not wanted:
        return ""
    vertical = (fmt or "") in {"reel", "story"}
    for key in wanted:
        if key in (dna_compositions or ()) and (not vertical or "9:16" in COMPOSITIONS[key].crops):
            return key
    return ""


def plan_post_design(
    post: dict, brand: dict, business: dict, vibe: str = "", custom_prompt: str = "",
    dna: dict | None = None, *, duration: int = 0, lock_layout: bool = False,
) -> dict:
    """Direct the complete creative before producing media, using the shared text stack."""
    from app.services.creative_director import plan
    return plan(post, brand, business, dna, instruction=custom_prompt, vibe=vibe,
                duration=duration, lock_layout=lock_layout, planner=strategy_json)


def apply_creative_to_post(post: dict, creative: dict, dna: dict | None = None) -> dict:
    """The designer's decision on the post, in place. One message (docs/design-dna.md,
    Revision 1): a headline of at most 6 words and at most one short line; the badge is
    retired. No overlay = a photo-only post, in a layout that can carry the photo alone."""
    from app.services.connected_posts import one_message
    from app.services.post_design import ensure_photo_only, sync_text_mode

    if creative.get("direction"):
        from app.services.creative_director import apply_layout
        apply_layout(post, creative)
    has_overlay = bool(creative.get("has_overlay"))
    post["creative_concept"] = creative.get("creative_concept", "")
    post["visual_style"] = creative.get("visual_style", "")
    post["scene_description"] = creative.get("scene_description", "")
    post["image_prompt"] = creative.get("scene_description", "")
    post["has_overlay"] = has_overlay
    post["overlay_headline"] = (creative.get("overlay_headline") or "").strip() if has_overlay else ""
    post["overlay_sub"] = (creative.get("overlay_sub") or "").strip() if has_overlay else ""
    if has_overlay:
        one_message(post)
    else:
        post["overlay_text"] = ""
    post["overlay_badge"] = ""
    post["design_creative"] = creative
    if isinstance(post.get("design"), dict):
        sync_text_mode(post["design"], has_overlay)
        ensure_photo_only(post, dna)
    return post


def design_and_generate_post(
    business_id: int,
    post: dict,
    brand: dict,
    business: dict,
    vibe: str = "",
    custom_prompt: str = "",
    generate_image: bool = True,
    image_provider=None,
    dna: dict | None = None,
    lock_layout: bool = False,
) -> tuple[dict, str | None]:
    """Plan the card creative, then obtain its image.

    `image_provider` is injected by the router so it can choose between the business's
    own photograph (edited to the DNA), a generated one, or none at all. Defaults to
    straight generation.
    """
    creative = plan_post_design(post, brand, business, vibe=vibe, custom_prompt=custom_prompt, dna=dna, lock_layout=lock_layout)
    apply_creative_to_post(post, creative, dna)

    image_url = None
    if generate_image:
        if image_provider is not None:
            image_url = image_provider(post)
        else:
            image_url = generate_and_store(business_id, post, brand, business, dna=dna)
        post["image_url"] = image_url

    return post, image_url
