"use client";

import Link from "next/link";
import type { StrategyPayload } from "@/lib/api";
import { Copy } from "@/components/language/LanguageProvider";
import styles from "./campaign.module.css";

/** The same stored goals that lead the plan also explain the materials here. No new analysis on read. */
export function CampaignPurpose({ strategy }: { strategy: StrategyPayload | null }) {
  if (!strategy || strategy.post_workspace_only) return null;
  const month = strategy.monthly_horizon_plan || strategy.roadmap?.monthly_horizon_plan;
  const targets = month?.targets?.filter(Boolean).slice(0, 3) || [];
  const measure = strategy.quarter_plan?.kpi.name_he;
  if (!targets.length && !measure) return null;
  return <section className={styles.purpose}>
    <h2><Copy text="מה רוצים להשיג בקמפיין" /></h2>
    <ul>{(targets.length ? targets : [measure!]).map(target => <li key={target} dir="auto">{target}</li>)}</ul>
    <Link href="/strategy"><Copy text="לתוכנית שמאחורי הקמפיין" /></Link>
  </section>;
}

export function PlannedCampaign({ strategy }: { strategy: StrategyPayload | null }) {
  const weeks = strategy?.post_workspace_only ? [] : (strategy?.weekly_breakdown?.length ? strategy.weekly_breakdown : strategy?.roadmap?.weekly_breakdown || []).filter(week => week.focus);
  return <section className={styles.preparation}>
    <h2><Copy text={weeks.length ? "התוכנית מוכנה. מכינים את חומרי הקמפיין." : "הקמפיין מתחיל בתוכנית שמתאימה לעסק שלך."} /></h2>
    {weeks.length ? <ol>{weeks.map(week => <li key={week.week}>
      <span><Copy text="שבוע {arg_0}" args={{ arg_0: week.week }} /></span>
      <div><strong dir="auto">{week.focus}</strong>{week.what_we_do?.length ? <p dir="auto">{week.what_we_do.slice(0, 2).join(" · ")}</p> : null}</div>
    </li>)}</ol> : null}
    <Link href={weeks.length ? "/prepare" : "/start?phase=after"} className={styles.primary}><Copy text={weeks.length ? "להכין את חומרי הקמפיין" : "לבנות תוכנית לעסק שלי"} /></Link>
    <Link href="/posts?create=1" className={styles.textAction}><Copy text="או ליצור פוסט משלכם" /></Link>
  </section>;
}
