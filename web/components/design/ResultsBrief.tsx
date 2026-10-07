"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import { useId, type ReactNode } from "react";
import { BrandMark, IconArrowLeft } from "@/lib/icons";
import { FindingSummary } from "./FindingSummary";
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
  const t = useCopy();
  const id = useId();
  return <article className={styles.brief} aria-label={data.heading} data-state={data.state}>
    <header className={styles.businessHeader}>
      <div className={styles.businessIdentity}><BrandMark className={styles.store} /><div><strong>{data.business}</strong><span>{data.goal}</span></div></div>
      <p>{data.period}</p>
    </header>
    <FindingSummary heading={data.heading} explanation={data.explanation} uncertainty={data.uncertainty} evidence={
      <div className={styles.evidenceBody}>
        <ol>{data.evidence.map(item => <li key={item.source}>
          <strong>{item.source}</strong><div><h3>{item.observation}</h3><p>{item.detail}</p><small>{item.period}</small></div>
        </li>)}</ol>
      </div>
    } />
    <section className={styles.nextAction} aria-label={t("מה עושים עכשיו")}>
      <div className={styles.actionIntro}><div><p className={styles.eyebrow}><Copy text="מה נעשה עכשיו" /></p><h3>{data.nextAction.title}</h3></div><span className={styles.effort}>{data.nextAction.effort}</span></div>
      <p className={styles.actionExplanation}>{data.nextAction.explanation}</p>
      <div className={styles.mainActions}>
        <UIAction variant={expanded ? "secondary" : "primary"} onClick={onAction} aria-expanded={data.state === "disconnected" ? undefined : expanded} aria-controls={data.state === "disconnected" ? undefined : `${id}-action`}>{data.actionLabel}<IconArrowLeft className={styles.actionArrow} /></UIAction>
        {onContinue && <UIAction variant="text" onClick={onContinue} aria-expanded={expanded} aria-controls={`${id}-action`}><Copy text="להמשיך עם מה שכבר הכנו" /></UIAction>}
      </div>
      <p className={styles.successCheck}><strong><Copy text="איך נבדוק שזה עוזר?" /></strong> {data.nextAction.successCheck}</p>
    </section>
    {expanded && actionContent && <div id={`${id}-action`} className={styles.actionContent}>{actionContent}</div>}
    <footer className={styles.source}><span className={styles.sourceDot} aria-hidden="true" />{data.source}</footer>
  </article>;
}
