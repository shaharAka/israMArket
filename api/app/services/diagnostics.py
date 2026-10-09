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
Product brief (define meaning before writing localized copy):
The owner needs one useful marketing decision, not a list of analytics labels.
Use marketing_outcome to understand the specific offer, buyer and selected outcome.
Explain an observed fact, one possible change to the actual plan/post/website, and a check
using the available measure and its own time window. Do not equate interest with the
route's outcome. Owner-reported baselines are planning inputs, never provider results.
When evidence is insufficient for a change, name the one missing observation and the
smallest next task that obtains it. Avoid generic cautions and unrelated setup advice.
The field descriptions below specify the current response language and schema.
אבחן ביצועי תוכן לעסק ישראלי קטן. השתמש רק במדדים שסופקו.
source_reads מתעד מתי נקרא כל חלק מפייסבוק ואינסטגרם. חלק שנשמר מקריאה קודמת אינו עדכון חדש;
כבדו את התאריך והתקופה שלו בנפרד, ואת מצב הקריאה החסר ב-social_error.
חבר בין המרות GA4 לבין מדדי מטא/אינסטגרם. ציין במפורש אם צד אחד חסר נתונים.
כתבו בעברית פשוטה לבעלי עסק שאינם אנשי שיווק. headline: ממצא אחד, עד 25 מילים.
בפלט השתמשו ב״נתוני האתר״, ״פעולות חשובות״ ו״נתוני אינסטגרם ופייסבוק״.
אל תשתמשו במונחים GA4, המרות, CTA או אטריביוציה; הסבירו מה נמדד במילים של בעלי העסק.
conversions הוא מספר אירועים שהוגדרו כחשובים ב-GA4, לא בהכרח פניות או הזמנות.
אין להציג אותו כמכירות בלי אירוע רכישה מאומת. לחיצה על וואטסאפ אינה פנייה שאושרה.
meta.ads הוא דיווח פרסום ממטא. website_purchases ו-website_purchase_value הם רכישות שמטא שייכה למודעות,
לא הזמנות ששולמו ואומתו; אין לחבר אותם לרכישות של גוגל או לסכום תוצאות שמופיעות בכמה מקורות.
spend הוא סכום במטבע currency של חשבון הפרסום, לא בהכרח שקלים. אין להסיק רווח בלי עלויות העסק.
אם meta.tracking אינו receiving, אין לטעון שמדידת האתר תקינה. receiving מאשר אירועים וכתובת בלבד,
לא את איכות ההתאמה, מניעת כפילויות או תקינות סכום הרכישה. בדיקות null אינן אישור.
נתון חסר אינו אפס. אין להסיק עלייה או ירידה בלי תקופת השוואה שסופקה,
ואין להציג קשר כסיבה. הסבר אפשרי מנוסח כהשערה, עם מגבלת המדידה.
service_results, אם סופק, הוא דיווח של בעלי העסק, עם התקופה וההגדרה שלהם לפנייה מתאימה.
שמרו אותו בנפרד מהלחיצות ומנתוני האתר. לקוחות חדשים יכולים להגיע מפניות של חודש קודם;
אין לחשב שיעור סגירה מהספירות החודשיות ואין לשייך אותם לפוסט או לערוץ ללא ראיה.
planning_inputs הן הערכות או טווחים לתכנון, לא תוצאות שנמדדו.
לכל היותר 2 פריטים בכל רשימה; כל הסבר עד 35 מילים. אם אין ראיות, השאירו רשימות ריקות.

ga4.read_at ו-ga4.period הם מועד הקריאה והתקופה של נתוני האתר; source_error אומר שהרענון נכשל
והנתונים נשמרו מקריאה קודמת. אין לקרוא להם עדכניים או לשייך להם את תאריך הקריאה של מטא.
report_reads מציין איזה פירוט זמין, חסר או מוגבל למספר שורות. רשימה חסרה אינה אפס;
רשימה מוגבלת היא מדגם של השורות המובילות ולא כל הפעילות. אל תסכמו אותה כסיכום האתר.
channels מסביר מאיפה הגיעו לאתר, landing_pages לאיזה עמוד הגיעו, campaigns אילו קישורי תוכן הביאו פעילות.
events מפרט את שמות האירועים; eventCount סופר פעולות, לא אנשים. גם אירוע בשם purchase או generate_lead
הוא דיווח מהאתר בלבד, לא אימות תשלום או פנייה ולא הוכחה שהמדידה הותקנה נכון.
כשיש נתונים זמינים, התחילו בפעולה שיווקית שימושית שהם תומכים בה; חיבור חסר הוא מגבלה, לא הממצא הראשי.
במקום להציג רשימת מדדים, הסבירו מה נצפה, מה אפשר לנסות בפוסט או בתוכנית, ומתי ואיך לבדוק.

עסק: {business}
GA4: {ga4}
מטא: {meta}
"""
    return loads(lite_json(prompt, DIAGNOSTIC_SCHEMA, thinking_level="MEDIUM"), {})


def recommend(business: dict, strategy: dict, diagnostic: dict, ga4: dict, meta: dict) -> dict:
    prompt = f"""
Product brief (define meaning before writing localized copy):
The owner needs one useful marketing decision, not a list of analytics labels.
Use marketing_outcome to understand the specific offer, buyer and selected outcome.
Explain an observed fact, one possible change to the actual plan/post/website, and a check
using the available measure and its own time window. Do not equate interest with the
route's outcome. Owner-reported baselines are planning inputs, never provider results.
When evidence is insufficient for a change, name the one missing observation and the
smallest next task that obtains it. Avoid generic cautions and unrelated setup advice.
The field descriptions below specify the current response language and schema.
הפק המלצות שבועיות קונקרטיות לשיפור ביצועים.
For each suggestion, select up to three evidence_keys using exact source:metric keys
from analysis_basis.observations. Select only relevant facts; use [] when none supports
the proposal. Never invent a number, source, metric or missing event count.
כל המלצה חייבת להסתמך על מדד שסופק או על פער מפורש בנתונים.
כתבו בעברית פשוטה. week_summary: ממצא אחד עד 25 מילים.
בפלט השתמשו ב״נתוני האתר״, ״פעולות חשובות״ ו״נתוני אינסטגרם ופייסבוק״.
אל תשתמשו במונחים GA4, המרות, CTA או אטריביוציה; כשצריך, כתבו ״מה מבקשים מהלקוח לעשות״.
החזירו לכל היותר 3 המלצות, החשובה תחילה; עדיפות high רק כשיש בעיה דחופה מבוססת.
כל title עד 12 מילים, action עד 35 מילים, evidence עד 45 מילים.
חברו את הפעולה ליעד ולפוסט או לעמוד הרלוונטיים בתוכנית שסופקה; אל תמציאו מספר פוסט.
action_kind הוא post, plan, measurement או website. לפוסט החזירו post_uid מדויק מתוך התוכנית שסופקה;
אם אין פוסט מזוהה, החזירו plan ו-post_uid ריק. אין להחזיר כתובות או קישורים לפעולה.
לעריכת תוכן בחרו טיוטה שלא פורסמה; מפוסט שכבר פורסם לומדים לקראת הפוסט הבא, לא מציעים לשנות אותו בדיעבד.
hypothesis הוא הסבר אפשרי בלבד, עד 25 מילים. כשאין בסיס, השאירו אותו ריק.
success_check הוא בדיקה אחת פשוטה, עד 30 מילים, עם המדד הזמין והזמן לבדיקה; ציינו אם המדידה עדיין חסרה.
בתוך העסק מופיע analysis_basis: חלון הזמן, מועד הקריאה ומגבלות של כל מקור. כבדו אותם בנפרד;
נתונים היסטוריים אינם קריאה עדכנית. observation אינו השערה, והסבר אפשרי אינו ממצא מוכח.
הפעולה היא ניסוי מוצע: דבר אחד לשינוי, ואיך לבדוק אותו במדד של היעד.
conversions ב-GA4 אינו בהכרח פניות או הזמנות; לחיצה אינה מכירה.
בלי נתוני עבר שסופקו, אין לטעון לשינוי; בלי מדידה מתאימה, אין לטעון להצלחה במכירות.
כשאין מספיק נתונים, המליצו על בדיקת מדידה או על ניסוי קטן מתוך התוכנית וציינו את המגבלה.
בפרסום ממומן הסתמכו על meta.ads והסבירו שזה דיווח מטא. אל תציעו שינוי תקציב אוטומטי;
אפשר להציע שינוי אחד בטקסט, בהצעה או בעמוד היעד ולציין איך לבדוק אותו. זהו ניסוי ולא הוכחה לסיבה.
אל תחברו רכישות ממטא ומגוגל. אין להסיק רווח מההכנסה שמטא שייכה למודעות.
אם בדיקת המעקב חסרה או לא אישרה את כתובת האתר, תנו עדיפות לבדיקת המדידה לפני המלצות על מכירות.
אל תציעו ליצור פוסט חדש כשנדרש קודם תיקון בעמוד או במדידה. בלי פעולה שימושית, החזירו רשימה ריקה.
לעסק שירותים השתמשו גם ב-service_results אם סופק. זהו דיווח שלכם, לא תוצאה מגוגל או מאינסטגרם.
חברו הצעה להגדרת הפנייה המתאימה, לשירות ולסיפור הלקוחות האמיתי בתוכנית; אל תמציאו תיק עבודות או המלצה.
אם capacity הוא 0, אל תציעו להביא עוד לקוחות עכשיו. אפשר לטפח אמון או לחדד למי השירות מתאים,
ולהציע רשימת המתנה רק אם בעלי העסק אישרו שיש כזו. capacity חסר אינו 0.
אם יש פניות אך מעט מהן מתאימות לפי fit_criterion, הציעו לחדד קהל או להסביר למי השירות מתאים כניסוי;
אין לטעון שהניסוח הוא הסיבה. ערך לקוח ב-planning_inputs הוא הערכה לתכנון, לא הכנסה שהתקבלה.
אל תחשבו שיעור סגירה בין inquiries ל-clients_won: הלקוחות יכולים להגיע מפניות של חודש קודם.
אין לשייך פניות או לקוחות לפוסט או לערוץ, לחבר אותם לספירת גוגל או להמציא הכנסה.
כשאין חיבורים אבל יש דיווח של בעלי העסק, אפשר להציע פעולה בתוכנית ולבדוק פניות מתאימות בדיווח הבא.

ga4.read_at ו-ga4.period הם מועד הקריאה והתקופה של נתוני האתר; source_error אומר שהרענון נכשל
והנתונים נשמרו מקריאה קודמת. אין לקרוא להם עדכניים או לשייך להם את תאריך הקריאה של מטא.
report_reads מציין איזה פירוט זמין, חסר או מוגבל למספר שורות. רשימה חסרה אינה אפס;
רשימה מוגבלת היא מדגם של השורות המובילות ולא כל הפעילות. אל תסכמו אותה כסיכום האתר.
channels מסביר מאיפה הגיעו לאתר, landing_pages לאיזה עמוד הגיעו, campaigns אילו קישורי תוכן הביאו פעילות.
events מפרט את שמות האירועים; eventCount סופר פעולות, לא אנשים. גם אירוע בשם purchase או generate_lead
הוא דיווח מהאתר בלבד, לא אימות תשלום או פנייה ולא הוכחה שהמדידה הותקנה נכון.
כשיש נתונים זמינים, התחילו בפעולה שיווקית שימושית שהם תומכים בה; חיבור חסר הוא מגבלה, לא הממצא הראשי.
במקום להציג רשימת מדדים, הסבירו מה נצפה, מה אפשר לנסות בפוסט או בתוכנית, ומתי ואיך לבדוק.

עסק: {business}
אסטרטגיה נוכחית: {strategy}
אבחון: {diagnostic}
GA4: {ga4}
מטא: {meta}
"""
    return loads(lite_json(prompt, RECOMMENDATION_SCHEMA, thinking_level="MEDIUM"), {})
