from datetime import date, timedelta

from app.services.gemini import lite_json
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
כתבו בעברית פשוטה לבעלי עסק שאינם אנשי שיווק. headline: ממצא אחד, עד 25 מילים.
conversions הוא מספר אירועים שהוגדרו כחשובים ב-GA4, לא בהכרח פניות או הזמנות.
אין להציג אותו כמכירות בלי אירוע רכישה מאומת. לחיצה על וואטסאפ אינה פנייה שאושרה.
נתון חסר אינו אפס. אין להסיק עלייה או ירידה בלי תקופת השוואה שסופקה,
ואין להציג קשר כסיבה. הסבר אפשרי מנוסח כהשערה, עם מגבלת המדידה.
לכל היותר 2 פריטים בכל רשימה; כל הסבר עד 35 מילים. אם אין ראיות, השאירו רשימות ריקות.

עסק: {business}
GA4: {ga4}
מטא: {meta}
"""
    return loads(lite_json(prompt, DIAGNOSTIC_SCHEMA, thinking_level="MEDIUM"), {})


def recommend(business: dict, strategy: dict, diagnostic: dict, ga4: dict, meta: dict) -> dict:
    prompt = f"""
הפק המלצות שבועיות קונקרטיות לשיפור ביצועים.
כל המלצה חייבת להסתמך על מדד שסופק או על פער מפורש בנתונים.
כתבו בעברית פשוטה. week_summary: ממצא אחד עד 25 מילים.
החזירו לכל היותר 3 המלצות, החשובה תחילה; עדיפות high רק כשיש בעיה דחופה מבוססת.
כל title עד 12 מילים, action עד 35 מילים, evidence עד 45 מילים.
חברו את הפעולה ליעד ולפוסט או לעמוד הרלוונטיים בתוכנית שסופקה; אל תמציאו מספר פוסט.
הפעולה היא ניסוי מוצע: דבר אחד לשינוי, ואיך לבדוק אותו במדד של היעד.
conversions ב-GA4 אינו בהכרח פניות או הזמנות; לחיצה אינה מכירה.
בלי נתוני עבר שסופקו, אין לטעון לשינוי; בלי מדידה מתאימה, אין לטעון להצלחה במכירות.
כשאין מספיק נתונים, המליצו על בדיקת מדידה או על ניסוי קטן מתוך התוכנית וציינו את המגבלה.
אל תציעו ליצור פוסט חדש כשנדרש קודם תיקון בעמוד או במדידה. בלי פעולה שימושית, החזירו רשימה ריקה.

עסק: {business}
אסטרטגיה נוכחית: {strategy}
אבחון: {diagnostic}
GA4: {ga4}
מטא: {meta}
"""
    return loads(lite_json(prompt, RECOMMENDATION_SCHEMA, thinking_level="MEDIUM"), {})
