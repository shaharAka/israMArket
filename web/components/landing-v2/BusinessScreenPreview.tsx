"use client";

import Link from "next/link";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { ProductFeatureShowcase, type ProductScreen } from "./ProductFeatureShowcase";
import { BUSINESS_EXAMPLES, type ExamplePath } from "./businessExamples";
import { PERSONA_PAGES } from "./personaPages";
import styles from "./business-screen-preview.module.css";

/** Same plan/results components as the app, rendered with local fixture props only. */
export function BusinessScreenPreview({ path, screen, post }: { path: ExamplePath; screen: ProductScreen; post?: number }) {
  const t = useCopy();
  const { locale } = useLanguage();
  return <main className={styles.page}>
    <header><Link href={`/design/hero?persona=${path}&lang=${locale}`}><Copy text="לבדיקת האתר" /></Link></header>
    <div className={styles.heading}><h1><Copy text={BUSINESS_EXAMPLES[path].name} /></h1></div>
    <nav className={styles.roles} aria-label={t("סוג העסק")}>
      {Object.entries(PERSONA_PAGES).map(([key, item]) => <Link key={key} href={`/design/business?persona=${key}&screen=${screen}&lang=${locale}`} aria-current={path === key ? "page" : undefined}><Copy text={item.role} /></Link>)}
    </nav>
    <div className={styles.frame}><ProductFeatureShowcase key={`${path}-${screen}`} path={path} initialScreen={screen} initialPost={post} /></div>
    {path === "nonprofit" && <p className={styles.notice}><Copy text="המסלול לעמותות בפיתוח." /></p>}
  </main>;
}
