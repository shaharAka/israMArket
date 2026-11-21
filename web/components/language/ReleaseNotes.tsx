"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { endpoints } from "@/lib/api";
import { IconArrowLeft } from "@/lib/icons";
import { RELEASE_READ_KEY, RELEASE_READ_EVENT } from "@/lib/releases";
import { LATEST_OWNER_UPDATE, OWNER_UPDATES } from "@/lib/ownerUpdates";
import { LOCALE_META } from "@/lib/i18n/locales";
import { useLanguage } from "./LanguageProvider";

/** The last five changes an owner can use, each with a link to where it is (lib/ownerUpdates.ts). */
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
    try { localStorage.setItem(RELEASE_READ_KEY, LATEST_OWNER_UPDATE); } catch { /* Never block reading. */ }
    window.dispatchEvent(new Event(RELEASE_READ_EVENT));
  }, [access]);
  if (access === "checking") return <p className="text-[15px] text-[var(--ink-soft)]">{t("טוענים…")}</p>;
  if (access === "failed") return <div role="alert"><p>{t("לא הצלחנו לטעון את העדכונים. נסו שוב.")}</p><button type="button" className="min-h-11 text-[var(--primary)] hover:underline" onClick={() => { setAccess("checking"); setAttempt(value => value + 1); }}>{t("לנסות שוב")}</button></div>;
  const formatDate = new Intl.DateTimeFormat(LOCALE_META[locale].formatLocale, { day: "numeric", month: "long", timeZone: "Asia/Jerusalem" });
  return <div className="mx-auto max-w-[720px]">
    <header className="mb-8"><h1 className="text-[28px] font-medium leading-tight sm:text-[32px]">{t("מה חדש")}</h1></header>
    <ol className="border-b border-[var(--rule)]">
      {OWNER_UPDATES.map(update => <li key={update.id} className="border-t border-[var(--rule)] py-5">
        <article aria-labelledby={`update-${update.id}`}>
          <time dateTime={update.date} className="text-[13px] text-[var(--ink-muted)]">{formatDate.format(new Date(update.date + "T12:00:00+03:00"))}</time>
          <h2 id={`update-${update.id}`} className="mt-1 text-[17px] font-semibold leading-snug text-[var(--ink)]">{t(update.title)}</h2>
          <p className="mt-1 text-[15px] leading-6 text-[var(--ink-soft)]">{t(update.summary)}</p>
          <Link href={update.href} className="mt-1 inline-flex min-h-11 items-center gap-2 text-[14px] font-semibold text-[var(--primary)] hover:underline">{t(update.action)}<IconArrowLeft className="h-4 w-4 locale-arrow" /></Link>
        </article>
      </li>)}
    </ol>
  </div>;
}
