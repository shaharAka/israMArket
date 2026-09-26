/**
 * Section tokens.
 *
 * Every section used to carry its own accent (ink, sand, sage, slate, clay, teal), which
 * made each screen feel like a different product. There is now one system: a neutral
 * page and a single accent — the sage the badges and success states already use. A page
 * says where you are through its eyebrow and the active tab, not through colour.
 *
 * The export shape is unchanged so pages that read `SECTIONS.x.accent` keep working;
 * they simply all get the same values now.
 *
 * Contrast: white on `accent` and `accent` on `surface` both clear AA for small text, so
 * the accent is safe as a filled background and as a label colour.
 */
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
  accent: "#374b3d",
  surface: "#f3f6f1",
  border: "#d3ddcf",
} as const;

export const SECTIONS: Record<SectionKey, SectionIdentity> = {
  dashboard: {
    ...ACCENT,
    eyebrow: "היום",
    purpose: "מה מתקדם, ומה צריך מכם עכשיו",
  },
  strategy: {
    ...ACCENT,
    eyebrow: "התוכנית החודשית",
    purpose: "מה עושים החודש, שבוע אחר שבוע",
  },
  plan: {
    ...ACCENT,
    eyebrow: "התוכנית הרבעונית",
    purpose: "לאן הולכים, ומה היעד של כל חודש",
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
