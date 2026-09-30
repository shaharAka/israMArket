"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./sun.module.css";

/** A sun follows an actual arc above a fixed storefront. Drag to inspect the identity at any point. */
export function SunOverShop({ reduced = false }: { reduced?: boolean }) {
  const [phase, setPhase] = useState(.35);
  const [running, setRunning] = useState(false);
  const frame = useRef<number | null>(null);
  const id = useId();
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
  const x = 150 + Math.cos(Math.PI * phase) * 102;
  const y = 158 - Math.sin(Math.PI * phase) * 116;
  const rays = Math.max(0, Math.min(1, (140 - y) / 30));

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

  return <div className={styles.scene}><svg viewBox="0 0 300 220" fill="none" aria-hidden="true"><defs><clipPath id={id}><rect width="300" height="140" /></clipPath></defs><path d="M35 193h230" stroke="var(--im-rule)" /><path d="M252 158A102 116 0 0 0 48 158" stroke="var(--im-primary)" strokeDasharray="2 6" opacity=".16" /><g clipPath={`url(#${id})`}><g transform={`translate(${x} ${y})`}><circle r="16" fill="var(--im-sun)" stroke="var(--im-ink)" strokeWidth="1.8" /><g opacity={rays} stroke="var(--im-support)" strokeWidth="1.8" strokeLinecap="round"><path d="M0-25v-7M18-18l5-5M-18-18l-5-5M25 0h7M-25 0h-7" /></g></g></g><path d="m104 142 14-26h64l14 26c0 11-23 11-23 0 0 11-23 11-23 0 0 11-23 11-23 0 0 11-23 11-23 0Z" fill="var(--im-paper)" stroke="var(--im-primary)" strokeWidth="2.5" strokeLinejoin="round" /><path d="M116 152v39m68-39v39m-80 0h92M133 163h34" stroke="var(--im-primary)" strokeWidth="2.5" strokeLinecap="round" /><path d="M60 186h17m147 0h17" stroke="var(--im-support)" strokeWidth="1.6" /></svg><div className={styles.controls}><button type="button" onClick={play} disabled={running}>{running ? "השמש בדרך…" : "לתת לשמש לעבור"}</button><input type="range" min="0" max="100" value={Math.round(phase * 100)} aria-label="מיקום השמש מעל העסק" onChange={(event) => { cancel(); setPhase(Number(event.target.value) / 100); }} /></div></div>;
}
