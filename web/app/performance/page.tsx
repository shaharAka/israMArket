"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, Badge, Button, Card, ErrorNote, PageHeader } from "@/components/AppShell";
import { endpoints, type PerformancePayload } from "@/lib/api";
import { IconChart } from "@/lib/icons";

const METRIC_LABELS: Record<string, { label: string; unit?: string; note: string }> = {
  sessions: { label: "כניסות לאתר", note: "סך כל הביקורים באתר" },
  engagedSessions: { label: "ביקורים מעורבים", note: "ביקורים שנמשכו מעל 10 שניות" },
  conversions: { label: "פניות והזמנות", note: "רכישות או לחיצות לוואטסאפ" },
  bounceRate: { label: "אחוז נטישה מיידי", note: "עזבו בלי לבצע שום פעולה" },
  screenPageViews: { label: "סך צפיות בעמודים", note: "דפים שנצפו בסך הכל" },
  averageSessionDuration: { label: "זמן שהייה ממוצע", unit: "שניות", note: "זמן ממוצע של לקוח באתר" },
};

function formatMetricValue(key: string, val: string) {
  if (key === "bounceRate") {
    const num = Number(val);
    if (!Number.isNaN(num)) return `${Math.round(num * 100)}%`;
  }
  if (key === "averageSessionDuration") {
    const num = Number(val);
    if (!Number.isNaN(num)) return `${Math.round(num)} שניות`;
  }
  const num = Number(val);
  if (!Number.isNaN(num)) return num.toLocaleString("he-IL");
  return val;
}

export default function PerformancePage() {
  const [data, setData] = useState<PerformancePayload | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    endpoints
      .performance()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "עדיין אין נתונים להצגה"));
  }, []);

  async function sync() {
    setPending(true);
    setError("");
    try {
      const weekly = await endpoints.weeklyLoop();
      setData(weekly.performance);
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לרענן את הנתונים מגוגל/מטא");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="תוצאות וביצועים"
        subtitle="ניתוח שיווקי פשוט וברור: כמה אנשים הגיעו, איזה תוכן עבד הכי טוב, ואיפה כדאי להשתפר"
        action={
          <Button onClick={sync} disabled={pending} tone="primary" size="sm">
            <IconChart className="w-4 h-4" />
            <span>{pending ? "מרענן ומאבחן…" : "סנכרנו והציעו המלצה לשבוע"}</span>
          </Button>
        }
      />

      <ErrorNote message={error} />

      {data ? (
        <div className="space-y-6">
          {/* Executive Summary Card */}
          <div className="rounded-lg border border-[#e2d7c3] bg-[#fcf9f2] p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#685f47]">סיכום השבוע</span>
              <span className="text-xs text-[#8b8e84]">
                תקופה: {data.period_start} עד {data.period_end}
              </span>
            </div>
            <h2 className="text-xl font-black tracking-tight text-[#191b18] sm:text-2xl">
              {data.diagnostic.headline}
            </h2>
          </div>

          {/* GA4 Core Metrics */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-3">נתוני תנועה והמרות מהאתר (GA4)</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(data.ga4.overview || {}).map(([key, val]) => {
                const meta = METRIC_LABELS[key] || { label: key, note: "" };
                return (
                  <Card key={key} className="flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {meta.label}
                      </span>
                      <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">
                        {formatMetricValue(key, val)}
                      </div>
                    </div>
                    {meta.note ? (
                      <p className="mt-3 text-xs text-slate-400 pt-2 border-t border-slate-100">
                        {meta.note}
                      </p>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Top vs Bottom Content */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Top performing content */}
            <Card className="border-emerald-200">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <Badge tone="emerald">מה עבד מצוין</Badge>
                <span className="text-xs text-slate-500 font-medium">התוכן שהביא הכי הרבה תוצאות</span>
              </div>
              <div className="mt-4 space-y-3">
                {data.diagnostic.top_content.map((item) => (
                  <div key={item.label} className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3.5">
                    <h4 className="text-sm font-bold text-slate-900">{item.label}</h4>
                    <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">{item.why}</p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Content to improve */}
            <Card className="border-amber-200">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <Badge tone="amber">מה כדאי לשפר</Badge>
                <span className="text-xs text-slate-500 font-medium">הזדמנויות לשדרוג הפוסטים</span>
              </div>
              <div className="mt-4 space-y-3">
                {data.diagnostic.bottom_content.map((item) => (
                  <div key={item.label} className="bg-amber-50/40 border border-amber-100 rounded-xl p-3.5">
                    <h4 className="text-sm font-bold text-slate-900">{item.label}</h4>
                    <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">{item.why}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Funnel Bottlenecks */}
          {data.diagnostic.funnel_issues.length > 0 ? (
            <Card>
              <h3 className="text-sm font-bold text-slate-900 mb-3">נקודות חיכוך במשפך השיווקי</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {data.diagnostic.funnel_issues.map((issue) => (
                  <div
                    key={issue}
                    className="flex items-start gap-2.5 bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs sm:text-sm text-slate-800"
                  >
                    <span className="text-blue-600 font-bold mt-0.5">•</span>
                    <span>{issue}</span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      ) : (
        <Card className="text-center py-12 px-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#f2eee5] text-[#191b18] mb-4">
            <IconChart className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-[#191b18]">עדיין לא סונכרנו נתוני ביצועים</h2>
          <p className="mt-2 text-sm text-[#5e6159] max-w-md mx-auto">
            כדי לראות נתוני תנועה, המרות מהאתר ומעורבות באינסטגרם, חברו את חשבונות ה-Google Analytics ואינסטגרם שלכם.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/integrations"
              className="drawn-button inline-flex items-center gap-2 bg-[#191b18] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#2c2f29]"
            >
              <span>חיבור גוגל אנליטיקס ואינסטגרם</span>
              <span>←</span>
            </Link>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
