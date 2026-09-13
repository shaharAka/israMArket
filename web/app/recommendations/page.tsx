"use client";

import { useEffect, useState } from "react";
import { AppShell, Badge, ErrorNote, PageHeader } from "@/components/AppShell";
import { endpoints, type RecommendationPayload } from "@/lib/api";
import { IconCheck, IconLightbulb } from "@/lib/icons";
import { toast } from "@/lib/ui";

const PRIORITY_MAP = {
  high: { label: "דחוף לשבוע זה", tone: "rose" as const },
  medium: { label: "מומלץ השבוע", tone: "blue" as const },
  low: { label: "לשיפור כללי", tone: "slate" as const },
};

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
          setError("עדיין אין המלצות שבועיות");
          return;
        }
        setData(payload);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "עדיין אין המלצות"));
  }, []);

  async function generate() {
    setPending(true);
    setError("");
    try {
      setData(await endpoints.generateRecommendations());
      toast("המלצות חדשות הופקו בהצלחה על סמך הביצועים!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לייצר המלצות כרגע");
    } finally {
      setPending(false);
    }
  }

  const suggestions = data?.suggestions.suggestions ?? [];
  // One primary action per page (UI-RULES rule 1). Adopting is the point of this screen, so
  // the dark filled button is the ONE recommendation waiting to be adopted — the first one
  // still open, which is the actual next step. Every other row gets a quiet outline button,
  // and "הפק המלצות חדשות" (a regeneration, not a step forward) is an outline button too.
  const nextIndex = suggestions.findIndex((item) => !accepted[item.title]);

  return (
    <AppShell>
      <PageHeader
        title="המלצות לשבוע הקרוב"
        subtitle="מה כדאי לעשות השבוע, לפי מה שעבד בפועל"
        action={
          <button
            type="button"
            onClick={generate}
            disabled={pending}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-[#c7c4b8] bg-transparent px-3 text-xs font-bold text-[#1e201d] hover:bg-[#f4f3ee] disabled:opacity-40"
          >
            <IconLightbulb className="w-4 h-4" />
            <span>{pending ? "מנתח נתונים ומפיק..." : "הפק המלצות חדשות"}</span>
          </button>
        }
      />

      <ErrorNote message={error} />

      {data ? (
        <div className="space-y-5">
          {/* The week's focus in one line — no heavy banner competing with the button. */}
          <div className="border-b border-[#e9e8e3] pb-4">
            <p className="text-xs font-bold text-[#747570]">המיקוד של השבוע</p>
            <p className="mt-1 max-w-3xl text-lg font-bold leading-relaxed text-[#20211f]">
              {data.suggestions.week_summary}
            </p>
            <p className="mt-1.5">
              <Badge tone="slate">שבוע {data.week_of}</Badge>
            </p>
          </div>

          {/* One container with hairline dividers, not a stack of equal-weight boxes. */}
          <ul className="divide-y divide-[#e9e8e3] border-y border-[#e9e8e3]">
            {suggestions.map((item, index) => {
              const priority = PRIORITY_MAP[item.priority] || PRIORITY_MAP.medium;
              const isDone = !!accepted[item.title];
              const isNext = index === nextIndex;

              return (
                <li key={item.title} className="py-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={priority.tone}>{priority.label}</Badge>
                    <span className="text-xs text-slate-500 font-medium">יעד: {item.target}</span>
                    {isNext ? (
                      <span className="text-xs font-bold text-[#20211f]">· הצעד הבא</span>
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
                    <summary className="cursor-pointer text-xs font-bold text-[#62635f]">
                      על בסיס מה ההמלצה (הנתונים שמאחוריה)
                    </summary>
                    <p className="mt-1.5 text-xs leading-6 text-slate-600">{item.evidence}</p>
                  </details>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {isDone ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                          <IconCheck className="w-3.5 h-3.5" />
                          סומן כמבוצע
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setAccepted((prev) => ({ ...prev, [item.title]: false }));
                            toast("ההמלצה הוחזרה למצב פתוח");
                          }}
                          className="text-xs font-bold text-[#62635f] underline underline-offset-2 hover:text-[#20211f]"
                        >
                          החזרה למצב פתוח
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setAccepted((prev) => ({ ...prev, [item.title]: true }));
                            toast("מעולה! ההמלצה סומנה כמבוצעת ✓");
                          }}
                          className={
                            isNext
                              ? "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-[#20211f] px-4 text-xs font-bold text-white hover:bg-[#343632]"
                              : "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-[#c7c4b8] bg-transparent px-3 text-xs font-bold text-[#1e201d] hover:bg-[#f4f3ee]"
                          }
                        >
                          <IconCheck className="w-3.5 h-3.5" />
                          <span>{isNext ? "אמץ את ההמלצה" : "אמץ"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toast("נשמר לרשימת המעקב")}
                          className="text-xs font-bold text-[#62635f] underline underline-offset-2 hover:text-[#20211f]"
                        >
                          שמור לאחר כך
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
