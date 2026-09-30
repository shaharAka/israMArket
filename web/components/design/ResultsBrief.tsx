"use client";

import { useId, type ReactNode } from "react";
import { BrandMark, IconArrowLeft, IconChevron } from "@/lib/icons";
import { UIAction } from "./Controls";
import styles from "./results-brief.module.css";

export type ResultsEvidence = { source: string; observation: string; detail: string; period: string };
export type ResultsBriefData = {
  business: string;
  period: string;
  source: string;
  goal: string;
  state: "finding" | "learning" | "disconnected";
  heading: string;
  explanation: string;
  uncertainty: string;
  nextAction: { title: string; explanation: string; effort: string; successCheck: string };
  actionLabel: string;
  evidence: ResultsEvidence[];
};

/** The caller supplies observations and interpretation separately. No fetching or inference. */
export function ResultsBrief({ data, onAction, onContinue, expanded = false, actionContent }: {
  data: ResultsBriefData;
  onAction: () => void;
  onContinue?: () => void;
  expanded?: boolean;
  actionContent?: ReactNode;
}) {
  const id = useId();
  return <article className={styles.brief} aria-labelledby={`${id}-heading`} data-state={data.state}>
    <header className={styles.businessHeader}>
      <div className={styles.businessIdentity}><BrandMark className={styles.store} /><div><strong>{data.business}</strong><span>{data.goal}</span></div></div>
      <p>{data.period}</p>
    </header>
    <section className={styles.finding}>
      <p className={styles.eyebrow}>מה זה אומר לעסק שלכם</p>
      <h2 id={`${id}-heading`}>{data.heading}</h2>
      <p className={styles.explanation}>{data.explanation}</p>
      <details className={styles.evidence}>
        <summary>למה זו ההמלצה שלנו?<IconChevron className={styles.chevron} /></summary>
        <div className={styles.evidenceBody}>
          <p className={styles.eyebrow}>המידע שחיברנו בדוגמה הזו</p>
          <ol>{data.evidence.map(item => <li key={item.source}>
            <strong>{item.source}</strong><div><h3>{item.observation}</h3><p>{item.detail}</p><small>{item.period}</small></div>
          </li>)}</ol>
          <p className={styles.uncertainty}>{data.uncertainty}</p>
        </div>
      </details>
    </section>
    <section className={styles.nextAction} aria-label="מה עושים עכשיו">
      <div className={styles.actionIntro}><div><p className={styles.eyebrow}>מה נעשה עכשיו</p><h3>{data.nextAction.title}</h3></div><span className={styles.effort}>{data.nextAction.effort}</span></div>
      <p className={styles.actionExplanation}>{data.nextAction.explanation}</p>
      <div className={styles.mainActions}>
        <UIAction variant={expanded ? "secondary" : "primary"} onClick={onAction} aria-expanded={data.state === "disconnected" ? undefined : expanded} aria-controls={data.state === "disconnected" ? undefined : `${id}-action`}>{data.actionLabel}<IconArrowLeft className={styles.actionArrow} /></UIAction>
        {onContinue && <UIAction variant="text" onClick={onContinue} aria-expanded={expanded} aria-controls={`${id}-action`}>להמשיך עם מה שכבר הכנו</UIAction>}
      </div>
      <p className={styles.successCheck}><strong>איך נבדוק שזה עוזר?</strong> {data.nextAction.successCheck}</p>
    </section>
    {expanded && actionContent && <div id={`${id}-action`} className={styles.actionContent}>{actionContent}</div>}
    <footer className={styles.source}><span className={styles.sourceDot} aria-hidden="true" />{data.source}</footer>
  </article>;
}
