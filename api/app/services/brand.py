from app.services.gemini import lite_json
from app.services.jsonutil import loads
from app.services.schemas_llm import BRAND_LANGUAGE_SCHEMA


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
