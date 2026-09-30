import type { ReactNode } from "react";
import styles from "./business-overview.module.css";

export type OverviewConnection = {
  key: string;
  name: string;
  /** The caller supplies the real state; a detected tag is not an authorized connection. */
  ready: boolean;
  status: string;
  action?: ReactNode;
};

export type OverviewPost = {
  key: string;
  title: string;
  /** Approval, scheduling and publication are different states, supplied by the caller. */
  status: string;
  note?: string;
  action?: ReactNode;
};

export type OverviewFigure = {
  title: string;
  unit: string;
  /** A source and period, or an explicit label that these are planned amounts. */
  caption: string;
  points: { label: string; value: number; display: string }[];
};

/** A plan's compact business overview. Presentation only: no requests, inferred results or setup gating. */
export function BusinessOverview({ connections, posts, postsNote, measure, figure, className = "" }: {
  connections: OverviewConnection[];
  posts: OverviewPost[];
  postsNote?: string;
  measure: { name: string; note?: string };
  figure?: OverviewFigure;
  className?: string;
}) {
  return <section className={`${styles.overview} ${className}`} aria-label="העסק במבט אחד">
    <div className={styles.column}>
      <h4>החיבורים</h4>
      <ul className={styles.connections}>{connections.map(item => <li key={item.key}>
        <span className={styles.mark} data-ready={item.ready} aria-hidden>{item.ready ? <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3 8 3 3 7-7" /></svg> : null}</span>
        <span>{item.name}</span><span className={styles.status}>{item.status}</span>
        {item.action}
      </li>)}</ul>
    </div>
    <div className={styles.column}>
      <h4>התוכן בתוכנית</h4>
      <ul className={styles.posts}>{posts.map(post => <li key={post.key}>
        <span className={styles.postStatus}>{post.status}</span>
        <p className={styles.postTitle}>{post.title}</p>
        {post.note && <p className={styles.note}>{post.note}</p>}
        {post.action}
      </li>)}</ul>
      {postsNote && <p className={styles.note}>{postsNote}</p>}
    </div>
    <div className={styles.column}>
      <h4>מה נמדוד</h4>
      <p className={styles.metric}>{measure.name}</p>
      {measure.note && <p className={styles.note}>{measure.note}</p>}
      {figure && <OverviewPlot figure={figure} />}
    </div>
  </section>;
}

/** Bars use supplied values only. The visible values keep the figure readable without color or animation. */
function OverviewPlot({ figure }: { figure: OverviewFigure }) {
  const points = figure.points.filter(point => Number.isFinite(point.value) && point.value >= 0);
  if (!points.length) return null;
  const maximum = Math.max(...points.map(point => point.value), 1);
  return <figure className={styles.figure}>
    <figcaption>{figure.title} <span>· {figure.unit}</span></figcaption>
    <ul>{points.map((point, index) => <li key={`${point.label}-${index}`}>
      <span className={styles.axisLabel}>{point.label}</span>
      <span className={styles.track} aria-hidden><span style={{ width: `${point.value / maximum * 100}%` }} /></span>
      <bdi className={styles.value}>{point.display}</bdi>
    </li>)}</ul>
    <p className={styles.caption}>{figure.caption}</p>
  </figure>;
}
