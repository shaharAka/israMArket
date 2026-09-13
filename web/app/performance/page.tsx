"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell, Button, ErrorNote, PageHeader } from "@/components/AppShell";
import { endpoints, type AudiencePerformance, type PerformancePayload } from "@/lib/api";
import { IconChart } from "@/lib/icons";

const METRIC_LABELS: Record<string, { label: string; unit?: string; note: string }> = {
  sessions: { label: "כניסות לאתר", note: "סך כל הביקורים באתר" },
  engagedSessions: { label: "ביקורים מעורבים", note: "ביקורים שנמשכו מעל 10 שניות" },
  conversions: { label: "פניות והזמנות", note: "רכישות או לחיצות לוואטסאפ" },
  bounceRate: { label: "אחוז נטישה מיידי", note: "עזבו בלי לבצע שום פעולה" },
  screenPageViews: { label: "סך צפיות בעמודים", note: "דפים שנצפו בסך הכל" },
  averageSessionDuration: { label: "זמן שהייה ממוצע", unit: "שניות", note: "זמן ממוצע של לקוח באתר" },
};

/**
 * The one or two numbers that answer the owner's question — "is this working?" — in the
 * order they want them: how many people asked to buy, then how many came at all.
 *
 * Both live in the same `ga4.overview` map the full metric list comes from; a key that was
 * not measured is simply absent, and then it is not shown here at all rather than shown as
 * a zero.
 */
const LEAD_METRICS = ["conversions", "sessions"];

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

/** `2026-08-08` reads as a machine string; the owner reads `8.8.2026`. */
function formatPeriod(start?: string, end?: string) {
  const day = (iso: string) => {
    const [year, month, date] = iso.split("-");
    if (!year || !month || !date) return iso;
    return `${Number(date)}.${Number(month)}.${year}`;
  };
  if (!start || !end) return "";
  return `${day(start)} עד ${day(end)}`;
}

/**
 * Detail on demand. A native `<details>`, so closed content is out of the reading order —
 * and out of the measured page height — while staying one click away. Same control the
 * promotion screen uses.
 */
function Expand({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <details className="group border-t border-[#e6e4dc]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-bold text-[#5e6159] hover:text-[#20211f]">
        <span className="min-w-0">
          {title}
          {hint ? <span className="block text-xs font-normal text-[#8b8e84]">{hint}</span> : null}
        </span>
        <span aria-hidden className="shrink-0 text-[#8b8e84] transition-transform group-open:rotate-90">
          ‹
        </span>
      </summary>
      <div className="pb-2 pt-1">{children}</div>
    </details>
  );
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

/** What each column means, in the owner's words. No acronym has to be looked up. */
const METRIC_NOTES: Record<string, string> = {
  sessions: "כמה ביקורים הגיעו לאתר מהפוסטים של הקהל הזה.",
  conversions: "כמה רכשו או לחצו לוואטסאפ אחרי אותם פוסטים.",
  engaged_sessions: "ביקורים שנמשכו מעל 10 שניות — כלומר מישהו באמת הסתכל.",
  likes: "כמה סימנו לייק על הפוסטים של הקהל הזה.",
  comments: "כמה הגיבו עליהם.",
  impressions: "כמה פעמים הפוסטים הוצגו — גם לאותם אנשים יותר מפעם אחת.",
  reach: "כמה אנשים שונים ראו אותם, בלי לספור פעמיים.",
  saves: "כמה שמרו אותם לעצמם כדי לחזור אליהם.",
  shares: "כמה העבירו אותם הלאה.",
};

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

/**
 * The answer, first.
 *
 * The owner opens this screen to find out whether the marketing is working, so the lead is
 * the diagnostic headline plus the two numbers behind it. Everything else on the page is
 * supporting detail below this block. No border: this is the page's voice, not another box.
 */
function WeeklyAnswer({ payload }: { payload: PerformancePayload }) {
  const overview = payload.ga4?.overview ?? {};
  const headline = payload.diagnostic?.headline || "";
  const period = formatPeriod(payload.period_start, payload.period_end);
  const lead = LEAD_METRICS.filter((key) => overview[key] !== undefined).map((key) => ({
    key,
    label: METRIC_LABELS[key]?.label ?? key,
    note: METRIC_LABELS[key]?.note ?? "",
    value: formatMetricValue(key, overview[key]),
  }));

  return (
    <section className="rounded-2xl bg-[#fcf9f2] px-5 py-6 sm:px-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[11px] font-black tracking-wide text-[#685f47]">סיכום השבוע</p>
        {period ? <span className="text-[11px] text-[#8b8e84]">{period}</span> : null}
      </div>

      {headline ? (
        <h2 className="mt-2 max-w-3xl text-xl font-black leading-8 tracking-tight text-[#191b18] sm:text-2xl">
          {headline}
        </h2>
      ) : null}

      {lead.length ? (
        <dl className="mt-5 flex flex-wrap gap-x-12 gap-y-4 border-t border-[#e9e0cd] pt-4">
          {lead.map((item) => (
            <div key={item.key}>
              <dt className="text-xs font-bold text-[#685f47]">{item.label}</dt>
              <dd className="metric-number mt-1 text-3xl font-black text-[#191b18]">{item.value}</dd>
              {item.note ? <p className="mt-0.5 text-[11px] text-[#8b8e84]">{item.note}</p> : null}
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

/** Every other traffic number, one level down, with the plain-Hebrew meaning of each. */
function TrafficMetrics({ payload }: { payload: PerformancePayload }) {
  const entries = Object.entries(payload.ga4?.overview ?? {});
  if (!entries.length) return null;

  return (
    <Expand
      title="כל נתוני התנועה באתר"
      hint="מתוך גוגל אנליטיקס — התוכנה החינמית של גוגל שמודדת מה קורה באתר"
    >
      <dl className="divide-y divide-[#e6e4dc]">
        {entries.map(([key, value]) => {
          const meta = METRIC_LABELS[key];
          return (
            <div key={key} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
              <dt className="text-sm font-bold text-[#20211f]">
                {meta?.label ?? key}
                {meta?.note ? (
                  <span className="mt-0.5 block text-xs font-normal text-[#8b8e84]">{meta.note}</span>
                ) : null}
              </dt>
              <dd className="metric-number text-lg font-black text-[#20211f]">
                {formatMetricValue(key, value)}
              </dd>
            </div>
          );
        })}
      </dl>
    </Expand>
  );
}

/** The verdict on the content: what worked, and what is worth another attempt. */
function ContentVerdict({ payload }: { payload: PerformancePayload }) {
  const groups = [
    {
      id: "worked",
      title: "מה עבד מצוין",
      hint: "התוכן שהביא הכי הרבה תוצאות",
      items: payload.diagnostic?.top_content ?? [],
      mark: "bg-[#eaf0e6]",
    },
    {
      id: "improve",
      title: "מה כדאי לשפר",
      hint: "הזדמנויות לשדרוג הפוסטים",
      items: payload.diagnostic?.bottom_content ?? [],
      mark: "bg-[#f5efe3]",
    },
  ].filter((group) => group.items.length);

  if (!groups.length) return null;

  return (
    <div className="grid gap-8 md:grid-cols-2 md:gap-10">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`${group.id}-heading`}>
          <h2 id={`${group.id}-heading`} className="text-base font-black text-[#20211f]">
            {group.title}
          </h2>
          <p className="mt-1 text-xs text-[#8b8e84]">{group.hint}</p>
          <ul className="mt-2 divide-y divide-[#e6e4dc]">
            {group.items.map((item) => (
              <li key={item.label} className="flex gap-3 py-3">
                <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${group.mark}`} />
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-[#20211f]">{item.label}</h3>
                  <p className="mt-1 text-xs leading-5 text-[#63665e] sm:text-sm sm:leading-6">{item.why}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Where people drop off on the way to buying. Plain Hebrew: no "funnel" on the face. */
function Friction({ payload }: { payload: PerformancePayload }) {
  const issues = payload.diagnostic?.funnel_issues ?? [];
  if (!issues.length) return null;

  return (
    <section aria-labelledby="friction-heading">
      <h2 id="friction-heading" className="text-base font-black text-[#20211f]">
        מה עוצר אנשים בדרך לקנייה
      </h2>
      <ul className="mt-2 divide-y divide-[#e6e4dc]">
        {issues.map((issue) => (
          <li key={issue} className="flex items-start gap-2.5 py-3 text-xs leading-5 text-[#3c3e3a] sm:text-sm sm:leading-6">
            <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#b3b0a5]" />
            <span>{issue}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Results broken down by the audience each post serves.
 *
 * Every honesty rule on this screen lives here and none of them moved: a bucket nobody
 * measured stays `אין מדידה`, the posts column is the sample size and travels with every
 * row, the `לא משויך` bucket is shown as its own row, and the backend's own `explanation`
 * is printed when a source is not connected.
 */
function AudienceBreakdown({ payload }: { payload: PerformancePayload }) {
  const data = payload.audiences as AudiencePerformance;
  const rows = data.rows ?? [];
  const maxPosts = rows.reduce((max, row) => Math.max(max, row.posts || 0), 0);
  const connected = data.connected ?? {};
  const anyConnected = Boolean(connected.ga4 || connected.meta);
  const offline = [
    !connected.ga4 ? "גוגל אנליטיקס" : "",
    !connected.meta ? "אינסטגרם" : "",
  ].filter(Boolean);
  const period = formatPeriod(payload.period_start, payload.period_end);

  // Only the buckets somebody actually carries become columns.
  const columns = METRIC_COLUMNS.filter((column) =>
    rows.some((row) => {
      const bucket = column.source === "ga4" ? row.ga4 : row.meta;
      return bucket != null && bucket[column.key as keyof typeof bucket] !== undefined;
    }),
  );

  return (
    <section aria-labelledby="audience-heading" className="mt-8 border-t border-[#e6e4dc] pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="audience-heading" className="text-base font-black text-[#20211f]">
          מה עבד לכל קהל
        </h2>
        {period ? <span className="text-[11px] text-[#8b8e84]">תקופה: {period}</span> : null}
      </div>
      <p className="mt-1 max-w-3xl text-xs leading-5 text-[#8b8e84]">
        הסכום של מה שכבר שויך לכל פוסט, לפי הקהל שהפוסט משרת. עמודת הפוסטים היא גודל המדגם —
        קהל עם פוסט אחד הוא כיוון, לא מגמה.
      </p>

      {!rows.length ? (
        <p className="mt-4 text-sm text-[#8b8e84]">אין עדיין פוסטים בתוכנית, ולכן אין מה לפרק לפי קהל.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-[#e6e4dc] bg-white">
          <table className="w-full min-w-[560px] border-collapse text-right">
            <thead>
              <tr className="text-[11px] text-[#8b8e84]">
                <th scope="col" className="px-4 py-2.5 font-bold">קהל</th>
                <th scope="col" className="px-3 py-2.5 text-center font-bold">פוסטים</th>
                {columns.map((column) => (
                  <th key={column.key} scope="col" className="px-3 py-2.5 text-center font-bold">
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
                    className={`border-t border-[#eeede8] align-top ${
                      unassigned ? "bg-[#f4f3ee]" : index % 2 ? "bg-[#faf9f7]" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <span
                        className={`block text-xs ${
                          unassigned ? "font-bold text-[#8b8e84]" : "font-bold text-[#191b18]"
                        }`}
                      >
                        {row.name || UNASSIGNED_NAME}
                        {row.is_primary ? (
                          <span className="ms-2 rounded-full bg-[#eaf0e6] px-2 py-0.5 text-[10px] font-bold text-[#374b3d]">
                            הקהל המוביל
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        {/* The sample size also draws the bar, so a one-post row cannot
                            read as a trend at a glance. */}
                        <span className="block h-1 w-16 shrink-0 overflow-hidden rounded-full bg-[#e6e4dc]">
                          <span
                            className={`block h-full rounded-full ${
                              unassigned ? "bg-[#b3b0a5]" : "bg-[#3f4a5c]"
                            }`}
                            style={{
                              width: `${
                                maxPosts ? Math.max(8, ((row.posts || 0) / maxPosts) * 100) : 0
                              }%`,
                            }}
                          />
                        </span>
                        <span className="text-[10px] leading-4 text-[#8b8e84]">
                          {unassigned
                            ? "פוסטים שעוד לא שויכו לקהל"
                            : row.posts && measured < row.posts
                              ? `נמדדו ${measured} מתוך ${row.posts} פוסטים`
                              : ""}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="metric-number font-bold text-[#191b18]">
                        {(row.posts || 0).toLocaleString("he-IL")}
                      </span>
                      {row.posts === 1 ? (
                        <span className="mt-0.5 block text-[10px] text-[#9f4330]">פוסט אחד</span>
                      ) : null}
                    </td>
                    {columns.map((column) => {
                      const bucket = column.source === "ga4" ? row.ga4 : row.meta;
                      const value =
                        bucket == null
                          ? undefined
                          : (bucket[column.key as keyof typeof bucket] as number | undefined);
                      return (
                        <td key={column.key} className="px-3 py-2.5 text-center">
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
        <p className="mt-3 rounded-xl bg-[#f5efe3] px-4 py-3 text-xs leading-6 text-[#5e5340]">
          {data.explanation ||
            "אין נתוני מדידה לפי קהל. חברו את גוגל אנליטיקס או את אינסטגרם, ואז נסכום לכל קהל את מה שכבר שויך לפוסטים שלו."}{" "}
          <Link href="/integrations" className="font-bold text-[#20211f] underline underline-offset-4">
            לחיבור גוגל ואינסטגרם
          </Link>
        </p>
      ) : data.explanation ? (
        <p className="mt-3 text-xs leading-6 text-[#63665e]">{data.explanation}</p>
      ) : null}

      {anyConnected && offline.length ? (
        <p className="mt-2 text-[11px] leading-5 text-[#8b8e84]">
          אין כרגע חיבור פעיל ל{offline.join(" ול")}
          {data.synced_at ? ` — המספרים כאן מהרענון האחרון (${data.synced_at}).` : "."}
        </p>
      ) : null}

      <Expand title="איך חישבנו את המספרים" hint="השיטה, ומה כל עמודה בטבלה אומרת">
        {data.method ? (
          <p className="text-xs leading-6 text-[#63665e]">{data.method}</p>
        ) : null}
        <dl className="mt-3 divide-y divide-[#e6e4dc]">
          {columns.map((column) => (
            <div key={column.key} className="py-2.5">
              <dt className="text-xs font-bold text-[#20211f]">{column.label}</dt>
              <dd className="mt-0.5 text-xs leading-5 text-[#63665e]">
                {METRIC_NOTES[column.key] ?? ""}
              </dd>
            </div>
          ))}
        </dl>
      </Expand>
    </section>
  );
}

/** Nothing has been synced yet. A normal state on this screen, and not an error. */
function NoSnapshotYet() {
  return (
    <section className="rounded-2xl bg-white px-6 py-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#f2eee5] text-[#191b18]">
        <IconChart className="w-6 h-6" />
      </div>
      <h2 className="mt-4 text-lg font-black text-[#191b18]">עדיין לא סונכרנו נתוני ביצועים</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#5e6159]">
        כדי לראות נתוני תנועה, פניות מהאתר ומעורבות באינסטגרם, חברו את חשבונות גוגל אנליטיקס
        והאינסטגרם שלכם.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Link
          href="/integrations"
          className="drawn-button inline-flex items-center gap-2 border border-[#c7c4b8] bg-white px-4 py-2 text-sm font-bold text-[#1e201d] hover:bg-[#f4f3ee]"
        >
          <span>לחיבור גוגל ואינסטגרם</span>
          <span aria-hidden>←</span>
        </Link>
      </div>
    </section>
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

  const available = Boolean(data && data.available !== false);

  return (
    <AppShell>
      <PageHeader
        title="תוצאות וביצועים"
        subtitle="כמה אנשים הגיעו, איזה תוכן עבד הכי טוב, ואיפה כדאי להשתפר"
        action={
          <Button onClick={sync} disabled={pending} tone="primary" size="sm">
            <IconChart className="w-4 h-4" />
            <span>{pending ? "מרענן את הנתונים…" : "רענון הנתונים והמלצה לשבוע"}</span>
          </Button>
        }
      />

      <ErrorNote message={error} />

      {available && data ? (
        <div className="space-y-8">
          {/* The answer, then one level down: the rest of the numbers, and the content
              verdict behind them. */}
          <WeeklyAnswer payload={data} />
          <TrafficMetrics payload={data} />
          <ContentVerdict payload={data} />
          <Friction payload={data} />
        </div>
      ) : data ? (
        <NoSnapshotYet />
      ) : null}

      {/* The audience sample exists before the first sync, so it is shown either way:
          how many posts each segment has, and why the numbers are missing. */}
      {data?.audiences ? <AudienceBreakdown payload={data} /> : null}
    </AppShell>
  );
}
