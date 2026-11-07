"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { ProductUtilities } from "@/components/language/ProductUtilities";
import { PriceAnswer, CancellationAnswer } from "@/components/language/PricingAnswers";
import { DeletedNotice } from "@/components/landing/DeletedNotice";
import { PRICE_ILS, VAT_NOTE } from "@/lib/pricing";
import { BrandWordmark } from "./BrandWordmark";
import { ProcessAnimation } from "./ProcessAnimation";
import { TrialCtaLabel } from "./TrialCtaLabel";
import { SignalHero, ReactiveWords } from "./SignalHero";
import { PROCESS_STORY, PROCESS_BENEFITS, type ProcessStep } from "./processStory";
import { PROCESS_ROLES, defaultProcessRole, isProcessRole, type ProcessRole } from "./processExamples";
import type { ExamplePath } from "./businessExamples";
import type { IdentityDirection } from "./IdentityMark";
import { artSerif, siteSerif, siteClean } from "./siteFonts";
import styles from "./process-story.module.css";
import rhythm from "./process-rhythm.module.css";
import { IconChevron } from "@/lib/icons";
import "./lv2.css";
import "./showcase.css";

/** The arrival route informs signup. Hover previews are owned by each section. */
export function ProcessLanding({ initialPath, identity }: { initialPath?: ExamplePath; identity?: IdentityDirection }) {
  const t = useCopy();
  const { locale } = useLanguage();
  const [palette, setPalette] = useState("punch");
  const [role, setRole] = useState<ProcessRole | null>(() => defaultProcessRole(initialPath));
  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(window.location.search);
      const segment = params.get("segment");
      setPalette(params.get("palette") === "punch-jade" ? "punch-jade" : "punch");
      setRole(isProcessRole(segment) ? segment : defaultProcessRole(initialPath));
    };
    const timer = window.setTimeout(read, 0);
    window.addEventListener("popstate", read);
    return () => { window.clearTimeout(timer); window.removeEventListener("popstate", read); };
  }, [initialPath]);
  // One example business across the story: a choice in research or goals carries to the
  // later chapters. It never changes the signup route, and an arrival route resets it.
  const [choice, setChoice] = useState<{ base: ProcessRole | null; role: ProcessRole } | null>(null);
  const shown: ProcessRole = (choice && choice.base === role ? choice.role : role) ?? "online_shop";
  const chooseExample = useCallback((next: ProcessRole) => setChoice({ base: role, role: next }), [role]);
  const selected = PROCESS_ROLES.find(item => item.segment === role);
  // A generic homepage must not silently choose “service provider” for a new owner.
  const start = `/start?lang=${locale}${selected ? `&model=${selected.path}&segment=${selected.segment}` : ""}`;
  return <div className={`lv2 lv2-site ${styles.page} ${siteClean.variable} ${artSerif.variable} ${siteSerif.variable}`} data-business={selected?.path ?? "all"} data-process-role={role ?? "all"} data-hero-type="modern" data-design="signal-punch" data-palette={palette}>
    <header className={`lv2-nav ${styles.header}`}><div className={`lv2-wrap lv2-nav-row ${styles.headerRow}`}>
      <Link href="/" className="lv2-brand" aria-label={t("ישראמארקט")}><BrandWordmark direction={identity} /></Link>
      <div className={`lv2-nav-end ${styles.headerActions}`}><ProductUtilities inline /><Link href={`/login?lang=${locale}`} className="lv2-login"><Copy text="להיכנס" /></Link><Link href={start} className="lv2-btn-quiet"><TrialCtaLabel /></Link></div>
    </div></header>
    <main>
      <SignalHero start={start} role={role} />
      <div id="story" className={`lv2-wrap ${styles.story}`}>
        <div className={styles.storyIntro}><h2><Copy text="ככה זה עובד" /></h2><p><Copy text="מההיכרות ועד התוצאות." /></p></div>
        {PROCESS_STORY.map((step,index)=><ProcessSection key={`${step.id}-${role??"all"}`} step={step} index={index} role={shown} onChoose={chooseExample} start={start}/>)}
      </div>
      <section className={`lv2-wrap ${styles.faq} ${rhythm.faq}`} aria-labelledby="process-questions"><h2 id="process-questions"><Copy text="שאלות נפוצות" /></h2><div>
        <Question text="צריך לחבר הכול כדי להתחיל?"><Copy text="לא. מתחילים בשיחה ובמחקר על המידע הציבורי של העסק. אחרי ההרשמה, מוסיפים חיבורים לפי הצורך וממשיכים לבנות את התוכנית." /></Question>
        <Question text="מי מפרסם את הפוסטים?"><Copy text="אתם. אנחנו מכינים את הפוסטים, ואתם בודקים את התמונה והפרטים, עורכים אם צריך ומפרסמים. שום דבר לא מתפרסם בלי החלטה שלכם." /></Question>
        <Question text="איך שומרים על המידע שלכם?"><Copy text="מחברים חשבונות במסך הרשאות של השירות עצמו. הסיסמה לא עוברת אלינו. אפשר לנתק את החיבור או למחוק את החשבון." /> <Link href={`/security?lang=${locale}`}><Copy text="עוד על אבטחה ופרטיות" /></Link></Question>
        <Question text="מה קורה אחרי החודש החינמי?"><PriceAnswer /></Question>
        <Question text="אפשר לבטל?"><CancellationAnswer /></Question>
      </div></section>
    </main>
    <footer className="lv2-foot"><div className="lv2-wrap lv2-foot-row"><span><Copy text="ישראמארקט" /></span><Link href={`/security?lang=${locale}`}><Copy text="אבטחה ופרטיות" /></Link><Link href={`/terms?lang=${locale}`}><Copy text="תנאי שימוש" /></Link></div></footer>
    <DeletedNotice />
  </div>;
}

/** The standard disclosure: a chevron that points down when closed and up when open. */
function Question({ text, children }: { text: string; children: ReactNode }) {
  return <details><summary><Copy text={text} /><IconChevron className={rhythm.chevron} /></summary><p>{children}</p></details>;
}

/** Chapter rhythm: colour returns at the campaign and the price; two chapters change layout.
 * The action appears mid-page (campaign) and at the end (price), besides the hero and header. */
const PRESENTATION: Partial<Record<ProcessStep, { ground?: "coral" | "ink"; layout?: "stacked" | "mirrored" }>> = {
  campaign: { ground: "coral", layout: "stacked" },
  data: { layout: "mirrored" },
  trial: { ground: "ink", layout: "mirrored" },
};
const WITH_ACTION: readonly ProcessStep[] = ["campaign", "trial"];
const GOAL_ROLE_LABELS = ["יותר תרומות", "יותר מתנסים במוצר", "יותר פניות לשירות", "יותר קניות באתר", "יותר לקוחות בחנות"];
function ProcessSection({ step, index, role, onChoose, start }: { step: typeof PROCESS_STORY[number]; index: number; role: ProcessRole; onChoose: (role: ProcessRole) => void; start: string }) {
  const t = useCopy();
  // Business type is asked once, in research; goals offers the same examples as goals.
  const hasRoles = step.id === "research" || step.id === "goals";
  const benefit = PROCESS_BENEFITS[step.id];
  const look = PRESENTATION[step.id];
  return <section id={step.id} className={`${styles.section} ${rhythm.chapter}`} data-step={step.id} data-ground={look?.ground} data-layout={look?.layout} aria-labelledby={`process-${step.id}`} data-animation-role={role}>
    <div className={styles.message}><p className={styles.sectionLabel}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><Copy text={step.label} /></p><h2 id={`process-${step.id}`}><ReactiveWords text={step.title} /></h2>
      {hasRoles && <fieldset className={styles.roleSelector} aria-label={t(step.id === "goals" ? "מטרות לפי סוג הפעילות" : "סוג העסק")}><div className={styles.roleChoices}>{PROCESS_ROLES.map((item,i) => <button type="button" key={item.segment} aria-pressed={role === item.segment} onMouseEnter={() => onChoose(item.segment)} onFocus={() => onChoose(item.segment)} onClick={() => onChoose(item.segment)}><Copy text={step.id === "goals" ? GOAL_ROLE_LABELS[i] : item.label} /></button>)}</div></fieldset>}
      <p className={styles.sectionBody}><Copy text={step.body} /></p>
      {benefit && <p className={styles.benefit}><Copy text={benefit} /></p>}
      {WITH_ACTION.includes(step.id) && <Link href={start} className={`lv2-btn ${styles.start} ${styles.stepStart}`}><TrialCtaLabel /></Link>}
      {step.id === "trial" && <div id="price" className={styles.priceDetails}><strong><Copy text="אחר כך: {arg_0} ₪ לחודש" args={{ arg_0: PRICE_ILS }} /></strong><span><Copy text={VAT_NOTE} /></span><p><Copy text="תמונות וסרטונים לפי מכסת המנוי. תקציב הפרסום ברשתות משולם בנפרד." /></p></div>}
    </div>
    <ProcessAnimation key={`${step.id}-${role}`} step={step.id} role={role} />
  </section>;
}
