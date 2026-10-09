import type { CSSProperties } from "react";
import { usePlaybackProgress } from "./usePlaybackProgress";
import styles from "./playback-progress.module.css";

/** Quiet visual progress; elapsed seconds add no useful information to the demonstration. */
export function PlaybackProgress({ cycle, duration }: { cycle: string; duration: number }) {
  const fraction = usePlaybackProgress(true, duration, cycle);
  return <span className={styles.progress} data-playback-progress aria-hidden="true" style={{ "--elapsed": fraction } as CSSProperties}>
    <span className={styles.track}><span /></span>
  </span>;
}
