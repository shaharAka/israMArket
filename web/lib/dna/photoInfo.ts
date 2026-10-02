"use client";

/**
 * What the layout needs to know about a photo before it puts words on it: its shape (to map
 * `design.safe_area` from the photo into the crop) and how light it is under the words (to
 * pick the text colour and decide whether a soft shade is needed).
 *
 * The photo is read once per URL into a small luminance grid (a 40-cell-wide canvas). A
 * photo on another host that does not allow reading taints the canvas: its shape is still
 * known, its light is not, and the layout falls back to the DNA's on-photo colour with a
 * soft shade. Until a photo has loaded the layout assumes 4:5, the shape of every photo the
 * service makes.
 */

import { useSyncExternalStore } from "react";
import type { Rect01 } from "./library";

export type PhotoInfo = {
  /** Natural width / height. */
  aspect: number;
  /** Luminance (0–1, relative) per cell, row-major; absent when the photo cannot be read. */
  grid?: { cols: number; rows: number; lum: Float32Array };
};

export type RegionLight = { mean: number; sd: number };

const cache = new Map<string, PhotoInfo | "loading">();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function srgbToLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function readGrid(img: HTMLImageElement): PhotoInfo["grid"] {
  const cols = 40;
  const rows = Math.max(1, Math.round(cols * (img.naturalHeight / img.naturalWidth)));
  try {
    const canvas = document.createElement("canvas");
    canvas.width = cols;
    canvas.height = rows;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (!g) return undefined;
    g.drawImage(img, 0, 0, cols, rows);
    const data = g.getImageData(0, 0, cols, rows).data;
    const lum = new Float32Array(cols * rows);
    for (let i = 0; i < cols * rows; i += 1) {
      const r = srgbToLinear(data[i * 4]);
      const gg = srgbToLinear(data[i * 4 + 1]);
      const b = srgbToLinear(data[i * 4 + 2]);
      lum[i] = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    }
    return { cols, rows, lum };
  } catch {
    // A cross-origin photo without CORS taints the canvas: shape only.
    return undefined;
  }
}

function load(url: string) {
  if (typeof window === "undefined" || cache.has(url)) return;
  cache.set(url, "loading");
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    const aspect = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0.8;
    cache.set(url, { aspect, grid: readGrid(img) });
    emit();
  };
  img.onerror = () => {
    cache.set(url, { aspect: 0.8 });
    emit();
  };
  img.src = url;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The photo's shape and light, once it has loaded (undefined before, and on the server). */
export function usePhotoInfo(url?: string): PhotoInfo | undefined {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!url) return undefined;
      const hit = cache.get(url);
      if (!hit) {
        // Starting a load from a snapshot read is safe: it only schedules work and emits later.
        load(url);
        return undefined;
      }
      return hit === "loading" ? undefined : hit;
    },
    () => undefined,
  );
}

/** Mean and spread of the luminance over a region (0–1 of the photo), or null if unknown. */
export function regionLight(info: PhotoInfo | undefined, r: Rect01): RegionLight | null {
  const grid = info?.grid;
  if (!grid) return null;
  const x0 = Math.max(0, Math.floor(r.x * grid.cols));
  const x1 = Math.min(grid.cols, Math.ceil((r.x + r.w) * grid.cols));
  const y0 = Math.max(0, Math.floor(r.y * grid.rows));
  const y1 = Math.min(grid.rows, Math.ceil((r.y + r.h) * grid.rows));
  let n = 0;
  let sum = 0;
  let sq = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const v = grid.lum[y * grid.cols + x];
      sum += v;
      sq += v * v;
      n += 1;
    }
  }
  if (!n) return null;
  const mean = sum / n;
  return { mean, sd: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
}
