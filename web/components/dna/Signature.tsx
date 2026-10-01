"use client";

/* eslint-disable @next/next/no-img-element -- the card is rasterised by html-to-image, which inlines plain <img> */

/**
 * The brand signature: how the business's logo (or its name) sits on every post.
 *
 *   corner_mark  the logo small in a corner
 *   footer_band  a band along the bottom edge
 *   stamp        a round seal with the name around the rim
 *   tab          a tab hanging from the top edge
 *
 * The logo is drawn whenever the business has one, in the editor, every preview and the
 * PNG export. `data-card-logo` marks it for the export, which inlines it (or, when its host
 * refuses to share it, swaps in the `data-card-logo-fallback` wordmark — so a PNG never
 * ships an empty box).
 */

import { useId, useState, type CSSProperties } from "react";
import { contrastRatio } from "@/lib/cardTokens";
import { isLight, mix } from "@/lib/dna/resolve";
import { inksFor, type CardCtx, type Ground } from "./context";

export type SigCorner = "top-start" | "top-end" | "bottom-start" | "bottom-end";

function Logo({ src, height, maxWidth, fallback }: { src: string; height: number; maxWidth: number; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <>
      <img
        data-card-logo
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={{ height, width: "auto", maxWidth, objectFit: "contain", display: "block" }}
      />
      <span data-card-logo-fallback style={{ display: "none" }}>
        {fallback}
      </span>
    </>
  );
}

function Wordmark({ ctx, color, size, maxWidth, center }: { ctx: CardCtx; color: string; size: number; maxWidth?: number; center?: boolean }) {
  return (
    <span
      style={{
        fontFamily: ctx.displayStack,
        fontWeight: ctx.dna.display.weight,
        fontSize: size,
        lineHeight: 1.05,
        color,
        maxWidth,
        display: "block",
        textAlign: center ? "center" : "right",
        textWrap: "balance",
        letterSpacing: ctx.dna.display.meta.category === "hand" ? "0.02em" : 0,
      }}
    >
      {ctx.name}
    </span>
  );
}

/** Where a corner signature sits, measured from the card's edges. */
function cornerStyle(corner: SigCorner, inset: { x: number; y: number }): CSSProperties {
  const s: CSSProperties = { position: "absolute" };
  if (corner.startsWith("top")) s.top = inset.y;
  else s.bottom = inset.y;
  // RTL: start is the right edge.
  if (corner.endsWith("start")) s.right = inset.x;
  else s.left = inset.x;
  return s;
}

/**
 * A logo needs a quiet, light ground to read (most logos are drawn for white). On a photo
 * or a dark fill it gets a small plate in the DNA's own paper colour and corner shape.
 */
function needsPlate(ctx: CardCtx, ground: Ground): boolean {
  if (ground === "photo") return true;
  const bg = inksFor(ctx, ground).bg;
  return !isLight(bg);
}

export function CornerMark({ ctx, corner, ground, inset }: { ctx: CardCtx; corner: SigCorner; ground: Ground; inset?: { x: number; y: number } }) {
  const inks = inksFor(ctx, ground);
  const at = cornerStyle(corner, inset ?? { x: ctx.pad, y: ctx.pad * 0.8 + ctx.safeTop * (corner.startsWith("top") ? 1 : 0) });
  const word = <Wordmark ctx={ctx} color={ground === "photo" ? ctx.c.onPhoto : inks.fg} size={34} maxWidth={420} />;
  if (ctx.logo) {
    const plate = needsPlate(ctx, ground);
    const lightPaper = isLight(ctx.c.paper) ? ctx.c.paper : "#ffffff";
    return (
      <div style={{ ...at, ...(plate ? { background: lightPaper, padding: "14px 20px", borderRadius: ctx.radius("s") } : {}) }}>
        <Logo src={ctx.logo} height={plate ? 56 : 66} maxWidth={300} fallback={<Wordmark ctx={ctx} color={plate ? ctx.c.ink : inks.fg} size={32} maxWidth={360} />} />
      </div>
    );
  }
  return <div style={at}>{word}</div>;
}

export function footerHeight(ctx: { format: CardCtx["format"] }): number {
  return ctx.format === "story" ? 132 : ctx.format === "square" ? 92 : 104;
}

export function FooterBand({ ctx, y, h }: { ctx: CardCtx; y: number; h: number }) {
  const c = ctx.c;
  // The band is the DNA's ink, unless the ink is already the card's ground.
  const bg = isLight(c.paper) ? c.ink : c.accent;
  const fg = isLight(c.paper) ? c.onInk : c.onAccent;
  const glyphColor = contrastRatio(c.accent, bg) >= 2 ? c.accent : mix(fg, bg, 0.4);
  const contentH = ctx.format === "story" ? 104 : h;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, height: h, background: bg, display: "flex", alignItems: "flex-start" }}>
      <div style={{ height: contentH, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${ctx.pad}px` }}>
        {ctx.logo ? (
          <span style={{ background: isLight(bg) ? "transparent" : isLight(c.paper) ? c.paper : "#ffffff", padding: isLight(bg) ? 0 : "8px 16px", borderRadius: ctx.radius("s"), display: "flex" }}>
            <Logo src={ctx.logo} height={contentH * 0.46} maxWidth={320} fallback={<Wordmark ctx={ctx} color={isLight(bg) ? c.ink : c.ink} size={30} />} />
          </span>
        ) : (
          // Condensed faces (Karantina, Amatic) need more size to carry the same weight.
          <Wordmark ctx={ctx} color={fg} size={Math.round(contentH * 0.32 * Math.min(1.45, Math.max(1, 0.52 / ctx.dna.display.meta.widthEm)))} maxWidth={620} />
        )}
        <FooterGlyph ctx={ctx} color={glyphColor} />
      </div>
    </div>
  );
}

/** The band's far end: a small piece of the DNA's motif, so the band is never generic. */
function FooterGlyph({ ctx, color }: { ctx: CardCtx; color: string }) {
  const kind = ctx.dna.motif.kind;
  if (kind === "dots") return <span style={{ display: "flex", gap: 10 }}>{[0, 1, 2].map((i) => <span key={i} style={{ width: 12, height: 12, borderRadius: 99, background: color }} />)}</span>;
  if (kind === "stripes") return <span style={{ width: 120, height: 26, background: `repeating-linear-gradient(90deg, ${color} 0 10px, transparent 10px 20px)` }} />;
  if (kind === "arches")
    return (
      <svg width={120} height={34} viewBox="0 0 120 34">
        {[0, 1, 2].map((i) => <path key={i} d={`M${6 + i * 40} 34 V18 A14 14 0 0 1 ${34 + i * 40} 18 V34`} fill="none" stroke={color} strokeWidth={3} />)}
      </svg>
    );
  if (kind === "scalloped_edge")
    return (
      <svg width={126} height={20} viewBox="0 0 126 20">
        <path d="M0 18 A10.5 10.5 0 0 1 21 18 A10.5 10.5 0 0 1 42 18 A10.5 10.5 0 0 1 63 18 A10.5 10.5 0 0 1 84 18 A10.5 10.5 0 0 1 105 18 A10.5 10.5 0 0 1 126 18" fill="none" stroke={color} strokeWidth={3} />
      </svg>
    );
  if (kind === "thread") return <span style={{ width: 150, borderTop: `3px dashed ${color}` }} />;
  if (kind === "underline")
    return (
      <svg width={140} height={18} viewBox="0 0 140 18">
        <path d="M2 12 C 30 4, 80 2, 138 6 C 90 9, 50 12, 6 17 Z" fill={color} />
      </svg>
    );
  return <span style={{ width: 90, height: 3, background: color }} />;
}

/**
 * A round seal: the name around the rim, the logo (or the name's first letter) inside.
 * `x`/`y` is its centre.
 */
export function StampSeal({ ctx, x, y, d = 214, ground, rotate = -10 }: { ctx: CardCtx; x: number; y: number; d?: number; ground: Ground; rotate?: number }) {
  const rawId = useId();
  const id = `seal${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const inks = inksFor(ctx, ground);
  const onPhoto = ground === "photo";
  // On a photo the seal is a sticker in the DNA's accent; on paper it is printed in ink.
  const ring = onPhoto ? ctx.c.onAccent : ground === "paper" || ground === "tint" ? inks.accent : inks.fg;
  const disc = onPhoto ? ctx.c.accent : "transparent";
  const r = d / 2;
  const textR = r - 30;
  const name = ctx.name.length > 26 ? ctx.name.slice(0, 26) : ctx.name;
  const letter = ctx.name.trim().charAt(0) || "·";
  const lightPaper = isLight(ctx.c.paper) ? ctx.c.paper : "#ffffff";
  return (
    <div style={{ position: "absolute", left: x - r, top: y - r, width: d, height: d, transform: `rotate(${rotate}deg)` }}>
      <svg aria-hidden width={d} height={d} viewBox={`${-r} ${-r} ${d} ${d}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {onPhoto ? <circle r={r - 1} fill={disc} /> : null}
        <circle r={r - 3} fill="none" stroke={ring} strokeWidth={4} />
        <circle r={r - 14} fill="none" stroke={ring} strokeWidth={1.6} />
        <circle r={r - 52} fill="none" stroke={ring} strokeWidth={1.6} />
        <path id={id} d={`M ${-textR} 0 A ${textR} ${textR} 0 1 1 ${textR} 0 A ${textR} ${textR} 0 1 1 ${-textR} 0`} fill="none" />
        <text fill={ring} style={{ fontFamily: ctx.textStack, fontWeight: Math.min(700, ctx.dna.text.weight + 200), fontSize: 21, letterSpacing: "0.12em" }} direction="rtl">
          <textPath href={`#${id}`} startOffset="25%" textAnchor="middle">
            {name}
          </textPath>
        </text>
        {[-1, 1].map((s) => (
          <circle key={s} cx={s * textR} cy={0} r={3.2} fill={ring} />
        ))}
      </svg>
      <div style={{ position: "absolute", inset: 56, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", overflow: "hidden", background: ctx.logo ? lightPaper : "transparent" }}>
        {ctx.logo ? (
          <Logo src={ctx.logo} height={(d - 112) * 0.62} maxWidth={(d - 112) * 0.86} fallback={<span style={{ fontFamily: ctx.displayStack, fontSize: d * 0.3, color: ctx.c.ink, lineHeight: 1 }}>{letter}</span>} />
        ) : (
          <span style={{ fontFamily: ctx.displayStack, fontWeight: ctx.dna.display.weight, fontSize: d * 0.3, color: ring, lineHeight: 1 }}>{letter}</span>
        )}
      </div>
    </div>
  );
}

/** A tab hanging from the top edge at `x` (its far edge, RTL), with the logo or name. */
export function HangingTab({ ctx, corner = "top-start", ground }: { ctx: CardCtx; corner?: "top-start" | "top-end"; ground: Ground }) {
  const c = ctx.c;
  const onAccentGround = ground === "accent";
  const bg = onAccentGround ? c.ink : c.accent;
  const fg = onAccentGround ? c.onInk : c.onAccent;
  const w = ctx.logo ? 220 : 196;
  const h = 196 + ctx.safeTop;
  const shape = ctx.dna.shape;
  const tip = 34;
  const path =
    shape === "sharp"
      ? `M0 0 H${w} V${h} L${w / 2} ${h - tip} L0 ${h} Z`
      : shape === "round"
        ? `M0 0 H${w} V${h - w / 2} A${w / 2} ${w / 2} 0 0 1 0 ${h - w / 2} Z`
        : `M0 0 H${w} V${h - 22} Q${w} ${h} ${w - 22} ${h} H22 Q0 ${h} 0 ${h - 22} Z`;
  const side: CSSProperties = corner === "top-start" ? { right: ctx.pad * 0.9 } : { left: ctx.pad * 0.9 };
  const lightPaper = isLight(c.paper) ? c.paper : "#ffffff";
  const contentBottom = shape === "round" ? w * 0.42 : shape === "sharp" ? tip + 22 : 30;
  return (
    <div style={{ position: "absolute", top: 0, width: w, height: h, ...side }}>
      <svg aria-hidden width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", inset: 0 }}>
        <path d={path} fill={bg} />
      </svg>
      <div style={{ position: "absolute", left: 18, right: 18, bottom: contentBottom, display: "flex", justifyContent: "center" }}>
        {ctx.logo ? (
          <span style={{ background: lightPaper, borderRadius: ctx.radius("s"), padding: "10px 12px", display: "flex" }}>
            <Logo src={ctx.logo} height={62} maxWidth={w - 60} fallback={<Wordmark ctx={ctx} color={c.ink} size={28} center maxWidth={w - 60} />} />
          </span>
        ) : (
          <Wordmark ctx={ctx} color={fg} size={ctx.name.length > 12 ? 28 : 34} center maxWidth={w - 36} />
        )}
      </div>
    </div>
  );
}

/**
 * How far down from the card's top edge the signature reaches when it sits at `at` — so a
 * composition that sets its text at the top starts below it. A tab always hangs from the
 * top; a stamp given its own spot (`ownSpot`) is not in a corner at all.
 */
export function signatureTopReach(ctx: CardCtx, at: SigCorner, ownSpot = false): number {
  const kind = ctx.dna.signature.kind;
  if (kind === "footer_band") return 0;
  if (kind === "tab") return 196 + ctx.safeTop + 24;
  if (!at.startsWith("top")) return 0;
  if (kind === "stamp") return ownSpot ? 0 : ctx.pad + ctx.safeTop + (ctx.format === "square" ? 184 : 214);
  return Math.round(ctx.pad * 0.8 + ctx.safeTop + (ctx.logo ? 96 : 56));
}

/**
 * The signature for a composition. `at` is where the composition can spare room for it;
 * the footer band is drawn by the card itself, so it is skipped here.
 */
export function SignatureSlot({ ctx, at, ground, stampAt }: { ctx: CardCtx; at: SigCorner; ground: Ground; stampAt?: { x: number; y: number; ground?: Ground } }) {
  const kind = ctx.dna.signature.kind;
  if (kind === "footer_band") return null;
  if (kind === "tab") return <HangingTab ctx={ctx} corner={at.endsWith("end") ? "top-end" : "top-start"} ground={ground} />;
  if (kind === "stamp") {
    const d = ctx.format === "square" ? 184 : 214;
    const p = stampAt ?? {
      x: at.endsWith("start") ? ctx.W - ctx.pad - d / 2 + 10 : ctx.pad + d / 2 - 10,
      y: at.startsWith("top") ? ctx.pad + ctx.safeTop + d / 2 - 10 : ctx.H - ctx.pad - ctx.safeBottom - d / 2 + 10,
    };
    return <StampSeal ctx={ctx} x={p.x} y={p.y} d={d} ground={stampAt?.ground ?? ground} />;
  }
  return <CornerMark ctx={ctx} corner={at} ground={ground} />;
}
