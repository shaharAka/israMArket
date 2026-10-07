"use client";

import { useId, type ReactNode } from "react";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { HypothesisStatusLine, reviewByKey, reviewFor } from "./HypothesisStatusLine";
import type { StrategyPayload, WeeklyBreakdownItem } from "@/lib/api";
import { IconBell, IconChevron, IconFlag } from "@/lib/icons";
import styles from "./month-plan.module.css";

export type MonthPlanData = Pick<StrategyPayload, "weekly_breakdown" | "roadmap" | "monthly_horizon_plan" | "usp" | "month_name_he" | "hypothesis_review">;

/** Presentation shared with /strategy. Loading, trial routing and month-building stay in the page. */
export function MonthPlanOverview({ strategy, currentWeek, nextAction, weekAction, followingMonth }: {
  strategy: MonthPlanData;
  currentWeek: number | null;
  nextAction?: { title_he: string } | null;
  weekAction?: ReactNode;
  followingMonth?: ReactNode;
}) {
  const id = useId();
  const t = useCopy();
  const weeks = strategy.weekly_breakdown || strategy.roadmap?.weekly_breakdown || [];
  const monthly = strategy.monthly_horizon_plan || strategy.roadmap?.monthly_horizon_plan;
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

  return <div className={styles.overview}>
      {/* The month's hypothesis leads, as the plan sheet: the test, how we will know, and the
          one thing we need from the owner. */}
      <section className={styles.sheet} aria-labelledby={`${id}-hypothesis`}>
        <div className={styles.sheetBody}>
          <p className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--ink-muted)]">
            <IconFlag className="h-4 w-4" />
            {t("מה ננסה ב{arg_0}", { arg_0: strategy.month_name_he })}
          </p>
          <h2 id={`${id}-hypothesis`} className={styles.hypothesis}>
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
          {shownTargets.length ? <div className={styles.targetsGroup}>
            <p className={styles.targetsLabel}><Copy text="איך נדע שזה עובד" /></p>
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
          </div> : null}
        </div>
        {nextAction ? <div className={styles.ask}>
          <IconBell className={styles.askIcon} />
          <p>
            <strong><Copy text="מה צריך מכם:" />{" "}</strong>
            {nextAction.title_he}
          </p>
        </div> : null}
      </section>

      <section aria-labelledby={`${id}-weeks`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4">
          <h2 id={`${id}-weeks`} className="text-lg font-bold tracking-tight text-[color:var(--ink)]">
            <Copy text="מה עושים בכל שבוע" />
          </h2>
          {weekAction}
        </div>
        {weeks.length ? (
          <ol className={styles.list}>
            {weeks.map((week) => (
              <WeekRow key={week.week} week={week} currentWeek={currentWeek} />
            ))}
            {followingMonth}
          </ol>
        ) : (
          <p className="paper px-5 py-4 text-[15px] text-[color:var(--ink-soft)]">
            <Copy text="עדיין אין לתוכנית הזו חלוקה לשבועות." />
          </p>
        )}
      </section>

  </div>;
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
        <span className="sr-only"><Copy text="שבוע {arg_0}:" args={{ arg_0: week.week }} />{" "}</span>
        {week.focus}
      </span>
      {isNow ? <span className="shrink-0 text-xs font-semibold text-[color:var(--primary)]"><Copy text="השבוע" /></span> : null}
    </>
  );

  if (!hasDetails) {
    return <li className={styles.row}>{face}</li>;
  }

  const content = (
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
              <span>
                <span className="font-semibold text-[color:var(--ink)]"><Copy text="מה מודדים:" />{" "}</span>
                {week.metrics_target.join(" · ")}
              </span>
            </p>
          ) : null}
          {week.media_distribution ? (
            <p className="flex items-start gap-2 text-[13px] leading-6 text-[color:var(--ink-soft)]">
              <span>
                <span className="font-semibold text-[color:var(--ink)]"><Copy text="איפה מפרסמים:" />{" "}</span>
                {week.media_distribution}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  // This week's work is the main artifact, not optional detail to discover.
  if (isNow) return <li className={styles.currentWeek}>
    <div className={styles.row}>{face}</div>
    {content}
  </li>;

  return (
    <li>
      <details className="group">
        <summary className={styles.row}>
          {face}
          <Chevron />
        </summary>

        {content}
      </details>
    </li>
  );
}

function DetailList({ title, items, accent = false }: { title: string; items: string[]; accent?: boolean }) {
  return (
    <div>
      <p className={`text-xs font-semibold ${accent ? "text-[color:var(--primary)]" : "text-[color:var(--ink-muted)]"}`}><Copy text={title} /></p>
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

function Chevron() {
  return <IconChevron className="h-[18px] w-[18px] shrink-0 -rotate-90 text-[color:var(--ink-muted)] transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" />;
}
