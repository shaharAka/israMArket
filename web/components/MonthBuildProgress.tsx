"use client";

import { useEffect, useRef } from "react";
import { endpoints, type GenerateResult, type GenerationStatus } from "@/lib/api";
import { SECTIONS } from "@/lib/sections";
import { useMonthBuild } from "@/lib/useMonthBuild";

const TONE = SECTIONS.strategy;

// What "לנסות שוב" (and autoStart) asks for, per kind. Posts: every week not written yet.
const START: Record<GenerationStatus["kind"], () => Promise<GenerateResult>> = {
  first_month: endpoints.generate,
  next_month: endpoints.generateNextMonth,
  posts: () => endpoints.startPosts().then((job) => ({ job, done: job.done })),
};

/**
 * One row: the month (or its posts) being built on the server, or why it stopped, with
 * "לנסות שוב".
 *
 * Self-contained so any page can place it — התוכנית and Today use it for the first
 * month's structure; kind="posts" shows the posts being written once the owner asked for
 * them (endpoints.startPosts). It polls the build's status itself (lib/useMonthBuild.ts)
 * and renders nothing when nothing is being built. The build does not need this page
 * open: the row says so.
 *
 * `autoStart` starts the build when there is none running and none that failed — the
 * business has a plan and no month. A failed build is never retried by itself.
 */
export function MonthBuildProgress({
  kind = "first_month",
  autoStart = false,
  onDone,
}: {
  kind?: GenerationStatus["kind"];
  autoStart?: boolean;
  onDone?: (result: GenerateResult | null) => void;
}) {
  const build = useMonthBuild({ kind, onDone, startCall: START[kind] });
  const { status, loaded, starting, running, error, start } = build;
  const autoStarted = useRef(false);

  useEffect(() => {
    if (!autoStart || !loaded || autoStarted.current) return;
    if (running || starting || status?.status === "failed" || status?.done) return;
    autoStarted.current = true;
    void start();
  }, [autoStart, loaded, running, starting, status, start]);

  if (error && !running && !starting) {
    return (
      <div role="alert" className="rounded-lg border border-[#d8c3bd] bg-white px-4 py-3 text-sm leading-6 text-[#7c4036]">
        <p className="font-bold">
          {kind === "posts"
            ? "לא הצלחנו לסיים את הפוסטים."
            : status?.month_name_he
              ? `לא הצלחנו לסיים את ${status.month_name_he}.`
              : "לא הצלחנו לסיים את החודש."}
        </p>
        <p>{error}</p>
        <button
          type="button"
          onClick={() => void start()}
          className="mt-1 inline-flex min-h-11 cursor-pointer items-center rounded-md border border-[var(--rule-dark)] bg-white px-4 text-sm font-bold text-[color:var(--ink)]"
        >
          לנסות שוב
        </button>
      </div>
    );
  }

  if (!running && !starting) return null;

  const label = status?.running ? status.label_he : "מתחילים לבנות את החודש…";
  const step = status?.running ? Math.min(status.stage_index + 1, status.stage_count) : 1;
  const steps = status?.stage_count || 4;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-lg px-4 py-3"
      style={{ background: TONE.surface }}
    >
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full motion-reduce:animate-none"
        style={{ background: TONE.accent }}
      />
      <p className="min-w-0 flex-1 text-sm leading-6 text-[color:var(--ink)]">
        <b>{label}</b>
        <span className="block text-xs text-[color:var(--ink-soft)]">
          שלב {step} מתוך {steps}. אפשר לסגור את הדף, ונמשיך לבנות ברקע.
        </span>
      </p>
    </div>
  );
}
