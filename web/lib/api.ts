import type { OnboardingDraft } from "./draft";
import { DNA_LIBRARY, type BrandDna, type BrandDnaEdit, type DnaLibrary, type PostDesign, type PostPrice } from "./dna/library";
import { DEMO_DNA, DEMO_DNA_ALTERNATIVES, DEMO_PHOTO_AREAS, adjustDna } from "./dna/samples";
import type { StoredQuarterPlan } from "./quarterPlan";
import { deriveLifecycle } from "./postLifecycle";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/backend";
const DEMO_FLAG = "isramarket_demo";

function formatDetail(detail: unknown, fallback: string) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        // pydantic prefixes custom messages with "Value error, " — the owner should only
        // see the Hebrew sentence after it.
        if (item && typeof item === "object" && "msg" in item)
          return String((item as { msg: string }).msg).replace(/^Value error,\s*/, "");
        return JSON.stringify(item);
      })
      .join(" · ");
  }
  return fallback;
}

export class ApiError extends Error {
  status: number;
  /** A machine-readable reason when the server sends one (e.g. `plan_required` on a 402). */
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** No connection: the request never reached the server, so every screen says the same thing. */
export const NETWORK_ERROR_HE = "אין חיבור כרגע. נסו שוב.";

/** The server's `{code, detail_he}` error body, at the top level or inside FastAPI's `detail`. */
function errorCode(data: unknown): { code?: string; message?: string } {
  if (!data || typeof data !== "object") return {};
  const top = data as { code?: unknown; detail_he?: unknown; detail?: unknown };
  const inner = top.detail && typeof top.detail === "object" && !Array.isArray(top.detail) ? (top.detail as { code?: unknown; detail_he?: unknown }) : null;
  const code = typeof top.code === "string" ? top.code : typeof inner?.code === "string" ? inner.code : undefined;
  const message = typeof top.detail_he === "string" ? top.detail_he : typeof inner?.detail_he === "string" ? inner.detail_he : undefined;
  return { code, message };
}

/** A 402: this action needs a paid plan (`plan_required`), or the trial's access ended. */
export function isPlanRequired(err: unknown): err is ApiError {
  return err instanceof ApiError && (err.status === 402 || err.code === "plan_required");
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

const DEMO_USER: AuthUser = {
  id: 1,
  email: "demo@isramarket.local",
  full_name: "נועה כהן",
  has_password: true,
  google_linked: false,
};

/** GET /auth/me. `has_password` is false for an account opened with Google only. */
export type AuthUser = {
  id: number;
  email: string;
  full_name: string;
  has_password: boolean;
  google_linked: boolean;
};

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
  /** The logo found on the business's site (absolute URL on their host), when any. */
  logo_url?: string;
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
  messaging: ["אפייה יומית", "חלה לשישי", "מאפייה של השכונה ביפו"],
  offers_seen: ["מחמצת", "חלות שישי", "מארזי חג"],
  audience: "תושבי יפו ונווה צדק שמזמינים לשישי ולחג",
  logo_description: "אותיות כהות פשוטות, בלי אייקון מאפה מבריק",
};

export const DEMO_BUSINESS: Business = {
  id: 1,
  name: "לחם תום",
  website_url: "https://lechem-tom.example.co.il",
  business_type: "food",
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
  brand_dna: DEMO_DNA,
  diagnostics: {
    has_customer_club: "no",
    repeat_vs_new: "mostly_repeat",
    priority_channel: "physical",
    capacity_constraint: "תנור אחד, אפייה לילה אחת",
  },
  growth_targets: [],
  // What the owner said at /start. Editable in /decisions ("מה סיפרתם לנו").
  owner_context: {
    differentiator: "מחמצת שמתפיחים 36 שעות, ואופים כל לילה מחדש",
    seasons: { busy: [9, 10, 12], slow: [7, 8] },
    activity: { instagram: "sometimes", facebook: "none" },
    tried: { channels: ["social_posts", "word_of_mouth"], what_worked: "חלה בהזמנה מראש לשישי, דרך וואטסאפ" },
    competitors: [
      { name: "לחמים", kind: "website", link: "https://lehamim.co.il" },
      { name: "בייקרי מרקט", kind: "website", link: "https://bakery-market.example.co.il" },
      { name: "מאפיית בר-קמח", kind: "website", link: "https://bar-kemach.example.co.il" },
    ],
  },
};

/** Candidates offered for ranking in onboarding step 5. Deliberately spread across
 *  categories so the ranking actually changes the plan. The three ranked candidates are
 *  the agent's recommendation, surfaced by the "let the agent decide" control. */
const DEMO_TARGET_CANDIDATES: GrowthTargetCandidate[] = [
  {
    id: "t1",
    category: "נאמנות",
    target: "להקים מועדון לקוחות של 300 חברים עד סוף נובמבר",
    why_this: "אין היום מועדון לקוחות, ולחם קונים שוב ושוב. הכי זול לחזור למי שכבר קנה",
    recommended_rank: 1,
  },
  {
    id: "t2",
    category: "מכירות",
    target: "למכור 25% יותר חלות בשישי עד סוף נובמבר",
    why_this: "החלות כבר נמכרות, וכל הביקוש מגיע ביום אחד. אפשר למכור בו יותר",
    recommended_rank: 0,
  },
  {
    id: "t3",
    category: "תפעול",
    target: "להוריד את המאפים שנזרקים בסוף היום מ-12% ל-5%",
    why_this: "כל מאפה שנזרק הוא רווח שהולך לפח, ולחסוך אותו לא דורש אף לקוח חדש",
    recommended_rank: 0,
  },
  {
    id: "t4",
    category: "קהל",
    target: "להביא 120 לקוחות חדשים מהשכונה כל חודש",
    why_this: "בשוק עוברים אנשים כל היום, והרבה מהם עוד לא נכנסו",
    recommended_rank: 2,
  },
  {
    id: "t5",
    category: "רשתות חברתיות",
    target: "להגיע ל-1,000 עוקבים מהאזור באינסטגרם",
    why_this: "החשבון כבר פעיל, אבל קטן לעומת כמות האנשים שנכנסים לחנות",
    recommended_rank: 0,
  },
  {
    id: "t6",
    category: "מכירות",
    target: "להשיק מארזי חג בהזמנה מוקדמת ולהגיע ל-150 הזמנות",
    why_this: "בחגי תשרי הכי עמוס. הזמנות מראש מפזרות את העבודה על כמה ימים",
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
    summary: "קונים לשולחן של שישי ולחגים, וחוזרים כל שבוע.",
    description:
      "תושבי יפו, נווה צדק ופלורנטין, בעיקר זוגות עם ילדים בגיל בית ספר. קונים פעם-פעמיים בשבוע, מכירים בשם את מי שעומד מאחורי הדלפק, ומתכננים את השישי מראש. הם שמים לב למחיר של מארז שלם, פחות למחיר של לחם אחד.",
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
    summary: "מזמינים מארז לחג או לאירוח, אבל לא קונים אצלכם באופן קבוע.",
    description:
      "מגיעים מהמלצה או מחיפוש בגוגל לקראת ראש השנה וסוכות, וקונים מארז גדול פעם-פעמיים בשנה. הם רוצים להזמין מראש לפני שהכול נגמר, ולדעת בדיוק מתי לאסוף.",
    needs: ["לדעת שההזמנה שמורה להם", "מארז שמתאים לשולחן החג", "להזמין מראש בוואטסאפ"],
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
      "עובדי משרדים בתל אביב שמחפשים מתנה קטנה ומכובדת ללקוח או לעמית. חשוב להם שהמארז יגיע בתאריך מדויק, ושתהיה חשבונית.",
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
      summary: "קונים מחמצת ולחם יומי, ובבוקר נכנסים גם לקפה ומאפה.",
      description:
        "תושבי הסביבה שעובדים מהבית וחוזרים ברגל מהשוק. קונים לחם פעמיים-שלוש בשבוע, ומגיבים לפוסטים על האפייה עצמה, לא למבצעים.",
      needs: ["לחם מחמצת טרי כל יום", "מאפה בוקר וקפה", "לדעת מה נגמר ומה נשאר"],
      where: ["ברחוב, בדרך מהשוק", "אינסטגרם", "הסטורי של המאפייה"],
      targeting: { interests: ["לחם מחמצת"], keywords: [], age_range: "25-45", gender: "", geo: "יפו, רדיוס 1.5 ק״מ" },
      priority: "primary",
      source: "generated",
      is_primary: true,
    },
    {
      name: "הורים שקונים לדרך לבית הספר",
      summary: "קונים כריכים ומאפים בבוקר, בקנייה מהירה וקבועה.",
      description:
        "הורים בדרך לבתי הספר בסביבה, בין 07:00 ל-08:15. הם צריכים לקנות מהר ולדעת שיש מאפה, לא מבחר גדול.",
      needs: ["מאפה טרי בשעה מוקדמת", "קנייה מהר בלי תור", "משהו שהילד יאכל"],
      where: ["פייסבוק", "קבוצת ההורים של בית הספר", "הכניסה לחנות"],
      targeting: { interests: [], keywords: ["כריך לבית ספר"], age_range: "30-45", gender: "", geo: "" },
      priority: "secondary",
      source: "generated",
      is_primary: false,
    },
    {
      name: "מי שמחפש מארז מתנה לחג",
      summary: "קונים מארז אחד מושקע, בדרך כלל כמתנה ולא לעצמם.",
      description:
        "לקראת החגים מחפשים משהו מכובד להביא לארוחה או לשלוח. האריזה ומועד המשלוח חשובים להם יותר מהמחיר.",
      needs: ["אריזה שנראית כמו מתנה", "משלוח עד תאריך מסוים", "מחיר ידוע מראש"],
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
  "/demo/post-1.webp",
  "/demo/post-2.webp",
  "/demo/post-3.webp",
  "/demo/post-4.webp",
  "/demo/post-5.webp",
  "/demo/post-6.webp",
  "/demo/post-7.webp",
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
    mime: "image/webp",
    source: "upload",
    source_url: "",
    description: "חלות קלועות על שולחן מקומח, רגע אחרי שיצאו מהתנור, באור של בוקר.",
    tags: ["חלות", "מחמצת", "תנור", "שישי"],
    url: "/demo/post-1.webp",
    width: 1080,
    height: 1350,
    created_at: "2026-09-01T06:20:00Z",
  },
  {
    id: 2,
    kind: "image",
    mime: "image/webp",
    source: "site",
    source_url: "https://lechem-tom.example.co.il/gallery",
    description: "משמרת הלילה: התנור פתוח והכיכרות נכנסות על מרדה עץ.",
    tags: ["תנור", "משמרת לילה", "מאחורי הקלעים"],
    url: "/demo/post-7.webp",
    width: 1080,
    height: 1350,
    created_at: "2026-09-02T09:05:00Z",
  },
  {
    id: 3,
    kind: "image",
    mime: "image/webp",
    source: "url",
    source_url: "https://instagram.com/p/CxYzLechemTom",
    description: "מארז ראש השנה: חלה עגולה, ריבת תאנים ומאפה מלוח על נייר קראפט.",
    tags: ["ראש השנה", "מארז", "מתנה", "חג"],
    url: "/demo/post-2.webp",
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
    description: "סרטון קצר של לישת הבצק ב-05:00 בבוקר, בלי קול.",
    tags: ["מאחורי הקלעים", "בצק", "סרטון"],
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
      ? `סרטון מהמכשיר (${name}). בדמו אנחנו לא צופים בסרטון. בחשבון אמיתי נכתוב כאן תיאור ותגיות לפי מה שרואים בו.`
      : `תמונה מהמכשיר (${name}). בדמו אנחנו לא בודקים את התמונה. בחשבון אמיתי נכתוב כאן תיאור לפי מה שרואים בה.`,
    tags: isVideo ? ["סרטון", "הועלה"] : ["הועלה", "מהמכשיר"],
    // A blob URL so the thumbnail in the grid is really the file that was picked.
    url: typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(file) : "",
    width: 0,
    height: 0,
    created_at: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ *
 * Instagram signal (demo). A small Jaffa bakery with ~3,000 followers: *
 * its own four best posts with the numbers Meta returns for a business *
 * account (views, reach, saves, shares), and two other accounts the    *
 * owner follows, for which Meta shows only public likes and comments.  *
 * Shapes mirror `own_post_dict` / `_compact_source` / `serialize_brief` *
 * in api/app/services/instagram_signal.py.                             *
 * ------------------------------------------------------------------ */

/** Set to "off" to see the demo as an owner who has not connected Instagram yet. */
export const DEMO_INSTAGRAM_FLAG = "isramarket_demo_instagram";

function demoInstagramConnected(): boolean {
  try {
    return typeof window === "undefined" || window.localStorage.getItem(DEMO_INSTAGRAM_FLAG) !== "off";
  } catch {
    return true;
  }
}

function demoSource(source: Omit<InspirationSource, "hashtag" | "caption_length"> & { caption_length?: number }): InspirationSource {
  return { hashtag: "", caption_length: 0, ...source };
}

const DEMO_IG_OWN: InstagramOwnPost[] = [
  {
    ...demoSource({
      ref: "O1",
      kind: "own",
      handle: "",
      format: "reel",
      format_he: "רילס",
      hook: "ככה נראית חלה עגולה ב-05:30",
      permalink: "https://www.instagram.com/reel/C9aLtTm05/",
      posted_at: "2026-08-12T03:10:00+0000",
      when_he: "יום רביעי 06:00",
      caption_length: 142,
      metrics: { views: 1240, reach: 860, saved: 38, shares: 21, likes: 96, comments: 14 },
    }),
    media_id: "demo-o1",
    caption: "ככה נראית חלה עגולה ב-05:30\nשלוש קליעות, ביצה, שומשום, ותנור שכבר חם מ-4.",
    thumbnail_url: DEMO_IMAGES[0],
    media_url: "",
    score: 0.0686,
    score_basis_he: "שמירות ושיתופים, ביחס למספר האנשים שראו את הפוסט",
  },
  {
    ...demoSource({
      ref: "O2",
      kind: "own",
      handle: "",
      format: "carousel",
      format_he: "קרוסלה",
      hook: "3 לחמים שמחזיקים שבוע (ואחד שלא)",
      permalink: "https://www.instagram.com/p/C9kPtTm21/",
      posted_at: "2026-08-21T05:40:00+0000",
      when_he: "יום שישי 08:00",
      caption_length: 318,
      metrics: { views: 980, reach: 640, saved: 29, shares: 5, likes: 71, comments: 9 },
    }),
    media_id: "demo-o2",
    caption: "3 לחמים שמחזיקים שבוע (ואחד שלא)\nדפדפו: מחמצת כפרית, שיפון, כוסמין — והבגט, שכדאי לאכול היום.",
    thumbnail_url: DEMO_IMAGES[1],
    media_url: "",
    score: 0.0531,
    score_basis_he: "שמירות ושיתופים, ביחס למספר האנשים שראו את הפוסט",
  },
  {
    ...demoSource({
      ref: "O3",
      kind: "own",
      handle: "",
      format: "reel",
      format_he: "רילס",
      hook: "מה קורה לבצק שנשכח במקרר לילה שלם",
      permalink: "https://www.instagram.com/reel/C9vBtTm02/",
      posted_at: "2026-09-02T04:20:00+0000",
      when_he: "יום רביעי 07:00",
      caption_length: 96,
      metrics: { views: 890, reach: 620, saved: 11, shares: 5, likes: 64, comments: 7 },
    }),
    media_id: "demo-o3",
    caption: "מה קורה לבצק שנשכח במקרר לילה שלם\nספוילר: הלחם הכי טוב של השבוע.",
    thumbnail_url: DEMO_IMAGES[3],
    media_url: "",
    score: 0.0258,
    score_basis_he: "שמירות ושיתופים, ביחס למספר האנשים שראו את הפוסט",
  },
  {
    ...demoSource({
      ref: "O4",
      kind: "own",
      handle: "",
      format: "image",
      format_he: "תמונה",
      hook: "שאלה לשישי: עם שומשום או בלי?",
      permalink: "https://www.instagram.com/p/C9fQtTm31/",
      posted_at: "2026-07-31T05:15:00+0000",
      when_he: "יום שישי 08:00",
      caption_length: 64,
      metrics: { views: 610, reach: 480, saved: 6, shares: 3, likes: 58, comments: 31 },
    }),
    media_id: "demo-o4",
    caption: "שאלה לשישי: עם שומשום או בלי?\nכתבו בתגובות, נאפה לפי הרוב.",
    thumbnail_url: DEMO_IMAGES[2],
    media_url: "",
    score: 0.0188,
    score_basis_he: "שמירות ושיתופים, ביחס למספר האנשים שראו את הפוסט",
  },
];

const DEMO_IG_COMPETITOR_POSTS: Record<string, InspirationSource[]> = {
  kemah_vemelach: [
    demoSource({
      ref: "C1",
      kind: "competitor",
      handle: "kemah_vemelach",
      format: "reel",
      format_he: "רילס",
      hook: "3 טעויות שכולם עושים עם מחמצת",
      permalink: "https://www.instagram.com/reel/C9mKmV01/",
      posted_at: "2026-08-18T15:00:00+0000",
      when_he: "יום שלישי 18:00",
      caption_length: 410,
      metrics: { likes: 412, comments: 38 },
    }),
    demoSource({
      ref: "C2",
      kind: "competitor",
      handle: "kemah_vemelach",
      format: "carousel",
      format_he: "קרוסלה",
      hook: "המחירון של שישי, בלי הפתעות",
      permalink: "https://www.instagram.com/p/C9rKmV02/",
      posted_at: "2026-08-28T04:30:00+0000",
      when_he: "יום שישי 07:00",
      caption_length: 220,
      metrics: { likes: 188, comments: 22 },
    }),
  ],
  "shira.ofa.bayit": [
    demoSource({
      ref: "C3",
      kind: "competitor",
      handle: "shira.ofa.bayit",
      format: "reel",
      format_he: "רילס",
      hook: "מה אני אופה כשהחנות סגורה",
      permalink: "https://www.instagram.com/reel/C9wShR03/",
      posted_at: "2026-09-04T17:00:00+0000",
      when_he: "יום שישי 20:00",
      caption_length: 180,
      metrics: { likes: 265, comments: 41 },
    }),
  ],
};

const DEMO_IG_FOLLOWERS: Record<string, number> = { kemah_vemelach: 12400, "shira.ofa.bayit": 5800 };

function demoIgRef(ref: string): InspirationSource {
  const own = DEMO_IG_OWN.find((post) => post.ref === ref);
  if (own) return demoSource({
    ref: own.ref,
    kind: own.kind,
    handle: own.handle,
    format: own.format,
    format_he: own.format_he,
    hook: own.hook,
    permalink: own.permalink,
    posted_at: own.posted_at,
    when_he: own.when_he,
    caption_length: own.caption_length,
    metrics: own.metrics,
  });
  const other = Object.values(DEMO_IG_COMPETITOR_POSTS)
    .flat()
    .find((post) => post.ref === ref);
  if (!other) throw new Error(`Unknown demo Instagram ref ${ref}`);
  return other;
}

function demoPattern(
  category: InspirationPattern["category"],
  category_he: string,
  pattern: string,
  evidence: string,
  refs: string[],
  strength: InspirationPattern["strength"]
): InspirationPattern {
  return { category, category_he, pattern, evidence, strength, source_refs: refs, sources: refs.map(demoIgRef) };
}

const DEMO_IG_BRIEF: InspirationBrief = {
  id: 1,
  year: 2026,
  month: 9,
  summary: "מה שעובד לכם: רילס קצר מהמשמרת וטיפ שאנשים שומרים. החודש כדאי לפתוח בטיפ, לא בשאלה.",
  patterns: [
    demoPattern(
      "format",
      "פורמט",
      "רילס קצר מהמשמרת של הבוקר",
      "שני הרילסים מהמאפייה נשמרו ושותפו יותר מכל פוסט אחר שלכם: 59 מתוך 860 שראו, ו-16 מתוך 620.",
      ["O1", "O3"],
      "strong"
    ),
    demoPattern(
      "hook",
      "משפט פתיחה",
      "פתיחה שמבטיחה טיפ שימושי נשמרת יותר",
      "הקרוסלה '3 לחמים שמחזיקים שבוע' נשמרה 29 פעמים. אצל @kemah_vemelach, רילס עם טיפים קיבל הכי הרבה תגובות.",
      ["O2", "C1"],
      "strong"
    ),
    demoPattern(
      "cta",
      "קריאה לפעולה",
      "שאלה בסוף מביאה תגובות, לא שמירות",
      "רק פוסט אחד: 31 תגובות, אבל 6 שמירות בלבד.",
      ["O4"],
      "weak"
    ),
    demoPattern(
      "timing",
      "ימים ושעות",
      "שישי בבוקר, לפני הקניות",
      "שני פוסטים של שישי בבוקר הגיעו ליחסית הרבה אנשים. אצל החשבון האחר רואים רק לייקים.",
      ["O2", "C2"],
      "weak"
    ),
    demoPattern(
      "topic",
      "נושא",
      "מאחורי הקלעים כשהחנות סגורה",
      "רק מחשבון אחר (@shira.ofa.bayit), לפי לייקים ותגובות.",
      ["C3"],
      "weak"
    ),
  ],
  caveats: ["אצל חשבונות אחרים רואים רק לייקים ותגובות.", "יש רק 4 פוסטים שלכם עם נתונים."],
  created_at: "2026-09-03T06:12:00",
  updated_at: "2026-09-03T06:12:00",
  sources: {
    own: DEMO_IG_OWN.map((post) => demoIgRef(post.ref)),
    competitors: Object.entries(DEMO_IG_COMPETITOR_POSTS).map(([handle, posts]) => ({
      handle,
      ok: true,
      error_he: "",
      profile: { username: handle, name: "", followers_count: DEMO_IG_FOLLOWERS[handle] ?? null, media_count: null },
      posts_seen: 25,
      posts,
    })),
    hashtags: [],
  },
};

let DEMO_IG_HANDLES: string[] = ["kemah_vemelach", "shira.ofa.bayit"];

/** The same rules as `normalize_handle` on the server, so the demo refuses what it would. */
const DEMO_HANDLE_RE = /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{1,30}$/;
const DEMO_IG_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com", "instagr.am"]);
const DEMO_IG_RESERVED = new Set(["p", "reel", "reels", "stories", "explore", "tv", "accounts"]);

function demoNormalizeHandle(raw: string): string {
  let value = (raw || "").trim();
  if (!value) throw new ApiError("לא הוזן שם משתמש.", 422);
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (DEMO_IG_HOSTS.has(url.hostname.toLowerCase())) {
      const segments = url.pathname.split("/").filter(Boolean);
      if (!segments.length || DEMO_IG_RESERVED.has(segments[0].toLowerCase())) {
        throw new ApiError(`'${value}' הוא קישור לפוסט ולא לפרופיל. הדביקו שם משתמש או קישור לפרופיל.`, 422);
      }
      value = segments[0];
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
  }
  value = value.replace(/^@+/, "").trim().toLowerCase();
  if (!DEMO_HANDLE_RE.test(value)) {
    throw new ApiError(
      `'${raw.trim()}' הוא לא שם משתמש תקין באינסטגרם. שם משתמש הוא עד 30 תווים: אותיות באנגלית, ספרות, נקודה וקו תחתון, ולא מתחיל או נגמר בנקודה.`,
      422
    );
  }
  return value;
}

function demoInstagramBrief(): InstagramBriefPayload {
  const connected = demoInstagramConnected();
  const handles = [...DEMO_IG_HANDLES];
  const base = {
    year: 2026,
    month: 9,
    meta_ready: true,
    handles,
    max_handles: 5,
    hashtag_search: { enabled: false, used_7d: 0, limit: 30 },
  };
  if (!connected) {
    return {
      ...base,
      meta_connected: false,
      own_posts_synced: 0,
      own_top_posts: [],
      brief: null,
      empty_reason: "אינסטגרם לא מחובר. חברו אותו בעמוד החיבורים, ונכתוב את הפוסטים לפי מה שהכי הצליח לכם.",
    };
  }
  const brief: InspirationBrief = JSON.parse(JSON.stringify(DEMO_IG_BRIEF));
  // A handle the owner removed is no longer read on the next refresh; the stored brief
  // still cites what it was built from, the same as on the server.
  return {
    ...base,
    meta_connected: true,
    own_posts_synced: 18,
    own_top_posts: JSON.parse(JSON.stringify(DEMO_IG_OWN)),
    brief,
    empty_reason: "",
  };
}

const POSTS: RoadmapPost[] = [
  {
    week: 1,
    date_hint: "2026-09-07",
    format: "reel",
    title: "החלות נגמרות לפני הצהריים",
    inspiration: { note: "רילס קצר מהתנור בבוקר, כמו הרילס שלכם שנשמר הכי הרבה.", sources: [demoIgRef("O1")] },
    angle: "להזמין לפני שנגמר, לקראת ראש השנה",
    hook: "בשישי ב-11:00 המדף כבר ריק",
    caption: "בשישי ב-11:00 המדף כבר ריק, וזה בשבוע רגיל.\nלראש השנה פתחנו הזמנות מראש: חלות עגולות, עם צימוקים או בלי. כתבו לנו בוואטסאפ עד רביעי בערב, ונשמור לכם חלה עם השם שלכם.",
    cta: "הזמנות בוואטסאפ עד רביעי",
    calendar_tie: "הכנות לחגי תשרי",
    goal_fit: "הזמנות מראש לחג",
    image_prompt: "Warm close-up of golden challah loaves on a floured Jaffa bakery counter at morning light",
    overlay_text: "החלות נגמרות לפני הצהריים",
    // One message on the image (docs/design-dna.md, Revision 1); the order deadline is in
    // the caption. The words sit on the empty wall above the challahs.
    has_overlay: true,
    overlay_headline: "החלות נגמרות לפני הצהריים",
    design: { composition: "full_bleed", text_mode: "headline", crop: "9:16", ...DEMO_PHOTO_AREAS["/demo/post-1.webp"] },
    primary_outlet: "instagram",
    outlets: ["instagram", "facebook", "whatsapp"],
    metrics_to_watch: ["פניות בוואטסאפ", "שמירות של הפוסט"],
    audience_id: 1,
    audience_name: "משפחות מיפו והשכונות הסמוכות",
    // Connected posts (docs/posts-v2.md). The demo month is part-way through, so every
    // lifecycle state is on screen at once: week 1 is out and measured (one number up, one
    // honestly down), week 2 is out and approved, week 3 waits for an approval and week 4
    // for the owner's own photos.
    uid: "demo-p1",
    channel: "instagram",
    plan_link: { goal: "הזמנות מראש לחגים", week: 1, week_focus: "סגירת הזמנות לחג" },
    mix_type: "offer",
    why_line: "בשביל הזמנות מראש לראש השנה, למשפחות מיפו.",
    measure: { metric: "whatsapp_clicks", label_he: "לחיצות לוואטסאפ", link_code: "IG-POST-3F9A1" },
    approval_status: "approved",
    scheduled_for: "2026-09-07",
    published_url: "https://www.instagram.com/p/demo-lechem-tom-1/",
    published_at: "2026-09-07T07:40:00",
    results: {
      updated_at: "2026-09-14T06:00:00",
      value: 21,
      metric: "whatsapp_clicks",
      compare: { label: "בפוסט דומה", value: 14, uid: "demo-aug-3" },
      whatsapp_clicks: 21,
      visits: 412,
      conversions: 19,
      reach: 1240,
      saves: 36,
      matched_by: ["instagram_link", "utm", "whatsapp_code"],
    },
    // In the server's own terms (`learning_facts`): the numbers and one visible difference,
    // never a cause or advice.
    learning: "יותר לחיצות מהפוסט הדומה. מה היה רק בפוסט הזה: עד מתי מזמינים, כבר בשורה הראשונה.",
    outlet_captions: {
      instagram: "בשישי ב-11:00 המדף כבר ריק. לראש השנה לא סומכים על המזל: הזמינו חלה עגולה בוואטסאפ, הקישור בפרופיל 🥖",
      facebook: "פתחנו הזמנות לחגי תשרי. כדי שלא תעמדו בתור של שישי, שריינו חלות מראש בוואטסאפ, ונשמור לכם אותן עם השם.",
      whatsapp: "היי, כאן לחם תום 👋 פתחנו הזמנות לחלות של ראש השנה. כתבו לנו כמה חלות לשמור לכם, ועם צימוקים או בלי.",
    },
  },
  {
    week: 1,
    date_hint: "2026-09-09",
    format: "carousel",
    title: "מה יש במארז של ראש השנה",
    inspiration: {
      note: "קרוסלה שמפרטת מה בפנים, בשישי בבוקר. כמו הפוסטים שנשמרו אצלכם ואצל @kemah_vemelach.",
      sources: [demoIgRef("O2"), demoIgRef("C2")],
    },
    angle: "חלה, ריבה ומאפה מלוח: כל השולחן בקופסה אחת",
    hook: "מה שמים על השולחן כשהאורחים כבר בדרך",
    caption: "מה שמים על השולחן כשהאורחים כבר בדרך?\nדפדפו: חלה עגולה, עוגת דבש, ריבת תאנים של השכנים מהשוק, ומאפה מלוח קטן למי שלא אוהב מתוק. הכול בקופסה אחת, איסוף מהמאפייה ביפו.",
    cta: "להזמנה באתר או בוואטסאפ",
    calendar_tie: "ראש השנה",
    goal_fit: "שמי שרואה את הפוסט גם יזמין",
    image_prompt: "Holiday bakery box with challah, jam, and a savory pastry on kraft paper",
    overlay_text: "מארז ראש השנה",
    // The box fills the frame: the photo alone carries it, the words are in the caption.
    has_overlay: false,
    overlay_headline: "מארז ראש השנה",
    design: { composition: "full_bleed", text_mode: "photo_only", crop: "4:5", ...DEMO_PHOTO_AREAS["/demo/post-2.webp"] },
    primary_outlet: "instagram",
    outlets: ["instagram", "facebook"],
    metrics_to_watch: ["דפדופים בקרוסלה", "לחיצות על הקישור"],
    uid: "demo-p2",
    channel: "instagram",
    plan_link: { goal: "הזמנות מראש לחגים", week: 1, week_focus: "סגירת הזמנות לחג" },
    mix_type: "product",
    why_line: "בשביל הזמנות מראש לראש השנה, למי שמארח בחג.",
    measure: { metric: "site_visits", label_he: "כניסות לאתר", link_code: "p2-מה-יש-במארז-של-ראש-השנה" },
    approval_status: "approved",
    scheduled_for: "2026-09-09",
    published_url: "https://www.instagram.com/p/demo-lechem-tom-2/",
    published_at: "2026-09-09T08:10:00",
    // Down against the comparison on purpose: a demo where every number rises would teach
    // the owner to distrust the screen.
    results: {
      updated_at: "2026-09-16T06:00:00",
      value: 251,
      metric: "site_visits",
      compare: { label: "בפוסט דומה", value: 310, uid: "demo-jul-5" },
      visits: 251,
      conversions: 9,
      reach: 980,
      saves: 41,
      matched_by: ["instagram_link", "utm"],
    },
    learning: "פחות כניסות לאתר מהפוסט הדומה. מה היה רק בפוסט הדומה: המחיר על התמונה.",
    outlet_captions: {
      instagram: "מה שמים על השולחן כשהאורחים כבר בדרך? דפדפו לראות מה יש במארז ראש השנה שלנו.",
      facebook: "מארז ראש השנה של לחם תום פתוח להזמנה מראש. מה שבפנים מופיע בתמונות.",
      whatsapp: "מארז ראש השנה מוכן להזמנה: חלה עגולה, עוגת דבש וריבת תאנים של השכנים. רוצים אחד? ענו להודעה הזו.",
    },
  },
  {
    week: 2,
    date_hint: "2026-09-11",
    format: "image",
    title: "השעות שלנו בראש השנה",
    angle: "שלא תגיעו לדלת סגורה",
    hook: "מתי פתוח ומתי סגור בראש השנה",
    caption: "ערב ראש השנה, שישי 11.9: פתוחים 07:00 עד 13:00, רק לאיסוף הזמנות.\n12–13.9: סגורים. שנה טובה ומתוקה.",
    cta: "שמרו את השעות",
    calendar_tie: "ראש השנה",
    goal_fit: "שאף אחד לא יגיע לדלת סגורה",
    image_prompt: "Handwritten bakery hours card on dark wood, cream paper, rust ink",
    overlay_text: "פתוחים עד 13:00",
    // The hours go on the blank card in the photo itself.
    has_overlay: true,
    overlay_headline: "פתוחים עד 13:00",
    overlay_sub: "בערב החג, לאיסוף הזמנות",
    design: { composition: "full_bleed", text_mode: "headline", crop: "4:5", ...DEMO_PHOTO_AREAS["/demo/post-3.webp"] },
    primary_outlet: "facebook",
    outlets: ["instagram", "facebook"],
    metrics_to_watch: ["שמירות של הפוסט", "שיתופים"],
    audience_id: 1,
    audience_name: "משפחות מיפו והשכונות הסמוכות",
    uid: "demo-p3",
    channel: "facebook",
    plan_link: { goal: "הזמנות מראש לחגים", week: 2, week_focus: "ראש השנה ושעות החג" },
    mix_type: "value",
    why_line: "כדי שאף אחד לא יגיע לדלת סגורה בחג, ללקוחות הקבועים.",
    measure: { metric: "reach", label_he: "אנשים שראו", link_code: "" },
    approval_status: "approved",
    scheduled_for: "2026-09-10",
    // "פרסמתי" without a link, and the sync has not counted it yet: "לא נמדד עדיין",
    // never a zero, and the link is an optional field, not a demand.
    published_at: "2026-09-10T17:20:00",
    results: null,
    learning: null,
    outlet_captions: {
      instagram: "מתי פתוחים בראש השנה? שמרו את הפוסט, ולא תגיעו לדלת סגורה 📌",
      facebook: "שעות הפתיחה של לחם תום בחגי תשרי. לאיסוף הזמנות כדאי להגיע מוקדם.",
      whatsapp: "עדכון שעות לחג: בערב החג פתוחים עד 13:00, ובימי החג סגורים. שנה טובה!",
    },
  },
  {
    week: 2,
    date_hint: "2026-09-16",
    format: "reel",
    title: "אחרי החג: הלחם היומי חוזר",
    inspiration: { note: "רילס מהמשמרת של הבוקר, הסוג שהכי הצליח לכם.", sources: [demoIgRef("O3")] },
    angle: "חזרה לשגרה",
    hook: "ראשון אחרי החג, והתור כבר בחוץ",
    caption: "ראשון אחרי החג, והתור כבר בחוץ.\nמחמצת של יום חול, כריך קממבר ואספרסו. חזרנו לשגרה.",
    cta: "פתוחים עד 13:00",
    calendar_tie: "",
    goal_fit: "שהלקוחות יחזרו לבוא כל יום",
    image_prompt: "Sliced sourdough and a sandwich on a neighborhood counter after the holiday",
    overlay_text: "חזרנו.",
    // Photo-led: one word on the dark wall, the rest in the caption.
    has_overlay: true,
    overlay_headline: "חזרנו.",
    design: { composition: "full_bleed", text_mode: "photo_only", crop: "9:16", ...DEMO_PHOTO_AREAS["/demo/post-4.webp"] },
    primary_outlet: "instagram",
    outlets: ["instagram", "tiktok"],
    metrics_to_watch: ["צפיות ברילס", "ביקורים בפרופיל"],
    uid: "demo-p4",
    channel: "instagram",
    plan_link: { goal: "הזמנות מראש לחגים", week: 2, week_focus: "ראש השנה ושעות החג" },
    mix_type: "behind_scenes",
    why_line: "בשביל שהלקוחות יחזרו לבוא כל בוקר אחרי החג, לשכונה.",
    measure: { metric: "reach", label_he: "אנשים שראו", link_code: "" },
    // Approved and dated, so the publishing queue has something genuinely due.
    approval_status: "approved",
    scheduled_for: "2026-09-16",
    outlet_captions: {
      instagram: "החג נגמר, המחמצת חזרה לתנור. בוקר רגיל ביפו, בדיוק כמו שאנחנו אוהבים ☕",
      facebook: "חזרנו לשגרה: מחמצת, מאפים חמים וקפה, כל בוקר מ-07:00.",
      whatsapp: "בוקר טוב! חזרנו לאפות. הלחמים יצאו עכשיו מהתנור.",
    },
  },
  {
    week: 3,
    date_hint: "2026-09-20",
    format: "image",
    title: "סגורים ביום כיפור",
    angle: "בלי מבצעים, רק לאחל צום קל",
    hook: "אנחנו סוגרים מוקדם בערב החג",
    caption: "בערב החג אנחנו סוגרים מוקדם, וב-21.9 סגורים כל היום.\nגמר חתימה טובה, וצום קל למי שצם.",
    cta: "",
    calendar_tie: "יום כיפור",
    goal_fit: "אמון של השכונה",
    image_prompt: "Quiet dark bakery interior, oven off, no sale graphics",
    overlay_text: "גמר חתימה טובה",
    // Nothing to sell: type on the bakery's paper, quiet.
    has_overlay: true,
    overlay_headline: "גמר חתימה טובה",
    overlay_sub: "ב-21.9 סגורים כל היום",
    design: { composition: "type_led", text_mode: "type_led", crop: "4:5", ...DEMO_PHOTO_AREAS["/demo/post-5.webp"] },
    primary_outlet: "instagram",
    outlets: ["instagram", "facebook"],
    metrics_to_watch: ["תגובות חמות"],
    uid: "demo-p5",
    channel: "instagram",
    plan_link: { goal: "הזמנות מראש לחגים", week: 3, week_focus: "יום כיפור, בלי למכור" },
    mix_type: "community",
    why_line: "בשביל אמון של השכונה, בלי למכור כלום, לכל מי שעוקב.",
    measure: { metric: "reach", label_he: "אנשים שראו", link_code: "" },
    outlet_captions: {
      instagram: "מכבים את התנורים ליום כיפור. גמר חתימה טובה.",
      facebook: "בערב כיפור סוגרים מוקדם, וביום כיפור סגורים. צום קל למי שצם.",
      whatsapp: "סגורים ליום כיפור. נחזור לאפות מיד אחרי.",
    },
  },
  {
    week: 4,
    date_hint: "2026-09-25",
    format: "carousel",
    title: "לחם לסוכה ולפיקניק",
    angle: "אירוח בסוכה ובפארק",
    hook: "מה לוקחים כשאוכלים בחוץ שבוע שלם",
    caption: "מה לוקחים כשאוכלים בחוץ שבוע שלם?\nבגטים, פוקצ׳ה עם עגבניות צלויות, ומארז משפחתי שמספיק לכל הסוכה. דפדפו לראות מה יש בכל אחד.",
    cta: "מארז סוכות בוואטסאפ",
    calendar_tie: "סוכות",
    goal_fit: "מכירות לחול המועד",
    image_prompt: "Picnic breads, baguettes and focaccia on a outdoor table under sukkah shade",
    overlay_text: "מארז פיקניק לסוכה",
    // The offer post, the only one with a price on the image: here the price is the message.
    has_overlay: true,
    overlay_headline: "מארז פיקניק לסוכה",
    price: { amount: 120, currency: "ILS", note: "לכל המשפחה" },
    design: { composition: "full_bleed", text_mode: "headline", crop: "4:5", ...DEMO_PHOTO_AREAS["/demo/post-6.webp"] },
    primary_outlet: "instagram",
    outlets: ["instagram", "facebook", "whatsapp"],
    metrics_to_watch: ["שמירות של הפוסט", "הזמנות של מארזים"],
    audience_id: 3,
    audience_name: "שולחי מתנות לעמיתים",
    uid: "demo-p6",
    channel: "instagram",
    plan_link: { goal: "הזמנות מראש לחגים", week: 4, week_focus: "סוכות ופיקניק" },
    mix_type: "offer",
    why_line: "בשביל הזמנות של מארזי פיקניק לחול המועד, למשפחות שאוכלות בסוכה.",
    // A photo and a fact: the two things only the owner can give. The needs themselves
    // are computed from these, the way the server does (demoOwnerNeeds).
    featured_item_name: "מארז פיקניק משפחתי",
    photo_hint_he: "תמונה של מארז הפיקניק, מלמעלה",
    owner_fact: "המחיר של המארז המשפחתי: 120 ₪",
    owner_fact_done: false,
    measure: { metric: "whatsapp_clicks", label_he: "לחיצות לוואטסאפ", link_code: "IG-POST-7C2D4" },
    // What the first measured post taught, already applied to this one.
    informed_by_note: "עודכן לפי מה שהצליח אצלכם: עד מתי מזמינים, כבר בשורה הראשונה",
    outlet_captions: {
      instagram: "יוצאים לסוכה? קחו איתכם פוקצ׳ה שרק יצאה מהתנור. מה יש במארז, בקרוסלה.",
      facebook: "אפשר לאסוף מארזי סוכות ופיקניק מהמאפייה ביפו כל חול המועד.",
      whatsapp: "מארז חול המועד סוכות מוכן: בגט צרפתי, 2 פוקצ׳ות ומטבל שמן זית וזעתר.",
    },
  },
  {
    week: 4,
    date_hint: "2026-09-28",
    format: "reel",
    title: "מאחורי התנור בסוכות",
    inspiration: {
      note: "מאחורי הקלעים של המאפייה, כמו הרילס שלכם מהבוקר והרילס של @shira.ofa.bayit.",
      sources: [demoIgRef("O1"), demoIgRef("C3")],
    },
    angle: "להראות את העבודה, לא רק למכור",
    hook: "איך נראית משמרת כשהעיר בחופש",
    caption: "30 שניות מהמשמרת: לישה, קמח בכל מקום, ויפו עוד ישנה ב-05:00.",
    cta: "פתוחים מ-07:00",
    calendar_tie: "סוכות",
    goal_fit: "שיכירו אתכם ויבואו לחנות",
    image_prompt: "Night bakery shift, warm oven glow, baker's hands, no luxury styling",
    overlay_text: "מאחורי התנור",
    // The hands and the fire are the post.
    has_overlay: false,
    overlay_headline: "מאחורי התנור",
    design: { composition: "full_bleed", text_mode: "photo_only", crop: "9:16", ...DEMO_PHOTO_AREAS["/demo/post-7.webp"] },
    primary_outlet: "instagram",
    outlets: ["instagram", "tiktok"],
    metrics_to_watch: ["זמן צפייה ממוצע", "שיתופים"],
    audience_id: 2,
    audience_name: "מזמיני חג חד-פעמיים",
    uid: "demo-p7",
    channel: "instagram",
    plan_link: { goal: "הזמנות מראש לחגים", week: 4, week_focus: "סוכות ופיקניק" },
    mix_type: "behind_scenes",
    why_line: "בשביל שיכירו את המאפייה מקרוב, לקהל חדש ביפו.",
    photo_hint_he: "תמונה מהמשמרת של הבוקר, ליד התנור",
    measure: { metric: "reach", label_he: "אנשים שראו", link_code: "" },
    outlet_captions: {
      instagram: "05:00 בבוקר ביפו, כשהעיר עוד ישנה. ככה נראית משמרת סוכות 🥖✨",
      facebook: "הבצק תופח, התנור לוהט. מוזמנים לקפה ומאפה חם כל הבוקר.",
      whatsapp: "קפצו להגיד שלום! הריח של המאפים מגיע עד פינת הרחוב.",
    },
  },
];

const HOLIDAYS_2026: CalendarEvent[] = [
  { date: "2026-01-02", name: "חיסולי חורף ושנה אזרחית חדשה", kind: "קניות", note: "מוציאים את מלאי החורף.", source: "commercial_il" },
  { date: "2026-02-01", name: "ט״ו בשבט", kind: "חג", note: "עצים ופירות יבשים.", source: "hebrew_calendar" },
  { date: "2026-03-03", name: "פורים", kind: "חג", note: "תחפושות ומשלוחי מנות.", source: "hebrew_calendar" },
  { date: "2026-03-08", name: "יום האישה", kind: "תרבות", note: "מתנות ושירותים.", source: "commercial_il" },
  { date: "2026-04-02", name: "פסח", kind: "חג", note: "הקניות הגדולות של השנה.", source: "hebrew_calendar" },
  { date: "2026-04-08", name: "שביעי של פסח", kind: "חג", note: "סוף החג.", source: "hebrew_calendar" },
  { date: "2026-04-14", name: "יום השואה", kind: "זיכרון", note: "בלי מבצעים.", source: "hebrew_calendar" },
  { date: "2026-04-21", name: "יום הזיכרון", kind: "זיכרון", note: "לא מפרסמים.", source: "hebrew_calendar" },
  { date: "2026-04-22", name: "יום העצמאות", kind: "לאומי", note: "מנגל ובילוי משפחתי.", source: "hebrew_calendar" },
  { date: "2026-05-15", name: "יום ירושלים", kind: "לאומי", note: "תיירות בירושלים.", source: "hebrew_calendar" },
  { date: "2026-05-22", name: "שבועות", kind: "חג", note: "מאכלי חלב ומאפים.", source: "hebrew_calendar" },
  { date: "2026-07-01", name: "תחילת החופש הגדול", kind: "עונתי", note: "משפחות ופנאי.", source: "commercial_il" },
  { date: "2026-07-29", name: "ט״ו באב", kind: "תרבות", note: "חג האהבה הישראלי.", source: "hebrew_calendar" },
  { date: "2026-08-10", name: "חזרה ללימודים", kind: "עונתי", note: "ילקוטים וחוגים.", source: "commercial_il" },
  { date: "2026-09-01", name: "פתיחת שנת הלימודים", kind: "עונתי", note: "חזרה לשגרה.", source: "commercial_il" },
  { date: "2026-09-01", name: "הכנות לחגי תשרי", kind: "קניות", note: "מזון ומתנות.", source: "commercial_il" },
  { date: "2026-09-12", name: "ראש השנה", kind: "חג", note: "שולחן חג וחלות.", source: "hebrew_calendar" },
  { date: "2026-09-13", name: "ראש השנה (יום שני)", kind: "חג", note: "עסקים סגורים.", source: "hebrew_calendar" },
  { date: "2026-09-21", name: "יום כיפור", kind: "חג", note: "בלי מבצעים.", source: "hebrew_calendar" },
  { date: "2026-09-26", name: "סוכות", kind: "חג", note: "אירוח בחוץ.", source: "hebrew_calendar" },
  { date: "2026-10-03", name: "שמחת תורה", kind: "חג", note: "סוף חגי תשרי.", source: "hebrew_calendar" },
  { date: "2026-11-27", name: "בלאק פריידי", kind: "קניות", note: "יום הקניות הגדול.", source: "commercial_il" },
  { date: "2026-11-30", name: "סייבר מאנדיי", kind: "קניות", note: "עוד יום של מבצעים אונליין.", source: "commercial_il" },
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
    usp: "לחם תום היא מאפייה שכונתית ביפו: מחמצת כל בוקר, חלות לשישי, ואיסוף באותו יום. לא רשת.",
    usp_one_liner: "חלה של שישי שנגמרת לפני שהאורחים מגיעים.",
    why_now: "ספטמבר 2026 הוא חודש חגי תשרי. מי שלא סוגר הזמנות לפני ראש השנה מפספס את השבוע הכי חזק בחודש.",
    competitor_gaps: ["הרשתות מדברות על מחיר, לא על שעות האיסוף לחג.", "אין מארז אירוח קטן לזוג."],
    risks: ["סגירה ביום כיפור בלי הודעה מראש."],
    proof_points: ["אפייה יומית", "תור קבוע בשישי", "הזמנות בוואטסאפ"],
    messaging_pillars: ["חלה וחג", "המאפייה של השכונה", "שעות ברורות", "מארז קטן"],
    growth_hypothesis: "אם הלקוחות יתרגלו להזמין בוואטסאפ יומיים לפני שישי, במקום לעמוד בתור ברגע האחרון, נמכור 30% יותר חלות וכמעט לא נזרוק מאפים.",
    growth_targets: ["400 לקוחות קבועים ברשימת הוואטסאפ", "25% יותר חלות בשישי", "120 הזמנות מראש לחגי תשרי"],
    known_bkms: [
      "לפתוח הזמנות לשישי בוואטסאפ כל רביעי ב-10:00, לפני שהלקוחות מחליטים איפה לקנות",
      "סרטון אמיתי מהתנור, בלי מוזיקת רקע, רק הקול של הקרום נסדק",
      "מודעות לאנשים ברדיוס 3 ק״מ, ביפו ובפלורנטין, לקראת חגי תשרי",
      "לשלוח ישר לוואטסאפ, לא לאתר מסובך",
    ],
    budget_allocation: {
      meta_ads_share_pct: 35,
      organic_production_share_pct: 45,
      local_promotion_share_pct: 20,
      guidance: "מתוך 4,500 ₪: 1,600 ₪ למודעות ביפו לקראת החגים, 2,000 ₪ לצילום ולהפקה של הפוסטים כל שבוע, ו-900 ₪ לטעימות ולשיתופי פעולה עם עסקים בשכונה.",
    },
  },
  calendar: HOLIDAYS_2026.filter((event) => event.date.startsWith("2026-09")),
  relevant_events: [
    { date: "2026-09-01", name: "פתיחת שנת הלימודים", business_relevance: "חשיבות בינונית: כריכי בוקר להורים ולילדים בדרך לבית הספר", relevance_tier: "medium" },
    { date: "2026-09-01", name: "הכנות לחגי תשרי", business_relevance: "קריטי: לסגור הזמנות לחג לפני שהמתחרים עושים את זה", relevance_tier: "critical" },
    { date: "2026-09-12", name: "ראש השנה", business_relevance: "קריטי: השבוע הכי חזק בשנה לחלות עגולות, עוגות דבש ומארזי חג", relevance_tier: "critical" },
    { date: "2026-09-21", name: "יום כיפור", business_relevance: "קריטי: הודעת סגירה שקטה, בלי מבצעים. זה בונה אמון בשכונה", relevance_tier: "critical" },
    { date: "2026-09-26", name: "סוכות", business_relevance: "חשוב: מארזי פיקניק, בגטים ופוקצ׳ות לאירוח בחוץ בחול המועד", relevance_tier: "high" },
  ],
  long_horizon_plan: {
    horizon: "סתיו–חורף 2026",
    hypothesis: "שלחם תום תהיה המקום של החלות והאירוח ביפו ובדרום תל אביב. במקום לחכות למי שעובר ברחוב, נבנה רשימה של 400 לקוחות קבועים שמזמינים לשישי בוואטסאפ.",
    targets: ["400 לקוחות קבועים ברשימת הוואטסאפ", "25% יותר חלות בשישי", "אפס מאפים שנזרקים בסופי שבוע"],
    milestones: [
      { month_label: "ספטמבר", milestone: "חגי תשרי והזמנות מראש", checkpoint: "אישור המארזים לראש השנה ולסוכות" },
      { month_label: "אוקטובר", milestone: "חזרה לשגרה ופתיחת מועדון החלות של שישי", checkpoint: "פתיחת ההרשמה למועדון" },
      { month_label: "נובמבר", milestone: "תפריט חורף: מרקים ולחמי מחמצת כבדים", checkpoint: "קנייה ממוצעת של יותר מ-85 ₪" },
    ],
  },
  monthly_horizon_plan: {
    hypothesis: "אם נפתח את ההזמנות לראש השנה בוואטסאפ 5 ימים מוקדם יותר, כל החלות יימכרו מראש, בלי תורים ארוכים ברחוב.",
    targets: ["כל החלות לערב ראש השנה נמכרות מראש", "לפחות 120 הזמנות מראש בוואטסאפ", "70% פחות שאלות על שעות הפתיחה"],
  },
  management_and_checkpoints: {
    how_we_help: "אנחנו כותבים ומעצבים את כל 7 הפוסטים בסגנון של האתר ובתמונות שלכם, מתזמנים אותם לפי החגים, ובודקים כל שבוע וכל חודש מה הצליח, כדי להשתפר.",
    when_we_need_user: [
      "בתחילת החודש: לאשר את התוכנית (5 דקות)",
      "פעם בשבוע: לצלם בטלפון סרטון קצר של התנור או הדלפק (10 דקות)",
      "בימי ראשון: לאשר את הפוסטים של השבוע (2 דקות)",
      "לענות ללקוחות שפונים מהרשתות",
    ],
    checkpoints: [
      { timing: "שבוע 1 (1–7 בספטמבר)", purpose: "פותחים הזמנות לחג", user_action: "לבדוק שהקישור לוואטסאפ בפרופיל עובד" },
      { timing: "שבוע 2 (8–14 בספטמבר)", purpose: "ראש השנה ושעות הפתיחה בחג", user_action: "לצלם את שלט השעות בחנות" },
      { timing: "שבוע 3 (15–21 בספטמבר)", purpose: "הודעה שקטה ליום כיפור, וחזרה לשגרה", user_action: "לאשר את שעות הסגירה בחג" },
      { timing: "שבוע 4 (22–30 בספטמבר)", purpose: "מארזי סוכות וסיכום החודש", user_action: "לעבור על הסיכום של החודש" },
    ],
    user_approved: false,
  },
  weekly_breakdown: [
    {
      week: 1,
      focus: "פותחים הזמנות לחגי תשרי",
      what_we_do: ["כותבים 2 פוסטים שמזכירים להזמין בזמן", "מעצבים אותם בסגנון של האתר", "מוסיפים למודעות קישור לוואטסאפ"],
      what_user_does: ["לבדוק שהקישור לוואטסאפ עובד", "להחליט כמה חלות אפשר לקבל בהזמנה מראש"],
      metrics_target: ["50 פניות בוואטסאפ", "יותר מ-8% מהצופים מזמינים"],
      media_distribution: "רילס באינסטגרם, קרוסלה בפייסבוק וסטטוס בוואטסאפ",
    },
    {
      week: 2,
      focus: "שעות החג ומארז ראש השנה",
      what_we_do: ["פוסט ברור עם שעות הפתיחה", "סוגרים את ההזמנות לשישי"],
      what_user_does: ["לעדכן את שעות הפתיחה בפרופיל העסקי בגוגל", "לתלות שלט שעות על הדלת"],
      metrics_target: ["אף אחד לא מגיע לדלת סגורה", "כל החלות נמכרות"],
      media_distribution: "פוסט עם השעות באינסטגרם ובפייסבוק",
    },
    {
      week: 3,
      focus: "יום כיפור בשקט, וחזרה לשגרה",
      what_we_do: ["פוסט שקט בלי מכירה", "תזכורת ביום ראשון: הלחם היומי חזר"],
      what_user_does: ["לסגור מוקדם בערב כיפור"],
      metrics_target: ["תגובות חמות ושמירות של הפוסט"],
      media_distribution: "תמונה אחת באינסטגרם וסטורי בפייסבוק",
    },
    {
      week: 4,
      focus: "סוכות ואירוח בחוץ",
      what_we_do: ["מקדמים בגטים ופוקצ׳ות לפיקניק", "מכינים את הסיכום של החודש"],
      what_user_does: ["אם יש סוכה, לצלם 10 שניות של השולחן"],
      metrics_target: ["40 מארזי פיקניק נמכרים"],
      media_distribution: "קרוסלה באינסטגרם ופוסט בקבוצות השכונה בפייסבוק",
    },
  ],
  posting_plan: {
    weekly_posts: 5,
    format_mix: { reels: 2, carousels: 2, image_posts: 1 },
    ads_guidance: "תקציב בטווח סביר לפרסום ממומן.",
    mix_note: "דגש על קרוסלות עם הצעה, רילס עם קריאה ברורה לפעולה, וקישור לוואטסאפ.",
  },
  roadmap: {
    theme: "חגי תשרי על שולחן יפו",
    summary: "הזמנות מראש, ראש השנה, שקט בכיפור וסוכות בחוץ.",
    posts: POSTS,
    weekly_focus: [
      { week: 1, focus: "סגירת הזמנות לחג" },
      { week: 2, focus: "ראש השנה ושעות החג" },
      { week: 3, focus: "יום כיפור, בלי למכור" },
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

/**
 * Per-post results in the shape `_attribute()` in `api/app/routers/performance.py` stores
 * under `ga4.post_attribution`: the post's GA4 campaign rows (string metrics, as GA4 sends
 * them) and its matched Instagram media, or `null` when nothing was matched.
 *
 * The numbers sum exactly to the per-audience rows below, and the last two posts carry no
 * match at all — so the results screen has to show "not measured" rather than a zero.
 */
const DEMO_POST_RESULTS: Record<number, { audience: [number, string] | null; ga4?: [number, number, number]; meta?: [number, number] }> = {
  0: { audience: [1, "משפחות מיפו והשכונות הסמוכות"], ga4: [412, 19, 221], meta: [318, 24] },
  1: { audience: [2, "מזמיני חג חד-פעמיים"], ga4: [251, 9, 131], meta: [158, 13] },
  2: { audience: [1, "משפחות מיפו והשכונות הסמוכות"], ga4: [96, 2, 54], meta: [71, 5] },
  3: { audience: [1, "משפחות מיפו והשכונות הסמוכות"], ga4: [234, 10, 126], meta: [97, 9] },
  4: { audience: [2, "מזמיני חג חד-פעמיים"], ga4: [67, 2, 37], meta: [46, 4] },
  5: { audience: [3, "שולחי מתנות לעמיתים"] },
  6: { audience: null },
};

const DEMO_POST_ATTRIBUTION: Record<string, unknown>[] = POSTS.map((post, index) => {
  const result = DEMO_POST_RESULTS[index] || { audience: null };
  return {
    title: post.title,
    utm_content: post.utm?.utm_content || "",
    published_url: post.published_url || "",
    audience_id: result.audience?.[0] ?? null,
    audience_name: result.audience?.[1] ?? "",
    ga4: result.ga4
      ? [
          {
            sessionCampaignName: post.utm?.utm_campaign || "",
            sessionSource: post.utm?.utm_source || "instagram",
            sessionManualAdContent: post.utm?.utm_content || "",
            sessions: String(result.ga4[0]),
            conversions: String(result.ga4[1]),
            engagedSessions: String(result.ga4[2]),
          },
        ]
      : [],
    meta: result.meta
      ? { id: `demo-${index + 1}`, caption: post.caption, like_count: result.meta[0], comments_count: result.meta[1], insights: {} }
      : null,
  };
});

/**
 * The demo bakery's Instagram account, in the shape `account_overview()` stores. Link
 * taps in the bio are not here because Meta no longer reports them; the screen says so.
 */
function demoAccountWindow(
  start: string,
  end: string,
  days: number,
  [reach, views, engaged, interactions, calls, directions, follows, unfollows]: number[],
): InstagramAccountWindow {
  return {
    start,
    end,
    days,
    values: {
      reach,
      views,
      accounts_engaged: engaged,
      total_interactions: interactions,
      profile_links_taps: calls + directions,
      follows_and_unfollows: follows + unfollows,
      follows,
      unfollows,
      net_followers: follows - unfollows,
    },
    breakdowns: {
      profile_links_taps: { CALL: calls, DIRECTION: directions },
      follows_and_unfollows: { FOLLOWER: follows, NON_FOLLOWER: unfollows },
    },
    errors: {},
    stopped: "",
  };
}

const DEMO_ACCOUNT: InstagramAccount = {
  as_of: "2026-09-05",
  followers_count: 2380,
  new_followers: { "7": 24, "28": 96 },
  windows: {
    "7": {
      current: demoAccountWindow("2026-08-29", "2026-09-04", 7, [1980, 5600, 118, 330, 6, 9, 24, 9]),
      previous: demoAccountWindow("2026-08-22", "2026-08-28", 7, [1710, 5100, 102, 301, 7, 10, 19, 8]),
    },
    "28": {
      current: demoAccountWindow("2026-08-08", "2026-09-04", 28, [6240, 21400, 410, 1280, 21, 36, 96, 31]),
      previous: demoAccountWindow("2026-07-11", "2026-08-07", 28, [5110, 18900, 356, 1090, 19, 30, 71, 29]),
    },
  },
  errors: {},
  stopped: "",
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
    post_attribution: DEMO_POST_ATTRIBUTION,
  },
  meta: {
    ads: {
      status: "available", period: { start: "2026-08-08", end: "2026-09-04" },
      note_he: "נתוני דוגמה בלבד.",
      overview: { spend: 480, currency: "ILS", link_clicks: 160, website_purchases: 12 },
      campaigns: [],
    },
    tracking: { status: "receiving", note_he: "נתוני דוגמה: מטא מקבלת אירועים מהאתר.", checked_at: "2026-09-30T12:00:00Z" },
    page: { name: "לחם תום", fan_count: 4120 },
    posts: [{ id: "1", caption: "החלות נגמרות לפני הצהריים", media_type: "REEL", like_count: 640 }],
    account: DEMO_ACCOUNT,
  },
  diagnostic: {
    headline: "רילס החלות מביא הרבה לייקים ותגובות, אבל 41% יוצאים מעמוד החג באתר לפני שהם מגיעים לוואטסאפ.",
    top_content: [{ label: "רילס החלות", why: "הרבה לייקים ותגובות. אנשים מכירים את הבעיה של שישי." }],
    bottom_content: [{ label: "עמוד ראש השנה באתר (מהמודעות)", why: "הרבה נכנסים, ו-52% יוצאים מיד." }],
    funnel_issues: ["המודעה שולחת לעמוד שבו לא רואים את כפתור הוואטסאפ בלי לגלול."],
    metric_highlights: ["63 פניות והזמנות ב-28 ימים", "הרילס קיבל הכי הרבה לייקים"],
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
      "לכל קהל אנחנו סוכמים את התוצאות של הפוסטים שנכתבו אליו: כניסות לאתר ופעולות חשובות מנתוני האתר, ולייקים ותגובות מאינסטגרם. לא המצאנו כאן מספר, אחוז או קשר שאין לו בסיס בנתונים.",
    explanation:
      "פוסט אחד בתוכנית בלי קהל, והוא נספר בנפרד תחת 'לא משויך'.",
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

/** Fictional source facts; no inferred messages, sales or prior-year results. */
export const DEMO_RECS: RecommendationPayload = {
  id: 1,
  created_at: "2026-09-05T08:00:00Z",
  week_of: "2026-08-31",
  suggestions: {
    week_summary: "נבדוק אם הסבר ברור יותר במארז עוזר ללקוחות לבחור.",
    basis: {
      version: 1, snapshot_id: 1, plan_id: DEMO_STRATEGY.id,
      sources: [
        { key: "ga4", label: "נתוני האתר", status: "available", period: { start: "2026-08-08", end: "2026-09-04" }, read_at: "2026-09-05T08:00:00Z", stale: true },
        { key: "meta_ads", label: "המודעות בפייסבוק ובאינסטגרם", status: "available", period: { start: "2026-08-08", end: "2026-09-04" }, read_at: "2026-09-05T08:00:00Z", stale: true },
      ],
      observations: [
        { source: "ga4", metric: "sessions", label: "כניסות לאתר", value: 1840 },
        { source: "ga4", metric: "conversions", label: "פעולות חשובות באתר", value: 63 },
        { source: "meta_ads", metric: "link_clicks", label: "לחיצות על קישור במודעות", value: 160 },
      ],
      limits: ["הנתונים מומצאים לצורך הדגמה. פעולות חשובות אינן בהכרח פניות או הזמנות.", "אין כאן בדיקה שמוכיחה למה הלקוחות פעלו כך. זהו ניסוי מוצע, ולא מסקנה על המכירות."],
    },
    suggestions: [
      {
        priority: "medium", title: "נסביר מה יש במארז לפני שמבקשים להזמין",
        action: "בפוסט המארז נוסיף פירוט קצר של התכולה ומועד האיסוף, ונשאיר בקשה אחת להזמנה.",
        evidence: "בתרחיש יש כניסות ופעולות באתר, אבל אין מדידה מאומתת של הזמנות. אפשר לבדוק ניסוח אחד בלי להסיק מה גרם לתוצאות.",
        target: "טיוטת מארז סוכות בתוכנית", hypothesis: "ייתכן שפרטי המארז יעזרו לבחור. הנתונים אינם מוכיחים שחוסר במידע מונע הזמנות.",
        success_check: "אחרי שבוע נבדוק לחיצות מהפוסט. לפני מסקנה על הזמנות, נוודא שאפשר לזהות אותן באתר.",
        review: { kind: "post", status: "ready", href: `/posts?post=5&plan=${DEMO_STRATEGY.id}&post_uid=demo-p6&recommendation=1&suggestion=0`, label: "לבדוק את ההצעה בפוסט", note_he: "נפתח את הפוסט כפי שהוא. ההצעה לא נערכת ולא מתפרסמת אוטומטית.", plan_id: DEMO_STRATEGY.id, post_uid: "demo-p6" },
      },
      {
        priority: "medium", title: "נוודא מה נחשב לפעולה חשובה באתר",
        action: "בדקו עם מי שמנהל את האתר אם הזמנה או פנייה נמדדות בנפרד מלחיצה.", evidence: "63 הפעולות בדוגמה אינן ספירה מאומתת של הזמנות.", target: "מדידת האתר",
        success_check: "ננסה פנייה או הזמנה לבדיקה, ונוודא שהיא נספרה בנתוני האתר.",
        review: { kind: "measurement", status: "ready", href: "/integrations", label: "לבדוק את החיבורים", note_he: "חיבור פעיל אינו מאשר מה בדיוק נמדד באתר.", plan_id: DEMO_STRATEGY.id },
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
  /** A source the plan needs but this app cannot read yet. Excluded from setup totals. */
  status?: "soon";
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
      title: "פעם אחת, בהתחלה",
      items: [
        {
          key: "scan",
          title: "קריאת האתר",
          why: "מהאתר אנחנו לומדים את הצבעים, התמונות והסגנון שלכם. בלי זה הפוסטים ייצאו כלליים.",
          done: filled(DEMO_BUSINESS.brand_language),
          action_href: "/decisions",
          action_label: "לקרוא את האתר",
        },
        {
          key: "diagnostics",
          title: "כמה שאלות על העסק",
          why: "לפי התשובות נבחר יעדים ופוסטים שמתאימים לעסק שלכם.",
          done: diagnostics ? Object.values(diagnostics).some(filled) : false,
          action_href: "/decisions",
          action_label: "לענות על השאלות",
        },
        {
          key: "priorities",
          title: "היעדים שלכם",
          why: "התוכנית של כל חודש נבנית סביב היעדים שבחרתם.",
          done: (DEMO_BUSINESS.growth_targets || []).length > 0,
          action_href: "/decisions",
          action_label: "לבחור יעדים",
        },
        {
          key: "quarter",
          title: "האסטרטגיה והצעדים הבאים",
          why: "כך כל חודש הוא צעד לקראת יעד גדול, ולא רק רשימת פוסטים.",
          done: filled(DEMO_BUSINESS.long_horizon_plan),
          action_href: "/plan",
          action_label: "לבנות את התוכנית",
        },
        {
          key: "audiences",
          title: "למי אתם פונים",
          why: "כל פוסט ייכתב לקהל מסוים, ותראו את התוצאות לפי קהל.",
          done: DEMO_AUDIENCES.length > 0,
          action_href: "/decisions#audiences",
          action_label: "לבחור קהלים",
        },
        {
          key: "media",
          title: "התמונות שלי",
          why: "התמונות שלכם ישמשו בכל עיצוב, במקום תמונות מלאי גנריות.",
          done: DEMO_ASSETS.length > 0,
          action_href: "/assets",
          action_label: "להעלות תמונות",
        },
        {
          key: "google",
          title: "חיבור נתוני האתר",
          why: "רק כך רואים אילו פוסטים באמת הביאו אנשים לאתר, ומה הם עשו שם.",
          // The demo's integrations payload reports both providers as null.
          done: false,
          action_href: "/integrations",
          action_label: "לחבר את נתוני האתר",
        },
        {
          key: "instagram",
          title: "חיבור אינסטגרם",
          why: "כך נמדוד את הפוסטים, ובהמשך גם נפרסם אותם בלי שתעתיקו ידנית.",
          done: false,
          action_href: "/integrations",
          action_label: "לחבר את אינסטגרם",
        },
      ],
    },
    {
      key: "running",
      title: "כל חודש",
      items: [
        {
          key: "plan",
          title: "תוכנית החודש",
          why: "כאן התוכנית הופכת לפוסטים של החודש, מוכנים לאישור.",
          done: posts.length > 0,
          action_href: "/strategy",
          action_label: "לבנות את החודש",
        },
        {
          key: "approve",
          title: "אישור הפוסטים",
          why: "רק פוסטים מאושרים נכנסים לפרסום ולמדידה.",
          // The same rule as `_all_approved`: no posts is not "all approved".
          done: posts.length > 0 && posts.every((post) => post.approval_status === "approved"),
          action_href: "/posts",
          action_label: "לאשר את הפוסטים",
        },
        {
          key: "publish",
          title: "סימון מה פורסם",
          why: "כשאתם מסמנים את הקישור לפוסט שפורסם, אנחנו יכולים לקשר אותו לתוצאות.",
          done: posts.some((post) => filled(post.published_url)),
          action_href: "/posts",
          action_label: "לסמן מה פורסם",
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
      note: "המקור מביא שתי דרכים לתמחר דמי ניהול: אחוז מתקציב המדיה, או סכום קבוע בחודש. הצגנו את שתיהן, ולא בחרנו בשבילכם.",
    },
    setup_fee: [1500, 4000],
    total_monthly_ils: [5175, 12500],
    first_month_total_ils: [6675, 16500],
    warnings: [
      "התקציב החודשי (4,500 ₪) נמוך מהמינימום שפורסם למגזר 'שירותים מקומיים' (5,000-8,000 ₪). מתחת למינימום הזה המקור מתאר מלכודת: אין מספיק נתונים → המערכת של גוגל לא לומדת → התוצאות גרועות → התקציב נשרף מהר → ויש עוד פחות נתונים. עדיף לחכות לתקציב מתאים, או לשים את הסכום הזה במקומות שלא תלויים בלמידה של גוגל: קידום האתר בחיפוש בלי לשלם, פוסטים ורשתות חברתיות.",
      "מספר הפניות וההזמנות הצפוי (24-64 בחודש) חוצה את סף ה-30 שגוגל צריך כדי ללמוד. בתרחיש הזהיר עדיין אין מספיק נתונים, והקמפיין נשאר בשלב למידה. תכננו את החודש כאיסוף נתונים, לא כחודש שצריך להחזיר את ההוצאה.",
    ],
    assumptions: [
      "מחיר לקליק בתחום 'מזון ומשקאות': 3.5-5.5 ₪ (הרצועה הנמוכה של המקור)",
      "במגזר 'שירותים מקומיים', 3.0%-5.0% מהקליקים הופכים לפניות. זה השיעור שפורסם למגזר, לא מדידה של העסק שלכם",
      "גוגל צריך 30-50 פניות או הזמנות בחודש כדי ללמוד ולהשתפר. מתחת לזה הוא לא באמת משתפר",
      "דמי ניהול: 15%-20% מתקציב המדיה, או 2,000-8,000 ₪ בחודש. הקמה חד-פעמית: 1,500-4,000 ₪",
      "התקציב שהזנתם הוא תקציב המדיה בלבד, כלומר מה שמשלמים לגוגל על המודעות. דמי הניהול וההקמה מפורטים בנפרד, ולכן העלות האמיתית בחודש גבוהה יותר",
      "אין לנו גישה לכלי תכנון המילים של גוגל, ואין לנו נפחי חיפוש. מספר הקליקים הוא המקסימום שהתקציב יכול לקנות, לא תחזית של כמה אנשים מחפשים",
    ],
    source: "https://www.rulers.co.il/blog/how-much-does-a-successful-google-ads-campaign-really-cost-in-israel/",
    source_title: "רולרס — כמה באמת עולה קמפיין Google Ads מוצלח בישראל?",
    conversion_unit: "פנייה",
    channel_comparison: {
      google: {
        label: "מודעות בגוגל",
        intent: "מי שמחפש כבר רוצה לקנות: אנשים מחפשים בדיוק את מה שאתם מציעים",
        downside: "קליק עולה יותר מאשר בפייסבוק ובאינסטגרם",
        timing: "תוצאות מיד",
      },
      meta: {
        label: "פייסבוק ואינסטגרם",
        cpc_ils: [1.5, 8.0],
        intent: "מי שגולל פחות מחפש לקנות: המודעה קוטעת אותו באמצע משהו אחר",
        upside: "קליק זול יותר, ואפשר לכוון לפי גיל, מקום ותחומי עניין",
      },
      recommendation:
        "המקור ממליץ לשלב: גוגל למי שכבר מחפש לקנות, ופייסבוק ואינסטגרם כדי שיכירו אתכם ולפנות שוב למי שכבר ביקר. לא לשים את כל התקציב במקום אחד.",
    },
  },
  business_profile: {
    title: "הכרטיס של העסק בגוגל (Google Business Profile)",
    summary:
      "לפני שמשלמים לגוגל על קליקים, כדאי לסדר את מה שבחינם: הכרטיס של העסק בגוגל. הוא מופיע כשמחפשים את שם העסק, ודרכו מבקשים ביקורות.",
    free: true,
    is_local: true,
    suggested_category_hint: "מזון ומשקאות",
    steps: [
      {
        id: "claim",
        title: "לקבל בעלות על הכרטיס בגוגל",
        priority: "critical",
        why: "בלי כרטיס שאתם מנהלים, גוגל עלול להציג על לחם תום מידע שאף אחד לא עדכן, או לא להציג אותו בכלל כשמחפשים אתכם.",
        how: [
          "חפשו את 'לחם תום' בגוגל מפות ובחיפוש של גוגל.",
          "אם הכרטיס קיים ואתם לא מנהלים אותו, לחצו על 'בעלים של העסק הזה?' ובקשו בעלות.",
          "אם אין כרטיס, פתחו אחד עם חשבון הגוגל של העסק (לא עם חשבון אישי של עובד).",
        ],
      },
      {
        id: "verify",
        title: "לאמת את הכרטיס",
        priority: "critical",
        why: "כרטיס לא מאומת לא מוצג כמו כרטיס מאומת, ואי אפשר לערוך בו חלק מהפרטים.",
        how: [
          "בחרו את שיטת האימות שגוגל מציע (סרטון, טלפון או גלויה).",
          "אמתו מיד. רק אחרי האימות הכרטיס באמת שלכם.",
          "רשמו למי בחשבון יש הרשאה, והוסיפו בעלים נוסף כדי לא לאבד גישה.",
        ],
      },
      {
        id: "categories",
        title: "קטגוריה ראשית וקטגוריות משנה",
        priority: "critical",
        why: "הקטגוריה הראשית קובעת באילו חיפושים הכרטיס בכלל יופיע.",
        how: [
          "בחרו קטגוריה ראשית שמתאימה לתחום שזוהה: מזון ומשקאות.",
          "בחרו מהרשימה של גוגל את הקטגוריה המדויקת ביותר, לא את הרחבה ביותר.",
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
        why: "את התמונות רואים לפני שמחליטים אם להתקשר. תמונות אמיתיות של העסק עובדות טוב יותר מתמונות מאגר שלא קשורות אליו.",
        how: [
          "העלו תמונות של המקום מבחוץ ומבפנים, של הצוות ושל העבודה עצמה.",
          "השתמשו בתמונות שצילמתם, לא בתמונות מהאינטרנט.",
          "הוסיפו תמונות חדשות כל חודש. כרטיס שלא מתעדכן נראה כמו עסק שנסגר.",
        ],
      },
      {
        id: "reviews",
        title: "ביקורות",
        priority: "critical",
        why: "את הביקורות רוב האנשים קוראים לפני שהם יוצרים קשר. וגם גוגל לומד מהן על העסק.",
        how: [
          "בקשו ביקורת מיד אחרי רגע טוב: בסוף תיקון, בסוף טיפול, במסירה.",
          "בקשו בפנים או בוואטסאפ, עם קישור ישיר לטופס הביקורת של הכרטיס.",
          "אל תכתבו ביקורות בעצמכם ואל תקנו ביקורות. גוגל מסנן אותן, והנזק גדול מהתועלת.",
        ],
      },
    ],
    notes: [
      "הכרטיס של העסק בגוגל הוא בחינם: לא משלמים לגוגל על חשיפה, ולא מתחרים במכרז על מקום.",
      "אין לנו גישה לכרטיס שלכם, ואנחנו לא יודעים אם הוא קיים או מאומת. זו רשימת פעולות, לא דוח מצב.",
      "אם הכרטיס כבר קיים ומאומת, התחילו מהקטגוריה, השעות, התמונות והביקורות. אלה משפיעים ישירות על מי שמגיע אליכם.",
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
      intent_label: "מחפשים את שם העסק",
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
      intent_label: "מחפשים את שם העסק",
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
      intent_label: "משווים",
      source: "autocomplete",
      matched: ["הכי טוב"],
    },
    {
      term: "איך מכינים מחמצת",
      intent: "informational",
      intent_label: "מחפשים מידע",
      source: "autocomplete",
      matched: ["איך"],
    },
    { term: "מחמצת ביתית מתכון", intent: "general", intent_label: "כללי", source: "autocomplete", matched: [] },
    { term: "חלות לשישי", intent: "general", intent_label: "כללי", source: "autocomplete", matched: [] },
    {
      term: "חלות שישי משלוח",
      intent: "transactional",
      intent_label: "רוצים לקנות",
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
      intent_label: "רוצים לקנות",
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
      intent_label: "משווים",
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
      why: "מקום 14.2 בחיפוש, עם 240 חשיפות. זה קרוב לעמוד הראשון: כותרת, עמוד או טקסט טובים יותר יכולים להקפיץ אתכם למעלה בלי לשלם על קליקים.",
    },
    {
      query: "מאפייה מומלצת",
      clicks: 6,
      impressions: 143,
      ctr: 0.042,
      position: 12.8,
      why: "מקום 12.8 בחיפוש, עם 143 חשיפות. זה קרוב לעמוד הראשון: כותרת, עמוד או טקסט טובים יותר יכולים להקפיץ אתכם למעלה בלי לשלם על קליקים.",
    },
    {
      query: "מחיר חלות",
      clicks: 3,
      impressions: 118,
      ctr: 0.0254,
      position: 11.6,
      why: "מקום 11.6 בחיפוש, עם 118 חשיפות. זה קרוב לעמוד הראשון: כותרת, עמוד או טקסט טובים יותר יכולים להקפיץ אתכם למעלה בלי לשלם על קליקים.",
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
      note: "ההשלמות האוטומטיות של גוגל: ביטויים אמיתיים שאנשים מקלידים. אלה ביטויים בלבד, בלי מספר חיפושים.",
    },
    search_console: {
      connected: true,
      site_url: "https://lechem-tom.example.co.il/",
      period: { start: "2026-08-16", end: "2026-09-12", days: 28 },
      note: "מחובר: אלה חיפושים אמיתיים שהאתר כבר מופיע בהם, עם קליקים, חשיפות ומיקום אמיתיים מגוגל.",
    },
    search_volumes: {
      available: false,
      note: "אין לנו גישה לכלי תכנון המילים של גוגל (Keyword Planner), ולכן אין לנו כמה אנשים מחפשים כל ביטוי בחודש. כל מספר כזה היה מומצא. מה שכן יש: ביטויים אמיתיים שאנשים מקלידים, ונתונים מ-Search Console אם הוא מחובר.",
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

// The explicit demo includes the same stored-plan artifact created by /start.
// Fixtures load lazily; real accounts never run this builder.
let demoPlanReady: Promise<void> | null = null;
let demoPlanSavedAt: string | null = null;
async function ensureDemoPlan() {
  if (DEMO_BUSINESS.quarter_plan) return;
  demoPlanReady ??= (async () => {
    const [{ mockQuarterPlan }, { planForApi }] = await Promise.all([import("./quarterPlanMock"), import("./quarterPlan")]);
    const draft: OnboardingDraft = {
      business_name: DEMO_BUSINESS.name, business_type: DEMO_BUSINESS.business_type,
      offerings: DEMO_BUSINESS.offerings || "", business_model: "products", grow_where: "online",
      audiences: DEMO_AUDIENCES_SEED.map(a => ({ name: a.name, description: a.description })),
      links: { website: DEMO_BUSINESS.website_url, instagram: DEMO_BUSINESS.social_links?.instagram, facebook: DEMO_BUSINESS.social_links?.facebook },
      budget: { range: "3k-7k", exact_ils: DEMO_BUSINESS.monthly_budget_ils }, success: { kpi: "online_orders" },
    };
    const plan = planForApi(mockQuarterPlan(draft, {
      title: "לקוחות חוזרים, ביקוש צפוי", approach_he: "לבנות הרגל של הזמנה מראש אצל לקוחות המאפייה.",
      audience: draft.audiences[0]?.name || "תושבי השכונה", goal_he: "יותר הזמנות מראש באתר",
      why_he: "הזמנות מוקדמות עוזרות לתכנן את האפייה. בודקים את הביקוש לפני שמגדילים את הפרסום.",
      first_steps: ["לחבר מדידה", "לבחור מוצרים וחומרי גלם עם בעל העסק"],
    }, { cadence: "1-2" }, []));
    // The bakery's own two hypotheses (the ones Today lists), so the plan, Today and their
    // statuses tell one story.
    plan.assumptions = DEMO_ASSUMPTIONS.map((item) => ({ ...item }));
    DEMO_BUSINESS.quarter_plan = plan; DEMO_STRATEGY.quarter_plan = plan;
    DEMO_STRATEGY.hypothesis_review = demoHypothesisReview();
  })();
  await demoPlanReady;
}

const DEMO_ASSUMPTIONS = [
  { bet_he: "אנחנו מניחים שהזמנות מראש לחגים יביאו יותר הזמנות באתר מפוסטים של מוצר מוכן.", if_wrong_he: "נעבור למבצע בחנות." },
  { bet_he: "רילס מהתנור בבוקר יביא יותר שמירות ושיתופים מתמונות מדף.", if_wrong_he: "נחזור לתמונות מוצר." },
];

/**
 * Where the demo month's tests stand, in the server's shape (`review_view` in
 * api/app/services/hypotheses.py). Every status is on screen somewhere: the month and its
 * WhatsApp target are on track, the shop's sales are something we cannot see (measuring),
 * one target was changed by the plan, the pre-order hypothesis held and the reels one is not
 * holding so far. The lines are the server's templates, with numbers the demo posts carry.
 */
function demoHypothesisReview(): HypothesisReview {
  const monthly = DEMO_STRATEGY.monthly_horizon_plan;
  const targets = monthly?.targets ?? [];
  const whatsapp = "96 לחיצות לוואטסאפ החודש, מול יעד של 120.";
  const items: HypothesisReviewItem[] = [];
  if (monthly?.hypothesis) {
    items.push({ key: "month", kind: "month", text_he: monthly.hypothesis, if_wrong_he: "", status: "on_track", status_he: "בדרך", evidence_he: whatsapp });
  }
  const targetStates: Pick<HypothesisReviewItem, "status" | "status_he" | "evidence_he">[] = [
    { status: "measuring", status_he: "בבדיקה", evidence_he: "את זה אנחנו לא רואים במספרים. נשאל אתכם בסיכום החודש." },
    { status: "on_track", status_he: "בדרך", evidence_he: whatsapp },
    { status: "changed", status_he: "השתנה", evidence_he: "היעד השתנה, אז מתחילים למדוד אותו מחדש." },
  ];
  targets.forEach((text, index) => {
    const state = targetStates[index] ?? targetStates[0];
    items.push({ key: `target:${index}`, kind: "target", text_he: text, if_wrong_he: "", ...state });
  });
  const assumptionStates: Pick<HypothesisReviewItem, "status" | "status_he" | "evidence_he">[] = [
    { status: "confirmed", status_he: "התאמתה", evidence_he: "3 מתוך 4 פוסטים של הזמנה מראש ומבצע הביאו יותר הזמנות באתר מהפוסטים של מוצר." },
    { status: "not_yet", status_he: "בינתיים לא", evidence_he: "רק 1 מתוך 3 רילס נשמר יותר מהפוסטים של תמונה." },
  ];
  DEMO_ASSUMPTIONS.forEach((item, index) => {
    items.push({ key: `assumption:${index}`, kind: "assumption", text_he: item.bet_he, if_wrong_he: item.if_wrong_he, ...assumptionStates[index] });
  });
  return { updated_at: "2026-09-21T06:00:00", closed: false, items };
}

/** Mix types whose post shows a real product, place or person (`PRODUCT_IMAGE_MIX`). */
const DEMO_PRODUCT_IMAGE_MIX = new Set(["product", "offer", "behind_scenes", "social_proof"]);

/**
 * Mirrors `owner_needs()` in api/app/services/connected_posts.py: a photo when the card
 * draws one and there is none, or when the post shows a real product and its picture is not
 * the owner's own (and they did not choose AI on purpose); a fact the writer flagged that the
 * owner has not gone over. Nothing once the post is approved or out.
 */
function demoOwnerNeeds(post: RoadmapPost): PostOwnerNeed[] {
  if (post.approval_status === "approved" || (post.published_url || "").trim() || post.published_at) return [];
  const needs: PostOwnerNeed[] = [];
  // A type-led post draws no photo (it keeps the one it has for a later change of design).
  if (post.overlay_theme !== "type_hero" && post.design?.text_mode !== "type_led") {
    const hasImage = Boolean((post.image_url || "").trim());
    const own = hasImage && (post.image_source === "asset" || post.image_source === "real_photo");
    const choseAi = hasImage && post.image_preference === "ai";
    const productLike = DEMO_PRODUCT_IMAGE_MIX.has(post.mix_type || "") || Boolean(post.featured_item_id);
    if (!hasImage || (productLike && !own && !choseAi)) {
      const subject = (post.featured_item_name || "").trim();
      const hint = (post.photo_hint_he || "").trim();
      needs.push({ kind: "photo", text: hint || (subject ? `תמונה של ${subject}` : "תמונה שמתאימה לפוסט") });
    }
  }
  const fact = (post.owner_fact || "").trim();
  if (fact && !post.owner_fact_done) {
    // A question for the owner ("מה המחיר?") is asked as it is.
    const text = fact.endsWith("?") ? fact : fact.startsWith("ה") ? `לבדוק את ${fact}` : `לבדוק: ${fact}`;
    needs.push({ kind: "fact", text });
  }
  return needs;
}

/* ---- The one-instruction rewrite, demo side (api/app/services/post_rewrite.py). ---- */

const DEMO_TONE_LABEL: Record<string, string> = {
  direct: "ברור יותר",
  neighborhood: "יותר חם",
  punchy: "קצר יותר",
  holiday: "אווירת חג",
  story: "סיפור קצר",
};

function demoWantsPrice(instruction: string): boolean {
  return /מחיר|כמה עולה|₪|ש"ח|ש״ח|שקל/.test(instruction);
}

/** The shekel amounts in a text, as digits ("1,200 ₪" -> "1200"). */
function demoMoney(text: string | undefined): string[] {
  const out = new Set<string>();
  for (const match of (text || "").matchAll(/₪\s*(\d[\d,]*)|(\d[\d,]*)\s*(?:₪|ש"ח|ש״ח|שקלים|שקל)/g)) {
    out.add((match[1] || match[2] || "").replace(/,/g, ""));
  }
  return [...out].filter(Boolean);
}

/** Prices the owner typed or confirmed, and the ones already in the post. */
function demoKnownPrices(post: RoadmapPost, instruction: string): string[] {
  const text = [post.title, post.hook, post.caption, post.cta, post.overlay_text].join("\n");
  return Array.from(new Set([...(post.owner_prices || []), ...demoMoney(instruction), ...demoMoney(text)]));
}

/** A canned new version per instruction: the demo cannot write, so it shows the shape. */
function demoInstructionRewrite(
  post: RoadmapPost,
  instruction: string
): Pick<RoadmapPost, "hook" | "caption" | "cta" | "overlay_text"> {
  const caption = (post.caption || "").trim();
  const firstSentence = caption.split(/(?<=[.!?])\s+|\n/)[0] || caption;
  const base = { hook: post.hook, caption, cta: post.cta, overlay_text: post.overlay_text };
  if (instruction === "קצר יותר") {
    const short = firstSentence.length > 70 ? `${firstSentence.split(/[,،]/)[0].trim()}.` : firstSentence;
    return { ...base, caption: short };
  }
  if (demoWantsPrice(instruction)) {
    const price = demoKnownPrices(post, instruction)[0];
    return demoMoney(caption).length ? base : { ...base, caption: `${caption}\nהמחיר: ${price} ₪.` };
  }
  if (instruction === "עם שאלה ללקוחות") {
    return { ...base, hook: "מה אתם הכי אוהבים לקחת מהתנור שלנו?", caption: `${caption}\nספרו לנו בתגובה.` };
  }
  // "יותר חם", and the owner's own words: a warmer opening, the same facts.
  return { ...base, caption: `בוקר טוב, שכנים. ${caption}` };
}

/**
 * A new photo brings its own empty area and subject (the server's vision pass; measured by
 * eye for the demo photos). A photo the demo has not measured has neither: the words go
 * on a band beside it.
 */
function demoDesignFor(post: RoadmapPost, url: string): RoadmapPost["design"] {
  const area = DEMO_PHOTO_AREAS[url];
  return { ...post.design, safe_area: area?.safe_area ?? null, focal: area?.focal ?? null, subject: null };
}

/** The server's compositions that can carry a photo alone (`text_modes` has photo_only). */
const DEMO_PHOTO_ONLY = new Set(["full_bleed", "inset_frame", "arch_window", "circle_crop", "collage_grid"]);

/**
 * Mirrors `sync_text_mode` (api/app/services/post_design.py): a photo-free composition is
 * type-led; the words switched off is photo only (where the composition can carry a photo
 * alone); switched on, a photo-only or missing mode becomes a headline.
 */
function demoSyncTextMode(design: RoadmapPost["design"], hasOverlay: boolean): RoadmapPost["design"] {
  if (!design?.composition) return design;
  const current = design.text_mode;
  if (design.composition === "type_led") return { ...design, text_mode: "type_led" };
  if (!hasOverlay && DEMO_PHOTO_ONLY.has(String(design.composition))) return { ...design, text_mode: "photo_only" };
  if (hasOverlay && (!current || current === "photo_only" || current === "type_led")) return { ...design, text_mode: "headline" };
  return design;
}

function cloneDemoStrategy(): StrategyPayload {
  return {
    ...DEMO_STRATEGY,
    // Like serialize_strategy: the month carries the business's Design DNA.
    brand_dna: DEMO_BUSINESS.brand_dna ?? null,
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
        ...(post.plan_link ? { plan_link: { ...post.plan_link } } : {}),
        owner_needs: demoOwnerNeeds(post),
        ...(post.measure ? { measure: { ...post.measure } } : {}),
        ...(post.results
          ? {
              results: {
                ...post.results,
                compare: post.results.compare ? { ...post.results.compare } : post.results.compare,
                matched_by: Array.isArray(post.results.matched_by) ? [...post.results.matched_by] : post.results.matched_by,
              },
            }
          : {}),
        // The server computes the state; the demo computes it the same way, on every read,
        // so approving or publishing a post moves it along.
        lifecycle: deriveLifecycle({ ...post, owner_needs: demoOwnerNeeds(post) }),
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
          ? `התמונה מתאימה לנושאים של הפוסט: ${hits.slice(0, 3).join(", ")}.`
          : `התמונה מתאימה לנושא של הפוסט: ${hits[0]}.`,
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
    "פייסבוק ואינסטגרם לא מחוברים, ולכן אין לנו גישה לדפים שלכם.",
    "כדי לפרסם אוטומטית באינסטגרם ובפייסבוק, מטא (החברה של שתיהן) צריכה לאשר את האפליקציה שלנו. " +
      "מטא נותנת הרשאת פרסום רק בסוף הבדיקה שלה, וזה לא תלוי בנו ולא בהגדרה כלשהי. " +
      "עד שהאישור יגיע, אין לנו דרך טכנית לפרסם בשמכם באף רשת.",
    "בינתיים מפרסמים ידנית: כל פוסט כאן מוכן עם כיתוב, תמונה וקישור למעקב. " +
      "העתיקו אותו לאפליקציה של אינסטגרם או פייסבוק ופרסמו משם.",
  ],
  missing: ["instagram_content_publish", "pages_manage_posts"],
  connected: { meta: false, ga4: false },
};

/** The permission names in the owner's words — `SCOPE_LABELS_HE` in the API. */
export const PUBLISH_SCOPE_LABELS: Record<string, string> = {
  instagram_content_publish: "לפרסם פוסטים בחשבון האינסטגרם העסקי",
  pages_manage_posts: "לפרסם פוסטים בעמוד הפייסבוק",
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
    // "פרסמתי" without a link is out too.
    if (brief.published_url || brief.published_at) {
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
  ["meta_ads_share_pct", "מודעות בפייסבוק ובאינסטגרם"],
  ["organic_production_share_pct", "הפקת פוסטים (בלי תשלום על חשיפה)"],
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
      if (item.is_primary) line += " (הקהל העיקרי)";
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
      `הכנסה צפויה על כל שקל בפרסום: ${expected.realistic_roas.min}-${expected.realistic_roas.max} ₪`
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
      "בתוכנית עוד אין תקציב, קהלים או יעדים, " +
        "ולכן אין כאן נתונים להעביר למי שמפרסם בשבילכם."
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
      note: "כל פוסט מתפרסם עם קישור משלו, כדי שנדע מאיזה פוסט הגיעה כל לחיצה וכל פנייה.",
    },
    warnings: [],
    assumptions: [],
    channel_note: DEMO_STRATEGY.posting_plan?.mix_note || "",
  };
  return { ...payload, text: renderDemoBrief(payload) };
}

/** A competitor link, the way the API classifies it (onboarding_draft.DraftCompetitor), roughly. */
function demoCompetitorLink(raw: string): { kind: string; link: string } {
  const value = raw.trim();
  if (!value) return { kind: "", link: "" };
  if (value.startsWith("@") || /instagram\.com/i.test(value)) {
    const handle = value.replace(/^@/, "").replace(/^.*instagram\.com\//i, "").replace(/\/.*$/, "").toLowerCase();
    return { kind: "instagram", link: `https://www.instagram.com/${handle}/` };
  }
  if (/facebook\.com/i.test(value)) return { kind: "facebook", link: value };
  if (/tiktok\.com/i.test(value)) return { kind: "tiktok", link: value };
  return { kind: "website", link: /^https?:\/\//i.test(value) ? value : `https://${value}` };
}

/** PUT /onboarding/owner-context against the demo business: the same merge rules as the API. */
function demoSaveOwnerContext(body: OwnerContextUpdate): Business {
  const context: OwnerContext = { ...(DEMO_BUSINESS.owner_context ?? {}) };
  if (typeof body.differentiator === "string") context.differentiator = body.differentiator.trim();
  if (body.seasons) {
    const busy = [...new Set(body.seasons.busy)].sort((a, b) => a - b);
    const slow = [...new Set(body.seasons.slow)].sort((a, b) => a - b);
    if (busy.some((m) => slow.includes(m))) throw new ApiError("חודש לא יכול להיות גם עמוס וגם שקט.", 422);
    context.seasons = { busy, slow };
  }
  if (body.tried) {
    context.tried = {
      channels: [...new Set(body.tried.channels)],
      what_worked: body.tried.what_worked ?? context.tried?.what_worked ?? "",
    };
  }
  if (body.activity) {
    const activity = { ...(context.activity ?? {}) };
    for (const network of ["instagram", "facebook", "tiktok"] as const) {
      if (!(network in body.activity)) continue;
      const value = body.activity[network];
      if (value) activity[network] = value;
      else delete activity[network];
    }
    context.activity = activity;
  }
  if (body.competitors) {
    if (body.competitors.length > 3) throw new ApiError("אפשר לשמור עד 3 מתחרים, ולכל אחד צריך שם.", 422);
    const seen = new Set<string>();
    const list = body.competitors
      .map((item) => ({ name: item.name.trim(), ...demoCompetitorLink(item.link ?? "") }))
      .filter((item) => item.name.length >= 2 && !seen.has(item.name) && Boolean(seen.add(item.name)));
    context.competitors = list;
    DEMO_BUSINESS.competitors = list.map((item) => ({
      name: item.name,
      website_url: item.kind === "website" ? item.link : "",
    }));
  }
  DEMO_BUSINESS.owner_context = context;
  return DEMO_BUSINESS;
}

/**
 * Resolves a request against the in-memory demo fixtures.
 *
 * Async because a few demo routes (the site scan, re-describing an asset) have to feel
 * like the real work they stand in for — an instantly-resolved list would hide every
 * loading state the screens are supposed to prove. Callers already await `api()`.
 */
/** WCAG contrast of two hex colours, for the demo's copy of the server's colour rule. */
function demoContrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const h = hex.replace("#", "");
    const [r, g, bl] = [0, 2, 4].map((i) => {
      const v = parseInt(h.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

async function demoResolve<T>(path: string, options: RequestInit = {}): Promise<T> {  const method = (options.method || "GET").toUpperCase();
  if (path === "/auth/me") return DEMO_USER as T;
  if (path === "/auth/logout" && method === "POST") {
    exitDemo();
    return { ok: true } as T;
  }
  if (path === "/onboarding/me") { await ensureDemoPlan(); return { business: DEMO_BUSINESS } as T; }
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
  if (path === "/onboarding/owner-context" && method === "PUT") {
    return { business: demoSaveOwnerContext(JSON.parse(String(options.body || "{}")) as OwnerContextUpdate) } as T;
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
    if (!base) throw new ApiError("בדמו אין עדיין תוכנית.", 500);
    // Echo the owner's ranking back so step 4 demonstrably changes the quarter plan.
    return {
      long_horizon_plan: {
        ...base,
        targets: ranked.length ? ranked : [...base.targets],
        milestones: base.milestones.map((m) => ({ ...m })),
      },
    } as T;
  }
  // The Design DNA (api/app/routers/brand_dna.py). The real first read builds the DNA and
  // can take seconds; the demo waits a little so the brand page's loading state is real.
  if (path === "/brand/dna" && method === "GET") {
    await new Promise((resolve) => window.setTimeout(resolve, 600));
    return { brand_dna: DEMO_BUSINESS.brand_dna ?? null, business_id: DEMO_BUSINESS.id } as T;
  }
  if (path === "/brand/dna" && method === "PUT") {
    const edit = JSON.parse(String(options.body || "{}")) as BrandDnaEdit;
    const current = DEMO_BUSINESS.brand_dna ?? DEMO_DNA;
    // Choices in words first ("יותר שקט", "יותר תמונה"): the server re-derives the genes
    // from them and stores the result at once, like a regeneration that keeps the style.
    if (edit.adjust && (edit.adjust.tone || edit.adjust.text)) {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      const adjusted = adjustDna(current, edit.adjust);
      DEMO_BUSINESS.brand_dna = adjusted;
      return { brand_dna: adjusted, business_id: DEMO_BUSINESS.id } as T;
    }
    const next: BrandDna = structuredClone(current);
    const locked = new Set(current.locked ?? []);
    if (edit.type && Object.keys(edit.type).length) {
      next.type = { ...next.type, ...edit.type };
      locked.add("type");
    }
    if (edit.motif && Object.keys(edit.motif).length) {
      next.motif = { ...next.motif, ...edit.motif };
      locked.add("motif");
    }
    if (edit.colors && Object.keys(edit.colors).length) {
      const colors = { ...next.colors, ...edit.colors };
      // Same rule as the server (MIN_TEXT_CONTRAST).
      if (demoContrast(colors.ink, colors.paper) < 4.5) {
        throw new ApiError("צבע הטקסט לא נקרא על צבע הרקע. בחרו טקסט כהה יותר או רקע בהיר יותר.", 422);
      }
      next.colors = colors;
      locked.add("colors");
    }
    if (edit.keep) locked.add("all");
    if (locked.size) next.locked = [...locked].sort();
    DEMO_BUSINESS.brand_dna = next;
    return { brand_dna: next, business_id: DEMO_BUSINESS.id } as T;
  }
  if (path === "/brand/dna/regenerate" && method === "POST") {
    // Feels like the real call (a model picks within the business's signals) and walks
    // through hand-made alternatives. Like the server it is stored at once, keeps the
    // genes the owner set, and clears "kept" (the owner is trying something else).
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    // The plan gate (402 `plan_required`). The demo account is on its free month, so it
    // only answers this way when asked to: localStorage `isramarket_demo_plan` = "locked".
    if (window.localStorage.getItem("isramarket_demo_plan") === "locked") {
      throw new ApiError("כדי לנסות סגנון אחר צריך מנוי פעיל.", 402, "plan_required");
    }
    const current = DEMO_BUSINESS.brand_dna ?? DEMO_DNA;
    const cycle = [...DEMO_DNA_ALTERNATIVES, DEMO_DNA];
    const at = cycle.findIndex((dna) => dna.seed === current.seed);
    const next: BrandDna = structuredClone(cycle[(at + 1) % cycle.length]);
    const genes = (current.locked ?? []).filter((gene) => gene === "type" || gene === "motif" || gene === "colors");
    for (const gene of genes) {
      if (gene === "type") next.type = structuredClone(current.type);
      if (gene === "motif") next.motif = structuredClone(current.motif);
      if (gene === "colors") next.colors = structuredClone(current.colors);
    }
    next.locked = genes.length ? genes : undefined;
    next.created_at = new Date().toISOString();
    DEMO_BUSINESS.brand_dna = next;
    return { brand_dna: next, business_id: DEMO_BUSINESS.id } as T;
  }
  if (path === "/brand/dna/library") return DNA_LIBRARY as T;
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
  if (path === "/onboarding/generate" && method === "POST") {
    return { done: true, job: DEMO_GENERATION_DONE, strategy: cloneDemoStrategy() } as T;
  }
  if (path === "/onboarding/generate/status") return DEMO_GENERATION_DONE as T;
  if (path === "/onboarding/posts/start" && method === "POST") return { ...DEMO_GENERATION_DONE, kind: "posts" } as T;
  if (path === "/strategy/edit") {
    await ensureDemoPlan();
    const plan = DEMO_BUSINESS.quarter_plan!;
    const revision = DEMO_STRATEGY.plan_revision ?? 0;
    const version = String(revision).padStart(64, "0");
    const fields: PlanEditFields = {
      direction: plan.strategy.one_liner_he,
      audience: plan.audiences?.find(a => a.role === "primary")?.name ?? DEMO_AUDIENCES[0]?.name ?? "",
      assumptions: plan.assumptions.map(a => ({ ...a })),
    };
    if (method === "PATCH") {
      const body = JSON.parse(String(options.body || "{}")) as PlanEditFields & { version: string };
      if (body.version !== version) throw new ApiError("התוכנית עודכנה בינתיים. בדקו את העדכון לפני שמירה.", 409);
      const updated = { direction: body.direction.trim(), audience: body.audience.trim(), assumptions: body.assumptions.map(a => ({ bet_he: a.bet_he.trim(), if_wrong_he: a.if_wrong_he.trim() })) };
      if (!updated.direction || !updated.audience || updated.direction.length > 300 || updated.audience.length > 160 || updated.assumptions.length > 4 || updated.assumptions.some(a => !a.bet_he || a.bet_he.length > 300 || a.if_wrong_he.length > 300)) throw new ApiError("מלאו כיוון וקהל וקצרו שדות שחורגים מהמגבלה.", 422);
      if (JSON.stringify(fields) !== JSON.stringify(updated)) {
        plan.strategy = { ...plan.strategy, one_liner_he: updated.direction, angle_he: updated.direction !== fields.direction ? "" : plan.strategy.angle_he, from_insight: updated.direction !== fields.direction ? undefined : plan.strategy.from_insight, why_he: "התוכנית עודכנה על ידכם.", based_on: "עדכון שלכם" };
        plan.audiences = [{ name: updated.audience, role: "primary", message_he: "" }, ...(plan.audiences ?? []).filter(a => a.role !== "primary").slice(0, 3)];
        plan.assumptions = updated.assumptions;
        DEMO_STRATEGY.usp.growth_hypothesis = updated.direction;
        DEMO_STRATEGY.roadmap.summary = updated.direction;
        for (const monthly of [DEMO_STRATEGY.monthly_horizon_plan, DEMO_STRATEGY.roadmap.monthly_horizon_plan]) if (monthly) monthly.hypothesis = updated.direction;
        DEMO_STRATEGY.plan_revision = revision + 1;
        demoPlanSavedAt = new Date().toISOString();
      }
      return demoResolve<T>("/strategy/edit");
    }
    return { business_id: DEMO_BUSINESS.id, strategy_id: DEMO_STRATEGY.id, available: true, blocked: false, version, revision, saved_at: demoPlanSavedAt, fields } as T;
  }
  if (path === "/strategy/current") { await ensureDemoPlan(); return cloneDemoStrategy() as T; }
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
    const body = JSON.parse(String(options.body || "{}")) as {
      post_index?: number;
      image_preference?: "real" | "ai";
    };
    const index = body.post_index ?? 0;
    if (!POSTS[index]) throw new ApiError("הפוסט לא נמצא", 404);
    const generated: RoadmapPost = {
      ...POSTS[index],
      image_url: DEMO_IMAGES[index] || DEMO_IMAGES[0],
      // Same as the real route: a regenerated image is no longer the owner's own library
      // file, so the asset it replaced must not stay attached to the post.
      image_source: body.image_preference === "real" ? "real_photo" : "generated",
      image_source_url: "",
      image_action: body.image_preference === "real" ? "real_photo" : "generated",
      // Choosing AI on purpose meets a photo need, the way the server records it.
      ...(body.image_preference ? { image_preference: body.image_preference } : {}),
      design: demoDesignFor(POSTS[index], DEMO_IMAGES[index] || DEMO_IMAGES[0]),
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
    if (!asset) throw new ApiError("לא מצאנו את התמונה הזו", 404);
    POSTS[index] = {
      ...POSTS[index],
      image_url: asset.url,
      image_source: "asset",
      image_asset_id: asset.id,
      image_source_url: asset.source_url || "",
      image_action: "asset",
      design: demoDesignFor(POSTS[index], asset.url),
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
    if (audienceId !== null && !audience) throw new ApiError("לא מצאנו את הקהל הזה", 404);
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
      composition?: string;
      text_position?: string;
    };
    const index = body.post_index ?? 0;
    if (!POSTS[index]) throw new ApiError("הפוסט לא נמצא", 404);
    // The result follows the business's DNA: the composition asked for, or the next of the
    // DNA's own compositions; the words stay, the way the real designer reads the DNA.
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    const dnaCompositions = DEMO_BUSINESS.brand_dna?.compositions ?? [];
    const current = POSTS[index].design?.composition;
    const vibe = body.vibe || "";
    const next =
      body.composition ||
      ((dnaCompositions as string[]).includes(vibe)
        ? vibe
        : dnaCompositions[(Math.max(-1, dnaCompositions.indexOf(current ?? "")) + 1) % Math.max(1, dnaCompositions.length)]);
    const prompt = (body.custom_prompt || "").trim();
    POSTS[index] = {
      ...POSTS[index],
      has_overlay: true,
      overlay_headline: POSTS[index].overlay_headline || POSTS[index].overlay_text || POSTS[index].title.slice(0, 24),
      // A new design keeps the photo, and with it the photo's empty area and subject.
      design: next
        ? {
            ...POSTS[index].design,
            composition: next,
            text_mode: next === "type_led" ? "type_led" : "headline",
            text_position: body.text_position || "",
            crop: POSTS[index].format === "reel" || POSTS[index].format === "story" ? "9:16" : "4:5",
          }
        : POSTS[index].design,
      creative_concept: prompt ? `לפי מה שביקשתם: ${prompt}` : POSTS[index].creative_concept,
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
      // Mirrors the API's save_post: the saved caption is also the primary outlet's own.
      outlet_captions:
        body.caption !== undefined
          ? {
              ...POSTS[index].outlet_captions,
              [body.primary_outlet || POSTS[index].primary_outlet || "instagram"]: body.caption,
            }
          : POSTS[index].outlet_captions,
      cta: body.cta !== undefined ? body.cta : POSTS[index].cta,
      has_overlay,
      overlay_headline: headline,
      overlay_badge: body.overlay_badge !== undefined ? body.overlay_badge : (POSTS[index].overlay_badge || ""),
      overlay_position: body.overlay_position || POSTS[index].overlay_position || "bottom_pill",
      // Like the server: the old field changes only when it is sent.
      overlay_theme: body.overlay_theme !== undefined ? body.overlay_theme : POSTS[index].overlay_theme,
      // Like the server (save_post): the composition changes, the photo's measured empty
      // area and subject stay (the photo did not change), and the text mode follows the
      // composition and the words switch (`sync_text_mode`), not what the editor sent.
      design: demoSyncTextMode(
        body.design?.composition
          ? {
              ...POSTS[index].design,
              ...body.design,
              text_mode: POSTS[index].design?.text_mode,
              safe_area: POSTS[index].design?.safe_area ?? null,
              focal: POSTS[index].design?.focal ?? null,
              subject: POSTS[index].design?.subject ?? null,
              crop: (body.format || POSTS[index].format) === "reel" || (body.format || POSTS[index].format) === "story" ? "9:16" : "4:5",
            }
          : POSTS[index].design,
        has_overlay,
      ),
      // The one short line goes with the words: off clears it.
      overlay_sub: !has_overlay ? "" : body.overlay_sub !== undefined ? body.overlay_sub : POSTS[index].overlay_sub,
      overlay_text: has_overlay ? headline : "",
      creative_concept: body.creative_concept || POSTS[index].creative_concept,
      visual_style: body.visual_style || POSTS[index].visual_style,
      date_hint: body.date_hint || POSTS[index].date_hint,
      primary_outlet: body.primary_outlet || POSTS[index].primary_outlet,
      outlets: body.outlets || POSTS[index].outlets,
      approval_status: "review",
      approved_at: null,
      // Like the server: the owner went over the text, so the fact we asked about is theirs,
      // the prices in it are confirmed, and "שונה לפי" is over.
      ...(POSTS[index].owner_fact ? { owner_fact_done: true } : {}),
      owner_prices: Array.from(
        new Set([...(POSTS[index].owner_prices || []), ...demoMoney(body.caption ?? POSTS[index].caption)])
      ),
      rewrite_instruction: null,
    };
    DEMO_STRATEGY.roadmap.posts = POSTS;
    return { post: { ...POSTS[index] }, strategy: cloneDemoStrategy() } as T;
  }
  if (path === "/strategy/posts/rewrite" && method === "POST") {
    // Mirrors the API's one-instruction rewrite (docs/posts-v2.md, Phase C): a chip or the
    // owner's own words; "להוסיף מחיר" with no known price leaves the post as it is and asks.
    const body = JSON.parse(String(options.body || "{}")) as { post_index?: number; tone?: string; instruction?: string };
    const index = body.post_index ?? 0;
    if (!POSTS[index]) throw new ApiError("הפוסט לא נמצא", 404);
    const instruction = (body.instruction || "").replace(/\s+/g, " ").trim().slice(0, 200);
    const tone = body.tone || "";
    if (!instruction && !tone) throw new ApiError("כתבו מה לשנות בפוסט.", 422);
    const label = instruction ? (instruction.length <= 40 ? instruction : "הבקשה שלכם") : DEMO_TONE_LABEL[tone] || "";
    const current = POSTS[index];
    if (demoWantsPrice(instruction)) {
      const known = demoKnownPrices(current, instruction);
      if (!known.length) {
        POSTS[index] = {
          ...current,
          owner_fact: "מה המחיר?",
          owner_fact_done: false,
          approval_status: "review",
          approved_at: null,
          rewrite_instruction: null,
        };
        DEMO_STRATEGY.roadmap.posts = POSTS;
        return {
          post: { ...POSTS[index] },
          strategy: cloneDemoStrategy(),
          changed: false,
          message: "לא מצאנו מחיר שאישרתם, אז הפוסט נשאר כמו שהוא. כתבו את המחיר במילים שלכם, למשל: להוסיף מחיר 45 ₪.",
          instruction: label,
        } as T;
      }
    }
    let next: Pick<RoadmapPost, "hook" | "caption" | "cta" | "overlay_text">;
    if (instruction) {
      next = demoInstructionRewrite(current, instruction);
    } else {
      const rewrites: Record<string, { hook: string; caption: string; cta: string; overlay_text: string }> = {
        direct: {
          hook: "צריכים חלות לשולחן החג? ההזמנות נסגרות הערב.",
          caption: "בלי תור של שישי ובלי הפתעות. שלחו לנו וואטסאפ, ונשמור לכם חלה לערב החג.",
          cta: "להזמנה בוואטסאפ",
          overlay_text: "ההזמנות נסגרות הערב",
        },
        neighborhood: {
          hook: "בשישי בבוקר הריח מהמאפייה מגיע עד השוק.",
          caption: "שמרנו לכם בצד חלה קלועה, עוד חמה, עם קרום שמתפצח. עברו אצלנו בדרך לשוק וקחו אותה.",
          cta: "קפצו לדלפק",
          overlay_text: "חם מהתנור",
        },
        punchy: {
          hook: "חלה חמה. אפס תורים. שישי ביפו.",
          caption: "מזמינים ב-10 שניות בוואטסאפ ואוספים בדקה אחת.",
          cta: "הקישור בפרופיל",
          overlay_text: "בלי תור",
        },
        holiday: {
          hook: "חלה עגולה, דבש, ושנה טובה על השולחן.",
          caption: "ערב החג מתקרב, והתנורים עובדים בלי הפסקה. שריינו חלה עגולה עכשיו, כדי שלא תישארו בלי.",
          cta: "שריינו חלה לחג",
          overlay_text: "שנה מתוקה",
        },
        story: {
          hook: "סבא שלי תמיד אמר שהלחם הכי טוב הוא זה שאופים באור ראשון.",
          caption: "כל בוקר ב-04:00 אנחנו מדליקים את התנור הגדול ביפו, ולשים את המחמצת בדיוק כמו שסבא לימד.",
          cta: "פתוחים מ-07:00",
          overlay_text: "מאחורי הלחם",
        },
      };
      next = rewrites[tone] || rewrites.direct;
    }
    const channel = current.channel || current.primary_outlet || "instagram";
    const typed = demoMoney(instruction);
    POSTS[index] = {
      ...current,
      ...next,
      outlet_captions: { ...(current.outlet_captions || {}), [channel]: next.caption },
      approval_status: "review",
      approved_at: null,
      rewrite_instruction: label || null,
      ...(typed.length
        ? { owner_prices: Array.from(new Set([...(current.owner_prices || []), ...typed])), owner_fact_done: true }
        : {}),
    };
    DEMO_STRATEGY.roadmap.posts = POSTS;
    return { post: { ...POSTS[index] }, strategy: cloneDemoStrategy(), changed: true, message: null, instruction: label } as T;
  }
  if (path === "/strategy/posts/approve" && method === "POST") {
    const body = JSON.parse(String(options.body || "{}")) as { post_index?: number; approved?: boolean };
    const index = body.post_index ?? 0;
    if (!POSTS[index]) throw new ApiError("הפוסט לא נמצא", 404);
    POSTS[index] = {
      ...POSTS[index],
      approval_status: body.approved === false ? "review" : "approved",
      approved_at: body.approved === false ? null : new Date().toISOString(),
      ...(body.approved !== false && POSTS[index].owner_fact ? { owner_fact_done: true } : {}),
      ...(body.approved !== false ? { rewrite_instruction: null } : {}),
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
        description: `ל-${readyCount} מתוך ${POSTS.length} פוסטים יש כבר תמונה בסגנון של האתר`,
        action_label: "לעבור לפוסטים",
        action_tab: "posts",
        status: readyCount === POSTS.length ? "ready" : "action_required",
      },
      {
        id: "brand-sync",
        type: "brand",
        title: "הצבעים והסגנון מהאתר",
        description: `5 צבעים, סגנון צילום חם ושכונתי וסגנון כתיבה, מהאתר של לחם תום`,
        action_label: "לראות את הסגנון",
        action_tab: "brand",
        status: "ready",
      },
      {
        id: "hypothesis-approval",
        type: "checkpoint",
        title: "ההשערה של החודש",
        description: strat.monthly_horizon_plan?.hypothesis || "ההשערה של ספטמבר מוכנה לבדיקה",
        action_label: isApproved ? "ההשערה אושרה ✓" : "לאשר את ההשערה",
        action_tab: "schedule",
        status: isApproved ? "ready" : "action_required",
      },
    ];
    return {
      strategy: strat,
      studio_updates: updates,
      long_horizon_tracker: {
        horizon: strat.long_horizon_plan?.horizon || "סתיו–חורף 2026",
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
        what_we_measure: "פניות בוואטסאפ, הזמנות מהאתר ואיסוף חלות בימי שישי",
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
        ? `הצענו ${generated.length} קהלים. לא נוצרו כפילויות.`
        : manual.length === 1
          ? `הצענו ${generated.length} קהלים. הקהל שהגדרתם ידנית נשאר כמו שהוא.`
          : `הצענו ${generated.length} קהלים. הקהלים שהגדרתם ידנית (${manual.length}) נשארו כמו שהם.`,
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
    if (!target) throw new ApiError("לא מצאנו את הקהל הזה", 404);
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
    if (!current) throw new ApiError("לא מצאנו את הקהל הזה", 404);
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
    if (!target) throw new ApiError("לא מצאנו את הקהל הזה", 404);
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
        ? `הקהל '${target.name}' נמחק. עכשיו '${promoted.name}' הוא הקהל העיקרי.`
        : `הקהל '${target.name}' נמחק.`,
    } as T;
  }
  if (path.startsWith("/instagram/brief") && method === "GET") return demoInstagramBrief() as T;
  if (path === "/instagram/handles" && method === "PUT") {
    const body = JSON.parse(String(options.body || "{}")) as { handles?: string[] };
    const handles: string[] = [];
    for (const raw of body.handles || []) {
      if (typeof raw !== "string" || !raw.trim()) continue;
      const handle = demoNormalizeHandle(raw);
      if (!handles.includes(handle)) handles.push(handle);
    }
    if (handles.length > 5) {
      throw new ApiError(`אפשר לשמור עד 5 חשבונות אינסטגרם להשראה, והוספתם ${handles.length}.`, 422);
    }
    DEMO_IG_HANDLES = handles;
    return { handles, max_handles: 5 } as T;
  }
  if (path === "/instagram/brief/refresh" && method === "POST") {
    // A real refresh is a Meta read plus one model call; the pause keeps the loading
    // state honest in the demo rather than flashing past.
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const payload = demoInstagramBrief();
    if (!payload.meta_connected) {
      return {
        ...payload,
        refresh: {
          status: "empty",
          reason_he: "אינסטגרם לא מחובר, ולכן אין פוסטים לבדוק. חברו אותו בעמוד החיבורים, ואז רעננו את הנתונים בעמוד הביצועים.",
          competitors: payload.handles.map((handle) => ({
            handle,
            ok: false,
            error_he: `לא קראנו את @${handle}, כי אינסטגרם לא מחובר. חברו אותו בעמוד החיבורים.`,
            posts_seen: 0,
          })),
          hashtags: null,
        },
      } as T;
    }
    return {
      ...payload,
      refresh: {
        status: "created",
        reason_he: "",
        competitors: payload.handles.map((handle) => ({ handle, ok: true, error_he: "", posts_seen: 25 })),
        hashtags: null,
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
          display_name: "מאפיית לחם תום",
          connected: true,
          source_readiness: { status: "ready", note_he: "נתונים לדוגמה בלבד, ללא קריאה מחשבון אמיתי.", property_id: "properties/318491024", last_success_at: "2026-09-30T09:00:00Z", period: { start: "2026-09-02", end: "2026-09-29" } },
        },
        {
          provider: "meta",
          status: "connected",
          external_id: "10987654321",
          display_name: "לחם תום, אינסטגרם ופייסבוק",
          connected: true,
          // Read like the site row: the demo's banner promises "כשהכול מחובר".
          source_readiness: {
            status: "ready",
            note_he: "נתונים לדוגמה בלבד, ללא קריאה מחשבון אמיתי.",
            last_success_at: "2026-10-03T09:00:00Z",
            sections: {
              social: { status: "ready", note_he: "נתוני דוגמה של החשבון והפוסטים.", read_at: "2026-10-03T09:00:00Z" },
            },
          },
        },
      ],
      webhooks: [],
    } as T;
  }
  if (path === "/performance/latest" || (path === "/performance/sync" && method === "POST")) return DEMO_PERFORMANCE as T;
  if (path === "/performance/weekly" && method === "POST") {
    return { performance: DEMO_PERFORMANCE, recommendation: DEMO_RECS } as T;
  }
  // The existing public demo represents a product shop, which has no service check-in.
  if (path.startsWith("/performance/service-results")) return { enabled: false, report: null } as T;
  if (path === "/recommendations/latest" || path === "/recommendations/1" || (path === "/recommendations/generate" && method === "POST")) {
    return DEMO_RECS as T;
  }
  if (path.startsWith("/integrations/webhooks") && method === "POST") {
    return { id: 1, url: "https://hooks.zapier.com/demo", secret: "demo-secret", events: "recommendations,strategy" } as T;
  }
  if (path.includes("/ga4/start") || path.includes("/meta/start")) {
    throw new ApiError("בדמו אי אפשר לחבר חשבונות אמיתיים. זו רק תצוגה.", 400);
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
      description: `תמונה מ-${host}. בדמו אנחנו לא מורידים אותה באמת. בחשבון אמיתי נשמור אותה אצלכם ונתאר מה רואים בה.`,
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
    if (!current) throw new ApiError("לא מצאנו את התמונה הזו", 404);
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
    if (!DEMO_ASSETS.some((asset) => asset.id === id)) throw new ApiError("לא מצאנו את התמונה הזו", 404);
    DEMO_ASSETS = DEMO_ASSETS.filter((asset) => asset.id !== id);
    return { ok: true } as T;
  }
  if (path.endsWith("/describe") && path.startsWith("/assets/") && method === "POST") {
    const id = Number(path.slice("/assets/".length, -"/describe".length));
    const current = DEMO_ASSETS.find((asset) => asset.id === id);
    if (!current) throw new ApiError("לא מצאנו את התמונה הזו", 404);
    // Deterministic per id, so re-running on the same asset visibly changes something
    // without pretending a second AI pass happened.
    const pass = (current.tags.filter((tag) => tag.startsWith("תיאור ")).length || 0) + 1;
    const updated: Asset = {
      ...current,
      description: `${current.description} (תיאור ${pass}: הוספנו פרטים על המרקם, האור והעונה.)`,
      tags: [...current.tags.filter((tag) => !tag.startsWith("תיאור ")), `תיאור ${pass}`],
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
    // meets after they have already posted by hand. Same contract as the API ("פרסמתי"):
    // the link is optional, the first call sets the time and a later link keeps it.
    const body = JSON.parse(String(options.body || "{}")) as {
      post_index?: number;
      published_url?: string;
    };
    const index = body.post_index ?? 0;
    if (!POSTS[index]) throw new ApiError("הפוסט לא נמצא בתוכנית", 404);
    const url = (body.published_url || "").trim();
    if (url && !/^https?:\/\//.test(url)) throw new ApiError("הקישור צריך להתחיל ב-https://", 422);
    POSTS[index] = {
      ...POSTS[index],
      ...(url ? { published_url: url } : {}),
      published_at: POSTS[index].published_at || new Date().toISOString(),
    };
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
      throw new ApiError("התאריך לא תקין. הזינו תאריך כמו 2026-03-15 (שנה-חודש-יום).", 400);
    }
    if (raw && Number.isNaN(Date.parse(`${raw}T00:00:00`))) {
      throw new ApiError("התאריך לא תקין. הזינו תאריך כמו 2026-03-15 (שנה-חודש-יום).", 400);
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
  "/auth/password/set",
  "/auth/account",
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
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...options,
      credentials: "include",
      headers,
    });
  } catch (err) {
    // A cancelled request stays a cancellation; anything else here is the network
    // ("Failed to fetch"), never an answer from the server. Same error shape, status 0.
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(NETWORK_ERROR_HE, 0, "network");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const coded = errorCode(data);
    throw new ApiError(coded.message || formatDetail(data.detail, res.statusText), res.status, coded.code);
  }
  return data as T;
}

export const endpoints = {
  me: () => api<AuthUser>("/auth/me"),
  register: (body: { email: string; password: string; full_name?: string }) =>
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
  /** A first password for an account opened with Google (409 when it already has one). */
  setPassword: (new_password: string) =>
    api<{ ok: boolean }>("/auth/password/set", { method: "POST", body: JSON.stringify({ new_password }) }),
  /**
   * Irreversible: deletes the account, the business and every file, then signs out.
   * Confirmed by the password, or by the account's email for a Google-only account.
   */
  deleteAccount: (confirm: { password?: string; confirm_email?: string }) =>
    api<{ ok: boolean }>("/auth/account", { method: "DELETE", body: JSON.stringify(confirm) }),
  logout: async () => {
    exitDemo();
    return api("/auth/logout", { method: "POST" });
  },
  business: () => api<{ business: Business | null }>("/onboarding/me"),
  saveProfile: (body: OnboardingPayload) =>
    api<{ business: Business }>("/onboarding/profile", { method: "POST", body: JSON.stringify(body) }),
  /** Change some of what the owner told us at /start. Answers like /onboarding/me. */
  saveOwnerContext: (body: OwnerContextUpdate) =>
    api<{ business: Business }>("/onboarding/owner-context", { method: "PUT", body: JSON.stringify(body) }),
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
  /** The business's Design DNA. The first read builds it (up to ~12 s on a real account). */
  brandDna: () => api<{ brand_dna: BrandDna | null; business_id?: number }>("/brand/dna"),
  /** "לנסות סגנון אחר": a new DNA from the same signals, stored at once. Genes the owner
   *  set stay. Billing-gated, like every generation. */
  regenerateBrandDna: () =>
    api<{ brand_dna: BrandDna; business_id?: number }>("/brand/dna/regenerate", { method: "POST" }),
  /** The owner's own fonts, motif or colours (each one then locked), or `keep` ("לשמור"). */
  editBrandDna: (edit: BrandDnaEdit) =>
    api<{ brand_dna: BrandDna; business_id?: number }>("/brand/dna", { method: "PUT", body: JSON.stringify(edit) }),
  /** The keys the renderer can draw (fonts, compositions, motifs, signatures). No account needed. */
  brandDnaLibrary: () => api<DnaLibrary>("/brand/dna/library"),
  previewScan: (website_url: string) =>
    api<{ scan: ScanPayload }>("/onboarding/preview-scan", {
      method: "POST",
      body: JSON.stringify({ website_url }),
    }),
  hypotheses: () => api<{ hypotheses: GrowthHypothesis[] }>("/onboarding/hypotheses", { method: "POST" }),
  targets: () => api<{ targets: GrowthTargetCandidate[] }>("/onboarding/targets", { method: "POST" }),
  longHorizonPlan: () =>
    api<{ long_horizon_plan: LongHorizonPlan }>("/onboarding/plan", { method: "POST" }),
  /** Starts (or joins) the first month's background build and answers at once; poll
   *  `generationStatus` for its progress. See lib/useMonthBuild.ts. */
  generate: () => api<GenerateResult>("/onboarding/generate", { method: "POST" }),
  /** Same, for the month after the active one. `done` at once when it already exists. */
  generateNextMonth: () => api<GenerateResult>("/strategy/next-month", { method: "POST" }),
  /** The business's month build (first month, its posts, or next month): stage, label, error. */
  generationStatus: () => api<GenerationStatus>("/onboarding/generate/status"),
  /** Write the month's posts in the background: one week, or every week still pending
   *  (Revision 8: once the owner chose what to feature). Answers with the status. */
  startPosts: (week?: 1 | 2 | 3 | 4) =>
    api<GenerationStatus>("/onboarding/posts/start", {
      method: "POST",
      body: JSON.stringify(week ? { week } : {}),
    }),
  strategy: () => api<StrategyPayload>("/strategy/current"),
  editablePlan: () => api<PlanEditPayload>("/strategy/edit"),
  savePlanEdit: (version: string, fields: PlanEditFields) =>
    api<PlanEditPayload>("/strategy/edit", { method: "PATCH", body: JSON.stringify({ version, ...fields }) }),
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
  /** One instruction (a chip's words or the owner's own, at most 200 characters), or the
   *  older tone. `changed: false` with a `message` when the post stayed as it was (no known
   *  price for "להוסיף מחיר", or a confirmed fact would have been lost). */
  rewritePost: (post_index: number, request: PostRewriteRequest) =>
    api<PostRewriteResult>("/strategy/posts/rewrite", {
      method: "POST",
      body: JSON.stringify({ post_index, ...request }),
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
  metaStart: (ads = false, popup = false) => api<{ url: string; attempt: string }>(`/integrations/meta/start?ads=${ads}&popup=${popup}`),
  metaAssets: () => api<MetaAssets>("/integrations/meta/assets"),
  metaPixels: (account: string) => api<{ pixels: MetaPixel[]; error: MetaReadState | null }>(`/integrations/meta/pixels?ad_account_id=${encodeURIComponent(account)}`),
  metaVerify: () => api<PixelVerification>("/integrations/meta/verify", { method: "POST" }),
  metaRead: () => api<{ integration: IntegrationsPayload["integrations"][number] }>("/integrations/meta/read", { method: "POST" }),
  ga4Property: (body: { property_id: string; display_name: string }) =>
    api<{ integration: IntegrationsPayload["integrations"][number] }>("/integrations/ga4/property", { method: "POST", body: JSON.stringify(body) }),
  ga4Read: () => api<{ integration: IntegrationsPayload["integrations"][number] }>("/integrations/ga4/read", { method: "POST" }),
  metaAccount: (body: { page_id: string; instagram_id?: string; display_name?: string; ad_account_id?: string; pixel_id?: string }) =>
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
  serviceResults: (month?: string) => api<ServiceResultsPayload>(`/performance/service-results${month ? `?month=${encodeURIComponent(month)}` : ""}`),
  saveServiceResults: (body: ServiceReportInput) => api<ServiceResultsPayload>("/performance/service-results", { method: "PUT", body: JSON.stringify(body) }),
  syncPerformance: () => api<PerformancePayload>("/performance/sync", { method: "POST" }),
  weeklyLoop: () =>
    api<{ performance: PerformancePayload; recommendation: RecommendationPayload }>("/performance/weekly", {
      method: "POST",
    }),
  recommendations: () => api<RecommendationPayload>("/recommendations/latest"),
  recommendation: (id: number) => api<RecommendationPayload>(`/recommendations/${id}`),
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
  /** What the post writer learned from Instagram: the month's brief (else the newest
   *  earlier one), the business's own best posts and the saved competitor handles. Not
   *  connected is a 200 with `empty_reason`, never an error. */
  instagramBrief: (year?: number, month?: number) => {
    const query = new URLSearchParams();
    if (year) query.set("year", String(year));
    if (month) query.set("month", String(month));
    const suffix = query.toString();
    return api<InstagramBriefPayload>(`/instagram/brief${suffix ? `?${suffix}` : ""}`);
  },
  /** Replace the competitor / peer usernames (at most `max_handles`). "@name" and pasted
   *  profile links are accepted; a bad one is a 422 with a Hebrew message. */
  saveInstagramHandles: (handles: string[]) =>
    api<{ handles: string[]; max_handles: number }>("/instagram/handles", {
      method: "PUT",
      body: JSON.stringify({ handles }),
    }),
  /** Re-read Instagram and rebuild the brief — a Meta read plus a model call, so seconds.
   *  `refresh.status === "empty"` means there was nothing to learn from, with a reason. */
  refreshInstagramBrief: (body: { year?: number; month?: number; hashtags?: string[] } = {}) =>
    api<InstagramRefreshPayload>("/instagram/brief/refresh", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /* ---- Onboarding v2 (/start). Anonymous except from-draft. See docs/onboarding-v2.md.
     Callers go through `web/lib/draft.ts`, which falls back to fixtures on 404. ---- */
  /** Fast brand read of a public site, started in the background at the links step. */
  publicBrand: (url: string) =>
    api<PublicBrandResult>("/public/brand", { method: "POST", body: JSON.stringify({ url }) }),
  /** Three suggested audiences, each with the reason we suggest it. */
  publicAudiences: (draft: OnboardingDraft) =>
    api<{ audiences: SuggestedAudience[] }>("/public/audiences", {
      method: "POST",
      body: JSON.stringify({ draft }),
    }),
  /** The reveal: what we learned, two directions for the first month, and ideas for each. */
  publicPlanPreview: (draft: OnboardingDraft) =>
    api<PlanPreview>("/public/plan-preview", { method: "POST", body: JSON.stringify({ draft }) }),
  /** Check the links step as the owner types: normalised links, and a Hebrew error per field. */
  publicLinks: (links: OnboardingDraft["links"]) =>
    api<PublicLinksResult>("/public/links", { method: "POST", body: JSON.stringify({ links }) }),
  /** The looks an owner without a site picks from. */
  publicStylePresets: () => api<{ presets: PublicStylePreset[] }>("/public/style-presets"),
  /** Create or update the business from the draft. Idempotent; answers like /onboarding/me. */
  onboardingFromDraft: (body: {
    draft: OnboardingDraft;
    chosen_direction: PlanDirection | null;
    /** Revision 5: the 3-month plan the owner saw and shaped at /start. */
    quarter_plan?: StoredQuarterPlan | null;
  }) =>
    api<{ business: Business | null }>("/onboarding/from-draft", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

/* ------------------------------ Onboarding v2 ------------------------------ */

export type PublicBrand = {
  business_name: string;
  palette: BrandSwatch[];
  voice: string;
  logo_url: string | null;
  offerings: string[];
};

export type PublicBrandResult = {
  status: "ready" | "failed";
  brand: PublicBrand | null;
  reason_he?: string;
  cached?: boolean;
};

export type PublicLinksResult = {
  links: {
    website?: string;
    instagram?: { url: string; handle: string };
    facebook?: { url: string; handle: string };
    tiktok?: { url: string; handle: string };
  };
  errors: Partial<Record<"website" | "instagram" | "facebook" | "tiktok", string>>;
};

export type PublicStylePreset = { key: string; name_he: string; description_he: string; palette: BrandSwatch[] };

export type SuggestedAudience = { name: string; description: string; why_he: string };

/** Where an insight came from. The API may also send a ready Hebrew label. */
export type PlanInsightSource = "site" | "answers" | "calendar" | "category" | "social";

export type PlanInsight = { text_he: string; source: PlanInsightSource | string; detail_he?: string };

export type PlanDirection = {
  title: string;
  approach_he: string;
  audience: string;
  goal_he: string;
  why_he: string;
  first_steps: string[];
};

export type PostIdea = {
  title: string;
  format: "reel" | "carousel" | "image" | "story";
  hook: string;
  caption: string;
  cta: string;
  overlay_headline: string;
  why: { audience: string; goal_he: string; timing_he: string; reason_he: string };
  /** Which of the two directions this idea belongs to. */
  direction_index?: number;
};

export type PlanPreview = {
  insights: PlanInsight[];
  directions: PlanDirection[];
  ideas: PostIdea[];
  brand: PublicBrand | null;
  cached?: boolean;
};

/* --------------------------- Instagram signal --------------------------- */

/** A metric Meta did not return is missing (null / absent), never zero. */
export type InstagramMetrics = {
  views?: number | null;
  reach?: number | null;
  saved?: number | null;
  shares?: number | null;
  likes?: number | null;
  comments?: number | null;
};

/** One real post a pattern or a written post cites (`_compact_source` on the server). */
export type InspirationSource = {
  /** O1.. = the business's own post, C1.. = another account's, H1.. = a hashtag's. */
  ref: string;
  kind: "own" | "competitor" | "hashtag";
  handle: string;
  hashtag: string;
  format: string;
  format_he: string;
  hook: string;
  permalink: string;
  posted_at: string;
  /** Day and Israel hour it went out, e.g. "יום רביעי 06:00"; "" when unknown. */
  when_he: string;
  caption_length: number;
  metrics: InstagramMetrics;
};

/** Why a generated post looks the way it does, resolved to real posts. */
export type PostInspiration = { note: string; sources: InspirationSource[] };

/** One of the business's own best posts (`own_post_dict` + the ranking fields). */
export type InstagramOwnPost = InspirationSource & {
  media_id: string;
  caption: string;
  media_url: string;
  thumbnail_url: string;
  score?: number;
  score_basis?: string;
  score_basis_he?: string;
};

export type InspirationPattern = {
  category: "format" | "hook" | "caption_length" | "cta" | "timing" | "topic";
  category_he: string;
  pattern: string;
  evidence: string;
  source_refs: string[];
  /** "strong" only when it repeats across posts or rests on the business's own saves. */
  strength: "strong" | "weak";
  sources: InspirationSource[];
};

export type InspirationBrief = {
  id: number;
  year: number;
  month: number;
  summary: string;
  patterns: InspirationPattern[];
  caveats: string[];
  created_at: string;
  updated_at: string;
  sources: {
    own: InspirationSource[];
    competitors: {
      handle: string;
      ok: boolean;
      error_he: string;
      profile: { username: string; name: string; followers_count: number | null; media_count: number | null } | null;
      posts_seen: number;
      posts: InspirationSource[];
    }[];
    hashtags: InspirationSource[];
  };
};

export type InstagramBriefPayload = {
  year: number;
  month: number;
  /** False when the Meta app itself is not configured on this server. */
  meta_ready: boolean;
  meta_connected: boolean;
  handles: string[];
  max_handles: number;
  hashtag_search: { enabled: boolean; used_7d: number; limit: number };
  own_posts_synced: number;
  own_top_posts: InstagramOwnPost[];
  brief: InspirationBrief | null;
  /** Hebrew, "" when there is something to show. */
  empty_reason: string;
};

export type InstagramRefreshPayload = InstagramBriefPayload & {
  refresh: {
    status: "created" | "empty";
    reason_he: string;
    competitors: { handle: string; ok: boolean; error_he: string; posts_seen: number }[];
    hashtags: unknown;
  };
};

export type Competitor = { name: string; website_url: string };

type OwnerActivity = "none" | "sometimes" | "regular";
type OwnerTriedChannel = NonNullable<OnboardingDraft["tried"]>["channels"][number];

/** The first-meeting answers the API keeps in `owner_context` (see onboarding_draft.owner_context). */
export type OwnerContext = {
  pending_links?: Partial<Record<"website" | "instagram" | "facebook" | "tiktok", { url: string; error: string }>>;
  differentiator?: string;
  seasons?: { busy: number[]; slow: number[] };
  activity?: { instagram?: OwnerActivity; facebook?: OwnerActivity; tiktok?: OwnerActivity };
  tried?: { channels: OwnerTriedChannel[]; what_worked?: string };
  /** `kind` is "website" | "instagram" | "facebook" | "tiktok" | "" (no link). */
  competitors?: { name: string; kind?: string; link?: string }[];
};

/**
 * A partial edit for PUT /onboarding/owner-context. A field that is not sent is kept;
 * `seasons` and `competitors` replace, `activity` updates only the networks it names
 * (`null` clears one), and `tried.what_worked` is kept when not sent.
 */
export type OwnerContextUpdate = {
  links?: Partial<Record<"website" | "instagram" | "facebook" | "tiktok", string>>;
  differentiator?: string;
  seasons?: { busy: number[]; slow: number[] };
  activity?: { instagram?: OwnerActivity | null; facebook?: OwnerActivity | null; tiktok?: OwnerActivity | null };
  tried?: { channels: OwnerTriedChannel[]; what_worked?: string };
  competitors?: { name: string; link?: string }[];
};

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
  /** The business's Design DNA (docs/design-dna.md), once generated. */
  brand_dna?: BrandDna | null;
  growth_targets?: string[];
  diagnostics?: Diagnostics | null;
  long_horizon_plan?: LongHorizonPlan | null;
  generate_state?: { stage?: string; error?: string };
  /** Competitor / peer Instagram usernames, normalised (no "@"). */
  instagram_handles?: string[];
  /** Set by /onboarding/from-draft: what the /start conversation learned. Editable from
   *  /decisions (PUT /onboarding/owner-context). */
  owner_context?: OwnerContext | null;
  brand_source?: string | null;
  first_month_seed?: Record<string, unknown> | null;
  /** The 3-month plan built at /start and stored by from-draft (Revision 5). */
  quarter_plan?: StoredQuarterPlan | null;
  /** First-run decisions not made yet (diagnostics, growth_targets, long_horizon_plan,
   *  growth_hypothesis): the month was built without them and they can be set later. */
  deferred_decisions?: string[];
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
  /** The words on the image: at most 6 (docs/design-dna.md, Revision 1). */
  overlay_headline?: string;
  /** v2: at most one short line under (or over) the headline. Optional. */
  overlay_sub?: string;
  /** v2: the offer's price, when the plan's offer has one. On the image only when it is the message. */
  price?: PostPrice | null;
  /** v1: a small line over the headline. No longer drawn on the image (one message). */
  overlay_badge?: string;
  overlay_position?: "top_right" | "top_left" | "bottom_bar" | "bottom_pill" | "center_card";
  overlay_theme?: OverlayTheme;
  /** Which of the business's DNA compositions the post uses, its crop and text position.
   *  Absent on posts written before the DNA: the renderer maps `overlay_theme` instead. */
  design?: PostDesign;
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
  /** Which real Instagram post(s) this post follows and why, or null when the writer had
   *  no Instagram signal to lean on. Absent on posts written before the signal existed. */
  inspiration?: PostInspiration | null;

  /* ---- Connected posts (docs/posts-v2.md, field contract). All additive: a post written
   *      before them has none, and every screen falls back to the fields above. ---- */

  /** Stable id, not the list index. UTM `utm_content` and the WhatsApp code use it, so an
   *  edit or a reorder never breaks the match between a click and its post. */
  uid?: string;
  /** The one channel the plan chose for this post (= `primary_outlet`). */
  channel?: PostChannel;
  /** Which part of the plan this post serves. */
  plan_link?: PostPlanLink;
  mix_type?: PostMixType;
  /** One sentence: "בשביל {goal}, ל{audience}." */
  why_line?: string;
  /** What only the owner can add. Empty = nothing needed. */
  owner_needs?: PostOwnerNeed[];
  /** How we will know if it worked: the one number, and where it is counted. */
  measure?: PostMeasure;
  /** Written back by the performance sync; null until there is something to show. */
  results?: PostResults | null;
  /** One line of "מה לומדים", after measuring. */
  learning?: string | null;
  /** "עודכן לפי מה שהצליח אצלכם: …" when what worked was applied to this post. */
  informed_by_note?: string | null;
  /** Computed by the server. `lifecycleOf()` in lib/postLifecycle.ts derives it when absent. */
  lifecycle?: PostLifecycle;
  /** The featured item the post is about, when it features one. */
  featured_item_id?: string | null;
  featured_item_name?: string;
  /** Something only the owner knows that the post depends on (a price, a date), and
   *  whether they went over it (saved or approved the text since). */
  owner_fact?: string;
  owner_fact_done?: boolean;
  /** What the photo should show, when the writer said ("תמונה של המארז, מלמעלה"). */
  photo_hint_he?: string;
  /** The owner chose a picture made with AI on purpose, which meets a photo need. */
  image_preference?: "real" | "ai";
  /** The uids of the measured posts whose lesson was applied to this one. */
  informed_by?: string[];
  /** The last one-instruction rewrite ("קצר יותר"), until the text is saved or approved:
   *  the editor says "שונה לפי: …". */
  rewrite_instruction?: string | null;
  /** Prices the owner typed, saved or approved (normalised digits): a rewrite keeps them. */
  owner_prices?: string[];
};

/** The channels a plan writes a post for. */
export type PostChannel = "instagram" | "facebook" | "whatsapp";

export type PostRewriteTone = "direct" | "neighborhood" | "punchy" | "holiday" | "story";

export type PostRewriteRequest = { instruction?: string; tone?: PostRewriteTone };

export type PostRewriteResult = {
  post: RoadmapPost;
  strategy: StrategyPayload;
  /** False when the post stayed as it was; `message` says why and what to do. */
  changed: boolean;
  message: string | null;
  /** What the editor shows after it: "שונה לפי: {instruction}". */
  instruction: string;
};

/** One vocabulary everywhere: מחכה לכם → מוכן לאישור → אושר → פורסם → נמדד. */
export type PostLifecycle = "needs_owner" | "ready" | "approved" | "published" | "measured";

export type PostMixType =
  | "product"
  | "value"
  | "behind_scenes"
  | "social_proof"
  | "offer"
  | "community"
  | "seasonal";

export type PostPlanLink = {
  /** The month hypothesis, in a few words. */
  goal: string;
  week: number;
  week_focus: string;
};

/** A photo of something specific, or a fact to check ("המחיר: 12 ₪, נכון?"). */
export type PostOwnerNeed = { kind: "photo" | "fact"; text: string };

export type PostMetric = "whatsapp_clicks" | "site_visits" | "saves" | "reach";

export type PostMeasure = {
  metric: PostMetric;
  /** The number's name for the owner: "לחיצות לוואטסאפ". */
  label_he: string;
  /** The post's own code in its tracked links and WhatsApp message. */
  link_code: string;
};

export type PostResults = {
  updated_at: string;
  /** Which measure `value` is (the post's `measure.metric` when it was counted). */
  metric?: PostMetric;
  /** The measure's number. Null while it was not counted, which is never shown as 0. */
  value: number | null;
  /** The most recent earlier similar post ("בפוסט דומה"), when there is one. */
  compare?: { label: string; value: number; uid?: string; direction?: "above" | "below" | "similar" } | null;
  whatsapp_clicks?: number;
  visits?: number;
  conversions?: number;
  reach?: number;
  saves?: number;
  /** How the numbers were tied to this post: "whatsapp_code", "utm", "instagram_link",
   *  "instagram_caption". A missing metric key means it was not measured, never 0. */
  matched_by: string[] | string;
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
  /** The post's own WhatsApp tracked link (lib/whatsapp.ts); "" when its CTA is not
   *  WhatsApp or the number is not set. */
  whatsapp_url?: string;
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

export type PlanEditFields = {
  direction: string;
  audience: string;
  assumptions: { bet_he: string; if_wrong_he: string }[];
};
export type PlanEditPayload = {
  business_id: number;
  strategy_id: number | null;
  available: boolean;
  blocked: boolean;
  version: string;
  revision: number;
  saved_at: string | null;
  fields: PlanEditFields;
};

export type StrategyPayload = {
  id: number;
  plan_revision?: number;
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
  /** The business's Design DNA, when the server sends it with the month. */
  brand_dna?: BrandDna | null;
  horizon?: MonthHorizon;
  /** The stored 3-month plan from /start (Revision 5), when the business has one. */
  quarter_plan?: StoredQuarterPlan | null;
  /** Where the month's hypothesis, its targets and the plan's assumptions stand
   *  (docs/posts-v2.md, Phase C: api/app/services/hypotheses.py). */
  hypothesis_review?: HypothesisReview | null;
};

/** measuring (not enough data, the line says what is missing) → on_track / confirmed (the
 *  evidence supports it) · not_yet (against it so far) · changed (the plan changed it). */
export type HypothesisReviewStatus = "measuring" | "on_track" | "confirmed" | "not_yet" | "changed";

export type HypothesisReviewItem = {
  /** "month", "target:{index}" or "assumption:{index}" (the index in the stored list). */
  key: string;
  kind: "month" | "target" | "assumption";
  text_he: string;
  if_wrong_he: string;
  status: HypothesisReviewStatus;
  /** The word beside the dot, in the item's grammar ("בדרך", "התאמתה", "הושג"…). */
  status_he: string;
  /** One line of evidence, with the server's numbers only. */
  evidence_he: string;
};

export type HypothesisReview = {
  updated_at: string | null;
  /** The month is over (or the next one was built): the statuses are its verdict. */
  closed: boolean;
  items: HypothesisReviewItem[];
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

export type SourceReadiness = {
  status: "choose_property" | "no_properties" | "unchecked" | "reading" | "ready" | "empty" | "reconnect" | "unavailable";
  note_he: string;
  property_id?: string;
  checked_at?: string | null;
  last_success_at?: string | null;
  period?: { start: string; end: string } | null;
};

export type MetaSourceReadiness = Omit<SourceReadiness, "status"> & {
  status: SourceReadiness["status"] | "choose_assets" | "no_assets" | "partial" | "permission" | "link_instagram";
  selection?: { page_id: string; instagram_id: string; ad_account_id: string; pixel_id: string };
  sections?: Record<string, MetaReadState & { read_at?: string; retained_at?: string; recovery_status?: string }>;
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
    source_readiness?: SourceReadiness | MetaSourceReadiness | null;
    scopes?: string[];
    ad_account_id?: string;
    pixel_id?: string;
    pixel_verification?: PixelVerification | null;
    properties?: { property_id: string; display_name: string; account: string }[];
    pages?: { page_id: string; display_name: string; instagram_id: string }[];
    /** Google only: which Google account granted it, and a note when it is not the sign-in one. */
    account_email?: string | null;
    account_mismatch?: boolean;
    account_note_he?: string | null;
  }[];
  webhooks: { id: number; url: string; events: string; created_at: string }[];
};

export type MetaReadState = { status: string; note_he?: string };
export type MetaPixel = { id: string; name: string; last_fired_time?: string | null };
export type MetaAssets = {
  connection_attempt?: string;
  pages: { page_id: string; display_name: string; instagram_id: string }[];
  ad_accounts: { id: string; name: string; currency: string; status?: number }[];
  scopes: string[];
  errors: Record<string, MetaReadState>;
};
export type PixelVerification = MetaReadState & {
  pixel_id?: string;
  name?: string;
  checked_at?: string;
  last_fired_time?: string | null;
  website_match?: boolean | null;
  events?: string[];
  checks?: Record<string, boolean | null>;
};
export type MetaAdsRow = {
  id: string; name: string; currency: string;
  spend: number | null; impressions: number | null; reach: number | null;
  link_clicks: number | null; website_purchases: number | null;
  website_purchase_value: number | null; leads: number | null;
  cost_per_link_click: number | null; cost_per_purchase: number | null; purchase_roas: number | null;
};
export type MetaAdsReport = MetaReadState & {
  account_id?: string;
  period?: { start: string; end: string };
  attribution?: { click_days: number; view_days: number; report_time: string };
  overview?: Partial<MetaAdsRow>;
  campaigns?: MetaAdsRow[];
};

export type ServiceReportInput = {
  month: string;
  revision: number | null;
  inquiries: number | null;
  suitable: number | null;
  clients_won: number | null;
  capacity: number | null;
  fit_criterion: string;
};
export type ServiceReport = ServiceReportInput & {
  revision: number;
  source: "owner";
  period: { start: string; end: string };
  updated_at: string;
  capacity_outdated: boolean;
};
export type ServiceResultsPayload = { enabled: boolean; report: ServiceReport | null };

export type PerformancePayload = {
  id?: number | null;
  sources?: { ga4?: SourceReadiness; meta?: MetaSourceReadiness };
  created_at?: string;
  /** False when nothing has been synced yet — a normal state, not an error. */
  available?: boolean;
  /** From `/performance/sync`: how many posts got results written back, and how many of
   *  the business's posts are measured in all. */
  post_results?: { updated: number; measured: number };
  period_start: string;
  period_end: string;
  ga4: {
    property_id?: string;
    read_at?: string;
    overview?: Record<string, string>;
    landing_pages?: Record<string, string>[];
    campaigns?: Record<string, string>[];
    post_attribution?: Record<string, unknown>[];
  };
  meta: {
    source_read_at?: string;
    source_period?: { start: string; end: string };
    source_selection?: MetaSourceReadiness["selection"];
    source_reads?: Record<string, { read_at?: string; period?: { start: string; end: string } }>;
    ads?: MetaAdsReport;
    tracking?: PixelVerification;
    page?: { name?: string; fan_count?: number };
    posts?: Record<string, unknown>[];
    /** The account's own totals. Absent on snapshots from before it was read. */
    account?: InstagramAccount | null;
  };
  diagnostic: {
    analysis_status?: "pending" | "ready" | "unavailable" | "paused" | "superseded";
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
  /**
   * The month's measured posts, each with the number its card shows (the post's own
   * `results`, written by the refresh and the weekly job: `measured_posts()` in
   * `api/app/services/connected_posts.py`). There with or without a snapshot: WhatsApp taps
   * are our own count. `waiting` = posts that are out with no number yet, never a 0.
   */
  measured_posts?: { items: MeasuredPost[]; waiting: number };
};

/** One measured post on Results: the post's one number, as its card shows it. */
export type MeasuredPost = {
  /** The post's place in the month, for `/posts?post=<index>`. */
  index: number;
  uid: string;
  title: string;
  channel: string;
  metric: PostMetric;
  label_he: string;
  value: number;
  compare: { label: string; value: number; direction?: "above" | "below" | "similar" } | null;
  matched_by: string[];
  updated_at: string;
};

/**
 * One since–until window of the Instagram account's totals, as `account_insights()` in
 * `api/app/services/meta.py` returns it. A metric that is missing from `values` was not
 * measured, and `errors` says why in Hebrew — it is never a zero.
 */
export type InstagramAccountWindow = {
  /** First and last day counted (today is never in: Meta's numbers are not in yet). */
  start: string;
  end: string;
  days: number;
  values: Partial<
    Record<
      | "reach"
      | "views"
      | "accounts_engaged"
      | "total_interactions"
      | "profile_links_taps"
      | "follows_and_unfollows"
      | "follows"
      | "unfollows"
      | "net_followers",
      number
    >
  >;
  /** `profile_links_taps` by contact button, `follows_and_unfollows` by follow type. */
  breakdowns?: Record<string, Record<string, number>>;
  errors: Record<string, string>;
  stopped?: string;
};

/** `meta.account` on a snapshot: `account_overview()` in `api/app/services/meta.py`. */
export type InstagramAccount = {
  as_of?: string;
  followers_count: number | null;
  /** Under 100 followers: Meta does not report follows and unfollows. */
  few_followers?: boolean;
  /** New followers per window length ("7", "28"), from Meta's legacy daily count. */
  new_followers?: Record<string, number>;
  /** Keyed by window length in days: the last N days, and the N days before them. */
  windows: Record<string, { current: InstagramAccountWindow; previous?: InstagramAccountWindow }>;
  errors?: Record<string, string>;
  stopped?: string;
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
  id?: number | null;
  created_at?: string;
  week_of: string;
  suggestions: {
    week_summary: string;
    basis?: {
      version: number;
      snapshot_id?: number | null;
      plan_id?: number | null;
      sources: { key: string; label: string; status: string; period: { start?: string; end?: string }; read_at: string; stale?: boolean; age_days?: number | null }[];
      observations: { source: string; metric: string; label: string; value: number }[];
      limits: string[];
    } | null;
    suggestions: {
      priority: "high" | "medium" | "low";
      title: string;
      action: string;
      evidence: string;
      target: string;
      hypothesis?: string;
      success_check?: string;
      review?: {
        kind: "post" | "plan" | "measurement" | "website";
        status: "ready" | "legacy" | "stale" | "missing" | "changed" | "published";
        href: string;
        label: string;
        note_he: string;
        plan_id?: number | null;
        post_uid?: string | null;
      };
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
  /** What a "conversion" means for this business, e.g. "פנייה". */
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

/**
 * A month being built on the server (GET /onboarding/generate/status). The build runs in
 * the background whether or not a page is open; pages only poll this. `stage` is the one
 * running now ("usp" | "plan" | "posts" | "posts_late"; "done" once built).
 */
export type WeekPostsState = "pending" | "running" | "done" | "error";

export type GenerationStatus = {
  /** "first_month": the month's structure after signup (no posts, Revision 8);
   *  "posts": the posts of the weeks asked for; "next_month": a later month, posts included. */
  kind: "first_month" | "next_month" | "posts";
  /** "idle": nothing has run yet (or it stopped before jobs existed; see `resumable`). */
  status: "idle" | "running" | "failed" | "done";
  running: boolean;
  done: boolean;
  stage: string;
  /** e.g. "כותבים את הפוסטים לשבועות 3–4" */
  stage_label_he: string;
  /** e.g. "בונים את אוקטובר: כותבים את הפוסטים לשבועות 3–4…" */
  label_he: string;
  stage_index: number;
  stage_count: number;
  year: number | null;
  month: number | null;
  month_name_he: string;
  started_at: string | null;
  updated_at: string | null;
  /** Set when the build stopped (a stage failed twice); show it with "לנסות שוב". */
  error_he: string | null;
  /** A saved stage and nothing running: starting again continues from it. */
  resumable: boolean;
  /** Each week's posts in that month ("1".."4"); null before the month exists. */
  posts: Record<"1" | "2" | "3" | "4", WeekPostsState> | null;
};

export type GenerateResult = {
  done?: boolean;
  job?: GenerationStatus;
  generate_state?: { stage?: string };
  business?: Business | { generate_state?: { stage?: string } };
  strategy?: StrategyPayload;
};

const DEMO_GENERATION_DONE: GenerationStatus = {
  kind: "first_month",
  status: "done",
  running: false,
  done: true,
  stage: "done",
  stage_label_he: "החודש מוכן",
  label_he: "החודש מוכן",
  stage_index: 4,
  stage_count: 4,
  year: null,
  month: null,
  month_name_he: "",
  started_at: null,
  updated_at: null,
  error_he: null,
  resumable: false,
  posts: { "1": "done", "2": "done", "3": "done", "4": "done" },
};
