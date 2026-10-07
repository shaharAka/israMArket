
import { Copy } from "@/components/language/LanguageProvider";
import type { CSSProperties } from "react";
import { EXAMPLE, GOAL, LEARNED, ROUTE } from "./content";

/**
 * The example plan, drawn as the real thing (HTML, not an illustration), in three parts:
 * what we learned → the goal → the route. What gets measured lives in the weekly screen.
 *
 * `live` lets ScenePlayer count the goal up while its step plays. The route line and the
 * months follow the nearest `--pp`.
 */

type PartProps = { live?: boolean };

function Count({ from, to, live }: { from: number; to: number; live?: boolean }) {
  const text = to.toLocaleString("he-IL");
  if (!live) return <>{text}</>;
  return (
    <span data-count-from={from} data-count-to={to}>
      {text}
    </span>
  );
}

export function PartLearned() {
  return (
    <div className="lv2-part-body">
      <p className="lv2-part-lead"><Copy text={EXAMPLE.kind} /></p>
      <dl className="lv2-facts">
        {LEARNED.map((row) => (
          <div key={row.k}>
            <dt><Copy text={row.k} /></dt>
            <dd><Copy text={row.v} /></dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function PartGoal({ live }: PartProps) {
  return (
    <div className="lv2-part-body">
      <div className="lv2-goal">
        <div>
          <span className="lv2-goal-num lv2-goal-num--from">{GOAL.today}</span>
          <span className="lv2-goal-cap"><Copy text="היום" /></span>
        </div>
        <span aria-hidden className="lv2-goal-arrow" />
        <div>
          <span className="lv2-goal-num">
            <Count from={GOAL.today} to={GOAL.target} live={live} />
          </span>
          <span className="lv2-goal-cap"><Copy text="יעד שנבדוק" /></span>
        </div>
        <p className="lv2-goal-unit"><Copy text={GOAL.unit} /></p>
      </div>
      <p className="lv2-part-note">
        <strong><Copy text="מה מזיזים:" /></strong> <Copy text={GOAL.lever} />
      </p>
      <p className="lv2-part-note lv2-part-note--soft">
        <strong><Copy text="השערה:" /></strong> <Copy text={GOAL.hypothesis} />
      </p>
    </div>
  );
}

export function PartRoute() {
  return (
    <div className="lv2-part-body lv2-part-body--route">
      <div className="lv2-route" aria-hidden>
        <span className="lv2-route-line" />
      </div>
      <ol className="lv2-months">
        {ROUTE.map((m, j) => (
          <li key={m.month} style={{ "--j": j } as CSSProperties}>
            <span className="lv2-month-dot" aria-hidden />
            <span className="lv2-month-name"><Copy text={m.month} /></span>
            <span className="lv2-month-focus"><Copy text={m.focus} /></span>
            <span className="lv2-month-detail"><Copy text={m.detail} /></span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export const PARTS = [
  { key: "learned", title: "מה למדנו", Body: PartLearned },
  { key: "goal", title: "המטרה", Body: PartGoal },
  { key: "route", title: "מה עושים בהמשך", Body: PartRoute },
] as const;

export function SheetHeader() {
  return (
    <div className="lv2-sheet-head">
      <span className="lv2-sheet-mark" aria-hidden />
      <p>
        <strong>{EXAMPLE.name}</strong>
        <span><Copy text="התוכנית" />{" · "}<Copy text={EXAMPLE.period} /></span>
      </p>
      <span className="lv2-sheet-tag"><Copy text="דוגמה" /></span>
    </div>
  );
}
