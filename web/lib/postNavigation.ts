import type { RoadmapPost } from "./api";

/** The campaign owns the month; direct editors and legacy review/calendar URLs survive. */
export function postsIndexDestination(params: URLSearchParams, hasPosts: boolean): string | null {
  if (!hasPosts || params.has("post") || params.has("i") || params.has("recommendation") || params.get("create") === "1" || params.get("view") === "calendar") return null;
  const query = new URLSearchParams();
  for (const key of ["lang", "week", "focus"]) if (params.has(key)) query.set(key, params.get(key)!);
  return `/campaign${query.size ? `?${query}` : ""}`;
}

export function campaignReturnHref(post: RoadmapPost | undefined, week: number, locale: string) {
  const query = new URLSearchParams({ week: String(week), lang: locale });
  if (post?.uid) query.set("focus", post.uid);
  return `/campaign?${query}`;
}
