"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatPrice, NO_COMMITMENT_LABEL, VAT_NOTE } from "@/lib/pricing";
import { IconArrowLeft, IconCheck, IconChevron, IconLock } from "@/lib/icons";
import { ApiError } from "@/lib/api";
import { nextStep, startPosts, weekLabel, type TrialPayload, type TrialStep } from "@/lib/trial";
import "./trial.css";

/** Which steps this browser has already seen ticked, so a new tick can be celebrated once.
 *  A per-viewer nicety: without storage every tick is simply shown as done, still. */
const SEEN_DONE_KEY = "isramarket_trial_seen_done";

function readSeenDone(): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(SEEN_DONE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function writeSeenDone(keys: string[]) {
  try {
    window.localStorage.setItem(SEEN_DONE_KEY, JSON.stringify(keys));
  } catch {
    // Storage is the memory of the animation, not of the progress.
  }
}

export function minutesLabel(minutes: number, t: (text: string, args?: Record<string, string | number>) => string = text => text) {
  return minutes <= 1 ? t("דקה") : t("{arg_0} דק׳", { arg_0: minutes });
}

/** The price line of the last step, from the one place the price lives. */
function continueLine() {
  // Paying happens on /billing, near the end of the free month (docs/billing.md).
  return `${formatPrice()} לחודש אחרי החודש החינמי, ${VAT_NOTE}. ${NO_COMMITMENT_LABEL}.`;
}

/**
 * Where the free month stands: "יום N מתוך 30", with a calm bar. Today's header carries it
 * beside the page title, so the journey below is only the map.
 */
export function TrialDay({ trial }: { trial: TrialPayload }) {
  const t = useCopy();
  if (trial.ended) {
    return <p className="text-sm font-medium text-[color:var(--ink-soft)]"><Copy text="החודש החינמי הסתיים" /></p>;
  }
  const percent = Math.round((trial.day / trial.days_total) * 100);
  return (
    <div className="flex items-center gap-3">
      <p className="text-sm font-medium text-[color:var(--ink-soft)]">
        <Copy text="יום" /><span className="font-semibold tabular-nums text-[color:var(--ink)]">{trial.day}</span> <Copy text="מתוך" />{" "}
        <span className="tabular-nums">{trial.days_total}</span> <Copy text="בחודש החינמי" /></p>
      <span
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={trial.days_total}
        aria-valuenow={trial.day}
        aria-label={t("הימים בחודש החינמי")}
        className="block h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-[var(--rule)] sm:w-28"
      >
        <span
          className="block h-full rounded-full bg-[var(--primary)] transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </span>
    </div>
  );
}

/**
 * The free month, as Today's guide: the one next thing, and the four weeks. The day itself
 * sits in the page header (TrialDay).
 *
 * The next thing is the page's only dark button (UI-RULES rule 1). The weeks are native
 * expands, so a closed week's steps are out of the reading order and the word count; the
 * current week — or the week the next step is in — opens by default.
 */
export function TrialGuide({
  trial,
  showNext = true,
}: {
  trial: TrialPayload;
  /** False when the page's brief already carries the next step (Today's PlanBrief). */
  showNext?: boolean;
}) {
  const next = nextStep(trial);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  const doneKeys = trial.steps.filter((step) => step.status === "done").map((step) => step.key);
  const doneSignature = doneKeys.join(",");

  // New ticks since this browser last looked get one small animation. The first visit
  // records the state quietly: nothing the owner did "just now" is being celebrated.
  useEffect(() => {
    const keys = doneSignature ? doneSignature.split(",") : [];
    const seen = readSeenDone();
    const timer = window.setTimeout(() => {
      if (seen) setFresh(new Set(keys.filter((key) => !seen.has(key))));
      writeSeenDone(keys);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [doneSignature]);

  // A link from an empty state lands on `#step-<key>`: open its week and bring it into view.
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      const hash = window.location.hash.replace(/^#step-/, "");
      setTarget(hash && hash !== window.location.hash ? hash : null);
    };
    const timer = window.setTimeout(read, 0);
    window.addEventListener("hashchange", read);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", read);
    };
  }, []);
  useEffect(() => {
    if (!target) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(`step-${target}`)?.scrollIntoView({ block: "center" })
    );
    return () => cancelAnimationFrame(frame);
  }, [target]);

  const targetWeek = target ? trial.steps.find((step) => step.key === target)?.week : undefined;
  // These groups are readiness stages, not a timetable. Billing days stay in TrialDay.
  const currentStage = next?.week ?? 4;
  const openWeek = targetWeek ?? currentStage;

  return (
    <section aria-labelledby="trial-heading" className="space-y-8">
      {showNext ? next ? <NextStepCard step={next} /> : <AllDone trial={trial} /> : null}

      <div className="drawn-card overflow-hidden">
        <div className="flex min-h-[52px] items-center border-b border-[var(--rule)] px-5 py-3 sm:px-6">
          <h2 id="trial-heading" className="text-sm font-semibold text-[color:var(--ink)]">
            <span className="tabular-nums">{trial.done}</span> <Copy text="מתוך" /><span className="tabular-nums">{trial.total}</span> <Copy text="צעדים" /></h2>
        </div>
        <div className="divide-y divide-[var(--rule)]">
          {[1, 2, 3, 4].map((week) => {
            const steps = trial.steps.filter((step) => step.week === week);
            if (!steps.length) return null;
            return (
              <WeekGroup
                key={`${week}-${openWeek === week}`}
                week={week}
                steps={steps}
                open={openWeek === week}
                current={currentStage === week}
                nextKey={next?.key ?? null}
                fresh={fresh}
                target={target}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** The one thing to do now: why, how long, and the page's dark button. */
function NextStepCard({ step }: { step: TrialStep }) {
  const t = useCopy();
  return (
    <div className="drawn-card p-6 sm:p-8">
      <div className="rounded-[14px] bg-[var(--primary-soft)] p-5 sm:p-6">
        <p className="text-[13px] font-semibold text-[color:var(--primary)]">
          <Copy text="הצעד הבא" /><span className="font-medium text-[color:var(--ink-soft)]">· {minutesLabel(step.minutes, t)}</span>
        </p>
        <h3 className="mt-1.5 text-[19px] font-bold leading-snug tracking-tight text-[color:var(--ink)]">{t(step.title_he)}</h3>
        <p className="mt-1.5 max-w-[600px] text-[15px] leading-relaxed text-[color:var(--ink-soft)]">{t(step.why_he)}</p>
        <NextStepAction step={step} className="mt-5" />
      </div>
    </div>
  );
}

/**
 * The next step's button — the page's one dark fill. A link to where the step is done,
 * or, for "להתחיל לכתוב את הפוסטים", the action itself.
 */
export function NextStepAction({ step, className = "" }: { step: TrialStep; className?: string }) {
  const buttonClass = `drawn-button group inline-flex min-h-12 w-full items-center justify-center gap-2 bg-[var(--primary)] px-6 text-[15px] font-semibold text-white disabled:opacity-60 sm:w-auto ${className}`;
  const label = (
    <>
      {step.action_he}
      <IconArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1 motion-reduce:transition-none" />
    </>
  );
  return step.key === "start_posts" ? (
    <StartPostsButton className={buttonClass}>{label}</StartPostsButton>
  ) : (
    <Link href={step.href} className={buttonClass}>
      {label}
    </Link>
  );
}

/** "להתחיל לכתוב את הפוסטים" is an action, not a page: it asks us to start, then shows the posts. */
function StartPostsButton({ className, children }: { className: string; children: React.ReactNode }) {
  const t = useCopy();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    setBusy(true);
    setError("");
    try {
      await startPosts();
      router.push("/posts");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? t("הכתיבה לפי הבחירות שלכם עוד לא פתוחה. נעדכן כאן כשהיא מוכנה.")
          : err instanceof Error && err.message
            ? err.message
            : t("לא הצלחנו להתחיל לכתוב. נסו שוב.")
      );
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" onClick={() => void start()} disabled={busy} aria-busy={busy} className={className}>
        {busy ? t("מתחילים לכתוב…") : children}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </>
  );
}

/** Nothing can be done right now: say so, and what unlocks next. */
export function allDoneText(trial: TrialPayload, t: ReturnType<typeof useCopy> = text => text): string {
  const waiting = trial.steps.find((step) => step.status === "locked");
  return waiting
    ? t("כל מה שאפשר לעשות עכשיו, עשיתם. הבא בתור: {arg_0}. {arg_1}", { arg_0: t(waiting.title_he), arg_1: t(waiting.note_he || "") }).trim()
    : t("עברתם את כל הצעדים של החודש");
}

function AllDone({ trial }: { trial: TrialPayload }) {
  const t = useCopy();
  const waiting = trial.steps.find((step) => step.status === "locked");
  return (
    <div className="drawn-card p-6 sm:p-8">
      <p className="flex items-center gap-2.5 text-[17px] font-bold text-[color:var(--ink)]">
        <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[color:var(--primary)]">
          <IconCheck className="h-3.5 w-3.5" />
        </span>
        {waiting ? t("כל מה שאפשר לעשות עכשיו, עשיתם") : t("עברתם את כל הצעדים של החודש")}
      </p>
      {waiting ? (
        <p className="mt-2 text-[15px] leading-relaxed text-[color:var(--ink-soft)]">
          <Copy text="הבא בתור:" />{t(waiting.title_he)}. {t(waiting.note_he || "")}
        </p>
      ) : null}
    </div>
  );
}

/** A closed disclosure points down; open, up. The icon is the app's chevron, turned. */
function Disclosure({ group }: { group: "week" | "done" }) {
  return (
    <IconChevron
      className={`h-4 w-4 shrink-0 -rotate-90 text-[color:var(--ink-muted)] transition-transform duration-200 motion-reduce:transition-none ${
        group === "week" ? "group-open/week:rotate-90" : "group-open/done:rotate-90"
      }`}
    />
  );
}

function WeekGroup({
  week,
  steps,
  open,
  current,
  nextKey,
  fresh,
  target,
}: {
  week: number;
  steps: TrialStep[];
  open: boolean;
  current: boolean;
  nextKey: string | null;
  fresh: Set<string>;
  target: string | null;
}) {
  const t = useCopy();
  const counted = steps.filter((step) => step.status !== "soon");
  const done = counted.filter((step) => step.status === "done").length;
  const complete = counted.length > 0 && done === counted.length;
  const settled = steps.filter((step) => step.status === "done" && !fresh.has(step.key));
  const open_ = steps.filter((step) => !(step.status === "done" && !fresh.has(step.key)));
  return (
    <details open={open} className="group/week">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--soft)] sm:px-6 [&::-webkit-details-marker]:hidden">
        {/* The week that is now is the strong mark; a finished week recedes into a soft tick. */}
        <span
          aria-hidden
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums ${
            current && !complete
              ? "bg-[var(--primary)] text-white"
              : complete
                ? "bg-[var(--primary-soft)] text-[color:var(--primary)]"
                : "bg-[var(--soft)] text-[color:var(--ink-muted)]"
          }`}
        >
          {complete ? <IconCheck className="h-3.5 w-3.5" /> : week}
        </span>
        <span className={`min-w-0 flex-1 text-[15px] font-semibold ${current || complete ? "text-[color:var(--ink)]" : "text-[color:var(--ink-soft)]"}`}>
          {weekLabel(week)}
        </span>
        <span className="shrink-0 text-[13px] tabular-nums text-[color:var(--ink-muted)]">
          {done}/{counted.length}
        </span>
        <Disclosure group="week" />
      </summary>
      <ul className="journey-steps pb-2">
        {/* Steps done before this visit fold into one line, so the open week reads as what
            is left; a step ticked since the last visit stays in place for its animation. */}
        {settled.length ? (
          <li>
            <details className="group/done">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-4 py-2.5 ps-6 pe-5 text-[13px] font-medium text-[color:var(--ink-soft)] transition-colors hover:bg-[var(--soft)] sm:ps-7 sm:pe-6 [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[color:var(--primary)]">
                  <IconCheck className="h-3 w-3" />
                </span>
                <span className="flex-1">{settled.length === 1 ? t("צעד אחד בוצע") : t("{arg_0} צעדים בוצעו", { arg_0: settled.length })}</span>
                <Disclosure group="done" />
              </summary>
              <ul className="journey-steps">
                {settled.map((step) => (
                  <StepRow key={step.key} step={step} isNext={false} fresh={false} highlighted={step.key === target} />
                ))}
              </ul>
            </details>
          </li>
        ) : null}
        {open_.map((step) => (
          <StepRow
            key={step.key}
            step={step}
            isNext={step.key === nextKey}
            fresh={fresh.has(step.key)}
            highlighted={step.key === target}
          />
        ))}
      </ul>
    </details>
  );
}

function StatusMark({ step, fresh, isNext }: { step: TrialStep; fresh: boolean; isNext: boolean }) {
  if (step.status === "done") {
    return (
      <span
        aria-hidden
        className={`relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[color:var(--primary)] ${
          fresh ? "trial-tick" : ""
        }`}
      >
        <IconCheck className="h-3 w-3" />
      </span>
    );
  }
  if (step.status === "locked") {
    return (
      <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[color:var(--ink-muted)]">
        <IconLock className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={`mt-0.5 block h-5 w-5 shrink-0 rounded-full border-[1.5px] ${
        step.status === "soon"
          ? "border-dashed border-[var(--rule-dark)]"
          : isNext
            ? "border-[var(--primary)] bg-[var(--paper)]"
            : "border-[var(--rule-dark)] bg-[var(--paper)]"
      }`}
    />
  );
}

const STATUS_SR: Record<TrialStep["status"], string> = {
  done: "בוצע",
  todo: "לעשות",
  locked: "עוד לא אפשר",
  soon: "בקרוב",
};

/** One step. A step that can be done is a link to where it is done; the rest are text. */
function StepRow({
  step,
  isNext,
  fresh,
  highlighted,
}: {
  step: TrialStep;
  isNext: boolean;
  fresh: boolean;
  highlighted: boolean;
}) {
  const t = useCopy();
  const muted = step.status === "done" || step.status === "locked" || step.status === "soon";
  // The list is a map, not a second explanation: the why of a step is on the card when it
  // is the next one. Only what the owner cannot guess stays on the row — why a step waits,
  // and the price on the last one.
  const detail =
    step.key === "month_review"
      ? `${step.status === "locked" ? `${step.note_he} ` : ""}${continueLine()}`
      : step.status === "locked"
        ? step.note_he
        : null; // a `soon` step's pill says it; its note is the row's tooltip

  const body = (
    <>
      <StatusMark step={step} fresh={fresh} isNext={isNext} />
      <span className="min-w-0 flex-1">
        <span className="sr-only">{t(STATUS_SR[step.status])}: </span>
        <span
          className={`block text-[15px] leading-6 ${
            step.status === "done"
              ? "text-[color:var(--ink-muted)] line-through decoration-[var(--rule-dark)]"
              : muted
                ? "text-[color:var(--ink-soft)]"
                : `${isNext ? "font-semibold" : "font-medium"} text-[color:var(--ink)]`
          } ${fresh ? "trial-fade-done" : ""}`}
        >
          {t(step.title_he)}
        </span>
        {detail ? <span className="mt-0.5 block text-[13px] leading-5 text-[color:var(--ink-muted)]">{t(detail)}</span> : null}
      </span>
      {step.status === "soon" ? (
        <span className="shrink-0 rounded-full bg-[var(--soft)] px-2.5 py-0.5 text-xs font-medium text-[color:var(--ink-soft)]"><Copy text="בקרוב" /></span>
      ) : step.status === "todo" ? (
        <span className="flex h-6 shrink-0 items-center gap-2 text-[13px] tabular-nums text-[color:var(--ink-muted)]">
          {minutesLabel(step.minutes, t)}
          <IconChevron className="h-4 w-4 transition-transform duration-200 group-hover/step:-translate-x-0.5 motion-reduce:transition-none" />
        </span>
      ) : null}
    </>
  );

  // The next step is tinted in the list too, so the card and the map point at one place.
  const rowTitle = step.status === "soon" ? step.note_he : undefined;
  const rowClass = `flex min-h-12 items-start gap-4 py-3 ps-6 pe-5 sm:ps-7 sm:pe-6 ${isNext ? "bg-[var(--primary-soft)]" : ""} ${
    highlighted ? "trial-highlight" : ""
  }`;

  return (
    <li id={`step-${step.key}`} className="journey-step scroll-mt-24">
      {step.status === "todo" && step.href ? (
        <Link href={step.href} className={`group/step ${rowClass} transition-colors ${isNext ? "" : "hover:bg-[var(--soft)]"}`}>
          {body}
        </Link>
      ) : (
        <div className={rowClass} title={rowTitle}>
          {body}
        </div>
      )}
    </li>
  );
}
