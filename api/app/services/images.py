import re
import time
from pathlib import Path

from app.services.gemini import generate_image_bytes

ASPECT = {
    "reel": "9:16",
    "carousel": "4:5",
    "image": "4:5",
    "story": "9:16",
}


def media_root() -> Path:
    root = Path(__file__).resolve().parents[2] / "data" / "generated"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _slug(value: str) -> str:
    cleaned = re.sub(r"[^\w]+", "-", value, flags=re.UNICODE).strip("-")
    return (cleaned[:48] or "post").lower()


def image_public_url(business_id: int, filename: str) -> str:
    return f"/backend/media/{business_id}/{filename}"


def build_image_prompt(post: dict, brand: dict, business: dict) -> str:
    palette = ", ".join(
        f"{swatch.get('name', '')} {swatch.get('hex')}" for swatch in brand.get("palette") or []
    )
    scene = post.get("scene_description") or post.get("image_prompt") or post.get("title")
    return f"""
Create one still for an Israeli small-business Instagram {post.get("format")} post.
This is a finished photograph or designed still, not a website screenshot and not a UI mockup.

Business: {business.get("name")}
What they sell: {business.get("offerings")}
Brand visual style: {brand.get("visual_style")}
Photography style: {brand.get("photography")}
Typography mood: {(brand.get("typography") or {}).get("mood")}
Exact palette to use: {palette}
Voice (do not invent a luxury/agency look if the brand is neighborhood/handmade): {brand.get("voice")}

Scene and art-direction to depict:
{scene}

Rules:
- Do not render any text, letters, numbers, logos, watermarks, or captions on the image.
- Graphic text overlay will be added cleanly in the app. Leave clean negative space where appropriate.
- Match the brand's authentic materials, warm light, and real Mediterranean / Israeli color temperature.
- No invented logos, no Instagram chrome, no stock-office looks.
"""


def generate_and_store(
    business_id: int,
    post: dict,
    brand: dict,
    business: dict,
) -> str:
    aspect = ASPECT.get(post.get("format") or "image", "4:5")
    prompt = build_image_prompt(post, brand, business)
    data, mime = generate_image_bytes(prompt, aspect)
    ext = "jpg" if "jpeg" in mime else "png"
    timestamp = int(time.time())
    filename = f"{post.get('week', 0)}-{_slug(post.get('title') or 'post')}-{timestamp}.{ext}"
    folder = media_root() / str(business_id)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / filename
    path.write_bytes(data)
    return image_public_url(business_id, filename)

