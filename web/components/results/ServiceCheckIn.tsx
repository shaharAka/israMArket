"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/AppShell";
import { ApiError, endpoints, type ServiceReport, type ServiceReportInput, type ServiceResultsPayload } from "@/lib/api";

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(month: string) {
  const [year, number] = month.split("-").map(Number);
  return new Date(year, number - 1, 1).toLocaleDateString("he-IL", { month: "long", year: "numeric" });
}
function draftOf(report: ServiceReport | null, month = currentMonth()): ServiceReportInput {
  return { month: report?.month || month, revision: report?.revision ?? null,
    inquiries: report?.inquiries ?? null, suitable: report?.suitable ?? null, clients_won: report?.clients_won ?? null,
    capacity: report?.capacity ?? null, fit_criterion: report?.fit_criterion || "" };
}

/** Owner facts lead; explanation and optional correction stay inside the check-in. */
export function ServiceCheckIn({ data, loadError, primary, onSaved, onEditing, onRecommend, recommending }: {
  data: ServiceResultsPayload | null; loadError: string; primary: boolean;
  onSaved: (data: ServiceResultsPayload) => void; onEditing: (editing: boolean) => void;
  onRecommend: () => void; recommending: boolean;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ServiceReportInput>(draftOf(null));
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [concurrentReport, setConcurrentReport] = useState<ServiceReport | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveNote, setSaveNote] = useState("");
  if (!data?.enabled && !loadError) return null;
  const report = data?.report ?? null;
  const activeMonth = currentMonth();

  function open() {
    setDraft(draftOf(report)); setDirty(false); setError(""); setConflict(false); setConcurrentReport(null);
    setEditing(true); onEditing(true); setSaved(false); setSaveNote("");
  }
  function close() { setEditing(false); onEditing(false); setError(""); setConflict(false); }
  async function selectMonth(month: string) {
    setPending(true); setError("");
    try {
      const selected = await endpoints.serviceResults(month);
      setDraft(draftOf(selected.report, month)); setDirty(false); setConflict(false);
    } catch (err) { setError(err instanceof Error ? err.message : "לא הצלחנו לטעון את החודש. נסו שוב."); }
    finally { setPending(false); }
  }
  function change(key: keyof ServiceReportInput, value: string | number | null) {
    setDraft(previous => ({ ...previous, [key]: value })); setDirty(true); setSaved(false);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setError(""); setConflict(false);
    if (draft.suitable !== null && (draft.inquiries === null || draft.suitable > draft.inquiries)) {
      setError("פניות מתאימות הן חלק מהפניות שהתקבלו. בדקו את שני המספרים."); return;
    }
    if (draft.suitable !== null && !draft.fit_criterion.trim()) {
      setError("כתבו בקצרה איזו פנייה מתאימה לכם."); return;
    }
    setPending(true);
    try {
      const persisted = await endpoints.saveServiceResults(draft);
      setDraft(draftOf(persisted.report, draft.month));
      // The current-month result remains the page's latest evidence when an older month
      // was corrected. Re-read it instead of showing old counts as current outcomes.
      let latest = report && report.month > draft.month ? data! : persisted;
      try { latest = await endpoints.serviceResults(); }
      catch { setSaveNote("הדיווח נשמר, אך לא הצלחנו לרענן את כל הדיווחים. רעננו את העמוד לפני הכנת הצעה."); }
      onSaved(latest); setSaved(true); close();
    } catch (err) {
      setConflict(err instanceof ApiError && err.status === 409);
      setError(err instanceof Error ? err.message : "לא הצלחנו לשמור. המספרים נשארו כאן; נסו שוב.");
    } finally { setPending(false); }
  }
  async function reloadRevision() {
    setPending(true);
    try {
      const latest = await endpoints.serviceResults(draft.month);
      // Keep the typed answers for comparison; the owner must explicitly save again.
      setDraft(previous => ({ ...previous, revision: latest.report?.revision ?? null }));
      setConcurrentReport(latest.report);
      setConflict(false); setError("נטען הדיווח העדכני. בדקו את המספרים שלכם לפני שמירה נוספת.");
    } catch (err) { setError(err instanceof Error ? err.message : "לא הצלחנו לטעון מחדש. נסו שוב."); }
    finally { setPending(false); }
  }
  const inputClass = "mt-1 min-h-12 w-full rounded-md border border-[var(--rule-dark)] bg-[var(--paper)] px-3 text-[15px] tabular-nums text-[color:var(--ink)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-soft)]";
  function count(key: "inquiries" | "suitable" | "clients_won" | "capacity", label: string) {
    return <label className="block text-[13px] font-medium text-[color:var(--ink-soft)]">
      {label}<input type="number" min={0} max={100000} step={1} value={draft[key] ?? ""} disabled={pending}
        placeholder="לא יודעים? השאירו ריק" className={inputClass}
        onChange={event => change(key, event.target.value === "" ? null : Number(event.target.value))} />
    </label>;
  }
  return <section aria-labelledby={`${id}-title`} className="paper p-5 sm:p-6">
    <div className="flex items-center justify-between gap-4">
      <h2 id={`${id}-title`} className="text-[18px] font-bold tracking-tight text-[color:var(--ink)]">פניות ולקוחות</h2>
      {report && !editing ? <button onClick={open} className="min-h-11 min-w-11 px-2 text-[14px] font-semibold text-[color:var(--primary)] hover:underline">לעדכן</button> : null}
    </div>
    {loadError ? <p role="alert" className="mt-3 text-[14px] text-[color:var(--danger)]">{loadError}</p> : null}
    {editing ? <form onSubmit={save} className="mt-4 space-y-4">
      <label className="block max-w-xs text-[13px] font-medium text-[color:var(--ink-soft)]">חודש הדיווח
        <input type="month" min="2000-01" max={activeMonth} value={draft.month} disabled={pending || dirty} required className={inputClass}
          onChange={event => { if (event.target.value) void selectMonth(event.target.value); }} />
      </label>
      <p className="text-[13px] leading-6 text-[color:var(--ink-muted)]">ספירות מכל המקורות, לפי מה שאתם יודעים. ריק פירושו לא ידוע; 0 פירושו שלא היו.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {count("inquiries", "כמה פניות התקבלו?")}
        {count("suitable", "כמה מהן התאימו לכם?")}
      </div>
      <label className="block text-[13px] font-medium text-[color:var(--ink-soft)]">איזו פנייה מתאימה לכם?
        <input value={draft.fit_criterion} maxLength={300} disabled={pending} required={draft.suitable !== null} className={inputClass}
          placeholder="סוג העבודה, האזור או התקציב שמתאימים לכם" onChange={event => change("fit_criterion", event.target.value)} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        {count("clients_won", "כמה לקוחות חדשים סגרו איתכם?")}
        {draft.month === activeMonth ? count("capacity", "כמה לקוחות נוספים תוכלו לקבל עכשיו?") : null}
      </div>
      <p className="text-[13px] leading-6 text-[color:var(--ink-muted)]">לקוחות שסגרו החודש יכולים להגיע מפניות של חודש קודם. הדיווח לא משויך לפוסט מסוים.</p>
      {error ? <p role="alert" className="text-[14px] leading-6 text-[color:var(--danger)]">{error}</p> : null}
      {concurrentReport ? <p className="rounded-md bg-[var(--soft)] p-3 text-[13px] leading-6 text-[color:var(--ink-soft)]">
        בדיווח שנשמר בחלון האחר: {concurrentReport.inquiries ?? "לא ידוע"} פניות, {concurrentReport.suitable ?? "לא ידוע"} מתאימות,
        {" "}{concurrentReport.clients_won ?? "לא ידוע"} לקוחות חדשים. מקום פנוי: {concurrentReport.capacity ?? "לא ידוע"}.
        {concurrentReport.fit_criterion ? ` ההגדרה: ${concurrentReport.fit_criterion}.` : ""} שמירה נוספת תחליף אותו במספרים שבטופס שלכם.
      </p> : null}
      {conflict ? <button type="button" disabled={pending} onClick={reloadRevision} className="min-h-11 text-[14px] font-semibold text-[color:var(--primary)]">לטעון את הדיווח העדכני</button> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || conflict} tone="primary">{pending ? "שומרים…" : "לשמור את הדיווח"}</Button>
        <Button type="button" disabled={pending} onClick={close} tone="secondary">לבטל</Button>
      </div>
    </form> : report ? <>
      <p className="mt-1 text-[13px] text-[color:var(--ink-muted)]">{monthLabel(report.month)} · לפי הדיווח שלכם</p>
      <dl className="mt-5 grid grid-cols-3 gap-3">
        {([ ["פניות", report.inquiries], ["מתוכן מתאימות", report.suitable], ["לקוחות חדשים", report.clients_won] ] as const).map(([label, value]) => <div key={label}>
          <dt className="text-[12px] font-medium text-[color:var(--ink-muted)]">{label}</dt>
          <dd className={`${value === null ? "text-[14px] font-medium" : "text-[28px] font-bold tabular-nums"} mt-1 tracking-tight text-[color:var(--ink)]`}>{value === null ? "לא ידוע" : value.toLocaleString("he-IL")}</dd>
        </div>)}
      </dl>
      <p className="mt-4 text-[13px] leading-6 text-[color:var(--ink-soft)]">{report.capacity !== null
        ? report.capacity === 0 ? "אין מקום ללקוחות נוספים כרגע. נתאים את ההצעה גם לזה." : `לפי הדיווח: מקום לעוד ${report.capacity.toLocaleString("he-IL")} לקוחות עכשיו.`
        : report.capacity_outdated ? "המקום הפנוי דווח בעבר. כדאי לעדכן מה אפשר לקבל עכשיו." : "עוד לא עדכנתם כמה לקוחות נוספים אפשר לקבל."}</p>
      <p className="mt-1 text-[12px] leading-6 text-[color:var(--ink-muted)]">הספירות אינן שיעור סגירה ולא מוכיחות איזה פוסט הביא לקוח.</p>
      {saved ? <p role="status" className="mt-2 text-[13px] text-[color:var(--good)]">הדיווח נשמר. אפשר להכין ממנו הצעה עדכנית לתוכנית.</p> : null}
      {saveNote ? <p role="status" className="mt-2 text-[13px] text-[color:var(--ink-soft)]">{saveNote}</p> : null}
      <Button onClick={onRecommend} disabled={recommending || Boolean(saveNote)} tone={primary ? "primary" : "secondary"} className="mt-4">{recommending ? "מכינים הצעה…" : "לקבל הצעה לתוכנית"}</Button>
    </> : <>
      <p className="mt-2 max-w-lg text-[15px] leading-7 text-[color:var(--ink-soft)]">אילו פניות התאימו לכם, וכמה לקוחות סגרו? העדכון שלכם יעזור לבחור מה לשנות בתוכנית, גם בלי חיבורים.</p>
      <Button onClick={open} disabled={!data} tone={primary ? "primary" : "secondary"} className="mt-4">לעדכן פניות ולקוחות</Button>
    </>}
  </section>;
}
