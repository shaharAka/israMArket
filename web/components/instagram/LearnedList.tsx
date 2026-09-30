import type { InspirationBrief, InspirationPattern } from "@/lib/api";
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

function PatternRow({ item }: { item: InspirationPattern }) {
  const strong = item.strength === "strong";
  return (
    <li className="flex items-start gap-3 py-3">
      <span
        aria-hidden
        className={`mt-2 h-2 w-2 shrink-0 rounded-full ${
          strong ? "bg-[#374b3d]" : "border border-[#a9a79e] bg-transparent"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className={`text-[15px] leading-6 ${strong ? "font-bold text-[#20211f]" : "text-[#4a4c47]"}`}>
          {item.pattern}
          {strong ? null : (
            <span
              title="יש על זה מעט נתונים. שווה לנסות ולראות."
              className="mr-2 inline-block rounded-full bg-[#f4f3ee] px-2 align-middle text-[11px] font-bold leading-5 text-[#6b6c66]"
            >
              לבדיקה
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-[#6b6c66]">
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
      {brief.summary ? <p className="mt-2 text-sm leading-6 text-[#3c3e3a]">{brief.summary}</p> : null}

      {patterns.length ? (
        <ul className="mt-3 divide-y divide-[#eeede8] rounded-lg border border-[#e6e4dc] bg-white px-4">
          {shown.map((item, index) => (
            <PatternRow key={`${item.pattern}-${index}`} item={item} />
          ))}
          {more.length ? (
            <li>
              <details className="group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 py-2 text-sm font-bold text-[#3c3e3a]">
                  {more.length === 1 ? "עוד דבר אחד" : `עוד ${more.length} דברים`}
                  <span aria-hidden className="text-[#8b8e84] transition-transform group-open:-rotate-90">
                    ‹
                  </span>
                </summary>
                <ul className="divide-y divide-[#eeede8] border-t border-[#eeede8]">
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
        <p className="mt-2 text-xs leading-5 text-[#6b6c66]">{brief.caveats.join(" ")}</p>
      ) : null}

      {patterns.some((item) => item.evidence) ? (
        <details className="group mt-1">
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 text-xs font-bold text-[#5e6159]">
            איך הגענו לזה
            <span aria-hidden className="transition-transform group-open:-rotate-90">
              ‹
            </span>
          </summary>
          <ul className="mt-1 space-y-2 text-xs leading-5 text-[#4a4c47]">
            {patterns
              .filter((item) => item.evidence)
              .map((item, index) => (
                <li key={`${item.pattern}-evidence-${index}`}>
                  <span className="font-bold text-[#20211f]">{item.pattern}:</span> {item.evidence}
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
