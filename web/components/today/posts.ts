import type { RoadmapPost } from "@/lib/api";

/**
 * Where a tap on a post goes: the posts screen, opened on that post.
 *
 * `post` is the deep-link parameter the posts feed reads. A roadmap post has no id of its
 * own — its position in the month is its identity everywhere else in the app — so the
 * value is the index.
 */
export function postHref(index: number): string {
  return `/posts?post=${index}`;
}

const WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

/** `2026-09-07` → `יום ב׳ 7.9`. The day the owner set wins over the plan's suggestion. */
export function postDay(post: RoadmapPost): string {
  const iso = post.scheduled_for || post.date_hint || "";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  const weekday = new Date(year, month - 1, day).getDay();
  return `יום ${WEEKDAYS[weekday]} ${day}.${month}`;
}

/* A post's state is its lifecycle (lib/postLifecycle.ts), the same words the posts screen,
   the editor and the calendar use: מחכה לכם · מוכן לאישור · מאושר · פורסם · נמדד. */
export { LIFECYCLE_LABEL, lifecycleOf } from "@/lib/postLifecycle";
