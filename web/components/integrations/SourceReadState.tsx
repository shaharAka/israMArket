import Link from "next/link";
import type { SourceReadiness } from "@/lib/api";

export function sourcePresentation(state?: SourceReadiness | null, checking = false) {
  const status = checking ? "reading" : state?.status;
  const label = {
    choose_property: "נשאר לבחור אתר", no_properties: "לא נמצאו אתרים", unchecked: "עוד לא נבדק",
    reading: "בודקים נתונים", ready: "יש נתונים", empty: "עוד אין פעילות",
    reconnect: "צריך לחדש גישה", unavailable: "הקריאה לא הושלמה",
  }[status || "unchecked"];
  return { label, tone: status === "ready" ? "good" as const : "waiting" as const };
}

export function checkedDate(value?: string | null) {
  if (!value) return "";
  const instant = new Date(/^\d{4}-\d\d-\d\d$/.test(value) ? `${value}T00:00:00Z` : /Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(instant.valueOf()) ? "" : instant.toLocaleDateString("he-IL");
}

/** Actual source state; the design workshop reuses this with labeled synthetic examples. */
export function SourceReadState({ state, checking = false, onRetry, onReconnect, primary = false, resultsHref = "/performance" }: {
  state: SourceReadiness;
  checking?: boolean;
  onRetry: () => void;
  onReconnect: () => void;
  primary?: boolean;
  resultsHref?: string;
}) {
  const status = checking ? "reading" : state.status;
  const date = checkedDate(state.last_success_at);
  const retry = ["unchecked", "unavailable", "empty"].includes(status);
  const renew = ["reconnect", "no_properties"].includes(status);
  return <div className="mt-4 space-y-2">
    <p role="status" aria-live="polite" className="max-w-[42em] text-[14px] leading-6 text-[color:var(--ink-soft)]">
      {checking ? "בודקים את נתוני האתר. אפשר להמשיך לעבוד על התוכנית." : state.note_he}
    </p>
    {state.period?.start && state.period.end ? <p className="text-[12px] tabular-nums text-[color:var(--ink-muted)]">
      התקופה שנקראה: <bdi>{checkedDate(state.period.start)}–{checkedDate(state.period.end)}</bdi>{date ? ` · נקראה ב־${date}` : ""}
    </p> : null}
    {date && ["unavailable", "reconnect"].includes(status) ? <p className="text-[12px] leading-5 text-[color:var(--ink-muted)]">הנתונים מהקריאה הקודמת נשארו בתוצאות.</p> : null}
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {retry || renew ? <button type="button" onClick={renew ? onReconnect : onRetry} disabled={checking}
        className={primary ? "drawn-button min-h-11 px-4 py-2 text-[14px]" : "inline-flex min-h-11 items-center text-[14px] font-semibold text-[color:var(--primary)] hover:underline hover:underline-offset-4"}>
        {renew ? "לחבר מחדש עם גוגל" : status === "empty" ? "לבדוק שוב את הנתונים" : "לנסות לקרוא את הנתונים"}
      </button> : null}
      {["ready", "empty"].includes(status) ? <Link href={resultsHref} className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[color:var(--primary)] hover:underline hover:underline-offset-4">לראות את התוצאות</Link> : null}
    </div>
  </div>;
}
