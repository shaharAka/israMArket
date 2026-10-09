"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, ErrorNote, PageHeader } from "@/components/AppShell";
import { UIAction } from "@/components/design/Controls";
import { FindingCard } from "@/components/results/FindingCard";
import { endpoints, type RecommendationPayload } from "@/lib/api";
import { IconChevron } from "@/lib/icons";

export default function RecommendationsPage() {
  const t = useCopy();
  const [data, setData] = useState<RecommendationPayload | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    endpoints.recommendations().then(payload => { if (active) setData(payload); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "לא הצלחנו לטעון את ההמלצות"); });
    return () => { active = false; };
  }, []);
  async function generate() {
    setPending(true); setError("");
    try { setData(await endpoints.generateRecommendations()); }
    catch (err) { setError(err instanceof Error ? err.message : t("לא הצלחנו להכין הצעה כרגע")); }
    finally { setPending(false); }
  }
  const items = data?.available === false ? [] : data?.suggestions?.suggestions ?? [];
  return <AppShell><div className="mx-auto max-w-3xl">
    <PageHeader title={t("מה כדאי לנסות עכשיו")} subtitle={t("הצעה אחת לבדיקה, מתוך התוכנית והנתונים הזמינים.")} />
    {error ? <div className="mb-5"><ErrorNote message={error} /></div> : null}
    {data && items.length ? <>
      <FindingCard payload={data} />
      {items.length > 1 ? <details className="group mt-5">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[14px] font-semibold text-[color:var(--ink-soft)] [&::-webkit-details-marker]:hidden">
          {items.length === 2 ? t("עוד הצעה לבדיקה") : t("עוד {arg_0} הצעות לבדיקה", { arg_0: items.length - 1 })}<IconChevron className="h-4 w-4 -rotate-90 transition-transform group-open:rotate-90" />
        </summary>
        <div className="mt-3 space-y-4">{items.slice(1).map((item, index) => <FindingCard key={`${index}-${item.title}`} payload={data} index={index + 1} primary={false} />)}</div>
      </details> : null}
    </> : data ? <div className="paper p-6">
      <h2 className="text-[18px] font-bold text-[color:var(--ink)]"><Copy text="עוד אין הצעה חדשה לבדיקה" /></h2>
      <p className="mt-2 text-[15px] leading-7 text-[color:var(--ink-soft)]"><Copy text="אפשר להכין ניסוי קטן מתוך התוכנית גם לפני שהחיבורים מוכנים. בלי נתונים, לא נקבע אם הוא הצליח." /></p>
      <Link href="/strategy" className="mt-3 inline-flex min-h-11 items-center text-[14px] font-semibold text-[color:var(--primary)] hover:underline"><Copy text="לראות את התוכנית" /></Link>
    </div> : !error ? <p className="text-[14px] text-[color:var(--ink-muted)]" role="status"><Copy text="טוענים את ההצעות…" /></p> : null}
    <div className="mt-5"><UIAction variant={data && !items.length ? "primary" : "text"} busy={pending} busyLabel={t("מכינים הצעה…")} onClick={generate}><Copy text="להכין הצעה מהנתונים שנשמרו" /></UIAction></div>
  </div></AppShell>;
}
