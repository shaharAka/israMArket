"use client";

import { useId } from "react";

/** A measured journey: the sun moves only when the supplied progress changes. */
export function SunProgress({ value, total, label, className = "" }: {
  value: number; total: number; label: string; className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const phase = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  // A rising quarter-arc: finishing never sends the sun back down behind the shop.
  const angle = Math.PI - phase * Math.PI / 2;
  const x = 100 + Math.cos(angle) * 65;
  const y = 69 - Math.sin(angle) * 51;
  return (
    <div className={`sun-progress ${className}`} role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={Math.max(1, total)} aria-valuenow={Math.max(0, Math.min(value, total))}
      aria-valuetext={`${value} מתוך ${total}`}>
      <svg viewBox="0 0 200 112" fill="none" aria-hidden="true">
        <defs><clipPath id={`sky-${id}`}><rect width="200" height="70" /></clipPath></defs>
        <path d="M35 69A65 51 0 0 1 100 18" stroke="var(--rule-dark)" strokeDasharray="2 5" strokeLinecap="round" />
        <g clipPath={`url(#sky-${id})`}>
          <g className="journey-sun" style={{ transform: `translate(${x}px, ${y}px)` }}>
            <circle r="14" fill="var(--sun)" />
            <g stroke="var(--sun-edge)" strokeWidth="1.6" strokeLinecap="round">
              <path d="M0-22v-4M16-16l3-3M22 0h4M-16-16l-3-3M-22 0h-4" />
            </g>
          </g>
        </g>
        <g stroke="var(--primary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M71 69h58l9 18c0 10-13 10-13 0 0 10-13 10-13 0 0 10-13 10-13 0 0 10-13 10-13 0 0 10-15 10-15 0l9-18Z" fill="var(--paper)" />
          <path d="M77 95v13h47V95M69 108h62M88 101h25" />
        </g>
      </svg>
    </div>
  );
}
