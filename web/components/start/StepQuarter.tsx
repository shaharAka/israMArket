"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { QuarterPlanView, type SectionKey } from "@/components/plan/QuarterPlanView";
import { ApiError } from "@/lib/api";
import {
  chosenDirectionOf,
  draftForApi,
  fetchQuarterPlan,
  kitFor,
  planBase,
  planInputsForApi,
  type FlowState,
} from "@/lib/draft";
import { CADENCE_OPTIONS, type PlanInputKey, type PlanInputs, type QuarterPlan } from "@/lib/quarterPlan";
import { lookOf } from "./BusinessCard";
import { TargetQuestion } from "./StepGoal";
import { WorkProgress, type RevealProps } from "./StepPlan";
import { Chip, QuietLink, StepShell, rangeSafe } from "./ui";
import styles from "./start.module.css";

/**
 * "התוכנית שלכם ל-3 החודשים הקרובים": the hook before the email. One scrollable plan,
 * built from the answers and the chosen direction by `POST /public/quarter-plan`.
 *
 * The owner shapes it here, in the section each control changes: who comes first, the
 * target, how often to post, and free words ("משהו לא מתאים?"). A change goes back to the
 * API with `changed[]`, the affected sections dim while it works, and one line above the
 * button says what changed. Everything else is edited after signup.
 */

/** Which sections an owner change can rewrite, so only those show "מעדכנים". */
const AFFECTS: Record<PlanInputKey, SectionKey[]> = {
  target: ["measure"],
  cadence: ["content", "channels", "bets"],
  primary_audience: ["strategy", "calendar", "content", "bets"],
  feedback: ["strategy", "measure", "channels", "budget", "calendar", "content", "bets"],
};

const DEBOUNCE_MS = 700;
const TYPING_DEBOUNCE_MS = 1200;

function audiencesOf(flow: FlowState): string[] {
  const names = flow.draft.audiences.map((a) => a.name.trim()).filter(Boolean);
  return (names.length ? names : kitFor(flow.draft.business_type).audiences.map((a) => a.name)).slice(0, 3);
}

function primaryOf(flow: FlowState): string {
  const names = audiencesOf(flow);
  const chosen = flow.planInputs?.primary_audience;
  if (chosen && names.includes(chosen)) return chosen;
  const direction = chosenDirectionOf(flow);
  return direction && names.includes(direction.audience) ? direction.audience : names[0];
}

/** "מה השתנה" when the API does not say it itself. */
function describeChange(keys: PlanInputKey[], flow: FlowState): string {
  const notes: string[] = [];
  if (keys.includes("cadence") && flow.planInputs?.cadence) {
    notes.push(`הקצב: ${CADENCE_OPTIONS.find((o) => o.key === flow.planInputs?.cadence)?.label}.`);
  }
  if (keys.includes("target")) {
    const target = flow.draft.success?.target?.trim();
    notes.push(target ? `נמדוד מול היעד שלכם: ${target}.` : "בלי יעד מספרי. נמדוד ונראה.");
  }
  if (keys.includes("primary_audience")) notes.push(`מתחילים עם ${primaryOf(flow)}.`);
  if (keys.includes("feedback")) notes.push("התוכנית התעדכנה לפי מה שכתבתם.");
  return notes.join(" ") || "התוכנית התעדכנה.";
}

export function StepQuarter(props: RevealProps & { loggedIn: boolean; saving: boolean; saveError: string; onSave: () => void }) {
  const { flow, update, next, jump, loggedIn, saving, saveError, onSave } = props;
  const direction = chosenDirectionOf(flow);
  const base = planBase(flow);
  const plan = flow.quarterPlanFor === base ? (flow.quarterPlan ?? null) : null;
  const insights = flow.plan?.insights ?? [];

  const [failed, setFailed] = useState(false);
  const [failMessage, setFailMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<Set<SectionKey>>(new Set());
  const [changeNote, setChangeNote] = useState("");
  const [updateError, setUpdateError] = useState(false);

  const latest = useRef(flow);
  useEffect(() => {
    latest.current = flow;
  }, [flow]);
  const pending = useRef<Set<PlanInputKey>>(new Set());
  const timer = useRef<number | null>(null);
  const requestId = useRef(0);

  // The first plan for this direction and set of answers.
  useEffect(() => {
    if (!direction || (flow.quarterPlanFor === base && flow.quarterPlan)) return;
    let live = true;
    fetchQuarterPlan(draftForApi(flow), direction, planInputsForApi(flow), { insights })
      .then((result) => {
        if (!live) return;
        setFailed(false);
        update((f) => ({ ...f, quarterPlan: result, quarterPlanFor: base }));
      })
      .catch((err: unknown) => {
        if (!live) return;
        // 429 / 502 / 503 come with a Hebrew message worth showing as is.
        setFailMessage(err instanceof ApiError && /[֐-׿]/.test(err.message) ? err.message : "");
        setFailed(true);
      });
    return () => {
      live = false;
    };
    // Once per direction and set of answers (and per retry).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, attempt]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const runUpdate = useCallback(() => {
    timer.current = null;
    const current = latest.current;
    const dir = chosenDirectionOf(current);
    const keys = [...pending.current];
    pending.current = new Set();
    if (!dir || !keys.length) return;
    const id = (requestId.current += 1);
    const requestBase = planBase(current);
    const inputs: PlanInputs = { ...planInputsForApi(current), changed: keys };
    fetchQuarterPlan(draftForApi(current), dir, inputs, { insights: current.plan?.insights, previous: current.quarterPlan })
      .then((result: QuarterPlan) => {
        if (id !== requestId.current) return;
        setBusy(new Set());
        setUpdateError(false);
        setChangeNote(result.changed_he?.trim() || describeChange(keys, latest.current));
        update((f) => (planBase(f) === requestBase ? { ...f, quarterPlan: result, quarterPlanFor: requestBase } : f));
      })
      .catch(() => {
        if (id !== requestId.current) return;
        setBusy(new Set());
        setUpdateError(true);
        // Keep the keys, so "לנסות שוב" sends the same change again.
        keys.forEach((key) => pending.current.add(key));
      });
  }, [update]);

  /** An owner change: shown at once, sent after a short pause (at once for written feedback). */
  const change = useCallback(
    (keys: PlanInputKey[], delay: number = DEBOUNCE_MS) => {
      keys.forEach((key) => pending.current.add(key));
      setBusy((current) => new Set([...current, ...keys.flatMap((key) => AFFECTS[key])]));
      setChangeNote("");
      setUpdateError(false);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(runUpdate, delay);
    },
    [runUpdate],
  );

  const retryUpdate = () => {
    setBusy(new Set([...pending.current].flatMap((key) => AFFECTS[key])));
    setUpdateError(false);
    runUpdate();
  };

  const updating = busy.size > 0;
  const loading = Boolean(direction) && !plan && !failed;

  if (!direction) {
    return (
      <StepShell
        {...props}
        title="התוכנית ל-3 החודשים"
        why="קודם בוחרים כיוון, ואז נבנה ממנו את התוכנית."
        primary="לבחור כיוון"
        onPrimary={() => jump("direction")}
      >
        {null}
      </StepShell>
    );
  }

  const look = lookOf(flow);
  const accent = look.palette?.find((s) => s.role === "primary")?.hex ?? "#191b18";
  const option = flow.successOptions?.find((o) => o.key === flow.draft.success?.kpi) ?? null;

  const actionNote = plan ? (
    <p aria-live="polite" className="min-h-5 px-1 pb-1 text-center text-[13px] leading-5 text-[#2b2d28]">
      {updating ? (
        <span className="text-[#5e6159]">מעדכנים את התוכנית…</span>
      ) : updateError ? (
        <span className="font-bold text-[#9f4330]">
          לא הצלחנו לעדכן.{" "}
          <button type="button" onClick={retryUpdate} className="cursor-pointer underline underline-offset-4">
            לנסות שוב
          </button>
        </span>
      ) : changeNote ? (
        <span className={styles.rise}>
          <b>מה השתנה: </b>
          {rangeSafe(changeNote)}
        </span>
      ) : (
        <span className="text-[#6b6e65]">אפשר לשנות הכול גם אחרי ההרשמה.</span>
      )}
    </p>
  ) : null;

  const names = audiencesOf(flow);
  const primary = primaryOf(flow);

  return (
    <StepShell
      {...props}
      title="התוכנית שלכם ל-3 החודשים הקרובים"
      why={plan ? `הכיוון: ${direction.title}. כל חלק כאן נבנה מהתשובות שלכם.` : `הכיוון: ${direction.title}.`}
      primary={
        loading ? "בונים את התוכנית…" : failed && !plan ? "לנסות שוב" : updating ? "מעדכנים…" : saving ? "שומרים…" : "לשמור את התוכנית ולהיכנס"
      }
      primaryDisabled={loading || updating || saving}
      stickyAction
      stickyDesktop
      actionNote={actionNote}
      onPrimary={() => {
        if (failed && !plan) {
          setFailed(false);
          setAttempt((n) => n + 1);
          return;
        }
        if (loggedIn) onSave();
        else next();
      }}
      skip={failed && !plan ? "להמשיך בלי התוכנית ולשמור" : undefined}
      onSkip={failed && !plan ? () => jump("save") : undefined}
    >
      {loading ? (
        <WorkProgress
          title="בונים את התוכנית ל-3 החודשים…"
          note="בערך חצי דקה. אפשר להשאיר את המסך פתוח."
          pace={4500}
          lines={[
            "מחברים את הכיוון למה שגילינו",
            "קובעים את המדד ואיך נמדוד",
            "בוחרים ערוצים, ישנים וחדשים",
            "מחלקים את התקציב לפי חודשים",
            "פורשים את 3 החודשים על לוח השנה",
          ]}
        />
      ) : null}
      {failed && !plan ? (
        <div role="alert" className="rounded-xl border border-[#e2e0d8] bg-white p-4 text-sm leading-6 text-[#2b2d28]">
          <p className="font-bold text-[#191b18]">לא הצלחנו לבנות את התוכנית כרגע.</p>
          {failMessage ? <p>{failMessage}</p> : null}
          <p>הכיוון והתשובות שמורים. אפשר לנסות שוב, או לשמור ולבנות את התוכנית אחרי ההרשמה.</p>
        </div>
      ) : null}
      {plan ? (
        <QuarterPlanView
          plan={plan}
          mode="start"
          insights={insights}
          accent={accent}
          busy={busy}
          slots={{
            audience:
              names.length > 1 ? (
                <fieldset>
                  <legend className="mb-1.5 text-xs font-bold text-[#191b18]">עם מי מתחילים?</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {names.map((name) => (
                      <Chip
                        key={name}
                        label={name}
                        selected={name === primary}
                        onClick={() => {
                          if (name === primary) return;
                          update((f) => ({ ...f, planInputs: { ...(f.planInputs ?? {}), primary_audience: name } }));
                          change(["primary_audience"]);
                        }}
                        className="min-h-10 px-3"
                      />
                    ))}
                  </div>
                </fieldset>
              ) : null,
            target: (
              <TargetQuestion
                flow={flow}
                update={update}
                compact
                option={option ?? { key: plan.kpi.key, name_he: plan.kpi.name_he }}
                onChange={(typing) => change(["target"], typing ? TYPING_DEBOUNCE_MS : DEBOUNCE_MS)}
              />
            ),
            cadence: (
              <fieldset className="rounded-xl bg-[#faf9f6] px-3 py-2.5">
                <legend className="sr-only">כמה פוסטים בשבוע</legend>
                <p aria-hidden className="mb-1.5 text-xs font-bold text-[#191b18]">
                  כמה פוסטים בשבוע מתאים לכם?
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CADENCE_OPTIONS.map((c) => (
                    <Chip
                      key={c.key}
                      label={c.label}
                      selected={flow.planInputs?.cadence === c.key}
                      onClick={() => {
                        if (flow.planInputs?.cadence === c.key) return;
                        update((f) => ({ ...f, planInputs: { ...(f.planInputs ?? {}), cadence: c.key } }));
                        change(["cadence"]);
                      }}
                      className="min-h-10 px-3"
                    />
                  ))}
                </div>
              </fieldset>
            ),
            end: (
              <Feedback
                saved={flow.planFeedback ?? ""}
                busy={busy.has("strategy") && busy.size > 5}
                onSend={(words) => {
                  update((f) => ({ ...f, planFeedback: words }));
                  change(["feedback"], 0);
                }}
              />
            ),
          }}
        />
      ) : null}
      {saveError ? (
        <p role="alert" className="text-sm font-bold text-[#9f4330]">
          {saveError}
        </p>
      ) : null}
    </StepShell>
  );
}

/** "משהו לא מתאים? ספרו לנו": the owner's own words re-run the plan. */
function Feedback({ saved, busy, onSend }: { saved: string; busy: boolean; onSend: (words: string) => void }) {
  const [open, setOpen] = useState(Boolean(saved));
  const [text, setText] = useState(saved);
  const [error, setError] = useState("");
  const fieldId = useId();

  if (!open) {
    return (
      <div className="border-t border-[#e2e0d8] pt-3">
        <QuietLink onClick={() => setOpen(true)}>משהו לא מתאים? ספרו לנו</QuietLink>
      </div>
    );
  }
  return (
    <div className="space-y-2 border-t border-[#e2e0d8] pt-4">
      <label htmlFor={fieldId} className="block text-sm font-bold text-[#191b18]">
        משהו לא מתאים? ספרו לנו במילים שלכם
      </label>
      <textarea
        id={fieldId}
        value={text}
        onChange={(event) => {
          setError("");
          setText(event.target.value);
        }}
        rows={2}
        maxLength={400}
        placeholder="למשל: אין לנו זמן לסרטונים, ובדצמבר אנחנו סגורים שבוע"
        className="w-full resize-none rounded-lg border border-[#dedcd4] bg-white px-3.5 py-2.5 text-base leading-6 text-[#191b18] outline-none placeholder:text-[#a3a59c] focus:border-[#191b18] focus:ring-1 focus:ring-[#191b18]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const words = text.trim();
            if (words.length < 3) {
              setError("כתבו במשפט קצר מה הייתם רוצים אחרת.");
              return;
            }
            onSend(words);
          }}
          className="min-h-11 cursor-pointer rounded-full border border-[#191b18] bg-white px-4 text-sm font-bold text-[#191b18] disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? "מעדכנים את התוכנית…" : "לעדכן את התוכנית"}
        </button>
        <QuietLink
          onClick={() => {
            setOpen(false);
            setText(saved);
            setError("");
          }}
        >
          ביטול
        </QuietLink>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-bold text-[#9f4330]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
