"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { billingEndpoints, type MediaAllowance } from "@/lib/billing";
import { useCopy, useLanguage } from "@/components/language/LanguageProvider";

// Purpose: quote an image action in included units before submission. Existing assets
// and ordinary editing stay available; there is no credit checkout in this release.
export function MediaAllowanceNote({ refreshKey }: { refreshKey: string }) {
  const t = useCopy();
  const { locale } = useLanguage();
  const [allowance, setAllowance] = useState<MediaAllowance | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    billingEndpoints.mediaAllowance().then(value => {
      if (live) { setAllowance(value); setFailed(false); }
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [refreshKey, retry]);
  if (failed) return <button type="button" onClick={() => setRetry(n => n + 1)} className="min-h-11 text-[13px] text-[var(--primary)]">{t("לבדוק שוב כמה תמונות אפשר ליצור")}</button>;
  if (!allowance) return null;
  const images = allowance.images;
  const reset = allowance.resets_at ? new Date(allowance.resets_at).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "Asia/Jerusalem" }) : "";
  return <aside className="mb-4 border-b border-[var(--rule)] pb-3 text-[13px] leading-6 text-[var(--ink-soft)]" aria-live="polite">
    <p className="font-medium text-[var(--ink)]">{t("אפשר ליצור עוד {arg_0} תמונות מתוך מכסה של {arg_1}", { arg_0: images.remaining, arg_1: images.included })}</p>
    {images.generation_available ? <p>{t("כל יצירה או שינוי של תמונה בעזרת AI נספרים במכסה.")}</p>
      : <Link href="/assets" className="inline-flex min-h-11 items-center text-[var(--primary)]">{t("לבחור תמונה שכבר יש לכם")}</Link>}
    {reset ? <p>{t("המכסה מתחדשת ב־{arg_0}", { arg_0: reset })}</p> : null}
  </aside>;
}
