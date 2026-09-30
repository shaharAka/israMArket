import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { swatch } from "./cards";
import type { LandingExample } from "./examples";
import { INTEGRATION_NAMES, STATUS_LABELS, type LandingPlan, type PlanMonth, type PostFormat } from "./plans";

/**
 * One business's 3-month plan, the thing the product actually builds (docs/onboarding-v2.md,
 * Revision 5), in miniature: the strategy in one line and the finding behind it, what we
 * measure and what that needs connected, the channels (the ones they have and the new ones,
 * with the month each starts), the budget split per month, three months on a line, and the
 * bet being tested. A post appears only as a title with a thumbnail inside its month.
 *
 * Purely presentational: the parent stacks one per business and decides which is current
 * (`data-current`) and when it assembles (`data-reveal`). The assembling is CSS in
 * landing.css (`.lp-reveal`, `.lp-pop`, `.lp-grow`, `.lp-line`), staggered by `--i` per
 * block and `--j` inside it, and it is skipped under reduced motion.
 */
export function PlanPanel({
  example,
  plan,
  current,
  reveal,
}: {
  example: LandingExample;
  plan: LandingPlan;
  current: boolean;
  reveal: boolean;
}) {
  const primary = swatch(example.palette, "primary");
  const accent = swatch(example.palette, "accent", primary);
  // Labels in the business colour, darkened so a light primary still reads on white.
  const ink = `color-mix(in oklab, ${primary} 82%, black)`;
  const tint = `color-mix(in oklab, ${primary} 8%, white)`;
  return (
    <article
      data-current={current}
      data-reveal={reveal}
      aria-hidden={!current}
      className="lp-slide flex flex-col overflow-hidden rounded-[24px] border border-[#e6e3da] bg-white shadow-[0_40px_80px_-48px_rgba(25,27,24,0.45),0_2px_6px_-2px_rgba(25,27,24,0.06)]"
      style={{ "--lp-primary": primary, "--lp-ink": ink, "--lp-tint": tint, "--lp-second": accent } as CSSProperties}
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
        <span className="ms-auto hidden shrink-0 rounded-full border border-[#e6e3da] bg-[#f7f5f0] px-3 py-1 text-xs font-bold text-[#4f524b] sm:inline">
          התוכנית ל-3 חודשים
        </span>
      </header>

      <div className="divide-y divide-[#efede6]">
        {/* 1. The strategy, and the finding it comes from. */}
        <section className="lp-reveal px-5 py-4 sm:px-7 sm:py-6" style={{ "--i": 1 } as CSSProperties}>
          <Label>האסטרטגיה</Label>
          <p className="text-xl font-black leading-[1.4] text-[#191b18] [text-wrap:balance] sm:text-[1.65rem] sm:leading-[1.35]">
            {plan.strategy}
          </p>
          <p className="lp-reveal mt-3 text-sm leading-6 text-[#4f524b]" style={{ "--i": 2 } as CSSProperties}>
            <span className="font-bold text-[#191b18]">מה גילינו: </span>
            {example.insight}
            <span className="ms-1.5 inline-flex flex-wrap gap-1 align-middle">
              {example.sources.map((source) => (
                <span key={source} className="rounded-full border border-[#e6e3da] bg-[#faf9f6] px-2 py-px text-xs font-bold text-[#5e6159]">
                  {source}
                </span>
              ))}
            </span>
          </p>
        </section>

        {/* 2–4. Measure, channels, budget. */}
        <div className="grid divide-y divide-[#efede6] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <Block label="מה נמדוד" i={3}>
            <p className="text-lg font-black leading-snug text-[#191b18]">{plan.kpi.name}</p>
            <p className="mt-0.5 text-sm text-[#5e6159]">{plan.kpi.how}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="מה צריך בשביל למדוד">
              {plan.integrations.map((item, j) => {
                const ok = item.status === "have" || item.status === "ready";
                return (
                  <li
                    key={item.key}
                    className="lp-pop inline-flex items-center gap-1.5 rounded-full border border-[#e6e3da] bg-[#faf9f6] py-1 pe-2.5 ps-1.5 text-xs"
                    style={{ "--j": j } as CSSProperties}
                  >
                    <StatusDot ok={ok} />
                    <span className="font-bold text-[#34372f]">{INTEGRATION_NAMES[item.key]}</span>
                    <span className={ok ? "text-[#2d5a3a]" : "text-[#8a5a12]"}>{STATUS_LABELS[item.status]}</span>
                  </li>
                );
              })}
            </ul>
          </Block>

          <Block label="הערוצים" i={4}>
            <ul className="space-y-2">
              {plan.channels.map((channel, j) => (
                <li key={channel.name} className="flex items-center gap-2.5 text-[15px] leading-6">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full border-2"
                    style={channel.kind === "existing" ? { backgroundColor: primary, borderColor: primary } : { borderColor: primary }}
                  />
                  <span className="min-w-0 font-bold text-[#191b18]">{channel.name}</span>
                  {channel.kind === "new" ? (
                    <span
                      className="lp-pop ms-auto shrink-0 rounded-full px-2 py-px text-xs font-bold"
                      style={{ "--j": j, backgroundColor: tint, color: ink } as CSSProperties}
                    >
                      חדש · מחודש {channel.startsMonth}
                    </span>
                  ) : (
                    <span className="ms-auto shrink-0 text-xs text-[#6d7068]">כבר יש</span>
                  )}
                </li>
              ))}
            </ul>
          </Block>

          <Block label="התקציב" i={5} aside={<span className="text-xs font-bold text-[#4f524b]">{plan.budget.range}</span>}>
            <Budget plan={plan} />
          </Block>
        </div>

        {/* 5–6. Three months: the focus, the date it is built around, one post. */}
        <section className="lp-reveal px-5 py-4 sm:px-7 sm:py-6" style={{ "--i": 6 } as CSSProperties}>
          <Label>3 החודשים</Label>
          <ol className="relative mt-1 grid gap-4 lg:grid-cols-3 lg:gap-6">
            <span aria-hidden className="lp-line pointer-events-none absolute" />
            {plan.months.map((month, m) => (
              <Month key={m} month={month} m={m} image={m === plan.months.findIndex((item) => item.post.thumb) ? example.image : null} />
            ))}
          </ol>
          <p className="mt-4 text-xs text-[#6d7068]">את הפוסטים עצמם כותבים ומעצבים יחד, בתוך המערכת.</p>
        </section>

        {/* 7. The hypothesis, and what changes if it is not confirmed: the "adjust" in the story. */}
        <section className="lp-reveal flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-baseline sm:gap-6 sm:px-7" style={{ "--i": 7 } as CSSProperties}>
          <p className="text-sm leading-6 text-[#34372f]">
            <span className="font-bold" style={{ color: ink }}>
              ההשערה שנבדוק:{" "}
            </span>
            {plan.bet.bet}
          </p>
          <p className="shrink-0 text-sm leading-6 text-[#4f524b] sm:ms-auto">
            <span className="font-bold text-[#191b18]">אם היא לא תתאמת: </span>
            {plan.bet.ifWrong}
          </p>
        </section>
      </div>
    </article>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 text-sm font-bold" style={{ color: "var(--lp-ink)" }}>
      {children}
    </p>
  );
}

function Block({ label, i, aside, children }: { label: string; i: number; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="lp-reveal px-5 py-4 sm:px-7 sm:py-6" style={{ "--i": i } as CSSProperties}>
      <div className="flex items-baseline gap-2">
        <Label>{label}</Label>
        {aside ? <span className="ms-auto">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return ok ? (
    <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#dfeadf] text-[#2d5a3a]">
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 6.2 5 8.5l4.5-5" />
      </svg>
    </span>
  ) : (
    <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-dashed border-[#d9a441]" />
  );
}

function shekels([min, max]: [number, number]): string {
  if (!max) return "0 ₪";
  return `${min.toLocaleString("he-IL")}–${max.toLocaleString("he-IL")} ₪`;
}

const SEGMENT_COLOURS = ["var(--lp-primary)", "var(--lp-second)"];

/** Three rows, one per month: each line of spend as a segment, scaled to the biggest month. */
function Budget({ plan }: { plan: LandingPlan }) {
  const { lines, unlock } = plan.budget;
  if (!lines.length) {
    return (
      <div>
        <p className="text-[15px] font-bold leading-6 text-[#191b18]">הכול אורגני: פוסטים, וואטסאפ ושיתופים.</p>
        {unlock ? <p className="mt-1.5 text-sm leading-6 text-[#5e6159]">{unlock}</p> : null}
      </div>
    );
  }
  const totals = [0, 1, 2].map((m) =>
    lines.reduce<[number, number]>((sum, line) => [sum[0] + line.months[m][0], sum[1] + line.months[m][1]], [0, 0]),
  );
  const mid = ([a, b]: [number, number]) => (a + b) / 2;
  const biggest = Math.max(...totals.map(mid)) || 1;
  return (
    <div>
      <ul className="space-y-2.5">
        {totals.map((total, m) => (
          <li key={m} className="flex items-center gap-2.5 text-xs">
            <span className="w-12 shrink-0 font-bold text-[#4f524b]">חודש {m + 1}</span>
            <span className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-[#f1efe9]">
              {lines.map((line, j) => {
                const width = (mid(line.months[m]) / biggest) * 100;
                if (!width) return null;
                return (
                  <span
                    key={line.name}
                    className="lp-grow block h-full"
                    style={{ width: `${width}%`, backgroundColor: SEGMENT_COLOURS[j % 2], "--j": m * 2 + j } as CSSProperties}
                  />
                );
              })}
            </span>
            <span className="w-[5.5rem] shrink-0 text-end font-bold tabular-nums text-[#34372f]">{shekels(total)}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-3 space-y-1 text-xs text-[#5e6159]">
        {lines.map((line, j) => (
          <li key={line.name} className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SEGMENT_COLOURS[j % 2] }} />
            {line.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Month({ month, m, image }: { month: PlanMonth; m: number; image: string | null }) {
  return (
    <li className="relative ps-7 lg:ps-0 lg:pt-7" style={{ "--m": m } as CSSProperties}>
      <span
        aria-hidden
        className="lp-dot absolute start-0 top-1 h-3.5 w-3.5 rounded-full border-[3px] bg-white lg:top-0"
        style={{ borderColor: "var(--lp-primary)" }}
      />
      {/* Two flex items, not one run of text: "חודש 2" next to "31 בדצמבר" would let the
          bidi algorithm glue the digits into "231". */}
      <p className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#6d7068]">
        <span>חודש {m + 1}</span>
        {month.date ? (
          <span className="rounded-full px-2 py-px" style={{ backgroundColor: "var(--lp-tint)", color: "var(--lp-ink)" }}>
            {month.date}
          </span>
        ) : null}
      </p>
      <p className="mt-1 text-[15px] font-black leading-6 text-[#191b18]">{month.focus}</p>
      <div className="mt-2.5 flex items-center gap-2.5">
        <Thumb format={month.post.format} image={image} />
        <div className="min-w-0">
          <p className="text-[13px] font-bold leading-5 text-[#34372f]">״{month.post.title}״</p>
          <p className="text-xs text-[#6d7068]">
            {month.post.format} · {month.post.channel}
          </p>
        </div>
      </div>
    </li>
  );
}

/** The one real photo gets a thumbnail; the other posts get a small glyph of their format. */
function Thumb({ format, image }: { format: PostFormat; image: string | null }) {
  if (image) {
    return (
      <span className="relative block h-12 w-[38px] shrink-0 overflow-hidden rounded-[8px] bg-[#f1efe9] shadow-[0_0_0_1px_rgba(25,27,24,0.08)]">
        <Image src={image} alt="" fill sizes="38px" className="object-cover" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex h-12 w-[38px] shrink-0 items-center justify-center rounded-[8px]"
      style={{ backgroundColor: "var(--lp-tint)", color: "var(--lp-ink)" }}
    >
      <FormatGlyph format={format} />
    </span>
  );
}

function FormatGlyph({ format }: { format: PostFormat }) {
  const common = { viewBox: "0 0 16 16", className: "h-4 w-4", fill: "none", stroke: "currentColor", strokeWidth: 1.6 } as const;
  if (format === "ריל" || format === "סרטון") {
    return (
      <svg {...common}>
        <path d="M5.5 3.8v8.4l6.5-4.2-6.5-4.2Z" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (format === "קרוסלה") {
    return (
      <svg {...common}>
        <rect x="2" y="4" width="9" height="9" rx="1.6" />
        <path d="M5 2.2h7.2A1.8 1.8 0 0 1 14 4v7" strokeLinecap="round" />
      </svg>
    );
  }
  if (format === "סטורי") {
    return (
      <svg {...common}>
        <rect x="4.5" y="1.8" width="7" height="12.4" rx="1.8" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.8" />
      <path d="m3.5 11.5 3-3 2 2 2.5-2.5 2 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
