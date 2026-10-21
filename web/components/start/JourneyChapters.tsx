"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { interviewChapter, interviewChapterProgress, SETUP_CHAPTERS } from "@/lib/productJourney";
import type { ResearchJourney } from "@/lib/researchJourney";
import styles from "./journey.module.css";

export function JourneyChapters({ journey }: { journey: Pick<ResearchJourney, "phase" | "segment" | "step"> }) {
  const t = useCopy();
  const active = interviewChapter(journey.step);
  const index = SETUP_CHAPTERS.findIndex(chapter => chapter.key === active);
  const progress = interviewChapterProgress(journey);
  return <div className={styles.chapterHeader}><ol className={styles.chapters} aria-label={t("שלבי בניית התוכנית")}>
    {SETUP_CHAPTERS.map((chapter, i) => <li key={chapter.key} aria-current={chapter.key === active ? "step" : undefined} data-passed={i < index}>
      <span role={chapter.key === active && progress ? "progressbar" : undefined}
        aria-label={chapter.key === active ? t("התקדמות בחלק הנוכחי") : undefined}
        aria-valuemin={chapter.key === active ? 0 : undefined} aria-valuemax={chapter.key === active ? progress?.total : undefined}
        aria-valuenow={chapter.key === active ? progress?.current : undefined}>
        {chapter.key === active && progress ? <i aria-hidden="true" style={{ inlineSize: `${progress.current / progress.total * 100}%` }} /> : null}
      </span><Copy text={chapter.label} />
    </li>)}
  </ol>{progress && progress.total > 1 ? <p className={styles.chapterCount} role="status"><Copy text="שלב {arg_0} מתוך {arg_1} בחלק הזה" args={{ arg_0: progress.current, arg_1: progress.total }} /></p> : null}</div>;
}

