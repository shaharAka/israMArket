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
  // A fresh demo session gets a fresh library — otherwise a deletion from a previous
  // visit looked permanent.
  DEMO_ASSETS = DEMO_ASSETS_SEED.map((asset) => ({ ...asset, tags: [...asset.tags] }));
  // Same reason for the audience segments: a demo that generated or deleted them should
  // not hand the next visit a set nobody meant to keep.
  DEMO_AUDIENCES = DEMO_AUDIENCES_SEED.map((audience) => ({
    ...audience,
    needs: [...audience.needs],
    where: [...audience.where],
    targeting: { ...audience.targeting },
  }));
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
  business_model: "products",
  onboarding_complete: true,
  scraped_profile: {
    raw: { url: "https://lechem-tom.example.co.il", colors: ["#3B2A22", "#C45C26", "#F3E6D4"] },
    extracted: { business_name: "לחם תום", tone: "שכונתי וחם" },
    brand_language: DEMO_BRAND,
  },
  brand_language: DEMO_BRAND,
  diagnostics: {
    has_customer_club: "no",
    repeat_vs_new: "mostly_repeat",
    priority_channel: "physical",
    capacity_constraint: "תנור אחד, אפייה לילה אחת",
  },
  growth_targets: [],
};

/** Candidates offered for ranking in onboarding step 5. Deliberately spread across
 *  categories so the ranking actually changes the plan. The three ranked candidates are
 *  the agent's recommendation, surfaced by the "let the agent decide" control. */
const DEMO_TARGET_CANDIDATES: GrowthTargetCandidate[] = [
  {
    id: "t1",
    category: "נאמנות",
    target: "להקים קלאב לקוחות עם 300 חברים עד סוף הרבעון",
    why_this: "אין קלאב היום, ולחם נקנה שוב ושוב — זה הקהל הזול ביותר לחזור אליו",
    recommended_rank: 1,
  },
  {
    id: "t2",
    category: "מכירות",
    target: "להעלות מכירות חלות שישי ב-25% בתוך שלושה חודשים",
    why_this: "החלות כבר נמכרות, והביקוש מרוכז ביום אחד שאפשר להגדיל",
    recommended_rank: 0,
  },
  {
    id: "t3",
    category: "תפעול",
    target: "לצמצם בלאי מאפים בסוף יום מ-12% ל-5%",
    why_this: "בלאי הוא כסף ישר מהשורה התחתונה, בלי להוסיף תנועה",
    recommended_rank: 0,
  },
  {
    id: "t4",
    category: "קהל",
    target: "להביא 120 לקוחות חדשים מהשכונה בכל חודש",
    why_this: "יש תנועה פיזית קבועה בשוק שאפשר ללכוד",
    recommended_rank: 2,
  },
  {
    id: "t5",
    category: "נוכחות דיגיטלית",
    target: "להגיע ל-1,000 עוקבים מקומיים באינסטגרם",
    why_this: "הערוץ כבר פעיל אבל קטן ביחס לתנועה שיש בחנות",
    recommended_rank: 0,
  },
  {
    id: "t6",
    category: "מכירות",
    target: "להשיק מארזי חג בהזמנה מוקדמת ולהגיע ל-150 הזמנות",
    why_this: "חגי תשרי הם שיא הביקוש, והזמנה מוקדמת מחליקה את העומס",
    recommended_rank: 3,
  },
];

/**
 * Audience segments — who the plan and every post are actually for.
 *
 * Mirrors `AudienceOut` in `api/app/routers/audiences.py`. `priority` says how the segment
 * ranks in the whole set; `is_primary` marks the single segment the plan leads with, and
 * the API guarantees exactly one. `source` records whether the agent proposed it or the
 * owner wrote it, which is why a generated list is never assumed to be final.
 */
/** The advertising layer of a segment. Shaped after `AudienceTargetingIn` in
 *  `api/app/schemas.py` — every field optional, because a small business often knows who
 *  its customers are without knowing an age range. */
export type AudienceTargeting = {
  interests?: string[];
  keywords?: string[];
  age_range?: string;
  gender?: string;
  geo?: string;
};

export type Audience = {
  id: number;
  name: string;
  /** One line the cards can show without opening the segment. */
  summary: string;
  description: string;
  needs: string[];
  where: string[];
  /** Channel-agnostic targeting hints; the API always answers with the five keys above. */
  targeting: AudienceTargeting;
  priority: "primary" | "secondary";
  source: "generated" | "manual";
  is_primary: boolean;
  created_at: string;
};

export type AudiencePayload = {
  name: string;
  summary?: string;
  description?: string;
  needs?: string[];
  where?: string[];
  targeting?: AudienceTargeting;
  priority?: "primary" | "secondary";
};

/**
 * Demo segments for the bakery. Three deliberately different shapes: the primary one
 * (locally rooted, repeat buyer), a secondary one the plan can still serve, and a
 * manually-written one with no generation behind it — so the screen exercises the
 * primary marker, both `source` values and a segment that is neither.
 */
let DEMO_AUDIENCES: Audience[] = [
  {
    id: 1,
    name: "משפחות מיפו והשכונות הסמוכות",
    summary: "מי שקונה לשולחן של שישי ולחגים, וחוזר כל שבוע לאותו מקום.",
    description:
      "תושבי יפו, נווה צדק ופלורנטין, בעיקר זוגות עם ילדים בגיל בית ספר. קונים פעם-פעמיים בשבוע, מכירים את הדלפק בשם, ומתכננים את השישי מראש. הרגישות שלהם היא למחיר של מארז שלם, לא ללחם בודד.",
    needs: ["חלה טרייה לשישי", "מארז חג מוכן לאירוח", "שעות פתיחה מדויקות", "איסוף מהיר בלי תור"],
    where: ["שוק הפשפשים", "קבוצות השכונה בפייסבוק", "וואטסאפ של המאפייה", "גוגל מפות"],
    targeting: {
      interests: ["אוכל מקומי", "אפייה ביתית"],
      keywords: ["מאפייה ביפו", "חלות לשישי"],
      age_range: "30-50",
      gender: "",
      geo: "יפו ונווה צדק, רדיוס 3 ק״מ",
    },
    priority: "primary",
    source: "generated",
    is_primary: true,
    created_at: "2026-08-30T08:15:00Z",
  },
  {
    id: 2,
    name: "מזמיני חג חד-פעמיים",
    summary: "מזמינים מארז לחג או לאירוח, בלי להיות לקוח קבוע של המאפייה.",
    description:
      "מגיעים דרך המלצה או חיפוש בגוגל לקראת ראש השנה וסוכות, קונים מארז גדול פעם-פעמיים בשנה. הצורך שלהם הוא לתפוס מקום בהזמנה מוקדמת לפני שנגמר, ולקבל ודאות על שעת האיסוף.",
    needs: ["ודאות שההזמנה מחכה", "מארז שמתאים לשולחן החג", "הזמנה מראש בוואטסאפ"],
    where: ["חיפוש בגוגל", "אינסטגרם", "המלצות בקבוצות"],
    targeting: {
      interests: ["אירוח וחגים"],
      keywords: ["מארז ראש השנה", "הזמנת חלות לחג"],
      age_range: "28-55",
      gender: "",
      geo: "",
    },
    priority: "secondary",
    source: "generated",
    is_primary: false,
    created_at: "2026-08-30T08:15:00Z",
  },
  {
    id: 3,
    name: "שולחי מתנות לעמיתים",
    summary: "מזמינים מארז מתנה לעבודה, בלי קשר אישי למאפייה.",
    description:
      "אנשי משרדים בתל אביב שמחפשים מתנה קטנה ומכובדת ללקוח או לעמית. הצורך הוא משלוח או איסוף מסודר בתאריך מדויק, וחשבונית מסודרת.",
    needs: ["מארז שנראה כמו מתנה", "אפשרות לשלוח לכתובת אחרת", "חשבונית"],
    where: ["לינקדאין", "המלצות של לקוחות עסקיים"],
    targeting: {
      interests: [],
      keywords: ["משלוחי מתנה לעסקים"],
      age_range: "",
      gender: "",
      geo: "תל אביב",
    },
    priority: "secondary",
    source: "manual",
    is_primary: false,
    created_at: "2026-09-02T11:40:00Z",
  },
];

/** Mirrors the fixture so re-entering demo mode starts from the same three segments. */
const DEMO_AUDIENCES_SEED: Audience[] = DEMO_AUDIENCES.map((audience) => ({
  ...audience,
  needs: [...audience.needs],
  where: [...audience.where],
  targeting: { ...audience.targeting },
}));

let demoAudienceId = 100;

/** The three segments the generator returns in demo mode — same ids, fresh names. */
function demoGeneratedAudiences(): Audience[] {
  const drafts: Omit<Audience, "id" | "created_at">[] = [
    {
      name: "שכנים שאופים בבית בסוף שבוע",
      summary: "קונים מחמצת ולחם יום-יומי, ומושכים גם לקפה ומאפה בבוקר.",
      description:
        "תושבי הסביבה שעובדים מהבית וחוזרים ברגל מהשוק. קונים לחם פעמיים-שלוש בשבוע, מגיבים לתוכן על התהליך עצמו ולא למבצעים.",
      needs: ["לחם מחמצת טרי כל יום", "מאפה בוקר וקפה", "ידיעה מה נגמר ומה נשאר"],
      where: ["הליכה ברחוב", "אינסטגרם", "סטורי של המאפייה"],
      targeting: { interests: ["לחם מחמצת"], keywords: [], age_range: "25-45", gender: "", geo: "יפו, רדיוס 1.5 ק״מ" },
      priority: "primary",
      source: "generated",
      is_primary: true,
    },
    {
      name: "הורים שקונים לדרך לבית הספר",
      summary: "קונים כריכים ומאפים בבוקר, בקנייה מהירה וקבועה.",
      description:
        "הורים בדרך לבתי הספר בסביבה, בין 07:00 ל-08:15. הצורך הוא מהירות וודאות שהמאפה קיים, לא מבחר גדול.",
      needs: ["מאפה טרי בשעה מוקדמת", "קנייה מהר בלי תור", "משהו שהילד יאכל"],
      where: ["פייסבוק", "קבוצת ההורים של בית הספר", "הדלת הפיזית"],
      targeting: { interests: [], keywords: ["כריך לבית ספר"], age_range: "30-45", gender: "", geo: "" },
      priority: "secondary",
      source: "generated",
      is_primary: false,
    },
    {
      name: "מי שמחפש מארז מתנה לחג",
      summary: "קונים מארז אחד מושקע, לרוב להענקה ולא לעצמם.",
      description:
        "לקראת חגים מחפשים משהו שנראה מכובד להביא לארוחה או לשלוח. רגישים לאריזה ולמועד האספקה יותר מאשר למחיר.",
      needs: ["אריזה שמתאימה להענקה", "אספקה עד תאריך מסוים", "מארז במחיר צפוי"],
      where: ["חיפוש בגוגל", "אינסטגרם", "וואטסאפ"],
      targeting: { interests: ["מתנות", "אירוח"], keywords: ["מארז מתנה לחג"], age_range: "", gender: "", geo: "" },
      priority: "secondary",
      source: "generated",
      is_primary: false,
    },
  ];
  // The generator answers with a whole set: the first one leads.
  return drafts.map((draft, index) => {
    demoAudienceId += 1;
    return {
      ...draft,
      id: demoAudienceId,
      is_primary: index === 0,
      priority: index === 0 ? "primary" : "secondary",
      created_at: new Date().toISOString(),
    };
  });
}

const DEMO_IMAGES = [
  "/demo/post-1.svg",
  "/demo/post-2.svg",
  "/demo/post-3.svg",
  "/demo/post-4.svg",
  "/demo/post-5.svg",
  "/demo/post-6.svg",
  "/demo/post-7.svg",
];

/** Their own library of photos and clips — the raw material for post images. */
export type Asset = {
  id: number;
  kind: "image" | "video";
  mime: string;
  source: AssetSource;
  source_url: string;
  description: string;
  tags: string[];
  /** Already a servable path — safe to drop straight into an `<img src>`. */
  url: string;
  width: number;
  height: number;
  created_at: string;
};

export type AssetPatch = { description?: string; tags?: string[] };

export type AssetSource = "upload" | "url" | "site";

/** One library asset the model ranked against a post, with its short Hebrew reason. */
export type AssetSuggestion = { asset_id: number; reason: string };

/**
 * Demo-mode asset library. Descriptions and tags stand in for the AI pass so the screen
 * exercises every state it has — three sources, both kinds, and a clip with no thumbnail.
 */
let DEMO_ASSETS: Asset[] = [
  {
    id: 1,
    kind: "image",
    mime: "image/jpeg",
    source: "upload",
    source_url: "",
    description: "חלות קלועות טריות על שולחן הקמח, ממש אחרי שיצאו מהתנור בתאורת בוקר.",
    tags: ["חלות", "מחמצת", "תנור", "שישי"],
    url: "/demo/post-1.svg",
    width: 1200,
    height: 900,
    created_at: "2026-09-01T06:20:00Z",
  },
  {
    id: 2,
    kind: "image",
    mime: "image/png",
    source: "site",
    source_url: "https://lechem-tom.example.co.il/gallery",
    description: "חזית המאפייה ברחוב, עם השלט הישן ותיבת החלות ליד הדלת.",
    tags: ["חזית החנות", "יפו", "מיתוג"],
    url: "/demo/post-2.svg",
    width: 1000,
    height: 1000,
    created_at: "2026-09-02T09:05:00Z",
  },
  {
    id: 3,
    kind: "image",
    mime: "image/jpeg",
    source: "url",
    source_url: "https://instagram.com/p/CxYzLechemTom",
    description: "מארז ראש השנה: חלה עגולה, עוגת דבש וריבת תאנים על נייר קראפט.",
    tags: ["ראש השנה", "מארז", "מתנה", "חג"],
    url: "/demo/post-5.svg",
    width: 1080,
    height: 1350,
    created_at: "2026-09-03T14:40:00Z",
  },
  {
    id: 4,
    kind: "video",
    mime: "video/mp4",
    source: "upload",
    source_url: "",
    description: "קליפ קצר של לישת הבצק ב-05:00 בבוקר, בלי סאונד.",
    tags: ["מאחורי הקלעים", "בצק", "וידאו"],
    // Deliberately a `.svg`: the demo ships no real clip, so the card exercises the
    // "no thumbnail" path (kind badge still shows) instead of faking a video frame.
    url: "/demo/post-4.svg",
    width: 1080,
    height: 1920,
    created_at: "2026-09-04T05:10:00Z",
  },
];

/** Mirrors the fixture so a demo session starts clean every time it is entered. */
const DEMO_ASSETS_SEED: Asset[] = DEMO_ASSETS.map((asset) => ({ ...asset, tags: [...asset.tags] }));

let demoAssetId = 100;

function demoAssetFromFile(file: File, name: string, mime: string): Asset {
  demoAssetId += 1;
  const kind: Asset["kind"] = mime.startsWith("video/") ? "video" : "image";
  const isVideo = kind === "video";
  return {
    id: demoAssetId,
    kind,
    mime,
    source: "upload",
    source_url: "",
    description: isVideo
      ? `סרטון שהועלה מהמכשיר (${name}) — בדמו אין ניתוח וידאו, אבל באמת נכתוב כאן תיאור ותגיות מהתוכן.`
      : `תמונה שהועלתה מהמכשיר (${name}) — בדמו אין ניתוח אמיתי, אבל באמת נכתוב כאן תיאור לפי מה שרואים בתמונה.`,
    tags: isVideo ? ["וידאו", "הועלה"] : ["הועלה", "מהמכשיר"],
    // A blob URL so the thumbnail in the grid is really the file that was picked.
    url: typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(file) : "",
    width: 0,
    height: 0,
    created_at: new Date().toISOString(),
  };
}

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
    audience_id: 1,
    audience_name: "משפחות מיפו והשכונות הסמוכות",
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
    // The demo month is a real month part-way through: one post is already approved and
    // dated (so the publishing queue has something genuinely due), one is approved with no
    // date, and the rest are still waiting for the owner. A demo where every post sits in
    // the same state cannot show what the queue is for.
    approval_status: "approved",
    scheduled_for: "2026-09-09",
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
    audience_id: 1,
    audience_name: "משפחות מיפו והשכונות הסמוכות",
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
    // Approved, but the owner has not decided which day it goes out — the `unscheduled`
    // bucket the queue has to be able to show.
    approval_status: "approved",
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
    audience_id: 3,
    audience_name: "שולחי מתנות לעמיתים",
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
    audience_id: 2,
    audience_name: "מזמיני חג חד-פעמיים",
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

/**
 * Mirrors `attach_tracking` in `api/app/services/strategy.py`.
 *
 * Every post the product generates carries the UTM link the owner should publish with,
 * because the link is how a click is later tied back to the post that earned it. The link
 * is empty in exactly one case — the business has no website on file — and the publishing
 * panel says that out loud instead of showing a control with nothing behind it.
 */
function demoTrackingSlug(value: string) {
  return (
    (value || "")
      .replace(/[^\p{L}\p{N}_]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32)
      .toLowerCase() || "post"
  );
}

const DEMO_UTM_CAMPAIGN = `isramarket-${DEMO_STRATEGY.year}-${String(DEMO_STRATEGY.month).padStart(2, "0")}`;

POSTS.forEach((post, index) => {
  if (post.tracking_url) return;
  const utm = {
    utm_source: post.primary_outlet || "instagram",
    utm_medium: "organic",
    utm_campaign: DEMO_UTM_CAMPAIGN,
    utm_content: `p${index + 1}-${demoTrackingSlug(post.title)}`,
  };
  POSTS[index] = {
    ...post,
    utm,
    tracking_url: `${DEMO_BUSINESS.website_url}?${new URLSearchParams(utm).toString()}`,
  };
});
DEMO_STRATEGY.roadmap.posts = POSTS;

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
  // Measured per audience segment, in the shape `rollup()` returns.
  //
  // Both sources are connected here, but three of the seven planned posts have not been
  // matched to a report yet: that is why the third segment and the "לא משויך" bucket carry
  // `ga4: null, meta: null` instead of a zero. A row with no bucket is "not measured", and
  // the screen has to say so rather than claim the audience brought nobody.
  audiences: {
    available: true,
    connected: { ga4: true, meta: true },
    period_start: "2026-08-08",
    period_end: "2026-09-04",
    synced_at: "2026-09-04T07:10:00Z",
    sample_posts: 7,
    unassigned_posts: 1,
    method:
      "המדידה היא סכום של השיוך הקיים ברמת הפוסט — סשנים והמרות מ-GA4 ומעורבות ממטא — לפי הקהל שאליו הפוסט משויך בתוכנית.",
    explanation:
      "פוסט אחד בתוכנית עוד לא משויך לקהל, והוא נספר בנפרד ב׳לא משויך׳.",
    rows: [
      {
        audience_id: 1,
        name: "משפחות מיפו והשכונות הסמוכות",
        is_primary: true,
        posts: 3,
        measured_posts: 3,
        ga4: { sessions: 742, conversions: 31, engaged_sessions: 401 },
        meta: { likes: 486, comments: 38 },
      },
      {
        audience_id: 2,
        name: "מזמיני חג חד-פעמיים",
        is_primary: false,
        posts: 2,
        measured_posts: 2,
        ga4: { sessions: 318, conversions: 11, engaged_sessions: 168 },
        meta: { likes: 204, comments: 17 },
      },
      {
        audience_id: 3,
        name: "שולחי מתנות לעמיתים",
        is_primary: false,
        posts: 1,
        measured_posts: 0,
        ga4: null,
        meta: null,
      },
      {
        audience_id: null,
        name: "לא משויך",
        is_primary: false,
        posts: 1,
        measured_posts: 0,
        ga4: null,
        meta: null,
      },
    ],
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

export type SetupItem = {
  key: string;
  title: string;
  /** Why this step changes the plan, in the owner's words. */
  why: string;
  done: boolean;
  action_href: string;
  action_label: string;
};

/** The one step to do next. A subset of the item it points at, so the card cannot offer
 *  an action the grouped list does not also carry. */
export type SetupNext = {
  key: string;
  title: string;
  action_href: string;
  action_label: string;
};

export type SetupGroup = {
  key: "setup" | "running";
  title: string;
  items: SetupItem[];
};

export type SetupPayload = {
  completed: number;
  total: number;
  next: SetupNext | null;
  groups: SetupGroup[];
};

/**
 * The order `next` walks, copied from `NEXT_ORDER` in `api/app/routers/setup.py`.
 *
 * The backend ranks the next step by what the owner gets out of doing it now, so it is
 * not necessarily the first open item in the order the groups are read.
 */
const SETUP_NEXT_ORDER = [
  "scan",
  "diagnostics",
  "priorities",
  "quarter",
  "audiences",
  "media",
  "google",
  "instagram",
  "plan",
  "approve",
  "publish",
];

/** Mirrors the backend's `_rank`: a key it does not know ranks last, never first. */
function setupRank(key: string): number {
  const index = SETUP_NEXT_ORDER.indexOf(key);
  return index === -1 ? SETUP_NEXT_ORDER.length : index;
}

/** Mirrors the backend's `_filled`: a blank string or an empty container is not an answer,
 *  because the wizard stores untouched fields as `None`, `""` or `[]`. */
function filled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return Boolean(value);
}

/**
 * The demo's checklist, derived from the demo's own state the way the backend derives it
 * from real rows — so the card can never claim a step is missing while `/assets` or
 * `/decisions` is showing that same step done.
 *
 * Mirrors `api/app/routers/setup.py` throughout: the same keys, group keys and titles,
 * item titles, `why` lines, action hrefs, action labels and `next` ranking.
 *
 * The demo business happens to sit at five of the eleven — the site reading, the
 * diagnostics, the audience segments, the media library and the month's posts are in
 * place; the ranked targets, the quarter plan, both connections, approval and publishing
 * are not. That is what makes the card worth demoing: a real mix of done and open, a real
 * next step, and progress the owner can see rather than a list that is already finished.
 */
function demoSetup(): SetupPayload {
  const diagnostics = DEMO_BUSINESS.diagnostics;
  const posts = POSTS;
  const groups: SetupGroup[] = [
    {
      key: "setup",
      title: "הגדרה חד-פעמית",
      items: [
        {
          key: "scan",
          title: "קריאת האתר",
          why: "בלעדיה אין זהות מותג, צבעים ותמונות — והתוכן נוצר בלי החומרים שלכם.",
          done: filled(DEMO_BUSINESS.brand_language),
          action_href: "/decisions",
          action_label: "לסריקת האתר",
        },
        {
          key: "diagnostics",
          title: "אבחון העסק",
          why: "התשובות קובעות אילו יעדים ופוסטים מתאימים לעסק שלכם.",
          done: diagnostics ? Object.values(diagnostics).some(filled) : false,
          action_href: "/decisions",
          action_label: "למילוי האבחון",
        },
        {
          key: "priorities",
          title: "יעדי צמיחה",
          why: "היעדים שבחרתם הם מה שהתוכנית החודשית מכוונת אליו.",
          done: (DEMO_BUSINESS.growth_targets || []).length > 0,
          action_href: "/decisions",
          action_label: "לבחירת יעדים",
        },
        {
          key: "quarter",
          title: "תוכנית רבעונית",
          why: "התוכנית נותנת לחודש הקרוב הקשר של יעד גדול, לא רק רשימת פוסטים.",
          done: filled(DEMO_BUSINESS.long_horizon_plan),
          action_href: "/plan",
          action_label: "לבניית התוכנית",
        },
        {
          key: "audiences",
          title: "קהלי יעד",
          why: "כל פוסט ידע למי הוא מדבר, והתוצאות יוצגו לפי קהל.",
          done: DEMO_AUDIENCES.length > 0,
          action_href: "/decisions#audiences",
          action_label: "להגדרת קהלים",
        },
        {
          key: "media",
          title: "ספריית מדיה",
          why: "התמונות שלכם ישמשו בכל עיצוב, במקום תמונות מלאי גנריות.",
          done: DEMO_ASSETS.length > 0,
          action_href: "/assets",
          action_label: "להעלאת תמונות",
        },
        {
          key: "google",
          title: "חיבור Google Analytics",
          why: "רק כך רואים אילו פוסטים וערוצים באמת הביאו תנועה והמרות.",
          // The demo's integrations payload reports both providers as null.
          done: false,
          action_href: "/integrations",
          action_label: "לחיבור GA4",
        },
        {
          key: "instagram",
          title: "חיבור אינסטגרם",
          why: "מאפשר לפרסם ולמדוד את הפוסטים בלי להעתיק אותם ידנית.",
          done: false,
          action_href: "/integrations",
          action_label: "לחיבור אינסטגרם",
        },
      ],
    },
    {
      key: "running",
      title: "הרצה שוטפת",
      items: [
        {
          key: "plan",
          title: "תוכנית החודש",
          why: "התוכנית היא מה שהופך את האסטרטגיה לפוסטים מוכנים לעבודה.",
          done: posts.length > 0,
          action_href: "/strategy",
          action_label: "ליצירת התוכנית",
        },
        {
          key: "approve",
          title: "אישור הפוסטים",
          why: "רק פוסטים מאושרים נכנסים לפרסום ולמדידה.",
          // The same rule as `_all_approved`: no posts is not "all approved".
          done: posts.length > 0 && posts.every((post) => post.approval_status === "approved"),
          action_href: "/posts",
          action_label: "לאישור הפוסטים",
        },
        {
          key: "publish",
          title: "פרסום וסימון קישור",
          why: "סימון הקישור שפורסם הוא מה שמחבר בין הפוסט לתוצאות שלו.",
          done: posts.some((post) => filled(post.published_url)),
          action_href: "/posts",
          action_label: "לסימון פרסום",
        },
      ],
    },
  ];

  const items = groups.flatMap((group) => group.items);
  const firstOpen = [...items]
    .sort((a, b) => setupRank(a.key) - setupRank(b.key))
    .find((item) => !item.done);
  return {
    completed: items.filter((item) => item.done).length,
    total: items.length,
    next: firstOpen
      ? {
          key: firstOpen.key,
          title: firstOpen.title,
          action_href: firstOpen.action_href,
          action_label: firstOpen.action_label,
        }
      : null,
    groups,
  };
}

/**
 * What Google would cost this business, and what the free local surface looks like.
 *
 * Not hand-written: this is the output of the real services for the demo business —
 * `app/services/google_cost.py` and `app/services/keywords.py`, fed the same profile
 * `DEMO_BUSINESS` carries (long lists trimmed to a representative subset). Regenerate it
 * the same way rather than editing the numbers by hand, because a fixture that drifts
 * from the backend teaches the screen the wrong shape, and these figures are published
 * Israeli market ranges, not invention.
 *
 * The three facts the screen exists to keep straight are all visible here: the budget
 * (4,500 ₪) is *below* the published floor for the sector (5,000-8,000 ₪); the expected
 * conversions straddle the 30-a-month line Google needs to leave its learning phase; and
 * the click range is what the budget can buy, never how many people search.
 */
const DEMO_GOOGLE_PROMOTION: GooglePromotionPayload = {
  plan: {
    monthly_budget_ils: 4500,
    industry_key: "food",
    industry_label: "מזון ומשקאות",
    industry_tier: "low",
    matched_keywords: ["מאפייה", "קפה", "בית קפה"],
    sector_key: "local_services",
    sector_label: "שירותים מקומיים",
    cpc_range: [3.5, 5.5],
    expected_clicks: [818, 1285],
    conversion_rate_range: [0.03, 0.05],
    expected_conversions: [24, 64],
    cost_per_conversion: [70, 183],
    minimum_viable_budget: [5000, 8000],
    management_fee: {
      percent_range: [0.15, 0.2],
      percent_label: "15%-20% מתקציב המדיה",
      percent_amount_ils: [675, 900],
      flat_range_ils: [2000, 8000],
      note: "המקור מצטט ניהול בשתי צורות חלופיות — אחוז מתקציב המדיה או תשלום חודשי קבוע. שתי הצורות מוצגות כאן, ואנחנו לא בוחרים עבורכם.",
    },
    setup_fee: [1500, 4000],
    total_monthly_ils: [5175, 12500],
    first_month_total_ils: [6675, 16500],
    warnings: [
      "התקציב החודשי (4,500 ₪) נמוך מהמינימום שפורסם למגזר 'שירותים מקומיים' (5,000-8,000 ₪). מתחת למינימום הזה המקור מתאר מלכודת: אין מספיק דאטה → האלגוריתם של גוגל לא לומד → הביצועים גרועים → התקציב נשרף מהר → נשאר אפילו פחות דאטה. עדיף להמתין לתקציב הולם, או להשקיע את הסכום הזה בערוצים חלופיים (SEO, תוכן, רשתות חברתיות) שבהם הכסף לא תלוי בלמידה של אלגוריתם.",
      "טווח ההמרות הצפוי (24-64 בחודש) חוצה את סף 30 ההמרות שגוגל צריך כדי ללמוד: בתרחיש השמרני עדיין אין מספיק דאטה והקמפיין נשאר בשלב למידה. תכננו את החודש כאיסוף נתונים, לא כ-ROAS.",
    ],
    assumptions: [
      "CPC לתחום 'מזון ומשקאות': 3.5-5.5 ₪ לקליק (רצועת low של המקור)",
      "שיעור המרה (פנייה) במגזר 'שירותים מקומיים': 3.0%-5.0% — השיעור שפורסם למגזר הזה, לא מדידה של העסק",
      "גוגל צריך 30-50 המרות בחודש כדי ללמוד ולאפטם; מתחת לזה אין אופטימיזציה אמיתית",
      "ניהול: 15%-20% מתקציב המדיה או 2,000-8,000 ₪ בחודש; הקמה חד-פעמית 1,500-4,000 ₪",
      "התקציב שהוזן הוא תקציב מדיה בלבד; עלות הניהול וההקמה מפורטות בנפרד ולכן העלות החודשית האמיתית גבוהה ממנו",
      "אין לנו גישה ל-Keyword Planner ואין לנו נפחי חיפוש. מספר הקליקים הוא הגבול העליון של מה שהתקציב יכול לקנות — לא תחזית של כמה אנשים מחפשים",
    ],
    source: "https://www.rulers.co.il/blog/how-much-does-a-successful-google-ads-campaign-really-cost-in-israel/",
    source_title: "רולרס — כמה באמת עולה קמפיין Google Ads מוצלח בישראל?",
    conversion_unit: "פנייה (ליד)",
    channel_comparison: {
      google: {
        label: "Google Ads",
        intent: "כוונת רכישה גבוהה — אנשים מחפשים בדיוק את מה שאתם מציעים",
        downside: "CPC יקר יותר ממטא",
        timing: "תוצאות מיידיות",
      },
      meta: {
        label: "Facebook / Instagram",
        cpc_ils: [1.5, 8.0],
        intent: "כוונת רכישה נמוכה יותר — שיווק בהפרעה",
        upside: "CPC נמוך יותר ומיקוד מדויק לפי דמוגרפיה ותחומי עניין",
      },
      recommendation:
        "המקור ממליץ על מיקס: גוגל לכוונת קנייה גבוהה, מטא/אינסטגרם למודעות ולרימרקטינג. לא לשים את כל התקציב בערוץ אחד.",
    },
  },
  business_profile: {
    title: "פרופיל עסק בגוגל (Google Business Profile)",
    summary:
      "לפני שמשלמים לגוגל על קליקים, כדאי לסדר את המשטח החינמי: הפרופיל העסקי בגוגל. הוא מה שמופיע כשמחפשים את שם העסק, והוא מה שמאפשר לבקש ביקורות.",
    free: true,
    is_local: true,
    suggested_category_hint: "מזון ומשקאות",
    steps: [
      {
        id: "claim",
        title: "לתבוע את הפרופיל",
        priority: "critical",
        why: "בלי פרופיל מגובה, גוגל עלולה להציג על לחם תום מידע שאף אחד לא עדכן — או לא להציג אותו בכלל כשמחפשים אתכם.",
        how: [
          "חפשו את 'לחם תום' בגוגל מפות ובגוגל Search.",
          "אם הפרופיל קיים ולא שלכם — לחצו 'בעלים של העסק הזה?' והתחילו תהליך תביעה.",
          "אם אין פרופיל — פתחו אחד עם חשבון הגוגל של העסק (לא חשבון אישי של עובד).",
        ],
      },
      {
        id: "verify",
        title: "לאמת את הפרופיל",
        priority: "critical",
        why: "פרופיל לא מאומת לא מופיע כמו פרופיל מאומת, ולא ניתן לעדכן בו חלק מהשדות.",
        how: [
          "בחרו את שיטת האימות שגוגל מציעה (סרטון, טלפון או גלויה).",
          "אמתו מיד — האימות הוא מה שהופך את הפרופיל לנכס שלכם.",
          "רשמו למי בחשבון יש הרשאה, והוסיפו בעלים נוסף כדי לא לאבד גישה.",
        ],
      },
      {
        id: "categories",
        title: "קטגוריה ראשית וקטגוריות משנה",
        priority: "critical",
        why: "הקטגוריה הראשית היא מה שקובע לאילו חיפושים הפרופיל בכלל רלוונטי.",
        how: [
          "בחרו קטגוריה ראשית שמתאימה לתחום שזוהה: מזון ומשקאות.",
          "היכנסו לרשימת הקטגוריות של גוגל ובחרו את המדויק ביותר — לא את הרחב.",
          "הוסיפו 2-4 קטגוריות משנה של השירותים שאתם באמת נותנים.",
        ],
      },
      {
        id: "hours",
        title: "שעות פעילות",
        priority: "high",
        why: "שעות חסרות שולחות לקוחות לכתובת סגורה, ואלה בדיוק הלקוחות שכבר החליטו לבוא.",
        how: [
          "מלאו שעות לכל יום, כולל הפסקות.",
          "הוסיפו שעות מיוחדות לחגים ולמועדים ישראליים לפני שהם מגיעים.",
          "עדכנו שעות חריגות (חופשה, סגירה זמנית) באותו יום, לא אחריו.",
        ],
      },
      {
        id: "photos",
        title: "תמונות אמיתיות",
        priority: "high",
        why: "התמונות הן מה שהמחפש רואה לפני שהוא מחליט אם להתקשר. תמונות אמת של העסק עובדות טוב יותר מתמונות מלאי שלא קשורות אליו.",
        how: [
          "העלו תמונות של המקום מבחוץ ומבפנים, של הצוות ושל העבודה עצמה.",
          "השתמשו בתמונות שצילמתם — לא בתמונות מהאינטרנט.",
          "הוסיפו תמונות חדשות מדי חודש; פרופיל שלא מתעדכן נראה סגור.",
        ],
      },
      {
        id: "reviews",
        title: "ביקורות",
        priority: "critical",
        why: "הביקורות הן מה שרוב המחפשים קוראים לפני שהם יוצרים קשר. הן גם אות אמיתי לגוגל על העסק.",
        how: [
          "בקשו ביקורת מיד אחרי רגע טוב — סוף תיקון, סוף טיפול, מסירה.",
          "בקשו בפנים או בוואטסאפ עם קישור ישיר לטופס הביקורת של הפרופיל.",
          "אל תכתבו ביקורות בעצמכם ואל תקנו ביקורות — גוגל מסננת אותן, והנזק גדול מהתועלת.",
        ],
      },
    ],
    notes: [
      "הפרופיל העסקי בגוגל הוא משטח חינמי: אין עלות מדיה, אין מכרז, ואין תשלום לגוגל.",
      "אין לנו גישה לפרופיל שלכם, ואנחנו לא יודעים אם הוא קיים או מאומת. זו רשימת פעולות, לא דוח מצב.",
      "אם הפרופיל כבר קיים ומאומת — התחילו מהקטגוריה, השעות, התמונות והביקורות; אלה מה שמשפיע ישירות על מי שמגיע אליכם.",
    ],
  },
};

/**
 * The terms worth targeting, split by what we actually know about them.
 *
 * Only Search Console rows carry numbers, because those come from the site's own
 * performance in Google. Autocomplete rows carry none: Google does not publish search
 * volumes, and `sources.search_volumes` says so out loud. The fixture keeps all three
 * source values honest — plain autocomplete, plain Search Console, and the one phrase
 * found in both (`autocomplete+search_console`), which is the only autocomplete phrase
 * allowed to show numbers.
 */
const DEMO_KEYWORDS: KeywordsPayload = {
  keywords: [
    {
      term: "לחם תום יפו",
      intent: "branded",
      intent_label: "מיתוג (שם העסק)",
      source: "autocomplete+search_console",
      matched: ["לחם תום"],
      clicks: 41,
      impressions: 470,
      ctr: 0.0872,
      position: 2.1,
    },
    {
      term: "לחם תום שעות פתיחה",
      intent: "branded",
      intent_label: "מיתוג (שם העסק)",
      source: "autocomplete",
      matched: ["לחם תום"],
    },
    {
      term: "מאפייה שכונתית ביפו",
      intent: "general",
      intent_label: "כללי",
      source: "autocomplete",
      matched: [],
    },
    {
      term: "מאפייה הכי טובה",
      intent: "commercial",
      intent_label: "בחינה והשוואה",
      source: "autocomplete",
      matched: ["הכי טוב"],
    },
    {
      term: "איך מכינים מחמצת",
      intent: "informational",
      intent_label: "מידע",
      source: "autocomplete",
      matched: ["איך"],
    },
    { term: "מחמצת ביתית מתכון", intent: "general", intent_label: "כללי", source: "autocomplete", matched: [] },
    { term: "חלות לשישי", intent: "general", intent_label: "כללי", source: "autocomplete", matched: [] },
    {
      term: "חלות שישי משלוח",
      intent: "transactional",
      intent_label: "כוונת קנייה",
      source: "autocomplete",
      matched: ["משלוח"],
    },
    { term: "מארזי חג לשולחן", intent: "general", intent_label: "כללי", source: "autocomplete", matched: [] },
    {
      term: "מאפייה פתוחה בשבת יפו",
      intent: "local",
      intent_label: "מקומי",
      source: "search_console",
      matched: ["יפו"],
      clicks: 12,
      impressions: 240,
      ctr: 0.05,
      position: 14.2,
    },
    {
      term: "מחיר חלות",
      intent: "transactional",
      intent_label: "כוונת קנייה",
      source: "search_console",
      matched: ["מחיר"],
      clicks: 3,
      impressions: 118,
      ctr: 0.0254,
      position: 11.6,
    },
    {
      term: "מאפייה מומלצת",
      intent: "commercial",
      intent_label: "בחינה והשוואה",
      source: "search_console",
      matched: ["מומלצת"],
      clicks: 6,
      impressions: 143,
      ctr: 0.042,
      position: 12.8,
    },
    {
      term: "מארזי חג ראש השנה",
      intent: "general",
      intent_label: "כללי",
      source: "search_console",
      matched: [],
      clicks: 5,
      impressions: 63,
      ctr: 0.0794,
      position: 22.7,
    },
  ],
  quick_wins: [
    {
      query: "מאפייה פתוחה בשבת יפו",
      clicks: 12,
      impressions: 240,
      ctr: 0.05,
      position: 14.2,
      why: "מקום 14.2 עם 240 חשיפות — קרוב לעמוד הראשון. שיפור הכותרת, הדף או התוכן יכול להזיז אותו בלי לשלם על קליק.",
    },
    {
      query: "מאפייה מומלצת",
      clicks: 6,
      impressions: 143,
      ctr: 0.042,
      position: 12.8,
      why: "מקום 12.8 עם 143 חשיפות — קרוב לעמוד הראשון. שיפור הכותרת, הדף או התוכן יכול להזיז אותו בלי לשלם על קליק.",
    },
    {
      query: "מחיר חלות",
      clicks: 3,
      impressions: 118,
      ctr: 0.0254,
      position: 11.6,
      why: "מקום 11.6 עם 118 חשיפות — קרוב לעמוד הראשון. שיפור הכותרת, הדף או התוכן יכול להזיז אותו בלי לשלם על קליק.",
    },
  ],
  search_console_connected: true,
  seeds: [
    "לחם תום",
    "מאפייה שכונתית / בית קפה",
    "שוק הפשפשים, יפו (עולי ציון 12)",
    "לחמי מחמצת באפייה יומית",
    "חלות שישי",
    "מאפי בוקר ומארזי חג לשולחן",
  ],
  sources: {
    autocomplete: {
      available: true,
      endpoint: "https://suggestqueries.google.com/complete/search",
      note: "השלמות החיפוש של גוגל: ביטויים אמיתיים שאנשים מקלידים. אלה ביטויים, לא נפחים — אין כאן מספר חיפושים.",
    },
    search_console: {
      connected: true,
      site_url: "https://lechem-tom.example.co.il/",
      period: { start: "2026-08-16", end: "2026-09-12", days: 28 },
      note: "מחובר: אלה שאילתות אמיתיות שהאתר כבר מופיע בהן, עם קליקים, חשיפות ומיקום אמיתיים מגוגל.",
    },
    search_volumes: {
      available: false,
      note: "אין לנו גישה ל-Google Keyword Planner, ולכן אין במערכת נפח חיפוש חודשי. כל מספר כזה היה מומצא. מה שכן יש: ביטויים אמיתיים שאנשים מקלידים, ונתוני Search Console אם החשבון מחובר.",
    },
  },
  thresholds: { quick_win_position: [5.0, 20.0], quick_win_min_impressions: 50 },
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

/** Words too common to mean anything when matching a post against the library. */
const DEMO_SUGGEST_STOPWORDS = new Set([
  "של", "על", "עם", "את", "זה", "זו", "כל", "לא", "כן", "או", "גם", "כי", "מה", "מי",
  "יש", "אין", "כמו", "אחרי", "לפני", "אתם", "אנחנו", "הוא", "היא", "הם", "בלי", "יותר",
  "רק", "איך", "מתי", "אפשר", "צריך", "כדי", "עוד", "כאן", "היום", "the", "and",
]);

function demoKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^0-9a-z\u0590-\u05ff]+/)
    .filter((word) => word.length >= 3 && !DEMO_SUGGEST_STOPWORDS.has(word));
}

/**
 * Stands in for the model call behind `/strategy/posts/suggest-assets`.
 *
 * The real ranking is a model pass over the post's copy and the library's descriptions
 * and tags (see api/app/services/assets.py). This is a deterministic keyword overlap with
 * the same contract — ranked ids, a Hebrew reason each, and an empty list rather than a
 * forced match — so the picker's ranked and empty states can both be exercised offline.
 */
function demoAssetSuggestions(post: RoadmapPost): AssetSuggestion[] {
  const postWords = demoKeywords(
    [post.title, post.hook, post.caption, post.angle, post.overlay_text, post.calendar_tie, post.goal_fit]
      .filter(Boolean)
      .join(" ")
  );
  return DEMO_ASSETS.map((asset) => {
    const assetWords = Array.from(
      new Set([...demoKeywords(asset.description), ...asset.tags.flatMap((tag) => demoKeywords(tag))])
    );
    // Either direction counts: the library says "חלות" and the post says "החלות".
    const hits = assetWords.filter((word) =>
      postWords.some((candidate) => candidate.includes(word) || word.includes(candidate))
    );
    return { asset, hits };
  })
    .filter((entry) => entry.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length || a.asset.id - b.asset.id)
    .slice(0, 4)
    .map(({ asset, hits }) => ({
      asset_id: asset.id,
      reason:
        hits.length > 1
          ? `הנכס מכוון לאותם נושאים שהפוסט הזה מעלה: ${hits.slice(0, 3).join(", ")}.`
          : `הנכס מכוון לאותו נושא כמו הפוסט: ${hits[0]}.`,
    }));
}

// --- the publishing handoff, in demo --------------------------------------------------

/**
 * The capability note the demo shows, word for word the same as the real one.
 *
 * Copied verbatim from `APPROVAL_HE` / `MANUAL_HE` / `NO_META_HE` in
 * `api/app/services/publish.py` rather than paraphrased: the demo has no Meta connection
 * either, so the honest answer is identical, and a fixture that softened it would be the
 * one place the product told a different story than the API.
 */
const DEMO_PUBLISH_CAPABILITY: PublishCapability = {
  auto_publish: false,
  can_schedule: true,
  reasons: [
    "חשבון מטא (פייסבוק ואינסטגרם) לא מחובר, ולכן אין למערכת גישה לדפים שלכם.",
    "פרסום אוטומטי לאינסטגרם ולפייסבוק דורש אישור של מטא לאפליקציה הזאת. " +
      "מטא בודקת אפליקציות ומאשרת הרשאת פרסום רק בסוף הבדיקה שלה, וזה לא תלוי בנו ולא בהגדרה במערכת. " +
      "עד שהאישור הזה יתקבל, למערכת אין אפשרות טכנית לפרסם בשמכם לשום רשת.",
    "בינתיים מפרסמים ידנית: כל פוסט כאן מוכן עם כיתוב, תמונה וקישור עם מעקב, " +
      "ואפשר להעתיק אותו לאפליקציה של פייסבוק או אינסטגרם ולפרסם משם.",
  ],
  missing: ["instagram_content_publish", "pages_manage_posts"],
  connected: { meta: false, ga4: false },
};

/** The permission names in the owner's words — `SCOPE_LABELS_HE` in the API. */
export const PUBLISH_SCOPE_LABELS: Record<string, string> = {
  instagram_content_publish: "פרסום תוכן בחשבון האינסטגרם העסקי",
  pages_manage_posts: "פרסום בעמוד הפייסבוק",
};

/** Outlet keys in Hebrew — `OUTLET_LABELS_HE` in the API. */
export const PUBLISH_OUTLET_LABELS: Record<string, string> = {
  instagram: "אינסטגרם",
  facebook: "פייסבוק",
  whatsapp: "וואטסאפ",
  tiktok: "טיקטוק",
};

function demoPostBrief(index: number, post: RoadmapPost): PostBrief {
  return {
    index,
    title: post.title || "",
    format: post.format || "",
    primary_outlet: post.primary_outlet || "",
    outlets: [...(post.outlets || [])],
    date_hint: post.date_hint || "",
    scheduled_for: post.scheduled_for || "",
    approval_status: post.approval_status || "review",
    published_url: post.published_url || "",
    published_at: post.published_at || null,
    has_image: Boolean(post.image_url),
    tracking_url: post.tracking_url || "",
  };
}

/** `YYYY-MM-DD` to a real day, or null. A value nothing can read is not a date. */
function demoStoredDay(value: string | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const parsed = Date.parse(`${value.trim()}T00:00:00`);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Mirrors `split_queue` in `api/app/services/publish.py`, including the three rules that
 * matter: a published post appears nowhere else, an unapproved post is never due, and a
 * date that cannot be read is treated as no date at all.
 *
 * Computed from the live demo posts rather than frozen, so a post the owner schedules,
 * approves or marks as published in the demo moves between buckets exactly as it would
 * against the API.
 */
function demoSplitQueue(): Omit<PublishQueue, "year" | "month" | "month_name_he" | "capability"> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets: Record<string, PostBrief[]> = {
    due: [],
    upcoming: [],
    unscheduled: [],
    awaiting_approval: [],
    published: [],
  };
  const dated: Record<string, { day: number; brief: PostBrief }[]> = { due: [], upcoming: [] };

  POSTS.forEach((post, index) => {
    const brief = demoPostBrief(index, post);
    if (brief.published_url) {
      buckets.published.push(brief);
      return;
    }
    if (brief.approval_status !== "approved") {
      buckets.awaiting_approval.push(brief);
      return;
    }
    const day = demoStoredDay(post.scheduled_for);
    if (day === null) {
      buckets.unscheduled.push(brief);
      return;
    }
    dated[day <= today.getTime() ? "due" : "upcoming"].push({ day, brief });
  });

  for (const key of ["due", "upcoming"] as const) {
    buckets[key] = dated[key]
      .sort((a, b) => a.day - b.day || a.brief.index - b.brief.index)
      .map((entry) => entry.brief);
  }

  const counts = {
    due: buckets.due.length,
    upcoming: buckets.upcoming.length,
    unscheduled: buckets.unscheduled.length,
    awaiting_approval: buckets.awaiting_approval.length,
    published: buckets.published.length,
    total: POSTS.length,
  };
  return { ...buckets, counts } as Omit<
    PublishQueue,
    "year" | "month" | "month_name_he" | "capability"
  >;
}

function demoPublishQueue(): PublishQueue {
  return {
    year: DEMO_STRATEGY.year,
    month: DEMO_STRATEGY.month,
    month_name_he: DEMO_STRATEGY.month_name_he,
    ...demoSplitQueue(),
    capability: DEMO_PUBLISH_CAPABILITY,
  };
}

/** The brief's allocation labels — `ALLOCATION_LABELS` in the API. */
const DEMO_ALLOCATION_LABELS: [string, string][] = [
  ["meta_ads_share_pct", "פרסום ממומן במטא"],
  ["organic_production_share_pct", "הפקת תוכן אורגני"],
  ["local_promotion_share_pct", "קידום מקומי"],
];

function demoBriefMoney(value: number) {
  return `${value.toLocaleString("en-US")} ₪`;
}

function demoBriefPostsLabel(count: number) {
  return count === 1 ? "פוסט אחד" : `${count} פוסטים`;
}

function demoBriefCounts(pair: { min: number; max: number }) {
  return `${pair.min.toLocaleString("en-US")}-${pair.max.toLocaleString("en-US")}`;
}

/** Mirrors `render_brief`: built line by line, and every line conditional. */
function renderDemoBrief(data: Omit<PublishBrief, "text">): string {
  let heading = "בריף קמפיין";
  if (data.business_name) heading += ` — ${data.business_name}`;
  if (data.month_name_he && data.year) heading += ` — ${data.month_name_he} ${data.year}`;

  const lines: string[] = [heading];
  let hasFigures = false;
  const section = (title: string) => lines.push("", title);
  const sentence = (text: string) => lines.push(text);

  if (data.goal) {
    section("מטרת החודש");
    sentence(data.goal);
  }
  if (data.theme) {
    section("נושא החודש");
    sentence(data.theme);
  }

  if (data.budget?.monthly_budget_ils) {
    hasFigures = true;
    section("תקציב");
    let line = `תקציב חודשי: ${demoBriefMoney(data.budget.monthly_budget_ils)}`;
    if (data.budget.stage_label) line += ` (${data.budget.stage_label})`;
    sentence(line);
    if (data.allocation.length) {
      sentence("חלוקה מוצעת:");
      data.allocation.forEach((row) => {
        let rowLine = `- ${row.label}: ${row.share_pct}%`;
        if (row.amount_ils) rowLine += ` (${demoBriefMoney(row.amount_ils)})`;
        sentence(rowLine);
      });
    }
    if (data.allocation_guidance) sentence(`הנחיות: ${data.allocation_guidance}`);
  }

  if (data.cadence.posts_per_week || data.cadence.formats?.length) {
    hasFigures = true;
    section("קצב ופורמטים");
    if (data.cadence.posts_per_week) {
      sentence(`קצב פרסום: ${demoBriefPostsLabel(data.cadence.posts_per_week)} בשבוע`);
    }
    if (data.cadence.formats?.length) sentence(`פורמטים: ${data.cadence.formats.join(", ")}`);
  }

  if (data.channels.length) {
    hasFigures = true;
    section("תמהיל ערוצים בתוכנית");
    data.channels.forEach((row) => sentence(`- ${row.label}: ${demoBriefPostsLabel(row.posts)}`));
    if (data.channel_note) sentence(data.channel_note);
  }

  if (data.audiences.length) {
    hasFigures = true;
    section("קהלים");
    data.audiences.forEach((item) => {
      let line = `- ${item.name}`;
      if (item.is_primary) line += " (הקהל הראשי)";
      if (item.summary) line += `: ${item.summary}`;
      sentence(line);
      const targeting = item.targeting as Record<string, unknown>;
      const focus: string[] = [];
      if (targeting.geo) focus.push(`אזור: ${targeting.geo}`);
      if (targeting.age_range) focus.push(`גיל: ${targeting.age_range}`);
      if (targeting.gender) focus.push(`מגדר: ${targeting.gender}`);
      if (Array.isArray(targeting.interests) && targeting.interests.length) {
        focus.push(`תחומי עניין: ${(targeting.interests as string[]).join(", ")}`);
      }
      if (Array.isArray(targeting.keywords) && targeting.keywords.length) {
        focus.push(`נושאי חיפוש: ${(targeting.keywords as string[]).join(", ")}`);
      }
      if (focus.length) sentence(`  מיקוד: ${focus.join(" | ")}`);
      if (item.needs.length) sentence(`  מה הם מחפשים: ${item.needs.join(", ")}`);
      if (item.where.length) sentence(`  איפה הם נמצאים: ${item.where.join(", ")}`);
    });
  }

  if (data.priorities.length) {
    hasFigures = true;
    section("סדרי עדיפויות (מהחשוב לפחות)");
    data.priorities.forEach((item, index) => sentence(`${index + 1}. ${item}`));
  }

  const expectationLines: string[] = [];
  const expected = data.expectations;
  if (expected.expected_impressions) {
    expectationLines.push(`חשיפות בחודש: ${demoBriefCounts(expected.expected_impressions)}`);
  }
  if (expected.expected_clicks) {
    expectationLines.push(`קליקים בחודש: ${demoBriefCounts(expected.expected_clicks)}`);
  }
  if (expected.expected_purchases) {
    const unit = expected.conversion_unit === "רכישה" ? "רכישות" : "פניות";
    expectationLines.push(`${unit} בחודש: ${demoBriefCounts(expected.expected_purchases)}`);
  }
  if (expected.realistic_roas) {
    expectationLines.push(
      `ROAS ריאלי: ${expected.realistic_roas.min}-${expected.realistic_roas.max}`
    );
  }
  if (expectationLines.length) {
    hasFigures = true;
    section("מה אפשר לצפות (טווחים מהתוכנית, לא הבטחה)");
    expectationLines.forEach((line) => sentence(`- ${line}`));
  }

  const tracking = data.tracking;
  if (tracking.available && tracking.utm_campaign) {
    hasFigures = true;
    section("מעקב");
    sentence(tracking.note);
    if (tracking.utm_source.length) sentence(`utm_source: ${tracking.utm_source.join(", ")}`);
    sentence(`utm_medium: ${tracking.utm_medium}`);
    sentence(`utm_campaign: ${tracking.utm_campaign}`);
    if (tracking.utm_content_example) {
      sentence(`utm_content (דוגמה מהתוכנית): ${tracking.utm_content_example}`);
    }
    if (tracking.example_url) sentence(`קישור לדוגמה: ${tracking.example_url}`);
  }

  if (data.warnings.length) {
    section("מה חשוב לדעת");
    data.warnings.forEach((item) => sentence(`- ${item}`));
  }
  if (data.assumptions.length) {
    section("המספרים מבוססים על");
    data.assumptions.forEach((item) => sentence(`- ${item}`));
  }

  if (!hasFigures) {
    lines.push(
      "",
      "התוכנית השמורה לא כוללת עדיין תקציב, קהלים או יעדים, " +
        "ולכן אין כאן נתונים שאפשר להעביר למפרסם."
    );
  }
  return lines.join("\n");
}

/**
 * The demo brief, assembled from the demo's own state the way `campaign_brief` assembles
 * it from the stored plan — so a demo user who changes the budget sees the brief agree.
 */
function demoCampaignBrief(): PublishBrief {
  const usp = DEMO_STRATEGY.usp;
  const allocation = usp.budget_allocation;
  // Read as a plain string-keyed map: the demo plan may not carry an allocation at all,
  // and a share the plan does not have produces no line rather than a zero.
  const shares: Record<string, unknown> = allocation ? { ...allocation } : {};
  const budget = DEMO_BUSINESS.monthly_budget_ils;
  const allocationRows = DEMO_ALLOCATION_LABELS.flatMap(([key, label]) => {
    const share = Number(shares[key]) || 0;
    if (share <= 0) return [];
    return [
      { key, label, share_pct: share, amount_ils: budget ? Math.round((budget * share) / 100) : undefined },
    ];
  });

  const outletCounts = new Map<string, number>();
  POSTS.forEach((post) => {
    const outlet = post.primary_outlet || "";
    if (outlet) outletCounts.set(outlet, (outletCounts.get(outlet) || 0) + 1);
  });
  const channels = [...outletCounts.entries()]
    .map(([outlet, posts]) => ({
      outlet,
      label: PUBLISH_OUTLET_LABELS[outlet] || outlet,
      posts,
    }))
    .sort((a, b) => b.posts - a.posts || a.outlet.localeCompare(b.outlet));

  // Taken from the posts themselves, exactly as the API does it: a convention only real
  // posts already carry is worth printing.
  const utmSources: string[] = [];
  let exampleUrl = "";
  let exampleContent = "";
  POSTS.forEach((post) => {
    const source = post.utm?.utm_source || "";
    if (source && !utmSources.includes(source)) utmSources.push(source);
    if (!exampleUrl && post.tracking_url) exampleUrl = post.tracking_url;
    if (!exampleContent && post.utm?.utm_content) exampleContent = post.utm.utm_content;
  });

  const formats: string[] = [];
  POSTS.forEach((post) => {
    if (post.format && !formats.includes(post.format)) formats.push(post.format);
  });

  const payload: Omit<PublishBrief, "text"> = {
    year: DEMO_STRATEGY.year,
    month: DEMO_STRATEGY.month,
    month_name_he: DEMO_STRATEGY.month_name_he,
    business_name: DEMO_BUSINESS.name,
    goal: DEMO_STRATEGY.monthly_horizon_plan?.hypothesis || usp.growth_hypothesis || "",
    theme: DEMO_STRATEGY.roadmap.theme || "",
    // The demo plan stores no stage, so no stage line is printed — the same rule the API
    // follows for a figure the plan does not carry.
    budget: budget ? { monthly_budget_ils: budget, stage: "", stage_label: "" } : null,
    allocation: allocationRows,
    allocation_guidance: allocation?.guidance || "",
    cadence: {
      ...(DEMO_STRATEGY.posting_plan?.weekly_posts
        ? { posts_per_week: DEMO_STRATEGY.posting_plan.weekly_posts }
        : {}),
      ...(formats.length ? { formats } : {}),
    },
    channels,
    audiences: DEMO_AUDIENCES.map((audience) => ({
      name: audience.name,
      summary: audience.summary,
      is_primary: audience.is_primary,
      needs: [...audience.needs],
      where: [...audience.where],
      targeting: { ...audience.targeting },
    })),
    priorities: [...(usp.growth_targets || [])].slice(0, 3),
    expectations: {},
    tracking: {
      available: Boolean(utmSources.length || exampleUrl || exampleContent),
      website: DEMO_BUSINESS.website_url,
      utm_source: utmSources,
      utm_medium: "organic",
      utm_campaign: DEMO_UTM_CAMPAIGN,
      utm_content_example: exampleContent,
      example_url: exampleUrl,
      note: "כל פוסט מפורסם עם הקישור שלו, כדי שאפשר יהיה לשייך לחיצות ופניות לפוסט שהביא אותן.",
    },
    warnings: [],
    assumptions: [],
    channel_note: DEMO_STRATEGY.posting_plan?.mix_note || "",
  };
  return { ...payload, text: renderDemoBrief(payload) };
}

/**
 * Resolves a request against the in-memory demo fixtures.
 *
 * Async because a few demo routes (the site scan, re-describing an asset) have to feel
 * like the real work they stand in for — an instantly-resolved list would hide every
 * loading state the screens are supposed to prove. Callers already await `api()`.
 */
async function demoResolve<T>(path: string, options: RequestInit = {}): Promise<T> {  const method = (options.method || "GET").toUpperCase();
  if (path === "/auth/me") return DEMO_USER as T;
  if (path === "/auth/logout" && method === "POST") {
    exitDemo();
    return { ok: true } as T;
  }
  if (path === "/onboarding/me") return { business: DEMO_BUSINESS } as T;
  if (path === "/onboarding/profile" && method === "POST") {
    const body = JSON.parse(String(options.body || "{}")) as OnboardingPayload;
    if (body.growth_targets) DEMO_BUSINESS.growth_targets = body.growth_targets;
    if (body.diagnostics) DEMO_BUSINESS.diagnostics = body.diagnostics;
    if (body.long_horizon_plan) DEMO_BUSINESS.long_horizon_plan = body.long_horizon_plan;
    if (typeof body.monthly_budget_ils === "number") {
      DEMO_BUSINESS.monthly_budget_ils = body.monthly_budget_ils;
    }
    return { business: DEMO_BUSINESS } as T;
  }
  if (path === "/onboarding/palette" && method === "POST") {
    // The brand picker now exposes palette editing in demo mode too. This path used to
    // be live-only, so a demo user editing a swatch silently dropped out of demo and
    // got a 401 — the edit looked like a failure for no visible reason.
    const body = JSON.parse(String(options.body || "{}")) as { palette?: BrandLanguage["palette"] };
    if (body.palette) {
      DEMO_BRAND.palette = body.palette;
      DEMO_BUSINESS.brand_language = DEMO_BRAND;
    }
    return { business: DEMO_BUSINESS } as T;
  }
  if (path === "/onboarding/targets" && method === "POST") {
    return { targets: DEMO_TARGET_CANDIDATES.map((item) => ({ ...item })) } as T;
  }
  if (path === "/onboarding/plan" && method === "POST") {
    const ranked = DEMO_BUSINESS.growth_targets || [];
    const base = DEMO_STRATEGY.long_horizon_plan;
    if (!base) throw new ApiError("תוכנית רבעונית חסרה בדמו.", 500);
    // Echo the owner's ranking back so step 4 demonstrably changes the quarter plan.
    return {
      long_horizon_plan: {
        ...base,
        targets: ranked.length ? ranked : [...base.targets],
        milestones: base.milestones.map((m) => ({ ...m })),
      },
    } as T;
  }
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
  if (path === "/strategy/posts/images" && method === "POST") {
    // The Posts screen calls this on mount for every post still missing an image. It
    // had no demo route, so demo mode showed "no demo route" and 0 of 7 posts.
    POSTS.forEach((post, index) => {
      if (!post.image_url) {
        POSTS[index] = { ...post, image_url: DEMO_IMAGES[index] || DEMO_IMAGES[0] };
      }
    });
    DEMO_STRATEGY.roadmap.posts = POSTS;
    return { strategy: cloneDemoStrategy(), errors: [] } as T;
  }
  if (path === "/strategy/posts/image" && method === "POST") {
    const body = JSON.parse(String(options.body || "{}")) as { post_index?: number };
    const index = body.post_index ?? 0;
    if (!POSTS[index]) throw new ApiError("הפוסט לא נמצא", 404);
    const generated: RoadmapPost = {
      ...POSTS[index],
      image_url: DEMO_IMAGES[index] || DEMO_IMAGES[0],
      // Same as the real route: a regenerated image is no longer the owner's own library
      // file, so the asset it replaced must not stay attached to the post.
      image_source: "generated",
      image_source_url: "",
      image_action: "generated",
    };
    delete generated.image_asset_id;
    POSTS[index] = generated;
    DEMO_STRATEGY.roadmap.posts = POSTS;
    return { post: { ...POSTS[index] }, strategy: cloneDemoStrategy() } as T;
  }
  if (path === "/strategy/posts/asset" && method === "POST") {
    const body = JSON.parse(String(options.body || "{}")) as { post_index?: number; asset_id?: number };
    const index = body.post_index ?? 0;
    if (!POSTS[index]) throw new ApiError("הפוסט לא נמצא", 404);
    const asset = DEMO_ASSETS.find((item) => item.id === body.asset_id);
    if (!asset) throw new ApiError("הנכס לא נמצא", 404);
    POSTS[index] = {
      ...POSTS[index],
      image_url: asset.url,
      image_source: "asset",
      image_asset_id: asset.id,
      image_source_url: asset.source_url || "",
      image_action: "asset",
    };
    DEMO_STRATEGY.roadmap.posts = POSTS;
    return { post: { ...POSTS[index] }, strategy: cloneDemoStrategy() } as T;
  }
  if (path === "/strategy/posts/audience" && method === "POST") {
    const body = JSON.parse(String(options.body || "{}")) as {
      post_index?: number;
      audience_id?: number | null;
    };
    const index = body.post_index ?? 0;
    if (!POSTS[index]) throw new ApiError("הפוסט לא נמצא", 404);
    const audienceId = body.audience_id ?? null;
    const audience = audienceId === null ? null : DEMO_AUDIENCES.find((item) => item.id === audienceId);
    if (audienceId !== null && !audience) throw new ApiError("הקהל לא נמצא", 404);
    const updated: RoadmapPost = { ...POSTS[index] };
    if (audience) {
      updated.audience_id = audience.id;
      updated.audience_name = audience.name;
    } else {
      // Clearing is a real answer ("עוד לא הוחלט"), so the fields are removed rather
      // than left pointing at a segment this post no longer serves.
      delete updated.audience_id;
      delete updated.audience_name;
    }
    POSTS[index] = updated;
    DEMO_STRATEGY.roadmap.posts = POSTS;
    return { post: { ...POSTS[index] }, strategy: cloneDemoStrategy() } as T;
  }
  if (path === "/strategy/posts/suggest-assets" && method === "POST") {
    const body = JSON.parse(String(options.body || "{}")) as { post_index?: number };
    const index = body.post_index ?? 0;
    if (!POSTS[index]) throw new ApiError("הפוסט לא נמצא", 404);
    // An empty library answers instantly in the real route too — no model call is made.
    if (!DEMO_ASSETS.length) return { suggestions: [] } as T;
    // Slower on purpose: this stands in for a real model call, so the picker has to prove
    // its busy state rather than flashing an answer that took no work.
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    return { suggestions: demoAssetSuggestions(POSTS[index]) } as T;
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
  if (path === "/audiences" && method === "GET") {
    return {
      audiences: DEMO_AUDIENCES.map((audience) => ({
        ...audience,
        needs: [...audience.needs],
        where: [...audience.where],
        targeting: { ...audience.targeting },
      })),
    } as T;
  }
  if (path === "/audiences/generate" && method === "POST") {
    // A real model call behind the button, so the demo waits like one. The busy state it
    // proves is the whole reason the copy says this takes a few seconds.
    await new Promise((resolve) => window.setTimeout(resolve, 2600));
    // Regeneration replaces what the generator wrote before and never a segment the owner
    // wrote by hand — the same promise the screen makes in its own words.
    const manual = DEMO_AUDIENCES.filter((audience) => audience.source === "manual");
    const replaced = DEMO_AUDIENCES.length - manual.length;
    const generated = demoGeneratedAudiences();
    const manualLeads = manual.some((audience) => audience.is_primary);
    // Posts keep a real segment: a post whose segment is being replaced is re-pointed by
    // name, and one the new set does not carry falls back to the lead segment rather than
    // being left with a name nothing points at.
    const byName = new Map(generated.map((audience) => [audience.name, audience]));
    const fallback = generated[0];
    POSTS.forEach((post, index) => {
      if (post.audience_id === undefined || post.audience_id === null) return;
      const match = byName.get(post.audience_name || "");
      if (match) {
        POSTS[index] = { ...post, audience_id: match.id, audience_name: match.name };
      } else if (fallback) {
        POSTS[index] = { ...post, audience_id: fallback.id, audience_name: fallback.name };
      }
    });
    DEMO_STRATEGY.roadmap.posts = POSTS;
    DEMO_AUDIENCES = [
      ...manual,
      ...generated.map((audience, index) => ({
        ...audience,
        // The lead of the generated set is the plan's lead only while no manual segment
        // holds that flag. Exactly one segment stays primary either way.
        is_primary: !manualLeads && index === 0,
        priority: index === 0 ? ("primary" as const) : ("secondary" as const),
      })),
    ];
    return {
      audiences: DEMO_AUDIENCES.map((audience) => ({ ...audience })),
      generated: generated.length,
      replaced,
      kept_manual: manual.length,
      detached_posts: 0,
      note: !manual.length
        ? `נוצרו ${generated.length} קהלי יעד — יצירה חוזרת לא יוצרת כפילויות.`
        : manual.length === 1
          ? `נוצרו ${generated.length} קהלי יעד, והקהל היחיד שהוגדר ידנית נשמר ללא שינוי.`
          : `נוצרו ${generated.length} קהלי יעד, ו-${manual.length} קהלים שהוגדרו ידנית נשמרו ללא שינוי.`,
    } as T;
  }
  if (path === "/audiences" && method === "POST") {
    const body = JSON.parse(String(options.body || "{}")) as AudiencePayload;
    const name = (body.name || "").trim();
    if (!name) throw new ApiError("צריך שם לקהל.", 400);
    demoAudienceId += 1;
    // The first segment a business defines is its primary one — the plan needs a fallback
    // for a post whose audience the model could not name (routers/audiences.py does the
    // same). After that, a manual segment never steals the slot: that is an explicit choice.
    const first = DEMO_AUDIENCES.length === 0;
    const created: Audience = {
      id: demoAudienceId,
      name,
      summary: (body.summary || "").trim(),
      description: (body.description || "").trim(),
      needs: (body.needs || []).map((item) => item.trim()).filter(Boolean),
      where: (body.where || []).map((item) => item.trim()).filter(Boolean),
      targeting: body.targeting || {},
      priority: first ? "primary" : "secondary",
      source: "manual",
      is_primary: first,
      created_at: new Date().toISOString(),
    };
    DEMO_AUDIENCES = [...DEMO_AUDIENCES, created];
    return { audience: { ...created } } as T;
  }
  if (path.startsWith("/audiences/") && path.endsWith("/primary") && method === "POST") {
    const id = Number(path.slice("/audiences/".length, -"/primary".length));
    const target = DEMO_AUDIENCES.find((audience) => audience.id === id);
    if (!target) throw new ApiError("הקהל לא נמצא", 404);
    DEMO_AUDIENCES = DEMO_AUDIENCES.map((audience) => ({
      ...audience,
      is_primary: audience.id === id,
      priority: audience.id === id ? "primary" : "secondary",
    }));
    return { audiences: DEMO_AUDIENCES.map((audience) => ({ ...audience })) } as T;
  }
  if (path.startsWith("/audiences/") && method === "PATCH") {
    const id = Number(path.slice("/audiences/".length));
    const current = DEMO_AUDIENCES.find((audience) => audience.id === id);
    if (!current) throw new ApiError("הקהל לא נמצא", 404);
    const body = JSON.parse(String(options.body || "{}")) as AudiencePayload;
    const updated: Audience = {
      ...current,
      name: body.name !== undefined ? body.name.trim() || current.name : current.name,
      summary: body.summary !== undefined ? body.summary.trim() : current.summary,
      description: body.description !== undefined ? body.description.trim() : current.description,
      needs: body.needs !== undefined ? body.needs.map((item) => item.trim()).filter(Boolean) : current.needs,
      where: body.where !== undefined ? body.where.map((item) => item.trim()).filter(Boolean) : current.where,
      targeting: body.targeting !== undefined ? body.targeting : current.targeting,
    };
    DEMO_AUDIENCES = DEMO_AUDIENCES.map((audience) => (audience.id === id ? updated : audience));
    // A rename must not leave posts showing a name that no longer exists anywhere — the
    // real route re-points them, so the demo does too.
    if (updated.name !== current.name) {
      POSTS.forEach((post, index) => {
        if (post.audience_id === id) {
          POSTS[index] = { ...post, audience_id: id, audience_name: updated.name };
        }
      });
      DEMO_STRATEGY.roadmap.posts = POSTS;
    }
    return { audience: { ...updated } } as T;
  }
  if (path.startsWith("/audiences/") && method === "DELETE") {
    const id = Number(path.slice("/audiences/".length));
    const target = DEMO_AUDIENCES.find((audience) => audience.id === id);
    if (!target) throw new ApiError("הקהל לא נמצא", 404);
    const detached = POSTS.filter((post) => post.audience_id === id).length;
    DEMO_AUDIENCES = DEMO_AUDIENCES.filter((audience) => audience.id !== id);
    // The posts that pointed at it are cleared, never left dangling — and the role moves
    // to the next segment so the plan always has a fallback.
    POSTS.forEach((post, index) => {
      if (post.audience_id === id) {
        POSTS[index] = { ...post };
        delete POSTS[index].audience_id;
        delete POSTS[index].audience_name;
      }
    });
    DEMO_STRATEGY.roadmap.posts = POSTS;
    let promoted: Audience | null = null;
    if (target.is_primary && DEMO_AUDIENCES.length) {
      promoted = { ...DEMO_AUDIENCES[0], is_primary: true, priority: "primary" };
      DEMO_AUDIENCES = DEMO_AUDIENCES.map((audience, index) => ({
        ...audience,
        is_primary: index === 0,
        priority: index === 0 ? ("primary" as const) : ("secondary" as const),
      }));
    }
    return {
      ok: true,
      detached_posts: detached,
      promoted_audience: promoted,
      message: promoted
        ? `הקהל '${target.name}' נמחק. '${promoted.name}' הוגדר כקהל הראשי.`
        : `הקהל '${target.name}' נמחק.`,
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
  if (path === "/assets" && method === "GET") {
    return { assets: DEMO_ASSETS.map((asset) => ({ ...asset, tags: [...asset.tags] })) } as T;
  }
  if (path === "/assets/upload" && method === "POST") {
    // The real endpoint takes multipart `file`; demo gets the same request object and
    // reads the File straight out of the FormData.
    const file = options.body instanceof FormData ? options.body.get("file") : null;
    if (!(file instanceof File)) throw new ApiError("לא נבחר קובץ להעלאה.", 400);
    const name = file.name || "asset";
    const asset = demoAssetFromFile(file, name, file.type || "image/jpeg");
    DEMO_ASSETS = [asset, ...DEMO_ASSETS];
    return { asset } as T;
  }
  if (path === "/assets/import-url" && method === "POST") {
    const body = JSON.parse(String(options.body || "{}")) as { url?: string };
    const url = (body.url || "").trim();
    if (!url) throw new ApiError("צריך קישור כדי לייבא תמונה.", 400);
    const host = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return "הקישור";
      }
    })();
    const added: Asset[] = [0, 1].map((offset) => ({
      id: (demoAssetId += 1),
      kind: "image",
      mime: "image/jpeg",
      source: "url",
      source_url: url,
      description: `תמונה שיובאה מ-${host} — בדמו אין הורדה אמיתית, אבל באמת נשמור אותה בספרייה ונתאר מה רואים.`,
      tags: ["מיובא", host.split(".")[0] || "קישור"],
      url: DEMO_IMAGES[(offset + 2) % DEMO_IMAGES.length],
      width: 1080,
      height: 1080,
      created_at: new Date().toISOString(),
    }));
    DEMO_ASSETS = [...added, ...DEMO_ASSETS];
    return { assets: added, skipped: 2 } as T;
  }
  if (path === "/assets/scan-site" && method === "POST") {
    // Slower on purpose: the real scan crawls their site, and the screen has to prove
    // its busy state is real rather than instant.
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    const found: Asset[] = [
      {
        id: (demoAssetId += 1),
        kind: "image",
        mime: "image/jpeg",
        source: "site",
        source_url: "https://lechem-tom.example.co.il/",
        description: "תמונת המאפייה מדף הבית, עם החלות על השיש והשלט מעל הדלפק.",
        tags: ["דף הבית", "מאפייה", "אתר"],
        url: DEMO_IMAGES[0],
        width: 1200,
        height: 800,
        created_at: new Date().toISOString(),
      },
      {
        id: (demoAssetId += 1),
        kind: "image",
        mime: "image/png",
        source: "site",
        source_url: "https://lechem-tom.example.co.il/gallery",
        description: "תמונה מגלריית האתר: שולחן עץ עם לחמים ופוקצ׳ה אחרי האפייה.",
        tags: ["גלריה", "לחמים", "אתר"],
        url: DEMO_IMAGES[5],
        width: 1400,
        height: 1050,
        created_at: new Date().toISOString(),
      },
    ];
    DEMO_ASSETS = [...found, ...DEMO_ASSETS];
    return { assets: found, skipped: 6 } as T;
  }
  if (path.startsWith("/assets/") && method === "PATCH") {
    const id = Number(path.slice("/assets/".length));
    const current = DEMO_ASSETS.find((asset) => asset.id === id);
    if (!current) throw new ApiError("הנכס לא נמצא", 404);
    const body = JSON.parse(String(options.body || "{}")) as AssetPatch;
    const updated: Asset = {
      ...current,
      description: body.description !== undefined ? body.description : current.description,
      tags: body.tags !== undefined ? [...body.tags] : current.tags,
    };
    DEMO_ASSETS = DEMO_ASSETS.map((asset) => (asset.id === id ? updated : asset));
    return { asset: { ...updated, tags: [...updated.tags] } } as T;
  }
  if (path.startsWith("/assets/") && method === "DELETE") {
    const id = Number(path.slice("/assets/".length));
    if (!DEMO_ASSETS.some((asset) => asset.id === id)) throw new ApiError("הנכס לא נמצא", 404);
    DEMO_ASSETS = DEMO_ASSETS.filter((asset) => asset.id !== id);
    return { ok: true } as T;
  }
  if (path.endsWith("/describe") && path.startsWith("/assets/") && method === "POST") {
    const id = Number(path.slice("/assets/".length, -"/describe".length));
    const current = DEMO_ASSETS.find((asset) => asset.id === id);
    if (!current) throw new ApiError("הנכס לא נמצא", 404);
    // Deterministic per id, so re-running on the same asset visibly changes something
    // without pretending a second AI pass happened.
    const pass = (current.tags.filter((tag) => tag.startsWith("ניתוח ")).length || 0) + 1;
    const updated: Asset = {
      ...current,
      description: `${current.description} (ניתוח ${pass}: הודגשו הטקסטורה, התאורה וההקשר העונתי.)`,
      tags: [...current.tags.filter((tag) => !tag.startsWith("ניתוח ")), `ניתוח ${pass}`],
    };
    DEMO_ASSETS = DEMO_ASSETS.map((asset) => (asset.id === id ? updated : asset));
    return { asset: { ...updated, tags: [...updated.tags] } } as T;
  }
  // Computed per call from the live demo state, not a frozen fixture: a demo user who
  // approves a post or deletes an audience should see the checklist agree with it.
  if (path === "/setup") return demoSetup() as T;
  // Same reason: scheduling, approving or publishing a post moves it between the queue's
  // buckets, so the queue is derived from the demo posts on every read.
  if (path === "/publish/queue") return demoPublishQueue() as T;
  if (path === "/publish/capability") return { ...DEMO_PUBLISH_CAPABILITY } as T;
  if (path === "/publish/brief") return demoCampaignBrief() as T;
  if (path === "/strategy/posts/publish" && method === "POST") {
    // This route had no demo branch at all, so marking a post as published failed in the
    // demo with "no demo path for /strategy/posts/publish" — a dead end the owner only
    // meets after they have already posted by hand. Same contract as the API: the URL is
    // written as given and the post moves into the queue's published bucket.
    const body = JSON.parse(String(options.body || "{}")) as {
      post_index?: number;
      published_url?: string;
    };
    const index = body.post_index ?? 0;
    if (!POSTS[index]) throw new ApiError("הפוסט לא נמצא בתוכנית", 404);
    const url = (body.published_url || "").trim();
    if (!url) throw new ApiError("צריך קישור לפוסט שפורסם.", 422);
    POSTS[index] = { ...POSTS[index], published_url: url, published_at: new Date().toISOString() };
    DEMO_STRATEGY.roadmap.posts = POSTS;
    return { post: { ...POSTS[index] }, strategy: cloneDemoStrategy() } as T;
  }
  if (path === "/strategy/posts/schedule" && method === "POST") {
    const body = JSON.parse(String(options.body || "{}")) as {
      post_index?: number;
      scheduled_for?: string;
    };
    const index = body.post_index ?? 0;
    if (!POSTS[index]) throw new ApiError("הפוסט לא נמצא בתוכנית", 404);
    const raw = (body.scheduled_for || "").trim();
    // The same strict reader the API uses, with the same Hebrew sentence: a date nothing
    // can order never reaches the roadmap, in the demo no more than in production.
    if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      throw new ApiError("תאריך לא תקין. הזינו תאריך בפורמט YYYY-MM-DD, למשל 2026-03-15.", 400);
    }
    if (raw && Number.isNaN(Date.parse(`${raw}T00:00:00`))) {
      throw new ApiError("תאריך לא תקין. הזינו תאריך בפורמט YYYY-MM-DD, למשל 2026-03-15.", 400);
    }
    POSTS[index] = {
      ...POSTS[index],
      scheduled_for: raw,
      scheduled_at: raw ? new Date().toISOString() : null,
    };
    DEMO_STRATEGY.roadmap.posts = POSTS;
    return { post: { ...POSTS[index] }, strategy: cloneDemoStrategy() } as T;
  }
  // The promotion payloads are deep enough that a hand-written clone would be a
  // liability; they are plain JSON, so a round-trip is simpler and total. Cloning keeps
  // a screen that mutates what it renders from poisoning the demo for the next visit.
  if (path === "/promotion/google") return JSON.parse(JSON.stringify(DEMO_GOOGLE_PROMOTION)) as T;
  if (path === "/promotion/keywords") return JSON.parse(JSON.stringify(DEMO_KEYWORDS)) as T;
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
  // A FormData body must keep the browser-generated multipart boundary, so the only
  // safe Content-Type is the one fetch sets itself. Everything else stays JSON.
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body && !isFormData && !headers.has("Content-Type")) {
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
  targets: () => api<{ targets: GrowthTargetCandidate[] }>("/onboarding/targets", { method: "POST" }),
  longHorizonPlan: () =>
    api<{ long_horizon_plan: LongHorizonPlan }>("/onboarding/plan", { method: "POST" }),
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
  /** Point a post's image at one of the owner's own library assets. */
  attachPostAsset: (post_index: number, asset_id: number) =>
    api<{ post: RoadmapPost; strategy: StrategyPayload }>("/strategy/posts/asset", {
      method: "POST",
      body: JSON.stringify({ post_index, asset_id }),
    }),
  /** Which library assets fit this post, ranked with a Hebrew reason each. A real model
   *  call — several seconds, and an empty list when the library is empty. */
  suggestPostAssets: (post_index: number) =>
    api<{ suggestions: AssetSuggestion[] }>("/strategy/posts/suggest-assets", {
      method: "POST",
      body: JSON.stringify({ post_index }),
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
  /** What the owner has not set up yet, grouped, plus the single next step to take. */
  setup: () => api<SetupPayload>("/setup"),
  /** What Google would cost this business, plus the free Business Profile checklist. */
  googlePromotion: () => api<GooglePromotionPayload>("/promotion/google"),
  /** Terms worth targeting. Only Search Console rows carry real numbers. */
  keywords: () => api<KeywordsPayload>("/promotion/keywords"),
  assets: () => api<{ assets: Asset[] }>("/assets"),
  /** Multipart: the File goes in as `file` and `api()` leaves Content-Type to fetch. */
  uploadAsset: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return api<{ asset: Asset }>("/assets/upload", { method: "POST", body });
  },
  importAssetsFromUrl: (url: string) =>
    api<{ assets: Asset[]; skipped: number }>("/assets/import-url", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  scanSiteForAssets: () =>
    api<{ assets: Asset[]; skipped: number }>("/assets/scan-site", { method: "POST" }),
  updateAsset: (id: number, patch: AssetPatch) =>
    api<{ asset: Asset }>(`/assets/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteAsset: (id: number) => api<{ ok: true }>(`/assets/${id}`, { method: "DELETE" }),
  describeAsset: (id: number) => api<{ asset: Asset }>(`/assets/${id}/describe`, { method: "POST" }),
  /** The business's audience segments. Exactly one of them is primary. */
  audiences: () => api<{ audiences: Audience[] }>("/audiences"),
  /** A real model call that takes several seconds — explicit click only, never on render.
   *  Regeneration replaces the generated set and never a segment the owner wrote by hand,
   *  which is why the route answers with counts and its own note. */
  generateAudiences: () =>
    api<{
      audiences: Audience[];
      generated?: number;
      replaced?: number;
      kept_manual?: number;
      detached_posts?: number;
      note?: string;
    }>("/audiences/generate", { method: "POST" }),
  createAudience: (body: AudiencePayload) =>
    api<{ audience: Audience }>("/audiences", { method: "POST", body: JSON.stringify(body) }),
  updateAudience: (id: number, patch: Partial<AudiencePayload>) =>
    api<{ audience: Audience; message?: string }>(`/audiences/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  /** Deleting clears the tag from every post that pointed at the segment and, when it was
   *  the primary one, promotes the next segment — the response reports both. */
  deleteAudience: (id: number) =>
    api<{
      ok: true;
      detached_posts?: number;
      promoted_audience?: Audience | null;
      message?: string;
    }>(`/audiences/${id}`, { method: "DELETE" }),
  /** Moves the primary marker; the server keeps exactly one. */
  setPrimaryAudience: (id: number) =>
    api<{ audiences: Audience[] }>(`/audiences/${id}/primary`, { method: "POST" }),
  /** Point a post at the segment it serves. `null` clears it. */
  setPostAudience: (post_index: number, audience_id: number | null) =>
    api<{ post: RoadmapPost; strategy: StrategyPayload }>("/strategy/posts/audience", {
      method: "POST",
      body: JSON.stringify({ post_index, audience_id }),
    }),
  /** Set (or clear) the day a post goes out. `""` clears it. */
  schedulePost: (post_index: number, scheduled_for: string) =>
    api<{ post: RoadmapPost; strategy: StrategyPayload }>("/strategy/posts/schedule", {
      method: "POST",
      body: JSON.stringify({ post_index, scheduled_for }),
    }),
  /** The month's posts grouped by what the owner has to do about them. */
  publishQueue: () => api<PublishQueue>("/publish/queue"),
  /** What this product can and cannot do for this business today. */
  publishCapability: () => api<PublishCapability>("/publish/capability"),
  /** The month's plan as one copyable Hebrew brief. */
  publishBrief: () => api<PublishBrief>("/publish/brief"),
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
  business_model?: BusinessModel;
  social_links?: Record<string, string>;
  monthly_budget_ils: number;
  competitors: Competitor[];
  primary_goal: PrimaryGoal | "";
  onboarding_complete: boolean;
  scraped_profile: unknown;
  brand_language?: BrandLanguage | null;
  growth_targets?: string[];
  diagnostics?: Diagnostics | null;
  long_horizon_plan?: LongHorizonPlan | null;
  generate_state?: { stage?: string; error?: string };
};

export type OnboardingPayload = {
  name: string;
  website_url: string;
  business_type: string;
  offerings: string;
  location?: string;
  presence_type?: "brick_and_mortar" | "online_only" | "hybrid";
  business_model?: BusinessModel;
  social_links?: Record<string, string>;
  monthly_budget_ils: number;
  competitors: Competitor[];
  primary_goal: PrimaryGoal;
  growth_hypothesis?: string;
  growth_targets?: string[];
  diagnostics?: Diagnostics;
  long_horizon_plan?: LongHorizonPlan;
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
  /** What the last image request actually did, so the UI never reports success for
   *  work that was skipped: "generated" | "real_photo" | "asset" | "kept_existing" |
   *  "no_photo_theme" | "pending". */
  image_action?: "generated" | "real_photo" | "asset" | "kept_existing" | "no_photo_theme" | "pending";
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
  /** Where the card's image came from: their own photo, a generated one, a file from
   *  their asset library, or none ("none" = a typographic card, which carries no
   *  photograph by design). */
  image_source?: "real_photo" | "generated" | "asset" | "none" | "pending";
  image_source_url?: string;
  /** Which library asset the current image came from, when `image_source` is "asset". */
  image_asset_id?: number;
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
  /** The day the owner set for this post, `YYYY-MM-DD`, or "" when it has no date yet.
   *  It is what the publishing queue sorts on, so the panel binds its date input to it. */
  scheduled_for?: string;
  /** When the date was set — not when the post goes out. */
  scheduled_at?: string | null;
  published_url?: string;
  published_at?: string | null;
  approval_status?: "review" | "approved";
  approved_at?: string | null;
  /** Which audience segment this post serves, and its name for display. Both are absent
   *  until the owner (or the plan) decides — an unassigned post is a normal state. */
  audience_id?: number;
  audience_name?: string;
};

/**
 * One post as the publishing queue shows it. Mirrors `post_brief` in
 * `api/app/services/publish.py`: identity, timing, approval and what already exists.
 * Deliberately not the copy — the queue is a list of what to do, not an editor.
 */
export type PostBrief = {
  index: number;
  title: string;
  format: string;
  primary_outlet: string;
  outlets: string[];
  date_hint: string;
  /** `YYYY-MM-DD`, or "" when the post has no date yet. */
  scheduled_for: string;
  approval_status: string;
  published_url: string;
  published_at: string | null;
  has_image: boolean;
  tracking_url: string;
};

/**
 * What this product is actually permitted to do, read from the permissions Meta granted
 * on the stored connection — never from the list we wish we had.
 *
 * `auto_publish` is false for every business today: posting to an Instagram business
 * account or a Facebook Page needs `instagram_content_publish` and `pages_manage_posts`,
 * and Meta only grants those after it reviews the app. No flag, environment variable or
 * setting turns this on — which is why the publishing panel hands over a kit instead of
 * showing a publish button.
 */
export type PublishCapability = {
  auto_publish: boolean;
  can_schedule: boolean;
  /** Plain-Hebrew sentences, shown to the owner verbatim. */
  reasons: string[];
  /** The permission names still missing, for whoever handles the Meta side. */
  missing: string[];
  connected: { meta: boolean; ga4: boolean };
};

/** The month's posts, grouped by what the owner has to do about them. */
export type PublishQueue = {
  year: number;
  month: number;
  month_name_he: string;
  due: PostBrief[];
  upcoming: PostBrief[];
  unscheduled: PostBrief[];
  awaiting_approval: PostBrief[];
  published: PostBrief[];
  counts: {
    due: number;
    upcoming: number;
    unscheduled: number;
    awaiting_approval: number;
    published: number;
    total: number;
  };
  capability: PublishCapability;
};

export type PublishBriefAllocation = {
  key: string;
  label: string;
  share_pct: number;
  amount_ils?: number;
};

export type PublishBriefChannel = { outlet: string; label: string; posts: number };

export type PublishBriefAudience = {
  name: string;
  summary: string;
  is_primary: boolean;
  needs: string[];
  where: string[];
  targeting: Record<string, unknown>;
};

export type PublishBriefTracking = {
  available: boolean;
  website: string;
  utm_source: string[];
  utm_medium: string;
  utm_campaign: string;
  utm_content_example: string;
  example_url: string;
  note: string;
};

/**
 * The month's plan assembled into something a person can act on. Mirrors `campaign_brief`
 * in `api/app/services/publish.py`.
 *
 * Every figure comes from the stored plan; a figure the plan does not carry is an empty
 * field rather than a guess, and `text` is built line by line with the same rule — so a
 * section the plan has nothing for produces no line at all.
 */
export type PublishBrief = {
  year: number;
  month: number;
  month_name_he: string;
  business_name: string;
  goal: string;
  theme: string;
  budget: { monthly_budget_ils: number; stage: string; stage_label: string } | null;
  allocation: PublishBriefAllocation[];
  allocation_guidance: string;
  cadence: { posts_per_week?: number; formats?: string[] };
  channels: PublishBriefChannel[];
  audiences: PublishBriefAudience[];
  priorities: string[];
  expectations: {
    expected_impressions?: { min: number; max: number };
    expected_clicks?: { min: number; max: number };
    expected_purchases?: { min: number; max: number };
    realistic_roas?: { min: number; max: number };
    conversion_unit?: string;
  };
  tracking: PublishBriefTracking;
  warnings: string[];
  assumptions: string[];
  channel_note: string;
  /** The whole brief as one plain-Hebrew block, ready to copy. */
  text: string;
};

export type GrowthHypothesis = {
  id: string;
  title: string;
  hypothesis: string;
  why_this: string;
};

export type GrowthTargetCandidate = {
  id: string;
  category: string;
  target: string;
  why_this: string;
  /** 1–3 for the agent's three recommended priorities, 0 for everything else. */
  recommended_rank?: number;
};

/** Forks diagnostics, goals and the whole plan engine — see lib/businessModel.ts. */
export type BusinessModel = "products" | "services" | "both";

/** `sales`/`brand_awareness` are purchase goals; `leads`/`personal_brand` are service
 *  goals. The API rejects a goal that does not match the business model. */
export type PrimaryGoal = "sales" | "brand_awareness" | "leads" | "personal_brand";

/** Priorities from the onboarding diagnostics step, split by business model.
 *  `has_customer_club` is a prioritisation signal only — no loyalty/CRM integration
 *  exists or is implied. */
export type Diagnostics = {
  // products / both
  has_customer_club?: "yes" | "no" | "unsure" | null;
  repeat_vs_new?: "mostly_repeat" | "mostly_new" | "balanced" | null;
  priority_channel?: "online" | "physical" | "balanced" | null;
  // services / both
  lead_source?: "referrals" | "social" | "search" | "mixed" | "none" | null;
  has_portfolio?: "yes" | "partial" | "no" | null;
  brand_owner?: "personal" | "studio" | "unsure" | null;
  // shared
  capacity_constraint?: string;
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
  /**
   * Results broken down by audience segment.
   *
   * Modelled on `rollup()` in `api/app/services/audiences.py`, which builds this section.
   * Every number is a sum of the per-post attribution the sync already produced: GA4 and
   * Meta report no per-audience rate, so the screen must not compute one either.
   */
  audiences?: AudiencePerformance | null;
};

/** The metric buckets a row can carry. A bucket is absent (`null`) when nothing was
 *  measured for it — which is a different fact from a measured zero. */
export type AudienceMetricSums = {
  sessions?: number;
  conversions?: number;
  engaged_sessions?: number;
  likes?: number;
  comments?: number;
  impressions?: number;
  reach?: number;
  saves?: number;
  shares?: number;
};

export type AudiencePerformanceRow = {
  /** `null` is the "לא משויך" bucket, not a missing row. */
  audience_id: number | null;
  name: string;
  is_primary?: boolean;
  /** The sample size: how many planned posts this row covers. Always present. */
  posts: number;
  /** How many of those posts actually had a result to sum — often fewer than `posts`. */
  measured_posts?: number;
  ga4?: AudienceMetricSums | null;
  meta?: AudienceMetricSums | null;
};

export type AudiencePerformance = {
  /** False when no post had any attribution matched — usually "not connected / not synced". */
  available?: boolean;
  /** Per source: one of the two can be connected while the other is not. */
  connected?: { ga4?: boolean; meta?: boolean };
  period_start?: string;
  period_end?: string;
  synced_at?: string;
  sample_posts?: number;
  unassigned_posts?: number;
  /** The backend's own account of how these numbers were produced. */
  method?: string;
  /** The backend's Hebrew explanation of what is missing. Rendered as-is. */
  explanation?: string;
  rows: AudiencePerformanceRow[];
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

/**
 * Promotion (קידום) — what Google would cost, and what is free.
 *
 * Modelled on `api/app/routers/promotion.py`. Every money figure arrives as a range:
 * the backend refuses to collapse a campaign that has never run into one confident
 * number, and the screen must not collapse it either.
 */
export type PromotionRange = [number, number];

export type PromotionManagementFee = {
  percent_range: PromotionRange;
  /** Ready-made Hebrew label, e.g. "15%-20% מתקציב המדיה". */
  percent_label: string;
  /** The percentage applied to this business's budget. */
  percent_amount_ils: PromotionRange;
  /** The alternative flat monthly fee — note the `_ils`, this is not `flat_range`. */
  flat_range_ils: PromotionRange;
  note: string;
};

/** `null` on any range means the published source does not have that figure. */
export type GooglePromotionPlan = {
  monthly_budget_ils: number;
  industry_key: string;
  /** The matched Hebrew industry bucket, e.g. "מזון ומשקאות". */
  industry_label: string;
  industry_tier: string;
  /** The words in the business profile that matched the industry — why this bucket. */
  matched_keywords: string[];
  sector_key: string | null;
  /** The sector whose published conversion rate was used. */
  sector_label: string | null;
  cpc_range: PromotionRange | null;
  expected_clicks: PromotionRange | null;
  /** Fractions, e.g. 0.03 — rendered as percentages. */
  conversion_rate_range: PromotionRange | null;
  expected_conversions: PromotionRange | null;
  cost_per_conversion: PromotionRange | null;
  minimum_viable_budget: PromotionRange | null;
  management_fee: PromotionManagementFee;
  setup_fee: PromotionRange | null;
  /** Media + management for one month. */
  total_monthly_ils: PromotionRange | null;
  /** The first month, setup included. */
  first_month_total_ils: PromotionRange | null;
  warnings: string[];
  assumptions: string[];
  /** Where the market ranges came from. */
  source: string;
  source_title: string;
  /** What a "conversion" means for this business, e.g. "פנייה (ליד)". */
  conversion_unit: string;
  channel_comparison: PromotionChannelComparison;
};

export type PromotionChannelComparison = {
  google?: { label?: string; intent?: string; downside?: string; timing?: string };
  meta?: { label?: string; cpc_ils?: PromotionRange; intent?: string; upside?: string };
  recommendation?: string;
};

export type BusinessProfileStep = {
  id: string;
  title: string;
  /** "critical" | "high" | "medium" — how much it moves the needle. */
  priority: string;
  /** Why this matters for a local business. */
  why: string;
  /** The concrete actions, one per line. */
  how: string[];
};

export type GoogleBusinessProfile = {
  title: string;
  summary: string;
  free: boolean;
  is_local: boolean;
  /** The industry the profile's main category should match. */
  suggested_category_hint: string;
  steps: BusinessProfileStep[];
  notes: string[];
};

export type GooglePromotionPayload = {
  plan: GooglePromotionPlan;
  business_profile: GoogleBusinessProfile;
};

export type KeywordIntent =
  | "branded"
  | "local"
  | "transactional"
  | "commercial"
  | "informational"
  | "general";

/**
 * Where the term came from — and therefore whether any numbers exist for it.
 * `autocomplete+search_console` means the same phrase was found in both, and it is the
 * only case where an autocomplete phrase also carries real Search Console numbers.
 */
export type KeywordSource = "autocomplete" | "search_console" | "autocomplete+search_console";

export type PromotionKeyword = {
  term: string;
  intent: KeywordIntent;
  /** The backend's Hebrew label for the intent. */
  intent_label?: string;
  source: KeywordSource;
  /** The words that triggered the intent classification. */
  matched?: string[];
  /** Search Console rows only. Autocomplete rows never carry these. */
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

/** A query that already ranks just off page one — with the backend's own explanation. */
export type PromotionQuickWin = {
  query: string;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
  why?: string;
};

/**
 * What actually contributed, each with the backend's own Hebrew note. `search_volumes`
 * is always `available: false` — Google does not publish them and nothing here guesses.
 */
export type PromotionKeywordSources = {
  autocomplete: { available: boolean; endpoint: string; note: string };
  search_console: {
    connected: boolean;
    site_url: string;
    period: { start?: string; end?: string; days?: number };
    note: string;
  };
  search_volumes: { available: boolean; note: string };
};

export type KeywordsPayload = {
  keywords: PromotionKeyword[];
  quick_wins: PromotionQuickWin[];
  search_console_connected: boolean;
  /** The phrases we asked Google about, built from the business profile. */
  seeds: string[];
  sources: PromotionKeywordSources;
  thresholds: { quick_win_position: PromotionRange; quick_win_min_impressions: number };
  cached?: boolean;
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
