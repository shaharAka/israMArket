/**
 * Card design tokens.
 *
 * The brand palette is already extracted from the customer's website with semantic
 * roles (primary / accent / background / ink / secondary). Historically it was used
 * only for the AI image prompt and thrown away at render time, so every card came out
 * in the same charcoal-and-cream chrome. This module turns that palette into the
 * colours the card actually paints with, and guarantees readable text on every fill
 * using real WCAG contrast math instead of hand-picked hex values.
 */

import type { BrandLanguage, BrandSwatch } from "@/lib/api";

export type CardTokens = {
  /** Headline / body text on `background` panels. */
  ink: string;
  /** Panel and card ground. */
  background: string;
  /** Brand's dominant colour. */
  primary: string;
  /** Highlight colour for badges and ribbons. */
  accent: string;
  /** Supporting brand colour. */
  secondary: string;
  /** Guaranteed-readable text on `primary`. */
  onPrimary: string;
  /** Guaranteed-readable text on `accent`. */
  onAccent: string;
  /** Guaranteed-readable text on `background`. */
  onBackground: string;
  /** Text drawn over a photo scrim. */
  onPhoto: string;
  /** Base colour the photo scrims are built from. */
  scrim: string;
};

const DARK_TEXT = "#12100e";
const LIGHT_TEXT = "#ffffff";

function toRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? "#000000";
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

/** Expand `#abc` to `#aabbcc`, validate, and lowercase. Returns null when unparseable. */
export function normalizeHex(input: string | undefined | null): string | null {
  if (!input) return null;
  let h = input.trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return `#${h.toLowerCase()}`;
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Whichever of near-black / white reads better on `bg`. */
export function readableOn(bg: string): string {
  return contrastRatio(DARK_TEXT, bg) >= contrastRatio(LIGHT_TEXT, bg) ? DARK_TEXT : LIGHT_TEXT;
}

/** rgba() string from a hex colour. */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Saturation 0–1, used to guess an accent when the brand didn't label one. */
function saturation(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => v / 255) as [number, number, number];
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
}

function swatches(brand?: BrandLanguage | null): { hex: string; role: string }[] {
  return ((brand?.palette ?? []) as BrandSwatch[])
    .map((s) => ({ hex: normalizeHex(s.hex) ?? "", role: s.role }))
    .filter((s) => s.hex.length === 7);
}

function roleHex(list: { hex: string; role: string }[], role: string): string | null {
  return list.find((s) => s.role === role)?.hex ?? null;
}

/**
 * Derive card tokens from a brand language payload.
 *
 * Every value falls back through a chain so a partial or sloppy palette still yields
 * a coherent card: explicit role → most extreme colour by luminance → most saturated
 * → a neutral. Contrast is then repaired if the brand's own palette would be unreadable.
 */
export function cardTokens(brand?: BrandLanguage | null): CardTokens {
  const list = swatches(brand);
  const sorted = [...list].sort((a, b) => relativeLuminance(a.hex) - relativeLuminance(b.hex));
  const darkest = sorted[0]?.hex ?? null;
  const lightest = sorted[sorted.length - 1]?.hex ?? null;
  const vivid =
    [...list].sort((a, b) => saturation(b.hex) - saturation(a.hex))[0]?.hex ?? null;

  let ink = roleHex(list, "ink") ?? darkest ?? "#1a1512";
  let background = roleHex(list, "background") ?? lightest ?? "#f6f2ea";
  const primary = roleHex(list, "primary") ?? vivid ?? ink;
  const accent = roleHex(list, "accent") ?? vivid ?? primary;
  const secondary = roleHex(list, "secondary") ?? vivid ?? primary;

  // A palette can legitimately hand back a dark "background" and light "ink".
  // Repair that rather than shipping unreadable text.
  if (contrastRatio(ink, background) < 4.5) {
    if (darkest && lightest && contrastRatio(darkest, lightest) >= 4.5) {
      ink = darkest;
      background = lightest;
    } else {
      ink = DARK_TEXT;
      background = "#f6f2ea";
    }
  }

  return {
    ink,
    background,
    primary,
    accent,
    secondary,
    onPrimary: readableOn(primary),
    onAccent: readableOn(accent),
    onBackground: readableOn(background),
    onPhoto: "#ffffff",
    scrim: ink,
  };
}
