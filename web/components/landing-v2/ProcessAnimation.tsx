"use client";

import Link from "next/link";
import Image from "next/image";
import { Copy, useLanguage } from "@/components/language/LanguageProvider";
import { BrandWordmark } from "./BrandWordmark";
import { ProviderLogo } from "./ProviderLogo";
import { useFeatureCycle } from "./useFeatureCycle";
import type { ProcessStep } from "./processStory";
import { PROCESS_EXAMPLES, type ProcessRole } from "./processExamples";
import styles from "./process-story.module.css";
import { GoalsScene, PlanScene, LearningScene, DataScene, PhoneScene, TrialScene } from "./ProcessScenes";
import { CampaignSystemScene } from "./CampaignSystemScene";

function Check() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Pointer({ className = "" }: { className?: string }) {
  return <svg className={`${styles.pointer} ${className}`} viewBox="0 0 32 38" width="32" height="38" fill="none" aria-hidden="true"><path d="M4 3v27l7-7 6 11 6-3-6-11h10L4 3Z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" /></svg>;
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

/** Each section owns its scenario; the frame owns visibility, reduced motion and pause. */
export function ProcessAnimation({ step, role }: { step: ProcessStep; role: ProcessRole | null }) {
  const { ref, playing, reduced, setFocused } = useFeatureCycle(1);
  return <div ref={ref} className={styles.visual} data-playing={playing} data-reduced={reduced} data-process-visual={step}>
    <div className={styles.visualContent} onFocusCapture={event => setFocused(event.target.matches(":focus-visible"))} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
      {step === "research" ? <Research role={role} /> : step === "connections" ? <Connections role={role} /> : step === "plan" ? <PlanScene role={role} /> : step === "goals" ? <GoalsScene role={role} playing={playing} /> : step === "campaign" ? <CampaignSystemScene role={role} playing={playing} /> : step === "learning" ? <LearningScene playing={playing} reduced={reduced} /> : step === "data" ? <DataScene /> : step === "trial" ? <TrialScene playing={playing} reduced={reduced} /> : <PhoneScene role={role} playing={playing} />}
    </div>
  </div>;
}
