"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { ProductUtilities } from "@/components/language/ProductUtilities";
import { IdentityMark, type IdentityDirection } from "./IdentityMark";
import { Landing } from "./Landing";
import styles from "./identity-workshop.module.css";

const DIRECTIONS = [
  { key: "grotesk", title: "חד וברור", description: "שם מלא, משקל חזק וקצב צפוף. כיוון ענייני שמחזיק גם בכותרת קטנה." },
  { key: "geometric", title: "גאומטרי עם אופי", description: "אותיות רחבות וצורות פתוחות. תחושה טכנולוגית, עם פרטים שנותנים לשם אופי." },
  { key: "human", title: "קליל ואנושי", description: "שני משקלים באותו צבע. שם נגיש ורך יותר, בלי סימן נוסף לידו." },
  { key: "compact", title: "נוכחות קומפקטית", description: "אותיות גבוהות באותיות גדולות. כיוון חד שבולט גם כשאין הרבה מקום." },
] as const;

export function IdentityWorkshop() {
  const [selected, setSelected] = useState<IdentityDirection>("grotesk");
  const t = useCopy();
  const { locale } = useLanguage();
  return <main className={styles.workshop}>
    <header className={styles.intro}>
      <div className={styles.toolbar}><Link href={`/design/hero?lang=${locale}`}><Copy text="לחזור לתצוגת האתר" /></Link><ProductUtilities inline /></div>
      <h1><Copy text="השם הוא הסימן. ארבעה כיווני טיפוגרפיה." /></h1>
      <p><Copy text="בלי שמש, בלי אייקון נוסף. בוחרים לפי האופי של האותיות והקריאות, במחשב ובטלפון." /></p>
    </header>
    <div className={styles.directions} role="group" aria-label={t("לבחור כיוון לזהות המותג")}>
      {DIRECTIONS.map((direction, index) => <button key={direction.key} className={styles.direction}
        type="button" aria-pressed={selected === direction.key} onClick={() => setSelected(direction.key)}>
        <span className={styles.number}>0{index + 1}</span>
        <div className={styles.specimen} dir="ltr"><IdentityMark direction={direction.key} /></div>
        <div className={styles.scales} aria-hidden="true"><IdentityMark direction={direction.key} /><span className={styles.inverse}><IdentityMark direction={direction.key} compact /></span></div>
        <h2><Copy text={direction.title} /></h2><p><Copy text={direction.description} /></p>
      </button>)}
    </div>
    <div className={styles.previewLabel}><h2><Copy text="ככה זה נראה באתר" /></h2><p><Copy text="השם המלא בשורה במחשב, ובשתי שורות בטלפון." /></p></div>
    <div className={styles.preview}><Landing initialPath="services" heroOnly identity={selected} /></div>
  </main>;
}
