import { BUSINESS_EXAMPLES, type ExamplePath } from "./businessExamples";

/** One explicit choice drives the page examples and the subsequent interview route. */
export const PROCESS_ROLES = [
  { segment: "fundraising", path: "nonprofit", label: "מגייסים תרומות" },
  { segment: "software", path: "saas", label: "מוכרים תוכנה" },
  { segment: "services", path: "services", label: "נותנים שירות" },
  { segment: "online_shop", path: "products", label: "בעלי חנות אונליין" },
  { segment: "physical_shop", path: "products", label: "בעלי חנות פיזית" },
] as const;
export type ProcessRole = typeof PROCESS_ROLES[number]["segment"];
export function isProcessRole(value: string | null): value is ProcessRole {
  return PROCESS_ROLES.some(role => role.segment === value);
}
export function defaultProcessRole(path?: ExamplePath): ProcessRole | null {
  return path ? ({ products: "online_shop", services: "services", saas: "software", nonprofit: "fundraising" } as const)[path] : null;
}

/** Public presentation examples, kept separate from real customer records. */
export const PROCESS_EXAMPLES = {
  services: {
    ...BUSINESS_EXAMPLES.services,
    image: "/showcase/interior-materials-ai.png",
    answer: "צבע וחומרים שמתאימים לאור בבית.", audienceSummary: "לבעלי דירות לפני שיפוץ.",
    planTitle: "פניות חדשות לקראת שיפוץ.", calendarThemes: ["הסגנון", "טיפ מקצועי", "הזמנה לשיחה", "בדיקת פניות"], outcome: "פניות לקביעת פגישה",
    weeks: ["מכירים את הסגנון", "טיפ לבחירת צבע", "מזמינים לשיחת היכרות", "בודקים אילו פניות הגיעו"],
    invitation: "לפני שבוחרים צבע, בוחרים איך רוצים להרגיש בבית.", action: "לקבוע שיחת היכרות",
    process: "הבית מתחיל בחיבורים הקטנים.", processImage: "/showcase/interior-paint-ai.png",
    next: "בפוסט הבא: טיפ נוסף והזמנה לשיחה.",
    findingTitle: "יותר לחיצות על הטיפ המקצועי.", resultNote: "נמדדו לחיצות על הקישור, לא שיחות שנקבעו.",
  },
  online_shop: {
    ...BUSINESS_EXAMPLES.products,
    name: "קפל · בגדים ליומיום", kind: "חנות בגדים אונליין", color: "#254a9c", soft: "#f4e9da",
    image: "/showcase/clothing-linen-ai.png", alt: "חולצת פשתן כחולה, בתמונה שנוצרה ב-AI",
    answer: "גזרות נוחות ומידע שעוזר לבחור מידה.", audienceSummary: "למי שמחפשים בגדים נוחים ליומיום.",
    plan: "לעזור לבחור גזרה ומידה ולהוביל להזמנה באתר.", planTitle: "מהתלבטות על המידה להזמנה.", calendarThemes: ["הקולקציה", "הגזרה בתנועה", "בחירת מידה", "בדיקת הזמנות"],
    audience: "למי שרוצים לקנות בגדים אונליין ולבחור מידה מתאימה.", outcome: "הזמנות שהושלמו באתר", metric: "הזמנות",
    weeks: ["מכירים את הקולקציה", "מראים את הגזרה בתנועה", "עוזרים לבחור מידה", "בודקים מה הוביל להזמנה"],
    draft: "לא רק מידה. גם גזרה ובד.", caption: "לפני ההזמנה, השוו את מידות הפריט לבגד שנוח לכם. בדקו גם את הרכב הבד.",
    invitation: "המידה שעל התווית היא רק ההתחלה.", action: "למצוא את המידה שלך",
    process: "רואים איך הבד זז. מבינים איך הוא יושב.", processImage: "/showcase/clothing-linen-ai.png",
    recommendation: "להראות את הגזרה בתנועה ולהוסיף קישור לטבלת המידות.",
    next: "בפוסט הבא: הגזרה בתנועה וקישור לטבלת המידות.",
    findingTitle: "יותר לחיצות על הסרטון שמראה את הגזרה.", resultNote: "נמדדו לחיצות על הקישור, לא הזמנות שהושלמו.",
  },
  physical_shop: {
    ...BUSINESS_EXAMPLES.products,
    answer: "חלות טריות שאפשר להזמין מראש.", audienceSummary: "למשפחות מהשכונה, לקראת שישי.",
    planTitle: "יותר הזמנות מראש למאפייה.", calendarThemes: ["המאפייה", "מאחורי הקלעים", "הזמנות לשישי", "בדיקת איסופים"], outcome: "הזמנות לאיסוף בחנות",
    weeks: ["מכירים את המאפייה", "מראים את ההכנה", "פותחים הזמנות לשישי", "בודקים הזמנות ואיסופים"],
    invitation: "מחר בבוקר, החלה כבר מחכה לכם.", action: "להזמין מראש",
    process: "לפני התנור, הכול מתחיל בידיים.", processImage: "/showcase/bakery-braiding-ai.png",
    findingTitle: "יותר לחיצות על הפוסט עם המחיר.", resultNote: "נמדדו לחיצות על הקישור, לא הזמנות שהושלמו.",
  },
  software: {
    ...BUSINESS_EXAMPLES.saas,
    image: "/showcase/software-people-ai.png",
    answer: "תוכנית, קמפיין ותוכן במערכת אחת.", audienceSummary: "לבעלי עסקים שמקדמים בעצמם.",
    planTitle: "הרשמות להתנסות במוצר.", calendarThemes: ["הבעיה", "הדגמת המוצר", "הזמנה להתנסות", "בדיקת הרשמות"], outcome: "הרשמות להתנסות",
    weeks: ["מציגים את הבעיה", "מדגימים את המוצר", "מזמינים להתנסות", "בודקים הרשמות ושימוש"],
    invitation: "יש לכם עסק לנהל. תנו לנו להכין את השיווק.", action: "להתחיל התנסות",
    process: "מהתוכנית לפוסט הבא שלכם.", processImage: "/showcase/platform-plan-clean.png",
    findingTitle: "יותר לחיצות על הדגמת המוצר.", resultNote: "נמדדו לחיצות על הקישור, לא הרשמות להתנסות.",
  },
  fundraising: {
    ...BUSINESS_EXAMPLES.nonprofit,
    image: "/showcase/nonprofit-community-ai.png",
    answer: "עשייה מקומית שאפשר לראות ולהכיר.", audienceSummary: "למי שרוצה לתמוך בקהילה.",
    planTitle: "יותר תמיכה בפעילות העמותה.", calendarThemes: ["העשייה", "מה התרומה מאפשרת", "הזמנה לתמוך", "בדיקת תרומות"], outcome: "תרומות שהושלמו",
    weeks: ["מכירים את העשייה", "מסבירים מה התרומה מאפשרת", "מזמינים לתמוך", "בודקים תרומות שהושלמו"],
    invitation: "גם אתם יכולים להיות חלק מהעשייה.", action: "לתמוך בפעילות",
    process: "מאחורי כל אריזה, אנשים שאכפת להם.", processImage: "/showcase/nonprofit-volunteer-detail-ai.png",
    findingTitle: "יותר לחיצות על הסבר הפעילות.", resultNote: "נמדדו לחיצות על הקישור, לא תרומות שהושלמו.",
  },
} as const;
