"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { GuideSheet } from "@/components/help/HowToFind";
import { GUIDES, HELP_GROUPS, type HelpTopic } from "@/components/help/guides";
import { SectionHeader } from "@/components/SectionHeader";
import { ContactLink } from "@/components/trial/StepLink";
import { IconChevron } from "@/lib/icons";

const rowClass =
  "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-right transition-colors hover:bg-[var(--canvas)] active:bg-[var(--canvas)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ink)]";

/**
 * Every "how do I find this?" guide in one list, so an owner can browse them without first
 * landing on the page that needs one. The same sheet opens here as next to the fields.
 */
export default function HelpPage() {
  const [open, setOpen] = useState<HelpTopic | null>(null);

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <SectionHeader section="business" title="איך מוצאים דברים" subtitle="הסברים קצרים, צעד אחר צעד." />

        <div className="overflow-hidden rounded-lg border border-[var(--rule)] bg-white">
          {HELP_GROUPS.map((group, index) => (
            <section key={group.title} className={index > 0 ? "border-t border-[var(--rule)]" : undefined}>
              <h2 className="px-4 pt-4 pb-1 text-xs font-black text-[var(--ink-soft)]">{group.title}</h2>
              <ul className="divide-y divide-[var(--rule)]">
                {group.topics.map((topic) => (
                  <li key={topic}>
                    <button type="button" aria-haspopup="dialog" onClick={() => setOpen(topic)} className={rowClass}>
                      <span className="min-w-0 flex-1 text-[15px] font-bold text-[var(--ink)]">{GUIDES[topic].title}</span>
                      <IconChevron className="h-5 w-5 shrink-0 text-[var(--ink-muted)]" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <ContactLink className="mt-5 text-center" />
      </div>

      {open ? <GuideSheet topic={open} open onClose={() => setOpen(null)} /> : null}
    </AppShell>
  );
}
