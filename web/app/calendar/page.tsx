"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CalendarView } from "@/components/posts/CalendarView";
import { endpoints, type StrategyPayload } from "@/lib/api";
import { IconArrowLeft } from "@/lib/icons";

/**
 * The month this product treats as "now" when there is no plan yet to take it from.
 *
 * The board itself is always a civil (Gregorian) month with the Jewish holidays and the
 * Israeli shopping days pinned onto it — never a Hebrew-month calendar. That is a product
 * rule, not a rendering detail, so `data.calendar_kind` is expected to stay `gregorian`.
 */
const CURRENT_YEAR = 2026;
const CURRENT_MONTH = 9;

/**
 * The calendar keeps its own URL so existing links still land, but it is the same month
 * view the Posts tab shows behind its "לוח שנה" toggle — one implementation, two doors.
 */
export default function CalendarPage() {
  const router = useRouter();
  const [strategy, setStrategy] = useState<StrategyPayload | null>(null);
  const [ready, setReady] = useState(false);

  // The plan's month, so its posts can open in the editor. A missing plan is a normal state
  // (the board still shows the holidays), so a failed read only means "nothing to open".
  useEffect(() => {
    let active = true;
    endpoints
      .strategy()
      .then((current) => {
        if (active) setStrategy(current);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppShell>
      <header className="mb-8 flex items-end justify-between gap-4">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[color:var(--ink)] sm:text-[32px]">לוח התוכנית</h1>
        <Link href="/posts" className="group inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[color:var(--primary)] underline-offset-4 hover:underline">
          לכל הפוסטים
          <IconArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5 motion-reduce:transition-none" />
        </Link>
      </header>
      {ready ? (
        <CalendarView
          strategy={strategy}
          initialYear={strategy?.year ?? CURRENT_YEAR}
          initialMonth={strategy?.month ?? CURRENT_MONTH}
          posts={strategy?.roadmap?.posts}
          postsMonth={strategy ? { year: strategy.year, month: strategy.month } : null}
          onOpenPost={(index) => router.push(`/posts?post=${index}`)}
        />
      ) : (
        <p className="text-sm text-[color:var(--ink-muted)]">טוענים את הלוח…</p>
      )}
    </AppShell>
  );
}
