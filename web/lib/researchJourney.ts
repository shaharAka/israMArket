import type { OnboardingDraft } from "./draft";
export const BUSINESS_SEGMENTS = [
  { key: "fundraising", label: "מגייסים תרומות", model: "services" },
  { key: "software", label: "מוכרים תוכנה", model: "saas" },
  { key: "services", label: "נותנים שירות", model: "services" },
  { key: "online_shop", label: "בעלי חנות אונליין", model: "products" },
  { key: "physical_shop", label: "בעלי חנות פיזית", model: "products" },
] as const;
export type Segment = typeof BUSINESS_SEGMENTS[number]["key"];
export type Observation = {
  key: "outcomes" | "order_value" | "marketing_budget";
  status: "unknown" | "exact" | "range";
  lower?: number | null; upper?: number | null;
  unit: "count" | "ILS";
  period: "last_30_days" | "per_order" | "per_project" | "per_month" | "per_donation";
  source: "owner";
};
export type ResearchJourney = {
  version: 1; segment: Segment; phase: "before" | "after"; step: string;
  replies: { question: string; answer: string }[];
  metric?: "purchases" | "store_sales" | "qualified_inquiries" | "booked_work" | "paid_accounts" | "demos" | "trials" | "donations" | "recurring_donors";
  observations: Observation[];
};
export type SavedResearchJourney = ResearchJourney & { answers: Omit<OnboardingDraft, "research_journey"> };
export type DiscoveryResult = {
  sources: { kind: string; url: string; status: "read" | "limited" | "blocked" | "unavailable" | "not_read"; read_at?: string | null }[];
  facts?: { quote: string; url: string; read_at?: string | null }[];
  questions: { question: string; quote: string; source: "website" | "answers"; url?: string }[];
  assisted: boolean;
};
export const METRICS: Record<Segment, { key: NonNullable<ResearchJourney["metric"]>; label: string }[]> = {
  online_shop: [{ key: "purchases", label: "רכישות שהושלמו באתר" }],
  physical_shop: [{ key: "store_sales", label: "מכירות בחנות" }],
  services: [{ key: "qualified_inquiries", label: "פניות שמתאימות לשירות שלי" }, { key: "booked_work", label: "פגישות או עבודות שנסגרו" }],
  software: [{ key: "paid_accounts", label: "לקוחות משלמים" }, { key: "demos", label: "הדגמות עם לקוחות מתאימים" }, { key: "trials", label: "התנסויות במוצר" }],
  fundraising: [{ key: "donations", label: "תרומות שהתקבלו" }, { key: "recurring_donors", label: "תורמים קבועים" }],
};
export function observationValid(value: Observation) {
  return value.status === "unknown" || (typeof value.lower === "number" && Number.isFinite(value.lower) && value.lower >= 0 && value.lower <= 1e9 && (value.unit !== "count" || Number.isInteger(value.lower)) && (value.status === "exact" || (typeof value.upper === "number" && Number.isFinite(value.upper) && value.upper >= value.lower && value.upper <= 1e9 && (value.unit !== "count" || Number.isInteger(value.upper)))));
}
