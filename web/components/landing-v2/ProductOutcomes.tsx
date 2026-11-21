import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { IconCheck } from "@/lib/icons";
import { ProviderLogo } from "./ProviderLogo";
import { StoryStage } from "./StoryStage";
import styles from "./product-outcomes.module.css";
import art from "./journey-art.module.css";

const SOURCES = [
  { provider: "google-analytics", name: "Google Analytics", data: "כניסות לאתר" },
  { provider: "facebook-instagram", name: "Facebook & Instagram", data: "ביצועי תוכן" },
  { provider: "ads-pixel", name: "Meta Ads", data: "לחיצות על מודעות" },
] as const;

const SCHEDULED: Record<number, string> = {
  4: "/showcase/campaign-cuts/printmaker.webp",
  11: "/showcase/dyo-tari/feed.webp",
  18: "/showcase/dyo-tari/story.webp",
};

function SchedulePreview() {
  return <StoryStage className={art.calendar} decorative>
    <div className={art.planner}>
      <div className={art.plannerHead}><strong><Copy text="לוח הפרסום" /></strong><i/><i/></div>
      <div className={art.days}>
        {Array.from({ length: 28 }, (_, i) => {
          const day = i + 1;
          return <span key={day} data-publish={SCHEDULED[day] ? day : undefined}>
            {day}
            {SCHEDULED[day] && <Image src={SCHEDULED[day]} width={60} height={44} alt="" sizes="46px" />}
          </span>;
        })}
      </div>
    </div>
    <strong className={art.planNote}><Copy text="פותחים הרשמה לסדנה" /></strong>
  </StoryStage>;
}

function ApprovalPreview() {
  const [approved, setApproved] = useState(false);
  const t = useCopy();
  return <StoryStage className={art.edition}>
    <div aria-hidden="true" className={art.campaignStack}>
      <Image src="/showcase/dyo-tari/story.webp" width={720} height={1280} alt="" sizes="100px" />
      <Image src="/showcase/dyo-tari/feed.webp" width={864} height={1080} alt="" sizes="170px" />
    </div>
    <button type="button" className={art.approve} aria-pressed={approved}
      aria-label={t(approved ? "להציג שוב את אישור הפוסט" : "לאשר את הפוסט")} onClick={()=>setApproved(value=>!value)}>
      <IconCheck /><span role="status" data-approved={approved || undefined}><Copy text={approved ? "אושר. מוכן לפרסום" : "לאשר את הפוסט"} /></span>
    </button>
  </StoryStage>;
}

function MeasurementPreview() {
  return <StoryStage className={art.numbers}>
    <div className={art.measureTitle}><Copy text="הרשמות לסדנה" /><small><Copy text="תצוגה לדוגמה" /></small></div>
    <div className={art.filledSeats} aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => <div key={i} data-filled={i<3 || undefined}>{i<3 && <IconCheck />}</div>)}
    </div>
    <strong className={art.count}><Copy text="3 מתוך 8 מקומות" /></strong>
    <small className={art.metricSource}><bdi lang="en">Google Analytics</bdi></small>
  </StoryStage>;
}

export function ProductOutcomes() {
  return <section id="results" className={styles.results} aria-labelledby="outcome-title">
    <div className="lv2-wrap">
      <h2 id="outcome-title"><Copy text="מה מקבלים" /></h2>
      <div className={styles.outcomeGrid}>
        <article id="campaign" className={styles.outcome}>
          <span id="plan" className={styles.anchor} aria-hidden="true" />
          <SchedulePreview /><h3><Copy text="יודעים מה לפרסם השבוע" /></h3>
        </article>
        <article id="posts" className={styles.outcome}>
          <span id="mobile" className={styles.anchor} aria-hidden="true" />
          <ApprovalPreview /><h3><Copy text="מקבלים פוסט מוכן לאישור" /></h3>
        </article>
        <article id="learning" className={styles.outcome}>
          <span id="data" className={styles.anchor} aria-hidden="true" />
          <MeasurementPreview /><h3><Copy text="רואים כמה נרשמו" /></h3>
        </article>
      </div>
    </div>
  </section>;
}

export function ConnectedChannels() {
  const { locale } = useLanguage();
  return <section className={styles.connections} aria-labelledby="channels-title">
    <div className={`lv2-wrap ${styles.connectionsInner}`}>
      <div>
        <h2 id="channels-title"><Copy text="הכל מתחבר למקום אחד" /></h2>
        <p><Copy text="מחברים את החשבונות שכבר יש לכם, כדי להבין מה קורה באתר וברשתות." /></p>
      </div>
      <div className={styles.sourceLinks}>
        {SOURCES.map(({ provider, name, data }) => <Link key={provider} href={`/connections/${provider}?lang=${locale}`}>
          <ProviderLogo provider={provider} size={25} />
          <div><bdi lang="en">{name}</bdi><span><Copy text={data} /></span></div>
        </Link>)}
      </div>
    </div>
  </section>;
}
