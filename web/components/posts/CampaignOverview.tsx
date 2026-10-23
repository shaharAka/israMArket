"use client";

import Link from "next/link";
import type { StrategyPayload } from "@/lib/api";
import { useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { metricLabel } from "@/lib/postLifecycle";
import styles from "./campaign.module.css";

const unique = (items: (string | undefined | null)[]) => [...new Set(items.map(item=>item?.trim()).filter((item):item is string=>Boolean(item)))];

// תכלית: להבין מה הקמפיין מקדם ואיך נבדוק אותו, לפני שבוחרים פוסט.
// מציגים רק מטרות, קהלים ומדדים שנשמרו בתוכנית; אין יצירה או ניתוח בפתיחת המסך.
export function CampaignOverview({ strategy }: { strategy: StrategyPayload }) {
  const t=useCopy();
  const {locale}=useLanguage();
  if(strategy.post_workspace_only)return null;
  const posts=strategy.roadmap.posts;
  const monthly=strategy.monthly_horizon_plan ?? strategy.roadmap.monthly_horizon_plan;
  const goals=unique(monthly?.targets?.length ? monthly.targets : posts.map(post=>post.plan_link?.goal || post.goal_fit));
  const audiences=unique(posts.map(post=>post.audience_name));
  const measures=unique(posts.map(post=>t(metricLabel(post))));
  const rows=[{label:t("המטרה של החודש"),values:goals.slice(0,2)},{label:t("למי פונים"),values:audiences.slice(0,3)},{label:t("איך נבדוק התקדמות"),values:measures.slice(0,3)}].filter(row=>row.values.length);
  if(!rows.length)return null;
  return <section className={styles.overview} aria-label={t("הקמפיין כחלק מהתוכנית")}>
    <header><span>{new Intl.DateTimeFormat(locale,{month:"long",year:"numeric"}).format(new Date(strategy.year,strategy.month-1,1))}</span><Link href="/strategy">{t("לתוכנית המלאה")}</Link></header>
    <dl>{rows.map(row=><div key={row.label}><dt>{row.label}</dt><dd>{row.values.map(value=><p dir="auto" key={value}>{value}</p>)}</dd></div>)}</dl>
    <footer><span>{t("{arg_0} פוסטים בתוכנית",{arg_0:posts.length})}</span><Link href="/performance">{t("לתוצאות הקמפיין")}</Link></footer>
  </section>;
}
