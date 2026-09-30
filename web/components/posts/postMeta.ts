import type { RoadmapPost } from "@/lib/api";

/**
 * Where a post stands, in the three states the owner actually thinks in.
 *
 * Derived only from fields the server already stores: a pasted published link means it went
 * out, an approval means it is ready, anything else is waiting for the owner. There is no
 * fourth "scheduled" state on purpose — the date is shown next to the chip, and a date on its
 * own does not change what the owner has to do.
 */
export type PostStatus = "review" | "approved" | "published";

export function postStatus(post: RoadmapPost): PostStatus {
  if (post.published_url) return "published";
  if (post.approval_status === "approved") return "approved";
  return "review";
}

export const STATUS_LABEL: Record<PostStatus, string> = {
  review: "מחכה לאישור",
  approved: "אושר",
  published: "פורסם",
};

/** Plain status labels: meaning comes from words, not decorative pills. */
export const STATUS_TONE: Record<PostStatus, string> = {
  review: "text-[var(--ink-soft)]",
  approved: "text-[var(--primary)]",
  published: "text-[var(--primary)]",
};

export function isDone(post: RoadmapPost) {
  return postStatus(post) !== "review";
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;
const WEEKDAY_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

/**
 * The day a post belongs to, `YYYY-MM-DD`, or "" when it has none.
 *
 * The owner's own date wins over the plan's hint: once they picked a day, that is the day it
 * goes out. `date_hint` is free text from the model, so it only counts when it starts with a
 * real ISO date.
 */
export function postDay(post: RoadmapPost): string {
  const scheduled = (post.scheduled_for || "").match(ISO_DAY);
  if (scheduled) return scheduled[0];
  const hint = (post.date_hint || "").match(ISO_DAY);
  return hint ? hint[0] : "";
}

/** `2026-09-07` → `ב׳ 7.9`. Two words: the weekday the owner plans by, and the date. */
export function shortDay(iso: string): string {
  const match = iso.match(ISO_DAY);
  if (!match) return iso;
  const [, y, m, d] = match;
  const weekday = new Date(Number(y), Number(m) - 1, Number(d)).getDay();
  return `${WEEKDAY_SHORT[weekday]} ${Number(d)}.${Number(m)}`;
}

/** What the feed and the editor print as the post's date. */
export function postDateLabel(post: RoadmapPost): string {
  const day = postDay(post);
  if (day) return shortDay(day);
  return (post.date_hint || "").trim();
}

/**
 * The next post still waiting for the owner, looking forward from `from` first and then
 * wrapping around, so approving the last post of the month still finds an earlier one that
 * was skipped. `-1` when every post is approved or published.
 */
export function nextPendingIndex(posts: RoadmapPost[], from: number): number {
  for (let step = 1; step <= posts.length; step += 1) {
    const index = (from + step) % posts.length;
    if (index !== from && !isDone(posts[index])) return index;
  }
  return -1;
}
