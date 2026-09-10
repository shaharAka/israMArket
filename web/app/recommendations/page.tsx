"use client";

import { useEffect, useState } from "react";
import { AppShell, Badge, Button, Card, ErrorNote, PageHeader } from "@/components/AppShell";
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

  return (
    <AppShell>
      <PageHeader
        title="המלצות מעשיות לשבוע הקרוב"
        subtitle="ה-AI ניתח את התוצאות והכין לכם רשימת פעולות קונקרטיות לשיפור המכירות והמעורבות"
        action={
          <Button onClick={generate} disabled={pending} size="sm" tone="primary">
            <IconLightbulb className="w-4 h-4" />
            <span>{pending ? "מנתח נתונים ומפיק..." : "הפק המלצות חדשות"}</span>
          </Button>
        }
      />

      <ErrorNote message={error} />

      {data ? (
        <div className="space-y-6">
          {/* Summary Box */}
          <div className="bg-gradient-to-l from-slate-900 to-slate-800 text-white rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider block mb-1">
                מיקוד שבועי
              </span>
              <h2 className="text-lg sm:text-xl font-bold leading-relaxed">
                {data.suggestions.week_summary}
              </h2>
            </div>
            <div className="shrink-0">
              <Badge tone="blue">שבוע {data.week_of}</Badge>
            </div>
          </div>

          {/* List of recommendations */}
          <div className="space-y-4">
            {data.suggestions.suggestions.map((item) => {
              const priority = PRIORITY_MAP[item.priority] || PRIORITY_MAP.medium;
              const isDone = !!accepted[item.title];

              return (
                <Card
                  key={item.title}
                  className={`transition ${
                    isDone
                      ? "border-emerald-300 bg-emerald-50/30"
                      : "hover:border-slate-300"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Badge tone={priority.tone}>{priority.label}</Badge>
                      <span className="text-xs text-slate-500 font-medium">יעד: {item.target}</span>
                    </div>

                    {isDone ? (
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <IconCheck className="w-3.5 h-3.5" />
                        <span>אומץ ובוצע</span>
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    <h3 className="text-lg font-bold text-slate-900">{item.title}</h3>
                    <p className="mt-2 text-sm text-slate-700 leading-relaxed font-medium">
                      {item.action}
                    </p>
                  </div>

                  <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs text-slate-600">
                    <span className="font-bold text-slate-700 block mb-0.5">על בסיס מה ההמלצה:</span>
                    {item.evidence}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        tone={isDone ? "success" : "primary"}
                        onClick={() => {
                          const nextState = !isDone;
                          setAccepted((prev) => ({ ...prev, [item.title]: nextState }));
                          toast(
                            nextState
                              ? "מעולה! ההמלצה סומנה כמבוצעת ✓"
                              : "ההמלצה הוחזרה למצב פתוח"
                          );
                        }}
                      >
                        <IconCheck className="w-3.5 h-3.5" />
                        <span>{isDone ? "אומץ בהצלחה ✓" : "אמץ המלצה זו"}</span>
                      </Button>

                      <Button
                        size="sm"
                        tone="ghost"
                        onClick={() => toast("נשמר לרשימת המעקב")}
                      >
                        שמור לאחר כך
                      </Button>
                    </div>

                    <span className="text-xs text-slate-400">המלצת AI מותאמת אישית</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
