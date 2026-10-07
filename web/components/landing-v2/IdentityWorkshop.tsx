"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { ProductUtilities } from "@/components/language/ProductUtilities";
import { IdentityMark, type IdentityDirection } from "./IdentityMark";
import { Landing } from "./Landing";
import styles from "./identity-workshop.module.css";

const DIRECTIONS = [
  { key: "signature", title: "חתימה טיפוגרפית", description: "סימן קצר מתוך השם. אותיות שמתחברות לצורה אחת, בלי לדחוס ארבע אותיות לתוך קופסה." },
  { key: "sun", title: "השמש נשארת", description: "השמש מעל מבנה פתוח. קשר למוטיב שלנו, בלי גג של בית ובלי ציור מפורט של חנות." },
  { key: "fold", title: "תוכנית בתנועה", description: "אות M מזוויות של דף מקופל. צורה חדה ובולטת, עם קשר לתוכנית שאנחנו בונים." },
] as const;

export function IdentityWorkshop() {
  const [selected, setSelected] = useState<IdentityDirection>("signature");
  const t = useCopy();
  const { locale } = useLanguage();
  return <main className={styles.workshop}>
    <header className={styles.intro}>
      <div className={styles.toolbar}><Link href={`/design/hero?lang=${locale}`}><Copy text="לחזור לתצוגת האתר" /></Link><ProductUtilities inline /></div>
      <h1><Copy text="שם אחד. שלושה כיוונים לסימן." /></h1>
      <p><Copy text="קודם צורה וקריאות. הצבע יכול לחכות. בחרו כיוון כדי לראות אותו בכותרת האתר." /></p>
    </header>
    <div className={styles.directions} role="group" aria-label={t("לבחור כיוון לזהות המותג")}>
      {DIRECTIONS.map((direction, index) => <button key={direction.key} className={styles.direction}
        type="button" aria-pressed={selected === direction.key} onClick={() => setSelected(direction.key)}>
        <span className={styles.number}>0{index + 1}</span>
        <div className={styles.specimen} dir="ltr"><IdentityMark direction={direction.key} /><span className={styles.wordmark}>isramarket</span></div>
        <div className={styles.scales} aria-hidden="true"><IdentityMark direction={direction.key} /><IdentityMark direction={direction.key} /><span className={styles.inverse}><IdentityMark direction={direction.key} /></span></div>
        <h2><Copy text={direction.title} /></h2><p><Copy text={direction.description} /></p>
      </button>)}
    </div>
    <div className={styles.previewLabel}><h2><Copy text="ככה זה נראה באתר" /></h2><p><Copy text="הסימן לבדו בטלפון. השם המלא במחשב." /></p></div>
    <div className={styles.preview}><Landing initialPath="services" heroOnly identity={selected} /></div>
  </main>;
}
