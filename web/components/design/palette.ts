"use client";

import { useSyncExternalStore, type CSSProperties } from "react";
import { designPalettes, type DesignPalette } from "./foundations";

const key = "isramarket-design-palette";
const event = "isramarket-palette-change";
function subscribe(callback: () => void) {
  window.addEventListener(event, callback);
  window.addEventListener("storage", callback);
  return () => { window.removeEventListener(event, callback); window.removeEventListener("storage", callback); };
}
function snapshot() {
  try { return localStorage.getItem(key) || designPalettes[0].id; }
  catch { return designPalettes[0].id; }
}
function serverSnapshot() { return designPalettes[0].id; }

export function useDesignPalette() {
  const id = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const palette = designPalettes.find((item) => item.id === id) || designPalettes[0];
  function choose(id: string) {
    if (!designPalettes.some((item) => item.id === id)) return;
    try { localStorage.setItem(key, id); } catch { return; }
    window.dispatchEvent(new Event(event));
  }
  return { palette, choose };
}

export function paletteVariables(palette: DesignPalette): CSSProperties {
  return {
    "--im-canvas": palette.canvas, "--im-paper": palette.paper, "--im-ink": palette.ink,
    "--im-muted": palette.muted, "--im-primary": palette.primary, "--im-soft": palette.soft,
    "--im-sun": palette.sun, "--im-support": palette.support,
    "--im-rule": `color-mix(in srgb, ${palette.ink} 15%, ${palette.paper})`,
    "--motion-paper": palette.paper, "--motion-accent": palette.sun,
    "--motion-ink": palette.primary, "--motion-halo": palette.soft,
  } as CSSProperties;
}

/** Candidate themes apply to the explicit product demo; business artwork has its own palette. */
export function productPaletteVariables(palette: DesignPalette): CSSProperties {
  return {
    ...paletteVariables(palette),
    "--canvas": palette.canvas, "--paper": palette.paper, "--ink": palette.ink,
    "--ink-soft": palette.muted, "--ink-muted": palette.muted,
    "--primary": palette.primary, "--primary-dark": `color-mix(in srgb, ${palette.primary} 85%, black)`,
    "--primary-soft": palette.soft, "--sun": palette.sun,
    "--sun-edge": `color-mix(in srgb, ${palette.sun} 55%, ${palette.ink})`,
    "--rule": `color-mix(in srgb, ${palette.ink} 15%, ${palette.paper})`,
    "--rule-dark": `color-mix(in srgb, ${palette.ink} 25%, ${palette.paper})`,
    "--sage": palette.primary, "--sage-dark": palette.primary, "--sage-soft": palette.soft,
  } as CSSProperties;
}
