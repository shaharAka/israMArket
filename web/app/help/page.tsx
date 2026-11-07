"use client";

import { Copy, useCopy } from "@/components/language/LanguageProvider";

import { useState } from "react";
import Link from "next/link";
import { AppShell, PageHeader } from "@/components/AppShell";
import { CARD, GROUP_LABEL, LIST_ROW, ROW_CHEVRON } from "@/components/account/setupStyles";
import { GuideSheet } from "@/components/help/HowToFind";
import { GUIDES, HELP_GROUPS, type HelpTopic } from "@/components/help/guides";
import { ContactLink } from "@/components/trial/StepLink";
import { IconChevron } from "@/lib/icons";

/**
 * Every "how do I find this?" guide in one list, so an owner can browse them without first
 * landing on the page that needs one. The same sheet opens here as next to the fields.
 */
export default function HelpPage() {
  const t = useCopy();
  const [open, setOpen] = useState<HelpTopic | null>(null);

  return (
    <AppShell>
      <div className="mx-auto max-w-[720px]">
        <PageHeader title={t("איך מוצאים דברים")} subtitle={t("הסברים קצרים, צעד אחר צעד.")} />
        <Link href="/support" className="drawn-button mb-7 inline-flex min-h-11 items-center justify-center px-5"><Copy text="לדווח על בעיה או לשאול שאלה" /></Link>

        <section id="campaign-results" className="mb-10 scroll-mt-28" aria-labelledby="campaign-results-title">
          <h2 id="campaign-results-title" className="text-xl font-semibold"><Copy text="איך יודעים אם הקמפיין עובד?" /></h2>
          <p className="mt-3 leading-7"><Copy text="מתחילים במטרה של החודש. לכל פוסט יש תפקיד, ובודקים אם התוצאות שלו מקדמות אותה." /></p>
          <dl className="mt-5 divide-y divide-[var(--rule)]">
            <div className="py-4"><dt className="font-semibold"><Copy text="ראו, לחצו או קנו?" /></dt><dd className="mt-1 leading-7"><Copy text="חשיפה אומרת כמה אנשים ראו. לחיצות מראות שהמסר עורר עניין. הזמנה, פנייה או תרומה בודקים בנפרד — לחיצה לבדה אינה מכירה." /></dd></div>
            <div className="py-4"><dt className="font-semibold"><Copy text="יש עניין, אבל אין פניות?" /></dt><dd className="mt-1 leading-7"><Copy text="בדקו לאן הקישור מוביל: האם ברור מה מציעים ואיך ממשיכים? לפני שמחליפים את כל התוכן, נסו שינוי אחד שאפשר לבדוק, כמו הצגת המחיר או קישור ישיר להזמנה." /></dd></div>
            <div className="py-4"><dt className="font-semibold"><Copy text="עדיין אין נתונים?" /></dt><dd className="mt-1 leading-7"><Copy text="ודאו שהפוסט פורסם ושהחשבון הנכון מחובר. במסך התוצאות אפשר לראות מאיפה מגיע כל נתון ולעדכן תוצאות שקיבלתם בעצמכם." /></dd></div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            <Link className="inline-flex min-h-11 items-center text-[var(--primary)] underline underline-offset-4" href="/performance"><Copy text="לבדוק את התוצאות" /></Link>
            <Link className="inline-flex min-h-11 items-center text-[var(--primary)] underline underline-offset-4" href="/integrations"><Copy text="לבדוק את החיבורים" /></Link>
            <Link className="inline-flex min-h-11 items-center text-[var(--primary)] underline underline-offset-4" href="/campaign"><Copy text="לחזור לקמפיין" /></Link>
          </div>
        </section>

        {/* A label and whitespace per group, a card with hairlines per list: no boxes inside boxes. */}
        <div className="space-y-8">
          {HELP_GROUPS.map((group, index) => (
            <section key={group.title} aria-labelledby={`help-group-${index}`}>
              <h2 id={`help-group-${index}`} className={GROUP_LABEL}>
                {group.title}
              </h2>
              <ul className={`${CARD} divide-y divide-[var(--rule)] overflow-hidden`}>
                {group.topics.map((topic) => (
                  <li key={topic}>
                    <button type="button" aria-haspopup="dialog" onClick={() => setOpen(topic)} className={`group ${LIST_ROW} cursor-pointer`}>
                      <span className="min-w-0 flex-1 text-[15px] font-semibold leading-6 text-[color:var(--ink)]">
                        {GUIDES[topic].title}
                      </span>
                      <IconChevron navigation className={ROW_CHEVRON} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <ContactLink className="mt-10 text-center" />
      </div>

      {open ? <GuideSheet topic={open} open onClose={() => setOpen(null)} /> : null}
    </AppShell>
  );
}
