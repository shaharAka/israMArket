"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { UIAction } from "./Controls";
import { ConnectionJourneyCard } from "@/components/integrations/ConnectionJourneyCard";
import { TrackingSetupGuide } from "@/components/integrations/TrackingSetupGuide";
import { connectionJourney, type JourneyProvider } from "@/components/integrations/connectionJourney";
import type { IntegrationsPayload } from "@/lib/api";

type Scenario = "missing" | "consent" | "empty" | "partial" | "ready" | "reconnect" | "unavailable";
const NAMES = { ga4: "נתוני האתר בגוגל", meta: "פייסבוק ואינסטגרם", tiktok: "טיקטוק" };

/** Review the actual customer components with local-only source states. No provider requests. */
export function ConnectionGuidePreview() {
  const t = useCopy();
  const [provider, setProvider] = useState<JourneyProvider>("meta");
  const [scenario, setScenario] = useState<Scenario>("partial");
  const [open, setOpen] = useState(false);
  const pending = scenario === "missing" || scenario === "consent";
  const item: IntegrationsPayload["integrations"][number] | undefined = scenario === "missing" ? undefined : {
    provider, status: scenario === "consent" ? provider === "ga4" ? "select_property" : provider === "meta" ? "select_assets" : "select_account" : "connected",
    connected: !pending, display_name: "נעה · עיצוב", external_id: pending ? "" : "review-only-account",
    ad_account_id: !pending && provider === "meta" ? "review-only-ads" : "",
    source_readiness: { status: scenario === "consent" ? "unchecked" : scenario === "unavailable" ? "unchecked" : scenario,
      note_he: "", last_success_at: !pending ? "2026-10-17T08:32:22" : undefined,
      selection: { page_id: "review-page", instagram_id: "review-instagram", ad_account_id: "review-only-ads", pixel_id: "" },
      sections: { facebook: { status: scenario === "partial" ? "permission" : scenario }, social: { status: scenario === "partial" ? "ready" : scenario }, ads: { status: scenario === "partial" ? "empty" : scenario } } },
    tiktok_data: { source_readiness: { status: pending ? "unchecked" : scenario, note_he: "", last_success_at: !pending ? "2026-10-17T08:32:22" : undefined }, profile: { display_name: "נעה · עיצוב" }, complete: scenario !== "partial", measurement: "cumulative_public_video_counts", videos: [] },
  };
  const journey = connectionJourney(provider, item, scenario !== "unavailable");
  const guideProvider = provider === "ga4" ? "google" : provider;
  return <main className="app-blue min-h-screen bg-[var(--canvas)] px-4 py-8 text-[var(--ink)]">
    <div className="mx-auto max-w-[760px] space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-[28px] font-semibold"><Copy text="החיבורים, צעד אחר צעד" /></h1><Link href="/design/connections" className="text-[14px] text-[var(--primary)]"><Copy text="ללוח החיבורים" /></Link></header>
      <div className="flex flex-wrap items-end gap-4 rounded-xl bg-[var(--paper)] p-4">
        <label className="grid gap-2 text-[13px]"><Copy text="חיבור לבדיקה" /><select className="min-h-11 rounded-md border border-[var(--rule-dark)] bg-[var(--paper)] px-3 text-[16px]" value={provider} onChange={e => { setProvider(e.target.value as JourneyProvider); setOpen(false); }}>{Object.entries(NAMES).map(([key, value]) => <option key={key} value={key}>{t(value)}</option>)}</select></label>
        <label className="grid gap-2 text-[13px]"><Copy text="מצב לבדיקה" /><select className="min-h-11 rounded-md border border-[var(--rule-dark)] bg-[var(--paper)] px-3 text-[16px]" value={scenario} onChange={e => { setScenario(e.target.value as Scenario); setOpen(false); }}>{Object.entries({ missing: "עוד לא חובר", consent: "אושרה גישה", empty: "אין פעילות בתקופה", partial: "חלק מהנתונים התקבלו", ready: "הנתונים התקבלו", reconnect: "צריך לחדש גישה", unavailable: "החיבור עדיין לא זמין" }).map(([key, value]) => <option key={key} value={key}>{t(value)}</option>)}</select></label>
      </div>
      <ConnectionJourneyCard id="guide-review" title={t(NAMES[provider])} account={item?.display_name} status={t(scenario === "unavailable" ? "עדיין לא זמין" : scenario === "partial" ? "יש נתונים חלקיים" : journey.usable ? "יש נתונים" : scenario === "empty" ? "עוד אין פעילות" : "נשאר להשלים את החיבור")} journey={journey} open={open} onOpen={() => setOpen(!open)} primary>
        <div className="space-y-3">
          <p className="text-[15px] leading-7 text-[var(--ink-soft)]">{t(provider === "meta" ? "אפשר לנתח פוסטים בלי מעקב באתר. המעקב נחוץ כדי לבדוק פעולות באתר בעקבות הפרסום." : provider === "ga4" ? "נתוני האתר מראים מאיפה מגיעים אנשים ומה הם עושים בו." : "כאן נלמד מצפיות ותגובות לסרטונים. נתוני מודעות ופעולות באתר הם חיבור נפרד.")}</p>
          <UIAction variant="secondary" onClick={() => setScenario(scenario === "missing" ? "consent" : "ready")}><Copy text="לבדיקת העיצוב: לעבור לשלב הבא" /></UIAction>
          <div><TrackingSetupGuide provider={guideProvider} onReturn={provider !== "tiktok" ? () => setScenario("consent") : undefined} returnLabel={provider === "meta" ? t("לחזור לבחירת המעקב") : t("לחזור לבחירת האתר")} /></div>
        </div>
      </ConnectionJourneyCard>
    </div>
  </main>;
}
