"use client";

import { useState } from "react";
import type { GrowthTargetCandidate } from "@/lib/api";
import { AGENT_NAME } from "@/lib/agent";
import { IconCheck, IconSparkles } from "@/lib/icons";

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
    <div className="space-y-6">
      <section>
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-black text-[#191b18]">הסדר שלי</h3>
          <span className={`text-[11px] ${atCap ? "font-bold text-[#191b18]" : "text-[#8b8e84]"}`}>
            {value.length
              ? `${value.length} מתוך ${MAX_TARGETS} עדיפויות · הראשון הוא המוביל`
              : `אפשר לבחור עד ${MAX_TARGETS}`}
          </span>
        </div>

        {value.length ? (
          <ul className="mt-3 space-y-2">
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
                  className={`flex items-start gap-3 rounded-md border bg-white p-3 transition-colors ${
                    isOver ? "border-[#191b18] bg-[#f4f3ee]" : "border-[#e6e4dc]"
                  } ${dragIndex === index ? "opacity-50" : ""}`}
                >
                  <span
                    aria-hidden
                    className="mt-0.5 cursor-grab select-none text-lg leading-none text-[#b3b0a5]"
                    title="גררו כדי לשנות סדר"
                  >
                    ⠿
                  </span>
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#191b18] text-[11px] font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    {meta ? (
                      <span className="mb-1 block text-[10px] font-bold text-[#8b8e84]">{meta.category}</span>
                    ) : null}
                    <span className="block text-sm font-bold leading-6 text-[#191b18]">{target}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(index, index - 1)}
                      disabled={index === 0}
                      aria-label="העבר למעלה"
                      className="h-7 w-7 rounded border border-[#e6e4dc] text-xs text-[#5e6159] disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, index + 1)}
                      disabled={index === value.length - 1}
                      aria-label="העבר למטה"
                      className="h-7 w-7 rounded border border-[#e6e4dc] text-xs text-[#5e6159] disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(target)}
                      aria-label="הסר יעד"
                      className="h-7 w-7 rounded border border-[#e6e4dc] text-xs text-[#5e6159] hover:bg-[#f8f7f4]"
                    >
                      ✕
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 rounded-md border border-dashed border-[#dedcd4] bg-[#f8f7f4] px-4 py-6 text-center text-sm text-[#8b8e84]">
            בחרו עד {MAX_TARGETS} יעדים מהרשימה למטה, ואז סדרו אותם לפי מה שהכי חשוב לכם.
          </p>
        )}

        {agentCanDecide ? (
          <div className="mt-3 flex flex-col gap-2 rounded-md border border-[#e2d7c3] bg-[#fcf9f2] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-bold text-[#685f47]">
                <IconSparkles className="h-3.5 w-3.5" />
                יש המלצה מוכנה
              </p>
              <p className="mt-1 text-xs leading-5 text-[#5e6159]">
                {AGENT_NAME} דירגה את שלושת היעדים שלדעתה יתנו את התוצאה הגדולה ביותר לעסק הזה.
              </p>
            </div>
            {agentAlreadyPicked ? (
              // Previously this was a disabled button reading "מאיה כבר בחרה", which
              // looked broken: the owner's manual picks usually *are* her three (she is
              // listed first), so the natural click landed on a dead control with no
              // explanation of why. An explicit confirmation says what actually happened.
              <p className="flex shrink-0 items-center gap-2 rounded-md border border-[#c7d6c2] bg-[#f3f7f1] px-3 py-2 text-xs font-bold text-[#374b3d]">
                <IconCheck className="h-3.5 w-3.5" />
                הבחירה שלכם זהה להמלצה של {AGENT_NAME}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => onChange(recommended.map((item) => item.target))}
                className="shrink-0 rounded-md bg-[#20211f] px-4 py-2 text-xs font-bold text-white hover:bg-[#343632]"
              >
                תנו ל{AGENT_NAME} להחליט
              </button>
            )}
          </div>
        ) : null}
      </section>

      {available.length ? (
        <section>
          <h3 className="text-sm font-black text-[#191b18]">יעדים אפשריים</h3>
          <p className="mt-1 text-xs text-[#8b8e84]">
            {atCap
              ? `בחרתם ${MAX_TARGETS} עדיפויות — זה המקסימום לרבעון. הסירו אחת כדי להחליף.`
              : "מבוססים על העסק, על האתר ועל האבחון. לחצו כדי להוסיף לרשימה שלכם."}
          </p>
          <ul className="mt-3 space-y-2">
            {available.map((item) => {
              const isRecommended = (item.recommended_rank ?? 0) > 0;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => add(item.target)}
                    disabled={atCap}
                    className={`flex w-full items-start gap-3 rounded-md border bg-white p-3 text-right ${
                      atCap ? "cursor-not-allowed border-[#e6e4dc] opacity-50" : "border-[#e6e4dc] hover:border-[#191b18]"
                    }`}
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#dedcd4] text-[#8b8e84]">
                      +
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="mb-1 flex items-center gap-2">
                        <span className="text-[10px] font-bold text-[#8b8e84]">{item.category}</span>
                        {isRecommended ? (
                          <span className="rounded-full bg-[#fcf9f2] px-2 py-0.5 text-[10px] font-bold text-[#685f47]">
                            {AGENT_NAME} ממליצה · {item.recommended_rank}
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-sm font-bold leading-6 text-[#191b18]">{item.target}</span>
                      <span className="mt-1 block text-xs leading-5 text-[#5e6159]">{item.why_this}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : value.length ? (
        <p className="flex items-center gap-2 text-xs font-bold text-[#2d3f32]">
          <IconCheck className="h-4 w-4" />
          כל היעדים המוצעים נבחרו. סדרו אותם לפי סדר החשיבות.
        </p>
      ) : null}
    </div>
  );
}
