"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { ProductFeatureShowcase } from "./ProductFeatureShowcase";
import { CampaignPostExamples, type CampaignExample } from "./CampaignPostExamples";
import { LearningBridge } from "./LearningBridge";
import { BUSINESS_EXAMPLES, type ExamplePath } from "./businessExamples";
import { PERSONA_PAGES } from "./personaPages";
import { useFeatureCycle } from "./useFeatureCycle";
import styles from "./value-story.module.css";

/** Normal page scrolling advances the explanation beside one stable product canvas. */
export function FeatureWalkthrough({ path, examples }: { path: ExamplePath; examples: CampaignExample[] }) {
  const [group, setGroup] = useState(0);
  const explanations = useRef<HTMLDivElement>(null);
  const current = useRef(0);
  const reels = examples.filter(item => item.video);
  const counts = [3, reels.length ? 2 : 1, 2];
  const { ref: cycleRef, index: activeIndex, select, paused, reduced, toggle, setFocused } = useFeatureCycle(counts[group], group === 0 ? 7000 : 12000);
  const t = useCopy();
  const business = BUSINESS_EXAMPLES[path];
  useEffect(() => {
    let frame = 0;
    const update = () => {
      const line = window.innerHeight * .48;
      let next = 0;
      Array.from(explanations.current?.children ?? []).forEach((row, index) => { if (row && row.getBoundingClientRect().top <= line) next = index; });
      if (current.current !== next) { current.current = next; setGroup(next); select(0); }
      frame = 0;
    };
    const changed = () => { if (!frame) frame = requestAnimationFrame(update); };
    changed();
    window.addEventListener("scroll", changed, { passive: true });
    window.addEventListener("resize", changed);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", changed); window.removeEventListener("resize", changed); };
  }, [select]);
  const index = activeIndex % counts[group];
  const show = (next: number, feature: number) => { current.current = next; setGroup(next); select(feature); };
  const labels = [["היכרות קצרה", "המחקר על העסק", "תוכנית השיווק"], reels.length ? ["תמונה וטקסט", "תוכן בתנועה"] : ["תמונה וטקסט"], ["מחברים את הנתונים", "הצעד הבא"]];
  const titles = [index === 2 && group === 0 ? PERSONA_PAGES[path].planTitle : index === 1 && group === 0 ? "השיווק מתחיל במה שמיוחד אצלכם." : "אתם מכירים את העסק. אנחנו מתחילים בהקשבה.", "אנחנו יוצרים. האופי שלכם נשאר.", group === 2 && index === 1 ? "לא רק לדעת מה קרה. לדעת מה לשנות." : "כל הנתונים האלה. צעד אחד ברור."];
  const bodies = [group === 0 && index === 2 ? "המחקר הופך לתוכנית מתמשכת: מה לקדם, למי, מה לפרסם ואיך לבדוק אם הכיוון עובד. אתם רואים מה עושים עכשיו ולמה." : group === 0 && index === 1 ? "חוקרים את האתר, ההצעה והקהל. מחברים את מה שסיפרתם עם מה שמצאנו, ומראים לכם מה למדנו ועל מה זה מבוסס." : "כמה שאלות על מה שאתם עושים, הלקוחות והכיוון שלכם. ממשיכים עם מה שכבר סיפרתם, גם אם עדיין אין אתר או חשבונות מחוברים.", group === 1 && index === 1 ? "גם תוכן בתנועה מתחיל ברעיון מתוך התוכנית. אתם בודקים את הפרטים לפני הפרסום." : "כל פוסט מתחיל במטרה בתוכנית. אנחנו מכינים את התמונה והטקסט, בסגנון שמתאים לעסק ולקהל שלכם. אתם בודקים, משנים ומפרסמים.", group === 2 && index === 1 ? "הממצא חוזר לתוכנית עם הצעה מעשית: איזה מסר לנסות, מה להראות בפוסט הבא ואיך נבדוק את השינוי. אתם רואים את הסיבה ומחליטים." : "מחברים את מה שנמדד באינסטגרם, במודעות ובאתר. מפרידים בין צפיות, לחיצות ותוצאות, ומסבירים מה אפשר ללמוד — ומה עדיין חסר."];
  const display = (segment: number, feature: number) => {
    if (segment === 0) return feature === 0 ? <div className={styles.interview}>
      <p className={styles.interviewIntro}><Copy text="ההיכרות עם העסק שלכם" /></p>
      <p><Copy text="איך קוראים לעסק?" /></p><div className={styles.answer}><Copy text={business.name} /></div>
      <p><Copy text={path === "services" ? "איזה שירות אתם נותנים?" : path === "saas" ? "אילו מוצרים יש לחברה שלכם?" : path === "nonprofit" ? "מה המטרה של העמותה?" : "מה אתם עושים?"} /></p><div className={styles.answer}><Copy text={business.kind} /></div>
      <p><Copy text={path === "saas" ? "מי צריך את המוצר שלכם?" : path === "nonprofit" ? "מי יכול לתמוך במטרה שלכם?" : "מי הלקוחות שלכם?"} /></p><div className={styles.answer}><Copy text={business.audience} /></div>
    </div> : <ProductFeatureShowcase key={`${path}-${feature}`} path={path} initialScreen={feature === 1 ? "research" : "plan"} presentation="feature" />;
    if (segment === 1) return <CampaignPostExamples galleryOnly examples={feature === 1 ? reels : examples.filter(item => !item.video)} selectionLabel={t("לבחור פוסט לדוגמה")} captionLabel={t("לקרוא את הטקסט שמלווה את הפוסט")} screenshot={{ src: "/showcase/platform-week-desktop.png", alt: t("התוכנית והצעד הבא במערכת") }} />;
    return <LearningBridge path={path} actionOnly={feature === 1} />;
  };
  return <section id="story" className={styles.walkthrough} aria-labelledby="features-title">
    <div className="lv2-wrap"><h2 id="features-title" className={styles.sectionTitle}><Copy text="מהיכרות עם העסק, לשיווק שמתקדם איתכם." /></h2>
      <div className={styles.walkGrid} ref={cycleRef} data-group={group}>
        <div className={styles.explanations} ref={explanations}>{["research", "posts", "learning"].map((tone, segment) => <section key={tone} id={segment === 1 ? "posts" : segment === 2 ? "learn" : undefined} className={styles.explanation} data-tone={tone} aria-labelledby={`feature-title-${tone}`}>
          <div className={styles.copy}><p className="lv2-eyebrow"><Copy text={["מכירים, חוקרים ומתכננים", "מהתוכנית לפוסטים שלכם", "לומדים ומשפרים"][segment]} /></p>
            <h3 id={`feature-title-${tone}`}><Copy text={titles[segment]} /></h3><p><Copy text={bodies[segment]} /></p>
            <div className={styles.featureChoices} role="group" aria-label={t("לבחור יכולת לראות")}>
              {labels[segment].map((label, feature) => <button key={label} aria-pressed={(group === segment ? index : 0) === feature} onClick={() => show(segment, feature)}><Copy text={label} /></button>)}
              {counts[segment] > 1 && !reduced && <button onClick={toggle} aria-label={t(paused ? "להמשיך את המעבר בין התכונות" : "לעצור את המעבר בין התכונות")} title={t(paused ? "להמשיך את המעבר בין התכונות" : "לעצור את המעבר בין התכונות")}><span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span></button>}
            </div>
          </div>
          <div className={`${styles.productStage} ${styles.mobileStage}`} data-tone={tone}>{display(segment, group === segment ? index : 0)}</div>
        </section>)}</div>
        <div className={`${styles.productStage} ${styles.stickyStage}`} data-tone={["research", "posts", "learning"][group]} data-feature-group={group} onFocusCapture={event => { if (event.target.matches(":focus-visible")) setFocused(true); }} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}><div className={styles.displayContent} key={`${group}-${index}`}>{display(group, index)}</div></div>
      </div>
    </div>
  </section>;
}
