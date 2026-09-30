"use client";

import { useState } from "react";
import type { GrowthTargetCandidate } from "@/lib/api";
import { AGENT_NAME } from "@/lib/agent";
import { IconCheck, IconChevron, IconPlus, IconSparkles } from "@/lib/icons";

/** A small icon-only control (reorder, remove): 44px to tap, quiet until hovered. */
const ICON_BUTTON =
  "inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--ink-muted)] transition-colors hover:bg-[var(--soft)] hover:text-[var(--ink)] disabled:opacity-30 disabled:hover:bg-transparent";

/** A quarter carries three priorities. Four is a list, not a focus. */
export const MAX_TARGETS = 3;

/**
 * Step 5 of onboarding: pick up to three targets, then put them in the owner's order.
 *
 * Order is the point — the quarter plan is built from this list top-down, so the first
 * item becomes the leading goal. Dragging works with a mouse; the up/down buttons exist
 * so the same ordering is reachable by keyboard and on touch.
 */
export function TargetRanker({
  candidates,
  value,
  onChange,
}: {
  candidates: GrowthTargetCandidate[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const byTarget = new Map(candidates.map((item) => [item.target, item]));
  const available = candidates.filter((item) => !value.includes(item.target));
  const atCap = value.length >= MAX_TARGETS;

  const recommended = candidates
    .filter((item) => (item.recommended_rank ?? 0) > 0)
    .sort((a, b) => (a.recommended_rank ?? 0) - (b.recommended_rank ?? 0));

  function add(target: string) {
    if (atCap) return;
    onChange([...value, target]);
  }

  function remove(target: string) {
    onChange(value.filter((item) => item !== target));
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= value.length || from === to) return;
    const next = [...value];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  function handleDrop(to: number) {
    if (dragIndex !== null) move(dragIndex, to);
    setDragIndex(null);
    setOverIndex(null);
  }

  const agentCanDecide = recommended.length > 0;
  const agentAlreadyPicked =
    agentCanDecide &&
    recommended.length === value.length &&
    recommended.every((item, index) => item.target === value[index]);

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[15px] font-semibold text-[var(--ink)]">הסדר שלי</h3>
          <span className={`text-xs ${atCap ? "font-semibold text-[var(--ink)]" : "text-[var(--ink-muted)]"}`}>
            {value.length
              ? `${value.length} מתוך ${MAX_TARGETS} · הראשון הכי חשוב`
              : `אפשר לבחור עד ${MAX_TARGETS}`}
          </span>
        </div>

        {value.length ? (
          <ul className="mt-3 divide-y divide-[var(--rule)] overflow-hidden rounded-2xl bg-[var(--paper)] shadow-[var(--shadow-card)]">
            {value.map((target, index) => {
              const meta = byTarget.get(target);
              const isOver = overIndex === index && dragIndex !== null && dragIndex !== index;
              return (
                <li
                  key={target}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setOverIndex(index);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleDrop(index);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  className={`flex items-center gap-3 py-2 pr-3 pl-2 transition-colors ${
                    isOver ? "bg-[var(--primary-soft)]" : ""
                  } ${dragIndex === index ? "opacity-50" : ""}`}
                >
                  {/* The drag handle: six dots drawn in CSS, not a "⠿" glyph. */}
                  <span
                    aria-hidden
                    className="h-4 w-2.5 shrink-0 cursor-grab bg-[radial-gradient(circle,var(--ink-faint)_1.2px,transparent_1.6px)] bg-[length:5px_5.5px]"
                    title="גררו כדי לשנות את הסדר"
                  />
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-xs font-semibold tabular-nums text-[var(--primary-dark)]">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 py-1">
                    {meta ? (
                      <span className="block text-xs font-medium text-[var(--ink-muted)]">{meta.category}</span>
                    ) : null}
                    <span className="block text-[15px] font-semibold leading-6 text-[var(--ink)]">{target}</span>
                  </span>
                  <span className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => move(index, index - 1)}
                      disabled={index === 0}
                      aria-label="להזיז למעלה"
                      title="להזיז למעלה"
                      className={ICON_BUTTON}
                    >
                      <IconChevron className="h-[18px] w-[18px] rotate-90" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, index + 1)}
                      disabled={index === value.length - 1}
                      aria-label="להזיז למטה"
                      title="להזיז למטה"
                      className={ICON_BUTTON}
                    >
                      <IconChevron className="h-[18px] w-[18px] -rotate-90" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(target)}
                      aria-label="להסיר את היעד"
                      title="להסיר את היעד"
                      className={ICON_BUTTON}
                    >
                      <IconPlus className="h-[18px] w-[18px] rotate-45" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 rounded-xl bg-[var(--paper)] px-5 py-6 text-center text-sm leading-6 text-[var(--ink-muted)]">
            בחרו עד {MAX_TARGETS} יעדים מהרשימה למטה, ואז סדרו אותם לפי מה שהכי חשוב לכם.
          </p>
        )}

        {agentCanDecide ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl bg-[var(--primary-soft)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-[var(--primary-dark)]">
                <IconSparkles className="h-4 w-4" />
                יש המלצה מוכנה
              </p>
              <p className="mt-1 text-[13px] leading-6 text-[var(--ink-soft)]">
                {AGENT_NAME} סידרה את 3 היעדים שלדעתה יועילו לעסק הכי הרבה.
              </p>
            </div>
            {agentAlreadyPicked ? (
              // Previously this was a disabled button reading "מאיה כבר בחרה", which
              // looked broken: the owner's manual picks usually *are* her three (she is
              // listed first), so the natural click landed on a dead control with no
              // explanation of why. An explicit confirmation says what actually happened.
              <p className="flex shrink-0 items-center gap-2 text-[13px] font-semibold text-[var(--primary-dark)]">
                <IconCheck className="h-4 w-4" />
                בחרתם בדיוק מה ש{AGENT_NAME} המליצה
              </p>
            ) : (
              <button
                type="button"
                onClick={() => onChange(recommended.map((item) => item.target))}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-[var(--rule-dark)] bg-[var(--paper)] px-4 text-[13px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary-dark)]"
              >
                לתת ל{AGENT_NAME} להחליט
              </button>
            )}
          </div>
        ) : null}
      </section>

      {available.length ? (
        <section>
          <h3 className="text-[15px] font-semibold text-[var(--ink)]">יעדים אפשריים</h3>
          <p className="mt-1 text-[13px] leading-6 text-[var(--ink-muted)]">
            {atCap
              ? `בחרתם ${MAX_TARGETS} יעדים להתמקד בהם. כדי להחליף, הסירו אחד.`
              : "לפי העסק, האתר והאבחון. לחצו על יעד כדי להוסיף אותו."}
          </p>
          <ul className="mt-3 space-y-3">
            {available.map((item) => {
              const isRecommended = (item.recommended_rank ?? 0) > 0;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => add(item.target)}
                    disabled={atCap}
                    className={`group flex w-full items-start gap-3 rounded-xl bg-[var(--paper)] p-4 text-right ring-1 ring-inset ring-[var(--rule-dark)] transition-[box-shadow] duration-150 ${
                      atCap ? "cursor-not-allowed opacity-50" : "hover:ring-[var(--primary)]"
                    }`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--soft)] text-[var(--ink-muted)] transition-colors group-hover:bg-[var(--primary-soft)] group-hover:text-[var(--primary)]">
                      <IconPlus className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-xs font-medium text-[var(--ink-muted)]">{item.category}</span>
                        {isRecommended ? (
                          <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--primary-dark)]">
                            {AGENT_NAME} ממליצה · {item.recommended_rank}
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-[15px] font-semibold leading-6 text-[var(--ink)]">{item.target}</span>
                      <span className="mt-1 block text-[13px] leading-6 text-[var(--ink-soft)]">{item.why_this}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : value.length ? (
        <p className="flex items-center gap-2 text-[13px] font-semibold text-[var(--primary-dark)]">
          <IconCheck className="h-4 w-4" />
          בחרתם את כל היעדים. סדרו אותם לפי מה שהכי חשוב לכם.
        </p>
      ) : null}
    </div>
  );
}
