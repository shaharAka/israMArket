#!/usr/bin/env python
"""Live smoke for the Design DNA: three sample businesses, their DNAs side by side.

    cd api && .venv/bin/python scripts/dna_smoke.py            # two bakeries + a yoga studio
    cd api && .venv/bin/python scripts/dna_smoke.py --out FILE # also write the DNAs as JSON

Fake signals (no site is read), a throwaway SQLite file (never the app's database), and the
real DNA model (DESIGN_DNA_MODEL, gemini-3.8-flash): at most 3 calls per business, a few
cents in all. Images are not generated.

The Gemini key is read from the repo-root `.env` (found by walking up from this file, or
--env) and only placed in the environment of this process: it is never printed or written.
"""

from __future__ import annotations

import argparse
import itertools
import json
import os
import sys
import tempfile
import time
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]

SAMPLES = [
    {
        "name": "תנור אבן",
        "field": "food",
        "location": "ראש פינה",
        "offerings": "לחם כוסמין ומחמצת מתנור אבן, חלות לשבת, פיתות זעתר",
        "palette": [
            {"hex": "#c2562b", "role": "primary", "name": "גחלים"},
            {"hex": "#5b3a24", "role": "ink", "name": "קרום שרוף"},
            {"hex": "#6b6b3a", "role": "secondary", "name": "זית"},
            {"hex": "#efe6d6", "role": "background", "name": "קמח"},
        ],
        "fonts": ["Frank Ruhl Libre", "Open Sans Hebrew"],
        "typography": "Frank Ruhl Libre",
        "visual_style": "בית אבן ישן בגליל, עץ זית, תנור עצים, הכול עבודת יד",
        "photography": "צילומים כהים וחמים של כיכרות ליד פתח התנור, אור הגחלים מהצד",
        "voice": "משפחתי, איטי, בלי פוזות",
        "logo_description": "חותמת עגולה חומה עם קשת של תנור",
    },
    {
        "name": "ענן",
        "field": "food",
        "location": "מודיעין",
        "offerings": "מאפי בצק עלים, קרופינים, עוגות שמרים ופיסטוק",
        "palette": [
            {"hex": "#a9c99a", "role": "primary", "name": "פיסטוק"},
            {"hex": "#f2c6c2", "role": "accent", "name": "ורוד אבקה"},
            {"hex": "#f6e7a6", "role": "secondary", "name": "חמאה"},
            {"hex": "#2a2a2a", "role": "ink", "name": "גרפיט"},
            {"hex": "#fbfaf6", "role": "background", "name": "לבן חם"},
        ],
        "fonts": ["Heebo", "Rubik"],
        "typography": "Heebo",
        "visual_style": "מינימליסטי ומודרני, פסטלים, דלפק אחד, הרבה אוויר",
        "photography": "צילומי סטודיו בהירים, מאפה אחד במרכז, צל חד של צהריים",
        "voice": "צעיר, משחקי ומדויק",
        "logo_description": "ענן ורוד מעוגל עם אותיות דקות",
    },
    {
        "name": "מרפסת",
        "field": "fitness",
        "location": "חיפה",
        "offerings": "שיעורי יוגה בבוקר ובערב בסטודיו על הכרמל, קבוצות קטנות",
        "palette": [
            {"hex": "#b08a5b", "role": "primary", "name": "שעם"},
            {"hex": "#3d5a6c", "role": "accent", "name": "כחול פלדה"},
            {"hex": "#e9e2d4", "role": "background", "name": "צמר"},
            {"hex": "#1f2326", "role": "ink", "name": "פחם"},
        ],
        "fonts": ["Assistant"],
        "typography": "Assistant",
        "visual_style": "באוהאוס על הכרמל, שעם וצמר, חלון פלדה, קווים ישרים",
        "photography": "הסטודיו הריק לפני שיעור, אור שחר נמוך דרך חלון הפלדה",
        "voice": "רגוע, מדויק, בלי קלישאות של ספא",
        "logo_description": "ריבוע כחול עם קו אופק דק",
    },
]


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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--env", help="path to the .env holding GEMINI_API_KEY")
    parser.add_argument("--out", help="also write the DNAs here as JSON")
    args = parser.parse_args()

    env = find_env(args.env)
    key = read_key(env, "GEMINI_API_KEY") if env else ""
    if not key:
        raise SystemExit("No GEMINI_API_KEY found in a .env above this script (or --env).")
    tmp = Path(tempfile.mkdtemp(prefix="dna-smoke-"))
    # Before anything from `app` is imported: a throwaway database, offline everything else.
    os.environ.update({
        "GEMINI_API_KEY": key,
        "DATABASE_URL": f"sqlite:///{tmp / 'smoke.db'}",
        "META_MODEL_API_KEY": "",
        "POST_MODEL": "gemini",
        "SITE_SCREENSHOT": "false",
        "DESIGN_DNA_ON_SCAN": "false",
    })
    sys.path.insert(0, str(API_DIR))

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.db import Base
    from app.models import Business, User
    from app.services import design_dna
    from app.services.jsonutil import dumps

    engine = create_engine(os.environ["DATABASE_URL"])
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine)()

    calls = {"n": 0, "seconds": 0.0}
    real_ask = design_dna._ask_model

    def counted(prompt, schema, images):
        calls["n"] += 1
        started = time.monotonic()
        try:
            return real_ask(prompt, schema, images)
        finally:
            calls["seconds"] += time.monotonic() - started

    design_dna._ask_model = counted

    made: list[tuple[str, dict]] = []
    for index, sample in enumerate(SAMPLES):
        user = User(email=f"smoke{index}@example.test", password_hash="x", full_name="smoke")
        db.add(user)
        db.flush()
        brand = {
            "business_name": sample["name"],
            "palette": sample["palette"],
            "typography": {"primary": sample["typography"], "mood": sample["voice"]},
            "visual_style": sample["visual_style"],
            "photography": sample["photography"],
            "voice": sample["voice"],
            "audience": "תושבי האזור",
            "logo_description": sample["logo_description"],
            "logo_url": "https://example.test/logo.png",
        }
        business = Business(
            user_id=user.id,
            name=sample["name"],
            business_type=sample["field"],
            offerings=sample["offerings"],
            location=sample["location"],
            scraped_profile_json=dumps({"brand_language": brand, "raw": {"fonts": sample["fonts"]},
                                        "photos_checked": True, "real_photos": []}),
        )
        db.add(business)
        db.commit()
        before = calls["n"]
        dna = design_dna.create_dna(db, business)
        db.commit()
        print(f"\n=== {sample['name']} ({sample['field']}): {calls['n'] - before} model call(s), source={dna['source']}")
        print(json.dumps(dna, ensure_ascii=False, indent=2))
        made.append((sample["name"], dna))

    print("\n=== distances (0 = same DNA, 1 = nothing in common; same field must be >= "
          f"{design_dna.FIELD_MIN_DISTANCE})")
    for (name_a, a), (name_b, b) in itertools.combinations(made, 2):
        same = "same field" if a["field"] == b["field"] else "other field"
        print(f"{name_a} vs {name_b} ({same}): {design_dna.distance(a, b)}  {design_dna.gene_distances(a, b)}")
    print(f"\nmodel calls: {calls['n']}, {calls['seconds']:.1f} s")
    if args.out:
        Path(args.out).write_text(json.dumps({name: dna for name, dna in made}, ensure_ascii=False, indent=2))
        print(f"wrote {args.out}")
    db.close()
    engine.dispose()


if __name__ == "__main__":
    main()
