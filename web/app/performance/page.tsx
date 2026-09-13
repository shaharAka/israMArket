"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, Badge, Button, Card, ErrorNote, PageHeader } from "@/components/AppShell";
import { endpoints, type AudiencePerformance, type PerformancePayload } from "@/lib/api";
import { IconChart, IconUsers } from "@/lib/icons";

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

/**
 * The metric columns to show, derived from what the rows actually carry.
 *
 * Nothing here is a fixed promise: if the sync summed sessions and conversions but no Meta
 * insights, the table shows two columns and no empty ones. The order is the order a reader
 * wants them in, and a bucket that exists for nobody never appears.
 */
const METRIC_COLUMNS: { key: string; label: string; source: "ga4" | "meta" }[] = [
  { key: "sessions", label: "כניסות לאתר", source: "ga4" },
  { key: "conversions", label: "פניות והזמנות", source: "ga4" },
  { key: "engaged_sessions", label: "ביקורים מעורבים", source: "ga4" },
  { key: "likes", label: "לייקים", source: "meta" },
  { key: "comments", label: "תגובות", source: "meta" },
  { key: "impressions", label: "חשיפות", source: "meta" },
  { key: "reach", label: "אנשים שהגיעו", source: "meta" },
  { key: "saves", label: "שמירות", source: "meta" },
  { key: "shares", label: "שיתופים", source: "meta" },
];

/** The label the backend gives the untagged bucket. A row with a null id is the same thing. */
const UNASSIGNED_NAME = "לא משויך";

/**
 * One cell. A metric that was not measured is `אין מדידה` — never `0`, which would claim a
 * measured result of nothing. The two are different facts and the table keeps them apart.
 */
function MetricCell({ value }: { value: number | undefined }) {
  if (value === undefined || value === null) {
    return <span className="text-[11px] text-[#8b8e84]">אין מדידה</span>;
  }
  return (
    <span className="metric-number font-bold text-[#191b18]">{value.toLocaleString("he-IL")}</span>
  );
}

/** Results broken down by the audience each post serves. */
function AudienceBreakdown({ payload }: { payload: PerformancePayload }) {
  const data = payload.audiences as AudiencePerformance;
  const rows = data.rows ?? [];
  const maxPosts = rows.reduce((max, row) => Math.max(max, row.posts || 0), 0);
  const connected = data.connected ?? {};
  const anyConnected = Boolean(connected.ga4 || connected.meta);
  const offline = [
    !connected.ga4 ? "Google Analytics 4" : "",
    !connected.meta ? "אינסטגרם" : "",
  ].filter(Boolean);

  // Only the buckets somebody actually carries become columns.
  const columns = METRIC_COLUMNS.filter((column) =>
    rows.some((row) => {
      const bucket = column.source === "ga4" ? row.ga4 : row.meta;
      return bucket != null && bucket[column.key as keyof typeof bucket] !== undefined;
    }),
  );

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h3 className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
            <IconUsers className="h-4 w-4" />
            מה עבד לכל קהל
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
            הסכום של מה שכבר שויך לכל פוסט, לפי הקהל שהפוסט משרת. עמודת הפוסטים היא גודל
            המדגם — קהל עם פוסט אחד הוא כיוון, לא מגמה.
          </p>
        </div>
        <span className="text-[11px] text-slate-500">
          {payload.period_start && payload.period_end
            ? `תקופה: ${payload.period_start} עד ${payload.period_end}`
            : ""}
        </span>
      </div>

      {!rows.length ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          אין עדיין פוסטים בתוכנית, ולכן אין מה לפרק לפי קהל.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-right">
            <thead>
              <tr className="text-[11px] text-slate-500">
                <th scope="col" className="py-2 pl-2 font-bold">קהל</th>
                <th scope="col" className="py-2 px-2 font-bold text-center">פוסטים</th>
                {columns.map((column) => (
                  <th key={column.key} scope="col" className="py-2 px-2 font-bold text-center">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const unassigned = row.audience_id === null || row.name === UNASSIGNED_NAME;
                const measured = row.measured_posts ?? 0;
                return (
                  <tr
                    key={row.audience_id === null ? "unassigned" : row.audience_id}
                    className={`border-t border-slate-100 align-top ${
                      unassigned ? "bg-slate-50" : index % 2 ? "bg-slate-50/40" : ""
                    }`}
                  >
                    <td className="py-2.5 pl-2">
                      <span
                        className={`block text-xs ${
                          unassigned ? "font-bold text-slate-500" : "font-bold text-slate-900"
                        }`}
                      >
                        {row.name || UNASSIGNED_NAME}
                        {row.is_primary ? (
                          <span className="ms-2 rounded-full bg-[#f3f4f7] px-2 py-0.5 text-[10px] font-bold text-[#3f4a5c]">
                            הקהל המוביל
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        {/* The sample size also draws the bar, so a one-post row cannot
                            read as a trend at a glance. */}
                        <span className="block h-1 w-16 shrink-0 overflow-hidden rounded-full bg-slate-200/70">
                          <span
                            className={`block h-full rounded-full ${
                              unassigned ? "bg-slate-400" : "bg-[#3f4a5c]"
                            }`}
                            style={{
                              width: `${
                                maxPosts ? Math.max(8, ((row.posts || 0) / maxPosts) * 100) : 0
                              }%`,
                            }}
                          />
                        </span>
                        <span className="text-[10px] leading-4 text-slate-400">
                          {unassigned
                            ? "פוסטים שעוד לא שויכו לקהל"
                            : row.posts && measured < row.posts
                              ? `נמדדו ${measured} מתוך ${row.posts} פוסטים`
                              : ""}
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span className="metric-number font-bold text-slate-900">
                        {(row.posts || 0).toLocaleString("he-IL")}
                      </span>
                      {row.posts === 1 ? (
                        <span className="mt-0.5 block text-[10px] text-amber-700">פוסט אחד</span>
                      ) : null}
                    </td>
                    {columns.map((column) => {
                      const bucket = column.source === "ga4" ? row.ga4 : row.meta;
                      const value =
                        bucket == null
                          ? undefined
                          : (bucket[column.key as keyof typeof bucket] as number | undefined);
                      return (
                        <td key={column.key} className="py-2.5 px-2 text-center">
                          <MetricCell value={value} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!anyConnected ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs leading-6 text-slate-700">
          {data.explanation ||
            "אין נתוני מדידה לפי קהל. חברו את Google Analytics 4 או את אינסטגרם, ואז נסכום לכל קהל את מה שכבר שויך לפוסטים שלו."}{" "}
          <Link href="/integrations" className="font-bold text-slate-900 underline underline-offset-4">
            לחיבור החשבונות
          </Link>
        </p>
      ) : data.explanation ? (
        <p className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-6 text-slate-600">
          {data.explanation}
        </p>
      ) : null}

      {anyConnected && offline.length ? (
        <p className="mt-2 text-[11px] leading-5 text-slate-500">
          אין כרגע חיבור פעיל ל{offline.join(" ול")}
          {data.synced_at ? ` — המספרים כאן מהסנכרון האחרון (${data.synced_at}).` : "."}
        </p>
      ) : null}

      {data.method ? (
        <p className="mt-2 text-[11px] leading-5 text-slate-400">{data.method}</p>
      ) : null}
    </Card>
  );
}

export default function PerformancePage() {
  const [data, setData] = useState<PerformancePayload | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    endpoints
      .performance()
      // "No sync yet" is not an error: the endpoint still answers with the per-audience
      // sample (how many posts each segment has). Only a real failure sets the error.
      .then((payload) => setData(payload))
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

      {/* The audience sample exists before the first sync, so it is shown either way:
          how many posts each segment has, and why the numbers are missing. */}
      {data?.audiences ? (
        <div className="mb-6">
          <AudienceBreakdown payload={data} />
        </div>
      ) : null}

      {data && data.available !== false ? (
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
      ) : data ? (
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
      ) : null}
    </AppShell>
  );
}
