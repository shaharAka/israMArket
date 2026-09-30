"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { BrandMark } from "@/lib/icons";
import { UIAction } from "./Controls";
import styles from "./results-brief.module.css";

export type ResultsDay = { label: string; current: number; previous: number };
export type ResultsBriefData = {
  business: string;
  period: string;
  source: string;
  state: "finding" | "learning" | "disconnected";
  heading: string;
  explanation: string;
  nextAction: { title: string; explanation: string };
  actionLabel: string;
  evidence: string[];
  comparison?: {
    metric: string;
    currentLabel: string;
    previousLabel: string;
    days: ResultsDay[];
  };
};

/** Supplied, verified measures only. This component does not fetch or infer findings. */
export function ResultsBrief({ data, onAction, expanded = false, actionContent }: {
  data: ResultsBriefData;
  onAction: () => void;
  expanded?: boolean;
  actionContent?: ReactNode;
}) {
  const id = useId();
  return <article className={styles.brief} aria-labelledby={`${id}-heading`} data-state={data.state}>
    <header className={styles.businessHeader}>
      <div className={styles.businessIdentity}><BrandMark className={styles.store} /><div><strong>{data.business}</strong><span>התוצאות של השבוע</span></div></div>
      <p>{data.period}</p>
    </header>
    <div className={styles.reading}>
      <section className={styles.finding}>
        <p className={styles.eyebrow}>{data.state === "finding" ? "מה למדנו" : data.state === "learning" ? "נותנים למדידה זמן" : "המדידה צריכה חיבור מחדש"}</p>
        <h2 id={`${id}-heading`}>{data.heading}</h2>
        <p className={styles.explanation}>{data.explanation}</p>
        <details className={styles.evidence}><summary>על מה זה מבוסס?</summary><ul>{data.evidence.map(item => <li key={item}>{item}</li>)}</ul></details>
      </section>
      {data.comparison ? <WeeklyOrders key={data.period} comparison={data.comparison} /> : <div className={styles.quietState}>
        <span className={styles.sun} aria-hidden="true" />
        <strong>{data.state === "learning" ? "התוכנית ממשיכה לעבוד" : "התוכנית והפוסטים כאן"}</strong>
        <p>{data.state === "learning" ? "נציג השוואה כשיצטבר שבוע מלא ושבוע קודם להשוות אליו." : "עד שהחיבור יחזור, אין לנו קריאה עדכנית של התוצאות."}</p>
      </div>}
    </div>
    <section className={styles.nextAction} aria-label="הצעד הבא בתוכנית">
      <div><p className={styles.eyebrow}>הצעד הבא</p><h3>{data.nextAction.title}</h3><p>{data.nextAction.explanation}</p></div>
      <UIAction onClick={onAction} aria-expanded={actionContent ? expanded : undefined} aria-controls={actionContent ? `${id}-action` : undefined}>{data.actionLabel}<span aria-hidden="true"> ←</span></UIAction>
    </section>
    {expanded && actionContent && <div id={`${id}-action`} className={styles.actionContent}>{actionContent}</div>}
    <footer className={styles.source}><span className={styles.sourceDot} aria-hidden="true" />{data.source}</footer>
  </article>;
}

function WeeklyOrders({ comparison }: { comparison: NonNullable<ResultsBriefData["comparison"]> }) {
  const id = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const current = comparison.days.reduce((total, day) => total + day.current, 0);
  const previous = comparison.days.reduce((total, day) => total + day.previous, 0);
  const maximum = Math.max(1, ...comparison.days.flatMap(day => [day.current, day.previous]));
  const selectedDay = selected === null ? null : comparison.days[selected];
  return <figure className={styles.figure} aria-labelledby={`${id}-title`}>
    <figcaption id={`${id}-title`}>{comparison.metric}</figcaption>
    <div className={styles.metric}><strong>{current}</strong><span>לעומת {previous}<small>{current > previous ? `עוד ${current - previous} השבוע` : current < previous ? `${previous - current} פחות השבוע` : "ללא שינוי בסך השבועי"}</small></span></div>
    <div className={styles.chart}>
      <div className={styles.axis} aria-hidden="true"><span>{maximum}</span><span>0</span></div>
      <div className={styles.columns} aria-label="השוואת הזמנות לפי יום">
        {comparison.days.map((day, index) => <button key={day.label} type="button" className={styles.day} aria-pressed={selected === index} aria-label={`${day.label}: ${day.current} הזמנות השבוע, ${day.previous} בשבוע הקודם`} onClick={() => setSelected(index)} onFocus={() => setSelected(index)}>
          <span className={styles.bars} aria-hidden="true"><i className={styles.currentBar} style={{ "--bar-height": `${day.current / maximum * 100}%` } as CSSProperties} /><i className={styles.previousBar} style={{ "--bar-height": `${day.previous / maximum * 100}%` } as CSSProperties} /></span><span className={styles.dayLabel}>{day.label}</span>
        </button>)}
      </div>
    </div>
    <div className={styles.legend}><span><i />{comparison.currentLabel}</span><span><i />{comparison.previousLabel}</span></div>
    <p className={styles.chartReading} aria-live="polite">{selectedDay ? `${selectedDay.label}: ${selectedDay.current} השבוע · ${selectedDay.previous} בשבוע הקודם` : "בחרו יום כדי לראות את המספרים"}</p>
  </figure>;
}
