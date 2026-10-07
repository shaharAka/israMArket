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
  setScreen: (screen: ProductScreen) => void, setPostIndex: (index: number | null) => void, autoplay = true) {
  const frame = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(.6);
  const [requested, setRequested] = useState(true);
  const [focused, setFocused] = useState(false);
  const [inView, setInView] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number; pressed: boolean } | null>(null);
  const reduced = useSyncExternalStore(subscribeMotion, () => window.matchMedia(motionQuery).matches, () => true);
  const visible = useSyncExternalStore(subscribeVisibility, () => document.visibilityState === "visible", () => false);
  const playing = enabled && autoplay && requested && inView && visible && !reduced && !focused;

  useEffect(() => {
    if (!enabled || !frame.current) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.intersectionRatio >= .35), { threshold: [0, .35] });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !viewport.current) return;
    const view = viewport.current;
    const active = view.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) return;
    const fit = () => setScale(Math.min(1, (view.clientWidth - 24) / active.offsetWidth, (view.clientHeight - 56) / active.offsetHeight));
    const observer = new ResizeObserver(fit);
    observer.observe(view);
    observer.observe(active);
    return () => observer.disconnect();
  }, [enabled, screen]);

  useEffect(() => {
    if (!playing) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (delay: number, work: () => void) => timers.push(setTimeout(work, delay));
    const panel = () => viewport.current?.querySelector<HTMLElement>('[data-active="true"]');
    const target = () => screen === "posts"
      ? panel()?.querySelector<HTMLElement>('a[href^="/design/business?"]')
      : panel()?.querySelector<HTMLElement>("details > summary");
    later(0, () => {
      setCursor(null);
      viewport.current?.scrollTo({ top: 0, behavior: "instant" });
      panel()?.querySelectorAll("details").forEach(detail => { detail.open = false; });
      if (screen === "posts") setPostIndex(null);
    });
    later(1800, () => {
      const node = target();
      const bounds = frame.current?.getBoundingClientRect();
      if (!node || !bounds) return;
      const rect = node.getBoundingClientRect();
      setCursor({ x: rect.left - bounds.left + rect.width * .62, y: rect.top - bounds.top + rect.height * .5, pressed: false });
    });
    later(3000, () => {
      const node = target();
      if (!node) return;
      setCursor(point => point && { ...point, pressed: true });
      node.click();
      if (screen === "posts") viewport.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
    later(3500, () => {
      if (screen === "posts") { setCursor(null); return; }
      const node = target();
      const bounds = frame.current?.getBoundingClientRect();
      if (!node || !bounds) return;
      const rect = node.getBoundingClientRect();
      setCursor({ x: rect.left - bounds.left + rect.width * .62, y: rect.top - bounds.top + rect.height * .5, pressed: false });
    });
    later(4600, () => setCursor(null));
    later(8500, () => setScreen(screen === "research" ? "plan" : screen === "plan" ? "posts" : screen === "posts" ? "results" : "research"));
    return () => timers.forEach(clearTimeout);
  }, [playing, screen, setScreen, setPostIndex]);

  return { frame, viewport, scale, cursor: playing ? cursor : null, playing, requested, reduced,
    hold: () => setFocused(true), release: () => setFocused(false), pause: () => setRequested(false), toggle: () => setRequested(value => !value) };
}
