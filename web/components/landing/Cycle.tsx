import type { CSSProperties } from "react";

/**
 * "מודדים ומעדכנים": the end of the story the page tells (research → strategy → the 3-month
 * plan → measure → adjust). Three short rows, no boxes. Each promise maps to a screen
 * that exists: /performance (measure, and "לא נמדד" when there is no number),
 * services/research.py (weekly research), /decisions and /recommendations (what to change).
 */
const ROWS = [
  {
    title: "מודדים",
    line: "בעמוד התוצאות רואים מה קרה עם מה שבחרנו למדוד. מה שעוד לא מחובר, כתוב שלא נמדד.",
  },
  {
    title: "ממשיכים לחקור",
    line: "כל שבוע בודקים מה חדש אצל המתחרים, בחיפושים בגוגל ובלוח השנה.",
  },
  {
    title: "מעדכנים",
    line: "בסוף כל חודש מציעים לכם מה לשנות בחודש הבא, לפי מה שהצליח. אתם מחליטים.",
  },
];

export function Cycle() {
  return (
    <section aria-labelledby="cycle-title" className="border-t border-[var(--rule)] bg-[var(--paper)]">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1fr_minmax(0,44rem)] lg:gap-16">
        <header data-rv className="max-w-md">
          <p className="text-sm font-bold text-[var(--primary)]">מודדים ומעדכנים</p>
          <h2 id="cycle-title" className="mt-2 text-[1.9rem] font-black leading-[1.15] tracking-tight [text-wrap:balance] sm:text-[2.6rem]">
            התוכנית זזה יחד עם העסק
          </h2>
        </header>

        <ol className="divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
          {ROWS.map((row, index) => (
            <li key={row.title} data-rv className="flex gap-4 py-5 sm:gap-5 sm:py-6" style={{ "--rv-i": index } as CSSProperties}>
              <span aria-hidden className="lp-cycle-mark relative mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--ink)] text-sm font-bold">
                {index + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-black leading-7 text-[var(--ink)] sm:text-xl">{row.title}</h3>
                <p className="mt-1 text-[15px] leading-7 text-[var(--ink-soft)] sm:text-base">{row.line}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
