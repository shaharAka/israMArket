import type { ProcessRole } from "./processExamples";

/** Hebrew purpose: show the actual outcome sought, then the work that supports it. */
export const PROCESS_GOALS: Record<ProcessRole, readonly [string, string, string]> = {
  fundraising: ["להגדיל את מספר התרומות שהושלמו", "להגיע לעוד אנשים שרוצים לתמוך בפעילות", "להחזיר תומכים לתרומה נוספת"],
  software: ["להגדיל את מספר ההרשמות להתנסות", "לעזור ליותר מתנסים להתחיל להשתמש במוצר", "להפוך יותר התנסויות למנויים משלמים"],
  services: ["לקבל יותר פניות מלקוחות שמתאימים לשירות", "לקבוע יותר שיחות היכרות", "להפוך יותר פניות לעבודות חדשות"],
  online_shop: ["להגדיל את מספר ההזמנות שהושלמו באתר", "להחזיר קונים שנטשו את סל הקניות", "לעודד לקוחות לחזור לקנייה נוספת"],
  physical_shop: ["להביא יותר לקוחות לבקר בחנות", "להגדיל את מספר ההזמנות לאיסוף", "להחזיר לקוחות לקנייה נוספת"],
};
export const GENERAL_GOALS = ["להגיע ליותר אנשים שמתעניינים בפעילות שלך", "להפוך התעניינות לפניות, לקניות או לתרומות", "לעודד את מי שכבר מכירים אותך לחזור"] as const;

/** Public examples define what would count, never claim measured customer results. */
export type GoalBrief = { label: string; measure: string; post: string };
export const GENERAL_GOAL_BRIEFS: readonly [GoalBrief, GoalBrief, GoalBrief] = [
  { label: "קהל חדש", measure: "אנשים שנחשפו לפוסטים", post: "מה אנחנו מציעים ולמי זה מתאים" },
  { label: "פעולות", measure: "פניות, קניות או תרומות שהושלמו", post: "איך פונים, קונים או תורמים" },
  { label: "קהל חוזר", measure: "לקוחות ותומכים שחזרו", post: "סיבה חדשה לחזור אלינו" },
];
export const PROCESS_GOAL_BRIEFS: Record<ProcessRole, readonly [GoalBrief, GoalBrief, GoalBrief]> = {
  fundraising: [
    { label: "תרומות", measure: "תרומות שהושלמו", post: "מה התרומה שלכם מאפשרת" },
    { label: "תומכים חדשים", measure: "כניסות חדשות לעמוד התרומה", post: "למי העמותה עוזרת ואיך" },
    { label: "תרומה חוזרת", measure: "תרומות מתומכים חוזרים", post: "מה השתנה בזכות התמיכה שלכם" },
  ],
  software: [
    { label: "הרשמות", measure: "הרשמות להתנסות", post: "איך המוצר פותר בעיה יומיומית" },
    { label: "שימוש במוצר", measure: "מתנסים שהשלימו שימוש ראשון", post: "שלושה צעדים לשימוש הראשון" },
    { label: "מנויים", measure: "מנויים משלמים חדשים", post: "מה מקבלים במנוי המלא" },
  ],
  services: [
    { label: "פניות", measure: "פניות שמתאימות לשירות", post: "למי השירות מתאים" },
    { label: "שיחות היכרות", measure: "שיחות היכרות שנקבעו", post: "מה קורה בשיחת היכרות" },
    { label: "לקוחות חדשים", measure: "עבודות חדשות שנסגרו", post: "עבודה שהושלמה והסיפור שמאחוריה" },
  ],
  online_shop: [
    { label: "הזמנות", measure: "הזמנות שהושלמו באתר", post: "איך הפריט נראה ונלבש" },
    { label: "סל שננטש", measure: "סלים שננטשו והפכו להזמנות", post: "תשובות לשאלות לפני ההזמנה" },
    { label: "קנייה חוזרת", measure: "הזמנות מלקוחות חוזרים", post: "מה חדש בקולקציה" },
  ],
  physical_shop: [
    { label: "ביקור בחנות", measure: "לקוחות שהגיעו בעקבות הפרסום", post: "מה מחכה לכם השבוע בחנות" },
    { label: "איסוף מהחנות", measure: "הזמנות לאיסוף שהושלמו", post: "מה אפשר להזמין מראש לאיסוף" },
    { label: "קנייה חוזרת", measure: "קניות של לקוחות חוזרים", post: "הסיבה לביקור הבא בחנות" },
  ],
};

export const PROCESS_SCHEDULES: Record<ProcessRole, { goal: string; tasks: readonly [string,string,string] }> = {
  fundraising: { goal: "להגדיל את התמיכה בפעילות לקראת החג", tasks: ["פוסט: מה התרומה מאפשרת", "סרטון: מתכוננים לחלוקה", "הזמנה לתמוך בפעילות"] },
  software: { goal: "להגיע לצוותים שמתכננים את העבודה לקראת החג", tasks: ["פוסט: מסיימים פרויקט לפני החג", "סרטון: מעבירים משימה בין שלבים", "הזמנה להתנסות עם הצוות"] },
  services: { goal: "לקבל יותר פניות לעיצוב לקראת החג", tasks: ["פוסט: בית מוכן לאירוח", "סרטון: בוחרים צבע לקיר", "הזמנה לשיחת היכרות"] },
  online_shop: { goal: "להגדיל את ההזמנות מהקולקציה לחג", tasks: ["פוסט: רעיונות ללבוש לחג", "סרטון: הגזרה בתנועה", "קישור לבחירת המידה"] },
  physical_shop: { goal: "להגדיל את ההזמנות מראש לחג", tasks: ["פוסט: פותחים הזמנות לחג", "סרטון: ההכנות במאפייה", "תזכורת: מתי אוספים"] },
};
