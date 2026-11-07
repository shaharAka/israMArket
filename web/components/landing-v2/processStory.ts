/** Hebrew-first message map. Each section explains one outcome, then shows it.
 * Public illustrations only; no saved customer records or provider calls.
 * Voice: plural second person (web/HEBREW-COPY.md). The owner approves and publishes;
 * no line may say the product publishes or improves results on its own.
 */
export const PROCESS_HERO = {
  title: "מערכת קידום שמכינה בשבילכם את העבודה.",
  body: "מכירה את העסק שלכם, בונה תוכנית לחודש, מכינה את הפוסטים ובודקת מה הצליח. אתם מאשרים ומפרסמים.",
};

export const PROCESS_STORY = [
  {
    id: "research", label: "היכרות", title: "קודם כול, מכירים אתכם.",
    body: "כמה שאלות קצרות, ואנחנו קוראים את המידע הציבורי על העסק.",
    // המטרה: להראות שהשיחה והמחקר משלימים זה את זה, לפני שיש תוכנית.
  },
  {
    id: "connections", label: "חיבורים", title: "מחברים את מה שכבר יש לכם.",
    body: "נתוני האתר בגוגל, פייסבוק ואינסטגרם וקישור לוואטסאפ.",
    // המטרה: רק חיבורים שאפשר לחבר היום. טיקטוק ולינקדאין מסומנים "בקרוב".
  },
  {
    id: "goals", label: "מטרות", title: "מגדירים את המטרות.",
    body: "בוחרים מה חשוב החודש, וקובעים איך נמדוד את זה.",
    // המטרה: להבדיל בין יעד העסק לבין צפיות ולייקים, בלי להבטיח תחזית.
  },
  {
    id: "plan", label: "תוכנית", title: "התוכנית שלכם לחודש הקרוב.",
    body: "לפי המטרות והנתונים: מה לפרסם, איפה ומתי.",
    // המטרה: התוכנית היא תוצר מוכן, לא עוד משימה לבעל העסק.
  },
  {
    id: "campaign", label: "קמפיין", title: "הקמפיין שלכם, מוכן לאישור.",
    body: "פוסטים, עיצובים וסרטונים לכל ערוץ, לפי התוכנית.",
    // המטרה: להראות רצף קמפיין וחומרים מגוונים, לא שלוש גרסאות של אותה תבנית.
  },
  {
    id: "learning", label: "תוצאות", title: "לומדים מהתוצאות.",
    body: "בודקים מה הצליח בכל פוסט, ומציעים מה לשנות בקמפיין הבא.",
    // המטרה: נתון → ממצא → הצעה, בלי לבלבל בין לחיצה לתוצאה עסקית.
  },
  {
    id: "data", label: "נתונים", title: "הנתונים שלכם, בשפה פשוטה.",
    body: "כניסות, לחיצות והזמנות במקום אחד. ליד כל מספר, המקור שלו.",
    // המטרה: להראות את התוצאות יחד, עם המקור שלהן, בנפרד מהלמידה והפעולה.
  },
  {
    id: "mobile", label: "בנייד", title: "הכול איתכם, גם בנייד.",
    body: "מהנייד, בדפדפן: מאשרים את הפוסט הבא בין לקוח ללקוח.",
    // המטרה: המערכת האמיתית בדפדפן של הטלפון. אין אפליקציה בחנות.
  },
  {
    id: "trial", label: "מחיר", title: "חודש ניסיון חינם. ממשיכים רק אם מתאים.",
    body: "בלי כרטיס אשראי ובלי התחייבות.",
    // המטרה: להמחיש חודש היכרות ובחירה בסופו, בלי להציג חיוב אוטומטי.
  },
] as const;

export type ProcessStep = (typeof PROCESS_STORY)[number]["id"];

/** Short additions explain the owner's gain without replacing the reviewed message. */
export const PROCESS_BENEFITS: Partial<Record<ProcessStep, string>> = {
  campaign: "לכם נשאר לבדוק, לאשר ולפרסם.",
};
