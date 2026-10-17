"use client";

import Image from "next/image";
import Link from "next/link";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { CardStage } from "@/components/CardCanvas";
import { PlanBrief } from "@/components/design/PlanBrief";
import { BrandWordmark } from "./BrandWordmark";
import { BUSINESS_EXAMPLES, type ExamplePath } from "./businessExamples";
import { ProviderLogo } from "./ProviderLogo";
import { productFixtures } from "./productFixtures";
import { useFeatureCycle } from "./useFeatureCycle";
import type { ProcessStep } from "./processStory";
import styles from "./process-story.module.css";

function Check() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Pointer({ className = "" }: { className?: string }) {
  return <svg className={`${styles.pointer} ${className}`} viewBox="0 0 32 38" width="32" height="38" fill="none" aria-hidden="true"><path d="M4 3v27l7-7 6 11 6-3-6-11h10L4 3Z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" /></svg>;
}

function Research({ path }: { path: ExamplePath }) {
  const example = BUSINESS_EXAMPLES[path];
  return <div className={styles.research}>
    <div className={styles.webPage}>
      <div className={styles.browserBar}><i /><i /><i /><span dir="ltr">www.</span></div>
      <div className={styles.webBody}>
        <span className={styles.miniLabel}><Copy text={example.kind} /></span>
        <strong><Copy text={example.name} /></strong>
        <div className={styles.webImage}>{path !== "saas" ? <Image src={example.image || "/showcase/nonprofit-community-ai.png"} fill sizes="300px" alt="" /> : <div className={styles.webPlaceholder}><BrandWordmark /></div>}</div>
        <div className={styles.scanLine} />
      </div>
    </div>
    <div className={styles.interview}><span className={styles.miniLabel}><Copy text="בשיחה איתך" /></span><p><Copy text="מה מייחד אותך?" /></p><div className={styles.answer}><Copy text={path === "services" ? "יחס אישי בכל שלב." : path === "products" ? "בחירה קפדנית ושירות אישי." : path === "saas" ? "תוכנית ותוכן במערכת אחת." : "עשייה מקומית, השפעה קרובה."} /></div></div>
    <div className={styles.researchResult}><span className={styles.check}><Check /></span><div><small><Copy text="למי פונים" /></small><p><Copy text={path === "services" ? "לבעלי דירות לפני שיפוץ." : path === "products" ? "למשפחות שמזמינות לשישי." : path === "saas" ? "לבעלי עסקים שמקדמים בעצמם." : "למי שרוצה לתמוך בקהילה."} /></p></div></div>
    <Pointer className={styles.researchPointer} />
  </div>;
}

const PROVIDERS = [
  { provider: "google-analytics", label: "Google Analytics" },
  { provider: "facebook-instagram", label: "Instagram · Facebook" },
  { provider: "whatsapp", label: "WhatsApp" },
] as const;

function Connections() {
  const { locale } = useLanguage();
  return <div className={styles.connections}>
    <div className={styles.providerColumn}>{PROVIDERS.map((item) => <Link href={`/connections/${item.provider}?lang=${locale}`} className={styles.provider} key={item.provider}><ProviderLogo provider={item.provider} size={30} /><span dir="ltr">{item.label}</span></Link>)}</div>
    <svg className={styles.connectionLines} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M0 18 C65 18 35 50 100 50 M0 50 H100 M0 82 C65 82 35 50 100 50" /></svg>
    <div className={styles.connectedHub}><BrandWordmark /><span><Copy text="התמונה של העסק" /></span><div className={styles.hubRow}><Check /><Copy text="מאיפה מגיעים לאתר" /></div><div className={styles.hubRow}><Check /><Copy text="אילו פוסטים מעניינים את הקהל" /></div><div className={styles.hubRow}><Check /><Copy text="על מה לחצו כדי לפנות" /></div></div>
    <span className={styles.connectionFoot}><Copy text="כל מקור מוסיף מידע אחר לתוכנית." /></span>
  </div>;
}

function Plan({ path }: { path: ExamplePath }) {
  const example = BUSINESS_EXAMPLES[path];
  return <div className={styles.planSheet}>
    <div className={styles.sheetHeading}><span className={styles.miniLabel}><Copy text="התוכנית של החודש" /></span></div>
    <h3><Copy text={path === "products" ? "יותר הזמנות מראש לחנות." : path === "services" ? "פניות חדשות לקראת שיפוץ." : path === "saas" ? "הרשמות להתנסות במוצר." : "יותר תמיכה בפעילות העמותה."} /></h3>
    <p className={styles.planAudience}><Copy text={example.name} /></p>
    <div className={styles.planWeeks}>{[
      ["שבוע 1", "נותנים סיבה להכיר"],
      ["שבוע 2", "מראים את הערך"],
      ["שבוע 3", path === "nonprofit" ? "מזמינים לתמוך" : "מזמינים לעשות צעד"],
      ["שבוע 4", "לומדים וממשיכים"],
    ].map(([week, title], index) => <div className={`${styles.week} ${styles[`week${index}`] || ""}`} key={week}><span><Copy text={week} /></span><div><strong><Copy text={title} /></strong></div><i><Check /></i></div>)}</div>
    <Pointer className={styles.planPointer} />
  </div>;
}

function Goals({ path }: { path: ExamplePath }) {
  const measure = path === "products" ? "הזמנות באתר" : path === "saas" ? "הרשמות להתנסות" : path === "nonprofit" ? "תרומות שהושלמו" : "פניות לקביעת פגישה";
  return <div className={styles.goals}>
    <span className={styles.miniLabel}><Copy text="מה רוצים להשיג?" /></span>
    <div className={styles.goalChoice}><span><Copy text={measure} /></span><span className={styles.check}><Check /></span></div>
    <div className={styles.goalNumbers}><div><small><Copy text="נקודת ההתחלה" /></small><strong>12</strong></div><span className={styles.goalConnector} aria-hidden="true" /><div><small><Copy text="היעד לחודש" /></small><strong>18</strong></div></div>
    <div className={styles.goalTrack}><span /></div>
    <div className={styles.goalDefinition}><Check /><p><Copy text="מודדים תוצאה שחשובה לעסק, לא רק צפיות." /></p></div>
    <Pointer className={styles.goalPointer} />
  </div>;
}

function Campaign({ path }: { path: ExamplePath }) {
  const t = useCopy();
  const { locale } = useLanguage();
  const { campaign, brand } = productFixtures(path, t, locale);
  return <div className={styles.campaign}>
    <div className={styles.campaignBrief}><span className={styles.miniLabel}><Copy text="הקמפיין של החודש" /></span><strong><Copy text="מטרה אחת. כמה דרכים לספר אותה." /></strong></div>
    <div className={styles.postFan}>{campaign.roadmap.posts.map((post, index) => <div key={post.uid} className={`${styles.fanPost} ${styles[`fan${index}`]}`}><CardStage post={post} brand={brand} dna={campaign.brand_dna} businessName={t(BUSINESS_EXAMPLES[path].name)} rounded={false} /></div>)}</div>
    <span className={styles.campaignFoot}><Copy text="טקסט, עיצוב וקישור. מחכים לבדיקה שלך." /></span>
  </div>;
}

function Learning({ path }: { path: ExamplePath }) {
  const example = BUSINESS_EXAMPLES[path];
  return <div className={styles.learning}>
    <div className={styles.reports}>{["Instagram", "Google Analytics", "Facebook"].map((name, index) => <div className={styles.report} key={name}><span dir="ltr">{name}</span><svg viewBox="0 0 140 50" aria-hidden="true"><path d={index === 1 ? "M0 42 20 33 40 38 60 17 80 25 100 9 120 14 140 2" : "M0 38 20 35 40 18 60 28 80 12 100 20 120 5 140 13"} /></svg><div className={styles.reportBars}><i /><i /><i /><i /><i /></div></div>)}</div>
    <div className={styles.finding}>
      <span className={styles.miniLabel}><Copy text="מה למדנו" /></span><h3><Copy text={path === "products" ? "יותר לחיצות על הפוסט עם המחיר." : path === "saas" ? "יותר לחיצות על הדגמת המוצר." : path === "nonprofit" ? "יותר לחיצות על הסבר הפעילות." : "יותר לחיצות על הטיפ המקצועי."} /></h3>
      <div className={styles.nextAction}><span className={styles.check}><Check /></span><p><Copy text={example.next} /></p></div>
      <p className={styles.sourceLimit}><Copy text={path === "products" ? "נמדדו לחיצות על הקישור, לא הזמנות שהושלמו." : path === "saas" ? "נמדדו לחיצות על הקישור, לא הרשמות להתנסות." : path === "nonprofit" ? "נמדדו לחיצות על הקישור, לא תרומות שהושלמו." : "נמדדו לחיצות על הקישור, לא שיחות שנקבעו."} /></p>
    </div>
  </div>;
}

function Phone({ path }: { path: ExamplePath }) {
  const t = useCopy();
  const { locale } = useLanguage();
  const example = BUSINESS_EXAMPLES[path];
  const { campaign, brand } = productFixtures(path, t, locale);
  return <div className={styles.phone}>
    <div className={styles.phoneBar}><span>9:41</span><i /></div>
    <div className={styles.phoneBrand}><BrandWordmark /></div>
    <div className={styles.phoneViewport}><div className={styles.phoneContent}><div className={styles.phoneScreens}>
      <div className={styles.phonePlan}><PlanBrief compact businessName={t(example.name)} direction={t(example.plan)} measure={t(example.metric)} ownerAction={t(example.recommendation)} /></div>
      <div className={styles.phonePost}><CardStage post={campaign.roadmap.posts[0]} brand={brand} dna={campaign.brand_dna} businessName={t(example.name)} rounded={false} /></div>
    </div></div></div>
    <Pointer className={styles.phonePointer} /><span className={styles.phoneHome} />
  </div>;
}

/** Readable, bounded illustrations. Offscreen/hidden/focused demos stop; reduced motion shows the result. */
export function ProcessAnimation({ step, path }: { step: ProcessStep; path: ExamplePath }) {
  const { ref, playing, reduced, paused, toggle } = useFeatureCycle(1);
  const t = useCopy();
  return <div ref={ref} className={styles.visual} data-playing={playing} data-reduced={reduced} data-process-visual={step}>
    <div className={styles.visualContent}>
      {step === "research" ? <Research path={path} /> : step === "connections" ? <Connections /> : step === "plan" ? <Plan path={path} /> : step === "goals" ? <Goals path={path} /> : step === "campaign" ? <Campaign path={path} /> : step === "learning" ? <Learning path={path} /> : <Phone path={path} />}
    </div>
    <button type="button" className={styles.motionToggle} onClick={toggle} disabled={reduced} aria-label={t(paused ? "להפעיל את ההמחשה" : "להשהות את ההמחשה")} aria-pressed={paused} title={t(reduced ? "התנועה כבויה לפי הגדרות המכשיר" : paused ? "להפעיל את ההמחשה" : "להשהות את ההמחשה")}><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">{paused || reduced ? <path d="m5 3 8 5-8 5Z" /> : <path d="M4 3h3v10H4zM10 3h3v10h-3z" />}</svg></button>
  </div>;
}
