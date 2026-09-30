"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/lib/icons";
import { MotionChoice, MotionIllustration } from "@/components/motion/Motion";
import { ActionButton, DesignScope, JourneyRail, NotebookField, NotebookHeading, PaperNote, PhotoMoment, StatusLine } from "./Primitives";
import { paletteColors, designPrinciples } from "./foundations";
import { PalettePicker } from "./PalettePicker";
import { useDesignPalette } from "./palette";
import { SunOverShop } from "./SunOverShop";
import styles from "./library.module.css";
import { ComponentWorkshop, TransitionWorkshop } from "./ComponentWorkshop";
import { SegmentedControl, ToggleField } from "./Controls";
import type { MotionMood } from "@/components/motion";

function ProductScene({ businessName }: { businessName: string }) {
  const [step, setStep] = useState(0);
  const [tone, setTone] = useState("בגובה העיניים");
  const titles = ["נתחיל ברגע אחד מהעסק", "יש תמונה. עכשיו כמה מילים", "הטיוטה הראשונה שלכם מוכנה"];
  return <section className={styles.product} aria-label="דוגמה חיה לכלי הכנת הפוסט">
    <div className={styles.productTop}><span><BrandMark className={styles.smallMark} />{businessName}</span><span>כלי בתוך התוכנית</span></div>
    <div className={styles.productBody}>
      <JourneyRail label="הכנת הפוסט הראשון" steps={[{ id: "photo", label: "רגע מהעסק", state: step > 0 ? "done" : "current" }, { id: "words", label: "כמה מילים", state: step > 1 ? "done" : step === 1 ? "current" : "next" }, { id: "post", label: "פוסט ראשון", state: step > 1 ? "done" : "next" }]} />
      <div className={styles.sceneContent}>
        <div className={styles.sceneWords}><NotebookHeading eyebrow="הצעד של היום" title={titles[step]}><p>{step === 0 ? "התוכנית כבר כאן. תמונה אחת מהעסק תעזור לנו להפוך אותה לפוסט שמרגיש שלכם." : step === 1 ? "התמונה נותנת את הכיוון. באיזה סגנון נכתוב את הפוסט?" : "יש לכם נקודת התחלה. אפשר לערוך את המילים לפני שמוציאים אותן החוצה."}</p></NotebookHeading>
          {step === 1 && <div className={styles.toneChoices} aria-label="סגנון הכתיבה">{["בגובה העיניים", "קצת שובב"].map((label) => <MotionChoice key={label} selected={tone === label} onClick={() => setTone(label)}>{label}</MotionChoice>)}</div>}
          {step === 2 && <div className={styles.successLine}><StatusLine state="ready">טיוטה לדוגמה · אפשר לערוך הכל</StatusLine></div>}
          <ActionButton onClick={() => setStep((current) => current === 2 ? 0 : current + 1)}>{step === 0 ? "להוסיף תמונה לדוגמה" : step === 1 ? "להכין טיוטה לדוגמה" : "לנסות מההתחלה"}</ActionButton>
          <p className={styles.exampleNote}>הדגמה בלבד. שום דבר לא נשמר או מתפרסם.</p>
        </div>
        <div className={styles.sceneVisual}>{step === 2 ? <div className={styles.postDraft}><span className={styles.draftEyebrow}>מהעסק שלכם, ללקוחות שלכם</span><MotionIllustration kind="milestone" active className={styles.postIllustration} /><h3>{businessName}</h3><p>{tone === "קצת שובב" ? "יש לנו פינה חמה בשבילכם, ורק תירוץ אחד חסר: שתבואו. השבוע מחכה לכם משהו חדש אצלנו." : "משהו קטן וטוב באמצע היום. השבוע בחרנו לשתף אתכם ברגע שאנחנו אוהבים מהעסק שלנו."}</p><span className={styles.draftFoot}>טיוטת דוגמה · {tone}</span></div> : <><PhotoMoment filled={step > 0} businessName={businessName} /><span className={styles.handwritten}>{step === 0 ? "כאן הסיפור שלכם מתחיל" : "זה כבר מרגיש שלכם"}</span></>}</div>
      </div>
    </div>
  </section>;
}

export function DesignLibrary() {
  const { palette } = useDesignPalette();
  const [mood, setMood] = useState<MotionMood>("quiet");
  const [reduced, setReduced] = useState(false);
  const [business, setBusiness] = useState("ת׳ציצי פנימה");
  const businessName = business.trim() || "העסק שלכם";
  return <DesignScope className={styles.page} palette={palette} mood={mood} reduced={reduced}><div className={styles.container}>
    <header className={styles.header}><Link href="/preview" className={styles.brand}><BrandMark className={styles.brandMark} />ישראמארקט</Link><span className={styles.headerLabel}>ספריית העיצוב</span><nav aria-label="מעבדות עיצוב"><a href="#components">רכיבים</a><a href="#transitions">מעברים</a><Link href="/preview">המוצר</Link><Link href="/motion">תנועה ↗</Link></nav></header>
    <main>
      <section className={styles.hero} aria-labelledby="design-title"><div><h1 id="design-title">כחול. שמש.<br />יום עבודה.</h1><p className={styles.heroText}>התוכנית במרכז. הכיוון, המדידה וההחלטות; כלי הביצוע באים אחריהם.</p><Link href="/preview" className={styles.productLink}>לראות את המוצר ←</Link></div><div className={styles.heroSketch}><SunOverShop key={palette.id} reduced={reduced} /></div></section>
      <details className={styles.libraryDetails}><summary>הגדרות התצוגה · {palette.name} · {mood === "quiet" ? "עדין" : "עם אופי"}</summary><PalettePicker compact /><div className={styles.libraryControls}><SegmentedControl label="אופי התנועה" value={mood} onChange={value => setMood(value as MotionMood)} options={[{value:"quiet",label:"עדין"},{value:"playful",label:"עם אופי"}]} /><ToggleField label="הפחתת תנועה" checked={reduced} onChange={setReduced} /></div></details>
      <ComponentWorkshop />
      <TransitionWorkshop />
      <details className={styles.libraryDetails}><summary>כלי הפוסטים · אחרי מדידה ובחירת חומרי הגלם</summary><section id="scene" className={styles.sceneSection}><ProductScene businessName={businessName} /><div className={styles.personalise}><NotebookField label="שם העסק בדוגמה" value={business} onChange={setBusiness} hint="שנו את השם וראו אותו בתוך המסך." /><PaperNote label="מה נותן למסך אופי">שם, תמונה וסיפור מהעסק.</PaperNote></div></section></details>
      <details className={styles.libraryDetails}><summary>הבסיס · צבע, טיפוגרפיה ופרטים</summary><section id="foundations" className={styles.foundations}><div className={styles.foundationColumns}><div className={styles.palette}><h3>רקע, דיו, בית ושמש</h3><div className={styles.swatches}>{paletteColors(palette).map(color => <div key={color.token}><span style={{ background: color.value }} /><strong>{color.name}</strong><small>{color.purpose}</small></div>)}</div></div><div className={styles.typeSample}><h3>כותרת, הסבר, פעולה</h3><p className={styles.typeDisplay}>צעד קטן.<br />עסק שלם מאחוריו.</p><p className={styles.typeBody}>כותרת קצרה ומשקל ברור. ההסבר מופיע כשצריך אותו.</p></div><div className={styles.detailSample}><h3>הפרטים שלנו</h3><BrandMark className={styles.detailMark} /><p>השמש והעסק. הצבעים של העסק נשארים בתוכן שלו.</p></div></div></section></details>
      <details className={styles.libraryDetails}><summary>עקרונות השימוש</summary><div className={styles.principleList}>{designPrinciples.map((item, index) => <div key={item.title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{item.title}</h3><p>{item.text}</p></div>)}</div></details>
      <footer className={styles.footer}><span>ישראמארקט · ספרייה חיה</span><Link href="/motion">אוסף התנועות ←</Link></footer>
    </main>
  </div></DesignScope>;
}
