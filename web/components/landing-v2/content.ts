/**
 * Copy and example data for the landing draft (/landing-draft).
 *
 * One example business runs through the whole page, so the story reads as one plan being
 * built, not as eight slides. Every number here is an example and the page says so.
 */

export const EXAMPLE = {
  name: "פרג ושמרים",
  kind: "מאפייה שכונתית · כפר סבא",
  period: "אוקטובר–דצמבר",
};

export type StoryStep = {
  label: string;
  title: string;
  body: string;
};

/** The four steps of the pinned story. Each one fills one part of the plan sheet. */
export const STORY: StoryStep[] = [
  {
    label: "מכירים את העסק",
    title: "קודם מכירים את העסק.",
    body: "שיחה קצרה, כמו עם יועץ: מה אתם מוכרים, למי, ומתי חזק או חלש. אם יש אתר או אינסטגרם, אנחנו קוראים אותם בעצמנו.",
  },
  {
    label: "מטרה",
    title: "מטרה אחת, עם מספרים.",
    body: "מתחילים ממה שקורה היום, בוחרים מה מזיזים ומחשבים יעד שאפשר לבדוק. לא ״יותר עוקבים״, אלא כמה הזמנות.",
  },
  {
    label: "מסלול",
    title: "מסלול לשלושה חודשים.",
    body: "מה עושים בכל חודש, ולמה. החודש הראשון מתחיל במדידה ובחומרים, לא בפוסטים.",
  },
  {
    label: "מדידה",
    title: "כל שבוע בודקים מה קרה.",
    body: "מחברים את מה שכבר יש לכם: וואטסאפ, אינסטגרם ונתוני האתר. רואים מה הצליח ומעדכנים את הצעד הבא.",
  },
];

export const LEARNED = [
  { k: "הקהל העיקרי", v: "משפחות מהשכונה" },
  { k: "הכי חזק", v: "שישי בבוקר ולפני חגים" },
  { k: "איפה פוגשים אתכם", v: "וואטסאפ ואינסטגרם" },
];

export const GOAL = {
  today: 40,
  target: 56,
  unit: "הזמנות מראש בחודש",
  lever: "לקוחות קבועים שמזמינים שוב לפני כל חג",
  hypothesis: "תזכורת שבועיים לפני החג תביא חלק מהקבועים להזמין מראש. בודקים ומעדכנים.",
};

export const ROUTE = [
  { month: "אוקטובר", focus: "מודדים ומכינים", detail: "קישור וואטסאפ, תמונות, 3 מוצרים מובילים" },
  { month: "נובמבר", focus: "הלקוחות הקבועים", detail: "תזכורות ומבצע לקבועים" },
  { month: "דצמבר", focus: "חנוכה", detail: "הזמנות מראש לסופגניות" },
];

export const MEASURES = [
  { k: "לחיצות על וואטסאפ", v: 38, delta: "+12", source: "קישור המעקב" },
  { k: "הזמנות מראש", v: 14, delta: "", source: "אתם מעדכנים" },
  { k: "כניסות לאתר", v: 620, delta: "+8%", source: "נתוני האתר" },
];

/** One-line summaries of the plan parts, shown once a part is done in the story. */
export const PART_SUMMARY = ["מאפייה שכונתית · משפחות מהשכונה", "40 ← 56 הזמנות מראש בחודש", "אוקטובר · נובמבר · דצמבר", "וואטסאפ · הזמנות · כניסות לאתר"];

/** The hero: the weekly home, as the owner sees it in week 2 of month 2. */
export const THIS_WEEK = {
  range: "השבוע · 3–9 בנובמבר",
  step: "תזכורת ללקוחות הקבועים, שבועיים לפני חנוכה.",
  stepNote: "הודעה אחת בוואטסאפ ופוסט אחד. הכול כתוב ומחכה לאישור שלכם.",
  posts: [
    { where: "וואטסאפ", text: "סופגניות בהזמנה מראש: מזמינים עד יום חמישי" },
    { where: "אינסטגרם", text: "מי שמזמין מראש לא עומד בתור" },
  ],
  month: "חודש 2 מתוך 3 · הלקוחות הקבועים",
  learned: "הסטורי עם המחיר הביא הכי הרבה לחיצות.",
};

/** The monthly review, on the dark band. */
export const MONTH = [
  { k: "מה הצליח", v: "סטורי עם מחיר הביא פי 3 לחיצות על וואטסאפ." },
  { k: "מה לא", v: "פוסטים בלי מחיר כמעט לא הביאו פניות." },
  { k: "מה משנים", v: "בנובמבר, כל פוסט עם מחיר וקישור לוואטסאפ." },
];

export const TRUST = [
  { k: "קוראים, לא מפרסמים", v: "אין לנו הרשאה לפרסם בשמכם. אתם מאשרים ומפרסמים." },
  { k: "הסיסמאות נשארות אצלכם", v: "את החיבור לאינסטגרם ולגוגל עושים אצלם. הסיסמה לא עוברת דרכנו." },
  { k: "מוחקים בכל רגע", v: "אפשר לנתק חיבור או למחוק את החשבון וכל המידע." },
];
