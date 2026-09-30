"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingMark } from "@/components/Doodles";
import { MonthAhead } from "@/components/MonthAhead";
import { GENERATE_STAGES } from "@/components/onboarding/constants";
import { QuarterPlanView } from "@/components/plan/QuarterPlanView";
import { SectionHeader } from "@/components/SectionHeader";
import {
  ApiError,
  endpoints,
  generateUntilDone,
  type Business,
  type LongHorizonMilestone,
  type StrategyPayload,
  type WeeklyBreakdownItem,
} from "@/lib/api";
import { mockStoredPlan } from "@/lib/draft";
import { SECTIONS } from "@/lib/sections";
import { IconArrowLeft, IconBell, IconCalendar, IconEye, IconFlag, IconMegaphone } from "@/lib/icons";
import { toast } from "@/lib/ui";

/**
 * התוכנית — the 3-month plan, the month and the quarter on one page.
 *
 * A business built at /start arrives here right after signup (Revision 5): the plan the
 * owner saw and shaped before the email is on the page at once, and the first month is
 * built from it underneath, stage by stage, while they read. So this page renders with no
 * month yet, and drives that build itself (the API builds one stage per call).
 *
 * Once there is a month, it leads for a returning owner (it is what they act on) and the
 * 3-month plan follows as a reference, its later sections folded to one line each. On the
 * first visit the plan leads. The month itself leads with its answer (UI-RULES rule 2):
 * the goal sentence, its targets and what we need from the owner share one tinted panel;
 * the four weeks are compact rows, each its own expand. The page keeps exactly one dark
 * button: `לבדוק את הפוסט הבא`, and only once there are posts to check.
 *
 * Editing the plan itself is not built yet, and the page says so; what it is built on is
 * editable from /decisions today. A business without a stored plan (built before Revision
 * 5) sees the month and the quarter as before.
 */

const TONE = SECTIONS.strategy;

/** Which plan week today falls in, or null when today is outside the plan's month. */
function currentWeekOf(strategy: StrategyPayload): number | null {
  const now = new Date();
  if (now.getFullYear() !== strategy.year || now.getMonth() + 1 !== strategy.month) return null;
  return Math.min(4, Math.ceil(now.getDate() / 7));
}

type Build = { state: "idle" | "running" | "failed"; stage: string; error: string };

/**
 * The first month, built in the background from the stored plan. Resumes where it stopped
 * (the API keeps the stage), so leaving and coming back continues rather than restarts.
 */
function useFirstMonthBuild(onDone: () => void) {
  const [build, setBuild] = useState<Build>({ state: "idle", stage: "usp", error: "" });
  const started = useRef(false);
  const start = () => {
    if (started.current) return;
    started.current = true;
    setBuild({ state: "running", stage: "usp", error: "" });
    generateUntilDone(endpoints.generate, (stage) => setBuild((b) => ({ ...b, stage })))
      .then(() => {
        setBuild({ state: "idle", stage: "done", error: "" });
        toast("החודש הראשון מוכן");
        onDone();
      })
      .catch((err: unknown) => {
        started.current = false;
        setBuild((b) => ({
          ...b,
          state: "failed",
          error: err instanceof Error && err.message ? err.message : "לא הצלחנו לבנות את החודש. נסו שוב.",
        }));
      });
  };
  return { build, start };
}

export default function StrategyPage() {
  const [strategy, setStrategy] = useState<StrategyPayload | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [welcome, setWelcome] = useState(false);

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

  const { build, start } = useFirstMonthBuild(() => void loadStrategy());

  useEffect(() => {
    const timer = window.setTimeout(() => setWelcome(new URLSearchParams(window.location.search).get("welcome") === "1"), 0);
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

  // Arrived from /start with the plan and no month yet: build it now, in the background.
  useEffect(() => {
    if (loaded && needsMonth && build.state === "idle" && build.stage !== "done") start();
    // `start` is stable enough: it guards itself with a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, needsMonth]);

  // `/plan` and the hub link land on `#quarter`, but the section only exists once the
  // plan has loaded — the browser's own jump to the fragment has already happened by then.
  const hasStrategy = Boolean(strategy);
  useEffect(() => {
    if (!hasStrategy || window.location.hash !== "#quarter") return;
    const frame = requestAnimationFrame(() => document.getElementById("quarter")?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [hasStrategy]);

  const accent = business?.brand_language?.palette?.find((s) => s.role === "primary")?.hex ?? TONE.accent;
  const planFirst = welcome || !strategy;

  const planView = plan ? (
    <section aria-labelledby="quarter-plan-heading" className="space-y-3">
      <div>
        <h2 id="quarter-plan-heading" className="text-lg font-black text-[#20211f]">
          התוכנית ל-3 החודשים
        </h2>
        {welcome ? (
          <p className="mt-0.5 text-sm leading-6 text-[#5e6159]">זו התוכנית שבניתם יחד איתנו. היא שמורה, ומכאן נעבוד לפיה.</p>
        ) : null}
      </div>
      <QuarterPlanView plan={plan} mode="app" accent={accent} navTop="top-14 md:top-0" />
      <p className="border-t border-[#deddd8] pt-3 text-xs leading-5 text-[#747570]">
        לערוך את התוכנית עצמה יהיה אפשר בקרוב. בינתיים אפשר לשנות את מה שהיא בנויה עליו:{" "}
        <Link href="/decisions" className="font-bold text-[#20211f] underline underline-offset-4">
          ההחלטות שלי
        </Link>
      </p>
    </section>
  ) : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <SectionHeader section="business" title="התוכנית" />

        {error ? (
          <p className="mb-4 rounded-md border border-[#d8c3bd] bg-white px-4 py-3 text-sm text-[#7c4036]">{error}</p>
        ) : null}

        {!loaded ? <LoadingMark label="טוענים את התוכנית…" /> : null}

        {loaded ? (
          <div className="space-y-8 pb-2">
            {needsMonth || build.state !== "idle" ? <BuildRow build={build} onRetry={start} /> : null}
            {planFirst ? planView : null}
            {strategy ? <MonthSection strategy={strategy} setStrategy={setStrategy} showQuarter={!plan} /> : null}
            {planFirst ? null : planView}
            {!plan && !strategy && !needsMonth && !error ? (
              <p className="rounded-lg border border-[#e6e4dc] bg-white px-4 py-3 text-sm text-[#5e6159]">
                עוד אין תוכנית.{" "}
                <Link href="/onboarding" className="font-bold text-[#20211f] underline underline-offset-4">
                  לבנות אותה
                </Link>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

/** The first month being built: one quiet row with the stage, never a second ask. */
function BuildRow({ build, onRetry }: { build: Build; onRetry: () => void }) {
  const index = Math.max(0, GENERATE_STAGES.findIndex((s) => s.key === build.stage));
  const label = GENERATE_STAGES[index]?.label ?? GENERATE_STAGES[0].label;
  if (build.state === "failed") {
    return (
      <div role="alert" className="rounded-lg border border-[#d8c3bd] bg-white px-4 py-3 text-sm leading-6 text-[#7c4036]">
        <p className="font-bold">לא הצלחנו לבנות את החודש הראשון.</p>
        <p>{build.error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex min-h-11 cursor-pointer items-center rounded-md border border-[#cecdc7] bg-white px-4 text-sm font-bold text-[#20211f]"
        >
          לנסות שוב
        </button>
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-lg px-4 py-3" style={{ background: TONE.surface }}>
      <span aria-hidden className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full motion-reduce:animate-none" style={{ background: TONE.accent }} />
      <p className="min-w-0 flex-1 text-sm leading-6 text-[#20211f]">
        <b>בונים את החודש הראשון לפי התוכנית: </b>
        {label}…
        <span className="block text-xs text-[#5e6159]">
          שלב {index + 1} מתוך {GENERATE_STAGES.length}. אפשר לקרוא את התוכנית בינתיים, ולא לסגור את המסך.
        </span>
      </p>
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
  const quarter = strategy.long_horizon_plan || strategy.roadmap?.long_horizon_plan;
  const management = strategy.management_and_checkpoints || strategy.roadmap?.management_and_checkpoints;
  const nextUserAction = weeks.flatMap((week) => week.what_user_does || []).find(Boolean);
  const currentWeek = currentWeekOf(strategy);

  return (
    <div className="rise-stagger space-y-3.5">
      <section className="rounded-lg p-4 sm:p-6" style={{ background: TONE.surface }}>
        <p className="flex items-center gap-2 text-xs font-bold" style={{ color: TONE.accent }}>
          <IconFlag className="h-4 w-4" />
          המטרה ל{strategy.month_name_he}
        </p>
        <h2 className="mt-1 text-[17px] font-black leading-7 text-[#20211f] sm:text-xl sm:leading-8">
          {monthly?.hypothesis || strategy.usp.growth_hypothesis || strategy.usp.usp}
        </h2>
        {monthly?.targets?.length ? (
          <ul className="mt-2 space-y-0.5 border-r-2 pr-3" style={{ borderColor: TONE.accent }}>
            {monthly.targets.slice(0, 3).map((target) => (
              <li key={target} className="text-sm leading-5 text-[#5e6159]">
                {target}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 flex items-start gap-2 border-t pt-3" style={{ borderColor: TONE.border }}>
          <span className="mt-1 shrink-0" style={{ color: TONE.accent }}>
            <IconBell className="h-4 w-4" />
          </span>
          <p className="text-[15px] font-bold leading-6 text-[#20211f]">
            <span style={{ color: TONE.accent }}>מה צריך מכם: </span>
            {nextUserAction || "כרגע כלום. אנחנו ממשיכים לעבוד."}
          </p>
        </div>
      </section>

      <section aria-labelledby="weeks-heading">
        <h2 id="weeks-heading" className="mb-2 text-sm font-black text-[#20211f]">
          השבועות
        </h2>
        {weeks.length ? (
          <ol className="divide-y divide-[#eeede8] overflow-hidden rounded-lg border border-[#e6e4dc] bg-white">
            {weeks.map((week) => (
              <WeekRow key={week.week} week={week} currentWeek={currentWeek} />
            ))}
            {strategy.horizon ? (
              <li className="px-4">
                <MonthAhead horizon={strategy.horizon} onReady={setStrategy} tone="quiet" variant="line" />
              </li>
            ) : null}
          </ol>
        ) : (
          <p className="rounded-lg border border-[#e6e4dc] bg-white px-4 py-3 text-sm text-[#5e6159]">
            עדיין אין לתוכנית הזו חלוקה לשבועות.
          </p>
        )}
      </section>
      <Link
        href="/posts"
        className="group flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#20211f] px-6 text-sm font-bold text-white transition-colors hover:bg-[#343632] sm:inline-flex sm:w-auto"
      >
        לבדוק את הפוסט הבא
        <IconArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
      </Link>

      {showQuarter ? (
        <section id="quarter" className="scroll-mt-24 border-t border-[#deddd8] pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <h2 className="text-lg font-black text-[#20211f]">הרבעון</h2>
            {quarter?.horizon ? <p className="text-xs text-[#747570]">{quarter.horizon}</p> : null}
          </div>
          {quarter ? (
            <>
              <p className="mt-2 text-sm leading-6 text-[#3c3e3a]">{quarter.hypothesis}</p>
              <ol className="mt-2 divide-y divide-[#eeede8] border-y border-[#eeede8]">
                {quarter.milestones.map((milestone, index) => (
                  <MonthRow key={`${milestone.month_label}-${index}`} milestone={milestone} index={index} />
                ))}
              </ol>
            </>
          ) : (
            <p className="mt-2 text-sm leading-6 text-[#5e6159]">
              עדיין אין תוכנית לרבעון.{" "}
              <Link href="/onboarding" className="font-bold text-[#20211f] underline underline-offset-4">
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
      <div className="mt-1! flex items-start justify-between gap-4">
        <details className="group min-w-0 flex-1">
          <summary className="flex cursor-pointer list-none items-center gap-2 py-2 text-sm font-bold text-[#62635f] hover:text-[#20211f]">
            <Caret />
            למה ככה, ומתי נצטרך אתכם
          </summary>
          <div className="space-y-4 pt-1 pb-2 text-sm leading-6 text-[#62635f]">
            <div>
              <p className="text-[11px] font-bold text-[#8b8e84]">המסר המרכזי בפוסטים</p>
              <p className="mt-1 text-[#3c3e3a]">{strategy.usp.usp_one_liner}</p>
            </div>
            {events.length ? (
              <div>
                <p className="flex items-center gap-2 text-[11px] font-bold text-[#8b8e84]">
                  <IconCalendar className="h-3.5 w-3.5" />
                  המועדים שלקחנו בחשבון
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {events.slice(0, 4).map((event) => (
                    <li key={`${event.date}-${event.name}`}>
                      <span className="font-bold text-[#20211f]">
                        {event.date} · {event.name}
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
        <Link href="/decisions" className="shrink-0 py-2 text-sm text-[#747570] underline underline-offset-4">
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
      <span
        aria-hidden
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
          isNow ? "text-white" : isPast ? "border-[#d7d5cc] bg-[#f0eee6] text-[#747570]" : "border-[#dedcd8] bg-white text-[#5e6159]"
        }`}
        style={isNow ? { background: TONE.accent, borderColor: TONE.accent } : undefined}
      >
        {week.week}
      </span>
      <span className="min-w-0 flex-1 text-[15px] font-bold leading-6 text-[#20211f]">
        <span className="sr-only">שבוע {week.week}: </span>
        {week.focus}
      </span>
      {isNow ? (
        <span className="label-mark shrink-0 text-white" style={{ background: TONE.accent, borderColor: TONE.accent }}>
          השבוע
        </span>
      ) : null}
    </>
  );

  if (!hasDetails) {
    return <li className="flex min-h-11 items-center gap-3 px-4 py-2">{face}</li>;
  }

  return (
    <li style={isNow ? { background: TONE.surface } : undefined}>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-2 hover:bg-[#f8f7f4]">
          {face}
          <Caret />
        </summary>

        <div className="px-4 pb-4 sm:pr-14">
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {week.what_we_do?.length ? (
              <DetailList title="מה אנחנו עושים" items={week.what_we_do} />
            ) : null}
            {week.what_user_does?.length ? (
              <DetailList title="מה צריך מכם" items={week.what_user_does} accent />
            ) : null}
          </div>

          {week.metrics_target?.length || week.media_distribution ? (
            <div className="mt-3 flex flex-col gap-1.5 border-t border-[#e6e4dc] pt-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
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
        </div>
      </details>
    </li>
  );
}

function DetailList({ title, items, accent = false }: { title: string; items: string[]; accent?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-bold" style={{ color: accent ? TONE.accent : "#8b8e84" }}>
        {title}
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm leading-6 text-[#3c3e3a]">
            <span
              aria-hidden
              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: accent ? TONE.accent : "#b3b0a5" }}
            />
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
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold"
        style={{ borderColor: TONE.border, color: TONE.accent, background: TONE.surface }}
      >
        {index + 1}
      </span>
      <span className="min-w-0 flex-1 text-sm leading-6 text-[#20211f]">
        <span className="font-bold">{milestone.month_label}</span>
        {bareLabel && milestone.milestone ? (
          <span className="text-[#5e6159]">
            {" · "}
            {milestone.milestone}
          </span>
        ) : null}
      </span>
    </>
  );

  if (!hasBody) return <li className="flex items-center gap-3 py-2.5">{face}</li>;

  return (
    <li>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 py-2 hover:bg-[#f8f7f4]">
          {face}
          <Caret />
        </summary>
        <div className="space-y-1 pr-9 pb-3 text-sm leading-6">
          {hiddenMilestone ? <p className="font-bold text-[#20211f]">{milestone.milestone}</p> : null}
          {milestone.checkpoint ? (
            <p className="text-[#5e6159]">
              <span className="font-bold text-[#3c3e3a]">איך נדע שהצלחנו: </span>
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
    <div className="space-y-4 text-sm leading-6 text-[#3c3e3a]">
      {targets.length ? (
        <div>
          <p className="text-[11px] font-bold text-[#8b8e84]">היעדים לרבעון, לפי סדר חשיבות</p>
          <ol className="mt-1.5 space-y-1">
            {targets.map((target, index) => (
              <li key={`${target}-${index}`} className="flex items-start gap-2">
                <span className="w-4 shrink-0 font-bold" style={{ color: TONE.accent }}>
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
          <p className="text-[11px] font-bold text-[#8b8e84]">מה אנחנו עושים</p>
          <p className="mt-1">{management.how_we_help}</p>
        </div>
      ) : null}

      {management?.when_we_need_user?.length || management?.checkpoints?.length ? (
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {management?.when_we_need_user?.length ? (
            <div>
              <p className="text-[11px] font-bold text-[#8b8e84]">מתי נצטרך אתכם</p>
              <ul className="mt-1.5 space-y-1">
                {management.when_we_need_user.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex items-start gap-2 text-xs leading-5">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b3b0a5]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {management?.checkpoints?.length ? (
            <div>
              <p className="text-[11px] font-bold text-[#8b8e84]">מתי בודקים</p>
              <ul className="mt-1.5 space-y-2">
                {management.checkpoints.map((checkpoint, index) => (
                  <li key={`${checkpoint.timing}-${index}`} className="text-xs leading-5">
                    <span className="font-bold text-[#20211f]">{checkpoint.timing}</span>
                    <span className="text-[#5e6159]">
                      {": "}
                      {checkpoint.purpose}
                    </span>
                    {checkpoint.user_action ? (
                      <span className="block">
                        <span className="font-bold">מה צריך מכם: </span>
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
