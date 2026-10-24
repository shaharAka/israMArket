"use client";

import { useEffect, useRef } from "react";
import { revealArtwork } from "@/lib/artworkReveal";

/** Let visitors see the artwork settle; revisit or hover intentionally to replay. */
export function useCampaignReveal(enabled: boolean, playing: boolean, identity: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled || !playing) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) return;
    let run: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inView = false;
    let seen = false;
    let busy = false;
    const play = () => {
      if (!inView || busy || document.hidden || motion.matches) return;
      busy = true; seen = true; run = new AbortController();
      void revealArtwork(root, run.signal, "[data-campaign-media] img, [data-campaign-media] video").finally(() => { busy = false; });
    };
    const visibility = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting && entry.intersectionRatio >= .6;
      clearTimeout(timer);
      if (inView && !seen) timer = setTimeout(play, 180);
      if (!entry.isIntersecting) { seen = false; run?.abort(); }
    }, { threshold: [0, .6] });
    const replay = (event: PointerEvent) => {
      if ((event.type === "pointerenter" && event.pointerType !== "touch") || event.type === "pointerdown" && event.pointerType === "touch") play();
    };
    visibility.observe(root);
    root.addEventListener("pointerenter", replay);
    root.addEventListener("click", play);
    root.addEventListener("pointerdown", replay);
    return () => {
      clearTimeout(timer); visibility.disconnect(); run?.abort();
      root.removeEventListener("pointerenter", replay); root.removeEventListener("pointerdown", replay); root.removeEventListener("click", play);
    };
  }, [enabled, playing, identity]);
  return ref;
}
