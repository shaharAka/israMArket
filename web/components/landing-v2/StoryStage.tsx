"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./journey-art.module.css";

/** Keep the illustration at rest until its stage is visible. */
export function StoryStage({ className, children, decorative = false }: {
  className: string; children: ReactNode; decorative?: boolean;
}) {
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    let visible = false;
    const update = () => { el.dataset.running = String(visible && !document.hidden); };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.intersectionRatio >= .15;
      update();
    }, { threshold: [0, .15] });
    observer.observe(el);
    document.addEventListener("visibilitychange", update);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);
  return <div ref={stage} className={`${styles.stage} ${className}`} aria-hidden={decorative || undefined}>{children}</div>;
}
