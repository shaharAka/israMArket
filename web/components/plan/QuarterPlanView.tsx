"use client";

import { useEffect, useId, useRef, useState } from "react";
import { HowToFind } from "@/components/help/HowToFind";
import type { PlanInsight } from "@/lib/api";
import { IconCalendar, IconCheck, IconFlag } from "@/lib/icons";
import {
  FORMAT_HE,
  INTEGRATION_GUIDE,
  STATUS_LABEL,
  channelColors,
  channelName,
  formatIls,
  formatRange,
  type IntegrationStatus,
  type QuarterPlan,
  type StoredQuarterPlan,
} from "@/lib/quarterPlan";
import styles from "./plan.module.css";

/**
 * "התוכנית שלכם ל-3 החודשים הקרובים": the plan as one scannable document.
 *
 * The same component is the hook at the end of /start (with the owner's controls slotted
 * into the sections they change) and the plan on /strategy after signup. Sections are
 * headings and whitespace; the only bordered things are lists that are objects of their
 * own. Detail (why, sources) opens in place. Nothing here invents a result: costs are
 * ranges, a missing baseline says so, and integrations say honestly what they need.
 */

export type SectionKey = "strategy" | "measure" | "channels" | "budget" | "calendar" | "content" | "bets";

const SECTIONS: { key: SectionKey; title: string; short: string }[] = [
  { key: "strategy", title: "האסטרטגיה בשורה אחת", short: "אסטרטגיה" },
  { key: "measure", title: "המטרה ואיך נמדוד", short: "מדידה" },
  { key: "channels", title: "הערוצים", short: "ערוצים" },
  { key: "budget", title: "התקציב", short: "תקציב" },
  { key: "calendar", title: "לוח השנה", short: "לוח שנה" },
  { key: "content", title: "התוכן", short: "תוכן" },
  { key: "bets", title: "ההשערות שנבדוק", short: "השערות" },
];

type AnyPlan = QuarterPlan | StoredQuarterPlan;

export type PlanSlots = Partial<Record<"audience" | "target" | "cadence" | "end", React.ReactNode>>;

/** Shows each `[data-reveal]` inside `root` once it reaches the screen (or is above it). */
function useReveal(root: React.RefObject<HTMLElement | null>, key: unknown) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (typeof IntersectionObserver === "undefined") {
      items.forEach((item) => item.setAttribute("data-shown", ""));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
            entry.target.setAttribute("data-shown", "");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [root, key]);
}

export function QuarterPlanView({
  plan,
  mode,
  insights = [],
  accent = "#191b18",
  busy,
  slots = {},
  navTop = "top-14 lg:top-0",
}: {
  plan: AnyPlan;
  /** "start": the hook, everything open. "app": /strategy, where every section after the strategy folds to one line. */
  mode: "start" | "app";
  insights?: PlanInsight[];
  /** The business's own colour, for the small accents. */
  accent?: string;
  /** Sections an owner change is rewriting right now. */
  busy?: Set<SectionKey>;
  slots?: PlanSlots;
  /** Where the sticky section index sits under the page's own sticky header. */
  navTop?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root, plan);
  const colors = channelColors(plan as QuarterPlan);
  const months = plan.calendar.map((m) => m.month_label);
  const isBusy = (key: SectionKey) => Boolean(busy?.has(key));

  return (
    <div ref={root} className="space-y-7">
      <SectionNav top={navTop} />

      {/* The conclusion first: the strategy in one line, then the plan at a glance. */}
      <Section id="strategy" index={1} busy={isBusy("strategy")} mode={mode}>
        <StrategyBlock plan={plan} insights={insights} accent={accent} audienceSlot={slots.audience} />
      </Section>

      <Glance plan={plan} months={months} accent={accent} />

      <Section id="measure" index={2} busy={isBusy("measure")} mode={mode} summary={plan.kpi.name_he}>
        <MeasureBlock plan={plan} accent={accent} targetSlot={slots.target} />
      </Section>

      <Section
        id="channels"
        index={3}
        busy={isBusy("channels")}
        mode={mode}
        summary={channelsSummary(plan)}
      >
        <ChannelsBlock plan={plan} months={months} colors={colors} />
      </Section>

      <Section id="budget" index={4} busy={isBusy("budget")} mode={mode} summary={budgetSummary(plan)}>
        <BudgetBlock plan={plan} colors={colors} />
      </Section>

      <Section id="calendar" index={5} busy={isBusy("calendar")} mode={mode} summary={months.join(" · ")}>
        <CalendarBlock plan={plan} accent={accent} />
      </Section>

      <Section id="content" index={6} busy={isBusy("content")} mode={mode} summary={contentSummary(plan)}>
        <ContentBlock plan={plan} cadenceSlot={slots.cadence} />
      </Section>

      <Section id="bets" index={7} busy={isBusy("bets")} mode={mode} summary={`${plan.assumptions.length} השערות שנמדוד`}>
        <BetsBlock plan={plan} />
      </Section>

      {slots.end}
    </div>
  );
}

/* --------------------------------- Frame --------------------------------- */

function SectionNav({ top }: { top: string }) {
  return (
    <nav aria-label="חלקי התוכנית" className={`sticky ${top} z-20 -mx-4 bg-[#f8f7f4]/95 px-4 py-2 backdrop-blur lg:mx-0 lg:px-0`}>
      <ol className={`flex gap-1.5 overflow-x-auto ${styles.nav}`}>
        {SECTIONS.map((section, index) => (
          <li key={section.key} className="shrink-0">
            <a
              href={`#plan-${section.key}`}
              onClick={(event) => {
                const target = document.getElementById(`plan-${section.key}`);
                if (!target) return;
                event.preventDefault();
                // A folded section (on /strategy) opens when its index is tapped.
                target.querySelector("details")?.setAttribute("open", "");
                const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
                target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
              }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#e2e0d8] bg-white px-3 text-xs font-bold text-[#2b2d28] hover:border-[#b9b7ad]"
            >
              <span className="text-[#a3a59c]">{index + 1}</span>
              {section.short}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Section({
  id,
  index,
  busy,
  mode,
  summary,
  children,
}: {
  id: SectionKey;
  index: number;
  busy: boolean;
  mode: "start" | "app";
  summary?: string;
  children: React.ReactNode;
}) {
  const title = SECTIONS.find((s) => s.key === id)?.title ?? "";
  const headingId = `plan-${id}-title`;
  const heading = (
    <span className="flex items-baseline gap-2.5">
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 translate-y-[-1px] items-center justify-center self-center rounded-full bg-[#191b18] text-[11px] font-black text-white"
      >
        {index}
      </span>
      <span id={headingId} className="text-lg font-black leading-7 text-[#191b18] sm:text-xl">
        {title}
      </span>
      {busy ? <span className={`text-xs font-bold text-[#5e6159] ${styles.busy}`}>מעדכנים…</span> : null}
    </span>
  );
  const body = <div className={`mt-3 transition-opacity duration-300 motion-reduce:transition-none ${busy ? "opacity-50" : ""}`}>{children}</div>;

  // In the app the plan is a reference: after the strategy, a section folds to its heading
  // and one line, so the page stays scannable (UI-RULES rule 2 and 7).
  if (mode === "app" && index > 1) {
    return (
      <section id={`plan-${id}`} aria-labelledby={headingId} aria-busy={busy} className="scroll-mt-28">
        <details className="group border-t border-[#e2e0d8] pt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3">
            <span className="min-w-0">
              {heading}
              {summary ? <span className="mr-8 mt-0.5 block truncate text-sm text-[#5e6159]">{summary}</span> : null}
            </span>
            <span
              aria-hidden
              className="h-0 w-0 shrink-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-[#8b8e84] transition-transform duration-200 group-open:rotate-180"
            />
          </summary>
          {body}
        </details>
      </section>
    );
  }

  return (
    <section id={`plan-${id}`} aria-labelledby={headingId} aria-busy={busy} data-reveal="" className={`scroll-mt-28 ${styles.reveal}`}>
      {heading}
      {body}
    </section>
  );
}

/** "למה?" that opens in place, with the finding it came from. */
function Why({ why, insight }: { why: string; insight?: PlanInsight }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!why) return null;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-10 cursor-pointer items-center gap-1 text-xs font-bold text-[#5e6159] underline decoration-[#c7c4b8] underline-offset-4 hover:text-[#191b18]"
      >
        למה?
        <svg viewBox="0 0 16 16" className={`h-3 w-3 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div id={id} hidden={!open} className="mt-1 rounded-lg bg-[#f4f2ec] px-3 py-2 text-xs leading-5 text-[#2b2d28]">
        <p>{why}</p>
        {insight ? (
          <p className="mt-1 text-[#5e6159]">
            <b className="text-[#191b18]">מתוך מה שגילינו: </b>
            {insight.text_he}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------- Glance --------------------------------- */

function budgetSummary(plan: AnyPlan): string {
  if (plan.budget.organic_only || !plan.budget.monthly_ils) return "בלי תקציב פרסום";
  return `${formatIls(plan.budget.monthly_ils)} בחודש`;
}

function channelsSummary(plan: AnyPlan): string {
  const existing = plan.channels.filter((c) => c.kind === "existing").length;
  const fresh = plan.channels.filter((c) => c.kind === "new").length;
  if (!existing) return `${fresh} ערוצים חדשים`;
  return fresh ? `${existing} שכבר יש, ${fresh} חדשים` : `${existing} ערוצים שכבר יש`;
}

function contentSummary(plan: AnyPlan): string {
  const first = plan.content[0];
  if (!first) return "";
  const main = first.cadence[0];
  return main ? `${channelName(plan as QuarterPlan, main.channel_key)} · ${main.per_week}` : "";
}

function Glance({ plan, months, accent }: { plan: AnyPlan; months: string[]; accent: string }) {
  const fresh = plan.channels.filter((c) => c.kind === "new");
  const tiles = [
    { label: "המדד העיקרי", value: plan.kpi.name_he, note: plan.kpi.target ? `היעד: ${plan.kpi.target}` : "היעד: לפי מה שתבחרו" },
    {
      label: "תקציב פרסום",
      value: plan.budget.organic_only || !plan.budget.monthly_ils ? "בלי תקציב" : `${formatIls(plan.budget.monthly_ils)}`,
      note: plan.budget.organic_only || !plan.budget.monthly_ils ? "הכול אורגני" : "בחודש, בטווחים",
    },
    {
      label: "ערוצים חדשים",
      value: fresh.length ? String(fresh.length) : "אין",
      note: fresh.length ? `הראשון מ${months[Math.min(...fresh.map((c) => c.starts_month)) - 1] ?? "החודש הראשון"}` : "מחזקים את מה שיש",
    },
  ];
  return (
    <div data-reveal="" className={styles.reveal}>
      <p className="mb-2 flex items-center gap-2 text-xs font-bold text-[#5e6159]">
        <IconCalendar className="h-4 w-4" />
        {months.join(" · ")}
      </p>
      <dl className="grid grid-cols-3 overflow-hidden rounded-2xl border border-[#e2e0d8] bg-white">
        {tiles.map((tile, index) => (
          <div key={tile.label} className={`min-w-0 px-3 py-3 sm:px-4 ${index ? "border-r border-[#ecebe5]" : ""}`}>
            <dt className="text-[11px] font-bold text-[#6b6e65]">{tile.label}</dt>
            <dd className="mt-1 text-[15px] font-black leading-5 text-[#191b18] sm:text-base">{tile.value}</dd>
            <dd className="mt-1 text-[11px] leading-4 text-[#6b6e65]">{tile.note}</dd>
          </div>
        ))}
      </dl>
      <div aria-hidden className="mx-6 h-1 rounded-b-full" style={{ background: accent, opacity: 0.85 }} />
    </div>
  );
}

/* ---------------------------------- 1 ---------------------------------- */

function StrategyBlock({
  plan,
  insights,
  accent,
  audienceSlot,
}: {
  plan: AnyPlan;
  insights: PlanInsight[];
  accent: string;
  audienceSlot?: React.ReactNode;
}) {
  const insight = plan.strategy.from_insight != null ? insights[plan.strategy.from_insight] : undefined;
  return (
    <div className="space-y-3">
      <div className="border-r-4 pr-3.5" style={{ borderColor: accent }}>
        <p className="text-xl font-black leading-8 text-[#191b18] sm:text-2xl sm:leading-9">{plan.strategy.one_liner_he}</p>
        <p className="mt-2 text-[15px] leading-7 text-[#2b2d28]">
          <b className="text-[#191b18]">הזווית: </b>
          {plan.strategy.angle_he}
        </p>
        <Why why={plan.strategy.why_he} insight={insight} />
      </div>
      {audienceSlot}
    </div>
  );
}

/* ---------------------------------- 2 ---------------------------------- */

const STATUS_STYLE: Record<IntegrationStatus, string> = {
  have: "bg-[#e7f0e4] text-[#2f5d2a]",
  connect: "bg-[#fbf0dc] text-[#7a4b12]",
  install: "bg-[#e6eef6] text-[#2c4a66]",
  unknown: "bg-[#f1efe8] text-[#5e6159]",
};

function StatusChip({ status, live }: { status: IntegrationStatus; live?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-bold leading-5 ${STATUS_STYLE[status]}`}>
      {status === "have" ? (
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full bg-[#2f5d2a] ${live ? styles.live : ""}`} />
      ) : status === "install" ? (
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
          <path d="M6 2v6M3.5 5.5L6 8l2.5-2.5M2.5 10h7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : status === "connect" ? (
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
          <path d="M5 7l2-2M4.2 8.8l-.9.9a1.6 1.6 0 01-2.3-2.3l1.8-1.8M7.8 3.2l.9-.9A1.6 1.6 0 0111 4.6L9.2 6.4" strokeLinecap="round" />
        </svg>
      ) : (
        <span aria-hidden>?</span>
      )}
      {live ? "עובד מהיום הראשון" : STATUS_LABEL[status]}
    </span>
  );
}

function MeasureBlock({ plan, accent, targetSlot }: { plan: AnyPlan; accent: string; targetSlot?: React.ReactNode }) {
  const integrations = plan.integrations;
  const ready = integrations.filter((i) => i.status === "have").length;
  const todo = integrations.length - ready;
  const nameOf = (key: string) => integrations.find((i) => i.key === key)?.name_he ?? key;
  return (
    <div className="space-y-5">
      {/* The KPI leads: the one number the plan answers to. */}
      <div className="rounded-2xl px-4 py-3.5" style={{ background: `color-mix(in srgb, ${accent} 7%, #ffffff)` }}>
        <p className="text-[11px] font-bold text-[#5e6159]">המדד העיקרי</p>
        <p className="mt-0.5 text-xl font-black leading-7 text-[#191b18]">{plan.kpi.name_he}</p>
        <p className="mt-1 text-sm leading-6 text-[#2b2d28]">{plan.kpi.how_he}</p>
        {plan.kpi.needs ? (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-[#2b2d28]">
            {plan.kpi.available_now ? (
              <span className="rounded-full bg-[#e7f0e4] px-2 text-[11px] font-bold leading-5 text-[#2f5d2a]">אפשר למדוד מהיום</span>
            ) : (
              <span className="rounded-full bg-white/70 px-2 text-[11px] font-bold leading-5 text-[#5e6159]">אחרי חיבור</span>
            )}
            {plan.kpi.needs.length ? (
              <span>
                <b>צריך: </b>
                {plan.kpi.needs.map(nameOf).join(" · ")}
              </span>
            ) : (
              <span>סופרים בעצמכם, בלי חיבור.</span>
            )}
          </p>
        ) : null}
        {targetSlot ? (
          <div className="mt-2.5">{targetSlot}</div>
        ) : plan.kpi.target ? (
          <p className="mt-2 text-sm font-bold text-[#191b18]">היעד שלכם: {plan.kpi.target}</p>
        ) : null}
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-[#5e6159]">
          <IconFlag className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {plan.kpi.baseline_he}
        </p>
      </div>

      <div>
        <h3 className="text-sm font-black text-[#191b18]">איך נמדוד</h3>
        <ul className="mt-2 divide-y divide-[#ecebe5] rounded-xl border border-[#e2e0d8] bg-white">
          {plan.measures.map((measure) => (
            <li key={measure.name_he} className="px-3.5 py-2.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-sm font-bold text-[#191b18]">{measure.name_he}</p>
                {measure.name_he === plan.kpi.name_he ? (
                  <span className="rounded-full bg-[#191b18] px-2 text-[11px] font-bold leading-5 text-white">המדד העיקרי</span>
                ) : null}
                {measure.available_now ? (
                  <span className="rounded-full bg-[#e7f0e4] px-2 text-[11px] font-bold leading-5 text-[#2f5d2a]">אפשר למדוד מהיום</span>
                ) : (
                  <span className="rounded-full bg-[#f1efe8] px-2 text-[11px] font-bold leading-5 text-[#5e6159]">אחרי חיבור</span>
                )}
              </div>
              <p className="text-xs leading-5 text-[#5e6159]">{measure.how_he}</p>
              {measure.needs.length ? (
                <p className="mt-0.5 text-xs leading-5 text-[#2b2d28]">
                  <b>צריך: </b>
                  {measure.needs.map(nameOf).join(" · ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className="text-sm font-black text-[#191b18]">מה צריך כדי למדוד</h3>
          <p className="text-xs text-[#5e6159]">
            {ready ? `${ready} כבר עובד` : "עוד לא מחובר כלום"}
            {todo ? ` · ${todo} לחבר אחרי ההרשמה` : ""}
          </p>
        </div>
        <ul className="mt-2 divide-y divide-[#ecebe5] rounded-xl border border-[#e2e0d8] bg-white">
          {integrations.map((integration) => {
            const guide = INTEGRATION_GUIDE[integration.key];
            const live = integration.key === "whatsapp_link";
            return (
              <li key={integration.key} className="px-3.5 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-sm font-bold leading-6 text-[#191b18]">{integration.name_he}</p>
                  <StatusChip status={live ? "have" : integration.status} live={live} />
                </div>
                <p className="text-xs leading-5 text-[#2b2d28]">{integration.why_he}</p>
                <div className="flex flex-wrap items-center justify-between gap-x-3">
                  <p className="text-xs leading-5 text-[#6b6e65]">{integration.effort_he}</p>
                  {guide && !live ? (
                    <HowToFind topic={guide} label={integration.status === "install" ? "איך מתקינים?" : "איך מחברים?"} className="-my-1.5" />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ---------------------------------- 3 ---------------------------------- */

function ChannelsBlock({ plan, months, colors }: { plan: AnyPlan; months: string[]; colors: Record<string, string> }) {
  const existing = plan.channels.filter((c) => c.kind === "existing");
  const fresh = plan.channels.filter((c) => c.kind === "new").sort((a, b) => a.starts_month - b.starts_month);
  const list = (items: typeof plan.channels, isNew: boolean) => (
    <ul className="divide-y divide-[#ecebe5] rounded-xl border border-[#e2e0d8] bg-white">
      {items.map((channel) => (
        <li key={channel.key} className="flex gap-3 px-3.5 py-3">
          <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[channel.key] }} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-[15px] font-black text-[#191b18]">{channel.name_he}</p>
              {isNew ? (
                <span className="rounded-full border border-[#191b18] px-2 text-[11px] font-bold leading-5 text-[#191b18]">
                  חדש · מ{months[channel.starts_month - 1] ?? `חודש ${channel.starts_month}`}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm leading-6 text-[#2b2d28]">{channel.why_he}</p>
            <p className="text-xs leading-5 text-[#6b6e65]">
              {channel.cadence_he ? `${channel.cadence_he} · ` : ""}
              {channel.effort_he}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
      {existing.length ? (
        <div>
          <h3 className="mb-2 text-sm font-black text-[#191b18]">מחזקים את מה שיש</h3>
          {list(existing, false)}
        </div>
      ) : null}
      {fresh.length ? (
        <div className={existing.length ? "" : "lg:col-span-2"}>
          <h3 className="mb-2 text-sm font-black text-[#191b18]">ערוצים חדשים שנפתח</h3>
          {list(fresh, true)}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------- 4 ---------------------------------- */

function BudgetBlock({ plan, colors }: { plan: AnyPlan; colors: Record<string, string> }) {
  const b = plan.budget;
  if (b.organic_only || !b.months.some((m) => m.lines.length)) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-dashed border-[#c7c4b8] bg-white px-4 py-3.5">
          <p className="text-base font-black text-[#191b18]">בלי תקציב פרסום. 3 החודשים בנויים על זמן, לא על כסף.</p>
          {plan.channels.length ? (
            <p className="mt-1 text-sm leading-6 text-[#2b2d28]">
              כל הערוצים בתוכנית עובדים בלי לשלם על פרסום: {plan.channels.map((c) => c.name_he).join(", ")}.
            </p>
          ) : null}
        </div>
        {b.unlock_he ? (
          <p className="text-sm leading-6 text-[#2b2d28]">
            <b className="text-[#191b18]">מה סכום קטן היה מוסיף: </b>
            {b.unlock_he}
          </p>
        ) : null}
      </div>
    );
  }
  const totals = b.months.map((m) => m.lines.reduce((sum, l) => sum + (l.ils_range[0] + l.ils_range[1]) / 2, 0));
  const max = Math.max(...totals, 1);
  const keys = [...new Set(b.months.flatMap((m) => m.lines.map((l) => l.channel_key)))];
  return (
    <div className="space-y-3">
      {b.monthly_ils ? (
        <p className="text-sm leading-6 text-[#2b2d28]">
          <b className="text-[#191b18]">{formatIls(b.monthly_ils)} בחודש</b>, מחולקים לפי מה שמתחיל מתי.
          {b.basis_he ? <span className="block text-xs text-[#5e6159]">{b.basis_he}</span> : null}
        </p>
      ) : null}
      <figure className="rounded-2xl border border-[#e2e0d8] bg-white px-4 py-3.5">
        <figcaption className="sr-only">חלוקת התקציב לפי חודש וערוץ</figcaption>
        <ul className="space-y-3">
          {b.months.map((month, index) => {
            const low = month.lines.reduce((s, l) => s + l.ils_range[0], 0);
            const high = month.lines.reduce((s, l) => s + l.ils_range[1], 0);
            return (
              <li key={month.month_label}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-black text-[#191b18]">{month.month_label}</span>
                  <span className="font-bold tabular-nums text-[#2b2d28]">{month.lines.length ? formatRange([low, high]) : "בלי פרסום"}</span>
                </div>
                <div className="mt-1 flex h-6 gap-[2px]" style={{ width: `${Math.max(8, (totals[index] / max) * 100)}%` }}>
                  {month.lines.length ? (
                    month.lines.map((line, i) => {
                      const mid = (line.ils_range[0] + line.ils_range[1]) / 2;
                      const last = i === month.lines.length - 1;
                      return (
                        <span
                          key={line.channel_key}
                          title={`${channelName(plan as QuarterPlan, line.channel_key)}: ${formatRange(line.ils_range)}`}
                          className={`block h-full ${styles.seg} ${last ? "rounded-l-[4px]" : ""}`}
                          style={{ width: `${(mid / (totals[index] || 1)) * 100}%`, background: colors[line.channel_key] }}
                        />
                      );
                    })
                  ) : (
                    <span className="block h-full w-full rounded-[4px] bg-[#ecebe5]" />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[#ecebe5] pt-2.5" aria-label="מקרא">
          {keys.map((key) => (
            <li key={key} className="flex items-center gap-1.5 text-xs text-[#2b2d28]">
              <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: colors[key] }} />
              {channelName(plan as QuarterPlan, key)}
            </li>
          ))}
        </ul>
      </figure>
      <p className="text-xs leading-5 text-[#5e6159]">טווחים לתכנון, לא הבטחה לתוצאה. בלי דמי ניהול.</p>
      <details className="group">
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm font-bold text-[#5e6159] hover:text-[#191b18]">
          <span aria-hidden className="h-0 w-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-[#8b8e84] transition-transform group-open:rotate-180" />
          הסכומים לפי ערוץ, ומאיפה המספרים
        </summary>
        <div className="mt-2 space-y-3 text-sm leading-6 text-[#2b2d28]">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="text-[#6b6e65]">
                <th className="py-1 font-bold">חודש</th>
                <th className="py-1 font-bold">ערוץ</th>
                <th className="py-1 font-bold">סכום</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ecebe5]">
              {b.months.flatMap((month) =>
                month.lines.map((line) => (
                  <tr key={`${month.month_label}-${line.channel_key}`}>
                    <td className="py-1.5 font-bold text-[#191b18]">{month.month_label}</td>
                    <td className="py-1.5">
                      {channelName(plan as QuarterPlan, line.channel_key)}
                      {line.note_he ? <span className="block text-[#6b6e65]">{line.note_he}</span> : null}
                    </td>
                    <td className="py-1.5 font-bold tabular-nums">{formatRange(line.ils_range)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
          {b.sources?.length || b.sources_he.length ? (
            <div>
              <p className="text-xs font-bold text-[#191b18]">המקורות</p>
              <ul className="mt-1 space-y-1 text-xs text-[#5e6159]">
                {b.sources?.length
                  ? b.sources.map((source) => (
                      <li key={source.url} className="flex gap-2">
                        <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#8a8c84]" />
                        <a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[#191b18]">
                          {source.title}
                        </a>
                      </li>
                    ))
                  : b.sources_he.map((source) => (
                      <li key={source} className="flex gap-2">
                        <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#8a8c84]" />
                        {source}
                      </li>
                    ))}
              </ul>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}

/* ---------------------------------- 5 ---------------------------------- */

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return m && d ? `${Number(d)}.${Number(m)}` : iso;
}

function CalendarBlock({ plan, accent }: { plan: AnyPlan; accent: string }) {
  return (
    <ol className="relative grid gap-4 lg:grid-cols-3 lg:gap-3">
      {plan.calendar.map((month, index) => {
        const opens = plan.channels.filter((c) => c.kind === "new" && c.starts_month === index + 1);
        return (
          <li key={month.month_label} className="relative flex gap-3 lg:block">
            {/* The spine on phones: a dot per month on one vertical line. */}
            <span aria-hidden className="relative flex w-5 shrink-0 justify-center lg:hidden">
              <span className={`relative z-10 mt-1 h-3.5 w-3.5 rounded-full border-2 border-white ${styles.dot}`} style={{ background: accent }} />
              {index < plan.calendar.length - 1 ? <span className="absolute bottom-[-1rem] top-4 w-px bg-[#d8d6ce]" /> : null}
            </span>
            <div className="min-w-0 flex-1 rounded-2xl border border-[#e2e0d8] bg-white px-3.5 py-3">
              <p className="flex items-center gap-2">
                <span aria-hidden className={`hidden h-2.5 w-2.5 rounded-full lg:block ${styles.dot}`} style={{ background: accent }} />
                <span className="text-[11px] font-bold text-[#6b6e65]">חודש {index + 1}</span>
                <span className="text-base font-black text-[#191b18]">{month.month_label}</span>
              </p>
              {opens.length ? (
                <p className="mt-2 text-xs leading-5 text-[#191b18]">
                  <b>נפתח: </b>
                  {opens.map((c) => c.name_he).join(", ")}
                </p>
              ) : null}
              {month.weeks?.length ? (
                <ol className="mt-2 space-y-1">
                  {month.weeks.map((week) => (
                    <li key={week.week} className="flex gap-2 text-xs leading-5 text-[#2b2d28]">
                      <span className="w-11 shrink-0 font-bold text-[#8a8c84]">שבוע {week.week}</span>
                      <span className="min-w-0">
                        {week.focus_he}
                        {week.dates_he ? <span className="block text-[11px] text-[#8a8c84] tabular-nums">{week.dates_he}</span> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}
              {month.dates.length ? (
                <ul className="mt-2 space-y-1.5">
                  {month.dates.map((date) => (
                    <li key={`${date.date}-${date.name_he}`} className="flex gap-2 text-xs leading-5">
                      <span className="shrink-0 rounded-md bg-[#fbf0dc] px-1.5 font-black tabular-nums text-[#7a4b12]">{shortDate(date.date)}</span>
                      <span className="min-w-0 text-[#2b2d28]">
                        <b className="text-[#191b18]">{date.name_he}: </b>
                        {date.action_he}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-[#8a8c84]">אין תאריכים מיוחדים. חודש של קצב קבוע.</p>
              )}
              <p className="mt-2.5 flex items-start gap-1.5 border-t border-[#ecebe5] pt-2 text-xs leading-5 text-[#191b18]">
                <IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <b className="block text-[11px] text-[#6b6e65]">נקודת בדיקה</b>
                  {month.checkpoint_he}
                </span>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------- 6 ---------------------------------- */

function ContentBlock({ plan, cadenceSlot }: { plan: AnyPlan; cadenceSlot?: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <ol className="grid gap-3 lg:grid-cols-3">
        {plan.content.map((month, index) => (
          <li key={month.month_label} className="rounded-2xl border border-[#e2e0d8] bg-white px-3.5 py-3">
            <p className="text-[11px] font-bold text-[#6b6e65]">
              חודש {index + 1} · <span className="text-[#191b18]">{month.month_label}</span>
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="הנושאים">
              {month.pillars.map((pillar) => (
                <li key={pillar.key} title={pillar.description_he} className="rounded-full bg-[#f1efe8] px-2.5 py-0.5 text-xs font-bold text-[#191b18]">
                  {pillar.title}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs leading-5 text-[#5e6159]">
              {month.cadence.map((c) => `${channelName(plan as QuarterPlan, c.channel_key)} ${c.per_week}`).join(" · ")}
            </p>
            <ul className="mt-2 space-y-1.5 border-t border-[#ecebe5] pt-2">
              {month.example_titles.map((example) => (
                <li key={example.title} className="flex items-start gap-2 text-sm leading-5 text-[#191b18]">
                  <span className="mt-px shrink-0 rounded border border-[#dedcd4] px-1 text-[10px] font-bold leading-4 text-[#5e6159]">
                    {FORMAT_HE[example.format] ?? example.format}
                  </span>
                  <span className="min-w-0">
                    {example.title}
                    <span className="text-xs text-[#8a8c84]"> · {channelName(plan as QuarterPlan, example.channel_key)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p className="text-sm leading-6 text-[#2b2d28]">את הפוסטים עצמם נכתוב ונעצב יחד בתוך המערכת.</p>
      {cadenceSlot}
    </div>
  );
}

/* ---------------------------------- 7 ---------------------------------- */

function BetsBlock({ plan }: { plan: AnyPlan }) {
  return (
    <ul className="divide-y divide-[#ecebe5] rounded-xl border border-[#e2e0d8] bg-white">
      {plan.assumptions.map((bet) => (
        <li key={bet.bet_he} className="px-3.5 py-3">
          <p className="text-[15px] font-bold leading-6 text-[#191b18]">{bet.bet_he}</p>
          <p className="mt-0.5 text-sm leading-6 text-[#5e6159]">
            <b className="text-[#2b2d28]">אם היא לא תתאמת: </b>
            {bet.if_wrong_he}
          </p>
        </li>
      ))}
    </ul>
  );
}
