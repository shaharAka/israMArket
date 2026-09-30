import type { InspirationBrief, InspirationPattern } from "@/lib/api";
import { IconChevron } from "@/lib/icons";
import { SourceLink } from "./SourceLink";

/** Enough to read in one pass. The rest waits one tap down, never dropped. */
const VISIBLE = 4;

/**
 * Strong patterns first, weak after, keeping the model's order inside each group.
 * A weak one is still worth trying — it just rests on one post, or on someone else's
 * likes — so it stays on the list, visibly quieter.
 */
function ordered(patterns: InspirationPattern[]) {
  return [
    ...patterns.filter((item) => item.strength === "strong"),
    ...patterns.filter((item) => item.strength !== "strong"),
  ];
}

/** Down when closed, up when open; an icon, so a closed fold adds no word to the page. */
function Chevron({ open }: { open: string }) {
  return (
    <IconChevron
      className={`h-4 w-4 shrink-0 -rotate-90 text-[color:var(--ink-muted)] transition-transform duration-200 ease-[cubic-bezier(.2,.7,.2,1)] ${open}`}
    />
  );
}

function PatternRow({ item }: { item: InspirationPattern }) {
  const strong = item.strength === "strong";
  return (
    <li className="flex items-start gap-3 py-4">
      <span
        aria-hidden
        className={`mt-[9px] h-2 w-2 shrink-0 rounded-full ${
          strong ? "bg-[var(--good)]" : "border-[1.5px] border-[var(--ink-faint)] bg-transparent"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className={`text-[15px] leading-7 ${strong ? "font-semibold text-[color:var(--ink)]" : "text-[color:var(--ink-soft)]"}`}>
          {item.pattern}
          {strong ? null : (
            <span
              title="יש על זה מעט נתונים. שווה לנסות ולראות."
              className="ms-2 inline-block rounded-full bg-[var(--soft)] px-2.5 align-middle text-xs font-medium leading-6 text-[color:var(--ink-muted)]"
            >
              לבדיקה
            </span>
          )}
        </p>
        <p className="mt-0.5 text-[13px] leading-6 text-[color:var(--ink-muted)]">
          לפי:{" "}
          {item.sources.map((source, index) => (
            <span key={source.ref}>
              {index > 0 ? ", " : null}
              <SourceLink source={source} withMetric={false} short />
            </span>
          ))}
        </p>
      </div>
    </li>
  );
}

/** "What we learned": the brief's summary, its patterns with their sources, its caveats. */
export function LearnedList({ brief }: { brief: InspirationBrief }) {
  const patterns = ordered(brief.patterns);
  const shown = patterns.slice(0, VISIBLE);
  const more = patterns.slice(VISIBLE);

  return (
    <div>
      {brief.summary ? (
        <p className="mt-2 max-w-[40em] text-[15px] leading-7 text-[color:var(--ink-soft)]">{brief.summary}</p>
      ) : null}

      {patterns.length ? (
        <ul className="paper mt-4 divide-y divide-[var(--rule)] px-5 sm:px-6">
          {shown.map((item, index) => (
            <PatternRow key={`${item.pattern}-${index}`} item={item} />
          ))}
          {more.length ? (
            <li>
              <details className="group/more">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-[color:var(--ink-soft)] transition-colors hover:text-[color:var(--ink)] [&::-webkit-details-marker]:hidden">
                  {more.length === 1 ? "עוד דבר אחד" : `עוד ${more.length} דברים`}
                  <Chevron open="group-open/more:rotate-90" />
                </summary>
                <ul className="divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
                  {more.map((item, index) => (
                    <PatternRow key={`${item.pattern}-more-${index}`} item={item} />
                  ))}
                </ul>
              </details>
            </li>
          ) : null}
        </ul>
      ) : null}

      {/* The honesty stays in view: what these numbers cannot tell us. */}
      {brief.caveats.length ? (
        <p className="mt-3 max-w-[46em] text-[13px] leading-6 text-[color:var(--ink-muted)]">{brief.caveats.join(" ")}</p>
      ) : null}

      {patterns.some((item) => item.evidence) ? (
        <details className="group/how mt-1">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[13px] font-semibold text-[color:var(--ink-soft)] transition-colors hover:text-[color:var(--ink)] [&::-webkit-details-marker]:hidden">
            איך הגענו לזה
            <Chevron open="group-open/how:rotate-90" />
          </summary>
          <ul className="mt-1 max-w-[46em] space-y-2 pb-2 text-[13px] leading-6 text-[color:var(--ink-soft)]">
            {patterns
              .filter((item) => item.evidence)
              .map((item, index) => (
                <li key={`${item.pattern}-evidence-${index}`}>
                  <span className="font-semibold text-[color:var(--ink)]">{item.pattern}:</span> {item.evidence}
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
