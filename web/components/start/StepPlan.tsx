"use client";

import { useEffect, useId, useState } from "react";
import { ApiError, type PlanInsight, type PlanPreview } from "@/lib/api";
import { draftForApi, fetchPlanPreview, revisePlan, signature } from "@/lib/draft";
import type { StepId } from "./script";
import type { StepProps } from "./steps";
import { UIAction } from "@/components/design/Controls";
import { CheckMark, QuietLink, StepShell } from "./ui";
import styles from "./start.module.css";
import form from "./form.module.css";

/**
 * The first two screens of "מה למדנו ואיך מתקדמים": what we found (the sourced insights,
 * on their own screen), and the two directions for the first month, with a way to say
 * "something else" in the owner's own words. The 3-month plan comes after.
 */

export type RevealProps = StepProps & { jump: (step: StepId) => void };

const SOURCE_HE: Record<string, string> = {
  site: "מהאתר שלכם",
  answers: "ממה שסיפרתם",
  calendar: "מלוח השנה",
  category: "מה שידוע על עסקים כמו שלכם",
  industry: "מה שידוע על עסקים כמו שלכם",
  social: "מהרשתות",
};

export function sourceLabel(source: PlanInsight["source"]): string {
  return SOURCE_HE[source] ?? source;
}

const LETTERS = ["א׳", "ב׳"];

/** A paced checklist for a model call that takes a while. Honest: it only paces, never claims done. */
export function WorkProgress({ title, note, lines, pace = 5500 }: { title: string; note: string; lines: string[]; pace?: number }) {
  const [at, setAt] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setAt((i) => Math.min(i + 1, lines.length - 1)), pace);
    return () => window.clearInterval(timer);
  }, [lines.length, pace]);
  return (
    <div role="status" aria-live="polite" className={styles.work}>
      <p className="text-[16px] font-semibold text-[color:var(--ink)]">{title}</p>
      <p className="mt-0.5 text-[13px] text-[color:var(--ink-muted)]">{note}</p>
      <ol className="mt-4 space-y-3 border-t border-[var(--rule)] pt-4">
        {lines.map((line, index) => (
          <li
            key={line}
            className={`flex items-center gap-3 text-[14.5px] ${
              index < at ? "text-[color:var(--ink-soft)]" : index === at ? "font-semibold text-[color:var(--ink)]" : "text-[color:var(--ink-muted)]"
            }`}
          >
            {index < at ? (
              <CheckMark className="h-4 w-4 shrink-0 text-[color:var(--primary)]" />
            ) : (
              <span
                className={`mx-[3px] h-2.5 w-2.5 shrink-0 rounded-full ${index === at ? `bg-[var(--sun)] ${styles.shimmer}` : "bg-[var(--rule-dark)]"}`}
              />
            )}
            {index === at ? `${line}…` : line}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The plan preview for the current answers: fetched once per set of answers, kept in the flow. */
function usePlan({ flow, update }: Pick<StepProps, "flow" | "update">) {
  const draft = draftForApi(flow);
  const brand = flow.brandScan?.status === "ready" ? flow.brandScan.brand : null;
  const want = signature([draft, brand ? "brand" : ""]);
  const [failed, setFailed] = useState(false);
  const [failMessage, setFailMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const plan = flow.planFor === want ? (flow.plan ?? null) : null;

  useEffect(() => {
    if (flow.planFor === want && flow.plan) return;
    let live = true;
    fetchPlanPreview(draft, brand)
      .then((result) => {
        if (!live) return;
        setFailed(false);
        update((f) => ({ ...f, plan: result, planFor: want, chosenDirection: null }));
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
    // Once per set of answers (and per retry); the payload is derived from the flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, attempt]);

  return {
    plan,
    brand,
    loading: !plan && !failed,
    failed: failed && !plan,
    failMessage,
    retry: () => {
      setFailed(false);
      setAttempt((n) => n + 1);
    },
  };
}

function ResearchProgress({ hasSite }: { hasSite: boolean }) {
  return (
    <WorkProgress
      title="חוקרים את העסק שלכם…"
      note="זה לוקח בערך חצי דקה. אפשר להשאיר את המסך פתוח."
      lines={[
        "קוראים את מה שסיפרתם",
        ...(hasSite ? ["בודקים מה ראינו באתר"] : []),
        "בודקים מה קורה בלוח השנה",
        "משווים לעסקים כמו שלכם",
        "מנסחים 2 כיוונים לחודש הראשון",
      ]}
    />
  );
}

function PlanFailed({ message }: { message: string }) {
  return (
    <div role="alert" className={`${styles.work} text-[15px] leading-6 text-[color:var(--ink-soft)]`}>
      <p className="font-semibold text-[color:var(--ink)]">לא הצלחנו לחקור כרגע.</p>
      {message ? <p>{message}</p> : null}
      <p>אפשר לנסות שוב, או להמשיך ולבנות את הכיוון אחרי ההרשמה. שום דבר ממה שסיפרתם לא הולך לאיבוד.</p>
    </div>
  );
}

/* --------------------------------- מה גילינו --------------------------------- */

export function StepFound(props: RevealProps) {
  const { flow, next, jump } = props;
  const { plan, loading, failed, failMessage, retry } = usePlan(props);
  return (
    <StepShell
      {...props}
      title="מה גילינו"
      why={loading ? "רגע, מחברים את כל מה שסיפרתם." : "מהתשובות שלכם ומהמחקר. מכאן נבנה את האסטרטגיה והצעדים הראשונים."}
      primary={loading ? "חוקרים…" : failed ? "לנסות שוב" : "לבנות את התוכנית שלכם"}
      primaryDisabled={loading}
      onPrimary={() => (failed ? retry() : next())}
      skip={failed ? "להמשיך בלי זה ולשמור" : undefined}
      onSkip={failed ? () => jump("save") : undefined}
    >
      {loading ? <ResearchProgress hasSite={Boolean(flow.draft.links.website)} /> : null}
      {failed ? <><PlanFailed message={failMessage} />{failMessage.includes("קישור") ? <div><QuietLink tone="action" onClick={() => jump("links")}>לתקן את הקישור באתר וברשתות</QuietLink></div> : null}</> : null}
      {plan ? <InsightList insights={plan.insights} /> : null}
    </StepShell>
  );
}

function InsightList({ insights }: { insights: PlanInsight[] }) {
  return (
    <ul className={`${form.list} ${styles.stagger}`}>
      {insights.slice(0, 4).map((insight, index) => (
        <li key={index} className="px-5 py-4">
          <p className="mb-1.5 text-[12.5px] font-semibold text-[color:var(--primary)]">{sourceLabel(insight.source)}</p>
          <p className="text-[15.5px] leading-[1.6] text-[color:var(--ink)]">{insight.text_he}</p>
          {insight.detail_he ? <p className="mt-1 text-[13.5px] leading-[1.55] text-[color:var(--ink-soft)]">{insight.detail_he}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------- הכיוון ---------------------------------- */

export function StepDirection(props: RevealProps) {
  const { flow, update, next, jump } = props;
  const { plan, brand, loading, failed, failMessage, retry } = usePlan(props);
  const [error, setError] = useState("");
  const chosen = plan && flow.chosenDirection != null ? flow.chosenDirection : null;

  return (
    <StepShell
      {...props}
      title="הכיוון לחודש הראשון"
      why={loading ? "רגע, מחברים את כל מה שסיפרתם." : "שתי דרכים טובות להתחיל. בחרו אחת, ונבנה ממנה את הצעדים הראשונים."}
      primary={loading ? "חוקרים…" : failed ? "לנסות שוב" : "לבנות את התוכנית שלכם"}
      primaryDisabled={loading}
      stickyAction
      onPrimary={() => {
        if (failed) return retry();
        if (chosen == null) {
          setError("בחרו אחד משני הכיוונים. אפשר לשנות אחר כך.");
          return;
        }
        next();
      }}
      skip={failed ? "להמשיך בלי זה ולשמור" : undefined}
      onSkip={failed ? () => jump("save") : undefined}
    >
      {loading ? <ResearchProgress hasSite={Boolean(flow.draft.links.website)} /> : null}
      {failed ? <PlanFailed message={failMessage} /> : null}
      {plan ? (
        <>
          <div role="radiogroup" aria-label="הכיוון לחודש הראשון" className={`grid gap-3 lg:grid-cols-2 ${styles.stagger}`}>
            {plan.directions.slice(0, 2).map((direction, index) => {
              const on = chosen === index;
              return (
                <button
                  key={`${direction.title}-${index}`}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setError("");
                    update((f) => ({ ...f, chosenDirection: index }));
                  }}
                  className={`${form.tile} !flex-col !gap-0 !rounded-2xl !p-5`}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className="text-[12.5px] font-semibold text-[color:var(--ink-muted)]">כיוון {LETTERS[index]}</span>
                    <span aria-hidden className={`${form.radio} !mt-0`} />
                  </span>
                  <span className="mt-1.5 block text-[20px] font-bold leading-snug tracking-tight text-[color:var(--ink)]">{direction.title}</span>
                  <span className="mt-1.5 block text-[14.5px] leading-6 text-[color:var(--ink-soft)]">{direction.approach_he}</span>
                  <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[color:var(--ink-muted)]">
                    <span>למי: <b className="font-semibold text-[color:var(--ink)]">{direction.audience}</b></span>
                    <span>מטרה: <b className="font-semibold text-[color:var(--ink)]">{direction.goal_he}</b></span>
                  </span>
                  <span className="mt-2 block text-[13px] leading-5 text-[color:var(--ink-soft)]">
                    <b className="font-semibold text-[color:var(--ink)]">למה: </b>
                    {direction.why_he}
                  </span>
                  <span className={`${on ? "block" : "hidden lg:block"} mt-3 w-full border-t border-[var(--rule)] pt-3`}>
                    <span className="block text-[12.5px] font-semibold text-[color:var(--ink)]">הצעדים הראשונים</span>
                    <span className="mt-1.5 block space-y-1">
                      {direction.first_steps.slice(0, 3).map((stepText, i) => (
                        <span key={stepText} className="flex gap-2 text-[13px] leading-5 text-[color:var(--ink-soft)]">
                          <span className="font-semibold tabular-nums text-[color:var(--ink-muted)]">{i + 1}.</span>
                          {stepText}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {error ? (
            <p role="alert" className={form.error}>
              {error}
            </p>
          ) : null}
          <SomethingElse flow={flow} update={update} plan={plan} brand={brand} />
        </>
      ) : null}
    </StepShell>
  );
}

/**
 * "משהו אחר? ספרו לנו": the owner's own words revise the two options. When the answer
 * comes back unchanged, the words still shape the strategy (they travel as feedback).
 */
function SomethingElse({
  flow,
  update,
  plan,
  brand,
}: Pick<StepProps, "flow" | "update"> & { plan: PlanPreview; brand: Parameters<typeof revisePlan>[2] }) {
  const saved = flow.directionFeedback ?? "";
  const [open, setOpen] = useState(Boolean(saved));
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const fieldId = useId();

  async function send() {
    const words = text.trim();
    if (words.length < 3) {
      setError("כתבו במשפט קצר מה הייתם רוצים אחרת.");
      return;
    }
    setBusy(true);
    setError("");
    setNote("");
    try {
      const revised = await revisePlan(draftForApi(flow), words, brand);
      const same = signature(revised.directions) === signature(plan.directions);
      update((f) => ({
        ...f,
        directionFeedback: words,
        ...(same ? {} : { plan: { ...revised, brand: revised.brand ?? plan.brand }, chosenDirection: null }),
      }));
      setNote(same ? "רשמנו. ניקח את זה בחשבון בתוכנית." : "עדכנו את הכיוונים לפי מה שכתבתם. בחרו אחד.");
    } catch {
      setError("לא הצלחנו לעדכן את הכיוונים. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div>
        <QuietLink tone="action" onClick={() => setOpen(true)}>משהו אחר? ספרו לנו</QuietLink>
      </div>
    );
  }
  return (
    <div className={`${form.panel} space-y-3`}>
      <label htmlFor={fieldId} className={`${form.label} !mb-0`}>
        משהו אחר? ספרו לנו במילים שלכם
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
        placeholder="למשל: אנחנו רוצים להתמקד בהזמנות לאירועים"
        className={form.input}
      />
      <div className="flex flex-wrap items-center gap-3">
        <UIAction variant="secondary" onClick={() => void send()} disabled={busy}>
          {busy ? "מעדכנים את הכיוונים…" : "לעדכן את הכיוונים"}
        </UIAction>
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
      <p aria-live="polite" className="text-sm text-[color:var(--ink)]">
        {note}
      </p>
      {error ? (
        <p role="alert" className={form.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
