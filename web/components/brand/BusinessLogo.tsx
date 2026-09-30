"use client";

import { useState } from "react";
/** Existing logo only. A missing or failed image falls back to the business initial. */
export function BusinessLogo({ src, name, color, className = "" }: { src?: string | null; name: string; color?: string; className?: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const safe = src && /^(https?:\/\/|\/)/.test(src) && !src.startsWith("//") ? src : null;
  return safe && failedSource !== safe ? (
    // eslint-disable-next-line @next/next/no-img-element -- logo from the business's own site, any host
    <img src={safe} alt={`הלוגו של ${name}`} onError={() => setFailedSource(safe)} className={`object-contain ${className}`} />
  ) : <span aria-hidden="true" className={`flex items-center justify-center font-semibold ${className}`} style={{ color: color || "var(--primary)", background: "var(--paper)" }}>{name.trim().slice(0, 1)}</span>;
}
