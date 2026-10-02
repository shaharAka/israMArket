import Link from "next/link";
import type { PerformancePayload } from "@/lib/api";
import { checkedDate } from "./SourceReadState";

/** Reading numbers and interpreting them are separate operations. */
export function SourceDataNotice({ payload }: { payload: PerformancePayload }) {
  const source = payload.sources?.ga4;
  const analysis = payload.diagnostic?.analysis_status;
  const previousSite = Boolean(source?.property_id && payload.ga4?.property_id &&
    source.property_id.replace("properties/", "") !== payload.ga4.property_id.replace("properties/", ""));
  const emptyWithOlderData = source?.status === "empty" && payload.available !== false &&
    source.period?.end !== payload.period_end;
  const sourceNote = previousSite ? "נבחר אתר אחר, אבל עוד לא התקבלו הנתונים שלו. המספרים המוצגים שייכים לאתר שנקרא קודם."
    : emptyWithOlderData ? "בבדיקה האחרונה לא נמצאו נתונים לתקופה. המספרים המוצגים נשמרו מהקריאה הקודמת."
    : source && source.status !== "ready" ? source.note_he : "";
  const analysisNote = analysis === "pending" ? "נתוני האתר זמינים. הניתוח עוד לא הושלם; רענון הנתונים ינסה להכין ממנו המלצה לתוכנית."
    : analysis === "unavailable" ? "הנתונים נשמרו, אבל הניתוח לא הושלם. אפשר לעבוד בתוכנית ולנסות לרענן בהמשך." : "";
  const metaDate = checkedDate(payload.meta?.source_read_at);
  if (!sourceNote && !analysisNote && !metaDate) return null;
  return <aside aria-label="עדכניות הנתונים" className="space-y-2 rounded-xl bg-[var(--soft)] p-4 text-[14px] leading-6 text-[color:var(--ink-soft)]">
    {sourceNote ? <p>{sourceNote}{" "}<Link href="/integrations" className="font-semibold text-[color:var(--primary)] hover:underline hover:underline-offset-4">לבדוק את החיבור</Link></p> : null}
    {analysisNote ? <p>{analysisNote}</p> : null}
    {metaDate ? <p className="text-[12px] text-[color:var(--ink-muted)]">נתוני פייסבוק ואינסטגרם נשמרו מקריאה ב־{metaDate}; הם לא רועננו יחד עם נתוני האתר.</p> : null}
  </aside>;
}
