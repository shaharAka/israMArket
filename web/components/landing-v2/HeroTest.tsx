"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { Landing } from "./Landing";
import type { ExamplePath } from "./businessExamples";
import styles from "./hero-test.module.css";

/** Controlled visual comparison: same promise and business data; no analytics or assignment. */
export function HeroTest({ path, initialComposition, initialTypeface }: { path: ExamplePath; initialComposition: "workspace" | "tabs"; initialTypeface: "modern" | "sans" }) {
  const t = useCopy();
  const { locale } = useLanguage();
  const composition = initialComposition;
  const [typeface, setTypeface] = useState(initialTypeface);
  return <>
    <div className={styles.toolbar}>
      <strong><Copy text="בדיקת העיצוב" /></strong>
      <label><Copy text="טיפוגרפיה" /><select value={typeface} onChange={event => setTypeface(event.target.value as "modern" | "sans")}><option value="modern">{t("חדש · נקי ומרווח")}</option><option value="sans">{t("הטיפוגרפיה הקודמת")}</option></select></label>
      <Link href={`/design/business?persona=${path}&lang=${locale}`}><Copy text="למסכי המערכת עם העסק הזה" /></Link>
    </div>
    <Landing key={path} initialPath={path} heroVariant={composition} heroTypeface={typeface} heroOnly />
  </>;
}
