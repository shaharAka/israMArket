"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { PROCESS_HERO } from "./processStory";
import { DEFAULT_PROCESS_EXAMPLE, PROCESS_EXAMPLES, type ProcessRole } from "./processExamples";
import { useFeatureCycle } from "./useFeatureCycle";
import { CampaignClip } from "./LandingQaScenes";
import { TrialCtaLabel, TrialOfferNote } from "./TrialCtaLabel";
import styles from "./signal-hero.module.css";

function Arrow(){const {locale}=useLanguage();return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={locale==="he"||locale==="ar"?"M20 12H4m6-6-6 6 6 6":"M4 12h16m-6-6 6 6-6 6"}/></svg>;}

export function SignalHero({ start, role }: { start: string; role: ProcessRole | null }) {
  const { ref, playing, reduced } = useFeatureCycle(1);
  const [paused, setPaused] = useState(false);
  const t = useCopy();
  const exampleRole = role ?? DEFAULT_PROCESS_EXAMPLE;
  const example = PROCESS_EXAMPLES[exampleRole];

  return <section className={styles.hero} aria-labelledby="process-title">
    <div className={styles.root}>
      <div className={styles.copy}>
        <h1 id="process-title"><Copy text={PROCESS_HERO.title} /></h1>
        <p><Copy text={PROCESS_HERO.body} /></p>
        <p className={styles.approval}><Copy text="האישור והפרסום בידיים שלך." /></p>
        <Link href={start} className={styles.start}><TrialCtaLabel /><Arrow /></Link>
        <small><TrialOfferNote /><Copy text="בלי כרטיס אשראי. בלי התחייבות." /></small>
      </div>
      <figure className={styles.campaign}>
        <div ref={ref} className={styles.media}>
          <CampaignClip role={exampleRole} playing={playing && !paused} />
          {!reduced && <button type="button" className={styles.motion} onClick={() => setPaused(!paused)}
            aria-label={paused ? t("הפעלת הסרטון") : t("השהיית הסרטון")}>
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d={paused ? "M6 3v14l11-7z" : "M5 4h3v12H5zM12 4h3v12h-3z"} />
            </svg>
          </button>}
        </div>
        <figcaption>
          <strong><Copy text={example.weeks[2]} /></strong>
          <span><Copy text={example.name} /> · <Copy text="קמפיין לדוגמה" /></span>
        </figcaption>
      </figure>
    </div>
  </section>;
}
