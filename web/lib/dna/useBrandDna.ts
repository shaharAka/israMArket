"use client";

/**
 * The business's Design DNA, loaded once per session and shared by every screen that draws
 * a post (the editor, its thumbnails, the brand page). A save on the brand page updates it
 * in place; `isramarket-brand-change` (fired after any brand save) reloads it.
 *
 * `null` means "no DNA yet" (the renderer then uses its neutral default), which is also
 * what an older server without `/brand/dna` answers.
 */

import { useSyncExternalStore } from "react";
import { endpoints } from "@/lib/api";
import type { BrandDna } from "./library";

type State = { dna: BrandDna | null; loaded: boolean };

const SERVER: State = { dna: null, loaded: false };
let state: State = SERVER;
let inflight = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

function load() {
  if (inflight) return;
  inflight = true;
  endpoints
    .brandDna()
    .then((res) => {
      state = { dna: res.brand_dna ?? null, loaded: true };
    })
    .catch(() => {
      state = { dna: null, loaded: true };
    })
    .finally(() => {
      inflight = false;
      emit();
    });
}

let listening = false;
function subscribeLoading(fn: () => void) {
  listeners.add(fn);
  if (!state.loaded) load();
  if (!listening && typeof window !== "undefined") {
    listening = true;
    window.addEventListener("isramarket-brand-change", () => load());
  }
  return () => {
    listeners.delete(fn);
  };
}

/** Listens without asking: for a screen that already has the DNA (the month carries it). */
function subscribePassive(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * `skip`: the caller already has the DNA (e.g. from `strategy.brand_dna`), so no request
 * is made — the first `GET /brand/dna` can take seconds while the server builds it.
 */
export function useBrandDna({ skip = false }: { skip?: boolean } = {}): State {
  return useSyncExternalStore(skip ? subscribePassive : subscribeLoading, () => state, () => SERVER);
}

/** After a save: every open screen redraws with the saved DNA at once. */
export function setBrandDna(dna: BrandDna | null) {
  state = { dna, loaded: true };
  emit();
}
