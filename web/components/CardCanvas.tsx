"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * CardCanvas — the social card design system.
 *
 * Cards are drawn at their TRUE pixel size (1080 wide) and scaled down with a CSS
 * transform for preview. That means the 380px preview and the 1080px export are the
 * same pixels, which is what makes the export trustworthy. The previous overlay was
 * fixed at `text-sm` regardless of card size, with hardcoded hex chrome and no
 * background behind the text — the three reasons it read as a UI tooltip rather than
 * a designed card.
 */

import { useEffect, useRef, useState } from "react";
import type { BrandLanguage, RoadmapPost } from "@/lib/api";
import { alpha, cardTokens, type CardTokens } from "@/lib/cardTokens";

export type CardTemplate =
  | "lower_editorial"
  | "split_panel"
  | "framed_inset"
  | "cover_type"
  | "promo_ribbon"
  | "type_hero";

/** Template metadata for the editor's picker. */
export const CARD_TEMPLATES: { key: CardTemplate; label: string; desc: string }[] = [
  { key: "type_hero", label: "טיפוגרפיה בלבד", desc: "בלי תמונה: רקע המותג, כותרת ענקית ו-CTA" },
  { key: "lower_editorial", label: "פתיח תחתון", desc: "תמונה מלאה עם מעבר כהה וכותרת גדולה" },
  { key: "split_panel", label: "פאנל מפוצל", desc: "תמונה למעלה, כותרת על רקע המותג" },
  { key: "framed_inset", label: "מסגרת מעוצבת", desc: "תמונה ממוסגרת על רקע המותג" },
  { key: "cover_type", label: "שער מגזין", desc: "כותרת ענקית מעל התמונה" },
  { key: "promo_ribbon", label: "סרט מבצע", desc: "פס צבעוני עם המבצע ופס תחתון" },
];

/**
 * Templates that draw no photograph at all.
 *
 * These matter for two reasons beyond looks: bold typography on a brand-coloured
 * ground is the format that consistently outperforms image-led creative, and because
 * it makes no photographic claim it sidesteps the "is this a real photo of their
 * food?" suspicion problem entirely.
 */
export const PHOTO_FREE_TEMPLATES: ReadonlySet<CardTemplate> = new Set<CardTemplate>(["type_hero"]);

export function needsPhoto(theme?: string | null): boolean {
  return !PHOTO_FREE_TEMPLATES.has(resolveTemplate(theme));
}

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

const PAD = 76;

/** Long Hebrew headlines get a smaller size rather than overflowing the card. */
function headlineSize(text: string, base = 88): number {
  const n = text.trim().length;
  if (n <= 16) return base;
  if (n <= 30) return Math.round(base * 0.85);
  if (n <= 48) return Math.round(base * 0.72);
  return Math.round(base * 0.6);
}

function Photo({
  post,
  theme,
  objectPosition = "50% 50%",
}: {
  post: RoadmapPost;
  theme: CardTokens;
  objectPosition?: string;
}) {
  // A missing or broken image (deleted file, expired URL, unreachable host) must
  // degrade to the placeholder rather than a browser broken-image icon — the card is
  // exported as an image, so an icon would be baked into the customer's artwork.
  const [failed, setFailed] = useState(false);
  if (post.image_url && !failed) {
    return (
      <img
        src={post.image_url}
        alt=""
        onError={() => setFailed(true)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition,
          display: "block",
        }}
      />
    );
  }
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `linear-gradient(140deg, ${alpha(theme.primary, 0.92)}, ${alpha(theme.ink, 0.96)})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: alpha("#ffffff", 0.72),
        fontSize: 30,
        fontWeight: 700,
      }}
    >
      התמונה בהכנה
    </div>
  );
}

function Badge({
  text,
  bg,
  fg,
  size = 26,
}: {
  text?: string;
  bg: string;
  fg: string;
  size?: number;
}) {
  if (!text?.trim()) return null;
  return (
    <span
      style={{
        display: "inline-block",
        // Without this a flex column stretches the badge into a full-width bar.
        alignSelf: "flex-start",
        background: bg,
        color: fg,
        fontSize: size,
        fontWeight: 800,
        letterSpacing: "0.1em",
        padding: `${Math.round(size * 0.38)}px ${Math.round(size * 0.85)}px`,
        borderRadius: 999,
        lineHeight: 1.15,
      }}
    >
      {text}
    </span>
  );
}

/**
 * `cta` comes back from the model as a full sentence ("שריון חלות לשישי: נכנסים
 * לקבוצה..."), but it lands in a chip sized for a few words. A sentence there wraps
 * into a broken block and overflows the card.
 *
 * Take the leading clause when it reads as a standalone label. If that clause just
 * repeats the headline (common, because the model restates the offer before the
 * instruction), fall through to the next clause. If nothing short qualifies, drop the
 * chip entirely — the caption already carries the call to action.
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
    // Skip a clause that merely echoes the headline.
    if (head && (norm(clause) === head || head.includes(norm(clause)))) continue;
    return clause;
  }
  return "";
}

function Headline({
  text,
  color,
  size,
  marginTop = 24,
}: {
  text: string;
  color: string;
  size: number;
  marginTop?: number;
}) {
  if (!text.trim()) return null;
  return (
    <h1
      style={{
        margin: `${marginTop}px 0 0`,
        fontSize: size,
        fontWeight: 900,
        lineHeight: 1.06,
        letterSpacing: "-0.02em",
        color,
        textWrap: "balance",
        // Cap the block so a runaway headline can never overflow the card.
        display: "-webkit-box",
        WebkitLineClamp: 3,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}
    >
      {text}
    </h1>
  );
}

function CtaChip({ text, bg, fg }: { text?: string; bg: string; fg: string }) {
  if (!text?.trim()) return null;
  return (
    <span
      style={{
        alignSelf: "flex-start",
        background: bg,
        color: fg,
        fontSize: 30,
        fontWeight: 800,
        padding: "16px 34px",
        borderRadius: 999,
        lineHeight: 1.2,
        // A chip is a single line by definition; clip rather than wrap.
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: "100%",
      }}
    >
      {text}
    </span>
  );
}

/**
 * A specific, verifiable number — "100 חלות כל שישי", "07:00 מהתנור", "3 דורות".
 *
 * Specific numbers consistently beat generic claims because audiences have learned to
 * discount vague superlatives, and specificity implies measurement. Rendered large so
 * it functions as a second visual anchor under the headline.
 */
function StatLine({
  text,
  color,
  size = 52,
  marginTop = 22,
}: {
  text?: string;
  color: string;
  size?: number;
  marginTop?: number;
}) {
  const value = (text || "").trim();
  if (!value) return null;
  return (
    <p
      style={{
        margin: `${marginTop}px 0 0`,
        fontSize: size,
        fontWeight: 900,
        lineHeight: 1.12,
        letterSpacing: "-0.01em",
        color,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {value}
    </p>
  );
}

export function CardCanvas({
  post,
  brand,
  businessName,
  size,
  canvasRef,
}: {
  post: RoadmapPost;
  brand?: BrandLanguage | null;
  businessName: string;
  size: { w: number; h: number };
  canvasRef?: React.Ref<HTMLDivElement>;
}) {
  const t = cardTokens(brand);
  const template = resolveTemplate(post.overlay_theme);
  const show =
    post.has_overlay !== undefined
      ? Boolean(post.has_overlay)
      : Boolean((post.overlay_headline || post.overlay_text || "").trim());
  const headline = (post.overlay_headline || post.overlay_text || "").trim();
  const badge = (post.overlay_badge || "").trim();
  const cta = shortCta(post.cta, headline);
  // The model often puts the number in BOTH the headline and stat_highlight, which
  // printed the same figure twice on one card. Show the stat only when it adds
  // something the headline does not already say.
  const statRaw = (post.stat_highlight || "").trim();
  const _norm = (v: string) => v.replace(/[\s"'״׳.,:!?%₪-]+/g, "");
  const stat =
    statRaw && !_norm(headline).includes(_norm(statRaw)) && !_norm(statRaw).includes(_norm(headline))
      ? statRaw
      : "";
  const { w, h } = size;

  const root: React.CSSProperties = {
    position: "relative",
    width: w,
    height: h,
    overflow: "hidden",
    background: t.ink,
    fontFamily: "var(--font-heebo), Arial, sans-serif",
    // Hebrew needs the bidi base direction set explicitly.
    direction: "rtl",
    textAlign: "right",
  };

  // A photo-free template needs no plate; skip straight to the typographic layout
  // even when the post has no image_url (nothing was generated, by design).
  if (template === "type_hero" && (headline || badge || stat)) {
    return (
      <div
        ref={canvasRef}
        style={{
          ...root,
          background: t.primary,
          color: t.onPrimary,
          padding: Math.round(PAD * 1.1),
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div>
          <span
            style={{
              width: 64,
              height: 8,
              background: t.accent,
              borderRadius: 99,
              display: "inline-block",
            }}
          />
          <span style={{ marginInlineStart: 18, fontSize: 30, fontWeight: 800, color: alpha(t.onPrimary, 0.85) }}>
            {businessName}
          </span>
        </div>

        {/* Message and CTA centred as one block. Pinning the CTA to the bottom
            instead left a large dead gap between the two. */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <Badge text={badge} bg={t.accent} fg={t.onAccent} />
          <Headline
            text={headline}
            color={t.onPrimary}
            size={headlineSize(headline, 124)}
            marginTop={26}
          />
          <StatLine text={stat} color={t.accent} marginTop={26} />
          {cta ? (
            <div style={{ marginTop: 46 }}>
              <CtaChip text={cta} bg={t.accent} fg={t.onAccent} />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // No overlay requested: the plate is the card.
  if (!show || (!headline && !badge)) {
    return (
      <div ref={canvasRef} style={root}>
        <Photo post={post} theme={t} />
      </div>
    );
  }

  const hSize = headlineSize(headline);

  if (template === "split_panel") {
    // The panel is sized by its CONTENT, not a fixed fraction. With a fixed 72/28 the
    // panel overflowed as soon as a stat line was added, and the headline, stat and CTA
    // ended up on top of each other. The photo simply takes whatever is left.
    return (
      <div ref={canvasRef} style={{ ...root, display: "flex", flexDirection: "column" }}>
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <Photo post={post} theme={t} objectPosition="50% 42%" />
        </div>
        <div
          style={{
            position: "relative",
            flexShrink: 0,
            background: t.background,
            padding: Math.round(PAD * 0.86),
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Badge text={badge} bg={t.primary} fg={t.onPrimary} />
          <Headline text={headline} color={t.ink} size={Math.round(hSize * 0.92)} marginTop={18} />
          <StatLine text={stat} color={t.primary} size={42} marginTop={14} />
          <div style={{ marginTop: 26 }}>
            <CtaChip text={cta} bg={t.accent} fg={t.onAccent} />
          </div>
        </div>
      </div>
    );
  }

  if (template === "framed_inset") {
    return (
      <div
        ref={canvasRef}
        style={{
          ...root,
          background: t.background,
          padding: Math.round(PAD * 0.78),
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* flex:1 lets the photo absorb the leftover height instead of leaving a gap */}
        <div
          style={{
            position: "relative",
            flex: 1,
            minHeight: 0,
            borderRadius: 28,
            overflow: "hidden",
          }}
        >
          <Photo post={post} theme={t} objectPosition="50% 40%" />
        </div>
        <div style={{ marginTop: 44 }}>
          <Badge text={badge} bg={t.primary} fg={t.onPrimary} />
          <Headline text={headline} color={t.ink} size={Math.round(hSize * 0.88)} marginTop={18} />
          <div style={{ marginTop: 32 }}>
            <CtaChip text={cta} bg={t.accent} fg={t.onAccent} />
          </div>
        </div>
      </div>
    );
  }

  if (template === "cover_type") {
    return (
      <div ref={canvasRef} style={root}>
        <Photo post={post} theme={t} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(to bottom, ${alpha(t.scrim, 0.88)} 0%, ${alpha(
              t.scrim,
              0.55,
            )} 32%, ${alpha(t.scrim, 0)} 64%)`,
          }}
        />
        <div style={{ position: "absolute", top: PAD, left: PAD, right: PAD }}>
          <Headline text={headline} color={t.onPhoto} size={Math.round(hSize * 1.08)} marginTop={0} />
          <div style={{ marginTop: 30 }}>
            <Badge text={badge} bg={t.accent} fg={t.onAccent} />
          </div>
        </div>
        {/* The footer sits low where photos are often brightest — scrim it too. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "26%",
            background: `linear-gradient(to top, ${alpha(t.scrim, 0.9)} 0%, ${alpha(
              t.scrim,
              0.55,
            )} 42%, ${alpha(t.scrim, 0)} 100%)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: PAD,
            right: PAD,
            bottom: PAD,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <span style={{ width: 56, height: 5, background: t.accent, borderRadius: 99 }} />
          <span style={{ fontSize: 30, fontWeight: 700, color: alpha("#ffffff", 0.85) }}>
            {businessName}
          </span>
        </div>
      </div>
    );
  }

  if (template === "promo_ribbon") {
    return (
      <div ref={canvasRef} style={root}>
        <Photo post={post} theme={t} />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            background: t.accent,
            color: t.onAccent,
            padding: `26px ${PAD}px`,
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: "0.06em",
            textAlign: "center",
          }}
        >
          {badge || headline}
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            background: alpha(t.scrim, 0.93),
            padding: PAD,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Headline text={badge ? headline : ""} color={t.onPhoto} size={Math.round(hSize * 0.95)} marginTop={0} />
          <div style={{ marginTop: 32 }}>
            <CtaChip text={cta} bg={t.accent} fg={t.onAccent} />
          </div>
        </div>
      </div>
    );
  }

  // lower_editorial (default)
  return (
    <div ref={canvasRef} style={root}>
      <Photo post={post} theme={t} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(to top, ${alpha(t.scrim, 0.95)} 0%, ${alpha(
            t.scrim,
            0.86,
          )} 24%, ${alpha(t.scrim, 0.42)} 52%, ${alpha(t.scrim, 0)} 76%)`,
        }}
      />
      <div style={{ position: "absolute", left: PAD, right: PAD, bottom: PAD }}>
        <Badge text={badge} bg={t.accent} fg={t.onAccent} />
        <Headline text={headline} color={t.onPhoto} size={hSize} />
        <div style={{ marginTop: 30, display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ width: 56, height: 5, background: t.accent, borderRadius: 99 }} />
          <span style={{ fontSize: 30, fontWeight: 700, color: alpha("#ffffff", 0.85) }}>
            {businessName}
          </span>
        </div>
      </div>
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
  businessName,
  className,
  canvasRef,
  rounded = true,
  fill = false,
  ratio,
}: {
  post: RoadmapPost;
  brand?: BrandLanguage | null;
  businessName: string;
  className?: string;
  canvasRef?: React.Ref<HTMLDivElement>;
  rounded?: boolean;
  /** When true the stage fills its parent box instead of setting its own aspect. */
  fill?: boolean;
  /** Override the format's default aspect ratio (e.g. square for a Meta feed). */
  ratio?: CardRatio;
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
      const next = fill
        ? Math.min(rect.width / size.w, (rect.height || Infinity) / size.h)
        : rect.width / size.w;
      if (next > 0 && Number.isFinite(next)) setScale(next);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [size.w, size.h, fill]);

  const hostStyle: React.CSSProperties = fill
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
    <div
      ref={hostRef}
      className={className}
      data-card-stage={resolveTemplate(post.overlay_theme)}
      style={hostStyle}
    >
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
          <CardCanvas
            post={post}
            brand={brand}
            businessName={businessName}
            size={size}
            canvasRef={canvasRef}
          />
        </div>
      ) : null}
    </div>
  );
}
