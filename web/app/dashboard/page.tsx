"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingMark } from "@/components/Doodles";
import { MonthAhead } from "@/components/MonthAhead";
import { SectionHeader } from "@/components/SectionHeader";
import { SetupChecklist } from "@/components/SetupChecklist";
import { endpoints, type Business, type RecommendationPayload, type StrategyPayload } from "@/lib/api";
import { formatNis, stageFor } from "@/lib/budget";
import { SECTIONS } from "@/lib/sections";
import { IconArrowLeft, IconCheck, IconImage } from "@/lib/icons";

/** Which plan week today falls in, or null when today is outside the plan's month. */
function currentWeekOf(strategy: StrategyPayload): number | null {
  const now = new Date();
  if (now.getFullYear() !== strategy.year || now.getMonth() + 1 !== strategy.month) return null;
  return Math.min(4, Math.ceil(now.getDate() / 7));
}

/**
 * The cockpit.
 *
 * This page is the one screen the owner opens without being asked to do something, so it
 * leads with the single pending decision and keeps everything else as scannable tiles
 * rather than another column of prose. Exactly one button here is dark — `לבדוק ולאשר` —
 * because the flow is waiting on that post. The setup card is guidance and the next-month
 * card is context, so both are outline; neither is what this page is asking for.
 */
export default function DashboardPage() {
  const [business, setBusiness] = useState<Business | null>(null);
  const [strategy, setStrategy] = useState<StrategyPayload | null>(null);
  const [recommendation, setRecommendation] = useState<RecommendationPayload | null>(null);

  useEffect(() => {
    Promise.all([endpoints.business(), endpoints.strategy()]).then(([businessResult, strategyResult]) => {
      setBusiness(businessResult.business);
      setStrategy(strategyResult);
    });
    endpoints.recommendations().then(setRecommendation).catch(() => {});
  }, []);

  const posts = strategy?.roadmap?.posts || [];
  const nextIndex = posts.findIndex((post) => post.approval_status !== "approved");
  const reviewIndex = nextIndex >= 0 ? nextIndex : 0;
  const nextPost = posts[reviewIndex];
  const approvedCount = posts.filter((post) => post.approval_status === "approved").length;
  const monthly = strategy?.monthly_horizon_plan || strategy?.roadmap?.monthly_horizon_plan;
  const weeks = strategy?.weekly_breakdown || strategy?.roadmap?.weekly_breakdown || [];
  const nextUserAction = weeks.flatMap((week) => week.what_user_does || []).find(Boolean);
  const allApproved = posts.length > 0 && approvedCount === posts.length;
  const currentWeek = strategy ? currentWeekOf(strategy) : null;

  const quarterPlan = strategy?.long_horizon_plan || strategy?.roadmap?.long_horizon_plan;
  const leadingTarget = quarterPlan?.targets?.[0];
  const budget = business?.monthly_budget_ils ?? 0;
  const budgetStage = stageFor(budget);
  const identity = SECTIONS.dashboard;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          section="dashboard"
          title="החודש שלך"
          subtitle={`${business?.name ? `${business.name} · ` : ""}${
            strategy ? `${strategy.month_name_he} ${strategy.year}` : "החודש הנוכחי"
          } — אנחנו מנהלים את השיווק. כאן תראו רק מה מתקדם ומה דורש החלטה שלכם.`}
        />

        {strategy ? (
          <div className="rise-stagger space-y-6">
            {/* The single pending decision leads the page. */}
            <section className="overflow-hidden rounded-lg border border-[#cecdc7] bg-white">
              <div className="flex items-center justify-between border-b border-[#e9e8e3] px-5 py-3">
                <p className="text-xs font-bold text-[#747570]">
                  {allApproved ? "הכול אושר" : "הדבר היחיד שצריך מכם עכשיו"}
                </p>
                {posts.length ? (
                  <span className="text-[11px] font-bold text-[#8b8e84]">
                    {approvedCount}/{posts.length} אושרו
                  </span>
                ) : null}
              </div>

              {allApproved ? (
                <div className="flex items-start gap-3 p-5 sm:items-center sm:p-6">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#343632] text-white">
                    <IconCheck className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-lg font-black text-[#20211f]">הפוסטים של החודש אושרו</h2>
                    <p className="mt-1 text-sm leading-6 text-[#62635f]">
                      אנחנו ממשיכים לעקוב אחרי הביצועים ולהתאים את ההמשך.
                    </p>
                  </div>
                </div>
              ) : nextPost ? (
                <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-[128px_1fr_auto] md:items-center">
                  <div className="relative aspect-square overflow-hidden rounded-md bg-[#f0efeb]">
                    {nextPost.image_url ? (
                      <Image
                        src={nextPost.image_url}
                        alt={nextPost.title}
                        width={256}
                        height={256}
                        unoptimized
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-[#898a85]">
                        <IconImage className="h-6 w-6" />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#747570]">
                      פוסט {reviewIndex + 1} מתוך {posts.length} · {nextPost.date_hint}
                    </p>
                    <h2 className="mt-1 text-lg font-black text-[#20211f]">{nextPost.title}</h2>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#62635f]">{nextPost.caption}</p>
                  </div>
                  <Link
                    href={`/posts?i=${reviewIndex}`}
                    className="group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#20211f] px-5 text-sm font-bold text-white transition-colors hover:bg-[#343632] md:w-auto"
                  >
                    לבדוק ולאשר
                    <IconArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
                  </Link>
                </div>
              ) : (
                <p className="p-6 text-sm text-[#62635f]">אנחנו עדיין מכינים את התוכן לחודש.</p>
              )}
            </section>

            {/* At-a-glance tiles: each one links to the place that owns that decision. One
                container with hairline dividers rather than four equal-weight boxes. */}
            <section className="grid gap-px overflow-hidden rounded-lg border border-[#e6e4dc] bg-[#e6e4dc] sm:grid-cols-2 lg:grid-cols-4">
              <Tile label="מצב החודש" href="/posts" accent={identity.accent}>
                <span className="text-2xl font-black text-[#20211f]">
                  {approvedCount}
                  <span className="text-base font-bold text-[#8b8e84]">/{posts.length}</span>
                </span>
                <span className="mt-1 block text-xs text-[#747570]">פוסטים אושרו</span>
                <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-[#e1e0db]">
                  <span
                    className="block h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{
                      width: `${posts.length ? (approvedCount / posts.length) * 100 : 0}%`,
                      background: identity.accent,
                    }}
                  />
                </span>
              </Tile>

              <Tile label="היעד המוביל ברבעון" href="/plan" accent={SECTIONS.plan.accent}>
                {leadingTarget ? (
                  <span className="block text-sm font-bold leading-6 text-[#20211f]">{leadingTarget}</span>
                ) : (
                  <span className="block text-sm text-[#8b8e84]">עוד לא נבחרו יעדים</span>
                )}
              </Tile>

              <Tile label="תקציב חודשי" href="/decisions" accent={SECTIONS.decisions.accent}>
                <span className="text-2xl font-black text-[#20211f]">{formatNis(budget)}</span>
                <span className="mt-1 block text-xs text-[#747570]">{budgetStage.title}</span>
              </Tile>

              <Tile label="הדבר האחד השבוע" href="/recommendations" accent={SECTIONS.strategy.accent}>
                {recommendation?.suggestions?.suggestions?.[0] ? (
                  <>
                    <span className="block text-sm font-bold leading-6 text-[#20211f]">
                      {recommendation.suggestions.suggestions[0].title}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[#747570]">
                      {recommendation.suggestions.suggestions[0].action}
                    </span>
                  </>
                ) : (
                  <span className="block text-sm text-[#8b8e84]">נעדכן אחרי איסוף הנתונים</span>
                )}
              </Tile>
            </section>

            {/* What is still missing. Below the tiles on purpose: the pending post is the
                page's ask, the tiles are what is already true, and this is guidance for
                later — so it sits under both, still on the first screen. */}
            <SetupChecklist />

            {/* The month's reasoning and its weeks are one object, so they share one box and
                a hairline between them instead of two equal-weight rectangles. */}
            <section className="rounded-lg border border-[#e6e4dc] bg-white p-5 sm:p-6">
              <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:gap-0">
                <div>
                  <p className="text-xs font-bold text-[#747570]">הכיוון החודשי</p>
                  <h2 className="mt-2 text-xl font-black leading-8 text-[#20211f]">
                    {monthly?.hypothesis || strategy.usp.growth_hypothesis || strategy.roadmap.theme}
                  </h2>
                  {monthly?.targets?.length ? (
                    <ul className="mt-4 space-y-2 border-t border-[#e9e8e3] pt-4">
                      {monthly.targets.slice(0, 3).map((target, index) => (
                        <li key={`${target}-${index}`} className="flex items-start gap-2.5 text-sm leading-6 text-[#3c3e3a]">
                          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b3b0a5]" />
                          {target}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="border-t border-[#e9e8e3] pt-5 lg:border-s lg:border-t-0 lg:ps-6 lg:pt-0">
                  <p className="text-xs font-bold text-[#747570]">השבועות</p>
                  <ol className="mt-3 space-y-2.5">
                    {[1, 2, 3, 4].map((week) => {
                      const item = weeks.find((entry) => entry.week === week);
                      const isNow = currentWeek === week;
                      return (
                        <li key={week} className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                              isNow ? "text-white" : "border border-[#dedcd4] text-[#8b8e84]"
                            }`}
                            style={isNow ? { background: identity.accent } : undefined}
                          >
                            {week}
                          </span>
                          <span className="min-w-0 flex-1 text-sm leading-6">
                            <span className={isNow ? "font-bold text-[#20211f]" : "text-[#5e6159]"}>
                              {item?.focus || "—"}
                            </span>
                            {isNow ? (
                              <span className="mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: identity.surface, color: identity.accent }}>
                                השבוע
                              </span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
            </section>

            <section className="grid gap-6 border-y border-[#deddd8] py-6 sm:grid-cols-2">
              <div>
                <h2 className="text-sm font-black text-[#20211f]">אנחנו מטפלים עכשיו</h2>
                <ul className="mt-4 space-y-3">
                  <StatusRow text={`${posts.length} פוסטים נכתבו והותאמו לערוצים`} />
                  <StatusRow text="התוצאות נאספות ונבדקות לאורך החודש" />
                  <StatusRow text="התוכנית הבאה תותאם לפי מה שעובד" />
                </ul>
              </div>
              <div>
                <h2 className="text-sm font-black text-[#20211f]">צריך מכם</h2>
                <p className="mt-4 text-sm font-bold leading-7 text-[#20211f]">
                  {nextUserAction || "כרגע לא צריך לעשות דבר."}
                </p>
                <p className="mt-1 text-xs leading-5 text-[#747570]">
                  נבקש מכם משהו רק כשנדרש מידע שאי אפשר להסיק מהנתונים.
                </p>
              </div>
            </section>

            {/* Next month is context while this month is unapproved, so its build button
                is an outline rather than competing with `לבדוק ולאשר`. */}
            <MonthAhead horizon={strategy.horizon} onReady={setStrategy} tone="quiet" />
          </div>
        ) : (
          <LoadingMark label="אנחנו טוענים את מצב החודש…" />
        )}
      </div>
    </AppShell>
  );
}

/** One cell of the at-a-glance row. The dividers come from the container's 1px gap, so a
 *  tile draws no border of its own. */
function Tile({
  label,
  href,
  accent,
  children,
}: {
  label: string;
  href: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col bg-white p-4 transition-colors hover:bg-[#faf9f7]"
    >
      <span className="flex items-center gap-2">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
        <span className="text-[11px] font-bold text-[#747570]">{label}</span>
      </span>
      <span className="mt-3 flex-1">{children}</span>
    </Link>
  );
}

function StatusRow({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2.5 text-sm leading-6 text-[#62635f]">
      <IconCheck className="mt-1 h-4 w-4 shrink-0 text-[#343632]" />
      <span>{text}</span>
    </li>
  );
}
