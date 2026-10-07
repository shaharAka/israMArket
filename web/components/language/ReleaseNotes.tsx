"use client";

import Link from "next/link";
import { TranslationCoverage } from "./TranslationCoverage";
import { useEffect, useState } from "react";
import { endpoints } from "@/lib/api";
import { IconArrowLeft } from "@/lib/icons";
import { RELEASES, LATEST_RELEASE, RELEASE_READ_KEY, RELEASE_READ_EVENT } from "@/lib/releases";
import { LOCALE_META } from "@/lib/i18n/locales";
import { useLanguage } from "./LanguageProvider";

export function ReleaseNotes() {
  const { t, locale } = useLanguage();
  const [access, setAccess] = useState<"checking" | "ready" | "failed">("checking");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    endpoints.me().then(() => { if (alive) setAccess("ready"); }).catch(() => { if (alive) setAccess("failed"); });
    return () => { alive = false; };
  }, [attempt]);
  useEffect(() => {
    if (access !== "ready") return;
    try { localStorage.setItem(RELEASE_READ_KEY, LATEST_RELEASE); } catch { /* Never block reading. */ }
    window.dispatchEvent(new Event(RELEASE_READ_EVENT));
  }, [access]);
  if (access === "checking") return <p className="text-[15px] text-[var(--ink-soft)]">{t("טוענים…")}</p>;
  if (access === "failed") return <div role="alert"><p>{t("לא הצלחנו לטעון את העדכונים. נסו שוב.")}</p><button type="button" className="min-h-11 text-[var(--primary)] hover:underline" onClick={() => { setAccess("checking"); setAttempt(value => value + 1); }}>{t("לנסות שוב")}</button></div>;
  return <div className="mx-auto max-w-[820px]">
    <header className="mb-8"><h1 className="text-[32px] font-bold tracking-tight">{t("מה חדש")}</h1><p className="mt-2 text-[15px] leading-7 text-[var(--ink-soft)]">{t("מה השתנה במערכת, ואיפה אפשר לנסות את זה.")}</p></header>
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
    <TranslationCoverage />
  </div>;
}
