"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { CARD, FIELD, LABEL, LIST_ROW, TEXT_ACTION } from "@/components/account/setupStyles";
import { SetupNotice } from "@/components/account/SetupNotice";
import { UIAction } from "@/components/design/Controls";
import { Conversation } from "@/components/support/Conversation";
import { ApiError, isDemo } from "@/lib/api";
import { CONTACT_EMAIL } from "@/lib/company";
import { BrandMark } from "@/lib/icons";
import { support, SUPPORT_CATEGORIES, SUPPORT_STATUS, type Ticket } from "@/lib/support";

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("other");
  const [human, setHuman] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signin, setSignin] = useState(false);
  const ref = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    if (isDemo()) { void Promise.resolve().then(() => { if (active) setSignin(true); }); return () => { active = false; }; }
    support.mine().then(data => { if (active) setTickets(data.tickets); }).catch((err: unknown) => {
      if (!active) return;
      if (err instanceof ApiError && err.status === 401) setSignin(true);
      else setError(err instanceof Error ? err.message : "לא הצלחנו לטעון את הפניות.");
    });
    return () => { active = false; };
  }, []);
  function changed(next: Ticket) {
    setSelected(next);
    setTickets(rows => [next, ...(rows || []).filter(row => row.id !== next.id)]);
  }
  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); ref.current ??= crypto.randomUUID();
    try { changed(await support.create({ body, category, human, client_ref: ref.current })); setBody(""); ref.current = null; }
    catch (err) { setError(err instanceof Error ? err.message : "לא הצלחנו לשמור את הפנייה. הטקסט נשאר כאן."); }
    finally { setBusy(false); }
  }
  const content = <div className="mx-auto max-w-[760px]">
    <PageHeader title="אנחנו כאן לעזור" subtitle="משהו לא עובד, או לא ברור? כתבו לנו כאן." />
    {error ? <div className="mb-5"><SetupNotice tone="error" title={error} /></div> : null}
    {signin ? <div className={`${CARD} space-y-4 p-6`}>
      <p>כדי לשמור פנייה ולעקוב אחרי התשובה, צריך להתחבר.</p>
      <Link href="/login?next=%2Fsupport" className={TEXT_ACTION}>להיכנס לחשבון</Link>
    </div> : selected ? <>
      <button className={`${TEXT_ACTION} mb-4`} onClick={() => setSelected(null)}>לכל הפניות ולפנייה חדשה</button>
      <Conversation key={selected.id} ticket={selected} onChange={changed} />
    </> : <>
      <form onSubmit={send} className={`${CARD} space-y-5 p-5 sm:p-7`}>
        <div><label htmlFor="support-category" className={LABEL}>במה צריך עזרה?</label>
          <select id="support-category" className={FIELD} value={category} onChange={e => { setCategory(e.target.value); ref.current = null; }}>
            {Object.entries(SUPPORT_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div><label htmlFor="support-body" className={LABEL}>מה קרה?</label>
          <textarea id="support-body" className={`${FIELD} min-h-32 resize-y`} placeholder="מה ניסיתם לעשות, ומה הופיע במקום?" minLength={5} maxLength={3000} required value={body} onChange={e => { setBody(e.target.value); ref.current = null; }} aria-describedby="support-privacy" />
          <p id="support-privacy" className="mt-2 text-[12px] leading-5 text-[color:var(--ink-muted)]">אל תשלחו סיסמאות, קודי כניסה או פרטי כרטיס.</p>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-[14px] text-[color:var(--ink-soft)]"><input type="checkbox" checked={human} onChange={e => { setHuman(e.target.checked); ref.current = null; }} /> רק צוות התמיכה, בלי עזרה מ-AI</label>
        {!human ? <p className="text-[12px] leading-5 text-[color:var(--ink-muted)]">הטקסט שתשלחו ייבדק באמצעות AI של גוגל. אם אין תשובה מועילה, הפנייה מחכה לצוות.</p> : null}
        <UIAction type="submit" busy={busy} disabled={body.trim().length < 5 || tickets === null} busyLabel="שומרים את הפנייה…">לשלוח פנייה</UIAction>
        {tickets === null && !error ? <p role="status" className="text-[13px]">טוענים את הפניות…</p> : null}
      </form>
      {tickets && tickets.length > 0 ? <section className="mt-8"><h2 className="mb-3 text-[18px] font-bold">הפניות שלכם</h2>
        <ul className={`${CARD} divide-y divide-[var(--rule)]`}>{tickets.map(ticket => <li key={ticket.id}>
          <button className={`${LIST_ROW} justify-between`} onClick={() => setSelected(ticket)}>
            <span className="min-w-0 truncate text-[15px]">{ticket.messages[0]?.body.slice(0, 80)}</span><span className="shrink-0 text-[12px] text-[color:var(--ink-muted)]">{SUPPORT_STATUS[ticket.status]}</span>
          </button>
        </li>)}</ul>
      </section> : null}
    </>}
    <p className="mt-8 text-[13px] text-[color:var(--ink-soft)]">אפשר גם <a className={TEXT_ACTION} href={`mailto:${CONTACT_EMAIL}`}>לכתוב לנו במייל</a>. התשובות לפניות כאן נשמרות באפליקציה.</p>
  </div>;
  // A person who cannot sign in still sees the email fallback. Do not mount the app's
  // authenticated shell before the support read confirms the session.
  return signin || tickets === null ? <div className="app-blue min-h-screen bg-[var(--canvas)] p-5 text-[color:var(--ink)] sm:p-8">
    <Link href="/" className="mb-8 inline-flex min-h-11 items-center gap-2 font-bold"><BrandMark className="h-7 w-7" /> ישראמארקט</Link>
    {content}
  </div> : <AppShell>{content}</AppShell>;
}
