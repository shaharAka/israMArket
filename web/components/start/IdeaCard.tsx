"use client";

import type { PostIdea } from "@/lib/api";

const FORMAT_HE: Record<PostIdea["format"], string> = {
  reel: "ריל",
  carousel: "קרוסלה",
  image: "תמונה",
  story: "סטורי",
};

export function formatLabel(format: PostIdea["format"]): string {
  return FORMAT_HE[format] ?? format;
}

/** "למה הפוסט הזה": audience, goal, timing and the one-sentence reason. Always visible. */
export function WhyBlock({ idea, compact = false }: { idea: { why: PostIdea["why"] }; compact?: boolean }) {
  const why = idea.why;
  return (
    <div className={`rounded-lg bg-[var(--canvas)] ${compact ? "p-2.5" : "p-3"}`}>
      <p className="text-[11px] font-black text-[var(--ink)]">למה הפוסט הזה</p>
      <p className={`mt-1 text-[var(--ink-soft)] ${compact ? "text-[11px] leading-4" : "text-xs leading-5"}`}>
        {[why.audience, why.goal_he, why.timing_he].filter(Boolean).join(" · ")}
      </p>
      <p className={`mt-1 text-[var(--ink)] ${compact ? "text-xs leading-5" : "text-sm leading-6"}`}>{why.reason_he}</p>
    </div>
  );
}
