import { api } from "@/lib/api";

export type Ticket = {
  id: string;
  category: string;
  page: string;
  status: "open" | "suggested" | "waiting" | "resolved";
  ai_status: "pending" | "running" | "done" | "unavailable" | "skipped";
  created_at: string;
  updated_at: string;
  email?: string | null;
  user_id?: number;
  messages: { id: string; role: "user" | "assistant" | "support"; body: string; created_at: string }[];
};
export const SUPPORT_STATUS = { open: "מחכה לצוות", suggested: "יש הצעה בשבילכם", waiting: "הצוות ענה", resolved: "נסגרה" };
export const SUPPORT_CATEGORIES = { other: "שאלה או משהו אחר", plan: "התוכנית", posts: "פוסטים", connections: "חיבורים", results: "תוצאות", bug: "משהו לא עובד", login: "החשבון", billing: "חיוב" };

// Support is real, account-private data. Callers explicitly guard demo mode first.
export const support = {
  mine: () => api<{ tickets: Ticket[] }>("/support", {}, true),
  detail: (id: string) => api<Ticket>(`/support/${id}`, {}, true),
  create: (body: { body: string; client_ref: string; category: string; human: boolean }) =>
    api<Ticket>("/support", { method: "POST", body: JSON.stringify(body) }, true),
  queue: (status: string) => api<{ tickets: Ticket[] }>(`/admin/support?status=${status}`, {}, true),
  reply: (id: string, body: string, client_ref: string, admin = false) => api<Ticket>(`${admin ? "/admin" : ""}/support/${id}/messages`, {
    method: "POST", body: JSON.stringify({ body, client_ref }),
  }, true),
  state: (id: string, status: string, admin = false) => api<Ticket>(`${admin ? "/admin" : ""}/support/${id}`, {
    method: "PATCH", body: JSON.stringify({ status }),
  }, true),
};
