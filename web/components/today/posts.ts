import type { RoadmapPost } from "@/lib/api";

/**
 * Where a tap on a post goes: the posts screen, opened on that post.
 *
 * `post` is the deep-link parameter the posts feed reads. A roadmap post has no id of its
 * own — its position in the month is its identity everywhere else in the app — so the
 * value is the index. `i` is the older spelling of the same thing, kept so the link still
 * lands on the right post on a posts page that has not learned `post` yet.
 */
export function postHref(index: number): string {
  return `/posts?post=${index}&i=${index}`;
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

export type PostState = "published" | "approved" | "waiting";

export function postState(post: RoadmapPost): PostState {
  if (post.published_url) return "published";
  if (post.approval_status === "approved") return "approved";
  return "waiting";
}

export const STATE_LABEL: Record<PostState, string> = {
  published: "פורסם",
  approved: "אושר",
  waiting: "מחכה לך",
};
