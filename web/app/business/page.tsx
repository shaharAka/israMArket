"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell, useLogOut } from "@/components/AppShell";
import { IconCamera } from "@/components/instagram/SourceLink";
import { SectionHeader } from "@/components/SectionHeader";
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
      { href: "/strategy", title: "התוכנית", hint: "החודש שבוע אחר שבוע, והרבעון", icon: IconRoute },
      { href: "/calendar", title: "לוח שנה", hint: "חגים, ימי קניות ופוסטים", icon: IconCalendar },
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
      { href: "/decisions", title: "ההחלטות שלי", hint: "תקציב, יעדים ועדיפויות", icon: IconFlag },
      { href: "/integrations", title: "חיבורים", hint: "אינסטגרם, פייסבוק ונתוני האתר", icon: IconLink },
      { href: "/account", title: "החשבון", hint: "שינוי הסיסמה", icon: IconUser },
      { href: "/help", title: "איך מוצאים דברים", hint: "הסברים קצרים, צעד אחר צעד", icon: IconCompass },
    ],
  },
];

const rowClass =
  "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-right transition-colors hover:bg-[#fbfcff] active:bg-[#edf2ff] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#1d2940]";

export default function BusinessPage() {
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
      <div className="mx-auto max-w-2xl">
        <SectionHeader section="business" title={businessName || "העסק שלי"} />

        {/* One container, hairlines between rows: a list, not a grid of boxes. */}
        <div className="overflow-hidden rounded-lg border border-[#e1e7f2] bg-white">
          {GROUPS.map((group, index) => (
            <section key={group.title} className={index > 0 ? "border-t border-[#e1e7f2]" : undefined}>
              <h2 className="px-4 pt-4 pb-1 text-xs font-black text-[#535f75]">{group.title}</h2>
              <ul className="divide-y divide-[#edf2ff]">
                {group.rows.map((row) => (
                  <li key={row.href}>
                    <Link href={row.href} className={rowClass}>
                      <row.icon className="h-5 w-5 shrink-0 text-[#535f75]" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold text-[#1d2940]">{row.title}</span>
                        <span className="mt-0.5 block text-sm text-[#535f75]">{row.hint}</span>
                      </span>
                      <IconChevron className="h-5 w-5 shrink-0 text-[#647087]" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <div className="border-t border-[#e1e7f2]">
            <button type="button" onClick={logOut} className={`${rowClass} cursor-pointer`}>
              <IconLogout className="h-5 w-5 shrink-0 text-[#535f75]" />
              <span className="flex-1 text-[15px] font-bold text-[#1d2940]">יציאה מהחשבון</span>
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
