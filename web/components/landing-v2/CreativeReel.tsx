"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { CampaignFilm, type FilmName } from "./CampaignFilm";
import styles from "./creative-reel.module.css";

type Work = { film: FilmName } | { image: string; description: string };
const WORK: Work[] = [
  { film: "flowers" },
  { image: "bicycle", description: "מוסך הילוך מזמין רוכבים לכיוון הילוכים." },
  { image: "clay", description: "סטודיו עפר מציע סדנת אובניים שבה יוצרים כוס." },
  { film: "water" },
  { image: "vinyl", description: "תדר לילה מזמין לערב תקליטים ביום חמישי." },
  { image: "frames", description: "מבט שני מזמינים למדוד בחנות מסגרות בגוון ענבר." },
  { film: "ink" },
  { image: "community", description: "ארגז לשישי מחפשים מתנדבים לאריזת סלי מזון." },
  { image: "linen", description: "קפל מציגים את חולצת הפשתן שלהם ומפנים למדריך המידות." },
  { film: "interior" },
  { image: "coffee", description: "בית הקלייה מקור מזמין לטעימת שלושה סוגי קפה." },
  { image: "software", description: "מסלול מציגה לוח זמנים משותף ומזמינה צוותים להדגמה." },
];
const imageSize = "(max-width: 600px) 75vw, 340px";

export function CreativeReel() {
  const t = useCopy();
  const viewport = useRef<HTMLDivElement>(null);
  const original = useRef<HTMLUListElement>(null);
  const [paused, setPaused] = useState(false);
  const [touchControls, setTouchControls] = useState(false);

  useEffect(() => {
    const strip = viewport.current;
    const list = original.current;
    if (!strip || !list) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = list.offsetWidth;
    let visible = false;
    let hovering = false;
    let touching = false;
    let frame = 0;
    let last = 0;
    let remainder = 0;
    let wake: number | undefined;
    let browsing = false;

    function update() {
      cancelAnimationFrame(frame);
      last = 0;
      if (strip && visible && !document.hidden && !motion.matches && !paused && !hovering &&
        !touching && !browsing && !strip.matches(":focus-visible")) frame = requestAnimationFrame(tick);
    }
    function tick(now: number) {
      if (!strip) return;
      // Accumulate fractions so travel speed is the same on 60 Hz and 120 Hz screens.
      if (last) remainder += Math.min(now - last, 80) * .027;
      last = now;
      const pixels = Math.floor(remainder);
      if (pixels && width) {
        remainder -= pixels;
        strip.scrollLeft = (strip.scrollLeft + pixels) % width;
      }
      frame = requestAnimationFrame(tick);
    }
    function browse() {
      browsing = true;
      window.clearTimeout(wake);
      update();
      wake = window.setTimeout(() => { browsing = false; update(); }, 1800);
    }
    const enter = (event: PointerEvent) => { if (event.pointerType === "mouse") { hovering = true; update(); } };
    const leave = () => { hovering = false; update(); };
    const touchStart = () => { touching = true; update(); };
    const touchEnd = () => { touching = false; browse(); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    const resize = new ResizeObserver(() => { width = list.offsetWidth; });
    observer.observe(strip);
    resize.observe(list);
    strip.addEventListener("pointerenter", enter);
    strip.addEventListener("pointerleave", leave);
    strip.addEventListener("touchstart", touchStart, { passive: true });
    strip.addEventListener("touchend", touchEnd, { passive: true });
    strip.addEventListener("touchcancel", touchEnd, { passive: true });
    strip.addEventListener("wheel", browse, { passive: true });
    strip.addEventListener("focus", update);
    strip.addEventListener("blur", update);
    motion.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(wake);
      observer.disconnect();
      resize.disconnect();
      strip.removeEventListener("pointerenter", enter);
      strip.removeEventListener("pointerleave", leave);
      strip.removeEventListener("touchstart", touchStart);
      strip.removeEventListener("touchend", touchEnd);
      strip.removeEventListener("touchcancel", touchEnd);
      strip.removeEventListener("wheel", browse);
      strip.removeEventListener("focus", update);
      strip.removeEventListener("blur", update);
      motion.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [paused]);

  return <section id="creative-reel" className={styles.section} data-interacting={touchControls || undefined} aria-labelledby="creative-reel-title">
    <header className={`lv2-wrap ${styles.intro}`}>
      <h2 id="creative-reel-title"><Copy text="מה יראו הלקוחות שלך?" /></h2>
      <button type="button" className={styles.motionControl} aria-controls="campaign-portfolio" aria-pressed={paused}
        aria-label={paused ? t("להמשיך את תנועת התצוגה") : t("לעצור את תנועת התצוגה")} onClick={() => setPaused(!paused)}>
        <svg viewBox="0 0 18 18" width="16" height="16" fill="currentColor" aria-hidden="true">
          {paused ? <path d="M5 2.5 15.5 9 5 15.5z" /> : <path d="M4 3h3.5v12H4zM10.5 3H14v12h-3.5z" />}
        </svg>
      </button>
    </header>
    <div id="campaign-portfolio" className={styles.viewport} dir="ltr" ref={viewport} tabIndex={0} role="region" onPointerDown={event => { if (event.pointerType === "touch") setTouchControls(true); }}
      aria-label={t("פוסטים וסרטוני קמפיין")} onKeyDown={event => {
        const strip = event.currentTarget;
        const distance = Math.min(strip.clientWidth * .82, 420);
        const listWidth = original.current?.offsetWidth ?? 0;
        const x = strip.scrollLeft % (listWidth || 1);
        const positions: Record<string, number> = { ArrowLeft: x - distance, ArrowRight: x + distance,
          Home: 0, End: Math.max(0, listWidth - strip.clientWidth) };
        if (!(event.key in positions)) return;
        event.preventDefault();
        strip.scrollLeft = Math.max(0, Math.min(listWidth || strip.scrollWidth, positions[event.key]));
      }}>
      {[false, true].map(duplicate => <ul key={String(duplicate)} ref={duplicate ? undefined : original}
        className={styles.sequence} aria-hidden={duplicate || undefined} data-repeat={duplicate ? "true" : undefined}>
        {WORK.map(work => {
          const id = "film" in work ? work.film : work.image;
          return <li key={id} data-work={id} className={"film" in work ? styles.reel : styles.post}>
            {"film" in work ? <CampaignFilm film={work.film} paused={paused} size={imageSize} /> :
              <Image src={`/showcase/creative-strip/${work.image}.webp`} alt={duplicate ? "" : t(work.description)}
                width={864} height={1080} sizes={imageSize} />}
          </li>;
        })}
      </ul>)}
    </div>
  </section>;
}
