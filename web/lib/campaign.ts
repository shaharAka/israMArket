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
  const status = (post.approval_status || "").toLowerCase();
  return Boolean(
    post.published_at || post.published_url || post.scheduled_for ||
    ["approved", "published", "scheduled"].includes(status)
  );
}

/** Find the next owner action without asking them to approve or publish work twice. */
export function nextCampaignPost(posts: RoadmapPost[]) {
  const pending = posts.findIndex(post => !protectedPost(post) && isPending(lifecycleOf(post)));
  if (pending >= 0) return { index: pending, action: "review" as const };

  const approved = posts.findIndex(post =>
    lifecycleOf(post) === "approved" &&
    !post.scheduled_for && !post.published_at && !post.published_url &&
    !["published", "scheduled"].includes((post.approval_status || "").toLowerCase())
  );
  return approved >= 0
    ? { index: approved, action: "publish" as const }
    : { index: -1, action: "results" as const };
}

/** Batch work stays explicit and draft-only, with the existing three-post ceiling. */
export function toggleCampaignSelection(posts: RoadmapPost[], selected: string[], uid: string) {
  const post = posts.find(item => item.uid === uid);
  if (!uid || !post) return selected;
  if (selected.includes(uid)) return selected.filter(value => value !== uid);
  if (protectedPost(post)) return selected;
  return selected.length < 3 ? [...selected, uid] : selected;
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
