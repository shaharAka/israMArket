"use client";

import { useState } from "react";
import { MONTHS_HE, MONTH_HINTS } from "@/lib/draft";
import styles from "./start.module.css";
import form from "./form.module.css";
import seasons from "./seasons.module.css";

export type Seasons = { busy: number[]; slow: number[] };

/**
 * The busy / quiet months grid, shared by the /start step and /decisions.
 *
 * Two modes, because one tap per month has to mean one thing. The owner does not always
 * notice there is a second mode, so the modes are numbered in the order to use them, the
 * line under the switch says what to do next (and, once a busy month is marked, points at
 * "2. שקט" while that button pulses), and a legend says that a month left unmarked is an
 * ordinary month — not a question left unanswered.
 *
 * Busy months are the sun (the product's highlight), quiet months the soft blue.
 */
export function SeasonsPicker({
  value,
  onChange,
  example,
}: {
  value: Seasons;
  onChange: (next: Seasons) => void;
  /** A type-aware memory jog for the first tap, e.g. "למשל: החגים וחנוכה". */
  example?: string;
}) {
  const [mode, setMode] = useState<"busy" | "slow">("busy");
  const nudge = mode === "busy" && value.busy.length > 0 && value.slow.length === 0;

  function toggle(month: number) {
    const other = mode === "busy" ? "slow" : "busy";
    const list = value[mode];
    const nextList = list.includes(month) ? list.filter((m) => m !== month) : [...list, month];
    onChange({ ...value, [mode]: nextList, [other]: value[other].filter((m) => m !== month) } as Seasons);
  }

  const guide = nudge
    ? "יופי. עכשיו לחצו על ״2. שקט״ וסמנו את החודשים השקטים."
    : mode === "busy" && value.busy.length === 0
      ? `סמנו את החודשים העמוסים. ${example ? `${example}.` : ""}`.trim()
      : mode === "slow" && value.slow.length === 0
        ? "עכשיו סמנו את החודשים השקטים."
        : "לחיצה נוספת על חודש מבטלת את הסימון.";

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="מה מסמנים" className={form.segmented}>
        {(["busy", "slow"] as const).map((key, index) => {
          const on = mode === key;
          const count = value[key].length;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setMode(key)}
              className={key === "slow" && nudge ? styles.nudge : ""}
            >
              <span aria-hidden className={seasons.dot} data-kind={key} />
              {index + 1}. {key === "busy" ? "עמוס" : "שקט"}
              {count ? <span className="text-xs font-normal tabular-nums text-[color:var(--ink-muted)]">({count})</span> : null}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className={`min-h-5 text-[13px] leading-5 ${nudge ? "font-semibold text-[color:var(--primary-dark)]" : "text-[color:var(--ink-muted)]"}`}>
        {guide}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {MONTHS_HE.map((label, index) => {
          const month = index + 1;
          const busy = value.busy.includes(month);
          const slow = value.slow.includes(month);
          return (
            <button
              key={label}
              type="button"
              aria-pressed={busy || slow}
              aria-label={`${label}${busy ? ", עמוס" : slow ? ", שקט" : ""}`}
              onClick={() => toggle(month)}
              className={seasons.month}
              data-kind={busy ? "busy" : slow ? "slow" : undefined}
            >
              {label}
              <small>{MONTH_HINTS[month] ?? " "}</small>
            </button>
          );
        })}
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[color:var(--ink-muted)]" aria-label="מקרא">
        <Swatch kind="busy" label="עמוס" />
        <Swatch kind="slow" label="שקט" />
        <Swatch label="לא סימנתם? חודש רגיל" />
      </p>
    </div>
  );
}

function Swatch({ kind, label }: { kind?: "busy" | "slow"; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={seasons.swatch} data-kind={kind} />
      {label}
    </span>
  );
}
