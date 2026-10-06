/**
 * The 3-month marketing plan (docs/onboarding-v2.md, Revision 5): the hook at the end of
 * /start, stored by `from-draft` and shown again on /strategy.
 *
 * Types mirror the contract of `POST /public/quarter-plan`. Vocabulary (budget ranges,
 * integration names, which help guide explains which integration) lives here so /start
 * and the app say the same thing.
 */
import type { HelpTopic } from "@/components/help/guides";
import type { BusinessModel, PrimaryGoal } from "./api";
import type { LeverKey, Source, TargetKind } from "./goals";

/* --------------------------------- Types --------------------------------- */

export type IntegrationKey =
  | "ga4"
  | "meta_pixel"
  | "gtm"
  | "search_console"
  | "gbp"
  | "meta_business"
  | "whatsapp_link"
  | "instagram_insights"
  | "facebook_insights"
  | "tiktok_business";

export type IntegrationStatus = "have" | "connect" | "install" | "unknown";

export type PostFormat = "reel" | "carousel" | "image" | "story";

/**
 * `POST /public/quarter-plan`. Beyond the Rev 5 contract the API also sends (all optional
 * here): `based_on` on the strategy and channels, `needs` / `available_now` on the KPI,
 * the audiences with the primary one first, the budget's range, basis and linked sources,
 * each calendar month's year/month and each week's dates, the cadence it planned for, the
 * first month, and the inputs it was built from.
 */
export type QuarterPlan = {
  strategy: { one_liner_he: string; angle_he: string; why_he: string; from_insight?: number; based_on?: string };
  kpi: {
    key: string;
    name_he: string;
    how_he: string;
    target?: string;
    baseline_he: string;
    needs?: IntegrationKey[];
    available_now?: boolean;
  };
  measures: { name_he: string; how_he: string; needs: IntegrationKey[]; available_now: boolean }[];
  integrations: { key: IntegrationKey; name_he: string; why_he: string; status: IntegrationStatus; effort_he: string }[];
  channels: {
    key: string;
    name_he: string;
    kind: "existing" | "new";
    why_he: string;
    starts_month: 1 | 2 | 3;
    effort_he: string;
    cadence_he?: string;
    availability?: "needs_check";
    from_insight?: number;
    based_on?: string;
  }[];
  audiences?: { name: string; role: "primary" | "secondary"; message_he: string }[];
  budget: {
    monthly_ils: number | null;
    months: { month_label: string; lines: { channel_key: string; ils_range: [number, number]; note_he?: string }[] }[];
    organic_only: boolean;
    unlock_he?: string;
    sources_he: string[];
    sources?: { title: string; url: string }[];
    range?: string;
    basis_he?: string;
  };
  calendar: {
    month_label: string;
    year?: number;
    month?: number;
    weeks?: { week: 1 | 2 | 3 | 4; focus_he: string; dates_he?: string }[];
    dates: { date: string; name_he: string; action_he: string }[];
    checkpoint_he: string;
  }[];
  content: {
    month_label: string;
    pillars: { key: string; title: string; description_he: string }[];
    cadence: { channel_key: string; per_week: string }[];
    /** How the month's posts split by type (never specific products). */
    mix?: { type_key: ContentType | string; name_he: string; per_month: string; purpose_he: string }[];
    products_note_he?: string;
    /** Plans stored before the content mix: kept, never rendered. */
    example_titles?: { title: string; channel_key: string; format: PostFormat | string }[];
  }[];
  /** Revision 6, "המספרים": today, the lever, the target and its math. Ours, not the model's. */
  numbers?: PlanNumbers;
  /** "מה מחכה לכם בפנים": what the app gives. Fixed on the server. */
  inside?: { key: string; title_he: string; what_he: string }[];
  assumptions: { bet_he: string; if_wrong_he: string }[];
  cadence?: { key: Cadence | string; label_he?: string; posts_per_month?: number; source?: string };
  start?: { year: number; month: number };
  inputs?: Record<string, unknown>;
  changed_he?: string;
  cached: boolean;
};

export type ContentType = "product" | "value" | "behind_scenes" | "social_proof" | "offer" | "community" | "seasonal";

export type PlanNumbers = {
  baseline_he: string;
  baseline_known: boolean;
  lever: { key: LeverKey; name_he: string; recommended_key: LeverKey; recommended_he: string; recommended_name_he: string };
  target?: {
    kind: TargetKind;
    value_min?: number;
    value_max?: number;
    unit_he?: string;
    text_he: string;
    level_he?: string;
    suggested_he?: string;
    accepted: boolean;
    edited_by_owner: boolean;
    from: "owner" | "suggestion";
  };
  math_he: string[];
  budget_he?: string;
  unit_economics_he?: string;
  payback?: "pays" | "partly" | "no" | null;
  assumptions_he: string[];
  sources: Source[];
  organic_only: boolean;
  first_checkpoint_he: string;
  caveat_he: string;
};

/** What the owner shapes on the plan before signup. Only what they touched is set. */
export type Cadence = "1-2" | "3-4" | "5+";

export type PlanInputs = {
  target?: string;
  cadence?: Cadence;
  primary_audience?: string;
  feedback?: string;
  changed?: PlanInputKey[];
};

export type PlanInputKey = "target" | "cadence" | "primary_audience" | "feedback";

export const CADENCE_OPTIONS: { key: Cadence; label: string }[] = [
  { key: "1-2", label: "1-2 בשבוע" },
  { key: "3-4", label: "3-4 בשבוע" },
  { key: "5+", label: "5+ בשבוע" },
];

/** The plan as `from-draft` stores it: without the per-response fields. */
export type StoredQuarterPlan = Omit<QuarterPlan, "cached" | "changed_he">;

export function planForApi(plan: QuarterPlan): StoredQuarterPlan {
  const rest: Partial<QuarterPlan> = { ...plan };
  delete rest.cached;
  delete rest.changed_he;
  return rest as StoredQuarterPlan;
}

/* ---------------------------- /start: the answers ---------------------------- */

export type BudgetRange = "none" | "lt1k" | "1k-3k" | "3k-7k" | "gt7k" | "unknown";

export type GrowWhere = "online" | "store" | "both";

export type DraftBudget = { range: BudgetRange; exact_ils?: number };

export type DraftSuccess = { kpi: string; target?: string };

/**
 * One answer to "מה ייחשב הצלחה?" (`GET /public/success-options`). The contract names the
 * endpoint but not its shape; this is what the client reads, tolerant of extra fields.
 * `goal` ties the KPI to the existing PrimaryGoal keys the month planner reads.
 */
export type SuccessOption = {
  key: string;
  name_he: string;
  hint_he?: string;
  goal?: PrimaryGoal;
  /** "הזמנות באתר", "פניות": what one more success is called, for the target question. */
  unit_he?: string;
  target_steps?: number[];
  /** When the API sends one list for everyone: who the option is for. */
  models?: BusinessModel[];
  grow_where?: GrowWhere[];
};

export const BUDGET_OPTIONS: { key: BudgetRange; label: string; hint?: string }[] = [
  { key: "none", label: "בלי תקציב פרסום, רק זמן" },
  { key: "lt1k", label: "עד 1,000 ₪" },
  { key: "1k-3k", label: "1,000-3,000 ₪" },
  { key: "3k-7k", label: "3,000-7,000 ₪" },
  { key: "gt7k", label: "מעל 7,000 ₪" },
  { key: "unknown", label: "עוד לא יודעים" },
];

export function budgetLabel(budget?: DraftBudget | null): string {
  if (!budget) return "";
  if (budget.exact_ils != null && budget.exact_ils > 0) return `${formatIls(budget.exact_ils)} בחודש`;
  const option = BUDGET_OPTIONS.find((o) => o.key === budget.range);
  return option ? option.label : "";
}

/** The range a typed amount falls in, so the chips follow the number. */
export function rangeForAmount(ils: number): BudgetRange {
  if (ils <= 0) return "none";
  if (ils < 1000) return "lt1k";
  if (ils < 3000) return "1k-3k";
  if (ils < 7000) return "3k-7k";
  return "gt7k";
}

/** A monthly figure for the old profile field (`monthly_budget_ils`): the typed amount, or the range's middle. */
export function budgetIls(budget?: DraftBudget | null): number {
  if (!budget) return 0;
  if (budget.exact_ils != null && budget.exact_ils >= 0) return Math.round(budget.exact_ils);
  const mid: Record<BudgetRange, number> = { none: 0, lt1k: 700, "1k-3k": 2000, "3k-7k": 5000, gt7k: 9000, unknown: 0 };
  return mid[budget.range];
}

/**
 * What one more success is called for each KPI key (`KPI_OPTIONS` in the API), for the
 * optional target question. The API sends the options without a unit.
 */
export const KPI_UNITS: Record<string, { unit_he: string; target_steps: number[] }> = {
  online_orders: { unit_he: "הזמנות באתר", target_steps: [10, 25, 50] },
  store_visits: { unit_he: "לקוחות חדשים בחנות", target_steps: [20, 50, 100] },
  whatsapp_inquiries: { unit_he: "פניות", target_steps: [5, 10, 20] },
  bookings: { unit_he: "פגישות", target_steps: [3, 6, 10] },
  form_leads: { unit_he: "טפסים באתר", target_steps: [5, 10, 20] },
  local_awareness: { unit_he: "עוקבים חדשים", target_steps: [50, 100, 200] },
};

export const GROW_OPTIONS: { key: GrowWhere; label: string }[] = [
  { key: "online", label: "באתר (הזמנות אונליין)" },
  { key: "store", label: "בחנות" },
  { key: "both", label: "בשניהם" },
];

export function formatIls(amount: number): string {
  return `${Math.round(amount).toLocaleString("he-IL")} ₪`;
}

/** "400-700 ₪": a range as one left-to-right number run (a dash would split it in RTL). */
export function formatRange([low, high]: [number, number]): string {
  if (Math.round(low) === Math.round(high)) return formatIls(low);
  return `${Math.round(low).toLocaleString("he-IL")}-${Math.round(high).toLocaleString("he-IL")} ₪`;
}

/* ------------------------------ Integrations ------------------------------ */

/** The existing step-by-step guide for an integration, when there is one. */
export const INTEGRATION_GUIDE: Partial<Record<IntegrationKey, HelpTopic>> = {
  ga4: "google_analytics",
  meta_business: "instagram_business",
  meta_pixel: "instagram_business",
  instagram_insights: "instagram_business",
  gbp: "google_business_profile",
  whatsapp_link: "whatsapp_business",
};

export const STATUS_LABEL: Record<IntegrationStatus, string> = {
  have: "יש לכם",
  connect: "צריך לחבר",
  install: "צריך להתקין באתר",
  unknown: "נבדוק יחד",
};

export const FORMAT_HE: Record<string, string> = { reel: "ריל", carousel: "קרוסלה", image: "תמונה", story: "סטורי" };

/**
 * Channel colours for the budget bars and the channel list: the same channel wears the same
 * colour everywhere (identity by entity, fixed order, never cycled). Validated categorical
 * steps (dataviz reference palette, adjacent pairs); text never wears them.
 */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7"];

export function channelColors(plan: QuarterPlan): Record<string, string> {
  const keys: string[] = [];
  for (const channel of plan.channels) if (!keys.includes(channel.key)) keys.push(channel.key);
  for (const month of plan.budget.months) for (const line of month.lines) if (!keys.includes(line.channel_key)) keys.push(line.channel_key);
  const out: Record<string, string> = {};
  keys.forEach((key, index) => {
    out[key] = SERIES[index] ?? "#8a8c84";
  });
  return out;
}

export function channelName(plan: QuarterPlan, key: string): string {
  return plan.channels.find((c) => c.key === key)?.name_he ?? key;
}
