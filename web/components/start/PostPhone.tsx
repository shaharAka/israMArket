"use client";

/* eslint-disable @next/next/no-img-element -- the logo is a remote scan result, any host */

import { useId, useRef, useState } from "react";
import { CardStage, needsPhoto, resolveTemplate } from "@/components/CardCanvas";
import type { BrandLanguage, BrandSwatch, PostIdea, RoadmapPost } from "@/lib/api";
import { WhyBlock, formatLabel } from "./IdeaCard";
import { inkOn } from "./ui";

/**
 * One sample post as it would appear in a feed: a phone (adapted from the landing page's
 * PhoneMockup), the real card template in the business's colours and logo, the caption,
 * and a photo slot the owner can fill now. No like or view counts: we do not invent
 * engagement.
 */

/**
 * A post written for a strategy, as the (Revision 4) sample-post endpoint returned it. The
 * onboarding no longer shows sample posts (Revision 5: the plan is the hook); this renderer
 * and its photo slot stay for the app's post editor.
 */
export type SamplePost = {
  title: string;
  format: PostIdea["format"];
  hook: string;
  caption: string;
  cta: string;
  overlay_headline: string;
  template: string;
  badge?: string;
  pillar_key: string;
  photo: { site_url?: string; hint_he: string };
  why: PostIdea["why"];
};

const NEUTRAL: BrandSwatch[] = [
  { hex: "#2B2D28", role: "primary", name: "" },
  { hex: "#C9A45C", role: "accent", name: "" },
  { hex: "#F4F1EA", role: "background", name: "" },
  { hex: "#191B18", role: "ink", name: "" },
];

/** The card renderer paints from the palette only; the rest of BrandLanguage stays empty. */
export function brandFromPalette(name: string, palette: BrandSwatch[] | null): BrandLanguage {
  return {
    business_name: name,
    palette: palette?.length ? palette : NEUTRAL,
    typography: { primary: "", mood: "" },
    visual_style: "",
    photography: "",
    voice: "",
    voice_examples: [],
    do_say: [],
    dont_say: [],
    messaging: [],
    offers_seen: [],
    audience: "",
    logo_description: "",
  };
}

function hexOf(palette: BrandSwatch[] | null, role: BrandSwatch["role"], fallback: string): string {
  return palette?.find((s) => s.role === role)?.hex ?? fallback;
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[ch] ?? ch);
}

/** SVG text ignores the page direction: an explicit right-to-left embedding (Latin words still misplace, so the copy here stays Hebrew-only). */
function rtl(text: string): string {
  return `‫${escapeXml(text)}‬`;
}

function wrap(text: string, max = 26): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if ((line + " " + word).trim().length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

/**
 * The empty photo slot, drawn into the card itself at card resolution: a light frame in
 * the brand's colours with what to shoot. Centred in the upper half, so every template's
 * headline area stays clear.
 */
export function placeholderPhoto(hint: string, palette: BrandSwatch[] | null, mode: "shoot" | "ai"): string {
  const bg = hexOf(palette, "background", "#F4F1EA");
  const primary = hexOf(palette, "primary", "#2B2D28");
  const ink = inkOn(bg) === "#ffffff" ? "#ffffff" : hexOf(palette, "ink", "#191B18");
  const title = mode === "ai" ? "כאן תהיה תמונה שניצור בשבילכם" : "כאן תבוא התמונה שלכם";
  const lines = wrap(hint);
  const top = 420;
  const text = lines
    .map((line, i) => `<text x="540" y="${top + 150 + i * 64}" font-size="50" fill="${ink}" fill-opacity="0.72">${rtl(line)}</text>`)
    .join("");
  const icon =
    mode === "ai"
      ? `<path d="M540 ${top - 80} l14 36 36 14 -36 14 -14 36 -14 -36 -36 -14 36 -14z" fill="${primary}"/>`
      : `<g transform="translate(486 ${top - 104})" fill="none" stroke="${primary}" stroke-width="7" stroke-linejoin="round"><path d="M8 24h24l10-16h28l10 16h24v64H8z"/><circle cx="54" cy="56" r="18"/></g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
<defs><pattern id="p" width="36" height="36" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="36" height="36" fill="${bg}"/><rect width="2" height="36" fill="${primary}" fill-opacity="0.07"/></pattern></defs>
<rect width="1080" height="1350" fill="url(#p)"/>
<rect x="110" y="${top - 170}" width="860" height="${260 + lines.length * 64}" rx="36" fill="${bg}" fill-opacity="0.9" stroke="${primary}" stroke-opacity="0.45" stroke-width="5" stroke-dasharray="22 16"/>
${icon}
<g font-family="Heebo, Arial, sans-serif" text-anchor="middle" direction="rtl">
<text x="540" y="${top + 70}" font-size="60" font-weight="800" fill="${ink}">${rtl(title)}</text>
${text}
</g>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export type PhotoState =
  | { kind: "upload"; url: string | null }
  | { kind: "site"; url: string }
  | { kind: "ai_later" }
  | { kind: "none" };

function toCardPost(post: SamplePost, imageUrl?: string): RoadmapPost {
  return {
    week: 1,
    date_hint: "",
    format: post.format,
    title: post.title,
    angle: "",
    hook: post.hook,
    caption: post.caption,
    cta: post.cta,
    calendar_tie: "",
    goal_fit: "",
    overlay_theme: resolveTemplate(post.template),
    has_overlay: true,
    overlay_headline: post.overlay_headline || post.title,
    overlay_badge: post.badge,
    image_url: imageUrl,
  };
}

export function PostPhone({
  post,
  index,
  total,
  businessName,
  palette,
  logoUrl,
  pillarTitle,
  photo,
  camera,
  error,
  onFile,
  onRemove,
  onAiLater,
}: {
  post: SamplePost;
  index: number;
  total: number;
  businessName: string;
  palette: BrandSwatch[] | null;
  logoUrl: string | null;
  pillarTitle?: string;
  photo: PhotoState;
  /** Offer "לצלם עכשיו" (a phone or tablet camera). */
  camera: boolean;
  error: string;
  onFile: (file: File) => void;
  onRemove: () => void;
  onAiLater: (on: boolean) => void;
}) {
  const wantsPhoto = needsPhoto(post.template);
  const imageUrl = !wantsPhoto
    ? undefined
    : photo.kind === "upload" || photo.kind === "site"
      ? (photo.url ?? undefined)
      : placeholderPhoto(post.photo.hint_he, palette, photo.kind === "ai_later" ? "ai" : "shoot");
  const primary = hexOf(palette, "primary", "#2B2D28");
  const [captionOpen, setCaptionOpen] = useState(false);
  const captionId = useId();

  return (
    <figure aria-label={`פוסט ${index + 1} מתוך ${total}: ${post.title}`} className="m-0">
      <div className="relative mx-auto w-full max-w-[18rem]">
        <div className="relative rounded-[40px] bg-[#17191b] p-[9px] shadow-[0_40px_70px_-40px_rgba(25,27,24,0.6),inset_0_0_0_1px_rgba(255,255,255,0.08)]">
          <div className="relative overflow-hidden rounded-[32px] bg-white">
            <StatusBar />
            <div className="flex items-center gap-2.5 px-3 py-2">
              {logoUrl ? (
                <img src={logoUrl} alt="" referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-full border border-black/10 bg-white object-contain p-0.5" />
              ) : (
                <span
                  aria-hidden
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-black"
                  style={{ backgroundColor: primary, color: inkOn(primary) }}
                >
                  {businessName.trim().charAt(0) || "·"}
                </span>
              )}
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[13px] font-black text-[#191b18]">{businessName || "העסק שלכם"}</p>
                <p className="truncate text-[11px] text-[#6d7068]">{formatLabel(post.format)} · שבוע 1</p>
              </div>
            </div>

            <div role="img" aria-label={`הפוסט: ${post.overlay_headline || post.title}`}>
              <CardStage
                post={toCardPost(post, imageUrl)}
                brand={brandFromPalette(businessName, palette)}
                businessName={businessName}
                rounded={false}
                ratio="4:5"
                logoUrl={logoUrl ?? undefined}
              />
            </div>

            <PhotoBar
              index={index}
              wantsPhoto={wantsPhoto}
              hint={post.photo.hint_he}
              photo={photo}
              camera={camera}
              onFile={onFile}
              onRemove={onRemove}
              onAiLater={onAiLater}
            />
            {error ? (
              <p role="alert" className="px-3 pb-1 text-xs font-bold leading-5 text-[#9f4330]">
                {error}
              </p>
            ) : null}

            <div className="px-3 pb-4 pt-1">
              <p id={captionId} className={`text-[12.5px] leading-[1.55] text-[#34372f] ${captionOpen ? "" : "line-clamp-3"}`}>
                <span className="font-black text-[#191b18]">{businessName} </span>
                {post.caption}
              </p>
              <button
                type="button"
                aria-expanded={captionOpen}
                aria-controls={captionId}
                onClick={() => setCaptionOpen((v) => !v)}
                className="-mb-2 inline-flex min-h-9 cursor-pointer items-center text-[12px] text-[#6d7068]"
              >
                {captionOpen ? "פחות" : "לקרוא הכול"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <figcaption className="mx-auto mt-3 w-full max-w-[18rem] space-y-2">
        <div className="flex flex-wrap gap-1.5 text-[11px] font-bold text-[#4f524b]">
          <span className="rounded-full bg-[#f1efe8] px-2 py-0.5">{formatLabel(post.format)}</span>
          {pillarTitle ? <span className="rounded-full bg-[#f1efe8] px-2 py-0.5">נושא: {pillarTitle}</span> : null}
        </div>
        <p className="text-sm font-black leading-5 text-[#191b18]">{post.hook}</p>
        <WhyBlock idea={post} compact />
      </figcaption>
    </figure>
  );
}

const SMALL_BUTTON =
  "inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-full border border-[#c7c4b8] bg-white px-3 text-[12px] font-bold text-[#191b18] hover:border-[#191b18]";

/** The photo slot's controls, right under the card, where a feed's action row would be. */
function PhotoBar({
  index,
  wantsPhoto,
  hint,
  photo,
  camera,
  onFile,
  onRemove,
  onAiLater,
}: {
  index: number;
  wantsPhoto: boolean;
  hint: string;
  photo: PhotoState;
  camera: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
  onAiLater: (on: boolean) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const n = index + 1;

  if (!wantsPhoto) {
    return <p className="px-3 pt-2.5 text-[12px] leading-5 text-[#6d7068]">פוסט טקסט בצבעים שלכם. לא צריך תמונה.</p>;
  }

  const pick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onFile(file);
  };
  const inputs = (
    <>
      <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={pick} tabIndex={-1} aria-hidden />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={pick}
        tabIndex={-1}
        aria-hidden
      />
    </>
  );
  const uploadButton = (label: string) => (
    <button type="button" onClick={() => fileInput.current?.click()} aria-label={`${label} לפוסט ${n}`} className={SMALL_BUTTON}>
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        <path d="M8 11V3M4.5 6.5 8 3l3.5 3.5M3 13h10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
  const cameraButton = camera ? (
    <button type="button" onClick={() => cameraInput.current?.click()} aria-label={`לצלם עכשיו לפוסט ${n}`} className={SMALL_BUTTON}>
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
        <path d="M2 5h2.5l1.2-2h4.6l1.2 2H14v8H2z" strokeLinejoin="round" />
        <circle cx="8" cy="9" r="2.3" />
      </svg>
      לצלם עכשיו
    </button>
  ) : null;

  if (photo.kind === "upload") {
    return (
      <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
        {inputs}
        <span className="inline-flex items-center gap-1 text-[12px] font-bold text-[#2f5d2a]">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
            <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          התמונה שלכם
        </span>
        {uploadButton("להחליף")}
        <button type="button" onClick={onRemove} aria-label={`להסיר את התמונה מפוסט ${n}`} className="min-h-10 cursor-pointer px-1 text-[12px] text-[#6d7068] underline underline-offset-4">
          להסיר
        </button>
      </div>
    );
  }

  if (photo.kind === "ai_later") {
    return (
      <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
        {inputs}
        <span className="text-[12px] font-bold text-[#191b18]">ה-AI ייצור תמונה אחרי ההרשמה.</span>
        <button type="button" onClick={() => onAiLater(false)} aria-label={`לבטל את התמונה מ-AI בפוסט ${n}`} className="min-h-10 cursor-pointer px-1 text-[12px] text-[#6d7068] underline underline-offset-4">
          לבטל
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 pt-2.5">
      {inputs}
      <p className="text-[12px] leading-5 text-[#34372f]">
        <b className="text-[#191b18]">{photo.kind === "site" ? "תמונה מהאתר שלכם. " : "מה לצלם: "}</b>
        {photo.kind === "site" ? "אפשר גם תמונה אחרת." : hint}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {uploadButton(photo.kind === "site" ? "להעלות אחרת" : "להעלות תמונה")}
        {cameraButton}
        {photo.kind === "none" ? (
          <button type="button" onClick={() => onAiLater(true)} aria-label={`שה-AI ייצור תמונה לפוסט ${n} אחר כך`} className={SMALL_BUTTON}>
            שה-AI ייצור אחר כך
          </button>
        ) : null}
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div aria-hidden className="relative flex h-7 items-center justify-between px-5 pt-1 text-[11px] font-bold text-[#191b18]">
      <span dir="ltr">08:30</span>
      <span className="absolute left-1/2 top-1.5 h-[16px] w-[68px] -translate-x-1/2 rounded-full bg-[#17191b]" />
      <span className="flex items-center gap-1" dir="ltr">
        <svg viewBox="0 0 16 10" className="h-2.5 w-4" fill="currentColor">
          <rect x="0" y="6" width="3" height="4" rx="0.8" />
          <rect x="4.3" y="4" width="3" height="6" rx="0.8" />
          <rect x="8.6" y="2" width="3" height="8" rx="0.8" />
          <rect x="12.9" y="0" width="3" height="10" rx="0.8" opacity="0.35" />
        </svg>
        <svg viewBox="0 0 24 11" className="h-2.5 w-6" fill="none" stroke="currentColor">
          <rect x="0.5" y="0.5" width="20" height="10" rx="2.5" opacity="0.5" />
          <rect x="2" y="2" width="13" height="7" rx="1.5" fill="currentColor" stroke="none" />
          <path d="M22.5 4v3" strokeLinecap="round" opacity="0.5" />
        </svg>
      </span>
    </div>
  );
}
