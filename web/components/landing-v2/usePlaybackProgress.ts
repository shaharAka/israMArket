"use client";
import { useEffect, useState } from "react";

/** Same reset/pause boundary as the demo's advance timer; no customer state involved. */
export function usePlaybackProgress(running: boolean, duration: number, cycle: string) {
  const [value, setValue] = useState({ cycle: "", fraction: 0 });
  useEffect(() => {
    if (!running) return;
    const start = performance.now();
    const update = () => setValue({ cycle, fraction: Math.min(1, (performance.now() - start) / duration) });
    const timer = window.setInterval(update, 80);
    return () => window.clearInterval(timer);
  }, [running, duration, cycle]);
  return running && value.cycle === cycle ? value.fraction : 0;
}
