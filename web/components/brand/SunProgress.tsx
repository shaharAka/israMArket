"use client";

import { Storefront } from "./Storefront";

/** A measured journey: the sun moves only when the supplied progress changes. */
export function SunProgress({ value, total, label, className = "" }: {
  value: number; total: number; label: string; className?: string;
}) {
  const phase = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  return (
    <div className={`sun-progress ${className}`} role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={Math.max(1, total)} aria-valuenow={Math.max(0, Math.min(value, total))}
      aria-valuetext={`${value} מתוך ${total}`}>
      <Storefront phase={phase} riseOnly animated />
    </div>
  );
}
