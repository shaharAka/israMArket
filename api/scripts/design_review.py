#!/usr/bin/env python
"""Designer review of rendered posts: a vision model judges each PNG against one rubric.

    cd api && .venv/bin/python scripts/design_review.py FOLDER                 # every *.png in FOLDER
    cd api && .venv/bin/python scripts/design_review.py FOLDER --meta meta.json
    cd api && .venv/bin/python scripts/design_review.py FOLDER --dry-run       # list, no calls

The rubric (docs/design-dna.md, Revision 1, "Quality gate"), 1 to 5 each:

    template_look      looks like a template or an ad (1 = the business's own post, 5 = a template; LOWER is better)
    subject_visible    the product or subject is visible, nothing covers it
    readable_on_phone  every word reads at feed size on a phone
    fits_direction     fits the business's art direction
    would_stop         a customer scrolling Instagram would stop

plus one honest line of notes in Hebrew and one in English.

`--meta` (optional) is a JSON file: {"<file name or stem>": {"business": "...", "direction":
{feel_he, world_he, photo_he, text_he, never_he} or "..."}}, and "default" applies to every
file without its own entry. A DNA fixture (web/app/dev/dna/fixtures/*.json) works as the
"default" entry: its `name` and `brand_dna.direction` are read.

Writes `.runtime/design-review/<timestamp>/review.json` and `index.html` (with small copies
of the images) at the repo root; `.runtime/` is gitignored. The Gemini key is read from the
repo-root `.env` (or --env), placed only in this process's environment, never printed.
"""

from __future__ import annotations

import argparse
import html
import io
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = API_DIR.parent

RUBRIC = (
    ("template_look", "looks like a template or an ad", "lower is better"),
    ("subject_visible", "product / subject visible", ""),
    ("readable_on_phone", "text readable on a phone at feed size", ""),
    ("fits_direction", "fits the brand direction", ""),
    ("would_stop", "a customer would stop scrolling", ""),
)
SCHEMA = {
    "type": "object",
    "title": "DesignReview",
    "properties": {
        **{key: {"type": "integer", "minimum": 1, "maximum": 5} for key, _label, _note in RUBRIC},
        "notes_he": {"type": "string"},
        "notes_en": {"type": "string"},
    },
    "required": [*(key for key, _label, _note in RUBRIC), "notes_he", "notes_en"],
}
SYSTEM = (
    "You are a senior art director reviewing social posts for a small business, and a "
    "customer scrolling Instagram on a phone. You are honest and specific. You answer only "
    "with the JSON asked for."
)
# What a feed post is on a phone: about 7 cm wide. The model sees it at that size.
FEED_WIDTH = 720
# Assumed list prices per 1M tokens for the estimate printed at the end (Gemini Flash
# family, paid tier); thinking is billed as output. An estimate, not an invoice.
ASSUMED_PRICES = {"in": 0.50, "out": 3.00}


def find_env(explicit: str | None) -> Path | None:
    if explicit:
        return Path(explicit)
    for folder in [Path(__file__).resolve().parent, *Path(__file__).resolve().parents]:
        candidate = folder / ".env"
        if candidate.is_file() and "GEMINI_API_KEY=" in candidate.read_text(encoding="utf-8", errors="ignore"):
            return candidate
    return None


def read_key(path: Path, name: str) -> str:
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if line.strip().startswith(f"{name}="):
            return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def load_meta(path: str | None) -> dict:
    if not path:
        return {}
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(data, dict) and isinstance(data.get("brand_dna"), dict):
        # A DNA fixture: one business for every file.
        return {"default": {"business": data.get("name") or "", "direction": data["brand_dna"].get("direction") or {}}}
    return data if isinstance(data, dict) else {}


def meta_for(meta: dict, image: Path) -> dict:
    return meta.get(image.name) or meta.get(image.stem) or meta.get("default") or {}


def direction_text(direction) -> str:
    if isinstance(direction, str):
        return direction
    if not isinstance(direction, dict) or not direction:
        return "not given"
    lines = [f"- {key}: {direction.get(key)}" for key in ("feel_he", "world_he", "photo_he", "text_he") if direction.get(key)]
    never = direction.get("never_he") or []
    if never:
        lines.append(f"- never: {'; '.join(never)}")
    return "\n".join(lines) or "not given"


def prompt_for(info: dict) -> str:
    rubric = "\n".join(
        f"- {key} (1-5): {label}{f' ({note})' if note else ''}" for key, label, note in RUBRIC
    )
    return f"""
This is one rendered Instagram post for an Israeli small business, shown at the size it has
in a phone's feed (about 7 cm wide). Judge it twice: as a designer who has seen a thousand
Canva templates, and as a customer scrolling past.

Business: {info.get('business') or 'not given'}
Its art direction (what its posts should feel like):
{direction_text(info.get('direction'))}

Score, 1 to 5 each:
{rubric}
For template_look, 1 means it looks like the business's own post and 5 means an obvious
template or ad (a kicker with a dash, an underlined call to action, a frame or ornament
from a list, a logo stamp, several small text elements).
subject_visible: 5 means the product or subject is clearly seen and no text or box covers it.
readable_on_phone: 5 means every word on the image reads at this size; small lines lower it.

notes_he: one honest line in everyday Hebrew, what works and what to change.
notes_en: the same line in English.
""".strip()


def feed_jpeg(data: bytes, width: int = FEED_WIDTH) -> bytes:
    from PIL import Image

    with Image.open(io.BytesIO(data)) as image:
        image = image.convert("RGB")
        if image.width > width:
            image = image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        image.save(out, format="JPEG", quality=86)
        return out.getvalue()


def review_one(data: bytes, info: dict, model: str) -> dict:
    from app.services.gemini import generate_json

    text = generate_json(
        model=model,
        prompt=prompt_for(info),
        schema=SCHEMA,
        thinking_level="LOW",
        images=[(feed_jpeg(data), "image/jpeg")],
        system=SYSTEM,
        attempts=2,
    )
    parsed = json.loads(text)
    out = {}
    for key, _label, _note in RUBRIC:
        try:
            out[key] = max(1, min(5, int(parsed.get(key))))
        except (TypeError, ValueError):
            out[key] = None
    out["notes_he"] = " ".join(str(parsed.get("notes_he") or "").split())[:300]
    out["notes_en"] = " ".join(str(parsed.get("notes_en") or "").split())[:300]
    return out


def summary(results: list[dict]) -> dict:
    out = {}
    for key, _label, _note in RUBRIC:
        values = [r["scores"][key] for r in results if r.get("scores") and r["scores"].get(key) is not None]
        out[key] = round(sum(values) / len(values), 2) if values else None
    return out


def write_report(folder: Path, results: list[dict], meta: dict) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    payload = {"created_at": meta["created_at"], "model": meta["model"], "source": meta["source"],
               "summary": summary(results), "posts": results}
    (folder / "review.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    heads = "".join(f"<th>{html.escape(label)}</th>" for _key, label, _note in RUBRIC)
    rows = []
    for item in results:
        scores = item.get("scores") or {}
        cells = "".join(f"<td>{scores.get(key) if scores.get(key) is not None else '–'}</td>" for key, _l, _n in RUBRIC)
        rows.append(
            "<tr>"
            f"<td><img src=\"{html.escape(item['thumb'])}\" alt=\"\"></td>"
            f"<td><b>{html.escape(item['file'])}</b><br>{html.escape(item.get('business') or '')}</td>"
            f"{cells}"
            f"<td dir=\"rtl\">{html.escape(scores.get('notes_he') or item.get('error') or '')}</td>"
            f"<td>{html.escape(scores.get('notes_en') or '')}</td>"
            "</tr>"
        )
    means = summary(results)
    mean_cells = "".join(f"<td>{means.get(key) if means.get(key) is not None else '–'}</td>" for key, _l, _n in RUBRIC)
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design review</title>
<style>
:root {{ --ink:#1d1d1f; --paper:#fafaf8; --line:#ddd; }}
@media (prefers-color-scheme: dark) {{ :root {{ --ink:#eee; --paper:#161616; --line:#333; }} }}
body {{ font: 14px/1.45 system-ui, sans-serif; color: var(--ink); background: var(--paper); margin: 24px 16px; }}
table {{ border-collapse: collapse; width: 100%; }}
td, th {{ border-bottom: 1px solid var(--line); padding: 8px; vertical-align: top; text-align: start; }}
img {{ width: 180px; height: auto; display: block; }}
.wrap {{ overflow-x: auto; }}
</style></head><body>
<h1>Design review</h1>
<p>{html.escape(meta['created_at'])} · model {html.escape(meta['model'])} · {len(results)} posts from {html.escape(meta['source'])}.
template_look: lower is better; every other score: higher is better.</p>
<div class="wrap"><table>
<tr><th></th><th>post</th>{heads}<th>הערות</th><th>notes</th></tr>
<tr><td></td><td><b>mean</b></td>{mean_cells}<td></td><td></td></tr>
{''.join(rows)}
</table></div></body></html>
"""
    (folder / "index.html").write_text(page, encoding="utf-8")


def run(images: list[Path], meta: dict, out: Path, model: str, *, reviewer=review_one, log=print) -> list[dict]:
    """Review every image and write the report into `out`. `reviewer` is injectable for tests."""
    results = []
    thumbs = out / "thumbs"
    thumbs.mkdir(parents=True, exist_ok=True)
    for index, image in enumerate(images):
        data = image.read_bytes()
        info = meta_for(meta, image)
        thumb = thumbs / f"{index:03d}.jpg"
        thumb.write_bytes(feed_jpeg(data, width=360))
        entry = {"file": image.name, "business": info.get("business") or "", "thumb": f"thumbs/{thumb.name}"}
        try:
            entry["scores"] = reviewer(data, info, model)
        except Exception as exc:  # one failed image never stops the review
            entry["scores"] = None
            entry["error"] = type(exc).__name__
        results.append(entry)
        log(f"[{index + 1}/{len(images)}] {image.name}: " + (
            ", ".join(f"{k}={entry['scores'][k]}" for k, _l, _n in RUBRIC) if entry.get("scores") else entry["error"]))
    write_report(out, results, {"created_at": datetime.now().isoformat(timespec="seconds"), "model": model,
                                "source": str(images[0].parent) if images else ""})
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("folder", help="a folder of rendered PNGs")
    parser.add_argument("--meta", help="JSON with business name + DNA direction per file (or a DNA fixture)")
    parser.add_argument("--env", help="path to the .env holding GEMINI_API_KEY")
    parser.add_argument("--model", default="gemini-3.8-flash")
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument("--out", help="report folder (default .runtime/design-review/<timestamp>)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    images = sorted(Path(args.folder).glob("*.png"))[: args.limit]
    if not images:
        raise SystemExit(f"No PNG files in {args.folder}.")
    meta = load_meta(args.meta)
    if args.dry_run:
        for image in images:
            print(image.name, "->", meta_for(meta, image).get("business") or "(no business)")
        return
    env = find_env(args.env)
    key = read_key(env, "GEMINI_API_KEY") if env else ""
    if not key:
        raise SystemExit("No GEMINI_API_KEY found in a .env above this script (or --env).")
    os.environ["GEMINI_API_KEY"] = key
    sys.path.insert(0, str(API_DIR))
    from app.services import gemini

    spent = {"in": 0, "out": 0, "calls": 0}

    def count(_model, usage):
        spent["calls"] += 1
        spent["in"] += usage.get("prompt_tokens") or 0
        spent["out"] += (usage.get("output_tokens") or 0) + (usage.get("thinking_tokens") or 0)

    gemini.USAGE_HOOKS.append(count)
    out = Path(args.out) if args.out else REPO_DIR / ".runtime" / "design-review" / time.strftime("%Y%m%d-%H%M%S")
    run(images, meta, out, args.model)
    cost = spent["in"] / 1e6 * ASSUMED_PRICES["in"] + spent["out"] / 1e6 * ASSUMED_PRICES["out"]
    print(f"\n{spent['calls']} calls, {spent['in']} input + {spent['out']} output tokens, ~${cost:.4f} (assumed prices)")
    print(f"report: {out / 'index.html'}")


if __name__ == "__main__":
    main()
