"use client";

import Link from "next/link";
import { Copy, useLanguage } from "@/components/language/LanguageProvider";
import { BrandWordmark } from "./BrandWordmark";
import { ProviderLogo } from "./ProviderLogo";
import { QuestionnaireScene, CampaignMaterialsScene, CampaignGrowthScene } from "./LandingQaScenes";
import { useFeatureCycle } from "./useFeatureCycle";
import type { ProcessStep } from "./processStory";
import { type ProcessRole } from "./processExamples";
import styles from "./process-story.module.css";
import { GoalsScene, PlanScene, DataScene, PhoneScene, TrialScene } from "./ProcessScenes";

function Check() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}


type RoleProps = { role: ProcessRole | null };


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
      {step === "research" ? <QuestionnaireScene role={role} playing={playing}/> : step === "connections" ? <Connections role={role} /> : step === "plan" ? <PlanScene role={role} /> : step === "goals" ? <GoalsScene role={role} playing={playing} /> : step === "campaign" ? <CampaignMaterialsScene role={role} playing={playing}/> : step === "learning" ? <CampaignGrowthScene playing={playing} reduced={reduced} /> : step === "data" ? <DataScene /> : step === "trial" ? <TrialScene playing={playing} reduced={reduced} /> : <PhoneScene role={role} playing={playing} />}
    </div>
  </div>;
}
