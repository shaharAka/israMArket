"use client";

import Link from "next/link";
import type { StrategyPayload } from "@/lib/api";
import { useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { metricLabel, lifecycleOf } from "@/lib/postLifecycle";
import { reviewByKey, reviewFor } from "@/components/plan/HypothesisStatusLine";
import styles from "./campaign.module.css";

const unique = (items: (string | undefined | null)[]) => [...new Set(items.map(item=>item?.trim()).filter((item):item is string=>Boolean(item)))];

// תכלית: להבין מה מקדמים, מה מתוכנן ומה נבדוק. תקציב מתוכנן אינו הוצאה בפועל.
// כל השדות מגיעים מאותו עסק וחודש; פתיחת המסך אינה מפעילה יצירה או ניתוח.
export function CampaignOverview({ strategy }: { strategy: StrategyPayload }) {
  const t=useCopy();
  const {locale}=useLanguage();
  if(strategy.post_workspace_only)return null;
  const posts=strategy.roadmap.posts;
  const monthly=strategy.monthly_horizon_plan ?? strategy.roadmap.monthly_horizon_plan;
  const goals=unique(monthly?.targets?.length ? monthly.targets : posts.map(post=>post.plan_link?.goal || post.goal_fit));
  const audiences=unique(posts.map(post=>post.audience_name));
  const measures=unique(posts.map(post=>t(metricLabel(post))));
  const hypothesis=monthly?.hypothesis || strategy.usp.growth_hypothesis;
  const assessment=hypothesis ? reviewFor(reviewByKey(strategy.hypothesis_review),"month",hypothesis) : null;
  const brief=strategy.campaign_brief;
  const budget=brief?.budget?.monthly_budget_ils;
  const published=posts.filter(post=>["published","measured"].includes(lifecycleOf(post))).length;
  const format=new Intl.DateTimeFormat(locale,{day:"numeric",month:"short"});
  const period=`${format.format(new Date(strategy.year,strategy.month-1,1))} – ${format.format(new Date(strategy.year,strategy.month,0))}`;
  return <section className={styles.overview} aria-label={t("הקמפיין כחלק מהתוכנית")}>
    <header><span>{new Intl.DateTimeFormat(locale,{month:"long",year:"numeric"}).format(new Date(strategy.year,strategy.month-1,1))}<span className={styles.period}>{period}</span></span><Link href="/strategy">{t("לתוכנית המלאה")}</Link></header>
    <dl>
      {goals.length ? <div><dt>{t("המטרות של החודש")}</dt><dd>{goals.slice(0,2).map(value=><p dir="auto" key={value}>{value}</p>)}</dd></div> : null}
      <div><dt>{t("תקציב שיווק מתוכנן")}</dt><dd>{budget ? new Intl.NumberFormat(locale,{style:"currency",currency:"ILS",maximumFractionDigits:0}).format(budget) : t(brief ? "לא הוגדר תקציב" : "התקציב מופיע בתוכנית המלאה")}</dd><Link href="/decisions">{t("לעריכת התקציב")}</Link></div>
      {audiences.length ? <div><dt>{t("למי פונים")}</dt><dd>{audiences.slice(0,3).map(value=><p dir="auto" key={value}>{value}</p>)}</dd></div> : null}
    </dl>
    {hypothesis || measures.length ? <div className={styles.monthTest}>
      {hypothesis ? <div><h2>{t("מה נבדוק החודש")}</h2><p dir="auto">{hypothesis}</p>{assessment?.evidence_he ? <p className={styles.assessment} dir="auto">{assessment.evidence_he}</p> : null}</div> : null}
      {measures.length ? <div><h2>{t("המדדים של הפוסטים")}</h2><p>{measures.slice(0,3).join(" · ")}</p></div> : null}
    </div> : null}
    <footer><span>{t("{arg_0} מתוך {arg_1} פוסטים פורסמו",{arg_0:published,arg_1:posts.length})}</span><Link href="/performance">{t("לתוצאות ולהוצאה בפועל")}</Link></footer>
  </section>;
}
