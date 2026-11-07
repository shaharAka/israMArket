"use client";

import type { ReactNode } from "react";
import { useCopy, useLanguage } from "@/components/language/LanguageProvider";
import { UIAction } from "@/components/design/Controls";
import { IconCheck } from "@/lib/icons";
import { LOCALE_META } from "@/lib/i18n/locales";
import { checkedDate } from "./SourceReadState";
import type { ConnectionJourney } from "./connectionJourney";

/** מטרה: לראות מה כבר מחובר ומה עושים עכשיו, בלי לפתוח הוראות כדי להבין את המצב. */
export function ConnectionJourneyCard({ id, title, account, status, journey, open, onOpen, primary = false, children }: {
  id: string; title: string; account?: string; status: string; journey: ConnectionJourney;
  open: boolean; onOpen: () => void; primary?: boolean; children: ReactNode;
}) {
  const t = useCopy();
  const { locale } = useLanguage();
  const labels = [t("אישור גישה"), t("בחירת החשבון"), t("קריאת נתונים")];
  return <section id={id} className="scroll-mt-20 rounded-2xl bg-[var(--paper)] p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby={`${id}-title`}>
    <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-1">
      <div className="min-w-0"><h2 id={`${id}-title`} className="text-[18px] font-semibold text-[var(--ink)]">{title}</h2>
        {account ? <p dir="auto" className="mt-1 break-words text-[14px] text-[var(--ink-soft)]">{account}</p> : null}</div>
      <p className="text-[13px] font-medium text-[var(--ink-muted)]">{status}</p>
    </div>
    <ol aria-label={t("התקדמות החיבור")} className="my-4 grid grid-cols-3 gap-3">
      {journey.steps.map((step, index) => <li key={index} aria-current={step === "current" ? "step" : undefined} className="min-w-0">
        <span aria-hidden className={`mb-2 block h-1 rounded-full ${step === "done" ? "bg-[var(--ink)]" : step === "current" ? "bg-[var(--primary)]" : "bg-[var(--rule)]"}`} />
        <span className={`flex items-center gap-1 text-[12px] leading-5 ${step === "current" ? "font-semibold text-[var(--primary)]" : "text-[var(--ink-muted)]"}`}>
          {step === "done" ? <IconCheck className="h-3 w-3 shrink-0" /> : null}{labels[index]}<span className="sr-only">{step === "done" ? t("הושלם") : step === "waiting" ? t("עוד לא הושלם") : t("השלב הנוכחי")}</span>
        </span>
      </li>)}
    </ol>
    <dl className="divide-y divide-[var(--rule)] text-[13px]">
      {journey.streams.map(stream => <div key={stream.label} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2">
        <dt className="text-[var(--ink-soft)]">{t(stream.label)}</dt><dd className={stream.usable ? "font-medium text-[var(--ink)]" : "text-[var(--ink-muted)]"}>{t(stream.status)}</dd>
      </div>)}
    </dl>
    {journey.checkedAt ? <p className="mt-2 text-[12px] text-[var(--ink-muted)]">{t("נקרא ב־{arg_0}", { arg_0: checkedDate(journey.checkedAt, LOCALE_META[locale].formatLocale) })}</p> : null}
    <div className="mt-3"><UIAction variant={!open && primary ? "primary" : "text"} onClick={onOpen} aria-expanded={open} aria-controls={`${id}-connection-body`}>
      {open ? t("לסגור את שלבי החיבור") : t(journey.action)}
    </UIAction></div>
    <div id={`${id}-connection-body`} hidden={!open} className="mt-2 border-t border-[var(--rule)] pt-4">{children}</div>
  </section>;
}
