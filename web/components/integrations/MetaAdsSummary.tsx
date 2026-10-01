import Link from "next/link";
import type { MetaAdsReport, PixelVerification } from "@/lib/api";
import { IconArrowLeft } from "@/lib/icons";
import styles from "./meta-ads.module.css";

function count(value: number | null | undefined) {
  return value == null ? "לא נמדד" : value.toLocaleString("he-IL", { maximumFractionDigits: 1 });
}
function money(value: number | null | undefined, currency?: string) {
  if (value == null) return "לא נמדד";
  if (!currency) return `${count(value)} · המטבע לא נמסר`;
  try { return new Intl.NumberFormat("he-IL", { style: "currency", currency, maximumFractionDigits: 0 }).format(value); }
  catch { return `${count(value)} ${currency}`; }
}
function checkedAt(iso: string) {
  return new Date(iso).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function MetaAdsSummary({ ads, tracking }: { ads?: MetaAdsReport; tracking?: PixelVerification }) {
  if (!ads && !tracking) return null;
  const overview = ads?.overview;
  const hasReport = ads?.status === "available" && overview;
  const campaigns = ads?.campaigns || [];
  return <section className={styles.section} aria-labelledby="meta-ads-title">
    <header><h2 id="meta-ads-title">מה המודעות הביאו?</h2>{ads?.period && <span dir="ltr">{new Date(`${ads.period.start}T12:00:00`).toLocaleDateString("he-IL")} – {new Date(`${ads.period.end}T12:00:00`).toLocaleDateString("he-IL")}</span>}</header>
    {hasReport ? <>
      <p className={styles.lead}>{overview.link_clicks != null && overview.spend != null ? `המודעות הביאו ${count(overview.link_clicks)} לחיצות על קישורים, בהוצאה של ${money(overview.spend, overview.currency)}.` : "אלה הנתונים שהתקבלו ממטא לתקופה הזו."}</p>
      <dl className={styles.metrics}>
        <div><dt>הוצאה על מודעות</dt><dd>{money(overview.spend, overview.currency)}</dd></div>
        <div><dt>לחיצות על קישורים</dt><dd>{count(overview.link_clicks)}</dd></div>
        <div><dt>{overview.website_purchases != null ? "רכישות באתר שמטא שייכה למודעות" : "פניות שמטא שייכה למודעות"}</dt><dd>{count(overview.website_purchases ?? overview.leads)}</dd></div>
      </dl>
      <p className={styles.note}>לפי הספירה של מטא, לא מספר ההזמנות ששולמו.</p>
      {campaigns.length > 0 && <details className={styles.campaigns}><summary>מה קרה בכל קמפיין ({campaigns.length})</summary>{campaigns.map(row => <div key={row.id}><strong>{row.name || "קמפיין ללא שם"}</strong><span>{money(row.spend, row.currency)} הוצאה · {count(row.link_clicks)} לחיצות{row.website_purchases != null ? ` · ${count(row.website_purchases)} רכישות משויכות` : ""}</span></div>)}</details>}
      <details className={styles.campaigns}><summary>איך סופרים את זה</summary><div>
        <span>מטא משייכת פעולה למודעה עד 7 ימים אחרי לחיצה או יום אחרי צפייה. לכן המספר לא מחובר למספר של גוגל, ונתוני היום עוד עשויים להשתנות.</span>
        <span>התובנות ועדכון התוכנית משתמשים גם בנתונים האלה: נבחר שינוי אחד לבדוק, בפוסט, בהצעה או בעמוד שהמודעה מובילה אליו.</span>
        {tracking?.status === "receiving" && <span>כשהמעקב באתר מקבל אירועים, זה עוד לא אישור שכל רכישה נמדדת נכון.</span>}
      </div></details>
    </> : <p>{ads?.status === "no_activity" ? "מטא לא החזירה פעילות פרסום לתקופה הזו. אפשר להמשיך עם תוצאות הפוסטים והאתר." : ads?.note_he || "נתוני המודעות עדיין לא זמינים."}</p>}
    {tracking && <div className={styles.tracking} data-ready={tracking.status === "receiving"}><span className={styles.dot} aria-hidden="true" /><div><strong>המעקב באתר</strong><p>{tracking.note_he}</p>{tracking.checked_at && <small>נבדק {checkedAt(tracking.checked_at)}</small>}</div></div>}
    <footer><Link href="/strategy">לתוכנית השיווק <IconArrowLeft className="h-4 w-4" /></Link><Link href="/integrations">{tracking?.status === "receiving" ? "לניהול החיבורים" : "לחבר או לבדוק את המעקב"}</Link></footer>
  </section>;
}
