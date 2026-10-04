"use client";

import type { ReactNode } from "react";

/** Choose a pinned chapter by moving the page, never by adding an inner scroll area. */
export function SceneStep({ index, children }: { index: number; children: ReactNode }) {
  return <button type="button" data-i={index} data-scene-step className="lv2-scene-step" onClick={event => {
    const scene = event.currentTarget.closest<HTMLElement>("[data-scene='track']");
    if (!scene) return;
    const box = scene.getBoundingClientRect();
    const run = box.height - window.innerHeight;
    if (run <= 0) return;
    const steps = Number(scene.dataset.steps || 1);
    window.scrollTo({
      top: window.scrollY + box.top + run * ((index + 0.65) / steps),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }}>{children}</button>;
}
