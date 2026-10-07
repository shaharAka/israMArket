"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { Landing } from "./Landing";
import type { ExamplePath } from "./businessExamples";
import styles from "./hero-test.module.css";

/** Controlled visual comparison: same promise and business data; no analytics or assignment. */
export function HeroTest({ path, initialComposition, initialTypeface }: { path: ExamplePath; initialComposition: "workspace" | "tabs"; initialTypeface: "sans" | "serif" }) {
  const t = useCopy();
  const { locale } = useLanguage();
  const [composition, setComposition] = useState(initialComposition);
  const [typeface, setTypeface] = useState(initialTypeface);
  return <>
    <div className={styles.toolbar}>
      <strong><Copy text="בדיקת העיצוב" /></strong>
      <label><Copy text="מבנה" /><select value={composition} onChange={event => setComposition(event.target.value as "workspace" | "tabs")}><option value="workspace">{t("התוכנית במרכז")}</option><option value="tabs">{t("המבנה הקודם · שלבים נפרדים")}</option></select></label>
      <label><Copy text="טיפוגרפיה" /><select value={typeface} onChange={event => setTypeface(event.target.value as "sans" | "serif")}><option value="sans">{t("גופן המערכת")}</option><option value="serif">{t("כותרת בסגנון עריכתי")}</option></select></label>
      <Link href={`/design/business?persona=${path}&lang=${locale}`}><Copy text="למסכי המערכת עם העסק הזה" /></Link>
      <p><Copy text="אותו מסר ואותו עסק בשתי הגרסאות. בודקים הבנה, לא תוצאות שיווק." /> <Copy text="בערבית נשאר גופן המערכת בשתי האפשרויות." /></p>
    </div>
    <Landing key={path} initialPath={path} heroVariant={composition} heroTypeface={typeface} heroOnly />
  </>;
}
