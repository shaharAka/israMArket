"use client";

import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";

import Link from "next/link";
import type { MetaAdsReport, PixelVerification } from "@/lib/api";
import { IconArrowLeft } from "@/lib/icons";
import { LOCALE_META } from "@/lib/i18n/locales";
import styles from "./meta-ads.module.css";

export function MetaAdsSummary({ ads, tracking }: { ads?: MetaAdsReport; tracking?: PixelVerification }) {
  const t = useCopy();
  const { locale } = useLanguage();
  const formatLocale = LOCALE_META[locale].formatLocale;
  function count(value: number | null | undefined) { return value == null ? t("לא נמדד") : value.toLocaleString(formatLocale, { maximumFractionDigits: 1 }); }
  function money(value: number | null | undefined, currency?: string) {
    if (value == null) return t("לא נמדד");
    if (!currency) return t("{arg_0} · המטבע לא נמסר", { arg_0: count(value) });
    try { return new Intl.NumberFormat(formatLocale, { style: "currency", currency, maximumFractionDigits: 0 }).format(value); }
    catch { return `${count(value)} ${currency}`; }
  }
  function checkedAt(iso: string) { return new Date(iso).toLocaleString(formatLocale, { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }); }

  if (!ads && !tracking) return null;
  const overview = ads?.overview;
  const hasReport = ads?.status === "available" && overview;
  const campaigns = ads?.campaigns || [];
  return <section className={styles.section} aria-labelledby="meta-ads-title">
    <header><h2 id="meta-ads-title"><Copy text="מה המודעות הביאו?" /></h2>{ads?.period && <span dir="ltr">{new Date(`${ads.period.start}T12:00:00`).toLocaleDateString(formatLocale)} – {new Date(`${ads.period.end}T12:00:00`).toLocaleDateString(formatLocale)}</span>}</header>
    {hasReport ? <>
      <p className={styles.lead}>{overview.link_clicks != null && overview.spend != null ? t("המודעות הביאו {arg_0} לחיצות על קישורים, בהוצאה של {arg_1}.", { arg_0: count(overview.link_clicks), arg_1: money(overview.spend, overview.currency) }) : t("אלה הנתונים שהתקבלו מפייסבוק לתקופה הזו.")}</p>
      <dl className={styles.metrics}>
        <div><dt><Copy text="הוצאה על מודעות" /></dt><dd>{money(overview.spend, overview.currency)}</dd></div>
        <div><dt><Copy text="לחיצות על קישורים" /></dt><dd>{count(overview.link_clicks)}</dd></div>
        <div><dt>{overview.website_purchases != null ? t("רכישות באתר שיוחסו למודעות") : t("פניות שיוחסו למודעות")}</dt><dd>{count(overview.website_purchases ?? overview.leads)}</dd></div>
      </dl>
      <p className={styles.note}><Copy text="לפי הספירה של פייסבוק, לא מספר ההזמנות ששולמו." /></p>
      {campaigns.length > 0 && <details className={styles.campaigns}><summary><Copy text="מה קרה בכל קמפיין (" />{campaigns.length})</summary>{campaigns.map(row => <div key={row.id}><strong>{row.name || t("קמפיין ללא שם")}</strong><span>{money(row.spend, row.currency)} <Copy text="הוצאה ·" />{count(row.link_clicks)} <Copy text="לחיצות" />{row.website_purchases != null ? t(" · {arg_0} רכישות שיוחסו", { arg_0: count(row.website_purchases) }) : ""}</span></div>)}</details>}
      <details className={styles.campaigns}><summary><Copy text="איך סופרים את זה" /></summary><div>
        <span><Copy text="פייסבוק מייחס פעולה למודעה אם היא קרתה עד 7 ימים אחרי לחיצה, או עד יום אחרי שראו את המודעה. לכן לא מחברים את המספר הזה למספר של גוגל, ונתוני היום עוד עשויים להשתנות." /></span>
        <span><Copy text="התובנות ועדכון התוכנית משתמשים גם בנתונים האלה: נבחר שינוי אחד לבדוק, בפוסט, בהצעה או בעמוד שהמודעה מובילה אליו." /></span>
        {tracking?.status === "receiving" && <span><Copy text="גם כשהמעקב באתר עובד, זה עוד לא אומר שכל רכישה נספרת נכון." /></span>}
      </div></details>
    </> : <p>{ads?.status === "no_activity" ? t("פייסבוק לא החזיר פעילות פרסום לתקופה הזו. אפשר להמשיך עם תוצאות הפוסטים והאתר.") : t(ads?.note_he || "") || t("נתוני המודעות עדיין לא זמינים.")}</p>}
    {tracking && <div className={styles.tracking} data-ready={tracking.status === "receiving"}><span className={styles.dot} aria-hidden="true" /><div><strong><Copy text="המעקב באתר" /></strong><p>{t(tracking.note_he || "")}</p>{tracking.checked_at && <small><Copy text="נבדק" />{checkedAt(tracking.checked_at)}</small>}</div></div>}
    <footer><Link href="/strategy"><Copy text="לתוכנית השיווק" /><IconArrowLeft className="h-4 w-4 locale-arrow" /></Link><Link href="/integrations">{tracking?.status === "receiving" ? t("לניהול החיבורים") : t("לחבר או לבדוק את המעקב")}</Link></footer>
  </section>;
}
