import { Copy } from "@/components/language/LanguageProvider";
import { IconCheck, IconFlag } from "@/lib/icons";
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

function InterviewVisual() {
  return <div className={styles.interviewArt} aria-hidden="true">
    <div className={styles.interviewSheet}>
      <strong><Copy text="מה מבדיל אתכם מאחרים?" /></strong>
      <div className={styles.field}><Copy text="מדפיסים ביד ולוקחים את ההדפס הביתה" /><IconCheck /></div>
    </div>
  </div>;
}

function ConnectionsVisual() {
  return <div className={styles.channelsArt} aria-hidden="true">
    <div className={styles.channels}>
      <ProviderLogo provider="google-analytics" size={24} />
      <ProviderLogo provider="facebook-instagram" size={24} />
      <ProviderLogo provider="whatsapp" size={24} />
    </div>
    <p><Copy text="האתר והרשתות שלכם" /></p>
  </div>;
}

function GoalVisual() {
  return <div className={styles.goalArt} aria-hidden="true">
    <div className={styles.goalSheet}>
      <IconFlag />
      <div>
        <span><Copy text="יעד לחודש" /></span>
        <strong><Copy text="למלא את סדנת ההדפס" /></strong>
      </div>
      <p><Copy text="נבדוק כמה אנשים נרשמו" /></p>
    </div>
  </div>;
}

const STEP_VISUALS = {
  research: InterviewVisual,
  connections: ConnectionsVisual,
  goals: GoalVisual,
};

export function LandingStory() {
  return <section id="story" className={`lv2-wrap ${styles.steps}`} aria-labelledby="story-title">
      <h2 id="story-title"><Copy text="ככה זה עובד" /></h2>
      <ol>
        {STEPS.map((step, index) => {
          const Visual = STEP_VISUALS[step.id];
          return <li id={step.id} key={step.id}>
            <div className={styles.stepCopy}>
              <span aria-hidden="true">{index + 1}</span>
              <div>
                <h3><Copy text={step.title} /></h3>
                <p><Copy text={step.body} /></p>
              </div>
            </div>
            <Visual />
          </li>;
        })}
      </ol>
  </section>;
}
