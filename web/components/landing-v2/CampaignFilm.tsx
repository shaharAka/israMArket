"use client";

import Image from "next/image";
import { useEffect, useRef, type ReactNode } from "react";
import { useCopy } from "@/components/language/LanguageProvider";
import styles from "./creative-reel.module.css";

export const CAMPAIGN_FILMS = {
  flowers: {
    src: "/showcase/campaign-cuts/flowers.mp4",
    poster: "/showcase/campaign-cuts/flowers-poster.webp",
    title: "פרחים לשישי",
    caption: "בסטודיו גבעול מזמינים זר בהודעה עד חמישי ואוספים אותו בשישי.",
  },
  water: {
    src: "/showcase/campaign-cuts/water.mp4",
    poster: "/showcase/campaign-cuts/water-poster.webp",
    title: "עד הקיר ובחזרה",
    caption: "בקו מים מזמינים שחיינים לסדנה לשיפור סגנון החתירה.",
  },
  interior: {
    src: "/showcase/campaign-cuts/interior.mp4",
    poster: "/showcase/campaign-cuts/interior-poster.webp",
    title: "אותו גוון. אור אחר.",
    caption: "בפגישת ייעוץ של צד אור בודקים דוגמאות צבע על הקיר בבית, לפני שצובעים.",
  },
  ink: {
    src: "/showcase/campaign-cuts/ink-preview.mp4",
    poster: "/showcase/dyo-tari/story.webp",
    title: "שני צבעים. דג אחד.",
    caption: "דיו טרי מזמינים את הקהל להירשם לערב הדפס רשת בחיפה.",
  },
} as const;
export type FilmName = keyof typeof CAMPAIGN_FILMS;

export function CampaignFilm({ film, children, size, previewSrc, paused = false }: {
  film: FilmName; children?: ReactNode; size: string; previewSrc?: string; paused?: boolean;
}) {
  const item = CAMPAIGN_FILMS[film];
  const inlineSrc = previewSrc ?? item.src;
  const t = useCopy();
  const preview = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = preview.current;
    if (!video) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const update = () => {
      if (visible && !motion.matches && !document.hidden && !paused) {
        if (!video.getAttribute("src")) video.src = inlineSrc;
        void video.play().catch(() => {});
      } else video.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio >= .14;
      update();
    }, { threshold: [0, .14] });
    observer.observe(video);
    motion.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
      video.pause();
    };
  }, [inlineSrc, paused]);

  return <div className={styles.film} data-film={film} role="img" aria-label={t(item.caption)}>
    {children ?? <Image src={item.poster} alt="" width={720} height={1280} sizes={size} />}
    <video ref={preview} muted playsInline loop preload="none" aria-hidden="true" className={styles.inlinePreview} />
  </div>;
}
