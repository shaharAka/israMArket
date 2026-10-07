"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { ProductUtilities } from "@/components/language/ProductUtilities";
import { IdentityMark, type IdentityDirection } from "./IdentityMark";
import { Landing } from "./Landing";
import styles from "./identity-workshop.module.css";

const DIRECTIONS = [
  { key: "grotesk", title: "הבסיס המקורי", description: "השם המלא באותיות קטנות. צפוף, חד ובצבע אחד." },
  { key: "open", title: "אותיות משלנו — הכיוון שנבחר", description: "שתי אותיות a עגולות, כתף קצרה ב־r ונקודה מרובעת. אותו שם, עם קצב משלו." },
  { key: "joined", title: "חיבור בתוך השם", description: "חיבור עדין בין r ל־a, מבנה צפוף וסיומות ישרות. אופי חד יותר, עדיין בצבע אחד." },
  { key: "blue", title: "נגיעה אחת בכחול", description: "אותן אותיות של כיוון 2. רק הנקודה של ה־i בכחול, כדי לבדוק מה הצבע באמת מוסיף." },
] as const satisfies readonly { key: IdentityDirection; title: string; description: string }[];

export function IdentityWorkshop() {
  const [selected, setSelected] = useState<IdentityDirection>("open");
  const t = useCopy();
  const { locale } = useLanguage();
  const selectedDirection = DIRECTIONS.find((direction) => direction.key === selected)!;

  return <main className={styles.workshop}>
    <header className={styles.intro}>
      <div className={styles.toolbar}><Link href={`/design/hero?lang=${locale}`}><Copy text="לחזור לתצוגת האתר" /></Link><ProductUtilities inline /></div>
      <h1><Copy text="אותו שם. יותר אופי באותיות." /></h1>
      <p><Copy text="כיוון 2 נבחר למותג: אותיות שעוצבו במיוחד, בצבע אחד. אפשר להשוות כאן לבסיס ולנגיעה בכחול." /></p>
    </header>

    <div className={styles.directions} role="group" aria-label={t("לבחור כיוון לזהות המותג")}>
      {DIRECTIONS.map((direction, index) => <button key={direction.key} className={styles.direction}
        type="button" aria-pressed={selected === direction.key} onClick={() => setSelected(direction.key)}>
        <span className={styles.cardTop}><span className={styles.number}>0{index + 1}</span><span className={styles.selection}>{selected === direction.key ? <Copy text="בתצוגה" /> : <Copy text="להציג באתר" />}</span></span>
        <span className={styles.specimen} dir="ltr"><IdentityMark direction={direction.key} /></span>
        <span className={styles.directionTitle}><Copy text={direction.title} /></span>
        <span className={styles.description}><Copy text={direction.description} /></span>
        <span className={styles.proofs} aria-hidden="true">
          <span className={styles.proof}><span className={styles.proofLabel}><Copy text="בקטן" /></span><span className={styles.smallMark}><IdentityMark direction={direction.key} /></span></span>
          <span className={`${styles.proof} ${styles.reverse}`}><span className={styles.proofLabel}><Copy text="על כהה" /></span><span className={styles.smallMark}><IdentityMark direction={direction.key} /></span></span>
          <span className={styles.proof}><span className={styles.proofLabel}><Copy text="בטלפון" /></span><span className={styles.phoneMark}><IdentityMark direction={direction.key} compact /></span></span>
        </span>
      </button>)}
    </div>

    <section className={styles.comparison} aria-labelledby="identity-color-title">
      <div className={styles.comparisonIntro}>
        <h2 id="identity-color-title"><Copy text="האם צריך עוד צבע?" /></h2>
        <p><Copy text="ההמלצה שלי: כיוון 2 בצבע אחד. האופי כבר נמצא באותיות. הנקודה הכחולה היא תוספת אפשרית, בלי לפצל את השם לשני צבעים." /></p>
      </div>
      <div className={styles.colorPair}>
        <div><span className={styles.colorMark}><IdentityMark direction="open" /></span><span className={styles.colorLabel}><Copy text="צבע אחד" /></span></div>
        <div><span className={styles.colorMark}><IdentityMark direction="blue" /></span><span className={styles.colorLabel}><Copy text="נקודה בכחול" /></span></div>
      </div>
    </section>

    <div className={styles.previewLabel} aria-live="polite"><h2><Copy text="ככה זה נראה באתר" /></h2><p><Copy text={selectedDirection.title} /><span aria-hidden="true"> · </span><Copy text="השם המלא גם בטלפון" /></p></div>
    <div className={styles.preview}><Landing initialPath="services" heroOnly identity={selected} /></div>
  </main>;
}
