"use client";

import { usePathname } from "next/navigation";
import { useId } from "react";
import { SUPPORTED_LOCALES, LOCALE_META, isLocale } from "@/lib/i18n/locales";
import { useLanguage } from "./LanguageProvider";

export function ProductUtilities({ inline = false }: { inline?: boolean }) {
  const pathname = usePathname();
  const { locale, choose, t, busy, error } = useLanguage();
  const id = useId();
  if (!inline && (pathname === "/" || pathname.startsWith("/for/") || pathname === "/design/hero")) return null;
  return <div className={inline ? "product-utilities product-utilities-inline" : "product-utilities"} aria-label={t("שפה")}>
    <div className="product-utilities-row" dir="rtl">
      <label htmlFor={id} className="product-language-control">
        <span className="sr-only">{t("שפה")}</span>
        <select id={id} value={locale} disabled={busy} aria-busy={busy} onChange={event => { if (isLocale(event.target.value)) choose(event.target.value); }} className="min-h-11 w-28 cursor-pointer bg-transparent px-2 font-medium text-[var(--ink)] focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-[var(--primary)]" dir="auto">
          {SUPPORTED_LOCALES.map(language => <option key={language} value={language} lang={language}>{LOCALE_META[language].name}</option>)}
        </select>
      </label>
    </div>
    {error ? <p role="alert" className="px-4 pb-2 text-[13px] text-[var(--danger)]">{t(error)}</p> : null}
  </div>;
}
