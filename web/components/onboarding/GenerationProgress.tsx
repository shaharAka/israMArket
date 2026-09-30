"use client";

import { IconCheck } from "@/lib/icons";
import { GENERATE_STAGES } from "./constants";

/**
 * The month being built, stage by stage. The API reports the stage it is working on
 * (`generate_state.stage`), so everything before it is done and it is the one running.
 */
export function GenerationProgress({ stage, businessName }: { stage: string; businessName: string }) {
  const current = Math.max(
    0,
    GENERATE_STAGES.findIndex((item) => item.key === stage),
  );
  const finished = stage === "done";
  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <div>
        <h2 className="text-2xl font-black text-[var(--ink)]">בונים את החודש{businessName ? ` של ${businessName}` : ""}</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">דקה או שתיים. אפשר לסגור את הדף, ונמשיך לבנות ברקע.</p>
      </div>
      <ol className="divide-y divide-[var(--rule)] rounded-lg border border-[var(--rule)] bg-white">
        {GENERATE_STAGES.map((item, index) => {
          const done = finished || index < current;
          const active = !finished && index === current;
          return (
            <li
              key={item.key}
              className={`flex min-h-12 items-center gap-3 px-4 text-sm ${
                done ? "text-[var(--ink)]" : active ? "font-bold text-[var(--ink)]" : "text-[var(--ink-muted)]"
              }`}
            >
              {done ? (
                <IconCheck className="h-4 w-4 shrink-0" />
              ) : (
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${active ? "animate-pulse bg-[var(--ink)]" : "bg-[var(--rule-dark)]"}`}
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
