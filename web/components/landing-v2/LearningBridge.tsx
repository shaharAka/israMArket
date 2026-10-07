"use client";
import Image from "next/image";
import { Copy } from "@/components/language/LanguageProvider";
import { BusinessProductProof } from "./BusinessProductProof";
import type { ExamplePath } from "./businessExamples";
import styles from "./value-story.module.css";

const SOURCES = [
  { logo: "instagram", name: "Instagram", label: "תגובות ושמירות", line: "M0 44 18 30 36 36 54 18 72 25 90 8 108 17 126 4" },
  { logo: "meta", name: "Meta Ads", label: "קמפיינים ועלויות", line: "M0 38 18 42 36 20 54 27 72 10 90 18 108 8 126 15" },
  { logo: "googleanalytics", name: "Google Analytics", label: "פעולות באתר", line: "M0 44 18 40 36 42 54 26 72 33 90 15 108 23 126 8" },
];
/** Source types are explanatory. The finding retains its actual fixture evidence and limits. */
export function LearningBridge({ path }: { path: ExamplePath }) {
  return <div className={styles.learningVisual}>
    <div className={styles.sources}>{SOURCES.map(source => <div className={styles.source} key={source.name}>
      <div><Image src={`/connectors/${source.logo}.svg`} width={22} height={22} alt="" /><span dir="ltr">{source.name}</span></div>
      <svg viewBox="0 0 126 52" fill="none" aria-hidden="true"><path d={source.line} stroke="currentColor" strokeWidth="2" /></svg>
      <p><Copy text={source.label} /></p>
    </div>)}</div>
    <div className={styles.synthesis}><span aria-hidden="true">↓</span><p><Copy text="מחברים את מה שזמין. מסבירים מה כדאי לנסות." /></p></div>
    <BusinessProductProof path={path} screen="results" compact />
  </div>;
}
