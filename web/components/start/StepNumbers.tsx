"use client";

import { useEffect, useId, useState } from "react";
import { ApiError } from "@/lib/api";
import { draftForApi, fetchTargetSuggestion, signature, type FlowState } from "@/lib/draft";
import {
  UNKNOWN,
  baselineQuestions,
  isLeverFor,
  leversFor,
  targetFromSuggestion,
  targetText,
  type BaselineQuestion,
  type BaselineValue,
  type DraftTarget,
  type LeverKey,
  type TargetSuggestion,
} from "@/lib/goals";
import { goalsFor } from "@/lib/businessModel";
import { budgetLabel } from "@/lib/quarterPlan";
import { modelOf } from "./script";
import { ModelConfirm, Tile } from "./StepGoal";
import type { StepProps } from "./steps";
import { BidiText, QuietLink, StepShell } from "./ui";
import styles from "./start.module.css";

/**
 * Revision 6, the goal chapter: "איפה העסק היום" (the baseline), "מה הכי נכון להגדיל" (the
 * lever) and, after the budget, "היעד ל-3 חודשים" (the calculated target).
 *
 * Every number question offers range chips, an exact number and "לא בטוחים", and never
 * blocks. The calculation is the API's (`/public/target-suggestion`, no model): these
 * screens show it, with its math, its sources and "טווח לתכנון, לא הבטחה".
 */

/* ------------------------------ The suggestion ------------------------------ */

/** The draft the suggestion is computed from: everything but the target itself. */
function suggestionDraft(flow: FlowState) {
  const draft = { ...draftForApi(flow), business_model: modelOf(flow) };
  delete draft.target;
  // Social profiles are optional research inputs, not inputs to the goal arithmetic.
  // An unfinished Facebook page link must not prevent calculating a budget or target.
  draft.links = draft.links.website ? { website: draft.links.website } : {};
  return draft;
}

/** `/public/target-suggestion` for the current answers, kept in the flow (it survives a refresh). */
export function useTargetSuggestion({ flow, update }: Pick<StepProps, "flow" | "update">) {
  const payload = suggestionDraft(flow);
  const want = signature(payload);
  const [failure, setFailure] = useState<{ for: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const fresh = flow.targetSuggestionFor === want ? (flow.targetSuggestion ?? null) : null;

  useEffect(() => {
    if (fresh) return;
    let live = true;
    // Numbers change as they type: ask once they pause.
    const timer = window.setTimeout(() => {
      fetchTargetSuggestion(payload)
        .then((result) => {
          if (!live) return;
          setFailure(null);
          update((f) => ({ ...f, targetSuggestion: result, targetSuggestionFor: want }));
        })
        .catch((err: unknown) => {
          if (!live) return;
          setFailure({ for: want, message: err instanceof ApiError && /[֐-׿]/.test(err.message) ? err.message : "לא הצלחנו להתחבר לחישוב. התשובות שלכם נשמרו; אפשר לנסות שוב." });
        });
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // Once per set of answers (and per retry); `payload` is what `want` says.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, attempt]);

  return {
    // An old estimate must never be accepted for a changed budget or baseline.
    result: fresh,
    stale: !fresh,
    failed: !fresh && failure?.for === want ? failure.message : "",
    retry: () => {
      setFailure(null);
      setAttempt((n) => n + 1);
    },
  };
}

/* --------------------------------- The baseline --------------------------------- */

function SmallChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex h-10 cursor-pointer items-center gap-1 rounded-full border px-3 text-sm font-bold tabular-nums transition-colors ${
        selected ? "border-[var(--ink)] bg-[var(--primary-soft)] text-[color:var(--ink)] ring-1 ring-[var(--ink)]" : "border-[var(--rule-dark)] bg-white text-[color:var(--ink)] hover:border-[var(--primary)]"
      }`}
    >
      {selected ? (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
          <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
      <span>{label}</span>
    </button>
  );
}

function BaselineRow({
  question,
  value,
  onChange,
}: {
  question: BaselineQuestion;
  value: BaselineValue | undefined;
  onChange: (value: BaselineValue | undefined) => void;
}) {
  const exact = question.exact;
  const [typing, setTyping] = useState(typeof value === "number");
  const [text, setText] = useState(
    typeof value === "number" ? String(exact?.outOfTen ? value / 10 : value) : "",
  );
  const labelId = useId();
  const inputId = useId();
  const unknown = value === UNKNOWN;

  return (
    <div role="group" aria-labelledby={labelId}>
      <div className="flex items-center justify-between gap-2">
        <p id={labelId} className="text-sm font-bold leading-5 text-[color:var(--ink)]">
          {question.label}
        </p>
        <button
          type="button"
          aria-pressed={unknown}
          onClick={() => {
            setTyping(false);
            onChange(unknown ? undefined : UNKNOWN);
          }}
          className={`-my-2 min-h-9 shrink-0 cursor-pointer px-1 text-xs underline underline-offset-4 ${
            unknown ? "font-bold text-[color:var(--ink)]" : "text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]"
          }`}
        >
          {unknown ? "✓ לא בטוחים" : "לא בטוחים"}
        </button>
      </div>
      {typing && exact ? (
        <div className="mt-1 flex items-center gap-2">
          <label htmlFor={inputId} className="sr-only">
            {question.label}, מספר מדויק
          </label>
          <input
            id={inputId}
            type="number"
            inputMode="decimal"
            min={0}
            max={exact.max}
            value={text}
            autoFocus
            onChange={(event) => {
              const raw = event.target.value;
              setText(raw);
              const number = Number(raw);
              if (!raw.trim()) onChange(undefined);
              else if (Number.isFinite(number) && number >= 0 && number <= exact.max) {
                onChange(exact.outOfTen ? Math.round(number * 100) / 10 : number);
              }
            }}
            placeholder={exact.placeholder}
            dir="ltr"
            className="min-h-10 w-28 rounded-lg border border-[var(--rule-dark)] bg-white px-3 text-left text-base font-bold text-[color:var(--ink)] outline-none focus:border-[var(--ink)] focus:ring-1 focus:ring-[var(--ink)]"
          />
          <span className="text-sm font-bold text-[color:var(--ink-soft)]">{exact.unit}</span>
          <QuietLink
            onClick={() => {
              setTyping(false);
              setText("");
              if (typeof value === "number") onChange(undefined);
            }}
            className="mr-auto text-xs"
          >
            לבחור טווח
          </QuietLink>
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {question.chips.map((chip) => (
            <SmallChip
              key={chip.key}
              label={chip.label}
              selected={value === chip.key}
              onClick={() => onChange(value === chip.key ? undefined : chip.key)}
            />
          ))}
          {exact ? (
            <SmallChip
              label={typeof value === "number" ? `${exact.outOfTen ? value / 10 : value.toLocaleString("en-US")} ${exact.unit}` : "מספר מדויק"}
              selected={typeof value === "number"}
              onClick={() => setTyping(true)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

export function StepBaseline(props: StepProps) {
  const { flow, update, next } = props;
  const model = modelOf(flow);
  const grow = model === "services" ? undefined : flow.draft.grow_where;
  const questions = baselineQuestions(model, grow);
  const baseline = flow.draft.baseline ?? {};

  function set(field: BaselineQuestion["field"], value: BaselineValue | undefined) {
    update((f) => {
      const nextBaseline = { ...(f.draft.baseline ?? {}) };
      if (value === undefined) delete nextBaseline[field];
      else nextBaseline[field] = value;
      // A target accepted for other numbers no longer fits them. One the owner wrote stays.
      const target = f.draft.target?.edited_by_owner ? f.draft.target : undefined;
      return { ...f, draft: { ...f.draft, business_model: modelOf(f), baseline: nextBaseline, target } };
    });
  }

  return (
    <StepShell
      {...props}
      title="איפה העסק היום?"
      why="ככה נחשב יעד אמיתי, לא ניחוש. בערך מספיק."
      primary="להמשיך למה להגדיל"
      onPrimary={() => {
        // Nothing here is required: "לא בטוחים" is on every question.
        update((f) => ({ ...f, modelConfirmed: true, draft: { ...f.draft, business_model: modelOf(f) } }));
        next();
      }}
    >
      {flow.modelConfirmed ? null : <ModelConfirm flow={flow} update={update} />}
      <div className="space-y-2.5">
        {questions.map((question) => (
          <BaselineRow
            key={question.field}
            question={question}
            value={baseline[question.field]}
            onChange={(value) => set(question.field, value)}
          />
        ))}
      </div>
    </StepShell>
  );
}

/* ---------------------------------- The lever ---------------------------------- */

export function StepLever(props: StepProps) {
  const { flow, update, next } = props;
  const model = modelOf(flow);
  const levers = leversFor(model);
  const { result, failed, retry } = useTargetSuggestion(props);
  const recommended = result && isLeverFor(result.recommended_lever, model) ? result.recommended_lever : null;
  const chosen = flow.draft.lever?.primary && isLeverFor(flow.draft.lever.primary, model) ? flow.draft.lever.primary : null;
  const [secondaryOpen, setSecondaryOpen] = useState(Boolean(flow.draft.lever?.secondary));
  const [alternativesOpen, setAlternativesOpen] = useState(false);

  function pick(key: LeverKey, secondary?: LeverKey) {
    update((f) => {
      const goal = goalsFor(model)[0]?.key;
      const target = f.draft.target?.edited_by_owner && f.draft.lever?.primary === key ? f.draft.target : undefined;
      return {
        ...f,
        draft: {
          ...f.draft,
          business_model: model,
          goal: f.draft.goal ?? goal,
          lever: { primary: key, ...(secondary && secondary !== key ? { secondary } : {}) },
          target,
        },
      };
    });
  }

  // The numbers point somewhere: that lever starts selected, with its reason. The owner decides.
  useEffect(() => {
    if (recommended && !chosen) pick(recommended);
    // Once, when the recommendation first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommended]);

  const secondary = flow.draft.lever?.secondary;
  const selected = levers.find((lever) => lever.key === (chosen ?? recommended));

  return (
    <StepShell
      {...props}
      title="הכיוון שאנחנו ממליצים עליו"
      why="לפי מה שסיפרתם על העסק והמספרים שלו. אפשר לקבל את ההמלצה או לשנות."
      primary="להמשיך לתקציב"
      primaryDisabled={!selected}
      onPrimary={() => {
        if (!chosen && recommended) pick(recommended);
        next();
      }}
    >
      {selected ? (
        <div className="border-s-2 border-[var(--primary)] bg-[var(--primary-soft)] px-4 py-4">
          <p className="text-xs font-bold text-[color:var(--ink-soft)]">{chosen && recommended && chosen !== recommended ? "הכיוון שבחרתם" : "ההמלצה שלנו"}</p>
          <h2 className="mt-1 text-xl font-black text-[color:var(--ink)]">{selected.name_he}</h2>
          <p className="mt-2 text-sm leading-6 text-[color:var(--ink)]">{selected.key === recommended && result ? result.lever_hint_he : selected.when_he}</p>
        </div>
      ) : failed ? (
        <div role="alert" className="space-y-2 text-sm leading-6">
          <p>{failed}</p>
          <QuietLink onClick={retry}>לנסות שוב לקבל המלצה</QuietLink>
        </div>
      ) : <p role="status" className="text-sm text-[color:var(--ink-soft)]">בודקים איזה כיוון מתאים לעסק…</p>}
      <details open={alternativesOpen} onToggle={(event) => setAlternativesOpen(event.currentTarget.open)}>
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-bold text-[color:var(--ink)] underline underline-offset-4">לבחור כיוון אחר</summary>
        <div role="radiogroup" aria-label="כיוון אחר לצמיחה" className={`grid gap-2 ${styles.stagger}`}>
        {levers.map((lever) => {
          const isRecommended = lever.key === recommended;
          return (
            <Tile
              key={lever.key}
              on={chosen === lever.key}
              title={lever.name_he}
              badge={isRecommended ? "ההמלצה שלנו" : undefined}
              desc={isRecommended && result ? result.lever_hint_he : lever.when_he}
              onClick={() => { pick(lever.key, secondary); setAlternativesOpen(false); }}
            />
          );
        })}
        </div>
      </details>
      {chosen ? (
        secondaryOpen ? (
          <div className={styles.rise}>
            <p className="mb-1.5 text-xs font-bold text-[color:var(--ink)]">
              ועוד משהו? <span className="font-normal text-[color:var(--ink-soft)]">(לא חובה)</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {levers
                .filter((l) => l.key !== chosen)
                .map((lever) => (
                  <SmallChip
                    key={lever.key}
                    label={lever.name_he}
                    selected={secondary === lever.key}
                    onClick={() => pick(chosen, secondary === lever.key ? undefined : lever.key)}
                  />
                ))}
            </div>
          </div>
        ) : (
          <QuietLink onClick={() => setSecondaryOpen(true)} className="-my-2 text-xs">
            להוסיף כיוון שני (לא חובה)
          </QuietLink>
        )
      ) : null}
    </StepShell>
  );
}

/* ---------------------------------- The target ---------------------------------- */

/** The math, 2-4 lines. The "היעד:" line repeats the headline right above it, so it is left out here. */
export function MathLines({ lines }: { lines: string[] }) {
  const shown = lines.filter((line) => !line.startsWith("היעד:"));
  if (!shown.length) return null;
  return (
    <ol className="mt-2 space-y-1 border-t border-[var(--rule)] pt-2">
      {shown.map((line) => (
        <li key={line} className="text-[13px] leading-5 text-[color:var(--ink)]">
          <BidiText text={line} />
        </li>
      ))}
    </ol>
  );
}

const PAYBACK_STYLE: Record<string, string> = {
  no: "border-[#e8d3b0] bg-[#fbf3e4] text-[#4a3b22]",
  partly: "border-[var(--rule)] bg-[var(--canvas)] text-[color:var(--ink)]",
  pays: "border-[#cfe0c9] bg-[#f1f7ee] text-[#23401f]",
};

type SourcesInput = Pick<TargetSuggestion, "assumptions_he" | "sources"> & { budget_he?: string };

function hasSources(result: SourcesInput): boolean {
  return Boolean(result.assumptions_he.length || result.sources.length || result.budget_he);
}

/** The sources, the budget line and every assumption, one level down (UI-RULES rule 2); never dropped. */
export function SourcesPanel({ result, id }: { result: SourcesInput; id?: string }) {
  return (
    <div id={id} className={`space-y-2 rounded-xl bg-[var(--primary-soft)] px-3.5 py-2.5 text-xs leading-5 text-[color:var(--ink)] ${styles.rise}`}>
        {result.budget_he ? (
          <p>
            <BidiText text={result.budget_he} />
          </p>
        ) : null}
        {result.assumptions_he.length ? (
          <ul className="space-y-1">
            {result.assumptions_he.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--ink-muted)]" />
                <span>
                  <BidiText text={line} />
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {result.sources.length ? (
          <p>
            <b className="text-[color:var(--ink)]">המקורות: </b>
            {result.sources.map((source, index) => (
              <span key={source.url}>
                {index ? " · " : ""}
                <a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[color:var(--ink)]">
                  {source.title}
                </a>
              </span>
            ))}
          </p>
        ) : null}
    </div>
  );
}

export function SourcesToggle({ result }: { result: SourcesInput }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (!hasSources(result)) return null;
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 px-1 text-sm font-bold text-[color:var(--ink-soft)] hover:text-[color:var(--ink)]"
      >
        מאיפה המספרים
        <span aria-hidden className={`h-0 w-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-[var(--ink-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="basis-full"><SourcesPanel result={result} id={panelId} /></div> : null}
    </>
  );
}

/** Sources behind an expand, for the plan (where the row has nothing else in it). */
export function SourcesAndAssumptions({ result }: { result: SourcesInput }) {
  if (!hasSources(result)) return null;
  return (
    <div className="flex flex-wrap items-center">
      <SourcesToggle result={result} />
    </div>
  );
}

/** Min and max for a target, in its unit. The owner's numbers, never checked against ours. */
export function TargetEdit({
  target,
  onSave,
  onCancel,
}: {
  target: DraftTarget;
  onSave: (target: DraftTarget) => void;
  onCancel: () => void;
}) {
  const [low, setLow] = useState(target.value_min != null ? String(target.value_min) : "");
  const [high, setHigh] = useState(target.value_max != null ? String(target.value_max) : "");
  const [error, setError] = useState("");
  const lowId = useId();
  const highId = useId();
  const field =
    "min-h-11 w-24 rounded-lg border border-[var(--rule-dark)] bg-white px-3 text-left text-base font-bold text-[color:var(--ink)] outline-none focus:border-[var(--ink)] focus:ring-1 focus:ring-[var(--ink)]";
  return (
    <div className={`space-y-2 rounded-xl bg-[var(--canvas)] p-3 ${styles.rise}`}>
      <p className="text-xs font-bold text-[color:var(--ink)]">היעד שלכם, בתוספת על היום ({target.unit_he})</p>
      <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-[color:var(--ink-soft)]">
        <label htmlFor={lowId}>מ-+</label>
        <input id={lowId} type="number" inputMode="decimal" min={0} dir="ltr" value={low} onChange={(e) => setLow(e.target.value)} className={field} />
        <label htmlFor={highId}>עד +</label>
        <input id={highId} type="number" inputMode="decimal" min={0} dir="ltr" value={high} onChange={(e) => setHigh(e.target.value)} className={field} />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const a = low.trim() ? Number(low) : NaN;
            const b = high.trim() ? Number(high) : NaN;
            const min = Number.isFinite(a) ? a : b;
            const max = Number.isFinite(b) ? b : a;
            if (!Number.isFinite(min) || min < 0 || max < 0) {
              setError("כתבו מספר, למשל 5.");
              return;
            }
            if (min > max) {
              setError("המספר הראשון צריך להיות קטן מהשני.");
              return;
            }
            onSave({ ...target, value_min: min, value_max: max, accepted: true, edited_by_owner: true });
          }}
          className="min-h-11 cursor-pointer rounded-full border border-[var(--ink)] bg-white px-4 text-sm font-bold text-[color:var(--ink)]"
        >
          לשמור את היעד
        </button>
        <QuietLink onClick={onCancel}>ביטול</QuietLink>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-bold text-[#9f4330]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function StepTarget(props: StepProps) {
  const { flow, update, next } = props;
  const { result, stale, failed, retry } = useTargetSuggestion(props);
  const [editing, setEditing] = useState(false);
  const owner = flow.draft.target?.edited_by_owner ? flow.draft.target : null;
  const suggestion = result?.suggestion ?? null;
  const loading = !result && !failed;

  function accept(target: DraftTarget | null) {
    update((f) => ({ ...f, draft: { ...f.draft, target: target ?? undefined } }));
  }

  return (
    <StepShell
      {...props}
      title="היעד ל-3 חודשים"
      why={loading ? "בודקים את המספרים והתקציב שבחרתם." : failed ? "התשובות נשמרו. אפשר לנסות שוב או לקבוע יעד בהמשך." : suggestion ? "הערכה לפי המספרים שלכם והתקציב. אפשר לקבל או לשנות." : "כשחסרים נתונים, מתחילים למדוד וקובעים יעד בהמשך."}
      primary={loading ? "מחשבים…" : failed && !result ? "לנסות שוב לחשב" : owner ? "לשמור את היעד ולעבור למחקר" : suggestion ? "לקבל את היעד ולעבור למחקר" : "לעבור למחקר"}
      primaryDisabled={loading || editing}
      onPrimary={() => {
        if (failed && !result) {
          retry();
          return;
        }
        if (!owner && result) accept(targetFromSuggestion(result));
        next();
      }}
      skip={result || failed ? "בלי יעד בינתיים" : undefined}
      onSkip={() => {
        accept(null);
        next();
      }}
    >
      {loading ? (
        <div className="space-y-2" role="status" aria-live="polite">
          <p className="text-sm text-[color:var(--ink-soft)]">מחשבים את היעד…</p>
          <div className={`h-40 rounded-2xl border border-[var(--rule)] bg-white ${styles.shimmer}`} />
        </div>
      ) : null}
      {failed && !result ? (
        <div role="alert" className="rounded-xl border border-[var(--rule)] bg-white p-3.5 text-sm leading-6 text-[color:var(--ink)]">
          <p className="font-bold text-[color:var(--ink)]">לא הצלחנו לחשב את היעד.</p>
          <p>{failed}</p>
          {props.editLinks && failed.includes("קישור") ? <QuietLink onClick={props.editLinks}>לתקן את הקישור באתר וברשתות</QuietLink> : null}
        </div>
      ) : null}
      {result ? (
        <div className={`space-y-3 transition-opacity ${stale ? "opacity-60" : ""}`} aria-busy={stale}>
          {flow.draft.budget && !["none", "unknown"].includes(flow.draft.budget.range) ? (
            <p className="text-sm leading-6 text-[color:var(--ink-soft)]">התקציב שבחרתם: <BidiText text={budgetLabel(flow.draft.budget)} />{flow.draft.budget.exact_ils == null ? " בחודש. החישוב משתמש באמצע הטווח כהנחת עבודה." : "."}</p>
          ) : null}
          <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-[var(--rule)]">
            {suggestion || owner ? (
              <>
                {owner ? <p className="text-[11px] font-bold text-[color:var(--ink-soft)]">היעד שלכם</p> : null}
                <p className="text-xl font-black leading-7 text-[color:var(--ink)]">
                  <BidiText text={owner ? targetText(owner) : suggestion!.headline_he} />
                </p>
                {!owner && suggestion?.level_he ? (
                  <p className="text-sm text-[color:var(--ink)]">
                    כלומר <BidiText text={suggestion.level_he} />
                  </p>
                ) : null}
                {owner && suggestion ? (
                  <p className="text-xs text-[color:var(--ink-soft)]">
                    החישוב שלנו: <BidiText text={suggestion.headline_he} />
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-base font-black leading-7 text-[color:var(--ink)]">{result.qualitative_he}</p>
            )}
            <MathLines lines={result.math_he} />
            <p className="mt-1.5 text-xs font-bold text-[color:var(--ink-soft)]">{result.caveat_he}</p>
          </div>
          {result.unit_economics_he ? (
            <p className={`rounded-xl border px-3.5 py-2 text-[13px] leading-5 ${PAYBACK_STYLE[result.payback ?? "partly"] ?? PAYBACK_STYLE.partly}`}>
              <BidiText text={result.unit_economics_he} />
            </p>
          ) : null}
          {!suggestion ? <p className="text-[13px] leading-5 text-[color:var(--ink)]">{result.first_checkpoint_he}</p> : null}
          {editing && (suggestion || owner) ? (
            <TargetEdit
              target={owner ?? (targetFromSuggestion(result) as DraftTarget)}
              onSave={(target) => {
                accept(target);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="-my-1 flex flex-wrap items-center justify-between gap-x-3">
              {suggestion || owner ? <QuietLink onClick={() => setEditing(true)}>לשנות את היעד</QuietLink> : null}
              {owner ? <QuietLink onClick={() => accept(null)}>לחזור לחישוב שלנו</QuietLink> : null}
              <SourcesToggle result={result} />
            </div>
          )}
        </div>
      ) : null}
    </StepShell>
  );
}
