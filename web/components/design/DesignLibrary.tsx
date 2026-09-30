"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandMark, IconArrowLeft } from "@/lib/icons";
import { MotionChoice, MotionIllustration } from "@/components/motion/Motion";
import { ActionButton, DesignScope, JourneyRail, NotebookField, NotebookHeading, PaperNote, PhotoMoment, StatusLine } from "./Primitives";
import { designPalette, designPrinciples } from "./foundations";
import styles from "./library.module.css";

function ProductScene({ businessName }: { businessName: string }) {
  const [step, setStep] = useState(0);
  const [tone, setTone] = useState("בגובה העיניים");
  const titles = ["נתחיל ברגע אחד מהעסק", "יש תמונה. עכשיו כמה מילים", "הטיוטה הראשונה שלכם מוכנה"];
  return <section className={styles.product} aria-label="דוגמה חיה למסך השבוע הראשון">
    <div className={styles.productTop}><span><BrandMark className={styles.smallMark} />{businessName}</span><span>שבוע 01 · תקופת ניסיון</span></div>
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
  const [business, setBusiness] = useState("ת׳ציצי פנימה");
  const businessName = business.trim() || "העסק שלכם";
  return <DesignScope className={styles.page}><div className={styles.container}>
    <header className={styles.header}><Link href="/" className={styles.brand}><BrandMark className={styles.brandMark} />ישראמארקט</Link><span className={styles.headerLabel}>ספריית העיצוב</span><nav aria-label="מעבדות עיצוב"><a href="#foundations">השפה</a><a href="#scene">בתוך המוצר</a><Link href="/motion">תנועה <span aria-hidden="true">↗</span></Link></nav></header>
    <main>
      <section className={styles.hero} aria-labelledby="design-title"><div><p className={styles.kicker}>שפה של ישראמארקט · כיוון ראשון</p><h1 id="design-title">המחברת<br />של <span>העסק.</span></h1><p className={styles.heroText}>מקום שקט לעשות את הצעד הבא. עם המילים שלכם, קווים שיש בהם יד, ופרטים קטנים שמכירים את העסק.</p></div><div className={styles.heroSketch} aria-hidden="true"><svg viewBox="0 0 300 220" fill="none"><path d="M50 177h202M240 49v151M55 49v151" stroke="#d6daca" strokeWidth="1" /><path d="M246 170h-44q-12 0-12-12v-20q0-12-12-12h-56q-12 0-12-12v-30q0-12-12-12H54" stroke="#6c815c" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 5" /><path d="m210 140 9-18h32l9 18c-2 7-10 7-12 0-2 7-10 7-12 0-2 7-10 7-12 0-2 7-10 7-12 0M216 147v23m38-23v23m-43 0h48" stroke="#42583a" strokeWidth="2" /><path d="M225 122a11 11 0 0 1 22 0" fill="#eee2b6" stroke="#42583a" strokeWidth="1.5" /><circle cx="150" cy="126" r="5" fill="#6c815c" /><circle cx="55" cy="72" r="7" fill="#f9f8f3" stroke="#6c815c" strokeWidth="2" /><path d="M55 47V25h21l-4 6 4 6H55" stroke="#42583a" strokeWidth="1.6" /><path d="M83 182c31 3 45-2 62-1" stroke="#abb69e" strokeWidth="1.5" strokeLinecap="round" /></svg><span>מהעסק שלכם, צעד־צעד.</span></div></section>

      <section id="scene" className={styles.sceneSection} aria-labelledby="scene-title"><div className={styles.sectionLabel}><h2 id="scene-title">01 / ככה זה מרגיש בתוך המוצר</h2><Link href="/motion">לנסות את אוסף התנועות <IconArrowLeft className={styles.linkArrow} /></Link></div><ProductScene businessName={businessName} /><div className={styles.personalise}><NotebookField label="איזה עסק נמצא במחברת?" value={business} onChange={setBusiness} hint="שנו את השם וראו אותו בתוך המסך." /><PaperNote label="קודם כל, להקשיב">שם, תמונה וסיפור אמיתי מהעסק. הפרטים האלה נותנים לעמוד אופי עוד לפני שמוסיפים צבע.</PaperNote></div></section>

      <section id="foundations" className={styles.foundations} aria-labelledby="foundations-title"><div className={styles.sectionLabel}><h2 id="foundations-title">02 / הדברים שחוזרים בכל מסך</h2><span>מעט מרכיבים. שפה אחת.</span></div><div className={styles.foundationColumns}><div className={styles.palette}><h3>נייר, דיו, מרווה ושמש</h3><div className={styles.swatches}>{designPalette.map((color) => <div key={color.token}><span style={{ background: color.value }} /><strong>{color.name}</strong><small>{color.purpose}</small></div>)}</div><p>צבע עוזר להתמצא. השם והתמונות של העסק נשארים שלו.</p></div><div className={styles.typeSample}><h3>עברית שמרגישה טבעית</h3><p className={styles.typeDisplay}>צעד קטן.<br />עסק שלם מאחוריו.</p><p className={styles.typeBody}>כותרת קצרה, משקל ברור ומרווח לקריאה. ההסבר מופיע כשצריך אותו.</p></div><div className={styles.detailSample}><h3>הפרטים שלנו</h3><div className={styles.detailObjects}><BrandMark className={styles.detailMark} /><svg viewBox="0 0 140 35" fill="none" aria-hidden="true"><path d="M6 27c22-20 34 11 57-6s42-13 70-11" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 5" strokeLinecap="round" /><path d="m125 3 8 7-9 7" stroke="currentColor" strokeWidth="1.6" /></svg></div><p>דוכן עם שמש. קו של דרך. פינה מקופלת. סימן אישור שנכתב בקו אחד.</p></div></div></section>

      <section className={styles.principles} aria-labelledby="principles-title"><div className={styles.sectionLabel}><h2 id="principles-title">03 / איך שומרים על האופי</h2></div><div className={styles.principleList}>{designPrinciples.map((item, index) => <div key={item.title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{item.title}</h3><p>{item.text}</p></div>)}</div></section>
      <footer className={styles.footer}><span>ישראמארקט · ספרייה חיה, מהדורה ראשונה</span><details><summary>למפתחים: רכיבים ושימוש</summary><p>הספרייה נמצאת ב־<code dir="ltr">web/components/design</code>. רכיבי התנועה נמצאים ב־<code dir="ltr">web/components/motion</code>. משתני העיצוב משותפים, הדוגמאות מבודדות מהחשבון, והאנימציות מכבדות את העדפות המכשיר.</p><Link href="/motion">למעבדת התנועה ←</Link></details></footer>
    </main>
  </div></DesignScope>;
}
