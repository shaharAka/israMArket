import { LANDING_EXAMPLES } from "./examples";
import { LANDING_PLANS } from "./plans";
import { CycleWalkthrough } from "./CycleWalkthrough";

/**
 * "מודדים ומעדכנים": the end of the story the page tells (research → strategy → the 3-month
 * plan → measure → adjust). Each promise maps to a screen
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
    <section id="cycle" aria-labelledby="cycle-title" className="border-t border-[var(--rule)] bg-[var(--paper)]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-8 sm:py-20">
        <header data-rv className="max-w-2xl">
          <p className="text-sm font-bold text-[var(--primary)]">מודדים ומעדכנים</p>
          <h2 id="cycle-title" className="mt-2 text-[1.9rem] font-black leading-[1.15] tracking-tight [text-wrap:balance] sm:text-[2.6rem]">
            התוכנית זזה יחד עם העסק
          </h2>
        </header>

        <CycleWalkthrough rows={ROWS} example={{
          name: LANDING_EXAMPLES[0].businessName,
          insight: LANDING_EXAMPLES[0].insight,
          measure: LANDING_PLANS.bakery.kpi,
          months: LANDING_PLANS.bakery.months,
          bet: LANDING_PLANS.bakery.bet,
        }} />
      </div>
    </section>
  );
}
