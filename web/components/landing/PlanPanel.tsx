import type { CSSProperties, ReactNode } from "react";
import { BusinessOverview, type OverviewFigure } from "@/components/design/BusinessOverview";
import type { LandingExample } from "./examples";
import { INTEGRATION_NAMES, MIX_LABELS, STATUS_LABELS, type LandingPlan, type PlanMonth } from "./plans";

/** A visual brief first; the supplied plan's supporting data stays in a disclosure. */
export function PlanPanel({ example, plan, current, reveal, onDetailsChange }: {
  example: LandingExample; plan: LandingPlan; current: boolean; reveal: boolean;
  onDetailsChange?: (open: boolean) => void;
}) {
  const primary = "var(--primary)";
  const accent = "var(--sun)";
  const ink = "var(--ink)";
  const tint = "var(--primary-soft)";
  const budgetFigure: OverviewFigure | undefined = plan.budget.lines.length ? {
    title: "תקציב מתוכנן", unit: "₪ לחודש", caption: "טווחי התוכנית · אורך הפס לפי אמצע הטווח",
    points: [0, 1, 2].map(month => {
      const total = plan.budget.lines.reduce<[number, number]>((sum, line) => [sum[0] + line.months[month][0], sum[1] + line.months[month][1]], [0, 0]);
      return { label: `חודש ${month + 1}`, value: (total[0] + total[1]) / 2, display: shekels(total).replace(" ₪", "") };
    }),
  } : undefined;
  return (
    <article data-current={current} data-reveal={reveal} aria-hidden={!current}
      className="lp-slide overflow-hidden rounded-lg border border-[var(--rule)] bg-white"
      style={{ "--lp-primary": primary, "--lp-ink": ink, "--lp-tint": tint, "--lp-second": accent, "--im-primary": primary, "--im-sun": accent, "--im-soft": tint } as CSSProperties}>
      <header className="lp-reveal flex items-center gap-3 border-b border-[var(--rule)] px-5 py-4 sm:px-7" style={{ "--i": 0 } as CSSProperties}>
        <span aria-hidden className="h-9 w-1 shrink-0" style={{ backgroundColor: primary }} />
        <div className="min-w-0">
          <h3 className="text-lg font-black leading-tight text-[var(--ink)]">{example.businessName}</h3>
          <p className="text-sm text-[var(--ink-soft)]">{example.typeLabel} · {example.city}</p>
        </div>
        <span className="ms-auto hidden text-xs text-[var(--ink-muted)] sm:inline">התוכנית ל-3 חודשים</span>
      </header>

      <section className="lp-reveal p-5 sm:px-7 sm:py-6" style={{ "--i": 1 } as CSSProperties}>
        <div>
          <Label>האסטרטגיה</Label>
          <p className="max-w-4xl text-xl font-black leading-[1.4] text-[var(--ink)] [text-wrap:balance] sm:text-[1.65rem]">{plan.strategy}</p>
        </div>
      </section>

      <div className="lp-reveal" style={{ "--i": 2 } as CSSProperties}>
        <BusinessOverview
          connections={plan.integrations.map(item => ({ key: item.key, name: INTEGRATION_NAMES[item.key], ready: item.status === "have" || item.status === "ready", status: STATUS_LABELS[item.status] }))}
          posts={[{ key: example.slug, title: example.post.overlayHeadline, status: "דוגמת פוסט", note: example.why.timing }]}
          postsNote={plan.channels.filter(channel => channel.kind === "existing").map(channel => channel.name).join(" · ")}
          measure={{ name: plan.kpi.name, note: plan.kpi.how }}
          figure={budgetFigure}
        />
      </div>

      <section className="lp-reveal px-5 py-4 sm:px-7" style={{ "--i": 3, backgroundColor: tint } as CSSProperties}>
        <div className="mb-4"><Label>3 החודשים</Label></div>
        <ol className="grid grid-cols-3 gap-4 sm:gap-6">{plan.months.map((month, m) => <Month key={m} month={month} m={m} />)}</ol>
      </section>

      <details open={current ? undefined : false} onToggle={(event) => { if (current) onDetailsChange?.(event.currentTarget.open); }} className="lp-plan-details border-t border-[var(--rule)]">
        <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-5 py-3 text-sm font-bold text-[var(--ink)] sm:px-7">
          <span>איך התוכנית בנויה <span className="hidden font-normal text-[var(--ink-muted)] sm:inline">· ערוצים, תקציב וההשערה שנבדוק</span></span>
          <span aria-hidden className="lp-details-arrow text-xl font-normal">+</span>
        </summary>
        <div className="border-t border-[var(--rule)]">
          <div className="grid divide-y divide-[var(--rule)] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            <Block label="מה גילינו" i={0}>
              <p className="text-sm leading-6 text-[var(--ink-soft)]">{example.insight}</p>
              <p className="mt-3 text-xs text-[var(--ink-muted)]">{example.sources.join(" · ")}</p>
            </Block>
            <Block label="הערוצים" i={0}>
              <ul className="space-y-2">{plan.channels.map((channel) => <li key={channel.name} className="flex items-baseline justify-between gap-3 text-sm leading-6">
                <span className="font-bold text-[var(--ink)]">{channel.name}</span>
                <span className="shrink-0 text-xs text-[var(--ink-muted)]">{channel.kind === "new" ? `חדש · מחודש ${channel.startsMonth}` : "כבר יש"}</span>
              </li>)}</ul>
            </Block>
            <Block label="התקציב" i={0} aside={<span className="text-xs text-[var(--ink-soft)]">{plan.budget.range}</span>}><Budget plan={plan} /></Block>
          </div>
          <div className="border-t border-[var(--rule)] px-5 py-5 sm:px-7">
            <Mix plan={plan} />
            <p className="mt-3 text-xs leading-5 text-[var(--ink-muted)]">אילו מוצרים להבליט בכל פוסט, אתם מחליטים בתוך המערכת, לפי מלאי ורווחיות.</p>
            <p className="mt-5 text-sm leading-6 text-[var(--ink-soft)]"><strong style={{ color: ink }}>ההשערה שנבדוק: </strong>{plan.bet.bet}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]"><strong className="text-[var(--ink)]">אם היא לא תתאמת: </strong>{plan.bet.ifWrong}</p>
          </div>
        </div>
      </details>
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
        <p className="text-[15px] font-bold leading-6 text-[var(--ink)]">הכול אורגני: פוסטים, וואטסאפ ושיתופים.</p>
        {unlock ? <p className="mt-1.5 text-sm leading-6 text-[var(--ink-soft)]">{unlock}</p> : null}
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
            <span className="w-12 shrink-0 font-bold text-[var(--ink-soft)]">חודש {m + 1}</span>
            <span className="flex h-2.5 flex-1 overflow-hidden bg-[var(--rule)]">
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
            <span className="w-[5.5rem] shrink-0 text-end font-bold tabular-nums text-[var(--ink-soft)]">{shekels(total)}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-3 space-y-1 text-xs text-[var(--ink-soft)]">
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

function Month({ month, m }: { month: PlanMonth; m: number }) {
  return <li className="min-w-0 border-t pt-3" style={{ borderColor: "color-mix(in srgb, var(--lp-primary) 24%, white)" }}>
    <p className="flex items-baseline gap-1 text-xs text-[var(--ink-soft)]"><span className="text-2xl font-black tabular-nums" style={{ color: "var(--lp-ink)" }}>{m + 1}</span><span>חודש</span></p>
    <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink)]">{month.focus}</p>
    {month.date ? <p className="mt-2 text-xs text-[var(--ink-soft)]">{month.date}</p> : null}
  </li>;
}

/** "תמהיל התוכן": one stacked bar of post types, with a legend. */
function Mix({ plan }: { plan: LandingPlan }) {
  const shades = ["var(--primary)", "var(--sun)", "var(--rule-dark)", "var(--ink-muted)", "var(--rule)"];
  return (
    <div className="mt-0">
      <p className="text-xs font-bold text-[var(--ink-muted)]">תמהיל התוכן</p>
      <div className="lp-mix mt-1.5 flex h-2.5 overflow-hidden bg-[var(--rule)]" aria-hidden>
        {plan.mix.map((item, i) => (
          <span key={item.type} className="lp-bar-seg h-full" style={{ width: `${item.share}%`, backgroundColor: shades[i % shades.length] }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-soft)]">
        {plan.mix.map((item, i) => (
          <li key={item.type} className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: shades[i % shades.length] }} />
            {MIX_LABELS[item.type]} <span className="text-[var(--ink-muted)]">{item.share}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
