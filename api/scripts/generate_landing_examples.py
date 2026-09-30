#!/usr/bin/env python
"""Write the landing page's example posts with the app's own post-writing stack.

    cd api && .venv/bin/python scripts/generate_landing_examples.py            # text only
    cd api && .venv/bin/python scripts/generate_landing_examples.py --images   # + photos
    cd api && .venv/bin/python scripts/generate_landing_examples.py --only bakery
    cd api && .venv/bin/python scripts/generate_landing_examples.py --photos   # photos only

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
   1080x1350 WebP (<= 180 KB) under web/public/examples/.
   With --photos, renders only the photos, for the showcase profiles AND the wall of
   posts (`WALL`), without re-writing any text. Existing photos are skipped (--force).
3. Writes web/components/landing/examples.ts, and the raw replies under
   .runtime/landing-examples/<timestamp>/ for review.

The generated Hebrew is hand-reviewed against web/HEBREW-COPY.md before it ships, and
those fixes live in examples.ts. Re-running overwrites them, so review the diff.
"""

from __future__ import annotations

import argparse
import json
import sys
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
        "pill": "מאפייה",
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
        "scene": (
            "A tray of freshly fried, sugar-dusted doughnuts cooling on a floured wooden "
            "counter in a small neighbourhood bakery, early morning side light from a window, "
            "a jar of homemade jam and a wooden spoon beside them, steam and a little "
            "scattered sugar."
        ),
    },
    {
        "slug": "lingerie",
        "pill": "הלבשה תחתונה",
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
        "template": "split_panel",
        "photo": True,
        "visual": "intimate, calm boutique fitting room, soft daylight, plum and powder-pink tones",
        "scene": (
            "A quiet boutique fitting room: a plum velvet curtain half drawn, a soft fabric "
            "measuring tape and a folded powder-pink lace bra resting on a small upholstered "
            "stool, warm daylight, no person in the frame."
        ),
    },
    {
        "slug": "beauty",
        "pill": "קוסמטיקה",
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
        "template": "framed_inset",
        "photo": True,
        "visual": "calm skincare studio, sage green and honey tones, natural textures",
        "scene": (
            "Unlabelled amber glass skincare bottles and a small ceramic bowl of cream on a "
            "linen towel beside a sprig of fresh sage, a treatment room window in winter "
            "light, soft shadows, a warm cup of tea at the edge of the frame."
        ),
    },
    {
        "slug": "accountant",
        "pill": "הנהלת חשבונות",
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
        "template": "cover_type",
        "photo": True,
        "visual": "tidy small office, navy and marker-yellow accents, winter afternoon light",
        "scene": (
            "A tidy wooden desk in a small bright office: a closed navy folder, a yellow "
            "highlighter, a mug of coffee and reading glasses, a potted plant, late-afternoon "
            "winter light through blinds. No readable paper, no screen facing the camera."
        ),
    },
    {
        "slug": "yoga",
        "pill": "יוגה",
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
        "scene": (
            "An empty small yoga studio in the early evening: a few terracotta and sand "
            "coloured mats rolled out on a warm wooden floor, cork blocks and a folded "
            "blanket, large window with plants and soft golden light."
        ),
    },
    {
        "slug": "ceramics",
        "pill": "קרמיקה",
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
        "template": "lower_editorial",
        "photo": True,
        "visual": "handmade ceramics studio, winter-sea blue glazes, clay texture",
        "scene": (
            "Close-up of clay-covered hands shaping a mug on a pottery wheel, a row of "
            "finished deep sea-blue glazed mugs on a shelf behind, clay dust and water, "
            "directional window light. Only hands and forearms, no face."
        ),
    },
    {
        "slug": "interior",
        "pill": "עיצוב פנים",
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
        "scene": (
            "A small bright apartment living room with a round wooden dining table tucked by "
            "the window next to a compact sofa, olive-green cushions, a shelf with plants, "
            "afternoon light, lived-in and tidy, no people."
        ),
    },
    {
        "slug": "cabins",
        "pill": "צימרים",
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
        "scene": (
            "Inside a wooden cabin in the hills on a rainy winter day: a fire burning in a "
            "small stone fireplace, two mugs and a breakfast basket on a low table, a big "
            "window with rain drops and mist over green hills outside."
        ),
    },
]

# --- the wall of posts ("עוד דוגמאות") -----------------------------------------------
# More fictional businesses, photo only: their Hebrew (headline, why) is hand-written in
# web/components/landing/wall.ts, because a single line per card is faster to write and
# review than to generate. Keep slug, palette and template in sync with that file.
WALL: list[dict] = [
    {
        "slug": "bikes",
        "business_name": "שרשרת",
        "offerings": "תיקון ושיפוץ אופניים, שירות מהיר לאופניים חשמליים",
        "voice": "עניינית, שכונתית, קצת הומור",
        "palette": [
            {"hex": "#1d4e89", "role": "primary", "name": "כחול מוסך"},
            {"hex": "#f28c28", "role": "accent", "name": "כתום"},
        ],
        "template": "lower_editorial",
        "visual": "small urban bicycle repair workshop, tools on a pegboard, afternoon light",
        "scene": (
            "A city bicycle clamped on a repair stand in a small street-level workshop, a "
            "chain and a few tools on a worn workbench, a pegboard of wrenches behind, late "
            "afternoon light from the open shutter. Only a gloved hand at the edge, no face."
        ),
    },
    {
        "slug": "flowers",
        "business_name": "כלנית",
        "offerings": "זרים עונתיים, פרחים לשבת ולאירועים קטנים",
        "voice": "חמה, פואטית במידה, קצרה",
        "palette": [
            {"hex": "#8c1c2b", "role": "primary", "name": "כלנית"},
            {"hex": "#f3c5c5", "role": "accent", "name": "ורוד עדין"},
        ],
        "template": "framed_inset",
        "visual": "small flower shop counter, seasonal red anemones, brown paper, stone wall",
        "scene": (
            "A loose bunch of red anemones and white seasonal flowers wrapped in brown paper "
            "and string on a worn wooden counter against an old pale stone wall, soft morning "
            "light, a few petals and cut stems on the counter."
        ),
    },
    {
        "slug": "grooming",
        "business_name": "פרווה ומברשת",
        "offerings": "טיפוח ורחצה לכלבים, בתיאום מראש",
        "voice": "משפחתית, חמה, בלי פלצנות",
        "palette": [
            {"hex": "#2f6f73", "role": "primary", "name": "טורקיז"},
            {"hex": "#f2b134", "role": "accent", "name": "חמנייה"},
        ],
        "template": "split_panel",
        "visual": "bright small dog grooming salon, towels, soft daylight",
        "scene": (
            "A freshly groomed, fluffy medium-sized mixed-breed dog sitting calmly on a "
            "grooming table with a folded teal towel, a brush beside it, a bright small salon "
            "with daylight. No people."
        ),
    },
    {
        "slug": "breakfast",
        "business_name": "מחבת",
        "offerings": "ארוחות בוקר ושקשוקה, בית קפה שכונתי",
        "voice": "חמה, ישירה, שכונתית",
        "palette": [
            {"hex": "#b33a1f", "role": "primary", "name": "עגבנייה"},
            {"hex": "#f0c05a", "role": "accent", "name": "חלמון"},
        ],
        "template": "lower_editorial",
        "visual": "neighbourhood breakfast cafe, cast iron pan, rustic table, morning light",
        "scene": (
            "A bubbling shakshuka in a black cast-iron pan on a rustic wooden table, fresh "
            "bread, a small bowl of tahini and chopped parsley, a glass of tea, morning light "
            "from the side, seen from slightly above."
        ),
    },
    {
        "slug": "nursery",
        "business_name": "שתיל",
        "offerings": "משתלה שכונתית: צמחי תבלין, עציצים לבית ולמרפסת",
        "voice": "רגועה, מעשית, ירוקה",
        "palette": [
            {"hex": "#3d6b35", "role": "primary", "name": "עלה"},
            {"hex": "#d9c27a", "role": "accent", "name": "קש"},
        ],
        "template": "cover_type",
        "visual": "small neighbourhood plant nursery, wooden shelves, sun",
        "scene": (
            "Rows of small potted herbs and succulents in terracotta pots on weathered "
            "wooden shelves in a small neighbourhood plant nursery, dappled winter sun, a "
            "watering can, damp soil. No labels or signs."
        ),
    },
    {
        "slug": "carpentry",
        "business_name": "נסורת",
        "offerings": "נגרות בהזמנה אישית: שולחנות, ספריות וארונות",
        "voice": "שקטה, מקצועית, גאה בעבודה",
        "palette": [
            {"hex": "#5b4632", "role": "primary", "name": "אגוז"},
            {"hex": "#d98c4a", "role": "accent", "name": "אלון"},
        ],
        "template": "framed_inset",
        "visual": "small carpentry workshop, wood shavings, warm directional light",
        "scene": (
            "A solid oak table top being finished in a small carpentry workshop, curled wood "
            "shavings, a hand plane and clamps on the bench, warm directional light through a "
            "dusty window. No people."
        ),
    },
    {
        "slug": "soups",
        "business_name": "סיר על האש",
        "offerings": "מרקים ביתיים במשלוח, בכל שבוע תפריט אחר",
        "voice": "ביתית, חמה, כמו אצל סבתא",
        "palette": [
            {"hex": "#7a3b1d", "role": "primary", "name": "קינמון"},
            {"hex": "#e8b04a", "role": "accent", "name": "כורכום"},
        ],
        "template": "promo_ribbon",
        "visual": "home kitchen, big soup pot, steam, winter evening light",
        "scene": (
            "A big pot of orange lentil soup steaming on a home stove, a ladle resting on "
            "the rim, two filled bowls with herbs and lemon on a wooden board beside it, "
            "warm winter evening light."
        ),
    },
    {
        "slug": "winery",
        "business_name": "גפן בהר",
        "offerings": "יקב בוטיק, סיורים וטעימות בסופי שבוע",
        "voice": "רגועה, מזמינה, בלי סנוביות",
        "palette": [
            {"hex": "#5a1e2c", "role": "primary", "name": "יין"},
            {"hex": "#c9a15a", "role": "accent", "name": "חבית"},
        ],
        "template": "cover_type",
        "visual": "small boutique winery cellar, oak barrels, candle-warm light",
        "scene": (
            "Two glasses of red wine on an oak barrel in a small stone cellar of a boutique "
            "winery, rows of barrels softly out of focus behind, warm low light. Plain "
            "unlabelled bottle, no text anywhere."
        ),
    },
]

# Gemini 3 Pro Image, 1K/2K output, per image (ai.google.dev/pricing). The landing budget
# is a few dollars, so the photo run is capped and prints what it spent.
IMAGE_PRICE_USD = 0.134
PHOTO_SIZE = (1080, 1350)
PHOTO_MAX_BYTES = 180_000

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


def save_webp(data: bytes, target: Path) -> int:
    """Centre-crop to exactly 4:5, resize to 1080x1350 and save the smallest WebP that
    still looks like a photo, stepping quality down until it fits PHOTO_MAX_BYTES."""
    import io

    from PIL import Image

    image = Image.open(io.BytesIO(data)).convert("RGB")
    want = PHOTO_SIZE[0] / PHOTO_SIZE[1]
    width, height = image.size
    if width / height > want:
        crop = int(height * want)
        image = image.crop(((width - crop) // 2, 0, (width - crop) // 2 + crop, height))
    elif width / height < want:
        crop = int(width / want)
        image = image.crop((0, (height - crop) // 2, width, (height - crop) // 2 + crop))
    image = image.resize(PHOTO_SIZE, Image.LANCZOS)
    target.parent.mkdir(parents=True, exist_ok=True)
    for quality in (80, 74, 68, 62, 56, 50):
        buffer = io.BytesIO()
        image.save(buffer, "WEBP", quality=quality, method=6)
        if buffer.tell() <= PHOTO_MAX_BYTES or quality == 50:
            target.write_bytes(buffer.getvalue())
            return buffer.tell()
    return 0


def render_photo(profile: dict, idea: dict | None = None) -> str:
    """One 4:5 photograph through the app's image service, saved as an optimized WebP.

    The scene is the profile's hand-written `scene` when there is one (it is written
    against the template's safe zone), else the model's `scene_description`.
    """
    from app.services.gemini import generate_image_bytes
    from app.services.images import build_image_prompt

    idea = idea or {}
    post = {
        "title": idea.get("title") or profile["slug"],
        "format": "image",
        "has_overlay": True,
        "overlay_theme": profile["template"],
        "scene_description": (profile.get("scene") or idea.get("scene_description") or profile.get("visual"))
        # The safe-zone rule alone made the model paste a second, zoomed-in photo under
        # the first one (a visible seam a third of the way up). Say it is one shot.
        + " One single continuous camera shot from the top edge to the bottom edge: no "
        "seam, no second picture, no change of scale or perspective anywhere in the frame.",
    }
    brand = {
        "palette": profile["palette"],
        "visual_style": profile.get("visual", ""),
        "photography": profile.get("visual", ""),
        "voice": profile["voice"],
    }
    business = {"name": profile["business_name"], "offerings": profile["offerings"]}
    data, _mime = generate_image_bytes(build_image_prompt(post, brand, business), "4:5")
    target = PHOTO_DIR / f"{profile['slug']}.webp"
    size = save_webp(data, target)
    print(f"  photo {target.name}: {size // 1024} KB", flush=True)
    return f"/examples/{target.name}"


def render_all_photos(only: list[str] | None, force: bool, max_images: int) -> int:
    """--photos: photos for every showcase profile and every wall card, text untouched.

    Skips photos that already exist unless --force, so a re-run only pays for what is
    missing. Stops at --max-images so a bad loop cannot run up the bill.
    """
    spent = 0
    for profile in [*PROFILES, *WALL]:
        slug = profile["slug"]
        if only and slug not in only:
            continue
        if not profile.get("scene"):
            continue
        if (PHOTO_DIR / f"{slug}.webp").exists() and not force:
            print(f"{slug}: exists, skipped")
            continue
        if spent >= max_images:
            print(f"{slug}: skipped, --max-images {max_images} reached")
            continue
        spent += 1
        try:
            render_photo(profile)
        except Exception as exc:  # keep going: one refusal should not lose the batch
            print(f"{slug}: failed: {exc}", flush=True)
    print(f"image calls: {spent}, about ${spent * IMAGE_PRICE_USD:.2f}")
    return 0


def to_example(profile: dict, idea: dict, image: str | None) -> dict:
    why = idea.get("why") or {}
    return {
        "slug": profile["slug"],
        "pill": profile["pill"],
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
 * Example stories for the landing showcase (research → direction → post).
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
  /** The short business type on the showcase tab, e.g. "מאפייה". */
  pill: string;
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
    parser.add_argument(
        "--photos",
        action="store_true",
        help="only render the photos (showcase + wall) as WebP; examples.ts is not touched",
    )
    parser.add_argument("--force", action="store_true", help="with --photos: re-render photos that exist")
    parser.add_argument("--max-images", type=int, default=len(PROFILES) + len(WALL), help="with --photos: call cap")
    args = parser.parse_args()

    if args.photos:
        return render_all_photos(args.only, args.force, args.max_images)

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
