"use client";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { ProductFeatureShowcase } from "./ProductFeatureShowcase";
import { PERSONA_PAGES } from "./personaPages";
import { BUSINESS_EXAMPLES, type ExamplePath } from "./businessExamples";
import { useFeatureCycle } from "./useFeatureCycle";
import styles from "./value-story.module.css";

export function FeatureStory({ path }: { path: ExamplePath }) {
  const { ref: cycleRef, index: activeIndex, select, paused, reduced, toggle, setFocused } = useFeatureCycle(3);
  const feature = (["interview", "research", "plan"] as const)[activeIndex];
  const business = BUSINESS_EXAMPLES[path];
  const t = useCopy();
  return <section id="story" className={styles.section} data-tone="research" aria-labelledby="features-title">
    <div className="lv2-wrap"><h2 id="features-title" className={styles.sectionTitle}><Copy text="מהיכרות עם העסק, לשיווק שמתקדם איתכם." /></h2>
      <div className={styles.featureGrid} ref={cycleRef}>
        <div className={styles.copy}><p className="lv2-eyebrow"><Copy text="מכירים, חוקרים ומתכננים" /></p>
          <h3><Copy text={feature === "plan" ? PERSONA_PAGES[path].planTitle : feature === "interview" ? "אתם מכירים את העסק. אנחנו מתחילים בהקשבה." : "השיווק מתחיל במה שמיוחד אצלכם."} /></h3>
          <p><Copy text={feature === "interview" ? "כמה שאלות על מה שאתם עושים, הלקוחות והכיוון שלכם. ממשיכים עם מה שכבר סיפרתם, גם אם עדיין אין אתר או חשבונות מחוברים." : feature === "research" ? "חוקרים את האתר, ההצעה והקהל. מחברים את מה שסיפרתם עם מה שמצאנו, ומראים לכם מה למדנו ועל מה זה מבוסס." : "המחקר הופך לתוכנית מתמשכת: מה לקדם, למי, מה לפרסם ואיך לבדוק אם הכיוון עובד. אתם רואים מה עושים עכשיו ולמה."} /></p>
          <div className={styles.featureChoices} role="group" aria-label={t("לבחור יכולת לראות")}>
            {["היכרות קצרה", "המחקר על העסק", "תוכנית השיווק"].map((label, index) => <button key={label} aria-pressed={activeIndex === index} onClick={() => select(index)}><Copy text={label} /></button>)}
            {!reduced && <button onClick={toggle} aria-label={t(paused ? "להמשיך את המעבר בין התכונות" : "לעצור את המעבר בין התכונות")}><span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span></button>}
          </div>
        </div>
        <div className={styles.productStage} onFocusCapture={event => { if (event.target.matches(":focus-visible")) setFocused(true); }} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
          {feature === "interview" ? <div className={styles.interview}>
            <p className={styles.interviewIntro}><Copy text="ההיכרות עם העסק שלכם" /></p>
            <p><Copy text="איך קוראים לעסק?" /></p><div className={styles.answer}><Copy text={business.name} /></div>
            <p><Copy text={path === "services" ? "איזה שירות אתם נותנים?" : path === "saas" ? "אילו מוצרים יש לחברה שלכם?" : path === "nonprofit" ? "מה המטרה של העמותה?" : "מה אתם עושים?"} /></p><div className={styles.answer}><Copy text={business.kind} /></div>
            <p><Copy text={path === "saas" ? "מי צריך את המוצר שלכם?" : path === "nonprofit" ? "מי יכול לתמוך במטרה שלכם?" : "מי הלקוחות שלכם?"} /></p><div className={styles.answer}><Copy text={business.audience} /></div>
          </div> : <ProductFeatureShowcase key={`${path}-${feature}`} path={path} initialScreen={feature} presentation="feature" />}
        </div>
      </div>
    </div>
  </section>;
}
