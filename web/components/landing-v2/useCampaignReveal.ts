"use client";

import { useEffect, useRef } from "react";
import type { AsciiRevealController } from "ascii-reveal/core";

/** A single media-only reveal. The real layout and all copy stay in place. */
export function useCampaignReveal(enabled: boolean, playing: boolean, identity: string) {
  const ref = useRef<HTMLDivElement>(null);
  const revealed = useRef(new Set<string>());

  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled || !playing || revealed.current.has(identity)) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) return;
    const abort = new AbortController();
    let controller: AsciiRevealController | undefined;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    let mediaTimer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let visibility: IntersectionObserver | undefined;

    const finish = () => {
      controller?.destroy();
      controller = undefined;
      clearTimeout(finishTimer);
      if (revealed.current.has(identity)) root.dataset.campaignReveal = "complete";
    };

    async function reveal() {
      try {
        // Wait for the artwork itself, rather than playing while only the chapter edge is visible.
        await new Promise<void>(resolve => {
          visibility = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting && entry.intersectionRatio >= .35) {
              visibility?.disconnect();
              resolve();
            }
          }, { threshold: .35 });
          visibility.observe(root!);
        });
        if (abort.signal.aborted) return;
        // Load this optional effect only when its artwork enters the viewport.
        const { createAsciiReveal, presets } = await import("ascii-reveal/core");
        if (abort.signal.aborted) return;
        await new Promise<void>(resolve => {
          frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(() => resolve());
          });
        });
        if (abort.signal.aborted) return;
        const media = Array.from(root!.querySelectorAll<HTMLImageElement | HTMLVideoElement>("[data-campaign-media] img, [data-campaign-media] video"));
        if (!media.length) return;
        const ready = (element: HTMLImageElement | HTMLVideoElement) => element instanceof HTMLImageElement
          ? element.complete && element.naturalWidth > 0
          : element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
        const wait = media.map(element => ready(element) ? Promise.resolve() : new Promise<void>(resolve => {
          for (const event of ["load", "loadeddata", "error"]) element.addEventListener(event, () => resolve(), { once: true, signal: abort.signal });
        }));
        // Slow or unavailable media never holds back the actual page.
        await Promise.race([Promise.all(wait), new Promise<void>(resolve => { mediaTimer = setTimeout(resolve, 900); })]);
        clearTimeout(mediaTimer);
        if (abort.signal.aborted || motion.matches || document.hidden || !media.every(ready)) return;
        controller = createAsciiReveal(root!, {
          preset: { ...presets.dither, color: "accent" },
          selector: "[data-campaign-media] img, [data-campaign-media] video",
          duration: "cinematic", speed: 1.6, origin: "center", lazy: false, fallback: true,
        });
        revealed.current.add(identity);
        root!.dataset.campaignReveal = "playing";
        // Also restore content if the browser interrupts the animation clock.
        finishTimer = setTimeout(finish, 1800);
        await controller.reveal();
        finish();
      } catch {
        // The artwork is the fallback; a failed enhancement cannot hide it.
        finish();
      }
    }
    void reveal();
    return () => {
      abort.abort();
      visibility?.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(mediaTimer);
      finish();
    };
  }, [enabled, playing, identity]);

  return ref;
}
