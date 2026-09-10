from calendar import monthrange
from datetime import date, timedelta

from pyluach import dates, hebrewcal

from app.services.cost_model import plan_from_budget

GREGORIAN_MONTHS = [
    {"number": 1, "en": "January", "he": "ינואר"},
    {"number": 2, "en": "February", "he": "פברואר"},
    {"number": 3, "en": "March", "he": "מרץ"},
    {"number": 4, "en": "April", "he": "אפריל"},
    {"number": 5, "en": "May", "he": "מאי"},
    {"number": 6, "en": "June", "he": "יוני"},
    {"number": 7, "en": "July", "he": "יולי"},
    {"number": 8, "en": "August", "he": "אוגוסט"},
    {"number": 9, "en": "September", "he": "ספטמבר"},
    {"number": 10, "en": "October", "he": "אוקטובר"},
    {"number": 11, "en": "November", "he": "נובמבר"},
    {"number": 12, "en": "December", "he": "דצמבר"},
]


def gregorian_month_meta(year: int, month: int) -> dict:
    info = GREGORIAN_MONTHS[month - 1]
    return {
        "calendar_kind": "gregorian",
        "year": year,
        "month": month,
        "month_name_en": info["en"],
        "month_name_he": info["he"],
        "days_in_month": monthrange(year, month)[1],
        "first_weekday": date(year, month, 1).weekday(),
    }


def _hebrew_to_gregorian(year: int, month: int, day: int) -> date:
    return dates.HebrewDate(year, month, day).to_pydate()


def _hebrew_year_for_gregorian(year: int, month: int) -> int:
    sample = date(year, month, 15)
    return dates.GregorianDate.from_pydate(sample).to_heb().year


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    cursor = date(year, month, 1)
    seen = 0
    while cursor.month == month:
        if cursor.weekday() == weekday:
            seen += 1
            if seen == n:
                return cursor
        cursor += timedelta(days=1)
    raise ValueError("weekday not found")


def israeli_events_for_month(year: int, month: int) -> list[dict]:
    hebrew_year = _hebrew_year_for_gregorian(year, month)
    prev_hebrew = hebrew_year - 1
    events: list[dict] = []

    # pyluach: Nissan=1 … Tishrei=7. In leap years Purim is Adar II (13).
    jewish = [
        (7, 1, "ראש השנה", "חג", "מסרים של התחלה, שולחן חג, מתנות וברכות. שיא קניות מזון ומסעדות."),
        (7, 2, "ראש השנה — יום שני", "חג", "המשך חג. עסקים סגורים. תוכן ברכות וסטוריז מוכנים מראש."),
        (7, 10, "יום כיפור", "חג", "יום צום. אין קידום מכירות אגרסיבי. מסר שקט, סגירה מוקדמת, ערבות קהילתית."),
        (7, 15, "סוכות", "חג", "משפחות, טיולים, סוכות במסעדות. חוויה, אירוח בחוץ, פעילות לילדים."),
        (7, 22, "שמחת תורה", "חג", "סיום חגי תשרי בישראל. קהילה, שמחה, חזרה לשגרה ולמבצעי אחרי החגים."),
        (9, 25, "חנוכה", "חג", "שמונה ימי מתנות, סופגניות, משפחה. אידיאלי לסדרות תוכן ולמבצעי חנוכה."),
        (11, 15, "ט״ו בשבט", "חג", "עצים, קיימות, פירות יבשים. מתאים למותגי מזון, חינוך וסביבה."),
        (12, 14, "פורים", "חג", "תחפושות, משלוח מנות, מסיבות. שיא לקמעונאות תחפושות, מזון ובידור."),
        (1, 15, "פסח", "חג", "הקניות הגדולות של השנה בישראל: ניקיון, מזון כשר לפסח, חופשות, ביגוד."),
        (1, 21, "שביעי של פסח", "חג", "סיום חול המועד. טיולים, אירוח אחרון, חזרה לשגרה."),
        (3, 6, "שבועות", "חג", "חלבי, שבועות, לימוד. מתאים למאפיות, מסעדות וחינוך."),
        (5, 15, "ט״ו באב", "תרבות", "יום אהבה ישראלי. זוגיות, מתנות, מסעדות ואירועים."),
    ]

    national = [
        (1, 27, "יום השואה", "זיכרון", "יום זיכרון. אין מבצעים. אם רלוונטי — מסר מכבד בלבד."),
        (2, 4, "יום הזיכרון", "זיכרון", "ערב ויום זיכרון. השבתה פרסומית. אין הנחות."),
        (2, 5, "יום העצמאות", "לאומי", "מנגל, דגלים, בילוי משפחתי, הנחות עצמאות לקמעונאות ופנאי."),
        (2, 28, "יום ירושלים", "לאומי", "תיירות ירושלים, זהות מקומית, סיורים ומסעדות בעיר."),
    ]

    for hyear in {prev_hebrew, hebrew_year, hebrew_year + 1}:
        adar = 13 if hebrewcal.Year(hyear).leap else 12
        dated = []
        for month_h, day_h, name, kind, note in jewish + national:
            month_resolved = adar if (month_h == 12 and name == "פורים") else month_h
            dated.append((month_resolved, day_h, name, kind, note))
        for month_h, day_h, name, kind, note in dated:
            try:
                g = _hebrew_to_gregorian(hyear, month_h, day_h)
            except ValueError:
                continue
            if g.year == year and g.month == month:
                events.append(
                    {
                        "date": g.isoformat(),
                        "name": name,
                        "kind": kind,
                        "note": note,
                        "source": "hebrew_calendar",
                    }
                )

    commercial: list[tuple[date, str, str, str]] = []
    if month == 1:
        commercial.append((date(year, 1, 2), "חיסולי אחרי החורף / ראש השנה האזרחי", "קניות", "ניקוי מלאי חורף ותכנון שנתי."))
    if month == 7:
        commercial.append((date(year, 7, 1), "תחילת החופש הגדול", "עונתי", "משפחות, קייטנות, נסיעות, מסעדות ופנאי."))
        commercial.append((date(year, 7, 15), "ימי פריים / אמצע קיץ", "קניות", "חלון אי-קומרס ישראלי סביב ימי פריים העולמיים."))
    if month == 8:
        commercial.append((date(year, 8, 10), "חזרה ללימודים", "עונתי", "ילקוטים, ביגוד, חוגים, ציוד משרדי וחינוך."))
    if month == 9:
        commercial.append((date(year, 9, 1), "פתיחת שנת הלימודים", "עונתי", "שיא חזרה לשגרה. תוכן מעשי להורים ולעסקי שירות."))
        commercial.append((date(year, 9, 1), "הכנות לחגי תשרי", "קניות", "מזון, מתנות, אירוח, ביגוד חגיגי."))
    if month == 11:
        black_friday = _nth_weekday(year, 11, 4, 4)
        commercial.append((black_friday, "בלאק פריידי", "קניות", "יום הקניות הגדול. מבצעים, רילס דחופים, רימרקטינג."))
        commercial.append((black_friday + timedelta(days=3), "סייבר מאנדיי", "קניות", "המשך חלון האי-קומרס. דגש על משלוחים לישראל."))
    if month == 12:
        commercial.append((date(year, 12, 1), "סוף שנה אזרחית", "קניות", "סגירת תקציבים, מתנות ארגוניות, חיסולי שנה."))

    if month == 3:
        commercial.append((date(year, 3, 8), "יום האישה", "תרבות", "קמפיינים למותגי יופי, מתנות ושירותים."))

    for when, name, kind, note in commercial:
        events.append(
            {
                "date": when.isoformat(),
                "name": name,
                "kind": kind,
                "note": note,
                "source": "commercial_il",
            }
        )

    events.sort(key=lambda item: item["date"])
    return events


def posting_plan(monthly_budget_ils: int, primary_goal: str) -> dict:
    """Content and spend plan for the month.

    Delegates to the Israeli cost model. This function used to hold invented budget
    bands — "under 2,000 → 3 posts a week", "30-40% of budget to retargeting" — with no
    source. A plan built on those is a plan for a business nobody has, so the bands were
    replaced with published market ranges (see services/cost_model.py).
    """
    plan = plan_from_budget(monthly_budget_ils, primary_goal)
    return {
        # kept for existing callers
        "weekly_posts": plan.posts_per_week,
        "format_mix": {"formats": plan.recommended_formats},
        "ads_guidance": " | ".join(plan.warnings) if plan.warnings else "תקציב בטווח סביר לפרסום ממומן.",
        "mix_note": (
            "דגש על קרוסלות הצעה, רילס עם CTA ברור, וקישור לדף נחיתה או וואטסאפ."
            if primary_goal == "sales"
            else "דגש על סיפור מותג, רילס מאחורי הקלעים, ואמון. CTA רך יותר."
        ),
        "monthly_budget_ils": plan.monthly_budget_ils,
        "primary_goal": primary_goal,
        # new, grounded data the strategy prompt uses
        "stage": plan.stage,
        "realistic_roas": list(plan.realistic_roas),
        "expected_impressions": list(plan.expected_impressions),
        "expected_clicks": list(plan.expected_clicks),
        "expected_purchases": list(plan.expected_purchases),
        "warnings": plan.warnings,
        "assumptions": plan.assumptions,
        "source": plan.source,
    }
