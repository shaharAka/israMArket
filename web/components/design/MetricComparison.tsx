import styles from "./metric-comparison.module.css";

/** A single supplied metric, with missing readings kept distinct from measured zeroes. */
export function MetricComparison({ title, unit, source, period, points }: {
  title: string; unit: string; source: string; period?: string;
  points: { key: string; label: string; value?: number }[];
}) {
  const valid = points.filter(point => point.value !== undefined && Number.isFinite(point.value) && point.value >= 0);
  if (!valid.length) return null;
  const maximum = Math.max(...valid.map(point => point.value as number), 1);
  return <figure className={styles.figure}>
    <figcaption><strong>{title}</strong><span>{unit}</span></figcaption>
    <ul>{points.map(point => {
      const measured = point.value !== undefined && Number.isFinite(point.value) && point.value >= 0;
      return <li key={point.key}>
        <span className={styles.label}>{point.label}</span>
        <span className={styles.track} aria-hidden data-measured={measured}><span style={{ width: measured ? `${(point.value as number) / maximum * 100}%` : 0 }} /></span>
        <span className={styles.value}>{measured ? point.value?.toLocaleString("he-IL") : "לא נמדד"}</span>
      </li>;
    })}</ul>
    {/* The period stays in one piece: a date range broken across lines reads as two dates. */}
    <p className={styles.caption}>{source}{period ? <> · <span className={styles.period}>{period}</span></> : null}</p>
  </figure>;
}
