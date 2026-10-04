/**
 * From a stored `brand_dna` (or none) to the values the renderer paints with.
 *
 * Everything here is forgiving on purpose: a v1 DNA, a hand edit with a key the renderer
 * does not know, or no DNA at all must still draw a coherent post. Unknown keys fall back to
 * known ones, v1 keys map to their v2 form (`LEGACY_*` in library.ts), colours are repaired
 * for contrast, and a post without a DNA gets a neutral default built from the old palette.
 *
 * A v1 DNA reads as: motif none (two v1 motifs keep a quiet form), the signature from
 * `use_logo`, the default mix, and no safe area on its posts.
 */

import type { BrandLanguage, RoadmapPost } from "@/lib/api";
import { cardTokens, contrastRatio, normalizeHex, readableOn, relativeLuminance } from "@/lib/cardTokens";
import {
  COMPOSITION_LIBRARY,
  FONT_LIBRARY,
  LEGACY_MOTIFS,
  compositionDrawsPhoto,
  compositionKeyOf,
  isColorRole,
  isFontKey,
  isHeadlineCase,
  isLogoGround,
  isMotifKey,
  isMotifSource,
  isPriceStyle,
  isSignatureKey,
  isTextMode,
  isTextPosition,
  isTypeScale,
  type BrandDna,
  type ColorRole,
  type CompositionKey,
  type FontKey,
  type FontMeta,
  type HeadlineCase,
  type LogoGround,
  type MotifDensity,
  type MotifKey,
  type MotifSource,
  type PhotoCrop,
  type Point01,
  type PriceStyle,
  type Rect01,
  type SignatureKey,
  type TextMode,
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

/** `rgba()` of a hex colour. */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

export function isLight(hex: string): boolean {
  return relativeLuminance(hex) > 0.42;
}

/** Contrast between a colour and a ground given only by its relative luminance. */
export function contrastOnLuminance(hex: string, lum: number): number {
  const l = relativeLuminance(hex);
  const [hi, lo] = l > lum ? [l, lum] : [lum, l];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Whether a colour has a hue of its own. A neutral grey (often a site's border or panel
 * colour) reads as an app panel, not as the brand, so it never becomes a band's ground.
 */
function chromatic(hex: string): boolean {
  const [r, g, b] = rgb(hex);
  return Math.max(r, g, b) - Math.min(r, g, b) > 14;
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
export function ensureContrast(fg: string, bg: string, toward: string, min: number): string {
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
  /** The accent when it is used as text on paper (contrast-repaired). */
  accentOnPaper: string;
  /** What soft scrims behind light text are built from (a deep shade of the ink). */
  shade: string;
  /** The motif's colour on paper. */
  motif: string;
};

export type DnaShape = "round" | "soft" | "sharp";

/** The ground a band or a type-led post is set on. */
export type BandGround = "paper" | "tint" | "accent" | "ink";

export type ResolvedDirection = { feel: string; world: string; photo: string; text: string; never: string[] };

export type ResolvedDna = {
  /** True for the neutral default built when the business has no DNA yet. */
  isDefault: boolean;
  version: number;
  seed: number;
  display: ResolvedFont;
  text: ResolvedFont;
  headlineCase: HeadlineCase;
  scale: TypeScale;
  colors: DnaColors;
  compositions: CompositionKey[];
  motif: { kind: MotifKey; from?: MotifSource; color: ColorRole; density: MotifDensity };
  signature: { kind: SignatureKey; useLogo: boolean; logoUrl?: string; logoOn: LogoGround; logoColors: string[] };
  /** Share of posts per text mode, normalised to 1. */
  mix: Record<TextMode, number>;
  copy: { accent: boolean; price: PriceStyle; subAbove: boolean };
  /** Corner language, from the type personality: rounded faces get soft corners. */
  shape: DnaShape;
  /** Text alignment, from the type personality: hand and rounded faces centre. */
  align: "start" | "center";
  /** Where bands and type-led posts are set. */
  ground: BandGround;
  direction: ResolvedDirection;
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

function shapeOf(display: FontMeta): DnaShape {
  if (display.category === "rounded" || display.category === "hand") return "round";
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

export const DEFAULT_MIX: Record<TextMode, number> = { photo_only: 0.5, headline: 0.4, type_led: 0.1 };

function mixOf(raw: BrandDna["mix"]): Record<TextMode, number> {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_MIX };
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  const out = { photo_only: n(raw.photo_only), headline: n(raw.headline), type_led: n(raw.type_led) };
  const total = out.photo_only + out.headline + out.type_led;
  if (total <= 0) return { ...DEFAULT_MIX };
  return { photo_only: out.photo_only / total, headline: out.headline / total, type_led: out.type_led / total };
}

/**
 * The neutral default for a business with no DNA yet: its old palette, Heebo, and the
 * compositions the six fixed layouts used to draw. Plain on purpose — the DNA is what gives
 * a business its character.
 */
export function defaultDna(brand?: BrandLanguage | null): BrandDna {
  const t = cardTokens(brand);
  return {
    version: 2,
    type: { display: "heebo", display_weight: 700, text: "heebo", text_weight: 400, headline_case: "sentence", scale: "large" },
    colors: { ink: t.ink, paper: t.background, accent: t.primary, accent_2: t.accent, on_photo: "#ffffff", tint: mix(t.background, t.primary, 0.1) },
    compositions: ["full_bleed", "split", "inset_frame", "type_led"],
    motif: { kind: "none" },
    signature: { kind: "corner_mark", use_logo: true, logo_on: "light" },
    mix: { ...DEFAULT_MIX },
    copy: { headline_accent: false, price_style: "inline", cta_on_image: false },
  };
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
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

  // A v1 DNA's motif came from a list, not from the brand: none. A v2 motif other than none
  // must say what in the brand it comes from (`from`), and is drawn in its quiet form.
  const rawMotif = src.motif?.kind;
  const isV2 = (typeof src.version === "number" ? src.version : 1) >= 2;
  let motifKind: MotifKey = isMotifKey(rawMotif) ? rawMotif : typeof rawMotif === "string" && rawMotif in LEGACY_MOTIFS ? LEGACY_MOTIFS[rawMotif] : "none";
  if (!isV2 || (motifKind !== "none" && !isMotifSource(src.motif?.from))) motifKind = "none";
  const motifRole: ColorRole = isColorRole(src.motif?.color) ? src.motif.color : "ink";
  const roleHex: Record<ColorRole, string> = { ink, paper, accent, accent_2: accent2, on_photo: onPhoto, tint };
  let motifColor = roleHex[motifRole];
  // A motif drawn in the paper colour on paper would vanish; the ink stands in.
  if (contrastRatio(motifColor, paper) < 1.25) motifColor = ink;

  const display = font(src.type?.display, "heebo", "display", src.type?.display_weight);
  const textFont = font(src.type?.text, "assistant", "text", src.type?.text_weight);
  const scale: TypeScale = isTypeScale(src.type?.scale) ? src.type.scale : "large";

  const compositions: CompositionKey[] = [];
  for (const key of src.compositions ?? []) {
    const k = compositionKeyOf(key);
    if (k && !compositions.includes(k)) compositions.push(k);
  }
  if (!compositions.some((k) => compositionDrawsPhoto(k))) compositions.unshift("full_bleed", "split");

  // v1 signatures: a stamp or a tab becomes a small corner mark (the name, without a logo).
  const sig = src.signature ?? { kind: "corner_mark" };
  const sigKind: SignatureKey = isSignatureKey(sig.kind) ? sig.kind : "corner_mark";
  const logoUrl = typeof sig.logo_url === "string" && sig.logo_url ? sig.logo_url : undefined;

  const colors: DnaColors = {
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
    shade: mix(isLight(ink) ? "#000000" : ink, "#000000", 0.45),
    motif: motifColor,
  };

  // Bands and type-led posts: a quiet DNA stays on its paper, a bold one sets them in its
  // own accent when the accent can carry text.
  const ground: BandGround =
    scale === "large" && contrastRatio(colors.onAccent, accent) >= 4.5
      ? "accent"
      : scale === "medium" && chromatic(tint) && contrastRatio(ink, tint) >= 4.5 && contrastRatio(tint, paper) > 1.06
        ? "tint"
        : "paper";

  const rawCase = src.type?.headline_case;
  const dir = src.direction ?? {};
  const rationale = text(src.rationale_he);
  const priceRaw = src.copy?.price_style;
  return {
    isDefault,
    version: typeof src.version === "number" ? src.version : 1,
    seed: typeof src.seed === "number" ? src.seed : hashString(`${ink}${paper}${accent}${display.key}`),
    display,
    text: textFont,
    headlineCase: isHeadlineCase(rawCase) ? rawCase : "sentence",
    scale,
    colors,
    compositions,
    motif: {
      kind: motifKind,
      from: isMotifSource(src.motif?.from) ? src.motif.from : undefined,
      color: motifRole,
      density: src.motif?.density === "mid" ? "mid" : "low",
    },
    signature: {
      kind: sigKind,
      useLogo: sig.use_logo !== false,
      logoUrl,
      logoOn: isLogoGround(sig.logo_on) ? sig.logo_on : "light",
      logoColors: Array.isArray(sig.logo_colors) ? (sig.logo_colors.map((x) => normalizeHex(x)).filter(Boolean) as string[]) : [],
    },
    mix: mixOf(src.mix),
    copy: {
      // v1's renderer extension `headline_case: "accent"` is the v2 `headline_accent`.
      accent: src.copy?.headline_accent === true || rawCase === "accent",
      price: isPriceStyle(priceRaw) ? priceRaw : "inline",
      subAbove: src.copy?.sub_above === true,
    },
    shape: shapeOf(display.meta),
    align: display.meta.category === "hand" || display.meta.category === "rounded" ? "center" : "start",
    ground,
    direction: {
      feel: text(dir.feel_he) || rationale,
      world: text(dir.world_he),
      photo: text(dir.photo_he),
      text: text(dir.text_he),
      never: Array.isArray(dir.never_he) ? dir.never_he.map(text).filter(Boolean) : [],
    },
  };
}

/* ------------------------------------------------------------------ */
/* A post's design                                                     */
/* ------------------------------------------------------------------ */

/** Old `overlay_theme` values → the nearest composition (and the text position it implied). */
const LEGACY_THEMES: Record<string, { composition: CompositionKey; textPosition?: TextPosition }> = {
  lower_editorial: { composition: "full_bleed" },
  ink_pill: { composition: "full_bleed" },
  cover_type: { composition: "full_bleed", textPosition: "top" },
  minimal_text: { composition: "full_bleed", textPosition: "top" },
  split_panel: { composition: "split" },
  frosted_glass: { composition: "split" },
  framed_inset: { composition: "inset_frame" },
  paper_badge: { composition: "inset_frame" },
  promo_ribbon: { composition: "split", textPosition: "top" },
  accent_banner: { composition: "split", textPosition: "top" },
  type_hero: { composition: "type_led", textPosition: "center" },
};

type DesignPost = Pick<RoadmapPost, "design" | "overlay_theme" | "uid" | "title" | "overlay_headline" | "overlay_text" | "image_url" | "has_overlay">;

/** The photo composition a post with a headline is drawn with. */
function photoComposition(post: DesignPost, dna: ResolvedDna): CompositionKey {
  const chosen = compositionKeyOf(post.design?.composition);
  if (chosen && compositionDrawsPhoto(chosen)) return chosen;
  const legacy = LEGACY_THEMES[post.overlay_theme || ""]?.composition;
  const pool = dna.compositions.filter((k) => compositionDrawsPhoto(k));
  if (legacy && compositionDrawsPhoto(legacy) && (dna.isDefault || pool.includes(legacy))) return legacy;
  if (dna.isDefault) return legacy && compositionDrawsPhoto(legacy) ? legacy : "full_bleed";
  // With a DNA, posts rotate through its own photo compositions, so the grid looks designed
  // rather than repeated.
  const list = pool.length ? pool : (["full_bleed"] as CompositionKey[]);
  const basis = post.uid || post.title || post.overlay_headline || "";
  return list[hashString(basis) % list.length];
}

function clamp01(v: unknown, d: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d;
}

/** A usable safe area (inside the photo, not a sliver), or null. */
export function safeAreaOf(raw: unknown): Rect01 | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Rect01>;
  const x = clamp01(r.x, NaN);
  const y = clamp01(r.y, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const w = Math.min(1 - x, clamp01(r.w, 0));
  const h = Math.min(1 - y, clamp01(r.h, 0));
  if (w < 0.08 || h < 0.05) return null;
  return { x, y, w, h };
}

const CROP_WORDS: Record<string, Point01 & { zoom: number }> = {
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

/** The photo's focal point and zoom: `design.focal` first, then v1's crop. */
export function focalOf(design: RoadmapPost["design"]): Point01 & { zoom: number } {
  const crop: PhotoCrop | undefined = design?.crop;
  let base: Point01 & { zoom: number } = CROP_WORDS.center;
  if (typeof crop === "string") base = CROP_WORDS[crop] ?? CROP_WORDS.center;
  else if (crop && typeof crop === "object") {
    base = { x: clamp01(crop.x, 0.5), y: clamp01(crop.y, 0.5), zoom: typeof crop.zoom === "number" && Number.isFinite(crop.zoom) ? Math.max(1, Math.min(3, crop.zoom)) : 1 };
  }
  const f = design?.focal;
  if (f && typeof f === "object") return { x: clamp01(f.x, base.x), y: clamp01(f.y, base.y), zoom: base.zoom };
  return base;
}

export type ResolvedDesign = {
  mode: TextMode;
  /** The composition asked for (the layout may still move a headline to a band). */
  composition: CompositionKey;
  textPosition?: TextPosition;
  safeArea: Rect01 | null;
  focal: Point01 & { zoom: number };
  /** The subject's box (0–1 of the photo), when the photo was analysed. */
  subject: Rect01 | null;
};

/** How a post is drawn: its text mode, composition, text position, safe area and focal point. */
export function resolveDesign(post: DesignPost, dna: ResolvedDna): ResolvedDesign {
  const design = post.design;
  const headline = (post.overlay_headline || post.overlay_text || "").trim();
  const chosen = compositionKeyOf(design?.composition);
  const legacyType = !chosen && post.overlay_theme === "type_hero";
  let mode: TextMode;
  if (isTextMode(design?.text_mode)) mode = design.text_mode;
  // v1 posts: no overlay is a clean photo; a typographic composition is type-led.
  else if (post.has_overlay === false || (!headline && chosen !== "type_led" && !legacyType)) mode = "photo_only";
  else if (chosen === "type_led" || legacyType) mode = "type_led";
  else mode = "headline";
  const composition: CompositionKey = mode === "type_led" ? "type_led" : mode === "photo_only" ? "full_bleed" : photoComposition(post, dna);
  const rawPos = design?.text_position === "middle" ? "center" : design?.text_position;
  const legacyPos = LEGACY_THEMES[post.overlay_theme || ""]?.textPosition;
  const allowed = COMPOSITION_LIBRARY[composition].text_positions;
  const textPosition = isTextPosition(rawPos) && allowed.includes(rawPos) ? rawPos : legacyPos && allowed.includes(legacyPos) ? legacyPos : undefined;
  return { mode, composition, textPosition, safeArea: safeAreaOf(design?.safe_area), focal: focalOf(design), subject: safeAreaOf(design?.subject) };
}

/** The composition a post is drawn with (kept for callers of the v1 API). */
export function resolveComposition(post: DesignPost, dna: ResolvedDna): CompositionKey {
  return resolveDesign(post, dna).composition;
}

/**
 * How many of `n` posts get each text mode under the DNA's mix (largest remainder), with at
 * least one headline so the type is always seen. Ordered the way a feed would open: a
 * headline first, then the photos, then type.
 */
export function modesForSamples(dna: ResolvedDna, n = 3): TextMode[] {
  const modes: TextMode[] = ["headline", "photo_only", "type_led"];
  const raw = modes.map((m) => dna.mix[m] * n);
  const count = raw.map(Math.floor);
  let left = n - count.reduce((a, b) => a + b, 0);
  const order = modes.map((_, i) => i).sort((a, b) => raw[b] - Math.floor(raw[b]) - (raw[a] - Math.floor(raw[a])) || raw[b] - raw[a]);
  for (const i of order) {
    if (left <= 0) break;
    count[i] += 1;
    left -= 1;
  }
  if (count[0] === 0) {
    const from = count[1] >= count[2] ? 1 : 2;
    count[from] -= 1;
    count[0] += 1;
  }
  const out: TextMode[] = [];
  // Interleave so two photo-only posts never sit side by side when something else exists.
  const queue = modes.flatMap((m, i) => Array<TextMode>(count[i]).fill(m));
  while (queue.length) {
    const last = out[out.length - 1];
    const idx = queue.findIndex((m) => m !== last);
    out.push(queue.splice(idx < 0 ? 0 : idx, 1)[0]);
  }
  return out;
}
