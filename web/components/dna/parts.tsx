"use client";

/* eslint-disable @next/next/no-img-element -- the card is rasterised by html-to-image, which inlines plain <img> */

/**
 * The type and image parts every composition is built from: the photo, the kicker, the
 * headline, the stat, the price and the call to action — each drawn the DNA's way.
 * Nothing here is shared house style: a kicker takes its mark from the DNA's motif, the
 * CTA from its copy treatment, corners from its type personality, colours from its roles.
 */

import Image from "next/image";
import { createContext, useContext, useState, type CSSProperties, type ReactNode } from "react";
import { fitHeadline, splitKeyPhrase, splitSentences, splitStat } from "@/lib/dna/hebrew";
import { mix } from "@/lib/dna/resolve";
import { inksFor, type CardCtx, type Ground, type Inks } from "./context";
import { brushBackground, DotField, Tape } from "./motifs";

/**
 * Set by CardStage's `photoSizes`: the photo is then drawn with next/image (responsive,
 * lazy) instead of a plain <img>. Only the landing page opts in; the editor and the PNG
 * export keep the plain <img>, which html-to-image inlines as-is.
 */
export const PhotoSizesContext = createContext<string | undefined>(undefined);

/* ------------------------------------------------------------------ */
/* Photo                                                               */
/* ------------------------------------------------------------------ */

export function Photo({ ctx, style, zoomBoost = 1, focus }: { ctx: CardCtx; style?: CSSProperties; zoomBoost?: number; focus?: { x: number; y: number } }) {
  // A missing or broken image must degrade to a designed placeholder, never a browser
  // broken-image icon: the card is exported as artwork.
  const [failed, setFailed] = useState(false);
  const sizes = useContext(PhotoSizesContext);
  const { url, crop } = ctx.photo;
  const x = focus?.x ?? crop.x;
  const y = focus?.y ?? crop.y;
  const zoom = crop.zoom * zoomBoost;
  const pos = `${Math.round(x * 100)}% ${Math.round(y * 100)}%`;
  const frame: CSSProperties = { position: "absolute", inset: 0, overflow: "hidden", ...style };
  const zoomStyle: CSSProperties = zoom > 1.001 ? { transform: `scale(${zoom})`, transformOrigin: pos } : {};
  if (url && !failed) {
    return (
      <div style={frame}>
        {sizes ? (
          <Image src={url} alt="" fill sizes={sizes} onError={() => setFailed(true)} style={{ objectFit: "cover", objectPosition: pos, ...zoomStyle }} />
        ) : (
          <img
            src={url}
            alt=""
            onError={() => setFailed(true)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: pos, display: "block", ...zoomStyle }}
          />
        )}
      </div>
    );
  }
  const c = ctx.c;
  return (
    <div style={{ ...frame, background: c.tint, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <DotField box={{ x: 0, y: 0, w: 1080, h: 1920 }} step={44} rMax={3} color={mix(c.tint, c.ink, 0.18)} from="even" />
      {ctx.quietPlaceholder ? null : (
        <span style={{ position: "relative", fontFamily: ctx.textStack, fontSize: 30, fontWeight: 500, color: mix(c.ink, c.tint, 0.4) }}>התמונה בהכנה</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Kicker                                                              */
/* ------------------------------------------------------------------ */

/** The small line over the headline ("מהדורת חג", "רק בשישי"), marked with the DNA's motif. */
export function Kicker({ ctx, inks, text, size = 30, align = "start" }: { ctx: CardCtx; inks: Inks; text: string; size?: number; align?: "start" | "center" }) {
  if (!text) return null;
  const weight = Math.min(700, ctx.dna.text.weight + 200);
  const base: CSSProperties = {
    fontFamily: ctx.textStack,
    fontSize: size,
    fontWeight: weight,
    lineHeight: 1.2,
    color: inks.fg,
    display: "inline-flex",
    alignItems: "center",
    gap: Math.round(size * 0.45),
    alignSelf: align === "center" ? "center" : "flex-start",
    maxWidth: "100%",
  };
  const kind = ctx.dna.motif.kind;
  const mark = inks.accent;
  if (kind === "stamp") {
    // On a photo the stamp prints in the on-photo colour: an accent on a busy picture
    // reads as a smudge.
    const ink = inks.bg === ctx.c.scrim ? inks.fg : mark;
    // A rubber stamp: double rule, slightly turned, printed in one ink.
    return (
      <span
        style={{
          ...base,
          color: ink,
          border: `3px solid ${ink}`,
          outline: `1.5px solid ${ink}`,
          outlineOffset: 5,
          padding: `${size * 0.22}px ${size * 0.55}px`,
          transform: "rotate(-3deg)",
          marginInlineStart: 8,
          marginBlock: 6,
          letterSpacing: "0.02em",
        }}
      >
        {text}
      </span>
    );
  }
  if (kind === "tape") {
    return (
      <span style={{ ...base, position: "relative", padding: `${size * 0.3}px ${size * 0.7}px`, transform: "rotate(-2deg)" }}>
        <span aria-hidden style={{ position: "absolute", inset: 0, background: ctx.c.accent, opacity: 0.85, clipPath: "polygon(2% 0,98% 6%,100% 50%,97% 100%,1% 94%,0 50%)" }} />
        <span style={{ position: "relative", color: ctx.c.onAccent }}>{text}</span>
      </span>
    );
  }
  let glyph: ReactNode = null;
  const g = Math.round(size * 0.9);
  if (kind === "dots") glyph = <span style={{ width: size * 0.42, height: size * 0.42, borderRadius: 99, background: mark, flexShrink: 0 }} />;
  else if (kind === "stripes")
    glyph = <span style={{ width: g * 1.2, height: g * 0.62, flexShrink: 0, background: `repeating-linear-gradient(90deg, ${mark} 0 ${g * 0.14}px, transparent ${g * 0.14}px ${g * 0.3}px)` }} />;
  else if (kind === "arches")
    glyph = (
      <svg width={g * 0.8} height={g * 0.8} viewBox="0 0 20 20" style={{ flexShrink: 0 }}>
        <path d="M3 19 V10 A7 7 0 0 1 17 10 V19 Z" fill={mark} />
      </svg>
    );
  else if (kind === "scalloped_edge")
    glyph = (
      <svg width={g * 1.4} height={g * 0.45} viewBox="0 0 28 9" style={{ flexShrink: 0 }}>
        <path d="M0 8 A3.5 3.5 0 0 1 7 8 A3.5 3.5 0 0 1 14 8 A3.5 3.5 0 0 1 21 8 A3.5 3.5 0 0 1 28 8" fill="none" stroke={mark} strokeWidth={2.2} />
      </svg>
    );
  else if (kind === "thread") glyph = <span style={{ width: g * 1.6, height: 0, borderTop: `3px dashed ${mark}`, flexShrink: 0 }} />;
  else glyph = <span style={{ width: g * 1.4, height: 2, background: mark, flexShrink: 0 }} />;
  return (
    <span style={base}>
      {glyph}
      <span style={{ textWrap: "balance" }}>{text}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Headline                                                            */
/* ------------------------------------------------------------------ */

export type HeadlineBox = { width: number; height: number; max: number; min?: number; maxLines?: number };

export function Headline({ ctx, inks, text, box, align = "start", style }: { ctx: CardCtx; inks: Inks; text: string; box: HeadlineBox; align?: "start" | "center"; style?: CSSProperties }) {
  if (!text) return null;
  const { display, headlineCase, motif } = ctx.dna;
  const maxLines = box.maxLines ?? 4;
  // Two short sentences (or a label and its point, "קולקציית סתיו: תחרה בצבע אבקה") read
  // best one to a line, the way a designer would set them.
  const segments = splitSentences(text);
  const fitOf = (t: string, lines: number, height: number) =>
    fitHeadline(t, display.meta, display.weight, { width: box.width, height, max: box.max, min: box.min ?? 34, maxLines: lines }).size;
  const size =
    segments.length > 1
      ? Math.min(...segments.map((seg) => fitOf(seg, Math.max(1, Math.ceil(maxLines / segments.length)), box.height / segments.length)))
      : fitOf(text, maxLines, box.height);
  const leading = display.meta.leading;
  const { key } = splitKeyPhrase(text);
  const marked = (headlineCase === "accent" || motif.kind === "underline") && Boolean(key);
  const keyStyle: CSSProperties = {};
  if (headlineCase === "accent") keyStyle.color = inks.accent;
  if (motif.kind === "underline") {
    keyStyle.backgroundImage = brushBackground(mix(inks.accent, inks.bg, 0.12));
    keyStyle.backgroundRepeat = "no-repeat";
    keyStyle.backgroundSize = "100% 0.34em";
    keyStyle.backgroundPosition = "0 92%";
    keyStyle.paddingInline = "0.04em";
    keyStyle.WebkitBoxDecorationBreak = "clone";
    keyStyle.boxDecorationBreak = "clone";
    if (headlineCase !== "accent") keyStyle.color = inks.fg;
  }
  /** One segment, with the key phrase marked when it ends this segment. */
  const render = (seg: string, last: boolean): ReactNode => {
    if (!marked || !last || !seg.endsWith(key)) return seg;
    return (
      <>
        {seg.slice(0, seg.length - key.length)}
        <span style={keyStyle}>{key}</span>
      </>
    );
  };
  return (
    <h2
      style={{
        margin: 0,
        fontFamily: ctx.displayStack,
        fontWeight: display.weight,
        fontSize: size,
        lineHeight: leading,
        letterSpacing: display.weight >= 800 ? "-0.015em" : display.meta.category === "hand" ? "0.01em" : "-0.005em",
        color: inks.fg,
        textAlign: align === "center" ? "center" : "right",
        textWrap: "balance",
        textTransform: headlineCase === "upper" ? "uppercase" : undefined,
        maxHeight: Math.ceil(size * leading * (Math.max(maxLines, segments.length * 2) + 0.2)),
        overflow: "hidden",
        ...style,
      }}
    >
      {segments.map((seg, i) => (
        <span key={i} style={{ display: segments.length > 1 ? "block" : "inline" }}>
          {render(seg, i === segments.length - 1)}
        </span>
      ))}
    </h2>
  );
}

/* ------------------------------------------------------------------ */
/* Stat, price, call to action                                         */
/* ------------------------------------------------------------------ */

export function Stat({ ctx, inks, text, size = 40, align = "start" }: { ctx: CardCtx; inks: Inks; text: string; size?: number; align?: "start" | "center" }) {
  if (!text) return null;
  const split = splitStat(text);
  if (split) {
    return (
      <p style={{ margin: 0, display: "flex", alignItems: "baseline", gap: size * 0.35, justifyContent: align === "center" ? "center" : "flex-start", color: inks.accent }}>
        <span style={{ fontFamily: ctx.displayStack, fontWeight: ctx.dna.display.weight, fontSize: size * 1.7, lineHeight: 1, letterSpacing: "-0.02em" }}>{split.figure}</span>
        <span style={{ fontFamily: ctx.textStack, fontWeight: Math.min(700, ctx.dna.text.weight + 100), fontSize: size * 0.72, lineHeight: 1.2, color: inks.fg }}>{split.label}</span>
      </p>
    );
  }
  return (
    <p style={{ margin: 0, fontFamily: ctx.textStack, fontWeight: Math.min(700, ctx.dna.text.weight + 200), fontSize: size * 0.82, lineHeight: 1.25, color: inks.accent, textAlign: align === "center" ? "center" : "right", textWrap: "balance" }}>
      {text}
    </p>
  );
}

/** A price set inline with the copy: the figure in the display face, the sign small. */
export function InlinePrice({ ctx, inks, price, size = 64 }: { ctx: CardCtx; inks: Inks; price: string; size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: size * 0.1, color: inks.accent, fontFamily: ctx.displayStack, fontWeight: ctx.dna.display.weight, lineHeight: 1 }}>
      <span style={{ fontSize: size, letterSpacing: "-0.02em" }}>{price}</span>
      <span style={{ fontSize: size * 0.5 }}>₪</span>
    </span>
  );
}

/**
 * A price as an object: a round sticker or a hang tag, placed by the composition at
 * (`x`, `y`) — its centre. Inline prices go through `InlinePrice` instead.
 */
export function PriceMark({ ctx, price, x, y, d = 196, ground = "photo" }: { ctx: CardCtx; price: string; x: number; y: number; d?: number; ground?: Ground }) {
  const style = ctx.dna.copy.price;
  const c = ctx.c;
  const fill = ground === "accent" ? c.accent2 : c.accent;
  const fg = ground === "accent" ? c.onAccent2 : c.onAccent;
  const figure = (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4, fontFamily: ctx.displayStack, fontWeight: ctx.dna.display.weight, lineHeight: 1, color: fg }}>
      <span style={{ fontSize: d * 0.36, letterSpacing: "-0.02em" }}>{price}</span>
      <span style={{ fontSize: d * 0.18 }}>₪</span>
    </span>
  );
  if (style === "tag") {
    const w = d * 1.25;
    const h = d * 0.62;
    return (
      <div style={{ position: "absolute", left: x - w / 2, top: y - h / 2, width: w, height: h, transform: "rotate(-7deg)" }}>
        <svg aria-hidden width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", inset: 0 }}>
          <path d={`M${h * 0.42} 0 H${w} V${h} H${h * 0.42} L0 ${h / 2} Z`} fill={fill} />
          <circle cx={h * 0.42} cy={h / 2} r={h * 0.09} fill={c.paper} />
        </svg>
        <span style={{ position: "absolute", top: 0, bottom: 0, right: 0, left: h * 0.6, display: "flex", alignItems: "center", justifyContent: "center" }}>{figure}</span>
      </div>
    );
  }
  return (
    <div
      style={{
        position: "absolute",
        left: x - d / 2,
        top: y - d / 2,
        width: d,
        height: d,
        borderRadius: "50%",
        background: fill,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: "rotate(-9deg)",
        boxShadow: `inset 0 0 0 ${Math.round(d * 0.035)}px ${fill}, inset 0 0 0 ${Math.round(d * 0.045)}px ${mix(fg, fill, 0.45)}`,
      }}
    >
      {figure}
    </div>
  );
}

export function Cta({ ctx, inks, text, size = 30, align = "start" }: { ctx: CardCtx; inks: Inks; text: string; size?: number; align?: "start" | "center" }) {
  if (!text) return null;
  const weight = Math.min(700, ctx.dna.text.weight + 200);
  const style = ctx.dna.copy.cta;
  const base: CSSProperties = {
    fontFamily: ctx.textStack,
    fontSize: size,
    fontWeight: weight,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "100%",
    // In a column the CTA keeps its own width; in a row (a ticket stub) it centres.
    alignSelf: align === "center" ? "center" : undefined,
  };
  if (style === "pill") {
    return (
      <span style={{ ...base, display: "inline-block", background: inks.ctaBg, color: inks.ctaFg, padding: `${size * 0.5}px ${size * 1.05}px`, borderRadius: ctx.dna.shape === "round" ? 999 : ctx.radius("s") }}>
        {text}
      </span>
    );
  }
  if (style === "arrow") {
    return (
      <span style={{ ...base, display: "inline-flex", alignItems: "center", gap: size * 0.5, color: inks.fg }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{text}</span>
        {/* RTL: forward points left. */}
        <svg aria-hidden width={size * 1.7} height={size * 0.7} viewBox="0 0 48 20" style={{ flexShrink: 0 }}>
          <path d="M47 10 H3 M12 2 L3 10 L12 18" fill="none" stroke={inks.accent} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return (
    <span style={{ ...base, display: "inline-block", color: inks.fg, paddingBottom: size * 0.22, borderBottom: `${Math.max(2, Math.round(size * 0.09))}px solid ${inks.accent}` }}>
      {text}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Text block                                                          */
/* ------------------------------------------------------------------ */

/** The DNA's headline ceiling for this format, before a composition scales it. */
export function headlineMax(ctx: CardCtx, factor = 1): number {
  const base = ctx.dna.scale === "large" ? 138 : ctx.dna.scale === "medium" ? 108 : 88;
  const fmt = ctx.format === "story" ? 1.1 : ctx.format === "square" ? 0.9 : 1;
  return Math.round(base * fmt * factor);
}

export type TextBlockProps = {
  ctx: CardCtx;
  ground: Ground;
  width: number;
  /** Height the headline may take. */
  headlineHeight: number;
  headlineFactor?: number;
  maxLines?: number;
  align?: "start" | "center";
  show?: { kicker?: boolean; stat?: boolean; cta?: boolean; price?: boolean };
  /** Smaller supporting type, for tight panels. */
  compact?: boolean;
  style?: CSSProperties;
  inks?: Inks;
};

/** Kicker, headline, stat (or an inline price) and the call to action, in the DNA's rhythm. */
export function TextBlock({ ctx, ground, width, headlineHeight, headlineFactor = 1, maxLines = 4, align = "start", show = {}, compact, style, inks: given }: TextBlockProps) {
  const inks = given ?? inksFor(ctx, ground);
  // A stamp DNA prints its stamp on the kicker; a post without one stamps its stat instead,
  // so the motif is never lost.
  const stampStat = ctx.dna.motif.kind === "stamp" && !ctx.words.kicker && Boolean(ctx.words.stat) && show.kicker !== false;
  const w = stampStat ? { ...ctx.words, kicker: ctx.words.stat, stat: "" } : ctx.words;
  const gapUnit = ctx.dna.scale === "editorial" ? 30 : ctx.dna.scale === "medium" ? 26 : 22;
  const small = compact ? 0.86 : 1;
  const showPrice = show.price !== false && w.price && ctx.dna.copy.price === "inline";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align === "center" ? "center" : "flex-start", width, ...style }}>
      {show.kicker !== false && w.kicker ? (
        <div style={{ marginBottom: gapUnit * 0.9, maxWidth: "100%", display: "flex", justifyContent: align === "center" ? "center" : "flex-start" }}>
          <Kicker ctx={ctx} inks={inks} text={w.kicker} size={Math.round(30 * small)} align={align} />
        </div>
      ) : null}
      <Headline ctx={ctx} inks={inks} text={w.headline} align={align} box={{ width, height: headlineHeight, max: headlineMax(ctx, headlineFactor), maxLines }} />
      {showPrice ? (
        <div style={{ marginTop: gapUnit }}>
          <InlinePrice ctx={ctx} inks={inks} price={w.price} size={Math.round(72 * small)} />
        </div>
      ) : null}
      {show.stat !== false && w.stat ? (
        <div style={{ marginTop: gapUnit * 0.85 }}>
          <Stat ctx={ctx} inks={inks} text={w.stat} size={Math.round(40 * small)} align={align} />
        </div>
      ) : null}
      {show.cta !== false && w.cta ? (
        <div style={{ marginTop: gapUnit * 1.5, display: "flex", maxWidth: "100%", justifyContent: align === "center" ? "center" : "flex-start" }}>
          <Cta ctx={ctx} inks={inks} text={w.cta} size={Math.round(30 * small)} align={align} />
        </div>
      ) : null}
    </div>
  );
}

/** Tape pieces holding something down (a note, a print): drawn in the DNA's accent. */
export function TapeCorners({ ctx, x, y, w }: { ctx: CardCtx; x: number; y: number; w: number }) {
  return (
    <>
      <Tape cx={x + w - 40} cy={y + 4} w={150} h={44} rotate={32} color={ctx.c.accent} />
      <Tape cx={x + 40} cy={y + 4} w={150} h={44} rotate={-32} color={ctx.c.accent} />
    </>
  );
}
