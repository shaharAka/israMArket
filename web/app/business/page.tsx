"use client";

import Link from "next/link";
import { useCopy } from "@/components/language/LanguageProvider";
import { WhatsNewLink } from "@/components/language/WhatsNewLink";
import { useEffect, useState } from "react";
import { AppShell, PageHeader, useLogOut } from "@/components/AppShell";
import { CARD, GROUP_LABEL, LIST_ROW, ROW_CHEVRON, ROW_ICON } from "@/components/account/setupStyles";
import { IconCamera } from "@/components/instagram/SourceLink";
import { BrandLink } from "@/components/BrandLink";
import { endpoints } from "@/lib/api";
import {
  IconCalendar,
  IconChevron,
  IconCompass,
  IconFlag,
  IconLightbulb,
  IconLink,
  IconLogout,
  IconMegaphone,
  IconPhotos,
  IconRoute,
  IconUser,
} from "@/lib/icons";

type Row = {
  href: string;
  title: string;
  /** Six words at most: it is a hint, not a description. */
  hint: string;
  icon: (props: { className?: string }) => React.ReactElement;
};

/**
 * Everything that is not a daily task. The four tabs cover the owner's day (today, posts,
 * results); this is the drawer for the rest — the plans, the photos, Google, and the
 * settings — so none of it has to compete for a place in the bottom bar.
 */
const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "התכנון",
    rows: [
      { href: "/strategy", title: "התוכנית", hint: "האסטרטגיה והצעדים הקרובים", icon: IconRoute },
      { href: "/calendar", title: "לוח התוכנית", hint: "פוסטים, משימות ותאריכים חשובים", icon: IconCalendar },
      { href: "/recommendations", title: "המלצות לשבוע", hint: "מה כדאי לעשות השבוע", icon: IconLightbulb },
    ],
  },
  {
    title: "התמונות והקידום",
    rows: [
      { href: "/assets", title: "התמונות שלי", hint: "התמונות והסרטונים של העסק", icon: IconPhotos },
      { href: "/instagram", title: "מה מצליח באינסטגרם", hint: "מה הצליח לכם שם", icon: IconCamera },
      { href: "/promotion", title: "קידום בגוגל", hint: "כמה עולה להופיע בחיפוש", icon: IconMegaphone },
    ],
  },
  {
    title: "ההגדרות",
    rows: [
      { href: "/prepare?stage=write", title: "שפת הפוסטים", hint: "שפה קבועה וניסויים לקהל שלכם", icon: IconMegaphone },
      { href: "/decisions", title: "ההחלטות שלי", hint: "תקציב, יעדים ועדיפויות", icon: IconFlag },
      { href: "/integrations", title: "חיבורים", hint: "אינסטגרם, פייסבוק ונתוני האתר", icon: IconLink },
      { href: "/account", title: "החשבון", hint: "שינוי הסיסמה", icon: IconUser },
      { href: "/help", title: "איך מוצאים דברים", hint: "הסברים קצרים, צעד אחר צעד", icon: IconCompass },
      { href: "/updates", title: "מה חדש", hint: "עדכונים ושיפורים במערכת", icon: IconLightbulb },
    ],
  },
];

export default function BusinessPage() {
  const t = useCopy();
  const [businessName, setBusinessName] = useState("");
  const logOut = useLogOut();

  useEffect(() => {
    endpoints
      .business()
      .then((res) => setBusinessName(res.business?.name ?? ""))
      .catch(() => undefined);
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-[720px]">
        {/* The business's name is the title; its brand sits beside it, as a way in. */}
        <PageHeader
          title={businessName || "העסק שלי"}
          action={
            <BrandLink className="-mx-1 font-semibold !text-[color:var(--ink)] hover:!bg-[var(--paper)] hover:shadow-[var(--shadow-card)]" />
          }
        />

        {/* A label and whitespace per group, one card per group, hairlines between rows. */}
        <div className="space-y-8">
          {GROUPS.map((group, index) => (
            <section key={t(group.title)} aria-labelledby={`business-group-${index}`}>
              <h2 id={`business-group-${index}`} className={GROUP_LABEL}>
                {t(group.title)}
              </h2>
              <ul className={`${CARD} divide-y divide-[var(--rule)] overflow-hidden`}>
                {group.rows.map((row) => {
                  const content = <>
                      <span aria-hidden className={ROW_ICON}>
                        <row.icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold leading-6 text-[color:var(--ink)]">{t(row.title)}</span>
                        <span className="block text-[13px] leading-5 text-[color:var(--ink-soft)]">{t(row.hint)}</span>
                      </span>
                      <IconChevron navigation className={ROW_CHEVRON} />
                    </>;
                  return <li key={row.href}>{row.href === "/updates"
                    ? <WhatsNewLink className={`group ${LIST_ROW}`}>{content}</WhatsNewLink>
                    : <Link href={row.href} className={`group ${LIST_ROW}`}>{content}</Link>}
                  </li>;
                })}
              </ul>
            </section>
          ))}

          <div className={`${CARD} overflow-hidden`}>
            <button type="button" onClick={logOut} className={`group ${LIST_ROW} cursor-pointer`}>
              <span aria-hidden className={ROW_ICON}>
                <IconLogout className="h-5 w-5" />
              </span>
              <span className="flex-1 text-[15px] font-semibold text-[color:var(--ink-soft)] transition-colors group-hover:text-[color:var(--ink)]">
                יציאה מהחשבון
              </span>
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
