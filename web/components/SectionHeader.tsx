import type { SectionKey } from "@/lib/sections";
import { SECTIONS } from "@/lib/sections";

/**
 * The header every core page wears.
 *
 * One title per page. The section label from `SECTIONS` shows above it only when it
 * adds context (a sub-page of a section), never when it repeats the title.
 */
export function SectionHeader({
  section,
  title,
  subtitle,
  action,
  level = 1,
  eyebrow: eyebrowOverride,
}: {
  section: SectionKey;
  level?: 1 | 2;
  title: string;
  /** `null` hides the section label; a string replaces it. */
  eyebrow?: string | null;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  const identity = SECTIONS[section];
  const Heading = level === 1 ? "h1" : "h2";
  // The section label adds context only when it is not the title itself
  // (DESIGN-STANDARD.md §2: one title, no eyebrow that repeats it).
  const label = eyebrowOverride === undefined ? identity.eyebrow : eyebrowOverride;
  const eyebrow = label && label.trim() !== title.trim() ? label : null;
  return (
    <header className="mb-8">
      {eyebrow ? <p className="mb-2 text-[13px] font-semibold text-[var(--ink-muted)]">{eyebrow}</p> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Heading className={level === 1 ? "text-[28px] font-bold leading-tight tracking-tight text-[var(--ink)] sm:text-[32px]" : "text-[20px] font-bold leading-tight tracking-tight text-[var(--ink)]"}>{title}</Heading>
          {subtitle ? (
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--ink-soft)]">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
    </header>
  );
}
