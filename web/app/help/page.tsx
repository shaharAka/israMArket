"use client";

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
  const [open, setOpen] = useState<HelpTopic | null>(null);

  return (
    <AppShell>
      <div className="mx-auto max-w-[720px]">
        <PageHeader title="איך מוצאים דברים" subtitle="הסברים קצרים, צעד אחר צעד." />
        <Link href="/support" className="drawn-button mb-7 inline-flex min-h-11 items-center justify-center px-5">לדווח על בעיה או לשאול שאלה</Link>

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
                      <IconChevron className={ROW_CHEVRON} />
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
