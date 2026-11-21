"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Copy, useLanguage } from "@/components/language/LanguageProvider";
import { ProductUtilities } from "@/components/language/ProductUtilities";
import { PriceAnswer, CancellationAnswer } from "@/components/language/PricingAnswers";
import { DeletedNotice } from "@/components/landing/DeletedNotice";
import { PRICE_ILS, TRIAL_LABEL, VAT_NOTE } from "@/lib/pricing";
import { BrandWordmark } from "./BrandWordmark";
import { LandingStory } from "./LandingStory";
import { TrialCtaLabel } from "./TrialCtaLabel";
import { SignalHero } from "./SignalHero";
import { PROCESS_ROLES, defaultProcessRole, isProcessRole, type ProcessRole } from "./processExamples";
import type { ExamplePath } from "./businessExamples";
import type { IdentityDirection } from "./IdentityMark";
import { artSerif, siteSerif, siteClean } from "./siteFonts";
import styles from "./process-story.module.css";
import story from "./landing-story.module.css";
import rhythm from "./process-rhythm.module.css";
import { IconChevron } from "@/lib/icons";
import "./lv2.css";
import "./showcase.css";

/** The arrival route informs signup. Hover previews are owned by each section. */
export function ProcessLanding({ initialPath, identity }: { initialPath?: ExamplePath; identity?: IdentityDirection }) {
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
  const selected = PROCESS_ROLES.find(item => item.segment === role);
  // A generic homepage must not silently choose “service provider” for a new owner.
  const start = `/start?lang=${locale}${selected ? `&model=${selected.path}&segment=${selected.segment}` : ""}`;
  return <div className={`lv2 lv2-site ${styles.page} ${siteClean.variable} ${artSerif.variable} ${siteSerif.variable}`} data-business={selected?.path ?? "all"} data-process-role={role ?? "all"} data-hero-type="modern" data-design="signal-punch" data-palette={palette}>
    <header className={`lv2-nav ${styles.header}`}><div className={`lv2-wrap lv2-nav-row ${styles.headerRow}`}>
      <Link href="/" className="lv2-brand" aria-label="isramarket"><BrandWordmark direction={identity} /></Link>
      <div className={`lv2-nav-end ${styles.headerActions}`}><ProductUtilities inline /><Link href={`/login?lang=${locale}`} className="lv2-login"><Copy text="להיכנס" /></Link></div>
    </div></header>
    <main>
      <SignalHero start={start} />
      <LandingStory />
      <section id="trial" className={`lv2-wrap ${story.trial}`} aria-labelledby="trial-title">
        <span id="price" className={story.anchor} aria-hidden="true" />
        <div>
          <h2 id="trial-title"><Copy text={TRIAL_LABEL} /></h2>
          <p><Copy text="אחר כך: {arg_0} ₪ לחודש" args={{ arg_0: PRICE_ILS }} /> <Copy text={VAT_NOTE} />.</p>
          <p><Copy text="תמונות וסרטונים לפי מכסת המנוי. תקציב הפרסום ברשתות משולם בנפרד." /></p>
        </div>
        <Link href={start} className={`lv2-btn ${story.trialAction}`}><TrialCtaLabel /></Link>
      </section>
      <section className={`lv2-wrap ${styles.faq} ${rhythm.faq}`} aria-labelledby="process-questions"><h2 id="process-questions"><Copy text="שאלות נפוצות" /></h2><div>
        <Question text="צריך לחבר הכול כדי להתחיל?"><Copy text="לא. מתחילים בשיחה ובמחקר על המידע הציבורי של העסק. אחרי ההרשמה, מוסיפים חיבורים לפי הצורך וממשיכים לבנות את התוכנית." /></Question>
        <Question id="mobile" text="אפשר לעבוד מהנייד?"><Copy text="כן. התוכנית, הפוסטים והתוצאות זמינים בדפדפן של הטלפון." /></Question>
        <Question text="מי מפרסם את הפוסטים?"><Copy text="אתם. אנחנו מכינים את הפוסטים, ואתם בודקים את התמונה והפרטים, עורכים אם צריך ומפרסמים. שום דבר לא מתפרסם בלי החלטה שלכם." /></Question>
        <Question text="איך שומרים על המידע שלכם?"><Copy text="מחברים חשבונות במסך הרשאות של השירות עצמו. הסיסמה לא עוברת אלינו. אפשר לנתק את החיבור או למחוק את החשבון." /> <Link href={`/security?lang=${locale}`}><Copy text="עוד על אבטחה ופרטיות" /></Link></Question>
        <Question text="מה קורה אחרי החודש החינמי?"><PriceAnswer /></Question>
        <Question text="אפשר לבטל?"><CancellationAnswer /></Question>
      </div></section>
    </main>
    <footer className={`lv2-foot ${story.footer}`}><div className="lv2-wrap lv2-foot-row"><span>isramarket</span><Link href={`/security?lang=${locale}`}><Copy text="אבטחה ופרטיות" /></Link><Link href={`/terms?lang=${locale}`}><Copy text="תנאי שימוש" /></Link></div></footer>
    <DeletedNotice />
  </div>;
}

/** The standard disclosure: a chevron that points down when closed and up when open. */
function Question({ id, text, children }: { id?: string; text: string; children: ReactNode }) {
  return <details id={id} className={story.question}><summary><Copy text={text} /><IconChevron className={rhythm.chevron} /></summary><p>{children}</p></details>;
}
