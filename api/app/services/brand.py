"""The business's brand, read off its own site: colours, logo, type, voice.

Colour comes from what a customer sees, strongest first: a rendered screenshot of the
homepage (when Chrome is available), the logo, the site's photographs — and only then the
stylesheet. On a website-builder site the stylesheet is mostly the builder's palette
(see `services/colors.py`), which is how a beige-and-pink shop was once reported navy.
"""

from __future__ import annotations

import colorsys

from app.services import colors
from app.services.gemini import extract_json, lite_json
from app.services.hebrew_style import HEBREW_STYLE
from app.services.jsonutil import loads
from app.services.schemas_llm import BRAND_LANGUAGE_SCHEMA, PHOTO_USABILITY_SCHEMA

# The vision model takes these; anything else (SVG, AVIF, GIF) is converted or skipped.
_MODEL_MIMES = {"image/png", "image/jpeg", "image/webp"}
_ROLES = ("primary", "accent", "background", "ink", "secondary")


def _fmt(evidence: list) -> str:
    if not evidence:
        return "אין"
    return ", ".join(
        item if isinstance(item, str) else f'{item["hex"]} ({round(float(item.get("share", 0)) * 100)}%)'
        for item in evidence
    )


def _model_images(scraped: dict) -> tuple[list[tuple[bytes, str]], list[str]]:
    """Images for the model, in order, with a Hebrew label for each. Site photos are
    labelled by their index in `scraped["images"]`, which `card_photo_index` refers to."""
    images: list[tuple[bytes, str]] = []
    labels: list[str] = []
    shot = scraped.get("screenshot")
    if shot and shot.get("bytes"):
        images.append((shot["bytes"], shot.get("mime") or "image/jpeg"))
        labels.append("צילום מסך של דף הבית כפי שלקוח רואה אותו (1280x900)")
    logo = scraped.get("logo") or {}
    if logo.get("bytes") and logo.get("mime") != "image/svg+xml":
        data, mime = logo["bytes"], logo["mime"]
        if mime not in _MODEL_MIMES:
            data, mime = colors.to_model_png(data), "image/png"
        if data:
            images.append((data, mime))
            labels.append("הלוגו של העסק")
    for index, photo in enumerate(scraped.get("images") or []):
        if photo.get("mime") in _MODEL_MIMES:
            images.append((photo["bytes"], photo["mime"]))
            labels.append(f"תמונת אתר {index}")
    return images, labels


def _hebrew_color_name(hex_value: str) -> str:
    rgb = colors.hex_to_rgb(hex_value) or (0, 0, 0)
    h, l, s = colorsys.rgb_to_hls(*(v / 255 for v in rgb))
    if l > 0.93:
        return "לבן"
    if l < 0.12:
        return "שחור"
    if s < 0.12:
        return "אפור"
    hue = h * 360
    if (hue < 45 or hue >= 330) and l > 0.72:
        return "בז׳" if hue < 45 else "ורוד בהיר"
    if hue < 15 or hue >= 345:
        return "אדום"
    if hue < 45:
        return "חום" if l < 0.45 else "כתום"
    if hue < 70:
        return "צהוב"
    if hue < 165:
        return "ירוק"
    if hue < 200:
        return "טורקיז"
    if hue < 255:
        return "כחול"
    if hue < 290:
        return "סגול"
    return "ורוד"


def clean_palette(palette: list, scraped: dict) -> list[dict]:
    """The model's palette, minus what customers never see.

    - Invalid and duplicate hex values are dropped.
    - A website-builder default is dropped unless the screenshot, the logo or the photos
      show that colour too (then it is really on the page).
    - If fewer than two colours survive, the measured colours fill in — logo first — so
      a scan with real evidence never ends with no palette.
    """
    evidence = scraped.get("color_evidence") or {}
    visible = [*(evidence.get("screenshot") or []), *(evidence.get("logo") or []), *(evidence.get("photos") or [])]
    builder = colors.platform_defaults(scraped.get("platform") or "")
    out: list[dict] = []
    seen: set[str] = set()
    for swatch in palette or []:
        if not isinstance(swatch, dict):
            continue
        value = colors.normalize_hex(str(swatch.get("hex") or ""))
        if not value or value in seen:
            continue
        if value in builder and not colors.shown_in(value, visible, tolerance=30):
            continue
        role = swatch.get("role") if swatch.get("role") in _ROLES else "secondary"
        item = {"hex": value, "role": role, "name": str(swatch.get("name") or "") or _hebrew_color_name(value)}
        if swatch.get("seen_in"):
            item["seen_in"] = swatch["seen_in"]
        out.append(item)
        seen.add(value)

    if len(out) < 2:
        measured = [*(evidence.get("logo") or []), *(evidence.get("screenshot") or []), *(evidence.get("photos") or [])]
        taken = {item["role"] for item in out}
        for item in measured:
            value = colors.normalize_hex(item.get("hex", ""))
            if not value or value in seen or colors.shown_in(value, out, tolerance=40):
                continue
            role = next((r for r in ("primary", "accent", "secondary") if r not in taken), "secondary")
            taken.add(role)
            out.append({"hex": value, "role": role, "name": _hebrew_color_name(value), "seen_in": "measured"})
            seen.add(value)
            if len(out) >= 4:
                break
    return out[:6]


def extract_brand_language(scraped: dict) -> dict:
    images, labels = _model_images(scraped)
    evidence = scraped.get("color_evidence") or {}
    platform = scraped.get("platform") or ""
    platform_note = (
        f"האתר בנוי על {platform}. צבעי ה-CSS של פלטפורמה כזו הם ברובם צבעי ברירת המחדל שלה, "
        "ואת המוכרים שבהם כבר הסרנו. אל תסיק מהם את צבעי המותג."
        if platform
        else ""
    )
    attached = "\n".join(f"{i + 1}. {label}" for i, label in enumerate(labels)) or "אין קבצים מצורפים."
    prompt = f"""
קרא את אתר העסק וחלץ שפת מותג אמיתית — גם עיצוב וגם מסרים.
השתמש רק במה שרואים באתר ובקבצים שצורפו. אל תמציא צבעים, פונטים או סיסמאות.

הקבצים המצורפים, לפי הסדר:
{attached}

צבעים שמדדנו ממה שהלקוח רואה (החזקים ביותר קודם):
- מצילום המסך: {_fmt(evidence.get("screenshot"))}
- מהלוגו: {_fmt(evidence.get("logo"))}
- מתמונות האתר: {_fmt(evidence.get("photos"))}
צבעים מה-CSS (ראיה משנית בלבד): {_fmt(evidence.get("css") or scraped.get("colors"))}
{platform_note}

URL: {scraped.get("url")}
כותרת: {scraped.get("title")}
מטא: {scraped.get("meta")}
כותרות: {scraped.get("headings")}
כפתורים וקישורים: {scraped.get("buttons")}
פונטים שחולצו: {scraped.get("fonts")}

טקסט מהאתר:
{scraped.get("text")}

הנחיות לצבעים (palette, 4 עד 6 צבעים):
- הצבעים חייבים להיות אלה שלקוח רואה באתר: קודם צילום המסך והלוגו, אחר כך התמונות. CSS רק כדי לדייק גוון שכבר רואים.
- אל תכלול צבע שלא מופיע בצילום המסך, בלוגו או בתמונות. לעולם אל תשתמש בצבעי ברירת מחדל של הפלטפורמה.
- primary: הצבע המזוהה ביותר עם העסק (בלוגו, בכפתורים, בפסים). accent: צבע ההדגשה (כפתורי קנייה, באנרים, מבצעים).
  background: צבע הרקע העיקרי של האתר. ink: צבע הטקסט העיקרי. secondary: צבע תומך נוסף.
- אם לאזורים גדולים באתר (פס עליון, תפריט, באנר, כותרת תחתונה) יש צבע רקע בולט שאינו לבן, הוא חלק מהמותג: כלול אותו.
- hex מדויק ככל האפשר לפי מה שרואים. seen_in: איפה ראית את הצבע.
- logo_description: איך הלוגו נראה (צורה, צבעים, אותיות).
- card_photo_index: המספר של "תמונת אתר" נקייה — צילום בלי טקסט צרוב, בלי לוגו ובלי באנר — שאפשר להניח עליו כותרת. אם אין כזו, -1.

הנחיות לשאר השדות:
- voice ו-voice_examples חייבים להישמע כמו האתר, לא כמו סוכנות פרסום.
- do_say / dont_say הם מילים שהאתר כן/לא משתמש בהן.
- photography ו-visual_style מתארים מה רואים בתמונות ובפריסה.
- voice_examples מצוטטים מהאתר כמו שהם. כללי הכתיבה שלמטה חלים על כל מה שאתה מנסח בעצמך בעברית.

{HEBREW_STYLE}
"""
    brand = loads(
        extract_json(prompt, BRAND_LANGUAGE_SCHEMA, images=images or None, thinking_level="MEDIUM"),
        {},
    )
    brand["palette"] = clean_palette(brand.get("palette") or [], scraped)
    if not brand.get("business_name") or not brand.get("palette") or not brand.get("voice"):
        raise RuntimeError("לא הצלחנו לקרוא מהאתר את הצבעים והסגנון של העסק. בדקו שהאתר פתוח לכולם ושיש בו טקסט ותמונות.")
    brand["logo_url"] = scraped.get("logo_url") or ""
    photos = scraped.get("images") or []
    index = brand.pop("card_photo_index", -1)
    brand["card_photo_url"] = ""
    if isinstance(index, int) and 0 <= index < len(photos):
        brand["card_photo_url"] = photos[index].get("url") or ""
    return brand


def public_scan(scraped: dict, extracted: dict, brand: dict) -> dict:
    """The scan as stored and cached. Image bytes (photos, logo, screenshot) never leave
    memory: `raw` must stay JSON for the database, and bytes are not the owner's data to
    keep. The logo's URL is kept so later cards can draw it."""
    return {
        "raw": {
            key: value
            for key, value in scraped.items()
            if key not in {"images", "logo", "screenshot"}
        },
        "extracted": extracted,
        "brand_language": brand,
    }


def filter_usable_photos(photos: list[dict]) -> list[dict]:
    """Keep only photographs a headline can be laid over.

    Scraping a real storefront surfaces the *supplier's* promotional banners as often as
    the shop's own photography — a model shot with "25% off" and a third-party brand
    burned into the pixels. Using one as a card background puts our headline on top of
    someone else's text, repeats a discount that may have expired, and republishes a
    supplier's asset. Text and logos baked into an image are trivially visible to a
    vision model and effectively invisible to a filename or size heuristic, so ask it.

    Fails open: if the check cannot run, the photos are kept rather than losing the
    business's own imagery entirely.
    """
    if not photos:
        return []
    prompt = (
        "אתה מעצב גרפי שבודק תמונות לפני הנחת כיתוב עליהן.\n"
        "לפניך מספר תמונות שנאספו מאתר של עסק. עבור כל תמונה קבע אם היא צילום נקי "
        "שאפשר להניח עליו כותרת בעברית, או שאי אפשר.\n\n"
        "פסול תמונה אם יש בה: טקסט או אותיות צרובות, לוגו, סימן מים, מחיר, "
        "באנר מבצע מעוצב, מסגרת מעוצבת, או מיתוג של מותג/ספק אחר.\n"
        "פסול גם תמונה שאיכותה גרועה מכדי לשמש ככרטיס: מטושטשת או מרוחה בתנועה, "
        "חשוכה או חשופה מדי, תמונה מקרית, זווית מביכה, או רזולוציה נמוכה מדי.\n"
        "אשר רק תמונה שהיא צילום טוב: מוצר, חומר, ידיים בעבודה, חלל, או דגם — "
        "חד, חשוף נכון, בלי כיתוב ובלי גרפיקה.\n"
        "החזר את האינדקסים של התמונות הכשירות בלבד."
    )
    try:
        parsed = loads(
            lite_json(
                prompt,
                PHOTO_USABILITY_SCHEMA,
                images=[(p["bytes"], p["mime"]) for p in photos],
                thinking_level="LOW",
            ),
            {},
        )
    except Exception:
        return photos
    keep = parsed.get("usable_indexes")
    if not isinstance(keep, list):
        return photos
    allowed = {i for i in keep if isinstance(i, int)}
    return [p for i, p in enumerate(photos) if i in allowed]
