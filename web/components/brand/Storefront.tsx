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
    <path d="M50 78h100v52H50Z" fill="var(--im-paper,var(--paper))" stroke="var(--im-primary,var(--primary))" strokeWidth="2" />
    <path d="M58 88h62v33H58Z" fill="var(--im-soft,var(--primary-soft))" stroke="var(--im-primary,var(--primary))" strokeWidth="1.7" />
    <path d="M89 88v33M58 114h62" stroke="var(--im-primary,var(--primary))" strokeWidth="1.3" opacity=".5" />
    <path d="M127 88h17v42h-17Z" fill="var(--im-soft,var(--primary-soft))" stroke="var(--im-primary,var(--primary))" strokeWidth="1.7" />
    <path d="M139 107v5M45 130h110" stroke="var(--im-primary,var(--primary))" strokeWidth="2" strokeLinecap="round" />
    <path d="M48 57h104v10H48Z" fill="var(--im-soft,var(--primary-soft))" stroke="var(--im-primary,var(--primary))" strokeWidth="2" />
    <path d="M44 67h112v11c0 10-22.4 10-22.4 0 0 10-22.4 10-22.4 0 0 10-22.4 10-22.4 0 0 10-22.4 10-22.4 0 0 10-22.4 10-22.4 0Z" fill="var(--im-paper,var(--paper))" stroke="var(--im-primary,var(--primary))" strokeWidth="2" strokeLinejoin="round" />
    <path d="M66.4 67h22.4v11c0 10-22.4 10-22.4 0ZM111.2 67h22.4v11c0 10-22.4 10-22.4 0Z" fill="var(--im-primary,var(--primary))" opacity=".22" />

  </svg>;
}
