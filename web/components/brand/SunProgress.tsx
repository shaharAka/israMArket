"use client";
import { useCopy } from "@/components/language/LanguageProvider";
/** Compatibility export; progress now follows the restrained product language. */
export function SunProgress({ value, total, label, className = "" }: { value: number; total: number; label: string; className?: string }) {
  const t = useCopy();
  const max = Math.max(1, total);
  const current = Math.max(0, Math.min(value, max));
  return <div className={`journey-progress ${className}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={current} aria-valuetext={t("{arg_0} מתוך {arg_1}", {arg_0:current,arg_1:max})}>
    {Array.from({length:max},(_,index)=><span key={index} aria-hidden="true" data-complete={index<current} />)}
  </div>;
}
