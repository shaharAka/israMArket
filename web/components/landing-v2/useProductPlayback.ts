"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ProductScreen } from "./ProductFeatureShowcase";

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(listener: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
function subscribeVisibility(listener: () => void) {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

/** Only operates on the local, read-only product showcase. Never clicks app actions. */
export function useProductPlayback(enabled: boolean, screen: ProductScreen,
  setScreen: (screen: ProductScreen) => void, setPostIndex: (index: number | null) => void) {
  const frame = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [requested, setRequested] = useState(true);
  const [inView, setInView] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number; pressed: boolean } | null>(null);
  const reduced = useSyncExternalStore(subscribeMotion, () => window.matchMedia(motionQuery).matches, () => true);
  const visible = useSyncExternalStore(subscribeVisibility, () => document.visibilityState === "visible", () => false);
  const playing = enabled && requested && inView && visible && !reduced;

  useEffect(() => {
    if (!enabled || !frame.current) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.intersectionRatio >= .35), { threshold: [0, .35] });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [enabled]);

  useEffect(() => {
    if (!playing) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (delay: number, work: () => void) => timers.push(setTimeout(work, delay));
    const panel = () => viewport.current?.querySelector<HTMLElement>('[data-active="true"]');
    const target = () => screen === "posts"
      ? panel()?.querySelector<HTMLElement>('a[href^="/design/business?"]')
      : panel()?.querySelector<HTMLElement>("details > summary");
    const panTo = (element: HTMLElement) => {
      const view = viewport.current;
      if (!view) return;
      const bounds = view.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const scale = bounds.width / view.offsetWidth;
      view.scrollBy({ top: (rect.top - bounds.top - bounds.height * .3) / scale, behavior: "smooth" });
    };
    later(0, () => {
      setCursor(null);
      viewport.current?.scrollTo({ top: 0, behavior: "instant" });
      panel()?.querySelectorAll("details").forEach(detail => { detail.open = false; });
      if (screen === "posts") setPostIndex(null);
    });
    later(1100, () => { const node = target(); if (node) panTo(node); });
    later(1800, () => {
      const node = target();
      const bounds = frame.current?.getBoundingClientRect();
      if (!node || !bounds) return;
      const rect = node.getBoundingClientRect();
      setCursor({ x: rect.left - bounds.left + rect.width * .62, y: rect.top - bounds.top + rect.height * .5, pressed: false });
    });
    later(2600, () => {
      const node = target();
      if (!node) return;
      setCursor(point => point && { ...point, pressed: true });
      node.click();
      if (screen === "posts") viewport.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
    later(3100, () => setCursor(null));
    later(8500, () => setScreen(screen === "plan" ? "posts" : screen === "posts" ? "results" : "plan"));
    return () => timers.forEach(clearTimeout);
  }, [playing, screen, setScreen, setPostIndex]);

  return { frame, viewport, cursor: playing ? cursor : null, playing, requested, reduced,
    pause: () => setRequested(false), toggle: () => setRequested(value => !value) };
}
