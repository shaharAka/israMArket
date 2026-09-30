"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingMark } from "@/components/Doodles";
import { MonthAhead } from "@/components/MonthAhead";
import { MonthBuildProgress } from "@/components/MonthBuildProgress";
import { IconCamera } from "@/components/instagram/SourceLink";
import { SectionHeader } from "@/components/SectionHeader";
import { SetupChecklist } from "@/components/SetupChecklist";
import { postDay, postHref, postState, STATE_LABEL, type PostState } from "@/components/today/posts";
import { ContactLink } from "@/components/trial/StepLink";
import { TrialGuide } from "@/components/trial/TrialGuide";
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
import { IconArrowLeft, IconCheck, IconImage, IconRoute } from "@/lib/icons";
import { foundationsDone, loadTrial, useTrial } from "@/lib/trial";

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

/** The month: loading, there, not built yet (404 — normal right after /start), or failed. */
type MonthState = "loading" | "ready" | "none" | "error";

/**
 * השבוע (the home tab, `/dashboard`) — during the free month, the weekly brief and the
 * guide (docs/onboarding-v2.md, Revision 7 B in the order of Revision 8).
 *
 * The one screen the owner opens without being asked to do something, read on a phone
 * between customers. In the free month it answers, in order:
 *
 * 1. Where am I? — "יום N מתוך 30" and the one next step: why, how long, one dark button.
 * 2. What is the month made of? — the journey by week, the current week open, ticking
 *    itself as things really happen (`GET /trial`).
 * 3. The 3-month plan, one row; then this week's posts.
 *
 * The journey replaces the setup checklist here: both are computed from the same facts
 * (api/app/services/journey.py), and two lists of the same steps would compete. After the
 * free month — or if `/trial` fails — Today is what it was: the next post is the ask, and
 * the checklist is one quiet row.
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
          <SectionHeader section="dashboard" title="השבוע" />
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

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <SectionHeader
          section="dashboard"
          title="השבוע"
        />

        <div className="rise-stagger space-y-7">
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

          {/* 1. The one thing. */}
          {/* The weekly brief (Revision 8): the week's focus and what we learned; what
              needs a decision is the journey's next step, the card below. */}
          {guided && trial ? <WeeklyBrief trial={trial} strategy={strategy} business={business} /> : null}

          {guided && trial ? (
            <TrialGuide trial={trial} />
          ) : nextPost ? (
            <NextPostCard post={nextPost} index={nextIndex} total={posts.length} />
          ) : strategy && allApproved ? (
            <section className="rounded-lg border border-[#cecdc7] bg-white px-4 pt-4 sm:px-5">
              <p className="flex items-center gap-2 text-base font-black text-[#20211f]">
                <IconCheck className="h-4 w-4 shrink-0" />
                כל הפוסטים של {strategy.month_name_he} אושרו
              </p>
              {/* With the month approved, next month *is* the ask — so here, and only
                  here, its build button is the page's dark one. */}
              {strategy.horizon ? (
                <MonthAhead horizon={strategy.horizon} onReady={setStrategy} tone="primary" variant="row" />
              ) : (
                <p className="py-3 text-sm text-[#62635f]">ממשיכים לעקוב אחרי התוצאות.</p>
              )}
            </section>
          ) : (
            <MonthNotReady month={month} />
          )}

          {/* The 3-month plan, and everything else: quiet rows in one container. */}
          <section className="divide-y divide-[#e9e8e3] rounded-lg border border-[#e6e4dc] bg-white px-4 sm:px-5">
            <QuarterPlanRow strategy={strategy} business={business} />
            <HypothesisStatus trial={guided ? trial : null} />
            {guided ? null : instagram && needsInstagram(instagram) ? (
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

          {/* This week's posts, and how far along the month is. In the free month they wait
              for the week-2 foundations: posts are not pushed before measurement, the
              products and the owner's photos are in (Revision 8). */}
          {posts.length > 0 && (!guided || (trial && foundationsDone(trial))) ? (
            <section aria-labelledby="week-heading">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="week-heading" className="text-base font-black text-[#20211f]">
                  {currentWeek ? "פוסטים השבוע" : `פוסטים לשבוע ${shownWeek}`}
                </h2>
                <Link href="/posts" className="text-xs font-bold text-[#5e6159] underline-offset-4 hover:underline">
                  כל הפוסטים
                </Link>
              </div>

              {weekPosts.length ? (
                <ul className="mt-3 divide-y divide-[#e9e8e3] overflow-hidden rounded-lg border border-[#e6e4dc] bg-white">
                  {weekPosts.map(({ post, index }) => (
                    <WeekRow key={index} post={post} index={index} />
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-[#62635f]">אין פוסטים בשבוע הזה.</p>
              )}

              <div className="mt-3 flex items-center gap-3">
                <span
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={posts.length}
                  aria-valuenow={approvedCount}
                  aria-label="פוסטים שאושרו החודש"
                  className="block h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-[#e1e0db]"
                >
                  <span
                    className="block h-full rounded-full bg-[#343632] transition-[width] duration-700 ease-out"
                    style={{ width: `${(approvedCount / posts.length) * 100}%` }}
                  />
                </span>
                <p className="text-sm text-[#5e6159]">
                  {approvedCount} מתוך {posts.length} פוסטים אושרו החודש
                </p>
              </div>
            </section>
          ) : null}

          <ContactLink className="text-center" />
        </div>
      </div>
    </AppShell>
  );
}

/** No month to show, outside the free month: say why, never a blank card. */
function MonthNotReady({ month }: { month: MonthState }) {
  return (
    <section className="rounded-lg border border-[#cecdc7] bg-white p-4 sm:p-5">
      <p className="text-sm leading-6 text-[#62635f]">
        {month === "error" ? "לא הצלחנו לטעון את החודש. נסו לרענן את העמוד." : "עוד מכינים את הפוסטים של החודש."}
      </p>
      {month === "none" ? (
        <Link href="/strategy" className="mt-1 inline-flex min-h-11 items-center text-sm font-bold text-[#20211f] underline underline-offset-4">
          לתוכנית
        </Link>
      ) : null}
    </section>
  );
}

/** In the free month the journey is the ask; the missing month is one quiet row. */
function MonthNotReadyRow({ month }: { month: MonthState }) {
  return (
    <Link href="/strategy" className="flex min-h-12 items-center gap-3 py-3 transition-colors hover:text-[#20211f]">
      <IconImage className="h-4 w-4 shrink-0 text-[#62635f]" />
      <span className="min-w-0 flex-1 text-sm leading-6 text-[#3c3e3a]">
        {month === "error" ? "לא הצלחנו לטעון את הפוסטים של החודש" : "הפוסטים של החודש עוד נכתבים"}
      </span>
      <IconArrowLeft className="h-4 w-4 shrink-0 text-[#8b8e84]" />
    </Link>
  );
}

/**
 * The 3-month plan, one row: the plan's one line (or, for a business from before the
 * stored plan, the quarter's hypothesis), leading to /strategy.
 */
function QuarterPlanRow({ strategy, business }: { strategy: StrategyPayload | null; business: Business | null }) {
  const plan = strategy?.quarter_plan ?? business?.quarter_plan;
  const quarter = strategy?.long_horizon_plan || strategy?.roadmap?.long_horizon_plan;
  const line = plan?.strategy.one_liner_he || quarter?.hypothesis;
  if (!line) return null;
  return (
    <Link href="/strategy" className="flex min-h-12 items-center gap-3 py-3 transition-colors hover:text-[#20211f]">
      <IconRoute className="h-4 w-4 shrink-0 text-[#62635f]" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-[#747570]">התוכנית ל-3 חודשים</span>
        <span className="mt-0.5 block truncate text-sm font-bold leading-6 text-[#20211f]">{line}</span>
      </span>
      <IconArrowLeft className="h-4 w-4 shrink-0 text-[#8b8e84]" />
    </Link>
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
    <Link
      href="/instagram"
      className="flex min-h-12 items-center gap-3 py-3 text-sm leading-6 text-[#3c3e3a] transition-colors hover:text-[#20211f]"
    >
      <IconCamera className="h-4 w-4 shrink-0 text-[#62635f]" />
      <span className="min-w-0 flex-1">
        {connected
          ? "עוד לא משכנו פוסטים מהאינסטגרם, אז אנחנו כותבים בלי לדעת מה כבר הצליח לכם"
          : "לחבר את האינסטגרם, כדי שנכתוב לפי מה שכבר הצליח לכם"}
      </span>
      <IconArrowLeft className="h-4 w-4 shrink-0 text-[#8b8e84]" />
    </Link>
  );
}

/** The single ask: the next post waiting for the owner. The only dark button on the page. */
function NextPostCard({ post, index, total }: { post: RoadmapPost; index: number; total: number }) {
  return (
    <section className="rounded-lg border border-[#cecdc7] bg-white p-4 sm:p-5">
      <p className="text-xs font-bold text-[#747570]">מחכה לאישור שלכם</p>
      <div className="mt-3 flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-[#f0efeb] sm:h-20 sm:w-20">
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
            <span className="flex h-full items-center justify-center text-[#898a85]">
              <IconImage className="h-5 w-5" />
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-black leading-7 text-[#20211f]">{post.title}</h2>
          <p className="mt-0.5 text-xs text-[#62635f]">
            {postDay(post)} · פוסט {index + 1} מתוך {total}
          </p>
        </div>
      </div>
      <Link
        href={postHref(index)}
        className="group mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#20211f] px-6 text-sm font-bold text-white transition-colors hover:bg-[#343632] sm:w-auto"
      >
        לבדוק ולאשר
        <IconArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
      </Link>
    </section>
  );
}

const STATE_STYLE: Record<PostState, string> = {
  published: "bg-[#eaf0e6] text-[#374b3d]",
  approved: "bg-[#eaf0e6] text-[#374b3d]",
  waiting: "bg-[#f5efe3] text-[#6b5530]",
};

/** One post of the week: day, title, status. The whole row is the link. */
function WeekRow({ post, index }: { post: RoadmapPost; index: number }) {
  const state = postState(post);
  return (
    <li>
      <Link
        href={postHref(index)}
        className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-[#faf9f7]"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-[#20211f]">{post.title}</span>
          <span className="mt-0.5 block text-xs text-[#62635f]">{postDay(post)}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATE_STYLE[state]}`}>
          {STATE_LABEL[state]}
        </span>
        <IconArrowLeft className="h-4 w-4 shrink-0 text-[#8b8e84]" />
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
    <details className="group">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-bold text-[#20211f]">
        <span>עוד על החודש</span>
        <span aria-hidden className="shrink-0 text-[#8b8e84] transition-transform group-open:-rotate-90">
          ‹
        </span>
      </summary>

      <div className="divide-y divide-[#e9e8e3] border-t border-[#e9e8e3]">
        <InfoRow label="צריך מכם" href={null}>
          {nextUserAction || "כרגע כלום. נפנה אליכם רק כשנצטרך משהו שאין בנתונים."}
        </InfoRow>
        <InfoRow label="הכי חשוב השבוע" href="/recommendations">
          {oneThing || "נעדכן כשיהיו נתונים"}
        </InfoRow>
        <InfoRow label="היעד העיקרי ברבעון" href="/plan">
          {leadingTarget || "עוד לא בחרנו יעדים"}
        </InfoRow>
        <InfoRow label="תקציב חודשי" href="/decisions">
          {formatNis(budget)} · {stageFor(budget).title}
        </InfoRow>

        <div className="py-3">
          <p className="text-xs font-bold text-[#747570]">כיוון החודש</p>
          <p className="mt-1 text-sm font-bold leading-6 text-[#20211f]">
            {monthly?.hypothesis || strategy.usp.growth_hypothesis || strategy.roadmap.theme}
          </p>
          {monthly?.targets?.length ? (
            <ul className="mt-2 space-y-1">
              {monthly.targets.slice(0, 3).map((target, index) => (
                <li key={`${target}-${index}`} className="flex items-start gap-2.5 text-sm leading-6 text-[#3c3e3a]">
                  <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b3b0a5]" />
                  {target}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="py-3">
          <p className="text-xs font-bold text-[#747570]">השבועות</p>
          <ol className="mt-2 space-y-2">
            {[1, 2, 3, 4].map((week) => {
              const item = weeks.find((entry) => entry.week === week);
              const isNow = currentWeek === week;
              return (
                <li key={week} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isNow ? "bg-[#20211f] text-white" : "border border-[#dedcd4] text-[#62635f]"
                    }`}
                  >
                    {week}
                  </span>
                  <span className={`min-w-0 flex-1 text-sm leading-6 ${isNow ? "font-bold text-[#20211f]" : "text-[#5e6159]"}`}>
                    {item?.focus || "—"}
                    {isNow ? <span className="mr-2 text-xs font-bold text-[#62635f]">(השבוע)</span> : null}
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
        <span className="block text-xs font-bold text-[#747570]">{label}</span>
        <span className="mt-0.5 block text-sm font-bold leading-6 text-[#20211f]">{children}</span>
      </span>
      {href ? <IconArrowLeft className="h-4 w-4 shrink-0 text-[#8b8e84]" /> : null}
    </>
  );
  if (!href) return <div className="flex items-center gap-3 py-3">{body}</div>;
  return (
    <Link href={href} className="flex min-h-12 items-center gap-3 py-3 transition-colors hover:text-[#20211f]">
      {body}
    </Link>
  );
}
