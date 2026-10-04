/**
 * Copy and example data for the landing page (/).
 *
 * One example business runs through the whole page, so the story reads as one plan being
 * built and run, not as eight slides. Every number here is an example and the page says so.
 *
 * The story, in order: what it is (the hero) → how the plan is built (STORY) → what a week
 * looks like (WEEK_TOUR) → what the month teaches (MONTH) → trust, price, questions.
 * Each section says one thing; none repeats another.
 */

export const EXAMPLE = {
  name: "פרג ושמרים",
  kind: "מאפייה שכונתית · כפר סבא",
  period: "אוקטובר–דצמבר",
};

/** The first screen: what it is, for whom, and what happens every week. */
export const HERO = {
  title: "תוכנית שיווק אישית לעסק שלכם.",
  lead: "לעסקים קטנים שעושים את השיווק לבד. כל שבוע מקבלים את הצעד הבא ופוסטים מוכנים בסגנון שלכם. אחר כך בודקים מה הצליח ומעדכנים את התוכנית.",
};

export type Step = {
  title: string;
  body: string;
};

/** How the plan is built: three steps, each filling one part of the plan sheet beside it. */
export const STORY: Step[] = [
  {
    title: "מכירים את העסק",
    body: "שיחה קצרה: מה אתם מוכרים, למי ומתי חזק או חלש. אם יש לכם אתר או אינסטגרם, אנחנו קוראים אותם בעצמנו.",
  },
  {
    title: "מטרה אחת עם מספרים",
    body: "מתחילים ממה שקורה היום ובוחרים יעד שאפשר לבדוק. לא ״יותר עוקבים״, אלא כמה הזמנות.",
  },
  {
    title: "מסלול לשלושה חודשים",
    body: "חודש אחרי חודש, לפי העונות והחגים של העסק. כל חודש מתעדכן לפי מה שלמדנו.",
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
  { month: "אוקטובר", focus: "פוסט ראשון ומדידה", detail: "תמונות קיימות, הצעה אחת וקישור למדידה" },
  { month: "נובמבר", focus: "הלקוחות הקבועים", detail: "תזכורות ומבצע לקבועים" },
  { month: "דצמבר", focus: "חנוכה", detail: "הזמנות מראש לסופגניות" },
];

/** The week's three numbers. Orders are the ones the owner reports; the page says so. */
export const MEASURES = [
  { k: "לחיצות על וואטסאפ", v: 38, delta: "+12" },
  { k: "הזמנות מראש", v: 14, delta: "" },
  { k: "כניסות לאתר", v: 620, delta: "+8%" },
];

/** One-line summaries of the plan parts, shown once a part is done in the story. */
export const PART_SUMMARY = ["מאפייה שכונתית · משפחות מהשכונה", "40 ← 56 הזמנות מראש בחודש", "אוקטובר · נובמבר · דצמבר"];

/**
 * The weekly screen, as the owner sees it in the middle of the plan: the week two weeks
 * before Hanukkah (which starts on 4 December 2026), so the step matches its date.
 */
export const THIS_WEEK = {
  range: "השבוע · 15–21 בנובמבר",
  step: "תזכורת ללקוחות הקבועים, שבועיים לפני חנוכה.",
  stepNote: "הודעה אחת בוואטסאפ ופוסט אחד. הכול כתוב ומוכן לאישור.",
  posts: [
    { where: "וואטסאפ", text: "סופגניות בהזמנה מראש: מזמינים עד יום חמישי" },
    { where: "אינסטגרם", text: "מי שמזמין מראש לא עומד בתור" },
  ],
  month: "השבוע בתוכנית · הלקוחות הקבועים",
  learned: "הסטורי עם המחיר הביא הכי הרבה לחיצות.",
};

/** The monthly review, on the blue band. Clicks, not sales: that is what we can count. */
export const MONTH = [
  { k: "מה הצליח", v: "סטורי עם מחיר הביא פי 3 לחיצות על וואטסאפ." },
  { k: "מה לא", v: "פוסטים בלי מחיר כמעט לא הביאו לחיצות." },
  { k: "מה משנים", v: "בנובמבר, כל פוסט עם מחיר וקישור לוואטסאפ." },
];

export const TRUST = [
  { k: "קוראים, לא מפרסמים", v: "אין לנו הרשאה לפרסם בשמכם. אתם מאשרים ומפרסמים." },
  { k: "הסיסמאות נשארות אצלכם", v: "את אינסטגרם, פייסבוק וגוגל מחברים במסך שלהם. הסיסמה לא עוברת דרכנו." },
  { k: "מוחקים בכל רגע", v: "אפשר לנתק חיבור או למחוק את החשבון ואת כל המידע." },
];

/**
 * The hero route (a map, like a navigation app): stops on the way to the goal, in SVG
 * coordinates of the 640 × 560 map, and `at` = how far along the route (0–1) each one is.
 * The "next step" panel changes as the route passes each stop.
 */
export const ROUTE_STOPS = [
  { x: 430, y: 405, at: 0.25, month: "אוקטובר", text: "פוסט ראשון ומדידה", side: "left" },
  { x: 340, y: 330, at: 0.45, month: "נובמבר", text: "הלקוחות הקבועים", side: "up" },
  { x: 180, y: 180, at: 0.82, month: "דצמבר", text: "חנוכה", side: "down" },
] as const;

export const NEXT_STEPS = [
  "מכינים פוסט מהחומרים שלכם וקישור למדידת לחיצות",
  "תזכורת ללקוחות הקבועים, בוואטסאפ ובסטורי",
  "הזמנות מראש לסופגניות, שבועיים לפני החג",
  "בודקים מה הצליח ומעדכנים את החודש הבא",
];

/** The weekly-screen tour: three points, each lighting up its part of the card. */
export const WEEK_TOUR: Step[] = [
  { title: "הצעד של השבוע", body: "מה עושים השבוע ולמה עכשיו. בלי רשימה ארוכה." },
  { title: "הפוסטים כבר כתובים", body: "לפי התוכנית ובסגנון שלכם. אתם קוראים, מאשרים ומפרסמים." },
  { title: "המספרים של השבוע", body: "לחיצות על וואטסאפ, כניסות לאתר וההזמנות שעדכנתם, מול השבוע הקודם." },
];
