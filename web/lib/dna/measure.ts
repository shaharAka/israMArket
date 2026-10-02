"use client";

/**
 * Exact widths for the layout, once a face has loaded: the canvas measures the word in the
 * real font (the same self-hosted file the card is drawn with). Before the face is in, the
 * layout uses the font's measured average letter width (`FontMeta.widthEm`); when a face
 * finishes loading, `useFontEpoch` re-renders the cards, which then re-plan with exact
 * widths. The export waits for `document.fonts.ready`, so a PNG is always planned exactly.
 */

import { useSyncExternalStore } from "react";
import { fontStack } from "./fonts";
import type { FontKey } from "./library";

const cache = new Map<string, number>();
let ctx: CanvasRenderingContext2D | null | undefined;

/** The advance of `text` in em in the loaded face, or null while the face is not loaded. */
export function measuredEm(text: string, key: FontKey, weight: number): number | null {
  if (typeof document === "undefined" || !document.fonts) return null;
  const font = `${weight} 100px ${fontStack(key)}`;
  const hit = cache.get(`${font}|${text}`);
  if (hit !== undefined) return hit;
  try {
    if (!document.fonts.check(font, text)) return null;
    if (ctx === undefined) ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return null;
    ctx.font = font;
    const em = ctx.measureText(text).width / 100;
    cache.set(`${font}|${text}`, em);
    return em;
  } catch {
    return null;
  }
}

/** The number of loaded faces: it changes exactly when a face finishes loading. */
let loaded = 0;
const listeners = new Set<() => void>();
let listening = false;

function recount() {
  let n = 0;
  document.fonts.forEach((f) => {
    if (f.status === "loaded") n += 1;
  });
  if (n !== loaded) {
    loaded = n;
    listeners.forEach((l) => l());
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (typeof document !== "undefined" && document.fonts) {
    if (!listening) {
      listening = true;
      document.fonts.addEventListener("loadingdone", recount);
    }
    // Faces that finished loading before this card subscribed count too.
    void document.fonts.ready.then(recount);
  }
  return () => {
    listeners.delete(fn);
  };
}

/** Changes each time a face finishes loading, so a card re-plans with exact widths. */
export function useFontEpoch(): number {
  return useSyncExternalStore(subscribe, () => loaded, () => 0);
}
