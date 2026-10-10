"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ProductScreen } from "./ProductFeatureShowcase";


export const PRODUCT_HOLD_MS = 7000;
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
  setScreen: (screen: ProductScreen) => void, setPostIndex: (index: number | null) => void, autoplay = true, advance = true) {
  const frame = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(.6);
  const [requested, setRequested] = useState(true);
  const [focused, setFocused] = useState(false);
  const [inView, setInView] = useState(false);
  const [wide, updateWide] = useState(true);
  const wideRef = useRef(true);
  const setWide = useCallback((value: boolean) => { wideRef.current = value; updateWide(value); }, []);
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
    const moveCursor = (node: HTMLElement | undefined | null) => {
      const bounds = frame.current?.getBoundingClientRect();
      if (!node || !bounds) return;
      const rect = node.getBoundingClientRect();
      setCursor({
        x: Math.max(20, Math.min(bounds.width - 32, rect.left - bounds.left + rect.width * .62)),
        y: Math.max(8, Math.min(bounds.height - 54, rect.top - bounds.top + rect.height * .5)),
        pressed: false,
      });
    };
    const panel = () => viewport.current?.querySelector<HTMLElement>('[data-active="true"]');
    const target = () => wideRef.current ? frame.current?.querySelector<HTMLElement>(`[data-workspace-target="${screen}"]`) : screen === "posts"
      ? panel()?.querySelector<HTMLElement>('a[href^="/design/business?"]')
      : panel()?.querySelector<HTMLElement>(screen === "campaign" ? "[data-campaign-post]" : "details > summary");
    later(0, () => {
      setWide(advance);
      setCursor(null);
      viewport.current?.scrollTo({ top: 0, behavior: "instant" });
      panel()?.querySelectorAll("details").forEach(detail => { detail.open = false; });
      if (screen === "posts") setPostIndex(null);
    });
    later(advance ? 650 : 1300, () => moveCursor(target()));
    later(advance ? 1250 : 2200, () => {
      const node = target();
      if (!node) return;
      setCursor(point => point && { ...point, pressed: true });
      node.click();
      if (screen === "posts") viewport.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
    if (advance) later(2600, () => {
      const node = screen === "posts" ? panel()?.querySelector<HTMLElement>('a[href^="/design/business?"]') : panel()?.querySelector<HTMLElement>(screen === "campaign" ? "[data-campaign-post]" : "details > summary");
      moveCursor(node);
    });
    if (advance) later(3250, () => {
      const node = screen === "posts" ? panel()?.querySelector<HTMLElement>('a[href^="/design/business?"]') : panel()?.querySelector<HTMLElement>(screen === "campaign" ? "[data-campaign-post]" : "details > summary");
      if (node) { setCursor(point => point && { ...point, pressed: true }); node.click(); }
    });
    later(4200, () => setCursor(null));
    if (!advance && screen === "campaign") {
      later(4700, () => moveCursor(panel()?.querySelector<HTMLElement>("[data-campaign-back]")));
      later(5200, () => {
        setCursor(point => point && { ...point, pressed: true });
        panel()?.querySelector<HTMLElement>("[data-campaign-back]")?.click();
      });
      later(5750, () => setCursor(null));
    }
    if (advance) later(PRODUCT_HOLD_MS, () => setScreen(screen === "research" ? "plan" : screen === "plan" ? "campaign" : screen === "campaign" ? "posts" : screen === "posts" ? "results" : "research"));
    return () => timers.forEach(clearTimeout);
  }, [playing, screen, setScreen, setPostIndex, setWide, advance]);

  return { frame, viewport, scale, wide: playing && wide, setWide, cursor: playing ? cursor : null, playing, requested, reduced,
    hold: () => setFocused(true), release: () => setFocused(false), pause: () => setRequested(false), toggle: () => setRequested(value => !value) };
}
