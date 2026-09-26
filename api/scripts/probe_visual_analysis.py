#!/usr/bin/env python
"""Probe: can Gemini and Muse Spark read the *visual* pattern of a post or reel?

    cd api && .venv/bin/python scripts/probe_visual_analysis.py \\
        https://example.com/competitor-post.jpg ./frames/reel-first-frame.png

Each source (an image URL or a local file) is fetched once and the same bytes go to
every model, so a difference in the answer is the model, not the input. The question is
fixed: the hook in the first frame, framing, text-overlay position, colours, people and
product, pacing cues. Results go to .runtime/model-compare/visual-<timestamp>/ as
results.json and a side-by-side report.html (labelled by model — this is a capability
check, not a blind taste test).

Videos: Gemini takes the video file directly. Muse Spark is sent still frames (first,
~1s, ~3s) extracted with ffmpeg when ffmpeg is installed; the Meta API's video input
format is not verified yet, so without ffmpeg the video is skipped for Muse with a note.

Ready for Stream D: point it at competitor media URLs as soon as instagram_signal.py
collects them. No business data is sent — only the media and the fixed question.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = API_DIR.parent
DEFAULT_OUT = REPO_ROOT / ".runtime" / "model-compare"
MAX_BYTES = 25 * 1024 * 1024

VISUAL_PATTERN_SCHEMA = {
    "type": "object",
    "title": "VisualPattern",
    "properties": {
        "first_frame_hook": {"type": "string", "description": "מה עוצר את הגלילה בפריים הראשון, במשפט אחד"},
        "framing": {"type": "string", "description": "תקריב / מדיום / רחב, זווית, מי או מה במרכז"},
        "subject": {"type": "string", "description": "מוצר, אדם, ידיים, מקום — מה רואים בפועל"},
        "text_overlay": {
            "type": "object",
            "properties": {
                "present": {"type": "boolean"},
                "position": {"type": "string", "description": "top / middle / bottom / none"},
                "text": {"type": "string", "description": "הטקסט כפי שהוא מופיע, אם קריא"},
                "style": {"type": "string"},
            },
            "required": ["present", "position", "text", "style"],
        },
        "dominant_colours": {"type": "array", "items": {"type": "string"}, "description": "2-5 צבעים, בשם או hex"},
        "lighting_and_look": {"type": "string", "description": "טבעי / סטודיו / טלפון, חם / קר, מלוטש / אותנטי"},
        "pacing_cues": {"type": "string", "description": "לווידאו: קצב חיתוכים ותנועה. לתמונה: מחרוזת ריקה"},
        "why_it_works_or_not": {"type": "string"},
        "reusable_pattern": {"type": "string", "description": "דפוס אחד שעסק קטן יכול להעתיק בלי להעתיק את התוכן"},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
    },
    "required": [
        "first_frame_hook",
        "framing",
        "subject",
        "text_overlay",
        "dominant_colours",
        "lighting_and_look",
        "pacing_cues",
        "why_it_works_or_not",
        "reusable_pattern",
        "confidence",
    ],
}

PROMPT = """
נתח את הדפוס החזותי של הפוסט או הריל המצורף, כפי שהוא נראה בפיד של אינסטגרם.
תאר רק מה שרואים בפועל. אם משהו לא נראה או לא קריא — כתוב זאת, אל תנחש.
{context}
החזר: ההוק בפריים הראשון, מסגור, נושא, טקסט על המסך (האם יש, איפה, מה כתוב, סגנון),
צבעים דומיננטיים, תאורה ומראה, רמזי קצב (לווידאו), למה זה עובד או לא, ודפוס אחד לשימוש חוזר.
"""


def bootstrap() -> None:
    os.chdir(API_DIR)  # config.py reads ".env" / "../.env" relative to the cwd
    if str(API_DIR) not in sys.path:
        sys.path.insert(0, str(API_DIR))


def load_source(source: str) -> tuple[bytes, str]:
    from app.services.assets import normalize_mime, sniff_mime

    if source.startswith(("http://", "https://")):
        import httpx

        from app.services.netguard import safe_get

        with httpx.Client(timeout=30.0, headers={"User-Agent": "Mozilla/5.0 IsraMarket visual probe"}) as client:
            response = safe_get(client, source)
            response.raise_for_status()
            data = response.content
            declared = normalize_mime(response.headers.get("content-type", ""))
    else:
        path = Path(source).expanduser()
        data = path.read_bytes()
        declared = ""
    if len(data) > MAX_BYTES:
        raise ValueError(f"{source}: larger than {MAX_BYTES // (1024 * 1024)}MB")
    mime = sniff_mime(data) or declared
    if not mime.startswith(("image/", "video/")):
        raise ValueError(f"{source}: not an image or video ({mime or 'unknown type'})")
    return data, mime


def video_frames(data: bytes) -> list[tuple[bytes, str]]:
    """First frame, ~1s and ~3s as JPEGs. Empty list when ffmpeg is not installed."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return []
    frames = []
    with tempfile.TemporaryDirectory() as tmp:
        clip = Path(tmp) / "clip.mp4"
        clip.write_bytes(data)
        for index, seconds in enumerate((0, 1, 3)):
            out = Path(tmp) / f"f{index}.jpg"
            subprocess.run(
                [ffmpeg, "-loglevel", "error", "-ss", str(seconds), "-i", str(clip), "-frames:v", "1", "-q:v", "3", str(out)],
                check=False,
            )
            if out.exists() and out.stat().st_size:
                frames.append((out.read_bytes(), "image/jpeg"))
    return frames


def ask_gemini(prompt: str, media: tuple[bytes, str]) -> dict:
    from app.config import get_settings
    from app.services import gemini
    from app.services.jsonutil import loads

    raw = gemini.generate_json(
        model=get_settings().gemini_strategy_model,
        prompt=prompt,
        schema=VISUAL_PATTERN_SCHEMA,
        thinking_level="LOW",
        images=[media],
    )
    return loads(raw, {}) or {}


def ask_muse(prompt: str, media: tuple[bytes, str], model: str) -> dict:
    from app.services import meta_model

    data, mime = media
    if mime.startswith("video/"):
        frames = video_frames(data)
        if not frames:
            return {"skipped": "video: ffmpeg not installed, and Muse's video input format is unverified"}
        prompt += "\nמצורפים פריימים מהריל: הראשון, אחרי כשנייה ואחרי כשלוש שניות."
        return meta_model.chat_json(prompt, VISUAL_PATTERN_SCHEMA, model=model, images=frames)
    return meta_model.chat_json(prompt, VISUAL_PATTERN_SCHEMA, model=model, images=[media])


def _render(run_id: str, rows: list[dict], models: list[str]) -> str:
    def cell(value: object) -> str:
        if isinstance(value, dict) and "error" in value:
            return f"<p class='warn'>{html.escape(value['error'])}</p>"
        return f"<pre>{html.escape(json.dumps(value, ensure_ascii=False, indent=2))}</pre>"

    head = "".join(f"<th>{html.escape(model)}</th>" for model in models)
    body = ""
    for row in rows:
        preview = ""
        if row["mime"].startswith("image/") and row["source"].startswith(("http://", "https://")):
            preview = f"<img src='{html.escape(row['source'])}' alt=''>"
        cells = "".join(f"<td>{cell(row['answers'].get(model))}</td>" for model in models)
        body += f"<tr><th>{html.escape(row['source'])}<br><small>{html.escape(row['mime'])}</small>{preview}</th>{cells}</tr>"
    return f"""<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>ניתוח חזותי {run_id}</title>
<style>
:root {{ --bg:#f6f5f2; --card:#fff; --ink:#1d1d1f; --line:#e2e0da; --warn:#b3261e; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#141416; --card:#1e1e22; --ink:#ecebe8; --line:#33333a; --warn:#ff8a80; }} }}
body {{ margin:0; padding:24px 16px; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui,sans-serif; }}
table {{ border-collapse:collapse; width:100%; background:var(--card); }} th, td {{ border:1px solid var(--line); padding:8px; vertical-align:top; text-align:start; }}
pre {{ white-space:pre-wrap; margin:0; font:inherit; }} img {{ display:block; max-width:220px; margin-top:8px; }} .warn {{ color:var(--warn); }}
.wrap {{ overflow-x:auto; }}
</style></head><body><h1>ניתוח דפוס חזותי — {run_id}</h1>
<div class="wrap"><table><tr><th>מקור</th>{head}</tr>{body}</table></div></body></html>"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("sources", nargs="+", help="image/video URLs or local file paths")
    parser.add_argument("--models", default="gemini,muse-spark", help='comma list of "gemini", "muse-spark"')
    parser.add_argument("--muse-model", default=None, help="default: META_POST_MODEL (muse-spark-1.3)")
    parser.add_argument("--context", default="", help="optional note, e.g. 'competitor bakery, Tel Aviv'")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)
    bootstrap()

    from app.config import get_settings
    from app.services import meta_model

    models = [name.strip() for name in args.models.split(",") if name.strip()]
    muse_model = args.muse_model or get_settings().meta_post_model
    if "muse-spark" in models:
        meta_model.assert_allowed_model(muse_model)
    prompt = PROMPT.format(context=f"הקשר: {args.context}" if args.context else "")

    rows = []
    for source in args.sources:
        try:
            media = load_source(source)
        except Exception as exc:
            print(f"skip {source}: {exc}", file=sys.stderr)
            continue
        row = {"source": source, "mime": media[1], "answers": {}, "seconds": {}}
        # Muse first: a billing problem stops the run before Gemini is paid for.
        for model in sorted(models, key=lambda name: name != "muse-spark"):
            started = time.monotonic()
            try:
                if model == "gemini":
                    row["answers"][model] = ask_gemini(prompt, media)
                elif model == "muse-spark":
                    row["answers"][model] = ask_muse(prompt, media, muse_model)
                else:
                    row["answers"][model] = {"error": f"unknown model {model}"}
            except meta_model.BillingNotConfigured as exc:
                print(f"\n{exc}\n", file=sys.stderr)
                return 2
            except Exception as exc:
                row["answers"][model] = {"error": f"{type(exc).__name__}: {exc}"}
            row["seconds"][model] = round(time.monotonic() - started, 1)
        rows.append(row)
        print(f"done {source}")

    if not rows:
        print("nothing analysed", file=sys.stderr)
        return 1
    run_id = datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir = args.out / f"visual-{run_id}"
    run_dir.mkdir(parents=True, exist_ok=True)
    labels = [f"muse-spark ({muse_model})" if model == "muse-spark" else model for model in models]
    for row in rows:
        row["answers"] = {label: row["answers"].get(model) for model, label in zip(models, labels)}
    (run_dir / "results.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    (run_dir / "report.html").write_text(_render(run_id, rows, labels), encoding="utf-8")
    print(f"\nreport: {run_dir / 'report.html'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
