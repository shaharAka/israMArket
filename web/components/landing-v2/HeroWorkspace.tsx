"use client";

import { useState } from "react";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { PlanBrief } from "@/components/design/PlanBrief";
import { FindingSummary } from "@/components/design/FindingSummary";
import { UIAction, UIDialog } from "@/components/design/Controls";
import { IconArrowLeft } from "@/lib/icons";
import { BUSINESS_EXAMPLES, type ExamplePath } from "./businessExamples";
import { POST_EXAMPLES } from "./postExamples";
import { PostArtwork } from "./PostArtwork";
import "./CampaignPostExamples.css";
import styles from "./hero-workspace.module.css";

/** A composed workflow demonstration using product components, never a live customer account. */
export function HeroWorkspace({ path }: { path: ExamplePath }) {
  const t = useCopy();
  const [reviewing, setReviewing] = useState(false);
  const example = BUSINESS_EXAMPLES[path];
  const source = POST_EXAMPLES.find(item => item.key === ({ products: "bakery", services: "interior", saas: "software", nonprofit: "nonprofit" }[path]))!;
  const post = { ...source, business: t(source.business), headline: t(source.headline), tip: t(source.tip), action: t(source.action), alt: source.alt ? t(source.alt) : undefined };
  return <div className={styles.demo} id="homepage-business-example">
    <div className={styles.workspace}>
      <header className={styles.header}><strong><Copy text={example.name} /></strong></header>
      <div className={styles.plan}>
        <PlanBrief compact businessName={t(example.name)} direction={t(example.plan)}
          context={<><Copy text="מהמחקר:" />{" "}<Copy text={example.learned} /></>}
          ownerAction={t(example.recommendation)}
          action={<button className={styles.reviewLink} onClick={() => setReviewing(true)}><Copy text="לבדוק את הפוסט שהכנו" /><IconArrowLeft className="h-4 w-4" /></button>} />
      </div>
      <div className={styles.execution}>
        <section className={styles.draft} aria-label={t("הפוסט הבא בתוכנית")}>
          <div className={styles.thumbnail}><PostArtwork item={post} /></div>
          <div><p className={styles.label}><span aria-hidden className={styles.readyDot} /><Copy text="הפוסט הבא · מוכן לבדיקה" /></p><h3><Copy text={example.draft} /></h3><p className={styles.reviewNote}><Copy text="אתם בודקים ומפרסמים." /></p></div>
        </section>
        <FindingSummary compact heading={t(example.finding)} uncertainty={t(example.missing)} followThrough={<p className={styles.next}><strong><Copy text="מעדכנים את התוכנית" /></strong><span><Copy text={example.next} /></span></p>} evidence={
          <div className={styles.evidence}><p><Copy text={example.measure} /></p><dl>{example.comparison.map((label, index) => <div key={label}><dt><Copy text={label} /></dt><dd><bdi>{index === 0 ? 12 : 4}</bdi></dd></div>)}</dl></div>
        } />
      </div>
    </div>
    <p className={styles.caption}><Copy text="נתונים להמחשה" /></p>
    <UIDialog open={reviewing} onClose={() => setReviewing(false)} title={t("הפוסט שהכנו לפי התוכנית")} description={t("בודקים את התמונה, הנוסח והפרטים לפני הפרסום.")}>
      <div className={styles.review}><PostArtwork item={post} /><div><p className={styles.label}><Copy text="בתוכנית" /></p><h3><Copy text={example.recommendation} /></h3><p><Copy text={example.caption} /></p><UIAction onClick={() => setReviewing(false)}><Copy text="לחזור לתוכנית" /></UIAction></div></div>
    </UIDialog>
  </div>;
}
