"use client";

import { useEffect, useRef, useState } from "react";
import { CARD, FIELD, LABEL, TEXT_ACTION } from "@/components/account/setupStyles";
import { SetupNotice } from "@/components/account/SetupNotice";
import { UIAction } from "@/components/design/Controls";
import { formatDateTime } from "@/lib/admin";
import { support, SUPPORT_STATUS, type Ticket } from "@/lib/support";

export function Conversation({ ticket, admin = false, onChange }: { ticket: Ticket; admin?: boolean; onChange: (next: Ticket) => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<string | null>(null);
  const callback = useRef(onChange);
  useEffect(() => { callback.current = onChange; }, [onChange]);
  // Only poll a saved AI job. No model work runs on page open or on a GET.
  useEffect(() => {
    if (admin || !["pending", "running"].includes(ticket.ai_status)) return;
    let active = true;
    const timer = window.setInterval(() => {
      support.detail(ticket.id).then(next => { if (active) callback.current(next); }).catch(() => undefined);
    }, 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [ticket.id, ticket.ai_status, admin]);

  async function reply(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    ref.current ??= crypto.randomUUID();
    try { onChange(await support.reply(ticket.id, body, ref.current, admin)); setBody(""); ref.current = null; }
    catch (err) { setError(err instanceof Error ? err.message : "לא הצלחנו לשלוח. הטקסט נשאר כאן."); }
    finally { setBusy(false); }
  }
  async function state(status: string) {
    setBusy(true); setError("");
    try { onChange(await support.state(ticket.id, status, admin)); }
    catch (err) { setError(err instanceof Error ? err.message : "לא הצלחנו לעדכן את הפנייה."); }
    finally { setBusy(false); }
  }

  return <section aria-label="השיחה עם התמיכה" className={`${CARD} p-5 sm:p-7`}>
    <header className="mb-5 flex flex-wrap items-start justify-between gap-2">
      <div><h2 className="text-[18px] font-bold">פנייה {ticket.id.slice(0, 6)}</h2>
        {admin && ticket.email ? <p dir="ltr" className="text-start text-[13px] text-[color:var(--ink-muted)]">{ticket.email}</p> : null}
      </div>
      <span role="status" className="text-[13px] font-medium text-[color:var(--ink-soft)]">{SUPPORT_STATUS[ticket.status]}</span>
    </header>
    <ol className="divide-y divide-[var(--rule)]">
      {ticket.messages.map(message => <li key={message.id} className="py-4 first:pt-0">
        <div className="mb-1 flex flex-wrap justify-between gap-2 text-[12px] text-[color:var(--ink-muted)]">
          <strong>{message.role === "user" ? (admin ? "מהלקוח" : "אתם") : message.role === "support" ? "צוות התמיכה" : "עזרה מהירה · AI"}</strong>
          <time dateTime={message.created_at}>{formatDateTime(message.created_at)}</time>
        </div>
        <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-[color:var(--ink-soft)]">{message.body}</p>
      </li>)}
    </ol>
    {["pending", "running"].includes(ticket.ai_status) ? <p role="status" className="mt-3 text-[14px] text-[color:var(--ink-soft)]">הפנייה נשמרה. בודקים אם אפשר להציע עזרה מהירה…</p> : null}
    {ticket.status === "suggested" ? <p className="mt-4 text-[13px] text-[color:var(--ink-muted)]">זו הצעה בלבד. אם היא לא עזרה, צוות התמיכה יכול להמשיך מכאן.</p> : null}
    {error ? <div className="mt-4"><SetupNotice tone="error" title={error} /></div> : null}
    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1">
      {ticket.status !== "resolved" ? <button className={TEXT_ACTION} disabled={busy} onClick={() => void state("resolved")}>{admin || ticket.status === "open" ? "לסגור את הפנייה" : "זה עזר, לסגור את הפנייה"}</button> :
        <button className={TEXT_ACTION} disabled={busy} onClick={() => void state("open")}>לפתוח מחדש</button>}
      {!admin && (ticket.status === "suggested" || ["pending", "running"].includes(ticket.ai_status)) ? <button className={TEXT_ACTION} disabled={busy} onClick={() => void state("open")}>לבקש עזרה מהצוות</button> : null}
    </div>
    {ticket.status !== "resolved" ? <form onSubmit={reply} className="mt-5 space-y-3">
      <label className={LABEL} htmlFor={`support-reply-${ticket.id}`}>{admin ? "תשובה ללקוח" : "להוסיף פרטים"}</label>
      <textarea id={`support-reply-${ticket.id}`} className={`${FIELD} min-h-24 resize-y`} maxLength={3000} required value={body} onChange={e => { setBody(e.target.value); ref.current = null; }} />
      <UIAction type="submit" busy={busy} disabled={!body.trim()} busyLabel="שולחים…">{admin ? "לשלוח תשובה" : "לשלוח הודעה"}</UIAction>
    </form> : null}
  </section>;
}
