"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ApiError, type PlanInsight } from "@/lib/api";
import { defaultGoalFor } from "@/lib/businessModel";
import {
  CADENCE_OPTIONS,
  chosenDirectionOf,
  draftForApi,
  fetchStrategy,
  inferBusinessModel,
  inputsForApi,
  strategyBase,
  targetUnitFor,
  type FlowState,
  type Strategy,
  type StrategyInputKey,
  type StrategyInputs,
} from "@/lib/draft";
import { sourceLabel, WorkProgress, type RevealProps } from "./StepPlan";
import { Chip, StepShell, rangeSafe } from "./ui";
import styles from "./start.module.css";

/**
 * "האסטרטגיה": the consultant's one-pager for the chosen direction. Mobile first: short
 * blocks, each with a small "למה?" that opens the reason and the finding it came from.
 *
 * The owner shapes it here, not only by picking A or B: an own target, who comes first,
 * the three topics, and how often to post. Every change goes back to the API (debounced),
 * the affected blocks dim while it works, and one line says what changed.
 */

type BlockKey =
  | "objective"
  | "success"
  | "angle"
  | "audiences"
  | "pillars"
  | "channels"
  | "offer"
  | "plan"
  | "assumptions";

/** Which blocks an owner change can rewrite, so only those show "מעדכנים". */
const AFFECTS: Record<StrategyInputKey, BlockKey[]> = {
  target: ["success"],
  cadence: ["channels", "plan", "assumptions"],
  primary_audience: ["objective", "audiences", "plan", "assumptions"],
  pillars_removed: ["pillars", "plan"],
  feedback: [],
};

const DEBOUNCE_MS = 700;
const TYPING_DEBOUNCE_MS = 1200;

/** "מה השתנה" when the API does not say it itself: a plain diff of what moved. */
function describeChange(before: Strategy | null, after: Strategy, keys: StrategyInputKey[]): string {
  const notes: string[] = [];
  if (keys.includes("cadence") && after.channels[0]) notes.push(`הקצב: ${after.channels[0].cadence_he}.`);
  if (keys.includes("target")) {
    notes.push(after.success.owner_target ? `נמדוד מול היעד שלכם: ${after.success.owner_target}.` : "בלי יעד מספרי. נמדוד ונראה.");
  }
  if (keys.includes("primary_audience")) {
    const primary = after.audiences.find((a) => a.role === "primary");
    if (primary) notes.push(`מתחילים עם ${primary.name}.`);
  }
  if (keys.includes("pillars_removed")) {
    const had = new Set(before?.pillars.map((p) => p.key) ?? []);
    const added = after.pillars.filter((p) => !had.has(p.key)).map((p) => p.title);
    notes.push(added.length ? `נושא חדש: ${added.join(", ")}.` : "הנושאים התעדכנו.");
  }
  return notes.join(" ") || "האסטרטגיה התעדכנה.";
}

/** The audiences in the owner's own order, so a tapped row does not jump away under the finger. */
function stableAudiences(strategy: Strategy, flow: FlowState): Strategy["audiences"] {
  const order = flow.draft.audiences.map((a) => a.name);
  const rank = (name: string) => {
    const index = order.indexOf(name);
    return index === -1 ? order.length : index;
  };
  return [...strategy.audiences].sort((a, b) => rank(a.name) - rank(b.name));
}

function goalOf(flow: FlowState) {
  const d = flow.draft;
  return d.goal ?? defaultGoalFor(d.business_model ?? inferBusinessModel(d.business_type, d.offerings));
}

/** "הזמנות נוספות" / "פניות נוספות" / "עוקבים חדשים": the unit in the owner's target. */
function targetPhrase(flow: FlowState): { phrase: string; steps: number[] } {
  const goal = goalOf(flow);
  const { unit, steps } = targetUnitFor(goal);
  return { phrase: goal === "brand_awareness" ? unit : `${unit} נוספות`, steps };
}

export function StepStrategy(props: RevealProps) {
  const { flow, update, next, jump } = props;
  const direction = chosenDirectionOf(flow);
  const base = strategyBase(flow);
  const strategy = flow.strategyFor === base ? (flow.strategy ?? null) : null;
  const insights = flow.plan?.insights ?? [];

  const [failed, setFailed] = useState(false);
  const [failMessage, setFailMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busyBlocks, setBusyBlocks] = useState<Set<BlockKey>>(new Set());
  const [changeNote, setChangeNote] = useState("");
  const [updateError, setUpdateError] = useState(false);

  const latest = useRef(flow);
  useEffect(() => {
    latest.current = flow;
  }, [flow]);
  const pendingKeys = useRef<Set<StrategyInputKey>>(new Set());
  const timer = useRef<number | null>(null);
  const requestId = useRef(0);

  // The first strategy for this direction. A new direction keeps the owner's target,
  // cadence and first audience, but not the topics they swapped (those were its own).
  useEffect(() => {
    if (!direction || (flow.strategyFor === base && flow.strategy)) return;
    let live = true;
    const inputs = { ...inputsForApi(flow) };
    delete inputs.pillars_removed;
    fetchStrategy(draftForApi(flow), direction, inputs, [], { insights })
      .then((result) => {
        if (!live) return;
        setFailed(false);
        update((f) => ({
          ...f,
          strategy: result,
          strategyFor: base,
          strategyInputs: { ...(f.strategyInputs ?? {}), pillars_removed: undefined },
        }));
      })
      .catch((err: unknown) => {
        if (!live) return;
        setFailMessage(err instanceof ApiError && /[֐-׿]/.test(err.message) ? err.message : "");
        setFailed(true);
      });
    return () => {
      live = false;
    };
    // Once per direction and set of answers (and per retry).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, attempt]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const runUpdate = useCallback(() => {
    timer.current = null;
    const current = latest.current;
    const dir = chosenDirectionOf(current);
    const keys = [...pendingKeys.current];
    pendingKeys.current = new Set();
    if (!dir || !keys.length) return;
    const id = (requestId.current += 1);
    const previous = current.strategy ?? null;
    const requestBase = strategyBase(current);
    fetchStrategy(draftForApi(current), dir, inputsForApi(current), keys, { insights: current.plan?.insights, previous })
      .then((result) => {
        if (id !== requestId.current) return;
        setBusyBlocks(new Set());
        setUpdateError(false);
        setChangeNote(result.changed_he?.trim() || describeChange(previous, result, keys));
        update((f) => (strategyBase(f) === requestBase ? { ...f, strategy: result, strategyFor: requestBase } : f));
      })
      .catch(() => {
        if (id !== requestId.current) return;
        setBusyBlocks(new Set());
        setUpdateError(true);
        // Keep the keys, so "לנסות שוב" sends the same change again.
        keys.forEach((key) => pendingKeys.current.add(key));
      });
  }, [update]);

  /** An owner change: shown at once, sent after a short pause. */
  const change = useCallback(
    (patch: Partial<StrategyInputs>, keys: StrategyInputKey[], typing = false) => {
      update((f) => ({ ...f, strategyInputs: { ...(f.strategyInputs ?? {}), ...patch } }));
      keys.forEach((key) => pendingKeys.current.add(key));
      setBusyBlocks((current) => new Set([...current, ...keys.flatMap((key) => AFFECTS[key])]));
      setChangeNote("");
      setUpdateError(false);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(runUpdate, typing ? TYPING_DEBOUNCE_MS : DEBOUNCE_MS);
    },
    [update, runUpdate],
  );

  const retryUpdate = () => {
    const keys = [...pendingKeys.current];
    setBusyBlocks(new Set(keys.flatMap((key) => AFFECTS[key])));
    setUpdateError(false);
    runUpdate();
  };

  const updating = busyBlocks.size > 0;
  const loading = Boolean(direction) && !strategy && !failed;

  if (!direction) {
    return (
      <StepShell
        {...props}
        title="האסטרטגיה"
        why="קודם בוחרים כיוון לחודש הראשון, ואז נבנה ממנו את האסטרטגיה."
        primary="לבחור כיוון"
        onPrimary={() => jump("direction")}
      >
        {null}
      </StepShell>
    );
  }

  const actionNote = strategy ? (
    <p aria-live="polite" className="min-h-5 px-1 pb-1 text-center text-[13px] leading-5 text-[#2b2d28]">
      {updating ? (
        <span className="text-[#5e6159]">מעדכנים את האסטרטגיה…</span>
      ) : updateError ? (
        <span className="font-bold text-[#9f4330]">
          לא הצלחנו לעדכן.{" "}
          <button type="button" onClick={retryUpdate} className="cursor-pointer underline underline-offset-4">
            לנסות שוב
          </button>
        </span>
      ) : changeNote ? (
        <span className={styles.rise}>
          <b>מה השתנה: </b>
          {rangeSafe(changeNote)}
        </span>
      ) : (
        <span className="text-[#6b6e65]">אפשר לשנות הכול אחר כך.</span>
      )}
    </p>
  ) : null;

  return (
    <StepShell
      {...props}
      title="האסטרטגיה"
      why={loading || !strategy ? `הכיוון: ${direction.title}.` : `${direction.title}. כל חלק כאן אפשר לכוון לפי מה שנכון לכם.`}
      primary={loading ? "בונים…" : failed && !strategy ? "לנסות שוב" : updating ? "מעדכנים…" : "לראות איך זה ייראה"}
      primaryDisabled={loading || updating}
      stickyAction
      actionNote={actionNote}
      onPrimary={() => {
        if (failed && !strategy) {
          setFailed(false);
          setAttempt((n) => n + 1);
          return;
        }
        next();
      }}
      skip={failed && !strategy ? "להמשיך בלי זה ולשמור" : undefined}
      onSkip={failed && !strategy ? () => jump("save") : undefined}
    >
      {loading ? (
        <WorkProgress
          title="בונים את האסטרטגיה…"
          note="עוד כמה שניות."
          pace={3000}
          lines={["מחברים את הכיוון למה שגילינו", "קובעים איך נדע שהצלחנו", "בוחרים 3 נושאים וקצב", "פורשים את החודש ל-4 שבועות"]}
        />
      ) : null}
      {failed && !strategy ? (
        <div role="alert" className="rounded-xl border border-[#e2e0d8] bg-white p-4 text-sm leading-6 text-[#2b2d28]">
          <p className="font-bold text-[#191b18]">לא הצלחנו לבנות את האסטרטגיה כרגע.</p>
          {failMessage ? <p>{failMessage}</p> : null}
          <p>הכיוון שבחרתם שמור. אפשר לנסות שוב, או לשמור ולבנות אותה אחרי ההרשמה.</p>
        </div>
      ) : null}
      {strategy ? (
        <StrategyPage flow={flow} strategy={strategy} insights={insights} busy={busyBlocks} change={change} />
      ) : null}
    </StepShell>
  );
}

/* ------------------------------ The one-pager ------------------------------ */

function StrategyPage({
  flow,
  strategy,
  insights,
  busy,
  change,
}: {
  flow: FlowState;
  strategy: Strategy;
  insights: PlanInsight[];
  busy: Set<BlockKey>;
  change: (patch: Partial<StrategyInputs>, keys: StrategyInputKey[], typing?: boolean) => void;
}) {
  const inputs = flow.strategyInputs ?? {};
  const insight = (index?: number) => (index != null ? insights[index] : undefined);
  const serverPrimary = strategy.audiences.find((a) => a.role === "primary")?.name;
  const primary = inputs.primary_audience || serverPrimary;
  const removed = inputs.pillars_removed ?? [];

  return (
    <div className={`space-y-2.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:space-y-0 ${styles.stagger}`}>
      {/* The objective leads: the conclusion first. */}
      <Block id="objective" title="המטרה" busy={busy.has("objective")} why={strategy.objective.why_he} insight={insight(strategy.objective.from_insight)} lead>
        <p className="text-lg font-black leading-7 text-[#191b18]">{strategy.objective.text_he}</p>
      </Block>

      <Block id="success" title="איך נדע שהצלחנו" busy={busy.has("success")}>
        <ul className="divide-y divide-[#f1f0ea]">
          {strategy.success.measures.slice(0, 3).map((measure) => (
            <li key={measure.name_he} className="py-2 first:pt-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-sm font-bold text-[#191b18]">{measure.name_he}</p>
                {measure.available_now ? (
                  <span className="rounded-full bg-[#e7f0e4] px-2 text-[11px] font-bold leading-5 text-[#2f5d2a]">אפשר למדוד כבר עכשיו</span>
                ) : (
                  <span className="rounded-full bg-[#f1efe8] px-2 text-[11px] font-bold leading-5 text-[#5e6159]">
                    {measure.needs_he || "אחרי שתחברו חשבון"}
                  </span>
                )}
              </div>
              <p className="text-xs leading-5 text-[#5e6159]">{measure.how_he}</p>
            </li>
          ))}
        </ul>
        <OwnerTarget flow={flow} value={inputs.target ?? ""} confirmed={strategy.success.owner_target} change={change} />
        <p className="mt-2 text-xs leading-5 text-[#5e6159]">{strategy.success.first_check_he}</p>
      </Block>

      <Block half id="angle" title="הזווית" busy={busy.has("angle")} why={strategy.angle.why_he} insight={insight(strategy.angle.from_insight)}>
        <p className="text-sm leading-6 text-[#191b18]">{strategy.angle.text_he}</p>
      </Block>

      <Block half id="audiences" title="למי קודם" busy={busy.has("audiences")} hint="לחצו כדי לבחור עם מי מתחילים">
        <div role="radiogroup" aria-label="הקהל העיקרי" className="divide-y divide-[#f1f0ea]">
          {stableAudiences(strategy, flow).map((audience) => {
            const on = audience.name === primary;
            return (
              <button
                key={audience.name}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  if (!on) change({ primary_audience: audience.name }, ["primary_audience"]);
                }}
                className="flex w-full cursor-pointer items-start gap-2.5 py-2 text-right first:pt-0 last:pb-0"
              >
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? "border-[#191b18]" : "border-[#c7c4b8]"}`}
                >
                  {on ? <span className={`h-2.5 w-2.5 rounded-full bg-[#191b18] ${styles.pop}`} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[#191b18]">{audience.name}</span>
                    {on ? <span className="rounded-full bg-[#191b18] px-2 text-[11px] font-bold leading-5 text-white">הקהל העיקרי</span> : null}
                  </span>
                  <span className="block text-xs leading-5 text-[#5e6159]">{audience.message_he}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Block>

      <Block id="pillars" title="על מה נדבר" busy={busy.has("pillars")} hint="3 נושאים שחוזרים כל החודש">
        <ol className="divide-y divide-[#f1f0ea]">
          {strategy.pillars.slice(0, 3).map((pillar, index) => (
            <PillarRow
              key={pillar.key}
              index={index}
              title={pillar.title}
              description={pillar.description_he}
              example={pillar.example_he}
              why={pillar.why_he}
              insight={insight(pillar.from_insight)}
              swapping={removed.includes(pillar.key) && busy.has("pillars")}
              onSwap={() => change({ pillars_removed: [...removed, pillar.key] }, ["pillars_removed"])}
            />
          ))}
        </ol>
      </Block>

      <Block half id="channels" title="איפה וכמה" busy={busy.has("channels")} why={strategy.channels[0]?.why_he} insight={insight(strategy.channels[0]?.from_insight)}>
        <ul className="space-y-1.5">
          {strategy.channels.map((channel) => (
            <li key={channel.network} className="text-sm leading-6 text-[#191b18]">
              <b>{channel.network}</b>
              <span className="text-[#5e6159]"> · {channel.role_he}</span>
              <span className="block text-xs font-bold text-[#2b2d28]">{rangeSafe(channel.cadence_he)}</span>
            </li>
          ))}
        </ul>
        <fieldset className="mt-2.5">
          <legend className="mb-1.5 text-xs font-bold text-[#191b18]">כמה פוסטים בשבוע מתאים לכם?</legend>
          <div className="flex flex-wrap gap-1.5">
            {CADENCE_OPTIONS.map((option) => (
              <Chip
                key={option.key}
                label={option.label}
                selected={inputs.cadence === option.key}
                onClick={() => {
                  if (inputs.cadence !== option.key) change({ cadence: option.key }, ["cadence"]);
                }}
                className="min-h-10 px-3"
              />
            ))}
          </div>
        </fieldset>
      </Block>

      <Block half id="offer" title="מה מבקשים מהלקוח" busy={busy.has("offer")} why={strategy.offer.why_he} insight={insight(strategy.offer.from_insight)}>
        <p className="text-sm font-bold text-[#191b18]">{strategy.offer.cta_he}</p>
        <p className="text-xs leading-5 text-[#5e6159]">{strategy.offer.mechanism_he}</p>
      </Block>

      <Block id="plan" title="התוכנית" busy={busy.has("plan")}>
        <ol className="space-y-1.5">
          {strategy.month_plan.slice(0, 4).map((week) => (
            <li key={week.week} className="flex gap-2.5 text-sm leading-6">
              <span className="w-14 shrink-0 text-xs font-black leading-6 text-[#8a8c84]">שבוע {week.week}</span>
              <span className="min-w-0 flex-1 text-[#191b18]">
                {rangeSafe(week.focus_he)}
                {week.event_he ? (
                  <span className="mr-1.5 inline-block rounded-full bg-[#fbf0dc] px-2 align-[1px] text-[11px] font-bold leading-5 text-[#7a4b12]">
                    {week.event_he}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
        {strategy.quarter.length ? (
          <div className="mt-2.5 border-t border-[#f1f0ea] pt-2">
            <p className="mb-1 text-xs font-black text-[#191b18]">החודשיים הבאים</p>
            <ul className="space-y-1">
              {strategy.quarter.slice(0, 2).map((month) => (
                <li key={month.month_label} className="flex gap-2.5 text-xs leading-5 text-[#2b2d28]">
                  <span className="w-14 shrink-0 font-bold text-[#8a8c84]">{month.month_label}</span>
                  <span className="min-w-0 flex-1">{rangeSafe(month.direction_he)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Block>

      <Block id="assumptions" title="על מה אנחנו מהמרים" busy={busy.has("assumptions")} hint="החודש בודק את זה. אם טעינו, נשנה.">
        <ul className="space-y-1">
          {strategy.assumptions.slice(0, 3).map((line) => (
            <li key={line} className="flex gap-2 text-sm leading-6 text-[#191b18]">
              <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b9b7ad]" />
              {rangeSafe(line)}
            </li>
          ))}
        </ul>
      </Block>
    </div>
  );
}

/** One block of the one-pager: a title, the content, and an optional "למה?" that opens in place. */
function Block({
  id,
  title,
  hint,
  busy,
  why,
  insight,
  lead = false,
  half = false,
  children,
}: {
  id: BlockKey;
  title: string;
  hint?: string;
  busy: boolean;
  why?: string;
  insight?: PlanInsight;
  lead?: boolean;
  /** Desktop: shares a row with its neighbour. */
  half?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const whyId = useId();
  const titleId = `strategy-${id}`;
  return (
    <section
      aria-labelledby={titleId}
      aria-busy={busy}
      className={`rounded-xl border bg-white px-3.5 py-3 ${half ? "" : "lg:col-span-2"} ${
        lead ? "border-[#191b18]/20 shadow-[0_8px_24px_-18px_rgba(25,27,24,0.5)]" : "border-[#e2e0d8]"
      }`}
    >
      {/* The dim sits on an inner box: the entrance animation owns the section's opacity. */}
      <div className={`transition-opacity duration-300 motion-reduce:transition-none ${busy ? "opacity-50" : ""}`}>
      <div className="mb-1 flex items-center gap-2">
        <h2 id={titleId} className="text-xs font-black tracking-wide text-[#6b6e65]">
          {title}
        </h2>
        {busy ? <span className={`text-[11px] font-bold text-[#5e6159] ${styles.shimmer}`}>מעדכנים…</span> : null}
        {why ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={whyId}
            aria-label={`למה? ${title}`}
            onClick={() => setOpen((v) => !v)}
            className="-my-2 mr-auto inline-flex min-h-11 cursor-pointer items-center gap-1 px-1 text-xs font-bold text-[#5e6159] underline decoration-[#c7c4b8] underline-offset-4 hover:text-[#191b18]"
          >
            למה?
            <svg viewBox="0 0 16 16" className={`h-3 w-3 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
      </div>
      {hint ? <p className="-mt-0.5 mb-1.5 text-xs text-[#6b6e65]">{hint}</p> : null}
      {children}
      {why ? (
        <div id={whyId} hidden={!open} className="mt-2 rounded-lg bg-[#f4f2ec] px-3 py-2 text-xs leading-5 text-[#2b2d28]">
          <p>{why}</p>
          {insight ? (
            <p className="mt-1 text-[#5e6159]">
              <b className="text-[#191b18]">מתוך מה שגילינו ({sourceLabel(insight.source)}): </b>
              {insight.text_he}
            </p>
          ) : null}
        </div>
      ) : null}
      </div>
    </section>
  );
}

function PillarRow({
  index,
  title,
  description,
  example,
  why,
  insight,
  swapping,
  onSwap,
}: {
  index: number;
  title: string;
  description: string;
  example: string;
  why: string;
  insight?: PlanInsight;
  swapping: boolean;
  onSwap: () => void;
}) {
  const [open, setOpen] = useState(false);
  const whyId = useId();
  return (
    <li className={`py-2 first:pt-0 last:pb-0 ${swapping ? "opacity-50" : ""}`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f1efe8] text-[11px] font-black text-[#5e6159]">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-6 text-[#191b18]">{title}</p>
          <p className="text-xs leading-5 text-[#2b2d28]">{description}</p>
          <p className="text-xs leading-5 text-[#5e6159]">למשל: {example}</p>
          <div className="-mb-2 flex gap-3">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={whyId}
              aria-label={`למה? ${title}`}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex min-h-10 cursor-pointer items-center text-xs font-bold text-[#5e6159] underline decoration-[#c7c4b8] underline-offset-4 hover:text-[#191b18]"
            >
              למה?
            </button>
            <button
              type="button"
              onClick={onSwap}
              disabled={swapping}
              aria-label={`להחליף את הנושא: ${title}`}
              className="inline-flex min-h-10 cursor-pointer items-center text-xs font-bold text-[#5e6159] underline decoration-[#c7c4b8] underline-offset-4 hover:text-[#191b18] disabled:cursor-wait"
            >
              {swapping ? "מחליפים…" : "להחליף נושא"}
            </button>
          </div>
          <div id={whyId} hidden={!open} className="mt-2 rounded-lg bg-[#f4f2ec] px-3 py-2 text-xs leading-5 text-[#2b2d28]">
            <p>{why}</p>
            {insight ? (
              <p className="mt-1 text-[#5e6159]">
                <b className="text-[#191b18]">מתוך מה שגילינו: </b>
                {insight.text_he}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

/** The owner's own target. Optional, and never prefilled by us: nothing is selected until they pick. */
function OwnerTarget({
  flow,
  value,
  confirmed,
  change,
}: {
  flow: FlowState;
  value: string;
  confirmed?: string;
  change: (patch: Partial<StrategyInputs>, keys: StrategyInputKey[], typing?: boolean) => void;
}) {
  const { phrase, steps } = targetPhrase(flow);
  const options = steps.map((n) => ({ n, text: `${n} ${phrase} בחודש` }));
  const chipHit = options.find((o) => o.text === value);
  const [free, setFree] = useState(Boolean(value && !chipHit));
  const fieldId = useId();
  return (
    <div className="mt-2.5 rounded-lg bg-[#faf9f6] px-3 py-2.5">
      <p className="text-xs font-bold text-[#191b18]">
        כמה {phrase} בחודש ירגישו לכם הצלחה? <span className="font-normal text-[#6b6e65]">(לא חובה)</span>
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((option) => (
          <Chip
            key={option.n}
            label={String(option.n)}
            selected={chipHit?.n === option.n}
            onClick={() => {
              setFree(false);
              change({ target: chipHit?.n === option.n ? "" : option.text }, ["target"]);
            }}
            className="min-h-10 min-w-12 px-3"
          />
        ))}
        <Chip
          label="מספר אחר"
          selected={free}
          onClick={() => {
            const opening = !free;
            setFree(opening);
            if (!opening && value && !chipHit) change({ target: "" }, ["target"]);
          }}
          className="min-h-10 px-3"
        />
      </div>
      {free ? (
        <div className="mt-2">
          <label htmlFor={fieldId} className="sr-only">
            היעד שלכם, במילים שלכם
          </label>
          <input
            id={fieldId}
            value={chipHit ? "" : value}
            onChange={(event) => change({ target: event.target.value }, ["target"], true)}
            onKeyDown={(event) => {
              // Enter here confirms the target; it must not submit the page.
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            maxLength={120}
            placeholder={`למשל: 8 ${phrase} בחודש`}
            className="min-h-11 w-full rounded-lg border border-[#dedcd4] bg-white px-3 text-base text-[#191b18] outline-none placeholder:text-[#a3a59c] focus:border-[#191b18] focus:ring-1 focus:ring-[#191b18]"
          />
        </div>
      ) : null}
      {confirmed ? (
        <p className="mt-1.5 text-xs text-[#2b2d28]">
          <b>היעד שלכם:</b> {confirmed}
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-[#6b6e65]">לא נמציא לכם יעד. אם יש מספר שירגיש הצלחה, נמדוד מולו.</p>
      )}
    </div>
  );
}
