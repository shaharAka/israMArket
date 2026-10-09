import type {
  PostChannel,
  PostLifecycle,
  PostMetric,
  PostOwnerNeed,
  PostResults,
  RoadmapPost,
} from "@/lib/api";
import { compositionDrawsPhoto } from "@/lib/dna/library";

/**
 * Where a post stands, in the one vocabulary the owner sees everywhere (docs/posts-v2.md):
 *
 *   מחכה לכם → מוכן לאישור → אושר → פורסם → נמדד
 *
 * The server computes `lifecycle` (`lifecycle()` in api/app/services/connected_posts.py).
 * A post from an API that does not send it yet still gets a state, derived here the same
 * way: a measured number on a published post first, then "פרסמתי" (with or without a link),
 * then an approval, then anything the owner still has to add. Taps on the link of a post
 * that is not out yet never make it "נמדד" (#123).
 */

export const LIFECYCLES: readonly PostLifecycle[] = ["needs_owner", "ready", "approved", "published", "measured"];

export const LIFECYCLE_LABEL: Record<PostLifecycle, string> = {
  needs_owner: "מחכה לכם",
  ready: "מוכן לאישור",
  approved: "אושר",
  published: "פורסם",
  measured: "נמדד",
};

/** Whether the card draws a photograph: its DNA composition when it has one, else the old
 *  photo-free template (`postNeedsPhoto` in components/CardCanvas.tsx). */
function cardDrawsPhoto(post: RoadmapPost) {
  if (post.design?.composition) return compositionDrawsPhoto(post.design.composition);
  return post.overlay_theme !== "type_hero";
}

function hasResult(results: PostResults | null | undefined): results is PostResults & { value: number } {
  return Boolean(results) && typeof results?.value === "number" && Number.isFinite(results.value);
}

function isPublished(post: RoadmapPost) {
  return Boolean((post.published_url || "").trim() || post.published_at);
}

/**
 * What only the owner can add. The server's list leads (and is [] once the post is approved
 * or out); one fallback is added on top: a card that draws a photograph and has none needs
 * one, whatever the list says. That is the rule the approve button always had.
 */
export function ownerNeedsOf(post: RoadmapPost): PostOwnerNeed[] {
  if (post.approval_status === "approved" || isPublished(post)) return [];
  const needs = (post.owner_needs ?? []).filter(
    (need) => (need?.kind === "photo" || need?.kind === "fact") && typeof need.text === "string" && need.text.trim()
  );
  if (cardDrawsPhoto(post) && !post.image_url && !needs.some((need) => need.kind === "photo")) {
    return [{ kind: "photo", text: "תמונה שמתאימה לפוסט" }, ...needs];
  }
  return needs;
}

/** The state from the stored fields only, in the server's order. */
export function deriveLifecycle(post: RoadmapPost): PostLifecycle {
  if (hasResult(post.results) && isPublished(post)) return "measured";
  if (isPublished(post)) return "published";
  if (post.approval_status === "approved") return "approved";
  if (ownerNeedsOf(post).length) return "needs_owner";
  return "ready";
}

/** The server's state when it sent one, otherwise the derived one. */
export function lifecycleOf(post: RoadmapPost): PostLifecycle {
  return post.lifecycle && LIFECYCLES.includes(post.lifecycle) ? post.lifecycle : deriveLifecycle(post);
}

/** Still waiting for the owner before it can go out. */
export function isPending(stage: PostLifecycle) {
  return stage === "needs_owner" || stage === "ready";
}

export function isOut(stage: PostLifecycle) {
  return stage === "published" || stage === "measured";
}

/* ---- The channel ------------------------------------------------------------------ */

export const CHANNEL_LABEL: Record<PostChannel, string> = {
  instagram: "אינסטגרם",
  facebook: "פייסבוק",
  whatsapp: "וואטסאפ",
};

/** The plan's channel; for an older post, its primary outlet (TikTok had no channel of
 *  its own in the plan, so it reads as Instagram, where the same reel goes). */
export function channelOf(post: RoadmapPost): PostChannel {
  if (post.channel && post.channel in CHANNEL_LABEL) return post.channel;
  const outlet = post.primary_outlet;
  return outlet === "facebook" || outlet === "whatsapp" ? outlet : "instagram";
}

/* ---- The number ------------------------------------------------------------------- */

const METRIC_LABEL: Record<PostMetric, string> = {
  whatsapp_clicks: "לחיצות לוואטסאפ",
  site_visits: "כניסות לאתר",
  saves: "שמירות",
  reach: "אנשים שראו",
};

/** Short units for a list row: "21 לחיצות". One gets its own word. */
const METRIC_UNIT: Record<PostMetric, { one: string; many: string }> = {
  whatsapp_clicks: { one: "לחיצה אחת", many: "לחיצות" },
  site_visits: { one: "כניסה אחת", many: "כניסות" },
  saves: { one: "שמירה אחת", many: "שמירות" },
  reach: { one: "אדם אחד ראה", many: "אנשים ראו" },
};

export function formatCount(value: number) {
  return Math.round(value).toLocaleString("he-IL");
}

export function metricLabel(post: RoadmapPost): string {
  const measure = post.measure;
  if (!measure) return "";
  return measure.label_he?.trim() || METRIC_LABEL[measure.metric] || "";
}

/** The measured number of a post, or null when it was not counted (or it is not out yet). */
export function resultValue(post: RoadmapPost): number | null {
  return hasResult(post.results) && isPublished(post) ? post.results.value : null;
}

/** "21 לחיצות" for the list, or "" when there is nothing measured to show. */
export function resultShort(post: RoadmapPost): string {
  const value = resultValue(post);
  if (value === null) return "";
  const unit = post.measure ? METRIC_UNIT[post.measure.metric] : null;
  if (!unit) return formatCount(value);
  return value === 1 ? unit.one : `${formatCount(value)} ${unit.many}`;
}

/** The other numbers the sync wrote, without the one already leading. */
export function otherResults(post: RoadmapPost): { key: string; label: string; value: number }[] {
  const results = post.results;
  if (!results) return [];
  const lead: Partial<Record<PostMetric, keyof PostResults>> = {
    whatsapp_clicks: "whatsapp_clicks",
    site_visits: "visits",
    saves: "saves",
    reach: "reach",
  };
  const skip = post.measure ? lead[post.measure.metric] : undefined;
  const rows: [keyof PostResults, string][] = [
    ["whatsapp_clicks", "לחיצות לוואטסאפ"],
    ["visits", "כניסות לאתר"],
    // GA4 key events: what the site marks as important, not necessarily inquiries or
    // orders. The same words as on Results, which says so.
    ["conversions", "פעולות חשובות באתר"],
    ["reach", "אנשים שראו"],
    ["saves", "שמירות"],
  ];
  return rows.flatMap(([key, label]) => {
    const value = results[key];
    return key !== skip && typeof value === "number" && Number.isFinite(value) ? [{ key, label, value }] : [];
  });
}

/** How the numbers were tied to the post (`_measure_post` on the server), in the owner's
 *  words. Unknown keys say nothing rather than something invented. */
const MATCHED_BY_LABEL: Record<string, string> = {
  whatsapp_code: "קוד הוואטסאפ של הפוסט",
  utm: "הקישור עם המעקב",
  instagram_link: "הקישור לפוסט",
  instagram_caption: "הכיתוב באינסטגרם",
};

/** "לפי קוד הוואטסאפ של הפוסט והקישור עם המעקב", or "" when nothing known matched it. */
export function matchedByLabel(results: PostResults | null | undefined): string {
  const keys = Array.isArray(results?.matched_by) ? results.matched_by : results?.matched_by ? [results.matched_by] : [];
  const names = [...new Set(keys.map((key) => MATCHED_BY_LABEL[key]).filter(Boolean))];
  if (!names.length) return "";
  const joined = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} ו${names[names.length - 1]}`;
  return `לפי ${joined}`;
}

/** `2026-09-28…` → `28.9`. */
export function shortDate(iso: string | null | undefined): string {
  const match = (iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${Number(match[3])}.${Number(match[2])}` : "";
}

/**
 * The comparison line under the number: above, below or about the same as the most recent
 * earlier similar post. The label is the server's ("בפוסט דומה"), so the line reads
 * "יותר מאשר בפוסט דומה (14)". "About the same" is the server's own band (`learning_facts`):
 * within 15% of the other number, or 1.
 */
export function compareOf(post: RoadmapPost): { direction: "up" | "down" | "same"; text: string } | null {
  const observation = post.results?.observations?.visits;
  if (post.measure?.metric === "site_visits" && (!observation?.start || !observation?.end || observation.limited)) return null;
  const value = resultValue(post);
  const compare = post.results?.compare;
  if (value === null || !compare || !Number.isFinite(compare.value)) return null;
  const label = (compare.label || "").trim() || "בפוסט דומה";
  const count = formatCount(compare.value);
  // The server decides the direction; the local band is only a fallback for older data.
  const diff = value - compare.value;
  const direction =
    compare.direction ??
    (Math.abs(diff) <= Math.max(1, Math.round(0.15 * compare.value)) ? "similar" : diff > 0 ? "above" : "below");
  if (direction === "similar") return { direction: "same", text: `בערך כמו ${label} (${count})` };
  return direction === "above"
    ? { direction: "up", text: `יותר מאשר ${label} (${count})` }
    : { direction: "down", text: `פחות מאשר ${label} (${count})` };
}
