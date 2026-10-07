"use client";

/* eslint-disable @next/next/no-img-element -- the card is rasterised by html-to-image, which inlines plain <img> */

/**
 * What a card is drawn from: the photo (cropped around its subject), the words (the
 * headline, one short line, a price when it is the message) and the DNA's one quiet detail.
 * Sizes and places come from the layout plan (lib/dna/layout.ts); nothing here decides them.
 */

import Image from "next/image";
import { createContext, useContext, useState, type CSSProperties, type ReactNode } from "react";
import { splitKeyPhrase, splitSentences } from "@/lib/dna/hebrew";
import type { MotifPlan, PhotoPlan, TextPlan } from "@/lib/dna/layout";
import { alpha, mix, type ResolvedDna } from "@/lib/dna/resolve";
import { Logo } from "./Signature";

/**
 * Set by CardStage's `photoSizes`: the photo is then drawn with next/image (responsive,
 * lazy) instead of a plain <img>. Only the landing page opts in; the editor and the PNG
 * export keep the plain <img>, which html-to-image inlines as-is.
 */
export const PhotoSizesContext = createContext<string | undefined>(undefined);

export type Stacks = { display: string; text: string; direction?: "rtl" | "ltr" };

/* ------------------------------------------------------------------ */
/* Photo                                                               */
/* ------------------------------------------------------------------ */

export function Photo({ plan, url, dna, stacks, quiet }: { plan: PhotoPlan; url?: string; dna: ResolvedDna; stacks: Stacks; quiet: boolean }) {
  // A missing or broken image degrades to a quiet placeholder, never a broken-image icon:
  // the card is exported as artwork.
  const [failed, setFailed] = useState(false);
  const sizes = useContext(PhotoSizesContext);
  const { frame } = plan;
  const r = plan.radius;
  const frameStyle: CSSProperties = {
    position: "absolute",
    left: frame.x,
    top: frame.y,
    width: frame.w,
    height: frame.h,
    overflow: "hidden",
    borderRadius: plan.shape === "arch" ? `${r}px ${r}px 0 0` : r,
  };
  if (url && !failed) {
    return (
      <div style={frameStyle} data-card-photo>
        {sizes ? (
          <Image
            src={url}
            alt=""
            fill
            sizes={sizes}
            onError={() => setFailed(true)}
            style={{ objectFit: "cover", objectPosition: `${Math.round(plan.pos.x * 100)}% ${Math.round(plan.pos.y * 100)}%` }}
          />
        ) : (
          <img
            src={url}
            alt=""
            onError={() => setFailed(true)}
            // Drawn at the crop's own size and offset; `cover` keeps it undistorted even
            // before the photo's real shape is known.
            style={{ position: "absolute", left: plan.x0, top: plan.y0, width: plan.dw, height: plan.dh, maxWidth: "none", objectFit: "cover", display: "block" }}
          />
        )}
      </div>
    );
  }
  const c = dna.colors;
  return (
    <div style={{ ...frameStyle, background: c.tint, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {quiet ? null : (
        <span style={{ fontFamily: stacks.text, fontSize: 36, fontWeight: 500, color: mix(c.ink, c.tint, 0.4) }}>התמונה בהכנה</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

/** The soft local shade behind words on a photo: from the nearest edge, or a glow. */
export function Shade({ text, H }: { text: TextPlan; H: number }) {
  const s = text.shade;
  if (!s) return null;
  const { box, color, strength: a } = s;
  const mid = box.y + box.h / 2;
  if (mid < H * 0.38 || mid > H * 0.62) {
    const fromTop = mid < H / 2;
    const reach = fromTop ? box.y + box.h : H - box.y;
    const under = Math.min(0.92, (fromTop ? box.y + box.h * 0.75 : H - box.y - box.h * 0.25) / reach);
    return (
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: fromTop ? 0 : box.y,
          height: reach,
          background: `linear-gradient(${fromTop ? "to bottom" : "to top"}, ${alpha(color, a)} 0%, ${alpha(color, a * 0.88)} ${Math.round(under * 100)}%, ${alpha(color, 0)} 100%)`,
        }}
      />
    );
  }
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: box.x - box.w * 0.15,
        top: box.y - box.h * 0.3,
        width: box.w * 1.3,
        height: box.h * 1.6,
        background: `radial-gradient(ellipse farthest-side at 50% 50%, ${alpha(color, a)} 0%, ${alpha(color, a * 0.8)} 55%, ${alpha(color, 0)} 100%)`,
      }}
    />
  );
}

function HeadlineText({ text, accent, marked }: { text: string; accent: string; marked: boolean }) {
  const segments = splitSentences(text);
  const { key } = splitKeyPhrase(text);
  const render = (seg: string, last: boolean): ReactNode => {
    if (!marked || !key || !last || !seg.endsWith(key)) return seg;
    return (
      <>
        {seg.slice(0, seg.length - key.length)}
        <span style={{ color: accent }}>{key}</span>
      </>
    );
  };
  return (
    <>
      {segments.map((seg, i) => (
        <span key={i} style={{ display: segments.length > 1 ? "block" : "inline" }}>
          {render(seg, i === segments.length - 1)}
        </span>
      ))}
    </>
  );
}

/** The words, exactly as the plan measured them. */
export function TextBlock({ text, dna, stacks }: { text: TextPlan; dna: ResolvedDna; stacks: Stacks }) {
  const { box, headline, sub, price, mark } = text;
  const center = text.align === "center";
  const display = dna.display;
  const letter = display.weight >= 800 ? "-0.015em" : display.meta.category === "hand" ? "0.01em" : "-0.005em";
  const subEl = sub ? (
    <p
      data-card-text="sub"
      style={{
        margin: 0,
        fontFamily: stacks.text,
        fontSize: sub.size,
        fontWeight: sub.weight,
        lineHeight: sub.leading,
        color: text.soft,
        textAlign: center ? "center" : stacks.direction === "ltr" ? "left" : "right",
        textWrap: "balance",
        textShadow: text.shadow,
        ...(sub.above ? { marginBottom: Math.round(text.gap * 0.7), letterSpacing: "0.01em" } : { marginTop: text.gap }),
      }}
    >
      {sub.text}
    </p>
  ) : null;
  return (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        display: "flex",
        flexDirection: "column",
        justifyContent: text.vAlign === "center" ? "center" : text.vAlign === "end" ? "flex-end" : "flex-start",
        alignItems: center ? "center" : "flex-start",
      }}
    >
      {sub?.above ? subEl : null}
      <h2
        data-card-text="headline"
        data-card-lines={headline.lines}
        style={{
          margin: 0,
          fontFamily: stacks.display,
          fontWeight: headline.weight,
          fontSize: headline.size,
          lineHeight: headline.leading,
          letterSpacing: letter,
          color: text.fg,
          textAlign: center ? "center" : stacks.direction === "ltr" ? "left" : "right",
          textWrap: "balance",
          textTransform: dna.headlineCase === "upper" ? "uppercase" : undefined,
          textShadow: text.shadow,
          maxWidth: "100%",
        }}
      >
        <HeadlineText text={headline.text} accent={text.accent} marked={headline.accentKey} />
      </h2>
      {price ? (
        <p
          data-card-text="price"
          style={{
            margin: 0,
            marginTop: Math.round(text.gap * 0.5),
            fontFamily: stacks.display,
            fontWeight: headline.weight,
            fontSize: price.size,
            lineHeight: 1.04,
            letterSpacing: "-0.01em",
            color: headline.accentKey ? text.accent : text.fg,
            textShadow: text.shadow,
            display: "flex",
            alignItems: "baseline",
            gap: Math.round(price.size * 0.12),
          }}
        >
          <span>{price.amount}</span>
          <span style={{ fontSize: Math.round(price.size * 0.56) }}>₪</span>
        </p>
      ) : null}
      {sub && !sub.above ? subEl : null}
      {mark ? (
        <span style={{ marginTop: text.gap, display: "flex", background: mark.plate, padding: mark.plate ? Math.round(mark.h * 0.25) : 0, borderRadius: 6 }}>
          <Logo src={mark.src} height={mark.h} maxWidth={Math.round(box.w * 0.5)} fallback={null} />
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The one quiet detail                                                */
/* ------------------------------------------------------------------ */

/**
 * Film or paper grain as a self-contained SVG (fractal noise), tiled. Multiplied over light
 * grounds and screened over dark ones, so it reads as print, not as a grey veil.
 */
function Grain({ box, dark }: { box: { x: number; y: number; w: number; h: number }; dark: boolean }) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${dark ? 1 : 0} 0 0 0 0 ${dark ? 1 : 0} 0 0 0 0 ${dark ? 1 : 0} 0 0 0 1.1 -0.18'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        backgroundImage: `url("data:image/svg+xml;utf8,${svg.replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E")}")`,
        backgroundSize: "320px 320px",
        opacity: 0.18,
        pointerEvents: "none",
      }}
    />
  );
}

export function Motif({ motif }: { motif: MotifPlan }) {
  if (motif.kind === "grain") return <Grain box={motif.box} dark={motif.dark} />;
  return <div aria-hidden style={{ position: "absolute", left: motif.x, top: motif.y - motif.thickness / 2, width: motif.w, height: motif.thickness, background: motif.color }} />;
}
