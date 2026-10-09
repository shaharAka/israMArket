"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { IconChevron } from "@/lib/icons";
import { researchLatest, researchRun, useTrial, type ResearchPayload } from "@/lib/trial";
import { HypothesisStatus } from "./WeeklyBrief";

/**
 * "מה למדנו השבוע" — the ongoing research (`/research/latest`), on the results page.
 *
 * The research engine ran every week with nowhere in the app to read it. Here it leads
 * with its one-line headline and what each finding changes in the plan; the rest of each
 * insight is one tap down. Before the first run it says what the research does and offers
 * to run it — as a quiet button: the page's dark one is the data refresh.
 */
export function ResearchSection() {
  const t = useCopy();
  const [data, setData] = useState<ResearchPayload | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    researchLatest()
      .then(setData)
      .catch(() => {
        // Guidance only: without the research the results page is still the results page.
      });
  }, []);

  async function run() {
    setRunning(true);
    setError("");
    try {
      setData(await researchRun());
    } catch (err) {
      setError(
        err instanceof ApiError && err.message ? err.message : t("לא הצלחנו להריץ את המחקר. נסו שוב בעוד כמה דקות.")
      );
    } finally {
      setRunning(false);
    }
  }

  if (!data) return null;
  const run_ = data.run;
  const canRun = data.rate_limit.runs_left_today > 0;

  const button = (
    <button
      type="button"
      onClick={() => void run()}
      disabled={running || !canRun}
      aria-busy={running}
      className="inline-flex min-h-11 items-center rounded-md border border-[var(--rule-dark)] bg-white px-4 text-sm font-bold text-[color:var(--ink)] hover:bg-[var(--primary-soft)] disabled:opacity-50"
    >
      {running ? t("חוקרים… זה לוקח כדקה") : t("להריץ את המחקר")}
    </button>
  );

  // Before the first run there is nothing to read yet: one folded line, the button inside
  // (the page's word budget is for the results, not for what is not there).
  if (!run_ || !data.available) {
    return (
      <details id="research" className="group scroll-mt-24 border-y border-[var(--rule)]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-bold text-[color:var(--ink)] [&::-webkit-details-marker]:hidden">
          <span><Copy text="מה למדנו השבוע · המחקר עוד לא רץ" /></span>
          <IconChevron className="h-4 w-4 shrink-0 -rotate-90 text-[color:var(--ink-muted)] transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" />
        </summary>
        <div className="pb-4">
          <p className="mb-3 text-sm leading-6 text-[color:var(--ink)]">
            <Copy text="המחקר בודק מה המתחרים מפרסמים, מה מחפשים בגוגל ואילו מועדים מתקרבים, ואומר מה זה משנה בתוכנית." /></p>
          {button}
          {error ? (
            <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : null}
        </div>
      </details>
    );
  }

  return (
    <section id="research" aria-labelledby="research-heading" className="scroll-mt-24">
      <h2 id="research-heading" className="text-base font-bold text-[color:var(--ink)]">
        <Copy text="מה למדנו השבוע" /></h2>
      {run_.headline ? <p className="mt-2 text-sm font-bold leading-6 text-[color:var(--ink)]">{run_.headline}</p> : null}
      {run_.insights.length ? (
        <ul className="mt-3 divide-y divide-[var(--rule)] overflow-hidden rounded-lg border border-[var(--rule)] bg-white">
          {run_.insights.slice(0, 3).map((insight, index) => (
            <li key={`${insight.title}-${index}`}>
              <details className="group">
                <summary className="flex min-h-12 cursor-pointer list-none items-start gap-3 px-4 py-3 hover:bg-[var(--soft)] [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold leading-6 text-[color:var(--ink)]">{insight.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-[color:var(--ink)]">
                      <b><Copy text="מה זה משנה:" /></b>
                      {insight.plan_change}
                    </span>
                  </span>
                  <IconChevron className="mt-1 h-4 w-4 shrink-0 -rotate-90 text-[color:var(--ink-muted)] transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" />
                </summary>
                <div className="px-4 pb-3 text-xs leading-5 text-[color:var(--ink-soft)]">
                  <p>{insight.text}</p>
                  <p className="mt-1">
                    {insight.confidence === "strong" ? t("נשען על עובדה שנמדדה") : t("כיוון, עוד לא מגמה")}
                    {insight.source_labels_he?.length ? ` · ${insight.source_labels_he.join(", ")}` : ""}
                  </p>
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : run_.insights_error_he ? (
        <p className="mt-2 text-sm leading-6 text-[color:var(--ink-soft)]">{run_.insights_error_he}</p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** Results show which hypothesis they confirm (Revision 8): the plan's hypotheses, folded. */
export function PerformanceHypotheses() {
  const { payload } = useTrial();
  return <HypothesisStatus trial={payload} className="border-y border-[var(--rule)]" />;
}
