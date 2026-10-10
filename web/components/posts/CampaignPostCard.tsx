"use client";

import Link from "next/link";
import { CardStage } from "@/components/CardCanvas";
import { useCopy, useLanguage } from "@/components/language/LanguageProvider";
import type { RoadmapPost, StrategyPayload } from "@/lib/api";
import { LOCALE_META } from "@/lib/i18n/locales";
import { LIFECYCLE_LABEL, lifecycleOf } from "@/lib/postLifecycle";
import { protectedPost } from "@/lib/campaign";
import { postDay } from "./postMeta";
import styles from "./campaign.module.css";

export function CampaignPostCard({ post, strategy, selected = false, disabled = false, onChoose, editorHref }: {
  post: RoadmapPost; strategy: Pick<StrategyPayload, "brand_language" | "brand_dna" | "business_name">;
  selected?: boolean; disabled?: boolean; onChoose: () => void; editorHref?: string;
}) {
  const t = useCopy();
  const { locale } = useLanguage();
  const day = postDay(post);
  const date = day ? new Date(`${day}T12:00:00`).toLocaleDateString(LOCALE_META[locale].formatLocale, { day: "numeric", month: "short" }) : post.date_hint?.trim() || t("מועד לבחירה");
  return <article className={styles.card} data-active={selected}>
    <button type="button" aria-pressed={selected} disabled={disabled} className={styles.select} onClick={onChoose} data-campaign-post>
      <span className={styles.thumbnail} data-vertical={post.format === "reel" || post.format === "story"}>
        {post.video_url ? <video src={post.video_url} muted playsInline preload="metadata" aria-label={post.title} /> : <CardStage post={post} brand={strategy.brand_language} dna={strategy.brand_dna} businessName={strategy.business_name || ""} quietPlaceholder photoSizes="240px" />}
      </span>
      <span className={styles.cardBody}><span className={styles.date}>{date} · {t(LIFECYCLE_LABEL[lifecycleOf(post)])}</span>
        <strong dir="auto">{post.title}</strong>
        {post.plan_link?.goal || post.goal_fit ? <span dir="auto" data-post-goal>{post.plan_link?.goal || post.goal_fit}</span> : null}
        {post.cta ? <span dir="auto">{post.cta}</span> : null}
        <span className={styles.selected}>{selected ? t("נבחר") : !editorHref || protectedPost(post) ? t("לצפות בפוסט") : t("לבחור")}</span>
      </span>
    </button>
    {editorHref ? <Link href={editorHref} className={styles.cardLink}>{t("לפתוח בעורך")}</Link> : null}
  </article>;
}
