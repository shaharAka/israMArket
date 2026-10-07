"use client";

import { useId, type ReactNode } from "react";
import { Copy } from "@/components/language/LanguageProvider";
import { IconChevron } from "@/lib/icons";
import styles from "./finding-summary.module.css";

/** Supplied findings only. The measurement limit stays visible, even with evidence folded. */
export function FindingSummary({ heading, explanation, uncertainty, evidence, followThrough, compact = false }: {
  heading: string; explanation?: string; uncertainty: string; evidence?: ReactNode; followThrough?: ReactNode; compact?: boolean;
}) {
  const id = useId();
  const Heading = compact ? "h3" : "h2";
  return <section className={styles.finding} data-compact={compact} aria-labelledby={`${id}-finding`}>
    <p className={styles.label}><Copy text="מה למדנו" /></p>
    <Heading id={`${id}-finding`}>{heading}</Heading>
    {explanation && <p className={styles.explanation}>{explanation}</p>}
    <p className={styles.uncertainty}>{uncertainty}</p>
    {followThrough}
    {evidence && <details className={styles.evidence}>
      <summary><Copy text="על מה ההמלצה נשענת?" /><IconChevron className={styles.chevron} /></summary>
      <div className={styles.evidenceBody}>{evidence}</div>
    </details>}
  </section>;
}
