import Link from "next/link";
import type { ReactNode } from "react";
import type { PerformancePayload } from "@/lib/api";
import { checkedDate } from "./SourceReadState";

/** Reading numbers and interpreting them are separate operations. */
export function SourceDataNotice({ payload }: { payload: PerformancePayload }) {
  const source = payload.sources?.ga4;
  const analysis = payload.diagnostic?.analysis_status;
  const metaSource = payload.sources?.meta;
  const metaSelectionChanged = Boolean(metaSource?.selection && payload.meta?.source_selection &&
    Object.entries(metaSource.selection).some(([key, value]) => payload.meta.source_selection?.[key as keyof typeof metaSource.selection] !== value));
  const metaNote = metaSelectionChanged ? "נבחר חשבון אחר. הנתונים המוצגים נשמרו מהחשבון הקודם, עד שתושלם הקריאה החדשה."
    : metaSource && metaSource.status !== "ready" ? metaSource.note_he : "";
  const previousSite = Boolean(source?.property_id && payload.ga4?.property_id &&
    source.property_id.replace("properties/", "") !== payload.ga4.property_id.replace("properties/", ""));
  const emptyWithOlderData = source?.status === "empty" && payload.available !== false &&
    source.period?.end !== payload.period_end;
  const sourceNote = previousSite ? "נבחר אתר אחר, אבל עוד לא התקבלו הנתונים שלו. המספרים המוצגים שייכים לאתר שנקרא קודם."
    : emptyWithOlderData ? "בבדיקה האחרונה לא נמצאו נתונים לתקופה. המספרים המוצגים נשמרו מהקריאה הקודמת."
    : source && source.status !== "ready" ? source.note_he : "";
  const analysisNote = analysis === "pending" ? "הנתונים כבר כאן. מכינים מהם תובנה והצעה לתוכנית; הן יופיעו כאן אוטומטית."
    : analysis === "unavailable" ? "הנתונים נשמרו, אבל הניתוח לא הושלם. אפשר לעבוד בתוכנית ולנסות לרענן בהמשך."
    : analysis === "paused" ? "הנתונים זמינים. כדי להכין מהם הצעה חדשה לתוכנית, צריך מנוי פעיל." : "";
  const metaDate = checkedDate(payload.meta?.source_read_at);
  const siteDate = checkedDate(payload.ga4?.read_at);
  const siteOlder = Boolean(metaDate && siteDate && (payload.ga4.read_at || "") < (payload.meta.source_read_at || ""));
  const metaOlder = Boolean(metaDate && siteDate && (payload.meta.source_read_at || "") < (payload.ga4.read_at || ""));
  const retained = Object.entries(metaSource?.sections || {}).filter(([, section]) => section.retained_at);
  if (!sourceNote && !metaNote && !analysisNote && !metaOlder && !siteOlder && !retained.length) return null;
  return <aside aria-label="עדכניות הנתונים" className="space-y-2 rounded-xl bg-[var(--soft)] p-4 text-[14px] leading-6 text-[color:var(--ink-soft)]">
    {sourceNote ? <Note>{sourceNote}{" "}<Link href="/integrations" className="font-semibold text-[color:var(--primary)] hover:underline hover:underline-offset-4">לבדוק את החיבור</Link></Note> : null}
    {metaNote ? <Note>{metaNote}{" "}<Link href="/integrations?source=meta" className="font-semibold text-[color:var(--primary)] hover:underline hover:underline-offset-4">לבדוק את החיבור לפייסבוק ואינסטגרם</Link></Note> : null}
    {analysisNote ? <Note waiting={analysis === "pending"}>{analysisNote}</Note> : null}
    {metaOlder ? <Note small>נתוני פייסבוק ואינסטגרם נשמרו מקריאה ב־{metaDate}; הם לא רועננו יחד עם נתוני האתר.</Note> : null}
    {siteOlder ? <Note small>נתוני האתר נשמרו מקריאה ב־{siteDate}; הם לא רועננו יחד עם פייסבוק ואינסטגרם.</Note> : null}
    {retained.map(([key, section]) => <Note key={key} small>{key === "ads" ? "נתוני המודעות" : "נתוני החשבון והפוסטים"} נשמרו מקריאה ב־{checkedDate(section.retained_at)}; הקריאה האחרונה שלהם לא הושלמה.</Note>)}
  </aside>;
}

/**
 * One notice line, led by the sun dot (words first, the dot beside them). While the analysis
 * is still being prepared the dot pulses: the one thing on the page that is waiting. It holds
 * still under reduced motion.
 */
function Note({ children, small = false, waiting = false }: { children: ReactNode; small?: boolean; waiting?: boolean }) {
  return <p className={`flex items-start gap-2.5 ${small ? "text-[12px] leading-5 text-[color:var(--ink-muted)]" : ""}`}>
    <span aria-hidden className={`${small ? "mt-[7px] h-1.5 w-1.5" : "mt-2 h-2 w-2"} shrink-0 rounded-full bg-[var(--sun)] ${waiting ? "animate-pulse motion-reduce:animate-none" : ""}`} />
    <span className="min-w-0">{children}</span>
  </p>;
}
