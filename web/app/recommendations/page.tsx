"use client";

import { useEffect, useState } from "react";
import { AppShell, ErrorNote, PageHeader } from "@/components/AppShell";
import { UIAction } from "@/components/design/Controls";
import { endpoints, type RecommendationPayload } from "@/lib/api";
import { IconCheck, IconChevron } from "@/lib/icons";
import { toast } from "@/lib/ui";

/**
 * How urgent a recommendation is, as words with a small dot (DESIGN-STANDARD §4): the dot
 * carries the tone, the words carry the meaning. Urgent keeps the danger tone.
 */
const PRIORITY_MAP = {
  high: { label: "דחוף השבוע", dot: "bg-[var(--danger)]", text: "text-[color:var(--danger)]" },
  medium: { label: "מומלץ השבוע", dot: "bg-[var(--primary)]", text: "text-[color:var(--ink)]" },
  low: { label: "לא דחוף", dot: "bg-[var(--ink-faint)]", text: "text-[color:var(--ink-muted)]" },
};

/** `2026-09-01` reads as a machine string; the owner reads `1.9.2026`. */
function formatDay(iso: string) {
  const [year, month, date] = iso.split("-");
  if (!year || !month || !date) return iso;
  return `${Number(date)}.${Number(month)}.${year}`;
}

export default function RecommendationsPage() {
  const [data, setData] = useState<RecommendationPayload | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    endpoints
      .recommendations()
      .then((payload) => {
        if (payload.available === false) {
          setError("עוד אין המלצות לשבוע הזה");
          return;
        }
        setData(payload);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "עוד אין המלצות"));
  }, []);

  async function generate() {
    setPending(true);
    setError("");
    try {
      setData(await endpoints.generateRecommendations());
      toast("יש המלצות חדשות, לפי התוצאות האחרונות");
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו להכין המלצות. נסו שוב בעוד כמה דקות.");
    } finally {
      setPending(false);
    }
  }

  const suggestions = data?.suggestions.suggestions ?? [];
  // One primary action per page (UI-RULES rule 1). Adopting is the point of this screen, so
  // the filled button is the ONE recommendation waiting to be adopted — the first one still
  // open, which is the actual next step. Every other row gets a quiet outline button, and
  // "להכין המלצות חדשות" (a regeneration, not a step forward) is an outline button too.
  const nextIndex = suggestions.findIndex((item) => !accepted[item.title]);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="המלצות לשבוע הקרוב"
          subtitle="מה כדאי לעשות השבוע, לפי מה שבאמת הצליח"
          action={
            <UIAction variant="secondary" onClick={generate} disabled={pending}>
              {pending ? "מכינים המלצות…" : "להכין המלצות חדשות"}
            </UIAction>
          }
        />

        <ErrorNote message={error} />

        {data ? (
          <div className="space-y-8">
            {/* The week's focus: the headline, with the week it belongs to as its meta line. */}
            <section aria-labelledby="week-heading">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold text-[color:var(--ink)]">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[var(--sun)]" />
                <span id="week-heading">מה חשוב השבוע</span>
                <span className="font-medium tabular-nums text-[color:var(--ink-muted)]">
                  שבוע שמתחיל ב-{formatDay(data.week_of)}
                </span>
              </p>
              <p className="mt-3 max-w-[34em] text-[21px] font-bold leading-[1.45] tracking-tight text-balance text-[color:var(--ink)] sm:text-[23px]">
                {data.suggestions.week_summary}
              </p>
            </section>

            {/* One container with hairline dividers, not a stack of equal-weight boxes. */}
            <ul className="paper divide-y divide-[var(--rule)] overflow-hidden">
              {suggestions.map((item, index) => {
                const priority = PRIORITY_MAP[item.priority] || PRIORITY_MAP.medium;
                const isDone = !!accepted[item.title];
                const isNext = index === nextIndex;

                return (
                  <li
                    key={item.title}
                    className={`px-5 py-6 transition-colors sm:px-7 ${isNext ? "bg-[linear-gradient(270deg,var(--primary-soft),var(--paper)_75%)]" : ""}`}
                  >
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                      <span className={`inline-flex items-center gap-1.5 font-semibold ${priority.text}`}>
                        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${priority.dot}`} />
                        {priority.label}
                      </span>
                      <span className="text-[color:var(--ink-muted)]">איפה: {item.target}</span>
                      {isNext ? (
                        <span className="rounded-full bg-[var(--paper)] px-2.5 py-0.5 text-xs font-semibold text-[color:var(--primary)] shadow-[0_0_0_1px_var(--rule-dark)]">
                          הצעד הבא
                        </span>
                      ) : null}
                    </div>

                    <h3
                      className={`mt-3 text-[18px] font-bold leading-[1.45] tracking-tight sm:text-[19px] ${
                        isDone ? "text-[color:var(--ink-muted)]" : "text-[color:var(--ink)]"
                      }`}
                    >
                      {item.title}
                    </h3>
                    <p className="mt-1.5 max-w-[42em] text-[15px] leading-7 text-[color:var(--ink-soft)]">{item.action}</p>

                    {/* The reasoning is method, not the conclusion — it waits behind an expand. */}
                    <details className="group/why mt-1 max-w-[42em]">
                      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-[color:var(--ink-soft)] transition-colors hover:text-[color:var(--ink)] [&::-webkit-details-marker]:hidden">
                        למה אנחנו ממליצים
                        <IconChevron className="h-4 w-4 shrink-0 -rotate-90 text-[color:var(--ink-muted)] transition-transform duration-200 ease-[cubic-bezier(.2,.7,.2,1)] group-open/why:rotate-90" />
                      </summary>
                      <p className="pb-2 text-[14px] leading-6 text-[color:var(--ink-soft)]">{item.evidence}</p>
                    </details>

                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                      {isDone ? (
                        <>
                          <span className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold text-[color:var(--good)]">
                            <IconCheck className="h-4 w-4" />
                            בוצע
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setAccepted((prev) => ({ ...prev, [item.title]: false }));
                              toast("ביטלנו את הסימון");
                            }}
                            className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[color:var(--ink-soft)] hover:text-[color:var(--ink)] hover:underline hover:underline-offset-4"
                          >
                            לבטל את הסימון
                          </button>
                        </>
                      ) : (
                        <>
                          <UIAction
                            variant={isNext ? "primary" : "secondary"}
                            onClick={() => {
                              setAccepted((prev) => ({ ...prev, [item.title]: true }));
                              toast("מעולה, סימנו שההמלצה בוצעה ✓");
                            }}
                          >
                            <IconCheck className="h-4 w-4" />
                            <span>{isNext ? "לאמץ את ההמלצה" : "לאמץ"}</span>
                          </UIAction>
                          <button
                            type="button"
                            onClick={() => toast("שמרנו ברשימת המעקב")}
                            className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[color:var(--primary)] hover:underline hover:underline-offset-4"
                          >
                            לשמור להמשך
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
