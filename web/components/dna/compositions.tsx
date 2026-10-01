"use client";

/**
 * The twelve compositions. Each is a real layout at 4:5, 1:1 and 9:16, drawn at the card's
 * true pixel size (1080 wide) from the DNA: its type, colours, motif, signature and copy
 * treatment. A composition decides where things go; the DNA decides what they look like.
 *
 * Coordinates are px in the card's own space. The card is RTL, so "start" is the right edge.
 */

import type { CSSProperties, ReactNode } from "react";
import { contrastRatio } from "@/lib/cardTokens";
import type { CompositionKey, MotifKey } from "@/lib/dna/library";
import { isLight, mix } from "@/lib/dna/resolve";
import { inksFor, type CardCtx, type Ground } from "./context";
import { MotifSlots, NestedArches, ScallopRosette, StripeBlock, DotField, Scallops, Tape, Grain, type MotifPaint, type MotifPlace } from "./motifs";
import { Cta, Headline, headlineMax, Kicker, Photo, PriceMark, Stat, TextBlock, InlinePrice } from "./parts";
import { SignatureSlot, signatureTopReach, StampSeal, type SigCorner } from "./Signature";

type Place = MotifPlace & { kinds?: MotifKey[] };

/** The motif paint for a ground: the DNA's motif colour on paper, a readable one elsewhere. */
function paintOn(ctx: CardCtx, ground: Ground): MotifPaint {
  const c = ctx.c;
  const bg = inksFor(ctx, ground).bg;
  let color = ctx.motif.color;
  if (ground === "photo") color = contrastRatio(c.accent, c.scrim) >= 2.2 ? c.accent : c.onPhoto;
  else if (contrastRatio(color, bg) < 1.5) color = inksFor(ctx, ground).accent;
  const alt = ground === "photo" ? c.onPhoto : bg === c.paper ? c.paper : c.paper;
  return { ...ctx.motif, color, alt, paper: c.paper };
}

function Motifs({ ctx, ground, places }: { ctx: CardCtx; ground: Ground; places: Place[] }) {
  const kind = ctx.dna.motif.kind;
  const usable = places.filter((p) => !p.kinds || p.kinds.includes(kind));
  return <MotifSlots paint={paintOn(ctx, ground)} places={usable} />;
}

const layer = (ctx: CardCtx, extra?: CSSProperties): CSSProperties => ({
  position: "absolute",
  left: 0,
  top: 0,
  width: ctx.W,
  height: ctx.H,
  overflow: "hidden",
  ...extra,
});

/** A divider in the DNA's motif language: a stitch, a dotted line, scallops, or a hairline. */
function Rule({ ctx, color, width, style }: { ctx: CardCtx; color: string; width: number | string; style?: CSSProperties }) {
  const kind = ctx.dna.motif.kind;
  const base: CSSProperties = { width, flexShrink: 0, ...style };
  if (kind === "thread") return <div style={{ ...base, borderTop: `3px dashed ${color}` }} />;
  if (kind === "dots") return <div style={{ ...base, height: 6, backgroundImage: `radial-gradient(circle, ${color} 2.6px, transparent 3px)`, backgroundSize: "16px 6px", backgroundRepeat: "repeat-x" }} />;
  if (kind === "stripes") return <div style={{ ...base, height: 10, background: `repeating-linear-gradient(90deg, ${color} 0 12px, transparent 12px 24px)` }} />;
  if (kind === "scalloped_edge")
    return <div style={{ ...base, height: 10, backgroundImage: `radial-gradient(circle at 50% 100%, transparent 6px, ${color} 6.5px, ${color} 8.5px, transparent 9px)`, backgroundSize: "18px 10px", backgroundRepeat: "repeat-x" }} />;
  return <div style={{ ...base, height: 2, background: color }} />;
}

/** The scrim behind text on a photo, in the DNA's own colour, only where the text is. */
function Scrim({ ctx, side, reach = 0.6, strength = 0.82 }: { ctx: CardCtx; side: "top" | "bottom" | "both"; reach?: number; strength?: number }) {
  const s = ctx.c.scrim;
  const rgba = (a: number) => {
    const h = s.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };
  const grad = (dir: string) =>
    `linear-gradient(${dir}, ${rgba(strength)} 0%, ${rgba(strength * 0.72)} ${reach * 38}%, ${rgba(strength * 0.25)} ${reach * 72}%, ${rgba(0)} ${reach * 100}%)`;
  const bg = side === "both" ? `${grad("to top")}, ${grad("to bottom")}` : grad(side === "bottom" ? "to top" : "to bottom");
  return <div aria-hidden style={{ position: "absolute", inset: 0, background: bg }} />;
}

/** True when the price is drawn as an object (sticker or tag) rather than in the text. */
function priceObject(ctx: CardCtx): boolean {
  return Boolean(ctx.words.price) && ctx.dna.copy.price !== "inline";
}

/** The ground a panel uses, by the DNA's scale: bold DNAs set panels in their accent. */
function panelGround(ctx: CardCtx): Ground {
  if (ctx.dna.scale === "large" && contrastRatio(ctx.c.onAccent, ctx.c.accent) >= 4.5) return "accent";
  if (ctx.dna.scale === "medium") return "tint";
  return "paper";
}

/* ------------------------------------------------------------------ */
/* 1. full_bleed                                                       */
/* ------------------------------------------------------------------ */

function FullBleed(ctx: CardCtx) {
  const { W, H, pad: P, safeTop: ST, safeBottom: SB } = ctx;
  const top = ctx.textPos === "top";
  const center = ctx.textPos === "center";
  const blockW = W - P * 2;
  const blockStyle: CSSProperties = center
    ? { position: "absolute", right: P, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center" }
    : top
      ? { position: "absolute", right: P, top: Math.max(P + ST, signatureTopReach(ctx, "bottom-start")) }
      : { position: "absolute", right: P, bottom: P + SB };
  return (
    <div style={layer(ctx)}>
      <Photo ctx={ctx} />
      <Scrim ctx={ctx} side={center ? "both" : top ? "top" : "bottom"} reach={ctx.format === "square" ? 0.72 : 0.62} />
      <Motifs
        ctx={ctx}
        ground="photo"
        places={[
          { role: "frame", box: { x: 0, y: 0, w: W, h: H }, radius: 0, ground: ctx.c.scrim, inset: 30, kinds: ["thread", "scalloped_edge"] },
          { role: "corner", x: 0, y: top ? H : 0, size: 300, corner: top ? "bottom-end" : "top-end", ground: ctx.c.scrim, kinds: ["dots", "arches", "stripes", "tape"] },
          { role: "texture", box: { x: 0, y: 0, w: W, h: H }, ground: ctx.c.scrim },
        ]}
      />
      <div style={blockStyle}>
        <TextBlock ctx={ctx} ground="photo" width={blockW} headlineHeight={H * (ctx.format === "square" ? 0.3 : 0.32)} headlineFactor={1.05} maxLines={3} />
      </div>
      {priceObject(ctx) ? <PriceMark ctx={ctx} price={ctx.words.price} x={P + 120} y={top ? H - P - SB - 120 : P + ST + 150} /> : null}
      <SignatureSlot ctx={ctx} at={top ? "bottom-start" : "top-start"} ground="photo" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. inset_frame                                                      */
/* ------------------------------------------------------------------ */

function InsetFrame(ctx: CardCtx) {
  const { W, H, pad: P, safeTop: ST, safeBottom: SB, format } = ctx;
  const m = Math.round(P * 0.72);
  const top = ctx.textPos === "top";
  // Set at the top, the words start below a tab hanging there, and the photo gives way.
  const reach = top ? signatureTopReach(ctx, ctx.dna.signature.kind === "corner_mark" ? "bottom-end" : "top-start", true) : 0;
  const giveWay = Math.max(0, reach - (P + ST)) + (reach > P + ST && ctx.words.stat ? 70 : 0);
  const photoH = Math.round(H * (format === "story" ? 0.54 : format === "square" ? 0.56 : 0.6)) - giveWay;
  const photo = { x: m, y: top ? H - m - SB - photoH : m + ST, w: W - m * 2, h: photoH };
  const r = ctx.radius("m");
  const textTop = top ? Math.max(P + ST, reach) : photo.y + photo.h + P * 0.62;
  const textBottom = top ? photo.y - P * 0.55 : H - P - SB;
  const sigAt: SigCorner = "bottom-end";
  const sigOnText = ctx.dna.signature.kind === "corner_mark";
  return (
    <div style={layer(ctx, { background: ctx.c.paper })}>
      <div style={{ position: "absolute", left: photo.x, top: photo.y, width: photo.w, height: photo.h, borderRadius: r, overflow: "hidden" }}>
        <Photo ctx={ctx} />
      </div>
      <Motifs
        ctx={ctx}
        ground="paper"
        places={[
          { role: "frame", box: photo, radius: r, ground: ctx.c.paper, inset: 22, kinds: ["thread", "tape", "dots", "scalloped_edge"] },
          { role: "seam", x: photo.x, y: top ? photo.y : photo.y + photo.h, w: photo.w, into: top ? "up" : "down", fill: ctx.c.paper, ground: ctx.c.paper, kinds: ["stripes", "arches"] },
          { role: "corner", x: 0, y: H, size: 260, corner: "bottom-end", ground: ctx.c.paper, kinds: ["dots"] },
          { role: "texture", box: { x: 0, y: 0, w: W, h: H }, ground: ctx.c.paper },
        ]}
      />
      <div style={{ position: "absolute", right: P, top: textTop, height: textBottom - textTop, width: W - P * 2, display: "flex", flexDirection: "column", justifyContent: top ? "flex-end" : "flex-start" }}>
        <TextBlock
          ctx={ctx}
          ground="paper"
          width={sigOnText ? W - P * 2 : W - P * 2}
          headlineHeight={Math.max(120, (textBottom - textTop) * 0.46)}
          headlineFactor={0.82}
          maxLines={3}
          compact={format === "square"}
          show={{ stat: format !== "square" && textBottom - textTop > 340 }}
        />
      </div>
      {priceObject(ctx) ? <PriceMark ctx={ctx} price={ctx.words.price} x={photo.x + 150} y={top ? photo.y + 30 : photo.y + photo.h - 30} d={180} ground="paper" /> : null}
      <SignatureSlot
        ctx={ctx}
        at={ctx.dna.signature.kind === "corner_mark" ? sigAt : "top-start"}
        ground={ctx.dna.signature.kind === "corner_mark" ? "paper" : "photo"}
        stampAt={{ x: photo.x + photo.w - 70, y: top ? photo.y + photo.h - 60 : photo.y + photo.h - 40, ground: "photo" }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. split                                                            */
/* ------------------------------------------------------------------ */

function Split(ctx: CardCtx) {
  const { W, H, pad: P, safeTop: ST, safeBottom: SB, format } = ctx;
  const ground = panelGround(ctx);
  const inks = inksFor(ctx, ground);
  const photoShare = format === "story" ? 0.54 : format === "square" ? 0.5 : 0.56;
  const top = ctx.textPos === "top";
  const photoH = Math.round(H * photoShare);
  const seam = top ? H - photoH : photoH;
  const panel = top ? { y: 0, h: seam } : { y: seam, h: H - seam };
  const padTop = top ? Math.max(P + ST, signatureTopReach(ctx, "bottom-start", true)) : P * 0.9;
  const padBottom = top ? P * 0.9 : P + SB;
  return (
    <div style={layer(ctx, { background: inks.bg })}>
      <div style={{ position: "absolute", left: 0, top: top ? seam : 0, width: W, height: photoH, overflow: "hidden" }}>
        <Photo ctx={ctx} />
      </div>
      <div style={{ position: "absolute", left: 0, top: panel.y, width: W, height: panel.h, background: inks.bg }} />
      <Motifs
        ctx={ctx}
        ground={ground}
        places={[
          { role: "seam", x: 0, y: seam, w: W, into: top ? "down" : "up", fill: inks.bg, ground: inks.bg, kinds: ["scalloped_edge", "stripes", "arches", "dots", "thread", "tape"] },
          { role: "texture", box: { x: 0, y: panel.y, w: W, h: panel.h }, ground: inks.bg },
          { role: "corner", x: 0, y: top ? 0 : H, size: 240, corner: top ? "top-end" : "bottom-end", ground: inks.bg, kinds: ["dots", "arches"] },
        ]}
      />
      <div style={{ position: "absolute", right: P, top: panel.y + padTop, height: panel.h - padTop - padBottom, width: W - P * 2, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <TextBlock ctx={ctx} ground={ground} width={W - P * 2} headlineHeight={(panel.h - padTop - padBottom) * 0.56} headlineFactor={0.9} maxLines={3} compact={format === "square"} show={{ stat: format !== "square" }} />
      </div>
      {priceObject(ctx) ? <PriceMark ctx={ctx} price={ctx.words.price} x={W - P - 110} y={seam} d={190} ground={ground} /> : null}
      <SignatureSlot
        ctx={ctx}
        at={top ? "bottom-start" : "top-start"}
        ground="photo"
        stampAt={{ x: P + 110, y: seam, ground }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. type_led                                                         */
/* ------------------------------------------------------------------ */

function TypeLed(ctx: CardCtx) {
  const { W, H, pad: P, safeTop: ST, safeBottom: SB, format } = ctx;
  const ground: Ground = ctx.dna.scale !== "editorial" && contrastRatio(ctx.c.onAccent, ctx.c.accent) >= 4.5 ? "accent" : "paper";
  const inks = inksFor(ctx, ground);
  const cat = ctx.dna.display.meta.category;
  const align = cat === "hand" || cat === "rounded" ? "center" : "start";
  const P2 = Math.round(P * 1.1);
  const sigH = ctx.dna.signature.kind === "tab" ? 210 : 110;
  const top = P2 + ST + sigH;
  const bottom = H - P2 - SB;
  const paint = paintOn(ctx, ground);
  const kind = ctx.dna.motif.kind;
  const hero: ReactNode =
    kind === "arches" ? (
      <NestedArches cx={align === "center" ? W / 2 : P2 + 200} base={H} r={format === "square" ? 300 : 380} rings={5} gap={format === "square" ? 52 : 64} color={paint.color} stroke={26} />
    ) : kind === "dots" ? (
      <DotField box={{ x: 0, y: H - 560, w: 560, h: 560 }} step={40} rMax={15} color={paint.color} from="bottom-end" />
    ) : kind === "stripes" ? (
      <StripeBlock box={{ x: 0, y: 0, w: W, h: 64 + ST }} a={paint.color} b={inks.bg} stripe={44} />
    ) : kind === "scalloped_edge" ? (
      <>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 90, background: ground === "accent" ? ctx.c.paper : ctx.c.accent }} />
        <Scallops x={0} y={H - 90} w={W} r={30} color={ground === "accent" ? ctx.c.paper : ctx.c.accent} into="up" />
      </>
    ) : kind === "thread" ? (
      <MotifSlots paint={paint} places={[{ role: "frame", box: { x: 0, y: 0, w: W, h: H }, radius: ctx.radius("l"), ground: inks.bg, inset: 36 }]} />
    ) : kind === "tape" ? (
      <>
        <Tape cx={W - 120} cy={60 + ST} w={220} h={60} rotate={28} color={ctx.c.accent2} />
        <Tape cx={120} cy={H - 60 - SB} w={220} h={60} rotate={28} color={ctx.c.accent2} />
      </>
    ) : kind === "grain" ? (
      <Grain box={{ x: 0, y: 0, w: W, h: H }} strength={0.24} dark={!isLight(inks.bg)} />
    ) : null;
  const bottomBand = kind === "scalloped_edge" ? 120 : 0;
  return (
    <div style={layer(ctx, { background: inks.bg })}>
      {hero}
      <div style={{ position: "absolute", right: P2, left: P2, top, bottom: H - bottom + bottomBand, display: "flex", flexDirection: "column", justifyContent: ctx.textPos === "top" ? "flex-start" : ctx.textPos === "bottom" ? "flex-end" : "center" }}>
        <TextBlock ctx={ctx} ground={ground} width={W - P2 * 2} headlineHeight={(bottom - top - bottomBand) * 0.62} headlineFactor={(format === "square" ? 1.2 : 1.32) * (ctx.dna.scale === "editorial" ? 1.25 : 1)} maxLines={4} align={align} />
      </div>
      {priceObject(ctx) ? <PriceMark ctx={ctx} price={ctx.words.price} x={P2 + 120} y={top + 40} d={200} ground={ground} /> : null}
      <SignatureSlot ctx={ctx} at="top-start" ground={ground} stampAt={{ x: P2 + 110, y: P2 + ST + 100, ground }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5. stacked_bands                                                    */
/* ------------------------------------------------------------------ */

function StackedBands(ctx: CardCtx) {
  const { W, H, pad: P, safeTop: ST, safeBottom: SB, format } = ctx;
  // `top` (the library's default): the headline band crosses the top and a thin band of the
  // accent the bottom. `bottom`: the accent band on top, the headline band under the photo.
  const headTop = ctx.textPos === "top";
  const thin = Math.round(0.15 * H);
  const thick = Math.round((format === "square" ? 0.36 : format === "story" ? 0.3 : 0.34) * H);
  const topH = headTop ? thick + ST : thin + ST;
  const bottomH = headTop ? thin + SB : thick + SB;
  const photoY = topH;
  const photoH = H - topH - bottomH;
  const bandGround: Ground = "accent";
  const headGround: Ground = isLight(ctx.c.paper) ? "paper" : "ink";
  const bandInks = inksFor(ctx, bandGround);
  const headInks = inksFor(ctx, headGround);
  const topInks = headTop ? headInks : bandInks;
  const bottomInks = headTop ? bandInks : headInks;
  const kicker = ctx.words.kicker || ctx.words.stat;
  const sig = ctx.dna.signature.kind;
  // Room the signature takes at the top-end corner, which the top band's text keeps clear of.
  const sigRoom = sig === "corner_mark" ? 300 : sig === "tab" ? 250 : 0;
  const kickerBand = (y: number, h: number, padTop: number, padBottom: number) => (
    <div style={{ position: "absolute", right: P, left: P + (headTop ? 0 : sigRoom), top: y + padTop, height: h - padTop - padBottom, display: "flex", alignItems: "center" }}>
      {kicker ? (
        <span style={{ fontFamily: ctx.displayStack, fontWeight: ctx.dna.display.weight, fontSize: format === "square" ? 46 : 52, lineHeight: 1.05, color: bandInks.fg, textWrap: "balance" }}>{kicker}</span>
      ) : null}
    </div>
  );
  const headBand = (y: number, h: number, padTop: number, padBottom: number) => (
    <div style={{ position: "absolute", right: P, top: y + padTop, height: h - padTop - padBottom, width: W - P * 2 - (headTop ? sigRoom : 0), display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <TextBlock
        ctx={ctx}
        ground={headGround}
        width={W - P * 2 - (headTop ? sigRoom : 0)}
        headlineHeight={(h - padTop - padBottom) * 0.58}
        headlineFactor={0.95}
        maxLines={2}
        show={{ kicker: false, stat: Boolean(ctx.words.kicker) && format !== "square" }}
        compact={format === "square"}
      />
    </div>
  );
  return (
    <div style={layer(ctx, { background: bottomInks.bg })}>
      <div style={{ position: "absolute", left: 0, top: photoY, width: W, height: photoH, overflow: "hidden" }}>
        <Photo ctx={ctx} />
      </div>
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: topH, background: topInks.bg }} />
      <div style={{ position: "absolute", left: 0, top: photoY + photoH, width: W, height: bottomH, background: bottomInks.bg }} />
      <Motifs
        ctx={ctx}
        ground={headTop ? headGround : bandGround}
        places={[{ role: "seam", x: 0, y: topH, w: W, into: "down", fill: topInks.bg, ground: topInks.bg, kinds: ["scalloped_edge", "arches", "stripes", "dots", "thread"] }]}
      />
      <Motifs
        ctx={ctx}
        ground={headTop ? bandGround : headGround}
        places={[
          { role: "seam", x: 0, y: photoY + photoH, w: W, into: "up", fill: bottomInks.bg, ground: bottomInks.bg, kinds: ["scalloped_edge", "tape", "thread", ...(headTop ? (["stripes", "arches", "dots"] as MotifKey[]) : [])] },
          { role: "texture", box: { x: 0, y: 0, w: W, h: H }, ground: headInks.bg },
        ]}
      />
      {headTop ? (
        <>
          {headBand(0, topH, ST + P * 0.6, P * 0.6)}
          {kickerBand(photoY + photoH, bottomH, 0, SB)}
        </>
      ) : (
        <>
          {kickerBand(0, topH, ST, 0)}
          {headBand(photoY + photoH, bottomH, P * 0.7, P * 0.7 + SB)}
        </>
      )}
      {priceObject(ctx) ? <PriceMark ctx={ctx} price={ctx.words.price} x={P + 120} y={headTop ? photoY + 40 : photoY + photoH - 40} d={190} ground="photo" /> : null}
      <SignatureSlot
        ctx={ctx}
        at="top-end"
        ground={headTop ? headGround : bandGround}
        stampAt={{ x: W - P - 100, y: headTop ? photoY : photoY + photoH, ground: "photo" }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6. corner_tab                                                       */
/* ------------------------------------------------------------------ */

function CornerTab(ctx: CardCtx) {
  const { W, H, pad: P, safeTop: ST, safeBottom: SB, format } = ctx;
  const ground = panelGround(ctx) === "tint" ? "paper" : panelGround(ctx);
  const inks = inksFor(ctx, ground);
  const top = ctx.textPos === "top";
  const tabW = Math.round(W * (format === "square" ? 0.74 : 0.8));
  const tabH = Math.round(H * (format === "square" ? 0.46 : format === "story" ? 0.36 : 0.42)) + (top ? ST : SB);
  const y = top ? 0 : H - tabH;
  const R = ctx.dna.shape === "sharp" ? 0 : ctx.dna.shape === "round" ? 120 : 48;
  const clip =
    ctx.dna.shape === "sharp"
      ? top
        ? `polygon(0 0, 100% 0, 100% 100%, 90px 100%, 0 calc(100% - 90px))`
        : `polygon(90px 0, 100% 0, 100% 100%, 0 100%, 0 90px)`
      : undefined;
  const radius = top ? `0 0 0 ${R}px` : `${R}px 0 0 0`;
  const innerP = P * 0.86;
  // Set at the top, the panel's words start below a tab hanging over it.
  const contentTop = top ? Math.max(innerP + ST, signatureTopReach(ctx, "bottom-end", true)) : innerP;
  return (
    <div style={layer(ctx)}>
      <Photo ctx={ctx} />
      <div style={{ position: "absolute", right: 0, top: y, width: tabW, height: tabH, background: inks.bg, borderRadius: clip ? 0 : radius, clipPath: clip, overflow: "hidden" }}>
        <Motifs ctx={ctx} ground={ground} places={[{ role: "texture", box: { x: 0, y: 0, w: tabW, h: tabH }, ground: inks.bg }, { role: "corner", x: 0, y: top ? 0 : tabH, size: 200, corner: top ? "top-end" : "bottom-end", ground: inks.bg, kinds: ["dots", "arches"] }]} />
      </div>
      <Motifs
        ctx={ctx}
        ground={ground}
        places={[
          { role: "seam", x: W - tabW + R, y: top ? tabH : y, w: tabW - R, into: top ? "down" : "up", fill: inks.bg, ground: inks.bg, kinds: ["scalloped_edge", "stripes", "thread", "tape"] },
          { role: "corner", x: 0, y: top ? H : 0, size: 280, corner: top ? "bottom-end" : "top-end", ground: ctx.c.scrim, kinds: ["stripes"] },
        ]}
      />
      <div
        style={{
          position: "absolute",
          right: innerP,
          top: y + contentTop,
          height: tabH - contentTop - (top ? innerP : innerP + SB),
          width: tabW - innerP * 2,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <TextBlock ctx={ctx} ground={ground} width={tabW - innerP * 2} headlineHeight={(tabH - innerP * 2 - (top ? ST : SB)) * 0.56} headlineFactor={0.9} maxLines={3} compact show={{ stat: format === "story" }} />
      </div>
      {priceObject(ctx) ? <PriceMark ctx={ctx} price={ctx.words.price} x={W - tabW + 30} y={top ? tabH : y} d={180} ground="photo" /> : null}
      <SignatureSlot ctx={ctx} at={top ? "bottom-end" : "top-end"} ground="photo" stampAt={{ x: P + 120, y: top ? H - P - SB - 120 : P + ST + 120, ground: "photo" }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 7. arch_window                                                      */
/* ------------------------------------------------------------------ */

function ArchWindow(ctx: CardCtx) {
  const { W, H, pad: P, safeTop: ST, safeBottom: SB, format } = ctx;
  const ground: Ground = ctx.dna.scale === "editorial" ? "paper" : "tint";
  const inks = inksFor(ctx, ground);
  const aw = Math.round(W * (format === "square" ? 0.4 : format === "story" ? 0.7 : 0.62));
  const ah = Math.round(H * (format === "square" ? 0.66 : format === "story" ? 0.42 : 0.56));
  const top = ctx.textPos === "top";
  const square = format === "square";
  // On a square card the arch stands at the end side and the text beside it.
  const ax = square ? P : (W - aw) / 2;
  const ay = square ? (H - ah) / 2 + 30 : top ? H - P - SB - ah : P + ST + (ctx.dna.signature.kind === "tab" ? 110 : 30);
  const r = aw / 2;
  const kind = ctx.dna.motif.kind;
  const archPath = (o: number) => `M${ax - o} ${ay + ah + o} V${ay + r} A${r + o} ${r + o} 0 0 1 ${ax + aw + o} ${ay + r} V${ay + ah + o}`;
  const outline = kind === "thread" ? { dash: "16 11", width: 3 } : kind === "dots" ? { dash: "0.1 16", width: 7 } : { dash: undefined, width: 3 };
  const textBox = square
    ? { right: P, top: P + ST, bottom: P + SB, width: W - aw - P * 2 - 56 }
    : top
      ? { right: P, top: Math.max(P + ST, signatureTopReach(ctx, "top-start", true)), bottom: H - ay + P * 0.5, width: W - P * 2 }
      : { right: P, top: ay + ah + P * 0.6, bottom: P + SB, width: W - P * 2 };
  const textH = H - textBox.top - textBox.bottom;
  return (
    <div style={layer(ctx, { background: inks.bg })}>
      {kind === "arches" ? <NestedArches cx={ax + aw / 2} base={ay + r} r={r + 130} rings={3} gap={40} color={mix(inks.accent, inks.bg, 0.55)} stroke={3} /> : null}
      <div style={{ position: "absolute", left: ax, top: ay, width: aw, height: ah, borderRadius: `${r}px ${r}px 0 0`, overflow: "hidden" }}>
        <Photo ctx={ctx} />
      </div>
      <svg aria-hidden width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <path d={archPath(20)} fill="none" stroke={inks.accent} strokeWidth={outline.width} strokeDasharray={outline.dash} strokeLinecap="round" />
      </svg>
      <Motifs
        ctx={ctx}
        ground={ground}
        places={[
          { role: "seam", x: ax, y: ay + ah, w: aw, into: "up", fill: inks.bg, ground: inks.bg, kinds: ["scalloped_edge"] },
          { role: "frame", box: { x: ax, y: ay, w: aw, h: ah }, radius: 0, ground: inks.bg, kinds: ["tape"] },
          { role: "corner", x: 0, y: square ? H : 0, size: 260, corner: square ? "bottom-end" : "top-end", ground: inks.bg, kinds: ["dots", "stripes"] },
          { role: "texture", box: { x: 0, y: 0, w: W, h: H }, ground: inks.bg },
        ]}
      />
      <div style={{ position: "absolute", right: textBox.right, top: textBox.top, height: textH, width: textBox.width, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <TextBlock ctx={ctx} ground={ground} width={textBox.width} headlineHeight={textH * (square ? 0.52 : 0.5)} headlineFactor={square ? 0.78 : 0.85} maxLines={3} align={square ? "start" : "center"} compact={square} show={{ stat: !square || !ctx.words.kicker }} />
      </div>
      {priceObject(ctx) ? <PriceMark ctx={ctx} price={ctx.words.price} x={ax + aw - 10} y={ay + r * 0.55} d={178} ground={ground} /> : null}
      <SignatureSlot ctx={ctx} at="top-start" ground={ground} stampAt={{ x: ax + 40, y: ay + ah - 50, ground: "photo" }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 8. circle_crop                                                      */
/* ------------------------------------------------------------------ */

function CircleCrop(ctx: CardCtx) {
  const { W, H, pad: P, safeTop: ST, safeBottom: SB, format } = ctx;
  const ground: Ground = ctx.dna.scale === "editorial" ? "paper" : "tint";
  const inks = inksFor(ctx, ground);
  const square = format === "square";
  const D = Math.round(W * (square ? 0.5 : format === "story" ? 0.72 : 0.7));
  const top = ctx.textPos === "top";
  const cx = square ? P + D / 2 - 20 : W / 2;
  const cy = square ? H / 2 : top ? H - P - SB - D / 2 - 10 : P + ST + D / 2 + (ctx.dna.signature.kind === "tab" ? 120 : 40);
  const kind = ctx.dna.motif.kind;
  const ring = kind === "scalloped_edge" ? 84 : kind === "arches" ? 30 : 26;
  const textBox = square
    ? { right: P, top: P + ST, bottom: P + SB, width: W - D - P * 2 - 40 - ring }
    : top
      ? { right: P, top: Math.max(P + ST, signatureTopReach(ctx, "top-start", true)), bottom: H - (cy - D / 2) + P * 0.4 + ring, width: W - P * 2 }
      : { right: P, top: cy + D / 2 + P * 0.45 + ring, bottom: P + SB, width: W - P * 2 };
  const textH = H - textBox.top - textBox.bottom;
  return (
    <div style={layer(ctx, { background: inks.bg })}>
      {kind === "scalloped_edge" ? <ScallopRosette cx={cx} cy={cy} r={D / 2 + 34} color={ctx.c.accent} /> : null}
      {kind === "arches" ? <NestedArches cx={cx} base={cy} r={D / 2 + 96} rings={3} gap={30} color={mix(inks.accent, inks.bg, 0.25)} stroke={3} /> : null}
      {kind === "dots" ? <DotField box={{ x: cx - D / 2 - 90, y: cy - D / 2 - 60, w: D * 0.62, h: D * 0.62 }} step={30} rMax={9} color={paintOn(ctx, ground).color} from="top-end" /> : null}
      <div style={{ position: "absolute", left: cx - D / 2, top: cy - D / 2, width: D, height: D, borderRadius: "50%", overflow: "hidden" }}>
        <Photo ctx={ctx} />
      </div>
      {kind === "thread" ? (
        <svg aria-hidden width={D + 60} height={D + 60} viewBox={`0 0 ${D + 60} ${D + 60}`} style={{ position: "absolute", left: cx - D / 2 - 30, top: cy - D / 2 - 30 }}>
          <circle cx={(D + 60) / 2} cy={(D + 60) / 2} r={D / 2 + 18} fill="none" stroke={inks.accent} strokeWidth={3} strokeDasharray="16 11" strokeLinecap="round" />
        </svg>
      ) : kind !== "scalloped_edge" && kind !== "arches" ? (
        <div aria-hidden style={{ position: "absolute", left: cx - D / 2 - 18, top: cy - D / 2 - 18, width: D + 36, height: D + 36, borderRadius: "50%", border: `2.5px solid ${mix(inks.accent, inks.bg, 0.2)}` }} />
      ) : null}
      <Motifs
        ctx={ctx}
        ground={ground}
        places={[
          { role: "corner", x: 0, y: H, size: 300, corner: "bottom-end", ground: inks.bg, kinds: ["stripes"] },
          { role: "frame", box: { x: cx - D * 0.36, y: cy - D * 0.36, w: D * 0.72, h: D * 0.72 }, radius: 0, ground: inks.bg, kinds: ["tape"] },
          { role: "texture", box: { x: 0, y: 0, w: W, h: H }, ground: inks.bg },
        ]}
      />
      <div style={{ position: "absolute", right: textBox.right, top: textBox.top, height: textH, width: textBox.width, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <TextBlock ctx={ctx} ground={ground} width={textBox.width} headlineHeight={textH * 0.55} headlineFactor={square ? 0.76 : 0.88} maxLines={3} align={square ? "start" : "center"} compact={square} show={{ stat: !square }} />
      </div>
      {priceObject(ctx) ? <PriceMark ctx={ctx} price={ctx.words.price} x={cx + D * 0.37} y={cy + D * 0.33} d={176} ground={ground} /> : null}
      <SignatureSlot ctx={ctx} at={square ? "top-start" : "top-start"} ground={ground} stampAt={{ x: cx - D * 0.36, y: cy + D * 0.36, ground }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 9. ticket                                                           */
/* ------------------------------------------------------------------ */

function Ticket(ctx: CardCtx) {
  const { W, H, pad: P, safeTop: ST, safeBottom: SB, format } = ctx;
  const c = ctx.c;
  const m = Math.round(P * 0.8);
  const tw = W - m * 2;
  const square = format === "square";
  const th = Math.round(H * (square ? 0.62 : format === "story" ? 0.42 : 0.5));
  const top = ctx.textPos === "top";
  const tx = m;
  const ty = top ? m + ST + (ctx.dna.signature.kind === "tab" ? 150 : 0) : H - th - m - SB;
  const stubH = Math.round(th * (square ? 0.3 : 0.28));
  const notchY = th - stubH;
  const nr = 34;
  const r = ctx.dna.shape === "sharp" ? 6 : ctx.dna.shape === "round" ? 34 : 18;
  const shape = `M${r} 0 H${tw - r} Q${tw} 0 ${tw} ${r} V${notchY - nr} A${nr} ${nr} 0 0 0 ${tw} ${notchY + nr} V${th - r} Q${tw} ${th} ${tw - r} ${th} H${r} Q0 ${th} 0 ${th - r} V${notchY + nr} A${nr} ${nr} 0 0 0 0 ${notchY - nr} V${r} Q0 0 ${r} 0 Z`;
  const ticketGround: Ground = "paper";
  const inks = inksFor(ctx, ticketGround);
  const innerP = Math.round(P * 0.72);
  const stubWords = ctx.words;
  const hasPhoto = Boolean(ctx.photo.url);
  return (
    <div style={layer(ctx, { background: c.accent2 })}>
      {hasPhoto ? <Photo ctx={ctx} /> : <Motifs ctx={ctx} ground="accent2" places={[{ role: "texture", box: { x: 0, y: 0, w: W, h: H }, ground: c.accent2 }, { role: "corner", x: 0, y: 0, size: 420, corner: "top-end", ground: c.accent2 }]} />}
      {hasPhoto ? <Scrim ctx={ctx} side={top ? "top" : "bottom"} reach={0.5} strength={0.5} /> : null}
      <div style={{ position: "absolute", left: tx, top: ty, width: tw, height: th, filter: "drop-shadow(0 18px 28px rgba(0,0,0,0.18))" }}>
        <svg aria-hidden width={tw} height={th} viewBox={`0 0 ${tw} ${th}`} style={{ position: "absolute", inset: 0 }}>
          <path d={shape} fill={c.paper} />
          <line x1={nr + 14} y1={notchY} x2={tw - nr - 14} y2={notchY} stroke={mix(c.ink, c.paper, 0.55)} strokeWidth={3} strokeDasharray="2 12" strokeLinecap="round" />
        </svg>
        <Motifs
          ctx={ctx}
          ground={ticketGround}
          places={[
            { role: "band", box: { x: r, y: 0, w: tw - r * 2, h: 26 }, ground: c.paper, kinds: ["stripes", "dots"] },
            { role: "frame", box: { x: 0, y: 0, w: tw, h: notchY }, radius: r, ground: c.paper, inset: 18, kinds: ["thread", "tape"] },
            { role: "texture", box: { x: 0, y: 0, w: tw, h: th }, ground: c.paper },
            { role: "corner", x: 0, y: 0, size: 160, corner: "top-end", ground: c.paper, kinds: ["arches", "scalloped_edge"] },
          ]}
        />
        <div style={{ position: "absolute", right: innerP, left: innerP, top: innerP * 0.95 + 10, height: notchY - innerP * 1.9 - 10, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <TextBlock ctx={ctx} ground={ticketGround} width={tw - innerP * 2} headlineHeight={(notchY - innerP * 2) * 0.66} headlineFactor={0.86} maxLines={3} show={{ cta: false, stat: false, price: false }} compact={square} />
        </div>
        <div style={{ position: "absolute", right: innerP, left: innerP, top: notchY + 8, height: stubH - 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
          <div style={{ minWidth: 0, display: "flex", alignItems: "center" }}>
            {stubWords.price && ctx.dna.copy.price === "inline" ? (
              <InlinePrice ctx={ctx} inks={inks} price={stubWords.price} size={square ? 54 : 62} />
            ) : stubWords.stat ? (
              <Stat ctx={ctx} inks={inks} text={stubWords.stat} size={square ? 30 : 34} />
            ) : null}
          </div>
          {stubWords.cta ? <Cta ctx={ctx} inks={inks} text={stubWords.cta} size={square ? 27 : 30} /> : null}
        </div>
      </div>
      {priceObject(ctx) ? <PriceMark ctx={ctx} price={ctx.words.price} x={tx + 130} y={ty} d={176} ground="photo" /> : null}
      <SignatureSlot ctx={ctx} at={top ? "bottom-start" : "top-start"} ground={hasPhoto ? "photo" : "accent2"} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 10. collage_grid                                                    */
/* ------------------------------------------------------------------ */

function CollageGrid(ctx: CardCtx) {
  const { W, H, pad: P, safeTop: ST, safeBottom: SB, format } = ctx;
  const c = ctx.c;
  const M = Math.round(P * 0.5);
  const G = 14;
  const r = ctx.radius("s");
  const textGround = panelGround(ctx);
  const tInks = inksFor(ctx, textGround);
  const kind = ctx.dna.motif.kind;
  const crop = ctx.photo.crop;
  const detail = (dx: number, dy: number, z: number) => ({ focus: { x: Math.min(1, Math.max(0, crop.x + dx)), y: Math.min(1, Math.max(0, crop.y + dy)) }, zoomBoost: z });
  // One tile can carry the motif itself, when the motif is a pattern.
  const motifTile = kind === "stripes" || kind === "dots" || kind === "arches" || kind === "scalloped_edge";
  const tileStyle = (b: { x: number; y: number; w: number; h: number }): CSSProperties => ({ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, borderRadius: r, overflow: "hidden" });
  const motifPaint = paintOn(ctx, "tint");
  const motifTileAt = (b: { x: number; y: number; w: number; h: number }) => (
    <div style={{ ...tileStyle(b), background: kind === "stripes" ? c.paper : c.tint }}>
      {kind === "stripes" ? <StripeBlock box={{ x: 0, y: 0, w: b.w, h: b.h }} a={c.accent} b={c.paper} stripe={34} /> : null}
      {kind === "dots" ? <DotField box={{ x: 0, y: 0, w: b.w, h: b.h }} step={36} rMax={13} color={motifPaint.color} from="bottom-start" /> : null}
      {kind === "arches" ? <NestedArches cx={b.w / 2} base={b.h} r={Math.min(b.w / 2, b.h) - 10} rings={5} gap={Math.min(b.w, b.h) * 0.09} color={motifPaint.color} stroke={16} /> : null}
      {kind === "scalloped_edge" ? <ScallopRosette cx={b.w / 2} cy={b.h / 2} r={Math.min(b.w, b.h) * 0.36} color={c.accent} inner={c.paper} /> : null}
    </div>
  );
  let tiles: ReactNode;
  let textBox: { x: number; y: number; w: number; h: number };
  let bigTile: { x: number; y: number; w: number; h: number };
  if (ctx.textPos === "center") {
    // The library's default: the photo across the top, the words in the middle row, two
    // details (or the motif) under them.
    const storyTop = ST * 0.6;
    const usable = H - M * 2 - storyTop - SB * 0.6;
    const y0 = M + storyTop;
    const h1 = Math.round(usable * (format === "square" ? 0.4 : 0.43));
    const h2 = Math.round(usable * (format === "square" ? 0.32 : 0.29));
    const h3 = usable - h1 - h2 - G * 2;
    const inner = W - M * 2;
    const bw = Math.round((inner - G) * 0.58);
    const A = { x: M, y: y0, w: inner, h: h1 };
    const B = { x: W - M - bw, y: y0 + h1 + h2 + G * 2, w: bw, h: h3 };
    const D = { x: M, y: B.y, w: inner - G - bw, h: h3 };
    textBox = { x: M, y: y0 + h1 + G, w: inner, h: h2 };
    bigTile = A;
    tiles = (
      <>
        <div style={tileStyle(A)}><Photo ctx={ctx} /></div>
        <div style={tileStyle(B)}><Photo ctx={ctx} {...detail(-0.16, 0.12, 2.1)} /></div>
        {motifTile ? motifTileAt(D) : <div style={tileStyle(D)}><Photo ctx={ctx} {...detail(0.16, -0.08, 2.4)} /></div>}
      </>
    );
  } else if (format === "square") {
    const cw = (W - M * 2 - G) / 2;
    const ch = (H - M * 2 - G) / 2;
    const A = { x: W - M - cw, y: M, w: cw, h: ch };
    const B = { x: M, y: M, w: cw, h: ch };
    const D = { x: M, y: M + ch + G, w: cw, h: ch };
    textBox = { x: W - M - cw, y: M + ch + G, w: cw, h: ch };
    bigTile = A;
    tiles = (
      <>
        <div style={tileStyle(A)}><Photo ctx={ctx} /></div>
        <div style={tileStyle(B)}><Photo ctx={ctx} {...detail(-0.15, 0.1, 2)} /></div>
        {motifTile ? motifTileAt(D) : <div style={tileStyle(D)}><Photo ctx={ctx} {...detail(0.15, -0.1, 2.3)} /></div>}
      </>
    );
  } else {
    const storyTop = ST * 0.6;
    const usable = H - M * 2 - storyTop - SB * 0.6;
    const r1 = Math.round(usable * (format === "story" ? 0.56 : 0.58));
    const aw = Math.round((W - M * 2 - G) * 0.6);
    const bw = W - M * 2 - G - aw;
    const bh = (r1 - G) / 2;
    const y0 = M + storyTop;
    const A = { x: W - M - aw, y: y0, w: aw, h: r1 };
    const B = { x: M, y: y0, w: bw, h: bh };
    const D = { x: M, y: y0 + bh + G, w: bw, h: bh };
    textBox = { x: M, y: y0 + r1 + G, w: W - M * 2, h: usable - r1 - G };
    bigTile = A;
    tiles = (
      <>
        <div style={tileStyle(A)}><Photo ctx={ctx} /></div>
        <div style={tileStyle(B)}><Photo ctx={ctx} {...detail(-0.18, 0.12, 2.1)} /></div>
        {motifTile ? motifTileAt(D) : <div style={tileStyle(D)}><Photo ctx={ctx} {...detail(0.16, -0.08, 2.4)} /></div>}
      </>
    );
  }
  const tp = Math.round(P * 0.7);
  const wideTile = textBox.w > W * 0.7;
  const footer = ctx.dna.signature.kind === "corner_mark" ? 70 : 0;
  return (
    <div style={layer(ctx, { background: c.paper })}>
      {tiles}
      <div style={{ ...tileStyle(textBox), background: tInks.bg }}>
        <Motifs ctx={ctx} ground={textGround} places={[{ role: "texture", box: { x: 0, y: 0, w: textBox.w, h: textBox.h }, ground: tInks.bg }]} />
      </div>
      <Motifs
        ctx={ctx}
        ground="paper"
        places={[
          { role: "frame", box: bigTile, radius: r, ground: c.paper, kinds: ["tape"] },
          { role: "frame", box: { x: textBox.x, y: textBox.y, w: textBox.w, h: textBox.h }, radius: r, ground: tInks.bg, inset: 18, kinds: ["thread"] },
        ]}
      />
      <div style={{ position: "absolute", left: textBox.x + tp, top: textBox.y + tp, width: textBox.w - tp * 2, height: textBox.h - tp * 2 - footer, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <TextBlock
          ctx={ctx}
          ground={textGround}
          width={textBox.w - tp * 2}
          headlineHeight={(textBox.h - tp * 2 - footer) * 0.6}
          headlineFactor={wideTile ? 0.84 : format === "square" ? 0.6 : 0.86}
          maxLines={wideTile ? 2 : format === "square" ? 4 : 3}
          compact
          show={{ stat: wideTile ? textBox.h > 420 : format !== "square", kicker: format !== "square" || wideTile || !ctx.words.stat }}
        />
      </div>
      {priceObject(ctx) ? <PriceMark ctx={ctx} price={ctx.words.price} x={textBox.x + textBox.w - 20} y={textBox.y} d={170} ground={textGround} /> : null}
      {ctx.dna.signature.kind === "corner_mark" ? (
        <div style={{ position: "absolute", left: textBox.x, top: textBox.y, width: textBox.w, height: textBox.h }}>
          <SignatureSlotInBox ctx={ctx} w={textBox.w} h={textBox.h} ground={textGround} />
        </div>
      ) : (
        <SignatureSlot ctx={ctx} at="top-start" ground="photo" stampAt={{ x: textBox.x + 100, y: textBox.y, ground: textGround }} />
      )}
    </div>
  );
}

/** A corner mark inside a tile, at its bottom-end corner. */
function SignatureSlotInBox({ ctx, w, h, ground }: { ctx: CardCtx; w: number; h: number; ground: Ground }) {
  const local: CardCtx = { ...ctx, W: w, H: h, safeTop: 0, safeBottom: 0, pad: Math.round(ctx.pad * 0.6) };
  return <SignatureSlot ctx={local} at="bottom-end" ground={ground} />;
}

/* ------------------------------------------------------------------ */
/* 11. handwritten_note                                                */
/* ------------------------------------------------------------------ */

function HandwrittenNote(ctx: CardCtx) {
  const { W, H, pad: P, safeTop: ST, safeBottom: SB, format } = ctx;
  const c = ctx.c;
  const square = format === "square";
  const nw = Math.round(W * (square ? 0.66 : format === "story" ? 0.8 : 0.74));
  const nh = Math.round(H * (square ? 0.62 : format === "story" ? 0.4 : 0.5));
  const top = ctx.textPos === "top";
  const nx = W - P * 0.9 - nw;
  // `start`: the note held at the reading side, halfway down; `bottom`: low on the photo.
  const ny = ctx.textPos === "start" ? Math.round((H - nh + ST - SB) / 2) : top ? P + ST + 40 : H - P - SB - nh - 20;
  const hasPhoto = Boolean(ctx.photo.url);
  const kind = ctx.dna.motif.kind;
  const notePaper = isLight(c.paper) ? c.paper : "#fbf8f2";
  const ruled = ctx.dna.display.meta.category === "hand";
  const np = Math.round(P * 0.7);
  const noteCtx: CardCtx = { ...ctx, c: { ...c, paper: notePaper } };
  return (
    <div style={layer(ctx, { background: c.tint })}>
      {hasPhoto ? <Photo ctx={ctx} /> : <DotField box={{ x: 0, y: 0, w: W, h: H }} step={40} rMax={2.2} color={mix(c.tint, c.ink, 0.2)} from="even" />}
      <div style={{ position: "absolute", left: nx, top: ny, width: nw, height: nh, transform: `rotate(${top ? 1.6 : -2.2}deg)`, transformOrigin: "50% 50%" }}>
        <div style={{ position: "absolute", inset: 0, background: notePaper, borderRadius: ctx.dna.shape === "round" ? 18 : 3, boxShadow: "0 22px 44px -18px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.12)", overflow: "hidden" }}>
          {ruled ? (
            <div aria-hidden style={{ position: "absolute", inset: 0, top: np + 40, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 68px, ${mix(c.accent, notePaper, 0.72)} 68px 70px)` }} />
          ) : null}
          {kind === "stripes" ? <StripeBlock box={{ x: 0, y: 0, w: nw, h: 34 }} a={c.accent} b={notePaper} stripe={22} /> : null}
          {kind === "grain" ? <Grain box={{ x: 0, y: 0, w: nw, h: nh }} strength={0.22} /> : null}
          {kind === "dots" ? <DotField box={{ x: 0, y: nh - 200, w: 200, h: 200 }} step={22} rMax={6} color={mix(c.accent, notePaper, 0.3)} from="bottom-end" /> : null}
          {kind === "thread" ? <MotifSlots paint={paintOn(noteCtx, "paper")} places={[{ role: "frame", box: { x: 0, y: 0, w: nw, h: nh }, radius: 3, ground: notePaper, inset: 18 }]} /> : null}
        </div>
        {kind === "scalloped_edge" ? <Scallops x={0} y={nh} w={nw} r={16} color={notePaper} into="down" /> : null}
        <div style={{ position: "absolute", right: np, left: np, top: np + (kind === "stripes" ? 26 : 0), bottom: np, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <TextBlock ctx={noteCtx} ground="paper" width={nw - np * 2} headlineHeight={(nh - np * 2) * 0.6} headlineFactor={square ? 0.74 : 0.84} maxLines={4} compact show={{ stat: !square }} />
        </div>
        {kind === "dots" ? (
          <span aria-hidden style={{ position: "absolute", top: -14, left: nw / 2 - 16, width: 32, height: 32, borderRadius: 99, background: c.accent, boxShadow: "0 6px 10px rgba(0,0,0,0.25)" }} />
        ) : kind === "stamp" || kind === "thread" ? null : (
          <Tape cx={nw / 2} cy={0} w={210} h={56} rotate={-3} color={kind === "tape" ? c.accent : mix(notePaper, c.accent2, 0.35)} />
        )}
      </div>
      {priceObject(ctx) ? <PriceMark ctx={ctx} price={ctx.words.price} x={nx + 30} y={top ? ny + nh : ny} d={176} ground="photo" /> : null}
      <SignatureSlot ctx={ctx} at={top ? "bottom-end" : "top-start"} ground={hasPhoto ? "photo" : "tint"} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 12. editorial_column                                                */
/* ------------------------------------------------------------------ */

function EditorialColumn(ctx: CardCtx) {
  const { W, H, pad: P, safeTop: ST, safeBottom: SB, format } = ctx;
  const c = ctx.c;
  const inks = inksFor(ctx, "paper");
  const M = Math.round(P * 0.62);
  const story = format === "story";
  const words = ctx.words;
  const ruleColor = mix(c.ink, c.paper, 0.2);
  const folio = (
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: ctx.textStack, fontSize: 24, fontWeight: Math.min(700, ctx.dna.text.weight + 100), color: inks.soft }}>
      <span style={{ fontFamily: ctx.displayStack, fontWeight: ctx.dna.display.weight, color: inks.fg, fontSize: 28 }}>{ctx.name}</span>
    </div>
  );
  const sigInColumn = ctx.dna.signature.kind === "corner_mark" && !ctx.logo;
  if (story) {
    const photo = { x: M, y: M + ST, w: W - M * 2, h: Math.round(H * 0.46) };
    const colTop = photo.y + photo.h + 56;
    const colBottom = H - P - SB;
    return (
      <div style={layer(ctx, { background: c.paper })}>
        <div style={{ position: "absolute", left: photo.x, top: photo.y, width: photo.w, height: photo.h, overflow: "hidden", borderRadius: ctx.radius("s") }}><Photo ctx={ctx} /></div>
        <Motifs ctx={ctx} ground="paper" places={[{ role: "frame", box: photo, radius: 0, ground: c.paper, kinds: ["tape"] }, { role: "texture", box: { x: 0, y: 0, w: W, h: H }, ground: c.paper }]} />
        <div style={{ position: "absolute", right: P, left: P, top: colTop, height: colBottom - colTop, display: "flex", flexDirection: "column", gap: 30 }}>
          {words.kicker ? <Kicker ctx={ctx} inks={inks} text={words.kicker} size={30} /> : null}
          <Rule ctx={ctx} color={ruleColor} width="100%" />
          <Headline ctx={ctx} inks={inks} text={words.headline} box={{ width: W - P * 2, height: (colBottom - colTop) * 0.46, max: headlineMax(ctx, 0.9), maxLines: 3 }} />
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 26 }}>
            {words.stat ? <Stat ctx={ctx} inks={inks} text={words.stat} size={36} /> : null}
            <Rule ctx={ctx} color={ruleColor} width="100%" />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20 }}>
              {words.cta ? <Cta ctx={ctx} inks={inks} text={words.cta} size={30} /> : <span />}
              {sigInColumn ? folio : null}
            </div>
          </div>
        </div>
        {priceObject(ctx) ? <PriceMark ctx={ctx} price={words.price} x={photo.x + 140} y={photo.y + photo.h} d={180} ground="photo" /> : null}
        {sigInColumn ? null : <SignatureSlot ctx={ctx} at="top-start" ground="photo" stampAt={{ x: photo.x + 140, y: photo.y + photo.h - 10, ground: "photo" }} />}
      </div>
    );
  }
  const square = format === "square";
  // `start` (the default): the text column at the reading side, the photo beyond it.
  // `end`: mirrored, the photo first and the column on the far side.
  const atEnd = ctx.textPos === "end";
  const pw = Math.round(W * (square ? 0.5 : 0.54));
  const gutter = square ? 48 : 56;
  const photo = { x: atEnd ? W - M - pw : M, y: M + ST, w: pw, h: H - M * 2 - ST - SB };
  const colX = atEnd ? Math.round(P * 0.85) : photo.x + photo.w + gutter;
  const colW = atEnd ? photo.x - gutter - colX : W - colX - P * 0.85;
  const innerEdge = atEnd ? photo.x : photo.x + photo.w;
  const colTop = P + ST;
  const colBottom = H - P - SB;
  return (
    <div style={layer(ctx, { background: c.paper })}>
      <div style={{ position: "absolute", left: photo.x, top: photo.y, width: photo.w, height: photo.h, overflow: "hidden", borderRadius: ctx.radius("s") }}><Photo ctx={ctx} /></div>
      <Motifs
        ctx={ctx}
        ground="paper"
        places={[
          { role: "frame", box: photo, radius: 0, ground: c.paper, kinds: ["tape"] },
          { role: "texture", box: { x: 0, y: 0, w: W, h: H }, ground: c.paper },
        ]}
      />
      <div style={{ position: "absolute", left: colX, top: colTop, width: colW, height: colBottom - colTop, display: "flex", flexDirection: "column", gap: square ? 20 : 28 }}>
        {words.kicker ? <Kicker ctx={ctx} inks={inks} text={words.kicker} size={square ? 24 : 27} /> : <span />}
        <Rule ctx={ctx} color={ruleColor} width="100%" />
        <Headline ctx={ctx} inks={inks} text={words.headline} box={{ width: colW, height: (colBottom - colTop) * 0.5, max: headlineMax(ctx, square ? 0.6 : 0.68), maxLines: 5, min: 40 }} />
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: square ? 18 : 24 }}>
          {words.price && ctx.dna.copy.price === "inline" ? <InlinePrice ctx={ctx} inks={inks} price={words.price} size={56} /> : null}
          {words.stat && !square ? <Stat ctx={ctx} inks={inks} text={words.stat} size={30} /> : null}
          {words.cta ? <Cta ctx={ctx} inks={inks} text={words.cta} size={square ? 24 : 27} /> : null}
          <Rule ctx={ctx} color={ruleColor} width="100%" />
          {sigInColumn ? folio : <span style={{ height: ctx.dna.signature.kind === "corner_mark" ? 60 : 0 }} />}
        </div>
      </div>
      {priceObject(ctx) ? <PriceMark ctx={ctx} price={words.price} x={innerEdge} y={photo.y + 170} d={170} ground="photo" /> : null}
      {sigInColumn ? null : ctx.dna.signature.kind === "corner_mark" ? (
        <SignatureSlot ctx={{ ...ctx, pad: P * 0.85 }} at={atEnd ? "bottom-end" : "bottom-start"} ground="paper" />
      ) : (
        <SignatureSlot ctx={ctx} at={atEnd ? "top-start" : "top-end"} ground="photo" stampAt={{ x: innerEdge, y: photo.y + photo.h - 150, ground: "photo" }} />
      )}
    </div>
  );
}

export const COMPOSITIONS: Record<CompositionKey, (ctx: CardCtx) => ReactNode> = {
  full_bleed: FullBleed,
  inset_frame: InsetFrame,
  split: Split,
  type_led: TypeLed,
  stacked_bands: StackedBands,
  corner_tab: CornerTab,
  arch_window: ArchWindow,
  circle_crop: CircleCrop,
  ticket: Ticket,
  collage_grid: CollageGrid,
  handwritten_note: HandwrittenNote,
  editorial_column: EditorialColumn,
};

/** Re-exported for the stamp motif's in-flow placement elsewhere. */
export { StampSeal };
