"use client";

import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";

import Link from "next/link";
import { FindingCard } from "@/components/results/FindingCard";
import { PostObservationLine } from "@/components/results/PostObservationLine";
import { ServiceCheckIn } from "@/components/results/ServiceCheckIn";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell, Button, ErrorNote, PageHeader } from "@/components/AppShell";
import { HowToFind } from "@/components/help/HowToFind";
import { PerformanceHypotheses, ResearchSection } from "@/components/trial/Research";
import { StepLink } from "@/components/trial/StepLink";
import { MetaAdsSummary } from "@/components/integrations/MetaAdsSummary";
import { SourceDataNotice } from "@/components/integrations/SourceDataNotice";
import { MetricComparison } from "@/components/design/MetricComparison";
import { SegmentedControl } from "@/components/design/Controls";
import {
  endpoints,
  type AudiencePerformance,
  type InstagramAccount,
  type InstagramAccountWindow,
  type MeasuredPost,
  type PostMetric,
  type PerformancePayload,
  type RecommendationPayload,
  type ServiceResultsPayload,
} from "@/lib/api";
import { LOCALE_META } from "@/lib/i18n/locales";
import { dateRange } from "@/lib/dates";
import { markSeen } from "@/lib/trial";
import { IconArrowLeft, IconChart, IconChevron } from "@/lib/icons";
import { FAMILY_HE, whatsappEndpoints, type WhatsappPayload } from "@/lib/whatsapp";
import styles from "./performance.module.css";

const METRIC_LABELS: Record<string, { label: string; note: string }> = {
  sessions: { label: "כניסות לאתר", note: "כמה פעמים נכנסו לאתר" },
  engagedSessions: { label: "כניסות שנשארו באתר", note: "לפי גוגל: יותר מ־10 שניות, פעולה חשובה או לפחות 2 עמודים" },
  conversions: { label: "פעולות חשובות באתר", note: "פעולות שסומנו כחשובות במדידה של האתר. לא בהכרח פניות או הזמנות" },
  bounceRate: { label: "יצאו מיד", note: "אחוז הכניסות שלא נשארו באתר לפי ההגדרה של גוגל" },
  screenPageViews: { label: "צפיות בעמודים", note: "כמה עמודים נפתחו בסך הכול" },
  averageSessionDuration: { label: "זמן ממוצע באתר", note: "כמה זמן נשארים באתר, בממוצע" },
};

function formatMetric(key: string, val: string, t: ReturnType<typeof useCopy>, formatLocale: string) {
  const num = Number(val);
  if (key === "bounceRate" && !Number.isNaN(num)) return `${Math.round(num * 100)}%`;
  if (key === "averageSessionDuration" && !Number.isNaN(num)) return t("{arg_0} שניות", { arg_0: Math.round(num) });
  if (!Number.isNaN(num)) return num.toLocaleString(formatLocale);
  return val;
}

/** `2026-08-08` reads as a machine string; the owner reads `8.8 עד 4.9.2026` (lib/dates.ts). */


/**
 * Detail on demand. A native `<details>`, so closed content is out of the reading order —
 * and out of the measured page height and word count — while staying one click away.
 */
function Expand({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group/expand">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[15px] font-semibold text-[color:var(--ink)] transition-colors hover:text-[color:var(--primary)] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">{title}</span>
        <Chevron />
      </summary>
      <div className="pb-6 pt-1">{children}</div>
    </details>
  );
}

/**
 * The disclosure mark (DESIGN-STANDARD §4): a real chevron, down when closed and up when
 * open. An icon, not a typed glyph, so a closed row does not add a word to `main.innerText`.
 * Named groups, so a fold inside an open section keeps its own direction.
 */
const CHEVRON_OPEN = { expand: "group-open/expand:rotate-90", more: "group-open/more:rotate-90" } as const;

function Chevron({ group = "expand", size = "h-[18px] w-[18px]" }: { group?: keyof typeof CHEVRON_OPEN; size?: string }) {
  return (
    <IconChevron
      className={`${size} shrink-0 -rotate-90 text-[color:var(--ink-muted)] transition-transform duration-200 ease-[cubic-bezier(.2,.7,.2,1)] ${CHEVRON_OPEN[group]}`}
    />
  );
}

/** A secondary disclosure inside a block ("עוד 3 פוסטים"): quieter than a section row. */
function MoreSummary({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <summary
      className={`flex min-h-12 cursor-pointer list-none items-center gap-2 text-[13px] font-semibold text-[color:var(--ink-soft)] transition-colors hover:text-[color:var(--ink)] [&::-webkit-details-marker]:hidden ${className}`}
    >
      {children}
      <Chevron group="more" size="h-4 w-4" />
    </summary>
  );
}

/** Up or down, beside a change figure: green when it rose, the danger tone when it fell. */
type Trend = "up" | "down" | "flat";

function trendOf(value: number | undefined): Trend | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return value > 0 ? "up" : value < 0 ? "down" : "flat";
}

function Change({ trend, children }: { trend?: Trend; children: ReactNode }) {
  const tone =
    trend === "up" ? "text-[color:var(--good)]" : trend === "down" ? "text-[color:var(--danger)]" : "text-[color:var(--ink-muted)]";
  return (
    <span className={`inline-flex items-center gap-1 text-[13px] font-semibold ${tone}`}>
      {trend === "up" || trend === "down" ? (
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className={`h-3 w-3 shrink-0 ${trend === "down" ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 10V2M2.5 5.5L6 2l3.5 3.5" />
        </svg>
      ) : null}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------------------------ */
/* Per-post results                                                                      */
/* ------------------------------------------------------------------------------------ */

/**
 * The month's measured posts, each with the one number its card shows: the post's own
 * `results` (WhatsApp taps by the post's code, site visits by its link with tracking,
 * Instagram reach or saves by its link), which the refresh and the weekly job write back
 * (`measured_posts` from `/performance/latest`). One source for the card and this list, so
 * the two never disagree. A post that is out and was not counted is a count, never a 0.
 */
type PostResultsView = { items: MeasuredPost[]; waiting: number };

function postResults(payload: PerformancePayload): PostResultsView | null {
  const data = payload.measured_posts;
  if (!data || (!data.items?.length && !data.waiting)) return null;
  return { items: data.items || [], waiting: data.waiting || 0 };
}

/** Where each per-post number comes from, in the owner's words. */
const POST_SOURCE: Record<PostMetric, string> = {
  whatsapp_clicks: "לחיצות על הקישור לוואטסאפ של כל פוסט, מאז שנוצר. ספירה שלנו",
  site_visits: "נתוני האתר · לפי הקישור עם המעקב של כל פוסט",
  reach: "אינסטגרם · לפי הקישור לכל פוסט",
  saves: "אינסטגרם · לפי הקישור לכל פוסט",
};

/** The measure most posts share; numbers of different measures are never ranked together. */
function leadingMetric(items: MeasuredPost[]): PostMetric | null {
  const counts = new Map<PostMetric, number>();
  for (const item of items) counts.set(item.metric, (counts.get(item.metric) || 0) + 1);
  let best: PostMetric | null = null;
  for (const [metric, count] of counts) if (!best || count > (counts.get(best) || 0)) best = metric;
  return best;
}

/** The leading measure's posts first, highest first; then the others by measure. */
function ordered(items: MeasuredPost[]): MeasuredPost[] {
  const lead = leadingMetric(items);
  return [...items].sort(
    (a, b) => Number(b.metric === lead) - Number(a.metric === lead) || a.metric.localeCompare(b.metric) || b.value - a.value
  );
}

function comparablePosts(items: MeasuredPost[]): boolean {
  if (items.length < 2 || items.some(item => item.format === "story" || item.observation?.product_type === "STORY" || (item.metric === "reach" && item.channel === "facebook"))) return false;
  if (items[0].metric !== "site_visits") return true;
  const a = items[0].observation;
  return Boolean(a && !a.limited && a.start && a.end && a.property_id && a.exposure_start && items.every(item => {
    const b = item.observation;
    return b && !b.limited && b.source === a.source && b.scope === a.scope && b.property_id === a.property_id && b.start === a.start && b.end === a.end && b.exposure_start === a.exposure_start;
  }));
}

/** "יותר מאשר בפוסט דומה (14)": the card's comparison line, from the server's direction. */
function comparisonText(item: MeasuredPost, t: ReturnType<typeof useCopy>, formatLocale: string): string {
  if (item.metric === "site_visits" && (!item.observation?.start || !item.observation?.end || item.observation.limited)) return "";
  const compare = item.compare;
  if (!compare || !Number.isFinite(compare.value)) return "";
  const label = (compare.label || "").trim() || t("בפוסט דומה");
  const count = compare.value.toLocaleString(formatLocale);
  if (compare.direction === "similar") return t("בערך כמו {arg_0} ({arg_1})", { arg_0: t(label), arg_1: count });
  if (compare.direction === "above") return t("יותר מאשר {arg_0} ({arg_1})", { arg_0: t(label), arg_1: count });
  if (compare.direction === "below") return t("פחות מאשר {arg_0} ({arg_1})", { arg_0: t(label), arg_1: count });
  return "";
}

function ResultRow({ item, best }: { item: MeasuredPost; best?: boolean }) {
  const { locale } = useLanguage();
  const formatLocale = LOCALE_META[locale].formatLocale;
  const t = useCopy();
  const compare = comparisonText(item, t, formatLocale);
  return (
    <li className="py-3">
      <span className="flex min-w-0 items-center gap-2">
        <Link
          href={`/posts?post=${item.index}`}
          className="truncate text-[15px] font-medium text-[color:var(--ink)] hover:underline hover:underline-offset-4"
        >
          {item.title || t("פוסט בלי שם")}
        </Link>
        {best ? (
          <span className="shrink-0 rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 text-xs font-semibold text-[color:var(--primary)]">
            <Copy text="הכי טוב" /></span>
        ) : null}
      </span>
      <span className="mt-0.5 block text-[13px] tabular-nums text-[color:var(--ink-soft)]">
        {`${item.value.toLocaleString(formatLocale)} ${t(item.label_he)}`}
        {compare ? <span className="text-[color:var(--ink-muted)]">{` · ${compare}`}</span> : null}
      </span>
      <PostObservationLine observation={item.observation} google={item.metric === "site_visits"} />
    </li>
  );
}

/** How many posts show before the rest fold away. Enough to see what worked. */
const VISIBLE_POSTS = 3;

/**
 * Which posts worked — the second thing the owner wants after "is it working at all".
 *
 * The count of posts that are out and not measured is stated in the open, outside the
 * fold: it is the reason the list is shorter than the month, and it is not a zero.
 */
function PostResults({ results }: { results: PostResultsView }) {
  const t = useCopy();
  const measured = ordered(results.items);
  const visible = measured.slice(0, VISIBLE_POSTS);
  const rest = measured.slice(VISIBLE_POSTS);
  const lead = leadingMetric(measured);
  // "Best" only among posts counted the same way, and only when there is more than one.
  const comparable = comparablePosts(measured.filter((item) => item.metric === lead));

  return (
    <section aria-labelledby="posts-heading">
      <h2 id="posts-heading" className="text-[13px] font-semibold text-[color:var(--ink-muted)]">
        <Copy text="אילו פוסטים הצליחו" /></h2>
      {visible.length ? (
        <ul className="mt-2 divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
          {visible.map((item, index) => (
            <ResultRow key={item.uid || item.index} item={item} best={index === 0 && comparable} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[15px] text-[color:var(--ink-soft)]"><Copy text="עוד לא מדדנו תוצאות לאף פוסט." /></p>
      )}
      {results.waiting ? (
        <p className="mt-3 text-[13px] leading-6 text-[color:var(--ink-muted)]">
          {results.waiting === 1
            ? t("פוסט אחד שפורסם עוד לא נמדד. זה לא אומר שהוא הביא אפס.")
            : t("{arg_0} פוסטים שפורסמו עוד לא נמדדו. זה לא אומר שהם הביאו אפס.", { arg_0: results.waiting })}
        </p>
      ) : null}
      {rest.length ? (
        <details className="group/more mt-1">
          <MoreSummary>{rest.length === 1 ? t("עוד פוסט אחד") : t("עוד {arg_0} פוסטים", { arg_0: rest.length })}</MoreSummary>
          <ul className="divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
            {rest.map((item) => (
              <ResultRow key={item.uid || item.index} item={item} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

/** The posts counted the same way, side by side: only when there are two or more. */
function PostComparison({ results }: { results: PostResultsView }) {
  const t = useCopy();
  const metric = leadingMetric(results.items);
  const same = results.items.filter((item) => item.metric === metric);
  if (!metric || !comparablePosts(same)) return null;
  return <MetricComparison title={t("התוצאות לפי פוסט")} unit={t(same[0].label_he)}
    source={t(POST_SOURCE[metric])}
    points={ordered(same).slice(0, 5).map(item => ({ key: item.uid || String(item.index), label: item.title, value: item.value }))} />;
}

/* ------------------------------------------------------------------------------------ */
/* The answer                                                                            */
/* ------------------------------------------------------------------------------------ */

/**
 * Measured totals first; the interpretation waits in the proposed next step.
 * A number that was not measured says so instead of showing a zero.
 */
function Answer({ payload }: { payload: PerformancePayload }) {
  const { locale } = useLanguage();
  const formatLocale = LOCALE_META[locale].formatLocale;
  const formatPeriod = (start?: string, end?: string) => dateRange(start, end, locale);
  const formatMetricValue = (key: string, value: string) => formatMetric(key, value, t, formatLocale);
  const t = useCopy();
  const overview = payload.ga4?.overview ?? {};
  const period = formatPeriod(payload.ga4?.period?.start || payload.period_start, payload.ga4?.period?.end || payload.period_end);
  const conversions = overview.conversions;
  const sessions = overview.sessions;
  const sentence =
    (conversions !== undefined && sessions !== undefined
      ? t("היו {arg_0} כניסות לאתר ו־{arg_1} פעולות שהוגדרו כחשובות.", { arg_0: formatMetricValue("sessions", sessions), arg_1: formatMetricValue("conversions", conversions) })
      : sessions !== undefined ? t("היו {arg_0} כניסות לאתר.", { arg_0: formatMetricValue("sessions", sessions) })
      : t("עוד אין מספיק נתונים כדי לדעת אם השיווק מביא פניות."));

  return (
    <section>
      {period ? <p className="text-[13px] font-medium tabular-nums text-[color:var(--ink-muted)]"><bdi>{period}</bdi></p> : null}
      <h2 className="mt-2 max-w-[30em] text-[21px] font-bold leading-[1.4] tracking-tight text-balance text-[color:var(--ink)] sm:text-[24px]">
        {sentence}
      </h2>
      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[16px] bg-[var(--rule)] shadow-[var(--shadow-card)]">
        <BigNumber label={t("פעולות חשובות באתר")} value={conversions !== undefined ? formatMetricValue("conversions", conversions) : undefined} />
        <BigNumber label={t("כניסות לאתר")} value={sessions !== undefined ? formatMetricValue("sessions", sessions) : undefined} />
      </dl>
      {conversions !== undefined ? (
        <p className="mt-3 max-w-[46em] text-[13px] leading-6 text-[color:var(--ink-muted)]"><Copy text="אלה הפעולות שסומנו כחשובות במדידה של האתר. כדי לדעת אם הן פניות או הזמנות, צריך לבדוק מה בדיוק נספר." /></p>
      ) : null}
    </section>
  );
}

/** One cell of a stat strip: the label, then the number, big and tabular (the landing's KPI row). */
function BigNumber({ label, value }: { label: string; value?: string }) {
  return (
    <div className="bg-[var(--paper)] px-5 py-5 sm:px-7 sm:py-6">
      <dt className="text-[13px] font-medium text-[color:var(--ink-muted)]">{label}</dt>
      {value !== undefined ? (
        <dd className="metric-number mt-2 text-[34px] font-bold leading-none tracking-tight text-[color:var(--ink)] sm:text-[44px]">{value}</dd>
      ) : (
        <dd className="mt-3 text-[15px] font-semibold text-[color:var(--ink-muted)]"><Copy text="לא נמדד" /></dd>
      )}
    </div>
  );
}

/**
 * What we cannot measure right now — on the face of the page, never inside a fold. A
 * missing source is the reason a number is absent, and the owner should not have to open
 * anything to learn that.
 */
function MeasurementGaps({ payload, ownerReport = false }: { payload: PerformancePayload; ownerReport?: boolean }) {
  const { locale } = useLanguage();
  const t = useCopy();
  const data = payload.audiences as AudiencePerformance | null | undefined;
  const connected = data?.connected;
  if (!connected) return null;
  const anyConnected = Boolean(connected.ga4 || connected.meta);
  const required = payload.measurement_setup?.requirements;
  const offline = required
    ? required.filter(item => item.status !== "soon" && item.key !== "whatsapp" && !connected[item.key]).map(item => t(item.title))
    : [!connected.ga4 ? t("נתוני האתר") : "", !connected.meta ? t("אינסטגרם") : ""].filter(Boolean);
  const needsGoogle = !connected.ga4 && (!required || required.some(item => item.key === "ga4" && item.status !== "soon"));
  if (!offline.length) return null;
  const sourceList = new Intl.ListFormat(LOCALE_META[locale].formatLocale, { style: "long", type: "conjunction" }).format(offline);
  if (ownerReport && !anyConnected) return <p className="text-[13px] leading-6 text-[color:var(--ink-muted)]">
    {t("המקורות הבאים עוד לא מחוברים: {arg_0}. אפשר להמשיך עם הדיווח שלכם.", { arg_0: sourceList })}{" "}<Link href="/integrations" className="font-semibold text-[color:var(--primary)] hover:underline"><Copy text="לבדוק את החיבורים" /></Link>
  </p>;

  return (
    <div className="rounded-[14px] bg-[var(--sand)] px-5 py-4 text-[14px] leading-6 text-[color:var(--sand-dark)]">
      <p>
        {anyConnected
          ? t("אין כרגע חיבור ל{arg_0}, ולכן חלק מהמספרים חסרים.{arg_1}", { arg_0: sourceList, arg_1: data?.synced_at ? " מה שמופיע כאן הוא מהרענון האחרון." : "" })
          : t("המקורות שהתוכנית צריכה עדיין לא מחוברים: {arg_0}.", { arg_0: sourceList })}{" "}
        <Link href="/integrations" className="font-semibold text-[color:var(--ink)] underline decoration-[var(--sand-rule)] underline-offset-4 hover:decoration-current">
          <Copy text="לחבר" /></Link>
      </p>
      {/* The site's numbers are the ones owners most often cannot find: whether there is a
          Google Analytics at all, and which Google account can see it. */}
      {needsGoogle ? (
        <HowToFind topic="google_analytics" label={t("איך מוצאים את נתוני האתר?")} className="-mb-2" />
      ) : null}
    </div>
  );
}

/** Failed source reads remain visible even while successful reports are folded. */
function SourceReportLimits({ payload }: { payload: PerformancePayload }) {
  const t = useCopy();
  const ads = payload.meta?.ads;
  const tracking = payload.meta?.tracking;
  const notes = [
    ads && !["available", "no_activity", "not_selected"].includes(ads.status) ? ads.note_he : "",
    tracking && tracking.status !== "receiving" ? tracking.note_he : "",
    payload.meta?.account?.stopped ? t("אינסטגרם הפסיק להחזיר חלק מהנתונים. המספרים החסרים אינם אפס.") : "",
  ].filter(Boolean);
  if (!notes.length) return null;
  return <aside aria-label={t("מה עדיין חסר במדידה")} className="rounded-xl bg-[var(--soft)] p-4 text-[13px] leading-6 text-[color:var(--ink-soft)]">
    {notes.map(note => <p key={note}>{t(note || "")}</p>)}
    <Link href="/integrations" className="mt-1 inline-flex min-h-11 items-center font-semibold text-[color:var(--primary)] hover:underline"><Copy text="לבדוק את החיבורים" /></Link>
  </aside>;
}

/* ------------------------------------------------------------------------------------ */
/* The Instagram account                                                                 */
/* ------------------------------------------------------------------------------------ */

type AccountKey = keyof InstagramAccountWindow["values"];

/** The three numbers on the face, after followers. Every label is the owner's word. */
const ACCOUNT_FACE: { key: AccountKey; label: string }[] = [
  { key: "reach", label: "אנשים שראו" },
  { key: "accounts_engaged", label: "הגיבו לתוכן" },
  { key: "profile_links_taps", label: "לחיצות בפרופיל" },
];

/** One level down: every account number with what it means. */
const ACCOUNT_ROWS: { key: AccountKey; label: string; note: string }[] = [
  { key: "reach", label: "אנשים שראו", note: "כמה אנשים שונים ראו את התוכן. כל אדם נספר פעם אחת." },
  { key: "views", label: "צפיות", note: "כמה פעמים צפו בתוכן. אותו אדם יכול להיספר יותר מפעם אחת." },
  { key: "accounts_engaged", label: "הגיבו לתוכן", note: "כמה אנשים עשו לייק, תגובה, שמירה או שיתוף." },
  { key: "total_interactions", label: "לייקים, תגובות, שמירות ושיתופים", note: "כולם יחד, על כל התוכן." },
  { key: "profile_links_taps", label: "לחיצות בפרופיל", note: "על הכפתורים בפרופיל: חיוג, ניווט, מייל והודעה." },
  { key: "follows", label: "התחילו לעקוב", note: "" },
  { key: "unfollows", label: "הפסיקו לעקוב", note: "" },
];

const CONTACT_BUTTON_HE: Record<string, string> = {
  CALL: "חיוג",
  DIRECTION: "ניווט",
  EMAIL: "מייל",
  TEXT: "הודעה",
  BOOK_NOW: "הזמנת תור",
};

const ACCOUNT_WINDOWS = [
  { value: "7", label: "7 ימים" },
  { value: "28", label: "28 ימים" },
];

const NOT_RETURNED = "אינסטגרם לא החזיר את המספר הזה";

function formatCount(value: number | undefined, formatLocale: string) {
  return value === undefined ? undefined : value.toLocaleString(formatLocale);
}

/** "+17%" against the window before, only when both windows have the number. */
function changeOf(now: number | undefined, before: number | undefined) {
  if (now === undefined || before === undefined || before === 0) return "";
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

/** A signed figure keeps its sign on the left of the digits inside Hebrew text. */
function Signed({ text }: { text: string }) {
  return <bdi dir="ltr">{text}</bdi>;
}

function formatSigned(value: number, formatLocale: string) {
  return `${value > 0 ? "+" : ""}${value.toLocaleString(formatLocale)}`;
}

/**
 * The account as a whole — the business, not one post: followers and how they changed,
 * how many people saw and reacted, and taps on the profile's buttons, for the last 7 or 28
 * days against the same length of time before. Every number is Meta's; a missing one says
 * why, on the face, and a small account is told it needs 100 followers rather than shown
 * a zero.
 */
function InstagramAccountBlock({ account }: { account: InstagramAccount }) {
  const { locale } = useLanguage();
  const formatLocale = LOCALE_META[locale].formatLocale;
  const count = (value: number | undefined) => formatCount(value, formatLocale);
  const signed = (value: number) => formatSigned(value, formatLocale);
  const t = useCopy();
  const [days, setDays] = useState("28");
  const windows = account.windows || {};
  const pair = windows[days] || windows[Object.keys(windows)[0]];
  const current = pair?.current;
  const previous = pair?.previous;
  const values = current?.values || {};
  const before = previous?.values || {};
  const errors = current?.errors || {};
  const blockErrors = account.errors || {};

  const followers = account.followers_count ?? undefined;
  const net = values.net_followers;
  const newFollowers = account.new_followers?.[days];
  const followersNote: ReactNode = account.few_followers ? (
    t("צריך לפחות 100 עוקבים כדי לראות כמה הצטרפו.")
  ) : net !== undefined ? (
    <Change trend={trendOf(net)}>
      <Signed text={signed(net)} /> <Copy text="בתקופה" /></Change>
  ) : newFollowers !== undefined ? (
    t("{arg_0} חדשים", { arg_0: newFollowers.toLocaleString(formatLocale) })
  ) : null;
  // Nothing at all came back: the one reason is the whole message (a dead connection,
  // Meta asking us to slow down), stated instead of a grid of "not measured".
  const nothing = followers === undefined && !Object.keys(values).length;
  const reason =
    blockErrors.account || blockErrors.followers_count || Object.values(errors)[0] || NOT_RETURNED;

  return (
    <section aria-labelledby="account-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="account-heading" className="text-lg font-bold tracking-tight text-[color:var(--ink)]">
          <Copy text="החשבון באינסטגרם" /></h2>
        {!nothing && Object.keys(windows).length > 1 ? (
          <SegmentedControl label={t("תקופה")} value={days} options={ACCOUNT_WINDOWS.map(item => ({ ...item, label: t(item.label) }))} onChange={setDays} />
        ) : null}
      </div>
      {nothing ? (
        <p className="mt-2 text-[15px] leading-7 text-[color:var(--ink-soft)]">{t(reason)}</p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[16px] bg-[var(--rule)] shadow-[var(--shadow-card)] sm:grid-cols-4">
            <AccountFigure
              label={t("עוקבים")}
              value={count(followers)}
              sub={followersNote}
              missing={blockErrors.followers_count}
            />
            {ACCOUNT_FACE.map((item) => {
              const change = changeOf(values[item.key], before[item.key]);
              const now = values[item.key];
              const prior = before[item.key];
              return (
                <AccountFigure
                  key={item.key}
                  label={t(item.label)}
                  value={count(now)}
                  sub={
                    change ? (
                      <Change trend={now !== undefined && prior !== undefined ? trendOf(now - prior) : undefined}>
                        <Signed text={change} />
                      </Change>
                    ) : null
                  }
                  missing={errors[item.key]}
                />
              );
            })}
          </dl>
          {previous ? (
            <p className="mt-3 text-[13px] text-[color:var(--ink-muted)]"><Copy text="האחוז: לעומת" />{current?.days ?? days} <Copy text="הימים שלפני." /></p>
          ) : null}
        </>
      )}
    </section>
  );
}

/** A number, or "לא נמדד" with Meta's reason under it — on the face, not in a tooltip. */
function AccountFigure({ label, value, sub, missing }: { label: string; value?: string; sub?: ReactNode; missing?: string }) {
  const note = value !== undefined ? sub : missing || NOT_RETURNED;
  return (
    <div className="bg-[var(--paper)] px-5 py-4 sm:px-6 sm:py-5">
      <dt className="text-[13px] font-medium text-[color:var(--ink-muted)]">{label}</dt>
      {value !== undefined ? (
        <dd className="metric-number mt-2 text-[26px] font-bold leading-none tracking-tight text-[color:var(--ink)] sm:text-[28px]">{value}</dd>
      ) : (
        <dd className="mt-2.5 text-[15px] font-semibold text-[color:var(--ink-muted)]"><Copy text="לא נמדד" /></dd>
      )}
      {note ? <dd className="mt-2 text-[13px] leading-5 text-[color:var(--ink-muted)]">{note}</dd> : null}
    </div>
  );
}

/**
 * The full list under a row's summary: one fold inside the row it belongs to, so the site
 * and the account each have one row on the page, not a summary row and a numbers row.
 * Unfolded when there is no summary above it in that row.
 */
function MoreFold({ title, folded = true, children }: { title: string; folded?: boolean; children: ReactNode }) {
  if (!folded) return <div>{children}</div>;
  return (
    <details className="group/more mt-6 border-t border-[var(--rule)]">
      <MoreSummary>{title}</MoreSummary>
      <div className="pt-1">{children}</div>
    </details>
  );
}

/** Every account number, both windows, what each means, and what Meta no longer reports. */
function AccountMetrics({ account }: { account: InstagramAccount }) {
  const { locale } = useLanguage();
  const formatLocale = LOCALE_META[locale].formatLocale;
  const formatPeriod = (start?: string, end?: string) => dateRange(start, end, locale);
  const t = useCopy();
  const windows = Object.entries(account.windows || {});
  if (!windows.length) return null;
  return (
    <MoreFold title={t("כל המספרים מאינסטגרם")}>
      {windows.map(([days, pair]) => {
        const values = pair.current?.values || {};
        const before = pair.previous?.values || {};
        const errors = pair.current?.errors || {};
        const taps = pair.current?.breakdowns?.profile_links_taps || {};
        const tapsLine = Object.entries(taps)
          .filter(([, value]) => value > 0)
          .map(([button, value]) => t("{arg_0}: {arg_1}", { arg_0: CONTACT_BUTTON_HE[button] || "אחר", arg_1: value.toLocaleString(formatLocale) }))
          .join(" · ");
        return (
          <div key={days} className="pb-6">
            <p className="text-[13px] font-semibold tabular-nums text-[color:var(--ink-muted)]">
              {days} <Copy text="ימים ·" /><bdi>{formatPeriod(pair.current?.start, pair.current?.end)}</bdi>
            </p>
            <dl className="mt-2 divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
              {ACCOUNT_ROWS.map((row) => {
                const value = values[row.key];
                const prior = before[row.key];
                const why = errors[row.key] || (row.key === "follows" || row.key === "unfollows" ? errors.follows_and_unfollows : "");
                return (
                  <div key={row.key} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
                    <dt className="text-[15px] font-medium text-[color:var(--ink)]">
                      {t(row.label)}
                      {row.note ? <span className="mt-0.5 block text-[13px] font-normal leading-5 text-[color:var(--ink-muted)]">{t(row.note)}</span> : null}
                      {row.key === "profile_links_taps" && tapsLine ? (
                        <span className="mt-0.5 block text-[13px] font-normal leading-5 text-[color:var(--ink-muted)]">{tapsLine}</span>
                      ) : null}
                    </dt>
                    <dd className="text-end">
                      {value !== undefined ? (
                        <span className="metric-number text-lg font-bold text-[color:var(--ink)]">{value.toLocaleString(formatLocale)}</span>
                      ) : (
                        <span className="text-[13px] text-[color:var(--ink-muted)]">{why || NOT_RETURNED}</span>
                      )}
                      {prior !== undefined ? (
                        <span className="block text-xs tabular-nums text-[color:var(--ink-muted)]"><Copy text="לפני כן:" />{prior.toLocaleString(formatLocale)}</span>
                      ) : null}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        );
      })}
      <p className="max-w-[46em] text-[13px] leading-6 text-[color:var(--ink-muted)]">
        <Copy text="לחיצות על הקישור בביו וכניסות לפרופיל: אינסטגרם כבר לא מוסר את המספרים האלה. את הלחיצות על קישור הוואטסאפ אנחנו סופרים בעצמנו. המספרים של אינסטגרם מתעדכנים באיחור של עד יומיים, ולכן היום לא נספר." /></p>
    </MoreFold>
  );
}

/* ------------------------------------------------------------------------------------ */
/* One level down                                                                        */
/* ------------------------------------------------------------------------------------ */

/** Every traffic number, with the plain-Hebrew meaning of each. */
function TrafficMetrics({ payload, folded = true }: { payload: PerformancePayload; folded?: boolean }) {
  const { locale } = useLanguage();
  const formatLocale = LOCALE_META[locale].formatLocale;
  const formatMetricValue = (key: string, value: string) => formatMetric(key, value, t, formatLocale);
  const t = useCopy();
  const entries = Object.entries(payload.ga4?.overview ?? {});
  if (!entries.length) return null;
  return (
    <MoreFold title={t("כל המספרים מהאתר")} folded={folded}>
      <p className="text-[13px] leading-6 text-[color:var(--ink-muted)]">
        <Copy text="המספרים מגוגל אנליטיקס, הכלי שסופר מה קורה באתר." /></p>
      <dl className="mt-2 divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
        {entries.map(([key, value]) => {
          const meta = METRIC_LABELS[key];
          return (
            <div key={key} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
              <dt className="text-[15px] font-medium text-[color:var(--ink)]">
                {t(meta?.label ?? key)}
                {meta?.note ? <span className="mt-0.5 block text-[13px] font-normal leading-5 text-[color:var(--ink-muted)]">{t(meta.note)}</span> : null}
              </dt>
              <dd className="metric-number text-lg font-bold text-[color:var(--ink)]">{formatMetricValue(key, value)}</dd>
            </div>
          );
        })}
      </dl>
    </MoreFold>
  );
}

/** The verdict on the content: what worked, and what is worth another attempt. */
function ContentVerdict({ payload }: { payload: PerformancePayload }) {
  const t = useCopy();
  const groups = [
    { id: "worked", title: t("מה הצליח"), items: payload.diagnostic?.top_content ?? [], mark: "bg-[var(--good)]" },
    { id: "improve", title: t("מה כדאי לשפר"), items: payload.diagnostic?.bottom_content ?? [], mark: "bg-[var(--sun)]" },
  ].filter((group) => group.items.length);
  if (!groups.length) return null;

  return (
    <div className="grid gap-8 md:grid-cols-2 md:gap-12">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`${group.id}-heading`}>
          <h3 id={`${group.id}-heading`} className="text-[13px] font-semibold text-[color:var(--ink-muted)]">
            {group.title}
          </h3>
          <ul className="mt-2 divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
            {group.items.map((item) => (
              <li key={t(item.label)} className="flex gap-3 py-3">
                <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rounded-full ${group.mark}`} />
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-[color:var(--ink)]">{t(item.label)}</p>
                  <p className="mt-1 text-[14px] leading-6 text-[color:var(--ink-soft)]">{item.why}</p>
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
      <h3 id="friction-heading" className="text-[13px] font-semibold text-[color:var(--ink-muted)]">
        <Copy text="מה עוצר אנשים בדרך לקנייה" /></h3>
      <ul className="mt-2 divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
        {issues.map((issue) => (
          <li key={issue} className="flex items-start gap-2.5 py-3 text-[15px] leading-7 text-[color:var(--ink)]">
            <span aria-hidden className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-[var(--ink-muted)]" />
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
  { key: "conversions", label: "פעולות חשובות באתר", source: "ga4" },
  { key: "engaged_sessions", label: "כניסות שנשארו באתר", source: "ga4" },
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
  conversions: "פעולות שסומנו כחשובות במדידה של האתר, אחרי כניסה מהקישור של פוסט. בלי לבדוק מה סומן, אי אפשר לקרוא להן הזמנות או פניות.",
  engaged_sessions: "לפי גוגל: יותר מ־10 שניות, פעולה חשובה או לפחות 2 עמודים.",
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
  const { locale } = useLanguage();
  const formatLocale = LOCALE_META[locale].formatLocale;
  if (value === undefined || value === null) return <span className="whitespace-nowrap text-xs text-[color:var(--ink-muted)]"><Copy text="לא נמדד" /></span>;
  return <span className="metric-number font-semibold text-[color:var(--ink)]">{value.toLocaleString(formatLocale)}</span>;
}

/**
 * Results broken down by the audience each post serves. Every honesty rule stays: an
 * unmeasured bucket is `לא נמדד`, the posts column is the sample size on every row, the
 * `לא משויך` bucket is its own row, and the backend's own explanation is printed.
 */
function AudienceBreakdown({ data }: { data: AudiencePerformance }) {
  const { locale } = useLanguage();
  const formatLocale = LOCALE_META[locale].formatLocale;
  const t = useCopy();
  const rows = data.rows ?? [];
  const maxPosts = rows.reduce((max, row) => Math.max(max, row.posts || 0), 0);
  const columns = columnsFor(data);

  return (
    <Expand title={t("לפי קהל")}>
      {!rows.length ? (
        <p className="text-[15px] text-[color:var(--ink-soft)]"><Copy text="עוד אין פוסטים בתוכנית, אז אין מה להראות לפי קהל." /></p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[560px] border-collapse text-right">
            <thead>
              <tr className="border-b border-[var(--rule-dark)] text-xs text-[color:var(--ink-muted)]">
                <th scope="col" className="py-2.5 pe-3 font-medium"><Copy text="קהל" /></th>
                <th scope="col" className="px-3 py-2.5 text-end font-medium"><Copy text="פוסטים" /></th>
                {columns.map((column) => (
                  <th key={column.key} scope="col" className="px-3 py-2.5 text-end font-medium last:pe-0">
                    {t(column.label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const unassigned = row.audience_id === null || row.name === UNASSIGNED_NAME;
                const measured = row.measured_posts ?? 0;
                return (
                  <tr
                    key={row.audience_id === null ? "unassigned" : row.audience_id}
                    className="border-b border-[var(--rule)] align-top text-[14px]"
                  >
                    <td className="py-3 pe-3">
                      <span className={`block text-[14px] font-semibold ${unassigned ? "text-[color:var(--ink-muted)]" : "text-[color:var(--ink)]"}`}>
                        {row.name || UNASSIGNED_NAME}
                        {row.is_primary ? (
                          <span className="ms-2 inline-block whitespace-nowrap rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--primary)]">
                            <Copy text="הקהל העיקרי" /></span>
                        ) : null}
                      </span>
                      <span className="mt-1.5 flex items-center gap-2">
                        {/* The sample size also draws the bar, so a one-post row cannot
                            read as a trend at a glance. */}
                        <span className="block h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--soft)]">
                          <span
                            className={`block h-full rounded-full ${unassigned ? "bg-[var(--ink-faint)]" : "bg-[var(--primary)]"}`}
                            style={{ width: `${maxPosts ? Math.max(8, ((row.posts || 0) / maxPosts) * 100) : 0}%` }}
                          />
                        </span>
                        <span className="text-[11px] leading-4 text-[color:var(--ink-muted)]">
                          {!unassigned && row.posts && measured < row.posts
                            ? measured === 0
                              ? row.posts === 1
                                ? t("עוד לא נמדד")
                                : t("עוד לא נמדדו")
                              : t("נמדדו {arg_0} מתוך {arg_1} פוסטים", { arg_0: measured, arg_1: row.posts })
                            : ""}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-end">
                      <span className="metric-number font-semibold text-[color:var(--ink)]">
                        {(row.posts || 0).toLocaleString(formatLocale)}
                      </span>
                      {row.posts === 1 ? <span className="mt-0.5 block whitespace-nowrap text-[11px] text-[color:var(--danger)]"><Copy text="רק פוסט אחד" /></span> : null}
                    </td>
                    {columns.map((column) => {
                      const bucket = column.source === "ga4" ? row.ga4 : row.meta;
                      const value =
                        bucket == null ? undefined : (bucket[column.key as keyof typeof bucket] as number | undefined);
                      return (
                        <td key={column.key} className="px-3 py-3 text-end last:pe-0">
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
        <p className="mt-4 max-w-[46em] text-[13px] leading-6 text-[color:var(--ink-muted)]">{data.explanation}</p>
      ) : null}
    </Expand>
  );
}

/** How the numbers were produced, and what every column means. */
function Method({ data }: { data?: AudiencePerformance | null }) {
  const t = useCopy();
  const columns = data ? columnsFor(data) : [];
  return (
    <Expand title={t("איך חישבנו")}>
      {data?.method ? <p className="max-w-[46em] text-[14px] leading-6 text-[color:var(--ink-soft)]">{data.method}</p> : null}
      <p className="mt-2 max-w-[46em] text-[14px] leading-6 text-[color:var(--ink-soft)]">
        <Copy text="לכל פוסט יש קישור מיוחד משלו, וכך יודעים אילו כניסות ופעולות באתר הגיעו ממנו. זה לא מוכיח שהפוסט גרם לרכישה. פוסט שלא הצלחנו לקשר לתוצאות מסומן &quot;לא נמדד&quot;. ככל שיש לקהל יותר פוסטים, המספרים שלו אמינים יותר. קהל עם פוסט אחד נותן כיוון, לא מגמה." /></p>
      {columns.length ? (
        <dl className="mt-4 divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
          {columns.map((column) => (
            <div key={column.key} className="py-3">
              <dt className="text-[14px] font-semibold text-[color:var(--ink)]">{t(column.label)}</dt>
              <dd className="mt-0.5 text-[13px] leading-5 text-[color:var(--ink-muted)]">{METRIC_NOTES[column.key] ?? ""}</dd>
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
  const { locale } = useLanguage();
  const formatLocale = LOCALE_META[locale].formatLocale;
  const t = useCopy();
  if (!data) return null;
  const heading = (
    <h2 id="wa-heading" className="text-lg font-bold tracking-tight text-[color:var(--ink)]">
      <Copy text="לחיצות על וואטסאפ" /></h2>
  );
  if (!data.number_e164) {
    return (
      <section aria-labelledby="wa-heading">
        {heading}
        <p className="mt-2 text-[15px] leading-7 text-[color:var(--ink-soft)]">
          <Copy text="לא נמדד, כי עוד אין קישור וואטסאפ." />{" "}
          <Link href="/integrations" className="font-semibold text-[color:var(--primary)] hover:underline hover:underline-offset-4">
            <Copy text="להכין את הקישור" /></Link>
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
    <ul className="divide-y divide-[var(--rule)]">
      {items.map((link) => (
        <li key={link.code} className="grid min-h-12 grid-cols-[1fr_4.5rem_4.5rem] items-center gap-2 py-2.5 text-[15px]">
          <span className="min-w-0 truncate font-medium text-[color:var(--ink)]" title={link.label_he}>
            {shortLabel(link.label_he)}
          </span>
          <span className="text-end font-semibold tabular-nums text-[color:var(--ink)]">{(link.clicks_7d || 0).toLocaleString(formatLocale)}</span>
          <span className="text-end tabular-nums text-[color:var(--ink-muted)]">{(link.clicks_total || 0).toLocaleString(formatLocale)}</span>
        </li>
      ))}
    </ul>
  );
  const devices = families.length ? (
    <div className="pb-4 pt-1">
      <p className="text-[13px] leading-6 tabular-nums text-[color:var(--ink-soft)]">
        {families.map(([family, count]) => `${t(FAMILY_HE[family] || family)}: ${count.toLocaleString(formatLocale)}`).join(" · ")}
      </p>
      <p className="mt-1 text-[13px] leading-6 text-[color:var(--ink-muted)]">
        <Copy text="אותו אדם שלחץ פעמיים נספר פעמיים. תצוגות מקדימות של הקישור ורובוטים לא נספרים." /></p>
    </div>
  ) : null;

  return (
    <section aria-labelledby="wa-heading">
      {heading}
      {rows.length ? (
        <div className="mt-3">
          <div className="grid grid-cols-[1fr_4.5rem_4.5rem] gap-2 border-b border-[var(--rule-dark)] pb-2 text-xs font-medium text-[color:var(--ink-muted)]">
            <span aria-hidden />
            <span className="text-end"><Copy text="7 ימים" /></span>
            <span className="text-end"><Copy text="מההתחלה" /></span>
          </div>
          {table(visible)}
          {rest.length || devices ? (
            <details className="group/more border-t border-[var(--rule)]">
              <MoreSummary>{rest.length ? t("עוד מקורות ומכשירים") : t("מאיזה מכשיר לחצו")}</MoreSummary>
              {rest.length ? <div className="border-t border-[var(--rule)]">{table(rest)}</div> : null}
              {devices}
            </details>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-[15px] leading-7 text-[color:var(--ink-soft)]"><Copy text="עוד אין לחיצות. שימו את הקישור בביו ובפוסטים." /></p>
      )}
      <p className="mt-2 text-[13px] leading-6 text-[color:var(--ink-muted)]">
        <Copy text="לחיצות על הקישור, לא הודעות שנשלחו ולא מכירות." /></p>
    </section>
  );
}

/**
 * Nothing has been synced yet. A normal state on this screen, and not an error. Our own
 * WhatsApp count may already have numbers: `postTaps` (the taps on the posts that were
 * measured) then leads, rather than a page that says there is nothing yet (#111).
 */
function NoSnapshotYet({ payload, postTaps = 0 }: { payload: PerformancePayload; postTaps?: number }) {
  const { locale } = useLanguage();
  const formatLocale = LOCALE_META[locale].formatLocale;
  const t = useCopy();
  const setup = payload.measurement_setup;
  const needs = setup?.requirements.filter(item => item.status === "todo") || [];
  const later = setup?.requirements.find(item => item.status === "soon");
  const whatsappOnly = setup?.requirements.length === 1 && setup.requirements[0].key === "whatsapp";
  const action = needs[0];
  const stepKeys = needs.map(item => item.key === "ga4" ? "site_data" : item.key === "meta" ? "instagram" : "whatsapp");
  const explanation = whatsappOnly && needs.length
    ? t("הכינו קישור מדיד לוואטסאפ. נספור לחיצות עליו, ולא הודעות או לקוחות.")
    : needs.length
    ? t("לפי התוכנית, נשאר לבדוק: {arg_0}. נציג רק נתונים שנמדדו בפועל.", { arg_0: needs.map(item => t(item.title)).join(" ו") })
    : later ? later.why
    : whatsappOnly ? t("התוכנית מודדת לחיצות על הקישור לוואטסאפ. הספירה מופיעה בהמשך העמוד; היא לא סופרת הודעות או לקוחות.")
    : t("עוד לא שמרנו נתונים מהחיבורים. קריאה מוצלחת תופיע כאן, עם המקור והתאריך. אפשר להמשיך לעבוד בתוכנית.");
  return (
    <section className="paper px-6 py-10 text-center sm:px-10">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--sand)] text-[color:var(--sand-dark)]">
        <IconChart className="h-6 w-6" />
      </div>
      <h2 className="mt-5 text-xl font-bold tracking-tight text-[color:var(--ink)]">
        {postTaps > 0
          ? postTaps === 1
            ? t("לחיצה אחת לוואטסאפ מהפוסטים")
            : t("{arg_0} לחיצות לוואטסאפ מהפוסטים", { arg_0: postTaps.toLocaleString(formatLocale) })
          : whatsappOnly ? t("המדידה לפי התוכנית") : t("עוד אין נתונים מהחיבורים")}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-[15px] leading-7 text-[color:var(--ink-soft)]">
        {explanation}
      </p>
      {/* Ask for the first missing source in the saved plan, or return to the plan. */}
      <Link
        href={action?.action_href || "/strategy"}
        className="drawn-button group mt-6 inline-flex min-h-12 items-center gap-2 bg-[var(--primary)] px-6 text-[15px] text-white hover:bg-[var(--primary-dark)]"
      >
        {action?.action_label || t("לתוכנית")}
        <IconArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
      </Link>
      {needs.some(item => item.key === "ga4") ? <div className="mt-2">
        <HowToFind topic="google_analytics" label={t("איך מוצאים את נתוני האתר?")} />
      </div> : null}
      {!later || needs.length ? <div className="mt-2"><StepLink stepKey={[...stepKeys, "results"]} /></div> : null}
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
  const t = useCopy();
  const [data, setData] = useState<PerformancePayload | null>(null);
  const [recommendation, setRecommendation] = useState<RecommendationPayload | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [planMeasure, setPlanMeasure] = useState("");
  const [serviceResults, setServiceResults] = useState<ServiceResultsPayload | null>(null);
  const [serviceError, setServiceError] = useState("");
  const [serviceEditing, setServiceEditing] = useState(false);
  const [recommending, setRecommending] = useState(false);
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
    endpoints.recommendations().then(setRecommendation).catch(() => {});
    endpoints.serviceResults().then(setServiceResults).catch(err => setServiceError(err instanceof Error ? err.message : "לא הצלחנו לטעון את הדיווח. נסו לרענן את העמוד."));
  }, []);

  async function recommendFromReport() {
    setRecommending(true); setError("");
    try { setRecommendation(await endpoints.generateRecommendations()); }
    catch (err) { setError(err instanceof Error ? err.message : t("לא הצלחנו להכין הצעה. הדיווח נשמר; אפשר לנסות שוב.")); }
    finally { setRecommending(false); }
  }

  useEffect(() => {
    // Opening the results is a step of the free month (the first results, the month's
    // review); the API decides whether this visit completes one.
    markSeen("results");
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
      setRecommendation(weekly.recommendation);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("לא הצלחנו לרענן את הנתונים מגוגל ומאינסטגרם. נסו שוב בעוד כמה דקות."));
      // A recommendation outage can follow a successful source read. Load that saved
      // snapshot rather than leaving the owner with a failed request and stale numbers.
      try { setData(await endpoints.performance()); } catch { /* Keep the displayed results. */ }
    } finally {
      setPending(false);
    }
  }

  const analysisPending = data?.diagnostic?.analysis_status === "pending";
  const snapshotId = data?.id;
  useEffect(() => {
    if (!analysisPending || !snapshotId) return;
    let stopped = false;
    let checking = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function check() {
      if (stopped || checking || attempts >= 120) return;
      checking = true;
      if (!document.hidden) {
        attempts++;
        try {
          const payload = await endpoints.performance();
          const proposal = await endpoints.recommendations();
          if (stopped) return;
          setData(payload);
          setRecommendation(proposal);
          if (payload.diagnostic?.analysis_status !== "pending") return;
        } catch { /* A quiet read retry; never starts generation or another provider read. */ }
      }
      checking = false;
      if (!stopped) timer = setTimeout(check, document.hidden ? 30000 : 3000);
    }
    function resume() {
      if (document.hidden || checking) return;
      attempts = 0;
      clearTimeout(timer);
      void check();
    }
    document.addEventListener("visibilitychange", resume);
    timer = setTimeout(check, 3000);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", resume); };
  }, [analysisPending, snapshotId]);

  const available = Boolean(data && data.available !== false);
  const canRefresh = data?.measurement_setup?.can_refresh ?? Boolean(data?.audiences?.connected?.ga4 || data?.audiences?.connected?.meta);
  // The posts' own numbers need no snapshot: WhatsApp taps are counted from day one.
  const results = data ? postResults(data) : null;
  const postTaps = (results?.items || []).reduce((sum, item) => sum + (item.metric === "whatsapp_clicks" ? item.value : 0), 0);
  const hasVerdict = Boolean(data?.diagnostic?.top_content?.length || data?.diagnostic?.bottom_content?.length);
  const hasFriction = Boolean(data?.diagnostic?.funnel_issues?.length);
  // Only from a refresh that read the account; an older snapshot simply has none.
  const account = available && data?.meta?.account ? data.meta.account : null;
  const siteNumbers = Object.keys(data?.ga4?.overview ?? {}).length > 0;
  const hasProposal = Boolean(recommendation?.available !== false && recommendation?.suggestions?.suggestions?.length &&
    (!["pending", "unavailable", "paused", "superseded"].includes(data?.diagnostic?.analysis_status || "") ||
      (data?.id && recommendation?.suggestions?.basis?.snapshot_id === data.id)));
  const checkIn = <ServiceCheckIn data={serviceResults} loadError={serviceError} primary={!hasProposal} onEditing={setServiceEditing}
    onSaved={payload => { setServiceResults(payload); endpoints.recommendations().then(setRecommendation).catch(() => {}); }}
    onRecommend={recommendFromReport} recommending={recommending} />;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        {/* Refreshing is maintenance, not the ask: a quiet control, so it does not compete
            with the results (UI-RULES rule 1). */}
        <PageHeader
          title={t("תוצאות")}
          action={canRefresh ? (
            <Button onClick={sync} disabled={pending} tone="secondary" size="md">
              {pending ? t("מרעננים…") : t("לרענן את הנתונים")}
            </Button>
          ) : undefined}
        />

        <ErrorNote message={t(error)} />

        {!hasProposal ? <div className="mb-8 empty:hidden">{checkIn}</div> : null}

        {data ? (
          <div className="space-y-10 sm:space-y-12">
            <div className="space-y-4">
              <SourceDataNotice payload={data} />
              {!hasProposal ? available ? <Answer payload={data} /> : !serviceResults?.enabled ? <NoSnapshotYet payload={data} postTaps={postTaps} /> : null : null}
              {planMeasure ? (
                <p className="text-[14px] leading-6 text-[color:var(--ink-soft)]">
                  <Copy text="בתוכנית:" /><span className="font-semibold text-[color:var(--ink)]">{planMeasure}</span>.{" "}
                  <Link href="/strategy" className="inline-flex min-h-11 items-center align-middle font-semibold text-[color:var(--primary)] hover:underline hover:underline-offset-4">
                    <Copy text="לתוכנית" /></Link>
                </p>
              ) : null}
            </div>
            {available && !hasProposal && !serviceResults?.enabled ? <MeasurementGaps payload={data} /> : null}
            {hasProposal && recommendation ? <FindingCard payload={recommendation} primary={!serviceEditing} /> : null}
            {hasProposal && serviceResults?.enabled ? <details className="group/check-in border-y border-[var(--rule)]">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold text-[color:var(--ink)] [&::-webkit-details-marker]:hidden">
                <Copy text="הדיווח שלכם על פניות ולקוחות" /><IconChevron className="h-[18px] w-[18px] -rotate-90 text-[color:var(--ink-muted)] transition-transform group-open/check-in:rotate-90" />
              </summary>
              <div className="pb-4">{checkIn}</div>
            </details> : null}
            {serviceResults?.enabled ? <MeasurementGaps payload={data} ownerReport /> : null}
            {results ? <PostResults results={results} /> : null}
            <SourceReportLimits payload={data} />
            <div className="divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
              {/* One row per source: the summary, then all of its numbers one fold down. With no
                  proposal the summary already leads the page, so the row holds just the numbers. */}
              {available && (hasProposal || siteNumbers) ? <Expand title={t("נתוני האתר")}>{hasProposal ? <Answer payload={data} /> : null}<TrafficMetrics payload={data} folded={hasProposal} /></Expand> : null}
              {available && (data.meta?.ads || data.meta?.tracking) ? <Expand title={t("המודעות והמעקב באתר")}><MetaAdsSummary ads={data.meta?.ads} tracking={data.meta?.tracking} /></Expand> : null}
              {account ? <Expand title={t("החשבון באינסטגרם")}><InstagramAccountBlock account={account} /><AccountMetrics account={account} /></Expand> : null}
              {results && comparablePosts(results.items.filter(item => item.metric === leadingMetric(results.items))) ? <Expand title={t("השוואת תוצאות הפוסטים")}><PostComparison results={results} /></Expand> : null}
              {whatsapp ? <Expand title={t("לחיצות על וואטסאפ")}><WhatsappClicks data={whatsapp} /></Expand> : null}
            </div>

            {/* Two folded rows from the plan side, drawn as one hairline list (each carries
                its own top and bottom rule; the overlap keeps it to one line between). */}
            <div className={`${styles.planRows} empty:hidden [&>*+*]:-mt-px`}>
              <ResearchSection />
              <PerformanceHypotheses />
            </div>

            <div className="divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
              {available && (hasVerdict || hasFriction) ? (
                <Expand title={t("מה הצליח ומה לשפר")}>
                  <div className="space-y-6">
                    <ContentVerdict payload={data} />
                    <Friction payload={data} />
                  </div>
                </Expand>
              ) : available && hasFriction ? (
                <Expand title={t("מה עוצר אנשים")}>
                  <Friction payload={data} />
                </Expand>
              ) : null}
              {data.audiences ? <AudienceBreakdown data={data.audiences} /> : null}
              <Method data={data.audiences} />
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
