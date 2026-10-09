"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import Link from "next/link";
import { useId } from "react";
import type { RecommendationPayload } from "@/lib/api";
import { dateRange, dayMonth } from "@/lib/dates";
import { IconChevron } from "@/lib/icons";
import { checkedDate } from "@/components/integrations/SourceReadState";
import { useLanguage } from "@/components/language/LanguageProvider";
import { LOCALE_META } from "@/lib/i18n/locales";

export type Finding = RecommendationPayload["suggestions"]["suggestions"][number];
type Source = NonNullable<RecommendationPayload["suggestions"]["basis"]>["sources"][number];

/**
 * When the target moved after the suggestion was made, that is the first thing to say: the
 * eyebrow names it and the numbers step back (they describe a plan that is no longer here).
 */
function changedLabel(status: string | undefined, note: string) {
  if (status === "stale") return /הדיווח|פרטי העסק/.test(note) ? "הנתונים השתנו מאז ההצעה" : "התוכנית השתנתה מאז ההצעה";
  if (status === "changed") return "הפוסט נערך מאז ההצעה";
  if (status === "missing") return "הפוסט כבר לא בתוכנית";
  if (status === "published") return "הפוסט כבר פורסם";
  return "";
}

/** "8.8 עד 4.9.2026 · נקרא ב־5.9", once for the number row; one clause per period when they differ. */
function periodLine(sources: Source[], locale: Parameters<typeof dateRange>[2]) {
  const ranges = new Map<string, Source[]>();
  for (const source of sources) {
    const range = dateRange(source.period.start, source.period.end, locale);
    if (range) ranges.set(range, [...(ranges.get(range) ?? []), source]);
  }
  const reads = sources.map(source => source.read_at).filter(Boolean).sort();
  const read = dayMonth(reads.at(-1));
  return { ranges: [...ranges.entries()], read };
}

/** English content brief:
 * Purpose: decide whether to try one specific marketing change.
 * Main message: the proposed change, the observations behind it, and how to test it.
 * Show the supplied possible explanation in the main view, clearly as a hypothesis.
 * Label each metric and its source; don't repeat generic warnings about unrelated totals.
 * Keep actual stale/missing/changed states and the relevant measurement limit visible.
 * Source timestamps and remaining method details are optional supporting evidence.
 */
export function FindingCard({ payload, index = 0, primary = true, onReview }: {
  payload: RecommendationPayload; index?: number; primary?: boolean; onReview?: () => void;
}) {
  const t = useCopy();
  const { locale } = useLanguage();
  const id = useId();
  const item = payload.suggestions.suggestions[index];
  if (!item) return null;
  const basis = payload.suggestions.basis;
  // Remove only the old fixture caption. The substantive measurement limit stays visible.
  const fixtureCaption = "הנתונים מומצאים לצורך הדגמה.";
  const limits = (basis?.limits ?? []).map(limit => limit.startsWith(fixtureCaption)
    ? limit.slice(fixtureCaption.length).trim() : limit).filter(Boolean);
  const sources = basis?.sources ?? [];
  const observations = basis?.observations ?? [];
  const ownerFacts = observations.filter(fact => fact.source === "service_owner");
  const visibleFacts = [...ownerFacts, ...observations.filter(fact => fact.source !== "service_owner")].slice(0, 3);
  const onlyOwnerFacts = visibleFacts.length > 0 && visibleFacts.every(fact => fact.source === "service_owner");
  const ownerPeriod = sources.find(source => source.key === "service_owner")?.period;
  const available = sources.filter(source => source.status !== "missing");
  const stale = available.some(source => source.stale || source.status !== "available");
  const missing = sources.filter(source => source.status === "missing");
  const review = item.review;
  const legacy = !basis || review?.status === "legacy";
  const note = review?.status && review.status !== "ready" ? review.note_he : "";
  const changed = legacy ? "" : changedLabel(review?.status, note);
  const factSources = sources.filter(source => visibleFacts.some(fact => fact.source === source.key));
  const period = periodLine(factSources, locale);
  return <article aria-labelledby={`${id}-title`} className="paper p-5 sm:p-7">
    <p className={`flex items-center gap-2 text-sm font-medium ${changed ? "text-[color:var(--sand-dark)]" : "text-[color:var(--ink-muted)]"}`}>
      {t(changed || "הצעה לבדיקה")}{payload.created_at ? t(" · הוכנה ב־{arg_0}", { arg_0: checkedDate(payload.created_at) }) : ""}
    </p>
    <h2 id={`${id}-title`} className="mt-3 text-[24px] font-semibold leading-snug text-[color:var(--ink)]">{item.title}</h2>
    {/* The changed state's explanation comes before the numbers it qualifies. */}
    {changed && note ? <p className="mt-2 max-w-[42em] text-base leading-7 text-[color:var(--ink-soft)]">{note}</p> : null}
    {!legacy && (item.hypothesis || item.evidence) ? <p className="mt-2 max-w-[42em] text-base leading-7 text-[color:var(--ink-soft)]">
      {item.hypothesis ? <><Copy text="למה ננסה את זה?" />{" "}{item.hypothesis}</> : item.evidence}
    </p> : null}
    <section className="mt-5 rounded-xl bg-[var(--primary-soft)] p-4 sm:p-5" aria-label={t("הצעד הבא")}>
      <p className="max-w-[42em] text-base font-medium leading-7 text-[color:var(--ink)]">{item.action}</p>
      {item.success_check ? <p className="mt-3 text-sm leading-6 text-[color:var(--ink-soft)]"><strong className="font-medium"><Copy text="איך נבדוק:" /></strong>{" "}{item.success_check}</p> : <p className="mt-3 text-sm leading-6 text-[color:var(--ink-soft)]"><Copy text="עוד לא קבענו איך נדע אם זה הצליח. בחרו בתוכנית מה למדוד לפני שמסיקים מסקנה." /></p>}
      {note && !legacy && !changed ? <p className="mt-3 rounded-lg bg-[var(--soft)] px-3 py-2 text-sm leading-6 text-[color:var(--ink-soft)]">{note}</p> : null}
      <Link href={review?.href || "/strategy"} onClick={onReview ? event => { event.preventDefault(); onReview(); } : undefined} className={primary
        ? "drawn-button group mt-4 inline-flex min-h-11 items-center gap-2 bg-[var(--primary)] px-5 py-3 text-sm text-white hover:bg-[var(--primary-dark)]"
        : "mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[color:var(--primary)] hover:underline hover:underline-offset-4"}>
        {review?.label || t("לבדוק את ההצעה בתוכנית")}
      </Link>
    </section>
    {legacy ? <p className="mt-3 text-sm leading-6 text-[color:var(--ink-soft)]"><Copy text="זו הצעה ישנה, בלי פירוט של המקורות. כדאי לבדוק מספרים עדכניים לפני שמשנים משהו." /></p> : <>
      <div className={onlyOwnerFacts ? "mt-4 grid grid-cols-3 gap-3" : "mt-4 flex flex-wrap gap-x-8 gap-y-3"} aria-label={ownerFacts.length ? t("מה ידוע") : t("מה נמדד")}>
        {visibleFacts.map(fact => <div key={`${fact.source}-${fact.metric}`}>
          <p className="text-sm text-[color:var(--ink-soft)]">{fact.label}{sources.find(source => source.key === fact.source)?.label ? <> · {sources.find(source => source.key === fact.source)!.label}</> : null}</p>
          <p className={changed ? "mt-0.5 text-[16px] font-semibold tabular-nums text-[color:var(--ink-soft)]" : "mt-1 text-[24px] font-bold tabular-nums tracking-tight text-[color:var(--ink)]"}>{new Intl.NumberFormat(LOCALE_META[locale].formatLocale, { maximumFractionDigits: 1 }).format(fact.value)}</p>
        </div>)}
      </div>
      {onlyOwnerFacts ? <p className="mt-2 text-sm text-[color:var(--ink-muted)]"><bdi>{dateRange(ownerPeriod?.start, ownerPeriod?.end, locale)}</bdi>{" "}<Copy text="· לפי הדיווח שלכם" /></p>
        : period.ranges.length ? <p className="mt-2 text-sm tabular-nums text-[color:var(--ink-muted)]">
          {period.ranges.map(([range, group], i) => <span key={range}>{i ? " · " : ""}{period.ranges.length > 1 ? `${group.map(source => source.label).join(", ")}: ` : ""}<bdi>{range}</bdi></span>)}
          {period.read ? <>{" "}<Copy text="· נקרא ב־" />{" "}<bdi>{period.read}</bdi></> : null}
        </p> : null}
      {observations.length === 0 ? <p className="mt-3 text-sm leading-6 text-[color:var(--ink-soft)]"><Copy text="עוד אין נתוני תוצאות להשוואה." /></p> : null}
      {stale ? <p className="mt-3 text-sm leading-6 text-[color:var(--ink-soft)]"><Copy text="חלק מהמספרים מעדכון קודם, ולכן הם לא מראים את המצב היום." /></p> : null}
      {missing.length ? <p className="mt-2 text-sm leading-6 text-[color:var(--ink-muted)]"><Copy text="חסר:" />{" "}{missing.map(source => source.label).join(", ")}</p> : null}
    </>}
    {!legacy && limits[0] ? <p className="mt-3 text-sm leading-6 text-[color:var(--ink-soft)]">{limits[0]}</p> : null}

    {/* Only provenance and additional measurement limits need a disclosure. The
        reason, action and test above are readable without opening it. */}
    {sources.length || limits.length > (legacy ? 0 : 1) || (item.hypothesis && item.evidence) ? <details className="group mt-4 border-t border-[var(--rule)]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[color:var(--ink-soft)] [&::-webkit-details-marker]:hidden">
        {t("מקורות הנתונים")}<IconChevron className="h-4 w-4 -rotate-90 transition-transform duration-200 ease-[cubic-bezier(.2,.7,.2,1)] group-open:rotate-90 motion-reduce:transition-none" />
      </summary>
      <div className="space-y-3 pt-1 text-sm leading-6 text-[color:var(--ink-soft)]">
        {sources.map(source => <p key={source.key}><strong className="font-semibold">{source.label}: </strong>{source.status === "missing" ? t("אין נתונים") : <>
          {dateRange(source.period.start, source.period.end, locale) ? <bdi>{dateRange(source.period.start, source.period.end, locale)}</bdi> : t("תקופה לא ידועה")}{" · "}
          {t(source.key === "service_owner" ? "עודכנו ב־{arg_0}" : "נקראו ב־{arg_0}", { arg_0: checkedDate(source.read_at) || t("מועד לא ידוע") })}
          {source.status === "historical" ? source.key === "service_owner" ? t(" · הדיווח השתנה מאז ההצעה") : t(" · החיבור אינו פעיל כרגע") : source.status === "different_selection" ? t(" · נבחר אתר או חשבון אחר מאז הקריאה") : ""}
        </>}</p>)}
        {item.hypothesis && item.evidence ? <p>{item.evidence}</p> : null}
        {limits.slice(legacy ? 0 : 1).map(limit => <p key={limit}>{limit}</p>)}
      </div>
    </details> : null}
  </article>;
}
