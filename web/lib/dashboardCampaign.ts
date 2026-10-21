import type { StrategyPayload } from "./api";
import { postWeek } from "@/components/posts/postMeta";
import { isPending, lifecycleOf } from "./postLifecycle";

/** Read-only navigation decisions. Saved lifecycle and plan links remain authoritative. */
export function dashboardCampaign(strategy: StrategyPayload, now = new Date()) {
  const posts = strategy.roadmap?.posts || [];
  const pending = posts.findIndex(post => isPending(lifecycleOf(post)));
  const approved = posts.findIndex(post => lifecycleOf(post) === "approved");
  const nextIndex = pending >= 0 ? pending : approved;
  const inMonth = now.getFullYear() === strategy.year && now.getMonth() + 1 === strategy.month;
  const currentWeek = inMonth ? Math.min(4, Math.ceil(now.getDate() / 7)) : null;
  const first = posts[nextIndex] ?? posts[0];
  const week = strategy.post_workspace_only ? 0 : currentWeek ?? (first ? postWeek(first) : 0);
  return {
    week, nextIndex,
    action: pending >= 0 ? "review" as const : approved >= 0 ? "publish" as const : "results" as const,
    posts: posts.map((post, index) => ({ post, index })).filter(item => postWeek(item.post) === week),
  };
}

/** A missing monthly plan may still have quick posts. Permission/network errors stay errors. */
export async function readDashboardSource(current: () => Promise<StrategyPayload>, workspace: () => Promise<StrategyPayload>) {
  try { return await current(); }
  catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 404) return workspace();
    throw error;
  }
}
