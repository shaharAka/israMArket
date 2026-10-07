"use client";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { CampaignPostExamples, type CampaignExample } from "./CampaignPostExamples";
import { useFeatureCycle } from "./useFeatureCycle";
import styles from "./value-story.module.css";
export function PostsFeature({ examples }: { examples: CampaignExample[] }) {
  const motion = examples.filter(item => item.motion?.length);
  const { ref: cycleRef, index: activeIndex, select, paused, reduced, toggle } = useFeatureCycle(motion.length ? 2 : 1, 12000);
  const t = useCopy();
  const shown = activeIndex === 1 && motion.length ? motion : examples;
  return <section id="posts" className={styles.section} data-tone="posts" aria-labelledby="lv2-post-title"><div className={`lv2-wrap ${styles.featureGrid}`} ref={cycleRef}>
    <div className={styles.copy}><p className="lv2-eyebrow"><Copy text="מהתוכנית לפוסטים שלכם" /></p><h2 id="lv2-post-title" className="lv2-h2"><Copy text="אנחנו יוצרים. האופי שלכם נשאר." /></h2>
      <p><Copy text={activeIndex === 1 ? "גם תוכן בתנועה מתחיל ברעיון מתוך התוכנית. אנחנו מכינים את התמונה, המילים והקצב — אתם בודקים את הפרטים לפני הפרסום." : "כל פוסט מתחיל במטרה בתוכנית. אנחנו מכינים את התמונה והטקסט, בסגנון שמתאים לעסק ולקהל שלכם. אתם בודקים, משנים ומפרסמים."} /></p>
      <div className={styles.featureChoices} role="group" aria-label={t("לבחור מה לראות בפוסטים")}>
        {(motion.length ? ["תמונה וטקסט", "תוכן בתנועה"] : ["תמונה וטקסט"]).map((label,index)=><button key={label} aria-pressed={activeIndex===index} onClick={()=>select(index)}><Copy text={label}/></button>)}
        {motion.length > 0 && !reduced && <button onClick={toggle} aria-label={t(paused ? "להמשיך את המעבר בין התכונות" : "לעצור את המעבר בין התכונות")}><span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span></button>}
      </div>
    </div>
    <div className={`${styles.productStage} ${styles.postsStage}`}><CampaignPostExamples galleryOnly examples={shown} selectionLabel={t("לבחור פוסט לדוגמה")} captionLabel={t("לקרוא את הטקסט שמלווה את הפוסט")} screenshot={{src:"/showcase/platform-week-desktop.png",alt:t("התוכנית והצעד הבא במערכת")}} /></div>
  </div></section>;
}
