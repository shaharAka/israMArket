"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { AppShell } from "@/components/AppShell";
import { BillingReminder } from "@/components/billing/BillingReminder";
import { LoadingMark } from "@/components/Doodles";
import { MonthBuildProgress } from "@/components/MonthBuildProgress";
import { CampaignWeek } from "@/components/posts/CampaignWeek";
import { CampaignPostCard } from "@/components/posts/CampaignPostCard";
import { PlannedCampaign } from "@/components/posts/CampaignPurpose";
import { postHref } from "@/components/today/posts";
import { NextStepAction, TrialDay, TrialGuide } from "@/components/trial/TrialGuide";
import { ApiError, endpoints, type Business, type StrategyPayload } from "@/lib/api";
import { dashboardCampaign, readDashboardSource } from "@/lib/dashboardCampaign";
import { loadTrial, nextStep, useTrial } from "@/lib/trial";
import styles from "./dashboard.module.css";

type MonthState = "loading" | "ready" | "none" | "error";

// תכלית: לראות מה מקדמים השבוע, לפתוח את החומרים ולעשות את הצעד הבא.
// המטרות, התוכן וההנחיות מגיעים מהמידע השמור. פתיחת המסך אינה יוצרת תוכן או משנה אישור.
export default function DashboardPage() {
  const t = useCopy();
  const [business, setBusiness] = useState<Business | null>(null);
  const [strategy, setStrategy] = useState<StrategyPayload | null>(null);
  const [month, setMonth] = useState<MonthState>("loading");
  const [setupView, setSetupView] = useState(false);
  const { payload: trial, failed: trialFailed } = useTrial();
  const readStrategy = () => readDashboardSource(endpoints.strategy, endpoints.postsWorkspace);
  async function reload(showLoading = true) {
    if (showLoading) setMonth("loading");
    try { setStrategy(await readStrategy()); setMonth("ready"); }
    catch (error) { if (error instanceof ApiError && error.status === 401) return; setMonth(error instanceof ApiError && error.status === 404 ? "none" : "error"); }
  }
  useEffect(() => {
    let live = true;
    void loadTrial(true);
    endpoints.business().then(value => { if (live) setBusiness(value.business); }).catch(() => {});
    readStrategy().then(value => { if (live) { setStrategy(value); setMonth("ready"); } })
      .catch(error => { if (!live || error instanceof ApiError && error.status === 401) return; setMonth(error instanceof ApiError && error.status === 404 ? "none" : "error"); });
    // Existing #step-* links retain their destination and open the setup map directly.
    const readView = () => setSetupView(new URLSearchParams(location.search).get("setup") === "1" || location.hash.startsWith("#step-"));
    readView(); window.addEventListener("hashchange", readView); window.addEventListener("popstate", readView);
    return () => { live = false; window.removeEventListener("hashchange", readView); window.removeEventListener("popstate", readView); };
  }, []);

  const guided = Boolean(trial && !trial.ended);
  const loading = month === "loading" || !trial && !trialFailed;
  const work = strategy ? dashboardCampaign(strategy) : null;
  const posts = strategy?.roadmap?.posts || [];
  const step = guided && trial ? nextStep(trial) : null;
  const horizon = strategy?.monthly_horizon_plan || strategy?.roadmap?.monthly_horizon_plan;
  const goal = strategy?.post_workspace_only ? null : horizon?.targets?.[0] || strategy?.quarter_plan?.kpi.name_he || business?.quarter_plan?.kpi.name_he;
  const nextPost = work && work.nextIndex >= 0 ? posts[work.nextIndex] : null;

  return <AppShell><div className={styles.home}>
    <header className={styles.heading}><h1><Copy text={setupView && trial ? "ההתקדמות בתוכנית" : "הקמפיין השבוע"} /></h1>{guided && trial ? <TrialDay trial={trial} /> : null}</header>
    {loading ? <LoadingMark label={t("טוענים את החודש…")} /> : setupView && trial ? <>
      <a className={styles.textLink} href="/dashboard"><Copy text="לקמפיין השבוע" /></a>
      <TrialGuide trial={trial} />
    </> : <>
      {month === "error" ? <section className={styles.loadError} role="alert"><p><Copy text="לא הצלחנו לטעון את הקמפיין." /></p><button type="button" onClick={() => void reload()}><Copy text="לנסות לטעון שוב" /></button></section> : null}
      {month === "none" ? <MonthBuildProgress onDone={() => void reload(false)} idle={() => <PlannedCampaign strategy={null} />} /> : null}
      {month === "ready" && !posts.length ? <MonthBuildProgress kind="posts" onDone={() => { void loadTrial(true); void reload(false); }} idle={() => <PlannedCampaign strategy={strategy} />} /> : null}
      {month === "ready" && posts.length > 0 && strategy && work ? <>
        {goal ? <section className={styles.goal} aria-label={t("המטרה של הקמפיין")}><div><h2><Copy text="המטרה של הקמפיין" /></h2><p dir="auto">{goal}</p></div><Link href="/strategy"><Copy text="לתוכנית המלאה" /></Link></section> : null}
        <section className={styles.nextAction} aria-label={t("הצעד הבא")}>
          <div><h2>{step ? t(step.title_he) : nextPost ? t(work.action === "publish" ? "הפוסט הבא מוכן לפרסום" : "הפוסט הבא לבדיקה") : t("ממשיכים ללמוד מהתוצאות")}</h2>
            {step?.why_he ? <p dir="auto">{t(step.why_he)}</p> : nextPost ? <p dir="auto">{nextPost.title}</p> : null}</div>
          {step ? <NextStepAction step={step} showArrow={false} /> : <Link className={styles.primary} href={nextPost ? postHref(work.nextIndex) : "/performance"}><Copy text={nextPost ? work.action === "publish" ? "לפתוח ולהכין לפרסום" : "לבדוק את הפוסט" : "לראות מה עבד"} /></Link>}
        </section>
        <CampaignWeek week={work.week} posts={work.posts.map(item => item.post)} strategy={strategy} home>
          {work.posts.length ? work.posts.map(({post,index}) => <CampaignPostCard key={post.uid || index} post={post} strategy={strategy} openHref={postHref(index)} onChoose={() => {}} />) : <div className={styles.noMaterials}><p><Copy text="עוד אין פוסטים לשבוע הזה." /></p><Link href="/campaign"><Copy text="לראות את שאר הקמפיין" /></Link></div>}
        </CampaignWeek>
      </> : null}
      <nav className={styles.links} aria-label={t("המשך העבודה")}>
        <Link href="/campaign"><Copy text="הקמפיין המלא" /></Link><Link href="/strategy"><Copy text="התוכנית" /></Link><Link href="/performance"><Copy text="התוצאות" /></Link><Link href="/integrations"><Copy text="החיבורים" /></Link>
        {trial ? <a href="/dashboard?setup=1"><Copy text="ההתקדמות בתוכנית" /></a> : null}
      </nav>
      <BillingReminder />
    </>}
  </div></AppShell>;
}
