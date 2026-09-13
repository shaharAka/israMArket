import type { SectionKey } from "@/lib/sections";
import { SECTIONS } from "@/lib/sections";

/**
 * The header every core page wears.
 *
 * Replaces the old shared `eyebrow → h1 → subtitle` heading, which was identical on
 * every route and made navigation feel inert. The accent rail and section eyebrow come
 * from `SECTIONS`, so a page announces where you are before you read the title.
 */
export function SectionHeader({
  section,
  title,
  subtitle,
  action,
}: {
  section: SectionKey;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  const identity = SECTIONS[section];
  return (
    <header className="mb-7">
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: identity.accent }} />
        <p className="text-[11px] font-black tracking-wide" style={{ color: identity.accent }}>
          {identity.eyebrow}
        </p>
      </div>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-black tracking-tight text-[#1e201d]">{title}</h1>
          {subtitle ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#63665e]">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      <div
        aria-hidden
        className="mt-5 h-px w-full"
        style={{ background: `linear-gradient(to left, ${identity.border}, transparent)` }}
      />
    </header>
  );
}
