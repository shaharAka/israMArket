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
  const read = dayMonth(observation?.read_at, locale);
  if (observation?.source === "facebook" || (observation?.source === "instagram" && observation.product_type === "STORY")) {
    // Message: this is the captured Story count, dated when Meta returned it.
    return <p className="mt-1 text-[12px] leading-5 text-[color:var(--ink-muted)]">
      {observation.source === "facebook" ? "Facebook" : "Instagram"} · {read ? t("נקרא ב־{arg_0}", { arg_0: read }) : null}
    </p>;
  }
  if (!google && observation?.source !== "ga4") return null;
  const range = dateRange(observation?.start, observation?.end, locale);
  return <p className="mt-1 text-[12px] leading-5 text-[color:var(--ink-muted)]">
    Google Analytics · <bdi>{range || t("תאריכי המדידה לא נשמרו")}</bdi>
    {read ? <> · {t("נקרא ב־{arg_0}", { arg_0: read })}</> : null}
    {observation?.limited ? <> · {t("דוח קמפיינים חלקי")}</> : null}
  </p>;
}
