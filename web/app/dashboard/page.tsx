"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { BillingReminder } from "@/components/billing/BillingReminder";
import { LoadingMark } from "@/components/Doodles";
import { PlanBrief } from "@/components/design/PlanBrief";
import { MonthAhead } from "@/components/MonthAhead";
import { MonthBuildProgress } from "@/components/MonthBuildProgress";
import { IconCamera } from "@/components/instagram/SourceLink";
import { SetupChecklist } from "@/components/SetupChecklist";
import { BidiText } from "@/components/start/ui";
import { LIFECYCLE_LABEL, lifecycleOf, postDay, postHref } from "@/components/today/posts";
import type { PostLifecycle } from "@/lib/api";
import { ContactLink } from "@/components/trial/StepLink";
import { allDoneText, minutesLabel, NextStepAction, TrialDay, TrialGuide } from "@/components/trial/TrialGuide";
import { HypothesisStatus, WeeklyBrief } from "@/components/trial/WeeklyBrief";
import {
  ApiError,
  endpoints,
  type Business,
  type InstagramBriefPayload,
  type RecommendationPayload,
  type RoadmapPost,
  type StrategyPayload,
} from "@/lib/api";
import { formatNis, stageFor } from "@/lib/budget";
import { IconArrowLeft, IconCheck, IconChevron, IconImage } from "@/lib/icons";
import { foundationsDone, loadTrial, nextStep, useTrial, type TrialPayload } from "@/lib/trial";

/** Which plan week today falls in, or null when today is outside the plan's month. */
function currentWeekOf(strategy: StrategyPayload): number | null {
  const now = new Date();
  if (now.getFullYear() !== strategy.year || now.getMonth() + 1 !== strategy.month) return null;
  return Math.min(4, Math.ceil(now.getDate() / 7));
}

/**
 * Whether next month is the natural next step: this month is fully approved, it is in its
 * last week, or it is already over. Before that, building next month is a distraction from
 * approving this one, so it waits inside "עוד על החודש".
 */
function monthNearlyDone(strategy: StrategyPayload, allApproved: boolean): boolean {
  if (allApproved) return true;
  const now = new Date();
  const planStart = new Date(strategy.year, strategy.month - 1, 1);
  const planEnd = new Date(strategy.year, strategy.month, 0);
  if (now < planStart) return false;
  if (now > planEnd) return true;
  return planEnd.getDate() - now.getDate() < 7;
}

/** The first sentence of a Hebrew paragraph (a full stop followed by a space or the end). */
function firstSentence(text: string): string {
  const match = text.match(/^.*?[.?!](?=\s|$)/);
  return (match ? match[0] : text).trim();
}

/** The month: loading, there, not built yet (404 — normal right after /start), or failed. */
type MonthState = "loading" | "ready" | "none" | "error";

/**
 * One title, and in the free month where it stands (DESIGN-STANDARD §2: no eyebrow that
 * repeats the title). The day sits at the far end on a wide screen, under the title on a phone.
 */
function TodayHeader({ trial }: { trial?: TrialPayload | null }) {
  return (
    <header className="mb-8 flex flex-col gap-3 sm:mb-10 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
      <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[color:var(--ink)] sm:text-[32px]">השבוע</h1>
      {trial && !trial.ended ? (
        <div className="sm:pb-1.5">
          <TrialDay trial={trial} />
        </div>
      ) : null}
    </header>
  );
}

/** A folded row's chevron: down when closed, up when open (the app's chevron, turned). */
function FoldChevron({ group }: { group: "posts" | "more" }) {
  return (
    <IconChevron
      className={`h-4 w-4 shrink-0 -rotate-90 text-[color:var(--ink-muted)] transition-transform duration-200 motion-reduce:transition-none ${
        group === "posts" ? "group-open/posts:rotate-90" : "group-open/more:rotate-90"
      }`}
    />
  );
}

/**
 * השבוע (the home tab, `/dashboard`) — during the free month, the weekly brief and the
 * guide (docs/onboarding-v2.md, Revision 7 B in the order of Revision 8).
 *
 * The one screen the owner opens without being asked to do something, read on a phone
 * between customers. In the free month it answers, in order:
 *
 * 1. Where is the plan going, and what is mine to do? — the plan brief (the design
 *    library's PlanBrief): the direction, how we will know, and the one next step with
 *    the page's only dark button.
 * 2. This week — the week's focus and what we learned (the weekly brief).
 * 3. What is the month made of? — "יום N מתוך 30" and the journey by week, ticking itself
 *    as things really happen (`GET /trial`).
 *
 * The journey replaces the setup checklist here: both are computed from the same facts
 * (api/app/services/journey.py), and two lists of the same steps would compete. After the
 * free month — or if `/trial` fails — the next post is the ask, and the checklist is one
 * quiet row.
 *
 * Nothing here may reject unhandled: a signed-out visit gets 401s that AppShell turns into
 * a redirect, so every call catches, and a 401 renders nothing rather than an error.
 */
export default function DashboardPage() {
  const [business, setBusiness] = useState<Business | null>(null);
  const [strategy, setStrategy] = useState<StrategyPayload | null>(null);
  const [month, setMonth] = useState<MonthState>("loading");
  const [recommendation, setRecommendation] = useState<RecommendationPayload | null>(null);
  const [instagram, setInstagram] = useState<InstagramBriefPayload | null>(null);
  const { payload: trial, failed: trialFailed } = useTrial();

  useEffect(() => {
    // Today is where ticks are read, so it always asks afresh rather than trusting the
    // copy another tab loaded minutes ago.
    void loadTrial(true);
    endpoints
      .business()
      .then((result) => setBusiness(result.business))
      .catch(() => {});
    endpoints
      .strategy()
      .then((result) => {
        setStrategy(result);
        setMonth("ready");
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) return; // AppShell redirects
        setMonth(err instanceof ApiError && err.status === 404 ? "none" : "error");
      });
    endpoints.recommendations().then(setRecommendation).catch(() => {});
    // Guidance only: a failed call just means no nudge.
    endpoints.instagramBrief().then(setInstagram).catch(() => {});
  }, []);

  const guided = Boolean(trial && !trial.ended);
  const trialSettled = Boolean(trial) || trialFailed;

  if (month === "loading" || !trialSettled) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl">
          <TodayHeader trial={guided ? trial : null} />
          <LoadingMark label="טוענים את החודש…" />
        </div>
      </AppShell>
    );
  }

  const posts = strategy?.roadmap?.posts || [];
  const nextIndex = posts.findIndex((post) => post.approval_status !== "approved");
  const nextPost = nextIndex >= 0 ? posts[nextIndex] : undefined;
  const approvedCount = posts.filter((post) => post.approval_status === "approved").length;
  const allApproved = posts.length > 0 && approvedCount === posts.length;
  const currentWeek = strategy ? currentWeekOf(strategy) : null;
  const nearlyDone = strategy ? monthNearlyDone(strategy, allApproved) : false;

  // "This week" is the plan week today falls in. Outside the plan's month there is no
  // "this week", so the list shows the week of the post that is waiting instead.
  const shownWeek = currentWeek ?? nextPost?.week ?? posts[0]?.week ?? 1;
  const weekPosts = posts
    .map((post, index) => ({ post, index }))
    .filter(({ post }) => post.week === shownWeek);

  // The brief reads the stored ongoing plan; a business from before it falls back to the
  // month's hypothesis. Numbers are the owner's own (Revision 6), never invented.
  const plan = strategy?.quarter_plan ?? business?.quarter_plan;
  const instagramNeeded = !Array.isArray(plan?.integrations) || plan.integrations.some(item => item.key === "instagram_insights");
  const direction =
    plan?.strategy.one_liner_he ||
    strategy?.monthly_horizon_plan?.hypothesis ||
    strategy?.usp.growth_hypothesis ||
    strategy?.usp.usp ||
    "";
  // One line of where the business starts; the full numbers and their math live in the plan.
  const baselineText = firstSentence(plan?.numbers?.baseline_he || plan?.kpi.baseline_he || "");

  // The one next thing: the journey's next step in the free month; after it, the week's
  // "what we need from you" in the plan (the ask itself is the next-post card below).
  const step = guided && trial ? nextStep(trial) : null;
  const ownerAction: ReactNode = guided && trial
    ? step
      ? step.title_he
      : allDoneText(trial)
    : strategy?.weekly_breakdown?.find((week) => week.week === shownWeek)?.what_user_does?.[0];

  const postsOpen = posts.length > 0 && (!guided || (trial && foundationsDone(trial)));

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <TodayHeader trial={guided ? trial : null} />

        <div className="rise-stagger space-y-8">
          {/* Revision 7 A: the month being built on the server, above everything else. */}
          {month === "none" ? (
            <MonthBuildProgress
              autoStart={Boolean(business && !business.onboarding_complete)}
              onDone={() =>
                void endpoints
                  .strategy()
                  .then((result) => {
                    setStrategy(result);
                    setMonth("ready");
                  })
                  .catch(() => {})
              }
            />
          ) : null}
          {/* The posts the owner asked for, being written on the server (Revision 8: after
              the week-2 foundations). Renders nothing unless that job is running or failed. */}
          {month === "ready" && posts.length === 0 ? (
            <MonthBuildProgress
              kind="posts"
              onDone={() => {
                void loadTrial(true);
                void endpoints.strategy().then(setStrategy).catch(() => {});
              }}
            />
          ) : null}

          {/* 1. The plan and the one thing. */}
          {direction ? (
            <PlanBrief
              businessName={business?.name}
              direction={direction}
              why={plan?.strategy.why_he}
              measure={plan?.kpi.name_he}
              baseline={baselineText ? <BidiText text={baselineText} /> : undefined}
              ownerAction={ownerAction || undefined}
              ownerWhy={step?.why_he}
              ownerMeta={step ? minutesLabel(step.minutes) : undefined}
              action={step ? <NextStepAction step={step} /> : undefined}
            />
          ) : null}

          {/* 2. The weekly brief (Revision 8): the week's focus and what we learned. What
              needs a decision is the brief's step above. */}
          {guided && trial ? <WeeklyBrief trial={trial} strategy={strategy} business={business} /> : null}

          {/* 3. The free month: the day and the journey. Outside it, the next post is the ask. */}
          {guided && trial ? (
            <>
              {/* No plan to brief from (an older business): the guide carries the step itself. */}
              <TrialGuide trial={trial} showNext={!direction} />
            </>
          ) : nextPost ? (
            <NextPostCard post={nextPost} index={nextIndex} total={posts.length} />
          ) : strategy && allApproved ? (
            <section className="drawn-card px-6 pt-6 pb-3 sm:px-8 sm:pt-7">
              <p className="flex items-center gap-2.5 text-[17px] font-bold text-[color:var(--ink)]">
                <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[color:var(--primary)]">
                  <IconCheck className="h-3.5 w-3.5" />
                </span>
                כל הפוסטים של {strategy.month_name_he} אושרו
              </p>
              {/* With the month approved, next month *is* the ask — so here, and only
                  here, its build button is the page's dark one. */}
              {strategy.horizon ? (
                <MonthAhead horizon={strategy.horizon} onReady={setStrategy} tone="primary" variant="row" />
              ) : (
                <p className="py-3 text-sm text-[color:var(--ink-soft)]">ממשיכים לעקוב אחרי התוצאות.</p>
              )}
            </section>
          ) : (
            <MonthNotReady month={month} />
          )}

          {/* Everything else: quiet rows in one card, hairlines between. */}
          <section className="drawn-card divide-y divide-[var(--rule)] px-5 empty:hidden sm:px-6">
            {/* The free month's last week, and after it with nothing paid: one line to /billing. */}
            <BillingReminder />
            <HypothesisStatus trial={guided ? trial : null} />
            {guided ? null : instagramNeeded && instagram && needsInstagram(instagram) ? (
              <InstagramNudge connected={instagram.meta_connected} />
            ) : null}
            {guided ? null : <SetupChecklist />}
            {guided && month === "error" ? <MonthNotReadyRow month={month} /> : null}
            {/* In the free month, building next month is a step of the journey
                ("לבנות את החודש השני"), so it is not a second row here. */}
            {strategy && nearlyDone && !allApproved && !guided ? (
              <MonthAhead horizon={strategy.horizon} onReady={setStrategy} tone="quiet" variant="row" />
            ) : null}
            {strategy ? (
              <MoreAboutMonth
                strategy={strategy}
                business={business}
                recommendation={recommendation}
                currentWeek={currentWeek}
              >
                {nearlyDone ? null : (
                  <MonthAhead horizon={strategy.horizon} onReady={setStrategy} tone="quiet" variant="row" />
                )}
              </MoreAboutMonth>
            ) : null}
          </section>

          {/* This week's posts, and how far along the month is — the plan's execution
              tool, folded. In the free month they wait for the week-2 foundations: posts
              are not pushed before measurement, the products and the owner's photos are in
              (Revision 8). */}
          {postsOpen ? (
            <details className="group/posts drawn-card overflow-hidden">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--soft)] sm:px-6 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1 text-[15px] font-semibold text-[color:var(--ink)]">
                  {currentWeek ? "פוסטים השבוע" : `פוסטים לשבוע ${shownWeek}`} ·{" "}
                  <span className="font-normal tabular-nums text-[color:var(--ink-soft)]">
                    {approvedCount} מתוך {posts.length} אושרו
                  </span>
                </span>
                {/* How far along the month is, beside the count it draws. */}
                <span
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={posts.length}
                  aria-valuenow={approvedCount}
                  aria-label="פוסטים שאושרו החודש"
                  className="block h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-[var(--rule)] sm:w-20"
                >
                  <span
                    className="block h-full rounded-full bg-[var(--primary)] transition-[width] duration-700 ease-out motion-reduce:transition-none"
                    style={{ width: `${(approvedCount / posts.length) * 100}%` }}
                  />
                </span>
                <FoldChevron group="posts" />
              </summary>
              <section aria-labelledby="week-heading" className="border-t border-[var(--rule)]">
                <h2 id="week-heading" className="sr-only">
                  {currentWeek ? "פוסטים השבוע" : `פוסטים לשבוע ${shownWeek}`}
                </h2>

                {weekPosts.length ? (
                  <ul className="divide-y divide-[var(--rule)]">
                    {weekPosts.map(({ post, index }) => (
                      <WeekRow key={index} post={post} index={index} />
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-4 text-[15px] text-[color:var(--ink-soft)] sm:px-6">אין פוסטים בשבוע הזה.</p>
                )}

                <div className="border-t border-[var(--rule)] px-5 sm:px-6">
                  <Link
                    href="/posts"
                    className="inline-flex min-h-12 items-center gap-1.5 text-sm font-semibold text-[color:var(--primary)] underline-offset-4 hover:underline"
                  >
                    כל הפוסטים
                    <IconChevron className="h-4 w-4" />
                  </Link>
                </div>
              </section>
            </details>
          ) : null}

          <ContactLink className="pt-2 text-center" />
        </div>
      </div>
    </AppShell>
  );
}

/** No month to show, outside the free month: say why, never a blank card. */
function MonthNotReady({ month }: { month: MonthState }) {
  return (
    <section className="drawn-card p-6 sm:p-8">
      <p className="text-[15px] leading-relaxed text-[color:var(--ink-soft)]">
        {month === "error" ? "לא הצלחנו לטעון את החודש. נסו לרענן את העמוד." : "עוד מכינים את הפוסטים של החודש."}
      </p>
      {month === "none" ? (
        <Link href="/strategy" className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[color:var(--primary)] underline-offset-4 hover:underline">
          לתוכנית
          <IconChevron className="h-4 w-4" />
        </Link>
      ) : null}
    </section>
  );
}

/** A quiet row of the card below: an icon, one line, a chevron. The whole row is the link. */
function QuietRow({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Link href={href} className="group flex min-h-14 items-center gap-3 py-3 text-[15px] leading-6 text-[color:var(--ink)]">
      <span className="shrink-0 text-[color:var(--ink-muted)]">{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
      <IconChevron navigation className="h-4 w-4 shrink-0 text-[color:var(--ink-muted)] transition-transform duration-200 group-hover:-translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  );
}

/** In the free month the journey is the ask; the missing month is one quiet row. */
function MonthNotReadyRow({ month }: { month: MonthState }) {
  return (
    <QuietRow href="/strategy" icon={<IconImage className="h-[18px] w-[18px]" />}>
      {month === "error" ? "לא הצלחנו לטעון את הפוסטים של החודש" : "הפוסטים של החודש עוד נכתבים"}
    </QuietRow>
  );
}

/**
 * Instagram is not connected, or is connected with nothing synced: the posts are being
 * written without it. Not offered when the server has no Meta app at all — the owner
 * could not act on it.
 */
function needsInstagram(payload: InstagramBriefPayload) {
  return payload.meta_ready && (!payload.meta_connected || payload.own_posts_synced === 0);
}

/** One quiet row, not a second ask: the dark button on this page belongs to the post. */
function InstagramNudge({ connected }: { connected: boolean }) {
  return (
    <QuietRow href="/instagram" icon={<IconCamera className="h-[18px] w-[18px]" />}>
      {connected
        ? "עוד לא משכנו פוסטים מהאינסטגרם, אז אנחנו כותבים בלי לדעת מה כבר הצליח לכם"
        : "לחבר את האינסטגרם, כדי שנכתוב לפי מה שכבר הצליח לכם"}
    </QuietRow>
  );
}

/** The single ask after the free month: the next post waiting for the owner. The page's only dark button. */
function NextPostCard({ post, index, total }: { post: RoadmapPost; index: number; total: number }) {
  return (
    <section className="drawn-card p-6 sm:p-8">
      <p className="text-[13px] font-semibold text-[color:var(--primary)]">{LIFECYCLE_LABEL[lifecycleOf(post)]}</p>
      <div className="mt-4 flex items-center gap-4 sm:gap-5">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[var(--primary-soft)] sm:h-20 sm:w-20">
          {post.image_url ? (
            <Image
              src={post.image_url}
              alt=""
              width={160}
              height={160}
              unoptimized
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full items-center justify-center text-[color:var(--ink-muted)]">
              <IconImage className="h-5 w-5" />
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h2 className="text-[19px] font-bold leading-snug tracking-tight text-[color:var(--ink)]">{post.title}</h2>
          <p className="mt-1 text-[13px] tabular-nums text-[color:var(--ink-muted)]">
            {postDay(post)} · פוסט {index + 1} מתוך {total}
          </p>
        </div>
      </div>
      <Link
        href={postHref(index)}
        className="drawn-button group mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 bg-[var(--primary)] px-6 text-[15px] font-semibold text-white sm:w-auto"
      >
        לבדוק ולאשר
        <IconArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
      </Link>
    </section>
  );
}

const STATE_STYLE: Record<PostLifecycle, string> = {
  needs_owner: "text-[color:var(--ink)]",
  ready: "text-[color:var(--ink-soft)]",
  approved: "text-[color:var(--primary)]",
  published: "text-[color:var(--good)]",
  measured: "text-[color:var(--good)]",
};

/** One post of the week: day, title, status. The whole row is the link. */
function WeekRow({ post, index }: { post: RoadmapPost; index: number }) {
  const state = lifecycleOf(post);
  return (
    <li>
      <Link
        href={postHref(index)}
        className="group flex min-h-16 items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--soft)] sm:px-6"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-[color:var(--ink)]">{post.title}</span>
          <span className="mt-0.5 block text-[13px] text-[color:var(--ink-muted)]">{postDay(post)}</span>
        </span>
        <span className={`flex shrink-0 items-center gap-1.5 text-[13px] font-medium ${STATE_STYLE[state]}`}>
          {/* Words first, the dot second: the sun marks what waits on the owner. */}
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${state === "needs_owner" || state === "ready" ? "bg-[var(--sun)]" : "bg-current"}`} />
          {LIFECYCLE_LABEL[state]}
        </span>
        <IconChevron navigation className="h-4 w-4 shrink-0 text-[color:var(--ink-muted)] transition-transform duration-200 group-hover:-translate-x-0.5 motion-reduce:transition-none" />
      </Link>
    </li>
  );
}

/**
 * The rest of the month, one tap down: budget, the leading target, the week's one
 * recommendation, what the plan needs from the owner, the monthly direction and its
 * weeks. Each row links to the page that owns that decision.
 */
function MoreAboutMonth({
  strategy,
  business,
  recommendation,
  currentWeek,
  children,
}: {
  strategy: StrategyPayload;
  business: Business | null;
  recommendation: RecommendationPayload | null;
  currentWeek: number | null;
  children?: ReactNode;
}) {
  const monthly = strategy.monthly_horizon_plan || strategy.roadmap?.monthly_horizon_plan;
  const weeks = strategy.weekly_breakdown || strategy.roadmap?.weekly_breakdown || [];
  const nextUserAction = weeks.flatMap((week) => week.what_user_does || []).find(Boolean);
  const quarterPlan = strategy.long_horizon_plan || strategy.roadmap?.long_horizon_plan;
  const leadingTarget = quarterPlan?.targets?.[0];
  const budget = business?.monthly_budget_ils ?? 0;
  const oneThing = recommendation?.suggestions?.suggestions?.[0]?.title;

  return (
    <details className="group/more">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 text-[15px] font-semibold text-[color:var(--ink)] [&::-webkit-details-marker]:hidden">
        <span>עוד על החודש</span>
        <FoldChevron group="more" />
      </summary>

      <div className="divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
        <InfoRow label="צריך מכם" href={null}>
          {nextUserAction || "כרגע כלום. נפנה אליכם רק כשנצטרך משהו שאין בנתונים."}
        </InfoRow>
        <InfoRow label="הכי חשוב השבוע" href="/recommendations">
          {oneThing || "נעדכן כשיהיו נתונים"}
        </InfoRow>
        <InfoRow label="יעד העבודה העיקרי" href="/plan">
          {leadingTarget || "עוד לא בחרנו יעדים"}
        </InfoRow>
        <InfoRow label="תקציב חודשי" href="/decisions">
          {formatNis(budget)} · {stageFor(budget).title}
        </InfoRow>

        <div className="py-4">
          <p className="text-[13px] font-semibold text-[color:var(--ink-muted)]">כיוון החודש</p>
          <p className="mt-1.5 text-[15px] font-semibold leading-relaxed text-[color:var(--ink)]">
            {monthly?.hypothesis || strategy.usp.growth_hypothesis || strategy.roadmap.theme}
          </p>
          {monthly?.targets?.length ? (
            <ul className="mt-3 space-y-1.5">
              {monthly.targets.slice(0, 3).map((target, index) => (
                <li key={`${target}-${index}`} className="flex items-start gap-3 text-[15px] leading-6 text-[color:var(--ink-soft)]">
                  <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
                  {target}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="py-4">
          <p className="text-[13px] font-semibold text-[color:var(--ink-muted)]">השבועות</p>
          <ol className="mt-3 space-y-2.5">
            {[1, 2, 3, 4].map((week) => {
              const item = weeks.find((entry) => entry.week === week);
              const isNow = currentWeek === week;
              return (
                <li key={week} className="flex items-start gap-3">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                      isNow ? "bg-[var(--primary)] text-white" : "bg-[var(--soft)] text-[color:var(--ink-muted)]"
                    }`}
                  >
                    {week}
                  </span>
                  <span className={`min-w-0 flex-1 text-[15px] leading-6 ${isNow ? "font-semibold text-[color:var(--ink)]" : "text-[color:var(--ink-soft)]"}`}>
                    {item?.focus || "—"}
                    {isNow ? <span className="ms-2 text-[13px] font-medium text-[color:var(--primary)]">(השבוע)</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {children}
      </div>
    </details>
  );
}

function InfoRow({ label, href, children }: { label: string; href: string | null; children: ReactNode }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-[color:var(--ink-muted)]">{label}</span>
        <span className="mt-1 block text-[15px] font-medium leading-6 text-[color:var(--ink)]">{children}</span>
      </span>
      {href ? (
        <IconChevron navigation className="h-4 w-4 shrink-0 text-[color:var(--ink-muted)] transition-transform duration-200 group-hover:-translate-x-0.5 motion-reduce:transition-none" />
      ) : null}
    </>
  );
  if (!href) return <div className="flex items-center gap-3 py-4">{body}</div>;
  return (
    <Link href={href} className="group flex min-h-14 items-center gap-3 py-4">
      {body}
    </Link>
  );
}
