"use client";

import { ACTIVITY_OPTIONS, TRIED_OPTIONS, type Activity, type TriedChannel } from "@/lib/draft";
import { Chip } from "./ui";

/**
 * The /start answer controls that /decisions reuses, so an answer is changed with the
 * same control it was given with.
 */

/** How often they post on one network: three choices. Tapping the chosen one again clears it when `clearable`. */
export function ActivityPicker({
  label,
  value,
  onChange,
  clearable = false,
}: {
  label: string;
  value?: Activity;
  onChange: (next: Activity | undefined) => void;
  clearable?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-1.5">
      {ACTIVITY_OPTIONS.map((option) => {
        const on = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on && clearable ? undefined : option.key)}
            className={`min-h-10 cursor-pointer rounded-lg border px-1 text-xs font-bold ${
              on ? "border-[#191b18] bg-[#f1efe8] text-[#191b18] ring-1 ring-[#191b18]" : "border-[#dedcd4] bg-white text-[#4f524b]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Marketing they already tried, as chips. `children` adds chips after the list (e.g. "עוד לא ניסינו"). */
export function TriedPicker({
  channels,
  onToggle,
  children,
}: {
  channels: TriedChannel[];
  onToggle: (key: TriedChannel) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {TRIED_OPTIONS.map((option) => (
        <Chip
          key={option.key}
          label={option.label}
          selected={channels.includes(option.key)}
          onClick={() => onToggle(option.key)}
          className="px-3.5"
        />
      ))}
      {children}
    </div>
  );
}
