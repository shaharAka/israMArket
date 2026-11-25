"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, endpoints, type GenerateResult, type GenerationStatus } from "@/lib/api";

/**
 * The month build, from a page's side: start it, then poll until it is done or stopped.
 *
 * The build itself runs on the server (api/app/services/generation_jobs.py) and does not
 * need the page: `start` asks for it and returns at once, and this hook only polls
 * `GET /onboarding/generate/status` every few seconds while it runs. On mount it checks
 * once, so a page opened (or reloaded) mid-build picks the progress up again. It never
 * retries by itself: a stopped build shows its error, and the owner decides to retry.
 *
 * `kind` limits it to one build ("first_month" on התוכנית / Today, "next_month" for the
 * next-month button): a status of the other kind reads as nothing to show.
 */

export const GENERATION_POLL_MS = 4000;
const STATUS_TIMEOUT_MS = 12000;
const START_TIMEOUT_MS = 20000;

type Options = {
  kind?: GenerationStatus["kind"];
  /** What starting means: `endpoints.generate` (default) or `endpoints.generateNextMonth`. */
  startCall?: (signal?: AbortSignal) => Promise<GenerateResult>;
  /** Called once when a build this page started or watched finishes. */
  onDone?: (result: GenerateResult | null) => void;
  /** Called while the build runs, each time another week's posts are saved, so a page can
   *  show the weeks that are ready instead of waiting for the whole month. */
  onProgress?: (status: GenerationStatus) => void;
};

/** How many weeks of the month already have their posts. */
function weeksDone(status: GenerationStatus): number {
  return Object.values(status.posts ?? {}).filter((state) => state === "done").length;
}

export type MonthBuild = {
  /** The latest status of this kind, or null (none yet / another kind). */
  status: GenerationStatus | null;
  /** True once the first status check came back (or failed). */
  loaded: boolean;
  /** Waiting for the start request itself. */
  starting: boolean;
  running: boolean;
  /** The build stopped (`status.error_he`) or could not be started (a 400, the network). */
  error: string;
  statusCheckFailed: boolean;
  checkStatus: () => Promise<void>;
  start: () => Promise<void>;
};

export function useMonthBuild({ kind, startCall, onDone, onProgress }: Options = {}): MonthBuild {
  const [status, setStatus] = useState<GenerationStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [statusCheckFailed, setStatusCheckFailed] = useState(false);
  const pollRequest = useRef<AbortController | null>(null);
  const startRequest = useRef<AbortController | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const mounted = useRef(false);
  // True while a build this page cares about is running: its end calls onDone once.
  const watching = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);
  // Weeks with posts at the last status seen while running (-1: none seen yet).
  const lastWeeksDone = useRef(-1);

  const stopTimer = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  /** Take in a status; true while it is still running (keep polling). */
  const apply = useCallback(
    (next: GenerationStatus, result: GenerateResult | null = null): boolean => {
      if (!mounted.current) return false;
      const mine = !kind || next.kind === kind;
      setStatus(mine ? next : null);
      if (!mine) return false;
      if (next.running) {
        watching.current = true;
        const done = weeksDone(next);
        if (lastWeeksDone.current >= 0 && done > lastWeeksDone.current) onProgressRef.current?.(next);
        lastWeeksDone.current = done;
        return true;
      }
      lastWeeksDone.current = -1;
      if (next.done && watching.current) {
        watching.current = false;
        onDoneRef.current?.(result);
      }
      if (next.status === "failed") watching.current = false;
      return false;
    },
    [kind],
  );

  // The next poll, scheduled through a ref: a callback cannot name itself.
  const pollRef = useRef<() => Promise<void>>(async () => {});
  const schedule = useCallback(() => {
    stopTimer();
    timer.current = window.setTimeout(() => void pollRef.current(), GENERATION_POLL_MS);
  }, [stopTimer]);

  const poll = useCallback(async () => {
    if (startRequest.current) return;
    stopTimer();
    pollRequest.current?.abort();
    const request = new AbortController();
    pollRequest.current = request;
    const deadline = window.setTimeout(() => request.abort(), STATUS_TIMEOUT_MS);
    let again = false;
    try {
      const next = await endpoints.generationStatus(request.signal);
      if (pollRequest.current !== request) return;
      request.signal.throwIfAborted();
      setStatusCheckFailed(false);
      again = apply(next);
    } catch (err) {
      if (pollRequest.current !== request) return;
      const missing = err instanceof ApiError && err.status === 404 && !watching.current;
      setStatusCheckFailed(!missing);
      again = watching.current;
    } finally {
      window.clearTimeout(deadline);
      if (pollRequest.current === request) {
        pollRequest.current = null;
        setLoaded(true);
        if (again) schedule();
      }
    }
  }, [apply, schedule, stopTimer]);
  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    mounted.current = true;
    timer.current = window.setTimeout(() => void poll(), 0);
    return () => {
      mounted.current = false;
      stopTimer();
      pollRequest.current?.abort();
      pollRequest.current = null;
      startRequest.current?.abort();
      startRequest.current = null;
    };
  }, [poll, stopTimer]);

  const start = useCallback(async () => {
    if (startRequest.current) return;
    stopTimer();
    pollRequest.current?.abort();
    pollRequest.current = null;
    const request = new AbortController();
    startRequest.current = request;
    const deadline = window.setTimeout(() => request.abort(), START_TIMEOUT_MS);
    setStartError("");
    setStatusCheckFailed(false);
    setStarting(true);
    try {
      const result = await (startCall ?? endpoints.generate)(request.signal);
      if (startRequest.current !== request) return;
      request.signal.throwIfAborted();
      watching.current = true;
      if (result.job) {
        if (apply(result.job, result)) {
          schedule();
          return;
        }
        // A job of another kind is running: say so rather than showing nothing.
        if (kind && result.job.kind !== kind && result.job.running) {
          setStartError("כבר בונים עכשיו חודש אחר. נסו שוב כשהוא יסתיים.");
        }
      }
      if (watching.current && (result.done || result.strategy)) {
        // Done at once (the month already existed, or the demo): no status to wait for.
        watching.current = false;
        onDoneRef.current?.(result);
      }
    } catch (err) {
      if (startRequest.current !== request) return;
      // The server may have accepted a POST even if its response never arrived.
      // Check for that job before offering to start a new one.
      const responseLost = request.signal.aborted || err instanceof ApiError && (err.status === 0 || err.status >= 500);
      watching.current = responseLost;
      if (responseLost) {
        setStatusCheckFailed(true);
        schedule();
      } else {
        setStartError(err instanceof Error && err.message ? err.message : "לא הצלחנו להתחיל לבנות את החודש. נסו שוב.");
      }
    } finally {
      window.clearTimeout(deadline);
      if (startRequest.current === request) {
        startRequest.current = null;
        setStarting(false);
      }
    }
  }, [apply, kind, schedule, startCall, stopTimer]);

  const failed = status?.status === "failed";
  return {
    status,
    loaded,
    starting,
    running: Boolean(status?.running),
    error: startError || (failed ? status?.error_he || "הבנייה נעצרה. נסו שוב." : ""),
    statusCheckFailed,
    checkStatus: poll,
    start,
  };
}
