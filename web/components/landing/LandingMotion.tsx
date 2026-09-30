"use client";

import { useLayoutEffect } from "react";

/**
 * Scroll reveals for the landing page: any element marked `data-rv` fades up a little the
 * first time it enters the viewport (stagger with `--rv-i`). CSS in landing.css.
 *
 * Nothing is hidden before this runs, so the server HTML is complete without JavaScript.
 * On mount, elements already on screen are marked "instant" (no animation, so nothing
 * that was visible blinks), and only then does the page opt in to hiding the rest until
 * they scroll in. Under prefers-reduced-motion it does nothing at all.
 */
export function LandingMotion() {
  useLayoutEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.documentElement;
    const items = Array.from(document.querySelectorAll<HTMLElement>("[data-rv]"));
    const height = window.innerHeight;
    for (const item of items) {
      const box = item.getBoundingClientRect();
      if (box.top < height && box.bottom > 0) item.dataset.rvIn = "instant";
    }
    root.dataset.lpMotion = "on";

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.rvIn = "true";
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.1 },
    );
    for (const item of items) if (!item.dataset.rvIn) observer.observe(item);

    return () => {
      observer.disconnect();
      delete root.dataset.lpMotion;
      for (const item of items) delete item.dataset.rvIn;
    };
  }, []);

  return null;
}
