import { Copy } from "@/components/language/LanguageProvider";
import { IconChart, IconFlag, IconPhotos } from "@/lib/icons";
import { BrandWordmark } from "./BrandWordmark";
import { ProviderLogo } from "./ProviderLogo";
import styles from "./landing-story.module.css";

const STEPS = [
  {
    id: "research", title: "מספרים על העסק",
    body: "כמה שאלות על מה אתם מציעים, למי ומה מייחד אתכם.",
  },
  {
    id: "connections", title: "מחברים את הערוצים",
    body: "מוסיפים את ערוצי הקידום והנתונים שרוצים לשתף.",
  },
  {
    id: "goals", title: "בוחרים יעד לחודש",
    body: "מחליטים מה רוצים להשיג ואיך נדע שהתקדמנו.",
  },
] as const;

const OUTCOMES = [
  { id: "campaign", alias: "plan", title: "קמפיין", body: "תוכנית חודשית עם קהל, יעד ולוח פרסום." },
  { id: "posts", alias: null, title: "פוסטים", body: "תוכן, עיצובים וסרטונים לאישורכם." },
  { id: "learning", alias: "data", title: "מדידה", body: "רואים מה התקדם ומה כדאי לשנות." },
] as const;

function InterviewVisual() {
  return <div className={styles.interviewArt} aria-hidden="true">
    <div className={styles.interviewSheet}>
      <strong><Copy text="מה תרצו לקדם?" /></strong>
      <div className={styles.field}><Copy text="מה אתם מציעים?" /></div>
      <div className={styles.field}><Copy text="למי זה מתאים?" /></div>
    </div>
  </div>;
}

function ConnectionsVisual() {
  return <div className={styles.channelsArt} aria-hidden="true">
    <div className={styles.channels}>
      <div><ProviderLogo provider="google-analytics" size={28} /></div>
      <div><ProviderLogo provider="facebook-instagram" size={28} /></div>
      <div><ProviderLogo provider="whatsapp" size={28} /></div>
    </div>
    <div className={styles.converge}><i /><i /><i /></div>
    <div className={styles.channelHub}><BrandWordmark /></div>
  </div>;
}

function GoalVisual() {
  return <div className={styles.goalArt} aria-hidden="true">
    <div className={styles.goalSheet}>
      <IconFlag />
      <div>
        <span><Copy text="יעד לחודש" /></span>
        <strong><Copy text="יותר הזמנות" /></strong>
      </div>
      <p><Copy text="מודדים הזמנות שהושלמו" /></p>
    </div>
  </div>;
}

const STEP_VISUALS = {
  research: InterviewVisual,
  connections: ConnectionsVisual,
  goals: GoalVisual,
};

/** A simplified view of the three outputs, rendered as product elements. */
export function LandingProductVisual() {
  return <div className={styles.productArt} aria-hidden="true">
    <div className={styles.productSheet}>
      <div className={styles.productBrand}><BrandWordmark /></div>
      <strong><Copy text="התוכנית שלכם לחודש הקרוב." /></strong>
      <div className={styles.productRows}>
        <div><span><IconFlag /></span><Copy text="קמפיין" /></div>
        <div><span><IconPhotos /></span><Copy text="פוסטים" /></div>
        <div><span><IconChart /></span><Copy text="מדידה" /></div>
      </div>
    </div>
  </div>;
}

export function LandingStory() {
  return <>
    <section id="story" className={`lv2-wrap ${styles.steps}`} aria-labelledby="story-title">
      <h2 id="story-title"><Copy text="ככה זה עובד" /></h2>
      <ol>
        {STEPS.map((step, index) => {
          const Visual = STEP_VISUALS[step.id];
          return <li id={step.id} key={step.id}>
            <Visual />
            <div className={styles.stepCopy}>
              <span aria-hidden="true">{index + 1}</span>
              <div>
                <h3><Copy text={step.title} /></h3>
                <p><Copy text={step.body} /></p>
              </div>
            </div>
          </li>;
        })}
      </ol>
    </section>
    <section id="results" className={styles.outcomes} aria-labelledby="outcome-title">
      <div className="lv2-wrap">
        <h2 id="outcome-title"><Copy text="מה מקבלים" /></h2>
        <div className={styles.outcomeGrid}>
          {OUTCOMES.map(outcome => (
            <article id={outcome.id} key={outcome.id}>
              {outcome.alias && <span id={outcome.alias} className={styles.anchor} aria-hidden="true" />}
              <h3><Copy text={outcome.title} /></h3>
              <p><Copy text={outcome.body} /></p>
            </article>
          ))}
        </div>
      </div>
    </section>
  </>;
}
