#!/usr/bin/env python
"""Live smoke for the Design DNA v2: a real business through the scraper path, plus three
fictional ones, their DNAs side by side, written as fixtures for the renderer's QA page.

    cd api && .venv/bin/python scripts/dna_smoke.py                    # tazizi.co.il + 3 samples
    cd api && .venv/bin/python scripts/dna_smoke.py --no-site          # the 3 samples only
    cd api && .venv/bin/python scripts/dna_smoke.py --site https://example.co.il --site-id example
    cd api && .venv/bin/python scripts/dna_smoke.py --out FILE         # also all DNAs in one JSON

The real business goes through what the product does after a site scan: the scraper reads
the public page (SSRF guard, byte caps), the brand model reads its colours, logo and voice,
its photos are kept (the vision check filters supplier banners), the logo is downloaded
and normalised (services/brand_logo.py), then the DNA model writes its art direction. One
of its photos also gets the layout analysis (subject, focal point, safe area).
The fictional businesses have hand-written signals and no logo file (the name signs).

Everything lands in a throwaway SQLite file and media folder (never the app's database).
Model calls: Gemini (GEMINI_API_KEY) only; images are not generated. The spend is
measured from the token counts the API reports and printed at the end (assumed list
prices, an estimate). The key is read from the repo-root `.env` (found by walking up from
this file, or --env) and only placed in this process's environment: never printed.

Fixtures: one JSON per business in web/app/dev/dna/fixtures/ (the renderer's QA page reads
them), and the real business's logo copy in web/public/dev-dna/<id>-logo.png.
"""

from __future__ import annotations

import argparse
import itertools
import json
import os
import shutil
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

API_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = API_DIR.parent
FIXTURES_DIR = REPO_DIR / "web" / "app" / "dev" / "dna" / "fixtures"
PUBLIC_DIR = REPO_DIR / "web" / "public" / "dev-dna"
# Assumed list prices per 1M tokens (paid tier; thinking billed as output), for the estimate.
ASSUMED_PRICES = {
    "gemini-3.8-flash": {"in": 0.50, "out": 3.00},
    "gemini-3.5-flash-lite": {"in": 0.10, "out": 0.40},
}
DEFAULT_PRICE = {"in": 0.50, "out": 3.00}

SAMPLES = [
    {
        "id": "even-oven",
        "name": "תנור אבן",
        "field": "food",
        "field_he": "מאפייה · ראש פינה",
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
        "id": "anan",
        "name": "ענן",
        "field": "food",
        "field_he": "קונדיטוריה · מודיעין",
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
        "id": "mirpeset",
        "name": "מרפסת",
        "field": "fitness",
        "field_he": "סטודיו ליוגה · חיפה",
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
    parser.add_argument("--out", help="also write all DNAs here as one JSON")
    parser.add_argument("--site", default="https://tazizi.co.il", help="the real business's public site")
    parser.add_argument("--site-id", default="tazizi")
    parser.add_argument("--site-field", default="fashion", help="its field key (business_fields.json)")
    parser.add_argument("--no-site", action="store_true", help="only the fictional businesses")
    parser.add_argument("--no-fixtures", action="store_true", help="do not write the web fixtures")
    args = parser.parse_args()

    env = find_env(args.env)
    key = read_key(env, "GEMINI_API_KEY") if env else ""
    if not key:
        raise SystemExit("No GEMINI_API_KEY found in a .env above this script (or --env). Nothing was run.")
    tmp = Path(tempfile.mkdtemp(prefix="dna-smoke-"))
    media = tmp / "media"
    media.mkdir()
    # Before anything from `app` is imported: a throwaway database, Gemini only.
    os.environ.update({
        "GEMINI_API_KEY": key,
        "DATABASE_URL": f"sqlite:///{tmp / 'smoke.db'}",
        "META_MODEL_API_KEY": "",
        "POST_MODEL": "gemini",
        "SITE_SCREENSHOT": "false",
        "DESIGN_DNA_ON_SCAN": "false",
        "BRAND_LOGO_COPY": "true",
        "PHOTO_ANALYSIS": "true",
        "BILLING_ENFORCE": "false",
    })
    sys.path.insert(0, str(API_DIR))

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.db import Base
    from app.models import Business, User
    from app.services import assets as assets_service
    from app.services import brand_logo, design_dna, gemini, images, photo_analysis
    from app.services.jsonutil import dumps

    patches = [mock.patch.object(images, "media_root", return_value=media),
               mock.patch.object(assets_service, "media_root", return_value=media)]
    for patch in patches:
        patch.start()

    spent: dict[str, dict] = {}

    def count(model, usage):
        row = spent.setdefault(model, {"calls": 0, "in": 0, "out": 0})
        row["calls"] += 1
        row["in"] += usage.get("prompt_tokens") or 0
        row["out"] += (usage.get("output_tokens") or 0) + (usage.get("thinking_tokens") or 0)

    gemini.USAGE_HOOKS.append(count)

    engine = create_engine(os.environ["DATABASE_URL"])
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine)()
    made: list[dict] = []
    users = itertools.count()

    def new_user():
        user = User(email=f"smoke{next(users)}@example.test", password_hash="x", full_name="smoke")
        db.add(user)
        db.flush()
        return user

    if not args.no_site:
        made.append(run_site(args, db, new_user, Business, design_dna, brand_logo, photo_analysis, dumps))
    for sample in SAMPLES:
        user = new_user()
        brand = {
            "business_name": sample["name"],
            "palette": sample["palette"],
            "typography": {"primary": sample["typography"], "mood": sample["voice"]},
            "visual_style": sample["visual_style"],
            "photography": sample["photography"],
            "voice": sample["voice"],
            "audience": "תושבי האזור",
            "logo_description": sample["logo_description"],
            # A fictional business has no logo file: the name signs its posts.
            "logo_url": "",
        }
        business = Business(
            user_id=user.id, name=sample["name"], business_type=sample["field"], offerings=sample["offerings"],
            location=sample["location"],
            scraped_profile_json=dumps({"brand_language": brand, "raw": {"fonts": sample["fonts"]},
                                        "photos_checked": True, "real_photos": []}),
        )
        db.add(business)
        db.commit()
        started = time.monotonic()
        dna = design_dna.create_dna(db, business)
        db.commit()
        print(f"\n=== {sample['name']} ({sample['field']}): source={dna['source']}, {time.monotonic() - started:.1f} s")
        print(json.dumps(dna, ensure_ascii=False, indent=2))
        made.append({"id": sample["id"], "name": sample["name"], "field": sample["field"], "field_he": sample["field_he"],
                     "website": "", "logo": "", "dna": dna, "brand": brand,
                     "swatches": swatch_view(design_dna.signals_for(db, business, with_images=False))})

    print("\n=== distances (0 = same DNA, 1 = nothing in common; same field must be >= "
          f"{design_dna.FIELD_MIN_DISTANCE})")
    for a, b in itertools.combinations(made, 2):
        same = "same field" if a["dna"]["field"] == b["dna"]["field"] else "other field"
        print(f"{a['name']} vs {b['name']} ({same}): {design_dna.distance(a['dna'], b['dna'])}  "
              f"{design_dna.gene_distances(a['dna'], b['dna'])}")

    total = 0.0
    print("\n=== spend (token counts reported by the API, assumed list prices)")
    for model, row in spent.items():
        price = ASSUMED_PRICES.get(model, DEFAULT_PRICE)
        cost = row["in"] / 1e6 * price["in"] + row["out"] / 1e6 * price["out"]
        total += cost
        print(f"{model}: {row['calls']} calls, {row['in']} in / {row['out']} out tokens, ~${cost:.4f}")
    print(f"total: ~${total:.4f}")

    if not args.no_fixtures:
        write_fixtures(made, media)
    if args.out:
        Path(args.out).write_text(json.dumps({item["id"]: item["dna"] for item in made}, ensure_ascii=False, indent=2))
        print(f"wrote {args.out}")
    for patch in patches:
        patch.stop()
    db.close()
    engine.dispose()
    shutil.rmtree(tmp, ignore_errors=True)


def swatch_view(signals: dict) -> list[dict]:
    return [{"hex": s.hex, "source": s.source, "role": s.role, "origin": s.origin, "share": s.share}
            for s in signals.get("swatches") or []]


def run_site(args, db, new_user, Business, design_dna, brand_logo, photo_analysis, dumps) -> dict:
    """The real business, through the scan's own steps."""
    from app.services.brand import filter_usable_photos
    from app.services.images import read_stored_bytes, store_image_bytes
    from app.services.scraper import fetch_photo_candidates, image_alt_for
    from app.services.strategy import scan_website

    started = time.monotonic()
    scanned = scan_website(args.site)
    raw = scanned.get("raw") or {}
    brand = scanned.get("brand_language") or {}
    extracted = scanned.get("extracted") or {}
    print(f"\n=== {args.site}: scanned in {time.monotonic() - started:.1f} s; platform={raw.get('platform')!r}, "
          f"logo_url={'yes' if brand.get('logo_url') else 'no'}, css colours={raw.get('colors')}, "
          f"logo colours={[c.get('hex') for c in (raw.get('color_evidence') or {}).get('logo') or []]}")
    user = new_user()
    business = Business(
        user_id=user.id,
        name=brand.get("business_name") or extracted.get("business_name") or args.site_id,
        website_url=args.site,
        business_type=args.site_field,
        offerings=", ".join(extracted.get("offers") or [])[:400],
        location=extracted.get("location") or "",
    )
    db.add(business)
    db.flush()
    stored_photos = []
    candidates = fetch_photo_candidates(raw.get("image_urls") or [])
    for photo in filter_usable_photos(candidates):
        public_url = store_image_bytes(business.id, "source-photo", photo["bytes"], photo["mime"])
        stored_photos.append({"url": photo.get("url", ""), "public_url": public_url,
                              "alt": image_alt_for(raw.get("image_alts"), photo.get("url", ""))})
    scanned["real_photos"] = stored_photos
    scanned["photos_checked"] = True
    business.scraped_profile_json = dumps(scanned)
    db.commit()
    record = brand_logo.ensure(business)
    db.commit()
    print(f"logo copy: status={(record or {}).get('status')}, logo_on={(record or {}).get('logo_on')}, "
          f"colours={[c['hex'] for c in (record or {}).get('colors') or []]}, size={(record or {}).get('width')}x"
          f"{(record or {}).get('height')}")
    dna = design_dna.create_dna(db, business)
    db.commit()
    print(f"\n=== {business.name} ({dna['field']}): source={dna['source']}")
    print(json.dumps(dna, ensure_ascii=False, indent=2))
    analysis = None
    loaded = read_stored_bytes(stored_photos[0]["public_url"]) if stored_photos else None
    which = "its first kept photo"
    if loaded is None and candidates:
        # The usability check kept none (supplier banners, text in the photo): the layout
        # analysis is still exercised on the first raw site photo, which is not kept.
        loaded, which = (candidates[0]["bytes"], candidates[0]["mime"]), "its first site photo (not kept)"
    if loaded:
        analysis = photo_analysis.analyse(db, business.id, loaded[0], loaded[1])
        again = photo_analysis.analyse(db, business.id, loaded[0], loaded[1])
        print(f"photo layout of {which}: {analysis}; second read from the cache: {again == analysis}")
    print(f"site photos: {len(candidates)} fetched, {len(stored_photos)} kept by the usability check")
    signals = design_dna.signals_for(db, business, with_images=False)
    return {"id": args.site_id, "name": business.name, "field": dna["field"], "field_he": "הלבשה תחתונה",
            "website": args.site, "logo": "", "dna": dna, "brand": {
                key: brand.get(key) for key in ("palette", "voice", "visual_style", "photography", "logo_description",
                                                "logo_url")},
            "swatches": swatch_view(signals), "logo_record": record, "photo_layout": analysis,
            "photos": len(stored_photos)}


def write_fixtures(made: list[dict], media: Path) -> None:
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    for item in made:
        dna = json.loads(json.dumps(item["dna"]))
        record = item.get("logo_record") or {}
        logo_path = ""
        if record.get("status") == "ok" and record.get("filename"):
            source = media / str(record["public_url"].split("/")[-2]) / record["filename"]
            if source.is_file():
                PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
                target = PUBLIC_DIR / f"{item['id']}-logo.png"
                shutil.copyfile(source, target)
                logo_path = f"/dev-dna/{target.name}"
        signature = dna.get("signature") or {}
        if signature.get("use_logo"):
            # The QA page has no /backend/media: the same logo, served by the web app.
            signature["logo_url_server"] = signature.get("logo_url")
            signature["logo_url"] = logo_path
        fixture = {
            "id": item["id"],
            "name": item["name"],
            "field": item["field"],
            "field_he": item["field_he"],
            "website": item["website"],
            "logo": logo_path,
            "brand_dna": dna,
            "brand_language": item.get("brand") or {},
            "color_evidence": item.get("swatches") or [],
            "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "generated_by": "api/scripts/dna_smoke.py",
        }
        if fixture["brand_language"].get("logo_url") and logo_path:
            fixture["brand_language"]["logo_url"] = logo_path
        path = FIXTURES_DIR / f"{item['id']}.json"
        path.write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {path.relative_to(REPO_DIR)}" + (f" and {logo_path}" if logo_path else ""))


if __name__ == "__main__":
    main()
