"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { ProductUtilities } from "@/components/language/ProductUtilities";
import { PriceAnswer, CancellationAnswer } from "@/components/language/PricingAnswers";
import { DeletedNotice } from "@/components/landing/DeletedNotice";
import { PRICE_ILS, TRIAL_LABEL, VAT_NOTE } from "@/lib/pricing";
import { BrandWordmark } from "./BrandWordmark";
import { ProcessAnimation } from "./ProcessAnimation";
import { PROCESS_HERO, PROCESS_STORY, PROCESS_BENEFITS } from "./processStory";
import { PROCESS_ROLES, defaultProcessRole, isProcessRole, type ProcessRole } from "./processExamples";
import type { ExamplePath } from "./businessExamples";
import type { IdentityDirection } from "./IdentityMark";
import { artSerif, siteSerif, siteClean } from "./siteFonts";
import styles from "./process-story.module.css";
import "./lv2.css";
import "./showcase.css";

/** The arrival route informs signup. Hover previews are owned by each section. */
export function ProcessLanding({ initialPath, identity }: { initialPath?: ExamplePath; identity?: IdentityDirection }) {
  const t = useCopy();
  const { locale } = useLanguage();
  const [role, setRole] = useState<ProcessRole | null>(() => defaultProcessRole(initialPath));
  useEffect(() => {
    const read = () => {
      const segment = new URLSearchParams(window.location.search).get("segment");
      setRole(isProcessRole(segment) ? segment : defaultProcessRole(initialPath));
    };
    const timer = window.setTimeout(read, 0);
    window.addEventListener("popstate", read);
    return () => { window.clearTimeout(timer); window.removeEventListener("popstate", read); };
  }, [initialPath]);
  const selected = PROCESS_ROLES.find(item => item.segment === role);
  // A generic homepage must not silently choose “service provider” for a new owner.
  const start = `/start?lang=${locale}${selected ? `&model=${selected.path}&segment=${selected.segment}` : ""}`;
  return <div className={`lv2 lv2-site ${styles.page} ${siteClean.variable} ${artSerif.variable} ${siteSerif.variable}`} data-business={selected?.path ?? "all"} data-process-role={role ?? "all"} data-hero-type="modern" data-design="signal-punch">
    <header className={`lv2-nav ${styles.header}`}><div className={`lv2-wrap lv2-nav-row ${styles.headerRow}`}>
      <Link href="/" className="lv2-brand" aria-label={t("ישראמארקט")}><BrandWordmark direction={identity} /></Link>
      <div className={`lv2-nav-end ${styles.headerActions}`}><ProductUtilities inline /><Link href={`/login?lang=${locale}`} className="lv2-login"><Copy text="להיכנס" /></Link><Link href={start} className="lv2-btn-quiet"><Copy text={TRIAL_LABEL} /></Link></div>
    </div></header>
    <main>
      <section className={styles.hero} aria-labelledby="process-title"><div className={`lv2-wrap ${styles.heroLayout}`}>
        <h1 id="process-title"><Copy text={PROCESS_HERO.title} /></h1>
        <div className={styles.heroSupport}><p className={styles.heroBody}><Copy text={PROCESS_HERO.body} /></p>
        <Link href={start} className={`lv2-btn ${styles.start}`}><Copy text={TRIAL_LABEL} /></Link>
        <p className={styles.signupNote}><Copy text="בלי כרטיס אשראי. בלי התחייבות." /></p></div>
      </div></section>
      <div id="story" className={`lv2-wrap ${styles.story}`}>
        <div className={styles.storyIntro}><h2><Copy text="ככה זה עובד" /></h2><p><Copy text="מהיכרות עם העסק שלך, לתוכנית, לקמפיין ולתוצאות." /></p></div>
        {PROCESS_STORY.map((step, index) => <ProcessSection key={`${step.id}-${role ?? "all"}`} step={step} index={index} initialRole={role} start={start} />)}
      </div>
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

const GOAL_ROLE_LABELS = ["יותר תרומות", "יותר מתנסים במוצר", "יותר פניות לשירות", "יותר קניות באתר", "יותר לקוחות בחנות"];
function ProcessSection({ step, index, initialRole, start }: { step: typeof PROCESS_STORY[number]; index: number; initialRole: ProcessRole | null; start: string }) {
  const t = useCopy();
  const [role, selectRole] = useState<ProcessRole | null>(initialRole ?? (step.id === "campaign" ? "online_shop" : null));
  const hasRoles = ["research", "goals", "plan", "campaign"].includes(step.id);
  const benefit = PROCESS_BENEFITS[step.id];
  return <section id={step.id} className={styles.section} data-step={step.id} aria-labelledby={`process-${step.id}`} data-animation-role={role ?? "all"}>
    <div className={styles.message}><p className={styles.sectionLabel}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><Copy text={step.label} /></p><h2 id={`process-${step.id}`}><Copy text={step.title} /></h2>
      {hasRoles && <fieldset className={styles.roleSelector} aria-label={t(step.id === "goals" ? "מטרות לפי סוג הפעילות" : "סוג העסק")}><div className={styles.roleChoices}>{PROCESS_ROLES.map((item,i) => <button type="button" key={item.segment} aria-pressed={role === item.segment} onMouseEnter={() => selectRole(item.segment)} onFocus={() => selectRole(item.segment)} onClick={() => selectRole(item.segment)}><Copy text={step.id === "goals" ? GOAL_ROLE_LABELS[i] : item.label} /></button>)}</div></fieldset>}
      <p className={styles.sectionBody}><Copy text={step.body} /></p>
      {benefit && <p className={styles.benefit}><Copy text={benefit} /></p>}
      <Link href={start} className={`lv2-btn ${styles.start} ${styles.stepStart}`}><Copy text={TRIAL_LABEL} /></Link>
      {step.id === "trial" && <div id="price" className={styles.priceDetails}><strong><Copy text="אחר כך: {arg_0} ₪ לחודש" args={{ arg_0: PRICE_ILS }} /></strong><span><Copy text={VAT_NOTE} /></span><p><Copy text="המנוי כולל תוכנית חודשית, תכנון קמפיין, כתיבה ועיצוב פוסטים וניתוח התוצאות. יצירת תמונות וסרטונים כפופה למכסת המנוי. תקציב הפרסום ברשתות משולם בנפרד." /></p></div>}
    </div>
    <ProcessAnimation key={`${step.id}-${role ?? "all"}`} step={step.id} role={role} />
  </section>;
}
