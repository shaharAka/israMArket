"use client";

import Link from "next/link";
import { useId } from "react";
import type { RecommendationPayload } from "@/lib/api";
import { dateRange, dayMonth } from "@/lib/dates";
import { IconArrowLeft, IconChevron } from "@/lib/icons";
import { checkedDate } from "@/components/integrations/SourceReadState";

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
function periodLine(sources: Source[]) {
  const ranges = new Map<string, Source[]>();
  for (const source of sources) {
    const range = dateRange(source.period.start, source.period.end);
    if (range) ranges.set(range, [...(ranges.get(range) ?? []), source]);
  }
  const reads = sources.map(source => source.read_at).filter(Boolean).sort();
  const read = dayMonth(reads.at(-1));
  return { ranges: [...ranges.entries()], read };
}

/** One proposal, with source facts separate from the model's possible explanation. */
export function FindingCard({ payload, index = 0, primary = true, onReview }: {
  payload: RecommendationPayload; index?: number; primary?: boolean; onReview?: () => void;
}) {
  const id = useId();
  const item = payload.suggestions.suggestions[index];
  if (!item) return null;
  const basis = payload.suggestions.basis;
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
  const period = periodLine(factSources);
  return <article aria-labelledby={`${id}-title`} className="paper p-5 sm:p-7">
    <p className={`flex items-center gap-2 text-[13px] font-medium ${changed ? "text-[color:var(--sand-dark)]" : "text-[color:var(--ink-muted)]"}`}>
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[var(--sun)]" />
      {changed || "הצעה לבדיקה"}{payload.created_at ? ` · הוכנה ב־${checkedDate(payload.created_at)}` : ""}
    </p>
    <h2 id={`${id}-title`} className="mt-3 text-[20px] font-bold leading-snug tracking-tight text-[color:var(--ink)]">{item.title}</h2>
    {/* The changed state's explanation comes before the numbers it qualifies. */}
    {changed && note ? <p className="mt-2 max-w-[42em] text-[15px] leading-7 text-[color:var(--ink-soft)]">{note}</p> : null}
    {legacy ? <p className="mt-3 text-[14px] leading-6 text-[color:var(--ink-soft)]">זו הצעה ישנה, בלי פירוט של המקורות. כדאי לבדוק מספרים עדכניים לפני שמשנים משהו.</p> : <>
      <div className={onlyOwnerFacts ? "mt-4 grid grid-cols-3 gap-3" : "mt-4 flex flex-wrap gap-x-8 gap-y-3"} aria-label={ownerFacts.length ? "מה ידוע" : "מה נמדד"}>
        {visibleFacts.map(fact => <div key={`${fact.source}-${fact.metric}`}>
          <p className="text-[12px] text-[color:var(--ink-muted)]">{fact.label}</p>
          <p className={changed ? "mt-0.5 text-[16px] font-semibold tabular-nums text-[color:var(--ink-soft)]" : "mt-1 text-[24px] font-bold tabular-nums tracking-tight text-[color:var(--ink)]"}>{new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1 }).format(fact.value)}</p>
        </div>)}
      </div>
      {onlyOwnerFacts ? <p className="mt-2 text-[12px] text-[color:var(--ink-muted)]"><bdi>{dateRange(ownerPeriod?.start, ownerPeriod?.end)}</bdi> · לפי הדיווח שלכם</p>
        : period.ranges.length ? <p className="mt-2 text-[12px] tabular-nums text-[color:var(--ink-muted)]">
          {period.ranges.map(([range, group], i) => <span key={range}>{i ? " · " : ""}{period.ranges.length > 1 ? `${group.map(source => source.label).join(", ")}: ` : ""}<bdi>{range}</bdi></span>)}
          {period.read ? <> · נקרא ב־<bdi>{period.read}</bdi></> : null}
        </p> : null}
      {observations.length === 0 ? <p className="mt-3 text-[14px] leading-6 text-[color:var(--ink-soft)]">אין מספיק מספרים כדי להסיק מסקנה. זו הצעה לניסוי, לא תוצאה מוכחת.</p> : <p className="mt-3 text-[12px] leading-6 text-[color:var(--ink-muted)]">{ownerFacts.length ? "הפניות והלקוחות הם הדיווח שלכם. לקוח יכול להגיע מפנייה של חודש קודם. אי אפשר לדעת מאיזה פוסט הם הגיעו, וכל מקור נספר לבד." : "אלה לא בהכרח פניות או הזמנות. כל מספר מגיע ממקור אחר, ולא מחברים ביניהם."}</p>}
      {stale ? <p className="mt-3 text-[13px] leading-6 text-[color:var(--ink-soft)]">חלק מהמספרים מעדכון קודם, ולכן הם לא מראים את המצב היום.</p> : null}
      {missing.length ? <p className="mt-2 text-[13px] leading-6 text-[color:var(--ink-muted)]">חסר: {missing.map(source => source.label).join(", ")}. זה לא אומר שלא הייתה פעילות.</p> : null}
    </>}
    <p className="mt-4 max-w-[42em] text-[15px] leading-7 text-[color:var(--ink-soft)]"><strong className="font-semibold text-[color:var(--ink)]">מה ננסה: </strong>{item.action}</p>
    {note && !legacy && !changed ? <p className="mt-3 rounded-lg bg-[var(--soft)] px-3 py-2 text-[13px] leading-6 text-[color:var(--ink-soft)]">{note}</p> : null}
    <Link href={review?.href || "/strategy"} onClick={onReview ? event => { event.preventDefault(); onReview(); } : undefined} className={primary
      ? "drawn-button group mt-5 inline-flex min-h-11 items-center gap-2 bg-[var(--primary)] px-5 py-3 text-[14px] text-white hover:bg-[var(--primary-dark)]"
      : "mt-4 inline-flex min-h-11 items-center gap-2 text-[14px] font-semibold text-[color:var(--primary)] hover:underline hover:underline-offset-4"}>
      {review?.label || "לבדוק את ההצעה בתוכנית"}<IconArrowLeft className="h-4 w-4" />
    </Link>
    {/* The possible explanation is reasoning, so it opens with the sources (UI-RULES rule 2)
        and the proposal and its button follow the numbers directly. */}
    <details className="group mt-4 border-t border-[var(--rule)]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[13px] font-semibold text-[color:var(--ink-soft)] [&::-webkit-details-marker]:hidden">
        {item.hypothesis ? "למה, המקורות ואיך נבדוק" : "המקורות, המגבלות ואיך נבדוק"}<IconChevron className="h-4 w-4 -rotate-90 transition-transform duration-200 ease-[cubic-bezier(.2,.7,.2,1)] group-open:rotate-90 motion-reduce:transition-none" />
      </summary>
      <div className="space-y-3 pt-1 text-[13px] leading-6 text-[color:var(--ink-soft)]">
        {item.hypothesis ? <p><strong className="font-semibold">הסבר אפשרי: </strong>{item.hypothesis}</p> : null}
        {sources.map(source => <p key={source.key}><strong className="font-semibold">{source.label}: </strong>{source.status === "missing" ? "אין נתונים" : <>
          {dateRange(source.period.start, source.period.end) ? <bdi>{dateRange(source.period.start, source.period.end)}</bdi> : "תקופה לא ידועה"}{" · "}
          {source.key === "service_owner" ? "עודכנו" : "נקראו"} ב־{checkedDate(source.read_at) || "מועד לא ידוע"}
          {source.status === "historical" ? source.key === "service_owner" ? " · הדיווח השתנה מאז ההצעה" : " · החיבור אינו פעיל כרגע" : source.status === "different_selection" ? " · נבחר אתר או חשבון אחר מאז הקריאה" : ""}
        </>}</p>)}
        {item.evidence ? <p><strong className="font-semibold">הנימוק להצעה, לפי הניתוח: </strong>{item.evidence}</p> : null}
        {(basis?.limits ?? []).map(limit => <p key={limit}>{limit}</p>)}
        {item.success_check ? <p><strong className="font-semibold">איך נבדוק: </strong>{item.success_check}</p> : <p>עוד לא קבענו איך נדע אם זה הצליח. בחרו בתוכנית מה למדוד לפני שמסיקים מסקנה.</p>}
        <p>{review?.note_he || "ההצעה לא משנה את התוכנית ולא מפרסמת תוכן. אתם מחליטים מה לערוך ולאשר."}</p>
      </div>
    </details>
  </article>;
}
