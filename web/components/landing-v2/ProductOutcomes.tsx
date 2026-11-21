import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { IconCalendar, IconFlag, IconPhotos } from "@/lib/icons";
import { ProviderLogo } from "./ProviderLogo";
import styles from "./product-outcomes.module.css";

const SCHEDULE = [
  { week: "שבוע ראשון", task: "פוסט היכרות", channel: "Instagram", status: "ממתין לאישור" },
  { week: "שבוע שני", task: "סיפור של לקוח", channel: "Facebook", status: "בתוכנית" },
  { week: "שבוע שלישי", task: "הזמנה ליצור קשר", channel: "Instagram", status: "בתוכנית" },
] as const;

const SOURCES = [
  { provider: "google-analytics", name: "Google Analytics", data: "כניסות לאתר" },
  { provider: "facebook-instagram", name: "Facebook & Instagram", data: "ביצועי תוכן" },
  { provider: "ads-pixel", name: "Meta Ads", data: "לחיצות על מודעות" },
] as const;

function SchedulePreview() {
  return <figure className={styles.workspace}>
    <figcaption className={styles.workspaceTitle}><IconCalendar /><Copy text="התוכנית לחודש הקרוב" /></figcaption>
    <p className={styles.scheduleGoal}><IconFlag /><Copy text="לקבל יותר פניות" /></p>
    <ol className={styles.schedule}>
      {SCHEDULE.map(({ week, task, channel, status }, index) => (
        <li key={week}>
          <p><Copy text={week} /></p>
          <div><strong><Copy text={task} /></strong><bdi lang="en">{channel}</bdi></div>
          <span data-pending={index === 0 || undefined}><Copy text={status} /></span>
        </li>
      ))}
    </ol>
  </figure>;
}

function ApprovalPreview() {
  const t = useCopy();
  const [approved, setApproved] = useState(false);
  return <div className={styles.approvalComposition}>
    <figure className={styles.phone}>
      <figcaption className={styles.phoneHeading}><IconPhotos /><Copy text="הפוסט הבא שלכם" /></figcaption>
      <Image src="/showcase/dyo-tari/story-offer.webp" width={720} height={1280}
        alt={t("סטורי כחול שמציג את ההדפס שאפשר להכין בסדנה")} sizes="188px" />
      <div className={styles.phoneStatus}>
        <bdi lang="en">Instagram</bdi>
        <span role="status" data-approved={approved || undefined}>
          <Copy text={approved ? "אושר. מוכן לפרסום" : "ממתין לאישור"} />
        </span>
      </div>
      <button type="button" className={styles.approvalAction} onClick={() => setApproved(current => !current)}>
        <Copy text={approved ? "להציג שוב את אישור הפוסט" : "לאשר את הפוסט"} />
      </button>
    </figure>
  </div>;
}

function MeasurementPreview() {
  return <figure className={styles.workspace} id="data">
    <figcaption className={styles.workspaceTitle}>
      <Copy text="מה עבד ומה כדאי לנסות" />
      <small className={styles.measurementExample}><Copy text="תצוגה לדוגמה" /></small>
    </figcaption>
    <div className={styles.measurement}>
      <dl>
        <div><dt><Copy text="לחיצות על הקישור" /></dt><dd>38 · <bdi lang="en">Instagram</bdi></dd></div>
        <div><dt><Copy text="טפסים שנשלחו" /></dt><dd>3 · <bdi lang="en">Google Analytics</bdi></dd></div>
      </dl>
      <div className={styles.finding}>
        <p><Copy text="הצעה לפוסט הבא" /></p>
        <strong><Copy text="להפנות לטופס קצר ולבדוק אם יותר אנשים משאירים פרטים" /></strong>
      </div>
    </div>
  </figure>;
}

export function ProductOutcomes() {
  return <section id="results" className={styles.results} aria-labelledby="outcome-title">
    <div className="lv2-wrap">
      <div className={styles.resultsHeading}>
        <h2 id="outcome-title"><Copy text="מה מקבלים" /></h2>
        <span><Copy text="תצוגה לדוגמה" /></span>
      </div>
      <article id="campaign" className={styles.outcome}>
        <div className={styles.outcomeCopy}>
          <span id="plan" className={styles.anchor} aria-hidden="true" />
          <h3><Copy text="קמפיין" /></h3>
          <p><Copy text="תוכנית חודשית עם קהל, יעד ולוח פרסום." /></p>
        </div>
        <SchedulePreview />
      </article>
      <article id="posts" className={styles.outcome}>
        <div className={styles.outcomeCopy}>
          <span id="mobile" className={styles.anchor} aria-hidden="true" />
          <h3><Copy text="פוסטים" /></h3>
          <p><Copy text="תוכן, עיצובים וסרטונים לאישורכם." /></p>
          <p><Copy text="מהנייד, בדפדפן: מאשרים את הפוסט הבא בין לקוח ללקוח." /></p>
        </div>
        <ApprovalPreview />
      </article>
      <article id="learning" className={styles.outcome}>
        <div className={styles.outcomeCopy}>
          <h3><Copy text="מדידה" /></h3>
          <p><Copy text="בודקים מה הצליח בכל פוסט, ומציעים מה לשנות בקמפיין הבא." /></p>
        </div>
        <MeasurementPreview />
      </article>
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
