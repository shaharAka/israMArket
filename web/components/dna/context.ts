/**
 * What every composition is handed: the card's size, the resolved DNA, the post's words
 * and photo, and a few derived measures. Compositions are plain functions of this.
 */

import { contrastRatio } from "@/lib/cardTokens";
import type { CompositionKey, TextPosition } from "@/lib/dna/library";
import { mix, type Crop, type DnaColors, type ResolvedDna } from "@/lib/dna/resolve";
import type { MotifPaint } from "./motifs";

export type CardWords = {
  headline: string;
  kicker: string;
  stat: string;
  cta: string;
  /** A price found in the copy (the amount only), drawn the DNA's way. */
  price: string;
};

export type Ground = "paper" | "tint" | "accent" | "accent2" | "ink" | "photo";

export type CardCtx = {
  W: number;
  /** The height compositions lay out in: the card minus a footer band, when there is one. */
  H: number;
  /** The whole card's height. */
  fullH: number;
  format: "portrait" | "square" | "story";
  composition: CompositionKey;
  dna: ResolvedDna;
  c: DnaColors;
  pad: number;
  /** Extra room a story keeps clear for Instagram's own header and reply bar. */
  safeTop: number;
  safeBottom: number;
  words: CardWords;
  photo: { url?: string; crop: Crop };
  logo?: string;
  name: string;
  textPos: TextPosition;
  displayStack: string;
  textStack: string;
  motif: MotifPaint;
  /** A corner radius in the DNA's shape language. */
  radius: (size: "s" | "m" | "l") => number;
  /** Quiet placeholder (no "התמונה בהכנה" label), for samples and thumbnails. */
  quietPlaceholder: boolean;
};

export type Inks = {
  fg: string;
  soft: string;
  accent: string;
  /** The CTA's fill (pill) and its text. */
  ctaBg: string;
  ctaFg: string;
  bg: string;
};

/** Colours that read on a given ground, all from the DNA. */
export function inksFor(ctx: CardCtx, ground: Ground): Inks {
  const c = ctx.c;
  const pick = (bg: string, ...cands: string[]) => cands.find((x) => contrastRatio(x, bg) >= 3) ?? cands[cands.length - 1];
  switch (ground) {
    case "paper":
      return { bg: c.paper, fg: c.ink, soft: mix(c.ink, c.paper, 0.28), accent: c.accentOnPaper, ctaBg: c.accent, ctaFg: c.onAccent };
    case "tint":
      return {
        bg: c.tint,
        fg: c.ink,
        soft: mix(c.ink, c.tint, 0.28),
        accent: pick(c.tint, c.accent, c.accent2, c.ink),
        ctaBg: contrastRatio(c.accent, c.tint) >= 1.6 ? c.accent : c.ink,
        ctaFg: contrastRatio(c.accent, c.tint) >= 1.6 ? c.onAccent : c.onInk,
      };
    case "accent":
      return {
        bg: c.accent,
        fg: c.onAccent,
        soft: mix(c.onAccent, c.accent, 0.25),
        accent: pick(c.accent, c.accent2, c.onAccent),
        ctaBg: c.onAccent,
        ctaFg: c.accent,
      };
    case "accent2":
      return {
        bg: c.accent2,
        fg: c.onAccent2,
        soft: mix(c.onAccent2, c.accent2, 0.25),
        accent: pick(c.accent2, c.accent, c.onAccent2),
        ctaBg: c.onAccent2,
        ctaFg: c.accent2,
      };
    case "ink":
      return {
        bg: c.ink,
        fg: c.onInk,
        soft: mix(c.onInk, c.ink, 0.3),
        accent: pick(c.ink, c.accent, c.accent2, c.tint),
        ctaBg: contrastRatio(c.accent, c.ink) >= 2 ? c.accent : c.paper,
        ctaFg: contrastRatio(c.accent, c.ink) >= 2 ? c.onAccent : c.ink,
      };
    case "photo":
    default: {
      const scrim = c.scrim;
      const accentReads = contrastRatio(c.accent, scrim) >= 3;
      return {
        bg: scrim,
        fg: c.onPhoto,
        soft: mix(c.onPhoto, scrim, 0.18),
        accent: accentReads ? c.accent : pick(scrim, c.accent2, c.tint, c.onPhoto),
        ctaBg: contrastRatio(c.accent, scrim) >= 1.8 ? c.accent : c.onPhoto,
        ctaFg: contrastRatio(c.accent, scrim) >= 1.8 ? c.onAccent : scrim,
      };
    }
  }
}
