import type { HypothesisReview, HypothesisReviewItem, HypothesisReviewStatus } from "@/lib/api";

/**
 * Where a hypothesis or a target stands (docs/posts-v2.md, Phase C): the status word, a
 * small dot before it, and the one evidence line the server wrote. No box and no pill: it
 * sits under the line it belongs to (DESIGN-STANDARD §4, "words first, a small dot").
 *
 * The dot's colour says the direction at a glance: blue on track, green confirmed, the sun
 * when the evidence is against it so far, grey while we are still measuring or the plan
 * just changed it.
 */
const TONE: Record<HypothesisReviewStatus, { word: string; dot: string }> = {
  measuring: { word: "text-[color:var(--ink-soft)]", dot: "bg-[var(--ink-faint)]" },
  on_track: { word: "text-[color:var(--primary)]", dot: "bg-[var(--primary)]" },
  confirmed: { word: "text-[color:var(--good)]", dot: "bg-[var(--good)] shadow-[0_0_0_3px_var(--good-soft)]" },
  not_yet: { word: "text-[color:var(--sand-dark)]", dot: "bg-[var(--sun)] shadow-[0_0_0_3px_var(--sand)]" },
  changed: { word: "text-[color:var(--ink-muted)]", dot: "bg-[var(--ink-muted)]" },
};

export function HypothesisStatusLine({
  status,
  statusHe,
  evidence,
  className = "",
}: {
  status: HypothesisReviewStatus;
  statusHe: string;
  /** Left out when the same line is already on screen (the month that follows its target). */
  evidence?: string;
  className?: string;
}) {
  const tone = TONE[status] ?? TONE.measuring;
  return (
    <div className={`text-[13px] leading-[1.6] ${className}`}>
      <span className={`me-2 inline-flex items-center gap-1.5 font-semibold ${tone.word}`}>
        <span aria-hidden className={`h-[7px] w-[7px] shrink-0 rounded-full ${tone.dot}`} />
        {statusHe}
      </span>
      {evidence ? <span className="text-[color:var(--ink-soft)]">{evidence}</span> : null}
    </div>
  );
}

/** "1 התאמתה, 1 בדרך, 1 בינתיים לא": how many hypotheses stand where, zeros left out. */
const SUMMARY: { status: HypothesisReviewStatus; one: string; many: string }[] = [
  { status: "confirmed", one: "התאמתה", many: "התאמתו" },
  { status: "on_track", one: "בדרך", many: "בדרך" },
  { status: "not_yet", one: "בינתיים לא", many: "בינתיים לא" },
  { status: "changed", one: "השתנתה", many: "השתנו" },
  { status: "measuring", one: "בבדיקה", many: "בבדיקה" },
];

export function statusSummary(items: { status: HypothesisReviewStatus }[]): string {
  return SUMMARY.map(({ status, one, many }) => {
    const count = items.filter((item) => item.status === status).length;
    return count ? `${count} ${count === 1 ? one : many}` : "";
  })
    .filter(Boolean)
    .join(", ");
}

/** The review's items by key ("month", "target:0", "assumption:1"), for the places that
 *  already list them. An item shows only while its text is the one on screen. */
export function reviewByKey(review: HypothesisReview | null | undefined): Map<string, HypothesisReviewItem> {
  return new Map((review?.items ?? []).map((item) => [item.key, item]));
}

export function reviewFor(
  items: Map<string, HypothesisReviewItem>,
  key: string,
  text: string
): HypothesisReviewItem | null {
  const item = items.get(key);
  const norm = (value: string) => (value || "").replace(/\s+/g, " ").trim();
  return item && norm(item.text_he) === norm(text) ? item : null;
}
