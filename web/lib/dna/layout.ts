/**
 * The card layout: where the photo, the words and the signature go on one post.
 *
 * A pure function of the post's design, the DNA, the card's size and what is known about the
 * photo (its shape and light). The renderer draws exactly this plan, and the editor uses the
 * same plan to describe a design in words, so a label never promises a layout the card does
 * not draw.
 *
 * The rules of docs/design-dna.md, Revision 1, are enforced here rather than by convention:
 *  1. One message: the headline, at most one short line, a price only when it is the message.
 *     No call to action on the image.
 *  2. The product is the hero: words go inside `design.safe_area`, measured to fit; with no
 *     safe area, or words that do not fit, they go on their own band beside the photo. Never
 *     on a box over the subject. Crops keep `design.focal` in frame.
 *  3. Readable on a phone: no text under 3.2% of the card's width, no headline under 7%.
 *     A setting that would need smaller type is not drawn smaller; it moves to a band.
 *  4. The logo small (feed) or small and clear (stories, WhatsApp), on a plate only when it
 *     would not read on the photo. Without a logo, the name in the display face.
 */

import { contrastRatio } from "@/lib/cardTokens";
import { headlineLines, lineCount, widestLine, wordCount } from "./hebrew";
import { MIN_HEADLINE_RATIO, MIN_TEXT_RATIO, type CompositionKey, type Point01, type Rect01, type TextMode } from "./library";
import { regionLight, type PhotoInfo, type RegionLight } from "./photoInfo";
import { alpha, contrastOnLuminance, ensureContrast, isLight, mix, type BandGround, type ResolvedDesign, type ResolvedDna } from "./resolve";

export type Box = { x: number; y: number; w: number; h: number };
export type CardFormat = "portrait" | "square" | "story";
/** Where the post goes: the feed shows the profile next to it; a story or WhatsApp does not. */
export type Channel = "feed" | "story" | "whatsapp";
export type Ground = BandGround | "photo";

/** How the post reads, in words the owner understands (see `OUTCOME_LABEL`). */
export type Outcome = "photo" | "on_photo" | "band_top" | "band_bottom" | "inset" | "arch" | "type";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  photo: "רק התמונה",
  on_photo: "כותרת על התמונה",
  band_top: "כותרת מעל התמונה",
  band_bottom: "כותרת מתחת לתמונה",
  inset: "התמונה עם שוליים",
  arch: "התמונה בחלון מקושת",
  type: "טקסט על רקע",
};

export type CardWords = {
  headline: string;
  sub: string;
  price?: { amount: string; note: string };
};

export type PhotoPlan = {
  frame: Box;
  shape: "rect" | "arch";
  radius: number;
  /** The image's drawn size and offset inside the frame (a cover crop around the focal point). */
  dw: number;
  dh: number;
  x0: number;
  y0: number;
  /** The same crop as an `object-position` (0–1), for next/image. */
  pos: Point01;
};

export type TextLinePlan = { text: string; size: number; lines: number; weight: number; leading: number };

export type TextPlan = {
  box: Box;
  ground: Ground;
  align: "start" | "center";
  vAlign: "start" | "center" | "end";
  headline: TextLinePlan & { accentKey: boolean };
  sub?: TextLinePlan & { above: boolean };
  price?: { amount: string; size: number };
  /** The DNA's `logo_mark`: the logo, small, closing the words. */
  mark?: { src: string; h: number; plate?: string };
  gap: number;
  fg: string;
  soft: string;
  accent: string;
  /** A soft local shade behind words on a photo (a radial gradient, never a box). */
  shade?: { box: Box; color: string; strength: number };
  shadow?: string;
};

export type SignaturePlan =
  | { kind: "logo"; src: string; box: Box; height: number; plate?: { bg: string; pad: number; radius: number }; nameColor: string }
  | { kind: "name"; box: Box; size: number; color: string; align: "start" | "center" | "end"; shadow?: string };

export type FooterPlan = { y: number; h: number; bg: string; fg: string; logo?: string; logoH: number; nameSize: number; plate?: string };

export type MotifPlan =
  | { kind: "grain"; box: Box; dark: boolean }
  | { kind: "rule"; x: number; y: number; w: number; color: string; thickness: number };

export type CardPlan = {
  W: number;
  H: number;
  format: CardFormat;
  mode: TextMode;
  /** What was asked for, and what is drawn (a headline that did not fit moves to a band). */
  requested: CompositionKey;
  composition: CompositionKey;
  outcome: Outcome;
  fellBack: boolean;
  background: string;
  photo?: PhotoPlan;
  bands: { box: Box; color: string }[];
  text?: TextPlan;
  signature?: SignaturePlan;
  footer?: FooterPlan;
  motifs: MotifPlan[];
  minText: number;
  minHeadline: number;
};

export type PlanInput = {
  W: number;
  H: number;
  dna: ResolvedDna;
  design: ResolvedDesign;
  words: CardWords;
  photo: { url?: string; info?: PhotoInfo };
  channel: Channel;
  /** The logo to draw (same-origin when possible), and its shape once loaded. */
  logo?: { src: string; aspect?: number };
  name: string;
  /**
   * Measure in the loaded faces (exact) rather than from average letter widths. False on the
   * server and on the first client render (hydration must match), true once fonts are in.
   */
  exact?: boolean;
};

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

const intersects = (a: Box, b: Box, pad = 0) =>
  a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

function intersect(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const btm = Math.min(a.y + a.h, b.y + b.h);
  return r > x && btm > y ? { x, y, w: r - x, h: btm - y } : null;
}

export function formatOf(W: number, H: number): CardFormat {
  const r = H / W;
  if (r >= 1.6) return "story";
  if (r <= 1.05) return "square";
  return "portrait";
}

type Crop = { dw: number; dh: number; x0: number; y0: number };

/**
 * A cover crop of a photo of `aspect` into `frame`, centred on `focal` as far as the photo
 * allows; `t` moves it that far toward `toward` (the empty area), for room to write.
 */
function coverCrop(aspect: number, frame: Box, focal: Point01 & { zoom: number }, toward?: Point01, t = 0): Crop {
  const s = Math.max(frame.w / aspect, frame.h) * focal.zoom;
  const dw = aspect * s;
  const dh = s;
  const clampX = (v: number) => Math.min(0, Math.max(frame.w - dw, v));
  const clampY = (v: number) => Math.min(0, Math.max(frame.h - dh, v));
  let x0 = clampX(frame.w / 2 - focal.x * dw);
  let y0 = clampY(frame.h / 2 - focal.y * dh);
  if (toward && t > 0) {
    x0 = clampX(x0 + (clampX(frame.w / 2 - toward.x * dw) - x0) * t);
    y0 = clampY(y0 + (clampY(frame.h / 2 - toward.y * dh) - y0) * t);
  }
  return { dw, dh, x0, y0 };
}

function photoPlan(frame: Box, crop: Crop, shape: PhotoPlan["shape"] = "rect", radius = 0): PhotoPlan {
  const pos = {
    x: Math.abs(frame.w - crop.dw) < 0.5 ? 0.5 : crop.x0 / (frame.w - crop.dw),
    y: Math.abs(frame.h - crop.dh) < 0.5 ? 0.5 : crop.y0 / (frame.h - crop.dh),
  };
  return { frame, shape, radius, ...crop, pos };
}

/** A rectangle in the photo (0–1) → card px, through a crop. */
function toCard(r: Rect01, frame: Box, c: Crop): Box {
  return { x: frame.x + c.x0 + r.x * c.dw, y: frame.y + c.y0 + r.y * c.dh, w: r.w * c.dw, h: r.h * c.dh };
}

/** A box in card px → the photo (0–1), through a crop. */
function toPhoto(b: Box, frame: Box, c: Crop): Rect01 {
  return { x: (b.x - frame.x - c.x0) / c.dw, y: (b.y - frame.y - c.y0) / c.dh, w: b.w / c.dw, h: b.h / c.dh };
}

/** Where the focal point lands in the frame (0–1 of the frame). */
function focalInFrame(frame: Box, c: Crop, focal: Point01): Point01 {
  return { x: (c.x0 + focal.x * c.dw) / frame.w, y: (c.y0 + focal.y * c.dh) / frame.h };
}

/* ------------------------------------------------------------------ */
/* Type                                                                */
/* ------------------------------------------------------------------ */

type Measures = { W: number; minText: number; minHeadline: number; dna: ResolvedDna; exact: boolean };

type Fit = {
  size: number;
  hl: number;
  subSize: number;
  sl: number;
  priceSize: number;
  gap: number;
  height: number;
  width: number;
  sub: string;
};

/** The headline's ceiling for this DNA and format, before a composition scales it. */
function headlineMax(dna: ResolvedDna, W: number, format: CardFormat, factor = 1): number {
  const base = dna.scale === "large" ? 0.135 : dna.scale === "medium" ? 0.108 : 0.09;
  const fmt = format === "story" ? 1.08 : format === "square" ? 0.92 : 1;
  return Math.round(W * base * fmt * factor);
}

/**
 * The largest setting of the words that fits `width` × `height`: the headline in at most
 * `maxLines` lines and never under the headline minimum, the short line in at most two
 * lines and never under the text minimum, and the price as part of the headline. A short
 * line that will not fit is dropped (one message); a headline that will not fit returns
 * null, and the caller moves the words to a band. `extra` is a fixed row after the words.
 */
function fitWords(
  m: Measures,
  words: CardWords,
  box: { width: number; height: number },
  opts: { max: number; maxLines: number; extra?: number },
): Fit | null {
  const { dna, minText, minHeadline } = m;
  const head = words.headline;
  if (!head) return null;
  const meta = dna.display.meta;
  const weight = dna.display.weight;
  const textMeta = dna.text.meta;
  const subWeight = Math.min(700, dna.text.weight + 100);
  const max = Math.max(minHeadline, opts.max);
  const extra = opts.extra ?? 0;
  const price = words.price ? `${words.price.amount} ₪` : "";
  for (let size = max; size >= minHeadline; size -= 2) {
    const hl = headlineLines(head, meta, weight, size, box.width, m.exact);
    if (hl > opts.maxLines) continue;
    const priceSize = price ? Math.max(minHeadline, Math.round(size * 0.92)) : 0;
    const subSize = Math.max(minText, Math.round(size * 0.4));
    let sub = words.sub;
    let sl = sub ? lineCount(sub, textMeta, subWeight, subSize, box.width, m.exact) : 0;
    if (sl > 2) {
      sub = "";
      sl = 0;
    }
    const gap = Math.round(size * 0.3);
    const height =
      hl * size * meta.leading + (sl ? gap + sl * subSize * 1.32 : 0) + (priceSize ? gap * 0.5 + priceSize * 1.04 : 0) + (extra ? gap + extra : 0);
    if (height > box.height) continue;
    const width = Math.max(
      widestLine(head, meta, weight, size, box.width, m.exact),
      sub ? widestLine(sub, textMeta, subWeight, subSize, box.width, m.exact) : 0,
      priceSize ? widestLine(price, meta, weight, priceSize, box.width, m.exact) : 0,
    );
    return { size, hl, subSize, sl, priceSize, gap, height, width, sub };
  }
  return null;
}

/** `fitWords` that allows a fourth line before giving up (a band has the room). */
function fitInBand(m: Measures, words: CardWords, box: { width: number; height: number }, opts: { max: number; extra?: number }): Fit | null {
  return fitWords(m, words, box, { ...opts, maxLines: 3 }) ?? fitWords(m, words, box, { ...opts, maxLines: 4 });
}

/** The words with the price as the headline (`price_style: headline`): the words go above it. */
function priceAsHeadline(words: CardWords): CardWords {
  if (!words.price) return words;
  return { headline: `${words.price.amount} ₪`, sub: words.headline || words.price.note, price: undefined };
}

type Inks = { fg: string; soft: string; accent: string };

function inksOn(dna: ResolvedDna, ground: BandGround): Inks {
  const c = dna.colors;
  const pick = (bg: string, ...cands: string[]) => cands.find((x) => contrastRatio(x, bg) >= 3) ?? cands[cands.length - 1];
  switch (ground) {
    case "tint":
      // The brand's accent, deepened toward its ink only as far as it needs to read.
      return { fg: c.ink, soft: mix(c.ink, c.tint, 0.25), accent: ensureContrast(c.accent, c.tint, c.ink, 3) };
    case "accent":
      return { fg: c.onAccent, soft: mix(c.onAccent, c.accent, 0.22), accent: pick(c.accent, c.accent2, c.onAccent) };
    case "ink":
      return { fg: c.onInk, soft: mix(c.onInk, c.ink, 0.28), accent: pick(c.ink, c.accent, c.accent2, c.tint) };
    case "paper":
    default:
      return { fg: c.ink, soft: mix(c.ink, c.paper, 0.28), accent: c.accentOnPaper };
  }
}

export function groundColor(dna: ResolvedDna, g: BandGround): string {
  const c = dna.colors;
  return g === "tint" ? c.tint : g === "accent" ? c.accent : g === "ink" ? c.ink : c.paper;
}

/**
 * Words on a photo: the colour that reads on the light actually under them (the DNA's
 * on-photo colour first), and a soft shade only where the photo is busy or mid-toned.
 */
function inksOnPhoto(dna: ResolvedDna, light: RegionLight | null, shadeBox: Box): Pick<TextPlan, "fg" | "soft" | "accent" | "shade" | "shadow"> {
  const c = dna.colors;
  const lightInk = isLight(c.onPhoto) ? c.onPhoto : isLight(c.paper) ? c.paper : "#ffffff";
  const darkInk = !isLight(c.onPhoto) ? c.onPhoto : !isLight(c.ink) ? c.ink : "#1a1a1a";
  let fg = c.onPhoto;
  let contrast = 0;
  if (light) {
    const a = contrastOnLuminance(lightInk, light.mean);
    const b = contrastOnLuminance(darkInk, light.mean);
    // The DNA's own on-photo colour wins unless the other one reads clearly better.
    const own = isLight(c.onPhoto) ? a : b;
    const other = isLight(c.onPhoto) ? b : a;
    fg = other > own * 1.35 && own < 4.5 ? (isLight(c.onPhoto) ? darkInk : lightInk) : c.onPhoto;
    contrast = isLight(fg) ? a : b;
  }
  const lightText = isLight(fg);
  const needShade = !light || contrast < 4.5 || light.sd > 0.13;
  const strength = !light ? 0.5 : Math.max(0.22, Math.min(0.62, (4.5 - contrast) / 6 + light.sd * 1.6));
  const shadeColor = lightText ? c.shade : isLight(c.paper) ? c.paper : "#ffffff";
  const accentReads = light ? contrastOnLuminance(c.accent, light.mean) >= 3.2 : false;
  return {
    fg,
    soft: fg,
    accent: accentReads ? c.accent : fg,
    shade: needShade ? { box: shadeBox, color: shadeColor, strength } : undefined,
    shadow: lightText && needShade ? `0 2px 22px ${alpha(c.shade, 0.35)}` : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Signature                                                           */
/* ------------------------------------------------------------------ */

type SigSize = { w: number; h: number; kind: "logo" | "name"; size: number };

function signatureSize(input: PlanInput, m: Measures, clear: boolean): SigSize {
  const { W, dna, name, logo } = input;
  if (logo) {
    const h = Math.round(W * (clear ? 0.05 : 0.038));
    const aspect = logo.aspect && Number.isFinite(logo.aspect) ? logo.aspect : 2.6;
    return { kind: "logo", h, w: Math.min(Math.round(W * (clear ? 0.3 : 0.24)), Math.round(h * aspect)), size: h };
  }
  // Condensed faces (Karantina, Amatic) need more size to carry the same weight.
  const narrow = Math.min(1.4, Math.max(1, 0.5 / dna.display.meta.widthEm));
  const size = Math.max(m.minText, Math.round(W * (clear ? 0.04 : 0.034) * narrow));
  const w = widestLine(name, dna.display.meta, dna.display.weight, size, W * 0.6, m.exact);
  return { kind: "name", h: Math.round(size * 1.15), w: Math.ceil(w * 1.08), size };
}

/**
 * What the DNA's signature becomes on this post. Stories and WhatsApp: always, small and
 * clear (nothing next to them says whose post it is). Feed: as the DNA chose — except that a
 * photo-only feed post carries no name of its own: the profile beside it already says whose
 * it is, and a name stamped on a photo is what makes it read as generated. A real logo the
 * brand chose to show stays, small.
 */
function signatureMode(input: PlanInput, format: CardFormat): "corner" | "footer" | "none" {
  const clear = input.channel !== "feed" || format === "story";
  const kind = input.dna.signature.kind;
  if (kind === "footer_band") return format === "story" ? "corner" : "footer";
  if (clear) return "corner";
  if (kind === "none") return "none";
  if (input.design.mode === "photo_only" && !(kind === "corner_mark" && input.logo)) return "none";
  return "corner";
}

type Corner = "top-start" | "top-end" | "bottom-start" | "bottom-end";

function cornerBox(corner: Corner, size: { w: number; h: number }, area: Box, inset: number): Box {
  const top = corner.startsWith("top");
  // RTL: the start corner is on the right.
  const start = corner.endsWith("start");
  return {
    x: start ? area.x + area.w - inset - size.w : area.x + inset,
    y: top ? area.y + inset : area.y + area.h - inset - size.h,
    w: size.w,
    h: size.h,
  };
}

function lightPaperOf(dna: ResolvedDna): string {
  return isLight(dna.colors.paper) ? dna.colors.paper : "#ffffff";
}

function signatureOnPhoto(input: PlanInput, sz: SigSize, box: Box, light: RegionLight | null): SignaturePlan {
  const { dna, logo } = input;
  const c = dna.colors;
  if (sz.kind === "logo" && logo) {
    const on = dna.signature.logoOn;
    // A logo drawn for a light ground needs a light plate on a dark or busy photo, and the
    // other way round. Unknown light: a plate, to be safe.
    const busy = light ? light.sd > 0.16 : true;
    const dark = light ? light.mean < 0.32 : true;
    const bright = light ? light.mean > 0.5 : true;
    const plateBg = on === "light" && (dark || busy) ? lightPaperOf(dna) : on === "dark" && (bright || busy) ? c.ink : "";
    const pad = Math.round(sz.h * 0.3);
    return {
      kind: "logo",
      src: logo.src,
      height: sz.h,
      box,
      plate: plateBg ? { bg: plateBg, pad, radius: dna.shape === "round" ? 999 : dna.shape === "soft" ? Math.round(pad * 0.9) : 2 } : undefined,
      nameColor: plateBg ? (isLight(plateBg) ? c.ink : c.onInk) : c.onPhoto,
    };
  }
  const fgLight = isLight(c.onPhoto) ? c.onPhoto : lightPaperOf(dna);
  const fgDark = !isLight(c.onPhoto) ? c.onPhoto : c.ink;
  const color = light ? (contrastOnLuminance(fgLight, light.mean) >= contrastOnLuminance(fgDark, light.mean) ? fgLight : fgDark) : c.onPhoto;
  // A soft halo of the opposite tone keeps a small name legible on a busy photo.
  const busy = !light || light.sd > 0.1 || contrastOnLuminance(color, light.mean) < 4.5;
  const halo = isLight(color) ? alpha(c.shade, 0.6) : alpha(lightPaperOf(dna), 0.75);
  return { kind: "name", box, size: sz.size, color, align: "start", shadow: busy ? `0 0 12px ${halo}, 0 0 3px ${halo}` : undefined };
}

function signatureOnGround(input: PlanInput, sz: SigSize, box: Box, ground: BandGround, align: "start" | "center" | "end"): SignaturePlan {
  const { dna, logo } = input;
  const c = dna.colors;
  const bg = groundColor(dna, ground);
  if (sz.kind === "logo" && logo) {
    const on = dna.signature.logoOn;
    const plateBg = on === "light" && !isLight(bg) ? lightPaperOf(dna) : on === "dark" && isLight(bg) ? c.ink : "";
    const pad = Math.round(sz.h * 0.28);
    return {
      kind: "logo",
      src: logo.src,
      height: sz.h,
      box,
      plate: plateBg ? { bg: plateBg, pad, radius: dna.shape === "round" ? 999 : 6 } : undefined,
      nameColor: inksOn(dna, ground).fg,
    };
  }
  return { kind: "name", box, size: sz.size, color: inksOn(dna, ground).fg, align };
}

/* ------------------------------------------------------------------ */
/* The plan                                                            */
/* ------------------------------------------------------------------ */

export function planCard(input: PlanInput): CardPlan {
  const { W, H: fullH, dna, design, photo } = input;
  const format = formatOf(W, fullH);
  const story = format === "story";
  const clear = input.channel !== "feed" || story;
  const m: Measures = { W, dna, exact: Boolean(input.exact), minText: Math.ceil(W * MIN_TEXT_RATIO), minHeadline: Math.ceil(W * MIN_HEADLINE_RATIO) };
  const sigMode = signatureMode(input, format);
  const footerH = sigMode === "footer" ? Math.round(W * (format === "square" ? 0.078 : 0.085)) : 0;
  const H = fullH - footerH;
  const P = Math.round(W * (dna.scale === "editorial" ? 0.085 : dna.scale === "medium" ? 0.075 : 0.066) * (format === "square" ? 0.92 : 1));
  // A story keeps clear of Instagram's own header and reply bar.
  const ST = story ? Math.round(fullH * 0.105) : 0;
  const SB = story ? Math.max(0, Math.round(fullH * 0.15) - footerH) : 0;
  const content: Box = { x: P, y: P + ST, w: W - 2 * P, h: H - 2 * P - ST - SB };
  const aspect = photo.info?.aspect ?? 0.8;
  const words = dna.copy.price === "headline" ? priceAsHeadline(input.words) : input.words;
  const sig = signatureSize(input, m, clear);
  const sigGap = Math.round(W * 0.03);
  const ruleOn = dna.motif.kind === "rule";
  // The logo as the words' closing detail, only when the signature is not already the logo.
  const markH = dna.motif.kind === "logo_mark" && input.logo && !(sigMode !== "none" && sig.kind === "logo") ? Math.round(W * 0.034) : 0;

  const plan: CardPlan = {
    W,
    H: fullH,
    format,
    mode: design.mode,
    requested: design.composition,
    composition: design.composition,
    outcome: "photo",
    fellBack: false,
    background: dna.colors.paper,
    bands: [],
    motifs: [],
    minText: m.minText,
    minHeadline: m.minHeadline,
  };

  if (footerH) {
    const c = dna.colors;
    const bg = isLight(c.paper) ? c.ink : c.paper;
    const fg = isLight(bg) ? c.ink : c.onInk;
    const on = dna.signature.logoOn;
    const plate = input.logo && ((on === "light" && !isLight(bg)) || (on === "dark" && isLight(bg))) ? (isLight(bg) ? c.ink : lightPaperOf(dna)) : undefined;
    plan.footer = { y: H, h: footerH, bg, fg, logo: input.logo?.src, logoH: Math.round(footerH * 0.42), nameSize: Math.max(m.minText, Math.round(footerH * 0.4)), plate };
  }

  const grainOn = (ground: BandGround, box: Box) => {
    if (dna.motif.kind === "grain") plan.motifs.push({ kind: "grain", box, dark: !isLight(groundColor(dna, ground)) });
  };
  const ruleAt = (ground: BandGround, x: number, y: number, w: number) => {
    const inks = inksOn(dna, ground);
    plan.motifs.push({ kind: "rule", x, y, w, color: mix(inks.fg, groundColor(dna, ground), 0.55), thickness: Math.max(2, Math.round(W * 0.0022)) });
  };

  /**
   * A paper area holding the words and, under them, the signature row (and the DNA's rule
   * between them). Returns the box left for the words.
   */
  const reserveRows = (area: Box, ground: BandGround, textAlign: "start" | "center" = dna.align): Box => {
    if (sigMode !== "corner") return area;
    const align = textAlign === "center" ? "center" : "end";
    const x = align === "center" ? area.x + (area.w - sig.w) / 2 : area.x;
    plan.signature = signatureOnGround(input, sig, { x, y: area.y + area.h - sig.h, w: sig.w, h: sig.h }, ground, align);
    const ruleRow = ruleOn ? sigGap : 0;
    if (ruleOn) ruleAt(ground, area.x, area.y + area.h - sig.h - sigGap - ruleRow / 2, area.w);
    return { ...area, h: area.h - sig.h - sigGap - ruleRow };
  };
  const rowsHeight = sigMode === "corner" ? sig.h + sigGap + (ruleOn ? sigGap : 0) : 0;

  /** The signature in a photo corner, clear of the words and the subject. */
  const sigOnPhoto = (frame: Box, crop: Crop, avoid: Box[], prefer: Corner[]) => {
    if (sigMode !== "corner") return;
    const area: Box = { x: 0, y: ST, w: W, h: H - ST - SB };
    const inset = Math.round(P * 0.75);
    const f = focalInFrame(frame, crop, design.focal);
    const focalBox: Box = { x: frame.x + f.x * frame.w - W * 0.12, y: frame.y + f.y * frame.h - W * 0.12, w: W * 0.24, h: W * 0.24 };
    const all: Corner[] = [...new Set<Corner>([...prefer, "top-start", "top-end", "bottom-start", "bottom-end"])];
    // Of the corners clear of the words and the subject, the calmest one (the least busy
    // photo under it); the composition's preferred order breaks ties.
    let best: { box: Box; score: number; light: RegionLight | null } | null = null;
    all.forEach((corner, i) => {
      const b = cornerBox(corner, sig, area, inset);
      if (avoid.some((a) => intersects(a, b, sigGap)) || intersects(focalBox, b)) return;
      const light = photo.url ? regionLight(photo.info, toPhoto(b, frame, crop)) : null;
      const score = (light ? light.sd : 0) + i * 0.02;
      if (!best || score < best.score) best = { box: b, score, light };
    });
    const chosen: { box: Box; light: RegionLight | null } = best ?? { box: cornerBox(all[0], sig, area, inset), light: null };
    plan.signature = signatureOnPhoto(input, sig, chosen.box, chosen.light);
  };

  /** Words on a ground (band, paper, type): the plan's text block and its inks. */
  const textOnGround = (box: Box, fit: Fit, ground: BandGround, align: "start" | "center", vAlign: TextPlan["vAlign"]): TextPlan => {
    const inks = inksOn(dna, ground);
    const bg = groundColor(dna, ground);
    return {
      box,
      ground,
      align,
      vAlign,
      gap: fit.gap,
      headline: { text: words.headline, size: fit.size, lines: fit.hl, weight: dna.display.weight, leading: dna.display.meta.leading, accentKey: dna.copy.accent },
      sub: fit.sub
        ? { text: fit.sub, size: fit.subSize, lines: fit.sl, weight: Math.min(700, dna.text.weight + 100), leading: 1.32, above: dna.copy.subAbove || (dna.copy.price === "headline" && Boolean(input.words.price)) }
        : undefined,
      price: words.price && fit.priceSize ? { amount: words.price.amount, size: fit.priceSize } : undefined,
      mark: markH && input.logo ? { src: input.logo.src, h: markH, plate: dna.signature.logoOn === "light" && !isLight(bg) ? lightPaperOf(dna) : undefined } : undefined,
      fg: inks.fg,
      soft: inks.soft,
      accent: dna.copy.accent ? inks.accent : inks.fg,
    };
  };

  /* ---- type-led: type on the brand's ground ---- */
  if (design.mode === "type_led") {
    const ground = dna.ground;
    plan.background = groundColor(dna, ground);
    plan.composition = "type_led";
    plan.outcome = "type";
    grainOn(ground, { x: 0, y: 0, w: W, h: H });
    const side = Math.round(P * 1.1);
    const textArea = reserveRows({ ...content, x: side, w: W - 2 * side }, ground);
    const fit = fitInBand(m, words, { width: textArea.w, height: textArea.h * 0.92 }, { max: headlineMax(dna, W, format, 1.4), extra: markH });
    if (fit) plan.text = textOnGround(textArea, fit, ground, dna.align, design.textPosition === "top" ? "start" : design.textPosition === "bottom" ? "end" : "center");
    return plan;
  }

  /* ---- photo only: the photo is the post ---- */
  const fullFrame: Box = { x: 0, y: 0, w: W, h: H };
  if (design.mode === "photo_only") {
    const crop = coverCrop(aspect, fullFrame, design.focal);
    plan.photo = photoPlan(fullFrame, crop);
    plan.composition = "full_bleed";
    plan.outcome = "photo";
    // At most one word or a very short line, and only inside the photo's empty area.
    const short = Boolean(words.headline) && wordCount(words.headline) <= 2 && words.headline.length <= 16;
    const avoid: Box[] = [];
    if (short && design.safeArea && photo.url) {
      const placed = onPhoto(m, input, { headline: words.headline, sub: "" }, fullFrame, crop, design.safeArea, content, { maxLines: 1, factor: 0.9 });
      if (placed) {
        plan.text = placed;
        avoid.push(placed.box);
      }
    }
    const textTop = avoid.length > 0 && avoid[0].y + avoid[0].h / 2 < H / 2;
    sigOnPhoto(fullFrame, crop, avoid, textTop ? ["bottom-start", "bottom-end"] : ["top-start", "top-end"]);
    return plan;
  }

  /* ---- a headline: on the photo when it fits its empty area, else on a band ---- */
  let composition = design.composition;
  if (composition === "full_bleed") {
    if (design.safeArea && photo.url) {
      const safe = design.safeArea;
      const safeCentre = { x: safe.x + safe.w / 2, y: safe.y + safe.h / 2 };
      // The crop may move toward the empty area, as long as the subject stays well in frame.
      for (const t of [0, 0.5, 1]) {
        const crop = coverCrop(aspect, fullFrame, design.focal, safeCentre, t);
        const f = focalInFrame(fullFrame, crop, design.focal);
        if (t > 0 && (f.x < 0.18 || f.x > 0.82 || f.y < 0.18 || f.y > 0.82)) break;
        const placed = onPhoto(m, input, words, fullFrame, crop, safe, content, { maxLines: 3, factor: 1 });
        if (!placed) continue;
        plan.photo = photoPlan(fullFrame, crop);
        plan.text = placed;
        plan.composition = "full_bleed";
        plan.outcome = "on_photo";
        const top = placed.box.y + placed.box.h / 2 < H / 2;
        sigOnPhoto(fullFrame, crop, [placed.box], top ? ["bottom-start", "bottom-end"] : ["top-start", "top-end"]);
        return plan;
      }
    }
    // No empty area, or the words do not fit it at a size a phone can read: a band.
    composition = "split";
    plan.fellBack = true;
  }

  const safe = design.safeArea;
  const bandTop = design.textPosition === "top" || (design.textPosition !== "bottom" && Boolean(safe) && (safe as Rect01).y + (safe as Rect01).h / 2 < 0.45);

  if (composition === "split") {
    const ground = dna.ground;
    const padY = Math.round(P * 0.85);
    const width = W - 2 * P;
    const minBand = Math.round(H * (format === "square" ? 0.3 : 0.26));
    // A story's band also holds the room kept clear for Instagram's own bars.
    const maxBand = Math.round(H * (format === "square" ? 0.5 : story ? 0.52 : 0.44));
    const insetTop = bandTop ? ST : 0;
    const insetBottom = bandTop ? 0 : SB;
    const room = maxBand - 2 * padY - insetTop - insetBottom - rowsHeight;
    const fit = fitInBand(m, words, { width, height: room }, { max: headlineMax(dna, W, format, 0.95), extra: markH });
    const textH = fit ? fit.height : m.minHeadline * 1.2;
    const bandH = Math.max(minBand, Math.min(maxBand, Math.ceil(textH + 2 * padY + insetTop + insetBottom + rowsHeight)));
    const band: Box = bandTop ? { x: 0, y: 0, w: W, h: bandH } : { x: 0, y: H - bandH, w: W, h: bandH };
    const frame: Box = bandTop ? { x: 0, y: bandH, w: W, h: H - bandH } : { x: 0, y: 0, w: W, h: H - bandH };
    plan.photo = photoPlan(frame, coverCrop(aspect, frame, design.focal));
    plan.bands.push({ box: band, color: groundColor(dna, ground) });
    plan.composition = "split";
    plan.outcome = bandTop ? "band_top" : "band_bottom";
    grainOn(ground, band);
    const textArea = reserveRows({ x: P, y: band.y + padY + insetTop, w: width, h: bandH - 2 * padY - insetTop - insetBottom }, ground);
    if (fit) plan.text = textOnGround(textArea, fit, ground, dna.align, "center");
    return plan;
  }

  if (composition === "inset_frame" || composition === "arch_window") {
    const ground: BandGround = dna.ground === "accent" ? "paper" : dna.ground;
    plan.background = groundColor(dna, ground);
    grainOn(ground, { x: 0, y: 0, w: W, h: H });
    const arch = composition === "arch_window";
    const sideBySide = arch && format === "square";
    const textTop = design.textPosition === "top" && !arch;
    let frame: Box;
    let area: Box;
    if (sideBySide) {
      // On a square card the arch stands at the end side and the words beside it.
      const aw = Math.round(W * 0.42);
      const ah = Math.round(H * 0.8);
      frame = { x: P, y: Math.round((H - ah) / 2) + Math.round(P * 0.2), w: aw, h: ah };
      area = { x: P + aw + Math.round(P * 0.8), y: P, w: W - aw - Math.round(P * 2.8), h: H - 2 * P };
    } else {
      const mrg = arch ? Math.round((W - W * (story ? 0.74 : 0.64)) / 2) : Math.round(P * 0.7);
      const width = W - 2 * P;
      const minArea = Math.round(H * (story ? 0.24 : 0.22));
      const maxArea = Math.round(H * (story ? 0.36 : 0.4));
      const pads = textTop ? Math.round(P * 1.5) : Math.round(P * 1.7);
      const insets = textTop ? ST : SB;
      const room = maxArea - pads - insets - rowsHeight;
      const probe = fitInBand(m, words, { width, height: room }, { max: headlineMax(dna, W, format, 0.85), extra: markH });
      const need = Math.ceil((probe ? probe.height : m.minHeadline * 1.2) + pads + insets + rowsHeight);
      const areaH = Math.max(minArea, Math.min(maxArea, need));
      if (textTop) {
        frame = { x: mrg, y: areaH, w: W - 2 * mrg, h: H - areaH - mrg };
        area = { x: P, y: P + ST, w: width, h: areaH - P - ST - Math.round(P * 0.5) };
      } else {
        const top = arch ? Math.round(P * 0.9) + Math.round(ST * 0.6) : mrg;
        frame = { x: mrg, y: top, w: W - 2 * mrg, h: H - areaH - top };
        area = { x: P, y: frame.y + frame.h + Math.round(P * 0.7), w: width, h: areaH - Math.round(P * 1.7) - SB };
      }
    }
    const radius = arch ? frame.w / 2 : dna.shape === "round" ? Math.round(W * 0.03) : dna.shape === "soft" ? Math.round(W * 0.014) : 0;
    plan.photo = photoPlan(frame, coverCrop(aspect, frame, design.focal), arch ? "arch" : "rect", radius);
    plan.composition = composition;
    plan.outcome = arch ? "arch" : "inset";
    const align: "start" | "center" = arch && !sideBySide ? "center" : dna.align;
    const textArea = reserveRows(area, ground, align);
    const fit = sideBySide
      ? fitWords(m, words, { width: textArea.w, height: textArea.h }, { max: headlineMax(dna, W, format, 0.7), maxLines: 4, extra: markH })
      : fitInBand(m, words, { width: textArea.w, height: textArea.h }, { max: headlineMax(dna, W, format, 0.85), extra: markH });
    if (fit) plan.text = textOnGround(textArea, fit, ground, align, sideBySide ? "center" : textTop ? "end" : "start");
    return plan;
  }

  // Unreachable with the v2 library; draw the photo alone rather than nothing.
  plan.photo = photoPlan(fullFrame, coverCrop(aspect, fullFrame, design.focal));
  return plan;
}

/**
 * Words inside the photo's empty area: the safe area mapped through the crop, kept inside
 * the card's margins, the setting measured to fit. Null when it cannot hold the headline at a
 * size a phone can read.
 */
function onPhoto(m: Measures, input: PlanInput, words: CardWords, frame: Box, crop: Crop, safe: Rect01, content: Box, opts: { maxLines: number; factor: number }): TextPlan | null {
  const { dna, W } = input;
  const mapped = intersect(toCard(safe, frame, crop), content);
  if (!mapped || mapped.w < W * 0.36 || mapped.h < m.minHeadline * 1.1) return null;
  const format = formatOf(input.W, input.H);
  const fit = fitWords(m, words, { width: mapped.w, height: mapped.h }, { max: headlineMax(dna, W, format, opts.factor), maxLines: opts.maxLines });
  if (!fit) return null;
  const midY = mapped.y + mapped.h / 2;
  const vAlign: TextPlan["vAlign"] = midY < input.H * 0.4 ? "start" : midY > input.H * 0.6 ? "end" : "center";
  // The block hugs its words (with room for the browser's own measure), placed in the empty
  // area the way the DNA aligns.
  const bw = Math.min(mapped.w, Math.ceil(fit.width * 1.14));
  const bx = dna.align === "center" ? mapped.x + (mapped.w - bw) / 2 : mapped.x + mapped.w - bw;
  const by = vAlign === "start" ? mapped.y : vAlign === "end" ? mapped.y + mapped.h - fit.height : mapped.y + (mapped.h - fit.height) / 2;
  const box: Box = { x: bx, y: by, w: bw, h: Math.ceil(fit.height) };
  const light = regionLight(input.photo.info, toPhoto(box, frame, crop));
  const pad = Math.round(fit.size * 0.9);
  const inks = inksOnPhoto(dna, light, { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 });
  return {
    box,
    ground: "photo",
    align: dna.align,
    vAlign: "start",
    gap: fit.gap,
    headline: { text: words.headline, size: fit.size, lines: fit.hl, weight: dna.display.weight, leading: dna.display.meta.leading, accentKey: dna.copy.accent && inks.accent !== inks.fg },
    sub: fit.sub ? { text: fit.sub, size: fit.subSize, lines: fit.sl, weight: Math.min(700, dna.text.weight + 100), leading: 1.32, above: dna.copy.subAbove } : undefined,
    price: words.price && fit.priceSize ? { amount: words.price.amount, size: fit.priceSize } : undefined,
    ...inks,
  };
}
