"use client";

import { useId } from "react";

/** Shared brand drawing. The storefront stays still; only the sun follows the arc. */
export function Storefront({ phase = .5, riseOnly = false, animated = false, className = "" }: {
  phase?: number; riseOnly?: boolean; animated?: boolean; className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const progress = Math.max(0, Math.min(1, phase));
  const angle = Math.PI * (1 - progress * (riseOnly ? .5 : 1));
  const x = 100 + Math.cos(angle) * 65;
  const y = 77 - Math.sin(angle) * 54;
  return <svg viewBox="0 0 200 146" fill="none" aria-hidden="true" className={className}>
    <defs><clipPath id={`store-sky-${id}`}><rect width="200" height="77" /></clipPath></defs>
    <path d="M35 77a65 54 0 0 1 130 0" stroke="var(--im-primary,var(--primary))" strokeDasharray="1 6" opacity=".2" />
    <g clipPath={`url(#store-sky-${id})`}>
      <g className={animated ? "journey-sun" : undefined} style={{ transform: `translate(${x}px, ${y}px)` }}>
        <circle r="15" fill="var(--im-sun,var(--sun))" />
        <path d="M0-24v-5M17-17l4-4M-17-17l-4-4M24 0h5M-24 0h-5" stroke="var(--im-sun,var(--sun))" strokeWidth="2" strokeLinecap="round" />
      </g>
    </g>
    <ellipse cx="104" cy="132" rx="58" ry="5" fill="var(--im-primary,var(--primary))" opacity=".08" />
    <path d="m141 84 8 7v37h-8Z" fill="var(--im-primary,var(--primary))" opacity=".16" />
    <path d="M59 82h82v45H59Z" fill="var(--im-paper,var(--paper))" stroke="var(--im-primary,var(--primary))" strokeWidth="2" />
    <path d="M68 98h31v19H68Z" fill="var(--im-soft,var(--primary-soft))" stroke="var(--im-primary,var(--primary))" strokeWidth="1.7" />
    <path d="M110 98h21v29h-21Z" fill="var(--im-soft,var(--primary-soft))" stroke="var(--im-primary,var(--primary))" strokeWidth="1.7" />
    <path d="M124 111v4M54 127h94" stroke="var(--im-primary,var(--primary))" strokeWidth="2" strokeLinecap="round" />
    <path d="m51 80 12-22h74l12 22c0 12-24.5 12-24.5 0 0 12-24.5 12-24.5 0 0 12-24.5 12-24.5 0 0 12-24.5 12-24.5 0Z" fill="var(--im-paper,var(--paper))" stroke="var(--im-primary,var(--primary))" strokeWidth="2" strokeLinejoin="round" />
    <path d="m76 59-6 20h15l2-20m25 0 2 20h15l-6-20" fill="var(--im-primary,var(--primary))" opacity=".12" />

  </svg>;
}
