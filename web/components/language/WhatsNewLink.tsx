"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LATEST_RELEASE, RELEASE_READ_KEY, RELEASE_READ_EVENT } from "@/lib/releases";
import { useLanguage } from "./LanguageProvider";

/** A quiet platform utility; release announcements do not belong in the public header. */
export function WhatsNewLink({ children, className = "", iconOnly = false }: { children?: ReactNode; className?: string; iconOnly?: boolean }) {
  const { t, locale } = useLanguage();
  const pathname = usePathname();
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
  const label = unread ? t("מה חדש — עדכונים שעוד לא קראתם") : t("מה חדש");
  return <Link href={`/updates?lang=${locale}`} aria-current={pathname === "/updates" ? "page" : undefined} aria-label={label} title={label} data-unread={unread} className={iconOnly ? `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--ink-muted)] transition-colors hover:bg-[var(--soft)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] aria-[current=page]:bg-[var(--soft)] ${className}` : className}>
    {iconOnly ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 11v9h16v-9M3 7.5h18V11H3z" />
      <g style={{ color: unread ? "var(--primary)" : "currentColor" }}>
        <path d="M10.5 8h3v12h-3z" fill="currentColor" stroke="none" />
        <path d="M12 7.5c-4.5 0-6-1.2-6-3 0-1.2 1-1.8 2-1.4 1.5.6 2.5 2.4 4 4.4Zm0 0c4.5 0 6-1.2 6-3 0-1.2-1-1.8-2-1.4-1.5.6-2.5 2.4-4 4.4Z" />
      </g>
    </svg> : <>{children ?? t("מה חדש")}{unread ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" aria-hidden /> : null}</>}
  </Link>;
}
