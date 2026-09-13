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
}: {
  horizon?: MonthHorizon;
  onReady: (strategy: StrategyPayload) => void;
  /**
   * "quiet" renders the build button as an outline. Both pages that mount this already
   * have their own primary action — checking the pending post — and building next month
   * is not what the owner should do while this month is unapproved. Declared here rather
   * than overridden from outside with a descendant selector, which would quietly restyle
   * any button added to this component later.
   */
  tone?: "primary" | "quiet";
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
        <button
          type="button"
          onClick={() => void buildNext()}
          className={`mt-3 inline-flex min-h-11 items-center rounded-md px-4 text-sm font-bold ${
            tone === "quiet"
              ? "border border-[#c7c4b8] bg-transparent text-[#20211f] hover:bg-[#f4f3ee]"
              : "bg-[#20211f] text-white hover:bg-[#343632]"
          }`}
        >
          {next.next_in_progress ? "להמשיך את הבנייה" : `לבנות את ${next.next_month_name_he}`}
        </button>
      )}
    </section>
  );
}
