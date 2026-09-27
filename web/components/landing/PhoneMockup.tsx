"use client";

import { CardStage } from "@/components/CardCanvas";
import { cardBrand, cardPost, swatch } from "./cards";
import type { LandingExample } from "./examples";

/** The width the phone draws its card at, for next/image's `sizes`. */
const CARD_SIZES = "(min-width: 640px) 284px, 256px";

/**
 * A generic phone showing the example post in a neutral social-feed frame: avatar,
 * business name, the card, a few plain icons and the caption. Deliberately no real
 * platform's chrome, and no like or view counts: we do not invent engagement.
 *
 * Every business's screen is mounted and stacked, so switching is a cross-fade and the
 * photos are already loaded (lazily, when the section comes near the viewport).
 */
export function PhoneMockup({ examples, current }: { examples: LandingExample[]; current: number }) {
  return (
    <div className="relative mx-auto w-[276px] sm:w-[304px]">
      {/* Soft coloured glow under the device. */}
      <div aria-hidden className="absolute inset-x-6 -bottom-6 top-16 rounded-[48px] bg-[var(--lp-accent)] opacity-25 blur-3xl" />
      <div className="relative rounded-[46px] bg-[#17191b] p-[10px] shadow-[0_50px_90px_-40px_rgba(25,27,24,0.65),inset_0_0_0_1px_rgba(255,255,255,0.08)]">
        <div className="relative overflow-hidden rounded-[37px] bg-white">
          <StatusBar />
          <div className="lp-stack">
            {examples.map((example, index) => (
              <Screen key={example.slug} example={example} current={index === current} />
            ))}
          </div>
        </div>
      </div>

      {/* Who the post is for and why now, floating beside the device on wide screens. Both sit
          over the photo, never over the caption. */}
      {examples.map((example, index) => (
        <div key={example.slug} aria-hidden={index !== current}>
          <Note current={index === current} label="למי" value={example.why.audience} className="-left-28 top-12" delay={260} />
          <Note current={index === current} label="מתי" value={example.why.timing} className="-left-28 top-[46%]" delay={380} />
        </div>
      ))}
    </div>
  );
}

function Note({
  current,
  label,
  value,
  className,
  delay,
}: {
  current: boolean;
  label: string;
  value: string;
  className: string;
  delay: number;
}) {
  return (
    <div
      data-current={current}
      className={`lp-screen lp-note absolute hidden w-[176px] rounded-[16px] border border-[#ebe8e0] bg-white/95 px-3.5 py-2.5 shadow-[0_18px_40px_-20px_rgba(25,27,24,0.45)] backdrop-blur xl:block ${className}`}
      style={{ ["--d" as string]: `${delay}ms` }}
    >
      <p className="text-[11px] font-bold text-[#6d7068]">{label}</p>
      <p className="mt-0.5 text-sm font-black leading-5 text-[#191b18]">{value}</p>
    </div>
  );
}

function StatusBar() {
  return (
    <div aria-hidden className="relative flex h-8 items-center justify-between px-6 pt-1 text-[11px] font-bold text-[#191b18]">
      <span dir="ltr">08:30</span>
      <span className="absolute left-1/2 top-2 h-[18px] w-[76px] -translate-x-1/2 rounded-full bg-[#17191b]" />
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

function Screen({ example, current }: { example: LandingExample; current: boolean }) {
  const primary = swatch(example.palette, "primary");
  const card = {
    businessName: example.businessName,
    palette: example.palette,
    template: example.template,
    image: example.image,
    headline: example.post.overlayHeadline,
    badge: example.post.overlayBadge,
    cta: example.post.cta,
    audience: example.why.audience,
  };
  return (
    <div data-current={current} aria-hidden={!current} className="lp-screen bg-white pb-5">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <span
          aria-hidden
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-black text-white shadow-[0_0_0_2px_white,0_0_0_3.5px_var(--lp-ring)]"
          style={{ backgroundColor: primary, ["--lp-ring" as string]: primary }}
        >
          {example.businessName.charAt(0)}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[13px] font-black text-[#191b18]">{example.businessName}</p>
          <p className="truncate text-[11px] text-[#6d7068]">{example.city}</p>
        </div>
        <svg aria-hidden viewBox="0 0 20 4" className="ms-auto h-1 w-4 text-[#191b18]" fill="currentColor">
          <circle cx="2" cy="2" r="2" />
          <circle cx="10" cy="2" r="2" />
          <circle cx="18" cy="2" r="2" />
        </svg>
      </div>

      <div role="img" aria-label={`הפוסט של ${example.businessName}: ${example.post.overlayHeadline}`}>
        <CardStage
          post={cardPost(card)}
          brand={cardBrand(card)}
          businessName={example.businessName}
          rounded={false}
          photoSizes={CARD_SIZES}
        />
      </div>

      <div aria-hidden className="flex items-center gap-3.5 px-3.5 pt-3 text-[#191b18]">
        <Icon d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z" />
        <Icon d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.5Z" />
        <Icon d="M15 5h4v4M19 5l-8 8M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10" />
        <span className="ms-auto">
          <Icon d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z" />
        </span>
      </div>

      <p className="line-clamp-3 px-3.5 pt-2 text-[12.5px] leading-[1.55] text-[#34372f]">
        <span className="font-black text-[#191b18]">{example.businessName} </span>
        {example.post.caption}
      </p>
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
