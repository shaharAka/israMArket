"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatPrice, NO_COMMITMENT_LABEL, VAT_NOTE } from "@/lib/pricing";
import { IconArrowLeft, IconCheck, IconLock } from "@/lib/icons";
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

export function minutesLabel(minutes: number) {
  return minutes <= 1 ? "דקה" : `${minutes} דק׳`;
}

/** The price line of the last step, from the one place the price lives. */
function continueLine() {
  return `${formatPrice()} לחודש אחרי החודש החינמי, ${VAT_NOTE}. ${NO_COMMITMENT_LABEL}, והתשלום עוד לא פתוח.`;
}

/**
 * The free month, as Today's guide: the day, the one next thing, and the four weeks.
 *
 * The next thing is the page's only dark button (UI-RULES rule 1). The weeks are native
 * expands, so a closed week's steps are out of the reading order and the word count; the
 * current week — or the week the next step is in — opens by default.
 */
export function TrialGuide({ trial }: { trial: TrialPayload }) {
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
  const openWeek = targetWeek ?? (next && next.week > trial.week ? next.week : trial.week);
  const percent = Math.round((trial.day / trial.days_total) * 100);

  return (
    <section aria-labelledby="trial-heading" className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="trial-heading" className="text-base font-black text-[#20211f]">
            {trial.ended ? "החודש החינמי הסתיים" : `יום ${trial.day} מתוך ${trial.days_total} בחודש החינמי`}
          </h2>
          <p className="shrink-0 text-xs font-bold text-[#62635f]">
            {trial.done} מתוך {trial.total} צעדים
          </p>
        </div>
        <span
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={trial.days_total}
          aria-valuenow={trial.day}
          aria-label="הימים בחודש החינמי"
          className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-[#e1e0db]"
        >
          <span
            className="block h-full rounded-full bg-[#374b3d] transition-[width] duration-700 ease-out motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </span>
      </div>

      {next ? <NextStepCard step={next} /> : <AllDone trial={trial} />}

      <div className="divide-y divide-[#e9e8e3] overflow-hidden rounded-lg border border-[#e6e4dc] bg-white">
        {[1, 2, 3, 4].map((week) => {
          const steps = trial.steps.filter((step) => step.week === week);
          if (!steps.length) return null;
          return (
            <WeekGroup
              key={`${week}-${openWeek === week}`}
              week={week}
              steps={steps}
              open={openWeek === week}
              current={trial.week === week}
              nextKey={next?.key ?? null}
              fresh={fresh}
              target={target}
            />
          );
        })}
      </div>
    </section>
  );
}

/** The one thing to do now: why, how long, and the page's dark button. */
function NextStepCard({ step }: { step: TrialStep }) {
  const buttonClass =
    "group mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#20211f] px-6 text-sm font-bold text-white transition-colors hover:bg-[#343632] disabled:opacity-60 sm:w-auto";
  const label = (
    <>
      {step.action_he}
      <IconArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1 motion-reduce:transition-none" />
    </>
  );
  return (
    <div className="rounded-lg border border-[#cecdc7] bg-white p-4 sm:p-5">
      <p className="text-xs font-bold text-[#747570]">
        הצעד הבא · {minutesLabel(step.minutes)}
      </p>
      <h3 className="mt-1 text-lg font-black leading-7 text-[#20211f]">{step.title_he}</h3>
      <p className="mt-1 text-sm leading-6 text-[#3c3e3a]">{step.why_he}</p>
      {step.key === "start_posts" ? (
        <StartPostsButton className={buttonClass}>{label}</StartPostsButton>
      ) : (
        <Link href={step.href} className={buttonClass}>
          {label}
        </Link>
      )}
    </div>
  );
}

/** "להתחיל לכתוב את הפוסטים" is an action, not a page: it asks us to start, then shows the posts. */
function StartPostsButton({ className, children }: { className: string; children: React.ReactNode }) {
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
          ? "הכתיבה לפי הבחירות שלכם עוד לא פתוחה. נעדכן כאן כשהיא מוכנה."
          : err instanceof Error && err.message
            ? err.message
            : "לא הצלחנו להתחיל לכתוב. נסו שוב."
      );
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" onClick={() => void start()} disabled={busy} aria-busy={busy} className={className}>
        {busy ? "מתחילים לכתוב…" : children}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[#9f4330]">
          {error}
        </p>
      ) : null}
    </>
  );
}

/** Nothing can be done right now: say so, and what unlocks next. */
function AllDone({ trial }: { trial: TrialPayload }) {
  const waiting = trial.steps.find((step) => step.status === "locked");
  return (
    <div className="rounded-lg border border-[#cecdc7] bg-white p-4 sm:p-5">
      <p className="flex items-center gap-2 text-base font-black text-[#20211f]">
        <IconCheck className="h-4 w-4 shrink-0" />
        {waiting ? "כל מה שאפשר לעשות עכשיו, עשיתם" : "עברתם את כל הצעדים של החודש"}
      </p>
      {waiting ? (
        <p className="mt-1 text-sm leading-6 text-[#62635f]">
          הבא בתור: {waiting.title_he}. {waiting.note_he}
        </p>
      ) : null}
    </div>
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
  const counted = steps.filter((step) => step.status !== "soon");
  const done = counted.filter((step) => step.status === "done").length;
  const complete = counted.length > 0 && done === counted.length;
  const settled = steps.filter((step) => step.status === "done" && !fresh.has(step.key));
  const open_ = steps.filter((step) => !(step.status === "done" && !fresh.has(step.key)));
  return (
    <details open={open} className="group">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-[#faf9f7]">
        <span
          aria-hidden
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            complete
              ? "bg-[#374b3d] text-white"
              : current
                ? "bg-[#20211f] text-white"
                : "border border-[#dedcd4] text-[#62635f]"
          }`}
        >
          {complete ? <IconCheck className="h-3 w-3" /> : week}
        </span>
        <span className="min-w-0 flex-1 text-sm font-bold text-[#20211f]">
          {weekLabel(week)}
        </span>
        <span className="shrink-0 text-xs text-[#62635f]">
          {done}/{counted.length}
        </span>
        <span
          aria-hidden
          className="h-0 w-0 shrink-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-[#8b8e84] transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <ul className="divide-y divide-[#f0efea] border-t border-[#f0efea]">
        {/* Steps done before this visit fold into one line, so the open week reads as what
            is left; a step ticked since the last visit stays in place for its animation. */}
        {settled.length ? (
          <li>
            <details className="group/done">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-2.5 text-xs font-bold text-[#62635f] hover:bg-[#faf9f7]">
                <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#374b3d] text-white">
                  <IconCheck className="h-3 w-3" />
                </span>
                <span className="flex-1">{settled.length === 1 ? "צעד אחד בוצע" : `${settled.length} צעדים בוצעו`}</span>
                <span
                  aria-hidden
                  className="h-0 w-0 shrink-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-[#b3b0a5] transition-transform duration-200 group-open/done:rotate-180"
                />
              </summary>
              <ul className="divide-y divide-[#f0efea] border-t border-[#f0efea]">
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

function StatusMark({ step, fresh }: { step: TrialStep; fresh: boolean }) {
  if (step.status === "done") {
    return (
      <span
        aria-hidden
        className={`relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#374b3d] text-white ${
          fresh ? "trial-tick" : ""
        }`}
      >
        <IconCheck className="h-3 w-3" />
      </span>
    );
  }
  if (step.status === "locked") {
    return (
      <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center text-[#9a9b95]">
        <IconLock className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={`block h-5 w-5 shrink-0 rounded-full border ${
        step.status === "soon" ? "border-dashed border-[#c7c4b8]" : "border-[#b3b0a5] bg-white"
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
      <StatusMark step={step} fresh={fresh} />
      <span className="min-w-0 flex-1">
        <span className="sr-only">{STATUS_SR[step.status]}: </span>
        <span
          className={`block text-sm font-bold leading-6 ${
            step.status === "done" ? "text-[#8b8e84] line-through decoration-[#c7c4b8]" : muted ? "text-[#62635f]" : "text-[#20211f]"
          } ${fresh ? "trial-fade-done" : ""}`}
        >
          {step.title_he}
        </span>
        {detail ? <span className="mt-0.5 block text-xs leading-5 text-[#62635f]">{detail}</span> : null}
      </span>
      {step.status === "soon" ? (
        <span className="shrink-0 rounded-full bg-[#f0efea] px-2 py-0.5 text-[11px] font-bold text-[#62635f]">בקרוב</span>
      ) : step.status === "todo" ? (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-[#62635f]">
          {minutesLabel(step.minutes)}
          <IconArrowLeft className="h-4 w-4 text-[#8b8e84]" />
        </span>
      ) : null}
    </>
  );

  // The next step is tinted in the list too, so the card and the map point at one place.
  const rowTitle = step.status === "soon" ? step.note_he : undefined;
  const rowClass = `flex min-h-12 items-start gap-3 px-4 py-3 ${isNext ? "bg-[#f3f6f1]" : ""} ${
    highlighted ? "trial-highlight" : ""
  }`;

  return (
    <li id={`step-${step.key}`} className="scroll-mt-24">
      {step.status === "todo" && step.href ? (
        <Link href={step.href} className={`${rowClass} transition-colors hover:bg-[#faf9f7]`}>
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
