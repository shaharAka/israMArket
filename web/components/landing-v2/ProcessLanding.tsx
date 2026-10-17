"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { ProductUtilities } from "@/components/language/ProductUtilities";
import { PriceAnswer, CancellationAnswer } from "@/components/language/PricingAnswers";
import { DeletedNotice } from "@/components/landing/DeletedNotice";
import { PRICE_ILS, VAT_NOTE } from "@/lib/pricing";
import { BrandWordmark } from "./BrandWordmark";
import { ProcessAnimation } from "./ProcessAnimation";
import { PROCESS_HERO, PROCESS_STORY } from "./processStory";
import type { ExamplePath } from "./businessExamples";
import type { IdentityDirection } from "./IdentityMark";
import { artSerif, siteSerif, siteClean } from "./siteFonts";
import styles from "./process-story.module.css";
import "./lv2.css";
import "./showcase.css";

/** The audience line is information, never a hidden business-type selection. */
export function ProcessLanding({ initialPath, identity }: { initialPath?: ExamplePath; identity?: IdentityDirection }) {
  const t = useCopy();
  const { locale } = useLanguage();
  const path = initialPath || "services";
  const [segment, setSegment] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setSegment(new URLSearchParams(window.location.search).get("segment"));
    const timer = window.setTimeout(read, 0);
    window.addEventListener("popstate", read);
    return () => { window.clearTimeout(timer); window.removeEventListener("popstate", read); };
  }, []);
  // A generic homepage must not silently choose “service provider” for a new owner.
  const start = `/start?lang=${locale}${initialPath ? `&model=${initialPath}` : ""}${segment ? `&segment=${encodeURIComponent(segment)}` : ""}`;
  return <div className={`lv2 lv2-site ${styles.page} ${siteClean.variable} ${artSerif.variable} ${siteSerif.variable}`} data-business={path} data-hero-type="modern">
    <header className={`lv2-nav ${styles.header}`}><div className={`lv2-wrap lv2-nav-row ${styles.headerRow}`}>
      <Link href="/" className="lv2-brand" aria-label={t("ישראמארקט")}><BrandWordmark direction={identity} /></Link>
      <div className={`lv2-nav-end ${styles.headerActions}`}><ProductUtilities inline /><Link href={`/login?lang=${locale}`} className="lv2-login"><Copy text="להיכנס" /></Link><Link href={start} className="lv2-btn-quiet"><Copy text="להתחיל בחינם" /></Link></div>
    </div></header>
    <main>
      <section className={styles.hero} aria-labelledby="process-title"><div className="lv2-wrap">
        <h1 id="process-title"><Copy text={PROCESS_HERO.title} /></h1>
        <p className={styles.heroBody}><Copy text={PROCESS_HERO.body} /></p>
        <p className={styles.audience}><Copy text={PROCESS_HERO.audience} /></p>
        <Link href={start} className={`lv2-btn ${styles.start}`}><Copy text="להתחיל חודש בחינם" /></Link>
        <p className={styles.signupNote}><Copy text="בלי כרטיס אשראי. בלי התחייבות." /></p>
      </div></section>
      <div id="story" className={`lv2-wrap ${styles.story}`}>
        <div className={styles.storyIntro}><h2><Copy text="ככה זה עובד" /></h2><span dir="ltr" aria-hidden="true">01—07</span></div>
        {PROCESS_STORY.map((step, index) => <section key={step.id} id={step.id} className={styles.section} aria-labelledby={`process-${step.id}`}>
          <div className={styles.message}><p className={styles.sectionLabel}><span aria-hidden="true">0{index + 1}</span><Copy text={step.label} /></p><h2 id={`process-${step.id}`}><Copy text={step.title} /></h2><p className={styles.sectionBody}><Copy text={step.body} /></p></div>
          <ProcessAnimation step={step.id} path={path} />
        </section>)}
      </div>
      <section id="price" className={styles.trial} aria-labelledby="process-trial"><div className={`lv2-wrap ${styles.trialInner}`}>
        <span className={styles.sectionLabel}><Copy text="אפשר פשוט להתחיל" /></span>
        <h2 id="process-trial"><Copy text="חודש ראשון חינם." /></h2>
        <p><Copy text="להכיר את העסק, לבנות תוכנית ולהתחיל להכין את הקמפיין הראשון. הכול במקום אחד." /></p>
        <Link href={start} className={`lv2-btn ${styles.start}`}><Copy text="להתחיל חודש בחינם" /></Link>
        <p className={styles.signupNote}><Copy text="בלי כרטיס אשראי. בלי התחייבות." /></p>
        <div className={styles.priceDetails}><strong><Copy text="אחר כך: {arg_0} ₪ לחודש" args={{ arg_0: PRICE_ILS }} /></strong><span><Copy text={VAT_NOTE} /></span><p><Copy text="המנוי כולל תוכנית חודשית, תכנון קמפיין, כתיבה ועיצוב פוסטים וניתוח התוצאות. יצירת תמונות וסרטונים כפופה למכסת המנוי. תקציב הפרסום ברשתות משולם בנפרד." /></p></div>
      </div></section>
      <section className={`lv2-wrap ${styles.faq}`} aria-labelledby="process-questions"><h2 id="process-questions"><Copy text="עוד כמה דברים שכדאי לדעת" /></h2><div>
        <details><summary><Copy text="צריך לחבר הכול כדי להתחיל?" /></summary><p><Copy text="לא. מתחילים בשיחה ובמחקר על המידע הציבורי של העסק. אחרי ההרשמה, מוסיפים חיבורים לפי הצורך וממשיכים לבנות את התוכנית." /></p></details>
        <details><summary><Copy text="מי מפרסם את הפוסטים?" /></summary><p><Copy text="אנחנו מכינים את החומרים. לך נשאר לבדוק את התמונה והפרטים, לערוך אם צריך ולפרסם. שום דבר לא מתפרסם בלי החלטה שלך." /></p></details>
        <details><summary><Copy text="איך שומרים על המידע שלי?" /></summary><p><Copy text="מחברים חשבונות במסך הרשאות של השירות עצמו. הסיסמה לא עוברת אלינו. אפשר לנתק את החיבור או למחוק את החשבון." /> <Link href={`/security?lang=${locale}`}><Copy text="עוד על אבטחה ופרטיות" /></Link></p></details>
        <details><summary><Copy text="מה קורה אחרי החודש החינמי?" /></summary><p><PriceAnswer /></p></details>
        <details><summary><Copy text="אפשר לבטל?" /></summary><p><CancellationAnswer /></p></details>
      </div></section>
    </main>
    <footer className="lv2-foot"><div className="lv2-wrap lv2-foot-row"><span><Copy text="ישראמארקט" /></span><Link href={`/security?lang=${locale}`}><Copy text="אבטחה ופרטיות" /></Link><Link href={`/terms?lang=${locale}`}><Copy text="תנאי שימוש" /></Link></div></footer>
    <DeletedNotice />
  </div>;
}
