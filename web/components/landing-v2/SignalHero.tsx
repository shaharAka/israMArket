"use client";

import Image from "next/image";
import Link from "next/link";
import { Copy, useLanguage } from "@/components/language/LanguageProvider";
import { PROCESS_HERO } from "./processStory";
import { StoryStage } from "./StoryStage";
import { campaignVisits, campaignWeek, formatNovember } from "./workshopCampaign";
import { TrialCtaLabel, TrialOfferNote } from "./TrialCtaLabel";
import styles from "./signal-hero.module.css";

function CampaignSheet({ locale }: { locale: string }) {
  return <StoryStage className={styles.sheet}>
    <header className={styles.brief}>
      <div className={styles.sheetByline}><Copy text="תוכנית קידום לדוגמה" /><span><Copy text="סטודיו דיו טרי" /></span></div>
      <strong><Copy text="למלא את סדנת ההדפס" /></strong>
      <p><Copy text="קהל היעד: חובבי יצירה בחיפה." /></p>
    </header>
    <div className={styles.week}>
      <div className={styles.weekHead}><b><Copy text="השבוע בתוכנית" /></b><time dateTime="2026-11-08">{formatNovember(locale, 8, {month:"long", year:"numeric"})}</time></div>
      <ol>
        {campaignWeek.map(item => <li key={item.day}>
          <time dateTime={`2026-11-${String(item.day).padStart(2, "0")}`}>{formatNovember(locale, item.day, {weekday:"short", day:"numeric"})}</time>
          <div className={styles.thumbnail}><Image src={item.image} fill alt="" sizes="(max-width:760px) 23vw, 12vw" style={{objectPosition:item.position}} /></div>
          <strong><Copy text={item.title} /></strong><bdi lang="en">{item.platform}</bdi>
        </li>)}
      </ol>
    </div>
    <div className={styles.decision}>
      <div><b><Copy text="מה למדנו" /></b><p><Copy text="{arg_0} ביקורים באתר מאינסטגרם, {arg_1} מפייסבוק." args={{arg_0:campaignVisits[0].later, arg_1:campaignVisits[1].later}} /></p></div>
      <div><b><Copy text="הצעד הבא" /></b><p><Copy text="ננסה סרטון נוסף באינסטגרם." /></p></div>
    </div>
  </StoryStage>;
}

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
          <a href="#story" className={styles.storyLink}><Copy text="ככה זה עובד" /></a>
        </div>
        <small><TrialOfferNote /><Copy text="בלי כרטיס אשראי. בלי התחייבות." /></small>
      </div>
      <CampaignSheet locale={locale} />
    </div>
  </section>;
}
