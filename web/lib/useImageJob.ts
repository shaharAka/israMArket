"use client";

import { useEffect, useRef, useState } from "react";
import { endpoints, type ImageJobStatus } from "@/lib/api";

/**
 * The business's image job, from a page's side: read only (#123).
 *
 * Post images are made on the server (api/app/services/image_jobs.py), once when a month's
 * posts are written, or when the owner asks for one in the editor. Opening a page never
 * starts or pays for them: this hook reads the job's status on mount (and again when
 * `refreshKey` changes, e.g. after the month's posts were written), polls while it runs,
 * and calls `onProgress` each time another post's image is done, so the page can load it.
 */

export const IMAGE_JOB_POLL_MS = 4000;

type Options = {
  /** Read the status again when this changes. */
  refreshKey?: number;
  /** Another image is done (or failed) since the last read. */
  onProgress?: (status: ImageJobStatus) => void;
};

export function useImageJob({ refreshKey = 0, onProgress }: Options = {}): ImageJobStatus | null {
  const [status, setStatus] = useState<ImageJobStatus | null>(null);
  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    // Images done or failed at the last read (-1: none read yet), and whether it ran then.
    let settled = -1;
    let running = false;

    async function poll() {
      try {
        const next = await endpoints.imageJobStatus();
        if (!active) return;
        setStatus(next);
        const now = next.done + next.failed;
        if (settled >= 0 && now > settled) onProgressRef.current?.(next);
        settled = now;
        running = next.running;
      } catch {
        // A network blip while images are made: keep polling; nothing to watch otherwise.
      }
      if (active && running) timer = window.setTimeout(() => void poll(), IMAGE_JOB_POLL_MS);
    }

    void poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [refreshKey]);

  return status;
}
