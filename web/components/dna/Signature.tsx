"use client";

/* eslint-disable @next/next/no-img-element -- the card is rasterised by html-to-image, which inlines plain <img> */

/**
 * The brand signature: the business's real logo, small — or, with no logo, its name set in
 * the display face. Never an invented monogram or badge.
 *
 *   corner_mark  the logo (or name) small in a corner, or under the words on a band
 *   footer_band  a thin band along the bottom edge with the logo or name
 *   name_only    the name in the display face, small
 *   none         nothing on feed posts (the profile shows the logo); small and clear on
 *                stories and WhatsApp
 *
 * `data-card-logo` marks the logo for the PNG export, which inlines it (or, when its host
 * refuses to share it, swaps in the `data-card-logo-fallback` wordmark — so a PNG never
 * ships an empty box). A same-origin `signature.logo_url` always inlines.
 */

import { useState, type CSSProperties, type ReactNode } from "react";
import type { FooterPlan, SignaturePlan } from "@/lib/dna/layout";
import type { ResolvedDna } from "@/lib/dna/resolve";

export function Logo({ src, height, maxWidth, fallback }: { src: string; height: number; maxWidth: number; fallback: ReactNode }) {
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

function Name({ name, dna, display, size, color, shadow, align = "start" }: { name: string; dna: ResolvedDna; display: string; size: number; color: string; shadow?: string; align?: "start" | "center" | "end" }) {
  return (
    <span
      data-card-text="name"
      style={{
        fontFamily: display,
        fontWeight: dna.display.weight,
        fontSize: size,
        lineHeight: 1.1,
        color,
        whiteSpace: "nowrap",
        display: "block",
        textAlign: align === "center" ? "center" : align === "end" ? "left" : "right",
        letterSpacing: dna.display.meta.category === "hand" ? "0.02em" : 0,
        textShadow: shadow,
      }}
    >
      {name}
    </span>
  );
}

export function SignatureView({ plan, W, dna, name, display }: { plan: SignaturePlan; W: number; dna: ResolvedDna; name: string; display: string }) {
  const { box } = plan;
  // Anchored to the edge it sits nearest, so a logo narrower than its estimate still hugs it.
  const nearRight = box.x + box.w / 2 > W / 2;
  const centered = plan.kind === "name" && plan.align === "center";
  const at: CSSProperties = {
    position: "absolute",
    top: box.y,
    ...(centered ? { left: box.x, width: box.w } : nearRight ? { right: W - box.x - box.w } : { left: box.x }),
    display: "flex",
    justifyContent: centered ? "center" : undefined,
  };
  if (plan.kind === "logo") {
    const p = plan.plate;
    const fallback = <Name name={name} dna={dna} display={display} size={Math.max(Math.ceil(W * 0.032), Math.round(plan.height * 0.8))} color={plan.nameColor} />;
    if (p) {
      return (
        <div style={{ ...at, top: box.y - p.pad, ...(nearRight ? { right: W - box.x - box.w - p.pad } : { left: box.x - p.pad }), background: p.bg, padding: p.pad, borderRadius: p.radius }}>
          <Logo src={plan.src} height={plan.height} maxWidth={box.w} fallback={fallback} />
        </div>
      );
    }
    return (
      <div style={at}>
        <Logo src={plan.src} height={plan.height} maxWidth={box.w} fallback={fallback} />
      </div>
    );
  }
  return (
    <div style={at}>
      <Name name={name} dna={dna} display={display} size={plan.size} color={plan.color} shadow={plan.shadow} align={plan.align} />
    </div>
  );
}

export function FooterView({ plan, W, pad, dna, name, display }: { plan: FooterPlan; W: number; pad: number; dna: ResolvedDna; name: string; display: string }) {
  const word = <Name name={name} dna={dna} display={display} size={plan.nameSize} color={plan.fg} />;
  return (
    <div style={{ position: "absolute", left: 0, top: plan.y, width: W, height: plan.h, background: plan.bg, display: "flex", alignItems: "center", padding: `0 ${pad}px` }}>
      {plan.logo ? (
        <span style={{ display: "flex", background: plan.plate, padding: plan.plate ? Math.round(plan.logoH * 0.22) : 0, borderRadius: 6 }}>
          <Logo src={plan.logo} height={plan.logoH} maxWidth={Math.round(W * 0.36)} fallback={<Name name={name} dna={dna} display={display} size={plan.nameSize} color={plan.fg} />} />
        </span>
      ) : (
        word
      )}
    </div>
  );
}
