"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
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
        err instanceof ApiError && err.message ? err.message : "לא הצלחנו להריץ את המחקר. נסו שוב בעוד כמה דקות."
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
      className="inline-flex min-h-11 items-center rounded-md border border-[#c7c4b8] bg-white px-4 text-sm font-bold text-[#1e201d] hover:bg-[#f4f3ee] disabled:opacity-50"
    >
      {running ? "חוקרים… זה לוקח כדקה" : "להריץ את המחקר"}
    </button>
  );

  // Before the first run there is nothing to read yet: one folded line, the button inside
  // (the page's word budget is for the results, not for what is not there).
  if (!run_ || !data.available) {
    return (
      <details id="research" className="group scroll-mt-24 border-y border-[#e6e4dc]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-bold text-[#20211f]">
          <span>מה למדנו השבוע · המחקר עוד לא רץ</span>
          <span
            aria-hidden
            className="h-0 w-0 shrink-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-[#8b8e84] transition-transform duration-200 group-open:rotate-180"
          />
        </summary>
        <div className="pb-4">
          <p className="mb-3 text-sm leading-6 text-[#3c3e3a]">
            המחקר בודק מה המתחרים מפרסמים, מה מחפשים בגוגל ואילו מועדים מתקרבים, ואומר מה זה משנה בתוכנית.
          </p>
          {button}
          {error ? (
            <p role="alert" className="mt-2 text-sm text-[#9f4330]">
              {error}
            </p>
          ) : null}
        </div>
      </details>
    );
  }

  return (
    <section id="research" aria-labelledby="research-heading" className="scroll-mt-24">
      <h2 id="research-heading" className="text-base font-black text-[#20211f]">
        מה למדנו השבוע
      </h2>
      {run_.headline ? <p className="mt-2 text-sm font-bold leading-6 text-[#20211f]">{run_.headline}</p> : null}
      {run_.insights.length ? (
        <ul className="mt-3 divide-y divide-[#e9e8e3] overflow-hidden rounded-lg border border-[#e6e4dc] bg-white">
          {run_.insights.slice(0, 3).map((insight, index) => (
            <li key={`${insight.title}-${index}`}>
              <details className="group">
                <summary className="flex min-h-12 cursor-pointer list-none items-start gap-3 px-4 py-3 hover:bg-[#faf9f7]">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold leading-6 text-[#20211f]">{insight.title}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-[#3c3e3a]">
                      <b>מה זה משנה: </b>
                      {insight.plan_change}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className="mt-2 h-0 w-0 shrink-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-[#8b8e84] transition-transform duration-200 group-open:rotate-180"
                  />
                </summary>
                <div className="px-4 pb-3 text-xs leading-5 text-[#62635f]">
                  <p>{insight.text}</p>
                  <p className="mt-1">
                    {insight.confidence === "strong" ? "נשען על עובדה שנמדדה" : "כיוון, עוד לא מגמה"}
                    {insight.source_labels_he?.length ? ` · ${insight.source_labels_he.join(", ")}` : ""}
                  </p>
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : run_.insights_error_he ? (
        <p className="mt-2 text-sm leading-6 text-[#62635f]">{run_.insights_error_he}</p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-[#9f4330]">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** Results show which hypothesis they confirm (Revision 8): the plan's hypotheses, folded. */
export function PerformanceHypotheses() {
  const { payload } = useTrial();
  return <HypothesisStatus trial={payload} className="border-y border-[#e6e4dc]" />;
}
