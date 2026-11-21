import Image from "next/image";
import { Copy } from "@/components/language/LanguageProvider";
import { StoryStage } from "./StoryStage";
import styles from "./landing-story.module.css";
import art from "./journey-art.module.css";

const media = "/showcase/campaign-cuts/";
const STEPS = [
  { id: "research", title: "מספרים על העסק", body: "כמה שאלות על מה אתם מציעים, למי ומה מייחד אתכם." },
  { id: "connections", title: "מחברים את הערוצים", body: "מוסיפים את ערוצי הקידום והנתונים שרוצים לשתף." },
  { id: "goals", title: "בוחרים יעד לחודש", body: "מחליטים מה רוצים להשיג ואיך נדע שהתקדמנו." },
] as const;

function Interview() {
  return <StoryStage className={art.interview} decorative>
    <Image src={media+"printmaker.webp"} alt="" fill sizes="(max-width:760px) 92vw, 31vw" className={art.photograph} />
    <div className={art.conversation}>
      <span><Copy text="מה מיוחד בסדנה שלכם?" /></span>
      <strong><Copy text="כל משתתף מדפיס ולוקח את ההדפס הביתה." /></strong>
    </div>
  </StoryStage>;
}

function Connections() {
  return <StoryStage className={art.routing} decorative>
    <div className={art.sourceColumn}>
      <i><Image alt="" src="/connectors/instagram.svg" width={38} height={38} /></i>
      <i><Image alt="" src="/connectors/googleanalytics.svg" width={38} height={38} /></i>
    </div>
    <svg className={art.traces} viewBox="0 0 230 100" preserveAspectRatio="none" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke">
        <path d="M0 25H68 Q86 25 98 31 H230" /><path d="M0 75H68 Q86 75 98 69 H230" />
      </g>
      <path className={art.pulse} d="M0 25H68 Q86 25 98 31 H230" />
    </svg>
    <div className={art.siteProof}>
      <div><span><Copy text="לחיצות על הקישור" /></span><i/></div>
      <div><span><Copy text="ביקורים באתר" /></span><i/></div>
    </div>
  </StoryStage>;
}

function Goal() {
  return <StoryStage className={art.goal} decorative>
    <Image src={media+"worktable.webp"} fill alt="" sizes="(max-width:760px) 92vw, 31vw" className={art.photograph} />
    <div className={art.seatTicket}><span><Copy text="היעד לחודש" /></span><strong><Copy text="8 הרשמות לסדנה" /></strong></div>
  </StoryStage>;
}

const VISUALS = { research: Interview, connections: Connections, goals: Goal };
export function LandingStory() {
  return <section id="story" className={`lv2-wrap ${styles.steps}`} aria-labelledby="story-title">
    <h2 id="story-title"><Copy text="ככה זה עובד" /></h2>
    <ol>
      {STEPS.map((step, index) => {
        const Visual = VISUALS[step.id];
        return <li id={step.id} key={step.id}>
          <Visual />
          <div className={styles.stepCopy}>
            <span aria-hidden="true">{index+1}</span><div><h3><Copy text={step.title} /></h3><p><Copy text={step.body} /></p></div>
          </div>
        </li>;
      })}
    </ol>
  </section>;
}
