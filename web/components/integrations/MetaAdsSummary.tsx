import Link from "next/link";
import type { MetaAdsReport, PixelVerification } from "@/lib/api";
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
      <p className={styles.note}>מטא משייכת פעולות עד 7 ימים אחרי לחיצה או יום אחרי צפייה. זו אינה ספירה של הזמנות ששולמו; לא מחברים אותה למספר של גוגל. נתוני היום עוד עשויים להשתנות.</p>
      {campaigns.length > 0 && <details className={styles.campaigns}><summary>מה קרה בכל קמפיין ({campaigns.length})</summary>{campaigns.map(row => <div key={row.id}><strong>{row.name || "קמפיין ללא שם"}</strong><span>{money(row.spend, row.currency)} הוצאה · {count(row.link_clicks)} לחיצות{row.website_purchases != null ? ` · ${count(row.website_purchases)} רכישות משויכות` : ""}</span></div>)}</details>}
      <p className={styles.note}>התובנות בעמוד הזה ובעדכון התוכנית משתמשות גם בנתוני הפרסום. נבחר שינוי אחד שאפשר לבדוק בפוסט, בהצעה או בעמוד שאליו המודעה מובילה.</p>
    </> : <p>{ads?.status === "no_activity" ? "מטא לא החזירה פעילות פרסום לתקופה הזו. אפשר להמשיך עם תוצאות הפוסטים והאתר." : ads?.note_he || "נתוני המודעות עדיין לא זמינים."}</p>}
    {tracking && <div className={styles.tracking} data-ready={tracking.status === "receiving"}><span aria-hidden="true">{tracking.status === "receiving" ? "✓" : "○"}</span><div><strong>המעקב באתר</strong><p>{tracking.note_he}</p>{tracking.checked_at && <small>נבדק {new Date(tracking.checked_at).toLocaleString("he-IL")}. קבלת אירועים אינה אישור שכל רכישה נמדדת נכון.</small>}</div></div>}
    <footer><Link href="/strategy">לתוכנית השיווק ←</Link><Link href="/integrations">{tracking?.status === "receiving" ? "לניהול החיבורים" : "לחבר או לבדוק את המעקב"}</Link></footer>
  </section>;
}
