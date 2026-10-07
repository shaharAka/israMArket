import Link from "next/link";
import type { SourceReadiness, MetaSourceReadiness } from "@/lib/api";
import { dateRange, dayMonth } from "@/lib/dates";
import { IconChevron } from "@/lib/icons";

/** The row's ask when it is the recommended connection: the standard filled primary. */
const PRIMARY_ACTION =
  "drawn-button inline-flex min-h-11 items-center justify-center bg-[var(--primary)] px-5 text-[14px] text-white enabled:hover:bg-[var(--primary-dark)]";
const TEXT_ACTION =
  "inline-flex min-h-11 items-center text-[14px] font-semibold text-[color:var(--primary)] hover:underline hover:underline-offset-4";

export function sourcePresentation(state?: SourceReadiness | MetaSourceReadiness | null, checking = false) {
  const status = checking ? "reading" : state?.status;
  const label = {
    choose_property: "נשאר לבחור אתר", no_properties: "לא נמצאו אתרים", unchecked: "עוד לא נבדק",
    reading: "בודקים נתונים", ready: "יש נתונים", empty: "עוד אין פעילות",
    reconnect: "צריך לחדש גישה", unavailable: "הקריאה לא הושלמה",
    choose_assets: "נשאר לבחור חשבון", no_assets: "לא נמצאו חשבונות", partial: "יש נתונים חלקיים",
    permission: "צריך לאשר גישה", link_instagram: "נשאר לקשר אינסטגרם",
  }[status || "unchecked"];
  return { label, tone: status === "ready" ? "good" as const : "waiting" as const };
}

export function checkedDate(value?: string | null) {
  if (!value) return "";
  const instant = new Date(/^\d{4}-\d\d-\d\d$/.test(value) ? `${value}T00:00:00Z` : /Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(instant.valueOf()) ? "" : instant.toLocaleDateString("he-IL");
}

/** Actual source state; the design workshop reuses the same presentation. */
export function SourceReadState({ state, checking = false, onRetry, onReconnect, primary = false, resultsHref = "/performance", provider = "ga4" }: {
  state: SourceReadiness | MetaSourceReadiness;
  provider?: "ga4" | "meta";
  checking?: boolean;
  onRetry: () => void;
  onReconnect: () => void;
  primary?: boolean;
  resultsHref?: string;
}) {
  const status = checking ? "reading" : state.status;
  // Hide the legacy fixture caption, keeping provider errors and measurement limits intact.
  const note = state.note_he === "נתונים לדוגמה בלבד, ללא קריאה מחשבון אמיתי." ? "" : state.note_he;
  const date = checkedDate(state.last_success_at);
  const sections = provider === "meta" ? (state as MetaSourceReadiness).sections : undefined;
  const renew = ["reconnect", "no_properties", "no_assets", "permission", "link_instagram"].includes(status) ||
    (status === "partial" && Object.values(sections || {}).some(row => ["reconnect", "permission", "link_instagram"].includes(row.recovery_status || row.status)));
  const retry = ["unchecked", "unavailable", "empty", "partial"].includes(status) && !renew;
  // Full width, also inside the Meta row's start-aligned grid, so the expand's rule spans the card.
  return <div className="mt-4 w-full space-y-2">
    {checking || note ? <p role="status" aria-live="polite" className="max-w-[42em] text-[14px] leading-6 text-[color:var(--ink-soft)]">
      {checking ? provider === "meta" ? "קוראים את נתוני פייסבוק ואינסטגרם. אפשר להמשיך לעבוד בתוכנית." : "בודקים את נתוני האתר. אפשר להמשיך לעבוד על התוכנית." : note}
    </p> : null}
    {state.period?.start && state.period.end && (provider !== "meta" || ["ready", "empty"].includes(sections?.ads?.status || "")) ? <p className="text-[12px] tabular-nums text-[color:var(--ink-muted)]">
      {provider === "meta" ? "תקופת המודעות" : "התקופה שנקראה"}: <bdi>{dateRange(state.period.start, state.period.end)}</bdi>{date ? <> · נקראה ב־<bdi>{dayMonth(state.last_success_at)}</bdi></> : null}
    </p> : date ? <p className="text-[12px] text-[color:var(--ink-muted)]">נקרא ב־{date}</p> : null}
    {date && (["unavailable", "reconnect", "permission"].includes(status) || (status === "partial" && Object.values(sections || {}).some(row => row.retained_at))) ? <p className="text-[12px] leading-5 text-[color:var(--ink-muted)]">הנתונים מהקריאה הקודמת נשארו בתוצאות, עם התאריך שלהם.</p> : null}
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {retry || renew ? <button type="button" onClick={renew ? onReconnect : onRetry} disabled={checking}
        className={primary ? PRIMARY_ACTION : TEXT_ACTION}>
        {renew ? provider === "meta" ? "לבדוק ולחדש את הגישה בפייסבוק" : "לחבר מחדש עם גוגל" : status === "empty" ? "לבדוק שוב את הנתונים" : "לנסות לקרוא את הנתונים"}
      </button> : null}
      {["ready", "empty", "partial"].includes(status) ? <Link href={resultsHref} className={TEXT_ACTION}>לראות את התוצאות</Link> : null}
    </div>
    {sections && <details className="group/read border-t border-[var(--rule)] pt-2 text-[13px] leading-6 text-[color:var(--ink-soft)]">
      {/* The standard disclosure: down when closed, up when open (DESIGN-STANDARD §4). */}
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">מה נקרא, ומה צריך לבדוק?<IconChevron className="h-4 w-4 shrink-0 -rotate-90 text-[color:var(--ink-muted)] transition-transform duration-200 ease-[cubic-bezier(.2,.7,.2,1)] group-open/read:rotate-90 motion-reduce:transition-none" /></summary>
      <div className="space-y-3 py-2">{Object.entries(sections).map(([key, section]) => <p key={key}><strong>{({ social: "החשבון והפוסטים", ads: "המודעות", tracking: "המעקב באתר" } as Record<string, string>)[key] || key}: </strong>{section.note_he || sourcePresentation({ status: section.status as MetaSourceReadiness["status"], note_he: "" }).label}{section.retained_at ? ` המספרים נשמרו מקריאה ב־${checkedDate(section.retained_at)}.` : ""}</p>)}
      <p>המספרים בכל פוסט מצטברים מאז פרסומו; הם אינם סיכום של התקופה. אישור אירועים מהאתר אינו אישור לפניות או לרכישות.</p></div>
    </details>}
  </div>;
}
