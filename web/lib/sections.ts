/** Blue product chrome shared by navigation, headings and actions. */
export type SectionKey =
  | "dashboard"
  | "strategy"
  | "plan"
  | "decisions"
  | "assets"
  | "promotion"
  | "business";

export type SectionIdentity = {
  /** Where you are, in the owner's words. */
  eyebrow: string;
  /** Accent for text, markers and rules. */
  accent: string;
  /** Tinted surface for callouts and tiles. */
  surface: string;
  /** Border that pairs with `surface`. */
  border: string;
  /** A one-line statement of what this screen is for. */
  purpose: string;
};

/** The app's one accent. Everything section-coloured reads from here. */
export const ACCENT = {
  accent: "var(--primary)",
  surface: "var(--primary-soft)",
  border: "var(--rule-dark)",
} as const;

export const SECTIONS: Record<SectionKey, SectionIdentity> = {
  dashboard: {
    ...ACCENT,
    eyebrow: "השבוע",
    purpose: "הפוקוס של השבוע, מה למדנו, ומה צריך מכם",
  },
  strategy: {
    ...ACCENT,
    eyebrow: "התוכנית החודשית",
    purpose: "מה עושים החודש, שבוע אחר שבוע",
  },
  plan: {
    ...ACCENT,
    eyebrow: "האסטרטגיה והתוכנית",
    purpose: "הכיוון, הצעדים הקרובים ומה נבדוק כדי להתקדם",
  },
  decisions: {
    ...ACCENT,
    eyebrow: "ההחלטות שלי",
    purpose: "התקציב, האבחון והעדיפויות, שלפיהם אנחנו בונים את התוכניות",
  },
  assets: {
    ...ACCENT,
    eyebrow: "התמונות שלי",
    purpose: "התמונות והסרטונים שלכם, עם תיאור ותגיות שאנחנו כותבים בשבילכם",
  },
  promotion: {
    ...ACCENT,
    eyebrow: "הקידום בגוגל",
    purpose: "כמה יעלה לפרסם בגוגל, על אילו מילים, ומה אפשר להשיג שם בחינם",
  },
  business: {
    ...ACCENT,
    eyebrow: "העסק",
    purpose: "התוכניות, התמונות וההגדרות במקום אחד",
  },
};
