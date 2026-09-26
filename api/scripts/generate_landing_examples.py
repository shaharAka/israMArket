#!/usr/bin/env python
"""Write the landing page's example posts with the app's own post-writing stack.

    cd api && .venv/bin/python scripts/generate_landing_examples.py            # text only
    cd api && .venv/bin/python scripts/generate_landing_examples.py --images   # + photos
    cd api && .venv/bin/python scripts/generate_landing_examples.py --only bakery

Every business below is FICTIONAL: invented names, invented facts, no real brand, logo or
person. The landing carousel shows what a post from IsraMarket looks like, and a real
business on it would be both a trademark problem and an implied endorsement.

Each example is a small research -> direction -> post story, because the plan and the
ongoing research are the product and the post is only its output.

What it does, per profile:
1. Builds one prompt (profile + fictional research observations + audience + goal + a
   moment from the Israeli calendar, `services/calendar_il.py`) with the shared
   `HEBREW_STYLE` block, and runs it through `post_model_router.write_posts_with(--model,
   ...)`, the same entry point the app uses to write posts. The reply is an insight ("מה
   גילינו"), the month's direction and what to check, plus a post in the `Idea` shape from
   docs/onboarding-v2.md, so the landing and `/start` explain "why this post" the same way.
2. With --images, for profiles marked `photo`, renders one photograph through the app's
   image service (`images.build_image_prompt` + `gemini.generate_image_bytes`) and saves a
   1080px JPEG under web/public/examples/.
3. Writes web/components/landing/examples.ts, and the raw replies under
   .runtime/landing-examples/<timestamp>/ for review.

The generated Hebrew is hand-reviewed against web/HEBREW-COPY.md before it ships, and
those fixes live in examples.ts. Re-running overwrites them, so review the diff.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import time
from datetime import date, datetime
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = API_DIR.parent
sys.path.insert(0, str(API_DIR))

from app.services import calendar_il  # noqa: E402
from app.services.hebrew_style import HEBREW_STYLE  # noqa: E402
from app.services.jsonutil import loads  # noqa: E402

WEB_DIR = REPO_ROOT / "web"
OUT_TS = WEB_DIR / "components" / "landing" / "examples.ts"
PHOTO_DIR = WEB_DIR / "public" / "examples"
RUNTIME_DIR = REPO_ROOT / ".runtime" / "landing-examples"

GOAL_HE = {
    "sales": "מכירות",
    "brand_awareness": "חשיפה, שיותר אנשים יכירו את העסק",
    "leads": "פניות, שיותר אנשים יפנו וישאלו",
    "personal_brand": "מיתוג אישי, שיכירו את בעל העסק כמומחה",
}

# --- the fictional businesses ------------------------------------------------------
# `moment` is either a calendar_il event name (resolved to its next date) or a plain
# Hebrew description of a non-holiday moment. `facts` are the only concrete details the
# model may use; it is told not to invent anything else (prices, discounts, numbers).
PROFILES: list[dict] = [
    {
        "slug": "bakery",
        "sources": ["האתר", "אינסטגרם", "לוח השנה"],
        "observations": [
            "באינסטגרם של המאפייה, סרטונים של הטיגון בבוקר מקבלים יותר תגובות מתמונות של המדף",
            "בחנוכה שעבר רוב ההזמנות לגנים הגיעו בוואטסאפ, ברגע האחרון",
            "הורים בשכונה שואלים כל שנה מתי אפשר להזמין לגן",
        ],
        "business_name": "פרג ושמרים",
        "type_label": "מאפייה שכונתית",
        "business_type": "מאפייה / קפה / מסעדה",
        "city": "כפר סבא",
        "offerings": "לחמי מחמצת, חלות, עוגות שמרים, ובחנוכה סופגניות שמטגנים כל בוקר",
        "facts": [
            "הסופגניות מטוגנות כל בוקר במקום, במילוי ריבת חלב או ריבת תות ביתית",
            "אפשר להזמין מראש בוואטסאפ ולאסוף בלי לעמוד בתור",
            "בחנוכה התור בבוקר נמשך עד הרחוב",
        ],
        "voice": "חמה, שכונתית, קצת הומור",
        "audience": "משפחות בשכונה שקונות לחג ולגן",
        "goal": "sales",
        "moment": "חנוכה",
        "timing_hint": "שבועיים לפני חנוכה, כשמתחילים להזמין לגן ולמסיבות",
        "palette": [
            {"hex": "#6b3f24", "role": "primary", "name": "קרום אפוי"},
            {"hex": "#e0a42b", "role": "accent", "name": "חרדל"},
            {"hex": "#f6ecd9", "role": "background", "name": "קמח"},
            {"hex": "#2a1a10", "role": "ink", "name": "קפה"},
        ],
        "template": "lower_editorial",
        "photo": True,
        "visual": "warm neighbourhood bakery, handmade, flour and worn wood, morning light",
    },
    {
        "slug": "lingerie",
        "sources": ["אינסטגרם", "פייסבוק", "לוח השנה"],
        "observations": [
            "בתגובות בפייסבוק לקוחות כותבות שהזמינו חזייה באתר גדול והיא לא ישבה טוב",
            "לפני בלאק פריידי הרשתות הגדולות מציפות את הפיד במבצעים",
            "מי שמגיעה למדידה בפעם הראשונה בדרך כלל חוזרת",
        ],
        "business_name": "תפר עדין",
        "type_label": "הלבשה תחתונה ומידות",
        "business_type": "חנות פיזית / קמעונאות",
        "city": "חיפה",
        "offerings": "חזיות והלבשה תחתונה בכל המידות, מדידה אישית בחנות",
        "facts": [
            "מדידה אישית בחדר סגור, בלי לחץ לקנות",
            "יש מידות שלא מוצאים ברשתות",
            "הרבה לקוחות מגלות אצלנו שהן לובשות מידה לא נכונה",
        ],
        "voice": "ישירה, רגישה, בגובה העיניים, בלי מבוכה",
        "audience": "נשים בנות 30 עד 55 שקונות חזיות אונליין ולא מרוצות",
        "goal": "sales",
        "moment": "בלאק פריידי",
        "timing_hint": "שבוע לפני בלאק פריידי, לפני שמזמינים עוד חזייה באתר",
        "palette": [
            {"hex": "#5a2a45", "role": "primary", "name": "שזיף"},
            {"hex": "#e8b4a8", "role": "accent", "name": "אבקה"},
            {"hex": "#f7ece9", "role": "background", "name": "תחרה"},
            {"hex": "#2b1420", "role": "ink", "name": "שזיף כהה"},
        ],
        "template": "type_hero",
        "photo": False,
    },
    {
        "slug": "beauty",
        "sources": ["האתר", "אינסטגרם"],
        "observations": [
            "באינסטגרם רוב השאלות בהודעות פרטיות הן על עור יבש ומגרד",
            "באתר של הקליניקה אין שום הסבר מה קורה בפגישה הראשונה",
            "לקוחות חדשות מתלבטות אם הטיפול מתאים לעור רגיש",
        ],
        "business_name": "מרווה",
        "type_label": "קוסמטיקה וטיפולי פנים",
        "business_type": "קליניקה, יופי ובריאות",
        "city": "מודיעין",
        "offerings": "טיפולי פנים, טיפול לעור יבש ורגיש, ייעוץ לשגרת טיפוח בבית",
        "facts": [
            "קליניקה של קוסמטיקאית אחת, בתיאום מראש",
            "בפגישה הראשונה בודקים את העור ובונים שגרה פשוטה לבית",
            "בחורף, עם החימום בבית, העור מתייבש ומתחיל לגרד",
        ],
        "voice": "רגועה, מקצועית, מסבירה בפשטות",
        "audience": "נשים שהעור שלהן מתייבש בחורף",
        "goal": "leads",
        "moment": "הימים הקרים הראשונים, כשמדליקים חימום בבית",
        "timing_hint": "הימים הקרים הראשונים של החורף",
        "palette": [
            {"hex": "#4f6b58", "role": "primary", "name": "מרווה"},
            {"hex": "#c8a96a", "role": "accent", "name": "דבש"},
            {"hex": "#eef1ea", "role": "background", "name": "עלה בהיר"},
            {"hex": "#1f2a22", "role": "ink", "name": "יער"},
        ],
        "template": "type_hero",
        "photo": False,
    },
    {
        "slug": "accountant",
        "sources": ["האתר", "פייסבוק", "לוח השנה"],
        "observations": [
            "בקבוצות של עצמאים בפייסבוק חוזרת כל דצמבר אותה שאלה: מה עוד אפשר להוציא לפני סוף השנה",
            "באתר של המשרד אין אף הסבר לעצמאים חדשים",
            "רוב הפניות מגיעות מהמלצה של חבר, לא מהאתר",
        ],
        "business_name": "ספרות",
        "type_label": "הנהלת חשבונות לעצמאים",
        "business_type": 'שירותים מקצועיים (עו"ד, רו"ח, ייעוץ)',
        "city": "תל אביב",
        "offerings": "הנהלת חשבונות ודוחות שנתיים לעוסקים פטורים ומורשים, ליווי לעצמאים חדשים",
        "facts": [
            "הוצאה שמשלמים עד 31 בדצמבר נכנסת לדוח של השנה הזאת",
            "עצמאים חדשים הרבה פעמים לא יודעים אילו הוצאות מוכרות",
            "שיחת היכרות ראשונה בטלפון, בלי התחייבות",
        ],
        "voice": "ברורה, רגועה, בלי מילים של רואי חשבון",
        "audience": "עצמאים בשנה הראשונה שלהם",
        "goal": "leads",
        "moment": "סוף שנה אזרחית",
        "timing_hint": "דצמבר, לפני שהשנה נסגרת",
        "palette": [
            {"hex": "#1f2f4a", "role": "primary", "name": "כחול כהה"},
            {"hex": "#f2c14e", "role": "accent", "name": "צהוב מרקר"},
            {"hex": "#f4f5f7", "role": "background", "name": "נייר"},
            {"hex": "#121a28", "role": "ink", "name": "דיו"},
        ],
        "template": "type_hero",
        "photo": False,
    },
    {
        "slug": "yoga",
        "sources": ["אינסטגרם", "טיקטוק", "לוח השנה"],
        "observations": [
            "בטיקטוק, סרטונים קצרים של תרגיל אחד למתחילים משותפים יותר מסרטונים ארוכים",
            "מתחילים כותבים בפרטי שהם מפחדים להיות הכי פחות גמישים בחדר",
            "בינואר אנשים מחפשים להתחיל שגרה חדשה",
        ],
        "business_name": "סטודיו נשימה",
        "type_label": "יוגה ופילאטיס",
        "business_type": "סטודיו לאימון / ספורט",
        "city": "פרדס חנה",
        "offerings": "שיעורי יוגה ופילאטיס בקבוצות קטנות, סדרה למתחילים",
        "facts": [
            "סדרה למתחילים שנפתחת בתחילת ינואר, בערב",
            "קבוצות קטנות, המורה מכירה כל אחד בשם",
            "לא צריך גמישות ולא ניסיון, רק מזרן",
        ],
        "voice": "רכה, מזמינה, בלי קלישאות של רוחניות",
        "audience": "אנשים שרוצים להתחיל לזוז אבל מפחדים שלא יעמדו בקצב",
        "goal": "leads",
        "moment": "חיסולי חורף ושנה אזרחית חדשה",
        "timing_hint": "תחילת ינואר, כשמחליטים להתחיל משהו חדש",
        "palette": [
            {"hex": "#b5573a", "role": "primary", "name": "טרקוטה"},
            {"hex": "#e9c9a0", "role": "accent", "name": "חול"},
            {"hex": "#f7efe6", "role": "background", "name": "פשתן"},
            {"hex": "#2f2520", "role": "ink", "name": "אדמה"},
        ],
        "template": "split_panel",
        "photo": True,
        "visual": "calm small yoga studio, wooden floor, soft natural window light, linen, plants",
    },
    {
        "slug": "ceramics",
        "sources": ["האתר", "אינסטגרם", "טיקטוק"],
        "observations": [
            "בטיקטוק, סרטונים של הידיים על האובניים נצפים יותר מתמונות של כלי גמור",
            "רוב הקונים באתר מגיעים מאינסטגרם, לא מחיפוש בגוגל",
            "סדרות קודמות נגמרו מהר, ומי שפספס שאל מתי תהיה עוד",
        ],
        "business_name": "כד וכוס",
        "type_label": "קרמיקה בעבודת יד, חנות אונליין",
        "business_type": "חנות אונליין (אי-קומרס)",
        "city": "משלוחים לכל הארץ",
        "offerings": "ספלים, קערות וצלחות מקרמיקה בעבודת יד, סדרות קטנות",
        "facts": [
            "כל כלי נעשה ביד, אז אין שני ספלים זהים",
            "סדרת החורף: ספלים גדולים לתה ולמרק, בגוונים של ים בחורף",
            "הסדרה עולה לאתר ביום ראשון, בכמות קטנה",
        ],
        "voice": "שקטה, אסתטית, מדייקת בפרטים",
        "audience": "מי שאוהבים כלים יפים לבית ומחפשים מתנה שלא קונים ברשת",
        "goal": "brand_awareness",
        "moment": "השקה של סדרת החורף ביום ראשון",
        "timing_hint": "ימים לפני שהסדרה החורפית עולה לאתר",
        "palette": [
            {"hex": "#2b4b5c", "role": "primary", "name": "ים בחורף"},
            {"hex": "#d9774b", "role": "accent", "name": "חימר"},
            {"hex": "#f1ede6", "role": "background", "name": "גלזורה"},
            {"hex": "#16252d", "role": "ink", "name": "צפחה"},
        ],
        "template": "type_hero",
        "photo": False,
    },
    {
        "slug": "interior",
        "sources": ["אינסטגרם", "פייסבוק"],
        "observations": [
            "באינסטגרם, פוסטים של לפני ואחרי בדירה קטנה נשמרים יותר מתמונות של דירה גמורה",
            "בקבוצות של דירה ראשונה בפייסבוק שואלים איך מכניסים שולחן אוכל לסלון קטן",
            "אחרי החגים הרבה מספרים שלא היה איפה להושיב את כולם",
        ],
        "business_name": "קו אופק",
        "type_label": "עיצוב פנים לדירות קטנות",
        "business_type": "עיצוב / אדריכלות / נדל״ן",
        "city": "רמת גן",
        "offerings": "תכנון ועיצוב לדירות קטנות, פתרונות אחסון, ייעוץ חד פעמי",
        "facts": [
            "המעצבת מתמחה בדירות של 2 עד 3 חדרים",
            "פגישת ייעוץ אחת בבית, עם רשימה של מה לשנות",
            "הרבה פעמים הבעיה היא לא הגודל אלא איפה שמים את השולחן",
        ],
        "voice": "חכמה, מעשית, עם טיפים אמיתיים",
        "audience": "זוגות צעירים בדירה ראשונה ששכורה או קנויה",
        "goal": "personal_brand",
        "moment": "אחרי החגים, כשאירחו את כל המשפחה בסלון קטן",
        "timing_hint": "מיד אחרי חגי תשרי",
        "palette": [
            {"hex": "#2e2e2c", "role": "primary", "name": "פחם"},
            {"hex": "#8a8f5a", "role": "accent", "name": "זית"},
            {"hex": "#efebe4", "role": "background", "name": "טיח"},
            {"hex": "#1b1b1a", "role": "ink", "name": "גרפיט"},
        ],
        "template": "framed_inset",
        "photo": True,
        "visual": "small bright Israeli apartment living room, clever storage, warm minimal, lived-in",
    },
    {
        "slug": "cabins",
        "sources": ["האתר", "אינסטגרם", "לוח השנה"],
        "observations": [
            "באתר, הדף הכי נצפה הוא התמונות של הבקתה בגשם",
            "זוגות מזמינים סופ״ש של חורף שבועיים עד שלושה מראש",
            "באינסטגרם, סרטון של האח הדולקת קיבל יותר תגובות מכל תמונת נוף",
        ],
        "business_name": "עננה",
        "type_label": "צימרים בגליל העליון",
        "business_type": "תיירות ואירוח",
        "city": "הגליל העליון",
        "offerings": "3 בקתות עץ לזוגות, עם אח ונוף להרים",
        "facts": [
            "בכל בקתה יש אח עצים, והעצים מחכים מוכנים",
            "ארוחת בוקר מגיעה לבקתה בסלסלה",
            "בחורף, כשיורד גשם, רואים מהמרפסת את העננים על ההר",
        ],
        "voice": "שקטה, ציורית, בלי גוזמאות",
        "audience": "זוגות שמחפשים סופ״ש שקט בחורף",
        "goal": "sales",
        "moment": "סופי השבוע הגשומים הראשונים",
        "timing_hint": "לפני סופי השבוע הגשומים של החורף",
        "palette": [
            {"hex": "#2f4b3b", "role": "primary", "name": "אורן"},
            {"hex": "#d4a248", "role": "accent", "name": "אש באח"},
            {"hex": "#f2efe7", "role": "background", "name": "ערפל"},
            {"hex": "#18241d", "role": "ink", "name": "יער בלילה"},
        ],
        "template": "cover_type",
        "photo": True,
        "visual": "wooden cabin interior in the Galilee hills, fireplace, rain on the window, misty mountain view",
    },
]

IDEA_SCHEMA = {
    "type": "object",
    "title": "LandingExampleIdea",
    "properties": {
        "insight": {
            "type": "string",
            "description": "מה גילינו: תצפית אחת קונקרטית מהמחקר, עד 14 מילים, כתצפית או הנחה לבדיקה. בלי מספרים",
        },
        "direction": {
            "type": "string",
            "description": "הכיוון לחודש: משפט אחד שנובע מהתצפית, עד 12 מילים",
        },
        "check": {
            "type": "string",
            "description": "מה בודקים בסוף החודש כדי לדעת אם הכיוון נכון, עד 8 מילים",
        },
        "title": {"type": "string", "description": "כותרת פנימית קצרה לפוסט"},
        "format": {"type": "string", "enum": ["image", "carousel", "reel", "story"]},
        "hook": {"type": "string", "description": "משפט הפתיחה של הפוסט, עד 12 מילים"},
        "caption": {"type": "string", "description": "הכיתוב המלא, 2 עד 4 משפטים קצרים"},
        "cta": {"type": "string", "description": "קריאה לפעולה, 2 עד 4 מילים"},
        "overlay_headline": {"type": "string", "description": "הכותרת שמודפסת על הכרטיס, עד 6 מילים"},
        "overlay_badge": {"type": "string", "description": "תווית קטנה על הכרטיס, עד 2 מילים, או ריק"},
        "scene_description": {
            "type": "string",
            "description": "In English: what the photograph shows, one or two sentences",
        },
        "why": {
            "type": "object",
            "properties": {
                "audience": {"type": "string", "description": "למי הפוסט פונה, 2 עד 6 מילים"},
                "goal_he": {"type": "string", "description": "מה הפוסט אמור להשיג, 2 עד 5 מילים"},
                "timing_he": {"type": "string", "description": "למה עכשיו, 2 עד 6 מילים"},
                "reason_he": {
                    "type": "string",
                    "description": "משפט אחד פשוט, עד 16 מילים: הקהל + המטרה + פרט אמיתי מהעסק",
                },
            },
            "required": ["audience", "goal_he", "timing_he", "reason_he"],
        },
    },
    "required": [
        "insight",
        "direction",
        "check",
        "title",
        "format",
        "hook",
        "caption",
        "cta",
        "overlay_headline",
        "why",
    ],
}


def resolve_moment(moment: str, today: date) -> str:
    """A calendar_il event name becomes 'name (date)'; anything else is passed through."""
    year, month = today.year, today.month
    for _ in range(12):
        for event in calendar_il.israeli_events_for_month(year, month):
            if event["name"] == moment and event["date"] >= today.isoformat():
                return f"{moment} ({event['date']}). {event['note']}"
        month += 1
        if month > 12:
            year, month = year + 1, 1
    return moment


def build_prompt(profile: dict, today: date) -> str:
    facts = "\n".join(f"- {fact}" for fact in profile["facts"])
    observations = "\n".join(f"- {item}" for item in profile["observations"])
    return f"""
אתה עובד על השיווק של עסק ישראלי קטן לחודש הקרוב. עשה שלושה דברים, בסדר הזה:
1. מחקר: בחר תצפית אחת מהמחקר למטה (או חבר שתיים), וכתוב אותה כ"מה גילינו". תצפית או הנחה שנבדוק, לא נתון.
2. כיוון: משפט אחד שאומר מה עושים החודש בגלל התצפית הזאת, ומה בודקים בסוף החודש.
3. ביצוע: פוסט אחד לאינסטגרם שמיישם את הכיוון, מוכן לפרסום, והסבר קצר למה דווקא הפוסט הזה.

העסק: {profile["business_name"]} — {profile["type_label"]}, {profile["city"]}
מה הם מוכרים: {profile["offerings"]}
הסגנון של העסק: {profile["voice"]}
עובדות על העסק (אלה העובדות היחידות שמותר להשתמש בהן):
{facts}

מה ראינו במחקר ({", ".join(profile["sources"])}):
{observations}

למי הפוסט: {profile["audience"]}
המטרה: {GOAL_HE[profile["goal"]]}
הרגע: {resolve_moment(profile["moment"], today)}
מתי מפרסמים: {profile["timing_hint"]}

כללים:
- אסור להמציא: בלי מחירים, הנחות, אחוזים, מספרי לקוחות או ביקורות שלא מופיעים בעובדות.
- insight: עד 14 מילים, מתחיל במה שראינו ואיפה (למשל "באינסטגרם…"), בלי מספרים ובלי "מחקרים מראים".
- direction: עד 12 מילים, פעולה ברורה לחודש, לא סיסמה.
- check: עד 8 מילים, דבר שאפשר באמת לספור או לראות (הודעות, הזמנות, שמירות).
- הוק שעוצר גלילה ופותח בפרט אמיתי מהעובדות, עד 12 מילים.
- כיתוב של 2 עד 4 משפטים קצרים. העסק מדבר בלשון "אנחנו", לא "אני". מותר סימן קריאה אחד בכיתוב.
- overlay_headline עד 6 מילים, בלי מקף ארוך. זו הכותרת שמודפסת על הכרטיס.
- overlay_badge: עד 2 מילים (למשל שם החג), או מחרוזת ריקה.
- why.reason_he: משפט אחד, עד 16 מילים, שמסביר לבעל העסק למה הפוסט הזה ולמה עכשיו. בלי מקף ארוך.
- scene_description באנגלית: מה רואים בתמונה. בלי טקסט ובלי אנשים מזוהים.

{HEBREW_STYLE}
""".strip()


def write_idea(model: str, prompt: str) -> dict:
    from app.services.post_model_router import write_posts_with

    return loads(write_posts_with(model, prompt, IDEA_SCHEMA), {}) or {}


def render_photo(profile: dict, idea: dict) -> str:
    """One 4:5 photograph through the app's image service, saved as a 1080px JPEG."""
    from app.services.gemini import generate_image_bytes
    from app.services.images import build_image_prompt

    post = {
        "title": idea.get("title"),
        "format": "image",
        "has_overlay": True,
        "overlay_theme": profile["template"],
        "scene_description": idea.get("scene_description") or profile.get("visual"),
    }
    brand = {
        "palette": profile["palette"],
        "visual_style": profile.get("visual", ""),
        "photography": profile.get("visual", ""),
        "voice": profile["voice"],
    }
    business = {"name": profile["business_name"], "offerings": profile["offerings"]}
    data, mime = generate_image_bytes(build_image_prompt(post, brand, business), "4:5")

    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    target = PHOTO_DIR / f"{profile['slug']}.jpg"
    suffix = ".png" if "png" in mime else ".jpg"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        raw = tmp.name
    # macOS `sips`: resize to 1080 wide and re-encode, so the landing ships ~150 KB, not 5 MB.
    subprocess.run(
        ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "78", "--resampleWidth", "1080", raw, "--out", str(target)],
        check=True,
        capture_output=True,
    )
    Path(raw).unlink(missing_ok=True)
    return f"/examples/{target.name}"


def to_example(profile: dict, idea: dict, image: str | None) -> dict:
    why = idea.get("why") or {}
    return {
        "slug": profile["slug"],
        "businessName": profile["business_name"],
        "typeLabel": profile["type_label"],
        "city": profile["city"],
        "sources": profile["sources"],
        "insight": idea.get("insight", "").strip(),
        "direction": idea.get("direction", "").strip(),
        "check": idea.get("check", "").strip(),
        "palette": profile["palette"],
        "template": profile["template"] if image or profile["template"] == "type_hero" else "type_hero",
        "image": image,
        "post": {
            "format": "image",
            "hook": idea.get("hook", "").strip(),
            "caption": idea.get("caption", "").strip(),
            "cta": idea.get("cta", "").strip(),
            "overlayHeadline": idea.get("overlay_headline", "").strip(),
            "overlayBadge": (idea.get("overlay_badge") or "").strip(),
        },
        "why": {
            "audience": why.get("audience", "").strip(),
            "goal": why.get("goal_he", "").strip(),
            "timing": why.get("timing_he", "").strip(),
            "reason": why.get("reason_he", "").strip(),
        },
    }


TS_HEADER = '''/**
 * Example posts for the landing carousel.
 *
 * GENERATED by api/scripts/generate_landing_examples.py with the app's own post-writing
 * stack and HEBREW_STYLE, then hand-reviewed against web/HEBREW-COPY.md. Every business
 * here is fictional: invented names and facts, no real brand, logo or person.
 * Re-running the script overwrites the hand fixes, so review the diff.
 */

import type { BrandSwatch } from "@/lib/api";
import type { CardTemplate } from "@/components/CardCanvas";

export type LandingExample = {
  slug: string;
  businessName: string;
  typeLabel: string;
  city: string;
  /** Where the (fictional) research looked. Shown as plain words, never as integrations. */
  sources: string[];
  /** "מה גילינו": one observation, phrased as something seen or an assumption to test. */
  insight: string;
  /** "הכיוון לחודש": what the month does because of the insight. */
  direction: string;
  /** What gets checked at the end of the month to know whether the direction held. */
  check: string;
  palette: BrandSwatch[];
  template: CardTemplate;
  /** A photo generated with AI for this fictional business, or null for a typographic card. */
  image: string | null;
  post: {
    format: "image";
    hook: string;
    caption: string;
    cta: string;
    overlayHeadline: string;
    overlayBadge: string;
  };
  why: { audience: string; goal: string; timing: string; reason: string };
};

export const LANDING_EXAMPLES: LandingExample[] = '''


def write_ts(examples: list[dict]) -> None:
    OUT_TS.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(examples, ensure_ascii=False, indent=2)
    OUT_TS.write_text(TS_HEADER + body + ";\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", default="gemini", help="gemini (default) or muse-spark")
    parser.add_argument("--images", action="store_true", help="also render photos for profiles marked photo")
    parser.add_argument("--only", nargs="*", help="slugs to (re)generate; the rest are kept from the raw file")
    args = parser.parse_args()

    today = date.today()
    run_dir = RUNTIME_DIR / datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir.mkdir(parents=True, exist_ok=True)
    latest = RUNTIME_DIR / "latest.json"
    previous: dict[str, dict] = json.loads(latest.read_text("utf-8")) if latest.exists() else {}

    results: dict[str, dict] = dict(previous)
    for profile in PROFILES:
        slug = profile["slug"]
        if args.only and slug not in args.only:
            continue
        prompt = build_prompt(profile, today)
        started = time.monotonic()
        idea = write_idea(args.model, prompt)
        elapsed = time.monotonic() - started
        image = previous.get(slug, {}).get("image")
        if args.images and profile.get("photo"):
            image = render_photo(profile, idea)
        results[slug] = {"idea": idea, "image": image, "prompt": prompt, "seconds": round(elapsed, 1)}
        print(f"{slug}: {elapsed:.1f}s  {idea.get('hook', '')}", flush=True)

    (run_dir / "raw.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), "utf-8")
    latest.write_text(json.dumps(results, ensure_ascii=False, indent=2), "utf-8")

    examples = [
        to_example(profile, results[profile["slug"]]["idea"], results[profile["slug"]].get("image"))
        for profile in PROFILES
        if profile["slug"] in results
    ]
    write_ts(examples)
    print(f"wrote {OUT_TS.relative_to(REPO_ROOT)} ({len(examples)} examples); raw in {run_dir.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
