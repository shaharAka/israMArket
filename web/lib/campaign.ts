import { api, type RoadmapPost, type StrategyPayload } from "@/lib/api";
import { isPending, lifecycleOf } from "./postLifecycle";

export type RevisionKind = "text" | "layout" | "image" | "video" | "video_edit" | "finish";
export type VideoOptions = { asset_id?: number; start?: number; end?: number; overlay_png?: string; overlay_headline?: string };
export type CampaignRevision = {
  id: string; strategy_id: number; kind: RevisionKind; instruction: string;
  state: "working" | "ready" | "failed" | "kept" | "undone" | "discarded";
  created_at: string; error: string;
  items: { uid: string; original: RoadmapPost; proposal: RoadmapPost | null; state: string; error: string }[];
};
export function protectedPost(post: RoadmapPost) {
  return Boolean(post.published_at || post.published_url || post.scheduled_for || ["approved", "published", "scheduled"].includes(post.approval_status || ""));
}
/** Navigation only: never ask to regenerate approved work or publish a scheduled post again. */
export function nextCampaignPost(posts: RoadmapPost[]) {
  const pending = posts.findIndex(post => !protectedPost(post) && isPending(lifecycleOf(post)));
  const approved = posts.findIndex(post => lifecycleOf(post) === "approved" && !post.scheduled_for && !post.published_at && !post.published_url);
  return { index: pending >= 0 ? pending : approved, action: pending >= 0 ? "review" as const : approved >= 0 ? "publish" as const : "results" as const };
}
/** Selection is explicit, capped, and limited to drafts; the API independently enforces this. */
export function toggleCampaignSelection(posts: RoadmapPost[], selected: string[], uid: string) {
  const post = posts.find(post => post.uid === uid);
  if (!uid || !post || protectedPost(post)) return selected;
  return selected.includes(uid) ? selected.filter(value => value !== uid) : selected.length < 3 ? [...selected, uid] : selected;
}
export function supportsLayout(post: RoadmapPost) {
  return !post.video_url && post.has_overlay !== false && post.design?.text_mode !== "photo_only";
}
export const campaignEndpoints = {
  history: () => api<{ revisions: CampaignRevision[] }>("/campaign/revisions"),
  create: (post_uids: string[], kind: RevisionKind, instruction: string, request_id: string, options: VideoOptions = {}) =>
    api<CampaignRevision>("/campaign/revisions", { method: "POST", body: JSON.stringify({ post_uids, kind, instruction, request_id, options }) }),
  get: (id: string) => api<CampaignRevision>(`/campaign/revisions/${id}`),
  choose: (id: string, action: "keep" | "undo" | "discard") =>
    api<{ revision: CampaignRevision; strategy?: StrategyPayload }>(`/campaign/revisions/${id}/${action}`, { method: "POST" }),
};
