"use client";

import { useId, useState, type CSSProperties } from "react";
import { Storefront } from "@/components/brand/Storefront";
import { MetricComparison } from "@/components/design/MetricComparison";
import type { LandingExample } from "./examples";
import type { LandingPlan } from "./plans";

/** Explicitly invented readings for the fictional bakery; never used as account data. */
const DEMO_CLICKS = [
  { key: "parents", label: "הזמנה מראש לגנים", value: 42 },
  { key: "morning", label: "מהטיגון של הבוקר", value: 29 },
  { key: "pickup", label: "שעות האיסוף לחנוכה", value: 17 },
];
const DEMO_TOTAL = DEMO_CLICKS.reduce((sum, post) => sum + post.value, 0);
const DEMO_ORDERS = 20;

/** Local demonstration only: draft → labelled example readings → research → suggestion. */
export function CycleWalkthrough({ rows, example }: {
  rows: { title: string; line: string }[];
  example: { name: string; insight: string; measure: LandingPlan["kpi"]; months: LandingPlan["months"]; bet: LandingPlan["bet"]; post: LandingExample["post"]; why: LandingExample["why"]; palette: LandingExample["palette"] };
}) {
  const [step, setStep] = useState(0);
  const id = useId();
  return <div className="lp-cycle-workbench mt-8 sm:mt-10">
    <ol className="lp-cycle-steps">
      {rows.map((row, index) => <li key={row.title}>
        <button id={`${id}-step-${index}`} type="button" aria-pressed={step === index}
          aria-controls={`${id}-example`} onClick={() => setStep(index)}>
          <span className="lp-cycle-number" aria-hidden>{String(index + 1).padStart(2, "0")}</span>
          <span><span className="lp-cycle-step-title">{row.title}</span><span className="lp-cycle-step-line">{row.line}</span></span>
          <span className="lp-cycle-arrow" aria-hidden>←</span>
        </button>
      </li>)}
    </ol>

    <section id={`${id}-example`} aria-labelledby={`${id}-step-${step}`} className="lp-cycle-example">
      <header className="lp-cycle-example-head">
        <div><p>דוגמה מתוך התוכנית של</p><h3>{example.name}</h3></div>
        <Storefront phase={.5} className="lp-cycle-store" />
      </header>
      <div className="lp-cycle-example-body" aria-live="polite" aria-atomic="true">
        {step === 0 && <div key="draft" className="lp-cycle-content">
          <p className="lp-cycle-label">פוסט מתוך התוכנית · {example.why.timing}</p>
          <div className="lp-cycle-post" style={{
            "--cycle-brand": example.palette.find(color => color.role === "primary")?.hex,
            "--cycle-post-paper": example.palette.find(color => color.role === "background")?.hex,
          } as CSSProperties}>
            <header><span>אינסטגרם</span><span>מחכה לאישור</span></header>
            <h4>{example.post.overlayHeadline}</h4>
            <p>{example.post.hook}</p>
            <p>{example.post.caption}</p>
            <strong>{example.post.cta} ←</strong>
          </div>
          <p className="lp-cycle-context"><b>למה הפוסט הזה?</b> {example.why.reason}</p>
          <p className="lp-cycle-owner-note">לפני הפרסום אפשר לערוך את הטקסט ולבחור תמונה מהעסק.</p>
        </div>}
        {step === 1 && <div key="measure" className="lp-cycle-content lp-cycle-results">
          <p className="lp-cycle-label">נתוני דוגמה להמחשה בלבד</p>
          <h4>מאילו פוסטים הגיעו הלחיצות?</h4>
          <dl className="lp-cycle-totals"><div><dt>לחיצות על הקישור</dt><dd>{DEMO_TOTAL}</dd></div><div><dt>הזמנות מראש לגנים</dt><dd>{DEMO_ORDERS}</dd><small>דיווח העסק · דוגמה</small></div></dl>
          <MetricComparison title="לחיצות לפי פוסט" unit="לחיצות על וואטסאפ" points={DEMO_CLICKS}
            source="תרחיש מומצא · לחיצות, לא הודעות או מכירות" period="שבועיים לפני חנוכה" />
          <p className="lp-cycle-context">הפוסט לגנים הביא הכי הרבה לחיצות בדוגמה. את ההזמנות העסק סופר בנפרד.</p>
        </div>}
        {step === 2 && <div key="research" className="lp-cycle-content">
          <p className="lp-cycle-label">מה גילינו</p>
          <h4>{example.insight}</h4>
          <div className="lp-cycle-calendar">
            <div><span>לוח השנה</span><strong>{example.months[1].date}</strong></div>
            <p><span>חודש 2 בתוכנית</span>{example.months[1].focus}</p>
          </div>
        </div>}
        {step === 3 && <div key="adjust" className="lp-cycle-content">
          <p className="lp-cycle-label">ההשערה בתוכנית</p>
          <h4>{example.bet.bet}</h4>
          <div className="lp-cycle-decision"><p>ההצעה לחודש הבא · לפי תרחיש הדוגמה</p><strong>מקדימים את הפוסט לגנים וממשיכים לספור הזמנות מראש.</strong></div>
          <p className="lp-cycle-context">בדוגמה הגיעו 42 מתוך {DEMO_TOTAL} לחיצות מהפוסט לגנים, והעסק דיווח על {DEMO_ORDERS} הזמנות מראש. בודקים אם הכיוון ממשיך להביא הזמנות.</p>
          <p className="lp-cycle-context"><b>אם ההשערה לא תתאמת:</b> {example.bet.ifWrong}</p>
          <p className="lp-cycle-owner-note">אתם מחליטים אם להכניס את ההצעה לתוכנית.</p>
        </div>}
      </div>
      <footer>עסק ופוסטים לדוגמה · המספרים להמחשה בלבד.</footer>
    </section>
  </div>;
}
