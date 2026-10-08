import type { CSSProperties } from "react";
import { usePlaybackProgress } from "./usePlaybackProgress";
import styles from "./playback-progress.module.css";

/** A visible remaining-time counter and a filling bar, not an ambiguous status dot. */
export function PlaybackProgress({ cycle, duration }: { cycle: string; duration: number }) {
  const fraction = usePlaybackProgress(true, duration, cycle);
  const remaining = Math.max(0, Math.ceil(duration * (1 - fraction) / 1000));
  return <span className={styles.progress} data-playback-progress aria-hidden="true" style={{ "--elapsed": fraction } as CSSProperties}>
    <span className={styles.time} dir="ltr">0:{String(remaining).padStart(2, "0")}</span>
    <span className={styles.track}><span /></span>
  </span>;
}
