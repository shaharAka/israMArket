"use client";

import { useId, useState } from "react";
import { Storefront } from "@/components/brand/Storefront";
import type { LandingPlan } from "./plans";

/** A local presentation of the existing fictional plan. No simulated results or account state. */
export function CycleWalkthrough({ rows, example }: {
  rows: { title: string; line: string }[];
  example: { name: string; insight: string; measure: LandingPlan["kpi"]; months: LandingPlan["months"]; bet: LandingPlan["bet"] };
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
        {step === 0 && <div key="measure" className="lp-cycle-content">
          <p className="lp-cycle-label">המדד שבחרנו</p>
          <h4>{example.measure.name}</h4>
          <div className="lp-cycle-no-data"><span aria-hidden>—</span><p>עוד לא נמדד</p></div>
          <p className="lp-cycle-context">{example.measure.how}</p>
        </div>}
        {step === 1 && <div key="research" className="lp-cycle-content">
          <p className="lp-cycle-label">מה גילינו</p>
          <h4>{example.insight}</h4>
          <div className="lp-cycle-calendar">
            <div><span>לוח השנה</span><strong>{example.months[1].date}</strong></div>
            <p><span>חודש 2 בתוכנית</span>{example.months[1].focus}</p>
          </div>
        </div>}
        {step === 2 && <div key="adjust" className="lp-cycle-content">
          <p className="lp-cycle-label">ההשערה שנבדוק</p>
          <h4>{example.bet.bet}</h4>
          <div className="lp-cycle-decision"><p>אם היא לא תתאמת</p><strong>{example.bet.ifWrong}</strong></div>
        </div>}
      </div>
      <footer>עסק לדוגמה · תכנון והמחשה, ללא נתוני תוצאות</footer>
    </section>
  </div>;
}
