"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import type { Business, StrategyPayload } from "@/lib/api";
import { IconChevron, IconFlag, IconLightbulb } from "@/lib/icons";
import { researchLatest, type TrialPayload } from "@/lib/trial";
import { HypothesisNote } from "@/components/design/PlanBrief";
import { HypothesisStatusLine, statusSummary } from "@/components/plan/HypothesisStatusLine";

const SOURCE_HE: Record<string, string> = { instagram: "אינסטגרם", site: "נתוני האתר", whatsapp: "קישור הוואטסאפ" };

function joinHe(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ו${items[items.length - 1]}`;
}

/** This week's focus, from the plan: the month's week when there is a month, else the
 *  ongoing plan's first working month. */
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
  const { connected, has_numbers, verified_sources, pending_sources } = trial.measurement;
  if (has_numbers) return pending_sources?.length
    ? "יש נתונים בתוצאות. חלק מהחיבורים עוד דורשים בדיקה."
    : "הנתונים זמינים בתוצאות. נבדוק מה הם אומרים על היעד.";
  if (pending_sources?.length) return `עוד לא קראנו את ${joinHe(pending_sources)}. אפשר להמשיך בתוכנית.`;
  if (verified_sources?.length) return `נבדקו: ${joinHe(verified_sources)}. עדיין אין פעילות למדידה.`;
  if (verified_sources) return "עוד אין נתונים למדידה. אפשר להמשיך בתוכנית.";
  if (connected.length) {
    return `מחוברים: ${joinHe(connected.map((key) => SOURCE_HE[key] ?? key))}. עדיין אין פעילות למדידה.`;
  }
  return "עוד אין נתונים למדידה. אפשר להמשיך בתוכנית.";
}

/** One half of the brief: an icon, a quiet label, the line itself, and where it leads. */
function BriefCell({
  href,
  Icon,
  label,
  children,
}: {
  href: string;
  Icon: ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="group flex min-h-14 items-start gap-3 px-5 py-4 transition-colors hover:bg-[var(--soft)] sm:px-6 sm:py-5">
      <Icon className="mt-px h-[18px] w-[18px] shrink-0 text-[color:var(--ink-muted)]" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold leading-5 text-[color:var(--ink-muted)]">{label}</span>
        <span className="mt-1.5 block text-[15px] font-medium leading-6 text-[color:var(--ink)]">{children}</span>
      </span>
      <IconChevron className="mt-px h-4 w-4 shrink-0 text-[color:var(--ink-muted)] transition-transform duration-200 group-hover:-translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  );
}

/**
 * The weekly brief's first two lines (Revision 8): this week's focus from the plan, and
 * what we learned. The third — what needs a decision — is the journey's next step, the
 * card right under it. One card, side by side on a wide screen, one hairline between.
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
  const t = useCopy();
  const [headline, setHeadline] = useState("");
  useEffect(() => {
    researchLatest()
      .then((payload) => setHeadline(payload.available ? payload.run?.headline ?? "" : ""))
      .catch(() => {});
  }, []);

  const focus = focusOf(trial, strategy, business);
  return (
    <div
      className={`drawn-card grid overflow-hidden divide-y divide-[var(--rule)] ${
        focus ? "sm:grid-cols-2 sm:divide-x sm:divide-y-0" : ""
      }`}
    >
      {focus ? (
        <BriefCell href="/strategy" Icon={IconFlag} label={t("הפוקוס השבוע")}>
          {focus}
        </BriefCell>
      ) : null}
      <BriefCell href={headline ? "/performance#research" : trial.measurement.pending_sources?.length ? "/integrations" : "/performance"} Icon={IconLightbulb} label={t("מה למדנו")}>
        {learnedLine(trial, headline)}
      </BriefCell>
    </div>
  );
}

/**
 * What the month tests and where each stands (docs/posts-v2.md, Phase C): the month's
 * hypothesis and the plan's assumptions, each with its status word, a small dot and one
 * evidence line, as the server wrote them (performance refresh, weekly job, month close).
 * Folded to one line that counts them; each is the design library's HypothesisNote.
 */
export function HypothesisStatus({ trial, className = "" }: { trial: TrialPayload | null; className?: string }) {
  const items = trial?.hypotheses ?? [];
  if (!items.length) return null;
  return (
    <details className={`group/hyp ${className}`}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 text-[15px] font-semibold text-[color:var(--ink)] [&::-webkit-details-marker]:hidden">
        <span>
          <Copy text="ההשערות שבודקים ·" />{" "}
          <span className="font-normal text-[color:var(--ink-soft)]">{statusSummary(items)}</span>
        </span>
        <IconChevron className="h-4 w-4 shrink-0 -rotate-90 text-[color:var(--ink-muted)] transition-transform duration-200 group-open/hyp:rotate-90 motion-reduce:transition-none" />
      </summary>
      <ul className="divide-y divide-[var(--rule)] border-t border-[var(--rule)] pb-1">
        {items.map((item, index) => (
          <li key={item.key ?? `${index}-${item.text_he}`}>
            <HypothesisNote
              hypothesis={item.text_he}
              ifWrong={item.if_wrong_he}
              status={<HypothesisStatusLine status={item.status} statusHe={item.status_he} evidence={item.evidence_he} />}
            />
          </li>
        ))}
      </ul>
    </details>
  );
}
