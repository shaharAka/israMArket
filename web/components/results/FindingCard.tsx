"use client";

import Link from "next/link";
import { useId } from "react";
import type { RecommendationPayload } from "@/lib/api";
import { IconArrowLeft, IconChevron } from "@/lib/icons";
import { checkedDate } from "@/components/integrations/SourceReadState";

export type Finding = RecommendationPayload["suggestions"]["suggestions"][number];

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
  // When every number covers the same dates, say them once under the row, not under each number.
  const periodOf = (key: string) => sources.find(source => source.key === key)?.period;
  const periods = new Set(visibleFacts.map(fact => `${checkedDate(periodOf(fact.source)?.start)}|${checkedDate(periodOf(fact.source)?.end)}`));
  const shared = !onlyOwnerFacts && periods.size === 1 ? periodOf(visibleFacts[0].source) : undefined;
  const sharedPeriod = shared && checkedDate(shared.start) && checkedDate(shared.end) ? `${checkedDate(shared.start)} עד ${checkedDate(shared.end)}` : "";
  const available = sources.filter(source => source.status !== "missing");
  const stale = available.some(source => source.stale || source.status !== "available");
  const missing = sources.filter(source => source.status === "missing");
  const review = item.review;
  const legacy = !basis || review?.status === "legacy";
  const note = review?.status && review.status !== "ready" ? review.note_he : "";
  return <article aria-labelledby={`${id}-title`} className="paper p-5 sm:p-7">
    <p className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--ink-muted)]">
      <span aria-hidden className="h-2 w-2 rounded-full bg-[var(--sun)]" />
      הצעה לבדיקה{payload.created_at ? ` · הוכנה ב־${checkedDate(payload.created_at)}` : ""}
    </p>
    <h2 id={`${id}-title`} className="mt-3 text-[20px] font-bold leading-snug tracking-tight text-[color:var(--ink)]">{item.title}</h2>
    {legacy ? <p className="mt-3 text-[14px] leading-6 text-[color:var(--ink-soft)]">זו הצעה ישנה, בלי פירוט של המקורות. כדאי לבדוק מספרים עדכניים לפני שמשנים משהו.</p> : <>
      <div className={onlyOwnerFacts ? "mt-4 grid grid-cols-3 gap-3" : "mt-4 flex flex-wrap gap-x-8 gap-y-3"} aria-label={ownerFacts.length ? "מה ידוע" : "מה נמדד"}>
        {visibleFacts.map(fact => <div key={`${fact.source}-${fact.metric}`}>
          <p className="text-[12px] text-[color:var(--ink-muted)]">{fact.label}</p>
          <p className="mt-1 text-[24px] font-bold tabular-nums tracking-tight text-[color:var(--ink)]">{new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1 }).format(fact.value)}</p>
          {!onlyOwnerFacts && !sharedPeriod ? <p className="mt-1 text-[11px] text-[color:var(--ink-muted)]">{checkedDate(periodOf(fact.source)?.start)}–{checkedDate(periodOf(fact.source)?.end)}</p> : null}
        </div>)}
      </div>
      {sharedPeriod ? <p className="mt-2 text-[12px] tabular-nums text-[color:var(--ink-muted)]">{sharedPeriod}</p> : null}
      {onlyOwnerFacts ? <p className="mt-2 text-[12px] text-[color:var(--ink-muted)]">{checkedDate(ownerPeriod?.start)} עד {checkedDate(ownerPeriod?.end)} · לפי הדיווח שלכם</p> : null}
      {observations.length === 0 ? <p className="mt-3 text-[14px] leading-6 text-[color:var(--ink-soft)]">אין מספיק מספרים כדי להסיק מסקנה. זו הצעה לניסוי, לא תוצאה מוכחת.</p> : <p className="mt-3 text-[12px] leading-6 text-[color:var(--ink-muted)]">{ownerFacts.length ? "הפניות והלקוחות הם הדיווח שלכם. לקוח יכול להגיע מפנייה של חודש קודם. אי אפשר לדעת מאיזה פוסט הם הגיעו, וכל מקור נספר לבד." : "אלה לא בהכרח פניות או הזמנות. כל מספר מגיע ממקור אחר, ולא מחברים ביניהם."}</p>}
      {stale ? <p className="mt-3 text-[13px] leading-6 text-[color:var(--ink-soft)]">חלק מהמספרים מעדכון קודם, ולכן הם לא מראים את המצב היום.</p> : null}
      {missing.length ? <p className="mt-2 text-[13px] leading-6 text-[color:var(--ink-muted)]">חסר: {missing.map(source => source.label).join(", ")}. זה לא אומר שלא הייתה פעילות.</p> : null}
    </>}
    <p className="mt-4 max-w-[42em] text-[15px] leading-7 text-[color:var(--ink-soft)]"><strong className="font-semibold text-[color:var(--ink)]">מה ננסה: </strong>{item.action}</p>
    {note && !legacy ? <p className="mt-3 rounded-lg bg-[var(--soft)] px-3 py-2 text-[13px] leading-6 text-[color:var(--ink-soft)]">{note}</p> : null}
    <Link href={review?.href || "/strategy"} onClick={onReview ? event => { event.preventDefault(); onReview(); } : undefined} className={primary
      ? "drawn-button mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-3 text-[14px] font-semibold text-white"
      : "mt-4 inline-flex min-h-11 items-center gap-2 text-[14px] font-semibold text-[color:var(--primary)] hover:underline hover:underline-offset-4"}>
      {review?.label || "לבדוק את ההצעה בתוכנית"}<IconArrowLeft className="h-4 w-4" />
    </Link>
    {/* The possible explanation is reasoning, so it opens with the sources (UI-RULES rule 2)
        and the proposal and its button follow the numbers directly. */}
    <details className="group mt-4 border-t border-[var(--rule)]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[13px] font-semibold text-[color:var(--ink-soft)] [&::-webkit-details-marker]:hidden">
        {item.hypothesis ? "למה, המקורות ואיך נבדוק" : "המקורות, המגבלות ואיך נבדוק"}<IconChevron className="h-4 w-4 -rotate-90 transition-transform group-open:rotate-90" />
      </summary>
      <div className="space-y-3 pt-1 text-[13px] leading-6 text-[color:var(--ink-soft)]">
        {item.hypothesis ? <p><strong className="font-semibold">הסבר אפשרי: </strong>{item.hypothesis}</p> : null}
        {sources.map(source => <p key={source.key}><strong className="font-semibold">{source.label}: </strong>{source.status === "missing" ? "אין נתונים" : <>
          {checkedDate(source.period.start) || "תקופה לא ידועה"} עד {checkedDate(source.period.end) || "תקופה לא ידועה"}{" · "}
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
