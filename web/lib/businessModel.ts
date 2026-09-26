/**
 * The products / services fork, mirrored for the UI.
 *
 * The backend owns which goals and which diagnostics are valid (see
 * `api/app/services/business_model.py`); this file decides how they are asked. Both
 * onboarding and the decisions screen read from here so the two screens cannot drift
 * into asking different questions for the same business.
 */
import type { BusinessModel, Diagnostics, PrimaryGoal } from "@/lib/api";

export const DEFAULT_BUSINESS_MODEL: BusinessModel = "products";

export const BUSINESS_MODEL_OPTIONS: { key: BusinessModel; title: string; desc: string }[] = [
  {
    key: "products",
    title: "מוצרים",
    desc: "חנות רגילה או אונליין, מאפייה, מסעדה",
  },
  {
    key: "services",
    title: "שירותים",
    desc: "עצמאים, סטודיו או בעלי מקצוע: עיצוב, ייעוץ, קליניקה, הדרכה",
  },
  {
    key: "both",
    title: "גם מוצרים וגם שירותים",
    desc: "מוכרים מוצר וגם נותנים שירות",
  },
];

type GoalOption = { key: PrimaryGoal; title: string; desc: string };

const PRODUCT_GOALS: GoalOption[] = [
  { key: "sales", title: "מכירות", desc: "שיותר אנשים יקנו מכם" },
  { key: "brand_awareness", title: "חשיפה", desc: "שיותר אנשים יכירו את העסק" },
];

const SERVICE_GOALS: GoalOption[] = [
  { key: "leads", title: "פניות", desc: "שיותר אנשים יפנו אליכם וישאלו" },
  { key: "personal_brand", title: "מיתוג אישי", desc: "שיכירו אתכם כמומחים בתחום" },
];

export const GOALS_BY_MODEL: Record<BusinessModel, GoalOption[]> = {
  products: PRODUCT_GOALS,
  services: SERVICE_GOALS,
  both: [...PRODUCT_GOALS, ...SERVICE_GOALS],
};

/** The goal to fall back to when the model changes and the old goal is no longer valid. */
export const DEFAULT_GOAL_BY_MODEL: Record<BusinessModel, PrimaryGoal> = {
  products: "sales",
  services: "leads",
  both: "sales",
};

export function goalsFor(model: BusinessModel): GoalOption[] {
  return GOALS_BY_MODEL[model] ?? PRODUCT_GOALS;
}

export function defaultGoalFor(model: BusinessModel): PrimaryGoal {
  return DEFAULT_GOAL_BY_MODEL[model] ?? "sales";
}

export function isGoalValidFor(model: BusinessModel, goal: PrimaryGoal): boolean {
  return goalsFor(model).some((option) => option.key === goal);
}

export type DiagnosticChoice = { key: string; title: string; desc?: string };

export type DiagnosticQuestion = {
  field: "has_customer_club" | "repeat_vs_new" | "priority_channel" | "lead_source" | "has_portfolio" | "brand_owner";
  title: string;
  note?: string;
  options: DiagnosticChoice[];
};

export const CLUB_QUESTION: DiagnosticQuestion = {
  field: "has_customer_club",
  title: "יש לכם מועדון לקוחות או רשימת תפוצה?",
  note: "זה רק כדי לדעת במה להתמקד. אנחנו לא מתחברים למערכת הלקוחות שלכם ולא רואים נתונים עליהם.",
  options: [
    { key: "yes", title: "כן, יש", desc: "מועדון או רשימה ששולחים אליה הודעות" },
    { key: "no", title: "אין", desc: "אין דרך מסודרת לפנות שוב ללקוחות" },
    { key: "unsure", title: "לא ממש", desc: "יש משהו, אבל לא מסודר" },
  ],
};

export const REPEAT_QUESTION: DiagnosticQuestion = {
  field: "repeat_vs_new",
  title: "רוב הלקוחות שלכם חוזרים או חדשים?",
  options: [
    { key: "mostly_repeat", title: "בעיקר חוזרים", desc: "הלקוחות כבר מכירים אתכם" },
    { key: "balanced", title: "בערך חצי־חצי", desc: "גם קבועים וגם חדשים" },
    { key: "mostly_new", title: "בעיקר חדשים", desc: "רובם מגיעים בפעם הראשונה" },
  ],
};

export const CHANNEL_QUESTION: DiagnosticQuestion = {
  field: "priority_channel",
  title: "מה חשוב יותר לחזק עכשיו?",
  note: "זו העדפה, לא התחייבות. אפשר לשנות אותה בכל חודש.",
  options: [
    { key: "physical", title: "החנות הפיזית", desc: "להביא עוד אנשים לחנות" },
    { key: "online", title: "המכירות אונליין", desc: "עוד הזמנות מהאתר או מהוואטסאפ" },
    { key: "balanced", title: "את שניהם", desc: "גם את החנות וגם את האונליין" },
  ],
};

export const LEAD_SOURCE_QUESTION: DiagnosticQuestion = {
  field: "lead_source",
  title: "מאיפה מגיעות אליכם פניות היום?",
  note: "זה קובע אם נחזק את מה שכבר עובד או נפתח ערוץ חדש.",
  options: [
    { key: "referrals", title: "המלצות", desc: "לקוחות מרוצים ממליצים עליכם" },
    { key: "social", title: "אינסטגרם / פייסבוק", desc: "פונים אחרי שרואים אתכם שם" },
    { key: "search", title: "גוגל", desc: "מחפשים ומוצאים אתכם" },
    { key: "mixed", title: "מכמה מקומות", desc: "אין מקור אחד עיקרי" },
    { key: "none", title: "כמעט אין פניות", desc: "צריך לבנות את זה מאפס" },
  ],
};

export const PORTFOLIO_QUESTION: DiagnosticQuestion = {
  field: "has_portfolio",
  title: "יש לכם תיק עבודות או סיפורי לקוחות מסודרים?",
  note: "בעסק של שירותים, זה מה שסוגר לקוחות. אם אין, בדרך כלל מתחילים מזה.",
  options: [
    { key: "yes", title: "כן, מסודר", desc: "אפשר לשלוח אליו מי שפונה" },
    { key: "partial", title: "חלקית", desc: "יש עבודות, אבל הן לא מסודרות להצגה" },
    { key: "no", title: "אין", desc: "יש עבודות, אבל אין איפה להראות אותן" },
  ],
};

export const BRAND_OWNER_QUESTION: DiagnosticQuestion = {
  field: "brand_owner",
  title: "מי הפנים של העסק: אתם או שם הסטודיו?",
  note: "בשירותים אנשים קונים מאדם. זה משנה מה נשים בחזית.",
  options: [
    { key: "personal", title: "אני", desc: "הלקוחות מכירים אותי בשם" },
    { key: "studio", title: "שם הסטודיו", desc: "לעסק יש שם משלו, נפרד ממני" },
    { key: "unsure", title: "עוד לא החלטתי", desc: "אפשר לבדוק את זה יחד" },
  ],
};

export const DIAGNOSTIC_QUESTIONS: Record<BusinessModel, DiagnosticQuestion[]> = {
  products: [CLUB_QUESTION, REPEAT_QUESTION, CHANNEL_QUESTION],
  services: [LEAD_SOURCE_QUESTION, PORTFOLIO_QUESTION, BRAND_OWNER_QUESTION],
  both: [CHANNEL_QUESTION, REPEAT_QUESTION, LEAD_SOURCE_QUESTION, PORTFOLIO_QUESTION],
};

export function diagnosticQuestionsFor(model: BusinessModel): DiagnosticQuestion[] {
  return DIAGNOSTIC_QUESTIONS[model] ?? DIAGNOSTIC_QUESTIONS.products;
}

/** The free-text capacity question, phrased for what the money is meant to produce. */
export function capacityCopy(model: BusinessModel): { title: string; note: string; placeholder: string } {
  if (model === "services") {
    return {
      title: "כמה פרויקטים או לקוחות אתם יכולים לקחת במקביל?",
      note: "לא חובה. התשובה קובעת אם התוכנית תחפש עוד פניות, או תעזור לסגור יותר מהפניות שכבר מגיעות.",
      placeholder: "למשל: עובדת לבד, עד 3 פרויקטים במקביל.",
    };
  }
  return {
    title: "אם יגיעו פי שניים לקוחות, תעמדו בזה?",
    note: "לא חובה. התשובה קובעת אם התוכנית תחפש עוד לקוחות, או תעזור להזיז לקוחות לימים השקטים ולמכור להם יותר בכל ביקור.",
    placeholder: "למשל: אני לבד בעסק, ולא אעמוד ביותר מ־30 לקוחות ביום.",
  };
}

/** Only the diagnostics that belong to this model, so switching model cannot leave a
 *  shop's answers attached to a service business. */
export function pruneDiagnostics(model: BusinessModel, diagnostics: Diagnostics): Diagnostics {
  const allowed = new Set(diagnosticQuestionsFor(model).map((question) => question.field));
  return {
    has_customer_club: allowed.has("has_customer_club") ? diagnostics.has_customer_club ?? null : null,
    repeat_vs_new: allowed.has("repeat_vs_new") ? diagnostics.repeat_vs_new ?? null : null,
    priority_channel: allowed.has("priority_channel") ? diagnostics.priority_channel ?? null : null,
    lead_source: allowed.has("lead_source") ? diagnostics.lead_source ?? null : null,
    has_portfolio: allowed.has("has_portfolio") ? diagnostics.has_portfolio ?? null : null,
    brand_owner: allowed.has("brand_owner") ? diagnostics.brand_owner ?? null : null,
    capacity_constraint: diagnostics.capacity_constraint ?? "",
  };
}
