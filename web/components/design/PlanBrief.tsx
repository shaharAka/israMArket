import type { ReactNode } from "react";
import styles from "./plan-brief.module.css";

/**
 * The advisor's brief: a direction, its evidence and one next decision, never invented results.
 *
 * A sheet like the landing's: a head with the business, the direction as the title, how we
 * will know as one fact row, and the owner's step in the one soft panel with its button —
 * what to do, why, then the action.
 */
export function PlanBrief({ businessName, direction, measure, baseline, ownerAction, ownerWhy, ownerMeta, why, action }: {
  businessName?: string; direction: string; measure?: string; baseline?: ReactNode; ownerAction?: ReactNode;
  /** One line under the step: why it matters. */
  ownerWhy?: ReactNode;
  /** Beside the step's label: how long it takes. */
  ownerMeta?: ReactNode;
  why?: string; action?: ReactNode;
}) {
  return <section className={styles.brief} aria-label="הכיוון והצעד הבא בתוכנית">
    <p className={styles.head}><span className={styles.mark} aria-hidden />{businessName ? `התוכנית של ${businessName}` : "הכיוון בתוכנית"}</p>
    <div className={styles.body}>
      <h2>{direction}</h2>
      {why && <details className={styles.why}><summary>למה הכיוון הזה?</summary><p>{why}</p></details>}
      {(measure || baseline) && <div className={styles.measure}>
        {measure && <p className={styles.measureLabel}>איך נדע</p>}
        <div>{measure && <p className={styles.measureValue}>{measure}</p>}{baseline && <p className={styles.baseline}>{baseline}</p>}</div>
      </div>}
      {/* The soft fill marks the ask; a step with no button here (the ask is elsewhere on the page) stays a quiet row. */}
      {ownerAction ? <div className={action ? styles.decision : styles.decisionQuiet}>
        <p className={styles.decisionLabel}>הצעד שלכם השבוע{ownerMeta ? <span> · {ownerMeta}</span> : null}</p>
        <p className={styles.decisionTitle}>{ownerAction}</p>
        {ownerWhy && <p className={styles.decisionWhy}>{ownerWhy}</p>}
        {action && <div className={styles.action}>{action}</div>}
      </div> : action && <div className={styles.action}>{action}</div>}
    </div>
  </section>;
}

/** One hypothesis of the plan. `evidence` is supplied (a status set by the monthly review), never inferred. */
export function HypothesisNote({ hypothesis, ifWrong, evidence }: { hypothesis: string; ifWrong: string; evidence?: string }) {
  return <div className={styles.hypothesis}><h3>{hypothesis}</h3><p><strong>אם היא לא תתאמת: </strong>{ifWrong}</p>{evidence && <p className={styles.evidence}>{evidence}</p>}</div>;
}
