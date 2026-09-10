from app.services.gemini import lite_json
from app.services.jsonutil import loads
from app.services.schemas_llm import BRAND_LANGUAGE_SCHEMA, PHOTO_USABILITY_SCHEMA


def extract_brand_language(scraped: dict) -> dict:
    images = [(item["bytes"], item["mime"]) for item in scraped.get("images") or []]
    prompt = f"""
קרא את אתר העסק וחלץ שפת מותג אמיתית — גם עיצוב וגם מסרים.
השתמש רק במה שרואים באתר ובקבצים שצורפו. אל תמציא צבעים, פונטים או סיסמאות.

URL: {scraped.get("url")}
כותרת: {scraped.get("title")}
מטא: {scraped.get("meta")}
כותרות: {scraped.get("headings")}
כפתורים וקישורים: {scraped.get("buttons")}
צבעים שחולצו מה-CSS: {scraped.get("colors")}
פונטים שחולצו: {scraped.get("fonts")}
כתובות תמונות: {scraped.get("image_urls")}

טקסט מהאתר:
{scraped.get("text")}

הנחיות:
- palette חייבת להתבסס על הצבעים שחולצו או על התמונות שצורפו.
- voice ו-voice_examples חייבים להישמע כמו האתר, לא כמו סוכנות פרסום.
- do_say / dont_say הם מילים שהאתר כן/לא משתמש בהן.
- photography ו-visual_style מתארים מה רואים בתמונות ובפריסה.
"""
    brand = loads(
        lite_json(prompt, BRAND_LANGUAGE_SCHEMA, images=images or None, thinking_level="MEDIUM"),
        {},
    )
    if not brand.get("business_name") or not brand.get("palette") or not brand.get("voice"):
        raise RuntimeError("Gemini לא החזיר שפת מותג מלאה מהאתר. בדקו שהאתר ציבורי ושיש בו טקסט ותמונות.")
    return brand


def public_scan(scraped: dict, extracted: dict, brand: dict) -> dict:
    return {
        "raw": {key: value for key, value in scraped.items() if key != "images"},
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
