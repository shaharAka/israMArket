const API = process.env.NEXT_PUBLIC_API_URL ?? "/backend";
const DEMO_FLAG = "isramarket_demo";

function formatDetail(detail: unknown, fallback: string) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) return String((item as { msg: string }).msg);
        return JSON.stringify(item);
      })
      .join(" · ");
  }
  return fallback;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function isDemo(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(DEMO_FLAG) === "1";
}

export function enterDemo() {
  window.localStorage.setItem(DEMO_FLAG, "1");
}

export function exitDemo() {
  window.localStorage.removeItem(DEMO_FLAG);
}

const DEMO_USER = { id: 1, email: "demo@isramarket.local", full_name: "נועה כהן" };

export type BrandSwatch = { hex: string; role: "primary" | "accent" | "background" | "ink" | "secondary"; name: string };

export type BrandLanguage = {
  business_name: string;
  palette: BrandSwatch[];
  typography: { primary: string; mood: string };
  visual_style: string;
  photography: string;
  voice: string;
  voice_examples: string[];
  do_say: string[];
  dont_say: string[];
  messaging: string[];
  offers_seen: string[];
  audience: string;
  logo_description: string;
};

export type ScanPayload = {
  raw: { url?: string; colors?: string[]; fonts?: string[]; image_urls?: string[] };
  extracted: Record<string, unknown>;
  brand_language: BrandLanguage;
};

export const DEMO_BRAND: BrandLanguage = {
  business_name: "לחם תום",
  palette: [
    { hex: "#3B2A22", role: "primary", name: "חום תנור" },
    { hex: "#C45C26", role: "accent", name: "חלודה חמה" },
    { hex: "#F3E6D4", role: "background", name: "קמח" },
    { hex: "#1A1512", role: "ink", name: "פחם" },
    { hex: "#7A8B5A", role: "secondary", name: "זית" },
  ],
  typography: { primary: "כותרות כבדות וקצרות", mood: "שכונתי, ידני, בלי לקה" },
  visual_style: "צילום קרוב של קרום, קמח על שיש, אור בוקר ביפו. בלי סטודיו מבריק.",
  photography: "close, warm, flour-dusted, neighborhood bakery light",
  voice: "עברית מדוברת, קצרה, כמו פתק על הדלפק",
  voice_examples: ["החלות נגמרות לפני הצהריים", "אופים כל בוקר, בלי מלאי אתמול"],
  do_say: ["איסוף היום", "וואטסאפ", "שכונה", "חלה"],
  dont_say: ["פרימיום", "חוויית לקוח", "חדשנות"],
  messaging: ["אפייה יומית", "חלה לשישי", "שכונתיות ביפו"],
  offers_seen: ["מחמצת", "חלות שישי", "מארזי חג"],
  audience: "תושבי יפו ונווה צדק שמזמינים לשישי ולחג",
  logo_description: "אותיות כהות פשוטות, בלי אייקון מאפה מבריק",
};

export const DEMO_BUSINESS: Business = {
  id: 1,
  name: "לחם תום",
  website_url: "https://lechem-tom.example.co.il",
  business_type: "מאפייה שכונתית / בית קפה",
  offerings: "לחמי מחמצת באפייה יומית, חלות שישי, מאפי בוקר ומארזי חג לשולחן",
  location: "שוק הפשפשים, יפו (עולי ציון 12)",
  presence_type: "brick_and_mortar",
  social_links: {
    instagram: "https://instagram.com/lechem_tom",
    facebook: "https://facebook.com/lechem.tom.jaffa",
    whatsapp: "https://wa.me/972501234567",
  },
  monthly_budget_ils: 4500,
  competitors: [
    { name: "לחמים", website_url: "https://lehamim.co.il" },
    { name: "בייקרי מרקט", website_url: "https://bakery-market.example.co.il" },
    { name: "מאפיית בר-קמח", website_url: "https://bar-kemach.example.co.il" },
  ],
  primary_goal: "sales",
  onboarding_complete: true,
  scraped_profile: {
    raw: { url: "https://lechem-tom.example.co.il", colors: ["#3B2A22", "#C45C26", "#F3E6D4"] },
    extracted: { business_name: "לחם תום", tone: "שכונתי וחם" },
    brand_language: DEMO_BRAND,
  },
  brand_language: DEMO_BRAND,
};

const DEMO_IMAGES = [
  "/demo/post-1.svg",
  "/demo/post-2.svg",
  "/demo/post-3.svg",
  "/demo/post-4.svg",
  "/demo/post-5.svg",
  "/demo/post-6.svg",
  "/demo/post-7.svg",
];

const POSTS: RoadmapPost[] = [
  {
    week: 1,
    date_hint: "2026-09-07",
    format: "reel",
    title: "החלות נגמרות לפני הצהריים",
    angle: "תחושת דחיפות לפני ראש השנה",
    hook: "אם אתם מגיעים אחרי 11:00 בשישי — אל תתבאסו",
    caption: "פותחים הזמנות לחגי תשרי. שריינו חלה עגולה ושולחן חג לפני שניסגר.",
    cta: "הזמנה בוואטסאפ עד רביעי בערב",
    calendar_tie: "הכנות לחגי תשרי",
    goal_fit: "מכירות מוקדמות לחג",
    image_prompt: "Warm close-up of golden challah loaves on a floured Jaffa bakery counter at morning light",
    overlay_text: "החלות נגמרות",
    primary_outlet: "instagram",
    outlets: ["instagram", "facebook", "whatsapp"],
    metrics_to_watch: ["פניות בוואטסאפ", "שמירות פוסט"],
    outlet_captions: {
      instagram: "אם אתם מגיעים אחרי 11:00 בשישי — אל תתבאסו. פותחים הזמנות חג בוואטסאפ בביו 🥖",
      facebook: "פותחים הזמנות לחגי תשרי ביפו! כדי שלא תעמדו בתור של שישי, סוגרים מראש בוואטסאפ.",
      whatsapp: "היי חברים! פתחנו הרשמה מוקדמת לחלות ראש השנה. כיתבו לנו כמה חלות לשריין לכם.",
    },
  },
  {
    week: 1,
    date_hint: "2026-09-09",
    format: "carousel",
    title: "מארז ראש השנה לשישי",
    angle: "חלה, ריבה, ומשהו מלוח לשולחן",
    hook: "מה שמים על השולחן כשהאורחים כבר בדרך",
    caption: "קרוסלה: מה בפנים, מחיר, ואיסוף מיפו. מארז מוקפד עם יצרני בוטיק שכנים.",
    cta: "לינק להזמנה באתר או בוואטסאפ",
    calendar_tie: "ראש השנה",
    goal_fit: "המרת צפייה להזמנה",
    image_prompt: "Holiday bakery box with challah, jam, and a savory pastry on kraft paper",
    overlay_text: "מארז ראש השנה",
    primary_outlet: "instagram",
    outlets: ["instagram", "facebook"],
    metrics_to_watch: ["דפדופים בקרוסלה", "קליקים לקישור"],
    outlet_captions: {
      instagram: "מה שמים על השולחן כשהאורחים כבר בדרך? מארז ראש השנה מיפו — דפדפו לראות מה בפנים.",
      facebook: "מארז ראש השנה המלא של לחם תום זמין להזמנה מוקדמת. כל הפרטים בתמונות.",
      whatsapp: "מארז ראש השנה שלנו מוכן! כולל חלה עגולה, עוגת דבש וריבת תאנים מקומית. להזמנה השיבו להודעה.",
    },
  },
  {
    week: 2,
    date_hint: "2026-09-11",
    format: "image",
    title: "סגירה לחג — שעות מדויקות",
    angle: "שירות ברור ושקיפות",
    hook: "מתי אנחנו פתוחים ומתי לא בחג",
    caption: "י״ב–י״ג בספטמבר סגורים. בערב החג פתוחים מ-07:00 עד 13:00 בלבד לאיסוף הזמנות.",
    cta: "שמרו את שעות הפתיחה",
    calendar_tie: "ראש השנה",
    goal_fit: "מניעת בלבול ותיאום ציפיות",
    image_prompt: "Handwritten bakery hours card on dark wood, cream paper, rust ink",
    overlay_text: "סגורים 12–13.9",
    primary_outlet: "facebook",
    outlets: ["instagram", "facebook"],
    metrics_to_watch: ["שמירות פוסט", "שיתופים"],
    outlet_captions: {
      instagram: "מתי פתוחים בראש השנה? שמרו את הפוסט כדי לא להגיע לדלת סגורה 📌",
      facebook: "שעות פתיחה וסגירה לחגי תשרי אצלנו בלחם תום. ממליצים להגיע מוקדם לאיסופים.",
      whatsapp: "עדכון שעות לחג: פתוחים בערב חג עד 13:00, וסגורים בימי החג. שנה טובה!",
    },
  },
  {
    week: 2,
    date_hint: "2026-09-16",
    format: "reel",
    title: "אחרי החג: הלחם היומי חוזר",
    angle: "חזרה לשגרה",
    hook: "יום ראשון אחרי ראש השנה — התור חוזר",
    caption: "מחמצת של יום חול וכריך קממבר. חזרנו לשגרה שקטה ביפו.",
    cta: "בוקר שלם אצלנו עד 13:00",
    calendar_tie: "",
    goal_fit: "שימור תנועה יומית",
    image_prompt: "Sliced sourdough and a sandwich on a neighborhood counter after the holiday",
    overlay_text: "הלחם היומי חוזר",
    primary_outlet: "instagram",
    outlets: ["instagram", "tiktok"],
    metrics_to_watch: ["צפיות ברילס", "ביקורים בפרופיל"],
    outlet_captions: {
      instagram: "החג נגמר, המחמצת חזרה לתנור. בוקר יפואי רגיל וטוב ☕",
      facebook: "חוזרים לשגרה: לחמי המחמצת והמאפים החמים מחכים לכם על המדף.",
      whatsapp: "בוקר טוב! חזרנו לאפות. הלחמים יצאו עכשיו מהתנור.",
    },
  },
  {
    week: 3,
    date_hint: "2026-09-20",
    format: "image",
    title: "יום כיפור — סגורים, בלי מבצע",
    angle: "שקט. אין הנחות.",
    hook: "אנחנו סוגרים מוקדם בערב החג",
    caption: "כ״א בספטמבר סגורים. מאחלים שקט, סליחה וזמן משפחתי.",
    cta: "",
    calendar_tie: "יום כיפור",
    goal_fit: "אמון וקהילתיות",
    image_prompt: "Quiet dark bakery interior, oven off, no sale graphics",
    overlay_text: "סגורים. בלי מבצע.",
    primary_outlet: "instagram",
    outlets: ["instagram", "facebook"],
    metrics_to_watch: ["מעורבות חיובית"],
    outlet_captions: {
      instagram: "מכבים את התנורים ליום כיפור. שקט, גמר חתימה טובה.",
      facebook: "סגורים בערב כיפור וביום כיפור. צום קל ומועיל למי שצם.",
      whatsapp: "סגורים ליום כיפור. נחזור לאפות מיד אחרי.",
    },
  },
  {
    week: 4,
    date_hint: "2026-09-25",
    format: "carousel",
    title: "סוכות בחוץ — לחם לפיקניק",
    angle: "אירוח בסוכה ובפארק",
    hook: "מה לוקחים כשאוכלים בחוץ שבוע שלם",
    caption: "בגטים, פוקצ׳ות עם עגבניות צלויות, ומארז משפחתי מושלם לסוכה.",
    cta: "הזמנת מארז סוכות בוואטסאפ",
    calendar_tie: "סוכות",
    goal_fit: "מכירות לחול המועד",
    image_prompt: "Picnic breads, baguettes and focaccia on a outdoor table under sukkah shade",
    overlay_text: "לחם לפיקניק",
    primary_outlet: "instagram",
    outlets: ["instagram", "facebook", "whatsapp"],
    metrics_to_watch: ["שמירות פוסט", "הזמנות מארז"],
    outlet_captions: {
      instagram: "יוצאים לסוכה? קחו איתכם פוקצ׳ה שרק יצאה מהתנור. פרטים בקרוסלה.",
      facebook: "מארזי סוכות ופיקניק ביפו זמינים לאיסוף כל חול המועד.",
      whatsapp: "מארז חול המועד סוכות מוכן: בגט צרפתי, 2 פוקצ'ות ומטבל שמן זית זעתר.",
    },
  },
  {
    week: 4,
    date_hint: "2026-09-28",
    format: "reel",
    title: "מאחורי התנור בסוכות",
    angle: "מותג ואותנטיות, לא רק מבצע",
    hook: "איך נראית משמרת כשהעיר בחופש",
    caption: "30 שניות מהלילה: הלישה, הקמח, והריח של יפו ב-05:00 בבוקר.",
    cta: "סמנו לנו הגעה בסטורי",
    calendar_tie: "סוכות",
    goal_fit: "מודעות וביקור בסניף",
    image_prompt: "Night bakery shift, warm oven glow, baker's hands, no luxury styling",
    overlay_text: "מאחורי התנור",
    primary_outlet: "instagram",
    outlets: ["instagram", "tiktok"],
    metrics_to_watch: ["זמן צפייה ממוצע", "שיתופים"],
    outlet_captions: {
      instagram: "05:00 בבוקר ביפו, כשהעיר עוד ישנה. ככה נראית משמרת סוכות 🥖✨",
      facebook: "הבצק תופח, התנור לוהט. מוזמנים לקפה ומאפה חם כל הבוקר.",
      whatsapp: "קפצו להגיד שלום! הריח של המאפים מגיע עד פינת הרחוב.",
    },
  },
];

const HOLIDAYS_2026: CalendarEvent[] = [
  { date: "2026-01-02", name: "חיסולי אחרי החורף", kind: "קניות", note: "ניקוי מלאי חורף.", source: "commercial_il" },
  { date: "2026-02-01", name: "ט״ו בשבט", kind: "חג", note: "עצים וקיימות.", source: "hebrew_calendar" },
  { date: "2026-03-03", name: "פורים", kind: "חג", note: "תחפושות ומשלוח מנות.", source: "hebrew_calendar" },
  { date: "2026-03-08", name: "יום האישה", kind: "תרבות", note: "מתנות ושירותים.", source: "commercial_il" },
  { date: "2026-04-02", name: "פסח", kind: "חג", note: "הקניות הגדולות של השנה.", source: "hebrew_calendar" },
  { date: "2026-04-08", name: "שביעי של פסח", kind: "חג", note: "סיום חול המועד.", source: "hebrew_calendar" },
  { date: "2026-04-14", name: "יום השואה", kind: "זיכרון", note: "אין מבצעים.", source: "hebrew_calendar" },
  { date: "2026-04-21", name: "יום הזיכרון", kind: "זיכרון", note: "השבתה פרסומית.", source: "hebrew_calendar" },
  { date: "2026-04-22", name: "יום העצמאות", kind: "לאומי", note: "מנגל ובילוי משפחתי.", source: "hebrew_calendar" },
  { date: "2026-05-15", name: "יום ירושלים", kind: "לאומי", note: "תיירות מקומית.", source: "hebrew_calendar" },
  { date: "2026-05-22", name: "שבועות", kind: "חג", note: "חלבי ומאפיות.", source: "hebrew_calendar" },
  { date: "2026-07-01", name: "תחילת החופש הגדול", kind: "עונתי", note: "משפחות ופנאי.", source: "commercial_il" },
  { date: "2026-07-29", name: "ט״ו באב", kind: "תרבות", note: "יום אהבה ישראלי.", source: "hebrew_calendar" },
  { date: "2026-08-10", name: "חזרה ללימודים", kind: "עונתי", note: "ילקוטים וחוגים.", source: "commercial_il" },
  { date: "2026-09-01", name: "פתיחת שנת הלימודים", kind: "עונתי", note: "חזרה לשגרה.", source: "commercial_il" },
  { date: "2026-09-01", name: "הכנות לחגי תשרי", kind: "קניות", note: "מזון ומתנות.", source: "commercial_il" },
  { date: "2026-09-12", name: "ראש השנה", kind: "חג", note: "שולחן חג וחלות.", source: "hebrew_calendar" },
  { date: "2026-09-13", name: "ראש השנה — יום שני", kind: "חג", note: "עסקים סגורים.", source: "hebrew_calendar" },
  { date: "2026-09-21", name: "יום כיפור", kind: "חג", note: "אין קידום מכירות.", source: "hebrew_calendar" },
  { date: "2026-09-26", name: "סוכות", kind: "חג", note: "אירוח בחוץ.", source: "hebrew_calendar" },
  { date: "2026-10-03", name: "שמחת תורה", kind: "חג", note: "סיום חגי תשרי.", source: "hebrew_calendar" },
  { date: "2026-11-27", name: "בלאק פריידי", kind: "קניות", note: "יום הקניות הגדול.", source: "commercial_il" },
  { date: "2026-11-30", name: "סייבר מאנדיי", kind: "קניות", note: "המשך האי-קומרס.", source: "commercial_il" },
  { date: "2026-12-01", name: "סוף שנה אזרחית", kind: "קניות", note: "סגירת תקציבים.", source: "commercial_il" },
  { date: "2026-12-05", name: "חנוכה", kind: "חג", note: "שמונה ימים וסופגניות.", source: "hebrew_calendar" },
];

const MONTHS = [
  ["January", "ינואר"],
  ["February", "פברואר"],
  ["March", "מרץ"],
  ["April", "אפריל"],
  ["May", "מאי"],
  ["June", "יוני"],
  ["July", "יולי"],
  ["August", "אוגוסט"],
  ["September", "ספטמבר"],
  ["October", "אוקטובר"],
  ["November", "נובמבר"],
  ["December", "דצמבר"],
] as const;

const DEMO_STRATEGY: StrategyPayload = {
  id: 1,
  calendar_kind: "gregorian",
  year: 2026,
  month: 9,
  month_name_en: "September",
  month_name_he: "ספטמבר",
  usp: {
    usp: "לחם תום הוא המאפייה השכונתית ביפו שאופים בה מחמצת כל בוקר וחלות לשישי — בלי רשת, עם איסוף באותו יום.",
    usp_one_liner: "חלה של שישי שנגמרת לפני שהאורחים מגיעים.",
    why_now: "ספטמבר 2026 יושב על חגי תשרי. מי שלא סוגר הזמנות לפני ראש השנה מפסיד את שיא החודש.",
    competitor_gaps: ["הרשתות מדברות מחיר, לא שעות איסוף לחג.", "חסר מארז אירוח קטן לזוג."],
    risks: ["סגירה ביום כיפור בלי הודעה מראש."],
    proof_points: ["אפייה יומית", "תור קבוע בשישי", "הזמנות וואטסאפ"],
    messaging_pillars: ["חלה וחג", "שכונתיות ביפו", "שעות ושקיפות", "מארז קטן"],
    growth_hypothesis: "אם נבנה הרגל הזמנות מוקדם בוואטסאפ 48 שעות לפני שישי במקום לחכות לתור הספונטני, נגדיל ב-30% את מכירות החלות ונצמצם בלאי כמעט לאפס.",
    growth_targets: ["400 מנויי וואטסאפ קבועים", "גידול 25% במכירות חלות שישי", "120 הזמנות מראש לחגי תשרי"],
    known_bkms: [
      "פתיחת חלון הזמנות שבועי בוואטסאפ בימי רביעי ב-10:00 בבוקר לנעילת תקציב הלקוח",
      "סרטון וידאו אותנטי מהתנור (בלי מוזיקת סטוק, סאונד טבעי של פיצוח הקרום)",
      "קמפיין מודעות רדיוס 3 ק״מ ביפו ופלורנטין לקראת חגי תשרי",
      "קריאה לפעולה ישירה לוואטסאפ במקום לשלוח לאתר מסובך",
    ],
    budget_allocation: {
      meta_ads_share_pct: 35,
      organic_production_share_pct: 45,
      local_promotion_share_pct: 20,
      guidance: "תקציב 4,500 ₪: 1,600 ₪ למודעות ממוקדות ביפו לקראת החגים, 2,000 ₪ להפקה וצילום תוכן שבועי, ו-900 ₪ לטעימות ושיתופי פעולה שכונתיים.",
    },
  },
  calendar: HOLIDAYS_2026.filter((event) => event.date.startsWith("2026-09")),
  relevant_events: [
    { date: "2026-09-01", name: "פתיחת שנת הלימודים", business_relevance: "רלוונטיות בינונית: כריכי בוקר להורים וילדים בדרך לבית הספר", relevance_tier: "medium" },
    { date: "2026-09-01", name: "הכנות לחגי תשרי", business_relevance: "קריטי: נעילת הזמנות חג מוקדמות לפני המתחרים", relevance_tier: "critical" },
    { date: "2026-09-12", name: "ראש השנה", business_relevance: "קריטי: שיא שנתי לחלות עגולות, עוגות דבש ומארזי שולחן חג", relevance_tier: "critical" },
    { date: "2026-09-21", name: "יום כיפור", business_relevance: "קריטי: הודעת סגירה שקטה, בלי מבצעים, בניית אמון וערבות קהילתית", relevance_tier: "critical" },
    { date: "2026-09-26", name: "סוכות", business_relevance: "גבוה: מארזי פיקניק, בגטים ופוקצ'ות לאירוח חוץ בחול המועד", relevance_tier: "high" },
  ],
  long_horizon_plan: {
    horizon: "רבעון סתיו–חורף 2026 (3 חודשים)",
    hypothesis: "ביסוס לחם תום כמוסד חלות ואירוח מוביל ביפו ודרום תל אביב, ומעבר מ-100% תלות בתנועת רחוב לקהילת מנויי שישי קבועה בוואטסאפ (400+ מנויים).",
    targets: ["400 מנויי וואטסאפ קבועים", "גידול 25% במכירות חלות שישי", "אפס עודפי אפייה בסופי שבוע"],
    milestones: [
      { month_label: "ספטמבר", milestone: "חגי תשרי ונעילת הזמנות מוקדמות", checkpoint: "אישור מארזי ראש השנה וסוכות" },
      { month_label: "אוקטובר", milestone: "חזרה לשגרה והשקת מועדון חלות שישי", checkpoint: "פתיחת הרשמה למנויים שכונתיים" },
      { month_label: "נובמבר", milestone: "תפריט חורף: מרקים ומחמצת עמוקה", checkpoint: "אימות סל ממוצע מעל 85 ₪" },
    ],
  },
  monthly_horizon_plan: {
    hypothesis: "בספטמבר, פרסום פשוט שמקדים את הזמנות ראש השנה בוואטסאפ ב-5 ימים יביא לסולד-אאוט מלא ללא תורים מיותרים ברחוב.",
    targets: ["סולד אאוט חלות לערב ראש השנה", "לפחות 120 הזמנות מראש בוואטסאפ", "צימצום שאלות שעות פתיחה ב-70%"],
  },
  management_and_checkpoints: {
    how_we_help: "אנחנו מפיקים את כל 7 הפוסטים בשפת האתר והצילום שלכם, מתזמנים מול החגים, ומבצעים ניתוח שבועי וחודשי של מה עבד כדי לשפר באופן מתמיד.",
    when_we_need_user: [
      "תחילת חודש: אישור תוכנית עבודה (5 דקות)",
      "פעם בשבוע: צילום וידאו קצר מהסמארטפון של התנור או הדלפק (10 דקות)",
      "ימי ראשון: אישור מהיר של פוסטי השבוע בוואטסאפ או בסטודיו (2 דקות)",
      "מענה לפניות לקוחות שמגיעות מהרשתות",
    ],
    checkpoints: [
      { timing: "שבוע 1 (1–7 בספטמבר)", purpose: "השקת הזמנות חג מוקדמות", user_action: "בדיקת לינק וואטסאפ בביו" },
      { timing: "שבוע 2 (8–14 בספטמבר)", purpose: "שיא ראש השנה ופרסום שעות סגירה", user_action: "צילום שלט שעות פתיחה פיזי בדלפק" },
      { timing: "שבוע 3 (15–21 בספטמבר)", purpose: "הודעת יום כיפור מאופקת וחזרה לשגרה", user_action: "אישור סופי לסגירת החג" },
      { timing: "שבוע 4 (22–30 בספטמבר)", purpose: "מארזי סוכות וסיכום ביצועי החודש", user_action: "ניתוח חודשי בסטודיו" },
    ],
    user_approved: false,
  },
  weekly_breakdown: [
    {
      week: 1,
      focus: "פתיחת הזמנות מוקדמות לחגי תשרי",
      what_we_do: ["ניסוח והפקת 2 פוסטים ממוקדי דחיפות", "עיצוב ויזואלי בשפת האתר", "חיבור לינק וואטסאפ למודעות"],
      what_user_does: ["לבדוק שקישור הוואטסאפ עובד", "להכין רשימת כמויות מקסימלית להזמנה מראש"],
      metrics_target: ["50 פניות בוואטסאפ", "יחס צפייה להזמנה מעל 8%"],
      media_distribution: "רילס באינסטגרם + קרוסלה בפייסבוק + סטטוס וואטסאפ",
    },
    {
      week: 2,
      focus: "שעות חג ומארז ראש השנה",
      what_we_do: ["גרפיקת שעות פתיחה נקייה", "סגירת חלון הזמנות לשישי"],
      what_user_does: ["לעדכן שעות פתיחה בגוגל עסקים", "לתלות שלט שעות על הדלת"],
      metrics_target: ["0 בלבול בשעות", "סולד אאוט חלות"],
      media_distribution: "פוסט שעות באינסטגרם ובפייסבוק",
    },
    {
      week: 3,
      focus: "יום כיפור שקט וחזרה יומית",
      what_we_do: ["פוסט שקט בלי מכירה", "תזכורת לחם יומי בראשון"],
      what_user_does: ["סגירה מוקדמת בערב כיפור"],
      metrics_target: ["אמון קהילתי ושמירות פוסט"],
      media_distribution: "תמונה בודדת באינסטגרם + סטורי בפייסבוק",
    },
    {
      week: 4,
      focus: "סוכות ואירוח בחוץ",
      what_we_do: ["קידום בגטים ופוקצ׳ות לפיקניק", "הכנת ניתוח חודשי לסטודיו"],
      what_user_does: ["לצלם 10 שניות של שולחן סוכה אם יש"],
      metrics_target: ["מכירת 40 מארזי פיקניק"],
      media_distribution: "קרוסלה באינסטגרם + פוסט קבוצות בפייסבוק",
    },
  ],
  posting_plan: {
    weekly_posts: 5,
    format_mix: { reels: 2, carousels: 2, image_posts: 1 },
    ads_guidance: "מודעות מטא קלות: 30–40% מהתקציב לרימרקטינג.",
    mix_note: "דגש על קרוסלות הצעה, רילס עם CTA ברור, וקישור לוואטסאפ.",
  },
  roadmap: {
    theme: "חגי תשרי על שולחן יפו",
    summary: "הזמנות מוקדמות, ראש השנה, שקט בכיפור, וסוכות בחוץ.",
    posts: POSTS,
    weekly_focus: [
      { week: 1, focus: "סגירת הזמנות לחג" },
      { week: 2, focus: "שעות וראש השנה" },
      { week: 3, focus: "יום כיפור בלי מכירה" },
      { week: 4, focus: "סוכות ופיקניק" },
    ],
  },
  competitors: [],
  brand_language: DEMO_BRAND,
};

const DEMO_PERFORMANCE: PerformancePayload = {
  period_start: "2026-08-08",
  period_end: "2026-09-04",
  ga4: {
    overview: {
      sessions: "1840",
      engagedSessions: "992",
      bounceRate: "0.41",
      conversions: "63",
      screenPageViews: "4210",
      averageSessionDuration: "74.2",
    },
    landing_pages: [
      {
        landingPagePlusQueryString: "/rosh-hashana",
        sessionDefaultChannelGroup: "Paid Social",
        sessions: "410",
        conversions: "28",
        bounceRate: "0.52",
      },
    ],
  },
  meta: {
    page: { name: "לחם תום", fan_count: 4120 },
    posts: [{ id: "1", caption: "החלות נגמרות לפני הצהריים", media_type: "REEL", like_count: 640 }],
  },
  diagnostic: {
    headline: "הרילס מביא מעורבות, אבל דף החג מפיל 41% לפני וואטסאפ.",
    top_content: [{ label: "רילס החלות", why: "מעורבות גבוהה — הקהל מזהה את הכאב של שישי." }],
    bottom_content: [{ label: "דף /rosh-hashana ממודעות", why: "תנועה גבוהה, נטישה 52%." }],
    funnel_issues: ["ה-CTA במודעה שולח לדף בלי כפתור וואטסאפ מעל הקיפול."],
    metric_highlights: ["63 המרות ב-28 יום", "רילס מוביל בלייקים"],
  },
};

const DEMO_RECS: RecommendationPayload = {
  week_of: "2026-09-01",
  suggestions: {
    week_summary: "הרילס עובד יפה, אבל אנשים נוטשים בדף החג — כדאי לשנות את הבקשה מהלקוח במארז ראש השנה לוואטסאפ.",
    suggestions: [
      {
        priority: "high",
        title: "שנו את הבקשה מהלקוח בפוסט של המארז",
        action: "במקום «לפרטים באתר» שימו «וואטסאפ להזמנת מארז עד רביעי».",
        evidence: "יותר מדי אנשים עוזבים את דף החג בלי להזמין.",
        target: "קרוסלת מארז ראש השנה",
      },
      {
        priority: "medium",
        title: "פרסמו את שעות הסגירה יום לפני החג",
        action: "שימו את תמונת השעות 36 שעות לפני ראש השנה — לא ביום החג עצמו.",
        evidence: "שנה שעברה היו הרבה שאלות על שעות פתיחה.",
        target: "פוסט התמונה של שבוע 2",
      },
      {
        priority: "low",
        title: "העבירו קצת תקציב מודעות למי שכבר צפה",
        action: "הורידו מעט ממודעות החג, והשקיעו יותר במי שכבר ראה את רילס החלות.",
        evidence: "המודעות מביאות צפיות, אבל פחות הזמנות ביחס לעלות.",
        target: "מודעות אינסטגרם",
      },
    ],
  },
};

function demoCalendar(year: number, month: number): CalendarPayload {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const days = new Date(year, month, 0).getDate();
  const jsDay = new Date(year, month - 1, 1).getDay();
  const names = MONTHS[month - 1];
  return {
    calendar_kind: "gregorian",
    year,
    month,
    month_name_en: names[0],
    month_name_he: names[1],
    days_in_month: days,
    first_weekday: (jsDay + 6) % 7,
    events: HOLIDAYS_2026.filter((event) => event.date.startsWith(prefix)),
    roadmap: year === 2026 && month === 9 ? { posts: POSTS } : null,
  };
}

function cloneDemoStrategy(): StrategyPayload {
  return {
    ...DEMO_STRATEGY,
    usp: {
      ...DEMO_STRATEGY.usp,
      growth_targets: [...(DEMO_STRATEGY.usp.growth_targets || [])],
      known_bkms: [...(DEMO_STRATEGY.usp.known_bkms || [])],
      budget_allocation: DEMO_STRATEGY.usp.budget_allocation ? { ...DEMO_STRATEGY.usp.budget_allocation } : undefined,
    },
    calendar: [...DEMO_STRATEGY.calendar],
    relevant_events: DEMO_STRATEGY.relevant_events ? [...DEMO_STRATEGY.relevant_events] : [],
    long_horizon_plan: DEMO_STRATEGY.long_horizon_plan
      ? {
          ...DEMO_STRATEGY.long_horizon_plan,
          targets: [...DEMO_STRATEGY.long_horizon_plan.targets],
          milestones: DEMO_STRATEGY.long_horizon_plan.milestones.map((m) => ({ ...m })),
        }
      : undefined,
    monthly_horizon_plan: DEMO_STRATEGY.monthly_horizon_plan
      ? {
          ...DEMO_STRATEGY.monthly_horizon_plan,
          targets: [...DEMO_STRATEGY.monthly_horizon_plan.targets],
        }
      : undefined,
    management_and_checkpoints: DEMO_STRATEGY.management_and_checkpoints
      ? {
          ...DEMO_STRATEGY.management_and_checkpoints,
          when_we_need_user: [...DEMO_STRATEGY.management_and_checkpoints.when_we_need_user],
          checkpoints: DEMO_STRATEGY.management_and_checkpoints.checkpoints.map((c) => ({ ...c })),
        }
      : undefined,
    weekly_breakdown: DEMO_STRATEGY.weekly_breakdown
      ? DEMO_STRATEGY.weekly_breakdown.map((w) => ({
          ...w,
          what_we_do: [...w.what_we_do],
          what_user_does: [...w.what_user_does],
          metrics_target: [...w.metrics_target],
        }))
      : [],
    posting_plan: { ...DEMO_STRATEGY.posting_plan, format_mix: { ...DEMO_STRATEGY.posting_plan.format_mix } },
    roadmap: {
      ...DEMO_STRATEGY.roadmap,
      posts: POSTS.map((post) => ({
        ...post,
        outlets: [...(post.outlets || [])],
        metrics_to_watch: [...(post.metrics_to_watch || [])],
        outlet_captions: { ...(post.outlet_captions || {}) },
      })),
      weekly_focus: (DEMO_STRATEGY.roadmap.weekly_focus || []).map((item) => ({ ...item })),
      relevant_events: DEMO_STRATEGY.relevant_events,
      long_horizon_plan: DEMO_STRATEGY.long_horizon_plan,
      monthly_horizon_plan: DEMO_STRATEGY.monthly_horizon_plan,
      management_and_checkpoints: DEMO_STRATEGY.management_and_checkpoints,
      weekly_breakdown: DEMO_STRATEGY.weekly_breakdown,
    },
    brand_language: DEMO_BRAND,
    horizon: {
      next_year: 2026,
      next_month: 10,
      next_month_name_he: "אוקטובר",
      next_exists: false,
      next_in_progress: false,
      next_stage: null,
      source_is_civil: true,
    },
  };
}

function demoResolve<T>(path: string, options: RequestInit = {}): T {
  const method = (options.method || "GET").toUpperCase();
  if (path === "/auth/me") return DEMO_USER as T;
  if (path === "/auth/logout" && method === "POST") {
    exitDemo();
    return { ok: true } as T;
  }
  if (path === "/onboarding/me") return { business: DEMO_BUSINESS } as T;
  if (path === "/onboarding/profile" && method === "POST") return { business: DEMO_BUSINESS } as T;
  if (path === "/onboarding/scan" && method === "POST") {
    return {
      business: DEMO_BUSINESS,
      scan: DEMO_BUSINESS.scraped_profile,
    } as T;
  }
  if (path === "/onboarding/brand" && method === "POST") {
    const body = JSON.parse(String(options.body || "{}")) as BrandLanguage;
    Object.assign(DEMO_BRAND, body);
    DEMO_BUSINESS.brand_language = DEMO_BRAND;
    if (DEMO_BUSINESS.scraped_profile && typeof DEMO_BUSINESS.scraped_profile === "object") {
      (DEMO_BUSINESS.scraped_profile as ScanPayload).brand_language = DEMO_BRAND;
    }
    return { business: DEMO_BUSINESS, scan: DEMO_BUSINESS.scraped_profile } as T;
  }
  if (path === "/onboarding/generate" && method === "POST") return { strategy: cloneDemoStrategy() } as T;
  if (path === "/strategy/current") return cloneDemoStrategy() as T;
  if (path === "/strategy/next-month" && method === "POST") {
    throw new ApiError("בדמו עובדים על חודש אחד. בחשבון אמיתי נבנה את החודש הבא לפי מה שאושר ומה שנמדד.", 400);
  }
  if (path === "/strategy/posts/image" && method === "POST") {
    const body = JSON.parse(String(options.body || "{}")) as { post_index?: number };
    const index = body.post_index ?? 0;
    if (!POSTS[index]) throw new ApiError("הפוסט לא נמצא", 404);
    POSTS[index] = { ...POSTS[index], image_url: DEMO_IMAGES[index] || DEMO_IMAGES[0] };
    DEMO_STRATEGY.roadmap.posts = POSTS;
    return { post: { ...POSTS[index] }, strategy: cloneDemoStrategy() } as T;
  }
  if (path === "/strategy/posts/design" && method === "POST") {
    const body = JSON.parse(String(options.body || "{}")) as {
      post_index?: number;
      vibe?: string;
      custom_prompt?: string;
      generate_image?: boolean;
    };
    const index = body.post_index ?? 0;
    if (!POSTS[index]) throw new ApiError("הפוסט לא נמצא", 404);
    const vibe = body.vibe || "";
    let has_overlay = vibe !== "hero_clean";
    let overlay_position: "top_right" | "top_left" | "bottom_bar" | "bottom_pill" | "center_card" = "bottom_pill";
    let overlay_theme: "paper_badge" | "ink_pill" | "accent_banner" | "frosted_glass" | "minimal_text" = "ink_pill";
    let concept = "צילום אותנטי של מאפי חג ומחמצת טרייה באור בוקר טבעי";
    let style = "צילום עריכתי חם · עומק שדה רדוד · שולחן עץ כפרי";
    let headline = POSTS[index].overlay_text || POSTS[index].title.slice(0, 20);
    let badge = "מהדורת חג";

    if (vibe === "hero_clean") {
      has_overlay = false;
      concept = "צילום גיבור מרהיב ונקי ללא כיתוב כלל — מיקוד בטקסטורת הבצק והאפייה הטרייה";
      style = "צילום מאקרו עריכתי · תאורת חלון טבעית · ללא הסחות דעת";
      headline = "";
      badge = "";
    } else if (vibe === "announcement_card") {
      has_overlay = true;
      overlay_position = "center_card";
      overlay_theme = "paper_badge";
      concept = "כרטיס הודעה מעוצב בסגנון נייר חם עם מסגרת עדינה וטיפוגרפיה ברורה";
      headline = POSTS[index].title.slice(0, 24);
      badge = "הודעת חג חשובה";
    } else if (vibe === "corner_badge") {
      has_overlay = true;
      overlay_position = "top_right";
      overlay_theme = "paper_badge";
      concept = "מדבקת איכות עדינה בפינה הימנית העליונה על גבי צילום עשיר";
      headline = POSTS[index].overlay_text || "טרי הבוקר";
      badge = "שישי ביפו";
    }

    POSTS[index] = {
      ...POSTS[index],
      has_overlay,
      overlay_headline: headline,
      overlay_badge: badge,
      overlay_position,
      overlay_theme,
      overlay_text: headline,
      creative_concept: concept,
      visual_style: style,
      image_url: POSTS[index].image_url || DEMO_IMAGES[index] || DEMO_IMAGES[0],
    };
    DEMO_STRATEGY.roadmap.posts = POSTS;
    return { post: { ...POSTS[index] }, strategy: cloneDemoStrategy() } as T;
  }
  if (path === "/strategy/posts/save" && method === "POST") {
    const body = JSON.parse(String(options.body || "{}")) as { post_index?: number } & Partial<RoadmapPost>;
    const index = body.post_index ?? 0;
    if (!POSTS[index]) throw new ApiError("הפוסט לא נמצא", 404);
    const has_overlay = body.has_overlay !== undefined ? body.has_overlay : (POSTS[index].has_overlay ?? true);
    const headline = body.overlay_headline !== undefined ? body.overlay_headline : (body.overlay_text || POSTS[index].overlay_headline || "");
    POSTS[index] = {
      ...POSTS[index],
      title: body.title || POSTS[index].title,
      format: body.format || POSTS[index].format,
      hook: body.hook !== undefined ? body.hook : POSTS[index].hook,
      caption: body.caption !== undefined ? body.caption : POSTS[index].caption,
      cta: body.cta !== undefined ? body.cta : POSTS[index].cta,
      has_overlay,
      overlay_headline: headline,
      overlay_badge: body.overlay_badge !== undefined ? body.overlay_badge : (POSTS[index].overlay_badge || ""),
      overlay_position: body.overlay_position || POSTS[index].overlay_position || "bottom_pill",
      overlay_theme: body.overlay_theme || POSTS[index].overlay_theme || "ink_pill",
      overlay_text: has_overlay ? headline : "",
      creative_concept: body.creative_concept || POSTS[index].creative_concept,
      visual_style: body.visual_style || POSTS[index].visual_style,
      date_hint: body.date_hint || POSTS[index].date_hint,
      primary_outlet: body.primary_outlet || POSTS[index].primary_outlet,
      outlets: body.outlets || POSTS[index].outlets,
      approval_status: "review",
      approved_at: null,
    };
    DEMO_STRATEGY.roadmap.posts = POSTS;
    return { post: { ...POSTS[index] }, strategy: cloneDemoStrategy() } as T;
  }
  if (path === "/strategy/posts/rewrite" && method === "POST") {
    const body = JSON.parse(String(options.body || "{}")) as { post_index?: number; tone?: string };
    const index = body.post_index ?? 0;
    if (!POSTS[index]) throw new ApiError("הפוסט לא נמצא", 404);
    const tone = body.tone || "direct";
    const rewrites: Record<string, { hook: string; caption: string; cta: string; overlay_text: string }> = {
      direct: {
        hook: "אם אתם צריכים חלות לשולחן החג — ההזמנה נסגרת עכשיו.",
        caption: "בלי אותיות קטנות ובלי להמתין בתור של שישי. היכנסו עכשיו לוואטסאפ ושריינו חלה לערב החג.",
        cta: "סגירת הזמנה בוואטסאפ עכשיו",
        overlay_text: "הזמינו עכשיו",
      },
      neighborhood: {
        hook: "הריח של המאפייה ביפו בשישי בבוקר זה משהו שאי אפשר להסביר.",
        caption: "שמנו לכם בצד חלה קלועה חמה עם קראסט מתפצח. תעברו דרכנו בדרך לשוק לקחת את שלכם.",
        cta: "קפצו להגיד שלום בדלפק",
        overlay_text: "חם מהתנור",
      },
      punchy: {
        hook: "חלה חמה. אפס תורים. שישי ביפו.",
        caption: "מזמינים ב-10 שניות בוואטסאפ ואוספים בדקה אחת.",
        cta: "לינק מהיר בביו",
        overlay_text: "אפס תורים",
      },
      holiday: {
        hook: "שולחן ראש השנה לא שלם בלי חלה עגולה מתוקה.",
        caption: "ערב חג מתקרב והתנורים שלנו עובדים נון-סטופ. אל תישארו בלי חלת חג על המפה הלבנה.",
        cta: "שריינו חלת חג לחג הקרוב",
        overlay_text: "שנה מתוקה",
      },
      story: {
        hook: "סבא שלי תמיד אמר שהלחם הכי טוב הוא זה שאופים באור ראשון.",
        caption: "כל בוקר ב-04:00 אנחנו מגיעים ליפו, מדליקים את התנור הגדול ומכינים את המחמצת באותה שיטה מסורתית.",
        cta: "בואו לטעום את ההבדל",
        overlay_text: "מאחורי הלחם",
      },
    };
    const chosen = rewrites[tone] || rewrites.direct;
    POSTS[index] = {
      ...POSTS[index],
      hook: chosen.hook,
      caption: chosen.caption,
      cta: chosen.cta,
      overlay_text: chosen.overlay_text,
      outlet_captions: {
        instagram: chosen.caption,
        facebook: chosen.caption,
        whatsapp: `${chosen.hook}\n${chosen.cta}`,
      },
      approval_status: "review",
      approved_at: null,
    };
    DEMO_STRATEGY.roadmap.posts = POSTS;
    return { post: { ...POSTS[index] }, strategy: cloneDemoStrategy() } as T;
  }
  if (path === "/strategy/posts/approve" && method === "POST") {
    const body = JSON.parse(String(options.body || "{}")) as { post_index?: number; approved?: boolean };
    const index = body.post_index ?? 0;
    if (!POSTS[index]) throw new ApiError("הפוסט לא נמצא", 404);
    POSTS[index] = {
      ...POSTS[index],
      approval_status: body.approved === false ? "review" : "approved",
      approved_at: body.approved === false ? null : new Date().toISOString(),
    };
    DEMO_STRATEGY.roadmap.posts = POSTS;
    return { post: { ...POSTS[index] }, strategy: cloneDemoStrategy() } as T;
  }
  if (path === "/strategy/approve" && method === "POST") {
    const body = JSON.parse(String(options.body || "{}")) as { approved?: boolean; monthly_notes?: string };
    if (DEMO_STRATEGY.management_and_checkpoints) {
      DEMO_STRATEGY.management_and_checkpoints.user_approved = body.approved ?? true;
      DEMO_STRATEGY.management_and_checkpoints.approved_at = new Date().toISOString();
      if (body.monthly_notes) {
        DEMO_STRATEGY.management_and_checkpoints.monthly_notes = body.monthly_notes;
      }
    }
    return { ok: true, strategy: cloneDemoStrategy() } as T;
  }
  if (path === "/strategy/studio") {
    const strat = cloneDemoStrategy();
    const readyCount = POSTS.filter((p) => p.image_url).length;
    const isApproved = strat.management_and_checkpoints?.user_approved ?? false;
    const updates: StudioUpdate[] = [
      {
        id: "posts-ready",
        type: "posts",
        title: `${POSTS.length} פוסטים בתוכנית החודשית`,
        description: `${readyCount} מתוך ${POSTS.length} פוסטים כוללים תמונות מוכנות בשפת האתר`,
        action_label: "מעבר לעורך הפוסטים",
        action_tab: "posts",
        status: readyCount === POSTS.length ? "ready" : "action_required",
      },
      {
        id: "brand-sync",
        type: "brand",
        title: "שפת מותג מסונכרנת מהאתר",
        description: `פלטת 5 צבעים, צילום חם ושכונתי, וכללי כתיבה עודכנו מ-לחם תום`,
        action_label: "צפייה בשפת המותג",
        action_tab: "brand",
        status: "ready",
      },
      {
        id: "hypothesis-approval",
        type: "checkpoint",
        title: "השערת צמיחה לחודש הנוכחי",
        description: strat.monthly_horizon_plan?.hypothesis || "השערת ספטמבר מוכנה לבדיקה",
        action_label: isApproved ? "השערה מאושרת ✓" : "אישור השערה",
        action_tab: "schedule",
        status: isApproved ? "ready" : "action_required",
      },
    ];
    return {
      strategy: strat,
      studio_updates: updates,
      long_horizon_tracker: {
        horizon: strat.long_horizon_plan?.horizon || "רבעון סתיו–חורף 2026",
        hypothesis: strat.long_horizon_plan?.hypothesis || strat.usp.growth_hypothesis || "",
        targets: strat.long_horizon_plan?.targets || strat.usp.growth_targets || [],
        milestones: strat.long_horizon_plan?.milestones || [],
        progress_pct: isApproved ? 65 : 35,
      },
      monthly_analysis: {
        month_name: strat.month_name_he,
        hypothesis: strat.monthly_horizon_plan?.hypothesis || "",
        targets: strat.monthly_horizon_plan?.targets || [],
        status: "active",
        what_we_measure: "מעקב פניות בוואטסאפ, המרות מדפי נחיתה ואיסוף חלות בימי שישי",
      },
    } as T;
  }
  if (path.startsWith("/calendar")) {
    const url = new URL(path, "http://local");
    return demoCalendar(Number(url.searchParams.get("year") || 2026), Number(url.searchParams.get("month") || 9)) as T;
  }
  if (path === "/integrations") {
    return {
      ga4_ready: false,
      meta_ready: false,
      integrations: [
        {
          provider: "ga4",
          status: "connected",
          external_id: "properties/318491024",
          display_name: "מאפיית לחם תום (GA4)",
          connected: true,
        },
        {
          provider: "meta",
          status: "connected",
          external_id: "10987654321",
          display_name: "לחם תום - אינסטגרם ופייסבוק",
          connected: true,
        },
      ],
      webhooks: [],
    } as T;
  }
  if (path === "/performance/latest" || (path === "/performance/sync" && method === "POST")) return DEMO_PERFORMANCE as T;
  if (path === "/performance/weekly" && method === "POST") {
    return { performance: DEMO_PERFORMANCE, recommendation: DEMO_RECS } as T;
  }
  if (path === "/recommendations/latest" || (path === "/recommendations/generate" && method === "POST")) {
    return DEMO_RECS as T;
  }
  if (path.startsWith("/integrations/webhooks") && method === "POST") {
    return { id: 1, url: "https://hooks.zapier.com/demo", secret: "demo-secret", events: "recommendations,strategy" } as T;
  }
  if (path.includes("/ga4/start") || path.includes("/meta/start")) {
    throw new ApiError("במצב דמו אין OAuth אמיתי. זה תצוגה בלבד.", 400);
  }
  throw new ApiError(`אין נתיב דמו עבור ${path}`, 404);
}

const LIVE_PATHS = new Set([
  "/auth/register",
  "/auth/login",
  "/auth/logout",
  "/onboarding/preview-scan",
  "/onboarding/hypotheses",
  "/integrations/ga4/start",
  "/integrations/meta/start",
  "/integrations/ga4/property",
  "/integrations/meta/account",
  "/integrations/ga4",
  "/integrations/meta",
  // Editing the real palette is only meaningful against the live API.
  "/onboarding/palette",
  "/auth/password",
]);

export async function api<T>(
  path: string,
  options: RequestInit = {},
  forceLiveParam = false
): Promise<T> {
  const forceLive = forceLiveParam || LIVE_PATHS.has(path);
  if (forceLive) exitDemo();
  if (isDemo() && !forceLive) return demoResolve<T>(path, options);
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(formatDetail(data.detail, res.statusText), res.status);
  }
  return data as T;
}

export const endpoints = {
  me: () => api<{ id: number; email: string; full_name: string }>("/auth/me"),
  register: (body: { email: string; password: string; full_name: string }) =>
    api("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    api("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  enterDemo: async () => {
    enterDemo();
    return DEMO_USER;
  },
  changePassword: (current_password: string, new_password: string) =>
    api<{ ok: boolean }>("/auth/password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }),
  logout: async () => {
    exitDemo();
    return api("/auth/logout", { method: "POST" });
  },
  business: () => api<{ business: Business | null }>("/onboarding/me"),
  saveProfile: (body: OnboardingPayload) =>
    api<{ business: Business }>("/onboarding/profile", { method: "POST", body: JSON.stringify(body) }),
  savePalette: (palette: BrandSwatch[]) =>
    api<{ business: Business }>("/onboarding/palette", {
      method: "POST",
      body: JSON.stringify({ palette }),
    }),
  scanWebsite: (website_url: string) =>
    api<{ business: Business; scan: ScanPayload }>("/onboarding/scan", {
      method: "POST",
      body: JSON.stringify({ website_url }),
    }),
  saveBrand: (brand_language: BrandLanguage) =>
    api<{ business: Business; scan: ScanPayload }>("/onboarding/brand", {
      method: "POST",
      body: JSON.stringify(brand_language),
    }),
  previewScan: (website_url: string) =>
    api<{ scan: ScanPayload }>("/onboarding/preview-scan", {
      method: "POST",
      body: JSON.stringify({ website_url }),
    }),
  hypotheses: () => api<{ hypotheses: GrowthHypothesis[] }>("/onboarding/hypotheses", { method: "POST" }),
  generate: () => api<GenerateResult>("/onboarding/generate", { method: "POST" }),
  generateNextMonth: () => api<GenerateResult>("/strategy/next-month", { method: "POST" }),
  strategy: () => api<StrategyPayload>("/strategy/current"),
  generatePostImage: (
    post_index: number,
    options: {
      force?: boolean;
      vibe?: string;
      custom_prompt?: string;
      /** False = reuse the business's own photo only; never spend a generation. */
      allow_generation?: boolean;
      /** "auto" prefers their own photo, "real" never generates, "ai" always does. */
      image_preference?: "auto" | "real" | "ai";
    } = {}
  ) =>
    api<{ post: RoadmapPost; strategy: StrategyPayload }>("/strategy/posts/image", {
      method: "POST",
      body: JSON.stringify({ post_index, ...options }),
    }),
  designPost: (
    post_index: number,
    options: { vibe?: string; custom_prompt?: string; generate_image?: boolean } = {}
  ) =>
    api<{ post: RoadmapPost; strategy: StrategyPayload }>("/strategy/posts/design", {
      method: "POST",
      body: JSON.stringify({ post_index, ...options }),
    }),
  generateAllPostImages: () =>
    api<{ strategy: StrategyPayload; errors: string[] }>("/strategy/posts/images", { method: "POST" }),
  publishPost: (post_index: number, published_url: string) =>
    api<{ post: RoadmapPost; strategy: StrategyPayload }>("/strategy/posts/publish", {
      method: "POST",
      body: JSON.stringify({ post_index, published_url }),
    }),
  savePost: (post_index: number, post: Partial<RoadmapPost>) =>
    api<{ post: RoadmapPost; strategy: StrategyPayload }>("/strategy/posts/save", {
      method: "POST",
      body: JSON.stringify({ post_index, ...post }),
    }),
  rewritePost: (post_index: number, tone: "direct" | "neighborhood" | "punchy" | "holiday" | "story") =>
    api<{ post: RoadmapPost; strategy: StrategyPayload }>("/strategy/posts/rewrite", {
      method: "POST",
      body: JSON.stringify({ post_index, tone }),
    }),
  approvePost: (post_index: number, approved = true) =>
    api<{ post: RoadmapPost; strategy: StrategyPayload }>("/strategy/posts/approve", {
      method: "POST",
      body: JSON.stringify({ post_index, approved }),
    }),
  approveStrategy: (approved = true, monthly_notes = "") =>
    api<{ ok: boolean; strategy: StrategyPayload }>("/strategy/approve", {
      method: "POST",
      body: JSON.stringify({ approved, monthly_notes }),
    }),
  studio: () => api<StudioOverviewPayload>("/strategy/studio"),
  calendar: (year: number, month: number) => api<CalendarPayload>(`/calendar?year=${year}&month=${month}`),
  integrations: (forceLive = false) => api<IntegrationsPayload>("/integrations", {}, forceLive),
  ga4Start: () => api<{ url: string }>("/integrations/ga4/start"),
  metaStart: () => api<{ url: string }>("/integrations/meta/start"),
  ga4Property: (body: { property_id: string; display_name: string }) =>
    api("/integrations/ga4/property", { method: "POST", body: JSON.stringify(body) }),
  metaAccount: (body: { page_id: string; instagram_id: string; display_name: string; ad_account_id?: string }) =>
    api("/integrations/meta/account", { method: "POST", body: JSON.stringify(body) }),
  disconnectIntegration: (provider: "ga4" | "meta") =>
    api<{ ok: boolean }>(`/integrations/${provider}`, { method: "DELETE" }),
  createWebhook: (body: { url: string; events: string }) =>
    api<{ secret: string; id: number; url: string }>("/integrations/webhooks", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteWebhook: (id: number) => api(`/integrations/webhooks/${id}`, { method: "DELETE" }),
  performance: () => api<PerformancePayload>("/performance/latest"),
  syncPerformance: () => api<PerformancePayload>("/performance/sync", { method: "POST" }),
  weeklyLoop: () =>
    api<{ performance: PerformancePayload; recommendation: RecommendationPayload }>("/performance/weekly", {
      method: "POST",
    }),
  recommendations: () => api<RecommendationPayload>("/recommendations/latest"),
  generateRecommendations: () => api<RecommendationPayload>("/recommendations/generate", { method: "POST" }),
};

export type Competitor = { name: string; website_url: string };

export type Business = {
  id: number;
  name: string;
  website_url: string;
  business_type: string;
  offerings: string;
  location?: string;
  presence_type?: "brick_and_mortar" | "online_only" | "hybrid";
  social_links?: Record<string, string>;
  monthly_budget_ils: number;
  competitors: Competitor[];
  primary_goal: "sales" | "brand_awareness" | "";
  onboarding_complete: boolean;
  scraped_profile: unknown;
  brand_language?: BrandLanguage | null;
  generate_state?: { stage?: string; error?: string };
};

export type OnboardingPayload = {
  name: string;
  website_url: string;
  business_type: string;
  offerings: string;
  location?: string;
  presence_type?: "brick_and_mortar" | "online_only" | "hybrid";
  social_links?: Record<string, string>;
  monthly_budget_ils: number;
  competitors: Competitor[];
  primary_goal: "sales" | "brand_awareness";
  growth_hypothesis?: string;
  growth_targets?: string[];
};

export type CalendarEvent = {
  date: string;
  name: string;
  kind: string;
  note: string;
  source: string;
};

export type RelevantEvent = {
  date: string;
  name: string;
  business_relevance: string;
  relevance_tier: "critical" | "high" | "medium";
};

export type LongHorizonMilestone = {
  month_label: string;
  milestone: string;
  checkpoint: string;
};

export type LongHorizonPlan = {
  horizon: string;
  hypothesis: string;
  targets: string[];
  milestones: LongHorizonMilestone[];
};

export type MonthlyHorizonPlan = {
  hypothesis: string;
  targets: string[];
};

export type CheckpointItem = {
  timing: string;
  purpose: string;
  user_action: string;
};

export type ManagementAndCheckpoints = {
  how_we_help: string;
  when_we_need_user: string[];
  checkpoints: CheckpointItem[];
  user_approved?: boolean;
  approved_at?: string;
  monthly_notes?: string;
};

export type WeeklyBreakdownItem = {
  week: number;
  focus: string;
  what_we_do: string[];
  what_user_does: string[];
  metrics_target: string[];
  media_distribution: string;
};

/**
 * Card template. The first five are the legacy web-component themes still stored on
 * existing strategies; the rest are real compositions (see components/CardCanvas.tsx),
 * which the renderer maps the legacy values onto. `type_hero` draws no photograph.
 */
export type OverlayTheme =
  | "paper_badge"
  | "ink_pill"
  | "accent_banner"
  | "frosted_glass"
  | "minimal_text"
  | "lower_editorial"
  | "split_panel"
  | "framed_inset"
  | "cover_type"
  | "promo_ribbon"
  | "type_hero";

export type RoadmapPost = {
  week: number;
  date_hint: string;
  format: "reel" | "carousel" | "image" | "story";
  title: string;
  angle: string;
  hook: string;
  caption: string;
  cta: string;
  calendar_tie: string;
  goal_fit: string;
  why_now?: string;
  image_prompt?: string;
  overlay_text?: string;
  has_overlay?: boolean;
  overlay_headline?: string;
  overlay_badge?: string;
  overlay_position?: "top_right" | "top_left" | "bottom_bar" | "bottom_pill" | "center_card";
  overlay_theme?: OverlayTheme;
  creative_concept?: string;
  visual_style?: string;
  scene_description?: string;
  design_creative?: {
    creative_concept?: string;
    visual_style?: string;
    scene_description?: string;
    has_overlay?: boolean;
    overlay_headline?: string;
    overlay_badge?: string;
    overlay_position?: string;
    overlay_theme?: string;
  };
  image_url?: string;
  primary_outlet?: "instagram" | "facebook" | "whatsapp" | "tiktok";
  outlets?: string[];
  metrics_to_watch?: string[];
  /** A specific, verifiable number for the card ("100 חלות כל שישי"). Beats vague claims. */
  stat_highlight?: string;
  /** Where the card's image came from: their own photo, a generated one, or none. */
  image_source?: "real_photo" | "generated" | "none";
  image_source_url?: string;
  outlet_captions?: {
    instagram?: string;
    facebook?: string;
    whatsapp?: string;
  };
  utm?: {
    utm_source: string;
    utm_medium: string;
    utm_campaign: string;
    utm_content: string;
  };
  tracking_url?: string;
  published_url?: string;
  published_at?: string | null;
  approval_status?: "review" | "approved";
  approved_at?: string | null;
};

export type GrowthHypothesis = {
  id: string;
  title: string;
  hypothesis: string;
  why_this: string;
};

export type StrategyPayload = {
  id: number;
  calendar_kind: "gregorian";
  year: number;
  month: number;
  month_name_en: string;
  month_name_he: string;
  usp: {
    usp: string;
    usp_one_liner: string;
    why_now: string;
    competitor_gaps: string[];
    risks: string[];
    proof_points: string[];
    messaging_pillars: string[];
    growth_hypothesis?: string;
    growth_targets?: string[];
    known_bkms?: string[];
    budget_allocation?: {
      meta_ads_share_pct: number;
      organic_production_share_pct: number;
      local_promotion_share_pct: number;
      guidance: string;
    };
  };
  calendar: CalendarEvent[];
  posting_plan: {
    weekly_posts: number;
    format_mix: { reels: number; carousels: number; image_posts: number };
    ads_guidance: string;
    mix_note: string;
  };
  roadmap: {
    theme: string;
    summary: string;
    posts: RoadmapPost[];
    weekly_focus?: { week: number; focus: string }[];
    relevant_events?: RelevantEvent[];
    long_horizon_plan?: LongHorizonPlan;
    monthly_horizon_plan?: MonthlyHorizonPlan;
    management_and_checkpoints?: ManagementAndCheckpoints;
    weekly_breakdown?: WeeklyBreakdownItem[];
  };
  relevant_events?: RelevantEvent[];
  long_horizon_plan?: LongHorizonPlan;
  monthly_horizon_plan?: MonthlyHorizonPlan;
  management_and_checkpoints?: ManagementAndCheckpoints;
  weekly_breakdown?: WeeklyBreakdownItem[];
  competitors: unknown[];
  brand_language?: BrandLanguage | null;
  horizon?: MonthHorizon;
};

export type MonthHorizon = {
  next_year: number;
  next_month: number;
  next_month_name_he: string;
  next_exists: boolean;
  next_in_progress: boolean;
  next_stage?: string | null;
  source_is_civil?: boolean;
};

export type StudioUpdate = {
  id: string;
  type: "posts" | "brand" | "checkpoint" | "metrics";
  title: string;
  description: string;
  action_label: string;
  action_tab: string;
  status: "ready" | "action_required";
};

export type StudioOverviewPayload = {
  strategy: StrategyPayload;
  studio_updates: StudioUpdate[];
  long_horizon_tracker: {
    horizon: string;
    hypothesis: string;
    targets: string[];
    milestones: LongHorizonMilestone[];
    progress_pct: number;
  };
  monthly_analysis: {
    month_name: string;
    hypothesis: string;
    targets: string[];
    status: string;
    what_we_measure: string;
  };
};

export type CalendarPayload = {
  calendar_kind: "gregorian";
  year: number;
  month: number;
  month_name_en: string;
  month_name_he: string;
  days_in_month: number;
  first_weekday: number;
  events: CalendarEvent[];
  roadmap: { posts: RoadmapPost[] } | null;
};

export type IntegrationsPayload = {
  ga4_ready: boolean;
  meta_ready: boolean;
  integrations: {
    provider: string;
    status: string;
    external_id: string;
    display_name: string;
    connected: boolean;
    properties?: { property_id: string; display_name: string; account: string }[];
    pages?: { page_id: string; display_name: string; instagram_id: string }[];
  }[];
  webhooks: { id: number; url: string; events: string; created_at: string }[];
};

export type PerformancePayload = {
  /** False when nothing has been synced yet — a normal state, not an error. */
  available?: boolean;
  period_start: string;
  period_end: string;
  ga4: {
    overview?: Record<string, string>;
    landing_pages?: Record<string, string>[];
    campaigns?: Record<string, string>[];
    post_attribution?: Record<string, unknown>[];
  };
  meta: { page?: { name?: string; fan_count?: number }; posts?: Record<string, unknown>[] };
  diagnostic: {
    headline: string;
    top_content: { label: string; why: string }[];
    bottom_content: { label: string; why: string }[];
    funnel_issues: string[];
    metric_highlights: string[];
  };
};

export type RecommendationPayload = {
  /** False when no weekly loop has run yet — a normal state, not an error. */
  available?: boolean;
  week_of: string;
  suggestions: {
    week_summary: string;
    suggestions: {
      priority: "high" | "medium" | "low";
      title: string;
      action: string;
      evidence: string;
      target: string;
    }[];
  };
  webhook_deliveries?: { url: string; ok: boolean; error?: string }[];
};

export type GenerateResult = {
  done?: boolean;
  generate_state?: { stage?: string };
  business?: Business;
  strategy?: StrategyPayload;
};

export async function generateUntilDone(
  start: () => Promise<GenerateResult>,
  onStage?: (stage: string) => void,
): Promise<GenerateResult> {
  let result: GenerateResult | null = null;
  for (let step = 0; step < 10; step += 1) {
    try {
      result = await start();
    } catch (err) {
      if (err instanceof ApiError && err.status === 502 && step < 9) {
        await new Promise((resolve) => window.setTimeout(resolve, 4000 * (step + 1)));
        continue;
      }
      throw err;
    }
    const stage = result.generate_state?.stage || result.business?.generate_state?.stage;
    if (stage) onStage?.(stage);
    if (result.strategy) return result;
  }
  throw new ApiError("בניית התוכנית נעצרה באמצע. נסו שוב — ממשיכים מהשלב שנשמר.", 502);
}
