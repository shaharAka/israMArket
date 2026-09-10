"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingMark, PlanDoodle, Scribble } from "@/components/Doodles";
import { MonthAhead } from "@/components/MonthAhead";
import { endpoints, type StrategyPayload } from "@/lib/api";
import {
  IconArrowLeft,
  IconBell,
  IconCalendar,
  IconCompass,
  IconFlag,
  IconMegaphone,
  IconRoute,
} from "@/lib/icons";

/** Which plan week today falls in, or null when today is outside the plan's month. */
function currentWeekOf(strategy: StrategyPayload): number | null {
  const now = new Date();
  if (now.getFullYear() !== strategy.year || now.getMonth() + 1 !== strategy.month) return null;
  return Math.min(4, Math.ceil(now.getDate() / 7));
}

export default function StrategyPage() {
  const [strategy, setStrategy] = useState<StrategyPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    endpoints
      .strategy()
      .then(setStrategy)
      .catch((err) => setError(err instanceof Error ? err.message : "שגיאה בטעינת התוכנית"));
  }, []);

  const weeks = strategy?.weekly_breakdown || strategy?.roadmap?.weekly_breakdown || [];
  const events = strategy?.relevant_events || strategy?.roadmap?.relevant_events || [];
  const monthly = strategy?.monthly_horizon_plan || strategy?.roadmap?.monthly_horizon_plan;
  const nextUserAction = weeks.flatMap((week) => week.what_user_does || []).find(Boolean);
  const currentWeek = strategy ? currentWeekOf(strategy) : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <header className="relative border-b border-[#deddd8] pb-6">
          <PlanDoodle className="pointer-events-none absolute -top-2 left-0 hidden h-16 w-42 opacity-70 sm:block" />
          <p className="text-xs font-bold text-[#747570]">
            {strategy ? `${strategy.month_name_he} ${strategy.year}` : "התוכנית החודשית"}
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-[#20211f]">
            מה אנחנו עושים החודש
          </h1>
          <Scribble className="mt-2" />
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#62635f]">
            אנחנו מנהלים את התוכנית, מכינים את התוכן, עוקבים אחרי התוצאות ומשנים את הכיוון כשצריך.
          </p>
        </header>

        {error ? (
          <p className="mt-6 rounded-md border border-[#d8c3bd] bg-white px-4 py-3 text-sm text-[#7c4036]">
            {error}
          </p>
        ) : null}

        {strategy ? (
          <div className="rise-stagger space-y-9 py-7">
            <section>
              <SectionLabel icon={<IconFlag className="h-4 w-4" />}>המטרה שלנו החודש</SectionLabel>
              <h2 className="mt-2 text-xl font-black leading-8 text-[#20211f] sm:text-2xl">
                {monthly?.hypothesis || strategy.usp.growth_hypothesis || strategy.usp.usp}
              </h2>
              {monthly?.targets?.length ? (
                <ul className="mt-4 space-y-2 border-r-2 border-[#343632] pr-4">
                  {monthly.targets.slice(0, 3).map((target) => (
                    <li key={target} className="text-sm leading-6 text-[#62635f]">
                      {target}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section className="border-y border-[#deddd8] py-6">
              <div className="mb-5">
                <SectionLabel icon={<IconRoute className="h-4 w-4" />}>איך החודש מתקדם</SectionLabel>
                <h2 className="mt-1 text-lg font-black text-[#20211f]">שבוע אחרי שבוע</h2>
                <p className="mt-1 text-sm text-[#747570]">המערכת מטפלת בכל שבוע בשלב הבא.</p>
              </div>
              <ol className="space-y-0">
                {weeks.map((week, index) => {
                  const isNow = currentWeek === week.week;
                  const isPast = currentWeek !== null && week.week < currentWeek;
                  return (
                    <li
                      key={week.week}
                      className="rise grid grid-cols-[28px_1fr] gap-3"
                      style={{ animationDelay: `${180 + index * 110}ms` }}
                    >
                      <div className="flex flex-col items-center">
                        <span
                          className={`relative flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold ${
                            isNow
                              ? "ring-pulse border-[#20211f] bg-[#20211f] text-white"
                              : isPast
                                ? "border-[#c7c4b7] bg-[#f0eee6] text-[#747570]"
                                : "border-[#343632] bg-white text-[#20211f]"
                          }`}
                          aria-label={isNow ? `שבוע ${week.week} — עכשיו` : `שבוע ${week.week}`}
                        >
                          {week.week}
                        </span>
                        {index < weeks.length - 1 ? (
                          <span
                            className={`grow-y min-h-12 w-px flex-1 ${isPast ? "bg-[#c7c4b7]" : "bg-[#deddd8]"}`}
                            style={{ animationDelay: `${300 + index * 110}ms` }}
                          />
                        ) : null}
                      </div>
                      <div className="pb-6">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-[#20211f]">{week.focus}</h3>
                          {isNow ? (
                            <span className="label-mark border-[#343632] bg-[#20211f] text-white">עכשיו</span>
                          ) : null}
                        </div>
                        <p className="mt-1 flex items-start gap-2 text-sm leading-6 text-[#62635f]">
                          <IconMegaphone className="mt-1 h-4 w-4 shrink-0 text-[#8b8e84]" />
                          <span>{week.media_distribution}</span>
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>

            <section className="rounded-lg border border-[#e2d7c3] bg-[#fcf9f2] p-5 sm:p-6">
              <SectionLabel icon={<IconBell className="h-4 w-4" />} tone="sand">
                מה צריך מכם עכשיו
              </SectionLabel>
              <p className="mt-2 text-base font-bold leading-7 text-[#20211f]">
                {nextUserAction || "כרגע לא צריך לעשות דבר. אנחנו ממשיכים להכין ולעקוב."}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#747570]">
                כל שאר העבודה — כתיבה, תמונות, התאמה לערוצים ומדידה — אצלנו.
              </p>
            </section>

            <details className="group border-b border-[#deddd8] pb-5">
              <summary className="flex cursor-pointer list-none items-center gap-2 py-2 text-sm font-bold text-[#62635f] hover:text-[#20211f]">
                <IconCompass className="h-4 w-4 transition-transform duration-300 group-open:rotate-45" />
                למה בחרנו בכיוון הזה
              </summary>
              <div className="mt-3 space-y-6 text-sm leading-6 text-[#62635f]">
                <div>
                  <p className="font-bold text-[#20211f]">המסר שמוביל את התוכן</p>
                  <p className="mt-1">{strategy.usp.usp_one_liner}</p>
                </div>
                {events.length ? (
                  <div>
                    <p className="flex items-center gap-2 font-bold text-[#20211f]">
                      <IconCalendar className="h-4 w-4 text-[#8b8e84]" />
                      המועדים שלקחנו בחשבון
                    </p>
                    <ul className="mt-2 space-y-2">
                      {events.slice(0, 4).map((event) => (
                        <li key={`${event.date}-${event.name}`}>
                          <span className="font-bold text-[#20211f]">{event.date} · {event.name}</span>
                          {" — "}
                          {event.business_relevance}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </details>

            <MonthAhead horizon={strategy.horizon} onReady={setStrategy} />

            <div className="flex flex-col items-start gap-2 border-t border-[#deddd8] pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[#747570]">הפוסטים כבר מוכנים לבדיקה.</p>
              <Link
                href="/posts"
                className="group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#20211f] px-6 text-sm font-bold text-white transition-colors hover:bg-[#343632] sm:w-auto"
              >
                לבדוק את הפוסט הבא
                <IconArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
              </Link>
            </div>
          </div>
        ) : !error ? (
          <LoadingMark label="אנחנו טוענים את התוכנית החודשית…" />
        ) : null}
      </div>
    </AppShell>
  );
}

function SectionLabel({
  icon,
  children,
  tone = "ink",
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: "ink" | "sand";
}) {
  return (
    <p
      className={`flex items-center gap-2 text-xs font-bold ${
        tone === "sand" ? "text-[#685f47]" : "text-[#747570]"
      }`}
    >
      <span className={tone === "sand" ? "text-[#685f47]" : "text-[#20211f]"}>{icon}</span>
      {children}
    </p>
  );
}
