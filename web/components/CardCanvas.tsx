"use client";

/**
 * CardCanvas — the post renderer.
 *
 * Every post is drawn from the business's Design DNA (`brand_dna`, docs/design-dna.md) as
 * an art direction, not a template: the photo is the hero, cropped around its subject; at
 * most a headline and one short line sit in the photo's own empty area (`design.safe_area`),
 * or on a band of the brand's paper beside it; the logo is small. There is no shared
 * skeleton — no kicker, no call to action on the image, no stickers, no list ornaments.
 * The layout is planned by `planCard` (lib/dna/layout.ts), which also enforces the phone
 * minimums; this file draws the plan.
 *
 * Cards are drawn at their TRUE pixel size (1080 wide) and scaled down with a CSS transform
 * for preview, so the 380px preview and the 1080px export are the same pixels.
 *
 * Old posts keep rendering: an `overlay_theme` from the six fixed layouts and a v1
 * composition map to the nearest v2 composition, and a business without a DNA gets a
 * neutral one from its palette.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { BrandLanguage, RoadmapPost } from "@/lib/api";
import { contentDirection } from "@/lib/content-language";
import { fontStack } from "@/lib/dna/fonts";
import { typesetHebrew } from "@/lib/dna/hebrew";
import { planCard, type CardPlan, type CardWords, type Channel } from "@/lib/dna/layout";
import { compositionDrawsPhoto, type BrandDna, type TextMode } from "@/lib/dna/library";
import { useFontEpoch } from "@/lib/dna/measure";
import { usePhotoInfo } from "@/lib/dna/photoInfo";
import { resolveDesign, resolveDna, type ResolvedDna } from "@/lib/dna/resolve";
import { Motif, Photo, PhotoSizesContext, Shade, TextBlock, type Stacks } from "@/components/dna/parts";
import { FooterView, SignatureView } from "@/components/dna/Signature";

/* ------------------------------------------------------------------ */
/* Legacy template API (kept for existing callers)                     */
/* ------------------------------------------------------------------ */

export type CardTemplate = "lower_editorial" | "split_panel" | "framed_inset" | "cover_type" | "promo_ribbon" | "type_hero";

/** The six fixed layouts the renderer used to draw. Kept so stored values still resolve. */
export const CARD_TEMPLATES: { key: CardTemplate; label: string; desc: string }[] = [
  { key: "type_hero", label: "טקסט בלבד", desc: "בלי תמונה: הכותרת היא העיצוב" },
  { key: "lower_editorial", label: "תמונה מלאה", desc: "התמונה על כל הפוסט, הכותרת עליה" },
  { key: "split_panel", label: "חצי־חצי", desc: "תמונה וטקסט, כל אחד בחלק משלו" },
  { key: "framed_inset", label: "תמונה במסגרת", desc: "התמונה ממוסגרת על צבע העסק" },
  { key: "cover_type", label: "כותרת למעלה", desc: "התמונה מלאה, הכותרת בראש" },
  { key: "promo_ribbon", label: "פסים", desc: "פס צבע, התמונה, ופס עם הכותרת" },
];

/** Templates that draw no photograph at all. */
export const PHOTO_FREE_TEMPLATES: ReadonlySet<CardTemplate> = new Set<CardTemplate>(["type_hero"]);

/** Old `overlay_theme` values stored in existing strategies map onto real compositions. */
const LEGACY_TEMPLATES: Record<string, CardTemplate> = {
  ink_pill: "lower_editorial",
  minimal_text: "cover_type",
  paper_badge: "framed_inset",
  frosted_glass: "split_panel",
  accent_banner: "promo_ribbon",
};

export function resolveTemplate(theme?: string | null): CardTemplate {
  if (!theme) return "lower_editorial";
  if (theme in LEGACY_TEMPLATES) return LEGACY_TEMPLATES[theme];
  return CARD_TEMPLATES.some((t) => t.key === theme) ? (theme as CardTemplate) : "lower_editorial";
}

export const ALL_TEMPLATE_KEYS: string[] = [...CARD_TEMPLATES.map((t) => t.key), ...Object.keys(LEGACY_TEMPLATES)];

/**
 * Whether the card draws a photograph. Takes the old `overlay_theme` and, when the post
 * has one, its chosen composition (which wins).
 */
export function needsPhoto(theme?: string | null, composition?: string | null): boolean {
  if (composition) return compositionDrawsPhoto(composition);
  return !PHOTO_FREE_TEMPLATES.has(resolveTemplate(theme));
}

/** `needsPhoto` for a whole post: a type-led post draws none (it keeps its photo for later). */
export function postNeedsPhoto(post: Pick<RoadmapPost, "overlay_theme" | "design">): boolean {
  if (post.design?.text_mode === "type_led") return false;
  return needsPhoto(post.overlay_theme, post.design?.composition);
}

export type CardRatio = "4:5" | "1:1" | "9:16";

export const CARD_RATIOS: { key: CardRatio; label: string; w: number; h: number }[] = [
  { key: "4:5", label: "4:5 פיד", w: 1080, h: 1350 },
  { key: "1:1", label: "1:1 מרובע", w: 1080, h: 1080 },
  { key: "9:16", label: "9:16 רילס", w: 1080, h: 1920 },
];

/**
 * Instagram's native sizes. `ratio` overrides the format default so the same card can
 * be exported square for a Meta feed placement without redesigning it.
 */
export function cardSize(format: RoadmapPost["format"], ratio?: CardRatio): { w: number; h: number } {
  if (ratio) {
    const hit = CARD_RATIOS.find((r) => r.key === ratio);
    if (hit) return { w: hit.w, h: hit.h };
  }
  return format === "reel" || format === "story" ? { w: 1080, h: 1920 } : { w: 1080, h: 1350 };
}

/* ------------------------------------------------------------------ */
/* The renderer                                                        */
/* ------------------------------------------------------------------ */

/** "120" → "120", 1200 → "1,200", "₪ 89.90" → "89.90". */
function amountOf(raw: unknown): string {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const s = String(raw ?? "").replace(/[₪\s]|ש"ח|ש״ח/g, "");
  return /^\d[\d,.]*$/.test(s) ? s : "";
}

/**
 * The post's words for the image: the headline, one short line, and the price when the
 * post has one. The call to action, the kicker and the stat of older posts stay in the
 * caption: one message per post.
 */
export function wordsOf(post: RoadmapPost, mode: TextMode, businessName = ""): CardWords {
  // The owner turned the words off: a clean photo, not even one word.
  if (mode === "photo_only" && post.has_overlay === false) return { headline: "", sub: "" };
  const typeset = (value: string, options?: { bindLast?: boolean }) => !post.content_language || post.content_language === "he" ? typesetHebrew(value, options) : value.replace(/\s+/g, " ").trim();
  let headline = typeset((post.overlay_headline || post.overlay_text || "").trim());
  if (!headline && mode === "type_led") headline = typeset(businessName);
  // A price is printed only on a headline post, where it is the message.
  const amount = mode === "headline" ? amountOf(post.price?.amount) : "";
  const note = amount ? typeset((post.price?.note || "").trim(), { bindLast: false }) : "";
  const sub = typeset((post.overlay_sub || "").trim(), { bindLast: false }) || note;
  return { headline, sub: mode === "photo_only" ? "" : sub, price: amount ? { amount, note } : undefined };
}

/** The logo to draw: the one asked for, then the DNA's same-origin copy, then the site's. */
export function logoFor(dna: ResolvedDna, brand?: BrandLanguage | null, explicit?: string): string | undefined {
  if (explicit) return explicit;
  if (!dna.signature.useLogo) return undefined;
  return dna.signature.logoUrl || brand?.logo_url || undefined;
}

function channelOf(post: RoadmapPost): Channel {
  const outlet = post.channel || post.primary_outlet;
  if (outlet === "whatsapp") return "whatsapp";
  return post.format === "story" ? "story" : "feed";
}

export type CardInput = {
  post: RoadmapPost;
  brand?: BrandLanguage | null;
  dna?: BrandDna | null;
  businessName: string;
  size: { w: number; h: number };
  logoUrl?: string;
};

/**
 * The plan for one card, from the same inputs CardCanvas takes (and the photo's and the
 * logo's shape and light, once loaded). The editor uses it to describe a design in words.
 */
export function useCardPlan({ post, brand, dna: dnaIn, businessName, size, logoUrl }: CardInput): { plan: CardPlan; dna: ResolvedDna } {
  // Re-plans when the faces finish loading: the measure is then exact. The first render
  // (and the server's) estimates, so hydration matches.
  const exact = useFontEpoch() > 0;
  const dna = resolveDna(dnaIn, brand);
  const design = resolveDesign(post, dna);
  const info = usePhotoInfo(post.image_url || undefined);
  const logo = logoFor(dna, brand, logoUrl);
  const logoInfo = usePhotoInfo(logo);
  const plan = planCard({
    W: size.w,
    H: size.h,
    dna,
    design,
    words: wordsOf(post, design.mode, businessName),
    photo: { url: post.image_url || undefined, info },
    channel: channelOf(post),
    logo: logo ? { src: logo, aspect: logoInfo?.aspect } : undefined,
    name: businessName,
    exact,
  });
  return { plan, dna };
}

export function CardCanvas({
  post,
  brand,
  dna: dnaIn,
  businessName,
  size,
  canvasRef,
  logoUrl,
  quietPlaceholder = false,
}: {
  post: RoadmapPost;
  brand?: BrandLanguage | null;
  /** The business's Design DNA. Without one, a neutral default from `brand`'s palette. */
  dna?: BrandDna | null;
  businessName: string;
  size: { w: number; h: number };
  canvasRef?: React.Ref<HTMLDivElement>;
  /** Draw this logo (overrides the DNA's and the brand's). */
  logoUrl?: string;
  /** No "התמונה בהכנה" label on a missing photo (samples, thumbnails). */
  quietPlaceholder?: boolean;
}) {
  const { plan, dna } = useCardPlan({ post, brand, dna: dnaIn, businessName, size, logoUrl });
  const { W, H } = plan;
  const stacks: Stacks = {
    direction: contentDirection(post.content_language),
    display: fontStack(dna.display.key, dna.display.meta.category === "serif" ? "serif" : "sans"),
    text: fontStack(dna.text.key, dna.text.meta.category === "serif" ? "serif" : "sans"),
  };
  const layoutH = plan.footer ? plan.footer.y : H;
  const root: CSSProperties = {
    position: "relative",
    width: W,
    height: H,
    overflow: "hidden",
    background: plan.background,
    fontFamily: stacks.text,
    direction: contentDirection(post.content_language),
    textAlign: contentDirection(post.content_language) === "rtl" ? "right" : "left",
    WebkitFontSmoothing: "antialiased",
  };
  return (
    <div
      ref={canvasRef}
      lang={post.content_language || "he"}
      style={root}
      data-card-composition={plan.composition}
      data-card-outcome={plan.outcome}
      data-card-mode={plan.mode}
      data-card-fellback={plan.fellBack ? "1" : undefined}
      data-card-min-text={plan.minText}
      data-card-min-headline={plan.minHeadline}
      data-card-dna={dna.isDefault ? "default" : dna.display.key}
    >
      {plan.bands.map((b, i) => (
        <div key={`band-${i}`} style={{ position: "absolute", left: b.box.x, top: b.box.y, width: b.box.w, height: b.box.h, background: b.color }} />
      ))}
      {plan.photo ? <Photo plan={plan.photo} url={post.image_url || undefined} dna={dna} stacks={stacks} quiet={quietPlaceholder} /> : null}
      {plan.motifs.map((m, i) => (
        <Motif key={`motif-${i}`} motif={m} />
      ))}
      {plan.text ? <Shade text={plan.text} H={layoutH} /> : null}
      {plan.text ? <TextBlock text={plan.text} dna={dna} stacks={stacks} /> : null}
      {plan.signature ? <SignatureView plan={plan.signature} W={W} dna={dna} name={businessName} display={stacks.display} /> : null}
      {plan.footer ? <FooterView plan={plan.footer} W={W} pad={Math.round(W * 0.066)} dna={dna} name={businessName} display={stacks.display} /> : null}
    </div>
  );
}

/**
 * Scales a true-size CardCanvas down to its container. Because the canvas is always
 * 1080px wide, the preview and the exported PNG are the same rendering.
 */
export function CardStage({
  post,
  brand,
  dna,
  businessName,
  className,
  canvasRef,
  rounded = true,
  fill = false,
  ratio,
  logoUrl,
  photoSizes,
  quietPlaceholder,
}: {
  post: RoadmapPost;
  brand?: BrandLanguage | null;
  dna?: BrandDna | null;
  businessName: string;
  className?: string;
  canvasRef?: React.Ref<HTMLDivElement>;
  rounded?: boolean;
  /** When true the stage fills its parent box instead of setting its own aspect. */
  fill?: boolean;
  /** Override the format's default aspect ratio (e.g. square for a Meta feed). */
  ratio?: CardRatio;
  logoUrl?: string;
  /**
   * The rendered width of the stage as a `sizes` attribute (e.g. "280px"). When set, the
   * photo is served by next/image at that width rather than the 1080px original.
   */
  photoSizes?: string;
  quietPlaceholder?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const size = cardSize(post.format, ratio);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      // In fill mode the parent dictates both axes, so fit inside rather than assume.
      const next = fill ? Math.min(rect.width / size.w, (rect.height || Infinity) / size.h) : rect.width / size.w;
      if (next > 0 && Number.isFinite(next)) setScale(next);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [size.w, size.h, fill]);

  const hostStyle: CSSProperties = fill
    ? { position: "absolute", inset: 0, overflow: "hidden", background: "#eceae4" }
    : { position: "relative", width: "100%", overflow: "hidden", borderRadius: rounded ? 14 : 0, background: "#eceae4", aspectRatio: `${size.w} / ${size.h}` };

  return (
    <div ref={hostRef} className={className} data-card-stage={resolveTemplate(post.overlay_theme)} style={hostStyle}>
      {scale > 0 ? (
        <div style={{ position: "absolute", top: 0, right: 0, width: size.w, height: size.h, transform: `scale(${scale})`, transformOrigin: "top right" }}>
          <PhotoSizesContext.Provider value={photoSizes}>
            <CardCanvas post={post} brand={brand} dna={dna} businessName={businessName} size={size} canvasRef={canvasRef} logoUrl={logoUrl} quietPlaceholder={quietPlaceholder} />
          </PhotoSizesContext.Provider>
        </div>
      ) : null}
    </div>
  );
}
