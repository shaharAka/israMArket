"use client";

import Link from "next/link";
import { Copy, useLanguage } from "@/components/language/LanguageProvider";
import { PROCESS_HERO } from "./processStory";
import { LandingProductVisual } from "./LandingStory";
import { TrialCtaLabel, TrialOfferNote } from "./TrialCtaLabel";
import styles from "./signal-hero.module.css";

function Arrow(){const {locale}=useLanguage();return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={locale==="he"||locale==="ar"?"M20 12H4m6-6-6 6 6 6":"M4 12h16m-6-6 6 6-6 6"}/></svg>;}

export function SignalHero({ start }: { start: string }) {
  return <section className={styles.hero} aria-labelledby="process-title">
    <div className={styles.root}>
      <div className={styles.copy}>
        <h1 id="process-title"><Copy text={PROCESS_HERO.title} /></h1>
        <p><Copy text={PROCESS_HERO.body} /></p>
        <p className={styles.approval}><Copy text="האישור והפרסום בידיים שלך." /></p>
        <div className={styles.actions}>
          <Link href={start} className={styles.start}><TrialCtaLabel /><Arrow /></Link>
          <a href="#story" className={styles.storyLink}><Copy text="לראות איך זה עובד" /></a>
        </div>
        <small><TrialOfferNote /><Copy text="בלי כרטיס אשראי. בלי התחייבות." /></small>
      </div>
      <LandingProductVisual />
    </div>
  </section>;
}
