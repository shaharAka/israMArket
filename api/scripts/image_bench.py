#!/usr/bin/env python
"""Image-model benchmark for the post designer: cost, latency, refusals, side-by-side sheet.

    cd api && .venv/bin/python scripts/image_bench.py run --out DIR --refs DIR
    cd api && .venv/bin/python scripts/image_bench.py run --out DIR --refs DIR --models oai-flare,oai-sunburst
    cd api && .venv/bin/python scripts/image_bench.py run --out DIR --refs DIR --models nb-pro --samples 2
    cd api && .venv/bin/python scripts/image_bench.py report --out DIR      # index.html from results.json
    cd api && .venv/bin/python scripts/image_bench.py run ... --dry-run     # prompts + price estimate, no calls

Research only: it imports nothing from `app/`, writes nothing outside --out, and never
touches the database. Same briefs for every model: 5 businesses x 2 tasks
("gen" = a 4:5 post photo from an art-directed brief, "edit" = improve a real photo
while keeping the product faithful). Each image is recorded in results.json with
latency, pixel size, success/refusal (+ the provider's message) and its cost, computed
from the provider's own usage numbers and the official prices in PRICES below.

Keys are read from the repo-root `.env` (found by walking up from this file, or --env).
They are only ever placed in request headers: never printed, logged or written out.
Muse: never a `-contributor` model (their inputs train Meta's models), enforced below.

Reference photos (--refs) are expected as:
    challah_pan.jpg        CC0, Wikimedia Commons (Eden Aviv)       -> bakery_a, bakery_b
    tazizi_bra_lace.jpg    product photo from tazizi.co.il (owner)  -> lingerie
    yoga_mats.jpg          CC0, Wikimedia Commons (Sha89sha)        -> yoga
    home_office.jpg        CC0, Wikimedia Commons / Pixabay         -> accountant
"""

from __future__ import annotations

import argparse
import base64
import html
import io
import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

try:
    from PIL import Image
except ImportError:  # pragma: no cover - PIL is in the api venv
    Image = None

# ----------------------------------------------------------------------------- prices
# Official list prices, paid tier, standard (non-batch). Checked 2026-10-01.
#   Google: https://ai.google.dev/gemini-api/docs/pricing (page "Last updated 2026-10-01")
#   OpenAI: https://developers.openai.com/api/docs/pricing and the token calculator in
#           https://developers.openai.com/api/docs/guides/image-generation#calculating-costs
#   Meta:   https://dev.meta.ai/docs/pricing-rate-limits ("flat $0.01 per generated image")
# Per 1M tokens unless stated. Gemini bills thinking tokens at the text-output rate.
PRICES = {
    "gemini-3-pro-image": {"in": 2.00, "out_text": 12.00, "out_image": 120.00},
    "gemini-3.1-flash-image": {"in": 0.50, "out_text": 3.00, "out_image": 60.00},
    "gemini-3.1-flash-lite-image": {"in": 0.25, "out_text": 1.50, "out_image": 30.00},
    # 2.5 Flash Image is published per image ("$0.039 per image", 1290 tokens), not per token.
    "gemini-2.5-flash-image": {"in": 0.30, "out_text": 0.0, "per_image": 0.039},
    "gpt-image-2.5-flare": {"in_text": 5.00, "in_image": 8.00, "out_image": 30.00},
    "gpt-image-2.5-sunburst": {"in_text": 5.00, "in_image": 8.00, "out_image": 30.00},
    "muse-image-1.0": {"per_image": 0.01},
}

# One column of the sheet per entry. `tasks` limits what a model is asked to do.
MODELS: dict[str, dict] = {
    "nb-pro": {"provider": "gemini", "model": "gemini-3-pro-image", "image_size": "2K",
               "label": "Nano Banana Pro", "tasks": ("gen", "edit")},
    "nb2": {"provider": "gemini", "model": "gemini-3.1-flash-image", "image_size": "1K",
            "label": "Nano Banana 2", "tasks": ("gen", "edit")},
    "nb2-lite": {"provider": "gemini", "model": "gemini-3.1-flash-lite-image", "image_size": "1K",
                 "label": "Nano Banana 2 Lite", "tasks": ("gen", "edit")},
    "nb1": {"provider": "gemini", "model": "gemini-2.5-flash-image", "image_size": None,
            "label": "Nano Banana (2.5)", "tasks": ("gen", "edit")},
    "muse": {"provider": "meta", "model": "muse-image-1.0", "size": "1024x1280",
             "label": "Muse Image 1.0", "tasks": ("gen", "edit")},
    "oai-flare": {"provider": "openai", "model": "gpt-image-2.5-flare", "size": "1088x1360",
                  "quality": "high", "label": "GPT Image 2.5 Flare", "tasks": ("gen", "edit")},
    "oai-sunburst": {"provider": "openai", "model": "gpt-image-2.5-sunburst", "size": "1088x1360",
                     "quality": "high", "label": "GPT Image 2.5 Sunburst", "tasks": ("edit",)},
}
DEFAULT_MODELS = ["nb-pro", "nb2", "nb2-lite", "nb1", "muse", "oai-flare", "oai-sunburst"]

# Stop before a call that the estimate says would cost more than this.
MAX_CALL_USD = 0.50

# ----------------------------------------------------------------------------- briefs
# Every brief is written for THAT business. The only shared words are the hard rules in
# _HARD_RULES (format, no text/logos), which every model must obey identically.
_HARD_RULES = (
    "Format: a vertical 4:5 photo for an Instagram feed, used full-bleed. "
    "Never include any text, letters, numbers, logos, labels, signage or watermarks, in any language."
)

BUSINESSES: dict[str, dict] = {
    "bakery_a": {
        "name": "תנור אבן (Tanur Even)",
        "label": "Bakery A — rustic, Rosh Pina",
        "ref": "challah_pan.jpg",
        "gen": (
            "Photograph for Tanur Even, a family wood-fired bakery in an old stone house in Rosh Pina, "
            "Upper Galilee: spelt and sourdough, baked in a stone oven since the 80s. Brand: warm, rustic, "
            "earthy, slow, unpolished.\n"
            "Subject: three dark-crusted spelt sourdough loaves just pulled from the oven, resting on a long "
            "wooden peel scorched black at the tip, on a worn olive-wood work table. Behind, out of focus, the "
            "arched mouth of the stone oven glows with embers.\n"
            "Light: the oven is the only key light, low and warm, raking from the right, so the blistered crust "
            "and the flour dust catch it and the left side falls into deep brown shadow.\n"
            "Details: a slumped burlap flour sack at the edge, scattered rye flour and a few seeds, a chipped "
            "enamel mug.\n"
            "Camera: 50mm at f/2.8, just above table height, as if the baker took it at 5am.\n"
            "Colour: ember orange #c2562b, burnt crust #5b3a24, olive #6b6b3a, raw flour #efe6d6. No cool tones."
        ),
        "edit": (
            "This is a real phone photo of a challah baked this morning at Tanur Even, a family wood-fired "
            "bakery in Rosh Pina (warm, rustic, earthy). Re-shoot it for our Instagram feed.\n"
            "Keep the loaf itself exactly as it is: the same braid, shape, proportions, colour, shine and every "
            "crack. Do not re-bake it, restyle it or add seeds.\n"
            "Change only the setting and the light: replace the metal tray and the kitchen with a floured, "
            "scorched olive-wood board on rough Galilee stone, the dark glowing mouth of a stone oven far "
            "behind, and a low warm side light from the oven. Earthy, smoky, unpolished."
        ),
    },
    "bakery_b": {
        "name": "ענן (Anan)",
        "label": "Bakery B — modern pastel, Modi'in",
        "ref": "challah_pan.jpg",
        "gen": (
            "Photograph for Anan, a small modern bakery in a new neighbourhood of Modi'in: laminated pastries, "
            "one counter, a pastel interior. Brand: modern, minimal, bright, playful, precise.\n"
            "Subject: a single pistachio-cardamom cruffin with its spiral layers visible, on a small matte "
            "blush-pink ceramic plate, placed off-centre on a butter-yellow painted plywood counter, against a "
            "pistachio-green plaster wall.\n"
            "Light: bright midday sun through a window, high-key, with one crisp hard-edged shadow falling to "
            "the left — graphic, like contemporary still-life photography in a design magazine, not a cosy café.\n"
            "Composition: generous clean negative space, the pastry a third of the frame, camera straight-on at "
            "counter height, 85mm.\n"
            "Details: a few pistachio crumbs and a dusting of powdered sugar on the plate rim, nothing else.\n"
            "Colour: pistachio #c9dbb2, blush #f4c9c3, butter #f6e7a6, chalk #fbfaf6. No brown wood, no dark "
            "tones, no rustic props."
        ),
        "edit": (
            "This is a real phone photo of a challah baked this morning at Anan, a small modern bakery in "
            "Modi'in (minimal, bright, pastel). Re-shoot it for our Instagram feed.\n"
            "Keep the loaf itself exactly as it is: the same braid, shape, proportions, colour, shine and every "
            "crack. Do not re-bake it, restyle it or add seeds.\n"
            "Change only the setting and the light: place it on a pale pistachio-glazed ceramic platter on a "
            "butter-yellow painted counter against a blush-pink plaster wall, in bright high-key daylight with "
            "one crisp shadow and plenty of clean negative space. Fresh, pastel, precise."
        ),
    },
    "lingerie": {
        "name": "ת'ציצי פנימה (Tazizi)",
        "label": "Lingerie boutique (product only)",
        "ref": "tazizi_bra_lace.jpg",
        "gen": (
            "Photograph for Tazizi, a neighbourhood bra-fitting boutique for every size: frank, warm, no "
            "embarrassment. Product only — no person, no mannequin, no body.\n"
            "Subject: a single blush-peach lace bra hanging from a slim wooden hanger on a brass rail, in front "
            "of a heavy black velvet fitting-room curtain, half drawn. A soft cloth tape measure is draped over "
            "the hanger.\n"
            "Light: warm late-afternoon window light from the left, falling off gently into the black curtain; "
            "the lace and the stitching are crisp.\n"
            "Composition: the bra slightly right of centre in the upper two thirds; below it the curtain's folds "
            "and a glimpse of worn wooden floor. 70mm, eye level.\n"
            "Mood: intimate but matter-of-fact, a real shop — not boudoir, not glamour.\n"
            "Colour: black, blush peach #f2c4b0, one small accent of hot pink #e8417c (the tape measure's end)."
        ),
        "edit": (
            "This is the real catalogue photo of a bra we sell at Tazizi, a neighbourhood bra-fitting boutique. "
            "Turn it into a warm, real-looking product photo for our Instagram feed.\n"
            "Keep the bra exactly as it is: the same powder-blue colour, cup shape, the scalloped lace along "
            "the neckline, the lace-patterned straps and the small centre bead. Do not change the design.\n"
            "Show it laid flat on softly crumpled natural linen, a cloth tape measure coiled beside it, in soft "
            "window daylight from the left. Product only: no person, no mannequin, no body."
        ),
    },
    "yoga": {
        "name": "מרפסת (Mirpeset)",
        "label": "Yoga studio, Haifa",
        "ref": "yoga_mats.jpg",
        "gen": (
            "Photograph for Mirpeset, a small yoga studio in an old Bauhaus apartment on Mount Carmel, Haifa: "
            "early-morning Ashtanga and quiet classes. Brand: calm, unhurried, honest, local.\n"
            "Subject: the room just before the 6:30 class, empty — worn terracotta floor tiles, four natural "
            "cork mats unrolled in a row, a folded grey wool blanket and two cork blocks at the head of each "
            "mat. Tall steel-framed windows at the back open onto pine trees and, far below, a hazy strip of "
            "the bay.\n"
            "Light: blue dawn outside, soft cool light inside, the first warm stripe of sun just touching the "
            "floor.\n"
            "Camera: low, at floor level from the corner, 35mm, the mats leading the eye to the windows. No "
            "people.\n"
            "Colour: sea slate #4f6470, sage #a3b18a, sand #e8dcc5, terracotta #c7774f. Not a luxury spa: no "
            "candles, no Buddha statue, no orchids, no stacked stones."
        ),
        "edit": (
            "This is a real photo of the cotton mats we sell at Mirpeset, our yoga studio on Mount Carmel, "
            "Haifa. Re-shoot them for our Instagram feed.\n"
            "Keep these exact four rolled mats: their colours (pink, yellow, blue, grey), the woven texture, the "
            "string ties and the paper bands. Do not add new labels.\n"
            "Replace the plain background with our studio: stand them upright in a woven basket on a worn "
            "terracotta tile floor beside a tall steel-framed window, pine trees outside, soft cool morning "
            "light with one warm stripe of sun. No people."
        ),
    },
    "accountant": {
        "name": "מיכל לוי, רואת חשבון (Michal Levi CPA)",
        "label": "Accountant (a service)",
        "ref": "home_office.jpg",
        "gen": (
            "Photograph for Michal Levi, a chartered accountant in Petah Tikva who works with freelancers and "
            "small businesses: calm, exact, human, answers on WhatsApp. A service with no product — show the "
            "relief of having your books in order.\n"
            "Subject: her desk at the end of the day: a closed navy cloth ring binder with blank mustard tab "
            "dividers peeking out, a mechanical pencil lying across a neat stack of paper held by a bulldog clip "
            "(pages face down, nothing readable), a glass of mint tea, a small desk lamp just switched on.\n"
            "Light: low golden sun through horizontal venetian blinds, stripes of light and shadow raking "
            "across the desk.\n"
            "Camera: overhead three-quarter angle, 50mm, the desk edge running diagonally.\n"
            "Colour: ink navy #1f2a44, mustard #d9a441, warm paper white #f5f1e8. No laptop, no calculator "
            "close-up, no handshake, no suit, no charts."
        ),
        "edit": (
            "This is a real photo of the desk at Michal Levi's accounting practice in Petah Tikva (calm, exact, "
            "human). Make it feel like our office for an Instagram post.\n"
            "Keep the same laptop, open notebook and pen, espresso cup and phone, in the same arrangement.\n"
            "Brighten and warm it with late-afternoon sun through venetian blinds and a calmer, tidier "
            "background. The laptop screen stays dark. No readable writing anywhere."
        ),
    },
}
TASKS = ("gen", "edit")


def build_prompt(business: str, task: str) -> str:
    return BUSINESSES[business][task] + "\n" + _HARD_RULES


# ----------------------------------------------------------------------------- keys
def find_env(explicit: str | None) -> Path | None:
    if explicit:
        return Path(explicit)
    for parent in Path(__file__).resolve().parents:
        candidate = parent / ".env"
        if candidate.is_file() and "GEMINI_API_KEY" in candidate.read_text(errors="ignore"):
            return candidate
    return None


def load_keys(env_path: Path | None) -> dict[str, str]:
    """Only the three keys this script needs. Values never leave this dict except as headers."""
    wanted = {"GEMINI_API_KEY", "META_MODEL_API_KEY", "OPENAI_API_KEY"}
    keys: dict[str, str] = {}
    if env_path and env_path.is_file():
        for line in env_path.read_text(errors="ignore").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            name = name.strip().removeprefix("export ").strip()
            if name in wanted:
                keys[name] = value.strip().strip('"').strip("'")
    for name in wanted:  # environment wins, so CI can inject without a file
        if os.environ.get(name):
            keys[name] = os.environ[name]
    return {k: v for k, v in keys.items() if v}


def _scrub(text: str, keys: dict[str, str]) -> str:
    for value in keys.values():
        if value and value in text:
            text = text.replace(value, "[key]")
    return text


# ----------------------------------------------------------------------------- helpers
def _mime(path: Path) -> str:
    return {".png": "image/png", ".webp": "image/webp"}.get(path.suffix.lower(), "image/jpeg")


def _image_info(data: bytes) -> tuple[int, int, str]:
    if Image is None:
        return 0, 0, "bin"
    with Image.open(io.BytesIO(data)) as im:
        return im.width, im.height, (im.format or "bin").lower()


def _ext(fmt: str) -> str:
    return {"jpeg": "jpg", "png": "png", "webp": "webp"}.get(fmt, "bin")


class Refused(Exception):
    """The provider declined to produce an image (safety/policy). Not retried as-is.

    `cost_usd` is what the refused call still billed (Gemini bills input + thinking).
    """

    def __init__(self, message: str, cost_usd: float = 0.0) -> None:
        super().__init__(message)
        self.cost_usd = cost_usd


# ----------------------------------------------------------------------------- gemini
def call_gemini(spec: dict, prompt: str, ref: tuple[bytes, str] | None, keys: dict) -> dict:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=keys["GEMINI_API_KEY"], http_options=types.HttpOptions(timeout=240_000))
    parts = [types.Part.from_text(text=prompt)]
    if ref:
        parts.append(types.Part.from_bytes(data=ref[0], mime_type=ref[1]))
    image_cfg = {"aspect_ratio": "4:5"}
    if spec.get("image_size"):
        image_cfg["image_size"] = spec["image_size"]
    cfg = {"response_modalities": ["IMAGE"], "image_config": types.ImageConfig(**image_cfg)}
    if spec["model"].startswith("gemini-3"):
        # Mirrors app/services/gemini.py generate_image_bytes.
        cfg["thinking_config"] = types.ThinkingConfig(thinking_level="MINIMAL")
    try:
        response = client.models.generate_content(
            model=spec["model"], contents=parts, config=types.GenerateContentConfig(**cfg)
        )
    except Exception as exc:  # thinking not accepted on this model -> once without it
        if "thinking" in str(exc).lower() and "thinking_config" in cfg:
            cfg.pop("thinking_config")
            response = client.models.generate_content(
                model=spec["model"], contents=parts, config=types.GenerateContentConfig(**cfg)
            )
        else:
            raise

    usage = response.usage_metadata
    u = {
        "prompt_tokens": getattr(usage, "prompt_token_count", 0) or 0,
        "output_tokens": getattr(usage, "candidates_token_count", 0) or 0,
        "thinking_tokens": getattr(usage, "thoughts_token_count", 0) or 0,
        "prompt_by_modality": {},
        "output_by_modality": {},
    }
    for d in getattr(usage, "prompt_tokens_details", None) or []:
        u["prompt_by_modality"][str(getattr(d.modality, "name", d.modality))] = d.token_count
    for d in getattr(usage, "candidates_tokens_details", None) or []:
        u["output_by_modality"][str(getattr(d.modality, "name", d.modality))] = d.token_count

    data = mime = None
    texts: list[str] = []
    finish = ""
    for cand in response.candidates or []:
        finish = str(getattr(cand.finish_reason, "name", cand.finish_reason) or "")
        for part in (cand.content.parts if cand.content else None) or []:
            if getattr(part, "inline_data", None) and part.inline_data.data:
                data, mime = part.inline_data.data, part.inline_data.mime_type
            elif getattr(part, "text", None) and not getattr(part, "thought", False):
                texts.append(part.text)
    block = getattr(getattr(response, "prompt_feedback", None), "block_reason", None)
    result = {"usage": u, "cost_usd": gemini_cost(spec["model"], u, produced=data is not None)}
    if data is None:
        reason = " ".join(x for x in [f"finish={finish}" if finish else "", f"block={block}" if block else "",
                                      " ".join(texts)[:300]] if x)
        raise Refused(reason or "no image returned", cost_usd=result["cost_usd"])
    result.update({"data": data, "mime": mime})
    return result


def gemini_cost(model: str, u: dict, produced: bool) -> float:
    p = PRICES[model]
    cost = u["prompt_tokens"] * p["in"] / 1e6
    if "per_image" in p:
        return round(cost + (p["per_image"] if produced else 0.0), 5)
    image_out = u["output_by_modality"].get("IMAGE", u["output_tokens"] if produced else 0)
    text_out = max(0, u["output_tokens"] - image_out) + u["thinking_tokens"]
    return round(cost + image_out * p["out_image"] / 1e6 + text_out * p["out_text"] / 1e6, 5)


# ----------------------------------------------------------------------------- meta
def _assert_not_contributor(model: str) -> None:
    if "contributor" in model.lower():
        raise SystemExit(f"Refusing {model}: contributor models train on our inputs.")


def call_meta(spec: dict, prompt: str, ref: tuple[bytes, str] | None, keys: dict, moderation: str | None) -> dict:
    _assert_not_contributor(spec["model"])
    headers = {"Authorization": f"Bearer {keys['META_MODEL_API_KEY']}", "Content-Type": "application/json"}
    body: dict = {"model": spec["model"], "prompt": prompt, "n": 1, "size": spec["size"],
                  "response_format": "b64_json"}
    if moderation:
        body["moderation"] = moderation
    path = "/images/generations"
    if ref:
        path = "/images/edits"
        body["images"] = [{"image_url": f"data:{ref[1]};base64,{base64.b64encode(ref[0]).decode()}"}]
    r = httpx.post("https://api.meta.ai/v1" + path, headers=headers, json=body, timeout=httpx.Timeout(300, connect=15))
    payload = _json(r)
    if r.status_code >= 400:
        err = payload.get("error") if isinstance(payload, dict) else None
        err = err if isinstance(err, dict) else {"message": str(err or r.text[:300])}
        code = str(err.get("code") or err.get("type") or "")
        msg = f"{r.status_code} {code}: {err.get('message') or ''}".strip()
        # `unsupported_parameter` (e.g. moderation on muse-image-1.0) is a request error, not a refusal.
        if code in {"content_policy_violation", "moderation_blocked"} or (
            code != "unsupported_parameter" and "content management policy" in msg.lower()
        ):
            raise Refused(msg)
        raise RuntimeError(msg)
    item = (payload.get("data") or [{}])[0]
    if item.get("b64_json"):
        data = base64.b64decode(item["b64_json"])
    elif item.get("url"):
        data = httpx.get(item["url"], timeout=60).content
    else:
        raise Refused(f"no image in reply: {json.dumps(payload)[:300]}")
    return {"data": data, "mime": "", "usage": payload.get("usage") or {}, "cost_usd": PRICES[spec["model"]]["per_image"]}


# ----------------------------------------------------------------------------- openai
def call_openai(spec: dict, prompt: str, ref: tuple[bytes, str] | None, keys: dict, moderation: str | None) -> dict:
    headers = {"Authorization": f"Bearer {keys['OPENAI_API_KEY']}"}
    fields = {"model": spec["model"], "prompt": prompt, "n": "1", "size": spec["size"], "quality": spec["quality"]}
    if moderation:
        fields["moderation"] = moderation
    timeout = httpx.Timeout(360, connect=15)
    if ref:
        files = [("image[]", ("reference" + (".png" if ref[1] == "image/png" else ".jpg"), ref[0], ref[1]))]
        r = httpx.post("https://api.openai.com/v1/images/edits", headers=headers, data=fields, files=files, timeout=timeout)
    else:
        body = dict(fields, n=1)
        r = httpx.post("https://api.openai.com/v1/images/generations", headers=headers, json=body, timeout=timeout)
    payload = _json(r)
    if r.status_code >= 400:
        err = (payload or {}).get("error") or {}
        msg = f"{r.status_code} {err.get('code') or err.get('type') or ''}: {err.get('message') or r.text[:300]}"
        if err.get("code") in {"moderation_blocked", "content_policy_violation"} or (
            err.get("code") != "unsupported_parameter" and "safety system" in msg.lower()
        ):
            details = err.get("moderation_details")
            raise Refused(msg + (f" {json.dumps(details)}" if details else ""))
        raise RuntimeError(msg)
    data = base64.b64decode(payload["data"][0]["b64_json"])
    usage = payload.get("usage") or {}
    return {"data": data, "mime": "image/png", "usage": usage, "cost_usd": openai_cost(spec["model"], usage)}


def openai_cost(model: str, usage: dict) -> float:
    p = PRICES[model]
    details = usage.get("input_tokens_details") or {}
    text_in = details.get("text_tokens", usage.get("input_tokens", 0))
    image_in = details.get("image_tokens", 0)
    out = usage.get("output_tokens", 0)
    return round(text_in * p["in_text"] / 1e6 + image_in * p["in_image"] / 1e6 + out * p["out_image"] / 1e6, 5)


def _json(r: httpx.Response):
    try:
        return r.json()
    except ValueError:
        return {"error": {"message": r.text[:300]}}


# ----------------------------------------------------------------------------- estimates
def estimate(key: str, task: str) -> float:
    """Upper-ish list-price estimate per call, used for the dry run and the per-call guard."""
    spec = MODELS[key]
    m = spec["model"]
    if m == "gemini-3-pro-image":
        return 0.134 + (0.0011 if task == "edit" else 0) + 0.002
    if m == "gemini-3.1-flash-image":
        return {"1K": 0.067, "2K": 0.101, "4K": 0.151}.get(spec["image_size"], 0.101) + 0.002
    if m == "gemini-3.1-flash-lite-image":
        return 0.0336 + 0.001
    if m == "gemini-2.5-flash-image":
        return 0.039 + 0.001
    if m == "muse-image-1.0":
        return 0.01
    if m.startswith("gpt-image-2.5"):
        out_tokens = {"low": 181, "medium": 397, "high": 1587, "xhigh": 2840, "max": 6431}[spec["quality"]]  # 1088x1360
        return out_tokens * 30 / 1e6 + (0.02 if task == "edit" else 0.003)
    return 0.2


# ----------------------------------------------------------------------------- runner
_lock = threading.Lock()


def _load_results(out: Path) -> list[dict]:
    path = out / "results.json"
    return json.loads(path.read_text()) if path.is_file() else []


def _save_result(out: Path, record: dict) -> None:
    with _lock:
        results = [r for r in _load_results(out) if r["id"] != record["id"]]
        results.append(record)
        results.sort(key=lambda r: r["id"])
        (out / "results.json").write_text(json.dumps(results, indent=1, ensure_ascii=False))


def run_one(key: str, business: str, task: str, sample: int, out: Path, refs: Path, keys: dict, retry_low: bool) -> dict:
    spec = MODELS[key]
    rid = f"{business}__{task}__{key}__s{sample}"
    ref = None
    if task == "edit":
        ref_path = refs / BUSINESSES[business]["ref"]
        ref = (ref_path.read_bytes(), _mime(ref_path))
    prompt = build_prompt(business, task)
    est = estimate(key, task)
    if est > MAX_CALL_USD:
        raise SystemExit(f"{rid}: estimated ${est:.3f} per call is above the ${MAX_CALL_USD} guard; stopping.")

    attempts: list[dict] = []
    moderation_levels = [None] + (["low"] if retry_low and spec["provider"] in {"meta", "openai"} else [])
    record = {"id": rid, "model_key": key, "model": spec["model"], "label": spec["label"], "business": business,
              "task": task, "sample": sample, "ok": False, "refused": False, "message": "", "latency_s": None,
              "width": None, "height": None, "bytes": None, "file": None, "cost_usd": 0.0,
              "settings": {k: v for k, v in spec.items() if k in {"image_size", "size", "quality"}},
              "attempts": attempts}
    for moderation in moderation_levels:
        for transient_try in range(3):
            t0 = time.monotonic()
            try:
                if spec["provider"] == "gemini":
                    res = call_gemini(spec, prompt, ref, keys)
                elif spec["provider"] == "meta":
                    res = call_meta(spec, prompt, ref, keys, moderation)
                else:
                    res = call_openai(spec, prompt, ref, keys, moderation)
            except Refused as exc:
                attempts.append({"moderation": moderation or "default", "outcome": "refused",
                                 "message": _scrub(str(exc), keys)[:500], "latency_s": round(time.monotonic() - t0, 1),
                                 "cost_usd": exc.cost_usd})
                record["cost_usd"] = round(record["cost_usd"] + exc.cost_usd, 5)
                break  # policy refusal: do not retry the same request
            except Exception as exc:  # transient or hard error
                text = _scrub(f"{type(exc).__name__}: {exc}", keys)[:500]
                attempts.append({"moderation": moderation or "default", "outcome": "error", "message": text,
                                 "latency_s": round(time.monotonic() - t0, 1)})
                if any(t in text for t in ("429", "503", "500", "UNAVAILABLE", "overloaded", "Timeout", "RESOURCE_EXHAUSTED")) \
                        and "402" not in text and transient_try < 2:
                    time.sleep(8 * (transient_try + 1))
                    continue
                break
            latency = round(time.monotonic() - t0, 1)
            w, h, fmt = _image_info(res["data"])
            fname = f"{rid}.{_ext(fmt)}"
            (out / "images").mkdir(parents=True, exist_ok=True)
            (out / "images" / fname).write_bytes(res["data"])
            attempts.append({"moderation": moderation or "default", "outcome": "ok", "latency_s": latency})
            record.update({"ok": True, "latency_s": latency, "width": w, "height": h, "bytes": len(res["data"]),
                           "file": f"images/{fname}", "cost_usd": round(record["cost_usd"] + res["cost_usd"], 5),
                           "usage": res.get("usage"),
                           "moderation": moderation or "default"})
            if moderation:
                record["message"] = "passed only with moderation=low (default refused)"
            _save_result(out, record)
            return record
        if attempts and attempts[-1]["outcome"] == "error":
            break  # hard error: a lower moderation level will not fix it

    last = attempts[-1] if attempts else {"outcome": "error", "message": "no attempt"}
    record["refused"] = any(a["outcome"] == "refused" for a in attempts)
    record["message"] = " | ".join(f"[{a['moderation']}] {a['outcome']}: {a.get('message', '')}" for a in attempts
                                   if a["outcome"] != "ok")[:900]
    record["latency_s"] = last.get("latency_s")
    _save_result(out, record)
    return record


def cmd_run(args) -> None:
    out = Path(args.out).resolve()
    refs = Path(args.refs).resolve()
    out.mkdir(parents=True, exist_ok=True)
    keys = load_keys(find_env(args.env))
    models = [m.strip() for m in args.models.split(",") if m.strip()]
    businesses = [b.strip() for b in args.businesses.split(",") if b.strip()]
    tasks = [t.strip() for t in args.tasks.split(",") if t.strip()]
    for m in models:
        if m not in MODELS:
            raise SystemExit(f"unknown model key {m}; known: {', '.join(MODELS)}")
        _assert_not_contributor(MODELS[m]["model"])
    need = {"gemini": "GEMINI_API_KEY", "meta": "META_MODEL_API_KEY", "openai": "OPENAI_API_KEY"}
    runnable, skipped = [], []
    for m in models:
        (runnable if need[MODELS[m]["provider"]] in keys else skipped).append(m)
    if skipped:
        print(f"skipping (no key in .env): {', '.join(skipped)}")

    done = {r["id"] for r in _load_results(out) if r.get("ok") or r.get("refused")}
    jobs: dict[str, list] = {m: [] for m in runnable}
    total_est = 0.0
    for m in runnable:
        for b in businesses:
            for t in tasks:
                if t not in MODELS[m]["tasks"]:
                    continue
                for s in range(1, args.samples + 1):
                    rid = f"{b}__{t}__{m}__s{s}"
                    if rid in done and not args.force:
                        continue
                    jobs[m].append((m, b, t, s))
                    total_est += estimate(m, t)
    n = sum(len(v) for v in jobs.values())
    print(f"{n} calls queued, list-price estimate ${total_est:.2f}")
    if args.dry_run:
        for b in businesses:
            for t in tasks:
                print(f"\n--- {b} / {t} ---\n{build_prompt(b, t)}")
        return
    if total_est > args.budget:
        raise SystemExit(f"estimate ${total_est:.2f} is above --budget ${args.budget:.2f}; stopping.")

    def worker(model_key: str) -> None:
        for job in jobs[model_key]:
            rec = run_one(*job, out=out, refs=refs, keys=keys, retry_low=not args.no_retry_low)
            status = "ok" if rec["ok"] else ("REFUSED" if rec["refused"] else "ERROR")
            print(f"{rec['id']:<45} {status:<8} {rec['latency_s'] or 0:>6}s ${rec['cost_usd']:.4f} "
                  f"{rec.get('width')}x{rec.get('height')} {rec['message'][:160]}", flush=True)

    with ThreadPoolExecutor(max_workers=max(1, len(runnable))) as pool:
        list(pool.map(worker, runnable))
    results = _load_results(out)
    print(f"total recorded cost so far: ${sum(r.get('cost_usd') or 0 for r in results):.3f}")


# ----------------------------------------------------------------------------- report
# Judged by hand after a run, 1-5 each, into <out>/scores.json:
#   {"models": {key: {"criteria": {name: score}, "overall": n, "why": "..."}},
#    "cells": {record_id: {"short": "one line"}}}
CRITERIA = ("realism", "faithful (edit)", "brand-specific", "no AI slop", "no text")


def cmd_report(args) -> None:
    out = Path(args.out).resolve()
    results = _load_results(out)
    scores = json.loads((out / "scores.json").read_text()) if (out / "scores.json").is_file() else {}
    by_id = {r["id"]: r for r in results}
    present = {r["model_key"] for r in results}
    columns: list[tuple[str, int]] = []
    for key in MODELS:
        samples = sorted({r["sample"] for r in results if r["model_key"] == key})
        if key in present:
            columns.extend((key, s) for s in samples)
    if args.openai_placeholder:
        for key in ("oai-flare", "oai-sunburst"):
            if key not in present:
                columns.append((key, 1))

    def cell(b: str, t: str, key: str, s: int) -> str:
        rec = by_id.get(f"{b}__{t}__{key}__s{s}")
        if t not in MODELS[key]["tasks"]:
            return '<td class="na"><div class="ph"><div>not run<br><small>edit only; generation uses Flare</small></div></div></td>'
        if rec is None:
            hint = ("not run: no OPENAI_API_KEY in .env yet<br><small>ready: run --models oai-flare,oai-sunburst</small>"
                    if MODELS[key]["provider"] == "openai" else "not run")
            return f'<td class="na"><div class="ph"><div>{hint}</div></div></td>'
        meta = (f"${rec['cost_usd']:.3f} · {rec['latency_s']}s"
                + (f" · {rec['width']}×{rec['height']}" if rec.get("width") else ""))
        if not rec["ok"]:
            kind = "refused" if rec["refused"] else "error"
            return (f'<td class="bad"><div class="ph {kind}"><div><b>{kind.upper()}</b><br>'
                    f'<small>{html.escape(rec["message"][:220])}</small></div></div><div class="meta">{meta}</div></td>')
        note = ""
        if rec.get("moderation") == "low":
            note = '<div class="flag">only with moderation=low</div>'
        sc = (scores.get("cells") or {}).get(rec["id"])
        sc_html = ""
        if sc:
            sc_html = f'<div class="score">{html.escape(sc.get("short", ""))}</div>'
        return (f'<td><img src="{rec["file"]}" loading="eager"><div class="meta">{meta}</div>{note}{sc_html}</td>')

    head = "".join(
        f'<th>{html.escape(MODELS[k]["label"])}{" #" + str(s) if s > 1 else ""}<br><small>{html.escape(MODELS[k]["model"])}'
        f'{" · " + MODELS[k].get("image_size") if MODELS[k].get("image_size") else ""}'
        f'{" · " + MODELS[k].get("quality", "") if MODELS[k].get("quality") else ""}</small></th>'
        for k, s in columns)
    rows = []
    for b, binfo in BUSINESSES.items():
        for t in TASKS:
            ref = ""
            if t == "edit":
                ref = f'<img class="ref" src="refs/{binfo["ref"]}"><small>reference</small>'
            label = f'{html.escape(binfo["label"])}<br><b>{"generate" if t == "gen" else "edit real photo"}</b>'
            rows.append(f'<tr><th class="rowh">{label}{ref}</th>'
                        + "".join(cell(b, t, k, s) for k, s in columns) + "</tr>")
    ok = [r for r in results if r["ok"]]
    total = sum(r.get("cost_usd") or 0 for r in results)
    summary_rows = []
    for key in MODELS:
        recs = [r for r in results if r["model_key"] == key]
        if not recs:
            continue
        good = [r for r in recs if r["ok"]]
        lat = sorted(r["latency_s"] for r in good if r["latency_s"])
        med = lat[len(lat) // 2] if lat else 0
        avg_cost = (sum(r["cost_usd"] for r in good) / len(good)) if good else 0
        refused = sum(1 for r in recs if r["refused"] and not r["ok"])
        low_only = sum(1 for r in good if r.get("moderation") == "low")
        sc = (scores.get("models") or {}).get(key, {})
        crit = sc.get("criteria") or {}
        crit_cells = "".join(f"<td>{html.escape(str(crit.get(c, '')))}</td>" for c in CRITERIA)
        summary_rows.append(
            f"<tr><td>{html.escape(MODELS[key]['label'])}</td><td>{len(good)}/{len(recs)}</td><td>{refused}"
            f"{' (+' + str(low_only) + ' only at low)' if low_only else ''}</td><td>${avg_cost:.3f}</td><td>{med}s</td>"
            f"{crit_cells}<td><b>{html.escape(str(sc.get('overall', '')))}</b></td>"
            f"<td class='l'>{html.escape(sc.get('why', ''))}</td></tr>")
    doc = f"""<!doctype html><html lang="en"><meta charset="utf-8">
<title>Image model bench</title>
<style>
:root {{ --bg:#f5f3ee; --ink:#1d1f1b; --mute:#6b6d66; --card:#fff; --bad:#fbe9e7; --line:#dedbd2; }}
body {{ margin:0; padding:24px; background:var(--bg); color:var(--ink); font:13px/1.35 system-ui,-apple-system,sans-serif; }}
h1 {{ font-size:22px; margin:0 0 4px; }} p.sub {{ color:var(--mute); margin:0 0 16px; }}
table.grid {{ border-collapse:separate; border-spacing:8px; }}
table.grid th {{ font-size:12px; text-align:center; vertical-align:bottom; width:210px; }}
table.grid th small {{ color:var(--mute); font-weight:400; }}
th.rowh {{ text-align:left !important; vertical-align:top !important; width:150px !important; font-weight:400; }}
img.ref {{ display:block; width:140px; margin:8px 0 2px; border-radius:6px; }}
td {{ background:var(--card); border-radius:10px; padding:6px; vertical-align:top; width:210px; }}
td img {{ width:210px; aspect-ratio:4/5; object-fit:cover; border-radius:6px; display:block; }}
.meta {{ color:var(--mute); font-size:11px; margin-top:4px; }}
.score {{ font-size:11px; margin-top:3px; }}
.flag {{ font-size:11px; color:#a5521b; }}
.ph {{ width:210px; aspect-ratio:4/5; display:flex; align-items:center; justify-content:center; text-align:center;
       color:var(--mute); border:1px dashed var(--line); border-radius:6px; padding:8px; box-sizing:border-box; }}
td.bad {{ background:var(--bad); }} .ph.refused b {{ color:#b3261e; }}
table.sum {{ border-collapse:collapse; margin:8px 0 24px; background:var(--card); }}
table.sum td, table.sum th {{ border-bottom:1px solid var(--line); padding:6px 10px; width:auto; border-radius:0; text-align:left; }}
td.l {{ max-width:520px; }}
</style>
<h1>Image models for the post designer: same briefs, side by side</h1>
<p class="sub">5 businesses × (generate a 4:5 post photo, edit a real photo). One sample per model unless marked #2.
Cost = provider usage × official list price (Meta: flat $0.01/image). Recorded total for this sheet: ${total:.2f} over {len(ok)} images.</p>
<table class="sum"><tr><th>Model</th><th>Images</th><th>Refused</th><th>Avg cost / image</th><th>Median latency</th>
{''.join(f'<th>{html.escape(c)}</th>' for c in CRITERIA)}<th>Overall</th><th>Verdict</th></tr>
{''.join(summary_rows)}</table>
<table class="grid"><tr><th class="rowh"></th>{head}</tr>{''.join(rows)}</table>
</html>"""
    (out / "index.html").write_text(doc)
    print(f"wrote {out / 'index.html'} ({len(columns)} columns, {len(results)} records, ${total:.3f})")
    if args.png:
        render_png(out / "index.html", out / "comparison.png")


_RENDER_JS = r"""
import { createRequire } from 'node:module';
const [webPkg, input, output, chrome] = process.argv.slice(2);
const puppeteer = createRequire(webPkg)('puppeteer-core');
const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  await page.goto('file://' + input, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.evaluate(() => Promise.all([...document.images].map((img) =>
    img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  const size = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
  await page.setViewport({ width: size.w, height: Math.min(size.h, 16000) });
  await page.screenshot({ path: output, fullPage: true });
  console.log('wrote', output, JSON.stringify(size));
} finally {
  await browser.close();
}
"""


def render_png(html_path: Path, png_path: Path) -> None:
    """index.html -> PNG with headless Chrome, using puppeteer-core from web/node_modules (npm ci)."""
    import subprocess

    web_pkg = Path(__file__).resolve().parents[2] / "web" / "package.json"
    if not (web_pkg.parent / "node_modules" / "puppeteer-core").is_dir():
        raise SystemExit("puppeteer-core missing: run `cd web && npm ci` first.")
    chrome = os.environ.get("CHROME_PATH", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    script = html_path.parent / "render.mjs"
    script.write_text(_RENDER_JS)
    subprocess.run(["node", str(script), str(web_pkg), str(html_path), str(png_path), chrome], check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    run = sub.add_parser("run")
    run.add_argument("--out", required=True)
    run.add_argument("--refs", required=True)
    run.add_argument("--env", default=None, help="path to .env (default: walk up from this file)")
    run.add_argument("--models", default=",".join(DEFAULT_MODELS))
    run.add_argument("--businesses", default=",".join(BUSINESSES))
    run.add_argument("--tasks", default=",".join(TASKS))
    run.add_argument("--samples", type=int, default=1)
    run.add_argument("--budget", type=float, default=8.0, help="refuse to start if the estimate is above this")
    run.add_argument("--force", action="store_true", help="re-run ids that already have a result")
    run.add_argument("--no-retry-low", action="store_true", help="do not retry a refusal with moderation=low")
    run.add_argument("--dry-run", action="store_true")
    run.set_defaults(func=cmd_run)
    rep = sub.add_parser("report")
    rep.add_argument("--out", required=True)
    rep.add_argument("--openai-placeholder", action="store_true", help="show empty OpenAI columns if not run")
    rep.add_argument("--png", action="store_true", help="also render comparison.png with headless Chrome")
    rep.set_defaults(func=cmd_report)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    sys.exit(main())
