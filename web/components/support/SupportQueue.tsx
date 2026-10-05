"use client";

import { useEffect, useState } from "react";
import { CARD, FIELD, LABEL, LIST_ROW, TEXT_ACTION } from "@/components/account/setupStyles";
import { Conversation } from "@/components/support/Conversation";
import { SetupNotice } from "@/components/account/SetupNotice";
import { support, SUPPORT_STATUS, type Ticket } from "@/lib/support";

export function SupportQueue() {
  const [rows, setRows] = useState<Ticket[] | null>(null);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [status, setStatus] = useState("active");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    support.queue(status).then(data => { if (active) { setRows(data.tickets); setError(""); } }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "לא הצלחנו לטעון את הפניות."); });
    return () => { active = false; };
  }, [status, version]);
  function changed(next: Ticket) { setSelected(next); setVersion(v => v + 1); }
  return <div>
    <div className="mb-5 flex flex-wrap items-end gap-4">
      <div className="min-w-48"><label htmlFor="support-filter" className={LABEL}>פניות</label><select id="support-filter" className={FIELD} value={status} onChange={e => setStatus(e.target.value)}>
        <option value="active">כל הפניות הפתוחות</option><option value="open">מחכות לצוות</option><option value="waiting">הצוות ענה</option><option value="resolved">נסגרו</option><option value="all">כולן</option>
      </select></div>
      <button className={TEXT_ACTION} onClick={() => setVersion(v => v + 1)}>לרענן את הפניות</button>
    </div>
    {error ? <SetupNotice tone="error" title={error} /> : null}
    {selected ? <><button className={`${TEXT_ACTION} mb-3`} onClick={() => setSelected(null)}>לכל הפניות</button><Conversation key={selected.id} ticket={selected} admin onChange={changed} /></> :
      rows === null ? <p role="status">טוענים את הפניות…</p> : rows.length === 0 ? <p className={`${CARD} p-7`}>אין פניות בתצוגה הזו.</p> :
      <ul className={`${CARD} divide-y divide-[var(--rule)]`}>{rows.map(ticket => <li key={ticket.id}><button className={`${LIST_ROW} flex-wrap justify-between`} onClick={() => setSelected(ticket)}>
        <span className="min-w-0"><span className="block text-[15px]">{ticket.messages[0]?.body.slice(0, 100)}</span><span dir="ltr" className="text-[12px] text-[color:var(--ink-muted)]">{ticket.email}</span></span>
        <span className="text-[13px]">{SUPPORT_STATUS[ticket.status]}</span>
      </button></li>)}</ul>}
  </div>;
}
