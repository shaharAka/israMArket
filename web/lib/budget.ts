/**
 * Budget stages, mirroring the published Israeli market data in
 * `api/app/services/cost_model.py` (STAGE_* / RETARGETING_ONLY_BELOW_NIS).
 *
 * The numbers live in Python because they drive the real plan. This mirror exists only
 * so the UI can tell the owner what their money buys before they commit to it — keep
 * both sides in sync if the source data is ever updated.
 */
export const RETARGETING_ONLY_BELOW_NIS = 2_500;
export const STAGE_GROWTH_NIS = 5_000;
export const STAGE_SCALE_FLOOR_NIS = 10_000;

export type BudgetStageKey = "below_viable" | "validation" | "growth" | "scale";

export type BudgetStage = {
  key: BudgetStageKey;
  title: string;
  range: string;
  /** What this level of spend can realistically buy. */
  buys: string;
  /** A representative amount used when the owner picks the stage instead of typing. */
  suggestion: number;
};

export const BUDGET_STAGES: BudgetStage[] = [
  {
    key: "below_viable",
    title: "רימרקטינג בלבד",
    range: `עד ${RETARGETING_ONLY_BELOW_NIS.toLocaleString("he-IL")} ₪`,
    buys: "מתחת לרף הזה לא כדאי לנסות לגייס לקוחות חדשים בכסף. עדיף להשקיע במי שכבר מכיר אתכם.",
    suggestion: 1_800,
  },
  {
    key: "validation",
    title: "בדיקה",
    range: `${RETARGETING_ONLY_BELOW_NIS.toLocaleString("he-IL")}–${STAGE_GROWTH_NIS.toLocaleString("he-IL")} ₪`,
    buys: "מספיק כדי לבדוק איזה מסר, קהל ומבצע עובדים — לפני שמגדילים.",
    suggestion: 3_500,
  },
  {
    key: "growth",
    title: "צמיחה",
    range: `${STAGE_GROWTH_NIS.toLocaleString("he-IL")}–${STAGE_SCALE_FLOOR_NIS.toLocaleString("he-IL")} ₪`,
    buys: "מספיק כדי להגדיל מה שכבר הוכיח את עצמו, ולא רק לבחון.",
    suggestion: 7_000,
  },
  {
    key: "scale",
    title: "סקייל",
    range: `מעל ${STAGE_SCALE_FLOOR_NIS.toLocaleString("he-IL")} ₪`,
    buys: "תקציב למשפך מלא: 60% לקרים, 30% לחמים, 10% לנאמנות.",
    suggestion: 12_000,
  },
];

export function stageFor(budget: number): BudgetStage {
  const value = Number.isFinite(budget) ? Math.max(budget, 0) : 0;
  if (value < RETARGETING_ONLY_BELOW_NIS) return BUDGET_STAGES[0];
  if (value < STAGE_GROWTH_NIS) return BUDGET_STAGES[1];
  if (value < STAGE_SCALE_FLOOR_NIS) return BUDGET_STAGES[2];
  return BUDGET_STAGES[3];
}

/** Formats an amount the way the rest of the UI writes shekels. */
export function formatNis(amount: number): string {
  return `${Math.round(amount).toLocaleString("he-IL")} ₪`;
}
