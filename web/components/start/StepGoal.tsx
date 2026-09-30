"use client";

import { useId, useState } from "react";
import type { BusinessModel } from "@/lib/api";
import { BUSINESS_MODEL_OPTIONS, isGoalValidFor } from "@/lib/businessModel";
import {
  BUDGET_OPTIONS,
  GROW_OPTIONS,
  rangeForAmount,
  type BudgetRange,
  type GrowWhere,
} from "@/lib/quarterPlan";
import { modelOf } from "./script";
import type { StepProps } from "./steps";
import { CHANGE_LATER, Chip, StepShell } from "./ui";
import styles from "./start.module.css";
import form from "./form.module.css";

/**
 * The chapter "המטרה והתקציב": where to grow (shops only) and the monthly budget. Revision
 * 6 put the numbers between and after them (StepNumbers.tsx): where the business is today,
 * what to grow, and the calculated target. The old "מה ייחשב הצלחה" follows from the lever.
 */

const MODEL_QUESTION: Record<BusinessModel, string> = {
  products: "נראה שאתם מוכרים מוצרים — נכון?",
  services: "נראה שאתם נותנים שירות — נכון?",
  both: "נראה שאתם מוכרים מוצרים וגם נותנים שירות — נכון?",
};

function FieldError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={form.error}>
      {message}
    </p>
  );
}

/** "מוצרים או שירות?": inferred from what they wrote, confirmed with one tap. Asked once. */
export function ModelConfirm({ flow, update }: Pick<StepProps, "flow" | "update">) {
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
          // Another model means other questions and levers: those answers may not exist there.
          success: nextModel === f.draft.business_model ? f.draft.success : undefined,
          baseline: nextModel === f.draft.business_model ? f.draft.baseline : undefined,
          lever: nextModel === f.draft.business_model ? f.draft.lever : undefined,
          target: nextModel === f.draft.business_model ? f.draft.target : undefined,
          grow_where: nextModel === "services" ? undefined : f.draft.grow_where,
        },
      };
    });
    setChanging(false);
  }

  return (
    <div className={form.panel}>
      {changing ? (
        <div className="space-y-3">
          <p className="text-[15px] font-semibold text-[color:var(--ink)]">מה אתם מוכרים?</p>
          <div className="grid grid-cols-3 gap-2">
            {BUSINESS_MODEL_OPTIONS.map((option) => (
              <Chip
                key={option.key}
                label={option.key === "both" ? "גם וגם" : option.title}
                selected={model === option.key}
                onClick={() => setModel(option.key)}
                className="!px-2"
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="flex items-center gap-3 text-[15px] font-semibold text-[color:var(--ink)]">
            <span aria-hidden className={styles.sunDot} />
            {MODEL_QUESTION[model]}
          </p>
          <div className="flex gap-2">
            <Chip
              label="נכון"
              selected={Boolean(flow.modelConfirmed)}
              onClick={() => update((f) => ({ ...f, modelConfirmed: true, draft: { ...f.draft, business_model: model } }))}
            />
            <Chip label="לא בדיוק" selected={false} onClick={() => setChanging(true)} />
          </div>
        </div>
      )}
    </div>
  );
}

export function Tile({
  on,
  title,
  desc,
  badge,
  onClick,
}: {
  on: boolean;
  title: string;
  desc?: string;
  /** A small label beside the title ("ההמלצה שלנו"). */
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={form.tile}
    >
      <span aria-hidden className={form.radio} />
      <span className="min-w-0">
        <span className={form.tileTitle}>
          {title}
          {/* A plain text status, not a filled pill: the screen's one filled control is its primary action. */}
          {badge ? <small>{badge}</small> : null}
        </span>
        {desc ? <span className={form.tileDesc}>{desc}</span> : null}
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
      why="ככה נדע מה לספור: הזמנות באתר, או אנשים שנכנסים לחנות."
      primary="להמשיך למצב של היום"
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
        <p className={`text-[15px] leading-6 text-[color:var(--ink-soft)] ${styles.rise}`}>בשירות אין ״באתר או בחנות״. נדלג על השאלה הזו.</p>
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
                setDraft(
                  value === option.key
                    ? { grow_where: option.key }
                    : { grow_where: option.key, success: undefined, target: flow.draft.target?.edited_by_owner ? flow.draft.target : undefined },
                );
              }}
            />
          ))}
        </div>
      )}
      <FieldError message={error} />
    </StepShell>
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
      primary="להמשיך ליעד"
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
              className={`${form.option} ${option.key === "none" || option.key === "unknown" ? "" : "tabular-nums"}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <FieldError message={error} />
      <div>
        <label htmlFor={fieldId} className={form.label}>
          או סכום מדויק <small>(לא חובה)</small>
        </label>
        <div className="flex items-center gap-3">
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
            className={`${form.input} ${form.number}`}
          />
          <span className="text-sm font-medium text-[color:var(--ink-soft)]">₪ לחודש</span>
        </div>
      </div>
    </StepShell>
  );
}

