/**
 * Revision 6 (docs/onboarding-v2.md): setting the goal like a professional. Where the
 * business is today (the baseline), what is right to grow (the lever), and the calculated
 * 3-month target from `POST /public/target-suggestion` (api/app/services/goal_numbers.py).
 *
 * The API owns the calculation. This file holds the vocabulary the screens show (chips,
 * levers) and a small mirror of the baseline arithmetic, so the consultant can say it back
 * instantly ("בערך 40 הזמנות בחודש, ממוצע 180 ₪ — כ-7,200 ₪ בחודש."). Keep the chip keys,
 * ranges and wording in step with goal_numbers.py.
 */
import type { BusinessModel } from "./api";
import type { GrowWhere } from "./quarterPlan";

/* --------------------------------- Types --------------------------------- */

export type BaselineField =
  | "orders_month"
  | "avg_order_ils"
  | "online_share"
  | "returning"
  | "inquiries_month"
  | "close_rate"
  | "deal_value_ils"
  | "capacity_more"
  | "margin_pct";

/** A chip key ("20-50"), "unknown" (לא בטוחים), or the exact number the owner typed. */
export type BaselineValue = string | number;
export type DraftBaseline = Partial<Record<BaselineField, BaselineValue>>;

export type LeverKey = "new_customers" | "bigger_basket" | "returning" | "close_more" | "fill_quiet";
export type DraftLever = { primary: LeverKey; secondary?: LeverKey };

export type TargetKind =
  | "orders"
  | "inquiries"
  | "clients"
  | "avg_order"
  | "deal_value"
  | "repeat_orders"
  | "close_rate"
  | "qualitative";

/** The target the owner accepted or edited: the increase over today, in `unit_he`. */
export type DraftTarget = {
  kind: TargetKind;
  value_min?: number;
  value_max?: number;
  unit_he: string;
  text_he?: string;
  accepted: boolean;
  edited_by_owner: boolean;
};

export type Suggestion = {
  kind: TargetKind;
  min: number;
  max: number;
  unit_he: string;
  pct_min?: number;
  pct_max?: number;
  headline_he: string;
  level_he?: string;
};

export type Source = { title: string; url: string };

/** `POST /public/target-suggestion`. */
export type TargetSuggestion = {
  baseline_summary_he: string;
  baseline_known: boolean;
  recommended_lever: LeverKey;
  lever_hint_he: string;
  lever: LeverKey;
  lever_name_he: string;
  levers: { key: LeverKey; name_he: string; when_he: string }[];
  suggestion: Suggestion | null;
  qualitative_he?: string;
  first_checkpoint_he: string;
  math_he: string[];
  budget_he?: string;
  unit_economics_he?: string;
  payback?: "pays" | "partly" | "no" | null;
  assumptions_he: string[];
  sources: Source[];
  organic_only: boolean;
  caveat_he: string;
};

export const UNKNOWN = "unknown";

/* ------------------------------ The questions ------------------------------ */

export type Chip = { key: string; label: string };

export type BaselineQuestion = {
  field: BaselineField;
  label: string;
  chips: Chip[];
  /** The exact field: what it is in, and how the typed number is stored. */
  exact?: { unit: string; placeholder: string; max: number; outOfTen?: boolean };
};

const RANGES: Partial<Record<BaselineField, Record<string, [number, number | null]>>> = {
  orders_month: { lt20: [0, 20], "20-50": [20, 50], "50-200": [50, 200], gt200: [200, null] },
  avg_order_ils: { lt100: [0, 100], "100-300": [100, 300], "300-1000": [300, 1000], gt1000: [1000, null] },
  inquiries_month: { lt5: [0, 5], "5-15": [5, 15], "15-40": [15, 40], gt40: [40, null] },
  deal_value_ils: { lt2k: [0, 2000], "2k-10k": [2000, 10000], "10k-30k": [10000, 30000], gt30k: [30000, null] },
  capacity_more: { none: [0, 0], "1-2": [1, 2], "3-5": [3, 5], gt5: [5, null] },
  close_rate: { "1of10": [10, 10], "3of10": [30, 30], half: [50, 50], most: [70, 70] },
  margin_pct: { m20: [20, 20], m40: [40, 40], m60: [60, null] },
};

const MARGIN: BaselineQuestion = {
  field: "margin_pct",
  label: "כמה נשאר לכם מכל מכירה, בערך?",
  chips: [
    { key: "m20", label: "20%" },
    { key: "m40", label: "40%" },
    { key: "m60", label: "60% ומעלה" },
  ],
  exact: { unit: "%", placeholder: "35", max: 95 },
};

/** "איפה העסק היום": the questions for this business, one screen. */
export function baselineQuestions(model: BusinessModel, grow?: GrowWhere): BaselineQuestion[] {
  if (model === "services") {
    return [
      {
        field: "inquiries_month",
        label: "כמה פניות מגיעות בחודש?",
        chips: [
          { key: "lt5", label: "עד 5" },
          { key: "5-15", label: "5-15" },
          { key: "15-40", label: "15-40" },
          { key: "gt40", label: "40+" },
        ],
        exact: { unit: "פניות", placeholder: "6", max: 100000 },
      },
      {
        field: "close_rate",
        label: "כמה מהן הופכות ללקוחות?",
        chips: [
          { key: "1of10", label: "1 מתוך 10" },
          { key: "3of10", label: "3 מתוך 10" },
          { key: "half", label: "חצי" },
          { key: "most", label: "רובן" },
        ],
        exact: { unit: "מתוך 10", placeholder: "2", max: 10, outOfTen: true },
      },
      {
        field: "deal_value_ils",
        label: "כמה שווה לקוח, בממוצע?",
        chips: [
          { key: "lt2k", label: "עד 2,000 ₪" },
          { key: "2k-10k", label: "2-10 אלף" },
          { key: "10k-30k", label: "10-30 אלף" },
          { key: "gt30k", label: "30 אלף+" },
        ],
        exact: { unit: "₪", placeholder: "25000", max: 10000000 },
      },
      {
        field: "capacity_more",
        label: "כמה לקוחות נוספים אפשר לקבל בחודש?",
        chips: [
          { key: "none", label: "אין מקום" },
          { key: "1-2", label: "1-2" },
          { key: "3-5", label: "3-5" },
          { key: "gt5", label: "יותר מ-5" },
        ],
        exact: { unit: "לקוחות", placeholder: "2", max: 10000 },
      },
      MARGIN,
    ];
  }
  const questions: BaselineQuestion[] = [
    {
      field: "orders_month",
      label: "כמה הזמנות וקניות יש בחודש?",
      chips: [
        { key: "lt20", label: "עד 20" },
        { key: "20-50", label: "20-50" },
        { key: "50-200", label: "50-200" },
        { key: "gt200", label: "200+" },
      ],
      exact: { unit: "בחודש", placeholder: "40", max: 100000 },
    },
    {
      field: "avg_order_ils",
      label: "סכום ממוצע לקנייה",
      chips: [
        { key: "lt100", label: "עד 100 ₪" },
        { key: "100-300", label: "100-300 ₪" },
        { key: "300-1000", label: "300-1,000 ₪" },
        { key: "gt1000", label: "1,000 ₪+" },
      ],
      exact: { unit: "₪", placeholder: "180", max: 1000000 },
    },
  ];
  if (grow === "both") {
    questions.push({
      field: "online_share",
      label: "כמה מזה באתר?",
      chips: [
        { key: "mostly_online", label: "רובן באתר" },
        { key: "half", label: "בערך חצי" },
        { key: "mostly_store", label: "רובן בחנות" },
      ],
    });
  }
  questions.push(
    {
      field: "returning",
      label: "כמה מהקונים חוזרים לקנות שוב?",
      chips: [
        { key: "few", label: "מעט" },
        { key: "half", label: "בערך חצי" },
        { key: "most", label: "רובם" },
      ],
    },
    MARGIN,
  );
  return questions;
}

/* -------------------------------- The levers -------------------------------- */

type LeverCopy = { key: LeverKey; models: BusinessModel[]; name: [string, string]; when: [string, string] };

// [products, services]. Mirrors goal_numbers.LEVERS.
const LEVERS: LeverCopy[] = [
  {
    key: "new_customers",
    models: ["products", "services", "both"],
    name: ["יותר לקוחות חדשים", "יותר לקוחות חדשים"],
    when: [
      "נכון כשכל קנייה משאירה מספיק כדי לשלם על פרסום.",
      "נכון כשיש מקום, ורוב הפניות כבר נסגרות.",
    ],
  },
  {
    key: "close_more",
    models: ["services", "both"],
    name: ["לסגור יותר מהפניות", "לסגור יותר מהפניות"],
    when: ["נכון כשמגיעות פניות, אבל מעט מהן נסגרות.", "נכון כשמגיעות פניות, אבל מעט מהן נסגרות."],
  },
  {
    key: "bigger_basket",
    models: ["products", "services", "both"],
    name: ["קנייה ממוצעת גדולה יותר", "עסקה ממוצעת גדולה יותר"],
    when: [
      "נכון כשרוב הקונים לוקחים מוצר אחד וזהו.",
      "נכון כשהיומן מלא: חבילה או מחיר, לא עוד פניות.",
    ],
  },
  {
    key: "returning",
    models: ["products", "services", "both"],
    name: ["לקוחות שחוזרים יותר", "לקוחות שחוזרים וממליצים"],
    when: ["נכון כשרוב הקונים קונים פעם אחת.", "נכון כשלקוחות מרוצים יכולים לחזור או להמליץ."],
  },
  {
    key: "fill_quiet",
    models: ["products", "services", "both"],
    name: ["למלא את החודשים השקטים", "למלא את החודשים השקטים"],
    when: ["נכון כשיש כל שנה חודשים חלשים קבועים.", "נכון כשיש כל שנה חודשים חלשים קבועים."],
  },
];

const side = (model: BusinessModel) => (model === "services" ? 1 : 0);

export function leversFor(model: BusinessModel): { key: LeverKey; name_he: string; when_he: string }[] {
  return LEVERS.filter((l) => l.models.includes(model)).map((l) => ({
    key: l.key,
    name_he: l.name[side(model)],
    when_he: l.when[side(model)],
  }));
}

export function leverName(key: LeverKey | undefined, model: BusinessModel): string {
  const lever = LEVERS.find((l) => l.key === key);
  return lever ? lever.name[side(model)] : "";
}

export function isLeverFor(key: string | undefined, model: BusinessModel): key is LeverKey {
  return Boolean(LEVERS.find((l) => l.key === key)?.models.includes(model));
}

/* ------------------------------ The arithmetic ------------------------------ */

type Value = { low: number; high: number | null; point: number; exact: boolean; key?: string };

function resolve(field: BaselineField, raw: BaselineValue | undefined): Value | null {
  if (raw == null || raw === "" || raw === UNKNOWN) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? { low: raw, high: raw, point: raw, exact: true } : null;
  const span = RANGES[field]?.[raw];
  if (!span) return null;
  const [low, high] = span;
  return { low, high, point: high == null ? low : (low + high) / 2, exact: false, key: raw };
}

const halfUp = (x: number) => Math.floor(x + 0.5);

/** 7,200 · 1.2 · 444 (mirrors goal_numbers._n). */
export function n(x: number): string {
  if (Math.abs(x) < 10 && !Number.isInteger(x) && Math.abs(x - halfUp(x)) >= 0.05) {
    return x.toFixed(1).replace(/\.0$/, "");
  }
  return halfUp(x).toLocaleString("en-US");
}

function range(low: number, high: number): string {
  return n(low) === n(high) ? n(low) : `${n(low)}-${n(high)}`;
}

function nice(x: number): number {
  if (x >= 1000) return Math.round(x / 100) * 100;
  if (x >= 100) return Math.round(x / 10) * 10;
  return x;
}

function label(v: Value): string {
  if (v.exact) return n(v.point);
  if (v.high == null) return `יותר מ-${n(v.low)}`;
  if (v.low === 0) return `עד ${n(v.high)}`;
  return range(v.low, v.high);
}

function closeLabel(v: Value): string {
  const tenth = v.point / 10;
  return Number.isInteger(tenth) ? `${n(tenth)} מתוך 10` : `${n(v.point)}%`;
}

function marginLabel(v: Value): string {
  return `${n(v.point)}%${v.exact || v.high != null ? "" : " ומעלה"}`;
}

export function baselineKnown(baseline: DraftBaseline | undefined, model: BusinessModel): boolean {
  const b = baseline ?? {};
  return model === "services" ? Boolean(resolve("inquiries_month", b.inquiries_month)) : Boolean(resolve("orders_month", b.orders_month));
}

/** The baseline said back, with the arithmetic. Mirrors goal_numbers.baseline_summary. */
export function baselineSummary(baseline: DraftBaseline | undefined, model: BusinessModel, grow?: GrowWhere): string {
  const b = baseline ?? {};
  const parts: string[] = [];
  let value: Value | null;
  if (model === "services") {
    const inquiries = resolve("inquiries_month", b.inquiries_month);
    const rate = resolve("close_rate", b.close_rate);
    const deal = resolve("deal_value_ils", b.deal_value_ils);
    const capacity = resolve("capacity_more", b.capacity_more);
    if (inquiries) {
      let first = `בערך ${label(inquiries)} פניות בחודש`;
      if (rate) {
        const clients = (inquiries.point * rate.point) / 100;
        first += `, ${closeLabel(rate)} נסגרות`;
        first += deal
          ? ` — כ-${n(clients)} לקוחות, כ-${n(nice(clients * deal.point))} ₪ בחודש`
          : ` — כ-${n(clients)} לקוחות בחודש`;
      }
      parts.push(`${first}.`);
      if (deal && !rate) parts.push(`לקוח שווה לכם בערך ${label(deal)} ₪.`);
    } else if (deal) {
      parts.push(`לקוח שווה לכם בערך ${label(deal)} ₪.`);
    }
    if (capacity) {
      parts.push(capacity.high === 0 ? "אין מקום ללקוחות נוספים כרגע." : `אפשר לקבל עוד ${label(capacity)} לקוחות בחודש.`);
    }
    value = deal;
  } else {
    const orders = resolve("orders_month", b.orders_month);
    const avg = resolve("avg_order_ils", b.avg_order_ils);
    if (orders && avg) {
      parts.push(`בערך ${label(orders)} הזמנות בחודש, ממוצע ${label(avg)} ₪ — כ-${n(nice(orders.point * avg.point))} ₪ בחודש.`);
    } else if (orders) {
      parts.push(`בערך ${label(orders)} הזמנות בחודש.`);
    } else if (avg) {
      parts.push(`קנייה ממוצעת של בערך ${label(avg)} ₪.`);
    }
    const share = b.online_share;
    if (share != null && share !== UNKNOWN && grow === "both") {
      if (typeof share === "number") parts.push(`כ-${n(share)}% מזה באתר.`);
      else parts.push({ mostly_online: "רובן באתר.", half: "בערך חצי באתר.", mostly_store: "רובן בחנות." }[share] ?? "");
    }
    const returning = b.returning;
    if (returning != null && returning !== UNKNOWN) {
      if (typeof returning === "number") parts.push(`כ-${n(returning)}% מהקונים חוזרים.`);
      else parts.push({ few: "מעט קונים חוזרים.", half: "בערך חצי מהקונים חוזרים.", most: "רוב הקונים חוזרים." }[returning] ?? "");
    }
    value = avg;
  }
  const margin = resolve("margin_pct", b.margin_pct);
  if (margin && value) {
    const what = model === "services" ? "מכל לקוח" : "מכל קנייה";
    parts.push(`${what} נשארים לכם כ-${n(nice((value.point * margin.point) / 100))} ₪.`);
  } else if (margin) {
    parts.push(`מכל מכירה נשארים לכם כ-${marginLabel(margin)}.`);
  }
  const text = parts.filter(Boolean);
  if (!text.length) return "עוד לא יודעים כמה יש היום. נמדוד מהשבוע הראשון, וזו תהיה נקודת הפתיחה.";
  if (!baselineKnown(b, model)) text.push("את השאר נמדוד מהשבוע הראשון.");
  return text.join(" ");
}

/**
 * After "מה הכי נכון להגדיל": what one step of the lever is worth, in their own numbers.
 * Never a promise; only multiplication of what they told us.
 */
export function leverReflection(lever: LeverKey, baseline: DraftBaseline | undefined, model: BusinessModel): string {
  const b = baseline ?? {};
  const name = leverName(lever, model);
  if (model === "services") {
    const deal = resolve("deal_value_ils", b.deal_value_ils);
    const inquiries = resolve("inquiries_month", b.inquiries_month);
    if (lever === "close_more" && deal && inquiries) {
      return `הבנו: ${name}. מ-${n(inquiries.point)} פניות, כל פנייה נוספת שנסגרת שווה כ-${n(deal.point)} ₪.`;
    }
    if (lever === "bigger_basket" && deal) {
      return `הבנו: ${name}. כל 10% יותר בעסקה הם כ-${n(nice(deal.point * 0.1))} ₪ יותר מכל לקוח.`;
    }
    if (deal) return `הבנו: ${name}. כל לקוח חדש שווה לכם כ-${n(deal.point)} ₪.`;
    return `הבנו: ${name}. התוכנית תיבנה סביב זה.`;
  }
  const orders = resolve("orders_month", b.orders_month);
  const avg = resolve("avg_order_ils", b.avg_order_ils);
  const margin = resolve("margin_pct", b.margin_pct);
  if (lever === "bigger_basket" && orders) {
    return `הבנו: ${name}. כל 10 ₪ יותר בקנייה הם עוד כ-${n(orders.point * 10)} ₪ בחודש, על ${n(orders.point)} הזמנות.`;
  }
  if (lever === "returning" && avg) {
    return `הבנו: ${name}. כל קנייה חוזרת היא עוד כ-${n(avg.point)} ₪, בלי לשלם על פרסום.`;
  }
  if (avg && margin) {
    return `הבנו: ${name}. כל לקוח חדש שווה כ-${n(avg.point)} ₪, ומשאיר לכם כ-${n(nice((avg.point * margin.point) / 100))} ₪.`;
  }
  if (avg) return `הבנו: ${name}. כל לקוח חדש שווה כ-${n(avg.point)} ₪ בקנייה.`;
  return `הבנו: ${name}. התוכנית תיבנה סביב זה.`;
}

/** "+9 עד +25 הזמנות בחודש". Mirrors goal_numbers.headline / target_text. */
export function targetText(target: DraftTarget | null | undefined): string {
  if (!target) return "";
  if (target.kind === "qualitative" || target.value_min == null) return (target.text_he ?? "").trim();
  const low = target.value_min;
  const high = target.value_max ?? low;
  return n(low) === n(high) ? `+${n(low)} ${target.unit_he}` : `+${n(low)} עד +${n(high)} ${target.unit_he}`;
}

export function targetFromSuggestion(result: TargetSuggestion): DraftTarget | null {
  const s = result.suggestion;
  if (s) return { kind: s.kind, value_min: s.min, value_max: s.max, unit_he: s.unit_he, accepted: true, edited_by_owner: false };
  if (result.qualitative_he) return { kind: "qualitative", unit_he: "", text_he: result.qualitative_he, accepted: true, edited_by_owner: false };
  return null;
}

/** The baseline as the API takes it: only answered questions, numbers as numbers. */
export function baselineForApi(baseline: DraftBaseline | undefined): DraftBaseline | undefined {
  if (!baseline) return undefined;
  const out: DraftBaseline = {};
  for (const [field, value] of Object.entries(baseline) as [BaselineField, BaselineValue][]) {
    if (value === "" || value == null) continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;
    out[field] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/* ------------------------------- Mock (?mock=1) ------------------------------- */

/**
 * The target-suggestion fixture for mock mode only (lib/draft.ts `withMock`). It follows
 * the same rules with the same published ranges, so a walk-through reads like the real
 * thing, but it is not the API and is never used implicitly.
 */
export function mockTargetSuggestion(input: {
  model: BusinessModel;
  grow?: GrowWhere;
  baseline?: DraftBaseline;
  lever?: DraftLever;
  budgetIls: number;
  hasSite: boolean;
  slowMonths: number[];
}): TargetSuggestion {
  const { model, grow, baseline, budgetIls } = input;
  const b = baseline ?? {};
  const services = model === "services";
  const orders = resolve("orders_month", b.orders_month);
  const avg = resolve("avg_order_ils", b.avg_order_ils);
  const margin = resolve("margin_pct", b.margin_pct);
  const inquiries = resolve("inquiries_month", b.inquiries_month);
  const rate = resolve("close_rate", b.close_rate);
  const deal = resolve("deal_value_ils", b.deal_value_ils);
  const meta = !services && input.hasSite && grow !== "store";
  // Kan Media (Meta): CPC 1.2-4.5, cost per purchase 80-220. Rulers (Google, general row): CPC 6-12, 3%-5%.
  const cost: [number, number] = meta ? [80, 220] : [120, 400];
  let recommended: LeverKey = "new_customers";
  let why = "עוד אין לנו מספרים, אז מתחילים ממה שהכי קל למדוד: לקוחות חדשים.";
  if (services && rate && inquiries && rate.point <= 30) {
    recommended = "close_more";
    why = `רק ${closeLabel(rate)} פניות נסגרות. עוד פנייה אחת מכל 10 שנסגרת היא ${halfUp((10 / rate.point) * 100)}% יותר לקוחות, בלי לשלם על פנייה אחת נוספת.`;
  } else if (!services && b.returning === "few") {
    recommended = "returning";
    why = "מעט קונים חוזרים. לקוח שחוזר לא עולה פרסום, ושם הכי קל לגדול.";
  } else if (!services && avg && margin && (avg.point * margin.point) / 100 < cost[0]) {
    recommended = b.returning === "most" ? "bigger_basket" : "returning";
    why = `כל קנייה משאירה לכם כ-${n(nice((avg.point * margin.point) / 100))} ₪, וקנייה מפרסום עולה לפי המקור ${cost[0]}-${cost[1]} ₪. קודם מרוויחים יותר מלקוחות שכבר יש.`;
  } else if (input.slowMonths.length) {
    recommended = "fill_quiet";
    why = "יש לכם חודשים שקטים. שם הכי קל לגדול.";
  } else if (orders || inquiries) {
    why = "יש לאן לגדול. עכשיו שווה להביא לקוחות חדשים.";
  }
  const lever = input.lever && isLeverFor(input.lever.primary, model) ? input.lever.primary : recommended;
  const math: string[] = [];
  let suggestion: Suggestion | null = null;
  const sources: Source[] = [];
  if (!services && orders && avg) math.push(`היום: ${n(orders.point)} הזמנות × ${n(avg.point)} ₪ = כ-${n(nice(orders.point * avg.point))} ₪ בחודש.`);
  if (services && inquiries && rate) math.push(`היום: ${n(inquiries.point)} פניות × ${closeLabel(rate)} = כ-${n((inquiries.point * rate.point) / 100)} לקוחות בחודש.`);
  if ((lever === "new_customers" || lever === "fill_quiet") && budgetIls > 0) {
    const low = Math.floor(budgetIls / cost[1]);
    const high = Math.floor(budgetIls / cost[0]);
    math.push(`${n(budgetIls)} ₪ ${meta ? "באינסטגרם ובפייסבוק" : "בחיפוש בגוגל"}, לפי ${cost[0]}-${cost[1]} ₪ ל${meta ? "קנייה" : "פנייה"}.`);
    const unit = meta ? "הזמנות בחודש" : "פניות בחודש";
    const base = meta ? orders?.point : inquiries?.point;
    const pct = base ? ([halfUp((low / base) * 100), halfUp((high / base) * 100)] as [number, number]) : undefined;
    suggestion = {
      kind: meta ? "orders" : "inquiries",
      min: low,
      max: high,
      unit_he: unit,
      ...(pct ? { pct_min: pct[0], pct_max: pct[1] } : {}),
      headline_he: `+${n(low)} עד +${n(high)} ${unit}${pct ? ` (+${pct[0]}%-${pct[1]}%)` : ""}`,
    };
    math.push(`היעד: ${suggestion.headline_he}.`);
    sources.push({ title: meta ? "Kan Media: כמה עולה פרסום באינסטגרם ובפייסבוק לחנות בישראל" : "רולרס — כמה באמת עולה קמפיין Google Ads מוצלח בישראל?", url: meta ? "https://kanmedia.co.il/" : "https://www.rulers.co.il/blog/how-much-does-a-successful-google-ads-campaign-really-cost-in-israel/" });
  } else if (lever === "bigger_basket" && (services ? deal : avg)) {
    const value = (services ? deal : avg) as Value;
    const low = Math.max(1, halfUp(value.point * 0.05));
    const high = Math.max(1, halfUp(value.point * 0.1));
    const unit = services ? "₪ לעסקה ממוצעת" : "₪ לקנייה ממוצעת";
    math.push("הנחת עבודה: מארז, מוצר משלים או משלוח חינם מעל סכום מגדילים את הקנייה הממוצעת ב-5%-10%.");
    math.push(`${n(value.point)} ₪ × 5%-10% = עוד ${range(low, high)} ₪.`);
    suggestion = { kind: services ? "deal_value" : "avg_order", min: low, max: high, unit_he: unit, pct_min: 5, pct_max: 10, headline_he: `+${n(low)} עד +${n(high)} ${unit} (+5%-10%)` };
  } else if (lever === "returning" && orders) {
    const low = halfUp(orders.point * 0.05);
    const high = halfUp(orders.point * 0.1);
    if (high >= 1) {
      math.push("הנחת עבודה: תזכורת קבועה בוואטסאפ או מועדון לקוחות מחזירים עוד 5-10 מכל 100 לקוחות.");
      math.push(`${n(orders.point)} הזמנות בחודש × 5%-10% = עוד ${range(low, high)} הזמנות חוזרות בחודש.`);
      suggestion = { kind: "repeat_orders", min: low, max: high, unit_he: "הזמנות חוזרות בחודש", pct_min: 5, pct_max: 10, headline_he: `+${n(low)} עד +${n(high)} הזמנות חוזרות בחודש (+5%-10%)` };
    }
  } else if (lever === "close_more" && inquiries && rate) {
    const p = rate.point;
    const low = (inquiries.point * (Math.min(p + 10, 90) - p)) / 100;
    const high = (inquiries.point * (Math.min(p + 20, 90) - p)) / 100;
    math.push("הנחת עבודה: מענה באותו יום ומעקב אחרי כל הצעה סוגרים עוד 1-2 מכל 10 פניות.");
    math.push(`${n(inquiries.point)} פניות × עוד 1-2 מכל 10 = עוד ${range(low, high)} לקוחות בחודש.`);
    suggestion = { kind: "close_rate", min: 1, max: 2, unit_he: "מכל 10 פניות נסגרות", level_he: `${n((p + 10) / 10)}-${n((p + 20) / 10)} מתוך 10 (היום ${n(p / 10)})`, headline_he: "+1 עד +2 מכל 10 פניות נסגרות" };
  }
  if (suggestion && !sources.length) {
    sources.push({ title: meta ? "Kan Media: כמה עולה פרסום באינסטגרם ובפייסבוק לחנות בישראל" : "רולרס — כמה באמת עולה קמפיין Google Ads מוצלח בישראל?", url: meta ? "https://kanmedia.co.il/" : "https://www.rulers.co.il/blog/how-much-does-a-successful-google-ads-campaign-really-cost-in-israel/" });
    math.push(`לשם השוואה: ${meta ? "קנייה חדשה מפרסום" : "פנייה חדשה מגוגל"} עולה לפי המקור ${cost[0]}-${cost[1]} ₪.`);
  }
  if (!suggestion && (lever === "new_customers" || lever === "fill_quiet") && !budgetIls) {
    math.push("בלי תקציב פרסום אין מספר אמיתי לכמה לקוחות חדשים יגיעו. לא ננחש: נמדוד חודש, ואז נקבע יעד.");
  }
  let economics: string | undefined;
  let payback: TargetSuggestion["payback"] = null;
  if (!services && avg && margin) {
    const worth = (avg.point * margin.point) / 100;
    payback = worth >= cost[1] ? "pays" : worth >= cost[0] ? "partly" : "no";
    economics =
      `כל קנייה משאירה לכם כ-${n(nice(worth))} ₪ (${n(avg.point)} ₪ × ${marginLabel(margin)}). זה המקסימום שכדאי לשלם כדי להביא קנייה חדשה. ` +
      (payback === "no"
        ? `לפי המקור, קנייה מפרסום עולה ${cost[0]}-${cost[1]} ₪, יותר מזה: על הקנייה הראשונה זה הפסד.`
        : `לפי המקור, קנייה מפרסום עולה ${cost[0]}-${cost[1]} ₪.`);
    if (!sources.length) sources.push({ title: "Kan Media: כמה עולה פרסום באינסטגרם ובפייסבוק לחנות בישראל", url: "https://kanmedia.co.il/" });
  }
  return {
    baseline_summary_he: baselineSummary(baseline, model, grow),
    baseline_known: baselineKnown(baseline, model),
    recommended_lever: recommended,
    lever_hint_he: why,
    lever,
    lever_name_he: leverName(lever, model),
    levers: leversFor(model),
    suggestion,
    ...(suggestion
      ? {}
      : { qualitative_he: services ? "בחודש הראשון רושמים כל פנייה ומאיפה הגיעה. זו נקודת הפתיחה, ובסוף החודש קובעים יעד במספרים." : "בחודש הראשון סופרים כל יום כמה לקוחות חדשים הגיעו ומאיפה שמעו עלינו. בסוף החודש קובעים יעד במספרים." }),
    first_checkpoint_he: suggestion ? "בסוף החודש הראשון: בודקים כמה נוסף מול היעד, ומחליטים אם להמשיך, לשנות או להגדיל." : "בסוף החודש הראשון: כמה לקוחות חדשים הגיעו, ומה הביא אותם.",
    math_he: math.slice(0, 4),
    ...(economics ? { unit_economics_he: economics } : {}),
    payback,
    assumptions_he: ["נתוני תצוגה (?mock=1). החישוב האמיתי מגיע מהשרת."],
    sources,
    organic_only: !budgetIls,
    caveat_he: "טווח לתכנון, לא הבטחה.",
  };
}
