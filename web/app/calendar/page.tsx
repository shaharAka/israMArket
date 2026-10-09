"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CalendarView } from "@/components/posts/CalendarView";
import { ApiError, endpoints, isPlanRequired, type StrategyPayload } from "@/lib/api";
import { IconArrowLeft } from "@/lib/icons";
import { useCopy } from "@/components/language/LanguageProvider";

/**
 * The calendar keeps its own URL so existing links still land, but it is the same month
 * view the Posts tab shows behind its "לוח שנה" toggle — one implementation, two doors.
 */
export default function CalendarPage() {
  // Purpose: see the scheduled work. If a read fails, recover it instead of showing
  // an apparently empty plan. Without a plan, use the actual current civil month.
  const t = useCopy();
  const router = useRouter();
  const [strategy, setStrategy] = useState<StrategyPayload | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<{ message: string; needsPlan: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Missing plan and unavailable plan are different states; retain any loaded plan.
  useEffect(() => {
    let active = true;
    endpoints
      .strategy()
      .then((current) => {
        if (active) { setStrategy(current); setError(null); }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof ApiError && err.status === 404 ? null : {
          message: err instanceof ApiError && err.status > 0 && err.status < 500 ? err.message : "לא הצלחנו לטעון את הפוסטים והמשימות של התוכנית.",
          needsPlan: isPlanRequired(err),
        });
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const now = new Date();

  return (
    <AppShell>
      <header className="mb-8 flex items-end justify-between gap-4">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[color:var(--ink)] sm:text-[32px]">{t("לוח התוכנית")}</h1>
        <Link href="/posts" className="group inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[color:var(--primary)] underline-offset-4 hover:underline">
          {t("לכל הפוסטים")}
          <IconArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5 motion-reduce:transition-none" />
        </Link>
      </header>
      {error ? <div role="alert" className="mb-6 text-[15px] text-[var(--ink-soft)]">
        <p>{t(error.message)}</p>
        {error.needsPlan ? <Link href="/billing" className="mt-2 inline-flex min-h-11 items-center font-semibold text-[var(--primary)]">{t("למנוי שלי")}</Link> : <button type="button" className="mt-2 min-h-11 font-semibold text-[var(--primary)]" onClick={() => { setError(null); if (!strategy) setReady(false); setAttempt(n => n + 1); }}>{t("לטעון את התוכנית שוב")}</button>}
      </div> : null}
      {ready && (!error || strategy) ? (
        <CalendarView
          strategy={strategy}
          initialYear={strategy?.year ?? now.getFullYear()}
          initialMonth={strategy?.month ?? now.getMonth() + 1}
          posts={strategy?.roadmap?.posts}
          postsMonth={strategy ? { year: strategy.year, month: strategy.month } : null}
          onOpenPost={(index) => router.push(`/posts?post=${index}`)}
        />
      ) : !error ? <p role="status" className="text-sm text-[color:var(--ink-muted)]">{t("טוענים את הלוח…")}</p> : null}
    </AppShell>
  );
}
