/**
 * Per-section visual identity.
 *
 * Every page used to share one template — eyebrow, h1, subtitle, stack of bordered
 * boxes — so navigating never felt like arriving anywhere. Each section now carries its
 * own accent, and more importantly its own layout grammar (see each page). These tokens
 * are the part that must stay consistent across the set.
 */
export type SectionKey = "dashboard" | "strategy" | "plan" | "decisions" | "assets" | "promotion";

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

export const SECTIONS: Record<SectionKey, SectionIdentity> = {
  dashboard: {
    eyebrow: "החודש שלך",
    accent: "#20211f",
    surface: "#f4f3ee",
    border: "#dedcd4",
    purpose: "מה מתקדם, ומה צריך מכם עכשיו",
  },
  strategy: {
    eyebrow: "התוכנית החודשית",
    accent: "#685f47",
    surface: "#fcf9f2",
    border: "#e2d7c3",
    purpose: "מה עושים החודש, שבוע אחר שבוע",
  },
  plan: {
    eyebrow: "התוכנית הרבעונית",
    accent: "#374b3d",
    surface: "#f3f7f1",
    border: "#c7d6c2",
    purpose: "לאן הולכים, ומה אבן הדרך בכל חודש",
  },
  decisions: {
    eyebrow: "ההחלטות שלי",
    accent: "#3f4a5c",
    surface: "#f3f4f7",
    border: "#ccd2dd",
    purpose: "התקציב, האבחון והעדיפויות שמהם נבנות התוכניות",
  },
  assets: {
    eyebrow: "הנכסים שלי",
    accent: "#7d4436",
    surface: "#fbf4f0",
    border: "#e3cec4",
    purpose: "התמונות והסרטונים שלכם, עם תיאור ותגיות שהמערכת כותבת לבד",
  },
  // A muted teal: the one cool hue left that does not read as the sage of the quarterly
  // plan or the slate of the decisions screen, so "Google" is recognisable at a glance.
  promotion: {
    eyebrow: "הקידום בגוגל",
    accent: "#2f5d57",
    surface: "#f0f6f5",
    border: "#c7dad7",
    purpose: "מה גוגל הייתה עולה לעסק הזה, על אילו מילים, ומה אפשר להשיג שם בחינם",
  },
};
