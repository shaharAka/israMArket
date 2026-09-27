import type { CSSProperties, ReactNode } from "react";
import { swatch } from "./cards";
import type { LandingExample } from "./examples";

/**
 * One business's month, drawn like the app's own plan screen: what the research found,
 * the direction for the month, and what gets checked at the end. This is the hero of
 * the showcase. The post is only what the plan produces, so it sits beside it.
 *
 * Purely presentational: the parent stacks one per business and decides which is
 * current (`data-current`) and when its rows animate in (`data-reveal`).
 */
export function PlanPanel({
  example,
  current,
  reveal,
}: {
  example: LandingExample;
  current: boolean;
  reveal: boolean;
}) {
  const primary = swatch(example.palette, "primary");
  const accent = swatch(example.palette, "accent", primary);
  // Labels in the business colour, darkened so a light primary still reads on white.
  const ink = `color-mix(in oklab, ${primary} 82%, black)`;
  return (
    <article
      data-current={current}
      data-reveal={reveal}
      aria-hidden={!current}
      className="lp-slide flex flex-col overflow-hidden rounded-[24px] border border-[#e6e3da] bg-white shadow-[0_40px_80px_-48px_rgba(25,27,24,0.45),0_2px_6px_-2px_rgba(25,27,24,0.06)]"
      style={{ "--lp-primary": primary } as CSSProperties}
    >
      <header className="lp-reveal flex items-center gap-3 border-b border-[#efede6] px-5 py-4 sm:px-7" style={{ "--i": 0 } as CSSProperties}>
        <span
          aria-hidden
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-black text-white"
          style={{ backgroundColor: primary }}
        >
          {example.businessName.charAt(0)}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-base font-black leading-tight text-[#191b18] sm:text-lg">{example.businessName}</h3>
          <p className="truncate text-sm text-[#5e6159]">
            {example.typeLabel} · {example.city}
          </p>
        </div>
        <span className="ms-auto hidden shrink-0 rounded-full border border-[#e6e3da] bg-[#f7f5f0] px-3 py-1 sm:inline text-xs font-bold text-[#4f524b]">
          התוכנית לחודש
        </span>
      </header>

      <ol className="relative flex-1 space-y-6 px-5 pb-7 pt-6 sm:px-7 sm:pt-7">
        {/* The thread that ties the three steps into one plan. */}
        <span
          aria-hidden
          className="absolute bottom-10 top-9 w-px bg-[#e6e3da] [inset-inline-start:2.25rem] sm:[inset-inline-start:2.75rem]"
        />

        <Step index={1} label="מה גילינו" color={ink} i={1}>
          <p className="text-xl font-bold leading-[1.45] text-[#191b18] [text-wrap:pretty] sm:text-[1.6rem] sm:leading-[1.4]">
            {example.insight}
          </p>
          <p className="lp-reveal mt-3 flex flex-wrap items-center gap-1.5 text-xs text-[#6d7068]" style={{ "--i": 2 } as CSSProperties}>
            <span>מתוך:</span>
            {example.sources.map((source) => (
              <span key={source} className="rounded-full border border-[#e6e3da] bg-[#faf9f6] px-2.5 py-0.5 font-bold text-[#4f524b]">
                {source}
              </span>
            ))}
          </p>
        </Step>

        <Step index={2} label="הכיוון לחודש" color={ink} i={3}>
          <p
            className="rounded-[16px] px-4 py-3.5 text-lg font-black leading-[1.45] [text-wrap:pretty] sm:text-xl"
            style={{
              backgroundColor: `color-mix(in oklab, ${primary} 9%, white)`,
              color: `color-mix(in oklab, ${primary} 78%, black)`,
              boxShadow: `inset -3px 0 0 ${accent}`,
            }}
          >
            {example.direction}
          </p>
        </Step>

        <Step index={3} label="בסוף החודש בודקים" color={ink} i={4}>
          <p className="flex items-start gap-2.5 text-base font-bold leading-7 text-[#34372f] sm:text-lg">
            <span
              aria-hidden
              className="mt-1.5 inline-block h-4 w-4 shrink-0 rounded-[5px] border-2"
              style={{ borderColor: primary }}
            />
            {example.check}
          </p>
        </Step>
      </ol>
    </article>
  );
}

function Step({
  index,
  label,
  color,
  i,
  children,
}: {
  index: number;
  label: string;
  color: string;
  i: number;
  children: ReactNode;
}) {
  return (
    <li className="lp-reveal relative flex gap-4" style={{ "--i": i } as CSSProperties}>
      <span
        aria-hidden
        className="relative z-[1] inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 bg-white text-sm font-black"
        style={{ borderColor: color, color }}
      >
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 text-sm font-bold" style={{ color }}>
          {label}
        </p>
        {children}
      </div>
    </li>
  );
}
