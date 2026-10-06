"use client";

import Link from "next/link";
import { useEffect } from "react";
import { BrandMark, IconArrowLeft } from "@/lib/icons";
import { RELEASES, LATEST_RELEASE, RELEASE_READ_KEY, RELEASE_READ_EVENT } from "@/lib/releases";
import { LOCALE_META } from "@/lib/i18n/locales";
import { useLanguage } from "./LanguageProvider";

export function ReleaseNotes() {
  const { t, locale } = useLanguage();
  useEffect(() => {
    try { localStorage.setItem(RELEASE_READ_KEY, LATEST_RELEASE); } catch { /* Never block reading. */ }
    window.dispatchEvent(new Event(RELEASE_READ_EVENT));
  }, []);
  return <main className="mx-auto max-w-[820px] px-5 py-8 sm:px-8 sm:py-12">
    <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-[var(--ink)]"><BrandMark className="h-7 w-7 text-[var(--primary)]" />{t("ישראמארקט")}</Link>
    <header className="mt-6 mb-8"><h1 className="text-[32px] font-bold tracking-tight">{t("מה חדש")}</h1><p className="mt-2 text-[15px] leading-7 text-[var(--ink-soft)]">{t("מה השתנה במערכת, ואיפה אפשר לנסות את זה.")}</p></header>
    <ol>
      {RELEASES.map(release => <li key={release.id} className="border-t border-[var(--rule)] py-7">
        <article aria-labelledby={`release-${release.id}`}>
          <time dateTime={release.date} className="text-[13px] text-[var(--ink-muted)]">{new Intl.DateTimeFormat(LOCALE_META[locale].formatLocale, { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jerusalem" }).format(new Date(release.date + "T12:00:00+03:00"))}</time>
          <h2 id={`release-${release.id}`} className="mt-2 text-[20px] font-bold leading-snug">{t(release.title)}</h2>
          <p className="mt-2 max-w-[42em] text-[15px] leading-7 text-[var(--ink-soft)]">{t(release.summary)}</p>
          <details className="mt-2 text-[14px] leading-7 text-[var(--ink-soft)]"><summary className="min-h-11 cursor-pointer font-medium">{t("עוד פרטים")}</summary><p className="max-w-[42em]">{t(release.detail)}</p></details>
          <Link href={release.href} className="inline-flex min-h-11 items-center gap-2 text-[14px] font-semibold text-[var(--primary)] hover:underline">{t(release.action)}<IconArrowLeft className="h-4 w-4 locale-arrow" /></Link>
        </article>
      </li>)}
    </ol>
  </main>;
}
