"use client";

import { useSyncExternalStore } from "react";
import { isDemo } from "./api";

function subscribe(changed: () => void) {
  window.addEventListener("storage", changed);
  return () => window.removeEventListener("storage", changed);
}

/**
 * Demo mode for rendering. The flag lives in localStorage, which the server cannot read:
 * calling isDemo() during render (or in a useState initializer) renders different markup
 * on the server and in the browser, and React throws hydration error #418. Here the server
 * and the hydrating render both see `false`; React re-renders with the real flag right after.
 */
export function useIsDemo(): boolean {
  return useSyncExternalStore(subscribe, isDemo, () => false);
}
