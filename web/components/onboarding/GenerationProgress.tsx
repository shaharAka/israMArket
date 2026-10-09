"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import { IconCheck } from "@/lib/icons";
import { GENERATE_STAGES } from "./constants";

/**
 * The month being built, stage by stage. The API reports the stage it is working on
 * (`generate_state.stage`), so everything before it is done and it is the one running.
 */
export function GenerationProgress({ stage, businessName }: { stage: string; businessName: string }) {
  const t = useCopy();
  const current = Math.max(
    0,
    GENERATE_STAGES.findIndex((item) => item.key === stage),
  );
  const finished = stage === "done";
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <div>
        <h2 className="text-[28px] font-bold leading-tight tracking-tight text-[var(--ink)]"><Copy text="בונים את החודש" />{businessName ? t(" של {arg_0}", { arg_0: businessName }) : ""}</h2>
        <p className="mt-2 text-base leading-relaxed text-[var(--ink-soft)]"><Copy text="דקה או שתיים. אפשר לסגור את הדף, ונמשיך לבנות ברקע." /></p>
      </div>
      <ol className="divide-y divide-[var(--rule)] overflow-hidden rounded-2xl bg-[var(--paper)] shadow-[var(--shadow-card)]">
        {GENERATE_STAGES.map((item, index) => {
          const done = finished || index < current;
          const active = !finished && index === current;
          return (
            <li
              key={item.key}
              className={`flex min-h-[52px] items-center gap-3 px-5 text-[15px] ${
                done ? "text-[var(--ink-soft)]" : active ? "font-semibold text-[var(--ink)]" : "text-[var(--ink-muted)]"
              }`}
            >
              {done ? (
                <IconCheck className="h-4 w-4 shrink-0 text-[var(--primary)]" />
              ) : (
                <span
                  className={`mx-[3px] h-2.5 w-2.5 shrink-0 rounded-full ${active ? "animate-pulse bg-[var(--sun)] motion-reduce:animate-none" : "bg-[var(--rule-dark)]"}`}
                />
              )}
              {item.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
