"use client";

import { ProductWordmark } from "@/components/landing-v2/ProductWordmark";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { CARD, FIELD, LABEL, LIST_ROW, TEXT_ACTION } from "@/components/account/setupStyles";
import { SetupNotice } from "@/components/account/SetupNotice";
import { UIAction } from "@/components/design/Controls";
import { Conversation } from "@/components/support/Conversation";
import { ApiError, isDemo } from "@/lib/api";
import { CONTACT_EMAIL } from "@/lib/company";
import { support, SUPPORT_CATEGORIES, SUPPORT_STATUS, type Ticket } from "@/lib/support";
import { useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { withInterfaceLanguage } from "@/lib/authNavigation";

export default function SupportPage() {
  // Purpose: report the current problem and get a response. History is useful,
  // but its availability is never a prerequisite for sending a new report.
  const t = useCopy();
  const { locale } = useLanguage();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("other");
  const [human, setHuman] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signin, setSignin] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const revision = useRef(0);
  const ref = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    const beforeRead = revision.current;
    if (isDemo()) { void Promise.resolve().then(() => { if (active) { setSignin(true); setHistoryLoading(false); } }); return () => { active = false; }; }
    support.mine().then(data => {
      if (!active) return;
      // A late history response must not erase a report or reply saved meanwhile.
      setTickets(rows => revision.current === beforeRead ? data.tickets : [...(rows || []), ...data.tickets.filter(ticket => !rows?.some(row => row.id === ticket.id))]);
      setHistoryError(false);
    }).catch((err: unknown) => {
      if (!active) return;
      if (err instanceof ApiError && err.status === 401) setSignin(true);
      else setHistoryError(true);
    }).finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  function changed(next: Ticket) {
    revision.current++;
    setSelected(next);
    setTickets(rows => [next, ...(rows || []).filter(row => row.id !== next.id)]);
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy || signin || isDemo()) return;
    setBusy(true); setError(""); ref.current ??= crypto.randomUUID();
    try { changed(await support.create({ body, category, human, client_ref: ref.current })); setBody(""); ref.current = null; }
    catch (err) {
      if (err instanceof ApiError && err.status === 401) setSignin(true);
      else setError(err instanceof ApiError && (err.status === 422 || err.status === 429) ? err.message : "לא הצלחנו לשלוח את הפנייה. הטקסט נשאר כאן, אפשר לנסות שוב.");
    }
    finally { setBusy(false); }
  }
  const content = <div className="mx-auto max-w-[760px]">
    <PageHeader title={t("אנחנו כאן לעזור")} subtitle={t("מה ניסיתם לעשות, ומה לא הסתדר?")} />
    {error ? <div className="mb-5"><SetupNotice tone="error" title={t(error)} /></div> : null}
    {signin ? <div className={`${CARD} space-y-4 p-6`}>
      <p>{t("כדי לשמור פנייה ולעקוב אחרי התשובה, צריך להתחבר.")}</p>
      <Link href={withInterfaceLanguage("/login?next=%2Fsupport", locale)} className={TEXT_ACTION}>{t("להיכנס לחשבון")}</Link>
      {body ? <textarea aria-label={t("הטקסט שכתבתם לתמיכה")} className={`${FIELD} min-h-32`} readOnly value={body} onFocus={e => e.currentTarget.select()} /> : null}
    </div> : selected ? <>
      <button className={`${TEXT_ACTION} mb-4`} onClick={() => setSelected(null)}>{t("לכל הפניות ולפנייה חדשה")}</button>
      <Conversation key={selected.id} ticket={selected} onChange={changed} />
    </> : <>
      <form onSubmit={send} className={`${CARD} space-y-5 p-5 sm:p-7`}>
        <div><label htmlFor="support-category" className={LABEL}>{t("במה צריך עזרה?")}</label>
          <select id="support-category" className={FIELD} value={category} onChange={e => { setCategory(e.target.value); ref.current = null; }}>
            {Object.entries(SUPPORT_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
          </select>
        </div>
        <div><label htmlFor="support-body" className={LABEL}>{t("מה קרה?")}</label>
          <textarea id="support-body" className={`${FIELD} min-h-32 resize-y`} placeholder={t("מה ניסיתם לעשות, ומה הופיע במקום?")} minLength={5} maxLength={3000} required value={body} onChange={e => { setBody(e.target.value); ref.current = null; }} aria-describedby="support-privacy" />
          <p id="support-privacy" className="mt-2 text-[12px] leading-5 text-[color:var(--ink-muted)]">{t("אל תשלחו סיסמאות, קודי כניסה או פרטי כרטיס.")}</p>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-[14px] text-[color:var(--ink-soft)]"><input type="checkbox" checked={human} onChange={e => { setHuman(e.target.checked); ref.current = null; }} />{t("רק צוות התמיכה, בלי עזרה מ-AI")}</label>
        {!human ? <p className="text-[12px] leading-5 text-[color:var(--ink-muted)]">{t("הטקסט שתשלחו ייבדק באמצעות AI של גוגל. אם אין תשובה מועילה, הפנייה מחכה לצוות.")}</p> : null}
        <UIAction type="submit" busy={busy} disabled={body.trim().length < 5} busyLabel={t("שומרים את הפנייה…")}>{t("לשלוח פנייה")}</UIAction>
      </form>
      {historyError ? <div className="mt-6 text-[13px] text-[var(--ink-soft)]" role="status">
        <p>{t("הפניות הקודמות לא נטענו. אפשר לשלוח פנייה חדשה.")}</p>
        <button type="button" className={`${TEXT_ACTION} min-h-11`} disabled={historyLoading} onClick={() => { setHistoryLoading(true); setAttempt(n => n + 1); }}>{t("לטעון את הפניות הקודמות")}</button>
      </div> : historyLoading ? <p role="status" className="mt-6 text-[13px] text-[var(--ink-muted)]">{t("טוענים את הפניות…")}</p> : null}
      {tickets && tickets.length > 0 ? <section className="mt-8"><h2 className="mb-3 text-[18px] font-bold">{t("הפניות שלכם")}</h2>
        <ul className={`${CARD} divide-y divide-[var(--rule)]`}>{tickets.map(ticket => <li key={ticket.id}>
          <button className={`${LIST_ROW} justify-between`} onClick={() => setSelected(ticket)}>
            <span className="min-w-0 truncate text-[15px]">{ticket.messages[0]?.body.slice(0, 80)}</span><span className="shrink-0 text-[12px] text-[color:var(--ink-muted)]">{t(SUPPORT_STATUS[ticket.status])}</span>
          </button>
        </li>)}</ul>
      </section> : null}
    </>}
    <p className="mt-8 text-[13px] text-[color:var(--ink-soft)]">{t("אפשר גם")} <a className={TEXT_ACTION} href={`mailto:${CONTACT_EMAIL}`}>{t("לכתוב לנו במייל")}</a>. {t("התשובות לפניות כאן נשמרות באפליקציה.")}</p>
  </div>;
  // A person who cannot sign in still sees the email fallback. Do not mount the app's
  // authenticated shell before the support read confirms the session.
  return signin || tickets === null ? <div className="app-blue min-h-screen bg-[var(--canvas)] p-5 text-[color:var(--ink)] sm:p-8">
    <Link href="/" className="mb-8 inline-flex min-h-11 items-center gap-2 font-bold"><ProductWordmark /></Link>
    {content}
  </div> : <AppShell>{content}</AppShell>;
}
