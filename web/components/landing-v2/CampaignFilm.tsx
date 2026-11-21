"use client";

import Image from "next/image";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
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
    src: "/showcase/dyo-tari/film.mp4",
    poster: "/showcase/dyo-tari/story.webp",
    title: "שני צבעים. דג אחד.",
    caption: "דיו טרי מזמינים את הקהל להירשם לערב הדפס רשת בחיפה.",
  },
} as const;
export type FilmName = keyof typeof CAMPAIGN_FILMS;

export function CampaignFilm({ film, children, size, previewSrc }: {
  film: FilmName; children?: ReactNode; size: string; previewSrc?: string;
}) {
  const item = CAMPAIGN_FILMS[film];
  const inlineSrc = previewSrc ?? item.src;
  const description = useId();
  const t = useCopy();
  const dialog = useRef<HTMLDialogElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const preview = useRef<HTMLVideoElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const video = preview.current;
    if (!video) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const update = () => {
      if (visible && !motion.matches && !document.hidden && !document.querySelector("dialog[open]")) {
        if (!video.src) video.src = inlineSrc;
        void video.play().catch(() => {});
      } else video.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio >= .2;
      update();
    }, { threshold: [0, .2] });
    observer.observe(video);
    motion.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    document.addEventListener("landing-film-change", update);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
      document.removeEventListener("landing-film-change", update);
      video.pause();
    };
  }, [inlineSrc]);

  const open = () => {
    const element = dialog.current;
    if (!element || !player.current) return;
    element.showModal();
    document.dispatchEvent(new Event("landing-film-change"));
    const filmPlayer = player.current;
    if (!filmPlayer.src) filmPlayer.src = item.src;
    filmPlayer.currentTime = 0;
    void filmPlayer.play().catch(() => {});
  };

  return <>
    <button ref={trigger} type="button" className={styles.filmTrigger} data-film={film} onClick={open}
      aria-label={t("לצפייה בסרטון ״{arg_0}״", { arg_0: t(item.title) })}>
      {children ?? <Image src={item.poster} alt="" width={720}
        height={1280} sizes={size} />}
      <video ref={preview} muted playsInline loop preload="none" aria-hidden="true" className={styles.inlinePreview} />
      <span className={styles.play}><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M12 3h5v5M17 3l-5 5M8 17H3v-5m0 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg></span>
    </button>
    <dialog ref={dialog} className={styles.dialog} aria-label={t(item.title)}
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}
      onClose={() => {
        player.current?.pause();
        document.dispatchEvent(new Event("landing-film-change"));
        trigger.current?.focus({ preventScroll: true });
      }}>
      <div className={styles.viewer}>
        <header><strong>{t(item.title)}</strong><button type="button" onClick={() => dialog.current?.close()}><Copy text="סגירה" /></button></header>
        <video ref={player} controls muted preload="none" playsInline poster={item.poster} aria-label={t(item.title)} aria-describedby={description} />
        <p id={description} className="sr-only">{t(item.caption)}</p>
      </div>
    </dialog>
  </>;
}
