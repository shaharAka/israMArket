from datetime import date, timedelta

from app.services.gemini import strategy_json
from app.services.schemas_llm import DIAGNOSTIC_SCHEMA, RECOMMENDATION_SCHEMA
from app.services.jsonutil import loads


def week_of(today: date | None = None) -> str:
    current = today or date.today()
    monday = current - timedelta(days=current.weekday())
    return monday.isoformat()


def diagnose(business: dict, ga4: dict, meta: dict) -> dict:
    prompt = f"""
אבחן ביצועי תוכן לעסק ישראלי קטן. השתמש רק במדדים שסופקו.
חבר בין המרות GA4 לבין מדדי מטא/אינסטגרם. ציין במפורש אם צד אחד חסר נתונים.

עסק: {business}
GA4: {ga4}
מטא: {meta}
"""
    return loads(strategy_json(prompt, DIAGNOSTIC_SCHEMA), {})


def recommend(business: dict, strategy: dict, diagnostic: dict, ga4: dict, meta: dict) -> dict:
    prompt = f"""
הפק המלצות שבועיות קונקרטיות לשיפור ביצועים.
דוגמה לסגנון הרצוי: "המעורבות ברילס עלתה, אבל הנטישה באתר גבוהה — שנו את ה-CTA בפוסט מספר 3."
כל המלצה חייבת להסתמך על מדד שסופק או על פער מפורש בנתונים.

עסק: {business}
אסטרטגיה נוכחית: {strategy}
אבחון: {diagnostic}
GA4: {ga4}
מטא: {meta}
"""
    return loads(strategy_json(prompt, RECOMMENDATION_SCHEMA), {})
