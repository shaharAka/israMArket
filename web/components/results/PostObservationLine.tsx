"use client";

import { useCopy, useLanguage } from "@/components/language/LanguageProvider";
import type { PostObservation } from "@/lib/api";
import { dateRange, dayMonth } from "@/lib/dates";

/** Purpose: show which days this number covers, directly beside the number.
 * Message: a Google reporting window and a cumulative click count are different.
 * No action needed; recovery belongs to Connections, not this factual label. */
export function PostObservationLine({ observation, google = false }: { observation?: PostObservation | null; google?: boolean }) {
  const { locale } = useLanguage();
  const t = useCopy();
  if (!google && observation?.source !== "ga4") return null;
  const range = dateRange(observation?.start, observation?.end, locale);
  const read = dayMonth(observation?.read_at, locale);
  return <p className="mt-1 text-[12px] leading-5 text-[color:var(--ink-muted)]">
    Google Analytics · <bdi>{range || t("תאריכי המדידה לא נשמרו")}</bdi>
    {read ? <> · {t("נקרא ב־{arg_0}", { arg_0: read })}</> : null}
    {observation?.limited ? <> · {t("דוח קמפיינים חלקי")}</> : null}
  </p>;
}
