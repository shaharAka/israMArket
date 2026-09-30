"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell, Button, ErrorNote, PageHeader } from "@/components/AppShell";
import { HowToFind } from "@/components/help/HowToFind";
import { endpoints, type AudiencePerformance, type PerformancePayload } from "@/lib/api";
import { IconChart } from "@/lib/icons";
import { FAMILY_HE, whatsappEndpoints, type WhatsappPayload } from "@/lib/whatsapp";

const METRIC_LABELS: Record<string, { label: string; note: string }> = {
  sessions: { label: "כניסות לאתר", note: "כמה פעמים נכנסו לאתר" },
  engagedSessions: { label: "נשארו באתר", note: "כניסות של יותר מ-10 שניות" },
  conversions: { label: "פניות והזמנות", note: "רכישות באתר או לחיצות על וואטסאפ" },
  bounceRate: { label: "יצאו מיד", note: "אחוז הנכנסים שיצאו בלי לעשות כלום" },
  screenPageViews: { label: "צפיות בעמודים", note: "כמה עמודים נפתחו בסך הכול" },
  averageSessionDuration: { label: "זמן ממוצע באתר", note: "כמה זמן נשארים באתר, בממוצע" },
};

function formatMetricValue(key: string, val: string) {
  const num = Number(val);
  if (key === "bounceRate" && !Number.isNaN(num)) return `${Math.round(num * 100)}%`;
  if (key === "averageSessionDuration" && !Number.isNaN(num)) return `${Math.round(num)} שניות`;
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

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * Detail on demand. A native `<details>`, so closed content is out of the reading order —
 * and out of the measured page height and word count — while staying one click away.
 */
function Expand({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-bold text-[#1d2940]">
        <span className="min-w-0">{title}</span>
        <span aria-hidden className="shrink-0 text-[#647087] transition-transform group-open:-rotate-90">
          ‹
        </span>
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

/* ------------------------------------------------------------------------------------ */
/* Per-post results                                                                      */
/* ------------------------------------------------------------------------------------ */

/**
 * One post's results, summed from what the sync attributed to it: its GA4 campaign rows
 * (matched by the post's tracking link) and its matched Instagram post. `undefined` is
 * "not measured" — never zero. A post with nothing matched is a normal state, and the
 * screen says so rather than ranking it last with a 0.
 */
type PostResult = {
  key: string;
  title: string;
  audience: string;
  sessions?: number;
  conversions?: number;
  likes?: number;
  comments?: number;
  measured: boolean;
};

function postResults(payload: PerformancePayload): PostResult[] | null {
  const rows = payload.ga4?.post_attribution;
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows.map((raw, index) => {
    const row = raw as {
      title?: string;
      utm_content?: string;
      audience_name?: string;
      ga4?: Record<string, unknown>[];
      meta?: Record<string, unknown> | null;
    };
    const sum = (key: string) => {
      const values = (row.ga4 || []).map((campaign) => toNumber(campaign?.[key])).filter((v) => v !== undefined);
      return values.length ? values.reduce((a, b) => a + (b as number), 0) : undefined;
    };
    const sessions = sum("sessions");
    const conversions = sum("conversions");
    const likes = row.meta ? toNumber(row.meta.like_count) : undefined;
    const comments = row.meta ? toNumber(row.meta.comments_count) : undefined;
    return {
      key: row.utm_content || `${row.title}-${index}`,
      title: row.title || "פוסט בלי שם",
      audience: row.audience_name || "",
      sessions,
      conversions,
      likes,
      comments,
      measured: [sessions, conversions, likes, comments].some((v) => v !== undefined),
    };
  });
}

/** Best first: inquiries, then visits, then likes. Unmeasured posts are not ranked. */
function byResult(a: PostResult, b: PostResult) {
  return (
    (b.conversions ?? -1) - (a.conversions ?? -1) ||
    (b.sessions ?? -1) - (a.sessions ?? -1) ||
    (b.likes ?? -1) - (a.likes ?? -1)
  );
}

function ResultFigures({ result }: { result: PostResult }) {
  if (!result.measured) return <span className="text-xs text-[#647087]">לא נמדד</span>;
  const parts = [
    result.conversions !== undefined ? `${result.conversions.toLocaleString("he-IL")} פניות` : "",
    result.sessions !== undefined ? `${result.sessions.toLocaleString("he-IL")} כניסות` : "",
    result.likes !== undefined ? `${result.likes.toLocaleString("he-IL")} לייקים` : "",
  ].filter(Boolean);
  return <span className="metric-number text-xs text-[#3c3e3a]">{parts.join(" · ")}</span>;
}

function ResultRow({ result, best }: { result: PostResult; best?: boolean }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-[#1d2940]">{result.title}</span>
          {best ? (
            <span className="shrink-0 rounded-full bg-[#edf2ff] px-2 py-0.5 text-[11px] font-bold text-[#2853c7]">
              הכי טוב
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block">
          <ResultFigures result={result} />
        </span>
      </span>
    </li>
  );
}

/** How many posts show before the rest fold away. Enough to see what worked. */
const VISIBLE_POSTS = 3;

/**
 * Which posts worked — the second thing the owner wants after "is it working at all".
 *
 * The count of unmeasured posts is stated in the open, outside the fold: it is the
 * reason the list is shorter than the month, and it is not a zero.
 */
function PostResults({ results }: { results: PostResult[] }) {
  const measured = results.filter((r) => r.measured).sort(byResult);
  const unmeasured = results.filter((r) => !r.measured);
  const visible = measured.slice(0, VISIBLE_POSTS);
  const rest = [...measured.slice(VISIBLE_POSTS), ...unmeasured];

  return (
    <section aria-labelledby="posts-heading">
      <h2 id="posts-heading" className="text-base font-black text-[#1d2940]">
        אילו פוסטים הצליחו
      </h2>
      {visible.length ? (
        <ul className="mt-3 divide-y divide-[#e1e7f2] overflow-hidden rounded-lg border border-[#e1e7f2] bg-white">
          {visible.map((result, index) => (
            <ResultRow key={result.key} result={result} best={index === 0 && visible.length > 1} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[#535f75]">עוד לא מדדנו תוצאות לאף פוסט.</p>
      )}
      {unmeasured.length ? (
        <p className="mt-2 text-xs leading-5 text-[#535f75]">
          {unmeasured.length === 1
            ? "פוסט אחד עוד לא נמדד. זה לא אומר שהוא הביא אפס."
            : `${unmeasured.length} פוסטים עוד לא נמדדו. זה לא אומר שהם הביאו אפס.`}
        </p>
      ) : null}
      {rest.length ? (
        <details className="group mt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-bold text-[#535f75] hover:text-[#1d2940]">
            {rest.length === 1 ? "עוד פוסט אחד" : `עוד ${rest.length} פוסטים`}
            <span aria-hidden className="transition-transform group-open:-rotate-90">‹</span>
          </summary>
          <ul className="divide-y divide-[#e1e7f2] overflow-hidden rounded-lg border border-[#e1e7f2] bg-white">
            {rest.map((result) => (
              <ResultRow key={result.key} result={result} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------------------------ */
/* The answer                                                                            */
/* ------------------------------------------------------------------------------------ */

/**
 * One sentence and two numbers: how many people asked to buy, and how many came at all.
 * A number that was not measured says so instead of showing a zero.
 */
function Answer({ payload }: { payload: PerformancePayload }) {
  const overview = payload.ga4?.overview ?? {};
  const period = formatPeriod(payload.period_start, payload.period_end);
  const conversions = overview.conversions;
  const sessions = overview.sessions;
  const sentence =
    payload.diagnostic?.headline ||
    (conversions !== undefined && sessions !== undefined
      ? `היו ${formatMetricValue("sessions", sessions)} כניסות לאתר, ומתוכן ${formatMetricValue("conversions", conversions)} פניות.`
      : "עוד אין מספיק נתונים כדי לדעת אם השיווק מביא פניות.");

  return (
    <section>
      {period ? <p className="text-xs font-bold text-[#535f75]">{period}</p> : null}
      <h2 className="mt-1 max-w-3xl text-xl font-black leading-8 text-[#1d2940] sm:text-2xl sm:leading-9">
        {sentence}
      </h2>
      <dl className="mt-5 grid grid-cols-2 gap-4 sm:max-w-md">
        <BigNumber label="פניות והזמנות" value={conversions !== undefined ? formatMetricValue("conversions", conversions) : undefined} />
        <BigNumber label="כניסות לאתר" value={sessions !== undefined ? formatMetricValue("sessions", sessions) : undefined} />
      </dl>
      {conversions !== undefined ? (
        <p className="mt-2 text-xs text-[#535f75]">פנייה: רכישה באתר או לחיצה על וואטסאפ.</p>
      ) : null}
    </section>
  );
}

function BigNumber({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs font-bold text-[#535f75]">{label}</dt>
      {value !== undefined ? (
        <dd className="metric-number mt-1 text-4xl font-black text-[#1d2940]">{value}</dd>
      ) : (
        <dd className="mt-2 text-sm font-bold text-[#647087]">לא נמדד</dd>
      )}
    </div>
  );
}

/**
 * What we cannot measure right now — on the face of the page, never inside a fold. A
 * missing source is the reason a number is absent, and the owner should not have to open
 * anything to learn that.
 */
function MeasurementGaps({ payload }: { payload: PerformancePayload }) {
  const data = payload.audiences as AudiencePerformance | null | undefined;
  const connected = data?.connected;
  if (!connected) return null;
  const anyConnected = Boolean(connected.ga4 || connected.meta);
  const offline = [!connected.ga4 ? "נתוני האתר" : "", !connected.meta ? "אינסטגרם" : ""].filter(Boolean);
  if (!offline.length) return null;

  return (
    <div className="rounded-lg bg-[#fff5d9] px-4 py-3 text-xs leading-6 text-[#5e5340]">
      <p>
        {anyConnected
          ? `אין כרגע חיבור ל${offline.join(" ול")}, ולכן חלק מהמספרים חסרים.${
              data?.synced_at ? " מה שמופיע כאן הוא מהרענון האחרון." : ""
            }`
          : data?.explanation || "נתוני האתר והאינסטגרם לא מחוברים, ולכן אין לנו מה למדוד."}{" "}
        <Link href="/integrations" className="font-bold text-[#1d2940] underline underline-offset-4">
          לחבר
        </Link>
      </p>
      {/* The site's numbers are the ones owners most often cannot find: whether there is a
          Google Analytics at all, and which Google account can see it. */}
      {!connected.ga4 ? (
        <HowToFind topic="google_analytics" label="איך מוצאים את נתוני האתר?" className="-mb-2" />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------------------ */
/* One level down                                                                        */
/* ------------------------------------------------------------------------------------ */

/** Every traffic number, with the plain-Hebrew meaning of each. */
function TrafficMetrics({ payload }: { payload: PerformancePayload }) {
  const entries = Object.entries(payload.ga4?.overview ?? {});
  if (!entries.length) return null;
  return (
    <Expand title="כל המספרים מהאתר">
      <p className="text-xs leading-5 text-[#535f75]">
        המספרים מגוגל אנליטיקס, הכלי שסופר מה קורה באתר.
      </p>
      <dl className="mt-2 divide-y divide-[#e1e7f2]">
        {entries.map(([key, value]) => {
          const meta = METRIC_LABELS[key];
          return (
            <div key={key} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
              <dt className="text-sm font-bold text-[#1d2940]">
                {meta?.label ?? key}
                {meta?.note ? <span className="mt-0.5 block text-xs font-normal text-[#535f75]">{meta.note}</span> : null}
              </dt>
              <dd className="metric-number text-lg font-black text-[#1d2940]">{formatMetricValue(key, value)}</dd>
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
    { id: "worked", title: "מה הצליח", items: payload.diagnostic?.top_content ?? [], mark: "bg-[#b9ccb0]" },
    { id: "improve", title: "מה כדאי לשפר", items: payload.diagnostic?.bottom_content ?? [], mark: "bg-[#e0cfa9]" },
  ].filter((group) => group.items.length);
  if (!groups.length) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2 md:gap-10">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`${group.id}-heading`}>
          <h3 id={`${group.id}-heading`} className="text-sm font-black text-[#1d2940]">
            {group.title}
          </h3>
          <ul className="mt-1 divide-y divide-[#e1e7f2]">
            {group.items.map((item) => (
              <li key={item.label} className="flex gap-3 py-3">
                <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${group.mark}`} />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#1d2940]">{item.label}</p>
                  <p className="mt-1 text-sm leading-6 text-[#535f75]">{item.why}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Where people drop off on the way to buying. */
function Friction({ payload }: { payload: PerformancePayload }) {
  const issues = payload.diagnostic?.funnel_issues ?? [];
  if (!issues.length) return null;
  return (
    <section aria-labelledby="friction-heading">
      <h3 id="friction-heading" className="text-sm font-black text-[#1d2940]">
        מה עוצר אנשים בדרך לקנייה
      </h3>
      <ul className="mt-1 divide-y divide-[#e1e7f2]">
        {issues.map((issue) => (
          <li key={issue} className="flex items-start gap-2.5 py-3 text-sm leading-6 text-[#3c3e3a]">
            <span aria-hidden className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-[#b3b0a5]" />
            <span>{issue}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The metric columns, derived from what the rows actually carry: a bucket nobody carries
 * never becomes an empty column.
 */
const METRIC_COLUMNS: { key: string; label: string; source: "ga4" | "meta" }[] = [
  { key: "sessions", label: "כניסות לאתר", source: "ga4" },
  { key: "conversions", label: "פניות והזמנות", source: "ga4" },
  { key: "engaged_sessions", label: "נשארו באתר", source: "ga4" },
  { key: "likes", label: "לייקים", source: "meta" },
  { key: "comments", label: "תגובות", source: "meta" },
  { key: "views", label: "צפיות", source: "meta" },
  // Older snapshots only — Meta retired this metric in favour of `views`.
  { key: "impressions", label: "חשיפות", source: "meta" },
  { key: "reach", label: "אנשים שראו", source: "meta" },
  { key: "saves", label: "שמירות", source: "meta" },
  { key: "shares", label: "שיתופים", source: "meta" },
];

/** What each column means, in the owner's words. No acronym has to be looked up. */
const METRIC_NOTES: Record<string, string> = {
  sessions: "כמה פעמים נכנסו לאתר מהפוסטים של כל קהל.",
  conversions: "כמה קנו באתר או לחצו על וואטסאפ אחרי הפוסטים האלה.",
  engaged_sessions: "כניסות של יותר מ-10 שניות. כלומר, מישהו באמת הסתכל.",
  likes: "כמה לייקים קיבלו הפוסטים.",
  comments: "כמה תגובות קיבלו הפוסטים.",
  views: "כמה פעמים צפו בפוסטים. אותו אדם יכול להיספר יותר מפעם אחת.",
  impressions: "כמה פעמים הפוסטים הופיעו למישהו. אותו אדם יכול להיספר יותר מפעם אחת.",
  reach: "כמה אנשים שונים ראו את הפוסטים. כל אדם נספר פעם אחת.",
  saves: "כמה שמרו את הפוסט כדי לחזור אליו.",
  shares: "כמה שלחו את הפוסט הלאה.",
};

/** The label the backend gives the untagged bucket. A row with a null id is the same thing. */
const UNASSIGNED_NAME = "לא משויך";

function columnsFor(data: AudiencePerformance) {
  const rows = data.rows ?? [];
  return METRIC_COLUMNS.filter((column) =>
    rows.some((row) => {
      const bucket = column.source === "ga4" ? row.ga4 : row.meta;
      return bucket != null && bucket[column.key as keyof typeof bucket] !== undefined;
    }),
  );
}

/**
 * A metric that was not measured is `לא נמדד` — never `0`, which would claim a measured
 * result of nothing. The two are different facts and the table keeps them apart.
 */
function MetricCell({ value }: { value: number | undefined }) {
  if (value === undefined || value === null) return <span className="text-[11px] text-[#647087]">לא נמדד</span>;
  return <span className="metric-number font-bold text-[#1d2940]">{value.toLocaleString("he-IL")}</span>;
}

/**
 * Results broken down by the audience each post serves. Every honesty rule stays: an
 * unmeasured bucket is `לא נמדד`, the posts column is the sample size on every row, the
 * `לא משויך` bucket is its own row, and the backend's own explanation is printed.
 */
function AudienceBreakdown({ data }: { data: AudiencePerformance }) {
  const rows = data.rows ?? [];
  const maxPosts = rows.reduce((max, row) => Math.max(max, row.posts || 0), 0);
  const columns = columnsFor(data);

  return (
    <Expand title="לפי קהל">
      {!rows.length ? (
        <p className="text-sm text-[#535f75]">עוד אין פוסטים בתוכנית, אז אין מה להראות לפי קהל.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#e1e7f2] bg-white">
          <table className="w-full min-w-[560px] border-collapse text-right">
            <thead>
              <tr className="text-[11px] text-[#535f75]">
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
                    className={`border-t border-[#edf2ff] align-top ${
                      unassigned ? "bg-[#edf2ff]" : index % 2 ? "bg-[#f4f7ff]" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <span className={`block text-xs font-bold ${unassigned ? "text-[#535f75]" : "text-[#1d2940]"}`}>
                        {row.name || UNASSIGNED_NAME}
                        {row.is_primary ? (
                          <span className="ms-2 rounded-full bg-[#edf2ff] px-2 py-0.5 text-[10px] font-bold text-[#2853c7]">
                            הקהל העיקרי
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        {/* The sample size also draws the bar, so a one-post row cannot
                            read as a trend at a glance. */}
                        <span className="block h-1 w-16 shrink-0 overflow-hidden rounded-full bg-[#e1e7f2]">
                          <span
                            className={`block h-full rounded-full ${unassigned ? "bg-[#b3b0a5]" : "bg-[#3f4a5c]"}`}
                            style={{ width: `${maxPosts ? Math.max(8, ((row.posts || 0) / maxPosts) * 100) : 0}%` }}
                          />
                        </span>
                        <span className="text-[10px] leading-4 text-[#535f75]">
                          {!unassigned && row.posts && measured < row.posts
                            ? measured === 0
                              ? row.posts === 1
                                ? "עוד לא נמדד"
                                : "עוד לא נמדדו"
                              : `נמדדו ${measured} מתוך ${row.posts} פוסטים`
                            : ""}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="metric-number font-bold text-[#1d2940]">
                        {(row.posts || 0).toLocaleString("he-IL")}
                      </span>
                      {row.posts === 1 ? <span className="mt-0.5 block whitespace-nowrap text-[10px] text-[#9f4330]">רק פוסט אחד</span> : null}
                    </td>
                    {columns.map((column) => {
                      const bucket = column.source === "ga4" ? row.ga4 : row.meta;
                      const value =
                        bucket == null ? undefined : (bucket[column.key as keyof typeof bucket] as number | undefined);
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
      {data.explanation && (data.connected?.ga4 || data.connected?.meta) ? (
        <p className="mt-3 text-xs leading-6 text-[#535f75]">{data.explanation}</p>
      ) : null}
    </Expand>
  );
}

/** How the numbers were produced, and what every column means. */
function Method({ data }: { data?: AudiencePerformance | null }) {
  const columns = data ? columnsFor(data) : [];
  return (
    <Expand title="איך חישבנו">
      {data?.method ? <p className="text-xs leading-6 text-[#535f75]">{data.method}</p> : null}
      <p className="mt-2 text-xs leading-6 text-[#535f75]">
        לכל פוסט יש קישור מיוחד משלו, וכך אנחנו יודעים אילו כניסות ופניות הגיעו ממנו. פוסט
        שלא הצלחנו לקשר לתוצאות מסומן &quot;לא נמדד&quot;. ככל שיש לקהל יותר פוסטים, המספרים
        שלו אמינים יותר. קהל עם פוסט אחד נותן כיוון, לא מגמה.
      </p>
      {columns.length ? (
        <dl className="mt-3 divide-y divide-[#e1e7f2]">
          {columns.map((column) => (
            <div key={column.key} className="py-2.5">
              <dt className="text-xs font-bold text-[#1d2940]">{column.label}</dt>
              <dd className="mt-0.5 text-xs leading-5 text-[#535f75]">{METRIC_NOTES[column.key] ?? ""}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Expand>
  );
}

/* ------------------------------------------------------------------------------------ */
/* WhatsApp taps                                                                          */
/* ------------------------------------------------------------------------------------ */

const WA_VISIBLE = 3;

/**
 * Taps on the WhatsApp tracked links, per source (lib/whatsapp.ts). Our own count, so it
 * works with nothing connected. The label says taps, never messages or sales: a redirect
 * cannot see whether the customer pressed send, and the caveat stays on the face.
 */
function WhatsappClicks({ data }: { data: WhatsappPayload | null }) {
  if (!data) return null;
  const heading = (
    <h2 id="wa-heading" className="text-base font-black text-[#1d2940]">
      לחיצות על וואטסאפ
    </h2>
  );
  if (!data.number_e164) {
    return (
      <section aria-labelledby="wa-heading">
        {heading}
        <p className="mt-2 text-sm leading-6 text-[#535f75]">
          לא נמדד, כי עוד אין קישור וואטסאפ.{" "}
          <Link href="/integrations" className="font-bold text-[#1d2940] underline underline-offset-4">
            להכין את הקישור
          </Link>
        </p>
      </section>
    );
  }
  const rows = data.links
    .filter((link) => (link.clicks_total || 0) > 0)
    .sort((a, b) => (b.clicks_7d || 0) - (a.clicks_7d || 0) || (b.clicks_total || 0) - (a.clicks_total || 0));
  const visible = rows.slice(0, WA_VISIBLE);
  const rest = rows.slice(WA_VISIBLE);
  const families = Object.entries(data.clicks_by_family || {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  // A post's label carries its title ("פוסט 2 באינסטגרם: חלות לשבת…"); the face shows the
  // place and the number, and the title is in the tooltip (UI-RULES rule 7).
  const shortLabel = (label: string) => label.split(":")[0];
  const table = (items: typeof rows) => (
    <ul className="divide-y divide-[#e1e7f2]">
      {items.map((link) => (
        <li key={link.code} className="grid grid-cols-[1fr_4rem_4rem] items-center gap-2 px-4 py-2.5 text-sm">
          <span className="min-w-0 truncate font-bold text-[#1d2940]" title={link.label_he}>
            {shortLabel(link.label_he)}
          </span>
          <span className="text-center tabular-nums text-[#1d2940]">{(link.clicks_7d || 0).toLocaleString("he-IL")}</span>
          <span className="text-center tabular-nums text-[#535f75]">{(link.clicks_total || 0).toLocaleString("he-IL")}</span>
        </li>
      ))}
    </ul>
  );
  const devices = families.length ? (
    <div className="px-4 pb-3 pt-1">
      <p className="text-xs leading-5 text-[#535f75]">
        {families.map(([family, count]) => `${FAMILY_HE[family] || family}: ${count.toLocaleString("he-IL")}`).join(" · ")}
      </p>
      <p className="mt-1 text-xs leading-5 text-[#647087]">
        אותו אדם שלחץ פעמיים נספר פעמיים. תצוגות מקדימות של הקישור ורובוטים לא נספרים.
      </p>
    </div>
  ) : null;

  return (
    <section aria-labelledby="wa-heading">
      {heading}
      {rows.length ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-[#e1e7f2] bg-white">
          <div className="grid grid-cols-[1fr_4rem_4rem] gap-2 border-b border-[#e1e7f2] px-4 py-2 text-xs font-bold text-[#535f75]">
            <span aria-hidden />
            <span className="text-center">7 ימים</span>
            <span className="text-center">מההתחלה</span>
          </div>
          {table(visible)}
          {rest.length || devices ? (
            <details className="group border-t border-[#e1e7f2]">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-xs font-bold text-[#535f75] hover:text-[#1d2940]">
                {rest.length ? "עוד מקורות ומכשירים" : "מאיזה מכשיר לחצו"}
                <span aria-hidden className="transition-transform group-open:-rotate-90">‹</span>
              </summary>
              {rest.length ? table(rest) : null}
              {devices}
            </details>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-[#535f75]">עוד אין לחיצות. שימו את הקישור בביו ובפוסטים.</p>
      )}
      <p className="mt-2 text-xs leading-5 text-[#535f75]">
        לחיצות על הקישור, לא הודעות שנשלחו ולא מכירות.
      </p>
    </section>
  );
}

/** Nothing has been synced yet. A normal state on this screen, and not an error. */
function NoSnapshotYet() {
  return (
    <section className="rounded-lg border border-[#e1e7f2] bg-white px-6 py-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#fff5d9] text-[#1d2940]">
        <IconChart className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-lg font-black text-[#1d2940]">עוד אין תוצאות</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#535f75]">
        כדי לראות כמה נכנסו לאתר, כמה פנו ומה קרה באינסטגרם, חברו את נתוני האתר ואת
        האינסטגרם.
      </p>
      <Link
        href="/integrations"
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md border border-[#c3cee5] bg-white px-4 text-sm font-bold text-[#1d2940] hover:bg-[#edf2ff]"
      >
        לחבר את גוגל ואינסטגרם
        <span aria-hidden>←</span>
      </Link>
      <div className="mt-2">
        <HowToFind topic="google_analytics" label="איך מוצאים את נתוני האתר?" />
      </div>
    </section>
  );
}

/**
 * Results.
 *
 * The owner opens this to learn one thing — is the marketing working? — so the page leads
 * with one sentence and the two numbers behind it (inquiries, then visits), then which
 * posts worked. The diagnosis, every other traffic number, the per-audience table and the
 * method are one tap down. What is *not* measured stays on the face: a missing connection,
 * and the count of posts with no result yet.
 */
export default function PerformancePage() {
  const [data, setData] = useState<PerformancePayload | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [planMeasure, setPlanMeasure] = useState("");
  // Our own count of WhatsApp taps. Loaded apart from the synced results: it needs no
  // connection, and a failure here must not hide them.
  const [whatsapp, setWhatsapp] = useState<WhatsappPayload | null>(null);

  useEffect(() => {
    whatsappEndpoints
      .get()
      .then(setWhatsapp)
      .catch(() => setWhatsapp(null));
  }, []);

  useEffect(() => {
    endpoints.business().then(({ business }) => setPlanMeasure(business?.quarter_plan?.kpi.name_he || "")).catch(() => {});
  }, []);

  useEffect(() => {
    endpoints
      .performance()
      // "No sync yet" is not an error: the endpoint still answers with the per-audience
      // sample (how many posts each segment has). Only a real failure sets the error.
      .then((payload) => setData(payload))
      .catch((err) => setError(err instanceof Error ? err.message : "לא הצלחנו לטעון את התוצאות"));
  }, []);

  async function sync() {
    setPending(true);
    setError("");
    try {
      const weekly = await endpoints.weeklyLoop();
      setData(weekly.performance);
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לרענן את הנתונים מגוגל ומאינסטגרם. נסו שוב בעוד כמה דקות.");
    } finally {
      setPending(false);
    }
  }

  const available = Boolean(data && data.available !== false);
  const results = data && available ? postResults(data) : null;
  const hasVerdict = Boolean(data?.diagnostic?.top_content?.length || data?.diagnostic?.bottom_content?.length);
  const hasFriction = Boolean(data?.diagnostic?.funnel_issues?.length);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="תוצאות"
          action={
            <Button onClick={sync} disabled={pending} tone="primary" size="md">
              <IconChart className="h-4 w-4" />
              <span>{pending ? "מרעננים…" : "לרענן את הנתונים"}</span>
            </Button>
          }
        />

        <ErrorNote message={error} />

        {data ? (
          <div className="space-y-8">
            {available ? <Answer payload={data} /> : <NoSnapshotYet />}
            {planMeasure ? <p className="text-sm leading-6 text-[#535f75]">המדד בתוכנית: {planMeasure}. <Link href="/strategy" className="text-[#2853c7] underline underline-offset-4">לתוכנית</Link></p> : null}
            <MeasurementGaps payload={data} />

            {available ? (
              results ? (
                <Expand title="התוצאות לפי פוסט"><PostResults results={results} /></Expand>
              ) : (
                // A snapshot from before per-post matching existed: the diagnosis's own
                // verdict is the best "what worked" there is, so it takes the list's place.
                <ContentVerdict payload={data} />
              )
            ) : null}

            <WhatsappClicks data={whatsapp} />

            <div className="divide-y divide-[#e1e7f2] border-y border-[#e1e7f2]">
              {available && results && (hasVerdict || hasFriction) ? (
                <Expand title="מה הצליח ומה לשפר">
                  <div className="space-y-6">
                    <ContentVerdict payload={data} />
                    <Friction payload={data} />
                  </div>
                </Expand>
              ) : available && hasFriction ? (
                <Expand title="מה עוצר אנשים">
                  <Friction payload={data} />
                </Expand>
              ) : null}
              {available ? <TrafficMetrics payload={data} /> : null}
              {data.audiences ? <AudienceBreakdown data={data.audiences} /> : null}
              <Method data={data.audiences} />
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
