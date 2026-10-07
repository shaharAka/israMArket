"use client";
import type { PlanInsight } from "@/lib/api";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { IconChevron } from "@/lib/icons";

const SOURCES: Record<string, string> = { site: "מהאתר שלכם", answers: "ממה שסיפרתם", calendar: "מלוח השנה", category: "מה שידוע על עסקים כמו שלכם", industry: "מה שידוע על עסקים כמו שלכם", social: "מהרשתות" };
export function sourceLabel(source: string) { return SOURCES[source] ?? source; }

/** Shared research presentation: customer findings are supplied unchanged by onboarding. */
export function ResearchInsights({ insights }: { insights: PlanInsight[] }) {
  const t = useCopy();
  return <ul className="divide-y divide-[var(--rule)] rounded-xl bg-[var(--paper)] shadow-[var(--shadow-card)]">
    {insights.slice(0, 4).map((insight, index) => <li key={index} className="px-6 py-5">
      <p className="mb-2 text-[13px] font-medium text-[var(--ink-muted)]">{t(sourceLabel(insight.source))}</p>
      <p className="text-[18px] font-medium leading-[1.5] text-[var(--ink)]">{insight.text_he}</p>
      {insight.detail_he ? <details className="group mt-3"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[13px] font-medium text-[var(--primary)] [&::-webkit-details-marker]:hidden"><Copy text="מה עומד מאחורי הממצא" /><IconChevron className="h-4 w-4 -rotate-90 group-open:rotate-90" /></summary><p className="pb-2 text-[15px] leading-[1.6] text-[var(--ink-soft)]">{insight.detail_he}</p></details> : null}
    </li>)}
  </ul>;
}
