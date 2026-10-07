"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LATEST_RELEASE, RELEASE_READ_KEY, RELEASE_READ_EVENT } from "@/lib/releases";
import { useCopy } from "./LanguageProvider";

/** A quiet platform utility; release announcements do not belong in the public header. */
export function WhatsNewLink({ children, className = "" }: { children?: ReactNode; className?: string }) {
  const t = useCopy();
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
  return <Link href="/updates" aria-current={pathname === "/updates" ? "page" : undefined} aria-label={unread ? t("מה חדש — עדכונים שעוד לא קראתם") : t("מה חדש")} className={className}>
    {children ?? t("מה חדש")}
    {unread ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--sun-edge)]" aria-hidden /> : null}
  </Link>;
}
