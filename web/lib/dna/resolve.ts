/**
 * From a stored `brand_dna` (or none) to the values the renderer paints with.
 *
 * Everything here is forgiving on purpose: a DNA from an older server, a hand edit with a
 * key the renderer does not know, or no DNA at all must still draw a coherent post. Unknown
 * keys fall back to known ones, colours are repaired for contrast, and a post without a
 * DNA gets a neutral default built from the old palette (`cardTokens`).
 */

import type { BrandLanguage, RoadmapPost } from "@/lib/api";
import { cardTokens, contrastRatio, normalizeHex, readableOn, relativeLuminance } from "@/lib/cardTokens";
import {
  COMPOSITION_KEYS,
  COMPOSITION_LIBRARY,
  FONT_LIBRARY,
  compositionDrawsPhoto,
  isColorRole,
  isCompositionKey,
  isCtaStyle,
  isFontKey,
  isHeadlineCase,
  isMotifKey,
  isPriceStyle,
  isSignatureKey,
  isTextPosition,
  isTypeScale,
  type BrandDna,
  type ColorRole,
  type CompositionKey,
  type CtaStyle,
  type FontKey,
  type FontMeta,
  type HeadlineCase,
  type MotifDensity,
  type MotifKey,
  type PhotoCrop,
  type PriceStyle,
  type SignatureKey,
  type TextPosition,
  type TypeScale,
} from "./library";

/* ------------------------------------------------------------------ */
/* Colour helpers                                                      */
/* ------------------------------------------------------------------ */

function rgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? "#000000";
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function toHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** `a` moved toward `b` by `t` (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export function isLight(hex: string): boolean {
  return relativeLuminance(hex) > 0.42;
}

/** Of the candidates, the one that reads best on `bg` (first wins a tie). */
function bestOn(bg: string, ...candidates: string[]): string {
  let best = candidates[0];
  let score = -1;
  for (const c of candidates) {
    const r = contrastRatio(c, bg);
    if (r > score + 0.01) {
      best = c;
      score = r;
    }
  }
  return best;
}

/**
 * `fg` itself when it already reads on `bg` at `min`, otherwise `fg` pushed toward
 * `toward` until it does — the brand colour stays recognisable instead of turning black.
 */
function ensureContrast(fg: string, bg: string, toward: string, min: number): string {
  if (contrastRatio(fg, bg) >= min) return fg;
  for (let t = 0.15; t <= 1; t += 0.15) {
    const next = mix(fg, toward, t);
    if (contrastRatio(next, bg) >= min) return next;
  }
  return toward;
}

/* ------------------------------------------------------------------ */
/* Resolved DNA                                                        */
/* ------------------------------------------------------------------ */

export type ResolvedFont = { key: FontKey; meta: FontMeta; weight: number };

export type DnaColors = {
  ink: string;
  paper: string;
  accent: string;
  accent2: string;
  onPhoto: string;
  tint: string;
  /** Text on an accent fill: the DNA's own ink or paper, whichever reads. */
  onAccent: string;
  onAccent2: string;
  /** Text on an ink fill. */
  onInk: string;
  /** The accent when it is used as text or a fine line on paper (contrast-repaired). */
  accentOnPaper: string;
  /** What photo scrims are built from: dark when the on-photo text is light, and vice versa. */
  scrim: string;
  /** The motif's colour on paper. */
  motif: string;
};

export type DnaShape = "round" | "soft" | "sharp";

export type ResolvedDna = {
  /** True for the neutral default built when the business has no DNA yet. */
  isDefault: boolean;
  seed: number;
  display: ResolvedFont;
  text: ResolvedFont;
  headlineCase: HeadlineCase;
  scale: TypeScale;
  colors: DnaColors;
  compositions: CompositionKey[];
  motif: { kind: MotifKey; color: ColorRole; density: MotifDensity };
  signature: { kind: SignatureKey; useLogo: boolean; logoUrl?: string };
  copy: { price: PriceStyle; cta: CtaStyle };
  /** Corner language, from the type personality: rounded faces get soft corners. */
  shape: DnaShape;
  rationale: string;
};

function nearestWeight(meta: FontMeta, wanted: number | undefined, fallback: number): number {
  const w = typeof wanted === "number" && Number.isFinite(wanted) ? wanted : fallback;
  if (meta.variable) {
    const lo = Math.min(...meta.weights);
    const hi = Math.max(...meta.weights);
    return Math.max(lo, Math.min(hi, Math.round(w / 50) * 50));
  }
  return meta.weights.reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) ? x : best), meta.weights[0]);
}

function font(key: string | undefined, fallback: FontKey, role: "display" | "text", weight?: number): ResolvedFont {
  let k: FontKey = isFontKey(key) ? key : fallback;
  if (!FONT_LIBRARY[k].roles.includes(role)) k = fallback;
  const meta = FONT_LIBRARY[k];
  return { key: k, meta, weight: nearestWeight(meta, weight, role === "display" ? 700 : 400) };
}

function shapeOf(display: FontMeta, motif: MotifKey): DnaShape {
  if (display.category === "rounded" || display.category === "hand") return "round";
  if (motif === "scalloped_edge" || motif === "arches") return "round";
  if (display.category === "serif" || display.key === "karantina") return "sharp";
  return "soft";
}

/** A stable small hash, so the same post always lands on the same composition. */
export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The neutral default for a business with no DNA yet: its old palette, Heebo, and the
 * compositions the six fixed layouts used to draw. Plain on purpose (no motif to speak
 * of, a corner mark) — the DNA is what gives a business its character.
 */
export function defaultDna(brand?: BrandLanguage | null): BrandDna {
  const t = cardTokens(brand);
  return {
    version: 1,
    type: { display: "heebo", display_weight: 800, text: "heebo", text_weight: 400, headline_case: "sentence", scale: "large" },
    colors: {
      ink: t.ink,
      paper: t.background,
      accent: t.primary,
      accent_2: t.accent,
      on_photo: "#ffffff",
      tint: mix(t.background, t.primary, 0.1),
    },
    compositions: ["full_bleed", "split", "inset_frame", "type_led"],
    motif: { kind: "grain", color: "ink", density: "low" },
    signature: { kind: "corner_mark", use_logo: true },
    copy: { price_style: "inline", cta_style: "pill" },
    rationale_he: "",
  };
}

export function resolveDna(dna?: BrandDna | null, brand?: BrandLanguage | null): ResolvedDna {
  const isDefault = !dna;
  const src = dna ?? defaultDna(brand);
  const fallback = cardTokens(brand);

  let ink = normalizeHex(src.colors?.ink) ?? fallback.ink;
  const paper = normalizeHex(src.colors?.paper) ?? fallback.background;
  // A DNA may legitimately pair a dark paper with a light ink. Only an unreadable pair is
  // repaired, never a deliberate dark one.
  if (contrastRatio(ink, paper) < 4.5) {
    const repaired = readableOn(paper);
    ink = contrastRatio(ink, paper) < 3 ? repaired : ensureContrast(ink, paper, repaired, 4.5);
  }
  const accent = normalizeHex(src.colors?.accent) ?? fallback.primary;
  const accent2 = normalizeHex(src.colors?.accent_2) ?? mix(accent, ink, 0.45);
  const tint = normalizeHex(src.colors?.tint) ?? mix(paper, accent, 0.14);
  const onPhoto = normalizeHex(src.colors?.on_photo) ?? (isLight(paper) ? paper : "#ffffff");

  const motifKind: MotifKey = isMotifKey(src.motif?.kind) ? src.motif.kind : "grain";
  const motifRole: ColorRole = isColorRole(src.motif?.color) ? src.motif.color : "accent";
  const roleHex: Record<ColorRole, string> = {
    ink,
    paper,
    accent,
    accent_2: accent2,
    on_photo: onPhoto,
    tint,
  };
  let motifColor = roleHex[motifRole];
  // A motif drawn in the paper colour on paper would vanish; the accent stands in.
  if (contrastRatio(motifColor, paper) < 1.25) motifColor = accent;

  const display = font(src.type?.display, "heebo", "display", src.type?.display_weight);
  const text = font(src.type?.text, "assistant", "text", src.type?.text_weight);

  const compositions = (src.compositions ?? []).filter(isCompositionKey);
  const sig = src.signature ?? { kind: "corner_mark" };

  return {
    isDefault,
    seed: typeof src.seed === "number" ? src.seed : hashString(`${ink}${paper}${accent}${display.key}`),
    display,
    text,
    headlineCase: isHeadlineCase(src.type?.headline_case) ? src.type.headline_case : "sentence",
    scale: isTypeScale(src.type?.scale) ? src.type.scale : "large",
    colors: {
      ink,
      paper,
      accent,
      accent2,
      onPhoto,
      tint,
      onAccent: bestOn(accent, paper, ink, "#ffffff"),
      onAccent2: bestOn(accent2, paper, ink, "#ffffff"),
      onInk: bestOn(ink, paper, "#ffffff"),
      accentOnPaper: ensureContrast(accent, paper, ink, 3),
      scrim: isLight(onPhoto) ? mix(ink, "#000000", 0.35) : mix(paper, "#ffffff", 0.2),
      motif: motifColor,
    },
    compositions: compositions.length ? compositions : ["full_bleed", "split", "inset_frame"],
    motif: { kind: motifKind, color: motifRole, density: src.motif?.density === "mid" ? "mid" : "low" },
    signature: {
      kind: isSignatureKey(sig.kind) ? sig.kind : "corner_mark",
      useLogo: sig.use_logo !== false,
      logoUrl: typeof sig.logo_url === "string" && sig.logo_url ? sig.logo_url : undefined,
    },
    copy: {
      price: isPriceStyle(src.copy?.price_style) ? src.copy.price_style : "inline",
      cta: isCtaStyle(src.copy?.cta_style) ? src.copy.cta_style : "underline",
    },
    shape: shapeOf(display.meta, motifKind),
    rationale: (src.rationale_he || "").trim(),
  };
}

/* ------------------------------------------------------------------ */
/* A post's design                                                     */
/* ------------------------------------------------------------------ */

/** Old `overlay_theme` values → the nearest composition (and the text position it implied). */
const LEGACY: Record<string, { composition: CompositionKey; textPosition?: TextPosition }> = {
  lower_editorial: { composition: "full_bleed" },
  ink_pill: { composition: "full_bleed" },
  cover_type: { composition: "full_bleed", textPosition: "top" },
  minimal_text: { composition: "full_bleed", textPosition: "top" },
  split_panel: { composition: "split" },
  frosted_glass: { composition: "split" },
  framed_inset: { composition: "inset_frame" },
  paper_badge: { composition: "inset_frame" },
  promo_ribbon: { composition: "stacked_bands", textPosition: "top" },
  accent_banner: { composition: "stacked_bands", textPosition: "top" },
  type_hero: { composition: "type_led", textPosition: "center" },
};

/** The composition a post is drawn with. */
export function resolveComposition(
  post: Pick<RoadmapPost, "design" | "overlay_theme" | "uid" | "title" | "overlay_headline" | "image_url">,
  dna: ResolvedDna,
): CompositionKey {
  const chosen = post.design?.composition;
  if (isCompositionKey(chosen)) return chosen;
  const theme = post.overlay_theme || "";
  // A post designed photo-free stays photo-free: it was written without a picture.
  if (theme === "type_hero") return "type_led";
  const legacy = LEGACY[theme]?.composition;
  if (dna.isDefault) return legacy ?? "full_bleed";
  // With a DNA, posts rotate through its own set, so the grid looks designed rather than
  // repeated. A post with a photo never lands on the typographic composition by chance.
  const pool = dna.compositions.filter((key) => compositionDrawsPhoto(key) || !post.image_url);
  if (legacy && pool.includes(legacy)) return legacy;
  const list = pool.length ? pool : dna.compositions;
  const basis = post.uid || post.title || post.overlay_headline || "";
  return list[hashString(basis) % list.length];
}

export function resolveTextPosition(
  post: Pick<RoadmapPost, "design" | "overlay_theme">,
  composition: CompositionKey,
): TextPosition {
  // Each composition has its own positions (the library's list; the first is the default).
  // A position it does not take falls back to its default rather than a broken layout.
  const allowed = COMPOSITION_LIBRARY[composition].text_positions;
  const raw = post.design?.text_position;
  const wanted = raw === "middle" ? "center" : raw;
  if (isTextPosition(wanted) && allowed.includes(wanted)) return wanted;
  const legacy = LEGACY[post.overlay_theme || ""];
  if (legacy?.composition === composition && legacy.textPosition && allowed.includes(legacy.textPosition)) return legacy.textPosition;
  return allowed[0];
}

export type Crop = { x: number; y: number; zoom: number };

const CROP_WORDS: Record<string, Crop> = {
  center: { x: 0.5, y: 0.5, zoom: 1 },
  top: { x: 0.5, y: 0.25, zoom: 1 },
  bottom: { x: 0.5, y: 0.78, zoom: 1 },
  // RTL: the start side is the right.
  start: { x: 0.72, y: 0.5, zoom: 1 },
  end: { x: 0.28, y: 0.5, zoom: 1 },
  right: { x: 0.72, y: 0.5, zoom: 1 },
  left: { x: 0.28, y: 0.5, zoom: 1 },
  close: { x: 0.5, y: 0.5, zoom: 1.35 },
  detail: { x: 0.5, y: 0.55, zoom: 1.7 },
};

export function resolveCrop(crop?: PhotoCrop): Crop {
  if (!crop) return CROP_WORDS.center;
  if (typeof crop === "string") return CROP_WORDS[crop] ?? CROP_WORDS.center;
  const clamp = (v: unknown, lo: number, hi: number, d: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
  return { x: clamp(crop.x, 0, 1, 0.5), y: clamp(crop.y, 0, 1, 0.5), zoom: clamp(crop.zoom, 1, 3, 1) };
}

/**
 * The three compositions of the DNA to offer for one post, in the DNA's own order so a
 * choice never reshuffles the row. The post's current composition is always among them.
 */
export function offeredCompositions(dna: ResolvedDna, current: CompositionKey): CompositionKey[] {
  const list = dna.compositions.slice(0, 3);
  if (!list.includes(current)) list.splice(Math.min(list.length, 2), 1, current);
  for (const key of COMPOSITION_KEYS) {
    if (list.length >= 3) break;
    if (!list.includes(key)) list.push(key);
  }
  return list;
}
