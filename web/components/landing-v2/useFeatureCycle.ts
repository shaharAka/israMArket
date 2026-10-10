"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
function subscribeMotion(changed: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", changed);
  return () => media.removeEventListener("change", changed);
}
/** Visible feature demos loop until explicitly paused. Selection restarts the reading time. */
export function useFeatureCycle(count: number, interval = 7000) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [restart, setRestart] = useState(0);
  const select = useCallback((next: number) => { setIndex(next); setRestart(value => value + 1); }, []);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [focused, setFocused] = useState(false);
  const reduced = useSyncExternalStore(subscribeMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => true);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0 });
    if (ref.current) observer.observe(ref.current);
    const changed = () => setPageVisible(!document.hidden);
    changed(); document.addEventListener("visibilitychange", changed);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", changed); };
  }, []);
  const playing = !paused && !reduced && visible && pageVisible && !focused;
  useEffect(() => {
    if (!playing || count < 2) return;
    const timer = setTimeout(() => setIndex((index + 1) % count), interval);
    return () => clearTimeout(timer);
  }, [playing, count, index, interval, restart]);
  return { ref, index, select, restart, paused, reduced, playing, toggle: () => setPaused(value => !value), setFocused };
}
