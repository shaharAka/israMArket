/**
 * The /start conversation's draft: what the owner told us before they have an account.
 *
 * It lives in localStorage["isramarket_draft_v2"] (never on the server) until signup,
 * when `POST /onboarding/from-draft` turns it into the business. Every read and write is
 * wrapped: private mode, blocked storage or a full quota must never break the flow, it
 * only loses the resume-on-refresh.
 *
 * Mock mode. The four endpoints are built in parallel with this screen. When they are not
 * there yet (404), or in demo mode, or with NEXT_PUBLIC_DRAFT_MOCK=1 / ?mock=1, the three
 * public calls answer from the fixtures below so the conversation can be walked end to
 * end. `from-draft` is never faked against a real account: on 404 it falls back to the
 * existing profile + audiences endpoints, which is what it will do on the server anyway.
 */
import {
  ApiError,
  endpoints,
  isDemo,
  type Business,
  type BusinessModel,
  type BrandSwatch,
  type PlanDirection,
  type PlanInsight,
  type PlanPreview,
  type PostIdea,
  type PrimaryGoal,
  type PublicBrand,
  type PublicBrandResult,
  type SuggestedAudience,
} from "./api";
import { defaultGoalFor, goalsFor } from "./businessModel";

/* --------------------------------- Types --------------------------------- */

export type Activity = "none" | "sometimes" | "regular";
export type Network = "instagram" | "facebook" | "tiktok";
export type LinkKey = "website" | Network;

export type TriedChannel =
  | "social_posts"
  | "paid_social"
  | "google"
  | "influencers"
  | "whatsapp"
  | "flyers"
  | "word_of_mouth";

/** What the client sends. Mirrored by the API (`services/onboarding_draft.py`). */
export type OnboardingDraft = {
  business_name: string;
  business_type: string; // one of BUSINESS_TYPES
  offerings: string; // free text, "what you do / sell"
  differentiator?: string;
  audiences: { name: string; description: string }[]; // 0–3
  seasons?: { busy: number[]; slow: number[] }; // month numbers, 1–12
  links: { website?: string; instagram?: string; facebook?: string; tiktok?: string };
  has_none?: boolean; // "עוד לא": no site and no network yet
  activity?: { instagram?: Activity; facebook?: Activity; tiktok?: Activity };
  style_preset?: string; // a STYLE_PRESETS key, when there is no site (or its scan failed)
  tried?: { channels: TriedChannel[]; what_worked?: string };
  competitors?: { name: string; link?: string }[]; // 0–3
  business_model?: BusinessModel; // inferred from the type and the owner's words, confirmable
  goal?: PrimaryGoal;
  city?: string;
};

export type BrandScan = {
  url: string;
  status: "reading" | "ready" | "failed";
  brand: PublicBrand | null;
  reason_he?: string;
};

/** Everything /start needs to resume where the owner left off. */
export type FlowState = {
  v: 2;
  step: string;
  draft: OnboardingDraft;
  /** Which screens were answered or skipped: the card only fills what was asked. */
  seen: string[];
  brandScan?: BrandScan | null;
  suggestions?: SuggestedAudience[] | null;
  suggestionsFor?: string;
  suggestionsFailed?: boolean;
  plan?: PlanPreview | null;
  planFor?: string;
  chosenDirection?: number | null;
  chosenIdea?: number | null;
  modelConfirmed?: boolean;
  /** "עוד לא ניסינו" at the tried step: an answer, not a skip. */
  triedNone?: boolean;
};

export const DRAFT_KEY = "isramarket_draft_v2";
const MOCK_KEY = "isramarket_draft_mock";

export function emptyDraft(): OnboardingDraft {
  return { business_name: "", business_type: "", offerings: "", audiences: [], links: {} };
}

export function emptyFlow(): FlowState {
  return { v: 2, step: "name", draft: emptyDraft(), seen: [] };
}

export function loadFlow(): FlowState | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FlowState>;
    if (parsed?.v !== 2 || !parsed.draft || typeof parsed.step !== "string") return null;
    const flow = { ...emptyFlow(), ...parsed } as FlowState;
    flow.draft = { ...emptyDraft(), ...parsed.draft, links: { ...(parsed.draft.links ?? {}) } };
    // A scan that was running when the page closed will never report back.
    if (flow.brandScan?.status === "reading") flow.brandScan = null;
    return flow;
  } catch {
    return null;
  }
}

export function saveFlow(flow: FlowState) {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(flow));
  } catch {
    // Storage blocked or full: the flow still works, it only will not survive a refresh.
  }
}

export function clearFlow() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** A draft with enough in it to be worth saving (signup hand-off). */
export function hasSavableDraft(flow: FlowState | null): flow is FlowState {
  return Boolean(flow && flow.draft.business_name.trim().length >= 2 && flow.draft.business_type);
}

/* ------------------------------ Vocabulary ------------------------------ */

export const MONTHS_HE = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

/** What usually happens in an Israeli month, to help the owner remember their seasons. */
export const MONTH_HINTS: Record<number, string> = {
  3: "פורים",
  4: "פסח",
  7: "חופש",
  8: "חופש",
  9: "חגים",
  10: "חגים",
  11: "בלאק פריידי",
  12: "חנוכה",
};

export const NETWORKS: { key: Network; label: string; placeholder: string }[] = [
  { key: "instagram", label: "אינסטגרם", placeholder: "@your_business" },
  { key: "facebook", label: "פייסבוק", placeholder: "facebook.com/your.business" },
  { key: "tiktok", label: "טיקטוק", placeholder: "@your_business" },
];

export const ACTIVITY_OPTIONS: { key: Activity; label: string }[] = [
  { key: "none", label: "לא מפרסמים" },
  { key: "sometimes", label: "מדי פעם" },
  { key: "regular", label: "באופן קבוע" },
];

export const TRIED_OPTIONS: { key: TriedChannel; label: string }[] = [
  { key: "social_posts", label: "פוסטים ברשתות" },
  { key: "paid_social", label: "ממומן בפייסבוק/אינסטגרם" },
  { key: "google", label: "גוגל" },
  { key: "influencers", label: "משפיענים" },
  { key: "whatsapp", label: "וואטסאפ ללקוחות" },
  { key: "flyers", label: "פלאיירים" },
  { key: "word_of_mouth", label: "פה לאוזן" },
];

export type StylePreset = { key: string; name: string; description?: string; palette: BrandSwatch[] };

/** For an owner with no site yet (or a scan that failed): pick a look, not a hex code.
 *  The API owns the list (`GET /public/style-presets`); these are the same keys, used
 *  until it answers and whenever it cannot. */
const LOCAL_PRESETS: StylePreset[] = [
  {
    key: "warm",
    name: "חם ושכונתי",
    palette: [
      { hex: "#7A3E24", role: "primary", name: "טרקוטה" },
      { hex: "#D9824B", role: "accent", name: "כתום שרוף" },
      { hex: "#F6EBDD", role: "background", name: "קרם" },
      { hex: "#2A1D16", role: "ink", name: "קפה" },
    ],
  },
  {
    key: "fresh",
    name: "רענן וטבעי",
    palette: [
      { hex: "#2F5D46", role: "primary", name: "ירוק עלה" },
      { hex: "#9CC5A1", role: "accent", name: "מנטה" },
      { hex: "#F1F5EE", role: "background", name: "פשתן" },
      { hex: "#1B2A22", role: "ink", name: "יער" },
    ],
  },
  {
    key: "clean",
    name: "נקי ומדויק",
    palette: [
      { hex: "#3E5566", role: "primary", name: "כחול צפחה" },
      { hex: "#A7C4D4", role: "accent", name: "תכלת" },
      { hex: "#F4F7F8", role: "background", name: "ערפל" },
      { hex: "#1D2830", role: "ink", name: "גרפיט" },
    ],
  },
  {
    key: "luxe",
    name: "יוקרתי ומאופק",
    palette: [
      { hex: "#1E1E1E", role: "primary", name: "שחור" },
      { hex: "#B89556", role: "accent", name: "זהב עתיק" },
      { hex: "#F5F1EA", role: "background", name: "שנהב" },
      { hex: "#111111", role: "ink", name: "פחם" },
    ],
  },
  {
    key: "playful",
    name: "שמח ומשפחתי",
    palette: [
      { hex: "#D6456B", role: "primary", name: "פטל" },
      { hex: "#FFC845", role: "accent", name: "חמנייה" },
      { hex: "#FFF5F7", role: "background", name: "ורוד חלבי" },
      { hex: "#2B1A22", role: "ink", name: "שזיף" },
    ],
  },
  {
    key: "soft",
    name: "רך ועדין",
    palette: [
      { hex: "#8C6A7E", role: "primary", name: "לילך מעושן" },
      { hex: "#E3B7A0", role: "accent", name: "אפרסק" },
      { hex: "#FAF4F1", role: "background", name: "חלב" },
      { hex: "#3A2D35", role: "ink", name: "שזיף כהה" },
    ],
  },
];

let presets: StylePreset[] = LOCAL_PRESETS;
let presetsRequest: Promise<StylePreset[]> | null = null;

export function stylePresets(): StylePreset[] {
  return presets;
}

/** The API's presets, once per page load. Falls back to the local list on any failure. */
export function loadStylePresets(): Promise<StylePreset[]> {
  if (isMockMode()) return Promise.resolve(presets);
  presetsRequest ??= endpoints
    .publicStylePresets()
    .then((res) => {
      const list = (res.presets ?? []).filter((p) => p.key && p.palette?.length);
      if (list.length) {
        presets = list.map((p) => ({ key: p.key, name: p.name_he, description: p.description_he, palette: p.palette }));
      }
      return presets;
    })
    .catch(() => presets);
  return presetsRequest;
}

export function presetFor(key?: string): StylePreset | null {
  return presets.find((preset) => preset.key === key) ?? LOCAL_PRESETS.find((preset) => preset.key === key) ?? null;
}

/* ---------------------------- Business types ---------------------------- */

export type TypeGroup =
  | "food"
  | "retail"
  | "ecommerce"
  | "professional"
  | "clinic"
  | "fitness"
  | "design"
  | "education"
  | "tourism"
  | "other";

/** Matched on words rather than exact strings, so a reworded BUSINESS_TYPES label still maps. */
export function typeGroup(businessType: string): TypeGroup {
  const t = businessType || "";
  if (/מאפי|קפה|מסעד/.test(t)) return "food";
  if (/אונליין|קומרס/.test(t)) return "ecommerce";
  if (/חנות|קמעונ/.test(t)) return "retail";
  if (/מקצועי|עו"ד|רו"ח|ייעוץ/.test(t)) return "professional";
  if (/קליני|יופי|בריאות/.test(t)) return "clinic";
  if (/אימון|ספורט/.test(t)) return "fitness";
  if (/עיצוב|אדריכ|נדל/.test(t)) return "design";
  if (/הדרכ|קורס|חינוך/.test(t)) return "education";
  if (/תייר|אירוח/.test(t)) return "tourism";
  return "other";
}

type TypeKit = {
  /** Short label for a chip on a phone. */
  chip: string;
  model: BusinessModel;
  placeholder: string;
  differentiators: string[];
  audiences: SuggestedAudience[];
  industry: string;
  /** What a consultant says back after hearing what the business does. */
  heard: string;
};

export const TYPE_KITS: Record<TypeGroup, TypeKit> = {
  food: {
    chip: "מאפייה, קפה או מסעדה",
    model: "products",
    placeholder: "למשל: מחמצת, חלות לשישי ועוגות בהזמנה",
    differentiators: ["אופים כל בוקר", "מתכון משפחתי", "חומרי גלם מקומיים", "משלוח באותו יום"],
    audiences: [
      {
        name: "משפחות מהשכונה",
        description: "קונים לשישי ולחג, בדרך כלל באותה שעה.",
        why_he: "עסק אוכל שכונתי חי מלקוחות קבועים שגרים קרוב.",
      },
      {
        name: "עובדים באזור",
        description: "עוצרים לקפה או לארוחה מהירה באמצע היום.",
        why_he: "הם עוברים ליד כל יום. צריך רק לתת להם סיבה להיכנס.",
      },
      {
        name: "מזמינים לאירועים",
        description: "ימי הולדת, אירוח ומגשים לשבת.",
        why_he: "הזמנה אחת לאירוע שווה הרבה ביקורים רגילים.",
      },
    ],
    industry: "בעסקי אוכל, תמונה קרובה של המוצר מושכת יותר מפוסט מבצע כללי.",
    heard: "באוכל, מה שנראה טוב בתמונה נמכר. נתחיל מהמוצר עצמו.",
  },
  retail: {
    chip: "חנות",
    model: "products",
    placeholder: "למשל: בגדי ילדים, צעצועים ומתנות",
    differentiators: ["ייעוץ אישי בחנות", "מותגים שאין במקום אחר", "מחירים הוגנים", "החלפה בלי בעיה"],
    audiences: [
      {
        name: "תושבי האזור",
        description: "קונים קרוב לבית ורוצים לראות ולגעת.",
        why_he: "חנות פיזית מנצחת את האונליין בקרבה וביחס.",
      },
      {
        name: "מחפשי מתנות",
        description: "צריכים רעיון למתנה, ומהר.",
        why_he: "לפני חגים וימי הולדת הם מחפשים המלצה, לא מוצר מסוים.",
      },
      {
        name: "לקוחות קבועים",
        description: "כבר קנו אצלכם ויחזרו כשיש סיבה.",
        why_he: "הכי קל למכור למי שכבר מכיר אתכם.",
      },
    ],
    industry: "בחנויות, פוסט על מוצר חדש שהגיע למדף מביא אנשים לבוא לראות.",
    heard: "בחנות, אנשים באים בשביל היחס. נראה אותו בפוסטים.",
  },
  ecommerce: {
    chip: "חנות אונליין",
    model: "products",
    placeholder: "למשל: תכשיטים בעבודת יד, משלוח לכל הארץ",
    differentiators: ["עבודת יד", "משלוח מהיר", "עיצוב שאין בחנויות", "שירות בוואטסאפ"],
    audiences: [
      {
        name: "מחפשי משהו מיוחד",
        description: "לא רוצים את מה שיש בכל קניון.",
        why_he: "חנות אונליין קטנה מנצחת כשיש לה סיפור וסגנון.",
      },
      {
        name: "קונים מתנה",
        description: "קונים לאחרים ורוצים שזה יגיע בזמן.",
        why_he: "מועד המשלוח הוא לרוב מה שסוגר את ההזמנה.",
      },
      {
        name: "מי שכבר הזמין",
        description: "קנו פעם אחת ומכירים את האיכות.",
        why_he: "הזמנה שנייה עולה לכם הרבה פחות מלקוח חדש.",
      },
    ],
    industry: "בחנות אונליין, סרטון קצר של המוצר ביד עונה על שאלות לפני שהן נשאלות.",
    heard: "באונליין אי אפשר לגעת, אז התמונות צריכות לעשות את העבודה.",
  },
  professional: {
    chip: "שירותים מקצועיים",
    model: "services",
    placeholder: "למשל: הנהלת חשבונות לעצמאים ולעסקים קטנים",
    differentiators: ["זמינות מהירה", "מתמחים בתחום אחד", "מחיר קבוע ושקוף", "יחס אישי"],
    audiences: [
      {
        name: "עצמאים בתחילת הדרך",
        description: "פתחו עסק ומחפשים מישהו לסמוך עליו.",
        why_he: "הם מחפשים הסבר פשוט לפני שהם בוחרים איש מקצוע.",
      },
      {
        name: "עסקים קטנים באזור",
        description: "רוצים מישהו קרוב וזמין.",
        why_he: "בשירות מקצועי, קרבה וזמינות הן סיבה לבחור.",
      },
      {
        name: "לקוחות שממליצים",
        description: "לקוחות קיימים שמעבירים את השם הלאה.",
        why_he: "המלצה היא הדרך הנפוצה להגיע לנותני שירות.",
      },
    ],
    industry: "בשירותים מקצועיים, אנשים פונים למי שכבר הסביר להם משהו בחינם.",
    heard: "בשירות, אנשים קונים אמון. נתחיל מהידע שלכם.",
  },
  clinic: {
    chip: "יופי ובריאות",
    model: "services",
    placeholder: "למשל: טיפולי פנים, הסרת שיער ואיפור לאירועים",
    differentiators: ["טיפול אישי ושקט", "ניסיון של שנים", "חומרים טבעיים", "תורים גם בערב"],
    audiences: [
      {
        name: "מטופלים קבועים",
        description: "רוצים מקום אחד לסמוך עליו.",
        why_he: "טיפול קבוע הוא הבסיס של קליניקה יציבה.",
      },
      {
        name: "לפני אירוע",
        description: "כלות, מלוות ואורחות שצריכות תור בקרוב.",
        why_he: "הן מחפשות עכשיו, ובוחרות לפי תמונות של תוצאות.",
      },
      {
        name: "מי שכבר היו אצלכם",
        description: "מכירים את היחס ויחזרו אם תזכירו.",
        why_he: "תזכורת בזמן הנכון מביאה אותם חזרה.",
      },
    ],
    industry: "בקליניקות, תמונות לפני ואחרי מביאות פניות, רק עם הסכמה של הלקוחות.",
    heard: "בטיפולים אנשים רוצים לראות תוצאה ולהרגיש בטוחים.",
  },
  fitness: {
    chip: "סטודיו לאימון",
    model: "services",
    placeholder: "למשל: פילאטיס מכשירים ואימונים בקבוצות קטנות",
    differentiators: ["קבוצות קטנות", "מדריכים מוסמכים", "אווירה משפחתית", "שיעור ניסיון"],
    audiences: [
      {
        name: "מתחילים",
        description: "רוצים להתחיל לזוז, וקצת חוששים.",
        why_he: "הם צריכים לראות שזה מתאים גם להם.",
      },
      {
        name: "הורים עסוקים",
        description: "מחפשים שעה קבועה לעצמם, קרוב לבית.",
        why_he: "זמן ומיקום מכריעים אצלם יותר מכל מבצע.",
      },
      {
        name: "מתאמנים קבועים",
        description: "כבר מנויים ויכולים להביא חבר.",
        why_he: "חבר שמביא חבר היא הדרך הזולה להתמלא.",
      },
    ],
    industry: "בסטודיו, סרטון קצר משיעור אמיתי עוזר למתחילים להרגיש שזה בשבילם.",
    heard: "באימון, הצעד הקשה הוא השיעור הראשון. נעזור להגיע אליו.",
  },
  design: {
    chip: "עיצוב ונדל״ן",
    model: "services",
    placeholder: "למשל: עיצוב פנים לדירות קטנות",
    differentiators: ["ליווי מההתחלה עד הסוף", "סגנון שמזהים", "עמידה בתקציב", "יחס אישי"],
    audiences: [
      {
        name: "זוגות שעוברים דירה",
        description: "מתכננים שיפוץ ורוצים לראות מה אפשר.",
        why_he: "הם אוספים השראה חודשים לפני שהם פונים.",
      },
      {
        name: "בעלי נכסים",
        description: "רוצים תוצאה שמעלה את ערך הנכס.",
        why_he: "הם בוחרים לפי עבודות קודמות, לא לפי הבטחות.",
      },
      {
        name: "לקוחות מרוצים",
        description: "גרים בבית שעיצבתם ומראים אותו לחברים.",
        why_he: "כל פרויקט גמור הוא סיפור לקוח מוכן.",
      },
    ],
    industry: "בעיצוב ונדל״ן, תמונות לפני ואחרי ותיק עבודות מסודר הם מה שמביא פניות.",
    heard: "פה העבודות מדברות. התיק שלכם יהיה במרכז.",
  },
  education: {
    chip: "קורסים והדרכות",
    model: "services",
    placeholder: "למשל: קורס צילום למתחילים, בזום ופרונטלי",
    differentiators: ["קבוצות קטנות", "ליווי גם אחרי הקורס", "מלמדים מניסיון", "אפשר גם אונליין"],
    audiences: [
      {
        name: "מתחילים סקרנים",
        description: "רוצים ללמוד משהו חדש ולא יודעים מאיפה להתחיל.",
        why_he: "הם צריכים טעימה קטנה לפני שהם נרשמים.",
      },
      {
        name: "מחפשי מקצוע",
        description: "רוצים מקצוע חדש או קידום בעבודה.",
        why_he: "הם שואלים מה יוצא מזה בסוף. נראה להם.",
      },
      {
        name: "בוגרים",
        description: "כבר למדו אצלכם ויכולים להמשיך או להמליץ.",
        why_he: "בוגר מרוצה הוא ההמלצה הכי משכנעת.",
      },
    ],
    industry: "בהדרכות, טיפ קצר בחינם בפוסט מביא אנשים לשאול על הקורס המלא.",
    heard: "מי שלמד מכם משהו קטן יבוא ללמוד עוד.",
  },
  tourism: {
    chip: "תיירות ואירוח",
    model: "services",
    placeholder: "למשל: צימר זוגי בגליל עם ג׳קוזי",
    differentiators: ["נוף שאין במקום אחר", "אירוח אישי", "ארוחת בוקר ביתית", "קרוב לאטרקציות"],
    audiences: [
      {
        name: "זוגות לסוף שבוע",
        description: "מחפשים חופשה קצרה ושקטה.",
        why_he: "הם מזמינים לפי תמונות ולפי מה שאורחים כתבו.",
      },
      {
        name: "משפחות בחופשות",
        description: "צריכים מקום שנוח גם לילדים.",
        why_he: "בחופשות ובחגים הם מתכננים מראש.",
      },
      {
        name: "אורחים חוזרים",
        description: "כבר היו אצלכם ויחזרו לעונה הבאה.",
        why_he: "תזכורת לפני העונה מביאה הזמנה ישירה, בלי אתר הזמנות.",
      },
    ],
    industry: "באירוח, הזמנות לחגים נסגרות שבועות מראש. מפרסמים מוקדם.",
    heard: "באירוח מוכרים חוויה, והתמונות הן חצי מהעבודה.",
  },
  other: {
    chip: "משהו אחר",
    model: "products",
    placeholder: "במשפט אחד: מה אתם מוכרים או עושים",
    differentiators: ["יחס אישי", "ניסיון של שנים", "זמינות מהירה", "מחיר הוגן"],
    audiences: [
      {
        name: "לקוחות מהאזור",
        description: "גרים או עובדים קרוב אליכם.",
        why_he: "הכי קל להתחיל ממי שנמצא קרוב.",
      },
      {
        name: "מחפשים בדיוק את זה",
        description: "צריכים את מה שאתם עושים ועוד לא מכירים אתכם.",
        why_he: "הם מחפשים עכשיו. צריך שימצאו אתכם.",
      },
      {
        name: "לקוחות קיימים",
        description: "כבר מכירים אתכם ויכולים לחזור או להמליץ.",
        why_he: "הכי קל למכור למי שכבר מכיר אתכם.",
      },
    ],
    industry: "לעסק קטן, פוסט קבוע פעם בשבוע עדיף על הרבה פוסטים ואז שקט.",
    heard: "נתחיל מהדבר שהכי קל להראות.",
  },
};

export function kitFor(businessType: string): TypeKit {
  return TYPE_KITS[typeGroup(businessType)];
}

const PRODUCT_WORDS = /מוצר|מוכר|חנות|קולקצי|מארז|משלוח|תכשיט|בגד|עוג|מאפ|קפה|יין|גבינ/;
const SERVICE_WORDS = /שירות|טיפול|ייעוץ|יועצ|שיעור|סדנ|קורס|פגיש|אימון|הדרכ|עיצוב|ליווי|צילום אירוע/;

/** Products, services or both, from the type and the owner's own words. Confirmed at the goal step. */
export function inferBusinessModel(businessType: string, offerings: string): BusinessModel {
  const base = kitFor(businessType).model;
  const text = offerings || "";
  const products = PRODUCT_WORDS.test(text);
  const services = SERVICE_WORDS.test(text);
  if (base === "products" && services) return "both";
  if (base === "services" && products && !/עיצוב|צילום/.test(text)) return "both";
  if (typeGroup(businessType) === "other") {
    if (products && services) return "both";
    if (services) return "services";
  }
  return base;
}

/* ------------------------------- Cleaning ------------------------------- */

export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function looksLikeUrl(value: string): boolean {
  return /^https?:\/\/[^\s./]+\.[^\s]+/i.test(normalizeUrl(value));
}

/** "@Name", "name" or a pasted profile link → "name". */
export function normalizeHandle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const fromUrl = trimmed.match(/(?:instagram\.com|tiktok\.com\/@?|facebook\.com|fb\.com)\/@?([^/?#\s]+)/i);
  const handle = fromUrl ? fromUrl[1] : trimmed;
  return handle.replace(/^@+/, "").replace(/\/+$/, "");
}

/** The first thing they sell, short enough for a sentence ("מחמצת"). */
export function firstOffering(offerings: string): string {
  const cleaned = offerings.replace(/^למשל:?\s*/, "").trim();
  const first = cleaned.split(/[,،.;\n]| ו(?=[א-ת])/)[0]?.trim() ?? "";
  return first.length > 40 ? `${first.slice(0, 38).trim()}…` : first;
}

/** The draft as the API receives it: trimmed, no empty links, handles without "@". */
export function draftForApi(flow: FlowState): OnboardingDraft {
  const d = flow.draft;
  const links: OnboardingDraft["links"] = {};
  if (!d.has_none) {
    if (d.links.website?.trim()) links.website = normalizeUrl(d.links.website);
    for (const net of ["instagram", "tiktok"] as const) {
      const handle = normalizeHandle(d.links[net] ?? "");
      if (handle) links[net] = handle;
    }
    if (d.links.facebook?.trim()) links.facebook = d.links.facebook.trim();
  }
  const activity: OnboardingDraft["activity"] = {};
  // Activity counts for every selected network, even when the owner did not know the handle.
  for (const net of ["instagram", "facebook", "tiktok"] as const) {
    if (!d.has_none && d.links[net] !== undefined && d.activity?.[net]) activity[net] = d.activity[net];
  }
  const out: OnboardingDraft = {
    business_name: d.business_name.trim(),
    business_type: d.business_type,
    offerings: d.offerings.trim(),
    audiences: d.audiences
      .filter((a) => a.name.trim().length >= 2)
      .slice(0, 3)
      .map((a) => ({ name: a.name.trim().slice(0, 60), description: a.description.trim().slice(0, 240) })),
    links,
  };
  if (d.differentiator?.trim()) out.differentiator = d.differentiator.trim().slice(0, 300);
  if (d.seasons && (d.seasons.busy.length || d.seasons.slow.length)) out.seasons = d.seasons;
  if (d.has_none) out.has_none = true;
  if (Object.keys(activity).length) out.activity = activity;
  // A preset matters only when there is no site to read, or the read failed.
  if (d.style_preset && (!links.website || flow.brandScan?.status === "failed")) out.style_preset = d.style_preset;
  if (d.tried && (d.tried.channels.length || d.tried.what_worked?.trim())) {
    out.tried = { channels: d.tried.channels };
    if (d.tried.what_worked?.trim()) out.tried.what_worked = d.tried.what_worked.trim().slice(0, 400);
  }
  const competitors = (d.competitors ?? [])
    .filter((c) => c.name.trim())
    .slice(0, 3)
    .map((c) => (c.link?.trim() ? { name: c.name.trim(), link: c.link.trim() } : { name: c.name.trim() }));
  if (competitors.length) out.competitors = competitors;
  if (d.business_model) out.business_model = d.business_model;
  // A goal the model does not offer is a 422: drop it and let the API default it.
  const model = d.business_model ?? inferBusinessModel(d.business_type, d.offerings);
  if (d.goal && goalsFor(model).some((g) => g.key === d.goal)) out.goal = d.goal;
  if (d.city?.trim()) out.city = d.city.trim();
  return out;
}

/** A stable key for "the answers this result was computed from". */
export function signature(value: unknown): string {
  return JSON.stringify(value);
}

/* ------------------------------ Mock mode ------------------------------ */

let fellBack = false;

/** Fixtures instead of the network: demo mode, an explicit flag, or after a 404. */
export function isMockMode(): boolean {
  if (typeof window === "undefined") return false;
  if (fellBack || isDemo() || process.env.NEXT_PUBLIC_DRAFT_MOCK === "1") return true;
  try {
    if (new URLSearchParams(window.location.search).get("mock") === "1") {
      window.sessionStorage.setItem(MOCK_KEY, "1");
    }
    return window.sessionStorage.getItem(MOCK_KEY) === "1";
  } catch {
    return false;
  }
}

/** The endpoint is not deployed yet (or the API is unreachable in dev). */
function isMissing(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 404 || err.status === 405 || err.status === 501;
  return err instanceof TypeError; // fetch() network failure
}

async function withMock<T>(real: () => Promise<T>, mock: () => T | Promise<T>): Promise<T> {
  if (isMockMode()) return mock();
  try {
    return await real();
  } catch (err) {
    if (!isMissing(err)) throw err;
    fellBack = true;
    return mock();
  }
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function scanBrand(url: string, draft: OnboardingDraft): Promise<PublicBrandResult> {
  return withMock(
    () => endpoints.publicBrand(url),
    async () => {
      await wait(2600);
      return mockBrand(url, draft);
    },
  );
}

export async function suggestAudiences(draft: OnboardingDraft): Promise<SuggestedAudience[]> {
  return withMock(
    async () => (await endpoints.publicAudiences(draft)).audiences,
    async () => {
      await wait(1300);
      return kitFor(draft.business_type).audiences.map((a) => ({ ...a }));
    },
  );
}

/**
 * The research takes about 30 seconds. A 504 means the request gave up while the work
 * finished into the cache, so asking again is the right move (twice at most).
 */
export async function fetchPlanPreview(draft: OnboardingDraft, brand: PublicBrand | null): Promise<PlanPreview> {
  return withMock(
    async () => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await endpoints.publicPlanPreview(draft);
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 504) || attempt >= 2) throw err;
          await wait(1500);
        }
      }
    },
    async () => {
      await wait(4200);
      return mockPlanPreview(draft, brand);
    },
  );
}

export type LinkErrors = Partial<Record<LinkKey, string>>;

/** Hebrew error per link field, from `POST /public/links` (no model call), or locally. */
export async function validateLinks(links: OnboardingDraft["links"]): Promise<LinkErrors> {
  const filled = Object.fromEntries(Object.entries(links).filter(([, v]) => v && v.trim())) as OnboardingDraft["links"];
  if (!Object.keys(filled).length) return {};
  return withMock(
    async () => (await endpoints.publicLinks(filled)).errors ?? {},
    () => {
      const errors: LinkErrors = {};
      if (filled.website && !looksLikeUrl(filled.website)) errors.website = "הכתובת לא נראית שלמה. למשל: myshop.co.il";
      for (const net of ["instagram", "tiktok"] as const) {
        const handle = normalizeHandle(filled[net] ?? "");
        if (filled[net] && !/^[A-Za-z0-9._]{1,30}$/.test(handle)) errors[net] = "שם משתמש באנגלית, ספרות, נקודה או קו תחתון.";
      }
      return errors;
    },
  );
}

/**
 * Turn the draft into the business. On 404 (the endpoint is not deployed yet) the same
 * result is reached through the existing endpoints: the profile, then the audiences.
 * The brand is read later by /onboarding when there is a site.
 */
export async function saveDraftToAccount(
  draft: OnboardingDraft,
  chosenDirection: PlanDirection | null,
  chosenIdea: PostIdea | null,
): Promise<Business | null> {
  try {
    const res = await endpoints.onboardingFromDraft({
      draft,
      chosen_direction: chosenDirection,
      chosen_idea: chosenIdea,
    });
    return res.business;
  } catch (err) {
    if (!(err instanceof ApiError && (err.status === 404 || err.status === 405))) throw err;
  }
  const model = draft.business_model ?? inferBusinessModel(draft.business_type, draft.offerings);
  const goal = draft.goal && goalsFor(model).some((g) => g.key === draft.goal) ? draft.goal : defaultGoalFor(model);
  const social: Record<string, string> = {};
  if (draft.links.instagram) social.instagram = `https://instagram.com/${draft.links.instagram}`;
  if (draft.links.tiktok) social.tiktok = `https://tiktok.com/@${draft.links.tiktok}`;
  if (draft.links.facebook) social.facebook = normalizeUrl(draft.links.facebook);
  const offerings = [draft.offerings, draft.differentiator ? `מה שמייחד אותנו: ${draft.differentiator}` : ""]
    .filter(Boolean)
    .join("\n");
  const { business } = await endpoints.saveProfile({
    name: draft.business_name,
    website_url: draft.links.website ?? "",
    business_type: draft.business_type,
    offerings,
    location: draft.city ?? "",
    business_model: model,
    social_links: social,
    monthly_budget_ils: 0,
    competitors: (draft.competitors ?? []).map((c) => ({
      name: c.name,
      website_url: c.link && looksLikeUrl(c.link) ? normalizeUrl(c.link) : "",
    })),
    primary_goal: goal,
  });
  for (const [index, audience] of draft.audiences.entries()) {
    try {
      await endpoints.createAudience({
        name: audience.name,
        summary: audience.description,
        description: audience.description,
        needs: [],
        where: [],
        targeting: { interests: [], keywords: [], age_range: "", gender: "", geo: "" },
        priority: index === 0 ? "primary" : "secondary",
      });
    } catch {
      // Audiences are editable later from the business screen; the save must not fail on one.
    }
  }
  return business;
}

/* ------------------------------- Fixtures ------------------------------- */

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function hostOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function mockBrand(url: string, draft: OnboardingDraft): PublicBrandResult {
  const host = hostOf(url);
  if (/fail|invalid|example\.org/.test(host)) {
    return { status: "failed", brand: null, reason_he: "האתר לא ענה בזמן." };
  }
  const preset = LOCAL_PRESETS[hash(host) % LOCAL_PRESETS.length];
  const offerings = draft.offerings
    .split(/[,،\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  return {
    status: "ready",
    brand: {
      business_name: draft.business_name || host.split(".")[0],
      palette: preset.palette.map((swatch) => ({ ...swatch })),
      voice: "ישיר וחם, בגובה העיניים",
      logo_url: null,
      offerings,
    },
  };
}

type IlDate = { date: string; name: string };

/** Enough of the Israeli calendar for the fixtures. The real API uses services/calendar_il.py. */
const IL_DATES: IlDate[] = [
  { date: "2026-10-03", name: "שמחת תורה" },
  { date: "2026-11-27", name: "בלאק פריידי" },
  { date: "2026-12-04", name: "חנוכה" },
  { date: "2027-01-23", name: "ט״ו בשבט" },
  { date: "2027-03-23", name: "פורים" },
  { date: "2027-04-21", name: "פסח" },
  { date: "2027-06-11", name: "שבועות" },
  { date: "2027-07-01", name: "החופש הגדול" },
  { date: "2027-10-02", name: "ראש השנה" },
];

function nextIlDate(now = new Date()): { name: string; days: number } | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (const item of IL_DATES) {
    const days = Math.round((new Date(`${item.date}T00:00:00`).getTime() - today) / 86_400_000);
    if (days >= 3) return { name: item.name, days };
  }
  return null;
}

function joinHe(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ו${items[items.length - 1]}`;
}

export function monthsLabel(months: number[]): string {
  return joinHe([...months].sort((a, b) => a - b).map((m) => MONTHS_HE[m - 1]));
}

const NETWORK_HE: Record<Network, string> = { instagram: "אינסטגרם", facebook: "פייסבוק", tiktok: "טיקטוק" };

type Theme = {
  title: string;
  approach: string;
  why: string;
  steps: string[];
  ideas: Omit<PostIdea, "why" | "direction_index">[];
  reasons: string[];
};

function themesFor(goal: PrimaryGoal, d: OnboardingDraft, event: string): [Theme, Theme] {
  const name = d.business_name || "העסק";
  const offer = firstOffering(d.offerings) || "מה שאתם עושים";
  const diff = d.differentiator?.trim();
  const when = event || "סוף החודש";
  const sales: [Theme, Theme] = [
    {
      title: "להראות את המוצר מקרוב",
      approach: "כל שבוע מוצר אחד בפוקוס, עם דרך ברורה להזמין.",
      why: diff ? `את מה שמייחד אתכם (${diff}) רואים הכי טוב במוצר עצמו.` : "אנשים קונים את מה שהם רואים מקרוב.",
      steps: ["לבחור 4 מוצרים לחודש", "לצלם כל אחד מקרוב, באור טבעי", "לסיים כל פוסט בדרך להזמין"],
      ideas: [
        {
          title: `${offer} מקרוב`,
          format: "reel",
          hook: `ככה נראה ${offer} שלנו מקרוב`,
          caption: `בלי פילטרים ובלי סטודיו. ${offer}, כמו שהוא יוצא אצלנו ב${name}.`,
          cta: "להזמין בהודעה",
          overlay_headline: `${offer}, מקרוב`,
        },
        {
          title: "איך מזמינים",
          format: "carousel",
          hook: "3 צעדים וזה אצלכם",
          caption: "בוחרים, שולחים הודעה, ואנחנו מתאמים איסוף או משלוח. פשוט.",
          cta: "לשלוח הודעה",
          overlay_headline: "3 צעדים וזה אצלכם",
        },
        {
          title: "מה לוקחים השבוע",
          format: "image",
          hook: `ההמלצה שלנו לקראת ${when}`,
          caption: `אם צריך משהו אחד לקראת ${when}, זה ${offer}. שווה להזמין מוקדם.`,
          cta: "לשריין עכשיו",
          overlay_headline: `לקראת ${when}`,
        },
      ],
      reasons: [
        "פוסט שמראה את המוצר מקרוב עונה על השאלה הראשונה: איך זה נראה.",
        "אנשים מוותרים כשלא ברור איך מזמינים. הפוסט הזה מוריד את המחסום.",
        `${when} היא סיבה טבעית לקנות, בלי להמציא מבצע.`,
      ],
    },
    {
      title: "סיבה לחזור",
      approach: `לפנות קודם למי שכבר קנה, עם הצעה אחת ברורה לקראת ${when}.`,
      why: "למכור שוב ללקוח קיים קל יותר מלהביא לקוח חדש.",
      steps: ["להכין הצעה אחת פשוטה", "לספר עליה בוואטסאפ וברשתות", "להזכיר שבוע לפני שהיא נגמרת"],
      ideas: [
        {
          title: "תודה ללקוחות",
          format: "image",
          hook: "לקוחות קבועים, זה בשבילכם",
          caption: `מי שכבר מכיר את ${name} יודע. לקראת ${when} שמרנו לכם משהו קטן.`,
          cta: "לשאול בהודעה",
          overlay_headline: "זה בשבילכם",
        },
        {
          title: "מה אמרו עלינו",
          format: "carousel",
          hook: "מה לקוחות כותבים לנו",
          caption: "צילומי מסך אמיתיים, באישור. בלי לערוך מילה.",
          cta: "לספר לנו גם",
          overlay_headline: "מה כותבים לנו",
        },
        {
          title: "תזכורת אחרונה",
          format: "story",
          hook: "נשארו עוד כמה ימים",
          caption: `ההצעה לקראת ${when} נגמרת בקרוב. מי שרצה, זה הזמן.`,
          cta: "לשריין עכשיו",
          overlay_headline: "עוד כמה ימים",
        },
      ],
      reasons: [
        "מי שכבר קנה מכם צריך רק תזכורת וסיבה.",
        "מילים של לקוחות אמיתיים משכנעות יותר מכל מה שנכתוב.",
        "תזכורת קרובה לסוף ההצעה מביאה את מי שדחה.",
      ],
    },
  ];
  const awareness: [Theme, Theme] = [
    {
      title: `הסיפור של ${name}`,
      approach: "מי אתם, איך זה נעשה ולמה. פוסטים שעושים היכרות.",
      why: "אנשים זוכרים סיפור יותר ממבצע.",
      steps: ["לספר איך הכול התחיל", "להראות יום עבודה רגיל", "להציג את האנשים בעסק"],
      ideas: [
        {
          title: "איך זה התחיל",
          format: "reel",
          hook: `ככה התחיל ${name}`,
          caption: "הרגע שבו החלטנו לפתוח, ומה למדנו מאז.",
          cta: "לעקוב אחרינו",
          overlay_headline: "ככה זה התחיל",
        },
        {
          title: "יום רגיל אצלנו",
          format: "story",
          hook: "בוקר רגיל, מאחורי הדלפק",
          caption: `מה קורה ב${name} לפני שהלקוחות מגיעים.`,
          cta: "לשלוח לנו שאלה",
          overlay_headline: "יום רגיל אצלנו",
        },
        {
          title: "מי אנחנו",
          format: "image",
          hook: "הפנים מאחורי העסק",
          caption: diff ? `${diff}. זה לא סלוגן, ככה אנחנו עובדים.` : "נעים להכיר. אלה האנשים שעושים את זה כל יום.",
          cta: "להגיד שלום",
          overlay_headline: "נעים להכיר",
        },
      ],
      reasons: [
        "סיפור ההתחלה הוא הפוסט שהכי קל לזכור.",
        "מאחורי הקלעים בונה אמון בלי לבקש כלום.",
        "אנשים קונים מאנשים. כאן רואים את מי.",
      ],
    },
    {
      title: "הכתובת בתחום",
      approach: `לענות על שאלות שאנשים שואלים על ${offer}, בפוסטים קצרים.`,
      why: "מי שעונה לשאלות נזכר ברגע שצריך.",
      steps: ["לאסוף 5 שאלות שלקוחות שואלים", "לענות על אחת בכל שבוע", "לבקש מהעוקבים לשאול עוד"],
      ideas: [
        {
          title: "השאלה ששואלים הכי הרבה",
          format: "reel",
          hook: "השאלה שכולם שואלים אותנו",
          caption: `ועל זה התשובה הקצרה. יש עוד שאלה על ${offer}? כתבו לנו.`,
          cta: "לשאול בתגובות",
          overlay_headline: "כולם שואלים",
        },
        {
          title: "טעות נפוצה",
          format: "carousel",
          hook: "3 טעויות שכדאי להכיר",
          caption: "דברים שאנחנו רואים כל שבוע, ואיך נמנעים מהם.",
          cta: "לשמור לפעם הבאה",
          overlay_headline: "3 טעויות נפוצות",
        },
        {
          title: "טיפ לשבוע",
          format: "image",
          hook: "טיפ אחד שיחסוך לכם זמן",
          caption: "קצר ושימושי. ככה עושים את זה נכון.",
          cta: "לשתף עם חבר",
          overlay_headline: "טיפ לשבוע",
        },
      ],
      reasons: [
        "שאלה אמיתית של לקוחות מבטיחה שהפוסט רלוונטי.",
        "תוכן ששומרים לפעם הבאה ממשיך להגיע לאנשים חדשים.",
        "טיפ שימושי הוא הדבר שהכי משתפים.",
      ],
    },
  ];
  const leads: [Theme, Theme] = [
    {
      title: "לענות לפני שפונים",
      approach: "פוסטים שמסבירים מה אתם עושים, איך זה עובד ואיך מתחילים.",
      why: "אנשים פונים כשהם מבינים מה יקרה אחרי הפנייה.",
      steps: ["לכתוב את 3 השאלות שהכי שואלים אתכם", "להסביר איך נראה התהליך", "לסיים בהזמנה לשלוח הודעה"],
      ideas: [
        {
          title: "איך זה עובד",
          format: "carousel",
          hook: "מה קורה אחרי שפונים אלינו",
          caption: "שיחה קצרה, הצעה ברורה, ומתחילים. בלי אותיות קטנות.",
          cta: "לשלוח הודעה",
          overlay_headline: "איך זה עובד",
        },
        {
          title: "שאלה ותשובה",
          format: "reel",
          hook: "הכי שואלים אותנו את זה",
          caption: `תשובה קצרה על ${offer}. לשאלה שלכם, שלחו הודעה.`,
          cta: "לשאול בהודעה",
          overlay_headline: "הכי שואלים",
        },
        {
          title: "למי זה מתאים",
          format: "image",
          hook: "זה בשבילכם אם…",
          caption: diff ? `${diff}. אם זה מה שחיפשתם, דברו איתנו.` : "3 סימנים שאנחנו מתאימים לכם.",
          cta: "לקבוע שיחה",
          overlay_headline: "זה בשבילכם אם…",
        },
      ],
      reasons: [
        "מי שמבין את התהליך פונה בלי לחשוש.",
        "תשובה לשאלה נפוצה חוסכת לכם שיחות ומביאה פניות רציניות.",
        "כשהלקוח מזהה את עצמו, הוא פונה.",
      ],
    },
    {
      title: "סיפורי לקוחות",
      approach: "לקוח אחד בכל שבוע: מה היה, מה עשיתם, מה השתנה.",
      why: "סיפור של לקוח אמיתי משכנע יותר מכל הבטחה.",
      steps: ["לבחור 3 לקוחות מרוצים", "לבקש מהם רשות ומשפט אחד", "להראות לפני ואחרי, כשאפשר"],
      ideas: [
        {
          title: "לפני ואחרי",
          format: "carousel",
          hook: "ככה זה היה, וככה זה נראה היום",
          caption: "לקוח אמיתי, באישור שלו. מה עשינו בדרך.",
          cta: "לשלוח הודעה",
          overlay_headline: "לפני ואחרי",
        },
        {
          title: "במילים של הלקוח",
          format: "image",
          hook: "מה שהלקוח כתב לנו",
          caption: "משפט אחד מלקוח מרוצה, בלי לערוך.",
          cta: "לקבוע שיחה",
          overlay_headline: "במילים שלהם",
        },
        {
          title: "הבעיה שפתרנו",
          format: "reel",
          hook: "הגיעו אלינו עם בעיה אחת",
          caption: "מה הייתה הבעיה, מה עשינו, ומה יצא מזה.",
          cta: "לספר לנו על שלכם",
          overlay_headline: "הבעיה שפתרנו",
        },
      ],
      reasons: [
        "תוצאה אמיתית היא ההוכחה שאנשים מחפשים לפני שהם פונים.",
        "מילים של לקוח משכנעות יותר משלכם.",
        "אנשים מזהים את הבעיה שלהם ומבינים שיש פתרון.",
      ],
    },
  ];
  const personal: [Theme, Theme] = [
    {
      title: "הידע שלכם, בקטן",
      approach: "טיפ אחד בכל שבוע מהניסיון שלכם, במילים פשוטות.",
      why: "מומחה הוא מי שנותן ערך לפני שמבקשים ממנו משהו.",
      steps: ["לרשום 5 טיפים שאתם נותנים ללקוחות", "להקליט אחד בסרטון קצר", "לפרסם באותו יום בכל שבוע"],
      ideas: [
        {
          title: "טיפ מהניסיון",
          format: "reel",
          hook: "משהו שלמדנו אחרי שנים בתחום",
          caption: "טיפ אחד, קצר, שאפשר להשתמש בו כבר היום.",
          cta: "לשמור לפעם הבאה",
          overlay_headline: "למדנו את זה בדרך הקשה",
        },
        {
          title: "מיתוס ואמת",
          format: "carousel",
          hook: "3 דברים שכולם בטוחים בהם, ולא נכונים",
          caption: `על ${offer}, בלי מילים גבוהות.`,
          cta: "לשתף עם חבר",
          overlay_headline: "מיתוס ואמת",
        },
        {
          title: "שאלו אותנו",
          format: "story",
          hook: "שאלו אותנו השבוע",
          caption: "תשובה קצרה לשאלה של עוקב. יש לכם שאלה? שלחו.",
          cta: "לשאול בהודעה",
          overlay_headline: "שאלו אותנו",
        },
      ],
      reasons: [
        "טיפ שימושי בונה מוניטין של מומחה.",
        "לשבור מיתוס מראה שאתם יודעים יותר מהממוצע.",
        "לענות לשאלה אמיתית מראה שאתם זמינים.",
      ],
    },
    {
      title: "מאחורי הקלעים",
      approach: "להראות איך אתם עובדים באמת: ההחלטות, הטעויות וההצלחות.",
      why: "אנשים בוחרים באדם שהם מרגישים שהם מכירים.",
      steps: ["לצלם רגע אחד מכל יום עבודה", "לספר על החלטה אחת שקיבלתם", "לשתף הצלחה של לקוח"],
      ideas: [
        {
          title: "יום עבודה",
          format: "reel",
          hook: "ככה נראה יום עבודה אצלנו",
          caption: "מהבוקר עד הלקוח האחרון, בלי עריכה מבריקה.",
          cta: "לעקוב אחרינו",
          overlay_headline: "יום עבודה",
        },
        {
          title: "החלטה קשה",
          format: "image",
          hook: "למה אמרנו לא ללקוח",
          caption: "לא כל עבודה מתאימה. ככה אנחנו בוחרים איפה להשקיע.",
          cta: "לספר מה אתם חושבים",
          overlay_headline: "למה אמרנו לא",
        },
        {
          title: "הצלחה קטנה",
          format: "story",
          hook: "רגע טוב מהשבוע",
          caption: "משהו קטן שהצליח, ולמה זה חשוב לנו.",
          cta: "לשלוח הודעה",
          overlay_headline: "רגע טוב",
        },
      ],
      reasons: [
        "סרטון אמיתי מיום עבודה עושה היכרות בלי מילים.",
        "להגיד לא מראה שיש לכם עקרונות, ואנשים מעריכים את זה.",
        "הצלחה קטנה ואמיתית משכנעת יותר מהבטחה גדולה.",
      ],
    },
  ];
  if (goal === "brand_awareness") return awareness;
  if (goal === "leads") return leads;
  if (goal === "personal_brand") return personal;
  return sales;
}

const GOAL_HE: Record<PrimaryGoal, string> = {
  sales: "מכירות",
  brand_awareness: "חשיפה",
  leads: "פניות",
  personal_brand: "מיתוג אישי",
};

function mockPlanPreview(d: OnboardingDraft, brand: PublicBrand | null): PlanPreview {
  const model = d.business_model ?? inferBusinessModel(d.business_type, d.offerings);
  const goal: PrimaryGoal = d.goal ?? defaultGoalFor(model);
  const kit = kitFor(d.business_type);
  const next = nextIlDate();
  const event = next && next.days <= 75 ? next.name : "";
  const audienceNames = d.audiences.map((a) => a.name).filter(Boolean);
  const aud = (i: number) => audienceNames[i] ?? audienceNames[0] ?? kit.audiences[i]?.name ?? "לקוחות מהאזור";

  const insights: PlanInsight[] = [];
  if (brand && brand.offerings.length) {
    insights.push({
      text_he: `באתר ראינו ${joinHe(brand.offerings.slice(0, 2))}. נשתמש בצבעים ובסגנון שכבר יש לכם.`,
      source: "site",
    });
  }
  if (d.differentiator?.trim()) {
    insights.push({
      text_he: `מה שמבדיל אתכם: ${d.differentiator.trim()}. זה יופיע בכל פוסט, לא רק באחד.`,
      source: "answers",
    });
  }
  if (next) {
    const nextMonth = new Date(Date.now() + next.days * 86_400_000).getMonth() + 1;
    const busy = d.seasons?.busy.includes(nextMonth);
    insights.push({
      text_he: `${next.name} בעוד ${next.days} ימים. ${busy ? "זו העונה החזקה שלכם, אז מתחילים להתכונן עכשיו." : "זו סיבה טובה להזכיר את עצמכם."}`,
      source: "calendar",
    });
  }
  const regular = (Object.entries(d.activity ?? {}) as [Network, Activity][]).find(([, a]) => a === "regular");
  if (regular) {
    insights.push({
      text_he: `אתם כבר מפרסמים ב${NETWORK_HE[regular[0]]} באופן קבוע. נבנה על זה, לא נתחיל מאפס.`,
      source: "social",
    });
  } else if (d.tried?.what_worked?.trim()) {
    insights.push({ text_he: `סיפרתם שהצליח: ${d.tried.what_worked.trim()}. נעשה מזה עוד.`, source: "answers" });
  }
  insights.push({ text_he: kit.industry, source: "category" });

  const themes = themesFor(goal, d, event);
  const directions: PlanDirection[] = themes.map((theme, index) => ({
    title: theme.title,
    approach_he: theme.approach,
    audience: aud(index === 0 ? 0 : 2),
    goal_he: GOAL_HE[goal],
    why_he: theme.why,
    first_steps: theme.steps,
  }));
  const timings = [
    "בשבוע הראשון, לפתוח את החודש",
    event ? `לפני ${event}` : "לקראת סוף השבוע",
    "באמצע החודש, כשיש שקט",
  ];
  const ideas: PostIdea[] = themes.flatMap((theme, dirIndex) =>
    theme.ideas.map((idea, i) => ({
      ...idea,
      direction_index: dirIndex,
      why: {
        audience: aud(dirIndex === 0 ? i % Math.max(1, audienceNames.length) : 2),
        goal_he: GOAL_HE[goal],
        timing_he: timings[i],
        reason_he: theme.reasons[i],
      },
    })),
  );
  return { insights: insights.slice(0, 4), directions, ideas, brand };
}
