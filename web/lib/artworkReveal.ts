import type { AsciiRevealController } from "ascii-reveal/core";

const active = new WeakMap<Element, () => void>();
let sequence = 0;

/** Export the finished artwork, even if its preview is currently resolving. */
export function settleArtworkReveal(node: Element) {
  for (let parent: Element | null = node; parent; parent = parent.parentElement) active.get(parent)?.();
}

/** Optional, media-only enhancement. Original content remains the failure fallback. */
export async function revealArtwork(root: HTMLElement, signal: AbortSignal, selector: string, speed = 1) {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (signal.aborted || motion.matches || document.hidden) return;
  active.get(root)?.();
  const token = String(++sequence);
  let controller: AsciiRevealController | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let mediaTimer: ReturnType<typeof setTimeout> | undefined;
  let discovery: MutationObserver | undefined;
  let finished = false;
  let releaseWaiting: (() => void) | undefined;
  const targets: Element[] = [];
  const finish = () => {
    if (finished) return;
    finished = true;
    controller?.destroy(); controller = undefined;
    clearTimeout(watchdog); clearTimeout(mediaTimer); discovery?.disconnect(); releaseWaiting?.();
    targets.forEach(el => { if (el.getAttribute("data-reveal-media") === token) el.removeAttribute("data-reveal-media"); });
    if (active.get(root) === finish) { active.delete(root); root.dataset.artworkReveal = "complete"; }
  };
  const preference = () => { if (motion.matches) finish(); };
  const visibility = () => { if (document.hidden) finish(); };
  active.set(root, finish);
  signal.addEventListener("abort", finish, { once: true });
  motion.addEventListener("change", preference);
  document.addEventListener("visibilitychange", visibility);
  try {
    const { createAsciiReveal, presets } = await import("ascii-reveal");
    if (finished) return;
    // CardStage mounts its scaled canvas after measuring, so its image may arrive
    // after the result prop. Observe that actual mount instead of consuming an empty reveal.
    if (!root.querySelector(selector)) {
      await new Promise<void>(resolve => {
        releaseWaiting = resolve;
        discovery = new MutationObserver(() => { if (root.querySelector(selector)) resolve(); });
        discovery.observe(root, { childList: true, subtree: true });
        mediaTimer = setTimeout(resolve, 1500);
      });
      discovery?.disconnect(); clearTimeout(mediaTimer);
    }
    if (finished) return;
    const media = Array.from(root.querySelectorAll<HTMLImageElement | HTMLVideoElement>(selector));
    const ready = (el: HTMLImageElement | HTMLVideoElement) => el instanceof HTMLImageElement
      ? el.complete && el.naturalWidth > 0 : el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    await Promise.race([
      Promise.all(media.map(el => ready(el) ? Promise.resolve() : new Promise<void>(resolve => {
        for (const event of ["load", "loadeddata", "error"]) el.addEventListener(event, () => resolve(), { once: true, signal });
      }))),
      new Promise<void>(resolve => { releaseWaiting = resolve; mediaTimer = setTimeout(resolve, 2500); }),
    ]);
    clearTimeout(mediaTimer);
    if (finished || signal.aborted || document.hidden || motion.matches) return;
    // One slow video must not prevent a ready photograph from revealing.
    targets.push(...media.filter(ready));
    if (!targets.length) return;
    targets.forEach(el => el.setAttribute("data-reveal-media", token));
    controller = createAsciiReveal(root, {
      selector: `[data-reveal-media="${token}"]`, preset: { ...presets.dither, color: "accent" },
      duration: "cinematic", speed, origin: "center", lazy: false, fallback: true,
    });
    root.dataset.artworkReveal = "playing";
    watchdog = setTimeout(finish, 2400);
    await controller.reveal();
  } catch {
    // A failed enhancement must never replace a usable preview with an error.
  } finally {
    signal.removeEventListener("abort", finish);
    motion.removeEventListener("change", preference);
    document.removeEventListener("visibilitychange", visibility);
    finish();
  }
}
