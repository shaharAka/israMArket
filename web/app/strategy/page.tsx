"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingMark } from "@/components/Doodles";
import { MonthAhead } from "@/components/MonthAhead";
import { MonthBuildProgress } from "@/components/MonthBuildProgress";
import { QuarterPlanView } from "@/components/plan/QuarterPlanView";
import { RecommendationReview } from "@/components/results/RecommendationReview";
import { HypothesisStatusLine, reviewByKey, reviewFor } from "@/components/plan/HypothesisStatusLine";
import { SegmentedControl, TransitionPanel } from "@/components/design/Controls";
import { SectionHeader } from "@/components/SectionHeader";
import { StepLink } from "@/components/trial/StepLink";
import {
  ApiError,
  endpoints,
  type Business,
  type LongHorizonMilestone,
  type StrategyPayload,
  type WeeklyBreakdownItem,
} from "@/lib/api";
import { mockStoredPlan } from "@/lib/draft";
import { markSeen, nextStep, useTrial } from "@/lib/trial";
import { NextStepAction } from "@/components/trial/TrialGuide";
import { SECTIONS } from "@/lib/sections";
import { IconArrowLeft, IconBell, IconCalendar, IconChevron, IconEye, IconFlag, IconMegaphone } from "@/lib/icons";
import { toast } from "@/lib/ui";
import styles from "./strategy.module.css";

/**
 * התוכנית — the 3-month plan, the month and the quarter on one page.
 *
 * A business built at /start arrives here right after signup (Revision 5): the plan the
 * owner saw and shaped before the email is on the page at once, and the first month is
 * built from it underneath, stage by stage, while they read. So this page renders with no
 * month yet; the server builds it in the background (one job per business, whether or
 * not this page stays open) and the page only shows its progress (MonthBuildProgress).
 *
 * Once there is a month, it leads for a returning owner (it is what they act on) and the
 * 3-month plan follows as a reference, its later sections folded to one line each. On the
 * first visit the plan leads. The month itself leads with its answer (UI-RULES rule 2),
 * drawn as the plan sheet from the landing page: the hypothesis, how we will know, and what
 * we need from the owner (the page's one sun highlight); the four weeks are one calm list,
 * each row its own expand. The page keeps exactly one filled button, `השבוע בתוכנית`, in
 * its footer beside the calendar.
 *
 * The direction, intended audience and assumptions are editable at /strategy/edit.
 * The business inputs remain editable at /decisions. A business without a stored plan (built before Revision
 * 5) sees the month and the quarter as before.
 */

const TONE = SECTIONS.strategy;

/** A text action (DESIGN-STANDARD §4): the one blue, 600, underline only on hover. */
const TEXT_ACTION =
  "inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[color:var(--primary)] underline-offset-4 hover:underline";

/** A label over a group of details: 12px, 600, muted. */
const LABEL = "text-xs font-semibold text-[color:var(--ink-muted)]";

/** Which plan week today falls in, or null when today is outside the plan's month. */
function currentWeekOf(strategy: StrategyPayload): number | null {
  const now = new Date();
  if (now.getFullYear() !== strategy.year || now.getMonth() + 1 !== strategy.month) return null;
  return Math.min(4, Math.ceil(now.getDate() / 7));
}

export default function StrategyPage() {
  const { payload: trial } = useTrial();
  const firstAction = trial && !trial.ended ? nextStep(trial) : null;
  const [strategy, setStrategy] = useState<StrategyPayload | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [welcome, setWelcome] = useState(false);
  // null until the owner picks: then the default below (the month leads for a returning owner).
  const [planRange, setPlanRange] = useState<string | null>(null);

  function loadStrategy() {
    return endpoints
      .strategy()
      .then((payload) => {
        setStrategy(payload);
        setError("");
      })
      .catch((err: unknown) => {
        // 404: no month yet. That is expected right after /start, not an error.
        if (err instanceof ApiError && err.status === 404) return;
        setError(err instanceof Error ? err.message : "לא הצלחנו לטעון את התוכנית.");
      });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setWelcome(new URLSearchParams(window.location.search).get("welcome") === "1"), 0);
    // The free month's first step is reading this page; after the first research it is
    // also "adjust the plan" (Revision 7 B). Guidance only: it never blocks the page.
    markSeen("plan");
    Promise.all([
      loadStrategy(),
      endpoints
        .business()
        .then((res) => setBusiness(res.business))
        .catch(() => {}),
    ]).finally(() => setLoaded(true));
    return () => window.clearTimeout(timer);
  }, []);

  const plan = strategy?.quarter_plan ?? business?.quarter_plan ?? mockStoredPlan();
  const needsMonth = Boolean(business && !business.onboarding_complete && !strategy);

  // `/plan` and the hub link land on `#quarter`, but the section only exists once the
  // plan has loaded — the browser's own jump to the fragment has already happened by then.
  const hasStrategy = Boolean(strategy);
  useEffect(() => {
    if (!hasStrategy || window.location.hash !== "#quarter") return;
    const frame = requestAnimationFrame(() => document.getElementById("quarter")?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [hasStrategy]);

  const accent = TONE.accent;
  // The plan leads on the welcome visit and while there is no month; once there is a month
  // it leads for a returning owner (it is what they act on), the plan one tap away.
  const range = planRange ?? (welcome || !strategy ? "quarter" : "month");

  const planView = plan ? (
    <section aria-labelledby="quarter-plan-heading" className="space-y-6">
      <h2 id="quarter-plan-heading" className="sr-only">הכיוון והצעדים הקרובים</h2>
      <QuarterPlanView plan={plan} mode="app" accent={accent} navTop="top-14 md:top-0" review={strategy?.hypothesis_review} />

    </section>
  ) : null;

  // The page's one filled button: the free month's next step, or this week of the plan.
  const nextAction = firstAction ? (
    <div className="w-full space-y-3">
      <p className="text-base font-semibold">הצעד הקרוב: {firstAction.title_he}</p>
      <p className="max-w-xl text-sm leading-6 text-[color:var(--ink-soft)]">{firstAction.why_he}</p>
      <NextStepAction step={firstAction} />
    </div>
  ) : strategy ? (
    <Link href="/dashboard" className="drawn-button group inline-flex min-h-12 items-center gap-2 bg-[var(--primary)] px-6 text-[15px] text-white hover:bg-[var(--primary-dark)]">
      השבוע בתוכנית
      <IconArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  ) : null;
  // Right after signup the one action leads, under the title, not two screens down.
  const actionOnTop = welcome && Boolean(plan);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <SectionHeader
          section="plan"
          eyebrow={null}
          title={business?.name ? `התוכנית של ${business.name}` : "התוכנית"}
          action={
            loaded && (plan || strategy) ? (
              <div className="flex flex-wrap items-center gap-3">
                {plan && strategy ? <div className={styles.range}>
                  <SegmentedControl label="מבט על התוכנית" value={range} onChange={setPlanRange} options={[{ value: "quarter", label: "התמונה הרחבה" }, { value: "month", label: strategy.month_name_he }]} />
                </div> : null}
                <Link href="/strategy/edit" className={TEXT_ACTION}>לערוך את התוכנית</Link>
              </div>
            ) : undefined
          }
        />
        {/* The suggestion the owner came to check: one line under the title, detail on demand. */}
        {loaded ? <RecommendationReview planId={strategy?.id} /> : null}
        {Object.keys(business?.owner_context?.pending_links ?? {}).length ? (
          <p className="mb-8 flex items-start gap-3 rounded-xl bg-[var(--sand)] px-4 py-3 text-[13px] leading-6 text-[color:var(--ink)]">
            <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--sun)]" />
            <span>
              התוכנית מוכנה. נשארו קישורים שלא יכולנו לקרוא.{" "}
              <Link href="/integrations#pending-links" className="font-semibold text-[color:var(--sand-dark)] underline-offset-4 hover:underline">
                לתקן בהמשך בחיבורים
              </Link>
            </span>
          </p>
        ) : null}

        {error ? (
          <p className="mb-6 rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm leading-6 text-[var(--danger)]">{error}</p>
        ) : null}

        {!loaded ? <LoadingMark label="טוענים את התוכנית…" /> : null}

        {loaded ? (
          <div className="space-y-10 pb-2">
            {actionOnTop ? (
              <div className="space-y-5">
                <p className="text-[15px] leading-7 text-[color:var(--ink-soft)]">התוכנית שבניתם יחד איתנו שמורה, ומכאן נעבוד לפיה. אין צורך לחבר את כל הכלים כדי להתחיל.</p>
                {nextAction}
              </div>
            ) : null}
            {/* Arrived from /start with the plan and no month yet: the server builds it now. */}
            {needsMonth ? (
              <MonthBuildProgress
                autoStart
                onDone={() => {
                  toast("התוכנית של החודש מוכנה");
                  void loadStrategy();
                }}
              />
            ) : null}
            {plan && !strategy && !needsMonth && !error ? <NoMonthYet /> : null}
            <TransitionPanel transitionKey={range}>
              {plan && (range === "quarter" || !strategy) ? planView : strategy ? <MonthSection strategy={strategy} setStrategy={setStrategy} showQuarter={!plan} /> : null}
            </TransitionPanel>
            {!plan && !strategy && !needsMonth && !error ? (
              <p className="paper px-5 py-4 text-[15px] text-[color:var(--ink-soft)]">
                עוד אין תוכנית.{" "}
                <Link href="/onboarding" className="font-semibold text-[color:var(--primary)] underline-offset-4 hover:underline">
                  לבנות אותה
                </Link>
              </p>
            ) : null}
            {/* The page's one filled button, beside the calendar that belongs to the plan. */}
            <footer className="flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-[var(--rule)] pt-8">
              {actionOnTop ? null : nextAction}
              <Link href="/calendar" className={TEXT_ACTION}>
                <IconCalendar className="h-[18px] w-[18px]" />
                לוח התוכנית · פוסטים ומשימות
              </Link>
            </footer>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

/** The plan is here and this month is not (yet): say so, and where it sits in the month. */
function NoMonthYet() {
  return (
    <div className="paper px-5 py-4 text-[15px] leading-7 text-[color:var(--ink-soft)] sm:px-6">
      <p>
        <b className="font-semibold text-[color:var(--ink)]">החודש עוד לא מוכן. </b>
        בונים את צעדי העבודה מתוך התוכנית. בוחרים מה לקדם ומוסיפים חומרים, ואז כותבים פוסטים לאישור שלכם.
      </p>
      <StepLink stepKey={["start_posts", "approve_first"]} />
    </div>
  );
}

/** This month: the goal, what we need from the owner, the four weeks, and the next post. */
function MonthSection({
  strategy,
  setStrategy,
  showQuarter,
}: {
  strategy: StrategyPayload;
  setStrategy: (s: StrategyPayload) => void;
  /** The old quarter block, for a business with no stored 3-month plan. */
  showQuarter: boolean;
}) {
  const weeks = strategy.weekly_breakdown || strategy.roadmap?.weekly_breakdown || [];
  const events = strategy.relevant_events || strategy.roadmap?.relevant_events || [];
  const monthly = strategy.monthly_horizon_plan || strategy.roadmap?.monthly_horizon_plan;
  const horizon = strategy.long_horizon_plan || strategy.roadmap?.long_horizon_plan;
  // The API uses {} for a plan without later milestones; it is truthy in JavaScript.
  const quarter = Array.isArray(horizon?.milestones) ? horizon : null;
  const management = strategy.management_and_checkpoints || strategy.roadmap?.management_and_checkpoints;
  const nextUserAction = weeks.flatMap((week) => week.what_user_does || []).find(Boolean);
  const currentWeek = currentWeekOf(strategy);
  // Where the hypothesis and each target stand (docs/posts-v2.md, Phase C), from the
  // server's review. Shown under the line it belongs to, only while its text is the one here.
  const review = reviewByKey(strategy.hypothesis_review);
  const shownTargets = (monthly?.targets ?? []).slice(0, 3);
  const targetStates = shownTargets.map((target, index) => reviewFor(review, `target:${index}`, target));
  const monthState = monthly?.hypothesis ? reviewFor(review, "month", monthly.hypothesis) : null;
  // The month follows its one measurable target: its line is already right below, once.
  const monthEvidence =
    monthState && !targetStates.some((state) => state?.evidence_he === monthState.evidence_he)
      ? monthState.evidence_he
      : undefined;

  return (
    <div className="rise-stagger space-y-10">
      {/* The month's hypothesis leads, as the plan sheet: the test, how we will know, and the
          one thing we need from the owner. */}
      <section className={styles.sheet} aria-labelledby="month-hypothesis">
        <div className={styles.sheetBody}>
          <p className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--ink-muted)]">
            <IconFlag className="h-4 w-4" />
            ההשערה שנבדוק ב{strategy.month_name_he}
          </p>
          <h2 id="month-hypothesis" className={styles.hypothesis}>
            {monthly?.hypothesis || strategy.usp.growth_hypothesis || strategy.usp.usp}
          </h2>
          {monthState ? (
            <HypothesisStatusLine
              className="mt-2"
              status={monthState.status}
              statusHe={monthState.status_he}
              evidence={monthEvidence}
            />
          ) : null}
          {shownTargets.length ? (
            <ul className={styles.targets}>
              {shownTargets.map((target, index) => {
                const state = targetStates[index];
                return (
                  <li key={target}>
                    <span aria-hidden className={styles.ring} />
                    <div className="min-w-0">
                      {target}
                      {state ? (
                        <HypothesisStatusLine
                          className="mt-0.5"
                          status={state.status}
                          statusHe={state.status_he}
                          evidence={state.evidence_he}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        <div className={styles.ask}>
          <IconBell className={styles.askIcon} />
          <p>
            <strong>מה צריך מכם: </strong>
            {nextUserAction || "כרגע כלום. אנחנו ממשיכים לעבוד."}
          </p>
        </div>
      </section>

      <section aria-labelledby="weeks-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4">
          <h2 id="weeks-heading" className="text-lg font-bold tracking-tight text-[color:var(--ink)]">
            השבועות
          </h2>
          <Link href="/posts" className={`group ${TEXT_ACTION}`}>
            לבדוק את הפוסט הבא
            <IconArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5 motion-reduce:transition-none" />
          </Link>
        </div>
        {weeks.length ? (
          <ol className={styles.list}>
            {weeks.map((week) => (
              <WeekRow key={week.week} week={week} currentWeek={currentWeek} />
            ))}
            {strategy.horizon ? (
              <li className="px-5 sm:px-6">
                <MonthAhead horizon={strategy.horizon} onReady={setStrategy} tone="quiet" variant="line" />
              </li>
            ) : null}
          </ol>
        ) : (
          <p className="paper px-5 py-4 text-[15px] text-[color:var(--ink-soft)]">
            עדיין אין לתוכנית הזו חלוקה לשבועות.
          </p>
        )}
      </section>

      {showQuarter ? (
        <section id="quarter" className="scroll-mt-24">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-lg font-bold tracking-tight text-[color:var(--ink)]">הצעדים הבאים</h2>
            {quarter?.milestones.length ? <p className="text-[13px] text-[color:var(--ink-muted)]">{quarter.milestones.map(milestone => milestone.month_label).join(" · ")}</p> : null}
          </div>
          {quarter ? (
            <>
              <p className="mt-2 text-[15px] leading-7 text-[color:var(--ink-soft)]">{quarter.hypothesis}</p>
              <ol className={`mt-4 ${styles.list}`}>
                {quarter.milestones.map((milestone, index) => (
                  <MonthRow key={`${milestone.month_label}-${index}`} milestone={milestone} index={index} />
                ))}
              </ol>
            </>
          ) : (
            <p className="mt-2 text-[15px] leading-7 text-[color:var(--ink-soft)]">
              עדיין אין כיוון להמשך התוכנית.{" "}
              <Link href="/onboarding" className="font-semibold text-[color:var(--primary)] underline-offset-4 hover:underline">
                לבנות אותה
              </Link>
            </p>
          )}
        </section>
      ) : (
        <span id="quarter" className="block scroll-mt-24" />
      )}

      {/* The month's reasoning, one expand on its last line, beside the way to change what
          the plan is built on. */}
      <div className="-mt-4! flex items-start justify-between gap-4">
        <details className="group min-w-0 flex-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[color:var(--ink-soft)] transition-colors hover:text-[color:var(--ink)] [&::-webkit-details-marker]:hidden">
            למה ככה, ומתי נצטרך אתכם
            <Chevron />
          </summary>
          <div className="space-y-6 pt-3 pb-2 text-sm leading-6 text-[color:var(--ink-soft)]">
            <div>
              <p className={LABEL}>המסר המרכזי בפוסטים</p>
              <p className="mt-1.5 text-[15px] leading-7 text-[color:var(--ink)]">{strategy.usp.usp_one_liner}</p>
            </div>
            {events.length ? (
              <div>
                <p className={`flex items-center gap-2 ${LABEL}`}>
                  <IconCalendar className="h-4 w-4" />
                  המועדים שלקחנו בחשבון
                </p>
                <ul className="mt-2 space-y-2">
                  {events.slice(0, 4).map((event) => (
                    <li key={`${event.date}-${event.name}`}>
                      <span className="font-semibold text-[color:var(--ink)]">
                        <span className="tabular-nums">{event.date}</span> · {event.name}
                      </span>
                      {": "}
                      {event.business_relevance}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <QuarterDetails targets={quarter?.targets || []} management={management} />
          </div>
        </details>
        <Link href="/decisions" className="inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-[color:var(--ink-muted)] underline-offset-4 transition-colors hover:text-[color:var(--primary)] hover:underline">
          לשנות את ההחלטות
        </Link>
      </div>
    </div>
  );
}

/**
 * One week, as one row. The row itself is the expand: the marker and the week's focus are
 * the face, and the four lists that explain the week — what we do, what we need from the
 * owner, what we measure and where we publish — open underneath. A separate "פירוט" line
 * under every week doubled the height of the list for a label that said nothing.
 */
function WeekRow({ week, currentWeek }: { week: WeeklyBreakdownItem; currentWeek: number | null }) {
  const isNow = currentWeek === week.week;
  const isPast = currentWeek !== null && week.week < currentWeek;
  const hasDetails = Boolean(
    week.what_we_do?.length ||
      week.what_user_does?.length ||
      week.metrics_target?.length ||
      week.media_distribution
  );

  const face = (
    <>
      <span aria-hidden className={styles.num} data-state={isNow ? "now" : isPast ? "past" : undefined}>
        {week.week}
      </span>
      <span className={`min-w-0 flex-1 text-[15px] leading-6 sm:text-base ${isPast ? "font-medium text-[color:var(--ink-soft)]" : "font-semibold text-[color:var(--ink)]"}`}>
        <span className="sr-only">שבוע {week.week}: </span>
        {week.focus}
      </span>
      {isNow ? <span className="shrink-0 text-xs font-semibold text-[color:var(--sand-dark)]">השבוע</span> : null}
    </>
  );

  if (!hasDetails) {
    return <li className={styles.row}>{face}</li>;
  }

  return (
    <li>
      <details className="group">
        <summary className={styles.row}>
          {face}
          <Chevron />
        </summary>

        <div className={styles.detail}>
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {week.what_we_do?.length ? (
              <DetailList title="מה אנחנו עושים" items={week.what_we_do} />
            ) : null}
            {week.what_user_does?.length ? (
              <DetailList title="מה צריך מכם" items={week.what_user_does} accent />
            ) : null}
          </div>

          {week.metrics_target?.length || week.media_distribution ? (
            <div className="mt-5 flex flex-col gap-2 border-t border-[var(--rule)] pt-4 sm:flex-row sm:flex-wrap sm:gap-x-8">
              {week.metrics_target?.length ? (
                <p className="flex items-start gap-2 text-[13px] leading-6 text-[color:var(--ink-soft)]">
                  <IconEye className="mt-1 h-4 w-4 shrink-0 text-[color:var(--ink-muted)]" />
                  <span>
                    <span className="font-semibold text-[color:var(--ink)]">מה מודדים: </span>
                    {week.metrics_target.join(" · ")}
                  </span>
                </p>
              ) : null}
              {week.media_distribution ? (
                <p className="flex items-start gap-2 text-[13px] leading-6 text-[color:var(--ink-soft)]">
                  <IconMegaphone className="mt-1 h-4 w-4 shrink-0 text-[color:var(--ink-muted)]" />
                  <span>
                    <span className="font-semibold text-[color:var(--ink)]">איפה מפרסמים: </span>
                    {week.media_distribution}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </details>
    </li>
  );
}

function DetailList({ title, items, accent = false }: { title: string; items: string[]; accent?: boolean }) {
  return (
    <div>
      <p className={`text-xs font-semibold ${accent ? "text-[color:var(--primary)]" : "text-[color:var(--ink-muted)]"}`}>{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-[15px] leading-6 text-[color:var(--ink)]">
            <span aria-hidden className={`mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full ${accent ? "bg-[var(--primary)]" : "bg-[var(--ink-faint)]"}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One month of the quarter. A real `month_label` is a sentence (8-10 words) that already
 * says what the month is for, so it is the face and the milestone opens under it. A bare
 * month name ("ספטמבר") says nothing on its own, so then the milestone joins it on the face.
 */
function MonthRow({ milestone, index }: { milestone: LongHorizonMilestone; index: number }) {
  const bareLabel = milestone.month_label.trim().split(/\s+/).length <= 3;
  const hiddenMilestone = !bareLabel && milestone.milestone;
  const hasBody = Boolean(hiddenMilestone || milestone.checkpoint);

  const face = (
    <>
      <span aria-hidden className={styles.num}>
        {index + 1}
      </span>
      <span className="min-w-0 flex-1 text-[15px] leading-6 text-[color:var(--ink)]">
        <span className="font-semibold">{milestone.month_label}</span>
        {bareLabel && milestone.milestone ? (
          <span className="text-[color:var(--ink-soft)]">
            {" · "}
            {milestone.milestone}
          </span>
        ) : null}
      </span>
    </>
  );

  if (!hasBody) return <li className={styles.row}>{face}</li>;

  return (
    <li>
      <details className="group">
        <summary className={styles.row}>
          {face}
          <Chevron />
        </summary>
        <div className={`space-y-1.5 text-[15px] leading-7 ${styles.detail}`}>
          {hiddenMilestone ? <p className="font-semibold text-[color:var(--ink)]">{milestone.milestone}</p> : null}
          {milestone.checkpoint ? (
            <p className="text-[color:var(--ink-soft)]">
              <span className="font-semibold text-[color:var(--ink)]">איך נדע שהצלחנו: </span>
              {milestone.checkpoint}
            </p>
          ) : null}
        </div>
      </details>
    </li>
  );
}

function QuarterDetails({
  targets,
  management,
}: {
  targets: string[];
  management: StrategyPayload["management_and_checkpoints"];
}) {
  return (
    <div className="space-y-6 text-sm leading-6 text-[color:var(--ink)]">
      {targets.length ? (
        <div>
          <p className={LABEL}>יעדי העבודה, לפי סדר חשיבות</p>
          <ol className="mt-2 space-y-1.5">
            {targets.map((target, index) => (
              <li key={`${target}-${index}`} className="flex items-start gap-2.5 text-[15px] leading-6">
                <span className="w-4 shrink-0 font-semibold tabular-nums text-[color:var(--primary)]">
                  {index + 1}.
                </span>
                {target}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {management?.how_we_help ? (
        <div>
          <p className={LABEL}>מה אנחנו עושים</p>
          <p className="mt-1.5 text-[15px] leading-7">{management.how_we_help}</p>
        </div>
      ) : null}

      {management?.when_we_need_user?.length || management?.checkpoints?.length ? (
        <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {management?.when_we_need_user?.length ? (
            <div>
              <p className={LABEL}>מתי נצטרך אתכם</p>
              <ul className="mt-2 space-y-1.5">
                {management.when_we_need_user.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex items-start gap-2.5 text-[13px] leading-6">
                    <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ink-faint)]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {management?.checkpoints?.length ? (
            <div>
              <p className={LABEL}>מתי בודקים</p>
              <ul className="mt-2 space-y-3">
                {management.checkpoints.map((checkpoint, index) => (
                  <li key={`${checkpoint.timing}-${index}`} className="text-[13px] leading-6">
                    <span className="font-semibold text-[color:var(--ink)]">{checkpoint.timing}</span>
                    <span className="text-[color:var(--ink-soft)]">
                      {": "}
                      {checkpoint.purpose}
                    </span>
                    {checkpoint.user_action ? (
                      <span className="block">
                        <span className="font-semibold">מה צריך מכם: </span>
                        {checkpoint.user_action}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The disclosure chevron (DESIGN-STANDARD §4): the real icon, pointing down and turning up
 * once its `group` opens. An icon, not a "▾" glyph: rule 7 counts `main.innerText`.
 */
function Chevron() {
  return (
    <IconChevron className="h-[18px] w-[18px] shrink-0 -rotate-90 text-[color:var(--ink-muted)] transition-transform duration-200 ease-[cubic-bezier(.2,.7,.2,1)] group-open:rotate-90 motion-reduce:transition-none" />
  );
}
