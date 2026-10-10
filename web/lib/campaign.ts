import { api, type RoadmapPost, type StrategyPayload } from "@/lib/api";

export type RevisionKind = "text" | "layout" | "image" | "video" | "video_edit" | "finish";
export type VideoOptions = { asset_id?: number; start?: number; end?: number; overlay_png?: string; overlay_headline?: string };
export type CampaignRevision = {
  id: string; strategy_id: number; kind: RevisionKind; instruction: string;
  state: "working" | "ready" | "failed" | "kept" | "undone" | "discarded";
  created_at: string; error: string;
  items: { uid: string; original: RoadmapPost; proposal: RoadmapPost | null; state: string; error: string }[];
};
export function protectedPost(post: RoadmapPost) {
  return Boolean(post.published_at || post.published_url || post.scheduled_for || post.approval_status === "approved");
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
