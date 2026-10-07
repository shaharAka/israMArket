"use client";

import type { ReactNode } from "react";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { IconChevron } from "@/lib/icons";
import styles from "./plan-brief.module.css";

/**
 * The advisor's brief: a direction, its evidence and one next decision, never invented results.
 *
 * A sheet like the landing's: a head with the business, the direction as the title, how we
 * will know as one fact row, and the owner's step in the one soft panel with its button —
 * what to do, why, then the action.
 */
export function PlanBrief({ businessName, direction, measure, baseline, ownerAction, ownerWhy, ownerMeta, why, action, context, compact = false }: {
  businessName?: string; direction: string; measure?: string; baseline?: ReactNode; ownerAction?: ReactNode;
  /** One line under the step: why it matters. */
  ownerWhy?: ReactNode;
  /** Beside the step's label: how long it takes. */
  ownerMeta?: ReactNode;
  why?: string; action?: ReactNode;
  /** Supplied research/source context, never inferred or translated as customer data. */
  context?: ReactNode; compact?: boolean;
}) {
  const t = useCopy();
  return <section className={styles.brief} data-compact={compact} aria-label={t("הכיוון והצעד הבא בתוכנית")}>
    <p className={styles.head}><span className={styles.mark} aria-hidden />{businessName ? t("התוכנית של {arg_0}", { arg_0: businessName }) : t("הכיוון בתוכנית")}</p>
    <div className={styles.body}>
      <h2>{direction}</h2>
      {context && <div className={styles.context}>{context}</div>}
      {why && <details className={styles.why}><summary><Copy text="למה הכיוון הזה?" /><IconChevron className="h-4 w-4" /></summary><p>{why}</p></details>}
      {(measure || baseline) && <div className={styles.measure}>
        {measure && <p className={styles.measureLabel}><Copy text="איך נדע" /></p>}
        <div>{measure && <p className={styles.measureValue}>{measure}</p>}{baseline && <p className={styles.baseline}>{baseline}</p>}</div>
      </div>}
      {/* The soft fill marks the ask; a step with no button here (the ask is elsewhere on the page) stays a quiet row. */}
      {ownerAction ? <div className={action ? styles.decision : styles.decisionQuiet}>
        <p className={styles.decisionLabel}><Copy text="הצעד שלכם השבוע" />{ownerMeta ? <span> · {ownerMeta}</span> : null}</p>
        <p className={styles.decisionTitle}>{ownerAction}</p>
        {ownerWhy && <p className={styles.decisionWhy}>{ownerWhy}</p>}
        {action && <div className={styles.action}>{action}</div>}
      </div> : action && <div className={styles.action}>{action}</div>}
    </div>
  </section>;
}

/** One hypothesis of the plan. `evidence` and `status` are supplied (the server's review,
 *  docs/posts-v2.md Phase C), never inferred: `status` is the word + dot + evidence line,
 *  right under the hypothesis. A hypothesis with no "if wrong" (the month's) skips that line. */
export function HypothesisNote({ hypothesis, ifWrong, evidence, status }: { hypothesis: string; ifWrong?: string; evidence?: string; status?: ReactNode }) {
  return <div className={styles.hypothesis}><h3>{hypothesis}</h3>{status && <div className={styles.status}>{status}</div>}{ifWrong && <p><strong>אם היא לא תתאמת: </strong>{ifWrong}</p>}{evidence && <p className={styles.evidence}>{evidence}</p>}</div>;
}
