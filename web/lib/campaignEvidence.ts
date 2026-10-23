import type { RoadmapPost } from "./api";

// A change applied to a draft is not measured learning from that draft.
export function briefLearning(post: RoadmapPost): string | null | undefined {
  const measured = Boolean((post.published_at || post.published_url) && post.results?.matched_by?.length &&
    post.results.updated_at && typeof post.results.value === "number" && Number.isFinite(post.results.value));
  return measured ? post.learning : null;
}
