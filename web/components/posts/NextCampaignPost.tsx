"use client";

import Image from "next/image";
import Link from "next/link";
import { useCopy, useLanguage } from "@/components/language/LanguageProvider";
import type { RoadmapPost } from "@/lib/api";
import { IconImage } from "@/lib/icons";
import { ownerNeedsOf } from "@/lib/postLifecycle";
import { postWeek } from "./postMeta";
import styles from "./campaign.module.css";

const CHANNEL_LABEL: Record<string, string> = {
  instagram: "אינסטגרם", facebook: "פייסבוק", whatsapp: "וואטסאפ", tiktok: "טיקטוק", linkedin: "לינקדאין",
};

/** תכלית: לזהות את הפוסט שמחכה לפעולה, ולפתוח אותו ישירות. */
export function NextCampaignPost({ post, index, action, quiet = false }: {
  post: RoadmapPost;
  index: number;
  action: "review" | "publish";
  quiet?: boolean;
}) {
  const t = useCopy();
  const { locale } = useLanguage();
  const label = action === "review" ? "הפוסט הבא שמחכה לכם" : "פוסט מוכן לפרסום";
  const channel = CHANNEL_LABEL[post.channel || post.primary_outlet || ""];
  const need = ownerNeedsOf(post)[0]?.text;
  const query = new URLSearchParams({ post: String(index), from: "campaign", week: String(postWeek(post)), lang: locale });

  return <section className={styles.nextTask} aria-label={t(label)}>
    <div className={styles.nextPost}>
      <span className={styles.nextThumbnail} aria-hidden="true">
        {post.image_url ? <Image src={post.image_url} width={144} height={144} alt="" unoptimized />
          : post.video_url ? <video src={post.video_url} preload="metadata" muted playsInline tabIndex={-1} />
            : <IconImage />}
      </span>
      <div className={styles.nextPostCopy}>
        <p>{t(label)}{channel ? ` · ${t(channel)}` : ""}</p>
        <h2 dir="auto">{post.title}</h2>
        {need ? <p>{t(need)}</p> : null}
      </div>
    </div>
    <Link className={quiet ? styles.textAction : styles.primary} href={`/posts?${query}`}>
      {t(action === "review" ? "לבדוק ולאשר" : "לפתוח לפרסום")}
    </Link>
  </section>;
}
