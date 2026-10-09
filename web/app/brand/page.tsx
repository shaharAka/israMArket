"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { SetupNotice } from "@/components/account/SetupNotice";
import { BrandStyle } from "@/components/brand/BrandStyle";
import { BusinessLogo } from "@/components/brand/BusinessLogo";
import { SwatchFan } from "@/components/brand/SwatchFan";
import { UIAction } from "@/components/design/Controls";
import { endpoints, type BrandLanguage, type Business } from "@/lib/api";
import { IconArrowLeft } from "@/lib/icons";
import styles from "./brand.module.css";

const roles = { primary:"צבע ראשי", accent:"הדגשה", background:"רקע", ink:"טקסט", secondary:"צבע משני" };
function emptyBrand(name: string): BrandLanguage { return { business_name:name, palette:[], typography:{primary:"",mood:""}, visual_style:"", photography:"", voice:"", voice_examples:[], do_say:[], dont_say:[], messaging:[], offers_seen:[], audience:"", logo_description:"" }; }
function safeHex(hex: string) { return /^#[\da-f]{6}$/i.test(hex) ? hex : "#ffffff"; }

/** The business's identity, with explicit saving and its own publishing colours. */
export default function BrandPage() {
  const t = useCopy();
  const [business, setBusiness] = useState<Business | null>(null);
  const [saved, setSaved] = useState<BrandLanguage | null>(null);
  const [draft, setDraft] = useState<BrandLanguage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    endpoints.business().then(result => {
      if (!active) return;
      setBusiness(result.business);
      if (result.business) { const brand=result.business.brand_language ?? emptyBrand(result.business.name); setSaved(brand); setDraft(structuredClone(brand)); }
      setError("");
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : "לא הצלחנו לטעון את המותג"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  const dirty = Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved));
  function edit(patch: Partial<BrandLanguage>) { if (!draft || busy) return; setDraft({ ...draft, ...patch }); setNote(""); setError(""); }
  async function save() {
    if (!draft || !dirty || busy) return;
    setBusy(true); setError(""); setNote("");
    try {
      const result = await endpoints.saveBrand(draft);
      if (!result.business?.brand_language) throw new Error(t("לא התקבל אישור לשמירת המותג. נסו שוב."));
      setBusiness(result.business); setSaved(result.business.brand_language); setDraft(structuredClone(result.business.brand_language));
      setNote(t("המותג נשמר. הצבעים והסגנון זמינים לפוסטים שלכם.")); window.dispatchEvent(new Event("isramarket-brand-change"));
    } catch (err) { setError(err instanceof Error ? err.message : t("המותג לא נשמר. השינויים שלכם עדיין כאן.")); }
    finally { setBusy(false); }
  }
  const hasVisual = Boolean(draft && (draft.visual_style || draft.typography.primary || draft.photography));
  const hasMessages = Boolean(draft && (draft.messaging.length > 0 || draft.offers_seen.length > 0 || draft.voice_examples.length > 0));
  return <AppShell><div className={styles.page}>
    <PageHeader title={t("המותג")} subtitle={t("השפה של העסק שלכם")} action={<Link href="/business" className={styles.link}><Copy text="כלי העסק" /><IconArrowLeft className={styles.arrow} /></Link>} />
    {loading && <p role="status" className={styles.note}><Copy text="טוענים את המותג…" /></p>}
    {!loading && !business && !error && <SetupNotice title={t("עוד לא הגדרתם עסק")}><Link href="/start" className={styles.link}><Copy text="להכיר את העסק ולבנות תוכנית" /></Link></SetupNotice>}
    {error && <SetupNotice tone="error" title={t("לא הצלחנו להשלים את הפעולה")}>{error}{!draft && <UIAction variant="text" onClick={() => { setLoading(true); setAttempt(n => n + 1); }}><Copy text="לנסות שוב" /></UIAction>}</SetupNotice>}
    {/* The business's Design DNA, as its own posts: the first thing the brand is for. */}
    {business && <BrandStyle business={business} brand={saved} />}
    {draft && business && <form className={styles.form} onSubmit={e => { e.preventDefault(); void save(); }}>
      {/* The identity and its colours are one object: one card, a hairline between them. */}
      <div className={styles.card}>
        <div className={styles.identity}><BusinessLogo src={draft.logo_url} name={draft.business_name || business.name} color={draft.palette[0]?.hex} className={styles.logo} /><div><h2>{draft.business_name || business.name}</h2><p>{draft.logo_url ? t("הלוגו של העסק") : t("עדיין אין לוגו שמור לעסק")}</p></div></div>
        <section className={styles.colors} aria-labelledby="brand-colors"><div className={styles.heading}><h2 id="brand-colors"><Copy text="הצבעים שלכם" /></h2><SwatchFan colors={draft.palette.map(item => item.hex)} className={styles.fan} /></div><p className={styles.note}><Copy text="לחצו על צבע כדי לערוך. אלה צבעי העסק והפוסטים שלו." /></p>
          <div className={styles.palette}>{draft.palette.map((item,i) => <label key={`${item.role}-${i}`}><input type="color" aria-label={t("לערוך {arg_0}", { arg_0: roles[item.role] })} disabled={busy} value={safeHex(item.hex)} onChange={e => edit({ palette:draft.palette.map((swatch,j) => j===i ? {...swatch,hex:e.target.value} : swatch) })} /><strong>{item.name || roles[item.role]}</strong><span>{roles[item.role]}</span></label>)}</div>
          {!draft.palette.length && <UIAction variant="secondary" onClick={() => edit({palette:[{hex:"#ffffff",role:"primary",name:t("צבע ראשי")}]})}><Copy text="לבחור צבע לעסק" /></UIAction>}
        </section>
      </div>
      <section className={`${styles.card} ${styles.voice}`} aria-labelledby="brand-voice"><h2 id="brand-voice"><Copy text="איך העסק מדבר" /></h2>{draft.voice ? <p>{draft.voice}</p> : <p className={styles.note}><Copy text="עוד לא נקבע סגנון כתיבה." /></p>}
        <details className={styles.details}><summary><Copy text="לערוך את סגנון הכתיבה" /></summary><label htmlFor="brand-voice-input"><Copy text="במילים שלכם" /><textarea id="brand-voice-input" rows={3} value={draft.voice} disabled={busy} maxLength={500} onChange={e => edit({voice:e.target.value})} placeholder={t("למשל: קצר, חם, כמו שיחה עם לקוח קבוע")} /></label><label htmlFor="brand-do-input"><Copy text="מילים שמתאימות לכם" /><textarea id="brand-do-input" rows={2} disabled={busy} value={draft.do_say.join("\n")} onChange={e => edit({do_say:e.target.value.split("\n")})} placeholder={t("מילה או ביטוי בכל שורה")} /></label><label htmlFor="brand-dont-input"><Copy text="מילים שנעדיף להימנע מהן" /><textarea id="brand-dont-input" rows={2} disabled={busy} value={draft.dont_say.join("\n")} onChange={e => edit({dont_say:e.target.value.split("\n")})} placeholder={t("מילה או ביטוי בכל שורה")} /></label></details>
      </section>
      {(hasVisual || hasMessages) && <div className={`${styles.card} ${styles.more}`}>
        {hasVisual && <details className={styles.details}><summary><Copy text="השפה החזותית" /></summary>{draft.typography.primary && <p><strong><Copy text="טיפוגרפיה:" /></strong>{draft.typography.primary}</p>}{draft.visual_style && <p>{draft.visual_style}</p>}{draft.photography && <p>{draft.photography}</p>}</details>}
        {hasMessages && <details className={styles.details}><summary><Copy text="מסרים ודוגמאות מהעסק" /></summary>{draft.messaging.length > 0 && <p>{draft.messaging.join(" · ")}</p>}{draft.offers_seen.length > 0 && <p>{draft.offers_seen.join(" · ")}</p>}{draft.voice_examples.map((example,i) => <p key={i}>{example}</p>)}</details>}
      </div>}
      {dirty && <div className={styles.save}><UIAction type="submit" busy={busy} busyLabel={t("שומרים את המותג…")}><Copy text="לשמור את השינויים" /></UIAction><UIAction variant="text" disabled={busy} onClick={() => { if (saved) setDraft(structuredClone(saved)); setError(""); }}><Copy text="לבטל שינויים" /></UIAction></div>}
      {note && <p role="status" className={styles.result}>{note}</p>}
      <footer className={styles.footer}><Link href="/assets" className={styles.link}><Copy text="לתמונות של העסק" /><IconArrowLeft className={styles.arrow} /></Link><Link href="/posts" className={styles.link}><Copy text="לראות את המותג בפוסטים" /><IconArrowLeft className={styles.arrow} /></Link></footer>
    </form>}
  </div></AppShell>;
}
