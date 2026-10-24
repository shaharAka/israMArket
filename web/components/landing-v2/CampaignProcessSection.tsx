"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { TRIAL_LABEL } from "@/lib/pricing";
import { CAMPAIGN_DURATIONS, CAMPAIGN_STAGES, CampaignSystemScene } from "./CampaignSystemScene";
import type { ProcessRole } from "./processExamples";
import { PROCESS_BENEFITS, type PROCESS_STORY } from "./processStory";
import { ReactiveWords } from "./SignalHero";
import { useFeatureCycle } from "./useFeatureCycle";
import { useProcessSequence } from "./useProcessSequence";
import styles from "./process-story.module.css";
import campaign from "./campaign-system.module.css";

/** Explanation and media share one clock; preview choices never change signup context. */
export function CampaignProcessSection({ step, index: stepIndex, role, start }: {
  step: Extract<typeof PROCESS_STORY[number], { id: "campaign" }>;
  index: number;
  role: ProcessRole | null;
  start: string;
}) {
  const t = useCopy();
  const { ref, playing, reduced, setFocused } = useFeatureCycle(1);
  const { index, select, revision } = useProcessSequence(CAMPAIGN_DURATIONS, playing);
  return <section id="campaign" className={styles.section} data-step="campaign" aria-labelledby="process-campaign" data-animation-role={role ?? "online_shop"}
    onFocusCapture={event => setFocused(event.target.matches(":focus-visible"))}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    <div className={styles.message}>
      <p className={styles.sectionLabel}><span aria-hidden="true">{String(stepIndex + 1).padStart(2, "0")}</span><Copy text={step.label} /></p>
      <h2 id="process-campaign"><ReactiveWords text={step.title} /></h2>
      <p className={styles.sectionBody}><Copy text={step.body} /></p>
      {PROCESS_BENEFITS.campaign && <p className={styles.benefit}><Copy text={PROCESS_BENEFITS.campaign} /></p>}
      <nav className={campaign.stages} aria-label={t("שלבי הקמפיין")} data-playing={playing} data-reduced={reduced} style={{ "--stage-duration": `${CAMPAIGN_DURATIONS[index]}ms` } as CSSProperties}>
        {CAMPAIGN_STAGES.map((label, i) => <button key={label} type="button" aria-pressed={index === i} aria-controls="campaign-visual"
          onMouseEnter={() => { if (index !== i) select(i); }}
          onFocus={() => { if (index !== i) select(i); }}
          onClick={() => select(i)}>
          <span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span><Copy text={label} />
          <i key={`${index}-${revision}`} aria-hidden="true" />
        </button>)}
      </nav>
      <Link href={start} className={`lv2-btn ${styles.start} ${styles.stepStart}`}><Copy text={TRIAL_LABEL} /></Link>
    </div>
    <div id="campaign-visual" ref={ref} className={styles.visual} data-playing={playing} data-reduced={reduced} data-process-visual="campaign">
      <div className={styles.visualContent}><CampaignSystemScene role={role} playing={playing} index={index} revision={revision} /></div>
    </div>
  </section>;
}
