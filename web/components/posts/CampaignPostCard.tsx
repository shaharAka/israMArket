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

export function CampaignPostCard({ post, strategy, selected = false, disabled = false, selecting = false, focused = false, onChoose, editorHref }: {
  post: RoadmapPost; strategy: Pick<StrategyPayload, "brand_language" | "brand_dna" | "business_name">;
  selected?: boolean; disabled?: boolean; selecting?: boolean; focused?: boolean; onChoose: () => void; editorHref?: string;
}) {
  const t = useCopy();
  const { locale } = useLanguage();
  const day = postDay(post);
  const channelLabels: Record<string,string>={instagram:t("אינסטגרם"),facebook:t("פייסבוק"),whatsapp:t("וואטסאפ"),tiktok:t("טיקטוק"),linkedin:t("לינקדאין")};
  const channels=[...new Set([post.channel || post.primary_outlet,...(post.outlets || [])].filter((channel):channel is string=>Boolean(channel)))].map(channel=>channelLabels[channel]).filter(Boolean);
  const date = day ? new Date(`${day}T12:00:00`).toLocaleDateString(LOCALE_META[locale].formatLocale, { day: "numeric", month: "short" }) : post.date_hint?.trim() || t("מועד לבחירה");
  const content = <>
      <span className={styles.thumbnail} data-vertical={post.format === "reel" || post.format === "story"}>
        {post.video_url ? <video src={post.video_url} muted playsInline preload="metadata" aria-label={post.title} /> : <CardStage post={post} brand={strategy.brand_language} dna={strategy.brand_dna} businessName={strategy.business_name || ""} quietPlaceholder photoSizes="240px" />}
      </span>
      <span className={styles.cardBody}>{channels.length ? <span className={styles.channels}>{channels.join(" · ")}</span> : null}<span className={styles.date}>{date} · {t(LIFECYCLE_LABEL[lifecycleOf(post)])}</span>
        <strong dir="auto">{post.title}</strong>
        {post.plan_link?.goal || post.goal_fit ? <span dir="auto" data-post-goal>{post.plan_link?.goal || post.goal_fit}</span> : null}
        {post.cta ? <span dir="auto">{post.cta}</span> : null}
        <span className={styles.selected}>{selecting ? selected ? t("נבחר") : protectedPost(post) ? t("כבר אושר, תוזמן או פורסם") : t("לבחור") : t("לפתוח בעורך")}</span>
      </span>
  </>;
  return <article className={styles.card} data-active={selected} data-focus={focused || undefined}>
    {selecting
      ? <button type="button" aria-pressed={selected} disabled={disabled || (protectedPost(post) && !selected)} className={styles.select} onClick={onChoose} data-campaign-post>{content}</button>
      : <Link href={editorHref || "/posts"} className={styles.select} data-campaign-post>{content}</Link>}
  </article>;
}
