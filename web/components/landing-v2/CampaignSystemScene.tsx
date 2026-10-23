"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import Image from "next/image";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { PROCESS_EXAMPLES, type ProcessRole } from "./processExamples";
import { PROCESS_CAMPAIGNS } from "./processCampaigns";
import { PROCESS_GOALS } from "./processScenarios";
import { CampaignArtwork } from "./ProcessCampaignArtwork";
import { ProcessSocialPost } from "./ProcessSocialPost";
import { useProcessSequence } from "./useProcessSequence";
import styles from "./campaign-system.module.css";

const DURATIONS = [2800, 4500, 3000, 3200] as const;
const STAGES = ["התוכנית", "החומרים", "המדידה", "הצעד הבא"];
const METRICS: Record<ProcessRole, readonly string[]> = {
  online_shop: ["כניסות לעמוד המוצר", "הוספות לסל", "הזמנות שהושלמו"],
  services: ["כניסות לעמוד השירות", "פניות חדשות", "שיחות שנקבעו"],
  software: ["כניסות לאתר", "הרשמות להתנסות", "שימוש במוצר"],
  physical_shop: ["כניסות לעמוד ההזמנה", "הזמנות מראש", "איסופים בחנות"],
  fundraising: ["כניסות לעמוד התרומה", "התחלת תרומה", "תרומות שהושלמו"],
};
const CLIPS = {
  services: ["/showcase/designer-human-motion-ai.mp4", "/showcase/designer-human-motion-poster.jpg"],
  online_shop: ["/showcase/clothing-human-motion-ai.mp4", "/showcase/clothing-linen-ai.png"],
  physical_shop: ["/showcase/bakery-human-motion-ai.mp4", "/showcase/bakery-human-motion-poster.jpg"],
  fundraising: ["/showcase/community-human-motion-ai.mp4", "/showcase/community-human-motion-poster.jpg"],
} as const;

function Arrow() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 12H4m6-6-6 6 6 6" /></svg>; }
function Check() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>; }
function CampaignFilm({ role, playing }: { role: ProcessRole; playing: boolean }) {
  const { locale } = useLanguage();
  const t = useCopy();
  const ref = useRef<HTMLVideoElement>(null);
  const [src, poster] = role === "software" ? [`/showcase/maslul-project-demo-${locale}.mp4`, `/showcase/maslul-project-demo-${locale}.jpg`] : CLIPS[role];
  useEffect(() => { const video = ref.current; if (!video) return; if (playing) void video.play().catch(() => {}); else video.pause(); }, [playing, src]);
  return <video ref={ref} src={src} poster={poster} muted loop playsInline preload="metadata" aria-label={t("סרטון מתוך הקמפיין")} />;
}

/** Public campaign walkthrough: one goal, a monthly plan, coordinated channels and feedback.
 * No provider calls or invented performance figures. Measurements describe what to track.
 */
export function CampaignSystemScene({ role: requestedRole, playing }: { role: ProcessRole | null; playing: boolean }) {
  const role = requestedRole ?? "online_shop";
  const example = PROCESS_EXAMPLES[role];
  const creatives = PROCESS_CAMPAIGNS[role];
  const { index, select, revision } = useProcessSequence(DURATIONS, playing);
  const t = useCopy();
  const networks = role === "software" ? [0, 2, 3] : [0, 2, 1];
  const measurements = METRICS[role];
  return <div className={styles.board} data-campaign-stage={index} data-moving={playing} style={{ "--campaign-color": example.color, "--campaign-soft": example.soft, "--stage-duration": `${DURATIONS[index]}ms` } as CSSProperties}>
    <header className={styles.heading}><div><span><Copy text="הקמפיין של החודש" /></span><strong><Copy text={example.name} /></strong></div><span className={styles.connected}><i /><Copy text="מהמטרה ועד לתוצאה" /></span></header>
    <div className={styles.goal}><span><Copy text="המטרה" /></span><strong><Copy text={PROCESS_GOALS[role][0]} /></strong><p><Copy text={example.audienceSummary} /></p></div>
    <nav className={styles.stages} aria-label={t("שלבי הקמפיין")}>{STAGES.map((label, i) => <button key={label} type="button" aria-pressed={index === i} onClick={() => select(i)}><Copy text={label} /><i key={`${index}-${revision}`} aria-hidden="true" /></button>)}</nav>
    <div className={styles.surface} key={`${index}-${revision}`}>
      {index === 0 && <div className={styles.plan}><div className={styles.sceneTitle}><h3><Copy text="מטרה אחת. תוכנית לכל החודש." /></h3></div><div className={styles.weeks}>{example.weeks.map((week, i) => <section key={week} style={{ "--item": i } as CSSProperties}><span className={styles.weekNumber}><Copy text="שבוע {arg_0}" args={{arg_0: i + 1}} /></span><div className={styles.weekImage}><Image src={creatives[i].image ?? example.image} fill sizes="90px" alt="" /></div><div className={styles.weekContent}><h4><Copy text={week} /></h4><div>{[i % 2 ? "instagram" : "facebook",role === "software" ? "linkedin" : "tiktok"].map(channel=><Image key={channel} src={`/connectors/${channel}.svg`} width={17} height={17} alt={channel} />)}</div></div></section>)}</div><div className={styles.continuous}><span /><Copy text="המעקב ממשיך לאורך כל הקמפיין" /><span /></div></div>}
      {index === 1 && <div className={styles.materials}><div className={styles.sceneTitle}><h3><Copy text="אותו מסר. מותאם לכל ערוץ." /></h3><p><Copy text="הטקסט, העיצוב והסרטון עובדים יחד, לפי התוכנית והסגנון שלך." /></p></div><div className={styles.channels}>{networks.map((network, i) => <div key={network} className={styles.channel} style={{ "--item": i } as CSSProperties}><ProcessSocialPost index={network} name={example.name} caption={creatives[0].subline} video={network === 1 || role === "software" && network === 3} material="campaign"><div className={styles.artwork} data-software={role === "software"}>{network === 1 || role === "software" && network === 3 ? <CampaignFilm role={role} playing={playing} /> : <CampaignArtwork role={role} index={0} support={network === 3} ratio="1:1" />}</div></ProcessSocialPost></div>)}</div><p className={styles.approval}><Check /><Copy text="בודקים ומאשרים את החומרים לפני הפרסום" /></p></div>}
      {index === 2 && <div className={styles.measure}><div className={styles.sceneTitle}><h3><Copy text="בודקים את הדרך לתוצאה." /></h3><p><Copy text="לא רק מי ראה את הפוסט, אלא מה קרה אחרי הלחיצה." /></p></div><div className={styles.sources}>{["Instagram", "Facebook", role === "software" ? "LinkedIn" : "TikTok"].map(name => <span key={name}><Image src={`/connectors/${name.toLowerCase()}.svg`} alt={name} width={26} height={26} /></span>)}</div><div className={styles.funnel}>{measurements.map((metric, i) => <div key={metric} style={{ "--item": i } as CSSProperties}><span className={styles.metricSymbol}>{i===0 ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01M9 13h6M9 16h4"/></svg> : i===1 ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 3 13 10-7 1-3 6L6 3Z"/></svg> : <Check/>}</span><strong><Copy text={metric} /></strong><i aria-hidden="true"/></div>)}</div><div className={styles.measurementNote}><Image src="/connectors/googleanalytics.svg" alt="Google Analytics" width={24} height={24} /><p><Copy text="מחברים בין נתוני הערוצים לנתוני האתר ולתוצאות העסק." /></p></div></div>}
      {index === 3 && <div className={styles.learn}><div className={styles.sceneTitle}><h3><Copy text="מהתוצאות, לצעד הבא." /></h3></div><div className={styles.learningFlow}><div className={styles.learningQuestion}><div className={styles.learningThumb}><CampaignArtwork role={role} index={0} ratio="1:1"/></div><div><span><Copy text="מה בודקים" /></span><strong><Copy text={example.findingTitle} /></strong></div></div><div className={styles.nextPlan}><span><Copy text="בתוכנית הבאה" /></span><div className={styles.nextCreative}><div><CampaignArtwork role={role} index={1} support ratio="1:1"/></div><div><CampaignArtwork role={role} index={2} support ratio="1:1"/></div></div><strong><Copy text={example.recommendation} /></strong><p><Check /><Copy text="מעדכנים את התוכן ואת התוכנית" /></p></div></div><p className={styles.loop}><Arrow /><Copy text="הקמפיין ממשיך להשתפר מחודש לחודש" /></p></div>}

    </div>
  </div>;
}
