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
    desc: "חנות פיזית, אונליין, או מאפייה ומסעדה — משהו שנמכר",
  },
  {
    key: "services",
    title: "שירותים",
    desc: "עצמאי, סטודיו או בעל מקצוע — עיצוב, ייעוץ, קליניקה, הדרכה",
  },
  {
    key: "both",
    title: "גם מוצרים וגם שירותים",
    desc: "מוכרים מוצר וגם נותנים שירות",
  },
];

type GoalOption = { key: PrimaryGoal; title: string; desc: string };

const PRODUCT_GOALS: GoalOption[] = [
  { key: "sales", title: "מכירות", desc: "עוד רכישות של מה שאתם מוכרים" },
  { key: "brand_awareness", title: "חשיפה", desc: "שיותר אנשים יכירו את העסק" },
];

const SERVICE_GOALS: GoalOption[] = [
  { key: "leads", title: "לידים ופניות", desc: "שיותר אנשים יפנו אליכם וישאלו" },
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
  title: "יש לכם קלאב לקוחות או רשימת תפוצה?",
  note: "זו שאלת עדיפות בלבד — אין חיבור למערכת קלאבים או CRM, ואנחנו לא קוראים נתונים על הלקוחות שלכם.",
  options: [
    { key: "yes", title: "כן, יש", desc: "קלאב או רשימת תפוצה שפונים אליה" },
    { key: "no", title: "אין", desc: "אין דרך מסודרת לפנות שוב ללקוחות" },
    { key: "unsure", title: "לא בטוח", desc: "יש משהו, אבל לא מסודר" },
  ],
};

export const REPEAT_QUESTION: DiagnosticQuestion = {
  field: "repeat_vs_new",
  title: "רוב הלקוחות שלכם חוזרים או חדשים?",
  options: [
    { key: "mostly_repeat", title: "בעיקר חוזרים", desc: "הלקוחות כבר מכירים אתכם" },
    { key: "balanced", title: "בערך חצי־חצי", desc: "תמהיל של קבועים וחדשים" },
    { key: "mostly_new", title: "בעיקר חדשים", desc: "רוב התנועה היא פעם ראשונה" },
  ],
};

export const CHANNEL_QUESTION: DiagnosticQuestion = {
  field: "priority_channel",
  title: "מה חשוב יותר לחזק עכשיו?",
  note: "זו העדפה, לא התחייבות — אפשר לשנות אותה בכל חודש.",
  options: [
    { key: "physical", title: "החנות הפיזית", desc: "להביא עוד אנשים לסניף" },
    { key: "online", title: "האונליין", desc: "עוד הזמנות מהאתר או וואטסאפ" },
    { key: "balanced", title: "את שניהם יחד", desc: "לחזק את שניהם במקביל" },
  ],
};

export const LEAD_SOURCE_QUESTION: DiagnosticQuestion = {
  field: "lead_source",
  title: "מאיפה מגיעות אליכם פניות היום?",
  note: "זה קובע אם נחזק את מה שכבר עובד או נפתח ערוץ חדש.",
  options: [
    { key: "referrals", title: "המלצות", desc: "לקוחות מרוצים מספרים הלאה" },
    { key: "social", title: "אינסטגרם / פייסבוק", desc: "פונים אחרי שרואים אתכם שם" },
    { key: "search", title: "גוגל", desc: "מחפשים ומוצאים אתכם" },
    { key: "mixed", title: "מכמה מקומות", desc: "אין ערוץ אחד דומיננטי" },
    { key: "none", title: "כמעט אין פניות", desc: "צריך לבנות את זה מאפס" },
  ],
};

export const PORTFOLIO_QUESTION: DiagnosticQuestion = {
  field: "has_portfolio",
  title: "יש לכם תיק עבודות או מקרי ביקורת מסודרים?",
  note: "לעסק שירותים זה הכלי שסוגר לקוח — אם אין, זה לרוב הצעד הראשון.",
  options: [
    { key: "yes", title: "כן, מסודר", desc: "אפשר להפנות אליו פניות" },
    { key: "partial", title: "יש חלקית", desc: "יש עבודות אבל לא מסודר להצגה" },
    { key: "no", title: "אין", desc: "העבודות קיימות, אבל לא במקום שאפשר להראות" },
  ],
};

export const BRAND_OWNER_QUESTION: DiagnosticQuestion = {
  field: "brand_owner",
  title: "השם שאתם בונים הוא שלכם או של הסטודיו?",
  note: "בשירותים אנשים קונים מאדם. זה משנה מה נשים בחזית.",
  options: [
    { key: "personal", title: "שלי, אישי", desc: "אני הפנים של העסק" },
    { key: "studio", title: "של הסטודיו", desc: "שם מותג נפרד ממני" },
    { key: "unsure", title: "עוד לא החלטתי", desc: "אפשר לבחון את זה יחד" },
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
      note: "זו לא שאלת תפעול — היא קובעת אם התוכנית תחפש עוד פניות, או תעדיף לסגור טוב יותר את מה שכבר הגיע. לא חובה.",
      placeholder: "לדוגמה: עובדת לבד, עד שלושה פרויקטים במקביל.",
    };
  }
  return {
    title: "מה יקרה אם הביקוש יכפיל את עצמו?",
    note: "זו לא שאלת תפעול — היא קובעת אם התוכנית תחפש עוד לקוחות, או תעדיף להפנות את הביקוש הקיים לימים שקטים ולסל גדול יותר. לא חובה.",
    placeholder: "לדוגמה: אני לבד בעסק, או שאין קיבולת ליותר מ־X לקוחות ביום.",
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
