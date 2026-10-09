"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoadingMark } from "@/components/Doodles";
import { UIAction } from "@/components/design/Controls";
import { SectionHeader } from "@/components/SectionHeader";
import { ApiError, endpoints, isDemo, type PlanEditFields, type PlanEditPayload } from "@/lib/api";
import { IconChevron, IconPlus } from "@/lib/icons";
import styles from "./edit.module.css";

type Draft = { version: string; fields: PlanEditFields };
const draftKey = (id: number) => `isramarket_plan_edit:${isDemo() ? "demo" : "account"}:${id}`;
function readDraft(id: number): Draft | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(draftKey(id)) || "null") as Draft | null;
    if (!raw || typeof raw.version !== "string" || typeof raw.fields?.direction !== "string" || typeof raw.fields.audience !== "string" || !Array.isArray(raw.fields.assumptions)) return null;
    if (raw.fields.assumptions.length > 4 || raw.fields.assumptions.some(a => typeof a?.bet_he !== "string" || typeof a.if_wrong_he !== "string")) return null;
    return raw;
  } catch { return null; }
}
function clearDraft(id: number) {
  try { sessionStorage.removeItem(draftKey(id)); } catch { /* Storage may be disabled. */ }
}

export default function PlanEditPage() {
  const t = useCopy();
  const router = useRouter();
  const savedNotice = useRef<HTMLParagraphElement>(null);
  const [plan, setPlan] = useState<PlanEditPayload | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [latest, setLatest] = useState<PlanEditPayload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [restored, setRestored] = useState(false);

  function receive(current: PlanEditPayload) {
    const existing = readDraft(current.business_id);
    setPlan(current);
    setDraft(existing ?? { version: current.version, fields: current.fields });
    setLatest(existing && existing.version !== current.version ? current : null);
    setRestored(Boolean(existing));
    setError("");
  }
  async function load() {
    try { receive(await endpoints.editablePlan()); }
    catch (err) { setError(err instanceof Error ? err.message : t("לא הצלחנו לטעון את התוכנית.")); }
  }
  useEffect(() => {
    let active = true;
    void endpoints.editablePlan().then(current => { if (active) receive(current); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "לא הצלחנו לטעון את התוכנית."); });
    return () => { active = false; };
  }, []);

  useEffect(() => { if (saved) savedNotice.current?.focus(); }, [saved]);

  const dirty = Boolean(plan && draft && JSON.stringify(plan.fields) !== JSON.stringify(draft.fields));
  useEffect(() => {
    if (!plan || !draft) return;
    try {
      if (dirty) sessionStorage.setItem(draftKey(plan.business_id), JSON.stringify(draft));
      else clearDraft(plan.business_id);
    } catch { /* The current form still stays intact on a failed save. */ }
  }, [plan, draft, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function edit(fields: PlanEditFields) {
    if (!draft) return;
    setDraft({ ...draft, fields });
    setSaved(false);
  }
  async function refresh() {
    setBusy(true);
    try {
      const current = await endpoints.editablePlan();
      setPlan(current);
      if (draft && current.version !== draft.version) setLatest(current);
      setError("");
    } catch (err) { setError(err instanceof Error ? err.message : t("לא הצלחנו לבדוק את התוכנית.")); }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!plan || !draft || busy || latest) return;
    setBusy(true); setSaving(true); setError(""); setSaved(false);
    try {
      const result = await endpoints.savePlanEdit(draft.version, draft.fields);
      setPlan(result); setDraft({ version: result.version, fields: result.fields });
      setLatest(null); setRestored(false); clearDraft(result.business_id); setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("לא הצלחנו לשמור. השינויים שלכם נשארו כאן; נסו שוב."));
      if (err instanceof ApiError && err.status === 409) {
        try {
          const current = await endpoints.editablePlan();
          setPlan(current);
          if (current.version !== draft.version) setLatest(current);
        } catch { /* Do not replace the owner's draft or assume the new version. */ }
      }
    } finally { setBusy(false); setSaving(false); }
  }

  return <AppShell><div className="mx-auto max-w-3xl">
    {/* One verb from the entry link on /strategy to this title: לערוך. */}
    <SectionHeader section="plan" eyebrow={null} title={t("לערוך את התוכנית")} subtitle={t("מה רוצים לקדם ולמי פונים. ההצעות הבאות ייקחו בחשבון את מה שתשמרו.")} />
    {error && !latest && !plan?.blocked ? <p role="alert" className={styles.error}>{error}{plan ? /השינויים שלכם נשארו/.test(error) ? null : t(" השינויים שלכם נשארו כאן.") : <> <button className={styles.textAction} onClick={() => void load()}><Copy text="לנסות שוב" /></button></>}</p> : null}
    {!plan && !error ? <LoadingMark label={t("טוענים את התוכנית…")} /> : null}
    {plan && !plan.available ? <p><Copy text="עוד אין תוכנית לעריכה." /><Link className={styles.textAction} href="/strategy"><Copy text="לבנות את התוכנית" /></Link></p> : null}
    {saved ? <p ref={savedNotice} tabIndex={-1} role="status" className={`${styles.success} mb-6`}>{isDemo() ? t("העדכון נשמר בהדגמה בלבד.") : t("התוכנית נשמרה. ההצעות הבאות יתחשבו בעדכון.")} <Link href="/strategy" className={styles.textAction}><Copy text="לחזור לתוכנית" /></Link></p> : null}
    {plan?.available && draft ? <form onSubmit={save} onInvalidCapture={event => { const details = (event.target as HTMLElement).closest("details"); if (details) details.open = true; }} className="space-y-6">
      {restored && !latest ? <p role="status" className={styles.note}><Copy text="חזרנו לעריכה שלא נשמרה." /></p> : null}
      {plan.blocked ? <div className={styles.notice} role="status"><p><Copy text="בונים כרגע את תוכנית החודש או את הפוסטים. אפשר לערוך כאן ולשמור כשהבנייה מסתיימת." /></p><div className={styles.links}><Link href="/strategy" className={styles.textAction}><Copy text="לראות את ההתקדמות" /></Link><button type="button" disabled={busy} className={styles.textAction} onClick={() => void refresh()}><Copy text="לבדוק שוב" /></button></div></div> : null}
      {latest ? <div className={styles.notice} role="alert">
        <p><Copy text="התוכנית עודכנה בינתיים. העריכה שלכם נשארה כאן." /></p>
        <details className={styles.disclosure}><summary><Copy text="לבדוק את מה ששמור עכשיו" /><IconChevron className="h-4 w-4" /></summary>
          <dl className="space-y-3 py-4"><div><dt><Copy text="הכיוון" /></dt><dd>{latest.fields.direction}</dd></div><div><dt><Copy text="הקהל" /></dt><dd>{latest.fields.audience}</dd></div><div><dt><Copy text="ההשערות" /></dt><dd>{latest.fields.assumptions.map(a => t("{arg_0}{arg_1}", { arg_0: a.bet_he, arg_1: a.if_wrong_he ? ` (אם היא לא תתאמת: ${a.if_wrong_he})` : "" })).join(" · ") || t("לא הוגדרו")}</dd></div></dl>
        </details>
        <button type="button" disabled={busy} className={styles.textAction} onClick={() => { setDraft({ ...draft, version: latest.version }); setLatest(null); setError(""); }}><Copy text="להמשיך בעריכה שלי אחרי הבדיקה" /></button>
      </div> : null}
      <fieldset disabled={busy} className={styles.fields}>
        <div><label htmlFor="plan-direction"><Copy text="מה רוצים לקדם?" /></label><textarea id="plan-direction" required maxLength={300} rows={3} value={draft.fields.direction} onChange={e => edit({ ...draft.fields, direction: e.target.value })} /></div>
        <div><label htmlFor="plan-audience"><Copy text="למי פונים בתוכנית?" /></label><input id="plan-audience" required maxLength={160} value={draft.fields.audience} onChange={e => edit({ ...draft.fields, audience: e.target.value })} /></div>
      </fieldset>
      <details className={styles.disclosure}>
        <summary><Copy text="ההשערות שנבדוק (" />{draft.fields.assumptions.length}) <IconChevron className="h-4 w-4" /></summary>
        <div className="space-y-6 pt-4">
          {draft.fields.assumptions.map((a, i) => <fieldset key={i} disabled={busy} className={styles.assumption}>
            <div><label htmlFor={`bet-${i}`}><Copy text="השערה" />{i + 1}</label><textarea id={`bet-${i}`} required maxLength={300} rows={2} value={a.bet_he} onChange={e => edit({ ...draft.fields, assumptions: draft.fields.assumptions.map((item, index) => index === i ? { ...item, bet_he: e.target.value } : item) })} /></div>
            <div><label htmlFor={`fallback-${i}`}><Copy text="מה ננסה אם היא לא תתאמת?" /><span className={styles.optional}><Copy text="לא חובה" /></span></label><textarea id={`fallback-${i}`} maxLength={300} rows={2} value={a.if_wrong_he} onChange={e => edit({ ...draft.fields, assumptions: draft.fields.assumptions.map((item, index) => index === i ? { ...item, if_wrong_he: e.target.value } : item) })} /></div>
            {/* Available, never inviting: the same quiet weight as "לנתק". */}
            <button type="button" className={styles.quietAction} onClick={() => edit({ ...draft.fields, assumptions: draft.fields.assumptions.filter((_, index) => index !== i) })}><Copy text="להסיר השערה" />{i + 1}</button>
          </fieldset>)}
          {draft.fields.assumptions.length < 4 ? <button type="button" disabled={busy} className={styles.textAction} onClick={() => edit({ ...draft.fields, assumptions: [...draft.fields.assumptions, { bet_he: "", if_wrong_he: "" }] })}><IconPlus className="h-4 w-4" /><Copy text="להוסיף השערה" /></button> : null}
        </div>
      </details>
      <details className={styles.disclosure}><summary><Copy text="מה משתנה אחרי השמירה?" /><IconChevron className="h-4 w-4" /></summary>
        <p className="py-4 text-sm leading-7 text-[var(--ink-soft)]"><Copy text="הכיוון וההשערות יתעדכנו בתוכנית ובהצעות הבאות. הקהל יוגדר כקהל הראשי גם בהחלטות העסק. פוסטים שכבר נכתבו נשארים כפי שהם; אפשר לערוך אותם בנפרד. התקציב, היעדים המספריים ותוצאות העבר נשמרים. בנייה שנעצרה תתחיל מחדש לפי העדכון כשתנסו שוב. השמירה לא מפרסמת דבר." /></p>
      </details>
      <div className={styles.footer}>
        <UIAction type="submit" busy={saving} busyLabel={t("שומרים…")} disabled={busy || Boolean(latest) || plan.blocked || !dirty}><Copy text="לשמור את התוכנית" /></UIAction>
        <button type="button" disabled={busy} className={styles.textAction} onClick={() => { clearDraft(plan.business_id); router.push("/strategy"); }}>{dirty ? t("לבטל ולחזור לתוכנית") : t("לחזור לתוכנית")}</button>
      </div>

    </form> : null}
  </div></AppShell>;
}
