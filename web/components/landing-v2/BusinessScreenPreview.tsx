"use client";

import Link from "next/link";
import { Copy, useLanguage } from "@/components/language/LanguageProvider";
import { ProductFeatureShowcase, type ProductScreen } from "./ProductFeatureShowcase";
import { BUSINESS_EXAMPLES, type ExamplePath } from "./businessExamples";
import { BusinessRoleSelector } from "./BusinessRoleSelector";
import styles from "./business-screen-preview.module.css";

/** Same plan/results components as the app, rendered with local fixture props only. */
export function BusinessScreenPreview({ path, screen, post }: { path: ExamplePath; screen: ProductScreen; post?: number }) {
  const { locale } = useLanguage();
  return <main className={styles.page}>
    <header><Link href={`/design/hero?persona=${path}&lang=${locale}`}><Copy text="לבדיקת האתר" /></Link></header>
    <div className={styles.heading}><h1><Copy text={BUSINESS_EXAMPLES[path].name} /></h1></div>
    <BusinessRoleSelector path={path} hrefFor={key => `/design/business?persona=${key}&screen=${screen}&lang=${locale}`} />
    <div className={styles.frame}><ProductFeatureShowcase key={`${path}-${screen}`} path={path} initialScreen={screen} initialPost={post} /></div>
    {path === "nonprofit" && <p className={styles.notice}><Copy text="המסלול לעמותות בפיתוח." /></p>}
  </main>;
}
