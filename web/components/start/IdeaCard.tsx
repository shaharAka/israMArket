"use client";

import type { BrandSwatch, PostIdea } from "@/lib/api";
import { inkOn } from "./ui";

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
export function WhyBlock({ idea, compact = false }: { idea: PostIdea; compact?: boolean }) {
  const why = idea.why;
  return (
    <div className={`rounded-lg bg-[#f4f2ec] ${compact ? "p-2.5" : "p-3"}`}>
      <p className="text-[11px] font-black text-[#191b18]">למה הפוסט הזה</p>
      <p className={`mt-1 text-[#4f524b] ${compact ? "text-[11px] leading-4" : "text-xs leading-5"}`}>
        {[why.audience, why.goal_he, why.timing_he].filter(Boolean).join(" · ")}
      </p>
      <p className={`mt-1 text-[#191b18] ${compact ? "text-xs leading-5" : "text-sm leading-6"}`}>{why.reason_he}</p>
    </div>
  );
}

function tone(palette: BrandSwatch[] | null) {
  const pick = (role: BrandSwatch["role"], fallback: string) =>
    palette?.find((s) => s.role === role)?.hex ?? fallback;
  return { bg: pick("primary", "#2B2D28"), accent: pick("accent", "#C9A45C") };
}

/** A post idea as a small card: a colour tile with the headline, the hook, and why. */
export function IdeaCard({
  idea,
  palette,
  chosen,
  onOpen,
}: {
  idea: PostIdea;
  palette: BrandSwatch[] | null;
  chosen: boolean;
  onOpen: () => void;
}) {
  const { bg, accent } = tone(palette);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${idea.hook}. לראות בגדול`}
      className={`flex w-full cursor-pointer flex-col overflow-hidden rounded-xl border bg-white text-right transition-shadow hover:shadow-md ${
        chosen ? "border-[#191b18] ring-1 ring-[#191b18]" : "border-[#e2e0d8]"
      }`}
    >
      <div className="relative flex h-24 items-end p-3" style={{ background: bg }}>
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-[#191b18]">
          {FORMAT_HE[idea.format]}
        </span>
        {chosen ? (
          <span className="absolute right-3 top-3 rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-[#191b18]">
            הפוסט הראשון
          </span>
        ) : null}
        <span className="line-clamp-2 text-base font-black leading-tight" style={{ color: inkOn(bg) }}>
          <span className="ml-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: accent }} />
          {idea.overlay_headline || idea.title}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="text-sm font-black leading-5 text-[#191b18]">{idea.hook}</p>
        <WhyBlock idea={idea} compact />
      </div>
    </button>
  );
}
