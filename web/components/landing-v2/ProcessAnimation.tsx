"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, type CSSProperties } from "react";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { BrandWordmark } from "./BrandWordmark";
import { ProviderLogo } from "./ProviderLogo";
import { useFeatureCycle } from "./useFeatureCycle";
import type { ProcessStep } from "./processStory";
import { PROCESS_EXAMPLES, type ProcessRole } from "./processExamples";
import { PROCESS_CAMPAIGNS } from "./processCampaigns";
import styles from "./process-story.module.css";
import { ProcessSocialPost } from "./ProcessSocialPost";
import { CampaignArtwork } from "./ProcessCampaignArtwork";
import { GoalsScene, PlanScene, LearningScene, DataScene, PhoneScene, TrialScene } from "./ProcessScenes";
import { useProcessSequence } from "./useProcessSequence";
const CAMPAIGN_TIMES = [3200, 8500, 3200, 3200] as const;
const SOFTWARE_CAMPAIGN_TIMES = [3200, 9500, 3200, 3200] as const;

function Check() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Pointer({ className = "" }: { className?: string }) {
  return <svg className={`${styles.pointer} ${className}`} viewBox="0 0 32 38" width="32" height="38" fill="none" aria-hidden="true"><path d="M4 3v27l7-7 6 11 6-3-6-11h10L4 3Z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" /></svg>;
}

/** These are format symbols, not examples of finished customer artwork. */
function FormatSymbol({ kind }: { kind: "text" | "image" | "video" }) {
  return <svg viewBox="0 0 80 70" fill="none" aria-hidden="true">{kind === "text" ? <g stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M16 16h48M16 29h48M16 42h34M16 55h41" /></g> : kind === "image" ? <g stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"><rect x="10" y="10" width="60" height="50" rx="6" /><circle cx="50" cy="25" r="5" /><path d="m12 52 18-19 14 14 9-9 15 16" /></g> : <g stroke="currentColor" strokeWidth="2.5"><rect x="10" y="10" width="60" height="50" rx="6" /><path d="m34 25 17 10-17 10Z" fill="currentColor" strokeLinejoin="round" /><path d="M19 10v50M61 10v50M10 22h9M10 35h9M10 48h9M61 22h9M61 35h9M61 48h9" /></g>}</svg>;
}

type RoleProps = { role: ProcessRole | null };

function Research({ role }: RoleProps) {
  const example = role ? PROCESS_EXAMPLES[role] : null;
  return <div className={styles.research}>
    <div className={styles.webPage}>
      <div className={styles.browserBar}><i /><i /><i /><span dir="ltr">www.</span></div>
      <div className={styles.webBody}>
        <span className={styles.miniLabel}><Copy text={example?.kind ?? "האתר והרשתות שלך"} /></span>
        <strong><Copy text={example?.name ?? "העסק שלך"} /></strong>
        {example ? <div className={styles.webImage}><Image src={example.image} fill sizes="300px" alt="" /></div> : <div className={styles.profileSources}>{["מה מציעים", "מי הלקוחות", "מה הסגנון"].map(label => <div key={label}><span><Copy text={label} /></span><i /><i /></div>)}</div>}
        <div className={styles.scanLine} />
      </div>
    </div>
    <div className={styles.interview}><span className={styles.miniLabel}><Copy text="בשיחה איתך" /></span><p><Copy text={example ? "מה מייחד אותך?" : "מה חשוב לך לקדם עכשיו?"} /></p><div className={styles.answer}><Copy text={example?.answer ?? "הפעילות, הקהל והמטרות שלך."} /></div></div>
    <div className={styles.researchResult}><span className={styles.check}><Check /></span><div><small><Copy text={example ? "למי פונים" : "מחקר ושיחה מתחברים"} /></small><p><Copy text={example?.audienceSummary ?? "בסיס לתוכנית שמתאימה לך."} /></p></div></div>
    <Pointer className={styles.researchPointer} />
  </div>;
}

const PROVIDERS = [
  { provider: "google-analytics", label: "Google Analytics" },
  { provider: "facebook-instagram", label: "Instagram · Facebook" },
  { provider: "whatsapp", label: "WhatsApp" },
] as const;

function Connections({ role }: RoleProps) {
  const { locale } = useLanguage();
  return <div className={styles.connections}>
    <Link href={`/connections/tiktok?lang=${locale}`} className={`${styles.connectorHint} ${styles.connectorHintTop}`}><ProviderLogo provider="tiktok" size={30} /><span>TikTok</span></Link>
    <Link href={`/connections/linkedin?lang=${locale}`} className={`${styles.connectorHint} ${styles.connectorHintBottom}`}><ProviderLogo provider="linkedin" size={30} /><span>LinkedIn</span></Link>
    <div className={styles.providerColumn}>{PROVIDERS.map((item) => <Link href={`/connections/${item.provider}?lang=${locale}`} className={styles.provider} key={item.provider}><ProviderLogo provider={item.provider} size={30} /><span dir="ltr">{item.label}</span></Link>)}</div>
    <svg className={styles.connectionLines} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M0 18 C65 18 35 50 100 50 M0 50 H100 M0 82 C65 82 35 50 100 50" /></svg>
    <div className={styles.connectedHub}><BrandWordmark /><span><Copy text="התמונה של העסק" /></span><div className={styles.hubRow}><Check /><Copy text="מאיפה מגיעים לאתר" /></div><div className={styles.hubRow}><Check /><Copy text="אילו פוסטים מעניינים את הקהל" /></div><div className={styles.hubRow}><Check /><Copy text={role === "online_shop" ? "על מה לחצו לפני ההזמנה" : role === "physical_shop" ? "על מה לחצו כדי להזמין לאיסוף" : role === "fundraising" ? "על מה לחצו בדרך לעמוד התרומה" : role === "software" ? "על מה לחצו כדי להתחיל התנסות" : "על מה לחצו כדי לפנות"} /></div></div>
    <span className={styles.connectionFoot}><Copy text="כל מקור מוסיף מידע אחר לתוכנית." /></span>
  </div>;
}

const CAMPAIGN_MEDIA = {
  services: { src: "/showcase/designer-human-motion-ai.mp4", poster: "/showcase/designer-human-motion-poster.jpg", label: "בוחרים צבע באור של הבית" },
  online_shop: { src: "/showcase/clothing-human-motion-ai.mp4", poster: "/showcase/clothing-linen-ai.png", label: "הגזרה והבד בתנועה" },
  physical_shop: { src: "/showcase/bakery-human-motion-ai.mp4", poster: "/showcase/bakery-human-motion-poster.jpg", label: "קולעים חלה במאפייה" },
  fundraising: { src: "/showcase/community-human-motion-ai.mp4", poster: "/showcase/community-human-motion-poster.jpg", label: "אורזים יחד מצרכים לקהילה" },
} as const;

function CampaignClip({ role, playing }: RoleProps & { playing: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const t = useCopy();
  const { locale } = useLanguage();
  const software = !role || role === "software";
  const media = software ? { src: `/showcase/maslul-project-demo-${locale}.mp4`, poster: `/showcase/maslul-project-demo-${locale}.jpg`, label: "משימה עוברת בין שלבים בלוח הפרויקט של מסלול" } : CAMPAIGN_MEDIA[role];
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (playing) void element.play().catch(() => { /* Native controls support manual playback. */ });
    else element.pause();
  }, [playing, media.src]);
  return <div className={styles.clipPost} data-software={software}><video ref={video} src={media.src} poster={media.poster} muted loop playsInline preload="metadata" controls aria-label={t(media.label)} /></div>;
}

// תכלית: לראות את השבוע, המטרה והחומרים יחד. זו תצוגה ציבורית; אין יצירה או שמירה.
function Campaign({ role, playing }: RoleProps & { playing: boolean }) {
  const t = useCopy();
  const durations = role === "software" ? SOFTWARE_CAMPAIGN_TIMES : CAMPAIGN_TIMES;
  const { index, select, revision } = useProcessSequence(durations, playing);
  const example = role ? PROCESS_EXAMPLES[role] : null;
  const weeks = example?.weeks ?? ["נותנים סיבה להכיר", "מראים את הערך", "מזמינים לעשות צעד", "לומדים וממשיכים"];
  const creative = role ? PROCESS_CAMPAIGNS[role][index] : null;
  return <div className={styles.campaignBoard} data-campaign-week={index + 1} style={{ "--week-duration": `${durations[index]}ms` } as CSSProperties}>
    <header className={styles.boardHeading}><span className={styles.miniLabel}><Copy text="הקמפיין של החודש" /></span><strong><Copy text={example?.name ?? "העסק שלך"} /></strong><span className={styles.boardMonth} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M4 10h16M8 2v6M16 2v6" /></svg></span></header>
    <div className={styles.weekTimeline} role="group" aria-label={t("שבועות הקמפיין")}>{weeks.map((week, i) => <button key={week} type="button" aria-pressed={i === index} onClick={() => select(i)}><span><Copy text="שבוע {arg_0}" args={{arg_0:i + 1}} /></span><i key={`${index}-${revision}`} aria-hidden="true" /></button>)}</div>
    <div className={styles.weekWorkspace}>
      <aside className={styles.weekPurpose}><small><Copy text="המטרה של השבוע" /></small><h3><Copy text={weeks[index]} /></h3><span className={styles.weekOutcome}><Check /><Copy text={example?.outcome ?? "פניות מהקהל המתאים"} /></span></aside>
      <div className={styles.weekMaterials}>
        <ProcessSocialPost index={index} name={example?.name ?? "העסק שלך"} caption={creative?.caption ?? weeks[index]} video={Boolean(creative?.video || !role && index === 1)} material={creative?.image ?? "video"}>
          {creative?.video || !role && index === 1 ? <CampaignClip role={role} playing={playing} /> : role ? <CampaignArtwork role={role} index={index} ratio="1:1" /> : <div className={styles.genericArtwork}><FormatSymbol kind={index === 3 ? "text" : "image"} /><span><Copy text={["הסגנון שלך", "הערך שלך", "ההזמנה שלך", "השיחה עם הקהל"][index]} /></span></div>}
        </ProcessSocialPost>
      </div>
      <Pointer key={index} className={styles.timelinePointer} />
    </div>
    <div className={styles.boardStatus}><Check /><Copy text="החומרים מחכים לאישור שלך" /></div>
  </div>;
}

/** Each section owns its scenario; the frame owns visibility, reduced motion and pause. */
export function ProcessAnimation({ step, role }: { step: ProcessStep; role: ProcessRole | null }) {
  const { ref, playing, reduced, paused, toggle, setFocused } = useFeatureCycle(1);
  const t = useCopy();
  return <div ref={ref} className={styles.visual} data-playing={playing} data-reduced={reduced} data-process-visual={step}>
    <div className={styles.visualContent} onFocusCapture={event => setFocused(event.target.matches(":focus-visible"))} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
      {step === "research" ? <Research role={role} /> : step === "connections" ? <Connections role={role} /> : step === "plan" ? <PlanScene role={role} /> : step === "goals" ? <GoalsScene role={role} playing={playing} /> : step === "campaign" ? <Campaign role={role} playing={playing} /> : step === "learning" ? <LearningScene playing={playing} reduced={reduced} /> : step === "data" ? <DataScene /> : step === "trial" ? <TrialScene playing={playing} reduced={reduced} /> : <PhoneScene role={role} playing={playing} />}
    </div>
    <button type="button" className={styles.motionToggle} onClick={toggle} disabled={reduced} aria-label={t(paused ? "להפעיל את ההמחשה" : "להשהות את ההמחשה")} aria-pressed={paused} title={t(reduced ? "התנועה כבויה לפי הגדרות המכשיר" : paused ? "להפעיל את ההמחשה" : "להשהות את ההמחשה")}><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">{paused || reduced ? <path d="m5 3 8 5-8 5Z" /> : <path d="M4 3h3v10H4zM10 3h3v10h-3z" />}</svg></button>
  </div>;
}
