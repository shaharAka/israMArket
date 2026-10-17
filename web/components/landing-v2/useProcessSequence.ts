"use client";
import { useEffect, useRef, useState } from "react";

/** A local demonstration clock; pauses retain their remaining time. No customer writes. */
export function useProcessSequence(durations: readonly number[], playing: boolean) {
  const [index, setIndex] = useState(0);
  const remaining = useRef(durations[0]);
  const [revision, setRevision] = useState(0);
  const manualRevision = useRef(0);
  useEffect(() => {
    if (!playing) return;
    const started = performance.now();
    const version = manualRevision.current;
    let completed = false;
    const timer = window.setTimeout(() => {
      const next = (index + 1) % durations.length;
      completed = true; remaining.current = durations[next]; setIndex(next);
    }, remaining.current);
    return () => { window.clearTimeout(timer); if (!completed && version === manualRevision.current) remaining.current = Math.max(0, remaining.current - (performance.now() - started)); };
  }, [playing, index, durations, revision]);
  return { index, select: (next: number) => { manualRevision.current += 1; remaining.current = durations[next]; setIndex(next); setRevision(value => value + 1); } };
}
