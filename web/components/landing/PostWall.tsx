"use client";

import { useState, type CSSProperties } from "react";
import { CardStage } from "@/components/CardCanvas";
import { cardBrand, cardPost, swatch } from "./cards";
import { WALL_ROWS, type WallCard } from "./wall";

const CARD_SIZES = "(min-width: 640px) 232px, 188px";

/**
 * "עוד דוגמאות": two rows of post cards drifting slowly in opposite directions.
 *
 * Pure CSS marquee (landing.css): each row renders its cards twice and slides by exactly
 * one copy, so the loop has no seam. The second copy is hidden from assistive tech and
 * inert. Motion pauses on hover and on focus, and a visible toggle stops it for anyone
 * who cannot hover (WCAG 2.2.2). Under reduced motion the rows become a static grid.
 */
export function PostWall() {
  const [paused, setPaused] = useState(false);
  return (
    <section aria-labelledby="wall-title" className="lp-wall overflow-hidden border-t border-[#ebe8e0] bg-[#fbfaf8] py-12 sm:py-16" data-paused={paused}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-3 px-4 sm:px-8">
        <div>
          <h2 id="wall-title" className="text-2xl font-black tracking-tight sm:text-[2rem]">
            עוד דוגמאות
          </h2>
          <p className="mt-1.5 text-sm text-[#5e6159] sm:text-base">פוסט אחד מכל עסק, ולמה דווקא הוא. גם אלה עסקים בדויים.</p>
        </div>
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          aria-pressed={paused}
          className="lp-motion-toggle inline-flex min-h-11 items-center gap-2 rounded-full border border-[#e1ded4] bg-white px-4 text-sm font-bold text-[#34372f] transition-colors hover:border-[#c7c4b7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#191b18] focus-visible:ring-offset-2"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
            {paused ? <path d="M4 2.5v11l9-5.5-9-5.5Z" /> : <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" />}
          </svg>
          {paused ? "להפעיל את התנועה" : "לעצור את התנועה"}
        </button>
      </div>

      <div className="mt-6 space-y-1 sm:mt-8">
        {WALL_ROWS.map((row, rowIndex) => (
          <div key={rowIndex} className="lp-row">
            <div
              className="lp-track"
              data-direction={rowIndex === 0 ? "a" : "b"}
              style={{ "--lp-speed": rowIndex === 0 ? "80s" : "92s" } as CSSProperties}
            >
              <ul className="lp-copy" aria-label={rowIndex === 0 ? "דוגמאות, שורה ראשונה" : "דוגמאות, שורה שנייה"}>
                {row.map((card) => (
                  <li key={card.slug}>
                    <WallPost card={card} />
                  </li>
                ))}
              </ul>
              <ul className="lp-copy" aria-hidden="true" inert>
                {row.map((card) => (
                  <li key={card.slug}>
                    <WallPost card={card} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WallPost({ card }: { card: WallCard }) {
  const primary = swatch(card.palette, "primary");
  return (
    <article className="lp-card w-[204px] shrink-0 rounded-[20px] border border-[#e8e5dc] bg-white p-2 shadow-[0_8px_24px_-18px_rgba(25,27,24,0.35)] sm:w-[248px]">
      <div role="img" aria-label={`הפוסט של ${card.businessName}: ${card.headline}`} className="overflow-hidden rounded-[14px]">
        <CardStage post={cardPost(card)} brand={cardBrand(card)} businessName={card.businessName} rounded photoSizes={CARD_SIZES} />
      </div>
      <div className="px-1.5 pb-1.5 pt-3">
        <p className="flex items-center gap-2 text-sm font-black text-[#191b18]">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: primary }} />
          {card.businessName}
        </p>
        <p className="mt-0.5 truncate text-xs text-[#6d7068]">{card.typeLabel}</p>
        <p className="mt-2 text-[13px] leading-5 text-[#34372f]">{card.why}</p>
      </div>
    </article>
  );
}
