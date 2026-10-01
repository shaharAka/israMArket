"use client";

/**
 * CardCanvas — the post renderer.
 *
 * Every post is drawn from the business's Design DNA (`brand_dna`, docs/design-dna.md):
 * its type pair, colours, motif, signature and copy treatment, in one of the DNA's
 * compositions (`post.design.composition`, or a stable rotation through the DNA's set).
 * Two bakeries with the same photo come out looking like two different designers made them.
 *
 * Cards are drawn at their TRUE pixel size (1080 wide) and scaled down with a CSS
 * transform for preview, so the 380px preview and the 1080px export are the same pixels.
 *
 * Old posts keep rendering: an `overlay_theme` from the six fixed layouts maps to the
 * nearest composition, and a business without a DNA gets a neutral one from its palette.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { BrandLanguage, RoadmapPost } from "@/lib/api";
import { fontStack } from "@/lib/dna/fonts";
import { findPrice, typesetHebrew } from "@/lib/dna/hebrew";
import { compositionDrawsPhoto, type BrandDna } from "@/lib/dna/library";
import { resolveComposition, resolveCrop, resolveDna, resolveTextPosition, type ResolvedDna } from "@/lib/dna/resolve";
import { COMPOSITIONS } from "@/components/dna/compositions";
import type { CardCtx, CardWords } from "@/components/dna/context";
import { PhotoSizesContext, Photo } from "@/components/dna/parts";
import { FooterBand, footerHeight, SignatureSlot } from "@/components/dna/Signature";

/* ------------------------------------------------------------------ */
/* Legacy template API (kept for existing callers)                     */
/* ------------------------------------------------------------------ */

export type CardTemplate =
  | "lower_editorial"
  | "split_panel"
  | "framed_inset"
  | "cover_type"
  | "promo_ribbon"
  | "type_hero";

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

export const ALL_TEMPLATE_KEYS: string[] = [
  ...CARD_TEMPLATES.map((t) => t.key),
  ...Object.keys(LEGACY_TEMPLATES),
];

/**
 * Whether the card draws a photograph. Takes the old `overlay_theme` and, when the post
 * has one, its chosen composition (which wins).
 */
export function needsPhoto(theme?: string | null, composition?: string | null): boolean {
  if (composition) return compositionDrawsPhoto(composition);
  return !PHOTO_FREE_TEMPLATES.has(resolveTemplate(theme));
}

/** `needsPhoto` for a whole post. */
export function postNeedsPhoto(post: Pick<RoadmapPost, "overlay_theme" | "design">): boolean {
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

/**
 * `cta` comes back from the model as a full sentence ("שריון חלות לשישי: נכנסים
 * לקבוצה..."), but it lands in a line sized for a few words. Take the leading clause when
 * it reads as a standalone label; skip a clause that merely repeats the headline; drop the
 * CTA when nothing short qualifies — the caption already carries it.
 */
export function shortCta(raw?: string, headline = ""): string {
  const raw_ = (raw || "").trim();
  if (!raw_) return "";
  const norm = (s: string) => s.replace(/[\s"'״׳.,:!?-]+/g, "");
  const head = norm(headline);
  const clauses = raw_
    .split(/[:.·|\n]/)
    .map((c) => c.trim())
    .filter(Boolean);
  for (const clause of clauses) {
    if (clause.length > 28) continue;
    if (head && (norm(clause) === head || head.includes(norm(clause)))) continue;
    return clause;
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* The renderer                                                        */
/* ------------------------------------------------------------------ */

/** The post's words, typeset, de-duplicated, with any price pulled out of the copy. */
function wordsOf(post: RoadmapPost): CardWords {
  const headline = typesetHebrew((post.overlay_headline || post.overlay_text || "").trim());
  const rawBadge = (post.overlay_badge || "").trim();
  // The model often puts the number in BOTH the headline and stat_highlight, which
  // printed the same figure twice. The stat shows only when it adds something.
  const statRaw = (post.stat_highlight || "").trim();
  const norm = (v: string) => v.replace(/[\s\u00A0"'״׳.,:!?%₪-]+/g, "");
  let stat = statRaw && !norm(headline).includes(norm(statRaw)) && !norm(statRaw).includes(norm(headline)) ? statRaw : "";
  let kicker = rawBadge;
  let price = "";
  const inBadge = findPrice(rawBadge);
  const inStat = findPrice(stat);
  if (inBadge) {
    price = inBadge.price;
    kicker = inBadge.rest;
  } else if (inStat) {
    price = inStat.price;
    stat = inStat.rest;
  }
  return {
    headline,
    kicker: typesetHebrew(kicker, { bindLast: false }),
    stat: typesetHebrew(stat, { bindLast: false }),
    cta: shortCta(post.cta, headline),
    price,
  };
}

function formatOf(size: { w: number; h: number }): CardCtx["format"] {
  const r = size.h / size.w;
  if (r >= 1.6) return "story";
  if (r <= 1.05) return "square";
  return "portrait";
}

function radiusFor(dna: ResolvedDna) {
  return (s: "s" | "m" | "l") => {
    if (dna.shape === "round") return s === "s" ? 28 : s === "m" ? 44 : 80;
    if (dna.shape === "soft") return s === "s" ? 12 : s === "m" ? 22 : 40;
    return s === "s" ? 0 : s === "m" ? 2 : 4;
  };
}

/** The logo to draw: the DNA's same-origin copy first, then the one found on the site. */
export function logoFor(dna: ResolvedDna, brand?: BrandLanguage | null, explicit?: string): string | undefined {
  if (explicit) return explicit;
  if (!dna.signature.useLogo) return undefined;
  return dna.signature.logoUrl || brand?.logo_url || undefined;
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
  const dna = resolveDna(dnaIn, brand);
  const composition = resolveComposition(post, dna);
  const { w, h } = size;
  const format = formatOf(size);
  const words = wordsOf(post);
  const show =
    post.has_overlay !== undefined ? Boolean(post.has_overlay) : Boolean((post.overlay_headline || post.overlay_text || "").trim());
  const footer = dna.signature.kind === "footer_band" ? footerHeight({ format }) : 0;
  const story = format === "story";
  const pad = Math.round((dna.scale === "editorial" ? 92 : dna.scale === "medium" ? 80 : 72) * (format === "square" ? 0.9 : 1));
  const ctx: CardCtx = {
    W: w,
    H: h - footer,
    fullH: h,
    format,
    composition,
    dna,
    c: dna.colors,
    pad,
    safeTop: story ? 200 : 0,
    safeBottom: story ? Math.max(0, 290 - footer) : 0,
    words: { ...words, headline: words.headline || (composition === "type_led" ? businessName : "") },
    photo: { url: post.image_url || undefined, crop: resolveCrop(post.design?.crop) },
    logo: logoFor(dna, brand, logoUrl),
    name: businessName,
    textPos: resolveTextPosition(post, composition),
    displayStack: fontStack(dna.display.key, dna.display.meta.category === "serif" ? "serif" : "sans"),
    textStack: fontStack(dna.text.key, dna.text.meta.category === "serif" ? "serif" : "sans"),
    motif: { kind: dna.motif.kind, color: dna.colors.motif, alt: dna.colors.paper, paper: dna.colors.paper, dense: dna.motif.density === "mid" },
    radius: radiusFor(dna),
    quietPlaceholder,
  };

  const root: CSSProperties = {
    position: "relative",
    width: w,
    height: h,
    overflow: "hidden",
    background: dna.colors.paper,
    fontFamily: ctx.textStack,
    // Hebrew needs the bidi base direction set explicitly.
    direction: "rtl",
    textAlign: "right",
    WebkitFontSmoothing: "antialiased",
  };

  // No overlay requested: the photograph is the post, with the signature on it.
  const plain = !show || (!words.headline && !words.kicker && composition !== "type_led");
  const body = plain ? (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: ctx.H, overflow: "hidden" }}>
      <Photo ctx={ctx} />
      <SignatureSlot ctx={ctx} at="top-start" ground="photo" />
    </div>
  ) : (
    COMPOSITIONS[composition](ctx)
  );

  return (
    <div ref={canvasRef} style={root} data-card-composition={composition} data-card-dna={dna.isDefault ? "default" : dna.display.key}>
      {body}
      {footer ? <FooterBand ctx={ctx} y={ctx.H} h={footer} /> : null}
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
    : {
        position: "relative",
        width: "100%",
        overflow: "hidden",
        borderRadius: rounded ? 14 : 0,
        background: "#eceae4",
        aspectRatio: `${size.w} / ${size.h}`,
      };

  return (
    <div ref={hostRef} className={className} data-card-stage={resolveTemplate(post.overlay_theme)} style={hostStyle}>
      {scale > 0 ? (
        <div
          style={{
            position: fill ? "absolute" : "relative",
            top: 0,
            right: 0,
            width: size.w,
            height: size.h,
            transform: `scale(${scale})`,
            transformOrigin: "top right",
          }}
        >
          <PhotoSizesContext.Provider value={photoSizes}>
            <CardCanvas
              post={post}
              brand={brand}
              dna={dna}
              businessName={businessName}
              size={size}
              canvasRef={canvasRef}
              logoUrl={logoUrl}
              quietPlaceholder={quietPlaceholder}
            />
          </PhotoSizesContext.Provider>
        </div>
      ) : null}
    </div>
  );
}
