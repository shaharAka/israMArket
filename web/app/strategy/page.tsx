"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingMark } from "@/components/Doodles";
import { MonthAhead } from "@/components/MonthAhead";
import { SectionHeader } from "@/components/SectionHeader";
import { endpoints, type StrategyPayload, type WeeklyBreakdownItem } from "@/lib/api";
import { SECTIONS } from "@/lib/sections";
import {
  IconArrowLeft,
  IconBell,
  IconCalendar,
  IconCompass,
  IconEye,
  IconFlag,
  IconMegaphone,
  IconRoute,
} from "@/lib/icons";

/**
 * The monthly plan, told as a timeline.
 *
 * Every page used to be the same column of bordered boxes, so moving between them felt
 * like nothing had changed. This one hangs the month on a single vertical rail: one
 * marker per week, the week you are in filled and tinted, and the supporting material
 * (the goal, what we need from you, the reasoning) grouped around the rail rather than
 * stacked next to it.
 *
 * The rail is the page's structure, so it carries the page: the goal and the week's ask
 * share one tinted panel above it, the weeks themselves draw no boxes at all, and the
 * only bordered object left is the next-month card. One button here is dark —
 * `לבדוק את הפוסט הבא`, the forward step — while building next month is a quiet outline.
 *
 * The rail also carries the word budget (UI-RULES rule 7): the face keeps the week marker
 * and the week's focus, and the four lists that explain it — what we do, what we need from
 * the owner, what we measure and where we publish — are one expand per week. The month's
 * hypothesis and its numbers stay visible, because those are the answer, not explanation.
 */

/** The section's own accent — this page should read as "the monthly plan". */
const RAIL = SECTIONS.strategy;

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
  // MonthAhead renders nothing without a horizon, which is also the condition for the
  // rail's last station to exist — the two must agree or the line would dangle.
  const nextMonthAhead = Boolean(strategy?.horizon);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <SectionHeader
          section="strategy"
          title="התוכנית"
          subtitle="מה עושים החודש, שבוע אחרי שבוע."
          action={
            strategy ? (
              <span
                className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-bold"
                style={{ background: RAIL.surface, borderColor: RAIL.border, color: RAIL.accent }}
              >
                <IconCalendar className="h-3.5 w-3.5" />
                {strategy.month_name_he} {strategy.year}
              </span>
            ) : undefined
          }
        />

        {error ? (
          <p className="rounded-md border border-[#d8c3bd] bg-white px-4 py-3 text-sm text-[#7c4036]">
            {error}
          </p>
        ) : null}

        {strategy ? (
          <div className="rise-stagger space-y-6 pb-2">
            {/* The month's goal and what it asks of the owner are the same statement, so they
                share one tinted panel instead of two bordered ones. */}
            <section className="rounded-lg p-5 sm:p-6" style={{ background: RAIL.surface }}>
              <SectionLabel icon={<IconFlag className="h-4 w-4" />} tone="sand">
                המטרה
              </SectionLabel>
              <h2 className="mt-2 text-xl font-black leading-8 text-[#20211f] sm:text-2xl">
                {monthly?.hypothesis || strategy.usp.growth_hypothesis || strategy.usp.usp}
              </h2>
              {monthly?.targets?.length ? (
                <ul className="mt-4 space-y-2 border-r-2 pr-4" style={{ borderColor: RAIL.accent }}>
                  {monthly.targets.slice(0, 3).map((target) => (
                    <li key={target} className="text-sm leading-6 text-[#5e6159]">
                      {target}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-5 border-t pt-4" style={{ borderColor: RAIL.border }}>
                <SectionLabel icon={<IconBell className="h-3.5 w-3.5" />} tone="sand">
                  מה צריך מכם
                </SectionLabel>
                <p className="mt-1.5 text-base font-bold leading-7 text-[#20211f]">
                  {nextUserAction || "כרגע לא צריך לעשות דבר. אנחנו ממשיכים להכין ולעקוב."}
                </p>
                <p className="mt-1 text-xs leading-5 text-[#747570]">כל השאר אצלנו.</p>
              </div>
            </section>

            <section>
              <h2 className="mb-5 flex items-center gap-2 text-lg font-black text-[#20211f]">
                <span style={{ color: RAIL.accent }}>
                  <IconRoute className="h-4 w-4" />
                </span>
                השבועות
              </h2>

              {weeks.length ? (
                <ol>
                  {weeks.map((week, index) => (
                    <WeekNode
                      key={week.week}
                      week={week}
                      index={index}
                      currentWeek={currentWeek}
                      hasNext={index < weeks.length - 1 || nextMonthAhead}
                    />
                  ))}
                  {nextMonthAhead ? (
                    <li
                      className="rise grid grid-cols-[32px_1fr] gap-x-3 sm:grid-cols-[36px_1fr] sm:gap-x-4"
                      style={{ animationDelay: `${180 + weeks.length * 110}ms` }}
                    >
                      <div className="flex flex-col items-center">
                        <span
                          aria-hidden
                          className="flex h-7 w-7 items-center justify-center rounded-full border bg-white"
                          style={{ borderColor: RAIL.border }}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ background: RAIL.accent }} />
                        </span>
                      </div>
                      <div className="min-w-0 pb-2">
                        <MonthAhead horizon={strategy.horizon} onReady={setStrategy} tone="quiet" />
                      </div>
                    </li>
                  ) : null}
                </ol>
              ) : (
                <p className="rounded-lg border border-[#e6e4dc] bg-white px-4 py-3 text-sm text-[#5e6159]">
                  אין עדיין חלוקה שבועית לתוכנית הזו.
                </p>
              )}
            </section>

            <details className="group border-b border-[#deddd8] pb-5">
              <summary className="flex cursor-pointer list-none items-center gap-2 py-2 text-sm font-bold text-[#62635f] hover:text-[#20211f]">
                <IconCompass className="h-4 w-4 transition-transform duration-300 group-open:rotate-45" />
                למה בכיוון הזה
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
                          <span className="font-bold text-[#20211f]">
                            {event.date} · {event.name}
                          </span>
                          {" — "}
                          {event.business_relevance}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </details>

            <div className="flex flex-col items-start gap-2 border-t border-[#deddd8] pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[#747570]">
                הפוסטים מוכנים.{" "}
                <Link href="/decisions" className="underline underline-offset-4">
                  לשינוי ההחלטות
                </Link>
              </p>
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

/**
 * One week on the rail.
 *
 * The marker column is exactly as tall as the row, so the thin rule that follows the
 * marker meets the next marker without a seam; the last node simply draws no rule, so
 * the rail stops where the month does.
 */
function WeekNode({
  week,
  index,
  currentWeek,
  hasNext,
}: {
  week: WeeklyBreakdownItem;
  index: number;
  currentWeek: number | null;
  hasNext: boolean;
}) {
  const isNow = currentWeek === week.week;
  const isPast = currentWeek !== null && week.week < currentWeek;
  const hasDetails = Boolean(
    week.what_we_do?.length ||
      week.what_user_does?.length ||
      week.metrics_target?.length ||
      week.media_distribution
  );

  return (
    <li
      className="rise grid grid-cols-[32px_1fr] gap-x-3 sm:grid-cols-[36px_1fr] sm:gap-x-4"
      style={{ animationDelay: `${180 + index * 110}ms` }}
    >
      <div className="flex flex-col items-center">
        <span
          className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
            isNow ? "ring-pulse" : ""
          }`}
          style={isNow ? { color: RAIL.accent } : undefined}
        >
          <span
            aria-hidden
            className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold ${
              isNow
                ? "text-white"
                : isPast
                  ? "border-[#c7c4b7] bg-[#f0eee6] text-[#747570]"
                  : "border-[#dedcd8] bg-white text-[#5e6159]"
            }`}
            style={isNow ? { background: RAIL.accent, borderColor: RAIL.accent } : undefined}
          >
            {week.week}
          </span>
        </span>
        {hasNext ? (
          <span
            aria-hidden
            className="mt-1 w-px flex-1"
            style={{ background: isPast ? "#c7c4b7" : "#e6e4dc" }}
          />
        ) : null}
      </div>

      <div className="min-w-0 pb-6">
        {/* Only the week you are in is marked, with the section's tint rather than a border:
            the rail already says where you are, so a box around every week is noise. */}
        <div
          className="rounded-lg px-4 py-4 sm:px-5"
          style={isNow ? { background: RAIL.surface } : undefined}
        >
          {/* The numbered marker on the rail is the week's only label: "שבוע 2" beside the
              circle said the same thing twice, and rule 7 counts both. The aria-label puts
              the number back for a screen reader without printing it twice. */}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h3
              className="text-base font-black leading-7 text-[#20211f]"
              aria-label={`שבוע ${week.week}: ${week.focus}`}
            >
              {week.focus}
            </h3>
            {isNow ? (
              <span
                className="label-mark text-white"
                style={{ background: RAIL.accent, borderColor: RAIL.accent }}
              >
                עכשיו
              </span>
            ) : null}
          </div>

          {/* The marker and the focus are the rail; the four lists that explain the week —
              what we do, what we need from the owner, what we measure and where we publish —
              are one tap down, so four weeks stay scannable instead of forty lines. */}
          {hasDetails ? (
            <details
              className="group mt-2 border-t"
              style={{ borderColor: isNow ? RAIL.border : "#e6e4dc" }}
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 py-2 text-xs font-bold text-[#5e6159] hover:text-[#20211f]">
                <Caret />
                מה עושים ומה צריך
              </summary>

              <div className="mt-1 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {week.what_we_do?.length ? (
                  <div>
                    <p className="text-[11px] font-bold text-[#8b8e84]">מה אנחנו עושים</p>
                    <ul className="mt-1.5 space-y-1">
                      {week.what_we_do.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm leading-6 text-[#3c3e3a]">
                          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b3b0a5]" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {week.what_user_does?.length ? (
                  <div>
                    <p className="text-[11px] font-bold" style={{ color: RAIL.accent }}>
                      מה צריך מכם
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {week.what_user_does.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm leading-6 text-[#3c3e3a]">
                          <span
                            aria-hidden
                            className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: RAIL.accent }}
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              {week.metrics_target?.length || week.media_distribution ? (
                <div className="mt-2 flex flex-col gap-1.5 border-t pt-2 sm:flex-row sm:flex-wrap sm:gap-x-6" style={{ borderColor: "#e6e4dc" }}>
                  {week.metrics_target?.length ? (
                    <p className="flex items-start gap-2 text-xs leading-5 text-[#5e6159]">
                      <IconEye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8b8e84]" />
                      <span>
                        <span className="font-bold text-[#3c3e3a]">מה מודדים: </span>
                        {week.metrics_target.join(" · ")}
                      </span>
                    </p>
                  ) : null}
                  {week.media_distribution ? (
                    <p className="flex items-start gap-2 text-xs leading-5 text-[#5e6159]">
                      <IconMegaphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8b8e84]" />
                      <span>
                        <span className="font-bold text-[#3c3e3a]">איפה מפרסמים: </span>
                        {week.media_distribution}
                      </span>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </details>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * The disclosure caret, drawn as a CSS triangle rather than a "▾" glyph: rule 7 counts
 * `main.innerText`, and a text glyph would be counted as a word on every closed expand.
 */
function Caret() {
  return (
    <span
      aria-hidden
      className="h-0 w-0 shrink-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-[#8b8e84] transition-transform duration-200 group-open:rotate-180"
    />
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
