"use client";
import { useState } from "react";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { ProductFeatureShowcase } from "./ProductFeatureShowcase";
import { PERSONA_PAGES } from "./personaPages";
import type { ExamplePath } from "./businessExamples";
import styles from "./value-story.module.css";

export function FeatureStory({ path }: { path: ExamplePath }) {
  const [feature, setFeature] = useState<"research" | "plan">("research");
  const t = useCopy();
  return <section id="story" className={styles.section} aria-labelledby="features-title">
    <div className="lv2-wrap"><h2 id="features-title" className={styles.sectionTitle}><Copy text="מהיכרות עם העסק, לשיווק שמתקדם איתכם." /></h2>
      <div className={styles.featureGrid}>
        <div className={styles.copy}><p className="lv2-eyebrow"><Copy text={feature === "research" ? "מכירים את העסק" : "בונים תוכנית"} /></p>
          <h3><Copy text={feature === "research" ? "השיווק מתחיל במה שמיוחד אצלכם." : PERSONA_PAGES[path].planTitle} /></h3>
          <p><Copy text={feature === "research" ? "אנחנו חוקרים את העסק, ההצעה והקהל. מחברים את מה שסיפרתם עם מה שמצאנו, כדי שהשיווק יהיה שלכם מהצעד הראשון." : "המחקר הופך לתוכנית מתמשכת: מה לקדם, למי, מה לפרסם ואיך לבדוק אם הכיוון עובד. אתם רואים מה עושים עכשיו ולמה."} /></p>
          <div className={styles.featureChoices} role="group" aria-label={t("לבחור יכולת לראות")}>
            <button aria-pressed={feature === "research"} onClick={() => setFeature("research")}><Copy text="המחקר על העסק" /></button>
            <button aria-pressed={feature === "plan"} onClick={() => setFeature("plan")}><Copy text="תוכנית השיווק" /></button>
          </div>
        </div>
        <div className={styles.productStage}><ProductFeatureShowcase key={`${path}-${feature}`} path={path} initialScreen={feature} presentation="feature" /></div>
      </div>
    </div>
  </section>;
}
