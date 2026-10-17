"use client";

import type { ReactNode } from "react";
import type { RoadmapPost, StrategyPayload } from "@/lib/api";
import { useCopy } from "@/components/language/LanguageProvider";
import { briefLearning } from "./CampaignBrief";
import { weekFocus } from "./postMeta";
import { metricLabel } from "@/lib/postLifecycle";
import styles from "./campaign.module.css";

type WeekPlan = Pick<StrategyPayload, "roadmap" | "weekly_breakdown">;
const unique = (values: (string | null | undefined)[]) => [...new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))];

// תכלית: להבין את המטרה של השבוע ואת הבדיקה שתכוון את ההמשך.
// המסר מגיע מהתוכנית ומהתוצאות השמורות, בלי לייצר ממצאים חדשים בפתיחת המסך.
// אותו רכיב מופיע בקמפיין ובתצוגת המוצר באתר.
export function CampaignWeek({ week, posts, strategy, children, preview = false, home = false }: {
  week: number; posts: RoadmapPost[]; strategy: WeekPlan | null; children: ReactNode; preview?: boolean; home?: boolean;
}) {
  const t = useCopy();
  const focus = weekFocus(week, posts[0], strategy);
  const breakdown = strategy?.weekly_breakdown?.find(item => item.week === week) || strategy?.roadmap?.weekly_breakdown?.find(item => item.week === week);
  const goals = unique(posts.map(post => post.plan_link?.goal || post.goal_fit)).filter(goal => goal !== focus);
  const measures = unique(breakdown?.metrics_target?.length ? breakdown.metrics_target : posts.map(metricLabel));
  const learning = unique(posts.map(briefLearning));
  const visibleGoals = home ? [] : goals;
  const visibleMeasures = home ? measures.slice(0, 1) : measures;
  const visibleLearning = home ? learning.slice(0, 1) : learning;
  return <section className={styles.week} data-campaign-preview={preview} data-campaign-home={home} aria-label={week ? t("שבוע {arg_0}", { arg_0: week }) : t("פוסטים ללא שבוע בתוכנית")}>
    <header className={styles.weekHeading}><span className={styles.marker} aria-hidden="true" />
      <h2>{week ? t("שבוע {arg_0}", { arg_0: week }) : t("פוסטים נוספים")}</h2>
      <span className={styles.weekCount}>{posts.length === 1 ? t("פוסט אחד") : t("{arg_0} פוסטים", { arg_0: posts.length })}</span>
    </header>
    <div className={styles.weekLayout}>
      <aside className={styles.weekBrief} aria-label={t("המטרה של השבוע")}>
        {focus ? <h3 dir="auto">{focus}</h3> : null}
        <dl>
          {visibleGoals.length ? <div><dt>{t("מקדמים השבוע")}</dt><dd>{visibleGoals.map(goal => <p key={goal} dir="auto">{goal}</p>)}</dd></div> : null}
          {visibleMeasures.length ? <div><dt>{t("מה נבדוק")}</dt><dd>{visibleMeasures.map(measure => <p key={measure} dir="auto">{t(measure)}</p>)}</dd></div> : null}
          {visibleLearning.length ? <div><dt>{t("מה כבר למדנו")}</dt><dd>{visibleLearning.map(finding => <p key={finding} dir="auto">{finding}</p>)}</dd></div> : null}
        </dl>
      </aside>
      <div className={styles.cards}>{children}</div>
    </div>
  </section>;
}
