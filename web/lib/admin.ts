/**
 * The owner's backoffice (api/app/routers/admin.py; DEPLOY.md, "Backoffice").
 *
 * Every call is live (never the demo) and every /admin route is checked on the server:
 * 401 without a session, 403 `admin_only` for anyone who is not an admin signed in with
 * Google. This file only describes what the server answers.
 *
 * Kept out of lib/api.ts on purpose, like lib/billing.ts: one feature, one owner.
 */
import { api } from "@/lib/api";

export type Stage = "signup" | "business" | "plan" | "approved" | "published" | "measured";
export type ConnectionState = "none" | "connected" | "usable" | "attention";
export type BillingState = "trial" | "trial_ended" | "active" | "payment_failed" | "cancelled";
export type Lifecycle = "needs_owner" | "ready" | "approved" | "published" | "measured";

export type Connection = {
  state: ConnectionState;
  /** The readiness word (ready, reconnect, choose_property…), never an id or a token. */
  status: string | null;
  checked_at: string | null;
  last_success_at: string | null;
};

export type AccountRow = {
  id: number;
  email: string;
  full_name: string;
  created_at: string | null;
  last_seen_at: string | null;
  google_linked: boolean;
  has_password: boolean;
  is_admin: boolean;
  suspended: boolean;
  business: { id: number; name: string } | null;
  stage: { key: Stage; since: string | null; days_in_stage: number | null };
  connections: { google: Connection; meta: Connection };
  billing: {
    state: BillingState;
    exempt: boolean;
    trial_ends_at: string | null;
    days_left: number;
    subscription_status: string | null;
  };
  cost_this_month_usd: number;
};

export type CostMonth = {
  month: string;
  images_usd: number;
  image_calls: number;
  models_usd: number;
  model_calls: number;
  total_usd: number;
};

export type AuditEntry = {
  id: number;
  action: "reset_link" | "sign_out_everywhere" | "suspend" | "reactivate" | "delete" | "billing_exempt" | string;
  admin_user_id: number;
  admin_email: string | null;
  target_user_id: number | null;
  /** Null when the account is gone (deleted, or its id now belongs to a newer account). */
  target_email: string | null;
  details: Record<string, unknown>;
  created_at: string | null;
};

export type AccountDetail = AccountRow & {
  suspended_at: string | null;
  suspended_reason: string;
  businesses: { id: number; name: string; website_url: string; created_at: string | null }[];
  timeline: { key: Stage; reached: boolean; reached_at: string | null }[];
  posts: { total: number; months: number; by_lifecycle: Record<Lifecycle, number> };
  costs: CostMonth[];
  /** An unused reset link exists until this moment. Never the link itself. */
  reset_link_expires_at: string | null;
  audit: AuditEntry[];
};

export type AccountFilters = { q?: string; stage?: string; status?: string; sort?: string };

function live<T>(path: string, options: RequestInit = {}) {
  return api<T>(path, options, true);
}

export const admin = {
  accounts: (filters: AccountFilters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    const query = params.toString();
    return live<{ accounts: AccountRow[]; count: number }>(`/admin/users${query ? `?${query}` : ""}`);
  },
  account: (id: number) => live<AccountDetail>(`/admin/users/${id}`),
  /** The link is in this one answer and nowhere else. */
  resetLink: (id: number) => live<{ url: string; expires_at: string }>(`/admin/users/${id}/reset-link`, { method: "POST" }),
  signOut: (id: number) => live<AccountDetail>(`/admin/users/${id}/sign-out`, { method: "POST" }),
  suspend: (id: number, reason: string) =>
    live<AccountDetail>(`/admin/users/${id}/suspend`, { method: "POST", body: JSON.stringify({ reason }) }),
  reactivate: (id: number) => live<AccountDetail>(`/admin/users/${id}/reactivate`, { method: "POST" }),
  setExempt: (id: number, exempt: boolean) =>
    live<AccountDetail>(`/admin/users/${id}/billing-exempt`, { method: "POST", body: JSON.stringify({ exempt }) }),
  remove: (id: number, confirm_email: string) =>
    live<{ ok: boolean }>(`/admin/users/${id}`, { method: "DELETE", body: JSON.stringify({ confirm_email }) }),
  audit: (beforeId?: number) =>
    live<{ entries: AuditEntry[] }>(`/admin/audit${beforeId ? `?before_id=${beforeId}` : ""}`),
};

// --- words -------------------------------------------------------------------------------

export const STAGE_LABEL: Record<Stage, string> = {
  signup: "נרשמו",
  business: "פרטי העסק",
  plan: "יש תוכנית",
  approved: "פוסט ראשון אושר",
  published: "פוסט ראשון פורסם",
  measured: "פוסט ראשון נמדד",
};

export const CONNECTION_LABEL: Record<ConnectionState, string> = {
  none: "לא מחובר",
  connected: "מחובר, עוד בלי נתונים",
  usable: "יש נתונים",
  attention: "צריך טיפול",
};

/** docs/posts-v2.md: one vocabulary everywhere. */
export const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  needs_owner: "מחכה לכם",
  ready: "מוכן לאישור",
  approved: "אושר",
  published: "פורסם",
  measured: "נמדד",
};

export const ACTION_LABEL: Record<string, string> = {
  reset_link: "קישור לאיפוס סיסמה",
  sign_out_everywhere: "ניתוק מכל המכשירים",
  suspend: "השהיה",
  reactivate: "החזרה לפעילות",
  delete: "מחיקת החשבון",
  billing_exempt: "חשבון חינם",
};

export const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "כל החשבונות" },
  { value: "active", label: "פעילים" },
  { value: "suspended", label: "מושהים" },
  { value: "free", label: "חשבונות חינם" },
  { value: "trial", label: "בחודש החינמי" },
  { value: "trial_ended", label: "החודש החינמי נגמר" },
  { value: "paying", label: "משלמים" },
  { value: "payment_failed", label: "חיוב לא עבר" },
];

export function billingLabel(billing: AccountRow["billing"]): string {
  if (billing.exempt) return "חשבון חינם";
  switch (billing.state) {
    case "trial":
      return billing.days_left === 1 ? "חודש חינם · יום אחרון" : `חודש חינם · עוד ${billing.days_left} ימים`;
    case "trial_ended":
      return "החודש החינמי נגמר";
    case "active":
      return "מנוי פעיל";
    case "payment_failed":
      return "החיוב לא עבר";
    case "cancelled":
      return "המנוי בוטל";
    default:
      return billing.state;
  }
}

// --- formatting ---------------------------------------------------------------------------

const DATE = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jerusalem" });
const DATE_TIME = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jerusalem",
});
const MONTH = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric", timeZone: "UTC" });

export function formatDate(iso: string | null | undefined): string {
  return iso ? DATE.format(new Date(iso)) : "";
}

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? DATE_TIME.format(new Date(iso)) : "";
}

/** "2026-10" → "אוקטובר 2026". */
export function formatMonth(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return MONTH.format(new Date(Date.UTC(year, month - 1, 15)));
}

/** "לפני 3 שעות". `now` is passed in so a render stays pure. */
export function timeAgo(iso: string | null | undefined, now: number): string {
  if (!iso) return "עוד לא";
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 2) return "עכשיו";
  if (minutes < 60) return `לפני ${minutes} דקות`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "לפני שעה" : hours === 2 ? "לפני שעתיים" : `לפני ${hours} שעות`;
  const days = Math.round(hours / 24);
  if (days === 1) return "אתמול";
  if (days === 2) return "לפני יומיים";
  if (days < 30) return `לפני ${days} ימים`;
  return formatDate(iso);
}

/** "$0.09". An estimate at list prices; under a cent but not zero reads "<$0.01". */
export function formatUsd(value: number): string {
  if (value > 0 && value < 0.01) return "<$0.01";
  return `$${value.toFixed(2)}`;
}

export function daysLabel(days: number | null): string {
  if (days === null) return "";
  if (days === 0) return "היום";
  if (days === 1) return "יום אחד";
  if (days === 2) return "יומיים";
  return `${days} ימים`;
}
