"use client";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { LearningBridge } from "./LearningBridge";
import { ProductFeatureShowcase } from "./ProductFeatureShowcase";
import { useFeatureCycle } from "./useFeatureCycle";
import type { ExamplePath } from "./businessExamples";
import styles from "./value-story.module.css";
export function LearningFeature({ path }: { path: ExamplePath }) {
  const { ref: cycleRef, index: activeIndex, select, paused, reduced, toggle, setFocused } = useFeatureCycle(2, 12000);
  const t = useCopy();
  return <section id="learn" className={styles.section} data-tone="learning" aria-labelledby="lv2-learn-title"><div className={`lv2-wrap ${styles.featureGrid}`} ref={cycleRef}>
    <div className={styles.copy}><p className="lv2-eyebrow"><Copy text="לומדים ומשפרים" /></p>
      <h2 id="lv2-learn-title" className="lv2-h2"><Copy text={activeIndex === 0 ? "כל הנתונים האלה. צעד אחד ברור." : "לא רק לדעת מה קרה. לדעת מה לשנות."} /></h2>
      <p><Copy text={activeIndex === 0 ? "מחברים את מה שנמדד באינסטגרם, במודעות ובאתר. מפרידים בין צפיות, לחיצות ותוצאות, ומסבירים מה אפשר ללמוד — ומה עדיין חסר." : "הממצא חוזר לתוכנית עם הצעה מעשית: איזה מסר לנסות, מה להראות בפוסט הבא ואיך נבדוק את השינוי. אתם רואים את הסיבה ומחליטים."} /></p>
      <div className={styles.featureChoices} role="group" aria-label={t("לבחור מה לראות בתוצאות")}>
        {["מחברים את הנתונים", "הצעד הבא"].map((label,index)=><button key={label} aria-pressed={activeIndex===index} onClick={()=>select(index)}><Copy text={label}/></button>)}
        {!reduced && <button onClick={toggle} aria-label={t(paused ? "להמשיך את המעבר בין התכונות" : "לעצור את המעבר בין התכונות")}><span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span></button>}
      </div>
    </div>
    <div className={`${styles.productStage} ${styles.stageGrid}`} onFocusCapture={event=>{if(event.target.matches(":focus-visible"))setFocused(true);}} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))setFocused(false);}}>
      <div className={styles.featurePanel} data-active={activeIndex===0} aria-hidden={activeIndex!==0} inert={activeIndex!==0}><LearningBridge path={path}/></div>
      <div className={styles.featurePanel} data-active={activeIndex===1} aria-hidden={activeIndex!==1} inert={activeIndex!==1}><ProductFeatureShowcase path={path} initialScreen="results" presentation="feature"/></div>
    </div>
  </div></section>;
}
