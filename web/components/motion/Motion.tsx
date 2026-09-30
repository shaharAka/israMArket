"use client";

import { useId, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import type { MotionAssetId, MotionMood } from "./catalog";
import styles from "./motion.module.css";

/** Scope a collection without changing the rest of the site's motion. OS preferences always win. */
export function MotionScope({ children, mood = "quiet", reduced = false, className = "", style }: { children: ReactNode; mood?: MotionMood; reduced?: boolean; className?: string; style?: CSSProperties }) {
  return <div className={`${styles.scope} ${className}`} style={style} data-motion-mood={mood} data-motion-reduced={reduced}>{children}</div>;
}

export function MotionButton({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={`${styles.button} ${className}`}>{children}</button>;
}

export function MotionCheck({ className = "" }: { className?: string }) {
  return <svg className={`${styles.check} ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path pathLength="1" d="m5 12 4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function MotionChoice({ selected, children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return <MotionButton {...props} aria-pressed={selected} className={`${styles.choice} ${className}`}><span className={styles.choiceMark}>{selected && <MotionCheck />}</span>{children}</MotionButton>;
}

/** Mount after a confirmed result; change replayKey to replay without changing the outcome. */
export function MotionIllustration({ kind, active = false, replayKey = 0, className = "" }: { kind: MotionAssetId; active?: boolean; replayKey?: number; className?: string }) {
  const horizonId = useId();
  return (
    <svg key={`${kind}-${replayKey}-${active}`} className={`${styles.illustration} ${className}`} data-kind={kind} data-active={active} viewBox="0 0 160 160" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle className={styles.halo} cx="80" cy="80" r="55" stroke="none" />
      {kind === "press" && <><g className={styles.pressShape}><rect x="43" y="57" width="74" height="47" rx="14" fill="var(--motion-paper)" /><path d="M66 81h28m-5-5 6 5-6 5" /></g><g className={styles.sparks}><path d="M39 45l-5-6m87 6 5-6M80 35v-8" /></g></>}
      {kind === "choose" && <><rect x="41" y="46" width="78" height="69" rx="12" fill="var(--motion-paper)" /><path d="M62 67h38M62 95h22" opacity=".3" /><path className={styles.draw} pathLength="1" d="m61 81 7 7 18-18" /></>}
      {kind === "save" && <><rect x="44" y="43" width="72" height="80" rx="10" fill="var(--motion-paper)" /><path d="M57 87h45M57 99h28" opacity=".3" /><path className={styles.bookmark} d="M85 43v31l9-7 9 7V43" fill="var(--motion-accent)" /></>}
      {kind === "copy" && <><rect x="42" y="42" width="59" height="69" rx="9" fill="var(--motion-paper)" opacity=".5" /><g className={styles.copySheet}><rect x="58" y="58" width="59" height="69" rx="9" fill="var(--motion-paper)" /><path d="M73 79h28M73 91h28M73 103h16" opacity=".45" /></g></>}
      {kind === "upload" && <><path d="M39 113h82l-8 12H47z" fill="var(--motion-paper)" /><g className={styles.photo}><rect x="47" y="44" width="68" height="65" rx="10" fill="var(--motion-paper)" /><circle cx="94" cy="61" r="5" fill="var(--motion-accent)" /><path d="m48 94 20-22 20 22 11-11 15 17" /></g></>}
      {kind === "prepare" && <><path d="M43 112h74" opacity=".3" />{[0, 1, 2].map((i) => <circle className={styles.workingDot} key={i} cx={56 + i * 24} cy="80" r="7" fill="currentColor" stroke="none" style={{ "--dot-delay": `${i * 120}ms` } as CSSProperties} />)}</>}
      {kind === "reveal" && <><rect x="43" y="43" width="74" height="81" rx="10" fill="var(--motion-paper)" /><path d="M58 62h44" /><g className={styles.revealLines}><path d="M58 80h44M58 93h44M58 106h25" opacity=".4" /></g></>}
      {kind === "publish" && <><path className={styles.flightTrail} pathLength="1" d="M121 111c-28 18-51-1-36-13 10-8 26 7 15 14-13 8-28-13-40-25" strokeDasharray="3 6" opacity=".45" /><g className={styles.plane}><path d="m114 45-69 29 29 9 9 29z" fill="var(--motion-paper)" /><path d="m45 74 69-29-40 38 9 29 5-23" /></g></>}
      {kind === "milestone" && <>
        <defs><clipPath id={horizonId}><rect width="160" height="64" /></clipPath></defs>
        <g clipPath={`url(#${horizonId})`}><g className={styles.sunrise} data-sun><circle cx="80" cy="64" r="18" fill="var(--motion-accent)" /></g></g>
        <g className={styles.sunRays} data-rays><path pathLength="1" d="M80 37v-8" /><path pathLength="1" d="m53 46-6-6" /><path pathLength="1" d="m107 46 6-6" /></g>
        <path d="m40 83 11-19h58l11 19c0 10-20 10-20 0 0 10-20 10-20 0 0 10-20 10-20 0 0 10-20 10-20 0Z" fill="var(--motion-paper)" /><path d="M49 92v29m62-29v29m-71 0h80M64 101h32" />
      </>}
    </svg>
  );
}

export function MotionResult({ children, replayKey = 0 }: { children: ReactNode; replayKey?: number }) {
  return <span key={replayKey} className={styles.result} role="status"><MotionCheck />{children}</span>;
}

/** Measured progress only. Use a loading state instead when the backend has no percentage. */
export function MotionProgress({ value, label }: { value: number; label: string }) {
  const progress = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return <div className={styles.progress} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ transform: `scaleX(${progress / 100})` }} /></div>;
}

export function MotionDisclosure({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  // Native details keeps keyboard and expanded-state semantics even before hydration.
  return <details className={styles.disclosure}><summary aria-controls={id}>{label}<span className={styles.chevron} aria-hidden="true">⌄</span></summary><div id={id} className={styles.disclosureBody}>{children}</div></details>;
}
