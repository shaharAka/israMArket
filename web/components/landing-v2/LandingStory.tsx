import { Copy } from "@/components/language/LanguageProvider";
import { IconCalendar, IconCheck, IconFlag, IconPhotos } from "@/lib/icons";
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
      <div className={styles.field}><Copy text="שירות אישי, גם אחרי הקנייה" /><IconCheck /></div>
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
    <p><Copy text="הערוצים שלכם" /></p>
  </div>;
}

function GoalVisual() {
  return <div className={styles.goalArt} aria-hidden="true">
    <div className={styles.goalSheet}>
      <IconFlag />
      <div>
        <span><Copy text="יעד לחודש" /></span>
        <strong><Copy text="לקבל יותר פניות" /></strong>
      </div>
      <p><Copy text="נמדוד כמה טפסים נשלחו" /></p>
    </div>
  </div>;
}

const STEP_VISUALS = {
  research: InterviewVisual,
  connections: ConnectionsVisual,
  goals: GoalVisual,
};

/** A compact, localized illustration of the plan and its next action. */
export function LandingProductVisual() {
  return <figure className={styles.productArt}>
    <figcaption className={styles.previewLabel}>
      <IconCalendar /><Copy text="תצוגה לדוגמה" />
    </figcaption>
    <div className={styles.productSheet}>
      <div className={styles.productIntro}>
        <p><Copy text="תוכנית החודש" /></p>
        <strong><Copy text="לקבל יותר פניות" /></strong>
        <span><IconFlag /><Copy text="נמדוד כמה טפסים נשלחו" /></span>
      </div>
      <div className={styles.productWeek}>
        <h2><Copy text="מה עושים השבוע" /></h2>
        <ul>
          <li>
            <span className={styles.planDay}><Copy text="יום שני" /></span>
            <div><strong><Copy text="פוסט היכרות" /></strong><span>Instagram</span></div>
            <span className={styles.planApproval}><Copy text="ממתין לאישור" /></span>
          </li>
          <li>
            <span className={styles.planDay}><Copy text="יום חמישי" /></span>
            <div><strong><Copy text="סיפור של לקוח" /></strong><span>Facebook</span></div>
            <span className={styles.planStatus}><Copy text="בתוכנית" /></span>
          </li>
        </ul>
      </div>
      <p className={styles.productNext}><IconPhotos /><Copy text="הצעד הבא הוא לבדוק את הפוסט לפני הפרסום." /></p>
    </div>
  </figure>;
}

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
