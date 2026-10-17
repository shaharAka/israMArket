"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";
import { interviewChapter, SETUP_CHAPTERS } from "@/lib/productJourney";
import styles from "./journey.module.css";

export function JourneyChapters({ step }: { step: string }) {
  const t = useCopy();
  const active = interviewChapter(step);
  const index = SETUP_CHAPTERS.findIndex(chapter => chapter.key === active);
  return <ol className={styles.chapters} aria-label={t("שלבי בניית התוכנית")}>
    {SETUP_CHAPTERS.map((chapter, i) => <li key={chapter.key} aria-current={chapter.key === active ? "step" : undefined} data-passed={i < index}>
      <span aria-hidden="true" /><Copy text={chapter.label} />
    </li>)}
  </ol>;
}

