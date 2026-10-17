"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef } from "react";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { CardStage } from "@/components/CardCanvas";
import { PlanBrief } from "@/components/design/PlanBrief";
import { BrandWordmark } from "./BrandWordmark";
import { ProviderLogo } from "./ProviderLogo";
import { useFeatureCycle } from "./useFeatureCycle";
import type { ProcessStep } from "./processStory";
import { PROCESS_EXAMPLES, PROCESS_ROLES, type ProcessRole } from "./processExamples";
import { productFixtures } from "./productFixtures";
import styles from "./process-story.module.css";

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
    <div className={styles.providerColumn}>{PROVIDERS.map((item) => <Link href={`/connections/${item.provider}?lang=${locale}`} className={styles.provider} key={item.provider}><ProviderLogo provider={item.provider} size={30} /><span dir="ltr">{item.label}</span></Link>)}</div>
    <svg className={styles.connectionLines} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M0 18 C65 18 35 50 100 50 M0 50 H100 M0 82 C65 82 35 50 100 50" /></svg>
    <div className={styles.connectedHub}><BrandWordmark /><span><Copy text="התמונה של העסק" /></span><div className={styles.hubRow}><Check /><Copy text="מאיפה מגיעים לאתר" /></div><div className={styles.hubRow}><Check /><Copy text="אילו פוסטים מעניינים את הקהל" /></div><div className={styles.hubRow}><Check /><Copy text={role === "online_shop" ? "על מה לחצו לפני ההזמנה" : role === "physical_shop" ? "על מה לחצו כדי להזמין לאיסוף" : role === "fundraising" ? "על מה לחצו בדרך לעמוד התרומה" : role === "software" ? "על מה לחצו כדי להתחיל התנסות" : "על מה לחצו כדי לפנות"} /></div></div>
    <span className={styles.connectionFoot}><Copy text="כל מקור מוסיף מידע אחר לתוכנית." /></span>
  </div>;
}

function Plan({ role }: RoleProps) {
  const example = role ? PROCESS_EXAMPLES[role] : null;
  const weeks = example?.weeks ?? ["נותנים סיבה להכיר", "מראים את הערך", "מזמינים לעשות צעד", "לומדים וממשיכים"];
  return <div className={styles.planSheet}>
    <div className={styles.sheetHeading}><span className={styles.miniLabel}><Copy text="התוכנית של החודש" /></span></div>
    <h3><Copy text={example?.planTitle ?? "לכל שבוע יש מטרה."} /></h3>
    <p className={styles.planAudience}><Copy text={example?.name ?? "קהל, מסר וערוץ פרסום."} /></p>
    <div className={styles.planWeeks}>{["שבוע 1", "שבוע 2", "שבוע 3", "שבוע 4"].map((week, index) => <div className={`${styles.week} ${styles[`week${index}`] || ""}`} key={week}><span><Copy text={week} /></span><div><strong><Copy text={weeks[index]} /></strong></div><i><Check /></i></div>)}</div>
    <Pointer className={styles.planPointer} />
  </div>;
}

function Goals({ role }: RoleProps) {
  const example = role ? PROCESS_EXAMPLES[role] : null;
  return <div className={styles.goals}>
    <span className={styles.miniLabel}><Copy text="מה רוצים להשיג?" /></span>
    {example ? <div className={styles.goalChoice}><span><Copy text={example.outcome} /></span><span className={styles.check}><Check /></span></div> : <div className={styles.goalOptions}>{["פניות", "הזמנות", "הרשמות", "תרומות"].map((label, index) => <span key={label} className={styles[`goalOption${index}`]}><Copy text={label} /></span>)}</div>}
    <div className={styles.goalNumbers}><div><small><Copy text="נקודת ההתחלה" /></small><strong>12</strong></div><span className={styles.goalConnector} aria-hidden="true" /><div><small><Copy text="היעד לחודש" /></small><strong>18</strong></div></div>
    <div className={styles.goalTrack}><span /></div>
    <div className={styles.goalDefinition}><Check /><p><Copy text="בוחרים מה מודדים ולאן רוצים להגיע." /></p></div>
    <Pointer className={styles.goalPointer} />
  </div>;
}

const FORMATS = [
  { kind: "text", label: "טקסט" }, { kind: "image", label: "תמונה" }, { kind: "video", label: "סרטון" },
] as const;

function ClothingClip({ playing }: { playing: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const t = useCopy();
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (playing) void element.play().catch(() => { /* Native controls support manual playback. */ });
    else element.pause();
  }, [playing]);
  return <div className={styles.clipPost}><video ref={video} src="/showcase/clothing-human-motion-ai.mp4" poster="/showcase/clothing-linen-ai.png" muted loop playsInline preload="metadata" controls aria-label={t("הגזרה והבד בתנועה")} /></div>;
}

function SpecificCampaign({ role, playing }: { role: ProcessRole; playing: boolean }) {
  const t = useCopy();
  const { locale } = useLanguage();
  const example = PROCESS_EXAMPLES[role];
  const path = PROCESS_ROLES.find(item => item.segment === role)!.path;
  const { campaign, brand } = productFixtures(path, t, locale);
  const titles = [example.draft, example.invitation, example.process];
  const posts = campaign.roadmap.posts.map((post, index) => ({ ...post,
    title: t(titles[index]), overlay_headline: index === 0 ? "" : t(titles[index]),
    caption: t(example.caption), cta: t(example.action),
    image_url: index === 1 ? undefined : index === 0 ? example.image : example.processImage,
    content_language: locale,
  }));
  const selectedBrand: typeof brand = { ...brand, business_name: t(example.name), palette: [{ role: "primary", hex: example.color, name: "" }, { role: "background", hex: example.soft, name: "" }] };
  const dna = campaign.brand_dna ? { ...campaign.brand_dna, colors: { ink: example.color, paper: example.soft, accent: example.color } } : undefined;
  return <div className={styles.postFan} data-specific="true">{posts.map((post, index) => <div key={post.uid} className={`${styles.fanPost} ${styles[`fan${index}`]}`}>{role === "online_shop" && index === 2 ? <ClothingClip playing={playing} /> : <CardStage post={post} brand={selectedBrand} dna={dna} businessName={t(example.name)} rounded={false} />}</div>)}</div>;
}

function Campaign({ role, playing }: RoleProps & { playing: boolean }) {
  return <div className={styles.campaign}>
    <div className={styles.campaignBrief}><span className={styles.miniLabel}><Copy text="מהתוכנית לחומרים" /></span><strong><Copy text="מסר אחד. כמה דרכים להעביר אותו." /></strong></div>
    {role ? <SpecificCampaign role={role} playing={playing} /> : <div className={styles.postFan}>{FORMATS.map((format, index) => <div key={format.kind} className={`${styles.fanPost} ${styles[`fan${index}`]}`}><div className={`${styles.formatCard} ${styles[`format${index}`]}`}><span className={styles.miniLabel}><Copy text="לפי התוכנית שלך" /></span><FormatSymbol kind={format.kind} /><strong><Copy text={format.label} /></strong><div className={styles.formatLines}><i /><i /></div><span className={styles.formatReady}><Check /><Copy text="מוכן לבדיקה" /></span></div></div>)}</div>}
    <span className={styles.campaignFoot}><Copy text="המסר, הסגנון והתזמון נשארים מחוברים." /></span>
  </div>;
}

function Learning({ role }: RoleProps) {
  const example = role ? PROCESS_EXAMPLES[role] : null;
  return <div className={styles.learning}>
    <div className={styles.reports}>{["Instagram", "Google Analytics", "Facebook"].map((name, index) => <div className={styles.report} key={name}><span dir="ltr">{name}</span><svg viewBox="0 0 140 50" aria-hidden="true"><path d={index === 1 ? "M0 42 20 33 40 38 60 17 80 25 100 9 120 14 140 2" : "M0 38 20 35 40 18 60 28 80 12 100 20 120 5 140 13"} /></svg><div className={styles.reportBars}><i /><i /><i /><i /><i /></div></div>)}</div>
    <div className={styles.finding}>
      <span className={styles.miniLabel}><Copy text="מה למדנו" /></span><h3><Copy text={example?.findingTitle ?? "ההדגמה הביאה יותר לחיצות."} /></h3>
      <div className={styles.nextAction}><span className={styles.check}><Check /></span><p><Copy text={example?.next ?? "בפוסט הבא: להראות איך זה נראה בפועל."} /></p></div>
      <p className={styles.sourceLimit}><Copy text={example?.resultNote ?? "נמדדו לחיצות. את התוצאה בעסק בודקים בנפרד."} /></p>
    </div>
  </div>;
}

function Phone({ role }: RoleProps) {
  const t = useCopy();
  const example = role ? PROCESS_EXAMPLES[role] : null;
  return <div className={styles.phone}>
    <div className={styles.phoneBar}><span>9:41</span><i /></div>
    <div className={styles.phoneBrand}><BrandWordmark /></div>
    <div className={styles.phoneViewport}><div className={styles.phoneContent}><div className={styles.phoneScreens}>
      <div className={styles.phonePlan}><PlanBrief compact businessName={t(example?.name ?? "העסק שלך")} direction={t(example?.plan ?? "להגיע לקהל המתאים עם מסר ברור.")} ownerAction={t(example?.recommendation ?? "לבדוק את הטקסט והתמונה לפני הפרסום.")} /></div>
      <div className={styles.phoneMaterials}><h3><Copy text="התוכן שלך, מוכן לבדיקה." /></h3>{FORMATS.map(format => <div key={format.kind}><FormatSymbol kind={format.kind} /><span><Copy text={format.label} /></span><Check /></div>)}</div>
    </div></div></div>
    <Pointer className={styles.phonePointer} /><span className={styles.phoneHome} />
  </div>;
}

/** Neutral until a role is chosen; the same choice then informs every relevant example. */
export function ProcessAnimation({ step, role }: { step: ProcessStep; role: ProcessRole | null }) {
  const { ref, playing, reduced, paused, toggle } = useFeatureCycle(1);
  const t = useCopy();
  return <div ref={ref} className={styles.visual} data-playing={playing} data-reduced={reduced} data-process-visual={step}>
    <div className={styles.visualContent}>
      {step === "research" ? <Research role={role} /> : step === "connections" ? <Connections role={role} /> : step === "plan" ? <Plan role={role} /> : step === "goals" ? <Goals role={role} /> : step === "campaign" ? <Campaign role={role} playing={playing} /> : step === "learning" ? <Learning role={role} /> : <Phone role={role} />}
    </div>
    <button type="button" className={styles.motionToggle} onClick={toggle} disabled={reduced} aria-label={t(paused ? "להפעיל את ההמחשה" : "להשהות את ההמחשה")} aria-pressed={paused} title={t(reduced ? "התנועה כבויה לפי הגדרות המכשיר" : paused ? "להפעיל את ההמחשה" : "להשהות את ההמחשה")}><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">{paused || reduced ? <path d="m5 3 8 5-8 5Z" /> : <path d="M4 3h3v10H4zM10 3h3v10h-3z" />}</svg></button>
  </div>;
}
