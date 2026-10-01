import type { RoadmapPost, StrategyPayload } from "@/lib/api";
import { isPending, lifecycleOf } from "@/lib/postLifecycle";

/* Where a post stands is its lifecycle (lib/postLifecycle.ts): one vocabulary on the feed,
   the editor, the calendar and the dashboard. How each state looks (the word first, a small
   dot beside it) lives with the rest of the chrome, in chrome.module.css
   `.status[data-status=…]`. */
export { LIFECYCLE_LABEL, lifecycleOf } from "@/lib/postLifecycle";

/** Approved or further along: nothing left for the owner before it goes out. */
export function isDone(post: RoadmapPost) {
  return !isPending(lifecycleOf(post));
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

/** The plan week a post belongs to: its plan link's, else the week it was written for. */
export function postWeek(post: RoadmapPost): number {
  const week = post.plan_link?.week ?? post.week;
  return typeof week === "number" && Number.isFinite(week) && week > 0 ? week : 0;
}

/**
 * The week's focus in the plan's own words: the post's plan link first, then the month's
 * weekly focus, then the weekly breakdown. "" when the plan never named one.
 */
export function weekFocus(
  week: number,
  post?: RoadmapPost | null,
  strategy?: Pick<StrategyPayload, "roadmap" | "weekly_breakdown"> | null
): string {
  return (
    post?.plan_link?.week_focus?.trim() ||
    strategy?.roadmap?.weekly_focus?.find((item) => item.week === week)?.focus?.trim() ||
    strategy?.weekly_breakdown?.find((item) => item.week === week)?.focus?.trim() ||
    ""
  );
}
