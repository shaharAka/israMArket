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
import { IconChevron } from "@/lib/icons";
import { UIAction } from "@/components/design/Controls";
import { BidiText, CheckMark, QuietLink, StepShell } from "./ui";
import styles from "./start.module.css";
import form from "./form.module.css";

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
    <button type="button" aria-pressed={selected} onClick={onClick} className={`${form.chip} ${form.chipSmall}`}>
      {selected ? <CheckMark /> : null}
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
    <div role="group" aria-labelledby={labelId} className="py-4 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <p id={labelId} className="text-[15px] font-semibold leading-6 text-[color:var(--ink)]">
          {question.label}
        </p>
        <button
          type="button"
          aria-pressed={unknown}
          onClick={() => {
            setTyping(false);
            onChange(unknown ? undefined : UNKNOWN);
          }}
          className={`-my-2.5 inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 px-1 text-[13px] ${
            unknown
              ? "!bg-transparent font-semibold text-[color:var(--primary)]"
              : "text-[color:var(--ink-soft)] underline decoration-[var(--rule-dark)] underline-offset-[5px] hover:text-[color:var(--ink)]"
          }`}
        >
          {unknown ? <CheckMark /> : null}
          לא בטוחים
        </button>
      </div>
      {typing && exact ? (
        <div className="mt-2.5 flex items-center gap-3">
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
            className={`${form.input} ${form.number} !w-28`}
          />
          <span className="text-sm font-medium text-[color:var(--ink-soft)]">{exact.unit}</span>
          <QuietLink
            onClick={() => {
              setTyping(false);
              setText("");
              if (typeof value === "number") onChange(undefined);
            }}
            className="ms-auto !text-[13px]"
          >
            לבחור טווח
          </QuietLink>
        </div>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-2">
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
      <div className="divide-y divide-[var(--rule)]">
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
        <div className="rounded-2xl bg-[var(--primary-soft)] px-5 py-5 sm:px-6">
          <p className="flex items-center gap-2.5 text-[13px] font-semibold text-[color:var(--primary)]">
            <span aria-hidden className={styles.sunDot} />
            {chosen && recommended && chosen !== recommended ? "הכיוון שבחרתם" : "ההמלצה שלנו"}
          </p>
          <h2 className="mt-2 text-[22px] font-bold leading-snug tracking-tight text-[color:var(--ink)]">{selected.name_he}</h2>
          <p className="mt-2 text-[15px] leading-[1.65] text-[color:var(--ink-soft)]">{selected.key === recommended && result ? result.lever_hint_he : selected.when_he}</p>
        </div>
      ) : failed ? (
        <div role="alert" className="space-y-2 text-[15px] leading-6 text-[color:var(--ink)]">
          <p>{failed}</p>
          <QuietLink tone="action" onClick={retry}>לנסות שוב לקבל המלצה</QuietLink>
        </div>
      ) : <p role="status" className="text-[15px] text-[color:var(--ink-muted)]">בודקים איזה כיוון מתאים לעסק…</p>}
      <details open={alternativesOpen} onToggle={(event) => setAlternativesOpen(event.currentTarget.open)} className="-my-2">
        <summary className="min-h-11 py-2.5 text-sm font-semibold text-[color:var(--primary)]">לבחור כיוון אחר</summary>
        <div role="radiogroup" aria-label="כיוון אחר לצמיחה" className={`mt-2 grid gap-2 ${styles.stagger}`}>
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
            <p className={form.label}>
              ועוד משהו? <small>(לא חובה)</small>
            </p>
            <div className="flex flex-wrap gap-2">
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
          <div className="-my-2">
            <QuietLink onClick={() => setSecondaryOpen(true)}>להוסיף כיוון שני (לא חובה)</QuietLink>
          </div>
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
    <ol className="mt-3 space-y-1.5 border-t border-[var(--rule)] pt-3">
      {shown.map((line) => (
        <li key={line} className="text-[13.5px] leading-[1.55] text-[color:var(--ink-soft)]">
          <BidiText text={line} />
        </li>
      ))}
    </ol>
  );
}

const PAYBACK_STYLE: Record<string, string> = {
  no: "bg-[var(--sand)] text-[var(--sand-dark)]",
  partly: "bg-[var(--soft)] text-[color:var(--ink-soft)]",
  pays: "bg-[var(--good-soft)] text-[var(--good)]",
};

type SourcesInput = Pick<TargetSuggestion, "assumptions_he" | "sources"> & { budget_he?: string };

function hasSources(result: SourcesInput): boolean {
  return Boolean(result.assumptions_he.length || result.sources.length || result.budget_he);
}

/** The sources, the budget line and every assumption, one level down (UI-RULES rule 2); never dropped. */
export function SourcesPanel({ result, id }: { result: SourcesInput; id?: string }) {
  return (
    <div id={id} className={`space-y-2 rounded-xl bg-[var(--soft)] px-4 py-3 text-[13px] leading-[1.6] text-[color:var(--ink-soft)] ${styles.rise}`}>
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
        className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 px-1 text-sm font-semibold text-[color:var(--ink-soft)] transition-colors hover:text-[color:var(--ink)]"
      >
        מאיפה המספרים
        <IconChevron className={`h-3.5 w-3.5 text-[color:var(--ink-muted)] transition-transform duration-200 ${open ? "rotate-90" : "-rotate-90"}`} />
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
  const field = `${form.input} ${form.number} !w-24`;
  return (
    <div className={`${form.panel} space-y-3 ${styles.rise}`}>
      <p className="text-sm font-semibold text-[color:var(--ink)]">היעד שלכם, בתוספת על היום ({target.unit_he})</p>
      <div className="flex flex-wrap items-center gap-2.5 text-sm font-medium text-[color:var(--ink-soft)]">
        <label htmlFor={lowId}>מ-+</label>
        <input id={lowId} type="number" inputMode="decimal" min={0} dir="ltr" value={low} onChange={(e) => setLow(e.target.value)} className={field} />
        <label htmlFor={highId}>עד +</label>
        <input id={highId} type="number" inputMode="decimal" min={0} dir="ltr" value={high} onChange={(e) => setHigh(e.target.value)} className={field} />
      </div>
      <div className="flex items-center gap-3">
        <UIAction
          variant="secondary"
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
        >
          לשמור את היעד
        </UIAction>
        <QuietLink onClick={onCancel}>ביטול</QuietLink>
      </div>
      {error ? (
        <p role="alert" className={form.error}>
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
      title="יעד העבודה שלנו"
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
          <p className="text-sm text-[color:var(--ink-muted)]">מחשבים את היעד…</p>
          <div className={`${styles.work} space-y-3`}>
            <span className={`block h-5 w-2/3 rounded-full bg-[var(--soft)] ${styles.shimmer}`} />
            <span className={`block h-3 w-full rounded-full bg-[var(--soft)] ${styles.shimmer}`} />
            <span className={`block h-3 w-5/6 rounded-full bg-[var(--soft)] ${styles.shimmer}`} />
          </div>
        </div>
      ) : null}
      {failed && !result ? (
        <div role="alert" className={`${styles.work} text-[15px] leading-6 text-[color:var(--ink-soft)]`}>
          <p className="font-semibold text-[color:var(--ink)]">לא הצלחנו לחשב את היעד.</p>
          <p>{failed}</p>
          {props.editLinks && failed.includes("קישור") ? <QuietLink tone="action" onClick={props.editLinks}>לתקן את הקישור באתר וברשתות</QuietLink> : null}
        </div>
      ) : null}
      {result ? (
        <div className={`space-y-4 transition-opacity ${stale ? "opacity-60" : ""}`} aria-busy={stale}>
          {flow.draft.budget && !["none", "unknown"].includes(flow.draft.budget.range) ? (
            <p className="text-[14.5px] leading-6 text-[color:var(--ink-soft)]">התקציב שבחרתם: <BidiText text={budgetLabel(flow.draft.budget)} />{flow.draft.budget.exact_ils == null ? " בחודש. החישוב משתמש באמצע הטווח כהנחת עבודה." : "."}</p>
          ) : null}
          <div className={`${styles.work} !px-5 sm:!px-6`}>
            {suggestion || owner ? (
              <>
                {owner ? <p className="mb-1 text-[13px] font-semibold text-[color:var(--primary)]">היעד שלכם</p> : null}
                <p className="text-[22px] font-bold leading-snug tracking-tight text-[color:var(--ink)]">
                  <BidiText text={owner ? targetText(owner) : suggestion!.headline_he} />
                </p>
                {!owner && suggestion?.level_he ? (
                  <p className="mt-1 text-[15px] text-[color:var(--ink-soft)]">
                    כלומר <BidiText text={suggestion.level_he} />
                  </p>
                ) : null}
                {owner && suggestion ? (
                  <p className="mt-1 text-[13px] text-[color:var(--ink-muted)]">
                    החישוב שלנו: <BidiText text={suggestion.headline_he} />
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-[17px] font-semibold leading-7 text-[color:var(--ink)]">{result.qualitative_he}</p>
            )}
            <MathLines lines={result.math_he} />
            <p className="mt-3 flex items-center gap-2.5 text-[13px] font-semibold text-[color:var(--ink)]">
              <span aria-hidden className={styles.sunDot} />
              {result.caveat_he}
            </p>
          </div>
          {result.unit_economics_he ? (
            <p className={`rounded-xl px-4 py-3 text-[13.5px] leading-[1.6] ${PAYBACK_STYLE[result.payback ?? "partly"] ?? PAYBACK_STYLE.partly}`}>
              <BidiText text={result.unit_economics_he} />
            </p>
          ) : null}
          {!suggestion ? <p className="text-[14px] leading-6 text-[color:var(--ink-soft)]">{result.first_checkpoint_he}</p> : null}
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
            <div className="-my-2 flex flex-wrap items-center justify-between gap-x-3">
              {suggestion || owner ? <QuietLink tone="action" onClick={() => setEditing(true)}>לשנות את היעד</QuietLink> : null}
              {owner ? <QuietLink onClick={() => accept(null)}>לחזור לחישוב שלנו</QuietLink> : null}
              <SourcesToggle result={result} />
            </div>
          )}
        </div>
      ) : null}
    </StepShell>
  );
}
