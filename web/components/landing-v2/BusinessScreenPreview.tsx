"use client";

import Link from "next/link";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { BusinessProductProof } from "./BusinessProductProof";
import { BUSINESS_EXAMPLES, type ExamplePath } from "./businessExamples";
import { PERSONA_PAGES } from "./personaPages";
import styles from "./business-screen-preview.module.css";

/** Same plan/results components as the app, rendered with local fixture props only. */
export function BusinessScreenPreview({ path, screen }: { path: ExamplePath; screen: "plan" | "results" }) {
  const t = useCopy();
  const { locale } = useLanguage();
  return <main className={styles.page}>
    <header><Link href={`/design/hero?persona=${path}&lang=${locale}`}><Copy text="לבדיקת האתר" /></Link><p><Copy text="נתוני דוגמה בלבד" /></p></header>
    <div className={styles.heading}><p><Copy text="רכיבים מהמערכת" /></p><h1><Copy text={BUSINESS_EXAMPLES[path].name} /></h1></div>
    <nav className={styles.roles} aria-label={t("עסק לדוגמה")}>
      {Object.entries(PERSONA_PAGES).map(([key, item]) => <Link key={key} href={`/design/business?persona=${key}&screen=${screen}&lang=${locale}`} aria-current={path === key ? "page" : undefined}><Copy text={item.role} /></Link>)}
    </nav>
    <nav className={styles.screens} aria-label={t("מסך לדוגמה")}><Link href={`/design/business?persona=${path}&screen=plan&lang=${locale}`} aria-current={screen === "plan" ? "page" : undefined}><Copy text="התוכנית" /></Link><Link href={`/design/business?persona=${path}&screen=results&lang=${locale}`} aria-current={screen === "results" ? "page" : undefined}><Copy text="התוצאות והצעד הבא" /></Link></nav>
    <div className={styles.frame}><BusinessProductProof key={`${path}-${screen}`} path={path} screen={screen} /></div>
    {path === "nonprofit" && <p className={styles.notice}><Copy text="המסלול לעמותות בפיתוח. זו הדגמה של כיוון העיצוב, ולא מסלול פעיל בחשבון." /></p>}
  </main>;
}
