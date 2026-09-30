import type { ReactNode } from "react";
import styles from "./plan-brief.module.css";

/** The advisor's brief: a direction, its evidence and one next decision, never invented results. */
export function PlanBrief({ businessName, direction, measure, baseline, ownerAction, why, action }: {
  businessName?: string; direction: string; measure?: string; baseline?: string; ownerAction?: string; why?: string; action?: ReactNode;
}) {
  return <section className={styles.brief} aria-label="הכיוון והצעד הבא בתוכנית">
    <p className={styles.eyebrow}>{businessName ? `התוכנית של ${businessName}` : "הכיוון בתוכנית"}</p>
    <h2>{direction}</h2>
    {why && <details><summary>למה הכיוון הזה?</summary><p>{why}</p></details>}
    {(measure || baseline) && <div className={styles.measure}><p>{measure && <><strong>איך נדע: </strong>{measure}</>}</p>{baseline && <p className={styles.baseline}>{baseline}</p>}</div>}
    {ownerAction && <div className={styles.decision}><strong>הצעד שלכם השבוע</strong><p>{ownerAction}</p></div>}
    {action && <div className={styles.action}>{action}</div>}
  </section>;
}

export function HypothesisNote({ hypothesis, ifWrong, evidence }: { hypothesis: string; ifWrong: string; evidence?: string }) {
  return <div className={styles.hypothesis}><h3>{hypothesis}</h3><p><strong>אם זה לא יעבוד: </strong>{ifWrong}</p>{evidence && <p className={styles.baseline}>{evidence}</p>}</div>;
}
