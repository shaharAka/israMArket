"use client";

import { useEffect, useId, useRef, useState } from "react";
import { HypothesisNote } from "@/components/design/PlanBrief";
import { HypothesisStatusLine, reviewByKey, reviewFor, statusSummary } from "@/components/plan/HypothesisStatusLine";
import { HowToFind } from "@/components/help/HowToFind";
import type { HypothesisReview, PlanInsight } from "@/lib/api";
import { IconCheck, IconChevron, IconFlag } from "@/lib/icons";
import {
  INTEGRATION_GUIDE,
  STATUS_LABEL,
  channelColors,
  channelName,
  formatIls,
  formatRange,
  type IntegrationStatus,
  type PlanNumbers,
  type QuarterPlan,
  type StoredQuarterPlan,
} from "@/lib/quarterPlan";
import { MathLines, SourcesAndAssumptions } from "@/components/start/StepNumbers";
import { BidiText, rangeSafe } from "@/components/start/ui";
import styles from "./plan.module.css";

/**
 * The ongoing strategy as one scannable document, with a dated initial lookahead.
 *
 * The same component is the hook at the end of /start (with the owner's controls slotted
 * into the sections they change) and the plan on /strategy after signup. Sections are
 * headings and whitespace; the only bordered things are lists that are objects of their
 * own. Detail (why, sources) opens in place. Nothing here invents a result: costs are
 * ranges, a missing baseline says so, and integrations say honestly what they need.
 */

export type SectionKey = "strategy" | "measure" | "channels" | "budget" | "calendar" | "content" | "bets" | "inside";

const SECTIONS: { key: SectionKey; title: string; short: string }[] = [
  { key: "strategy", title: "האסטרטגיה בשורה אחת", short: "אסטרטגיה" },
  // Revision 6: today, the lever, the target with its math, and how each is measured.
  { key: "measure", title: "המספרים", short: "מספרים" },
  { key: "channels", title: "הערוצים", short: "ערוצים" },
  { key: "budget", title: "התקציב", short: "תקציב" },
  { key: "calendar", title: "לוח השנה", short: "לוח שנה" },
  { key: "content", title: "התוכן", short: "תוכן" },
  { key: "bets", title: "ההשערות שנבדוק", short: "השערות" },
  { key: "inside", title: "מה מחכה לכם בפנים", short: "בפנים" },
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
  directionTitle,
  insights = [],
  accent = "var(--ink)",
  busy,
  slots = {},
  navTop = "top-14 lg:top-0",
  review,
}: {
  plan: AnyPlan;
  /** Both contexts lead with direction and fold supporting sections for readable scanning. */
  mode: "start" | "app";
  directionTitle?: string;
  insights?: PlanInsight[];
  /** The business's own colour, for the small accents. */
  accent?: string;
  /** Sections an owner change is rewriting right now. */
  busy?: Set<SectionKey>;
  slots?: PlanSlots;
  /** Where the sticky section index sits under the page's own sticky header. */
  navTop?: string;
  /** Where each assumption stands (docs/posts-v2.md, Phase C), once there is a month. */
  review?: HypothesisReview | null;
}) {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root, plan);
  const colors = channelColors(plan as QuarterPlan);
  const months = plan.calendar.map((m) => m.month_label);
  const isBusy = (key: SectionKey) => Boolean(busy?.has(key));

  return (
    <div ref={root} className={`plan-document ${styles.document}`} data-mode={mode}>
      {mode === "app" && <SectionNav top={navTop} />}

      {/* The conclusion first: the strategy in one line, then the plan at a glance, as one
          sheet. */}
      <div className={styles.sheet}>
        <Section id="strategy" index={1} busy={isBusy("strategy")} mode={mode}>
          <StrategyBlock plan={plan} insights={insights} audienceSlot={slots.audience} directionTitle={directionTitle} />
        </Section>

        <Glance plan={plan} months={months} />
      </div>
      {mode === "start" && <section className={styles.firstStep} aria-label="הצעד הראשון בתוכנית"><p>הצעד הראשון</p><h3>לבדוק מה כבר יש לכם לפוסט הראשון.</h3><span>נחבר את המדידה הזמינה, נכין פוסט לאישור ולפרסום ונלמד מהתוצאות.</span></section>}

      <div className={styles.folds}>
      <Section id="measure" index={2} busy={isBusy("measure")} mode={mode} summary={measureSummary(plan)}>
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

      <Section id="bets" index={7} busy={isBusy("bets")} mode={mode} summary={betsSummary(plan, review)}>
        <BetsBlock plan={plan} mode={mode} review={review} />
      </Section>

      {plan.inside?.length ? (
        <Section id="inside" index={8} busy={false} mode={mode} summary={plan.inside.map((i) => i.title_he).slice(0, 3).join(" · ")}>
          <InsideBlock plan={plan} />
        </Section>
      ) : null}
      </div>

      {slots.end}
    </div>
  );
}

/* --------------------------------- Frame --------------------------------- */

function SectionNav({ top }: { top: string }) {
  return (
    <nav aria-label="חלקי התוכנית" className={`sticky ${top} z-20 -mx-4 bg-[var(--canvas)]/95 px-4 py-2 backdrop-blur lg:mx-0 lg:px-0`}>
      <ol className={`flex gap-1 overflow-x-auto ${styles.nav}`}>
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
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-[color:var(--ink-soft)] transition-colors hover:bg-[var(--soft)] hover:text-[color:var(--ink)]"
            >
              <span className="tabular-nums text-[color:var(--ink-muted)]">{index + 1}</span>
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
    <span className="flex items-baseline gap-3">
      <span
        aria-hidden
        className="w-5 shrink-0 text-[13px] font-medium tabular-nums text-[color:var(--ink-muted)]"
      >
        {index}
      </span>
      <span id={headingId} className={styles.foldTitle}>
        {title}
      </span>
      {busy ? <span className={`text-xs font-semibold text-[color:var(--ink-soft)] ${styles.busy}`}>מעדכנים…</span> : null}
    </span>
  );
  const body = <div className={`transition-opacity duration-300 motion-reduce:transition-none ${index > 1 ? `mt-2 ${styles.foldBody}` : "mt-3"} ${busy ? "opacity-50" : ""}`}>{children}</div>;

  // Supporting sections fold in both the first meeting and the signed-in plan.
  if (index > 1) {
    return (
      // `data-reveal`: once the section reaches the screen, its budget bars and month dots
      // (`.seg`, `.dot`) animate in. Without it they stayed at scale 0, invisible.
      <section id={`plan-${id}`} data-reveal aria-labelledby={headingId} aria-busy={busy} className={`scroll-mt-28 ${styles.fold}`}>
        <details className="group">
          <summary className={styles.foldHead}>
            <span className="min-w-0">
              {heading}
              {summary ? <span className={styles.foldSummary}>{summary}</span> : null}
            </span>
            <IconChevron className={styles.chevron} />
          </summary>
          {body}
        </details>
      </section>
    );
  }

  return (
    <section id={`plan-${id}`} aria-labelledby={headingId} aria-busy={busy} className={`scroll-mt-28 ${styles.direction}`}>
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
        className="mt-1 inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-[color:var(--primary)] underline-offset-4 hover:underline"
      >
        למה?
        <IconChevron className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-90" : "-rotate-90"}`} />
      </button>
      <div id={id} hidden={!open} className="mt-1 rounded-xl bg-[var(--soft)] px-4 py-3 text-sm leading-6 text-[color:var(--ink)]">
        <p>{why}</p>
        {insight ? (
          <p className="mt-2 text-[color:var(--ink-soft)]">
            <b className="font-semibold text-[color:var(--ink)]">מתוך מה שגילינו: </b>
            {insight.text_he}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------- Glance --------------------------------- */

function measureSummary(plan: AnyPlan): string {
  const numbers = plan.numbers;
  if (!numbers) return plan.kpi.name_he;
  const target = numbers.target?.kind !== "qualitative" ? numbers.target?.text_he : "";
  return target ? `${numbers.lever.name_he} · ${isolate(target)}` : numbers.lever.name_he;
}

/** For plain-string slots (a summary line, a tile note): number runs wrapped in LTR isolates. */
function isolate(text: string): string {
  return rangeSafe(text).replace(/(?<![\d.,])\+?\d[\d,.]*%?(?:-\+?\d[\d,.]*%?)*/g, (m) => `\u2066${m}\u2069`);
}

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

function Glance({ plan, months }: { plan: AnyPlan; months: string[] }) {
  // Revision 6: with the owner's numbers, the glance names the lever and the calculated
  // target; without them it falls back to the KPI and its own target.
  const numbers = plan.numbers;
  const target = numbers?.target && numbers.target.kind !== "qualitative" ? numbers.target.text_he : "";
  const targetLine = numbers
    ? target
      ? `היעד: ${isolate(target)}`
      : "היעד: אחרי חודש של מדידה"
    : plan.kpi.target
      ? `היעד: ${plan.kpi.target}`
      : "";
  return (
    <section className={styles.glance} aria-label="איך נדע שהתוכנית עובדת">
      <p>איך נדע שזה עובד</p>
      <h3>{plan.kpi.name_he}</h3>
      {numbers ? <p>מה מגדילים: {numbers.lever.name_he}</p> : null}
      {targetLine ? <p>{targetLine}</p> : null}
      <p className={styles.baseline}>
        <BidiText text={numbers?.baseline_he || plan.kpi.baseline_he} />
      </p>
      <div><span>{months.join(" · ")}</span><span>{budgetSummary(plan)}</span></div>
    </section>
  );
}

/* ---------------------------------- 1 ---------------------------------- */

function StrategyBlock({
  plan,
  insights,
  audienceSlot,
  directionTitle,
}: {
  plan: AnyPlan;
  insights: PlanInsight[];
  audienceSlot?: React.ReactNode;
  directionTitle?: string;
}) {
  const insight = plan.strategy.from_insight != null ? insights[plan.strategy.from_insight] : undefined;
  return (
    <div className="space-y-3">
      <div>
        <p className={styles.oneLiner}>{directionTitle || plan.strategy.one_liner_he}</p>
        <p className="mt-3 text-base leading-7 text-[color:var(--ink-soft)]">
          <b className="text-[color:var(--ink)]">הזווית: </b>
          {plan.strategy.angle_he}
        </p>
        <Why why={directionTitle && directionTitle !== plan.strategy.one_liner_he ? `${plan.strategy.one_liner_he} ${plan.strategy.why_he}` : plan.strategy.why_he} insight={insight} />
      </div>
      {audienceSlot && <details className={styles.adjustment}><summary>לשנות עם מי מתחילים</summary>{audienceSlot}</details>}
    </div>
  );
}

/* ---------------------------------- 2 ---------------------------------- */

/** Status is words first, with a small mark beside them (DESIGN-STANDARD §4), not a pill. */
const STATUS_STYLE: Record<IntegrationStatus, string> = {
  have: "text-[var(--good)]",
  connect: "text-[var(--sand-dark)]",
  install: "text-[var(--primary-dark)]",
  unknown: "text-[color:var(--ink-muted)]",
};

function StatusChip({ status, live }: { status: IntegrationStatus; live?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold leading-6 ${STATUS_STYLE[status]}`}>
      {status === "have" ? (
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full bg-[var(--good)] ${live ? styles.live : ""}`} />
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

/** Whether a measure works today: the words, with a small dot beside them. */
function Availability({ now }: { now: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${now ? "text-[var(--good)]" : "text-[color:var(--ink-muted)]"}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${now ? "bg-[var(--good)]" : "bg-[var(--ink-faint)]"}`} />
      {now ? "אפשר למדוד מהיום" : "אחרי חיבור"}
    </span>
  );
}

const PAYBACK_STYLE: Record<string, string> = {
  no: "bg-[var(--sand)] text-[var(--sand-dark)]",
  partly: "bg-[var(--soft)] text-[color:var(--ink)]",
  pays: "bg-[var(--good-soft)] text-[var(--good)]",
};

/** A label over a value or a group: 12px, 600, muted. */
const LABEL = "text-xs font-semibold text-[color:var(--ink-muted)]";
/** A heading over a list inside a section. */
const SUBHEAD = "text-[15px] font-semibold text-[color:var(--ink)]";

/** "המספרים": where the business is today → what we grow → the target and its math → unit economics. */
function NumbersBlock({ numbers, accent, targetSlot }: { numbers: PlanNumbers; accent: string; targetSlot?: React.ReactNode }) {
  const target = numbers.target;
  const lever = numbers.lever;
  return (
    <div className="space-y-4">
      <ol className={styles.card}>
        <li className="px-5 py-4">
          <p className={LABEL}>היום</p>
          <p className="mt-1 text-[15px] leading-7 text-[color:var(--ink)]">
            <BidiText text={numbers.baseline_he} />
          </p>
        </li>
        <li className="border-t border-[var(--rule)] px-5 py-4">
          <p className={LABEL}>מה מגדילים</p>
          <p className="mt-1 text-[17px] font-bold leading-7 text-[color:var(--ink)]">{lever.name_he}</p>
          <p className="mt-0.5 text-[13px] leading-6 text-[color:var(--ink-soft)]">
            {lever.recommended_key === lever.key ? (
              <BidiText text={lever.recommended_he} />
            ) : (
              <>
                <b className="font-semibold text-[color:var(--ink)]">המלצנו על {lever.recommended_name_he}: </b>
                <BidiText text={lever.recommended_he} />
              </>
            )}
          </p>
        </li>
        <li className="border-t border-[var(--rule)] px-5 py-5" style={{ background: `color-mix(in srgb, ${accent} 6%, var(--paper))` }}>
          <p className={LABEL}>יעד העבודה</p>
          {target?.text_he ? (
            <p className={`mt-1 font-bold tracking-tight text-[color:var(--ink)] ${target.kind === "qualitative" ? "text-[17px] leading-7" : "text-[22px] leading-8 tabular-nums"}`}>
              <BidiText text={target.text_he} />
            </p>
          ) : (
            <p className="mt-1 text-[15px] text-[color:var(--ink-soft)]">בלי יעד במספרים בינתיים.</p>
          )}
          {target?.level_he ? (
            <p className="text-[15px] text-[color:var(--ink)]">
              כלומר <BidiText text={target.level_he} />
            </p>
          ) : null}
          {target?.edited_by_owner && target.suggested_he ? (
            <p className="text-[13px] text-[color:var(--ink-soft)]">
              החישוב שלנו: <BidiText text={target.suggested_he} />
            </p>
          ) : null}
          <MathLines lines={numbers.math_he} />
          <p className="mt-3 text-[13px] font-medium leading-6 text-[color:var(--ink-soft)]">{numbers.caveat_he}</p>
          {targetSlot ? <div className="mt-3">{targetSlot}</div> : null}
        </li>
      </ol>
      {numbers.unit_economics_he ? (
        <p className={`rounded-xl px-4 py-3 text-[13px] leading-6 ${PAYBACK_STYLE[numbers.payback ?? "partly"] ?? PAYBACK_STYLE.partly}`}>
          <b className="block text-xs font-semibold">כמה עולה להביא לקוח, וכמה הוא שווה</b>
          <BidiText text={numbers.unit_economics_he} />
        </p>
      ) : null}
      <p className="flex items-start gap-2 text-[13px] leading-6 text-[color:var(--ink)]">
        <IconCheck className="mt-1 h-4 w-4 shrink-0 text-[color:var(--good)]" />
        {numbers.first_checkpoint_he}
      </p>
      <SourcesAndAssumptions result={numbers} />
    </div>
  );
}

function MeasureBlock({ plan, accent, targetSlot }: { plan: AnyPlan; accent: string; targetSlot?: React.ReactNode }) {
  const integrations = plan.integrations;
  const ready = integrations.filter((i) => i.status === "have").length;
  const todo = integrations.length - ready;
  const nameOf = (key: string) => integrations.find((i) => i.key === key)?.name_he ?? key;
  const numbers = plan.numbers;
  return (
    <div className="space-y-8">
      {numbers ? <NumbersBlock numbers={numbers} accent={accent} targetSlot={targetSlot} /> : null}
      {/* The KPI leads: the one number the plan answers to. */}
      <div className={numbers ? `${styles.card} px-5 py-4` : "rounded-2xl px-5 py-4"} style={numbers ? undefined : { background: `color-mix(in srgb, ${accent} 6%, var(--paper))` }}>
        <p className={LABEL}>{numbers ? "איך סופרים את זה" : "המדד העיקרי"}</p>
        <p className="mt-1 text-xl font-bold leading-8 tracking-tight text-[color:var(--ink)]">{plan.kpi.name_he}</p>
        <p className="mt-1 text-[15px] leading-7 text-[color:var(--ink-soft)]">{plan.kpi.how_he}</p>
        {plan.kpi.needs ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-6 text-[color:var(--ink)]">
            <Availability now={Boolean(plan.kpi.available_now)} />
            {plan.kpi.needs.length ? (
              <span>
                <b className="font-semibold">צריך: </b>
                {plan.kpi.needs.map(nameOf).join(" · ")}
              </span>
            ) : (
              <span>סופרים בעצמכם, בלי חיבור.</span>
            )}
          </p>
        ) : null}
        {numbers ? null : targetSlot ? (
          <div className="mt-3">{targetSlot}</div>
        ) : plan.kpi.target ? (
          <p className="mt-3 text-[15px] font-semibold text-[color:var(--ink)]">היעד שלכם: {plan.kpi.target}</p>
        ) : null}
        {numbers ? null : (
          <p className="mt-3 flex items-start gap-2 text-[13px] leading-6 text-[color:var(--ink-soft)]">
            <IconFlag className="mt-1 h-4 w-4 shrink-0" />
            {plan.kpi.baseline_he}
          </p>
        )}
      </div>

      <div>
        <h3 className={SUBHEAD}>איך נמדוד</h3>
        <ul className={`mt-3 ${styles.card}`}>
          {plan.measures.map((measure, index) => (
            <li key={measure.name_he} className={`px-5 py-4 ${index ? "border-t border-[var(--rule)]" : ""}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-[15px] font-semibold text-[color:var(--ink)]">{measure.name_he}</p>
                {measure.name_he === plan.kpi.name_he ? (
                  <span className="text-xs font-semibold text-[color:var(--primary)]">המדד העיקרי</span>
                ) : null}
                <Availability now={measure.available_now} />
              </div>
              <p className="mt-0.5 text-[13px] leading-6 text-[color:var(--ink-soft)]">{measure.how_he}</p>
              {measure.needs.length ? (
                <p className="mt-0.5 text-[13px] leading-6 text-[color:var(--ink)]">
                  <b className="font-semibold">צריך: </b>
                  {measure.needs.map(nameOf).join(" · ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h3 className={SUBHEAD}>מה צריך כדי למדוד</h3>
          <p className="text-[13px] text-[color:var(--ink-muted)]">
            {ready ? `${ready} כבר עובד` : "עוד לא מחובר כלום"}
            {todo ? ` · ${todo} לחבר אחרי ההרשמה` : ""}
          </p>
        </div>
        <ul className={`mt-3 ${styles.card}`}>
          {integrations.map((integration, index) => {
            const guide = INTEGRATION_GUIDE[integration.key];
            const live = integration.key === "whatsapp_link";
            return (
              <li key={integration.key} className={`px-5 py-4 ${index ? "border-t border-[var(--rule)]" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-[15px] font-semibold leading-6 text-[color:var(--ink)]">{integration.name_he}</p>
                  <StatusChip status={live ? "have" : integration.status} live={live} />
                </div>
                <p className="mt-0.5 text-[13px] leading-6 text-[color:var(--ink)]">{integration.why_he}</p>
                <div className="flex flex-wrap items-center justify-between gap-x-3">
                  <p className="text-[13px] leading-6 text-[color:var(--ink-muted)]">{integration.effort_he}</p>
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
    <ul className={styles.card}>
      {items.map((channel, index) => (
        <li key={channel.key} className={`flex gap-3 px-5 py-4 ${index ? "border-t border-[var(--rule)]" : ""}`}>
          <span aria-hidden className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[channel.key] }} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <p className="text-[15px] font-semibold text-[color:var(--ink)]">{channel.name_he}</p>
              {isNew ? (
                <span className="text-xs font-semibold text-[color:var(--primary)]">
                  חדש · מ{months[channel.starts_month - 1] ?? `חודש ${channel.starts_month}`}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm leading-6 text-[color:var(--ink)]">{channel.why_he}</p>
            <p className="mt-0.5 text-[13px] leading-6 text-[color:var(--ink-muted)]">
              {channel.cadence_he ? `${channel.cadence_he} · ` : ""}
              {channel.effort_he}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="space-y-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
      {existing.length ? (
        <div>
          <h3 className={`mb-3 ${SUBHEAD}`}>מחזקים את מה שיש</h3>
          {list(existing, false)}
        </div>
      ) : null}
      {fresh.length ? (
        <div className={existing.length ? "" : "lg:col-span-2"}>
          <h3 className={`mb-3 ${SUBHEAD}`}>ערוצים חדשים שנפתח</h3>
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
      <div className="space-y-4">
        <div className={`${styles.card} px-5 py-4`}>
          <p className="text-base font-semibold text-[color:var(--ink)]">בלי תקציב פרסום. התוכנית בנויה על הזמן שתוכלו להשקיע.</p>
          {plan.channels.length ? (
            <p className="mt-1 text-sm leading-6 text-[color:var(--ink-soft)]">
              כל הערוצים בתוכנית עובדים בלי לשלם על פרסום: {plan.channels.map((c) => c.name_he).join(", ")}.
            </p>
          ) : null}
        </div>
        {b.unlock_he ? (
          <p className="text-sm leading-6 text-[color:var(--ink)]">
            <b className="font-semibold text-[color:var(--ink)]">מה סכום קטן היה מוסיף: </b>
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
    <div className="space-y-4">
      {b.monthly_ils ? (
        <p className="text-[15px] leading-7 text-[color:var(--ink)]">
          <b className="font-bold tabular-nums text-[color:var(--ink)]">{formatIls(b.monthly_ils)} בחודש</b>, מחולקים לפי מה שמתחיל מתי.
          {b.basis_he ? <span className="block text-[13px] text-[color:var(--ink-muted)]">{b.basis_he}</span> : null}
        </p>
      ) : null}
      <figure className={`${styles.card} px-5 py-5`}>
        <figcaption className="sr-only">חלוקת התקציב לפי חודש וערוץ</figcaption>
        <ul className="space-y-4">
          {b.months.map((month, index) => {
            const low = month.lines.reduce((s, l) => s + l.ils_range[0], 0);
            const high = month.lines.reduce((s, l) => s + l.ils_range[1], 0);
            return (
              <li key={month.month_label}>
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="font-semibold text-[color:var(--ink)]">{month.month_label}</span>
                  <span className="font-semibold tabular-nums text-[color:var(--ink)]">{month.lines.length ? formatRange([low, high]) : "בלי פרסום"}</span>
                </div>
                <div className="mt-1.5 flex h-5 gap-[2px] overflow-hidden rounded-md" style={{ width: `${Math.max(8, (totals[index] / max) * 100)}%` }}>
                  {month.lines.length ? (
                    month.lines.map((line) => {
                      const mid = (line.ils_range[0] + line.ils_range[1]) / 2;
                      return (
                        <span
                          key={line.channel_key}
                          title={`${channelName(plan as QuarterPlan, line.channel_key)}: ${formatRange(line.ils_range)}`}
                          className={`block h-full ${styles.seg}`}
                          style={{ width: `${(mid / (totals[index] || 1)) * 100}%`, background: colors[line.channel_key] }}
                        />
                      );
                    })
                  ) : (
                    <span className="block h-full w-full bg-[var(--rule)]" />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-[var(--rule)] pt-4" aria-label="מקרא">
          {keys.map((key) => (
            <li key={key} className="flex items-center gap-2 text-[13px] text-[color:var(--ink-soft)]">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: colors[key] }} />
              {channelName(plan as QuarterPlan, key)}
            </li>
          ))}
        </ul>
      </figure>
      <p className="text-[13px] leading-6 text-[color:var(--ink-muted)]">טווחים לתכנון, לא הבטחה לתוצאה. בלי דמי ניהול.</p>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[color:var(--ink-soft)] transition-colors hover:text-[color:var(--ink)] [&::-webkit-details-marker]:hidden">
          הסכומים לפי ערוץ, ומאיפה המספרים
          <IconChevron className="h-[18px] w-[18px] -rotate-90 text-[color:var(--ink-muted)] transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" />
        </summary>
        <div className="mt-2 space-y-4 text-sm leading-6 text-[color:var(--ink)]">
          <table className="w-full text-right text-[13px]">
            <thead>
              <tr className="text-[color:var(--ink-muted)]">
                <th className="py-2 text-xs font-semibold">חודש</th>
                <th className="py-2 text-xs font-semibold">ערוץ</th>
                <th className="py-2 text-xs font-semibold">סכום</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
              {b.months.flatMap((month) =>
                month.lines.map((line) => (
                  <tr key={`${month.month_label}-${line.channel_key}`}>
                    <td className="py-2.5 align-top font-semibold text-[color:var(--ink)]">{month.month_label}</td>
                    <td className="py-2.5">
                      {channelName(plan as QuarterPlan, line.channel_key)}
                      {line.note_he ? <span className="block text-[color:var(--ink-muted)]">{line.note_he}</span> : null}
                    </td>
                    <td className="py-2.5 align-top font-semibold tabular-nums">{formatRange(line.ils_range)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
          {b.sources?.length || b.sources_he.length ? (
            <div>
              <p className={LABEL}>המקורות</p>
              <ul className="mt-2 space-y-1.5 text-[13px] text-[color:var(--ink-soft)]">
                {b.sources?.length
                  ? b.sources.map((source) => (
                      <li key={source.url} className="flex gap-2.5">
                        <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[var(--ink-faint)]" />
                        <a href={source.url} target="_blank" rel="noreferrer" className="text-[color:var(--primary)] underline-offset-4 hover:underline">
                          {source.title}
                        </a>
                      </li>
                    ))
                  : b.sources_he.map((source) => (
                      <li key={source} className="flex gap-2.5">
                        <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[var(--ink-faint)]" />
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
    <ol className="relative grid gap-4 lg:grid-cols-3">
      {plan.calendar.map((month, index) => {
        const opens = plan.channels.filter((c) => c.kind === "new" && c.starts_month === index + 1);
        return (
          <li key={month.month_label} className="relative flex gap-3 lg:block">
            {/* The spine on phones: a ring per month on one vertical line, like the route. */}
            <span aria-hidden className="relative flex w-5 shrink-0 justify-center lg:hidden">
              <span className={`relative z-10 mt-5 h-3 w-3 rounded-full border-2 bg-[var(--paper)] ${styles.dot}`} style={{ borderColor: accent }} />
              {index < plan.calendar.length - 1 ? <span className="absolute bottom-[-1rem] top-9 w-px bg-[var(--rule-dark)]" /> : null}
            </span>
            <div className={`min-w-0 flex-1 px-5 py-4 lg:h-full ${styles.card}`}>
              <p className="flex items-center gap-2">
                <span aria-hidden className={`hidden h-2.5 w-2.5 rounded-full border-2 lg:block ${styles.dot}`} style={{ borderColor: accent }} />
                <span className="text-xs font-semibold text-[color:var(--ink-muted)]">חודש {index + 1}</span>
                <span className="text-base font-bold text-[color:var(--ink)]">{month.month_label}</span>
              </p>
              {opens.length ? (
                <p className="mt-3 text-[13px] leading-6 text-[color:var(--ink)]">
                  <b className="font-semibold">נפתח: </b>
                  {opens.map((c) => c.name_he).join(", ")}
                </p>
              ) : null}
              {month.weeks?.length ? (
                <ol className="mt-3 space-y-1.5">
                  {month.weeks.map((week) => (
                    <li key={week.week} className="flex gap-2 text-[13px] leading-6 text-[color:var(--ink)]">
                      <span className="w-12 shrink-0 font-medium text-[color:var(--ink-muted)]">שבוע {week.week}</span>
                      <span className="min-w-0">
                        {week.focus_he}
                        {week.dates_he ? <span className="block text-xs text-[color:var(--ink-muted)] tabular-nums">{week.dates_he}</span> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}
              {month.dates.length ? (
                <ul className="mt-3 space-y-2">
                  {month.dates.map((date) => (
                    <li key={`${date.date}-${date.name_he}`} className="flex gap-2.5 text-[13px] leading-6">
                      <span className="h-6 shrink-0 rounded-md bg-[var(--sand)] px-1.5 text-xs font-semibold leading-6 tabular-nums text-[var(--sand-dark)]">{shortDate(date.date)}</span>
                      <span className="min-w-0 text-[color:var(--ink)]">
                        <b className="font-semibold text-[color:var(--ink)]">{date.name_he}: </b>
                        {date.action_he}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[13px] text-[color:var(--ink-muted)]">אין תאריכים מיוחדים. חודש של קצב קבוע.</p>
              )}
              <p className="mt-4 flex items-start gap-2 border-t border-[var(--rule)] pt-3 text-[13px] leading-6 text-[color:var(--ink)]">
                <IconCheck className="mt-1 h-4 w-4 shrink-0 text-[color:var(--good)]" />
                <span>
                  <b className="block text-xs font-semibold text-[color:var(--ink-muted)]">נקודת בדיקה</b>
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
    <div className="space-y-4">
      <ol className="grid gap-4 lg:grid-cols-3">
        {plan.content.map((month, index) => (
          <li key={month.month_label} className={`px-5 py-4 ${styles.card}`}>
            <p className="text-xs font-semibold text-[color:var(--ink-muted)]">
              חודש {index + 1} · <span className="text-[color:var(--ink)]">{month.month_label}</span>
            </p>
            {/* Topics, not states: a short list, not pills. */}
            <ul className="mt-2 space-y-0.5" aria-label="הנושאים">
              {month.pillars.map((pillar) => (
                <li key={pillar.key} title={pillar.description_he} className="flex items-start gap-2.5 text-[15px] font-semibold leading-7 text-[color:var(--ink)]">
                  <span aria-hidden className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
                  {pillar.title}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[13px] leading-6 text-[color:var(--ink-muted)]">
              {month.cadence.map((c) => `${channelName(plan as QuarterPlan, c.channel_key)} ${c.per_week}`).join(" · ")}
            </p>
            {month.mix?.length ? (
              <ul className="mt-3 space-y-2.5 border-t border-[var(--rule)] pt-3" aria-label="תמהיל הפוסטים">
                {month.mix.map((item) => (
                  <li key={item.type_key} className="text-sm leading-6 text-[color:var(--ink)]">
                    <span className="flex items-baseline justify-between gap-2">
                      <b className="font-semibold">{item.name_he}</b>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-[color:var(--ink-muted)]">{rangeSafe(item.per_month)} בחודש</span>
                    </span>
                    {item.purpose_he ? <span className="block text-[13px] leading-5 text-[color:var(--ink-soft)]">{item.purpose_he}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="text-sm leading-6 text-[color:var(--ink-soft)]">
        {plan.content.find((m) => m.products_note_he)?.products_note_he ?? "אילו מוצרים להבליט בכל פוסט — אתם מחליטים בתוך המערכת, לפי מלאי ורווחיות."}{" "}
        את הפוסטים עצמם נכתוב ונעצב יחד בתוך המערכת.
      </p>
      {cadenceSlot}
    </div>
  );
}

/* ---------------------------------- 7 ---------------------------------- */

/** The section's one line: how many, and, once measured, where they stand. */
function betsSummary(plan: AnyPlan, review?: HypothesisReview | null): string {
  const items = reviewByKey(review);
  const states = plan.assumptions.flatMap((bet, index) => reviewFor(items, `assumption:${index}`, bet.bet_he) ?? []);
  const decided = states.some((state) => state.status !== "measuring");
  return decided ? `${plan.assumptions.length} השערות · ${statusSummary(states)}` : `${plan.assumptions.length} השערות שנמדוד`;
}

function BetsBlock({ plan, mode, review }: { plan: AnyPlan; mode: "start" | "app"; review?: HypothesisReview | null }) {
  const items = reviewByKey(review);
  const states = plan.assumptions.map((bet, index) => reviewFor(items, `assumption:${index}`, bet.bet_he));
  return (
    <div>
      {/* Before there is a month (and at /start) nothing is measured yet, and it says so. */}
      {states.some(Boolean) ? null : (
        <p className="mb-4 text-[13px] leading-6 text-[color:var(--ink-muted)]">אלה ההשערות של התוכנית. אין עדיין תוצאות בדיקה מקושרות אליהן.</p>
      )}
      <ul className={styles.card}>
        {plan.assumptions.map((bet, index) => {
          const state = states[index];
          return (
            <li key={bet.bet_he} className={`px-5 py-4 ${index ? "border-t border-[var(--rule)]" : ""}`}>
              <HypothesisNote
                hypothesis={bet.bet_he}
                ifWrong={bet.if_wrong_he}
                status={state ? <HypothesisStatusLine status={state.status} statusHe={state.status_he} evidence={state.evidence_he} /> : undefined}
              />
            </li>
          );
        })}
      </ul>
      {/* Before signup there are no results to open. */}
      {mode === "app" && <a href="/performance" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[color:var(--primary)] underline-offset-4 hover:underline">לבדוק את התוצאות</a>}
    </div>
  );
}

/* ---------------------------------- 8 ---------------------------------- */

/** "מה מחכה לכם בפנים": what the app gives once inside. Fixed on the server, never invented. */
function InsideBlock({ plan }: { plan: AnyPlan }) {
  return (
    <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {(plan.inside ?? []).map((item) => (
        <li key={item.key} className="flex gap-3">
          <IconCheck className="mt-1 h-4 w-4 shrink-0 text-[color:var(--primary)]" />
          <span className="min-w-0">
            <b className="block text-[15px] font-semibold leading-6 text-[color:var(--ink)]">{item.title_he}</b>
            <span className="block text-[13px] leading-6 text-[color:var(--ink-soft)]">{item.what_he}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
