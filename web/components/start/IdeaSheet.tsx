"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CardStage } from "@/components/CardCanvas";
import type { BrandLanguage, BrandSwatch, PostIdea, RoadmapPost } from "@/lib/api";
import { WhyBlock, formatLabel } from "./IdeaCard";
import styles from "./start.module.css";

const NEUTRAL: BrandSwatch[] = [
  { hex: "#2B2D28", role: "primary", name: "" },
  { hex: "#C9A45C", role: "accent", name: "" },
  { hex: "#F4F1EA", role: "background", name: "" },
  { hex: "#191B18", role: "ink", name: "" },
];

/** The card renderer paints from the palette only; the rest of BrandLanguage stays empty. */
export function brandFromPalette(name: string, palette: BrandSwatch[] | null): BrandLanguage {
  return {
    business_name: name,
    palette: palette?.length ? palette : NEUTRAL,
    typography: { primary: "", mood: "" },
    visual_style: "",
    photography: "",
    voice: "",
    voice_examples: [],
    do_say: [],
    dont_say: [],
    messaging: [],
    offers_seen: [],
    audience: "",
    logo_description: "",
  };
}

function toCardPost(idea: PostIdea): RoadmapPost {
  return {
    week: 1,
    date_hint: "",
    format: idea.format,
    title: idea.title,
    angle: "",
    hook: idea.hook,
    caption: idea.caption,
    cta: idea.cta,
    calendar_tie: "",
    goal_fit: "",
    overlay_theme: "type_hero",
    has_overlay: true,
    overlay_headline: idea.overlay_headline || idea.title,
  };
}

/**
 * One idea, larger: the post as it would look in the business's colours, the caption,
 * and why we suggest it. A bottom sheet on phones, a centred panel on desktop.
 */
export function IdeaSheet({
  idea,
  businessName,
  palette,
  chosen,
  onChoose,
  onClose,
}: {
  idea: PostIdea;
  businessName: string;
  palette: BrandSwatch[] | null;
  chosen: boolean;
  onChoose: () => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus?.();
    };
  }, [onClose]);

  const tall = idea.format === "reel" || idea.format === "story";

  // Portalled: the step's entrance animation leaves a stacking context that would keep
  // the sheet under the sticky header.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center">
      <button
        type="button"
        aria-label="לסגור"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-[#191b18]/40 ${styles.backdrop}`}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={idea.title}
        tabIndex={-1}
        className={`relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white pb-[max(1rem,env(safe-area-inset-bottom))] outline-none lg:max-w-2xl lg:rounded-3xl ${styles.sheet}`}
      >
        <div className="sticky top-0 z-10 flex justify-center bg-white/95 pt-2 pb-1 lg:hidden" aria-hidden>
          <span className="h-1.5 w-10 rounded-full bg-[#d8d6ce]" />
        </div>
        <div className="grid gap-5 px-5 pb-2 pt-2 lg:grid-cols-[minmax(0,15rem)_1fr] lg:p-7">
          <div className={`mx-auto w-full ${tall ? "max-w-[11rem]" : "max-w-[15rem]"}`}>
            <CardStage post={toCardPost(idea)} brand={brandFromPalette(businessName, palette)} businessName={businessName} />
          </div>
          <div className="space-y-3">
            <p className="text-xs font-bold text-[#6b6e65]">{formatLabel(idea.format)}</p>
            <h2 className="text-xl font-black leading-tight text-[#191b18]">{idea.hook}</h2>
            <p className="text-sm leading-6 text-[#2b2d28]">{idea.caption}</p>
            <p className="text-sm font-bold text-[#191b18]">קריאה לפעולה: {idea.cta}</p>
            <WhyBlock idea={idea} />
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                aria-pressed={chosen}
                onClick={onChoose}
                className={`min-h-11 cursor-pointer rounded-full border px-4 text-sm font-bold ${
                  chosen ? "border-[#191b18] bg-[#f1efe8] text-[#191b18] ring-1 ring-[#191b18]" : "border-[#c7c4b8] text-[#191b18]"
                }`}
              >
                {chosen ? "נבחר כפוסט הראשון" : "להתחיל מהפוסט הזה"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 cursor-pointer px-2 text-sm text-[#5e6159] underline underline-offset-4"
              >
                לסגור
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
