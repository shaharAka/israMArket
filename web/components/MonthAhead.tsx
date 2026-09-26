"use client";

import { useState } from "react";
import { endpoints, generateUntilDone, isDemo, type MonthHorizon, type StrategyPayload } from "@/lib/api";
import { IconCalendar, IconRoute } from "@/lib/icons";
import { toast } from "@/lib/ui";

const STAGE_LABELS: Record<string, string> = {
  usp: "מחדדים את הכיוון מהחודש שעבר…",
  plan: "בונים את החודש הבא…",
  posts: "כותבים את הפוסטים לשבועות 1–2…",
  posts_late: "כותבים את הפוסטים לשבועות 3–4…",
};

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
   */
  variant?: "card" | "row";
}) {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");

  if (!horizon) return null;
  const next = horizon;

  async function buildNext() {
    setError("");
    setBusy(true);
    setStage(next.next_stage || "usp");
    try {
      await generateUntilDone(endpoints.generateNextMonth, setStage);
      toast(`התוכנית ל${next.next_month_name_he} מוכנה`);
      onReady(await endpoints.strategy());
    } catch (err) {
      setError(err instanceof Error ? err.message : "בניית החודש הבא נכשלה");
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  const buttonClass = `inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-bold ${
    tone === "quiet"
      ? "border border-[#c7c4b8] bg-transparent text-[#20211f] hover:bg-[#f4f3ee]"
      : "bg-[#20211f] text-white hover:bg-[#343632]"
  }`;
  const buttonLabel = next.next_in_progress ? "להמשיך את הבנייה" : `לבנות את ${next.next_month_name_he}`;

  if (variant === "row") {
    if (next.next_exists) {
      return (
        <div className="flex items-center gap-3 py-3">
          <IconCalendar className="h-4 w-4 shrink-0 text-[#374b3d]" />
          <p className="text-sm font-bold text-[#20211f]">
            {next.next_month_name_he} כבר בנוי, ויתחיל ב־1 לחודש.
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#20211f]">
            החודש הבא: {next.next_month_name_he}
            {next.next_in_progress ? " — הבנייה נעצרה באמצע" : ""}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-[#747570]">
            {isDemo() ? "בדמו עובדים על חודש אחד." : "נבנה ממה שאושר, בלי להמציא מספרים."}
          </p>
          {error ? <p className="mt-1 text-sm text-[#9f4330]">{error}</p> : null}
        </div>
        {busy ? (
          <p className="text-sm text-[#685f47]">{STAGE_LABELS[stage] || "בונים את החודש הבא…"}</p>
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
      <section className="rounded-lg border border-[#c7d6c2] bg-[#f3f7f1] px-5 py-4">
        <p className="flex items-center gap-2 text-xs font-bold text-[#374b3d]">
          <IconCalendar className="h-4 w-4" />
          החודש הבא מוכן
        </p>
        <p className="mt-1 text-sm font-bold text-[#20211f]">
          תוכנית {next.next_month_name_he} כבר בנויה. היא תיכנס ב־1 לחודש.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[#e2d7c3] bg-[#fcf9f2] px-5 py-4">
      <p className="flex items-center gap-2 text-xs font-bold text-[#685f47]">
        <IconRoute className="h-4 w-4" />
        החודש הבא
      </p>
      <p className="mt-1 text-sm font-bold text-[#20211f]">
        לבנות את {next.next_month_name_he} ממה שאושר החודש
        {next.next_in_progress ? " — ממשיכים מהשלב שנשמר" : ""}
      </p>
      <p className="mt-1 text-sm leading-6 text-[#5e6159]">
        {isDemo()
          ? "בדמו עובדים על חודש אחד. בחשבון אמיתי זה נבנה מהפוסטים שאושרו ומנתוני הביצוע אם יש."
          : "בלי להמציא מדדים. אם אין חיבור לגוגל או מטא — נמשיך מהאופק וממה שאושר."}
      </p>
      {error ? <p className="mt-2 text-sm text-[#9f4330]">{error}</p> : null}
      {busy ? (
        <p className="mt-3 text-sm text-[#685f47]">{STAGE_LABELS[stage] || "בונים את החודש הבא…"}</p>
      ) : (
        <button type="button" onClick={() => void buildNext()} className={`mt-3 ${buttonClass}`}>
          {buttonLabel}
        </button>
      )}
    </section>
  );
}
