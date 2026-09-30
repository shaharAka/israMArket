"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CalendarView } from "@/components/posts/CalendarView";
import { endpoints, type StrategyPayload } from "@/lib/api";

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
      <header className="mb-5 flex items-end justify-between gap-4 border-b border-[#e6e4dc] pb-4">
        <h1 className="text-2xl font-black tracking-tight text-[#1e201d] sm:text-3xl">לוח שנה</h1>
        <Link href="/posts" className="min-h-11 content-center text-sm font-bold text-[#20211f] underline underline-offset-4">
          לכל הפוסטים
        </Link>
      </header>
      {ready ? (
        <CalendarView
          initialYear={strategy?.year ?? CURRENT_YEAR}
          initialMonth={strategy?.month ?? CURRENT_MONTH}
          posts={strategy?.roadmap?.posts}
          postsMonth={strategy ? { year: strategy.year, month: strategy.month } : null}
          onOpenPost={(index) => router.push(`/posts?post=${index}`)}
        />
      ) : (
        <p className="text-sm text-[#63665e]">טוענים את הלוח…</p>
      )}
    </AppShell>
  );
}
