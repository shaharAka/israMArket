"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { analyticsChoice, analyticsExcluded, analyticsPreferencesOpen, closeAnalyticsPreferences, openAnalyticsPreferences, chooseAnalytics, consumeSignupEvent, pauseAnalytics, publicAnalyticsPath, SITE_MEASUREMENT_ID, subscribeAnalytics, trackWebsitePage } from "@/lib/siteAnalytics";
import styles from "./analytics.module.css";

const noChoice = () => null;
const closed = () => false;
// תכלית: לבחור אם למדוד את השימוש באתר. אפשר לסרב ולהמשיך, ולשנות את הבחירה בעמוד הפרטיות.
export function SiteAnalytics() {
  const pathname = usePathname();
  const t = useCopy();
  const consent = useSyncExternalStore(subscribeAnalytics, analyticsChoice, noChoice);
  const [ready, setReady] = useState(false);
  const preferences = useSyncExternalStore(subscribeAnalytics, analyticsPreferencesOpen, closed);
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (consent === "granted") { trackWebsitePage(pathname); consumeSignupEvent(); }
    else pauseAnalytics();
  }, [pathname, consent, ready]);
  const offered = ready && Boolean(SITE_MEASUREMENT_ID) && publicAnalyticsPath(pathname) && (preferences || consent === null && !analyticsExcluded(true));
  if (!offered) return null;
  function choose(value: "granted" | "denied") { chooseAnalytics(value); closeAnalyticsPreferences(); }
  return <section role="region" aria-label={t("העדפות מדידה")} className={styles.banner}>
    <div><h2><Copy text="לעזור לנו לשפר את האתר?" /></h2><p><Copy text="באישורכם, נשתמש בגוגל אנליטיקס למדידת כניסות והרשמה. לא נשלח את הפרטים שאתם מקלידים. אפשר להמשיך גם בלי מדידה." /> <Link href="/security#website-analytics"><Copy text="פרטים והעדפות" /></Link></p></div>
    <div className={styles.actions}><button onClick={() => choose("granted")}><Copy text="לאפשר מדידה" /></button><button onClick={() => choose("denied")}><Copy text="להמשיך בלי מדידה" /></button></div>
  </section>;
}

export function AnalyticsSettings() {
  return <button type="button" className={styles.settings} onClick={openAnalyticsPreferences}><Copy text="לשנות את העדפות המדידה" /></button>;
}
