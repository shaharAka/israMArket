"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import type { BrandLanguage, RoadmapPost } from "@/lib/api";
import type { BrandDna } from "@/lib/dna/library";
import { resolveDna } from "@/lib/dna/resolve";
import { fontStack } from "@/lib/dna/fonts";
import { contentDirection } from "@/lib/content-language";

// הכיתוב נשאר מחוץ ליצירת הווידאו. אותו DOM מוצג ומתורגם ל-PNG שקוף
// להורדה, כדי לשמור את הגופן, העברית והלוגו של העסק בדיוק כמו בתצוגה.
export const CampaignVideoOverlay = forwardRef<HTMLDivElement, { post: RoadmapPost; dna: BrandDna | null; brand?: BrandLanguage; businessName: string }>(function Overlay({ post, dna, brand, businessName }, ref) {
  const resolved = resolveDna(dna, brand);
  return <div ref={ref} dir={contentDirection(post.content_language)} style={{ width: 720, height: 1280, position: "relative", background: "transparent", color: resolved.colors.ink, pointerEvents: "none" }}>
    {resolved.signature.useLogo && resolved.signature.logoUrl ? <div style={{ position: "absolute", top: 120, insetInlineEnd: 54, maxWidth: 160, padding: 14, borderRadius: 8, background: resolved.colors.paper }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img data-card-logo src={resolved.signature.logoUrl} alt={businessName} style={{ width: 132, maxHeight: 70, objectFit: "contain" }} />
      <span data-card-logo-fallback style={{ display: "none", fontFamily: fontStack(resolved.text.key) }}>{businessName}</span>
    </div> : null}
    {post.has_overlay !== false && (post.overlay_headline || post.overlay_text) ? <div style={{ position: "absolute", insetInline: 54, bottom: 210, background: resolved.colors.paper, borderInlineStart: `7px solid ${resolved.colors.accent}`, padding: "24px 30px", borderRadius: 8, fontFamily: fontStack(resolved.display.key, resolved.display.meta.category === "serif" ? "serif" : "sans"), fontWeight: resolved.display.weight, fontSize: 48, lineHeight: 1.25, overflowWrap: "anywhere" }}>{post.overlay_headline || post.overlay_text}</div> : null}
  </div>;
});

export function CampaignVideoPreview({ url, post, dna, brand, businessName }: { url: string; post: RoadmapPost; dna: BrandDna | null; brand?: BrandLanguage; businessName: string }) {
  const node = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    if (!node.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node.current); return () => observer.disconnect();
  }, []);
  return <div ref={node} style={{ position: "relative", aspectRatio: "9/16" }}>
    <video src={url} controls playsInline preload="metadata" aria-label={post.title} style={{ width: "100%", height: "100%", objectFit: "contain", background: "#111" }} />
    <div style={{ position: "absolute", top: 0, left: 0, width: 720, height: 1280, transformOrigin: "top left", transform: `scale(${width / 720})`, pointerEvents: "none" }}><CampaignVideoOverlay post={post} dna={dna} brand={brand} businessName={businessName} /></div>
  </div>;
}
