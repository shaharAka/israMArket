import type { InspirationSource, InstagramMetrics } from "@/lib/api";

/** "the reel of yours", "the carousel of yours" — the definite noun for a format. */
const OWN_NOUN: Record<string, string> = {
  reel: "הריל",
  carousel: "הקרוסלה",
  image: "התמונה",
  video: "הסרטון",
  story: "הסטורי",
};

/**
 * Meta writes timestamps as `2026-08-12T03:10:00+0000`, which `Date` does not parse
 * everywhere; the offset is rewritten to `+00:00` first.
 */
function parseMetaTime(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "12.8" in Israel time, or "" when the post has no usable date. */
export function shortDate(value: string): string {
  const date = parseMetaTime(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    day: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return day && month ? `${Number(day)}.${Number(month)}` : "";
}

function count(value: number) {
  return value.toLocaleString("he-IL");
}

/**
 * The one number that says the post was worth something, in words.
 *
 * Saves first: it is what the ranking is built on and what a reader does when a post was
 * useful. Then shares, views, and — for other accounts, where Meta shows nothing else —
 * likes. A metric that is missing is skipped, never shown as zero.
 */
export function keyMetric(metrics: InstagramMetrics | undefined): string {
  const m = metrics || {};
  if (m.saved) return m.saved === 1 ? "נשמר פעם אחת" : `נשמר ${count(m.saved)} פעמים`;
  if (m.shares) return m.shares === 1 ? "שותף פעם אחת" : `שותף ${count(m.shares)} פעמים`;
  if (m.views) return `${count(m.views)} צפיות`;
  if (m.likes) return `${count(m.likes)} לייקים`;
  if (m.comments) return `${count(m.comments)} תגובות`;
  return "";
}

/**
 * Who a source is: "הריל שלכם מ-12.8", "@kemah_vemelach", "#challah". `short` drops
 * "שלכם" where the list around it already says whose posts these are.
 */
export function sourceWho(source: InspirationSource, short = false): string {
  if (source.kind === "own") {
    const noun = `${OWN_NOUN[source.format] || "הפוסט"}${short ? "" : " שלכם"}`;
    const day = shortDate(source.posted_at);
    return day ? `${noun} מ-${day}` : noun;
  }
  if (source.kind === "hashtag") return source.hashtag ? `#${source.hashtag}` : "האשטאג";
  return source.handle ? `@${source.handle}` : "חשבון אחר";
}

/** "הריל שלכם מ-12.8 · נשמר 38 פעמים". */
export function sourceLabel(source: InspirationSource): string {
  const metric = keyMetric(source.metrics);
  return metric ? `${sourceWho(source)} · ${metric}` : sourceWho(source);
}
