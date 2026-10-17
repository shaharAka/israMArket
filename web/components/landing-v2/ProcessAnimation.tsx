"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { CardStage } from "@/components/CardCanvas";
import { PlanBrief } from "@/components/design/PlanBrief";
import { BrandWordmark } from "./BrandWordmark";
import { ProviderLogo } from "./ProviderLogo";
import { useFeatureCycle } from "./useFeatureCycle";
import type { ProcessStep } from "./processStory";
import { PROCESS_EXAMPLES, PROCESS_ROLES, type ProcessRole } from "./processExamples";
import { productFixtures } from "./productFixtures";
import { PROCESS_CAMPAIGNS } from "./processCampaigns";
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

/** Original pictograms explain the outcome without turning the scene into another paragraph. */
function OutcomeSymbol({ kind }: { kind: "people" | "shop" | "heart" | "screen" }) {
  return <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === "shop" ? <><path d="M14 23h8l8 30h30l8-22H25M32 63h1M58 63h1" /><circle cx="33" cy="64" r="4" /><circle cx="58" cy="64" r="4" /></> : kind === "heart" ? <path d="M40 64 16 41C-2 20 24 7 40 26c16-19 42-6 24 15Z" /> : kind === "screen" ? <><rect x="12" y="15" width="56" height="42" rx="6" /><path d="M29 68h22M40 57v11m-7-37 17 8-17 8Z" /></> : <><circle cx="31" cy="27" r="11" /><path d="M10 64v-6a21 21 0 0 1 42 0v6M54 18a11 11 0 0 1 0 22m5 9a18 18 0 0 1 11 17" /></>}</svg>;
}

function Plan({ role }: RoleProps) {
  const example = role ? PROCESS_EXAMPLES[role] : null;
  const weeks = example?.calendarThemes ?? ["היכרות", "הערך שלך", "הזמנה לפעולה", "בדיקת תוצאות"];
  return <div className={styles.monthPlan}>
    <div className={styles.monthHeading}><span className={styles.calendarBadge} aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="7" width="22" height="21" rx="4" /><path d="M5 14h22M11 3v8M21 3v8" /></svg></span><div><span className={styles.miniLabel}><Copy text="התוכנית של החודש" /></span><h3><Copy text={example?.planTitle ?? "לכל שבוע יש מטרה."} /></h3></div></div>
    <div className={styles.calendarWeeks}>{weeks.map((focus, index) => <div className={styles.calendarWeek} key={focus} style={{ "--week": index } as CSSProperties}><div><small><Copy text="שבוע {arg_0}" args={{arg_0:index + 1}} /></small><strong><Copy text={focus} /></strong></div><div className={styles.calendarSlots} aria-hidden="true">{[0,1,2,3,4].map(day => <span key={day} data-filled={day === (index % 3) || day === (index % 3) + 2} data-kind={index === 3 ? "results" : day % 2 ? "video" : "image"}>{day === (index % 3) || day === (index % 3) + 2 ? index === 3 ? <Check /> : <FormatSymbol kind={day % 2 ? "video" : "image"} /> : null}</span>)}</div></div>)}</div>
    <div className={styles.calendarLegend}><span><i /><Copy text="תוכן" /></span><span><i /><Copy text="סרטון" /></span><span><i /><Copy text="בדיקת תוצאות" /></span></div>
    <Pointer className={styles.planPointer} />
  </div>;
}

function Goals({ role }: RoleProps) {
  const example = role ? PROCESS_EXAMPLES[role] : null;
  const kind = role === "fundraising" ? "heart" : role === "software" ? "screen" : role === "online_shop" || role === "physical_shop" ? "shop" : "people";
  return <div className={styles.goals}>
    <span className={styles.miniLabel}><Copy text="היעד של החודש" /></span>
    <div className={styles.targetScene} aria-hidden="true"><div className={styles.targetRings}><i /><i /><i /><span><Check /></span></div><div className={styles.outcomeOrbit}><OutcomeSymbol kind={kind} /></div><div className={styles.targetSpark}>+</div><div className={styles.targetSparkSmall}>+</div></div>
    <div className={styles.goalChoice}><span><small><Copy text="מה נרצה להשיג" /></small><strong><Copy text={example?.outcome ?? "יותר פניות מהקהל המתאים"} /></strong></span><span className={styles.check}><Check /></span></div>
    <div className={styles.goalDefinition}><Copy text="בוחרים מה מודדים ולאן רוצים להגיע." /></div>
    <Pointer className={styles.goalPointer} />
  </div>;
}

const FORMATS = [
  { kind: "text", label: "טקסט" }, { kind: "image", label: "תמונה" }, { kind: "video", label: "סרטון" },
] as const;

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
  const media = software ? { src: `/showcase/software-campaign-demo-${locale}.mp4`, poster: `/showcase/software-campaign-demo-${locale}.jpg`, label: "מהקמפיין לפוסט במערכת" } : CAMPAIGN_MEDIA[role];
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (playing) void element.play().catch(() => { /* Native controls support manual playback. */ });
    else element.pause();
  }, [playing, media.src]);
  return <div className={styles.clipPost} data-software={software}><video ref={video} src={media.src} poster={media.poster} muted loop playsInline preload="metadata" controls aria-label={t(media.label)} /></div>;
}

function CampaignArtwork({ role, index, support = false }: { role: ProcessRole; index: number; support?: boolean }) {
  const t = useCopy();
  const { locale } = useLanguage();
  const example = PROCESS_EXAMPLES[role];
  const creative = PROCESS_CAMPAIGNS[role][index];
  const path = PROCESS_ROLES.find(item => item.segment === role)!.path;
  const { campaign, brand } = productFixtures(path, t, locale);
  const headline = support ? creative.headline : creative.title;
  const typeOnly = support;
  const framed = !support && index === 2;
  const post = { ...campaign.roadmap.posts[0], uid: `public-${role}-week${index + 1}-${support ? "support" : "main"}`, week: index + 1,
    title: t(headline), overlay_headline: typeOnly || framed ? t(headline) : "", overlay_sub: support ? t(creative.detail) : "",
    caption: t(creative.detail), cta: t(example.action), image_url: support ? undefined : creative.image, has_overlay: typeOnly || framed,
    design: { composition: typeOnly ? "type_led" : framed ? "inset_frame" : "full_bleed", text_mode: typeOnly ? "type_led" : framed ? "headline" : "photo_only", text_position: support ? ["top", "center", "center", "bottom"][index] : "top" }, content_language: locale,
  };
  const inverse = support && index === 2;
  const colors = { ink: inverse ? example.soft : example.color, paper: inverse ? example.color : example.soft, accent: inverse ? example.soft : example.color };
  const selectedBrand: typeof brand = { ...brand, business_name: t(example.name), palette: [{ role: "primary", hex: colors.ink, name: "" }, { role: "background", hex: colors.paper, name: "" }] };
  const dna = campaign.brand_dna ? { ...campaign.brand_dna, colors, type: role === "online_shop" ? { ...campaign.brand_dna.type, display: "heebo" as const, display_weight: 600 as const } : campaign.brand_dna.type } : undefined;
  return <CardStage post={post} brand={selectedBrand} dna={dna} businessName={t(example.name)} rounded={false} />;
}

/** Autoplay preserves remaining time offscreen; choosing a week starts its full scene. */
function useSceneIndex(count: number, playing: boolean) {
  const [index, setIndex] = useState(0);
  const remaining = useRef(6000);
  const [revision, setRevision] = useState(0);
  const manualRevision = useRef(0);
  useEffect(() => {
    if (!playing) return;
    const started = performance.now();
    const version = manualRevision.current;
    let completed = false;
    const timer = window.setTimeout(() => {
      const next = (index + 1) % count;
      completed = true; remaining.current = next === 1 ? 10000 : 6000;
      setIndex(next);
    }, remaining.current);
    return () => { window.clearTimeout(timer); if (!completed && version === manualRevision.current) remaining.current = Math.max(0, remaining.current - (performance.now() - started)); };
  }, [playing, index, count, revision]);
  return { index, select: (next: number) => { manualRevision.current += 1; remaining.current = next === 1 ? 10000 : 6000; setIndex(next); setRevision(value => value + 1); } };
}

// תכלית: לראות את השבוע, המטרה והחומרים יחד. זו תצוגה ציבורית; אין יצירה או שמירה.
function Campaign({ role, playing }: RoleProps & { playing: boolean }) {
  const t = useCopy();
  const { index, select } = useSceneIndex(4, playing);
  const example = role ? PROCESS_EXAMPLES[role] : null;
  const weeks = example?.weeks ?? ["נותנים סיבה להכיר", "מראים את הערך", "מזמינים לעשות צעד", "לומדים וממשיכים"];
  const creative = role ? PROCESS_CAMPAIGNS[role][index] : null;
  return <div className={styles.campaignBoard} data-campaign-week={index + 1}>
    <header className={styles.boardHeading}><span className={styles.miniLabel}><Copy text="הקמפיין של החודש" /></span><strong><Copy text={example?.name ?? "העסק שלך"} /></strong><span className={styles.boardMonth} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M4 10h16M8 2v6M16 2v6" /></svg></span></header>
    <div className={styles.weekTimeline} role="group" aria-label={t("שבועות הקמפיין")}>{weeks.map((week, i) => <button key={week} type="button" aria-pressed={i === index} onClick={() => select(i)}><span><Copy text="שבוע {arg_0}" args={{arg_0:i + 1}} /></span><i aria-hidden="true" /></button>)}</div>
    <div className={styles.weekWorkspace}>
      <aside className={styles.weekPurpose}><small><Copy text="המטרה של השבוע" /></small><h3><Copy text={weeks[index]} /></h3><span className={styles.weekOutcome}><Check /><Copy text={example?.outcome ?? "פניות מהקהל המתאים"} /></span></aside>
      <div className={styles.weekMaterials}>
        <div className={styles.timelinePost} data-campaign-material={creative?.video || !role && index === 1 ? "video" : creative?.image ?? "generic"}><div className={styles.timelineArtwork} key={`${index}-main`}>{creative?.video || !role && index === 1 ? <CampaignClip role={role} playing={playing} /> : role ? <CampaignArtwork role={role} index={index} /> : <div className={styles.genericArtwork}><FormatSymbol kind={index === 3 ? "text" : "image"} /><span><Copy text={["הסגנון שלך", "הערך שלך", "ההזמנה שלך", "השיחה עם הקהל"][index]} /></span></div>}</div><span><Copy text={creative?.video || !role && index === 1 ? "סרטון" : "פוסט עם תמונה"} /></span></div>
        <div className={styles.timelinePost}><div className={styles.timelineArtwork} key={`${index}-support`}>{role ? <CampaignArtwork role={role} index={index} support /> : <div className={styles.genericArtwork}><FormatSymbol kind="text" /><span><Copy text={weeks[index]} /></span></div>}</div><span><Copy text="פוסט עם מסר" /></span></div>
      </div>
      <Pointer key={index} className={styles.timelinePointer} />
    </div>
    <div className={styles.boardStatus}><Check /><Copy text="החומרים מחכים לאישור שלך" /></div>
  </div>;
}

function Reports() {
  return <div className={styles.reports}>{["Instagram", "Google Analytics", "Facebook"].map((name, index) => <div className={styles.report} key={name}><span dir="ltr">{name}</span><svg viewBox="0 0 140 50" aria-hidden="true"><path pathLength="1" d={index === 1 ? "M0 42 20 33 40 38 60 17 80 25 100 9 120 14 140 2" : "M0 38 20 35 40 18 60 28 80 12 100 20 120 5 140 13"} /></svg><div className={styles.reportBars}><i /><i /><i /><i /><i /></div></div>)}</div>;
}

function Learning({ role }: RoleProps) {
  const example = role ? PROCESS_EXAMPLES[role] : null;
  return <div className={styles.learning}>
    <Reports />
    <svg className={styles.learningFlow} viewBox="0 0 300 50" fill="none" aria-hidden="true"><path d="M40 0Q40 25 150 25M260 0Q260 25 150 25M150 0v50" /></svg>
    <div className={styles.learningInsights}><div className={styles.learningDecision}><span className={styles.check}><Check /></span><div><small><Copy text="מה למדנו" /></small><h3><Copy text={example?.findingTitle ?? "ההדגמה הביאה יותר לחיצות."} /></h3></div></div>
    <div className={styles.learningNext}><span className={styles.nextThumbnail}>{example ? <Image src={example.processImage} fill sizes="90px" alt="" /> : <FormatSymbol kind="video" />}</span><div><small><Copy text="מיישמים בקמפיין הבא" /></small><p><Copy text={example?.next ?? "בפוסט הבא: להראות איך זה נראה בפועל."} /></p></div><span className={styles.check}><Check /></span></div>
    <p className={styles.learningSource}><Copy text={example?.resultNote ?? "נמדדו לחיצות. את התוצאה בעסק בודקים בנפרד."} /></p></div>
  </div>;
}

function DataOverview({ role }: RoleProps) {
  const example = role ? PROCESS_EXAMPLES[role] : null;
  return <div className={styles.dataScene}>
    <div className={styles.overview}><header><span className={styles.miniLabel}><Copy text="התוצאות שלך" /></span><h3><Copy text={example?.name ?? "התמונה של העסק"} /></h3></header><div className={styles.overviewChart} aria-hidden="true"><div><i /><i /><i /></div><svg viewBox="0 0 340 95" preserveAspectRatio="none"><path className={styles.chartArea} d="M0 86 40 76 80 82 120 49 160 59 200 30 240 41 280 16 340 10V95H0Z" /><path pathLength="1" d="M0 86 40 76 80 82 120 49 160 59 200 30 240 41 280 16 340 10" /></svg></div><div className={styles.overviewSources}>{([{provider:"google-analytics",label:"ביקורים באתר"},{provider:"facebook-instagram",label:"עניין בתוכן"},{provider:"ads-pixel",label:"לחיצות על קישורים"}] as const).map(item => <div key={item.label}><ProviderLogo provider={item.provider} size={24} /><span><Copy text={item.label} /></span><div className={styles.overviewBars} aria-hidden="true"><i /><i /><i /><i /><i /></div></div>)}</div></div>
    <span className={styles.sourceChip}><Check /><Copy text="רואים גם מאיפה כל נתון מגיע" /></span>
  </div>;
}

function Trial() {
  return <div className={styles.trialScene}><div className={styles.freeMonth}><span className={styles.miniLabel}><Copy text="חודש ראשון" /></span><strong><Copy text="חינם" /></strong><div className={styles.trialCalendar} aria-hidden="true">{Array.from({length:28},(_,i) => <span key={i}>{i < 7 ? <Check /> : null}</span>)}</div><div className={styles.trialActivities}><span><FormatSymbol kind="text" /></span><span><FormatSymbol kind="image" /></span><span><FormatSymbol kind="video" /></span></div></div><div className={styles.trialChoice}><span className={styles.check}><Check /></span><Copy text="ממשיכים רק אם מתאים" /></div></div>;
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
  const { ref, playing, reduced, paused, toggle, setFocused } = useFeatureCycle(1);
  const t = useCopy();
  return <div ref={ref} className={styles.visual} data-playing={playing} data-reduced={reduced} data-process-visual={step}>
    <div className={styles.visualContent} onFocusCapture={event => setFocused(event.target.matches(":focus-visible"))} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
      {step === "research" ? <Research role={role} /> : step === "connections" ? <Connections role={role} /> : step === "plan" ? <Plan role={role} /> : step === "goals" ? <Goals role={role} /> : step === "campaign" ? <Campaign role={role} playing={playing} /> : step === "learning" ? <Learning role={role} /> : step === "data" ? <DataOverview role={role} /> : step === "trial" ? <Trial /> : <Phone role={role} />}
    </div>
    <button type="button" className={styles.motionToggle} onClick={toggle} disabled={reduced} aria-label={t(paused ? "להפעיל את ההמחשה" : "להשהות את ההמחשה")} aria-pressed={paused} title={t(reduced ? "התנועה כבויה לפי הגדרות המכשיר" : paused ? "להפעיל את ההמחשה" : "להשהות את ההמחשה")}><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">{paused || reduced ? <path d="m5 3 8 5-8 5Z" /> : <path d="M4 3h3v10H4zM10 3h3v10h-3z" />}</svg></button>
  </div>;
}
