"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Business, StrategyPayload } from "@/lib/api";
import { IconArrowLeft, IconFlag, IconLightbulb } from "@/lib/icons";
import { researchLatest, type TrialPayload } from "@/lib/trial";

const SOURCE_HE: Record<string, string> = { instagram: "אינסטגרם", site: "נתוני האתר", whatsapp: "קישור הוואטסאפ" };

function joinHe(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ו${items[items.length - 1]}`;
}

/** This week's focus, from the plan: the month's week when there is a month, else the
 *  3-month plan's first month. */
function focusOf(trial: TrialPayload, strategy: StrategyPayload | null, business: Business | null): string {
  if (strategy) {
    const now = new Date();
    const inMonth = now.getFullYear() === strategy.year && now.getMonth() + 1 === strategy.month;
    const week = inMonth ? Math.min(4, Math.ceil(now.getDate() / 7)) : 1;
    const weeks = strategy.weekly_breakdown || strategy.roadmap?.weekly_breakdown || [];
    const focus = weeks.find((item) => item.week === week)?.focus;
    if (focus) return focus;
  }
  const plan = strategy?.quarter_plan ?? business?.quarter_plan;
  return plan?.calendar?.[0]?.weeks?.find((item) => item.week === trial.week)?.focus_he ?? "";
}

/** What we learned: the research's headline once there is one, else week 1's aha —
 *  whether the measurement works yet. Never a number we do not have. */
function learnedLine(trial: TrialPayload, headline: string): string {
  if (headline) return headline;
  const { connected, has_numbers } = trial.measurement;
  if (has_numbers) return "המדידה עובדת: יש מספרים ראשונים מהחיבורים, מול היעד.";
  if (connected.length) {
    return `מחוברים: ${joinHe(connected.map((key) => SOURCE_HE[key] ?? key))}. המספרים הראשונים יגיעו בימים הקרובים.`;
  }
  return "עוד לא מודדים כלום. לכן השבוע מתחילים מהמדידה.";
}

/**
 * The weekly brief's first two lines (Revision 8): this week's focus from the plan, and
 * what we learned. The third — what needs a decision — is the journey's next step, the
 * card right under it.
 */
export function WeeklyBrief({
  trial,
  strategy,
  business,
}: {
  trial: TrialPayload;
  strategy: StrategyPayload | null;
  business: Business | null;
}) {
  const [headline, setHeadline] = useState("");
  useEffect(() => {
    researchLatest()
      .then((payload) => setHeadline(payload.available ? payload.run?.headline ?? "" : ""))
      .catch(() => {});
  }, []);

  const focus = focusOf(trial, strategy, business);
  return (
    <div className="divide-y divide-[#e9e8e3] rounded-lg border border-[#e6e4dc] bg-white px-4 sm:px-5">
      {focus ? (
        <Link href="/strategy" className="flex min-h-12 items-start gap-3 py-3 transition-colors hover:text-[#20211f]">
          <IconFlag className="mt-1 h-4 w-4 shrink-0 text-[#62635f]" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-[#747570]">הפוקוס השבוע</span>
            <span className="mt-0.5 block text-sm font-bold leading-6 text-[#20211f]">{focus}</span>
          </span>
          <IconArrowLeft className="mt-1 h-4 w-4 shrink-0 text-[#8b8e84]" />
        </Link>
      ) : null}
      <Link
        href={headline ? "/performance#research" : "/performance"}
        className="flex min-h-12 items-start gap-3 py-3 transition-colors hover:text-[#20211f]"
      >
        <IconLightbulb className="mt-1 h-4 w-4 shrink-0 text-[#62635f]" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold text-[#747570]">מה למדנו</span>
          <span className="mt-0.5 block text-sm leading-6 text-[#20211f]">{learnedLine(trial, headline)}</span>
        </span>
        <IconArrowLeft className="mt-1 h-4 w-4 shrink-0 text-[#8b8e84]" />
      </Link>
    </div>
  );
}

/**
 * The plan's hypotheses and where each stands: נמדדת / אושרה / לא אושרה. Folded to one
 * line; the monthly review sets the statuses, so until then every one reads "נמדדת".
 */
export function HypothesisStatus({ trial, className = "" }: { trial: TrialPayload | null; className?: string }) {
  const items = trial?.hypotheses ?? [];
  if (!items.length) return null;
  const measuring = items.filter((item) => item.status === "measuring").length;
  const tone: Record<string, string> = {
    measuring: "bg-[#f0efea] text-[#62635f]",
    confirmed: "bg-[#eaf0e6] text-[#374b3d]",
    not_confirmed: "bg-[#fbf2ef] text-[#9f4330]",
  };
  return (
    <details className={`group ${className}`}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-bold text-[#20211f]">
        <span>
          ההשערות שבודקים · {measuring === items.length ? `${items.length} נמדדות` : `${items.length - measuring} מתוך ${items.length} הוכרעו`}
        </span>
        <span
          aria-hidden
          className="h-0 w-0 shrink-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-[#8b8e84] transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <ul className="space-y-3 pb-4">
        {items.map((item, index) => (
          <li key={`${index}-${item.text_he}`} className="flex items-start gap-3">
            <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${tone[item.status]}`}>
              {item.status_he}
            </span>
            <span className="min-w-0 flex-1 text-sm leading-6 text-[#20211f]">
              {item.text_he}
              {item.if_wrong_he ? (
                <span className="block text-xs leading-5 text-[#62635f]">אם היא לא תתאמת: {item.if_wrong_he}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
