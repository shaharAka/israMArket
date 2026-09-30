/**
 * The price, in one place. The landing page, the FAQ and /security read from here, so a
 * change of price or trial is a one-line edit.
 *
 * There is no billing system yet. Nothing here may promise a payment feature that does
 * not exist (invoices, a card on file, self-serve cancellation): the copy says
 * "אין התחייבות" because there is no subscription to be bound by, not "ביטול בקליק".
 */

/** Monthly price in shekels. */
export const PRICE_ILS = 99;

/** The free trial, as the owner reads it. */
export const TRIAL_LABEL = "החודש הראשון חינם";

/**
 * OPEN DECISION (owner): does the price include VAT? Default: it does not.
 * If it does, change to "המחיר כולל מע״מ".
 */
export const VAT_NOTE = "המחיר לא כולל מע״מ";

/**
 * True today: /start and /signup never ask for a card (there is nowhere to put one).
 * Set to false the day signup starts asking for payment details, and the line disappears.
 */
export const NO_CARD_AT_SIGNUP = true;

/** Shown next to the price. */
export const NO_COMMITMENT_LABEL = "אין התחייבות";

/**
 * A general anchor, no market figure. True at 99 ₪; set to null if the price moves to a
 * level where it stops being obviously true.
 */
export const COMPARISON_NOTE: string | null = "פחות ממה שעולה בדרך כלל שעת עבודה אחת של מנהלת סושיאל.";

/** Formatted like the rest of the app: digits, shekel sign after the number. */
export function formatPrice(ils: number = PRICE_ILS): string {
  return `${ils.toLocaleString("he-IL")} ₪`;
}

/**
 * What the plan includes. Only features that exist in the app today; each line names the
 * screen it lives on so it can be checked.
 */
export const PLAN_INCLUDES: string[] = [
  "תוכנית שיווק לכל חודש, ומחקר שבועי על המתחרים, החיפושים בגוגל ולוח השנה", // /plan, /strategy, services/research.py
  "פוסטים כתובים לכל החודש, בסגנון שלכם", // /posts
  "עיצוב לכל פוסט, בצבעים של העסק", // CardCanvas
  "ערכה מוכנה לפרסום: כיתוב, תמונה וקישור", // PublishPanel
  "עמוד תוצאות: מה הצליח ומה לא", // /performance
  "הערכה כמה יעלה לקדם את העסק בגוגל", // /promotion
  "מדריכים קצרים לכל חיבור והגדרה", // /help
];
