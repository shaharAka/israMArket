"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { SUPPORTED_LOCALES, LOCALE_META, isLocale } from "@/lib/i18n/locales";
import { LATEST_RELEASE, RELEASE_READ_KEY, RELEASE_READ_EVENT } from "@/lib/releases";
import { useLanguage } from "./LanguageProvider";

export function ProductUtilities() {
  const { locale, choose, t, busy, error } = useLanguage();
  const id = useId();
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    function refresh() {
      try { setUnread(localStorage.getItem(RELEASE_READ_KEY) !== LATEST_RELEASE); }
      catch { setUnread(false); }
    }
    const timer = window.setTimeout(refresh, 0);
    window.addEventListener(RELEASE_READ_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => { window.clearTimeout(timer); window.removeEventListener(RELEASE_READ_EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, []);
  return <div className="product-utilities" aria-label={t("שפה ועדכונים")}>
    <div className="product-utilities-row">
      <label htmlFor={id} className="inline-flex min-h-11 items-center gap-2 text-[13px] text-[var(--ink-soft)]">
        <span>{t("שפה")}</span>
        <select id={id} value={locale} disabled={busy} aria-busy={busy} onChange={event => { if (isLocale(event.target.value)) choose(event.target.value); }} className="min-h-11 max-w-36 cursor-pointer bg-transparent px-2 font-medium text-[var(--ink)] focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-[var(--primary)]" dir="auto">
          {SUPPORTED_LOCALES.map(language => <option key={language} value={language} lang={language}>{LOCALE_META[language].name}</option>)}
        </select>
      </label>
      <Link href="/updates" className="inline-flex min-h-11 shrink-0 items-center gap-2 text-[13px] font-medium text-[var(--ink-soft)] hover:text-[var(--primary)] hover:underline" aria-label={unread ? t("מה חדש — עדכונים שעוד לא קראתם") : t("מה חדש")}>
        {t("מה חדש")}{unread && <span className="h-1.5 w-1.5 rounded-full bg-[var(--sun-edge)]" aria-hidden />}
      </Link>
    </div>
    {error ? <p role="alert" className="px-4 pb-2 text-[13px] text-[var(--danger)]">{t(error)}</p> : null}
    {locale !== "he" ? <p className="translation-preview-note" role="status">{t("התרגום מתווסף בהדרגה. חלק מהמסכים והתוכן עדיין בעברית.")}</p> : null}
  </div>;
}
