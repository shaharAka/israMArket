"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import { endpoints, isDemo, type MonthHorizon, type StrategyPayload } from "@/lib/api";
import { IconCalendar, IconRoute } from "@/lib/icons";
import { SECTIONS } from "@/lib/sections";
import { toast } from "@/lib/ui";
import { useMonthBuild } from "@/lib/useMonthBuild";

/** The card variant's colours come from the one section system, not its own hexes. */
const TONE = SECTIONS.strategy;


export function MonthAhead({
  horizon,
  onReady,
  tone = "primary",
  variant = "card",
}: {
  horizon?: MonthHorizon;
  onReady: (strategy: StrategyPayload) => void;
  /**
   * "quiet" renders the build button as an outline. A page that already has its own
   * primary action — checking the pending post — must not get a second dark button for
   * building next month while this month is unapproved. Declared here rather than
   * overridden from outside with a descendant selector, which would quietly restyle any
   * button added to this component later.
   */
  tone?: "primary" | "quiet";
  /**
   * "card" is the standalone tinted block. "row" draws no box of its own: one line and a
   * button, for a place that already provides the container — a row in Today's list, or
   * the body of Today's top card once the month is approved. The honesty note stays in
   * both; the row only says it shorter.
   *
   * "line" is the row with the button kept beside the text on a phone as well — for the
   * last row of a compact list (the weeks on התוכנית), where a full-width button would be
   * the tallest thing in the list.
   */
  variant?: "card" | "row" | "line";
}) {
  const t = useCopy();
  // The next month is built on the server in the background (lib/useMonthBuild.ts): the
  // button starts it, and the progress survives leaving the page and coming back.
  const build = useMonthBuild({
    kind: "next_month",
    startCall: endpoints.generateNextMonth,
    onDone: () => {
      if (horizon) toast(t("התוכנית ל{arg_0} מוכנה", { arg_0: horizon.next_month_name_he }));
      endpoints.strategy().then(onReady).catch(() => {});
    },
  });
  const busy = build.running || build.starting;
  const error = build.error;
  const stageLabel = build.status?.running ? `${build.status.stage_label_he}…` : t("בונים את החודש הבא…");

  if (!horizon) return null;
  const next = horizon;

  function buildNext() {
    void build.start();
  }

  // The primary tone is the page's one filled button, so it wears the product's (depth,
  // 12px radius); the quiet one is the secondary outline (DESIGN-STANDARD §4).
  const buttonClass = `inline-flex items-center justify-center text-sm font-semibold ${
    tone === "quiet"
      ? "min-h-11 rounded-md border border-[var(--rule-dark)] bg-[var(--paper)] px-4 text-[var(--ink)] transition-colors hover:border-[var(--ink-faint)]"
      : "drawn-button min-h-12 bg-[var(--primary)] px-5 text-white hover:bg-[var(--primary-dark)]"
  }`;
  const buttonLabel = error ? t("לנסות שוב") : next.next_in_progress ? t("להמשיך לבנות") : t("לבנות את {arg_0}", { arg_0: next.next_month_name_he });

  if (variant === "line") {
    if (next.next_exists) {
      return (
        <p className="flex min-h-12 items-center gap-3 text-sm font-semibold text-[var(--ink)]">
          <span className="shrink-0" style={{ color: TONE.accent }}>
            <IconCalendar className="h-4 w-4" />
          </span>
          {next.next_month_name_he} <Copy text="כבר מוכן, ויתחיל ב־1 לחודש." /></p>
      );
    }
    return (
      <div className="flex items-center justify-between gap-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--ink)]">
            <Copy text="החודש הבא:" />{next.next_month_name_he}
            {next.next_in_progress && !busy ? t(" · נעצר באמצע") : ""}
          </p>
          <p className="text-xs leading-5 text-[var(--ink-muted)]">
            {isDemo() ? t("בדמו עובדים על חודש אחד.") : t("נבנה ממה שאישרתם, בלי להמציא מספרים.")}
          </p>
          {error ? <p className="mt-1 text-sm text-[var(--danger)]">{error}</p> : null}
        </div>
        {busy ? (
          <p className="max-w-[45%] text-xs leading-5" style={{ color: TONE.accent }}>
            {stageLabel}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => void buildNext()}
            className={`${buttonClass} shrink-0`}
          >
            {buttonLabel}
          </button>
        )}
      </div>
    );
  }

  if (variant === "row") {
    if (next.next_exists) {
      return (
        <div className="flex items-center gap-3 py-3">
          <IconCalendar className="h-4 w-4 shrink-0 text-[var(--primary)]" />
          <p className="text-sm font-semibold text-[var(--ink)]">
            {next.next_month_name_he} <Copy text="כבר מוכן, ויתחיל ב־1 לחודש." /></p>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--ink)]">
            <Copy text="החודש הבא:" />{next.next_month_name_he}
            {next.next_in_progress && !busy ? t(" · נעצר באמצע") : ""}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-[var(--ink-muted)]">
            {isDemo() ? t("בדמו עובדים על חודש אחד.") : t("נבנה ממה שאישרתם, בלי להמציא מספרים.")}
          </p>
          {error ? <p className="mt-1 text-sm text-[var(--danger)]">{error}</p> : null}
        </div>
        {busy ? (
          <p className="text-sm text-[var(--sand-dark)]">{stageLabel}</p>
        ) : (
          <button type="button" onClick={() => void buildNext()} className={`${buttonClass} w-full sm:w-auto`}>
            {buttonLabel}
          </button>
        )}
      </div>
    );
  }

  if (next.next_exists) {
    return (
      <section
        className="rounded-lg border px-5 py-4"
        style={{ background: TONE.surface, borderColor: TONE.border }}
      >
        <p className="flex items-center gap-2 text-xs font-bold" style={{ color: TONE.accent }}>
          <IconCalendar className="h-4 w-4" />
          <Copy text="החודש הבא מוכן" /></p>
        <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
          <Copy text="התוכנית ל" />{next.next_month_name_he} <Copy text="כבר מוכנה, ותתחיל ב־1 לחודש." /></p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[var(--rule)] bg-white px-5 py-4">
      <p className="flex items-center gap-2 text-xs font-bold" style={{ color: TONE.accent }}>
        <IconRoute className="h-4 w-4" />
        <Copy text="החודש הבא" /></p>
      <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
        <Copy text="לבנות את" />{next.next_month_name_he} <Copy text="לפי מה שאישרתם החודש" />{next.next_in_progress ? t(". נמשיך מאיפה שעצרנו") : ""}
      </p>
      <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
        {isDemo()
          ? t("בדמו עובדים על חודש אחד. בחשבון אמיתי נבנה אותו מהפוסטים שאישרתם, ומהתוצאות אם יש.")
          : t("בלי להמציא מספרים. אם גוגל או אינסטגרם לא מחוברים, נבנה לפי התוכנית ומה שאישרתם.")}
      </p>
      {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      {busy ? (
        <p className="mt-3 text-sm" style={{ color: TONE.accent }}>{stageLabel}</p>
      ) : (
        <button type="button" onClick={() => void buildNext()} className={`mt-3 ${buttonClass}`}>
          {buttonLabel}
        </button>
      )}
    </section>
  );
}
