import Link from "next/link";
import type { CSSProperties } from "react";
import { IconCheck } from "@/lib/icons";
import {
  COMPARISON_NOTE,
  NO_CARD_AT_SIGNUP,
  NO_COMMITMENT_LABEL,
  PLAN_INCLUDES,
  PRICE_ILS,
  formatPrice,
  TRIAL_LABEL,
  VAT_NOTE,
} from "@/lib/pricing";

/**
 * One plan, one card. Every number and promise comes from lib/pricing.ts, so the owner
 * changes the price there and nowhere else. There is no billing system yet, so nothing
 * here mentions invoices, payment methods or a cancel button.
 */
export function Pricing() {
  const terms = [NO_COMMITMENT_LABEL, NO_CARD_AT_SIGNUP ? "בלי כרטיס אשראי בהרשמה" : null].filter(Boolean) as string[];
  return (
    <section aria-labelledby="pricing-title" className="lp-pricing border-t border-[#ebe8e0]">
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1fr_minmax(0,30rem)] lg:gap-16">
        <header data-rv className="max-w-xl">
          <p className="text-sm font-bold text-[#2d3f32]">מחיר</p>
          <h2 id="pricing-title" className="mt-2 text-[1.9rem] font-black leading-[1.15] tracking-tight [text-wrap:balance] sm:text-[2.6rem]">
            תוכנית אחת. כל מה שהעסק צריך בחודש.
          </h2>
          {COMPARISON_NOTE ? <p className="mt-3 text-base leading-7 text-[#5e6159] sm:text-lg">{COMPARISON_NOTE}</p> : null}
        </header>

        <article
          aria-label="התוכנית"
          data-rv
          style={{ "--rv-i": 1 } as CSSProperties}
          className="lp-lift relative overflow-hidden rounded-[28px] border border-[#e6e3da] bg-white p-6 shadow-[0_40px_80px_-48px_rgba(25,27,24,0.45),0_2px_6px_-2px_rgba(25,27,24,0.06)] sm:p-8"
        >
          <p className="inline-flex rounded-full bg-[#fbeed3] px-3.5 py-1 text-sm font-black text-[#7a4d12]">{TRIAL_LABEL}</p>

          {/* The shekel sign is drawn smaller: at display size Heebo's ₪ outweighs the digits. */}
          <p className="mt-5 flex items-baseline gap-2">
            <span className="sr-only">{formatPrice()} לחודש</span>
            {/* Flex, not inline text: as one run the bidi algorithm glues ₪ to the digits
                and draws it on their right. As two flex items it follows the number in RTL. */}
            <span aria-hidden className="inline-flex items-baseline gap-1.5 text-[3.25rem] font-black leading-none tracking-tight text-[#191b18] sm:text-[3.75rem]">
              <span>{PRICE_ILS.toLocaleString("he-IL")}</span>
              <span className="text-[1.75rem] font-bold sm:text-[2rem]">₪</span>
            </span>
            <span aria-hidden className="text-lg font-bold text-[#4f524b]">
              לחודש
            </span>
          </p>
          <p className="mt-2 text-sm text-[#6d7068]">{VAT_NOTE}</p>

          <p className="mt-4 flex flex-wrap gap-x-2 gap-y-1 text-sm font-bold text-[#2d3f32]">
            {terms.map((term, index) => (
              <span key={term} className="inline-flex items-center gap-2">
                {index > 0 ? <span aria-hidden className="text-[#c7c4b7]">·</span> : null}
                {term}
              </span>
            ))}
          </p>

          <ul className="mt-6 space-y-3 border-t border-[#efede6] pt-6" aria-label="מה כלול">
            {PLAN_INCLUDES.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[15px] leading-6 text-[#34372f]">
                <span aria-hidden className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e8eee5] text-[#2d3f32]">
                  <IconCheck className="h-3.5 w-3.5" />
                </span>
                {item}
              </li>
            ))}
          </ul>

          <Link
            href="/start"
            className="drawn-button lp-press mt-7 inline-flex min-h-12 w-full items-center justify-center bg-[#191b18] px-8 py-3 text-base font-bold text-white hover:bg-[#2c2f29]"
          >
            להתחיל חודש חינם
          </Link>
        </article>
      </div>
    </section>
  );
}
