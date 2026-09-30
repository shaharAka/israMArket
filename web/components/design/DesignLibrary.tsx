"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/lib/icons";
import { DesignScope } from "./Primitives";
import { PalettePicker } from "./PalettePicker";
import { useDesignPalette } from "./palette";
import { SunOverShop } from "./SunOverShop";
import { ComponentWorkshop, TransitionWorkshop } from "./ComponentWorkshop";
import { ResultsWorkshop } from "./ResultsWorkshop";
import { SegmentedControl, ToggleField } from "./Controls";
import { EditorIcon, type EditorIconKind } from "@/components/posts/EditorIcon";
import { PhotoPlaceholder } from "@/components/posts/PhotoPlaceholder";
import type { MotionMood } from "@/components/motion";
import styles from "./library.module.css";

const icons: { kind: EditorIconKind; label: string }[] = [{kind:"text",label:"טקסט"},{kind:"tone",label:"טון"},{kind:"photo",label:"תמונה"},{kind:"download",label:"הורדה"},{kind:"publish",label:"פרסום"}];

/** A working reference, with one area open at a time instead of a long demonstration page. */
export function DesignLibrary() {
  const { palette } = useDesignPalette();
  const [area, setArea] = useState("language");
  const [mood, setMood] = useState<MotionMood>("quiet");
  const [reduced, setReduced] = useState(false);
  return <DesignScope className={styles.page} palette={palette} mood={mood} reduced={reduced}><div className={styles.container}>
    <header className={styles.header}><Link href="/preview" className={styles.brand}><BrandMark className={styles.brandMark} />ישראמארקט</Link><span className={styles.headerLabel}>ספריית העיצוב</span><Link href="/preview" className={styles.openProduct}>למוצר ←</Link></header>
    <nav className={styles.libraryNav} aria-label="חלקי ספריית העיצוב">{[{id:"language",label:"השפה"},{id:"components",label:"רכיבים"},{id:"results",label:"תוצאות"},{id:"transitions",label:"מעברים ותנועה"}].map(item => <button key={item.id} type="button" aria-pressed={area === item.id} onClick={() => setArea(item.id)}>{item.label}</button>)}</nav>
    <main>
      {area === "language" && <>
        <section className={styles.hero} aria-labelledby="design-title"><div><p className={styles.kicker}>כיוון, מדידה, צעד הבא</p><h1 id="design-title">תוכנית ברורה.<br /><span>קצת שמש בדרך.</span></h1><p className={styles.heroText}>דיו חד, מרווח לקרוא, ונגיעות של צבע ועומק. העסק והסיפור שלו נותנים את האישיות.</p></div><div className={styles.heroSketch}><SunOverShop reduced={reduced} /></div></section>
        <PalettePicker />
        <section className={styles.reference} aria-label="טיפוגרפיה וסימנים">
          <div className={styles.typeReference}><h2>טיפוגרפיה אחת. סדר ברור.</h2><p className={styles.typeDisplay}>הכיוון לפני הפרטים.</p><p className={styles.typeBody}>Heebo בכל הממשק. כותרת, טקסט ומידע משלים; משקל ומרווח יוצרים את ההיררכיה.</p><span className={styles.referenceCaption}>כותרת 28 · טקסט 14 · משלים 12</span></div>
          <div className={styles.iconReference}><h2>סימנים קטנים, עם תפקיד</h2><div>{icons.map(icon => <span key={icon.kind}><EditorIcon kind={icon.kind} /><small>{icon.label}</small></span>)}</div><p>אותו קו בכלי הפוסטים. צבע השמש נשאר פרט קטן.</p></div>
        </section>
        <div className={styles.brandRule}><BrandMark className={styles.detailMark} /><div><h2>לממשק יש שפה. לעסק יש מותג.</h2><p>הלוגו, הצבעים והתמונות של העסק מופיעים במותג ובפוסטים שלו. בחירת צבעי הממשק כאן עוברת גם לדמו.</p></div></div>
      </>}
      {area === "components" && <>
        <ComponentWorkshop />
        <section className={styles.reference} aria-label="כלים בתוך המוצר"><div className={styles.photoReference}><PhotoPlaceholder /><div><h2>תמונה שמחכה לעסק שלכם</h2><p>מקום רך לצילום אמיתי, עם הוראות לבחירה ולהעלאה.</p><Link href="/preview">לנסות בעורך הפוסטים ←</Link></div></div><div className={styles.typeReference}><h2>לוח התוכנית</h2><p className={styles.typeBody}>בחירת יום, מעבר בין חודשים, פוסטים ומשימות. פרטי היום מופיעים לצד הלוח.</p><Link href="/preview">לנסות את הלוח בדמו ←</Link></div></section>
      </>}
      {area === "transitions" && <>
        <div className={styles.motionIdentity}><div><h1>תנועה עם סיבה.</h1><p>פעולה, שינוי ותוצאה. בזמן שקוראים, התוכן נשאר יציב.</p><Link href="/motion">לכל התנועות ←</Link></div><SunOverShop reduced={reduced} /></div>
        <TransitionWorkshop />
      </>}
      {area === "results" && <ResultsWorkshop />}
      <div className={styles.libraryControls}><SegmentedControl label="אופי התנועה" value={mood} onChange={value => setMood(value as MotionMood)} options={[{value:"quiet",label:"עדין"},{value:"playful",label:"עם אופי"}]} /><ToggleField label="הפחתת תנועה" checked={reduced} onChange={setReduced} /></div>
      <footer className={styles.footer}><span>ישראמארקט · ספרייה חיה</span><Link href="/preview">למסכי המוצר ←</Link></footer>
    </main>
  </div></DesignScope>;
}
