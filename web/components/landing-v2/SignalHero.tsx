"use client";

import Image from "next/image";
import Link from "next/link";
import { Copy, useLanguage } from "@/components/language/LanguageProvider";
import { PROCESS_HERO } from "./processStory";
import { CampaignFilm } from "./CampaignFilm";
import { TrialCtaLabel, TrialOfferNote } from "./TrialCtaLabel";
import styles from "./signal-hero.module.css";

export function SignalHero({ start }: { start: string }) {
  const { locale } = useLanguage();
  return <section className={styles.hero} aria-labelledby="process-title">
    <div className={styles.root}>
      <div className={styles.copy}>
        <h1 id="process-title"><Copy text={PROCESS_HERO.title} /></h1>
        <p><Copy text={PROCESS_HERO.body} /></p>
        <div className={styles.actions}>
          <Link href={start} className={styles.start}><TrialCtaLabel />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={locale==="he"||locale==="ar"?"M20 12H4m6-6-6 6 6 6":"M4 12h16m-6-6 6 6-6 6"}/></svg>
          </Link>
          <a href="#creative-reel" className={styles.storyLink}><Copy text="סרטוני קמפיין" /></a>
        </div>
        <small><TrialOfferNote /><Copy text="בלי כרטיס אשראי. בלי התחייבות." /></small>
      </div>
      <figure className={styles.proof}>
        <CampaignFilm film="flowers" size="(max-width: 760px) 100vw, 54vw">
          <Image src="/showcase/campaign-cuts/flowers-art.webp" alt="" width={1050} height={1312}
            sizes="(max-width: 760px) 100vw, 54vw" preload className={styles.heroPhoto} />
          <span className={styles.artType} dir="rtl" lang="he" aria-hidden="true">פרחים<br/>לשישי.</span>
        </CampaignFilm>
        <figcaption>
          <div><small><Copy text="השבוע בתוכנית של חנות הפרחים" /></small><strong><Copy text="פותחים הזמנות לשישי" /></strong></div>
          <span><Copy text="סרטון מוכן לאישור" /></span>
        </figcaption>
      </figure>
    </div>
  </section>;
}
