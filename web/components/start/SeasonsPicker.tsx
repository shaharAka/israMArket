"use client";

import { useState } from "react";
import { MONTHS_HE, MONTH_HINTS } from "@/lib/draft";
import styles from "./start.module.css";

export type Seasons = { busy: number[]; slow: number[] };

const BUSY = { dot: "#d9824b", tile: "border-[#d9824b] bg-[var(--danger-soft)] text-[#6b3517]" };
const SLOW = { dot: "#7da2b8", tile: "border-[#7da2b8] bg-[var(--primary-soft)] text-[#24475a]" };

/**
 * The busy / quiet months grid, shared by the /start step and /decisions.
 *
 * Two modes, because one tap per month has to mean one thing. The owner does not always
 * notice there is a second mode, so the modes are numbered in the order to use them, the
 * line under the switch says what to do next (and, once a busy month is marked, points at
 * "2. שקט" while that button pulses), and a legend says that a month left unmarked is an
 * ordinary month — not a question left unanswered.
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
    <div className="space-y-2">
      <div role="radiogroup" aria-label="מה מסמנים" className="grid grid-cols-2 gap-1 rounded-full bg-[var(--rule)] p-1">
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
              className={`flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full text-sm font-bold ${
                on ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--ink-soft)]"
              } ${key === "slow" && nudge ? `ring-2 ring-[#7da2b8] ${styles.nudge}` : ""}`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: key === "busy" ? BUSY.dot : SLOW.dot }} />
              {index + 1}. {key === "busy" ? "עמוס" : "שקט"}
              {count ? <span className="text-xs font-normal text-[var(--ink-soft)]">({count})</span> : null}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className={`min-h-5 text-xs leading-5 ${nudge ? "font-bold text-[#24475a]" : "text-[var(--ink-soft)]"}`}>
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
              className={`flex min-h-[52px] cursor-pointer flex-col items-center justify-center rounded-xl border text-sm font-bold transition-colors ${
                busy ? BUSY.tile : slow ? SLOW.tile : "border-[var(--rule)] bg-white text-[var(--ink)]"
              }`}
            >
              {label}
              <span className="text-[10px] font-normal opacity-70">{MONTH_HINTS[month] ?? " "}</span>
            </button>
          );
        })}
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--ink-soft)]" aria-label="מקרא">
        <Swatch className="border-[#d9824b] bg-[var(--danger-soft)]" label="עמוס" />
        <Swatch className="border-[#7da2b8] bg-[var(--primary-soft)]" label="שקט" />
        <Swatch className="border-[var(--rule)] bg-white" label="לא סימנתם? חודש רגיל" />
      </p>
    </div>
  );
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`h-3 w-3 rounded-[4px] border ${className}`} />
      {label}
    </span>
  );
}
