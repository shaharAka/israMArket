/**
 * The nine signature motifs, drawn in SVG/CSS at the card's true 1080px size and coloured
 * by the DNA. No `<defs>`, patterns or ids: several cards share one page (the QA grid, the
 * editor's thumbnails), and a duplicated id would paint one card with another's colours.
 * The only raster-like effect, grain, is a self-contained SVG data URI.
 *
 * Compositions do not draw motifs directly. They describe the places a motif could go (a
 * seam between photo and panel, a corner, a frame around the photo, a texture over a
 * ground) in order of preference; `MotifSlots` draws the DNA's motif in the first place it
 * suits, and in the second as well when the DNA's density is `mid`.
 */

import type { CSSProperties, ReactNode } from "react";
import type { MotifKey } from "@/lib/dna/library";

type Box = { x: number; y: number; w: number; h: number };

export type MotifPlace =
  /** A horizontal line between two regions; `into` is where the motif protrudes. */
  | { role: "seam"; x: number; y: number; w: number; into: "up" | "down"; fill: string; ground: string }
  /** A decorative mark anchored at a corner of a box. */
  | { role: "corner"; x: number; y: number; size: number; corner: "top-start" | "top-end" | "bottom-start" | "bottom-end"; ground: string }
  /** Around a rectangle (usually the photo). */
  | { role: "frame"; box: Box; radius: number; ground: string; inset?: number }
  /** Over a whole region. */
  | { role: "texture"; box: Box; ground: string }
  /** A wide strip (top or bottom edge of the card). */
  | { role: "band"; box: Box; ground: string };

const SUPPORTS: Record<MotifKey, MotifPlace["role"][]> = {
  scalloped_edge: ["seam", "band", "corner", "frame"],
  stripes: ["band", "seam", "corner"],
  arches: ["corner", "band", "seam"],
  dots: ["corner", "texture", "seam", "frame", "band"],
  grain: ["texture"],
  stamp: [],
  underline: ["seam"],
  tape: ["frame", "corner", "seam"],
  thread: ["frame", "seam", "band"],
};

export function motifSupports(kind: MotifKey, role: MotifPlace["role"]): boolean {
  return SUPPORTS[kind].includes(role);
}

const abs = (b: Box): CSSProperties => ({ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h });

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

/** A row of half-circles along a line: the edge of a doily, a cake box, an awning. */
export function Scallops({ x, y, w, r, color, into }: { x: number; y: number; w: number; r: number; color: string; into: "up" | "down" }) {
  const n = Math.max(2, Math.round(w / (r * 2)));
  const step = w / n;
  const rr = step / 2;
  let d = into === "up" ? `M0 ${rr}` : `M0 0`;
  for (let i = 0; i < n; i += 1) {
    const x2 = (i + 1) * step;
    d += into === "up" ? ` A${rr} ${rr} 0 0 1 ${x2} ${rr}` : ` A${rr} ${rr} 0 0 0 ${x2} 0`;
  }
  d += into === "up" ? ` L${w} ${rr + 1} L0 ${rr + 1} Z` : ` L${w} -1 L0 -1 Z`;
  return (
    <svg
      aria-hidden
      width={w}
      height={rr + 1}
      viewBox={into === "up" ? `0 0 ${w} ${rr + 1}` : `0 -1 ${w} ${rr + 1}`}
      style={{ position: "absolute", left: x, top: into === "up" ? y - rr : y, display: "block", overflow: "visible" }}
    >
      <path d={d} fill={color} />
    </svg>
  );
}

/** Awning or ribbon stripes, crisp at any size (a repeating gradient, not an image). */
export function StripeBlock({ box, a, b, stripe = 36, angle = 90, style }: { box: Box; a: string; b: string; stripe?: number; angle?: number; style?: CSSProperties }) {
  return (
    <div
      aria-hidden
      style={{
        ...abs(box),
        background: `repeating-linear-gradient(${angle}deg, ${a} 0 ${stripe}px, ${b} ${stripe}px ${stripe * 2}px)`,
        ...style,
      }}
    />
  );
}

/** Concentric half-rings — a rising sun, a doorway, a rainbow — anchored at a baseline. */
export function NestedArches({ cx, base, r, rings, gap, color, stroke }: { cx: number; base: number; r: number; rings: number; gap: number; color: string; stroke: number }) {
  const paths: ReactNode[] = [];
  for (let i = 0; i < rings; i += 1) {
    const rr = r - i * gap;
    if (rr <= stroke) break;
    paths.push(<path key={i} d={`M${-rr} 0 A${rr} ${rr} 0 0 1 ${rr} 0`} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="butt" />);
  }
  return (
    <svg aria-hidden width={r * 2 + stroke} height={r + stroke} viewBox={`${-r - stroke / 2} ${-r - stroke / 2} ${r * 2 + stroke} ${r + stroke}`} style={{ position: "absolute", left: cx - r - stroke / 2, top: base - r - stroke / 2, overflow: "visible" }}>
      {paths}
    </svg>
  );
}

/** A row of arched windows (filled or outlined). */
export function ArchRow({ x, y, w, h, count, color, outline }: { x: number; y: number; w: number; h: number; count: number; color: string; outline?: number }) {
  const gap = w / count;
  const aw = gap * 0.62;
  const items: ReactNode[] = [];
  for (let i = 0; i < count; i += 1) {
    const ax = i * gap + (gap - aw) / 2;
    const r = aw / 2;
    const d = `M${ax} ${h} L${ax} ${r} A${r} ${r} 0 0 1 ${ax + aw} ${r} L${ax + aw} ${h} Z`;
    items.push(<path key={i} d={d} fill={outline ? "none" : color} stroke={outline ? color : "none"} strokeWidth={outline || 0} />);
  }
  return (
    <svg aria-hidden width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", left: x, top: y, overflow: "visible" }}>
      {items}
    </svg>
  );
}

/** A halftone field: dots shrinking away from one corner. */
export function DotField({ box, step, rMax, color, from = "top-start", opacity = 1 }: { box: Box; step: number; rMax: number; color: string; from?: "top-start" | "top-end" | "bottom-start" | "bottom-end" | "even"; opacity?: number }) {
  if (from === "even") {
    // An even grid is a repeating gradient: the same crisp dots without a thousand nodes.
    const r = rMax * 0.65;
    return (
      <div
        aria-hidden
        style={{
          ...abs(box),
          opacity,
          backgroundImage: `radial-gradient(circle at ${step / 2}px ${step / 2}px, ${color} ${r}px, transparent ${r + 0.8}px)`,
          backgroundSize: `${step}px ${step}px`,
        }}
      />
    );
  }
  const cols = Math.floor(box.w / step);
  const rows = Math.floor(box.h / step);
  const dots: ReactNode[] = [];
  const diag = Math.hypot(cols, rows) || 1;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      // RTL: "start" is the right edge.
      const fx = from.endsWith("start") ? cols - 1 - c : c;
      const fy = from.startsWith("bottom") ? rows - 1 - r : r;
      const t = Math.hypot(fx, fy) / diag;
      const rad = rMax * (1 - t);
      if (rad < 1.2) continue;
      dots.push(<circle key={`${r}-${c}`} cx={c * step + step / 2} cy={r * step + step / 2} r={rad} fill={color} />);
    }
  }
  return (
    <svg aria-hidden width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`} style={{ ...abs(box), opacity }}>
      {dots}
    </svg>
  );
}

/**
 * Film grain as a self-contained SVG (fractal noise), tiled. Multiplied over light grounds
 * and screened over dark ones, so it reads as print, not as a grey veil.
 */
export function Grain({ box, strength = 0.18, dark = false, radius = 0 }: { box: Box; strength?: number; dark?: boolean; radius?: number }) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${dark ? 1 : 0} 0 0 0 0 ${dark ? 1 : 0} 0 0 0 0 ${dark ? 1 : 0} 0 0 0 1.1 -0.18'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`;
  return (
    <div
      aria-hidden
      style={{
        ...abs(box),
        backgroundImage: `url("data:image/svg+xml;utf8,${svg.replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E")}")`,
        backgroundSize: "320px 320px",
        opacity: strength,
        borderRadius: radius,
        pointerEvents: "none",
      }}
    />
  );
}

/** A strip of paper tape with torn ends. */
export function Tape({ cx, cy, w, h, rotate, color }: { cx: number; cy: number; w: number; h: number; rotate: number; color: string }) {
  const teeth = 6;
  const tooth = h / teeth;
  let left = "";
  let right = "";
  for (let i = 0; i <= teeth; i += 1) {
    left += `${i % 2 ? 7 : 0},${i * tooth} `;
    right += `${w - (i % 2 ? 0 : 7)},${h - i * tooth} `;
  }
  return (
    <svg aria-hidden width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", left: cx - w / 2, top: cy - h / 2, transform: `rotate(${rotate}deg)`, overflow: "visible" }}>
      <polygon points={`${left}${right}`} fill={color} opacity={0.82} />
      <polygon points={`${left}${right}`} fill="none" stroke="#ffffff" strokeOpacity={0.18} strokeWidth={2} />
    </svg>
  );
}

/** A stitched line or frame: short dashes with round ends, like thread through fabric. */
export function Stitch({ box, radius = 0, color, width = 3, dash = 16, gap = 11, line }: { box: Box; radius?: number; color: string; width?: number; dash?: number; gap?: number; line?: boolean }) {
  return (
    <svg aria-hidden width={box.w} height={Math.max(box.h, width)} viewBox={`0 0 ${box.w} ${Math.max(box.h, width)}`} style={{ position: "absolute", left: box.x, top: line ? box.y - width / 2 : box.y, overflow: "visible" }}>
      {line ? (
        <line x1={0} y1={width / 2} x2={box.w} y2={width / 2} stroke={color} strokeWidth={width} strokeDasharray={`${dash} ${gap}`} strokeLinecap="round" />
      ) : (
        <rect x={width / 2} y={width / 2} width={box.w - width} height={box.h - width} rx={radius} fill="none" stroke={color} strokeWidth={width} strokeDasharray={`${dash} ${gap}`} strokeLinecap="round" />
      )}
    </svg>
  );
}

/** A brush stroke, drawn as a filled shape that thickens in the middle. */
export function BrushLine({ x, y, w, h = 18, color, rotate = -1 }: { x: number; y: number; w: number; h?: number; color: string; rotate?: number }) {
  const d = `M2 ${h * 0.62} C ${w * 0.2} ${h * 0.18}, ${w * 0.55} ${h * 0.05}, ${w - 2} ${h * 0.28} C ${w * 0.62} ${h * 0.5}, ${w * 0.3} ${h * 0.68}, 8 ${h * 0.98} Z`;
  return (
    <svg aria-hidden width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", left: x, top: y - h / 2, transform: `rotate(${rotate}deg)`, overflow: "visible" }}>
      <path d={d} fill={color} />
    </svg>
  );
}

/** The brush stroke as a CSS background, for an inline run of text that may wrap. */
export function brushBackground(color: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 24' preserveAspectRatio='none'><path d='M2 15 C 40 5, 110 2, 198 7 C 130 12, 70 16, 10 23 Z' fill='${color}'/></svg>`;
  return `url("data:image/svg+xml;utf8,${svg.replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E")}")`;
}

/** A small rosette with a scalloped rim, for a corner. */
export function ScallopRosette({ cx, cy, r, color, inner }: { cx: number; cy: number; r: number; color: string; inner?: string }) {
  const n = 14;
  const bump = (Math.PI * r) / n;
  let d = "";
  for (let i = 0; i < n; i += 1) {
    const a1 = (i / n) * Math.PI * 2;
    const a2 = ((i + 1) / n) * Math.PI * 2;
    const p1 = [Math.cos(a1) * r, Math.sin(a1) * r];
    const p2 = [Math.cos(a2) * r, Math.sin(a2) * r];
    d += `${i === 0 ? `M${p1[0]} ${p1[1]}` : ""} A${bump} ${bump} 0 0 1 ${p2[0]} ${p2[1]}`;
  }
  return (
    <svg aria-hidden width={r * 2.4} height={r * 2.4} viewBox={`${-r * 1.2} ${-r * 1.2} ${r * 2.4} ${r * 2.4}`} style={{ position: "absolute", left: cx - r * 1.2, top: cy - r * 1.2, overflow: "visible" }}>
      <path d={`${d} Z`} fill={color} />
      {inner ? <circle r={r * 0.72} fill="none" stroke={inner} strokeWidth={2} strokeDasharray="5 6" /> : null}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Placement                                                           */
/* ------------------------------------------------------------------ */

export type MotifPaint = { kind: MotifKey; color: string; alt: string; paper: string; dense: boolean };

function drawAt(m: MotifPaint, place: MotifPlace, key: string): ReactNode {
  const { kind, color, alt } = m;
  switch (place.role) {
    case "seam": {
      const { x, y, w, into, fill } = place;
      if (kind === "scalloped_edge") return <Scallops key={key} x={x} y={y} w={w} r={22} color={fill} into={into} />;
      if (kind === "stripes")
        return <StripeBlock key={key} box={{ x, y: into === "up" ? y - 30 : y, w, h: 30 }} a={color} b={alt} stripe={30} />;
      if (kind === "arches") return <ArchRow key={key} x={x + 24} y={into === "up" ? y - 44 : y} w={w - 48} h={44} count={Math.round(w / 90)} color={fill} />;
      if (kind === "dots") return <DotField key={key} box={{ x: x + 20, y: into === "up" ? y - 34 : y + 4, w: w - 40, h: 30 }} step={30} rMax={6} color={color} from="even" />;
      if (kind === "underline") return <BrushLine key={key} x={x + w * 0.08} y={y} w={w * 0.84} h={16} color={color} />;
      if (kind === "tape") {
        return [0.18, 0.82].map((t, i) => <Tape key={`${key}-${i}`} cx={x + w * t} cy={y} w={150} h={46} rotate={i ? 7 : -6} color={color} />);
      }
      if (kind === "thread") return <Stitch key={key} box={{ x: x + 28, y: into === "up" ? y - 18 : y + 18, w: w - 56, h: 0 }} line color={color} />;
      return null;
    }
    case "band": {
      const { box } = place;
      if (kind === "stripes") return <StripeBlock key={key} box={box} a={color} b={alt} stripe={Math.max(26, Math.round(box.h * 0.6))} />;
      if (kind === "scalloped_edge") return <Scallops key={key} x={box.x} y={box.y + box.h} w={box.w} r={Math.min(26, box.h)} color={color} into="up" />;
      if (kind === "arches") return <ArchRow key={key} x={box.x + 30} y={box.y} w={box.w - 60} h={box.h} count={Math.round(box.w / 110)} color={color} outline={4} />;
      if (kind === "dots") return <DotField key={key} box={box} step={28} rMax={5} color={color} from="even" />;
      if (kind === "thread") return <Stitch key={key} box={{ x: box.x + 40, y: box.y + box.h / 2, w: box.w - 80, h: 0 }} line color={color} />;
      return null;
    }
    case "corner": {
      const { x, y, size, corner } = place;
      const top = corner.startsWith("top");
      const start = corner.endsWith("start");
      // RTL: the start corner is on the right.
      const bx = start ? x - size : x;
      const by = top ? y : y - size;
      if (kind === "dots") return <DotField key={key} box={{ x: bx, y: by, w: size, h: size }} step={size / 9} rMax={size / 30} color={color} from={corner} />;
      if (kind === "arches") return <NestedArches key={key} cx={start ? x - size * 0.5 : x + size * 0.5} base={top ? y + size * 0.62 : y} r={size * 0.5} rings={m.dense ? 5 : 4} gap={size * 0.1} color={color} stroke={size * 0.045} />;
      if (kind === "stripes")
        return <StripeBlock key={key} box={{ x: bx, y: by, w: size, h: size }} a={color} b="transparent" stripe={size / 14} angle={start ? 45 : 135} style={{ clipPath: top ? (start ? "polygon(0 0,100% 0,100% 100%)" : "polygon(0 0,100% 0,0 100%)") : start ? "polygon(100% 0,100% 100%,0 100%)" : "polygon(0 0,100% 100%,0 100%)" }} />;
      if (kind === "scalloped_edge") return <ScallopRosette key={key} cx={start ? x - size * 0.42 : x + size * 0.42} cy={top ? y + size * 0.42 : y - size * 0.42} r={size * 0.34} color={color} inner={m.paper} />;
      if (kind === "tape") return <Tape key={key} cx={start ? x - size * 0.2 : x + size * 0.2} cy={top ? y + size * 0.12 : y - size * 0.12} w={size * 0.9} h={size * 0.26} rotate={start === top ? 38 : -38} color={color} />;
      return null;
    }
    case "frame": {
      const { box, radius, inset = 22 } = place;
      if (kind === "thread")
        return <Stitch key={key} box={{ x: box.x + inset, y: box.y + inset, w: box.w - inset * 2, h: box.h - inset * 2 }} radius={Math.max(0, radius - inset * 0.6)} color={color} />;
      if (kind === "tape")
        return [
          <Tape key={`${key}-a`} cx={box.x + box.w - 30} cy={box.y + 6} w={170} h={50} rotate={34} color={color} />,
          <Tape key={`${key}-b`} cx={box.x + 30} cy={box.y + box.h - 6} w={170} h={50} rotate={34} color={color} />,
        ];
      if (kind === "dots") return <Stitch key={key} box={{ x: box.x - 18, y: box.y - 18, w: box.w + 36, h: box.h + 36 }} radius={radius + 14} color={color} width={7} dash={0.1} gap={17} />;
      if (kind === "scalloped_edge")
        return [
          <Scallops key={`${key}-t`} x={box.x} y={box.y} w={box.w} r={18} color={m.paper} into="down" />,
          <Scallops key={`${key}-b`} x={box.x} y={box.y + box.h} w={box.w} r={18} color={m.paper} into="up" />,
        ];
      return null;
    }
    case "texture": {
      const { box, ground } = place;
      if (kind === "grain") return <Grain key={key} box={box} strength={m.dense ? 0.3 : 0.2} dark={!isLightish(ground)} />;
      if (kind === "dots") return <DotField key={key} box={box} step={36} rMax={2.4} color={color} from="even" opacity={0.4} />;
      return null;
    }
  }
}

function isLightish(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length !== 6) return true;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 140;
}

/**
 * Draws the DNA's motif in the first of `places` it suits — and, for a `mid` density
 * DNA, in the second one too. Places are listed by the composition, best first.
 */
export function MotifSlots({ paint, places }: { paint: MotifPaint; places: MotifPlace[] }) {
  const fitting = places.filter((p) => motifSupports(paint.kind, p.role));
  const chosen = fitting.slice(0, paint.dense ? 2 : 1);
  return <>{chosen.map((p, i) => drawAt(paint, p, `m${i}`))}</>;
}
