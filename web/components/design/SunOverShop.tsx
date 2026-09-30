"use client";

import { useEffect, useRef, useState } from "react";
import { Storefront } from "@/components/brand/Storefront";
import styles from "./sun.module.css";

/** A sun follows an actual arc above a fixed storefront. Drag to inspect the identity at any point. */
export function SunOverShop({ reduced = false }: { reduced?: boolean }) {
  const [phase, setPhase] = useState(.35);
  const [running, setRunning] = useState(false);
  const frame = useRef<number | null>(null);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    function reduce(event: MediaQueryListEvent) {
      if (!event.matches) return;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      setRunning(false);
      setPhase(.5);
    }
    preference.addEventListener("change", reduce);
    return () => { preference.removeEventListener("change", reduce); if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, []);
  useEffect(() => {
    if (!reduced) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const timer = window.setTimeout(() => { setRunning(false); setPhase(.5); }, 0);
    return () => window.clearTimeout(timer);
  }, [reduced]);

  function cancel() { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; setRunning(false); }
  function play() {
    cancel();
    if (reduced || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setPhase(.5); return; }
    setRunning(true);
    let start: number | undefined;
    const tick = (time: number) => {
      start ??= time;
      const next = Math.min(1, (time - start) / 4600);
      setPhase(next);
      if (next < 1) frame.current = requestAnimationFrame(tick);
      else { frame.current = null; setRunning(false); }
    };
    frame.current = requestAnimationFrame(tick);
  }

  return <div className={styles.scene}><Storefront phase={phase} /><div className={styles.controls}><button type="button" onClick={play} disabled={running}>{running ? "השמש בדרך…" : "לתת לשמש לעבור"}</button><input type="range" min="0" max="100" value={Math.round(phase * 100)} aria-label="מיקום השמש מעל העסק" onChange={(event) => { cancel(); setPhase(Number(event.target.value) / 100); }} /></div></div>;
}
