import type { ProcessRole } from "./processExamples";

/** Purpose: each week advances one campaign, with its own subject and materials.
 * These are public creative fixtures, never customer records or generated findings.
 */
export type ProcessCampaignWeek = {
  title: string;
  image?: string;
  video?: boolean;
  headline: string;
  detail: string;
};
export const PROCESS_CAMPAIGNS: Record<ProcessRole, readonly ProcessCampaignWeek[]> = {
  services: [
    { title: "בית נעים מתחיל בחומרים שנעים לחיות איתם.", image: "/showcase/interior-materials-ai.png", headline: "לפני שבוחרים צבע, מסתכלים על האור.", detail: "מכירים את הסגנון דרך חומרים, אור ופרטים קטנים." },
    { title: "אותו צבע. אור אחר.", video: true, headline: "דוגמה קטנה על הקיר. החלטה טובה יותר.", detail: "בודקים את הצבע בבית, בשעות שונות של היום." },
    { title: "מהרעיון הראשון לתוכנית של הבית.", image: "/showcase/interior-consultation-ai.jpg", headline: "יש לכם כיוון? בואו נדייק אותו יחד.", detail: "שיחת היכרות על הבית, הצרכים ומה שחשוב לכם לשנות." },
    { title: "החיבורים הקטנים עושים את הבית.", image: "/showcase/interior-finished-corner-ai.jpg", headline: "איזו פינה בבית הכי מרגישה שלכם?", detail: "מסיימים את החודש בשיחה עם הקהל על מה שהופך חלל לבית." },
  ],
  online_shop: [
    { title: "פשתן כחול. מקום לנשום.", image: "/showcase/clothing-linen-ai.png", headline: "לא רק מידה. גם גזרה ובד.", detail: "מכירים את הקולקציה דרך המרקם, הצבע והגזרה." },
    { title: "רואים איך הבד זז.", video: true, headline: "ככה זה יושב. ככה זה זז.", detail: "מראים את הבגד בתנועה, כדי להקל על הבחירה." },
    { title: "בודקים מידות בלי לנחש.", image: "/showcase/clothing-size-detail-ai.jpg", headline: "החולצה שנוחה לכם היא נקודת התחלה טובה.", detail: "משווים את מידות הפריט לבגד אהוב לפני שמזמינים." },
    { title: "אותה חולצה. יום אחר לגמרי.", image: "/showcase/clothing-weekend-look-ai.jpg", headline: "איך אתם לובשים כחול?", detail: "נותנים רעיון לשילוב יומיומי ומזמינים את הקהל לשתף." },
  ],
  physical_shop: [
    { title: "נעים להכיר. אנחנו אופים כאן בשכונה.", image: "/showcase/bakery-challah-ai.png", headline: "שישי מתחיל בריח מהמאפייה.", detail: "מכירים את הלחם, האנשים והמקום שמאחוריו." },
    { title: "לפני התנור, הכול מתחיל בידיים.", video: true, headline: "שלוש רצועות. חלה אחת.", detail: "מציצים לרגע אל ההכנה במאפייה." },
    { title: "את החלה של שישי מזמינים בחמישי.", image: "/showcase/bakery-friday-order-ai.jpg", headline: "להזמין מראש. לאסוף בדרך הביתה.", detail: "הזמנה פשוטה עם פרטי האיסוף של המאפייה." },
    { title: "ממשיכים לאפות את מה שאתם אוהבים.", image: "/showcase/bakery-bread-choice-ai.jpg", headline: "איזה לחם תרצו שנאפה בשבוע הבא?", detail: "שואלים את השכנים מה ירצו לראות על המדף בהמשך." },
  ],
  fundraising: [
    { title: "מכירים את האנשים שמאחורי העשייה.", image: "/showcase/nonprofit-community-ai.png", headline: "קהילה מתחילה באנשים שמגיעים.", detail: "מראים את הפעילות ואת האנשים שעושים אותה יחד." },
    { title: "כך נראה עוד יום של עשייה.", video: true, headline: "ממיינים. אורזים. עושים יחד.", detail: "מראים בפועל איך מכינים את המצרכים לחלוקה." },
    { title: "מה אפשר לשים בארגז הבא?", image: "/showcase/community-next-box-ai.jpg", headline: "התרומה הבאה מתחברת לעשייה.", detail: "מסבירים מה התמיכה מאפשרת ומזמינים להצטרף." },
    { title: "כל זוג ידיים מוסיף משהו.", image: "/showcase/nonprofit-volunteer-detail-ai.png", headline: "ממשיכים יחד גם בחודש הבא.", detail: "מחברים בין העדכון על הפעילות להזמנה להמשיך לתמוך." },
  ],
  software: [
    { title: "יש עסק לנהל. מתי מספיקים גם לשווק?", image: "/showcase/software-people-ai.png", headline: "השיווק לא צריך להתחיל מאפס בכל שבוע.", detail: "מתחילים מהקושי המוכר לבעלי עסקים שמקדמים בעצמם." },
    { title: "מהקמפיין לפוסט הבא, בתוך המערכת.", video: true, headline: "התוכנית והפוסטים נפגשים במקום אחד.", detail: "מראים את המוצר בפעולה, מהשבוע בקמפיין אל הפוסט." },
    { title: "זמן לעסק. מקום גם לשיווק.", image: "/showcase/software-owner-focus-ai.jpg", headline: "חודש ראשון כדי לבדוק אם זה מתאים לכם.", detail: "מזמינים להתנסות דרך מצב מוכר מיום העבודה של בעלת עסק." },
    { title: "רואים מה קרה. בוחרים מה עושים עכשיו.", image: "/showcase/software-campaign-learning-ai.jpg", headline: "גם התוכן הבא מתחיל במה שלמדנו.", detail: "מחברים בין המוצר, התוצאות והתכנון לחודש הבא." },
  ],
};
