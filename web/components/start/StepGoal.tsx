"use client";

import { useEffect, useId, useState } from "react";
import type { BusinessModel } from "@/lib/api";
import { BUSINESS_MODEL_OPTIONS, isGoalValidFor } from "@/lib/businessModel";
import { draftForApi, fetchSuccessOptions, goalForKpi, signature } from "@/lib/draft";
import {
  BUDGET_OPTIONS,
  GROW_OPTIONS,
  rangeForAmount,
  type BudgetRange,
  type GrowWhere,
  type SuccessOption,
} from "@/lib/quarterPlan";
import { modelOf } from "./script";
import type { StepProps } from "./steps";
import { CHANGE_LATER, Chip, QuietLink, StepShell } from "./ui";
import styles from "./start.module.css";

/**
 * The chapter "המטרה והתקציב": where to grow (shops only), what will count as success
 * (the plan's main measure), and the monthly budget. These three decide the plan; the old
 * goal question lives on inside "מה ייחשב הצלחה", so nothing is asked twice.
 */

const MODEL_QUESTION: Record<BusinessModel, string> = {
  products: "נראה שאתם מוכרים מוצרים — נכון?",
  services: "נראה שאתם נותנים שירות — נכון?",
  both: "נראה שאתם מוכרים מוצרים וגם נותנים שירות — נכון?",
};

function FieldError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm font-bold text-[#9f4330]">
      {message}
    </p>
  );
}

/** "מוצרים או שירות?": inferred from what they wrote, confirmed with one tap. Asked once. */
function ModelConfirm({ flow, update }: Pick<StepProps, "flow" | "update">) {
  const model = modelOf(flow);
  const [changing, setChanging] = useState(false);

  function setModel(nextModel: BusinessModel) {
    update((f) => {
      const goal = f.draft.goal;
      return {
        ...f,
        modelConfirmed: true,
        draft: {
          ...f.draft,
          business_model: nextModel,
          goal: goal && isGoalValidFor(nextModel, goal) ? goal : undefined,
          // Another model means other success options: the old pick may not exist there.
          success: nextModel === f.draft.business_model ? f.draft.success : undefined,
          grow_where: nextModel === "services" ? undefined : f.draft.grow_where,
        },
      };
    });
    setChanging(false);
  }

  return (
    <div className="rounded-xl bg-[#fff5d9] p-3">
      {changing ? (
        <div className="space-y-2">
          <p className="text-sm font-bold text-[color:var(--ink)]">מה אתם מוכרים?</p>
          <div className="grid grid-cols-3 gap-2">
            {BUSINESS_MODEL_OPTIONS.map((option) => (
              <Chip
                key={option.key}
                label={option.key === "both" ? "גם וגם" : option.title}
                selected={model === option.key}
                onClick={() => setModel(option.key)}
                className="px-2"
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-[color:var(--ink)]">{MODEL_QUESTION[model]}</p>
          <div className="flex gap-2">
            <Chip
              label="נכון"
              selected={Boolean(flow.modelConfirmed)}
              onClick={() => update((f) => ({ ...f, modelConfirmed: true, draft: { ...f.draft, business_model: model } }))}
              className="min-h-10 px-3"
            />
            <Chip label="לא בדיוק" selected={false} onClick={() => setChanging(true)} className="min-h-10 px-3" />
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({
  on,
  title,
  desc,
  onClick,
}: {
  on: boolean;
  title: string;
  desc?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`min-h-[60px] w-full cursor-pointer rounded-xl border p-3 text-right transition-colors ${
        on ? "border-[var(--ink)] bg-[var(--primary-soft)] ring-1 ring-[var(--ink)]" : "border-[var(--rule-dark)] bg-white hover:border-[#b9b7ad]"
      }`}
    >
      <span className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? "border-[var(--ink)]" : "border-[var(--rule-dark)]"}`}
        >
          {on ? <span className={`h-2.5 w-2.5 rounded-full bg-[var(--primary)] ${styles.pop}`} /> : null}
        </span>
        <span className="min-w-0">
          <span className="block text-base font-black leading-6 text-[color:var(--ink)]">{title}</span>
          {desc ? <span className="block text-xs leading-5 text-[color:var(--ink-soft)]">{desc}</span> : null}
        </span>
      </span>
    </button>
  );
}

/* --------------------------- איפה אתם רוצים לגדול --------------------------- */

const GROW_DESC: Record<GrowWhere, string> = {
  online: "הזמנות ומכירות דרך האתר",
  store: "יותר אנשים שנכנסים וקונים במקום",
  both: "גם וגם, ונמדוד כל אחד בנפרד",
};

export function StepGrow(props: StepProps) {
  const { flow, update, setDraft, next } = props;
  const [error, setError] = useState("");
  const services = modelOf(flow) === "services";
  const value = flow.draft.grow_where;
  return (
    <StepShell
      {...props}
      title="איפה אתם רוצים לגדול?"
      why="ככה נדע מה למדוד: הזמנות באתר, או אנשים שנכנסים לחנות."
      primary="להמשיך למה ייחשב הצלחה"
      reassure={CHANGE_LATER}
      onPrimary={() => {
        if (!services && !value) {
          setError("בחרו אחד מאלה. לא בטוחים? אפשר לדלג.");
          return;
        }
        update((f) => ({ ...f, modelConfirmed: true, draft: { ...f.draft, business_model: modelOf(f) } }));
        next();
      }}
      skip={services ? undefined : "לא בטוחים? לדלג"}
      onSkip={
        services
          ? undefined
          : () => {
              update((f) => ({ ...f, modelConfirmed: true, draft: { ...f.draft, business_model: modelOf(f), grow_where: undefined } }));
              next();
            }
      }
    >
      <ModelConfirm flow={flow} update={update} />
      {services ? (
        <p className={`text-sm leading-6 text-[color:var(--ink)] ${styles.rise}`}>בשירות אין ״באתר או בחנות״. נדלג על השאלה הזו.</p>
      ) : (
        <div role="radiogroup" aria-label="איפה לגדול" className="grid gap-2">
          {GROW_OPTIONS.map((option) => (
            <Tile
              key={option.key}
              on={value === option.key}
              title={option.label}
              desc={GROW_DESC[option.key]}
              onClick={() => {
                setError("");
                // Where to grow decides which measures fit: an old pick may no longer apply.
                setDraft(value === option.key ? { grow_where: option.key } : { grow_where: option.key, success: undefined });
              }}
            />
          ))}
        </div>
      )}
      <FieldError message={error} />
    </StepShell>
  );
}

/* ------------------------------ מה ייחשב הצלחה ------------------------------ */

/** The options for the current answers: fetched once per model / grow / site, kept in the flow. */
function useSuccessOptions({ flow, update }: Pick<StepProps, "flow" | "update">) {
  const d = flow.draft;
  const model = modelOf(flow);
  const want = signature([model, model === "services" ? "" : d.grow_where ?? "", Boolean(d.links.website), d.business_type]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const options = flow.successOptionsFor === want ? (flow.successOptions ?? null) : null;

  useEffect(() => {
    if (flow.successOptionsFor === want && flow.successOptions) return;
    let live = true;
    fetchSuccessOptions({ ...draftForApi(flow), business_model: model })
      .then((list) => {
        if (!live) return;
        setFailed(false);
        update((f) => ({ ...f, successOptions: list, successOptionsFor: want }));
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
    // Once per set of answers the options depend on (and per retry).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, attempt]);

  return {
    options,
    loading: !options && !failed,
    failed: failed && !options,
    retry: () => {
      setFailed(false);
      setAttempt((n) => n + 1);
    },
  };
}

function targetText(option: SuccessOption, n: number): string {
  return `${n} ${option.unit_he ?? "פניות"} בחודש`;
}

export function StepSuccess(props: StepProps) {
  const { flow, update, next } = props;
  const d = flow.draft;
  const model = modelOf(flow);
  const { options, loading, failed, retry } = useSuccessOptions(props);
  const [error, setError] = useState("");
  const chosen = options?.find((o) => o.key === d.success?.kpi) ?? null;
  const stale = Boolean(options && d.success?.kpi && !chosen);

  // A measure from before the answers changed does not fit them (the API answers 422).
  useEffect(() => {
    if (stale) update((f) => ({ ...f, draft: { ...f.draft, success: undefined } }));
  }, [stale, update]);

  function pick(option: SuccessOption) {
    setError("");
    update((f) => ({
      ...f,
      modelConfirmed: true,
      draft: {
        ...f.draft,
        business_model: model,
        goal: goalForKpi(option.key, model, option),
        // A target belongs to its measure: "20 הזמנות" means nothing for "פניות".
        success: { kpi: option.key, ...(f.draft.success?.kpi === option.key && f.draft.success.target ? { target: f.draft.success.target } : {}) },
      },
    }));
  }

  return (
    <StepShell
      {...props}
      title="מה ייחשב הצלחה?"
      why="זה יהיה המדד העיקרי של התוכנית. לפיו נבדוק כל חודש מה הצליח."
      primary={loading ? "טוענים…" : "להמשיך לתקציב"}
      primaryDisabled={loading}
      reassure={CHANGE_LATER}
      onPrimary={() => {
        if (options?.length && !chosen) {
          setError("בחרו אחד מאלה. לא בטוחים? אפשר שנבחר בשבילכם.");
          return;
        }
        update((f) => ({ ...f, modelConfirmed: true, draft: { ...f.draft, business_model: model } }));
        next();
      }}
      skip={options?.length ? "לא בטוחים? תבחרו בשבילנו" : failed ? "לדלג בינתיים" : undefined}
      onSkip={() => {
        if (options?.length) pick(options[0]);
        next();
      }}
    >
      {flow.modelConfirmed ? null : <ModelConfirm flow={flow} update={update} />}
      {loading ? (
        <div className="space-y-2" role="status" aria-live="polite">
          <p className="text-sm text-[color:var(--ink-soft)]">מכינים את האפשרויות…</p>
          {[0, 1, 2].map((i) => (
            <div key={i} className={`h-[60px] rounded-xl border border-[var(--rule)] bg-white ${styles.shimmer}`} />
          ))}
        </div>
      ) : null}
      {failed ? (
        <div role="alert" className="rounded-xl border border-[var(--rule)] bg-white p-3.5 text-sm leading-6 text-[color:var(--ink)]">
          <p className="font-bold text-[color:var(--ink)]">לא הצלחנו לטעון את האפשרויות.</p>
          <p>אפשר לנסות שוב, או לדלג ולבחור את המדד אחרי ההרשמה.</p>
          <QuietLink onClick={retry} className="font-bold text-[color:var(--ink)]">
            לנסות שוב
          </QuietLink>
        </div>
      ) : null}
      {options?.length ? (
        <div role="radiogroup" aria-label="מה ייחשב הצלחה" className={`grid gap-2 ${styles.stagger}`}>
          {options.map((option) => (
            <Tile key={option.key} on={chosen?.key === option.key} title={option.name_he} desc={option.hint_he} onClick={() => pick(option)} />
          ))}
        </div>
      ) : null}
      <FieldError message={error} />
      {chosen ? <TargetQuestion key={chosen.key} flow={flow} update={update} option={chosen} /> : null}
    </StepShell>
  );
}

/** An own target for the main measure. Optional, never prefilled: nothing is selected until they pick. */
export function TargetQuestion({
  flow,
  update,
  option,
  onChange,
  compact = false,
}: Pick<StepProps, "flow" | "update"> & {
  option: SuccessOption | { unit_he?: string; target_steps?: number[]; key: string; name_he: string };
  /** On the plan: a change is also sent back as an update. */
  onChange?: (typing: boolean) => void;
  compact?: boolean;
}) {
  const value = flow.draft.success?.target ?? "";
  const steps = option.target_steps?.length ? option.target_steps : [5, 10, 20];
  const texts = steps.map((n) => ({ n, text: targetText(option as SuccessOption, n) }));
  const hit = texts.find((t) => t.text === value);
  const [free, setFree] = useState(Boolean(value && !hit));
  const fieldId = useId();

  function set(target: string, typing = false) {
    update((f) => ({
      ...f,
      draft: { ...f.draft, success: { kpi: f.draft.success?.kpi ?? option.key, ...(target ? { target } : {}) } },
    }));
    onChange?.(typing);
  }

  return (
    <div className={`rounded-xl ${compact ? "bg-[var(--canvas)] px-3 py-2.5" : `bg-white p-3.5 ring-1 ring-[var(--rule)] ${styles.rise}`}`}>
      <p className={`${compact ? "text-xs" : "text-sm"} font-bold text-[color:var(--ink)]`}>
        כמה {option.unit_he ?? "פניות"} בחודש ירגישו לכם הצלחה? <span className="font-normal text-[color:var(--ink-soft)]">(לא חובה)</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {texts.map((t) => (
          <Chip
            key={t.n}
            label={String(t.n)}
            selected={hit?.n === t.n}
            onClick={() => {
              setFree(false);
              set(hit?.n === t.n ? "" : t.text);
            }}
            className="min-h-10 min-w-12 px-3"
          />
        ))}
        <Chip
          label="מספר אחר"
          selected={free}
          onClick={() => {
            const opening = !free;
            setFree(opening);
            if (!opening && value && !hit) set("");
          }}
          className="min-h-10 px-3"
        />
      </div>
      {free ? (
        <div className="mt-2">
          <label htmlFor={fieldId} className="sr-only">
            היעד שלכם, במילים שלכם
          </label>
          <input
            id={fieldId}
            value={hit ? "" : value}
            onChange={(event) => set(event.target.value, true)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            maxLength={120}
            placeholder={`למשל: 15 ${option.unit_he ?? "פניות"} בחודש`}
            className="min-h-11 w-full rounded-lg border border-[var(--rule-dark)] bg-white px-3 text-base text-[color:var(--ink)] outline-none placeholder:text-[color:var(--ink-muted)] focus:border-[var(--ink)] focus:ring-1 focus:ring-[var(--ink)]"
          />
        </div>
      ) : null}
      <p className="mt-1.5 text-xs text-[color:var(--ink-soft)]">לא נמציא לכם יעד. אם יש מספר שירגיש הצלחה, נמדוד מולו.</p>
    </div>
  );
}

/* ---------------------------------- התקציב ---------------------------------- */

export function StepBudget(props: StepProps) {
  const { flow, setDraft, next } = props;
  const budget = flow.draft.budget;
  const [error, setError] = useState("");
  const [exact, setExact] = useState(budget?.exact_ils != null ? String(budget.exact_ils) : "");
  const fieldId = useId();

  function pick(range: BudgetRange) {
    setError("");
    setExact("");
    setDraft({ budget: { range } });
  }

  return (
    <StepShell
      {...props}
      title="כמה אפשר להשקיע בשיווק בחודש?"
      why="התוכנית נבנית לפי מה שאפשר באמת לעשות בתקציב הזה. בערך מספיק."
      primary="לראות מה למדנו"
      reassure="זה הסכום לפרסום עצמו. אפשר לשנות אותו בכל רגע."
      onPrimary={() => {
        if (!budget?.range) {
          setError("בחרו אחד מאלה, או ״עוד לא יודעים״.");
          return;
        }
        next();
      }}
      skip="לדלג"
      onSkip={() => {
        if (!budget?.range) setDraft({ budget: { range: "unknown" } });
        next();
      }}
    >
      <div role="radiogroup" aria-label="תקציב לחודש" className="grid grid-cols-2 gap-2">
        {BUDGET_OPTIONS.map((option) => {
          const on = budget?.range === option.key;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pick(option.key)}
              className={`min-h-14 cursor-pointer rounded-xl border px-3 py-2 text-right text-sm font-bold leading-5 text-[color:var(--ink)] transition-colors ${
                option.key === "none" || option.key === "unknown" ? "" : "tabular-nums"
              } ${on ? "border-[var(--ink)] bg-[var(--primary-soft)] ring-1 ring-[var(--ink)]" : "border-[var(--rule-dark)] bg-white hover:border-[#b9b7ad]"}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <FieldError message={error} />
      <div>
        <label htmlFor={fieldId} className="mb-1 block text-sm font-bold text-[color:var(--ink)]">
          או סכום מדויק <span className="font-normal text-[color:var(--ink-soft)]">(לא חובה)</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            id={fieldId}
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            value={exact}
            onChange={(event) => {
              const text = event.target.value;
              setExact(text);
              setError("");
              const n = Number(text);
              if (text.trim() && Number.isFinite(n) && n >= 0) setDraft({ budget: { range: rangeForAmount(n), exact_ils: Math.round(n) } });
              else if (!text.trim() && budget) setDraft({ budget: { range: budget.range } });
            }}
            placeholder="2500"
            dir="ltr"
            className="min-h-12 w-36 rounded-lg border border-[var(--rule-dark)] bg-white px-3 text-left text-base font-bold text-[color:var(--ink)] outline-none focus:border-[var(--ink)] focus:ring-1 focus:ring-[var(--ink)]"
          />
          <span className="text-sm font-bold text-[color:var(--ink-soft)]">₪ לחודש</span>
        </div>
      </div>
    </StepShell>
  );
}

