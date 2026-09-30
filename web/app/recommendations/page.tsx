"use client";

import { useEffect, useState } from "react";
import { AppShell, Badge, ErrorNote, PageHeader } from "@/components/AppShell";
import { endpoints, type RecommendationPayload } from "@/lib/api";
import { IconCheck, IconLightbulb } from "@/lib/icons";
import { toast } from "@/lib/ui";

const PRIORITY_MAP = {
  high: { label: "דחוף השבוע", tone: "rose" as const },
  medium: { label: "מומלץ השבוע", tone: "blue" as const },
  low: { label: "לא דחוף", tone: "slate" as const },
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
  // the dark filled button is the ONE recommendation waiting to be adopted — the first one
  // still open, which is the actual next step. Every other row gets a quiet outline button,
  // and "להכין המלצות חדשות" (a regeneration, not a step forward) is an outline button too.
  const nextIndex = suggestions.findIndex((item) => !accepted[item.title]);

  return (
    <AppShell>
      <PageHeader
        title="המלצות לשבוע הקרוב"
        subtitle="מה כדאי לעשות השבוע, לפי מה שבאמת הצליח"
        action={
          <button
            type="button"
            onClick={generate}
            disabled={pending}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-[#c3cee5] bg-transparent px-3 text-xs font-bold text-[#1d2940] hover:bg-[#edf2ff] disabled:opacity-40"
          >
            <IconLightbulb className="w-4 h-4" />
            <span>{pending ? "מכינים המלצות…" : "להכין המלצות חדשות"}</span>
          </button>
        }
      />

      <ErrorNote message={error} />

      {data ? (
        <div className="space-y-5">
          {/* The week's focus in one line — no heavy banner competing with the button. */}
          <div className="border-b border-[#e1e7f2] pb-4">
            <p className="text-xs font-bold text-[#647087]">מה חשוב השבוע</p>
            <p className="mt-1 max-w-3xl text-lg font-bold leading-relaxed text-[#1d2940]">
              {data.suggestions.week_summary}
            </p>
            <p className="mt-1.5">
              <Badge tone="slate">שבוע שמתחיל ב-{formatDay(data.week_of)}</Badge>
            </p>
          </div>

          {/* One container with hairline dividers, not a stack of equal-weight boxes. */}
          <ul className="divide-y divide-[#e1e7f2] border-y border-[#e1e7f2]">
            {suggestions.map((item, index) => {
              const priority = PRIORITY_MAP[item.priority] || PRIORITY_MAP.medium;
              const isDone = !!accepted[item.title];
              const isNext = index === nextIndex;

              return (
                <li key={item.title} className="py-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={priority.tone}>{priority.label}</Badge>
                    <span className="text-xs text-slate-500 font-medium">איפה: {item.target}</span>
                    {isNext ? (
                      <span className="text-xs font-bold text-[#1d2940]">· הצעד הבא</span>
                    ) : null}
                  </div>

                  <h3 className={`mt-2 text-lg font-bold ${isDone ? "text-slate-500" : "text-slate-900"}`}>
                    {item.title}
                  </h3>
                  <p className="mt-1.5 max-w-3xl text-sm font-medium leading-relaxed text-slate-700">
                    {item.action}
                  </p>

                  {/* The reasoning is method, not the conclusion — it waits behind an expand. */}
                  <details className="mt-2 max-w-3xl">
                    <summary className="cursor-pointer text-xs font-bold text-[#535f75]">
                      למה אנחנו ממליצים
                    </summary>
                    <p className="mt-1.5 text-xs leading-6 text-slate-600">{item.evidence}</p>
                  </details>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {isDone ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                          <IconCheck className="w-3.5 h-3.5" />
                          בוצע
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setAccepted((prev) => ({ ...prev, [item.title]: false }));
                            toast("ביטלנו את הסימון");
                          }}
                          className="text-xs font-bold text-[#535f75] underline underline-offset-2 hover:text-[#1d2940]"
                        >
                          לבטל את הסימון
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setAccepted((prev) => ({ ...prev, [item.title]: true }));
                            toast("מעולה, סימנו שההמלצה בוצעה ✓");
                          }}
                          className={
                            isNext
                              ? "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-[#2853c7] px-4 text-xs font-bold text-white hover:bg-[#1e42a4]"
                              : "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-[#c3cee5] bg-transparent px-3 text-xs font-bold text-[#1d2940] hover:bg-[#edf2ff]"
                          }
                        >
                          <IconCheck className="w-3.5 h-3.5" />
                          <span>{isNext ? "לאמץ את ההמלצה" : "לאמץ"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toast("שמרנו ברשימת המעקב")}
                          className="text-xs font-bold text-[#535f75] underline underline-offset-2 hover:text-[#1d2940]"
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
    </AppShell>
  );
}
