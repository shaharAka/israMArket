"use client";

import Link from "next/link";
import type { RoadmapPost } from "@/lib/api";
import type { BrandDna } from "@/lib/dna/library";
import { useCopy } from "@/components/language/LanguageProvider";
import { metricLabel } from "@/lib/postLifecycle";

// Purpose: make creative work serve a person, a marketing objective and a customer
// action. Main message: the look belongs to your brand; the content serves your plan.
// Show learning only when actually supplied; otherwise name the measurement to test.
export function briefLearning(post: RoadmapPost): string | null | undefined {
  const measured = Boolean(post.results?.matched_by?.length && (
    (post.results.observations && Object.keys(post.results.observations).length) ||
    ((post.published_at || post.published_url) && post.results.updated_at && typeof post.results.value === "number")
  ));
  return post.informed_by_note || (measured ? post.learning : null);
}

export function CampaignBrief({ post, audience, dna }: { post: RoadmapPost; audience: string; dna: BrandDna | null }) {
  const t = useCopy();
  const goal = post.plan_link?.goal || post.goal_fit;
  const measure = metricLabel(post);
  const learning = briefLearning(post);
  const rows = [
    [t("הקהל"), audience],
    [t("המטרה"), goal],
    [t("הפעולה"), post.cta],
    [t(learning ? "מה למדנו" : "מה נבדוק"), learning || t(measure)],
  ].filter(([, value]) => value?.trim());
  if (!rows.length && !dna) return null;
  return <section aria-label={t("הפוסט בתוכנית")} className="mb-5">
    <h2 className="mb-3 text-[17px] font-semibold text-[var(--ink)]">{t("הפוסט בתוכנית")}</h2>
    <dl className="space-y-3">
      {rows.map(([label, value]) => <div key={label} className="grid grid-cols-[5.5rem_1fr] gap-3 text-[14px] leading-6">
        <dt className="text-[var(--ink-muted)]">{label}</dt><dd dir="auto" className="text-start text-[var(--ink)]">{value}</dd>
      </div>)}
    </dl>
    {dna ? <Link href="/brand" className="mt-4 inline-flex min-h-11 items-center gap-2 text-[13px] font-medium text-[var(--primary)]">
      <span className="flex gap-1" aria-hidden="true">{[dna.colors.paper, dna.colors.accent, dna.colors.ink].map((color, i) =>
        <span key={i} className="h-3.5 w-3.5 rounded-full border border-[var(--rule-dark)]" style={{ background: color }} />)}</span>
      {t("הסגנון שלכם")}
    </Link> : null}
  </section>;
}
