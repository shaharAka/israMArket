"use client";

import Image from "next/image";
import { useId, useState } from "react";
import { useLanguage } from "@/components/language/LanguageProvider";
import { IconCheck } from "@/lib/icons";
import { editorialCopy } from "./editorialContent";
import { campaignWeek, formatNovember } from "./workshopCampaign";
import styles from "./EditorialCalendar.module.css";

const calendarPosts = [
  ...campaignWeek,
  {
    day: 18,
    title: "משתפים תוצרים מהסדנה",
    platform: "Facebook",
    image: "/showcase/campaign-cuts/worktable.webp",
    position: "center 45%",
  },
] as const;
const days = Array.from({ length: 14 }, (_, index) => index + 8);

const dateTime = (day: number) => `2026-11-${String(day).padStart(2, "0")}`;

/** A two-week excerpt from the example monthly plan. */
export function EditorialCalendar() {
  const { locale, t } = useLanguage();
  const summary = useId();
  const [selected, setSelected] = useState<(typeof calendarPosts)[number]>(calendarPosts[0]);

  return <div className={styles.stage}>
    <figure className={styles.sheet}>
      <figcaption className={styles.heading}>
        <div>
          <strong>{t("לוח הפרסום")}</strong>
          <span>{t(editorialCopy.project)}</span>
        </div>
        <time dateTime="2026-11">{formatNovember(locale, 1, { month: "long" })}</time>
      </figcaption>
      <div className={styles.weekdays} aria-hidden="true">
        {days.slice(0, 7).map(day => <span key={day}>
          {formatNovember(locale, day, { weekday: "narrow" })}
        </span>)}
      </div>
      <ol className={styles.days}>
        {days.map(day => {
          const post = calendarPosts.find(item => item.day === day);
          if (!post) return <li key={day} className={styles.cell} aria-hidden="true">
            <time dateTime={dateTime(day)}>{day}</time>
          </li>;

          const date = formatNovember(locale, day, { weekday: "long", day: "numeric", month: "long" });
          return <li key={day} className={styles.cell}>
            <button
              type="button"
              className={styles.post}
              aria-label={`${date} · ${t(post.title)} · ${post.platform}`}
              aria-controls={summary}
              aria-pressed={post.day === selected.day}
              onClick={() => setSelected(post)}
            >
              <span className={styles.dayHead} aria-hidden="true">
                <time dateTime={dateTime(day)}>{day}</time>
                <Image width={14} height={14} src={`/connectors/${post.platform.toLowerCase()}.svg`} alt="" />
              </span>
              <Image
                className={styles.art}
                src={post.image}
                alt=""
                width={144}
                height={112}
                sizes="(max-width: 760px) 13vw, 88px"
                style={{ objectPosition: post.position }}
              />
            </button>
          </li>;
        })}
      </ol>
      <div id={summary} className={styles.summary} aria-live="polite" aria-atomic="true">
        <div className={styles.summaryCopy}>
          <strong>{t(selected.title)}</strong>
          <span><time dateTime={dateTime(selected.day)}>{formatNovember(locale, selected.day, { day: "numeric", month: "short" })}</time> · <bdi lang="en">{selected.platform}</bdi></span>
        </div>
        <span className={styles.ready}><IconCheck />{t(editorialCopy.ready)}</span>
      </div>
    </figure>
  </div>;
}
