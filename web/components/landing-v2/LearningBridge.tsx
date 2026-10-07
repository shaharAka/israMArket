"use client";
import Image from "next/image";
import { CardStage } from "@/components/CardCanvas";
import { PostWorkspace, PostPreview, PostActionPanel } from "@/components/posts/PostWorkspace";
import { productFixtures } from "./productFixtures";
import { Copy, useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { BUSINESS_EXAMPLES, type ExamplePath } from "./businessExamples";
import styles from "./value-story.module.css";

const SOURCES = [
  { logo: "instagram", name: "Instagram", label: "תגובות ושמירות", line: "M0 44 18 30 36 36 54 18 72 25 90 8 108 17 126 4" },
  { logo: "meta", name: "Meta Ads", label: "קמפיינים ועלויות", line: "M0 38 18 42 36 20 54 27 72 10 90 18 108 8 126 15" },
  { logo: "googleanalytics", name: "Google Analytics", label: "פעולות באתר", line: "M0 44 18 40 36 42 54 26 72 33 90 15 108 23 126 8" },
];
/** Explanatory source types, one supported finding, one action and its measurement limit. */
export function LearningBridge({ path, actionOnly = false }: { path: ExamplePath; actionOnly?: boolean }) {
  const example = BUSINESS_EXAMPLES[path];
  const t = useCopy();
  const { locale } = useLanguage();
  const { posts, brand } = productFixtures(path, t, locale);
  const finding = { products: "יותר לחיצות על הפוסט עם המחיר.", services: "יותר לחיצות על הטיפ המקצועי.", saas: "יותר לחיצות על הדגמת התוכנית.", nonprofit: "יותר לחיצות אחרי הסבר על הפעילות." }[path];
  const next = { products: "הפוסט הבא: מחיר וקישור להזמנה.", services: "הפוסט הבא: טיפ והזמנה לשיחה.", saas: "הפוסט הבא: התוכנית שרואים לפני הרשמה.", nonprofit: "הפוסט הבא: פעילות וקישור לתרומה." }[path];
  if (actionOnly) return <div className={styles.nextPost}><PostWorkspace
    header={<><p className={styles.interviewIntro}><Copy text="השינוי שננסה בפוסט הבא" /></p><h4><Copy text={next} /></h4></>}
    preview={<PostPreview media={<CardStage post={posts[0]} brand={brand} businessName={t(example.name)} rounded={false} />} caption={null} style={{ width: "100%" }} />}
    panel={<PostActionPanel why={t(finding)} needs={<div className={styles.checkNext}><p><Copy text="איך נבדוק את השינוי" /></p><p><Copy text={example.measure} /></p></div>} />}
  /><p className={styles.limit}><Copy text={example.missing} /></p></div>;
  return <div className={styles.learningVisual}>
    {!actionOnly && <><div className={styles.sources}>{SOURCES.map(source => <div className={styles.source} key={source.name}>
      <div><Image src={`/connectors/${source.logo}.svg`} width={22} height={22} alt="" /><span dir="ltr">{source.name}</span></div>
      <svg viewBox="0 0 126 52" fill="none" aria-hidden="true"><path d={source.line} stroke="currentColor" strokeWidth="2" /></svg>
      <p><Copy text={source.label} /></p>
    </div>)}</div><div className={styles.synthesis}><span aria-hidden="true">↓</span></div></>}
    <div className={styles.finding}><p className={styles.interviewIntro}><Copy text={actionOnly ? "השינוי שננסה בפוסט הבא" : "מה למדנו"} /></p><h4><Copy text={actionOnly ? next : finding} /></h4>
      <p className={styles.next}><Copy text={actionOnly ? example.measure : next} /></p><p className={styles.limit}><Copy text={example.missing} /></p>
    </div>
  </div>;
}
